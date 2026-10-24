/**
 * anchor(화면 경로 ⑧→④→⑫⑭→엔진) — §155⑳ **세대 구성**(「장기임대주택과 그 밖의 1주택」) 불성립이어도, 판정 엔진이 임대주택을 센 채
 * 다른 특례(일시적 2주택)로 낸 비과세를 거두지 않는다.
 *
 * 계획서 `docs/00-pm/rental-155-20-composition-revoke.plan.md` · 사용자 결정 2026-10-24 Q-1~Q-3 (a).
 * 근거: 영 §155⑳은 불성립이면 「…보아」가 없을 뿐 · 0584·0029(4주택 → 비과세 아님)는 임대주택을 센 판정과 결론이 같다(CR-5).
 *
 * 시료: 거주주택 2008-01-01 취득 · 거주 2019-06~2024-06 · 2024-06-01 양도 · 비조정. 보유 주택 목록:
 *   임대 행 2023-01-01(일시적 2주택 신규 주택 · 「장기임대」 표시) + 조특법 §98 감면주택 행(⑳과 겹친 해석 미확보 → 세대 구성 불성립).
 *
 * | # | 입력 | 종전 | 지금 |
 * |---|---|---|---|
 * | CR-1 | A 호별 불성립 | 124,366,000 | 0 (= 미선언 짝) |
 * | CR-2 | A 호별 성립 · 세대 구성 불성립 | 124,366,000 | 0 · 구성 불성립 고지 · ㉒·「확인 필요」 없음 |
 * | CR-3 | B 성립 · 세대 구성 불성립 | 60,621,000(사유 「일시적 2주택」 자기모순) | 50,171,000 — 영 §154⑩ 안분(b-154-10 Q-1 (a) · 종전 D12 결과 0 정정) |
 * | CR-4 | CR-2 · 15억 | 282,711,000 | 14,124,000 (= 미선언 짝) · 「확인 필요」 없음 |
 * | CR-5 | 0584형(임대 + 공동상속 소수지분 + 일반 신규) | 124,366,000 | 불변 — 판정 엔진이 과세 |
 * | CR-6 | ⑦1호 상속 농어촌주택 행(⑳ 겹침 해석 미확보) | 124,366,000 | 0 (= 미선언 짝) |
 * | CR-9 | 완공APT(같은 leaf) | 124,366,000 | 미선언 짝과 같음 |
 * | CR-10 | 다른 특례가 없으면(임대 행 2007 취득) | 과세 | 과세 불변 · 구성 「확인 필요」 유지(결론을 가른다) |
 *
 * 부담부증여(증여세 계산기) 경로는 이 결함에 닿지 않는다 — 보유 주택 목록이 없고(`houseRosterInputUnavailable`) 조특법 제외를
 * 항상 비워 보낸다(`gift-burdened-transfer-api.ts` `specialHouseExclusions: []`). 계획서 V-4.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
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
import { makeDefaultRentalUnit } from "@/lib/stores/calc-wizard-asset-factory";
import { runCalc, redevAptForm, houseRow } from "./_helpers/redev-one-house-route";
import { RETURN_TO_FARM_ROW_OK } from "../_helpers/rural-return-to-farm-facts";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});
afterEach(() => vi.unstubAllGlobals());

const NR = "4682025021";
const NC = { region: "non_capital", regionCode: NR, officialPrice: "100000000", isApartment: false, acquisitionOrigin: "general" };
const unit = (price: string) => ({
  ...makeDefaultRentalUnit(),
  businessRegistrationDate: "2023-02-01",
  rentalRegistrationDate: "2023-02-01",
  standardPriceAtRentalStart: price,
  rentalInputMode: "direct" as const,
  rentalMonths: "16",
  requirementsConfirmed: true,
});
const OK = "250,000,000"; // 호별 성립
const FAIL = "700,000,000"; // 임대개시 당시 기준시가 6억 초과 — 호별 불성립
const A = (price = OK) => ({ applyException: true, scenario: "A", rentalUnits: [unit(price)], priorRentalExemptionHistory: "none" });
const B = (price = OK) => ({
  ...A(price),
  scenario: "B",
  priorResidenceTransferDate: "2020-01-01",
  postRegistrationResidenceMonths: "30",
  standardPriceAtAcquisitionForPhrp: "100,000,000",
  standardPriceAtPriorTransfer: "200,000,000",
  standardPriceAtTransferForPhrp: "300,000,000",
});
const rental = (flag = true, acq = "2023-01-01") => houseRow("r1", acq, { ...NC, isLongTermRental: flag } as never);
const SP98 = houseRow("h3", "1996-06-01", {
  ...NC,
  countExclusion: {
    kind: "special",
    special: { article: "unsold_98", houseAcquisitionDate: "1996-06-01", houseContractDate: "1996-06-01", isNationalHousing: false, requirementsConfirmed: true },
  },
} as never);
const CO_INHERITED = houseRow("h3", "2019-06-01", {
  ...NC,
  isInherited: true,
  decedentSameHouseholdAtInheritance: false,
  decedentHouseholdSeparate: true,
  inheritedDate: "2019-06-01",
  isCoInherited: true,
  isLargestCoInheritedShareholder: false,
} as never);
const RURAL_1 = houseRow("h3", "2015-01-01", {
  ...NC,
  regionCode: "4377037000",
  oneHouseRuralHouse: true,
  ruralHouseKind: "inherited",
  ...RETURN_TO_FARM_ROW_OK,
  decedentSameHouseholdAtInheritance: false,
  decedentHouseholdSeparate: true,
  ruralOutsideCapitalEupMyeon: true,
  ruralDecedentResidenceYears: "6",
  ruralLandAreaSqm: "300",
  ruralWholeHouseholdMoved: true,
  ruralHighPriceAtAcquisition: false,
} as never);

type Row = ReturnType<typeof houseRow>;
const calc = (houses: Row[], rhe: object | null, price = "1000000000", kind: "housing" | "redevelopment_apt" = "housing") =>
  runCalc(
    redevAptForm({ kind, price, count: String(1 + houses.length), houses, assetOver: rhe ? { rentalHousingException: rhe } : {} }),
  );
/** ⑳ 미선언 짝 — 임대 행은 「장기임대」 표시를 끈다(선언 없이 표시만 있으면 의미가 없다) */
const undeclared = (houses: Row[], price?: string, kind?: "housing" | "redevelopment_apt") =>
  calc(houses.map((h) => (h.id === "r1" ? { ...h, isLongTermRental: false } : h)), null, price, kind);

