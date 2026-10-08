import { randomInt } from "node:crypto";

const legacyLevelTwoScenarios = [
  ["https://portal.northstar.test/account/security", "A staff member reports a new account-security link. Enter the destination hostname shown by the address bar.", "northstar.test"],
  ["https://northstar.test.account-check.example/login", "An urgent account-lock message arrived. Identify and enter the untrusted destination hostname.", "northstar.test.account-check.example"],
  ["https://sso.campus.example.test/session", "An enrollment notice links to the campus sign-in. Enter the destination hostname for the incident note.", "sso.campus.example.test"],
  ["https://paypaI.example.test/verify", "The payment alert uses a brand-like spelling. Enter the actual destination hostname exactly as displayed.", "paypai.example.test"],
  ["https://mail.riverbank.test/message-center", "A customer requested a secure-message review. Enter the destination hostname.", "mail.riverbank.test"],
  ["https://login.riverbank.verify-user.example/reset", "A forced-reset message claims to be from a bank. Enter the hostname that receives the credentials.", "login.riverbank.verify-user.example"],
  ["https://docs.studio.test/share/brief", "A teammate shared a project brief. Enter the destination hostname for verification.", "docs.studio.test"],
  ["https://updates.example.test@signin.test.invalid/session", "Inspect the address syntax. Enter the hostname the browser actually connects to.", "signin.test.invalid"],
  ["https://store.museum.test/receipt", "A requested receipt is ready. Enter the destination hostname.", "store.museum.test"],
  ["https://secure.museum.test.invalid.gift-check.example/claim", "An unrequested reward page asks for identity data. Enter its destination hostname.", "secure.museum.test.invalid.gift-check.example"],
  ["https://accounts.orbit.test/device-review", "A sign-in alert asks the user to inspect registered devices. Enter the destination hostname.", "accounts.orbit.test"],
  ["https://orbit.test@session-orbit.example/confirm", "A session warning places a familiar brand before an at-sign. Enter the real destination hostname.", "session-orbit.example"],
  ["https://intranet.lab.example.test/home", "A staff portal link came from the internal directory. Enter the destination hostname.", "intranet.lab.example.test"],
  ["https://secure-payments.riverbank.test.evil.example/authorize", "A payment page uses a trusted name inside a longer hostname. Enter the full destination hostname.", "secure-payments.riverbank.test.evil.example"],
  ["https://status.cloudbox.test/incidents", "A service-status notification links to the vendor's status page. Enter the destination hostname.", "status.cloudbox.test"],
  ["https://cloudbox.test.login-review.example/auth", "The message threatens immediate account closure. Enter the host that would receive a submitted password.", "cloudbox.test.login-review.example"],
  ["https://library.cedar.example.test/account", "A library notice points to the listed campus hostname. Enter the destination hostname.", "library.cedar.example.test"],
  ["https://cedar.example.test@verify-cedar.example/access", "The URL contains user information before the at-sign. Enter the destination host.", "verify-cedar.example"],
  ["https://support.northwind.test/ticket/4821", "A support ticket update was expected. Enter the destination hostname.", "support.northwind.test"],
  ["https://northwind.test.security-center.example/renew", "An unexpected renewal warning links to a hostname containing the brand text. Enter the full destination hostname.", "northwind.test.security-center.example"]
];
const legacyLevelThreeSeeds = [
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
    terminal: "BADGE RESET CONSOLE",
    prompt: "A technician left two details in the reset log. Use the security note to calculate the four-digit access code.",
    context: "The console combines a badge number with the assigned lab number.",
    clues: [
      "Badge number: 12",
      "Assigned lab: 08",
      "Security note: \"Double the badge number, then place the two lab digits after it.\""
    ],
    hint: "Calculate twice the badge number first. Keep the lab number as the last two digits.",
    expected_answer: "2408"
  }
];

