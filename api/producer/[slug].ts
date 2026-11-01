import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  buildIabBreakoutHtml,
  isIabRequest,
  isKnownCrawler,
  isUnknownBot,
  USER_AGENT_VARY,
} from "../_shared/share-routing";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Vary", USER_AGENT_VARY);
  res.setHeader("Cache-Control", "no-store");

  try {
    const slug = typeof req.query.slug === "string"
      ? req.query.slug
      : Array.isArray(req.query.slug) ? req.query.slug[0] : null;

    if (!slug) {
      return res.status(400).send("Mangler produsentadresse");
    }

    const baseUrl = process.env.SUPABASE_URL;
    if (!baseUrl) {
      return res.status(500).send("Delingstjenesten er ikke konfigurert");
    }

    const ua = (req.headers["x-forwarded-user-agent"] as string)
      || (req.headers["user-agent"] as string) || "";
    const metadata = req.query.og === "1"
      || isKnownCrawler(ua) || isUnknownBot(ua);
    const mode = ((req.headers["sec-fetch-mode"] as string) || "").toLowerCase();
    const dest = ((req.headers["sec-fetch-dest"] as string) || "").toLowerCase();
    const isHuman = /(mozilla\/|safari|chrome|crios|fxios|edg|firefox)/i.test(ua);
    const shouldRedirect = !metadata
      && (mode === "navigate" || dest === "document" || isHuman);

    // Den eksisterende tjenesten kontrollerer produsenten og kortet.
    const endpoint = new URL(`${baseUrl}/functions/v1/og-producer`);
    endpoint.searchParams.set("slug", slug);
    endpoint.searchParams.set("og", "1");
    if (typeof req.query.v === "string") {
      endpoint.searchParams.set("v", req.query.v);
    }

    const response = await fetch(endpoint, {
      headers: { "User-Agent": ua },
      redirect: "manual",
    });
    const html = await response.text();

    if (!response.ok) {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      return res.status(response.status).send("Kunne ikke hente delingskortet");
    }

    // Finn kundelenken som korttjenesten har laget.
    const targetMatch = html.match(/<a\s+href="(https:\/\/localfood\.no\/producer\/[^"<>]+)"/i);
    const target = targetMatch?.[1]?.replace(/&amp;/g, "&");

    if (shouldRedirect) {
      if (!target) {
        return res.status(502).send("Kunne ikke finne produsentens varer");
      }
      const targetUrl = new URL(target);
      if (targetUrl.origin !== "https://localfood.no"
        || !targetUrl.pathname.startsWith("/producer/")) {
        return res.status(502).send("Ugyldig produsentadresse");
      }
      if (isIabRequest(ua)) {
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return res.status(200).send(
          buildIabBreakoutHtml(targetUrl.href, "Se produsentens varer"),
        );
      }
      return res.redirect(302, targetUrl.href);
    }

    // Vercel må sende dette som en nettside, ikke som ren tekst.
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(html);
  } catch (error) {
    console.error("Kunne ikke hente produsentens delingskort:", error);
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.status(500).send("Kunne ikke hente delingskortet");
  }
}
