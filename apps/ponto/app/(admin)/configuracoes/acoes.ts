"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { identificacaoEmpresaRep, inicializarRep, prisma, registrarOperacaoRep } from "@dilon-zap/ponto-db";
import { cpfDoResponsavel } from "@/lib/rep";
import { cpfValido, soDigitos } from "@/lib/documentos";
import { feriadosNacionais } from "@dilon-zap/ponto-core";
import { acaoDeAdmin, ErroDeAcao, type Resultado } from "@/lib/acoes";
import { auditar } from "@/lib/auditoria";

const FUSOS = [
  "America/Sao_Paulo",
  "America/Bahia",
  "America/Fortaleza",
  "America/Recife",
  "America/Belem",
  "America/Manaus",
  "America/Cuiaba",
  "America/Campo_Grande",
  "America/Porto_Velho",
  "America/Boa_Vista",
  "America/Rio_Branco",
  "America/Noronha",
] as const;

const schema = z.object({
  razaoSocial: z.string().trim().min(3, "Informe a razão social"),
  nomeFantasia: z.string().trim().max(80).optional(),
  timezone: z.enum(FUSOS),
  exigirLocalizacao: z.boolean(),
  toleranciaPorMarcacaoMin: z.number().int().min(0).max(10, "Tolerância por marcação: até 10 minutos"),
  toleranciaDiariaMin: z.number().int().min(0).max(20, "Tolerância diária: até 20 minutos"),
  percentualExtraBp: z.number().int().min(5000, "Hora extra: no mínimo 50% (CF, art. 7º, XVI)").max(30000),
  percentualDescansoBp: z.number().int().min(5000).max(30000),
  percentualNoturnoBp: z.number().int().min(2000, "Adicional noturno urbano: no mínimo 20% (CLT, art. 73)").max(10000),
  bancoDeHoras: z.boolean(),
  validadeBancoDias: z.number().int().min(1).max(366, "Banco de horas: validade de até 1 ano"),
});

export async function salvarConfiguracoes(entrada: z.input<typeof schema>): Promise<Resultado> {
  return acaoDeAdmin(async (u) => {
    const p = schema.parse(entrada);
    const atual = await prisma.empresa.findUniqueOrThrow({ where: { id: u.empresaId } });
    await prisma.$transaction(async (tx) => {
      const empresa = await tx.empresa.update({ where: { id: u.empresaId }, data: { ...p, nomeFantasia: p.nomeFantasia || null } });
      // Razão social faz parte da identificação da empresa no REP: mudou, registra (tipo 2).
      if (empresa.razaoSocial !== atual.razaoSocial) {
        await registrarOperacaoRep(tx, u.empresaId, identificacaoEmpresaRep(empresa, cpfDoResponsavel(u)));
      }
    });
    await auditar(u, "configuracoes", "Empresa", u.empresaId, p);
    revalidatePath("/", "layout");
  });
}

export async function adicionarFeriado(data: string, nome: string): Promise<Resultado> {
  return acaoDeAdmin(async (u) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) throw new ErroDeAcao("Informe a data.");
    if (nome.trim().length < 3) throw new ErroDeAcao("Informe o nome do feriado.");
    await prisma.feriado.create({ data: { empresaId: u.empresaId, data: new Date(`${data}T00:00:00Z`), nome: nome.trim() } });
    await auditar(u, "adicionar_feriado", "Feriado", null, { data, nome });
    revalidatePath("/configuracoes");
  });
}

export async function removerFeriado(id: string): Promise<Resultado> {
  return acaoDeAdmin(async (u) => {
    const f = await prisma.feriado.findFirst({ where: { id, empresaId: u.empresaId } });
    if (!f) throw new ErroDeAcao("Feriado não encontrado.");
    await prisma.feriado.delete({ where: { id } });
    await auditar(u, "remover_feriado", "Feriado", id, { data: f.data.toISOString().slice(0, 10), nome: f.nome });
    revalidatePath("/configuracoes");
  });
}

export async function carregarFeriadosNacionais(ano: number): Promise<Resultado> {
  return acaoDeAdmin(async (u) => {
    await prisma.feriado.createMany({
      data: feriadosNacionais(ano).map((f) => ({ empresaId: u.empresaId, data: new Date(`${f.data}T00:00:00Z`), nome: f.nome })),
      skipDuplicates: true,
    });
    revalidatePath("/configuracoes");
  });
}

const schemaRep = z.object({
  cpf: z.string(),
  endereco: z.string().trim().min(5, "Informe o endereço do estabelecimento").max(100, "Até 100 caracteres (limite do arquivo AFD)"),
  cnoOuCaepf: z.string().optional(),
});

/**
 * Identificação no registro de ponto (Portaria 671, Anexo IX, item 6.1): CPF
 * do responsável, endereço do estabelecimento e CNO/CAEPF. Na primeira vez,
 * registra a empresa (tipo 2) e os colaboradores ativos (tipo 5) no REP; nas
 * seguintes, uma alteração de endereço ou CNO/CAEPF vira novo registro tipo 2.
 */
export async function salvarIdentificacaoRep(entrada: z.input<typeof schemaRep>): Promise<Resultado> {
  return acaoDeAdmin(async (u) => {
    const p = schemaRep.parse(entrada);
    const cpf = soDigitos(p.cpf);
    if (!cpfValido(cpf)) throw new ErroDeAcao("CPF inválido. Confira os números.");
    const cnoOuCaepf = p.cnoOuCaepf ? soDigitos(p.cnoOuCaepf) || null : null;
    if (cnoOuCaepf && cnoOuCaepf.length > 14) throw new ErroDeAcao("CNO/CAEPF com mais de 14 dígitos.");

    const atual = await prisma.empresa.findUniqueOrThrow({ where: { id: u.empresaId } });
    const jaRegistrada = await prisma.registroRep.findFirst({ where: { empresaId: u.empresaId, tipo: 2 } });

    await prisma.usuario.update({ where: { id: u.id }, data: { cpf } });
    const empresa = await prisma.empresa.update({ where: { id: u.empresaId }, data: { endereco: p.endereco, cnoOuCaepf } });

    if (!jaRegistrada) {
      await inicializarRep(u.empresaId, cpf);
    } else if (atual.endereco !== empresa.endereco || atual.cnoOuCaepf !== empresa.cnoOuCaepf) {
      await registrarOperacaoRep(prisma, u.empresaId, identificacaoEmpresaRep(empresa, cpf));
    }
    await auditar(u, "identificacao_rep", "Empresa", u.empresaId, { endereco: p.endereco, cnoOuCaepf });
    revalidatePath("/", "layout");
  });
}
