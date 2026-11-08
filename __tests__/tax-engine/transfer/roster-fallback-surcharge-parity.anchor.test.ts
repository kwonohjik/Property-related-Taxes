/**
 * 명부 없는 fallback 중과 = 명부(정밀) 경로 — 리뷰 US-08 · US-38 · US-35(엔진).
 *
 * 계획서: `docs/00-pm/roster-fallback-surcharge-bundle.plan.md`. 기대값은 같은 입력에 `houses[]`(양도 주택 행 + 다른 주택)를 실어
 * 정밀 경로로 계산해 얻는다(출력 베끼기 아님). 실측(수정 전): US-08 2주택 367,961,000 ↔ 236,511,000 · US-38 2주택 247,016,000 ↔ 99,913,000.
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { makeMockRates, makeMockRatesWithHouseEngine, baseTransferInput, makeHouseInfo } from "../_helpers/mock-rates";

const rates = makeMockRatesWithHouseEngine();
const UNSOLD_983 = {
  type: "unsold_98_3",
  residencyType983: "resident",
  houseType983: "purchased",
  contractDate983: new Date("2009-06-15"),
  isOutsideSeoulNotDesignated983: true,
  isOverconcentration983: true,
  landAreaSqm983: 100,
  floorAreaSqm983: 84,
  isUnsoldConfirmed983: true,
  isFirstContract983: true,
  isNotOccupiedAtContract983: true,
  isNotRecontract983: true,
  standardPriceAtAcquisition983: 200_000_000,
  standardPriceAt5Years983: 300_000_000,
  standardPriceAtTransfer983: 400_000_000,
};
type Over = { reductions?: unknown[]; sellingSelfDeclared5ho?: boolean };
const input = (acq: string, n: number, roster: boolean, over: Over = {}): TransferTaxInput =>
  baseTransferInput({
    propertyType: "housing",
    transferPrice: 900_000_000,
    acquisitionPrice: 300_000_000,
    acquisitionDate: new Date(acq),
    transferDate: new Date("2026-07-01"),
    isRegulatedArea: true,
    householdHousingCount: n,
    isOneHousehold: true,
    residencePeriodMonths: 0,
    reductions: (over.reductions ?? []) as never,
    ...(roster
      ? {
          sellingHouseId: "s",
          houses: [
            makeHouseInfo("s", { acquisitionDate: new Date(acq), regionCode: "4129010100", ...(over.sellingSelfDeclared5ho ? { isTaxSpecialExemption: true } : {}) } as never),
            ...Array.from({ length: n - 1 }, (_, i) => makeHouseInfo(`o${i}`, { acquisitionDate: new Date("1990-01-01") } as never)),
          ],
        }
      : {}),
  } as Partial<TransferTaxInput>);
const calc = (i: TransferTaxInput) => calculateTransferTax(i, rates);
const hasExclusionStep = (r: ReturnType<typeof calc>) => r.steps.some((s) => s.label.includes("감면주택 다주택 중과 배제"));

describe("US-08 — fallback도 부칙 제9270호 §14① 위기취득(2009.3.16~2012.12.31) 세율 배제를 본다", () => {
  it.each([2, 3])("F-1: 🔴 2009-12-01 취득 · %i주택 — fallback = 명부 (세율 기본 · 장특 배제 유지)", (n) => {
    const roster = calc(input("2009-12-01", n, true));
    const fb = calc(input("2009-12-01", n, false));
    expect(roster.appliedRate).toBe(0.42);
    expect(fb.appliedRate).toBe(roster.appliedRate);
    expect(fb.longTermHoldingDeduction).toBe(0);
    expect(fb.totalTax).toBe(roster.totalTax);
    // 다건 §104⑤ 그룹 분류가 읽는 표지 — 명부 경로와 같다
    expect(fb.rateSurchargeStatutoryExcluded).toBe(true);
    expect(roster.rateSurchargeStatutoryExcluded).toBe(true);
  });

  it.each([2, 3])("F-1b: 대조 — 창 밖(2013-01-02) %i주택은 두 경로 모두 중과(불변)", (n) => {
    const roster = calc(input("2013-01-02", n, true));
    const fb = calc(input("2013-01-02", n, false));
    expect(fb.appliedRate).toBe(n >= 3 ? 0.72 : 0.62);
    expect(fb.totalTax).toBe(roster.totalTax);
  });

  it("F-1c: 조정대상지역이 아니면 창 안이어도 원래 중과가 없다(불변)", () => {
    const fb = calc({ ...input("2009-12-01", 2, false), isRegulatedArea: false });
    expect(fb.longTermHoldingDeduction).toBeGreaterThan(0);
    expect(fb.rateSurchargeStatutoryExcluded).toBeUndefined();
  });
});

describe("US-38 — fallback도 STEP 0.45 감면주택 중과 배제(영 §167의3①5호·§167의10①2호)를 본다", () => {
  it.each([2, 3])("F-2: 🔴 §98의3 적격 · %i주택 — fallback = 명부 (세율·장특 함께 배제 · 배제 단계)", (n) => {
    const roster = calc(input("2010-01-15", n, true, { reductions: [UNSOLD_983] }));
    const fb = calc(input("2010-01-15", n, false, { reductions: [UNSOLD_983] }));
    expect(hasExclusionStep(roster)).toBe(true);
    expect(roster.totalTax).toBe(99_913_000);
    expect(fb.totalTax).toBe(roster.totalTax);
    expect(fb.appliedRate).toBe(roster.appliedRate);
    expect(fb.longTermHoldingDeduction).toBe(roster.longTermHoldingDeduction);
    expect(hasExclusionStep(fb)).toBe(true);
    // 중과를 걸지 않았으니 「목록이 없어 중과를 적용했다」 고지도 없다
    expect(fb.warnings?.some((w) => w.includes("다른 보유 주택 목록이 입력되지 않아"))).toBeFalsy();
  });

  it("F-2b: 대조 — §98의3 부적격(계약 창 밖)이면 fallback은 종전대로 중과", () => {
    const bad = { ...UNSOLD_983, contractDate983: new Date("2010-03-01") };
    const fb = calc(input("2010-05-01", 2, false, { reductions: [bad] }));
    expect(hasExclusionStep(fb)).toBe(false);
    expect(fb.longTermHoldingDeduction).toBe(0);
  });
});

describe("US-35 엔진 — 하이브리드 5년 후 양도에서 양도시 기준시가만 없으면 감면주택 중과 배제는 유지(차감 0)", () => {
  const NO_TRANSFER_STD = { ...UNSOLD_983, standardPriceAtTransfer983: undefined };
  it.each([true, false])("F-3: 🔴 명부=%s — 배제 단계 · 차감 0 + MISSING_STD_PRICE = 「5호 선언 배제 · 감면 없음」과 같은 세액", (roster) => {
    const r = calc(input("2010-01-15", 2, roster, { reductions: [NO_TRANSFER_STD] }));
    expect(r.unsold983Detail?.isEligible).toBe(false);
    expect(r.unsold983Detail?.ineligibleReasons.map((x) => x.code)).toEqual(["MISSING_STD_PRICE"]);
    expect(hasExclusionStep(r)).toBe(true);
    // 반사실 기준값 — 같은 주택을 5호 선언으로 배제하고 감면 입력 없이 계산(차감 0 · 중과 배제)
    const ref = calc(input("2010-01-15", 2, true, { sellingSelfDeclared5ho: true }));
    expect(r.totalTax).toBe(ref.totalTax);
  });

  it("F-3b: 대조 — 요건 자체가 부적격이면(계약 창 밖) 양도시 기준시가가 없어도 배제하지 않는다", () => {
    const r = calc(input("2010-05-01", 2, true, { reductions: [{ ...NO_TRANSFER_STD, contractDate983: new Date("2010-03-01") }] }));
    expect(hasExclusionStep(r)).toBe(false);
  });
});

describe("US-19 — 5호 자기 선언 + §98 계열 감면 부적격은 계산은 그대로 두고 알린다 · 배제 사유 문구가 출처를 구분한다", () => {
  const BAD = { ...UNSOLD_983, contractDate983: new Date("2010-03-01") }; // 거주자 계약 창(2009.2.12~2010.2.11) 밖
  const NOTICE = "조특법 감면주택」으로 선언해 다주택 중과에서 뺐지만";
  const detailOf = (r: ReturnType<typeof calc>) => r.multiHouseSurchargeDetail?.exclusionReasons.find((x) => x.type === "tax_special_exemption")?.detail;
  const warned = (r: ReturnType<typeof calc>) => (r.multiHouseSurchargeDetail?.warnings ?? []).some((w) => w.includes(NOTICE));

  it("N-1: 🔴 부적격 §98의3 + 5호 선언 → 고지 · 선언 문구 · 세액은 선언만 한 경우와 같다(계산 불변)", () => {
    const r = calc(input("2010-05-01", 2, true, { reductions: [BAD], sellingSelfDeclared5ho: true }));
    expect(r.unsold983Detail?.isEligible).toBe(false);
    expect(warned(r)).toBe(true);
    expect(detailOf(r)).toContain("선언으로 적용");
    expect(r.totalTax).toBe(calc(input("2010-05-01", 2, true, { sellingSelfDeclared5ho: true })).totalTax);
  });

  it("N-2: 짝 — 적격 §98의3이면 자동 판정 문구 · 고지 없음", () => {
    const r = calc(input("2010-01-15", 2, true, { reductions: [UNSOLD_983] }));
    expect(detailOf(r)).toContain("요건 판정으로 적용");
    expect(warned(r)).toBe(false);
  });

  it("N-3: 짝 — 감면 입력 없이 선언만(판정 메뉴에서 넘어온 형태 · §77 등 다른 근거)은 고지 없음", () => {
    const r = calc(input("2010-05-01", 2, true, { sellingSelfDeclared5ho: true }));
    expect(detailOf(r)).toContain("선언으로 적용");
    expect(warned(r)).toBe(false);
  });
});

/**
 * 12의2 한시배제의 보유 2년 요건 — fallback도 본다(계획서 `carryover-surcharge-suspension-holding.plan.md`).
 * 종전 fallback은 양도일 창만 봐 보유 1~2년 양도에도 한시배제를 켜 §104⑦ 비교과세(단기 60% ↔ 기본+20%p)가 빠졌다.
 * 실측(수정 전): 2025-01-01 취득 · 15억/1억 · 양도 2026-03-01 — fallback 838,500,000(0.60) ↔ 명부 842,435,000(0.65).
 * §95④ 보유기간은 초일 산입이다(`meetsSurchargeSuspensionHolding` — 2024-03-02 취득 → 2026-03-01 양도 = 2년).
 */
