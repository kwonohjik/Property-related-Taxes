/**
 * anchor — 계산기 ⑧은 §155⑳·§154⑩ 거주주택 **요건 미달**을 막지 않는다(`docs/00-pm/axis-b-late-share-surcharge-and-rhe-dead-end.plan.md` B).
 *
 * 종전: 판정 메뉴는 같은 사실을 「과세」로 답하는데 계산기 ⑧이 「거주 2년」·「보유 2년」으로 막고, 계산기 카드에는 선언을 끌 칸이 없어
 * 세액을 낼 수 없었다. 엔진은 선언이 있어도 ⑳ 불성립으로 계산한다 — 임대주택이 명부에 있으면 선언하지 않은 값과 같다(아래 대조).
 * 금액은 mock 세율(2026-11-02 실측). 막는 경로(부담부증여 카드 `mode="full"`)는 leaf 기본값으로 종전대로 막는다(RS-7).
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
import { runCalc, redevAptForm, allIssues, houseRow } from "./_helpers/redev-one-house-route";
import { validateRentalHousingException } from "@/lib/calc/transfer-tax-validate-rental-exception";
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
/** §154⑩ 단독 경로(B · 임대 0호) */
const PHRP = {
  ...RH0, applyException: true, scenario: "B", rentalUnits: [], priorRentalExemptionHistory: "none", priorResidenceTransferDate: "2019-03-01",
  wasRegisteredRentalOrChildcare: true, standardPriceAtAcquisitionForPhrp: "300,000,000", standardPriceAtPriorTransfer: "350,000,000",
  standardPriceAtTransferForPhrp: "400,000,000",
} as AssetForm["rentalHousingException"];
const A_RHE = (o: object = {}) => ({ ...RH0, applyException: true, scenario: "A", rentalUnits: [unit()], priorRentalExemptionHistory: "none", ...o }) as AssetForm["rentalHousingException"];
const row = (id: string, o: object) =>
  houseRow(id, "2018-09-27", { region: "non_capital", regionCode: NC, officialPrice: "100000000", isApartment: false, acquisitionOrigin: "general", ...o } as never);
const RENTAL_ROW = row("r", { isLongTermRental: true });
const MERGE = [row("a", { mergeOrigin: "counterpart_side" }), row("b", { mergeOrigin: "counterpart_side", isLongTermRental: true })];
const PARENTAL = { parentalCareMergeDate: "2023-06-28", parentalCareParentAge: "over_60", isFirstTransferredInMerge: true };
const R0 = { residenceInputMode: "direct", residencePeriodMonthsAsset: "0", residencePeriods: [] };

type Build = (rhe: AssetForm["rentalHousingException"]) => TransferFormData;
const phrp = (region: string, transfer: string): Build => (rhe) =>
  redevAptForm({
    kind: "housing", price: "800000000",
    assetOver: { regionCode: region, acquisitionCause: "purchase", acquisitionDate: "2018-06-01", fixedAcquisitionPrice: "600000000", residenceInputMode: "direct", residencePeriodMonthsAsset: "13", residencePeriods: [], rentalHousingException: rhe },
    formOver: { transferDate: transfer, filingDate: `${transfer.slice(0, 7)}-28`, residencePeriodMonths: "13" } as never,
  });
const housing = (o: { houses: unknown[]; acq?: string; acqPrice?: string; res?: object; merge?: object }): Build => (rhe) =>
  redevAptForm({
    kind: "housing", price: "1000000000", count: String(o.houses.length + 1), houses: o.houses as never,
    assetOver: { regionCode: NC, acquisitionCause: "purchase", acquisitionDate: o.acq ?? "2019-08-08", fixedAcquisitionPrice: o.acqPrice ?? "500000000", ...(o.res ?? R0), rentalHousingException: rhe },
    formOver: { transferDate: "2023-09-18", filingDate: "2023-12-31", residencePeriodMonths: "0", ...(o.merge ?? {}) } as never,
  });

const CASES: [string, Build, AssetForm["rentalHousingException"], number, RegExp | null][] = [
  ["D1 ⑳ 임대 1채 · 거주 0", housing({ houses: [RENTAL_ROW] }), A_RHE(), 172_766_000, /거주기간 2년 미충족/],
  ["D2 0061 상대 쪽 「아니오」 · 거주 0", housing({ houses: MERGE, merge: PARENTAL, acqPrice: "600000000" }), A_RHE({ counterpartHouseResidedTwoYears: "no" }), 132_286_000, /거주기간 2년 미충족/],
  ["E1 0061 「예」(거주 면제) · 보유 2년 미만", housing({ houses: MERGE, merge: PARENTAL, acq: "2022-10-01", acqPrice: "600000000" }), A_RHE({ counterpartHouseResidedTwoYears: "yes" }), 306_075_000, null],
  ["E2 시나리오 B · 등록 후 거주 10개월", housing({ houses: [RENTAL_ROW], acq: "2016-06-01", acqPrice: "600000000", res: { residenceInputMode: "direct", residencePeriodMonthsAsset: "30", residencePeriods: [] } }),
    { ...PHRP, rentalUnits: [unit()], postRegistrationResidenceMonths: "10" }, 121_726_000, /등록 이후\) 2년 미충족/],
  ["E3 §154⑩ 단독 · 보유 1년 9개월", phrp(NC, "2020-03-01"), PHRP, 61_215_000, /보유기간 2년 미충족/],
  ["E4 §154⑩ 종전규정 · 조정 취득 · 거주 13개월", phrp(GANGNAM, "2020-07-01"), PHRP, 61_215_000, /거주기간 2년 미충족/],
];

describe("계산기 — 요건 미달 ⑳ 선언은 막지 않고 특례 없이 계산한다", () => {
  it.each(CASES)("RS ★ %s → ⑧ 통과 · 선언 세액 = 미선언 세액", async (_n, build, rhe, expected, reason) => {
    const declared = build(rhe);
    expect(allIssues(declared)).toEqual([]);
    const r = await runCalc(declared);
    expect(r.status).toBe(200);
    expect(r.result.totalTax).toBe(expected);
    expect((await runCalc(build({ ...rhe, applyException: false }))).result.totalTax).toBe(expected);
    // 결과의 계산 과정에 불성립 사유가 남는다(E1 합가 상대 쪽 경로는 남기지 않는다 — 세액은 같다)
    const unmet = (r.result.steps as { label: string; formula: string }[]).filter((s) => s.label === "장기임대주택 거주주택 비과세 특례 — 적용 불가");
    if (reason) expect(unmet.map((s) => s.formula).join(" ")).toMatch(reason);
  });
});

describe("막는 경로는 그대로", () => {
  it("RS-7 leaf 기본값(부담부증여 카드 `mode=\"full\"`)은 거주 2년 미달을 막고, 계산기 인자(false)는 막지 않는다", () => {
    const f = housing({ houses: [RENTAL_ROW] })(A_RHE());
    const a = f.assets[0];
    expect(validateRentalHousingException(a.rentalHousingException, a, 0, "자산1", f.transferDate, "full")).toContain("거주주택 거주기간 2년(24개월) 이상이 필요합니다");
    expect(
      validateRentalHousingException(a.rentalHousingException, a, 0, "자산1", f.transferDate, "full", false, false, undefined, undefined, undefined, undefined, false),
    ).toBeNull();
  });
});
