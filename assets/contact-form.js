// Round Table — contact / device-suggestion modal.
//
// Same modal serves two flows depending on the trigger button's mode:
//   mode "general" — "Send us a note" (roadmap page)
//   mode "device"  — "Suggest a device" (compendium index)
//
// Both POST to /api/contact on the edits worker; submissions land in the
// admin dashboard at /admin/contacts. Device suggestions are pre-formatted
// so they're easy to spot in the list.
//
// Usage:
//   <script src="assets/contact-form.js"></script>
//   <script>
//     RoundTableContact.init({ trigger: "[data-contact-form]", mode: "general" });
//     // or
//     RoundTableContact.init({ trigger: "[data-suggest-device]", mode: "device" });
//   </script>

(function () {
  "use strict";

  var DEFAULT_API_BASE = "https://edits.muddyriverworkshop.workers.dev";
  var apiBase = DEFAULT_API_BASE;
  var modalEl = null;
  var currentMode = "general";

  function init(options) {
    options = options || {};
    apiBase = options.apiBase || apiBase;
    var triggerSelector = options.trigger || "[data-contact-form]";
    var mode = options.mode || "general";

    document.addEventListener("click", function (e) {
      var t = e.target;
      if (t && t.closest && t.closest(triggerSelector)) {
        e.preventDefault();
        openModal(mode);
      }
    });

    if (!modalEl) injectModal();
  }

  function injectModal() {
    modalEl = document.createElement("div");
    modalEl.className = "rt-contact-backdrop";
    document.body.appendChild(modalEl);

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && modalEl.classList.contains("open")) closeModal();
    });
    modalEl.addEventListener("click", function (e) {
      if (e.target === modalEl) closeModal();
    });
  }

  function openModal(mode) {
    currentMode = mode;
    modalEl.innerHTML = mode === "device" ? deviceTemplate() : generalTemplate();
    bindModalActions();
    modalEl.classList.add("open");
    setTimeout(function () {
      var first = modalEl.querySelector("input, textarea");
      if (first) first.focus();
    }, 10);
  }

  function closeModal() {
    modalEl.classList.remove("open");
  }

  function generalTemplate() {
    return [
      '<div class="rt-contact-dialog" role="dialog" aria-modal="true">',
      '  <h2>Send us a note</h2>',
      '  <p class="muted">Suggestions, corrections, vendors to add, anything. We read every one.</p>',
      '  <label for="rt-c-name">Name (optional)</label>',
      '  <input type="text" id="rt-c-name" maxlength="100" autocomplete="name" />',
      '  <label for="rt-c-email">Email (optional, only if you want a reply)</label>',
      '  <input type="email" id="rt-c-email" maxlength="200" autocomplete="email" />',
      '  <label for="rt-c-message">Message</label>',
      '  <textarea id="rt-c-message" maxlength="5000" rows="6" required></textarea>',
      '  <div class="rt-contact-status" id="rt-c-status"></div>',
      '  <div class="rt-contact-actions">',
      '    <button type="button" class="rt-contact-cancel">Cancel</button>',
      '    <button type="button" class="rt-contact-submit">Send</button>',
      '  </div>',
      '</div>',
    ].join("");
  }

  function deviceTemplate() {
    return [
      '<div class="rt-contact-dialog" role="dialog" aria-modal="true">',
      '  <h2>Suggest a device</h2>',
      '  <p class="muted">Don\'t see your vape? Tell us about it. We\'ll add it to the queue for the next batch of articles.</p>',
      '  <label for="rt-c-device">Device name *</label>',
      '  <input type="text" id="rt-c-device" maxlength="120" required placeholder="e.g. Tinymight 2" />',
      '  <label for="rt-c-maker">Manufacturer (optional)</label>',
      '  <input type="text" id="rt-c-maker" maxlength="120" placeholder="e.g. Tinymight" />',
      '  <label for="rt-c-message">Why should we add it? (optional)</label>',
      '  <textarea id="rt-c-message" maxlength="3000" rows="4" placeholder="Brief notes, links, your experience..."></textarea>',
      '  <label for="rt-c-name">Your name (optional)</label>',
      '  <input type="text" id="rt-c-name" maxlength="100" autocomplete="name" />',
      '  <label for="rt-c-email">Email (optional)</label>',
      '  <input type="email" id="rt-c-email" maxlength="200" autocomplete="email" />',
      '  <div class="rt-contact-status" id="rt-c-status"></div>',
      '  <div class="rt-contact-actions">',
      '    <button type="button" class="rt-contact-cancel">Cancel</button>',
      '    <button type="button" class="rt-contact-submit">Submit</button>',
      '  </div>',
      '</div>',
    ].join("");
  }

  function bindModalActions() {
    modalEl.querySelector(".rt-contact-cancel").addEventListener("click", closeModal);
    modalEl.querySelector(".rt-contact-submit").addEventListener("click", submitForm);
  }

  function setStatus(text, kind) {
    var el = modalEl.querySelector("#rt-c-status");
    if (!el) return;
    el.textContent = text;
    el.className = "rt-contact-status" + (kind ? " " + kind : "");
  }

  function valOf(id) {
    var el = modalEl.querySelector("#" + id);
    return el ? el.value.trim() : "";
  }

  async function submitForm() {
    var name = valOf("rt-c-name") || null;
    var email = valOf("rt-c-email") || null;
    var submitBtn = modalEl.querySelector(".rt-contact-submit");
    var message;

    if (currentMode === "device") {
      var deviceName = valOf("rt-c-device");
      var maker = valOf("rt-c-maker");
      var notes = valOf("rt-c-message");
      if (!deviceName) {
        setStatus("Device name is required.", "error");
        return;
      }
      var lines = ["Device suggestion: " + deviceName];
      if (maker) lines.push("Manufacturer: " + maker);
      if (notes) {
        lines.push("");
        lines.push(notes);
      }
      message = lines.join("\n");
    } else {
      message = valOf("rt-c-message");
      if (!message) {
        setStatus("Please enter a message.", "error");
        return;
      }
    }

    submitBtn.disabled = true;
    setStatus("Sending...");

    try {
      var res = await fetch(apiBase + "/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name,
          email: email,
          message: message,
          page_url: window.location.href,
        }),
      });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok) {
        setStatus("Error: " + (data.error || res.status), "error");
        submitBtn.disabled = false;
        return;
      }
      var successMsg = currentMode === "device"
        ? "Thanks — device added to the queue. (#" + data.id + ")"
        : "Thanks — we got it. (#" + data.id + ")";
      setStatus(successMsg, "success");
      setTimeout(closeModal, 1800);
    } catch (e) {
      setStatus("Network error: " + e.message, "error");
      submitBtn.disabled = false;
    }
  }

  window.RoundTableContact = { init: init };
})();
