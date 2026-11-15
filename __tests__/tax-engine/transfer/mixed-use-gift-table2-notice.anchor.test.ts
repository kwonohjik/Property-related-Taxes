/**
 * anchor — 겸용주택 주택분: 증여 전 동일세대 거주의 표2 대상 판정 통산 확인 필요 고지가 일반 주택과 같은가
 * (계획서 `docs/00-pm/mixed-use-table2-gift-notice.plan.md`).
 *
 * 겸용 엔진은 증여 전 동일세대 거주 개월을 표2 대상 판정에 통산한다(`transfer-tax-mixed-use.ts` `table2ResidenceYears` · 결정 #38-9).
 * 일반 경로는 같은 사실에 `giftTable2PriorResidenceNotice`로 고지하는데, 겸용은 이 고지를 부르지 않아 결과에 확인 필요가 0건이었다
 * (수정 전 실측: MT-1·MT-2 고지 0건 · 공제율·공제액은 아래 값 그대로). 세액은 바뀌지 않는다 — 고지만 더한다.
 *
 * 사실관계: 증여자 2008-01-01 취득 → 2019-03-01 증여 → 2025-06-15 양도 · 증여자와 계속 같은 세대(세대 보유 시작 2008) · 1세대 1주택.
 * 겸용 픽스처는 사례14(주택 연면적 < 상가 연면적 → 주택분만 주택).
 *
 * | # | 주장 |
 * |---|---|
 * | MT-1 | 증여 전 24개월 · 본인 0 · 30억 → 표2 24%(통산) · 조심 2025서3843 확인 필요 1건 · 문장이 같은 사실의 일반 주택과 같다 |
 * | MT-2 | 증여 전 거주 미답 · 본인 0 → 표1 12% · 「그 개월 수를 입력하세요」 1건 · 일반 주택과 같은 문장 |
 * | MT-3 | 고지 없음 — 입력 0 · 본인 거주만으로 표2 · 12억 이하 전액 비과세 · 같은 세대 아님 · 보유 3년 미만(공제 0) · 다주택(비과세 아님) |
 */
import { describe, it, expect } from "vitest";
import { calcMixedUseTransferTaxIdN as calcMixed } from "../_helpers/mixed-use-identity-std";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import { mixedUseCase14 } from "../_helpers/mixed-use-fixture";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";
import type { GiftHouseholdBasis } from "@/lib/tax-engine/one-house/gift-household-basis";

const rates = makeMockRates();
const D = (s: string) => new Date(s);
const DONOR = D("2008-01-01");
const GIFT = D("2019-03-01");
const TRANSFER = D("2025-06-15");
const TRIBUNAL = "조심 2025서3843";
const ASK = "그 개월 수를 입력하세요";

const basis = (over: Partial<GiftHouseholdBasis> = {}): GiftHouseholdBasis => ({
  giftDate: GIFT,
  donorAcquisitionDate: DONOR,
  continuousSameHousehold: true,
  householdHoldingStartDate: DONOR,
  ...over,
});

function mixed(price: number, b: GiftHouseholdBasis, ownYears: number, over: Partial<MixedUseAssetInput> = {}) {
  return calcMixed(
    price,
    TRANSFER,
    {
      ...mixedUseCase14(),
      landAcquisitionDate: GIFT,
      buildingAcquisitionDate: GIFT,
      residencePeriodYears: ownYears,
      isOneHousehold: true,
      isOneHouseExempt: true,
      householdHousingCountForExclusion: 1,
      acquisitionCause: "gift",
      giftHouseholdBasis: b,
      ...over,
    } as MixedUseAssetInput,
    rates,
  );
}

/** 같은 사실의 일반(비겸용) 주택 — 문장 대조용. */
function single(b: GiftHouseholdBasis) {
  return calculateTransferTax(
    baseTransferInput({
      propertyType: "housing",
      isOneHousehold: true,
      householdHousingCount: 1,
      acquisitionCause: "gift",
      acquisitionDate: GIFT,
      transferDate: TRANSFER,
      transferPrice: 3_000_000_000,
      acquisitionPrice: 500_000_000,
      expenses: 0,
      residencePeriodMonths: 0,
      regionCode: "4143010100",
      giftHouseholdBasis: b,
    }),
    rates,
  );
}

