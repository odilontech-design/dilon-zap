# Dilon SDR: ativação e piloto interno

Versão `1.36.0`. Os commits do SDR são locais; nada foi enviado ao GitHub nem à VPS.
**Nada deste roteiro foi executado em produção.** Cada passo da VPS espera aprovação explícita, um por vez.

## 1. O que já está pronto e o que falta

| Item | Situação |
|---|---|
| Código do SDR (schema, rotas, telas, `sdr-core`, `sdr-worker`) | Pronto e commitado |
| `apps/sdr-worker/Dockerfile` e a linha do `sdr-core` no `apps/web/Dockerfile` | Pronto |
| Versão `1.36.0` e serviço `sdr-worker` no `docker-compose.prod.yml` | Pronto neste commit |
| Roteiros SQL (`docs/sdr-*.sql`), testados contra o schema de produção | Pronto |
| Enviar os commits ao GitHub e puxar na VPS | **Falta, com aprovação** |
| Construir as imagens `web` e `sdr-worker` na VPS (o Docker não existe na máquina de desenvolvimento, então o build das imagens só será visto na VPS) | **Falta, com aprovação** |
| Criar as tabelas e o valor `SDR` do enum (`prisma db push`) | **Falta, com aprovação** |
| Ligar o recurso para a Dilon Tech | **Falta, com aprovação** |
| Cadastrar perfil (ICP) e campanha pela tela | **Falta.** Os que você viu foram criados só no banco local descartável |

### Como o serviço `sdr-worker` está configurado

- **Só o endereço do banco.** Sem `env_file`: o `.env` do Zap tem o segredo do worker do WhatsApp e as chaves do R2, do Mercado Pago e da Asaas, e o SDR não usa nenhuma. Recebe apenas `DATABASE_URL`, que o compose lê do mesmo `.env`.
- **Sem porta e sem WhatsApp.** O código do SDR não importa nada do WhatsApp (há teste que varre o código).
- **Memória:** `mem_limit: 384m` e heap máximo de 256 MB. Medição local: uma importação de 1000 linhas terminou em menos de 7 segundos e o worker estava com **136 MB** (Windows, processo mais filhos; no Linux costuma ser menor). A medição começou com a importação já em andamento, então o pico exato não foi capturado; o teto de 384 MB tem folga grande sobre esse valor. A VPS tem cerca de 2,4 GB livres. Acompanhe com `docker stats` no primeiro uso.
- **Parada limpa:** o contêiner roda o `node` direto (não pelo `npm`), então recebe o SIGTERM e termina o lote; `stop_grace_period: 30s`. Se for morto no meio, a reserva do trabalho vence em 2 minutos e outro ciclo retoma sem duplicar.
- **Subir só depois do `db push`.** Antes disso ele só registra erro de tabela ausente no log a cada 5 segundos, sem efeito em mais nada.

## 2. O que muda no banco

`docs/sdr-ddl-referencia.sql`: 8 tipos novos e 8 tabelas novas (todos com `Sdr` no nome), mais **um** comando em objeto existente, `ALTER TYPE "Recurso" ADD VALUE 'SDR'`. Nenhum `DROP`, nenhuma coluna ou tabela existente alterada.

Verificado por teste automático (`test/compatibilidade-producao.test.ts`), num banco local criado com o schema do commit `f57d844`, que é o que está em produção:

- todo comando do arquivo é aditivo; as chaves estrangeiras só apontam para `Tenant` ou para tabelas do SDR;
- o arquivo é exatamente o que o Prisma gera comparando o schema de produção com o atual (o teste falha se o schema mudar e o arquivo não for regerado);
- depois do SQL, o **cliente Prisma antigo** (o do site e do worker que estão no ar) lê os mesmos dados sem erro e sem perda;
- depois do SQL, o Prisma não vê diferença entre banco e schema: o `db push` não terá mais nada a fazer;
- Postgres: a produção usa `postgres:18-alpine` e o banco de teste é o 18.6, a mesma versão principal.

**A pegadinha do enum, comprovada:** com uma linha `SDR` em `TenantRecurso`, o cliente Prisma antigo **quebra** ao ler essa tabela (valor desconhecido no enum). Isso define a ordem da ativação e do rollback abaixo. O worker do WhatsApp não lê `TenantRecurso`; só o site lê.

