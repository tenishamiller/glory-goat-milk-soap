const params = new URLSearchParams(window.location.search);
const orderId = params.get("order");
const token = params.get("token");

const loadingEl = document.getElementById("review-loading");
const errorEl = document.getElementById("review-error");
const errorTextEl = document.getElementById("review-error-text");
const doneEl = document.getElementById("review-done");
const doneLinkEl = document.getElementById("review-done-link");
const alreadyEl = document.getElementById("review-already");
const alreadyLinkEl = document.getElementById("review-already-link");
const formWrapEl = document.getElementById("review-form-wrap");
const formEl = document.getElementById("review-page-form");
const statusEl = document.getElementById("review-page-status");
const productLabelEl = document.getElementById("review-product-label");
const customerLineEl = document.getElementById("review-customer-line");
const photoInput = document.getElementById("review-page-photo");
const photoPreviewEl = document.getElementById("review-photo-preview");
const photoPreviewImg = document.getElementById("review-photo-preview-img");
const photoClearBtn = document.getElementById("review-photo-clear");

let inviteData = null;
let selectedImageData = null;

function showState(state) {
  for (const el of [loadingEl, errorEl, doneEl, alreadyEl, formWrapEl]) {
    el?.classList.add("hidden");
  }
  state?.classList.remove("hidden");
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read photo"));
    reader.readAsDataURL(file);
  });
}

photoInput?.addEventListener("change", async () => {
  selectedImageData = null;
  photoPreviewEl?.classList.add("hidden");

  const file = photoInput.files?.[0];
  if (!file) return;

  if (file.size > 2 * 1024 * 1024) {
    alert("Photo must be 2 MB or smaller.");
    photoInput.value = "";
    return;
  }

  try {
    selectedImageData = await readFileAsDataUrl(file);
    if (photoPreviewImg && selectedImageData) {
      photoPreviewImg.src = selectedImageData;
      photoPreviewEl?.classList.remove("hidden");
    }
  } catch (err) {
    alert(err.message || "Could not load photo.");
    photoInput.value = "";
  }
});

photoClearBtn?.addEventListener("click", () => {
  selectedImageData = null;
  if (photoInput) photoInput.value = "";
  photoPreviewEl?.classList.add("hidden");
});

async function loadInvite() {
  if (!orderId || !token) {
    showState(errorEl);
    if (errorTextEl) errorTextEl.textContent = "This review link is missing information. Please use the link from your email.";
    return;
  }

  try {
    const res = await fetch(
      `/api/reviews?invite=1&order=${encodeURIComponent(orderId)}&token=${encodeURIComponent(token)}`,
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not load review invitation");

    inviteData = data;

    if (data.alreadyReviewed) {
      if (alreadyLinkEl) alreadyLinkEl.href = data.productUrl || "/";
      showState(alreadyEl);
      return;
    }

    if (productLabelEl) productLabelEl.textContent = data.productLabel;
    if (customerLineEl) {
      customerLineEl.textContent = data.customerName
        ? `Reviewing as ${data.customerName}`
        : "Reviewing your verified purchase";
    }

    showState(formWrapEl);
  } catch (err) {
    showState(errorEl);
    if (errorTextEl) errorTextEl.textContent = err.message || "Could not load review invitation.";
  }
}

formEl?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!inviteData) return;

  const submitBtn = formEl.querySelector('button[type="submit"]');
  const originalText = submitBtn?.textContent;
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = "Submitting…";
  }
  statusEl?.classList.add("hidden");

  const formData = new FormData(formEl);

  try {
    const res = await fetch("/api/reviews", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        orderId,
        token,
        rating: Number(formData.get("rating")),
        body: formData.get("body"),
        imageData: selectedImageData,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not submit review");

    if (doneLinkEl) doneLinkEl.href = data.productUrl || inviteData.productUrl || "/";
    showState(doneEl);
  } catch (err) {
    if (statusEl) {
      statusEl.textContent = err.message || "Could not submit review.";
      statusEl.classList.remove("hidden");
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = originalText || "Submit review";
    }
  }
});

loadInvite();
