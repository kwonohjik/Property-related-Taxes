/**
 * 일괄 양도 PDF 「신고서 양식」 — «전체 양도차익»·«과세대상 양도차익»·장특 실효율이 화면 신고서 표 합계 열과 같다.
 *
 * 종전: 어댑터(`aggregateToFilingResult`)의 `transferGain`은 합산 엔진 `totalTransferGain`(= 자산별 단건 `transferGain`의 합)이고,
 * 그 값의 뜻이 경로마다 다르다 — 고가주택은 전체 차익, **비과세 자산은 0**, 입주권 §89①4호 안분은 **과세분**. 그래서 PDF가
 *  - 5억 비과세 주택(차익 100,000,000) + 토지(150,000,000) → «전체 양도차익» 150,000,000 (화면 250,000,000)
 *  - 입주권 5억(비과세 200,000,000) + 토지(200,000,000) → 200,000,000 (화면 400,000,000)
 *  - 입주권 15억(안분 전 1,200,000,000) + 토지 → 440,000,000 (화면 1,400,000,000)
 * 으로 비과세·안분분을 빼고 찍었고, 같은 분모를 쓴 장특 «율»도 15억 고가주택 + 토지에서 17%(= 212,000,000 ÷ 1,250,000,000)였다.
 * 화면 합계 열의 정본은 `sumAssetGains`(자산별 leaf 합)다. 세액·양도소득금액은 불변(표시 전용).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { withTestAddress } from "@/__tests__/fixtures/transfer-test-address";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { createDefaultTransferFormData, makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { runCalc } from "../calc/_helpers/redev-one-house-route";
import { HOUSE, LAND, form as g1Form } from "../calc/_helpers/g1-reverse-appurtenant-fixtures";
import { aggregateToFilingResult } from "@/components/calc/results/BundledAllocationCard";
import { TransferSection } from "@/lib/pdf/ResultPdfTransferSections";
import { sumAssetGains } from "@/components/calc/results/transfer/exempt-gross-gain";
vi.mock("@/lib/db/tax-rates", async (io) => { const a = await io<typeof import("@/lib/db/tax-rates")>(); return { ...a, preloadTaxRates: vi.fn() }; });
vi.mock("@/lib/api/rate-limit", () => ({ checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }), getClientIp: vi.fn().mockReturnValue("127.0.0.1"), shouldBypassRateLimit: vi.fn().mockReturnValue(true) }));
import { preloadTaxRates } from "@/lib/db/tax-rates";
beforeEach(() => { vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates()); });
function collect(node: unknown, out: string[] = []): string[] {
  if (node === null || node === undefined || typeof node === "boolean") return out;
  if (typeof node === "string" || typeof node === "number") { out.push(String(node)); return out; }
  if (Array.isArray(node)) { for (const c of node) collect(c, out); return out; }
  const el = node as ReactElement<{ children?: unknown }> & { type?: unknown };
  if (typeof el.type === "function") { try { collect((el.type as (p: unknown) => unknown)(el.props), out); } catch { /* */ } return out; }
  collect((el.props ?? {}).children, out); return out;
}
const after = (t: string[], label: string) => { const i = t.indexOf(label); return i >= 0 ? t[i + 1] : undefined; };
function rightForm(price: string): TransferFormData {
  const f = withTestAddress(createDefaultTransferFormData());
  f.transferDate = "2026-06-01"; f.bundledSaleMode = "actual"; f.householdHousingCount = "0";
  f.contractTotalPrice = String(300_000_000 + Number(price));
  (f as unknown as Record<string, unknown>).isOneHousehold = true;
  (f as unknown as Record<string, unknown>).householdNoOtherHousesConfirmed = true;
  f.householdNoPresaleRightsConfirmed = true as never;
  f.assets[0] = { ...f.assets[0], assetId: "primary-fixed", assetKind: "land", acquisitionCause: "purchase", acquisitionDate: "2010-05-05", fixedAcquisitionPrice: "100000000", actualSalePrice: "300000000", standardPriceAtTransfer: "300000000" } as AssetForm;
  f.assets.push({ ...makeDefaultAsset(2), assetKind: "right_to_move_in", acquisitionCause: "purchase", acquisitionDate: "2018-03-01", fixedAcquisitionPrice: "300000000", actualSalePrice: price, useEstimatedAcquisition: false, redevApprovalDate: "2019-06-01", redevRightsValue: "700000000", redevSettlementAmount: "0", redevPreApprovalExpenses: "0", redevActualAcquisitionPrice: "300000000", redevOriginalAssetType: "housing", redevExemptionEligibleAtApproval: "yes", addressJibun: "서울특별시 마포구 테스트동 1-1", assetId: "companion-fixed" } as unknown as AssetForm);
  return f;
}
function houseForm(price: string): TransferFormData {
  const f = withTestAddress(g1Form({ ...HOUSE(0), actualSalePrice: price, standardPriceAtTransfer: "600000000" }, { ...LAND("l1", 300), landNature: "standalone" }) as TransferFormData);
  f.bundledSaleMode = "actual"; f.contractTotalPrice = String(Number(price) + 300_000_000); return f;
}
async function pdfOf(f: TransferFormData) {
  const r = await runCalc(f);
  expect(r.status).toBe(200);
  const agg = r.json.data.aggregated;
  return { agg, t: collect(TransferSection({ r: aggregateToFilingResult(agg) as unknown as Record<string, unknown> })) };
}
const won = (n: number) => n.toLocaleString();

