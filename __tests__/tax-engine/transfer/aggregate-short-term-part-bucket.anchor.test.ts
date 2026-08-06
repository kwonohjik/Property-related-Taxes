/**
 * anchor: `short_term` 그룹도 **파트**가 §104⑤ 합산 단위다 (P13)
 *
 * 계획서: docs/02-design/features/transfer-104-5-short-term-part-bucket.plan.md v1.0
 *
 * ── 무엇이 잘못돼 있었나 ────────────────────────────────────────────────
 * §104⑤ 묶음 **키**는 Q1~Q3가 단일화했지만(`clauseBucketKey`), **버킷의 멤버 단위**가 갈려 있었다:
 *   · 누진 호 분기      — **파트**(P12 2단계 · D-7 51,000,000 · D-12 23,400,000)
 *   · **`short_term`**  — **자산**. 파트가 있는 자산은 `isAssetLevelClause5`로 **통째로 solo**
 *
 * 그래서 split 자산이 **같은 호인 다른 자산과 합산되지 않았다.**
 *
 * ── 도출 근거 (신규 해석 없음) ──────────────────────────────────────────
 * §104⑤ 본문 **후단** — 「한 필지의 토지가 §104의3에 따른 비사업용 토지와 그 외의 토지로
 * 구분되는 경우 **각각을 별개의 자산으로 보아**」. 토지·건물 분리취득도 §94①1호가 병렬
 * 열거하는 각각의 자산이다. 여기에 예규가 확정한 「"자산별" = **각 호별로 합산한 자산**」
 * (「기획재정부 재산세제과-536」 2018.6.19. · 국세청 「기준-2018-법령해석재산-0098」)이 얹힌다.
 * ⇒ **파트가 곧 합산 단위**다. P12가 누진 호 분기에서 이미 이 근거를 썼다.
 *
 * ── ⭐ 이 파일의 핵심은 P13-3이다 ───────────────────────────────────────
 * 「**split이라는 이유만으로** 세액이 달라지지 않는다」 — 과세표준 합계가 같고 해당 호도 같으면
 * 파트가 있든 없든 같은 값이어야 한다. 현행 엔진은 **파트 없는 입력에 이미 그 값을 내고 있다.**
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

function run(properties: TransferTaxItemInput[]) {
  const input: AggregateTransferInput = {
    taxYear: 2026,
    annualBasicDeductionUsed: 2_500_000, // 기본공제 소진 → 과세표준 = 양도소득금액
    properties,
  };
  return calculateTransferTaxAggregate(input, mockRates);
}

/**
 * split 주택 — 건물 2024-08-01(**22개월**) + 토지 2025-01-01(17개월) · 조정 3주택.
 * 두 파트 모두 §104①2호·§104⑦3호에 **해당**하고, 과세표준 차이로 승자만 갈린다
 * ⇒ `computeSplitPartTax`가 파트를 만든다(세율이 갈려야 게이트가 열린다).
 */
function splitShort(id: string, landGain: number, bldGain: number): TransferTaxItemInput {
  return {
    ...(baseTransferInput() as unknown as TransferTaxItemInput),
    propertyId: id,
    propertyLabel: id,
    propertyType: "housing",
    transferDate: D("2026-06-01"),
    acquisitionDate: D("2024-08-01"),
    landAcquisitionDate: D("2025-01-01"),
    transferPrice: 1_000_000_000 + landGain + bldGain,
    acquisitionPrice: 1_000_000_000,
    landTransferPrice: 600_000_000 + landGain,
    buildingTransferPrice: 400_000_000 + bldGain,
    // §100③(30% 의제) 판정 근거 — 구분 기재값과 **동일 비율**로 둬 의제가 발동하지 않게 한다.
    //    Phase 1-D부터 구분 기재 시 양도시 기준시가가 필수다(계획서 §12.7 R-7). 세액 불변.
    landStandardPriceAtTransfer: 600_000_000 + landGain,
    buildingStandardPriceAtTransfer: 400_000_000 + bldGain,
    landAcquisitionPrice: 600_000_000,
    buildingAcquisitionPrice: 400_000_000,
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    isSeparateAcquisition: true,
    isOneHousehold: false,
    householdHousingCount: 3,
    isRegulatedArea: true,
    expenses: 0,
  } as TransferTaxItemInput;
}
/** 단순 주택 — 17개월 · 조정 3주택 ⇒ split 파트와 **같은 해당 호 집합** {①2호, ⑦3호} */
function plainShort(id: string, gain: number): TransferTaxItemInput {
  return {
    ...(baseTransferInput() as unknown as TransferTaxItemInput),
    propertyId: id,
    propertyLabel: id,
    propertyType: "housing",
    transferDate: D("2026-06-01"),
    acquisitionDate: D("2025-01-01"),
    acquisitionPrice: 0,
    transferPrice: gain,
    isOneHousehold: false,
    householdHousingCount: 3,
    isRegulatedArea: true,
    expenses: 0,
  } as TransferTaxItemInput;
}
/** 토지 17개월 — 한 필지 중 50%만 비사업용(§104⑤ 본문 후단 별개 자산 의제) */
function partialNbl(id: string, gain: number): TransferTaxItemInput {
  return {
    ...(baseTransferInput() as unknown as TransferTaxItemInput),
    propertyId: id,
    propertyLabel: id,
    propertyType: "land",
    transferDate: D("2026-06-01"),
    acquisitionDate: D("2025-01-01"),
    acquisitionPrice: 0,
    transferPrice: gain,
    isOneHousehold: false,
    householdHousingCount: 0,
    isRegulatedArea: false,
    isNonBusinessLand: true,
    nonBusinessLandAreaRatio: 0.5,
    expenses: 0,
  } as TransferTaxItemInput;
}
/** 사업용 토지 17개월 ⇒ {①2호} */
function bizLand(id: string, gain: number): TransferTaxItemInput {
  return {
    ...(baseTransferInput() as unknown as TransferTaxItemInput),
    propertyId: id,
    propertyLabel: id,
    propertyType: "land",
    transferDate: D("2026-06-01"),
    acquisitionDate: D("2025-01-01"),
    acquisitionPrice: 0,
    transferPrice: gain,
    isOneHousehold: false,
    householdHousingCount: 0,
    isRegulatedArea: false,
    isNonBusinessLand: false,
    expenses: 0,
  } as TransferTaxItemInput;
}

