import { z } from "zod";

/** O que as telas da revenda mandam para as rotas. Valores sempre em centavos. */

const texto = (max: number) => z.string().trim().max(max).nullable().optional();
const centavos = z.number().int().min(0).max(100_000_000_00);
const data = z.string().datetime();
const ano = z.number().int().min(1950).max(new Date().getFullYear() + 2);

export const TIPOS_CUSTO = ["COMPRA", "DESPACHANTE", "MECANICA", "FUNILARIA", "ESTETICA", "PNEUS", "DOCUMENTACAO", "IPVA", "OUTRO"] as const;
export const FORMAS_PAGAR = ["BOLETO", "PIX", "TRANSFERENCIA", "CARTAO", "DINHEIRO", "CHEQUE", "OUTRO"] as const;
export const MEIOS_RECEBER = ["DINHEIRO", "PIX", "CARTAO", "BOLETO"] as const;

export const dadosVeiculoSchema = z.object({
  tipo: z.enum(["CARRO", "MOTO", "CAMINHAO"]).optional(),
  placa: texto(10),
  chassi: texto(30),
  renavam: texto(20),
  marca: z.string().trim().min(1, "informe a marca").max(60),
  modelo: z.string().trim().min(1, "informe o modelo").max(80),
  versao: texto(120),
  anoFabricacao: ano,
  anoModelo: ano,
  km: z.number().int().min(0).max(3_000_000),
  cor: texto(40),
  combustivel: texto(40),
  cambio: texto(40),
  portas: z.number().int().min(0).max(9).nullable().optional(),
  opcionais: z.array(z.string().trim().min(1).max(60)).max(60).optional(),
  codigoFipe: texto(20),
  fipeCents: centavos.nullable().optional(),
  fipeReferencia: texto(40),
  precoCents: centavos,
  precoMinimoCents: centavos.nullable().optional(),
  descricao: texto(4000),
  observacoesInternas: texto(4000),
  naVitrine: z.boolean().optional(),
});

/** Pagamento de uma conta a pagar lançada junto (compra do carro, oficina). */
const lancarPagarSchema = z.object({
  fornecedorNome: z.string().trim().min(1, "de quem a loja comprou / quem prestou o serviço").max(120),
  forma: z.enum(FORMAS_PAGAR),
  vencimento: data,
  /** Já foi pago (Pix na hora da compra): lança e quita. */
  jaPago: z.boolean().optional(),
});

/** Cliente: um contato que já existe ou um novo, pelo telefone. */
export const clienteSchema = z.union([
  z.object({ contactId: z.string().min(1) }),
  z.object({ novoCliente: z.object({ nome: z.string().trim().min(1).max(120), telefone: z.string().trim().min(8).max(20) }) }),
]);

export const entradaVeiculoSchema = z.object({
  veiculo: dadosVeiculoSchema,
  origem: z.enum(["COMPRA", "CONSIGNACAO"]),
  disponivel: z.boolean().optional(),
  entradaEm: data.optional(),
  compra: z
    .object({
      valorCents: centavos.refine((v) => v > 0, "informe o valor da compra"),
      pagar: lancarPagarSchema.nullable().optional(),
    })
    .nullable()
    .optional(),
  consignacao: z
    .object({
      dono: clienteSchema,
      valorLiquidoCents: centavos.refine((v) => v > 0, "informe quanto o dono recebe"),
      ate: data.nullable().optional(),
    })
    .nullable()
    .optional(),
});

export const editarVeiculoSchema = dadosVeiculoSchema.partial().extend({
  status: z.enum(["PREPARACAO", "DISPONIVEL", "DEVOLVIDO"]).optional(),
  consignacaoValorCents: centavos.nullable().optional(),
  consignacaoAte: data.nullable().optional(),
});

export const custoSchema = z.object({
  tipo: z.enum(TIPOS_CUSTO),
  descricao: texto(200),
  valorCents: centavos.refine((v) => v > 0, "informe o valor"),
  data: data.optional(),
  pagar: lancarPagarSchema.nullable().optional(),
});

export const reservaSchema = z.intersection(
  clienteSchema,
  z.object({
    vendedorId: z.string().nullable().optional(),
    precoCents: centavos.refine((v) => v > 0, "informe o preço combinado"),
    sinalCents: centavos.optional(),
    meioDoSinal: z.enum(MEIOS_RECEBER).nullable().optional(),
    reservadaAte: data,
    observacoes: texto(2000),
  })
);

const trocaSchema = z.object({
  veiculo: dadosVeiculoSchema.omit({ precoCents: true }).extend({ precoCents: centavos.optional() }),
  valorCents: centavos.refine((v) => v > 0, "informe quanto a troca vale"),
});

export const vendaSchema = z.intersection(
  // Concluir uma reserva não pede cliente: já é o da reserva.
  z.union([clienteSchema, z.object({ daReserva: z.literal(true) })]),
  z.object({
    vendedorId: z.string().nullable().optional(),
    precoCents: centavos.refine((v) => v > 0, "informe o preço de venda"),
    troca: trocaSchema.nullable().optional(),
    entradaCents: centavos.optional(),
    meioDaEntrada: z.enum(MEIOS_RECEBER).nullable().optional(),
    financiadoCents: centavos.optional(),
    banco: texto(80),
    /** Quando o banco paga a loja. */
    vencimentoFinanciamento: data.nullable().optional(),
    /** O que sobra fica no crediário da loja. */
    restante: z
      .object({
        numParcelas: z.number().int().min(1).max(60),
        periodicidade: z.enum(["SEMANAL", "QUINZENAL", "MENSAL"]),
        primeiroVencimento: data,
      })
      .nullable()
      .optional(),
    comissaoCents: centavos.nullable().optional(),
    /** Consignado: quando a loja paga o dono. */
    vencimentoRepasse: data.nullable().optional(),
    observacoes: texto(2000),
  })
);

export const cancelarVendaSchema = z.object({
  motivo: texto(500),
  devolverSinal: z.boolean().optional(),
});

export const envioSchema = z.union([z.object({ contactId: z.string().min(1) }), z.object({ conversationId: z.string().min(1) })]).and(
  z.object({
    /** Quantas fotos mandar junto (a capa primeiro). */
    fotos: z.number().int().min(0).max(10).optional(),
  })
);

export type DadosVeiculo = z.infer<typeof dadosVeiculoSchema>;

export const configRevendaSchema = z.object({
  vitrineAtiva: z.boolean(),
  whatsapp: texto(20),
  nomeLoja: texto(120),
  endereco: texto(200),
  sobre: texto(2000),
  mostrarReservados: z.boolean(),
  dominio: texto(253),
  metaPixelId: z.string().trim().regex(/^\d{5,20}$/, "o ID do pixel tem só números").nullable().optional().or(z.literal("")),
  ga4Id: z.string().trim().toUpperCase().regex(/^G-[A-Z0-9]{4,15}$/, "o ID do Google Analytics começa com G-").nullable().optional().or(z.literal("")),
  formularioAtivo: z.boolean(),
  exigirKm: z.boolean(),
  corPrimaria: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, "a cor precisa ser no formato #1f6f4a").nullable().optional().or(z.literal("")),
  horario: texto(300),
  instagram: texto(100),
  facebook: texto(150),
  politicaPrivacidade: texto(8000),
});
