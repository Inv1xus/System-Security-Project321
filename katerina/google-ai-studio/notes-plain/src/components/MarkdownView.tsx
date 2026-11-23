import React from 'react';

interface MarkdownViewProps {
  content: string;
}

export const MarkdownView: React.FC<MarkdownViewProps> = ({ content }) => {
  if (!content.trim()) {
    return <div className="text-stone-400 italic py-8 text-center">Empty note. Switch to Edit mode to write.</div>;
  }

  // Parse lines to handle headers, lists, task checkboxes, blockquotes, code
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBlockLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('```')) {
      if (inCodeBlock) {
        elements.push(
          <pre key={`code-${i}`} className="bg-stone-900 text-stone-100 p-4 rounded-lg my-3 font-mono text-sm overflow-x-auto border border-stone-800">
            <code>{codeBlockLines.join('\n')}</code>
          </pre>
        );
        codeBlockLines = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(line);
      continue;
    }

    // Headers
    if (line.startsWith('# ')) {
      elements.push(
        <h1 key={i} className="text-2xl font-bold text-stone-900 mt-6 mb-3 border-b border-stone-200 pb-2">
          {renderInline(line.replace('# ', ''))}
        </h1>
      );
    } else if (line.startsWith('## ')) {
      elements.push(
        <h2 key={i} className="text-xl font-semibold text-stone-800 mt-5 mb-2">
          {renderInline(line.replace('## ', ''))}
        </h2>
      );
    } else if (line.startsWith('### ')) {
      elements.push(
        <h3 key={i} className="text-lg font-medium text-stone-800 mt-4 mb-2">
          {renderInline(line.replace('### ', ''))}
        </h3>
      );
    } else if (line.startsWith('> ')) {
      elements.push(
        <blockquote key={i} className="border-l-4 border-amber-500 pl-4 py-1 my-2 text-stone-600 italic bg-amber-50/50 rounded-r">
          {renderInline(line.replace('> ', ''))}
        </blockquote>
      );
    } else if (line.startsWith('- [ ] ') || line.startsWith('* [ ] ')) {
      elements.push(
        <div key={i} className="flex items-center gap-2.5 my-1.5 text-stone-700">
          <input type="checkbox" readOnly checked={false} className="rounded border-stone-300 text-stone-700 pointer-events-none" />
          <span>{renderInline(line.substring(6))}</span>
        </div>
      );
    } else if (line.startsWith('- [x] ') || line.startsWith('* [x] ') || line.startsWith('- [X] ') || line.startsWith('* [X] ')) {
      elements.push(
        <div key={i} className="flex items-center gap-2.5 my-1.5 text-stone-400 line-through">
          <input type="checkbox" readOnly checked={true} className="rounded border-stone-300 text-stone-700 pointer-events-none" />
          <span>{renderInline(line.substring(6))}</span>
        </div>
      );
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      elements.push(
        <li key={i} className="ml-5 list-disc my-1 text-stone-700">
          {renderInline(line.substring(2))}
        </li>
      );
    } else if (/^\d+\.\s/.test(line)) {
      const match = line.match(/^(\d+)\.\s(.*)/);
      elements.push(
        <li key={i} className="ml-5 list-decimal my-1 text-stone-700">
          {match ? renderInline(match[2]) : line}
        </li>
      );
    } else if (line.trim() === '---' || line.trim() === '***') {
      elements.push(<hr key={i} className="my-6 border-stone-200" />);
    } else if (line.trim() === '') {
      elements.push(<div key={i} className="h-3" />);
    } else {
      elements.push(
        <p key={i} className="my-1.5 text-stone-700 leading-relaxed">
          {renderInline(line)}
        </p>
      );
    }
  }

  // Handle unclosed code block
  if (inCodeBlock && codeBlockLines.length > 0) {
    elements.push(
      <pre key="unclosed-code" className="bg-stone-900 text-stone-100 p-4 rounded-lg my-3 font-mono text-sm overflow-x-auto border border-stone-800">
        <code>{codeBlockLines.join('\n')}</code>
      </pre>
    );
  }

  return <div className="prose prose-stone max-w-none">{elements}</div>;
};

// Simple inline parser for **bold**, *italic*, and `code`
function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }

    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(<strong key={match.index} className="font-semibold text-stone-900">{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('*') && token.endsWith('*')) {
      parts.push(<em key={match.index} className="italic">{token.slice(1, -1)}</em>);
    } else if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(
        <code key={match.index} className="bg-stone-100 text-stone-800 px-1.5 py-0.5 rounded font-mono text-xs border border-stone-200">
          {token.slice(1, -1)}
        </code>
      );
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}
