/**
 * ⑥ 사이드바 — 계산 **전** 자산별 양도가액 미리보기가 ④와 같은 규칙을 쓴다 (2026-10-18)
 * 계획서: docs/02-design/features/transfer-companion-all-fractional-distinct-assets.plan.md §9
 *
 * 종전에는 지분 자산이면 모두 「총액 × 지분」으로 보여 줬다. #2080이 ④를 「함께 양도 지분 자산 = 물건 전체 입력 × 지분율
 * (안분 키도 기준시가 × 지분율)」로 고쳤지만 사이드바는 그대로라, 혼합 묶음·전 자산 지분 함께 양도에서 계산 전 값이
 * 엔진과 달랐다(혼합 안분 5억·5억 vs 엔진 666,666,667·333,333,333). 계산 후에는 서버 값을 읽어 종전에도 맞았다.
 */
import { describe, it, expect } from "vitest";
import { computeTransferPerAssetSummary } from "@/lib/stores/transfer-per-asset-summary";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";

const land = (n: number, over: Partial<AssetForm>): AssetForm =>
  ({
    ...makeDefaultAsset(n), assetKind: "land", acquisitionArea: "300", transferArea: "300", acquisitionCause: "purchase",
    acquisitionDate: "2015-03-03", fixedAcquisitionPrice: "300000000", standardPriceAtTransfer: "500000000",
    ownershipNumerator: "100", ownershipDenominator: "100", ...over,
  }) as AssetForm;
const share = (pct: string): Partial<AssetForm> => ({ ownershipNumerator: pct, ownershipDenominator: "100", ownershipRemainderThirdParty: "yes" });

function form(mode: "actual" | "apportioned", a0: Partial<AssetForm>, a1: Partial<AssetForm>, m?: "companion" | "fractional"): TransferFormData {
  return {
    ...createDefaultTransferFormData(), transferDate: "2026-02-16", contractTotalPrice: "1000000000", bundledSaleMode: mode,
    assets: [land(1, a0), land(2, a1)], ...(m ? { assetSplitMode: m } : {}),
  } as TransferFormData;
}
const preview = (f: TransferFormData) => computeTransferPerAssetSummary(f, null).rows.map((r) => r.salePrice);

describe("계산 전 미리보기 = ④ 규칙", () => {
  it("함께 양도 + 전 자산 지분 · 실거래가 — 물건 전체 12억·8억 × 50% = 6억·4억", () => {
    expect(preview(form("actual", { ...share("50"), actualSalePrice: "1200000000" }, { ...share("50"), actualSalePrice: "800000000" }, "companion"))).toEqual([600_000_000, 400_000_000]);
  });
  it("함께 양도 + 전 자산 지분 · 기준시가 안분 — 키 250M·150M → 625,000,000·375,000,000", () => {
    expect(preview(form("apportioned", share("50"), { ...share("50"), standardPriceAtTransfer: "300000000" }, "companion"))).toEqual([625_000_000, 375_000_000]);
  });
  it("#2080 혼합(100% + 50%) · 실거래가 — 6억·4억", () => {
    expect(preview(form("actual", { actualSalePrice: "600000000" }, { ...share("50"), actualSalePrice: "800000000" }))).toEqual([600_000_000, 400_000_000]);
  });
  it("#2080 혼합(100% + 50%) · 기준시가 안분 — 키 500M·250M → 666,666,667·333,333,333", () => {
    expect(preview(form("apportioned", {}, share("50")))).toEqual([666_666_667, 333_333_333]);
  });
  it("대조군 — 지분별 취득(축 B)은 총액 × 지분 5억·5억 그대로", () => {
    expect(preview(form("actual", share("50"), share("50"), "fractional"))).toEqual([500_000_000, 500_000_000]);
  });
});
