/**
 * anchor ⑤ — 원조합원 §166 자산은 일반 「취득시·양도시 기준시가」 칸이 **화면에 없다**.
 *
 * ④(주 자산·컴패니언)·⑧이 같은 leaf(`redevHiddenGeneralStdPrice`)로 «화면에 없는 칸은 싣지도 인정하지도 않는다»를
 * 지킨다(`__tests__/api/transfer.route.redev-hidden-stdprice-reduction.anchor.test.ts`). 그 전제는 ⑤가 같은 술어로
 * 칸을 숨기는 것이다 — 여기서 렌더로 고정한다(계획서 `docs/00-pm/redev-hidden-stdprice-reduction.plan.md`).
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { CompanionAcquisitionCauseSection } from "@/components/calc/transfer/CompanionAcquisitionCauseSection";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(() => cleanup());

const STALE = { standardPriceAtAcq: "100000000", standardPriceAtTransfer: "500000000" };

function count(over: Partial<AssetForm>) {
  const a = {
    ...makeDefaultAsset(1),
    acquisitionCause: "purchase",
    acquisitionDate: "2008-01-01",
    useEstimatedAcquisition: true,
    ...STALE,
    ...over,
  } as AssetForm;
  const { container } = render(
    <CompanionAcquisitionCauseSection asset={a} onChange={() => {}} transferDate="2026-02-16" isNewConstruction={false} />,
  );
  return {
    acq: container.querySelectorAll('[data-field="standardPriceAtAcq"]').length,
    tr: container.querySelectorAll('[data-field="standardPriceAtTransfer"]').length,
  };
}

describe("⑤ 일반 기준시가 칸 — ④⑧과 같은 술어", () => {
  it.each([
    ["원조합원 완공APT", { assetKind: "redevelopment_apt", redevIsSuccessorMember: "no" }],
    ["원조합원 입주권", { assetKind: "right_to_move_in", isSuccessorRightToMoveIn: false }],
    ["승계 입주권 — 승계 블록이 §165① 칸을 따로 받는다", { assetKind: "right_to_move_in", isSuccessorRightToMoveIn: true }],
  ] as const)("%s: 칸이 없다", (_l, over) => {
    expect(count(over as Partial<AssetForm>)).toEqual({ acq: 0, tr: 0 });
  });

  it.each([
    ["일반 주택", { assetKind: "housing" }],
  ] as const)("%s: 칸이 있다(대조군)", (_l, over) => {
    expect(count(over as Partial<AssetForm>)).toEqual({ acq: 1, tr: 1 });
  });

  it("승계조합원 완공APT — 실거래가 전용이라 남은 환산 플래그로 기준시가 칸이 열리지 않는다(계획서 redev-successor-bg-acq-method Q-2 a · ④ 미전송과 같은 술어)", () => {
    expect(count({ assetKind: "redevelopment_apt", redevIsSuccessorMember: "yes" })).toEqual({ acq: 0, tr: 0 });
  });
});
