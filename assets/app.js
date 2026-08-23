// Shared logic for the workouts site. No build step, no dependencies.

// Where trainee-submitted results (weight/reps/notes) get sent. Empty string = not wired up yet;
// entries still save to the trainee's own browser, just aren't relayed anywhere.
const REPORT_ENDPOINT = "";

const RU_MONTHS = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d)) return iso;
  return `${d.getDate()} ${RU_MONTHS[d.getMonth()]}`;
}

// ---------------- Index page ----------------

async function renderIndex() {
  const listEl = document.getElementById("list");
  if (!listEl) return;
  let items = [];
  try {
    const res = await fetch("data/index.json", { cache: "no-store" });
    items = await res.json();
  } catch (e) {
    listEl.innerHTML = `<div class="empty">Не удалось загрузить список тренировок.</div>`;
    return;
  }

  if (!items.length) {
    listEl.innerHTML = `<div class="empty">Пока нет тренировок.</div>`;
    return;
  }

  items.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

  listEl.innerHTML = items.map(w => `
    <a class="card" href="workout.html?id=${encodeURIComponent(w.id)}">
      <div class="card-title">${escapeHtml(w.title)}</div>
      <div class="card-meta">
        ${w.date ? `<span>${fmtDate(w.date)}</span>` : ""}
        ${w.duration ? `<span>${escapeHtml(String(w.duration))} мин</span>` : ""}
        ${(w.tags || []).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join("")}
      </div>
    </a>
  `).join("");
}

// ---------------- Workout player page ----------------

let restTimerHandle = null;

// Each person's workout lives at its own filename (e.g. Tatiana-Z.html), which doubles as the
// workout id (data/Tatiana-Z.json). workout.html itself is the generic template and still needs
// ?id=... explicitly, since "workout" isn't a real id.
function resolveWorkoutId() {
  const fromQuery = new URLSearchParams(location.search).get("id");
  if (fromQuery) return fromQuery;
  const file = location.pathname.split("/").pop().replace(/\.html$/i, "");
  if (!file || file.toLowerCase() === "workout" || file.toLowerCase() === "index") return null;
  return file;
}

