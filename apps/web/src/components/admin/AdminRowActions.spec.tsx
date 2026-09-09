import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AdminRowActions } from "./AdminRowActions";

describe("AdminRowActions", () => {
  it("groups the available row actions under an accessible entity label", () => {
    render(
      <AdminRowActions label="إجراءات التشريع قانون الاختبار">
        <button>عرض</button>
        <button>تعديل</button>
      </AdminRowActions>,
    );

    const actions = screen.getByRole("group", {
      name: "إجراءات التشريع قانون الاختبار",
    });
    expect(actions).toContainElement(
      screen.getByRole("button", { name: "عرض" }),
    );
    expect(actions).toContainElement(
      screen.getByRole("button", { name: "تعديل" }),
    );
  });
});
