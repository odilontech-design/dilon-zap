import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { estagioDoAlerta, minutosEntre, textoDaEspera } from "../../../apps/worker/src/alerta-sem-resposta-regra";
import { esperaSemResposta, textoDaEspera as textoWeb } from "../../../apps/web/lib/sem-resposta";

/** Regra pura, sem banco: quando uma conversa está "sem resposta" e em que estágio está o alerta. */

describe("alerta de conversa sem resposta: estágios", () => {
  test("abaixo do limite não alerta", () => {
    assert.equal(estagioDoAlerta(0, 15), 0);
    assert.equal(estagioDoAlerta(14, 15), 0);
  });

  test("no limite avisa o responsável (estágio 1)", () => {
    assert.equal(estagioDoAlerta(15, 15), 1);
    assert.equal(estagioDoAlerta(29, 15), 1);
  });

  test("ao dobro do limite avisa também a gestão (estágio 2)", () => {
    assert.equal(estagioDoAlerta(30, 15), 2);
    assert.equal(estagioDoAlerta(600, 15), 2);
  });

  test("conversa parada há mais de um dia é backlog e não alerta", () => {
    assert.equal(estagioDoAlerta(24 * 60, 15), 2);
    assert.equal(estagioDoAlerta(24 * 60 + 1, 15), 0);
  });

  test("limite inválido ou desligado nunca alerta", () => {
    assert.equal(estagioDoAlerta(60, 0), 0);
    assert.equal(estagioDoAlerta(60, -5), 0);
    assert.equal(estagioDoAlerta(Number.NaN, 15), 0);
  });

  test("minutosEntre arredonda para baixo e nunca fica negativo", () => {
    const base = new Date("2026-11-10T12:00:00Z");
    assert.equal(minutosEntre(base, new Date("2026-11-10T12:14:59Z")), 14);
    assert.equal(minutosEntre(base, new Date("2026-11-10T11:00:00Z")), 0);
  });

  test("texto da espera", () => {
    assert.equal(textoDaEspera(15), "15 min");
    assert.equal(textoDaEspera(60), "1h");
    assert.equal(textoDaEspera(80), "1h20");
    assert.equal(textoDaEspera(125), "2h05");
    assert.equal(textoWeb(80), "1h20");
  });
});

describe("selo sem resposta no Inbox", () => {
  const agora = new Date("2026-11-10T15:00:00Z");
  const entrada = (minutosAtras: number) => ({
    direction: "INBOUND" as const,
    createdAt: new Date(agora.getTime() - minutosAtras * 60_000).toISOString(),
  });

  test("aparece quando a última é do cliente e passou do limite", () => {
    assert.equal(esperaSemResposta("OPEN", entrada(20), 15, agora), 20);
  });

  test("não aparece antes do limite", () => {
    assert.equal(esperaSemResposta("OPEN", entrada(5), 15, agora), null);
  });

  test("não aparece quando a última mensagem é nossa", () => {
    const saida = { direction: "OUTBOUND" as const, createdAt: entrada(60).createdAt };
    assert.equal(esperaSemResposta("OPEN", saida, 15, agora), null);
  });

  test("só conta conversa aberta", () => {
    assert.equal(esperaSemResposta("RESOLVED", entrada(60), 15, agora), null);
    assert.equal(esperaSemResposta("PENDING", entrada(60), 15, agora), null);
  });

  test("empresa sem limite (desligado) nunca mostra o selo", () => {
    assert.equal(esperaSemResposta("OPEN", entrada(60), null, agora), null);
    assert.equal(esperaSemResposta("OPEN", entrada(60), 0, agora), null);
    assert.equal(esperaSemResposta("OPEN", entrada(60), undefined, agora), null);
  });

  test("conversa velha de mais de um dia não mostra o selo", () => {
    assert.equal(esperaSemResposta("OPEN", entrada(24 * 60 + 5), 15, agora), null);
  });

  test("conversa sem mensagem não quebra", () => {
    assert.equal(esperaSemResposta("OPEN", undefined, 15, agora), null);
  });
});
