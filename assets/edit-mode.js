// Round Table — community edit mode.
// Toggles contenteditable on .article-body, captures original/edited HTML,
// submits to the edits Worker, shows a confirmation dialog.
//
// Usage (inserted by stage 05's WIKI_HTML_TEMPLATE):
//   <script src="../assets/edit-mode.js"></script>
//   <script>RoundTableEditMode.init({ slug: "okin", apiBase: "https://edits..." });</script>

(function () {
  "use strict";

  // Default API base — overridden by .init() if needed
  const DEFAULT_API_BASE = "https://edits.muddyriverworkshop.workers.dev";

  let config = { slug: null, apiBase: DEFAULT_API_BASE };
  let articleBody = null;
  let originalHtml = null;
  let toolbarEl = null;
  let dialogEl = null;

  function init(options) {
    config = Object.assign({ apiBase: DEFAULT_API_BASE }, options || {});
    if (!config.slug) {
      console.warn("[RoundTableEditMode] missing slug; edit mode disabled");
      return;
    }
    articleBody = document.querySelector(".article-body");
    if (!articleBody) {
      console.warn("[RoundTableEditMode] no .article-body found; edit mode disabled");
      return;
    }
    injectToolbar();
    injectDialog();
    wireSuggestEditLink();
    wireImagePasteDrop();
  }

  // ─── IMAGE PASTE/DROP ──────────────────────────────────────────────────
  // Intercept image paste and drop, resize client-side, upload to the worker,
  // then insert an <img> with the returned R2-backed URL.

  var MAX_DIMENSION = 1920;
  var JPEG_QUALITY = 0.85;
  var ALLOWED_MIME = { "image/jpeg": 1, "image/png": 1, "image/webp": 1, "image/gif": 1 };

  function wireImagePasteDrop() {
    // Use capture so we run before contenteditable's default paste behavior
    document.addEventListener("paste", function (e) {
      if (!document.body.classList.contains("rt-editing")) return;
      var items = (e.clipboardData && e.clipboardData.items) || [];
      for (var i = 0; i < items.length; i++) {
        if (items[i].kind === "file" && items[i].type.indexOf("image/") === 0) {
          e.preventDefault();
          var file = items[i].getAsFile();
          if (file) handleImageFile(file);
          return;
        }
      }
    }, true);

    document.addEventListener("drop", function (e) {
      if (!document.body.classList.contains("rt-editing")) return;
      var files = (e.dataTransfer && e.dataTransfer.files) || [];
      for (var i = 0; i < files.length; i++) {
        if (files[i].type.indexOf("image/") === 0) {
          e.preventDefault();
          handleImageFile(files[i]);
          return;
        }
      }
    }, true);
  }

  async function handleImageFile(file) {
    if (!ALLOWED_MIME[file.type]) {
      flashToolbar("Unsupported image type. Use JPEG, PNG, WebP, or GIF.");
      return;
    }

    // Save the cursor position before the async work so we can insert at it
    var savedRange = saveCursor();
    flashToolbar("Resizing & uploading…");

    try {
      var blob = file.type === "image/gif"
        ? file                                 // don't transcode GIFs (would lose animation)
        : await resizeImage(file, MAX_DIMENSION, JPEG_QUALITY);

      var res = await fetch(config.apiBase + "/api/upload-image", {
        method: "POST",
        headers: { "Content-Type": blob.type || file.type },
        body: blob,
      });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok) {
        flashToolbar("Upload failed: " + (data.error || res.status), true);
        return;
      }

      var img = document.createElement("img");
      img.src = data.url;
      img.alt = "";
      img.style.maxWidth = "100%";
      img.style.height = "auto";
      insertNodeAt(savedRange, img);
      flashToolbar("Image inserted.");
    } catch (err) {
      flashToolbar("Upload error: " + err.message, true);
    }
  }

  function resizeImage(file, maxDim, quality) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var url = URL.createObjectURL(file);
      img.onload = function () {
        URL.revokeObjectURL(url);
        var w = img.naturalWidth;
        var h = img.naturalHeight;
        if (w > maxDim || h > maxDim) {
          if (w >= h) { h = Math.round(h * maxDim / w); w = maxDim; }
          else        { w = Math.round(w * maxDim / h); h = maxDim; }
        }
        var canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        // Preserve PNG transparency; everything else becomes JPEG.
        var outputType = file.type === "image/png" ? "image/png" : "image/jpeg";
        var outputQuality = outputType === "image/jpeg" ? quality : undefined;
        canvas.toBlob(function (blob) {
          if (blob) resolve(blob);
          else reject(new Error("could not encode resized image"));
        }, outputType, outputQuality);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error("invalid image"));
      };
      img.src = url;
    });
  }

  function saveCursor() {
    var sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    var range = sel.getRangeAt(0);
    // Make sure the cursor is inside .article-body, otherwise we'd insert
    // wherever the user last clicked (which could be the toolbar).
    if (!articleBody.contains(range.commonAncestorContainer)) return null;
    return range.cloneRange();
  }

  function insertNodeAt(range, node) {
    if (!range) {
      articleBody.appendChild(node);
      return;
    }
    range.deleteContents();
    range.insertNode(node);
    // Move cursor after the inserted node
    range.setStartAfter(node);
    range.collapse(true);
    var sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }

  function flashToolbar(text, isError) {
    if (!toolbarEl) return;
    var statusEl = toolbarEl.querySelector(".rt-toolbar-status");
    if (!statusEl) {
      statusEl = document.createElement("div");
      statusEl.className = "rt-toolbar-status";
      toolbarEl.appendChild(statusEl);
    }
    statusEl.textContent = text;
    statusEl.classList.toggle("error", !!isError);
    clearTimeout(statusEl._t);
    statusEl._t = setTimeout(function () {
      statusEl.textContent = "";
      statusEl.classList.remove("error");
    }, 3500);
  }

  function wireSuggestEditLink() {
    // The TOC bootstrap script (in the article HTML) creates an anchor with
    // class .toc-suggest-edit. We hijack its click to enter edit mode instead
    // of opening a Google Form.
    document.addEventListener("click", function (e) {
      const t = e.target;
      if (t && t.closest && t.closest(".toc-suggest-edit")) {
        e.preventDefault();
        enterEditMode();
      }
    });
  }

  function enterEditMode() {
    if (document.body.classList.contains("rt-editing")) return;
    originalHtml = articleBody.innerHTML;
    articleBody.setAttribute("contenteditable", "true");
    articleBody.setAttribute("spellcheck", "true");
    document.body.classList.add("rt-editing");
    articleBody.focus();
    // Scroll the article body into view comfortably
    window.scrollTo({ top: articleBody.offsetTop - 80, behavior: "smooth" });
  }

  function exitEditMode(restoreOriginal) {
    if (restoreOriginal && originalHtml !== null) {
      articleBody.innerHTML = originalHtml;
    }
    articleBody.removeAttribute("contenteditable");
    articleBody.removeAttribute("spellcheck");
    document.body.classList.remove("rt-editing");
  }

  function injectToolbar() {
    toolbarEl = document.createElement("div");
    toolbarEl.className = "rt-edit-toolbar";
    toolbarEl.innerHTML = [
      "<h3>Edit mode</h3>",
      "<p>Edit the article inline. Click <strong>Submit</strong> to send for review.</p>",
      '<button class="rt-submit" type="button">Submit changes</button>',
      '<button class="rt-cancel" type="button">Cancel</button>',
      '<div class="rt-image-hint">Tip: paste or drop an image to add a photo (max 5 MB).</div>',
    ].join("");
    document.body.appendChild(toolbarEl);

    toolbarEl.querySelector(".rt-submit").addEventListener("click", openSubmitDialog);
    toolbarEl.querySelector(".rt-cancel").addEventListener("click", function () {
      if (articleBody.innerHTML !== originalHtml) {
        if (!confirm("Discard your changes?")) return;
      }
      exitEditMode(true);
    });
  }

  function injectDialog() {
    dialogEl = document.createElement("div");
    dialogEl.className = "rt-edit-dialog-backdrop";
    dialogEl.innerHTML = [
      '<div class="rt-edit-dialog" role="dialog" aria-modal="true" aria-labelledby="rt-dialog-title">',
      '  <h2 id="rt-dialog-title">Submit your edit</h2>',
      '  <p class="muted">First time contributing? <a href="/contribute.html" target="_blank" rel="noopener">Read the contributor guidelines</a>.</p>',
      "  <p class=\"muted\">Optional: add your name and email so we can credit you. Both are optional and never published without your permission.</p>",
      '  <label for="rt-name">Name (optional)</label>',
      '  <input type="text" id="rt-name" maxlength="100" autocomplete="name" />',
      '  <label for="rt-email">Email (optional)</label>',
      '  <input type="email" id="rt-email" maxlength="200" autocomplete="email" />',
      '  <div class="rt-status" id="rt-status"></div>',
      '  <div class="rt-dialog-actions">',
      '    <button class="rt-dialog-cancel" type="button">Back to editing</button>',
      '    <button class="rt-dialog-submit" type="button">Submit</button>',
      "  </div>",
      "</div>",
    ].join("");
    document.body.appendChild(dialogEl);

    dialogEl.querySelector(".rt-dialog-cancel").addEventListener("click", closeSubmitDialog);
    dialogEl.querySelector(".rt-dialog-submit").addEventListener("click", performSubmit);
    dialogEl.addEventListener("click", function (e) {
      if (e.target === dialogEl) closeSubmitDialog();
    });
  }

  function openSubmitDialog() {
    if (articleBody.innerHTML === originalHtml) {
      alert("No changes to submit yet. Edit the article first, then click Submit.");
      return;
    }
    setStatus("");
    dialogEl.classList.add("open");
    document.getElementById("rt-name").focus();
  }

  function closeSubmitDialog() {
    dialogEl.classList.remove("open");
  }

  function setStatus(text, kind) {
    const el = document.getElementById("rt-status");
    if (!el) return;
    el.textContent = text;
    el.className = "rt-status" + (kind ? " " + kind : "");
  }

  async function performSubmit() {
    const name = document.getElementById("rt-name").value.trim() || null;
    const email = document.getElementById("rt-email").value.trim() || null;
    const submitBtn = dialogEl.querySelector(".rt-dialog-submit");
    submitBtn.disabled = true;
    setStatus("Submitting…");

    try {
      const res = await fetch(config.apiBase + "/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          article_slug: config.slug,
          original_html: originalHtml,
          edited_html: articleBody.innerHTML,
          submitter_name: name,
          submitter_email: email,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus("Error: " + (data.error || res.status), "error");
        submitBtn.disabled = false;
        return;
      }
      setStatus("Thanks — submitted for review (#" + data.id + "). It will appear on the site once approved.", "success");
      setTimeout(function () {
        closeSubmitDialog();
        exitEditMode(true);
      }, 2200);
    } catch (e) {
      setStatus("Network error: " + e.message, "error");
      submitBtn.disabled = false;
    }
  }

  // Expose
  window.RoundTableEditMode = { init: init };
})();
