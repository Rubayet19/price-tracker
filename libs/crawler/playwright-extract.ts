import {
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
  type PricingExtractionDebug,
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
  enrichmentText: string;
}

const CADENCE_TOGGLE_SELECTOR =
  'button, [role="button"], [role="tab"], label, [aria-pressed], [data-state], [type="button"]';

const buildNavigationUrl = (
  originalUrl: string,
  normalizedUrl: string
): string => {
  try {
    const prepared = originalUrl.includes("://")
      ? originalUrl
      : `https://${originalUrl}`;
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
  return [
    ...new Set(items.map((item) => normalizeWhitespace(item).toLowerCase())),
  ].filter(Boolean);
};

const getPageDescription = async (
  page: import("playwright").Page
): Promise<string | null> => {
  return page
    .locator('meta[name="description"], meta[property="og:description"]')
    .first()
    .getAttribute("content")
    .then((value) => normalizeWhitespace(value ?? ""))
    .then((value) => (value.length > 0 ? value : null))
    .catch((): null => null);
};

const waitForPricingReady = async (
  page: import("playwright").Page
): Promise<void> => {
  await page.locator("body").waitFor({
    state: "visible",
    timeout: Math.min(PLAYWRIGHT_EXTRACTION_TIMEOUT_MS, 5_000),
  });

  await page
    .waitForFunction(
      () => {
        const bodyText = document.body?.innerText ?? "";
        return (
          bodyText.trim().length >= 120 ||
          document.querySelector("main") !== null ||
          document.querySelector('[class*="pricing"], [id*="pricing"]') !== null
        );
      },
      { timeout: Math.min(PLAYWRIGHT_EXTRACTION_TIMEOUT_MS, 5_000) }
    )
    .catch((): undefined => undefined);
};

const collectCadenceToggleLabels = async (
  page: import("playwright").Page
): Promise<string[]> => {
  const locator = page.locator(CADENCE_TOGGLE_SELECTOR);
  const count = await locator.count().catch((): number => 0);
  const labels: string[] = [];

  for (let index = 0; index < count; index += 1) {
    const candidate = locator.nth(index);
    const visible = await candidate.isVisible().catch((): boolean => false);
    if (!visible) {
      continue;
    }

    const text = await candidate.innerText().catch((): string => "");
    const normalized = normalizeWhitespace(text);
    if (
      normalized &&
      /\b(monthly|month|yearly|annual|annually|year)\b/i.test(normalized)
    ) {
      labels.push(normalized);
    }
  }

  return [...new Set(labels)];
};

const waitForCadenceUpdate = async (
  page: import("playwright").Page,
  previousState: {
    bodyText: string;
    className: string | null;
    ariaPressed: string | null;
    ariaSelected: string | null;
    dataState: string | null;
  },
  candidate?: import("playwright").Locator
): Promise<boolean> => {
  const timeoutAt =
    Date.now() + Math.max(1_200, PLAYWRIGHT_TOGGLE_SETTLE_MS + 1_200);

  while (Date.now() < timeoutAt) {
    const currentText = await page
      .locator("body")
      .innerText()
      .catch((): string => "");
    if (currentText !== previousState.bodyText) {
      return true;
    }

    if (candidate) {
      const currentClassName = await candidate
        .getAttribute("class")
        .catch((): string | null => null);
      const currentAriaPressed = await candidate
        .getAttribute("aria-pressed")
        .catch((): string | null => null);
      const currentAriaSelected = await candidate
        .getAttribute("aria-selected")
        .catch((): string | null => null);
      const currentDataState = await candidate
        .getAttribute("data-state")
        .catch((): string | null => null);

      if (
        currentClassName !== previousState.className ||
        currentAriaPressed !== previousState.ariaPressed ||
        currentAriaSelected !== previousState.ariaSelected ||
        currentDataState !== previousState.dataState
      ) {
        return true;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  return false;
};

const captureCadenceControlState = async (
  page: import("playwright").Page,
  candidate?: import("playwright").Locator
): Promise<{
  bodyText: string;
  className: string | null;
  ariaPressed: string | null;
  ariaSelected: string | null;
  dataState: string | null;
}> => {
  const bodyText = await page
    .locator("body")
    .innerText()
    .catch((): string => "");

  if (!candidate) {
    return {
      bodyText,
      className: null,
      ariaPressed: null,
      ariaSelected: null,
      dataState: null,
    };
  }

  const [className, ariaPressed, ariaSelected, dataState] = await Promise.all([
    candidate.getAttribute("class").catch((): string | null => null),
    candidate.getAttribute("aria-pressed").catch((): string | null => null),
    candidate.getAttribute("aria-selected").catch((): string | null => null),
    candidate.getAttribute("data-state").catch((): string | null => null),
  ]);

  return {
    bodyText,
    className,
    ariaPressed,
    ariaSelected,
    dataState,
  };
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

const hasAnnualBillingSignal = (value: string): boolean => {
  return /billed yearly|billed annually|paid yearly|paid annually|annual plan|yearly plan|billed for 12 months|billed for 1 year|12-month billing|12 month billing|annual billing|yearly billing/.test(
    value
  );
};

const hasMonthlyPricingSignal = (value: string): boolean => {
  return /billed monthly|monthly plan|per month|\/\s*month|\/\s*mo\b|monthly/.test(
    value
  );
};

const toPeriod = (
  cardText: string,
  activeCadence: PricePeriod | null
): PricePeriod => {
  const lowered = cardText.toLowerCase();

  if (hasAnnualBillingSignal(lowered)) {
    return "year";
  }

  if (activeCadence === "year" && hasMonthlyPricingSignal(lowered)) {
    return "year";
  }

  if (hasMonthlyPricingSignal(lowered)) {
    return "month";
  }

  if (/per year|\/year|yearly|annual|annually/.test(lowered)) {
    return "year";
  }

  // Detect daily pricing (e.g. marketing "~$0.28 per day" conversions)
  if (/per day|\/day/.test(lowered)) {
    return "day";
  }

  // Detect one-time / lifetime pricing
  if (
    /\/lifetime|one-time payment|one time payment|pay once|lifetime access|buy once/.test(
      lowered
    )
  ) {
    return "one_time";
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
  const hasBilledAnnually = hasAnnualBillingSignal(lowered);
  const hasPerMonth = /\/month|\/mo|per month/.test(lowered);
  return hasBilledAnnually && hasPerMonth;
};

const buildExtractedPlans = (
  states: RenderedStatePayload[]
): NormalizedExtractedPlan[] => {
  const prioritizedStates = [
    ...states.filter((state) => state.cadence !== null),
    ...states.filter((state) => state.cadence === null),
  ];
  const planMap = new Map<string, NormalizedExtractedPlan>();
  const unknownPeriodPlans = new Map<
    string,
    { amount: number; cardText: string }
  >();

  for (const state of prioritizedStates) {
    for (const card of state.planCards) {
      const planName = card.planName ? normalizeWhitespace(card.planName) : "";
      if (!planName) {
        continue;
      }

      // Skip cards whose price is a "per day" marketing conversion (e.g. "~$0.28 per day").
      // These appear in all toggle states and should never be treated as plan pricing.
      if (/per day|\/day/.test(card.text.toLowerCase())) {
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
          existing.annualPriceIsPerMonth = isAnnualPriceShownPerMonth(
            card.text
          );
        }

        if (inferredPeriod === "unknown" && primaryPrice.amount > 0) {
          unknownPeriodPlans.set(dedupeKey, {
            amount: primaryPrice.amount,
            cardText: card.text,
          });
        }
      }

      planMap.set(dedupeKey, existing);
    }
  }

  // Second pass: infer period for plans with unknown period from sibling plans
  if (unknownPeriodPlans.size > 0) {
    let siblingMonthly = 0;
    let siblingAnnual = 0;
    for (const plan of planMap.values()) {
      if (plan.monthlyPrice !== null) siblingMonthly++;
      if (plan.annualPrice !== null) siblingAnnual++;
    }

    let inferredPeriod: "month" | "year" | null =
      siblingMonthly > 0 ? "month" : siblingAnnual > 0 ? "year" : null;

    // Fallback: when no siblings have known periods, scan page text for period indicators.
    // This handles sites like Grammarly where the Free plan shows "/ month" but is filtered
    // from card detection, and the Pro plan's card text has no period indicator.
    if (!inferredPeriod) {
      const combinedText = states
        .map((s) => s.text)
        .join(" ")
        .toLowerCase();
      if (/\/\s*month|per month|\/\s*mo\b/.test(combinedText)) {
        inferredPeriod = "month";
      } else if (/\/year|per year|annually/.test(combinedText)) {
        inferredPeriod = "year";
      }
    }

    if (inferredPeriod) {
      for (const [key, { amount, cardText }] of unknownPeriodPlans) {
        const plan = planMap.get(key);
        if (!plan) continue;
        if (plan.monthlyPrice !== null || plan.annualPrice !== null) continue;

        if (inferredPeriod === "month") {
          plan.monthlyPrice = amount;
        } else {
          plan.annualPrice = amount;
          plan.annualPriceIsPerMonth = isAnnualPriceShownPerMonth(cardText);
        }
      }
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
    if (/^(usd|eur|gbp|cad|aud|jpy|inr|brl|mxn|chf|sek|nok|dkk|nzd|sgd|hkd|krw|try|zar|pln)$/i.test(normalized)) return false;
    return !/save up|months free|launch price|intro price|best value|limited time|most popular|per month|billed|trial|price tag|credit card|required|enterprise power|integrations|history|users|pages|cadence|coverage|compare|pricing|faq|features|trusted by|money-back/i.test(normalized);
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

  function applyTextTransform(element, text) {
    const transform = window.getComputedStyle(element).textTransform;
    if (transform === "capitalize") return text.replace(/\\b\\w/g, function(c) { return c.toUpperCase(); });
    if (transform === "uppercase") return text.toUpperCase();
    return text;
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
        var fontSize = Number.parseFloat(style.fontSize || "0");
        if (entry.children.length > 0) {
          var descendants = entry.querySelectorAll("*");
          for (var di = 0; di < descendants.length; di++) {
            var dText = (descendants[di].textContent || "").trim();
            if (/\\d/.test(dText) && dText.length <= 10) {
              var dFs = Number.parseFloat(window.getComputedStyle(descendants[di]).fontSize || "0");
              if (dFs > fontSize) fontSize = dFs;
            }
          }
        }
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

    var headingCandidates = Array.from(
      element.querySelectorAll("h1, h2, h3, h4, h5, [data-plan-name], [data-plan-title], strong, b")
    )
      .map((entry) => applyTextTransform(entry, normalizeText(entry.textContent || "")))
      .filter((entry) => isLikelyPlanName(entry));

    if (headingCandidates.length === 0) {
      var styledEls = Array.from(element.querySelectorAll("div, span, p")).filter(isTextVisible);
      for (var si = 0; si < styledEls.length; si++) {
        var sEl = styledEls[si];
        var sText = normalizeText(sEl.textContent || "");
        if (!isLikelyPlanName(sText)) continue;
        var sStyle = window.getComputedStyle(sEl);
        var sFw = Number.parseInt(sStyle.fontWeight, 10);
        if (isNaN(sFw)) sFw = sStyle.fontWeight === "bold" ? 700 : 400;
        var sFs = Number.parseFloat(sStyle.fontSize || "0");
        if ((sFw >= 600 || sFs >= 18) && sEl.children.length <= 2) {
          headingCandidates.push(applyTextTransform(sEl, sText));
          break;
        }
      }
    }

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
    if (/\\bfree\\b/i.test(normalizedHeading)) return null;
    return { element, planName: normalizedHeading, text, prices: primaryPrices, score };
  }).filter(Boolean).sort((left, right) => right.score - left.score).slice(0, 12);

  // Remove container elements that span multiple distinct plan headings
  const nonContainerCards = cards.filter((card) => {
    const containedHeadings = new Set();
    for (const other of cards) {
      if (other !== card && card.element.contains(other.element)) {
        containedHeadings.add((other.planName || "").toLowerCase());
      }
    }
    return containedHeadings.size <= 1;
  });

  // Keep cards within 75% of the max score to filter add-on sections
  const maxCardScore = nonContainerCards.reduce((max, card) => Math.max(max, card.score), 0);
  const scoreThreshold = Math.max(7, maxCardScore * 0.75);
  const qualifiedCards = nonContainerCards.filter((card) => card.score >= scoreThreshold);

  // When multiple page sections contain cards, prefer the first section with >= 2 cards
  function getTopSection(el) {
    const mainEl = document.querySelector("main") || document.body;
    let cur = el;
    while (cur.parentElement && cur.parentElement !== mainEl) {
      cur = cur.parentElement;
    }
    return cur;
  }

  let cardsForDedup = qualifiedCards;
  const sectionMap = new Map();
  for (const card of qualifiedCards) {
    const section = getTopSection(card.element);
    if (!sectionMap.has(section)) sectionMap.set(section, []);
    sectionMap.get(section).push(card);
  }
  if (sectionMap.size > 1) {
    const sections = [...sectionMap.entries()].sort(function(a, b) {
      const pos = a[0].compareDocumentPosition(b[0]);
      return pos & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    });
    const firstLarge = sections.find(function(entry) { return entry[1].length >= 2; });
    cardsForDedup = firstLarge ? firstLarge[1] : sections[0][1];
  }

  const dedupedCards = [];
  const seenKeys = new Set();
  for (const card of cardsForDedup) {
    const key = (card.planName || "unknown") + "|" + card.prices.map((price) => price.raw).join("|");
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    dedupedCards.push({ planName: card.planName, text: card.text, prices: card.prices });
  }

  if (dedupedCards.length === 0) {
    var headings = Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, strong, b"))
      .filter(isTextVisible)
      .filter((el) => isLikelyPlanName(normalizeText(el.textContent || "")));

    if (headings.length === 0) {
      headings = Array.from(document.querySelectorAll("div, span, p"))
        .filter(isTextVisible)
        .filter((el) => {
          var txt = normalizeText(el.textContent || "");
          if (!isLikelyPlanName(txt)) return false;
          var st = window.getComputedStyle(el);
          var fw = Number.parseInt(st.fontWeight, 10);
          if (isNaN(fw)) fw = st.fontWeight === "bold" ? 700 : 400;
          var fs = Number.parseFloat(st.fontSize || "0");
          return (fw >= 600 || fs >= 18) && el.children.length <= 2;
        });
    }

    const priceEls = Array.from(document.querySelectorAll("*"))
      .filter(isTextVisible)
      .filter((el) => {
        const raw = normalizeText(el.textContent || "");
        pricePattern.lastIndex = 0;
        if (!pricePattern.test(raw)) return false;
        const style = window.getComputedStyle(el);
        var fontSize = Number.parseFloat(style.fontSize || "0");
        if (el.children.length > 0) {
          var descendants = el.querySelectorAll("*");
          for (var di = 0; di < descendants.length; di++) {
            var dText = (descendants[di].textContent || "").trim();
            if (/\\d/.test(dText) && dText.length <= 10) {
              var dFs = Number.parseFloat(window.getComputedStyle(descendants[di]).fontSize || "0");
              if (dFs > fontSize) fontSize = dFs;
            }
          }
        }
        const isStruck = style.textDecorationLine.includes("line-through") || style.textDecoration.includes("line-through") || el.closest("s, del, strike, [class*='line-through'], [class*='strikethrough']") !== null;
        return fontSize >= 20 && !isStruck;
      });

    const proximitySeenKeys = new Set();
    for (const heading of headings) {
      const planName = applyTextTransform(heading, normalizeText(heading.textContent || ""));
      if (/\\bfree\\b/i.test(planName)) continue;
      let ancestor = heading.parentElement;
      let pairedPrice = null;
      while (ancestor && ancestor !== document.body) {
        for (const priceEl of priceEls) {
          if (ancestor.contains(priceEl)) {
            const raw = normalizeText(priceEl.textContent || "");
            pairedPrice = { raw };
            break;
          }
        }
        if (pairedPrice) break;
        ancestor = ancestor.parentElement;
      }
      if (pairedPrice) {
        const dedupeKey = planName + "|" + pairedPrice.raw;
        if (!proximitySeenKeys.has(dedupeKey)) {
          proximitySeenKeys.add(dedupeKey);
          const cardAncestor = ancestor || heading.parentElement;
          const cardText = normalizeText((cardAncestor && cardAncestor.innerText) || "");
          dedupedCards.push({ planName, text: cardText, prices: [pairedPrice] });
        }
      }
    }
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
  const payload = (await page.evaluate(RENDERED_STATE_EVALUATE_SCRIPT)) as {
    planCards: Array<{
      planName: string;
      text: string;
      prices: Array<{ raw: string }>;
    }>;
    text: string;
  };

  const planCards: RenderedPlanCard[] = payload.planCards.map((card) => ({
    planName: card.planName,
    text: card.text,
    prices: card.prices
      .map((price) => {
        const currencyMatch = price.raw.match(
          /\b(USD|EUR|GBP|CAD|AUD|JPY)\b|([€£$¥])/i
        );
        const amountMatch = price.raw.match(
          /(\d{1,4}(?:,\d{3})*(?:\.\d{1,2})?)/
        );
        const currencyToken = currencyMatch?.[1] ?? currencyMatch?.[2] ?? null;
        const amountToken = amountMatch?.[1] ?? null;

        if (!currencyToken || !amountToken) {
          return null;
        }

        const amount = Number.parseFloat(amountToken.replace(/,/g, ""));
        if (!Number.isFinite(amount) || amount <= 0) {
          return null;
        }

        const currency =
          currencyToken.length === 1
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

      const previousState = await captureCadenceControlState(page, candidate);
      await candidate
        .click({ timeout: 2_000, force: true })
        .catch((): undefined => undefined);
      const changed = await waitForCadenceUpdate(page, previousState, candidate);
      if (changed) {
        return true;
      }
    }
  }

  // Handle switch toggles with adjacent text labels (e.g., "Monthly [switch] Yearly").
  // Convention: unchecked = left label (Monthly), checked = right label (Yearly).
  const switches = page.locator('[role="switch"]');
  const switchCount = await switches.count().catch((): number => 0);

  for (let index = 0; index < switchCount; index += 1) {
    const sw = switches.nth(index);
    if (!(await sw.isVisible().catch((): boolean => false))) {
      continue;
    }

    const container = sw.locator("xpath=..");
    const containerText = await container.innerText().catch((): string => "");
    if (
      !/monthly/i.test(containerText) ||
      !/yearly|annual/i.test(containerText)
    ) {
      continue;
    }
    if (!label.test(containerText)) {
      continue;
    }

    const isChecked = (await sw.getAttribute("aria-checked")) === "true";
    const wantsMonthly = /monthly/i.test(label.source);
    const needsClick = wantsMonthly ? isChecked : !isChecked;

    if (needsClick) {
      const previousState = await captureCadenceControlState(page, sw);
      await sw
        .click({ timeout: 2_000, force: true })
        .catch((): undefined => undefined);
      const changed = await waitForCadenceUpdate(page, previousState, sw);
      if (!changed) {
        continue;
      }
    }

    return true;
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

  const { chromium } = await import("playwright-extra");
  const { default: stealth } = await import("puppeteer-extra-plugin-stealth");
  chromium.use(stealth());
  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-blink-features=AutomationControlled"],
  });

  try {
    const context = await browser.newContext({
      extraHTTPHeaders: {
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.8",
        "cache-control": "no-cache",
      },
    });
    const page = await context.newPage();

    await page.goto(navigationUrl, {
      waitUntil: "domcontentloaded",
      timeout: PLAYWRIGHT_EXTRACTION_TIMEOUT_MS,
    });
    await waitForPricingReady(page);

    // Wait for Cloudflare / bot challenge pages to resolve.
    // The stealth plugin passes the checks, but the JS challenge needs time to verify.
    const initialTitle = await page.title().catch((): string => "");
    if (
      /just a moment|checking your browser|verify you are human/i.test(
        initialTitle
      )
    ) {
      await page
        .waitForFunction(
          () =>
            !/just a moment|checking your browser|verify you are human/i.test(
              document.title
            ),
          {
            timeout: 15_000,
          }
        )
        .catch((): undefined => undefined);
      await waitForPricingReady(page);
    }

    // Dismiss common cookie consent dialogs that may overlay pricing content.
    await page
      .getByRole("button", {
        name: /^(accept|accept all|accept cookies|allow all|i agree|got it|ok)$/i,
      })
      .first()
      .click({ timeout: 2_000 })
      .catch((): undefined => undefined);

    const extractedStates: RenderedStatePayload[] = [];
    const toggleLabels = await collectCadenceToggleLabels(page);
    const clickedCadences: Array<"month" | "year"> = [];
    let rawEval: RenderedStatePayload | null = null;

    const clickedMonthly = await clickCadenceIfPresent(
      page,
      /\bmonthly\b/i
    ).catch((): boolean => false);
    if (clickedMonthly) {
      clickedCadences.push("month");
      extractedStates.push(await extractRenderedState(page, "month"));
    }

    const clickedYearly = await clickCadenceIfPresent(
      page,
      /\b(yearly|annually|annual)\b/i
    ).catch((): boolean => false);
    if (clickedYearly) {
      clickedCadences.push("year");
      extractedStates.push(await extractRenderedState(page, "year"));
    }

    if (extractedStates.length === 0 || clickedCadences.length < 2) {
      rawEval = await extractRenderedState(page, null);
      extractedStates.push(rawEval);
    }

    const rawPlanNames: string[] = [];
    const rawPriceMentions: Array<{
      amount: number;
      currency: string;
      period: PricePeriod;
    }> = [];
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
          rawPlanNames.push(card.planName);
        }

        const period = toPeriod(card.text, state.cadence);

        for (const price of card.prices) {
          rawPriceMentions.push({
            amount: price.amount,
            currency: price.currency,
            period,
          });
        }
      }
    }

    const extractedPlans = buildExtractedPlans(extractedStates);
    const extractedPlanNames =
      extractedPlans.length > 0
        ? extractedPlans.map((plan) => plan.name)
        : rawPlanNames;
    const extractedCadencePriceMentions = extractedPlans.flatMap((plan) => {
      const mentions: Array<{
        amount: number;
        currency: string;
        period: PricePeriod;
      }> = [];

      if (
        typeof plan.monthlyPrice === "number" &&
        Number.isFinite(plan.monthlyPrice) &&
        plan.currency
      ) {
        mentions.push({
          amount: plan.monthlyPrice,
          currency: plan.currency,
          period: "month",
        });
      }

      if (
        typeof plan.annualPrice === "number" &&
        Number.isFinite(plan.annualPrice) &&
        plan.currency
      ) {
        mentions.push({
          amount: plan.annualPrice,
          currency: plan.currency,
          period: "year",
        });
      }

      return mentions;
    });
    const extractedCadenceSet = new Set(
      extractedCadencePriceMentions.map((entry) => entry.period)
    );
    const priceMentions =
      extractedCadencePriceMentions.length > 0
        ? [
            ...extractedCadencePriceMentions,
            ...rawPriceMentions.filter((entry) => {
              if (entry.period !== "month" && entry.period !== "year") {
                return true;
              }

              return !extractedCadenceSet.has(entry.period);
            }),
          ]
        : rawPriceMentions;
    const enrichmentText = extractedStates
      .flatMap((state) => state.planCards.map((card) => card.text))
      .join("\n")
      .trim() || rawEval?.text || "";
    const extractionDebug: PricingExtractionDebug = {
      scopeStrategy: "playwright",
      selectedPlanTexts: extractedPlans.map((plan) => plan.name),
      toggleLabels,
      clickedCadences,
      failureReason:
        extractedPlans.length === 0 && priceMentions.length === 0
          ? "No rendered pricing cards qualified after DOM scoring."
          : null,
    };

    const payload = canonicalizePricingPayload({
      sourceUrl: normalizedSourceUrl,
      pageTitle: await page.title().catch((): null => null),
      pageDescription: await getPageDescription(page),
      planNames: extractedPlanNames,
      priceMentions,
      extractedPlans,
      customPricingHints,
      oneTimePricingHints,
      extractionDebug,
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
      isVerified:
        confidence >= 0.75 &&
        payload.planNames.length > 0 &&
        payload.priceMentions.length > 0,
      extractedCadences,
      enrichmentText,
    };
  } finally {
    await browser.close();
  }
};
