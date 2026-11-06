/**
 * NH-33(Q-14 (a)) · NH-75 — 겸용주택 경로가 조특법 §99·§99의3 양도소득금액 차감을 **주택분에서 계산**한다.
 *
 * 종전: 겸용 경로는 §99·§99의3 선택을 «차감형은 계산하지 않고 고지»로만 다뤘다(같은 함수의 §97의5 감면 대상 소득은 주택분으로 한정해 계산).
 * 선택한 감면 패널 입력(15개 이상 칸)은 ⑫·⑭를 지나 엔진 입력(`asset.reductions`)까지 오지만 읽히지 않고 버려졌다(NH-75).
 *
 * 세율표는 mock(`makeMockRatesWithHouseEngine`) — 정본 세액이 아니다. 시료: 리뷰 case14(23억 → 11억으로 줄임), 2026.6.1. 양도, 건물·토지 2003.9.1. 취득.
 *
 * | 시료 | 수정 전 총부담 | 수정 후 총부담 | 차이 |
 * |---|---|---|---|
 * | 감면 미선택(대조) | 222,176,600 | 222,176,600 | 0 |
 * | §99의3 선택(계약 2002.3.1. · 기준시가 1억→2억→4억) | 222,176,600 | 179,169,333 | −43,007,267 (리뷰 case14 «중과 없음» 열과 같다) |
 * | §99 선택(계약 1998.6.1. · 1999.1.1. 취득) | 222,176,600 | 170,807,183 | −51,369,417 |
 * | 3주택 조정 + §99의3 | 222,176,600 (NH-09 이후) | 179,169,333 | −43,007,267 |
 */
import { describe, it, expect } from "vitest";
import { calcMixedUseTransferTaxIdN as calcMixed } from "../_helpers/mixed-use-identity-std";
import { makeHouseInfo, makeMockRatesWithHouseEngine } from "../_helpers/mock-rates";
import { mixedUseCase14 } from "../_helpers/mixed-use-fixture";
import { buildTotalTax } from "@/lib/tax-engine/transfer-tax-mixed-use-totals";
import { applyHousingIncomeDeduction } from "@/lib/tax-engine/transfer-tax-mixed-use-income-deduction";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";

const D = (s: string) => new Date(s);
const rates = makeMockRatesWithHouseEngine();
const TD = D("2026-06-01");
const PRICE = 1_100_000_000;

const mh = (n: number, sellingOver: Record<string, unknown> = {}) => ({
  houses: [
    makeHouseInfo("selling", sellingOver as never),
    ...Array.from({ length: n - 1 }, (_, i) => makeHouseInfo(`h${i + 2}`, { acquisitionDate: D("2015-03-01") })),
  ],
  sellingHouseId: "selling",
  presaleRights: [],
  isOneHousehold: true,
  isRegulatedArea: true,
});
const r993 = (over: Record<string, unknown> = {}) => ({
  type: "new_99_3", contractDate993: D("2002-03-01"), acquisitionType993: "from_builder", firstContract993: "yes" as const,
  region993: "outside_speculation", standardPriceAtAcquisition993: 100_000_000, standardPriceAt5Years: 200_000_000,
  standardPriceAtTransfer993: 400_000_000, exclusiveAreaSqm993: 84, ...over,
});
const r99 = (over: Record<string, unknown> = {}) => ({
  type: "new_99", contractDate99: D("1998-06-01"), acquisitionType99: "from_builder", firstContract99: "yes" as const, isNationalHousing99: false,
  standardPriceAtAcquisition99: 100_000_000, standardPriceAt5Years99: 160_000_000, standardPriceAtTransfer99: 250_000_000, exclusiveAreaSqm99: 84, ...over,
});
const LATE = { buildingAcquisitionDate: D("2003-09-01"), landAcquisitionDate: D("2003-09-01") };
const EARLY = { buildingAcquisitionDate: D("1999-01-01"), landAcquisitionDate: D("1999-01-01") };

function run(over: Record<string, unknown>, price = PRICE) {
  return calcMixed(price, TD, { ...mixedUseCase14(), isOneHouseExempt: false, ...LATE, ...over } as unknown as MixedUseAssetInput, rates);
}
const payable = (r: ReturnType<typeof run>) => r.total.totalPayable;
const deductionStep = (r: ReturnType<typeof run>) => r.steps.find((s) => s.id === "income-deduction-new-housing");
const notReflected = (r: ReturnType<typeof run>) => r.warnings.filter((w) => w.includes("반영되지 않았습니다"));

