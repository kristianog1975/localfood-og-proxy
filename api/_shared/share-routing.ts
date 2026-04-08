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

function toIosSafariUrl(url: string): string {
  if (url.startsWith("https://")) {
    return `x-safari-https://${url.slice("https://".length)}`;
  }

  if (url.startsWith("http://")) {
    return `x-safari-http://${url.slice("http://".length)}`;
  }

  return url;
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
  const iosUrlJson = JSON.stringify(toIosSafariUrl(targetUrl));
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
    'body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: flex-start; justify-content: center; min-height: 100vh; background: #f8faf5; color: #1a2e05; padding: 16px 20px 32px; }',
    '.card { text-align: center; max-width: 380px; padding-top: max(12px, env(safe-area-inset-top)); }',
    '.icon { font-size: 48px; margin-bottom: 12px; }',
    'h1 { font-size: 20px; margin-bottom: 8px; }',
    'p { font-size: 15px; color: #555; margin-bottom: 18px; line-height: 1.5; }',
    '.highlight { color: #1a2e05; font-weight: 600; }',
    '.btn { display: inline-block; background: #3d6b0f; color: #fff; font-size: 17px; font-weight: 600; padding: 14px 32px; border-radius: 12px; text-decoration: none; -webkit-tap-highlight-color: transparent; margin-top: 6px; }',
    '.btn:active { background: #2d5200; }',
    '.trust { font-size: 13px; color: #777; margin-top: 16px; margin-bottom: 0; line-height: 1.5; }',
    '.trust .lock { font-size: 14px; }',
    "</style>",
    "</head>",
    "<body>",
    '<div class="card">',
    '<div class="icon">🌿</div>',
    '<h1>Du sendes til LocalFood</h1>',
    `<p>For å fullføre bestillingen hos <span class="highlight">${safeTitle}</span> åpner vi LocalFood i den vanlige nettleseren din. Dette er en sikker og trygg rutine.</p>`,
    `<a class="btn" id="open-btn" href="${safeTargetUrl}">Åpne LocalFood</a>`,
    '<p class="trust"><span class="lock">🔒</span> Sikker betaling via Vipps, kort eller Klarna.<br/>Trykk «Åpne» i dialogen over for å fortsette.</p>',
    `<script>(function(){var targetUrl=${targetUrlJson};var iosUrl=${iosUrlJson};var androidUrl=${androidUrlJson};var ua=navigator.userAgent||"";var isIOS=ua.indexOf("iPhone")!==-1||ua.indexOf("iPad")!==-1||ua.indexOf("iPod")!==-1;var isAndroid=ua.indexOf("Android")!==-1;function openExternal(){if(isIOS){window.location.replace(iosUrl);return;}if(isAndroid){window.location.replace(androidUrl);return;}window.location.href=targetUrl;}openExternal();var btn=document.getElementById("open-btn");if(btn){btn.addEventListener("click",function(event){event.preventDefault();openExternal();});}})();</script>`,
    "</div>",
    "</body>",
    "</html>",
  ].join("");
}
