"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";

/** Type a word and press Enter or a comma to add it; tap a tag to remove it. */
export function TagInput({ id, value, onChange, placeholder }: { id: string; value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [draft, setDraft] = useState("");
  const add = (raw: string) => {
    const words = raw.split(",").map((w) => w.trim().toLowerCase()).filter(Boolean);
    if (words.length) onChange([...new Set([...value, ...words])].slice(0, 20));
    setDraft("");
  };
  return (
    <div className="space-y-2">
      <Input id={id} className="h-11" value={draft} placeholder={placeholder}
        onChange={(e) => (e.target.value.includes(",") ? add(e.target.value) : setDraft(e.target.value))}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(draft); } }}
        onBlur={() => draft && add(draft)} />
      {value.length ? (
        <ul className="flex flex-wrap gap-2">
          {value.map((t) => (
            <li key={t}>
              <button type="button" onClick={() => onChange(value.filter((x) => x !== t))}
                className="flex min-h-9 items-center gap-1 rounded-full bg-accent px-3 text-sm" aria-label={`Remove ${t}`}>
                {t} <X className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
