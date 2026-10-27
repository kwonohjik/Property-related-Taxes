/**
 * 이월과세 A 채택 × 소유자 분리 — 상세 계산 명세서가 본인 파트 값을 적는다. 계획서 `docs/02-design/features/carryover-owner-split-display-gift-tax.plan.md` V-4 · Q-1 (a).
 *
 * 수정 전: 「이월과세 A면 분리 합을 쓰지 않는다」(자산 전체 전제)라 양도가액 1,200,000,000 · 취득가액 역산 660,000,000(실가) / 257,142,856(환산)이 나왔다 —
 * 신고서 분리 2열(본인 파트)과 어긋나고, 증여세 상당액이 있으면 필요경비가 402,542,857(자산 전체)로 그려졌다(V-5a).
 * 기대값은 실제 route 응답의 엔진 leaf(`summarizeSplitGain`)에서 읽는다 — 신고서 분리 2열 합계 열과 같은 정의다.
 */
import { describe, it, expect, vi } from "vitest";
import { makeMockRates } from "@/__tests__/tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { ESTIMATED, KNOWN, withGift, runOwnerSplit } from "@/__tests__/calc/_helpers/carryover-owner-split-form";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";
import { summarizeSplitGain } from "@/lib/tax-engine/transfer-tax-split-display";
import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function statement(a: Loose) {
  const { form, status, result } = await runOwnerSplit(a);
  expect(status).toBe(200);
  const r = result as unknown as TransferTaxResult;
  const items = buildStatementItems(r, form, form.assets[0], undefined, undefined);
  const v = (k: string) => items.get(k)?.value as number;
  const f = (k: string) => String(items.get(k)?.formula ?? "");
  return { r, s: r.splitDetail ? summarizeSplitGain(r.splitDetail) : undefined, tp: v("transferPrice"), acq: v("acquisitionPrice"), exp: v("expenses"), acqFormula: f("acquisitionPrice"), expFormula: f("expenses") };
}

describe("상세 계산 명세서 — 이월과세 A × 건물만 본인: 분리 합 = 신고서 분리 2열 합계 열", () => {
  it.each([
    ["실가 · 증여세 0", KNOWN, [720_000_000, 180_000_000, 0, 540_000_000]],
    ["실가 · 증여세 2천만", withGift(KNOWN, "20,000,000"), [720_000_000, 180_000_000, 20_000_000, 520_000_000]],
    ["환산 · 증여세 0", ESTIMATED, [720_000_000, 154_285_714, 5_400_000, 560_314_286]],
    ["환산 · 증여세 2천만", withGift(ESTIMATED, "20,000,000"), [720_000_000, 154_285_714, 25_400_000, 540_314_286]],
  ] as const)("%s", async (_n, a, [tp, acq, exp, gain]) => {
    const x = await statement({ ...a, selfOwns: "building_only" });
    expect(x.r.carryoverTaxationDetail?.adoptedScenario).toBe("A");
    expect([x.tp, x.acq, x.exp, x.r.transferGain]).toEqual([tp, acq, exp, gain]);
    expect([x.s?.transferPrice, x.s?.acquisitionDeducted, x.s?.necessaryExpense]).toEqual([tp, acq, exp]);
    expect(x.tp - x.acq - x.exp).toBe(x.r.transferGain);
    // 분리 산식 + 승계 근거 — 종전 이월과세 A 산식(「증여자 취득 당시 … — 이월과세 §97의2① (…)」)이 아니다
    expect(x.acqFormula).toContain("토지·건물 파트별 산정");
    expect(x.acqFormula).toContain("※ 이월과세 §97의2① — ");
  });

  it("필요경비 산식 — 증여세 상당액을 자본적지출·양도비와 나눠 적는다 · 환산이면 개산공제 base가 「증여자 취득 당시」", async () => {
    const est = await statement({ ...withGift(ESTIMATED, "20,000,000"), selfOwns: "building_only" });
    expect(est.expFormula).toContain("건물 증여세 상당액 20,000,000");
    expect(est.expFormula).toContain("건물 개산공제 5,400,000 (증여자 취득 당시 기준시가");
    expect(est.expFormula).not.toContain("자본적지출·양도비 20,000,000");
    const known = await statement({ ...withGift(KNOWN, "20,000,000"), selfOwns: "building_only" });
    expect(known.expFormula).toContain("건물 증여세 상당액 20,000,000");
  });

  it("토지만 본인(실가 · 증여세 2천만) — 4.8억 · 1.2억 · 2천만 = 3.4억", async () => {
    const x = await statement({ ...withGift(KNOWN, "20,000,000"), selfOwns: "land_only" });
    expect([x.tp, x.acq, x.exp, x.r.transferGain]).toEqual([480_000_000, 120_000_000, 20_000_000, 340_000_000]);
  });

  it("소유자 같음(대조) — 종전 이월과세 A 분기(양도가액 12억 · 증여자 취득가액 승계 산식)", async () => {
    const x = await statement({ ...KNOWN, selfOwns: "both" });
    expect([x.tp, x.acq]).toEqual([1_200_000_000, 300_000_000]);
    expect(x.acqFormula).toContain("증여자 취득 당시 취득가액 300,000,000");
  });
});
