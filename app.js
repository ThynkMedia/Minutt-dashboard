// app.js - MINUTT Admin (stable)
// Replace this file entirely. Uses Supabase JS ESM CDN.

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

// ---------- CONFIG (keep your keys)
const SUPABASE_URL = "https://dhfllljsncnjelftzisk.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRoZmxsbGpzbmNuamVsZnR6aXNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc4ODczOTUsImV4cCI6MjA2MzQ2MzM5NX0.EFl0NEiMwp3qM_hX_iFJoZHgV2EEERfpSmmBhjTZNuE";

let supabase = null;
try {
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  window.supabase = supabase;
} catch (err) {
  console.error("Failed to init Supabase client:", err);
  // show UI message
  document.addEventListener("DOMContentLoaded", () => {
    const c = document.getElementById("ordersContainer");
    if (c) c.innerHTML = "<p style='color:red'>Data client failed to initialize - check console.</p>";
  });
}

// ---------- small helpers
async function fetchRiders() {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase.from("riders").select("*");
    if (error) { console.warn("fetchRiders error:", error); return []; }
    return data || [];
  } catch (e) {
    console.error("fetchRiders exception:", e);
    return [];
  }
}

function safeParseItems(order) {
  try {
    if (!order) return [];
    if (Array.isArray(order.order_items)) return order.order_items;
    if (typeof order.order_items === "string") return JSON.parse(order.order_items);
    if (Array.isArray(order.items)) return order.items;
    if (typeof order.items === "string") return JSON.parse(order.items);
  } catch (e) {
    console.error("safeParseItems:", e);
  }
  return [];
}

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;");
}

// ---------- UI helpers
window.showSection = function(sectionId) {
  document.querySelectorAll(".section").forEach(s => s.classList.remove("active"));
  const sec = document.getElementById(sectionId);
  if (sec) sec.classList.add("active");
  document.querySelectorAll(".sidebar a").forEach(a => a.classList.remove("active-link"));
  const map = { ordersSection: "ordersLink", productsSection: "productsLink", categoriesSection: "categoriesLink", settingsSection: "settingsLink" };
  const lid = map[sectionId];
  if (lid) document.getElementById(lid)?.classList.add("active-link");
};

// ---------- Toast (non-blocking)
function showToast(message, ms = 1200) {
  const root = document.getElementById("toastRoot");
  if (!root) return;
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = message;
  root.appendChild(t);
  // show
  requestAnimationFrame(()=> t.classList.add("show"));
  setTimeout(()=> { t.classList.remove("show"); setTimeout(()=> t.remove(), 220); }, ms);
}

// ---------- Orders (Option C polling)
let lastSeenTopId = null;
let pollHandle = null;
const POLL_MS = 8000;

