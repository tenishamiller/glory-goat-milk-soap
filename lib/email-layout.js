import { GOAT_IMAGE_URL, MEADOW_IMAGE_URL, SITE_ORIGIN } from "./glory-products.js";

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildGloryEmailLayout({
  preheader = "",
  eyebrow = "Glory Goat Milk Soap",
  title,
  subtitle = "",
  bodyHtml = "",
  primaryCta,
  footerNote = "Handmade with wildflower love in North Carolina",
}) {
  const ctaBlock = primaryCta
    ? `<div style="text-align:center;margin:28px 0 8px;">
         <a href="${primaryCta.href}" style="display:inline-block;background:#3d6b34;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:999px;font-size:15px;font-weight:700;font-family:Arial,Helvetica,sans-serif;box-shadow:0 4px 14px rgba(47,79,47,0.25);">${escapeHtml(primaryCta.label)}</a>
       </div>`
    : "";

  const subtitleBlock = subtitle
    ? `<p style="margin:0;font-size:16px;line-height:1.6;color:#6b5d52;font-family:Arial,Helvetica,sans-serif;">${subtitle}</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)} — Glory Goat Milk Soap</title>
</head>
<body style="margin:0;padding:0;background:#dce8d6;font-family:Georgia,'Times New Roman',serif;color:#3d342b;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader || title)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:linear-gradient(180deg,#dce8d6 0%,#f5f0e8 42%,#faf8f4 100%);padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:580px;background:#faf8f4;border:1px solid #e8dfd0;border-radius:18px;box-shadow:0 16px 40px rgba(45,35,25,0.12);">
          <tr>
            <td align="center" style="padding:0;background:#faf8f4;border-radius:18px 18px 0 0;">
              <div style="height:92px;background:#87b56a url('${MEADOW_IMAGE_URL}') center/cover no-repeat;border-radius:18px 18px 0 0;"></div>
              <img src="${GOAT_IMAGE_URL}" alt="Glory Goat" width="112" height="112" style="display:block;margin:14px auto 6px;border-radius:18px;border:4px solid #faf8f4;box-shadow:0 10px 24px rgba(45,35,25,0.16);">
            </td>
          </tr>
          <tr>
            <td style="padding:4px 36px 0;text-align:center;">
              <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.16em;text-transform:uppercase;color:#6b5344;font-family:Arial,Helvetica,sans-serif;font-weight:700;">${escapeHtml(eyebrow)}</p>
              <h1 style="margin:0 0 10px;font-size:clamp(26px,5vw,34px);line-height:1.15;color:#2f4f2f;font-weight:600;">${title}</h1>
              ${subtitleBlock}
            </td>
          </tr>
          <tr>
            <td style="padding:24px 36px 8px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.7;color:#3d342b;">
              ${bodyHtml}
              ${ctaBlock}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 36px 28px;text-align:center;border-top:1px solid #e8dfd0;background:linear-gradient(180deg,#f5f0e8 0%,#faf8f4 100%);">
              <p style="margin:0 0 6px;font-size:20px;color:#2f4f2f;font-weight:600;font-family:Georgia,'Times New Roman',serif;">Glory Goat Milk Soap</p>
              <p style="margin:0 0 4px;font-size:13px;color:#8b7355;font-family:Arial,Helvetica,sans-serif;">${escapeHtml(footerNote)}</p>
              <p style="margin:0;font-size:13px;font-family:Arial,Helvetica,sans-serif;">
                <a href="${SITE_ORIGIN}" style="color:#3d6b34;text-decoration:none;font-weight:700;">glorygoatmilksoap.com</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export function buildProductHighlightBox(productName, detail = "") {
  return `<div style="background:linear-gradient(135deg,#f5f0e8 0%,#dce8d6 100%);border:1px solid #c9a66b;border-radius:14px;padding:20px 22px;margin:20px 0;text-align:center;">
    <p style="margin:0 0 6px;font-size:12px;letter-spacing:0.1em;text-transform:uppercase;color:#6b5344;font-weight:700;">Available now</p>
    <p style="margin:0;font-size:22px;font-weight:700;color:#2f4f2f;line-height:1.3;">${escapeHtml(productName)}</p>
    ${detail ? `<p style="margin:10px 0 0;font-size:14px;color:#6b5d52;">${escapeHtml(detail)}</p>` : ""}
  </div>`;
}

export function buildMessageQuoteBox(content) {
  return `<div style="background:#ffffff;border:1px solid #e8dfd0;border-left:4px solid #3d6b34;padding:16px 18px;border-radius:10px;margin:18px 0;">
    <p style="margin:0;white-space:pre-wrap;line-height:1.65;color:#3d342b;">${escapeHtml(content)}</p>
  </div>`;
}
