/**
 * P3 A 결과 4뷰 — 토지만 이월과세(§97의2①) + 건물 매매·신축: 토지 파트 판정·분해·안분, 건물은 이월과세 표시 없음 (2026-10-20, 표시 전용 · 세액 불변)
 *
 * 설계: docs/02-design/features/transfer-split-part-carryover.ui.design.md §6
 * 4뷰(카드·상세명세서·신고서·PDF)가 같은 view(`splitCarryoverView`)를 읽는지 A 결과(실제 폼 → ④ → route)로 잠근다. C 4뷰 anchor(`split-carryover-p2c.views.ui.anchor.test.tsx`)의 A판.
 * 시드: 엔진 anchor SPCO-T1 — 결정세액 172,260,000 · 토지 적용(증여자 2000-01-01 1억) · 증여세 상당액 2천만(= 2천만 × 3억 ÷ 3억).
 */
import { describe, it, expect, afterEach, vi, beforeAll } from "vitest";
import type { ReactElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/lib/db/tax-rates")>()), preloadTaxRates: vi.fn() }));
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { SplitGainDetailSection } from "@/components/calc/results/transfer/SplitGainDetailSection";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { buildRows, deriveColumns } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { TransferSplitSection } from "@/lib/pdf/ResultPdfTransferSections";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TransferTaxResult } from "@/lib/tax-engine/types/transfer.types";
import { bodyOf, routeOf } from "../calc/_helpers/split-carryover-c-form";
import { aForm } from "../calc/_helpers/split-carryover-a-form";

afterEach(cleanup);

let A: TransferTaxResult;
beforeAll(async () => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
  const r = await routeOf(POST, await bodyOf(aForm("purchase")));
  A = r.json.data.result as TransferTaxResult;
});

const FORM = { transferDate: "2025-06-30", contractTotalPrice: "1200000000", assets: [{ acquisitionDate: "2021-03-01", residencePeriodMonthsAsset: "0" }] } as unknown as TransferFormData;
const text = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));

describe("엔진 echo 전제", () => {
  it("결정세액 172,260,000 · 토지만 이월과세 echo · 사건 echo", () => {
    expect(A.determinedTax).toBe(172_260_000);
    expect(A.splitDetail!.land.carryover).toMatchObject({ judgment: "applied", giftTaxApportioned: 20_000_000, donorAcquisitionDate: "2000-01-01" });
    expect(A.splitDetail!.building.carryover).toBeUndefined();
    expect(A.splitDetail!.carryoverEvent).toMatchObject({ giftRegistryDate: "2023-03-01", giftTaxCalculated: 20_000_000, giftTaxBase: 300_000_000 });
  });
});

describe("① 카드", () => {
  it("토지 파트 판정·장특 기산일(증여자 취득일)·안분 산식 · 건물 이월과세 카드 없음", () => {
    render(<SplitGainDetailSection splitDetail={A.splitDetail!} assetKind="housing" />);
    expect(screen.getByTestId("split-carryover-land").getAttribute("data-judgment")).toBe("applied");
    expect(screen.queryByTestId("split-carryover-building")).toBeNull();
    expect(screen.getByTestId("split-card-lthd-start-land").textContent).toContain("2000-01-01");
    const ap = screen.getByTestId("split-carryover-land-apportion").textContent!;
    expect(ap).toContain("증여세 산출세액 20,000,000");
    expect(ap).toContain("토지 증여 신고가액 300,000,000");
    expect(ap).toContain("증여세 과세가액 300,000,000");
    expect(screen.getByTestId("split-carryover-land-apportioned").textContent).toBe("20,000,000");
  });
});

describe("② 상세명세서", () => {
  const items = () => buildStatementItems(A, FORM, undefined, undefined, 1_200_000_000);
  it("취득가액: 토지는 이월과세 태그 · 건물은 이월과세 문구 없음", () => {
    const f = text(items().get("acquisitionPrice")!.formula);
    expect(f).toContain("토지(이월과세 — 증여자 취득가액)");
    expect(f).toContain("토지 이월과세 적용 (증여자 기준)");
    expect(f).not.toContain("건물(이월과세");
    expect(f).not.toContain("건물 이월과세");
  });
  it("필요경비: 토지 증여세 상당액 안분 산식", () => {
    const f = text(items().get("necessaryExpense")?.formula ?? items().get("expenses")?.formula);
    expect(f).toContain("증여세 산출세액 20,000,000 × (토지 증여 신고가액 300,000,000) ÷ (증여세 과세가액 300,000,000) = 20,000,000");
  });
  it("취득일자: 값은 건물 매수일(증여 등기접수일 아님) · 토지 증여자 취득일 · 건물 증여자 문구 없음", () => {
    const acq = items().get("acquisitionDate")!;
    expect(acq.value).toContain("2021");
    expect(acq.value).not.toContain("2023");
    const f = text(acq.formula);
    expect(f).toContain("건물 취득일 — 토지는 이월과세(증여)");
    expect(f).not.toContain("수증자 취득일 = 증여 등기접수일");
    expect(f).toContain("토지 증여자 취득일 2000-01-01");
    expect(f).not.toContain("건물 증여자 취득일");
  });
});

describe("③ 신고서 split-2col", () => {
  it("취득일자 토지 = 증여자 취득일 · 건물 = 매수일 · 취득가액·필요경비 토지 각주", () => {
    expect(deriveColumns(A).mode).toBe("split-2col");
    const r = buildRows(A, "split-2col", FORM, undefined, 1_200_000_000);
    const acq = r.find((x) => x.label === "취득일자" || x.label.startsWith("취득일"))!;
    expect(acq.values.total).toBe("2021-03-01");
    expect(acq.values.land).toBe("2000-01-01");
    expect(acq.values.building).toBe("2021-03-01");
    const acqPrice = r.find((x) => x.label === "취득가액")!;
    expect(acqPrice.roseNotes!.land).toContain("토지 증여자 취득가액 100,000,000");
    expect(acqPrice.roseNotes?.building).toBeUndefined();
    const exp = r.find((x) => x.label === "필요경비")!;
    expect(exp.roseNotes!.land).toContain("= 20,000,000");
  });
});

describe("④ PDF", () => {
  function collect(node: unknown, out: string[] = []): string[] {
    if (node === null || node === undefined || typeof node === "boolean") return out;
    if (typeof node === "string" || typeof node === "number") { out.push(String(node)); return out; }
    if (Array.isArray(node)) { for (const c of node) collect(c, out); return out; }
    const el = node as ReactElement<{ children?: unknown }> & { type?: unknown };
    if (typeof el.type === "function") { collect((el.type as (p: unknown) => unknown)(el.props), out); return out; }
    collect((el.props as { children?: unknown } | undefined)?.children, out);
    return out;
  }
  it("토지 판정·안분 산식 · 건물 이월과세 문구 없음", () => {
    const t = collect(TransferSplitSection({ r: A as unknown as Record<string, unknown> })).join("\n");
    expect(t).toContain("토지 이월과세 적용 (증여자 기준)");
    expect(t).toContain("증여세 산출세액 20,000,000 × (토지 증여 신고가액 300,000,000) ÷ (증여세 과세가액 300,000,000) = 20,000,000");
    expect(t).not.toMatch(/건물 이월과세 (적용|미적용)/);
  });
});
