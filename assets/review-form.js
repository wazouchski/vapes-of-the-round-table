// Round Table — community review submission modal.
//
// Triggered by buttons with [data-review-form] attribute. Collects:
//   - Author identity (name + profile pic + optional email/bio)
//   - Device name + optional multi-image upload
//   - Structured review content (impressions, body, pros, cons, verdict)
// Uploads images to /api/upload-image (R2) first, then POSTs the
// collected data to /api/review-submission. Submissions land in the
// admin dashboard at /admin/reviews.

(function () {
  "use strict";

  var DEFAULT_API_BASE = "https://edits.muddyriverworkshop.workers.dev";
  var apiBase = DEFAULT_API_BASE;
  var modalEl = null;

  // Local state per modal session
  var profilePicUrl = null;     // R2 URL after upload
  var deviceImageUrls = [];     // array of R2 URLs
  var profilePicFile = null;    // the File object pending upload
  var deviceImageFiles = [];    // array of File objects pending upload

  var MAX_DIMENSION = 1600;
  var JPEG_QUALITY = 0.85;
  var MAX_DEVICE_IMAGES = 10;
  var ALLOWED_MIME = { "image/jpeg": 1, "image/png": 1, "image/webp": 1, "image/gif": 1 };

  function init(options) {
    options = options || {};
    apiBase = options.apiBase || apiBase;
    var triggerSelector = options.trigger || "[data-review-form]";

    document.addEventListener("click", function (e) {
      var t = e.target;
      if (t && t.closest && t.closest(triggerSelector)) {
        e.preventDefault();
        openModal();
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

  function openModal() {
    profilePicUrl = null;
    deviceImageUrls = [];
    profilePicFile = null;
    deviceImageFiles = [];
    modalEl.innerHTML = template();
    bindActions();
    modalEl.classList.add("open");
    setTimeout(function () {
      var first = modalEl.querySelector("input, textarea");
      if (first) first.focus();
    }, 10);
  }

  function closeModal() {
    modalEl.classList.remove("open");
  }

  function template() {
    return [
      '<div class="rt-contact-dialog rt-review-dialog" role="dialog" aria-modal="true">',
      '  <h2>Submit a Community Review</h2>',
      '  <p class="muted">Share your experience with a vape. Approved reviews land on the Reviews page.</p>',
      '',
      '  <h3 class="rt-section">About you</h3>',
      '',
      '  <label for="rt-r-author">Your name *</label>',
      '  <input type="text" id="rt-r-author" maxlength="100" required placeholder="e.g. Sarah J." />',
      '',
      '  <label>Profile picture *</label>',
      '  <div class="rt-file-row">',
      '    <input type="file" id="rt-r-pic" accept="image/jpeg,image/png,image/webp,image/gif" />',
      '    <div class="rt-pic-preview" id="rt-r-pic-preview"></div>',
      '  </div>',
      '',
      '  <label for="rt-r-email">Email (optional)</label>',
      '  <input type="email" id="rt-r-email" maxlength="200" autocomplete="email" />',
      '',
      '  <label for="rt-r-bio">Short bio (optional)</label>',
      '  <textarea id="rt-r-bio" maxlength="500" rows="2" placeholder="One or two sentences about you..."></textarea>',
      '',
      '  <h3 class="rt-section">The device</h3>',
      '',
      '  <label for="rt-r-device">Device name *</label>',
      '  <input type="text" id="rt-r-device" maxlength="200" required placeholder="e.g. Tinymight 2" />',
      '',
      '  <label>Device photos (optional, max ' + MAX_DEVICE_IMAGES + ')</label>',
      '  <div class="rt-file-row">',
      '    <input type="file" id="rt-r-images" accept="image/jpeg,image/png,image/webp,image/gif" multiple />',
      '  </div>',
      '  <div class="rt-image-grid" id="rt-r-image-grid"></div>',
      '',
      '  <h3 class="rt-section">Your review</h3>',
      '',
      '  <label for="rt-r-first">First impressions (optional)</label>',
      '  <textarea id="rt-r-first" maxlength="5000" rows="3" placeholder="Out-of-the-box thoughts..."></textarea>',
      '',
      '  <label for="rt-r-body">The review *</label>',
      '  <textarea id="rt-r-body" maxlength="20000" rows="8" required placeholder="Use blank lines to separate paragraphs."></textarea>',
      '',
      '  <label for="rt-r-pros">Pros (one per line, optional)</label>',
      '  <textarea id="rt-r-pros" maxlength="2000" rows="4" placeholder="Easy to clean&#10;Great battery life&#10;..."></textarea>',
      '',
      '  <label for="rt-r-cons">Cons (one per line, optional)</label>',
      '  <textarea id="rt-r-cons" maxlength="2000" rows="4" placeholder="Steep learning curve&#10;..."></textarea>',
      '',
      '  <label for="rt-r-verdict">Final verdict (optional)</label>',
      '  <textarea id="rt-r-verdict" maxlength="5000" rows="3" placeholder="Your bottom line."></textarea>',
      '',
      '  <div class="rt-contact-status" id="rt-r-status"></div>',
      '  <div class="rt-contact-actions">',
      '    <button type="button" class="rt-contact-cancel">Cancel</button>',
      '    <button type="button" class="rt-contact-submit">Submit Review</button>',
      '  </div>',
      '</div>',
    ].join("\n");
  }

  function bindActions() {
    modalEl.querySelector(".rt-contact-cancel").addEventListener("click", closeModal);
    modalEl.querySelector(".rt-contact-submit").addEventListener("click", submitForm);

    var picInput = modalEl.querySelector("#rt-r-pic");
    picInput.addEventListener("change", function (e) {
      var f = e.target.files && e.target.files[0];
      if (!f) return;
      if (!ALLOWED_MIME[f.type]) {
        flash("Profile pic must be JPEG, PNG, WebP, or GIF.", true);
        return;
      }
      profilePicFile = f;
      previewPic(f);
    });

    var imagesInput = modalEl.querySelector("#rt-r-images");
    imagesInput.addEventListener("change", function (e) {
      var files = Array.from(e.target.files || []);
      for (var i = 0; i < files.length; i++) {
        if (!ALLOWED_MIME[files[i].type]) continue;
        if (deviceImageFiles.length >= MAX_DEVICE_IMAGES) {
          flash("Max " + MAX_DEVICE_IMAGES + " device photos.", true);
          break;
        }
        deviceImageFiles.push(files[i]);
        renderImageThumb(files[i]);
      }
      // Reset input so re-selecting the same file works
      e.target.value = "";
    });
  }

  function previewPic(file) {
    var box = modalEl.querySelector("#rt-r-pic-preview");
    box.innerHTML = "";
    var img = document.createElement("img");
    img.src = URL.createObjectURL(file);
    img.style.width = "60px";
    img.style.height = "60px";
    img.style.borderRadius = "50%";
    img.style.objectFit = "cover";
    box.appendChild(img);
  }

  function renderImageThumb(file) {
    var grid = modalEl.querySelector("#rt-r-image-grid");
    var wrap = document.createElement("div");
    wrap.className = "rt-image-thumb";
    var img = document.createElement("img");
    img.src = URL.createObjectURL(file);
    var rm = document.createElement("button");
    rm.type = "button";
    rm.className = "rt-image-remove";
    rm.textContent = "×";
    rm.addEventListener("click", function () {
      var idx = deviceImageFiles.indexOf(file);
      if (idx >= 0) deviceImageFiles.splice(idx, 1);
      wrap.remove();
    });
    wrap.appendChild(img);
    wrap.appendChild(rm);
    grid.appendChild(wrap);
  }

  function flash(text, isError) {
    var el = modalEl.querySelector("#rt-r-status");
    if (!el) return;
    el.textContent = text;
    el.className = "rt-contact-status" + (isError ? " error" : "");
  }

  function valOf(id) {
    var el = modalEl.querySelector("#" + id);
    return el ? el.value.trim() : "";
  }

  async function submitForm() {
    // Validate
    var authorName = valOf("rt-r-author");
    var deviceName = valOf("rt-r-device");
    var body = valOf("rt-r-body");
    if (!authorName) return flash("Your name is required.", true);
    if (!profilePicFile) return flash("Profile picture is required.", true);
    if (!deviceName) return flash("Device name is required.", true);
    if (!body) return flash("The review body is required.", true);

    var submitBtn = modalEl.querySelector(".rt-contact-submit");
    submitBtn.disabled = true;

    try {
      flash("Uploading profile picture...");
      profilePicUrl = await uploadOne(profilePicFile);

      for (var i = 0; i < deviceImageFiles.length; i++) {
        flash("Uploading device images... (" + (i + 1) + "/" + deviceImageFiles.length + ")");
        var url = await uploadOne(deviceImageFiles[i]);
        deviceImageUrls.push(url);
      }

      flash("Submitting review...");
      var res = await fetch(apiBase + "/api/review-submission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          author_name: authorName,
          author_email: valOf("rt-r-email") || null,
          author_bio: valOf("rt-r-bio") || null,
          author_pic_url: profilePicUrl,
          device_name: deviceName,
          first_impressions: valOf("rt-r-first") || null,
          body: body,
          pros: valOf("rt-r-pros") || null,
          cons: valOf("rt-r-cons") || null,
          verdict: valOf("rt-r-verdict") || null,
          device_image_urls: deviceImageUrls,
        }),
      });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok) {
        flash("Error: " + (data.error || res.status), true);
        submitBtn.disabled = false;
        return;
      }
      flash("Thanks — your review is in the moderation queue. (#" + data.id + ")");
      setTimeout(closeModal, 2400);
    } catch (e) {
      flash("Upload error: " + e.message, true);
      submitBtn.disabled = false;
    }
  }

  async function uploadOne(file) {
    var blob = file.type === "image/gif" ? file : await resizeImage(file, MAX_DIMENSION, JPEG_QUALITY);
    var res = await fetch(apiBase + "/api/upload-image", {
      method: "POST",
      headers: { "Content-Type": blob.type || file.type },
      body: blob,
    });
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok) throw new Error(data.error || ("upload " + res.status));
    return data.url;
  }

  function resizeImage(file, maxDim, quality) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        URL.revokeObjectURL(url);
        var w = img.naturalWidth, h = img.naturalHeight;
        if (w > maxDim || h > maxDim) {
          if (w >= h) { h = Math.round(h * maxDim / w); w = maxDim; }
          else        { w = Math.round(w * maxDim / h); h = maxDim; }
        }
        var canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        var outputType = file.type === "image/png" ? "image/png" : "image/jpeg";
        var outputQuality = outputType === "image/jpeg" ? quality : undefined;
        canvas.toBlob(function (b) {
          if (b) resolve(b); else reject(new Error("encode failed"));
        }, outputType, outputQuality);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("invalid image")); };
      img.src = url;
    });
  }

  window.RoundTableReviewForm = { init: init };
})();
