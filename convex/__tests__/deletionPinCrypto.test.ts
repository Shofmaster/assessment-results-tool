import { describe, expect, it } from "vitest";
import {
  DELETION_PIN_PBKDF2_ITERATIONS,
  generateDeletionPinSaltBase64,
  hashDeletionPinForStorage,
  verifyDeletionPinConstantTime,
} from "../deletionPinCrypto";

describe("deletionPinCrypto", () => {
  it("verifyDeletionPinConstantTime accepts correct PIN", async () => {
    const salt = generateDeletionPinSaltBase64();
    const pin = "correct-horse-battery-staple-9!";
    const stored = await hashDeletionPinForStorage(pin, salt, DELETION_PIN_PBKDF2_ITERATIONS);
    await expect(verifyDeletionPinConstantTime(pin, salt, stored, DELETION_PIN_PBKDF2_ITERATIONS)).resolves.toBe(
      true,
    );
  });

  it("verifyDeletionPinConstantTime rejects wrong PIN", async () => {
    const salt = generateDeletionPinSaltBase64();
    const stored = await hashDeletionPinForStorage("secret-pin", salt, DELETION_PIN_PBKDF2_ITERATIONS);
    await expect(
      verifyDeletionPinConstantTime("wrong-pin", salt, stored, DELETION_PIN_PBKDF2_ITERATIONS),
    ).resolves.toBe(false);
  });
});
