/**
 * 감사 확정 결함 회귀 테스트 — lib/tax-engine/transfer-tax-helpers.ts
 *
 * ref D1 (transfer-tax-helpers.ts:458): 부수토지 일체과세(L-1b) 장기보유특별공제에
 *   3년 보유 게이트 누락 → 주 주택 2~3년 보유 구간에서 존재하지 않는 LTHD 부여.
 *   법령근거: 소득세법 §95② — 장기보유특별공제 진입요건 = 보유기간 3년 이상.
 *   같은 함수 일반경로 rateForYears는 `years < 3 → 0` 게이트 보유(내부 정합).
 *
 * ref D2 (transfer-tax-helpers.ts:536): 토지/건물 분리(split) 12억 초과분 안분에
 *   safeMultiplyThenDivide(BigInt 가드) 대신 원시 곱셈 → 분자 2^53 초과 시 ±1원 오차.
 *   법령근거: 정수연산 정책 P0-2/P0-4 + 소득세법 §89①3호 12억 초과분 안분.
 *   비-split 경로(calcOneHouseProration → calculateProration)와 결과 일관성.
 *
 * 기대값은 조문(§95²)·정수정의(BigInt exact)에서 독립 도출. 수정 코드 출력 복사 아님.
 */
import { describe, it, expect } from "vitest";
import {
  calcLongTermHoldingDeduction,
  parseRatesFromMap,
} from "@/lib/tax-engine/transfer-tax-helpers";
import { calculateProration, applyRate } from "@/lib/tax-engine/tax-utils";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import type { SplitGainResult } from "@/lib/tax-engine/types/transfer.types";

const RULES = parseRatesFromMap(makeMockRates()).longTermHoldingRules;

/** 부수토지 일체과세(L-1b) 진입 입력 — primaryContextForCompanionRate 주입 */
function appurtenantLandInput(over: Partial<TransferTaxInput>, holdingMonths: number): TransferTaxInput {
  return baseTransferInput({
    propertyType: "land",
    landNature: "appurtenant_to_housing",
    acquisitionDate: new Date("2021-01-01"),
    transferDate: new Date("2024-06-01"),
    isUnregistered: false,
    primaryContextForCompanionRate: {
      propertyType: "housing",
      holdingMonths,
      buildingFootprintArea: 100,
      isUrbanArea: true,
    },
    ...over,
  });
}

