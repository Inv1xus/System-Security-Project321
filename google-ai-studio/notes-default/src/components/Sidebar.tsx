import React from 'react';
import { 
  Plus, 
  Search, 
  Pin, 
  LogOut, 
  Tag, 
  FileText, 
  Trash2, 
  Folder, 
  Database,
  X
} from 'lucide-react';
import { Note, User, CategoryStat } from '../types.ts';

interface SidebarProps {
  user: User;
  notes: Note[];
  selectedNoteId: number | null;
  onSelectNote: (note: Note) => void;
  onCreateNote: () => void;
  onDeleteNote: (id: number, e: React.MouseEvent) => void;
  onTogglePin: (id: number, currentPinned: number, e: React.MouseEvent) => void;
  onLogout: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  selectedCategory: string;
  onSelectCategory: (cat: string) => void;
  categories: CategoryStat[];
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  user,
  notes,
  selectedNoteId,
  onSelectNote,
  onCreateNote,
  onDeleteNote,
  onTogglePin,
  onLogout,
  searchQuery,
  onSearchChange,
  selectedCategory,
  onSelectCategory,
  categories,
  onCloseMobile,
}) => {
  // Format dates cleanly
  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);

      if (diffHours < 24 && d.getDate() === now.getDate()) {
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
      return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const pinnedNotes = notes.filter((n) => n.is_pinned === 1);
  const otherNotes = notes.filter((n) => n.is_pinned !== 1);

  return (
    <aside className="w-80 h-full flex flex-col bg-stone-900 border-r border-stone-800 text-stone-200 select-none">
      {/* User Header */}
      <div className="p-4 border-b border-stone-800 flex items-center justify-between bg-stone-950/40">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 font-bold flex items-center justify-center border border-amber-500/30 text-sm shrink-0">
            {user.username.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-stone-100 text-sm truncate flex items-center gap-1.5">
              <span>{user.username}</span>
            </div>
            <div className="text-xs text-stone-400 truncate">
              {notes.length} {notes.length === 1 ? 'note' : 'notes'} in vault
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {onCloseMobile && (
            <button
              onClick={onCloseMobile}
              className="p-1.5 text-stone-400 hover:text-stone-200 rounded-lg hover:bg-stone-800 md:hidden"
              title="Close menu"
            >
              <X className="w-5 h-5" />
            </button>
          )}
          <button
            onClick={onLogout}
            title="Log Out"
            className="p-1.5 text-stone-400 hover:text-amber-400 rounded-lg hover:bg-stone-800 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Action: Create New Note */}
      <div className="p-3">
        <button
          onClick={onCreateNote}
          className="w-full py-2.5 px-3.5 bg-amber-500 hover:bg-amber-400 active:bg-amber-600 text-stone-950 font-semibold text-sm rounded-xl transition-all shadow flex items-center justify-center gap-2"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>New Note</span>
        </button>
      </div>

      {/* Search Bar */}
      <div className="px-3 pb-2">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search notes or text..."
            className="w-full pl-9 pr-8 py-2 bg-stone-950/60 border border-stone-800 rounded-xl text-stone-200 placeholder-stone-500 text-xs focus:outline-none focus:ring-1 focus:ring-amber-500/60 focus:border-amber-500/60"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-300"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Category Filter Pills */}
      <div className="px-3 py-1 flex items-center gap-1.5 overflow-x-auto no-scrollbar border-b border-stone-800/60 pb-2.5">
        <button
          onClick={() => onSelectCategory('All')}
          className={`px-2.5 py-1 text-xs rounded-lg transition-colors whitespace-nowrap flex items-center gap-1 ${
            selectedCategory === 'All'
              ? 'bg-stone-800 text-amber-400 font-medium'
              : 'text-stone-400 hover:text-stone-200 hover:bg-stone-850'
          }`}
        >
          <Folder className="w-3 h-3" />
          All ({notes.length})
        </button>
        {categories.map((c) => (
          <button
            key={c.category}
            onClick={() => onSelectCategory(c.category)}
            className={`px-2.5 py-1 text-xs rounded-lg transition-colors whitespace-nowrap flex items-center gap-1 ${
              selectedCategory === c.category
                ? 'bg-stone-800 text-amber-400 font-medium'
                : 'text-stone-400 hover:text-stone-200 hover:bg-stone-850'
            }`}
          >
            <Tag className="w-3 h-3" />
            {c.category} ({c.count})
          </button>
        ))}
      </div>

      {/* Notes List */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
        {notes.length === 0 ? (
          <div className="text-center py-12 px-4 text-stone-500 text-xs">
            <FileText className="w-8 h-8 mx-auto mb-2 opacity-40 text-stone-400" />
            {searchQuery
              ? `No notes matching "${searchQuery}"`
              : 'No notes found. Create your first note above!'}
          </div>
        ) : (
          <>
            {pinnedNotes.length > 0 && (
              <div className="mb-2">
                <div className="px-2 py-1 text-[10px] font-bold tracking-wider text-amber-500/80 uppercase flex items-center gap-1">
                  <Pin className="w-3 h-3 fill-amber-500/80" />
                  Pinned
                </div>
                {pinnedNotes.map((note) => renderNoteCard(note))}
              </div>
            )}

            {otherNotes.length > 0 && (
              <div>
                {pinnedNotes.length > 0 && (
                  <div className="px-2 py-1 text-[10px] font-bold tracking-wider text-stone-500 uppercase">
                    Notes
                  </div>
                )}
                {otherNotes.map((note) => renderNoteCard(note))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Database & System Footer */}
      <div className="p-3 border-t border-stone-800/80 bg-stone-950/60 text-[11px] text-stone-400 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-stone-400">
          <Database className="w-3.5 h-3.5 text-emerald-500" />
          <span>SQLite • Port 3000</span>
        </div>
        <span className="text-[10px] bg-stone-800 px-1.5 py-0.5 rounded text-stone-400">
          v1.0.0
        </span>
      </div>
    </aside>
  );

  function renderNoteCard(note: Note) {
    const isSelected = selectedNoteId === note.id;

    // Clean plain text excerpt from markdown content
    const excerpt = note.content
      ? note.content.replace(/[#*`_>[\]-]/g, '').trim().substring(0, 75)
      : 'No additional text';

    return (
      <div
        key={note.id}
        onClick={() => {
          onSelectNote(note);
          if (onCloseMobile) onCloseMobile();
        }}
        className={`group relative p-3 rounded-xl cursor-pointer transition-all border ${
          isSelected
            ? 'bg-stone-800/90 border-amber-500/50 shadow-sm text-stone-100'
            : 'bg-stone-900/60 border-transparent hover:bg-stone-850 hover:border-stone-800 text-stone-300'
        }`}
      >
        <div className="flex items-start justify-between gap-1 mb-1">
          <h3 className="font-semibold text-sm truncate flex-1 text-stone-100">
            {note.title || 'Untitled Note'}
          </h3>
          <div className="flex items-center gap-1 shrink-0 opacity-80 group-hover:opacity-100">
            <button
              onClick={(e) => onTogglePin(note.id, note.is_pinned, e)}
              className={`p-1 rounded hover:bg-stone-700/60 transition-colors ${
                note.is_pinned ? 'text-amber-400' : 'text-stone-500 hover:text-stone-300'
              }`}
              title={note.is_pinned ? 'Unpin note' : 'Pin note to top'}
            >
              <Pin className={`w-3.5 h-3.5 ${note.is_pinned ? 'fill-amber-400' : ''}`} />
            </button>
            <button
              onClick={(e) => onDeleteNote(note.id, e)}
              className="p-1 rounded text-stone-500 hover:text-red-400 hover:bg-stone-700/60 transition-colors"
              title="Delete note"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <p className="text-xs text-stone-400 line-clamp-2 leading-relaxed mb-2 font-normal">
          {excerpt}
        </p>

        <div className="flex items-center justify-between text-[11px] text-stone-500">
          <span className="bg-stone-950/60 border border-stone-800/80 px-2 py-0.5 rounded text-[10px] text-stone-400">
            {note.category || 'General'}
          </span>
          <span>{formatDate(note.updated_at)}</span>
        </div>
      </div>
    );
  }
};
