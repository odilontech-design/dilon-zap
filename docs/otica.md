# Ótica (recurso OTICA)

Gestão de ótica dentro do Zap: ordens de serviço no formato do talão, receitas
dos clientes, laboratórios e o aviso ao cliente pelo WhatsApp quando o óculos
muda de etapa. A primeira cliente é a Visuallis.

## Como funciona

- **Quadro de OS** (`/otica`): uma coluna por etapa — Aberta, No laboratório,
  Montagem, Conferência, Pronta para retirada, Entregue. O botão do cartão leva
  à próxima etapa e avisa o cliente. Cartão com prazo vencido fica vermelho.
- **OS** (`/otica/os/nova` e `/otica/os/[id]`): os campos do talão de papel —
  cliente (CPF, RG, nascimento, endereço, que ficam na ficha do contato),
  receita (longe/perto, OD/OE, esférico, cilíndrico, eixo, DNP, altura e
  adição), lentes, tratamentos, armação, medidas (ponte, maior diagonal, A, B),
  laboratório, nº do pedido no laboratório, previsão, consultor, valor, sinal e
  saldo. Cliente que volta reaproveita a receita anterior.
- **Impressões** (`/imprimir/os/[id]?via=loja|montador|laboratorio`): a OS com
  a via do cliente, a ficha do montador e o pedido ao laboratório.
- **Avisos**: saem pelo número geral da loja, na fila de saída normal (respeitam
  bloqueio e caem na conversa do Inbox). Ligados por padrão: enviado ao
  laboratório, pronta e entregue. Cada mudança de etapa fica no histórico da OS
  com "cliente avisado" ou o motivo de não ter avisado.
- **Laboratórios e avisos** (`/otica/configuracoes`, só gestão): laboratórios
  com prazo (sugere a previsão), texto de cada aviso com prévia, próximo número
  de OS e validade da receita.

Os graus são guardados como inteiros (centésimos de dioptria, décimos de mm) —
ver `apps/web/lib/otica-regras.ts`. A previsão de entrega é lida e mostrada no
fuso da empresa (`Tenant.timezone`), não no do aparelho.

## Implantação

Sem build na VPS e sem tocar no worker do WhatsApp (preparação única em
`docs/deploy-sem-build.md`). Um bloco por vez, conferindo a saída antes do próximo.
Em qualquer dúvida, parar: até o passo 5 nada mudou para os clientes.

```bash
# 1. Trazer o código. Não muda nada em execução.
cd /opt/dilon-zap && git pull origin main

# 2. Backup antes de mexer no banco.
scripts/backup-db.sh

# 3. Baixar a imagem pronta do GitHub. O site antigo continua no ar.
scripts/deploy-web-imagem.sh baixar otica

# 4. Ensaio, SOMENTE LEITURA: o SQL que o db push executaria no banco real.
#    Tem de ser igual a docs/otica-ddl-referencia.sql (fora os comentários).
#    Qualquer DROP ou ALTER em tabela existente: PARAR.
docker compose -f docker-compose.prod.yml run --rm --no-deps -T web sh -c \
  'npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel packages/db/prisma/schema.prisma --script'

# 5. Banco. SOZINHO. Só cria tabelas: o site antigo continua funcionando.
docker compose -f docker-compose.prod.yml run --rm --no-deps -T web \
  npx prisma db push --skip-generate --schema packages/db/prisma/schema.prisma
#    Conferir "Your database is now in sync". NUNCA usar --accept-data-loss.

# 6. Trocar o site (volta sozinho para o anterior se o login falhar).
scripts/deploy-web-imagem.sh trocar otica
```

Depois do passo 6: login responde 200, sessões do WhatsApp conectadas no
painel, logs do web sem erro.

**7. Ligar para a Visuallis — só depois do passo 6.** Super Admin → ficha da
empresa → plano → **Ótica (ordens de serviço e receitas)**. Antes disso não: com
uma linha `OTICA` em `TenantRecurso`, a imagem antiga do site quebraria ao ler a
tabela (a mesma pegadinha do enum do SDR).

**8. Na conta da Visuallis**, em Ótica → Laboratórios e avisos: cadastrar os
laboratórios com o prazo, pôr o próximo número de OS em **499** (o talão parou
na 0498) e revisar os textos dos avisos.

### Rollback
- Site: `docker tag dilon-zap-web:antes-otica dilon-zap-web:latest` e
  `docker compose -f docker-compose.prod.yml up -d --no-deps --no-build web`.
  Desligue o recurso OTICA antes (passo 7 ao contrário).
- Banco: as tabelas novas podem ficar; o site antigo não as usa.

## Ainda não faz (próximas fases)

- OS não gera Pedido nem lança no Caixa/A receber: valor, sinal e saldo ficam
  na própria OS.
- Lembrete de retirada, ajuste em 30 dias, pesquisa de satisfação e receita
  vencendo.
- Agenda de exames, importação das planilhas e emissão de nota fiscal.

Teste das regras: `npx tsx apps/web/lib/otica-regras.test-manual.ts`.
