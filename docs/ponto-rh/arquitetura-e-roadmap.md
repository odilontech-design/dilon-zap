# Arquitetura e roadmap — Dilon Ponto

## 1. Lugar no monorepo

Segue o mesmo padrão do Esquadrias: **produto separado, banco separado e motor
puro em pacote próprio.**

```
apps/
  ponto/            Next.js 14 (App Router): painel admin/gestor, app do
                    colaborador (PWA), quiosque e API
  ponto-worker/     (F2) Processo de fundo: alertas, lembretes, WhatsApp,
                    geração de espelhos em lote
packages/
  ponto-core/       Motor puro, sem banco: apuração da jornada, banco de horas,
                    noturno, tolerâncias, AFD/AEJ. Testado à exaustão.
  ponto-db/         Schema Prisma + seed (banco "ponto")
  storage/          (já existe) R2: selfies, atestados, espelhos, documentos
  receivables/      (já existe) Cobrança da assinatura
```

**Por que banco separado:** os clientes são diferentes e os dados são sensíveis
(biometria, atestado com CID). Isolar reduz o estrago de qualquer erro e
simplifica o RIPD. Segue a mesma decisão tomada no Esquadrias.

**Por que não reaproveitar `@dilon-zap/push` direto:** ele importa
`@dilon-zap/db` (o banco do Zap). Para o Ponto, extraia a parte de envio para
um pacote sem banco, ou copie a função para `apps/ponto/lib`, que é o caminho
mais rápido no MVP.

### Stack

| Camada | Escolha | Motivo |
| --- | --- | --- |
| Web e API | Next.js 14 + NextAuth + Tailwind + Zod | Mesma do Esquadrias: o time já conhece e reaproveita componentes. |
| Banco | Postgres (Neon, região sa-east-1) + Prisma 5.22 | Igual aos outros produtos. Uma linha por marcação cabe folgado. |
| App do colaborador | **PWA** (service worker, câmera, GPS, IndexedDB para offline) | Não depende de loja de aplicativos e sai no MVP. App nativo só se o PWA travar em câmera ou localização em segundo plano. |
| Reconhecimento facial | Provedor gerenciado (ex.: AWS Rekognition, com CompareFaces e Face Liveness) | Fazer biometria por conta própria é risco jurídico e técnico. Avaliar 2 provedores na F2 por custo, latência a partir do Brasil e região dos dados. |
| WhatsApp | **API oficial (Cloud API da Meta)**, número próprio do cliente ou número compartilhado da Dilon | O registro de ponto não pode depender do Baileys: bloqueio do número = empresa sem ponto. |
| Arquivos | Cloudflare R2 via `@dilon-zap/storage` | Já em produção. |
| Hora | Hora do servidor com NTP apontado para `a.ntp.br`/`b.ntp.br` | A Portaria exige a hora legal brasileira. |
| Hospedagem | Vercel + Neon para `apps/ponto`. VPS ou Railway para o `ponto-worker` | Mesmo raciocínio de [`deploy-vercel-neon.md`](../deploy-vercel-neon.md): o web é stateless e o worker é processo longo. |

## 2. Modelo de dados (núcleo)

```
Empresa ─┬─ Unidade ── CercaVirtual
         ├─ Equipe
         ├─ Cargo
         ├─ Feriado (nacional | estadual | municipal, por unidade)
         ├─ ModeloJornada ── RegraCalculo
         ├─ Usuario (admin | gestor | colaborador | contador)
         └─ Colaborador ─┬─ VinculoJornada (jornada vigente de/até)
                         ├─ Marcacao            ← imutável
                         ├─ Tratamento          ← inclui/desconsidera, com motivo
                         ├─ Solicitacao ── Anexo
                         ├─ Abono
                         ├─ LancamentoBancoHoras
                         └─ Espelho ── AssinaturaEspelho
Periodo (empresa, unidade, de/até, status: aberto | fechado | reaberto)
Dispositivo (quiosque: token, unidade, último contato)
LogAuditoria (quem, ação, entidade, antes, depois, quando, IP)
```

### Campos que importam

**`Marcacao`** — nunca recebe UPDATE nem DELETE (garantido por permissão no
Postgres, não só no código):

| Campo | Observação |
| --- | --- |
| `nsr` | Sequencial por empresa, gerado dentro da transação com bloqueio (`SELECT … FOR UPDATE` no contador da empresa) |
| `instante` | `timestamptz`, hora do servidor |
| `instanteDispositivo`, `offline` | Para marcações sincronizadas depois |
| `canal` | `APP`, `WEB`, `QUIOSQUE`, `WHATSAPP` |
| `latitude`, `longitude`, `precisaoMetros`, `dentroCerca` | |
| `fotoChave`, `similaridadeFacial`, `vivacidadeOk` | Chave no R2 e resultado do provedor |
| `hashAnterior`, `hash` | SHA-256 de (`hashAnterior` + campos da marcação), formando a cadeia de integridade |
| `revisar` | Motivo, se caiu em alguma regra de revisão |

