/**
 * Pre-Do anchor — **부동산 ↔ 기타자산 §102② 크로스 차손 통산** (PR-3)
 *
 * 법 §102①**1호** = §94①**1호·2호 및 4호** — 부동산과 기타자산은 **한 그룹**이고,
 * §102②이 「각 호별로 **해당 자산 외의 다른 자산**에서 발생한 양도소득금액에서 공제」를 명한다.
 * 두 마법사가 분리돼 그 「다른 자산」에 닿지 못했다(실측 86,845,000원 과대).
 *
 * ⛔ **주식 그룹(§102①2호)은 섞이면 안 된다** — 법 §102① 본문 후단
 *   「결손금은 **다른 호의 소득금액과 합산하지 아니한다**」.
 *
 * 계획서: `docs/00-pm/cross-engine-102-2-loss-offset.plan.md` §7 C-3~C-9
 */
import { describe, it, expect } from "vitest";
import {
  buildCrossLossRows,
  computeCrossLossOffset,
  type CrossLossAsset,
} from "@/lib/calc/cross-102-2-loss-offset";
import { resolveStockRateKey } from "@/lib/tax-engine/stock-transfer/stock-transfer-rate-calc";
import {
  CROSS_PROG_BASIC,
  CROSS_PROG_NBL,
} from "@/lib/tax-engine/cross-loss-offset-rate-key";

/** 부동산 자산 1건 (엔진 결과의 최소 형태) */
const re = (id: string, income: number, key = "prog:104-1-1", exempt = false) => ({
  propertyId: id,
  propertyLabel: id,
  income,
  lossOffsetRateKey: key,
  isExempt: exempt,
});
const reResult = (...ps: ReturnType<typeof re>[]) =>
  ({ properties: ps }) as unknown as Parameters<typeof buildCrossLossRows>[0];

/** 기타자산 단건 결과의 최소 형태 */
const oa = (income: number, o: Record<string, unknown> = {}) =>
  ({
    basicDeductionGroup: "real_estate_and_other_asset",
    taxCategory: "other_asset_block_shareholder",
    isShortTermHolding: false,
    transferIncome: income,
    isExempt: false,
    ...o,
  }) as unknown as Parameters<typeof buildCrossLossRows>[1];

const rowsOf = (r: ReturnType<typeof buildCrossLossRows>): CrossLossAsset[] => {
  if (!r.ok) throw new Error(`행 생성 실패: ${r.reason}`);
  return r.rows;
};

