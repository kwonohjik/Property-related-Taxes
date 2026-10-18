/**
 * anchor — 다건 결과의 재개발·재건축 자산도 장특 보유 기간분·거주 기간분을 엔진 분기 값의 합으로 싣는다(1주택 코드 리뷰 별건 ⑧).
 *
 * 재개발 결과는 「보유 기간분 장특」·「거주 기간분 장특」 sub-step이 없어 `resolveLthdPartsEcho`가 `{}`를 냈고,
 * 합산 신고서·상세명세서가 공제 총액을 거주 개월수 휴리스틱으로 다시 나눴다. 건별 신고서 분기 열(`FilingFormTableRedevRows` —
 * 보유분 = `lthdHoldingPart ?? lthd`, 거주분 = `lthdResidencePart ?? 0`)은 분기 값을 그대로 써서 같은 자산이 표마다 달랐다.
 *
 * | 시료(mock 세율 · 지분 50+50 · 20억 · 1세대1주택) | 엔진 분기 합 (보유 / 거주) | 종전 합산 신고서 |
 * |---|---|---|
 * | 완공 아파트(청산금 납부) | 121,347,367 / 35,873,684 | 104,814,034 / 52,407,017 |
 * | 조합원입주권 | 40,000,000 / 12,000,000 | 34,666,667 / 17,333,333 |
 *
 * 세액은 공제 총액만 쓰므로 바뀌지 않는다(표시 전용).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

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
import { runCalc, redevAptForm } from "./_helpers/redev-one-house-route";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TransferTaxResult } from "@/lib/tax-engine/transfer-tax";
import type { PerPropertyBreakdown } from "@/lib/tax-engine/types/transfer-aggregate.types";
import { resolveLthdPartsEcho } from "@/lib/tax-engine/transfer-tax-aggregate-display-echo";
import { buildAggregateRows } from "@/components/calc/results/transfer/FilingFormTableAggregateHelpers";
import { buildRows, deriveColumns, type AggregateMeta } from "@/components/calc/results/transfer/FilingFormTableHelpers";
import { breakdownToFilingResult } from "@/components/calc/results/MultiTransferPropertyBreakdown";
import { aggregateToFilingResult } from "@/components/calc/results/BundledAllocationCard";
import { buildStatementItems } from "@/components/calc/results/transfer/DetailedStatementHelpers";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

/** 같은 물건 지분 50+50(축 B) — 둘째 카드는 화면처럼 `makeDefaultAsset(2)`의 id에 첫 카드 값을 쓴다. */
function form(kind: "redevelopment_apt" | "right_to_move_in"): TransferFormData {
  const right = kind === "right_to_move_in";
  const f = redevAptForm({
    price: "2000000000",
    share: ["50", "100"],
    count: right ? "0" : "1",
    assetOver: {
      ...(right ? { assetKind: "right_to_move_in", redevSubject: "right", redevApprovalDate: "2022-03-01" } : {}),
      redevExemptionEligibleAtApproval: "yes",
      redevSettlementAmount: "25000000",
      redevPriorHouseHoldingMonths: "60",
      redevPriorHouseResidenceMonths: "36",
    },
    formOver: right ? ({ householdRightCount: "1" } as never) : {},
  });
  const a0 = f.assets[0] as AssetForm;
  a0.ownershipRemainderThirdParty = "";
  const blank = makeDefaultAsset(2);
  const a1 = { ...a0, assetId: blank.assetId, assetLabel: "자산 2", ownershipNumerator: "50", ownershipDenominator: "100" } as AssetForm;
  return { ...f, assets: [a0, a1] };
}

/** 엔진 분기 합 — 건물별 신고서 분기 열과 같은 정의. */
function branchSums(p: PerPropertyBreakdown) {
  const rd = p.redevelopmentDetail!;
  const bs = [rd.preApproval, rd.postApprovalExistingHouse, rd.settlement];
  return {
    holding: bs.reduce((s, b) => s + (b.lthdHoldingPart ?? b.lthd), 0),
    residence: bs.reduce((s, b) => s + (b.lthdResidencePart ?? 0), 0),
  };
}

