'use client';

import * as React from 'react';
import { AlertTriangle } from 'lucide-react';
import { create } from 'zustand';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

interface ConfirmState {
  open: boolean;
  options: ConfirmOptions | null;
  resolver: ((accepted: boolean) => void) | null;
  ask: (options: ConfirmOptions) => Promise<boolean>;
  respond: (accepted: boolean) => void;
}

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  open: false,
  options: null,
  resolver: null,

  ask: (options) =>
    new Promise<boolean>((resolve) => {
      set({ open: true, options, resolver: resolve });
    }),

  respond: (accepted) => {
    const resolver = get().resolver;
    set({ open: false, options: null, resolver: null });
    resolver?.(accepted);
  },
}));

export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  return useConfirmStore.getState().ask(options);
}

export function GlobalConfirmDialog() {
  const { open, options, respond } = useConfirmStore();

  if (!options) return null;

  return (
    <Dialog
      open={open}
      onClose={() => respond(false)}
      maxWidthClass="max-w-sm"
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <span
            className={
              options.destructive
                ? 'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-destructive/15 text-destructive'
                : 'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400'
            }
          >
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-base font-semibold leading-snug">{options.title}</h3>
            {options.description && (
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                {options.description}
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" size="sm" onClick={() => respond(false)}>
            {options.cancelLabel ?? 'Hủy bỏ'}
          </Button>
          <Button
            type="button"
            variant={options.destructive ? 'destructive' : 'default'}
            size="sm"
            onClick={() => respond(true)}
          >
            {options.confirmLabel ?? 'Xác nhận'}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