describe("§102② 크로스 통산", () => {
  // ── 🔴 C-3 ──────────────────────────────────────────────────────────
  it("C-3 🔴: 기타자산 차손이 부동산 소득을 **같은 세율군 1호로** 깎는다 (영 §167의2①1호)", () => {
    const rows = rowsOf(buildCrossLossRows(reResult(re("A", 500_000_000)), oa(-200_000_000)));
    const out = computeCrossLossOffset(rows);

    expect(out.appliedAcrossEngines, "엔진을 가로지른 흡수가 있어야 한다").toBe(true);
    const A = out.assets.find((x) => x.id === "A")!;
    expect(A.absorbed).toBe(200_000_000);
    expect(A.incomeAfterOffset).toBe(300_000_000);
    expect(out.unusedLoss).toBe(0);
  });

  it("C-3b 🔴: 방향이 반대여도 성립한다 — 부동산 차손이 기타자산 소득을 깎는다", () => {
    const rows = rowsOf(buildCrossLossRows(reResult(re("A", -100_000_000)), oa(300_000_000)));
    const out = computeCrossLossOffset(rows);
    const OA = out.assets.find((x) => x.id === "other-asset")!;
    expect(out.appliedAcrossEngines).toBe(true);
    expect(OA.absorbed).toBe(100_000_000);
    expect(OA.incomeAfterOffset).toBe(200_000_000);
  });

  // ── 🔴 C-4 ──────────────────────────────────────────────────────────
  it("C-4 🔴: 세율이 다르면 **2호 안분**이다 (영 §167의2①2호)", () => {
    // 부동산 8호(+10%p) 차손 → 기본누진 두 자산에 소득 비율로 안분
    const rows = rowsOf(
      buildCrossLossRows(
        reResult(
          re("A", 300_000_000),
          re("B", 100_000_000),
          re("L", -100_000_000, "prog:104-1-8"),
        ),
        oa(0, { transferIncome: 0 }),
      ),
    );
    const out = computeCrossLossOffset(rows);
    const A = out.assets.find((x) => x.id === "A")!;
    const B = out.assets.find((x) => x.id === "B")!;
    // 300 : 100 = 3 : 1 → 75,000,000 / 25,000,000
    expect(A.absorbed).toBe(75_000_000);
    expect(B.absorbed).toBe(25_000_000);
  });

  // ── 🔴 C-5 ──────────────────────────────────────────────────────────
  it("C-5 🔴: 주식(§94①3호)은 **행 자체가 만들어지지 않는다** (§102① 본문 후단)", () => {
    const r = buildCrossLossRows(
      reResult(re("A", 500_000_000)),
      oa(-200_000_000, { basicDeductionGroup: "stock", taxCategory: "listed_major" }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("§102①2호");
  });

  it("C-5b 🟢: 기타자산 세율축은 중소기업·단기보유 인자에 **의존하지 않는다**", () => {
    // `buildCrossLossRows`가 SME 를 `false`로 고정해 넘기는 근거를 실측으로 고정한다.
    for (const cat of [
      "other_asset_block_shareholder",
      "other_asset_heavy_re",
      "other_asset_block_shareholder_nbl",
      "other_asset_heavy_re_nbl",
    ] as const) {
      const a = resolveStockRateKey(cat, true, true);
      const b = resolveStockRateKey(cat, false, false);
      expect(a, `${cat}`).toBe(b);
    }
  });

  it("C-5c 🔴: 기타자산 §104①9호는 부동산 8호와 **같은 키**로 묶인다", () => {
    const rows = rowsOf(
      buildCrossLossRows(
        reResult(re("A", 500_000_000, "prog:104-1-8")),
        oa(-200_000_000, { taxCategory: "other_asset_heavy_re_nbl" }),
      ),
    );
    expect(rows[0].rateKey).toBe(CROSS_PROG_NBL);
    expect(rows[1].rateKey).toBe(CROSS_PROG_NBL);
    expect(computeCrossLossOffset(rows).appliedAcrossEngines).toBe(true);
  });

  // ── 🟢 C-6 ──────────────────────────────────────────────────────────
  it("C-6 🟢: 비과세 자산은 통산에 참여하지 않는다 (코어 계약 승계)", () => {
    const rows = rowsOf(
      buildCrossLossRows(
        reResult(re("A", 500_000_000, "prog:104-1-1", true)),
        oa(-200_000_000),
      ),
    );
    const out = computeCrossLossOffset(rows);
    const A = out.assets.find((x) => x.id === "A")!;
    expect(A.absorbed).toBe(0);
    expect(out.appliedAcrossEngines).toBe(false);
    expect(out.unusedLoss).toBe(200_000_000);
  });

  // ── 🟢 C-7 ──────────────────────────────────────────────────────────
  it("C-7 🟢: 차손이 없으면 한 원도 움직이지 않는다 (무영향 회귀)", () => {
    const rows = rowsOf(buildCrossLossRows(reResult(re("A", 500_000_000)), oa(200_000_000)));
    const out = computeCrossLossOffset(rows);
    expect(out.appliedAcrossEngines).toBe(false);
    for (const a of out.assets) {
      expect(a.absorbed, a.id).toBe(0);
      expect(a.incomeAfterOffset, a.id).toBe(a.income);
    }
  });

  it("C-7b 🟢: 부동산끼리만 통산되면 **크로스로 보지 않는다**", () => {
    const rows = rowsOf(
      buildCrossLossRows(
        reResult(re("A", 500_000_000), re("B", -200_000_000)),
        oa(0, { transferIncome: 0 }),
      ),
    );
    const out = computeCrossLossOffset(rows);
    expect(out.assets.find((x) => x.id === "A")!.absorbed).toBe(200_000_000);
    expect(out.appliedAcrossEngines, "같은 엔진 안의 통산은 크로스가 아니다").toBe(false);
  });

  // ── 🔴 C-9 ──────────────────────────────────────────────────────────
  it("C-9 🔴: 자산별 내역이 없으면 **건너뛴다** — throw 하지 않는다", () => {
    // V-2 (b) — 기존 allocation anchor의 목 픽스처에는 `properties[]`가 없다.
    for (const bad of [undefined, null, {} as never, { properties: [] } as never]) {
      const r = buildCrossLossRows(bad, oa(-100_000_000));
      expect(r.ok, String(JSON.stringify(bad))).toBe(false);
    }
    expect(buildCrossLossRows(reResult(re("A", 1)), null).ok).toBe(false);
  });

  it("C-9b 🟢: 번역 불가한 부동산 키도 **버리지 않는다** (자기 키로 살아남는다)", () => {
    const rows = rowsOf(
      buildCrossLossRows(reResult(re("A", 100_000_000, "rate:0.7")), oa(0, { transferIncome: 0 })),
    );
    expect(rows[0].rateKey).not.toBe(CROSS_PROG_BASIC);
    expect(rows).toHaveLength(2);
  });
});
