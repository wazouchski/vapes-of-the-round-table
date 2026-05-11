// archivist-render.js — DOMPurify-wrapped safe renderer for Archivist output.
//
// HARD POLICY — DO NOT WEAKEN WITHOUT A DELIBERATE REVIEW COMMIT.
//
// All Archivist model output goes through this renderer before it ever
// touches the DOM. The DOMPurify config below is the canonical sanitizer
// configuration; any change to ALLOWED_TAGS, ALLOWED_ATTR, FORBID_*, or
// the post-purify URL validator should be reviewed by Mike. If you find
// yourself loosening it for "just this one feature", stop — every
// loosening is a permanent attack surface.
//
// The renderer resolves two custom markers emitted by the model:
//   [[device:slug]]            → <a class="archivist-cite" href="/compendium/<slug>.html">Device Name</a>
//   <<verbatim:reviewer/device>>  → <blockquote> populated from server-side data
//
// Slugs that don't appear in the device catalog are silently stripped
// (catalog passed in to render()).

(function (global) {
  "use strict";

  // DOMPurify is loaded as a global (see <script> tag in the dock CSS or
  // page template). We refuse to render if it isn't there — fail closed.
  function getPurify() {
    return global.DOMPurify || null;
  }

  // Canonical config. NEVER edit this in-place without review.
  // Reviewers: changes should also bump the version comment so future
  // diffs are easy to spot.
  // CONFIG VERSION: v1 — 2026-05-10
  var PURIFY_CONFIG = {
    ALLOWED_TAGS: [
      "strong", "em", "blockquote", "code", "a",
      "br", "p", "ul", "ol", "li", "span"
    ],
    ALLOWED_ATTR: ["href", "class", "data-slug", "data-reviewer"],
    FORBID_TAGS: [
      "style", "script", "iframe", "object", "embed",
      "svg", "math", "form", "input", "button", "meta",
      "link", "base"
    ],
    FORBID_ATTR: [
      "style", "onerror", "onload", "onclick", "onmouseover",
      "onfocus", "onblur", "onsubmit", "onkeydown", "onkeypress",
      "onkeyup", "srcset", "formaction", "action"
    ],
    ALLOW_DATA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: false,
    SAFE_FOR_TEMPLATES: true,
    ALLOWED_URI_REGEXP: /^(?:(?:\/|https:\/\/theroundtable\.wiki\/)[^\s"'<>]*)$/i,
  };

  function escapeHtml(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // Convert plain text with newlines into <p>/<br> HTML. Used before
  // marker substitution. Output is still sanitized below.
  function paragraphize(text) {
    if (!text) return "";
    var paragraphs = String(text).split(/\n{2,}/);
    return paragraphs.map(function (p) {
      var safe = escapeHtml(p.trim()).replace(/\n/g, "<br>");
      return "<p>" + safe + "</p>";
    }).join("");
  }

  function findDevice(catalog, slug) {
    if (!catalog || !Array.isArray(catalog.devices) || !slug) return null;
    var lower = String(slug).toLowerCase();
    for (var i = 0; i < catalog.devices.length; i++) {
      if (catalog.devices[i].slug === lower) return catalog.devices[i];
    }
    return null;
  }

  // Replace [[device:slug]] markers. Unknown slugs are stripped to plain
  // text (the slug only, no broken link).
  function resolveDeviceMarkers(html, catalog) {
    return html.replace(/\[\[device:([a-z0-9\-]+)\]\]/gi, function (_full, rawSlug) {
      var device = findDevice(catalog, rawSlug);
      if (!device) {
        // Strip the marker entirely if slug isn't in the catalog.
        return escapeHtml(rawSlug);
      }
      var href = "/compendium/" + encodeURIComponent(device.slug) + ".html";
      var label = escapeHtml(device.name || device.slug);
      return '<a class="archivist-cite" data-slug="' + escapeHtml(device.slug) + '" href="' + href + '">' + label + '</a>';
    });
  }

  // <<verbatim:reviewer/device>> markers. For MVP, we render an
  // attribution stub that links to the review page; the actual quote
  // body comes from the server response's `verbatim` field (an array
  // of { reviewer, device, text } objects). If no matching item is
  // found, render a plain attribution line — never invent a quote.
  function resolveVerbatimMarkers(html, verbatim) {
    var byKey = {};
    if (Array.isArray(verbatim)) {
      verbatim.forEach(function (v) {
        if (v && v.reviewer && v.device) {
          byKey[(v.reviewer + "/" + v.device).toLowerCase()] = v;
        }
      });
    }
    return html.replace(/&lt;&lt;verbatim:([a-z0-9\-]+)\/([a-z0-9\-]+)&gt;&gt;/gi, function (_full, reviewer, device) {
      var key = (reviewer + "/" + device).toLowerCase();
      var v = byKey[key];
      if (!v || !v.text) {
        return '<span class="archivist-attribution">' + escapeHtml(reviewer) + ' on ' + escapeHtml(device) + '</span>';
      }
      var safeText = escapeHtml(v.text);
      var safeReviewer = escapeHtml(v.reviewer);
      var safeDevice = escapeHtml(v.device);
      var href = "/reviews/" + encodeURIComponent(safeDevice) + ".html";
      return (
        '<blockquote class="archivist-verbatim">' +
        '<p>' + safeText + '</p>' +
        '<footer>— <a href="' + href + '">' + safeReviewer + '</a></footer>' +
        '</blockquote>'
      );
    });
  }

  /**
   * Render an Archivist response into a target DOM element.
   *
   * @param {Element} target — element to render INTO (its contents are replaced)
   * @param {string} replyText — the model's raw text response
   * @param {object} catalog — { devices: [...] }
   * @param {array} verbatim — optional verbatim quote objects
   */
  function render(target, replyText, catalog, verbatim) {
    if (!target) return;
    var purify = getPurify();
    if (!purify) {
      // Fail closed — never render unsanitized model output.
      target.textContent = "[renderer unavailable]";
      return;
    }
    var withParagraphs = paragraphize(replyText);
    var withDevices = resolveDeviceMarkers(withParagraphs, catalog);
    var withQuotes = resolveVerbatimMarkers(withDevices, verbatim);
    var clean = purify.sanitize(withQuotes, PURIFY_CONFIG);
    target.innerHTML = clean;
  }

  global.ArchivistRender = { render: render, PURIFY_CONFIG: PURIFY_CONFIG };
})(typeof window !== "undefined" ? window : globalThis);
