import { apiRequest, participantRequest, messageFor } from "./backend.js";
import { LEVELS } from "./levels.js";

const app = document.querySelector("#app");
const isAdminRoute = new URLSearchParams(location.search).get("portal") === "admin";
let animateScreen = null;
let setWorldStage = null;
let activateSecurityGate = null;
if (!isAdminRoute) {
  import("./animations.js")
    .then((module) => { animateScreen = module.animateScreen; })
    .catch((error) => console.warn("Participant transition animations could not load.", error));
  import("./world.js")
    .then((module) => {
      setWorldStage = module.setWorldStage;
      activateSecurityGate = module.activateSecurityGate;
      setWorldStage(game?.level ? game.level - 1 : 0);
    })
    .catch((error) => console.warn("The cinematic game environment could not load.", error));
}
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
})[char]);

let toastTimer;
let game = null;
let answerBusy = false;
let timerHandle = null;
let activityCleanup = null;
let adminRows = new Map();
let adminEvents = [];
let participantDetailCache = new Map();
let participantDetailLoads = new Set();
let selectedParticipant = null;
let currentAdminUser = null;
let realtimeState = "CONNECTING";
let adminGeneration = 0;
let adminRevision = 0;
let adminEventId = 0;
let adminStream = null;
let adminAuthCheckBusy = false;
let adminSnapshotRetryHandle = null;
let adminRenderHandle = null;

function notify(message, tone = "error") {
  const region = document.querySelector("#toast-region");
  region.replaceChildren();
  const toast = document.createElement("div");
  toast.className = `toast toast-${tone}`;
  toast.setAttribute("role", "status");
  toast.textContent = message;
  region.append(toast);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.remove(), 5000);
}

function showView(markup, stage = 0) {
  clearInterval(timerHandle);
  timerHandle = null;
  activityCleanup?.();
  activityCleanup = null;
  app.innerHTML = markup;
  setWorldStage?.(stage);
  const animated = app.querySelector(".animate-in");
  if (animated && animateScreen) animateScreen(animated);
  app.querySelectorAll("[data-action]").forEach((control) => {
    control.addEventListener("click", (event) => {
      const action = control.dataset.action;
      if (action === "register") registerParticipant();
      else if (action === "resume") resumeParticipant();
      else if (action === "admin-login") loginAdmin();
      else if (action === "admin-logout") logoutAdmin();
      else if (action === "advance-level") advanceLevel(control);
      else if (action === "return") location.assign("./");
      else if (action === "details") showParticipantDetails(control.dataset.id);
      else if (action === "details-close") {
        selectedParticipant = null;
        renderAdminDashboard();
      }
      event.preventDefault();
    });
  });
  app.querySelectorAll("form[data-form]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (form.dataset.form === "register") await registerParticipant();
      if (form.dataset.form === "admin-login") await loginAdmin();
      if (form.dataset.form === "answer") await submitTextAnswer();
    });
  });
}

function renderRegistration() {
  showView(`<section class="hero animate-in">
    <div class="hero-kicker eyebrow">CLASSIFIED MISSION · FIVE STAGES</div>
    <h1>CYBER<br><span>ESCAPE ROOM</span></h1>
    <p class="hero-copy">Five gates stand between you and the core. Register to join the global competition network.</p>
    <div class="portal-card panel">
      <div class="eyebrow">Participant enrollment · no admin password required</div>
      <h2>Identify yourself.</h2>
      <form class="participant-form" data-form="register">
        <label>Full name<input name="name" maxlength="120" autocomplete="name" required></label>
        <label>College<input name="college" maxlength="180" autocomplete="organization" required></label>
        <label>Email<input name="email" type="email" maxlength="254" autocomplete="email" required></label>
        <label>Phone number<input name="phone" type="tel" maxlength="40" autocomplete="tel" required></label>
        <label>Year<input name="year" maxlength="40" placeholder="e.g. 2nd year" required></label>
        <label>Department<input name="department" maxlength="120" autocomplete="organization-title" required></label>
        <button class="button" type="submit">Enter the competition <span aria-hidden="true">↗</span></button>
      </form>
      <p class="private-note">Your competition record is saved securely on the competition server. This browser receives only an HttpOnly session cookie.</p>
    </div>
  </section>`);
}

