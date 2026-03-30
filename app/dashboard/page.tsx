import DashboardOverviewContent from "@/components/dashboard/dashboard-overview-content";
import { getDashboardSession } from "@/libs/dashboard-session";
import {
  requireAuthenticatedDashboardUserId,
  requireCompletedSetup,
} from "@/libs/setup";

export default async function Page() {
  const session = await getDashboardSession();
  const userId = requireAuthenticatedDashboardUserId(session?.user?.id);
  await requireCompletedSetup(userId, { requireAccess: false });

  return <DashboardOverviewContent />;
}
