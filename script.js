import { FINALISTS_KEY, FINAL_QUESTION_COUNT, FINAL_QUESTION_SECONDS, HISTORY_KEY, LEVELS, PHISHING_CASES, RUN_KEY, TOOL_ROUNDS } from "./js/levels.js";
import { observeTransitions } from "./js/animations.js";
import { setWorldStage } from "./js/world.js";
import { getMissionProgress } from "./js/hud.js";

export function initializeGame() {
      const app = document.querySelector("#app");
      let run = null;
      let levelState = null;
      let tickHandle = null;
      let toastHandle = null;
      let soundContext = null;

      const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;"
      })[char]);

      function readList(key) {
        try {
          const value = JSON.parse(localStorage.getItem(key) || "[]");
          return Array.isArray(value) ? value : [];
        } catch (error) {
          console.error(`Could not read saved game data (${key}).`, error);
          showToast("Saved data could not be read.");
          return [];
        }
      }

      function writeData(key, value) {
        try {
          localStorage.setItem(key, JSON.stringify(value));
          return true;
        } catch (error) {
          console.error(`Could not save game data (${key}).`, error);
          showToast("Progress could not be saved. Check browser storage.");
          return false;
        }
      }

      function makeId() {
        return window.crypto && typeof window.crypto.randomUUID === "function"
          ? window.crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      }

      function syncRun() {
        if (!run) return;
        run.updatedAt = new Date().toISOString();
        const history = readList(HISTORY_KEY);
        const existing = history.findIndex((item) => item.id === run.id);
        if (existing === -1) history.push(run);
        else history[existing] = run;
        writeData(HISTORY_KEY, history);
        writeData(RUN_KEY, run);
      }

      function loadRun() {
        try {
          const saved = JSON.parse(localStorage.getItem(RUN_KEY) || "null");
          if (saved && saved.id && typeof saved.player === "string" && Array.isArray(saved.scores) &&
              saved.scores.length === 5 && Number.isInteger(saved.level) && saved.level >= 0 && saved.level <= 5 &&
              saved.scores.every((score) => Number.isFinite(score) && score >= 0 && score <= 100)) {
            run = saved;
            return true;
          }
        } catch (error) {
          console.error("Could not restore the active run.", error);
          showToast("The saved session could not be restored.");
        }
        run = null;
        return false;
      }

      function clearTick() {
        if (tickHandle) window.clearInterval(tickHandle);
        tickHandle = null;
      }

      function sound(frequency = 520, duration = .08, type = "sine") {
        try {
          soundContext = soundContext || new (window.AudioContext || window.webkitAudioContext)();
          if (soundContext.state === "suspended") soundContext.resume();
          const oscillator = soundContext.createOscillator();
          const gain = soundContext.createGain();
          oscillator.type = type;
          oscillator.frequency.setValueAtTime(frequency, soundContext.currentTime);
          gain.gain.setValueAtTime(.035, soundContext.currentTime);
          gain.gain.exponentialRampToValueAtTime(.001, soundContext.currentTime + duration);
          oscillator.connect(gain);
          gain.connect(soundContext.destination);
          oscillator.start();
          oscillator.stop(soundContext.currentTime + duration);
        } catch (error) {
          console.warn("Audio feedback is unavailable.", error);
        }
      }

      function showToast(message) {
        const prior = document.querySelector(".toast");
        if (prior) prior.remove();
        if (toastHandle) window.clearTimeout(toastHandle);
        const toast = document.createElement("div");
        toast.className = "toast";
        toast.setAttribute("role", "status");
        toast.textContent = message;
        document.body.append(toast);
        toastHandle = window.setTimeout(() => toast.remove(), 3400);
      }

      function headerMarkup(levelIndex, score = 0) {
        const level = LEVELS[levelIndex];
        return `<div class="game-head">
          <div class="game-meta">
            <span class="level-label">OPERATOR: ${escapeHtml(run.player.toUpperCase())} &nbsp;·&nbsp; LEVEL 0${levelIndex + 1} / 05 &nbsp;·&nbsp; ${level.theme}</span>
            <span class="score-hud">CURRENT SCORE <strong class="score-value">${score}</strong><span>/ 100</span></span>
          </div>
          <div class="progress-track" aria-label="Level progression"><div class="progress-fill" style="width:${getMissionProgress(levelIndex)}%"></div></div>
        </div>`;
      }

      function sideMarkup(levelIndex, score, progressText, intel) {
        return `<aside class="panel side-panel">
          <div class="side-title">Mission telemetry</div>
          <div class="side-stat"><span>Current score</span><strong>${score} / 100</strong></div>
          <div class="side-stat"><span>Progress</span><strong>${escapeHtml(progressText)}</strong></div>
          <div class="side-stat"><span>Qualification</span><strong>${LEVELS[levelIndex].qualify === null ? "FINAL ROUND" : `${LEVELS[levelIndex].qualify}%`}</strong></div>
          <div class="side-progress" aria-label="Five-level mission progress">${LEVELS.map((_, i) => `<span class="${i < levelIndex ? "done" : ""}"></span>`).join("")}</div>
          <div class="intel-note">${intel}</div>
        </aside>`;
      }

      function renderStart() {
        clearTick();
        const resumed = loadRun();
        const resumeMarkup = resumed
          ? `<div class="resume-row">ACTIVE RUN DETECTED · ${escapeHtml(run.player)} · LEVEL 0${Math.min(run.level + 1, 5)}
              <br><button class="button secondary" id="resume-run" type="button">Resume session <span aria-hidden="true">↗</span></button>
            </div>`
          : "";
        app.innerHTML = `<section class="hero animate-in">
          <div class="hero-kicker eyebrow">CLASSIFIED MISSION · FIVE STAGES</div>
          <h1>CYBER<br><span>ESCAPE ROOM</span></h1>
          <p class="hero-copy">Five layers of deception stand between you and the core. Think clearly, move deliberately, and prove your place among the finalists.</p>
          <div class="intro-grid">
            <section class="panel entry-panel">
              <div class="eyebrow">Operator enrollment</div>
              <h2 style="margin-top:11px">Enter the grid.</h2>
              <p class="muted" style="font-size:11px;line-height:1.7;margin-bottom:0">Your mission record is saved on this device. Qualify in each of the first four levels to reach the final round.</p>
              <label class="field-label" for="player-name">Player name</label>
              <input class="text-input" id="player-name" maxlength="24" autocomplete="nickname" placeholder="Enter your callsign">
              <button class="button" id="start-run" type="button">Initialize mission <span aria-hidden="true">↗</span></button>
              ${resumeMarkup}
            </section>
            <section class="panel briefing-panel">
              <div class="briefing-heading"><div><div class="eyebrow">Mission briefing</div><h3 style="margin:7px 0 0">Five gates. One finalist.</h3></div><span class="mono muted" style="font-size:10px">05 / 05</span></div>
              <div class="briefing-list">${LEVELS.map((level, i) => `<div class="briefing-item">
                <span class="briefing-num">0${i + 1}</span><span class="briefing-name">${level.title}<span class="briefing-theme">${level.theme}</span></span>
                <span class="briefing-score">${level.qualify === null ? `${FINAL_QUESTION_COUNT * FINAL_QUESTION_SECONDS} SEC` : `≥ ${level.qualify}`}</span>
              </div>`).join("")}</div>
            </section>
          </div>
        </section>`;
        document.querySelector("#start-run").addEventListener("click", startNewRun);
        document.querySelector("#player-name").addEventListener("keydown", (event) => {
          if (event.key === "Enter") startNewRun();
        });
        const resumeButton = document.querySelector("#resume-run");
        if (resumeButton) resumeButton.addEventListener("click", () => {
          loadRun();
          if (run.level >= 5) renderFinal();
          else renderLevel(run.level);
        });
        if (resumed) document.querySelector("#player-name").value = "";
      }

      function startNewRun() {
        const input = document.querySelector("#player-name");
        const player = input.value.trim().replace(/\s+/g, " ");
        if (!player) {
          input.setCustomValidity("Enter your player name to begin.");
          input.reportValidity();
          input.addEventListener("input", () => input.setCustomValidity(""), { once: true });
          return;
        }
        clearTick();
        run = {
          id: makeId(),
          player: player.slice(0, 24),
          scores: [0, 0, 0, 0, 0],
          level: 0,
          status: "in_progress",
          startedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          level5TimeMs: null
        };
        syncRun();
        sound(440, .1);
        renderLevel(0);
      }

      function renderLevel(levelIndex) {
        clearTick();
        if (!run || levelIndex < 0 || levelIndex > 4 || levelIndex !== run.level) {
          renderStart();
          return;
        }
        levelState = { index: levelIndex };
        if (levelIndex === 0) renderPassword();
        else if (levelIndex === 1) renderPhishing();
        else if (levelIndex === 2) renderCipher();
        else if (levelIndex === 3) renderInvestigation();
        else renderFinalCode();
      }

      function finishLevel(score) {
        const index = run.level;
        run.scores[index] = Math.max(0, Math.min(100, Math.round(score)));
        syncRun();
        sound(run.scores[index] >= LEVELS[index].qualify ? 740 : 180, .18, run.scores[index] >= LEVELS[index].qualify ? "sine" : "triangle");
        if (index < 4 && run.scores[index] < LEVELS[index].qualify) {
          run.status = "failed";
          syncRun();
          renderFailed(index);
          return;
        }
        if (index === 4) {
          run.level = 5;
          run.status = "finalist";
          run.completedAt = new Date().toISOString();
          const records = readList(FINALISTS_KEY);
          const existing = records.findIndex((record) => record.id === run.id);
          if (existing === -1) records.push({ ...run });
          else records[existing] = { ...run };
          writeData(FINALISTS_KEY, records);
          syncRun();
          renderFinal();
          return;
        }
        run.level = index + 1;
        syncRun();
        renderPassed(index);
      }

      function renderPassword() {
        const index = 0;
        const attempts = 3;
        levelState.attempt = 0;
        app.innerHTML = `${headerMarkup(index, 0)}<div class="stage-grid animate-in">
          <section class="panel challenge-panel">
            <div class="eyebrow">Gate 01 · Password Fortress</div>
            <h2 style="margin-top:10px">Crack the access phrase.</h2>
            <p class="game-description">A vault accepts a four-digit numeric code. Use each clue to reason out the only code that fits.</p>
            <ul class="clue-list">
              <li>Every digit is different; the first digit is not zero.</li>
              <li>The first digit is twice the last digit.</li>
              <li>The second digit is one greater than the last digit.</li>
              <li>The third digit is the sum of the first two digits.</li>
              <li>The four digits add up to 16.</li>
            </ul>
            <div class="tiny-label">Access code · three attempts</div>
            <div class="attempts" aria-label="${attempts} attempts"><i></i><i></i><i></i></div>
            <form class="form-row" id="password-form">
              <input class="text-input" id="password-answer" inputmode="numeric" maxlength="4" pattern="[0-9]{4}" autocomplete="off" placeholder="4-digit code" aria-label="Four digit code" required>
              <button class="button" type="submit">Test code</button>
            </form>
            <div class="notice" id="password-feedback" role="status"></div>
          </section>
          ${sideMarkup(index, 0, "Attempt 1 / 3", "Logic is the key. Incorrect guesses use an attempt; a correct solution earns more points when solved sooner.")}
        </div>`;
        document.querySelector("#password-form").addEventListener("submit", (event) => {
          event.preventDefault();
          const field = document.querySelector("#password-answer");
          const guess = field.value.trim();
          if (!/^\d{4}$/.test(guess)) {
            field.setCustomValidity("Enter exactly four digits.");
            field.reportValidity();
            field.addEventListener("input", () => field.setCustomValidity(""), { once: true });
            return;
          }
          levelState.attempt += 1;
          const answer = "4372";
          const feedback = document.querySelector("#password-feedback");
          const bars = document.querySelectorAll(".attempts i");
          bars[levelState.attempt - 1].classList.add("used");
          if (guess === answer) {
            const score = [100, 75, 50][levelState.attempt - 1];
            document.querySelector(".score-value").textContent = score;
            feedback.className = "notice good";
            feedback.textContent = `Vault unlocked · ${score} / 100`;
            document.querySelector("#password-form button").disabled = true;
            window.setTimeout(() => finishLevel(score), 850);
          } else if (levelState.attempt >= attempts) {
            document.querySelector(".score-value").textContent = "0";
            feedback.className = "notice bad";
            feedback.textContent = "Access denied · all attempts used.";
            document.querySelector("#password-form button").disabled = true;
            window.setTimeout(() => finishLevel(0), 850);
          } else {
            const score = [100, 75, 50][levelState.attempt];
            document.querySelector(".score-value").textContent = score;
            feedback.className = "notice bad";
            feedback.textContent = `Not quite · ${attempts - levelState.attempt} attempt${attempts - levelState.attempt === 1 ? "" : "s"} remaining.`;
            document.querySelectorAll(".side-panel .side-stat strong")[1].textContent = `Attempt ${levelState.attempt + 1} / 3`;
            field.value = "";
            field.focus();
            sound(220, .07, "triangle");
          }
        });
      }

      function renderPhishing() {
        const index = 1;
        levelState.answers = Array(10).fill(null);
        const rows = PHISHING_CASES.map((item, i) => `<div class="link-item">
          <div><span class="link-url">${escapeHtml(item.url)}</span><span class="link-message">${escapeHtml(item.message)}</span></div>
          <div class="choice-pair" role="group" aria-label="Classify link ${i + 1}">
            <button class="choice" type="button" data-index="${i}" data-answer="safe" aria-pressed="false">SAFE</button>
            <button class="choice" type="button" data-index="${i}" data-answer="suspicious" aria-pressed="false">SUSPICIOUS</button>
          </div>
        </div>`).join("");
        app.innerHTML = `${headerMarkup(index, 0)}<div class="stage-grid animate-in">
          <section class="panel challenge-panel">
            <div class="eyebrow">Gate 02 · Link Verification Round</div>
            <h2 style="margin-top:10px">Trust the destination?</h2>
            <p class="game-description">Classify each message link. Check the registrable domain, subdomains, lookalike characters, and URL structure. All domains below are fictional training examples.</p>
            <div class="link-list">${rows}</div>
            <div class="notice" id="phishing-feedback" role="status">Classify all 10 links · 10 points each.</div>
            <button class="button" id="submit-phishing" type="button">Submit classifications <span aria-hidden="true">↗</span></button>
          </section>
          ${sideMarkup(index, 0, "0 / 10 classified", "A familiar brand name can appear inside a deceptive hostname. Read the actual domain from right to left.")}
        </div>`;
        document.querySelectorAll(".choice").forEach((button) => {
          button.addEventListener("click", () => {
            const answer = button.dataset.answer;
            const i = Number(button.dataset.index);
            levelState.answers[i] = answer;
            document.querySelectorAll(`.choice[data-index="${i}"]`).forEach((choice) => {
              const selected = choice.dataset.answer === answer;
              choice.classList.toggle("selected", selected);
              choice.classList.toggle(answer, selected);
              choice.setAttribute("aria-pressed", String(selected));
            });
            document.querySelectorAll(".side-panel .side-stat strong")[1].textContent = `${levelState.answers.filter(Boolean).length} / 10 classified`;
            sound(480, .045);
          });
        });
        document.querySelector("#submit-phishing").addEventListener("click", () => {
          const classified = levelState.answers.filter(Boolean).length;
          const feedback = document.querySelector("#phishing-feedback");
          if (classified < 10) {
            feedback.className = "notice bad";
            feedback.textContent = `Classify every link before submitting · ${10 - classified} remaining.`;
            return;
          }
          const score = levelState.answers.reduce((total, answer, i) => total + (answer === (PHISHING_CASES[i].safe ? "safe" : "suspicious") ? 10 : 0), 0);
          document.querySelector("#submit-phishing").disabled = true;
          document.querySelector(".score-value").textContent = score;
          feedback.className = `notice ${score >= 60 ? "good" : "bad"}`;
          feedback.textContent = `${score} / 100 · ${score >= 60 ? "Threshold reached." : "Below the 60-point qualification threshold."}`;
          window.setTimeout(() => finishLevel(score), 950);
        });
      }

      function shiftWord(word, key) {
        return word.replace(/[A-Z]/g, (letter) => String.fromCharCode(((letter.charCodeAt(0) - 65 + key) % 26) + 65));
      }

      function renderCipher() {
        const index = 2;
        const words = ["FIREWALL", "SECURE", "NETWORK", "TOKEN", "DEFEND", "ENCRYPT", "BACKUP", "ROUTER"];
        const selected = [...words].sort(() => Math.random() - .5).slice(0, 5);
        const questions = selected.map((word) => {
          const key = 1 + Math.floor(Math.random() * 9);
          return { word, key, answer: shiftWord(word, key) };
        });
        levelState.questions = questions;
        levelState.question = 0;
        levelState.score = 0;
        drawCipherQuestion();
      }

      function drawCipherQuestion() {
        const index = 2;
        const question = levelState.questions[levelState.question];
        const score = levelState.score;
        app.innerHTML = `${headerMarkup(index, score)}<div class="stage-grid animate-in">
          <section class="panel challenge-panel">
            <div class="eyebrow">Gate 03 · Cipher Chamber</div>
            <h2 style="margin-top:10px">Shift the signal.</h2>
            <p class="game-description">Caesar cipher rule: shift every letter forward by the numerical key, wrapping Z back to A. Keep the original letter order. Decode the message shown below.</p>
            <div class="alphabet">A B C D E F G H I J K L M<br>N O P Q R S T U V W X Y Z</div>
            <div class="key-badge">NUMERICAL KEY <strong>${question.key}</strong> <span class="muted">· FORWARD SHIFT</span></div>
            <div class="tiny-label" style="margin-top:18px">Plaintext</div>
            <div class="cipher-message">${question.word}</div>
            <div class="round-count">QUESTION 0${levelState.question + 1} / 05</div>
            <form class="form-row" id="cipher-form">
              <input class="text-input" id="cipher-answer" maxlength="16" autocomplete="off" placeholder="Encrypted answer" aria-label="Encrypted answer" required>
              <button class="button" type="submit">${levelState.question === 4 ? "Submit final" : "Lock answer"}</button>
            </form>
            <div class="notice" id="cipher-feedback" role="status">Correct answers earn 20 points.</div>
          </section>
          ${sideMarkup(index, score, `Question ${levelState.question + 1} / 5`, "Each round uses a fresh key and message. Spaces are ignored when you submit your encrypted text.")}
        </div>`;
        document.querySelector("#cipher-form").addEventListener("submit", (event) => {
          event.preventDefault();
          const field = document.querySelector("#cipher-answer");
          const answer = field.value.toUpperCase().replace(/[^A-Z]/g, "");
          if (!answer) return;
          const correct = answer === question.answer;
          if (correct) levelState.score += 20;
          const feedback = document.querySelector("#cipher-feedback");
          feedback.className = `notice ${correct ? "good" : "bad"}`;
          feedback.textContent = correct ? "Signal decoded · +20 points." : "Signal rejected · no points this round.";
          document.querySelector("#cipher-form button").disabled = true;
          document.querySelector(".score-value").textContent = levelState.score;
          window.setTimeout(() => {
            if (levelState.question < 4) {
              levelState.question += 1;
              drawCipherQuestion();
            } else {
              finishLevel(levelState.score);
            }
          }, 700);
        });
      }

      const javaSource = [
        '<span class="code-keyword">public class</span> StudentMarks {',
        '    <span class="code-keyword">public static void</span> main(String[] args) {',
        '        <span class="code-keyword">int</span>[] quizScores = {<span class="code-number">3, 25, 2, 5, 18</span>};',
        '        <span class="code-keyword">int</span>[] examScores = {<span class="code-number">19, 5, 3, 21, 18, 9, 20, 25</span>};',
        '        <span class="code-keyword">int</span> total = 0;',
        '        <span class="code-keyword">int</span> count = 0;',
        '',
        '        <span class="code-keyword">for</span> (<span class="code-keyword">int</span> mark : quizScores) {',
        '            total += mark;',
        '            count++;',
        '        }',
        '        <span class="code-keyword">for</span> (<span class="code-keyword">int</span> mark : examScores) {',
        '            total += mark;',
        '            count++;',
        '        }',
        '',
        '        <span class="code-keyword">double</span> average = (double) total / count;',
        '        System.out.println(<span class="code-string">"Number of marks: "</span> + count);',
        '        System.out.println(<span class="code-string">"Total marks: "</span> + total);',
        '        System.out.printf(<span class="code-string">"Average mark: %.2f%n"</span>, average);',
        '    }',
        '}'
      ].join("\n");

      function renderInvestigation() {
        const index = 3;
        app.innerHTML = `${headerMarkup(index, 0)}<div class="stage-grid animate-in">
          <section class="panel challenge-panel">
            <div class="eyebrow">Gate 04 · Digital Investigation</div>
            <h2 style="margin-top:10px">Read between the lines.</h2>
            <p class="game-description">Inspect this ordinary Java marks program. Its output is routine; the numeric data is not. Identify the hidden two-word message in the order the numbers appear.</p>
            <div class="tiny-label">Start with A = 1.</div>
            <div class="code-window">
              <div class="code-bar"><span class="code-dot"></span><span class="code-dot"></span><span class="code-dot"></span>&nbsp;&nbsp;StudentMarks.java</div>
              <pre>${javaSource}</pre>
            </div>
            <form class="form-row" id="investigation-form">
              <input class="text-input" id="investigation-answer" maxlength="40" autocomplete="off" placeholder="Identify the message" aria-label="Hidden message" required>
              <button class="button" type="submit">Submit finding</button>
            </form>
            <div class="notice" id="investigation-feedback" role="status">One answer · 100 points for a correct finding.</div>
          </section>
          ${sideMarkup(index, 0, "Source review", "The program is valid Java and calculates marks normally. Look for familiar data groups and map each number to a letter.")}
        </div>`;
        document.querySelector("#investigation-form").addEventListener("submit", (event) => {
          event.preventDefault();
          const answer = document.querySelector("#investigation-answer").value.toUpperCase().replace(/[^A-Z]/g, "");
          const correct = answer === "CYBERSECURITY";
          const score = correct ? 100 : 0;
          document.querySelector(".score-value").textContent = score;
          const feedback = document.querySelector("#investigation-feedback");
          feedback.className = `notice ${correct ? "good" : "bad"}`;
          feedback.textContent = correct ? "Finding confirmed · 100 / 100." : "Finding not confirmed · qualification requires 70 points.";
          document.querySelector("#investigation-form button").disabled = true;
          window.setTimeout(() => finishLevel(score), 900);
        });
      }

      function renderFinalCode() {
        levelState.question = 0;
        levelState.score = 0;
        levelState.elapsedMs = 0;
        levelState.roundStart = Date.now();
        levelState.advancing = false;
        levelState.rounds = TOOL_ROUNDS.map((item) => ({ ...item }));
        drawToolQuestion();
        startToolTimer();
      }

      function startToolTimer() {
        clearTick();
        tickHandle = window.setInterval(updateToolTimer, 100);
      }

      function drawToolQuestion() {
        if (!run || run.level !== 4 || levelState.question >= 5) return;
        const index = 4;
        const q = levelState.question;
        const roundRemaining = Math.max(0, FINAL_QUESTION_SECONDS * 1000 - (Date.now() - levelState.roundStart));
        const secondsLeft = Math.ceil(roundRemaining / 1000);
        const item = levelState.rounds[q];
        app.innerHTML = `${headerMarkup(4, levelState.score)}<div class="stage-grid animate-in">
          <section class="panel challenge-panel">
            <div class="round-top"><div><div class="eyebrow">Gate 05 · Cyber Intelligence</div><h2 style="margin:9px 0 0">Find the tool.</h2></div><div class="timer"><span aria-hidden="true">◷</span><span id="round-timer">${secondsLeft}s</span></div></div>
            <p class="game-description">A cybersecurity tool name is embedded inside this signal. Identify the tool. One answer per signal; the next round begins immediately.</p>
            <div class="timer-bar"><span id="timer-progress" style="width:${roundRemaining / (FINAL_QUESTION_SECONDS * 10)}%"></span></div>
            <div class="round-count">SIGNAL 0${q + 1} / 05 &nbsp;·&nbsp; 20 POINTS</div>
            <div class="tool-string" aria-label="Encrypted signal">${escapeHtml(item.display)}</div>
            <form class="form-row" id="tool-form">
              <input class="text-input" id="tool-answer" maxlength="24" autocomplete="off" placeholder="Cybersecurity tool name" aria-label="Cybersecurity tool name" required>
              <button class="button" type="submit">Identify</button>
            </form>
            <div class="notice" id="tool-feedback" role="status">Five signals · 30 seconds each · 2 minutes 30 seconds total.</div>
          </section>
          ${sideMarkup(index, levelState.score, `Signal ${q + 1} / 5`, "The signal uses letter-for-number substitutions. Submit once or the 30-second window will expire automatically.")}
        </div>`;
        document.querySelector("#tool-form").addEventListener("submit", (event) => {
          event.preventDefault();
          if (levelState.advancing) return;
          const answer = document.querySelector("#tool-answer").value.toUpperCase().replace(/[^A-Z]/g, "");
          if (!answer) return;
          resolveToolQuestion(answer);
        });
      }

      function resolveToolQuestion(answer) {
        if (levelState.advancing) return;
        levelState.advancing = true;
        clearTick();
        const questionElapsed = Date.now() - levelState.roundStart;
        if (questionElapsed >= FINAL_QUESTION_SECONDS * 1000) {
          levelState.elapsedMs += FINAL_QUESTION_SECONDS * 1000;
          const feedback = document.querySelector("#tool-feedback");
          if (feedback) {
            feedback.className = "notice bad";
            feedback.textContent = "Time expired · advancing to the next signal.";
          }
          window.setTimeout(() => advanceToolQuestion(), 120);
          return;
        }
        levelState.elapsedMs += questionElapsed;
        const item = levelState.rounds[levelState.question];
        const correct = answer === item.answer;
        if (correct) levelState.score += 20;
        const feedback = document.querySelector("#tool-feedback");
        if (feedback) {
          feedback.className = `notice ${correct ? "good" : "bad"}`;
          feedback.textContent = correct ? "Tool identified · +20 points." : "Signal lost · no points this round.";
        }
        const scoreValue = document.querySelector(".score-value");
        if (scoreValue) scoreValue.textContent = levelState.score;
        sound(correct ? 700 : 180, .08, correct ? "sine" : "triangle");
        window.setTimeout(() => advanceToolQuestion(), 250);
      }

      function advanceToolQuestion() {
        if (levelState.question >= 5) return;
        levelState.question += 1;
        levelState.advancing = false;
        if (levelState.question >= 5) {
          clearTick();
          run.level5TimeMs = levelState.elapsedMs;
          finishLevel(levelState.score);
          return;
        }
        levelState.roundStart = Date.now();
        drawToolQuestion();
        startToolTimer();
      }

      function updateToolTimer() {
        if (!run || run.level !== 4 || levelState.question >= 5 || levelState.advancing) return;
        const roundElapsed = Date.now() - levelState.roundStart;
        const roundRemaining = Math.max(0, FINAL_QUESTION_SECONDS * 1000 - roundElapsed);
        const seconds = Math.ceil(roundRemaining / 1000);
        const timer = document.querySelector("#round-timer");
        const progress = document.querySelector("#timer-progress");
        if (timer) timer.textContent = `${seconds}s`;
        if (progress) progress.style.width = `${roundRemaining / (FINAL_QUESTION_SECONDS * 10)}%`;
        if (roundRemaining <= 0) {
          levelState.advancing = true;
          clearTick();
          levelState.elapsedMs += FINAL_QUESTION_SECONDS * 1000;
          const feedback = document.querySelector("#tool-feedback");
          if (feedback) {
            feedback.className = "notice bad";
            feedback.textContent = "Time expired · advancing to the next signal.";
          }
          window.setTimeout(() => advanceToolQuestion(), 120);
        }
      }

      function renderFailed(index) {
        clearTick();
        app.innerHTML = `<section class="outcome failed animate-in">
          <div class="outcome-mark"><span>×</span></div>
          <div class="eyebrow">MISSION TERMINATED · LEVEL 0${index + 1}</div>
          <h1 style="margin-top:13px">MISSION FAILED</h1>
          <p class="outcome-copy">The qualification threshold was not reached. Access to the next gate remains locked. Your score has been saved to this device.</p>
          <div class="result-score">${run.scores[index]} <span style="color:#8291a4;font-size:18px">/ 100</span></div>
          <div class="outcome-actions"><button class="button" id="new-run" type="button">New player <span aria-hidden="true">↗</span></button><button class="button secondary" id="home" type="button">Mission control</button></div>
        </section>`;
        document.querySelector("#new-run").addEventListener("click", renderStart);
        document.querySelector("#home").addEventListener("click", renderStart);
      }

      function renderPassed(index) {
        app.innerHTML = `<section class="outcome pass animate-in">
          <div class="outcome-mark"><span>✓</span></div>
          <div class="eyebrow">GATE 0${index + 1} CLEARED</div>
          <h1 style="margin-top:13px">ACCESS GRANTED</h1>
          <p class="outcome-copy">${LEVELS[index].title} complete. You met the qualification threshold and the next level is now unlocked.</p>
          <div class="score-card">
            ${run.scores.slice(0, index + 1).map((score, i) => `<div><strong>${score}</strong><span>LEVEL 0${i + 1}</span></div>`).join("")}
          </div>
          <div class="outcome-actions"><button class="button" id="next-level" type="button">Enter level 0${index + 2} <span aria-hidden="true">↗</span></button></div>
        </section>`;
        document.querySelector("#next-level").addEventListener("click", () => renderLevel(run.level));
      }

      function sortFinalists(records) {
        return [...records].sort((a, b) => {
          const totalA = a.scores.reduce((sum, score) => sum + score, 0);
          const totalB = b.scores.reduce((sum, score) => sum + score, 0);
          return totalB - totalA ||
            b.scores[4] - a.scores[4] ||
            b.scores[2] - a.scores[2] ||
            (a.level5TimeMs ?? Number.MAX_SAFE_INTEGER) - (b.level5TimeMs ?? Number.MAX_SAFE_INTEGER) ||
            new Date(a.completedAt || 0) - new Date(b.completedAt || 0);
        });
      }

      function isJointWinner(a, b) {
        return Boolean(a && b &&
          a.scores.reduce((sum, score) => sum + score, 0) === b.scores.reduce((sum, score) => sum + score, 0) &&
          a.scores[4] === b.scores[4] &&
          a.scores[2] === b.scores[2] &&
          a.level5TimeMs === b.level5TimeMs);
      }

      function renderFinal() {
        clearTick();
        const finalists = sortFinalists(readList(FINALISTS_KEY).filter((record) =>
          record && record.status === "finalist" && Array.isArray(record.scores) && record.scores.length === 5 &&
          record.scores.every((score) => Number.isFinite(score) && score >= 0 && score <= 100)
        ));
        const winner = finalists[0] || run;
        const total = winner ? winner.scores.reduce((sum, score) => sum + score, 0) : 0;
        const percentage = (total / 500 * 100).toFixed(1);
        const joint = finalists.length > 1 && isJointWinner(finalists[0], finalists[1]);
        const jointWinnerIds = joint ? finalists.filter((person) => isJointWinner(finalists[0], person)).map((person) => person.id) : [];
        const podium = finalists.slice(0, 3);
        const podiumMarkup = Array.from({ length: 3 }, (_, i) => {
          const person = podium[i];
          if (!person) return `<div class="podium-card"><div class="podium-place">${["1ST PLACE", "2ND PLACE", "3RD PLACE"][i]}</div><div class="podium-name muted">—</div><div class="podium-pct">Awaiting finalist</div></div>`;
          const score = person.scores.reduce((sum, value) => sum + value, 0);
          const isJoint = jointWinnerIds.includes(person.id);
          return `<div class="podium-card"><div class="podium-place">${["1ST PLACE", "2ND PLACE", "3RD PLACE"][i]}${isJoint ? " · JOINT" : ""}</div><div class="podium-name">${escapeHtml(person.player)}</div><div class="podium-pct">${(score / 500 * 100).toFixed(1)}% · ${score}/500</div></div>`;
        }).join("");
        const tableRows = finalists.map((person, i) => {
          const personTotal = person.scores.reduce((sum, score) => sum + score, 0);
          const jointLabel = jointWinnerIds.includes(person.id) ? " · JOINT CHAMPION" : "";
          return `<tr><td class="leader-rank">${String(i + 1).padStart(2, "0")}</td><td>${escapeHtml(person.player)}${jointLabel}</td>${person.scores.map((score) => `<td>${score}</td>`).join("")}<td>${personTotal}</td><td class="leader-score">${(personTotal / 500 * 100).toFixed(1)}%</td></tr>`;
        }).join("");
        const currentFinalist = run && run.status === "finalist";
        app.innerHTML = `<section class="animate-in">
          <div class="final-hero">
            <div class="hero-kicker eyebrow">MISSION COMPLETE · FINALIST RECORDS</div>
            <h1 style="font-size:clamp(40px,7vw,68px)">THE GRID IS <span>SECURE.</span></h1>
            <p class="hero-copy" style="margin-bottom:10px">${currentFinalist ? `Outstanding, ${escapeHtml(run.player)}. Your full mission record is now on the board.` : "The final standings are ranked by overall score, then the Level 5 and Level 3 tie-breakers."}</p>
          </div>
          <section class="winner-card">
            <div class="crown" aria-hidden="true">♛</div>
            <div class="winner-tag">${joint ? "🏆 JOINT CYBER ESCAPE ROOM CHAMPIONS" : "🏆 CYBER ESCAPE ROOM CHAMPION"}</div>
            <h2 class="winner-name">${winner ? escapeHtml(winner.player) : "Awaiting finalist"}</h2>
            <div class="winner-metrics"><div><strong>${winner ? `${percentage}%` : "—"}</strong><span>OVERALL PERCENTAGE</span></div><div><strong>${winner ? `${total} / 500` : "—"}</strong><span>TOTAL SCORE</span></div></div>
          </section>
          <div class="podium">${podiumMarkup}</div>
          <section class="leaderboard">
            <div class="leaderboard-title">FINALIST SCOREBOARD <span style="float:right">${finalists.length} FINALIST${finalists.length === 1 ? "" : "S"}</span></div>
            ${finalists.length ? `<table><thead><tr><th>#</th><th>PLAYER</th><th>L1</th><th>L2</th><th>L3</th><th>L4</th><th>L5</th><th>TOTAL</th><th>OVERALL %</th></tr></thead><tbody>${tableRows}</tbody></table>` : `<div class="leaderboard-empty">No finalist records yet. Complete all five levels to claim a place on the board.</div>`}
          </section>
          <div class="final-actions"><button class="button" id="new-player" type="button">Start new player <span aria-hidden="true">↗</span></button>${currentFinalist ? `<button class="button secondary" id="replay-home" type="button">Mission control</button>` : ""}</div>
        </section>`;
        document.querySelector("#new-player").addEventListener("click", renderStart);
        const home = document.querySelector("#replay-home");
        if (home) home.addEventListener("click", renderStart);
      }

      observeTransitions(app, setWorldStage);
      renderStart();
}