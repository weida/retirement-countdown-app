import { describe, expect, it } from "vitest";
import { isShareCanceledError } from "./share.js";

describe("isShareCanceledError", () => {
  it("recognizes browser share cancellation", () => {
    expect(isShareCanceledError({ name: "AbortError" })).toBe(true);
  });

  it("recognizes native share cancellation messages", () => {
    expect(isShareCanceledError(new Error("Share canceled"))).toBe(true);
    expect(isShareCanceledError(new Error("User cancelled share"))).toBe(true);
  });

  it("does not hide real share failures", () => {
    expect(isShareCanceledError(new Error("Filesystem write failed"))).toBe(false);
  });
});
