import { proto } from "@whiskeysockets/baileys";
import type { AuthenticationState, SignalDataTypeMap } from "@whiskeysockets/baileys";
import { initAuthCreds, BufferJSON } from "@whiskeysockets/baileys";
import { prisma } from "@dilon-zap/db";

/**
 * Equivalente ao useMultiFileAuthState do Baileys, mas gravando no Postgres
 * em vez de arquivos locais — necessário porque o worker pode reiniciar ou
 * rodar em outro host sem perder a sessão (reescanear QR de novo em produção
 * derruba o atendimento do tenant).
 */
export async function usePostgresAuthState(sessionId: string): Promise<{
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
}> {
  const session = await prisma.whatsAppSession.findUniqueOrThrow({
    where: { id: sessionId },
  });

  const creds = session.authCreds
    ? (JSON.parse(session.authCreds, BufferJSON.reviver) as AuthenticationState["creds"])
    : initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const data: { [id: string]: SignalDataTypeMap[typeof type] } = {};
          const rows = await prisma.whatsAppSignalKey.findMany({
            where: { sessionId, category: type, keyId: { in: ids } },
          });

          for (const row of rows) {
            if (!row.value) continue;
            let value = JSON.parse(row.value, BufferJSON.reviver);
            if (type === "app-state-sync-key") {
              value = proto.Message.AppStateSyncKeyData.fromObject(value);
            }

            data[row.keyId] = value;
          }

          return data;
        },
        set: async (data) => {
          const ops: Promise<unknown>[] = [];

          for (const category in data) {
            const categoryData = data[category as keyof SignalDataTypeMap];
            for (const keyId in categoryData) {
              const value = categoryData[keyId as keyof typeof categoryData];
              const serialized = value ? JSON.stringify(value, BufferJSON.replacer) : null;

              ops.push(
                prisma.whatsAppSignalKey.upsert({
                  where: { sessionId_category_keyId: { sessionId, category, keyId } },
                  create: { sessionId, category, keyId, value: serialized },
                  update: { value: serialized },
                })
              );
            }
          }

          await Promise.all(ops);
        },
      },
    },
    saveCreds: async () => {
      await prisma.whatsAppSession.update({
        where: { id: sessionId },
        data: { authCreds: JSON.stringify(creds, BufferJSON.replacer) },
      });
    },
  };
}
