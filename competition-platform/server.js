import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { mkdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { assignChallenges, getChallenge, LEVEL_NAMES, LEVEL_ONE_ATTEMPTS, LEVEL_ONE_QUESTION_MS, LEVEL_QUESTION_COUNTS, QUALIFYING_SCORES } from "./server/questions.js";

const PARTICIPANT_COOKIE = "cyber_participant";
const ADMIN_COOKIE = "cyber_admin";
const PARTICIPANT_SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const ADMIN_SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const LEVEL_FIVE_QUESTION_MS = 30 * 1000;
const jsonHeaders = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function parsePasswordHash(value) {
  const match = /^scrypt:([a-f0-9]{32}):([a-f0-9]{128})$/i.exec(value || "");
  if (!match) throw new Error("ADMIN_PASSWORD_HASH must be generated with `npm run hash-admin-password`.");
  return { salt: Buffer.from(match[1], "hex"), expected: Buffer.from(match[2], "hex") };
}

function verifyPassword(password, credentials) {
  const candidate = scryptSync(password, credentials.salt, credentials.expected.length);
  return timingSafeEqual(candidate, credentials.expected);
}

function createDatabase(databasePath) {
  if (databasePath !== ":memory:") mkdirSync(dirname(databasePath), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(databasePath);
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value INTEGER NOT NULL
    );
    INSERT OR IGNORE INTO app_meta (key, value) VALUES ('revision', 0);
    CREATE TABLE IF NOT EXISTS participants (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      college TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      year TEXT NOT NULL,
      department TEXT NOT NULL,
      question_index INTEGER NOT NULL DEFAULT 0,
      question_attempt_count INTEGER NOT NULL DEFAULT 0,
      current_level INTEGER NOT NULL DEFAULT 1,
      awaiting_level INTEGER,
      challenge_assignments TEXT NOT NULL DEFAULT '{}',
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'eliminated', 'completed')),
      level1_score INTEGER NOT NULL DEFAULT 0,
      level2_score INTEGER NOT NULL DEFAULT 0,
      level3_score INTEGER NOT NULL DEFAULT 0,
      level4_score INTEGER NOT NULL DEFAULT 0,
      level5_score INTEGER NOT NULL DEFAULT 0,
      level1_qualified INTEGER NOT NULL DEFAULT 0,
      level2_qualified INTEGER NOT NULL DEFAULT 0,
      level3_qualified INTEGER NOT NULL DEFAULT 0,
      level4_qualified INTEGER NOT NULL DEFAULT 0,
      level5_started_at INTEGER,
      question_started_at INTEGER,
      level5_completed_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      revision INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS participants_revision_idx ON participants (revision);
    CREATE TABLE IF NOT EXISTS participant_sessions (
      token_hash TEXT PRIMARY KEY,
      participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS participant_sessions_expiry_idx ON participant_sessions (expires_at);
    CREATE TABLE IF NOT EXISTS admin_sessions (
      token_hash TEXT PRIMARY KEY,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS admin_sessions_expiry_idx ON admin_sessions (expires_at);
    CREATE TABLE IF NOT EXISTS answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
      question_id TEXT NOT NULL,
      level INTEGER NOT NULL,
      question_ordinal INTEGER NOT NULL,
      submitted_answer TEXT,
      is_correct INTEGER NOT NULL,
      points_awarded INTEGER NOT NULL,
      attempts_used INTEGER NOT NULL DEFAULT 1,
      answered_at INTEGER NOT NULL,
      UNIQUE (participant_id, question_id)
    );
    CREATE INDEX IF NOT EXISTS answers_participant_idx ON answers (participant_id, answered_at);
    CREATE TABLE IF NOT EXISTS answer_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
      question_id TEXT NOT NULL,
      attempt_number INTEGER NOT NULL,
      submitted_answer TEXT,
      is_correct INTEGER NOT NULL,
      attempted_at INTEGER NOT NULL,
      UNIQUE (participant_id, question_id, attempt_number)
    );
    CREATE INDEX IF NOT EXISTS answer_attempts_participant_idx ON answer_attempts (participant_id, attempted_at);
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      participant_id TEXT NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
      event_type TEXT NOT NULL,
      client_time TEXT,
      occurred_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS events_participant_idx ON events (participant_id, occurred_at DESC);
  `);
  const participantColumns = db.prepare("PRAGMA table_info(participants)").all().map((column) => column.name);
  if (!participantColumns.includes("awaiting_level")) {
    db.exec("ALTER TABLE participants ADD COLUMN awaiting_level INTEGER");
  }
  if (!participantColumns.includes("challenge_assignments")) {
    db.exec("ALTER TABLE participants ADD COLUMN challenge_assignments TEXT NOT NULL DEFAULT '{}'");
  }
  if (!participantColumns.includes("question_attempt_count")) {
    db.exec("ALTER TABLE participants ADD COLUMN question_attempt_count INTEGER NOT NULL DEFAULT 0");
  }
  const answerColumns = db.prepare("PRAGMA table_info(answers)").all().map((column) => column.name);
  if (!answerColumns.includes("attempts_used")) {
    db.exec("ALTER TABLE answers ADD COLUMN attempts_used INTEGER NOT NULL DEFAULT 1");
  }
  backfillChallengeAssignments(db);
  return db;
}

function serializeParticipant(row) {
  if (!row) return null;
  return {
    ...row,
    level1_qualified: Boolean(row.level1_qualified),
    level2_qualified: Boolean(row.level2_qualified),
    level3_qualified: Boolean(row.level3_qualified),
    level4_qualified: Boolean(row.level4_qualified),
    created_at: new Date(row.created_at).toISOString(),
    updated_at: new Date(row.updated_at).toISOString(),
    level5_started_at: row.level5_started_at ? new Date(row.level5_started_at).toISOString() : null,
    level5_completed_at: row.level5_completed_at ? new Date(row.level5_completed_at).toISOString() : null
  };
}

function normalizeAnswer(answer) {
  return String(answer ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function backfillChallengeAssignments(db) {
  const participants = db.prepare("SELECT * FROM participants ORDER BY created_at, id").all();
  const usedAssignments = Array.from({ length: 5 }, (_, index) => participants.flatMap((row) => {
    const ids = JSON.parse(row.challenge_assignments || "{}")[String(index + 1)];
    return Array.isArray(ids) && ids.length === LEVEL_QUESTION_COUNTS[index] &&
      ids.every((id) => getChallenge(id)?.level === index + 1) && new Set(ids).size === ids.length
      ? [ids]
      : [];
  }));
  const update = db.prepare(`
    UPDATE participants
    SET challenge_assignments = ?, question_index = ?, question_attempt_count = ?, awaiting_level = ?, status = ?, level1_score = ?,
      level1_qualified = ?, level2_qualified = ?, level3_qualified = ?, level4_qualified = ?,
      question_started_at = ?, level5_completed_at = ?, updated_at = ?, revision = ?
    WHERE id = ?
  `);

  for (const participant of participants) {
    const assignments = JSON.parse(participant.challenge_assignments || "{}");
    const validAssignment = (level, ids) =>
      Array.isArray(ids) &&
      ids.length === LEVEL_QUESTION_COUNTS[level - 1] &&
      ids.every((id) => getChallenge(id)?.level === level) &&
      new Set(ids).size === ids.length;
    const currentAssignmentWasValid = validAssignment(
      participant.current_level,
      assignments[String(participant.current_level)]
    );
    let changed = false;
    for (let level = 1; level <= 5; level += 1) {
      if (!validAssignment(level, assignments[String(level)])) {
        assignments[String(level)] = assignChallenges(level, usedAssignments[level - 1]);
        usedAssignments[level - 1].push(assignments[String(level)]);
        changed = true;
      }
    }
    if (!changed) continue;

    let questionIndex = participant.question_index;
    let questionAttemptCount = currentAssignmentWasValid ? participant.question_attempt_count : 0;
    let awaitingLevel = participant.awaiting_level;
    let status = participant.status;
    let qualified = [1, 2, 3, 4].map((level) => Number(participant[`level${level}_qualified`]));
    let levelOneScore = participant.level1_score;
    if (!currentAssignmentWasValid && status === "active" && participant.current_level === 1 && awaitingLevel === null) {
      levelOneScore = 0;
      qualified[0] = 0;
    }
    let questionStartedAt = participant.question_started_at;
    if (!currentAssignmentWasValid) questionStartedAt = null;
    let level5CompletedAt = participant.level5_completed_at;
    if (status === "active" && awaitingLevel === null) {
      const currentIds = assignments[String(participant.current_level)];
      const placeholders = currentIds.map(() => "?").join(", ");
      const answeredCount = db.prepare(`
        SELECT COUNT(*) AS count FROM answers
        WHERE participant_id = ? AND question_id IN (${placeholders})
      `).get(participant.id, ...currentIds).count;
      const levelCount = LEVEL_QUESTION_COUNTS[participant.current_level - 1];
      if (answeredCount >= levelCount) {
        questionIndex = levelCount;
        if (participant.current_level === 5) {
          status = "completed";
          level5CompletedAt ||= participant.updated_at;
          questionStartedAt = null;
        } else {
          const levelScore = participant[`level${participant.current_level}_score`];
          const passed = levelScore >= QUALIFYING_SCORES[participant.current_level - 1];
          qualified[participant.current_level - 1] = Number(passed);
          status = passed ? "active" : "eliminated";
          awaitingLevel = passed ? participant.current_level + 1 : null;
        }
      } else {
        questionIndex = answeredCount;
        if (!currentAssignmentWasValid) questionStartedAt = null;
      }
    }
    const now = Date.now();
    const revision = db.prepare("UPDATE app_meta SET value = value + 1 WHERE key = 'revision' RETURNING value").get().value;
    update.run(
      JSON.stringify(assignments),
      questionIndex,
      questionAttemptCount,
      awaitingLevel,
      status,
      levelOneScore,
      ...qualified,
      questionStartedAt,
      level5CompletedAt,
      now,
      revision,
      participant.id
    );
  }
}

function validateProfile(profile) {
  const fields = [
    ["name", "Full name", 120],
    ["college", "College", 180],
    ["email", "Email", 254],
    ["phone", "Phone number", 40],
    ["year", "Year", 40],
    ["department", "Department", 120]
  ];
  const result = {};
  for (const [key, label, maximum] of fields) {
    const value = profile?.[key];
    if (typeof value !== "string" || !value.trim() || value.trim().length > maximum) {
      throw new HttpError(400, `${label} is required.`);
    }
    result[key === "name" ? "full_name" : key] = value.trim();
  }
  result.email = result.email.toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.email)) {
    throw new HttpError(400, "Enter a valid email address.");
  }
  return result;
}

function parseCookies(request) {
  const header = request.headers.cookie || "";
  return Object.fromEntries(header.split(";").map((part) => {
    const separator = part.indexOf("=");
    if (separator < 0) return ["", ""];
    return [part.slice(0, separator).trim(), decodeURIComponent(part.slice(separator + 1).trim())];
  }).filter(([key]) => key));
}

function setCookie(response, name, token, { secure, maxAge }) {
  const value = token
    ? `${name}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(maxAge / 1000)}${secure ? "; Secure" : ""}`
    : `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
  response.setHeader("Set-Cookie", value);
}

