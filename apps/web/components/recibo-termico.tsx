import type { Recibo } from "@/lib/recibo";

/**
 * O papel do recibo, pronto pra impressora térmica.
 *
 * Sem hook e sem estado: renderiza igual no servidor e no teste, e quem
 * decide quando imprimir é a página.
 *
 * As regras de impressão térmica que moldam o CSS:
 *  - Só preto puro. A cabeça térmica não tem cinza: cinza vira pontilhado
 *    claro ou some. Hierarquia sai de peso e tamanho, nunca de cor.
 *  - Nada de fundo preenchido. Faixa preta gasta papel, esquenta a cabeça
 *    e borra; e a maioria dos navegadores nem imprime fundo.
 *  - Largura em mm, não em px: a área útil da bobina de 80 é ~72 mm, a da
 *    de 58 é ~48 mm. Passar disso a impressora corta a lateral do texto.
 *  - Fonte do sistema. Fonte baixada pode não carregar antes do print() e o
 *    papel sairia com a fonte de fallback, noutra largura.
 */

const ESTILO = `
.recibo {
  --util: 72mm;
  --corpo: 12px;
  width: var(--util);
  margin: 0 auto;
  padding: 3mm 0 8mm;
  box-sizing: border-box;
  font-family: Arial, Helvetica, "Liberation Sans", sans-serif;
  font-size: var(--corpo);
  line-height: 1.3;
  color: #000;
  background: #fff;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.recibo[data-largura="58"] { --util: 48mm; --corpo: 10.5px; }
.recibo * { color: #000; box-sizing: border-box; }
.recibo .centro { text-align: center; }
.recibo .empresa { font-size: 1.25em; font-weight: 700; line-height: 1.2; text-wrap: balance; }
.recibo .miudo { font-size: 0.88em; }
.recibo .forte { font-weight: 700; }
.recibo .corte { border: 0; border-top: 1px dashed #000; margin: 2mm 0; }
.recibo .par { display: flex; gap: 1.5mm; }
.recibo .par > :first-child { font-weight: 700; flex-shrink: 0; }
.recibo .par > :last-child { overflow-wrap: anywhere; }
.recibo .linha { display: flex; justify-content: space-between; gap: 2mm; }
.recibo .linha > :last-child { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.recibo .cabecalho-itens { font-weight: 700; font-size: 0.88em; text-transform: uppercase; letter-spacing: 0.04em; }
.recibo .item { padding: 0.8mm 0; }
.recibo .item + .item { border-top: 1px dotted #000; }
.recibo .item-nome { font-weight: 700; overflow-wrap: anywhere; }
.recibo .total { font-size: 1.45em; font-weight: 700; margin-top: 1mm; }
.recibo .selo { border: 1.5px solid #000; text-align: center; font-weight: 700; letter-spacing: 0.08em; padding: 1mm; margin: 2.5mm 0 1.5mm; }
.recibo .texto-livre { white-space: pre-line; overflow-wrap: anywhere; }
.recibo .assinatura { font-size: 0.8em; margin-top: 2mm; }
`;

export function ReciboTermico({ recibo }: { recibo: Recibo }) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: ESTILO }} />
      <div className="recibo" data-largura={recibo.larguraMm}>
        <header className="centro">
          <div className="empresa">{recibo.empresa.nome}</div>
          {recibo.empresa.linhas.map((l) => (
            <div key={l} className="miudo texto-livre">
              {l}
            </div>
          ))}
        </header>

        <hr className="corte" />

        <div className="centro forte">COMPROVANTE DE PEDIDO</div>
        <div className="linha">
          <span className="forte">{recibo.titulo}</span>
          <span>{recibo.dataHora}</span>
        </div>

        {recibo.cliente.length > 0 && (
          <>
            <hr className="corte" />
            {recibo.cliente.map((l) => (
              <div key={l.rotulo} className="par">
                <span>{l.rotulo}:</span>
                <span>{l.valor}</span>
              </div>
            ))}
          </>
        )}

        <hr className="corte" />

        <div className="linha cabecalho-itens">
          <span>Qtd x Unitário</span>
          <span>Total</span>
        </div>
        {recibo.itens.map((item, i) => (
          <div key={i} className="item">
            <div className="item-nome">{item.nome}</div>
            <div className="linha">
              <span>{item.detalhe}</span>
              <span>{item.total}</span>
            </div>
            {item.ajuste && (
              <div className="linha miudo">
                <span />
                <span>{item.ajuste}</span>
              </div>
            )}
          </div>
        ))}
        <div className="miudo" style={{ marginTop: "1mm" }}>
          Qtd. de itens: {recibo.quantidadeDeItens}
        </div>

        <hr className="corte" />

        {recibo.totais.map((t) => (
          <div key={t.rotulo} className={t.destaque ? "linha total" : "linha"}>
            <span>{t.rotulo}</span>
            <span>{t.valor}</span>
          </div>
        ))}

        <div className="selo">{recibo.situacao === "PAGO" ? "PAGO" : "PAGAMENTO PENDENTE"}</div>
        {recibo.pagamento.map((l) => (
          <div key={l.rotulo} className="linha">
            <span>{l.rotulo}</span>
            <span>{l.valor}</span>
          </div>
        ))}

        {(recibo.vendedor || recibo.observacao) && <hr className="corte" />}
        {recibo.vendedor && (
          <div className="par">
            <span>Atendido por:</span>
            <span>{recibo.vendedor}</span>
          </div>
        )}
        {recibo.observacao && (
          <div className="par">
            <span>Obs.:</span>
            <span className="texto-livre">{recibo.observacao}</span>
          </div>
        )}

        <hr className="corte" />

        {recibo.rodape && <div className="centro texto-livre">{recibo.rodape}</div>}
        <div className="centro forte miudo" style={{ marginTop: recibo.rodape ? "2mm" : 0 }}>
          NÃO É DOCUMENTO FISCAL
        </div>
        <div className="centro assinatura">Dilon Zap</div>
      </div>
    </>
  );
}
