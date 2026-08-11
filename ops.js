const gate = document.getElementById("access-gate");
const app = document.getElementById("admin-app");
const accessForm = document.getElementById("access-form");
const accessError = document.getElementById("access-error");
const ticketList = document.getElementById("ticket-list");
const ticketThread = document.getElementById("ticket-thread");
const ticketEmpty = document.getElementById("ticket-empty");
const threadSubject = document.getElementById("thread-subject");
const threadMeta = document.getElementById("thread-meta");
const threadDate = document.getElementById("thread-date");
const threadMessages = document.getElementById("thread-messages");
const replyForm = document.getElementById("reply-form");
const archiveTicketBtn = document.getElementById("archive-ticket");
const restoreTicketBtn = document.getElementById("restore-ticket");
const deleteTicketBtn = document.getElementById("delete-ticket-permanent");
const selectAllTickets = document.getElementById("select-all-tickets");
const selectedCountEl = document.getElementById("selected-count");
const bulkActionsEl = document.getElementById("bulk-actions");
const bulkArchiveBtn = document.getElementById("bulk-archive");
const bulkRestoreBtn = document.getElementById("bulk-restore");
const bulkDeleteBtn = document.getElementById("bulk-delete");
const blockTicketBtn = document.getElementById("block-ticket-customer");
const blockCustomerForm = document.getElementById("block-customer-form");
const blockedList = document.getElementById("blocked-list");
const adminReviewsList = document.getElementById("admin-reviews-list");
const productList = document.getElementById("product-list");
const curingForm = document.getElementById("curing-form");
const curingActive = document.getElementById("curing-active");
const curingReadyDate = document.getElementById("curing-ready-date");
const curingPreview = document.getElementById("curing-preview");
const orderList = document.getElementById("order-list");
const ordersHint = document.getElementById("orders-hint");

let activeTicketId = null;
let activeTicket = null;
let activeMailbox = "inbox";
let activeAdminTab = "email";
let activeOrdersTab = "pickup";
let visibleTicketIds = [];
const selectedTicketIds = new Set();

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
async function api(path, options = {}) {
  const res = await fetch(path, {
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    showGate();
    throw new Error("Session expired");
  }
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

function showGate() {
  gate.classList.remove("hidden");
  app.classList.add("hidden");
}

function showApp() {
  gate.classList.add("hidden");
  app.classList.remove("hidden");
}

async function checkSession() {
  try {
    const data = await api("/api/admin/session");
    if (data.authenticated) {
      showApp();
      await Promise.all([loadTickets(), loadProducts(), loadOrders()]);
      return;
    }
  } catch {
    // fall through to gate
  }
  showGate();
}

accessForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  accessError.classList.add("hidden");
  const code = document.getElementById("access-code").value.trim();

  try {
    await api("/api/admin/session", {
      method: "POST",
      body: JSON.stringify({ code }),
    });
    showApp();
    await Promise.all([loadTickets(), loadProducts(), loadOrders()]);
  } catch (err) {
    accessError.textContent = err.message || "Incorrect access code";
    accessError.classList.remove("hidden");
  }
});

function showAdminTab(tab) {
  activeAdminTab = tab;
  document.querySelectorAll("[data-admin-tab]").forEach((btn) => {
    const active = btn.dataset.adminTab === tab;
    btn.classList.toggle("active", active);
  });
  document.querySelectorAll("[data-admin-panel]").forEach((panel) => {
    panel.classList.toggle("hidden", panel.dataset.adminPanel !== tab);
  });
  if (tab === "blocked") {
    loadBlocked();
  }
  if (tab === "reviews") {
    loadAdminReviews();
  }
  if (tab === "curing") {
    loadCuringSettings();
  }
}

document.querySelectorAll("[data-admin-tab]").forEach((tab) => {
  tab.addEventListener("click", () => showAdminTab(tab.dataset.adminTab));
});