const COMPOSITION_HEAD =
  "장기임대주택 거주주택 특례(소득세법 시행령 §155⑳)는 세대 구성 요건(「장기임대주택과 그 밖의 1주택」)을 충족하지 못했습니다";
const REQUIREMENT_HEAD = "장기임대주택 거주주택 특례(소득세법 시행령 §155⑳)는 요건을 충족하지 못해 적용하지 않았습니다";
const w = (r: Awaited<ReturnType<typeof calc>>) => (r.result.warnings ?? []) as string[];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const steps = (r: Awaited<ReturnType<typeof calc>>) => ((r.result.steps ?? []) as any[]).map((s) => `${s.label} :: ${s.formula}`);

describe("§155⑳ 세대 구성 불성립 × 임대주택을 센 다른 특례 — 계산기 화면 경로", () => {
  it("CR-1 ★ A 호별 불성립 + §98 행 → 비과세 0 = 미선언 짝 (종전 124,366,000)", async () => {
    const houses = [rental(), SP98];
    const r = await calc(houses, A(FAIL));
    expect(r.issues).toEqual([]);
    expect(r.result.isExempt).toBe(true);
    expect(r.result.totalTax).toBe(0);
    expect(w(r).filter((x) => x.startsWith(REQUIREMENT_HEAD))).toHaveLength(1);
    expect((await undeclared(houses)).result.totalTax).toBe(0);
  });

  it("CR-2 ★ A 호별 성립 · 세대 구성 불성립 → 비과세 0 · 구성 불성립 고지 · ㉒·「확인 필요」 없음 (종전 124,366,000)", async () => {
    const r = await calc([rental(), SP98], A());
    expect(r.issues).toEqual([]);
    expect(r.result.isExempt).toBe(true);
    expect(r.result.exemptReason).toBe("일시적 2주택 비과세");
    expect(r.result.totalTax).toBe(0);
    const n = w(r).filter((x) => x.startsWith(COMPOSITION_HEAD));
    expect(n).toHaveLength(1);
    expect(n[0]).toContain("조특령 §98②·⑥");
    expect(n[0]).toMatch(/적용한 비과세는 「일시적 2주택 비과세」입니다\.$/);
    expect(w(r).some((x) => x.includes("§155㉒"))).toBe(false);
    expect(w(r).some((x) => x.includes("세대 구성 요건을 충족하지 못해 임대주택을 주택 수에서 뺀 전제"))).toBe(false);
  });

  // B는 ⑳ 세대 구성이 서지 않아도 일시적 2주택으로 1세대1주택이면 영 §154⑩ 안분 대상이다(`rental-155-20-b-154-10-and-q4.plan.md` Q-1 (a)).
  it("CR-3 ★ B 성립 · 세대 구성 불성립 → 영 §154⑩ 안분 50,171,000 (종전 60,621,000 → D12 0 → 정정)", async () => {
    const r = await calc([rental(), SP98], B());
    expect(r.issues).toEqual([]);
    expect(r.result.isExempt).toBe(false);
    expect(r.result.totalTax).toBe(50_171_000);
    expect(steps(r).some((s) => s.startsWith("직전거주주택보유주택 — 영 §154⑩ 안분 :: "))).toBe(true);
    const n = w(r).filter((x) => x.includes("§154⑩에 따라 직전거주주택 양도일 후 기간분만 비과세로 계산했습니다"));
    expect(n).toHaveLength(1);
    expect(n[0]).toContain("조특령 §98②·⑥");
    expect(n[0]).toContain("다른 특례(「일시적 2주택 비과세」)에 따라 1세대1주택이 되지만");
    expect(w(r).some((x) => x.includes("재확인하세요"))).toBe(false);
  });

  it("CR-4 ★ 15억 → 14,124,000 = 미선언 짝 (종전 282,711,000) · 세대 구성 「확인 필요」 없음(결론을 가르지 않는다 — Q-3)", async () => {
    const houses = [rental(), SP98];
    const r = await calc(houses, A(), "1500000000");
    expect(r.result.isPartialExempt).toBe(true);
    expect(r.result.totalTax).toBe(14_124_000);
    expect((await undeclared(houses, "1500000000")).result.totalTax).toBe(14_124_000);
    expect(steps(r).some((s) => s.startsWith("장기임대주택 거주주택 비과세 특례 — 확인 필요"))).toBe(false);
    expect(w(r).filter((x) => x.startsWith(COMPOSITION_HEAD))).toHaveLength(1);
  });

  it("CR-5 0584형(임대 2016 + 공동상속 소수지분 + 일반 2023 신규) → 과세 124,366,000 불변 — 3중첩 불허 결론은 판정 엔진이 낸다", async () => {
    const houses = [rental(true, "2016-01-01"), CO_INHERITED, houseRow("n1", "2023-01-01", NC as never)];
    const r = await calc(houses, A());
    expect(r.issues).toEqual([]);
    expect(r.result.isExempt).toBe(false);
    expect(r.result.totalTax).toBe(124_366_000);
    expect((await undeclared(houses)).result.totalTax).toBe(124_366_000);
  });

  it("CR-6 ⑦1호 상속 농어촌주택 행(⑳ 겹침 해석 미확보) → 미선언 짝과 같은 비과세", async () => {
    const houses = [rental(), RURAL_1];
    const r = await calc(houses, A());
    expect(r.issues).toEqual([]);
    const none = await undeclared(houses);
    expect(none.result.isExempt).toBe(true);
    expect(r.result.isExempt).toBe(true);
    expect(r.result.exemptReason).toBe(none.result.exemptReason);
    expect(r.result.totalTax).toBe(none.result.totalTax);
  });

  it("CR-10 다른 특례가 없으면(임대 행 2007 취득 — 일시적 2주택 아님) 과세 불변 · 세대 구성 「확인 필요」는 결론을 가르므로 유지", async () => {
    const r = await calc([rental(true, "2007-01-01"), SP98], A());
    expect(r.issues).toEqual([]);
    expect(r.result.isExempt).toBe(false);
    expect(steps(r).some((s) => s.startsWith("장기임대주택 거주주택 비과세 특례 — 확인 필요"))).toBe(true);
    expect(w(r).filter((x) => x.startsWith(COMPOSITION_HEAD))).toEqual([]);
  });

  it("CR-9 완공APT(같은 leaf) → 미선언 짝과 같은 비과세 · 구성 불성립 고지", async () => {
    const houses = [rental(), SP98];
    const r = await calc(houses, A(), "1000000000", "redevelopment_apt");
    expect(r.issues).toEqual([]);
    const none = await undeclared(houses, "1000000000", "redevelopment_apt");
    expect(none.result.isExempt).toBe(true);
    expect(r.result.isExempt).toBe(true);
    expect(r.result.totalTax).toBe(none.result.totalTax);
    expect(w(r).filter((x) => x.startsWith(COMPOSITION_HEAD))).toHaveLength(1);
  });
});
