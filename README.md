# Field Log

A phone app for logging field work: date, site, type of work, what was done, hours and photos.
It works offline and keeps everything on the phone. Live at https://redbeard691.github.io/field-log/

## Files

| File | What it is |
|---|---|
| `index.html` + `js/log.js` | **Log** tab: add, edit and delete jobs, add photos, view photos full screen |
| `week.html` + `js/week.js` | **Week** tab: weekly totals, hours-per-day chart, all jobs in the week |
| `timesheet.html` + `js/timesheet.js` | **Timesheet** tab: employee name, timesheet table, CSV export, copy as text |
| `backup.html` + `js/backup.js` | **Backup** tab: save/restore backup files, saved sites, app version |
| `js/common.js` | Code every page uses: saved data, photo storage, header, job cards, sharing files |
| `css/styles.css` | All styling, in labelled sections |
| `sw.js` | Offline support: saves the app files on the phone |
| `manifest.webmanifest`, `icon-*.png` | Home-screen name and icon |

Each page loads `js/common.js` first, then its own script.

## Where data is stored (all on the phone)

- **localStorage `fieldlog.data.v1`**: entries, saved sites, employee name, last backup date
- **localStorage `fieldlog.draft.v1`**: the unsaved entry on the Log tab
- **IndexedDB `fieldlog-photos`**: photos (full size and thumbnail) linked to entries by `entryId`
- **sessionStorage `fieldlog.week`**: which week is shown on the Week and Timesheet tabs

## Making a change

1. Edit the files.
2. Bump `VERSION` in `sw.js` and `APP_VERSION` in `js/common.js`. Without this, phones keep the old version.
3. If you added a file, add it to `FILES` in `sw.js`.
4. Push to `main`. GitHub Pages publishes in a minute or two; phones pick it up the next time the app is opened with signal.

To change the work types, edit `CATS` at the top of `js/common.js`.
