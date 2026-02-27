import {
  CRAWL_REQUEST_HEADERS,
  FETCH_TIMEOUT_MS,
  MAX_HTML_LENGTH,
  PRICING_URL_DISCOVERY_MAX_CANDIDATES,
  PRICING_URL_DISCOVERY_MIN_CONFIDENCE,
  PRICING_URL_DISCOVERY_MIN_PRIMARY_GAP,
  PRICING_URL_DISCOVERY_PRIMARY_CONFIDENCE_THRESHOLD,
} from "@/libs/crawler/constants";
import { normalizeUrl, stripHtmlToText } from "@/libs/crawler/normalize";
import type { IPricingUrlCandidate } from "@/models/Company";

interface PricingUrlDiscoveryInput {
  homepageUrl: string;
  allowedDomain?: string;
  maxCandidates?: number;
}

interface ParsedAnchor {
  href: string;
  text: string;
}

export interface PricingUrlDiscoveryResult {
  homepageUrl: string;
  candidates: IPricingUrlCandidate[];
  recommendedPrimaryUrl: string | null;
}

const PRICING_PATH_PATTERNS: Array<{ pattern: RegExp; weight: number }> = [
  { pattern: /^\/pricing(?:\/|$)/, weight: 0.85 },
  { pattern: /^\/plans?(?:\/|$)/, weight: 0.78 },
  { pattern: /(?:^|\/)(pricing|plans?)(?:\/|$)/, weight: 0.52 },
  { pattern: /(?:^|\/)(subscriptions?|billing|cost|prices?)(?:\/|$)/, weight: 0.35 },
];

const PRICING_TEXT_PATTERNS: Array<{ pattern: RegExp; weight: number }> = [
  { pattern: /\bpricing\b/, weight: 0.42 },
  { pattern: /\bplans?\b/, weight: 0.38 },
  { pattern: /\bcompare plans?\b/, weight: 0.26 },
  { pattern: /\bfree trial\b/, weight: 0.22 },
  { pattern: /\bsubscriptions?\b/, weight: 0.2 },
  { pattern: /\bget started\b/, weight: 0.14 },
];

const NEGATIVE_PATH_PATTERNS: Array<{ pattern: RegExp; weight: number }> = [
  { pattern: /(?:^|\/)(blog|docs?|documentation|help|support)(?:\/|$)/, weight: 0.35 },
  { pattern: /(?:^|\/)(about|contact|careers?|jobs?|team)(?:\/|$)/, weight: 0.25 },
  { pattern: /(?:^|\/)(privacy|terms|legal|status)(?:\/|$)/, weight: 0.45 },
  { pattern: /(?:^|\/)(login|signin|sign-in|signup|sign-up|register|auth)(?:\/|$)/, weight: 0.35 },
  { pattern: /\.(?:png|jpe?g|svg|gif|webp|pdf|zip|xml)$/i, weight: 1 },
];

const NEGATIVE_TEXT_PATTERNS: Array<{ pattern: RegExp; weight: number }> = [
  { pattern: /\bblog\b/, weight: 0.3 },
  { pattern: /\bdocs?\b/, weight: 0.3 },
  { pattern: /\bhelp\b/, weight: 0.25 },
  { pattern: /\blogin\b|\bsign in\b|\bsign up\b/, weight: 0.25 },
];

const normalizeHostname = (hostname: string): string => {
  return hostname.toLowerCase().replace(/^www\./, "");
};

const normalizeDomain = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(trimmed.includes("://") ? trimmed : `https://${trimmed}`);
    return normalizeHostname(parsed.hostname);
  } catch {
    const candidate = trimmed.split("/")[0]?.split(":")[0];
    if (!candidate) {
      return null;
    }

    return normalizeHostname(candidate);
  }
};

const clampConfidence = (value: number): number => {
  const bounded = Math.max(0, Math.min(1, value));
  return Number(bounded.toFixed(2));
};

const isSameDomainOrSubdomain = (hostname: string, domain: string): boolean => {
  return hostname === domain || hostname.endsWith(`.${domain}`);
};

const scorePatterns = (value: string, patterns: Array<{ pattern: RegExp; weight: number }>): number => {
  let score = 0;

  for (const { pattern, weight } of patterns) {
    if (pattern.test(value)) {
      score += weight;
    }
  }

  return score;
};

const scoreCandidate = (url: URL, anchorText: string): number => {
  const normalizedPath = url.pathname.toLowerCase();
  const normalizedText = anchorText.toLowerCase();

  const positivePathScore = scorePatterns(normalizedPath, PRICING_PATH_PATTERNS);
  const positiveTextScore = scorePatterns(normalizedText, PRICING_TEXT_PATTERNS);
  const negativePathScore = scorePatterns(normalizedPath, NEGATIVE_PATH_PATTERNS);
  const negativeTextScore = scorePatterns(normalizedText, NEGATIVE_TEXT_PATTERNS);

  let score = 0.04 + positivePathScore + positiveTextScore;

  if (positivePathScore > 0.5 && positiveTextScore > 0.2) {
    score += 0.12;
  }

  if (normalizedPath === "/" && positiveTextScore < 0.2) {
    score -= 0.12;
  }

  score -= negativePathScore + negativeTextScore;
  return clampConfidence(score);
};

