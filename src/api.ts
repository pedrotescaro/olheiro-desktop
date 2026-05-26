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
    const message = await response.text();
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
