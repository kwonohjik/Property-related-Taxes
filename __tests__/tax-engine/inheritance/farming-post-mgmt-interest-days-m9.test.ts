/**
 * Anchor — M-9 영농상속 사후관리 이자상당액 일수 (신고기한 다음날 ~ 위반일 포함)
 *
 * 이자상당액 일수 = differenceInDays(위반일, 신고기한) — 신고기한 자체는 제외, 그 다음날이 1일차이며
 * 위반일을 포함한다. 가업 §18의2 daysFromFilingToViolation과 동일 관행.
 * 종전 farming 코드는 addDays(신고기한,+1) 후 differenceInDays로 첫날을 이중 배제 → 1일 과소.
 */
import { describe, it, expect } from "vitest";
import { calcFarmingPostMgmt } from "@/lib/tax-engine/deductions/farming-post-mgmt";
import type { FarmingPostMgmtInput } from "@/lib/tax-engine/types/inheritance-farming.types";

function input(filingDeadline: string, violationDate: string): FarmingPostMgmtInput {
  return {
    violation: "asset_disposed",
    violationDate,
    inheritanceStartDate: "2025-01-01", // 5년 내 (만료 2030-01-01)
    filingDeadline,
    baseTaxableAmount: 5_000_000_000,
    interestRate: 0.029,
  };
}

describe("M-9 영농 사후관리 이자상당액 일수 — 신고기한 다음날~위반일(포함)", () => {
  it("[M9-A] 신고기한 1/31 · 위반 2/5 → 5일 (종전 addDays+1은 4일)", () => {
    const r = calcFarmingPostMgmt(2_000_000_000, input("2025-01-31", "2025-02-05"));
    expect(r.recaptureRequired).toBe(true);
    expect(r.interestDays).toBe(5);
  });

  it("[M9-B] 신고기한 1/31 · 위반 2/1(신고기한 다음날) → 1일 (종전은 0일)", () => {
    const r = calcFarmingPostMgmt(2_000_000_000, input("2025-01-31", "2025-02-01"));
    expect(r.interestDays).toBe(1);
  });

  it("[M9-C] 신고기한 전 위반 → 0일 (음수 가드 불변)", () => {
    const r = calcFarmingPostMgmt(2_000_000_000, input("2025-01-31", "2025-01-30"));
    expect(r.interestDays).toBe(0);
  });
});
