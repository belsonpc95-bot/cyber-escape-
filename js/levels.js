export const RUN_KEY = "cyberEscapeRoom.activeRun.v1";
export const HISTORY_KEY = "cyberEscapeRoom.runs.v1";
export const FINALISTS_KEY = "cyberEscapeRoom.finalists.v1";
export const FINAL_QUESTION_SECONDS = 30;
export const FINAL_QUESTION_COUNT = 5;

export const LEVELS = [
  { title: "ARMOR PROTOCOL", theme: "PASSWORD CHALLENGE", environment: "ARMORED AI COMMAND LAB", qualify: 50 },
  { title: "GAMMA BREACH", theme: "PHISHING DETECTION", environment: "EMERALD ENERGY RESEARCH FACILITY", qualify: 60 },
  { title: "THE INITIATIVE", theme: "CRYPTOGRAPHY PUZZLE", environment: "FUTURISTIC COMMAND TOWER", qualify: 70 },
  { title: "THE FIRST CODE", theme: "JAVA SOURCE CODE CLUE", environment: "RETRO-FUTURISTIC CLASSIFIED LAB", qualify: 70 },
  { title: "FINAL DIRECTIVE", theme: "FINAL CYBER TOOL CODE", environment: "CLASSIFIED INTELLIGENCE BUNKER", qualify: null }
];

export const PHISHING_CASES = [
  { url: "https://accounts.northstar.test/security", message: "Open your account security center", safe: true },
  { url: "https://northstar.test.account-check.example/login", message: "Your account will close in 10 minutes", safe: false },
  { url: "https://portal.campus.example.test/sso", message: "Sign in to the campus portal", safe: true },
  { url: "https://paypaI.example.test/verify", message: "Payment on hold — verify now", safe: false },
  { url: "https://mail.riverbank.test/help", message: "View your secure messages", safe: true },
  { url: "https://login.riverbank.verify-user.example/reset", message: "Unusual activity detected: reset password", safe: false },
  { url: "https://docs.studio.test/share/brief", message: "A teammate shared a project brief", safe: true },
  { url: "https://updates.example.test@signin.test.invalid/session", message: "Continue to avoid losing access", safe: false },
  { url: "https://store.museum.test/receipt", message: "Your requested receipt is ready", safe: true },
  { url: "https://secure.museum.test.invalid.gift-check.example/claim", message: "Claim your unrequested reward", safe: false }
];

export const TOOL_ROUNDS = [
  { display: "NODE_NM4P_CACHE", answer: "NMAP" },
  { display: "TRACE_W1R3SH4RK_FRAME", answer: "WIRESHARK" },
  { display: "M4L73G0_GRAPH_ARCHIVE", answer: "MALTEGO" },
  { display: "M3T4SPL01T_ENGINE_BUILD", answer: "METASPLOIT" },
  { display: "BL00DH0UND_ID3NT1TY_M4TR1X", answer: "BLOODHOUND" }
];
