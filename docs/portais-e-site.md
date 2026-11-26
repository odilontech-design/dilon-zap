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
      Zap, URL de retorno `https://zap.dilontech.com.br/api/portais/mercadolivre/retorno`),
      com a conta da Dilon Tech (pessoa jurídica) e a permissão **"Publicação e sincronização"**
      (leitura e escrita). Colocar `MERCADOLIVRE_CLIENT_ID` e `MERCADOLIVRE_CLIENT_SECRET` no `.env`
      do servidor (o worker dos portais recebe pelo compose) e reiniciar web e portais-worker.
- [ ] Mercado Livre: pedir ao comercial (veiculos@mercadolivre.com) o **pacote de publicação de veículos**
      da loja (não dá para contratar por API; o preço não é público), a ativação da conta como
      concessionária (car dealer) e um **usuário de teste** ativado como concessionária com pacote.
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

## Webmotors (v1.58.0)

Conector construído sobre o contrato público (SOAP/XML) e testado com um servidor falso; **ainda não homologado**: falta o acesso de desenvolvedor da Webmotors.

- **Conta**: CNPJ + e-mail + senha do sistema de revendedores, guardados cifrados (`PORTAIS_CHAVE`) em `PortalConta`. Painel em Veículos > Portais. O plano dos anúncios (modalidade: Nitro, Acelerador…) vem da Webmotors ao vivo; fica em `PortalConta.planoPadrao`.
- **Regra da gestão**: carro **sem quilometragem informada não é publicado** (nem na Webmotors nem na OLX). O motivo aparece em "Falta para anunciar".
- **Envio**: o `portais-worker` roda `cicloWebmotors` depois da OLX, em tentativa separada. Mesmas decisões (`decisao.ts`): disponível publica, mudou preço/ficha/fotos atualiza, vendido/reservado exclui. Catálogo (marca/modelo/versão/cor/câmbio/combustível/opcionais) resolvido pelo nome; o que não bater vira pendência legível.
- **Env**: `WEBMOTORS_URL_BASE` (padrão produção `https://integracao.webmotors.com.br`; homologação `https://hportal.webmotors.com.br/IntegracaoRevendedor`).
- **Falta**: credenciais de homologação, API de leads (separada do manual), limites de fotos/observação, confirmar se a km vazia é aceita.

## Central de leads por e-mail (v1.59.0)

Na Pista, MobiAuto e Webmotors avisam os contatos de compradores **por e-mail**. A central lê esses e-mails e faz o mesmo que já fazíamos com a OLX: contato + negociação (origem = o portal, carro e valor no título) + tarefa de chamar.

- **Entrada**: Veículos > Portais > Central de leads gera um endereço por loja (`/api/leads/email/<token>`). Aceita e-mail bruto (`message/rfc822`/texto) ou JSON (`raw`, ou `from`/`subject`/`text`/`html`). Falta ligar um provedor de e-mail recebido (Cloudflare Email Routing, Mailgun, Postmark...) que chame esse endereço, e a loja encaminhar os e-mails dos portais para ele.
- **Leitor** (`packages/portais/src/lead-email.ts`): tolerante (rótulos "Nome:", tabela em HTML, encaminhado pelo Gmail). Reconhece o portal por remetente/assunto/corpo. **Ainda não foi ajustado a e-mails reais**: tudo que não entender (portal desconhecido, sem telefone nem e-mail) fica guardado em `EmailDeLead` com o motivo, aparece no painel e serve para afinar o leitor por portal.
- **Carro**: pela placa; senão por modelo + ano quando só um carro do estoque bate.
- **Distribuição**: opcional (`VeiculosConfig.distribuirLeads`); o lead novo vai para o vendedor ativo (papel AGENT) com menos negociações abertas.
- **Relógio**: cada lead mostra "aguardando há X" até alguém marcar como respondido (`LeadPortal.respondidoEm`).
- **Segurança**: sem login, a defesa é o token da URL (trocá-lo invalida o encaminhamento). Mesmo e-mail (Message-ID) não duplica; falha ao registrar devolve 5xx para o provedor tentar de novo.
- **Falta**: provedor de e-mail recebido; exemplos reais de e-mail de cada portal; leads da MobiAuto via webhook `lead-callback` e da Webmotors via API de leads (quando houver acesso).

## SEO e busca por IA da vitrine (v1.60.0)

