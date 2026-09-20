/**
 * Pre-Do 앵커 — G-5: 1세대1주택 고가주택 기준금액의 **양도일 시점 분기**.
 *
 * 계획서: `docs/00-pm/one-house-exemption-automation.plan.md` §4 G-5 · §9 P1.
 * 엔진 설계: `docs/02-design/features/one-house-exemption-automation.engine.design.md` 「계산 알고리즘」 1.
 *
 * ## 결함 (RED 시점 실측, 2026-09-20)
 *
 * 판정도 안분도 12억 단일값이라 **과거 양도분이 전액 비과세**로 나온다:
 *
 * | 케이스 | 양도일 · 양도가 (취득) | 종전 | 법령대로 |
 * |---|---|---|---|
 * | A | 2021-12-07 · 10억 (5억) | 전액 비과세 **0** | 과세차익 **50,000,000** |
 * | C | 2008-10-06 ·  7억 (3억) | 전액 비과세 **0** | 과세차익 **57,142,857** |
 *
 * 과세차익은 §95③·시행령 §160 안분과 정확히 일치한다:
 *   5억 × (10억 − 9억) / 10억 = 50,000,000 · 4억 × (7억 − 6억) / 7억 = 57,142,857
 *
 * ## 🔴 「seed만 교정」 함정 — 부정형 anchor의 긍정 짝
 *
 * 기준금액을 판정(`rule.maxExemptPrice`)에서만 낮추고 **안분 하드코딩을 남기면 더 나빠진다**:
 * 「9억 초과 → 일부 과세」로 판정해 놓고 안분은 「12억 이하 → 안분 없음」으로 처리해
 * **양도차익 전액**(5억)을 과세한다. A의 과세차익이 500,000,000이면 그 상태다.
 * G5-A2가 그것을 직접 막는다(`feedback_negative_anchor_needs_positive_twin`).
 *
 * 연혁 근거는 `lib/tax-engine/one-house/threshold.ts` JSDoc(법제처 DRF 실독 MST 89130·237497).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import {
  resolveHighValueHouseThreshold,
  HIGH_VALUE_HOUSE_9EOK_EFFECTIVE_DATE,
  HIGH_VALUE_HOUSE_12EOK_EFFECTIVE_DATE,
} from "@/lib/tax-engine/one-house/threshold";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const mockRates = makeMockRates();

/** 1세대1주택 · 보유/거주 요건 충족 · 비조정 · 필요경비 0 — 고가주택 축만 남긴 픽스처. */
function oneHouse(over: Partial<TransferTaxInput> = {}): TransferTaxInput {
  return baseTransferInput({
    propertyType: "housing",
    isOneHousehold: true,
    householdHousingCount: 1,
    residencePeriodMonths: 60,
    isRegulatedArea: false,
    expenses: 0,
    ...over,
  });
}

/** A — 9억 시대(2021-12-07) 10억 양도. 취득 5억. */
const CASE_A = {
  transferDate: new Date("2021-12-07"),
  transferPrice: 1_000_000_000,
  acquisitionPrice: 500_000_000,
  acquisitionDate: new Date("2010-01-01"),
};
/** C — 6억 시대(2008-10-06) 7억 양도. 취득 3억. */
const CASE_C = {
  transferDate: new Date("2008-10-06"),
  transferPrice: 700_000_000,
  acquisitionPrice: 300_000_000,
  acquisitionDate: new Date("2000-01-01"),
};

const day = (d: Date, delta: number) => new Date(d.getTime() + delta * 86_400_000);

