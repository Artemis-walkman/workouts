// Trainer-only page: reads submitted training-log entries from the Apps Script backend
// (assets/app.js defines REPORT_ENDPOINT). The viewing password lives only in the trainer's
// own browser (localStorage) and in the Apps Script's Script Properties — it is never
// committed to this public repo, unlike SYNC_TOKEN.

const REVIEW_KEY_STORAGE = "workout-review-key";

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
    key = prompt("Пароль для просмотра:") || "";
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

  root.innerHTML = data.entries.map(entryCard).join("");
}

function entryCard(e) {
  const stats = [];
  if (e.weight) stats.push(`вес ${e.weight}`);
  if (e.reps) stats.push(`повторы ${e.reps}`);
  if (e.rpe) stats.push(`RPE ${e.rpe}`);
  if (e.pain) stats.push(`боль ${e.pain}`);

  return `
    <div class="review-entry">
      <div class="review-entry-head">
        <span class="review-athlete">${escapeHtml(e.athlete || "")}</span>
        <span class="review-time">${fmtTimestamp(e.timestamp)}</span>
      </div>
      <div class="review-exercise">${escapeHtml(e.exercise || "")}</div>
      ${e.workoutTitle ? `<div class="review-workout">${escapeHtml(e.workoutTitle)}</div>` : ""}
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
