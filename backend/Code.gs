// Backend for the workouts site's review page — stores trainee-submitted training-log
// entries in a Google Sheet and serves them back to the trainer-only review.html page.
//
// SETUP:
// 1. Create a new Google Sheet (sheets.new).
// 2. Extensions > Apps Script. Delete the placeholder code and paste this whole file in.
// 3. In the function dropdown (top toolbar) select "setup", click Run once. This stores
//    your private viewing password (edit the string below first!). Grant the permissions
//    it asks for — this project only touches the one sheet it's attached to.
// 4. Deploy > New deployment > type: Web app. Execute as: Me. Who has access: Anyone.
//    Click Deploy, authorize again if asked, then copy the Web App URL.
// 5. Send that URL back so it can be set as REPORT_ENDPOINT in assets/app.js.
//
// UPDATING this code later: paste the new version, then Deploy > Manage deployments > pencil
// (Edit) > Version: New version > Deploy. Don't create a *new* deployment — that changes the URL.

const SHEET_NAME = "log";

// Must match SYNC_TOKEN in assets/app.js. Not a real secret (app.js is public) — just
// keeps random bots from filling the sheet with junk.
const WRITE_TOKEN = "Vh63qdFj6Jr8ggJ0ikuF0RrH";

// Sheet columns, in order. The first ten are the original layout; the session columns were added
// later at the end, so rows written before them simply have those cells empty.
const COLUMNS = [
  "timestamp", "workoutId", "athlete", "workoutTitle", "exercise", "weight", "reps", "rpe", "pain", "note",
  "sessionId", "sessionTitle", "sessionDate", "exerciseIdx", "key",
];
const KEY_COL = COLUMNS.indexOf("key") + 1;

function doPost(e) {
  return withJson(() => {
    const body = JSON.parse(e.postData.contents);
    if (body.token !== WRITE_TOKEN) return { ok: false, error: "unauthorized" };

    // One row per client + session + exercise: re-editing a field updates that row instead of
    // appending a new one. Requests without a sessionId (an old cached copy of the site) append.
    const hasSession = body.sessionId !== undefined && body.sessionId !== "";
    const key = hasSession ? [body.workoutId, body.sessionId, body.exerciseIdx].join("|") : "";
    const values = [
      body.workoutId || "",
      body.athlete || "",
      body.workoutTitle || "",
      body.exercise || "",
      body.weight || "",
      body.reps || "",
      body.rpe || "",
      body.pain || "",
      body.note || "",
      body.sessionId || "",
      body.sessionTitle || "",
      body.sessionDate || "",
      hasSession ? String(body.exerciseIdx) : "",
      key,
    ];

    const lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      const sheet = getSheet();
      const row = (key && findRowByKey(sheet, key)) || sheet.getLastRow() + 1;
      sheet.getRange(row, 1).setValue(new Date());
      // Plain-text format so Sheets doesn't turn ids/dates like "2026-09-04" or "8" into Date/number.
      sheet.getRange(row, 2, 1, values.length).setNumberFormat("@").setValues([values]);
    } finally {
      lock.releaseLock();
    }
    return { ok: true };
  });
}

function findRowByKey(sheet, key) {
  const last = sheet.getLastRow();
  if (last < 2) return 0;
  const keys = sheet.getRange(2, KEY_COL, last - 1, 1).getValues();
  for (let i = keys.length - 1; i >= 0; i--) {
    if (keys[i][0] === key) return i + 2;
  }
  return 0;
}

function doGet(e) {
  return withJson(() => {
    const viewToken = (PropertiesService.getScriptProperties().getProperty("VIEW_TOKEN") || "").trim();
    const suppliedKey = (e.parameter.key || "").trim();
    if (!viewToken || suppliedKey !== viewToken) return { ok: false, error: "unauthorized" };
    const rows = getSheet().getDataRange().getValues().slice(1); // skip header row
    const entries = rows
      .map(r => Object.fromEntries(COLUMNS.map((c, i) => [c, r[i] === undefined ? "" : r[i]])))
      .reverse(); // roughly newest first; review.html sorts by timestamp itself
    return { ok: true, entries };
  });
}

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  // Creates the header on a new sheet, and extends an older sheet's header with the new columns.
  if (sheet.getLastColumn() < COLUMNS.length) {
    sheet.getRange(1, 1, 1, COLUMNS.length).setValues([COLUMNS]);
  }
  return sheet;
}

function withJson(fn) {
  const result = fn();
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

// Run this once from the Apps Script editor (function dropdown > setup > Run) before
// deploying. Change the password first — this is what review.html will ask you for.
function setup() {
  PropertiesService.getScriptProperties().setProperty("VIEW_TOKEN", "choose-a-password-here".trim());
}

// Run this from the editor (function dropdown > checkViewToken > Run), then View > Logs,
// to see the password currently stored — handy for checking for stray spaces without
// having to guess. Does not print anything sensitive beyond the password itself.
function checkViewToken() {
  const v = PropertiesService.getScriptProperties().getProperty("VIEW_TOKEN") || "";
  Logger.log("VIEW_TOKEN is currently: [%s] (length %s)", v, v.length);
}
