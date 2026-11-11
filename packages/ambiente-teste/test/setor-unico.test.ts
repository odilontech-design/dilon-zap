import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { prisma } from "@dilon-zap/db";
import { membroUnicoDoSetor } from "../../../apps/web/lib/setor-unico";

/**
 * Transferir para um setor de uma pessoa só atribui a conversa a ela (caso #17714 da Guttierres, 10/11).
 * A regra de "quem é o único" mora aqui: só conta membro ativo, e setor com 0 ou 2+ membros continua fila.
 */

let tenantId = "";
const setores: Record<string, string> = {};
const usuarios: Record<string, string> = {};

describe("membro único do setor", () => {
  before(async () => {
    tenantId = (await prisma.tenant.create({ data: { name: "setor-unico", slug: "setor-unico-teste" } })).id;
    const novoUsuario = async (chave: string, desativado = false) => {
      usuarios[chave] = (
        await prisma.user.create({
          data: {
            tenantId,
            email: `${chave}@setor-unico.teste`,
            name: chave,
            role: "AGENT",
            passwordHash: "x",
            ...(desativado ? { deactivatedAt: new Date() } : {}),
          },
        })
      ).id;
    };
    await novoUsuario("carlos");
    await novoUsuario("phellipe");
    await novoUsuario("paola");
    await novoUsuario("antigo", true);

    for (const nome of ["socio", "fiscal", "adm", "vazio"]) {
      setores[nome] = (await prisma.setor.create({ data: { tenantId, nome } })).id;
    }
    const membro = (setor: string, user: string) =>
      prisma.setorMembro.create({ data: { setorId: setores[setor], userId: usuarios[user] } });
    await membro("socio", "carlos");
    await membro("fiscal", "phellipe");
    await membro("fiscal", "antigo"); // desativado: não conta
    await membro("adm", "phellipe");
    await membro("adm", "paola");
  });

  after(async () => {
    await prisma.tenant.deleteMany({ where: { id: tenantId } });
  });

  test("setor com uma pessoa devolve essa pessoa", async () => {
    assert.deepEqual(await membroUnicoDoSetor(setores.socio), { id: usuarios.carlos, name: "carlos" });
  });

  test("membro desativado não conta: sobra um ativo, é ele", async () => {
    assert.equal((await membroUnicoDoSetor(setores.fiscal))?.id, usuarios.phellipe);
  });

  test("setor com duas pessoas continua sendo fila", async () => {
    assert.equal(await membroUnicoDoSetor(setores.adm), null);
  });

  test("setor sem ninguém não atribui", async () => {
    assert.equal(await membroUnicoDoSetor(setores.vazio), null);
  });
});