describe("G-5 순수 함수 — resolveHighValueHouseThreshold(양도일)", () => {
  it("G5-F1 세 시대의 기준금액", () => {
    expect(resolveHighValueHouseThreshold(new Date("2000-01-01"))).toBe(600_000_000);
    expect(resolveHighValueHouseThreshold(new Date("2015-06-01"))).toBe(900_000_000);
    expect(resolveHighValueHouseThreshold(new Date("2026-02-16"))).toBe(1_200_000_000);
  });

  // 지정일 단언은 「범위」가 아니라 **경계 ±1일 등가성**으로 건다.
  it("G5-F2 9억 경계 — 시행일 당일부터 9억, 전날까지 6억", () => {
    expect(resolveHighValueHouseThreshold(HIGH_VALUE_HOUSE_9EOK_EFFECTIVE_DATE)).toBe(900_000_000);
    expect(resolveHighValueHouseThreshold(day(HIGH_VALUE_HOUSE_9EOK_EFFECTIVE_DATE, -1))).toBe(600_000_000);
    expect(HIGH_VALUE_HOUSE_9EOK_EFFECTIVE_DATE).toEqual(new Date("2008-10-07"));
  });

  it("G5-F3 12억 경계 — 시행일 당일부터 12억, 전날까지 9억", () => {
    expect(resolveHighValueHouseThreshold(HIGH_VALUE_HOUSE_12EOK_EFFECTIVE_DATE)).toBe(1_200_000_000);
    expect(resolveHighValueHouseThreshold(day(HIGH_VALUE_HOUSE_12EOK_EFFECTIVE_DATE, -1))).toBe(900_000_000);
    expect(HIGH_VALUE_HOUSE_12EOK_EFFECTIVE_DATE).toEqual(new Date("2021-12-08"));
  });
});

describe("G-5 엔진 — 과거 양도분이 전액 비과세로 새지 않는다", () => {
  it("★ G5-A1 2021-12-07 10억: 9억 초과분 안분 과세 (종전 0원)", () => {
    const r = calculateTransferTax(oneHouse(CASE_A), mockRates);
    expect(r.isExempt).toBe(false);
    expect(r.transferGain).toBe(500_000_000);
    expect(r.taxableGain).toBe(50_000_000); // 5억 × (10억 − 9억) / 10억
    expect(r.totalTax).toBeGreaterThan(0);
  });

  it("★ G5-A2 (긍정 짝) A의 과세차익은 **전액 5억이 아니다** — 안분 하드코딩 잔존 검출", () => {
    const r = calculateTransferTax(oneHouse(CASE_A), mockRates);
    // 판정만 9억으로 낮추고 안분이 12억으로 남으면 여기가 500,000,000이 된다.
    expect(r.taxableGain).not.toBe(500_000_000);
    expect(r.taxableGain).toBeLessThan(r.transferGain!);
  });

  it("G5-B 2021-12-08 10억 (대조): 12억 시대 — 전액 비과세 유지", () => {
    const r = calculateTransferTax(
      oneHouse({ ...CASE_A, transferDate: new Date("2021-12-08") }),
      mockRates,
    );
    expect(r.isExempt).toBe(true);
    expect(r.totalTax).toBe(0);
  });

  it("★ G5-C1 2008-10-06 7억: 6억 초과분 안분 과세 (종전 0원)", () => {
    const r = calculateTransferTax(oneHouse(CASE_C), mockRates);
    expect(r.isExempt).toBe(false);
    expect(r.transferGain).toBe(400_000_000);
    expect(r.taxableGain).toBe(57_142_857); // 4억 × (7억 − 6억) / 7억
    expect(r.totalTax).toBeGreaterThan(0);
  });

  it("★ G5-C2 (긍정 짝) C의 과세차익은 전액 4억이 아니다", () => {
    const r = calculateTransferTax(oneHouse(CASE_C), mockRates);
    expect(r.taxableGain).not.toBe(400_000_000);
  });

  it("G5-D 2008-10-07 7억 (대조): 9억 시대 — 전액 비과세 유지", () => {
    const r = calculateTransferTax(
      oneHouse({ ...CASE_C, transferDate: new Date("2008-10-07") }),
      mockRates,
    );
    expect(r.isExempt).toBe(true);
    expect(r.totalTax).toBe(0);
  });

  it("G5-E (현행 회귀) 2026-02-16 14억: 12억 안분 — 값 불변", () => {
    const r = calculateTransferTax(
      oneHouse({
        transferDate: new Date("2026-02-16"),
        transferPrice: 1_400_000_000,
        acquisitionPrice: 500_000_000,
        acquisitionDate: new Date("2010-01-01"),
      }),
      mockRates,
    );
    expect(r.isExempt).toBe(false);
    expect(r.taxableGain).toBe(128_571_428); // floor(9억 × 2억 / 14억) — 종전과 같은 값
  });
});

/**
 * 표시 축 — **적힌 산식이 적힌 값을 만들어야 한다**.
 *
 * 종전 문구는 「12억」을 리터럴로 적었다. 기준금액만 시점 함수로 바꾸고 문구를 두면
 * 2008-10-06 7억 양도에서 「4억 × (양도가 7억 − 12억) / 7억」이라 적히고 값은 57,142,857이 된다
 * — 적힌 대로 계산하면 **음수**다(F-18~F-21과 같은 축).
 */
