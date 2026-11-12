/**
 * route anchor — 다건 건별 `refDeterminedTax`는 «산출세액(참고) − 배분 감면(reductionAggregated)»이다.
 * 계획서 docs/00-pm/multi-per-asset-reduction-display.plan.md (Q-1 a · Q-2 a).
 *
 * 종전에는 `max(0, refCalculatedTax − reductionAmount)`였다 — `reductionAmount`는 기본공제 전(skipBasicDeduction) 소득 기준의
 * **건별 단독** 감면액이라 기본공제 후 산출세액과 기준이 달랐다. 1건이어도 단건·합산과 같은 결정세액이 나오지 않았고
 * (§97 본문 84,030,000 ≠ 84,530,000) 상세명세서 산식 «A − B = C»가 등식으로 성립하지 않았다.
 * 기대값은 하드코딩하지 않고 **단건 route 결과**로 정한다 — 같은 폼 1건이면 건별 참고값이 단건 값과 같아야 한다.
 * 고정하지 않는 것: 건별 `determinedTax`·PDF «결정세액 기여분(참고)»(계획서 Q-3 a — 별건), 3건 이상·비교과세.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { createDefaultTransferFormData, type AssetForm, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { getReductionDefault } from "@/components/calc/transfer/UnifiedReductionPanel-defaults";
import { buildDeterminedTaxFormula } from "@/components/calc/results/transfer/DetailedStatementFormulaBuilders";
import { breakdownToFilingResult } from "@/components/calc/results/MultiTransferPropertyBreakdown";
import type { PerPropertyBreakdown } from "@/lib/tax-engine/transfer-tax-aggregate";
import { runSingle, buildMultiBody, postMulti } from "../calc/_helpers/single-multi-route-parity";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));
beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(async (_t, date) => loadFallbackTransferRates(date) as never);
});

const x = (o: Record<string, unknown>) => o as unknown as Partial<AssetForm>;

const rentalCommon = {
  registrationDate: "2015-01-01", rentalStartDate: "2015-01-01", isTaxRegistered: true, taxRegistrationDate: "2015-01-01",
  rentIncreaseViolationMode: "none", rentalContinuesToTransfer: true, hasVacancyOverGrace: false,
  officialPriceAtStart: "300,000,000", isNationalHousingScale: true,
};
const OLD = { registrationDate: "1995-03-01", rentalStartDate: "1995-03-01", taxRegistrationDate: "1995-03-01" };
/** 조특법 §97 본문 — 감면율 50%(취득 1995) */
const r97main = () => ({
  ...getReductionDefault("rental_97_main" as never), ...rentalCommon, ...OLD,
  constructionYear: "1995", isNationalHousing: true, hasMin5RentalUnits: true, isMultiUnitHousing: false, isUnoccupiedAt1986: true, isUnoccupiedAtAcquisition: true,
});
/** 조특법 §97의5 — 100% 감면(산출세액 전액 → cap 경계) */
const r975 = () => ({ ...getReductionDefault("rental_97_5"), ...rentalCommon, isPurchaseRental: true });
/** 수용 §77 — 15% */
const r77 = () => ({
  ...getReductionDefault("public_expropriation"), expropriationCash: "900,000,000", expropriationBond: "0",
  expropriationBondHoldingYears: "none", expropriationApprovalDate: "2023-01-01",
});

const ACQ = "2003-03-01";
const ACQ_OLD = "1995-02-01";
/** §97의5 적격 취득일(등록과 같은 날) — 취득 하한(법률 제12853호 부칙 §34 · 2015.1.1. 이후)에 맞춰 2014→2015 (2026-11-12) */
const ACQ_97_5 = "2015-01-01";

function card(reductions: unknown[], acq: string): AssetForm {
  return Object.assign({ ...makeDefaultAsset(1) }, x({
    assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: acq,
    actualSalePrice: "900,000,000", fixedAcquisitionPrice: "200,000,000",
    standardPriceAtAcq: "100,000,000", standardPriceAtTransfer: "400,000,000",
    assetContractDate: "", reductions: reductions as never,
  })) as AssetForm;
}
function form(reductions: unknown[], acq: string): TransferFormData {
  return Object.assign(createDefaultTransferFormData(), {
    transferDate: "2025-08-01", contractTotalPrice: "900000000", assets: [card(reductions, acq)], isOneHousehold: false, householdHousingCount: "1",
  }) as TransferFormData;
}

