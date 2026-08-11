import { EMAIL_PREVIEW_SAMPLES } from "../lib/email-templates.js";

export default async function handler(req, res) {
  const type = (req.query?.type || "back-in-stock").trim();
  const sample = EMAIL_PREVIEW_SAMPLES[type];

  if (!sample) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    const links = Object.entries(EMAIL_PREVIEW_SAMPLES)
      .map(([key, value]) => `<li><a href="?type=${key}">${value.label}</a></li>`)
      .join("");
    return res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex, nofollow">
  <title>Email previews — Glory Goat</title>
  <style>
    body { font-family: Arial, sans-serif; background: #dce8d6; margin: 0; padding: 24px; color: #3d342b; }
    .wrap { max-width: 720px; margin: 0 auto; background: #faf8f4; border: 1px solid #e8dfd0; border-radius: 16px; padding: 24px; }
    h1 { color: #2f4f2f; margin-top: 0; }
    ul { line-height: 1.9; }
    a { color: #3d6b34; font-weight: 700; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Glory Goat email previews</h1>
    <p>Choose a notification type:</p>
    <ul>${links}</ul>
  </div>
</body>
</html>`);
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  return res.status(200).send(sample.html);
}
