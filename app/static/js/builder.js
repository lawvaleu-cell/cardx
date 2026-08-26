(function () {
  var cardId = window.CARDX_CARD_ID;

  // ---------- Tabs ----------
  document.querySelectorAll(".tab-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      document.querySelectorAll(".tab-btn").forEach(function (b) { b.classList.remove("active"); });
      document.querySelectorAll(".builder-pane").forEach(function (p) { p.classList.remove("active"); });
      btn.classList.add("active");
      document.querySelector('.builder-pane[data-pane="' + btn.dataset.tab + '"]').classList.add("active");
    });
  });

  // ---------- Live preview: text fields ----------
  document.querySelectorAll("[data-live]").forEach(function (el) {
    el.addEventListener("input", function () {
      var target = document.getElementById(el.dataset.live);
      if (!target) return;
      if (el.dataset.live === "pcName") {
        var first = document.querySelector('input[name="first_name"]').value;
        var last = document.querySelector('input[name="last_name"]').value;
        target.textContent = (first + " " + last).trim();
      } else {
        target.textContent = el.value;
      }
    });
  });

  // ---------- Template picker ----------
  document.querySelectorAll(".template-pick[data-template]").forEach(function (el) {
    el.addEventListener("click", function () {
      document.querySelectorAll(".template-pick").forEach(function (t) { t.classList.remove("selected"); });
      el.classList.add("selected");
      var templateInput = document.querySelector('input[name="template"]');
      if (templateInput) templateInput.value = el.dataset.template;
      applyPreviewColors(el.dataset.primary, el.dataset.accent, null, el.dataset.text);
      setPreviewLayout(el.dataset.template);
      setAvatarShape(el.dataset.shape);
      autoSaveMain();
    });
  });

  function setPreviewLayout(slug) {
    var layoutMap = {
      minimal: "centered", executive: "cover-hero", corporate: "side-profile", luxury: "dark-luxury",
      gradient: "centered", glass: "glass", creative: "asymmetric", dark: "centered",
      elegant: "side-profile", professional: "cover-hero",
    };
    var preview = document.getElementById("livePreview");
    preview.className = preview.className.replace(/layout-\S+/g, "").trim();
    preview.classList.add("layout-" + (layoutMap[slug] || "centered"));
  }

  function setAvatarShape(shape) {
    var img = document.getElementById("pcAvatarImg");
    img.className = img.className.replace(/shape-\S+/g, "").trim();
    img.classList.add("shape-" + shape);
    var input = document.querySelector('input[name="avatar_shape"]');
    if (input) input.value = shape;
  }

  document.querySelectorAll(".avatar-shape-btn").forEach(function (btn) {
    btn.addEventListener("click", function () { setAvatarShape(btn.dataset.shape); autoSaveMain(); });
  });
  document.querySelectorAll(".btn-style-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var input = document.querySelector('input[name="button_style"]');
      if (input) input.value = btn.dataset.style;
      autoSaveMain();
    });
  });

  // ---------- Colors ----------
  function applyPreviewColors(primary, accent, bg, text) {
    var preview = document.getElementById("livePreview");
    if (primary) { preview.style.setProperty("--pc-primary", primary); document.querySelector('input[name="primary_color"]').value = primary; }
    if (accent) { preview.style.setProperty("--pc-accent", accent); document.querySelector('input[name="accent_color"]').value = accent; }
    if (bg) { preview.style.setProperty("--pc-bg", bg); document.querySelector('input[name="bg_color"]').value = bg; }
    if (text) { preview.style.setProperty("--pc-text", text); document.querySelector('input[name="text_color"]').value = text; }
  }

  ["primaryColorInput", "accentColorInput", "bgColorInput", "textColorInput"].forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", function () {
      var map = { primaryColorInput: "primary", accentColorInput: "accent", bgColorInput: "bg", textColorInput: "text" };
      var args = { primary: null, accent: null, bg: null, text: null };
      args[map[id]] = el.value;
      applyPreviewColors(args.primary, args.accent, args.bg, args.text);
    });
  });
  var saveColorsBtn = document.getElementById("saveColorsBtn");
  if (saveColorsBtn) saveColorsBtn.addEventListener("click", autoSaveMain);

  // ---------- Autosave main form via fetch (progressive enhancement) ----------
  var mainForm = document.getElementById("mainForm");
  var saveStatus = document.getElementById("saveStatus");

  function autoSaveMain() {
    if (!mainForm) return;
    var data = new FormData(mainForm);
    saveStatus.textContent = "⏳ " + (document.documentElement.lang === "ar" ? "جارٍ الحفظ..." : "Saving...");
    fetch(mainForm.action, { method: "POST", body: data })
      .then(function () {
        saveStatus.textContent = "✓ " + (document.documentElement.lang === "ar" ? "تم الحفظ" : "Saved");
        setTimeout(function () { saveStatus.textContent = ""; }, 2000);
      })
      .catch(function () {
        saveStatus.textContent = "⚠ " + (document.documentElement.lang === "ar" ? "فشل الحفظ" : "Save failed");
      });
  }

  if (mainForm) {
    mainForm.addEventListener("submit", function (e) {
      e.preventDefault();
      autoSaveMain();
    });
  }

  // ---------- Social rows ----------
  var socialRows = document.getElementById("socialRows");
  var addSocialRow = document.getElementById("addSocialRow");
  var PLATFORMS = ["facebook", "instagram", "linkedin", "x", "youtube", "tiktok", "github", "website", "whatsapp"];

  function newSocialRow() {
    var row = document.createElement("div");
    row.className = "social-row";
    var options = PLATFORMS.map(function (p) { return '<option value="' + p + '">' + p.charAt(0).toUpperCase() + p.slice(1) + "</option>"; }).join("");
    row.innerHTML = '<select name="platform[]">' + options + '</select>' +
      '<input type="url" name="url[]" placeholder="https://...">' +
      '<button type="button" class="btn btn-sm btn-outline remove-row-btn">✕</button>';
    return row;
  }

  if (addSocialRow) {
    addSocialRow.addEventListener("click", function () {
      var row = newSocialRow();
      socialRows.appendChild(row);
      bindRemove(row);
    });
  }
  function bindRemove(row) {
    row.querySelector(".remove-row-btn").addEventListener("click", function () { row.remove(); refreshPreviewSocial(); });
  }
  document.querySelectorAll(".remove-row-btn").forEach(bindRemove);

  function refreshPreviewSocial() {
    var list = document.getElementById("pcSocialList");
    if (!list) return;
    list.innerHTML = "";
    document.querySelectorAll('#socialRows .social-row').forEach(function (row) {
      var platform = row.querySelector('select[name="platform[]"]').value;
      var url = row.querySelector('input[name="url[]"]').value;
      if (!url) return;
      var div = document.createElement("div");
      div.className = "pc-social-item";
      div.innerHTML = '<div class="pc-si-left"><span class="pc-si-icon">🔗</span>' + platform.charAt(0).toUpperCase() + platform.slice(1) + '</div><span>›</span>';
      list.appendChild(div);
    });
  }
  if (socialRows) socialRows.addEventListener("input", refreshPreviewSocial);

  // ---------- Section drag & drop ----------
  var sectionList = document.getElementById("sectionOrderList");
  var dragEl = null;
  if (sectionList) {
    sectionList.querySelectorAll(".section-order-item").forEach(bindDrag);
  }
  function bindDrag(item) {
    item.addEventListener("dragstart", function () { dragEl = item; item.classList.add("dragging"); });
    item.addEventListener("dragend", function () { item.classList.remove("dragging"); saveSectionOrder(); });
    item.addEventListener("dragover", function (e) {
      e.preventDefault();
      var bounding = item.getBoundingClientRect();
      var offset = e.clientY - bounding.top - bounding.height / 2;
      if (offset < 0 && item !== dragEl) {
        sectionList.insertBefore(dragEl, item);
      } else if (item !== dragEl) {
        sectionList.insertBefore(dragEl, item.nextSibling);
      }
    });
  }

  function saveSectionOrder() {
    var order = [];
    var visible = [];
    sectionList.querySelectorAll(".section-order-item").forEach(function (item) {
      order.push(item.dataset.section);
      var cb = item.querySelector('input[type="checkbox"]');
      if (cb && cb.checked) visible.push(item.dataset.section);
    });
    var status = document.getElementById("sectionsSaveStatus");
    fetch("/cards/" + cardId + "/sections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ order: order, visible: visible }),
    }).then(function () {
      if (status) {
        status.textContent = document.documentElement.lang === "ar" ? "تم حفظ الترتيب ✓" : "Order saved ✓";
        setTimeout(function () { status.textContent = ""; }, 2000);
      }
    });
  }
  if (sectionList) {
    sectionList.querySelectorAll('input[type="checkbox"]').forEach(function (cb) {
      cb.addEventListener("change", saveSectionOrder);
    });
  }
})();
