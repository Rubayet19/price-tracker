import Link from "next/link";
import Image from "next/image";
import config from "@/config";
import ButtonSignin from "@/components/ButtonSignin";
import ButtonCheckout from "@/components/ButtonCheckout";

interface Benefit {
  title: string;
  description: string;
  eyebrow: string;
}

interface WorkflowStep {
  title: string;
  description: string;
}

interface TrustStat {
  label: string;
  value: string;
  note: string;
}

interface FaqItem {
  question: string;
  answer: string;
}

const benefits: Benefit[] = [
  {
    eyebrow: "Signal over noise",
    title: "Track the prices that actually move revenue",
    description:
      "Pricing Pulse separates meaningful pricing changes from cosmetic edits so your team can respond faster and with confidence.",
  },
  {
    eyebrow: "AI-powered decisions",
    title: "Get strategic recommendations, not just data dumps",
    description:
      "Every significant change triggers AI-generated insights with strategic options, things to check, and risks to watch out for — so you know what to do, not just what changed.",
  },
  {
    eyebrow: "Competitor vs. you",
    title: "See how every change stacks up against your own pricing",
    description:
      "Enter your own pricing context and Pricing Pulse compares competitor moves against your plans, highlighting where you gain or lose ground.",
  },
];

const workflow: WorkflowStep[] = [
  {
    title: "1. Add your offer and competitors",
    description:
      "Enter your own pricing context manually, then add competitors by name and homepage. Keep full control from day one.",
  },
  {
    title: "2. Confirm pricing sources",
    description:
      "Pricing Pulse finds likely pricing pages and lets you override URLs for edge cases, ensuring reliable monitoring targets.",
  },
  {
    title: "3. Get checked automatically, every day",
    description:
      "Pricing Pulse monitors each competitor daily, flags what actually changed, and skips the noise — so you only see what matters.",
  },
  {
    title: "4. Review changes and decide with confidence",
    description:
      "See exactly what changed, how severe it is, and get AI-powered recommendations so your team can make pricing decisions without guesswork.",
  },
];

const trustStats: TrustStat[] = [
  {
    value: "Daily",
    label: "automated checks",
    note: "Every competitor is checked daily so you never miss a move.",
  },
  {
    value: "7 days",
    label: "card-free trial",
    note: "Try the Starter limits before paying.",
  },
  {
    value: "2 tiers",
    label: "clear packaging",
    note: "Starter for lean teams, Pro for broader coverage.",
  },
];

const faqs: FaqItem[] = [
  {
    question: "Do I need to add a credit card for the trial?",
    answer:
      "No. The trial starts only when you explicitly click Start trial and it runs for 7 days without a card.",
  },
  {
    question: "How many competitors can I track?",
    answer:
      "Starter supports up to 3 competitors and Pro supports up to 10 competitors.",
  },
  {
    question: "What happens if a pricing page is blocked or unclear?",
    answer:
      "Pricing Pulse flags it clearly and won't report changes it isn't confident about. You'll see exactly which competitors need attention.",
  },
  {
    question: "Can I see when the last check happened?",
    answer:
      "Yes. Every change shows when it was last checked and how confident the detection is, so you always know how fresh your data is.",
  },
];

/* ── Design tokens (kept as constants for consistency) ──────────── */

const badgeClasses =
  "inline-flex items-center rounded-full border border-[#0f766e]/20 bg-[#0f766e]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-[#0f766e]";

const linkClasses =
  "rounded-full px-3 py-2 text-sm font-medium text-[#334155] transition-colors motion-reduce:transition-none hover:text-[#0f766e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f766e] focus-visible:ring-offset-2";

const cardShadow =
  "shadow-[0_2px_16px_-2px_rgba(2,6,23,0.06),0_4px_32px_-8px_rgba(2,6,23,0.1)]";

const heroShadow = "shadow-[0_12px_48px_-12px_rgba(2,6,23,0.25)]";

