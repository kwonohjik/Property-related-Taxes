/**
 * anchor: split 자산의 **자산 단위 자본적지출**은 파트 칸으로 안내한다 (F23 동반 발견)
 *
 * ## 무엇이 조용히 버려지고 있었나
 *
 * 실측(2026-08-23): `hasSeperateLandAcquisitionDate` 자산에 자산 전체 자본적지출 30,000,000을
 * 넣어도 **실가·환산 두 모드 모두 세액 변화 0**이다. `calcSplitGain`은 파트 칸
 * (`landDirectExpenses`·`buildingDirectExpenses`)만 읽는다. 그런데 화면에는 자산 전체 칸이
 * 그대로 보인다(`AssetSectionExpense`는 split 게이트가 없다) — **입력하고도 사라진다**.
 *
 * ## 왜 자동 안분으로 메우지 않는가
 *
 * 「소득세법」 §100② 후문은 「공통되는 **취득가액과 양도비용**」만 안분 대상으로 열거하고
 * **자본적지출은 열거하지 않는다**. 게다가 §97②2호가 파트별로 갈린다 —
 * 실가 파트는 **가산**, 환산 파트는 가목↔나목 **택일**이라 귀속 파트를 모르면 조문대로 계산할 수 없다.
 *
 * 일반건물 경로가 이미 같은 판단을 한다(`transfer-tax-validate-gb.ts` V-8).
 * 그쪽은 「두 파트가 모두 환산일 때만 자산 칸 허용」이라는 예외를 두지만, 일반 split 경로에는
 * **그 예외조차 성립하지 않는다** — 위 실측대로 환산에서도 도달하지 않기 때문이다.
 *
 * ⚠️ **양도비는 대상이 아니다** — §100② 후문의 명문 열거라 엔진이 파트에 안분한다
 *    (anchor `split-transfer-expense-f23.anchor.test.ts`). 자산 전체 칸을 그대로 쓰면 된다.
 */
import { describe, it, expect } from "vitest";
import { validateSplitDirectInputs } from "@/lib/calc/transfer-tax-validate-split";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";

function splitAsset(over: Partial<ReturnType<typeof makeDefaultAsset>> = {}) {
  return {
    ...makeDefaultAsset(1),
    assetKind: "housing" as const,
    hasSeperateLandAcquisitionDate: true,
    saleSplitMode: "actual" as const,
    actualSalePrice: "1,000,000,000",
    fixedAcquisitionPrice: "400,000,000",
    landStandardPriceAtTransfer: "600,000,000",
    buildingStandardPriceAtTransfer: "400,000,000",
    ...over,
  };
}

const CAPEX_MARK = /자본적지출도 토지분·건물분 칸에 각각 입력/;

describe("F23 · split 자산 단위 자본적지출 차단", () => {
  it("F23V-01: 자산 전체 자본적지출만 넣으면 차단하고 파트 칸을 안내한다", () => {
    const err = validateSplitDirectInputs(splitAsset({ capitalExpenditure: "30,000,000" }), "자산1");
    expect(err).toMatch(CAPEX_MARK);
    // 근거 조문이 메시지에 남는다 — 「왜 자동으로 나눠주지 않나」에 답한다
    expect(err).toMatch(/§100② 후문|제100조 제2항/);
  });

  it("F23V-02: 파트 칸에 넣었으면 통과한다 (dead-end 아님 — 대체 경로가 실재한다)", () => {
    expect(
      validateSplitDirectInputs(
        splitAsset({ capitalExpenditure: "30,000,000", landDirectExpenses: "20,000,000" }),
        "자산1",
      ),
    ).toBeNull();
    expect(
      validateSplitDirectInputs(
        splitAsset({ capitalExpenditure: "30,000,000", buildingDirectExpenses: "10,000,000" }),
        "자산1",
      ),
    ).toBeNull();
  });

  it("F23V-03: 🔴 양도비는 차단하지 않는다 — 엔진이 §100② 후문으로 안분한다", () => {
    expect(
      validateSplitDirectInputs(splitAsset({ transferExpense: "30,000,000" }), "자산1"),
    ).toBeNull();
  });

  it("F23V-04: split이 아니면 관여하지 않는다", () => {
    expect(
      validateSplitDirectInputs(
        splitAsset({ hasSeperateLandAcquisitionDate: false, capitalExpenditure: "30,000,000" }),
        "자산1",
      ),
    ).toBeNull();
  });

  it("F23V-05: 일반건물은 제외 — 그쪽은 validate-gb V-8이 담당한다(중복 차단 금지)", () => {
    expect(
      validateSplitDirectInputs(
        splitAsset({ assetKind: "general_building", capitalExpenditure: "30,000,000" }),
        "자산1",
      ),
    ).toBeNull();
  });
});
