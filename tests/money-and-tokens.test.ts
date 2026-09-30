import { describe, expect, it } from "vitest";
import { calculateTotals } from "../artifacts/api-server/src/lib/tenantSettings";
import { generateSetupToken, hashToken, verifyToken } from "../lib/db/src/tokens";

/**
 * Money is computed from the organization's own configured rates, not from
 * constants. A venue that charges a different tax must be charged differently,
 * and rounding must not drift on a long tab.
 */
describe("order totals", () => {
  const KENYA = { taxRate: 16, serviceChargeRate: 10 };
  const NO_TAX = { taxRate: 0, serviceChargeRate: 0 };

  it("applies the tenant's own rates", () => {
    const t = calculateTotals(1000, 0, KENYA);
    expect(t.subtotal).toBe(1000);
    expect(t.serviceCharge).toBe(100);
    expect(t.tax).toBe(160);
    expect(t.total).toBe(1260);
  });

  it("charges nothing extra when the tenant has no rates configured", () => {
    const t = calculateTotals(1000, 0, NO_TAX);
    expect(t.total).toBe(1000);
    expect(t.serviceCharge).toBe(0);
    expect(t.tax).toBe(0);
  });

  it("takes the discount off before computing tax, not after", () => {
    // A discount of 200 on 1000 leaves 800 taxable: 80 service, 128 tax.
    const t = calculateTotals(1000, 200, KENYA);
    expect(t.serviceCharge).toBe(80);
    expect(t.tax).toBe(128);
    expect(t.total).toBe(1008);
  });

  it("never produces a negative total", () => {
    const t = calculateTotals(100, 500, KENYA);
    expect(t.total).toBe(0);
    expect(t.subtotal).toBe(100);
  });

  it("rounds to whole units and stays exact on an awkward amount", () => {
    // 33% of 999 is 329.67; the venue takes whole shillings.
    const t = calculateTotals(999, 0, { taxRate: 16, serviceChargeRate: 33 });
    expect(Number.isInteger(t.serviceCharge)).toBe(true);
    expect(Number.isInteger(t.tax)).toBe(true);
    expect(t.total).toBe(t.subtotal + t.serviceCharge + t.tax);
  });

  it("keeps the components adding up to the total on every order", () => {
    // This is the invariant the shift report depends on: whatever the rounding
    // does, the stored subtotal, service charge and tax must add up to the
    // stored total for that order, or a receipt disagrees with itself.
    for (const subtotal of [1, 99, 999, 12_345, 999_999]) {
      // A discount cannot exceed the bill; the over-discount case is pinned
      // separately below.
      for (const discount of [0, 1, 7, Math.floor(subtotal / 3), subtotal].filter(
        (d) => d <= subtotal,
      )) {
        const t = calculateTotals(subtotal, discount, { taxRate: 16, serviceChargeRate: 10 });
        expect(t.subtotal - t.discount + t.serviceCharge + t.tax).toBe(t.total);
      }
    }
  });

  it("settles to zero rather than a negative when a discount exceeds the bill", () => {
    // Orders are created with no discount today, so this is unreachable from the
    // API today. It is pinned here so that if discounts are ever applied, a
    // venue cannot be credited more than the tab is worth.
    const t = calculateTotals(100, 500, { taxRate: 16, serviceChargeRate: 10 });
    expect(t.total).toBe(0);
    expect(t.serviceCharge).toBe(0);
    expect(t.tax).toBe(0);
  });

  it("differs from a bulk calculation only by per-order rounding", () => {
    // Rounding each receipt independently is correct: a guest cannot pay
    // fractional shillings. The consequence is that summing a shift's orders
    // drifts slightly from rounding the same shift as one order, and that drift
    // must stay negligible rather than compound.
    const ORDERS = 500;
    let running = 0;
    for (let i = 0; i < ORDERS; i += 1) {
      running += calculateTotals(999, 0, { taxRate: 16, serviceChargeRate: 10 }).total;
    }
    const bulk = calculateTotals(999 * ORDERS, 0, { taxRate: 16, serviceChargeRate: 10 });
    const drift = Math.abs(running - bulk.total);
    // At most one unit of rounding per order, and under a basis point overall.
    expect(drift).toBeLessThanOrEqual(ORDERS);
    expect(drift / running).toBeLessThan(0.001);
  });
});

/**
 * The setup token grants ownership, so it must never be recoverable from the
 * database and must never be replayable.
 */
describe("setup tokens", () => {
  it("verifies a token against its own hash", () => {
    const token = generateSetupToken();
    expect(verifyToken(token, hashToken(token))).toBe(true);
  });

  it("refuses a different token", () => {
    const stored = hashToken(generateSetupToken());
    expect(verifyToken(generateSetupToken(), stored)).toBe(false);
  });

  it("does not store the token in the digest", () => {
    const token = generateSetupToken();
    const stored = hashToken(token);
    expect(stored).not.toContain(token);
    expect(stored).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  });

  it("gives every token a different digest for the same input", () => {
    // Distinct salts, so two identical tokens are not visibly identical.
    const token = generateSetupToken();
    expect(hashToken(token)).not.toBe(hashToken(token));
  });

  it("ignores spacing when comparing, so a copied code is not locked out", () => {
    const token = generateSetupToken();
    const spaced = `${token.slice(0, 8)} ${token.slice(8)}`;
    expect(verifyToken(spaced, hashToken(token))).toBe(true);
  });

  it("refuses malformed stored values rather than throwing", () => {
    expect(verifyToken("anything", "")).toBe(false);
    expect(verifyToken("anything", "no-dot")).toBe(false);
    expect(verifyToken("anything", "a.b")).toBe(false);
  });

  it("generates distinct tokens", () => {
    const seen = new Set(Array.from({ length: 200 }, () => generateSetupToken()));
    expect(seen.size).toBe(200);
  });
});
