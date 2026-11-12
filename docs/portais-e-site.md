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
      Autoupload, com a mesma URL de retorno (`…/olx/retorno`).
- [ ] Webmotors: cadastro no portal de desenvolvedores e pedido de acesso ao
      ambiente de teste das APIs de Estoque e Leads.
- [ ] Liberar `developers.mercadolivre.com.br` e `developers.olx.com.br` na rede
      da sessão de desenvolvimento, para conferir a documentação atual antes de
      codificar os conectores.

### Desenho dos conectores (próxima etapa)

- **Por empresa:** a conta de cada portal (tokens OAuth guardados
  criptografados e renovados sozinhos).
- **Por carro:** em quais portais anunciar. Cada publicação tem situação (na
  fila, publicado, erro com o motivo do portal, removido), id e link do anúncio
  no portal.
- **Sincronização automática** por uma fila no Postgres, num processo próprio,
  como o do Vendedor IA:
  - carro novo e disponível: publica;
  - preço ou fotos mudaram: atualiza;
  - reservado: pausa;
  - vendido ou devolvido: remove.
- **Leads dos portais** (perguntas do ML, chat da OLX, API de Leads da Webmotors)
  entram no Inbox ou no CRM com o carro vinculado.
- Cada conector implementa a mesma interface: `publicar`, `atualizar`,
  `pausar`, `remover` e `buscarLeads`.

Fontes:
- [Mercado Livre: publicação de automóveis](https://developers.mercadolivre.com.br/pt_br/publicacao-de-automoveis);
- [Mercado Livre: categorias e atributos](https://developers.mercadolivre.com.br/pt_br/categorias-e-atributos-veiculos);
- [OLX: importação de anúncios](https://developers.olx.com.br/anuncio/home.html);
- [OLX: autenticação](https://developers.olx.com.br/anuncio/api/oauth.html);
- [Webmotors: integrar estoque](https://comercialwebmotors.zendesk.com/hc/pt-br/articles/360056716132-Como-integrar-o-estoque);
- [Webmotors: portal de APIs](https://portal-webmotors.sensedia.com/api-portal/api-browser);
- [Mobiauto: integração via API (manual de terceiro)](https://ajuda.revendamais.com.br/hc/rmais-ajuda/articles/1755098051-integrador-_-adicionar-mobiauto-para-integracao-de-estoque);
- [Meta: campos opcionais do catálogo automotivo](https://www.facebook.com/business/help/1132483410249195).