- **Títulos e descrições** por carro: "Honda Civic EXL 2017/2018 por R$ 90.000 | Loja" e descrição com ano, km (só se informada), câmbio, combustível, cor; `robots` com `max-image-preview: large`, Twitter card, `siteName`/`locale`.
- **Dados estruturados**: `Car` com `@id`, `sku`, `priceValidUntil`; `BreadcrumbList` na página do carro; `AutoDealer` na vitrine (já existia).
- **robots.txt** (`lib/vitrine-seo.ts`): convida os rastreadores de IA (GPTBot, OAI-SearchBot, ChatGPT-User, PerplexityBot, ClaudeBot, Claude-SearchBot, Google-Extended, Applebot-Extended, Bingbot) e **libera as fotos** (`/api/loja/*/fotos/`), que antes ficavam bloqueadas por `Disallow: /api/` e fora do Google Imagens.
- **sitemap.xml** com `lastmod` e fotos de cada carro.
- **llms.txt** (`/llms.txt` no domínio próprio; `/api/loja/<slug>/llms` no do Zap): contato, páginas e todo o estoque em texto com preço e link.
- **Falta**: redesenho visual; enviar o sitemap ao Google Search Console e conferir a indexação (feito pela loja/Dilon Tech após o domínio no ar).

## Páginas por marca e modelo (v1.61.0)

`/loja/<slug>/marca/<marca>` e `/loja/<slug>/marca/<marca>/<modelo>` (ex.: "Honda Civic usado em Duque de Caxias | Sales Automóveis"). Só existem para o que há **em estoque agora** (marca ou modelo sem carro responde 404, para não publicar página vazia).

- Título, descrição, abertura e `H1` com a **cidade** tirada do fim do endereço da loja ("... - Duque de Caxias - RJ"); se não der para ter certeza, sai sem cidade (cadastre o endereço no formato "Rua, nº - Bairro, Cidade - UF").
- `ItemList` e `BreadcrumbList` em JSON-LD, canônico e Open Graph próprios.
- Entram no sitemap e no llms.txt ("Por marca"), e a vitrine ganha um bloco de links "Carros usados em <cidade> por marca e modelo" (ligação interna que o Google e as IAs seguem).
- Código em `lib/vitrine-seo.ts` (puro, testado) e `app/loja/[slug]/marca/`.

## Visual da vitrine (v1.62.0)

- **Cabeçalho e rodapé escuros** por padrão (valorizam logos prateadas/claras, como a da Sales), com filete na cor da loja; opção "Cabeçalho e rodapé claros" em Veículos > Configurações > Aparência (`VeiculosConfig.cabecalhoClaro`, só adição).
- **Abertura (hero)** com fundo escuro (ou o banner da loja), chamada com a cidade, `H1` com o nome da loja e dois botões: Ver estoque e Simular financiamento.
- **Lista**: barra de busca em cartão, atalhos das marcas com mais carros, cartões maiores com zoom na foto, selo "Novidade" (7 dias) e "Reservado", contagem de fotos, chips de ano/km/câmbio/combustível e preço em destaque. Responsivo (filtros em 2 colunas no celular).

**Marca de duas cores (v1.62.0).** Além da cor da loja, `VeiculosConfig.corSecundaria` (Configurações > Aparência > "Segunda cor"): a primeira vira os tons escuros do cabeçalho, da abertura e do rodapé (a cor misturada com preto, calculada em `escurecer`), e a segunda os destaques (botão "Ver estoque", menu ativo, selos, filete). Sem segunda cor, os destaques usam a primeira. Para a Sales: cor da loja `#B01218` e segunda cor `#FFC800`.

## Revisão de UX da vitrine pública (v1.65.0)

Refeita a navegação pública inteira, pensando em quem chega pelo celular vindo do Google ou do Instagram:

- **Correção**: a foto grande da página do carro esticava a página (imagem fora da moldura). Agora toda foto fica dentro da moldura (posição absoluta) e a galeria aceita deslizar o dedo. Os cartões também deixaram de mostrar a foto "encolhida" com faixas brancas.
- **Faixa de contato** no topo (WhatsApp, cidade, horário), **cabeçalho** com menu (no celular, o menu abre numa lista) e botão do WhatsApp; **botão flutuante do WhatsApp** em todas as páginas (na página do carro, no celular, some: a barra fixa "Tenho interesse" já faz o papel).
- **Abertura**: título com a cidade, **busca rápida** (marca ou modelo, valor máximo, câmbio) que leva à lista já filtrada (`?q=…&max=…&cambio=…#estoque`) e três atalhos (estoque, financiamento, avaliação do carro).
- **Faixa "Procure por marca"** com o símbolo das montadoras (SVG embutido, `lib/marcas-logos.ts`, gerado do pacote simple-icons, CC0; marcas sem símbolo mostram as iniciais) e link para a página de SEO da marca.
- **Lista**: busca, marca, preço e ordenação à vista; modelo, ano, câmbio e combustível em "Mais filtros"; "Limpar filtros"; estado vazio com saída. O selo "Novidade" só aparece quando é raro (até 30% do estoque).
- **Cartão do carro**: cartão todo clicável, chips (ano, km, câmbio, combustível), preço em destaque e botão de WhatsApp que já fala do carro.
- **Página do carro**: trilha (Estoque › Marca › Modelo), card de preço fixo ao rolar com "Tenho interesse", "Simular financiamento" e "Ver endereço e agendar visita", compartilhar, descrição, opcionais, ficha técnica e **"Você também pode gostar"** (mesmo modelo, marca ou preço próximo).
- **Cores**: cabeçalho, abertura e rodapé usam um tom quase preto da cor da loja; a cor principal vai nos botões de chamada e a **segunda cor** nos destaques (título, filete, selos). Sem segunda cor, o destaque é um tom claro da principal. Para a Sales: principal `#B01218`, segunda `#FFC800`.