function createSession(db, table, token, participantId, expiresAt) {
  db.prepare(`INSERT INTO ${table} (token_hash, ${participantId ? "participant_id," : ""} expires_at) VALUES (?, ${participantId ? "?," : ""} ?)`)
    .run(hashToken(token), ...(participantId ? [participantId] : []), expiresAt);
}

function sendJson(response, status, value) {
  response.writeHead(status, jsonHeaders);
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  const contentType = request.headers["content-type"] || "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new HttpError(415, "Send a JSON request.");
  }
  let raw = "";
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 32_768) throw new HttpError(413, "Request body is too large.");
  }
  let parsed;
  try {
    parsed = JSON.parse(raw || "{}");
  } catch {
    throw new HttpError(400, "Request body is not valid JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new HttpError(400, "Request JSON must be an object.");
  }
  return parsed;
}

function ensureSameOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return;
  try {
    const expectedHost = process.env.NODE_ENV === "development"
      ? request.headers["x-dev-proxy-host"] || request.headers.host
      : request.headers.host;
    if (new URL(origin).host !== expectedHost) throw new Error("origin mismatch");
  } catch {
    throw new HttpError(403, "Cross-origin requests are not allowed.");
  }
}

function clientIp(request) {
  return request.socket.remoteAddress || "unknown";
}

