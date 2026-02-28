import { auth } from "@/libs/auth";
import { requireAuthenticatedDashboardUserId, requireCompletedSetup } from "@/libs/setup";
import DashboardShell from "@/components/dashboard/dashboard-shell";
import DashboardTrustContent from "@/components/dashboard/dashboard-trust-content";

export default async function DashboardTrustPage() {
  const session = await auth();
  const userId = requireAuthenticatedDashboardUserId(session?.user?.id);
  await requireCompletedSetup(userId, { requireAccess: false });

  return (
    <DashboardShell>
      <DashboardTrustContent />
    </DashboardShell>
  );
}
