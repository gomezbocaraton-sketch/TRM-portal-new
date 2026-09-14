'use client';

import { useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

// Uploads directly from the browser to Supabase Storage, then exposes
// the resulting storage path as a hidden text field with this `name`
// — so from the surrounding form's point of view, formData.get(name)
// still gives back a simple string, just like before.
//
// Why: routing the actual file bytes through a Vercel Server Action
// hits a hard, non-configurable 4.5MB platform limit. Uploading
// straight to Supabase from the browser skips that limit entirely —
// only the resulting path (a few bytes of text) touches our server.
export function DropFileInput({
  name,
  pathPrefix,
  required = false,
  compact = false,
}: {
  name: string;
  pathPrefix: string;
  required?: boolean;
  compact?: boolean;
}) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [storagePath, setStoragePath] = useState<string>('');
  const [status, setStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  const [dragging, setDragging] = useState(false);
  const hiddenInputRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLInputElement>(null);

  async function uploadFile(file: File) {
    setFileName(file.name);
    setStatus('uploading');
    const supabase = createClient();
    const path = `${pathPrefix}/${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from('project-files').upload(path, file);
    if (error) {
      setStatus('error');
      return;
    }
    setStoragePath(path);
    setStatus('done');
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => pickerRef.current?.click()}
      className={`cursor-pointer rounded-lg border border-dashed text-center transition ${
        compact ? 'px-3 py-2 text-xs' : 'px-4 py-4 text-sm'
      } ${dragging ? 'border-accent bg-accent-tint' : 'border-line bg-paper hover:border-accent'}`}
    >
      {status === 'uploading' && <span className="text-ink-soft">Uploading {fileName}…</span>}
      {status === 'done' && <span className="font-medium text-success">{fileName} ✓</span>}
      {status === 'error' && <span className="font-medium text-red-600">Upload failed — click to try again</span>}
      {status === 'idle' && <span className="text-ink-soft">Drag a file here, or click to browse</span>}

      {/* Real file picker — invisible, just triggers the OS file dialog */}
      <input
        ref={pickerRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) uploadFile(file);
        }}
      />
      {/* What the form actually submits: the storage path, not the file itself */}
      <input ref={hiddenInputRef} type="hidden" name={name} value={storagePath} required={required} />
    </div>
  );
}
