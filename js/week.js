/* Field Log – Week page (week.html): totals, a day-by-day chart, and every job in the week. */
"use strict";

function renderStats(w) {
  const daysWorked = w.days.filter(d => d.items.length).length;
  $("#weekStats").innerHTML =
    `<div><b>${fmtH(w.total)}</b><span>Total hrs</span></div>` +
    `<div class="${w.ot > 0 ? "ot" : ""}"><b>${fmtH(w.ot)}</b><span>Over 40</span></div>` +
    `<div><b>${daysWorked}</b><span>Days worked</span></div>`;
}

// Bar chart: one bar per day, with a dashed line at 8 hours. Days over 8 are orange.
function renderChart(w) {
  const max = Math.max(10, ...w.days.map(d => d.total)), px = h => h / max * 96;
  $("#weekBars").innerHTML = `<div class="eight" style="bottom:${px(8)}px"><span>8h</span></div>` +
    w.days.map(d => `<div class="bar ${d.total === 0 ? "zero" : d.total > 8 ? "over" : ""}" style="height:${Math.max(2, px(d.total))}px"></div>`).join("");
  $("#weekBarLabels").innerHTML = w.days.map(d => `<div>${d.name}<b>${d.total ? fmtH(d.total) : "–"}</b></div>`).join("");
}

function renderDays(w) {
  const worked = w.days.filter(d => d.items.length);
  $("#weekDays").innerHTML = worked.length
    ? worked.map(d => `<div class="day">${dayHeadHTML(longDate(d.date), d.total)}${d.items.map(entryHTML).join("")}</div>`).join("")
    : `<p class="empty">No jobs logged this week. Use the Log tab to add your first one.</p>`;
}

function render() {
  const w = weekData(getWeekStart());
  showWeekLabels(w); renderStats(w); renderChart(w); renderDays(w);
}

// Tapping a job opens it for editing on the Log page.
document.addEventListener("click", e => {
  const b = e.target.closest("[data-edit]");
  if (b) location.href = "index.html?edit=" + encodeURIComponent(b.dataset.edit);
});

bindWeekArrows(render);
render();
loadPhotos().then(render); // adds photo thumbnails once they're read
