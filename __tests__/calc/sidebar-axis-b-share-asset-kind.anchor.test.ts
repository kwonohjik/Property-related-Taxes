/**
 * 축 B(같은 물건 지분 분할) 둘째 지분 — 사이드바는 저장값이 아니라 ④와 같은 병합값(첫 카드 기본정보)을 읽는다.
 * 계획서 `docs/00-pm/sidebar-axis-b-share-asset-kind.plan.md`.
 *
 * 둘째 카드는 `makeDefaultAsset(2)`가 만들어 저장 자산 종류가 기본값 «주택»이고 ① 기본정보가 숨겨진다. 종전 사이드바는 그 저장값을 읽어
 * 첫 카드가 토지여도 «자산 2 — 주택», 분양권이면 개산공제율 3%(엔진은 §163⑥4호 1%) 등 엔진에 가는 값과 다른 미리보기를 보였다.
 */
import { describe, it, expect } from "vitest";
import { computeTransferPerAssetSummary } from "@/lib/stores/transfer-per-asset-summary";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-form.types";

const HALF = { ownershipNumerator: "50", ownershipDenominator: "100", ownershipRemainderThirdParty: "" };
const KINDS = ["land", "housing", "building", "presale_right", "right_to_move_in", "general_building", "commercial_building"] as const;

/** 두 지분이 같은 취득 입력(카드마다 입력하는 칸) — 둘째 카드는 화면이 만드는 그대로(저장 자산 종류 기본값). */
function form(kind: AssetForm["assetKind"], lump: boolean, splitMode: TransferFormData["assetSplitMode"] = "fractional"): TransferFormData {
  const perCard = {
    acquisitionCause: "purchase" as const,
    acquisitionDate: "2014-01-02",
    fixedAcquisitionPrice: lump ? "" : "150000000",
    useEstimatedAcquisition: lump,
    standardPriceAtAcq: "100000000",
    standardPriceAtTransfer: "200000000",
    ...HALF,
  };
  const primary = { ...makeDefaultAsset(1), assetKind: kind, landNature: kind === "land" ? "appurtenant" : "", actualSalePrice: "300000000", ...perCard } as AssetForm;
  const second = { ...makeDefaultAsset(2), ...perCard } as AssetForm;
  return { ...createDefaultTransferFormData(), transferDate: "2026-02-16", assetSplitMode: splitMode, assets: [primary, second] };
}

const rowsOf = (f: TransferFormData) => computeTransferPerAssetSummary(f, null).rows;
/** 자산 식별 칸(id·번호·라벨)을 뺀 행 — 두 지분이 같아야 하는 칸만 남긴다. */
const strip = (row: ReturnType<typeof rowsOf>[number]) =>
  Object.fromEntries(Object.entries(row).filter(([k]) => k !== "assetId" && k !== "index" && k !== "assetLabel"));

describe("축 B 둘째 지분 — 사이드바 행이 첫 카드 기본정보를 따른다", () => {
  it("AS-1 ★ 같은 입력의 두 지분은 사이드바 행이 같다(종류·라벨·취득가액·필요경비·미리보기 보류) — 7종 × 실가/환산", () => {
    let checked = 0;
    for (const kind of KINDS) {
      for (const lump of [false, true]) {
        const [r0, r1] = rowsOf(form(kind, lump));
        expect(r1.assetKind, `${kind} ${lump}`).toBe(kind);
        expect(strip(r1), `${kind} 환산=${lump}`).toEqual(strip(r0));
        checked++;
      }
    }
    expect(checked).toBe(14);
  });

  it("AS-2 엔진 축이 갈리던 값 — 분양권 개산공제 1%(500,000) · 입주권 「인가전 분」 · 일반건물 환산은 계산 후", () => {
    expect(rowsOf(form("presale_right", true))[1].expense).toBe(500_000);
    expect(rowsOf(form("right_to_move_in", false))[1].acqLabel).toBe("인가전 분 취득가액");
    expect(rowsOf(form("general_building", true))[1].expensePending).toBe(true);
  });

  it("AS-3 부정 짝 — 함께 양도(서로 다른 물건)는 덮지 않는다: 둘째 자산은 자기 저장값(주택)", () => {
    const r1 = rowsOf(form("land", false, "companion"))[1];
    expect(r1.assetKind).toBe("housing");
  });
});
