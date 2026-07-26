/**
 * 임대 구분(rentalCategory) 등록시기별 활성 판정 — deriveCategoryAvailability anchor
 *
 * 배제 근거 = rental-article/check.ts REG_DATE_GATE 투영(단일 소스):
 *   - existing_business(나): 세무서 등록일 > 2003-10-29 → 배제
 *   - short_6y(아·자): 등록기준일 max(세무서,지자체) < 2025-06-04 → 배제
 * long_general·unsold_08_09·pre_2018은 등록일 단독 배제 게이트 없음 → 항상 활성.
 * 미입력은 조기 차단 금지(available=true).
 */

import { describe, it, expect } from "vitest";
import { deriveCategoryAvailability } from "@/lib/tax-engine/transfer-tax/rental-housing-exception/eligibility";

const D = (s: string) => new Date(s);

describe("deriveCategoryAvailability — 등록시기별 임대 구분 활성 판정", () => {
  it("케이스1: 화면 케이스(biz 2009-08-12·rental 2009-08-31) → 나·아자 배제, 나머지 3 활성", () => {
    const a = deriveCategoryAvailability(D("2009-08-12"), D("2009-08-31"));
    expect(a.existing_business.available).toBe(false);
    expect(a.short_6y.available).toBe(false);
    expect(a.long_general.available).toBe(true);
    expect(a.unsold_08_09.available).toBe(true);
    expect(a.pre_2018.available).toBe(true);
    // 사유 문구 존재(배제 유형만)
    expect(a.existing_business.reason).toContain("2003.10.29");
    expect(a.short_6y.reason).toContain("2025.6.4");
    expect(a.long_general.reason).toBeUndefined();
  });

  it("케이스3(경계 포함, strict >·<): biz 2003-10-29 → 나 활성 / eff 2025-06-04 → 아자 활성", () => {
    // existing_business: biz == 2003-10-29(당일)은 `> cutoff` 아님 → 활성
    const na = deriveCategoryAvailability(D("2003-10-29"), D("2003-10-29"));
    expect(na.existing_business.available).toBe(true);
    // short_6y: eff == 2025-06-04(당일)은 `< cutoff` 아님 → 활성 (단, biz>2003 → 나는 배제)
    const short = deriveCategoryAvailability(D("2025-06-04"), D("2025-06-04"));
    expect(short.short_6y.available).toBe(true);
    expect(short.existing_business.available).toBe(false); // biz 2025 > 2003-10-29
  });

  it("케이스4(경계 인접): biz 2003-10-30 → 나 배제 / eff 2025-06-03 → 아자 배제", () => {
    const na = deriveCategoryAvailability(D("2003-10-30"), D("2003-10-30"));
    expect(na.existing_business.available).toBe(false);
    const short = deriveCategoryAvailability(D("2025-06-03"), D("2025-06-03"));
    expect(short.short_6y.available).toBe(false);
  });

  it("케이스5b(biz만 입력, rental 미입력): short_6y는 활성(eff null), existing_business는 biz 단독 판정", () => {
    // biz 2009 단독 → existing_business 배제(biz>cutoff), short_6y는 eff null이라 활성(조기 차단 금지)
    const a = deriveCategoryAvailability(D("2009-08-12"), null);
    expect(a.short_6y.available).toBe(true);
    expect(a.existing_business.available).toBe(false);
    // biz 2003-10-29 단독 → existing_business 활성
    const b = deriveCategoryAvailability(D("2003-10-29"), null);
    expect(b.existing_business.available).toBe(true);
    expect(b.short_6y.available).toBe(true);
  });

  it("케이스5a(둘 다 미입력): 5유형 전부 활성(조기 차단 금지)", () => {
    const a = deriveCategoryAvailability(null, null);
    expect(a.long_general.available).toBe(true);
    expect(a.short_6y.available).toBe(true);
    expect(a.existing_business.available).toBe(true);
    expect(a.unsold_08_09.available).toBe(true);
    expect(a.pre_2018.available).toBe(true);
  });

  it("케이스6(근거 없는 3유형): 등록일 무관 항상 활성 — 2025 최신 등록에서도", () => {
    const a = deriveCategoryAvailability(D("2025-07-01"), D("2025-07-01"));
    expect(a.long_general.available).toBe(true);
    expect(a.unsold_08_09.available).toBe(true);
    expect(a.pre_2018.available).toBe(true);
    // 최신 등록: short_6y 활성(eff≥2025-06-04)·existing_business 배제(biz>2003)
    expect(a.short_6y.available).toBe(true);
    expect(a.existing_business.available).toBe(false);
  });

  it("등록기준일 = max(세무서, 지자체) — 늦은 날 기준으로 short_6y 판정", () => {
    // 세무서 2025-07-01(≥cutoff)·지자체 2025-05-01 → max=2025-07-01 ≥ cutoff → 활성
    const a = deriveCategoryAvailability(D("2025-07-01"), D("2025-05-01"));
    expect(a.short_6y.available).toBe(true);
    // 세무서 2025-07-01·지자체 2025-06-01 → max=2025-07-01 ≥ cutoff → 활성
    // 세무서 2025-05-01·지자체 2025-05-31 → max=2025-05-31 < cutoff → 배제
    const b = deriveCategoryAvailability(D("2025-05-01"), D("2025-05-31"));
    expect(b.short_6y.available).toBe(false);
  });
});
