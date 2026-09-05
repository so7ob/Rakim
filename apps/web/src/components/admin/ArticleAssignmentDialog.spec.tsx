import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArticleAssignmentDialog } from "./ArticleAssignmentDialog";
import type { StructureNodeItem } from "./StructureTree";

const node: StructureNodeItem = {
  id: "node-target",
  parentId: null,
  nodeType: "CHAPTER",
  labelAr: "الفصل الثالث",
  titleAr: "الأحكام المالية",
  sortKey: "000003",
  directArticleCount: 1,
};

const list = {
  node: {
    id: node.id,
    legislationId: "law-1",
    labelAr: node.labelAr,
    titleAr: node.titleAr,
    legislationStatus: "DRAFT",
  },
  items: [
    {
      id: "article-1",
      currentLabel: "1",
      publishedLabel: "1",
      sortKey: "000001",
      structureNodeId: null,
      structureLabel: null,
      structureTitle: null,
      textPreview: "الأحكام العامة للمادة الأولى",
      articleTitle: "الأحكام العامة",
      versionStatus: "DRAFT",
    },
    {
      id: "article-2",
      currentLabel: "2",
      publishedLabel: "2",
      sortKey: "000002",
      structureNodeId: node.id,
      structureLabel: node.labelAr,
      structureTitle: node.titleAr,
      textPreview: "المادة المرتبطة بالعقدة الحالية",
      articleTitle: "الارتباط الحالي",
      versionStatus: "DRAFT",
    },
    {
      id: "article-3",
      currentLabel: "3",
      publishedLabel: "3",
      sortKey: "000003",
      structureNodeId: "node-other",
      structureLabel: "الفصل الثاني",
      structureTitle: "الأحكام السابقة",
      textPreview: "مادة ستنقل من فصل آخر",
      articleTitle: "مادة النقل",
      versionStatus: "DRAFT",
    },
    {
      id: "article-4",
      currentLabel: "4 مكرر",
      publishedLabel: "4 مكرر",
      sortKey: "000004",
      structureNodeId: null,
      structureLabel: null,
      structureTitle: null,
      textPreview: "عنوان المادة المركبة",
      articleTitle: "المادة المركبة",
      versionStatus: "DRAFT",
    },
  ],
  meta: { page: 1, pageSize: 500, total: 4, pageCount: 1 },
};

const response = (body: unknown, ok = true, status = ok ? 200 : 500) =>
  ({ ok, status, json: async () => body }) as Response;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ArticleAssignmentDialog", () => {
  it("searches, filters, selects visible/ranges, and confirms a bulk move", async () => {
    const onSuccess = vi.fn();
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        requests.push({ url, init });
        if (!init?.method) return response(list);
        return response({
          summary: {
            changedCount: 2,
            assignedCount: 1,
            movedCount: 1,
            unassignedCount: 0,
            directArticleCount: 3,
          },
        });
      }),
    );
    render(
      <ArticleAssignmentDialog
        legislationId="law-1"
        node={node}
        onClose={vi.fn()}
        onSuccess={onSuccess}
      />,
    );

    const dialog = await screen.findByRole("dialog", {
      name: /ربط المواد بـ/,
    });
    expect(within(dialog).getByLabelText(/^المادة 2/)).toBeChecked();
    expect(within(dialog).getByText("مرتبطة هنا حاليًا")).toBeVisible();

    fireEvent.click(within(dialog).getByRole("button", { name: "غير مرتبطة" }));
    expect(within(dialog).getAllByRole("checkbox")).toHaveLength(2);
    fireEvent.click(
      within(dialog).getByRole("button", { name: /^تحديد الظاهر/ }),
    );
    expect(within(dialog).getByText("2 تغيير معلق")).toBeVisible();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "إلغاء تحديد الظاهر" }),
    );
    expect(within(dialog).getByText("0 تغيير معلق")).toBeVisible();

    fireEvent.click(within(dialog).getByRole("button", { name: "الكل" }));
    fireEvent.change(
      within(dialog).getByLabelText("البحث برقم المادة أو عنوانها"),
      { target: { value: "المركبة" } },
    );
    expect(within(dialog).getByText("المادة 4 مكرر")).toBeVisible();
    fireEvent.change(
      within(dialog).getByLabelText("البحث برقم المادة أو عنوانها"),
      { target: { value: "" } },
    );
    fireEvent.change(within(dialog).getByLabelText("من المادة"), {
      target: { value: "1" },
    });
    fireEvent.change(within(dialog).getByLabelText("إلى المادة"), {
      target: { value: "3" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "تحديد النطاق" }),
    );
    expect(
      within(dialog).getByText("تم تحديد 3 مادة وفق ترتيب الوثيقة."),
    ).toBeVisible();
    fireEvent.change(within(dialog).getByLabelText("سبب التصحيح"), {
      target: { value: "تصحيح جماعي للاختبار" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "حفظ التغييرات" }),
    );
    expect(within(dialog).getByText(/سيتم نقل 1 مادة/)).toBeVisible();
    fireEvent.click(
      within(dialog).getByRole("button", { name: "تأكيد النقل والحفظ" }),
    );

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    const patch = requests.find((request) => request.init?.method === "PATCH");
    expect(patch).toBeTruthy();
    expect(JSON.parse(String(patch?.init?.body))).toEqual({
      legislationId: "law-1",
      assign: ["article-1", "article-3"],
      unassign: [],
      reason: "تصحيح جماعي للاختبار",
    });
  });

  it("keeps the dialog open and exposes a server error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) =>
        init?.method
          ? response({ message: "تعارض في حالة التشريع" }, false, 409)
          : response(list),
      ),
    );
    render(
      <ArticleAssignmentDialog
        legislationId="law-1"
        node={node}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByLabelText(/^المادة 1/));
    fireEvent.change(within(dialog).getByLabelText("سبب التصحيح"), {
      target: { value: "اختبار الفشل" },
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "حفظ التغييرات" }),
    );
    expect(
      await within(dialog).findByText("تعارض في حالة التشريع"),
    ).toBeVisible();
    expect(screen.getByRole("dialog")).toBeVisible();
  });

  it("traps keyboard focus, closes with Escape, and restores the trigger", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response(list)),
    );
    const onClose = vi.fn();
    const trigger = document.createElement("button");
    trigger.textContent = "فتح الربط";
    document.body.append(trigger);
    trigger.focus();

    const view = render(
      <ArticleAssignmentDialog
        legislationId="law-1"
        node={node}
        onClose={onClose}
        onSuccess={vi.fn()}
      />,
    );
    const dialog = await screen.findByRole("dialog");
    await within(dialog).findByLabelText(/^المادة 1/);
    expect(dialog).toHaveFocus();

    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(
      within(dialog).getByRole("button", { name: "حفظ التغييرات" }),
    ).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    view.unmount();
    expect(trigger).toHaveFocus();
    trigger.remove();
  });
});
