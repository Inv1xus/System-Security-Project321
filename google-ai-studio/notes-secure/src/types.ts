export interface User {
  id: string;
  username: string;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  isPinned: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface AuthSessionResponse {
  user: User;
  csrfToken: string;
}

export type NoteFilter = 'all' | 'pinned';