const notices = (w: string[] | undefined, key: string) => (w ?? []).filter((x) => x.includes(key));

describe("MT-1 — 통산이 표2를 연 경우 조심 2025서3843 확인 필요", () => {
  it("증여 전 24개월 · 본인 0 · 30억 → 표2 24% · 공제액 67,948,759(세액 불변) · 고지 1건 = 일반 주택 문장", () => {
    const r = mixed(3_000_000_000, basis({ priorHouseholdResidenceMonths: 24 }), 0);
    expect(r.calculationRoute.highValueRule).toBe("above_threshold_prorated");
    expect(r.housingPart.longTermDeductionTable).toBe(2);
    expect(r.housingPart.longTermDeductionRate).toBeCloseTo(0.24, 10);
    expect(r.housingPart.longTermDeductionAmount).toBe(67_948_759);
    const w = notices(r.warnings, TRIBUNAL);
    expect(w).toHaveLength(1);
    expect(w[0]).toContain("증여 전 동일세대로 거주한 24개월");
    expect(w).toEqual(notices(single(basis({ priorHouseholdResidenceMonths: 24 })).warnings, TRIBUNAL));
  });
});

describe("MT-2 — 증여 전 거주 미답이면 입력 안내", () => {
  it("미답 · 본인 0 → 표1 12% · 공제액 33,974,379 · 「그 개월 수를 입력하세요」 1건 = 일반 주택 문장", () => {
    const r = mixed(3_000_000_000, basis(), 0);
    expect(r.housingPart.longTermDeductionTable).toBe(1);
    expect(r.housingPart.longTermDeductionAmount).toBe(33_974_379);
    const w = notices(r.warnings, ASK);
    expect(w).toHaveLength(1);
    expect(w).toEqual(notices(single(basis()).warnings, ASK));
    expect(notices(r.warnings, TRIBUNAL)).toHaveLength(0);
  });
});

describe("MT-3 — 결론을 가르지 않으면 고지 없음", () => {
  const none = (r: ReturnType<typeof mixed>) => {
    expect(notices(r.warnings, TRIBUNAL)).toHaveLength(0);
    expect(notices(r.warnings, ASK)).toHaveLength(0);
  };
  it("증여 전 거주 0(거주한 적 없음)", () => none(mixed(3_000_000_000, basis({ priorHouseholdResidenceMonths: 0 }), 0)));
  it("본인 거주 3년만으로 표2", () => {
    const r = mixed(3_000_000_000, basis({ priorHouseholdResidenceMonths: 24 }), 3);
    expect(r.housingPart.longTermDeductionTable).toBe(2);
    none(r);
  });
  it("12억 이하 전액 비과세 — 공제를 따질 일이 없다", () => {
    const r = mixed(1_000_000_000, basis(), 0);
    expect(r.calculationRoute.highValueRule).toBe("below_threshold_exempt");
    none(r);
  });
  it("증여자와 계속 같은 세대 아님 — 통산 불성립", () => none(mixed(3_000_000_000, basis({ continuousSameHousehold: false }), 0)));
  it("보유 3년 미만 — 장기보유특별공제 0", () => {
    const late = D("2023-03-01");
    const r = mixed(3_000_000_000, basis({ giftDate: late }), 0, { landAcquisitionDate: late, buildingAcquisitionDate: late });
    expect(r.housingPart.longTermDeductionAmount).toBe(0);
    none(r);
  });
  it("다주택(1세대1주택 비과세 아님) — 표2 축 불성립", () => {
    const r = mixed(3_000_000_000, basis(), 0, { isOneHouseExempt: false, householdHousingCountForExclusion: 3 });
    expect(r.housingPart.longTermDeductionTable).toBe(1);
    none(r);
  });
});
