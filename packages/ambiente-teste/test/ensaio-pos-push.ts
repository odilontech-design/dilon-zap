/**
 * Roda UMA vez, como processo à parte, contra o banco do ensaio (schema de produção + db push do schema novo).
 * Faz com o código novo o mesmo que será feito em produção: cadastro manual da empresa FICTÍCIA pela importação,
 * decisor, abordagem, aprovação, registro do contato (que leva a empresa ao CRM), resposta e a tentativa de IA
 * (desligada). Faz o mesmo com uma empresa "real" de controle, que a limpeza não pode tocar.
 * Não é um teste: o arquivo de teste confere o resultado.
 */
// A guarda do ambiente de teste confere a DATABASE_URL só na partida do processo; aqui ela passa a apontar para o banco do ensaio
// antes de o cliente do Prisma ser carregado (por isso os imports são dinâmicos).
process.env.DATABASE_URL = process.env.URL_ENSAIO!;

const tenantId = process.env.ENSAIO_TENANT!;
const autor = { id: "ensaio", name: "Ensaio de Deploy" };
type Nucleo = typeof import("../../sdr-core/src/index");
type Crm = typeof import("../../../apps/web/lib/sdr/crm");
let prisma: typeof import("@dilon-zap/db").prisma;
let nucleo: Nucleo;
let crm: Crm;
let usuarioId = "";

const criarNegociacaoDoEnsaio = (async (a: any) =>
  prisma.negociacao.create({
    data: { tenantId: a.tenantId, contactId: a.contactId, funilId: a.funilId, stageId: a.stageId, titulo: a.titulo, valorCents: 0, recorrencia: "UNICA", valorMensalCents: 0, responsavelId: a.responsavelId, origem: a.origem },
  })) as never;

async function cadastrar(nome: string, email: string, telefone: string) {
  const conteudo = `Nome Fantasia;Telefone;E-mail;Site;UF;Cidade;Segmento\n${nome};${telefone};${email};;RJ;Rio de Janeiro;Limpeza e conservação\n`;
  const { criarImportacao, processarProximoTrabalho, sdrDoTenant } = nucleo;
  const S = sdrDoTenant(tenantId);
  await criarImportacao(tenantId, autor, { nomeArquivo: "cadastro-manual.csv", conteudo, chave: `manual-${nome.replace(/\W/g, "")}-12345678` });
  // Esvazia a fila, como o worker faria.
  const ciclos: unknown[] = [];
  for (let r = await processarProximoTrabalho({ workerId: "ensaio" }); r; r = await processarProximoTrabalho({ workerId: "ensaio" })) ciclos.push(r);
  const e = await prisma.sdrEmpresa.findFirst({ where: { tenantId, nomeFantasia: nome } });
  if (!e) {
    const imp = await prisma.sdrImportacao.findMany({ where: { tenantId }, select: { status: true, erro: true, importadas: true, invalidas: true } });
    const linhas = await prisma.sdrImportacaoLinha.findMany({ where: { tenantId }, select: { status: true, erros: true } });
    throw new Error(JSON.stringify({ ciclos, imp, linhas }));
  }
  await S.comercial.salvar(e.id, { decisorNome: "Pessoa Fictícia", decisorCargo: "Gerente de Operações", prioridade: "ALTA", produto: "DILON_FACILITIES" }, autor);
  const ab = await S.comercial.criarAbordagem(e.id, { produto: "DILON_FACILITIES", canal: "EMAIL", texto: "x", modelo: true }, autor);
  await S.comercial.aprovarAbordagem(ab.id, autor);
  const quando = new Date(Date.now() + 3 * 86_400_000);
  const contato = await S.comercial.registrarContato(ab.id, { canal: "EMAIL", resultado: "registro de ensaio", proximaAcaoEm: quando.toISOString(), proximaAcao: "Fazer follow-up" }, autor);
  const acesso = { user: { id: usuarioId, name: autor.name, tenantId }, sdr: S } as never;
  const noCrm = await crm.espelharNoCrm({ acesso, empresaId: e.id, prisma, criarNegociacao: criarNegociacaoDoEnsaio }, { tipo: "CONTATO", canal: "EMAIL", resultado: "registro de ensaio", assunto: ab.assunto, texto: contato.interacao.texto ?? "", proximaAcao: "Fazer follow-up", proximaAcaoEm: quando });
  await S.comercial.registrarResultado(e.id, { etapa: "RESPONDEU", nota: "ensaio" }, autor);
  await crm.espelharNoCrm({ acesso, empresaId: e.id, prisma, criarNegociacao: criarNegociacaoDoEnsaio }, { tipo: "RESPOSTA", etapa: "RESPONDEU", nota: "ensaio" });
  await S.comercial.registrarNota(e.id, "nota de ensaio", autor);
  const ia = await S.comercial.gerarAbordagem(e.id, { produto: "DILON_FACILITIES" }, autor);
  return { empresaId: e.id, iaOk: ia.ok, iaMotivo: ia.ok ? null : ia.motivo, crmOk: noCrm.ok, negociacaoId: noCrm.ok ? noCrm.negociacaoId : null };
}

(async () => {
  prisma = (await import("@dilon-zap/db")).prisma;
  nucleo = await import("../../sdr-core/src/index");
  crm = await import("../../../apps/web/lib/sdr/crm");
  usuarioId = (await prisma.user.create({ data: { tenantId, email: "ensaio@deploy.teste", name: autor.name, role: "OWNER", passwordHash: "x" } })).id;
  const funil = await prisma.funil.create({ data: { tenantId, nome: "Prospecção ativa" } });
  await prisma.stage.create({ data: { tenantId, funilId: funil.id, name: "Contato inicial", position: 0 } });
  const fict = await cadastrar("Zz Teste Sdr Ensaio", "teste@zz-ensaio.invalid", "(21) 90000-0001");
  const real = await cadastrar("Empresa Real De Controle", "contato@controle.invalid", "(21) 90000-0002");
  console.log(JSON.stringify({ fict, real }));
})()
  .catch((e) => {
    console.log(JSON.stringify({ erro: String(e?.message ?? e).slice(0, 400) }));
    process.exitCode = 1;
  })
  .finally(() => prisma?.$disconnect());
