/**
 * 일괄 양도 PDF 「신고서 양식」 — §102② 양도차손 통산(소멸 차손 포함)이 보인다.
 *
 * 종전: 어댑터(`aggregateToFilingResult`)가 `lossOffsetTable`·`totalIncomeAfterOffset`·`unusedLoss`를 싣지 않아 `TransferSection`이
 * 차손 자산이 낀 일괄에서 «양도소득금액 0»만 찍었다 — 15억 고가주택(양도소득금액 44,000,000) + 토지(차손 300,000,000)에서
 * 통산 44,000,000 · 소멸 256,000,000이 있었는데 PDF 어디에도 없었다(다건 PDF `TransferMultiSection`과 화면 합산 신고서는 있다).
 * 같은 자산 양도소득금액 합 −256,000,000이 0으로 접혀 표시되기도 했다.
 * 세액·과세표준은 불변(표시 전용).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { withTestAddress } from "@/__tests__/fixtures/transfer-test-address";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { runCalc } from "../calc/_helpers/redev-one-house-route";
import { HOUSE, LAND, form as g1Form } from "../calc/_helpers/g1-reverse-appurtenant-fixtures";
import { aggregateToFilingResult } from "@/components/calc/results/BundledAllocationCard";
import { TransferSection } from "@/lib/pdf/ResultPdfTransferSections";
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
function mk(housePrice: string, landAcq: string, landSale: string): TransferFormData {
  const f = withTestAddress(g1Form({ ...HOUSE(0), actualSalePrice: housePrice, standardPriceAtTransfer: "600000000" }, { ...LAND("l1", 300), landNature: "standalone", fixedAcquisitionPrice: landAcq, actualSalePrice: landSale }) as TransferFormData);
  f.bundledSaleMode = "actual"; f.contractTotalPrice = String(Number(housePrice) + Number(landSale)); return f;
}
const after = (t: string[], label: string) => { const i = t.indexOf(label); return i >= 0 ? t[i + 1] : undefined; };

/** 라벨 뒤 두 토큰까지 이어 붙인 값 — «- 256,000,000»처럼 부호가 별도 텍스트인 행 대응 */
const val2 = (t: string[], label: string) => { const i = t.indexOf(label); return i < 0 ? undefined : t.slice(i + 1, i + 3).join(""); };
const won = (n: number) => n.toLocaleString();
async function pdfOf(f: TransferFormData) {
  const r = await runCalc(f);
  expect(r.status).toBe(200);
  const agg = r.json.data.aggregated;
  return { agg, t: collect(TransferSection({ r: aggregateToFilingResult(agg) as unknown as Record<string, unknown> })) };
}

describe("일괄 PDF — §102② 양도차손 통산", () => {
  it("🔑 통산 후 전액 소멸(고가주택 + 토지 차손 3억): 양도소득금액 합 −256,000,000 · 통산 후 0 · 소멸 차손 256,000,000 · 통산 내역 44,000,000", async () => {
    const { agg, t } = await pdfOf(mk("1500000000", "600000000", "300000000"));
    expect(agg.unusedLoss).toBe(256_000_000);
    expect(agg.totalIncomeAfterOffset).toBe(0);
    expect(after(t, "양도소득금액")).toBe(won(-256_000_000));
    expect(after(t, "통산 후 양도소득금액")).toBe("0");
    expect(val2(t, "소멸 차손 (이월 불인정)")).toBe("- 256,000,000");
    expect(t).toContain("양도차손 통산 내역 (§102②)");
    // 내역 행은 자산 «라벨»로 — 내부 id(l1·primary)가 아니다
    const row = t.find((x) => x.includes("→") && x.includes("동일그룹")) ?? t.join(" ");
    expect(t.join(" ")).toContain("자산 2");
    expect(t.join(" ")).not.toMatch(/\[l1\]|\[primary\]/);
    expect(row).toBeTruthy();
    expect(t.join(" ")).toContain("44,000,000");
  });

  it("🔑 일부만 통산(고가주택 + 토지 차손 1천만): 양도소득금액 합 = 통산 후 = 34,000,000 · 소멸 없음 · 통산 내역 10,000,000", async () => {
    const { agg, t } = await pdfOf(mk("1500000000", "310000000", "300000000"));
    expect(agg.unusedLoss).toBe(0);
    expect(agg.totalIncomeAfterOffset).toBe(34_000_000);
    expect(after(t, "양도소득금액")).toBe(won(34_000_000));
    expect(after(t, "통산 후 양도소득금액")).toBe(won(34_000_000));
    expect(t.indexOf("소멸 차손 (이월 불인정)")).toBe(-1);
    expect(t).toContain("양도차손 통산 내역 (§102②)");
    expect(t.join(" ")).toContain("10,000,000");
    // 같은 쪽 사슬이 맞는다: 감면후 소득금액 − 기본공제 = 과세표준
    expect(Number((after(t, "감면후 소득금액") ?? "").replace(/,/g, "")) - agg.basicDeduction).toBe(agg.taxBase);
  });

  it("짝 — 차손이 없으면 종전 그대로: 통산 행·내역 표 없음 · 양도소득금액 158,000,000", async () => {
    const { t } = await pdfOf(mk("1500000000", "150000000", "300000000"));
    expect(after(t, "양도소득금액")).toBe(won(158_000_000));
    expect(t.indexOf("통산 후 양도소득금액")).toBe(-1);
    expect(t).not.toContain("양도차손 통산 내역 (§102②)");
  });

  it("짝 — 새 필드가 없는 구 이력은 통산 행 없이 종전 값으로 그린다", () => {
    const t = collect(TransferSection({ r: { transferGain: 100_000_000, taxableGain: 100_000_000, longTermHoldingDeduction: 0, longTermHoldingRate: 0 } }));
    expect(after(t, "양도소득금액")).toBe(won(100_000_000));
    expect(t.indexOf("통산 후 양도소득금액")).toBe(-1);
  });
});