**Fotos sem cortes (v1.65.0).** A capa da Sales é uma arte quadrada com o carro, o ano, a versão e o telefone escritos na imagem; cortar para 4:3 cortava esse texto. `components/foto-sem-cortes.tsx` mostra a foto **inteira** (`object-contain`) sobre uma cópia dela desfocada (sem faixas brancas), na vitrine (cartões quadrados, galeria e miniaturas) e no painel (estoque e ficha). Para outras lojas, foto comum em qualquer proporção também fica inteira.

## Webmotors pelo Cockpit: credencial de integrador, adoção e troca de sistema (v1.69.0)

**Como a loja liga o Zap à Webmotors.** No Cockpit da loja: Integrações > **Estoque terceiro** > "+ Adicionar credencial" (tela "integrador"): escolher o integrador, informar um e-mail e criar uma senha. Esse e-mail e essa senha, mais o **CNPJ da loja**, são exatamente o que o Zap pede em Veículos > Portais > Webmotors (o `autenticar(cnpj, email, senha)` do serviço). A AutoCerto já aparece nessa lista com a credencial dela. Pendente: confirmar se "Dilon Tech" aparece na lista de integradores do Cockpit (senão, é preciso o cadastro como integrador no Portal do Desenvolvedor da Webmotors).

**Conferido contra o WSDL real** (`wsEstoqueRevendedorWebMotors.asmx?WSDL`, 29 operações): nomes e parâmetros de todas as operações que o conector usa, e a ordem dos campos de `Anuncio`, batem com o contrato.

**Adoção de anúncio existente.** Antes de criar um anúncio, o ciclo lista o que a loja já tem (`ObterEstoqueAtualPaginado`) e casa **pela placa**: se o carro já está lá (publicado pela AutoCerto, pelo Cockpit...), o Zap guarda o código existente, atualiza os dados e as fotos e **mantém o plano em que o anúncio já estava**, em vez de criar um segundo anúncio.

**Conferir com a Webmotors** (botão no painel, só leitura): mostra quantos anúncios a loja tem lá, quantos casam com o estoque do Zap pela placa (seriam adotados), quais carros só existem no Zap e quais anúncios só existem na Webmotors. É o ensaio da troca.

**Roteiro da troca de sistema (AutoCerto → Zap)**
1. Conectar a Webmotors no Zap com a credencial nova e rodar **Conferir** (nada é publicado).
2. Resolver as diferenças (carros sem placa, sem km, sem fotos).
3. Em horário calmo: "Anunciar todos" no Zap (adota os anúncios existentes e passa a ser a fonte das fotos e dos preços).
4. No mesmo dia, **remover a credencial da AutoCerto** no Cockpit (Estoque terceiro), para os dois sistemas não disputarem o anúncio.
5. Repetir com MobiAuto e Na Pista quando os conectores existirem. Enquanto isso, a AutoCerto continua publicando nesses dois: só desligue a AutoCerto quando os três estiverem cobertos.

## MobiAuto (v1.70.0)

Conector construído sobre o **Swagger público** (`open-api.mobiauto.com.br/v2/api-docs?group=open-api-1.0`, 84 caminhos) e testado com uma MobiAuto falsa + Postgres. **Ainda não rodou contra a MobiAuto de verdade**: falta o app OAuth (client id/secret) que a MobiAuto libera para a Dilon Tech.

