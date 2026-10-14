import { randomInt } from "node:crypto";

const levelOneScenarios = [
  {
    id: "ARM-PW-01",
    terminal: "LUNA'S ACCESS TERMINAL",
    prompt: "LUNA is locked out of the astronomy lab. Cross-check the profile notes and enter the four-digit access code.",
    context: "The lab technician recovered two details from the visitor ledger and one note from the security desk.",
    clues: [
      "Username: LUNA14",
      "Fictional birth year: 2011",
      "Security note: \"Start with the birth year. Add the final digit in the username.\""
    ],
    hint: "The note asks for the last username digit, not the whole number in the username.",
    expected_answer: "2015"
  },
  {
    id: "ARM-PW-02",
    terminal: "ARCHIVE ROOM LOCK",
    prompt: "A cabinet's access code was updated after a room move. Use the change log to recover the new four-digit code.",
    context: "The facilities team moved the cabinet during a routine lab reorganization.",
    clues: [
      "Old cabinet code: 4826",
      "New room number: 24",
      "Move log: \"Subtract the new room number from the old cabinet code.\""
    ],
    hint: "Use the room number as a small subtraction from the old code.",
    expected_answer: "4802"
  },
  {
    id: "ARM-PW-03",
    terminal: "MIKA'S BADGE READER",
    prompt: "MIKA's badge reader needs a four-digit recovery code. Combine the badge fragment with one detail from the profile.",
    context: "The recovery code uses a badge fragment and the length of a pet's name.",
    clues: [
      "Username: MIKA-42",
      "Pet name: LUNA",
      "Security note: \"Keep the badge digits first, then write the pet-name letter count twice.\""
    ],
    hint: "Count the letters in the pet's name and use that one-digit count for each of the last two places.",
    expected_answer: "4244"
  },
  {
    id: "ARM-PW-04",
    terminal: "ORBITAL CONTROL CONSOLE",
    prompt: "Two short records hold the console code. Join the requested date part and room number in the order shown.",
    context: "A maintenance reset left a birthday and room assignment in the operator log.",
    clues: [
      "Fictional birthday: 2008-04-13",
      "Room number: 07",
      "Security note: \"Use the day of the birthday first, followed by the room number.\""
    ],
    hint: "Ignore the year and month; keep the two-digit day, then attach the two-digit room number.",
    expected_answer: "1307"
  },
  {
    id: "ARM-PW-05",
    terminal: "FOUR-POD ACCESS GATE",
    prompt: "The four-pod gate code is mixed into the technician roster. Sort the entries, then enter the recovered digits.",
    context: "An overnight audit recovered four badge digits and their room assignments.",
    clues: [
      "MIRA-2 is assigned to Room 04.",
      "KAI-7 is assigned to Room 01.",
      "ZED-4 is assigned to Room 03.",
      "NOA-9 is assigned to Room 02.",
      "Security note: \"Read badge digits from the lowest room number to the highest.\""
    ],
    hint: "Put the four room numbers in ascending order and take the digit beside each room.",
    expected_answer: "9742"
  }
];

