/**
 * 다건 결과 행 ↔ 폼 항목 연결 — 일반건물 카드(`land#<폼 id>`)는 접미사가 폼 항목 id다
 * (계획서 multi-building-valuation-support Q-2 a · `components/calc/results/transfer/multi-result-groups.ts`).
 */
import { describe, it, expect } from "vitest";
import { groupMultiResultRows, multiFormPropertyIdOf } from "@/components/calc/results/transfer/multi-result-groups";
import { buildAggregateMeta } from "@/components/calc/results/transfer/build-aggregate-meta";
import { gbFormulaInputsOf } from "@/components/calc/results/transfer/DetailedStatementGbAsset";
import type { AggregateTransferResult, PerPropertyBreakdown } from "@/lib/tax-engine/types/transfer-aggregate.types";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { GeneralBuildingOutput } from "@/lib/tax-engine/general-building-valuation";

const row = (propertyId: string, transferPrice = 0) => ({ propertyId, transferPrice }) as unknown as PerPropertyBreakdown;
const formOf = (assetKind: string, ownershipNumerator = "100") =>
  ({ transferDate: "2024-03-01", assets: [{ assetId: "a1", assetKind, ownershipNumerator, ownershipDenominator: "100" }] }) as unknown as TransferFormData;

describe("다건 결과 행 묶음", () => {
  it("카드 id는 접미사가 폼 id다 — `baseCardId`(카드 종류)가 아니다", () => {
    expect(multiFormPropertyIdOf("land#prop-1")).toBe("prop-1");
    expect(multiFormPropertyIdOf("building#prop-1")).toBe("prop-1");
    expect(multiFormPropertyIdOf("prop-2")).toBe("prop-2");
  });

  it("일반건물 카드는 한 묶음, 나머지는 행 1개 — 순서 유지", () => {
    const g = groupMultiResultRows([row("prop-0"), row("land#prop-1"), row("building#prop-1"), row("prop-2")]);
    expect(g.map((x) => [x.formPropertyId, x.rows.length, x.isCardGroup])).toEqual([
      ["prop-0", 1, false],
      ["prop-1", 2, true],
      ["prop-2", 1, false],
    ]);
  });

  it("집계 메타 — 카드 행도 폼을 찾는다 · 지분 배지는 카드에 달지 않는다(단건 일반건물 파트 열과 같다)", () => {
    const result = { properties: [row("prop-0"), row("land#prop-1"), row("building#prop-1")] } as unknown as AggregateTransferResult;
    const meta = buildAggregateMeta(result, [
      { propertyId: "prop-0", form: formOf("land", "50") },
      { propertyId: "prop-1", form: formOf("general_building", "50") },
    ]);
    expect(meta.propertyFormMap?.get("land#prop-1")?.assets[0].assetKind).toBe("general_building");
    expect(meta.propertyFormMap?.get("building#prop-1")).toBeDefined();
    expect(meta.ownershipMap?.has("prop-0")).toBe(true);
    expect(meta.ownershipMap?.has("land#prop-1")).toBe(false);
  });

  it("명세서 일반건물 산식 — 다건 카드는 자기 양도건의 폼 자산을 읽는다(첫 양도건 자산이 아니라)", () => {
    const gb = { assetCards: [] } as unknown as GeneralBuildingOutput;
    const cards = [row("land#prop-1", 600), row("building#prop-1", 400)];
    const first = formOf("land").assets[0];
    const mine = formOf("general_building").assets[0];
    const r = gbFormulaInputsOf(cards[0], undefined, { "prop-1": gb }, cards, formOf("land"), { totalTransferPrice: 0, asset: first }, () => mine);
    expect(r.gb).toBe(gb);
    expect(r.asset).toBe(mine);
    expect(r.totalTransferPrice).toBe(1000);
  });
});
