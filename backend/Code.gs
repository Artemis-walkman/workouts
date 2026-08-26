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

const SHEET_NAME = "log";

// Must match SYNC_TOKEN in assets/app.js. Not a real secret (app.js is public) — just
// keeps random bots from filling the sheet with junk.
const WRITE_TOKEN = "Vh63qdFj6Jr8ggJ0ikuF0RrH";

function doPost(e) {
  return withJson(() => {
    const body = JSON.parse(e.postData.contents);
    if (body.token !== WRITE_TOKEN) return { ok: false, error: "unauthorized" };
    getSheet().appendRow([
      new Date(),
      body.workoutId || "",
      body.athlete || "",
      body.workoutTitle || "",
      body.exercise || "",
      body.weight || "",
      body.reps || "",
      body.rpe || "",
      body.pain || "",
      body.note || "",
    ]);
    return { ok: true };
  });
}

function doGet(e) {
  return withJson(() => {
    const viewToken = (PropertiesService.getScriptProperties().getProperty("VIEW_TOKEN") || "").trim();
    const suppliedKey = (e.parameter.key || "").trim();
    if (!viewToken || suppliedKey !== viewToken) return { ok: false, error: "unauthorized" };
    const rows = getSheet().getDataRange().getValues().slice(1); // skip header row
    const entries = rows.map(r => ({
      timestamp: r[0],
      workoutId: r[1],
      athlete: r[2],
      workoutTitle: r[3],
      exercise: r[4],
      weight: r[5],
      reps: r[6],
      rpe: r[7],
      pain: r[8],
      note: r[9],
    })).reverse(); // newest first
    return { ok: true, entries };
  });
}

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(["timestamp", "workoutId", "athlete", "workoutTitle", "exercise", "weight", "reps", "rpe", "pain", "note"]);
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
