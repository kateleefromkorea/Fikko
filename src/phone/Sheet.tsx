import type { ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * A bottom sheet: the app's way to show more without leaving the screen.
 * It's the shared dialog, which phone.css turns into a sheet with a grabber;
 * this adds the iOS header, a title with "Done" on the right. On the desktop
 * layout it stays a centred panel (src/desktop/desktop.css, `data-sheet`).
 */
export default function Sheet({
  open, onClose, title, description, children, className, hideTitle,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Read out by screen readers. */
  description?: string;
  children: ReactNode;
  className?: string;
  /** For content with its own heading (a habit card): the title is read out but not shown. */
  hideTitle?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent showCloseButton={false} data-sheet="" className={cn("block gap-0 px-5", className)}>
        <div className={cn("flex items-center gap-3", hideTitle ? "-mt-3 mb-0" : "mb-4")}>
          <DialogTitle className={cn("min-w-0 flex-1 truncate text-lg font-semibold tracking-tight", hideTitle && "sr-only")}>{title}</DialogTitle>
          <button onClick={onClose} className="press -mr-2 ml-auto h-11 rounded-full px-3 text-[15px] font-semibold text-primary-ink">
            Done
          </button>
        </div>
        <DialogDescription className="sr-only">{description ?? title}</DialogDescription>
        {children}
      </DialogContent>
    </Dialog>
  );
}