//  S  토지 파트 300,000,000 / 건물 파트 150,000,000 (자산 과세표준 450,000,000)
//  B  200,000,000 · B2 450,000,000 — 셋 다 해당 호 {①2호, ⑦3호}
const S = splitShort("S", 300_000_000, 150_000_000);
const B = plainShort("B", 200_000_000);
const B2 = plainShort("B2", 450_000_000);

describe("P13 — split 자산의 파트가 같은 호인 다른 자산과 합산된다", () => {
  /**
   * 세 덩어리(S.토지 300,000,000 · S.건물 150,000,000 · B 200,000,000)가 한 버킷:
   *   합산 650,000,000 → 누진 237,060,000 + 30% 195,000,000 = 432,060,000 (> 60% 390,000,000)
   * 종전에는 S가 통째로 solo라 289,060,000 + 120,000,000 = 409,060,000이었다.
   */
  it("P13-1: `[S, B]` = 합산 650,000,000 한 버킷", () => {
    expect(run([S, B]).calculatedTax).toBe(432_060_000);
  });

  it("P13-2: **순서 반전** `[B, S]` — 같은 값", () => {
    expect(run([B, S]).calculatedTax).toBe(432_060_000);
  });

  it("P13-3 ⭐: **split이라는 이유만으로 달라지지 않는다** — 파트 없는 동등 입력과 같은 값", () => {
    // `[B2(450,000,000), B(200,000,000)]`은 과세표준 합계·해당 호가 `[S, B]`와 같고
    // **파트가 없다**. 현행 엔진은 이쪽에 이미 432,060,000을 내고 있었다.
    const withParts = run([S, B]);
    const withoutParts = run([B2, B]);
    expect(withParts.calculatedTax).toBe(withoutParts.calculatedTax);
    // 과세표준도 같아야 비교가 성립한다(전제 고정)
    expect(withParts.groupTaxes[0].groupTaxBase).toBe(withoutParts.groupTaxes[0].groupTaxBase);
  });

  it("P13-4: `[S, S2]` — S2는 파트 세율이 같아 **파트가 만들어지지 않는다**", () => {
    // S2(토지 100,000,000 / 건물 50,000,000)는 두 파트 모두 단기 60%가 이겨
    // `computeSplitPartTax` 게이트 7(`uniform`)에 걸린다 ⇒ 평범한 자산으로 취급된다.
    // S.토지 300,000,000 + S.건물 150,000,000 + S2 150,000,000 = 600,000,000 한 버킷
    //   → 누진 216,060,000 + 30% 180,000,000 = 396,060,000 (> 60% 360,000,000)
    const S2 = splitShort("S2", 100_000_000, 50_000_000);
    expect(run([S, S2]).calculatedTax).toBe(396_060_000); // 종전 379,060,000
    expect(run([S2, S]).calculatedTax).toBe(396_060_000);
  });
});

describe("P13 — 회귀", () => {
  it("P13-5: 부분 비사토 + 사업용 토지 — **불변**(단일세율 호라 차이가 floor뿐)", () => {
    // N 파트: 비사업용 200,000,000 {①2호,①8호} / 그 외 200,000,000 {①2호}
    // P 200,000,000 {①2호} — N의 「그 외」와 같은 호라 합쳐지지만 둘 다 40% 단일세율이다.
    const N = partialNbl("N", 400_000_000);
    const P = bizLand("P", 200_000_000);
    expect(run([N, P]).calculatedTax).toBe(240_000_000);
    expect(run([P, N]).calculatedTax).toBe(240_000_000);
  });

  it("P13-6: 파트 없는 자산만 — 세액·`appliedRate` **모두 불변**", () => {
    const r = run([B, B2]);
    expect(r.calculatedTax).toBe(432_060_000);
    // 표시 규약 유지(B안) — 합산 결과의 세율을 그대로 쓴다. `surchargeRate`는 `short_term`에서 미표시.
    expect(r.groupTaxes[0].appliedRate).toBe(0.72);
    expect(r.groupTaxes[0].surchargeRate).toBeUndefined();
  });

  it("P13-7 구조: `[S]` 단독 — 세액은 불변, 파트가 **한 버킷**으로 묶인다", () => {
    const r = run([S]);
    // 자산 내부 §104⑤ 결과는 그대로다(파트 분해가 사라지지 않았다는 증거).
    expect(r.calculatedTax).toBe(289_060_000);
    // 두 파트가 한 버킷(450,000,000)으로 묶여 그 합산 세율이 표시된다.
    // 종전에는 자산이 solo라 자산 세액의 세율(0.68)이었다.
    expect(r.groupTaxes[0].appliedRate).toBe(0.7);
  });
});
