// Smarter compendium search — overlay on top of the existing filterModels()
// behavior. Loads phase2/data/device-catalog.json and indexes each device's
// metadata + spec text so the search box matches against materials/features,
// not just device names.
//
// Filters layered (AND-combined):
//   1. Category tab (existing: desktop / portable-battery / portable-torch)
//   2. Heat-type chip (convection / conduction / hybrid / any)
//   3. Era chip (current / classic / discontinued / any)
//   4. Free-text search (name + manufacturer + slug + all spec values)
//
// If the catalog fetch fails (offline, 404, parse error), the script falls
// back to the original card.textContent matching so the page never regresses.
//
// Wire-up: include this script after the existing inline <script> block in
// compendium/index.html. Adds chips dynamically just below the filter-tabs
// row, replaces the global filterModels() implementation.

(function () {
  "use strict";

  // Map from slug → searchable index string (lowercase, space-separated)
  var catalogIndex = Object.create(null);
  // Map from slug → { heat_type, era, ... } so chip-filters work
  var catalogMeta = Object.create(null);
  var catalogReady = false;

  // ── 1. Build the searchable index from the catalog JSON ─────────────────

  function indexCatalog(devices) {
    devices.forEach(function (d) {
      if (!d.slug) return;
      catalogMeta[d.slug] = {
        heat_type: (d.heat_type || "").toLowerCase(),
        power: (d.power || "").toLowerCase(),
        form_factor: (d.form_factor || "").toLowerCase(),
        era: (d.era || "").toLowerCase(),
      };
      var parts = [
        d.name || "",
        d.manufacturer || "",
        d.slug,
        d.heat_type || "",
        d.power || "",
        d.form_factor || "",
        d.era || "",
        (d.aliases || []).join(" "),
        (d.tags || []).join(" "),
      ];
      // Flatten every spec key + value into the search blob
      if (d.specs_extracted && typeof d.specs_extracted === "object") {
        Object.keys(d.specs_extracted).forEach(function (k) {
          parts.push(k);
          parts.push(String(d.specs_extracted[k] || ""));
        });
      }
      catalogIndex[d.slug] = parts.join(" ").toLowerCase();
    });
    catalogReady = true;
  }

  function loadCatalog() {
    // Relative to /compendium/index.html → ../data/device-catalog.json
    return fetch("../data/device-catalog.json", { cache: "no-cache" })
      .then(function (r) {
        if (!r.ok) throw new Error("catalog fetch " + r.status);
        return r.json();
      })
      .then(function (j) {
        var devices = (j && j.devices) || [];
        if (!Array.isArray(devices) || devices.length === 0) {
          throw new Error("catalog has no devices");
        }
        indexCatalog(devices);
        return devices.length;
      });
  }

  // ── 2. Render the "Refine" chips row ────────────────────────────────────

  var HEAT_OPTIONS = [
    { value: "any", label: "Any heat" },
    { value: "convection", label: "Convection" },
    { value: "conduction", label: "Conduction" },
    { value: "hybrid", label: "Hybrid" },
  ];
  var ERA_OPTIONS = [
    { value: "any", label: "Any era" },
    { value: "current", label: "Current" },
    { value: "classic", label: "Classic" },
    { value: "discontinued", label: "Discontinued" },
  ];

  function makeChipRow(label, options, dimensionAttr) {
    var row = document.createElement("div");
    row.className = "refine-chips";
    row.setAttribute("data-dim", dimensionAttr);
    var lab = document.createElement("span");
    lab.className = "refine-label";
    lab.textContent = label;
    row.appendChild(lab);
    options.forEach(function (opt, i) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "refine-chip" + (i === 0 ? " active" : "");
      btn.setAttribute("data-value", opt.value);
      btn.textContent = opt.label;
      btn.addEventListener("click", function () {
        row.querySelectorAll(".refine-chip").forEach(function (b) {
          b.classList.remove("active");
        });
        btn.classList.add("active");
        if (typeof window.filterModels === "function") {
          window.filterModels();
        }
      });
      row.appendChild(btn);
    });
    return row;
  }

  function injectChips() {
    var tabs = document.querySelector(".filter-tabs");
    if (!tabs) return;
    var heat = makeChipRow("Heat:", HEAT_OPTIONS, "heat_type");
    var era = makeChipRow("Era:", ERA_OPTIONS, "era");
    tabs.parentNode.insertBefore(heat, tabs.nextSibling);
    tabs.parentNode.insertBefore(era, heat.nextSibling);
  }

  function getActiveChip(dim) {
    var row = document.querySelector('.refine-chips[data-dim="' + dim + '"]');
    if (!row) return "any";
    var btn = row.querySelector(".refine-chip.active");
    return btn ? btn.getAttribute("data-value") : "any";
  }

  // ── 3. Replace filterModels() with the catalog-aware version ────────────

  function smarterFilterModels() {
    var q = (document.getElementById("search") || { value: "" })
      .value.toLowerCase().trim();
    var cat = window.activeCategory || "all";
    var heatPick = getActiveChip("heat_type");
    var eraPick = getActiveChip("era");
    var cards = document.querySelectorAll(".model-card");
    var visible = 0;

    cards.forEach(function (card) {
      // Derive slug from href: "arizer-extreme-q.html" → "arizer-extreme-q"
      var href = card.getAttribute("href") || "";
      var slug = href.replace(/\.html$/, "").replace(/^.*\//, "");

      var catMatch = cat === "all" || card.dataset.category === cat;

      var meta = catalogMeta[slug] || {};
      var heatMatch = heatPick === "any" || meta.heat_type === heatPick;
      var eraMatch = eraPick === "any" || meta.era === eraPick;

      // Text match: catalog index first, fall back to card body
      var textMatch = true;
      if (q.length > 0) {
        if (catalogReady && catalogIndex[slug]) {
          textMatch = catalogIndex[slug].indexOf(q) !== -1;
        } else {
          textMatch = card.textContent.toLowerCase().indexOf(q) !== -1;
        }
      }

      var show = catMatch && heatMatch && eraMatch && textMatch;
      card.classList.toggle("hidden", !show);
      if (show) visible++;
    });

    var nr = document.getElementById("no-results");
    if (nr) nr.style.display = visible === 0 ? "block" : "none";
  }

  // ── 4. Hint UI: bump the search placeholder once catalog loads ──────────

  function updateSearchPlaceholder() {
    var inp = document.getElementById("search");
    if (!inp) return;
    inp.setAttribute(
      "placeholder",
      'Search name, manufacturer, materials, features… (try "quartz", "induction", "ruby")'
    );
  }

  // ── 5. Boot ─────────────────────────────────────────────────────────────

  function boot() {
    injectChips();
    // Override the inline filterModels() defined in compendium/index.html.
    // The category-tab onclick still uses window.filterModels (legacy global),
    // so reassigning here picks up category clicks too.
    window.filterModels = smarterFilterModels;

    loadCatalog().then(function (count) {
      updateSearchPlaceholder();
      // Re-run once now that the catalog is loaded (in case the user typed
      // something during the fetch).
      window.filterModels();
      // eslint-disable-next-line no-console
      console.log("[smarter-search] loaded " + count + " devices");
    }).catch(function (err) {
      // Catalog unreachable — keep the original behavior by leaving the
      // overridden filterModels() in place. It still works on card.textContent
      // when catalogReady === false. Just no chip-filtering of heat/era.
      // eslint-disable-next-line no-console
      console.warn("[smarter-search] catalog load failed: " + err);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