**Valores de tempo** são guardados em **minutos inteiros**, e os percentuais em
pontos-base, para não haver arredondamento de ponto flutuante (mesmo princípio
dos graus inteiros da Ótica). O dia de trabalho é apurado no **fuso da
unidade**, não no do aparelho.

## 3. Motor de jornada (`packages/ponto-core`)

É o coração do produto e a parte com maior risco jurídico. Precisa ser **função
pura**: entra a jornada prevista, as marcações tratadas, os abonos, os feriados
e as regras, e sai a apuração do dia. Assim é testável sem banco.

```ts
apurarDia(entrada: {
  data: string;                 // "2026-11-11", no fuso da unidade
  previsto: TurnoPrevisto[];    // da jornada vigente na data
  marcacoes: Instante[];        // já com tratamentos aplicados
  abonos: Intervalo[];
  feriado: boolean;
  regras: RegrasCalculo;
}): ApuracaoDia                 // normais, extras por faixa, noturnas
                                // (reduzidas), faltas, atrasos, intervalo,
                                // interjornada, ocorrências

apurarPeriodo(dias: ApuracaoDia[], banco: SaldoInicial, regras): ApuracaoPeriodo
gerarAFD(...) / gerarAEJ(...)   // layouts dos anexos da Portaria 671
```

**Casos que precisam de teste antes de qualquer cliente** (cada um vira um
arquivo de teste com exemplos calculados à mão e conferidos por um
profissional de DP):

- tolerância de 5/10 min (art. 58, §1º): dentro, no limite e um minuto acima;
- turno que atravessa a meia-noite, contado no dia de início;
- noturno: hora reduzida (52min30s), adicional e prorrogação depois das 5h
  (Súmula 60 do TST);
- 12x36 com feriado;
- intervalo menor que o mínimo, com pagamento do período suprimido;
- interjornada menor que 11h;
- hora extra em domingo ou feriado com percentual próprio;
- banco de horas: crédito, débito, vencimento de crédito e regra de quitação ao
  fim do prazo;
- marcações ímpares (esqueceu a saída) como ocorrência, nunca "completadas"
  sozinhas;
- mudança de jornada no meio do mês;
- mudança de horário de verão, caso volte a existir: o motor trabalha com
  instantes UTC e converte para o fuso da unidade.

Meta: **100% de cobertura de linhas no `ponto-core`** e uma bateria de
"meses-exemplo" completos comparados com fechamentos feitos à mão por um DP de
verdade.

## 4. Fluxos técnicos sensíveis

**Marcação pelo PWA:**

1. O app pede câmera e localização.
2. Tira a selfie (comprimida para cerca de 80 KB) e envia
   `POST /api/marcacoes` com foto, coordenadas e `idempotencyKey`.
3. O servidor grava a marcação e devolve o comprovante. O reconhecimento facial
   e a checagem da cerca rodam **depois de gravar**, em segundo plano, e só
   marcam `revisar`.
4. Offline: guarda no IndexedDB com a mesma `idempotencyKey` e reenvia quando
   houver rede. A chave impede marcação duplicada.

**Marcação pelo WhatsApp (F2):** o webhook da Cloud API cai no `ponto-worker`.
O worker identifica o colaborador pelo número cadastrado e verificado e conduz
uma conversa curta (tipo de marcação → selfie → localização), com prazo de 2
minutos. Grava com `canal=WHATSAPP` e responde com o comprovante. O texto
"entrada" sozinho não basta: a selfie e a localização são exigidas conforme a
configuração da empresa.

**Fraude de GPS:** a localização falsa é detectável só em parte. Os sinais são
precisão suspeita (0 m), saltos impossíveis entre marcações e `mock location`
quando o navegador expõe. Nenhum sinal desses bloqueia: todos marcam
`revisar`. Para quem precisa de prova forte de presença, use QR code no local
ou quiosque.

## 5. Conformidade REP-P (F2)

Para vender como **REP-P** (Registrador Eletrônico de Ponto via Programa), a
Portaria MTP 671/2021 pede, entre outros pontos:

- [ ] Registro do programa no **INPI**
- [ ] **Atestado técnico e termo de responsabilidade** emitido pelo
      desenvolvedor, entregue a cada cliente
