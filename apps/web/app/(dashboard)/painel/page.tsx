import { LivePanel } from "./live-panel";
import { Notificacoes } from "@/components/notificacoes";

export default function PainelPage() {
  return (
    <div className="p-4 md:p-8">
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <h1 className="text-lg font-semibold">Painel</h1>
        {/* Fica aqui, e não na barra lateral, porque é por aparelho: a pessoa
            precisa ver e ligar de novo no celular mesmo já tendo ligado no
            computador, e o Painel é a primeira tela que ela abre nos dois. */}
        <Notificacoes />
      </div>
      <LivePanel />
    </div>
  );
}
