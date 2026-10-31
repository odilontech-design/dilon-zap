import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { BANCO_TESTE } from "./config";

/**
 * Vigia, pelo sistema operacional, as conexões de todos os processos de teste.
 * É a única proteção que enxerga o motor nativo do Prisma e o Postgres.
 *
 * É amostragem: uma conexão aberta e fechada entre duas leituras pode passar.
 * Uma regra de firewall seria a barreira real, mas pede administrador e altera
 * o sistema, então fica fora desta etapa.
 */

export type Conexao = { pid: number; remoto: string; porta: number; estado: string };
export type Escuta = { pid: number; local: string; porta: number };
export type Amostra = { conexoes: Conexao[]; escutas: Escuta[] };

const ehLocal = (endereco: string) => endereco === "::1" || endereco.startsWith("127.");

export function conexoesProibidas(amostra: Amostra): Conexao[] {
  return amostra.conexoes.filter((c) => !ehLocal(c.remoto));
}

/** Local, só a porta do banco de teste: a 5433 é o túnel e a 5432 é outro banco. */
export function conexoesLocaisInesperadas(amostra: Amostra, permitidas: number[] = [BANCO_TESTE.porta]): Conexao[] {
  return amostra.conexoes.filter((c) => ehLocal(c.remoto) && !permitidas.includes(c.porta) && c.porta < 49152);
}

export function escutasProibidas(amostra: Amostra): Escuta[] {
  return amostra.escutas.filter((e) => !ehLocal(e.local));
}

export type Resumo = {
  leituras: number;
  conexoesAoBancoDeTeste: number;
  pidsVistosNoBanco: number;
  violacoes: string[];
};

const paraLista = <T,>(v: T | T[] | null | undefined): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);

const SCRIPT = (raiz: number) => `
$ErrorActionPreference = 'SilentlyContinue'
$raiz = ${raiz}
while ($true) {
  $filhos = @{}
  Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId | ForEach-Object {
    if (-not $filhos.ContainsKey([int]$_.ParentProcessId)) { $filhos[[int]$_.ParentProcessId] = @() }
    $filhos[[int]$_.ParentProcessId] += [int]$_.ProcessId
  }
  $vistos = @{ $raiz = $true }
  $fila = @($raiz)
  while ($fila.Count -gt 0) {
    $proximo = @()
    foreach ($p in $fila) { foreach ($f in $filhos[$p]) { if (-not $vistos.ContainsKey($f) -and $f -ne $PID) { $vistos[$f] = $true; $proximo += $f } } }
    $fila = $proximo
  }
  $todas = Get-NetTCPConnection | Where-Object { $vistos.ContainsKey([int]$_.OwningProcess) }
  $c = @($todas | Where-Object { $_.State -in 'Established','SynSent' } | ForEach-Object { @{ pid = [int]$_.OwningProcess; remoto = "$($_.RemoteAddress)"; porta = [int]$_.RemotePort; estado = "$($_.State)" } })
  $e = @($todas | Where-Object { $_.State -eq 'Listen' } | ForEach-Object { @{ pid = [int]$_.OwningProcess; local = "$($_.LocalAddress)"; porta = [int]$_.LocalPort } })
  [Console]::Out.WriteLine((@{ c = $c; e = $e } | ConvertTo-Json -Compress -Depth 4))
  [Console]::Out.Flush()
  Start-Sleep -Milliseconds 200
}
`;

export class Sentinela {
  private processo: ChildProcess | null = null;
  private pidsNoBanco = new Set<number>();
  private primeiraLeitura: (() => void) | null = null;
  readonly resumo: Resumo = { leituras: 0, conexoesAoBancoDeTeste: 0, pidsVistosNoBanco: 0, violacoes: [] };

  constructor(private aoViolar: (descricao: string) => void, private portasPermitidas: number[] = [BANCO_TESTE.porta]) {}

  iniciar(ambiente: NodeJS.ProcessEnv, raiz: number): Promise<void> {
    this.processo = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", SCRIPT(raiz)], {
      env: ambiente,
      stdio: ["ignore", "pipe", "ignore"],
    });
    createInterface({ input: this.processo.stdout! }).on("line", (linha) => this.registrar(linha));
    return new Promise((resolve, reject) => {
      const limite = setTimeout(() => reject(new Error("a sentinela de conexões não respondeu")), 30_000);
      this.primeiraLeitura = () => {
        clearTimeout(limite);
        resolve();
      };
    });
  }

  private registrar(linha: string) {
    let bruto: { c?: Conexao | Conexao[]; e?: Escuta | Escuta[] };
    try {
      bruto = JSON.parse(linha);
    } catch {
      return;
    }
    const amostra: Amostra = { conexoes: paraLista(bruto.c), escutas: paraLista(bruto.e) };
    this.resumo.leituras++;
    this.primeiraLeitura?.();
    this.primeiraLeitura = null;

    for (const c of amostra.conexoes) {
      if (c.porta === BANCO_TESTE.porta) {
        this.resumo.conexoesAoBancoDeTeste++;
        this.pidsNoBanco.add(c.pid);
      }
    }
    this.resumo.pidsVistosNoBanco = this.pidsNoBanco.size;

    const violacoes = [
      ...conexoesProibidas(amostra).map((c) => `conexão externa na porta ${c.porta}`),
      ...conexoesLocaisInesperadas(amostra, this.portasPermitidas).map((c) => `conexão local inesperada na porta ${c.porta}`),
      ...escutasProibidas(amostra).map((e) => `escuta fora da máquina na porta ${e.porta}`),
    ];
    for (const v of violacoes) {
      if (!this.resumo.violacoes.includes(v)) {
        this.resumo.violacoes.push(v);
        this.aoViolar(v);
      }
    }
  }

  viuNoBanco(pid: number) {
    return this.pidsNoBanco.has(pid);
  }

  parar() {
    this.processo?.kill();
    this.processo = null;
  }
}