describe("G-5 표시 — 산출근거 문구의 기준금액이 실제 쓴 값이다", () => {
  /** 「gain × (분모 − T억) / 분모」를 문자열에서 직접 검산한다. */
  function reproducesFromFormula(formula: string, amount: number): boolean {
    const m = formula.match(/^([\d,]+) × \(\S+ ([\d,]+) - (\d+)억\) \/ \(\S+ ([\d,]+)\)$/);
    if (!m) return false;
    const n = (x: string) => Number(x.replace(/,/g, ""));
    const [, gain, denom, eok, denom2] = m;
    if (n(denom) !== n(denom2)) return false;
    return Math.floor((n(gain) * (n(denom) - Number(eok) * 100_000_000)) / n(denom)) === amount;
  }

  const prorationStep = (input: TransferTaxInput) =>
    calculateTransferTax(input, mockRates).steps.find((s) => s.label.startsWith("과세 양도차익 ("));

  it("G5-DISP1 2021-12-07 — 「9억」이라 적고, 적힌 산식이 적힌 값을 만든다", () => {
    const step = prorationStep(oneHouse(CASE_A));
    expect(step).toBeDefined();
    expect(step!.label).toBe("과세 양도차익 (9억 초과분)");
    expect(step!.formula).toContain("- 9억");
    expect(step!.formula).not.toContain("12억");
    expect(reproducesFromFormula(step!.formula!, step!.amount!)).toBe(true);
  });

  it("G5-DISP2 2008-10-06 — 「6억」이라 적는다", () => {
    const step = prorationStep(oneHouse(CASE_C));
    expect(step!.label).toBe("과세 양도차익 (6억 초과분)");
    expect(reproducesFromFormula(step!.formula!, step!.amount!)).toBe(true);
  });

  it("G5-DISP3 (현행 회귀) 2026 — 종전대로 「12억」", () => {
    const step = prorationStep(
      oneHouse({
        transferDate: new Date("2026-02-16"),
        transferPrice: 1_400_000_000,
        acquisitionPrice: 500_000_000,
        acquisitionDate: new Date("2010-01-01"),
      }),
    );
    expect(step!.label).toBe("과세 양도차익 (12억 초과분)");
    expect(reproducesFromFormula(step!.formula!, step!.amount!)).toBe(true);
  });
});

/**
 * 판정↔안분 **짝** — 재개발 완공 신축APT.
 *
 * 🔴 이 경로는 고가 판정을 메인 판정(`checkExemptionCore`)에서 받아 오고
 *    (`transfer-tax-redevelopment-steps.ts` `isHighValue = aptExemption.isPartialExempt`),
 *    안분은 `applyHighValueAllocation`이 따로 한다. 판정만 시점 함수로 옮기고 안분을 12억으로
 *    두면 `taxableRatio = (10억 − 12억) / 10억 = −0.2` — **과세대상 양도차익이 음수**가 된다.
 *    (같은 함정이 부담부증여 축에서 이미 실측됐다 — `burdened-gift-redevelopment-apt.anchor.test.ts`
 *     「과세대상 양도차익이 −471,250,000」.)
 */