async function renderOrders(orders) {
  const container = document.getElementById("ordersContainer");
  if (!container) return;
  container.innerHTML = "";

  const quickEl = document.getElementById("quickFilter");
  const searchEl = document.getElementById("searchInput");
  const statusEl = document.getElementById("statusFilter");
  const quick = quickEl ? quickEl.value : "all";
  const search = searchEl ? searchEl.value.trim().toLowerCase() : "";
  const statusFilterValue = statusEl ? statusEl.value : "";

  const riders = await fetchRiders();

  const filtered = (orders || []).filter(order => {
    if (statusFilterValue && String(order.status) !== statusFilterValue) return false;
    if (quick === "today") {
      if (!order.created_at) return false;
      if (new Date(order.created_at).toDateString() !== new Date().toDateString()) return false;
    } else if (quick === "pending") {
      if (!["confirmed","assigned","out_for_delivery"].includes(order.status)) return false;
    } else if (quick === "delivered") {
      if (order.status !== "delivered") return false;
    }
    if (search) {
      const needles = [String(order.order_number||"").toLowerCase(), String(order.customer_name||"").toLowerCase(), String(order.customer_phone||"").toLowerCase()];
      if (!needles.some(n => n.includes(search))) return false;
    }
    return true;
  });

  if (!filtered.length) {
    container.innerHTML = "<p>No orders found</p>";
    return;
  }

  filtered.forEach(order => {
    const items = safeParseItems(order) || [];
    const displayId = order.order_number || order.id;
    const domId = `order-${order.id}`;
    const total = order.order_amount ?? order.total ?? 0;
    const isDelivered = order.status === "delivered";
    fetchOrdersFromServer({ render: true }).then(() => {
  startBackgroundPoll();
});


    // build items HTML
    let itemsHtml = "";
    if (items.length) {
      items.forEach(item => {
        const name = escapeHtml(item.name || item.product_name || "Unnamed");
        const price = Number(item.price || 0);
        const qty = Number(item.quantity ?? item.cartQuantity ?? 1);
        const img = escapeHtml(item.imageUrl || item.image_url || "");
        itemsHtml += '<div class="order-item">' +
                       `<img src="${img}" class="item-img" />` +
                       '<div class="item-info">' +
                         `<p class="item-name">${name}</p>` +
                         `<p class="item-meta">₹${price} × ${qty}</p>` +
                       '</div>' +
                       `<div class="item-total">₹${price * qty}</div>` +
                     '</div>';
      });
    } else {
      itemsHtml = "<p>No items found</p>";
    }

    const deliveredBadge = isDelivered ? '<span class="delivered-badge">✔ Delivered</span>' : "";

    // insert card
    const cardHtml =
      '<div class="order-card" id="' + domId + '">' +
        '<div class="order-header">' +
          '<div style="flex:1;">' +
            '<h3>Order #' + escapeHtml(String(displayId)) + '</h3>' +
            '<div class="meta">' +
              '<div><strong>' + escapeHtml(order.customer_name || "-") + '</strong></div>' +
              '<div>' + escapeHtml(order.customer_phone || "-") + '</div>' +
              '<div style="max-width:560px">' + escapeHtml(order.customer_address || "-") + '</div>' +
            '</div>' +
          '</div>' +
          '<div style="text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:8px;">' +
            '<div style="font-weight:800">₹' + escapeHtml(String(total)) + '</div>' +
            '<div style="display:flex;gap:8px;align-items:center;">' +
              '<div class="item-badge">' + items.length + ' items</div>' +
              deliveredBadge +
            '</div>' +
          '</div>' +
        '</div>' +

        '<div style="margin-top:10px;">' +
          '<button class="btn-outline small" onclick="toggleItems(this,' + order.id + ')">Show Items</button>' +
          '<button class="btn-outline small" onclick="printInvoice(' + order.id + ')">Print Invoice</button>' +
          '<label style="margin-left:12px;"><strong>Assign Rider:</strong></label>' +
          '<select onchange="assignRider(' + order.id + ', this.value)">' +
            '<option value="">-- Select Rider --</option>' +
            riders.map(r => '<option value="' + r.id + '"' + (order.rider_id === r.id ? ' selected' : '') + '>' + escapeHtml(r.name + ' (' + (r.status||'') + ')') + '</option>').join('') +
          '</select>' +
          '<div class="order-actions" style="margin-top:8px;">' +
            '<button class="delivered-btn" onclick="markDelivered(' + order.id + ')">Mark as Delivered</button>' +
            '<button class="delete-btn" onclick="deleteOrder(' + order.id + ')">Delete Order</button>' +
          '</div>' +
        '</div>' +

        '<div id="items-block-' + order.id + '" class="items-container">' +
          '<div class="order-items">' + itemsHtml + '</div>' +
        '</div>' +
      '</div>';

    container.insertAdjacentHTML("beforeend", cardHtml);
  });
}

