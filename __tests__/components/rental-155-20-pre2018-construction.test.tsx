/**
 * @vitest-environment jsdom
 *
 * V-6 ⓐ — 구 임대주택법 × 건설임대는 다목으로 묻고(⑤) 막는다(⑧). 엔진 근거: `rental-155-20-pre2018-construction.anchor.test.ts`.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RentalUnitCard } from "@/components/calc/transfer/RentalUnitCard";
import { makeDefaultAsset, makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { validateRentalHousingException } from "@/lib/calc/transfer-tax-validate-rental-exception";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));
afterEach(cleanup);

type Unit = AssetForm["rentalHousingException"]["rentalUnits"][number];

const unit = (over: Partial<Unit> = {}): Unit => ({
  ...makeDefaultRentalUnit(),
  businessRegistrationDate: "2010-10-01",
  rentalRegistrationDate: "2010-10-01",
  rentalRegisteredDate: "2010-10-01",
  rentalCategory: "pre_2018",
  rentalAcquisitionType: "construction",
  standardPriceAtRentalStart: "250,000,000",
  rentalInputMode: "direct",
  rentalMonths: "72",
  requirementsConfirmed: true,
  ...over,
});

const assetOf = (u: Unit): AssetForm => {
  const a = makeDefaultAsset(1);
  return { ...a, assetKind: "housing", rentalHousingException: { ...a.rentalHousingException, applyException: true, scenario: "A", rentalUnits: [u] } } as AssetForm;
};

describe("V-6 ⓐ ⑤ 화면", () => {
  it("U-1 구 임대주택법 × 건설 → 다목 라벨 · 건설임대 규모요건 칸", () => {
    render(<RentalUnitCard unit={unit()} index={0} onChange={vi.fn()} onRemove={() => {}} canRemove={false} />);
    expect(screen.getByText("다목 · 건설 장기(5년)")).toBeTruthy();
    expect(screen.getByText("건설임대 규모요건")).toBeTruthy();
  });
  it("U-2 구 임대주택법 × 매입 → 구법 라벨 그대로 · 규모요건 칸 없음", () => {
    render(<RentalUnitCard unit={unit({ rentalAcquisitionType: "purchase" })} index={0} onChange={vi.fn()} onRemove={() => {}} canRemove={false} />);
    expect(screen.getByText("구 임대주택법(5년)")).toBeTruthy();
    expect(screen.queryByText("건설임대 규모요건")).toBeNull();
  });
});

describe("V-6 ⓐ ⑧ 검증", () => {
  it("V-1 구 임대주택법 × 건설 · 면적 미입력 → 막는다", () => {
    const a = assetOf(unit());
    expect(String(validateRentalHousingException(a.rentalHousingException, a, 0, "자산 1", "2024-06-01"))).toContain("대지면적·연면적");
  });
});
