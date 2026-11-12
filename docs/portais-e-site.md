# Anúncios nos portais e site da loja

Estado em 12/11/2026 (v1.47.0). O site e os feeds estão prontos. Os
conectores com os portais dependem de credenciamento junto a cada portal (ver
"Portais").

## Site da loja (pronto)

A vitrine (`/loja/[slug]`, ver `docs/revenda-veiculos.md`) virou o site da
loja.

- **Domínio próprio:** a loja cadastra `www.sualoja.com.br` em Veículos →
  Vitrine e cria no DNS um CNAME para o endereço do Zap.
  - **Certificado:** o Caddy emite o HTTPS sob demanda, mas só para domínio
    cadastrado numa vitrine no ar. Antes de emitir, ele pergunta em
    `/api/loja/dominio/permitido`.
  - **Rotas no domínio** (`apps/web/middleware.ts`): `/` abre a vitrine,
    `/sitemap.xml` e `/robots.txt` são os da loja, e qualquer outro caminho
    (login, painel, outra loja) volta para a raiz.
  - **Links:** todos usam o domínio quando ele existe (WhatsApp, Vendedor IA,
    feeds, sitemap).
- **Google:**
  - dados estruturados schema.org: `Car` com `Offer` na página do carro e
    `AutoDealer` na listagem, com preço, km, ano, câmbio e fotos;
  - sitemap, robots e URL canônica;
  - cartão de prévia com a capa ao compartilhar.
- **Pixel do Facebook/Instagram e Google Analytics 4** por loja:
  - o clique em "Tenho interesse" conta como `Contact`;
  - o formulário conta como `Lead`, com o valor do carro.

  Com isso a loja mede as visitas e anuncia para quem viu e não chamou.
- **Formulário "Quero ser chamado"** na página do carro. Vira negociação no CRM
  (origem "Site", com o carro e o valor) e cria a tarefa "Chamar no WhatsApp"
  para agora. Tem armadilha para robô e limite de 5 envios por hora por IP e
  por telefone.
- **Feeds do estoque** (só o que a vitrine mostra, sempre atualizados):
  - `/api/loja/[slug]/feed/facebook.csv`: catálogo de veículos da Meta, para os
    anúncios de estoque no Facebook e Instagram;
  - `/api/loja/[slug]/feed/estoque.xml` e `.json`: para integradores e portais
    que importam estoque por arquivo.

Testes:
- `npx tsx apps/web/lib/feeds-estoque.test-manual.ts` (feeds);
- domínio, sitemap, robots, ask do Caddy, bloqueio de rotas, formulário
  virando negociação e JSON-LD foram conferidos contra um Postgres local com o
  servidor rodando.

### Aparência e páginas do site (v1.55.0)

A vitrine deixou de ser só uma lista de carros: ganhou a moldura e as páginas
de um site de loja, para a revenda poder tirar do ar o site antigo.

**Veículos → Vitrine, o que a loja configura:**
- **Aparência:** logo, banner da página inicial e cor da loja. O texto sobre a
  cor é escolhido sozinho (claro ou escuro) para continuar legível.
- **Horário de funcionamento, Instagram e Facebook:** viram rodapé e dados
  estruturados do Google (`AutoDealer`, com telefone, horário e redes).
- **Política de privacidade:** o Zap publica um modelo (LGPD) que cita a loja, o
  que os formulários coletam e, se a loja ligou pixel ou Analytics, o
  rastreamento. A loja pode colar o texto do advogado, que substitui o modelo.

**Páginas públicas** (`/loja/<slug>/…`; no domínio próprio, o caminho curto):
- **Menu da vitrine:** `Veículos` (início), `/venda-seu-carro`, `/financiamento`
  e `/localizacao`. A `/privacidade` fica no rodapé.
- **`/venda-seu-carro`:** o visitante descreve o carro dele. Vira negociação
  "Avaliação: <carro> (site)" no CRM, com a tarefa de chamar no WhatsApp.
