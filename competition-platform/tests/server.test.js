import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes, scryptSync } from "node:crypto";
import { after, before, test } from "node:test";
import { createCompetitionServer } from "../server.js";
import { LEVEL_QUESTION_COUNTS, QUESTIONS } from "../server/questions.js";

const testDirectory = mkdtempSync(join(tmpdir(), "cyber-escape-room-"));
const databasePath = join(testDirectory, "competition.sqlite");
const adminPassword = "Temporary-Testing-Password-947!";
const adminSalt = randomBytes(16);
const adminPasswordHash = `scrypt:${adminSalt.toString("hex")}:${scryptSync(adminPassword, adminSalt, 64).toString("hex")}`;
let server;
let baseUrl;

async function startServer() {
  server = createCompetitionServer({
    databasePath,
    adminId: "testadmin",
    adminPasswordHash,
    secureCookies: false
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
}

async function stopServer() {
  if (!server) return;
  await new Promise((resolve) => server.close(resolve));
  server.closeCompetition();
  server = null;
}

function cookieFrom(response) {
  const cookie = response.headers.getSetCookie()[0];
  assert.ok(cookie, "server issues an HttpOnly session cookie");
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);
  return cookie.split(";", 1)[0];
}

async function request(path, { method = "GET", body, cookie } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (cookie) headers.Cookie = cookie;
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { response, data: await response.json() };
}

async function readStreamUntil(reader, marker, timeoutMs = 5000) {
  const decoder = new TextDecoder();
  let output = "";
  while (!output.includes(marker)) {
    let timeout;
    try {
      const result = await Promise.race([
        reader.read(),
        new Promise((_, reject) => {
          timeout = setTimeout(() => reject(new Error("Timed out waiting for admin stream update.")), timeoutMs);
        })
      ]);
      if (result.done) throw new Error("Admin stream ended before sending its update.");
      output += decoder.decode(result.value, { stream: true });
    } finally {
      clearTimeout(timeout);
    }
  }
  return output;
}

function assertNoParticipantEvaluation(value) {
  if (Array.isArray(value)) {
    value.forEach(assertNoParticipantEvaluation);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    assert.doesNotMatch(
      key,
      /expected_answer|is_correct|points_awarded|level[1-5]_score|total_score|percentage|leaderboard|participants/i,
      `participant response must not contain admin-only field "${key}"`
    );
    assertNoParticipantEvaluation(child);
  }
}

before(startServer);
after(async () => {
  await stopServer();
  rmSync(testDirectory, { recursive: true, force: true });
});

test("question bank has the exact 45-question level distribution and 100 marks per level", () => {
  assert.deepEqual(LEVEL_QUESTION_COUNTS, [10, 10, 10, 10, 5]);
  assert.equal(QUESTIONS.length, 45);
  for (let level = 1; level <= 5; level += 1) {
    const questions = QUESTIONS.filter((question) => question.level === level);
    assert.equal(questions.length, LEVEL_QUESTION_COUNTS[level - 1]);
    assert.deepEqual(questions.map((question) => question.ordinal), Array.from(
      { length: LEVEL_QUESTION_COUNTS[level - 1] },
      (_, index) => index + 1
    ));
    assert.equal(questions.reduce((sum, question) => sum + question.points, 0), 100);
  }
});

test("server stores and evaluates a complete participant session, with private admin access", async () => {
  const noParticipantSession = await request("/api/participant/current");
  assert.equal(noParticipantSession.response.status, 401);
  const noAdminSession = await request("/api/admin/updates?full=1");
  assert.equal(noAdminSession.response.status, 401);

  const profile = {
    name: "Test Participant",
    college: "Example College",
    email: "participant@example.test",
    phone: "555-0101",
    year: "2nd year",
    department: "Computer Science"
  };
  const registration = await request("/api/participant/register", { method: "POST", body: { profile } });
  assert.equal(registration.response.status, 201);
  assertNoParticipantEvaluation(registration.data);
  const participantCookie = cookieFrom(registration.response);
  const participantId = registration.data.participant_id;
  assert.equal(registration.data.level, 1);
  assert.equal(registration.data.question.id, "L1-1");
  const prematureAdvance = await request("/api/participant/advance", {
    method: "POST",
    cookie: participantCookie,
    body: {}
  });
  assert.equal(prematureAdvance.response.status, 409);
  assert.equal("expected_answer" in registration.data.question, false);
  assert.equal("is_correct" in registration.data.question, false);
  assert.equal("points_awarded" in registration.data.question, false);
  assert.equal("level1_score" in registration.data, false);

  const refreshed = await request("/api/participant/current", { cookie: participantCookie });
  assertNoParticipantEvaluation(refreshed.data);
  assert.equal(refreshed.data.participant_id, participantId);
  assert.equal(refreshed.data.question.id, "L1-1");
  const secondRegistration = await request("/api/participant/register", {
    method: "POST",
    body: {
      profile: {
        ...profile,
        name: "Second Participant",
        email: "second@example.test"
      }
    }
  });
  assert.equal(secondRegistration.response.status, 201);
  assert.notEqual(secondRegistration.data.participant_id, participantId);
  const secondParticipantCookie = cookieFrom(secondRegistration.response);

  const wrongAdminPassword = await request("/api/admin/login", {
    method: "POST",
    body: { login_id: "testadmin", password: "not-the-password" }
  });
  assert.equal(wrongAdminPassword.response.status, 401);
  const login = await request("/api/admin/login", {
    method: "POST",
    body: { login_id: "testadmin", password: adminPassword }
  });
  assert.equal(login.response.status, 200);
  const adminCookie = cookieFrom(login.response);
  assert.equal(login.data.admin.login_id, "testadmin");
  assert.equal((await request("/api/admin/session", { cookie: adminCookie })).data.authenticated, true);

  const initialAdmin = await request("/api/admin/updates?full=1", { cookie: adminCookie });
  assert.equal(initialAdmin.response.status, 200);
  assert.equal(initialAdmin.data.participants.length, 2);
  assert.ok(initialAdmin.data.participants.some((participant) => participant.email === profile.email));
  assert.ok(initialAdmin.data.participants.some((participant) => participant.email === "second@example.test"));
  assert.equal((await request(`/api/admin/participants/${participantId}`)).response.status, 401);

  const unauthorizedStream = await fetch(`${baseUrl}/api/admin/stream`);
  assert.equal(unauthorizedStream.status, 401);
  const adminStreamResponse = await fetch(
    `${baseUrl}/api/admin/stream?revision=${initialAdmin.data.revision}&event_id=${initialAdmin.data.event_id}`,
    { headers: { Cookie: adminCookie } }
  );
  assert.equal(adminStreamResponse.status, 200);
  assert.match(adminStreamResponse.headers.get("content-type"), /text\/event-stream/);
  const streamReader = adminStreamResponse.body.getReader();
  const streamRegistration = await request("/api/participant/register", {
    method: "POST",
    body: {
      profile: {
        ...profile,
        name: "Stream Participant",
        email: "streamed@example.test"
      }
    }
  });
  assert.equal(streamRegistration.response.status, 201);
  const streamedUpdate = await readStreamUntil(streamReader, "streamed@example.test");
  assert.match(streamedUpdate, /event: updates/);
  assert.match(streamedUpdate, /"full":false/);
  assert.match(streamedUpdate, /id: \d+:\d+/);
  const streamCursor = /id: (\d+:\d+)/.exec(streamedUpdate)?.[1];
  assert.ok(streamCursor);
  await streamReader.cancel();
  const offlineRegistration = await request("/api/participant/register", {
    method: "POST",
    body: {
      profile: {
        ...profile,
        name: "Reconnected Participant",
        email: "reconnected@example.test"
      }
    }
  });
  assert.equal(offlineRegistration.response.status, 201);
  const reconnectedStream = await fetch(`${baseUrl}/api/admin/stream`, {
    headers: { Cookie: adminCookie, "Last-Event-ID": streamCursor }
  });
  assert.equal(reconnectedStream.status, 200);
  const reconnectedReader = reconnectedStream.body.getReader();
  const recoveredUpdate = await readStreamUntil(reconnectedReader, "reconnected@example.test");
  assert.match(recoveredUpdate, /event: updates/);
  await reconnectedReader.cancel();

  const submit = async (questionId, answer) => {
    const result = await request("/api/participant/answer", {
      method: "POST",
      cookie: participantCookie,
      body: { question_id: questionId, answer }
    });
    assertNoParticipantEvaluation(result.data);
    return result;
  };
  let answer;
  for (const question of QUESTIONS.filter((item) => item.level === 1)) {
    answer = await submit(question.id, question.expected_answer);
    assert.equal(answer.response.status, 200, `Level 1 question ${question.ordinal} is accepted`);
  }
  assert.equal(answer.data.level_complete, true);
  assert.deepEqual(answer.data.completion, {
    level: 1,
    level_name: "ARMOR PROTOCOL",
    score: 100,
    qualified: true,
    next_level: "GAMMA BREACH",
    mission_complete: false
  });
  assert.equal("is_correct" in answer.data, false);
  assert.equal("points_awarded" in answer.data, false);
  assert.equal("total_score" in answer.data, false);
  assert.equal("level2_score" in answer.data, false);
  const staleAnswer = await submit("L1-10", QUESTIONS.find((question) => question.id === "L1-10").expected_answer);
  assert.equal(staleAnswer.response.status, 409);

  let current = await request("/api/participant/current", { cookie: participantCookie });
  assert.deepEqual(current.data.completion, answer.data.completion);
  assert.equal(current.data.question, undefined);
  current = await request("/api/participant/advance", {
    method: "POST",
    cookie: participantCookie,
    body: {}
  });
  assert.equal(current.data.level, 2);
  assert.equal(current.data.question.id, "L2-1");
  for (const question of QUESTIONS.filter((item) => item.level === 2)) {
    answer = await submit(question.id, question.expected_answer);
    assert.equal(answer.response.status, 200, `Level 2 question ${question.ordinal} is accepted`);
  }
  assert.equal(answer.data.completion.level_name, "GAMMA BREACH");
  current = await request("/api/participant/advance", { method: "POST", cookie: participantCookie, body: {} });
  assert.equal(current.data.level, 3);
  for (const question of QUESTIONS.filter((item) => item.level === 3)) {
    answer = await submit(question.id, question.expected_answer);
    assert.equal(answer.response.status, 200, `Level 3 question ${question.ordinal} is accepted`);
  }
  assert.equal(answer.data.completion.level_name, "THE INITIATIVE");
  current = await request("/api/participant/advance", { method: "POST", cookie: participantCookie, body: {} });
  assert.equal(current.data.level, 4);
  for (const question of QUESTIONS.filter((item) => item.level === 4)) {
    answer = await submit(question.id, question.expected_answer);
    assert.equal(answer.response.status, 200, `Level 4 question ${question.ordinal} is accepted`);
  }
  assert.equal(answer.data.level_complete, true);
  assert.equal(answer.data.completion.level_name, "THE FIRST CODE");

  current = await request("/api/participant/advance", { method: "POST", cookie: participantCookie, body: {} });
  assert.equal(current.data.level, 5);
  assert.equal(current.data.question.seconds_remaining, 30);
  const earlyTimeout = await submit("L5-1", "");
  assert.equal(earlyTimeout.response.status, 400);

  for (let ordinal = 1; ordinal <= 5; ordinal += 1) {
    const question = QUESTIONS.find((item) => item.id === `L5-${ordinal}`);
    if (ordinal === 1) {
      answer = await submit(question.id, question.expected_answer);
      assert.equal(answer.response.status, 200);
      assert.equal(answer.data.question.ordinal, 2);
      assert.equal(answer.data.question.seconds_remaining, 30);
      continue;
    }
    server.database.prepare("UPDATE participants SET question_started_at = ? WHERE id = ?")
      .run(Date.now() - 31_000, participantId);
    answer = await submit(question.id, question.expected_answer);
    assert.equal(answer.response.status, 200);
    if (ordinal < 5) {
      assert.equal(answer.data.question.ordinal, ordinal + 1);
      assert.equal(answer.data.question.seconds_remaining, 30);
    } else {
      assert.equal(answer.data.session_ended, true);
      assert.equal(answer.data.completion.level_name, "FINAL DIRECTIVE");
      assert.equal(answer.data.completion.score, 20);
      assert.equal(answer.data.completion.qualified, true);
      assert.equal(answer.data.completion.mission_complete, true);
      assert.equal(answer.data.completion.next_level, null);
    }
  }
  const resumedFinal = await request("/api/participant/current", { cookie: participantCookie });
  assert.deepEqual(resumedFinal.data.completion, answer.data.completion);

  const participantActivity = await request("/api/participant/event", {
    method: "POST",
    cookie: participantCookie,
    body: { event_type: "page_hide", client_time: new Date().toISOString() }
  });
  assert.equal(participantActivity.response.status, 201);

  const detail = await request(`/api/admin/participants/${participantId}`, { cookie: adminCookie });
  assert.equal(detail.response.status, 200);
  assert.equal(detail.data.answers.length, 45);
  assert.equal(detail.data.answers.at(-1).is_correct, false);
  assert.equal(detail.data.answers.at(-1).submitted_answer, null);
  assert.equal(detail.data.events[0].event_type, "page_hide");
  const finalist = (await request("/api/admin/updates?full=1", { cookie: adminCookie }))
    .data.participants.find((participant) => participant.id === participantId);
  assert.ok(finalist.level5_started_at);
  assert.ok(finalist.level5_completed_at);
  assert.ok(new Date(finalist.level5_completed_at) >= new Date(finalist.level5_started_at));

  const finalUpdates = await request(
    `/api/admin/updates?revision=${initialAdmin.data.revision}&event_id=${initialAdmin.data.event_id}`,
    { cookie: adminCookie }
  );
  const mainParticipant = finalUpdates.data.participants.find((participant) => participant.id === participantId);
  assert.equal(mainParticipant.status, "completed");
  assert.equal(mainParticipant.level1_score, 100);
  assert.equal(mainParticipant.level2_score, 100);
  assert.equal(mainParticipant.level3_score, 100);
  assert.equal(mainParticipant.level4_score, 100);
  assert.equal(mainParticipant.level5_score, 20);
  assert.equal(mainParticipant.level4_qualified, true);

  const qualificationThresholds = [50, 60, 70, 70];
  const assertLevelOutcome = async (targetLevel, requiredScore, expectedQualified) => {
    const outcomeRegistration = await request("/api/participant/register", {
      method: "POST",
      body: {
        profile: {
          ...profile,
          name: `Level ${targetLevel} score ${requiredScore}`,
          email: `level-${targetLevel}-score-${requiredScore}@example.test`
        }
      }
    });
    const outcomeCookie = cookieFrom(outcomeRegistration.response);
    const outcomeId = outcomeRegistration.data.participant_id;
    let outcome;
    for (let level = 1; level <= targetLevel; level += 1) {
      const questions = QUESTIONS.filter((question) => question.level === level);
      const successesRequired = level === targetLevel ? requiredScore / 10 : questions.length;
      for (const [index, question] of questions.entries()) {
        const submittedAnswer = index < successesRequired
          ? question.expected_answer
          : question.expected_answer === "0" ? "1" : "NOT_THE_ANSWER";
        outcome = await request("/api/participant/answer", {
          method: "POST",
          cookie: outcomeCookie,
          body: { question_id: question.id, answer: submittedAnswer }
        });
        assertNoParticipantEvaluation(outcome.data);
        assert.equal(outcome.response.status, 200);
      }
      if (level < targetLevel) {
        assert.equal(outcome.data.level_complete, true);
        assert.equal(outcome.data.completion.level, level);
        const waiting = await request("/api/participant/current", { cookie: outcomeCookie });
        assert.equal(waiting.data.completion.level, level);
        assert.equal(waiting.data.question, undefined);
        const nextQuestion = await request("/api/participant/advance", {
          method: "POST",
          cookie: outcomeCookie,
          body: {}
        });
        assert.equal(nextQuestion.data.level, level + 1);
      }
    }
    const participant = (await request("/api/admin/updates?full=1", { cookie: adminCookie }))
      .data.participants.find((row) => row.id === outcomeId);
    assert.equal(participant[`level${targetLevel}_score`], requiredScore);
    assert.equal(participant[`level${targetLevel}_qualified`], expectedQualified);
    assert.equal(participant.status, expectedQualified ? "active" : "eliminated");
    assert.equal(participant.current_level, targetLevel);
    assert.equal(outcome.data.completion.level, targetLevel);
    assert.equal(outcome.data.completion.score, requiredScore);
    assert.equal(outcome.data.completion.qualified, expectedQualified);
    if (expectedQualified) {
      const waiting = await request("/api/participant/current", { cookie: outcomeCookie });
      assert.equal(waiting.data.completion.level, targetLevel);
      assert.equal(waiting.data.question, undefined);
      const next = await request("/api/participant/advance", {
        method: "POST",
        cookie: outcomeCookie,
        body: {}
      });
      assert.equal(next.data.level, targetLevel + 1);
      const advancedParticipant = (await request("/api/admin/updates?full=1", { cookie: adminCookie }))
        .data.participants.find((row) => row.id === outcomeId);
      assert.equal(advancedParticipant.current_level, targetLevel + 1);
    } else {
      const ended = await request("/api/participant/current", { cookie: outcomeCookie });
      assert.equal(ended.data.session_ended, true);
      assert.equal(ended.data.completion.score, requiredScore);
      const locked = await request("/api/participant/advance", {
        method: "POST",
        cookie: outcomeCookie,
        body: {}
      });
      assert.equal(locked.response.status, 409);
    }
  };

  for (let level = 1; level <= 4; level += 1) {
    await assertLevelOutcome(level, qualificationThresholds[level - 1], true);
  }
  for (let failedLevel = 1; failedLevel <= 4; failedLevel += 1) {
    await assertLevelOutcome(failedLevel, qualificationThresholds[failedLevel - 1] - 10, false);
  }

  await stopServer();
  await startServer();
  const persistedAdminSession = await request("/api/admin/session", { cookie: adminCookie });
  assert.equal(persistedAdminSession.data.authenticated, true);
  const persistedParticipantSession = await request("/api/participant/current", { cookie: participantCookie });
  assert.equal(persistedParticipantSession.data.session_ended, true);
  const persistedSecondSession = await request("/api/participant/current", { cookie: secondParticipantCookie });
  assert.equal(persistedSecondSession.data.level, 1);
  const logout = await request("/api/admin/logout", { method: "POST", body: {}, cookie: adminCookie });
  assert.equal(logout.response.status, 200);
  const endedAdminSession = await request("/api/admin/session", { cookie: adminCookie });
  assert.equal(endedAdminSession.data.authenticated, false);
});
