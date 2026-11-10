/**
 * O que o contato que sobrevive a uma junção herda do contato duplicado que
 * será apagado. Puro (sem banco), para teste.
 *
 * Existe por um defeito: a junção só copiava nome, telefone, etapa e valor, e
 * o resto da ficha do contato apagado (CPF, e-mail, endereço, aniversário,
 * anotações, nome no recibo) sumia junto. Foi o relato da Believe em 10/11
 * ("sumiram os dados de algumas clientes").
 *
 * Regra: o que o sobrevivente já tem manda; o que está em branco nele é
 * preenchido pelo duplicado. Anotação é a exceção — se as duas existem e são
 * diferentes, as duas ficam, uma depois da outra, porque anotação é texto
 * livre e apagar uma delas seria perder informação.
 */

export type FichaDoContato = {
  name: string | null;
  nameManual: boolean;
  documento: string | null;
  endereco: string | null;
  email: string | null;
  nascimento: Date | null;
  rgIe: string | null;
  cep: string | null;
  logradouro: string | null;
  numeroEndereco: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  nomeNoRecibo: string | null;
  notes: string | null;
  notesUpdatedAt: Date | null;
};

const CAMPOS_SIMPLES = [
  "documento",
  "endereco",
  "email",
  "nascimento",
  "rgIe",
  "cep",
  "logradouro",
  "numeroEndereco",
  "complemento",
  "bairro",
  "cidade",
  "uf",
  "nomeNoRecibo",
] as const;

export const SELECT_FICHA = {
  name: true,
  nameManual: true,
  documento: true,
  endereco: true,
  email: true,
  nascimento: true,
  rgIe: true,
  cep: true,
  logradouro: true,
  numeroEndereco: true,
  complemento: true,
  bairro: true,
  cidade: true,
  uf: true,
  nomeNoRecibo: true,
  notes: true,
  notesUpdatedAt: true,
} as const;

const vazio = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");

export function fichaMesclada(vive: FichaDoContato, morre: FichaDoContato): FichaDoContato {
  const saida = { ...vive };

  for (const campo of CAMPOS_SIMPLES) {
    if (vazio(vive[campo]) && !vazio(morre[campo])) {
      (saida as Record<string, unknown>)[campo] = morre[campo];
    }
  }

  // Nome digitado por uma pessoa vence o que veio do WhatsApp; entre dois
  // digitados, fica o do sobrevivente.
  if (!vive.nameManual && morre.nameManual && !vazio(morre.name)) {
    saida.name = morre.name;
    saida.nameManual = true;
  } else {
    saida.name = vazio(vive.name) ? morre.name : vive.name;
  }

  const a = vive.notes?.trim() ?? "";
  const b = morre.notes?.trim() ?? "";
  if (a && b && a !== b) {
    saida.notes = `${a}\n\n— anotação do contato duplicado —\n${b}`;
    saida.notesUpdatedAt = new Date();
  } else if (!a && b) {
    saida.notes = b;
    saida.notesUpdatedAt = morre.notesUpdatedAt ?? new Date();
  }

  return saida;
}
