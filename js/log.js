/* Field Log – Log page (index.html): add, edit and delete jobs, with photos. */
"use strict";

const fDate = $("#fDate"), fSite = $("#fSite"), fWhat = $("#fWhat"), fStart = $("#fStart"), fEnd = $("#fEnd"), fHours = $("#fHours");
const HOURS_HINT = "Tap or hold − / + to change by 15 minutes. Or enter a start and end time to fill this in.";
const form = { editing: null, draftId: null, cat: "Repair" }; // editing = id of the entry being edited

/* ===== Type of work chips ===== */
function renderCats() {
  $("#catChips").innerHTML = CATS.map(c => `<button type="button" class="chip" aria-pressed="${c === form.cat}" data-cat="${c}">${c}</button>`).join("");
}
$("#catChips").addEventListener("click", e => { const b = e.target.closest("[data-cat]"); if (!b) return; form.cat = b.dataset.cat; renderCats(); });

/* ===== Site chips (recent sites for one-tap entry) ===== */
function recentSites() {
  const seen = [];
  [...state.entries].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).forEach(e => { if (!seen.includes(e.site)) seen.push(e.site); });
  state.prefs.sites.forEach(s => { if (!seen.includes(s)) seen.push(s); });
  return seen;
}
function renderSiteChips() {
  const all = recentSites(), cur = fSite.value.trim().toLowerCase(), chips = all.slice(0, 5);
  $("#siteList").innerHTML = all.map(s => `<option value="${esc(s)}"></option>`).join("");
  $("#siteChips").innerHTML = chips.length
    ? chips.map(s => `<button type="button" class="chip" aria-pressed="${s.toLowerCase() === cur}" data-site="${esc(s)}">${esc(s)}</button>`).join("")
    : `<span class="hint" style="margin:0">Sites you log will show up here for one-tap entry.</span>`;
}
$("#siteChips").addEventListener("click", e => { const b = e.target.closest("[data-site]"); if (!b) return; fSite.value = b.dataset.site; renderSiteChips(); });
fSite.addEventListener("input", renderSiteChips);

/* ===== Hours: − / + buttons (tap or hold) and start/end times ===== */
function setHours(h) { fHours.value = fmtH(Math.max(0, Math.min(24, q4(h)))); }
function clearTimes() {
  if (fStart.value || fEnd.value) { fStart.value = ""; fEnd.value = ""; $("#hoursHint").textContent = "Start and end cleared because hours were changed by hand."; }
}
// Tap to change by 15 minutes; hold to keep changing (speeds up after about a second).
function bindStepper(btn, delta) {
  let wait = null, repeat = null, fromPointer = false;
  const step = () => { const before = parseFloat(fHours.value) || 0; setHours(before + delta); clearTimes(); return (parseFloat(fHours.value) || 0) !== before; };
  const stop = () => { clearTimeout(wait); clearInterval(repeat); wait = repeat = null; };
  btn.addEventListener("pointerdown", e => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault(); fromPointer = true; stop(); step();
    try { btn.setPointerCapture(e.pointerId); } catch (_) {}
    let n = 0;
    wait = setTimeout(() => {
      repeat = setInterval(() => {
        if (!step()) { stop(); return; }
        if (++n === 8) { clearInterval(repeat); repeat = setInterval(() => { if (!step()) stop(); }, 80); }
      }, 160);
    }, 400);
  });
  ["pointerup", "pointercancel", "lostpointercapture"].forEach(t => btn.addEventListener(t, stop));
  btn.addEventListener("click", () => { if (fromPointer) { fromPointer = false; return; } step(); }); // keyboard
  btn.addEventListener("contextmenu", e => e.preventDefault());
}
bindStepper($("#hMinus"), -0.25);
bindStepper($("#hPlus"), 0.25);

function calcFromTimes() {
  if (!fStart.value || !fEnd.value) return;
  const [sh, sm] = fStart.value.split(":").map(Number), [eh, em] = fEnd.value.split(":").map(Number);
  let mins = (eh * 60 + em) - (sh * 60 + sm); if (mins < 0) mins += 1440; // past midnight
  setHours(mins / 60);
  $("#hoursHint").textContent = `${fStart.value} to ${fEnd.value} = ${fmtH(q4(mins / 60))} hrs, rounded to the nearest 15 minutes.`;
}
fStart.addEventListener("change", calcFromTimes);
fEnd.addEventListener("change", calcFromTimes);

