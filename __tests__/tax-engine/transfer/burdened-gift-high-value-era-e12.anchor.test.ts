/**
 * E-12 — 부담부증여(「소득세법 시행령」 §159) × 1세대1주택 고가주택 기준금액은 **양도(증여)일 연혁**을 따른다.
 *
 * `burdened-gift-eligibility.ts`의 `HIGH_PRICE_THRESHOLD_KRW`(12억 리터럴)는 판정에 쓰이지 않는 사문 상수였다
 * (`void`로만 소비). 실제 비교·안분은 단건 정본 `checkExemptionCore`·`calcOneHouseProration`이
 * `resolveHighValueHouseThreshold(양도일)`로 하고, 분모만 증여가액 C(`burdenedGiftDenominator`, 해석 B)로 바꾼다.
 * 이 anchor는 그 경로가 12억 고정이 아님을 고정한다 — 2021-12-07 이전은 9억(법률 제18578호 부칙 · 영 §156①).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { baseTransferInput } from "../_helpers/mock-rates";
import type { BurdenedGiftInfo } from "@/lib/tax-engine/types/transfer-burdened-gift.types";

const info = {
  valuationMode: "sangjeungbeop_standard",
  lendingDepositTotal: 300_000_000,
  mortgageDebtAmount: 0,
  annualRentTotal: 0,
  donorRelation: "lineal_descendant",
  landStdPriceAtTransfer: 0,
  buildingStdPriceAtTransfer: 1_000_000_000, // C = 10억
  landStdPriceAtAcquisition: 0,
  buildingStdPriceAtAcquisition: 400_000_000,
} as BurdenedGiftInfo;

function run(td: string) {
  const i = baseTransferInput({
    propertyType: "housing",
    transferType: "burdened_gift",
    transferDate: new Date(td),
    transferPrice: 300_000_000,
    acquisitionPrice: 0,
    acquisitionDate: new Date("2010-03-01"),
    isOneHousehold: true,
    householdHousingCount: 1,
    residencePeriodMonths: 60,
    burdenedGiftInfo: info,
  } as never);
  return calculateTransferTax(i, loadFallbackTransferRates(i.transferDate));
}

describe("E-12 부담부증여 × 고가주택 기준금액 연혁", () => {
  it("2021-12-07 증여 · C 10억 → 9억 초과 안분(부분 과세) · 총세액 300,696", () => {
    const r = run("2021-12-07");
    expect(r.isExempt).toBe(false);
    expect(r.totalTax).toBe(300_696);
  });
  it("짝 — 2021-12-08 증여 · C 10억 → 12억 이하 전액 비과세", () => {
    const r = run("2021-12-08");
    expect(r.isExempt).toBe(true);
    expect(r.totalTax).toBe(0);
  });
});
