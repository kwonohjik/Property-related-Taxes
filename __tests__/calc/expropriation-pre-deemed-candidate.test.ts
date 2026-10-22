/**
 * `isPreDeemedConversionCandidate` — ⑧·⑫·⑤가 함께 쓰는 「의제취득일 전 ③ 후보」 판정(Q-10 A · 계획서 §14).
 * ③을 엔진 `calcPreDeemed`가 영 §176조의2④로 만들 때만 참이다 — 재개발은 ③이 영 §166③(§164⑨ 대상 아님),
 * 일반건물·겸용·매매 상가는 자기 서브객체로 취득가액을 만든다.
 */
import { describe, it, expect } from "vitest";
import { isPreDeemedConversionCandidate } from "@/lib/calc/expropriation-required-gate";

const IA = { mode: "pre-deemed", standardPriceAtDeemedDate: 10_000_000 };

describe("isPreDeemedConversionCandidate", () => {
  it("pre-deemed + ③ 분자(직접 · §164④ 토지등급 · §164⑦ 주택) → 참", () => {
    expect(isPreDeemedConversionCandidate({ inheritedAcquisition: IA })).toBe(true);
    expect(isPreDeemedConversionCandidate({ inheritedAcquisition: { mode: "pre-deemed" }, pre1990Land: {} })).toBe(true);
    expect(isPreDeemedConversionCandidate({ inheritedAcquisition: { mode: "pre-deemed" }, inheritedHouseValuation: {} })).toBe(true);
  });
  it("③ 분자 없음 · post-deemed · 상속 의제 없음 → 거짓", () => {
    expect(isPreDeemedConversionCandidate({ inheritedAcquisition: { mode: "pre-deemed" } })).toBe(false);
    expect(isPreDeemedConversionCandidate({ inheritedAcquisition: { mode: "post-deemed" } })).toBe(false);
    expect(isPreDeemedConversionCandidate({})).toBe(false);
  });
  it("재개발 · 일반건물 · 겸용 · 매매 상가 서브객체 → 거짓", () => {
    for (const k of ["redevelopment", "generalBuildingValuation", "mixedUse", "commercialBuildingValuation"] as const)
      expect(isPreDeemedConversionCandidate({ inheritedAcquisition: IA, [k]: {} }), k).toBe(false);
  });
  it("감정가액 · 매매사례 모드 → 거짓", () => {
    for (const acquisitionMethod of ["appraisal", "salesCase"])
      expect(isPreDeemedConversionCandidate({ inheritedAcquisition: IA, acquisitionMethod }), acquisitionMethod).toBe(false);
  });
});
