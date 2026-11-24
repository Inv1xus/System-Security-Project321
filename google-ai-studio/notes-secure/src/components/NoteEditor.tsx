import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  Edit3,
  FileText,
  Pin,
  PinOff,
  Plus,
  Trash2,
} from 'lucide-react';
import type { Note } from '../types';

interface NoteEditorProps {
  note: Note | null;
  isCreatingNew: boolean;
  isEditing: boolean;
  saving: boolean;
  deleting: boolean;
  error: string | null;
  onStartNewNote: () => void;
  onEnterEdit: () => void;
  onCancelEdit: () => void;
  onSave: (payload: { title: string; content: string }) => Promise<void>;
  onTogglePin: (note: Note) => Promise<void>;
  onRequestDelete: (note: Note) => void;
  onBackToList: () => void;
  onDirtyChange: (dirty: boolean) => void;
}

function formatFullTimestamp(timestamp: number): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp));
}

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

export function NoteEditor({
  note,
  isCreatingNew,
  isEditing,
  saving,
  deleting,
  error,
  onStartNewNote,
  onEnterEdit,
  onCancelEdit,
  onSave,
  onTogglePin,
  onRequestDelete,
  onBackToList,
  onDirtyChange,
}: NoteEditorProps) {
  const [draftTitle, setDraftTitle] = useState('');
  const [draftContent, setDraftContent] = useState('');
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  const editModeActive = isCreatingNew || isEditing;

  useEffect(() => {
    if (isCreatingNew) {
      setDraftTitle('');
      setDraftContent('');
      onDirtyChange(false);
    } else if (note) {
      setDraftTitle(note.title);
      setDraftContent(note.content);
      onDirtyChange(false);
    }
  }, [note?.id, isCreatingNew, isEditing, onDirtyChange]);

  useEffect(() => {
    if (editModeActive) {
      titleInputRef.current?.focus();
    }
  }, [editModeActive, note?.id, isCreatingNew]);

  useEffect(() => {
    if (!editModeActive) {
      onDirtyChange(false);
      return;
    }
    const baseTitle = isCreatingNew ? '' : note?.title ?? '';
    const baseContent = isCreatingNew ? '' : note?.content ?? '';
    const dirty = draftTitle !== baseTitle || draftContent !== baseContent;
    onDirtyChange(dirty);
  }, [draftTitle, draftContent, editModeActive, isCreatingNew, note?.title, note?.content, onDirtyChange]);

  useEffect(() => {
    if (!editModeActive) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        if (!saving) {
          void onSave({ title: draftTitle, content: draftContent });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editModeActive, saving, draftTitle, draftContent, onSave]);

  if (!note && !isCreatingNew) {
    return (
      <div className="flex h-full flex-1 flex-col items-center justify-center bg-slate-50 px-6 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500">
          <FileText className="h-5 w-5" aria-hidden="true" />
        </div>
        <h2 className="mt-4 font-display text-2xl font-medium text-slate-900">
          Select a note or start a new one
        </h2>
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-600">
          Choose an existing note from the list on the left, or create a new private note in your
          workspace.
        </p>
        <button
          type="button"
          onClick={onStartNewNote}
          className="mt-6 inline-flex min-h-[40px] items-center gap-2 whitespace-nowrap rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          <span>New note</span>
        </button>
      </div>
    );
  }

  const activeContent = editModeActive ? draftContent : note?.content ?? '';
  const wordCount = countWords(activeContent);
  const charCount = activeContent.length;

  return (
    <div className="flex h-full flex-1 flex-col bg-slate-50">
      {/* Top workspace action bar */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onBackToList}
            className="inline-flex min-h-[36px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 md:hidden"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Notes</span>
          </button>

          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-sm">
            <span className="hidden text-slate-500 sm:inline">Notes</span>
            <span className="hidden text-slate-400 sm:inline" aria-hidden="true">
              /
            </span>
            <span className="truncate font-medium text-slate-900">
              {isCreatingNew ? 'New note' : note?.title || 'Untitled note'}
            </span>
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {editModeActive ? (
            <>
              <button
                type="button"
                onClick={onCancelEdit}
                disabled={saving}
                className="min-h-[36px] whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void onSave({ title: draftTitle, content: draftContent })}
                disabled={saving}
                className="inline-flex min-h-[36px] items-center gap-1.5 whitespace-nowrap rounded-lg bg-blue-700 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-1 disabled:opacity-60"
              >
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{saving ? 'Saving...' : 'Save note'}</span>
              </button>
            </>
          ) : (
            note && (
              <>
                <button
                  type="button"
                  onClick={() => void onTogglePin(note)}
                  aria-label={note.isPinned ? 'Unpin note' : 'Pin note'}
                  className="inline-flex min-h-[36px] items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
                >
                  {note.isPinned ? (
                    <>
                      <PinOff className="h-3.5 w-3.5" aria-hidden="true" />
                      <span className="hidden sm:inline">Unpin</span>
                    </>
                  ) : (
                    <>
                      <Pin className="h-3.5 w-3.5" aria-hidden="true" />
                      <span className="hidden sm:inline">Pin</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={onEnterEdit}
                  className="inline-flex min-h-[36px] items-center gap-1.5 whitespace-nowrap rounded-lg bg-blue-700 px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-1"
                >
                  <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Edit</span>
                </button>
                <button
                  type="button"
                  onClick={() => onRequestDelete(note)}
                  disabled={deleting}
                  aria-label="Delete note"
                  className="inline-flex min-h-[36px] items-center gap-1.5 whitespace-nowrap rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:border-red-200 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 disabled:opacity-60"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="hidden sm:inline">Delete</span>
                </button>
              </>
            )
          )}
        </div>
      </header>

      {/* Main note reading or editing surface */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full max-w-3xl flex-col px-6 py-8 md:px-10 md:py-10">
          {error && (
            <div
              role="alert"
              className="mb-6 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-800"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          {editModeActive ? (
            <div className="flex flex-1 flex-col">
              <input
                ref={titleInputRef}
                type="text"
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                placeholder="Note title"
                aria-label="Note title"
                maxLength={200}
                className="w-full border-0 border-b border-slate-200 bg-transparent pb-3 font-display text-3xl font-medium tracking-tight text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none"
              />

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 font-mono text-xs tabular-nums text-slate-500">
                <div className="flex items-center gap-2">
                  <span>
                    {wordCount} {wordCount === 1 ? 'word' : 'words'}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>{charCount} chars</span>
                </div>
                <span className="hidden sm:inline">Ctrl/Cmd + S to save</span>
              </div>

              <textarea
                value={draftContent}
                onChange={(e) => setDraftContent(e.target.value)}
                placeholder="Write your note here..."
                aria-label="Note content"
                maxLength={100000}
                className="mt-6 min-h-[420px] w-full flex-1 resize-none border-0 bg-transparent text-[15px] leading-[1.7] text-slate-800 placeholder:text-slate-400 focus:outline-none"
              />
            </div>
          ) : (
            note && (
              <article>
                <h1 className="font-display text-3xl leading-[1.2] font-medium tracking-tight text-balance text-slate-900 sm:text-4xl">
                  {note.title}
                </h1>

                <div className="mt-4 flex flex-wrap items-center gap-2 border-b border-slate-200 pb-5 font-mono text-xs tabular-nums text-slate-500">
                  <span>Updated {formatFullTimestamp(note.updatedAt)}</span>
                  <span aria-hidden="true">·</span>
                  <span>Created {formatFullTimestamp(note.createdAt)}</span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {wordCount} {wordCount === 1 ? 'word' : 'words'}
                  </span>
                  {note.isPinned && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-medium text-blue-700">Pinned</span>
                    </>
                  )}
                </div>

                <div className="mt-7 max-w-[68ch] text-[15px] leading-[1.75] whitespace-pre-wrap text-slate-800">
                  {note.content ? (
                    note.content
                  ) : (
                    <span className="italic text-slate-400">
                      This note has no body text yet. Click Edit to add content.
                    </span>
                  )}
                </div>
              </article>
            )
          )}
        </div>
      </div>
    </div>
  );
}