## 3. Sequência segura de ativação

Segue as regras já aprendidas: `db push` sozinho, schema conferido antes de trocar o site, nada encadeado com `&&` entre banco e troca, build fora do horário de uso (o build derruba a sessão do WhatsApp e o status do banco mente durante ele).

### A. Na máquina de desenvolvimento
```bash
npm run test:sdr          # todos os testes, num banco local descartável
npm run sdr:build         # next build com a guarda
git push origin main      # só com aprovação
```

### B. Na VPS (um bloco por vez, com aprovação em cada um)
```bash
# 1. Trazer o código. Não muda nada em execução.
cd /opt/dilon-zap && git pull

# 2. Backup antes de qualquer mudança no banco.
/opt/dilon-zap/scripts/backup-db.sh

# 3. Guardar a imagem atual do site, para voltar sem rebuild.
docker tag dilon-zap-web:latest dilon-zap-web:antes-sdr

# 4. Construir, um de cada vez (padrão nohup + BUILD_EXIT, fora do horário de uso).
docker compose -f docker-compose.prod.yml build web
docker compose -f docker-compose.prod.yml build sdr-worker

# 4b. Ensaio do banco, SOMENTE LEITURA. Mostra o SQL exato que o db push executaria
#     contra o banco real. Tem de ser igual a docs/sdr-ddl-referencia.sql (fora os
#     comentários). Se aparecer qualquer DROP ou ALTER em tabela existente, PARAR:
#     a produção não está no commit que o roteiro supõe (f57d844).
docker compose -f docker-compose.prod.yml run --rm --no-deps -T web sh -c \
  'npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel packages/db/prisma/schema.prisma --script'

# 5. Banco. SOZINHO. Com a imagem nova do site, que tem o schema novo.
docker compose -f docker-compose.prod.yml run --rm --no-deps -T web \
  npx prisma db push --skip-generate --schema packages/db/prisma/schema.prisma
#    Conferir "Your database is now in sync". NUNCA usar --accept-data-loss.
#    Se pedir confirmação de perda de dados, PARAR: não deveria acontecer.

# 6. Só depois de confirmado, trocar o site.
docker compose -f docker-compose.prod.yml up -d --no-deps web

# 7. Subir o worker do SDR.
docker compose -f docker-compose.prod.yml up -d --no-deps sdr-worker
docker compose -f docker-compose.prod.yml logs --tail 20 sdr-worker      # "no ar", sem erro
```
Depois dos passos 6 e 7: login responde 200, logs do site sem erro, sessões do WhatsApp conectadas, `sdr-worker` com "no ar".

### C. Ligar o recurso (só depois do passo 6)

1. **Identificar a empresa** (somente leitura). Nome não serve: há nomes repetidos.
```bash
docker compose -f docker-compose.prod.yml exec -T postgres sh -c \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < docs/sdr-identificar-empresa.sql
```
Conferir: uma empresa com o nome certo, um usuário Responsável (OWNER) ou Superadmin ativo, e **nenhuma** linha `SDR` ainda. Anotar o `id` e o `slug`.

2. **Ligar**, informando os dois. O roteiro só insere se os dois baterem, nunca sobrescreve, e desfaz tudo (com erro) se não terminar com exatamente uma linha SDR, ativa, na empresa informada:
```bash
docker compose -f docker-compose.prod.yml exec -T postgres sh -c \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -v tid=ID_DA_EMPRESA -v slug=SLUG_DA_EMPRESA' \
  < docs/sdr-ativar-recurso.sql
```
Com `ON_ERROR_STOP`, qualquer erro (`division by zero` na conferência) aborta e nada fica gravado. Testado contra: id errado, slug errado, empresa trocada, linha pré-existente desligada (não é sobrescrita), SDR já ligado em outra empresa, e outras exceções da empresa (ficam intactas).

3. Entrar com o usuário da Dilon Tech: o item SDR aparece no menu. O recurso **não** aparece no painel do superadmin, de propósito.

## 4. Rollback

