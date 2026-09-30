const KNOWN_CRAWLER_REGEX =
  /facebookexternalhit|facebot|meta-externalagent|twitterbot|linkedinbot|whatsapp|telegrambot|slackbot|discordbot|pinterest|googlebot|bingbot|applebot|skypeuripreview|snapchat|tiktok/i;

const IAB_REGEX = /FBAN|FBAV|FB_IAB|Instagram|FBIOS|FBSS/i;

const SUSPICIOUS_BOT_REGEX =
  /bot|crawler|spider|preview|fetch|scraper|curl|wget|headless|phantom|puppeteer|playwright|lighthouse|pagespeed|embed|unfurl|link\s?preview|og-?fetcher|meta-?inspector|site-?checker|http\.?client|java\/|externalagent/i;

export const USER_AGENT_VARY = "User-Agent, X-Forwarded-User-Agent, Sec-Fetch-Mode, Sec-Fetch-Dest";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function toAndroidIntentUrl(url: string): string {
  const withoutProtocol = url.replace(/^https?:\/\//, "");
  return `intent://${withoutProtocol}#Intent;scheme=https;action=android.intent.action.VIEW;end`;
}

export function isKnownCrawler(ua: string): boolean {
  return KNOWN_CRAWLER_REGEX.test(ua);
}

export function isUnknownBot(ua: string): boolean {
  if (!ua || isKnownCrawler(ua)) {
    return false;
  }

  return SUSPICIOUS_BOT_REGEX.test(ua);
}

export function isIabRequest(ua: string): boolean {
  return IAB_REGEX.test(ua);
}

export function buildIabBreakoutHtml(targetUrl: string, title: string): string {
  const safeTargetUrl = escapeHtml(targetUrl);
  const safeTitle = escapeHtml(title);
  const targetUrlJson = JSON.stringify(targetUrl);
  const androidUrlJson = JSON.stringify(toAndroidIntentUrl(targetUrl));

  return [
    "<!DOCTYPE html>",
    '<html lang="no">',
    "<head>",
    '<meta charset="UTF-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    `<title>${safeTitle} – LocalFood.no</title>`,
    "<style>",
    '* { margin: 0; padding: 0; box-sizing: border-box; }',
    'body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; justify-content: center; min-height: 100vh; background: #f8faf5; color: #1a2e05; padding: 16px 20px 32px; }',
    '.hint { position: fixed; top: max(8px, env(safe-area-inset-top)); right: 12px; font-size: 13px; color: #555; text-align: right; }',
    '.hint b { color: #1a2e05; }',
    '.card { text-align: center; max-width: 380px; padding-top: 72px; }',
    '.icon { font-size: 48px; margin-bottom: 12px; }',
    'h1 { font-size: 20px; margin-bottom: 8px; }',
    'p { font-size: 15px; color: #555; margin-bottom: 18px; line-height: 1.5; }',
    '.btn { display: inline-block; background: #3d6b0f; color: #fff; font-size: 17px; font-weight: 600; padding: 14px 32px; border-radius: 12px; text-decoration: none; }',
    '.trust { font-size: 13px; color: #777; margin-top: 16px; }',
    "</style>",
    "</head>",
    "<body>",
    '<div class="hint">Vil du heller bruke Safari? ↗<br/>Trykk <b>•••</b> → <b>Åpne i ekstern nettleser</b></div>',
    '<div class="card">',
    '<div class="icon">🌿</div>',
    `<h1>${safeTitle}</h1>`,
    '<p>Vi åpner varene nå …</p>',
    `<a class="btn" href="${safeTargetUrl}">Se varer og bestill</a>`,
    '<p class="trust">🔒 Sikker betaling via Vipps, kort eller Klarna.</p>',
    `<script>(function(){var t=${targetUrlJson};var a=${androidUrlJson};var ua=navigator.userAgent||"";if(ua.indexOf("Android")!==-1){window.location.replace(a);setTimeout(function(){window.location.replace(t);},1500);return;}setTimeout(function(){window.location.replace(t);},1500);})();</script>`,
    "</div>",
    "</body>",
    "</html>",
  ].join("");
}
