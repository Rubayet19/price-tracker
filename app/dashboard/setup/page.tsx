import { redirect } from "next/navigation";
import config from "@/config";
import { auth } from "@/libs/auth";
import { getSetupStatus } from "@/libs/setup";

export default async function DashboardSetupIndexPage() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    redirect(config.auth.loginUrl);
  }

  const status = await getSetupStatus(String(userId));
  redirect(status.nextStep.href);
}
