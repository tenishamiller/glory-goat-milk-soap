/**
 * Generate favicons from the goat hero image.
 * Usage: node scripts/generate-favicon.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pngToIco from "png-to-ico";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const source = path.join(root, "assets", "glory-goat-hero.png");

if (!fs.existsSync(source)) {
  console.error("Missing assets/glory-goat-hero.png");
  process.exit(1);
}

const sizes = [
  { name: "favicon-16x16.png", size: 16 },
  { name: "favicon-32x32.png", size: 32 },
  { name: "apple-touch-icon.png", size: 180 },
];

for (const { name, size } of sizes) {
  const out = path.join(root, "assets", name);
  await sharp(source)
    .resize(size, size, { fit: "cover", position: "centre" })
    .png()
    .toFile(out);
  console.log("Wrote", name);
}

const ico = await pngToIco([
  path.join(root, "assets", "favicon-16x16.png"),
  path.join(root, "assets", "favicon-32x32.png"),
]);
fs.writeFileSync(path.join(root, "favicon.ico"), ico);
console.log("Wrote favicon.ico");