function publicQuestionMarkup(question) {
  const timer = Number.isInteger(question.seconds_remaining) ? `<div class="timer"><span aria-hidden="true">◷</span><strong id="round-timer">${question.seconds_remaining}s</strong></div><div class="timer-bar"><span id="timer-progress"></span></div>` : "";
  const artifact = question.level === 1
    ? `<div class="password-evidence"><div class="artifact-heading"><span class="live-dot"></span>RECOVERED LAB NOTES</div><p>${escapeHtml(question.context)}</p><ul>${question.clues.map((clue) => `<li>${escapeHtml(clue)}</li>`).join("")}</ul></div>`
    : question.level === 5
      ? `<div class="tool-string" aria-label="Captured signal">${escapeHtml(question.artifact)}</div>`
      : `<div class="mission-artifact"><div class="artifact-heading"><span class="live-dot"></span>${escapeHtml(question.terminal || "EVIDENCE CONSOLE")}</div><pre>${escapeHtml(question.artifact || "")}</pre></div>`;
  const attempts = question.level === 1
    ? `<div class="attempt-counter">PASSWORD ATTEMPTS REMAINING <strong id="attempt-count">${question.attempts_remaining}</strong> / 2</div>`
    : "";
  return `<p class="mission-objective">${escapeHtml(question.prompt)}</p>
    ${artifact}
    ${timer}
    ${attempts}
    <form class="answer-form terminal-input" data-form="answer">
      <label for="mission-answer">${escapeHtml(question.input_label || "TERMINAL INPUT")}</label>
      <div class="terminal-command"><span aria-hidden="true">&gt;</span><input id="mission-answer" name="answer" class="text-input" maxlength="${question.level === 1 ? 4 : 200}" ${question.level === 1 ? 'inputmode="numeric" pattern="[0-9]{4}"' : ""} autocomplete="off" placeholder="${escapeHtml(question.placeholder || "Enter your finding")}" required><button class="button" type="submit">${question.level === 1 ? "UNLOCK" : "EXECUTE"}</button></div>
    </form>
    <div class="notice" id="game-notice" role="status">${question.level === 1 ? "Analyze the recovered notes. The password is not printed in any one clue." : "Your command will be evaluated by the secure system."}</div>`;
}

function renderQuestion(question, level, questionIndex, totalQuestions) {
  game.question = question;
  game.level = level;
  game.selected = null;
  game.questionIndex = questionIndex;
  game.totalQuestions = totalQuestions;
  const levelInfo = LEVELS[level - 1];
  const intros = {
    1: "Advanced security laboratory · investigate the operator records, connect the clues, and breach each password gate.",
    2: "Unstable experimental facility · investigate captured links and submit the destination evidence.",
    3: "Cyber operations command · recover encrypted payloads using the clues in each transmission.",
    4: "Classified investigation room · trace the source logic and reconstruct the hidden incident token.",
    5: "Final high-pressure directive · 5 signals, 30 seconds each, 150 seconds maximum. No time carries over."
  };
  const markup = `<section class="game-head"><div class="game-meta"><span class="level-label">LEVEL 0${level} / 05 · ${levelInfo.title}</span><span class="participant-progress">CHALLENGE ${questionIndex + 1} / ${totalQuestions}</span></div><div class="progress-track"><div class="progress-fill" style="width:${Math.round(questionIndex / totalQuestions * 100)}%"></div></div></section>
    <div class="stage-grid animate-in"><section class="panel challenge-panel" data-reaction="idle"><div class="eyebrow">${levelInfo.theme} · LIVE MISSION</div><h2>${escapeHtml(question.terminal || levelInfo.title)}</h2><p class="game-description">${intros[level]}</p>
    ${publicQuestionMarkup({ ...question, level })}</section>
    <aside class="panel side-panel"><div class="side-title">Mission telemetry</div><div class="side-stat"><span>Facility</span><strong>0${level} / 05</strong></div><div class="side-stat"><span>Challenge</span><strong>${questionIndex + 1} / ${totalQuestions}</strong></div><div class="side-progress">${LEVELS.map((_, i) => `<span class="${i < level - 1 ? "done" : ""}"></span>`).join("")}</div><div class="intel-note">Your assigned mission data is secured to this participant session.</div></aside></div>`;
  showView(markup, level - 1);
  installActivityMonitoring();
  if (level === 1 || level === 5) startQuestionTimer(question.seconds_remaining ?? (level === 1 ? 120 : 30));
}

function playMissionReaction(reaction) {
  const panel = app.querySelector(".challenge-panel");
  if (!panel || !["breach", "deflect", "access_granted", "access_denied"].includes(reaction)) return Promise.resolve();
  panel.dataset.reaction = reaction;
  const notice = app.querySelector("#game-notice");
  if (notice && reaction.startsWith("access_")) notice.textContent = reaction === "access_granted" ? "ACCESS GRANTED" : "ACCESS DENIED";
  const gateAnimation = reaction === "access_granted" && activateSecurityGate
    ? activateSecurityGate()
    : Promise.resolve();
  return Promise.all([
    gateAnimation,
    new Promise((resolve) => setTimeout(resolve, reaction.startsWith("access_") ? 980 : 480))
  ]);
}

