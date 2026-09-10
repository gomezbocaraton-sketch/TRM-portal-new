'use client';

import { useRef, useState } from 'react';

// Drop-in replacement for <input type="file" name="..." />. Works
// identically from the surrounding form's point of view (still a
// real file input with the same name, still reads via
// formData.get(name)) — this only changes how the file gets
// selected, adding drag-and-drop on top of the usual click-to-browse.
//
// Dragging works from cloud web pages (OneDrive.com, Gmail, Outlook
// web), desktop apps like WhatsApp Desktop, and Messages — the
// browser handles receiving the actual file bytes regardless of
// where the drag started.
export function DropFileInput({
  name,
  required = false,
  compact = false,
}: {
  name: string;
  required?: boolean;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  function setFile(file: File) {
    const dt = new DataTransfer();
    dt.items.add(file);
    if (inputRef.current) inputRef.current.files = dt.files;
    setFileName(file.name);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) setFile(file);
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`cursor-pointer rounded-lg border border-dashed text-center transition ${
        compact ? 'px-3 py-2 text-xs' : 'px-4 py-4 text-sm'
      } ${dragging ? 'border-accent bg-accent-tint' : 'border-line bg-paper hover:border-accent'}`}
    >
      {fileName ? (
        <span className="font-medium text-navy">{fileName}</span>
      ) : (
        <span className="text-ink-soft">Drag a file here, or click to browse</span>
      )}
      <input
        ref={inputRef}
        type="file"
        name={name}
        required={required}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) setFileName(file.name);
        }}
      />
    </div>
  );
}
