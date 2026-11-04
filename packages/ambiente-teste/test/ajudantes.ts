import assert from "node:assert/strict";
import { BANCO_TESTE, PORTA_SITE, VARIAVEL_SENHA_USUARIOS } from "../src/config";

/** O que os testes de ponta a ponta compartilham: o site local e o login real pelo NextAuth. */
export const BASE = `http://${BANCO_TESTE.host}:${PORTA_SITE}`;
export const senha = process.env[VARIAVEL_SENHA_USUARIOS]!;

/** Cliente HTTP com cookies. Faz login de verdade pelo NextAuth do site. */
export class Sessao {
  private cookies = new Map<string, string>();

  private guardarCookies(r: Response) {
    for (const c of r.headers.getSetCookie()) {
      const [par] = c.split(";");
      const i = par.indexOf("=");
      this.cookies.set(par.slice(0, i), par.slice(i + 1));
    }
  }

  async chamar(caminho: string, metodo = "GET", corpo?: unknown) {
    const r = await fetch(`${BASE}${caminho}`, {
      method: metodo,
      redirect: "manual",
      headers: {
        cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "),
        ...(corpo === undefined ? {} : { "content-type": "application/json" }),
      },
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    this.guardarCookies(r);
    return r;
  }

  async entrar(email: string, senhaUsada = senha): Promise<boolean> {
    const csrf = await this.chamar("/api/auth/csrf");
    const { csrfToken } = (await csrf.json()) as { csrfToken: string };
    const r = await fetch(`${BASE}/api/auth/callback/credentials`, {
      method: "POST",
      redirect: "manual",
      headers: {
        cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "),
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ csrfToken, email, password: senhaUsada, callbackUrl: BASE, json: "true" }),
    });
    this.guardarCookies(r);
    return [...this.cookies.keys()].some((k) => k.includes("session-token"));
  }
}

export async function logado(email: string) {
  const s = new Sessao();
  assert.equal(await s.entrar(email), true, "login recusado");
  return s;
}