- **`/financiamento`:** escolhe um carro da vitrine (ou nenhum), informa a
  entrada e o que quiser. Vira negociação "Financiamento: <carro> (site)", com o
  valor do carro. O botão "Simular financiamento" da página do carro abre essa
  página com o carro já escolhido. **Não pede CPF nem renda** (a simulação é da equipe).
- **`/localizacao`:** endereço, horário, WhatsApp e mapa do Google (sem chave de API).
- **Mesmo comprador, mesmo assunto:** enviar o formulário de novo soma uma
  tarefa na negociação aberta, em vez de abrir outra.
- **Proteções dos formulários:** campo isca contra robô e limite de 5 envios por hora
  por IP e por telefone (os mesmos do "Quero ser chamado").

**Domínio próprio:** o middleware reescreve `/venda-seu-carro`, `/financiamento`,
`/localizacao` e `/privacidade` para a loja dona do domínio. O sitemap passou a
listar as páginas. `/painel`, `/login` e o resto continuam voltando para a vitrine.

**Segurança do que a loja digita:** a cor só vale como `#rrggbb`; Instagram e
Facebook são remontados a partir do usuário (qualquer outra coisa, como
`javascript:`, é recusada); logo e banner só aceitam PNG, JPG ou WEBP (SVG fica
de fora, porque pode carregar script) e são servidos por
`/api/loja/<slug>/marca/<logo|banner>`.

**Testes** (de `apps/web`): `npx tsx lib/vitrine-aparencia.test-manual.ts`
(cor, redes, mapa, caminhos, política) e `DATABASE_URL=… npx tsx
lib/lead-site-paginas.test-manual.ts` (formulários → CRM, isolamento entre lojas,
lista de páginas do middleware igual à do código).

### Implantação

1. `npm run db:push`: colunas novas em `VeiculosConfig` (`dominio`,
   `metaPixelId`, `ga4Id`, `formularioAtivo`).
2. **Caddyfile:** o bloco global `on_demand_tls` e o bloco `https://` são
   novos. Na VPS, rode `docker compose exec caddy caddy validate --config
   /etc/caddy/Caddyfile` antes de recarregar. Não foi possível validar nesta
   sessão.
3. Redeploy do web e reload do Caddy.
4. Na loja: cadastrar o domínio só quando a vitrine for substituir o site
   atual. Ao apontar o DNS, o site antigo (AutoCerto) sai do ar naquele
   endereço.

## Portais

Como cada portal recebe anúncios de loja, pela pesquisa de 12/11/2026:

| Portal | Como recebe estoque | O que precisa para integrarmos |
|---|---|---|
| **Mercado Livre** | API pública: anúncio classificado (`buying_mode: classified`) na categoria Carros e Caminhonetes (MLB1744), com atributos do catálogo do ML | Criar o app da Dilon Tech no portal de desenvolvedores do ML (OAuth). A loja autoriza a conta dela e precisa ter pacote de classificados ativo |
| **OLX** | API Autoupload (OAuth, escopo `autoupload`), ou importação por arquivo JSON. Autos é suportado pela API e pelo JSON, não pelo XML | Pedir `client_id` e `client_secret` à OLX por e-mail. A loja autoriza a conta e precisa ter plano profissional |
| **Webmotors** | API de Estoque no portal de desenvolvedores (Sensedia), com homologação. Também tem API de Leads | Cadastro no portal de desenvolvedores, homologação e chamado para liberar produção. A loja precisa contratar o "API Site" e criar no Cockpit um usuário "Integrador de API" |
| **iCarros** | Sem documentação pública: integradores autorizados | Parceria ou credenciamento direto com o iCarros |
| **Mobiauto** | Integração por API liberada pela Mobiauto (ou o integrador deles, Mobigestor) | Pedir à Mobiauto a liberação de integração por API |
| **Facebook / Instagram** | Catálogo de veículos por feed | **Pronto:** feed CSV. A loja cola o link no Gerenciador de Comércio |

### Ordem recomendada

1. **Agora, sem esperar ninguém:** feed da Meta. Com a vitrine e o feed, a loja
   já anuncia o estoque no Facebook e no Instagram.
