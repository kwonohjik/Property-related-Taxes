/**
 * §99·§99의3·§98의8 — 5년 후 양도에서 안분 기준시가만 없으면 차감은 0이지만 「감면되는 주택」 중과 배제는 유지한다.
 *
 * 계획서: `docs/00-pm/surcharge-oos-remaining.plan.md` B. 하이브리드(리뷰 US-35)·§98의8 분모 0(NH-76)과 같은 독법이다 —
 * 소령 §167의3①5호 「…에 따라 양도소득세가 감면되는 주택」은 요건으로 정해지고, 기준시가는 조특령 §40① 준용 산식의 계산 인자다.
 * 세 조문 모두 요건 판정을 마친 뒤 안분 단계에서만 `MISSING_STD_PRICE`를 낸다.
 *
 * 기대값 = 같은 주택을 5호 선언(`isTaxSpecialExemption`)으로 배제하고 감면 입력 없이 계산한 값(차감 0 · 중과 배제).
 * 실측(수정 전): 세 조문 × 두 칸 모두 433,686,000(중과 +30%p · 장특 0).
 * 세율표는 mock(`makeMockRatesWithHouseEngine`) — 정본 세액이 아니다.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRatesWithHouseEngine, baseTransferInput, makeHouseInfo } from "../_helpers/mock-rates";

const D = (s: string) => new Date(s);
const rates = makeMockRatesWithHouseEngine();
const TD = D("2026-07-01");

const R993 = {
  type: "new_99_3", contractDate993: D("2002-03-01"), acquisitionType993: "from_builder", firstContract993: "yes",
  region993: "outside_speculation", standardPriceAtAcquisition993: 100_000_000, standardPriceAt5Years: 200_000_000,
  standardPriceAtTransfer993: 400_000_000, exclusiveAreaSqm993: 84,
};
const R99 = {
  type: "new_99", contractDate99: D("1998-06-01"), acquisitionType99: "from_builder", firstContract99: "yes",
  isNationalHousing99: false, standardPriceAtAcquisition99: 100_000_000, standardPriceAt5Years99: 160_000_000,
  standardPriceAtTransfer99: 250_000_000, exclusiveAreaSqm99: 84,
};
const R988 = {
  type: "unsold_98_8", contractDate988: D("2015-06-01"), acquisitionPrice988: 550_000_000, exclusiveAreaSqm988: 84.5,
  rentalContractDate988: D("2015-12-20"), rentalStartDate988: D("2016-01-01"), businessRegistrationDate988: D("2015-12-10"), rentalRegistrationDate988: D("2015-12-10"),
  isUnsoldAfterCompletion988: true, isFirstContract988: true, isNotRecontract988: true,
  standardPriceAtAcquisition988: 200_000_000, standardPriceAt5Years988: 300_000_000, standardPriceAtTransfer988: 400_000_000,
};

const input = (acq: string, reductions: unknown[], roster: boolean, selfDeclared5ho = false): TransferTaxInput =>
  baseTransferInput({
    propertyType: "housing", transferPrice: 900_000_000, acquisitionPrice: 300_000_000, acquisitionDate: D(acq), transferDate: TD,
    isRegulatedArea: true, householdHousingCount: 3, isOneHousehold: true, residencePeriodMonths: 0, reductions: reductions as never,
    ...(roster
      ? {
          sellingHouseId: "s",
          houses: [
            makeHouseInfo("s", { acquisitionDate: D(acq), regionCode: "4129010100", ...(selfDeclared5ho ? { isTaxSpecialExemption: true } : {}) } as never),
            makeHouseInfo("o1", { acquisitionDate: D("1990-01-01") } as never),
            makeHouseInfo("o2", { acquisitionDate: D("1990-01-01") } as never),
          ],
        }
      : {}),
  } as Partial<TransferTaxInput>);
const calc = (i: TransferTaxInput) => calculateTransferTax(i, rates);
const hasExclusionStep = (r: ReturnType<typeof calc>) => r.steps.some((s) => s.label.includes("감면주택 다주택 중과 배제"));

const CASES = [
  { name: "§99의3", r: R993, acq: "2003-09-01", fields: ["standardPriceAtTransfer993", "standardPriceAt5Years"], detail: "new993Detail", full: 105_171_000, ref: 155_166_000 },
  { name: "§99", r: R99, acq: "1999-03-01", fields: ["standardPriceAtTransfer99", "standardPriceAt5Years99"], detail: "new99Detail", full: 95_595_000, ref: 155_166_000 },
  { name: "§98의8", r: R988, acq: "2015-07-01", fields: ["standardPriceAtTransfer988", "standardPriceAt5Years988"], detail: "unsold988Detail", full: 134_166_000, ref: 176_286_000 },
] as const;

describe.each(CASES)("$name — 5년 후 양도 · 기준시가 미입력", ({ r, acq, fields, detail, full, ref }) => {
  it("전제 — 기준시가가 다 있으면 적격 · 차감 반영", () => {
    expect(calc(input(acq, [r], true)).totalTax).toBe(full);
    expect(calc(input(acq, [], true, true)).totalTax).toBe(ref);
  });

  it.each(fields.flatMap((f) => [true, false].map((roster) => [f, roster] as const)))(
    "B-1: 🔴 %s 비움 · 명부=%s — 차감 0 + MISSING_STD_PRICE · 배제 단계 · 「5호 선언 · 감면 없음」과 같은 세액",
    (field, roster) => {
      const res = calc(input(acq, [{ ...r, [field]: undefined }], roster));
      const d = (res as unknown as Record<string, { isEligible: boolean; ineligibleReasons: { code: string }[] }>)[detail];
      expect(d.isEligible).toBe(false);
      expect(d.ineligibleReasons.map((x) => x.code)).toEqual(["MISSING_STD_PRICE"]);
      expect(hasExclusionStep(res)).toBe(true);
      expect(res.totalTax).toBe(ref);
    },
  );
});

describe("대조 — 요건이 부적격이면 기준시가가 없어도 배제하지 않는다", () => {
  it("B-2: §99의3 계약 창 밖(2004-01-01 계약) · 양도시 기준시가 비움 → 중과 그대로", () => {
    const res = calc(input("2004-03-01", [{ ...R993, contractDate993: D("2004-01-01"), standardPriceAtTransfer993: undefined }], true));
    expect(hasExclusionStep(res)).toBe(false);
    expect(res.totalTax).toBe(calc(input("2004-03-01", [], true)).totalTax);
  });

  it("B-2b: §98의8 임대계약 2016년 체결(2015.12.31. 이전 한정 밖) · 양도시 기준시가 비움 → 중과 그대로", () => {
    const res = calc(input("2015-07-01", [{ ...R988, rentalContractDate988: D("2016-02-01"), standardPriceAtTransfer988: undefined }], true));
    expect(hasExclusionStep(res)).toBe(false);
    expect(res.totalTax).toBe(calc(input("2015-07-01", [], true)).totalTax);
  });
});
