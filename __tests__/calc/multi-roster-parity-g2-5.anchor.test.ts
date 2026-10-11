/**
 * G2-5 anchor (결정 #41) — 다건 합산에서 같은 신고의 다른 양도 건과 건별 명부(다른 보유 주택 목록·분양권·입주권)의 어긋남.
 *
 * 종전 결함(실측 재현): A(2015 취득·2025-03-01 양도)·B(2018 취득·2025-09-01 양도), 각 8억·취득 4억·비조정·1세대. 경고 없이:
 *   · A 명부를 비우고 「없음」 확인 → A·B 모두 비과세 0 (아직 보유 중이던 B를 빠뜨림 — 과소)
 *   · B 명부에 이미 판 A가 남음 → A·B 모두 과세 266,079,000 (과대)
 *   · 정답은 A 명부에 B, B 명부는 비움 → 111,166,000 (소득세법 시행령 §154① 「양도일 현재」)
 * 처방: 건별 명부(Q-9)는 그대로 두고, 명백한 모순(명부 비움+「없음」인데 그날 보유 중인 다른 주택 건)만 막고 나머지는 비차단 고지한다.
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
import { runMulti } from "./_helpers/single-multi-route-parity";
import { validateMultiSettings } from "@/lib/calc/multi-transfer-tax-validate";
import { collectMultiRosterIssues, multiRosterNotices } from "@/lib/calc/multi-roster-parity";

const NON_CAPITAL = "5111010100";
const row = (id: string, acq: string, over: Partial<HouseEntry> = {}): HouseEntry =>
  ({
    id, region: "non_capital", acquisitionDate: acq, officialPrice: "300000000", isInherited: false, isLongTermRental: false,
    isApartment: false, isOfficetel: false, isUnsoldHousing: false, ...over,
  }) as HouseEntry;

function mk(
  acq: string,
  td: string,
  houses: HouseEntry[],
  over: Partial<TransferFormData> = {},
  asset: Record<string, unknown> = {},
): TransferFormData {
  const f = createDefaultTransferFormData();
  Object.assign(f, {
    transferDate: td, isOneHousehold: true, contractTotalPrice: "800000000", householdNoPresaleRightsConfirmed: true,
    householdNoOtherHousesConfirmed: houses.length === 0, residencePeriodMonths: "0", houses, ...over,
  });
  Object.assign(f.assets[0], {
    assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: acq, actualSalePrice: "800000000",
    fixedAcquisitionPrice: "400000000", addressJibun: `테스트 ${acq}`, regionCode: NON_CAPITAL,
    residenceInputMode: "direct", residencePeriods: [], residencePeriodMonthsAsset: "0", ...asset,
  });
  return f;
}
const A_ACQ = "2015-01-01", B_ACQ = "2018-01-01", A_TD = "2025-03-01", B_TD = "2025-09-01";
const A = (houses: HouseEntry[], over?: Partial<TransferFormData>, asset?: Record<string, unknown>) => mk(A_ACQ, A_TD, houses, over, asset);
const B = (houses: HouseEntry[], over?: Partial<TransferFormData>, asset?: Record<string, unknown>) => mk(B_ACQ, B_TD, houses, over, asset);
const rowB = () => row("B", B_ACQ, { addressJibun: `테스트 ${B_ACQ}` });
const rowA = () => row("A", A_ACQ, { addressJibun: `테스트 ${A_ACQ}` });
const props = (forms: TransferFormData[]): PropertyItem[] =>
  forms.map((form, i) => ({ propertyId: `p${i + 1}`, propertyLabel: `주택${i + 1}`, form, completionPercent: 100 }));
const settings = (forms: TransferFormData[]) =>
  ({ taxYear: 2025, properties: props(forms), annualBasicDeductionUsed: "0", basicDeductionAllocation: "EARLIEST_TRANSFER" }) as unknown as MultiTransferFormData;
function useRates(td: string) {
  vi.mocked(preloadTaxRates).mockImplementation(async () => loadFallbackTransferRates(new Date(td)) as never);
}

describe("재현 — 세 입력의 세액 (⑧ 게이트와 무관하게 route를 직접 실행)", () => {
  it("누락형 0 / 정답 111,166,000 / 잔존형 266,079,000", async () => {
    useRates(A_TD);
    expect((await runMulti([A([]), B([])])).totalTax).toBe(0);
    useRates(A_TD);
    expect((await runMulti([A([rowB()]), B([])])).totalTax).toBe(111166000);
    useRates(A_TD);
    expect((await runMulti([A([rowB()]), B([rowA()])])).totalTax).toBe(266079000);
  });
});

describe("차단 — 명부 비움 + 「없음」 확인인데 그날 보유 중인 다른 주택 건이 있다 (하위 1 가)", () => {
  it("누락형 0원 입력은 막는다 — 소재지로 다른 주택임을 확인할 수 있을 때", () => {
    const msg = validateMultiSettings(settings([A([]), B([])]));
    expect(msg).toContain("주택1");
    expect(msg).toContain("「다른 보유 주택이 없습니다」 확인과도 맞지 않습니다");
    expect(msg).toContain("한 건으로 합치세요");
  });
  it("긍정 짝: 바른 입력(A 명부에 B, B 명부 비움)은 통과하고 고지도 없다", () => {
    const forms = [A([rowB()]), B([])];
    expect(validateMultiSettings(settings(forms))).toBeNull();
    expect(collectMultiRosterIssues(props(forms))).toEqual([]);
  });
  it("같은 주택을 지분으로 나눠 다른 날 판 건(소재지 같음)은 대조에서 뺀다 — 차단도 고지도 없다", () => {
    const sameAddr = { addressJibun: "테스트 같은집" };
    const forms = [A([], undefined, sameAddr), B([], undefined, sameAddr)];
    expect(collectMultiRosterIssues(props(forms))).toEqual([]);
    expect(validateMultiSettings(settings(forms))).toBeNull();
  });
  it("소재지를 알 수 없으면(주소 없음) 같은 주택일 수 있어 막지 않고 비차단 고지로 맞춘다", () => {
    const noAddr = { addressJibun: "", addressRoad: "" };
    const forms = [A([], undefined, noAddr), B([], undefined, { addressJibun: "", addressRoad: "" })];
    expect(validateMultiSettings(settings(forms))).toBeNull();
    const issues = collectMultiRosterIssues(props(forms));
    expect(issues.map((i) => [i.kind, i.blocking])).toEqual([["missing_house_empty_roster", false]]);
  });
});

describe("비차단 고지 — 누락형(목록은 있으나 대응 행 없음)·잔존형", () => {
  it("누락형: A 명부에 다른 주택(C)만 있고 B가 없다 → 고지(차단 아님)", () => {
    const forms = [A([row("C", "2010-01-01", { addressJibun: "테스트 C" })]), B([])];
    expect(validateMultiSettings(settings(forms))).toBeNull();
    const n = multiRosterNotices(props(forms));
    expect(n.map((i) => [i.kind, i.propertyId])).toEqual([["missing_house", "p1"]]);
    expect(n[0].message).toContain("소득세법 시행령 §154①");
  });
  it("잔존형: B 명부에 이미 판 A가 남음 → 고지(과대)", () => {
    const forms = [A([rowB()]), B([rowA()])];
    const n = multiRosterNotices(props(forms));
    expect(n.map((i) => [i.kind, i.propertyId])).toEqual([["lingering_house", "p2"]]);
    expect(n[0].message).toContain("이미 양도한 주택");
  });
  it("대응 행은 취득일로 맞춘다 — 취득일이 다르면 다른 주택이다(고지가 남는다)", () => {
    const wrong = row("B", "2018-02-02", { addressJibun: `테스트 ${B_ACQ}` });
    const forms = [A([wrong]), B([])];
    expect(multiRosterNotices(props(forms)).map((i) => i.kind)).toEqual(["missing_house"]);
  });
});

describe("분양권(하위 2 가) — 앞 주택 건 양도일 현재 보유 중인 분양권을 목록에서 빠뜨림", () => {
  const presaleQ = () =>
    mk("2022-02-01", B_TD, [], { householdNoOtherHousesConfirmed: true }, { assetKind: "presale_right", addressJibun: "테스트 분양" });
  it("재현: 분양권을 목록에 넣으면 과세(111,166,000), 빠뜨리면 비과세 0 — §89② 판정이 빠진다", async () => {
    const withRight = A([], { householdNoPresaleRightsConfirmed: false, presaleRights: [{ id: "r", type: "presale_right", acquisitionDate: "2022-02-01", region: "non_capital" }] });
    useRates(A_TD);
    expect((await runMulti([withRight])).totalTax).toBe(111166000);
    useRates(A_TD);
    expect((await runMulti([A([])])).totalTax).toBe(0);
  });
  it("고지한다(비차단): 분양권 양도 건이 같은 신고에 있는데 앞 주택 건의 분양권·입주권 목록에 없다", () => {
    const forms = [A([]), presaleQ()];
    expect(validateMultiSettings(settings(forms))).toBeNull(); // 빈 목록 「없음」은 기존 결정 그대로 — 새 차단 없음
    const n = collectMultiRosterIssues(props(forms)).filter((i) => i.kind === "missing_presale");
    expect(n).toHaveLength(1);
    expect(n[0].blocking).toBe(false);
    expect(n[0].message).toContain("§89②");
  });
  it("긍정 짝: 목록에 그 분양권(취득일 일치)이 있으면 고지하지 않는다", () => {
    const listed = A([], { householdNoPresaleRightsConfirmed: false, presaleRights: [{ id: "r", type: "presale_right", acquisitionDate: "2022-02-01", region: "non_capital" }] });
    expect(collectMultiRosterIssues(props([listed, presaleQ()])).filter((i) => i.kind === "missing_presale")).toEqual([]);
  });
});
