import DashboardOverviewContent from "@/components/dashboard/dashboard-overview-content";
import DashboardShell from "@/components/dashboard/dashboard-shell";

export default function Page() {
  return (
    <DashboardShell>
      <DashboardOverviewContent />
    </DashboardShell>
  );
}
