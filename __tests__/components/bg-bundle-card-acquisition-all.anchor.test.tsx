/**
 * anchor — 부담부증여 묶음 결과 명세 취득가액·개산공제 = 카드 합 (일반건물 지분 분할 · 함께 양도)
 * 계획서 `docs/02-design/features/bg-bundle-card-acquisition-all.plan.md` §1·§2.1·§5 (사용자 결정 Q-1 a · Q-2 a).
 *
 * 종전: 물건 전체 재계산이 첫 지분·첫 물건의 취득 값만 알아(일반건물 지분: 지분 명세를 이월과세 지분만 넘김 / 함께 양도: 방식·실지·추정가액을
 * `...primary`로 둠) 지분이나 물건마다 값이 다르면 결과 명세가 세액과 갈렸고, 상세명세서 §159 산식은 값이 같아도 지분율이 빠진 틀린 등식이었다.
 * → 부담부증여 묶음은 언제나 카드별 결과 합 + 카드별 명세. 세액은 바뀌지 않는다(표시 전용).
 *
 * 세액 수치(mock 세율표 실측)는 변경 전·후 같다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => "/calc/transfer-tax" }));
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
import { BundledAllocationCard } from "@/components/calc/results/BundledAllocationCard";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { bundleRoute, COMPANION, shares, SH_K4, SH_K5, SH_K6, SH_K7, SH_S2_STD_DIFF, SH_STD, type BundleRoute } from "../calc/_helpers/bg-bundle-card-all-form";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});
afterEach(cleanup);

const S2_DATE = "2018-03-01";
const SAME_S2 = { bgAcquisitionMethod: "appraisal", bgPresumedAcquisitionLand: "200,000,000", bgPresumedAcquisitionBuilding: "300,000,000" };
const APPRAISAL_S2 = { bgAcquisitionMethod: "appraisal", bgPresumedAcquisitionLand: "300,000,000", bgPresumedAcquisitionBuilding: "400,000,000" };
const SALES_S2 = { ...APPRAISAL_S2, bgAcquisitionMethod: "salesCase" };

function view(f: TransferFormData, r: BundleRoute) {
  const c = render(
    <BundledAllocationCard apportionment={r.data.apportionment} aggregated={r.data.aggregated} transferBurdenedGiftBreakdown={r.whole} formData={f} />,
  ).container;
  const text = (c.textContent ?? "").replace(/\s+/g, " ");
  const rows = (id: string) => [...c.querySelectorAll(`[data-testid="${id}"]`)].map((e) => (e.textContent ?? "").replace(/\s+/g, " "));
  return { c, text, acquisitionRows: rows("bg-bundle-card-acquisition"), deductionRows: rows("bg-bundle-card-estimated-deduction") };
}

describe("V-1 일반건물 지분 분할 — 명세 취득가액·개산공제 = 지분 카드 합 (종전: 첫 지분 값)", () => {
  const CASES: [string, () => TransferFormData, { tax: number; shown: number; deduction: number }][] = [
    ["감정가액 같음", () => shares(SH_K7, { s2: SAME_S2 }), { tax: 57_552_880, shown: 250_000_000, deduction: 3_000_000 }],
    ["감정가액 다름(지분2 3억 + 4억 · 2018 취득) — 종전 250,000,000", () => shares(SH_K7, { d2: S2_DATE, s2: APPRAISAL_S2 }), { tax: 45_985_984, shown: 290_000_000, deduction: 3_000_000 }],
    ["매매사례가액 다름 — 종전 250,000,000", () => shares(SH_K6, { d2: S2_DATE, s2: SALES_S2 }), { tax: 45_985_984, shown: 290_000_000, deduction: 3_000_000 }],
    ["환산 · 지분2 취득시 기준시가 다름 — 종전 250,000,000 / 3,000,000", () => shares(SH_K5, { d2: S2_DATE, s2: SH_S2_STD_DIFF }), { tax: 42_264_112, shown: 300_000_000, deduction: 3_600_000 }],
    ["기준시가 평가 · 지분2 취득시 기준시가 다름 — 종전 100,000,000 / 3,000,000", () => shares(SH_STD, { d2: S2_DATE, s2: SH_S2_STD_DIFF }), { tax: 9_024_576, shown: 120_000_000, deduction: 3_600_000 }],
    ["기준시가 평가 같음", () => shares(SH_STD), { tax: 12_978_240, shown: 100_000_000, deduction: 3_000_000 }],
    ["실지 · 지분2 기준시가만 다름", () => shares(SH_K4, { d2: S2_DATE, s2: SH_S2_STD_DIFF }), { tax: 94_646_200, shown: 150_000_000, deduction: 0 }],
  ];

  it.each(CASES)("%s", async (_n, make, want) => {
    const r = await bundleRoute(make());
    expect(r.status).toBe(200);
    expect(r.tax).toBe(want.tax);
    expect(r.whole.cards).toHaveLength(2);
    expect(r.shown).toBe(want.shown);
    expect(r.shown).toBe(r.cardSum);
    expect(r.shownDeduction).toBe(want.deduction);
    expect(r.shownDeduction).toBe(r.cardExpense);
  });

  it("상세명세서 §159 산식 — 감정가액 같음: 지분 명세 × 지분 감정가액 / 지분 평가액 (지분율이 반영된 맞는 등식)", async () => {
    const f = shares(SH_K7, { s2: SAME_S2 });
    const { text } = view(f, await bundleRoute(f));
    expect(text).toContain("120,000,000 × 300,000,000600,000,000 = 60,000,000");
    expect(text).toContain("80,000,000 × 200,000,000400,000,000 = 40,000,000");
    // 종전: 물건 전체 명세 슬롯(첫 지분 · 지분율 미적용) × 우변은 카드 값 — 좌변이 100,000,000인 틀린 등식
    expect(text).not.toContain("200,000,000 × 500,000,000");
  });

  it("상세명세서 §159 산식 — 감정가액 다름: 지분2 토지는 지분2 자기 감정가액(3억) × 40% = 60,000,000", async () => {
    const f = shares(SH_K7, { d2: S2_DATE, s2: APPRAISAL_S2 });
    const { text } = view(f, await bundleRoute(f));
    expect(text).toContain("120,000,000 × 200,000,000400,000,000 = 60,000,000");
  });

  it("상세명세서 §159 산식 — 기준시가 평가 취득시 기준시가 다름: 지분마다 자기 값(종전: 네 카드 모두 같은 식)", async () => {
    const f = shares(SH_STD, { d2: S2_DATE, s2: SH_S2_STD_DIFF });
    const { text } = view(f, await bundleRoute(f));
    expect(text).toContain("60,000,000 × 120,000,000240,000,000 = 30,000,000");
    expect(text).toContain("60,000,000 × 80,000,000160,000,000 = 30,000,000");
    expect(text).not.toContain("100,000,000 × 200,000,000400,000,000");
  });

  it("카드별 행 — 지분마다 자기 근거 값(지분분)과 채무비율", async () => {
    const f = shares(SH_K7, { d2: S2_DATE, s2: APPRAISAL_S2 });
    const v = view(f, await bundleRoute(f));
    expect(v.acquisitionRows).toHaveLength(2);
    expect(v.acquisitionRows[0]).toContain("감정가액(지분분) 300,000,000 × 채무비율 50.0000%");
    expect(v.acquisitionRows[1]).toContain("감정가액(지분분) 280,000,000 × 채무비율 50.0000%");
  });
});

describe("V-2 함께 양도(다른 물건) — 명세 취득가액·개산공제 = 물건 카드 합 (종전: 첫 물건 값)", () => {
  const CASES: [string, () => TransferFormData, { tax: number; shown: number; deduction: number }][] = [
    ["기준시가 평가(종전에도 맞음)", COMPANION.STD, { tax: 34_336_500, shown: 200_000_000, deduction: 6_000_000 }],
    ["실지 5억 / 3억 — 종전 125,000,000", COMPANION.K4, { tax: 35_953_500, shown: 200_000_000, deduction: 0 }],
    ["감정가액 5억 / 3억 — 종전 125,000,000", COMPANION.K7, { tax: 34_942_875, shown: 200_000_000, deduction: 3_750_000 }],
    ["매매사례가액 5억 / 3억 — 종전 125,000,000", COMPANION.K6, { tax: 34_942_875, shown: 200_000_000, deduction: 3_750_000 }],
    ["환산 — 종전 153,846,153(합산 기준시가로 한 번 환산)", COMPANION.K5, { tax: 47_976_500, shown: 153_750_000, deduction: 3_750_000 }],
    ["실지 / 감정가액 혼합 — 종전 125,000,000(방식 「실지」 한 줄) · 개산공제 0", COMPANION.mixed, { tax: 35_549_250, shown: 200_000_000, deduction: 1_500_000 }],
  ];

  it.each(CASES)("%s", async (_n, make, want) => {
    const r = await bundleRoute(make());
    expect(r.status).toBe(200);
    expect(r.tax).toBe(want.tax);
    expect(r.whole.cards).toHaveLength(2);
    expect(r.shown).toBe(want.shown);
    expect(r.shown).toBe(r.cardSum);
    expect(r.shownDeduction).toBe(want.deduction);
    expect(r.shownDeduction).toBe(r.cardExpense);
  });

  it("혼합 방식 — 카드별 행이 물건마다 자기 방식(실지 / 감정가액)으로 그려진다", async () => {
    const f = COMPANION.mixed();
    const v = view(f, await bundleRoute(f));
    expect(v.acquisitionRows).toHaveLength(2);
    expect(v.acquisitionRows[0]).toContain("실지취득가 500,000,000 × 채무비율 25.0000%");
    expect(v.acquisitionRows[1]).toContain("감정가액 300,000,000 × 채무비율 25.0000%");
    // 실지 물건은 개산공제 줄이 없고, 감정가액 물건만 개산공제가 있다
    expect(v.deductionRows).toHaveLength(1);
    expect(v.deductionRows[0]).toContain("취득시 기준시가 200,000,000 × 채무비율 25.0000% × 개산공제율 3%");
  });
});
