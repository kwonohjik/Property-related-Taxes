/**
 * anchor — 이월과세 × 당초 증여 채무 부분(매입분) PR-2: 일반건물 파트(E2) 엔진 레벨.
 * 설계서 `docs/02-design/features/carryover-gift-debt-purchased-part-parts.engine.design.md` §2·§3·§4·§9.1.
 *
 * 엔진 모양 `landCarryoverTaxation`/`buildingCarryoverTaxation`에 `giftAssumedDebt`를 직접 얹어 카드 조립 이후(R2·R3·R4)를 본다.
 * 와이어(⑫ → R1 합성기)는 `__tests__/api/transfer.route.carryover-debt-parts.anchor.test.ts`가 본다.
 * 세액은 `makeMockRates()` 기준이다. 「손계산」 값은 엔진과 따로 계산해 일치를 확인한 것이다.
 *
 * 🔴 **2026-10-28 갱신 — 매입분 필요경비에서 환산 개산공제가 빠졌다** (계획서 `docs/00-pm/gb-estimated-carryover-scenario-a-capex.plan.md` §11, PR-2).
 * 매입분은 `buildInputB`로 만든다(`carryover-debt-pieces.ts`). 종전에는 일반건물 카드가 이월과세여도 `capitalExpenditure`를 싣지 않아 매입분 필요경비가
 * 카드 스칼라 `expenses`의 몫 = 본인 환산의 **개산공제**(설계서 V-2 「환산 개산공제를 실가 취득가액에 붙임」)였다. 매입분의 취득가액은 채무(실지거래가액)라
 * 「소득세법」 제97조제2항**제1호**(제1항제2호·제3호 = 본인 자본적지출·양도비뿐)이고 개산공제는 같은 항 제2호(환산 등) 몫이라 근거가 없다.
 * PR-2가 이월과세 카드에 본인 직접귀속 나목을 `capitalExpenditure`로 명시(0도 0)해 싣자 매입분이 그 규칙을 따른다 — 본인 지출 0 이면 매입분 필요경비 0.
 * 아래 갱신값은 전부 같은 원인(매입분 개산공제 제거)이며, 증여분 카드의 양도차익·필요경비는 불변이다(카드별 덤프로 확인).
 * 건별 검증: 세액 증가 = (제거된 매입분 개산공제) × (그 소득이 속한 한계세율 또는 장특 후 비율).
 */
import { describe, it, expect } from "vitest";
import { calculateGeneralBuildingTransfer } from "@/app/api/calc/transfer/general-building-route-helper";
import { makeMockRates } from "@/__tests__/tax-engine/_helpers/mock-rates";
import { carryoverDebtPiecesUnsupportedReason, DEBT_PIECES_REASON } from "@/lib/tax-engine/carryover-debt-pieces-scope";
import { shareIndexOf, cardSuffixOf, isSameShare, purchasedPartIdOf, isPurchasedPieceId, purchasedPartParentIdOf, baseCardId } from "@/lib/tax-engine/general-building-share-id";

const rates = makeMockRates();

// ─── 공통 사례(설계서 §4): 총 3.3억 · 증여 2020-03-17 · 증여자 1995-06-15 취득 5천만 · 평가액 2억 · 증여세 상당액 5천만 ───
const CT = {
  giftRegistryDate: new Date("2020-03-17"),
  donorAcquisitionDate: new Date("1995-06-15"),
  donorAcquisitionPrice: 50_000_000,
  useEstimatedAcquisition: false,
  giftTaxAmount: 50_000_000,
  giftDateValuation: 200_000_000,
};
const withDebt = (debt: number | undefined, over: Record<string, unknown> = {}) => ({ ...CT, ...(debt === undefined ? {} : { giftAssumedDebt: debt }), ...over });

const BASE = {
  totalTransferPrice: 330_000_000,
  transferDate: new Date("2022-10-11"),
  buildingArea: 83.73,
  buildingFootprintArea: 57,
  transferLandPricePerSqm: 5_956_000,
  transferBuildingStdPrice: 12_308_310,
  acquisitionLandPricePerSqm: 1_400_000,
  acquisitionBuildingStdPrice: 16_997_190,
  zoneType: "general_residential",
  isMetropolitan: true,
};
const LAND_ONLY = { landArea: 57, acquisitionDate: new Date("2020-03-17"), buildingAcquisitionDate: new Date("2002-01-01"), buildingAcquisitionCause: "purchase" as const, landAcquisitionCause: "carryover_gift" as const };

