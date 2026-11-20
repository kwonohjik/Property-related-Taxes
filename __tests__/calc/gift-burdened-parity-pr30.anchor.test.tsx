/**
 * PR-30 anchor (2026-11 리뷰) — 증여세 부담부증여 화면(보유 주택 목록 없음 · 표식 `noMergeRosterInputPath`)의 정합.
 *
 * | # | 결함 | 주장 |
 * |---|---|---|
 * | D-83 | 2주택 + 두 합가일이면 늘 혼인 축 | ⑧이 막는다 · 엔진(직접 호출)은 두 합가 모두 불성립 + 확인 필요(결정 Q-28 ①②) |
 * | D-84 | 결과 카드가 §155⑳ 불성립 상세를 그리지 않음 | `RentalHousingExceptionDetailCard`를 붙인다 |
 * | D-91 | 거주 개월 상한 ⑧ 없음(⑫ 400) | ⑧이 같은 leaf로 막는다 |
 * | D-92 | 3주택 합가 「판정하지 않고 계산」 고지 + 「기간 요건 불충족」 단정 | 같은 원인이면 검토 고지에서 그 행을 뺀다 |
 * | D-94 | 주택 수 2.5 저장 → ⑧ 통과 · 400 | ⑧이 정수만 받는다 |
 * | I-34 | 2주택 단일 합가 비과세가 구성 미확인 | 합가가 결론을 낸 비과세에만 확인 필요 고지(결정 Q-32) |
 */
import { describe, it, expect } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { validateStep } from "@/components/calc/gift-tax-form-validate";
import { INITIAL_FORM, type FormState } from "@/components/calc/gift-tax-form-shared";
import type { EstateItem } from "@/lib/tax-engine/types/inheritance-gift.types";
import type { BurdenedGiftTransferTaxInput } from "@/lib/tax-engine/types/inheritance-gift-estate.types";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";
import { BurdenedTransferTaxResultCard } from "@/components/calc/results/BurdenedTransferTaxResultCard";
import { RH_ANSWERED_NO } from "./_helpers/phrp-154-10-answer";

const rates = makeMockRates();
const D = (s: string) => new Date(s);

function item(over: Partial<BurdenedGiftTransferTaxInput>): EstateItem {
  return {
    id: "apt-1", category: "real_estate_apartment", name: "테스트 아파트", standardPrice: 300_000_000, leaseDeposit: 150_000_000,
    mortgageAmount: 0, assumedDebtForGift: 150_000_000, monthlyRent: 0,
    burdenedGiftTransferTax: {
      acquisitionDate: new Date("2005-03-01"), standardPriceAtAcquisition: 150_000_000, isOneHousehold: true, rentalHousingException: RH_ANSWERED_NO,
      householdHousingCount: 2, isRegulatedArea: false, wasRegulatedAtAcquisition: false, residencePeriodMonths: 0, isUnregistered: false,
      isFirstTransferredInMerge: true, ...over,
    },
  } as EstateItem;
}
const form = (it: EstateItem, giftDate = "2024-12-01"): FormState =>
  ({ ...INITIAL_FORM, giftDate, donor: "father", donorRelation: "lineal_ascendant_adult", giftItems: [it] }) as FormState;

/** 명부 없는 증여 화면과 같은 엔진 입력 — 양도 2005 취득 · 2주택 · 먼저 양도 · 비조정 */
const engine = (over: Partial<TransferTaxInput>) =>
  calculateTransferTax(
    baseTransferInput({
      propertyType: "housing", isOneHousehold: true, householdHousingCount: 2, acquisitionDate: D("2005-03-01"), transferDate: D("2024-12-01"),
      transferPrice: 300_000_000, acquisitionPrice: 150_000_000, isRegulatedArea: false, residencePeriodMonths: 0, isFirstTransferredInMerge: true,
      noMergeRosterInputPath: true, ...over,
    }),
    rates,
  );

describe("D-83 2주택 + 두 합가일", () => {
  it("⑧이 막는다(2주택이 되게 한 합가 하나만) — 엔진 분기는 route anchor(`__tests__/api/gift-burdened-parity-pr30.route.anchor.test.ts`)", () => {
    const msg = validateStep(1, form(item({ marriageDate: "2008-01-01", parentalCareMergeDate: "2020-06-01", parentalCareParentAge: "over_60" })));
    expect(msg ?? "").toContain("합가 하나만 입력하세요");
  });
});

describe("D-91 · D-94 증여 ⑧", () => {
  it("D-91 거주 30개월 > 보유 12개월 → ⑧이 막는다 · 12개월은 통과", () => {
    const it30 = item({ acquisitionDate: new Date("2024-06-01"), householdHousingCount: 1, residencePeriodMonths: 30, isFirstTransferredInMerge: false });
    expect(validateStep(1, form(it30, "2025-06-01")) ?? "").toContain("12개월");
    const it12 = item({ acquisitionDate: new Date("2024-06-01"), householdHousingCount: 1, residencePeriodMonths: 12, isFirstTransferredInMerge: false });
    expect(validateStep(1, form(it12, "2025-06-01")) ?? "").not.toContain("12개월을 넘습니다");
  });
  it("D-94 주택 수 2.5 → ⑧이 막는다", () => {
    expect(validateStep(1, form(item({ householdHousingCount: 2.5, isFirstTransferredInMerge: false }))) ?? "").toContain("정수로 입력하세요");
  });
});

describe("D-84 결과 카드 — §155⑳ 불성립 상세", () => {
  it("applied=false면 「적용 불가」와 사유를 그린다", () => {
    const base = engine({ householdHousingCount: 3 });
    const result = {
      ...base,
      rentalHousingExceptionDetail: {
        applied: false,
        scenarioId: "RH-A",
        eligibility: { residenceFailReasons: [], failReasons: [], gateFailReasons: ["세대 보유 주택 3채 중 거주주택·장기임대주택이 아닌 주택이 1채 있습니다."], laws: [] },
      },
    } as unknown as Parameters<typeof BurdenedTransferTaxResultCard>[0]["transferTaxResults"][number];
    render(<BurdenedTransferTaxResultCard transferTaxResults={[result]} />);
    expect(screen.getByText("장기임대주택 거주주택 비과세 특례 — 적용 불가")).toBeTruthy();
    expect(screen.getByTestId("rental-exception-gate-fail-reasons").textContent).toContain("세대 보유 주택 3채");
    cleanup();
  });
});