describe("D1 — 부수토지 일체과세 LTHD 3년 게이트 (§95②)", () => {
  const TAXABLE_GAIN = 100_000_000;

  it("표1(일반): 주 주택 30개월이어도 **토지 자신**이 3년 5개월 → 표1 6% (F11 정정)", () => {
    // 🔁 2026-08-13 기대값 갱신 (F11) — 종전 기대는 deduction 0 / rate 0 이었다.
    //
    // 갱신이 정당한 이유: 이 파일 헤더가 밝히듯 D1은 #591 감사 R7이 **24개월 게이트를 36개월로**
    //   고치며 만든 테스트다. 「그 36개월을 **누구 것으로** 세는가」라는 축은 검토된 적이 없고,
    //   부수 효과로 「주 주택 보유기간」이라는 잘못된 축이 고정됐다.
    //   「소득세법」 §95④ 본문은 「제2항에서 규정하는 자산의 보유기간은 **그 자산의 취득일부터
    //   양도일까지**」이고, 같은 항 단서의 예외는 §97의2①(이월과세)·가업상속공제 적용비율분 둘로
    //   **한정 열거**돼 부수토지 예외가 없다. 일체과세 근거인 §104①2호 괄호는 「이하 **이 항에서**
    //   같다」라 그 정의확장을 제104조 제1항 내부로 한정하므로 §95 보유기간 축으로 전이되지 않는다.
    //   ⇒ 표1 대상인 이 케이스(다주택 — 표2 비대상)는 토지 자신의 보유기간으로 판정해야 한다.
    //
    // 픽스처의 토지는 2021-01-01 취득 → 2024-06-01 양도 = 3년 4개월 30일(= 3년) ⇒ 표1 3×2% = 6%.
    const input = appurtenantLandInput(
      { isOneHousehold: false, householdHousingCount: 2, residencePeriodMonths: 0 },
      30,
    );
    const res = calcLongTermHoldingDeduction(TAXABLE_GAIN, input, RULES, false, false);
    expect(res.rate).toBeCloseTo(0.06, 10);
    expect(res.deduction).toBe(6_000_000);
  });

  it("🔁 표2(1세대1주택) 대상이어도 표1(토지 축)이 하한 — 통칙 95-0…1 (2026-09-02 갱신)", () => {
    // 🔁 **기대값 갱신** — 종전 기대는 `deduction 0 / rate 0`이었고, 사유는 「기재부 재산세제과-1183의
    //    max 규칙은 표2가 보유 **단일축**이던 시기(~2018) 해석이라 현행 2축 표2에 어떻게
    //    대입할지 미확정」이었다. **현행 통칙이 그 두 전제를 동시에 무너뜨린다**:
    //
    //      「소득세법 기본통칙 **95-0…1**【주택부수토지가 주택보다 보유기간이 긴 경우】
    //       (조문번호 이동 **2024.03.15.**) — … 그 토지의 **전체보유기간**에 따른 표1의 공제율과
    //       주택 부수토지로서의 보유기간에 따른 **표2의 공제율** 중 **큰 공제율**을 적용한다.」
    //
    //    ⓐ 통칙은 2024.03.15 **현행**이다(2축 표2 시행 2020 이후). ⓑ 「표2의 **공제율**」을
    //    통째로 지목하므로 보유분/거주분 분해가 필요 없다.
    //
    //    이 픽스처의 토지는 2021-01-01 취득 → 2024-06-01 양도 = 3년 ⇒ 표1 3×2% = **6%**.
    //    표2는 주 주택 30개월(3년 미달)이라 0% ⇒ max = 6%. 바로 위 표1 케이스와 **같은 값**이다
    //    — 1세대1주택이라는 이유로 공제를 잃던 것이 종전 동작이었다.
    //    상세: `appurtenant-land-lthd-table1-floor.anchor.test.ts`.
    const input = appurtenantLandInput(
      { isOneHousehold: true, householdHousingCount: 1, residencePeriodMonths: 30 },
      30,
    );
    const res = calcLongTermHoldingDeduction(TAXABLE_GAIN, input, RULES, false, false);
    expect(res.rate).toBeCloseTo(0.06, 10);
    expect(res.deduction).toBe(6_000_000);
  });

  it("경계: 주 주택 35개월이어도 표1은 토지 축 → rate 6% (F11 정정)", () => {
    // 🔁 2026-08-13 기대값 갱신 (F11) — 위 케이스와 같은 이유. 종전 기대는 0이었다.
    //    3년 게이트도 §95④상 **토지 자신의 보유기간**으로 판정하므로 주 주택 35개월은 무관하다.
    const input = appurtenantLandInput(
      { isOneHousehold: false, householdHousingCount: 2, residencePeriodMonths: 0 },
      35,
    );
    const res = calcLongTermHoldingDeduction(TAXABLE_GAIN, input, RULES, false, false);
    expect(res.rate).toBeCloseTo(0.06, 10);
    expect(res.deduction).toBe(6_000_000);
  });

  it("경계: 토지 3년 미만이면 표1도 배제 — 3년 게이트는 토지 축 (F11)", () => {
    // 토지 2022-01-01 취득 → 2024-06-01 양도 = 2년 5개월 ⇒ §95② 진입요건 미달로 0.
    // (주 주택은 168개월 = 14년이지만 표1 축이 아니므로 공제가 생기지 않는다.)
    const input = appurtenantLandInput(
      {
        isOneHousehold: false,
        householdHousingCount: 2,
        residencePeriodMonths: 0,
        acquisitionDate: new Date("2022-01-01"),
      },
      168,
    );
    const res = calcLongTermHoldingDeduction(TAXABLE_GAIN, input, RULES, false, false);
    expect(res.deduction).toBe(0);
    expect(res.rate).toBe(0);
  });

  it("경계: 주 주택 36개월(정확히 3년) 표1 → rate 6%, deduction 6,000,000", () => {
    // §95② 표1: 보유 3년 × 2% = 6%. applyRate(1억, 0.06) = 6,000,000.
    // (F11 후에는 토지 자신도 3년 4개월이라 같은 6%가 나온다 — 두 축이 우연히 일치하는 케이스.)
    const input = appurtenantLandInput(
      { isOneHousehold: false, householdHousingCount: 2, residencePeriodMonths: 0 },
      36,
    );
    const res = calcLongTermHoldingDeduction(TAXABLE_GAIN, input, RULES, false, false);
    expect(res.rate).toBeCloseTo(0.06, 10);
    expect(res.deduction).toBe(6_000_000);
  });

  it("양성대조: 주 주택 36개월 표2(보유3년+거주3년) → rate 24%, deduction 24,000,000", () => {
    // §95② 표2: 보유 3년×4% + 거주 3년×4% = 24%. applyRate(1억, 0.24) = 24,000,000.
    const input = appurtenantLandInput(
      { isOneHousehold: true, householdHousingCount: 1, residencePeriodMonths: 36 },
      36,
    );
    const res = calcLongTermHoldingDeduction(TAXABLE_GAIN, input, RULES, false, false);
    expect(res.rate).toBeCloseTo(0.24, 10);
    expect(res.deduction).toBe(24_000_000);
  });
});