- **Acesso**: OAuth2 por código de autorização (Keycloak, `auth.mobiauto.com.br`). A loja entra com o usuário do Mobigestor e autoriza o Zap (a senha não passa pelo Zap); guardamos a loja (`dealerId`) e os tokens cifrados (`PORTAIS_CHAVE`) e renovamos o token sozinhos. Variáveis: `MOBIAUTO_CLIENT_ID`, `MOBIAUTO_CLIENT_SECRET`; URL de retorno a cadastrar na MobiAuto: `<NEXTAUTH_URL>/api/portais/mobiauto/retorno`. (Opcionais para teste: `MOBIAUTO_API_URL`, `MOBIAUTO_AUTH_URL`.) A loja Sales é o dealer **26274**.
- **Painel** (Veículos > Portais > MobiAuto): conectar, escolher a loja (se o usuário gerencia várias) e o plano, "Anunciar todos", "Conferir com a MobiAuto" (só leitura, casa pela placa) e a linha por carro na ficha.
- **Envio** (worker dos portais, `cicloMobiauto`, depois da OLX e da Webmotors, em tentativa separada): cria ou atualiza o *deal*, troca as fotos por endereço, publica no plano (`PUT …/publish?planId=`). **Adota** o deal que já existe pela placa (sem duplicar e sem republicar o que já está publicado). Reservado: despublica e mantém o deal; vendido/devolvido: despublica e apaga o deal. **Sem km informada não publica.**
- **Catálogo** por nome (marca → modelo → versão/*trim* filtrada pelo ano, cor, câmbio, combustível, opcionais), com pendências legíveis, como nas outras integrações.
- **Falta / a confirmar com a MobiAuto**: o fluxo de autorização liberado para a Dilon Tech (código de autorização ou outro), campos obrigatórios do deal em produção, e os **leads** (webhook `lead-callback`: o formato do corpo não está no Swagger; usar `test-callback` quando houver acesso).
- **Troca de sistema** (Sales): além da AutoCerto, desativar a integração **WebMotors** e a **Meu Carro Novo** no Mobigestor (aba Integrações > Estoque), que também empurram estoque.

## NaPista (v1.74.0)

Conector construído sobre a **documentação oficial** (`developers.napista.com.br`, API "seller-inventory-api") e testado com um NaPista falso + Postgres. **Ainda não rodou contra o NaPista de verdade**: falta o `client_id` da Dilon Tech (pedido em andamento; a URL de retorno informada foi `https://zap.dilontech.com.br/api/portais/napista/retorno`).

- **Acesso**: OAuth2 por código de autorização (Keycloak, realm `marketplace-dealer`) com **cliente público** (só `client_id` e URL de retorno, sem segredo). O lojista entra com o mesmo usuário e senha do NaPista e autoriza; guardamos a loja (`sellerId`, de `GET /seller/access`) e os tokens cifrados, e renovamos o token sozinhos.
- **Variáveis**: `NAPISTA_CLIENT_ID`; `NAPISTA_AMBIENTE=development` enquanto o acesso for só ao ambiente de desenvolvimento (`api.development.napista.com.br` / `auth.development.napista.com.br`); sem ela, produção. (Para teste: `NAPISTA_API_URL`, `NAPISTA_AUTH_URL`.)
- **Anúncios** (`cicloNapista` no worker dos portais, depois da MobiAuto): `POST /seller/{id}/offer`, `PATCH …/offer/{id}`, fotos por endereço (`POST …/photos/url`, substitui as anteriores), status (`PUT …/offer/{id}/{status}`). Reservado → `UNPUBLISHED`; vendido → `SOLD`; devolvido ou desligado pela loja → apagado. **Adota** pela placa o anúncio que já existe (no ar, pausado ou rascunho). O NaPista não tem plano por anúncio na API.
- **Tradução**: versão pelo catálogo (marca → modelo → versão, filtrados pelo ano); cor, combustível e câmbio viram os valores fixos do NaPista (CVT/automatizado = automático); opcionais reconhecidos viram equipamentos. Cor fora da lista do NaPista vira pendência.
- **Km**: a API do NaPista aceita anúncio sem km, mas a regra da gestão vale: **sem km informada o Zap não publica**.
- **Leads**: a API é de consulta (`GET /seller/{id}/leads`), então o cron `/api/cron/napista-leads` (a cada 10 min, com `CRON_SECRET`) busca os últimos 3 dias e registra os novos no CRM (contato + negociação + tarefa), com o carro pela placa e, em simulação de financiamento, entrada, parcelas e "crédito pré-aprovado".
- **Escolher a versão (v1.111.0)**: o Zap escolhe sozinho a versão do catálogo só quando a melhor opção é clara. A versão da ficha (importada do site, tipo "1.6 16V SCE FLEX DYNAMIQUE X-TRONIC") quase nunca bate letra a letra com a do NaPista, então muitos carros ficavam parados em "Versão não identificada". Em **Veículos > Portais > NaPista > "Escolher as versões pendentes"** a gestão vê, carro a carro, a versão da ficha e a lista do catálogo (a mais parecida já marcada quando a nota é 0,5 ou mais), confere e salva. O carro volta à fila e o worker publica no próximo ciclo. O servidor só aceita versão que exista no catálogo daquele carro. Marca ou modelo que o NaPista não reconhece para aquele ano aparecem com o motivo, sem lista. API: `GET/POST /api/portais/napista/versoes` (só gestão, sempre da loja da sessão, registrada na auditoria).
- **Contrato real do NaPista, conferido na documentação (v1.115.0)** (que é fechada por senha; páginas "Cadastrar Anúncio", "Fotos Anúncios" e "Listar Características dos Veículos"):
  - **Fotos**: o cadastro e a atualização do anúncio **ignoram** fotos. As fotos entram por endpoints próprios: `POST …/offer/{id}/photos/url` (`{ list: [{ url, order }] }`) **soma** às que já existem, `DELETE …/offer/{id}/photos` apaga todas e `DELETE …/photos/{fotoId}` apaga uma. Por isso o erro 412 "maximum number of photos…": cada ciclo empilhava mais 20. Agora o Zap **apaga as fotos antes de reenviar** (exceto no anúncio recém-criado) e, se o limite do NaPista for menor que 20, reduz a lista em passos e aprende o limite.
  - **Valores aceitos** (cor, combustível, câmbio, equipamentos): vêm de `GET /catalog/attributes?category=CAR` (`{ colors, fuelTypes, … : { items: [{ id, name }] } }`). O Zap busca essa lista uma vez por rodada e só envia valores que existem nela: o código do equipamento é casado sem diferenciar maiúsculas (a ficha dava `CAR_2_4x4`, o NaPista pode ter `CAR_2_4X4`), a cor também casa pelo nome em português, e equipamento que não existe na lista sai do envio (o texto fica na descrição). Se o NaPista ainda devolver 400, o Zap repete sem equipamentos e, persistindo, o erro do carro mostra o que foi enviado (`| enviado: {...}`).
  - **Campos obrigatórios** do cadastro: `versionId`, `transmissionType`, `color`, `fuelType`, `price`, `manufacturedYear`, `modelYear`. **A quilometragem não é obrigatória na API do NaPista**; a regra do Zap (sem km real não publica) é da gestão, não do NaPista.
  - **Status**: o cadastro não lista `status`. O Zap cria **sem status**, envia as fotos, lê o anúncio (`GET …/offer/{id}`, que traz `status` e `photos`) e só então publica (`PUT …/{status}`), para nunca deixar no ar um anúncio sem foto.
  - Código: `packages/portais/src/napista/envio.ts` (fotos e equipamentos), `napista/mapa.ts` (`valorAceitoNapista`), `napista/cliente.ts` (`atributos`, `oferta`, `apagarFotos`).
- **Quilometragem em massa**: o aviso "carro sem km" agora leva para **Veículos > Completar** (tabela para digitar a km de vários carros de uma vez).
- **Teste x produção (v1.120.0)**: o Zap só falava com o **NaPista de teste** (`NAPISTA_AMBIENTE=development`, loja "Dilontech Integrator", fotos em `marketplace.development.napista.com.br`): os anúncios existiam só lá e nunca apareceram em napista.com.br. Para ir à produção: (1) o NaPista precisa liberar o **`client_id` de produção** da Dilon Tech e registrar a URL de retorno `https://zap.dilontech.com.br/api/portais/napista/retorno` nele (o `client_id` de teste não vale em produção); (2) no servidor, trocar `NAPISTA_CLIENT_ID` pelo de produção e **tirar** `NAPISTA_AMBIENTE` (web e worker dos portais), e reiniciar os dois; (3) a gestão reconecta a loja em **Veículos > Portais > NaPista** com o login do NaPista da loja real (Sales Automóveis). A partir desta versão a conexão guarda o ambiente em que foi feita: ao trocar de ambiente, o Zap **desconecta a loja sozinho** (mensagem pedindo para reconectar) e devolve os anúncios à estaca zero (sem código de anúncio nem versão escolhida, que são do ambiente de teste); em produção ele cria os anúncios ou **adota pela placa** os que o AutoCerto já tem lá. Conexões anteriores à marcação contam como de teste.
- **Km que parece número padrão (v1.120.0)**: nenhum portal (OLX, Webmotors, MobiAuto, NaPista, Mercado Livre) recebe carro com **menos de 100 km e dois anos ou mais de idade** (ex.: 1 km num carro de 2015): o erro do carro diz para corrigir a km real em Veículos > Completar. O estoque importado trazia 1 km e já tinha sido enviado ao ambiente de teste. Zero km e carros do ano não são afetados. Código: `packages/portais/src/km.ts`.
- **A confirmar com o NaPista**: a unidade do preço (o contrato diz inteiro; assumimos **reais, sem centavos**), se o `sellerId` em `/leads` é o mesmo de `/seller/access`, limites de requisição e a passagem do `client_id` de desenvolvimento para produção.

## Meu site, no jeito do AutoCerto (v1.75.0)

A aba **Veículos > Meu site** (antes "Vitrine") reúne o que a loja controla no site, com a mesma organização do AutoCerto, que é o que a equipe conhece:

- **Início**: site no ar ou desligado, domínio, veículos no site, contatos pelo site nos últimos 30 dias (com a variação sobre os 30 anteriores), contatos por formulário (proposta no anúncio, ficha de financiamento, venda seu carro), **"Precisa de atenção"** (site desligado, sem logo, sem WhatsApp, sem banner, sem destaque, destaque que já foi vendido, carro sem foto ou sem preço, "Quem somos" vazio) e **últimas alterações** (quem mudou o quê, pelo log de auditoria).
- **Banners** (`BannerVitrine`): até 10, imagem de computador (1920 × 600) e, opcional, de celular; título e link (página do site ou https). Ordem por setas, pôr/tirar do ar, apagar. No site, carrossel no topo da página inicial (passa a cada 6 s, para com o mouse, setas e bolinhas). Imagem servida por `/api/loja/<slug>/banner/<id>` (só banner ativo de loja no ar).
- **Destaques e ofertas**: até 8 carros em destaque, na ordem escolhida ("Últimas ofertas" na página inicial; carro vendido sai sozinho) e a **oferta que abre ao entrar no site** (janela com o carro, uma vez por visita).
- **Páginas**: redes sociais e **Quem somos** (título e texto), com página própria `/quem-somos` no menu, no sitemap e no llms.txt.
- **Aparência, dados e domínio**: a tela que já existia (logo, cores, dados da loja, WhatsApp, domínio, pixel e Analytics).
- Schema (só adições): `BannerVitrine`; em `VeiculosConfig`: `destaques`, `ofertaVeiculoId`, `quemSomosTitulo`, `quemSomosTexto`.

## Trazer do site atual (v1.76.0)

Em **Meu site > Início**, o quadro **Trazer do site atual** copia do site que a loja já tem (o do AutoCerto) o que a home e a página da empresa mostram, para o site novo nascer igual ao antigo:

- **Banners do topo**: as imagens de fundo dos blocos `.banner`, na ordem, baixadas com as mesmas proteções do download de fotos (só endereço público, só JPG/PNG/WEBP) e guardadas como banners com título `Do site atual: <arquivo>`. É por esse título que um banner não é trazido duas vezes.
- **Últimas ofertas**: os carros do bloco "Últimas ofertas" viram os destaques, casados pelo id do carro no site antigo (`Veiculo.siteOrigemId = autocerto:<id>`). Só entram os carros já importados e à venda, por isso é preciso importar o estoque antes (Veículos > Importar).
- **Quem somos**: o título (a frase em destaque) e os parágrafos do corpo da página da empresa, nunca o resumo cortado do rodapé.

Nada é apagado. Destaques e Quem somos só são preenchidos se estiverem vazios, a não ser que a pessoa marque **Substituir**. O endereço digitado **não** é guardado em `siteOrigemUrl`, porque esse campo liga o espelho do estoque. Rota: `POST /api/veiculos/site/trazer` (`{ endereco?, substituir? }`), registrada na auditoria como `site.trazer`. Teste: `apps/web/lib/trazer-do-site.test-manual.ts` (aceita, opcionalmente, as páginas salvas de um site real para mostrar o que sairia delas).

## Meu site: Dados da loja, WhatsApp e Avançado (v1.77.0)

Três abas novas em **Meu site**, no jeito do AutoCerto:

- **Dados da loja**: CEP (preenche rua, bairro, cidade e estado pelo ViaCEP, direto do navegador), endereço e número, bairro, cidade, estado, até 3 telefones (WhatsApp, celular ou fixo), o mapa (liga/desliga e um ponto exato, colando o link do Google Maps ou as coordenadas) e o horário por faixa (segunda a sexta, sábado e domingo; em branco aparece "Fechado"). Ao salvar, o Zap monta os campos antigos `endereco` e `horario` (que o site, o SEO e os feeds já leem) e, como no AutoCerto, leva o CEP e o 1º telefone para os anúncios dos portais (`cepAnuncios`/`telefoneAnuncios`).
- **WhatsApp**: o número do botão e a mensagem que já vem escrita, com prévia. Vale para o botão flutuante, o rodapé e a Localização. Nos anúncios dos carros, a mensagem continua levando o carro e o link.
- **Avançado**: em vez de colar scripts, só os IDs: Pixel da Meta, Google Analytics 4, Google Ads (`AW-…`) e Google Tag Manager (`GTM-…`), conferidos pelo formato porque vão para dentro de um script. O **GTM só carrega no domínio próprio da loja**: é código livre, e o endereço do Zap (`/loja/<slug>`) é o mesmo do painel onde a equipe fica logada. O DNS do domínio não é gerido pelo Zap (ver abaixo).

Endereço, horário, WhatsApp, Pixel e GA4 saíram da tela "Aparência e domínio" (o `PUT /api/veiculos/config` só mexe neles se receber o campo). Rota nova: `GET/PUT /api/veiculos/site/loja` (`secao`: `dados` | `whatsapp` | `avancado`), na auditoria como `site.dados`, `site.whatsapp`, `site.avancado`. Teste: `apps/web/lib/dados-da-loja.test-manual.ts`.

**Na troca do domínio (AutoCerto → Zap):** no AutoCerto, o DNS do domínio fica com eles (aba Avançado > Entradas de DNS). Antes de mudar o domínio de lugar, copie todas as entradas de e-mail (MX, TXT/SPF e o `autodiscover`) para o novo DNS; só a entrada do site (`www`) passa a apontar para o Zap. Sem isso, o e-mail da loja para de funcionar.

## Ficha de financiamento completa (v1.78.0)

Em **Meu site > Páginas > Financiamento** a loja escolhe entre o **formulário curto** de sempre (nome, WhatsApp, carro e entrada) e a **ficha completa**, como a do AutoCerto: dados pessoais (sempre: nome, CPF validado, nascimento, WhatsApp, e-mail, estado civil, CNH) e, se ligados, endereço (CEP pelo ViaCEP), dados profissionais, cônjuge, de 0 a 3 referências pessoais, de 0 a 2 referências bancárias e veículo e financiamento (carro do estoque, entrada, valor a financiar e parcelas). Os campos ficam em `lib/ficha-campos.ts` (formulário, conferência no servidor e a tela da negociação usam a mesma lista).

Cuidados com os dados (LGPD), em `lib/ficha-financiamento.ts`:
- o cliente marca que autoriza o uso para a análise de crédito (fica guardado com data e hora); a política de privacidade padrão passa a citar os dados da ficha;
- a ficha fica **cifrada** (AES-256-GCM) em `FichaFinanciamento.dados`; a negociação, a tarefa e o contato levam só nome, WhatsApp, carro e entrada;
- na negociação, o quadro **Ficha de financiamento** lista as fichas sem dados; **Abrir** mostra a ficha (e permite imprimir/PDF) e cada abertura vai para a auditoria (`negociacao.ficha.ver`); **Apagar** é da gestão;
- a ficha se apaga sozinha em **180 dias** (a limpeza roda a cada ficha nova e a cada consulta).

Chave: `FICHAS_CHAVE` (32 bytes em base64), se existir; senão, uma chave derivada de `PORTAIS_CHAVE` (HKDF, rótulo próprio). Sem nenhuma das duas, a opção da ficha completa fica desligada e o site usa o formulário curto. **Trocar a chave torna ilegíveis as fichas já guardadas.** Rotas: `GET/PUT /api/veiculos/site/ficha`, `GET/DELETE /api/negociacoes/[id]/ficha`, e o `POST /api/loja/[slug]/financiamento` aceita `{ ficha, consentimento }`. Teste: `apps/web/lib/ficha-financiamento.test-manual.ts`.

## Estilo clássico do site (v1.80.0)

Em **Aparência e domínio > Estilo do site**, a loja escolhe entre **Moderno** (o padrão: cabeçalho escuro, menu em botões, busca na abertura) e **Clássico**, que repete a identidade dos sites AutoCerto, a que a loja e os clientes dela já conhecem:

- faixa na cor da loja com o logo grande à esquerda e, à direita, **Endereço** e **Telefone** (rótulos na segunda cor, telefones de WhatsApp com o ícone verde);
- menu numa faixa da **segunda cor**, com texto na cor da loja e ícones, na ordem do AutoCerto (Home, Quem somos, Veículos, Financiamento, Localização, Venda seu carro), preso no topo ao rolar;
- logo abaixo dos banners, a faixa cinza **Encontre seu veículo** (marca, modelo, preço de/até, ano de/até e **Localizar**), que leva à lista já filtrada (`?min=` e `?anoate=` são novos na lista);
- abas de **Facebook, Instagram e WhatsApp** presas na lateral direita no computador; no celular, o botão verde de sempre e uma faixa da segunda cor abaixo do cabeçalho.

Campo novo: `VeiculosConfig.estiloSite` (`"moderno"` | `"classico"`, padrão `"moderno"`). Componentes: `app/loja/[slug]/classico.tsx` e `busca-classica.tsx`. Para ficar igual ao site antigo da Sales, use as cores dele: `#A50303` (vermelho) e `#FECB00` (amarelo).

## Ajustes do estilo clássico e rodapé novo (v1.81.0)

- **Logo sempre à vista**: no computador, quando a faixa da cor da loja sai da tela, o logo aparece à esquerda do menu preso no topo, num bloco da cor da loja (`menu-fixo.tsx`). No celular, a faixa com o logo fica presa no topo.
- **Capas sólidas no clássico**: sem a cópia desfocada atrás da foto; a arte da loja aparece sobre fundo branco (classes `foto-desfoque` e `foto-moldura`, regra em `app/globals.css`), nos cartões e na galeria.
- **Filtros da lista alinhados**: uma linha só, todos com rótulo (Buscar, Marca, Preço até, Ordenar); "Mais filtros" abre a segunda linha.
- **Últimas ofertas sem buraco**: se um destaque foi vendido, a linha é completada com os carros mais recentes (até 8; `completarDestaques` em `lib/meu-site.ts`).
- **Rodapé novo** (todos os estilos, `rodape.tsx`): marca, resumo e redes; páginas; contato com todos os telefones, endereço e "Como chegar"; horário em colunas; embaixo, direitos, privacidade e **"Desenvolvido por Dilon Tech"** com o símbolo, levando à página de vendas do Zap para revendas (`zap.dilontech.com.br/revenda-de-veiculos`, com `utm_source=site-loja&utm_medium=rodape&utm_campaign=<slug>` para saber de qual loja veio).

### Conector do Mercado Livre (v1.106.0, só testado contra servidor falso)

Anúncios classificados de veículos (`buying_mode: classified`, categoria Carros e Caminhonetes `MLB1744`,
`listing_type_id: silver`, canal `marketplace`). Escrito a partir da documentação oficial lida em 26/11/2026
("Publicação de automóveis", "Gerenciamento de pacotes de veículos" e "Permissões funcionais"). Código:
`packages/portais/src/mercadolivre/{cliente,mapa}.ts`, `sincronizar-mercadolivre.ts`; web em
`apps/web/lib/portais-mercadolivre.ts` e `app/api/portais/mercadolivre/*`; tela em Veículos > Portais.

**Como a loja usa:** Veículos > Portais > Mercado Livre > Conectar (OAuth com a conta da loja) > Anunciar todos os
disponíveis (ou Publicar por carro em Veículos > Anúncios). A tela mostra as **vagas do pacote** e o que impede um carro
de subir. O worker dos portais cria, atualiza, pausa (reservado), fecha (vendido) e fecha e exclui (desligado ou devolvido).

**Regras:** carro sem km informada não sobe (nunca vai como 0 km); precisa de preço, foto, **placa**, **chassi (6 últimos
caracteres)** e o **WhatsApp da loja** com DDD (a API exige `seller_contact.country_code2` e `phone2` para perfil de
concessionária desde 01/10/2026). Só se cria anúncio com **vaga no pacote**: sem vaga, o carro fica com o aviso e tenta de
novo em 1 hora, sem derrubar a conta. A descrição é enviada à parte (POST /items/{id}/description) e sai sem telefone,
e-mail ou site (o Mercado Livre penaliza). Até 6 fotos (limite da documentação lida). O refresh token é de uso único: o
novo é gravado na hora (testado no servidor falso).

**O que NÃO está validado contra a API real** (confirmar quando houver o app e o usuário de teste):
1. Rotas e corpos de pausar, reativar, fechar e excluir (`PUT /items/{id}` com `status` e `deleted`): seguem o padrão geral da API,
   não estão na documentação lida.
2. Troca do refresh token e o formato exato do `GET /users/{id}/classifieds_promotion_packs` (usamos `status`,
   `package_content` e `remaining_listings`, como na documentação).
3. Atributos por NOME (`value_name`): marca, modelo, versão (`TRIM`), cor, combustível, câmbio. Se o Mercado Livre
   recusar algum valor, o motivo aparece no carro; pode ser preciso mapear por id de catálogo.
4. `location` (só `address_line` e `zip_code`) e o limite de 6 fotos.
5. Atualização de anúncio publicado: o Mercado Livre pode não deixar trocar alguns atributos.
6. Leads (perguntas dos compradores) ainda não entram no CRM: ficam no e-mail da loja.
7. Adoção de anúncio que a loja já tenha por placa (como no NaPista) não existe ainda.

Teste: `packages/portais/src/sincronizar-mercadolivre.test-manual.ts` (servidor falso que aplica as regras da documentação).
