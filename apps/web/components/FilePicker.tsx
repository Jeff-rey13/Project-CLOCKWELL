'use client';

import { useId } from 'react';
import { Paperclip, X } from '@phosphor-icons/react';

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const ALLOWED_FILE_TYPES = ['image/jpeg', 'image/png', 'application/pdf'];

export function fileExtension(file: File): string {
  return file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : 'jpg';
}

/** Camera or file picker for receipts and documents: JPG, PNG or PDF up to 5 MB each. */
export function FilePicker({
  label,
  files,
  onChange,
  error,
  max = 5,
}: {
  label: string;
  files: File[];
  onChange: (files: File[], error: string | null) => void;
  error?: string | null;
  max?: number;
}) {
  const id = useId();
  const add = (list: FileList | null) => {
    if (!list) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      if (!ALLOWED_FILE_TYPES.includes(f.type)) return onChange(files, 'Use a JPG, PNG or PDF file.');
      if (f.size > MAX_FILE_BYTES) return onChange(files, 'Each file must be 5 MB or smaller.');
      next.push(f);
    }
    if (next.length > max) return onChange(files, `Add up to ${max} files.`);
    onChange(next, null);
  };
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        type="file"
        multiple={max > 1}
        accept="image/jpeg,image/png,application/pdf"
        onChange={(e) => {
          add(e.target.files);
          e.target.value = '';
        }}
        className="text-sm file:mr-3 file:min-h-11 file:rounded-full file:border file:border-line-strong file:bg-surface file:px-4 file:font-semibold"
      />
      {files.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 rounded-box bg-soft px-3 py-2 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <Paperclip size={16} aria-hidden />
                <span className="truncate">{f.name}</span>
              </span>
              <button
                type="button"
                aria-label={`Remove ${f.name}`}
                onClick={() => onChange(files.filter((_, j) => j !== i), null)}
                className="flex size-9 items-center justify-center rounded-full hover:bg-surface"
              >
                <X size={16} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}
