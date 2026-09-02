document.addEventListener("DOMContentLoaded", function () {
  var toggle = document.querySelector("[data-sidebar-toggle]");
  var sidebar = document.querySelector(".sidebar");
  if (toggle && sidebar) {
    toggle.addEventListener("click", function () {
      sidebar.classList.toggle("open");
    });
    document.addEventListener("click", function (e) {
      if (sidebar.classList.contains("open") && !sidebar.contains(e.target) && !toggle.contains(e.target)) {
        sidebar.classList.remove("open");
      }
    });
  }

  document.querySelectorAll(".flash").forEach(function (el) {
    setTimeout(function () {
      el.style.transition = "opacity .4s ease";
      el.style.opacity = "0";
      setTimeout(function () { el.remove(); }, 400);
    }, 5000);
  });

  // copy-to-clipboard helper
  document.querySelectorAll("[data-copy]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var val = btn.getAttribute("data-copy");
      navigator.clipboard.writeText(val).then(function () {
        var original = btn.textContent;
        btn.textContent = btn.getAttribute("data-copied-label") || "Copied!";
        setTimeout(function () { btn.textContent = original; }, 1500);
      });
    });
  });
});
