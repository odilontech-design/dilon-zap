/**
 * Teste manual das regras do ERP: `npx tsx apps/web/lib/erp-regras.test-manual.ts`
 * (mesmo padrão dos outros *.test-manual.ts do repositório). Sai com código 1 se algo falhar.
 */
import assert from "node:assert/strict";
import { MODULOS_DO_PLANO, MODULOS_ERP, resumoDosModulos, acaoDeSincronizacao, decidirSuspensao, ERP_PLANOS, novoTotalDaAssinatura, PLANOS_ERP, proximoVencimento, reaisParaCentavos, sugerirCondicoes } from "./erp-regras";

const agora = new Date("2026-10-20T12:00:00Z");
const fatura = (status: string, dueDate: string) => ({ status, dueDate: new Date(`${dueDate}T00:00:00Z`) });
let n = 0;
const ok = (nome: string, fn: () => void) => { fn(); n++; console.log("OK  ", nome); };

ok("sem assinatura nunca suspende (empresa legada)", () => assert.deepEqual(decidirSuspensao(null, [fatura("PENDING", "2020-01-01")], agora), { suspender: false }));
ok("cancelada e pausada suspendem", () => {
  assert.deepEqual(decidirSuspensao({ status: "CANCELED" }, [], agora), { suspender: true, motivo: "Assinatura cancelada" });
  assert.deepEqual(decidirSuspensao({ status: "PAUSED" }, [], agora), { suspender: true, motivo: "Assinatura pausada" });
});
ok("teste gratuito não suspende, mesmo com fatura velha", () => assert.deepEqual(decidirSuspensao({ status: "TRIAL" }, [fatura("PENDING", "2020-01-01")], agora), { suspender: false }));
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
console.log(`\n${n} verificações, todas passaram.`);
