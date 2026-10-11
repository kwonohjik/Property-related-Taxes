/**
 * G3-1 anchor — 재개발 완공APT × **지분 모드** × 1세대1주택 × 고가주택(12억 초과).
 *
 * ## 결함 (수정 전 실측)
 * 완공APT 분기의 12억 비교·안분 분모(`highValueBase`)가 `input.transferPrice`(= 지분 양도가액)였다.
 * 고가 **판정**(`checkExemption`)은 `burdenedGiftDenominator ?? totalPropertyTransferPrice ?? transferPrice`
 * (= 물건 전체)로 내리는데, **안분**은 지분가로 해서 한 계산 안에서 분모가 둘이었다.
 *
 *   | 시료 | 안분 비율(수정 전) | 옳은 값 |
 *   |---|---|---|
 *   | 지분 50% · 계약 20억 | (10억 − 12억) / 10억 = **−0.2** → 세액 0 | (20억 − 12억) / 20억 = 0.4 |
 *   | 지분 50% · 계약 30억 | (15억 − 12억) / 15억 = 0.2 (과소) | (30억 − 12억) / 30억 = 0.6 |
 *
 * ## 법령 근거 (KoreanLaw MCP — 현행 「소득세법 시행령」 MST 290841 원문 확인)
 * - 「소득세법 시행령」 제156조제1항: 「…일부가 타인 소유인 경우로서 실지거래가액 합계액에 양도하는
 *   부분(타인 소유부분을 포함한다)의 면적이 전체 주택면적에서 차지하는 비율을 나누어 계산한 금액이
 *   12억원을 초과하는 경우에는 고가주택으로 본다」 — 고가 판정은 **물건 전체** 가액이다.
 * - 같은 영 제160조제1항 후단: 「…12억원에 해당 주택 … 양도가액이 그 주택과 … 양도가액의 합계액에서
 *   차지하는 비율을 곱하여 안분계산한다」 — 20억 물건의 50%이면 (10억 − 6억) ÷ 10억 = 0.4 =
 *   (20억 − 12억) ÷ 20억.
 *
 * ## 범위 밖 (사용자 결정 대기 — 이 anchor가 고정하지 않는다)
 * 청산금 **수령분**·**입주권(§89①4호 단서)**의 지분 모드 12억 기준은 정면 해석례가 없어 결정 대기.
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

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const HALF: [string, string] = ["50", "100"];

describe("G3-1 — 재개발 완공APT 지분 모드: 고가 판정과 안분이 같은 분모(물건 전체)를 본다", () => {
  it("지분 50% · 계약 20억 — 과세비율 0.4 · 음수 없음 (수정 전 −0.2 · 세액 0)", async () => {
    const r = await runCalc(redevAptForm({ price: "2000000000", share: HALF }));
    expect(r.issues).toEqual([]);
    expect(r.status).toBe(200);
    expect(r.body.totalPropertyTransferPrice).toBe(2_000_000_000);
    expect(r.body.transferPrice).toBe(1_000_000_000);
    expect(r.result.exemptReason).toBe("1세대1주택 고가주택");
    const hva = r.result.redevelopmentDetail.highValueAllocation;
    expect(hva.taxableRatio).toBeCloseTo(0.4, 10);
    expect(hva.taxableGain).toBeGreaterThan(0);
    expect(r.result.transferGain).toBeGreaterThan(0);
    expect(r.result.totalTax).toBeGreaterThan(0);
  });

  it("지분 50% · 계약 30억 — 과세비율 0.6 (수정 전 0.2 과소)", async () => {
    const r = await runCalc(redevAptForm({ price: "3000000000", share: HALF }));
    expect(r.issues).toEqual([]);
    expect(r.result.redevelopmentDetail.highValueAllocation.taxableRatio).toBeCloseTo(0.6, 10);
  });

  it("대조 — 단독 100% · 계약 20억은 0.4 (같은 물건 전체 분모)", async () => {
    const r = await runCalc(redevAptForm({ price: "2000000000" }));
    expect(r.result.redevelopmentDetail.highValueAllocation.taxableRatio).toBeCloseTo(0.4, 10);
  });

  it("긍정 짝 — 지분 50%의 과세 양도차익은 단독의 절반(±2원 — 성분별 floor)", async () => {
    // 청산금은 지분으로 쪼개지 않는다(§166①1호 「납부한」 청산금은 사실 — redev-fractional-ownership anchor) —
    // 지분 해당분(5천만)을 직접 입력한다.
    const half = await runCalc(
      redevAptForm({ price: "2000000000", share: HALF, assetOver: { redevSettlementAmount: "50000000" } }),
    );
    const sole = await runCalc(redevAptForm({ price: "2000000000" }));
    const h = half.result.redevelopmentDetail.highValueAllocation;
    const s = sole.result.redevelopmentDetail.highValueAllocation;
    expect(Math.abs(h.taxableGain * 2 - s.taxableGain)).toBeLessThanOrEqual(4);
    expect(h.taxableRatio).toBeCloseTo(s.taxableRatio, 10);
  });

  it("대조군 — 일반 주택(housing) 지분 50% · 계약 20억도 0.4 (일반 경로와 같은 답)", async () => {
    const r = await runCalc(redevAptForm({ kind: "housing", price: "2000000000", share: HALF }));
    expect(r.status).toBe(200);
    const steps = (r.result.steps ?? []) as { label: string; formula: string }[];
    const prorate = steps.find((s) => s.label.includes("초과분") && s.label.includes("과세 양도차익"));
    expect(prorate?.formula).toContain("2,000,000,000");
    expect(r.result.exemptReason).toBe("1세대1주택 고가주택");
  });

  it("경계 — 지분 50% · 계약 24억(지분가 12억 정확히)도 물건 전체 기준 고가(0.5)", async () => {
    const r = await runCalc(redevAptForm({ price: "2400000000", share: HALF }));
    expect(r.result.exemptReason).toBe("1세대1주택 고가주택");
    expect(r.result.redevelopmentDetail.highValueAllocation.taxableRatio).toBeCloseTo(0.5, 10);
  });

  it("경계 — 지분 50% · 계약 12억(전체 12억 정확히)은 전액 비과세", async () => {
    const r = await runCalc(redevAptForm({ price: "1200000000", share: HALF }));
    expect(r.result.isExempt).toBe(true);
    expect(r.result.totalTax).toBe(0);
  });
});