describe("D2 — split 12억 초과분 안분 BigInt 가드 (P0-2/P0-4)", () => {
  const THRESHOLD = 1_200_000_000;
  // 경계 케이스: 분자 g×(s−12억) > 2^53 → 원시 double 곱은 1원 과대(1,562,477,801),
  // BigInt 정확값은 1,562,477,800. (독립 도출: BigInt floor(g×(s−12억)/s).)
  const g = 2_655_651_946; // 건물분 양도차익
  const s = 2_915_164_386; // 본인 소유 파트 양도가액 (> 12억)

  it("BigInt 정확 안분값 = 1,562,477,800 (원시 double = 1,562,477,801, 1원 과대)", () => {
    const exact = Number((BigInt(g) * (BigInt(s) - BigInt(THRESHOLD))) / BigInt(s));
    const rawDouble = Math.floor((g * (s - THRESHOLD)) / s);
    expect(exact).toBe(1_562_477_800);
    expect(rawDouble).toBe(1_562_477_801); // 수정 전 코드가 내던 잘못된 값
    // 수정 코드가 사용하는 헬퍼는 정확값을 반환해야 한다.
    expect(calculateProration(g, s - THRESHOLD, s)).toBe(1_562_477_800);
  });

  it("split 경로 building.longTermDeduction = 정확 안분값 기반 (raw 곱셈 미사용)", () => {
    // 1세대1주택 + selfOwns 'both' + selfTransferPrice=s>12억 → 12억 초과분 안분 적용.
    // 건물분 보유 10년, 거주 0 → 표1 rate 20%. deduction = applyRate(정확안분, 0.20).
    const input = baseTransferInput({
      propertyType: "housing",
      isOneHousehold: true,
      householdHousingCount: 1,
      residencePeriodMonths: 0,
      transferPrice: s,
      acquisitionDate: new Date("2010-01-01"),
      transferDate: new Date("2024-06-01"),
    });
    const split: SplitGainResult = {
      selfOwns: "both",
      note: "",
      apportionRatio: { land: 0, building: 1 },
      land: {
        transferPrice: 0, acquisitionPrice: 0, directExpenses: 0, appraisalDeduction: 0,
        gain: 0, holdingYears: 10, longTermRate: 0, longTermDeduction: 0,
      },
      building: {
        transferPrice: s, acquisitionPrice: 0, directExpenses: 0, appraisalDeduction: 0,
        gain: g, holdingYears: 10, longTermRate: 0, longTermDeduction: 0,
      },
    };
    const exactProrated = 1_562_477_800;
    const expectedBuildingDed = applyRate(exactProrated, 0.20); // = 312,495,560

    calcLongTermHoldingDeduction(0, input, RULES, false, false, undefined, split);

    expect(split.building.longTermRate).toBeCloseTo(0.20, 10);
    expect(split.building.longTermDeduction).toBe(expectedBuildingDed);
    expect(split.land.longTermDeduction).toBe(0);
  });
});