describe("일괄 PDF — 전체 양도차익·과세대상 양도차익·장특 실효율", () => {
  it("🔑 비과세 5억 주택 + 토지 → 전체 양도차익 250,000,000 · 과세대상 150,000,000 (종전 전체 150,000,000, 과세대상 줄 없음)", async () => {
    const { agg, t } = await pdfOf(houseForm("500000000"));
    expect(sumAssetGains(agg.properties)).toMatchObject({ gross: 250_000_000, taxable: 150_000_000 });
    expect(after(t, "전체 양도차익")).toBe(won(250_000_000));
    expect(after(t, "과세대상 양도차익")).toBe(won(150_000_000));
    expect(after(t, "양도소득금액")).toBe(won(114_000_000)); // 불변
  });

  it("🔑 입주권 5억(비과세) + 토지 → 전체 양도차익 400,000,000 · 과세대상 200,000,000 (종전 200,000,000)", async () => {
    const { t } = await pdfOf(rightForm("500000000"));
    expect(after(t, "전체 양도차익")).toBe(won(400_000_000));
    expect(after(t, "과세대상 양도차익")).toBe(won(200_000_000));
    expect(after(t, "양도소득금액")).toBe(won(140_000_000)); // 불변
  });

  it("🔑 입주권 15억(12억 초과 안분) + 토지 → 전체 양도차익 1,400,000,000 · 과세대상 440,000,000 (종전 440,000,000 하나)", async () => {
    const { t } = await pdfOf(rightForm("1500000000"));
    expect(after(t, "전체 양도차익")).toBe(won(1_400_000_000));
    expect(after(t, "과세대상 양도차익")).toBe(won(440_000_000));
    expect(after(t, "양도소득금액")).toBe(won(380_000_000)); // 불변
  });

  it("🔑 장특 율 = 공제액 ÷ 과세대상 양도차익 — 15억 고가주택 + 토지: 212,000,000 ÷ 370,000,000 = 57.3% (종전 17% = ÷ 전체 1,250,000,000)", async () => {
    const { t } = await pdfOf(houseForm("1500000000"));
    const i = t.findIndex((x) => x.startsWith("장기보유특별공제"));
    expect(t[i + 1]).toBe("57.3%");
  });

  it("짝 — 비과세·안분이 없으면(전체 = 과세대상) 과세대상 줄 없음 · 장특 율은 어댑터 율 그대로 30%", () => {
    const t = collect(TransferSection({ r: { transferGain: 100_000_000, taxableGain: 100_000_000, aggregateGrossGain: 100_000_000, aggregateTaxableGain: 100_000_000, longTermHoldingDeduction: 30_000_000, longTermHoldingRate: 0.3 } }));
    expect(after(t, "전체 양도차익")).toBe(won(100_000_000));
    expect(after(t, "과세대상 양도차익")).toBeUndefined();
    const i = t.findIndex((x) => x.startsWith("장기보유특별공제"));
    expect(t[i + 1]).toBe("30%");
  });

  it("짝 — 새 필드가 없는 구 이력(aggregateGrossGain 없음)은 종전 값(transferGain)으로 그린다", () => {
    const t = collect(TransferSection({ r: { transferGain: 150_000_000, taxableGain: 150_000_000, longTermHoldingDeduction: 36_000_000, longTermHoldingRate: 0.24 } }));
    expect(after(t, "전체 양도차익")).toBe(won(150_000_000));
    const i = t.findIndex((x) => x.startsWith("장기보유특별공제"));
    expect(t[i + 1]).toBe("24%");
  });
});