function renderLevelCompletion(completion) {
  const level = Number(completion.level);
  const qualified = Boolean(completion.qualified);
  const finalLevel = level === 5;
  const title = finalLevel ? "FINAL DIRECTIVE COMPLETE" : `LEVEL 0${level} COMPLETE`;
  const status = finalLevel ? "MISSION COMPLETE" : qualified ? "QUALIFIED" : "NOT QUALIFIED";
  const action = qualified && !finalLevel
    ? `<div class="next-gate">NEXT: ${escapeHtml(completion.next_level)}</div><button type="button" class="button next-level-button" data-action="advance-level">NEXT LEVEL <span aria-hidden="true">↗</span></button>`
    : finalLevel
      ? `<p class="completion-recorded">Your results have been securely recorded.</p><div class="completion-waiting">MISSION ARCHIVE SEALED · RESULTS RECORDED</div><button type="button" class="button secondary" data-action="return">Return to portal</button>`
      : `<p class="completion-recorded">Your game session has ended. The next level remains locked.</p>`;
  showView(`<section class="level-completion animate-in ${qualified ? "completion-qualified" : "completion-failed"}">
    <div class="completion-kicker eyebrow">${finalLevel ? "FINAL TRANSMISSION" : "SECURITY GATE CLEARED"}</div>
    <h1>${escapeHtml(title)}</h1>
    <div class="completion-name">${escapeHtml(completion.level_name)}</div>
    <div class="hologram-score"><span>${finalLevel ? "LEVEL 5 SCORE" : "LEVEL SCORE"}</span><strong>${Number(completion.score)}<i>/100</i></strong></div>
    <div class="qualification-status">${escapeHtml(status)}</div>
    ${action}
  </section>`, level - 1);
}

async function advanceLevel(button) {
  if (answerBusy) return;
  answerBusy = true;
  button.disabled = true;
  button.textContent = "ACTIVATING NEXT GATE…";
  try {
    const result = await participantRequest("advance");
    if (result.question) renderQuestion(result.question, result.level, result.question_index, result.level_question_count);
    else if (result.completion) renderLevelCompletion(result.completion);
    else renderMissionEnded();
  } catch (error) {
    button.disabled = false;
    button.innerHTML = 'NEXT LEVEL <span aria-hidden="true">↗</span>';
    notify(messageFor(error));
  } finally {
    answerBusy = false;
  }
}

function renderMissionEnded() {
  showView(`<section class="outcome pass animate-in"><div class="outcome-mark"><span>✓</span></div><div class="eyebrow">TRANSMISSION ENDED</div><h1>MISSION CONCLUDED</h1><p class="outcome-copy">Your competition session has ended. Thank you for taking part.</p><div class="outcome-actions"><button class="button secondary" data-action="return">Return to portal</button></div></section>`);
}

async function loadNextQuestion() {
  try {
    const result = await participantRequest("current");
    if (result.completion) return renderLevelCompletion(result.completion);
    if (result.session_ended) return renderMissionEnded();
    if (!result.question) return renderMissionEnded();
    renderQuestion(result.question, result.level, result.question_index, result.level_question_count);
  } catch (error) {
    notify(messageFor(error));
  }
}

async function submitAnswer(answer) {
  if (answerBusy || !game?.question) return;
  answerBusy = true;
  clearInterval(timerHandle);
  const buttons = app.querySelectorAll("button, input");
  buttons.forEach((button) => { button.disabled = true; });
  const notice = document.querySelector("#game-notice");
  if (notice) notice.textContent = "Response received. Preparing the next transmission…";
  try {
    const result = await participantRequest("answer", {
      question_id: game.question.id,
      answer,
      client_time: new Date().toISOString()
    });
    await playMissionReaction(result.reaction);
    if (result.retry) {
      const attemptCounter = document.querySelector("#attempt-count");
      if (attemptCounter) attemptCounter.textContent = String(result.attempts_remaining);
      if (notice) notice.textContent = `ACCESS DENIED · ${result.hint} · ${result.attempts_remaining} attempt remaining.`;
      const field = app.querySelector('input[name="answer"]');
      if (field) {
        field.value = "";
        field.focus();
      }
      buttons.forEach((button) => { button.disabled = false; });
      window.setTimeout(() => startQuestionTimer(result.seconds_remaining), 0);
      return;
    }
    if (result.completion) renderLevelCompletion(result.completion);
    else if (result.next_challenge) {
      const next = await participantRequest("current");
      if (next.session_ended) renderMissionEnded();
      else renderQuestion(next.question, next.level, next.question_index, next.level_question_count);
    }
    else if (result.question) renderQuestion(result.question, result.level, result.question_index, result.level_question_count);
    else renderMissionEnded();
  } catch (error) {
    buttons.forEach((button) => { button.disabled = false; });
    if (notice) notice.textContent = "Could not save your response. You can retry while this question remains open.";
    notify(messageFor(error));
  } finally {
    answerBusy = false;
  }
}