function run(over: Record<string, unknown>, base: Record<string, unknown> = BASE) {
  const { aggregated } = calculateGeneralBuildingTransfer({ ...base, ...over } as never, 2022, 0, [], rates);
  const card = (id: string) => aggregated.properties.find((p) => p.propertyId === id);
  return { det: aggregated.determinedTax, ids: aggregated.properties.map((p) => p.propertyId), card, aggregated };
}

describe("E2-1 · 2-way 환산 · 토지 파트 · 증여자 실가", () => {
  it("채무 OFF 35,488,448 (회귀) → 채무 8천만 25,763,533 · 증여분 + 매입분 꼬리 [손계산 ✓ 설계서 P1 + 매입분 개산공제 제거 957,600 × 35%]", () => {
    expect(run({ ...LAND_ONLY, landCarryoverTaxation: withDebt(undefined) }).det).toBe(35_488_448);
    const r = run({ ...LAND_ONLY, landCarryoverTaxation: withDebt(80_000_000) });
    // 종전 25,428,373 = 매입분 필요경비가 개산공제 957,600(= 토지 개산공제 2,394,000 − 증여분 몫 60% 1,436,400)였다. 지금은 0 → 매입분 양도차익 +957,600 · 보유 2년 6개월 장특 0 ·
    // 35% 구간(88M~150M) → +957,600 × 35% = +335,160 → 25,763,533.
    expect(r.det).toBe(25_763_533);
    expect(r.card("land__purchased")!.necessaryExpense).toBe(0);
    expect(r.ids).toEqual(["land", "building", "land__purchased"]);
    const s = r.card("land")!.carryoverTaxationDetail!.scenarioA.purchasedPartSplit!;
    expect(s).toMatchObject({ debtAmount: 80_000_000, giftValuation: 200_000_000 });
    expect(s.gift!.acquisitionPrice).toBe(30_000_000);
    expect(s.purchased).toMatchObject({ propertyId: "land__purchased", acquisitionPrice: 80_000_000, acquisitionDate: "2020-03-17" });
  });

  it("증여자 환산취득가액(분자 3천만) OFF 40,928,847 → 채무 8천만 28,844,511 [손계산 ✓ 설계서 P2 + 매입분 개산공제 제거 +335,160]", () => {
    const est = (debt?: number) => run({ ...LAND_ONLY, landCarryoverTaxation: withDebt(debt, { useEstimatedAcquisition: true, donorAcquisitionPrice: undefined, donorStandardPriceAtAcquisition: 30_000_000 }) });
    expect(est(undefined).det).toBe(40_928_847);
    expect(est(80_000_000).det).toBe(28_844_511); // 종전 28,509,351 + 957,600 × 35%
  });
});

describe("E2-2 · 토지 사업용·비사업용 분할 — 채무도 면적 비율로(R2)", () => {
  const SPLIT = { ...LAND_ONLY, landArea: 570 };
  it("채무 OFF 39,606,565 (회귀 · 손계산 ✓) → 채무 8천만 30,115,452 (§104⑤ 1호/2호 max 손계산 ✓ · 매입분 개산공제 제거)", () => {
    expect(run({ ...SPLIT, landCarryoverTaxation: withDebt(undefined) }).det).toBe(39_606_565);
    const r = run({ ...SPLIT, landCarryoverTaxation: withDebt(80_000_000) });
    // 채무를 면적으로 안 자르면 두 카드가 8천만을 각각 받아 20,051,350(오답)이 된다
    // 종전 26,763,852. 매입분 2장의 필요경비 개산공제 3,830,400(사업용) + 5,745,600(비사업용) = 9,576,000 이 0 이 되어 매입분 양도차익이 그만큼 늘고(장특 0),
    // 35% 구간 → +9,576,000 × 35% = +3,351,600 → 30,115,452. 증여분 카드(사업용 46,913,896 · 비사업용 70,370,845)는 불변.
    expect(r.det).toBe(30_115_452);
    expect(r.card("land_business__purchased")!.necessaryExpense + r.card("land_nbl__purchased")!.necessaryExpense).toBe(0);
  });

  it("카드별 채무 = 사업용 3,200만 / 비사업용 4,800만(잔액 흡수) · 꼬리 2장 · 합 = 입력 채무", () => {
    const r = run({ ...SPLIT, landCarryoverTaxation: withDebt(80_000_000) });
    expect(r.ids).toEqual(expect.arrayContaining(["land_business", "land_nbl", "land_business__purchased", "land_nbl__purchased"]));
    const sp = (id: string) => r.card(id)!.carryoverTaxationDetail!.scenarioA.purchasedPartSplit!;
    expect([sp("land_business").debtAmount, sp("land_business").giftValuation]).toEqual([32_000_000, 80_000_000]);
    expect([sp("land_nbl").debtAmount, sp("land_nbl").giftValuation]).toEqual([48_000_000, 120_000_000]);
    expect(sp("land_business").debtAmount + sp("land_nbl").debtAmount).toBe(80_000_000);
  });

  it("비사업용 잔액 흡수 — 나누어떨어지지 않는 면적(571㎡)에서도 카드 채무 합 = 입력 채무", () => {
    const r = run({ ...SPLIT, landArea: 571, landCarryoverTaxation: withDebt(80_000_001) });
    const sp = (id: string) => r.card(id)!.carryoverTaxationDetail!.scenarioA.purchasedPartSplit!;
    expect(sp("land_business").debtAmount).toBeGreaterThan(0);
    expect(sp("land_nbl").debtAmount).toBeGreaterThan(0);
    expect(sp("land_business").debtAmount + sp("land_nbl").debtAmount).toBe(80_000_001);
    expect(sp("land_business").giftValuation + sp("land_nbl").giftValuation).toBe(200_000_000);
    // 사업용 인정면적 228㎡ ÷ 571㎡ — 사업용은 floor, 비사업용이 잔액을 흡수한다(순서가 뒤집히면 ±1원이 사업용으로 간다). 평가액도 같은 규칙(기존 술어 · 같은 인자).
    expect([sp("land_business").debtAmount, sp("land_nbl").debtAmount]).toEqual([31_943_958, 48_056_043]);
    expect([sp("land_business").giftValuation, sp("land_nbl").giftValuation]).toEqual([79_859_894, 120_140_106]);
  });
});

