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
      "Price Tracker separates meaningful pricing changes from cosmetic edits so your team can respond faster and with confidence.",
  },
  {
    eyebrow: "Built for clarity",
    title: "Every change includes confidence and check time",
    description:
      "Trust cues are visible by design: confidence score, verification state, and last checked timestamp are always attached to each update.",
  },
  {
    eyebrow: "Action-ready",
    title: "Focus your response on high-impact changes",
    description:
      "Severity labels make prioritization immediate so product, sales, and growth teams act on what matters first.",
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
      "Price Tracker finds likely pricing pages and lets you override URLs for edge cases, ensuring reliable monitoring targets.",
  },
  {
    title: "3. Run daily checks with confidence gates",
    description:
      "Static-first crawling keeps checks fast, while fallback extraction only runs when needed to stay efficient and dependable.",
  },
  {
    title: "4. Review verified changes and decide",
    description:
      "Get structured diffs, verification state, and severity so your team can make pricing decisions without guesswork.",
  },
];

const trustStats: TrustStat[] = [
  {
    value: "10-15m",
    label: "batch crawl cadence",
    note: "Frequent short runs avoid stale snapshots.",
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
    question: "What happens if a page is blocked or unclear?",
    answer:
      "Price Tracker marks the source as blocked or manual-needed and avoids showing high-confidence claims when certainty is low.",
  },
  {
    question: "Can I see when the last check happened?",
    answer:
      "Yes. Change records are paired with checked-at and confidence metadata so teams can evaluate freshness and trust at a glance.",
  },
  {
    question: "Is checkout handled securely?",
    answer:
      "Yes. Plan purchases use Stripe Checkout. Subscription access is synchronized from verified webhook events.",
  },
];

const badgeClasses =
  "inline-flex items-center rounded-full border border-[#0f766e]/25 bg-[#0f766e]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#0f766e]";

const linkClasses =
  "rounded-full px-3 py-2 text-sm font-medium text-[#334155] transition-colors motion-reduce:transition-none hover:text-[#0f766e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f766e] focus-visible:ring-offset-2";

