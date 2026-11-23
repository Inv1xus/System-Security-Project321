import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ApiError,
  createNote,
  deleteNote,
  fetchNotes,
  getCurrentSession,
  logout,
  togglePinNote,
  updateNote,
} from './api';
import { AuthView } from './components/AuthView';
import { ConfirmDialog } from './components/ConfirmDialog';
import { NoteEditor } from './components/NoteEditor';
import { Sidebar } from './components/Sidebar';
import type { Note, NoteFilter, User } from './types';

type PendingNavigation =
  | { type: 'select'; note: Note }
  | { type: 'new' }
  | { type: 'back' }
  | { type: 'cancel' };

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  const [notes, setNotes] = useState<Note[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<NoteFilter>('all');

  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const [mobileShowEditor, setMobileShowEditor] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [deletingNote, setDeletingNote] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [editorError, setEditorError] = useState<string | null>(null);

  const [noteToDelete, setNoteToDelete] = useState<Note | null>(null);
  const [pendingNav, setPendingNav] = useState<PendingNavigation | null>(null);

  const loadUserNotes = useCallback(async () => {
    setLoadingNotes(true);
    try {
      const list = await fetchNotes();
      setNotes(list);
      setSelectedNoteId((prev) => {
        if (prev && list.some((n) => n.id === prev)) {
          return prev;
        }
        return list[0]?.id ?? null;
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setUser(null);
      } else {
        setEditorError('Failed to load your notes.');
      }
    } finally {
      setLoadingNotes(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    getCurrentSession()
      .then((session) => {
        if (!active) return;
        if (session) {
          setUser(session.user);
        }
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setCheckingSession(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (user) {
      void loadUserNotes();
    } else {
      setNotes([]);
      setSelectedNoteId(null);
      setIsCreatingNew(false);
      setIsEditing(false);
      setIsDirty(false);
      setSearchQuery('');
      setFilter('all');
      setEditorError(null);
    }
  }, [user, loadUserNotes]);

  const selectedNote = useMemo(
    () => notes.find((n) => n.id === selectedNoteId) ?? null,
    [notes, selectedNoteId]
  );

  const pinnedCount = useMemo(
    () => notes.filter((n) => n.isPinned).length,
    [notes]
  );

  const filteredNotes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return notes.filter((note) => {
      if (filter === 'pinned' && !note.isPinned) {
        return false;
      }
      if (!q) {
        return true;
      }
      return (
        note.title.toLowerCase().includes(q) || note.content.toLowerCase().includes(q)
      );
    });
  }, [notes, searchQuery, filter]);

  const executeNavigation = useCallback((action: PendingNavigation) => {
    setEditorError(null);
    setIsDirty(false);
    if (action.type === 'select') {
      setIsCreatingNew(false);
      setIsEditing(false);
      setSelectedNoteId(action.note.id);
      setMobileShowEditor(true);
    } else if (action.type === 'new') {
      setIsCreatingNew(true);
      setIsEditing(false);
      setMobileShowEditor(true);
    } else if (action.type === 'back') {
      setIsCreatingNew(false);
      setIsEditing(false);
      setMobileShowEditor(false);
    } else if (action.type === 'cancel') {
      setIsCreatingNew(false);
      setIsEditing(false);
    }
  }, []);

  const requestNavigation = useCallback(
    (action: PendingNavigation) => {
      if ((isCreatingNew || isEditing) && isDirty) {
        setPendingNav(action);
        return;
      }
      executeNavigation(action);
    },
    [isCreatingNew, isEditing, isDirty, executeNavigation]
  );

  const handleSaveNote = useCallback(
    async (payload: { title: string; content: string }) => {
      setEditorError(null);
      if (payload.title.trim().length === 0 && payload.content.trim().length === 0) {
        setEditorError('Please enter a title or write some content before saving.');
        return;
      }

      setSavingNote(true);
      try {
        if (isCreatingNew) {
          const created = await createNote(payload);
          setNotes((prev) => [created, ...prev]);
          setSelectedNoteId(created.id);
          setIsCreatingNew(false);
          setIsEditing(false);
          setIsDirty(false);
        } else if (selectedNote) {
          const updated = await updateNote(selectedNote.id, payload);
          setNotes((prev) => {
            const next = prev.map((n) => (n.id === updated.id ? updated : n));
            next.sort((a, b) => {
              if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
              return b.updatedAt - a.updatedAt;
            });
            return next;
          });
          setIsEditing(false);
          setIsDirty(false);
        }
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 401) {
            setUser(null);
            return;
          }
          setEditorError(err.message);
        } else {
          setEditorError('Failed to save note. Please try again.');
        }
      } finally {
        setSavingNote(false);
      }
    },
    [isCreatingNew, selectedNote]
  );

  const handleTogglePin = useCallback(async (note: Note) => {
    setEditorError(null);
    try {
      const updated = await togglePinNote(note.id, !note.isPinned);
      setNotes((prev) => {
        const next = prev.map((n) => (n.id === updated.id ? updated : n));
        next.sort((a, b) => {
          if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
          return b.updatedAt - a.updatedAt;
        });
        return next;
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setUser(null);
        return;
      }
      setEditorError('Unable to update pin state.');
    }
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (!noteToDelete) return;
    setDeletingNote(true);
    setEditorError(null);
    try {
      await deleteNote(noteToDelete.id);
      setNotes((prev) => {
        const remaining = prev.filter((n) => n.id !== noteToDelete.id);
        if (selectedNoteId === noteToDelete.id) {
          setSelectedNoteId(remaining[0]?.id ?? null);
          setIsEditing(false);
          setMobileShowEditor(false);
        }
        return remaining;
      });
      setNoteToDelete(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setUser(null);
        return;
      }
      setEditorError(err instanceof ApiError ? err.message : 'Unable to delete note.');
      setNoteToDelete(null);
    } finally {
      setDeletingNote(false);
    }
  }, [noteToDelete, selectedNoteId]);

  const handleLogout = useCallback(async () => {
    setLoggingOut(true);
    try {
      await logout();
    } catch {
      // Clear local session state even if server session already expired
    } finally {
      setLoggingOut(false);
      setUser(null);
    }
  }, []);

  if (checkingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-600">
        Loading workspace...
      </div>
    );
  }

  if (!user) {
    return <AuthView onAuthenticated={(authenticatedUser) => setUser(authenticatedUser)} />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-900">
      <div className={`${mobileShowEditor ? 'hidden md:flex' : 'flex'} w-full md:w-auto`}>
        <Sidebar
          user={user}
          notes={filteredNotes}
          totalNoteCount={notes.length}
          pinnedNoteCount={pinnedCount}
          selectedNoteId={selectedNoteId}
          isCreatingNew={isCreatingNew}
          searchQuery={searchQuery}
          filter={filter}
          loading={loadingNotes}
          loggingOut={loggingOut}
          onSearchChange={setSearchQuery}
          onFilterChange={setFilter}
          onSelectNote={(note) => requestNavigation({ type: 'select', note })}
          onStartNewNote={() => requestNavigation({ type: 'new' })}
          onLogout={() => void handleLogout()}
        />
      </div>

      <main className={`${mobileShowEditor ? 'flex' : 'hidden md:flex'} min-w-0 flex-1 flex-col`}>
        <NoteEditor
          note={selectedNote}
          isCreatingNew={isCreatingNew}
          isEditing={isEditing}
          saving={savingNote}
          deleting={deletingNote}
          error={editorError}
          onStartNewNote={() => requestNavigation({ type: 'new' })}
          onEnterEdit={() => {
            setEditorError(null);
            setIsEditing(true);
          }}
          onCancelEdit={() => requestNavigation({ type: 'cancel' })}
          onSave={handleSaveNote}
          onTogglePin={handleTogglePin}
          onRequestDelete={(note) => setNoteToDelete(note)}
          onBackToList={() => requestNavigation({ type: 'back' })}
          onDirtyChange={setIsDirty}
        />
      </main>

      <ConfirmDialog
        open={noteToDelete !== null}
        title="Delete note"
        description={
          noteToDelete
            ? `Are you sure you want to permanently delete "${noteToDelete.title}"? This action cannot be undone.`
            : ''
        }
        confirmLabel="Delete note"
        destructive
        busy={deletingNote}
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => setNoteToDelete(null)}
      />

      <ConfirmDialog
        open={pendingNav !== null}
        title="Discard unsaved changes?"
        description="You have unsaved edits in the current note. Leaving now will discard them."
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        destructive
        onConfirm={() => {
          if (pendingNav) {
            executeNavigation(pendingNav);
          }
          setPendingNav(null);
        }}
        onCancel={() => setPendingNav(null)}
      />
    </div>
  );
}
