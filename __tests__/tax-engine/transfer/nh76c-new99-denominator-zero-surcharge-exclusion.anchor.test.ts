/**
 * anchor — §99·§99의3 안분 분모 0 × 소득세법 시행령 §167의3①5호 중과 배제 (리뷰 NH-76 형제 · L15 후속)
 *
 * 결함: #2951이 §99·§99의3 분모 0(양도시 = 취득시 기준시가)을 «계산 불가 + 확인 필요»(불성립)로 바꾼 뒤, 중과 배제 선판정
 *   (`resolveSurchargeExclusionByReduction`)이 eligibleId만 읽어 3주택 조정지역 중과 30%가 붙었다. L15(#2979)는 §98의8·하이브리드에
 *   `requirementsMetId`를 붙여 막았지만 §99·§99의3(`evalNew99`·`evalNew993`)은 빠져 있었다.
 *   수정은 #2984(`buildResolution` 공용 `onlyCalcFactorReasons`)에 들어갔다 — 그 PR의 anchor(`surcharge-oos-std-price-requirements`)는
 *   기준시가 미입력만 고정하므로, 여기는 화면에서 도달하는 분모 0과 겸용 경로를 고정한다.
 * 근거: 「감면되는 주택」 여부는 요건으로 정해진다 — 두 evaluator 모두 요건 검사를 마친 뒤 안분 단계에서만 분모 0·기준시가 미입력을 낸다.
 *   기준시가는 요건이 아니라 공제액 계산 인자다(US-35와 같은 독법). 분모 0은 ⑧이 막지 않아 화면에서 도달한다.
 *
 * US-36 (2026-11-10): 분모 0 규칙이 «계산 불가»에서 «전액 + 확인 필요»로 바뀌었다 — 분모 0은 이제 적격(eligibleId)이라 중과 배제는
 *   요건 경로(`requirementsMetId`)가 아니라 eligibleId 경로로 유지된다. 분모 ±1과 같은 전액이므로 세액도 22,612,000이다.
 *
 * 전(前) 실측(mock 세율, 3주택 조정지역, 같은 시료): 분모 0 → 중과 30% · 총 354,541,000(= 감면 없음 대조) / 분모 ±1 → 배제 · 22,612,000.
 * 세율표는 mock(정본 세액 아님).
 */
import { describe, it, expect } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { calcMixedUseTransferTaxIdN as calcMixed } from "../_helpers/mixed-use-identity-std";
import { makeMockRatesWithHouseEngine, baseTransferInput, makeHouseInfo } from "../_helpers/mock-rates";
import { mixedUseCase14 } from "../_helpers/mixed-use-fixture";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";

const D = (s: string) => new Date(s);
const rates = makeMockRatesWithHouseEngine();
const EXCLUSION_STEP = "감면주택 다주택 중과 배제";

const R993 = (acq: number, tr: number, over: Record<string, unknown> = {}) => ({
  type: "new_99_3" as const, contractDate993: D("2002-05-01"), standardPriceAtAcquisition993: acq, standardPriceAt5Years: 200_000_000,
  standardPriceAtTransfer993: tr, exclusiveAreaSqm993: 84, region993: "outside_speculation" as const,
  acquisitionType993: "from_builder" as const, firstContract993: "yes" as const, isResident993: true, isHousingConstructionBusiness993: false, ...over,
});
const R99 = (acq: number, tr: number, over: Record<string, unknown> = {}) => ({
  type: "new_99" as const, contractDate99: D("1998-06-01"), acquisitionType99: "from_builder" as const, firstContract99: "yes" as const, isNationalHousing99: false,
  standardPriceAtAcquisition99: acq, standardPriceAt5Years99: 160_000_000, standardPriceAtTransfer99: tr, exclusiveAreaSqm99: 84, ...over,
});
const ACQ99 = "1999-01-01";
const ACQ993 = "2004-09-01";
const TD = "2021-08-01";
const mk = (reductions: unknown[], acq: string, manualExemption = false, houseCount = 3) =>
  calculateTransferTax(
    baseTransferInput({
      transferPrice: 800_000_000, acquisitionPrice: 300_000_000, acquisitionDate: D(acq), transferDate: D(TD),
      householdHousingCount: houseCount, isRegulatedArea: true,
      houses: [
        makeHouseInfo("h1", { acquisitionDate: D(acq), regionCode: "11680", ...(manualExemption ? { isTaxSpecialExemption: true } : {}) } as never),
        ...Array.from({ length: houseCount - 1 }, (_, i) => makeHouseInfo(`h${i + 2}`)),
      ],
      sellingHouseId: "h1", reductions,
    } as never),
    rates,
  );
