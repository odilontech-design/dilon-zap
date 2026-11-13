# APIs da Webmotors e da MobiAuto (lidas em 13/11/2026)

Fontes públicas, abertas sem login:
- **Webmotors:** manual `https://integracao.webmotors.com.br/manualintegracao/index.html` e os contratos
  WSDL em `https://integracao.webmotors.com.br/<serviço>.asmx?WSDL`.
- **MobiAuto:** Swagger em `https://open-api.mobiauto.com.br/swagger-ui.html` (especificação em
  `/v2/api-docs?group=open-api-1.0`, 84 caminhos).
- **Na Pista:** nada público encontrado. Sem documentação, fica por último.
- A central de ajuda do Cockpit (`ajuda.cockpit.com.br`) responde 403 a acesso automatizado; ler no navegador.

> Tudo abaixo vem da documentação. **Nada foi testado contra os servidores deles**: falta credencial (homologação
> na Webmotors; cliente OAuth e `dealerId` na MobiAuto).

## Webmotors: serviços web SOAP/XML

**Autenticação.** `wsLoginSistemaRevendedor.asmx` → `autenticar(cnpj, email, senha)` devolve um `HashAutenticacao`
válido por 1000 minutos, usado em todas as outras chamadas. O e-mail é o de um **usuário de integração** que a
loja cria no Cockpit (a loja também precisa do pacote "API Site"; ver `docs/portais-e-site.md`). Códigos de retorno:
400 falha inesperada, 401 hash inválido, 402 sessão expirou, 403 sem permissão, **500 sucesso**.

**Ambientes.** Produção `https://integracao.webmotors.com.br/…`; homologação
`https://hportal.webmotors.com.br/IntegracaoRevendedor/…` (mesmos nomes de serviço). Os serviços
`wsEstoqueRevendedor.asmx` e `wsCodigosWebMotors.asmx` estão marcados como **obsoletos** no manual; o vigente é o
unificado **`wsEstoqueRevendedorWebMotors.asmx`** (29 operações).

**Operações do serviço unificado.** Catálogo: `ObterMarca`, `ObterModelo(codigoMarca)`, `ObterVersao(codigoModelo, datas)`,
`ObterCor`, `ObterCombustivel`, `ObterCambio`, `ObterNumeroPortas`, `ObterOpcionais`, `ObterModalidade`.
Estoque: `ObterEstoqueAtual` e `ObterEstoqueAtualPaginado(pagina, tamanho)`, `IncluirCarro(anuncio)`,
`AlterarCarro(anuncio)`, `ExcluirCarro(codigoAnuncio, motivoExclusao)`, `TrocarModalidadeCarro(codigoAnuncio, codigoModalidade)`.
Mídia: `IncluirFotoUrl(urlImagem, codigoAnuncio)` (**foto por endereço**, como na OLX), `IncluirFoto`/`IncluirFotoNew`
(envio do arquivo), `ExcluirFoto`, `ObterFotosCarro`, vídeo e foto-animação.

**O anúncio (`Anuncio`).** Campos **obrigatórios**: `CodigoAnuncio`, `CodigoModalidade`, `CodigoMarca`, `CodigoModelo`,
`CodigoVersao`, `AnoDoModelo`, `AnoFabricacao`, **`Km`**, `CodigoCambio`, `NrPortas`, `CodigoCor`, `CodigoCombustivel`,
`PrecoReal`, `PrecoVenda`. Opcionais: `Placa`, `Blindado`, `UnicoDono`, `Alienado`, `IpvaPago`, `NaoAceitaTroca`,
`Licenciado`, `Leilao`, `GarantiaDeFabrica`, `Observacao`, lista de `Opcional`. Tudo por **código do catálogo da
Webmotors**, então o mapa marca/modelo/versão/cor/câmbio precisa ser montado (como o da OLX).

**Pontos de atenção**
- **`Km` é obrigatório.** Carro sem km informada (lojas que dispensam a km) não pode ir como "0 km". Decisão da
  gestão: não publicar na Webmotors sem km, ou enviar 0 como alguns integradores fazem (engana o comprador). Recomendado: não publicar.
- **`CodigoModalidade` é o plano do anúncio** ("Nitro 20x30", "Acelerador Feirão", "Controle" na Sales), de acordo com o
  pacote contratado. O conector precisa escolher a modalidade de cada carro e respeitar o limite do pacote.
- **Leads:** o manual de integração de revendedor **não trata de leads**. Há uma "API CRM Terceiro / Inclusão de
  Leads" à parte (Sensedia), ainda não localizada.

## MobiAuto: REST com OAuth2 (Keycloak)

**Autenticação.** OAuth2 por código de autorização:
`https://auth.mobiauto.com.br/auth/realms/mobiauto/protocol/openid-connect/{auth,token}`. Exige credenciais de
cliente (a pedir à MobiAuto) e o `dealerId` da revenda (`GET /api/dealer/v1.0/dealers`).

**Estoque** (`/api/dealer/{dealerId}/inventory/v1.0`): `POST` cria, `PUT /{dealId}` atualiza, `DELETE` remove,
`PUT /{dealId}/price` muda o preço, imagens (`POST/DELETE …/image`, `PUT …/images-order`), `PUT …/transfer-deal`.
**Publicação** (`/api/publish/v1.0/dealer/{dealerId}/deal/{dealId}/publish?planId=` e `/unpublish`): o `planId` é o
plano do anúncio (Básico, Ouro, Prata, Bronze na Sales); `GET /api/dealer/{dealerId}/plans` lista os planos.

**Leads ("propostas")** (`/api/proposal/v1.0/{dealerId}/…`): **callback de criação**
(`POST …/lead-callback` registra a URL que a MobiAuto chama a cada proposta; `…/lead-callback/enable/{enable}`),
`GET …/proposal/{id}` traz o detalhe, `GET …/proposals` lista (filtra por telefone), e dá para **devolver status,
vendedor, anotação e interação** (`PUT …/status`, `…/seller/{sellerId}`, `…/annotation`, `…/interaction/systemic`).
Ou seja: **a MobiAuto entrega o lead por webhook, sem depender de e-mail.**

## O que falta para construir
1. **Webmotors:** credenciais de homologação (CNPJ de teste, e-mail do usuário de integração e senha) e a confirmação
   de que a Dilon Tech pode integrar. Dá para construir o cliente a partir do WSDL e testar contra um servidor falso.
2. **MobiAuto:** cliente OAuth (client id e secret) e o `dealerId` da Sales.
3. **Na Pista:** a documentação, se existir.
4. **Decisões:** política de km (acima) e a escolha de plano/modalidade por carro.
