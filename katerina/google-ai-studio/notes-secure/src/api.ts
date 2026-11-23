import type { AuthSessionResponse, Note } from './types';

let csrfToken: string | null = null;

export function setCsrfToken(token: string | null): void {
  csrfToken = token;
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function request<T>(
  path: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    body?: unknown;
    includeCsrf?: boolean;
  } = {}
): Promise<T> {
  const { method = 'GET', body, includeCsrf = false } = options;
  const headers: Record<string, string> = {};

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  if (includeCsrf && csrfToken) {
    headers['X-CSRF-Token'] = csrfToken;
  }

  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = (await response.json().catch(() => ({}))) as { error?: string } & T;

  if (!response.ok) {
    throw new ApiError(data.error || 'Request failed. Please try again.', response.status);
  }

  return data;
}

export async function getCurrentSession(): Promise<AuthSessionResponse | null> {
  try {
    const data = await request<AuthSessionResponse>('/api/auth/me');
    setCsrfToken(data.csrfToken);
    return data;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      setCsrfToken(null);
      return null;
    }
    throw err;
  }
}

export async function signup(username: string, password: string): Promise<AuthSessionResponse> {
  const data = await request<AuthSessionResponse>('/api/auth/signup', {
    method: 'POST',
    body: { username, password },
  });
  setCsrfToken(data.csrfToken);
  return data;
}

export async function login(username: string, password: string): Promise<AuthSessionResponse> {
  const data = await request<AuthSessionResponse>('/api/auth/login', {
    method: 'POST',
    body: { username, password },
  });
  setCsrfToken(data.csrfToken);
  return data;
}

export async function logout(): Promise<void> {
  await request<{ ok: boolean }>('/api/auth/logout', {
    method: 'POST',
    includeCsrf: true,
  });
  setCsrfToken(null);
}

export async function fetchNotes(params?: { q?: string; pinned?: boolean }): Promise<Note[]> {
  const search = new URLSearchParams();
  if (params?.q) {
    search.set('q', params.q);
  }
  if (params?.pinned) {
    search.set('pinned', 'true');
  }
  const qs = search.toString();
  const data = await request<{ notes: Note[] }>(`/api/notes${qs ? `?${qs}` : ''}`);
  return data.notes;
}

export async function createNote(payload: {
  title: string;
  content: string;
  isPinned?: boolean;
}): Promise<Note> {
  const data = await request<{ note: Note }>('/api/notes', {
    method: 'POST',
    body: payload,
    includeCsrf: true,
  });
  return data.note;
}

export async function updateNote(
  id: string,
  payload: { title: string; content: string; isPinned?: boolean }
): Promise<Note> {
  const data = await request<{ note: Note }>(`/api/notes/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: payload,
    includeCsrf: true,
  });
  return data.note;
}

export async function togglePinNote(id: string, isPinned: boolean): Promise<Note> {
  const data = await request<{ note: Note }>(`/api/notes/${encodeURIComponent(id)}/pin`, {
    method: 'PATCH',
    body: { isPinned },
    includeCsrf: true,
  });
  return data.note;
}

export async function deleteNote(id: string): Promise<void> {
  await request<{ deleted: boolean }>(`/api/notes/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    includeCsrf: true,
  });
}