describe("E2-3 · 건물 파트 이월과세(R3) — 현실 비율 손계산", () => {
  /**
   * 건물만 이월과세. 총 3.3억 = 토지 1.65억 + 건물 1.65억(기준시가 비 2억 : 2억 → 취득 1억 : 1억).
   * 당초 증여 건물: 평가액 1억 · 증여자 1995-06-15 취득 2천만 · 증여세 상당액 500만 · 인수 채무 4천만(r = 0.4).
   * ⚠️ 이월과세 A는 「적용 시 결정세액이 미적용(B)보다 적지 않을 때」만 채택된다(소득세법 제97조의2 제2항 제3호) — 증여자 취득가를 낮게 잡아 A ≥ B가 되게 했다.
   *
   * 손계산(mock 2022 세율 · 양도 2022-10-11):
   *   토지(이월과세 아님): 1.65억 − 취득 0.825억 − 개산공제 3% × 1억 = 300만 → 차익 79,500,000 · 보유 2년 6개월 장특 0
   *   건물 증여분 = 양도가 1.65억 × 6/10 = 99,000,000 · 취득가액 2천만 × 6/10 = 12,000,000 · 상당액 5,000,000(전액)
   *       차익 82,000,000 − 장특 30%(증여자 취득 27년 → 15년 상한 30%) 24,600,000 = 57,400,000
   *   건물 매입분 = 양도가 66,000,000 · 취득가액 = 채무 40,000,000 · 필요경비 = **0** (본인 자본적지출·양도비 없음 — 취득가액이 채무(실지거래가액)라 §97② 제1호, 개산공제 없음.
   *       종전에는 개산공제 3,000,000 − 증여분 몫 floor(3,000,000 × 6/10) = 1,200,000 이 들어 있었다 → 2026-10-28 PR-2에서 제거)
   *       차익 26,000,000 · 보유 2년 6개월 장특 0
   *   합 79,500,000 + 57,400,000 + 26,000,000 = 162,900,000 − 기본공제 2,500,000 = 160,400,000
   *   × 38% − 누진공제 19,940,000 = 41,012,000  (종전 40,556,000 + 1,200,000 × 38% = 456,000)
   *   (비교) 미적용(B): 취득가액 = 증여 당시 평가액 1억(실지거래가액 의제) · 필요경비 0(개산공제 없음 — 종전엔 3,000,000 이 들어 있었다, 같은 제거)
   *        79.5M + (165M − 100M = 65M) = 144.5M − 250만 = 142,000,000 × 35% − 15,440,000 = 34,260,000 (종전 33,210,000) ≤ 41,012,000 → 적용(A) 채택
   */
  const BASE_B = {
    totalTransferPrice: 330_000_000, transferDate: new Date("2022-10-11"),
    landArea: 100, buildingArea: 200, buildingFootprintArea: 50,
    transferLandPricePerSqm: 2_000_000, transferBuildingStdPrice: 200_000_000,
    acquisitionLandPricePerSqm: 1_000_000, acquisitionBuildingStdPrice: 100_000_000,
    zoneType: "general_residential", isMetropolitan: true,
    acquisitionDate: new Date("2020-03-17"), landAcquisitionCause: "purchase" as const,
    buildingAcquisitionDate: new Date("2020-03-17"), buildingAcquisitionCause: "carryover_gift" as const,
  };
  const BCT = (debt?: number) => ({
    giftRegistryDate: new Date("2020-03-17"), donorAcquisitionDate: new Date("1995-06-15"), donorAcquisitionPrice: 20_000_000,
    useEstimatedAcquisition: false, giftTaxAmount: 5_000_000, giftDateValuation: 100_000_000, ...(debt === undefined ? {} : { giftAssumedDebt: debt }),
  });

  it("전제: 건물 카드 양도가 1.65억 · 채무 OFF에서 A 채택 46,560,000 (79.5M + 98M − 250만 = 175M × 38% − 19.94M)", () => {
    const r = run({ buildingCarryoverTaxation: BCT() }, BASE_B);
    expect(r.card("building")!.transferPrice).toBe(165_000_000);
    expect(r.det).toBe(46_560_000);
    expect(r.card("building")!.carryoverTaxationDetail!.adoptedScenario).toBe("A");
  });

  it("건물 파트 채무 4천만 → 41,012,000 [손계산 ✓ · 매입분 개산공제 제거] · 건물(증여분) + 건물 매입분 꼬리", () => {
    const r = run({ buildingCarryoverTaxation: BCT(40_000_000) }, BASE_B);
    expect(r.det).toBe(41_012_000);
    expect(r.ids).toEqual(["land", "building", "building__purchased"]);
    const g = r.card("building")!, p = r.card("building__purchased")!;
    expect([g.transferPrice, g.acquisitionPrice, g.transferGain]).toEqual([99_000_000, 12_000_000, 82_000_000]);
    expect([p.transferPrice, p.acquisitionPrice, p.necessaryExpense, p.transferGain]).toEqual([66_000_000, 40_000_000, 0, 26_000_000]);
    const s = g.carryoverTaxationDetail!.scenarioA.purchasedPartSplit!;
    expect(s).toMatchObject({ debtAmount: 40_000_000, giftValuation: 100_000_000, transferPrice: 165_000_000, donorAcquisitionPrice: 20_000_000, determinedTaxA: 41_012_000, determinedTaxB: 34_260_000 });
    // 토지 카드는 이월과세가 아니라 echo가 없다
    expect(r.card("land")!.carryoverTaxationDetail).toBeUndefined();
  });

  it("건물 파트 채무 + 건물 감가상각(원건물 카드) → 막는다 · 토지 파트 채무 + 건물 감가상각은 카드가 달라 통과", () => {
    const dep = { ...BASE_B, depreciationAmount: 5_000_000 };
    expect(() => run({ buildingCarryoverTaxation: BCT(40_000_000) }, dep)).toThrow(/감가상각/);
  });
});

