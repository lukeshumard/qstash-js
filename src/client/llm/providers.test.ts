import { describe, expect, test } from "bun:test";
import { custom } from "./providers";

describe("Provider helpers", () => {
  test("should trim /chat/completion/if you user fullUrl", () => {
    expect(custom({ baseUrl: "https://api.together.xyz/chat/completions", token: "xxx" })).toEqual({
      baseUrl: "https://api.together.xyz",
      token: "xxx",
      owner: "custom",
    });
  });
  test("should trim /v1/chat/completion/if you user fullUrl", () => {
    expect(
      custom({ baseUrl: "https://api.together.xyz/v1/chat/completions", token: "xxx" })
    ).toEqual({ baseUrl: "https://api.together.xyz", token: "xxx", owner: "custom" });
  });
});
