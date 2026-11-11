import { test } from "node:test";
import assert from "node:assert/strict";
import { situacaoAssinatura, statusDaFatura, type FaturaResumo } from "./cobranca-regras";

const f = (vencimento: string, status: FaturaResumo["status"] = "PENDENTE"): FaturaResumo => ({
  id: vencimento,
  vencimento,
  status,
  valorCentavos: 5990,
  urlFatura: null,
});
const sit = (faturas: FaturaResumo[], hoje: string, extra: Partial<Parameters<typeof situacaoAssinatura>[0]> = {}) =>
  situacaoAssinatura({ forma: "BOLETO_ASAAS", cancelada: false, faturas, hoje, toleranciaDias: 5, ...extra });

test("contratou hoje, boleto vence em 3 dias: acesso liberado, aguardando pagamento", () => {
  const s = sit([f("2026-11-14")], "2026-11-11");
  assert.equal(s.estado, "AGUARDANDO_PAGAMENTO");
  assert.equal(s.painelBloqueado, false);
  assert.equal(s.bloqueiaEm, "2026-11-20");
});

test("no dia do vencimento ainda não está vencida", () => {
  assert.equal(sit([f("2026-11-14")], "2026-11-14").estado, "AGUARDANDO_PAGAMENTO");
});

test("vencida: 5 dias de tolerância, com contagem regressiva", () => {
  const s = sit([f("2026-11-14", "VENCIDA")], "2026-11-15");
  assert.equal(s.estado, "VENCIDA");
  assert.equal(s.painelBloqueado, false);
  assert.equal(s.diasParaBloqueio, 4);
  assert.equal(sit([f("2026-11-14", "VENCIDA")], "2026-11-19").diasParaBloqueio, 0);
});

test("passou da tolerância: painel bloqueado, mas o colaborador continua batendo ponto", () => {
  const s = sit([f("2026-11-14", "VENCIDA")], "2026-11-20");
  assert.equal(s.estado, "BLOQUEADA");
  assert.equal(s.painelBloqueado, true);
  assert.equal(s.registroLiberado, true);
});

test("paga: em dia, mesmo depois do prazo", () => {
  assert.equal(sit([f("2026-11-14", "PAGA")], "2026-12-30").estado, "EM_DIA");
});

test("a fatura em aberto mais antiga é a que conta", () => {
  const s = sit([f("2026-12-14"), f("2026-11-14", "VENCIDA"), f("2026-10-14", "PAGA")], "2026-11-25");
  assert.equal(s.estado, "BLOQUEADA");
  assert.equal(s.emAberto?.vencimento, "2026-11-14");
});

test("pagar a atrasada desbloqueia, mesmo com a do mês seguinte em aberto", () => {
  const s = sit([f("2026-12-14"), f("2026-11-14", "PAGA")], "2026-11-25");
  assert.equal(s.estado, "AGUARDANDO_PAGAMENTO");
  assert.equal(s.painelBloqueado, false);
});

test("fatura cancelada não bloqueia nem conta como paga", () => {
  assert.equal(sit([f("2026-11-14", "CANCELADA")], "2026-12-30").estado, "SEM_BOLETO");
});

test("sem boleto (falha ao gerar) não bloqueia", () => {
  const s = sit([], "2026-12-30");
  assert.equal(s.estado, "SEM_BOLETO");
  assert.equal(s.painelBloqueado, false);
});

test("isenta nunca bloqueia; cancelada bloqueia tudo, inclusive o registro", () => {
  assert.equal(sit([f("2026-01-01", "VENCIDA")], "2026-12-30", { forma: "ISENTA" }).painelBloqueado, false);
  const c = sit([], "2026-12-30", { cancelada: true });
  assert.equal(c.painelBloqueado, true);
  assert.equal(c.registroLiberado, false);
});

test("status do Asaas", () => {
  assert.equal(statusDaFatura("RECEIVED"), "PAGA");
  assert.equal(statusDaFatura("CONFIRMED"), "PAGA");
  assert.equal(statusDaFatura("OVERDUE"), "VENCIDA");
  assert.equal(statusDaFatura("PENDING"), "PENDENTE");
  assert.equal(statusDaFatura("REFUNDED"), "CANCELADA");
  assert.equal(statusDaFatura("PENDING", true), "CANCELADA");
});
