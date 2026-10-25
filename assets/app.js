// Shared logic for the workouts site. No build step, no dependencies.

// Where trainee-submitted results (weight/reps/notes) get sent. Empty string = not wired up yet;
// entries still save to the trainee's own browser, just aren't relayed anywhere.
// Set this to the Google Apps Script Web App URL after deploying (see review.html / SETUP.md).
const REPORT_ENDPOINT = "https://script.google.com/macros/s/AKfycbw2phh72zDp4_Nrb4tj5NVbSoX5wboKdCfw8G61HCZsQrM4tol8F2kz2UvCXvw1XLy9/exec";

// Anti-spam token, not a real secret (this file is public). Must match WRITE_TOKEN in the
// Apps Script backend so random bots can't fill the sheet with junk.
const SYNC_TOKEN = "Vh63qdFj6Jr8ggJ0ikuF0RrH";

const RU_MONTHS = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const RU_WEEKDAYS = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d)) return iso;
  return `${d.getDate()} ${RU_MONTHS[d.getMonth()]}`;
}

// "пн 27 окт", or "пн 27" when short
function fmtWeekday(iso, short) {
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d)) return iso;
  return `${RU_WEEKDAYS[d.getDay()]} ${short ? d.getDate() : fmtDate(iso)}`;
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

// Fields a client file can set once at the top level; a session's own value wins over them.
const SHARED_SESSION_FIELDS = ["meta", "notice", "avoid", "progression", "footer"];

// A client file holds every session they've been given, grouped into blocks — the last block is the
// current one, earlier ones are the archive. Files in the older single-workout shape become one block
// with one session whose id is its date: that keeps the localStorage key
// `workout-progress:<id>:<date>` unchanged, so progress entered before the migration survives.
function normalizeProgram(raw, id) {
  const blocks = Array.isArray(raw.blocks) && raw.blocks.length
    ? raw.blocks
    : [{ title: "", sessions: [{ ...raw, id: raw.date || "main" }] }];
  const shared = {};
  SHARED_SESSION_FIELDS.forEach(f => { if (raw[f] !== undefined) shared[f] = raw[f]; });
  return {
    id,
    athlete: raw.athlete || "",
    blocks: blocks.map(b => ({
      title: b.title || "",
      sessions: (b.sessions || []).map(s => ({ ...shared, ...s, id: String(s.id || s.date || "") })),
    })).filter(b => b.sessions.length),
  };
}

function sessionItems(s) {
  return [
    ...(s.warmup || []).map(e => ({ ...e, _section: "Разминка" })),
    ...(s.exercises || []).map(e => ({ ...e, _section: "Основная часть" })),
    ...(s.cooldown || []).map(e => ({ ...e, _section: "Заминка" })),
  ];
}

function sessionStoreKey(program, s) {
  return `workout-progress:${program.id}:${s.id}`;
}

function sessionStatus(program, s) {
  const total = sessionItems(s).length;
  const done = Object.values(loadState(sessionStoreKey(program, s)).done).filter(Boolean).length;
  return { done, total, complete: total > 0 && done >= total };
}

// Sessions are done in order and the date is only a guide, so without an explicit #id the page
// opens the first unfinished session of the current block.
function pickSession(program) {
  let wanted = location.hash.slice(1);
  try { wanted = decodeURIComponent(wanted); } catch (e) {}
  const byHash = program.blocks.flatMap(b => b.sessions).find(s => s.id === wanted);
  if (byHash) return byHash;
  const current = program.blocks[program.blocks.length - 1].sessions;
  return current.find(s => !sessionStatus(program, s).complete) || current[current.length - 1];
}

function renderSessionNav(program, session) {
  const block = program.blocks[program.blocks.length - 1];
  const pills = block.sessions.map((s, i) => {
    const st = sessionStatus(program, s);
    const cls = ["session-pill", s.id === session.id ? "active" : "", st.complete ? "done" : ""].join(" ");
    return `
      <a class="${cls}" href="#${encodeURIComponent(s.id)}">
        <span class="session-pill-num">${st.complete ? "✓" : i + 1}</span>
        <span class="session-pill-date">${s.date ? fmtWeekday(s.date, true) : escapeHtml(s.title || "")}</span>
      </a>`;
  }).join("");
  return `
    ${block.title ? `<div class="session-block-title">${escapeHtml(block.title)}</div>` : ""}
    <nav class="session-nav">${pills}</nav>
  `;
}

function renderSessionHeading(program, session) {
  const block = program.blocks.find(b => b.sessions.includes(session));
  const pos = block.sessions.indexOf(session) + 1;
  const parts = [`${pos} из ${block.sessions.length}`];
  if (session.date) parts.push(`план: ${fmtWeekday(session.date)}`);
  return `
    <div class="session-heading">
      <div class="session-title">${escapeHtml(session.title || "Тренировка")}</div>
      <div class="session-meta">${parts.map(escapeHtml).join(" · ")}</div>
    </div>
  `;
}

