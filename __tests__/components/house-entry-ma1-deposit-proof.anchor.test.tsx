/**
 * ⑤ 다주택 장기임대 마목(E) — S-1 마목 1) 괄호 「공고 전 취득·계약금 지급 증빙」 칸(계획서
 * `docs/01-plan/features/surcharge-exclusion-textbook-gaps.plan.md` Q-1 a). 아목(H)과 같은 칸 · 사목 base 마도 빌려 온다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { HouseEntryRentalTypeSection } from "@/components/calc/transfer/HouseEntryRentalTypeSection";
import type { RentalDeclaration } from "@/lib/stores/calc-wizard-store";

afterEach(() => cleanup());

const PROOF = "조정지역 공고일 전 취득 또는 계약금 지급 증빙 보유";
const BASE: RentalDeclaration = {
  isLongTermRental: true,
  isRegisteredRental: true,
  rentalRegistrationDate: "2019-02-01",
  businessRegistrationDate: "2019-02-01",
  rentalType: "E",
};
const shown = (d: RentalDeclaration) => {
  render(<HouseEntryRentalTypeSection house={d} idPrefix="t" onUpdate={vi.fn()} />);
  const on = screen.queryByText(PROOF) !== null;
  cleanup();
  return on;
};

describe("S-1 ⑤ 증빙 칸", () => {
  it("MH-1 ★ 마목(E) · 아목(H) · 사목 base 마 → 뜬다", () => {
    expect(shown(BASE)).toBe(true);
    expect(shown({ ...BASE, rentalType: "H" })).toBe(true);
    expect(shown({ ...BASE, rentalType: "G", saMokBaseArticle: "마" })).toBe(true);
  });
  it("MH-2 짝 — 가목(A) → 안 뜬다", () => {
    expect(shown({ ...BASE, rentalType: "A" })).toBe(false);
  });
});