const levelTwoScenarios = [
  {
    prompt: "A classmate sends this short message. What should you do with its link? Type a short action.",
    artifact: `TEXT MESSAGE
"Your campus mailbox is full. Sign in here now: campus-mail-fix.test"

KNOWN FACT
The campus sign-in page is campus.example.edu.`,
    hint: "The link does not match the known campus sign-in. Do not trust a link just because a message sounds familiar.",
    expected_answer: "do not click the link",
    accepted_answers: ["ignore the link", "do not open the link", "avoid the link", "don't click", "don't click the link"]
  },
  {
    prompt: "Read the email greeting. What is one clear warning sign? Type the clue.",
    artifact: `EMAIL
From: Campus IT
To: All students
Subject: Your mailbox is almost full
Message: "Dear user, open the attached guide to keep your account."`,
    hint: "Look at how the message addresses the reader. A message sent to many people may use a vague greeting.",
    expected_answer: "generic greeting",
    accepted_answers: ["dear user", "impersonal greeting", "vague greeting"]
  },
  {
    prompt: "A page claims to be the campus sign-in, but the logo is blurry, the text has spelling mistakes, and it asks for your date of birth for a raffle. What kind of page is this?",
    artifact: `LOGIN PAGE CLUES
Page title: Campus Portal
Logo: blurry and stretched
Text: several spelling mistakes
Extra request: password and date of birth to enter a raffle`,
    hint: "A familiar name or logo does not prove a page is genuine. Check whether the page and its requests make sense.",
    expected_answer: "fake login page",
    accepted_answers: ["fake sign-in page", "phishing page", "fake page"]
  },
  {
    prompt: "You were not expecting a file with this email. Type the attachment name you should treat with caution.",
    artifact: `EMAIL SUBJECT: Exam timetable
ATTACHMENT: FINAL_TIMETABLE.xlsm
NOTE: You did not ask anyone to send you a file.`,
    hint: "Pause before opening files you were not expecting. Confirm with the sender using a contact method you already trust.",
    expected_answer: "final_timetable.xlsm"
  },
  {
    prompt: "The college help desk says its address is helpdesk@campus.edu. Type the sender address that does not match.",
    artifact: `EMAIL
From: helpdesk@campus-support.example
Subject: Verify your campus account`,
    hint: "Compare the sender's full address with the known college address, not just the display name.",
    expected_answer: "helpdesk@campus-support.example"
  },
  {
    prompt: "This message says your account will be deleted in five minutes. Type the pressure tactic it is using.",
    artifact: `TEXT MESSAGE
"FINAL WARNING: Your account will be deleted in 5 minutes.
Act now or lose access!"`,
    hint: "Notice how the message tries to rush you into acting without time to check it.",
    expected_answer: "false urgency",
    accepted_answers: ["urgency", "time pressure", "pressure"]
  },
  {
    prompt: "A message asks you to reply with your password or six-digit sign-in code. Type one thing you must never share.",
    artifact: `CHAT MESSAGE
"I am from IT support. Send me your password or the six-digit code we just texted you."`,
    hint: "Support staff should not ask you to send secret sign-in details in a message.",
    expected_answer: "otp",
    accepted_answers: ["password", "one-time code", "one-time password", "sign-in code"]
  },
  {
    prompt: "The official college website is campus.edu. Type the domain in this message that does not match it.",
    artifact: `MESSAGE LINK
campus-login-help.test

OFFICIAL COLLEGE WEBSITE
campus.edu`,
    hint: "Compare the two website names. The official college name should be the ending domain, not just a similar word.",
    expected_answer: "campus-login-help.test"
  },
  {
    prompt: "You receive an account alert about a login from a device you do not recognize. What account activity should you check? Type your answer.",
    artifact: `ACCOUNT ALERT
New sign-in detected from an unknown device.
You were not trying to sign in.`,
    hint: "Use the official account app or website directly. Look for the list of recent sign-ins.",
    expected_answer: "recent sign-ins",
    accepted_answers: ["sign-in activity", "login activity", "account activity", "sign-in history", "login history"]
  },
  {
    prompt: "You are leaving a shared college computer and your email is still open. Type the security action to take.",
    artifact: `SHARED COMPUTER
Your email account is signed in.
The next student is waiting to use this computer.`,
    hint: "Make sure the next person cannot open your account from this computer.",
    expected_answer: "sign out",
    accepted_answers: ["log out", "sign out of the account", "log off"]
  }
];

const levelThreeSeeds = [
  ["ROTATE", 3, "caesar"],
  ["KEYSTONE", 7, "caesar"],
  ["INCIDENT", 11, "caesar"],
  ["FIREWALL", 5, "caesar"],
  ["CIPHER", 9, "caesar"],
  ["DEFENSE", 4, "caesar"],
  ["TRUST", 8, "caesar"],
  ["VAULT", 12, "caesar"],
  ["AUTH", 6, "caesar"],
  ["ACCESS", 14, "caesar"],
  ["GUARD", 1, "a1z26"],
  ["SHIELD", 1, "a1z26"],
  ["PACKET", 1, "a1z26"],
  ["SECURE", 1, "a1z26"],
  ["TRACE", 1, "a1z26"]
];

