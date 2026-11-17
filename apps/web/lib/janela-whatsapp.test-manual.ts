// Regras puras da janela do WhatsApp: custo estimado, percentual fora e teto sugerido. Sem banco.
// Rodar com: npx tsx apps/web/lib/janela-whatsapp.test-manual.ts
import assert from "node:assert/strict";
import { PRECOS_PADRAO, estimarCusto, fora, percentualFora, sugerirTetos } from "./janela-whatsapp-regras";

const hemoderi = { enviadas: 12115, dentro: 9417, reabertura: 2320, semPrevia: 378 };
assert.equal(fora(hemoderi), 2698);
assert.equal(percentualFora(hemoderi), 22.3);
assert.equal(percentualFora({ enviadas: 0, reabertura: 0, semPrevia: 0 }), 0);

const c = estimarCusto(1000, PRECOS_PADRAO);
assert.ok(Math.abs(c.pisoUsd - 6.8) < 1e-9);
assert.ok(Math.abs(c.tetoUsd - 62.5) < 1e-9);
assert.ok(Math.abs(c.pisoBrl - 6.8 * 5.5) < 1e-9);
assert.deepEqual(estimarCusto(0), { pisoUsd: 0, tetoUsd: 0, pisoBrl: 0, tetoBrl: 0 });

// Piso de 40 por hora no total e de 10 fora da janela; teto de 40 fora da janela; arredonda para cima.
assert.deepEqual(sugerirTetos({ p95PorHora: 5, p95ForaPorHora: 0 }), { totalPorHora: 40, foraPorHora: 10 });
assert.deepEqual(sugerirTetos({ p95PorHora: 100, p95ForaPorHora: 10 }), { totalPorHora: 130, foraPorHora: 15 });
assert.deepEqual(sugerirTetos({ p95PorHora: 500, p95ForaPorHora: 90 }), { totalPorHora: 650, foraPorHora: 40 });
console.log("janela-whatsapp: ok");
