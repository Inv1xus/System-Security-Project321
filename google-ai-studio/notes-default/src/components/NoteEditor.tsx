import React, { useState, useEffect, useRef } from 'react';
import { 
  Pin, 
  Trash2, 
  Check, 
  Copy, 
  Download, 
  Eye, 
  Edit3, 
  Columns, 
  Tag, 
  Sparkles,
  AlertCircle
} from 'lucide-react';
import { Note } from '../types.ts';
import { MarkdownView } from './MarkdownView.tsx';

interface NoteEditorProps {
  note: Note;
  onUpdate: (id: number, data: Partial<Note>) => Promise<void>;
  onDelete: (id: number) => void;
  categories: string[];
}

export const NoteEditor: React.FC<NoteEditorProps> = ({
  note,
  onUpdate,
  onDelete,
  categories,
}) => {
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [category, setCategory] = useState(note.category || 'General');
  const [isPinned, setIsPinned] = useState(note.is_pinned === 1);
  const [viewMode, setViewMode] = useState<'edit' | 'preview' | 'split'>('edit');
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [copied, setCopied] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showNewCatInput, setShowNewCatInput] = useState(false);
  const [newCatName, setNewCatName] = useState('');

  // Keep editor synced when selected note changes
  useEffect(() => {
    setTitle(note.title);
    setContent(note.content);
    setCategory(note.category || 'General');
    setIsPinned(note.is_pinned === 1);
    setSaveStatus('saved');
    setShowDeleteConfirm(false);
  }, [note.id]);

  // Debounced auto-save effect
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const triggerSave = (updates: { title?: string; content?: string; category?: string; is_pinned?: number }) => {
    setSaveStatus('saving');
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await onUpdate(note.id, updates);
        setSaveStatus('saved');
      } catch (err) {
        console.error('Failed to autosave note:', err);
        setSaveStatus('unsaved');
      }
    }, 600);
  };

  const handleTitleChange = (val: string) => {
    setTitle(val);
    setSaveStatus('unsaved');
    triggerSave({ title: val, content, category, is_pinned: isPinned ? 1 : 0 });
  };

  const handleContentChange = (val: string) => {
    setContent(val);
    setSaveStatus('unsaved');
    triggerSave({ title, content: val, category, is_pinned: isPinned ? 1 : 0 });
  };

  const handleTogglePin = () => {
    const nextPinned = !isPinned;
    setIsPinned(nextPinned);
    triggerSave({ title, content, category, is_pinned: nextPinned ? 1 : 0 });
  };

  const handleCategoryChange = (newCat: string) => {
    setCategory(newCat);
    triggerSave({ title, content, category: newCat, is_pinned: isPinned ? 1 : 0 });
  };

  const handleAddNewCategory = () => {
    if (newCatName.trim()) {
      handleCategoryChange(newCatName.trim());
      setNewCatName('');
      setShowNewCatInput(false);
    }
  };

  const handleCopy = () => {
    const fullText = `# ${title}\n\n${content}`;
    navigator.clipboard.writeText(fullText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const fullText = `# ${title}\n\n${content}`;
    const blob = new Blob([fullText], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title.toLowerCase().replace(/[^a-z0-9]/g, '_') || 'note'}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const charCount = content.length;

  return (
    <div className="flex-1 flex flex-col h-full bg-stone-950 text-stone-100 overflow-hidden relative">
      {/* Top action toolbar */}
      <div className="border-b border-stone-800 px-6 py-3 flex items-center justify-between gap-4 bg-stone-900/60 backdrop-blur-sm">
        {/* Left: Category & Pin */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Category Dropdown */}
          <div className="relative inline-flex items-center">
            <Tag className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 pointer-events-none" />
            <select
              value={category}
              onChange={(e) => {
                if (e.target.value === '__add_new__') {
                  setShowNewCatInput(true);
                } else {
                  handleCategoryChange(e.target.value);
                }
              }}
              className="bg-stone-850 border border-stone-750 text-stone-200 text-xs rounded-lg pl-7 pr-7 py-1.5 focus:outline-none focus:ring-1 focus:ring-amber-500/60 cursor-pointer appearance-none"
            >
              <option value={category}>{category}</option>
              {categories
                .filter((c) => c !== category)
                .map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              <option value="__add_new__">+ Create new category...</option>
            </select>
          </div>

          {showNewCatInput && (
            <div className="flex items-center gap-1 bg-stone-850 p-1 rounded-lg border border-stone-750">
              <input
                type="text"
                autoFocus
                placeholder="Category name"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddNewCategory();
                  if (e.key === 'Escape') setShowNewCatInput(false);
                }}
                className="bg-stone-900 text-stone-100 text-xs px-2 py-1 rounded border border-stone-700 outline-none w-28"
              />
              <button
                onClick={handleAddNewCategory}
                className="text-xs bg-amber-500 text-stone-950 px-2 py-1 rounded font-medium hover:bg-amber-400"
              >
                Add
              </button>
              <button
                onClick={() => setShowNewCatInput(false)}
                className="text-xs text-stone-400 hover:text-stone-200 px-1"
              >
                ✕
              </button>
            </div>
          )}

          {/* Pin toggle button */}
          <button
            onClick={handleTogglePin}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg border transition-colors ${
              isPinned
                ? 'bg-amber-500/10 border-amber-500/40 text-amber-400'
                : 'bg-stone-850 border-stone-750 text-stone-400 hover:text-stone-200'
            }`}
          >
            <Pin className={`w-3.5 h-3.5 ${isPinned ? 'fill-amber-400' : ''}`} />
            <span>{isPinned ? 'Pinned' : 'Pin'}</span>
          </button>
        </div>

        {/* Right: View Mode, Export, Delete, Save status */}
        <div className="flex items-center gap-2">
          {/* Save Status pill */}
          <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-stone-400 px-2.5 py-1 bg-stone-900 border border-stone-800 rounded-md">
            {saveStatus === 'saving' && (
              <>
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                <span>Saving to SQLite...</span>
              </>
            )}
            {saveStatus === 'saved' && (
              <>
                <Check className="w-3 h-3 text-emerald-400" />
                <span className="text-stone-400">Saved</span>
              </>
            )}
            {saveStatus === 'unsaved' && (
              <>
                <span className="w-2 h-2 rounded-full bg-orange-400" />
                <span>Unsaved</span>
              </>
            )}
          </div>

          {/* View Mode Switcher */}
          <div className="flex items-center bg-stone-850 p-0.5 rounded-lg border border-stone-750">
            <button
              onClick={() => setViewMode('edit')}
              className={`p-1.5 rounded-md text-xs transition-colors ${
                viewMode === 'edit'
                  ? 'bg-stone-750 text-stone-100 shadow'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
              title="Edit Mode"
            >
              <Edit3 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('split')}
              className={`hidden md:block p-1.5 rounded-md text-xs transition-colors ${
                viewMode === 'split'
                  ? 'bg-stone-750 text-stone-100 shadow'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
              title="Split View (Editor & Preview)"
            >
              <Columns className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('preview')}
              className={`p-1.5 rounded-md text-xs transition-colors ${
                viewMode === 'preview'
                  ? 'bg-stone-750 text-stone-100 shadow'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
              title="Rendered Markdown Preview"
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Copy */}
          <button
            onClick={handleCopy}
            className="p-1.5 text-stone-400 hover:text-stone-200 bg-stone-850 hover:bg-stone-750 border border-stone-750 rounded-lg transition-colors"
            title="Copy note text"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>

          {/* Download */}
          <button
            onClick={handleDownload}
            className="p-1.5 text-stone-400 hover:text-stone-200 bg-stone-850 hover:bg-stone-750 border border-stone-750 rounded-lg transition-colors"
            title="Export as Markdown (.md)"
          >
            <Download className="w-3.5 h-3.5" />
          </button>

          {/* Delete */}
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="p-1.5 text-stone-400 hover:text-red-400 bg-stone-850 hover:bg-red-950/40 border border-stone-750 rounded-lg transition-colors"
            title="Delete this note"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Delete confirmation banner */}
      {showDeleteConfirm && (
        <div className="bg-red-950/80 border-b border-red-800/80 px-6 py-2.5 flex items-center justify-between text-xs text-red-200 z-20">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400" />
            <span>Are you sure you want to permanently delete <strong>"{title || 'Untitled'}"</strong>?</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onDelete(note.id)}
              className="bg-red-600 hover:bg-red-500 text-white font-medium px-3 py-1 rounded"
            >
              Yes, Delete
            </button>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="bg-stone-800 hover:bg-stone-700 text-stone-300 px-3 py-1 rounded"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Title Input */}
      <div className="px-8 pt-6 pb-2">
        <input
          type="text"
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="Untitled Note"
          className="w-full bg-transparent text-2xl md:text-3xl font-bold font-serif text-stone-100 placeholder-stone-600 outline-none border-b border-transparent focus:border-stone-800 pb-2 transition-colors"
        />
      </div>

      {/* Content Area according to viewMode */}
      <div className="flex-1 overflow-hidden flex">
        {/* Editor column */}
        {(viewMode === 'edit' || viewMode === 'split') && (
          <div className={`h-full flex flex-col ${viewMode === 'split' ? 'w-1/2 border-r border-stone-800' : 'w-full'}`}>
            <textarea
              value={content}
              onChange={(e) => handleContentChange(e.target.value)}
              placeholder="Write your private note in Markdown or plain text..."
              className="flex-1 w-full p-8 bg-transparent text-stone-200 placeholder-stone-600 font-mono text-sm leading-relaxed resize-none outline-none overflow-y-auto selection:bg-amber-500/30 selection:text-amber-100"
            />
          </div>
        )}

        {/* Preview column */}
        {(viewMode === 'preview' || viewMode === 'split') && (
          <div className={`h-full p-8 overflow-y-auto bg-stone-900/30 ${viewMode === 'split' ? 'w-1/2' : 'w-full'}`}>
            <MarkdownView content={content} />
          </div>
        )}
      </div>

      {/* Editor footer info */}
      <div className="border-t border-stone-800/80 px-8 py-2 bg-stone-900/40 text-stone-500 text-[11px] flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span>{wordCount} words</span>
          <span>{charCount} characters</span>
          <span className="hidden sm:inline">Supports Markdown formatting</span>
        </div>
        <div className="flex items-center gap-1.5 text-stone-500">
          <Sparkles className="w-3 h-3 text-amber-500/60" />
          <span>Private • Stored in SQLite</span>
        </div>
      </div>
    </div>
  );
};
