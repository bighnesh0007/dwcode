"use client";

import { FilePlus2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { LANGUAGE_LABEL, LANGUAGE_MIME } from "../types";
import type { PlaygroundFile, PlaygroundFileLanguage } from "../types";

const LANG_OPTIONS = Object.entries(LANGUAGE_LABEL) as [
  PlaygroundFileLanguage,
  string,
][];

/** Icon colour per language */
const LANG_DOT: Record<PlaygroundFileLanguage, string> = {
  json: "bg-yellow-400",
  xml: "bg-orange-400",
  csv: "bg-green-400",
  yaml: "bg-blue-400",
  text: "bg-muted-foreground",
  java: "bg-red-400",
  ndjson: "bg-purple-400",
  multipart: "bg-sky-400",
};

type FileExplorerProps = {
  files: PlaygroundFile[];
  activeFileId: string;
  onAddFile: () => void;
  onRemoveFile: (id: string) => void;
  onRenameFile: (id: string, name: string) => void;
  onChangeLanguage: (id: string, lang: PlaygroundFileLanguage) => void;
  onSelectFile: (id: string) => void;
};

export function FileExplorer({
  files,
  activeFileId,
  onAddFile,
  onRemoveFile,
  onRenameFile,
  onChangeLanguage,
  onSelectFile,
}: FileExplorerProps) {
  return (
    <div className="flex h-full min-h-0 flex-col border-r bg-muted/10">
      {/* Header */}
      <div className="flex h-9 shrink-0 items-center gap-2 border-b px-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Inputs
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="ml-auto h-6 w-6"
          onClick={onAddFile}
          title="Add input file"
        >
          <FilePlus2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* File list */}
      <div className="min-h-0 flex-1 overflow-auto p-1.5 space-y-0.5">
        {files.map((file) => {
          const isActive = file.id === activeFileId;

          return (
            <div
              key={file.id}
              className={cn(
                "group rounded-md transition-colors",
                isActive ? "bg-accent" : "hover:bg-muted"
              )}
            >
              {/* Name row */}
              <div className="flex items-center gap-1 px-1 py-1">
                {/* Colour dot = current MIME type */}
                <span
                  className={cn(
                    "w-1.5 h-1.5 rounded-full shrink-0",
                    LANG_DOT[file.language]
                  )}
                  title={LANGUAGE_MIME[file.language]}
                />
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center text-left"
                  onClick={() => onSelectFile(file.id)}
                  title={file.name}
                >
                  <Input
                    value={file.name}
                    onChange={(e) => onRenameFile(file.id, e.target.value)}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectFile(file.id);
                    }}
                    className="h-6 min-w-0 border-0 bg-transparent px-0 text-xs shadow-none focus-visible:ring-0"
                  />
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 opacity-0 group-hover:opacity-100 shrink-0"
                  onClick={() => onRemoveFile(file.id)}
                  disabled={files.length <= 1}
                  title="Remove file"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>

              {/* MIME selector — always visible for active file */}
              {isActive && (
                <div className="px-2 pb-1.5">
                  <select
                    value={file.language}
                    onChange={(e) =>
                      onChangeLanguage(file.id, e.target.value as PlaygroundFileLanguage)
                    }
                    className="w-full rounded border border-border/60 bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    title="Input MIME type"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {LANG_OPTIONS.map(([val, label]) => (
                      <option key={val} value={val}>
                        {label} — {LANGUAGE_MIME[val]}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
