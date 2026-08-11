/**
 * Remove solid cream/white backgrounds from flower PNGs via edge flood-fill.
 * Writes transparent *-web.png cutouts for overlays (checkout, page accents).
 *
 *   node scripts/cutout-flower-backgrounds.mjs
 */
import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const JOBS = [
  { input: "assets/why-wildflower-bunch-left.png", output: "assets/why-wildflower-bunch-left-web.png", width: 520, threshold: 48 },
  { input: "assets/why-wildflower-bunch-right.png", output: "assets/why-wildflower-bunch-right-web.png", width: 520, threshold: 48 },
  { input: "assets/why-wildflower-bunch-left-2.png", output: "assets/why-wildflower-bunch-left-2-web.png", width: 520, threshold: 48 },
  { input: "assets/wildflower-real-daisy.png", output: "assets/wildflower-real-daisy-web.png", width: 360, threshold: 30 },
  { input: "assets/wildflower-real-buttercup.png", output: "assets/wildflower-real-buttercup-web.png", width: 360, threshold: 30 },
  { input: "assets/wildflower-real-lupine.png", output: "assets/wildflower-real-lupine-web.png", width: 360, threshold: 30 },
];

function colorDist(r1, g1, b1, r2, g2, b2) {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function isBackgroundLike(r, g, b, samples, threshold) {
  for (const s of samples) {
    if (colorDist(r, g, b, s.r, s.g, s.b) <= threshold) return true;
  }
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  // Near-white / pale gray (incl. baked checkerboard leftovers)
  if (max >= 232 && max - min <= 22) return true;
  // Site cream beige plate
  if (r >= 230 && g >= 225 && b >= 215 && max - min <= 30) return true;
  return false;
}

function floodCutout(data, width, height, threshold) {
  const channels = 4;
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let qh = 0;
  let qt = 0;

  const samples = [];
  const samplePts = [
    [0, 0],
    [width - 1, 0],
    [0, height - 1],
    [width - 1, height - 1],
    [Math.floor(width / 2), 0],
    [0, Math.floor(height / 2)],
    [width - 1, Math.floor(height / 2)],
    [Math.floor(width / 2), height - 1],
  ];
  for (const [x, y] of samplePts) {
    const i = (y * width + x) * channels;
    samples.push({ r: data[i], g: data[i + 1], b: data[i + 2] });
  }

  const push = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const idx = y * width + x;
    if (visited[idx]) return;
    const i = idx * channels;
    if (!isBackgroundLike(data[i], data[i + 1], data[i + 2], samples, threshold)) return;
    visited[idx] = 1;
    queue[qt++] = idx;
  };

  for (let x = 0; x < width; x++) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    push(0, y);
    push(width - 1, y);
  }

  while (qh < qt) {
    const idx = queue[qh++];
    const x = idx % width;
    const y = (idx / width) | 0;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }

  const out = Buffer.from(data);
  for (let idx = 0; idx < width * height; idx++) {
    const i = idx * channels;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const avg = (r + g + b) / 3;
    const spread = max - min;

    // Edge-connected background plate
    if (visited[idx]) {
      out[i] = 0;
      out[i + 1] = 0;
      out[i + 2] = 0;
      out[i + 3] = 0;
      continue;
    }

    // Catch cream/beige "ghost squares" trapped inside the bouquet silhouette
    // without eating green leaves or vivid petals.
    const isCreamPlate = avg >= 220 && spread <= 28 && g >= b - 8;
    const isPaleGray = avg >= 238 && spread <= 16;
    const isLeafOrBloom = g > r + 12 || b > g + 18 || (r > 180 && g > 150 && b < 120);
    if ((isCreamPlate || isPaleGray) && !isLeafOrBloom) {
      out[i] = 0;
      out[i + 1] = 0;
      out[i + 2] = 0;
      out[i + 3] = 0;
    }
  }

  return out;
}

async function processJob(job) {
  const inputPath = path.join(root, job.input);
  const outputPath = path.join(root, job.output);

  const resized = await sharp(inputPath)
    .resize({ width: job.width, withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const cut = floodCutout(
    resized.data,
    resized.info.width,
    resized.info.height,
    job.threshold,
  );

  await sharp(cut, {
    raw: {
      width: resized.info.width,
      height: resized.info.height,
      channels: 4,
    },
  })
    .png({ compressionLevel: 9 })
    .toFile(outputPath);

  const { data, info } = await sharp(outputPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let transparent = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] === 0) transparent++;
  const pct = ((100 * transparent) / (info.width * info.height)).toFixed(1);
  console.log(`OK ${job.output} ${info.width}x${info.height} transparent=${pct}%`);
}

for (const job of JOBS) {
  await processJob(job);
}

console.log("\nDone. Flower web assets now have transparent backgrounds.");
