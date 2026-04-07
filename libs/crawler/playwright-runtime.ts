type RuntimeEnv = Record<string, string | undefined>;

const DEFAULT_LOCAL_ARGS = ["--disable-blink-features=AutomationControlled"];

let cachedExecutablePath: string | null = null;
let executablePathPromise: Promise<string> | null = null;

const trimOrNull = (value: string | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

const toBaseUrl = (value: string | undefined): string | null => {
  const trimmed = trimOrNull(value);
  if (!trimmed) {
    return null;
  }

  try {
    const parsed = new URL(
      /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
    );
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
};

const appendVercelProtectionBypass = (
  url: string,
  env: RuntimeEnv
): string => {
  const bypassSecret = trimOrNull(env.VERCEL_AUTOMATION_BYPASS_SECRET);
  if (!bypassSecret) {
    return url;
  }

  try {
    const parsed = new URL(url);
    parsed.searchParams.set("x-vercel-protection-bypass", bypassSecret);
    return parsed.toString();
  } catch {
    return url;
  }
};

const mergeLaunchArgs = (...argLists: ReadonlyArray<ReadonlyArray<string>>) => {
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const args of argLists) {
    for (const arg of args) {
      if (!seen.has(arg)) {
        seen.add(arg);
        merged.push(arg);
      }
    }
  }

  return merged;
};

export const shouldUseServerlessChromium = (
  env: RuntimeEnv = process.env
): boolean => {
  return Boolean(
    trimOrNull(env.PLAYWRIGHT_CHROMIUM_TAR_URL) ||
      trimOrNull(env.VERCEL) ||
      trimOrNull(env.VERCEL_ENV)
  );
};

export const getChromiumPackUrl = (
  env: RuntimeEnv = process.env
): string | null => {
  const explicitUrl = trimOrNull(env.PLAYWRIGHT_CHROMIUM_TAR_URL);
  if (explicitUrl) {
    return explicitUrl;
  }

  if (!shouldUseServerlessChromium(env)) {
    return null;
  }

  const isProductionDeploy = trimOrNull(env.VERCEL_ENV) === "production";

  const baseUrl = isProductionDeploy
    ? toBaseUrl(env.VERCEL_PROJECT_PRODUCTION_URL) ??
      toBaseUrl(env.SITE_URL) ??
      toBaseUrl(env.NEXTAUTH_URL) ??
      toBaseUrl(env.VERCEL_URL) ??
      toBaseUrl(env.VERCEL_BRANCH_URL)
    : toBaseUrl(env.VERCEL_URL) ??
      toBaseUrl(env.VERCEL_BRANCH_URL) ??
      toBaseUrl(env.VERCEL_PROJECT_PRODUCTION_URL) ??
      toBaseUrl(env.SITE_URL) ??
      toBaseUrl(env.NEXTAUTH_URL);

  return baseUrl
    ? appendVercelProtectionBypass(`${baseUrl}/chromium-pack.tar`, env)
    : null;
};

const getServerlessExecutablePath = async (
  env: RuntimeEnv = process.env
): Promise<string> => {
  if (cachedExecutablePath) {
    return cachedExecutablePath;
  }

  const packUrl = getChromiumPackUrl(env);
  if (!packUrl) {
    throw new Error(
      "Missing Chromium pack URL for Vercel runtime. Set PLAYWRIGHT_CHROMIUM_TAR_URL or configure SITE_URL/VERCEL_URL."
    );
  }

  if (!executablePathPromise) {
    executablePathPromise = import("@sparticuz/chromium-min")
      .then((module) => module.default.executablePath(packUrl))
      .then((resolvedPath) => {
        cachedExecutablePath = resolvedPath;
        return resolvedPath;
      })
      .catch((error) => {
        executablePathPromise = null;
        throw error;
      });
  }

  return executablePathPromise;
};

const createPlaywrightChromium = async (
  env: RuntimeEnv = process.env
): Promise<{
  chromium: import("playwright-extra").PlaywrightExtraClass &
    import("playwright-core").BrowserType<import("playwright-core").Browser>;
  launchOptions: Parameters<
    import("playwright-core").BrowserType<
      import("playwright-core").Browser
    >["launch"]
  >[0];
}> => {
  const { addExtra } = await import("playwright-extra");
  const { default: stealth } = await import("puppeteer-extra-plugin-stealth");

  if (shouldUseServerlessChromium(env)) {
    const [{ chromium: playwrightChromium }, chromiumModule] = await Promise.all(
      [import("playwright-core"), import("@sparticuz/chromium-min")]
    );
    const chromium = addExtra(playwrightChromium);
    chromium.use(stealth());

    return {
      chromium,
      launchOptions: {
        headless: true,
        executablePath: await getServerlessExecutablePath(env),
        args: mergeLaunchArgs(chromiumModule.default.args, DEFAULT_LOCAL_ARGS),
      },
    };
  }

  const { chromium: playwrightChromium } = await import("playwright");
  const chromium = addExtra(playwrightChromium);
  chromium.use(stealth());

  return {
    chromium,
    launchOptions: {
      headless: true,
      args: DEFAULT_LOCAL_ARGS,
    },
  };
};

export const launchPlaywrightBrowser = async (
  env: RuntimeEnv = process.env
): Promise<import("playwright-core").Browser> => {
  const { chromium, launchOptions } = await createPlaywrightChromium(env);
  return chromium.launch(launchOptions);
};