const caesarEncode = (text, key) => [...text].map((letter) =>
  String.fromCharCode((letter.charCodeAt(0) - 65 + key) % 26 + 65)
).join("");
const caesarDecode = (text, key) => [...text].map((letter) =>
  String.fromCharCode((letter.charCodeAt(0) - 65 - key + 26) % 26 + 65)
).join("");

const levelOnePool = levelOneScenarios.map(({ id, terminal, prompt, context, clues, hint, expected_answer }) => ({
  id,
  level: 1,
  terminal,
  prompt,
  context,
  clues,
  hint,
  artifact: `${context}\n\n${clues.join("\n")}`,
  input_label: "FOUR-DIGIT PASSWORD",
  placeholder: "Enter 4 digits",
  expected_answer,
  points: 20
}));

const levelTwoPool = levelTwoScenarios.map(({ prompt, artifact, hint, expected_answer, accepted_answers }, index) => ({
  id: `GAM-E${String(index + 1).padStart(2, "0")}`,
  level: 2,
  terminal: "GAMMA BREACH EVIDENCE",
  prompt,
  artifact,
  hint,
  accepted_answers,
  input_label: "TYPE YOUR FINDING",
  placeholder: "Enter a short answer",
  expected_answer,
  points: 10
}));

const levelThreePool = levelThreeSeeds.map(([plaintext, key, cipher], index) => {
  const encrypted = cipher === "caesar" ? caesarEncode(plaintext, key) : null;
  const artifact = cipher === "caesar"
    ? `CAPTURED PAYLOAD: ${encrypted}\nSHIFT KEY: ${key}\nDIRECTION: REVERSE THE SHIFT`
    : `CAPTURED PAYLOAD: ${[...plaintext].map((letter) => letter.charCodeAt(0) - 64).join(" ")}\nCHARACTER MAP: A=1 THROUGH Z=26`;
  return {
    id: `INI-${String(index + 1).padStart(2, "0")}`,
    level: 3,
    terminal: "CRYPTOGRAPHIC CONSOLE",
    prompt: cipher === "caesar"
      ? "The payload was shifted forward during transit. Use the recovered key to restore its plaintext."
      : "The payload contains alphabet positions. Reassemble the decoded token in its original order.",
    artifact,
    input_label: "DECODED TOKEN",
    placeholder: "Enter the decoded text",
    expected_answer: plaintext,
    points: 20
  };
});

function sourceInvestigation(word, rotation, calibration) {
  const sampleValues = Array(word.length);
  [...word].forEach((letter, index) => {
    const slot = (index * rotation) % word.length;
    sampleValues[slot] = letter.charCodeAt(0) - 64 + calibration[index % calibration.length];
  });
  const calibrationValues = calibration.join(", ");
  return `public class MonthlyReport {
    public static void main(String[] args) {
        int[] totals = {${sampleValues.join(", ")}};
        int[] route = {${rotation}};
        int[] calibration = {${calibrationValues}};
        char[] labels = new char[totals.length];

        for (int minute = 0; minute < totals.length; minute++) {
            int storageSlot = (minute * route[0]) % totals.length;
            int adjusted = totals[storageSlot] - calibration[minute % calibration.length];
            labels[minute] = (char) (64 + adjusted);
        }

        int reportChecksum = 0;
        for (char label : labels) {
            reportChecksum += label;
        }
        System.out.println("Rows processed: " + labels.length);
        System.out.println("Checksum: " + reportChecksum);
    }
}`;
}

const investigationSeeds = [
  ["NIGHTWATCH", 3, [2, 1, 4]],
  ["FIREWALL", 3, [1, 3, 2]],
  ["DATAVAULT", 5, [4, 2, 1]],
  ["ACCESSNODE", 3, [3, 1, 2]],
  ["CIPHERTRACE", 7, [2, 4, 1]]
];

const levelFourPool = investigationSeeds.map(([word, rotation, calibration], index) => ({
  id: `CODE-${String(index + 1).padStart(2, "0")}`,
  level: 4,
  terminal: "CLASSIFIED SOURCE ARCHIVE",
  prompt: "Reconstruct the output labels without running the program. Trace the loop in execution order, map each iteration to its routed storage slot, remove the repeating calibration, then convert the resulting values to alphabet positions. Enter the final incident token.",
  artifact: `SOURCE REVIEW · MonthlyReport.java\n${sourceInvestigation(word, rotation, calibration)}\n\nOPERATOR NOTE: Start with A = 1. Labels are written in loop order. The checksum is only an integrity total; it is not the incident token.`,
  input_label: "INCIDENT TOKEN",
  placeholder: "Enter the reconstructed token",
  expected_answer: word,
  points: 100
}));

