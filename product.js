const cremeSize = document.getElementById("creme-size");
const cremePrice = document.getElementById("creme-price");
const cremeBuy = document.getElementById("creme-buy");
const cremePrices = { "8": "$10.00", "16": "$15.00" };
const cremeProducts = { "8": "lotion_8oz", "16": "lotion_16oz" };

const productState = {};
const pageRoot = document.body;
const productKey = pageRoot.dataset.productKey;
const productGroup = pageRoot.dataset.productGroup;

function cremeProductKey() {
  return cremeProducts[cremeSize?.value || "8"];
}

function activeProductKey() {
  if (productGroup === "creme") return cremeProductKey();
  return productKey;
}

const MAX_QTY = 10;

function getFulfillment() {
  return document.getElementById("delivery-method")?.value || "ship";
}

function qtySelectFor(stockGroup) {
  return document.querySelector(`[data-qty-for="${stockGroup}"]`);
}

function getQuantity(stockGroup) {
  const n = Number.parseInt(qtySelectFor(stockGroup)?.value || "1", 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, MAX_QTY);
}

function syncQuantityOptions(stockGroup, state) {
  const select = qtySelectFor(stockGroup);
  if (!select) return;

  const curing = Boolean(state?.curing);
  const tracked = state?.inventory_count != null;
  const inStock = Boolean(state?.in_stock) && !curing;
  let max = MAX_QTY;
  if (tracked && state.auto_stop !== false && Number.isFinite(state.inventory_count)) {
    max = Math.max(1, Math.min(MAX_QTY, state.inventory_count));
  }

  const current = Number.parseInt(select.value || "1", 10) || 1;
  select.innerHTML = "";
  for (let i = 1; i <= max; i += 1) {
    const option = document.createElement("option");
    option.value = String(i);
    option.textContent = String(i);
    if (i === Math.min(current, max)) option.selected = true;
    select.appendChild(option);
  }
  select.disabled = !inStock;
}

async function goToCheckout(key, button, stockGroup) {
  try {
    if (!window.GloryCheckout?.open) {
      throw new Error("Checkout is still loading. Please try again.");
    }
    await window.GloryCheckout.open({
      product: key,
      fulfillment: getFulfillment(),
      quantity: getQuantity(stockGroup || key),
      returnPath: window.location.pathname || "/",
      button,
    });
  } catch (err) {
    if (!document.getElementById("checkout-modal") || document.getElementById("checkout-modal")?.classList.contains("hidden")) {
      alert(err.message || "Sorry, checkout could not start. Please try again in a moment.");
    }
  }
}

function applyProductUi(key, options = {}) {
  const buyBtn = document.getElementById("product-buy") || cremeBuy;
  const stockLine = document.querySelector(`[data-stock-for="${options.stockGroup || key}"]`);
  const curingLine = document.querySelector(`[data-curing-for="${options.stockGroup || key}"]`);
  const notifyBox = document.querySelector(`[data-notify-for="${options.stockGroup || key}"]`);
  const state = productState[key];

  if (!state) return;

  const tracked = state.inventory_count != null;
  const curing = Boolean(state.curing);
  const inStock = state.in_stock && !curing;

  if (curingLine) {
    if (curing && state.curing_message) {
      curingLine.textContent = state.curing_message;
      curingLine.classList.remove("hidden");
    } else {
      curingLine.textContent = "";
      curingLine.classList.add("hidden");
    }
  }

  if (stockLine) {
    if (curing) {
      stockLine.textContent = "";
      stockLine.classList.remove("out-of-stock");
    } else if (!tracked) {
      stockLine.textContent = "";
    } else if (inStock) {
      stockLine.textContent = `${state.inventory_count} in stock`;
      stockLine.classList.remove("out-of-stock");
    } else {
      stockLine.textContent = "Out of stock";
      stockLine.classList.add("out-of-stock");
    }
  }

  if (buyBtn) {
    buyBtn.disabled = !inStock;
    if (curing) {
      buyBtn.textContent = "Curing";
    } else {
      buyBtn.textContent = inStock ? "Buy Now" : "Sold out";
    }
    buyBtn.classList.toggle("hidden", !inStock && tracked && !curing);
  }

  syncQuantityOptions(options.stockGroup || key, state);

  if (notifyBox) {
    notifyBox.classList.toggle("hidden", !tracked || inStock || curing);
  }
}

function refreshCremeUi() {
  applyProductUi(cremeProductKey(), { stockGroup: "creme" });
}

