/**
 * 가업상속공제 시기 게이트 leaf — G-1·G-2 경계
 *
 * 계획서: docs/02-design/features/transfer-fb-lthd-95-4-latter.plan.md §3.3
 *
 * ⚠️ 두 게이트의 **기준일 축이 다르다**. G-1은 상속개시일, G-2는 양도일이다.
 *    인자를 바꿔 넣으면 조용히 반대로 걸리므로 경계 양쪽을 모두 고정한다.
 */

import { describe, it, expect } from "vitest";
import {
  FB_CGT_INHERITANCE_GATE,
  FB_ASSET_SCOPE_DECREE_GATE,
  isFamilyBusinessCgtEra,
  isFamilyBusinessAssetScopeDecreeEra,
} from "@/lib/tax-engine/data/family-business-cgt-era";

describe("G-1 — §97의2④·§95④ 후단 (기준: 상속개시일)", () => {
  it("경계 상수는 부칙 법률 제12169호 §12 기준 2014-01-01", () => {
    expect(FB_CGT_INHERITANCE_GATE).toBe("2014-01-01");
  });

  it("2013-12-31 상속 → 미적용", () => {
    expect(isFamilyBusinessCgtEra(new Date("2013-12-31"))).toBe(false);
  });

  it("2014-01-01 상속 → 적용 (경계 당일 포함)", () => {
    expect(isFamilyBusinessCgtEra(new Date("2014-01-01"))).toBe(true);
  });

  it("2026-01-01 상속 → 적용", () => {
    expect(isFamilyBusinessCgtEra(new Date("2026-01-01"))).toBe(true);
  });
});

describe("G-2 — 시행령 §163의2③④ 대상 자산 범위 (기준: 양도일)", () => {
  it("경계 상수는 부칙 대통령령 제36129호 §10 기준 2026-02-27", () => {
    expect(FB_ASSET_SCOPE_DECREE_GATE).toBe("2026-02-27");
  });

  it("2026-02-26 양도 → 시행령 명문 이전 (판례 G-3 근거)", () => {
    expect(isFamilyBusinessAssetScopeDecreeEra(new Date("2026-02-26"))).toBe(false);
  });

  it("2026-02-27 양도 → 시행령 §163의2④ 적용 (경계 당일 포함)", () => {
    expect(isFamilyBusinessAssetScopeDecreeEra(new Date("2026-02-27"))).toBe(true);
  });
});

describe("두 게이트의 축이 다르다 — 인자 혼동 감지", () => {
  /**
   * 2014-01-01 상속 · 2026-02-26 양도: G-1은 통과하고 G-2는 미도달.
   * 두 함수에 같은 날짜를 넣으면 이 조합이 재현되지 않으므로 축 혼동이 드러난다.
   */
  it("상속 2014-01-01 · 양도 2026-02-26 → G-1 true, G-2 false", () => {
    expect(isFamilyBusinessCgtEra(new Date("2014-01-01"))).toBe(true);
    expect(isFamilyBusinessAssetScopeDecreeEra(new Date("2026-02-26"))).toBe(false);
  });
});
