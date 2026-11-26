# Caixa de entrada do Instagram (Veículos > Instagram)

Módulo **próprio**, sem relação com o Inbox do WhatsApp (que não é tocado): mensagens diretas da conta profissional da loja, respondidas pela equipe no Zap. Quando o cliente passa o WhatsApp, a conversa vira negociação no CRM (origem "Instagram", contato pelo WhatsApp, tarefa de chamar), como nos leads dos portais.

## O que existe
- **Conexão** (gestão): OAuth "Instagram API com Instagram Login"; token de longa duração (60 dias) guardado cifrado (`PORTAIS_CHAVE`); renovação diária por cron.
- **Webhook** `/api/instagram/webhook`: verificação (`hub.challenge`) e mensagens assinadas (`X-Hub-Signature-256`, HMAC do corpo com o segredo do app). A mesma mensagem (`mid`) não duplica; mensagens enviadas pelo próprio app do Instagram entram como "saída".
- **Aviso de mensagem nova** (v1.107.0): push no celular e no computador para a equipe ativa da empresa (com o módulo de veículos), no máximo 1 por conversa por minuto; contador no menu Veículos e na aba Instagram (`lib/aviso-instagram.ts`; teste `lib/aviso-instagram.test-manual.ts`). O aparelho precisa ter ativado as notificações do Zap.
- **Caixa**: lista de conversas com não lidas e "aguardando resposta há X"; abrir marca como lida; responder (Enter envia). **A Meta só permite responder até 24 h depois da última mensagem do cliente**: depois disso o campo é bloqueado.
- **CRM**: telefone com DDD na mensagem do cliente abre a negociação sozinho; também há "Criar negociação" com o WhatsApp digitado. Responder pelo Zap para o relógio de resposta do lead (`LeadPortal.respondidoEm`).
- Código: `packages/portais/src/instagram/` (cliente Graph e leitor de webhook), `apps/web/lib/instagram.ts`, rotas em `app/api/instagram/` e `app/api/cron/instagram-renovar`, tela em `app/(dashboard)/veiculos/instagram/`. Teste: `lib/instagram.test-manual.ts` (Meta falsa).

## O que a Dilon Tech precisa fazer na Meta (uma vez)
1. Conta **profissional** (comercial) no Instagram da loja.
2. Em `developers.facebook.com`: criar o app (tipo Business) com o produto **Instagram** > "API com login do Instagram".
3. Em "Configuração da API", cadastrar:
   - URL de redirecionamento OAuth: `https://<ZAP>/api/instagram/retorno`
   - Webhook: URL `https://<ZAP>/api/instagram/webhook`, token de verificação = `INSTAGRAM_VERIFY_TOKEN`, campo **messages**.
4. Permissões: `instagram_business_basic` e `instagram_business_manage_messages`.
5. **Para contas de clientes (a Sales)**: pedir **Acesso avançado** a `instagram_business_manage_messages` (análise do app, com vídeo do uso) e **verificação da empresa** (Dilon Tech). Enquanto o app não for aprovado, só funcionam contas com função no app (administradores/testadores): serve para testar com a conta da Dilon Tech.
6. Variáveis de ambiente no servidor: `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `INSTAGRAM_VERIFY_TOKEN` (qualquer texto longo), além de `PORTAIS_CHAVE` e `NEXTAUTH_URL`. Cron diário: `0 5 * * * curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" https://<ZAP>/api/cron/instagram-renovar`.

## Atenção
- Os endereços, campos e códigos de erro (janela de 24 h = código 10/subcódigo 2534022; token inválido = 190) foram escritos **de memória da documentação pública da Meta**: não consegui abrir developers.facebook.com a partir do ambiente de desenvolvimento. Conferir na primeira conexão real e ajustar em `packages/portais/src/instagram/`.
- Só texto (mensagens com foto/vídeo aparecem como `[foto]`, `[vídeo]`...); envio só de texto. Sem notificação push ainda (a aba atualiza a cada 10 s).
- Mensagens de comentários, menções em story e anúncios "click-to-message" têm formatos próprios e não foram tratados.

## Passo a passo para ligar o Instagram de uma loja (a Sales)

**Regra de segurança:** a senha do Instagram da loja é digitada **só na tela do próprio Instagram**, na hora de autorizar. Ela nunca é enviada ao Claude, nem digitada no Zap, nem anotada em chat ou planilha. Quem autoriza é o dono do perfil (ou alguém de confiança com a senha e o código de verificação).

### A. Na loja (Instagram da Sales)
1. O perfil precisa ser **conta profissional** (comercial ou criador): no app do Instagram, Configurações > Tipo de conta e ferramentas > Mudar para conta profissional.
2. Em Configurações > Privacidade > **Mensagens**, deixar liberado receber mensagens de quem não segue (senão a mensagem cai em "solicitações" e a API não vê).
3. Ligar a **verificação em duas etapas** (recomendado) e ter o celular à mão no dia de conectar.

### B. Na Meta (Dilon Tech, uma vez só)
1. Entrar em developers.facebook.com com a conta da Dilon Tech e **criar um app** (tipo "Empresa"/Business).
2. No app, adicionar o produto **Instagram** > **API com login do Instagram** e, em "Configuração da API":
   - URL de redirecionamento OAuth: `https://<ZAP>/api/instagram/retorno`
   - Webhook: URL `https://<ZAP>/api/instagram/webhook`, token de verificação = o valor de `INSTAGRAM_VERIFY_TOKEN`, e assinar o campo **messages**.
3. Anotar o **ID do app** e o **segredo do app** (Configurações do app > Básico).
4. No servidor (`.env`): `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `INSTAGRAM_VERIFY_TOKEN` (texto longo qualquer). Reiniciar o site. Instalar o cron diário de renovação do token (ver acima).
5. **Funcionar já, antes da aprovação da Meta:** em Funções do app > **Testadores do Instagram**, adicionar o perfil da Sales. O dono da Sales aceita o convite no Instagram (Configurações > Apps e sites > Convites de testador). Com o app em modo de desenvolvimento, contas com função no app já conectam e recebem mensagens.
6. **Para valer para qualquer cliente:** pedir **Acesso avançado** a `instagram_business_manage_messages` (análise do app, com vídeo do uso) e a **verificação da empresa** da Dilon Tech (CNPJ, documento e site). A análise leva dias ou semanas.

### C. No Zap (a Sales conecta)
1. Veículos > Instagram > **Conectar o Instagram**. Abre a tela do Instagram: entrar com o usuário e a senha da loja, aceitar as permissões de mensagens.
2. Mandar uma mensagem de teste de outro perfil para o Instagram da Sales e ver chegar na aba (e o aviso no celular).
3. Ativar as notificações do Zap em cada aparelho da equipe.

### Conferir na primeira conexão real
Os endereços e códigos de erro da Meta foram escritos de memória (ver "Atenção"): conferir a conexão, o webhook e o envio de resposta e ajustar em `packages/portais/src/instagram/`.
