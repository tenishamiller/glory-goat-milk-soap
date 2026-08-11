const BUCKET = "review-images";
const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

let bucketReady = false;

async function ensureBucket(supabase) {
  if (bucketReady) return;

  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) throw listError;

  if (!buckets?.some((bucket) => bucket.name === BUCKET)) {
    const { error: createError } = await supabase.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: MAX_BYTES,
      allowedMimeTypes: [...ALLOWED_TYPES],
    });
    if (createError && !/already exists/i.test(createError.message)) {
      throw createError;
    }
  }

  bucketReady = true;
}

function parseDataUrl(dataUrl) {
  const match = /^data:(image\/[\w+.-]+);base64,([a-z0-9+/=\s]+)$/i.exec(String(dataUrl || "").trim());
  if (!match) return null;

  const contentType = match[1].toLowerCase();
  if (!ALLOWED_TYPES.has(contentType)) return null;

  const buffer = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  if (!buffer.length || buffer.length > MAX_BYTES) return null;

  const ext =
    contentType === "image/jpeg"
      ? "jpg"
      : contentType === "image/png"
        ? "png"
        : contentType === "image/webp"
          ? "webp"
          : "gif";

  return { buffer, contentType, ext };
}

export async function uploadReviewImage(supabase, reviewId, dataUrl) {
  if (!dataUrl) return null;

  const parsed = parseDataUrl(dataUrl);
  if (!parsed) {
    throw new Error("Photo must be JPG, PNG, WebP, or GIF and 2 MB or smaller");
  }

  await ensureBucket(supabase);

  const path = `${reviewId}.${parsed.ext}`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, parsed.buffer, {
    contentType: parsed.contentType,
    upsert: true,
  });
  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl || null;
}

export async function deleteReviewImage(supabase, imageUrl) {
  if (!imageUrl) return;

  const marker = `/storage/v1/object/public/${BUCKET}/`;
  const index = imageUrl.indexOf(marker);
  if (index === -1) return;

  const path = imageUrl.slice(index + marker.length);
  if (!path) return;

  await supabase.storage.from(BUCKET).remove([path]);
}
