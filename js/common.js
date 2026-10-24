/* Field Log – shared code.
   Every page loads this file first, then its own script:
   index.html → log.js, week.html → week.js, timesheet.html → timesheet.js, backup.html → backup.js */
"use strict";

/* ===== App settings ===== */
const APP_VERSION = "2.0";
const CATS = ["Repair", "Maintenance", "Install", "Inspection", "Travel", "Turn-Over", "Other"];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/* ===== Small helpers ===== */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const pad = n => String(n).padStart(2, "0");
const iso = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); // 2026-10-24
const parse = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const monday = d => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); return addDays(x, -((x.getDay() + 6) % 7)); };
const fmtH = h => (Math.round(h * 100) / 100).toFixed(2);   // 8.5 → "8.50"
const q4 = h => Math.round(h * 4) / 4;                      // round to 15 minutes
const longDate = d => d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
const shortDate = d => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
const uid = () => "e" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
function esc(s) { return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

/* ===== Saved data: entries and preferences (stored on this phone) ===== */
const DATA_KEY = "fieldlog.data.v1";   // entries, saved sites, employee name, last backup date
const DRAFT_KEY = "fieldlog.draft.v1"; // the unsaved entry on the Log page
const WEEK_KEY = "fieldlog.week";      // the week picked on the Week/Timesheet pages

const state = { entries: [], prefs: { sites: [], name: "", lastBackup: 0 } };

function loadData() {
  try {
    const raw = localStorage.getItem(DATA_KEY);
    if (raw) {
      const o = JSON.parse(raw);
      state.entries = Array.isArray(o.entries) ? o.entries : [];
      state.prefs = Object.assign(state.prefs, o.prefs || {});
    }
  } catch (e) { toast("Couldn't read saved data on this phone."); }
}
function saveData() {
  try { localStorage.setItem(DATA_KEY, JSON.stringify({ version: 1, entries: state.entries, prefs: state.prefs })); return true; }
  catch (e) { toast("Couldn't save. Your phone may be out of storage."); return false; }
}
function storedDraftId() {
  try { return (JSON.parse(localStorage.getItem(DRAFT_KEY) || "null") || {}).id || null; } catch (e) { return null; }
}
// Ask iOS to keep this data even when storage is low.
try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {}

/* ===== Selected week (shared by the Week and Timesheet pages) ===== */
function getWeekStart() {
  try { const s = sessionStorage.getItem(WEEK_KEY); if (s) return parse(s); } catch (e) {}
  return monday(new Date());
}
function setWeekStart(d) { try { sessionStorage.setItem(WEEK_KEY, iso(d)); } catch (e) {} }

// Everything about one week: its entries, a total per day, and regular/overtime hours.
function weekData(start) {
  const end = addDays(start, 6), s = iso(start), e = iso(end);
  const list = state.entries.filter(x => x.date >= s && x.date <= e)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.start || "").localeCompare(b.start || "") || (a.createdAt || 0) - (b.createdAt || 0));
  const days = DAYS.map((name, i) => {
    const date = addDays(start, i), key = iso(date), items = list.filter(x => x.date === key);
    return { name, date, key, items, total: items.reduce((t, x) => t + x.hours, 0) };
  });
  const total = days.reduce((t, d) => t + d.total, 0);
  return { start, end, list, days, total, ot: Math.max(0, total - 40), reg: Math.min(40, total) };
}
function showWeekLabels(w) {
  const m = monday(new Date());
  $(".wkLabel").textContent = iso(w.start) === iso(m) ? "This week" : iso(w.start) === iso(addDays(m, -7)) ? "Last week" : "Week of " + shortDate(w.start);
  $(".wkRange").textContent = `${shortDate(w.start)} – ${shortDate(w.end)}, ${w.end.getFullYear()}`;
}
// Wires up the ‹ › week buttons; onChange redraws the page.
function bindWeekArrows(onChange) {
  $(".prevWk").onclick = () => { setWeekStart(addDays(getWeekStart(), -7)); onChange(); };
  $(".nextWk").onclick = () => { setWeekStart(addDays(getWeekStart(), 7)); onChange(); };
}

/* ===== Pop-up messages ===== */
let toastTimer;
function toast(msg) {
  let t = $(".toast");
  if (!t) { t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.hidden = true, 2800);
}

/* ===== Photo storage (IndexedDB on this phone) =====
   Each photo record: {id, entryId, createdAt, blob (full image), thumb (small image), w, h} */
let photosOK = !!window.indexedDB;
const PDB = {
  db: null,
  open() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((res, rej) => {
      let r; try { r = indexedDB.open("fieldlog-photos", 1); } catch (e) { rej(e); return; }
      r.onupgradeneeded = () => { const st = r.result.createObjectStore("photos", { keyPath: "id" }); st.createIndex("entryId", "entryId"); };
      r.onsuccess = () => { this.db = r.result; res(this.db); };
      r.onerror = () => rej(r.error);
    });
  },
  req(r) { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
  async put(p) {
    const db = await this.open();
    return new Promise((res, rej) => { const t = db.transaction("photos", "readwrite"); t.objectStore("photos").put(p); t.oncomplete = () => res(); t.onerror = t.onabort = () => rej(t.error || new Error("write failed")); });
  },
  async get(id) { const db = await this.open(); return this.req(db.transaction("photos").objectStore("photos").get(id)); },
  async all() { const db = await this.open(); return this.req(db.transaction("photos").objectStore("photos").getAll()); },
  async del(ids) {
    const db = await this.open();
    return new Promise((res, rej) => { const t = db.transaction("photos", "readwrite"); const st = t.objectStore("photos"); ids.forEach(i => st.delete(i)); t.oncomplete = () => res(); t.onerror = t.onabort = () => rej(t.error); });
  }
};
const photoIndex = new Map(); // entry id → [{id, createdAt}] in the order they were added
const thumbURL = new Map();   // photo id → link to its thumbnail image

