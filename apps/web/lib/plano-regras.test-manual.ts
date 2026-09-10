// Regras de plano: recursos efetivos e limite de atendentes. Puro, sem banco.
// Rodar com: npx tsx apps/web/lib/plano-regras.test-manual.ts
import { recursosEfetivos, limiteDeAtendentes, type Recurso } from "./plano-regras";

let falhas = 0;
function checa(nome: string, obtido: unknown, esperado: unknown) {
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"}  ${nome}${ok ? "" : `  (obtido ${JSON.stringify(obtido)}, esperado ${JSON.stringify(esperado)})`}`);
}

const lista = (s: Set<Recurso>) => [...s].sort();
const TODOS = ["CONTAS_RECEBER", "INTEGRACAO_API", "PEDIDOS", "SETORES", "URA"];

// ---------------------------------------------------------------------------
// A promessa por escrito. É o teste que não pode quebrar.
// ---------------------------------------------------------------------------

checa(
  "cliente da regra antiga no Essencial tem TUDO",
  lista(recursosEfetivos({ plano: "ESSENCIAL", plataformaCompleta: true }, [])),
  TODOS
);

checa(
  "empresa sem assinatura (legado nunca cadastrado) tem tudo — não trava Hemoderi, Sales, Vai Viajar",
  lista(recursosEfetivos(null, [])),
  TODOS
);

// ---------------------------------------------------------------------------
// A escada dos planos novos.
// ---------------------------------------------------------------------------

checa(
  "Essencial novo não tem módulo de gestão",
  lista(recursosEfetivos({ plano: "ESSENCIAL", plataformaCompleta: false }, [])),
  []
);
checa(
  "Profissional novo: triagem, setores, pedidos e a receber",
  lista(recursosEfetivos({ plano: "PROFISSIONAL", plataformaCompleta: false }, [])),
  ["CONTAS_RECEBER", "PEDIDOS", "SETORES", "URA"]
);
checa(
  "Profissional novo NÃO tem integração",
  recursosEfetivos({ plano: "PROFISSIONAL", plataformaCompleta: false }, []).has("INTEGRACAO_API"),
  false
);
checa(
  "Escala novo tem tudo",
  lista(recursosEfetivos({ plano: "ESCALA", plataformaCompleta: false }, [])),
  TODOS
);

// ---------------------------------------------------------------------------
// Exceções por empresa, por cima do plano.
// ---------------------------------------------------------------------------

checa(
  "exceção liga a integração num Profissional (a Hemoderi com o Dilon Saúde)",
  recursosEfetivos({ plano: "PROFISSIONAL", plataformaCompleta: false }, [
    { recurso: "INTEGRACAO_API", ativo: true },
  ]).has("INTEGRACAO_API"),
  true
);
checa(
  "exceção desliga Pedidos num Escala (empresa que não quer o módulo no menu)",
  recursosEfetivos({ plano: "ESCALA", plataformaCompleta: false }, [
    { recurso: "PEDIDOS", ativo: false },
  ]).has("PEDIDOS"),
  false
);
checa(
  "exceção desliga até em cliente da regra antiga (é pedido dele, não perda)",
  recursosEfetivos({ plano: "ESSENCIAL", plataformaCompleta: true }, [
    { recurso: "PEDIDOS", ativo: false },
  ]).has("PEDIDOS"),
  false
);
checa(
  "exceção só mexe no recurso dela — o resto do plano fica",
  lista(
    recursosEfetivos({ plano: "PROFISSIONAL", plataformaCompleta: false }, [
      { recurso: "PEDIDOS", ativo: false },
    ])
  ),
  ["CONTAS_RECEBER", "SETORES", "URA"]
);

// ---------------------------------------------------------------------------
// Limite de atendentes. Vale pra todos, inclusive a regra antiga: atendente
// sempre foi o que diferenciava os planos, e plataforma completa é software.
// ---------------------------------------------------------------------------

checa("Essencial: 3", limiteDeAtendentes({ plano: "ESSENCIAL", plataformaCompleta: false }), 3);
checa("Profissional: 8", limiteDeAtendentes({ plano: "PROFISSIONAL", plataformaCompleta: false }), 8);
checa("Escala: ilimitado", limiteDeAtendentes({ plano: "ESCALA", plataformaCompleta: false }), null);
checa(
  "regra antiga NÃO ganha atendente ilimitado — segue o plano cadastrado",
  limiteDeAtendentes({ plano: "ESSENCIAL", plataformaCompleta: true }),
  3
);
checa("sem assinatura: não trava quem já opera", limiteDeAtendentes(null), null);

console.log(falhas === 0 ? "\ntudo certo" : `\n${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
