import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  buildIabBreakoutHtml,
  isIabRequest,
  isKnownCrawler,
  isUnknownBot,
  USER_AGENT_VARY,
} from "../_shared/share-routing";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const requestedSlug = typeof req.query.slug === "string"
      ? req.query.slug
      : Array.isArray(req.query.slug) ? req.query.slug[0] : null;

    if (!requestedSlug) return res.status(400).send("Mangler produsentadresse");

    const cardMatch = requestedSlug.match(/^(.+)--kort--([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i);
    const slug = cardMatch?.[1] ?? requestedSlug;
    const cardId = cardMatch?.[2];
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return res.status(500).send("Delingstjenesten er ikke konfigurert");
    }

    const headers = {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      Accept: "application/json",
    };
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);
    const filter = `${isUUID ? "id" : "slug"}=eq.${encodeURIComponent(slug)}`;
    const producerResponse = await fetch(
      `${supabaseUrl}/rest/v1/producers?select=id,farm_name,slug,approval_status,is_visible&${filter}&limit=1`,
      { headers },
    );
    if (!producerResponse.ok) throw new Error(`Produsentoppslaget feilet (${producerResponse.status})`);
    const producers = await producerResponse.json();
    const producer = Array.isArray(producers) ? producers[0] : null;
    if (!producer) return res.status(404).send("Fant ikke produsenten");

    let card: { og_image_url: string; farm_name: string; description: string } | null = null;
    if (cardId) {
      if (producer.approval_status !== "approved" || !producer.is_visible) {
        return res.status(404).send("Fant ikke delingskortet");
      }
      const cardResponse = await fetch(
        `${supabaseUrl}/rest/v1/producer_share_cards?select=og_image_url,farm_name,description&id=eq.${encodeURIComponent(cardId)}&producer_id=eq.${encodeURIComponent(producer.id)}&limit=1`,
        { headers },
      );
      if (!cardResponse.ok) throw new Error(`Kortoppslaget feilet (${cardResponse.status})`);
      const cards = await cardResponse.json();
      card = Array.isArray(cards) ? cards[0] ?? null : null;
      if (!card) return res.status(404).send("Fant ikke delingskortet");
    }

    const ua = (req.headers["x-forwarded-user-agent"] as string)
      || (req.headers["user-agent"] as string) || "";
    const shouldServeMetadata = req.query.og === "1" || isKnownCrawler(ua) || isUnknownBot(ua);
    const mode = ((req.headers["sec-fetch-mode"] as string) || "").toLowerCase();
    const dest = ((req.headers["sec-fetch-dest"] as string) || "").toLowerCase();
    const isHuman = /(mozilla\/|safari|chrome|crios|fxios|edg|firefox)/i.test(ua);
    const shouldRedirect = !shouldServeMetadata && (mode === "navigate" || dest === "document" || isHuman);

    const producerSlug = producer.slug || producer.id;
    const canonicalUrl = `https://localfood.no/producer/${encodeURIComponent(producerSlug)}`;
    const humanTargetUrl = `${canonicalUrl}?vis=produkter`;
    const sharePageUrl = cardId
      ? `https://del.localfood.no/producer/${encodeURIComponent(producerSlug)}--kort--${cardId}`
      : canonicalUrl;

    res.setHeader("Vary", USER_AGENT_VARY);
    if (shouldRedirect) {
      res.setHeader("Cache-Control", "no-store");
      if (isIabRequest(ua)) {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return res.status(200).send(buildIabBreakoutHtml(humanTargetUrl, producer.farm_name || "Lokal produsent"));
      }
      return res.redirect(302, humanTargetUrl);
    }

    const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const version = typeof req.query.v === "string" ? req.query.v : Date.now().toString();
    const image = escapeHtml(card?.og_image_url || `${supabaseUrl}/storage/v1/object/public/producer-image-bank/og/producer/${producerSlug}.png?v=${encodeURIComponent(version)}`);
    const farmName = escapeHtml(card?.farm_name || producer.farm_name || "Lokal produsent");
    const description = escapeHtml(card?.description || "Støtt din lokale produsent – bestill direkte fra gården på LocalFood.no.");

    const html = `<!DOCTYPE html>
<html lang="no">
<head>
<meta charset="UTF-8" />
<title>LocalFood.no | ${farmName}</title>
<meta name="description" content="${description}" />
<meta property="og:title" content="LocalFood.no | ${farmName}" />
<meta property="og:description" content="${description}" />
<meta property="og:image" content="${image}" />
<meta property="og:image:url" content="${image}" />
<meta property="og:image:secure_url" content="${image}" />
<meta property="og:image:type" content="image/png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:url" content="${escapeHtml(sharePageUrl)}" />
<meta property="og:type" content="profile" />
<meta property="og:site_name" content="LocalFood.no" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="LocalFood.no | ${farmName}" />
<meta name="twitter:description" content="${description}" />
<meta name="twitter:image" content="${image}" />
<link rel="canonical" href="${escapeHtml(sharePageUrl)}" />
</head>
<body>
<p>Se produsenten: <a href="${escapeHtml(humanTargetUrl)}">${farmName} på LocalFood</a>.</p>
<script>
if (typeof window !== "undefined" && window.location) {
  setTimeout(function() { window.location.replace(${JSON.stringify(humanTargetUrl)}); }, 800);
}
</script>
</body>
</html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=60, s-maxage=60");
    return res.status(200).send(html);
  } catch (error) {
    console.error("Kunne ikke hente produsentens delingskort:", error);
    return res.status(500).json({ error: "Kunne ikke hente delingskortet" });
  }
}