async function fetchOrdersFromServer({ render = true } = {}) {
  if (!supabase) return [];
  try {
    const statusEl = document.getElementById("statusFilter");
    let query = supabase.from("orders").select("*").order("created_at", { ascending: false });
    if (statusEl && statusEl.value) query = query.eq("status", statusEl.value);

    const { data: orders, error } = await query;
    if (error) {
      console.error("fetchOrdersFromServer error:", error);
      if (render) {
        const c = document.getElementById("ordersContainer");
        if (c) c.innerHTML = "<p style='color:red'>Error loading orders</p>";
      }
      return [];
    }
    // ---------- Option C: smart background poll (non-intrusive)
// Plays sound instantly, shows small toast (no alert), and re-renders only when new order arrives.
// It avoids re-rendering while user is interacting with inputs.
let _optionC_pollHandle = null;
const _optionC_POLL_MS = 5000; // poll interval (ms)
let _optionC_lastTopId = lastSeenTopId;

// start background poll (Option C)
function startBackgroundPoll() {
  // clear any existing
  if (_optionC_pollHandle) clearInterval(_optionC_pollHandle);

  _optionC_pollHandle = setInterval(async () => {
    try {
      if (!supabase) return;

      // check only top-most id — lightweight query
      const { data: rows, error } = await supabase
        .from("orders")
        .select("id, order_number, created_at")
        .order("created_at", { ascending: false })
        .limit(1);

      if (error) {
        console.warn("OptionC poll error:", error);
        return;
      }

      const topId = rows && rows.length ? (rows[0].id || rows[0].order_number) : null;

      // detect user interaction: do NOT re-render while user typing/selecting
      const userInteracting = document.activeElement && ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName);

      // if first run, initialize last id but DON'T fire a notification
      if (_optionC_lastTopId == null) {
        _optionC_lastTopId = topId;
        lastSeenTopId = topId; // keep in sync with existing variable
        return;
      }

      // If top id changed and user is NOT interacting -> new order arrived
      if (topId && topId !== _optionC_lastTopId && !userInteracting) {
        _optionC_lastTopId = topId;
        lastSeenTopId = topId;

        // play the sound immediately (non-blocking)
        const audioEl = document.getElementById("newOrderAudio");
        if (audioEl) {
          audioEl.currentTime = 0;
          audioEl.play().catch((err) => {
            // if blocked, show enable sound button if present
            console.warn("Playback blocked:", err);
            const btn = document.getElementById("enableSoundBtn");
            if (btn) btn.style.display = "inline-block";
          });
        }

        // small toast (non-blocking)
        try { showToast("🔔 New order received"); } catch (e) {}

        // re-fetch & render orders
        try {
          await fetchOrdersFromServer({ render: true });
        } catch (e) {
          console.error("OptionC fetchOrdersFromServer failed:", e);
        }
      }
    } catch (err) {
      console.error("OptionC polling exception:", err);
    }
  }, _optionC_POLL_MS);
}

// Helper to stop polling (if needed)
function stopBackgroundPoll() {
  if (_optionC_pollHandle) {
    clearInterval(_optionC_pollHandle);
    _optionC_pollHandle = null;
  }
}


    const topId = orders && orders.length ? (orders[0].id || orders[0].order_number) : null;
    if (render) {
      await renderOrders(orders);
      lastSeenTopId = topId;
    }
    return orders || [];
  } catch (e) {
    console.error("fetchOrdersFromServer exception:", e);
    return [];
  }
}

