/**
 * Empresa de demonstração: padaria com turno comercial e produção noturna,
 * e duas semanas de marcações com um pouco de tudo (atraso, hora extra,
 * esquecimento, falta). É o que se mostra numa demonstração de venda.
 *
 *   Administrador: admin@paodeouro.com.br / ponto123
 *   Colaborador:   CPF da tela de colaboradores / ponto123
 */
import bcrypt from "bcryptjs";
import { feriadosNacionais } from "@dilon-zap/ponto-core";
import { prisma, registrarMarcacao } from "../src/index";

const CNPJ = "11222333000181";
const FUSO_OFFSET_H = 3; // America/Sao_Paulo, sem horário de verão desde 2019

function cpfValido(base9: string): string {
  const dig = (nums: number[], pesoInicial: number) => {
    const soma = nums.reduce((s, n, i) => s + n * (pesoInicial - i), 0);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  const n = base9.split("").map(Number);
  const d1 = dig(n, 10);
  const d2 = dig([...n, d1], 11);
  return `${base9}${d1}${d2}`;
}

/** Data local (AAAA-MM-DD) + "HH:MM" em São Paulo → Date UTC. */
function local(data: string, hora: string, diasDepois = 0): Date {
  const [a, m, d] = data.split("-").map(Number);
  const [h, min] = hora.split(":").map(Number);
  return new Date(Date.UTC(a, m - 1, d + diasDepois, h + FUSO_OFFSET_H, min));
}

function hojeSaoPaulo(): string {
  return new Date(Date.now() - FUSO_OFFSET_H * 3600_000).toISOString().slice(0, 10);
}

function somarDias(data: string, n: number): string {
  return new Date(Date.parse(`${data}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

async function main() {
  if (await prisma.empresa.findUnique({ where: { cnpj: CNPJ } })) {
    console.log("A empresa de demonstração já existe. Nada a fazer.");
    return;
  }

  const senhaHash = await bcrypt.hash("ponto123", 10);

  const empresa = await prisma.empresa.create({
    data: {
      razaoSocial: "Padaria Pão de Ouro Ltda",
      nomeFantasia: "Pão de Ouro",
      cnpj: CNPJ,
      plano: "ESSENCIAL",
      bancoDeHoras: true,
      // Empresa de demonstração não gera boleto nem é bloqueada.
      formaCobranca: "ISENTA",
      // A demonstração tem duas semanas de histórico: o controle começa com elas.
      criadoEm: local(somarDias(hojeSaoPaulo(), -14), "00:00"),
    },
  });

  const ano = Number(hojeSaoPaulo().slice(0, 4));
  await prisma.feriado.createMany({
    data: [...feriadosNacionais(ano), ...feriadosNacionais(ano + 1)].map((f) => ({
      empresaId: empresa.id,
      data: new Date(`${f.data}T00:00:00Z`),
      nome: f.nome,
    })),
  });

  await prisma.usuario.create({
    data: { empresaId: empresa.id, nome: "Marta Oliveira", login: "admin@paodeouro.com.br", senhaHash, papel: "ADMIN" },
  });

  const comercial = await prisma.jornada.create({
    data: {
      empresaId: empresa.id,
      nome: "Comercial (seg–sex 8h–17h, sáb 8h–12h)",
      semana: {
        "0": [],
        "1": [["08:00", "12:00"], ["13:00", "17:00"]],
        "2": [["08:00", "12:00"], ["13:00", "17:00"]],
        "3": [["08:00", "12:00"], ["13:00", "17:00"]],
        "4": [["08:00", "12:00"], ["13:00", "17:00"]],
        "5": [["08:00", "12:00"], ["13:00", "17:00"]],
        "6": [["08:00", "12:00"]],
      },
    },
  });
  const noturno = await prisma.jornada.create({
    data: {
      empresaId: empresa.id,
      nome: "Produção noturna (seg–sáb 22h–6h)",
      semana: {
        "0": [],
        "1": [["22:00", "02:00"], ["03:00", "06:00"]],
        "2": [["22:00", "02:00"], ["03:00", "06:00"]],
        "3": [["22:00", "02:00"], ["03:00", "06:00"]],
        "4": [["22:00", "02:00"], ["03:00", "06:00"]],
        "5": [["22:00", "02:00"], ["03:00", "06:00"]],
        "6": [["22:00", "02:00"], ["03:00", "06:00"]],
      },
    },
  });

  const pessoas = [
    { nome: "João Pereira", cpf: cpfValido("529982247"), cargo: "Atendente", jornada: comercial, modo: "SIMPLES" as const },
    { nome: "Ana Souza", cpf: cpfValido("123456789"), cargo: "Caixa", jornada: comercial, modo: "COM_FOTO" as const },
    { nome: "Carlos Lima", cpf: cpfValido("987654321"), cargo: "Padeiro", jornada: noturno, modo: "SIMPLES" as const },
  ];

  const hoje = hojeSaoPaulo();
  const inicio = somarDias(hoje, -14);

  for (const [indice, p] of pessoas.entries()) {
    const colaborador = await prisma.colaborador.create({
      data: {
        empresaId: empresa.id,
        nome: p.nome,
        cpf: p.cpf,
        cargo: p.cargo,
        admissao: new Date(`${somarDias(hoje, -400)}T00:00:00Z`),
        jornadaId: p.jornada.id,
        modoRegistro: p.modo,
      },
    });
    await prisma.usuario.create({
      data: { empresaId: empresa.id, nome: p.nome, login: p.cpf, senhaHash, papel: "COLABORADOR", colaboradorId: colaborador.id },
    });

    for (let d = 0; d < 14; d++) {
      const data = somarDias(inicio, d);
      const diaSemana = new Date(`${data}T12:00:00Z`).getUTCDay();
      const turnos = (p.jornada.semana as Record<string, string[][]>)[String(diaSemana)];
      if (!turnos.length) continue;

      // Um pouco de tudo, sempre no mesmo lugar, para a demonstração ser previsível.
      const caso = (d + indice * 3) % 7;
      if (caso === 5 && indice === 0) continue; // falta

      // [hora, dias depois]: horário antes do início do primeiro turno é do dia seguinte.
      const primeiro = turnos[0][0];
      const horarios: Array<[string, number]> = turnos.flat().map((h) => [h, h < primeiro ? 1 : 0]);
      if (caso === 1) horarios[0] = [horarios[0][0].replace(/:00$/, ":17"), horarios[0][1]]; // atraso de 17 min
      if (caso === 2) horarios[horarios.length - 1] = [horarios[horarios.length - 1][0].replace(/^(\d\d):00$/, (_, h) => `${String(Number(h) + 1).padStart(2, "0")}:10`), horarios[horarios.length - 1][1]]; // extra
      if (caso === 3) horarios[1] = [horarios[1][0].replace(/:00$/, ":03"), horarios[1][1]]; // dentro da tolerância
      if (caso === 4 && indice === 1) horarios.pop(); // esqueceu a saída

      for (const [hora, depois] of horarios) {
        await registrarMarcacao({
          empresaId: empresa.id,
          colaboradorId: colaborador.id,
          canal: indice === 1 ? "APP" : "WEB",
          idempotencia: `seed-${colaborador.id}-${data}-${hora}-${depois}`,
          latitude: -22.9068 + Math.random() * 0.0005,
          longitude: -43.1729 + Math.random() * 0.0005,
          precisaoM: 12,
          instanteForcado: local(data, hora, depois),
        });
      }
    }
  }

  console.log("Empresa de demonstração criada.");
  console.log("  Administrador: admin@paodeouro.com.br / ponto123");
  for (const p of pessoas) console.log(`  ${p.nome}: CPF ${p.cpf} / ponto123`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
