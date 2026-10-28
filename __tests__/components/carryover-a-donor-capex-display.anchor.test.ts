/**
 * anchor — 이월과세(§97의2) 시나리오 A: **증여자 자본적지출**은 신고서·명세서 「필요경비」 칸에 있고, 명세서 산식이 그렇게 적는다.
 *
 * 종전: ① `exempt-gross-gain.ts` 주석은 「취득가액 칸에 증여자 자본적지출 승계를 함께 적는다」고 했으나 구현된 적이 없다(값은 필요경비 칸) ·
 * ② 명세서 취득가액 산식이 「증여자 취득 당시 취득가액 N (증여자 자본적지출 M 포함 §97의2①2호)」라 값(N)과 어긋났다 ·
 * ③ 필요경비 산식은 증여자 자본적지출을 「양도비 등 M (중개수수료·법무사 비용 등)」으로 적어 성격이 틀렸다.
 * 세액·값은 불변 — 값(신고서·명세서)은 이미 필요경비 칸이다(비교과세 카드 「당초 증여자 자본적지출」 행과 같은 분류).
 *
 * 픽스처(A0-5 와 같은 계열 — 단건 주택): 양도 700,000,000 · 증여자 취득 444,654,088 · 증여세 상당액 30,000,000.
 * 손계산: 필요경비 = 양도비 1,000,000 + 증여자 자본적지출 20,000,000 + 증여세 30,000,000 = 51,000,000 · 취득가액 칸 = 444,654,088 + 본인 자본적지출 5,000,000 = 449,654,088.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { buildRows, deriveColumns } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";

const rates = makeMockRates();


const TRANSFER = 700_000_000;
function flatten(node: unknown): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(flatten).join("");
  const props = (node as { props?: { children?: unknown } }).props;
  return props ? flatten(props.children) : "";
}
function formOf(): TransferFormData {
  return {
    transferDate: "2026-03-25",
    filingDate: "2026-05-31",
    contractTotalPrice: String(TRANSFER),
    assets: [
      {
        ...makeDefaultAsset(1),
        assetKind: "building",
        acquisitionDate: "2006-05-21",
        actualSalePrice: String(TRANSFER),
        fixedAcquisitionPrice: "444654088",
        capitalExpenditure: "5000000",
        transferExpense: "1000000",
      },
    ],
  } as unknown as TransferFormData;
}




function run(opts: { donorCapex?: number; own?: boolean; transferDate?: string; estimated?: boolean }) {
  const { donorCapex = 0, own = false, transferDate = "2026-02-16", estimated = false } = opts;
  const result = calculateTransferTax(baseTransferInput({
    propertyType: "housing", transferPrice: TRANSFER, transferDate: new Date(transferDate), acquisitionPrice: estimated ? 0 : 444_654_088, acquisitionDate: new Date("2006-05-21"),
    ...(own ? { capitalExpenditure: 5_000_000, transferExpense: 1_000_000 } : {}), expenses: 0, isOneHousehold: false, householdHousingCount: 1, acquisitionCause: "carryover_gift",
    ...(estimated ? { useEstimatedAcquisition: true, standardPriceAtAcquisition: 200_000_000, standardPriceAtTransfer: 500_000_000 } : {}),
    carryoverTaxation: {
      giftRegistryDate: new Date("2021-06-19"), donorAcquisitionDate: new Date("2006-05-21"), useEstimatedAcquisition: estimated, donorAcquisitionPrice: estimated ? 0 : 444_654_088,
      giftTaxAmount: 30_000_000, giftDateValuation: 666_000_000, ...(donorCapex ? { donorCapitalExpenditure: donorCapex } : {}),
    },
  } as Partial<TransferTaxInput>), rates);
  const fd = formOf();
  const { mode } = deriveColumns(result);
  const rows = buildRows(result, mode, fd, fd.assets[0], TRANSFER) as never as Array<{ label: string; values: Record<string, unknown> }>;
  const n = (label: string) => Number(rows.find((x) => x.label === label)?.values["total"] ?? 0);
  const items = buildStatementItems(result, fd, fd.assets[0], undefined, TRANSFER);
  return {
    result, filingAcq: n("취득가액"), filingExp: n("필요경비"),
    acq: Number(items.get("acquisitionPrice")?.value ?? 0), exp: Number(items.get("expenses")?.value ?? 0),
    acqFormula: flatten(items.get("acquisitionPrice")?.formula), expFormula: flatten(items.get("expenses")?.formula),
  };
}

describe("DC-1 증여자 자본적지출 20,000,000 (본인 지출 없음) — 값은 필요경비 칸, 산식도 그렇게 적는다", () => {
  const r = run({ donorCapex: 20_000_000 });
  it("값: 취득가액 칸 444,654,088(증여자 취득가액만) · 필요경비 칸 50,000,000(증여자 자본적지출 + 증여세) — 신고서·명세서 일치", () => {
    expect(r.result.carryoverTaxationDetail?.adoptedScenario).toBe("A");
    expect([r.filingAcq, r.filingExp]).toEqual([444_654_088, 50_000_000]);
    expect([r.acq, r.exp]).toEqual([444_654_088, 50_000_000]);
  });
  it("취득가액 산식은 증여자 자본적지출을 「포함」이라 적지 않는다 (값이 그것을 포함하지 않는다)", () => {
    expect(r.acqFormula).toContain("증여자 취득 당시 취득가액 444,654,088");
    expect(r.acqFormula).not.toContain("증여자 자본적지출");
    expect(r.acqFormula).not.toContain("포함");
  });
  it("필요경비 산식은 증여자 자본적지출을 따로 적고 「양도비 등」으로 섞지 않는다 — 20,000,000 + 증여세 30,000,000 = 50,000,000", () => {
    expect(r.expFormula).toContain("증여자 자본적지출 20,000,000 — 이월과세 §97의2①2호");
    expect(r.expFormula).toContain("증여세 상당액 30,000,000");
    expect(r.expFormula).toContain("= 50,000,000");
    expect(r.expFormula).not.toContain("양도비 등"); // 양도비 등 0 항은 적지 않는다
  });
});

describe("DC-2 증여자 자본적지출 20,000,000 + 본인 자본적지출 5,000,000·양도비 1,000,000", () => {
  const r = run({ donorCapex: 20_000_000, own: true });
  it("취득가액 칸 = 증여자 취득가액 + 본인 자본적지출(449,654,088) · 필요경비 칸 51,000,000", () => {
    expect([r.filingAcq, r.filingExp]).toEqual([449_654_088, 51_000_000]);
    expect([r.acq, r.exp]).toEqual([449_654_088, 51_000_000]);
    expect(r.acqFormula).toContain("+ 자본적지출 5,000,000");
    expect(r.acqFormula).not.toContain("증여자 자본적지출");
  });
  it("필요경비 산식: 양도비 등 1,000,000 + 증여자 자본적지출 20,000,000 + 증여세 상당액 30,000,000 = 51,000,000", () => {
    expect(r.expFormula).toContain("양도비 등 1,000,000");
    expect(r.expFormula).toContain("증여자 자본적지출 20,000,000");
    expect(r.expFormula).toContain("= 51,000,000");
  });
});

describe("DC-3 대조군", () => {
  it("증여자 자본적지출 없음 — 종전 문구 그대로(「양도비 등 0 …」 · 증여자 항 없음)", () => {
    const r = run({});
    expect([r.filingAcq, r.filingExp]).toEqual([444_654_088, 30_000_000]);
    expect(r.expFormula).toContain("양도비 등 0");
    expect(r.expFormula).not.toContain("증여자 자본적지출");
  });

  it("양도일 2024-01-01 전 — 증여자 자본적지출은 불산입(시행일 전): 값 불변 · 증여자 항 없음 · 불산입 고지", () => {
    const r = run({ donorCapex: 20_000_000, transferDate: "2023-12-20" });
    expect(r.filingExp).toBe(30_000_000);
    expect(r.expFormula).not.toContain("증여자 자본적지출 20,000,000 — 이월과세");
    expect(r.expFormula).toContain("증여자 자본적지출 불산입");
  });
});

describe("DC-4 증여자 취득이 환산 — 필요경비 칸이 증여자 자본적지출로 정확히 분해되지 않아 종전 문구를 둔다 (취득가액 산식의 「포함」만 걷어낸다)", () => {
  // 환산 donor: 양도가액 700,000,000 × 기준시가 200,000,000 / 500,000,000 = 환산취득가 280,000,000 · 개산공제 200,000,000 × 3% = 6,000,000.
  it("본문(증여자 자본적지출 5,000,000 < 가목 286,000,000): 필요경비 = 개산공제 6,000,000 + 증여세 30,000,000 — 증여자 자본적지출 항 없음", () => {
    const r = run({ donorCapex: 5_000_000, estimated: true });
    expect(r.result.carryoverTaxationDetail?.scenarioA.necessaryExpenseIsLumpDeduction).toBe(true);
    expect([r.filingAcq, r.filingExp]).toEqual([280_000_000, 36_000_000]);
    expect(r.expFormula).toContain("개산공제 6,000,000");
    expect(r.expFormula).not.toContain("증여자 자본적지출");
    expect(r.acqFormula).not.toContain("포함");
  });

  it("단서(증여자 자본적지출 500,000,000 > 가목): 칸은 취득가액 = 환산취득가 280,000,000 · 필요경비 = 역산 250,000,000 — 증여자 자본적지출 N 을 칸 몫으로 적지 않는다", () => {
    const r = run({ donorCapex: 500_000_000, estimated: true });
    expect(r.result.carryoverTaxationDetail?.scenarioA.necessaryExpenseIsLumpDeduction).toBe(false);
    expect([r.filingAcq, r.filingExp]).toEqual([280_000_000, 250_000_000]);
    expect(r.expFormula).not.toContain("증여자 자본적지출 220,000,000"); // 칸 몫(역산)을 증여자 자본적지출 전액인 것처럼 적지 않는다
    expect(r.acqFormula).not.toContain("포함");
  });
});
