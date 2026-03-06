import { Badge } from "@/components/ui/badge";
import type { SetupStatus, SetupStep } from "@/types/setup";

interface SetupProgressProps {
  currentStep: SetupStep;
  status: SetupStatus;
}

interface StepItem {
  key: Exclude<SetupStep, "done">;
  title: string;
  description: string;
  complete: boolean;
}

const getStateLabel = (
  item: StepItem,
  currentStep: SetupStep
): { label: string; className: string } => {
  if (item.complete) {
    return {
      label: "Done",
      className: "border-[#16a34a]/35 bg-[#f0fdf4] text-[#166534]",
    };
  }

  if (item.key === currentStep) {
    return {
      label: "Current",
      className: "border-[#0f766e]/30 bg-[#ccfbf1] text-[#115e59]",
    };
  }

  return {
    label: "Up next",
    className: "border-[#cbd5e1] bg-[#f8fafc] text-[#475569]",
  };
};

export default function SetupProgress({
  currentStep,
  status,
}: SetupProgressProps) {
  const items: StepItem[] = [
    {
      key: "self_pricing",
      title: "Your product",
      description:
        "Add your homepage, optional pricing URL, positioning, and monthly/annual plans.",
      complete: status.hasSelfPricing && status.hasSelfCompany,
    },
    {
      key: "trial",
      title: "Access",
      description: "Start the 7-day trial before competitor tracking begins.",
      complete: status.entitlements.hasAccess,
    },
    {
      key: "competitors",
      title: "First competitor",
      description: "Add the first competitor you want to monitor.",
      complete: status.hasCompetitors,
    },
    {
      key: "competitor_pricing",
      title: "Confirm pricing URL",
      description: "Approve the pricing page so monitoring stays trustworthy.",
      complete: status.hasSelectedPrimaryPricing,
    },
  ];

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {items.map((item, index) => {
        const state = getStateLabel(item, currentStep);

        return (
          <article
            key={item.key}
            className="rounded-2xl border border-[#0f172a]/10 bg-white/95 p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold tracking-[0.22em] text-[#64748b] uppercase">
                  Step {index + 1}
                </p>
                <h3 className="mt-2 text-base font-bold text-[#0f172a]">
                  {item.title}
                </h3>
              </div>
              <Badge variant="outline" className={state.className}>
                {state.label}
              </Badge>
            </div>
            <p className="mt-3 text-sm leading-6 text-[#475569]">
              {item.description}
            </p>
          </article>
        );
      })}
    </div>
  );
}
