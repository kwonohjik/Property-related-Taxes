/**
 * P2 C — `CompanionAcqPurchaseBlock`의 «별개 취득» 게이트가 ④·⑧과 같은 입력으로 판정한다 (2026-10-19)
 *
 * 이 블록은 `isSeparateAcquisition()`으로 상단 축 A(자산 전체 «취득가액 산정 방식»)를 보일지 정한다. 취득원인·소유자·부담부증여·C 토글을
 * 넘기지 않으면 stale 분리 입력/C 판정이 꺼져 UI는 «별개 취득»(축 A 숨김), ④는 «아님»(자산 전체 취득가액을 읽음)으로 갈린다.
 * 잔재 셀 전수: 블록이 보이는 축 A ⇔ ④가 읽는 `!isSeparateAcquisition(asset)`.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { CompanionAcqPurchaseBlock } from "@/components/calc/transfer/CompanionAcqPurchaseBlock";
import { isSeparateAcquisition } from "@/lib/calc/transfer-tax-split-acq-mode";
import { cAsset } from "../calc/_helpers/split-carryover-c-form";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

afterEach(cleanup);
const noop = () => {};

function axisAVisible(a: AssetForm): boolean {
  const { container } = render(
    <CompanionAcqPurchaseBlock
      asset={a}
      onAssetChange={noop}
      assetKind={a.assetKind}
      hasSeperateLandAcquisitionDate={a.hasSeperateLandAcquisitionDate}
      landAcquisitionDate={a.landAcquisitionDate}
      acquisitionDate={a.acquisitionDate}
      onAcquisitionDateChange={noop}
      useEstimatedAcquisition={false}
      onUseEstimatedChange={noop}
      fixedAcquisitionPrice=""
      onFixedAcquisitionPriceChange={noop}
      standardPriceAtAcq=""
      onStandardPriceAtAcqChange={noop}
      standardPriceAtTransfer=""
      onStandardPriceAtTransferChange={noop}
      transferDate="2025-06-30"
    />,
  );
  const visible = Array.from(container.querySelectorAll("label")).some((l) => l.textContent?.trim() === "취득가액 산정 방식");
  cleanup();
  return visible;
}

/** C 잔재 — 토글 ON + 취득일 분리(서로 다른 두 날) 입력이 남은 자산 */
const residue = (over: Record<string, unknown> = {}) =>
  cAsset({ hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "1995-03-01", acquisitionDate: "2023-03-01", ...over });

describe("CompanionAcqPurchaseBlock 별개 취득 게이트 = ④·⑧ 판정", () => {
  const cells: [string, AssetForm][] = [
    ["C ON + 취득일 분리 잔재 → 별개 취득 아님(축 A 표시)", residue()],
    ["C OFF + 취득일 분리 + 매매 → 별개 취득(축 A 숨김)", residue({ carryoverDonorSplit: false, acquisitionCause: "purchase" })],
    ["C 토글 ON이나 매매로 바뀜 → C 무효, 별개 취득", residue({ acquisitionCause: "purchase" })],
    ["C ON + 부담부증여 → C 무효", residue({ transferType: "burdened_gift" })],
    ["C ON + 소유자 분리(건물만) → C 무효", residue({ selfOwns: "building_only" })],
    ["C ON + 겸용주택 → C 무효", residue({ isMixedUseHouse: true })],
    ["C ON + 같은 날 → 별개 취득 아님", residue({ landAcquisitionDate: "2023-03-01" })],
    ["일반 증여 + 분리 잔재(stale) → 분리 없음", residue({ carryoverDonorSplit: false, acquisitionCause: "gift" })],
  ];
  it.each(cells)("%s", (_, a) => {
    expect(axisAVisible(a)).toBe(!isSeparateAcquisition(a));
  });

  it("🔑 C 잔재 셀에서 축 A가 보인다(④가 아님으로 읽는다) — 판정 입력을 넘기지 않으면 숨겨진다", () => {
    const a = residue();
    expect(isSeparateAcquisition(a)).toBe(false);
    expect(axisAVisible(a)).toBe(true);
  });
});
