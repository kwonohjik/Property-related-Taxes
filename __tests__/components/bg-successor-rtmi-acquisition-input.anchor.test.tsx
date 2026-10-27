/**
 * anchor: 승계 입주권 부담부증여 — 취득가액 칸은 ③ 승계 블록 한 곳이다(계획서 `bg-successor-rtmi-acquisition-input.plan.md` Q-1 a · Q-2 a).
 * 부담부증여 카드의 「종전 부동산 실지취득가액」 칸·§166 안내는 원조합원 전용이고, 승계 블록의 산정 방식 라디오는 부담부증여에서 숨는다.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { CompanionAssetCard } from "@/components/calc/transfer/CompanionAssetCard";
import { makeDefaultAsset, type AssetForm } from "@/lib/stores/calc-wizard-asset";
import { successorRightTogglePatch } from "@/lib/calc/transfer-successor-right";

afterEach(cleanup);

const right = (over: Record<string, unknown>) =>
  ({
    ...makeDefaultAsset(1), assetKind: "right_to_move_in", redevSubject: "right", acquisitionCause: "purchase", acquisitionDate: "2020-01-01",
    transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_standard", ...over,
  }) as AssetForm;
const succ = (over: Record<string, unknown> = {}) => right({ ...successorRightTogglePatch(true), ...over });

function view(asset: AssetForm) {
  const { container } = render(
    <CompanionAssetCard index={0} asset={asset} bundledSaleMode="actual" onChange={() => {}} transferDate="2026-02-16"
      splitMode="companion" onFractionalToggle={() => {}} hasSiblings={false} />,
  );
  return {
    text: container.textContent ?? "",
    radios: container.querySelectorAll('[name^="successorAcqMode"]').length,
    has: (id: string) => container.querySelector(`[data-testid="${id}"]`) !== null,
    field: (f: string) => container.querySelector(`[data-field="${f}"]`) !== null,
  };
}

describe("부담부증여 승계 입주권", () => {
  it.each([["기준시가", {}], ["시가", { bgValuationMode: "sangjeungbeop_market" }]])("%s 평가 — 「종전 부동산」 칸·§166 안내 없이 승계 안내만", (_n, over) => {
    const v = view(succ(over));
    expect(v.field("bgActualAcquisitionTotal")).toBe(false);
    expect(v.text).not.toContain("종전 부동산 실지취득가액");
    expect(v.text).not.toContain("종전 부동산의 실지취득가액");
    expect(v.has("bg-successor-right-acq-pointer")).toBe(true);
  });
  it("승계 블록 — 라디오 0개 · 실거래가 2칸은 보인다", () => {
    const v = view(succ({ isAppraisalAcquisition: true }));
    expect(v.radios).toBe(0);
    expect(v.has("bg-successor-right-actual-only")).toBe(true);
    expect(v.text).toContain("승계취득가액");
    expect(v.text).toContain("취득 후 납입 추가분담금");
    // 남은 감정 플래그가 있어도 감정가액 칸이 아니라 실거래가 칸이다
    expect(v.field("fixedAcquisitionPrice")).toBe(false);
  });
});

describe("범위 — 원조합원·일반 양도는 종전대로", () => {
  it("원조합원 부담부증여 — 「종전 부동산 실지취득가액」 칸과 §166 안내", () => {
    const v = view(right({ isSuccessorRightToMoveIn: false, acquisitionDate: "2009-07-01" }));
    expect(v.field("bgActualAcquisitionTotal")).toBe(true);
    expect(v.text).toContain("종전 부동산의 실지취득가액");
    expect(v.has("bg-successor-right-acq-pointer")).toBe(false);
  });
  it("일반 양도 승계 — 산정 방식 라디오 4개", () => {
    const v = view(succ({ transferType: "regular" }));
    expect(v.radios).toBe(4);
    expect(v.has("bg-successor-right-actual-only")).toBe(false);
  });
});