describe("E2-4 · 증축 3-way · 토지 파트 채무 (probe 고정 — 손계산 아님)", () => {
  // 갱신 2026-10-28: 토지 매입분의 필요경비 개산공제 2,638,093 이 0 이 되어 24% 구간(50M~88M)에서 +2,638,093 × 24% = +633,142 (9,957,002 → 10,590,144). 증여분은 불변.
  const EXTENSION = {
    extensionDate: new Date("2007-07-24"), extensionArea: 83.72, transferExtensionBuildingStdPrice: 54_501_720, acquisitionExtensionBuildingStdPrice: 40_604_200,
    extensionAcquisitionCause: "purchase" as const, actualBundledAcquisitionPrice: 200_000_000, actualBundledExpenses: 8_000_000,
  };
  it("채무 OFF 19,923,021 → 채무 8천만 10,590,144 · 꼬리 land__purchased", () => {
    expect(run({ ...LAND_ONLY, extensionInfo: EXTENSION, landCarryoverTaxation: withDebt(undefined) }).det).toBe(19_923_021);
    const r = run({ ...LAND_ONLY, extensionInfo: EXTENSION, landCarryoverTaxation: withDebt(80_000_000) });
    expect(r.det).toBe(10_590_144); // 종전 9,957,002 + 2,638,093 × 24%
    expect(r.ids).toContain("land__purchased");
  });
});