/* ===== Unsaved entry (draft): kept on the phone until Save, so photos taken early aren't lost ===== */
let draftTimer;
function currentFormId() { return form.editing || form.draftId; }
function draftHasContent() { return !!(fSite.value.trim() || fWhat.value.trim() || fStart.value || fEnd.value || (photoIndex.get(form.draftId) || []).length); }
function saveDraft() {
  clearTimeout(draftTimer); if (form.editing) return;
  try {
    if (!draftHasContent()) { localStorage.removeItem(DRAFT_KEY); return; }
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ id: form.draftId, date: fDate.value, site: fSite.value, task: fWhat.value, start: fStart.value, end: fEnd.value, hours: fHours.value, cat: form.cat }));
  } catch (e) {}
}
function saveDraftSoon() { clearTimeout(draftTimer); draftTimer = setTimeout(saveDraft, 400); }
function clearDraft() { clearTimeout(draftTimer); try { localStorage.removeItem(DRAFT_KEY); } catch (e) {} }
function restoreDraft() {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null"); if (!d || !d.id) return false;
    form.draftId = d.id; fDate.value = d.date || iso(new Date()); fSite.value = d.site || ""; fWhat.value = d.task || "";
    fStart.value = d.start || ""; fEnd.value = d.end || ""; setHours(parseFloat(d.hours) || 1); form.cat = d.cat || form.cat; renderCats();
    return true;
  } catch (e) { return false; }
}
["input", "change", "click"].forEach(t => $("#entryForm").addEventListener(t, saveDraftSoon));

/* ===== New / edit / delete ===== */
function resetForm(keepDate) {
  form.editing = null;
  if (!restoreDraft()) {
    form.draftId = uid();
    if (!keepDate) fDate.value = iso(new Date());
    fSite.value = ""; fWhat.value = ""; fStart.value = ""; fEnd.value = ""; setHours(1);
  }
  $("#hoursHint").textContent = HOURS_HINT;
  $("#formTitle").textContent = "Log a job"; $("#saveBtn").textContent = "Save entry";
  $("#cancelEdit").hidden = true; $("#deleteBtn").hidden = true; armDelete(false);
  render();
}
function loadForEdit(id) {
  const e = state.entries.find(x => x.id === id); if (!e) return;
  if (!form.editing) saveDraft(); // keep the unsaved entry for later
  form.editing = id;
  fDate.value = e.date; fSite.value = e.site; fWhat.value = e.task || ""; fStart.value = e.start || ""; fEnd.value = e.end || "";
  setHours(e.hours); form.cat = e.category || "Other"; renderCats();
  $("#formTitle").textContent = "Edit entry"; $("#saveBtn").textContent = "Save changes";
  $("#cancelEdit").hidden = false; $("#deleteBtn").hidden = false; armDelete(false);
  window.scrollTo(0, 0); render();
}
$("#cancelEdit").onclick = () => resetForm();
document.addEventListener("click", e => { const b = e.target.closest("[data-edit]"); if (b) loadForEdit(b.dataset.edit); });

let deleteArmed = false, deleteTimer;
function armDelete(on) {
  deleteArmed = on; $("#deleteBtn").textContent = on ? "Tap again to delete" : "Delete";
  clearTimeout(deleteTimer); if (on) deleteTimer = setTimeout(() => armDelete(false), 4000);
}
$("#deleteBtn").onclick = () => {
  if (!deleteArmed) { armDelete(true); return; }
  const id = form.editing;
  state.entries = state.entries.filter(x => x.id !== id); deletePhotosFor(id);
  if (saveData()) toast("Entry deleted");
  resetForm();
};
$("#repeatBtn").onclick = () => {
  const last = [...state.entries].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
  if (!last) { toast("No previous entry to repeat yet"); return; }
  fSite.value = last.site; fWhat.value = last.task || ""; form.cat = last.category || "Other"; setHours(last.hours); fStart.value = ""; fEnd.value = "";
  renderCats(); renderSiteChips(); saveDraftSoon(); toast("Filled in from your last entry");
};
$("#entryForm").addEventListener("submit", ev => {
  ev.preventDefault();
  const site = fSite.value.trim(), hours = q4(parseFloat(fHours.value) || 0);
  if (!fDate.value) { toast("Pick a date"); return; }
  if (!site) { toast("Add the site or location"); fSite.focus(); return; }
  if (hours <= 0) { toast("Hours must be more than 0"); return; }
  const prev = form.editing ? state.entries.find(x => x.id === form.editing) : null;
  const entry = { id: currentFormId(), date: fDate.value, site, category: form.cat, task: fWhat.value.trim(), start: fStart.value || "", end: fEnd.value || "", hours, createdAt: prev?.createdAt || Date.now() };
  const i = state.entries.findIndex(x => x.id === entry.id);
  if (i >= 0) state.entries[i] = entry; else state.entries.push(entry);
  if (!state.prefs.sites.some(s => s.toLowerCase() === site.toLowerCase())) state.prefs.sites = [site, ...state.prefs.sites].slice(0, 60);
  const wasEdit = !!form.editing;
  if (saveData()) toast(wasEdit ? "Changes saved" : `Saved ${fmtH(hours)} hrs at ${site}`);
  if (!wasEdit) clearDraft();
  resetForm(true);
});

