import type { Recibo } from "./recibo";

/**
 * Recibo visual para enviar como imagem pelo WhatsApp.
 *
 * Usa JSX compatível com satori/next-og (subset de CSS com inline styles).
 * Não tem hook nem estado — entrada pura, saída JSX.
 */
export function ReciboImagemJSX({
  recibo,
  qrPix,
}: {
  recibo: Recibo;
  /** QR do PIX já rasterizado como data URI. Ver recibo-render.tsx. */
  qrPix?: string | null;
}) {
  const accentColor = "#0d9488";
  const bgColor = "#ffffff";
  const textColor = "#1e293b";
  const mutedColor = "#64748b";
  const lightBorder = "#e2e8f0";
  const lightBg = "#f8fafc";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: 600,
        backgroundColor: bgColor,
        fontFamily: "Arial, Helvetica, sans-serif",
        color: textColor,
        padding: 0,
      }}
    >
      {/* Header com acento */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          backgroundColor: accentColor,
          color: "#ffffff",
          padding: "28px 32px 24px",
        }}
      >
        <div style={{ fontSize: 22, fontWeight: 700, textAlign: "center" }}>{recibo.empresa.nome}</div>
        {recibo.empresa.linhas.map((l, i) => (
          <div key={i} style={{ fontSize: 13, opacity: 0.9, marginTop: 2, textAlign: "center" }}>
            {l}
          </div>
        ))}
      </div>

      {/* Título + data */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "16px 28px",
          borderBottom: `1px solid ${lightBorder}`,
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 700 }}>{recibo.titulo}</div>
        <div style={{ fontSize: 13, color: mutedColor }}>{recibo.dataHora}</div>
      </div>

      {/* Cliente */}
      {recibo.cliente.length > 0 && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            padding: "14px 28px",
            backgroundColor: lightBg,
            borderBottom: `1px solid ${lightBorder}`,
            gap: 4,
          }}
        >
          {recibo.cliente.map((l) => (
            <div key={l.rotulo} style={{ display: "flex", fontSize: 13, gap: 6 }}>
              <span style={{ fontWeight: 700, flexShrink: 0 }}>{`${l.rotulo}:`}</span>
              <span>{l.valor}</span>
            </div>
          ))}
        </div>
      )}

      {/* Itens */}
      <div style={{ display: "flex", flexDirection: "column", padding: "14px 28px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: 11,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: 0.5,
            color: mutedColor,
            paddingBottom: 8,
            borderBottom: `1px solid ${lightBorder}`,
          }}
        >
          <span>Produto / Serviço</span>
          <span>Total</span>
        </div>

        {recibo.itens.map((item, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              flexDirection: "column",
              padding: "10px 0",
              borderBottom: i < recibo.itens.length - 1 ? `1px dotted ${lightBorder}` : "none",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ display: "flex", flexDirection: "column", flex: 1, paddingRight: 12 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{item.nome}</span>
                <span style={{ fontSize: 12, color: mutedColor }}>{item.detalhe}</span>
              </div>
              <span style={{ fontSize: 14, fontWeight: 600, flexShrink: 0 }}>{item.total}</span>
            </div>
            {item.ajuste && (
              <span style={{ fontSize: 11, color: accentColor, marginTop: 2 }}>{item.ajuste}</span>
            )}
          </div>
        ))}

        <div
          style={{
            fontSize: 12,
            color: mutedColor,
            paddingTop: 6,
            borderTop: `1px solid ${lightBorder}`,
          }}
        >
          {`Qtd. de itens: ${recibo.quantidadeDeItens}`}
        </div>
      </div>

      {/* Totais */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          padding: "16px 28px",
          backgroundColor: lightBg,
          borderTop: `1px solid ${lightBorder}`,
          gap: 6,
        }}
      >
        {recibo.totais.map((t) =>
          t.destaque ? (
            <div
              key={t.rotulo}
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 24,
                fontWeight: 700,
                color: accentColor,
                marginTop: 4,
              }}
            >
              <span>{t.rotulo}</span>
              <span>{t.valor}</span>
            </div>
          ) : (
            <div
              key={t.rotulo}
              style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: 14,
                color: mutedColor,
              }}
            >
              <span>{t.rotulo}</span>
              <span>{t.valor}</span>
            </div>
          )
        )}
      </div>

      {/* Selo de status */}
      <div style={{ display: "flex", justifyContent: "center", padding: "16px 28px 8px" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            fontSize: 14,
            fontWeight: 700,
            letterSpacing: 1,
            padding: "8px 32px",
            borderRadius: 6,
            backgroundColor: recibo.situacao === "PAGO" ? "#dcfce7" : "#fef9c3",
            color: recibo.situacao === "PAGO" ? "#166534" : "#854d0e",
            border: `1.5px solid ${recibo.situacao === "PAGO" ? "#86efac" : "#fde047"}`,
          }}
        >
          {recibo.situacao === "PAGO" ? "PAGO" : "PAGAMENTO PENDENTE"}
        </div>
      </div>

      {/* Pagamento */}
      {recibo.pagamento.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", padding: "8px 28px 12px", gap: 4 }}>
          {recibo.pagamento.map((l) => (
            <div
              key={l.rotulo}
              style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: mutedColor }}
            >
              <span>{l.rotulo}</span>
              <span style={{ fontWeight: 600, color: textColor }}>{l.valor}</span>
            </div>
          ))}
        </div>
      )}

      {/* QR do PIX — o cliente aponta a câmera e o app já abre com o valor */}
      {qrPix && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            padding: "8px 28px 16px",
            gap: 6,
          }}
        >
          <img src={qrPix} width={180} height={180} alt="" />
          <span style={{ fontSize: 12, color: mutedColor, textAlign: "center" }}>
            Aponte a câmera do seu banco para pagar
          </span>
        </div>
      )}

      {/* Vendedor + Obs */}
      {(recibo.vendedor || recibo.observacao) && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            padding: "12px 28px",
            borderTop: `1px solid ${lightBorder}`,
            gap: 4,
          }}
        >
          {recibo.vendedor && (
            <div style={{ display: "flex", fontSize: 13, gap: 6 }}>
              <span style={{ fontWeight: 700, flexShrink: 0 }}>Atendido por:</span>
              <span style={{ color: mutedColor }}>{recibo.vendedor}</span>
            </div>
          )}
          {recibo.observacao && (
            <div style={{ display: "flex", fontSize: 13, gap: 6 }}>
              <span style={{ fontWeight: 700, flexShrink: 0 }}>Obs.:</span>
              <span style={{ color: mutedColor }}>{recibo.observacao}</span>
            </div>
          )}
        </div>
      )}

      {/* Rodapé */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "14px 28px 20px",
          borderTop: `1px solid ${lightBorder}`,
          gap: 2,
        }}
      >
        {recibo.rodape && (
          <div style={{ fontSize: 12, color: mutedColor, textAlign: "center" }}>{recibo.rodape}</div>
        )}
        <div style={{ fontSize: 11, color: mutedColor, fontWeight: 600, marginTop: recibo.rodape ? 4 : 0 }}>
          NÃO É DOCUMENTO FISCAL
        </div>
        <div style={{ fontSize: 10, color: "#94a3b8" }}>Dilon Zap</div>
      </div>
    </div>
  );
}
