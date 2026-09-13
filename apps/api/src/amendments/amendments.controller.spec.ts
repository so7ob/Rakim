import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { PERMISSIONS_KEY } from "../common/permission.guard.js";
import { AmendmentsController } from "./amendments.controller.js";

describe("AmendmentsController", () => {
  it("protects direct amendment detail access with amendment.view", () => {
    expect(
      Reflect.getMetadata(
        PERMISSIONS_KEY,
        AmendmentsController.prototype.detail,
      ),
    ).toEqual(["amendment.view"]);
  });
});