async function blockCustomerEmail(email, { reason = "", source = "admin" } = {}) {
  const normalized = email?.trim();
  if (!normalized) return;

  if (!confirm(`Block ${normalized} from ordering and contacting you?`)) return;

  await api("/api/admin/tickets?resource=blocked", {
    method: "POST",
    body: JSON.stringify({ email: normalized, reason, source }),
  });

  await Promise.all([loadBlocked(), loadTickets(), loadOrders()]);
  if (activeTicketId) {
    await openTicket(activeTicketId);
  }
}

async function unblockCustomerEmail(email) {
  const normalized = email?.trim();
  if (!normalized) return;

  if (!confirm(`Unblock ${normalized}? They will be able to order and contact you again.`)) return;

  await api(`/api/admin/tickets?resource=blocked&email=${encodeURIComponent(normalized)}`, {
    method: "DELETE",
  });

  await Promise.all([loadBlocked(), loadTickets(), loadOrders()]);
  if (activeTicketId) {
    await openTicket(activeTicketId);
  }
}

async function loadBlocked() {
  if (!blockedList) return;

  const data = await api("/api/admin/tickets?resource=blocked");
  blockedList.innerHTML = "";

  if (!data.blocked?.length) {
    blockedList.innerHTML = `<p class="meta">No blocked customers.</p>`;
    return;
  }

  for (const row of data.blocked) {
    const item = document.createElement("article");
    item.className = "blocked-row";
    item.innerHTML = `
      <div class="blocked-row-top">
        <strong>${escapeHtml(row.email)}</strong>
        <span class="meta">${formatOrderDate(row.blocked_at)}</span>
      </div>
      ${row.reason ? `<p class="meta">${escapeHtml(row.reason)}</p>` : ""}
      <p class="meta">Source: ${escapeHtml(row.source || "manual")}</p>
      <button type="button" class="btn-secondary" data-unblock-email="${escapeHtml(row.email)}">Unblock</button>
    `;
    blockedList.appendChild(item);
  }

  blockedList.querySelectorAll("[data-unblock-email]").forEach((btn) => {
    btn.addEventListener("click", () => unblockCustomerEmail(btn.dataset.unblockEmail));
  });
}

function renderStars(rating) {
  return "★".repeat(rating) + "☆".repeat(5 - rating);
}

async function loadAdminReviews() {
  if (!adminReviewsList) return;

  const data = await api("/api/admin/products?resource=reviews");
  adminReviewsList.innerHTML = "";

  if (!data.reviews?.length) {
    adminReviewsList.innerHTML = `<p class="meta">No reviews yet.</p>`;
    return;
  }

  for (const review of data.reviews) {
    const row = document.createElement("article");
    row.className = "admin-review-row";
    row.innerHTML = `
      <div class="admin-review-top">
        <strong>${escapeHtml(review.reviewer_name)}</strong>
        <span class="meta">${renderStars(review.rating)}</span>
      </div>
      <p class="meta">${escapeHtml(review.product_label)} · ${formatOrderDate(review.created_at)}</p>
      ${review.customer_email ? `<p class="meta">${escapeHtml(review.customer_email)}</p>` : ""}
      <p class="admin-review-body">${escapeHtml(review.body)}</p>
      ${review.image_url ? `<img class="admin-review-photo" src="${escapeHtml(review.image_url)}" alt="Review photo">` : ""}
      <button type="button" class="btn-danger" data-delete-review="${review.id}">Delete review</button>
    `;
    adminReviewsList.appendChild(row);
  }

  adminReviewsList.querySelectorAll("[data-delete-review]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const reviewId = btn.dataset.deleteReview;
      if (!confirm("Delete this review permanently?")) return;

      btn.disabled = true;
      btn.textContent = "Deleting…";

      try {
        await api(`/api/admin/products?resource=reviews&reviewId=${encodeURIComponent(reviewId)}`, {
          method: "DELETE",
        });
        await loadAdminReviews();
      } catch (err) {
        alert(err.message || "Could not delete review");
        btn.disabled = false;
        btn.textContent = "Delete review";
      }
    });
  });
}

blockCustomerForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("block-email")?.value.trim();
  const reason = document.getElementById("block-reason")?.value.trim() || "";
  const btn = blockCustomerForm.querySelector("button[type=submit]");
  btn.disabled = true;

  try {
    await api("/api/admin/tickets?resource=blocked", {
      method: "POST",
      body: JSON.stringify({ email, reason, source: "manual" }),
    });
    blockCustomerForm.reset();
    await Promise.all([loadBlocked(), loadTickets(), loadOrders()]);
    if (activeTicketId) await openTicket(activeTicketId);
  } catch (err) {
    alert(err.message || "Could not block customer");
  } finally {
    btn.disabled = false;
  }
});

blockTicketBtn?.addEventListener("click", async () => {
  if (!activeTicket) return;
  if (activeTicket.is_blocked) {
    await unblockCustomerEmail(activeTicket.guest_email);
    return;
  }
  const reason = prompt("Reason for blocking (optional):") ?? "";
  await blockCustomerEmail(activeTicket.guest_email, { reason, source: "email" });
});

document.querySelectorAll("[data-mailbox]").forEach((tab) => {
  tab.addEventListener("click", async () => {
    activeMailbox = tab.dataset.mailbox;
    document.querySelectorAll("[data-mailbox]").forEach((btn) => {
      const active = btn.dataset.mailbox === activeMailbox;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    });
    activeTicketId = null;
    activeTicket = null;
    selectedTicketIds.clear();
    clearTicketDetail();
    updateBulkUi();
    await loadTickets();
  });
});

function clearSelection() {
  selectedTicketIds.clear();
  if (selectAllTickets) {
    selectAllTickets.checked = false;
    selectAllTickets.indeterminate = false;
  }
  updateBulkUi();
}

function updateBulkUi() {
  const count = selectedTicketIds.size;
  const inTrash = activeMailbox === "trash";

  selectedCountEl?.classList.toggle("hidden", count === 0);
  bulkActionsEl?.classList.toggle("hidden", count === 0);
  if (selectedCountEl) {
    selectedCountEl.textContent = `${count} selected`;
  }

  bulkArchiveBtn?.classList.toggle("hidden", inTrash);
  bulkRestoreBtn?.classList.toggle("hidden", !inTrash);

  if (selectAllTickets && visibleTicketIds.length) {
    selectAllTickets.checked = count > 0 && count === visibleTicketIds.length;
    selectAllTickets.indeterminate = count > 0 && count < visibleTicketIds.length;
  } else if (selectAllTickets) {
    selectAllTickets.checked = false;
    selectAllTickets.indeterminate = false;
  }
}

function toggleTicketSelection(ticketId, checked) {
  if (checked) selectedTicketIds.add(ticketId);
  else selectedTicketIds.delete(ticketId);
  updateBulkUi();

  ticketList.querySelectorAll(".ticket-item").forEach((row) => {
    row.classList.toggle("selected", selectedTicketIds.has(row.dataset.ticketId));
  });
}

selectAllTickets?.addEventListener("change", () => {
  selectedTicketIds.clear();
  if (selectAllTickets.checked) {
    for (const id of visibleTicketIds) selectedTicketIds.add(id);
  }
  updateBulkUi();
  loadTickets();
});

async function runTicketAction(action, ticketIds) {
  const ids = [...new Set(ticketIds.filter(Boolean))];
  if (!ids.length) return;

  const countLabel = ids.length === 1 ? "this message" : `${ids.length} messages`;

  if (action === "archive" && !confirm(`Move ${countLabel} to trash?`)) return;
  if (action === "delete_permanent" && !confirm(`Permanently delete ${countLabel}? This cannot be undone.`)) {
    return;
  }

  await api("/api/admin/tickets", {
    method: "PATCH",
    body: JSON.stringify({ ticketIds: ids, action }),
  });

  if (ids.includes(activeTicketId) && (action === "delete_permanent" || action === "archive")) {
    activeTicketId = null;
    activeTicket = null;
    clearTicketDetail();
  }

  if (action === "restore") {
    activeMailbox = "inbox";
    document.querySelectorAll("[data-mailbox]").forEach((btn) => {
      const active = btn.dataset.mailbox === "inbox";
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    });
    if (activeTicket) activeTicket.deleted_at = null;
    updateTicketActions();
  }

  clearSelection();
  await loadTickets();
  if (activeTicketId) {
    await openTicket(activeTicketId);
  }
}