describe("G-5 재개발 APT — 판정과 안분이 같은 기준금액을 본다", () => {
  const redevApt = (transferDate: Date, transferPrice: number): TransferTaxInput =>
    baseTransferInput({
      propertyType: "redevelopment_apt",
      transferPrice,
      transferDate,
      acquisitionDate: new Date("2007-04-09"),
      acquisitionPrice: 450_000_000,
      expenses: 0,
      useEstimatedAcquisition: false,
      isOneHousehold: true,
      householdHousingCount: 1,
      residencePeriodMonths: 66,
      redevelopment: {
        subject: "apt",
        approvalLawBasis: "urban_renovation_art_74",
        approvalDate: new Date("2013-10-23"),
        rightsValue: 600_000_000,
        settlementDirection: "pay",
        settlementAmount: 100_000_000,
        preApprovalExpenses: 0,
        postApprovalExpenses: 0,
        originalAssetType: "housing",
      },
    });

  it("★ G5-R1 2021-12-07 10억: 안분이 걸리고 과세대상이 **음수가 아니다**", () => {
    const r = calculateTransferTax(redevApt(new Date("2021-12-07"), 1_000_000_000), mockRates);
    const alloc = r.redevelopmentDetail?.highValueAllocation;
    expect(alloc).toBeDefined();
    expect(alloc!.taxableGain).toBeGreaterThan(0);
    expect(alloc!.nontaxableGain).toBeGreaterThan(0);
    expect(r.taxableGain).toBeGreaterThanOrEqual(0);
    // (10억 − 9억) / 10억 = 0.1 — 안분 전 합계의 10%
    const before = alloc!.taxableGain + alloc!.nontaxableGain;
    expect(alloc!.taxableGain).toBe(Math.floor(before * 0.1));
  });

  it("G5-R2 산출근거 문구도 「9억」이라 적는다", () => {
    const r = calculateTransferTax(redevApt(new Date("2021-12-07"), 1_000_000_000), mockRates);
    const step = r.steps.find((s) => s.label.includes("초과 과세대상 양도차익 안분"));
    expect(step).toBeDefined();
    expect(step!.label).toContain("9억");
    expect(step!.formula).toContain("- 9억");
  });

  it("G5-R3 (현행 회귀) 2023-02-16 10억: 12억 이하 — 전액 비과세 유지", () => {
    const r = calculateTransferTax(redevApt(new Date("2023-02-16"), 1_000_000_000), mockRates);
    expect(r.isExempt).toBe(true);
    expect(r.totalTax).toBe(0);
  });
});

/**
 * 토지·건물 **분리 소유** 안분 — 장기보유특별공제 쪽 12억(`transfer-tax-lthd.ts` `isProratedSplit`).
 *
 * 과세 양도차익(`calcOneHouseProration`)과 **다른 지점**이라 따로 지켜야 한다. 실측: 이 지점만
 * 12억으로 되돌리면 2008-10-06 양도의 **세액이 42,706,714 → 0**이 된다 — 과세 양도차익은
 * 200,000,000으로 맞는데 LTHD를 12억 기준으로 깎아 소득금액이 사라지기 때문이다.
 * (판정·안분·LTHD 세 지점이 같은 기준금액을 봐야 하는 이유.)
 */
describe("G-5 토지·건물 분리 소유 — LTHD 안분도 같은 기준금액을 본다", () => {
  const splitHouse = (transferDate: Date): TransferTaxInput =>
    baseTransferInput({
      propertyType: "housing",
      transferPrice: 1_000_000_000,
      acquisitionPrice: 450_000_000,
      isOneHousehold: true,
      householdHousingCount: 1,
      residencePeriodMonths: 60,
      isSeparateAcquisition: true,
      selfOwns: "land_only",
      landAcqMode: "actual",
      buildingAcqMode: "actual",
      landTransferPrice: 700_000_000,
      buildingTransferPrice: 300_000_000,
      landStandardPriceAtTransfer: 700_000_000,
      buildingStandardPriceAtTransfer: 300_000_000,
      landAcquisitionPrice: 200_000_000,
      buildingAcquisitionPrice: 250_000_000,
      acquisitionDate: new Date("2000-01-01"),
      landAcquisitionDate: new Date("1998-01-01"),
      transferDate,
    });

  it("★ G5-S1 2008-10-06: 과세 양도차익은 6억 기준이고 **세액이 0으로 사라지지 않는다**", () => {
    const r = calculateTransferTax(splitHouse(new Date("2008-10-06")), mockRates);
    expect(r.isExempt).toBe(false);
    expect(r.taxableGain).toBe(200_000_000); // 5억 × (10억 − 6억) / 10억
    // 🔴 LTHD 안분이 12억으로 남으면 여기가 0이 된다(실측). 2008년 세율·장특 축 자체의
    //    정확성은 이 anchor의 대상이 아니라서 금액을 못 박지 않는다 — 「사라지지 않는다」를 잡는다.
    expect(r.totalTax).toBeGreaterThan(0);
  });

  it("G5-S2 2021-12-07: 9억 기준 안분", () => {
    const r = calculateTransferTax(splitHouse(new Date("2021-12-07")), mockRates);
    expect(r.taxableGain).toBe(50_000_000); // 5억 × (10억 − 9억) / 10억
  });

  it("G5-S3 (현행 회귀) 2026-02-16: 12억 이하 — 전액 비과세 유지", () => {
    const r = calculateTransferTax(splitHouse(new Date("2026-02-16")), mockRates);
    expect(r.isExempt).toBe(true);
    expect(r.totalTax).toBe(0);
  });
});