function submitTextAnswer() {
  const field = app.querySelector('input[name="answer"]');
  if (field?.value.trim()) submitAnswer(field.value.trim());
}

function startQuestionTimer(secondsRemaining) {
  const durationMs = Math.max(0, secondsRemaining * 1000);
  const fullDurationMs = game.level === 1 ? 120_000 : 30_000;
  // The backend enforces the exact deadline; this buffer avoids submitting early on timer rounding.
  const endsAt = Date.now() + durationMs + 250;
  const timer = document.querySelector("#round-timer");
  const bar = document.querySelector("#timer-progress");
  const update = () => {
    const remaining = Math.max(0, endsAt - Date.now());
    const displayedRemaining = Math.min(durationMs, remaining);
    const seconds = Math.ceil(displayedRemaining / 1000);
    if (timer) {
      timer.textContent = game.level === 1
        ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
        : `${seconds}s`;
    }
    if (bar) bar.style.width = `${fullDurationMs ? displayedRemaining / fullDurationMs * 100 : 0}%`;
    if (remaining <= 0) {
      clearInterval(timerHandle);
      timerHandle = null;
      submitAnswer("");
    }
  };
  update();
  timerHandle = setInterval(update, 100);
}

async function beginParticipantSession(form) {
  const values = Object.fromEntries(new FormData(form).entries());
  const registered = await participantRequest("register", { profile: values });
  game = { id: registered.participant_id };
  if (registered.completion) return renderLevelCompletion(registered.completion);
  if (registered.session_ended) return renderMissionEnded();
  if (registered.question) return renderQuestion(registered.question, registered.level, registered.question_index, registered.level_question_count);
  await loadNextQuestion();
}

async function registerParticipant() {
  const form = app.querySelector('form[data-form="register"]');
  if (!form?.reportValidity()) return;
  const button = form.querySelector("button[type=submit]");
  button.disabled = true;
  button.textContent = "Establishing secure session…";
  try {
    await beginParticipantSession(form);
  } catch (error) {
    button.disabled = false;
    button.innerHTML = 'Enter the competition <span aria-hidden="true">↗</span>';
    notify(messageFor(error));
  }
}

async function resumeParticipant() {
  try {
    const result = await participantRequest("current");
    game = { id: result.participant_id };
    participantRequest("event", { event_type: "session_resumed", client_time: new Date().toISOString() })
      .catch((eventError) => console.warn("Participant session-resume event could not be recorded.", eventError));
    if (result.completion) renderLevelCompletion(result.completion);
    else if (result.session_ended) renderMissionEnded();
    else renderQuestion(result.question, result.level, result.question_index, result.level_question_count);
  } catch (error) {
    if (error.message.includes("Participant session not found") ||
        error.message.includes("Participant session expired")) {
      renderRegistration();
    } else {
      renderRegistration();
      notify(messageFor(error));
    }
  }
}

function installActivityMonitoring() {
  activityCleanup?.();
  const lastSent = new Map();
  const send = (type) => {
    const now = Date.now();
    if (now - (lastSent.get(type) || 0) < 1800) return;
    lastSent.set(type, now);
    participantRequest("event", { event_type: type, client_time: new Date().toISOString() })
      .catch((error) => console.warn("Competition activity event could not be recorded.", error));
  };
  const visibility = () => send(document.hidden ? "tab_hidden" : "tab_visible");
  const blur = () => send("window_blur");
  const focus = () => send("window_focus");
  const fullscreen = () => send(document.fullscreenElement ? "fullscreen_enter" : "fullscreen_exit");
  const pageHide = () => send("page_hide");
  const pageShow = (event) => {
    if (event.persisted) send("session_resumed");
  };
  document.addEventListener("visibilitychange", visibility);
  window.addEventListener("blur", blur);
  window.addEventListener("focus", focus);
  document.addEventListener("fullscreenchange", fullscreen);
  window.addEventListener("pagehide", pageHide);
  window.addEventListener("pageshow", pageShow);
  activityCleanup = () => {
    document.removeEventListener("visibilitychange", visibility);
    window.removeEventListener("blur", blur);
    window.removeEventListener("focus", focus);
    document.removeEventListener("fullscreenchange", fullscreen);
    window.removeEventListener("pagehide", pageHide);
    window.removeEventListener("pageshow", pageShow);
  };
}