describe("12의2 보유 2년 — fallback = 명부", () => {
  const rates12 = makeMockRatesWithHouseEngine();
  (rates12 as Map<string, unknown>).set("transfer:surcharge:_default", makeMockRates().get("transfer:surcharge:_default" as never)); // 한시배제(~2026-05-09) 있는 세율표
  const holdInput = (acq: string, roster: boolean): TransferTaxInput => ({
    ...input(acq, 2, roster),
    transferPrice: 1_500_000_000,
    acquisitionPrice: 100_000_000,
    transferDate: new Date("2026-03-01"),
  });
  const calc12 = (i: TransferTaxInput) => calculateTransferTax(i, rates12);

  it.each([
    ["2025-01-01", 842_435_000, false],
    ["2024-03-03", 842_435_000, false],
    ["2024-03-02", 562_935_000, true], // 보유 2년(초일 산입) — 한시배제 · 3년 미만이라 장특 0,
    ["2023-01-01", 525_135_000, true],
  ] as const)("F-4: %s 취득 → fallback = 명부 %i (한시배제 %s)", (acq, tax, suspended) => {
    const roster = calc12(holdInput(acq, true));
    const fb = calc12(holdInput(acq, false));
    expect([roster.determinedTax, roster.isSurchargeSuspended === true]).toEqual([tax, suspended]);
    expect([fb.determinedTax, fb.isSurchargeSuspended === true]).toEqual([tax, suspended]);
  });
});
