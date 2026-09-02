/**
 * anchor: 임야 편입유예의 **미상 기본값**은 의도된 선택이다 (V5-d)
 *
 * ## 배경
 *
 * 리뷰 V5-d는 임야만 조문 구조가 반대라고 지적했다:
 *   · 농지 「소득세법」 §104의3①1호나목 **단서** / 목장 3호가목 **괄호**
 *     — 「편입일부터 N년이 **지나지 아니한**」 것을 제외 ⇒ 날짜 사실이 **납세자 예외**
 *   · 임야 같은 법 §104의3①2호 본문이 「임야 = 비사업용」, 가목이 그 예외를 열고,
 *     「소득세법 시행령」 §168의9①2호 **단서**가 「편입된 날부터 N년이 **경과한**」 것을 제외
 *     ⇒ 날짜 사실이 **과세를 되살리는 적극적 사실**
 *
 * ## 그래도 계산은 공유한다 — 실측 근거
 *
 * 2014.03.11. 시행본에서 §168의8⑥은 「2년」, §168의9①2호 단서도 「편입된 날부터 **2년**이
 * 경과한」이었고, 제26067호 [시행 2015.02.03]에서 셋 다 **3년**으로 함께 개정됐다
 * (KoreanLaw `get_law_text(mst=151843 / 168102)` 직접 확인 2026-09-02).
 * 문언 방향은 반대지만 귀결이 「N년 이내 → 사업용」으로 같으므로 `isApplied` 해석도 같다.
 *
 * ## 이 테스트가 잠그는 것
 *
 * **편입일 미상일 때 유예 미적용(= 비사업용)** 이라는 현행 선택. 입증책임 배분 판례·예규를
 * 찾지 못해 근거 없이 바꾸지 않기로 한 결정이다. 바꾸려면 근거를 먼저 확보할 것 —
 * 방향은 **과소과세** 쪽이다.
 */
import { describe, it, expect } from "vitest";
import {
  checkIncorporationGrace,
  checkForestIncorporationGrace,
} from "@/lib/tax-engine/non-business-land/period-criteria";
import { judgeForest } from "@/lib/tax-engine/non-business-land/forest";
import type { NonBusinessLandInput } from "@/lib/tax-engine/non-business-land/types";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";

const d = (s: string) => new Date(s);
const RULES = DEFAULT_NON_BUSINESS_LAND_RULES;

/** 산림경영계획 인가 시업중 임야 — §168의9①2호가목. 지역기준이 실제로 걸리는 조건 */
function siupForest(partial: Partial<NonBusinessLandInput> = {}): NonBusinessLandInput {
  return {
    landType: "forest",
    landArea: 5000,
    zoneType: "general_residential",
    acquisitionDate: d("2010-01-01"),
    transferDate: d("2024-06-01"),
    landLocation: { sigunguCode: "11680" },
    forestDetail: { hasForestPlan: true },
    businessUsePeriods: [],
    gracePeriods: [],
    ...partial,
  };
}

describe("[V5-d] 임야 편입유예 — 미상 기본값 계약", () => {
  it("🔴 편입일 미상 → 유예 미적용 (현행 선택 · 근거 확보 전 변경 금지)", () => {
    expect(checkForestIncorporationGrace(undefined, d("2024-06-01"), RULES).isApplied).toBe(false);
  });

  it("🔴 그 결과 판정은 비사업용이고, 「미제공」임을 결과에 드러낸다", () => {
    const r = judgeForest(siupForest(), RULES);
    expect(r.isBusiness).toBe(false);
    const step = r.steps.find((s) => s.id === "forest_urban_grace");
    expect(step?.detail).toContain("편입일 미제공");
  });

  it("편입일이 있으면 종전대로 3년 창으로 판정한다", () => {
    expect(checkForestIncorporationGrace(d("2022-01-01"), d("2024-06-01"), RULES).isApplied).toBe(true);
    expect(checkForestIncorporationGrace(d("2012-01-01"), d("2024-06-01"), RULES).isApplied).toBe(false);
  });

  it("🔴 2년→3년 연혁이 임야에도 적용된다 (구법 §168의9①2호 단서 「2년」)", () => {
    // 2015.02.03. 전 양도 — 구법 2년 창
    expect(checkForestIncorporationGrace(d("2012-06-01"), d("2015-02-02"), RULES).graceYears).toBe(2);
    // 시행일 이후 — 3년 창
    expect(checkForestIncorporationGrace(d("2012-06-01"), d("2015-02-03"), RULES).graceYears).toBe(3);
  });

  it("계산은 농지·목장 공용 함수와 동일하다 (숫자를 따로 두지 않는다)", () => {
    for (const date of [undefined, d("2022-01-01"), d("2012-01-01")]) {
      expect(checkForestIncorporationGrace(date, d("2024-06-01"), RULES)).toEqual(
        checkIncorporationGrace(date, d("2024-06-01"), RULES),
      );
    }
  });

  it("3년 이내면 사업용 — 「경과한 임야를 제외」의 귀결 (대조군)", () => {
    const r = judgeForest(siupForest({ urbanIncorporationDate: d("2022-06-01") }), RULES);
    expect(r.isBusiness).toBe(true);
  });
});
