const PARTICIPANT_ROUTES = {
  register: ["POST", "/api/participant/register"],
  current: ["GET", "/api/participant/current"],
  answer: ["POST", "/api/participant/answer"],
  advance: ["POST", "/api/participant/advance"],
  event: ["POST", "/api/participant/event"]
};

export async function apiRequest(path, { method = "GET", body, keepalive = false } = {}) {
  const options = { method, credentials: "same-origin", headers: {}, keepalive };
  if (body !== undefined) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }
  const response = await fetch(path, options);
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("The competition server returned an invalid response.");
  }
  if (!response.ok) throw new Error(data?.error || "The competition server could not complete the request.");
  return data;
}

export function participantRequest(action, payload = {}) {
  const route = PARTICIPANT_ROUTES[action];
  if (!route) throw new Error("Unsupported participant action.");
  const [method, path] = route;
  return apiRequest(path, {
    method,
    body: method === "POST" ? payload : undefined,
    keepalive: action === "event" && payload.event_type === "page_hide"
  });
}

export function messageFor(error) {
  return error instanceof Error ? error.message : "Request failed. Check your connection and try again.";
}
