import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes, scryptSync } from "node:crypto";
import { after, before, test } from "node:test";
import { createCompetitionServer } from "../server.js";
import { assignChallenges, CHALLENGE_POOLS, getChallenge, LEVEL_ATTEMPT_LIMITS, LEVEL_QUESTION_COUNTS, LEVEL_NAMES, QUALIFYING_SCORES } from "../server/questions.js";

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

function assignedChallengeIds(participantId, level) {
  const row = server.database.prepare("SELECT challenge_assignments FROM participants WHERE id = ?").get(participantId);
  return JSON.parse(row.challenge_assignments)[String(level)];
}

function assertNoParticipantEvaluation(value) {
  if (Array.isArray(value)) {
    value.forEach(assertNoParticipantEvaluation);
    return;
  }

  if (!value || typeof value !== "object") return;
  const completion = Array.isArray(value.answer_review);
  for (const [key, child] of Object.entries(value)) {
    if (completion && ["answer_review", "scores", "total_score", "overall_percentage", "final_qualified"].includes(key)) {
      if (key === "answer_review") {
        for (const review of child) {
          assert.deepEqual(Object.keys(review).sort(), ["challenge_id", "correct_answer", "ordinal", "participant_answer", "terminal"].sort());
        }
      }
      continue;
    }
    if (completion && key === "correct_answer") continue;
    assert.doesNotMatch(
      key,
      /expected_answer|correct_answer|answer_review|is_correct|points_awarded|level[1-5]_score|total_score|percentage|leaderboard|participants/i,
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

test("server challenge pools cover the requested mission distribution and unique participant sets", () => {
  assert.deepEqual(LEVEL_NAMES, ["ARMOR PROTOCOL", "GAMMA BREACH", "THE INITIATIVE", "THE FIRST CODE", "FINAL DIRECTIVE"]);
  assert.deepEqual(QUALIFYING_SCORES, [50, 60, 70, 70]);
  assert.deepEqual(LEVEL_QUESTION_COUNTS, [5, 10, 5, 1, 5]);
  assert.deepEqual(CHALLENGE_POOLS.map((pool) => pool.length), [5, 20, 15, 5, 12]);
  for (let level = 1; level <= 5; level += 1) {
    const selected = assignChallenges(level);
    assert.equal(selected.length, LEVEL_QUESTION_COUNTS[level - 1]);
    assert.equal(new Set(selected).size, selected.length);
    assert.equal(selected.reduce((sum, id) => sum + getChallenge(id).points, 0), 100);
    assert.ok(CHALLENGE_POOLS[level - 1].every((challenge) => challenge.options === undefined));
  }
  assert.equal(CHALLENGE_POOLS[0].length, 5);
  assert.deepEqual(CHALLENGE_POOLS[0].map((challenge) => challenge.expected_answer), ["2015", "4802", "4244", "1307", "2408"]);
  assert.ok(CHALLENGE_POOLS[0].every((challenge) => /^\d{4}$/.test(challenge.expected_answer)));
  assert.ok(CHALLENGE_POOLS[0].every((challenge) => challenge.clues.length >= 3 && challenge.clues.length <= 5));
  assert.ok(CHALLENGE_POOLS[0].every((challenge) =>
    challenge.context && challenge.hint && challenge.clues.every((clue) => !clue.includes(challenge.expected_answer))
  ));
  assert.ok(CHALLENGE_POOLS[0].every((challenge) => challenge.points === 20));
  assert.deepEqual(Object.values(LEVEL_ATTEMPT_LIMITS), [2, 2, 3]);
  const levelTwoAssignment = assignChallenges(2);
  const levelTwoChallenges = levelTwoAssignment.map(getChallenge);
  assert.equal(new Set(levelTwoChallenges.map((challenge) => challenge.assignment_group)).size, 10);
  assert.ok(levelTwoChallenges.every((challenge) => challenge.assignment_group));
  assert.equal(new Set(CHALLENGE_POOLS[1].map((challenge) => challenge.assignment_group)).size, 10);
  assert.ok(Object.values(Object.groupBy(CHALLENGE_POOLS[1], (challenge) => challenge.assignment_group)).every((group) => group.length === 2));
  assert.ok(CHALLENGE_POOLS[1].every((challenge) => challenge.expected_answer && challenge.prompt && challenge.artifact));
  const levelThreeAssignment = assignChallenges(3);
  const levelThreeTypes = levelThreeAssignment.map((id) => getChallenge(id).logic_type);
  assert.deepEqual(
    Object.fromEntries(["forward", "reverse", "a1z26"].map((type) => [type, levelThreeTypes.filter((value) => value === type).length])),
    { forward: 2, reverse: 2, a1z26: 1 }
  );
  const forwardChallenges = levelThreeAssignment.map(getChallenge).filter((challenge) => challenge.logic_type === "forward");
  assert.ok(forwardChallenges.every((challenge) => challenge.artifact.includes("DIRECTION: FORWARD") && !challenge.artifact.includes(`CAPTURED PAYLOAD: ${challenge.expected_answer}`)));
  assert.ok(levelThreeAssignment.map(getChallenge).filter((challenge) => challenge.logic_type === "reverse")
    .every((challenge) => challenge.artifact.includes("DIRECTION: REVERSE") && challenge.expected_answer));
  const usedInvestigation = assignChallenges(4);
  assert.notDeepEqual(assignChallenges(4, [usedInvestigation]), usedInvestigation);
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
  const initialChallengeIds = assignedChallengeIds(participantId, 1);
  assert.equal(registration.data.level, 1);
  assert.ok(initialChallengeIds.includes(registration.data.question.id));
  assert.equal(initialChallengeIds.length, 5);
  assert.equal(registration.data.question.seconds_remaining, 120);
  assert.equal(registration.data.question.attempts_remaining, 2);
  assert.equal(registration.data.question.attempt_limit, 2);
  assert.equal(registration.data.question.clues.length >= 3, true);
  assert.equal(registration.data.question.options, undefined);
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

  const malformedPassword = await request("/api/participant/answer", {
    method: "POST",
    cookie: participantCookie,
    body: { question_id: registration.data.question.id, answer: "12AB" }
  });
  assert.equal(malformedPassword.response.status, 400);
  assert.equal((await request("/api/participant/current", { cookie: participantCookie })).data.question.attempts_remaining, 2);

  const refreshed = await request("/api/participant/current", { cookie: participantCookie });
  assertNoParticipantEvaluation(refreshed.data);
  assert.equal(refreshed.data.participant_id, participantId);
  assert.equal(refreshed.data.question.id, registration.data.question.id);
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
  assert.deepEqual(
    new Set(assignedChallengeIds(secondRegistration.data.participant_id, 1)),
    new Set(initialChallengeIds)
  );

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
  assert.equal((await fetch(`${baseUrl}/api/admin/export?type=results`)).status, 401);
  const filteredResultsExport = await fetch(
    `${baseUrl}/api/admin/export?type=results&search=${encodeURIComponent(profile.name)}`,
    { headers: { Cookie: adminCookie } }
  );
  assert.equal(filteredResultsExport.status, 200);
  assert.match(filteredResultsExport.headers.get("content-type"), /text\/csv/);
  const filteredResultsCsv = await filteredResultsExport.text();
  assert.match(filteredResultsCsv, /Test Participant/);
  assert.doesNotMatch(filteredResultsCsv, /Second Participant/);
  const emptyAnswersExport = await fetch(`${baseUrl}/api/admin/export?type=answers`, {
    headers: { Cookie: adminCookie }
  });
  assert.equal(emptyAnswersExport.status, 200);
  assert.match(await emptyAnswersExport.text(), /Attempt Number/);

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
  const submitAssignedLevel = async (participantCookieValue, id, level, successCount, startIndex = 0) => {
    const assigned = assignedChallengeIds(id, level);
    let result;
    for (const [index, challengeId] of assigned.slice(startIndex).entries()) {
      const challenge = getChallenge(challengeId);
      const shouldBeCorrect = index + startIndex < successCount;
      const preliminaryWrongAttempts = level === 4 ? 2 : [1, 2].includes(level) ? 1 : 0;
      for (let attempt = 0; attempt < preliminaryWrongAttempts; attempt += 1) {
        const wrong = await request("/api/participant/answer", {
          method: "POST",
          cookie: participantCookieValue,
          body: { question_id: challengeId, answer: level === 1 ? "0000" : "INVALID-RESPONSE" }
        });
        assertNoParticipantEvaluation(wrong.data);
        assert.equal(wrong.response.status, 200);
        assert.equal(wrong.data.retry, true);
        assert.equal(wrong.data.attempts_remaining, preliminaryWrongAttempts - attempt);
        assert.equal("correct_answer" in wrong.data, false);
      }
      const submitted = shouldBeCorrect
        ? challenge.expected_answer
        : level === 1 ? "0000" : "INVALID-RESPONSE";
      result = await request("/api/participant/answer", {
        method: "POST",
        cookie: participantCookieValue,
        body: { question_id: challengeId, answer: submitted }
      });
      assertNoParticipantEvaluation(result.data);
      assert.equal(result.response.status, 200, `Level ${level} challenge ${index + 1} is accepted`);
      if (level === 1 && result.data.next_challenge) {
        const next = await request("/api/participant/current", { cookie: participantCookieValue });
        assert.equal(next.data.question.id, assigned[index + startIndex + 1]);
        assert.equal(next.data.question.seconds_remaining, 120);
      }
    }
    return result;
  };
  let answer;
  const firstPasswordId = initialChallengeIds[0];
  const firstPasswordWrong = await submit(firstPasswordId, "0000");
  assert.equal(firstPasswordWrong.data.retry, true);
  assert.equal(firstPasswordWrong.data.attempts_remaining, 1);
  assert.ok(firstPasswordWrong.data.hint);
  assert.equal(firstPasswordWrong.data.seconds_remaining > 0, true);
  const afterFirstAttempt = await request("/api/participant/current", { cookie: participantCookie });
  assert.equal(afterFirstAttempt.data.question.id, firstPasswordId);
  assert.equal(afterFirstAttempt.data.question.attempts_remaining, 1);
  const firstPasswordCorrect = await submit(firstPasswordId, getChallenge(firstPasswordId).expected_answer);
  assert.equal(firstPasswordCorrect.data.next_challenge, true);
  assert.equal((await request("/api/participant/current", { cookie: participantCookie })).data.question.id, initialChallengeIds[1]);
  answer = await submitAssignedLevel(participantCookie, participantId, 1, 5, 1);
  assert.equal(answer.data.level_complete, true);
  const detailedAnswersExport = await fetch(
    `${baseUrl}/api/admin/export?type=answers&search=${encodeURIComponent(profile.name)}`,
    { headers: { Cookie: adminCookie } }
  );
  assert.equal(detailedAnswersExport.status, 200);
  const detailedAnswersCsv = await detailedAnswersExport.text();
  assert.match(detailedAnswersCsv, /Test Participant/);
  assert.match(detailedAnswersCsv, /2015|4802|4244|1307|2408/);
  assert.doesNotMatch(detailedAnswersCsv, /Second Participant/);
  assert.deepEqual(answer.data.completion, {
    level: 1,
    level_name: "ARMOR PROTOCOL",
    score: 100,
    qualified: true,
    next_level: "GAMMA BREACH",
    mission_complete: false,
    answer_review: []
  });
  assert.equal("is_correct" in answer.data, false);
  assert.equal("points_awarded" in answer.data, false);
  assert.equal("total_score" in answer.data, false);
  assert.equal("level2_score" in answer.data, false);
  const staleAnswer = await submit(initialChallengeIds.at(-1), getChallenge(initialChallengeIds.at(-1)).expected_answer);
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
  assert.equal(current.data.question.id, assignedChallengeIds(participantId, 2)[0]);
  assert.equal(current.data.question.attempt_limit, 2);
  assert.equal(new Set(assignedChallengeIds(participantId, 2).map((id) => getChallenge(id).assignment_group)).size, 10);
  answer = await submitAssignedLevel(participantCookie, participantId, 2, 10);
  assert.equal(answer.data.completion.level_name, "GAMMA BREACH");
  assert.deepEqual(answer.data.completion.answer_review, []);
  current = await request("/api/participant/advance", { method: "POST", cookie: participantCookie, body: {} });
  assert.equal(current.data.level, 3);
  const initiativeTypes = assignedChallengeIds(participantId, 3).map((id) => getChallenge(id).logic_type);
  assert.equal(initiativeTypes.filter((type) => type === "forward").length, 2);
  assert.equal(initiativeTypes.filter((type) => type === "reverse").length, 2);
  assert.equal(initiativeTypes.filter((type) => type === "a1z26").length, 1);
  answer = await submitAssignedLevel(participantCookie, participantId, 3, 5);
  assert.equal(answer.data.completion.level_name, "THE INITIATIVE");
  current = await request("/api/participant/advance", { method: "POST", cookie: participantCookie, body: {} });
  assert.equal(current.data.level, 4);
  assert.equal(assignedChallengeIds(participantId, 4).length, 1);
  assert.equal(current.data.question.attempt_limit, 3);
  answer = await submitAssignedLevel(participantCookie, participantId, 4, 1);
  assert.equal(answer.data.level_complete, true);
  assert.equal(answer.data.completion.level_name, "THE FIRST CODE");
  assert.deepEqual(answer.data.completion.answer_review, []);
  assert.equal((await submit(assignedChallengeIds(participantId, 4)[0], "AFTER-LOCK")).response.status, 409);

  current = await request("/api/participant/advance", { method: "POST", cookie: participantCookie, body: {} });
  assert.equal(current.data.level, 5);
  assert.equal(assignedChallengeIds(participantId, 5).length, 5);
  assert.equal(current.data.question.seconds_remaining, 30);
  const finalChallengeIds = assignedChallengeIds(participantId, 5);
  const earlyTimeout = await submit(finalChallengeIds[0], "");
  assert.equal(earlyTimeout.response.status, 400);

  for (let ordinal = 1; ordinal <= 5; ordinal += 1) {
    const question = getChallenge(finalChallengeIds[ordinal - 1]);
    if (ordinal === 1) {
      answer = await submit(question.id, "NOT-THE-TOOL");
      assert.equal(answer.response.status, 200);
      assert.equal(answer.data.next_challenge, true);
      assert.equal("correct_answer" in answer.data, false);
      current = await request("/api/participant/current", { cookie: participantCookie });
      assert.equal(current.data.question.ordinal, 2);
      assert.equal(current.data.question.seconds_remaining, 30);
      continue;
    }
    server.database.prepare("UPDATE participants SET question_started_at = ? WHERE id = ?")
      .run(Date.now() - 31_000, participantId);
    answer = await submit(question.id, question.expected_answer);
    assert.equal(answer.response.status, 200);
    if (ordinal < 5) {
      assert.equal(answer.data.next_challenge, true);
      current = await request("/api/participant/current", { cookie: participantCookie });
      assert.equal(current.data.question.ordinal, ordinal + 1);
      assert.equal(current.data.question.seconds_remaining, 30);
    } else {
      assert.equal(answer.data.session_ended, true);
      assert.equal(answer.data.completion.level_name, "FINAL DIRECTIVE");
      assert.equal(answer.data.completion.score, 0);
      assert.equal(answer.data.completion.qualified, true);
      assert.equal(answer.data.completion.mission_complete, true);
      assert.equal(answer.data.completion.next_level, null);
      assert.deepEqual(answer.data.completion.scores.map((score) => score.score), [100, 100, 100, 100, 0]);
      assert.equal(answer.data.completion.total_score, 400);
      assert.equal(answer.data.completion.overall_percentage, 80);
      assert.equal(answer.data.completion.final_qualified, true);
      assert.equal(answer.data.completion.answer_review.length, 5);
      assert.equal(answer.data.completion.answer_review[0].participant_answer, "NOT-THE-TOOL");
      assert.equal(answer.data.completion.answer_review[0].correct_answer, getChallenge(finalChallengeIds[0]).expected_answer);
      assert.ok(answer.data.completion.answer_review.slice(1).every((review) => review.participant_answer === null));
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
  assert.equal(detail.data.answers.length, 26);
  assert.equal(detail.data.assigned_challenges["1"].length, 5);
  assert.equal(detail.data.assigned_challenges["2"].length, 10);
  assert.equal(detail.data.assigned_challenges["3"].length, 5);
  assert.equal(detail.data.assigned_challenges["4"].length, 1);
  assert.equal(detail.data.assigned_challenges["5"].length, 5);
  assert.deepEqual(detail.data.assigned_challenges["1"].map((challenge) => challenge.id), initialChallengeIds);
  assert.equal(detail.data.answers.find((record) => record.question_id === firstPasswordId).attempts_used, 2);
  assert.equal(detail.data.attempts.filter((attempt) => attempt.question_id === firstPasswordId).length, 2);
  assert.equal(detail.data.answers.at(-1).is_correct, false);
  assert.equal(detail.data.answers.at(-1).submitted_answer, null);
  assert.equal(detail.data.answers.at(-1).correct_answer, getChallenge(detail.data.answers.at(-1).question_id).expected_answer);
  assert.equal(detail.data.assigned_challenges["4"][0].expected_answer, getChallenge(detail.data.assigned_challenges["4"][0].id).expected_answer);
  assert.equal(detail.data.answers.find((record) => record.level === 4).attempts_used, 3);
  assert.equal(detail.data.attempts.filter((attempt) => attempt.question_id === detail.data.assigned_challenges["4"][0].id).length, 3);
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
  assert.equal(mainParticipant.level5_score, 0);
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
    const successfulAnswersTarget = requiredScore / CHALLENGE_POOLS[targetLevel - 1][0].points;
    let outcome;
    for (let level = 1; level <= targetLevel; level += 1) {
      const ids = assignedChallengeIds(outcomeId, level);
      const pointsPerChallenge = getChallenge(ids[0]).points;
      const successfulAnswers = level === targetLevel ? requiredScore / pointsPerChallenge : ids.length;
      assert.equal(Number.isInteger(successfulAnswers), true);
      outcome = await submitAssignedLevel(outcomeCookie, outcomeId, level, successfulAnswers);
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
    const targetIds = assignedChallengeIds(outcomeId, targetLevel);
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
      assert.equal(outcome.data.completion.answer_review.length, targetIds.length - successfulAnswersTarget);
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

  const passingScores = [60, 60, 80, 100];
  const failingScores = [40, 50, 60, 0];
  for (let level = 1; level <= 4; level += 1) {
    await assertLevelOutcome(level, passingScores[level - 1], true);
    await assertLevelOutcome(level, failingScores[level - 1], false);
  }

  const limitedRegistration = await request("/api/participant/register", {
    method: "POST",
    body: {
      profile: {
        ...profile,
        name: "Password Limits Participant",
        email: "password-limits@example.test"
      }
    }
  });
  const limitedCookie = cookieFrom(limitedRegistration.response);
  const limitedId = limitedRegistration.data.participant_id;
  const limitedIds = assignedChallengeIds(limitedId, 1);
  const lockedChallenge = getChallenge(limitedIds[0]);
  const firstDenied = await request("/api/participant/answer", {
    method: "POST",
    cookie: limitedCookie,
    body: { question_id: lockedChallenge.id, answer: "0000" }
  });
  assert.equal(firstDenied.data.retry, true);
  assert.equal(firstDenied.data.attempts_remaining, 1);
  const secondDenied = await request("/api/participant/answer", {
    method: "POST",
    cookie: limitedCookie,
    body: { question_id: lockedChallenge.id, answer: "0000" }
  });
  assert.equal(secondDenied.data.reaction, "access_denied");
  assert.equal(secondDenied.data.next_challenge, true);
  const secondQuestion = (await request("/api/participant/current", { cookie: limitedCookie })).data.question;
  assert.equal(secondQuestion.ordinal, 2);
  assert.equal(secondQuestion.attempts_remaining, 2);
  const deniedSummary = server.database.prepare("SELECT attempts_used, points_awarded FROM answers WHERE participant_id = ? AND question_id = ?")
    .get(limitedId, lockedChallenge.id);
  assert.equal(deniedSummary.attempts_used, 2);
  assert.equal(deniedSummary.points_awarded, 0);
  assert.equal(server.database.prepare("SELECT COUNT(*) AS count FROM answer_attempts WHERE participant_id = ? AND question_id = ?")
    .get(limitedId, lockedChallenge.id).count, 2);
  const timedPassword = getChallenge(limitedIds[1]);
  server.database.prepare("UPDATE participants SET question_started_at = ? WHERE id = ?")
    .run(Date.now() - 121_000, limitedId);
  const timedOut = await request("/api/participant/answer", {
    method: "POST",
    cookie: limitedCookie,
    body: { question_id: timedPassword.id, answer: timedPassword.expected_answer }
  });
  assert.equal(timedOut.data.next_challenge, true);
  const thirdQuestion = (await request("/api/participant/current", { cookie: limitedCookie })).data.question;
  assert.equal(thirdQuestion.ordinal, 3);
  assert.equal(thirdQuestion.seconds_remaining, 120);
  const timeoutRecord = server.database.prepare("SELECT submitted_answer, points_awarded FROM answers WHERE participant_id = ? AND question_id = ?")
    .get(limitedId, timedPassword.id);
  assert.equal(timeoutRecord.submitted_answer, null);
  assert.equal(timeoutRecord.points_awarded, 0);

  const legacyTimestamp = Date.now() - 1000;
  server.database.prepare(`
    UPDATE participants
    SET challenge_assignments = '{}', question_index = 0, current_level = 1, awaiting_level = NULL
    WHERE id = ?
  `).run(secondRegistration.data.participant_id);
  for (const [index, legacyId] of ["LEGACY-L1-01", "LEGACY-L1-02"].entries()) {
    server.database.prepare(`
      INSERT INTO answers (participant_id, question_id, level, question_ordinal, submitted_answer, is_correct, points_awarded, answered_at)
      VALUES (?, ?, 1, ?, 'old response', 0, 0, ?)
    `).run(secondRegistration.data.participant_id, legacyId, index + 1, legacyTimestamp + index);
  }
  server.database.prepare(`
    INSERT INTO answers (participant_id, question_id, level, question_ordinal, submitted_answer, correct_answer, is_correct, points_awarded, answered_at)
    VALUES (?, 'GAM-01', 2, 1, 'old response', NULL, 0, 0, ?)
  `).run(secondRegistration.data.participant_id, legacyTimestamp + 2);
  server.database.prepare("UPDATE participants SET question_index = 2 WHERE id = ?")
    .run(secondRegistration.data.participant_id);

  await stopServer();
  await startServer();
  const persistedAdminSession = await request("/api/admin/session", { cookie: adminCookie });
  assert.equal(persistedAdminSession.data.authenticated, true);
  const persistedParticipantSession = await request("/api/participant/current", { cookie: participantCookie });
  assert.equal(persistedParticipantSession.data.session_ended, true);
  const persistedSecondSession = await request("/api/participant/current", { cookie: secondParticipantCookie });
  assert.equal(persistedSecondSession.data.level, 1);
  assert.equal(persistedSecondSession.data.question_index, 0);
  assert.equal(persistedSecondSession.data.question.id, assignedChallengeIds(secondRegistration.data.participant_id, 1)[0]);
  assert.equal(
    server.database.prepare("SELECT correct_answer FROM answers WHERE participant_id = ? AND question_id = 'GAM-01'")
      .get(secondRegistration.data.participant_id).correct_answer,
    getChallenge("GAM-01").expected_answer
  );
  for (let level = 1; level <= 5; level += 1) {
    assert.equal(assignedChallengeIds(secondRegistration.data.participant_id, level).length, LEVEL_QUESTION_COUNTS[level - 1]);
  }
  const logout = await request("/api/admin/logout", { method: "POST", body: {}, cookie: adminCookie });
  assert.equal(logout.response.status, 200);
  const endedAdminSession = await request("/api/admin/session", { cookie: adminCookie });
  assert.equal(endedAdminSession.data.authenticated, false);
});

test("incorrect answers stay private until each level is complete and limited attempts advance correctly", async () => {
  const profile = {
    name: "Review Flow Participant",
    college: "Example College",
    email: "review-flow@example.test",
    phone: "555-0102",
    year: "1st year",
    department: "Cybersecurity"
  };
  const registration = await request("/api/participant/register", { method: "POST", body: { profile } });
  const cookie = cookieFrom(registration.response);
  const participantId = registration.data.participant_id;
  const levelOne = assignedChallengeIds(participantId, 1);
  const first = getChallenge(levelOne[0]);

  let result = await request("/api/participant/answer", {
    method: "POST",
    cookie,
    body: { question_id: first.id, answer: "0000" }
  });
  assert.equal(result.data.retry, true);
  assert.equal(result.data.attempts_remaining, 1);
  assert.equal("answer_review" in result.data, false);
  assert.equal("correct_answer" in result.data, false);
  result = await request("/api/participant/answer", {
    method: "POST",
    cookie,
    body: { question_id: first.id, answer: "0000" }
  });
  assert.equal(result.data.next_challenge, true);
  assert.equal("answer_review" in result.data, false);
  for (const challengeId of levelOne.slice(1)) {
    const challenge = getChallenge(challengeId);
    const active = await request("/api/participant/current", { cookie });
    assert.equal(active.data.question.id, challengeId);
    result = await request("/api/participant/answer", {
      method: "POST",
      cookie,
      body: { question_id: challengeId, answer: challenge.expected_answer }
    });
  }
  assert.equal(result.data.completion.score, 80);
  assert.equal(result.data.completion.answer_review.length, 1);
  assert.equal(result.data.completion.answer_review[0].participant_answer, "0000");
  assert.equal(result.data.completion.answer_review[0].correct_answer, first.expected_answer);
  const savedLevelOneAnswer = server.database.prepare(
    "SELECT submitted_answer, correct_answer, attempts_used, is_correct FROM answers WHERE participant_id = ? AND question_id = ?"
  ).get(participantId, first.id);
  assert.deepEqual({ ...savedLevelOneAnswer }, {
    submitted_answer: "0000",
    correct_answer: first.expected_answer,
    attempts_used: 2,
    is_correct: 0
  });

  let current = await request("/api/participant/advance", { method: "POST", cookie, body: {} });
  const levelTwo = assignedChallengeIds(participantId, 2);
  const failedInvestigation = getChallenge(levelTwo[0]);
  assert.equal(current.data.question.id, failedInvestigation.id);
  assert.equal(current.data.question.attempt_limit, 2);
  for (const answer of ["wrong-one", "wrong-two"]) {
    result = await request("/api/participant/answer", {
      method: "POST",
      cookie,
      body: { question_id: failedInvestigation.id, answer }
    });
    assert.equal(result.response.status, 200);
    assert.equal("correct_answer" in result.data, false);
    assert.equal("answer_review" in result.data, false);
    if (answer === "wrong-one") {
      assert.equal(result.data.retry, true);
      assert.equal(result.data.attempts_remaining, 1);
      current = await request("/api/participant/current", { cookie });
      assert.equal(current.data.question.id, failedInvestigation.id);
      assert.equal(current.data.question.attempts_remaining, 1);
    } else {
      assert.equal(result.data.question.ordinal, 2);
      assert.equal(result.data.question.attempts_remaining, 2);
    }
  }
  for (const challengeId of levelTwo.slice(1)) {
    const challenge = getChallenge(challengeId);
    result = await request("/api/participant/answer", {
      method: "POST",
      cookie,
      body: { question_id: challengeId, answer: challenge.expected_answer }
    });
  }
  assert.equal(result.data.completion.score, 90);
  assert.equal(result.data.completion.answer_review.length, 1);
  assert.equal(result.data.completion.answer_review[0].participant_answer, "wrong-two");
  assert.equal(result.data.completion.answer_review[0].correct_answer, failedInvestigation.expected_answer);
  const savedLevelTwoAttempts = server.database.prepare(
    "SELECT attempt_number, submitted_answer, is_correct FROM answer_attempts WHERE participant_id = ? AND question_id = ? ORDER BY attempt_number"
  ).all(participantId, failedInvestigation.id);
  assert.deepEqual(savedLevelTwoAttempts.map((attempt) => ({ ...attempt })), [
    { attempt_number: 1, submitted_answer: "wrong-one", is_correct: 0 },
    { attempt_number: 2, submitted_answer: "wrong-two", is_correct: 0 }
  ]);
  const completedSession = await request("/api/participant/current", { cookie });
  assert.deepEqual(completedSession.data.completion.answer_review, result.data.completion.answer_review);
});
