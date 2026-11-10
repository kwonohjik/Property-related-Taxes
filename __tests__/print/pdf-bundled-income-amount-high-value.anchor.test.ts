/**
 * 일괄 양도 PDF 「신고서 양식」 — 양도소득금액이 과세표준과 맞는다.
 *
 * 종전: 어댑터(`aggregateToFilingResult`)가 `taxableGain`에 합산 엔진 `totalTransferGain`을 그대로 넣었다. 그 합은 자산별 단건
 * `transferGain`을 더한 것인데 뜻이 경로마다 다르다 — 12억 초과 고가주택은 **전체 차익**(1,100,000,000), 비과세는 0, 입주권 4호 안분은 **과세분**.
 * PDF는 `양도소득금액 = 과세대상 양도차익 − 장특`으로 다시 계산해, 고가주택이 섞이면 1,038,000,000(= 1,250,000,000 − 212,000,000)이 찍혀
 * 같은 쪽의 과세표준 155,500,000(양도소득금액 158,000,000 − 기본공제 2,500,000)과 어긋났다. 화면 신고서 표·상세명세서는 자산별 `income` 합(158,000,000)이라 맞았다.
 *
 * 시료: 실제 route 응답(mock 세율) — 주택(취득 4억 · 2014 · 거주 120개월) + 독립 나대지(3억/취득 1.5억), 양도 2026-02-16.
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

vi.mock("@/lib/db/tax-rates", async (io) => {
  const actual = await io<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));
import { preloadTaxRates } from "@/lib/db/tax-rates";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

function collect(node: unknown, out: string[] = []): string[] {
  if (node === null || node === undefined || typeof node === "boolean") return out;
  if (typeof node === "string" || typeof node === "number") { out.push(String(node)); return out; }
  if (Array.isArray(node)) { for (const c of node) collect(c, out); return out; }
  const el = node as ReactElement<{ children?: unknown }> & { type?: unknown };
  if (typeof el.type === "function") {
    try { collect((el.type as (p: unknown) => unknown)(el.props), out); } catch { /* 렌더 불가 노드 */ }
    return out;
  }
  collect((el.props ?? {}).children, out);
  return out;
}
const after = (t: string[], label: string) => { const i = t.indexOf(label); return i >= 0 ? t[i + 1] : undefined; };
const won = (n: number) => n.toLocaleString();

/** 주택 + 독립 나대지 일괄 → route 응답의 합산 결과를 PDF 신고서 섹션 텍스트로. */
async function pdfOf(housePrice: string) {
  const f = withTestAddress(
    g1Form({ ...HOUSE(0), actualSalePrice: housePrice, standardPriceAtTransfer: "600000000" }, { ...LAND("l1", 300), landNature: "standalone" }) as TransferFormData,
  );
  f.bundledSaleMode = "actual";
  f.contractTotalPrice = String(Number(housePrice) + 300_000_000);
  const r = await runCalc(f);
  expect(r.status).toBe(200);
  const agg = r.json.data.aggregated;
  return { agg, t: collect(TransferSection({ r: aggregateToFilingResult(agg) as unknown as Record<string, unknown> })) };
}

describe("일괄 PDF — 양도소득금액", () => {
  it("🔑 12억 초과 고가주택 + 토지 → 양도소득금액이 자산별 소득금액 합(158,000,000)이고 과세표준 + 기본공제와 맞는다 (종전: 1,038,000,000)", async () => {
    const { agg, t } = await pdfOf("1500000000");
    expect(agg.totalIncomeBeforeOffset).toBe(158_000_000); // 시료 확인: 44,000,000 + 114,000,000
    expect(after(t, "양도소득금액")).toBe(won(158_000_000));
    expect(after(t, "과세대상 양도차익")).toBe(won(370_000_000)); // 220,000,000 + 150,000,000 — 화면 신고서 표 합계 열과 같다
    expect(after(t, "전체 양도차익")).toBe(won(1_250_000_000));
    // 같은 쪽 산식이 서로 맞는다: 양도소득금액 − 기본공제 = 과세표준
    expect(Number((after(t, "양도소득금액") ?? "").replace(/,/g, "")) - agg.basicDeduction).toBe(agg.taxBase);
  });

  it("짝 — 비과세 주택 + 토지(고가 아님)는 양도소득금액 114,000,000 불변 (전체·과세대상 양도차익 줄은 pdf-bundled-gross-gain-mixed가 고정: 250,000,000 / 150,000,000)", async () => {
    const { agg, t } = await pdfOf("500000000");
    expect(after(t, "양도소득금액")).toBe(won(114_000_000));
    expect(after(t, "과세대상 양도차익")).toBe(won(150_000_000)); // 종전 줄 없음 — 비과세 주택 차익이 «전체 양도차익»에서 빠져 전체 = 과세대상으로 보였다
    expect(Number((after(t, "양도소득금액") ?? "").replace(/,/g, "")) - agg.basicDeduction).toBe(agg.taxBase);
  });
});
