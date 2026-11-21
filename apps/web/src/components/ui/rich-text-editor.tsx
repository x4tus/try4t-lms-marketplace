'use client';

import * as React from 'react';
import {
  Bold,
  Code,
  Code2,
  Eye,
  Heading2,
  Italic,
  Link2,
  List,
  ListOrdered,
  Pencil,
  Quote,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/cn';

export interface MarkdownPreviewProps {
  content: string;
  className?: string;
  emptyText?: string;
}

export function MarkdownPreview({
  content,
  className,
  emptyText = 'Chưa có nội dung.',
}: MarkdownPreviewProps) {
  if (!content?.trim()) {
    return <p className="text-xs italic text-muted-foreground">{emptyText}</p>;
  }

  return (
    <div
      className={cn(
        'space-y-2 text-sm leading-relaxed text-foreground break-words',
        '[&_h1]:text-lg [&_h1]:font-bold [&_h2]:text-base [&_h2]:font-semibold [&_h3]:text-sm [&_h3]:font-semibold',
        '[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5',
        '[&_blockquote]:border-l-2 [&_blockquote]:border-primary/60 [&_blockquote]:pl-3 [&_blockquote]:italic [&_blockquote]:text-muted-foreground',
        '[&_code]:rounded [&_code]:bg-secondary [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em]',
        '[&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-secondary/80 [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0',
        '[&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2',
        '[&_hr]:border-border',
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
        {content}
      </ReactMarkdown>
    </div>
  );
}

export interface RichTextEditorProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  minHeightClass?: string;
  compact?: boolean;
  disabled?: boolean;
  maxLength?: number;
  className?: string;
}

export function RichTextEditor({
  id,
  value,
  onChange,
  placeholder = 'Nhập nội dung (hỗ trợ định dạng đậm, nghiêng, danh sách, code)...',
  rows = 4,
  minHeightClass,
  compact = false,
  disabled = false,
  maxLength,
  className,
}: RichTextEditorProps) {
  const [mode, setMode] = React.useState<'write' | 'preview'>('write');
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  function applyWrap(prefix: string, suffix = prefix, fallbackText = 'nội dung') {
    const el = textareaRef.current;
    if (!el || disabled) return;

    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const selected = value.slice(start, end);
    const inner = selected || fallbackText;
    const next = `${value.slice(0, start)}${prefix}${inner}${suffix}${value.slice(end)}`;
    onChange(next);

    requestAnimationFrame(() => {
      el.focus();
      const selStart = start + prefix.length;
      const selEnd = selStart + inner.length;
      el.setSelectionRange(selStart, selEnd);
    });
  }

  function applyLinePrefix(prefix: string, fallbackText = 'Mục nội dung') {
    const el = textareaRef.current;
    if (!el || disabled) return;

    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const selected = value.slice(start, end);
    const before = value.slice(0, start);
    const needsLeadingNewline = before.length > 0 && !before.endsWith('\n') ? '\n' : '';

    const formatted = selected
      ? selected
          .split('\n')
          .map((line) => `${prefix}${line}`)
          .join('\n')
      : `${prefix}${fallbackText}`;

    const next = `${before}${needsLeadingNewline}${formatted}${value.slice(end)}`;
    onChange(next);

    requestAnimationFrame(() => {
      el.focus();
      const cursor = before.length + needsLeadingNewline.length + formatted.length;
      el.setSelectionRange(cursor, cursor);
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey) {
      const k = e.key.toLowerCase();
      if (k === 'b') {
        e.preventDefault();
        applyWrap('**', '**', 'in đậm');
      } else if (k === 'i') {
        e.preventDefault();
        applyWrap('*', '*', 'in nghiêng');
      } else if (k === 'k') {
        e.preventDefault();
        applyWrap('[', '](https://)', 'tiêu đề liên kết');
      }
    }
  }

  const tools = [
    {
      label: 'In đậm (Ctrl+B)',
      icon: Bold,
      onClick: () => applyWrap('**', '**', 'chữ đậm'),
    },
    {
      label: 'In nghiêng (Ctrl+I)',
      icon: Italic,
      onClick: () => applyWrap('*', '*', 'chữ nghiêng'),
    },
    ...(!compact
      ? [
          {
            label: 'Tiêu đề mục',
            icon: Heading2,
            onClick: () => applyLinePrefix('## ', 'Tiêu đề mục'),
          },
        ]
      : []),
    {
      label: 'Danh sách chấm',
      icon: List,
      onClick: () => applyLinePrefix('- ', 'Ý chính'),
    },
    {
      label: 'Danh sách số',
      icon: ListOrdered,
      onClick: () => applyLinePrefix('1. ', 'Bước 1'),
    },
    {
      label: 'Trích dẫn',
      icon: Quote,
      onClick: () => applyLinePrefix('> ', 'Ghi chú quan trọng'),
    },
    {
      label: 'Mã nội dòng',
      icon: Code,
      onClick: () => applyWrap('`', '`', 'code'),
    },
    ...(!compact
      ? [
          {
            label: 'Khối mã (Code block)',
            icon: Code2,
            onClick: () => applyWrap('\n```ts\n', '\n```\n', '// viết code tại đây'),
          },
        ]
      : []),
    {
      label: 'Chèn liên kết (Ctrl+K)',
      icon: Link2,
      onClick: () => applyWrap('[', '](https://)', 'liên kết'),
    },
  ];

  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-input bg-card transition-shadow focus-within:ring-2 focus-within:ring-ring',
        disabled && 'opacity-60',
        className,
      )}
    >
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-border bg-secondary/45 px-2 py-1.5">
        <div className="flex flex-wrap items-center gap-0.5">
          {tools.map((tool) => {
            const Icon = tool.icon;
            return (
              <button
                key={tool.label}
                type="button"
                title={tool.label}
                aria-label={tool.label}
                disabled={disabled || mode === 'preview'}
                onClick={tool.onClick}
                className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-card hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            );
          })}
        </div>

        <div className="flex items-center rounded-lg bg-secondary p-0.5">
          <button
            type="button"
            onClick={() => setMode('write')}
            className={cn(
              'flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
              mode === 'write'
                ? 'bg-card text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Pencil className="h-3 w-3" /> Soạn thảo
          </button>
          <button
            type="button"
            onClick={() => setMode('preview')}
            className={cn(
              'flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
              mode === 'preview'
                ? 'bg-card text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Eye className="h-3 w-3" /> Xem trước
          </button>
        </div>
      </div>

      {/* Body */}
      {mode === 'write' ? (
        <textarea
          ref={textareaRef}
          id={id}
          rows={rows}
          value={value}
          disabled={disabled}
          maxLength={maxLength}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={cn(
            'block w-full resize-y bg-transparent px-3.5 py-2.5 text-sm leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none',
            minHeightClass,
          )}
        />
      ) : (
        <div
          className={cn(
            'overflow-y-auto px-3.5 py-2.5',
            minHeightClass ?? (compact ? 'min-h-[84px]' : 'min-h-[112px]'),
          )}
        >
          <MarkdownPreview
            content={value}
            emptyText="Chưa có nội dung để xem trước. Chuyển sang tab Soạn thảo để nhập."
          />
        </div>
      )}

      {maxLength !== undefined && (
        <div className="flex items-center justify-between border-t border-border/60 bg-secondary/20 px-3 py-1 text-[10px] text-muted-foreground">
          <span>Hỗ trợ Markdown: **đậm**, *nghiêng*, danh sách, code</span>
          <span className="font-mono">
            {value.length}/{maxLength}
          </span>
        </div>
      )}
    </div>
  );
}
