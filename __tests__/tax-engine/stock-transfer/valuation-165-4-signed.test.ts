/**
 * DN-6 — §165④ 평가 계열은 음수를 0으로 clamp하지 않는다 (엔진 계약 고정).
 *
 * 계획서: docs/00-pm/post-listing-deficit-negative-input.plan.md §3.2·§9
 *
 * 🔑 **왜 「없음」을 고정하는가.**
 *   소령 §165④1 가목·나목은 자체 계산식이고 **상증령 §55·§56을 준용하지 않는다**(본문 대조).
 *   「그 가액이 음수인 경우에는 영으로 한다」는 **상증령 §56① 후단에만** 있는 단서다.
 *   ⇒ §165④ 경로에 0-clamp를 얹는 것은 **명문 없는 적용**이다.
 *      [[feedback_no_unfavorable_application_without_legal_basis]]
 *
 *   UI가 결손·자본잠식을 입력받게 되면서 이 경로가 실제로 도달 가능해졌다.
 *   누군가 「음수는 이상하니 0으로」 clamp를 넣으면 이 파일이 막는다.
 */

import { describe, it, expect } from "vitest";
import {
  calcNetIncomePerShare,
  calcNetAssetPerShare,
} from "@/lib/tax-engine/stock-transfer/stock-valuation-post-listing";
import { calcSection165_4Value } from "@/lib/tax-engine/stock-transfer/valuation-165-4-basis";

describe("DN-6: §165④ 계열 음수 clamp 부존재 (소령 §165④1 가목·나목)", () => {
  it("순손익액이 결손이면 1주당 순손익가치가 음수로 남는다 (가목 — 0 clamp 없음)", () => {
    const r = calcNetIncomePerShare({
      addA: [-500_000_000], // 행 1 각 사업연도 소득금액 = 결손
      subB: [],
      shareCount: 100_000,
      discountRate: 0.1, // 소칙 §81② → 상증칙 §17 연 10%
    });
    expect(r.netIncomeAmount).toBe(-500_000_000);
    expect(r.perShareIncome).toBe(-5_000);
    expect(r.perShareValue).toBe(-50_000);
  });

  it("자본잠식이면 1주당 순자산가치가 음수로 남는다 (나목 — 0 clamp 없음)", () => {
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
    expect(r.netAssetAmount).toBe(-2_000_000_000);
    expect(r.perShareAsset).toBe(-20_000);
  });

  it("결손이 「제4항에 따른 평가액」을 실제로 낮춘다 — 부호 반전 시 2.4배 과대", () => {
    const NA_PER_SHARE = 20_000;
    const transferDate = new Date("2026-01-01");

    // 현행 결함: 위젯이 "-"를 지워 결손이 이익으로 뒤집힌다
    const flipped = calcSection165_4Value(50_000, NA_PER_SHARE, false, transferDate);
    // 수정 후: 결손이 보존된다 → §165④1 단서(80% 하한)가 바닥을 잡는다
    const preserved = calcSection165_4Value(-50_000, NA_PER_SHARE, false, transferDate);

    expect(flipped.value).toBe(38_000);
    expect(preserved.value).toBe(16_000);
    expect(preserved.floorApplied).toBe(true); // 20,000 × 80%
  });

  it("자본잠식 순자산가치도 평가액을 낮춘다 — 부호 반전 시 1.7배 과대", () => {
    const transferDate = new Date("2026-01-01");
    const flipped = calcSection165_4Value(50_000, 20_000, false, transferDate);
    const preserved = calcSection165_4Value(50_000, -20_000, false, transferDate);

    expect(flipped.value).toBe(38_000);
    expect(preserved.value).toBe(22_000);
  });
});