// background poll (Option C): only render when top id changed and user is not interacting
function startBackgroundPoll() {
  if (!supabase) return;
  if (pollHandle) clearInterval(pollHandle);
  pollHandle = setInterval(async () => {
    try {
      const { data: rows } = await supabase.from("orders").select("id, order_number").order("created_at", { ascending: false }).limit(1);
      const topId = rows && rows.length ? (rows[0].id || rows[0].order_number) : null;
      const userInteracting = document.activeElement && ["INPUT","SELECT","TEXTAREA"].includes(document.activeElement.tagName);
      if (topId && topId !== lastSeenTopId && !userInteracting) {
        // play sound + toast only (no blocking alert)
        const audio = document.getElementById("newOrderAudio");
        // ---------- Mobile autoplay / audio resume helper ----------
// Paste this after your audio <audio id="newOrderAudio"> exists and after any gain/AudioContext setup.

(function setupMobileAudioResume() {
  const audioEl = document.getElementById("newOrderAudio");
  if (!audioEl) return;

  // Ensure playsinline attribute for iOS
  audioEl.setAttribute("playsinline", "");
  audioEl.setAttribute("webkit-playsinline", "");

  // Create (or reuse) AudioContext + GainNode if not already created
  // If you already created ctx/gain earlier, reuse them by checking window._minuttAudioCtx
  let ctx = window._minuttAudioCtx || null;
  let gain = window._minuttGainNode || null;
  try {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      window._minuttAudioCtx = ctx;
    }
    if (!gain) {
      const src = ctx.createMediaElementSource(audioEl);
      gain = ctx.createGain();
      gain.gain.value = 1.0; // change if you used amplification earlier (e.g. 2.0)
      src.connect(gain).connect(ctx.destination);
      window._minuttGainNode = gain;
    }
  } catch (e) {
    // createMediaElementSource may throw if audio element already connected; ignore
    console.warn("AudioContext creation issue (safe to ignore if already connected):", e);
  }

  // Helper to attempt playing a short silent sound to check autoplay permission
  async function tryPlayTestSound() {
    try {
      // small friendly beep or just try to play audioEl for a tiny fraction
      audioEl.currentTime = 0;
      // Do not call play() repeatedly; this is just a permission probe
      await audioEl.play();
      audioEl.pause();
      return true;
    } catch (err) {
      return false;
    }
  }

  // Called after user gesture to resume the audio context & enable future audio
  async function resumeAudioFromGesture() {
    try {
      if (ctx && ctx.state === "suspended") {
        await ctx.resume();
      }
    } catch (e) {
      console.warn("AudioContext resume failed:", e);
    }
    // Try to play a tiny probe to ensure audio will play later
    try {
      audioEl.currentTime = 0;
      await audioEl.play().catch(()=>{});
      audioEl.pause();
    } catch (e) {
      // ignore
    }

    // hide enable button if present
    const btn = document.getElementById("enableSoundBtn");
    if (btn) btn.style.display = "none";

    // remove one-time listeners
    window.removeEventListener("touchstart", resumeAudioFromGesture, {passive:true});
    window.removeEventListener("click", resumeAudioFromGesture, {passive:true});
  }

  // On mobile browsers, test whether auto-play is allowed
  (async () => {
    const ok = await tryPlayTestSound();
    if (ok) {
      // autoplay allowed; no UI needed
      const btn = document.getElementById("enableSoundBtn");
      if (btn) btn.style.display = "none";
      return;
    }

    // autoplay blocked: show enable button and also attach global first-touch resume
    const btn = document.getElementById("enableSoundBtn");
    if (btn) {
      btn.style.display = "inline-block";
      btn.addEventListener("click", async () => {
        await resumeAudioFromGesture();
        showToast("Sound enabled");
      });
    }

    // Also resume on first touch/click anywhere (helpful: user might tap elsewhere)
    window.addEventListener("touchstart", resumeAudioFromGesture, {passive:true});
    window.addEventListener("click", resumeAudioFromGesture, {passive:true});
  })();
})();

        if (audio) { audio.currentTime = 0; audio.play().catch(()=>{}); }
        showToast("🔔 New order received!");
        // re-render orders
        await fetchOrdersFromServer({ render: true });
      }
    } catch (e) {
      console.error("background poll error:", e);
    }
  }, POLL_MS);
}

// ---------- actions
window.toggleItems = function(btn, orderId) {
  try {
    let el = null;
    if (orderId !== undefined && orderId !== null) el = document.getElementById("items-block-" + orderId);
    if (!el && btn && btn.closest) {
      const card = btn.closest(".order-card");
      if (card) el = card.querySelector(".items-container");
    }
    if (!el) el = document.querySelector(".items-container");
    if (!el) return;
    const open = el.classList.toggle("open");
    if (btn) btn.textContent = open ? "Hide Items" : "Show Items";
  } catch (e) {
    console.error("toggleItems error:", e);
  }
};

