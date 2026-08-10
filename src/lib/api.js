const clientBaseUrl = import.meta.env?.BASE_URL || "/";
const apiBase = `${clientBaseUrl.replace(/\/$/, "")}/api`;
const resolveApiPath = (path) => path.startsWith("/api") ? `${apiBase}${path.slice(4)}` : path;

export async function apiRequest(path, options = {}) {
  const response = await fetch(resolveApiPath(path), {
    credentials: "include",
    ...options,
    headers: options.body instanceof FormData ? options.headers : { "Content-Type": "application/json", ...options.headers },
  });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(data?.error || `Request failed (${response.status})`);
    error.status = response.status;
    error.details = data?.details;
    throw error;
  }
  return data;
}

export async function readClientSseStream(stream, handlers = {}) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completed = null;
  const consume = async (block) => {
    let event = "message";
    const data = [];
    block.split(/\r?\n/).forEach((line) => {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
    });
    if (!data.length) return;
    const payload = JSON.parse(data.join("\n"));
    if (event === "error") throw new Error(payload.error || "Streaming request failed");
    await handlers[event]?.(payload);
    if (event === "complete") completed = payload;
  };
  try {
    while (true) {
      const result = await reader.read();
      buffer += decoder.decode(result.value, { stream: !result.done });
      let match = /\r?\n\r?\n/.exec(buffer);
      while (match) {
        const block = buffer.slice(0, match.index);
        buffer = buffer.slice(match.index + match[0].length);
        await consume(block);
        match = /\r?\n\r?\n/.exec(buffer);
      }
      if (result.done) break;
    }
    if (buffer.trim()) await consume(buffer);
    if (!completed) throw new Error("Streaming response ended before completion");
    return completed;
  } finally {
    reader.releaseLock();
  }
}

export async function apiStreamRequest(path, options = {}, handlers = {}) {
  const response = await fetch(resolveApiPath(path), {
    credentials: "include",
    ...options,
    headers: options.body instanceof FormData ? options.headers : { "Content-Type": "application/json", ...options.headers },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    const error = new Error(data?.error || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  if (!response.body) throw new Error("Streaming response is unavailable");
  return readClientSseStream(response.body, handlers);
}

export const audioApi = {
  list: () => apiRequest("/api/audio"),
  url: (id, download = false) => apiRequest(`/api/audio/${encodeURIComponent(id)}/url${download ? "?download=1" : ""}`),
  remove: (id) => apiRequest(`/api/audio/${encodeURIComponent(id)}`, { method: "DELETE" }),
  updateTranscript: (id, transcript) => apiRequest(`/api/audio/${encodeURIComponent(id)}/transcript`, { method: "PATCH", body: JSON.stringify({ transcript }) }),
  generateTts: (input) => apiRequest("/api/generate/tts", { method: "POST", body: JSON.stringify(input) }),
  generateTtsStream: (input, handlers, signal) => apiStreamRequest("/api/generate/tts/stream", { method: "POST", body: JSON.stringify(input), signal }, handlers),
  generateCloneTts: (input) => {
    const body = new FormData();
    body.set("text", input.text);
    body.set("format", input.format);
    body.set("directorInstruction", input.directorInstruction || "");
    body.set("consent", String(Boolean(input.consent)));
    body.set("reference", input.reference);
    return apiRequest("/api/generate/tts/clone", { method: "POST", body });
  },
  transcribe: (file, language = "auto") => {
    const body = new FormData();
    body.set("audio", file);
    body.set("language", language);
    return apiRequest("/api/generate/asr", { method: "POST", body });
  },
  transcribeStream: (file, language = "auto", handlers = {}, signal) => {
    const body = new FormData();
    body.set("audio", file);
    body.set("language", language);
    return apiStreamRequest("/api/generate/asr/stream", { method: "POST", body, signal }, handlers);
  },
};

export const credentialApi = {
  status: () => apiRequest("/api/credentials/mimo"),
  save: ({ apiKey, baseUrl }) => apiRequest("/api/credentials/mimo", { method: "PUT", body: JSON.stringify({ apiKey: apiKey || undefined, baseUrl }) }),
  test: () => apiRequest("/api/credentials/mimo/test", { method: "POST", body: "{}" }),
  remove: () => apiRequest("/api/credentials/mimo", { method: "DELETE" }),
};

export const adminApi = {
  overview: () => apiRequest("/api/admin/overview"),
  users: () => apiRequest("/api/admin/users"),
  setRole: (id, role) => apiRequest(`/api/admin/users/${encodeURIComponent(id)}/role`, { method: "PUT", body: JSON.stringify({ role }) }),
  endpoints: () => apiRequest("/api/admin/endpoints"),
  addEndpoint: (input) => apiRequest("/api/admin/endpoints", { method: "POST", body: JSON.stringify(input) }),
  updateEndpoint: (id, input) => apiRequest(`/api/admin/endpoints/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(input) }),
};
