"use client";

/**
 * Gráficos do painel de relatórios.
 *
 * SVG na mão em vez de biblioteca: são três fatias e meia dúzia de barras, e
 * uma dependência de gráfico custaria mais no bundle do que o desenho inteiro.
 *
 * As cores saem da paleta categórica validada (slots 1 a 3), conferidas contra
 * a superfície real do app nos dois temas — claro e escuro passam em faixa de
 * luminosidade, croma, separação para daltonismo e piso de visão normal. No
 * tema claro o verde-água fica abaixo de 3:1 de contraste, e por isso todo
 * gráfico aqui vem com rótulo escrito e tabela ao lado: a leitura nunca
 * depende só da cor.
 */

const FATIA_MINIMA_GRAUS = 0.5;

/** Fatia com valor zero não é desenhada — um traço invisível na borda confunde a contagem da legenda. */
function arco(cx: number, cy: number, raio: number, inicio: number, fim: number, interno: number) {
  const p = (ang: number, r: number) => {
    const rad = ((ang - 90) * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  };
  const grande = fim - inicio > 180 ? 1 : 0;
  const [x1, y1] = p(inicio, raio);
  const [x2, y2] = p(fim, raio);
  const [x3, y3] = p(fim, interno);
  const [x4, y4] = p(inicio, interno);
  return [
    `M ${x1} ${y1}`,
    `A ${raio} ${raio} 0 ${grande} 1 ${x2} ${y2}`,
    `L ${x3} ${y3}`,
    `A ${interno} ${interno} 0 ${grande} 0 ${x4} ${y4}`,
    "Z",
  ].join(" ");
}

export type Fatia = { rotulo: string; valor: number; cor: string };

/**
 * Rosca das conversas por situação.
 *
 * Rosca e não pizza cheia porque o buraco carrega o total — o número que
 * responde "quantas conversas ao todo" sem precisar de mais um cartão.
 *
 * A legenda traz o valor exato de cada fatia. É o que impede a comparação de
 * depender do ângulo, que é justamente onde a pizza falha quando duas fatias
 * ficam parecidas.
 */
export function Rosca({ fatias, titulo }: { fatias: Fatia[]; titulo: string }) {
  const total = fatias.reduce((s, f) => s + f.valor, 0);

  if (total === 0) {
    return (
      <p className="rounded-lg border border-neutral-200 bg-surface px-4 py-8 text-center text-sm text-neutral-400">
        Nenhuma conversa registrada ainda.
      </p>
    );
  }

  let angulo = 0;
  const desenhadas = fatias
    .filter((f) => f.valor > 0)
    .map((f) => {
      const graus = (f.valor / total) * 360;
      const inicio = angulo;
      angulo += graus;
      return { ...f, inicio, fim: angulo, pct: (f.valor / total) * 100 };
    });

  return (
    <div className="flex flex-col items-center gap-5 rounded-lg border border-neutral-200 bg-surface p-5 sm:flex-row sm:items-center sm:gap-8">
      <svg viewBox="0 0 160 160" className="h-40 w-40 shrink-0" role="img" aria-label={titulo}>
        {desenhadas.map((f) => {
          const graus = f.fim - f.inicio;
          if (graus < FATIA_MINIMA_GRAUS) return null;

          const dica = `${f.rotulo}: ${f.valor} (${f.pct.toFixed(0)}%)`;

          // Uma fatia sozinha ocupando a volta inteira é o caso degenerado do
          // arco: início e fim caem no MESMO ponto, e o caminho fecha em nada
          // — o anel some e sobra um risco. Acontece sempre que um estado
          // concentra 100%, o que num dia sem conversa aberta é o normal, não
          // a exceção. Círculo com traço grosso é o mesmo anel, sem o arco.
          if (graus >= 360 - FATIA_MINIMA_GRAUS) {
            return (
              <circle
                key={f.rotulo}
                cx="80"
                cy="80"
                r="59"
                fill="none"
                stroke={f.cor}
                strokeWidth="26"
              >
                <title>{dica}</title>
              </circle>
            );
          }

          return (
            <path
              key={f.rotulo}
              d={arco(80, 80, 72, f.inicio, f.fim, 46)}
              fill={f.cor}
              // Contorno na cor da superfície: é o vão de 2px entre fatias
              // vizinhas, que separa duas cores parecidas sem inventar borda.
              stroke="rgb(var(--surface))"
              strokeWidth="2"
            >
              <title>{dica}</title>
            </path>
          );
        })}
        <text
          x="80"
          y="74"
          textAnchor="middle"
          className="fill-neutral-900 text-[26px] font-semibold"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {total}
        </text>
        <text x="80" y="92" textAnchor="middle" className="fill-neutral-500 text-[11px]">
          conversas
        </text>
      </svg>

      <ul className="flex w-full flex-col gap-2.5">
        {desenhadas.map((f) => (
          <li key={f.rotulo} className="flex items-center gap-2.5 text-sm">
            <span
              aria-hidden
              className="h-3 w-3 shrink-0 rounded-[3px]"
              style={{ background: f.cor }}
            />
            <span className="flex-1 text-neutral-700">{f.rotulo}</span>
            <span className="tabular-nums font-medium text-neutral-900">{f.valor}</span>
            <span className="w-10 text-right tabular-nums text-xs text-neutral-400">
              {f.pct.toFixed(0)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export type PontoDia = { dia: string; recebidas: number; enviadas: number };

/**
 * Mensagens por dia, duas linhas: recebidas e enviadas.
 *
 * Linha porque o eixo é tempo contínuo e o que interessa é a forma — se o
 * movimento está subindo, se segunda é sempre cheia, se teve um buraco. Barra
 * por dia daria a mesma informação pedindo mais tinta.
 *
 * Um eixo só. Recebidas e enviadas são a mesma unidade e a mesma ordem de
 * grandeza, então dividem a escala — dois eixos fariam a distância entre as
 * curvas parecer o que a escala escolheu, não o que os dados dizem.
 */
export function LinhaDoTempo({
  pontos,
  series,
  titulo,
}: {
  pontos: PontoDia[];
  series: { rotulo: string; cor: string }[];
  titulo: string;
}) {
  const L = 34;
  const R = 8;
  const T = 10;
  const B = 22;
  const LARG = 560;
  const ALT = 170;
  const plotW = LARG - L - R;
  const plotH = ALT - T - B;

  const maiorReal = Math.max(...pontos.flatMap((p) => [p.recebidas, p.enviadas]), 0);
  // Teto arredondado pra cima: um eixo terminando em 37 dá três marcas com
  // número quebrado e nenhuma delas ajuda a ler.
  const passo = maiorReal <= 10 ? 2 : maiorReal <= 50 ? 10 : maiorReal <= 200 ? 50 : 100;
  const teto = Math.max(passo, Math.ceil(maiorReal / passo) * passo);

  const x = (i: number) => L + (pontos.length === 1 ? plotW / 2 : (i / (pontos.length - 1)) * plotW);
  const y = (v: number) => T + plotH - (v / teto) * plotH;

  const caminho = (chave: "recebidas" | "enviadas") =>
    pontos.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(p[chave]).toFixed(1)}`).join(" ");

  const marcas = Array.from({ length: teto / passo + 1 }, (_, i) => i * passo);

  // Rótulo em todo dia vira borrão. Marca as pontas e o meio, que é o
  // suficiente pra situar; a data exata sai no tooltip de cada ponto.
  const diasRotulados = new Set([0, Math.floor((pontos.length - 1) / 2), pontos.length - 1]);
  const curto = (dia: string) => {
    const [, m, d] = dia.split("-");
    return `${d}/${m}`;
  };

  const vazio = maiorReal === 0;

  return (
    <div className="rounded-lg border border-neutral-200 bg-surface p-5">
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs">
        {series.map((s) => (
          <span key={s.rotulo} className="flex items-center gap-1.5 text-neutral-600">
            <span aria-hidden className="h-2.5 w-2.5 rounded-[3px]" style={{ background: s.cor }} />
            {s.rotulo}
          </span>
        ))}
      </div>

      {vazio ? (
        <p className="py-8 text-center text-sm text-neutral-400">
          Nenhuma mensagem nos últimos {pontos.length} dias.
        </p>
      ) : (
        <svg viewBox={`0 0 ${LARG} ${ALT}`} className="w-full" role="img" aria-label={titulo}>
          {marcas.map((m) => (
            <g key={m}>
              {/* Grade recessiva: serve pra medir, não pra ser vista. */}
              <line x1={L} x2={LARG - R} y1={y(m)} y2={y(m)} stroke="currentColor" className="text-neutral-200" strokeWidth="1" />
              <text x={L - 6} y={y(m) + 3.5} textAnchor="end" className="fill-neutral-400 text-[10px]" style={{ fontVariantNumeric: "tabular-nums" }}>
                {m}
              </text>
            </g>
          ))}

          {pontos.map((p, i) =>
            diasRotulados.has(i) ? (
              <text
                key={p.dia}
                x={x(i)}
                y={ALT - 6}
                // Centralizar TODOS cortaria as pontas: o rótulo do último dia
                // fica sobre a borda direita e metade dele cai fora da área
                // desenhada — sai "10/0" no lugar de "10/09". Primeiro e
                // último se ancoram pra dentro.
                textAnchor={i === 0 ? "start" : i === pontos.length - 1 ? "end" : "middle"}
                className="fill-neutral-400 text-[10px]"
              >
                {curto(p.dia)}
              </text>
            ) : null
          )}

          {(["recebidas", "enviadas"] as const).map((chave, s) => (
            <path
              key={chave}
              d={caminho(chave)}
              fill="none"
              stroke={series[s].cor}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}

          {/* Alvo de toque bem maior que o ponto: a bolinha tem 3px, e
              ninguém acerta 3px com o dedo nem com o mouse apressado. */}
          {pontos.map((p, i) => (
            <g key={p.dia}>
              {(["recebidas", "enviadas"] as const).map((chave, s) => (
                <circle key={chave} cx={x(i)} cy={y(p[chave])} r="3" fill={series[s].cor} />
              ))}
              <rect
                x={x(i) - plotW / pontos.length / 2}
                y={T}
                width={plotW / pontos.length}
                height={plotH}
                fill="transparent"
              >
                <title>{`${curto(p.dia)} · ${p.recebidas} recebidas, ${p.enviadas} enviadas`}</title>
              </rect>
            </g>
          ))}
        </svg>
      )}
    </div>
  );
}

export type BarraItem = { rotulo: string; valores: number[] };

/**
 * Barras horizontais agrupadas, uma linha por atendente.
 *
 * Horizontal porque o rótulo é nome de gente: na vertical o nome vira texto
 * inclinado ou cortado, e ninguém lê gráfico torcendo o pescoço.
 *
 * O valor vai escrito na ponta de cada barra. A barra mostra a proporção; o
 * número é que responde "quantas".
 */
export function BarrasAgrupadas({
  itens,
  series,
  titulo,
}: {
  itens: BarraItem[];
  series: { rotulo: string; cor: string }[];
  titulo: string;
}) {
  const maior = Math.max(1, ...itens.flatMap((i) => i.valores));

  return (
    <div className="rounded-lg border border-neutral-200 bg-surface p-5">
      <div className="mb-4 flex flex-wrap items-center gap-4 text-xs">
        {series.map((s) => (
          <span key={s.rotulo} className="flex items-center gap-1.5 text-neutral-600">
            <span aria-hidden className="h-2.5 w-2.5 rounded-[3px]" style={{ background: s.cor }} />
            {s.rotulo}
          </span>
        ))}
      </div>

      <div className="flex flex-col gap-3.5" role="img" aria-label={titulo}>
        {itens.map((item) => (
          <div key={item.rotulo}>
            <p className="mb-1 text-sm text-neutral-700">{item.rotulo}</p>
            <div className="flex flex-col gap-1">
              {item.valores.map((v, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-neutral-100">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${(v / maior) * 100}%`, background: series[i].cor }}
                      title={`${item.rotulo} · ${series[i].rotulo}: ${v}`}
                    />
                  </div>
                  <span className="w-8 shrink-0 text-right text-xs tabular-nums text-neutral-600">
                    {v}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
