/* Field Log – Timesheet page (timesheet.html): the week as a table, export to CSV, copy as text. */
"use strict";

/* ===== Employee name: saved as you type, and again when you leave the field ===== */
const fName = $("#fName");
let nameTimer;
function saveName() {
  clearTimeout(nameTimer);
  const n = fName.value.trim();
  if (n === (state.prefs.name || "")) return;
  state.prefs.name = n; saveData();
}
fName.addEventListener("input", () => { clearTimeout(nameTimer); nameTimer = setTimeout(saveName, 250); });
["change", "blur"].forEach(t => fName.addEventListener(t, saveName));
document.addEventListener("visibilitychange", () => { if (document.hidden) saveName(); });
window.addEventListener("pagehide", saveName);

/* ===== Title used for the file name, the CSV and copied text =====
   e.g. "Alex Rivera - Timesheet - Oct 19-25, 2026" */
function weekRangeLabel(a, b) {
  const M = d => d.toLocaleDateString("en-US", { month: "short" });
  if (a.getFullYear() !== b.getFullYear()) return `${M(a)} ${a.getDate()}, ${a.getFullYear()}-${M(b)} ${b.getDate()}, ${b.getFullYear()}`;
  if (a.getMonth() !== b.getMonth()) return `${M(a)} ${a.getDate()}-${M(b)} ${b.getDate()}, ${b.getFullYear()}`;
  return `${M(a)} ${a.getDate()}-${b.getDate()}, ${b.getFullYear()}`;
}
// Removes characters that aren't allowed in file names.
function fileSafe(t) { return String(t || "").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 60); }
function sheetTitle(w) { const n = fileSafe(state.prefs.name); return `${n ? n + " - " : ""}Timesheet - ${weekRangeLabel(w.start, w.end)}`; }

/* ===== Table on screen ===== */
function renderTable(w) {
  let rows = `<thead><tr><th>Date</th><th>Site</th><th>Work performed</th><th>Time</th><th class="num">Hrs</th></tr></thead><tbody>`;
  const worked = w.days.filter(d => d.items.length);
  if (!worked.length) rows += `<tr><td colspan="5" class="empty">No jobs logged this week.</td></tr>`;
  worked.forEach(d => {
    d.items.forEach((x, i) => {
      rows += `<tr><td>${i === 0 ? `${d.name} ${shortDate(d.date)}` : ""}</td><td>${esc(x.site)}</td>` +
        `<td>${esc(x.category)}${x.task ? ": " + esc(x.task) : ""}</td><td>${x.start && x.end ? x.start + "–" + x.end : ""}</td><td class="num">${fmtH(x.hours)}</td></tr>`;
    });
    rows += `<tr class="sub"><td colspan="4">${d.name} total${d.total > 8 ? " (over 8)" : ""}</td><td class="num">${fmtH(d.total)}</td></tr>`;
  });
  rows += `<tr class="grand"><td colspan="4">Week total · Regular ${fmtH(w.reg)} · Over 40: ${fmtH(w.ot)}</td><td class="num">${fmtH(w.total)}</td></tr></tbody>`;
  $("#sheetTable").innerHTML = rows;
}
function renderBySite(w) {
  const bySite = {};
  w.list.forEach(x => bySite[x.site] = (bySite[x.site] || 0) + x.hours);
  const sites = Object.entries(bySite).sort((a, b) => b[1] - a[1]);
  $("#bySite").innerHTML = sites.length
    ? sites.map(([s, h]) => `<div class="siterow"><span>${esc(s)}</span><span>${fmtH(h)}</span></div>`).join("")
    : `<p class="empty">No hours this week.</p>`;
}

/* ===== Export (CSV file) and Copy as text ===== */
function csvCell(v) { v = String(v ?? ""); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
function buildCSV(w) {
  const lines = [], row = a => lines.push(a.map(csvCell).join(","));
  row([sheetTitle(w)]); row(["Employee", state.prefs.name || ""]); row(["Week", `${iso(w.start)} to ${iso(w.end)}`]); lines.push("");
  row(["Date", "Day", "Site", "Type of work", "Work performed", "Start", "End", "Hours", "Photos"]);
  w.days.forEach(d => d.items.forEach(x => row([x.date, d.name, x.site, x.category, x.task, x.start, x.end, fmtH(x.hours), (photoIndex.get(x.id) || []).length])));
  lines.push("");
  w.days.forEach(d => row(["", d.name + " total", "", "", "", "", "", fmtH(d.total)]));
  row(["", "Regular hours", "", "", "", "", "", fmtH(w.reg)]);
  row(["", "Over 40 hours", "", "", "", "", "", fmtH(w.ot)]);
  row(["", "Week total", "", "", "", "", "", fmtH(w.total)]);
  return "﻿" + lines.join("\r\n"); // ﻿ helps Excel read special characters
}
function buildText(w) {
  let t = `${sheetTitle(w)}\n\n`;
  w.days.filter(d => d.items.length).forEach(d => {
    t += `${d.name} ${shortDate(d.date)} — ${fmtH(d.total)} hrs\n`;
    d.items.forEach(x => t += `  • ${x.site} (${x.category}) ${fmtH(x.hours)} hrs${x.start && x.end ? " " + x.start + "–" + x.end : ""}${x.task ? ": " + x.task : ""}\n`);
  });
  return t + `\nRegular: ${fmtH(w.reg)}   Over 40: ${fmtH(w.ot)}   Total: ${fmtH(w.total)} hrs`;
}
$("#csvBtn").onclick = async () => {
  saveName();
  const w = weekData(getWeekStart());
  if (!w.list.length) { toast("No entries this week to export"); return; }
  const r = await shareFile(`${sheetTitle(w)}.csv`, buildCSV(w), "text/csv");
  if (r === "retry") { toast("Tap Export timesheet again"); return; }
  if (r !== "cancelled") toast(state.prefs.name ? "Timesheet ready" : "Timesheet ready. Add your name above so it shows on the file.");
};
$("#copyBtn").onclick = () => {
  saveName();
  const t = buildText(weekData(getWeekStart()));
  const fallback = () => { const ta = $("#copyFallback"); ta.hidden = false; ta.value = t; ta.focus(); ta.select(); toast("Text selected. Tap Copy."); };
  try { navigator.clipboard.writeText(t).then(() => toast("Timesheet copied"), fallback); } catch (e) { fallback(); }
};

/* ===== Draw the page and start ===== */
function render() {
  const w = weekData(getWeekStart());
  showWeekLabels(w); renderTable(w); renderBySite(w);
}
fName.value = state.prefs.name || "";
bindWeekArrows(render);
render();
loadPhotos(); // photo counts for the CSV
