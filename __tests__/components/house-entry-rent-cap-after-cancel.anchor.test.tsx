/**
 * ⑤ S-2 — 말소된 임대주택(사목 · 자동말소)의 5% 질문은 「말소일까지」(계획서
 * `docs/01-plan/features/surcharge-exclusion-textbook-gaps.plan.md` Q-3 a · Q-4 a · §15).
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { HouseEntryRentalTypeSection } from "@/components/calc/transfer/HouseEntryRentalTypeSection";
import type { RentalDeclaration } from "@/lib/stores/calc-wizard-store";

afterEach(() => cleanup());

const LABEL = "말소일까지 임대료 증액 5% 이하 충족";
const BASE: RentalDeclaration = {
  isLongTermRental: true,
  isRegisteredRental: true,
  rentalRegistrationDate: "2018-03-01",
  businessRegistrationDate: "2018-03-01",
  rentalType: "A",
  rentIncreaseUnder5Pct: false,
};
const view = (d: RentalDeclaration) => {
  render(<HouseEntryRentalTypeSection house={d} idPrefix="t" onUpdate={vi.fn()} />);
  const r = {
    label: screen.queryByText(LABEL) !== null,
    note: screen.queryByTestId("rent-cap-cancel-note-t")?.textContent ?? null,
  };
  cleanup();
  return r;
};

describe("S-2 ⑤ 말소 주택 5% 질문", () => {
  it("RC-1 ★ 가목 자동말소 → 「말소일까지」 + 해석례 안내", () => {
    const r = view({ ...BASE, rentalCancelledDate: "2022-03-01", rentalCancellationReason: "auto" });
    expect(r.label).toBe(true);
    expect(r.note).toContain("서면-2022-법규재산-0208");
    expect(r.note).not.toContain("확인 필요");
  });
  it("RC-2 사목 → 「말소일까지」", () => {
    expect(view({ ...BASE, rentalType: "G", saMokBaseArticle: "가" }).label).toBe(true);
  });
  it("RC-3 짝 — 말소 없음 · 자진말소 선택(사목 아님) → 종전 라벨", () => {
    expect(view(BASE).label).toBe(false);
    expect(view({ ...BASE, rentalCancelledDate: "2022-03-01", rentalCancellationReason: "voluntary" }).label).toBe(false);
    expect(screen.queryByText("임대료 증액 5% 이하 충족")).toBeNull();
  });
  it("RC-4 일반주택 양도(10호)에도 같은 기준 — 확인 필요를 붙이지 않는다(사용자 결정 2026-11-15 · V-2 닫음)", () => {
    const r = view({ ...BASE, rentalCancelledDate: "2022-03-01", rentalCancellationReason: "auto" });
    expect(r.note).toContain("서면-2021-법규재산-5655");
    expect(r.note).not.toContain("확인 필요");
    expect(r.note).not.toContain("일반주택");
  });
});
