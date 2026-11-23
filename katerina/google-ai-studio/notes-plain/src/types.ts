export interface User {
  id: number;
  username: string;
  email?: string | null;
}

export interface Note {
  id: number;
  user_id: number;
  title: string;
  content: string;
  category: string;
  is_pinned: number;
  created_at: string;
  updated_at: string;
}

export interface CategoryStat {
  category: string;
  count: number;
}

export interface Stats {
  totalNotes: number;
  pinnedNotes: number;
}