describe("E2-5 · 꼬리 카드 id (R4) — 지분 접미사 `#` 앞에 접미사", () => {
  it("land__purchased#0 → shareIndexOf 0 · cardSuffixOf 0 · 같은 지분 짝", () => {
    expect(shareIndexOf("land__purchased#0")).toBe(0);
    expect(cardSuffixOf("land__purchased#asset-1")).toBe("asset-1");
    expect(isSameShare("land#0", "land__purchased#0")).toBe(true);
    // 접미사를 `#` 뒤에 두면(옛 규칙) 지분 인덱스를 못 읽는다
    expect(shareIndexOf("land#0__purchased")).toBeUndefined();
  });

  it("purchasedPartIdOf · isPurchasedPieceId · purchasedPartParentIdOf — 왕복", () => {
    for (const id of ["primary", "land", "land_nbl", "building1", "land#0", "land#asset-1", "building#12"]) {
      const tail = purchasedPartIdOf(id);
      expect(isPurchasedPieceId(tail)).toBe(true);
      expect(isPurchasedPieceId(id)).toBe(false);
      expect(purchasedPartParentIdOf(tail)).toBe(id);
    }
    expect(purchasedPartIdOf("primary")).toBe("primary__purchased"); // E1 종전 규칙 그대로
    expect(purchasedPartIdOf("land#0")).toBe("land__purchased#0");
    expect(baseCardId("land__purchased#0")).toBe("land__purchased"); // 정확 비교(`=== "land"`)에 걸리지 않는다 — 꼬리를 산식 카드로 오인하지 않는다
    expect(purchasedPartParentIdOf("land_nbl")).toBe("land_nbl");
  });

  it("카드 라벨 — 부동산 코드를 남기고 (증여분)/(매입분)을 덧붙인다", () => {
    const r = run({ ...LAND_ONLY, landCarryoverTaxation: withDebt(80_000_000) });
    expect(r.card("land")!.propertyLabel).toBe("토지(1001)(증여분)");
    expect(r.card("land__purchased")!.propertyLabel).toBe("토지(1001)(매입분)");
  });
});

describe("E2-6 · 범위 술어(R3) — 카드는 허용, 와이어 최상위·엔진 모양은 파트 입력으로만", () => {
  it("카드 propertyType general_building_unit 허용 · 와이어 general_building/generalBuildingValuation은 일반건물 전용 사유", () => {
    const ok = { acquisitionCause: "carryover_gift", reductions: [] };
    expect(carryoverDebtPiecesUnsupportedReason({ ...ok, propertyType: "general_building_unit" })).toBeNull();
    expect(carryoverDebtPiecesUnsupportedReason({ ...ok, propertyType: "general_building" })).toBe(DEBT_PIECES_REASON.generalBuildingShape);
    expect(carryoverDebtPiecesUnsupportedReason({ ...ok, propertyType: "housing", generalBuildingValuation: {} })).toBe(DEBT_PIECES_REASON.generalBuildingShape);
    expect(carryoverDebtPiecesUnsupportedReason({ ...ok, propertyType: "presale_right" })).toBe(DEBT_PIECES_REASON.propertyType);
  });
  it("사유 문구가 거짓이 되지 않는다 — propertyType 사유는 일반건물을 말하지 않는다", () => {
    expect(DEBT_PIECES_REASON.propertyType).not.toContain("일반건물");
    expect(DEBT_PIECES_REASON.generalBuildingShape).toContain("파트");
  });
  it("카드 사유(감면·용도변경·증여자 신축·감가상각)는 일반건물 카드에서도 그대로 막는다", () => {
    const card = { propertyType: "general_building_unit", acquisitionCause: "carryover_gift" };
    expect(carryoverDebtPiecesUnsupportedReason({ ...card, reductions: [{}] })).toBe(DEBT_PIECES_REASON.reductions);
    expect(carryoverDebtPiecesUnsupportedReason({ ...card, houseToCommercialConversion: true })).toBe(DEBT_PIECES_REASON.acquisitionFacts);
    expect(carryoverDebtPiecesUnsupportedReason({ ...card, carryoverTaxation: { donorBuilt: {} } })).toBe(DEBT_PIECES_REASON.donorBuilt);
    expect(carryoverDebtPiecesUnsupportedReason({ ...card, depreciationAmount: 1 })).toBe(DEBT_PIECES_REASON.depreciation);
  });
});
