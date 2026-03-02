import { redirect } from "next/navigation";
import SetupFrame from "@/components/dashboard/setup/setup-frame";
import SelfPricingSetupForm from "@/components/dashboard/setup/self-pricing-setup-form";
import config from "@/config";
import { auth } from "@/libs/auth";
import { getSetupStatus } from "@/libs/setup";

export default async function SelfPricingSetupPage() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    redirect(config.auth.loginUrl);
  }

  const status = await getSetupStatus(String(userId));

  if (status.isSetupComplete) {
    redirect("/dashboard");
  }

  if (status.nextStep.step !== "self_pricing") {
    redirect(status.nextStep.href);
  }

  return (
    <SetupFrame
      title="Set up your product baseline"
      description="Add your product, homepage, and monthly or annual plans first. That gives the dashboard a clean baseline before competitor monitoring starts."
      currentStep="self_pricing"
      status={status}
    >
      <SelfPricingSetupForm
        existingProfile={status.selfPricingProfile}
        existingSelfCompany={status.selfCompany}
        mode="setup"
      />
    </SetupFrame>
  );
}