async function renderWorkout() {
  const root = document.getElementById("workout-root");
  if (!root) return;

  const id = resolveWorkoutId();
  if (!id) {
    root.innerHTML = `<div class="empty">Тренировка не указана.</div>`;
    return;
  }

  let w;
  try {
    const res = await fetch(`data/${encodeURIComponent(id)}.json`, { cache: "no-store" });
    if (!res.ok) throw new Error("not found");
    w = await res.json();
  } catch (e) {
    root.innerHTML = `<div class="empty">Тренировка не найдена.</div>`;
    return;
  }

  document.title = w.title + " — тренировки";

  // Each workout lives at its own link (one per person), so who this is doesn't need to be typed —
  // it's baked into the data itself.
  const storeKey = `workout-progress:${id}:${w.date || ""}`;
  const state = loadState(storeKey);
  const expanded = new Set();

  const allBlocks = [
    ...(w.warmup || []).map(e => ({ ...e, _section: "Разминка" })),
    ...(w.exercises || []).map(e => ({ ...e, _section: "Основная часть" })),
    ...(w.cooldown || []).map(e => ({ ...e, _section: "Заминка" })),
  ];
  const sectionCount = [w.warmup, w.exercises, w.cooldown].filter(g => g && g.length).length;

  function doneCount() {
    return Object.values(state.done).filter(Boolean).length;
  }
  function actualFor(idx) {
    return state.actuals[idx] || { weight: "", reps: "", rpe: "", pain: "", note: "" };
  }

  function draw() {
    const done = doneCount();
    const total = allBlocks.length;
    const pct = total ? Math.round((done / total) * 100) : 0;

    let sections = "";
    let lastSection = null;
    allBlocks.forEach((ex, idx) => {
      if (sectionCount > 1 && ex._section !== lastSection) {
        sections += `<div class="section-title">${ex._section}</div>`;
        lastSection = ex._section;
      }
      const isDone = !!state.done[idx];
      const isOpen = expanded.has(idx);
      const a = actualFor(idx);
      const cues = Array.isArray(ex.cues) ? ex.cues : (ex.notes ? [ex.notes] : []);
      sections += `
        <div class="exercise ${isDone ? "done" : ""}">
          ${ex.image ? `<img class="exercise-photo-full" src="${escapeAttr(ex.image)}" alt="${escapeAttr(ex.name)}">` : ""}
          <div class="exercise-head" data-toggle="${idx}">
            ${ex.image ? "" : `<div class="exercise-icon">${getExerciseIcon(ex.name)}</div>`}
            <div class="exercise-main">
              <div class="exercise-name">${escapeHtml(ex.name)}</div>
              <div class="exercise-spec">${formatSpec(ex)}</div>
            </div>
            <div class="chevron ${isOpen ? "open" : ""}">›</div>
          </div>
          <div class="action-row">
            <button class="done-toggle ${isDone ? "on" : ""}" data-done="${idx}">${isDone ? "✓ Готово" : "Готово"}</button>
            ${ex.rest ? `<button class="rest-btn" data-rest="${idx}" data-seconds="${ex.rest}">⏱ отдых ${ex.rest}с</button>` : ""}
          </div>
          ${isOpen ? `
          ${cues.length ? `<ul class="exercise-cues">${cues.map(c => `<li>${escapeHtml(c)}</li>`).join("")}</ul>` : ""}
          <div class="actual-row" data-idx="${idx}">
            <input class="actual-input" type="text" inputmode="decimal" placeholder="вес, кг" data-field="weight" data-idx="${idx}" value="${escapeAttr(a.weight)}">
            <input class="actual-input" type="text" placeholder="повторы / время" data-field="reps" data-idx="${idx}" value="${escapeAttr(a.reps)}">
            ${ex.trackRpe ? `<input class="actual-input actual-small" type="number" min="1" max="10" step="0.5" placeholder="RPE" data-field="rpe" data-idx="${idx}" value="${escapeAttr(a.rpe)}">` : ""}
            ${ex.trackPain ? `<input class="actual-input actual-small" type="number" min="0" max="10" step="1" placeholder="боль" data-field="pain" data-idx="${idx}" value="${escapeAttr(a.pain)}">` : ""}
            <input class="actual-input actual-note" type="text" placeholder="заметка" data-field="note" data-idx="${idx}" value="${escapeAttr(a.note)}">
          </div>
          <div class="sync-hint" id="sync-hint-${idx}"></div>` : ""}
        </div>
      `;
    });

    root.innerHTML = `
      ${w.subtitle || w.meta ? `
      <div class="workout-header">
        ${w.subtitle ? `<div class="workout-subtitle">${escapeHtml(w.subtitle)}</div>` : ""}
        ${w.meta ? `<div class="workout-meta">${escapeHtml(w.meta)}</div>` : ""}
      </div>` : ""}
      ${renderCallout(w.notice, "callout-notice")}
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
      <div class="progress-label"><span>${done} / ${total} упражнений</span><span>${pct}%</span></div>
      ${sections}
      ${renderAvoid(w.avoid)}
      ${renderCallout(w.progression, "callout-info")}
      ${w.footer ? `<div class="footer-note">${escapeHtml(w.footer)}</div>` : ""}
      <div class="controls">
        <button class="btn" id="reset-btn">Сбросить</button>
      </div>
    `;

    root.querySelectorAll("[data-toggle]").forEach(head => {
      head.addEventListener("click", () => {
        const idx = Number(head.dataset.toggle);
        if (expanded.has(idx)) expanded.delete(idx); else expanded.add(idx);
        draw();
      });
    });

    root.querySelectorAll("[data-done]").forEach(btn => {
      btn.addEventListener("click", (evt) => {
        evt.stopPropagation();
        const idx = Number(btn.dataset.done);
        state.done[idx] = !state.done[idx];
        saveState(storeKey, state);
        draw();
      });
    });

    root.querySelectorAll("[data-rest]").forEach(btn => {
      btn.addEventListener("click", (evt) => {
        evt.stopPropagation();
        startRestTimer(Number(btn.dataset.seconds));
      });
    });

    root.querySelectorAll(".actual-input").forEach(inp => {
      inp.addEventListener("click", (e) => e.stopPropagation());
      inp.addEventListener("change", (e) => {
        const idx = Number(inp.dataset.idx);
        const field = inp.dataset.field;
        state.actuals[idx] = { ...actualFor(idx), [field]: e.target.value };
        saveState(storeKey, state);
        syncEntry(w, allBlocks[idx], idx);
      });
    });

    document.getElementById("reset-btn").addEventListener("click", () => {
      if (!confirm("Сбросить отметки по этой тренировке?")) return;
      state.done = {};
      state.actuals = {};
      saveState(storeKey, state);
      draw();
    });
  }

  draw();
}

