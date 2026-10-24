/* Field Log – Backup page (backup.html): save/restore a backup file, saved sites, app version. */
"use strict";

/* ===== Status lines ===== */
function renderStatus() {
  const n = state.entries.length, lb = state.prefs.lastBackup, pc = photoCount();
  $("#backupStatus").textContent = `${n} entr${n === 1 ? "y" : "ies"} on this phone. ` +
    (lb ? `Last backup: ${new Date(lb).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}.` : "No backup yet.");
  if (!photosOK) { $("#photoStatus").textContent = ""; return; }
  const photos = `${pc} photo${pc === 1 ? "" : "s"} saved`;
  $("#photoStatus").textContent = photos + ".";
  if (navigator.storage && navigator.storage.estimate) {
    navigator.storage.estimate().then(st => { $("#photoStatus").textContent = `${photos} · about ${((st.usage || 0) / 1048576).toFixed(1)} MB used on this phone.`; }).catch(() => {});
  }
}

/* ===== Saved sites ===== */
function renderSites() {
  $("#savedSites").innerHTML = state.prefs.sites.length
    ? state.prefs.sites.map(s => `<div><span>${esc(s)}</span><button type="button" class="btn ghost small" data-rmsite="${esc(s)}">Remove</button></div>`).join("")
    : `<p class="empty">No saved sites yet.</p>`;
}
$("#savedSites").addEventListener("click", e => {
  const b = e.target.closest("[data-rmsite]"); if (!b) return;
  state.prefs.sites = state.prefs.sites.filter(s => s !== b.dataset.rmsite);
  saveData(); resetBackupBtn(); render(); toast("Site removed");
});

/* ===== Converting photos to text for the backup file, and back ===== */
function blobToDataURL(b) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(b); }); }
function dataURLToBlob(d) {
  const k = d.indexOf(","), head = d.slice(0, k), bin = atob(d.slice(k + 1)), a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return new Blob([a], { type: (head.match(/:(.*?);/) || [])[1] || "image/jpeg" });
}

/* ===== Save backup =====
   Without photos: one tap saves the file.
   With photos: the first tap prepares the file, the second tap saves it
   (iPhone only allows the share sheet straight after a tap). */