2. **OLX e Mercado Livre:** API aberta a parceiros, o tempo de liberação é o
   do e-mail. Os dois maiores em volume de lead de seminovo popular.
3. **Webmotors:** homologação mais longa, e a loja paga o "API Site" à parte.
   Pedir o acesso já, em paralelo.
4. **iCarros e Mobiauto:** depois, por parceria.

Enquanto os conectores não ficam prontos, a loja mantém **só o integrador de
anúncios da AutoCerto (R$ 70/mês, mais o plano inicial)** e usa o Zap para o
resto.

### O que falta pedir (Dilon Tech)

- [ ] Mercado Livre: criar o app em developers.mercadolivre.com.br (nome Dilon
      Zap, URL de retorno `https://zap.dilontech.com.br/api/portais/mercadolivre/retorno`).
- [ ] OLX: e-mail ao time de integração pedindo `client_id`/`client_secret` do
      Autoupload, com a mesma URL de retorno (`…/olx/retorno`). O conector já
      está pronto (ver abaixo).
- [ ] Webmotors: cadastro no portal de desenvolvedores e pedido de acesso ao
      ambiente de teste das APIs de Estoque e Leads.
- [ ] Liberar `developers.mercadolivre.com.br` e `developers.olx.com.br` na rede
      da sessão de desenvolvimento, para conferir a documentação atual antes de
      codificar os conectores.

### Conector da OLX (pronto, v1.51.0)

Falta só a credencial da OLX para ligar em produção. Testado ponta a ponta
contra um servidor falso da OLX: `packages/portais/src/sincronizar.test-manual.ts`.

**Como a loja usa:**

1. **Veículos → Portais → Conectar a OLX.** A loja autoriza a conta
   profissional dela na OLX e volta para o Zap.
2. Preenche o **CEP** e o **telefone** dos anúncios. Sem telefone, vale o
   WhatsApp da vitrine.
3. Clica em **Anunciar todos os disponíveis**, ou em "Anunciar na OLX" na
   ficha de cada carro.
4. O Zap escolhe marca, modelo e versão no catálogo da OLX quando a escolha é
   clara. Quando não é, a ficha mostra as listas com o mais parecido primeiro.

**O que o worker faz** (`apps/portais-worker`, a cada minuto):

- **Carro disponível e marcado:** publica.
- **Mudou preço, km, fotos ou descrição:** atualiza. A comparação é pelo hash
  do anúncio montado, então nada é enviado quando nada mudou.
- **Reservado, vendido ou devolvido:** tira do ar. Carro que nunca chegou à
  OLX só sai da fila, sem chamada à API.
