/**
 * 간주취득 건물 개수(deemed_renovation) 세율 anchor 테스트
 *
 * [AT-DEEMED-R] 건물 개수 간주취득 세율 2% 검증 (중과기준세율)
 *
 * 법령 근거:
 * - 지방세법 §15②1호: 개수로 인한 취득(§11③ 면적 증가분 제외) → 중과기준세율(2%)
 * - 지방세법 §15②2·3호: §7④ 지목변경(토지 가액 증가)·§7⑤ 과점주주 → 중과기준세율(2%)
 * - 지방세법 §151①1 본문: §15②에 해당하는 취득은 지방교육세 과세대상에서 제외
 *
 * 개수(면적 무증가)는 §15②1호 중과기준세율 2%가 적용된다
 * (면적이 증가하는 개수는 §11③에 따라 그 증가분만 원시취득 2.8%). 지목변경·과점주주도 동일 2%.
 */

import { describe, it, expect } from "vitest";
import {
  getBasicRate,
  calcRuralSpecialTax,
  calcLocalEducationTax,
} from "../../../lib/tax-engine/acquisition-tax-rate";

// ============================================================
// [AT-DEEMED-R01] 건물 개수 세율 — 2% (§15②1호)
// ============================================================

describe("[AT-DEEMED-R] 건물 개수 간주취득 세율 2% — §15②1호", () => {
  // 기준 시나리오: 개수 전 시가표준액 1억, 개수 후 1.5억 → 과세표준 5,000만원
  const TAX_BASE = 50_000_000;
  const APPLIED_RATE = 0.02;

  it("[AT-DEEMED-R01] 세율 2% 결정 — getBasicRate", () => {
    const result = getBasicRate("building", "deemed_renovation", TAX_BASE);
    expect(result.rate).toBe(0.02);
    expect(result.isLinearInterpolation).toBe(false);
  });

  it("[AT-DEEMED-R02] 주택 개수도 세율 2%", () => {
    // 주택에 대한 개수도 §15②1호 동일 (중과기준세율)
    const result = getBasicRate("housing", "deemed_renovation", 80_000_000);
    expect(result.rate).toBe(0.02);
    expect(result.isLinearInterpolation).toBe(false);
  });

  it("[AT-DEEMED-R03] 취득세 본세 계산 — 5,000만 × 2% = 1,000,000원", () => {
    // 개수 전 1억, 개수 후 1.5억 → 과세표준 = 5,000만
    const acquisitionTax = Math.floor(TAX_BASE * APPLIED_RATE);
    expect(acquisitionTax).toBe(1_000_000);
  });

  it("[AT-DEEMED-R04] 농어촌특별세 — §15② 간주취득도 0.2% 부과 (농특세법 §5⑤)", () => {
    // [R3-02] §5⑤: §15②(개수·지목변경·과점주주) 취득세액(과세표준×2%)을 §5①6호 과세표준으로.
    //   농특세 = 과세표준 × 2% × 10% = 0.2%. 5,000만 × 0.2% = 100,000. (구값 0은 오산식)
    const ruralTax = calcRuralSpecialTax({
      taxBase: TAX_BASE,
      appliedRate: APPLIED_RATE,
      acquisitionTax: Math.floor(TAX_BASE * APPLIED_RATE),
      propertyType: "building",
    });
    expect(ruralTax).toBe(100_000);
  });

  it("[AT-DEEMED-R05] 지방교육세 — §15② 간주취득은 과세대상 제외 → 0원 (§151①1)", () => {
    const eduTax = calcLocalEducationTax({
      taxBase: TAX_BASE,
      appliedRate: APPLIED_RATE,
      acquisitionTax: Math.floor(TAX_BASE * APPLIED_RATE),
      propertyType: "building",
      acquisitionCause: "deemed_renovation",
      isSurcharged: false,
    });
    expect(eduTax).toBe(0);
  });

  it("[AT-DEEMED-R06] 총 납부세액 — 본세 1,000,000 + 농특세 100,000 + 교육세 0 = 1,100,000원", () => {
    const acquisitionTax = Math.floor(TAX_BASE * APPLIED_RATE); // 1,000,000
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
    // [R3-02] 농특세는 §5⑤로 0.2% 부과(100,000), 교육세는 §151①1 본문 괄호로 §15② 제외(0).
    expect(acquisitionTax).toBe(1_000_000);
    expect(ruralTax).toBe(100_000);
    expect(eduTax).toBe(0);
    expect(total).toBe(1_100_000);
  });
});

// ============================================================
// 기존 2% 케이스 유지 확인 (지목변경·과점주주 — §15②2·3호)
// ============================================================

describe("[AT-DEEMED] 지목변경·과점주주 세율 2% 유지 확인 (§15②2·3호)", () => {
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

  it("[AT-DEEMED-C03] 지목변경 농특세 — §15② 간주취득 0.2% 부과 (농특세법 §5⑤)", () => {
    // [R3-02] §5⑤: 1억 × 2% × 10% = 200,000. (구값 0은 (적용세율−2%) 오산식)
    const ruralTax = calcRuralSpecialTax({
      taxBase: 100_000_000,
      appliedRate: 0.02,
      acquisitionTax: 2_000_000,
      propertyType: "land",
    });
    expect(ruralTax).toBe(200_000);
  });

  it("[AT-DEEMED-C04] 과점주주 지방교육세 — §15② 제외 → 0원 (§151①1)", () => {
    // 간주취득(§15②)은 지방교육세 과세대상에서 제외
    const eduTax = calcLocalEducationTax({
      taxBase: 200_000_000,
      appliedRate: 0.02,
      acquisitionTax: 4_000_000,
      propertyType: "housing",
      acquisitionCause: "deemed_major_shareholder",
      isSurcharged: false,
    });
    expect(eduTax).toBe(0);
  });
});

// ============================================================
// 농특세 85㎡ 이하 면제 — 2% 초과 세율 취득 (원시취득 2.8% 등)
// ============================================================

describe("[AT-DEEMED-R] 농특세 85㎡ 이하 면제 — 원시취득 주택(2.8%)", () => {
  it("[AT-DEEMED-R07] 원시취득 주택 84㎡ — 농특세 0원 (면적 면제)", () => {
    const ruralTax = calcRuralSpecialTax({
      taxBase: 50_000_000,
      appliedRate: 0.028,
      acquisitionTax: 1_400_000,
      propertyType: "housing",
      areaSqm: 84,
    });
    expect(ruralTax).toBe(0);
  });

  it("[AT-DEEMED-R08] 원시취득 주택 86㎡(비중과 2.8%) — 농특세 0.2% = 100,000원", () => {
    const ruralTax = calcRuralSpecialTax({
      taxBase: 50_000_000,
      appliedRate: 0.028,
      acquisitionTax: 1_400_000,
      propertyType: "housing",
      areaSqm: 86,
    });
    // [R3-02] 비중과: 표준세율(2.8%) 2% 치환 → 5,000만 × 0.2% = 100,000 (구값 40,000은 오산식)
    expect(ruralTax).toBe(100_000);
  });
});
