import type { VercelRequest, VercelResponse } from "@vercel/node";

const KNOWN_CRAWLER_REGEX =
  /facebookexternalhit|facebot|meta-externalagent|twitterbot|linkedinbot|whatsapp|telegrambot|slackbot|discordbot|pinterest|googlebot|bingbot|applebot|skypeuripreview|snapchat|tiktok/i;

const SUSPICIOUS_BOT_REGEX =
  /bot|crawler|spider|preview|fetch|scraper|curl|wget|headless|phantom|puppeteer|playwright|lighthouse|pagespeed|embed|unfurl|link\s?preview|og-?fetcher|meta-?inspector|site-?checker|http\.?client|java\/|externalagent/i;

function isKnownCrawler(ua: string): boolean {
  return KNOWN_CRAWLER_REGEX.test(ua);
}

function isUnknownBot(ua: string): boolean {
  if (!ua || isKnownCrawler(ua)) return false;
  return SUSPICIOUS_BOT_REGEX.test(ua);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const startMs = Date.now();

  try {
    const slug =
      typeof req.query.slug === "string"
        ? req.query.slug
        : Array.isArray(req.query.slug)
          ? req.query.slug[0]
          : null;

    if (!slug) {
      return res.status(400).send("Missing slug");
    }

    const supabaseUrl = process.env.SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;

    const isUUID =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);

    const filterParam = isUUID ? `id=eq.${slug}` : `slug=eq.${slug}`;

    const dbResponse = await fetch(
      `${supabaseUrl}/rest/v1/producers?select=id,farm_name,slug&${filterParam}&limit=1`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          Accept: "application/json",
        },
      },
    );

    const producers = await dbResponse.json();
    const producer = Array.isArray(producers) ? producers[0] : null;

    if (!producer) {
      return res.status(404).send("Not found");
    }

    const ua = (req.headers["user-agent"] as string) || "";
    const effectiveUa = (req.headers["x-forwarded-user-agent"] as string) || ua;

    const isCrawler = isKnownCrawler(effectiveUa);
    const isSuspiciousBot = isUnknownBot(effectiveUa);
    const shouldServeMetadata = isCrawler || isSuspiciousBot;

    const secFetchMode = ((req.headers["sec-fetch-mode"] as string) || "").toLowerCase();
    const secFetchDest = ((req.headers["sec-fetch-dest"] as string) || "").toLowerCase();
    const isLikelyNavigation = secFetchMode === "navigate" || secFetchDest === "document";
    const isLikelyHuman = /(mozilla\/|safari|chrome|crios|fxios|edg|firefox)/i.test(effectiveUa);
    const shouldRedirect = !shouldServeMetadata && (isLikelyNavigation || isLikelyHuman);

    const producerSlug = producer.slug || producer.id;
    const canonicalUrl = `https://localfood.no/producer/${producerSlug}`;

    console.log(JSON.stringify({
      event: "og-producer",
      slug: producerSlug,
      ua: effectiveUa.slice(0, 200),
      isCrawler,
      isSuspiciousBot,
      shouldRedirect,
      elapsedMs: Date.now() - startMs,
    }));

    if (shouldRedirect) {
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("Vary", "User-Agent, X-Forwarded-User-Agent, Sec-Fetch-Mode, Sec-Fetch-Dest");
      return res.redirect(302, canonicalUrl);
    }

    const versionParam = (req.query.v as string) || Date.now().toString();
    const sharePageUrl = `https://del.localfood.no/producer/${producerSlug}?v=${encodeURIComponent(versionParam)}`;
    const ogImageUrl = `${supabaseUrl}/storage/v1/object/public/producer-image-bank/og/producer/${producerSlug}.png`;

    const farmName = (producer.farm_name || "Lokal produsent")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");
    const description = "Støtt din lokale produsent – bestill direkte fra gården på LocalFood.no.";

    const html = `<!DOCTYPE html>
<html lang="no">
<head>
<meta charset="UTF-8" />
<title>LocalFood.no | ${farmName}</title>
<meta name="description" content="${description}" />
<meta property="og:title" content="LocalFood.no | ${farmName}" />
<meta property="og:description" content="${description}" />
<meta property="og:image" content="${ogImageUrl}" />
<meta property="og:image:url" content="${ogImageUrl}" />
<meta property="og:image:secure_url" content="${ogImageUrl}" />
<meta property="og:image:type" content="image/png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:url" content="${sharePageUrl}" />
<meta property="og:type" content="profile" />
<meta property="og:site_name" content="LocalFood.no" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="LocalFood.no | ${farmName}" />
<meta name="twitter:description" content="${description}" />
<meta name="twitter:image" content="${ogImageUrl}" />
<link rel="canonical" href="${sharePageUrl}" />
</head>
<body>
<p>Se produsenten: <a href="${canonicalUrl}">${farmName} på LocalFood</a>.</p>
<script>
if (typeof window !== "undefined" && window.location) {
  setTimeout(function() { window.location.replace("${canonicalUrl}"); }, 800);
}
</script>
</body>
</html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=60, s-maxage=60");
    res.setHeader("Vary", "User-Agent, X-Forwarded-User-Agent, Sec-Fetch-Mode, Sec-Fetch-Dest");

    return res.status(200).send(html);
  } catch (error: any) {
    console.error("og-producer error:", error);
    return res.status(500).json({ error: error.message });
  }
}