bulkArchiveBtn?.addEventListener("click", () => runTicketAction("archive", [...selectedTicketIds]));
bulkRestoreBtn?.addEventListener("click", () => runTicketAction("restore", [...selectedTicketIds]));
bulkDeleteBtn?.addEventListener("click", () => runTicketAction("delete_permanent", [...selectedTicketIds]));

function clearTicketDetail() {
  ticketThread?.classList.add("hidden");
  ticketEmpty?.classList.remove("hidden");
  threadMessages.innerHTML = "";
  replyForm?.reset();
}

function updateTicketActions() {
  const inTrash = Boolean(activeTicket?.deleted_at) || activeMailbox === "trash";
  archiveTicketBtn?.classList.toggle("hidden", inTrash);
  restoreTicketBtn?.classList.toggle("hidden", !inTrash);
  replyForm?.classList.toggle("hidden", inTrash);

  if (blockTicketBtn && activeTicket) {
    if (activeTicket.is_blocked) {
      blockTicketBtn.textContent = "Unblock customer";
      blockTicketBtn.className = "btn-secondary";
    } else {
      blockTicketBtn.textContent = "Block customer";
      blockTicketBtn.className = "btn-danger";
    }
  }
}

async function loadTickets() {
  const data = await api(`/api/admin/tickets?view=${encodeURIComponent(activeMailbox)}`);
  ticketList.innerHTML = "";
  visibleTicketIds = (data.tickets ?? []).map((ticket) => ticket.id);

  if (!data.tickets?.length) {
    ticketList.innerHTML = `<p class="meta ticket-list-empty">${activeMailbox === "trash" ? "Trash is empty." : "No messages yet."}</p>`;
    updateBulkUi();
    return;
  }

  for (const ticket of data.tickets) {
    const row = document.createElement("div");
    row.className = "ticket-item";
    row.dataset.ticketId = ticket.id;
    if (ticket.id === activeTicketId) row.classList.add("active");
    if (selectedTicketIds.has(ticket.id)) row.classList.add("selected");

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "ticket-select";
    checkbox.checked = selectedTicketIds.has(ticket.id);
    checkbox.setAttribute("aria-label", `Select message from ${ticket.guest_name}`);
    checkbox.addEventListener("click", (e) => e.stopPropagation());
    checkbox.addEventListener("change", () => toggleTicketSelection(ticket.id, checkbox.checked));

    const body = document.createElement("button");
    body.type = "button";
    body.className = "ticket-item-body";
    body.innerHTML = `
      <div class="ticket-item-top">
        <strong>${escapeHtml(ticket.guest_name)}</strong>
        <span class="ticket-item-date">${formatOrderDate(ticket.last_message_at)}</span>
      </div>
      <p class="ticket-item-subject">${escapeHtml(ticket.subject)}</p>
      <p class="ticket-item-meta">${escapeHtml(ticket.guest_email)} · ${ticket.message_count || 0} message${ticket.message_count === 1 ? "" : "s"}${ticket.is_blocked ? " · Blocked" : ""}</p>
      <p class="ticket-item-preview">${escapeHtml(ticket.preview || "No preview")}</p>
    `;
    body.addEventListener("click", () => openTicket(ticket.id));

    row.append(checkbox, body);
    ticketList.appendChild(row);
  }

  updateBulkUi();
}

async function openTicket(ticketId) {
  activeTicketId = ticketId;
  const data = await api(`/api/admin/tickets?ticketId=${encodeURIComponent(ticketId)}`);
  activeTicket = data.ticket;

  threadSubject.textContent = data.ticket.subject;
  threadMeta.textContent = `${data.ticket.guest_name} · ${data.ticket.guest_email}`;
  threadDate.textContent = `Last activity ${formatOrderDate(data.ticket.last_message_at)}`;
  threadMessages.innerHTML = "";

  for (const msg of data.messages ?? []) {
    const div = document.createElement("div");
    div.className = `msg ${msg.sender_type}`;
    div.innerHTML = `
      <div class="msg-head">
        <strong>${msg.sender_type === "admin" ? "You" : escapeHtml(data.ticket.guest_name)}</strong>
        <span>${formatOrderDate(msg.created_at)}</span>
      </div>
      <div>${escapeHtml(msg.body)}</div>
    `;
    threadMessages.appendChild(div);
  }

  ticketEmpty.classList.add("hidden");
  ticketThread.classList.remove("hidden");
  updateTicketActions();
  await loadTickets();
}

