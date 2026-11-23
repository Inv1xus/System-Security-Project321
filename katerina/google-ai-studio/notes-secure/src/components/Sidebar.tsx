import { LogOut, Pin, Plus, Search, X } from 'lucide-react';
import type { Note, NoteFilter, User } from '../types';

interface SidebarProps {
  user: User;
  notes: Note[];
  totalNoteCount: number;
  pinnedNoteCount: number;
  selectedNoteId: string | null;
  isCreatingNew: boolean;
  searchQuery: string;
  filter: NoteFilter;
  loading: boolean;
  loggingOut: boolean;
  onSearchChange: (value: string) => void;
  onFilterChange: (filter: NoteFilter) => void;
  onSelectNote: (note: Note) => void;
  onStartNewNote: () => void;
  onLogout: () => void;
}

function formatShortDate(timestamp: number): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(new Date(timestamp));
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function Sidebar({
  user,
  notes,
  totalNoteCount,
  pinnedNoteCount,
  selectedNoteId,
  isCreatingNew,
  searchQuery,
  filter,
  loading,
  loggingOut,
  onSearchChange,
  onFilterChange,
  onSelectNote,
  onStartNewNote,
  onLogout,
}: SidebarProps) {
  return (
    <aside className="flex h-full w-full flex-col border-r border-slate-200 bg-white md:w-72 lg:w-80">
      {/* Sidebar header */}
      <div className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-4">
        <span className="font-display text-xl font-semibold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
          Folio
        </span>
        <button
          type="button"
          onClick={onStartNewNote}
          className="inline-flex min-h-[36px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-blue-700 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-1"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden="true" />
          <span>New note</span>
        </button>
      </div>

      {/* Search and filter controls */}
      <div className="shrink-0 space-y-3 border-b border-slate-200 p-3.5">
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search notes..."
            aria-label="Search notes"
            className="block min-h-[38px] w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pr-8 pl-9 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-700/15"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              aria-label="Clear search"
              className="absolute inset-y-0 right-0 flex w-8 items-center justify-center text-slate-400 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>

        <div
          className="grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1"
          role="tablist"
          aria-label="Filter notes"
        >
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'all'}
            onClick={() => onFilterChange('all')}
            className={`min-h-[32px] whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 ${
              filter === 'all'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All <span className="font-mono tabular-nums text-slate-500">({totalNoteCount})</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'pinned'}
            onClick={() => onFilterChange('pinned')}
            className={`min-h-[32px] whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 ${
              filter === 'pinned'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Pinned{' '}
            <span className="font-mono tabular-nums text-slate-500">({pinnedNoteCount})</span>
          </button>
        </div>
      </div>

      {/* Notes list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="divide-y divide-slate-100" aria-label="Loading notes">
            {[0, 1, 2, 3].map((row) => (
              <div key={row} className="space-y-2 px-4 py-3.5">
                <div className="h-4 w-3/5 animate-pulse rounded bg-slate-200" />
                <div className="h-3 w-4/5 animate-pulse rounded bg-slate-100" />
                <div className="h-3 w-2/5 animate-pulse rounded bg-slate-100" />
              </div>
            ))}
          </div>
        ) : notes.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <p className="text-sm font-medium text-slate-800">
              {searchQuery
                ? 'No matching notes'
                : filter === 'pinned'
                  ? 'No pinned notes'
                  : 'No notes yet'}
            </p>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-500">
              {searchQuery
                ? 'Try a different keyword or clear your search filter.'
                : filter === 'pinned'
                  ? 'Pin important notes to keep them at the top of your list.'
                  : 'Create your first private note to get started.'}
            </p>
            {searchQuery ? (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="mt-4 inline-flex min-h-[36px] items-center rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
              >
                Clear search
              </button>
            ) : filter === 'all' ? (
              <button
                type="button"
                onClick={onStartNewNote}
                className="mt-4 inline-flex min-h-[36px] items-center rounded-lg bg-blue-700 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
              >
                Create your first note
              </button>
            ) : null}
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {notes.map((note) => {
              const isSelected = !isCreatingNew && selectedNoteId === note.id;
              const preview = note.content.replace(/\s+/g, ' ').trim();
              const words = countWords(note.content);

              return (
                <li key={note.id}>
                  <button
                    type="button"
                    onClick={() => onSelectNote(note)}
                    className={`block w-full px-4 py-3.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-700 ${
                      isSelected ? 'bg-slate-100' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-slate-900">
                        {note.title || 'Untitled note'}
                      </span>
                      {note.isPinned && (
                        <Pin
                          className="h-3.5 w-3.5 shrink-0 text-blue-700"
                          aria-label="Pinned"
                        />
                      )}
                    </div>
                    <p className="mt-1 truncate text-xs text-slate-600">
                      {preview || 'No additional text'}
                    </p>
                    <div className="mt-1.5 flex items-center gap-1.5 font-mono text-[11px] tabular-nums text-slate-500">
                      <span>{formatShortDate(note.updatedAt)}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {words} {words === 1 ? 'word' : 'words'}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Account footer */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/70 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-900">@{user.username}</p>
          <p className="font-mono text-xs tabular-nums text-slate-500">
            {totalNoteCount} {totalNoteCount === 1 ? 'note' : 'notes'}
          </p>
        </div>
        <button
          type="button"
          onClick={onLogout}
          disabled={loggingOut}
          className="inline-flex min-h-[36px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 disabled:opacity-60"
        >
          <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
          <span>{loggingOut ? 'Logging out...' : 'Log out'}</span>
        </button>
      </div>
    </aside>
  );
}
