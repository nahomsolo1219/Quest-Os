import { toast } from "sonner";
import { undoDropAction } from "@/app/delivery/actions";

/** Success toast with an "Undo" action for ~8 s; undo puts the drop back to pending. */
export function toastWithUndo(message: string, dropId: string) {
  toast.success(message, {
    duration: 8000,
    action: {
      label: "Undo",
      onClick: async () => {
        const r = await undoDropAction({ dropId });
        if (r.ok) toast.success(r.message ?? "Undone"); else toast.error(r.error);
      },
    },
  });
}
