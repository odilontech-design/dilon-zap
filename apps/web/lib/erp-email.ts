import nodemailer from "nodemailer";
import { lerConfigSmtp } from "./sdr/smtp";

/**
 * E-mails da contratação online (confirmação e boas-vindas). Usa a mesma caixa configurada para o SDR
 * (variáveis SDR_SMTP_*): sem ela, a contratação online fica indisponível, porque o link de
 * confirmação é o que impede robô de criar escritório.
 */

export const emailConfigurado = () => lerConfigSmtp() !== null;

export async function enviarEmail(para: string, assunto: string, texto: string): Promise<void> {
  const c = lerConfigSmtp();
  if (!c) throw new Error("e-mail não configurado");
  await nodemailer
    .createTransport({ host: c.host, port: c.port, secure: c.secure, auth: { user: c.user, pass: c.pass }, connectionTimeout: 15_000, greetingTimeout: 15_000, socketTimeout: 30_000 })
    .sendMail({ from: { name: "Dilon Tech", address: c.from }, to: para, subject: assunto, text: texto });
}