const hasExclusion = (r: ReturnType<typeof calculateTransferTax>) => r.steps.some((s) => s.label === EXCLUSION_STEP);

describe("§99의3 분모 0 — 전액 감면 + 중과 배제 유지", () => {
  it("분모 0: 적격 · 전액 · 확인 필요 고지 · 중과 배제 step · 중과 0 · 세액 22,612,000 (분모 ±1과 같다)", () => {
    const r = mk([R993(100_000_000, 100_000_000)], ACQ993);
    const d = r.new993Detail!;
    expect(d.isEligible).toBe(true);
    expect(d.signCase).toBe("pos_zero");
    expect(d.reducibleTransferIncome).toBeGreaterThan(0);
    expect(d.warnings?.some((w) => w.includes("확인 필요"))).toBe(true);
    expect(hasExclusion(r)).toBe(true);
    expect(r.surchargeRate ?? 0).toBe(0);
    expect(r.totalTax).toBe(22_612_000);
  });
  it("대조: 감면 미선택은 중과 30% · 354,541,000 (전 결함값과 같다)", () => {
    const r = mk([], ACQ993);
    expect(hasExclusion(r)).toBe(false);
    expect(r.surchargeRate).toBe(0.3);
    expect(r.totalTax).toBe(354_541_000);
  });
  it("짝: 분모 ±1은 종전대로 적격 · 배제 · 22,612,000", () => {
    for (const tr of [100_000_001, 99_999_999]) {
      const r = mk([R993(100_000_000, tr)], ACQ993);
      expect(r.new993Detail!.isEligible, String(tr)).toBe(true);
      expect(hasExclusion(r), String(tr)).toBe(true);
      expect(r.totalTax, String(tr)).toBe(22_612_000);
    }
  });
  it("재개발 변형 분모 0(양도시 = 종전주택 취득시)도 전액 · 배제 유지 · 분모 +1과 같은 세액", () => {
    const v = { isRedevelopedNewHouse993: true, previousHouseStdPrice993: 400_000_000 };
    const r = mk([R993(100_000_000, 400_000_000, v)], ACQ993);
    expect(r.new993Detail!.isEligible).toBe(true);
    expect(r.new993Detail!.signCase).toBe("pos_zero");
    expect(hasExclusion(r)).toBe(true);
    expect(r.surchargeRate ?? 0).toBe(0);
    expect(r.totalTax).toBe(mk([R993(100_000_000, 400_000_001, v)], ACQ993).totalTax);
  });
  it("5년 시점 기준시가 미입력(MISSING_STD_PRICE)도 요건 뒤 사유라 배제 유지 (⑧이 화면에서는 막는다)", () => {
    const r = mk([R993(100_000_000, 100_000_001, { standardPriceAt5Years: undefined })], ACQ993);
    expect(r.new993Detail!.ineligibleReasons.map((x) => x.code)).toEqual(["MISSING_STD_PRICE"]);
    expect(hasExclusion(r)).toBe(true);
  });
  it("짝: 요건 불성립(계약일 2005 — 감면 기간 밖)은 분모 0이어도 중과 유지 = 감면 미선택", () => {
    const r = mk([R993(100_000_000, 100_000_000, { contractDate993: D("2005-03-01") })], ACQ993);
    expect(r.new993Detail!.isEligible).toBe(false);
    expect(hasExclusion(r)).toBe(false);
    expect(r.totalTax).toBe(mk([], ACQ993).totalTax);
  });
  it("2주택 조정(소령 §167의10①2호)도 같다 — 분모 0에도 배제 · 분모 +1과 같은 세액", () => {
    const r = mk([R993(100_000_000, 100_000_000)], ACQ993, false, 2);
    expect(hasExclusion(r)).toBe(true);
    expect(r.totalTax).toBe(mk([R993(100_000_000, 100_000_001)], ACQ993, false, 2).totalTax);
  });
});

