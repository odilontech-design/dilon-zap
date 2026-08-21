-- A imagem do Postgres só cria o banco de POSTGRES_DB. O SaaS de esquadrias
-- usa banco próprio (são dois produtos, com clientes diferentes), então ele é
-- criado aqui — este arquivo roda uma vez, quando o volume é inicializado.
SELECT 'CREATE DATABASE esquadrias'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'esquadrias')\gexec
