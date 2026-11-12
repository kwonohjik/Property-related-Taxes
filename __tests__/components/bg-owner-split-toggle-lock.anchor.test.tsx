/**
 * 🔄 2026-11-12 PR-3 — 잠김은 **범위 밖**(주택 · 매매 외 취득 · 매매사례/감정 · 공유지분 · 함께 양도)에서만이다. 건물 종류 매매는 켤 수 있다.
 * 종전 단언(주택 부담부증여는 잠김 · 켜진 저장값은 끌 수 있다 · 일반 양도는 잠기지 않는다)은 그대로다.
 *
 * ⑤ 부담부증여 × 소유자 분리 — 「토지·건물 소유자 다름」 토글은 켜는 방향만 잠긴다(⑧·⑫ 차단과 같은 결정 · `bg-owner-split-scope.ts`).
 * 켜진 저장값(이력·양도 유형 전환)은 끌 수 있어야 한다 — ⑧이 이 칸으로 보낸다.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { AssetOwnershipSplitSection } from "@/components/calc/transfer/AssetOwnershipSplitSection";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

const asset = (o: Partial<AssetForm>) => ({ ...makeDefaultAsset(1), assetKind: "housing", ...o }) as AssetForm;
/** 칩 ToggleCard는 잠김을 바깥 label의 `data-disabled`로 싣는다(`components/calc/inputs/ToggleCard.tsx`). */
const locked = () => screen.getByLabelText("토지·건물 소유자 다름").closest('[data-slot="toggle-card"]')?.getAttribute("data-disabled") === "true";

describe("⑤ 부담부증여 소유자 분리 토글 잠금", () => {
  afterEach(cleanup);

  it("부담부증여 · 꺼짐 → 잠김 + 사유", () => {
    render(<AssetOwnershipSplitSection asset={asset({ transferType: "burdened_gift", selfOwns: "both" })} onChange={() => {}} />);
    expect(locked()).toBe(true);
    expect(screen.getByText(/토지·건물 소유자가 다른 자산의 부담부증여는 이 경우 계산하지 않습니다 — 주택\(개별주택가격\)은/)).toBeTruthy();
  });

  it.each([
    ["취득원인 상속", { acquisitionCause: "inheritance" }, /취득원인이 매매인 자산만/],
    ["시가 평가 · 매매사례가액", { bgValuationMode: "sangjeungbeop_market", bgAcquisitionMethod: "salesCase" }, /매매사례가액·감정가액은 계산하지 않습니다/],
    ["시가 평가 · 감정가액", { bgValuationMode: "sangjeungbeop_market", bgAcquisitionMethod: "appraisal" }, /매매사례가액·감정가액은 계산하지 않습니다/],
    ["공유지분", { ownershipNumerator: "1", ownershipDenominator: "2" }, /공유지분 자산은 계산하지 않습니다/],
  ] as const)("건물 · 범위 밖 사유(%s) → 잠김 + 그 사유", (_n, over, reason) => {
    render(<AssetOwnershipSplitSection asset={asset({ assetKind: "building", acquisitionCause: "purchase", transferType: "burdened_gift", selfOwns: "both", ...over })} onChange={() => {}} />);
    expect(locked()).toBe(true);
    expect(screen.getByText(reason)).toBeTruthy();
  });

  it("건물 · 함께 양도(bundled) → 잠김 + 묶음 사유", () => {
    render(<AssetOwnershipSplitSection asset={asset({ assetKind: "building", acquisitionCause: "purchase", transferType: "burdened_gift", selfOwns: "both" })} onChange={() => {}} bundled />);
    expect(locked()).toBe(true);
    expect(screen.getByText(/함께 양도 묶음·지분 분할 취득은 계산하지 않습니다/)).toBeTruthy();
  });

  it("건물 · 매매 · 단독 소유 단건 → 범위 안 — 잠기지 않는다(기준시가 평가 · 시가 평가의 실지/환산 모두)", () => {
    for (const over of [{}, { bgValuationMode: "sangjeungbeop_market", bgAcquisitionMethod: "actual" }, { bgValuationMode: "sangjeungbeop_market", bgAcquisitionMethod: "converted" }] as const) {
      render(<AssetOwnershipSplitSection asset={asset({ assetKind: "building", acquisitionCause: "purchase", transferType: "burdened_gift", selfOwns: "both", ...over })} onChange={() => {}} />);
      expect(locked()).toBe(false);
      cleanup();
    }
  });

  it("부담부증여 · 켜진 저장값 → 끌 수 있다", () => {
    render(<AssetOwnershipSplitSection asset={asset({ transferType: "burdened_gift", selfOwns: "building_only" })} onChange={() => {}} />);
    expect(locked()).toBe(false);
  });

  it("일반 양도 → 잠기지 않는다", () => {
    render(<AssetOwnershipSplitSection asset={asset({ transferType: "regular", selfOwns: "both" })} onChange={() => {}} />);
    expect(locked()).toBe(false);
  });
});