const CASES = [
  { kind: "redevelopment_apt" as const, holding: 121_347_367, residence: 35_873_684 },
  { kind: "right_to_move_in" as const, holding: 40_000_000, residence: 12_000_000 },
];

describe("별건 ⑧ — 다건 재개발 자산 장특 보유·거주 기간분 = 엔진 분기 합", () => {
  for (const c of CASES) {
    it(`${c.kind} — echo·합산 신고서·건별 신고서·상세명세서가 같은 값`, async () => {
      const f = form(c.kind);
      const r = await runCalc(f);
      expect(r.issues).toEqual([]);
      expect(r.status).toBe(200);
      const agg = r.json.data.aggregated;
      const props = agg.properties as PerPropertyBreakdown[];
      expect(props).toHaveLength(2);

      for (const p of props) {
        expect(branchSums(p)).toEqual({ holding: c.holding, residence: c.residence });
        expect(c.holding + c.residence).toBe(p.longTermHoldingDeduction);
        // ① 집계 echo
        expect(p.filingDisplay?.lthdHoldingPart).toBe(c.holding);
        expect(p.filingDisplay?.lthdResidencePart).toBe(c.residence);
        // ② 건별 신고서 합계 열(분기 열 합)
        const fr = breakdownToFilingResult(p);
        const { mode } = deriveColumns(fr, undefined, undefined, undefined);
        const rows = buildRows(fr, mode, f);
        const cell = (label: string) => rows.find((x) => x.label.trim() === label)?.values.total;
        expect(cell("보유 기간분 장특")).toBe(c.holding);
        expect(cell("거주 기간분 장특")).toBe(c.residence);
      }

      // ③ 합산 신고서 자산 열·합계 열
      const meta = { properties: props, aggregated: agg } as unknown as AggregateMeta;
      const aggRows = buildAggregateRows({} as unknown as TransferTaxResult, meta, f);
      const row = (label: string) => aggRows.find((x) => x.label.trim() === label)!.values;
      for (const p of props) {
        expect(row("보유 기간분 장특")[p.propertyId]).toBe(c.holding);
        expect(row("거주 기간분 장특")[p.propertyId]).toBe(c.residence);
      }
      expect(row("보유 기간분 장특").total).toBe(c.holding * 2);
      expect(row("거주 기간분 장특").total).toBe(c.residence * 2);

      // ④ 같은 화면 상세명세서(다건) — 자산별·합계
      const items = buildStatementItems(aggregateToFilingResult(agg), f, undefined, meta, undefined);
      expect(items.get("ltHoldingPart")?.perAsset?.map((x) => x.value)).toEqual([c.holding, c.holding]);
      expect(items.get("ltResidencePart")?.perAsset?.map((x) => x.value)).toEqual([c.residence, c.residence]);
      expect(items.get("ltHoldingPart")?.value).toBe(c.holding * 2);
      expect(items.get("ltResidencePart")?.value).toBe(c.residence * 2);
    });
  }

  it("가드 — 분기 합이 자산 공제액과 다르면(분기 밖에서 공제액을 고친 경로) 나누지 않는다: {}", () => {
    const branch = (lthd: number, h?: number, r?: number) => ({ lthd, lthdHoldingPart: h, lthdResidencePart: r });
    const result = (total: number) =>
      ({
        steps: [],
        longTermHoldingDeduction: total,
        redevelopmentDetail: { preApproval: branch(52, 40, 12), postApprovalExistingHouse: branch(10), settlement: branch(0) },
      }) as unknown as TransferTaxResult;
    // 분해 없는 분기(10)는 전액 보유분 — 건별 신고서 분기 열과 같은 규약
    expect(resolveLthdPartsEcho(result(62))).toEqual({ holding: 50, residence: 12 });
    expect(resolveLthdPartsEcho(result(61))).toEqual({});
  });
});
