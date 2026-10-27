/**
 * anchor ⑥ — 이월과세 채무 부분(매입분)을 나눈 결과(`mode:"bundled"`)에서 사이드바·자산별 요약이 한 자산으로 합쳐진다.
 * 엔진 설계서 §2.7 — 매입분 행은 `${assetId}__purchased`다. 합치지 않으면 증여분 행만 잡혀 양도가액 9억·취득가액 6천만(조각 하나)이 보이거나,
 * 함께 양도에서는 「계산 후 표시」에 갇힌다. 입력 단계(결과 없음) 값은 토글과 무관하다.
 */
import { describe, it, expect } from "vitest";
import { computeTransferPerAssetSummary } from "@/lib/stores/transfer-per-asset-summary";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-form.types";

const CO = { ...CARRYOVER_DEFAULTS, giftRegistryDate: "2023-06-01", donorAcquisitionDate: "2000-06-01", donorAcquisitionPrice: "100000000", giftDateValuation: "1000000000", giftTaxAmount: "0", giftDebtAssumed: true, giftAssumedDebt: "400000000" };
const carry = (n: number, over: Record<string, unknown> = {}) => ({ ...makeDefaultAsset(n), assetKind: "housing", acquisitionCause: "carryover_gift", carryover: CO, ...over }) as unknown as AssetForm;
const form = (assets: AssetForm[], over: Partial<TransferFormData> = {}): TransferFormData => ({ ...createDefaultTransferFormData(), transferDate: "2026-03-01", assets, contractTotalPrice: "2500000000", bundledSaleMode: "actual", ...over });

type Row = { assetId: string; sale: number; acq: number; exp: number };
const bundled = (rows: Row[]) =>
  ({
    mode: "bundled",
    apportionment: { apportioned: rows.map((r) => ({ assetId: r.assetId, assetLabel: "", assetKind: "housing", allocatedSalePrice: r.sale, allocatedAcquisitionPrice: r.acq, allocatedExpenses: r.exp, displayRatio: 1, standardPriceAtTransfer: 0, saleMode: "actual" })) },
    aggregated: { properties: rows.map((r) => ({ propertyId: r.assetId, transferPrice: r.sale, acquisitionPrice: r.acq, necessaryExpense: r.exp })), determinedTax: 0 },
  }) as never;

describe("⑥ 입력 단계(결과 없음) — 토글·채무와 무관", () => {
  it("S-0 양도가액만 보이고 취득가액·필요경비는 계산 후(0원 제외) — 토글 OFF와 ON이 같다", () => {
    const base = carry(1, { actualSalePrice: "1500000000" });
    const on = computeTransferPerAssetSummary(form([base]), null).rows[0];
    const off = computeTransferPerAssetSummary(form([{ ...base, carryover: { ...CO, giftDebtAssumed: false } }]), null).rows[0];
    expect(on).toEqual(off);
    expect([on.salePrice, on.acqPrice, on.expense]).toEqual([1_500_000_000, 0, 0]);
  });
});

describe("⑥ 계산 후 — `__purchased` 행을 원 자산으로 합친다", () => {
  const f1 = () => form([carry(1, { actualSalePrice: "1500000000" })], { contractTotalPrice: "1500000000" });
  it("S-1 ★ 단건 A 채택: 증여분 + 매입분 → 양도가액 1,500,000,000 · 취득가액 460,000,000", () => {
    const r = computeTransferPerAssetSummary(f1(), bundled([{ assetId: "primary", sale: 900_000_000, acq: 60_000_000, exp: 0 }, { assetId: "primary__purchased", sale: 600_000_000, acq: 400_000_000, exp: 0 }])).rows[0];
    expect([r.salePrice, r.acqPrice, r.salePending, r.acqPending]).toEqual([1_500_000_000, 460_000_000, false, false]);
  });
  it("S-2 ★ 필요경비도 합친다(증여분 3천만 + 매입분 1천만)", () => {
    const r = computeTransferPerAssetSummary(f1(), bundled([{ assetId: "primary", sale: 900_000_000, acq: 60_000_000, exp: 30_000_000 }, { assetId: "primary__purchased", sale: 600_000_000, acq: 400_000_000, exp: 10_000_000 }])).rows[0];
    expect(r.expense).toBe(40_000_000);
  });
  it("S-3 B 채택(한 행) · r = 1(한 행) → 그 행 그대로 (회귀 0)", () => {
    const r = computeTransferPerAssetSummary(f1(), bundled([{ assetId: "primary", sale: 1_500_000_000, acq: 1_000_000_000, exp: 0 }])).rows[0];
    expect([r.salePrice, r.acqPrice]).toEqual([1_500_000_000, 1_000_000_000]);
  });
  it("S-4 ★ 함께 양도 — 둘째 자산(assetId c2)의 매입분은 둘째 행으로만 합쳐지고 첫 자산은 영향 없다", () => {
    const second = carry(2, { assetId: "c2", actualSalePrice: "1000000000" });
    const f = form([carry(1, { actualSalePrice: "1500000000" }), second]);
    const res = bundled([
      { assetId: "primary", sale: 1_500_000_000, acq: 1_000_000_000, exp: 0 },
      { assetId: "c2", sale: 600_000_000, acq: 36_000_000, exp: 0 },
      { assetId: "c2__purchased", sale: 400_000_000, acq: 400_000_000, exp: 0 },
    ]);
    const rows = computeTransferPerAssetSummary(f, res).rows;
    expect([rows[0].salePrice, rows[0].acqPrice]).toEqual([1_500_000_000, 1_000_000_000]);
    expect([rows[1].salePrice, rows[1].acqPrice, rows[1].salePending]).toEqual([1_000_000_000, 436_000_000, false]);
  });
  it("S-5 사이드바 푸터 합계(Σ rows 양도가액)도 조각 합이다", () => {
    const sum = computeTransferPerAssetSummary(f1(), bundled([{ assetId: "primary", sale: 900_000_000, acq: 60_000_000, exp: 0 }, { assetId: "primary__purchased", sale: 600_000_000, acq: 400_000_000, exp: 0 }]));
    expect(sum.totalSalePrice).toBe(1_500_000_000);
  });
});
