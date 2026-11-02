/**
 * Roda UMA vez, como processo à parte, contra o banco do ensaio (schema de produção + db push do schema novo).
 * Faz com o código novo o mesmo que será feito em produção: cadastro manual da empresa FICTÍCIA pela importação,
 * decisor, abordagem, aprovação, registro do contato, resposta e a tentativa de IA (desligada). Faz o mesmo com
 * uma empresa "real" de controle, que a limpeza não pode tocar. Não é um teste: o arquivo de teste confere o resultado.
 */
// A guarda do ambiente de teste confere a DATABASE_URL só na partida do processo; aqui ela passa a apontar para o banco do ensaio
// antes de o cliente do Prisma ser carregado (por isso os imports são dinâmicos).
process.env.DATABASE_URL = process.env.URL_ENSAIO!;

const tenantId = process.env.ENSAIO_TENANT!;
const autor = { id: "ensaio", name: "Ensaio de Deploy" };
type Nucleo = typeof import("../../sdr-core/src/index");
let prisma: typeof import("@dilon-zap/db").prisma;
let nucleo: Nucleo;

async function cadastrar(nome: string, email: string) {
  const conteudo = `Nome Fantasia;Telefone;E-mail;Site;UF;Cidade;Segmento\n${nome};;${email};;RJ;Rio de Janeiro;Limpeza e conservação\n`;
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
  await S.comercial.registrarContato(ab.id, { canal: "EMAIL", resultado: "registro de ensaio", proximaAcaoEm: new Date(Date.now() + 3 * 86_400_000).toISOString(), proximaAcao: "Fazer follow-up" }, autor);
  await S.comercial.registrarResultado(e.id, { etapa: "RESPONDEU", nota: "ensaio" }, autor);
  await S.comercial.registrarNota(e.id, "nota de ensaio", autor);
  const ia = await S.comercial.gerarAbordagem(e.id, { produto: "DILON_FACILITIES" }, autor);
  return { empresaId: e.id, iaOk: ia.ok, iaMotivo: ia.ok ? null : ia.motivo };
}

(async () => {
  prisma = (await import("@dilon-zap/db")).prisma;
  nucleo = await import("../../sdr-core/src/index");
  const fict = await cadastrar("Zz Teste Sdr Ensaio", "teste@zz-ensaio.invalid");
  const real = await cadastrar("Empresa Real De Controle", "contato@controle.invalid");
  console.log(JSON.stringify({ fict, real }));
})()
  .catch((e) => {
    console.log(JSON.stringify({ erro: String(e?.message ?? e).slice(0, 400) }));
    process.exitCode = 1;
  })
  .finally(() => prisma?.$disconnect());