describe("NH-33 §99의3·§99 — 주택분 양도소득금액 차감", () => {
  const control = run({});

  it("A1 §99의3(5년 후 기준시가 안분): 산출세액 201,978,728 → 154,192,876 · 총부담 222,176,600 → 179,169,333(−43,007,267)", () => {
    const r = run({ reductions: [r993()] });
    expect(payable(control)).toBe(222_176_600);
    expect(r.total.transferTax).toBe(154_192_876);
    expect(r.total.incomeDeduction).toMatchObject({
      appliedId: "new_99_3",
      reducibleIncome: 116_140_971,
      taxBeforeDeduction: 201_978_728,
      taxReduction: 47_785_852,
    });
    // 농특세 = 감면세액(차감 전·후 산출세액 차) × 20% — 단건 STEP 7.5와 같은 산식
    expect(r.total.incomeDeduction?.ruralSurtax).toBe(9_557_170);
    expect(r.total.ruralSurtax).toBe(9_557_170);
    expect(payable(r)).toBe(179_169_333);
    expect(payable(control) - payable(r)).toBe(43_007_267);
  });

  it("A2 §99(1998 계약 · 1999 취득): 총부담 170,807,183 · 차감 139,369,166", () => {
    const r = run({ ...EARLY, reductions: [r99()] });
    expect(r.total.incomeDeduction).toMatchObject({ appliedId: "new_99", reducibleIncome: 139_369_166 });
    expect(r.total.ruralSurtax).toBe(11_415_426);
    expect(payable(r)).toBe(170_807_183);
  });

  it("A3 차감은 주택분에서만 — 주택분·상가분의 표시 소득금액은 그대로이고, 합산 소득만 차감액만큼 줄어든다", () => {
    const r = run({ reductions: [r993()] });
    expect(r.housingPart.incomeAmount).toBe(control.housingPart.incomeAmount);
    expect(r.commercialPart.incomeAmount).toBe(control.commercialPart.incomeAmount);
    expect(r.total.aggregateIncome).toBe(control.total.aggregateIncome - 116_140_971);
  });

  it("A4 step·상세 echo — 단건 STEP 4.6과 같은 라벨·산식, `reductionDetails`에 §99의3 상세가 실린다", () => {
    const r = run({ reductions: [r993()] });
    const step = deductionStep(r);
    expect(step?.title).toBe("§99의3 신축주택 과세특례 — 양도소득금액 차감 (주택분)");
    expect(step?.values[0].label).toContain("감면 양도소득금액 116,140,971");
    expect(r.total.reductionDetails?.new993Detail?.isEligible).toBe(true);
    expect(r.total.reductionDetails?.new993Detail?.ruralSurtax).toBe(9_557_170);
    // 이 조문은 더 이상 «반영되지 않았습니다» 고지 대상이 아니다
    expect(notReflected(r)).toHaveLength(0);
  });

  it("A5 5년 이내 양도: 주택분 양도소득금액 전액 차감 — 합산 소득은 상가분뿐", () => {
    const base = { buildingAcquisitionDate: D("2023-06-01"), landAcquisitionDate: D("2023-06-01") };
    const ctl = run(base);
    const r = run({ ...base, reductions: [r993()] });
    expect(r.total.incomeDeduction?.reducibleIncome).toBe(r.housingPart.incomeAmount);
    expect(r.total.aggregateIncome).toBe(r.commercialPart.incomeAmount);
    expect(payable(r)).toBeLessThan(payable(ctl));
  });
});

describe("NH-33 × 다주택 중과 배제(NH-09) 결합", () => {
  it("B1 3주택 조정 + §99의3: 중과 배제 + 차감 = 양도 주택 5호 수동 토글 대조 = 179,169,333 (감면 미선택 423,062,208)", () => {
    const control = run({ multiHouse: mh(3) });
    const selected = run({ multiHouse: mh(3), reductions: [r993()] });
    const manual = run({ multiHouse: mh(3, { isTaxSpecialExemption: true }), reductions: [r993()] });
    expect(payable(control)).toBe(423_062_208);
    expect(payable(selected)).toBe(payable(manual));
    expect(payable(selected)).toBe(179_169_333);
    expect(selected.multiHouseSurcharge?.surchargeType).toBe("none");
  });

  it("B2 중과 배제 고지는 §99의3에서 «차감 미반영» 문구를 붙이지 않는다", () => {
    const r = run({ multiHouse: mh(3), reductions: [r993()] });
    const notice = r.warnings.find((w) => w.includes("다주택 중과 배제를 반영"));
    expect(notice).toBeDefined();
    expect(notice).not.toContain("차감은 반영하지 않으므로");
  });
});

