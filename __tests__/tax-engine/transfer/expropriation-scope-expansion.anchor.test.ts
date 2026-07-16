/**
 * anchor — §164⑨ 자산종류 적격 범위 (D1·D2·D3) + 게이트 확대 후 세액 (P3).
 *
 * 계획서: docs/02-design/features/expropriation-valuation-164-9-scope-expansion.plan.md (rev.8 §2-2 · §4-1b · P3)
 *
 * **소득세법 시행령 §164⑨**은 법 **§99①1호 "가목부터 라목까지"**를 대상으로 한다:
 *   가. 토지 / 나. 건물 / 다. 오피스텔 및 상업용 건물 / 라. 주택
 * 종전 구현은 UI·validate가 **토지로만** 게이트해 **법령보다 좁았다**(= 건물·상가 수용 시 특례
 * 미적용 → 양도차익 과대 → **세액 과다**). 본 anchor가 그 수치를 확정한다(rev.8 §0 "미실증" 해소).
 *
 * ⚠️ **주택(라목)은 적격이나 원/㎡ 모델이 맞지 않는다** — 개별주택가격은 총액이라 총액 트랙이
 *    필요하다(계획 P5). 본 P3 범위는 **가~다목**(원/㎡ 트랙)이다.
 *
 * ⚠️ **입주권·분양권은 §99①2호**(부동산에 관한 권리)로 §164⑨ 대상이 **아니다**.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { applyExpropriationValuation } from "@/lib/tax-engine/transfer-tax-expropriation-valuation";
import {
  isExprValuationEligiblePropertyType,
  isExprValuationEligibleAssetKind,
  isExprValuationLegallyEligibleAssetKind,
} from "@/lib/tax-engine/expropriation-scope";
import { makeMockRates, baseTransferInput } from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

const rates = makeMockRates();

/** 수용 + 환산 단건. 양도 10억, 취득시 기준시가 2억, 양도시 기준시가 5억(=2,500,000/㎡ × 200㎡). */
function exprInput(propertyType: TransferTaxInput["propertyType"]): TransferTaxInput {
  return baseTransferInput({
    propertyType,
    transferPrice: 1_000_000_000,
    transferDate: new Date("2020-06-01"),
    acquisitionDate: new Date("2010-06-01"),
    acquisitionPrice: 0,
    isOneHousehold: false,
    householdHousingCount: 0,
    residencePeriodMonths: 0,
    useEstimatedAcquisition: true,
    standardPriceAtAcquisition: 200_000_000,
    standardPriceAtTransfer: 500_000_000,
    transferCause: "public_expropriation",
    standardPricePerSqmAtTransfer: 2_500_000,
    transferArea: 200,
    compensationPerSqm: 1_500_000,
    compensationBasisStdPrice: 2_000_000,
  });
}

// ── C-24: 적격 판정 단일 소스 (Q7 B안 — 진입점 2개, 목록 1개) ──
describe("C-24 §164⑨ 적격 자산 — EXPR_VALUATION_ELIGIBLE 단일 소스", () => {
  it("propertyType 진입점 — 가~라목 적격", () => {
    expect(isExprValuationEligiblePropertyType("land")).toBe(true); // 가
    expect(isExprValuationEligiblePropertyType("building")).toBe(true); // 나
    expect(isExprValuationEligiblePropertyType("general_building")).toBe(true); // 나
    expect(isExprValuationEligiblePropertyType("commercial_building")).toBe(true); // 다
    expect(isExprValuationEligiblePropertyType("housing")).toBe(true); // 라
  });

  it("propertyType 진입점 — §99①2호(권리)는 부적격", () => {
    expect(isExprValuationEligiblePropertyType("right_to_move_in")).toBe(false);
    expect(isExprValuationEligiblePropertyType("presale_right")).toBe(false);
  });

  it("assetKind 진입점(UI·validate) — **특례가 실제로 도달하는** 자산만 true", () => {
    expect(isExprValuationEligibleAssetKind("land")).toBe(true); // 가목
    expect(isExprValuationEligibleAssetKind("building")).toBe(true); // 나목
    expect(isExprValuationEligibleAssetKind("commercial_building")).toBe(true); // 다목 — D16-CB 배선 완료
    expect(isExprValuationEligibleAssetKind("general_building")).toBe(true); // 가+나목 — D16-GB 배선 완료(토지분만)
    expect(isExprValuationEligibleAssetKind("right_to_move_in")).toBe(false);
    expect(isExprValuationEligibleAssetKind("presale_right")).toBe(false);
  });

  it("일반건물 — **배선 완료(D16-GB)** — 토지 환산 분모만 §164⑨(안분·건물 무변경)", () => {
    // 법령 축: 가+나목 → §164⑨ 대상 O
    expect(isExprValuationLegallyEligibleAssetKind("general_building")).toBe(true);
    expect(isExprValuationEligiblePropertyType("general_building")).toBe(true);
    // 구현 축: `calculateConvertedAcquisition`이 토지 환산 분모만 낮춘다 → UI 노출 O.
    // 세액 실증·토지분만 근거는 expropriation-general-building.anchor.test.ts 참조.
    expect(isExprValuationEligibleAssetKind("general_building")).toBe(true);
  });

  it("⚠️ 주택(라목) — **법령 적격이나 UI 미노출** (총액 트랙 미구현 = P5)", () => {
    // 법령 축: §164⑨ 대상 O
    expect(isExprValuationLegallyEligibleAssetKind("housing")).toBe(true);
    expect(isExprValuationEligiblePropertyType("housing")).toBe(true);
    // 구현 축: 원/㎡ 트랙 미지원 → UI 노출 X.
    // 노출하면 transferArea가 없어(isAreaMode===false) 엔진 `area > 0`에 걸려
    // **입력해도 아무 일도 안 하는** 침묵 무시가 된다(D7과 같은 병).
    expect(isExprValuationEligibleAssetKind("housing")).toBe(false);
  });
});

