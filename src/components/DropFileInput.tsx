'use client';

import { useEffect, useRef, useState } from 'react';

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
  const [file, setFileState] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);

  // Re-applies the held file to the actual native input on every
  // render. This defends against React silently recreating the
  // underlying DOM node (which can happen after a server action's
  // re-render) — without this, the filename could keep showing
  // correctly on screen while the real, submittable file was
  // already gone.
  useEffect(() => {
    if (file && inputRef.current) {
      const dt = new DataTransfer();
      dt.items.add(file);
      inputRef.current.files = dt.files;
    }
  });

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) setFileState(dropped);
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
      {file ? (
        <span className="font-medium text-navy">{file.name}</span>
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
          const selected = e.target.files?.[0];
          if (selected) setFileState(selected);
        }}
      />
    </div>
  );
}
