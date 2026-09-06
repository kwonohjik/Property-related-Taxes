/**
 * anchor: 함께양도 × 부담부증여 — ⑧이 ⑤와 **같은 술어**를 쓴다 (UI 리뷰 高).
 *
 * ⑧은 폼-전역 `form.bundledSaleMode`만 봤다. 그런데 ⑤(`AssetSectionTransfer.tsx`)는
 * 부담부증여 자산에 대해 모드를 **자산별로 `"apportioned"`로 덮어써** 「계약서상 양도가액」
 * 칸을 렌더하지 않고, `general_building`·시가 모드에서는 그 블록 자체를 렌더하지 않는다.
 *
 * | 상황 | ⑧이 요구하던 것 | 화면 |
 * |---|---|---|
 * | 함께양도 + actual + 부담부증여 | 「계약서상 양도가액을 입력하세요」 | 칸 없음 (「자동 산정됩니다」라고 안내) |
 * | 함께양도 + apportioned + 부담부증여 × GB/시가모드 | 「양도시 기준시가를 입력하세요」 | 칸 없음 (`gb*`·`bgMarketValueAtTransfer`가 받는다) |
 *
 * 근거 — 그 값들은 쓰이지 않거나 다른 필드에서 온다:
 *  · 양도가액: ④가 채무 합계를 placeholder로 넣고 엔진 STEP 0.48이 §159로 재계산
 *    (`transfer-tax-api.ts:191~196`) ⇒ 입력값은 **엔진에 도달하지 않는다**.
 *  · 양도시 기준시가: GB는 `gbTransferLandPricePerSqm × gbLandArea + gbTransferBuildingValue`,
 *    시가 모드는 `bgMarketValueAtTransfer`(`transfer-tax-api-burdened-gift.ts:159·216~226`).
 *
 * 함께양도 × 부담부증여는 2026-09-03에 정식 개방된 조합이다.
 */
import { describe, it, expect } from "vitest";
import {
  usesSelfComputedTransferPrice,
  stdPriceAtTransferComesFromElsewhere,
} from "@/lib/calc/burdened-gift-transfer-price-scope";
import { validateAssetEntry } from "@/lib/calc/transfer-tax-validate-asset";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

/**
 * 계산 가능한 최소 입력 — 남는 오류가 이 축 때문임을 격리한다.
 *
 * ⚠️ 부담부증여는 **선행 ⑧ 검증이 여럿**이다(평가 유형·인수 채무 등). 그것들을 채우지 않으면
 *    이 축에 도달하기 전에 다른 메시지가 나와 anchor가 아무것도 관측하지 못한다
 *    (작성 중 실제로 그랬다 — 「부담부증여 평가 유형을 선택하세요」가 먼저 걸렸다).
 */
function ready(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "housing",
    bgValuationMode: "sangjeungbeop_standard",
    bgMortgageDebtAmount: "300000000",
    standardPriceAtAcq: "400000000",
    acquisitionDate: "2015-01-01",
    acquisitionPrice: "500000000",
    actualSalePrice: "1000000000",
    standardPriceAtTransfer: "700000000",
    acquisitionArea: "100",
    ...over,
  } as AssetForm;
}

/** 함께양도(2자산) 폼. */
function bundled(a: AssetForm, mode: "actual" | "apportioned"): TransferFormData {
  return {
    ...createDefaultTransferFormData(),
    transferDate: "2024-06-01",
    bundledSaleMode: mode,
    assets: [a, ready({ assetId: "2" } as Partial<AssetForm>)],
  } as unknown as TransferFormData;
}

/**
 * ⚠️ **`validateAssetEntry`가 맞는 함수다.** 이 축(다자산 양도가액)은 그 안에 있다 —
 *    비슷한 이름의 `validateAssetAcquisition`(다른 파일)은 이 블록을 갖고 있지 않아,
 *    그걸 부르면 「요구하지 않는다」가 **자동으로 참**이 되어 구별력이 0이 된다
 *    (작성 중 실제로 그렇게 만들었다가 S-5 실패로 발견했다).
 */
const err = (a: AssetForm, mode: "actual" | "apportioned") =>
  validateAssetEntry(a, 0, bundled(a, mode));

describe("함께양도 × 부담부증여 — 양도가액 축", () => {
  it("S-1: 술어 — 부담부증여만 자체 산정, GB·시가모드만 기준시가 대체 경로", () => {
    expect(usesSelfComputedTransferPrice(ready({ transferType: "burdened_gift" }))).toBe(true);
    expect(usesSelfComputedTransferPrice(ready())).toBe(false);
    expect(
      stdPriceAtTransferComesFromElsewhere(
        ready({ transferType: "burdened_gift", assetKind: "general_building" }),
      ),
    ).toBe(true);
    expect(
      stdPriceAtTransferComesFromElsewhere(
        ready({ transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_market" }),
      ),
    ).toBe(true);
    // 일반 부담부증여(주택·기준시가 모드)는 공용 칸을 그대로 쓴다.
    expect(stdPriceAtTransferComesFromElsewhere(ready({ transferType: "burdened_gift" }))).toBe(
      false,
    );
  });

  it("🔑 S-2: actual 모드 + 부담부증여 → 화면에 없는 「계약서상 양도가액」을 요구하지 않는다", () => {
    const bg = ready({ transferType: "burdened_gift", actualSalePrice: "" });
    expect(err(bg, "actual")).not.toContain("계약서상 양도가액");
    // 일반 자산은 종전대로 요구한다(축을 죽인 게 아니다).
    expect(err(ready({ actualSalePrice: "" }), "actual")).toContain("계약서상 양도가액");
  });

  it("🔑 S-3: 부담부증여 × 일반건물 → 화면에 없는 「양도시 기준시가」를 요구하지 않는다", () => {
    const gb = ready({
      transferType: "burdened_gift",
      assetKind: "general_building",
      standardPriceAtTransfer: "",
    });
    expect(err(gb, "apportioned")).not.toContain("양도시 기준시가");
  });

  it("🔑 S-4: 부담부증여 × 시가모드도 같다", () => {
    const mv = ready({
      transferType: "burdened_gift",
      bgValuationMode: "sangjeungbeop_market",
      standardPriceAtTransfer: "",
    });
    expect(err(mv, "apportioned")).not.toContain("양도시 기준시가");
  });

  it("S-5: 부담부증여여도 공용 칸을 쓰는 경우(주택·기준시가 모드)는 종전대로 요구한다", () => {
    const bg = ready({ transferType: "burdened_gift", standardPriceAtTransfer: "" });
    expect(err(bg, "apportioned")).toContain("양도시 기준시가");
  });
});
