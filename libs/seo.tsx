import type { Metadata } from "next";
import config from "@/config";

const DEFAULT_KEYWORDS = [
  "competitor pricing intelligence",
  "competitor price tracker",
  "pricing intelligence software",
  "pricing change monitoring",
  "competitor analysis SaaS",
  "SaaS pricing research",
  "price change alerts",
  "pricing strategy insights",
  "market pricing trends",
  "price monitoring tool",
];

const getDefaultTitle = () =>
  `${config.appName} | Competitor Pricing Intelligence`;

const stripTrailingSlash = (url: string) => url.replace(/\/+$/, "");

const getSiteUrl = () => {
  if (process.env.NODE_ENV === "development") {
    return "http://localhost:3000";
  }

  if (process.env.SITE_URL) {
    return stripTrailingSlash(process.env.SITE_URL);
  }

  return `https://${config.domainName}`;
};

const siteUrl = getSiteUrl();
const isNoIndexEnabled = process.env.NO_INDEX === "true";

export const getSEOTags = ({
  title,
  description,
  keywords,
  openGraph,
  canonicalUrlRelative,
  extraTags,
}: Metadata & {
  canonicalUrlRelative?: string;
  extraTags?: Record<string, unknown>;
} = {}) => {
  const resolvedTitle = title || getDefaultTitle();
  const resolvedDescription = description || config.appDescription;
  const resolvedKeywords = keywords || DEFAULT_KEYWORDS;
  const resolvedOpenGraphTitle = openGraph?.title || resolvedTitle;
  const resolvedOpenGraphDescription =
    openGraph?.description || resolvedDescription;

  return {
    title: resolvedTitle,
    description: resolvedDescription,
    keywords: resolvedKeywords,
    applicationName: config.appName,
    metadataBase: new URL(`${siteUrl}/`),

    openGraph: {
      title: resolvedOpenGraphTitle,
      description: resolvedOpenGraphDescription,
      url: openGraph?.url || `${siteUrl}/`,
      siteName: config.appName,
      locale: "en_US",
      type: "website",
    },

    twitter: {
      title: resolvedOpenGraphTitle,
      description: resolvedOpenGraphDescription,
      card: "summary_large_image",
    },

    ...(canonicalUrlRelative && {
      alternates: { canonical: canonicalUrlRelative },
    }),

    ...(isNoIndexEnabled && {
      robots: {
        index: false,
        follow: false,
        googleBot: {
          index: false,
          follow: false,
        },
      },
    }),

    ...extraTags,
  };
};

export const renderSchemaTags = () => {
  const featureList = Array.from(
    new Set(
      config.stripe.plans.flatMap((plan) =>
        plan.features.map((feature) => feature.name)
      )
    )
  );

  const offers = config.stripe.plans.map((plan) => ({
    "@type": "Offer",
    name: plan.name,
    description: plan.description,
    price: plan.price,
    priceCurrency: "USD",
    availability: "https://schema.org/InStock",
    url: `${siteUrl}/#pricing`,
  }));

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: config.appName,
          description: config.appDescription,
          image: `${siteUrl}/icon.png`,
          url: `${siteUrl}/`,
          applicationCategory: "BusinessApplication",
          operatingSystem: "Web",
          featureList,
          provider: {
            "@type": "Organization",
            name: config.appName,
            url: `${siteUrl}/`,
          },
          offers,
        }),
      }}
    ></script>
  );
};
