const levelOneQuestions = [
  ["Which choice is the strongest password?", ["password123", "Cyber2026!", "R7!qL2#vN9@p"], 2],
  ["What is the safest way to create a unique password for every site?", ["Reuse one memorable password", "Use a password manager to generate and store unique passwords", "Add the current year to your usual password"], 1],
  ["A website asks you to confirm your password through an unexpected email link. What should you do?", ["Use the link before it expires", "Reply with the password", "Open the official site directly and check your account"], 2],
  ["Which change best improves a long passphrase?", ["Replace one letter with a similar-looking symbol", "Add unrelated words and keep it unique", "Use your name and birth year"], 1],
  ["Where is it safest to store account recovery codes?", ["In a private secure location separate from the account", "In a public profile note", "In the same email inbox as the account"], 0],
  ["A service reports that a password you reused appeared in a data breach. What should you do first?", ["Change that password and any reused copies", "Wait for another notification", "Change only your username"], 0],
  ["Which login option best protects an account if a password is stolen?", ["Two-factor authentication", "A public security question", "A shorter password"], 0],
  ["What should you do with the default password on a new router?", ["Keep it for consistency", "Change it to a unique strong password", "Share it with guests"], 1],
  ["Which is a safer answer to a password-reset security question?", ["A truthful answer anyone can find online", "A unique random answer stored securely", "Your current password"], 1],
  ["A coworker asks you to send your password in chat to fix an account. What is the safest response?", ["Send it once and change it later", "Decline and use an approved access-sharing method", "Send only half of it"], 1]
].map(([prompt, options, correctOption], index) => ({
  id: `L1-${index + 1}`,
  level: 1,
  ordinal: index + 1,
  prompt,
  options,
  expected_answer: String(correctOption),
  points: 10
}));

const levelTwoQuestions = [
  ["https://accounts.northstar.test/security — Open your account security center", "0"],
  ["https://northstar.test.account-check.example/login — Your account will close in 10 minutes", "1"],
  ["https://portal.campus.example.test/sso — Sign in to the campus portal", "0"],
  ["https://paypaI.example.test/verify — Payment on hold; verify now", "1"],
  ["https://mail.riverbank.test/help — View your secure messages", "0"],
  ["https://login.riverbank.verify-user.example/reset — Unusual activity detected: reset password", "1"],
  ["https://docs.studio.test/share/brief — A teammate shared a project brief", "0"],
  ["https://updates.example.test@signin.test.invalid/session — Continue to avoid losing access", "1"],
  ["https://store.museum.test/receipt — Your requested receipt is ready", "0"],
  ["https://secure.museum.test.invalid.gift-check.example/claim — Claim your unrequested reward", "1"]
].map(([prompt, expected_answer], index) => ({
  id: `L2-${index + 1}`,
  level: 2,
  ordinal: index + 1,
  prompt,
  options: ["SAFE", "SUSPICIOUS"],
  expected_answer,
  points: 10
}));

function caesarEncrypt(plaintext, key) {
  return [...plaintext].map((letter) =>
    String.fromCharCode(((letter.charCodeAt(0) - 65 + key) % 26) + 65)
  ).join("");
}

const levelThreeQuestions = [
  ["FIREWALL", 3],
  ["SECURE", 5],
  ["NETWORK", 7],
  ["TOKEN", 4],
  ["DEFEND", 9],
  ["PACKET", 2],
  ["THREAT", 11],
  ["VERIFY", 6],
  ["ACCESS", 13],
  ["PRIVACY", 8]
].map(([plaintext, cipher_key], index) => ({
  id: `L3-${index + 1}`,
  level: 3,
  ordinal: index + 1,
  prompt: `Encrypt the plaintext ${plaintext} using the displayed Caesar key.`,
  options: [],
  plaintext,
  cipher_key,
  expected_answer: caesarEncrypt(plaintext, cipher_key),
  points: 10
}));

function encodeA1Z26(word) {
  return [...word].map((letter) => letter.charCodeAt(0) - 64);
}

function sourceMarksProgram(word) {
  const values = encodeA1Z26(word);
  const splitAt = Math.ceil(values.length / 2);
  const quizScores = values.slice(0, splitAt).join(", ");
  const examScores = values.slice(splitAt).join(", ");
  return `public class StudentMarks {
    public static void main(String[] args) {
        int[] quizScores = {${quizScores}};
        int[] examScores = {${examScores}};
        int total = 0;
        int count = 0;
        for (int mark : quizScores) {
            total += mark;
            count++;
        }
        for (int mark : examScores) {
            total += mark;
            count++;
        }
        double average = (double) total / count;
        System.out.println("Number of marks: " + count);
        System.out.println("Total marks: " + total);
        System.out.printf("Average mark: %.2f%n", average);
    }
}`;
}

const levelFourQuestions = [
  "NETWORK",
  "SECURE",
  "FIREWALL",
  "DIGITAL",
  "DEFENSE",
  "ENCRYPT",
  "PRIVACY",
  "CYBER",
  "ACCESS",
  "MONITOR"
].map((expected_answer, index) => ({
  id: `L4-${index + 1}`,
  level: 4,
  ordinal: index + 1,
  prompt: "Inspect this ordinary Java student-marks program. The only clue is “Start with A = 1.” Decode the score values and enter the hidden word.",
  options: [],
  expected_answer,
  points: 10,
  source_code: sourceMarksProgram(expected_answer)
}));

const levelFiveQuestions = [
  ["NODE_NM4P_CACHE", "NMAP"],
  ["TRACE_W1R3SH4RK_FRAME", "WIRESHARK"],
  ["M4L73G0_GRAPH_ARCHIVE", "MALTEGO"],
  ["M3T4SPL01T_ENGINE_BUILD", "METASPLOIT"],
  ["BL00DH0UND_ID3NT1TY_M4TR1X", "BLOODHOUND"]
].map(([display_signal, expected_answer], index) => ({
  id: `L5-${index + 1}`,
  level: 5,
  ordinal: index + 1,
  prompt: "Identify the cybersecurity tool naturally embedded in the signal.",
  options: [],
  display_signal,
  expected_answer,
  points: 20
}));

export const QUESTIONS = [
  ...levelOneQuestions,
  ...levelTwoQuestions,
  ...levelThreeQuestions,
  ...levelFourQuestions,
  ...levelFiveQuestions
];

export const LEVEL_QUESTION_COUNTS = [10, 10, 10, 10, 5];
export const LEVEL_NAMES = ["ARMOR PROTOCOL", "GAMMA BREACH", "THE INITIATIVE", "THE FIRST CODE", "FINAL DIRECTIVE"];
export const QUALIFYING_SCORES = [50, 60, 70, 70];
