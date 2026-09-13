import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";
import { UnsavedChangesGuard } from "./UnsavedChangesGuard";

afterEach(cleanup);

function Location() {
  return <output>{useLocation().pathname}</output>;
}

describe("UnsavedChangesGuard", () => {
  it("keeps internal navigation pending until discard is confirmed", () => {
    render(
      <MemoryRouter initialEntries={["/edit"]}>
        <a href="/next">الصفحة التالية</a>
        <UnsavedChangesGuard active />
        <Location />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("link", { name: "الصفحة التالية" }));
    expect(
      screen.getByRole("dialog", { name: "مغادرة الصفحة دون حفظ؟" }),
    ).toBeVisible();
    expect(screen.getByText("/edit")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "إلغاء" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("/edit")).toBeVisible();

    fireEvent.click(screen.getByRole("link", { name: "الصفحة التالية" }));
    fireEvent.click(screen.getByRole("button", { name: "مغادرة الصفحة" }));
    expect(screen.getByText("/next")).toBeVisible();
  });
});
