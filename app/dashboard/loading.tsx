import { Loader2 } from "lucide-react";

export default function DashboardLoading() {
  return (
    <div className="flex items-center justify-center py-24 text-[#475569]">
      <Loader2 className="mr-2 size-5 animate-spin" />
      <span className="text-sm">Loading...</span>
    </div>
  );
}
