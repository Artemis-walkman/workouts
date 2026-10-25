// Trainer-only page: reads submitted training-log entries from the Apps Script backend
// (assets/app.js defines REPORT_ENDPOINT). The viewing password lives only in the trainer's
// own browser (localStorage) and in the Apps Script's Script Properties — it is never
// committed to this public repo, unlike SYNC_TOKEN.

const REVIEW_KEY_STORAGE = "workout-review-key";
const REVIEW_FILTER_STORAGE = "workout-review-athlete";

document.addEventListener("DOMContentLoaded", () => {
  const root = document.getElementById("review-root");
  if (!root) return;
  renderReview(root);
});

async function renderReview(root) {
  if (!REPORT_ENDPOINT) {
    root.innerHTML = `<div class="empty">Бэкенд ещё не подключён — задайте REPORT_ENDPOINT в assets/app.js.</div>`;
    return;
  }

  let key = localStorage.getItem(REVIEW_KEY_STORAGE) || "";
  if (!key) {
    key = (prompt("Пароль для просмотра:") || "").trim();
    if (!key) {
      root.innerHTML = `<div class="empty">Нужен пароль для просмотра.</div>`;
      return;
    }
    localStorage.setItem(REVIEW_KEY_STORAGE, key);
  }

  root.innerHTML = `<div class="empty">Загрузка…</div>`;

  let data;
  try {
    const res = await fetch(`${REPORT_ENDPOINT}?key=${encodeURIComponent(key)}`, { cache: "no-store" });
    data = await res.json();
  } catch (e) {
    root.innerHTML = `<div class="empty">Не удалось загрузить данные.</div>`;
    return;
  }

  if (!data.ok) {
    localStorage.removeItem(REVIEW_KEY_STORAGE);
    root.innerHTML = `<div class="empty">Неверный пароль. <a href="#" id="retry-link">Попробовать снова</a></div>`;
    document.getElementById("retry-link").addEventListener("click", (e) => {
      e.preventDefault();
      renderReview(root);
    });
    return;
  }

  if (!data.entries.length) {
    root.innerHTML = `<div class="empty">Пока нет записей.</div>`;
    return;
  }

  drawReview(root, latestPerExercise(data.entries));
}

function entryTime(e) {
  const t = new Date(e.timestamp).getTime();
  return isNaN(t) ? 0 : t;
}

function athleteOf(e) {
  return String(e.athlete || "—");
}

// Rows written before sessions existed have no sessionId — group those by workout title instead.
function sessionKeyOf(e) {
  return e.sessionId !== "" && e.sessionId !== undefined
    ? `s|${e.workoutId}|${e.sessionId}`
    : `t|${e.workoutId}|${e.workoutTitle}`;
}

function hasIdx(e) {
  return e.exerciseIdx !== "" && e.exerciseIdx !== undefined;
}

// The backend now updates one row per exercise, but older rows hold every edit as its own row —
// keep only the newest version of each exercise.
function latestPerExercise(entries) {
  const byKey = new Map();
  entries.forEach(e => {
    const k = [athleteOf(e), sessionKeyOf(e), hasIdx(e) ? e.exerciseIdx : e.exercise].join("|");
    const prev = byKey.get(k);
    if (!prev || entryTime(e) >= entryTime(prev)) byKey.set(k, e);
  });
  return [...byKey.values()];
}

function drawReview(root, entries) {
  const athletes = [...new Set(entries.map(athleteOf))].sort((a, b) => a.localeCompare(b, "ru"));
  let filter = localStorage.getItem(REVIEW_FILTER_STORAGE) || "";
  if (!athletes.includes(filter)) filter = "";

  const groups = new Map();
  entries
    .filter(e => !filter || athleteOf(e) === filter)
    .forEach(e => {
      const k = `${athleteOf(e)}|${sessionKeyOf(e)}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(e);
    });

  const sessions = [...groups.values()]
    .map(items => ({
      items: items.sort((a, b) => hasIdx(a) && hasIdx(b) ? Number(a.exerciseIdx) - Number(b.exerciseIdx) : entryTime(a) - entryTime(b)),
      latest: Math.max(...items.map(entryTime)),
    }))
    .sort((a, b) => b.latest - a.latest);

  const filterBtn = (value, label) =>
    `<button class="review-filter-btn ${filter === value ? "active" : ""}" data-athlete="${escapeAttr(value)}">${escapeHtml(label)}</button>`;

  root.innerHTML = `
    <div class="review-toolbar">
      <div class="review-filter">
        ${athletes.length > 1 ? filterBtn("", "Все") : ""}
        ${athletes.map(a => filterBtn(a, a)).join("")}
      </div>
      <button class="review-refresh" id="review-refresh">Обновить</button>
    </div>
    ${sessions.map(sessionCard).join("")}
  `;

  root.querySelectorAll("[data-athlete]").forEach(btn => {
    btn.addEventListener("click", () => {
      localStorage.setItem(REVIEW_FILTER_STORAGE, btn.dataset.athlete);
      drawReview(root, entries);
    });
  });
  document.getElementById("review-refresh").addEventListener("click", () => renderReview(root));
}

function sessionCard({ items, latest }) {
  const first = items[0];
  const title = first.sessionTitle || first.workoutTitle || "Тренировка";
  const planned = String(first.sessionDate || "").slice(0, 10);
  const meta = [];
  if (planned) meta.push(`план ${fmtDate(planned)}`);
  if (latest) meta.push(`обновлено ${fmtTimestamp(latest)}`);

  return `
    <div class="review-session">
      <div class="review-session-head">
        <div><span class="review-athlete">${escapeHtml(athleteOf(first))}</span> · ${escapeHtml(title)}</div>
        <div class="review-session-meta">${meta.map(escapeHtml).join(" · ")}</div>
      </div>
      ${items.map(exerciseRow).join("")}
    </div>
  `;
}

function exerciseRow(e) {
  const stats = [];
  if (e.weight !== "") stats.push(`вес ${e.weight}`);
  if (e.reps !== "") stats.push(`повторы ${e.reps}`);
  if (e.rpe !== "") stats.push(`RPE ${e.rpe}`);
  if (e.pain !== "") stats.push(`боль ${e.pain}`);

  return `
    <div class="review-row">
      <div class="review-exercise">${escapeHtml(e.exercise || "")}</div>
      ${stats.length ? `<div class="review-stats">${stats.map(escapeHtml).join(" · ")}</div>` : ""}
      ${e.note ? `<div class="review-note">${escapeHtml(e.note)}</div>` : ""}
    </div>
  `;
}

function fmtTimestamp(ts) {
  const d = new Date(ts);
  if (isNaN(d)) return String(ts || "");
  return d.toLocaleString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
