# @dilon-zap/ponto-core

Motor de apuração de jornada do Dilon Ponto. É uma **função pura**: não usa
banco, rede nem `Date` no cálculo. Recebe o que estava previsto e as marcações
já tratadas e devolve saldo, horas extras por percentual, adicional noturno,
faltas, atrasos, intervalo, interjornada e o movimento do banco de horas.

```bash
npm run test:ponto     # da raiz do monorepo
```

## Como usar

```ts
import { apurarDia, fecharPeriodo, extratoBanco, minutoLocal, hhmm, REGRAS_CLT_PADRAO } from "@dilon-zap/ponto-core";

// 1. Instante real (UTC, do banco) → minuto na linha do tempo do dia, no fuso da unidade
const m = marcacoes.map((t) => minutoLocal(t, "2026-11-10", "America/Sao_Paulo"));

// 2. Apura o dia
const dia = apurarDia(
  {
    tipoDia: "UTIL",
    previsto: [{ inicio: hhmm("08:00"), fim: hhmm("12:00") }, { inicio: hhmm("13:00"), fim: hhmm("17:00") }],
    marcacoes: m,
  },
  REGRAS_CLT_PADRAO,
);

// 3. Fecha o período e atualiza o banco de horas
const fechamento = fecharPeriodo(dias, { bancoDeHoras: { incluirDiasDeDescanso: false } });
const banco = extratoBanco([...lancamentosAnteriores, ...fechamento.lancamentosBanco], "2026-11-30", { validadeDias: 180 });
```

## O que mora onde

| Assunto | Arquivo |
| --- | --- |
| Linha do tempo em minutos, conversão de fuso | `src/tempo.ts` |
| Regras da CLT configuráveis (tolerância, faixas de extra, noturno, intervalos) | `src/regras.ts` |
| Adicional noturno, hora reduzida, prorrogação (Súmula 60) | `src/noturno.ts` |
| Apuração do dia | `src/apuracao.ts` |
| Banco de horas com lotes e vencimento | `src/banco.ts` |
| Fechamento do período (pagar × banco) | `src/periodo.ts` |

## Decisões

- **Minuto inteiro numa linha do tempo local.** O turno 22:00–06:00 é
  `[1320, 1800]` e é apurado no dia em que começou. Todos os valores de tempo
  são inteiros e os percentuais vêm em pontos-base (5000 = 50%).
- **Marcação ímpar não é completada.** O dia sai `incompleto` para alguém
  tratar. Inventar a saída seria marcação automática.
- **Tolerância pela Súmula 366:** se passar de 5 min numa marcação ou de 10
  no dia, conta a diferença inteira.
- **Hora noturna reduzida entra no saldo.** As 7 horas reais de 22h a 5h valem
  8 horas, tanto no previsto quanto no trabalhado. Por isso, 1 hora extra
  depois das 5h, em turno noturno, vale 69 minutos.
- **Banco de horas em lotes.** O débito consome primeiro o crédito que vence
  antes. O crédito vencido sai do banco como extra a pagar e não compensa
  débito posterior.

## Ainda não faz (próximos passos)

- **AFD e AEJ** nos layouts da Portaria 671. Precisa ser feito com o texto
  oficial dos anexos aberto ao lado, não de memória.
- **Separar as marcações de vários dias** em jornadas (qual marcação da
  madrugada pertence a qual turno). Hoje quem chama já entrega as marcações de
  cada jornada.
- **Jornada flexível** (carga diária sem horário), **intervalo pré-assinalado**
  e **DSR**, inclusive a perda do DSR por falta injustificada na semana.
- **Descanso de 35 horas** (11h de interjornada + 24h de repouso semanal,
  Súmula 110 do TST).

> Todos os números legais seguem a CLT e as súmulas citadas nos comentários.
> Antes do primeiro cliente, um profissional de DP precisa conferir os casos de
> teste e acrescentar meses reais fechados à mão.
