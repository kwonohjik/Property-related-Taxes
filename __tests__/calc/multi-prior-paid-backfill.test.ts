/**
 * 다건 양도세 기납부세액 self-heal — backfillPriorPaid.
 *
 * priorPaidNational 포착(2026-07-06 PR#516) 이전에 로드된 자산·저장 이력은 자산별 예정세액이
 * 비어 computeAutoPriorPaid=0. sourceCalculationId로 원본 단건 record를 되살려 채운다.
 */
import "fake-indexeddb/auto";
import { beforeEach, describe, it, expect } from "vitest";
import { calculationRepository, resetLocalDB } from "@/lib/storage";
import type { PropertyItem } from "@/lib/stores/multi-transfer-tax-store";
import { backfillPriorPaid } from "@/lib/calc/transfer-multi-load-entry";

function singleRecordInput() {
  return {
    taxType: "transfer" as const,
    title: "단건 A",
    inputData: { assets: [{ assetKind: "land", addressJibun: "강남 1-1" }], transferDate: "2026-01-10" },
    resultData: { mode: "single", result: { determinedTax: 12_340_000, localIncomeTax: 1_234_000 } },
    taxLawVersion: "2026",
    linkedCalculationId: null,
    clientId: null,
  };
}

let recId = "";

function prop(over: Partial<PropertyItem> = {}): PropertyItem {
  return {
    propertyId: "p1",
    propertyLabel: "양도 1번",
    completionPercent: 100,
    form: { transferDate: "2026-01-10", filingDate: "2026-03-31" } as PropertyItem["form"],
    ...over,
  };
}

describe("backfillPriorPaid — sourceCalculationId로 예정세액 self-heal", () => {
  beforeEach(async () => {
    await resetLocalDB();
    const { id } = await calculationRepository.saveOrUpdateByBusinessKey(singleRecordInput());
    recId = id;
  });

  it("priorPaidNational 미보유 + sourceCalculationId 있으면 record에서 채움", async () => {
    const [filled] = await backfillPriorPaid([prop({ sourceCalculationId: recId })]);
    expect(filled.priorPaidNational).toBe(12_340_000);
    expect(filled.priorPaidLocal).toBe(1_234_000);
  });

  it("이미 priorPaidNational 보유하면 무변경(재조회 안 함)", async () => {
    const original = prop({ sourceCalculationId: recId, priorPaidNational: 999, priorPaidLocal: 99 });
    const [filled] = await backfillPriorPaid([original]);
    expect(filled.priorPaidNational).toBe(999);
    expect(filled.priorPaidLocal).toBe(99);
  });

  it("sourceCalculationId 없으면(수동 추가) 무변경", async () => {
    const [filled] = await backfillPriorPaid([prop()]);
    expect(filled.priorPaidNational).toBeUndefined();
  });

  it("record 미존재 시 무변경", async () => {
    const [filled] = await backfillPriorPaid([prop({ sourceCalculationId: "nope" })]);
    expect(filled.priorPaidNational).toBeUndefined();
  });
});