export default function LandingPage() {
  return (
    <div className="relative isolate overflow-hidden bg-[#f7f6f3] text-[#0f172a]">
      {/* Background gradient — teal tones */}
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[32rem] bg-[radial-gradient(70%_70%_at_20%_10%,rgba(15,118,110,0.18),transparent_65%),radial-gradient(65%_65%_at_82%_8%,rgba(20,184,166,0.14),transparent_70%)]" />

      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-[#0f172a]/10 bg-[#f7f6f3]/95 backdrop-blur">
        <nav
          aria-label="Primary"
          className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-3 md:px-8"
        >
          <Link
            href="#top"
            className="rounded-md text-lg font-black tracking-tight text-[#0f172a] focus-visible:ring-2 focus-visible:ring-[#0f766e] focus-visible:ring-offset-2 focus-visible:outline-none"
          >
            Pricing Pulse
          </Link>

          <div className="hidden items-center gap-1 md:flex">
            <Link href="#benefits" className={linkClasses}>
              Benefits
            </Link>
            <Link href="#workflow" className={linkClasses}>
              How it works
            </Link>
            <Link href="#pricing" className={linkClasses}>
              Pricing
            </Link>
            <Link href="#faq" className={linkClasses}>
              FAQ
            </Link>
          </div>

          <ButtonSignin
            text="Sign in"
            extraStyle="btn-sm !rounded-full !border-[#0f766e] !bg-[#0f766e] !px-5 !text-white hover:!bg-[#115e59] focus-visible:!outline-none focus-visible:!ring-2 focus-visible:!ring-[#0f766e] focus-visible:!ring-offset-2"
          />
        </nav>

        <div className="border-t border-[#0f172a]/10 md:hidden">
          <div className="mx-auto flex w-full max-w-6xl gap-2 overflow-x-auto px-5 py-2">
            <Link
              href="#benefits"
              className={`${linkClasses} whitespace-nowrap`}
            >
              Benefits
            </Link>
            <Link
              href="#workflow"
              className={`${linkClasses} whitespace-nowrap`}
            >
              How it works
            </Link>
            <Link
              href="#pricing"
              className={`${linkClasses} whitespace-nowrap`}
            >
              Pricing
            </Link>
            <Link href="#faq" className={`${linkClasses} whitespace-nowrap`}>
              FAQ
            </Link>
          </div>
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────────── */}
      <main id="top">
        <section className="mx-auto w-full max-w-6xl px-5 pt-16 pb-20 md:px-8 lg:pt-24 lg:pb-28">
          {/* Text block — centered */}
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#0f766e]/15 bg-[#0f766e]/[0.06] px-3.5 py-1 text-[11px] font-semibold tracking-[0.18em] text-[#0f766e] uppercase">
              <span className="inline-block size-1.5 rounded-full bg-[#0f766e]" />
              Competitor Pricing Intelligence
            </span>

            <h1 className="mt-6 text-[2.25rem] leading-[1.15] font-extrabold tracking-tight text-[#0f172a] sm:text-5xl">
              Know when competitors change their pricing.{" "}
              <span className="text-[#0f766e]">Before your customers do.</span>
            </h1>

            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-[#475569]">
              Track competitor pricing pages automatically. Get daily AI-powered
              insights on price changes, new tiers, and feature updates — so you
              never miss a competitive shift.
            </p>

            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <ButtonSignin
                text="Start free trial"
                extraStyle="!rounded-full !border-[#0f766e] !bg-[#0f766e] !px-7 !py-3 !text-sm !font-semibold !text-white hover:!bg-[#115e59] !shadow-[0_1px_2px_rgba(0,0,0,0.08),0_4px_12px_rgba(15,118,110,0.25)]"
              />
              <Link
                href="#pricing"
                className="inline-flex items-center justify-center rounded-full border border-[#0f172a]/15 bg-white px-7 py-3 text-sm font-semibold text-[#0f172a] shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all hover:border-[#0f766e]/30 hover:text-[#0f766e] focus-visible:ring-2 focus-visible:ring-[#0f766e] focus-visible:ring-offset-2 focus-visible:outline-none motion-reduce:transition-none"
              >
                View plans
              </Link>
            </div>

            <p className="mt-4 text-xs tracking-wide text-[#94a3b8]">
              No credit card required · 7-day free trial
            </p>
          </div>

          {/* Video — full-width showcase */}
          <div className="relative mx-auto mt-14 max-w-5xl lg:mt-16">
            {/* Ambient glow behind the video */}
            <div className="pointer-events-none absolute -inset-4 -z-10 rounded-3xl bg-[radial-gradient(ellipse_at_center,rgba(15,118,110,0.1),transparent_70%)] blur-2xl" />

            <div className="overflow-hidden rounded-xl border border-[#0f172a]/[0.08] bg-[#0f172a]/[0.02] shadow-[0_8px_40px_-12px_rgba(2,6,23,0.15),0_2px_8px_-2px_rgba(2,6,23,0.06)] ring-1 ring-white/60">
              <video
                src="/price-tracker.mp4"
                autoPlay
                muted
                loop
                playsInline
                className="aspect-video w-full"
              />
            </div>
          </div>
        </section>

        {/* ── Benefits ──────────────────────────────────────────── */}
        <section
          id="benefits"
          aria-labelledby="benefits-title"
          className="mx-auto w-full max-w-6xl px-5 pb-20 md:px-8 lg:pb-28"
        >
          <div className="mb-10">
            <p className={badgeClasses}>Value</p>
            <h2
              id="benefits-title"
              className="mt-4 text-3xl font-black tracking-tight text-[#0f172a] sm:text-4xl"
            >
              Built to make pricing decisions less risky
            </h2>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            {benefits.map((item) => (
              <article
                key={item.title}
                className={`rounded-2xl border border-[#0f172a]/10 bg-white p-6 ${cardShadow}`}
              >
                <p className="text-xs font-semibold tracking-[0.16em] text-[#0f766e] uppercase">
                  {item.eyebrow}
                </p>
                <h3 className="mt-3 text-xl font-bold text-[#0f172a]">
                  {item.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-[#475569]">
                  {item.description}
                </p>
              </article>
            ))}
          </div>
        </section>

        {/* ── Product showcase ─────────────────────────────────── */}
        <section
          aria-labelledby="showcase-title"
          className="border-y border-[#0f172a]/[0.06] bg-white/60 py-20 lg:py-28"
        >
          <div className="mx-auto w-full max-w-6xl px-5 md:px-8">
            <div className="mb-12 max-w-2xl">
              <p className="inline-flex items-center gap-1.5 rounded-full border border-[#0f766e]/15 bg-[#0f766e]/[0.06] px-3.5 py-1 text-[11px] font-semibold tracking-[0.18em] text-[#0f766e] uppercase">
                <span className="inline-block size-1.5 rounded-full bg-[#0f766e]" />
                Product
              </p>
              <h2
                id="showcase-title"
                className="mt-4 text-3xl font-extrabold tracking-tight text-[#0f172a] sm:text-4xl"
              >
                Everything you need, nothing you don&apos;t
              </h2>
              <p className="mt-3 text-base leading-relaxed text-[#475569]">
                A clean dashboard to monitor competitors, and a change feed that
                surfaces what actually matters.
              </p>
            </div>

            <div className="space-y-10">
              {/* Dashboard screenshot */}
              <div className="group">
                <div className="mb-4 flex items-baseline justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-[#0f172a]">
                      Dashboard overview
                    </p>
                    <p className="mt-1 text-sm text-[#64748b]">
                      Track all competitors at a glance — active monitoring,
                      latest changes, and quick actions in one view.
                    </p>
                  </div>
                </div>
                <div className="overflow-hidden rounded-xl border border-[#0f172a]/[0.08] bg-white shadow-[0_4px_24px_-4px_rgba(2,6,23,0.08)] transition-shadow duration-300 group-hover:shadow-[0_8px_32px_-6px_rgba(2,6,23,0.12)]">
                  <Image
                    src="/images/screenshot-dashboard.png"
                    alt="Pricing Pulse dashboard showing competitor stats and latest pricing change"
                    width={3024}
                    height={998}
                    sizes="(min-width: 1024px) 72rem, 100vw"
                    className="w-full"
                  />
                </div>
              </div>

              {/* Change feed screenshot */}
              <div className="group">
                <div className="mb-4 flex items-baseline justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-[#0f172a]">
                      AI-powered change feed
                    </p>
                    <p className="mt-1 text-sm text-[#64748b]">
                      Every detected change comes with severity, confidence, and
                      strategic insights — not just raw data.
                    </p>
                  </div>
                </div>
                <div className="overflow-hidden rounded-xl border border-[#0f172a]/[0.08] bg-white shadow-[0_4px_24px_-4px_rgba(2,6,23,0.08)] transition-shadow duration-300 group-hover:shadow-[0_8px_32px_-6px_rgba(2,6,23,0.12)]">
                  <Image
                    src="/images/screenshot-changes.png"
                    alt="Recent pricing changes feed with AI-powered strategic insights"
                    width={3024}
                    height={778}
                    sizes="(min-width: 1024px) 72rem, 100vw"
                    className="w-full"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Workflow ──────────────────────────────────────────── */}
        <section
          id="workflow"
          aria-labelledby="workflow-title"
          className="bg-[#0f172a] py-20 text-white lg:py-28"
        >
          <div className="mx-auto w-full max-w-6xl px-5 md:px-8">
            <p className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold tracking-[0.16em] text-[#99f6e4] uppercase">
              Workflow
            </p>
            <h2
              id="workflow-title"
              className="mt-4 max-w-3xl text-3xl font-black tracking-tight sm:text-4xl"
            >
              From setup to signal in four practical steps
            </h2>

            <div className="mt-10 grid gap-5 md:grid-cols-2">
              {workflow.map((step) => (
                <article
                  key={step.title}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] p-6"
                >
                  <h3 className="text-lg font-bold text-white">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-[#cbd5e1]">
                    {step.description}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ── Trust ─────────────────────────────────────────────── */}
        <section
          aria-labelledby="trust-title"
          className="mx-auto w-full max-w-6xl px-5 py-20 md:px-8 lg:py-28"
        >
          <div className="grid gap-10 lg:grid-cols-[1fr_0.9fr] lg:items-start">
            <div>
              <p className={badgeClasses}>Trust by design</p>
              <h2
                id="trust-title"
                className="mt-4 text-3xl font-black tracking-tight text-[#0f172a] sm:text-4xl"
              >
                Signals stay useful because confidence comes first
              </h2>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-[#475569]">
                Pricing Pulse favors low-noise, verifiable updates over
                aggressive automation. If confidence is low, the product flags
                uncertainty instead of pretending certainty.
              </p>

              <div className="mt-7 flex flex-wrap gap-2 text-sm">
                <span className="rounded-full border border-[#0f766e]/20 bg-[#0f766e]/10 px-3 py-1 font-medium text-[#0f766e]">
                  Verified vs unverified separation
                </span>
                <span className="rounded-full border border-[#14b8a6]/20 bg-[#14b8a6]/10 px-3 py-1 font-medium text-[#0f766e]">
                  Lightweight daily checks
                </span>
                <span className="rounded-full border border-[#0f172a]/10 bg-white px-3 py-1 font-medium text-[#334155]">
                  Change-only alerts
                </span>
              </div>
            </div>

            <div className="grid gap-5 sm:grid-cols-3 lg:grid-cols-1">
              {trustStats.map((stat) => (
                <article
                  key={stat.label}
                  className={`rounded-2xl border border-[#0f172a]/10 bg-white p-5 ${cardShadow}`}
                >
                  <p className="text-3xl font-black tracking-tight text-[#0f172a]">
                    {stat.value}
                  </p>
                  <p className="mt-1 text-sm font-semibold tracking-[0.16em] text-[#0f766e] uppercase">
                    {stat.label}
                  </p>
                  <p className="mt-2 text-sm text-[#475569]">{stat.note}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ── Pricing ──────────────────────────────────────────── */}
        <section
          id="pricing"
          aria-labelledby="pricing-title"
          className="border-y border-[#0f172a]/10 bg-white/70 py-20 lg:py-28"
        >
          <div className="mx-auto w-full max-w-6xl px-5 md:px-8">
            <div className="max-w-3xl">
              <p className={badgeClasses}>Pricing</p>
              <h2
                id="pricing-title"
                className="mt-4 text-3xl font-black tracking-tight text-[#0f172a] sm:text-4xl"
              >
                Choose your competitor coverage
              </h2>
              <p className="mt-3 text-base text-[#475569]">
                Simple pricing, no surprises. Pick the plan that matches your
                team size and start tracking today.
              </p>
            </div>

            <div className="mt-10 grid gap-5 lg:grid-cols-2">
              {config.stripe.plans.map((plan) => (
                <article
                  key={plan.priceId}
                  className={`rounded-2xl border p-6 ${cardShadow} ${
                    plan.isFeatured
                      ? "border-[#0f766e]/20 bg-gradient-to-b from-white to-[#f0fdfa]"
                      : "border-[#0f172a]/10 bg-white"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-2xl font-black tracking-tight text-[#0f172a]">
                        {plan.name}
                      </h3>
                      {plan.description ? (
                        <p className="mt-2 text-sm text-[#475569]">
                          {plan.description}
                        </p>
                      ) : null}
                    </div>
                    {plan.isFeatured ? (
                      <span className="rounded-full border border-[#0f766e]/20 bg-[#0f766e]/10 px-3 py-1 text-xs font-semibold tracking-[0.16em] text-[#0f766e] uppercase">
                        Most Popular
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-6 flex items-end gap-2">
                    {plan.priceAnchor ? (
                      <span className="text-lg font-semibold text-[#64748b] line-through">
                        ${plan.priceAnchor}
                      </span>
                    ) : null}
                    <span className="text-5xl font-black tracking-tight text-[#0f172a]">
                      ${plan.price}
                    </span>
                    <span className="pb-1 text-sm font-semibold tracking-[0.14em] text-[#64748b] uppercase">
                      USD / month
                    </span>
                  </div>

                  <ul
                    className="mt-6 space-y-2"
                    aria-label={`${plan.name} features`}
                  >
                    {plan.features.map((feature) => (
                      <li
                        key={feature.name}
                        className="flex items-start gap-2 text-sm text-[#334155]"
                      >
                        <span
                          aria-hidden
                          className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#0f766e]"
                        />
                        <span>{feature.name}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-6">
                    <ButtonCheckout priceId={plan.priceId} />
                    <p className="mt-2 text-center text-xs text-[#64748b]">
                      Secure checkout
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* ── FAQ ───────────────────────────────────────────────── */}
        <section
          id="faq"
          aria-labelledby="faq-title"
          className="mx-auto w-full max-w-5xl px-5 py-20 md:px-8 lg:py-28"
        >
          <div className="mb-10">
            <p className={badgeClasses}>FAQ</p>
            <h2
              id="faq-title"
              className="mt-4 text-3xl font-black tracking-tight text-[#0f172a] sm:text-4xl"
            >
              Common questions before you start
            </h2>
          </div>

          <div className="space-y-3">
            {faqs.map((faq) => (
              <details
                key={faq.question}
                className="group rounded-2xl border border-[#0f172a]/10 bg-white p-5 open:border-[#0f766e]/20"
              >
                <summary className="cursor-pointer list-none pr-6 text-left text-base font-semibold text-[#0f172a] focus-visible:ring-2 focus-visible:ring-[#0f766e] focus-visible:ring-offset-2 focus-visible:outline-none">
                  {faq.question}
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-[#475569]">
                  {faq.answer}
                </p>
              </details>
            ))}
          </div>
        </section>

        {/* ── CTA + Footer ─────────────────────────────────────── */}
        <section className="px-5 pb-20 md:px-8">
          <div
            className={`mx-auto w-full max-w-6xl rounded-2xl border border-[#0f172a]/10 bg-[#0f172a] px-6 py-12 text-white sm:px-10 ${heroShadow}`}
          >
            <p className="text-xs font-semibold tracking-[0.16em] text-[#99f6e4] uppercase">
              Ready to monitor smarter?
            </p>
            <h2 className="mt-3 max-w-2xl text-3xl font-black tracking-tight sm:text-4xl">
              Launch Pricing Pulse and catch the next competitor move before it
              catches you.
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[#cbd5e1]">
              Start your free trial, add your first competitors, and get daily
              pricing updates delivered straight to your dashboard.
            </p>

            <div className="mt-7 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
              <ButtonSignin
                text="Sign in to start trial"
                extraStyle="!rounded-full !border-0 !bg-[#14b8a6] !px-6 !text-[#0f172a] hover:!bg-[#2dd4bf]"
              />
              <Link
                href="#pricing"
                className="inline-flex items-center justify-center rounded-full border border-white/20 px-6 py-3 text-sm font-semibold text-white transition-colors hover:border-[#99f6e4] hover:text-[#99f6e4] focus-visible:ring-2 focus-visible:ring-[#99f6e4] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f172a] focus-visible:outline-none motion-reduce:transition-none"
              >
                Compare plans
              </Link>
            </div>
          </div>

          <footer className="mx-auto mt-8 w-full max-w-6xl border-t border-[#0f172a]/10 pt-6 text-sm text-[#64748b]">
            <p>
              © {new Date().getFullYear()} Pricing Pulse. Competitor pricing
              intelligence for decisive teams.
            </p>
          </footer>
        </section>
      </main>
    </div>
  );
}