function renderAdminLogin(message = "") {
  cleanupAdminSubscriptions();
  showView(`<section class="admin-login-wrap animate-in"><div class="admin-brand eyebrow">PRIVATE CONTROL SYSTEM · ADMIN ONLY</div><section class="panel admin-login"><div class="eyebrow">Secure administrator authentication</div><h2>Command center.</h2><p class="muted">Use the configured administrator account. Participant registration never requests these credentials.</p>
    <form data-form="admin-login"><label>Admin ID<input name="login_id" type="text" maxlength="64" autocomplete="username" required></label><label>Password<input name="password" type="password" autocomplete="current-password" required></label><button class="button" type="submit">Authenticate</button></form>
    <div class="notice">${escapeHtml(message)}</div></section></section>`, 0);
}

async function loginAdmin() {
  const form = app.querySelector('form[data-form="admin-login"]');
  if (!form?.reportValidity()) return;
  const fields = Object.fromEntries(new FormData(form).entries());
  const button = form.querySelector("button");
  button.disabled = true;
  try {
    const result = await apiRequest("/api/admin/login", {
      method: "POST",
      body: {
        login_id: fields.login_id,
        password: fields.password
      }
    });
    currentAdminUser = result.admin;
    openAdminDashboard();
  } catch (error) {
    button.disabled = false;
    notify(messageFor(error));
  }
}

async function logoutAdmin() {
  cleanupAdminSubscriptions();
  try {
    await apiRequest("/api/admin/logout", { method: "POST", body: {} });
    currentAdminUser = null;
    renderAdminLogin("Signed out.");
  } catch (error) {
    notify(messageFor(error));
  }
}

function cleanupAdminSubscriptions() {
  adminGeneration += 1;
  adminStream?.close();
  adminStream = null;
  clearTimeout(adminSnapshotRetryHandle);
  adminSnapshotRetryHandle = null;
  if (adminRenderHandle !== null) cancelAnimationFrame(adminRenderHandle);
  adminRenderHandle = null;
  adminAuthCheckBusy = false;
  participantDetailCache.clear();
  participantDetailLoads.clear();
}

function participantTotal(participant) {
  return [1, 2, 3, 4, 5].reduce((sum, level) => sum + Number(participant[`level${level}_score`] || 0), 0);
}

function compareFinalists(a, b) {
  const scoreOrder = participantTotal(b) - participantTotal(a) ||
    Number(b.level5_score || 0) - Number(a.level5_score || 0) ||
    Number(b.level3_score || 0) - Number(a.level3_score || 0);
  if (scoreOrder) return scoreOrder;
  const aCompletion = a.level5_completed_at ? new Date(a.level5_completed_at).getTime() : Number.POSITIVE_INFINITY;
  const bCompletion = b.level5_completed_at ? new Date(b.level5_completed_at).getTime() : Number.POSITIVE_INFINITY;
  return aCompletion - bCompletion;
}

function rankParticipants(rows) {
  return [...rows].sort(compareFinalists);
}

function isFinalist(participant) {
  return participant.status === "completed" &&
    [1, 2, 3, 4].every((level) => participant[`level${level}_qualified`]);
}