/* ===== Photos in the form ===== */
const formBlobs = new Map(); // photo id → full image, loaded ahead so Share opens instantly
function loadImg(file) {
  return new Promise((res, rej) => { const u = URL.createObjectURL(file), i = new Image(); i.onload = () => res({ i, u }); i.onerror = () => { URL.revokeObjectURL(u); rej(new Error("decode")); }; i.src = u; });
}
function canvasBlob(c, q) { return new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error("encode")), "image/jpeg", q)); }
// Shrinks a photo to 1600 px (about 200–400 KB) plus a 240 px thumbnail.
async function processImage(file) {
  const { i, u } = await loadImg(file);
  const draw = (max, q) => {
    const k = Math.min(1, max / Math.max(i.naturalWidth, i.naturalHeight));
    const w = Math.max(1, Math.round(i.naturalWidth * k)), h = Math.max(1, Math.round(i.naturalHeight * k));
    const c = document.createElement("canvas"); c.width = w; c.height = h; c.getContext("2d").drawImage(i, 0, 0, w, h);
    return canvasBlob(c, q).then(b => ({ b, w, h }));
  };
  try { const full = await draw(1600, 0.78), th = await draw(240, 0.6); return { blob: full.b, thumb: th.b, w: full.w, h: full.h }; }
  finally { URL.revokeObjectURL(u); }
}
// e.g. 2026-10-24_Elm-St_1.jpg
function photoName(n) {
  const site = (fSite.value.trim() || "site").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "site";
  return `${fDate.value || iso(new Date())}_${site}_${n}.jpg`;
}
function renderFormThumbs() {
  const box = $("#formThumbs");
  if (!photosOK) { $(".photobtns").hidden = true; $("#photoHint").textContent = "Photos aren't available in this browser."; box.innerHTML = ""; $("#sharePhotosBtn").hidden = true; return; }
  const list = photoIndex.get(currentFormId()) || [];
  box.innerHTML = list.map((m, i) => `<button type="button" class="thumb" data-view="${m.id}" aria-label="View photo ${i + 1}"><img src="${thumbURL.get(m.id) || ""}" alt=""><span class="num">${i + 1}</span></button>`).join("");
  const sb = $("#sharePhotosBtn"); sb.hidden = !list.length; sb.textContent = list.length > 1 ? `Share these ${list.length} photos` : "Share this photo";
  const want = new Set(list.map(m => m.id));
  [...formBlobs.keys()].forEach(k => { if (!want.has(k)) formBlobs.delete(k); });
  list.forEach(m => { if (!formBlobs.has(m.id)) PDB.get(m.id).then(p => { if (p) formBlobs.set(m.id, p.blob); }).catch(() => {}); });
}
$("#formThumbs").addEventListener("click", e => { const b = e.target.closest("[data-view]"); if (b) openViewer(currentFormId(), b.dataset.view); });
$("#photoAdd").addEventListener("change", async () => {
  const inp = $("#photoAdd"), files = [...inp.files]; inp.value = ""; if (!files.length) return;
  const entryId = currentFormId(); let ok = 0;
  toast(files.length > 1 ? `Adding ${files.length} photos…` : "Adding photo…");
  for (const f of files) {
    try {
      const r = await processImage(f);
      const p = { id: "p" + uid(), entryId, createdAt: Date.now(), blob: r.blob, thumb: r.thumb, w: r.w, h: r.h };
      await PDB.put(p); indexPhoto(p); ok++;
    } catch (e) {}
  }
  saveDraft(); render();
  toast(ok === files.length ? (ok > 1 ? `${ok} photos added` : "Photo added") : ok ? `Added ${ok} of ${files.length}. Some couldn't be read.` : "Couldn't add that photo. The phone may be out of storage.");
});
$("#sharePhotosBtn").onclick = async () => {
  const list = photoIndex.get(currentFormId()) || [];
  if (list.some(m => !formBlobs.has(m.id))) { renderFormThumbs(); toast("Getting photos ready. Tap again in a moment."); return; }
  const files = list.map((m, i) => new File([formBlobs.get(m.id)], photoName(i + 1), { type: "image/jpeg" }));
  if (await shareFiles(files) === "retry") toast("Tap Share again");
};

