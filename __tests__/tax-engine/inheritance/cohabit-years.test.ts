/**
 * G3: §23의2①1호 동거연수 계산 — anchor
 *
 * 법령: §23의2①1호 "상속개시일부터 소급하여 10년 이상(상속인이 미성년자인 기간은 제외한다) 계속하여"
 *   - 미성년 제외: 2016.1.1. 이후 시행 (교재 §1-2 명시)
 *   - 미성년: 민법 §4 만 19세 미만
 *   - §23의2②: 부득이한 사유(상증령 §20의2) 기간은 동거 인정하되 산입 안 함
 *
 * Pre-Do anchor (feedback_pre_anchor_verification):
 *   - G3-BASIC: 함수 자체 없음 → RED
 *   - G3-MINOR: 미성년 기간 제외 → RED
 *   - G3-SHORT: 10년 미달 → meetsRequirement=false → RED
 *
 * 계약 C3: echo 필드명 cohabitYears (중첩 객체)
 *   { rawYears, minorYearsDeducted, effectiveYears, meetsRequirement }
 */
import { describe, it, expect } from "vitest";
import { calcCohabitYears } from "@/lib/tax-engine/deductions/inheritance-deductions";

describe("G3 §23의2①1호 동거연수 계산 — calcCohabitYears", () => {
  // ─── 기본 계산 ─────────────────────────────────────────────
  it("G3-BASIC 13년 동거, 미성년 없음 → effectiveYears=13, meets=true ★Pre-Do RED", () => {
    const r = calcCohabitYears("2010-01-01", "2023-01-01", undefined, 0);
    expect(r.rawYears).toBe(13);
    expect(r.minorYearsDeducted).toBe(0);
    expect(r.effectiveYears).toBe(13);
    expect(r.meetsRequirement).toBe(true);
  });

  it("G3-EXACT-10Y 정확히 10년 → effectiveYears=10, meets=true", () => {
    const r = calcCohabitYears("2013-06-01", "2023-06-01", undefined, 0);
    expect(r.effectiveYears).toBe(10);
    expect(r.meetsRequirement).toBe(true);
  });

  it("G3-SHORT 8년11개월 → floor=8 < 10, meets=false ★Pre-Do RED", () => {
    // 2014-07-01 ~ 2023-06-01 = 8년 11개월 → floor=8
    const r = calcCohabitYears("2014-07-01", "2023-06-01", undefined, 0);
    expect(r.rawYears).toBe(8);
    expect(r.meetsRequirement).toBe(false);
  });

  it("G3-9Y11M 9년11개월 → floor=9 < 10, meets=false", () => {
    const r = calcCohabitYears("2013-07-02", "2023-06-01", undefined, 0);
    expect(r.rawYears).toBe(9);
    expect(r.meetsRequirement).toBe(false);
  });

  // ─── 미성년 기간 제외 (2016.1.1.~ 적용) ─────────────────────
  it("G3-MINOR 2005-01-01 동거시작, 2004-01-01 생 → 성인=2023-01-01, effectiveYears=0 ★Pre-Do RED", () => {
    // adultDate = birthDate + 19년 = 2004-01-01 + 19년 = 2023-01-01
    // effectiveStart = max(cohabitStart=2005-01-01, adultDate=2023-01-01) = 2023-01-01
    // rawYears = differenceInYears(2023-01-01, 2023-01-01) = 0
    // deathDate=2023-01-01 >= 2016-01-01 → 미성년 제외 적용
    const r = calcCohabitYears("2005-01-01", "2023-01-01", "2004-01-01", 0);
    expect(r.minorYearsDeducted).toBeGreaterThan(0);
    expect(r.effectiveYears).toBe(0);
    expect(r.meetsRequirement).toBe(false);
  });

  it("G3-MINOR-PARTIAL 2000-01-01 동거, 2010-01-01 생 → 성인=2029-01-01, deathDate=2025-01-01", () => {
    // adultDate = 2010-01-01 + 19년 = 2029-01-01
    // effectiveStart = max(2000-01-01, 2029-01-01) = 2029-01-01
    // deathDate=2025-01-01 < effectiveStart=2029-01-01
    // → differenceInYears(2025-01-01, 2029-01-01) = 음수 → floor → 0 (미만)
    const r = calcCohabitYears("2000-01-01", "2025-01-01", "2010-01-01", 0);
    expect(r.effectiveYears).toBe(0);
    expect(r.meetsRequirement).toBe(false);
  });

  it("G3-MINOR-ADULT 2000-01-01 동거, 1985-01-01 생(성인=2004-01-01) → 성인 후 동거=같음", () => {
    // adultDate=1985+19=2004-01-01
    // effectiveStart=max(2000-01-01, 2004-01-01)=2004-01-01
    // rawYears=differenceInYears(2023-01-01, 2004-01-01)=19
    const r = calcCohabitYears("2000-01-01", "2023-01-01", "1985-01-01", 0);
    expect(r.effectiveYears).toBe(19);
    expect(r.meetsRequirement).toBe(true);
  });

  it("G3-MINOR-NO-BIRTHDATE birthDate 미입력 → minorYearsDeducted=0(추정 금지)", () => {
    // birthDate 없음 → 미성년 기간 자동 추정 금지 → 0 처리
    const r = calcCohabitYears("2010-01-01", "2023-01-01", undefined, 0);
    expect(r.minorYearsDeducted).toBe(0);
  });

  it("G3-PRE2016-MINOR deathDate 2015(미성년제외 개정 전) → 미성년 제외 적용 안 함", () => {
    // §23의2① 미성년 제외 = 2016.1.1.~ 시행
    // deathDate=2015-06-01 < 2016-01-01 → minorYearsDeducted=0
    const r = calcCohabitYears("2000-01-01", "2015-06-01", "2000-01-01", 0);
    // deathDate 2015는 2016 전이므로 미성년 제외 규정 없음
    expect(r.minorYearsDeducted).toBe(0);
    // rawYears = differenceInYears(2015-06-01, 2000-01-01) = 15
    expect(r.effectiveYears).toBe(15);
    expect(r.meetsRequirement).toBe(true);
  });

  // ─── 부득이 사유 제외 (§23의2②) ────────────────────────────
  it("G3-EXCLUDED excludedYears=2 → effectiveYears 감소", () => {
    // 동거 11년 - 부득이 2년 = 9년 < 10년
    const r = calcCohabitYears("2012-01-01", "2023-01-01", undefined, 2);
    expect(r.rawYears).toBe(11);
    expect(r.effectiveYears).toBe(9);
    expect(r.meetsRequirement).toBe(false);
  });

  it("G3-EXCLUDED-OK excludedYears=1, 총 12년 → effectiveYears=11 meets=true", () => {
    const r = calcCohabitYears("2011-01-01", "2023-01-01", undefined, 1);
    expect(r.rawYears).toBe(12);
    expect(r.effectiveYears).toBe(11);
    expect(r.meetsRequirement).toBe(true);
  });

  it("G3-EXCLUDED-ZERO excludedYears undefined → 0 처리", () => {
    const r = calcCohabitYears("2010-01-01", "2023-01-01", undefined, 0);
    expect(r.effectiveYears).toBe(13);
  });

  // ─── 복합: 미성년 + 부득이 사유 ─────────────────────────────
  it("G3-COMBINED 2000-01-01 동거, 1990-01-01 생(성인=2009-01-01), 부득이1년 → effectiveYears=13", () => {
    // effectiveStart=max(2000-01-01, 2009-01-01)=2009-01-01
    // rawYears=differenceInYears(2023-01-01, 2009-01-01)=14
    // effectiveYears=14-1=13, meets=true
    const r = calcCohabitYears("2000-01-01", "2023-01-01", "1990-01-01", 1);
    expect(r.effectiveYears).toBe(13);
    expect(r.meetsRequirement).toBe(true);
  });

  it("G3-MEETS-EXACTLY-10-AFTER-DEDUCTIONS 미성년+부득이로 정확히 10년", () => {
    // 동거 2000-01-01~2023-01-01=23년
    // 생년=1994-01-01 → 성인=2013-01-01 → effectiveStart=2013-01-01
    // rawYears=differenceInYears(2023-01-01,2013-01-01)=10
    // excludedYears=0 → effectiveYears=10 meets=true
    const r = calcCohabitYears("2000-01-01", "2023-01-01", "1994-01-01", 0);
    expect(r.effectiveYears).toBe(10);
    expect(r.meetsRequirement).toBe(true);
  });
});