export default function LandingPage() {
  return (
    <div className="relative isolate overflow-hidden bg-[#f7f6f3] text-[#0f172a]">
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[32rem] bg-[radial-gradient(70%_70%_at_20%_10%,rgba(15,118,110,0.22),transparent_65%),radial-gradient(65%_65%_at_82%_8%,rgba(234,88,12,0.22),transparent_70%)]" />

      <header className="sticky top-0 z-30 border-b border-[#0f172a]/10 bg-[#f7f6f3]/95 backdrop-blur">
        <nav
          aria-label="Primary"
          className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-3 md:px-8"
        >
          <Link
            href="#top"
            className="rounded-md text-lg font-black tracking-tight text-[#0f172a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f766e] focus-visible:ring-offset-2"
          >
            Price Tracker
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
            text="Start trial"
            extraStyle="btn-sm !rounded-full !border-[#0f766e] !bg-[#0f766e] !px-5 !text-white hover:!bg-[#115e59] focus-visible:!outline-none focus-visible:!ring-2 focus-visible:!ring-[#0f766e] focus-visible:!ring-offset-2"
          />
        </nav>

        <div className="border-t border-[#0f172a]/10 md:hidden">
          <div className="mx-auto flex w-full max-w-6xl gap-2 overflow-x-auto px-5 py-2">
            <Link href="#benefits" className={`${linkClasses} whitespace-nowrap`}>
              Benefits
            </Link>
            <Link href="#workflow" className={`${linkClasses} whitespace-nowrap`}>
              How it works
            </Link>
            <Link href="#pricing" className={`${linkClasses} whitespace-nowrap`}>
              Pricing
            </Link>
            <Link href="#faq" className={`${linkClasses} whitespace-nowrap`}>
              FAQ
            </Link>
          </div>
        </div>
      </header>

      <main id="top">
        <section className="mx-auto grid w-full max-w-6xl gap-12 px-5 pb-16 pt-14 md:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:pb-24 lg:pt-20">
          <div>
            <span className={badgeClasses}>Competitor Pricing Intelligence</span>
            <h1 className="mt-5 text-balance text-4xl font-black tracking-tight text-[#0f172a] sm:text-5xl lg:text-6xl">
              Stop guessing on competitor pricing.
              <span className="block text-[#0f766e]">Respond with verified signals.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-pretty text-lg leading-relaxed text-[#334155]">
              Price Tracker monitors competitor pricing pages, detects meaningful changes, and surfaces confidence-backed diffs so your team can act faster.
            </p>

            <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
              <ButtonSignin
                text="Start free 7-day trial"
                extraStyle="!rounded-full !border-[#0f766e] !bg-[#0f766e] !px-6 !text-white hover:!bg-[#115e59]"
              />
              <Link
                href="#pricing"
                className="inline-flex items-center justify-center rounded-full border border-[#0f172a]/20 px-6 py-3 text-sm font-semibold text-[#0f172a] transition-colors motion-reduce:transition-none hover:border-[#0f766e] hover:text-[#0f766e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f766e] focus-visible:ring-offset-2"
              >
                View plans
              </Link>
            </div>

            <p className="mt-4 text-sm text-[#475569]">
              No card required for trial. Weekly digest emails are sent to paying users only.
            </p>
          </div>

          <div className="relative">
            <div className="absolute -left-8 -top-6 h-16 w-16 rounded-full bg-[#0f766e]/20 blur-2xl motion-safe:animate-pulse motion-reduce:animate-none" />
            <div className="absolute -bottom-8 right-2 h-24 w-24 rounded-full bg-[#ea580c]/20 blur-2xl motion-safe:animate-pulse motion-reduce:animate-none" />

            <div className="relative overflow-hidden rounded-3xl border border-[#0f172a]/10 bg-white shadow-[0_20px_60px_-30px_rgba(2,6,23,0.45)]">
              <Image
                src="/images/price-tracker-hero.jpg"
                alt="Price Tracker dashboard context on a laptop with workspace details"
                width={1536}
                height={1024}
                priority
                sizes="(min-width: 1024px) 48vw, 100vw"
                className="h-auto w-full object-cover"
              />

              <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-[#0f172a]/40 to-transparent" />

              <div className="relative m-4 rounded-2xl border border-white/45 bg-white/92 p-4 shadow-lg backdrop-blur sm:absolute sm:bottom-6 sm:left-6 sm:right-6 sm:m-0 sm:p-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#0f766e]">
                    Live change feed
                  </p>
                  <p className="mt-1 text-base font-bold text-[#0f172a]">
                    Today&apos;s verified movements
                  </p>
                </div>

                <ul className="mt-3 space-y-2" aria-label="Sample pricing changes">
                  <li className="rounded-xl border border-[#e2e8f0] bg-[#f8fafc] px-3 py-2.5">
                    <p className="text-xs font-semibold text-[#0f172a]">
                      Rival A raised Pro from $39 to $49
                    </p>
                    <p className="mt-0.5 text-xs text-[#475569]">
                      Severity: High · Checked 8 minutes ago
                    </p>
                  </li>
                  <li className="rounded-xl border border-[#e2e8f0] bg-[#f8fafc] px-3 py-2.5">
                    <p className="text-xs font-semibold text-[#0f172a]">
                      Rival B moved trial from 14 to 7 days
                    </p>
                    <p className="mt-0.5 text-xs text-[#475569]">
                      Severity: Medium · Checked 22 minutes ago
                    </p>
                  </li>
                </ul>

                <div className="mt-3 flex items-center justify-between">
                  <p className="text-xs font-medium text-[#334155]">
                    Confidence-tagged updates only
                  </p>
                  <span className="inline-flex items-center rounded-full bg-[#dcfce7] px-2.5 py-1 text-xs font-semibold text-[#166534]">
                    98% confidence
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="benefits" aria-labelledby="benefits-title" className="mx-auto w-full max-w-6xl px-5 pb-16 md:px-8 lg:pb-24">
          <div className="mb-9">
            <p className={badgeClasses}>Value</p>
            <h2 id="benefits-title" className="mt-4 text-3xl font-black tracking-tight text-[#0f172a] sm:text-4xl">
              Built to make pricing decisions less risky
            </h2>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            {benefits.map((item) => (
              <article
                key={item.title}
                className="rounded-2xl border border-[#0f172a]/10 bg-white/90 p-6 shadow-[0_14px_30px_-24px_rgba(2,6,23,0.75)]"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#0f766e]">{item.eyebrow}</p>
                <h3 className="mt-3 text-xl font-bold text-[#0f172a]">{item.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-[#475569]">{item.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="workflow" aria-labelledby="workflow-title" className="bg-[#0f172a] py-16 text-white lg:py-20">
          <div className="mx-auto w-full max-w-6xl px-5 md:px-8">
            <p className="inline-flex items-center rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#99f6e4]">
              Workflow
            </p>
            <h2 id="workflow-title" className="mt-4 max-w-3xl text-3xl font-black tracking-tight sm:text-4xl">
              From setup to signal in four practical steps
            </h2>

            <div className="mt-8 grid gap-4 md:grid-cols-2">
              {workflow.map((step) => (
                <article key={step.title} className="rounded-2xl border border-white/15 bg-white/[0.03] p-5">
                  <h3 className="text-lg font-bold text-white">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-300">{step.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section aria-labelledby="trust-title" className="mx-auto w-full max-w-6xl px-5 py-16 md:px-8 lg:py-24">
          <div className="grid gap-10 lg:grid-cols-[1fr_0.9fr] lg:items-start">
            <div>
              <p className={badgeClasses}>Trust by design</p>
              <h2 id="trust-title" className="mt-4 text-3xl font-black tracking-tight text-[#0f172a] sm:text-4xl">
                Signals stay useful because confidence comes first
              </h2>
              <p className="mt-4 max-w-xl text-base leading-relaxed text-[#475569]">
                Price Tracker favors low-noise, verifiable updates over aggressive automation. If confidence is low, the product flags uncertainty instead of pretending certainty.
              </p>

              <div className="mt-7 flex flex-wrap gap-2 text-sm">
                <span className="rounded-full border border-[#0f766e]/20 bg-[#0f766e]/10 px-3 py-1 font-medium text-[#0f766e]">Verified vs unverified separation</span>
                <span className="rounded-full border border-[#ea580c]/20 bg-[#ea580c]/10 px-3 py-1 font-medium text-[#9a3412]">Static-first crawling</span>
                <span className="rounded-full border border-[#0f172a]/15 bg-white px-3 py-1 font-medium text-[#334155]">Hash-gated extraction</span>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
              {trustStats.map((stat) => (
                <article
                  key={stat.label}
                  className="rounded-2xl border border-[#0f172a]/10 bg-white p-5 shadow-[0_14px_30px_-24px_rgba(2,6,23,0.65)]"
                >
                  <p className="text-3xl font-black tracking-tight text-[#0f172a]">{stat.value}</p>
                  <p className="mt-1 text-sm font-semibold uppercase tracking-[0.12em] text-[#0f766e]">{stat.label}</p>
                  <p className="mt-2 text-sm text-[#475569]">{stat.note}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="pricing" aria-labelledby="pricing-title" className="border-y border-[#0f172a]/10 bg-white/70 py-16 lg:py-20">
          <div className="mx-auto w-full max-w-6xl px-5 md:px-8">
            <div className="max-w-3xl">
              <p className={badgeClasses}>Pricing</p>
              <h2 id="pricing-title" className="mt-4 text-3xl font-black tracking-tight text-[#0f172a] sm:text-4xl">
                Choose your competitor coverage
              </h2>
              <p className="mt-3 text-base text-[#475569]">
                Plans are wired to Stripe Checkout. Pick the one matching your monitoring scope, then activate instantly.
              </p>
            </div>

            <div className="mt-8 grid gap-5 lg:grid-cols-2">
              {config.stripe.plans.map((plan) => (
                <article
                  key={plan.priceId}
                  className={`rounded-3xl border p-6 shadow-[0_14px_30px_-24px_rgba(2,6,23,0.7)] ${
                    plan.isFeatured
                      ? "border-[#0f766e]/40 bg-gradient-to-b from-white to-[#f0fdfa]"
                      : "border-[#0f172a]/10 bg-white"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-2xl font-black tracking-tight text-[#0f172a]">{plan.name}</h3>
                      {plan.description ? <p className="mt-2 text-sm text-[#475569]">{plan.description}</p> : null}
                    </div>
                    {plan.isFeatured ? (
                      <span className="rounded-full border border-[#0f766e]/20 bg-[#0f766e]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.1em] text-[#0f766e]">
                        Most Popular
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-6 flex items-end gap-2">
                    {plan.priceAnchor ? (
                      <span className="text-lg font-semibold text-[#64748b] line-through">${plan.priceAnchor}</span>
                    ) : null}
                    <span className="text-5xl font-black tracking-tight text-[#0f172a]">${plan.price}</span>
                    <span className="pb-1 text-sm font-semibold uppercase tracking-[0.12em] text-[#64748b]">USD</span>
                  </div>

                  <ul className="mt-6 space-y-2" aria-label={`${plan.name} features`}>
                    {plan.features.map((feature) => (
                      <li key={feature.name} className="flex items-start gap-2 text-sm text-[#334155]">
                        <span aria-hidden className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#0f766e]" />
                        <span>{feature.name}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-6">
                    <ButtonCheckout priceId={plan.priceId} />
                    <p className="mt-2 text-center text-xs text-[#64748b]">Secure Stripe checkout</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="faq" aria-labelledby="faq-title" className="mx-auto w-full max-w-5xl px-5 py-16 md:px-8 lg:py-24">
          <div className="mb-8">
            <p className={badgeClasses}>FAQ</p>
            <h2 id="faq-title" className="mt-4 text-3xl font-black tracking-tight text-[#0f172a] sm:text-4xl">
              Common questions before you start
            </h2>
          </div>

          <div className="space-y-3">
            {faqs.map((faq) => (
              <details
                key={faq.question}
                className="group rounded-2xl border border-[#0f172a]/10 bg-white p-5 open:border-[#0f766e]/35"
              >
                <summary className="cursor-pointer list-none pr-6 text-left text-base font-semibold text-[#0f172a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f766e] focus-visible:ring-offset-2">
                  {faq.question}
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-[#475569]">{faq.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="pb-20 px-5 md:px-8">
          <div className="mx-auto w-full max-w-6xl rounded-3xl border border-[#0f172a]/10 bg-[#0f172a] px-6 py-12 text-white shadow-[0_20px_60px_-28px_rgba(2,6,23,0.9)] sm:px-10">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#99f6e4]">Ready to monitor smarter?</p>
            <h2 className="mt-3 max-w-2xl text-3xl font-black tracking-tight sm:text-4xl">
              Launch Price Tracker and catch the next competitor move before it catches you.
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-300">
              Start your trial, connect your first competitors, and get confidence-tagged pricing updates in your dashboard.
            </p>

            <div className="mt-7 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
              <ButtonSignin
                text="Start trial now"
                extraStyle="!rounded-full !border-0 !bg-[#14b8a6] !px-6 !text-[#0f172a] hover:!bg-[#2dd4bf]"
              />
              <Link
                href="#pricing"
                className="inline-flex items-center justify-center rounded-full border border-white/25 px-6 py-3 text-sm font-semibold text-white transition-colors motion-reduce:transition-none hover:border-[#99f6e4] hover:text-[#99f6e4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#99f6e4] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0f172a]"
              >
                Compare plans
              </Link>
            </div>
          </div>

          <footer className="mx-auto mt-8 w-full max-w-6xl border-t border-[#0f172a]/10 pt-6 text-sm text-[#64748b]">
            <p>© {new Date().getFullYear()} Price Tracker. Competitor pricing intelligence for decisive teams.</p>
          </footer>
        </section>
      </main>
    </div>
  );
}
