import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.join(__dirname, "../assets");
const SECTION_BG = { r: 245, g: 240, b: 232 }; // #f5f0e8 — matches mockup / site beige

const sources = [
  "why-wildflower-bunch-left.png",
  "why-wildflower-bunch-right.png",
  "why-wildflower-bunch-left-2.png",
];

function isBackgroundPixel(r, g, b, a) {
  if (a < 24) return true;
  const avg = (r + g + b) / 3;
  const spread = Math.max(r, g, b) - Math.min(r, g, b);
  return avg > 215 && spread < 42;
}

for (const source of sources) {
  const input = path.join(assetsDir, source);
  const output = path.join(assetsDir, source.replace(".png", "-web.png"));

  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    if (isBackgroundPixel(r, g, b, a)) {
      data[i] = SECTION_BG.r;
      data[i + 1] = SECTION_BG.g;
      data[i + 2] = SECTION_BG.b;
      data[i + 3] = 255;
    }
  }

  await sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  })
    .png({ compressionLevel: 9, quality: 85 })
    .resize({ width: Math.min(info.width, 520), withoutEnlargement: true })
    .toFile(output);

  console.log(`Wrote ${path.basename(output)}`);
}
