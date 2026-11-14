/**
 * @vitest-environment jsdom
 *
 * V-6 ⓑ·ⓒ — 구 임대주택법 매입 아파트도 ⑪ 양도기한 질문(도시형 생활주택·연장 사유)을 묻고 싣고 검증한다(⑤·④·⑧).
 * ⓒ 등록 유형 안내는 1/2 = 30개월과 부칙<제13499호> 제3조③3호를 적는다.
 * 엔진 근거·leaf 단언: `__tests__/tax-engine/transfer/rental-155-20-pre2018-deadline-half.anchor.test.ts`.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RentalUnitCard } from "@/components/calc/transfer/RentalUnitCard";
import { makeDefaultAsset, makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { toRentalHousingExceptionApi } from "@/lib/calc/transfer-tax-api-rental-housing";
import { rentalUnitAptDeadlineInScope } from "@/lib/calc/apt-deadline-extension-scope";
import { rentalUnitUrbanLifeQuestionInScope } from "@/lib/calc/apt-deadline-extension-scope";
import { validateRentalHousingException } from "@/lib/calc/transfer-tax-validate-rental-exception";

vi.mock("@/components/ui/address-search", () => ({ AddressSearch: () => null }));
afterEach(cleanup);

type Unit = AssetForm["rentalHousingException"]["rentalUnits"][number];

const unit = (over: Partial<Unit> = {}): Unit => ({
  ...makeDefaultRentalUnit(),
  businessRegistrationDate: "2012-03-01",
  rentalRegistrationDate: "2012-03-01",
  rentalRegisteredDate: "2012-03-01",
  rentalCategory: "pre_2018",
  rentalAcquisitionType: "purchase",
  isApartment: true,
  standardPriceAtRentalStart: "300,000,000",
  rentalInputMode: "direct",
  rentalMonths: "120",
  requirementsConfirmed: true,
  ...over,
});

const assetOf = (u: Unit): AssetForm => {
  const a = makeDefaultAsset(1);
  return { ...a, assetKind: "housing", rentalHousingException: { ...a.rentalHousingException, applyException: true, scenario: "A", rentalUnits: [u] } } as AssetForm;
};

const URBAN_TITLE = "「주택법」에 따른 도시형 생활주택인 아파트입니다.";

describe("V-6 ⓑ ⑤ 화면", () => {
  it("U-1 구법 매입 아파트 · 등록 중 → 도시형 생활주택 질문이 보인다", () => {
    render(<RentalUnitCard unit={unit()} index={0} onChange={vi.fn()} onRemove={() => {}} canRemove={false} />);
    expect(screen.getByText(URBAN_TITLE)).toBeTruthy();
  });
  it("U-2 구법 건설(다목) 아파트 → 질문 없음", () => {
    render(<RentalUnitCard unit={unit({ rentalAcquisitionType: "construction" })} index={0} onChange={vi.fn()} onRemove={() => {}} canRemove={false} />);
    expect(screen.queryByText(URBAN_TITLE)).toBeNull();
  });
  it("U-3 술어 — 구법 매입 아파트 범위 안 · 말소 ON(㉓ 경로)은 범위 밖", () => {
    expect(rentalUnitUrbanLifeQuestionInScope(unit())).toBe(true);
    expect(rentalUnitAptDeadlineInScope(unit())).toBe(true);
    expect(
      rentalUnitAptDeadlineInScope(
        unit({ rentalAutoTermination: true, terminationReason: "voluntary", terminatedRegistrationType: "short_term", registrationCancellationDate: "2022-01-10" }),
      ),
    ).toBe(false);
  });
});

describe("V-6 ⓑ ④ 전송", () => {
  it("A-1 구법 매입 아파트 · 「연장 사유 없음」 → aptDeadlineExtension.confirmedNone을 싣는다", () => {
    const p = (toRentalHousingExceptionApi(assetOf(unit({ aptDeadlineExtension: { status: "none" } }))) as { rentalUnits: Record<string, unknown>[] })
      .rentalUnits[0];
    expect(p.aptDeadlineExtension).toEqual({ confirmedNone: true });
  });
});

describe("V-6 ⓑ ⑧ 검증", () => {
  it("V-1 구법 매입 아파트 · 「연장 사유 있음」인데 날짜 없음 → 막는다", () => {
    const u = unit({ aptDeadlineExtension: { status: "has" } });
    const r = validateRentalHousingException(assetOf(u).rentalHousingException, assetOf(u), 0, "자산 1", "2028-03-02", "facts");
    expect(String(r)).toContain("연장 사유");
  });
});

describe("V-6 ⓒ ⑤ 등록 유형 안내", () => {
  it("H-1 구법 · 말소 ON → 30개월·부칙<제13499호> 제3조③3호 · 「해석례 없음」 문구 없음", () => {
    const u = unit({ rentalAutoTermination: true, terminationReason: "voluntary", terminatedRegistrationType: "short_term", registrationCancellationDate: "2022-01-10" });
    render(<RentalUnitCard unit={u} index={0} onChange={vi.fn()} onRemove={() => {}} canRemove={false} />);
    const t = screen.getByTestId("rental-terminated-type-pre2018-hint-0").textContent ?? "";
    expect(t).toContain("30개월");
    expect(t).toContain("부칙<제13499호> 제3조③3호");
    expect(t).not.toContain("확인된 해석례가 없습니다");
  });
});
