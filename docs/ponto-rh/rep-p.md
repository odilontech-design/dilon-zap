# REP-P: o que o Dilon Ponto já faz e o que a Dilon Tech precisa providenciar

O Dilon Ponto é um **REP-P** (registrador eletrônico de ponto via programa) e
um **PTRP** (programa de tratamento de registro de ponto), conforme a
Portaria MTP nº 671/2021, arts. 74 a 92 e Anexo IX. O REP-P **não é
homologado nem certificado pelo Ministério do Trabalho**: a Portaria exige
registro do programa no INPI e um Atestado Técnico e Termo de
Responsabilidade (ATRT) assinado pelo desenvolvedor e entregue a cada cliente.

## O que o sistema já faz

| Exigência | Onde |
| --- | --- |
| NSR único e contínuo por estabelecimento para todas as operações (tipos 2, 5, 6 e 7) | `packages/ponto-db/src/marcacao.ts` (`registrarOperacaoRep`, `registrarMarcacao`) |
| Marcações e operações imutáveis | gatilhos no banco (migrações `..._rep_p` e anteriores) |
| Hash SHA-256 encadeado de cada marcação (tipo 7) e CRC-16 | `packages/ponto-core/src/rep.ts` |
| Comprovante com os itens I a VIII do art. 79, em PDF assinado (PAdES), disponível ao trabalhador | tela Registrar, Meu ponto, `/api/marcacoes/[id]/comprovante` |
| AFD (leiaute 004) e AEJ (leiaute 002) com assinatura CAdES destacada (.p7s) | Configurações → Registro de ponto; `/api/rep/afd` e `/api/rep/aej` |
| Acesso aos arquivos mesmo com a mensalidade em aberto | as rotas `/api/rep` não passam pelo bloqueio de cobrança |
| Espelho de ponto com os itens do art. 84 | `/espelho/[colaboradorId]` |
| Ajuste só por inclusão/desconsideração, com motivo e autor | tela Ponto (admin) |
| Hora com a Hora Legal Brasileira (tolerância de 30 s) | `apps/ponto/lib/relogio.ts`, conferida no `/api/saude` |
| Proibições do art. 74 (sem restrição de horário, sem marcação automática, sem autorização prévia de hora extra) | regra do produto |
| ATRT no modelo oficial (REP-P e PTRP) | `npm run ponto:atrt -- <CNPJ do cliente>` |
| Termos de uso e política de privacidade (LGPD) | `/termos` e `/privacidade` |

## O que a Dilon Tech precisa providenciar (uma vez)

### 1. Certificado digital e-CNPJ A1 da Dilon Tech

Compre um **e-CNPJ A1** (arquivo .pfx, validade de 1 ano) em qualquer
autoridade certificadora ICP-Brasil (Serasa, Certisign, Valid, Soluti…). É
ele que assina o AFD, o AEJ e os comprovantes. O A3 (token ou cartão) não
serve, porque o servidor precisa usar o certificado sozinho.

Na Vercel (Production):

```bash
base64 -w0 certificado.pfx
```

- `PONTO_CERT_PFX_BASE64` = a saída do comando acima
- `PONTO_CERT_SENHA` = a senha do .pfx

Renove antes de vencer: o `/api/saude` mostra a validade (`repP.certificadoValidoAte`).

### 2. Registro do programa no INPI

1. Faça o commit da versão que vai ser registrada e rode na raiz:
   ```bash
   npm run ponto:hash-inpi
   ```
   Guarde o `.tar.gz` gerado **sem alterar** (é a prova de autoria) e anote o SHA-512.
2. No portal do INPI, emita a GRU do serviço **730 – Pedido de registro de
   programa de computador** (cerca de R$ 210; há desconto para ME/EPP) e pague.
3. No **e-Software**, preencha: título "Dilon Ponto", data de criação,
   linguagem (TypeScript), campo de aplicação, tipo de programa, autores e
   titular (Dilon Tech), e o hash SHA-512 do passo 1. Assine com o
   certificado digital do titular.
4. O certificado de registro sai em cerca de 10 dias. Anote o **número do
   registro** e o **número do certificado**.

Na Vercel: `PONTO_REGISTRO_INPI` (só dígitos) e, no `.env` local para o ATRT,
`PONTO_CERTIFICADO_INPI`.

A cada versão nova relevante, o registro pode ser atualizado; o número que vai
nos arquivos é o do registro vigente.

### 3. Dados do desenvolvedor

- `PONTO_DESENVOLVEDOR_CNPJ` = 64601665000133
- `PONTO_DESENVOLVEDOR_RAZAO` = razão social da Dilon Tech como está no CNPJ
- `PONTO_DESENVOLVEDOR_EMAIL` = e-mail de contato técnico
- `PONTO_VERSAO_PROGRAMA` = versão registrada (ex.: 1.0)

### 4. Responsáveis pelo ATRT

O art. 89 pede o **responsável legal** da empresa e o **responsável técnico**
pelo programa. Podem ser a mesma pessoa. Cada um precisa de um **e-CPF**
(A1 ou A3) para assinar. No `.env` local:

- `PONTO_RESPONSAVEL_LEGAL_NOME` e `PONTO_RESPONSAVEL_LEGAL_CPF`
- `PONTO_RESPONSAVEL_TECNICO_NOME` e `PONTO_RESPONSAVEL_TECNICO_CPF`

## Para cada cliente novo

1. O administrador do cliente preenche em **Configurações → Registro de
   ponto** o CPF dele, o endereço do estabelecimento e, se tiver, o
   CEI/CAEPF/CNO. Até isso ser feito, o painel mostra um aviso.
2. Gere os atestados (com o `.env` apontando para o banco de produção):
   ```bash
   npm run ponto:atrt -- <CNPJ do cliente>
   ```
   Saem dois PDFs: ATRT do REP-P e ATRT do PTRP.
3. Os dois responsáveis assinam cada PDF com o e-CPF (assinador do gov.br não
   serve, porque o padrão exigido é ICP-Brasil; use o Adobe Reader, o
   Assinador Serpro ou o da sua certificadora).
4. Envie os PDFs assinados ao cliente. Ele guarda e apresenta à
   fiscalização quando pedirem.

## Clientes que já usavam antes do REP-P (ex.: Believe)

As marcações antigas continuam válidas: o hash oficial delas é recalculado
na mesma cadeia. Na primeira operação depois da atualização, o sistema grava
a identificação da empresa (tipo 2) e a inclusão dos colaboradores (tipo 5)
com os NSR seguintes, sem buracos. O administrador só precisa preencher a
identificação (passo 1 acima).

## Decisões de leiaute a conferir com o validador oficial

Quando o Ministério disponibilizar validador do AFD/AEJ, confira:

- campos numéricos com zeros à esquerda;
- hash SHA-256 em letras minúsculas;
- assinatura CAdES sem política AD-RB explícita;
- eventos sensíveis (tipo 6, códigos 07 e 08) não são gerados automaticamente;
- código de horário contratual vazio em dias sem horário previsto.

## Fora do escopo legal

Reconhecimento facial não é exigido pela Portaria 671. O registro "com foto"
guarda a selfie só para conferência visual.