- **Lotes enviados:** confere o resultado. Grava o link do anúncio, ou a
  recusa da OLX traduzida ("Placa inválida", "Versão do catálogo da OLX
  inválida: escolha de novo").
- **Falhas:** a nova tentativa espera 5 min, depois 10, 20… até 6 h. Se a
  loja corrige a ficha, o envio sai na hora.
- **Conta sem plano profissional (-6), bloqueada (-2) ou acesso revogado:**
  a conta fica "precisa de atenção" e o Zap para de insistir até a loja
  reconectar.

**Contatos de compradores (leads e chat):**

- **Entrada:** a OLX chama `/api/portais/olx/lead/<token>` a cada contato
  (WhatsApp, telefone, chat, simulação de financiamento). O Zap registra esse
  endereço na OLX sozinho ao conectar a conta (escopo `autoservice`); cada loja
  tem o seu, como a OLX exige.
- **No CRM:** vira negociação com origem "OLX", o carro no título, o valor dele
  e a tarefa de chamar agora (WhatsApp para celular, ligação para fixo). O
  mesmo comprador perguntando de novo pelo mesmo carro soma uma tarefa, sem
  abrir outra negociação. O carro é achado pelo número do anúncio na OLX.
- **Sem duplicar:** a OLX não reenvia o que falha, e pode entregar duas vezes.
  A chave do lead (o `externalId`, ou um hash do contato) é única por loja.
- **Sem telefone:** o lead fica guardado e aparece na aba Portais, com o e-mail.
- **Chat:** a OLX entrega o chat só como aviso ("há uma conversa"). Responder
  no próprio chat, hoje, só no portal; o Inbox não recebe nem responde o chat
  da OLX. A API de chat da OLX (receber e responder por webhook) existe, mas
  o Inbox é amarrado a sessões de WhatsApp, e levar isso para dentro do worker
  do WhatsApp contraria o isolamento que escolhemos. Fica como próxima etapa
  separada, se valer a pena.
- **Segurança do endereço:** token na URL mais uma credencial no header
  `Authorization`, derivada de `PORTAIS_CHAVE`. Sem as duas, 404 ou 401.
- **Loja conectada antes desta versão:** precisa desconectar e conectar de
  novo, para autorizar o escopo dos contatos. O botão "Tentar de novo" na aba
  só repete o registro.
- **Homologação:** a OLX pode pedir para testar o endereço com um anunciante
  real antes de liberar a integração de leads em produção (suporteintegrador@olxbr.com).

**Segurança:**

- **Token da loja:** guardado no banco em AES-256-GCM, com a chave
  `PORTAIS_CHAVE`.
- **Retorno do OAuth:** o `state` é assinado e só vale para a mesma empresa e
  a mesma pessoa logada, por 15 minutos.
- **Fotos:** a OLX baixa de `/api/portais/foto/<id>/<assinatura>.jpg`. O link
  é assinado e só responde enquanto o carro está disponível e anunciado.

**Para ligar em produção:**

- [ ] Pedir à OLX (suporteintegrador@olxbr.com) o `client_id` e o
      `client_secret` do Autoupload, com a URL de retorno
      `https://zap.dilontech.com.br/api/portais/olx/retorno`.
- [ ] No `.env` da VPS, preencher `OLX_CLIENT_ID`, `OLX_CLIENT_SECRET` e
      `PORTAIS_CHAVE` (`openssl rand -base64 32`). Trocar a chave depois
      desconecta todas as lojas.
- [ ] `docker compose -f docker-compose.prod.yml up -d --build web portais-worker`
      e `npm run db:push` (tabelas `PortalConta` e `PublicacaoPortal`).

**Limites desta versão:**

- **Só carros (categoria 2020).** Moto e caminhão usam outros parâmetros na OLX.
- **Chat da OLX no Inbox:** não (ver acima). O contato chega no CRM.

### Mercado Livre e Webmotors (próximos)

- **Mesma estrutura da OLX:** usam as mesmas tabelas (`PortalConta`,
  `PublicacaoPortal` com o portal no enum) e o mesmo motor de decisão
  (`packages/portais/src/decisao.ts`). Cada portal precisa só do seu mapa de
  campos e do seu cliente HTTP.
- **Mercado Livre:** a documentação bloqueia acesso automatizado (403).
  Precisa do app criado no portal de desenvolvedores, com alguém logado.
- **Webmotors:** precisa do cadastro, da homologação, e a loja contrata o
  "API Site".

Fontes:
- [Mercado Livre: publicação de automóveis](https://developers.mercadolivre.com.br/pt_br/publicacao-de-automoveis);
- [Mercado Livre: categorias e atributos](https://developers.mercadolivre.com.br/pt_br/categorias-e-atributos-veiculos);
- [OLX: importação de anúncios](https://developers.olx.com.br/anuncio/home.html);
- [OLX: autenticação](https://developers.olx.com.br/anuncio/api/oauth.html);
- [Webmotors: integrar estoque](https://comercialwebmotors.zendesk.com/hc/pt-br/articles/360056716132-Como-integrar-o-estoque);
- [Webmotors: portal de APIs](https://portal-webmotors.sensedia.com/api-portal/api-browser);
- [Mobiauto: integração via API (manual de terceiro)](https://ajuda.revendamais.com.br/hc/rmais-ajuda/articles/1755098051-integrador-_-adicionar-mobiauto-para-integracao-de-estoque);
- [Meta: campos opcionais do catálogo automotivo](https://www.facebook.com/business/help/1132483410249195).
