import { prisma } from "@dilon-zap/ponto-db";
import { dataHoraNoFuso } from "@/lib/datas";
import { formatarCnpj, mascararCpf } from "@/lib/documentos";

export interface Comprovante {
  nsr: number;
  dataHora: string;
  empresa: string;
  cnpj: string;
  colaborador: string;
  cpf: string;
  hash: string;
  canal: string;
  offline: boolean;
  localizacao: boolean;
}

/** Comprovante de registro de ponto mostrado ao colaborador a cada marcação. */
export async function comprovanteDe(marcacaoId: string): Promise<Comprovante> {
  const m = await prisma.marcacao.findUniqueOrThrow({
    where: { id: marcacaoId },
    include: {
      colaborador: { select: { nome: true, cpf: true } },
      empresa: { select: { razaoSocial: true, cnpj: true, timezone: true } },
    },
  });
  return {
    nsr: m.nsr,
    dataHora: dataHoraNoFuso(m.instante, m.empresa.timezone),
    empresa: m.empresa.razaoSocial,
    cnpj: formatarCnpj(m.empresa.cnpj),
    colaborador: m.colaborador.nome,
    cpf: mascararCpf(m.colaborador.cpf),
    hash: m.hash.slice(0, 16),
    canal: m.canal === "APP" ? "Aplicativo" : "Web",
    offline: m.offline,
    localizacao: m.latitude != null,
  };
}
