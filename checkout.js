let stripePromise = null;
let activeCheckout = null;

function ensureCheckoutModal() {
  let modal = document.getElementById("checkout-modal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "checkout-modal";
  modal.className = "checkout-modal hidden";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "checkout-modal-title");
  modal.innerHTML = `
    <div class="checkout-modal-backdrop" data-checkout-close></div>
    <div class="checkout-modal-panel">
      <button type="button" class="checkout-modal-close" data-checkout-close aria-label="Close checkout">&times;</button>
      <div class="checkout-modal-content">
        <div class="checkout-title-row">
          <img class="checkout-floral checkout-floral-title-left" src="/assets/why-wildflower-bunch-left-web.png?v=2" alt="" aria-hidden="true">
          <h2 id="checkout-modal-title">Checkout</h2>
          <img class="checkout-floral checkout-floral-title-right" src="/assets/why-wildflower-bunch-right-web.png?v=2" alt="" aria-hidden="true">
        </div>
        <div class="checkout-mount-wrap">
          <img class="checkout-floral checkout-floral-bl" src="/assets/wildflower-real-daisy-web.png?v=2" alt="" aria-hidden="true">
          <img class="checkout-floral checkout-floral-br" src="/assets/wildflower-real-buttercup-web.png?v=2" alt="" aria-hidden="true">
          <div id="glory-checkout-mount" class="checkout-mount"></div>
        </div>
        <p class="checkout-modal-status hidden" id="checkout-modal-status" role="status"></p>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.querySelectorAll("[data-checkout-close]").forEach((el) => {
    el.addEventListener("click", () => closeCheckoutModal());
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.classList.contains("hidden")) {
      closeCheckoutModal();
    }
  });

  return modal;
}

function setCheckoutStatus(message, isError = false) {
  const status = document.getElementById("checkout-modal-status");
  if (!status) return;
  if (!message) {
    status.classList.add("hidden");
    status.textContent = "";
    return;
  }
  status.textContent = message;
  status.classList.toggle("is-error", isError);
  status.classList.remove("hidden");
}

function loadStripeJs() {
  if (window.Stripe) return Promise.resolve();
  if (stripePromise) return stripePromise;

  stripePromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://js.stripe.com/v3/";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load Stripe"));
    document.head.appendChild(script);
  });

  return stripePromise;
}

async function getPublishableKey() {
  const res = await fetch("/api/stripe-config");
  const data = await res.json();
  if (!res.ok || !data.publishableKey) {
    throw new Error(data.error || "Checkout is not configured");
  }
  return data.publishableKey;
}

async function closeCheckoutModal() {
  const modal = document.getElementById("checkout-modal");
  if (activeCheckout) {
    try {
      activeCheckout.destroy();
    } catch {
      // ignore destroy errors when already torn down
    }
    activeCheckout = null;
  }
  const mount = document.getElementById("glory-checkout-mount");
  if (mount) mount.innerHTML = "";
  setCheckoutStatus("");
  modal?.classList.add("hidden");
  document.body.classList.remove("checkout-open");
}

function normalizeQuantity(value) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return n;
}

async function openEmbeddedCheckout({ product, fulfillment, quantity, returnPath, button }) {
  const originalText = button?.textContent;
  if (button) {
    button.disabled = true;
    button.textContent = "Loading…";
  }

  const modal = ensureCheckoutModal();
  const mount = document.getElementById("glory-checkout-mount");
  setCheckoutStatus("Loading secure checkout…");
  modal.classList.remove("hidden");
  document.body.classList.add("checkout-open");

  try {
    await loadStripeJs();
    const publishableKey = await getPublishableKey();
    const stripe = window.Stripe(publishableKey);

    if (activeCheckout) {
      try {
        activeCheckout.destroy();
      } catch {
        // ignore
      }
      activeCheckout = null;
    }
    if (mount) mount.innerHTML = "";

    const qty = normalizeQuantity(quantity);

    const fetchClientSecret = async () => {
      const res = await fetch("/api/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          product,
          fulfillment,
          quantity: qty,
          return_path: returnPath || window.location.pathname || "/",
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.clientSecret) {
        throw new Error(data.error || "Checkout failed");
      }
      return data.clientSecret;
    };

    const createEmbedded =
      typeof stripe.createEmbeddedCheckoutPage === "function"
        ? stripe.createEmbeddedCheckoutPage.bind(stripe)
        : typeof stripe.initEmbeddedCheckout === "function"
          ? stripe.initEmbeddedCheckout.bind(stripe)
          : null;

    if (!createEmbedded) {
      throw new Error("This browser cannot open on-site checkout. Please refresh and try again.");
    }

    const checkout = await createEmbedded({ fetchClientSecret });
    activeCheckout = checkout;
    setCheckoutStatus("");
    checkout.mount("#glory-checkout-mount");
  } catch (err) {
    setCheckoutStatus(err.message || "Sorry, checkout could not start.", true);
    throw err;
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = originalText || "Buy Now";
    }
  }
}

// Non-module pages can call via window.
window.GloryCheckout = {
  open: openEmbeddedCheckout,
  close: closeCheckoutModal,
};
