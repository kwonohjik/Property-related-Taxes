/**
 * anchor: 입주권 부담부증여 × 축 B 첫 카드 — 둘째 이후 원조합원 지분이 있으면 첫 카드(승계)도
 * 「원조합원 지분의 종전 부동산 실지취득가액」 칸을 보인다(계획서 `bg-axis-b-right-share-inputs.plan.md` 사용자 결정 1).
 * 수정 전(#2635): 첫 카드가 승계면 칸을 숨겨 둘째 원조합원 지분이 넣을 곳이 없었다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { CompanionAssetCard } from "@/components/calc/transfer/CompanionAssetCard";
import { makeDefaultAsset, type AssetForm } from "@/lib/stores/calc-wizard-asset";
import { successorRightTogglePatch } from "@/lib/calc/transfer-successor-right";

afterEach(cleanup);

const HALF = { ownershipNumerator: "50", ownershipDenominator: "100" };
const first = (over: Record<string, unknown>) =>
  ({
    ...makeDefaultAsset(1), assetKind: "right_to_move_in", redevSubject: "right", acquisitionCause: "purchase", transferType: "burdened_gift",
    bgValuationMode: "sangjeungbeop_standard", ...HALF, ...over,
  }) as AssetForm;
const share = (over: Record<string, unknown>) => ({ ...makeDefaultAsset(2), ...HALF, acquisitionCause: "purchase", ...over }) as AssetForm;
const SUCC = { ...successorRightTogglePatch(true), acquisitionDate: "2020-01-01" };
const ORIG = { isSuccessorRightToMoveIn: false, acquisitionDate: "2009-07-01" };

function view(primary: AssetForm, shares: AssetForm[] | undefined) {
  const { container } = render(
    <CompanionAssetCard index={0} asset={primary} primaryAsset={primary} bundledSaleMode="actual" onChange={() => {}} transferDate="2026-02-16"
      splitMode={shares ? "fractional" : "companion"} onFractionalToggle={() => {}} hasSiblings={!!shares} gbFractionalShares={shares} />,
  );
  const text = container.textContent ?? "";
  return { text, hasField: container.querySelector('[data-field="bgActualAcquisitionTotal"]') !== null };
}

describe("축 B 첫 카드", () => {
  it("승계 + 둘째 원조합원 — 「원조합원 지분의 …」 칸이 있다", () => {
    const p = first(SUCC);
    const v = view(p, [p, share(ORIG)]);
    expect(v.hasField).toBe(true);
    expect(v.text).toContain("원조합원 지분의 종전 부동산 실지취득가액");
    expect(v.text).toContain("둘째 이후 원조합원 지분의 계산에 쓰입니다");
  });
  it("승계 + 둘째 승계 — 칸이 없다(#2635 그대로)", () => {
    const p = first(SUCC);
    expect(view(p, [p, share(SUCC)]).hasField).toBe(false);
  });
  it("원조합원 첫 카드 — 종전 라벨 「종전 부동산 실지취득가액」", () => {
    const p = first(ORIG);
    const v = view(p, [p, share(SUCC)]);
    expect(v.hasField).toBe(true);
    expect(v.text).toContain("종전 부동산 실지취득가액");
    expect(v.text).not.toContain("원조합원 지분의 종전 부동산 실지취득가액");
  });
  it("단건 승계 — 칸이 없다", () => {
    expect(view(first(SUCC), undefined).hasField).toBe(false);
  });
});
