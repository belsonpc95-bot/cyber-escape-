# Cyber Escape Room Competition Platform

This is a separate portal application. The original Cyber Escape Room at the workspace root is unchanged. The participant portal keeps the cinematic Three.js experience; `?portal=admin` opens the separate admin console.

## Architecture

The application uses one Node.js server and its built-in SQLite database. Participants, answers, scores, sessions, and monitoring events are stored in the server's SQLite file; participant and admin pages communicate with the same-origin `/api` routes. No Supabase, Firebase, browser-local game storage, or browser-to-browser sync is used.

Participant and administrator sessions use separate HttpOnly, SameSite cookies. Answer evaluation and qualification happen on the server. Public participant API responses contain only the active question and the minimum state needed to continue. At the end of each level, the server saves the score and qualification result, then holds qualified participants at a completion screen until they explicitly call the advance route. Refreshing preserves that screen; a participant cannot fetch the next level's question until the advance action succeeds. Completion responses reveal only that level's score and qualification state. Admin endpoints require the separate admin session cookie.

## Requirements and local setup

- Node.js 22.13 or later (`node:sqlite` is built into Node).
- From this directory, copy `.env.example` to `.env`.
- Create a new administrator password. Do **not** reuse the password previously shared in chat; treat it as exposed. Run `npm run hash-admin-password` in an interactive terminal, enter a new password when prompted, and copy the generated `scrypt:...` hash into `ADMIN_PASSWORD_HASH` in `.env`.
- Set `ADMIN_ID` and `DATABASE_PATH` in `.env`. Keep `.env` private; it is ignored by Git.
- Run `npm ci`, then `npm run dev`. The dev command starts the API server and Vite; open the Vite URL, and use `?portal=admin` for admin sign-in.

For a production-style local run, run `npm run build` followed by `npm start`. The server serves the built portal and API from the same origin.

## Competition flow

- Level 1, **ARMOR PROTOCOL**: exactly five beginner-friendly four-digit password investigations. Each challenge combines 2–3 fictional profile clues using simple addition, subtraction, digit-combination, or ordering; each is worth 20 marks, with two attempts and a fresh two-minute deadline. A wrong first attempt returns a contextual hint without revealing the password. Qualification is 50.
- Level 2, **GAMMA BREACH**: ten typed-response fictional URL investigations, randomly assigned from a 20-challenge pool; qualification is 60.
- Level 3, **THE INITIATIVE**: five typed cryptography challenges, randomly assigned from a 15-challenge pool; qualification is 70.
- Level 4, **THE FIRST CODE**: one difficult, multi-step Java-source investigation, randomly assigned from five variants; qualification is 70.
- Level 5, **FINAL DIRECTIVE**: five hidden-tool signal challenges randomly assigned from a 12-challenge pool. Each gets a fresh server-enforced 30-second deadline; unused time does not carry forward and a timeout is recorded as unanswered/wrong.
- The server stores each participant's challenge IDs and resumes the same active challenge set after refresh/reconnect. ARMOR PROTOCOL uses the same five puzzles in a randomized order; Levels 2–5 receive participant-specific sets whenever unused combinations remain.
- Challenges use terminal-style text entry and evidence displays, not answer-option cards. Correct answers remain server-side; participants receive only their active challenge and a brief environment reaction.
- After Levels 1–4, participants see only that level's saved score and qualification result. Qualified participants must press **NEXT LEVEL**; failed participants see **NOT QUALIFIED** and cannot advance. After Level 5, only the Level 5 score and mission-complete state are shown.
- Total challenge count: 26 (5 + 10 + 5 + 1 + 5). Each level is worth 100 marks, for 500 total. Only those who qualify through Level 4 and finish Level 5 are finalists. The admin leaderboard ranks total score, Level 5 score, Level 3 score, and then earlier Level 5 completion time.

The admin dashboard fetches one full server snapshot after sign-in, then opens an authenticated same-origin Server-Sent Events (SSE) stream. Participant registrations, score/progress changes, and monitoring events are pushed incrementally from the central Node service as database-backed revision/event deltas. The stream uses a durable database cursor for reconnect catch-up, heartbeats to survive idle proxies, automatic browser reconnect after network changes, session-expiry handling, and explicit cleanup on logout or dashboard teardown. It does not poll or contact participant devices.

## Server configuration

| Variable | Purpose |
| --- | --- |
| `PORT` | HTTP port (defaults to `3000`). |
| `NODE_ENV` | Set to `production` to enable Secure session cookies. |
| `DATABASE_PATH` | SQLite database path (defaults to `./data/competition.sqlite`). |
| `ADMIN_ID` | The one administrator username (defaults in `.env.example` to the requested ID). |
| `ADMIN_PASSWORD_HASH` | Scrypt hash emitted by `npm run hash-admin-password`; plaintext passwords are never stored. |

The database is initialized automatically, uses SQLite WAL mode and foreign keys, and should be kept on persistent server storage. Back up the SQLite file while the server is stopped or with a SQLite-aware backup method.

## Render

`render.yaml` configures one Node web service, serves both portals and the API from the same HTTPS origin, and mounts a persistent disk at `/var/data`. Participant and admin browsers must use this same deployed service URL; local development databases and any other separately deployed service are intentionally separate data stores. Configure `ADMIN_PASSWORD_HASH` in the Render service environment using a newly generated hash. The admin ID is configured as `cybersecurity2024`. A Render persistent disk may require a paid instance; confirm the plan and disk availability in Render before deployment. The blueprint alone does not deploy or verify the service.

The database is intentionally a single-server SQLite database. Run exactly one application instance with its persistent disk attached; do not scale this service to multiple instances sharing a local SQLite file. The durable database is authoritative; the in-process stream registry only fans committed database changes out to currently connected admin browsers, and reconnect cursors recover missed changes from SQLite after a process restart.

## Validation and production status

Run `npm test` for the server API tests and `npm run build` for the portal. Production hosting, multi-device testing, and data persistence across a real deployment still require deployment to a server with a persistent disk. No production deployment is claimed from this workspace.
