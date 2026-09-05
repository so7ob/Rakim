import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StructureAnalysisPreview } from "./AdminImportsPage";

describe("import structure preview", () => {
  it("renders nodes and articles in document order with summary and issues", () => {
    render(
      <StructureAnalysisPreview
        analysis={{
          schemaVersion: 2,
          parser: "arabic-legal-structure-v2",
          nodes: [
            {
              key: "bab",
              kind: "BAB",
              label: "الباب الأول",
              title: "الأحكام العامة",
              parentKey: null,
              documentOrder: 1,
              status: "CONFIRMED",
            },
            {
              key: "fasl",
              kind: "FASL",
              label: "الفصل الأول",
              title: "أحكام لاحقة",
              parentKey: "bab",
              documentOrder: 3,
              status: "CONFIRMED",
            },
          ],
          articles: [
            {
              key: "article-1",
              label: "1",
              number: "1",
              headingLabel: "المادة 1",
              structureNodeKey: "bab",
              documentOrder: 2,
              status: "CONFIRMED",
              textExcerpt: "نص",
            },
            {
              key: "article-2",
              label: "2",
              number: "2",
              headingLabel: "المادة 2",
              structureNodeKey: "fasl",
              documentOrder: 4,
              status: "REVIEW_REQUIRED",
              textExcerpt: "نص",
            },
          ],
          issues: [
            {
              code: "CHECK",
              message: "عنصر يحتاج مراجعة",
              sourceLine: 8,
            },
          ],
          summary: {
            babs: 1,
            fasls: 1,
            qisms: 0,
            articles: 2,
            rootArticles: 0,
            reviewRequired: 1,
          },
        }}
      />,
    );
    const tree = screen.getByRole("tree", {
      name: "بنية التشريع المستخرجة",
    });
    const text = tree.textContent ?? "";
    expect(text.indexOf("المادة 1")).toBeLessThan(text.indexOf("الفصل الأول"));
    expect(text.indexOf("الفصل الأول")).toBeLessThan(text.indexOf("المادة 2"));
    expect(within(tree).getAllByRole("treeitem")).toHaveLength(4);
    expect(screen.getByRole("status")).toHaveTextContent(
      "عنصر يحتاج مراجعة (السطر 8)",
    );
    expect(screen.getByLabelText("ملخص نتيجة التحليل")).toHaveTextContent(
      "المواد2",
    );
  });
});
