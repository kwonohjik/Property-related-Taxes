/**
 * F-12 Pre-Do anchor — 단일시점(양도) 모드가 연도교차 §164⑧ 창을 가로챈다.
 *
 * §164⑧ 진입 조건은 `building-standard-price.ts` 에서 이미 넓다:
 *   const isSameYear = transferYear === acquisitionYear;
 *   const inSameAdjustmentWindow = transferYear <= acquisitionYear + 1;
 *   if (isSameYear || (inSameAdjustmentWindow && input.holdingMonths !== undefined)) { ... }
 *
 * 그런데 **그보다 위에 있는 단일시점 우회 가드는 여전히 「연도 동일」만 예외로 둔다**:
 *   const sameYearBoth = input.acquisitionYear !== undefined && input.acquisitionYear === input.transferYear;
 *   if (input.singleTimePoint && !sameYearBoth && ...) { … 그 시점만 계산하고 조기 반환 … }
 *
 * 같은 좁은 축이 네 층에 복제돼 있다:
 *   ① 엔진      `sameYearBoth`                         (building-standard-price.ts)
 *   ② ④변환     `isSameYearTransfer(...)`               (building-std-price-form.ts · toEngineInput)
 *   ③ ⑧검증     `isSameYearTransfer(...)`               (building-std-price-form.ts · validate)
 *   ④ UI        `singleActive = ... && !sameYear && ...` (BuildingStdPriceForm.tsx)
 * 넓은 축은 엔진의 §164⑧ 진입 조건 하나뿐이다 ⇒ 연도교차 opt-in 을 켜고 값을 채워도
 * 그 필드가 엔진 입력에서 사라지고 §164⑧ 대신 당해연도 일반산식이 적용된다.
 *
 * 법령: 「소득세법 시행령」 제164조 제8항 · 「소득세법 시행규칙」 제80조 제1항 제1호 본문
 *   ("취득일이 속하는 연도의 **다음 연도 말일이전**에 양도하는 경우") — 연도가 달라도 성립한다.
 *
 * 실측(2026-08-26 · 양도 · rc · 용도1 · 200㎡ · 신축 2000 · 취득 2005 / 양도 2006 ·
 *      취득·양도 공시지가 3,000,000 · 전기 500,000 · 보유 12월 · 조정 12월):
 *   2시점                    양도당시 120,800,000  (sameYearAdjusted=true)
 *   단일시점 transfer         양도당시 **104,600,000** (sameYearAdjusted=false) ← −16,200,000 (−13.4%)
 *   동일연도 + 단일시점       양도당시 120,800,000  (기존 `sameYearBoth` 가 정상 동작)
 *
 * ⚠️ 수정 시 **UI 게이트를 함께 넓혀야 한다.** §164⑧ 경로는 취득당시 구조·용도·공시지가가 필수인데
 *    `transferOnly` 가 그 입력들을 숨기므로, 엔진만 고치면 「취득시: 구조 미선택」 throw 로 바뀌어
 *    해소 수단이 없는 dead-end 가 된다 ⇒ `singleActive` 도 같은 술어를 쓴다.
 *
 * ⚠️ §1 은 **F-12 수정 전에 실패한다** — 의도된 Pre-Do anchor다.
 */
import { describe, it, expect } from "vitest";
import { calcBuildingStandardPrice } from "@/lib/tax-engine/building-standard-price";
import { isSameAdjustmentPeriodConversion } from "@/lib/tax-engine/same-adjustment-period-std-price";
import type { BuildingStandardPriceInput } from "@/lib/tax-engine/types/building-standard-price.types";

const BASE: BuildingStandardPriceInput = {
  taxType: "transfer",
  floorArea: 200,
  builtYear: 2000,
  acquisitionYear: 2005,
  transferYear: 2006,
  holdingMonths: 12,
  adjustMonths: 12,
  acquisition: { structureKey: "rc", usageNo: 1, landPricePerM2: 3_000_000 },
  transfer: { structureKey: "rc", usageNo: 1, landPricePerM2: 3_000_000 },
  prevLandPricePerM2: 500_000,
};

