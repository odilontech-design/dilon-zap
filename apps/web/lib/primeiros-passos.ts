import { prisma } from "@dilon-zap/db";
import { recursosDoTenant } from "@/lib/plano";
import { STATUS_NO_PATIO } from "@/lib/veiculos-regras";
import { telefonesDaLoja } from "@/lib/dados-da-loja";

/**
 * "Primeiros passos" da revenda: o checklist de implantação do Dilon Motors. Não guarda nada:
 * cada passo é calculado na hora a partir dos dados da própria loja (estoque, WhatsApp, equipe,
 * site, portais, IA), então nunca fica desatualizado nem exige que alguém marque à mão.
 *
 * Serve a dois públicos com os mesmos números: a gestão da loja (para ela mesma andar na
 * implantação) e a Dilon Tech (Super Admin, para acompanhar cada loja nova). Os textos
 * "porQue" e "comoFazer" também são o material de capacitação de quem implanta.
 */

export type EstadoDoPasso = "feito" | "parcial" | "pendente";

export type Passo = {
  id: string;
  titulo: string;
  estado: EstadoDoPasso;
  /** O que o sistema viu (ex.: "47 carros no pátio"). */
  detalhe: string;
  /** Para onde o botão "Resolver" leva. */
  href: string;
  /** Opcional não conta para a porcentagem (o portal e a IA dependem do que a loja contratou). */
  obrigatorio: boolean;
  porQue: string;
  comoFazer: string;
};

export type PrimeirosPassos = {
  passos: Passo[];
  feitos: number;
  total: number;
  percentual: number;
  concluido: boolean;
  /** Números que o Super Admin usa para acompanhar a loja. */
  resumo: {
    diasDesdeAEntrada: number;
    noPatio: number;
    semKm: number;
    semFoto: number;
    semPreco: number;
    portaisConectados: string[];
    anunciosNoAr: number;
    usouOInbox: boolean;
  };
};

const NOME_PORTAL: Record<string, string> = { OLX: "OLX", WEBMOTORS: "Webmotors", MOBIAUTO: "MobiAuto", NAPISTA: "NaPista" };
const DIA = 86_400_000;
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

