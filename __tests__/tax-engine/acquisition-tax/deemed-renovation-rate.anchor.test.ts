/**
 * 간주취득 건물 개수(deemed_renovation) 세율 anchor 테스트
 *
 * [AT-DEEMED-R] 건물 개수 원시취득 세율 2.8% 검증
 *
 * 법령 근거:
 * - 지방세법 §11①2호 가목: 건축물의 건축·개수 → 원시취득 → 2.8%
 * - 지방세법 §7의2: 간주취득 (과점주주·지목변경·개수)
 *
 * 개수(改修)는 기존 건물에 중요한 구조 변경을 가하는 행위로,
 * 원시취득에 해당하여 2.8%가 적용됩니다 (지목변경·과점주주의 2%와 상이).
 */

import { describe, it, expect } from "vitest";
import {
  getBasicRate,
  calcRuralSpecialTax,
  calcLocalEducationTax,
} from "../../../lib/tax-engine/acquisition-tax-rate";

// ============================================================
// [AT-DEEMED-R01] 건물 개수 세율 — 2.8% (§11①2호 가목)
// ============================================================

describe("[AT-DEEMED-R] 건물 개수 간주취득 세율 2.8% — §11①2호 가목", () => {
  // 기준 시나리오: 개수 전 시가표준액 1억, 개수 후 1.5억 → 과세표준 5,000만원
  const TAX_BASE = 50_000_000;
  const APPLIED_RATE = 0.028;

  it("[AT-DEEMED-R01] 세율 2.8% 결정 — getBasicRate", () => {
    const result = getBasicRate("building", "deemed_renovation", TAX_BASE);
    expect(result.rate).toBe(0.028);
    expect(result.isLinearInterpolation).toBe(false);
  });

  it("[AT-DEEMED-R02] 주택 개수도 세율 2.8%", () => {
    // 주택에 대한 개수도 원시취득 분기 동일
    const result = getBasicRate("housing", "deemed_renovation", 80_000_000);
    expect(result.rate).toBe(0.028);
    expect(result.isLinearInterpolation).toBe(false);
  });

  it("[AT-DEEMED-R03] 취득세 본세 계산 — 5,000만 × 2.8% = 1,400,000원", () => {
    // 개수 전 1억, 개수 후 1.5억 → 과세표준 = 5,000만
    const acquisitionTax = Math.floor(TAX_BASE * APPLIED_RATE);
    expect(acquisitionTax).toBe(1_400_000);
  });

  it("[AT-DEEMED-R04] 농어촌특별세 계산 — (2.8%-2%) × 5,000만 × 10% = 40,000원", () => {
    // 세율 2.8% > 표준세율 2% → 농특세 발생
    // (0.028 - 0.02) × 50,000,000 × 0.1 = 0.008 × 50,000,000 × 0.1 = 40,000
    const ruralTax = calcRuralSpecialTax({
      taxBase: TAX_BASE,
      appliedRate: APPLIED_RATE,
      acquisitionTax: Math.floor(TAX_BASE * APPLIED_RATE),
      propertyType: "building",
    });
    expect(ruralTax).toBe(40_000);
  });

  it("[AT-DEEMED-R05] 지방교육세 계산 — 표준세율분 0.4%: 5,000만 × 2% × 20% = 200,000원", () => {
    // 건물 개수는 원시취득 — 주택 유상거래 분기(§151①1나)가 아닌 기본 산식 적용
    // 지방교육세 = 과세표준 × 2% × 20%
    const eduTax = calcLocalEducationTax({
      taxBase: TAX_BASE,
      appliedRate: APPLIED_RATE,
      acquisitionTax: Math.floor(TAX_BASE * APPLIED_RATE),
      propertyType: "building",
      acquisitionCause: "deemed_renovation",
      isSurcharged: false,
    });
    expect(eduTax).toBe(200_000);
  });

  it("[AT-DEEMED-R06] 총 납부세액 합계 확인 — 1,400,000 + 40,000 + 200,000 = 1,640,000원", () => {
    const acquisitionTax = Math.floor(TAX_BASE * APPLIED_RATE);   // 1,400,000
    const ruralTax = calcRuralSpecialTax({
      taxBase: TAX_BASE,
      appliedRate: APPLIED_RATE,
      acquisitionTax,
      propertyType: "building",
    });
    const eduTax = calcLocalEducationTax({
      taxBase: TAX_BASE,
      appliedRate: APPLIED_RATE,
      acquisitionTax,
      propertyType: "building",
      acquisitionCause: "deemed_renovation",
      isSurcharged: false,
    });
    const total = acquisitionTax + ruralTax + eduTax;
    expect(acquisitionTax).toBe(1_400_000);
    expect(ruralTax).toBe(40_000);
    expect(eduTax).toBe(200_000);
    expect(total).toBe(1_640_000);
  });
});

