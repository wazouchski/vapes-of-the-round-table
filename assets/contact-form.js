// Round Table — multi-mode submission modal.
//
// Same modal serves five flows depending on the trigger button's mode:
//   mode "general"     — "Send us a note" (general feedback) → POST /api/contact
//   mode "device"      — "Suggest a device" (compendium index) → POST /api/contact
//   mode "artisan"     — "Get Listed" (artisans page) → POST /api/contact
//   mode "sponsorship" — "Request a brand partnership" (sponsors page) → POST /api/sponsorship-request
//   mode "suggestion"  — "Drop an idea" (roadmap page) → POST /api/suggestion
//
// general/device/artisan land in /admin/contacts (the contacts queue).
// sponsorship lands in /admin/sponsorships.
// suggestion lands in /admin/ideas (the suggestion-box tab).
//
// Device + artisan messages have structured prefixes ("Device suggestion:" /
// "Artisan submission:") so the dashboard can detect them and show
// "Approve & create" buttons. Ideas have their own table, no approval flow.
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
    else if (mode === "artisan") tpl = artisanTemplate;
    else if (mode === "suggestion") tpl = suggestionTemplate;
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
      '  <h2>Request a Brand Partnership</h2>',
      '  <p class="muted">Manufacturer or vendor interested in partnering with the project? Tell us about your brand and we\'ll get back to you.</p>',
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
      '    <option value="Founding Partner">Founding Partner</option>',
      '    <option value="Compendium Partner">Compendium Partner</option>',
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

  function suggestionTemplate() {
    return [
      '<div class="rt-contact-dialog" role="dialog" aria-modal="true">',
      '  <h2>Drop an Idea in the Suggestion Box</h2>',
      '  <p class="muted">Not a question or a complaint — a "you should build X" pitch. Lands in our backlog; we read every one. Approved ideas show up on the public roadmap.</p>',
      '  <label for="rt-i-title">Idea (short headline) *</label>',
      '  <input type="text" id="rt-i-title" maxlength="120" required placeholder="e.g. Add a session timer to each article" />',
      '  <label for="rt-i-category">Category</label>',
      '  <select id="rt-i-category">',
      '    <option value="">Not sure</option>',
      '    <option value="device">Device — a vape you want covered</option>',
      '    <option value="feature">Feature — site/app functionality</option>',
      '    <option value="design">Design — visual / UX feedback</option>',
      '    <option value="content">Content — gap in articles or data</option>',
      '    <option value="other">Other</option>',
      '  </select>',
      '  <label for="rt-i-description">Details *</label>',
      '  <textarea id="rt-i-description" maxlength="5000" rows="6" required placeholder="Describe the idea. What problem does it solve, who benefits, what should it look like? More detail = more likely to ship."></textarea>',
      '  <label for="rt-c-name">Your name (optional)</label>',
      '  <input type="text" id="rt-c-name" maxlength="100" autocomplete="name" />',
      '  <label for="rt-c-email">Email (optional, if you want a reply)</label>',
      '  <input type="email" id="rt-c-email" maxlength="200" autocomplete="email" />',
      '  <div class="rt-contact-status" id="rt-c-status"></div>',
      '  <div class="rt-contact-actions">',
      '    <button type="button" class="rt-contact-cancel">Cancel</button>',
      '    <button type="button" class="rt-contact-submit">Drop in box</button>',
      '  </div>',
      '</div>',
    ].join("");
  }

  function artisanTemplate() {
    return [
      '<div class="rt-contact-dialog" role="dialog" aria-modal="true">',
      '  <h2>Get Listed: Trusted Artisan</h2>',
      '  <p class="muted">Cottage vendor, maker, or small-batch craftsperson in the DHV space? Tell us about your shop. We curate based on community reputation — approved listings appear on the Trusted Artisans page.</p>',
      '  <label for="rt-a-name">Artisan / shop name *</label>',
      '  <input type="text" id="rt-a-name" maxlength="120" required placeholder="e.g. Muddy River Workshop" />',
      '  <label for="rt-a-subtitle">Subtitle / specialty *</label>',
      '  <input type="text" id="rt-a-subtitle" maxlength="160" required placeholder="e.g. Wooden Trays, Stems &amp; Accessories" />',
      '  <label for="rt-a-summary">Short description (1-3 sentences) *</label>',
      '  <textarea id="rt-a-summary" maxlength="700" rows="4" required placeholder="What you make, where you make it, what sets you apart. The text that will appear on your card."></textarea>',
      '  <label for="rt-a-link">Shop URL *</label>',
      '  <input type="url" id="rt-a-link" maxlength="500" required placeholder="https://yourshop.com" />',
      '  <label for="rt-a-link-label">Link button text (optional)</label>',
      '  <input type="text" id="rt-a-link-label" maxlength="40" placeholder="Default: &quot;Visit Shop &rarr;&quot;" />',
      '  <label for="rt-c-name">Your name (optional)</label>',
      '  <input type="text" id="rt-c-name" maxlength="100" autocomplete="name" />',
      '  <label for="rt-c-email">Email (so we can follow up)</label>',
      '  <input type="email" id="rt-c-email" maxlength="200" autocomplete="email" />',
      '  <div class="rt-contact-status" id="rt-c-status"></div>',
      '  <div class="rt-contact-actions">',
      '    <button type="button" class="rt-contact-cancel">Cancel</button>',
      '    <button type="button" class="rt-contact-submit">Submit for review</button>',
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

    // Suggestion (ideas) mode hits its own endpoint with its own shape.
    if (currentMode === "suggestion") {
      var iTitle = valOf("rt-i-title");
      var iDescription = valOf("rt-i-description");
      var iCategory = valOf("rt-i-category");
      var iName = valOf("rt-c-name") || null;
      var iEmail = valOf("rt-c-email") || null;

      if (!iTitle) return setStatus("Idea headline is required.", "error");
      if (!iDescription) return setStatus("Details are required.", "error");

      submitBtn.disabled = true;
      setStatus("Submitting...");
      try {
        var ires = await fetch(apiBase + "/api/suggestion", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: iTitle,
            description: iDescription,
            category: iCategory || null,
            submitter_name: iName,
            submitter_email: iEmail,
            page_url: window.location.href,
          }),
        });
        var idata = await ires.json().catch(function () { return {}; });
        if (!ires.ok) {
          setStatus("Error: " + (idata.error || ires.status), "error");
          submitBtn.disabled = false;
          return;
        }
        setStatus("Thanks — idea #" + idata.id + " landed in the box.", "success");
        setTimeout(closeModal, 1800);
      } catch (e) {
        setStatus("Network error: " + e.message, "error");
        submitBtn.disabled = false;
      }
      return;
    }

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

    // General, device, and artisan modes all hit /api/contact
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
      var dLines = ["Device suggestion: " + deviceName];
      if (maker) dLines.push("Manufacturer: " + maker);
      if (notes) {
        dLines.push("");
        dLines.push(notes);
      }
      message = dLines.join("\n");
    } else if (currentMode === "artisan") {
      var aName = valOf("rt-a-name");
      var aSubtitle = valOf("rt-a-subtitle");
      var aSummary = valOf("rt-a-summary");
      var aLink = valOf("rt-a-link");
      var aLinkLabel = valOf("rt-a-link-label");
      if (!aName)     return setStatus("Artisan / shop name is required.", "error");
      if (!aSubtitle) return setStatus("Subtitle / specialty is required.", "error");
      if (!aSummary)  return setStatus("Short description is required.", "error");
      if (!aLink)     return setStatus("Shop URL is required.", "error");
      // Worker parses this format in worker/src/artisan.ts::parseArtisanSubmission
      var aLines = [
        "Artisan submission: " + aName,
        "Subtitle: " + aSubtitle,
        "Link: " + aLink,
      ];
      if (aLinkLabel) aLines.push("Link Label: " + aLinkLabel);
      aLines.push("");
      aLines.push(aSummary);
      message = aLines.join("\n");
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
      var successMsg;
      if (currentMode === "device") {
        successMsg = "Thanks — device added to the queue. (#" + data.id + ")";
      } else if (currentMode === "artisan") {
        successMsg = "Thanks — your listing is in for review. (#" + data.id + ")";
      } else {
        successMsg = "Thanks — we got it. (#" + data.id + ")";
      }
      setStatus(successMsg, "success");
      setTimeout(closeModal, 1800);
    } catch (e) {
      setStatus("Network error: " + e.message, "error");
      submitBtn.disabled = false;
    }
  }

  window.RoundTableContact = { init: init };
})();