describe("§99 분모 0 — 같은 규칙(전액)", () => {
  it("분모 0: 적격 · 전액 · 확인 필요 · 배제 step · 세액 22,612,000", () => {
    const r = mk([R99(100_000_000, 100_000_000)], ACQ99);
    expect(r.new99Detail!.isEligible).toBe(true);
    expect(r.new99Detail!.signCase).toBe("pos_zero");
    expect(r.new99Detail!.warnings?.some((w) => w.includes("확인 필요"))).toBe(true);
    expect(hasExclusion(r)).toBe(true);
    expect(r.surchargeRate ?? 0).toBe(0);
    expect(r.totalTax).toBe(22_612_000);
  });
  it("짝: 분모 +1은 종전대로 22,612,000 · 요건 불성립(고가주택 170㎡)은 중과 유지", () => {
    expect(mk([R99(100_000_000, 100_000_001)], ACQ99).totalTax).toBe(22_612_000);
    const big = mk([R99(100_000_000, 100_000_000, { exclusiveAreaSqm99: 170 })], ACQ99);
    expect(big.new99Detail!.isEligible).toBe(false);
    expect(hasExclusion(big)).toBe(false);
  });
});

describe("겸용 경로(NH-09 선판정) — 같은 함수라 같다", () => {
  const mh = (sellingOver: Record<string, unknown> = {}) => ({
    houses: [makeHouseInfo("selling", sellingOver as never), makeHouseInfo("h2", { acquisitionDate: D("2015-03-01") }), makeHouseInfo("h3", { acquisitionDate: D("2015-03-01") })],
    sellingHouseId: "selling", presaleRights: [], isOneHousehold: true, isRegulatedArea: true,
  });
  const r993z = {
    type: "new_99_3", contractDate993: D("2002-03-01"), acquisitionType993: "from_builder", firstContract993: "yes" as const, region993: "outside_speculation",
    standardPriceAtAcquisition993: 100_000_000, standardPriceAt5Years: 200_000_000, standardPriceAtTransfer993: 100_000_000, exclusiveAreaSqm993: 84,
  };
  const run = (over: Record<string, unknown>) =>
    calcMixed(1_100_000_000, D("2026-06-01"), {
      ...mixedUseCase14(), isOneHouseExempt: false, buildingAcquisitionDate: D("2003-09-01"), landAcquisitionDate: D("2003-09-01"), ...over,
    } as unknown as MixedUseAssetInput, rates);
  it("§99의3 분모 0 선택 → 중과 없음 · 배제 step (전액 감면이라 5호 수동 토글보다 세액이 낮다)", () => {
    const sel = run({ multiHouse: mh(), reductions: [r993z] });
    const manual = run({ multiHouse: mh({ isTaxSpecialExemption: true }), reductions: [r993z] });
    const control = run({ multiHouse: mh() });
    expect(control.multiHouseSurcharge?.surchargeType).toBe("multi_house_3plus");
    expect(sel.multiHouseSurcharge?.surchargeType).toBe("none");
    expect(sel.steps.some((s) => s.id === "surcharge-exclusion-by-reduction")).toBe(true);
    expect(sel.total.totalPayable).toBeLessThanOrEqual(manual.total.totalPayable);
    expect(sel.total.totalPayable).toBeLessThan(control.total.totalPayable);
  });
});
