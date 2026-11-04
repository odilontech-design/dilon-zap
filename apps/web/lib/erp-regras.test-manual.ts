/**
 * Teste manual das regras do ERP: `npx tsx apps/web/lib/erp-regras.test-manual.ts`
 * (mesmo padrão dos outros *.test-manual.ts do repositório). Sai com código 1 se algo falhar.
 */
import assert from "node:assert/strict";
import { MODULOS_DO_PLANO, MODULOS_ERP, resumoDosModulos, acaoDeSincronizacao, decidirSuspensao, ERP_PLANOS, novoTotalDaAssinatura, PLANOS_ERP, proximoVencimento, reaisParaCentavos, sugerirCondicoes } from "./erp-regras";

const agora = new Date("2026-10-20T12:00:00Z");
const fatura = (status: string, dueDate: string) => ({ status, dueDate: new Date(`${dueDate}T00:00:00Z`) });
let n = 0;
const ok = (nome: string, fn: () => void | Promise<void>) => { const r = fn(); if (r) pend.push(r.then(() => { n++; console.log("OK  ", nome); })); else { n++; console.log("OK  ", nome); } };
const pend: Promise<void>[] = [];

ok("sem assinatura nunca suspende (empresa legada)", () => assert.deepEqual(decidirSuspensao(null, [fatura("PENDING", "2020-01-01")], agora), { suspender: false }));
ok("cancelada e pausada suspendem", () => {
  assert.deepEqual(decidirSuspensao({ status: "CANCELED" }, [], agora), { suspender: true, motivo: "Assinatura cancelada" });
  assert.deepEqual(decidirSuspensao({ status: "PAUSED" }, [], agora), { suspender: true, motivo: "Assinatura pausada" });
});
ok("teste gratuito sem data de fim não suspende, mesmo com fatura velha", () => assert.deepEqual(decidirSuspensao({ status: "TRIAL" }, [fatura("PENDING", "2020-01-01")], agora), { suspender: false }));
ok("teste vencido sem pagamento suspende depois da tolerância; com pagamento, não", () => {
  const fim = new Date("2026-10-05T00:00:00Z");
  assert.equal(decidirSuspensao({ status: "TRIAL", testeAte: fim }, [], agora).suspender, true);
  assert.deepEqual(decidirSuspensao({ status: "TRIAL", testeAte: new Date("2026-10-15T00:00:00Z") }, [], agora), { suspender: false }, "5 dias: dentro da tolerância");
  assert.deepEqual(decidirSuspensao({ status: "TRIAL", testeAte: new Date("2026-11-01T00:00:00Z") }, [], agora), { suspender: false }, "teste ainda em curso");
  assert.deepEqual(decidirSuspensao({ status: "TRIAL", testeAte: fim }, [], agora, 10, true), { suspender: false }, "já pagou: decide uma pessoa");
});
ok("ativa sem fatura em aberto não suspende", () => assert.deepEqual(decidirSuspensao({ status: "ACTIVE" }, [fatura("PAID", "2020-01-01")], agora), { suspender: false }));
ok("tolerância: 10 dias passa, 11 suspende", () => {
  assert.deepEqual(decidirSuspensao({ status: "ACTIVE" }, [fatura("PENDING", "2026-10-10")], agora), { suspender: false });
  assert.deepEqual(decidirSuspensao({ status: "ACTIVE" }, [fatura("PENDING", "2026-10-09")], agora), { suspender: true, motivo: "Fatura vencida há 11 dias" });
});
ok("vale a fatura em aberto MAIS ANTIGA; vencimento futuro não conta", () => {
  assert.equal(decidirSuspensao({ status: "ACTIVE" }, [fatura("PENDING", "2026-11-01"), fatura("OVERDUE", "2026-09-01")], agora).suspender, true);
  assert.equal(decidirSuspensao({ status: "ACTIVE" }, [fatura("PENDING", "2026-11-01")], agora).suspender, false);
});
ok("tolerância configurável", () => assert.equal(decidirSuspensao({ status: "ACTIVE" }, [fatura("PENDING", "2026-10-15")], agora, 3).suspender, true));
ok("sincronização: suspende, reativa só a automática, nunca a manual", () => {
  const susp = { suspender: true as const, motivo: "x" };
  const livre = { suspender: false as const };
  assert.equal(acaoDeSincronizacao({ status: "ATIVO", suspensoPor: null }, susp), "SUSPENDER");
  assert.equal(acaoDeSincronizacao({ status: "SUSPENSO", suspensoPor: "AUTO" }, susp), "NADA");
  assert.equal(acaoDeSincronizacao({ status: "SUSPENSO", suspensoPor: "AUTO" }, livre), "REATIVAR");
  assert.equal(acaoDeSincronizacao({ status: "SUSPENSO", suspensoPor: "MANUAL" }, livre), "NADA");
  assert.equal(acaoDeSincronizacao({ status: "ATIVO", suspensoPor: null }, livre), "NADA");
});
ok("total da assinatura troca só a parte do ERP", () => {
  assert.equal(novoTotalDaAssinatura(100_000, 0, 59_700), 159_700);
  assert.equal(novoTotalDaAssinatura(159_700, 59_700, 29_700), 129_700);
  assert.equal(novoTotalDaAssinatura(10_000, 50_000, 0), 0, "nunca fica negativo");
});
ok("reais para centavos", () => {
  assert.equal(reaisParaCentavos("597"), 59_700);
  assert.equal(reaisParaCentavos("1.197,00"), 119_700);
  assert.equal(reaisParaCentavos("R$ 297,5"), 29_750);
  assert.equal(reaisParaCentavos("297.50"), 29_750);
  assert.equal(reaisParaCentavos("-5"), null);
  assert.equal(reaisParaCentavos("abc"), null);
  assert.equal(reaisParaCentavos(""), null);
  assert.equal(reaisParaCentavos("1,234,56"), null);
});
ok("planos do ERP: limites crescentes e rótulos", () => {
  assert.deepEqual(PLANOS_ERP, ["ESSENCIAL", "PROFISSIONAL", "ESCRITORIO_PLUS", "SOB_MEDIDA"]);
  assert.ok(ERP_PLANOS.ESSENCIAL.limiteEmpresas! < ERP_PLANOS.PROFISSIONAL.limiteEmpresas! && ERP_PLANOS.PROFISSIONAL.limiteEmpresas! < ERP_PLANOS.ESCRITORIO_PLUS.limiteEmpresas!);
  assert.equal(ERP_PLANOS.SOB_MEDIDA.limiteEmpresas, null);
});
ok("próximo vencimento", () => {
  assert.equal(proximoVencimento(15, new Date("2026-11-04T12:00:00Z")), "2026-11-15");
  assert.equal(proximoVencimento(15, new Date("2026-11-15T12:00:00Z")), "2026-12-15", "no próprio dia, vai para o mês seguinte");
  assert.equal(proximoVencimento(15, new Date("2026-12-20T12:00:00Z")), "2027-01-15", "vira o ano");
});
ok("condições sugeridas para o termo", () => {
  const c = sugerirCondicoes({ plano: "PROFISSIONAL", mensalCents: 39_700 }, 15, new Date("2026-11-04T12:00:00Z"));
  assert.deepEqual(c, { plano: "Profissional", valorMensalCents: 39_700, valorTabelaCents: 59_700, garantiaMeses: 12, primeiraCobranca: "2026-11-15", fimDoTeste: "2026-11-14", diaVencimento: 15 });
  assert.equal(sugerirCondicoes({ plano: "SOB_MEDIDA", mensalCents: 80_000 }, null, new Date("2026-11-04T12:00:00Z")).valorTabelaCents, 80_000, "sob medida usa o próprio valor como tabela");
  assert.equal(sugerirCondicoes({ plano: "ESSENCIAL", mensalCents: 29_700 }, 31, new Date("2026-11-04T12:00:00Z")).diaVencimento, 10, "dia inválido cai no padrão");
});
ok("módulos por plano", () => {
  for (const p of PLANOS_ERP) for (const m of MODULOS_DO_PLANO[p]) assert.ok(MODULOS_ERP.includes(m), `${p}:${m}`);
  assert.ok(MODULOS_DO_PLANO.ESSENCIAL.length < MODULOS_DO_PLANO.PROFISSIONAL.length && MODULOS_DO_PLANO.PROFISSIONAL.length < MODULOS_DO_PLANO.ESCRITORIO_PLUS.length);
  assert.equal(resumoDosModulos(null), "Todos os módulos");
  assert.equal(resumoDosModulos([...MODULOS_ERP]), "Todos os módulos");
  assert.equal(resumoDosModulos([]), "Só o núcleo (nenhum módulo opcional)");
  assert.equal(resumoDosModulos(["DOCUMENTOS", "FINANCEIRO"]), "2 de 7: Financeiro, Documentos");
});
ok("contratação online: ciclo, condições e formulário", async () => {
  const c = await import("./erp-contratacao");
  // 29/10 (quinta): teste de 14 dias; primeira cobrança em 13/11, véspera = fim do teste
  assert.deepEqual(c.ciclo(new Date("2026-10-29T15:00:00Z")), { primeiraCobranca: "2026-11-13", fimDoTeste: "2026-11-12", diaVencimento: 13 });
  // pouco depois da meia-noite UTC ainda é "ontem" em São Paulo
  assert.equal(c.ciclo(new Date("2026-10-30T01:00:00Z")).primeiraCobranca, "2026-11-13");
  // dia do mês > 28 pula para o dia 1 (a assinatura só aceita 1 a 28)
  assert.deepEqual(c.ciclo(new Date("2026-10-15T15:00:00Z")), { primeiraCobranca: "2026-11-01", fimDoTeste: "2026-10-31", diaVencimento: 1 });
  const cond = c.condicoesDaContratacao("PROFISSIONAL", new Date("2026-10-29T15:00:00Z"));
  assert.deepEqual([cond.plano, cond.valorMensalCents, cond.valorTabelaCents, cond.garantiaMeses], ["Profissional", 59_700, 59_700, 12]);
  assert.deepEqual(c.limitesDoPlano("ESSENCIAL"), { limiteEmpresas: 30, limiteUsuarios: 3 });
  assert.ok(c.modulosDoPlano("ESSENCIAL").length < c.modulosDoPlano("ESCRITORIO_PLUS").length);
  const t = c.novoToken();
  assert.ok(t.length >= 43 && c.hashDoToken(t) === c.hashDoToken(t) && c.hashDoToken(t) !== t);
  const base = { plano: "PROFISSIONAL", escritorioNome: "Alfa Contabilidade", cnpj: "11.222.333/0001-81", responsavelNome: "Ana Paula Souza", responsavelCpf: "529.982.247-25", email: "ANA@alfa.com", telefone: "(21) 98072-2943", termoHash: "a".repeat(64), aceitei: true };
  const ok1 = c.esquemaDoPedido.safeParse(base);
  assert.ok(ok1.success, JSON.stringify(ok1.success ? "" : ok1.error.issues));
  assert.equal(ok1.success && ok1.data.email, "ana@alfa.com");
  for (const [campo, valor] of [["cnpj", "11.111.111/1111-11"], ["responsavelCpf", "111.111.111-11"], ["responsavelNome", "Ana"], ["telefone", "123"], ["aceitei", false], ["plano", "SOB_MEDIDA"], ["termoHash", "x"]] as const) assert.equal(c.esquemaDoPedido.safeParse({ ...base, [campo]: valor }).success, false, campo);
  assert.match(c.emailDeBoasVindas({ nome: "Ana Paula", escritorio: "Alfa", loginUrl: "https://x/login?e=alfa", email: "a@a.com", senha: "S3nha", fimDoTeste: "2026-11-12", primeiraCobranca: "2026-11-13", valorMensalCents: 59_700, linkDePagamento: null }).texto, /Senha provisória: S3nha[\s\S]*12\/11\/2026[\s\S]*R\$\s?597,00/);
});
Promise.all(pend)
  .then(() => console.log(`\n${n} verificações, todas passaram.`))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