function indexPhoto(p) {
  if (!photoIndex.has(p.entryId)) photoIndex.set(p.entryId, []);
  const arr = photoIndex.get(p.entryId), i = arr.findIndex(x => x.id === p.id), m = { id: p.id, createdAt: p.createdAt };
  if (i >= 0) arr[i] = m; else arr.push(m);
  arr.sort((a, b) => a.createdAt - b.createdAt);
  if (!thumbURL.has(p.id) && p.thumb) thumbURL.set(p.id, URL.createObjectURL(p.thumb));
}
function unindexPhoto(id) {
  for (const [eid, arr] of photoIndex) {
    const i = arr.findIndex(m => m.id === id);
    if (i >= 0) { arr.splice(i, 1); if (!arr.length) photoIndex.delete(eid); }
  }
  const u = thumbURL.get(id); if (u) { URL.revokeObjectURL(u); thumbURL.delete(id); }
}
function deletePhotosFor(entryId) {
  const ids = (photoIndex.get(entryId) || []).map(m => m.id);
  ids.forEach(unindexPhoto);
  if (ids.length) PDB.del(ids).catch(() => {});
}
function photoCount() { let n = 0; photoIndex.forEach(a => n += a.length); return n; }

// Reads every photo's details into photoIndex, and removes photos whose entry no longer exists.
async function loadPhotos(extraKeepIds = []) {
  if (!photosOK) return;
  try {
    const all = await PDB.all();
    const keep = new Set(state.entries.map(e => e.id));
    [storedDraftId(), ...extraKeepIds].forEach(id => id && keep.add(id));
    const orphans = [];
    all.forEach(p => { if (keep.has(p.entryId)) indexPhoto(p); else orphans.push(p.id); });
    if (orphans.length) await PDB.del(orphans);
  } catch (e) { photosOK = false; }
}

/* ===== Shared pieces of the screen ===== */
// Yellow header: today's date and hours logged this week.
function renderHeader() {
  $("#todayLabel").textContent = longDate(new Date());
  const m = monday(new Date()), s = iso(m), e = iso(addDays(m, 6));
  $("#headWeek").textContent = fmtH(state.entries.filter(x => x.date >= s && x.date <= e).reduce((t, x) => t + x.hours, 0));
}
// One job card, used on the Log and Week pages. Tapping it opens the entry for editing.
function entryHTML(e) {
  const time = e.start && e.end ? `<span>${e.start}–${e.end}</span>` : "";
  const ph = photoIndex.get(e.id) || [];
  const strip = ph.length ? `<span class="pstrip">${ph.slice(0, 4).map(m => `<img src="${thumbURL.get(m.id) || ""}" alt="">`).join("")}${ph.length > 4 ? `<span class="tag">+${ph.length - 4}</span>` : ""}</span>` : "";
  const count = ph.length ? `<span>${ph.length} photo${ph.length === 1 ? "" : "s"}</span>` : "";
  return `<button type="button" class="entry" data-edit="${esc(e.id)}">` +
    `<span class="site">${esc(e.site)}</span><span class="hrs">${fmtH(e.hours)}</span>` +
    (e.task ? `<span class="what">${esc(e.task)}</span>` : "") + strip +
    `<span class="meta"><span class="tag">${esc(e.category || "Other")}</span>${time}${count}</span></button>`;
}
function dayHeadHTML(title, total) {
  return `<div class="dayhead"><h3>${title}</h3><span class="tot">${total > 8 ? '<span class="flag">Over 8</span>' : ""}${fmtH(total)} hrs</span></div>`;
}

/* ===== Sharing files =====
   On iPhone this opens the share sheet (Save to Files, Mail, AirDrop). Elsewhere it downloads.
   Returns "shared", "cancelled", "retry" (iPhone needs another tap) or "downloaded". */
async function shareFiles(files) {
  if (navigator.canShare && navigator.canShare({ files })) {
    try { await navigator.share({ files }); return "shared"; }
    catch (e) { if (e && e.name === "AbortError") return "cancelled"; if (e && e.name === "NotAllowedError") return "retry"; }
  }
  files.forEach(f => {
    const url = URL.createObjectURL(f), a = document.createElement("a");
    a.href = url; a.download = f.name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 20000);
  });
  return "downloaded";
}
function shareFile(filename, text, mime) { return shareFiles([new File([text], filename, { type: mime })]); }

/* ===== Start-up for every page ===== */
loadData();
renderHeader();
// Refresh the header if the app is reopened on a new day.
document.addEventListener("visibilitychange", () => { if (!document.hidden) renderHeader(); });
// Offline support: sw.js saves the app on the phone. See the notes at the top of sw.js.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then(r => r.update()).catch(() => {}));
}