async function loadProducts() {
  try {
    const res = await fetch("/api/products");
    const data = await res.json();
    for (const product of data.products ?? []) {
      productState[product.product_key] = product;
    }

    if (!data.products?.length && data.curing && productKey === "classic_bar" && productState.classic_bar == null) {
      productState.classic_bar = {
        product_key: "classic_bar",
        curing: Boolean(data.curing.is_curing),
        curing_message: data.curing.message || "",
        in_stock: true,
        inventory_count: null,
      };
    }

    if (productGroup === "creme") {
      refreshCremeUi();
    } else if (productKey) {
      applyProductUi(productKey);
    }
  } catch {
    // Shop still works if inventory API is unavailable
  }
}

const productBuy = document.getElementById("product-buy");
if (productBuy && productKey) {
  productBuy.addEventListener("click", () => goToCheckout(productKey, productBuy, productKey));
}

if (cremeSize && cremePrice) {
  cremeSize.addEventListener("change", () => {
    cremePrice.textContent = cremePrices[cremeSize.value];
    refreshCremeUi();
    loadReviews();
  });
}

if (cremeBuy && cremeSize) {
  cremeBuy.addEventListener("click", () => goToCheckout(cremeProductKey(), cremeBuy, "creme"));
}

document.querySelectorAll(".btn-notify").forEach((btn) => {
  btn.addEventListener("click", async () => {
    const group = btn.dataset.product;
    const box = document.querySelector(`[data-notify-for="${group}"]`);
    const input = box?.querySelector(".notify-email");
    const email = input?.value?.trim();
    if (!email) {
      alert("Please enter your email.");
      return;
    }

    const key = group === "creme" ? cremeProductKey() : group;

    btn.disabled = true;
    btn.textContent = "Saving…";

    try {
      const res = await fetch("/api/stock-notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product: key, email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save");
      btn.textContent = "You're on the list!";
    } catch (err) {
      btn.disabled = false;
      btn.textContent = "Notify me";
      alert(err.message || "Could not save your email.");
    }
  });
});

if (window.location.search.includes("ordered=1")) {
  const thanks = document.getElementById("order-thanks");
  if (thanks) thanks.classList.remove("hidden");
}

const reviewsList = document.getElementById("reviews-list");
const reviewsEmpty = document.getElementById("reviews-empty");

function formatPublicReviewerName(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) return "Customer";
  if (parts.length === 1) return parts[0];

  const first = parts[0];
  const lastInitial = parts[parts.length - 1][0]?.toUpperCase();
  return lastInitial ? `${first} ${lastInitial}.` : first;
}

function renderStars(rating) {
  return "★".repeat(rating) + "☆".repeat(5 - rating);
}

function formatReviewDate(value) {
  try {
    return new Date(value).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

function renderReviews(reviews) {
  if (!reviewsList || !reviewsEmpty) return;

  reviewsList.innerHTML = "";

  if (!reviews.length) {
    reviewsEmpty.classList.remove("hidden");
    return;
  }

  reviewsEmpty.classList.add("hidden");

  for (const review of reviews) {
    const card = document.createElement("article");
    card.className = "review-card";
    card.innerHTML = `
      <div class="review-card-head">
        <span class="review-card-name"></span>
        <span class="review-card-stars" aria-label="${review.rating} out of 5 stars"></span>
      </div>
      <p class="review-card-body"></p>
      <div class="review-card-photo-wrap hidden"></div>
      <p class="review-card-date"></p>
    `;
    card.querySelector(".review-card-name").textContent = formatPublicReviewerName(review.reviewer_name);
    card.querySelector(".review-card-stars").textContent = renderStars(review.rating);
    card.querySelector(".review-card-body").textContent = review.body;
    card.querySelector(".review-card-date").textContent = formatReviewDate(review.created_at);

    if (review.image_url) {
      const photoWrap = card.querySelector(".review-card-photo-wrap");
      const img = document.createElement("img");
      img.className = "review-card-photo";
      img.src = review.image_url;
      img.alt = "Customer photo for this review";
      img.loading = "lazy";
      photoWrap.classList.remove("hidden");
      photoWrap.appendChild(img);
    }

    reviewsList.appendChild(card);
  }
}

async function loadReviews() {
  const key = activeProductKey();
  if (!key || !reviewsList) return;

  try {
    const res = await fetch(`/api/reviews?product=${encodeURIComponent(key)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Could not load reviews");
    renderReviews(data.reviews ?? []);
  } catch {
    if (reviewsEmpty) {
      reviewsEmpty.innerHTML =
        '<p class="reviews-empty-title">Reviews are unavailable right now.</p><p class="reviews-empty-text">Please check back soon.</p>';
      reviewsEmpty.classList.remove("hidden");
    }
  }
}

loadProducts();
loadReviews();

const revealEls = document.querySelectorAll(".reveal");
if (revealEls.length && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
  );

  revealEls.forEach((el, i) => {
    el.style.transitionDelay = `${Math.min(i * 0.06, 0.36)}s`;
    observer.observe(el);
  });
} else {
  revealEls.forEach((el) => el.classList.add("visible"));
}