export async function primeirosPassosDaRevenda(tenantId: string, agora = new Date()): Promise<PrimeirosPassos | null> {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { createdAt: true } });
  if (!tenant) return null;
  const recursos = await recursosDoTenant(tenantId);
  if (!recursos.has("VEICULOS")) return null;

  const desde = new Date(agora.getTime() - 14 * DIA);
  const [cfg, ia, carros, sessoes, equipe, contas, anunciosNoAr, mensagensDaEquipe] = await Promise.all([
    prisma.veiculosConfig.findUnique({ where: { tenantId }, select: { endereco: true, telefones: true, whatsapp: true, vitrineAtiva: true, dominio: true } }),
    prisma.vendedorIaConfig.findUnique({ where: { tenantId }, select: { ativo: true } }),
    prisma.veiculo.findMany({
      where: { tenantId, status: { in: STATUS_NO_PATIO } },
      select: { precoCents: true, kmInformado: true, _count: { select: { fotos: true } } },
    }),
    prisma.whatsAppSession.count({ where: { tenantId, status: "CONNECTED" } }),
    prisma.user.count({ where: { tenantId, deactivatedAt: null, role: { not: "SUPERADMIN" } } }),
    prisma.portalConta.findMany({ where: { tenantId, status: "CONECTADA" }, select: { portal: true } }),
    prisma.publicacaoPortal.count({ where: { tenantId, ativo: true, status: "PUBLICADO" } }),
    prisma.message.count({ where: { direction: "OUTBOUND", senderUserId: { not: null }, createdAt: { gte: desde }, sender: { tenantId } } }),
  ]);

  const noPatio = carros.length;
  const semKm = carros.filter((c) => !c.kmInformado).length;
  const semFoto = carros.filter((c) => c._count.fotos === 0).length;
  const semPreco = carros.filter((c) => c.precoCents <= 0).length;
  const prontos = carros.filter((c) => c.kmInformado && c.precoCents > 0 && c._count.fotos > 0).length;
  const portais = contas.map((c) => NOME_PORTAL[c.portal] ?? c.portal);
  const telefones = telefonesDaLoja(cfg?.telefones).length;

  const passos: Passo[] = [
    {
      id: "dados",
      titulo: "Dados da loja",
      estado: cfg?.endereco && (telefones > 0 || cfg?.whatsapp) ? "feito" : cfg?.endereco || telefones > 0 ? "parcial" : "pendente",
      detalhe: cfg?.endereco ? `${cfg.endereco}${telefones ? ` · ${plural(telefones, "telefone", "telefones")}` : ""}` : "Endereço e telefones ainda não preenchidos",
      href: "/veiculos/site?aba=dados",
      obrigatorio: true,
      porQue: "Endereço, telefones e horário aparecem no topo e no rodapé do site, no Google e nos anúncios dos portais (o CEP e o 1º telefone vão em todo anúncio).",
      comoFazer: "Meu site > Dados da loja: digite o CEP (a rua e a cidade se preenchem sozinhas), até 3 telefones e o horário.",
    },
    {
      id: "estoque",
      titulo: "Estoque no sistema",
      estado: noPatio > 0 ? "feito" : "pendente",
      detalhe: noPatio > 0 ? plural(noPatio, "carro no pátio", "carros no pátio") : "Nenhum carro cadastrado",
      href: "/veiculos/importar",
      obrigatorio: true,
      porQue: "É a base de tudo: o site, os portais, o Vendedor IA e os relatórios leem o estoque. Quanto antes ele entrar, mais cedo a equipe vê valor.",
      comoFazer: "Veículos > Importar: traga o estoque do site atual da loja (pelo endereço) ou de uma planilha. As fotos vêm junto. Não precisa cadastrar carro por carro.",
    },
    {
      id: "fichas",
      titulo: "Carros prontos para anunciar",
      estado: noPatio === 0 ? "pendente" : prontos === noPatio ? "feito" : prontos > 0 ? "parcial" : "pendente",
      detalhe:
        noPatio === 0
          ? "Importe o estoque primeiro"
          : prontos === noPatio
            ? "Todos com preço, km e foto"
            : `${prontos} de ${noPatio} prontos · faltam: ${[semKm ? `km em ${semKm}` : "", semPreco ? `preço em ${semPreco}` : "", semFoto ? `foto em ${semFoto}` : ""].filter(Boolean).join(", ")}`,
      href: "/veiculos/completar",
      obrigatorio: true,
      porQue: "Carro sem km, preço ou foto não é publicado nos portais (regra do sistema) e vende mal no site. É o passo que mais atrasa a virada do sistema antigo.",
      comoFazer: "Veículos > Completar: preencha km e preço direto na lista, ou suba a planilha do sistema antigo. Em seguida, envie as fotos que faltam.",
    },
    {
      id: "whatsapp",
      titulo: "WhatsApp da loja conectado",
      estado: sessoes > 0 ? "feito" : "pendente",
      detalhe: sessoes > 0 ? "Número conectado" : "Nenhum número conectado",
      href: "/connect",
      obrigatorio: true,
      porQue: "Com o WhatsApp da loja no sistema, a equipe inteira atende no mesmo número, o cliente fica com a loja (não com o vendedor) e o dono vê as conversas.",
      comoFazer: "Conectar número: leia o QR Code com o celular da loja, como no WhatsApp Web. Leva alguns minutos.",
    },
    {
      id: "equipe",
      titulo: "Equipe com login",
      estado: equipe >= 2 ? "feito" : "pendente",
      detalhe: equipe >= 2 ? plural(equipe, "pessoa com acesso", "pessoas com acesso") : "Só o dono tem acesso",
      href: "/usuarios",
      obrigatorio: true,
      porQue: "Cada vendedor com login próprio: dá para saber quem atendeu, e quem sai da loja não leva as conversas junto.",
      comoFazer: "Usuários: crie um login por vendedor. O vendedor não vê custo, margem nem o menor preço aceito.",
    },
    {
      id: "site",
      titulo: "Site da loja no ar",
      estado: cfg?.vitrineAtiva ? "feito" : "pendente",
      detalhe: cfg?.vitrineAtiva ? (cfg.dominio ? `No ar em ${cfg.dominio}` : "No ar no endereço do Zap (domínio próprio ainda não configurado)") : "Site desligado",
      href: "/veiculos/site",
      obrigatorio: true,
      porQue: "O site traz o estoque para o Google com preço e foto, e o botão \"Tenho interesse\" abre o WhatsApp da loja com o carro já na mensagem.",
      comoFazer: "Meu site: ligue a vitrine em Aparência e domínio, escolha as cores, e use \"Trazer do site atual\" para copiar banners e o texto Quem somos. O domínio próprio só deve ser apontado quando tudo estiver pronto.",
    },
    {
      id: "uso",
      titulo: "Equipe atendendo pelo sistema",
      estado: mensagensDaEquipe >= 5 ? "feito" : mensagensDaEquipe > 0 ? "parcial" : "pendente",
      detalhe: mensagensDaEquipe > 0 ? `${plural(mensagensDaEquipe, "mensagem enviada", "mensagens enviadas")} pela equipe nos últimos 14 dias` : "Nenhuma mensagem enviada pelo Inbox nos últimos 14 dias",
      href: "/inbox",
      obrigatorio: true,
      porQue: "É o sinal de que a implantação pegou: se a equipe atende pelo Inbox, a loja entrou no sistema de verdade. Se não, o motivo precisa ser resolvido nos primeiros dias.",
      comoFazer: "Treine a equipe por 30 minutos no Inbox: assumir a conversa, enviar a ficha e as fotos do carro em um clique e abrir a negociação.",
    },
    {
      id: "portais",
      titulo: "Portais conectados",
      estado: portais.length === 0 ? "pendente" : anunciosNoAr > 0 ? "feito" : "parcial",
      detalhe: portais.length === 0 ? "Nenhum portal conectado" : `${portais.join(", ")} · ${plural(anunciosNoAr, "anúncio no ar", "anúncios no ar")}`,
      href: "/veiculos/portais",
      obrigatorio: false,
      porQue: "O estoque vai sozinho para Webmotors, MobiAuto, NaPista e OLX, com preço e fotos atualizados. Vendeu ou reservou, o anúncio sai do ar.",
      comoFazer: "Veículos > Portais. Peça as liberações no dia 0, todas de uma vez, porque cada portal leva dias para responder. Só desligue o sistema antigo quando todos os portais da loja estiverem cobertos.",
    },
  ];

  if (recursos.has("VENDEDOR_IA")) {
    passos.push({
      id: "ia",
      titulo: "Vendedor IA",
      estado: ia?.ativo ? "feito" : "pendente",
      detalhe: ia?.ativo ? "Ligado" : "Contratado, ainda desligado",
      href: "/veiculos/vendedor-ia",
      obrigatorio: false,
      porQue: "Atende o primeiro contato a qualquer hora com o estoque real e passa para o vendedor quando o cliente quer negociar.",
      comoFazer: "Veículos > Vendedor IA: escreva o que a IA precisa saber da loja (endereço, horário, trocas, pagamento) e ligue. Leia as primeiras conversas na semana seguinte.",
    });
  }

  const obrigatorios = passos.filter((p) => p.obrigatorio);
  const feitos = obrigatorios.filter((p) => p.estado === "feito").length;
  return {
    passos,
    feitos,
    total: obrigatorios.length,
    percentual: Math.round((feitos / obrigatorios.length) * 100),
    concluido: feitos === obrigatorios.length,
    resumo: {
      diasDesdeAEntrada: Math.max(0, Math.floor((agora.getTime() - tenant.createdAt.getTime()) / DIA)),
      noPatio,
      semKm,
      semFoto,
      semPreco,
      portaisConectados: portais,
      anunciosNoAr,
      usouOInbox: mensagensDaEquipe > 0,
    },
  };
}
