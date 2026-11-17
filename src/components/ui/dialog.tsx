import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

type ModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  /** Render the body inside a form; Enter / Cmd+Enter submit it. */
  onSubmit?: () => void;
};

const widths = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl" };

export function Modal({ open, onOpenChange, title, description, children, footer, size = "md", onSubmit }: ModalProps) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <D.Title className="text-[15px] font-semibold tracking-tight text-fg">{title}</D.Title>
          {description ? (
            <D.Description className="mt-1 text-xs leading-relaxed text-subtle">{description}</D.Description>
          ) : (
            <D.Description className="sr-only">{typeof title === "string" ? title : "Finestra"}</D.Description>
          )}
        </div>
        <D.Close asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Chiudi">
            <X />
          </Button>
        </D.Close>
      </div>
      <div className="max-h-[calc(100dvh-14rem)] overflow-y-auto px-5 py-4">{children}</div>
      {footer ? <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</div> : null}
    </>
  );

  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] data-[state=open]:animate-fade-in" />
        <D.Content
          className={cn(
            "fixed top-[8vh] left-1/2 z-50 w-[calc(100vw-2rem)] -translate-x-1/2 overflow-hidden rounded-2xl border border-line-strong bg-surface shadow-2xl shadow-black/60",
            "data-[state=open]:animate-scale-in focus:outline-none",
            widths[size],
          )}
          onKeyDown={(e) => {
            if (onSubmit && e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              onSubmit();
            }
          }}
        >
          {onSubmit ? (
            <form
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                onSubmit();
              }}
            >
              {body}
            </form>
          ) : (
            body
          )}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

type ConfirmProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
  danger?: boolean;
};

export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, onConfirm, danger }: ConfirmProps) {
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annulla
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            onClick={async () => {
              await onConfirm();
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-[13px] leading-relaxed text-muted">{description}</div>
    </Modal>
  );
}
