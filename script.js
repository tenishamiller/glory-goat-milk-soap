const cremeSize = document.getElementById("creme-size");
const cremePrice = document.getElementById("creme-price");
const cremeBuy = document.getElementById("creme-buy");
const cremePrices = { "8": "$10.00", "16": "$15.00" };
const cremeProducts = { "8": "lotion_8oz", "16": "lotion_16oz" };

const productState = {};
let curingState = null;

function cremeProductKey() {
  return cremeProducts[cremeSize?.value || "8"];
}

function getFulfillment() {
  return document.getElementById("delivery-method")?.value || "ship";
}

async function goToCheckout(productKey, button) {
  try {
    if (!window.GloryCheckout?.open) {
      throw new Error("Checkout is still loading. Please try again.");
    }
    await window.GloryCheckout.open({
      product: productKey,
      fulfillment: getFulfillment(),
      returnPath: "/",
      button,
    });
  } catch (err) {
    if (!document.getElementById("checkout-modal") || document.getElementById("checkout-modal")?.classList.contains("hidden")) {
      alert(err.message || "Sorry, checkout could not start. Please try again in a moment.");
    }
  }
}

function applyProductUi(productKey, options = {}) {
  const cardBuy =
    productKey === "classic_bar"
      ? document.querySelector('.btn-buy[data-product="classic_bar"]')
      : cremeBuy;

  const stockLine = document.querySelector(`[data-stock-for="${options.stockGroup || productKey}"]`);
  const curingLine = document.querySelector(`[data-curing-for="${options.stockGroup || productKey}"]`);
  const notifyBox = document.querySelector(`[data-notify-for="${options.stockGroup || productKey}"]`);
  const state = productState[productKey];

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

  if (cardBuy) {
    cardBuy.disabled = !inStock;
    if (curing) {
      cardBuy.textContent = "Curing";
    } else {
      cardBuy.textContent = inStock ? "Buy Now" : "Sold out";
    }
    cardBuy.classList.toggle("hidden", !inStock && tracked && !curing);
  }

  if (notifyBox) {
    notifyBox.classList.toggle("hidden", !tracked || inStock || curing);
  }
}

function refreshCremeUi() {
  const key = cremeProductKey();
  applyProductUi(key, { stockGroup: "creme" });
}

async function loadProducts() {
  try {
    const res = await fetch("/api/products");
    const data = await res.json();
    curingState = data.curing ?? null;
    for (const product of data.products ?? []) {
      productState[product.product_key] = product;
    }

    if (!data.products?.length && curingState && productState.classic_bar == null) {
      productState.classic_bar = {
        product_key: "classic_bar",
        curing: Boolean(curingState.is_curing),
        curing_message: curingState.message || "",
        in_stock: true,
        inventory_count: null,
      };
    }

    applyProductUi("classic_bar");
    refreshCremeUi();
  } catch {
    // Shop still works if inventory API is unavailable
  }
}

document.querySelectorAll(".btn-buy[data-product]").forEach((btn) => {
  btn.addEventListener("click", () => goToCheckout(btn.dataset.product, btn));
});

if (cremeSize && cremePrice) {
  cremeSize.addEventListener("change", () => {
    cremePrice.textContent = cremePrices[cremeSize.value];
    refreshCremeUi();
  });
}

if (cremeBuy && cremeSize) {
  cremeBuy.addEventListener("click", () => {
    goToCheckout(cremeProductKey(), cremeBuy);
  });
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

    const productKey =
      group === "creme" ? cremeProductKey() : group;

    btn.disabled = true;
    btn.textContent = "Saving…";

    try {
      const res = await fetch("/api/stock-notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product: productKey, email }),
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

const contactForm = document.getElementById("contact-form");
const contactStatus = document.getElementById("contact-status");

if (contactForm) {
  contactForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = contactForm.querySelector("button[type=submit]");
    const original = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Sending…";
    contactStatus?.classList.add("hidden");

    const formData = new FormData(contactForm);
    const payload = {
      name: formData.get("name"),
      email: formData.get("email"),
      message: formData.get("message"),
    };

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not send");

      contactForm.reset();
      if (contactStatus) {
        contactStatus.textContent = "Message sent! Check your email — you can reply there anytime.";
        contactStatus.classList.remove("hidden");
      }
    } catch (err) {
      alert(err.message || "Could not send your message.");
    } finally {
      btn.disabled = false;
      btn.textContent = original;
    }
  });
}

if (
  window.location.hash.includes("ordered=1") ||
  new URLSearchParams(window.location.search).get("ordered") === "1"
) {
  const thanks = document.getElementById("order-thanks");
  if (thanks) thanks.classList.remove("hidden");
  const shop = document.getElementById("shop");
  if (shop) shop.scrollIntoView({ behavior: "smooth", block: "start" });
}

loadProducts();

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
