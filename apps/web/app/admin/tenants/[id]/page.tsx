import { TenantDetail } from "./tenant-detail";

export default function TenantDetailPage({ params }: { params: { id: string } }) {
  return <TenantDetail tenantId={params.id} />;
}