const parseAnchors = (html: string): ParsedAnchor[] => {
  const anchors: ParsedAnchor[] = [];
  const anchorPattern =
    /<a\b[^>]*href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>`]+))[^>]*>([\s\S]*?)<\/a>/gi;

  let match = anchorPattern.exec(html);
  while (match) {
    const href = match[1] ?? match[2] ?? match[3] ?? "";
    const text = stripHtmlToText(match[4] ?? "");

    if (href) {
      anchors.push({
        href: href.trim(),
        text,
      });
    }

    match = anchorPattern.exec(html);
  }

  return anchors;
};

const shouldIgnoreHref = (href: string): boolean => {
  if (!href) {
    return true;
  }

  const lowered = href.trim().toLowerCase();
  return (
    lowered.startsWith("#") ||
    lowered.startsWith("mailto:") ||
    lowered.startsWith("tel:") ||
    lowered.startsWith("javascript:")
  );
};

const fetchHomepageHtml = async (url: string): Promise<string | null> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: CRAWL_REQUEST_HEADERS,
      redirect: "follow",
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("text/html")) {
      return null;
    }

    return (await response.text()).slice(0, MAX_HTML_LENGTH);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
};

const sortCandidates = (candidates: IPricingUrlCandidate[]): IPricingUrlCandidate[] => {
  return [...candidates].sort((left, right) => {
    if (left.confidence !== right.confidence) {
      return right.confidence - left.confidence;
    }

    return left.url.localeCompare(right.url);
  });
};

const pickRecommendedPrimaryUrl = (candidates: IPricingUrlCandidate[]): string | null => {
  const best = candidates[0];
  if (!best || best.confidence < PRICING_URL_DISCOVERY_PRIMARY_CONFIDENCE_THRESHOLD) {
    return null;
  }

  const secondBest = candidates[1];
  if (secondBest && best.confidence - secondBest.confidence < PRICING_URL_DISCOVERY_MIN_PRIMARY_GAP) {
    return null;
  }

  return best.url;
};

export const mergePricingUrlCandidates = (
  ...candidateLists: ReadonlyArray<ReadonlyArray<IPricingUrlCandidate>>
): IPricingUrlCandidate[] => {
  const byUrl = new Map<string, IPricingUrlCandidate>();

  for (const candidates of candidateLists) {
    for (const candidate of candidates) {
      const normalizedCandidateUrl = normalizeUrl(candidate.url);
      if (!normalizedCandidateUrl) {
        continue;
      }

      const confidence = clampConfidence(candidate.confidence);
      const existing = byUrl.get(normalizedCandidateUrl);

      if (!existing) {
        byUrl.set(normalizedCandidateUrl, {
          url: normalizedCandidateUrl,
          confidence,
          selectedByUser: candidate.selectedByUser,
        });
        continue;
      }

      existing.confidence = Math.max(existing.confidence, confidence);
      existing.selectedByUser = existing.selectedByUser || candidate.selectedByUser;
    }
  }

  return sortCandidates([...byUrl.values()]);
};

export const discoverPricingUrlsFromHomepage = async (
  input: PricingUrlDiscoveryInput
): Promise<PricingUrlDiscoveryResult> => {
  const normalizedHomepageUrl = normalizeUrl(input.homepageUrl);
  if (!normalizedHomepageUrl) {
    return {
      homepageUrl: input.homepageUrl,
      candidates: [],
      recommendedPrimaryUrl: null,
    };
  }

  const homepageParsed = new URL(normalizedHomepageUrl);
  const allowedDomain =
    normalizeDomain(input.allowedDomain ?? "") ?? normalizeHostname(homepageParsed.hostname);

  const html = await fetchHomepageHtml(normalizedHomepageUrl);
  if (!html) {
    return {
      homepageUrl: normalizedHomepageUrl,
      candidates: [],
      recommendedPrimaryUrl: null,
    };
  }

  const maxCandidates = Math.max(1, input.maxCandidates ?? PRICING_URL_DISCOVERY_MAX_CANDIDATES);
  const candidateMap = new Map<string, IPricingUrlCandidate>();
  const anchors = parseAnchors(html);

  for (const anchor of anchors) {
    if (shouldIgnoreHref(anchor.href)) {
      continue;
    }

    let resolvedUrl: URL;
    try {
      resolvedUrl = new URL(anchor.href, normalizedHomepageUrl);
    } catch {
      continue;
    }

    const normalizedCandidateUrl = normalizeUrl(resolvedUrl.toString());
    if (!normalizedCandidateUrl) {
      continue;
    }

    const candidateUrl = new URL(normalizedCandidateUrl);
    const candidateHostname = normalizeHostname(candidateUrl.hostname);
    if (!isSameDomainOrSubdomain(candidateHostname, allowedDomain)) {
      continue;
    }

    const confidence = scoreCandidate(candidateUrl, anchor.text);
    if (confidence < PRICING_URL_DISCOVERY_MIN_CONFIDENCE) {
      continue;
    }

    const existing = candidateMap.get(normalizedCandidateUrl);
    if (!existing || confidence > existing.confidence) {
      candidateMap.set(normalizedCandidateUrl, {
        url: normalizedCandidateUrl,
        confidence,
        selectedByUser: false,
      });
    }
  }

  const candidates = sortCandidates([...candidateMap.values()]).slice(0, maxCandidates);
  return {
    homepageUrl: normalizedHomepageUrl,
    candidates,
    recommendedPrimaryUrl: pickRecommendedPrimaryUrl(candidates),
  };
};
