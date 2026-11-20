# Leads de revendas de automóveis (RJ e SP) para o SDR

Como a base de revendas é montada, importada e abordada por dia. Meta: 25 empresas novas por dia útil, com autorização do
lote por uma pessoa.

## Princípios

- **Nenhuma empresa é inventada.** A lista vem de uma fonte pública e aprovada. A IA qualifica e escreve; não cria nome,
  telefone nem e-mail.
- **A primeira mensagem é sempre de uma pessoa.** O lote é autorizado em bloco ("Aprovar o lote"), mas o envio continua sendo
  por ação sua: ligação, e-mail confirmado ou WhatsApp **um por clique** (limite de 10 por dia, com 90 s de intervalo).
  Disparo automático de primeira mensagem derruba o número do WhatsApp e não existe no sistema.
- **Quem pede para não ser contatado entra na lista de bloqueio** e some das filas.

## 1. Montar a base: dados abertos da Receita

Script: `scripts/coletar-revendas-receita.mjs`.

```bash
node scripts/coletar-revendas-receita.mjs <pasta de trabalho> <pasta de saída> 2026-10 RJ,SP
```

- **Fonte:** Cadastro Nacional da Pessoa Jurídica (CNPJ), dados abertos da Receita Federal, pasta do mês escolhido.
- **O que baixa:** `Municipios.zip`, `Estabelecimentos0..9.zip` (cerca de 5,4 GB) e `Empresas0..9.zip` (cerca de 1,5 GB),
  **um por vez**, lendo em fluxo e apagando cada arquivo depois de usar. Leva de 20 a 40 minutos.
- **Filtro:** só matriz, situação **ativa**, CNAE principal **4511-1/02** (revenda de usados) ou **4511-1/01** (concessionária
  de novos), nos estados pedidos, com telefone ou e-mail.
- **Saída:** `revendas-01.csv`, `revendas-02.csv`... com 2.000 linhas cada, mais `resumo.json`. As melhores ficam nos
  primeiros arquivos: usados antes de novos, celular (WhatsApp), e-mail, porte maior, empresa mais antiga.
- **E-mail de contador é descartado** (o cadastro costuma trazer o do escritório de contabilidade).

**Limites da fonte:** é o que a empresa informou à Receita, e pode estar desatualizado. Não traz **site nem Instagram**, então
o canal "Direct" só funciona para quem você completar. Também não diz qual sistema a revenda usa (AutoCerto ou outro).

## 2. Importar no SDR

1. **SDR > Perfis de cliente:** crie "Revendas de seminovos RJ/SP" (UF RJ e SP, segmento revenda de veículos).
2. **SDR > Campanhas:** crie a campanha com o roteiro de [sdr-campanha-revendas.md](sdr-campanha-revendas.md) (link da agenda,
   condição de migração).
3. **SDR > Importações:** envie o `revendas-01.csv` escolhendo a campanha. O mapeamento de colunas é automático. Duplicadas e
   bloqueadas são tratadas pela importação. Importe um arquivo por vez (2.000 empresas dão cerca de 80 dias de trabalho).
4. **Bloqueios:** cadastre antes os clientes atuais da Dilon Tech, para não abordá-los.

## 3. A rotina de cada dia (25 empresas)

1. **SDR > Fila do dia**, campanha "Revendas...", canal **Ligação**. A fila abre no tamanho da meta da campanha.
2. **Preparar mensagens:** cria os rascunhos pelo modelo da campanha (nenhum é aprovado nem enviado).
3. **Revisar rascunhos** (opcional, um a um: `A` aprova, `E` edita, `P` pula, `R` rejeita) ou direto **Aprovar o lote**:
   aprova de uma vez os rascunhos mostrados, com o texto exatamente como está. **Aprovar não envia nada.**
4. **Contatar:** ligue a partir da ficha da empresa; para quem não atender, repita com **E-mail** (precisa de `SDR_SMTP_*` no
   servidor) e, como último toque, **WhatsApp** (até 10 por dia, um por clique). Registre o resultado de cada contato.
5. A barra **"X de 25 empresas novas abordadas hoje"** mostra o andamento. Quem responde pelo WhatsApp passa a ser atendido pelo
   **Vendedor IA** (aba própria), se estiver ligado.

## 4. Atualizar a base

Os dados da Receita saem todo mês. Rode o script de novo com o mês novo e importe só o que for novo: a importação
reconhece o CNPJ e não duplica nem reabre empresa já contatada.

## Cuidados (LGPD)

São dados cadastrais públicos de pessoas jurídicas, usados para contato comercial B2B (legítimo interesse). Mantenha sempre a
opção de descadastro nas mensagens, respeite o bloqueio e não use a base para outro fim.