**Ordem obrigatória, porque o site antigo quebra com a linha `SDR`:**
```bash
# 1. Apagar a linha (desativar não basta: marcar inativa não evita o erro do site antigo).
docker compose -f docker-compose.prod.yml exec -T postgres sh -c \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -v tid=ID_DA_EMPRESA' \
  < docs/sdr-desativar-recurso.sql

# 2. Parar o worker do SDR (os trabalhos pendentes ficam na tabela, sem efeito).
docker compose -f docker-compose.prod.yml stop sdr-worker

# 3. Só então, se for preciso voltar o site à versão anterior:
docker tag dilon-zap-web:antes-sdr dilon-zap-web:latest
docker compose -f docker-compose.prod.yml up -d --no-deps web
```
Depois de voltar a imagem, **não rode `build`** até corrigir: o código na VPS continua o novo.

| # | Risco | Como se evita | Reversão |
|---|---|---|---|
| 1 | Site antigo quebra com a linha `SDR` | Ligar o recurso só depois do passo 6; rollback na ordem acima | Passo 1 do rollback |
| 2 | Build derruba a sessão do WhatsApp | Fora do horário de uso, um build por vez, conferir as sessões depois | Reconectar pelo QR |
| 3 | `db push` mexer onde não deve | O SQL só cria objetos (comprovado por teste); backup antes; sem `--accept-data-loss` | Restaurar o backup do passo 2 (último recurso) |
| 4 | Ligar o recurso na empresa errada | id e slug juntos, conferência que desfaz tudo se não fechar | Rollback passo 1 |
| 5 | Imagens novas que não constroem | Nada em produção muda antes do build terminar | Nenhuma: falhou antes de subir |
| 6 | Memória | `mem_limit` e heap máximo; 136 MB medidos ao fim de 1000 linhas | `docker compose stop sdr-worker` |
| 7 | Importação errada | Prévia antes de confirmar | Seção 5 |

**Desfazer o SDR inteiro:** rollback passos 1 e 2. As tabelas `Sdr*` ficam vazias e paradas, e o valor `SDR` no enum não se remove nem faz mal.

**Depois do deploy:** apagar `test/compatibilidade-producao.test.ts` e `docs/sdr-ddl-referencia.sql` (ou atualizar `COMMIT_EM_PRODUCAO` no teste), porque a produção deixa de estar no commit `f57d844`.

## 5. Desfazer uma importação

Remove só o que ela criou:
```sql
DELETE FROM "SdrEmpresa" WHERE "tenantId" = '<id da empresa>' AND "importacaoOrigemId" = '<id da importação>';  -- prospectos saem em cascata
DELETE FROM "SdrImportacao" WHERE id = '<id da importação>';                                                  -- linhas saem em cascata
```
Campos que a importação só preencheu em empresas antigas não são desfeitos; a lista está em `mudancas` de cada linha, na tela da importação.

## 6. Limites que valem para o piloto

- **O SDR não cruza com o CRM.** Não sabe quem já é cliente ou lead da Dilon Tech. Antes de importar, **cadastre na aba Bloqueios os clientes atuais** (CNPJ ou domínio) e quem já está no funil de prospecção. É a única proteção contra prospectar quem já é cliente.
- Só CSV, só regras: nada é pesquisado, enriquecido, enviado ou criado no CRM. Todo dado da empresa é "informado no CSV, não verificado". Os dados precisam vir de uma fonte sua.
- Qualificação: UF, cidade, porte e CNAE do perfil são obrigatórios quando preenchidos. Segmento só pondera. Critério livre do perfil fica "não verificado". Empresa sem o dado no CSV fica em "Verificar".
- Não há tela para apagar empresa; só pelo SQL da seção 5.
- Uma linha por vez: no teste local, 1000 linhas levaram menos de 7 segundos (pelo menos 140 por segundo), então 20 a 50 empresas levam segundos, e 20 mil, no máximo uns 2 a 3 minutos.

## 7. Piloto: preparação

