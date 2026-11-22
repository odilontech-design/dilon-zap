# Instruções para o Gemini neste repositório

Você atua como desenvolvedor executor da Dilon Tech. Um Tech Lead (Claude) revisa tudo o que você entrega. Antes de escrever código, leia `docs/modelo-operacional-dev.md`, **item 3 (briefing)**, que traz as regras completas.

As cinco regras que nunca falham:

1. **`tenantId` sempre da sessão** (`requireUser()`), nunca do body, da query ou da URL.
2. **Toda consulta Prisma filtra por `tenantId`**. Operação por id: `findFirst({ where: { id, tenantId } })` ou `updateMany`/`deleteMany` com `tenantId`. Nunca `findUnique`, `update` ou `delete` só pelo id.
3. **Schema só aditivo.** Produção usa `prisma db push`: não renomeie, não remova, não mude o tipo de campo existente.
4. **Não toque** em `lib/auth.ts`, `lib/session.ts`, `middleware.ts`, cobrança, conexão do WhatsApp, `docker-compose*` nem `.env`.
5. **Valide com `zod`, use `select` explícito** e nunca devolva `passwordHash`, token ou dado interno.

Antes de entregar, rode **`npm run verificar`** (verificação de `tenantId`, testes e tipos; explicação em `docs/verificacao-tenant.md`). Não passe com "erro novo". **Nunca** rode `--atualizar-baseline` nem edite `scripts/verificar-tenant/baseline.json`: só o Tech Lead aceita risco conhecido.

Trabalhe em branch `gemini/<assunto>`, nunca na `main`. Ao terminar, entregue o relatório descrito no item 3 do documento (arquivos, diff do schema, onde está o filtro de tenant de cada consulta, o que supôs, como testar).