window.assignRider = async function(orderId, riderId) {
  if (!orderId) return;
  if (!riderId) return;
  try {
    const { error } = await supabase.from("orders").update({ rider_id: riderId, status: "assigned", assigned_at: new Date().toISOString() }).eq("id", orderId);
    if (error) return console.warn("assignRider failed:", error);
    // update rider status best-effort
    await supabase.from("riders").update({ status: "busy" }).eq("id", riderId).catch(()=>{});
    fetchOrdersFromServer({ render: true });
  } catch (e) {
    console.error("assignRider exception:", e);
  }
};

window.markDelivered = async function(orderId) {
  if (!orderId) return;
  try {
    const { error } = await supabase.from("orders").update({ status: "delivered", delivered_at: new Date().toISOString() }).eq("id", orderId);
    if (error) return console.warn("markDelivered failed:", error);
    const card = document.getElementById("order-" + orderId);
    if (card && !card.querySelector(".delivered-badge")) {
      const b = document.createElement("span");
      b.className = "delivered-badge";
      b.textContent = "✔ Delivered";
      card.querySelector(".order-header").appendChild(b);
    }
    fetchOrdersFromServer({ render: true });
  } catch (e) {
    console.error("markDelivered:", e);
  }
};

window.deleteOrder = async function(orderId) {
  if (!orderId) return;
  if (!confirm("Delete this order permanently?")) return;
  try {
    const { error } = await supabase.from("orders").delete().eq("id", orderId);
    if (error) return console.warn("deleteOrder failed:", error);
    const card = document.getElementById("order-" + orderId);
    if (card) card.remove();
    fetchOrdersFromServer({ render: true });
  } catch (e) {
    console.error("deleteOrder:", e);
  }
};

window.printInvoice = function(orderId) {
  try {
    const card = document.getElementById("order-" + orderId);
    if (!card) return;
    const title = card.querySelector("h3")?.textContent || `Order ${orderId}`;
    const meta = card.querySelectorAll(".meta div");
    const name = meta[0]?.textContent || "";
    const phone = meta[1]?.textContent || "";
    const address = meta[2]?.textContent || "";
    const itemsBlock = card.querySelector(".order-items");
    const itemsHTML = itemsBlock ? itemsBlock.outerHTML : "<p>No items</p>";

    const win = window.open("", "_blank", "width=800,height=900");
    if (!win) return;
    // write a plain-safe string (no template literal injections)
    const html = '<html><head><title>' + escapeHtml(title) + '</title>' +
      '<style>body{font-family:Arial;padding:16px}.line{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px dashed #ddd;}</style>' +
      '</head><body>' +
      '<h2>' + escapeHtml(title) + '</h2>' +
      '<div class="line"><strong>Customer</strong><div>' + escapeHtml(name) + '</div></div>' +
      '<div class="line"><strong>Phone</strong><div>' + escapeHtml(phone) + '</div></div>' +
      '<div class="line"><strong>Address</strong><div>' + escapeHtml(address) + '</div></div>' +
      '<h3>Items</h3>' + itemsHTML +
      '<script>window.onload=function(){window.print();}</script>' +
      '</body></html>';
    win.document.open();
    win.document.write(html);
    win.document.close();
  } catch (e) {
    console.error("printInvoice error:", e);
  }
};

// ---------- initial wiring
document.addEventListener("DOMContentLoaded", () => {
  const refreshBtn = document.getElementById("refreshBtn");
  const searchInput = document.getElementById("searchInput");
  const statusFilter = document.getElementById("statusFilter");
  const quickFilter = document.getElementById("quickFilter");

  if (refreshBtn) refreshBtn.addEventListener("click", () => fetchOrdersFromServer({ render: true }));
  if (searchInput) searchInput.addEventListener("input", () => fetchOrdersFromServer({ render: true }));
  if (statusFilter) statusFilter.addEventListener("change", () => fetchOrdersFromServer({ render: true }));
  if (quickFilter) quickFilter.addEventListener("change", () => fetchOrdersFromServer({ render: true }));

  // load other sections
  fetchCategories();
  fetchProducts();
  fetchCategoriesDropdown();
  fetchDeliveryFee();
  fetchBanner();

  // initial fetch & start polling
  fetchOrdersFromServer({ render: true }).then(() => startBackgroundPoll());
});

