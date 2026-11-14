/**
 * @vitest-environment jsdom
 *
 * anchor(⑤) — S-1 마목 1) 괄호: ⑳ 마목 918 배제가 걸리는 양도분(2021.2.16 이전)이면 공고 전 취득·계약금 지급 증빙 칸을 보인다.
 * 계획서 `docs/01-plan/features/surcharge-exclusion-textbook-gaps.plan.md` Q-1 a.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RentalUnitCard } from "@/components/calc/transfer/RentalUnitCard";
import { makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));
afterEach(cleanup);

const PROOF = "조정대상지역 공고일 이전에 취득했거나, 계약하고 계약금을 지급한 증빙이 있습니다.";
const ma = {
  rentalCategory: "long_general",
  rentalAcquisitionType: "purchase",
  businessRegistrationDate: "2020-08-01",
  rentalRegistrationDate: "2020-08-01",
  rentalRegisteredDate: "2020-08-01",
  isExcluded918Rule: true,
};
const renderCard = (over: Record<string, unknown>, transferDate?: string) =>
  render(
    <RentalUnitCard
      unit={{ ...makeDefaultRentalUnit(), ...over } as never}
      index={0}
      onChange={vi.fn()}
      onRemove={() => {}}
      canRemove={false}
      transferDate={transferDate}
    />,
  );

describe("⑳ 마목 918 — 증빙 칸", () => {
  it("MP-1 ★ 마목 · 양도 2021-02-10(⑳ 미포함) · 918 ✓ → 증빙 칸 보임", () => {
    renderCard(ma, "2021-02-10");
    expect(screen.getByText(PROOF)).toBeTruthy();
  });
  it("MP-2 짝 — 양도 2021-03-01(⑳ 포함 · 918 무관) → 증빙 칸 없음", () => {
    renderCard(ma, "2021-03-01");
    expect(screen.queryByText(PROOF)).toBeNull();
  });
  it("MP-3 짝 — 918 미체크 → 증빙 칸 없음", () => {
    renderCard({ ...ma, isExcluded918Rule: false }, "2021-02-10");
    expect(screen.queryByText(PROOF)).toBeNull();
  });
});