1. **Perfil (ICP).** Rascunho para ajustar, a partir dos ramos do cadastro do teste grátis: segmentos `Beleza e estética`, `Saúde e clínicas`, `Varejo e comércio`, `Serviços`; porte `ME` e `EPP`; estados e cidades a seu critério. Critérios livres (ficam "não verificados"): "Atende clientes pelo WhatsApp", "Tem equipe de atendimento".
2. **Campanha** "Dilon Zap, piloto interno", ligada a esse perfil.
3. **Bloqueios.** Cadastre os clientes atuais. Cadastre também **uma empresa de teste** que você vai incluir no CSV de propósito.
4. **CSV** de 20 a 50 empresas, no modelo `docs/sdr-modelo-importacao.csv` (cabeçalho, ponto e vírgula). Inclua de propósito: 1 linha repetida (CNPJ com máscara), 1 com CNPJ errado, 1 sem CNPJ e 1 empresa que está na lista de bloqueio.
5. **Antes de começar**, rode a conferência (seção 9) e guarde o bloco 1.

## 8. Piloto: passo a passo

1. SDR → Importações → **Importar CSV**. Confira a prévia (colunas reconhecidas, contagens, linhas inválidas, duplicidades). Escolha a campanha e confirme.
2. Acompanhe: "Na fila", "Processando", "Concluída". Abra a importação e use os filtros (Inválidas, Duplicadas, Com divergência, Bloqueadas, Falhas).
3. Aba **Empresas**: filtre por campanha, situação e bloqueio. Abra 5 fichas e leia as justificativas.
4. Aba **Bloqueios** → "Ver empresas bloqueadas".
5. No servidor: `docker compose -f docker-compose.prod.yml logs --tail 30 sdr-worker` (só ids e contagens, sem nomes).
6. Rode a conferência de novo e preencha o checklist.

## 9. Consultas de conferência (somente leitura)

`docs/sdr-conferencia.sql` roda numa transação `READ ONLY`: o próprio banco recusa qualquer escrita (testado). Os blocos:

1. contagens do CRM e do WhatsApp (contatos, conversas, mensagens, agendadas, negociações), que **não podem mudar**;
2. empresas duplicadas pelo CNPJ (deve devolver 0 linhas);
3. resultado de cada importação;
4. situação das linhas (nenhuma deve ficar "PENDENTE" depois de concluída);
5. fila (nada preso em `EM_PROCESSAMENTO`);
6. prospectos por campanha e situação;
7. isolamento: só a empresa do piloto tem o recurso e dados;
8. empresas bloqueadas pela lista.

```bash
docker compose -f docker-compose.prod.yml exec -T postgres sh -c \
  'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"' < docs/sdr-conferencia.sql
```

## 10. Critérios de aceitação

| ✓ | Critério | Como conferir |
|---|---|---|
| ☐ | Importação correta | Totais da prévia = totais da importação concluída; nenhuma linha "Aguardando" (bloco 4) |
| ☐ | Sem empresa duplicada | A linha repetida aparece como Duplicada ("mesmo CNPJ, repetida no próprio arquivo"); bloco 2 vazio |
| ☐ | Inválidas rejeitadas com motivo | A linha de CNPJ errado está em Inválidas, com a mensagem, e não virou empresa |
| ☐ | Linha sem CNPJ aceita com aviso | Aparece como Nova, com "sem CNPJ" |
| ☐ | Qualificação coerente com o perfil | Em 5 fichas, o atendido e o não atendido batem com o CSV |
| ☐ | Pontuação compreensível | Cada critério tem situação e justificativa; "não verificado" não conta como atendido |
| ☐ | Supressão funcionando | A empresa de teste aparece como Bloqueada, existe como empresa, mas não entrou na campanha (bloco 8) |
| ☐ | Fila processando | Importação "Concluída"; bloco 5 sem trabalho preso |
| ☐ | Histórico e erros visíveis | Linhas consultáveis por filtro; divergências "mantido o da base" |
| ☐ | Reprocessar não duplica | Importar o mesmo arquivo de novo: tudo Duplicada, mesma contagem de empresas |
| ☐ | Isolamento entre empresas | Bloco 7: uma linha `SDR`, empresas só do mesmo `tenantId` |
| ☐ | Nenhum contato criado no CRM | Bloco 1 igual ao de antes |
| ☐ | Nenhum WhatsApp envolvido | Bloco 1 igual (mensagens e conversas); sessões do WhatsApp conectadas como antes |

O piloto passa se todos os itens estiverem marcados. O que sair errado vira ajuste de regra ou de tela, não funcionalidade nova. Só depois faz sentido discutir o próximo passo (por exemplo, cruzar com o CRM antes de importar, ou a primeira fonte de pesquisa).
