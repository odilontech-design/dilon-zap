import { ambientesDosPortais } from "@dilon-zap/portais";

/**
 * Avisa quando algum portal está apontando para o ambiente de TESTE (por exemplo, NAPISTA_AMBIENTE=development): nele
 * os anúncios existem só no ambiente de testes do portal e não aparecem no site de verdade. Fica no topo de Portais e de Anúncios.
 */
export function AvisoDeAmbienteDosPortais() {
  const emTeste = ambientesDosPortais().filter((a) => a.teste);
  if (emTeste.length === 0) return null;
  return (
    <div role="alert" className="mb-4 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-700" data-testid="aviso-ambiente-portais">
      <p className="font-semibold">{emTeste.length === 1 ? `${emTeste[0].nome} está no ambiente de TESTE.` : `${emTeste.map((a) => a.nome).join(", ")} estão no ambiente de TESTE.`}</p>
      <p className="mt-1 text-xs">
        Os anúncios enviados vão para o ambiente de testes do portal e <b>não aparecem no site de verdade</b>. Para publicar de verdade, o servidor precisa apontar para a produção do portal (peça à Dilon Tech).
      </p>
    </div>
  );
}
