// Decisão da sincronização. Rodar com: npx tsx packages/portais/src/decisao.test-manual.ts
import { decidir, deveEstarNoAr, hashDoAnuncio, proximaTentativa, type EstadoPublicacao } from "./decisao";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}
const agora = new Date("2026-11-12T12:00:00Z");
const base: EstadoPublicacao = { ativo: true, status: "FILA", hashEnviado: null, idExterno: null, proximaTentativaEm: null };
const h = hashDoAnuncio({ preco: 1 });

checa("novo na fila envia", decidir(base, true, h, agora), "enviar");
checa("sem dados fica bloqueado", decidir(base, true, null, agora), "bloqueado");
checa("publicado sem mudança", decidir({ ...base, status: "PUBLICADO", hashEnviado: h }, true, h, agora), "nada");
checa("publicado com mudança reenvia", decidir({ ...base, status: "PUBLICADO", hashEnviado: h }, true, hashDoAnuncio({ preco: 2 }), agora), "enviar");
checa("lote em andamento aguarda", decidir({ ...base, status: "ENVIADO" }, true, h, agora), "aguardar");
checa("removendo aguarda", decidir({ ...base, status: "REMOVENDO" }, false, null, agora), "aguardar");
const erro = { ...base, status: "ERRO" as const, hashEnviado: h, proximaTentativaEm: new Date(agora.getTime() + 60_000) };
checa("erro espera a vez", decidir(erro, true, h, agora), "aguardar");
checa("erro com ficha corrigida tenta já", decidir(erro, true, hashDoAnuncio({ preco: 3 }), agora), "enviar");
checa("erro vencido tenta de novo", decidir({ ...erro, proximaTentativaEm: new Date(agora.getTime() - 1) }, true, h, agora), "enviar");
checa("vendido e publicado remove", decidir({ ...base, status: "PUBLICADO", hashEnviado: h, idExterno: "123" }, false, h, agora), "remover");
checa("vendido sem nunca ter ido descarta", decidir(base, false, h, agora), "descartar");
checa("erro sem nunca ter sido aceito descarta", decidir({ ...erro, ativo: false }, false, h, agora), "descartar");
checa("já removido", decidir({ ...base, status: "REMOVIDO", hashEnviado: h }, false, h, agora), "nada");
checa("removido volta ao estoque reenvia", decidir({ ...base, status: "REMOVIDO", hashEnviado: h }, true, h, agora), "enviar");
checa("disponível e ativo no ar", deveEstarNoAr("DISPONIVEL", true), true);
checa("reservado sai", deveEstarNoAr("RESERVADO", true), false);
checa("desligado sai", deveEstarNoAr("DISPONIVEL", false), false);
checa("hash estável", hashDoAnuncio({ a: 1 }), hashDoAnuncio({ a: 1 }));
const min = (t: number) => (proximaTentativa(t, agora).getTime() - agora.getTime()) / 60_000;
checa("espera cresce", [min(1), min(2), min(3), min(20)], [5, 10, 20, 360]);

console.log(falhas === 0 ? "\ntudo certo" : `\n${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
