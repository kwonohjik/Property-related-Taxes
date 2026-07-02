import { describe, it, expect } from "vitest";
import {
  calcChildrenDeduction,
  calcMinorDeduction,
  calcElderDeduction,
  calcDisabledDeduction,
  resolveS20Params,
} from "@/lib/tax-engine/deductions/personal-deduction-calc";
import type { Heir } from "@/lib/tax-engine/types/inheritance-gift.types";

/**
 * §20 그 밖의 인적공제 연도별 tier (리뷰 확정 #18).
 *
 * KoreanLaw 본문 3버전 축자 확인:
 *   현행(2016.1.1~): 자녀 5천만 / 미성년 1천만·19세 / 연로자 65세·5천만 / 장애인 1천만
 *   개정 전(~2015.12.31, 개정 2010.12.27): 자녀 3천만 / 미성년 500만·20세 / 연로자 60세·3천만 / 장애인 500만
 * 경계 = 법률 제13557호(2015.12.15) 시행 2016.1.1, 상속개시분부터.
 */
const h = (p: Partial<Heir>): Heir => ({ id: "x", relation: "child", ...p }) as Heir;

describe("§20 인적공제 연도별 tier (리뷰 #18)", () => {
  // ── resolver ──
  it("[S20-RESOLVE] 경계 도출", () => {
    expect(resolveS20Params("2016-01-01")).toMatchObject({ childAmount: 50_000_000, minorAgeLimit: 19, elderAgeThreshold: 65 });
    expect(resolveS20Params("2015-12-31")).toMatchObject({ childAmount: 30_000_000, minorAgeLimit: 20, elderAgeThreshold: 60, perYearAmount: 5_000_000, elderAmount: 30_000_000 });
    expect(resolveS20Params(undefined)).toMatchObject({ childAmount: 50_000_000 }); // 미제공=현행
  });

  // ── pre-2016 tier (상속개시일 2015) ──
  it("[S20-CHILD-PRE] 자녀 2명 × 3천만 = 6천만 (2015 상속)", () => {
    const r = calcChildrenDeduction([h({ id: "c1" }), h({ id: "c2" })], "2015-06-01");
    expect(r.totalDeduction).toBe(60_000_000);
  });

  it("[S20-MINOR-PRE] 만11세 → (20-11)×500만 = 4,500만 (2015, 상한 20세)", () => {
    const r = calcMinorDeduction([h({ id: "m1", relation: "child", birthDate: "2004-01-01" })], "2015-01-01");
    expect(r.totalDeduction).toBe(45_000_000);
  });

  it("[S20-ELDER-PRE] 만62세 직계존속 → 3천만 (2015, 기준 60세)", () => {
    const r = calcElderDeduction([h({ id: "e1", relation: "lineal_ascendant", birthDate: "1953-01-01" })], "2015-01-01");
    expect(r.totalDeduction).toBe(30_000_000);
  });

  it("[S20-DISABLED-PRE] 남 만40세 장애인 → 기대여명 42년 × 500만 = 2억1천 (2015)", () => {
    const r = calcDisabledDeduction([h({ id: "d1", relation: "lineal_ascendant", birthDate: "1975-01-01", isDisabled: true, gender: "male" })], "2015-01-01");
    expect(r.totalDeduction).toBe(210_000_000);
  });

  // ── 현행 tier 회귀 (상속개시일 2016+) ──
  it("[S20-CHILD-CUR] 자녀 2명 × 5천만 = 1억 (2016.1.1 경계, 현행)", () => {
    const r = calcChildrenDeduction([h({ id: "c1" }), h({ id: "c2" })], "2016-01-01");
    expect(r.totalDeduction).toBe(100_000_000);
  });

  it("[S20-ELDER-BOUNDARY] 만62세: 2015→3천만 / 2025→0 (60→65세 경계 교차)", () => {
    const pre = calcElderDeduction([h({ id: "e1", relation: "lineal_ascendant", birthDate: "1953-01-01" })], "2015-01-01");
    const cur = calcElderDeduction([h({ id: "e1", relation: "lineal_ascendant", birthDate: "1963-01-01" })], "2025-01-01");
    expect(pre.totalDeduction).toBe(30_000_000); // 62>=60
    expect(cur.totalDeduction).toBe(0); // 62<65
  });
});
