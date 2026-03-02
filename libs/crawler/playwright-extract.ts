import {
  CRAWL_REQUEST_HEADERS,
  CUSTOM_PRICING_SIGNALS,
  ONE_TIME_PRICING_SIGNALS,
  PLAYWRIGHT_EXTRACTION_TIMEOUT_MS,
  PLAYWRIGHT_TOGGLE_SETTLE_MS,
} from "@/libs/crawler/constants";
import {
  canonicalizePricingPayload,
  createContentHash,
  normalizeHtmlForHash,
  normalizeUrl,
  type NormalizedExtractedPlan,
  type NormalizedPricingPayload,
  type PricePeriod,
} from "@/libs/crawler/normalize";

interface RenderedPricePoint {
  amount: number;
  currency: string;
}

interface RenderedPlanCard {
  planName: string | null;
  prices: RenderedPricePoint[];
  text: string;
}

interface RenderedStatePayload {
  cadence: PricePeriod | null;
  planCards: RenderedPlanCard[];
  html: string;
  text: string;
}

export interface PlaywrightExtractionResult {
  contentHash: string;
  pricingPayload: NormalizedPricingPayload;
  confidence: number;
  isVerified: boolean;
  extractedCadences: PricePeriod[];
}

const CADENCE_TOGGLE_SELECTOR =
  'button, [role="button"], [role="tab"], label, [aria-pressed], [data-state], [type="button"]';

const buildNavigationUrl = (originalUrl: string, normalizedUrl: string): string => {
  try {
    const prepared = originalUrl.includes("://") ? originalUrl : `https://${originalUrl}`;
    const hash = new URL(prepared).hash;
    return hash ? `${normalizedUrl}${hash}` : normalizedUrl;
  } catch {
    return normalizedUrl;
  }
};

const normalizeWhitespace = (value: string): string => {
  return value.replace(/\s+/g, " ").trim();
};

const uniqueStrings = (items: string[]): string[] => {
  return [...new Set(items.map((item) => normalizeWhitespace(item).toLowerCase()))].filter(Boolean);
};

const detectCadenceFromText = (value: string): PricePeriod | null => {
  const lowered = value.toLowerCase();

  if (/(^|\W)(monthly|month)(\W|$)/.test(lowered)) {
    return "month";
  }

  if (/(^|\W)(yearly|annual|annually|year)(\W|$)/.test(lowered)) {
    return "year";
  }

  return null;
};

const toPeriod = (cardText: string, activeCadence: PricePeriod | null): PricePeriod => {
  const lowered = cardText.toLowerCase();

  if (/billed yearly|billed annually|annual plan|yearly plan/.test(lowered)) {
    return "year";
  }

  if (/billed monthly|monthly plan|per month|\/month|\/mo|monthly/.test(lowered)) {
    return activeCadence === "year" && /billed yearly|billed annually/.test(lowered) ? "year" : "month";
  }

  if (/per year|\/year|yearly|annual|annually/.test(lowered)) {
    return "year";
  }

  return activeCadence ?? "unknown";
};

const computeConfidence = (
  planNames: string[],
  extractedPlans: NormalizedExtractedPlan[],
  priceCount: number,
  extractedCadences: PricePeriod[],
  customHints: string[]
): number => {
  if (priceCount === 0 && customHints.length === 0) {
    return 0;
  }

  let confidence = 0;

  if (priceCount > 0) {
    confidence += 0.35;
  }

  if (priceCount >= 2) {
    confidence += 0.1;
  }

  if (planNames.length >= 1) {
    confidence += 0.15;
  }

  if (planNames.length >= 2) {
    confidence += 0.15;
  }

  if (extractedPlans.length >= 1) {
    confidence += 0.12;
  }

  if (extractedPlans.length >= 2) {
    confidence += 0.1;
  }

  if (planNames.length > 0 && priceCount > 0) {
    confidence += 0.1;
  }

  const uniqueCadences = uniqueStrings(extractedCadences);
  if (uniqueCadences.includes("month") && uniqueCadences.includes("year")) {
    confidence += 0.15;
  } else if (uniqueCadences.length === 1 && priceCount > 0) {
    confidence += 0.05;
  }

  if (priceCount > 0 && planNames.length === 0) {
    confidence = Math.min(confidence, 0.68);
  }

  return Math.max(0, Math.min(0.96, confidence));
};

