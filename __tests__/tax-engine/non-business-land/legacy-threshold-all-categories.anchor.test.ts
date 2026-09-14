/**
 * anchor — 레거시 기간기준 임계(0.8)는 **지목을 가리지 않는다**
 *
 * 종전 구현(`getThresholdRatio`)은 농지·임야·목장에만 구법 임계 0.8을 적용하고
 * 별장·기타토지에는 현행 0.6을 줬다. 그 분기는 법령 근거가 없었다:
 *
 * - 「소득세법 시행령」 §168의6은 법 §104의3① **각 호 외의 부분**의 「대통령령으로 정하는
 *   기간」을 정의하는 조문이라 지목별 분기 자체가 없다. 개정 전후 본문 실측:
 *   · [시행 2015.01.01. 대통령령 제24356호] 각 호 다목(3호는 나목) 「소유기간의 100분의 20」
 *   · [시행 2015.02.03. 대통령령 제26067호] 같은 자리 「소유기간의 100분의 40」
 * - 제26067호 **부칙 전문(제1조~제23조)**에 §168의6 개별 적용례·경과조치가 없다.
 *   ⇒ 부칙 **제2조②**(「이 영 중 양도소득에 관한 개정규정은 이 영 시행 이후 최초로 양도하는
 *      분부터 적용한다」)만 적용되어 경계는 시행일 **2015-02-03** 하나뿐이다.
 *
 * 🔑 **leaf가 아니라 judge를 통과시켜 잰다** — leaf만 보면 「judge가 그 leaf를 쓴다」가
 *    증명되지 않는다.
 *
 * 🔑 **실질 관문은 별장 하나다.** `meetsPeriodCriteria`를 부르는 judge는 5개지만
 *    (농지·임야·목장·기타토지·별장) 기타토지는 `fullPeriod`(전 보유기간)를 넘기므로
 *    비율이 항상 1이라 임계와 무관하게 통과한다. 농·임·목은 종전에도 0.8이었다.
 *    ⇒ 이 정정으로 실제 판정이 움직이는 곳은 **별장의 2015.2.3. 전 양도분**이다.
 */
import { describe, it, expect } from "vitest";
import { judgeVillaLand } from "@/lib/tax-engine/non-business-land/villa-land";
import { getThresholdRatio } from "@/lib/tax-engine/non-business-land/period-criteria";
import type { NonBusinessLandInput } from "@/lib/tax-engine/non-business-land/types";
import { DEFAULT_NON_BUSINESS_LAND_RULES } from "@/lib/tax-engine/non-business-land/types";

const d = (iso: string) => new Date(iso);
const R = DEFAULT_NON_BUSINESS_LAND_RULES;

/**
 * 별장 — 보유기간의 앞 `nonVillaShare`만 비별장으로 쓰고 나머지를 별장으로 사용.
 * `judgeVillaLand` Step 3-1은 그 **비별장 기간**을 §168의6 기간기준에 태운다.
 */
function villaInput(transfer: string, nonVillaShare: number): NonBusinessLandInput {
  const acq = d("2005-01-01");
  const t = d(transfer);
  const days = (t.getTime() - acq.getTime()) / 86_400_000;
  return {
    landType: "villa_land",
    landArea: 500,
    zoneType: "general_residential",
    acquisitionDate: acq,
    transferDate: t,
    villa: {
      villaUsePeriods: [
        { startDate: new Date(acq.getTime() + days * nonVillaShare * 86_400_000), endDate: t, usageType: "villa" },
      ],
      isEupMyeon: false,
      isRuralHousing: false,
    },
    businessUsePeriods: [],
    gracePeriods: [],
  };
}

/** Step 3-1 통과 = 별장으로 보지 않고 다른 지목으로 재판정(REDIRECT). */
const redirected = (reason: string) => reason.includes("별장 비사용기간 기간기준 충족");

describe("레거시 임계 0.8 — 지목 한정 없음", () => {
  /* ══ leaf — 경계는 시행일 하나뿐 ═══════════════════════════════════════ */

  it("[LT-1] 2015.2.3. 직전일 양도 → 0.8", () => {
    expect(getThresholdRatio(d("2015-02-02"), R)).toBe(0.8);
  });

  it("[LT-2] 2015.2.3. 양도부터 0.6", () => {
    expect(getThresholdRatio(d("2015-02-03"), R)).toBe(0.6);
  });

  /* ══ judge — 별장에서 실제로 판정이 뒤집힌다 ═══════════════════════════ */

  /**
   * 비별장 75% — 구법(사업용 80% 필요)은 탈락, 신법(60% 필요)은 통과.
   * 종전 구현은 별장에 레거시를 적용하지 않아 **양도일과 무관하게** 통과시켰다.
   */
  it("[LT-3] 🔴 별장 비별장기간 75% · 2014-06-01 양도 → 별장 확정 (종전: 재판정 REDIRECT)", () => {
    const r = judgeVillaLand(villaInput("2014-06-01", 0.75), R);
    expect(redirected(r.reason)).toBe(false);
    expect(r.isBusiness).toBe(false);
  });

  it("[LT-4] 같은 사실관계로 2015-02-03 양도 → REDIRECT (신법 60% 통과)", () => {
    const r = judgeVillaLand(villaInput("2015-02-03", 0.75), R);
    expect(redirected(r.reason)).toBe(true);
  });

  /**
   * 회귀 가드 — 구법 임계를 넘는 85%는 2014년 양도여도 REDIRECT여야 한다.
   * [LT-3]만 있으면 「구법 구간을 전부 별장으로 확정하는」 오구현도 통과한다.
   */
  it("[LT-5] 별장 비별장기간 85% · 2014-06-01 양도 → REDIRECT (구법 80% 충족)", () => {
    const r = judgeVillaLand(villaInput("2014-06-01", 0.85), R);
    expect(redirected(r.reason)).toBe(true);
  });
});
