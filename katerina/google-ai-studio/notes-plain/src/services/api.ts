import { User, Note, CategoryStat, Stats } from '../types.ts';

// Helper to handle fetch responses and throw clear error messages
async function handleResponse<T>(res: Response): Promise<T> {
  const contentType = res.headers.get('content-type');
  let data: any = null;

  if (contentType && contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = { error: await res.text() };
  }

  if (!res.ok) {
    const errorMsg = data?.error || data?.message || `Request failed with status ${res.status}`;
    throw new Error(errorMsg);
  }

  return data as T;
}

export const api = {
  // ==================== AUTH ====================
  async getMe(): Promise<{ user: User | null }> {
    try {
      const res = await fetch('/api/auth/me', {
        headers: { 'Accept': 'application/json' },
      });
      if (res.status === 401) {
        return { user: null };
      }
      return await handleResponse<{ user: User }>(res);
    } catch {
      return { user: null };
    }
  },

  async login(username: string, password: string): Promise<{ user: User; token: string }> {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    return handleResponse<{ user: User; token: string }>(res);
  },

  async register(username: string, password: string, email?: string): Promise<{ user: User; token: string }> {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, email }),
    });
    return handleResponse<{ user: User; token: string }>(res);
  },

  async logout(): Promise<void> {
    const res = await fetch('/api/auth/logout', {
      method: 'POST',
    });
    await handleResponse<{ message: string }>(res);
  },

  // ==================== NOTES ====================
  async getNotes(params?: { search?: string; category?: string; pinned?: boolean }): Promise<{ notes: Note[] }> {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.category && params.category !== 'All') query.set('category', params.category);
    if (params?.pinned) query.set('pinned', 'true');

    const qs = query.toString() ? `?${query.toString()}` : '';
    const res = await fetch(`/api/notes${qs}`, {
      headers: { 'Accept': 'application/json' },
    });
    return handleResponse<{ notes: Note[] }>(res);
  },

  async getNote(id: number): Promise<{ note: Note }> {
    const res = await fetch(`/api/notes/${id}`, {
      headers: { 'Accept': 'application/json' },
    });
    return handleResponse<{ note: Note }>(res);
  },

  async createNote(data: {
    title: string;
    content: string;
    category?: string;
    is_pinned?: boolean | number;
  }): Promise<{ note: Note }> {
    const res = await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<{ note: Note }>(res);
  },

  async updateNote(
    id: number,
    data: {
      title?: string;
      content?: string;
      category?: string;
      is_pinned?: boolean | number;
    }
  ): Promise<{ note: Note }> {
    const res = await fetch(`/api/notes/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<{ note: Note }>(res);
  },

  async deleteNote(id: number): Promise<{ success: boolean }> {
    const res = await fetch(`/api/notes/${id}`, {
      method: 'DELETE',
    });
    return handleResponse<{ success: boolean }>(res);
  },

  // ==================== CATEGORIES & STATS ====================
  async getCategories(): Promise<{ categories: CategoryStat[] }> {
    const res = await fetch('/api/categories', {
      headers: { 'Accept': 'application/json' },
    });
    return handleResponse<{ categories: CategoryStat[] }>(res);
  },

  async getStats(): Promise<Stats> {
    const res = await fetch('/api/stats', {
      headers: { 'Accept': 'application/json' },
    });
    return handleResponse<Stats>(res);
  },
};