// ---------- categories / products / settings / banner
async function fetchCategories() {
  if (!supabase) return;
  try {
    const tableBody = document.getElementById("categories-table-body");
    if (!tableBody) return;
    const { data, error } = await supabase.from("categories").select("*").order("created_at", { ascending: false });
    if (error) { tableBody.innerHTML = `<tr><td colspan="5">Error loading categories</td></tr>`; return; }
    tableBody.innerHTML = "";
    (data || []).forEach(cat => {
      const row = document.createElement("tr");
      row.innerHTML = '<td>' + cat.id + '</td>' +
                      '<td>' + escapeHtml(cat.name) + '</td>' +
                      '<td>' + escapeHtml(cat.description || "") + '</td>' +
                      '<td><img src="' + escapeHtml(cat.image_url || "") + '" width="50" /></td>' +
                      '<td><button onclick="editCategory(' + cat.id + ')">✏ Edit</button> <button onclick="deleteCategory(' + cat.id + ')">🗑 Delete</button></td>';
      tableBody.appendChild(row);
    });
  } catch (e) { console.error("fetchCategories:", e); }
}

async function fetchCategoriesDropdown() {
  if (!supabase) return;
  try {
    const dropdown = document.getElementById("productCategory");
    if (!dropdown) return;
    const { data } = await supabase.from("categories").select("*");
    dropdown.innerHTML = "";
    (data || []).forEach(cat => {
      const opt = document.createElement("option");
      opt.value = cat.id;
      opt.textContent = cat.name;
      dropdown.appendChild(opt);
    });
  } catch (e) { console.error("fetchCategoriesDropdown:", e); }
}

async function fetchProducts() {
  if (!supabase) return;
  try {
    const tableBody = document.getElementById("products-table-body");
    if (!tableBody) return;
    const { data, error } = await supabase.from("products").select("*, categories(name)").order("created_at", { ascending: false });
    if (error) { tableBody.innerHTML = `<tr><td colspan="9">Error loading products</td></tr>`; return; }
    tableBody.innerHTML = "";
    (data || []).forEach(product => {
      const row = document.createElement("tr");
      row.innerHTML = '<td>' + product.id + '</td>' +
                      '<td>' + escapeHtml(product.name) + '</td>' +
                      '<td>' + escapeHtml(product.description || "") + '</td>' +
                      '<td>₹' + (product.price || 0) + '</td>' +
                      '<td><img src="' + escapeHtml(product.image_url || "") + '" width="50" /></td>' +
                      '<td>' + escapeHtml(product.categories ? product.categories.name : "Uncategorized") + '</td>' +
                      '<td>' + escapeHtml(String(product.stock || "")) + '</td>' +
                      '<td>' + escapeHtml(product.status || "") + '</td>';
      tableBody.appendChild(row);
    });
  } catch (e) { console.error("fetchProducts:", e); }
}

async function fetchDeliveryFee() {
  if (!supabase) return;
  try {
    const el = document.getElementById("deliveryFee");
    if (!el) return;
    const { data, error } = await supabase.from("settings").select("*").eq("key", "delivery_fee").limit(1);
    if (error) { console.warn("fetchDeliveryFee error:", error); return; }
    if (data && data.length > 0) el.value = data[0].value;
  } catch (e) { console.error("fetchDeliveryFee:", e); }
}

