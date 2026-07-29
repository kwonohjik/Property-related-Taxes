/**
 * 다주택 중과 한시배제 윈도우 단일소스 + 클라이언트 술어 검증.
 *
 * 근거: 소득세법 시행령 §167의3①12의2·§167의10①12의2 (KoreanLaw 실측 2026-07-19).
 * 계획서: docs/02-design/features/transfer-surcharge-grace-period-ui-hide.plan.md §4-B·§7.
 *
 * 종료일 2026-05-09가 seed suspended_until · 윈도우 상수 · (참조)GRACE_PERIOD_END에 단일 출처로
 * 흐르는지 + UI/validation 공유 술어(양도일 윈도우 AND 보유 2년)의 경계를 고정한다.
 */
import { describe, it, expect } from "vitest";
import { historicalSeeds } from "@/lib/tax-engine/data/transfer-rate-seed-historical";
import {
  SURCHARGE_SUSPENSION_TRANSFER_DATE_WINDOW,
  isWithinSurchargeSuspensionWindow,
} from "@/lib/tax-engine/legal-codes/transfer";
import { isMultiHouseSurchargeSuppressed } from "@/lib/calc/transfer-tax-api-helpers";

describe("중과 한시배제 윈도우 단일소스", () => {
  it("시드 2022-05-10 row: effective_date=window.start, suspended_until=window.end", () => {
    const row = historicalSeeds.find(
      (r) =>
        r.category === "surcharge" &&
        r.effective_date === SURCHARGE_SUSPENSION_TRANSFER_DATE_WINDOW.start,
    );
    expect(row).toBeDefined();
    expect(row?.special_rules?.surcharge_suspended).toBe(true);
    expect(row?.special_rules?.suspended_until).toBe(SURCHARGE_SUSPENSION_TRANSFER_DATE_WINDOW.end);
    expect(row?.special_rules?.suspended_types).toEqual(["multi_house_2", "multi_house_3plus"]);
  });

  it("종료일 상수 = 2026-05-09 (§167의3·167의10 12의2 가목)", () => {
    expect(SURCHARGE_SUSPENSION_TRANSFER_DATE_WINDOW.end).toBe("2026-05-09");
    expect(SURCHARGE_SUSPENSION_TRANSFER_DATE_WINDOW.start).toBe("2022-05-10");
  });
});

describe("isWithinSurchargeSuspensionWindow (양도일 축)", () => {
  it.each([
    ["2022-05-10", true],
    ["2024-01-09", true],
    ["2026-05-09", true],
    ["2022-05-09", false],
    ["2026-05-10", false],
    ["", false],
  ] as const)("%s → %s", (date, expected) => {
    expect(isWithinSurchargeSuspensionWindow(date)).toBe(expected);
  });

  it("undefined/null → false", () => {
    expect(isWithinSurchargeSuspensionWindow(undefined)).toBe(false);
    expect(isWithinSurchargeSuspensionWindow(null)).toBe(false);
  });
});

describe("isMultiHouseSurchargeSuppressed (양도일 윈도우 AND 보유 2년) — UI·validation 공유", () => {
  it("배제기간 내 + 보유 3년 → true", () => {
    expect(isMultiHouseSurchargeSuppressed("2025-06-01", "2022-01-01")).toBe(true);
  });
  it("배제기간 내 + 보유 1년11개월 → false", () => {
    expect(isMultiHouseSurchargeSuppressed("2025-06-01", "2023-07-01")).toBe(false);
  });
  it("배제기간 내 + 보유 정확히 2년 → true", () => {
    expect(isMultiHouseSurchargeSuppressed("2025-06-01", "2023-06-01")).toBe(true);
  });
  it("배제기간 밖(2026-05-10) + 보유 3년 → false", () => {
    expect(isMultiHouseSurchargeSuppressed("2026-05-10", "2020-01-01")).toBe(false);
  });
  it("양도일/취득일 미입력 → false", () => {
    expect(isMultiHouseSurchargeSuppressed("", "2020-01-01")).toBe(false);
    expect(isMultiHouseSurchargeSuppressed("2025-06-01", "")).toBe(false);
  });
});
