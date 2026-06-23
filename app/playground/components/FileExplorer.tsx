"use client";

import { FileJson, FilePlus2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { PlaygroundFile } from "../types";

type FileExplorerProps = {
  files: PlaygroundFile[];
  activeFileId: string;
  onAddFile: () => void;
  onRemoveFile: (id: string) => void;
  onRenameFile: (id: string, name: string) => void;
  onSelectFile: (id: string) => void;
};

export function FileExplorer({
  files,
  activeFileId,
  onAddFile,
  onRemoveFile,
  onRenameFile,
  onSelectFile,
}: FileExplorerProps) {
  return (
    <div className="flex h-full min-h-0 flex-col border-r bg-muted/10">
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
      <div className="min-h-0 flex-1 overflow-auto p-1.5">
        {files.map((file) => {
          const isActive = file.id === activeFileId;

          return (
            <div
              key={file.id}
              className={cn(
                "group flex items-center gap-1 rounded-md px-1 py-1",
                isActive ? "bg-accent text-accent-foreground" : "hover:bg-muted"
              )}
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                onClick={() => onSelectFile(file.id)}
                title={file.name}
              >
                <FileJson className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <Input
                  value={file.name}
                  onChange={(event) => onRenameFile(file.id, event.target.value)}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelectFile(file.id);
                  }}
                  className="h-6 min-w-0 border-0 bg-transparent px-0 text-xs shadow-none focus-visible:ring-0"
                />
              </button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6 opacity-0 group-hover:opacity-100"
                onClick={() => onRemoveFile(file.id)}
                disabled={files.length <= 1}
                title="Remove file"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