async function ticketAction(action) {
  if (!activeTicketId) return;
  await runTicketAction(action, [activeTicketId]);
}

archiveTicketBtn?.addEventListener("click", () => ticketAction("archive"));
restoreTicketBtn?.addEventListener("click", () => ticketAction("restore"));
deleteTicketBtn?.addEventListener("click", () => ticketAction("delete_permanent"));

replyForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const message = document.getElementById("reply-body").value.trim();
  if (!activeTicketId || !message) return;

  const btn = replyForm.querySelector("button");
  btn.disabled = true;

  try {
    await api("/api/admin/tickets", {
      method: "POST",
      body: JSON.stringify({ ticketId: activeTicketId, message }),
    });
    document.getElementById("reply-body").value = "";
    await openTicket(activeTicketId);
  } catch (err) {
    alert(err.message || "Could not send reply");
  } finally {
    btn.disabled = false;
  }
});
function formatOrderDate(value) {
  try {
    return new Date(value).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function toLocalInputValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

document.querySelectorAll("[data-orders-tab]").forEach((tab) => {
  tab.addEventListener("click", async () => {
    activeOrdersTab = tab.dataset.ordersTab;
    document.querySelectorAll("[data-orders-tab]").forEach((btn) => {
      const active = btn.dataset.ordersTab === activeOrdersTab;
      btn.classList.toggle("active", active);
      btn.setAttribute("aria-selected", active ? "true" : "false");
    });
    ordersHint.textContent =
      activeOrdersTab === "pickup"
        ? "Raleigh, NC Pickup orders must be collected within 3 days of the ready email (weekends included). Mark picked up when collected, or use Refund customer in Stripe after 3 days."
        : "Ship orders from Stripe. Prepare and ship to the address collected at checkout.";
    await loadOrders();
  });
});

async function loadOrders() {
  if (!orderList) return;

  const data = await api(`/api/admin/orders?fulfillment=${encodeURIComponent(activeOrdersTab)}`);
  orderList.innerHTML = "";

  if (!data.orders?.length) {
    orderList.innerHTML = `<p class="meta">No ${activeOrdersTab} orders yet.</p>`;
    return;
  }

  for (const order of data.orders) {
    const row = document.createElement("article");
    row.className = "order-row";

    const statusParts = [];
    if (order.is_blocked) statusParts.push("Blocked customer");
    else if (order.is_refunded) statusParts.push("Refunded");
    else if (order.is_picked_up) statusParts.push("Picked up");
    else if (order.can_refund) statusParts.push("3+ days — refund available");
    else if (activeOrdersTab === "pickup" && order.is_ready) statusParts.push("Ready — customer emailed");
    else if (activeOrdersTab === "pickup") statusParts.push("Awaiting pickup prep");
    else statusParts.push("Needs shipping");

    const deadlineLine =
      activeOrdersTab === "pickup" && !order.is_refunded && !order.is_picked_up
        ? order.can_refund
          ? `<p class="meta order-deadline expired">Pickup window ended — refund this order in Stripe.</p>`
          : `<p class="meta order-deadline">${order.pickup_days_remaining} day${order.pickup_days_remaining === 1 ? "" : "s"} left to pick up</p>`
        : "";

    row.innerHTML = `
      <div class="order-row-top">
        <strong>${order.customer_name || "Customer"}</strong>
        <span class="order-badge${order.can_refund ? " order-badge-warn" : ""}">${statusParts[0]}</span>
      </div>
      <p class="meta">${order.product_label} · ${order.amount_display}</p>
      <p class="meta">${order.customer_email}</p>
      <p class="meta">Ordered ${formatOrderDate(order.created_at)}</p>
      ${deadlineLine}
    `;

    if (activeOrdersTab === "pickup" && !order.is_refunded) {
      const actions = document.createElement("div");
      actions.className = "order-actions";

      if (order.can_refund) {
        actions.innerHTML = `
          <button type="button" class="order-refund-btn" data-refund="${order.id}">Refund customer in Stripe</button>
        `;
      } else if (!order.is_picked_up && order.is_ready) {
        actions.innerHTML = `
          <p class="meta order-ready-note">Ready since ${formatOrderDate(order.pickup_ready_at)}${order.pickup_scheduled_at ? ` · Suggested: ${formatOrderDate(order.pickup_scheduled_at)}` : ""}</p>
          <button type="button" class="order-picked-up-btn" data-picked-up="${order.id}">Mark as picked up</button>
        `;
      } else if (!order.is_picked_up && !order.is_ready) {
        actions.innerHTML = `
          <label class="meta" for="pickup-time-${order.id}">Suggested pickup time (optional)</label>
          <input class="pickup-time" id="pickup-time-${order.id}" type="datetime-local" value="${toLocalInputValue(order.pickup_scheduled_at)}">
          <label class="meta" for="pickup-notes-${order.id}">Pickup details for customer (address, time, etc.)</label>
          <textarea class="pickup-notes" id="pickup-notes-${order.id}" rows="2" placeholder="Pickup address, time window, or other details for the customer.">${order.pickup_notes ?? ""}</textarea>
          <button type="button" class="order-ready-btn" data-ready="${order.id}">Mark ready & email customer</button>
        `;
      } else if (order.is_picked_up) {
        actions.innerHTML = `<p class="meta order-ready-note">Picked up ${formatOrderDate(order.picked_up_at)}</p>`;
      }

      row.appendChild(actions);
    }

    const customerActions = document.createElement("div");
    customerActions.className = "order-customer-actions";
    if (order.is_blocked) {
      customerActions.innerHTML = `
        <button type="button" class="btn-secondary order-unblock-btn" data-unblock-email="${escapeHtml(order.customer_email)}">Unblock customer</button>
      `;
    } else {
      customerActions.innerHTML = `
        <button type="button" class="btn-danger order-block-btn" data-block-email="${escapeHtml(order.customer_email)}">Block customer</button>
      `;
    }
    row.appendChild(customerActions);

    orderList.appendChild(row);
  }

  orderList.querySelectorAll("[data-block-email]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const reason = prompt("Reason for blocking (optional):") ?? "";
      await blockCustomerEmail(btn.dataset.blockEmail, { reason, source: "order" });
    });
  });

  orderList.querySelectorAll("[data-unblock-email]").forEach((btn) => {
    btn.addEventListener("click", () => unblockCustomerEmail(btn.dataset.unblockEmail));
  });

  orderList.querySelectorAll("[data-ready]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const orderId = btn.dataset.ready;
      const timeInput = orderList.querySelector(`#pickup-time-${orderId}`);
      const notesInput = orderList.querySelector(`#pickup-notes-${orderId}`);
      const pickupScheduledAt = timeInput?.value ? new Date(timeInput.value).toISOString() : null;
      const pickupNotes = notesInput?.value?.trim() || null;

      btn.disabled = true;
      btn.textContent = "Sending…";

      try {
        await api("/api/admin/orders", {
          method: "POST",
          body: JSON.stringify({
            orderId,
            action: "mark_ready_for_pickup",
            pickupScheduledAt,
            pickupNotes,
          }),
        });
        await loadOrders();
      } catch (err) {
        alert(err.message || "Could not mark order ready");
        btn.disabled = false;
        btn.textContent = "Mark ready & email customer";
      }
    });
  });

  orderList.querySelectorAll("[data-picked-up]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const orderId = btn.dataset.pickedUp;
      btn.disabled = true;
      btn.textContent = "Saving…";

      try {
        await api("/api/admin/orders", {
          method: "POST",
          body: JSON.stringify({ orderId, action: "mark_picked_up" }),
        });
        await loadOrders();
      } catch (err) {
        alert(err.message || "Could not mark order picked up");
        btn.disabled = false;
        btn.textContent = "Mark as picked up";
      }
    });
  });

  orderList.querySelectorAll("[data-refund]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const orderId = btn.dataset.refund;
      if (!confirm("Refund this customer in Stripe? Inventory will be restored automatically.")) return;

      btn.disabled = true;
      btn.textContent = "Refunding…";

      try {
        await api("/api/admin/orders", {
          method: "POST",
          body: JSON.stringify({ orderId, action: "refund_stripe" }),
        });
        await loadOrders();
      } catch (err) {
        alert(err.message || "Could not refund order");
        btn.disabled = false;
        btn.textContent = "Refund customer in Stripe";
      }
    });
  });
}