function renderCallout(block, cls) {
  if (!block || (!block.title && !block.body)) return "";
  return `
    <div class="callout ${cls}">
      ${block.title ? `<div class="callout-title">${escapeHtml(block.title)}</div>` : ""}
      ${block.body ? `<div class="callout-body">${escapeHtml(block.body)}</div>` : ""}
    </div>
  `;
}

function renderAvoid(block) {
  if (!block || !(block.items || []).length) return "";
  return `
    <div class="callout callout-warn">
      ${block.title ? `<div class="callout-title">${escapeHtml(block.title)}</div>` : ""}
      <ul class="avoid-list">${block.items.map(i => `<li>${escapeHtml(i)}</li>`).join("")}</ul>
    </div>
  `;
}

function formatSpec(ex) {
  if (ex.spec) return escapeHtml(ex.spec);
  const parts = [];
  if (ex.sets) parts.push(`${ex.sets} × ${ex.reps || "?"}`);
  else if (ex.reps) parts.push(String(ex.reps));
  if (ex.weight) parts.push(`${ex.weight} кг`);
  return parts.map(escapeHtml).join(" · ");
}

// Sends the single edited exercise's current values whenever the trainee finishes typing
// (debounced per exercise), instead of a manual "submit" step.
const syncTimers = {};

function syncEntry(w, ex, idx) {
  clearTimeout(syncTimers[idx]);
  syncTimers[idx] = setTimeout(() => doSyncEntry(w, ex, idx), 600);
}

async function doSyncEntry(w, ex, idx) {
  const hint = document.getElementById(`sync-hint-${idx}`);
  const stored = JSON.parse(localStorage.getItem(`workout-progress:${w.id}:${w.date || ""}`) || "{}");
  const a = (stored.actuals && stored.actuals[idx]) || { weight: "", reps: "", rpe: "", pain: "", note: "" };

  if (!a.weight && !a.reps && !a.rpe && !a.pain && !a.note) return; // nothing to send yet

  if (!REPORT_ENDPOINT) {
    if (hint) {
      hint.textContent = "Сохранено (отправка тренеру подключится позже)";
      hint.classList.remove("warn");
      setTimeout(() => { if (hint) hint.textContent = ""; }, 2500);
    }
    return;
  }

  // w.athlete identifies who this workout belongs to — set once when the workout is authored,
  // since each person gets their own link (no name entry on the page).
  const payload = {
    athlete: w.athlete || w.title,
    workoutId: w.id,
    workoutTitle: w.title,
    date: w.date,
    exercise: ex.name,
    weight: a.weight,
    reps: a.reps,
    rpe: a.rpe,
    pain: a.pain,
    note: a.note,
    updatedAt: new Date().toISOString(),
  };

  try {
    await fetch(REPORT_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (hint) {
      hint.textContent = "✓ отправлено тренеру";
      hint.classList.remove("warn");
      setTimeout(() => { if (hint) hint.textContent = ""; }, 2000);
    }
  } catch (e) {
    if (hint) { hint.textContent = "Не отправилось — сохранено локально, попробую ещё раз позже"; hint.classList.add("warn"); }
  }
}

function loadState(key) {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      return { done: parsed.done || {}, actuals: parsed.actuals || {} };
    }
  } catch (e) {}
  return { done: {}, actuals: {} };
}

function saveState(key, state) {
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch (e) {}
}

// ---------------- Rest timer ----------------

function startRestTimer(seconds) {
  const banner = document.getElementById("timer-banner");
  const label = document.getElementById("timer-label");
  const skipBtn = document.getElementById("timer-skip");
  if (!banner) return;

  clearInterval(restTimerHandle);
  let remaining = seconds;
  banner.classList.add("active");
  label.textContent = `Отдых: ${remaining}с`;

  restTimerHandle = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(restTimerHandle);
      banner.classList.remove("active");
      beep();
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      return;
    }
    label.textContent = `Отдых: ${remaining}с`;
  }, 1000);

  skipBtn.onclick = () => {
    clearInterval(restTimerHandle);
    banner.classList.remove("active");
  };
}

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = 880;
    o.connect(g);
    g.connect(ctx.destination);
    g.gain.setValueAtTime(0.2, ctx.currentTime);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    o.stop(ctx.currentTime + 0.6);
  } catch (e) {}
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function escapeAttr(s) {
  return escapeHtml(s || "");
}

document.addEventListener("DOMContentLoaded", () => {
  renderIndex();
  renderWorkout();
});
