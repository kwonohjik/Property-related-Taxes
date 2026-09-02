// D10-03 anchor — §155⑳ 거주주택 특례 경로가 농특세를 totalTax엔 넣고 echo 필드엔 안 실었다
//
// 이 경로는 `transfer-tax.ts`에서 **조기반환**해 echo를 채우는 `finalizeTransferTax`를 건너뛴다.
// `resolveTaxCreditRuralSurtax`로 판정해 steps와 `totalTax`에는 반영하면서도 반환 객체에
// `ruralSurtax` 키가 없었다(`grep -n "ruralSurtax" …` → 0건 — 함수명 `resolveTaxCreditRuralSurtax`는
// 대소문자가 달라 매칭되지 않는다).
//
// 소비층이 실재한다 — `reduction-eligible-income.ts`의 `resolveRuralSurtax`와
// `ResultPdfDocument.tsx`가 `result.ruralSurtax ?? 차감형detail합`으로 폴백하는데, 이 경로는
// 차감형을 애초에 계산하지 않으므로 **항상 0**이었다. 결과 카드·신고서 양식·상세명세서·PDF의
// 농특세 칸이 0인데 총 납부세액에는 포함돼 「항목 합 ≠ 총액」 자기모순이 화면에 남았다.
//
// ⚠️ 기존 anchor(`rural-surtax-tax-credit.anchor.test.ts`)는 농특세를 **`totalTax`에서 역산**해
//   구하므로 echo 필드 누락을 원리적으로 감지하지 못한다 — 그래서 이 갭을 못 봤다.
// 형제 경로 `transfer-tax-redevelopment.ts`는 같은 결함을 이미 고쳤다.
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const rates = makeMockRates();

const rentalException: NonNullable<TransferTaxInput["rentalHousingException"]> = {
  applyException: true,
  scenario: "A",
  rentalUnits: [
    {
      businessRegistrationDate: new Date("2018-06-01"),
      rentalRegistrationDate: new Date("2018-06-01"),
      rentalCategory: "long_general" as const,
      rentalAcquisitionType: "purchase" as const,
      isApartment: false,
      region: "non-metro" as const,
      isExcluded918Rule: false,
      standardPriceAtRentalStart: 250_000_000,
      hasMinimum2Units: false,
      rentalMonths: 96,
      rentalAutoTermination: false,
      requirementsConfirmed: true,
    },
  ],
};

/** §77 공익수용 — 「직접 경작」 미선언이라 농특세 과세 대상(농특세령 §4①1호 괄호) */
const EXPROPRIATION = {
  type: "public_expropriation" as const,
  cashCompensation: 1_500_000_000,
  bondCompensation: 0,
  businessApprovalDate: new Date("2020-01-01"),
};

function run(over: Partial<TransferTaxInput> = {}) {
  return calculateTransferTax(
    baseTransferInput({
      propertyType: "housing",
      transferPrice: 1_500_000_000,
      acquisitionPrice: 1_100_000_000,
      acquisitionDate: new Date("2014-06-01"),
      transferDate: new Date("2024-06-01"),
      residencePeriodMonths: 60,
      isOneHousehold: true,
      householdHousingCount: 1,
      expenses: 0,
      reductions: [EXPROPRIATION],
      rentalHousingException: rentalException,
      ...over,
    }),
    rates,
  );
}

describe("D10-03 §155⑳ 특례 경로 — 농특세 echo", () => {
  it("D10-03-1: 특례 경로로 조기반환한다 (전제)", () => {
    expect(run().rentalHousingExceptionDetail?.applied).toBe(true);
  });

  it("D10-03-2: ruralSurtax 필드가 실린다 (종전 undefined)", () => {
    const r = run();
    expect(r.reductionAmount).toBeGreaterThan(0);
    expect(r.ruralSurtax).toBe(Math.floor(r.reductionAmount * 0.2));
  });

  it("D10-03-3: 표시값과 합계가 일치한다 — 「항목 합 = 총액」", () => {
    const r = run();
    expect(r.totalTax).toBe(r.determinedTax + r.localIncomeTax + (r.ruralSurtax ?? 0));
  });

  it("D10-03-4: 「직접 경작한 토지」면 0 (판정표 단일 소스가 그대로 작동한다)", () => {
    const r = run({ isSelfCultivatedExpropriatedLand: true });
    expect(r.reductionAmount).toBeGreaterThan(0);
    expect(r.ruralSurtax).toBe(0);
  });

  it("D10-03-5: 감면이 없으면 0이다", () => {
    const r = run({ reductions: [] });
    expect(r.ruralSurtax ?? 0).toBe(0);
  });
});