/** 산식 문자열 «A - B = C» → [A, B, C] (천 단위 쉼표 제거). 형식이 다르면 null. */
function parseSubtraction(s: string): [number, number, number] | null {
  const m = /^([\d,]+) - ([\d,]+) = ([\d,]+)$/.exec(s);
  return m ? [Number(m[1].replace(/,/g, "")), Number(m[2].replace(/,/g, "")), Number(m[3].replace(/,/g, ""))] : null;
}

const SAMPLES: Array<[string, () => unknown[], string]> = [
  ["§97 본문(50%)", () => [r97main()], ACQ_OLD],
  ["수용 §77(15%)", () => [r77()], ACQ],
  ["§97의5(결정세액 0)", () => [r975()], ACQ_97_5],
];

describe("1건 — 건별 참고 결정세액·지방소득세가 단건과 같다", () => {
  it.each(SAMPLES)("%s", async (_n, mk, acq) => {
    const f = form(mk(), acq);
    const s = await runSingle(f);
    const m = await postMulti(await buildMultiBody([f]));
    expect(s.status).toBe(200);
    expect(m.status).toBe(200);
    const p = m.props[0] as unknown as PerPropertyBreakdown;
    expect(p.reductionAggregated, "전제: 배분 감면은 단건 감면과 같다").toBe(s.r.reductionAmount);
    expect(p.refDeterminedTax).toBe(s.r.determinedTax);
    // 건별 신고서 어댑터: 결정세액·지방소득세가 단건과 같다
    const adapted = breakdownToFilingResult(p);
    expect(adapted.determinedTax).toBe(s.r.determinedTax);
    expect(adapted.localIncomeTax).toBe(s.r.localIncomeTax);
  });
});

describe("상세명세서 결정세액 산식 «산출세액 − 감면 = 결정세액»이 산술적으로 성립한다", () => {
  it.each(SAMPLES)("%s — 1건", async (_n, mk, acq) => {
    const m = await postMulti(await buildMultiBody([form(mk(), acq)]));
    const p = m.props[0] as unknown as PerPropertyBreakdown;
    const parts = parseSubtraction(buildDeterminedTaxFormula(p));
    expect(parts, buildDeterminedTaxFormula(p)).not.toBeNull();
    const [a, b, c] = parts!;
    expect(a - b).toBe(c);
  });

  it("2건(§97 본문 카드 + 감면 없음 카드) — 감면 있는 건의 산식", async () => {
    const m = await postMulti(await buildMultiBody([form([r97main()], ACQ_OLD), form([], ACQ)]));
    expect(m.status).toBe(200);
    const [p1, p2] = m.props as unknown as PerPropertyBreakdown[];
    expect(p1.reductionAggregated, "전제: 첫 건에 감면이 배분된다").toBeGreaterThan(0);
    const parts = parseSubtraction(buildDeterminedTaxFormula(p1));
    expect(parts, buildDeterminedTaxFormula(p1)).not.toBeNull();
    expect(parts![0] - parts![1]).toBe(parts![2]);
    // 감면 없는 건은 산출세액 그대로
    expect(p2.refDeterminedTax).toBe(p2.refCalculatedTax);
  });
});

describe("신고서 건별 열 — 산출세액 = 감면세액 + 결정세액 (cap 경계 포함)", () => {
  it.each(SAMPLES)("%s: 산출 − 결정 = 배분 감면", async (_n, mk, acq) => {
    const m = await postMulti(await buildMultiBody([form(mk(), acq)]));
    const p = m.props[0] as unknown as PerPropertyBreakdown;
    expect(p.refCalculatedTax - p.refDeterminedTax).toBe(p.reductionAggregated);
  });

  it("cap 경계 — 배분 감면이 건별 산출세액을 넘으면(2건: §97의5 카드 + 감면 없는 카드) 결정세액은 0이고 음수가 아니다", async () => {
    const m = await postMulti(await buildMultiBody([form([r975()], ACQ_97_5), form([], ACQ)]));
    expect(m.status).toBe(200);
    const [p1] = m.props as unknown as PerPropertyBreakdown[];
    expect(p1.reductionAggregated, "전제: 배분 감면 > 건별 산출세액").toBeGreaterThan(p1.refCalculatedTax);
    expect(p1.refDeterminedTax).toBe(0);
  });
});
