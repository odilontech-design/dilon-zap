-- Banco do Dilon Ponto, separado dos outros produtos. Roda uma vez, quando o
-- volume do Postgres é criado. Num volume que já existe, rode à mão:
--   docker compose exec postgres psql -U dilonzap -c "CREATE DATABASE ponto"
SELECT 'CREATE DATABASE ponto'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'ponto')\gexec
