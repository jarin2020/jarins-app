import { describe, expect, it } from "vitest";
import { encodedAttachmentsBytes, parseEmailAddressList } from "./email";

describe("email input normalization", () => {
  it("normalizes comma and semicolon separated recipients", () => {
    expect(
      parseEmailAddressList(
        " Faria@Example.com, partner@example.com;work@example.com ",
      ),
    ).toEqual(["faria@example.com", "partner@example.com", "work@example.com"]);
  });

  it("calculates decoded attachment bytes including base64 padding", () => {
    expect(
      encodedAttachmentsBytes([
        { contentBase64: "SGVsbG8=" },
        { contentBase64: "V29ybGQh" },
      ]),
    ).toBe(11);
  });
});