async function fetchBanner() {
  if (!supabase) return;
  try {
    const preview = document.getElementById("bannerPreview");
    if (!preview) return;
    const { data, error } = await supabase.from("banners").select("*").order("created_at", { ascending: false }).limit(1);
    if (error) { console.warn("fetchBanner error:", error); return; }
    if (data && data.length > 0) preview.innerHTML = '<img src="' + escapeHtml(data[0].image_url || "") + '" width="200" /> <p><strong>' + escapeHtml(data[0].title || "") + '</strong></p>';
    else preview.innerHTML = "<p>No banner uploaded yet.</p>";
  } catch (e) { console.error("fetchBanner:", e); }
  // ---------- Robust delegated handlers for Show Items / Print Invoice
(function attachDelegatedHandlers() {
  const container = document.getElementById("ordersContainer");
  if (!container) {
    console.warn("ordersContainer not found — delegated handlers not attached");
    return;
  }

  container.addEventListener("click", (ev) => {
    const btn = ev.target.closest("button");
    if (!btn) return;

    // ---------- SHOW / HIDE ITEMS
    const text = (btn.textContent || "").trim().toLowerCase();

    if (text.startsWith("show items") || text.startsWith("hide items")) {
      // find the nearest order card
      const card = btn.closest(".order-card");
      if (!card) {
        console.warn("toggle: order-card not found for button", btn);
        return;
      }

      // Prefer explicit items block id; fallback to .items-container inside card
      let itemsBlock = null;
      // try id pattern items-block-<id> if present on card id
      const cardId = card.id; // expected order-<id>
      if (cardId && cardId.startsWith("order-")) {
        const idPart = cardId.slice("order-".length);
        itemsBlock = document.getElementById(`items-block-${idPart}`);
      }
      if (!itemsBlock) itemsBlock = card.querySelector(".items-container");
      if (!itemsBlock) {
        console.warn("toggle: items container not found inside card", card);
        return;
      }

      const isOpen = itemsBlock.classList.toggle("open");
      btn.textContent = isOpen ? "Hide Items" : "Show Items";
      return;
    }

    // ---------- PRINT INVOICE
    if (text.startsWith("print invoice")) {
      // find nearest order card
      const card = btn.closest(".order-card");
      if (!card) return console.warn("print: order-card not found");

      const title = card.querySelector("h3")?.textContent || "Order";
      const meta = card.querySelectorAll(".meta div");
      const name = meta[0]?.textContent || "";
      const phone = meta[1]?.textContent || "";
      const address = meta[2]?.textContent || "";
      const itemsBlock = card.querySelector(".order-items");
      const itemsHTML = itemsBlock ? itemsBlock.outerHTML : "<p>No items</p>";
      const totalEl = card.querySelector(".order-header [style]")?.textContent || "";

      // open print window and write HTML safely (avoid template literal injections)
      const win = window.open("", "_blank", "width=800,height=900");
      if (!win) {
        console.warn("Could not open print window (blocked?)");
        return;
      }

      const escapeHtml = (s) => {
        if (s === null || s === undefined) return "";
        return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
      };

      const html =
        "<!doctype html><html><head><meta charset='utf-8'><title>" + escapeHtml(title) + "</title>" +
        "<style>body{font-family:Arial;padding:16px}.line{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px dashed #ddd;}</style>" +
        "</head><body>" +
        "<h2>" + escapeHtml(title) + "</h2>" +
        "<div class='line'><strong>Customer</strong><div>" + escapeHtml(name) + "</div></div>" +
        "<div class='line'><strong>Phone</strong><div>" + escapeHtml(phone) + "</div></div>" +
        "<div class='line'><strong>Address</strong><div>" + escapeHtml(address) + "</div></div>" +
        "<h3>Items</h3>" + itemsHTML +
        "<h3>Total</h3><div class='line'><strong>Total</strong><div>" + escapeHtml(totalEl) + "</div></div>" +
        "<script>window.onload=function(){setTimeout(()=>window.print(),200);};</script>" +
        "</body></html>";

      win.document.open();
      win.document.write(html);
      win.document.close();
      return;
    }
  });
})();

}
