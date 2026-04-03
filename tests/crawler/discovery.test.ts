import assert from "node:assert/strict";
import test from "node:test";

import { discoverPricingUrlsFromHomepage } from "@/libs/crawler/discovery";

const htmlResponse = (html: string): Response => {
  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
  });
};

test(
  "pricing discovery probes candidate pages before recommending a primary pricing URL",
  async (t) => {
    const originalFetch = global.fetch;

    const homepageHtml = `
      <html>
        <body>
          <a href="/pricing">Pricing</a>
          <a href="/plans/enterprise">Enterprise plans</a>
        </body>
      </html>
    `;

    const pricingHtml = `
      <html>
        <body>
          <section class="pricing">
            <article><h3>Starter</h3><div>$12</div><span>per month</span></article>
            <article><h3>Pro</h3><div>$29</div><span>per month</span></article>
          </section>
        </body>
      </html>
    `;

    const enterpriseHtml = `
      <html>
        <body>
          <section>
            <h1>Enterprise</h1>
            <p>Contact sales for custom pricing.</p>
          </section>
        </body>
      </html>
    `;

    global.fetch = async (input) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url === "https://acme.com/") {
        return htmlResponse(homepageHtml);
      }

      if (url === "https://acme.com/pricing") {
        return htmlResponse(pricingHtml);
      }

      if (url === "https://acme.com/plans/enterprise") {
        return htmlResponse(enterpriseHtml);
      }

      return new Response("Not found", { status: 404 });
    };

    t.after(() => {
      global.fetch = originalFetch;
    });

    const result = await discoverPricingUrlsFromHomepage({
      homepageUrl: "https://acme.com",
      allowedDomain: "acme.com",
    });

    assert.equal(result.recommendedPrimaryUrl, "https://acme.com/pricing");
  }
);

test(
  "pricing discovery finds extension-based pricing pages and probes a single candidate",
  async (t) => {
    const originalFetch = global.fetch;

    const homepageHtml = `
      <html>
        <body>
          <a href="/pricing.html">Pricing</a>
        </body>
      </html>
    `;

    const pricingHtml = `
      <html>
        <body>
          <section class="pricing">
            <article><h3>Pro</h3><div>$29.99</div><span>per month</span></article>
            <article><h3>Team</h3><div>$300</div><span>per year</span></article>
          </section>
        </body>
      </html>
    `;

    global.fetch = async (input) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url === "https://acme.com/") {
        return htmlResponse(homepageHtml);
      }

      if (url === "https://acme.com/pricing.html") {
        return htmlResponse(pricingHtml);
      }

      return new Response("Not found", { status: 404 });
    };

    t.after(() => {
      global.fetch = originalFetch;
    });

    const result = await discoverPricingUrlsFromHomepage({
      homepageUrl: "https://acme.com",
      allowedDomain: "acme.com",
    });

    assert.deepEqual(result.candidates.map((candidate) => candidate.url), [
      "https://acme.com/pricing.html",
    ]);
    assert.equal(
      result.recommendedPrimaryUrl,
      "https://acme.com/pricing.html"
    );
  }
);
