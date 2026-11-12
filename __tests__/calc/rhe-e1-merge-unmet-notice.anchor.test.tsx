/**
 * anchor — §155④⑤ 합가 × ⑳ 상대 쪽 임대(0061 경로)가 성립했는데 양도 주택이 §154① 보유·거주 미달로 과세되면 그 사유를 고지한다
 * (`docs/00-pm/rhe-e1-notice-and-card-verdict-mismatch.plan.md` A · Q-A1 (a) · Q-A3 둘 다).
 *
 * 종전: 이 경로는 ⑳ 선언을 걷으므로 「장기임대주택 거주주택 비과세 특례 — 적용 불가」 단계가 남지 않고 warnings도 비어
 * 결과에 ⑳·합가 언급이 하나도 없었다(상대 쪽 「아니오」로 답하면 오히려 사유가 보였다). 세액은 그대로다(2026-11-03 실측 · mock 세율).
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
import { runCalc, redevAptForm, houseRow } from "./_helpers/redev-one-house-route";
import { makeDefaultAsset, makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const GANGNAM = "1168010100";
const NC = "4682025021";
const RH0 = makeDefaultAsset(1).rentalHousingException;
const unit = () => ({
  ...makeDefaultRentalUnit(), businessRegistrationDate: "2019-09-26", rentalRegistrationDate: "2019-09-26", rentalRegisteredDate: "2019-09-26",
  standardPriceAtRentalStart: "250,000,000", rentalInputMode: "direct" as const, rentalMonths: "48", requirementsConfirmed: true,
});
const A_RHE = (o: object = {}) => ({ ...RH0, applyException: true, scenario: "A", rentalUnits: [unit()], priorRentalExemptionHistory: "none", ...o }) as AssetForm["rentalHousingException"];
const row = (id: string, o: object) =>
  houseRow(id, "2018-09-27", { region: "non_capital", regionCode: NC, officialPrice: "100000000", isApartment: false, acquisitionOrigin: "general", ...o } as never);
const MERGE = [row("a", { mergeOrigin: "counterpart_side" }), row("b", { mergeOrigin: "counterpart_side", isLongTermRental: true })];
const PARENTAL = { parentalCareMergeDate: "2023-06-28", parentalCareParentAge: "over_60", isFirstTransferredInMerge: true };
const R0 = { residenceInputMode: "direct", residencePeriodMonthsAsset: "0", residencePeriods: [] };

type Build = (rhe: AssetForm["rentalHousingException"]) => TransferFormData;


const UNMET = /주택 수에서 빼고 소득세법 시행령 §155④로 판정했지만, 양도 주택이 「소득세법 시행령」 §154① (.+) 요건을 충족하지 못해 비과세되지 않습니다/;
const SURCHARGE = /중과 판정의 주택 수는 따로 세어 3주택으로 보고 중과세율을 적용했습니다/;
const APPLIED = /주택 수에서 빼고 소득세법 시행령 §155④를 적용했습니다/;
const MERGE5 = [row("a", { mergeOrigin: "counterpart_side", officialPrice: "500000000" }), row("b", { mergeOrigin: "counterpart_side", isLongTermRental: true, officialPrice: "500000000" })];
const e1 = (region: string, houses: unknown[], acq: string): Build => (rhe) =>
  redevAptForm({
    kind: "housing", price: "1000000000", count: String(houses.length + 1), houses: houses as never,
    assetOver: { regionCode: region, acquisitionCause: "purchase", acquisitionDate: acq, fixedAcquisitionPrice: "600000000", ...R0, rentalHousingException: rhe },
    formOver: { transferDate: "2023-09-18", filingDate: "2023-12-31", residencePeriodMonths: "0", ...PARENTAL, ...(region === GANGNAM ? { isRegulatedArea: true, wasRegulatedAtAcquisition: true } : {}) } as never,
  });
const YES = A_RHE({ counterpartHouseResidedTwoYears: "yes" });
const warningsOf = (r: Awaited<ReturnType<typeof runCalc>>) => (r.result.warnings ?? []) as string[];

describe("0061 경로 성립 · §154① 미달 과세 — 사유 고지", () => {
  it.each([
    ["비과세 지역 · 보유 1년 미만", e1(NC, MERGE, "2022-10-01"), 306_075_000, "보유 2년(현재 0년 11개월)"],
    ["강남 · 보유 1년 미만 · 조정 취득 거주 0", e1(GANGNAM, MERGE, "2022-10-01"), 306_075_000, "보유 2년(현재 0년 11개월) · 거주 2년(현재 0개월)"],
    ["강남 · 보유 3년 · 조정 취득 거주 0", e1(GANGNAM, MERGE, "2020-06-01"), 135_806_000, "거주 2년(현재 0개월)"],
  ] as const)("MU-1 ★ %s → 고지 1건 · 세액 불변", async (_n, build, tax, part) => {
    const r = await runCalc(build(YES));
    expect(r.issues).toEqual([]);
    expect(r.result.totalTax).toBe(tax);
    expect((await runCalc(build({ ...YES, applyException: false }))).result.totalTax).toBe(tax);
    const hits = warningsOf(r).filter((w) => UNMET.test(w));
    expect(hits).toHaveLength(1);
    expect(hits[0].match(UNMET)![1]).toBe(part);
  });

  it("MU-2 중과 3주택 시료 — 중과 고지와 함께 낸다(Q-A3)", async () => {
    const r = await runCalc(e1(GANGNAM, MERGE5, "2022-10-01")(YES));
    expect(r.result.totalTax).toBe(306_075_000);
    expect(warningsOf(r).filter((w) => UNMET.test(w))).toHaveLength(1);
    expect(warningsOf(r).filter((w) => SURCHARGE.test(w))).toHaveLength(1);
  });

  it("MU-3 🔑 짝 — 성립(비과세)이면 적용 고지만 · 상대 쪽 「아니오」면 ⑳ 「적용 불가」 단계만", async () => {
    const ok = await runCalc(e1(NC, MERGE, "2020-06-01")(YES));
    expect(ok.result.totalTax).toBe(0);
    expect(warningsOf(ok).some((w) => APPLIED.test(w))).toBe(true);
    expect(warningsOf(ok).some((w) => UNMET.test(w))).toBe(false);
    const no = await runCalc(e1(NC, MERGE, "2022-10-01")(A_RHE({ counterpartHouseResidedTwoYears: "no" })));
    expect(no.result.totalTax).toBe(306_075_000);
    expect(warningsOf(no).some((w) => UNMET.test(w))).toBe(false);
    expect((no.result.steps as { label: string }[]).some((s) => s.label === "장기임대주택 거주주택 비과세 특례 — 적용 불가")).toBe(true);
  });
});