const levelFiveSeeds = [
  ["NODE_NM4P_CACHE", "NMAP"],
  ["TRACE_W1R3SH4RK_FRAME", "WIRESHARK"],
  ["M4L73G0_GRAPH_ARCHIVE", "MALTEGO"],
  ["M3T4SPL01T_ENGINE_BUILD", "METASPLOIT"],
  ["BL00DH0UND_ID3NT1TY_M4TR1X", "BLOODHOUND"],
  ["BURP_SU1TE_PACKET_RELAY", "BURPSUITE"],
  ["R3C0NNG_ASSET_MAP", "RECONNG"],
  ["TH3H4RVESTER_DOMAIN_INDEX", "THEHARVESTER"],
  ["4M4SS_SUBDOMAIN_SWEEP", "AMASS"],
  ["R3SP0NDER_NAME_SERVICE", "RESPONDER"],
  ["M4L73G0_LINK_ANALYSIS", "MALTEGO"],
  ["NMAP_PORT_SIGNATURE", "NMAP"]
];

const levelFivePool = levelFiveSeeds.map(([display_signal, expected_answer], index) => ({
  id: `DIR-${String(index + 1).padStart(2, "0")}`,
  level: 5,
  terminal: "FINAL DIRECTIVE · LIVE SIGNAL",
  prompt: "Identify the cybersecurity tool embedded in this telemetry stream and enter its name before the signal expires.",
  artifact: display_signal,
  input_label: "TOOL SIGNATURE",
  placeholder: "Enter the tool name",
  expected_answer,
  points: 20,
  timed: true
}));

export const CHALLENGE_POOLS = [
  levelOnePool,
  levelTwoPool,
  levelThreePool,
  levelFourPool,
  levelFivePool
];

export const LEVEL_QUESTION_COUNTS = [5, 10, 5, 1, 5];
export const LEVEL_NAMES = ["ARMOR PROTOCOL", "GAMMA BREACH", "THE INITIATIVE", "THE FIRST CODE", "FINAL DIRECTIVE"];
export const QUALIFYING_SCORES = [50, 60, 70, 70];
export const LEVEL_ONE_ATTEMPTS = 2;
export const LEVEL_TWO_ATTEMPTS = 2;
export const LEVEL_ONE_QUESTION_MS = 120 * 1000;
const challengesById = new Map(CHALLENGE_POOLS.flat().map((challenge) => [challenge.id, challenge]));

export function getChallenge(id) {
  return challengesById.get(id) || null;
}

export function assignChallenges(level, excludedSets = []) {
  const pool = CHALLENGE_POOLS[level - 1];
  const count = LEVEL_QUESTION_COUNTS[level - 1];
  if (!pool || pool.length < count) throw new Error(`Level ${level} does not have enough unique challenges.`);
  const excluded = count < pool.length ? new Set(excludedSets.map((ids) => [...ids].sort().join("|"))) : new Set();
  let assignment;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const shuffled = [...pool];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const swap = randomInt(index + 1);
      [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
    }
    assignment = shuffled.slice(0, count).map((challenge) => challenge.id);
    if (!excluded.has([...assignment].sort().join("|"))) return assignment;
  }
  const shuffled = [...pool];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swap = randomInt(index + 1);
    [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
  }
  const selected = [];
  const findUnused = (start) => {
    if (selected.length === count) {
      const candidate = selected.slice();
      return excluded.has([...candidate].sort().join("|")) ? null : candidate;
    }
    for (let index = start; index <= shuffled.length - (count - selected.length); index += 1) {
      selected.push(shuffled[index].id);
      const candidate = findUnused(index + 1);
      selected.pop();
      if (candidate) return candidate;
    }
    return null;
  };
  const unused = findUnused(0);
  if (unused) return unused;
  return assignment;
}
