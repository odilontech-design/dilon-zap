import nodemailer from "nodemailer";
import type { EnviadorDeEmail } from "@dilon-zap/sdr-core";

/**
 * O único arquivo do site que fala SMTP e que lê a configuração da caixa de e-mail (variáveis SDR_SMTP_*, só no
 * servidor). A senha nunca vai para o navegador, para o banco nem para o log. Sem configuração, o envio por e-mail
 * fica desligado e o SDR segue normal (copiar e abrir no seu e-mail).
 */

type Env = Record<string, string | undefined>;
type CriarTransporte = typeof nodemailer.createTransport;

export type ConfigSmtp = { host: string; port: number; secure: boolean; user: string; pass: string; from: string };

export function lerConfigSmtp(env: Env = process.env): ConfigSmtp | null {
  const host = env.SDR_SMTP_HOST?.trim();
  const user = env.SDR_SMTP_USER?.trim();
  const pass = env.SDR_SMTP_PASS;
  const from = (env.SDR_SMTP_FROM ?? env.SDR_SMTP_USER)?.trim();
  if (!host || !user || !pass || !from) return null;
  const port = Number(env.SDR_SMTP_PORT ?? 587);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return null;
  // 465 usa TLS direto; 587 e 25 começam em texto e sobem para TLS (STARTTLS).
  const secure = env.SDR_SMTP_SECURE ? env.SDR_SMTP_SECURE === "true" : port === 465;
  return { host, port, secure, user, pass, from };
}

const inteiro = (v: string | undefined, padrao: number, max: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? Math.min(n, max) : padrao;
};

/** Tetos que o servidor impõe, com padrão baixo de propósito: quem aumenta é quem configura o servidor. */
export const limitesDoSdr = (env: Env = process.env) => ({
  emailPorDia: inteiro(env.SDR_EMAIL_LIMITE_DIARIO, 20, 200),
  whatsapp: { limiteDiario: inteiro(env.SDR_WHATSAPP_LIMITE_DIARIO, 10, 50), intervaloMinimoSegundos: inteiro(env.SDR_WHATSAPP_INTERVALO_S, 90, 3600) },
});

export function criarEnviadorSmtp(opcoes: { env?: Env; criarTransporte?: CriarTransporte } = {}): EnviadorDeEmail {
  const env = opcoes.env ?? process.env;
  const criar = opcoes.criarTransporte ?? nodemailer.createTransport;
  const config = () => lerConfigSmtp(env);
  return {
    configurado: () => config() !== null,
    remetente: () => {
      const c = config();
      if (!c) throw new Error("e-mail não configurado");
      return { nome: "Dilon Tech", email: c.from };
    },
    async enviar(m) {
      const c = config();
      if (!c) throw new Error("e-mail não configurado");
      const transporte = criar({
        host: c.host,
        port: c.port,
        secure: c.secure,
        auth: { user: c.user, pass: c.pass },
        connectionTimeout: 15_000,
        greetingTimeout: 15_000,
        socketTimeout: 30_000,
        requireTLS: !c.secure,
      });
      try {
        const info = await transporte.sendMail({
          from: { name: m.de.nome, address: c.from },
          to: m.para,
          replyTo: c.from,
          subject: m.assunto,
          text: m.texto,
          headers: m.cabecalhos,
        });
        return { messageId: String(info.messageId ?? "") };
      } catch (e) {
        // Nunca devolve a senha, mesmo que o servidor de e-mail a repita na mensagem de erro.
        const msg = e instanceof Error ? e.message : "falha desconhecida";
        throw new Error(msg.split(c.pass).join("[oculto]").slice(0, 300));
      } finally {
        transporte.close?.();
      }
    },
  };
}
