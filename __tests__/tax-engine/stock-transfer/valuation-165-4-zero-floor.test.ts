/**
 * ZF — §165④ 평가액 0원 하한 (상증령 §55①·§56① 후단 준용)
 *
 * 계획서: docs/00-pm/section-165-4-zero-floor-sangjeung-junyong.plan.md
 *
 * 🔴 **이 파일은 `valuation-165-4-signed.test.ts`를 대체한다.**
 *    그 파일은 「§165④은 상증령 §55·§56을 준용하지 않으므로 음수가 그대로 남는다」를 고정하고 있었다.
 *    **틀린 독법이었다** — 시행령만 보고 **법률 준용을 건너뛴** 판정이다.
 *
 * 위임 체인 (KoreanLaw 본문 확인 2026-09-01):
 *   소법 §99①4 **전단** 「…「상속세 및 증여세법」 제63조제1항제1호나목을 **준용**하여 평가한 가액.
 *                        이 경우 **평가기준시기 및 평가액은 대통령령으로 정하는 바에 따르되**…」
 *     → 상증법 §63①1나목 → 상증령 §54 → §55①(순자산가액) · §56①(순손익액)
 *     → §55① 후단 「순자산가액이 0원 이하인 경우에는 0원으로 한다」
 *     → §56① 후단 「그 가액이 음수인 경우에는 영으로 한다」
 *
 *   ⇒ 소령 §165④은 §99①4 **후단**이 위임한 「평가기준시기 및 평가액」을 정하는 조항이지
 *      **준용을 배제하는 조항이 아니다.** 기준시가 계산의 기본은 상증법 준용이다.
 *
 * 형제 경로가 같은 하한을 이미 쓴다 — `property-valuation/net-asset-calc.ts:83`(§55①) ·
 * `property-valuation/unlisted-orchestrator.ts:247`(§56①).
 */

import { describe, it, expect } from "vitest";
import {
  calcNetIncomePerShare,
  calcNetAssetPerShare,
} from "@/lib/tax-engine/stock-transfer/stock-valuation-post-listing";
import { calcSection165_4Value } from "@/lib/tax-engine/stock-transfer/valuation-165-4-basis";

describe("ZF: §165④ 평가액 0원 하한 (상증령 §55①·§56① 준용)", () => {
  it("ZF-1: 결손 → 1주당 순손익액 0. 단 «행 17 순손익액은 음수 그대로»", () => {
    const r = calcNetIncomePerShare({
      addA: [-500_000_000], // 행 1 각 사업연도 소득금액 = 결손
      subB: [],
      shareCount: 100_000,
      discountRate: 0.1,
    });
    // 행 17은 사실 — 하한은 「평가액」 단계 규정이지 서식 행의 사실을 지우지 않는다
    expect(r.netIncomeAmount).toBe(-500_000_000);
    // 행 21·24 — §56① 후단
    expect(r.perShareIncome).toBe(0);
    expect(r.perShareValue).toBe(0);
  });

  it("ZF-2: 자본잠식 → 순자산가액 0. 원값은 별도로 노출된다", () => {
    const r = calcNetAssetPerShare({
      assetTotalRow1: 1_000_000_000,
      assetAdd: [],
      assetSub: [],
      liabTotalRow8: 3_000_000_000, // 부채 > 자산
      liabAdd: [],
      liabSub: [],
      goodwillRow19: 0,
      shareCount: 100_000,
    });
    expect(r.netAssetBeforeGoodwillRaw).toBe(-2_000_000_000); // 행 18 사실
    expect(r.zeroFloorApplied).toBe(true);
    expect(r.netAssetAmount).toBe(0); // §55① 후단
    expect(r.perShareAsset).toBe(0);
  });

  it("ZF-3: 자본잠식 + 영업권 → 하한을 «먼저» 걸고 영업권을 가산한다 (서식 행 18→19→20)", () => {
    const r = calcNetAssetPerShare({
      assetTotalRow1: 1_000_000_000,
      assetAdd: [],
      assetSub: [],
      liabTotalRow8: 3_000_000_000,
      liabAdd: [],
      liabSub: [],
      goodwillRow19: 300_000_000,
      shareCount: 100_000,
    });
    // max(0, −20억) + 3억 = 3억  ← 순서를 뒤집으면 max(0, −20억 + 3억) = 0이 되어 달라진다
    expect(r.netAssetAmount).toBe(300_000_000);
    expect(r.perShareAsset).toBe(3_000);
  });

  it("ZF-4: 간이 direct — 사용자가 직접 넣은 음수도 0으로 본다 (서식 헬퍼를 안 거치는 경로)", () => {
    const v = calcSection165_4Value(-50_000, -20_000, false, new Date("2026-01-01"));
    expect(v.value).toBe(0);
  });

  it("ZF-5: 자본잠식 — 순손익가치만 살아 평가액 30,000", () => {
    // ni 50,000 / na max(0, −20,000)=0 → (50,000×3 + 0×2)/5 = 30,000, 하한 0
    const v = calcSection165_4Value(50_000, -20_000, false, new Date("2026-01-01"));
    expect(v.value).toBe(30_000);
    expect(v.floorApplied).toBe(false);
  });

  it("ZF-6: 결손+자본잠식 → 평가액 0 — «음수 기준시가는 나오지 않는다»", () => {
    for (const d of ["2026-01-01", "2005-06-01", "1997-06-01"]) {
      const v = calcSection165_4Value(-50_000, -20_000, false, new Date(d));
      expect(v.value, d).toBe(0);
      expect(v.value, `${d}: 기준시가는 음수가 될 수 없다`).toBeGreaterThanOrEqual(0);
    }
  });

  it("ZF-7: 결손이어도 순자산이 있으면 80% 하한이 지배한다 (기존 결과 불변)", () => {
    // ni max(0,−50,000)=0 / na 20,000 → weighted (0+40,000)/5=8,000, floor80=16,000 → 16,000
    const v = calcSection165_4Value(-50_000, 20_000, false, new Date("2026-01-01"));
    expect(v.value).toBe(16_000);
    expect(v.floorApplied).toBe(true);
  });
});
