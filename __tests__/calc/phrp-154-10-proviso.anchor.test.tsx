/**
 * anchor — §154⑩ 단독 경로(직전거주주택보유주택 · 공동보유 장기임대주택 0호) × §154① 단서 · 계산기 경로(⑧·④·⑫·⑭)
 * (사용자 결정 2026-10-26 V-R3 (a) · `docs/00-pm/rental-residence-holding-proviso.plan.md` §10). 엔진 주장은
 * `__tests__/tax-engine/rental-housing-exception/phrp-154-10-proviso.anchor.test.ts`.
 *
 * 종전(계획서 §10 실측): 단서 사유와 무관하게 ⑧이 「거주주택 보유기간 2년 이상이 필요합니다」(조정대상지역 취득은 거주 2년)로 막았다.
 * 세대가 이 주택 1채라 단서 카드는 1주택 맥락(`one_house`)으로 원래 보인다.
 *
 * 시료: 8억(취득가 6억) · 1주택 · 2018-06-01 취득·임대 등록 · 직전거주주택 2019-03-01 양도 · 2020-03-01 양도(보유 1년 9개월) · 거주 13개월.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/rate-limit")>()),
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { runCalc, redevAptForm, allIssues } from "./_helpers/redev-one-house-route";
import { calcProvisoMode } from "@/lib/calc/transfer-tax-api-residence";
import { validateRentalHousingException } from "@/lib/calc/transfer-tax-validate-rental-exception";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const HOLDING_BLOCK = "거주주택 보유기간 2년 이상이 필요합니다";
const RESIDENCE_BLOCK = "조정대상지역 취득 주택은 거주기간 2년(24개월) 이상이 필요합니다";

const rh: AssetForm["rentalHousingException"] = {
  ...makeDefaultAsset(1).rentalHousingException,
  applyException: true,
  scenario: "B",
  rentalUnits: [],
  priorRentalExemptionHistory: "none",
  priorResidenceTransferDate: "2019-03-01",
  wasRegisteredRentalOrChildcare: true,
  standardPriceAtAcquisitionForPhrp: "300,000,000",
  standardPriceAtPriorTransfer: "350,000,000",
  standardPriceAtTransferForPhrp: "400,000,000",
} as AssetForm["rentalHousingException"];

function form(formOver: Record<string, unknown> = {}) {
  return redevAptForm({
    kind: "housing",
    price: "800000000",
    assetOver: {
      acquisitionCause: "purchase",
      acquisitionDate: "2018-06-01",
      fixedAcquisitionPrice: "600000000",
      residenceInputMode: "direct",
      residencePeriodMonthsAsset: "13",
      residencePeriods: [],
      rentalHousingException: rh,
    },
    formOver: { transferDate: "2020-03-01", filingDate: "2020-03-31", residencePeriodMonths: "13", ...formOver } as never,
  });
}

describe("계산기 — §154⑩ 단독 경로 × §154① 단서", () => {
  it("PC-1 ★ 3호 부득이 → ⑧ 통과 · ④에 단서 · 보유 2년 이상 대조와 같은 §161 안분(종전 ⑧ 차단)", async () => {
    const f = form({ provisoReason: "unavoidable" });
    expect(calcProvisoMode(f)).toBe("one_house");
    expect(allIssues(f)).toEqual([]);
    const r = await runCalc(f);
    expect(r.status).toBe(200);
    expect(r.body.oneHouseExemptionProviso).toEqual({ reason: "unavoidable" });
    // 대조: 같은 폼 · 2020-07-01 양도(보유 2년 1개월) · 단서 없음 — 계산기 경로 실측 19,225,000
    const control = await runCalc(form({ transferDate: "2020-07-01", filingDate: "2020-07-31" }));
    expect(control.result.determinedTax).toBe(19_225_000);
    expect(r.result.determinedTax).toBe(19_225_000);
    expect((r.result.warnings as string[]).some((w) => w.includes("§154⑩ 경로에 §154① 단서를 적용한 정면 해석례가 없어 확인이 필요합니다"))).toBe(true);
  });

  it("PC-2 부정 짝 — 단서 없음·5호는 ⑧이 종전대로 보유 2년으로 막는다", () => {
    expect(allIssues(form()).some((i) => i.message.includes(HOLDING_BLOCK))).toBe(true);
    const p5 = form({ provisoReason: "pre_designation_contract", provisoPreContractNoHouse: true });
    expect(allIssues(p5).some((i) => i.message.includes(HOLDING_BLOCK))).toBe(true);
  });
});

describe("⑧ leaf — §154⑩ 단독 경로의 단서 인자", () => {
  const asset = (o: Record<string, unknown> = {}) =>
    ({ ...makeDefaultAsset(1), assetKind: "housing", acquisitionDate: "2018-06-01", residenceInputMode: "direct", residencePeriodMonthsAsset: "13", rentalHousingException: rh, ...o }) as AssetForm;
  const call = (transferDate: string, regulated: boolean, reason?: string) =>
    validateRentalHousingException(rh, asset(), 0, "자산1", transferDate, "full", false, regulated, undefined, undefined, reason);

  it("PV-1 보유 2년 — 1호~3호(나·다목 포함)는 풀고 5호·삭제 전 4호·미전달은 막는다", () => {
    for (const r of ["rental_5yr_residence", "expropriation", "overseas_migration", "overseas_residence", "unavoidable"]) expect(call("2020-03-01", false, r)).toBeNull();
    for (const r of [undefined, "", "pre_designation_contract", "rental_registration_4ho"]) expect(call("2020-03-01", false, r)).toContain(HOLDING_BLOCK);
  });

  it("PV-2 종전규정 조정대상지역 취득 거주 2년 — 1호~5호·삭제 전 4호는 풀고 미전달은 막는다", () => {
    for (const r of ["unavoidable", "pre_designation_contract", "rental_registration_4ho"]) expect(call("2020-07-01", true, r)).toBeNull();
    expect(call("2020-07-01", true, undefined)).toContain(RESIDENCE_BLOCK);
    // 보유 2년 미만이면 5호는 거주만 풀어 보유 차단이 남는다
    expect(call("2020-03-01", true, "pre_designation_contract")).toContain(HOLDING_BLOCK);
  });
});
