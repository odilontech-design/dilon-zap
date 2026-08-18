// Tabela de decisão do nome do contato. Os casos vêm dos requisitos, não da
// implementação: cada um descreve uma situação real relatada ou prevista, e
// diz o que a atendente PRECISA ver na tela depois.
//
// Rodar: npx tsx apps/worker/src/nome-contato.test-manual.ts

type Contato = { name: string | null; waName: string | null; nameManual: boolean };

// Mesma decisão do aplicarNomeDaAgenda em session-manager.ts.
function decidir(contato: Contato, nomeAgenda?: string, pushName?: string) {
  const nome = nomeAgenda || pushName;
  if (!nome) return { escreve: false, nome: contato.name };
  if (contato.waName === nome) return { escreve: false, nome: contato.name };
  const podeReescrever = !contato.nameManual && (Boolean(nomeAgenda) || !contato.name);
  return { escreve: podeReescrever, nome: podeReescrever ? nome : contato.name };
}

let falhas = 0;
function caso(
  descricao: string,
  contato: Contato,
  entrada: { agenda?: string; push?: string },
  nomeEsperado: string | null
) {
  const r = decidir(contato, entrada.agenda, entrada.push);
  const ok = r.nome === nomeEsperado;
  if (!ok) falhas++;
  console.log(
    `${ok ? "ok   " : "FALHA"}  ${descricao}` +
      (ok ? "" : `\n         esperado ${JSON.stringify(nomeEsperado)}, obtido ${JSON.stringify(r.nome)}`)
  );
}

// O RELATO DA CAMILA: ela corrige o nome no Dilon Zap e ele volta sozinho
// pro nome que a cliente usa na conta dela.
caso(
  "nome editado no sistema resiste ao pushName da cliente",
  { name: "Dc2 Sheila vieira", waName: "Sheila", nameManual: true },
  { push: "Sheila" },
  "Dc2 Sheila vieira"
);
caso(
  "nome editado no sistema resiste ate a agenda do celular",
  { name: "Dc2 Sheila vieira", waName: null, nameManual: true },
  { agenda: "Sheila V." },
  "Dc2 Sheila vieira"
);

// O CASO QUE PASSAVA DESPERCEBIDO: contato que nunca foi editado no sistema,
// mas tem nome vindo da agenda. O pushName nao pode derrubar.
caso(
  "pushName nao substitui nome que ja existe",
  { name: "Dc2 Sheila vieira", waName: null, nameManual: false },
  { push: "Sheila" },
  "Dc2 Sheila vieira"
);

// A DEMANDA ORIGINAL: salvou o contato no celular, tem que aparecer aqui.
caso(
  "agenda do celular atualiza contato sem edicao manual",
  { name: "Sheila", waName: "Sheila", nameManual: false },
  { agenda: "Dc2 Sheila vieira" },
  "Dc2 Sheila vieira"
);
caso(
  "agenda funciona ja na primeira sincronizacao, sem penalidade",
  { name: "Sheila", waName: null, nameManual: false },
  { agenda: "Dc2 Sheila vieira" },
  "Dc2 Sheila vieira"
);

// CONTATO NOVO: qualquer nome e melhor que nenhum.
caso(
  "pushName preenche contato sem nome",
  { name: null, waName: null, nameManual: false },
  { push: "Sheila" },
  "Sheila"
);
caso(
  "agenda preenche contato sem nome",
  { name: null, waName: null, nameManual: false },
  { agenda: "Dc2 Sheila vieira" },
  "Dc2 Sheila vieira"
);

// RUIDO: o WhatsApp reenvia a lista inteira a cada sincronizacao.
caso(
  "nada muda quando o WhatsApp repete o mesmo nome",
  { name: "Dc2 Sheila vieira", waName: "Dc2 Sheila vieira", nameManual: false },
  { agenda: "Dc2 Sheila vieira" },
  "Dc2 Sheila vieira"
);
caso(
  "evento sem nome nenhum nao apaga o que existe",
  { name: "Dc2 Sheila vieira", waName: null, nameManual: false },
  {},
  "Dc2 Sheila vieira"
);

console.log(falhas === 0 ? "\nPASSOU" : `\n${falhas} FALHA(S)`);
