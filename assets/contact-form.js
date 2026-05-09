// Round Table — contact / device-suggestion / sponsorship-request modal.
//
// Same modal serves three flows depending on the trigger button's mode:
//   mode "general"     — "Send us a note" (roadmap page) → POST /api/contact
//   mode "device"      — "Suggest a device" (compendium index) → POST /api/contact
//   mode "sponsorship" — "Request a sponsorship" (sponsors page) → POST /api/sponsorship-request
//
// General + device land in the admin dashboard at /admin/contacts.
// Sponsorship lands in /admin/sponsorships (separate lifecycle queue).
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
    var tpl = generalTemplate;
    if (mode === "device") tpl = deviceTemplate;
    else if (mode === "sponsorship") tpl = sponsorshipTemplate;
    modalEl.innerHTML = tpl();
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

  function sponsorshipTemplate() {
    return [
      '<div class="rt-contact-dialog" role="dialog" aria-modal="true">',
      '  <h2>Request a Sponsorship</h2>',
      '  <p class="muted">Manufacturer or vendor interested in supporting the project? Tell us about your brand and we\'ll get back to you.</p>',
      '  <label for="rt-s-company">Company / brand *</label>',
      '  <input type="text" id="rt-s-company" maxlength="200" required placeholder="e.g. DynaVap" />',
      '  <label for="rt-s-name">Your name *</label>',
      '  <input type="text" id="rt-s-name" maxlength="200" required autocomplete="name" />',
      '  <label for="rt-s-email">Email *</label>',
      '  <input type="email" id="rt-s-email" maxlength="200" required autocomplete="email" />',
      '  <label for="rt-s-phone">Phone (optional)</label>',
      '  <input type="tel" id="rt-s-phone" maxlength="60" autocomplete="tel" />',
      '  <label for="rt-s-website">Website (optional)</label>',
      '  <input type="url" id="rt-s-website" maxlength="500" autocomplete="url" placeholder="https://..." />',
      '  <label for="rt-s-tier">Interested tier (optional)</label>',
      '  <select id="rt-s-tier">',
      '    <option value="">Not sure yet</option>',
      '    <option value="Founding Sponsor">Founding Sponsor</option>',
      '    <option value="Compendium Sponsor">Compendium Sponsor</option>',
      '    <option value="Custom">Custom / let\'s discuss</option>',
      '  </select>',
      '  <label for="rt-s-products">What you make / sell (optional)</label>',
      '  <textarea id="rt-s-products" maxlength="1000" rows="2" placeholder="Brief description of products, target customer..."></textarea>',
      '  <label for="rt-s-message">Message *</label>',
      '  <textarea id="rt-s-message" maxlength="5000" rows="6" required placeholder="What you\'re hoping to do, timeline, anything else useful."></textarea>',
      '  <div class="rt-contact-status" id="rt-c-status"></div>',
      '  <div class="rt-contact-actions">',
      '    <button type="button" class="rt-contact-cancel">Cancel</button>',
      '    <button type="button" class="rt-contact-submit">Send request</button>',
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
    var submitBtn = modalEl.querySelector(".rt-contact-submit");

    // Sponsorship mode hits a different endpoint with a different shape.
    if (currentMode === "sponsorship") {
      var company = valOf("rt-s-company");
      var contactName = valOf("rt-s-name");
      var contactEmail = valOf("rt-s-email");
      var phone = valOf("rt-s-phone");
      var website = valOf("rt-s-website");
      var tier = valOf("rt-s-tier");
      var products = valOf("rt-s-products");
      var sponMsg = valOf("rt-s-message");

      if (!company) return setStatus("Company / brand is required.", "error");
      if (!contactName) return setStatus("Your name is required.", "error");
      if (!contactEmail) return setStatus("Email is required.", "error");
      if (!sponMsg) return setStatus("Please enter a message.", "error");

      submitBtn.disabled = true;
      setStatus("Sending...");
      try {
        var sres = await fetch(apiBase + "/api/sponsorship-request", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            company_name: company,
            contact_name: contactName,
            contact_email: contactEmail,
            contact_phone: phone || null,
            website: website || null,
            tier_interest: tier || null,
            products: products || null,
            message: sponMsg,
          }),
        });
        var sdata = await sres.json().catch(function () { return {}; });
        if (!sres.ok) {
          setStatus("Error: " + (sdata.error || sres.status), "error");
          submitBtn.disabled = false;
          return;
        }
        setStatus("Thanks — we'll be in touch. (request #" + sdata.id + ")", "success");
        setTimeout(closeModal, 2200);
      } catch (e) {
        setStatus("Network error: " + e.message, "error");
        submitBtn.disabled = false;
      }
      return;
    }

    // General + device modes both hit /api/contact
    var name = valOf("rt-c-name") || null;
    var email = valOf("rt-c-email") || null;
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
