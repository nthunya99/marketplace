"use client";

import { useEffect, useRef, useState } from "react";

export type UploadedImage = {
  key: string;
  name: string;
  previewUrl: string; // local object URL, shown instantly
  url?: string; // server URL once the upload finishes
  status: "uploading" | "done" | "error";
  error?: string;
};

const MAX_IMAGES = 8;
const MAX_BYTES = 5 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

/**
 * Pick product photos from the device (click or drag-and-drop). Each file
 * uploads immediately to /api/uploads/product-images so the vendor sees
 * progress per photo and the final product save is instant. The first
 * photo is the cover image shown on product cards and search results.
 */
export default function ProductImageUploader({
  images,
  onChange,
  invalid,
}: {
  images: UploadedImage[];
  onChange: (updater: (prev: UploadedImage[]) => UploadedImage[]) => void;
  invalid?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Release object URLs when the form unmounts.
  const imagesRef = useRef(images);
  imagesRef.current = images;
  useEffect(() => () => imagesRef.current.forEach((img) => URL.revokeObjectURL(img.previewUrl)), []);

  async function uploadOne(key: string, file: File) {
    const body = new FormData();
    body.append("file", file);
    try {
      const res = await fetch("/api/uploads/product-images", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      onChange((prev) => prev.map((img) => (img.key === key ? { ...img, url: data.url, status: "done" } : img)));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Upload failed";
      onChange((prev) => prev.map((img) => (img.key === key ? { ...img, status: "error", error: msg } : img)));
    }
  }

  function addFiles(list: FileList | null) {
    if (!list) return;
    setNotice(null);
    const files = Array.from(list);
    const room = MAX_IMAGES - images.length;
    const skipped: string[] = [];
    const accepted: File[] = [];

    for (const f of files) {
      if (!ACCEPTED.includes(f.type)) skipped.push(`${f.name} (not JPG, PNG or WebP)`);
      else if (f.size > MAX_BYTES) skipped.push(`${f.name} (over 5 MB)`);
      else if (accepted.length >= room) skipped.push(`${f.name} (limit of ${MAX_IMAGES} photos)`);
      else accepted.push(f);
    }
    if (skipped.length) setNotice(`Skipped: ${skipped.join(", ")}`);
    if (!accepted.length) return;

    const added: UploadedImage[] = accepted.map((f) => ({
      key: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: f.name,
      previewUrl: URL.createObjectURL(f),
      status: "uploading",
    }));
    onChange((prev) => [...prev, ...added]);
    added.forEach((img, i) => uploadOne(img.key, accepted[i]));
  }

  function remove(key: string) {
    onChange((prev) => {
      const target = prev.find((i) => i.key === key);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((i) => i.key !== key);
    });
  }

  function move(key: string, dir: -1 | 1) {
    onChange((prev) => {
      const idx = prev.findIndex((i) => i.key === key);
      const to = idx + dir;
      if (idx < 0 || to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[to]] = [next[to], next[idx]];
      return next;
    });
  }

  function makeCover(key: string) {
    onChange((prev) => {
      const img = prev.find((i) => i.key === key);
      return img ? [img, ...prev.filter((i) => i.key !== key)] : prev;
    });
  }

  const full = images.length >= MAX_IMAGES;

  return (
    <div>
      {!full && (
        <div
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            addFiles(e.dataTransfer.files);
          }}
          className={`flex flex-col items-center justify-center text-center gap-1.5 rounded-xl border-2 border-dashed px-4 py-7 cursor-pointer transition-colors ${
            dragging
              ? "border-brand bg-brand-light"
              : invalid
              ? "border-sale/60 bg-sale-light/40 hover:border-sale"
              : "border-ink/20 bg-paper hover:border-brand/50 hover:bg-brand-light/40"
          }`}
        >
          <svg viewBox="0 0 24 24" className="w-8 h-8 text-brand" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 16.5V19a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2.5M12 4v11m0-11-4 4m4-4 4 4" />
          </svg>
          <p className="font-medium text-ink">
            {dragging ? "Drop photos here" : "Click to choose photos, or drag them here"}
          </p>
          <p className="text-xs text-ink-muted">
            JPG, PNG or WebP · up to 5 MB each · {images.length}/{MAX_IMAGES} added
          </p>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED.join(",")}
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = ""; // allow picking the same file again
            }}
          />
        </div>
      )}

      {notice && <p className="text-xs text-accent-dark mt-2">{notice}</p>}

      {images.length > 0 && (
        <ul className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
          {images.map((img, i) => (
            <li key={img.key} className="relative rounded-lg border border-ink/10 bg-white overflow-hidden">
              <div className="aspect-square bg-ink/[0.04] relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.previewUrl} alt={img.name} className="w-full h-full object-cover" />
                {img.status === "uploading" && (
                  <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
                    <span className="w-6 h-6 rounded-full border-2 border-brand border-t-transparent animate-spin" aria-label="Uploading" />
                  </div>
                )}
                {img.status === "error" && (
                  <div className="absolute inset-0 bg-sale/85 text-white text-xs p-2 flex items-center justify-center text-center">
                    {img.error}
                  </div>
                )}
                {i === 0 && img.status !== "error" && (
                  <span className="absolute top-1.5 left-1.5 badge-brand shadow-sm">Cover</span>
                )}
                <button
                  type="button"
                  onClick={() => remove(img.key)}
                  className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-white/95 text-ink shadow-sm flex items-center justify-center hover:bg-sale hover:text-white"
                  aria-label={`Remove ${img.name}`}
                  title="Remove"
                >
                  ×
                </button>
              </div>
              <div className="flex items-center justify-between gap-1 px-1.5 py-1 text-xs">
                <button type="button" disabled={i === 0} onClick={() => move(img.key, -1)} className="px-1.5 py-1 rounded hover:bg-ink/5 disabled:opacity-30" aria-label="Move left">
                  ←
                </button>
                {i !== 0 && img.status === "done" ? (
                  <button type="button" onClick={() => makeCover(img.key)} className="text-brand hover:underline">
                    Make cover
                  </button>
                ) : (
                  <span className="text-ink-faint">{i === 0 ? "Main photo" : ""}</span>
                )}
                <button type="button" disabled={i === images.length - 1} onClick={() => move(img.key, 1)} className="px-1.5 py-1 rounded hover:bg-ink/5 disabled:opacity-30" aria-label="Move right">
                  →
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
