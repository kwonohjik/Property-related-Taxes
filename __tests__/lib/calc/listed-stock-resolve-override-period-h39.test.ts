/**
 * H-39/M-5 anchor — resolveOverridePeriod (상증령 §52의2②)
 *
 * 법령(KoreanLaw MCP 2026-07-17 상증령 §52의2②):
 *   1호 평가기준일 이전 사유 → 사유발생일 다음날부터 평가기준일+2월까지
 *   2호 평가기준일 이후 사유 → 평가기준일−2월부터 사유발생일 전일까지
 *   3호 이전·이후 모두 → 이전 사유 다음날 ~ 이후 사유 전일
 *   (2회 이상 → 평가기준일에 가장 가까운 날)
 *
 * 종전 resolveStartOverrideDate: ②1호만·사유일 당일 반환(M-5 '다음날' 오프바이원)·②2·3호(이후) 미구현.
 */
import { describe, it, expect } from "vitest";
import { resolveOverridePeriod } from "@/lib/calc/listed-stock-besshi";

const D = "2022-07-06"; // 평가기준일. D−2월=2022-05-06, D+2월=2022-09-06

describe("H-39/M-5 resolveOverridePeriod (§52의2②)", () => {
  it("②1호 이전 증자 → start = 사유 다음날 (M-5: 당일 아님), end 없음", () => {
    const r = resolveOverridePeriod({ capitalIncreaseDate: "2022-06-15" }, D);
    expect(r.startOverrideDate).toBe("2022-06-16"); // 다음날 (종전 2022-06-15 당일 버그)
    expect(r.endOverrideDate).toBeUndefined();
  });

  it("②2호 이후 합병 → end = 사유 전일, start 없음", () => {
    const r = resolveOverridePeriod({ mergerDate: "2022-07-25" }, D);
    expect(r.startOverrideDate).toBeUndefined();
    expect(r.endOverrideDate).toBe("2022-07-24"); // 전일 (종전 미구현)
  });

  it("②3호 이전·이후 모두 → start 다음날 ~ end 전일", () => {
    const r = resolveOverridePeriod(
      { capitalIncreaseDate: "2022-06-15", mergerDate: "2022-07-25" },
      D,
    );
    expect(r.startOverrideDate).toBe("2022-06-16");
    expect(r.endOverrideDate).toBe("2022-07-24");
  });

  it("사유 없음 → 빈 객체 (전체 2월 구간)", () => {
    expect(resolveOverridePeriod({}, D)).toEqual({});
  });

  it("2월 범위 밖 사유(6개월 전) → override 없음", () => {
    const r = resolveOverridePeriod({ capitalIncreaseDate: "2022-01-01" }, D);
    expect(r.startOverrideDate).toBeUndefined();
    expect(r.endOverrideDate).toBeUndefined();
  });

  it("이전 사유 2회 → 평가기준일에 가장 가까운(최댓값) 날 + 1일", () => {
    const r = resolveOverridePeriod(
      { capitalIncreaseDate: "2022-05-20", mergerDate: "2022-06-30" },
      D,
    );
    // 둘 다 이전 → 가장 가까운 2022-06-30 → start 2022-07-01
    expect(r.startOverrideDate).toBe("2022-07-01");
    expect(r.endOverrideDate).toBeUndefined();
  });
});
