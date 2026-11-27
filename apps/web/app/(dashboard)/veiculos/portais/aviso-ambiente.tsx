import { ambientesDosPortais } from "@dilon-zap/portais";

/**
 * Avisa quando algum portal está apontando para o ambiente de TESTE (por exemplo, NAPISTA_AMBIENTE=development): nele
 * os anúncios existem só no ambiente de testes do portal e não aparecem no site de verdade. Fica no topo de Portais e de Anúncios.
 */
export function AvisoDeAmbienteDosPortais() {
  const emTeste = ambientesDosPortais().filter((a) => a.teste);
  if (emTeste.length === 0) return null;
  const nomes = emTeste.map((a) => a.nome).join(", ");
  return (
    <div role="status" className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-900" data-testid="aviso-ambiente-portais">
      <p className="font-semibold">{emTeste.length === 1 ? `${nomes} em fase de homologação` : `${nomes} em fase de homologação`}</p>
      <p className="mt-0.5 text-xs">
        Por enquanto os anúncios ficam no ambiente de testes do portal e <b>ainda não aparecem no site</b>. A liberação para produção está em andamento e este aviso some sozinho quando for concluída.
      </p>
    </div>
  );
}