// ── 엔진 게이트 (Q4 3층 중 엔진 층) ──
describe("엔진 게이트 — propertyType 축 (D3)", () => {
  const base = {
    useEstimatedAcquisition: true,
    transferCause: "public_expropriation" as const,
    transferDate: new Date("2020-06-01"),
    standardPricePerSqmAtTransfer: 2_500_000,
    transferArea: 200,
    compensationPerSqm: 1_500_000,
    compensationBasisStdPrice: 2_000_000,
  };

  it("건물(나목) → 적용", () => {
    const r = applyExpropriationValuation({ ...base, propertyType: "building" });
    expect(r?.denominator).toBe(300_000_000);
  });

  it("입주권(§99①2호) → null (대상 아님)", () => {
    expect(applyExpropriationValuation({ ...base, propertyType: "right_to_move_in" })).toBeNull();
  });

  it("분양권(§99①2호) → null", () => {
    expect(applyExpropriationValuation({ ...base, propertyType: "presale_right" })).toBeNull();
  });
});

// ── C-03·C-04: 게이트 확대 세액 실증 (D1 — rev.8 §0 "미실증" 해소) ──
describe("게이트 확대 후 세액 (D1 실증)", () => {
  // 분모 5억 → min[2,500,000 · 1,500,000 · 2,000,000] × 200㎡ = 3억
  // 환산취득가 = floor(10억 × 2억/3억) = 666,666,666 (특례 前 400,000,000)
  // 개산공제 = floor(2억 × 3%) = 6,000,000
  // 양도차익 = 10억 − 666,666,666 − 6,000,000 = 327,333,334 (특례 前 594,000,000)
  const EXPECTED_GAIN = 327_333_334;

  it("C-03 건물(나목) — 특례 적용", () => {
    const r = calculateTransferTax(exprInput("building"), rates);
    expect(r.transferGain).toBe(EXPECTED_GAIN);
    expect(r.expropriationValuationDetail?.denominator).toBe(300_000_000);
  });

  // ⚠️ 상가(다목) anchor를 **의도적으로 두지 않는다**.
  //    `commercialBuildingValuation` 없이 호출하면 특례가 적용되는 것처럼 보이지만, 프로덕션은
  //    상가+환산이면 그 payload를 **항상** 보내고(`transfer-tax-api.ts:110` 계열),
  //    `transfer-tax.ts:303-312`가 CB 전용 환산 후 `useEstimatedAcquisition: false`로 교체해
  //    특례가 **항상 null**이 된다. 즉 payload를 뺀 anchor는 **도달 불가능한 구성**을 GREEN으로
  //    고정해 거짓 확신을 준다. CB/GB 경로 배선은 별건(계획 D16) — 그때 anchor를 추가한다.
  //    현행 우회 사실은 위 "상가·일반건물 — 법령 적격이나 UI 미노출" 케이스가 고정한다.

  it("C-01 토지(가목) — 회귀 방어 (종전에도 적용됐던 유일한 목)", () => {
    const r = calculateTransferTax(exprInput("land"), rates);
    expect(r.transferGain).toBe(EXPECTED_GAIN);
  });

  it("C-06c 입주권 — 미적용 (§99①2호)", () => {
    const r = calculateTransferTax(exprInput("right_to_move_in"), rates);
    expect(r.expropriationValuationDetail).toBeUndefined();
    expect(r.transferGain).toBe(594_000_000); // 특례 前 값 유지
  });
});
