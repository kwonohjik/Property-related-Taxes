/**
 * anchor — 연간 합산 상세 명세서의 취득가액·필요경비 머리(소제목)가 부담부증여 자산의 실제 취득가액 산정방식을 말한다.
 *
 * 부담부증여 기준시가 평가의 취득가액은 「취득시 기준시가 × 채무비율」(「소득세법 시행령」 제159조 제1항 제1호 괄호)이다 — 환산도 실거래가도 아니다.
 * 수정 前(실측 2026-11-13): 토지·건물 분리(소유자 분리·취득일 분리) 자산은 파트 `acqMode`가 "estimated"라 「자산별 환산취득가 합계 — 시행령 §163·§176의2②」,
 * 분리 없는 자산은 「자산별 실제 거래가액 합계」, 시가 + 환산취득가액도 「실제 거래가액 합계」였다. 머리는 §159 명세의 `acquisitionMethodUsed`로 정한다.
 * 함께: §159 단계 산식의 평가 모드 이름이 영문 키(「supplementary 평가」) 대신 한국어다.
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
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { runSingle, buildMultiBody, postMulti } from "./_helpers/single-multi-route-parity";
import { asset, bldg, formOf } from "../api/_bg-owner-split-fixtures";
import { aggregateAcqHeading, aggregateExpenseHeading, aggregateHeadingModes } from "@/components/calc/results/transfer/split-acq-text";
import type { PerPropertyBreakdown } from "@/lib/tax-engine/types/transfer-aggregate.types";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const BG_STD_HEAD = "자산별 취득가액 합계 — 취득시 기준시가 × 채무비율 (시행령 §159①1호)";
const LUMP_HEAD = "자산별 개산공제·양도비 합계 — §97① 나목·시행령 §163⑥";
const MKT = { bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "200,000,000", standardPriceAtTransfer: "200,000,000", standardPriceAtAcq: "80,000,000" };

async function headings(o: Record<string, unknown>) {
  const f = formOf([asset(1, o)]);
  const m = await postMulti(await buildMultiBody([f]));
  expect(m.status, JSON.stringify(m.json).slice(0, 300)).toBe(200);
  const modes = aggregateHeadingModes(m.props as unknown as PerPropertyBreakdown[], undefined);
  return { acq: aggregateAcqHeading(modes), exp: aggregateExpenseHeading(modes) };
}

describe("다건 상세 명세서 머리 — 부담부증여 취득가액 산정방식", () => {
  it.each([
    ["소유자 분리(건물만) · 기준시가", bldg("200,000,000", "80,000,000"), BG_STD_HEAD, LUMP_HEAD],
    [
      "토지·건물 취득일 분리 · 기준시가",
      {
        hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2010-01-01", standardPricePerSqmAtTransfer: "1,000,000", transferArea: "100",
        buildingStandardPriceAtTransfer: "100,000,000", standardPricePerSqmAtAcq: "300,000", acquisitionArea: "100", buildingStandardPriceAtAcq: "50,000,000", standardPriceAtTransfer: "200,000,000",
      },
      BG_STD_HEAD,
      LUMP_HEAD,
    ],
    ["분리 없음 · 기준시가", { standardPriceAtTransfer: "200,000,000", standardPriceAtAcq: "80,000,000", bgOwnerSplitDebtConfirmed: false }, BG_STD_HEAD, LUMP_HEAD],
    ["시가 + 환산취득가액", { ...MKT, bgAcquisitionMethod: "converted" }, "자산별 환산취득가 합계 — 시행령 §163·§176의2②", LUMP_HEAD],
    ["시가 + 실지취득가액", { ...MKT, bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "80,000,000" }, "자산별 실제 거래가액 합계 (자본적지출은 필요경비 — §97① 2호)", "자산별 양도비 합계 (중개수수료·법무사 비용 등) — §97① 나목"],
  ] as const)("%s", async (_n, o, acq, exp) => {
    const h = await headings(o as Record<string, unknown>);
    expect(h.acq).toBe(acq);
    expect(h.exp).toBe(exp);
  }, 120_000);

  it("부담부증여 기준시가 자산과 실거래가 자산이 섞이면 두 방식을 모두 밝힌다", () => {
    const modes = new Set(["actual", "bgStandard"] as const);
    expect(aggregateAcqHeading(modes)).toBe(
      "자산별 취득가액 합계 (산정방식: 실거래가·부담부증여 취득시 기준시가 × 채무비율(시행령 §159①1호) — 자산·파트별로 다름, 소득세법 §97①1호 가목·나목)",
    );
    expect(aggregateExpenseHeading(modes)).toContain("부담부증여 취득시 기준시가 × 채무비율 파트는 개산공제");
  });
});

describe("§159 단계 산식 — 평가 모드는 한국어", () => {
  it.each([
    ["분리 없음 · 보충적평가", { standardPriceAtTransfer: "200,000,000", standardPriceAtAcq: "80,000,000", bgOwnerSplitDebtConfirmed: false }, "(보충적평가 200,000,000 중 50.0000% 안분)"],
    ["소유자 분리 · 보충적평가", bldg("200,000,000", "80,000,000"), "(증여한 건물분 보충적평가 200,000,000 중 50.0000% 안분)"],
    ["분리 없음 · 시가", { ...MKT, bgAcquisitionMethod: "actual", bgActualAcquisitionTotal: "80,000,000" }, "(시가 200,000,000 중 50.0000% 안분)"],
  ] as const)("%s", async (_n, o, frag) => {
    const s = await runSingle(formOf([asset(1, o as Record<string, unknown>)]));
    expect(s.status).toBe(200);
    const step = ((s.r as { steps?: { label: string; formula: string }[] }).steps ?? []).find((x) => x.label === "부담부증여 양도차익 산정 (소령 §159)");
    expect(step?.formula).toContain(frag);
    expect(step?.formula).not.toMatch(/supplementary|mortgage|rental/);
  }, 120_000);
});
