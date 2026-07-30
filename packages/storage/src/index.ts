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

export async function getMediaReadUrl(key: string, expiresInSeconds = 3600): Promise<string> {
  return getSignedUrl(client(), new GetObjectCommand({ Bucket: bucketName(), Key: key }), {
    expiresIn: expiresInSeconds,
  });
}

export async function deleteMedia(key: string) {
  await client().send(new DeleteObjectCommand({ Bucket: bucketName(), Key: key }));
}
