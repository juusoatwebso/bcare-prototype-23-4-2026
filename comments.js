(function () {
  "use strict";

  const PAGE_ID =
    (location.pathname.split("/").pop() || "index").replace(/\.html$/i, "") ||
    "index";
  const LS_KEY = "bcare-comments-" + PAGE_ID;
  const SAVE_URL = "/comments/" + PAGE_ID + ".json";
  const MODE_KEY = "bcare-comments-mode";

  const state = {
    mode: loadMode(),
    comments: [],
    adding: false,
    activeId: null,
  };

  // ---------- persistence ----------

  function loadMode() {
    try {
      return localStorage.getItem(MODE_KEY) === "on" ? "on" : "off";
    } catch (e) {
      return "off";
    }
  }

  function saveMode() {
    try {
      localStorage.setItem(MODE_KEY, state.mode);
    } catch (e) {}
  }

  async function loadComments() {
    try {
      const res = await fetch(SAVE_URL, { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          state.comments = data;
          try {
            localStorage.setItem(LS_KEY, JSON.stringify(data));
          } catch (e) {}
          return;
        }
      }
    } catch (e) {}
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (Array.isArray(data)) state.comments = data;
      }
    } catch (e) {}
  }

  let savePending = null;
  function saveComments() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state.comments));
    } catch (e) {}
    if (savePending) clearTimeout(savePending);
    savePending = setTimeout(async () => {
      savePending = null;
      try {
        await fetch(SAVE_URL, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(state.comments, null, 2),
        });
      } catch (e) {
        console.warn("[comments] server save failed; kept in localStorage", e);
      }
    }, 250);
  }

  // ---------- selector / anchor ----------

  function isOurs(el) {
    while (el) {
      if (el.nodeType === 1 && el.hasAttribute && el.hasAttribute("data-bcare-comments"))
        return true;
      el = el.parentNode;
    }
    return false;
  }

  function elementAt(x, y) {
    const overlay = document.getElementById("bcare-comments-root");
    const prev = overlay ? overlay.style.pointerEvents : null;
    if (overlay) overlay.style.pointerEvents = "none";
    let el = document.elementFromPoint(x, y);
    if (overlay) overlay.style.pointerEvents = prev || "";
    while (el && isOurs(el)) el = el.parentElement;
    return el || document.body;
  }

  function buildSelector(el) {
    if (!el || el === document.documentElement) return "html";
    if (el === document.body) return "body";
    if (el.id && document.querySelectorAll("#" + CSS.escape(el.id)).length === 1) {
      return "#" + CSS.escape(el.id);
    }
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && node !== document.body) {
      let part = node.tagName.toLowerCase();
      const parent = node.parentElement;
      if (parent) {
        const sameTag = Array.from(parent.children).filter(
          (c) => c.tagName === node.tagName,
        );
        if (sameTag.length > 1) {
          part += ":nth-of-type(" + (sameTag.indexOf(node) + 1) + ")";
        }
      }
      parts.unshift(part);
      node = parent;
      if (parts.length > 12) break;
    }
    return "body > " + parts.join(" > ");
  }

  function resolveAnchor(selector) {
    try {
      return document.querySelector(selector);
    } catch (e) {
      return null;
    }
  }

  function docRectOf(el) {
    const r = el.getBoundingClientRect();
    return {
      left: r.left + window.scrollX,
      top: r.top + window.scrollY,
      width: r.width,
      height: r.height,
    };
  }

  function createCommentAt(viewportX, viewportY, text) {
    const el = elementAt(viewportX, viewportY);
    const selector = buildSelector(el);
    const rect = el.getBoundingClientRect();
    const offsetX = viewportX - rect.left;
    const offsetY = viewportY - rect.top;
    const now = new Date().toISOString();
    const c = {
      id: "c_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36),
      text: text || "",
      selector,
      offsetX,
      offsetY,
      created: now,
      updated: now,
    };
    state.comments.push(c);
    saveComments();
    render();
    return c;
  }

  function reanchorComment(id, viewportX, viewportY) {
    const c = state.comments.find((x) => x.id === id);
    if (!c) return;
    const el = elementAt(viewportX, viewportY);
    c.selector = buildSelector(el);
    const rect = el.getBoundingClientRect();
    c.offsetX = viewportX - rect.left;
    c.offsetY = viewportY - rect.top;
    c.updated = new Date().toISOString();
    saveComments();
    render();
  }

  // ---------- DOM helpers ----------

  function h(tag, attrs, children) {
    const el = document.createElement(tag);
    el.setAttribute("data-bcare-comments", "");
    if (attrs) {
      for (const k in attrs) {
        if (k === "class") el.className = attrs[k];
        else if (k === "text") el.textContent = attrs[k];
        else if (k === "style") Object.assign(el.style, attrs[k]);
        else if (k.startsWith("on")) el.addEventListener(k.slice(2), attrs[k]);
        else if (k === "title") el.title = attrs[k];
        else el.setAttribute(k, attrs[k]);
      }
    }
    if (children) {
      for (const c of children) if (c) el.appendChild(c);
    }
    return el;
  }

  // ---------- styles ----------

  const style = document.createElement("style");
  style.setAttribute("data-bcare-comments", "");
  style.textContent = [
    "#bcare-comments-root, #bcare-comments-root * { box-sizing: border-box; }",
    "#bcare-comments-root { position: absolute; top: 0; left: 0; width: 0; height: 0; z-index: 2147483000; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }",
    ".bcare-toolbar { display: flex; align-items: center; gap: 6px; user-select: none; pointer-events: auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }",
    ".bcare-toolbar.bcare-floating { position: fixed; top: 12px; right: 12px; background: #1f2937; color: #f9fafb; border-radius: 999px; padding: 6px 10px; gap: 8px; box-shadow: 0 4px 18px rgba(0,0,0,.35); font-size: 13px; z-index: 2147483001; }",
    ".bcare-toolbar.bcare-floating button { background: transparent; border: 1px solid transparent; color: inherit; padding: 4px 10px; border-radius: 999px; cursor: pointer; font-size: 13px; line-height: 1.2; }",
    ".bcare-toolbar.bcare-floating button:hover { background: rgba(255,255,255,.08); }",
    ".bcare-toolbar.bcare-inline button { background: transparent; border: 1px solid #333; border-radius: 5px; color: #666; font-size: 11px; padding: 5px 12px; cursor: pointer; font-family: Roboto, sans-serif; transition: all .15s; line-height: 1.2; }",
    ".bcare-toolbar.bcare-inline button:hover { color: #ccc; border-color: #555; background: rgba(255,255,255,.05); }",
    ".bcare-toolbar .bcare-toggle.on { background: #22c55e !important; color: #052e13 !important; border-color: #22c55e !important; }",
    ".bcare-toolbar .bcare-add.active { background: #f59e0b !important; color: #1f1300 !important; border-color: #f59e0b !important; }",
    ".bcare-toolbar .bcare-count { opacity: .7; font-variant-numeric: tabular-nums; padding: 0 4px; font-size: 11px; color: #666; }",
    "body.bcare-adding, body.bcare-adding * { cursor: crosshair !important; }",
    ".bcare-pin { position: absolute; width: 24px; height: 24px; margin: -12px 0 0 -12px; background: #f43f5e; color: white; border: 2px solid white; border-radius: 50%; box-shadow: 0 2px 6px rgba(0,0,0,.35); font-size: 12px; font-weight: 700; display: flex; align-items: center; justify-content: center; cursor: grab; pointer-events: auto; }",
    ".bcare-pin:hover { transform: scale(1.08); }",
    ".bcare-pin.dragging { cursor: grabbing; opacity: .8; }",
    ".bcare-pin.missing { background: #6b7280; }",
    ".bcare-popover { position: absolute; min-width: 240px; max-width: 320px; background: #111827; color: #f9fafb; border: 1px solid #374151; border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,.45); padding: 10px; pointer-events: auto; font-size: 13px; }",
    ".bcare-popover textarea { width: 100%; min-height: 70px; resize: vertical; background: #0b1220; color: #f9fafb; border: 1px solid #374151; border-radius: 6px; padding: 6px 8px; font: inherit; }",
    ".bcare-popover .bcare-meta { font-size: 11px; opacity: .6; margin-top: 6px; }",
    ".bcare-popover .bcare-actions { display: flex; gap: 6px; margin-top: 8px; justify-content: flex-end; }",
    ".bcare-popover button { background: #374151; color: #f9fafb; border: none; padding: 5px 10px; border-radius: 6px; cursor: pointer; font: inherit; }",
    ".bcare-popover button:hover { background: #4b5563; }",
    ".bcare-popover button.primary { background: #22c55e; color: #052e13; }",
    ".bcare-popover button.danger { background: #ef4444; }",
    ".bcare-popover button.danger:hover { background: #dc2626; }",
  ].join("\n");
  document.head.appendChild(style);

  // ---------- toolbar ----------

  const root = h("div", { id: "bcare-comments-root" });
  document.body.appendChild(root);

  const btnToggle = h("button", {
    class: "bcare-toggle",
    title: "Toggle comment visibility",
    text: "💬 Comments",
    onclick: () => {
      state.mode = state.mode === "on" ? "off" : "on";
      saveMode();
      if (state.mode === "off") {
        state.adding = false;
        state.activeId = null;
      }
      render();
    },
  });
  const btnAdd = h("button", {
    class: "bcare-add",
    title: "Click page to drop a new comment",
    text: "+ Add",
    onclick: () => {
      if (state.mode !== "on") {
        state.mode = "on";
        saveMode();
      }
      state.adding = !state.adding;
      state.activeId = null;
      render();
    },
  });
  const countEl = h("span", { class: "bcare-count", text: "0" });
  const toolbar = h("div", { class: "bcare-toolbar" }, [btnToggle, btnAdd, countEl]);

  function mountToolbar() {
    const resetBtn = document.querySelector(".role-reset-btn");
    if (resetBtn && resetBtn.parentNode) {
      if (toolbar.parentNode !== resetBtn.parentNode || toolbar.nextSibling !== resetBtn) {
        toolbar.classList.remove("bcare-floating");
        toolbar.classList.add("bcare-inline");
        resetBtn.parentNode.insertBefore(toolbar, resetBtn);
      }
    } else if (toolbar.parentNode !== document.body) {
      toolbar.classList.remove("bcare-inline");
      toolbar.classList.add("bcare-floating");
      document.body.appendChild(toolbar);
    }
  }
  mountToolbar();

  // Capture-phase click for drop mode (runs before page handlers)
  window.addEventListener(
    "click",
    (e) => {
      if (!state.adding) return;
      if (isOurs(e.target)) return;
      e.preventDefault();
      e.stopPropagation();
      const c = createCommentAt(e.clientX, e.clientY, "");
      state.adding = false;
      state.activeId = c.id;
      render();
    },
    true,
  );

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (state.adding) {
        state.adding = false;
        render();
      } else if (state.activeId) {
        state.activeId = null;
        render();
      }
    }
  });

  // ---------- render ----------
  // Pins and popover are kept in DOM across layout ticks so in-flight
  // mousedown→click sequences aren't destroyed by re-renders.

  const pinMap = new Map(); // id -> DOM element
  let popEl = null; // current popover DOM element (or null)

  function render() {
    mountToolbar();
    btnToggle.classList.toggle("on", state.mode === "on");
    btnAdd.classList.toggle("active", state.adding);
    btnAdd.style.display = state.mode === "on" ? "" : "none";
    countEl.textContent = String(state.comments.length);
    document.body.classList.toggle("bcare-adding", state.adding);

    if (state.mode !== "on") {
      for (const pin of pinMap.values()) pin.remove();
      pinMap.clear();
      if (popEl) {
        popEl.remove();
        popEl = null;
      }
      return;
    }

    const existingIds = new Set(state.comments.map((c) => c.id));
    for (const [id, pin] of Array.from(pinMap.entries())) {
      if (!existingIds.has(id)) {
        pin.remove();
        pinMap.delete(id);
      }
    }
    for (const c of state.comments) {
      if (!pinMap.has(c.id)) {
        const pin = createPin(c);
        pinMap.set(c.id, pin);
        root.appendChild(pin);
      }
    }

    repositionAll();
    syncPopover();
  }

  function createPin(c) {
    const pin = h("div", { class: "bcare-pin", text: "💬" });
    pin.dataset.id = c.id;
    attachPinHandlers(pin, c);
    return pin;
  }

  function repositionAll() {
    for (const c of state.comments) {
      const pin = pinMap.get(c.id);
      if (!pin) continue;
      const anchor = resolveAnchor(c.selector);
      pin.classList.toggle("missing", !anchor);
      pin.title = anchor ? "" : "Anchor element not found";
      positionPin(pin, c, anchor);
    }
    if (popEl && state.activeId) {
      const pin = pinMap.get(state.activeId);
      if (pin) positionPopover(popEl, pin);
    }
  }

  function syncPopover() {
    const wantId = state.activeId;
    const haveId = popEl ? popEl.dataset.id : null;
    if (wantId === haveId) return; // already in the right state

    if (popEl) {
      popEl.remove();
      popEl = null;
    }
    if (!wantId) return;
    const c = state.comments.find((x) => x.id === wantId);
    const pin = pinMap.get(wantId);
    if (!c || !pin) return;
    popEl = buildPopover(c);
    popEl.dataset.id = wantId;
    positionPopover(popEl, pin);
    root.appendChild(popEl);
  }

  function positionPin(pin, c, anchor) {
    let left, top;
    if (anchor) {
      const r = docRectOf(anchor);
      left = r.left + c.offsetX;
      top = r.top + c.offsetY;
    } else {
      left = window.scrollX + 24;
      top = window.scrollY + 80;
    }
    pin.style.left = left + "px";
    pin.style.top = top + "px";
  }

  function positionPopover(pop, pin) {
    const left = parseFloat(pin.style.left);
    const top = parseFloat(pin.style.top);
    pop.style.left = left + 16 + "px";
    pop.style.top = top + 16 + "px";
  }

  function buildPopover(c) {
    const ta = h("textarea", { placeholder: "Type comment..." });
    ta.value = c.text;
    setTimeout(() => ta.focus(), 0);

    const meta = h("div", {
      class: "bcare-meta",
      text: new Date(c.created).toLocaleString(),
    });

    const btnDelete = h("button", {
      class: "danger",
      text: "Delete",
      onclick: () => {
        state.comments = state.comments.filter((x) => x.id !== c.id);
        state.activeId = null;
        saveComments();
        render();
      },
    });
    const btnClose = h("button", {
      text: "Close",
      onclick: () => {
        state.activeId = null;
        render();
      },
    });
    const btnSave = h("button", {
      class: "primary",
      text: "Save",
      onclick: () => {
        c.text = ta.value;
        c.updated = new Date().toISOString();
        saveComments();
        state.activeId = null;
        render();
      },
    });
    const actions = h("div", { class: "bcare-actions" }, [btnDelete, btnClose, btnSave]);

    const pop = h("div", { class: "bcare-popover" }, [ta, meta, actions]);
    pop.addEventListener("click", (e) => e.stopPropagation());
    return pop;
  }

  function attachPinHandlers(pin, c) {
    pin.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      let moved = false;
      const startX = e.clientX;
      const startY = e.clientY;
      const origLeft = parseFloat(pin.style.left);
      const origTop = parseFloat(pin.style.top);

      const onMove = (ev) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (!moved && Math.abs(dx) + Math.abs(dy) > 3) {
          moved = true;
          pin.classList.add("dragging");
          state.activeId = null;
          if (popEl) {
            popEl.remove();
            popEl = null;
          }
        }
        if (moved) {
          pin.style.left = origLeft + dx + "px";
          pin.style.top = origTop + dy + "px";
        }
      };
      const onUp = (ev) => {
        window.removeEventListener("mousemove", onMove, true);
        window.removeEventListener("mouseup", onUp, true);
        pin.classList.remove("dragging");
        if (moved) {
          reanchorComment(c.id, ev.clientX, ev.clientY);
        } else {
          state.activeId = state.activeId === c.id ? null : c.id;
          render();
        }
      };
      window.addEventListener("mousemove", onMove, true);
      window.addEventListener("mouseup", onUp, true);
    });
  }

  // Reposition-only on layout changes (don't rebuild; would break in-flight clicks)
  let rafPending = false;
  function requestReposition() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      mountToolbar();
      if (state.mode === "on") repositionAll();
    });
  }
  window.addEventListener("resize", requestReposition);
  window.addEventListener("scroll", requestReposition, true);

  const mo = new MutationObserver((records) => {
    // Skip if every mutation is inside our own DOM
    let relevant = false;
    for (const r of records) {
      if (!isOurs(r.target)) {
        relevant = true;
        break;
      }
    }
    if (relevant) requestReposition();
  });
  mo.observe(document.body, { childList: true, subtree: true, attributes: true });

  loadComments().then(render);
})();
