/**
 * 공시연도 자동 선택 — 평가기준일 기준 기본값 + 실제 고시일 경계 검증
 *
 * - getDefaultPriceYear: 평가기준일(상속개시일·증여일)과 자산별 고시 cutoff 비교 → 공시연도 기본값
 * - isNoticeAfterReference: 조회된 실제 고시일(pblntfDe)과 평가기준일 비교 → 과대선택 경고 판정
 *
 * 계획: docs/00-pm/standard-price-notice-year-auto.plan.md
 */

import { describe, it, expect } from "vitest";
import { getDefaultPriceYear, isNoticeAfterReference } from "@/lib/hooks/useStandardPriceLookup";

describe("getDefaultPriceYear — 평가기준일 기준 공시연도 기본값", () => {
  // 주택(공동·개별): cutoff 0429
  it("주택: 상속개시일 4.28 (cutoff 0429 이전) → 전년도", () => {
    expect(getDefaultPriceYear("2023-04-28", "housing")).toBe("2022");
  });

  it("주택: 상속개시일 4.29 (cutoff 당일) → 당해년도", () => {
    expect(getDefaultPriceYear("2023-04-29", "housing")).toBe("2023");
  });

  it("주택: 상속개시일 6.01 (cutoff 이후) → 당해년도", () => {
    expect(getDefaultPriceYear("2023-06-01", "housing")).toBe("2023");
  });

  it("주택: 상속개시일 1.10 (연초) → 전년도", () => {
    expect(getDefaultPriceYear("2023-01-10", "housing")).toBe("2022");
  });

  // 토지: cutoff 0531
  it("토지: 상속개시일 5.30 (cutoff 0531 이전) → 전년도", () => {
    expect(getDefaultPriceYear("2023-05-30", "land")).toBe("2022");
  });

  it("토지: 상속개시일 5.31 (cutoff 당일) → 당해년도", () => {
    expect(getDefaultPriceYear("2023-05-31", "land")).toBe("2023");
  });

  it("농지(land_farmland): 토지와 동일 cutoff 0531", () => {
    expect(getDefaultPriceYear("2023-05-30", "land_farmland")).toBe("2022");
    expect(getDefaultPriceYear("2023-05-31", "land_farmland")).toBe("2023");
  });

  it("미입력: 오늘 날짜 fallback (예외 없이 4자리 연도 반환)", () => {
    const y = getDefaultPriceYear("", "housing");
    expect(y).toMatch(/^\d{4}$/);
  });

  // 의제취득(1985.1.1) 취득시 기준시가 드롭다운 2026 표시 버그 원인 고정 (작업 4):
  // 클램핑된 "1985-01-01"(land)은 5.31 이전 → 1984 도출. yearOptions는 현재연도~1985뿐이라
  // 1984가 옵션에 없어 select가 초기값(현재연도)을 못 벗어남 → 드롭다운 숨김이 정답.
  it("의제취득: 토지 1985-01-01 → 1984 (yearOptions 밖 → 드롭다운 숨김 트리거)", () => {
    expect(getDefaultPriceYear("1985-01-01", "land")).toBe("1984");
  });
});

describe("isNoticeAfterReference — 실제 고시일 경계 검증 (과대선택 경고)", () => {
  it("고시일이 평가기준일보다 늦음 → 경고 (true): 미고시 상태", () => {
    // 상속개시일 2023-04-15, 2023년 공동주택 실제 고시일 2023-04-28 → 평가기준일 시점 미고시
    expect(isNoticeAfterReference("20230428", "2023-04-15")).toBe(true);
  });

  it("고시일 = 평가기준일 → 경고 없음 (false): 당일 고시 효력", () => {
    expect(isNoticeAfterReference("20230428", "2023-04-28")).toBe(false);
  });

  it("고시일이 평가기준일보다 이름 → 경고 없음 (false): 정상 고시", () => {
    expect(isNoticeAfterReference("20220429", "2023-04-15")).toBe(false);
  });

  it("평가기준일 미입력 → 경고 없음 (false)", () => {
    expect(isNoticeAfterReference("20230428", "")).toBe(false);
  });

  it("고시일 미확보(빈 문자열) → 경고 없음 (false)", () => {
    expect(isNoticeAfterReference("", "2023-04-15")).toBe(false);
  });

  it("연도 경계: 2024-01-05 상속, 2024년 고시일 2024-04-30 → 미고시 경고", () => {
    expect(isNoticeAfterReference("20240430", "2024-01-05")).toBe(true);
  });
});
