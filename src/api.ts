import type { ApiResult, BackendState } from "./types";

export const API_BASE = "http://127.0.0.1:8765";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const body = await response.text();
    let message = body;
    try {
      const payload = JSON.parse(body) as { message?: string };
      message = payload.message || message;
    } catch {
      message = body;
    }
    throw new Error(message || `HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  state: () => request<BackendState>("/api/state"),
  updateSettings: (payload: Record<string, unknown>) =>
    request<BackendState>("/api/settings", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  capture: () =>
    request<ApiResult>("/api/capture", {
      method: "POST",
      body: JSON.stringify({}),
    }),
  updateCourse: (payload: Record<string, unknown>) =>
    request<ApiResult>("/api/course/update", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  captureCourse: () =>
    request<ApiResult>("/api/course/capture", {
      method: "POST",
      body: JSON.stringify({}),
    }),
  coursePrompt: (payload: Record<string, unknown>) =>
    request<ApiResult & { prompt?: string }>("/api/course/prompt", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  saveCourseNote: (payload: Record<string, unknown>) =>
    request<ApiResult>("/api/course/save-note", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  startCourseSession: () =>
    request<ApiResult>("/api/course/session/start", {
      method: "POST",
      body: JSON.stringify({}),
    }),
  pauseCourseSession: () =>
    request<ApiResult>("/api/course/session/pause", {
      method: "POST",
      body: JSON.stringify({}),
    }),
  exportCourseSession: (format: "md" | "txt" | "json") =>
    request<ApiResult & { path?: string }>("/api/course/export", {
      method: "POST",
      body: JSON.stringify({ format }),
    }),
  reprocessOcr: (payload: Record<string, unknown>) =>
    request<ApiResult>("/api/ocr/reprocess", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  copy: (payload: Record<string, unknown>) =>
    request<ApiResult>("/api/copy", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  paste: (payload: Record<string, unknown>) =>
    request<ApiResult>("/api/paste", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  openAi: (provider: string) =>
    request<ApiResult>("/api/open-ai", {
      method: "POST",
      body: JSON.stringify({ provider }),
    }),
  openImage: (imagePath: string) =>
    request<ApiResult>("/api/open-image", {
      method: "POST",
      body: JSON.stringify({ imagePath }),
    }),
  clearPrivacy: () =>
    request<ApiResult>("/api/privacy/clear", {
      method: "POST",
      body: JSON.stringify({}),
    }),
  diagnostics: () =>
    request<ApiResult>("/api/diagnostics", {
      method: "POST",
      body: JSON.stringify({}),
    }),
  startScroll: (direction: "up" | "down", speed: number) =>
    request<ApiResult>("/api/scroll/start", {
      method: "POST",
      body: JSON.stringify({ direction, speed }),
    }),
  stopScroll: () =>
    request<ApiResult>("/api/scroll/stop", {
      method: "POST",
      body: JSON.stringify({}),
    }),
};
