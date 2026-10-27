import { toast } from "sonner";
import { undoDropAction } from "@/app/delivery/actions";

/** Success toast with an "Undo" action for ~8 s; undo puts the drop back to pending (only if it is still `expected`). */
export function toastWithUndo(message: string, dropId: string, expected: "delivered" | "failed", release = false) {
  toast.success(message, {
    duration: 8000,
    action: {
      label: "Undo",
      onClick: async () => {
        const r = await undoDropAction({ dropId, expected, release });
        if (r.ok) toast.success(r.message ?? "Undone"); else toast.error(r.error);
      },
    },
  });
}
