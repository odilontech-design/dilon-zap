import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Cloudflare R2 é compatível com a API do S3 — mesmo SDK, só muda o endpoint
// e a região ("auto"). Guardamos só a chave do objeto no Postgres; o
// conteúdo em si vive no bucket.
function client() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error("Credenciais do R2 não configuradas (.env)");
  }

  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

function bucketName() {
  const bucket = process.env.R2_BUCKET_NAME;
  if (!bucket) throw new Error("R2_BUCKET_NAME não configurado (.env)");
  return bucket;
}

export function isStorageConfigured() {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET_NAME
  );
}

export async function uploadMedia(key: string, body: Buffer, contentType: string) {
  await client().send(
    new PutObjectCommand({ Bucket: bucketName(), Key: key, Body: body, ContentType: contentType })
  );
}

export async function downloadMedia(key: string): Promise<Buffer> {
  const res = await client().send(new GetObjectCommand({ Bucket: bucketName(), Key: key }));
  const bytes = await res.Body?.transformToByteArray();
  if (!bytes) throw new Error(`Objeto vazio ou não encontrado no R2: ${key}`);
  return Buffer.from(bytes);
}

/**
 * URL assinada de leitura.
 *
 * `baixarComoNome` faz o navegador BAIXAR em vez de abrir, com o nome dado. Vai
 * assinado junto (ResponseContentDisposition), e não como atributo `download`
 * no link, porque o arquivo vem de outro domínio — e `download` entre domínios
 * é ignorado pelo navegador, que abriria a imagem numa aba em vez de salvar.
 */
export async function getMediaReadUrl(
  key: string,
  expiresInSeconds = 3600,
  baixarComoNome?: string
): Promise<string> {
  // Nome de arquivo entra em UM cabeçalho HTTP: aspas e quebra de linha o
  // partiriam ao meio. O filename* em UTF-8 preserva acento nos navegadores
  // atuais; o filename simples, sem acento, é o que os antigos leem.
  const disposition = baixarComoNome
    ? `attachment; filename="${baixarComoNome.replace(/[^\w.\- ]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(baixarComoNome)}`
    : undefined;

  return getSignedUrl(
    client(),
    new GetObjectCommand({
      Bucket: bucketName(),
      Key: key,
      ...(disposition ? { ResponseContentDisposition: disposition } : {}),
    }),
    { expiresIn: expiresInSeconds }
  );
}

export async function deleteMedia(key: string) {
  await client().send(new DeleteObjectCommand({ Bucket: bucketName(), Key: key }));
}
