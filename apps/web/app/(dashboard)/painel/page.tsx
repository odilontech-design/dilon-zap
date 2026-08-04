import { LivePanel } from "./live-panel";

export default function PainelPage() {
  return (
    <div className="p-4 md:p-8">
      <h1 className="text-lg font-semibold mb-6">Painel</h1>
      <LivePanel />
    </div>
  );
}
