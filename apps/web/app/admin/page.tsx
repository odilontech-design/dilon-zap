import { AdminDashboard } from "./admin-dashboard";
import { SaasOverview } from "./saas-overview";

export default function AdminPage() {
  // Panorama em cima, lista e cadastro de empresas embaixo: primeiro o que
  // pede ação e quanto entra, depois a manutenção do dia a dia.
  return (
    <>
      <SaasOverview />
      <AdminDashboard />
    </>
  );
}
