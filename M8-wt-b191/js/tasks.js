// M8 Tasks — slide-in panel (manual to-do) + chat-driven. Talks to /api/tasks.
(function () {
  var panel = document.getElementById("tasks-panel");
  var openBtn = document.getElementById("tasks-btn");
  var backBtn = document.getElementById("tasks-back");
  var list = document.getElementById("tasks-list");
  var input = document.getElementById("task-input");
  var due = document.getElementById("task-due");
  var addBtn = document.getElementById("task-add");
  if (!panel) return;

  var SVG_CIRCLE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/></svg>';
  var SVG_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.4l2.4 2.4 4.6-5"/></svg>';
  var SVG_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  var SVG_SAVE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 13l4 4L19 7"/></svg>';
  var WORK_TAG = '<span class="task-cat-tag">work</span>';

  var filterBar = document.getElementById("tasks-filter");
  var catBtn = document.getElementById("task-cat");
  var allTasks = [];
  var filter = "all";        // view filter (ALL / WORK / PERSONAL)
  var addCat = "personal";   // category for NEW tasks (the add-row toggle)

  function esc(s) {
    return String(s || "").replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function dueLabel(iso) {
    if (!iso) return "";
    var d = new Date(iso), now = new Date();
    var day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var diff = Math.round((day - today) / 86400000);
    var overdue = diff < 0;
    var txt = diff === 0 ? "today" : diff === 1 ? "tomorrow" : diff === -1 ? "yesterday"
      : (overdue ? Math.abs(diff) + "d ago" : "in " + diff + "d");
    return '<span class="task-due-tag' + (overdue ? " overdue" : "") + '">' + txt + "</span>";
  }

  function render(tasks) {
    if (!tasks.length) { list.innerHTML = '<div class="tasks-empty">No tasks yet. Add one above.</div>'; return; }
    list.innerHTML = tasks.map(function (t) {
      return '<div class="task-row' + (t.done ? " done" : "") + '" data-id="' + t.id + '">' +
        '<button class="task-check" aria-label="mark done" title="Mark done">' + (t.done ? SVG_CHECK : SVG_CIRCLE) + "</button>" +
        '<span class="task-title" title="Tap to edit">' + esc(t.title) + "</span>" +
        (t.category === "work" ? WORK_TAG : "") +
        (t.recur ? '<span class="task-recur" title="repeats ' + esc(t.recur) + '">&#128257;</span>' : "") +
        (t.done ? "" : dueLabel(t.due_at)) +
        '<button class="task-del" aria-label="delete">' + SVG_X + "</button>" +
        "</div>";
    }).join("");
  }

  function applyFilter() {
    var shown = filter === "all" ? allTasks
      : allTasks.filter(function (t) { return (t.category || "personal") === filter; });
    render(shown);
  }

  function setFilter(cat) {
    filter = cat;
    if (filterBar) Array.prototype.forEach.call(filterBar.querySelectorAll("button"), function (b) {
      b.classList.toggle("active", b.getAttribute("data-cat") === cat);
    });
    // viewing a WORK/PERSONAL tab also presets the add-toggle to match (handy default)
    if (cat === "work" || cat === "personal") setAddCat(cat);
    applyFilter();
  }

  function setAddCat(c) {
    addCat = c === "work" ? "work" : "personal";
    if (catBtn) {
      catBtn.textContent = addCat === "work" ? "W" : "P";
      catBtn.classList.toggle("work", addCat === "work");
      catBtn.title = "New task: " + addCat + " — tap to switch";
    }
  }

  function load() {
    fetch("/api/tasks").then(function (r) { return r.json(); })
      .then(function (d) { allTasks = d.tasks || []; applyFilter(); }).catch(function () {});
  }

  function add() {
    var t = (input.value || "").trim();
    if (!t) return;
    fetch("/api/tasks", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: t, due_at: due.value || null, category: addCat }),
    }).then(function () { input.value = ""; due.value = ""; load(); }).catch(function () {});
  }

  function toggle(id, done) {
    fetch("/api/tasks", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: id, done: done }),
    }).then(function () { load(); }).catch(function () {});
  }

  function del(id) {
    fetch("/api/tasks", {
      method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: id }),
    }).then(function () { load(); }).catch(function () {});
  }

  // ── inline edit: rename + switch work/personal ──
  function taskById(id) {
    for (var i = 0; i < allTasks.length; i++) { if (String(allTasks[i].id) === String(id)) return allTasks[i]; }
    return null;
  }
  function enterEdit(id) {
    var t = taskById(id); if (!t) return;
    var row = list.querySelector('.task-row[data-id="' + id + '"]'); if (!row) return;
    var cat = t.category === "work" ? "work" : "personal";
    row.classList.add("editing");
    row.innerHTML =
      '<input class="task-edit-input" type="text" value="' + esc(t.title) + '" aria-label="task title" />' +
      '<button class="task-edit-cat' + (cat === "work" ? " work" : "") + '" data-cat="' + cat + '" title="work / personal">' + (cat === "work" ? "W" : "P") + '</button>' +
      '<button class="task-edit-save" aria-label="save">' + SVG_SAVE + '</button>' +
      '<button class="task-edit-cancel" aria-label="cancel">' + SVG_X + '</button>';
    var inp = row.querySelector(".task-edit-input");
    if (inp) {
      inp.focus();
      try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch (_) {}
      inp.addEventListener("keydown", function (e) {
        if (e.key === "Enter") saveEdit(id);
        else if (e.key === "Escape") applyFilter();
      });
    }
  }
  function saveEdit(id) {
    var row = list.querySelector('.task-row[data-id="' + id + '"]'); if (!row) return;
    var inp = row.querySelector(".task-edit-input");
    var cb = row.querySelector(".task-edit-cat");
    var title = inp ? inp.value.trim() : "";
    var cat = cb ? cb.getAttribute("data-cat") : "personal";
    if (!title) { applyFilter(); return; }
    fetch("/api/tasks", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: id, title: title, category: cat }),
    }).then(function () { load(); }).catch(function () { load(); });
  }

  if (openBtn) openBtn.addEventListener("click", function () {
    panel.classList.add("open"); panel.setAttribute("aria-hidden", "false"); load();
  });
  if (backBtn) backBtn.addEventListener("click", function () {
    panel.classList.remove("open"); panel.setAttribute("aria-hidden", "true");
  });
  if (addBtn) addBtn.addEventListener("click", add);
  if (input) input.addEventListener("keydown", function (e) { if (e.key === "Enter") add(); });
  if (catBtn) catBtn.addEventListener("click", function () { setAddCat(addCat === "work" ? "personal" : "work"); });
  setAddCat(addCat);

  // event-delegated row actions (incl. inline-edit controls)
  list.addEventListener("click", function (e) {
    var row = e.target.closest(".task-row"); if (!row) return;
    var id = row.getAttribute("data-id");
    if (e.target.closest(".task-edit-cat")) {
      var b = e.target.closest(".task-edit-cat");
      var nc = b.getAttribute("data-cat") === "work" ? "personal" : "work";
      b.setAttribute("data-cat", nc); b.textContent = nc === "work" ? "W" : "P"; b.classList.toggle("work", nc === "work");
    } else if (e.target.closest(".task-edit-save")) { saveEdit(id); }
    else if (e.target.closest(".task-edit-cancel")) { applyFilter(); }
    else if (e.target.closest(".task-check")) { toggle(id, !row.classList.contains("done")); }
    else if (e.target.closest(".task-del")) { del(id); }
    else if (e.target.closest(".task-title")) { enterEdit(id); }
  });

  // work/personal filter (re-renders from cache; no refetch)
  if (filterBar) filterBar.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-cat]"); if (!b) return;
    setFilter(b.getAttribute("data-cat"));
  });

  // ── Push reminders (build #4): subscribe this device for due-task pushes ──
  var remBtn = document.getElementById("tasks-remind");
  function urlB64ToUint8(s) {
    var pad = "=".repeat((4 - (s.length % 4)) % 4);
    var b = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
    var raw = atob(b), arr = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
    return arr;
  }
  function remOn() { if (remBtn) { remBtn.classList.add("on"); remBtn.title = "Reminders on for this device"; } }
  // B-174: surface WHY the bell did/didn't work. A tap (verbose=true) shows the
  // outcome so "nothing happens" becomes diagnosable; the silent auto-call on load
  // (verbose=false) never nags. The most common mobile blocker is iOS: Web Push
  // only works from the INSTALLED home-screen PWA, never a Safari tab.
  function say(verbose, msg) { if (verbose) { try { window.alert(msg); } catch (_) {} } }
  function enableReminders(verbose) {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      say(verbose, "Push notifications aren't available in this browser. On iPhone: install M8 to your Home Screen (Share → Add to Home Screen) and open it from that icon — Safari tabs can't receive push. On desktop use Chrome/Edge/Firefox.");
      return;
    }
    var perm;
    try { perm = Notification.permission; } catch (_) { perm = "default"; }
    if (perm === "denied") {
      say(verbose, "Notifications are blocked for M8. Turn them on in your phone Settings (or the browser's site settings for m8-alpha.vercel.app), then tap the bell again.");
      return;
    }
    Notification.requestPermission().then(function (p) {
      if (p === "denied") { say(verbose, "Notifications are blocked for M8. Enable them in Settings, then tap the bell again."); return; }
      if (p !== "granted") { say(verbose, "Notification permission wasn't granted — tap the bell and choose Allow."); return; }
      return fetch("/api/push-subscribe").then(function (r) { return r.json(); }).then(function (d) {
        if (!d || !d.publicKey) { say(verbose, "The server isn't set up for push yet (missing VAPID key). Tell M8."); return; }
        return navigator.serviceWorker.ready.then(function (reg) {
          return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(d.publicKey) });
        }).then(function (sub) {
          return fetch("/api/push-subscribe", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ subscription: sub.toJSON() }),
          });
        }).then(function () { remOn(); say(verbose, "Reminders are on for this device ✓"); });
      });
    }).catch(function (err) {
      say(verbose, "Couldn't turn on reminders: " + (err && err.message ? err.message : String(err)));
    });
  }
  if (remBtn) {
    remBtn.addEventListener("click", function () { enableReminders(true); });
    if ("Notification" in window && Notification.permission === "granted") enableReminders(false);
  }
})();