const levelTwoScenarios = [
  ["url-host", "INCIDENT 01 · URL ROUTING", "A password-reset message links to `https://accounts.orbit.test.account-check.example/signin`. Identify the full destination hostname that receives the credentials.", "CAPTURED LINK\nhttps://accounts.orbit.test.account-check.example/signin", "accounts.orbit.test.account-check.example", "DESTINATION HOST", "Enter the full destination hostname"],
  ["url-host", "INCIDENT 01 · URL ROUTING", "A package notice links to `https://tracking.parcel.test.delivery-check.example/claim`. Identify the full destination hostname that receives the credentials.", "CAPTURED LINK\nhttps://tracking.parcel.test.delivery-check.example/claim", "tracking.parcel.test.delivery-check.example", "DESTINATION HOST", "Enter the full destination hostname"],
  ["email-header", "INCIDENT 02 · SENDER FORENSICS", "The display name looks familiar. Inspect the sender and reply-to fields; enter the domain that would receive a reply.", "FROM: \"Riverbank Security\" <alerts@riverbank-security.test>\nREPLY-TO: recovery@inbox-audit.example\nDISPLAYED BRAND: Riverbank", "inbox-audit.example", "REPLY-TO DOMAIN", "Enter the reply-to domain"],
  ["email-header", "INCIDENT 02 · SENDER FORENSICS", "A cloud-storage notice claims to be from its provider. Enter the sender domain that actually sent it.", "FROM: \"CloudBox Support\" <support@cloudbox-helpdesk.example>\nMAILED-BY: cloudbox-helpdesk.example\nSIGNED-BY: cloudbox-helpdesk.example", "cloudbox-helpdesk.example", "SENDER DOMAIN", "Enter the sender domain"],
  ["social-engineering", "INCIDENT 03 · MESSAGE TRIAGE", "Identify the pressure tactic used in this message. Enter the single-word tactic, not a URL.", "MESSAGE: \"Your access will be permanently removed in 8 minutes. Do not contact support; verify your account here immediately.\"", "urgency", "PRESSURE TACTIC", "Enter the tactic"],
  ["social-engineering", "INCIDENT 03 · MESSAGE TRIAGE", "Identify the manipulation technique the sender uses to make the recipient bypass normal verification.", "MESSAGE: \"The director is boarding now. Buy six gift cards and send the codes privately; this is confidential.\"", "authority", "MANIPULATION TECHNIQUE", "Enter the technique"],
  ["fake-alert", "INCIDENT 04 · ALERT CONTAINMENT", "A browser overlay claims the device is infected. Name the safe first action before contacting any listed number.", "SIMULATED ALERT: \"SYSTEM COMPROMISED. Call 1-800-0100 now and install RescuePatch.exe. Closing this page may destroy your files.\"", "close the page", "FIRST SAFE ACTION", "Enter the safe first action"],
  ["fake-alert", "INCIDENT 04 · ALERT CONTAINMENT", "The pop-up asks for a one-time code to stop a fake infection scan. Identify the sensitive item it is trying to steal.", "SIMULATED ALERT: \"Enter the six-digit code just sent to your phone to cancel the threat scan.\"", "one-time code", "TARGETED SECRET", "Enter the secret being targeted"],
  ["attachment", "INCIDENT 05 · FILE INSPECTION", "A shipment invoice arrives unexpectedly. Inspect the filename and enter its true final file extension.", "ATTACHMENT: Invoice_4821.pdf.scr\nSENDER: unknown-delivery@parcel-check.example", "scr", "FINAL EXTENSION", "Enter the final extension"],
  ["attachment", "INCIDENT 05 · FILE INSPECTION", "A colleague supposedly shares a macro-enabled spreadsheet from an unfamiliar sender. Identify the risky file type.", "ATTACHMENT: Q3_Budget.xlsm\nMESSAGE: \"Enable macros to reveal the protected totals.\"", "xlsm", "RISKY FILE TYPE", "Enter the extension"],
  ["short-link", "INCIDENT 06 · REDIRECT TRACE", "A shortened link hides its destination. Without opening it, enter the safest verification action.", "MESSAGE LINK: https://short.test/a8Q2\nDESTINATION PREVIEW: unavailable", "verify through official channel", "VERIFICATION ACTION", "Enter the safe action"],
  ["short-link", "INCIDENT 06 · REDIRECT TRACE", "The short link's preview points to an unfamiliar credential page. Enter what the analyst should do instead of following it.", "MESSAGE LINK: https://go.test/r7pL\nPREVIEW: https://login-reward.example/claim", "navigate to official site", "SAFE NAVIGATION", "Enter the safer navigation method"],
  ["https-misconception", "INCIDENT 07 · CONNECTION AUDIT", "A padlock appears on a suspicious page. State what HTTPS confirms, not whether the site itself is trustworthy.", "ADDRESS: https://secure-account-review.example/\nCERTIFICATE: valid for secure-account-review.example", "encrypted connection", "WHAT HTTPS CONFIRMS", "Enter the property confirmed"],
  ["https-misconception", "INCIDENT 07 · CONNECTION AUDIT", "The browser reports a secure connection to an unknown shop. State what the padlock does not prove.", "ADDRESS: https://brand-clearance.example/\nCERTIFICATE: valid\nPADLOCK: displayed", "site is trustworthy", "UNPROVEN CLAIM", "Enter what is not proven"],
  ["fake-login", "INCIDENT 08 · LOGIN PAGE REVIEW", "The portal header names Northstar, but the credential form is hosted elsewhere. Enter the hostname shown in the form action.", "PAGE BRAND: Northstar\nFORM ACTION: https://northstar-auth.example/collect\nEXPECTED LOGIN HOST: login.northstar.test", "northstar-auth.example", "FORM DESTINATION", "Enter the form hostname"],
  ["fake-login", "INCIDENT 08 · LOGIN PAGE REVIEW", "A campus sign-in page requests credentials from a domain unrelated to the institution. Enter the hostname receiving the password.", "PAGE BRAND: Cedar Campus\nFORM ACTION: https://cedar-sso-verify.example/session\nKNOWN CAMPUS DOMAIN: login.cedar.test", "cedar-sso-verify.example", "CREDENTIAL HOST", "Enter the form hostname"],
  ["login-anomaly", "INCIDENT 09 · ACCOUNT ALERT", "A sign-in alert lists one detail that the account owner should investigate. Enter that anomalous detail.", "ACCOUNT: analyst@orbit.test\nDEVICE: Known laptop\nLOCATION: Reykjavík, Iceland\nOWNER'S USUAL REGION: Singapore", "location", "ANOMALOUS DETAIL", "Enter the detail to investigate"],
  ["login-anomaly", "INCIDENT 09 · ACCOUNT ALERT", "Review the sign-in log and name the unfamiliar element that warrants immediate credential review.", "ACCOUNT: operator@northwind.test\nTIME: 09:14 local\nDEVICE: Unrecognized Android device\nOWNER'S DEVICES: managed Windows laptop, managed tablet", "device", "ANOMALOUS DETAIL", "Enter the detail to investigate"],
  ["redirect-chain", "INCIDENT 10 · REDIRECT FORENSICS", "A simulated redirect chain ends at an untrusted host. Enter the final host where the browser would land.", "HOP 1: https://portal.riverbank.test\nHOP 2: https://riverbank.test.session-review.example\nHOP 3: https://credential-vault.example/collect", "credential-vault.example", "FINAL REDIRECT HOST", "Enter the final registered hostname"],
  ["redirect-chain", "INCIDENT 10 · REDIRECT FORENSICS", "Trace all hops and report the final registered hostname, not the trusted-looking first hop.", "HOP 1: https://updates.cloudbox.test\nHOP 2: https://cloudbox.test.auth-check.example\nHOP 3: https://cloudbox-verify.example/login", "cloudbox-verify.example", "FINAL REDIRECT HOST", "Enter the final registered hostname"]
];