const isAnnualPriceShownPerMonth = (cardText: string): boolean => {
  const lowered = cardText.toLowerCase();
  const hasBilledAnnually = /billed yearly|billed annually/.test(lowered);
  const hasPerMonth = /\/month|\/mo|per month/.test(lowered);
  return hasBilledAnnually && hasPerMonth;
};

const buildExtractedPlans = (states: RenderedStatePayload[]): NormalizedExtractedPlan[] => {
  const planMap = new Map<string, NormalizedExtractedPlan>();

  for (const state of states) {
    for (const card of state.planCards) {
      const planName = card.planName ? normalizeWhitespace(card.planName) : "";
      if (!planName) {
        continue;
      }

      const dedupeKey = planName.toLowerCase();
      const primaryPrice = [...card.prices]
        .sort((left, right) => left.amount - right.amount)
        .at(0);

      if (!primaryPrice) {
        continue;
      }

      const existing = planMap.get(dedupeKey) ?? {
        name: planName,
        currency: primaryPrice.currency,
        monthlyPrice: null,
        annualPrice: null,
      };

      if (!existing.currency) {
        existing.currency = primaryPrice.currency;
      }

      if (state.cadence === "month" && existing.monthlyPrice === null) {
        existing.monthlyPrice = primaryPrice.amount;
      }

      if (state.cadence === "year" && existing.annualPrice === null) {
        existing.annualPrice = primaryPrice.amount;
        existing.annualPriceIsPerMonth = isAnnualPriceShownPerMonth(card.text);
      }

      if (state.cadence === null) {
        const inferredPeriod = toPeriod(card.text, null);
        if (inferredPeriod === "month" && existing.monthlyPrice === null) {
          existing.monthlyPrice = primaryPrice.amount;
        }

        if (inferredPeriod === "year" && existing.annualPrice === null) {
          existing.annualPrice = primaryPrice.amount;
          existing.annualPriceIsPerMonth = isAnnualPriceShownPerMonth(card.text);
        }
      }

      planMap.set(dedupeKey, existing);
    }
  }

  return [...planMap.values()].filter(
    (plan) => plan.monthlyPrice !== null || plan.annualPrice !== null
  );
};

