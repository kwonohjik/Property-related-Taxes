/**
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
    expect(screen.getByText(/부담부증여에서는 아직 토지·건물 소유자 분리를 계산하지 않습니다/)).toBeTruthy();
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
