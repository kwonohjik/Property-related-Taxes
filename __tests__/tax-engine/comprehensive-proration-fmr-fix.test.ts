import { describe, it, expect } from "vitest";
import { getPropertyFmrForProration } from "@/lib/tax-engine/data/comprehensive-historical";

/**
 * 코드감사 rank1 정정 anchor — 종부세 재산세 비율안분 공제의 재산세 FMR 비대칭 제거.
 *
 * 재산세 실세액(calcTaxBase)은 2024~2026 1세대1주택에 구간별 43/44/45%를 적용하는데,
 * 안분 factor는 60%를 반환해 이중과세조정 공제가 과소 → 결정세액 과다(납세자 불리)였다.
 * 안분공제는 종부세 과세 1주택(공시 12억 초과 = 필연적 >6억)에서만 유효하므로 실세액 FMR은 항상 45%.
 * → 안분 factor도 45%로 일치.
 */
describe("getPropertyFmrForProration — 재산세 안분 FMR 비대칭 정정 (감사 rank1)", () => {
  it("2024·2025·2026 1세대1주택 단일주택: 재산세 실세액과 동일 45% (기존 60% 비대칭 제거)", () => {
    expect(getPropertyFmrForProration(2024, true)).toBe(0.45);
    expect(getPropertyFmrForProration(2025, true)).toBe(0.45);
    expect(getPropertyFmrForProration(2026, true)).toBe(0.45);
  });

  it("2022 1세대1주택: 단일 45% 유지", () => {
    expect(getPropertyFmrForProration(2022, true)).toBe(0.45);
  });

  it("2023 1세대1주택: 특례 없음 → 본문 60%", () => {
    expect(getPropertyFmrForProration(2023, true)).toBe(0.6);
  });

  it("다주택·법인(isOneHouseSingle=false): 연도 무관 본문 60%", () => {
    expect(getPropertyFmrForProration(2024, false)).toBe(0.6);
    expect(getPropertyFmrForProration(2026, false)).toBe(0.6);
    expect(getPropertyFmrForProration(2022, false)).toBe(0.6);
  });
});