function renderFinalStandings(ranked) {
  const finalists = ranked.filter(isFinalist);
  if (!finalists.length) {
    const noActiveMissions = ranked.length > 0 && ranked.every((participant) => participant.status !== "active");
    const heading = noActiveMissions ? "No finalists qualified." : "Awaiting finalists.";
    const message = noActiveMissions ? "The competition concluded without a Level 5 finalist." : "No participant has completed all five levels yet.";
    return `<section class="panel final-results"><div class="eyebrow">FINALIST LEADERBOARD</div><h2>${heading}</h2><p class="muted">${message}</p></section>`;
  }
  if (ranked.some((participant) => participant.status === "active")) {
    return `<section class="panel final-results"><div class="eyebrow">FINALIST LEADERBOARD</div><h2>Standings remain sealed.</h2><p class="muted">${finalists.length} finalist${finalists.length === 1 ? "" : "s"} recorded · final champion announcement unlocks when all active missions conclude.</p></section>`;
  }

  const leaders = finalists.slice(0, 3);
  let place = 0;
  let previous = null;
  const podium = leaders.map((participant, index) => {
    if (!previous || compareFinalists(previous, participant) !== 0) place = index + 1;
    previous = participant;
    return `<div class="podium-card"><span class="eyebrow">${place}${place === 1 ? "ST" : place === 2 ? "ND" : "RD"} PLACE</span><strong>${escapeHtml(participant.full_name)}</strong><span>${(participantTotal(participant) / 5).toFixed(1)}% · ${participantTotal(participant)}/500</span></div>`;
  }).join("");
  const winner = finalists[0];
  const jointWinners = finalists.filter((participant) => compareFinalists(winner, participant) === 0);
  const winnerNames = jointWinners.map((participant) => escapeHtml(participant.full_name)).join(" &amp; ");
  let finalistRank = 0;
  const rows = finalists.map((participant, index) => {
    if (index === 0 || compareFinalists(finalists[index - 1], participant) !== 0) finalistRank = index + 1;
    const rank = finalistRank;
    return `<tr><td>${rank}</td><td>${escapeHtml(participant.full_name)}</td><td>${escapeHtml(participant.college)}</td>${[1, 2, 3, 4, 5].map((level) => `<td>${Number(participant[`level${level}_score`] || 0)}</td>`).join("")}<td>${participantTotal(participant)}</td><td>${(participantTotal(participant) / 5).toFixed(1)}%</td><td>${escapeHtml(participant.status)}</td></tr>`;
  }).join("");
  return `<section class="panel final-results"><div class="eyebrow">MISSION COMPLETE · FINALISTS ONLY</div><h2>🏆 CYBER ESCAPE ROOM CHAMPION</h2><div class="champion-card"><strong>${winnerNames}</strong><span>${(participantTotal(winner) / 5).toFixed(1)}% overall · ${participantTotal(winner)}/500</span>${jointWinners.length > 1 ? `<span class="muted">Joint winner · all listed tie-breakers are equal</span>` : ""}</div><div class="podium">${podium}</div><div class="table-scroll"><table><thead><tr><th>Place</th><th>Finalist</th><th>College</th><th>L1</th><th>L2</th><th>L3</th><th>L4</th><th>L5</th><th>Total</th><th>Overall %</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

function renderAdminDashboard() {
  const ranked = rankParticipants([...adminRows.values()]);
  const rows = ranked.map((person, index) => {
    const total = participantTotal(person);
    const percent = (total / 500 * 100).toFixed(1);
    const qualifications = [1, 2, 3, 4].map((level) => person[`level${level}_qualified`] ? "✓" : "—").join(" ");
    return `<tr><td>${index + 1}</td><td><button class="table-link" type="button" data-action="details" data-id="${escapeHtml(person.id)}">${escapeHtml(person.full_name)}</button></td><td>${escapeHtml(person.college)}</td><td>${escapeHtml(person.email)}</td><td>${escapeHtml(person.phone)}</td><td>${escapeHtml(person.year)} · ${escapeHtml(person.department)}</td><td>${person.current_level}/5</td><td>${escapeHtml(person.status)} · ${qualifications}</td>${[1, 2, 3, 4, 5].map((level) => `<td>${Number(person[`level${level}_score`] || 0)}</td>`).join("")}<td>${total}/500</td><td>${percent}%</td><td>${escapeHtml(new Date(person.created_at).toLocaleString())}</td></tr>`;
  }).join("");
  const events = adminEvents.slice(0, 20).map((item) => {
    const participantName = adminRows.get(item.participant_id)?.full_name || "Participant";
    return `<li><strong>${escapeHtml(item.event_type.replaceAll("_", " "))}</strong> · ${escapeHtml(participantName)} · ${escapeHtml(new Date(item.occurred_at).toLocaleString())}</li>`;
  }).join("");
  const details = selectedParticipant ? `<div class="details-overlay"><section class="panel details-card"><button class="button secondary details-close" data-action="details-close" type="button">Close</button><h2>Participant activity</h2><div id="participant-details">Loading authorized record…</div></section></div>` : "";
  showView(`<section class="admin-dashboard animate-in">
    <div class="admin-heading"><div><div class="eyebrow">SECURE COMPETITION CONTROL</div><h1>COMMAND CENTER.</h1><p class="muted">${escapeHtml(currentAdminUser?.login_id || "")} · Records from the server database</p></div><button class="button secondary" data-action="admin-logout">Log out</button></div>
    <div class="admin-telemetry"><div class="panel telemetry-card"><span>PARTICIPANTS</span><strong>${ranked.length}</strong></div><div class="panel telemetry-card"><span>ACTIVE SESSIONS</span><strong>${ranked.filter((p) => p.status === "active").length}</strong></div><div class="panel telemetry-card"><span>FINALISTS</span><strong>${ranked.filter(isFinalist).length}</strong></div><div class="panel telemetry-card"><span>SERVER UPDATES</span><strong class="connection-${realtimeState.toLowerCase()}">${escapeHtml(realtimeState)}</strong></div></div>
    ${renderFinalStandings(ranked)}
    <section class="panel table-panel"><div class="table-heading"><div><div class="eyebrow">GLOBAL PARTICIPANT REGISTER</div><h2>Competition ledger</h2></div><span class="mono muted">LIVE CENTRAL SERVER STREAM</span></div>
      <div class="table-scroll"><table><thead><tr><th>#</th><th>Participant</th><th>College</th><th>Email</th><th>Phone</th><th>Year · Department</th><th>Level</th><th>Status · Qualification</th><th>L1</th><th>L2</th><th>L3</th><th>L4</th><th>L5</th><th>Total</th><th>%</th><th>Registered</th></tr></thead><tbody>${rows || `<tr><td colspan="16" class="empty-row">No participants registered yet.</td></tr>`}</tbody></table></div>
    </section>
    <section class="panel activity-panel"><div class="eyebrow">PRIVATE PROCTORING TELEMETRY</div><h2>Activity events</h2><ul>${events || `<li class="muted">No monitoring events received.</li>`}</ul></section>${details}
  </section>`, 0);
  if (selectedParticipant) {
    const cached = participantDetailCache.get(selectedParticipant);
    const target = document.querySelector("#participant-details");
    if (cached && target) target.innerHTML = cached;
    else loadParticipantDetails(selectedParticipant);
  }
}

function openAdminDashboard() {
  cleanupAdminSubscriptions();
  adminRows = new Map();
  adminEvents = [];
  adminRevision = 0;
  adminEventId = 0;
  renderAdminDashboard();
  loadAdminSnapshot().catch((error) => {
    realtimeState = "RECONNECTING";
    if (app.querySelector(".admin-dashboard")) renderAdminDashboard();
    notify(messageFor(error));
    scheduleAdminSnapshotRetry();
  });
}

async function loadAdminSnapshot() {
  const generation = adminGeneration;
  const data = await apiRequest("/api/admin/updates?full=1");
  if (generation !== adminGeneration || !currentAdminUser) return;
  adminRows.clear();
  for (const participant of data.participants) {
    adminRows.set(participant.id, participant);
  }
  adminEvents = data.events.slice().sort((a, b) => b.id - a.id).slice(0, 100);
  adminRevision = data.revision;
  adminEventId = data.event_id;
  realtimeState = "ONLINE";
  renderAdminDashboard();
  connectAdminStream(generation);
}

function applyAdminUpdates(data) {
  for (const participant of data.participants || []) {
    adminRows.set(participant.id, participant);
    participantDetailCache.delete(participant.id);
  }
  const eventsById = new Map(adminEvents.map((event) => [event.id, event]));
  for (const event of data.events || []) {
    eventsById.set(event.id, event);
    participantDetailCache.delete(event.participant_id);
  }
  adminEvents = [...eventsById.values()].sort((a, b) => b.id - a.id).slice(0, 100);
  adminRevision = Math.max(adminRevision, Number(data.revision) || 0);
  adminEventId = Math.max(adminEventId, Number(data.event_id) || 0);
  realtimeState = "ONLINE";
  if (app.querySelector(".admin-dashboard") && adminRenderHandle === null) {
    adminRenderHandle = requestAnimationFrame(() => {
      adminRenderHandle = null;
      if (currentAdminUser && app.querySelector(".admin-dashboard")) renderAdminDashboard();
    });
  }
}

function connectAdminStream(generation) {
  if (generation !== adminGeneration || !currentAdminUser) return;
  adminStream?.close();
  const query = new URLSearchParams({ revision: String(adminRevision), event_id: String(adminEventId) });
  const stream = new EventSource(`/api/admin/stream?${query}`);
  adminStream = stream;
  stream.onopen = () => {
    if (generation !== adminGeneration || stream !== adminStream) return;
    if (realtimeState !== "ONLINE") {
      realtimeState = "ONLINE";
      if (app.querySelector(".admin-dashboard")) renderAdminDashboard();
    }
  };
  stream.addEventListener("updates", (event) => {
    if (generation !== adminGeneration || stream !== adminStream) return;
    try {
      applyAdminUpdates(JSON.parse(event.data));
    } catch (error) {
      console.error("The administrator update stream sent invalid data.", error);
      stream.close();
      realtimeState = "RECONNECTING";
      if (app.querySelector(".admin-dashboard")) renderAdminDashboard();
      scheduleAdminSnapshotRetry();
    }
  });
  stream.addEventListener("auth_expired", () => {
    if (generation !== adminGeneration || stream !== adminStream) return;
    currentAdminUser = null;
    cleanupAdminSubscriptions();
    renderAdminLogin("Admin session expired. Sign in again.");
  });
  stream.onerror = () => {
    if (generation !== adminGeneration || stream !== adminStream) return;
    if (realtimeState !== "RECONNECTING") {
      realtimeState = "RECONNECTING";
      if (app.querySelector(".admin-dashboard")) renderAdminDashboard();
    }
    if (adminAuthCheckBusy) return;
    adminAuthCheckBusy = true;
    apiRequest("/api/admin/session")
      .then((session) => {
        if (generation === adminGeneration && !session.authenticated) {
          currentAdminUser = null;
          cleanupAdminSubscriptions();
          renderAdminLogin("Admin session expired. Sign in again.");
        }
      })
      .catch((error) => console.warn("Administrator session check failed during stream reconnection.", error))
      .finally(() => { adminAuthCheckBusy = false; });
  };
}

function scheduleAdminSnapshotRetry() {
  if (adminSnapshotRetryHandle || !currentAdminUser) return;
  const generation = adminGeneration;
  adminSnapshotRetryHandle = setTimeout(async () => {
    adminSnapshotRetryHandle = null;
    if (generation !== adminGeneration || !currentAdminUser) return;
    try {
      await loadAdminSnapshot();
    } catch (error) {
      console.warn("Admin snapshot refresh failed; retrying shortly.", error);
      scheduleAdminSnapshotRetry();
    }
  }, 5000);
}

async function showParticipantDetails(id) {
  selectedParticipant = id;
  renderAdminDashboard();
}

async function loadParticipantDetails(id) {
  if (participantDetailCache.has(id) || participantDetailLoads.has(id)) return;
  const generation = adminGeneration;
  participantDetailLoads.add(id);
  let result;
  try {
    result = await apiRequest(`/api/admin/participants/${encodeURIComponent(id)}`);
  } catch (error) {
    participantDetailLoads.delete(id);
    if (generation === adminGeneration) notify(messageFor(error));
    return;
  }
  participantDetailLoads.delete(id);
  if (generation !== adminGeneration || !currentAdminUser) return;
  const target = document.querySelector("#participant-details");
  if (!target) return;
  const assigned = Object.entries(result.assigned_challenges).map(([level, challenges]) =>
    `<section class="assigned-level"><h4>LEVEL 0${level} · ${escapeHtml(LEVELS[Number(level) - 1].title)}</h4>${challenges.map((challenge) => `<details class="assigned-challenge"><summary>${String(challenge.ordinal).padStart(2, "0")} · ${escapeHtml(challenge.terminal)}</summary><p>${escapeHtml(challenge.prompt)}</p>${challenge.context ? `<p>${escapeHtml(challenge.context)}</p>` : ""}${challenge.clues?.length ? `<ul>${challenge.clues.map((clue) => `<li>${escapeHtml(clue)}</li>`).join("")}</ul>` : ""}<pre>${escapeHtml(challenge.artifact)}</pre></details>`).join("")}</section>`
  ).join("");
  const attemptRows = result.attempts.map((attempt) => `<tr><td>${escapeHtml(attempt.question_id)}</td><td>${attempt.attempt_number}</td><td>${escapeHtml(attempt.submitted_answer || "No response")}</td><td>${attempt.is_correct ? "Correct" : "Incorrect"}</td><td>${escapeHtml(new Date(attempt.attempted_at).toLocaleString())}</td></tr>`).join("");
  const markup = `<h3>Assigned mission challenges</h3><div class="assigned-challenge-list">${assigned}</div><h3>Recorded answers and evaluation</h3><div class="table-scroll"><table><thead><tr><th>Level</th><th>Challenge</th><th>Prompt</th><th>Answer</th><th>Evaluation</th><th>Points</th><th>Attempts</th><th>Submitted</th></tr></thead><tbody>${result.answers.map((answer) => `<tr><td>${answer.level}</td><td>${answer.question_ordinal}</td><td>${escapeHtml(answer.question)}</td><td>${escapeHtml(answer.submitted_answer || "Unanswered")}</td><td>${answer.is_correct ? "Correct" : "Incorrect"}</td><td>${answer.points_awarded}</td><td>${answer.attempts_used}</td><td>${escapeHtml(new Date(answer.answered_at).toLocaleString())}</td></tr>`).join("")}</tbody></table></div><h3>Answer attempts</h3><div class="table-scroll"><table><thead><tr><th>Challenge ID</th><th>Attempt</th><th>Submitted</th><th>Evaluation</th><th>Time</th></tr></thead><tbody>${attemptRows || `<tr><td colspan="5">No answers attempted.</td></tr>`}</tbody></table></div><h3>Monitoring events</h3><ul>${result.events.map((event) => `<li>${escapeHtml(event.event_type)} · ${escapeHtml(new Date(event.occurred_at).toLocaleString())}</li>`).join("") || "<li>No activity events.</li>"}</ul>`;
  participantDetailCache.set(id, markup);
  target.innerHTML = markup;
}

async function initializeAdmin() {
  try {
    const result = await apiRequest("/api/admin/session");
    if (result.authenticated) {
      currentAdminUser = result.admin;
      openAdminDashboard();
      return;
    }
    renderAdminLogin();
  } catch (error) {
    renderAdminLogin(messageFor(error));
  }
}

async function initializeParticipant() {
  try {
    await resumeParticipant();
  } catch (error) {
    renderRegistration();
    if (!error.message.includes("Participant session not found") &&
        !error.message.includes("Participant session expired")) notify(messageFor(error));
  }
}

if (isAdminRoute) initializeAdmin();
else initializeParticipant();