const RENDERED_STATE_EVALUATE_SCRIPT = `(() => {
  function normalizeText(value) {
    return value.replace(/\\s+/g, " ").trim();
  }

  function isLikelyPlanName(value) {
    const normalized = normalizeText(value);
    if (!normalized) return false;
    if (normalized.length > 28) return false;
    if (normalized.split(/\\s+/).length > 4) return false;
    if (/[,:!?]/.test(normalized) || /\\d/.test(normalized) || normalized.includes(".")) return false;
    return !/save up|months free|launch price|most popular|per month|billed|trial|price tag|credit card|required|enterprise power|integrations|history|users|pages|cadence|coverage/i.test(normalized);
  }

  function isVisible(element) {
    if (!(element instanceof HTMLElement)) return false;
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && Number.parseFloat(style.opacity || "1") > 0 && rect.width > 120 && rect.height > 80;
  }

  function isTextVisible(element) {
    if (!(element instanceof HTMLElement)) return false;
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== "none" && style.visibility !== "hidden" && Number.parseFloat(style.opacity || "1") > 0 && rect.width > 0 && rect.height > 0;
  }

  const pricePattern = /(?:\\b(?:USD|EUR|GBP|CAD|AUD|JPY)\\b\\s*|[€£$¥])\\s*(\\d{1,4}(?:,\\d{3})*(?:\\.\\d{1,2})?)/gi;
  const customSignals = ["contact sales","custom pricing","talk to sales","enterprise pricing","request a quote","book a demo"];
  const oneTimeSignals = ["one-time payment","one time payment","pay once","one-time fee","lifetime access","yours forever","buy once","single payment"];

  const candidateElements = Array.from(document.querySelectorAll("article, section, div, li")).filter(isVisible);
  const cards = candidateElements.map((element) => {
    const text = normalizeText(element.innerText || "");
    if (text.length < 20 || text.length > 1800) return null;

    const priceElements = Array.from(element.querySelectorAll("*"))
      .filter(isTextVisible)
      .map((entry) => {
        const raw = normalizeText(entry.textContent || "");
        pricePattern.lastIndex = 0;
        if (!pricePattern.test(raw)) return null;
        pricePattern.lastIndex = 0;
        const style = window.getComputedStyle(entry);
        const fontSize = Number.parseFloat(style.fontSize || "0");
        const isStruck = style.textDecorationLine.includes("line-through") || style.textDecoration.includes("line-through") || entry.closest("s, del, strike, [class*='line-through'], [class*='strikethrough']") !== null;
        return { raw, fontSize, isStruck };
      })
      .filter(Boolean);

    const nonStruckPriceElements = priceElements.filter((price) => !price.isStruck);
    const maxFontSize = nonStruckPriceElements.reduce((largest, price) => Math.max(largest, price.fontSize), 0);
    const primaryPrices = nonStruckPriceElements
      .filter((price) => price.fontSize >= Math.max(20, maxFontSize - 1))
      .map((price) => ({ raw: price.raw }));

    const hasCustomSignal = customSignals.some((signal) => text.toLowerCase().includes(signal));
    const featureCount = element.querySelectorAll("li").length;
    if (primaryPrices.length === 0 && !hasCustomSignal) return null;

    const headingCandidates = Array.from(
      element.querySelectorAll("h1, h2, h3, h4, h5, [data-plan-name], [data-plan-title], strong, b")
    )
      .map((entry) => normalizeText(entry.textContent || ""))
      .filter((entry) => isLikelyPlanName(entry));
    const normalizedHeading = headingCandidates[0] || null;

    const buttonText = normalizeText(
      Array.from(element.querySelectorAll("button, a"))
        .slice(0, 2)
        .map((entry) => entry.textContent || "")
        .join(" ")
    );

    let score = 0;
    if (normalizedHeading) score += 4;
    if (primaryPrices.length > 0) score += 4;
    if (/start|get started|contact sales|book|trial/i.test(buttonText)) score += 2;
    if (featureCount >= 2) score += 2;
    if (/feature|everything in|get started|contact sales|popular/.test(text.toLowerCase())) score += 2;
    if (oneTimeSignals.some((signal) => text.toLowerCase().includes(signal))) score += 2;

    if (score < 7 || primaryPrices.length === 0 || !normalizedHeading) return null;
    return { planName: normalizedHeading, text, prices: primaryPrices, score };
  }).filter(Boolean).sort((left, right) => right.score - left.score).slice(0, 12);

  const dedupedCards = [];
  const seenKeys = new Set();
  for (const card of cards) {
    const key = (card.planName || "unknown") + "|" + card.prices.map((price) => price.raw).join("|");
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    dedupedCards.push({ planName: card.planName, text: card.text, prices: card.prices });
  }

  return {
    text: normalizeText(document.body.innerText || ""),
    planCards: dedupedCards,
  };
})()`;

const extractRenderedState = async (
  page: import("playwright").Page,
  cadence: PricePeriod | null
): Promise<RenderedStatePayload> => {
  const html = await page.content();
  const payload = await page.evaluate(RENDERED_STATE_EVALUATE_SCRIPT);

  const planCards: RenderedPlanCard[] = payload.planCards.map((card) => ({
    planName: card.planName,
    text: card.text,
    prices: card.prices
      .map((price) => {
        const currencyMatch = price.raw.match(/\b(USD|EUR|GBP|CAD|AUD|JPY)\b|([€£$¥])/i);
        const amountMatch = price.raw.match(/(\d{1,4}(?:,\d{3})*(?:\.\d{1,2})?)/);
        const currencyToken = currencyMatch?.[1] ?? currencyMatch?.[2] ?? null;
        const amountToken = amountMatch?.[1] ?? null;

        if (!currencyToken || !amountToken) {
          return null;
        }

        const amount = Number.parseFloat(amountToken.replace(/,/g, ""));
        if (!Number.isFinite(amount) || amount <= 0) {
          return null;
        }

        const currency = currencyToken.length === 1
          ? currencyToken === "$"
            ? "USD"
            : currencyToken === "€"
              ? "EUR"
              : currencyToken === "£"
                ? "GBP"
                : currencyToken === "¥"
                  ? "JPY"
                  : currencyToken
          : currencyToken.toUpperCase();

        return {
          amount,
          currency,
        };
      })
      .filter((price): price is RenderedPricePoint => price !== null),
  }));

  return {
    cadence,
    planCards,
    html,
    text: payload.text,
  };
};

