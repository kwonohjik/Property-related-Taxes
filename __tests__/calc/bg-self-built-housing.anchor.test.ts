/**
 * anchor — 양도세 계산기 · 부담부증여 × 일체 주택 × 본인 신축 — §114조의2 가산세 base 건물분 입력의 ④·⑧ (V-7 PR-2)
 *
 * 계획서: docs/02-design/features/bg-housing-114-2-building-base.plan.md (Q-3 a)
 * 부담부증여는 양도가액이 채무 안분분이라 계약서 양도가액 구분(`sale`)을 싣지 않는다 — 양도 당시 토지·건물 기준시가만(⑤ `TransferStdPriceCard`).
 * 시료: 아파트(일체 주택) · 시가 5억 · 채무 2억 · 신축 2021-01-01 · 양도 2023-06-01(5년 이내) · 환산(K-5) · 1:1 안분 칸.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { createDefaultTransferFormData, makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import { withTestAddress } from "@/__tests__/fixtures/transfer-test-address";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

afterEach(() => vi.unstubAllGlobals());

const SPLIT = {
  standardPricePerSqmAtAcq: "1,000,000", acquisitionArea: "100", buildingStandardPriceAtAcq: "100,000,000",
  standardPricePerSqmAtTransfer: "1,000,000", transferArea: "100", buildingStandardPriceAtTransfer: "100,000,000",
};
const asset = (over: Partial<AssetForm> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2021-01-01",
    transferType: "burdened_gift", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "500,000,000",
    bgMortgageDebtAmount: "200,000,000", bgDonorRelation: "lineal_descendant", bgAcquisitionMethod: "converted",
    standardPriceAtTransfer: "400,000,000", standardPriceAtAcq: "100,000,000",
    isSelfBuilt: true, buildingType: "new", constructionDate: "2021-01-01",
    ...SPLIT,
    ...over,
  }) as AssetForm;
const form = (a: AssetForm): TransferFormData => {
  const f = createDefaultTransferFormData();
  f.transferDate = "2023-06-01";
  f.isOneHousehold = false;
  f.householdHousingCount = "2";
  f.assets[0] = a;
  return withTestAddress(f);
};
async function bodyOf(f: TransferFormData): Promise<Record<string, unknown>> {
  let captured: Record<string, unknown> = {};
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => {
    captured = JSON.parse(String(init.body));
    return { ok: true, json: async () => ({ data: { mode: "single", result: {} } }) } as Response;
  }));
  try { await callTransferTaxAPI(f); } catch { /* body 만 필요하다 */ }
  return captured;
}
const fieldsOf = (f: TransferFormData) => [0, 1, 2, 3, 4].flatMap((s) => collectStepIssues(s, f)).map((i) => (i as { field?: string }).field);

describe("④ 부담부증여 본인 신축 — 양도가액 구분을 싣지 않는다", () => {
  it("계약서 양도가액 구분 칸에 남은 값이 있어도 selfBuiltHousing 에는 기준시가만", async () => {
    const b = await bodyOf(form(asset({ saleSplitMode: "actual", landTransferPrice: "300,000,000", buildingTransferPrice: "200,000,000" } as Partial<AssetForm>)));
    expect(b.selfBuiltHousing).toEqual({
      landPricePerSqmAtAcquisition: 1_000_000, landArea: 100, buildingStdPriceAtAcquisition: 100_000_000,
      landStdPriceAtTransfer: 100_000_000, buildingStdPriceAtTransfer: 100_000_000,
    });
  });
});

describe("⑧ 부담부증여 본인 신축 — 건물분 칸(화면 순서)", () => {
  it.each([
    ["standardPricePerSqmAtAcq"], ["acquisitionArea"], ["buildingStandardPriceAtAcq"], ["standardPricePerSqmAtTransfer"], ["buildingStandardPriceAtTransfer"],
  ] as const)("%s 비움 → 그 칸", (field) => {
    expect(fieldsOf(form(asset({ [field]: "" } as Partial<AssetForm>)))).toContain(field);
  });
  it("남은 「양도가액 구분 기재」 값이 있어도 화면에 없는 토지·건물 양도가액 칸을 요구하지 않는다(막다른 길 방지)", () => {
    const f = form(asset({ saleSplitMode: "actual", landTransferPrice: "", buildingTransferPrice: "" } as Partial<AssetForm>));
    const fields = fieldsOf(f);
    expect(fields).not.toContain("landTransferPrice");
    expect(fields).not.toContain("buildingTransferPrice");
  });
  it("모두 있으면 건물분 칸 오류 없음 · 5년 경과면 요구하지 않는다", () => {
    const keys = Object.keys(SPLIT);
    expect(fieldsOf(form(asset())).filter((f) => keys.includes(String(f)))).toEqual([]);
    const late = form(asset({ standardPricePerSqmAtTransfer: "" }));
    late.transferDate = "2026-06-01";
    expect(fieldsOf(late)).not.toContain("standardPricePerSqmAtTransfer");
  });
});
