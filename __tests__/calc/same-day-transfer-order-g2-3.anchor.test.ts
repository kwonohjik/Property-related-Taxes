/**
 * G2-3 anchor (결정 #40) — 같은 날 양도하는 주택 2채의 양도 순서(소득세법 시행령 §154⑨, 중과는 §167의3⑥ 준용).
 *
 * 종전 결함(실측 재현): A(2015 취득)·B(2018 취득)를 같은 날(2025-06-01) 8억에 양도(취득 4억·비조정·1세대).
 *   · 서로의 명부에 넣으면 둘 다 과세 266,079,000 · 둘 다 비우고 「없음」이면 둘 다 비과세 0 — 어느 순서로도 나오지 않는 값인데 경고가 없다.
 *   · 정답은 거주자가 고른 순서에 따라 111,166,000(A 먼저) 또는 121,726,000(B 먼저)이다.
 *
 * 처방: 명부 행에 「같은 날 양도 · 먼저/나중」(`soldSameDay`·`sameDayTransferOrder`). 「먼저」만 `housesOwnedAtTransfer`가 주택 수에서 뺀다.
 * 다건은 같은 날 주택 건이 모두 1채로 계산되면 막는다. 함께 양도에 같은 날 주택이 묶이면 막는다.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));
import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";
import type { MultiTransferFormData, PropertyItem } from "@/lib/stores/multi-transfer-tax-store";
import { buildMultiBody, runMulti } from "./_helpers/single-multi-route-parity";
import { validateMultiSettings } from "@/lib/calc/multi-transfer-tax-validate";
import { collectMultiRosterIssues } from "@/lib/calc/multi-roster-parity";
import { housesOwnedAtTransfer } from "@/lib/calc/household-house-count";
import { sameDayOrderNotice, sameDayExcludedRows } from "@/lib/calc/same-day-transfer-notice";
import { rowSpecialHouseExclusions, rowCountExclusionReductions } from "@/lib/calc/house-count-exclusion-rows";
import { deriveOneHouseFactsFromHouses } from "@/lib/calc/one-house-row-facts";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { sameDayHousingBundleIssue } from "@/lib/calc/same-day-housing-bundle";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";

const TD = "2025-06-01";
const NON_CAPITAL = "5111010100"; // 춘천 — 비조정
const row = (id: string, acq: string, over: Partial<HouseEntry> = {}): HouseEntry =>
  ({
    id, region: "non_capital", acquisitionDate: acq, officialPrice: "300000000", isInherited: false, isLongTermRental: false,
    isApartment: false, isOfficetel: false, isUnsoldHousing: false, ...over,
  }) as HouseEntry;

function mk(acq: string, houses: HouseEntry[], over: Partial<TransferFormData> = {}, confirmedEmpty = true): TransferFormData {
  const f = createDefaultTransferFormData();
  Object.assign(f, {
    transferDate: TD, isOneHousehold: true, contractTotalPrice: "800000000", householdNoPresaleRightsConfirmed: true,
    householdNoOtherHousesConfirmed: confirmedEmpty, residencePeriodMonths: "0", houses, ...over,
  });
  Object.assign(f.assets[0], {
    assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: acq, actualSalePrice: "800000000",
    fixedAcquisitionPrice: "400000000", addressJibun: `테스트 ${acq}`, regionCode: NON_CAPITAL,
    residenceInputMode: "direct", residencePeriods: [], residencePeriodMonthsAsset: "0",
  });
  return f;
}
const A_ACQ = "2015-01-01";
const B_ACQ = "2018-01-01";
const A = (houses: HouseEntry[], over?: Partial<TransferFormData>) => mk(A_ACQ, houses, over);
const B = (houses: HouseEntry[], over?: Partial<TransferFormData>) => mk(B_ACQ, houses, over);
const rowB = (over: Partial<HouseEntry> = {}) => row("B", B_ACQ, { addressJibun: `테스트 ${B_ACQ}`, ...over });
const rowA = (over: Partial<HouseEntry> = {}) => row("A", A_ACQ, { addressJibun: `테스트 ${A_ACQ}`, ...over });

function useRates() {
  vi.mocked(preloadTaxRates).mockImplementation(async () => loadFallbackTransferRates(new Date(TD)) as never);
}
function props(forms: TransferFormData[]): PropertyItem[] {
  return forms.map((form, i) => ({ propertyId: `p${i + 1}`, propertyLabel: `주택${i + 1}`, form, completionPercent: 100 }));
}
const settings = (forms: TransferFormData[]) =>
  ({ taxYear: 2025, properties: props(forms), annualBasicDeductionUsed: "0", basicDeductionAllocation: "EARLIEST_TRANSFER" }) as unknown as MultiTransferFormData;

describe("L 명부 술어 — 먼저 양도한 것으로 선택한 행만 주택 수에서 빠진다", () => {
  const rows = [
    rowB({ soldSameDay: true, sameDayTransferOrder: "first" }),
    row("C", "2016-01-01", { soldSameDay: true, sameDayTransferOrder: "later" }),
    row("D", "2017-01-01", { soldSameDay: true }),
    row("E", "2019-01-01", { sameDayTransferOrder: "first" }), // 표시 없이 순서만 — 무효
    row("F", "2020-01-01"),
  ];
  it("first만 제외, later·미선택·표시 없는 순서·일반 행은 남는다", () => {
    expect(housesOwnedAtTransfer(rows, TD, "housing").map((h) => h.id)).toEqual(["C", "D", "E", "F"]);
  });
  it("제외 행 목록(결과 표시용)은 제외된 행과 화면 순번을 낸다", () => {
    expect(sameDayExcludedRows(rows, TD, "housing").map((r) => [r.no, r.row.id])).toEqual([[1, "B"]]);
  });
  it("§155⑥·⑦·⑧ 행 사실과 조특법 선언도 같은 술어로 함께 빠진다(주택 수 이중 차감 없음)", () => {
    const rural = rowB({
      soldSameDay: true, sameDayTransferOrder: "first", oneHouseRuralHouse: true, ruralHouseKind: "inherited",
      oneHouseCulturalHeritage: true,
      countExclusion: { kind: "special", special: { article: "", houseAcquisitionDate: "", houseContractDate: "", isNationalHousing: false, requirementsConfirmed: false } },
    });
    const same = { ...rural, sameDayTransferOrder: "later" as const };
    const first = deriveOneHouseFactsFromHouses(housesOwnedAtTransfer([rural], TD, "housing"), {}, TD);
    expect(first.culturalHeritageHouse).toBeFalsy();
    expect(first.ruralHouse).toBeUndefined();
    expect(rowSpecialHouseExclusions([rural], TD, "housing")).toEqual([]);
    expect(rowCountExclusionReductions([rural], TD, "housing")).toEqual([]);
    // 긍정 짝 — later면 같은 행의 사실이 그대로 닿는다
    expect(deriveOneHouseFactsFromHouses(housesOwnedAtTransfer([same], TD, "housing"), {}, TD).culturalHeritageHouse).toBe(true);
    expect(rowSpecialHouseExclusions([same], TD, "housing")).toHaveLength(1);
  });
});

describe("R 다건 route — 같은 날 양도 두 건 (실측 재현 + 처방)", () => {
  it("기준선(종전 결함): 서로의 명부에 넣으면 둘 다 과세 266,079,000 — 순서를 안 골랐으니 그대로 계산하고 고지한다", async () => {
    useRates();
    const forms = [A([rowB()]), B([rowA()])];
    const m = await runMulti(forms);
    expect([m.status, m.totalTax, m.props.map((p) => p.isExempt)]).toEqual([200, 266079000, [false, false]]);
    expect(validateMultiSettings(settings(forms))).toBeNull();
    expect(collectMultiRosterIssues(props(forms)).map((i) => [i.kind, i.blocking])).toEqual(
      expect.arrayContaining([["same_day_symmetric", false]]),
    );
  });

  it("A 먼저: A 명부에 B(나중) · B 명부에 A(먼저 선택) → A 과세 · B 비과세 111,166,000", async () => {
    useRates();
    const forms = [
      A([rowB({ soldSameDay: true, sameDayTransferOrder: "later" })]),
      B([rowA({ soldSameDay: true, sameDayTransferOrder: "first" })]),
    ];
    const m = await runMulti(forms);
    expect([m.status, m.totalTax, m.props.map((p) => p.isExempt)]).toEqual([200, 111166000, [false, true]]);
    expect(validateMultiSettings(settings(forms))).toBeNull();
    expect(collectMultiRosterIssues(props(forms))).toEqual([]);
  });

  it("B 먼저(반대 순서): 121,726,000 — 순서에 따라 세액이 갈린다", async () => {
    useRates();
    const forms = [
      A([rowB({ soldSameDay: true, sameDayTransferOrder: "first" })]),
      B([rowA({ soldSameDay: true, sameDayTransferOrder: "later" })]),
    ];
    const m = await runMulti(forms);
    expect([m.status, m.totalTax, m.props.map((p) => p.isExempt)]).toEqual([200, 121726000, [true, false]]);
  });

  it("조건 — 명부의 유일한 행이 칩으로 빠져도 명부 기준이다: 잔존 스칼라(2)로 돌아가지 않는다", async () => {
    useRates();
    const forms = [A([rowB()]), B([rowA({ soldSameDay: true, sameDayTransferOrder: "first" })], { householdHousingCount: "2" })];
    const body = (await buildMultiBody(forms)) as { properties: { householdHousingCount: number; houses?: { id: string }[] }[] };
    expect(body.properties[1].householdHousingCount).toBe(1);
    expect((body.properties[1].houses ?? []).map((h) => h.id)).toEqual(["selling"]); // 엔진 명부에도 상대 주택이 안 실린다
    const m = await runMulti(forms);
    expect([m.totalTax, m.props.map((p) => p.isExempt)]).toEqual([111166000, [false, true]]);
  });

  it("순서 미선택 + 표시: 주택 수에 넣고(266,079,000) 결론을 가를 수 있으므로 고지한다. 긍정 짝: 선택하면 고지가 사라진다", async () => {
    useRates();
    const undecided = B([rowA({ soldSameDay: true })]);
    const m = await runMulti([A([rowB()]), undecided]);
    expect(m.totalTax).toBe(266079000);
    const notice = sameDayOrderNotice({ primaryKind: "housing", houses: undecided.houses, transferDate: TD });
    expect(notice).toContain("보유 주택 1");
    expect(notice).toContain("소득세법 시행령 §154⑨");
    expect(notice).toContain("확인 필요");
    const chosen = B([rowA({ soldSameDay: true, sameDayTransferOrder: "later" })]);
    expect(sameDayOrderNotice({ primaryKind: "housing", houses: chosen.houses, transferDate: TD })).toBeNull();
    // 세대 주택 수가 1채면 결론을 가를 수 없어 고지하지 않는다
    const oneOnly = [rowA({ soldSameDay: true, sameDayTransferOrder: "first" })];
    expect(sameDayOrderNotice({ primaryKind: "housing", houses: oneOnly, transferDate: TD })).toBeNull();
  });
});

describe("V 다건 ⑧ — 같은 날 주택 건이 모두 1채면 막는다", () => {
  it("둘 다 명부 비움+없음(종전 0원 과소): 차단 + 지분 분할 합치기 안내", () => {
    const msg = validateMultiSettings(settings([A([]), B([])]));
    expect(msg).toContain("같은 날(2025-06-01)");
    expect(msg).toContain("§154⑨");
    expect(msg).toContain("한 건으로 합치세요");
  });
  it("서로 먼저를 골라 둘 다 1채가 되는 우회도 막는다", () => {
    const forms = [
      A([rowB({ soldSameDay: true, sameDayTransferOrder: "first" })]),
      B([rowA({ soldSameDay: true, sameDayTransferOrder: "first" })]),
    ];
    expect(validateMultiSettings(settings(forms))).toContain("같은 날(2025-06-01)");
  });
  it("긍정 짝: 한쪽이 상대를 명부에 가진 정상 입력은 통과한다 / 다른 날이면 막지 않는다", () => {
    expect(validateMultiSettings(settings([A([rowB()]), B([])]))).toBeNull();
    const other = B([]);
    other.transferDate = "2025-09-01";
    expect(validateMultiSettings(settings([A([]), other]))).not.toContain("같은 날");
  });
  it("순서가 결론을 가를 수 없는 세대(1세대 아님 + 비조정)는 막지 않는다", () => {
    const off = { isOneHousehold: false, isRegulatedArea: false } as Partial<TransferFormData>;
    expect(validateMultiSettings(settings([A([], off), B([], off)]))).toBeNull();
  });
  it("같은 날 주택 건의 주택 수가 서로 같고 1채가 아니면(과대) 막지 않고 고지만 한다", () => {
    const forms = [A([rowB()]), B([rowA()])];
    expect(validateMultiSettings(settings(forms))).toBeNull();
    expect(collectMultiRosterIssues(props(forms)).some((i) => i.kind === "same_day_symmetric" && !i.blocking)).toBe(true);
  });
});

describe("W 함께 양도 — 같은 날 주택 2채 이상 묶임", () => {
  const bundle = (kinds: string[], over: Partial<TransferFormData> = {}) => {
    const f = A([], over);
    f.assets = kinds.map((k, i) => ({ ...makeDefaultAsset(i + 1), assetKind: k, acquisitionDate: i === 0 ? A_ACQ : B_ACQ }) as never);
    return f;
  };
  it("주택 2채: 차단하고 다건의 별도 양도 건으로 안내한다(다건이 받는 자산)", () => {
    const issue = sameDayHousingBundleIssue(bundle(["housing", "housing"]));
    expect(issue?.assetIndex).toBe(1);
    expect(issue?.message).toContain("연간 합산(다건)");
    expect(issue?.message).toContain("§154⑨");
    const steps = collectStepIssues(0, bundle(["housing", "housing"])).map((i) => i.message);
    expect(steps.some((m) => m.includes("같은 날 양도하는 주택이 2채"))).toBe(true);
  });
  it("다건이 막는 자산(겸용주택)이 섞이면 주택별 단건 + 칩으로 안내한다", () => {
    const f = bundle(["housing", "housing"]);
    (f.assets[1] as { isMixedUseHouse?: boolean }).isMixedUseHouse = true;
    const issue = sameDayHousingBundleIssue(f);
    expect(issue?.message).toContain("단건으로 계산");
    expect(issue?.message).not.toContain("연간 합산(다건) 계산에서");
  });
  it("긍정 짝: 주택 1채 + 토지 / 순서가 결론을 가를 수 없는 세대는 막지 않는다", () => {
    expect(sameDayHousingBundleIssue(bundle(["housing", "land"]))).toBeNull();
    expect(sameDayHousingBundleIssue(bundle(["housing", "housing"], { isOneHousehold: false, isRegulatedArea: false }))).toBeNull();
  });
});