/* ===== Full-screen photo viewer ===== */
const viewer = { list: [], idx: 0, url: null, cur: null, deleteArmed: false };
async function openViewer(entryId, photoId) {
  viewer.list = (photoIndex.get(entryId) || []).map(m => m.id);
  viewer.idx = Math.max(0, viewer.list.indexOf(photoId));
  $("#viewer").hidden = false; document.documentElement.style.overflow = "hidden";
  await showPhoto();
}
async function showPhoto() {
  const id = viewer.list[viewer.idx]; if (!id) { closeViewer(); return; }
  let p = null; try { p = await PDB.get(id); } catch (e) {}
  if (!p) { toast("Couldn't open that photo."); closeViewer(); return; }
  viewer.cur = p;
  if (viewer.url) URL.revokeObjectURL(viewer.url);
  viewer.url = URL.createObjectURL(p.blob); $("#vImg").src = viewer.url;
  $("#vLabel").textContent = `Photo ${viewer.idx + 1} of ${viewer.list.length}`;
  $("#vPrev").disabled = viewer.idx === 0; $("#vNext").disabled = viewer.idx >= viewer.list.length - 1;
  armPhotoDelete(false);
}
function closeViewer() {
  $("#viewer").hidden = true; document.documentElement.style.overflow = "";
  if (viewer.url) { URL.revokeObjectURL(viewer.url); viewer.url = null; }
  $("#vImg").removeAttribute("src"); viewer.cur = null;
}
function armPhotoDelete(on) { viewer.deleteArmed = on; $("#vDelete").textContent = on ? "Tap again to delete" : "Delete"; }
$("#vClose").onclick = closeViewer;
$("#vPrev").onclick = () => { if (viewer.idx > 0) { viewer.idx--; showPhoto(); } };
$("#vNext").onclick = () => { if (viewer.idx < viewer.list.length - 1) { viewer.idx++; showPhoto(); } };
document.addEventListener("keydown", e => {
  if ($("#viewer").hidden) return;
  if (e.key === "Escape") closeViewer(); else if (e.key === "ArrowLeft") $("#vPrev").click(); else if (e.key === "ArrowRight") $("#vNext").click();
});
$("#vShare").onclick = async () => {
  if (!viewer.cur) return;
  if (await shareFiles([new File([viewer.cur.blob], photoName(viewer.idx + 1), { type: "image/jpeg" })]) === "retry") toast("Tap Share again");
};
$("#vDelete").onclick = async () => {
  if (!viewer.cur) return;
  if (!viewer.deleteArmed) { armPhotoDelete(true); return; }
  const id = viewer.cur.id;
  try { await PDB.del([id]); } catch (e) { toast("Couldn't delete. Try again."); return; }
  unindexPhoto(id); viewer.list.splice(viewer.idx, 1);
  if (viewer.idx >= viewer.list.length) viewer.idx = viewer.list.length - 1;
  saveDraft(); render(); toast("Photo deleted");
  if (viewer.list.length) showPhoto(); else closeViewer();
};

/* ===== Jobs for the selected day ===== */
function renderDayList() {
  const k = fDate.value || iso(new Date());
  const items = state.entries.filter(x => x.date === k).sort((a, b) => (a.start || "").localeCompare(b.start || "") || (a.createdAt || 0) - (b.createdAt || 0));
  const total = items.reduce((t, x) => t + x.hours, 0);
  $("#todayList").innerHTML = dayHeadHTML(k === iso(new Date()) ? "Today" : longDate(parse(k)), total) +
    (items.length ? items.map(entryHTML).join("") : `<p class="empty">Nothing logged for this day yet. Tap an entry later to edit it.</p>`);
}
fDate.addEventListener("change", renderDayList);

/* ===== Backup reminder ===== */
function renderBackupNotice() {
  const lb = state.prefs.lastBackup, stale = state.entries.length > 0 && (!lb || Date.now() - lb > 7 * 864e5);
  $("#backupNotice").hidden = !stale;
  if (stale) $("#backupNoticeText").textContent = lb ? "It's been over a week since your last backup." : "You haven't backed up your log yet.";
}

/* ===== Draw the page and start ===== */
function render() { renderHeader(); renderSiteChips(); renderDayList(); renderFormThumbs(); renderBackupNotice(); }

fDate.value = iso(new Date()); setHours(1); form.draftId = uid();
restoreDraft(); renderCats(); render();
loadPhotos([form.draftId]).then(() => {
  render();
  // Opened from the Week page by tapping a job: week.html sends ?edit=<entry id>
  const editId = new URLSearchParams(location.search).get("edit");
  if (editId) { history.replaceState(null, "", "index.html"); loadForEdit(editId); }
});
// When the app is reopened on a new day, move an empty form to today.
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && !form.editing && fDate.value < iso(new Date()) && !draftHasContent()) { fDate.value = iso(new Date()); render(); }
});