const clickCadenceIfPresent = async (
  page: import("playwright").Page,
  label: RegExp
): Promise<boolean> => {
  const exactCandidates = [
    page.getByRole("tab").filter({ hasText: label }),
    page.getByRole("button").filter({ hasText: label }),
    page.getByRole("switch", { name: label }),
    page.locator("label").filter({ hasText: label }),
    page.locator(CADENCE_TOGGLE_SELECTOR).filter({ hasText: label }),
  ];

  for (const locator of exactCandidates) {
    const count = await locator.count().catch((): number => 0);

    for (let index = 0; index < count; index += 1) {
      const candidate = locator.nth(index);

      if (!(await candidate.isVisible().catch((): boolean => false))) {
        continue;
      }

      await candidate.click({ timeout: 2_000 }).catch((): undefined => undefined);
      await page.waitForTimeout(PLAYWRIGHT_TOGGLE_SETTLE_MS);
      return true;
    }
  }

  return false;
};

export const extractPricingWithPlaywright = async (
  sourceUrl: string
): Promise<PlaywrightExtractionResult | null> => {
  const normalizedSourceUrl = normalizeUrl(sourceUrl);
  if (!normalizedSourceUrl) {
    return null;
  }

  const navigationUrl = buildNavigationUrl(sourceUrl, normalizedSourceUrl);

  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext({
      extraHTTPHeaders: CRAWL_REQUEST_HEADERS,
    });
    const page = await context.newPage();

    await page.goto(navigationUrl, {
      waitUntil: "domcontentloaded",
      timeout: PLAYWRIGHT_EXTRACTION_TIMEOUT_MS,
    });

    await page.waitForLoadState("networkidle", {
      timeout: Math.min(PLAYWRIGHT_EXTRACTION_TIMEOUT_MS, 5_000),
    }).catch((): undefined => undefined);

    const extractedStates: RenderedStatePayload[] = [];

    extractedStates.push(await extractRenderedState(page, null));

    const clickedMonthly = await clickCadenceIfPresent(page, /\bmonthly\b/i).catch(
      (): boolean => false
    );
    if (clickedMonthly) {
      extractedStates.push(await extractRenderedState(page, "month"));
    }

    const clickedYearly = await clickCadenceIfPresent(page, /\b(yearly|annual)\b/i).catch(
      (): boolean => false
    );
    if (clickedYearly) {
      extractedStates.push(await extractRenderedState(page, "year"));
    }

    const planNames: string[] = [];
    const priceMentions: Array<{ amount: number; currency: string; period: PricePeriod }> = [];
    const customPricingHints: string[] = [];
    const oneTimePricingHints: string[] = [];
    const renderedHtml = extractedStates.map((state) => state.html).join("\n");
    const extractedCadences: PricePeriod[] = [];

    for (const state of extractedStates) {
      if (state.cadence) {
        extractedCadences.push(state.cadence);
      }

      for (const signal of CUSTOM_PRICING_SIGNALS) {
        if (state.text.toLowerCase().includes(signal)) {
          customPricingHints.push(signal);
        }
      }
      for (const signal of ONE_TIME_PRICING_SIGNALS) {
        if (state.text.toLowerCase().includes(signal)) {
          oneTimePricingHints.push(signal);
        }
      }

      for (const card of state.planCards) {
        if (card.planName) {
          planNames.push(card.planName);
        }

        const period = toPeriod(card.text, state.cadence);

        for (const price of card.prices) {
          priceMentions.push({
            amount: price.amount,
            currency: price.currency,
            period,
          });
        }
      }
    }

    const extractedPlans = buildExtractedPlans(extractedStates);

    const payload = canonicalizePricingPayload({
      sourceUrl: normalizedSourceUrl,
      pageTitle: await page.title().catch((): null => null),
      pageDescription: null,
      planNames,
      priceMentions,
      extractedPlans,
      customPricingHints,
      oneTimePricingHints,
    });

    const confidence = computeConfidence(
      payload.planNames,
      payload.extractedPlans ?? [],
      payload.priceMentions.length,
      extractedCadences,
      payload.customPricingHints
    );

    return {
      contentHash: createContentHash(normalizeHtmlForHash(renderedHtml)),
      pricingPayload: payload,
      confidence,
      isVerified: confidence >= 0.75 && payload.planNames.length > 0 && payload.priceMentions.length > 0,
      extractedCadences,
    };
  } finally {
    await browser.close();
  }
};