function renderArchive(program, session) {
  const past = program.blocks.slice(0, -1).reverse();
  const count = past.reduce((n, b) => n + b.sessions.length, 0);
  if (!count) return "";
  const open = past.some(b => b.sessions.includes(session));
  return `
    <details class="archive" ${open ? "open" : ""}>
      <summary>Прошедшие тренировки (${count})</summary>
      ${past.map(b => `
        ${b.title ? `<div class="archive-block-title">${escapeHtml(b.title)}</div>` : ""}
        ${b.sessions.map(s => {
          const st = sessionStatus(program, s);
          return `
            <a class="archive-link ${s === session ? "active" : ""}" href="#${encodeURIComponent(s.id)}">
              <span>${st.complete ? "✓ " : ""}${escapeHtml(s.title || s.id)}${s.subtitle ? ` · ${escapeHtml(s.subtitle)}` : ""}</span>
              <span class="archive-meta">${s.date ? fmtDate(s.date) + " · " : ""}${st.done}/${st.total}</span>
            </a>`;
        }).join("")}
      `).join("")}
    </details>
  `;
}

async function renderWorkout() {
  const root = document.getElementById("workout-root");
  if (!root) return;

  const id = resolveWorkoutId();
  if (!id) {
    root.innerHTML = `<div class="empty">Тренировка не указана.</div>`;
    return;
  }

  let program;
  try {
    const res = await fetch(`data/${encodeURIComponent(id)}.json`, { cache: "no-store" });
    if (!res.ok) throw new Error("not found");
    program = normalizeProgram(await res.json(), id);
  } catch (e) {
    root.innerHTML = `<div class="empty">Тренировка не найдена.</div>`;
    return;
  }

  if (!program.blocks.length) {
    root.innerHTML = `<div class="empty">Тренировок пока нет.</div>`;
    return;
  }

  showSession(root, program, pickSession(program));
  window.addEventListener("hashchange", () => {
    showSession(root, program, pickSession(program));
    window.scrollTo(0, 0);
  });
}

function showSession(root, program, w) {
  // With a single session the page looks exactly like the old one-workout page.
  const multi = program.blocks.reduce((n, b) => n + b.sessions.length, 0) > 1;
  document.title = `${w.title || "Тренировка"} — ${program.athlete || "тренировки"}`;

  // Each client has their own link, so who this is doesn't need to be typed — it's baked into the
  // data itself; each session keeps its own progress.
  const storeKey = sessionStoreKey(program, w);
  const state = loadState(storeKey);
  const expanded = new Set();

  const allBlocks = sessionItems(w);
  const sectionCount = [w.warmup, w.exercises, w.cooldown].filter(g => g && g.length).length;
  const syncCtx = { program, session: w, storeKey, items: allBlocks };

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
      ${multi ? renderSessionNav(program, w) + renderSessionHeading(program, w) : ""}
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
      ${renderArchive(program, w)}
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
        syncEntry(syncCtx, idx);
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

function syncEntry(ctx, idx) {
  const timerKey = `${ctx.storeKey}:${idx}`;
  clearTimeout(syncTimers[timerKey]);
  syncTimers[timerKey] = setTimeout(() => doSyncEntry(ctx, idx), 600);
}

async function doSyncEntry({ program, session, storeKey, items }, idx) {
  const ex = items[idx];
  const hint = document.getElementById(`sync-hint-${idx}`);
  const a = loadState(storeKey).actuals[idx] || { weight: "", reps: "", rpe: "", pain: "", note: "" };

  if (!a.weight && !a.reps && !a.rpe && !a.pain && !a.note) return; // nothing to send yet

  if (!REPORT_ENDPOINT) {
    if (hint) {
      hint.textContent = "Сохранено (отправка тренеру подключится позже)";
      hint.classList.remove("warn");
      setTimeout(() => { if (hint) hint.textContent = ""; }, 2500);
    }
    return;
  }

  // program.athlete identifies who this belongs to — set once when the program is authored, since
  // each person gets their own link (no name entry on the page). workoutId + sessionId + exerciseIdx
  // is the row key the backend upserts on, so re-editing a field updates that row instead of adding one.
  const payload = {
    token: SYNC_TOKEN,
    athlete: program.athlete || session.title,
    workoutId: program.id,
    workoutTitle: session.title,
    date: session.date,
    sessionId: session.id,
    sessionTitle: session.title || "",
    sessionDate: session.date || "",
    exerciseIdx: idx,
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
      // text/plain avoids a CORS preflight (Apps Script Web Apps don't handle OPTIONS) —
      // Apps Script still reads the raw JSON body fine via e.postData.contents.
      headers: { "Content-Type": "text/plain;charset=utf-8" },
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
