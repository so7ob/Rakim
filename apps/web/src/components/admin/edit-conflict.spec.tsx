import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecordFormDialog } from "./RecordFormDialog";
import { apiRequest, setCsrfToken, ApiError } from "../../api";
afterEach(() => vi.unstubAllGlobals());
describe("edit conflict presentation", () => {
  it("preserves the API conflict payload and requires reviewing form values", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        () =>
          new Response(
            JSON.stringify({
              message: "تعارض",
              conflict: {
                current: { publisher: "الأحدث", notes: "ملاحظة جديدة" },
                revision: 2,
              },
            }),
            { status: 409, headers: { "Content-Type": "application/json" } },
          ),
      ),
    );
    setCsrfToken("test");
    const error = await apiRequest("/test", {
      method: "PATCH",
      body: { x: 1 },
    }).catch((e) => e);
    expect((error as ApiError).conflict).toBeDefined();
    render(
      <RecordFormDialog
        title="تعديل"
        path="/test"
        method="PATCH"
        editRevision={1}
        fields={[
          { name: "publisher", label: "الناشر", value: "قديم" },
          { name: "notes", label: "الملاحظات", value: "ملاحظة قديمة" },
        ]}
        onClose={() => {}}
        onDone={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText("الناشر"), {
      target: { value: "تعديلي" },
    });
    fireEvent.click(screen.getByRole("button", { name: "حفظ" }));
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "تعارض في التعديلات" }),
      ).toBeTruthy(),
    );
    fireEvent.change(screen.getByLabelText("اختيار الناشر"), {
      target: { value: "mine" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "تطبيق الاختيارات على النموذج" }),
    );
    expect((screen.getByLabelText("الناشر") as HTMLInputElement).value).toBe(
      "تعديلي",
    );
    expect((screen.getByLabelText("الملاحظات") as HTMLInputElement).value).toBe(
      "ملاحظة جديدة",
    );
  });
});
