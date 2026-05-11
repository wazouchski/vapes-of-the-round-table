// archivist-dock.js — The Archivist chat dock Web Component.
//
// Drop-in: include this script + archivist-dock.css + DOMPurify + the
// archivist-render.js renderer on any page. Add a single tag:
//   <archivist-dock context-device="tempest"></archivist-dock>
//
// The component renders a floating "Summon the Archivist" pill. On click,
// the dock slides in. The dock holds a chat log, quick-action chips, and
// a composer.
//
// All API responses pass through ArchivistRender.render which goes
// through DOMPurify. No innerHTML of raw model output anywhere.

(function () {
  "use strict";

  var API_BASE = "https://edits.muddyriverworkshop.workers.dev";

  // Hand-drawn alchemical sigil (salt of the wise) — pure inline SVG, no
  // external assets, no img tags, CSP-clean.
  var SIGIL = '<svg class="sigil" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">' +
    '<circle cx="12" cy="12" r="9"/>' +
    '<path d="M3 12h18M12 3v18"/>' +
    '</svg>';

  var FIRST_LINES = {
    contextual: 'You stand before the records of the {name}. Ask what you will.',
    blank: 'I attend the records. Speak, traveler — what is sought?',
  };

  var CATALOG_CACHE_KEY = "archivist:catalog:v1";
  var CATALOG_TTL_MS = 60 * 60 * 1000;

  function escapeText(s) {
    var d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  }

  function uuid() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return "s_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  function getSessionId() {
    try {
      var id = localStorage.getItem("archivist_session_id");
      if (!id) {
        id = uuid();
        localStorage.setItem("archivist_session_id", id);
      }
      return id;
    } catch (_) {
      return uuid();
    }
  }

  function clearSession() {
    try {
      localStorage.removeItem("archivist_session_id");
      localStorage.removeItem("archivist_history");
    } catch (_) {}
  }

  function loadHistory() {
    try {
      var raw = localStorage.getItem("archivist_history");
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.slice(-6) : [];
    } catch (_) { return []; }
  }
  function saveHistory(history) {
    try {
      localStorage.setItem("archivist_history", JSON.stringify(history.slice(-12)));
    } catch (_) {}
  }

  async function fetchCatalog() {
    try {
      var cached = localStorage.getItem(CATALOG_CACHE_KEY);
      var cachedAt = parseInt(localStorage.getItem(CATALOG_CACHE_KEY + ":at") || "0", 10);
      if (cached && (Date.now() - cachedAt) < CATALOG_TTL_MS) {
        return JSON.parse(cached);
      }
    } catch (_) {}

    try {
      var resp = await fetch(API_BASE + "/api/archivist/catalog", { credentials: "omit" });
      if (!resp.ok) return null;
      var cat = await resp.json();
      try {
        localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify(cat));
        localStorage.setItem(CATALOG_CACHE_KEY + ":at", String(Date.now()));
      } catch (_) {}
      return cat;
    } catch (_) {
      return null;
    }
  }


  class ArchivistDock extends HTMLElement {
    constructor() {
      super();
      this._open = false;
      this._busy = false;
      this._catalog = null;
      this._history = loadHistory();
      this._sessionId = getSessionId();
    }

    connectedCallback() {
      this.contextDevice = (this.getAttribute("context-device") || "").toLowerCase();
      this._renderShell();
      this._wireEvents();
      // Lazy-load catalog when first opened, not on page load.
    }

    _renderShell() {
      var deviceName = this._deviceNameFromContext() || "";
      this.innerHTML =
        '<button class="archivist-summon" type="button" aria-expanded="false" aria-label="Summon the Archivist">' +
          SIGIL +
          '<span>Summon the Archivist</span>' +
        '</button>' +
        '<aside class="archivist-dock" data-open="false" aria-hidden="true" role="complementary">' +
          '<div class="archivist-dock-header">' +
            SIGIL +
            '<div class="title">The Archivist</div>' +
            '<button class="archivist-clear" type="button" title="Clear memory" aria-label="Clear conversation">✕</button>' +
          '</div>' +
          '<div class="archivist-log" role="log" aria-live="polite" aria-atomic="false"></div>' +
          '<div class="archivist-chips">' +
            '<button data-chip="recommend">Recommend</button>' +
            '<button data-chip="compare">Compare</button>' +
            '<button data-chip="explain">Explain</button>' +
            '<button data-chip="halls">Browse halls</button>' +
          '</div>' +
          '<form class="archivist-composer">' +
            '<textarea name="message" rows="1" placeholder="Speak, traveler…" maxlength="2000"></textarea>' +
            '<button type="submit">Ask</button>' +
          '</form>' +
          '<div class="archivist-disclaimer">' +
            'The Archivist reads the records — it does not give medical advice. ' +
            '<a class="archivist-reset" tabindex="0" role="button">Clear memory</a>' +
          '</div>' +
        '</aside>';

      this._refs = {
        summon: this.querySelector(".archivist-summon"),
        dock: this.querySelector(".archivist-dock"),
        closeBtn: this.querySelector(".archivist-clear"),
        log: this.querySelector(".archivist-log"),
        chips: this.querySelectorAll(".archivist-chips button"),
        composer: this.querySelector(".archivist-composer"),
        textarea: this.querySelector(".archivist-composer textarea"),
        sendBtn: this.querySelector(".archivist-composer button[type=submit]"),
        resetLink: this.querySelector(".archivist-reset"),
      };
    }

    _deviceNameFromContext() {
      if (!this.contextDevice || !this._catalog) return null;
      for (var i = 0; i < this._catalog.devices.length; i++) {
        if (this._catalog.devices[i].slug === this.contextDevice) {
          return this._catalog.devices[i].name;
        }
      }
      return null;
    }

    _wireEvents() {
      var self = this;
      this._refs.summon.addEventListener("click", function () { self._toggle(true); });
      this._refs.closeBtn.addEventListener("click", function () { self._toggle(false); });

      this._refs.composer.addEventListener("submit", function (e) {
        e.preventDefault();
        self._send(self._refs.textarea.value);
      });

      this._refs.textarea.addEventListener("keydown", function (e) {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          self._send(self._refs.textarea.value);
        }
      });

      this._refs.chips.forEach(function (btn) {
        btn.addEventListener("click", function () {
          var chip = btn.getAttribute("data-chip");
          var seed = {
            recommend: "Recommend a device for me. ",
            compare: "Compare two devices: ",
            explain: "Explain ",
            halls: "Browse the halls of the Citadel.",
          }[chip] || "";
          self._refs.textarea.value = seed;
          self._refs.textarea.focus();
        });
      });

      this._refs.resetLink.addEventListener("click", function () {
        clearSession();
        self._history = [];
        self._sessionId = getSessionId();
        self._refs.log.innerHTML = "";
        self._appendArchivist("The slate is cleared. Begin again, traveler.");
      });

      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && self._open) self._toggle(false);
      });
    }

    async _toggle(open) {
      this._open = open;
      this._refs.dock.setAttribute("data-open", open ? "true" : "false");
      this._refs.dock.setAttribute("aria-hidden", open ? "false" : "true");
      this._refs.summon.setAttribute("aria-expanded", open ? "true" : "false");
      if (open) {
        if (!this._catalog) {
          this._catalog = await fetchCatalog();
        }
        if (this._refs.log.children.length === 0) {
          var deviceName = this._deviceNameFromContext();
          var first = deviceName
            ? FIRST_LINES.contextual.replace("{name}", deviceName)
            : FIRST_LINES.blank;
          this._appendArchivist(first);
        }
        this._refs.textarea.focus();
      }
    }

    _appendUser(text) {
      var div = document.createElement("div");
      div.className = "archivist-msg from-user";
      div.textContent = text;
      this._refs.log.appendChild(div);
      this._refs.log.scrollTop = this._refs.log.scrollHeight;
    }

    _appendArchivist(text, citations, verbatim) {
      var div = document.createElement("div");
      div.className = "archivist-msg from-archivist";
      if (window.ArchivistRender && window.ArchivistRender.render) {
        window.ArchivistRender.render(div, text, this._catalog, verbatim);
      } else {
        div.textContent = text;
      }
      this._refs.log.appendChild(div);
      this._refs.log.scrollTop = this._refs.log.scrollHeight;
    }

    _setBusy(busy) {
      this._busy = busy;
      this._refs.sendBtn.disabled = busy;
      this._refs.textarea.disabled = busy;
      var existing = this._refs.log.querySelector(".archivist-loading");
      if (busy && !existing) {
        var p = document.createElement("p");
        p.className = "archivist-loading";
        p.textContent = "The Archivist consults the records…";
        this._refs.log.appendChild(p);
        this._refs.log.scrollTop = this._refs.log.scrollHeight;
      } else if (!busy && existing) {
        existing.remove();
      }
    }

    async _send(rawText) {
      var text = (rawText || "").trim();
      if (!text || this._busy) return;
      this._refs.textarea.value = "";
      this._appendUser(text);
      this._history.push({ role: "user", content: text });
      this._setBusy(true);

      try {
        var resp = await fetch(API_BASE + "/api/archivist/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            context_device: this.contextDevice || undefined,
            history: this._history.slice(-6),
          }),
        });
        var data = await resp.json();
        if (!resp.ok) {
          this._appendArchivist(data.reply || "The records keeper is briefly silent. Try again, traveler.");
          this._setBusy(false);
          return;
        }
        var reply = data.reply || "";
        this._appendArchivist(reply, data.citations, data.verbatim);
        this._history.push({ role: "assistant", content: reply });
        saveHistory(this._history);
      } catch (e) {
        this._appendArchivist("The path to the archives is shrouded just now. Try again in a moment.");
      } finally {
        this._setBusy(false);
      }
    }
  }

  if (!customElements.get("archivist-dock")) {
    customElements.define("archivist-dock", ArchivistDock);
  }
})();