async function loadProducts() {
  const data = await api("/api/admin/products");
  productList.innerHTML = "";

  for (const product of data.products ?? []) {
    const row = document.createElement("div");
    row.className = "product-row";
    row.innerHTML = `
      <strong>${product.label || product.name}</strong>
      <span class="meta">${product.in_stock ? "In stock" : "Out of stock"}${product.inventory_count != null ? ` · ${product.inventory_count} left` : " · unlimited"}</span>
      <div class="inventory-field">
        <label class="meta" for="count-${product.product_key}">Count</label>
        <div class="inventory-input-wrap">
          <input class="inventory-count" id="count-${product.product_key}" type="number" min="0" data-count-for="${product.product_key}" value="${product.inventory_count ?? ""}" placeholder="∞">
        </div>
        <span class="meta inventory-hint">Blank = unlimited</span>
      </div>
      <label class="meta"><input type="checkbox" data-autostop-for="${product.product_key}" ${product.auto_stop ? "checked" : ""}> Auto-stop sales at 0</label>
      <div class="product-actions">
        <button type="button" data-save="${product.product_key}">Save</button>
        <button type="button" class="secondary" data-notify="${product.product_key}">Email waitlist</button>
      </div>
    `;
    productList.appendChild(row);
  }

  productList.querySelectorAll("[data-save]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const key = btn.dataset.save;
      const countInput = productList.querySelector(`[data-count-for="${key}"]`);
      const autoStop = productList.querySelector(`[data-autostop-for="${key}"]`);
      const inventory_count = countInput.value.trim() === "" ? null : Number(countInput.value);

      btn.disabled = true;
      try {
        const result = await api("/api/admin/products", {
          method: "PATCH",
          body: JSON.stringify({
            productKey: key,
            inventory_count,
            auto_stop: autoStop.checked,
          }),
        });
        await loadProducts();
        if (result.notified > 0) {
          alert(`Saved. Sent ${result.notified} back-in-stock email(s) automatically.`);
        }
      } catch (err) {
        alert(err.message || "Could not save");
      } finally {
        btn.disabled = false;
      }
    });
  });

  productList.querySelectorAll("[data-notify]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        const result = await api("/api/admin/products", {
          method: "POST",
          body: JSON.stringify({ productKey: btn.dataset.notify, action: "notify_waitlist" }),
        });
        alert(`Sent ${result.notified} back-in-stock email(s).`);
      } catch (err) {
        alert(err.message || "Could not notify waitlist");
      } finally {
        btn.disabled = false;
      }
    });
  });
}

function updateCuringPreview(message) {
  if (!curingPreview) return;
  curingPreview.textContent = message ? `Shop message: ${message}` : "Shop message will be hidden when curing is off.";
}

async function loadCuringSettings() {
  if (!curingForm) return;
  const data = await api("/api/admin/curing");
  const curing = data.curing ?? {};
  if (curingActive) curingActive.checked = Boolean(curing.is_curing);
  if (curingReadyDate) curingReadyDate.value = curing.ready_date || "";
  updateCuringPreview(curing.message || "");
}

curingForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = curingForm.querySelector("button[type=submit]");
  btn.disabled = true;

  try {
    const result = await api("/api/admin/curing", {
      method: "PATCH",
      body: JSON.stringify({
        is_curing: curingActive?.checked ?? false,
        ready_date: curingReadyDate?.value,
      }),
    });
    updateCuringPreview(result.curing?.message || "");
    alert("Curing settings saved.");
  } catch (err) {
    alert(err.message || "Could not save curing settings");
  } finally {
    btn.disabled = false;
  }
});

checkSession();