- [ ] Geração do **AFD** e do **AEJ** nos layouts oficiais
- [ ] **Comprovante de registro** para o trabalhador a cada marcação, com
      assinatura eletrônica
- [ ] Sincronização com a hora legal brasileira
- [ ] Marcações e tratamentos preservados, sem alteração da original
- [ ] Nenhuma restrição à marcação nem marcação automática

> Confira cada item no texto **atual** da Portaria, que já teve alterações
> desde 2021, e com um advogado trabalhista. Esta lista é um roteiro, não a
> norma.

## 6. Roadmap

### Fase 0 — Validação comercial (3 semanas)

- Landing com lista de espera ([`landing-page-brief.md`](./landing-page-brief.md))
- 15 conversas (8 empresas, 7 contadores)
- Levantamento de preço de 4 ou 5 concorrentes
- Conversa com advogado trabalhista sobre REP-P e contrato
- **Saída:** 3 pilotos pré-pagos e 3 escritórios dispostos a indicar. Sem isso,
  não começa a Fase 1.

### Fase 1 — MVP do ponto (8 semanas)

| Semana | Entrega |
| --- | --- |
| 1 | `ponto-db` e `ponto-core` com o esqueleto e os testes dos casos da seção 3 |
| 2 | Cadastros: empresa, unidade, equipe, cargo, jornada e colaborador, com importação por planilha |
| 3 | PWA do colaborador: marcação com selfie, GPS, cerca e offline, mais o comprovante |
| 4 | Tela de controle de ponto e tratamentos com motivo |
| 5 | Solicitações (ajuste, abono, atestado) e aprovação pelo gestor |
| 6 | Banco de horas e painel de indicadores |
| 7 | Fechamento em passos, espelho em PDF e assinatura eletrônica |
| 8 | 10 relatórios, exportação AFD/AEJ, cobrança e entrada dos pilotos |

**O plano Essencial (R$ 59,90, até 10 colaboradores) fica pronto para venda
no fim desta fase.** Os limites por plano (colaboradores, turnos, CNPJs e
recursos) moram num único arquivo, `apps/ponto/lib/planos.ts`, como no
Esquadrias, e são verificados no servidor ao cadastrar, não só escondidos na
tela.

**Saída:** os 3 pilotos fecham um mês inteiro no sistema e o resultado bate com
a conferência manual feita em paralelo.

### Fase 2 — Conformidade e registro avançado (6 semanas)

- Processo de REP-P (seção 5)
- Reconhecimento facial e prova de vida
- Quiosque coletivo (rosto, QR ou PIN)
- Ponto pelo WhatsApp (Cloud API) e `ponto-worker`
- Alertas para gestores e lembretes
- Exportação para os 2 sistemas de folha dos primeiros contadores
- Painel do contador com várias empresas e link de indicação
- Relatórios até 25 ou mais

**Saída:** 25 clientes pagantes e pelo menos 30% deles vindos de contadores.

### Fase 3 — Ponto + DP (8 semanas)

Admissão digital, documentos em massa com assinatura, GED e férias e folgas.

**Saída:** 20% dos clientes no plano Ponto + DP ou acima.

### Fase 4 — RH Completo

Escalas rotativas, painel de risco de jornada e API pública.

## 7. Equipe mínima

| Fase | Pessoas |
| --- | --- |
| 0 | 1 pessoa comercial ou de produto (o fundador) e consultoria jurídica pontual |
| 1–2 | 2 desenvolvedores full-stack, 1 pessoa de DP como consultora (meio período, para validar cálculos) e suporte pelo próprio fundador |
| 3+ | Mais 1 desenvolvedor e 1 pessoa de suporte e implantação |

## 8. Estado atual

- **`packages/ponto-core`:** motor com testes (`npm run test:ponto`).
- **`packages/ponto-db`:** schema, migração com gatilho de imutabilidade,
  NSR, cadeia de hash e seed de demonstração.
- **`apps/ponto`:** plano Essencial completo, com a cobrança mensal por
  boleto (Asaas) e o bloqueio do painel por falta de pagamento. O que ainda falta para vender
  está em [`apps/ponto/README.md`](../../apps/ponto/README.md#o-que-ainda-falta-para-vender).

Próximos passos:

1. Testar a cobrança por boleto no sandbox do Asaas com chave real e ligar a
   recuperação de senha por email.
2. Levar os casos de teste do motor para um profissional de DP conferir e
   acrescentar 2 ou 3 meses reais fechados à mão como teste de regressão.
3. Colocar os 3 pilotos para usar e comparar o primeiro mês com a conferência
   manual.
