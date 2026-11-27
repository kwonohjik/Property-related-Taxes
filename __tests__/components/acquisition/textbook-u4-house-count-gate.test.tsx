/**
 * 취득세 교재 대조 U4 — Step3 카드 게이트는 보유 주택 목록의 자동 산정 주택 수를 따른다
 *
 * 종전: 주택 수 선택값(기본 「1주택」)만 봐서, 보유 주택 목록에 1채를 넣어 실제로는 2주택인데도
 * 일시적 2주택 카드·지정 전 계약 카드가 숨었다(엔진은 목록으로 2주택 판정 → 8% 중과).
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Step3 } from "@/components/calc/acquisition/Step3";
import { INITIAL_FORM, createOwnedHouseInfo, type FormState } from "@/components/calc/acquisition/shared";
import { resolveFormHouseCount } from "@/lib/calc/acquisition-tax-api";

const owned = { ...createOwnedHouseInfo("h1"), standardValue: "300,000,000", acquisitionDate: "2020-01-01" };
const form: FormState = {
  ...INITIAL_FORM,
  propertyType: "housing",
  acquisitionCause: "purchase",
  acquiredBy: "individual",
  reportedPrice: "500,000,000",
  balancePaymentDate: "2026-11-01",
  isRegulatedArea: true,
  houseCountAfter: "1",
  ownedHouses: [owned],
};
const text = (f: FormState) =>
  render(<Step3 form={f} set={() => {}} isHousing isIndividual isCorporation={false} isGiftLike={false} />).container.textContent ?? "";

describe("U4 Step3 게이트 — 보유 주택 목록 자동 산정", () => {
  it("보유 1채 + 취득 1채 = 2주택 (선택값 1주택이어도)", () => {
    expect(resolveFormHouseCount(form)).toBe(2);
  });

  it("일시적 2주택 카드·조정 2주택 8% 안내가 보인다", () => {
    const t = text(form);
    expect(t).toContain("일시적 2주택 (중과 배제)");
    expect(t).toContain("조정대상지역 내 2주택 취득");
  });

  it("목록이 없으면 선택값을 따른다", () => {
    const f = { ...form, ownedHouses: [] };
    expect(resolveFormHouseCount(f)).toBe(1);
    expect(text(f)).not.toContain("일시적 2주택 (중과 배제)");
  });
});
