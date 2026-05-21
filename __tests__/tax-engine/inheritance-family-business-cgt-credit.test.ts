/**
 * 가업상속공제 §18의2⑩ + 상증령 §15㉑ 양도세 상당액 공제 anchor
 *
 * KoreanLaw MCP 검증 2026-05-21:
 *   - §18의2⑩ — 음수 → 0 가드 명시
 *   - §15㉑ — 산식 = 소법 §97의2④ 양도세액 − 소법 §97 양도세액
 */

import { describe, expect, it } from "vitest";
import { calcFamilyBusinessCgtCredit } from "@/lib/tax-engine/credits/family-business-cgt-credit";

const LAW_REF = "상증법 §18의2⑩ + 상증령 §15㉑";

describe("FB-CGT-CREDIT — 가업상속공제 양도세 상당액 공제 (§18의2⑩)", () => {
  it("FB-CGT-1: 정상 산식 — 의제 > 일반 → 양수 차액 공제", () => {
    const r = calcFamilyBusinessCgtCredit(
      { cgtUnderSection97_2_4: 30_000_000, cgtUnderSection97: 12_000_000 },
      LAW_REF,
    );
    expect(r.creditAmount).toBe(18_000_000);
    expect(r.rawDiff).toBe(18_000_000);
  });

  it("FB-CGT-2: 음수 차액 → 0 가드 (§18의2⑩ 단서)", () => {
    const r = calcFamilyBusinessCgtCredit(
      { cgtUnderSection97_2_4: 5_000_000, cgtUnderSection97: 12_000_000 },
      LAW_REF,
    );
    expect(r.creditAmount).toBe(0);
    expect(r.rawDiff).toBe(-7_000_000);
  });

  it("FB-CGT-3: 양도세 모두 0 → 공제 0", () => {
    const r = calcFamilyBusinessCgtCredit(
      { cgtUnderSection97_2_4: 0, cgtUnderSection97: 0 },
      LAW_REF,
    );
    expect(r.creditAmount).toBe(0);
  });

  it("FB-CGT-4: 같은 금액 → 공제 0 (rawDiff=0)", () => {
    const r = calcFamilyBusinessCgtCredit(
      { cgtUnderSection97_2_4: 10_000_000, cgtUnderSection97: 10_000_000 },
      LAW_REF,
    );
    expect(r.creditAmount).toBe(0);
    expect(r.rawDiff).toBe(0);
  });

  it("FB-CGT-5: breakdown 라벨 — lawRef 마지막 행에만", () => {
    const r = calcFamilyBusinessCgtCredit(
      { cgtUnderSection97_2_4: 30_000_000, cgtUnderSection97: 12_000_000 },
      LAW_REF,
    );
    expect(r.breakdown).toHaveLength(3);
    expect(r.breakdown[2].lawRef).toBe(LAW_REF);
    expect(r.breakdown[2].label).toBe("양도세 상당액 공제");
  });

  it("FB-CGT-6: 음수 케이스 — breakdown 마지막 행 라벨에 '음수 → 0 가드' 표기", () => {
    const r = calcFamilyBusinessCgtCredit(
      { cgtUnderSection97_2_4: 5_000_000, cgtUnderSection97: 12_000_000 },
      LAW_REF,
    );
    expect(r.breakdown[2].label).toMatch(/음수 → 0 가드/);
  });
});
