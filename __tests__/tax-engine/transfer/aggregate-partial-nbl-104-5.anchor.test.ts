/**
 * anchor: 다건 **그룹 합산 경로**가 §104⑤를 우회하지 않는다 (P10 / D-12)
 *
 * 계획서: docs/02-design/features/transfer-104-5-proviso-mixed-use-rate-gaps.plan.md
 *   §D-12 · §4.8(설계)
 *
 * ── 무엇을 고정하는가 ──────────────────────────────────────────────────
 * 자산별 경로(`assetTaxOf`)는 `resolveSplitAwareTax`를 쓰지만, **그룹 합산 경로**
 * (`transfer-tax-aggregate-helpers.ts:457`·`:498`)는 `calcTax`를 **직접** 부른다 — dual-truth다.
 * `correctedSingleInput`에는 `nonBusinessLandAreaRatio`가 실려 있으므로
 * (`transfer-tax-aggregate.ts:280`), 부분 비사토 자산이 그 경로를 타면 `calcTax` T-2가
 * **P8이 폐기한 모델 A**(`누진(전체 과세표준) + 10%p × 비사토분`)로 계산한다 — 과다과세 회귀.
 *
 * [법령 — §104⑤ 본문 후단] 한 필지가 §104의3 비사업용 토지와 그 외로 구분되면
 *   **각각을 별개의 자산으로 보아** 산출세액을 계산한다(2018.4.1. 이후 양도분).
 *
 * ⇒ 부분 비사토 자산이 그룹에 있으면 **합산 1회로 보내지 않는다**(`splitParts`와 같은 취급).
 *   자산별 합으로 가면 각 자산이 `computePartialNblTax`를 타 §104⑤가 정상 적용된다.
 *
 * ⚠️ 단서 ⓐ(동일 호 합산) 혜택은 포기한다 — D-7과 같은 성질이다. 다만 **법문 밖 산식(모델 A)을
 *   법문 안 선택지(§104⑤2호 본문)로** 바꾸는 것이라 방향이 명확하다. 완전한 구현은 의제된
 *   **파트 단위 그룹핑**이며 대규모 리팩터라 범위 밖이다(§4.8).
 */
import { describe, it, expect } from "vitest";
import {
  calculateTransferTaxAggregate,
  type AggregateTransferInput,
  type TransferTaxItemInput,
} from "@/lib/tax-engine/transfer-tax-aggregate";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";

const mockRates = makeMockRates();
const D = (s: string) => new Date(s);

/**
 * 주택 부수토지 배율 초과 → **부분** 비사업용(§104의3①5호).
 * 수도권 일반주거 3배 ⇒ 허용 300㎡, 전체 600㎡ → 초과 300㎡ ⇒ `nonBusinessAreaRatio = 0.5`.
 * `judgeNonBusinessLand`가 파생해 `nonBusinessLandAreaRatio`로 주입한다.
 */
function partialNblDetails(landArea: number) {
  return {
    landType: "housing_site" as const,
    landArea,
    zoneType: "general_residential" as const,
    acquisitionDate: D("2015-01-01"),
    transferDate: D("2026-06-01"),
    housingFootprint: 100,
    isMetropolitanArea: true,
    businessUsePeriods: [],
    gracePeriods: [],
  };
}

function land(id: string, gain: number, o: Partial<TransferTaxItemInput> = {}): TransferTaxItemInput {
  return {
    ...(baseTransferInput() as unknown as TransferTaxItemInput),
    propertyId: id,
    propertyLabel: id,
    propertyType: "land",
    acquisitionDate: D("2015-01-01"), // 11년 보유 → `non_business_land` 그룹(24개월 이상)
    transferDate: D("2026-06-01"),
    acquisitionPrice: 0,
    transferPrice: gain,
    isOneHousehold: false,
    householdHousingCount: 0,
    isRegulatedArea: false,
    isNonBusinessLand: true,
    ...o,
  };
}

/** 부분 비사토(ratio 0.5) */
const partial = (id: string, gain: number) =>
  land(id, gain, { nonBusinessLandDetails: partialNblDetails(600) } as Partial<TransferTaxItemInput>);
/** 전량 비사토(ratio 1) — 정밀판정 미제공 */
const full = (id: string, gain: number) => land(id, gain);

function agg(properties: TransferTaxItemInput[]) {
  const input: AggregateTransferInput = {
    taxYear: 2026,
    annualBasicDeductionUsed: 2_500_000, // 기본공제 소진 → 과세표준 = 양도소득금액
    properties,
  };
  return calculateTransferTaxAggregate(input, mockRates);
}

describe("P10 / D-12 — 그룹 합산 경로가 §104⑤를 우회하지 않는다", () => {
  it("B-33: 부분 비사토 2건 — 그룹 합산 1회가 아니라 **자산별 합**으로 간다", () => {
    const r = agg([partial("L1", 300_000_000), partial("L2", 300_000_000)]);
    const g = r.groupTaxes.find((x) => x.group === "non_business_land");
    expect(g).toBeDefined();
    // 종전: 그룹 합산 1회 `calcTax(groupTaxBase, …)` → 모델 A(누진 전체 + 10%p×ratio분)
    // 정정: 자산별 합 — 각 자산이 `computePartialNblTax`로 §104⑤ MAX를 수행
    expect(g!.groupCalculatedTax).toBe(137_960_000);
  });

  it("B-34: 부분 비사토 + 전량 비사토 혼재 — 역시 자산별 합", () => {
    const r = agg([partial("L1", 300_000_000), full("L2", 300_000_000)]);
    const g = r.groupTaxes.find((x) => x.group === "non_business_land");
    expect(g!.groupCalculatedTax).toBe(161_360_000);
  });
});

describe("P10 회귀 — 바꾸지 않은 경로", () => {
  /**
   * ⚠️ **한 번 잘못 바꿨다가 되돌린 값이다**(P11 오류 · 2026-08-02).
   * §104⑤2호 **본문**의 「자산별」이 곧 **호별 합산**이라고 예규가 못박고 있다 —
   * 「"자산별"에서 "자산"의 의미는 동법 **제104조 각 호별로 합산한 자산**을 의미」
   * (「기획재정부 재산세제과-536」 2018.6.19. · 국세청 「기준-2018-법령해석재산-0098」).
   * ⇒ 같은 호 자산의 합산은 **무조건**이며, 자산별 **적용세율**이 같은지는 묻지 않는다.
   */
  it("B-35: **전량** 비사토(ratio 1)만 있는 그룹은 합산 1회 유지 — 불변", () => {
    // 별개 자산으로 나눌 대상이 없으므로 §104⑤ 분기 자체가 없다. 종전 동작 그대로.
    const r = agg([full("L1", 300_000_000), full("L2", 300_000_000)]);
    const g = r.groupTaxes.find((x) => x.group === "non_business_land");
    expect(g!.groupTaxBase).toBe(468_000_000); // 합산 base로 1회 계산
    expect(g!.groupCalculatedTax).toBe(208_060_000);
  });

  it("B-35b: 비사업용토지가 아닌 다건은 종전대로 합산 1회 — 불변", () => {
    const r = agg([
      land("P1", 200_000_000, { isNonBusinessLand: false }),
      land("P2", 300_000_000, { isNonBusinessLand: false }),
    ]);
    const g = r.groupTaxes.find((x) => x.group === "progressive");
    expect(g!.groupTaxBase).toBe(390_000_000);
    expect(g!.groupCalculatedTax).toBe(130_060_000);
  });
});
