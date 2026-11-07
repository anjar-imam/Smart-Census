const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

let accessToken = localStorage.getItem("smart-census-token");

export function setAccessToken(token: string | null) {
  accessToken = token;
  if (token) localStorage.setItem("smart-census-token", token);
  else localStorage.removeItem("smart-census-token");
}

export function getAccessToken() {
  return accessToken;
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      message = body.detail ?? message;
    } catch {
      message = response.statusText || message;
    }
    if (response.status === 401) {
      setAccessToken(null);
      window.dispatchEvent(new Event("auth-expired"));
    }
    throw new Error(message);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function downloadCsv() {
  const response = await fetch(`${API_URL}/admin/export.csv`, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  });
  if (!response.ok) throw new Error("Could not export census data");
  const blob = await response.blob();
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "smart-census-export.csv";
  link.click();
  URL.revokeObjectURL(link.href);
}