describe("NH-33 짝 — 차감이 없어야 하는 경우는 감면 미선택 대조와 같다", () => {
  const control = run({});

  it("C1 계약일이 §99의3 기간 밖: 불성립 — 총부담 = 대조, step에 사유", () => {
    const r = run({ reductions: [r993({ contractDate993: D("2005-03-01") })] });
    expect(payable(r)).toBe(payable(control));
    expect(r.total.incomeDeduction).toBeUndefined();
    expect(deductionStep(r)?.title).toContain("적용 불가");
    expect(deductionStep(r)?.values[0].label).toContain("시한 외");
  });

  it("C2 미등기양도(조특법 §129②): 감면 미적용 — 미등기 대조와 같다", () => {
    const base = run({ isUnregistered: true });
    const r = run({ isUnregistered: true, reductions: [r993()] });
    expect(payable(r)).toBe(payable(base));
    expect(r.total.incomeDeduction).toBeUndefined();
    expect(deductionStep(r)).toBeUndefined();
  });

  it("C3 주택분 전부 비과세(12억 이하 1세대1주택): 차감할 소득이 없다 — 대조와 같다", () => {
    const base = run({ isOneHouseExempt: true });
    const r = run({ isOneHouseExempt: true, reductions: [r993()] });
    expect(r.housingPart.incomeAmount).toBe(0);
    expect(payable(r)).toBe(payable(base));
    expect(r.total.ruralSurtax).toBe(0);
  });

  it("C4 §98의3 등 나머지 차감형은 종전대로 «반영되지 않았습니다» 고지만 — 총부담 = 대조", () => {
    const r = run({ reductions: [{ type: "unsold_98_3" }] });
    expect(payable(r)).toBe(payable(control));
    expect(notReflected(r)).toHaveLength(1);
  });

  it("C5 §99의3 + §98의3 동시 선택: §99의3은 계산하고 §98의3만 고지한다", () => {
    const r = run({ reductions: [r993(), { type: "unsold_98_3" }] });
    expect(payable(r)).toBe(179_169_333);
    expect(notReflected(r)).toHaveLength(1);
    expect(notReflected(r)[0]).toContain("1건");
  });

  it("C6 고가주택 판정 가액 초과(§99 1998 계약 · 170㎡): 불성립 — 대조와 같다", () => {
    const ctl = run({ ...EARLY }, 3_000_000_000);
    const r = run({ ...EARLY, reductions: [r99({ exclusiveAreaSqm99: 170 })] }, 3_000_000_000);
    expect(payable(r)).toBe(payable(ctl));
  });
});

describe("NH-75 선택한 §99·§99의3 입력이 실제로 계산에 쓰인다(더 이상 버려지지 않는다)", () => {
  const base = payable(run({ reductions: [r993()] }));
  const cases: [string, Record<string, unknown>][] = [
    ["취득시 기준시가(standardPriceAtAcquisition993)", { standardPriceAtAcquisition993: 50_000_000 }],
    ["5년 시점 기준시가(standardPriceAt5Years)", { standardPriceAt5Years: 300_000_000 }],
    ["양도시 기준시가(standardPriceAtTransfer993)", { standardPriceAtTransfer993: 300_000_000 }],
    ["매매계약일(contractDate993) 시한 밖", { contractDate993: D("2005-03-01") }],
    ["최초 매매계약 여부(firstContract993)", { firstContract993: "no" }],
    ["계약 당시 입주 사실(hasOccupancyAtContract)", { hasOccupancyAtContract: true }],
  ];
  it.each(cases)("D 입력 %s 를 바꾸면 겸용 총부담이 달라진다", (_label, patch) => {
    expect(payable(run({ reductions: [r993(patch)] }))).not.toBe(base);
  });
});

describe("NH-33 파트 간 차손 통산 — 시행령 §167의2② 안분(다건 합산과 같은 leaf)", () => {
  it("E1 `applyHousingIncomeDeduction`: 통산 전 100 · 통산 후 60 · 차감 50 → 안분 후 차감 30(손 계산 50 − ⌊40×50÷100⌋ = 30)", () => {
    const r = applyHousingIncomeDeduction({ reducible: 50, housingBeforeOffset: 100, housingAfterOffset: 60 });
    expect(r.applied).toBe(30);
    expect(r.housingIncome).toBe(30);
  });

  it("E2 차손 없으면 안분 없음 · 차감은 통산 후 주택분 소득을 넘지 못한다", () => {
    expect(applyHousingIncomeDeduction({ reducible: 40, housingBeforeOffset: 100, housingAfterOffset: 100 }).applied).toBe(40);
    expect(applyHousingIncomeDeduction({ reducible: 500, housingBeforeOffset: 100, housingAfterOffset: 100 }).applied).toBe(100);
    expect(applyHousingIncomeDeduction({ reducible: 40, housingBeforeOffset: 0, housingAfterOffset: 0 }).applied).toBe(0);
  });

  it("E3 `buildTotalTax` 통합: 주택분 1억 · 상가건물 −4천만 · 차감 5천만 → 통산 후 6천만에서 안분 후 3천만 차감, 합산 소득 3천만", () => {
    const brackets = parseRatesFromMap(rates).brackets;
    const resolution = { appliedId: "new_99_3" as const, reducible: 50_000_000, stepLabel: "§99의3", legalBasis: "" };
    const parts = [
      { kind: "housing" as const, income: 100_000_000, holdingYears: 20 },
      { kind: "commercial_building" as const, income: -40_000_000, holdingYears: 20 },
    ];
    const t = buildTotalTax(100_000_000, -40_000_000, 0, brackets, 2_500_000, parts, false, undefined, resolution);
    expect(t.partLossOffset?.[0]).toMatchObject({ from: "commercial_building", to: "housing", amount: 40_000_000 });
    expect(t.incomeDeduction?.reducibleIncome).toBe(30_000_000);
    expect(t.aggregateIncome).toBe(30_000_000);
    const noDeduction = buildTotalTax(100_000_000, -40_000_000, 0, brackets, 2_500_000, parts);
    expect(noDeduction.aggregateIncome).toBe(60_000_000);
    expect(t.incomeDeduction?.taxBeforeDeduction).toBe(noDeduction.transferTax);
  });
});
