import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdminDialog } from "./AdminDialog";
import { ConfirmDialog } from "./ConfirmDialog";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AdminDialog", () => {
  it("exposes an accessible dialog, closes with Escape, and returns focus", async () => {
    const trigger = document.createElement("button");
    document.body.append(trigger);
    trigger.focus();
    const onClose = vi.fn();
    const { unmount } = render(
      <AdminDialog
        title="تعديل الجهة"
        description="حدّث بيانات الجهة"
        onClose={onClose}
      >
        <label>
          الاسم
          <input />
        </label>
      </AdminDialog>,
    );

    expect(screen.getByRole("dialog", { name: "تعديل الجهة" })).toHaveAttribute(
      "aria-modal",
      "true",
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
    unmount();
    expect(trigger).toHaveFocus();
    trigger.remove();
  });

  it("warns before discarding meaningful unsaved changes", () => {
    const onClose = vi.fn();
    render(
      <AdminDialog title="تعديل مادة" dirty onClose={onClose}>
        <textarea aria-label="النص" />
      </AdminDialog>,
    );
    fireEvent.click(screen.getByRole("button", { name: "إغلاق النافذة" }));
    expect(
      screen.getByRole("alertdialog", { name: "إغلاق دون حفظ؟" }),
    ).toBeVisible();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "متابعة التحرير" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "إغلاق النافذة" }));
    fireEvent.click(screen.getByRole("button", { name: "إغلاق دون حفظ" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("ConfirmDialog", () => {
  it("keeps the dialog open and exposes a server failure", async () => {
    render(
      <ConfirmDialog
        title="حذف الدور؟"
        description="لن يمكن التراجع عن الحذف."
        confirmLabel="حذف"
        onClose={vi.fn()}
        onConfirm={() => Promise.reject(new Error("الدور مرتبط بمستخدمين"))}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "حذف" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "الدور مرتبط بمستخدمين",
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "حذف" })).toBeEnabled(),
    );
    expect(screen.getByRole("dialog")).toBeVisible();
  });
});