const levelThreeSeeds = [
  ["ROTATE", 3, "forward"],
  ["KEYSTONE", 7, "forward"],
  ["INCIDENT", 11, "forward"],
  ["FIREWALL", 5, "forward"],
  ["CIPHER", 9, "forward"],
  ["DEFENSE", 4, "reverse"],
  ["TRUST", 8, "reverse"],
  ["VAULT", 12, "reverse"],
  ["AUTH", 6, "reverse"],
  ["ACCESS", 14, "reverse"],
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

const legacyLevelTwoPool = legacyLevelTwoScenarios.map(([url, prompt, expected_answer], index) => ({
  id: `GAM-${String(index + 1).padStart(2, "0")}`,
  level: 2,
  terminal: "LINK FORENSICS",
  prompt,
  artifact: `CAPTURED MESSAGE URL\n${url}\n\nSIMULATED ENVIRONMENT · .TEST DOMAINS DO NOT RESOLVE`,
  input_label: "DESTINATION HOST",
  placeholder: "Enter the hostname",
  expected_answer,
  points: 10
}));
const legacyLevelThreePool = legacyLevelThreeSeeds.map(([plaintext, key, cipher], index) => ({
  id: `INI-${String(index + 1).padStart(2, "0")}`,
  level: 3,
  terminal: "CRYPTOGRAPHIC CONSOLE",
  prompt: cipher === "caesar"
    ? "The payload was shifted forward during transit. Use the recovered key to restore its plaintext."
    : "The payload contains alphabet positions. Reassemble the decoded token in its original order.",
  artifact: cipher === "caesar"
    ? `CAPTURED PAYLOAD: ${caesarEncode(plaintext, key)}\nSHIFT KEY: ${key}\nDIRECTION: REVERSE THE SHIFT`
    : `CAPTURED PAYLOAD: ${[...plaintext].map((letter) => letter.charCodeAt(0) - 64).join(" ")}\nCHARACTER MAP: A=1 THROUGH Z=26`,
  input_label: "DECODED TOKEN",
  placeholder: "Enter the decoded text",
  expected_answer: plaintext,
  points: 20
}));

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

const levelTwoPool = levelTwoScenarios.map(([assignment_group, terminal, prompt, artifact, expected_answer, input_label, placeholder], index) => ({
  id: `GAM-${String(index + 21).padStart(2, "0")}`,
  level: 2,
  assignment_group,
  terminal,
  prompt,
  artifact: `${artifact}\n\nSIMULATED ENVIRONMENT · .TEST DOMAINS DO NOT RESOLVE`,
  input_label,
  placeholder,
  expected_answer,
  points: 10
}));

const levelThreePool = levelThreeSeeds.map(([plaintext, key, cipher], index) => {
  let artifact;
  let prompt;
  let expected_answer;
  if (cipher === "forward") {
    artifact = `PLAINTEXT: ${plaintext}\nSHIFT KEY: ${key}\nDIRECTION: FORWARD`;
    prompt = "Encrypt the plaintext by shifting every letter forward by the supplied key. Wrap from Z back to A.";
    expected_answer = caesarEncode(plaintext, key);
  } else if (cipher === "reverse") {
    artifact = `CAPTURED PAYLOAD: ${caesarEncode(plaintext, key)}\nSHIFT KEY: ${key}\nDIRECTION: REVERSE`;
    prompt = "Decrypt the captured payload by shifting every letter backward by the supplied key.";
    expected_answer = plaintext;
  } else {
    artifact = `CAPTURED PAYLOAD: ${[...plaintext].map((letter) => letter.charCodeAt(0) - 64).join(" ")}\nCHARACTER MAP: A=1 THROUGH Z=26\nREAD ORDER: LEFT TO RIGHT`;
    prompt = "Convert each number into its alphabet letter using the supplied map, then enter the recovered token.";
    expected_answer = plaintext;
  }
  return {
    id: `INI-${String(index + 16).padStart(2, "0")}`,
    level: 3,
    assignment_group: cipher,
    logic_type: cipher,
    terminal: "CRYPTOGRAPHIC CONSOLE",
    prompt,
    artifact,
    input_label: cipher === "forward" ? "ENCRYPTED TOKEN" : "DECODED TOKEN",
    placeholder: cipher === "forward" ? "Enter the encrypted text" : "Enter the decoded text",
    expected_answer,
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
export const LEVEL_ONE_QUESTION_MS = 120 * 1000;
export const LEVEL_ATTEMPT_LIMITS = { 1: 2, 2: 2, 4: 3 };
const challengesById = new Map(CHALLENGE_POOLS.flat().map((challenge) => [challenge.id, challenge]));
for (const challenge of [...legacyLevelTwoPool, ...legacyLevelThreePool]) challengesById.set(challenge.id, challenge);
const groupedAssignmentRules = {
  2: { "url-host": 1, "email-header": 1, "social-engineering": 1, "fake-alert": 1, attachment: 1, "short-link": 1, "https-misconception": 1, "fake-login": 1, "login-anomaly": 1, "redirect-chain": 1 },
  3: { forward: 2, reverse: 2, a1z26: 1 }
};

function combinations(values, count) {
  const result = [];
  const selected = [];
  const visit = (start) => {
    if (selected.length === count) {
      result.push(selected.slice());
      return;
    }
    for (let index = start; index <= values.length - (count - selected.length); index += 1) {
      selected.push(values[index]);
      visit(index + 1);
      selected.pop();
    }
  };
  visit(0);
  return result;
}

function shuffle(values) {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swap = randomInt(index + 1);
    [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
  }
  return shuffled;
}

export function getChallenge(id) {
  return challengesById.get(id) || null;
}

export function assignChallenges(level, excludedSets = []) {
  const pool = CHALLENGE_POOLS[level - 1];
  const count = LEVEL_QUESTION_COUNTS[level - 1];
  if (!pool || pool.length < count) throw new Error(`Level ${level} does not have enough unique challenges.`);
  const excluded = count < pool.length ? new Set(excludedSets.map((ids) => [...ids].sort().join("|"))) : new Set();
  const rules = groupedAssignmentRules[level];
  if (rules) {
    const grouped = Object.entries(rules).map(([group, required]) => {
      const members = pool.filter((challenge) => challenge.assignment_group === group);
      if (members.length < required) throw new Error(`Level ${level} has too few challenges in group ${group}.`);
      return combinations(members, required);
    });
    const candidates = [];
    const appendGroups = (index, selected) => {
      if (index === grouped.length) {
        candidates.push(selected);
        return;
      }
      for (const combination of grouped[index]) appendGroups(index + 1, [...selected, ...combination]);
    };
    appendGroups(0, []);
    for (const candidate of shuffle(candidates)) {
      const assignment = shuffle(candidate).map((challenge) => challenge.id);
      if (!excluded.has([...assignment].sort().join("|"))) return assignment;
    }
    throw new Error(`Level ${level} has no unused challenge set.`);
  }
  let assignment;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    assignment = shuffle(pool).slice(0, count).map((challenge) => challenge.id);
    if (!excluded.has([...assignment].sort().join("|"))) return assignment;
  }
  const shuffled = shuffle(pool);
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
