export function errMessage(err: unknown, fallback = "Something went wrong") {
  let raw = "";
  if (err instanceof Error && err.message) raw = err.message;
  else if (typeof err === "string" && err) raw = err;
  else return fallback;

  const lower = raw.toLowerCase();
  if (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("network request failed") ||
    lower.includes("load failed") ||
    lower.includes("fetch failed") ||
    lower === "network error"
  ) {
    return "Failed to fetch"; // SessionGate maps this to OfflineScreen
  }

  // Zod / server validation often surfaces as a JSON array string
  const trimmed = raw.trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      const issues = Array.isArray(parsed) ? parsed : [parsed];
      const parts: string[] = [];
      for (const issue of issues) {
        if (!issue || typeof issue !== "object") continue;
        const o = issue as { path?: unknown; message?: string; code?: string };
        const path = Array.isArray(o.path) ? o.path.join(".") : "";
        if (path === "phone" || (typeof o.message === "string" && o.message.toLowerCase().includes("phone"))) {
          parts.push("Enter a valid Malawi mobile number (e.g. 0999… or 0888…, at least 9 digits).");
          continue;
        }
        if (typeof o.message === "string" && o.message) {
          parts.push(path ? `${path}: ${o.message}` : o.message);
        }
      }
      if (parts.length) return parts.join(" ");
    } catch {
      /* not JSON */
    }
  }
  return raw || fallback;
}
