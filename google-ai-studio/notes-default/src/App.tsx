import React, { useState, useEffect, useCallback } from 'react';
import { Menu, Plus } from 'lucide-react';
import { User, Note, CategoryStat } from './types.ts';
import { api } from './services/api.ts';
import { AuthModal } from './components/AuthModal.tsx';
import { Sidebar } from './components/Sidebar.tsx';
import { NoteEditor } from './components/NoteEditor.tsx';
import { EmptyState } from './components/EmptyState.tsx';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedNoteId, setSelectedNoteId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [categories, setCategories] = useState<CategoryStat[]>([]);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Check initial session
  useEffect(() => {
    async function checkAuth() {
      try {
        const { user: currentUser } = await api.getMe();
        setUser(currentUser);
      } catch (err) {
        console.error('Session check error:', err);
        setUser(null);
      } finally {
        setInitialLoading(false);
      }
    }
    checkAuth();
  }, []);

  // Fetch categories
  const refreshCategories = useCallback(async () => {
    if (!user) return;
    try {
      const data = await api.getCategories();
      setCategories(data.categories);
    } catch (err) {
      console.error('Failed to load categories:', err);
    }
  }, [user]);

  // Fetch notes
  const fetchNotes = useCallback(async () => {
    if (!user) return;
    try {
      const data = await api.getNotes({
        search: searchQuery,
        category: selectedCategory,
      });
      setNotes(data.notes);

      // If currently selected note is not in list, or no note selected yet and list has notes
      if (selectedNoteId !== null) {
        const stillExists = data.notes.some((n) => n.id === selectedNoteId);
        if (!stillExists && data.notes.length > 0) {
          setSelectedNoteId(data.notes[0].id);
        } else if (!stillExists) {
          setSelectedNoteId(null);
        }
      }
    } catch (err) {
      console.error('Failed to load notes:', err);
    }
  }, [user, searchQuery, selectedCategory, selectedNoteId]);

  useEffect(() => {
    if (user) {
      fetchNotes();
      refreshCategories();
    }
  }, [user, searchQuery, selectedCategory, refreshCategories]);

  // Create new blank note
  const handleCreateBlankNote = async () => {
    try {
      const defaultCategory = selectedCategory !== 'All' ? selectedCategory : 'General';
      const { note } = await api.createNote({
        title: 'Untitled Note',
        content: '',
        category: defaultCategory,
      });

      setNotes((prev) => [note, ...prev]);
      setSelectedNoteId(note.id);
      refreshCategories();
    } catch (err) {
      console.error('Failed to create note:', err);
    }
  };

  // Create note from template
  const handleCreateWithTemplate = async (title: string, content: string, category: string) => {
    try {
      const { note } = await api.createNote({
        title,
        content,
        category,
      });

      setNotes((prev) => [note, ...prev]);
      setSelectedNoteId(note.id);
      refreshCategories();
    } catch (err) {
      console.error('Failed to create templated note:', err);
    }
  };

  // Update existing note
  const handleUpdateNote = async (id: number, data: Partial<Note>) => {
    try {
      const { note: updatedNote } = await api.updateNote(id, data);
      setNotes((prev) =>
        prev.map((n) => (n.id === id ? { ...n, ...updatedNote } : n))
      );
      if (data.category) {
        refreshCategories();
      }
    } catch (err) {
      console.error('Failed to update note:', err);
      throw err;
    }
  };

  // Toggle pin
  const handleTogglePin = async (id: number, currentPinned: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const nextVal = currentPinned ? 0 : 1;
    try {
      const { note: updatedNote } = await api.updateNote(id, { is_pinned: nextVal });
      setNotes((prev) => {
        const nextList = prev.map((n) => (n.id === id ? { ...n, ...updatedNote } : n));
        return [...nextList].sort((a, b) => {
          if (b.is_pinned !== a.is_pinned) return b.is_pinned - a.is_pinned;
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        });
      });
    } catch (err) {
      console.error('Failed to toggle pin:', err);
    }
  };

  // Delete note
  const handleDeleteNote = async (id: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await api.deleteNote(id);
      setNotes((prev) => prev.filter((n) => n.id !== id));
      if (selectedNoteId === id) {
        const remaining = notes.filter((n) => n.id !== id);
        setSelectedNoteId(remaining.length > 0 ? remaining[0].id : null);
      }
      refreshCategories();
    } catch (err) {
      console.error('Failed to delete note:', err);
    }
  };

  // Logout
  const handleLogout = async () => {
    try {
      await api.logout();
    } finally {
      setUser(null);
      setNotes([]);
      setSelectedNoteId(null);
    }
  };

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        handleCreateBlankNote();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedCategory]);

  if (initialLoading) {
    return (
      <div className="min-h-screen bg-stone-900 flex items-center justify-center text-stone-400">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-medium">Opening secure vault...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthModal onSuccess={(newUser) => setUser(newUser)} />;
  }

  const selectedNote = notes.find((n) => n.id === selectedNoteId) || null;
  const distinctCategoryNames = Array.from(new Set(['General', 'Work', 'Personal', 'Ideas', ...categories.map((c) => c.category)]));

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-stone-950 font-sans antialiased text-stone-100">
      {/* Mobile Top Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-14 bg-stone-900 border-b border-stone-800 z-30 flex items-center justify-between px-4">
        <button
          onClick={() => setMobileMenuOpen(true)}
          className="p-2 text-stone-300 hover:text-stone-100 rounded-lg hover:bg-stone-800"
        >
          <Menu className="w-5 h-5" />
        </button>
        <span className="font-serif font-bold text-base tracking-tight text-amber-400">VaultNotes</span>
        <button
          onClick={handleCreateBlankNote}
          className="p-2 text-amber-400 hover:text-amber-300 rounded-lg hover:bg-stone-800"
          title="New Note"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      {/* Mobile Drawer Backdrop */}
      {mobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-xs z-40 transition-opacity"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar (Desktop permanent, Mobile overlay drawer) */}
      <div
        className={`fixed md:static inset-y-0 left-0 z-50 md:z-auto transform md:transform-none transition-transform duration-300 ease-in-out ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        <Sidebar
          user={user}
          notes={notes}
          selectedNoteId={selectedNoteId}
          onSelectNote={(note) => setSelectedNoteId(note.id)}
          onCreateNote={handleCreateBlankNote}
          onDeleteNote={(id, e) => handleDeleteNote(id, e)}
          onTogglePin={handleTogglePin}
          onLogout={handleLogout}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          selectedCategory={selectedCategory}
          onSelectCategory={setSelectedCategory}
          categories={categories}
          onCloseMobile={() => setMobileMenuOpen(false)}
        />
      </div>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full overflow-hidden pt-14 md:pt-0">
        {selectedNote ? (
          <NoteEditor
            key={selectedNote.id}
            note={selectedNote}
            onUpdate={handleUpdateNote}
            onDelete={handleDeleteNote}
            categories={distinctCategoryNames}
          />
        ) : (
          <EmptyState
            onCreateBlank={handleCreateBlankNote}
            onCreateWithTemplate={handleCreateWithTemplate}
          />
        )}
      </main>
    </div>
  );
}