function createRateLimiter() {
  const attempts = new Map();
  return {
    allowed(key, now) {
      const state = attempts.get(key);
      if (!state || now - state.startedAt >= 15 * 60 * 1000) {
        attempts.set(key, { startedAt: now, count: 0 });
        return true;
      }
      return state.count < 8;
    },
    failed(key, now) {
      const state = attempts.get(key);
      if (!state || now - state.startedAt >= 15 * 60 * 1000) {
        attempts.set(key, { startedAt: now, count: 1 });
      } else {
        state.count += 1;
      }
      if (attempts.size > 5000) {
        for (const [ip, attempt] of attempts) {
          if (now - attempt.startedAt >= 15 * 60 * 1000) attempts.delete(ip);
        }
      }
    },
    clear(key) {
      attempts.delete(key);
    }
  };
}

export function createCompetitionServer({
  databasePath = process.env.DATABASE_PATH || resolve("data/competition.sqlite"),
  adminId = process.env.ADMIN_ID,
  adminPasswordHash = process.env.ADMIN_PASSWORD_HASH,
  secureCookies = process.env.NODE_ENV === "production",
  staticDir = resolve("dist")
} = {}) {
  const normalizedAdminId = String(adminId || "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(normalizedAdminId)) {
    throw new Error("Set ADMIN_ID to a 3–64 character username before starting the server.");
  }
  const adminCredentials = parsePasswordHash(adminPasswordHash);
  const db = createDatabase(databasePath);
  const rateLimiter = createRateLimiter();
  const participantByToken = db.prepare(`
    SELECT p.* FROM participant_sessions s
    JOIN participants p ON p.id = s.participant_id
    WHERE s.token_hash = ? AND s.expires_at > ?
  `);
  const adminByToken = db.prepare("SELECT token_hash FROM admin_sessions WHERE token_hash = ? AND expires_at > ?");
  const getParticipant = db.prepare("SELECT * FROM participants WHERE id = ?");
  const nextRevision = () => db.prepare("UPDATE app_meta SET value = value + 1 WHERE key = 'revision' RETURNING value").get().value;
  const adminStreams = new Set();
  const assignChallengeSet = (level) => {
    const usedSets = db.prepare("SELECT challenge_assignments FROM participants").all().flatMap(({ challenge_assignments }) => {
      const ids = JSON.parse(challenge_assignments || "{}")[String(level)];
      return Array.isArray(ids) && ids.length === LEVEL_QUESTION_COUNTS[level - 1] &&
        ids.every((id) => getChallenge(id)?.level === level) && new Set(ids).size === ids.length
        ? [ids]
        : [];
    });
    return assignChallenges(level, usedSets);
  };

  const levelCompletion = (participant, level, qualified) => ({
    level,
    level_name: LEVEL_NAMES[level - 1],
    score: participant[`level${level}_score`],
    qualified,
    next_level: qualified && level < 5 ? LEVEL_NAMES[level] : null,
    mission_complete: level === 5 && participant.status === "completed"
  });

  const publicQuestion = (participant) => {
    if (participant.awaiting_level !== null) {
      return {
        participant_id: participant.id,
        level_complete: true,
        completion: levelCompletion(participant, participant.current_level, true)
      };
    }
    if (participant.status === "eliminated") {
      return {
        participant_id: participant.id,
        session_ended: true,
        completion: levelCompletion(participant, participant.current_level, false)
      };
    }
    if (participant.status === "completed") {
      return {
        participant_id: participant.id,
        session_ended: true,
        completion: levelCompletion(participant, 5, true)
      };
    }
    const assignment = JSON.parse(participant.challenge_assignments || "{}");
    const challengeId = assignment[String(participant.current_level)]?.[participant.question_index];
    const question = getChallenge(challengeId);
    if (!question) throw new Error(`Active challenge assignment is missing for participant ${participant.id}.`);

    if ([1, 5].includes(question.level) && participant.question_started_at === null) {
      const now = Date.now();
      const revision = nextRevision();
      db.prepare(`
        UPDATE participants
        SET question_started_at = ?,
            level5_started_at = CASE WHEN ? = 5 AND ? = 1 AND level5_started_at IS NULL THEN ? ELSE level5_started_at END,
            updated_at = ?, revision = ?
        WHERE id = ? AND question_started_at IS NULL
      `).run(now, question.level, participant.question_index + 1, now, now, revision, participant.id);
      participant = getParticipant.get(participant.id);
      broadcastAdminUpdates();
    }

    const responseQuestion = {
      id: question.id,
      level: question.level,
      ordinal: participant.question_index + 1,
      prompt: question.prompt,
      terminal: question.terminal,
      artifact: question.artifact,
      ...(question.level === 1 ? { context: question.context, clues: question.clues } : {}),
      input_label: question.input_label,
      placeholder: question.placeholder,
      level_name: LEVEL_NAMES[question.level - 1]
    };
    if (question.level === 1) {
      const remaining = Math.max(0, LEVEL_ONE_QUESTION_MS - (Date.now() - participant.question_started_at));
      responseQuestion.seconds_remaining = Math.ceil(remaining / 1000);
      responseQuestion.attempts_remaining = LEVEL_ONE_ATTEMPTS - participant.question_attempt_count;
    }
    if (question.level === 5) {
      const remaining = Math.max(0, LEVEL_FIVE_QUESTION_MS - (Date.now() - participant.question_started_at));
      responseQuestion.seconds_remaining = Math.ceil(remaining / 1000);
    }
    return {
      participant_id: participant.id,
      question: responseQuestion,
      level: question.level,
      question_index: participant.question_index,
      level_question_count: LEVEL_QUESTION_COUNTS[question.level - 1]
    };
  };

  const getParticipantSession = (request) => {
    const token = parseCookies(request)[PARTICIPANT_COOKIE];
    if (!token) throw new HttpError(401, "Participant session not found.");
    const row = participantByToken.get(hashToken(token), Date.now());
    if (!row) throw new HttpError(401, "Participant session expired. Register to begin a new session.");
    return row;
  };

  const requireAdmin = (request) => {
    const token = parseCookies(request)[ADMIN_COOKIE];
    if (!token || !adminByToken.get(hashToken(token), Date.now())) {
      throw new HttpError(401, "Administrator session expired. Sign in again.");
    }
  };

  const adminParticipants = () => db.prepare("SELECT * FROM participants ORDER BY created_at DESC").all().map(serializeParticipant);
  const adminEvents = (limit = 100) => db.prepare(`
    SELECT id, participant_id, event_type, client_time, occurred_at
    FROM events ORDER BY id DESC LIMIT ?
  `).all(limit).map((event) => ({ ...event, occurred_at: new Date(event.occurred_at).toISOString() }));

  const readAdminUpdates = (revision, eventId) => {
    const participants = db.prepare("SELECT * FROM participants WHERE revision > ? ORDER BY revision").all(revision).map(serializeParticipant);
    const events = db.prepare(`
      SELECT id, participant_id, event_type, client_time, occurred_at
      FROM events WHERE id > ? ORDER BY id
    `).all(eventId).map((event) => ({ ...event, occurred_at: new Date(event.occurred_at).toISOString() }));
    return {
      full: false,
      participants,
      events,
      revision: db.prepare("SELECT value FROM app_meta WHERE key = 'revision'").get().value,
      event_id: db.prepare("SELECT COALESCE(MAX(id), 0) AS id FROM events").get().id
    };
  };

  const closeAdminStream = (stream, eventName, message) => {
    if (adminStreams.has(stream)) {
      if (eventName) {
        stream.response.write(`event: ${eventName}\ndata: ${JSON.stringify({ message })}\n\n`);
      }
      adminStreams.delete(stream);
      clearInterval(stream.heartbeat);
      stream.response.end();
    }
  };

  const sendAdminStreamUpdate = (stream) => {
    if (!adminStreams.has(stream)) return;
    const updates = readAdminUpdates(stream.revision, stream.eventId);
    if (updates.participants.length === 0 && updates.events.length === 0) return;
    stream.revision = updates.revision;
    stream.eventId = updates.event_id;
    stream.response.write(`id: ${stream.revision}:${stream.eventId}\nevent: updates\ndata: ${JSON.stringify(updates)}\n\n`);
  };

  function broadcastAdminUpdates() {
    for (const stream of adminStreams) sendAdminStreamUpdate(stream);
  }

  const startAdminStream = (request, response, url) => {
    const cookieToken = parseCookies(request)[ADMIN_COOKIE];
    const tokenHash = hashToken(cookieToken);
    const lastEventId = request.headers["last-event-id"];
    const cursor = typeof lastEventId === "string"
      ? /^(\d+):(\d+)$/.exec(lastEventId)
      : null;
    const revision = cursor
      ? Number(cursor[1])
      : Math.max(0, Number.parseInt(url.searchParams.get("revision") || "0", 10) || 0);
    const eventId = cursor
      ? Number(cursor[2])
      : Math.max(0, Number.parseInt(url.searchParams.get("event_id") || "0", 10) || 0);
    response.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      "X-Content-Type-Options": "nosniff"
    });
    response.write("retry: 3000\n: admin event stream connected\n\n");
    const stream = { response, tokenHash, revision, eventId, heartbeat: null };
    adminStreams.add(stream);
    stream.heartbeat = setInterval(() => {
      if (!adminByToken.get(tokenHash, Date.now())) {
        closeAdminStream(stream, "auth_expired", "Administrator session expired.");
        return;
      }
      response.write(": keep-alive\n\n");
    }, 20_000);
    response.on("close", () => closeAdminStream(stream));
    request.on("aborted", () => closeAdminStream(stream));
    sendAdminStreamUpdate(stream);
  };

  async function handleApi(request, response, url) {
    const path = url.pathname;
    const method = request.method || "GET";
    if (method === "POST") ensureSameOrigin(request);

    if (method === "POST" && path === "/api/participant/register") {
      const payload = await readJson(request);
      const profile = validateProfile(payload.profile);
      const existingToken = parseCookies(request)[PARTICIPANT_COOKIE];
      const existing = existingToken && participantByToken.get(hashToken(existingToken), Date.now());
      if (existing) return sendJson(response, 200, publicQuestion(existing));

      const id = randomBytes(16).toString("hex");
      const now = Date.now();
      const revision = nextRevision();
      const challengeAssignments = JSON.stringify({ "1": assignChallengeSet(1) });
      db.prepare(`
        INSERT INTO participants (id, full_name, college, email, phone, year, department, challenge_assignments, created_at, updated_at, revision)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, profile.full_name, profile.college, profile.email, profile.phone, profile.year, profile.department, challengeAssignments, now, now, revision);
      const token = randomBytes(32).toString("base64url");
      createSession(db, "participant_sessions", token, id, now + PARTICIPANT_SESSION_MS);
      setCookie(response, PARTICIPANT_COOKIE, token, { secure: secureCookies, maxAge: PARTICIPANT_SESSION_MS });
      db.prepare("DELETE FROM participant_sessions WHERE expires_at <= ?").run(now);
      broadcastAdminUpdates();
      return sendJson(response, 201, publicQuestion(getParticipant.get(id)));
    }

    if (method === "GET" && path === "/api/participant/current") {
      return sendJson(response, 200, publicQuestion(getParticipantSession(request)));
    }

    if (method === "POST" && path === "/api/participant/advance") {
      const participant = getParticipantSession(request);
      if (participant.status !== "active" || participant.awaiting_level === null) {
        throw new HttpError(409, "There is no qualified level waiting to advance.");
      }
      const nextLevel = participant.awaiting_level;
      const challengeAssignments = JSON.parse(participant.challenge_assignments || "{}");
      challengeAssignments[String(nextLevel)] = assignChallengeSet(nextLevel);
      const revision = nextRevision();
      db.prepare(`
        UPDATE participants
        SET current_level = ?, question_index = 0, question_attempt_count = 0, question_started_at = NULL,
          awaiting_level = NULL, challenge_assignments = ?, updated_at = ?, revision = ?
        WHERE id = ? AND status = 'active' AND awaiting_level = ?
      `).run(nextLevel, JSON.stringify(challengeAssignments), Date.now(), revision, participant.id, nextLevel);
      broadcastAdminUpdates();
      return sendJson(response, 200, publicQuestion(getParticipant.get(participant.id)));
    }

    if (method === "POST" && path === "/api/participant/answer") {
      const payload = await readJson(request);
      const participant = getParticipantSession(request);
      if (participant.status !== "active") return sendJson(response, 200, { session_ended: true });
      if (participant.awaiting_level !== null) {
        throw new HttpError(409, "Advance to the next level before submitting another answer.");
      }
      const challengeAssignments = JSON.parse(participant.challenge_assignments || "{}");
      const question = getChallenge(challengeAssignments[String(participant.current_level)]?.[participant.question_index]);
      if (!question || payload.question_id !== question.id) {
        throw new HttpError(409, "This question is no longer active.");
      }

      const now = Date.now();
      const questionDuration = question.level === 1 ? LEVEL_ONE_QUESTION_MS : LEVEL_FIVE_QUESTION_MS;
      const timedOut = [1, 5].includes(question.level) &&
        (participant.question_started_at === null || now >= participant.question_started_at + questionDuration);
      if (!timedOut && (typeof payload.answer !== "string" || !payload.answer.trim())) {
        throw new HttpError(400, "A response is required.");
      }
      if (question.level === 1 && !timedOut && !/^\d{4}$/.test(payload.answer.trim())) {
        throw new HttpError(400, "Enter a four-digit password.");
      }
      const submitted = timedOut ? null : String(payload.answer).trim().slice(0, 200);
      const correct = !timedOut && normalizeAnswer(submitted) === normalizeAnswer(question.expected_answer);
      const attemptNumber = timedOut ? participant.question_attempt_count : participant.question_attempt_count + 1;
      if (question.level === 1 && !correct && !timedOut && attemptNumber < LEVEL_ONE_ATTEMPTS) {
        const revision = nextRevision();
        db.exec("BEGIN IMMEDIATE");
        try {
          db.prepare(`
            INSERT INTO answer_attempts (participant_id, question_id, attempt_number, submitted_answer, is_correct, attempted_at)
            VALUES (?, ?, ?, ?, 0, ?)
          `).run(participant.id, question.id, attemptNumber, submitted, now);
          db.prepare(`
            UPDATE participants
            SET question_attempt_count = ?, updated_at = ?, revision = ?
            WHERE id = ?
          `).run(attemptNumber, now, revision, participant.id);
          db.exec("COMMIT");
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
        broadcastAdminUpdates();
        return sendJson(response, 200, {
          retry: true,
          attempts_remaining: LEVEL_ONE_ATTEMPTS - attemptNumber,
          hint: question.hint,
          seconds_remaining: Math.max(0, Math.ceil((participant.question_started_at + LEVEL_ONE_QUESTION_MS - now) / 1000)),
          reaction: "access_denied"
        });
      }
      const awarded = correct ? question.points : 0;
      const levelScoreKey = `level${question.level}_score`;
      const newScore = Math.min(100, participant[levelScoreKey] + awarded);
      const ordinal = participant.question_index + 1;
      const levelComplete = ordinal === LEVEL_QUESTION_COUNTS[question.level - 1];
      const qualified = question.level === 5 || (levelComplete && newScore >= QUALIFYING_SCORES[question.level - 1]);
      const eliminated = levelComplete && question.level < 5 && !qualified;
      const completed = question.level === 5 && levelComplete;
      const nextIndex = participant.question_index + 1;
      const attemptsUsed = question.level === 1 ? attemptNumber : Number(!timedOut);
      const reaction = question.level === 1
        ? correct ? "access_granted" : "access_denied"
        : correct ? "breach" : "deflect";
      const revision = nextRevision();

      db.exec("BEGIN IMMEDIATE");
      try {
        if (!timedOut) {
          db.prepare(`
            INSERT INTO answer_attempts (participant_id, question_id, attempt_number, submitted_answer, is_correct, attempted_at)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run(participant.id, question.id, attemptsUsed, submitted, Number(correct), now);
        }
        db.prepare(`
          INSERT INTO answers (participant_id, question_id, level, question_ordinal, submitted_answer, is_correct, points_awarded, attempts_used, answered_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(participant.id, question.id, question.level, ordinal, submitted, Number(correct), awarded, attemptsUsed, now);
        if (question.level < 5 && levelComplete) {
          db.prepare(`
            UPDATE participants
              SET ${levelScoreKey} = ?, level${question.level}_qualified = ?, question_index = ?,
                question_attempt_count = 0, question_started_at = NULL, awaiting_level = ?,
                status = ?, updated_at = ?, revision = ?
            WHERE id = ?
            `).run(
              newScore,
              Number(qualified),
              nextIndex,
              qualified ? question.level + 1 : null,
              eliminated ? "eliminated" : "active",
              now,
              revision,
              participant.id
            );
        } else if (question.level === 5) {
          db.prepare(`
            UPDATE participants
            SET level5_score = ?, question_index = ?, question_attempt_count = 0, question_started_at = ?,
                level5_completed_at = ?, status = ?, updated_at = ?, revision = ?
            WHERE id = ?
          `).run(
            newScore,
            nextIndex,
            null,
            completed ? now : null,
            completed ? "completed" : "active",
            now,
            revision,
            participant.id
          );
        } else {
          db.prepare(`
            UPDATE participants
            SET ${levelScoreKey} = ?, question_index = ?, question_attempt_count = 0, question_started_at = NULL,
              updated_at = ?, revision = ?
            WHERE id = ?
          `).run(newScore, nextIndex, now, revision, participant.id);
        }
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }

      broadcastAdminUpdates();
      if (levelComplete) {
        const updatedParticipant = getParticipant.get(participant.id);
        return sendJson(response, 200, {
          accepted: true,
          level_complete: true,
          session_ended: eliminated || completed,
          completion: levelCompletion(updatedParticipant, question.level, qualified),
          reaction
        });
      }
      if (question.level === 1 || question.level === 5) {
        return sendJson(response, 200, {
          accepted: true,
          next_challenge: true,
          reaction
        });
      }
      return sendJson(response, 200, {
        ...publicQuestion(getParticipant.get(participant.id)),
        reaction
      });
    }

    if (method === "POST" && path === "/api/participant/event") {
      const participant = getParticipantSession(request);
      const payload = await readJson(request);
      const eventTypes = new Set(["tab_hidden", "tab_visible", "window_blur", "window_focus", "fullscreen_enter", "fullscreen_exit", "page_hide", "session_resumed"]);
      if (!eventTypes.has(payload.event_type)) throw new HttpError(400, "Unsupported monitoring event.");
      db.prepare("INSERT INTO events (participant_id, event_type, client_time, occurred_at) VALUES (?, ?, ?, ?)")
        .run(participant.id, payload.event_type, typeof payload.client_time === "string" ? payload.client_time.slice(0, 64) : null, Date.now());
      broadcastAdminUpdates();
      return sendJson(response, 201, { recorded: true });
    }

    if (method === "POST" && path === "/api/admin/login") {
      const payload = await readJson(request);
      const ip = clientIp(request);
      const now = Date.now();
      if (!rateLimiter.allowed(ip, now)) throw new HttpError(429, "Too many login attempts. Try again in 15 minutes.");
      const loginId = typeof payload.login_id === "string" ? payload.login_id.trim().toLowerCase() : "";
      const password = payload.password;
      const valid = loginId === normalizedAdminId &&
        typeof password === "string" &&
        password.length <= 128 &&
        verifyPassword(password, adminCredentials);
      if (!valid) {
        rateLimiter.failed(ip, now);
        throw new HttpError(401, "Invalid administrator ID or password.");
      }
      rateLimiter.clear(ip);
      const token = randomBytes(32).toString("base64url");
      createSession(db, "admin_sessions", token, null, now + ADMIN_SESSION_MS);
      setCookie(response, ADMIN_COOKIE, token, { secure: secureCookies, maxAge: ADMIN_SESSION_MS });
      db.prepare("DELETE FROM admin_sessions WHERE expires_at <= ?").run(now);
      return sendJson(response, 200, { admin: { login_id: normalizedAdminId } });
    }

    if (method === "GET" && path === "/api/admin/session") {
      const token = parseCookies(request)[ADMIN_COOKIE];
      const authenticated = Boolean(token && adminByToken.get(hashToken(token), Date.now()));
      return sendJson(response, 200, { authenticated, admin: authenticated ? { login_id: normalizedAdminId } : null });
    }

    if (method === "POST" && path === "/api/admin/logout") {
      const token = parseCookies(request)[ADMIN_COOKIE];
      if (token) {
        const tokenHash = hashToken(token);
        db.prepare("DELETE FROM admin_sessions WHERE token_hash = ?").run(tokenHash);
        for (const stream of adminStreams) {
          if (stream.tokenHash === tokenHash) closeAdminStream(stream, "auth_expired", "Administrator signed out.");
        }
      }
      setCookie(response, ADMIN_COOKIE, null, { secure: secureCookies, maxAge: 0 });
      return sendJson(response, 200, { signed_out: true });
    }

    if (method === "GET" && path === "/api/admin/stream") {
      requireAdmin(request);
      startAdminStream(request, response, url);
      return;
    }

    if (method === "GET" && path === "/api/admin/updates") {
      requireAdmin(request);
      const revision = Math.max(0, Number.parseInt(url.searchParams.get("revision") || "0", 10) || 0);
      const eventId = Math.max(0, Number.parseInt(url.searchParams.get("event_id") || "0", 10) || 0);
      if (url.searchParams.get("full") === "1") {
        const maxRevision = db.prepare("SELECT value FROM app_meta WHERE key = 'revision'").get().value;
        const maxEventId = db.prepare("SELECT COALESCE(MAX(id), 0) AS id FROM events").get().id;
        return sendJson(response, 200, {
          full: true,
          participants: adminParticipants(),
          events: adminEvents(),
          revision: maxRevision,
          event_id: maxEventId
        });
      }
      return sendJson(response, 200, readAdminUpdates(revision, eventId));
    }

    const detailsMatch = method === "GET" && /^\/api\/admin\/participants\/([a-f0-9]{32})$/.exec(path);
    if (detailsMatch) {
      requireAdmin(request);
      const participantId = detailsMatch[1];
      const participant = getParticipant.get(participantId);
      if (!participant) throw new HttpError(404, "Participant was not found.");
      const assignments = JSON.parse(participant.challenge_assignments || "{}");
      const assignedChallenges = Object.fromEntries(Object.entries(assignments).map(([level, ids]) => [
        level,
        ids.map((id, index) => {
          const challenge = getChallenge(id);
          if (!challenge) return { id, ordinal: index + 1, terminal: "ARCHIVED CHALLENGE", prompt: "Challenge content is unavailable.", artifact: "" };
          return {
            id: challenge.id,
            ordinal: index + 1,
            terminal: challenge.terminal,
            prompt: challenge.prompt,
            artifact: challenge.artifact,
            context: challenge.context || null,
            clues: challenge.clues || [],
            points: challenge.points
          };
        })
      ]));
      const answers = db.prepare(`
        SELECT question_id, level, question_ordinal, submitted_answer, is_correct, points_awarded, attempts_used, answered_at
        FROM answers WHERE participant_id = ? ORDER BY answered_at
      `).all(participantId).map((answer) => ({
        ...answer,
        is_correct: Boolean(answer.is_correct),
        question: getChallenge(answer.question_id)?.prompt || "Archived challenge",
        answered_at: new Date(answer.answered_at).toISOString()
      }));
      const attempts = db.prepare(`
        SELECT question_id, attempt_number, submitted_answer, is_correct, attempted_at
        FROM answer_attempts WHERE participant_id = ? ORDER BY attempted_at, id
      `).all(participantId).map((attempt) => ({
        ...attempt,
        is_correct: Boolean(attempt.is_correct),
        attempted_at: new Date(attempt.attempted_at).toISOString()
      }));
      const events = db.prepare(`
        SELECT event_type, occurred_at FROM events
        WHERE participant_id = ? ORDER BY id DESC LIMIT 100
      `).all(participantId).map((event) => ({ ...event, occurred_at: new Date(event.occurred_at).toISOString() }));
      return sendJson(response, 200, { assigned_challenges: assignedChallenges, answers, attempts, events });
    }

    throw new HttpError(404, "API route not found.");
  }

  function serveStatic(request, response, url) {
    let requestPath;
    try {
      requestPath = decodeURIComponent(url.pathname);
    } catch {
      throw new HttpError(400, "Invalid URL path.");
    }
    const requestedFile = requestPath === "/" ? "index.html" : requestPath.replace(/^\/+/, "");
    let filePath = resolve(staticDir, requestedFile);
    if (!filePath.startsWith(`${resolve(staticDir)}${sep}`) && filePath !== resolve(staticDir, "index.html")) {
      throw new HttpError(403, "Invalid file path.");
    }
    try {
      if (!statSync(filePath).isFile()) throw new Error("not a file");
    } catch {
      filePath = resolve(staticDir, "index.html");
    }
    const contentTypes = {
      ".css": "text/css; charset=utf-8",
      ".html": "text/html; charset=utf-8",
      ".ico": "image/x-icon",
      ".js": "text/javascript; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".svg": "image/svg+xml"
    };
    const headers = {
      "Content-Type": contentTypes[extname(filePath)] || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
      "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
    };
    response.writeHead(200, headers);
    response.end(readFileSync(filePath));
  }

  const server = createServer((request, response) => {
    const url = new URL(request.url || "/", "http://localhost");
    if (url.pathname.startsWith("/api/")) {
      handleApi(request, response, url).catch((error) => {
        if (error instanceof HttpError) return sendJson(response, error.status, { error: error.message });
        if (error?.code === "SQLITE_CONSTRAINT_UNIQUE") return sendJson(response, 409, { error: "This answer has already been recorded." });
        console.error("Competition server request failed.", error);
        if (!response.headersSent) sendJson(response, 500, { error: "The competition server could not complete the request." });
        else response.destroy();
      });
      return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD" });
      response.end();
      return;
    }
    try {
      serveStatic(request, response, url);
    } catch (error) {
      console.error("Static file request failed.", error);
      if (!response.headersSent) sendJson(response, error instanceof HttpError ? error.status : 500, { error: error.message });
      else response.destroy();
    }
  });

  server.database = db;
  server.closeCompetition = () => {
    for (const stream of adminStreams) closeAdminStream(stream);
    db.close();
  };
  return server;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replaceAll("\\", "/")}`).href) {
  const server = createCompetitionServer();
  const port = Number(process.env.PORT || 3000);
  server.listen(port, "0.0.0.0", () => console.log(`Cyber Escape Room server listening on port ${port}.`));
  const shutdown = () => {
    server.closeCompetition();
    server.close(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