describe("F-12 §164⑧ 연도교차 × 단일시점 — §1 단일시점이 환산을 가로채지 않는다 (수정 전 실패)", () => {
  it("단일시점(양도) + 연도교차 §164⑧ → 양도당시 120,800,000 (현재 104,600,000)", () => {
    const r = calcBuildingStandardPrice({ ...BASE, singleTimePoint: "transfer" });
    expect(r.sameYearAdjusted).toBe(true);
    expect(r.transfer?.standardPrice).toBe(120_800_000);
  });

  it("단일시점 결과가 2시점 결과와 같아야 한다 — 같은 사실관계이므로", () => {
    const two = calcBuildingStandardPrice(BASE);
    const one = calcBuildingStandardPrice({ ...BASE, singleTimePoint: "transfer" });
    expect(one.transfer?.standardPrice).toBe(two.transfer?.standardPrice);
  });
});

describe("F-12 §164⑧ 연도교차 × 단일시점 — §2 공용 술어 (수정 전 실패: 미존재)", () => {
  /** 네 층이 이 leaf 하나를 같은 인자로 부른다 — 「술어 공유 ≠ 단일 소스」를 막는 것이 요점이다. */
  it("동일연도는 opt-in 과 무관하게 참", () => {
    expect(isSameAdjustmentPeriodConversion(2005, 2005, false)).toBe(true);
    expect(isSameAdjustmentPeriodConversion(2005, 2005, true)).toBe(true);
  });

  it("연도교차 창(취득+1년) 안이고 opt-in 이면 참", () => {
    expect(isSameAdjustmentPeriodConversion(2005, 2006, true)).toBe(true);
  });

  it("연도교차 창 안이어도 opt-in 이 없으면 거짓", () => {
    expect(isSameAdjustmentPeriodConversion(2005, 2006, false)).toBe(false);
  });

  it("창을 벗어나면 opt-in 이어도 거짓", () => {
    expect(isSameAdjustmentPeriodConversion(2005, 2007, true)).toBe(false);
  });

  it("양도가 취득보다 앞서면 거짓 — 상한만 보던 종전 축은 역순 연도를 통과시켰다", () => {
    expect(isSameAdjustmentPeriodConversion(2006, 2005, true)).toBe(false);
    expect(isSameAdjustmentPeriodConversion(2022, 2021, true)).toBe(false);
  });

  it("연도가 없으면 거짓", () => {
    expect(isSameAdjustmentPeriodConversion(undefined, 2006, true)).toBe(false);
    expect(isSameAdjustmentPeriodConversion(2005, undefined, true)).toBe(false);
  });
});

describe("F-12 §164⑧ 연도교차 × 단일시점 — §3 역방향 가드 (수정 후에도 불변)", () => {
  it("동일연도 + 단일시점(양도)은 종전대로 §164⑧ 적용 — 120,800,000", () => {
    const r = calcBuildingStandardPrice({
      ...BASE,
      transferYear: 2005,
      singleTimePoint: "transfer",
    });
    expect(r.sameYearAdjusted).toBe(true);
    expect(r.transfer?.standardPrice).toBe(120_800_000);
  });

  it("§164⑧ 대상이 아니면(보유월수 미입력) 단일시점 우회가 그대로 동작한다", () => {
    const r = calcBuildingStandardPrice({
      ...BASE,
      holdingMonths: undefined,
      singleTimePoint: "transfer",
    });
    expect(r.sameYearAdjusted ?? false).toBe(false);
    expect(r.acquisition).toBeUndefined();
    expect(r.transfer?.standardPrice).toBe(104_600_000);
  });

  it("단일시점(취득)은 §164⑧ 대상이 아닐 때 종전대로 취득만 계산한다", () => {
    const r = calcBuildingStandardPrice({
      ...BASE,
      holdingMonths: undefined,
      singleTimePoint: "acquisition",
    });
    expect(r.transfer).toBeUndefined();
    expect(r.acquisition?.standardPrice).toBe(104_600_000);
  });
});
