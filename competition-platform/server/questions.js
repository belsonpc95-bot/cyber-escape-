import { randomInt } from "node:crypto";

const levelOneScenarios = [
  ["credential-vault", "A shared credential appears in three unrelated service logs. Enter the immediate containment operation.", "Credential reuse confirmed · 3 service realms · no active deployment window.", "REVOKE"],
  ["recovery-station", "A recovery code was pasted into a public incident channel. Enter the action that protects the account now.", "Recovery factor exposure detected · account session still active.", "ROTATE"],
  ["identity-console", "A remote sign-in passed a password check from an unknown device, but no second factor was used. Name the control to require.", "Authentication trace: password PASS · second factor NONE · device NEW.", "MFA"],
  ["key-management", "The same API token is configured in staging and production. Enter the isolation action.", "Token fingerprint matches both environments · production scope includes billing.", "SEGREGATE"],
  ["access-control", "A former contractor's account still has administrator rights. Enter the first access-control operation.", "Directory state: contract ENDED · role ADMIN · session ACTIVE.", "DISABLE"],
  ["device-integrity", "A workstation reports that its disk is unencrypted. Enter the data-at-rest safeguard to apply.", "Endpoint posture: disk encryption OFF · portable device · customer records cached.", "ENCRYPT"],
  ["session-gateway", "A public terminal was left signed in to a privileged console. Enter the session operation.", "Console lock state: OPEN · operator absent · elevated role.", "TERMINATE"],
  ["patch-control", "A known critical patch is available for an internet-facing host. Enter the defensive change to schedule.", "Exposure window: public · vulnerability severity: critical · patch verified.", "PATCH"],
  ["backup-vault", "Backups are writable from the same account as production. Enter the property the backup copy must gain.", "Ransomware simulation: production WRITE · backup WRITE · shared identity.", "IMMUTABILITY"],
  ["audit-terminal", "A login audit trail can be edited by the account it records. Enter the storage property required.", "Evidence integrity check failed · writer and auditor are the same principal.", "TAMPER-EVIDENT"],
  ["network-segment", "A visitor network can route directly to a research controller. Enter the network boundary control.", "Route probe: guest VLAN → control VLAN · no policy checkpoint.", "SEGMENTATION"],
  ["certificate-console", "A service certificate is expired and clients are accepting a fallback. Enter the trust operation.", "TLS handshake: expired certificate · fallback accepted · identity unverified.", "REISSUE"],
  ["email-defense", "An attachment is quarantined, but its sender domain is a lookalike. Enter the sender-validation control.", "Display name matches vendor · envelope domain differs · SPF alignment fails.", "VERIFY-DOMAIN"],
  ["least-privilege", "A reporting account can modify payroll records. Enter the privilege change.", "Observed need: READ reports · granted role: READ, WRITE, DELETE payroll.", "REDUCE"],
  ["secret-store", "A database password is embedded in a source repository. Enter the first containment action.", "Repository exposure: credential committed · repository visibility: internal.", "ROTATE-SECRET"],
  ["endpoint-response", "An endpoint is encrypting files unexpectedly. Enter the immediate containment action.", "EDR alert: rapid file rewrites · host currently connected to trusted LAN.", "ISOLATE"],
  ["wireless-controller", "A wireless access point still uses its factory administrator credential. Enter the required change.", "Device state: factory account enabled · management interface reachable.", "CHANGE-CREDENTIAL"],
  ["audit-review", "A privileged action has no corresponding operator record. Enter the evidence source to preserve.", "Event gap: privileged command present · central log absent · host log present.", "PRESERVE-LOGS"],
  ["key-escrow", "One employee is the only person able to recover an encryption key. Enter the resilience design.", "Key custody: one holder · no sealed recovery copy · service criticality high.", "DUAL-CONTROL"],
  ["security-baseline", "An unknown executable is requesting administrator approval. Enter the safe response.", "Publisher: unsigned · hash: unseen · request: elevate now.", "DENY"]
];

const levelTwoScenarios = [
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

const levelOnePool = levelOneScenarios.map(([terminal, prompt, artifact, expected_answer], index) => ({
  id: `ARM-${String(index + 1).padStart(2, "0")}`,
  level: 1,
  terminal,
  prompt,
  artifact,
  input_label: "CONTAINMENT OPERATION",
  placeholder: "Enter the operation",
  expected_answer,
  points: 10
}));

const levelTwoPool = levelTwoScenarios.map(([url, prompt, expected_answer], index) => ({
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

export const LEVEL_QUESTION_COUNTS = [10, 10, 5, 1, 5];
export const LEVEL_NAMES = ["ARMOR PROTOCOL", "GAMMA BREACH", "THE INITIATIVE", "THE FIRST CODE", "FINAL DIRECTIVE"];
export const QUALIFYING_SCORES = [50, 60, 70, 70];
const challengesById = new Map(CHALLENGE_POOLS.flat().map((challenge) => [challenge.id, challenge]));

export function getChallenge(id) {
  return challengesById.get(id) || null;
}

export function assignChallenges(level, excludedSets = []) {
  const pool = CHALLENGE_POOLS[level - 1];
  const count = LEVEL_QUESTION_COUNTS[level - 1];
  if (!pool || pool.length < count) throw new Error(`Level ${level} does not have enough unique challenges.`);
  const excluded = new Set(excludedSets.map((ids) => [...ids].sort().join("|")));
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