// ============================================================
// 기존 2% 케이스 유지 확인 (지목변경·과점주주 — 변경 없음)
// ============================================================

describe("[AT-DEEMED] 지목변경·과점주주 세율 2% 유지 확인 (변경 없음)", () => {
  it("[AT-DEEMED-C01] 지목변경 간주취득 — 2% 유지", () => {
    const result = getBasicRate("land", "deemed_land_category", 100_000_000);
    expect(result.rate).toBe(0.02);
    expect(result.isLinearInterpolation).toBe(false);
  });

  it("[AT-DEEMED-C02] 과점주주 간주취득 — 2% 유지", () => {
    const result = getBasicRate("housing", "deemed_major_shareholder", 200_000_000);
    expect(result.rate).toBe(0.02);
    expect(result.isLinearInterpolation).toBe(false);
  });

  it("[AT-DEEMED-C03] 지목변경 농특세 — 2% 세율이므로 0원 (표준세율 미초과)", () => {
    // 세율 2% = 표준세율 → 농특세 없음
    const ruralTax = calcRuralSpecialTax({
      taxBase: 100_000_000,
      appliedRate: 0.02,
      acquisitionTax: 2_000_000,
      propertyType: "land",
    });
    expect(ruralTax).toBe(0);
  });

  it("[AT-DEEMED-C04] 과점주주 지방교육세 — 과세표준 × 0.4%", () => {
    // 주택 유상거래 아님 → 표준세율분 기준 0.4%
    const eduTax = calcLocalEducationTax({
      taxBase: 200_000_000,
      appliedRate: 0.02,
      acquisitionTax: 4_000_000,
      propertyType: "housing",
      acquisitionCause: "deemed_major_shareholder",
      isSurcharged: false,
    });
    // 200,000,000 × 2% × 20% = 800,000
    expect(eduTax).toBe(800_000);
  });
});

// ============================================================
// 건물 개수 85㎡ 이하 — 농특세 면제 케이스
// ============================================================

describe("[AT-DEEMED-R] 건물 개수 — 주택 85㎡ 이하 농특세 면제", () => {
  it("[AT-DEEMED-R07] 주택 개수 84㎡ — 농특세 0원 (면적 면제)", () => {
    const ruralTax = calcRuralSpecialTax({
      taxBase: 50_000_000,
      appliedRate: 0.028,
      acquisitionTax: 1_400_000,
      propertyType: "housing",
      areaSqm: 84,
    });
    expect(ruralTax).toBe(0);
  });

  it("[AT-DEEMED-R08] 주택 개수 86㎡ — 농특세 발생: (2.8%-2%) × 5,000만 × 10% = 40,000원", () => {
    const ruralTax = calcRuralSpecialTax({
      taxBase: 50_000_000,
      appliedRate: 0.028,
      acquisitionTax: 1_400_000,
      propertyType: "housing",
      areaSqm: 86,
    });
    expect(ruralTax).toBe(40_000);
  });
});