let readyBackup = null;
function resetBackupBtn() { readyBackup = null; const b = $("#backupBtn"); b.disabled = false; b.textContent = "Save backup"; }
function sizeLabel(bytes) { return bytes < 1048576 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1048576).toFixed(1)} MB`; }

async function buildBackupFile(btn) {
  const ids = new Set(state.entries.map(e => e.id));
  const head = JSON.stringify({ app: "field-log", version: 2, exportedAt: new Date().toISOString(), entries: state.entries, prefs: { sites: state.prefs.sites, name: state.prefs.name } });
  const parts = [head.slice(0, -1)]; let n = 0; // leave the closing } off so photos can be added
  if ($("#incPhotos").checked && photosOK && photoCount() > 0) {
    btn.disabled = true; btn.textContent = "Preparing backup…";
    const all = await PDB.all(); parts.push(',"photos":[');
    for (const p of all) {
      if (!ids.has(p.entryId)) continue;
      parts.push((n ? "," : "") + JSON.stringify({ id: p.id, entryId: p.entryId, createdAt: p.createdAt, w: p.w, h: p.h, data: await blobToDataURL(p.blob), thumb: await blobToDataURL(p.thumb) }));
      n++; btn.textContent = `Preparing backup… ${n}`;
    }
    parts.push("]");
  }
  parts.push("}");
  return { file: new File(parts, `field-log-backup_${iso(new Date())}.json`, { type: "application/json" }), photos: n };
}
async function doBackup() {
  const btn = $("#backupBtn");
  if (readyBackup) {
    const r = await shareFiles([readyBackup]);
    if (r === "retry") { btn.textContent = "Save backup file"; toast("Backup ready. Tap Save backup file."); return; }
    if (r === "cancelled") { toast("Backup not saved. Tap the button to try again."); return; }
    resetBackupBtn(); state.prefs.lastBackup = Date.now(); saveData(); render(); toast("Backup saved");
    return;
  }
  let built;
  try { built = await buildBackupFile(btn); } catch (e) { resetBackupBtn(); toast("Couldn't read the photos for the backup."); return; }
  readyBackup = built.file;
  if (built.photos > 0) { btn.disabled = false; btn.textContent = `Save backup file (${sizeLabel(readyBackup.size)})`; toast("Backup ready. Tap the button to save it."); return; }
  return doBackup();
}
$("#backupBtn").onclick = doBackup;

/* ===== Restore from a backup file ===== */
let pendingRestore = null;
$("#restoreBtn").onclick = () => $("#restoreFile").click();
$("#restoreFile").addEventListener("change", async e => {
  const f = e.target.files[0]; e.target.value = ""; if (!f) return;
  try {
    const o = JSON.parse(await f.text());
    if (o.app !== "field-log" || !Array.isArray(o.entries)) throw 0;
    pendingRestore = o;
    const photos = Array.isArray(o.photos) && o.photos.length ? ` and ${o.photos.length} photos` : "";
    $("#restoreText").textContent = `This backup has ${o.entries.length} entries${photos} from ${o.exportedAt ? new Date(o.exportedAt).toLocaleDateString() : "an earlier date"}. Add them to your current log, or replace your log with the backup?`;
    $("#restoreConfirm").hidden = false;
  } catch (err) { toast("That file isn't a Field Log backup."); }
});
async function finishRestore(replace) {
  if (!pendingRestore) return;
  const o = pendingRestore; pendingRestore = null; $("#restoreConfirm").hidden = true;
  if (replace) {
    const keep = new Set(o.entries.map(x => x.id)), draftId = storedDraftId();
    [...photoIndex.keys()].forEach(eid => { if (!keep.has(eid) && eid !== draftId) deletePhotosFor(eid); });
    state.entries = o.entries;
  } else {
    const ids = new Set(state.entries.map(x => x.id));
    o.entries.forEach(x => { if (!ids.has(x.id)) state.entries.push(x); });
  }
  state.prefs.sites = [...new Set([...(state.prefs.sites || []), ...((o.prefs && o.prefs.sites) || [])])];
  if (!state.prefs.name && o.prefs && o.prefs.name) state.prefs.name = o.prefs.name;
  saveData(); resetBackupBtn(); render();

  let added = 0, failed = 0;
  if (Array.isArray(o.photos) && o.photos.length && photosOK) {
    toast("Restoring photos…");
    const ids = new Set(state.entries.map(x => x.id)), have = new Set();
    photoIndex.forEach(a => a.forEach(m => have.add(m.id)));
    for (const ph of o.photos) {
      if (!ph || !ids.has(ph.entryId) || have.has(ph.id) || !ph.data) continue;
      try {
        const p = { id: ph.id, entryId: ph.entryId, createdAt: ph.createdAt || Date.now(), w: ph.w, h: ph.h, blob: dataURLToBlob(ph.data), thumb: dataURLToBlob(ph.thumb || ph.data) };
        await PDB.put(p); indexPhoto(p); added++;
      } catch (e) { failed++; }
    }
  }
  render();
  toast((replace ? "Log replaced from backup" : "Backup entries added") + (added ? ` with ${added} photo${added === 1 ? "" : "s"}` : "") + (failed ? `. ${failed} photos couldn't be restored.` : ""));
}
$("#restoreMerge").onclick = () => finishRestore(false);
$("#restoreReplace").onclick = () => finishRestore(true);
$("#restoreCancel").onclick = () => { pendingRestore = null; $("#restoreConfirm").hidden = true; };

/* ===== Draw the page and start ===== */
function render() {
  renderHeader(); renderStatus(); renderSites();
  $("#aboutText").textContent = `Version ${APP_VERSION}. Works offline. Entries and photos never leave this phone unless you export, share or back them up.`;
}
render();
loadPhotos().then(render);
