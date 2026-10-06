/**
 * S-3 특성화(characterization) anchor — 개별주택가격(부수토지 포함 결합 공시)을 토지분·건물분으로 나누는 방식.
 *
 * 조사 문서: `docs/02-design/features/housing-std-split-proportional.engine-audit.md`
 *
 * ## 이 파일의 성격 — 엔진을 바꾸지 않는다
 *
 * 현행 엔진은 결합가를 **뺄셈 역산**(건물분 = 결합가 − 토지분)으로 나눈다
 * (`calcDerivedBuildingStdAtAcq` · 겸용 `transfer-tax-mixed-use-housing.ts`). 국세청·조세심판원은
 * **가목(토지 개별공시지가) : 나목(건물 기준시가) 비례 안분**을 쓴다. 이 파일은
 *   ① 현행 값을 고정하고,
 *   ② **같은 입력에 나목을 넣어 비례 안분했을 때의 값**을 엔진 수정 없이 재현해 차이(원)를 고정한다.
 *
 * ## 「비례 안분」 재현 방법 — 엔진이 이미 받는 입력 칸만 바꾼다
 *
 * 비례 값 land' = floor(H × L / (L + N)), building' = H − land' 를 입력 칸에 싣는다:
 *   · 일반 주택 split — `standardPricePerSqmAtAcquisition`(= land', 면적 1) + `standardPriceAtAcquisition`(= H)
 *     → 엔진은 건물분을 H − land' 로 만든다(= 비례분). 양도시는 `landStandardPriceAtTransfer`·
 *     `buildingStandardPriceAtTransfer`에 land'ᵀ · H_T − land'ᵀ 를 싣는다.
 *   · 겸용 주택분 — `calcHousingGainSplit`을 `vi.mock`으로 감싸 그 호출의 `landPricePerSqm`만 land'/면적으로 바꾼다
 *     (건물분은 엔진이 H − land' 로 계산). 상가부분·주택:상가 안분은 건드리지 않는다.
 * **재현이 현행과 1원 일치하는지**는 (a) 같은 값을 면적만 바꿔 넣은 baseline 동일성, (b) PHD(§164⑦) 엔진이 이미
 * 비례 안분이므로 PHD 모듈 결과와 재현 결과의 1원 일치(d)로 검증한다.
 *
 * ⚠️ 가상 fixture다(실제 신고 사례 아님). 개별주택가격 ≠ 가목+나목 괴리는 +25%로 뒀다
 *    (실제 Excel 정본 fixture는 +49~58% — d 참조). a1의 기대값은 손계산으로 먼저 확인했다.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import { safeMultiplyThenDivide } from "@/lib/tax-engine/tax-utils";
import { calcAcqStdPair } from "@/lib/tax-engine/transfer-tax-split-acq-price";
import { calcDerivedBuildingStdAtAcq } from "@/lib/calc/transfer-tax-split-acq-mode";
import { baseTransferInput, makeMockRates, makeMockRatesWithHouseEngine } from "../_helpers/mock-rates";
import { mixedUseCase14 } from "../_helpers/mixed-use-fixture";
import {
  PHD_INPUT,
  PHD_TRANSFER_PRICE,
  PHD_P_A_EST,
  PHD_LAND_AREA,
  PHD_LAND_SQM_AT_ACQ,
  PHD_LAND_STD_AT_ACQ,
  PHD_LAND_STD_AT_TRANSFER,
  PHD_TRANSFER_HOUSING_PRICE,
  PHD_BLDG_STD_AT_TRANSFER,
  PHD_SUM_T,
  PHD_LAND_HOUSING_AT_ACQ,
  PHD_BLDG_HOUSING_AT_ACQ,
} from "../transfer-tax/_helpers/pre-housing-disclosure-fixture";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";

// ── 겸용 housing 분할 호출을 가로채 재현 입력을 주입하는 훅 (기본 null = 현행 그대로) ──────────────
const hook = vi.hoisted(() => ({ fn: null as null | ((a: unknown[]) => unknown[]) }));
vi.mock("@/lib/tax-engine/transfer-tax-mixed-use-housing", async (orig) => {
  const m = await orig<typeof import("@/lib/tax-engine/transfer-tax-mixed-use-housing")>();
  return {
    ...m,
    calcHousingGainSplit: (...a: Parameters<typeof m.calcHousingGainSplit>) =>
      m.calcHousingGainSplit(...((hook.fn ? hook.fn(a) : a) as Parameters<typeof m.calcHousingGainSplit>)),
  };
});
afterEach(() => {
  hook.fn = null;
});

const D = (s: string) => new Date(s);
const rates = makeMockRates();
const run = (o: Partial<TransferTaxInput>) => calculateTransferTax(baseTransferInput(o), rates);
/** 비례 안분 토지분 — floor(결합가 × 가목 / (가목 + 나목)) */
const propLand = (H: number, L: number, N: number) => safeMultiplyThenDivide(H, L, L + N);

const snap = (r: ReturnType<typeof run>) => ({
  calculatedTax: r.calculatedTax,
  totalTax: r.totalTax,
  taxBase: r.taxBase,
  transferGain: r.transferGain,
  land: r.splitDetail && {
    transferPrice: r.splitDetail.land.transferPrice,
    acquisitionPrice: r.splitDetail.land.acquisitionPrice,
    appraisalDeduction: r.splitDetail.land.appraisalDeduction,
    gain: r.splitDetail.land.gain,
    longTermRate: r.splitDetail.land.longTermRate,
  },
  building: r.splitDetail && {
    transferPrice: r.splitDetail.building.transferPrice,
    acquisitionPrice: r.splitDetail.building.acquisitionPrice,
    appraisalDeduction: r.splitDetail.building.appraisalDeduction,
    gain: r.splitDetail.building.gain,
    longTermRate: r.splitDetail.building.longTermRate,
  },
});

// ── 가상 fixture 공통값 — 가목(L)·나목(N)·개별주택가격(H). 괴리 = (L+N)/H − 1 = +25% ─────────────────
const A = { H: 480_000_000, L: 240_000_000, N: 360_000_000 }; // 취득시 (L 단가 2,400,000 × 100㎡)
const T = { H: 1_120_000_000, L: 560_000_000, N: 840_000_000 }; // 양도시 (L 단가 5,600,000 × 100㎡)
const A_LP = propLand(A.H, A.L, A.N); // 192,000,000 — 비례 토지분(취득시)
const T_LP = propLand(T.H, T.L, T.N); // 448,000,000 — 비례 토지분(양도시)

describe("S-3 재현 전제 — 비례값과 현행 뺄셈값", () => {
  it("비례 토지분: 480M × 240/600 = 192M · 1,120M × 560/1,400 = 448M", () => {
    expect(A_LP).toBe(192_000_000);
    expect(T_LP).toBe(448_000_000);
  });

  it("뺄셈 역산은 결합가 − 토지분이고 음수는 0으로 clamp한다 — 토지분이 결합가보다 크면 건물분 0", () => {
    expect(calcDerivedBuildingStdAtAcq(A.H, A.L)).toBe(240_000_000);
    expect(calcDerivedBuildingStdAtAcq(100_000_000, 150_000_000)).toBe(0);
    expect(calcDerivedBuildingStdAtAcq(0, 150_000_000)).toBeNull();
  });

  it("calcAcqStdPair — 별개취득+건물 나목 입력 시 파트 독립(역산 아님) / 그 밖은 레거시 뺄셈(buildingDerived=true)", () => {
    const base = baseTransferInput({
      standardPricePerSqmAtAcquisition: 2_400_000,
      acquisitionArea: 100,
      standardPriceAtAcquisition: A.H,
    });
    expect(calcAcqStdPair(base)).toEqual({ land: A.L, building: A.H - A.L, buildingDerived: true });
    const separate = { ...base, isSeparateAcquisition: true, buildingStandardPriceAtAcquisition: A.N };
    expect(calcAcqStdPair(separate)).toEqual({ land: A.L, building: A.N, buildingDerived: false });
    // 별개취득이어도 나목이 없으면 레거시 뺄셈으로 후퇴한다(한시 후퇴 — API 직접 입력에서만 도달)
    const separateNoBuilding = { ...base, isSeparateAcquisition: true };
    expect(calcAcqStdPair(separateNoBuilding)?.buildingDerived).toBe(true);
  });

  it("양도시 토지·건물 양도가액 안분은 이미 가목:나목 비례다 — 개별주택가격(standardPriceAtTransfer)을 바꿔도 불변", () => {
    const common: Partial<TransferTaxInput> = {
      propertyType: "housing",
      transferPrice: 1_200_000_000,
      transferDate: D("2026-06-30"),
      acquisitionDate: D("2018-03-02"),
      landAcquisitionDate: D("2006-05-10"),
      acquisitionPrice: 700_000_000,
      isOneHousehold: false,
      householdHousingCount: 2,
      landAcqMode: "actual",
      buildingAcqMode: "actual",
      landStandardPriceAtTransfer: T.L,
      buildingStandardPriceAtTransfer: T.N,
      standardPriceAtAcquisition: A.H,
      standardPricePerSqmAtAcquisition: 2_400_000,
      acquisitionArea: 100,
    };
    const a = run({ ...common, standardPriceAtTransfer: 600_000_000 });
    const b = run({ ...common, standardPriceAtTransfer: 2_400_000_000 });
    expect(snap(a)).toEqual(snap(b));
    // 1,200M × 560/(560+840) = 480M / 720M — 개별주택가격 H_T는 어디에도 쓰이지 않는다
    expect(a.splitDetail?.land.transferPrice).toBe(480_000_000);
    expect(a.splitDetail?.building.transferPrice).toBe(720_000_000);
  });
});

/**
 * (a) 일반 주택 · 토지·건물 보유기간이 다름 · 취득가액 총액(실가) 안분.
 *
 * ⚠️ 도달성: `landAcquisitionDate ≠ acquisitionDate` + `isSeparateAcquisition=false` + 총액 실가는 **엔진 직접 입력**이다
 *    (UI는 취득일이 다르면 `isSeparateAcquisition=true`를 파생해 보내고, 그 경로는 파트별 실가 완결이라 뺄셈을 타지 않는다).
 *    UI에서 도달하는 근접 경로는 a3(소유자 분리·취득일 동일)다.
 */
describe("(a) 일반 주택 split — 취득시 결합가 뺄셈 vs 비례", () => {
  const a1 = (extra: Partial<TransferTaxInput>) =>
    run({
      propertyType: "housing",
      transferPrice: 1_200_000_000,
      transferDate: D("2026-06-30"),
      acquisitionDate: D("2018-03-02"), // 건물 8년
      landAcquisitionDate: D("2006-05-10"), // 토지 20년
      acquisitionPrice: 700_000_000, // 취득가액 총액(실가)
      isOneHousehold: false,
      householdHousingCount: 2,
      isSeparateAcquisition: false,
      landAcqMode: "actual",
      buildingAcqMode: "actual",
      standardPriceAtAcquisition: A.H,
      landStandardPriceAtTransfer: T.L,
      buildingStandardPriceAtTransfer: T.N,
      ...extra,
    });

  it("a1 현행(뺄셈): 취득시 토지비율 240/480 = 50% → 취득가 350M/350M · 세액 133,780,000", () => {
    const cur = a1({ acquisitionArea: 100, standardPricePerSqmAtAcquisition: A.L / 100 });
    expect(snap(cur)).toEqual({
      calculatedTax: 133_780_000,
      totalTax: 147_158_000,
      taxBase: 399_300_000,
      transferGain: 500_000_000,
      // 양도 1,200M × 560/1,400 = 480M / 720M. 토지 20년(30%)·건물 8년(16%)
      land: { transferPrice: 480_000_000, acquisitionPrice: 350_000_000, appraisalDeduction: 0, gain: 130_000_000, longTermRate: 0.3 },
      building: { transferPrice: 720_000_000, acquisitionPrice: 350_000_000, appraisalDeduction: 0, gain: 370_000_000, longTermRate: 0.16 },
    });
    expect(cur.splitDetail?.building.stdPriceDerivedFromTotal).toBe(true);
  });

  it("a1 재현 검증: 같은 값을 면적 1㎡ 단가로 바꿔 넣어도 현행과 동일(1원 일치)", () => {
    const cur = a1({ acquisitionArea: 100, standardPricePerSqmAtAcquisition: A.L / 100 });
    const re = a1({ acquisitionArea: 1, standardPricePerSqmAtAcquisition: A.L });
    expect(snap(re)).toEqual(snap(cur));
  });

  it("a1 비례: 취득시 토지비율 192/480 = 40% → 취득가 280M/420M · 세액 129,860,000 (현행 대비 −3,920,000)", () => {
    const prop = a1({ acquisitionArea: 1, standardPricePerSqmAtAcquisition: A_LP });
    expect(snap(prop)).toEqual({
      calculatedTax: 129_860_000,
      totalTax: 142_846_000,
      taxBase: 389_500_000,
      transferGain: 500_000_000, // 총 양도차익은 같다 — 토지·건물에 어떻게 나뉘느냐만 달라진다
      land: { transferPrice: 480_000_000, acquisitionPrice: 280_000_000, appraisalDeduction: 0, gain: 200_000_000, longTermRate: 0.3 },
      building: { transferPrice: 720_000_000, acquisitionPrice: 420_000_000, appraisalDeduction: 0, gain: 300_000_000, longTermRate: 0.16 },
    });
    // 차이 = 토지(장특 30%) 양도차익이 70M 늘고 건물(16%)이 70M 줄어 장특 9.8M 증가 × 한계세율 40%
    expect(133_780_000 - 129_860_000).toBe(Math.round(70_000_000 * (0.3 - 0.16) * 0.4));
  });

  const a2 = (extra: Partial<TransferTaxInput>) =>
    run({
      propertyType: "housing",
      transferPrice: 1_200_000_000,
      transferDate: D("2026-06-30"),
      acquisitionDate: D("2018-03-02"),
      landAcquisitionDate: D("2006-05-10"),
      acquisitionPrice: 0,
      useEstimatedAcquisition: true,
      isOneHousehold: false,
      householdHousingCount: 2,
      isSeparateAcquisition: false,
      landAcqMode: "estimated",
      buildingAcqMode: "estimated",
      standardPriceAtAcquisition: A.H,
      standardPriceAtTransfer: T.H,
      ...extra,
    });

  it("a2 현행(환산): 분자는 결합−토지(240M), 분모는 양도시 나목 입력(840M) — 척도가 달라 건물 환산취득가가 205.7M로 낮아진다", () => {
    const cur = a2({
      acquisitionArea: 100,
      standardPricePerSqmAtAcquisition: A.L / 100,
      landStandardPriceAtTransfer: T.L,
      buildingStandardPriceAtTransfer: T.N,
    });
    // 건물: 720M × (480M − 240M)/840M = 205,714,285 (분자는 결합−토지 역산, 분모는 나목)
    // 토지: 480M × 240M/560M = 205,714,285
    expect(snap(cur)).toEqual({
      calculatedTax: 220_433_040,
      totalTax: 242_476_344,
      taxBase: 610_412_002,
      transferGain: 774_171_430,
      land: { transferPrice: 480_000_000, acquisitionPrice: 205_714_285, appraisalDeduction: 7_200_000, gain: 267_085_715, longTermRate: 0.3 },
      building: { transferPrice: 720_000_000, acquisitionPrice: 205_714_285, appraisalDeduction: 7_200_000, gain: 507_085_715, longTermRate: 0.16 },
    });
  });

  it("a2 비례: 취득·양도 모두 결합가의 가목:나목 분할(192M/288M · 448M/672M) → 건물 환산취득가 308.6M · 세액 184,060,368 (−36,372,672)", () => {
    const prop = a2({
      acquisitionArea: 1,
      standardPricePerSqmAtAcquisition: A_LP,
      landStandardPriceAtTransfer: T_LP,
      buildingStandardPriceAtTransfer: T.H - T_LP,
    });
    // 건물: 720M × 288M/672M = 308,571,428 — 토지와 같은 환산율(0.42857)
    expect(snap(prop)).toEqual({
      calculatedTax: 184_060_368,
      totalTax: 202_466_404,
      taxBase: 523_810_402,
      transferGain: 671_314_287,
      land: { transferPrice: 480_000_000, acquisitionPrice: 205_714_285, appraisalDeduction: 5_760_000, gain: 268_525_715, longTermRate: 0.3 },
      building: { transferPrice: 720_000_000, acquisitionPrice: 308_571_428, appraisalDeduction: 8_640_000, gain: 402_788_572, longTermRate: 0.16 },
    });
  });

  describe("a3 소유자 분리(취득일 동일) — UI에서 도달하는 경로", () => {
    const a3 = (selfOwns: "building_only" | "land_only" | "both", extra: Partial<TransferTaxInput>) =>
      run({
        propertyType: "housing",
        transferPrice: 1_200_000_000,
        transferDate: D("2026-06-30"),
        acquisitionDate: D("2018-03-02"),
        landAcquisitionDate: D("2018-03-02"),
        acquisitionPrice: 700_000_000,
        isOneHousehold: false,
        householdHousingCount: 2,
        isSeparateAcquisition: false,
        landAcqMode: "actual",
        buildingAcqMode: "actual",
        standardPriceAtAcquisition: A.H,
        landStandardPriceAtTransfer: T.L,
        buildingStandardPriceAtTransfer: T.N,
        ...(selfOwns === "both" ? {} : { selfOwns }),
        ...extra,
      });
    const CUR = { acquisitionArea: 100, standardPricePerSqmAtAcquisition: A.L / 100 };
    const PROP = { acquisitionArea: 1, standardPricePerSqmAtAcquisition: A_LP };

    it("건물만 소유: 세액 97,380,000 → 74,870,000 (−22,510,000)", () => {
      expect(a3("building_only", CUR).calculatedTax).toBe(97_380_000);
      expect(a3("building_only", PROP).calculatedTax).toBe(74_870_000);
      expect(a3("building_only", CUR).totalTax).toBe(107_118_000);
      expect(a3("building_only", PROP).totalTax).toBe(82_357_000);
    });

    it("토지만 소유: 세액 21,905,000 → 42,950,000 (+21,045,000)", () => {
      expect(a3("land_only", CUR).calculatedTax).toBe(21_905_000);
      expect(a3("land_only", PROP).calculatedTax).toBe(42_950_000);
      expect(a3("land_only", CUR).totalTax).toBe(24_095_500);
      expect(a3("land_only", PROP).totalTax).toBe(47_245_000);
    });

    it("둘 다 소유 + 취득일 동일 + 장특공제율 동일이면 분할 방식이 세액에 영향 없다(토지·건물 합 불변)", () => {
      expect(a3("both", CUR).calculatedTax).toBe(141_060_000);
      expect(a3("both", PROP).calculatedTax).toBe(141_060_000);
    });
  });
});

/**
 * (b) 고가주택(12억 초과) 1세대1주택 + 부수토지 배율 초과분 — 단건 주택.
 *
 * 배율 초과분 판정(G-2)은 `isSeparateAcquisition === true` 전용이다(`transfer-tax-appurtenant-land.ts:154-157`).
 * 별개취득의 UI 경로는 건물 나목을 파트 독립으로 입력하므로 뺄셈이 타지 않는다. 아래는 **API 직접 입력**
 * (`buildingStandardPriceAtAcquisition` 생략 + 결합 총액)으로 레거시 뺄셈에 후퇴하는 경우다.
 */
describe("(b) 단건 주택 고가 + 부수토지 배율 초과분 (별개취득 · 레거시 뺄셈 후퇴 경로)", () => {
  const b = (extra: Partial<TransferTaxInput>) =>
    run({
      propertyType: "housing",
      transferPrice: 2_000_000_000, // 12억 초과
      transferDate: D("2026-06-30"),
      acquisitionDate: D("2012-09-01"),
      landAcquisitionDate: D("2008-07-01"),
      acquisitionPrice: 0,
      useEstimatedAcquisition: true,
      isOneHousehold: true,
      householdHousingCount: 1,
      residencePeriodMonths: 120,
      isSeparateAcquisition: true,
      landAcqMode: "estimated",
      buildingAcqMode: "estimated",
      standardPriceAtTransfer: T.H,
      buildingFootprintArea: 25, // 정착 25㎡ × 3배(수도권 주거) = 75㎡ → 토지 100㎡ 중 25㎡ 초과
      appurtenantLandZone: "metropolitan_residential",
      acquisitionArea: 100,
      ...extra,
    });

  const legacyInput = {
    standardPriceAtAcquisition: A.H, // 나목 없음 → 레거시 뺄셈
    standardPricePerSqmAtAcquisition: A.L / 100,
    landStandardPriceAtTransfer: T.L,
    buildingStandardPriceAtTransfer: T.N,
  };

  it("현행(뺄셈): 건물 환산 분자 240M ÷ 분모 840M → 건물 환산취득가 342.9M · 세액 45,128,160 · 초과분 양도차익 112,485,714", () => {
    const cur = b(legacyInput);
    expect(cur.splitDetail?.nonBusinessLandPart?.gain).toBe(112_485_714); // 토지 양도차익 449,942,858 × 25%
    expect(snap(cur)).toMatchObject({
      calculatedTax: 45_128_160,
      totalTax: 49_640_976,
      taxBase: 171_232_001,
      land: { transferPrice: 800_000_000, acquisitionPrice: 342_857_142, appraisalDeduction: 7_200_000, gain: 449_942_858 },
      building: { transferPrice: 1_200_000_000, acquisitionPrice: 342_857_142, appraisalDeduction: 7_200_000, gain: 849_942_858 },
    });
  });

  it("재현 검증: 건물 나목 칸에 H−L을 명시 입력한 파트 독립 경로가 레거시 뺄셈과 1원 일치", () => {
    const cur = b(legacyInput);
    const explicit = b({
      standardPricePerSqmAtAcquisition: A.L / 100,
      buildingStandardPriceAtAcquisition: A.H - A.L,
      landStandardPriceAtTransfer: T.L,
      buildingStandardPriceAtTransfer: T.N,
    });
    expect(snap(explicit)).toEqual(snap(cur));
    expect(explicit.splitDetail?.nonBusinessLandPart?.gain).toBe(cur.splitDetail?.nonBusinessLandPart?.gain);
  });

  it("비례: 건물 환산취득가 514.3M · 세액 40,001,547 (−5,126,613) · 초과분 양도차익 112,845,714 (+360,000 — 토지 개산공제 7.2M→5.76M)", () => {
    const prop = b({
      standardPricePerSqmAtAcquisition: A_LP / 100,
      buildingStandardPriceAtAcquisition: A.H - A_LP,
      landStandardPriceAtTransfer: T_LP,
      buildingStandardPriceAtTransfer: T.H - T_LP,
    });
    expect(prop.splitDetail?.nonBusinessLandPart?.gain).toBe(112_845_714);
    expect(snap(prop)).toMatchObject({
      calculatedTax: 40_001_547,
      totalTax: 44_001_701,
      taxBase: 157_740_915,
      land: { transferPrice: 800_000_000, acquisitionPrice: 342_857_142, appraisalDeduction: 5_760_000, gain: 451_382_858 },
      building: { transferPrice: 1_200_000_000, acquisitionPrice: 514_285_714, appraisalDeduction: 8_640_000, gain: 677_074_286 },
    });
  });
});

/**
 * (c) 겸용주택 주택분 — 취득·양도 모두 `개별주택가격 − 공시지가 × 주택부수토지` 뺄셈(UI 도달 경로).
 * 주택 건물 나목 입력은 **없다**(`MixedUseStandardPrice`는 housingPrice·commercialBuildingPrice·landPricePerSqm뿐).
 *
 * 함께 취득(토지·건물 같은 날)이면 토지·건물 장특공제율이 같아 분할 방식이 세액에 영향이 없다 — 영향은
 * **배율 초과분(양도차익 × 토지 비율)**에서만 생긴다. 그래서 `isOneHouseExempt:true`(12억 이하 주택분 전액 비과세)에서
 * 초과분만 과세되는 경우가 가장 크다.
 */
describe("(c) 겸용주택 주택분 — 뺄셈 vs 비례 (함께 취득 · 가상)", () => {
  const MU = {
    H_T: 600_000_000, L_T: 400_000_000, N_T: 350_000_000, // 양도시 (단가 4,000,000 × 주택부수토지 100㎡)
    H_A: 250_000_000, L_A: 150_000_000, N_A: 150_000_000, // 취득시 (단가 1,500,000 × 100㎡)
  };
  const muLpT = propLand(MU.H_T, MU.L_T, MU.N_T); // 320,000,000
  const muLpA = propLand(MU.H_A, MU.L_A, MU.N_A); // 125,000,000
  const r2 = makeMockRatesWithHouseEngine();

  const asset = (over: Partial<MixedUseAssetInput> = {}): MixedUseAssetInput => ({
    ...mixedUseCase14(),
    totalLandArea: 200, // 주택 100 + 상가 100
    residentialLandAreaOverride: 100,
    residentialFootprintOverride: 40, // 40 × 3배 = 120 ≥ 100 → 초과 없음
    landAcquisitionDate: D("2005-03-01"),
    buildingAcquisitionDate: D("2005-03-01"),
    isOneHouseExempt: false,
    transferStandardPrice: { housingPrice: MU.H_T, commercialBuildingPrice: 200_000_000, landPricePerSqm: 4_000_000 },
    acquisitionStandardPrice: { housingPrice: MU.H_A, commercialBuildingPrice: 75_000_000, landPricePerSqm: 1_500_000 },
    ...over,
  });

  type Mode = "estimated" | "actual";
  const go = (a: MixedUseAssetInput, mode: Mode) =>
    calcMixedUseTransferTax(
      2_000_000_000,
      D("2026-06-30"),
      mode === "actual" ? { ...a, useActualAcquisition: true, acquisitionActualTotalPrice: 700_000_000 } : a,
      r2,
    );
  const proportional = <R,>(fn: () => R): R => {
    hook.fn = (args) => {
      const a = args[2] as MixedUseAssetInput;
      return [
        args[0],
        args[1],
        {
          ...a,
          transferStandardPrice: { ...a.transferStandardPrice, landPricePerSqm: muLpT / 100 },
          acquisitionStandardPrice: { ...a.acquisitionStandardPrice, landPricePerSqm: muLpA / 100 },
        },
        ...args.slice(3),
      ];
    };
    try {
      return fn();
    } finally {
      hook.fn = null;
    }
  };
  const h = (r: ReturnType<typeof go>) => ({
    landTransferPrice: r.housingPart.landTransferPrice,
    buildingTransferPrice: r.housingPart.buildingTransferPrice,
    landAcqPrice: r.housingPart.landAcqPrice,
    buildingAcqPrice: r.housingPart.buildingAcqPrice,
    landAppraisalDed: r.housingPart.landAppraisalDed,
    buildingAppraisalDed: r.housingPart.buildingAppraisalDed,
    landStdPriceAtAcq: r.housingPart.landStdPriceAtAcq,
    buildingStdPriceAtAcq: r.housingPart.buildingStdPriceAtAcq,
    landGain: r.housingPart.landTransferGain,
    buildingGain: r.housingPart.buildingTransferGain,
  });

  it("재현 값 확인: 비례 토지분 320M·125M (단가 3.2M·1.25M × 100㎡)", () => {
    expect(muLpT).toBe(320_000_000);
    expect(muLpA).toBe(125_000_000);
  });

  it("c1 환산 · 현행(뺄셈): 양도 토지비율 400/600 → 토지 양도가 666,666,666 · 취득 토지비율 150/250 → 환산취득가 249,999,999", () => {
    const cur = go(asset(), "estimated");
    // 주택 양도가액 = 2,000M × 600/(600 + 400 + 200) = 1,000M. 환산 = 1,000M × 250/600 = 416,666,666
    expect(h(cur)).toEqual({
      landTransferPrice: 666_666_666,
      buildingTransferPrice: 333_333_334,
      landAcqPrice: 249_999_999,
      buildingAcqPrice: 166_666_667,
      landAppraisalDed: 4_500_000,
      buildingAppraisalDed: 3_000_000,
      landStdPriceAtAcq: 150_000_000,
      buildingStdPriceAtAcq: 100_000_000,
      landGain: 412_166_667,
      buildingGain: 163_666_667,
    });
    expect(cur.total.transferTax).toBe(314_070_500);
  });

  it("c1 환산 · 비례: 토지 양도가 533,333,333 · 환산취득가 208,333,333 — 주택분 토지·건물 차익이 크게 이동하나 세액은 같다(함께 취득·초과 없음)", () => {
    const prop = proportional(() => go(asset(), "estimated"));
    expect(h(prop)).toEqual({
      landTransferPrice: 533_333_333,
      buildingTransferPrice: 466_666_667,
      landAcqPrice: 208_333_333,
      buildingAcqPrice: 208_333_333,
      landAppraisalDed: 3_750_000,
      buildingAppraisalDed: 3_750_000,
      landStdPriceAtAcq: 125_000_000,
      buildingStdPriceAtAcq: 125_000_000,
      landGain: 321_250_000,
      buildingGain: 254_583_334,
    });
    // 재현 검증 — 엔진이 비례분을 그대로 소비했다(토지분 + 건물분 = 결합가)
    expect(prop.housingPart.landStdPriceAtAcq).toBe(muLpA);
    expect(prop.housingPart.landTransferPrice).toBe(Math.floor((1_000_000_000 * muLpT) / MU.H_T));
    expect(prop.total.transferTax).toBe(314_070_500);
  });

  it("c2 환산 · 12억 이하 비과세 + 배율 초과분: 초과분 양도차익 103,041,666 → 80,312,500 · 세액 175,069,750 → 168,657,500 (−6,412,250)", () => {
    const a = asset({ isOneHouseExempt: true, residentialFootprintOverride: 25 }); // 25 × 3 = 75 → 초과 25㎡(25%)
    const cur = go(a, "estimated");
    const prop = proportional(() => go(a, "estimated"));
    expect(cur.housingPart.isExempt).toBe(true);
    expect(cur.nonBusinessLandPart?.transferGain).toBe(103_041_666);
    expect(prop.nonBusinessLandPart?.transferGain).toBe(80_312_500);
    expect(cur.total.transferTax).toBe(175_069_750);
    expect(prop.total.transferTax).toBe(168_657_500);
    expect(cur.total.totalPayable).toBe(192_576_725);
    expect(prop.total.totalPayable).toBe(185_523_250);
  });

  it("c3 실가 · 현행(뺄셈): 취득시 토지비율 60% → 토지 취득가 221,052,631 (총 취득가 700M을 주택:상가로 나눈 주택분 368.4M의 60%)", () => {
    const cur = go(asset(), "actual");
    expect(h(cur)).toMatchObject({
      landTransferPrice: 666_666_666,
      landAcqPrice: 221_052_631,
      buildingAcqPrice: 147_368_421,
      landGain: 445_614_035,
      buildingGain: 185_964_913,
    });
    expect(cur.total.transferTax).toBe(345_210_000);
  });

  it("c3 실가 · 비례: 취득시 토지비율 50% → 184,210,526/184,210,526 · 세액은 같다(초과 없음)", () => {
    const prop = proportional(() => go(asset(), "actual"));
    expect(h(prop)).toMatchObject({
      landTransferPrice: 533_333_333,
      landAcqPrice: 184_210_526,
      buildingAcqPrice: 184_210_526,
      landGain: 349_122_807,
      buildingGain: 282_456_141,
    });
    expect(prop.total.transferTax).toBe(345_210_000);
  });

  it("c4 실가 · 12억 이하 비과세 + 배율 초과분: 초과분 111,403,508 → 87,280,701 · 세액 192,278,421 → 185,186,315 (−7,092,106)", () => {
    const a = asset({ isOneHouseExempt: true, residentialFootprintOverride: 25 });
    const cur = go(a, "actual");
    const prop = proportional(() => go(a, "actual"));
    expect(cur.nonBusinessLandPart?.transferGain).toBe(111_403_508);
    expect(prop.nonBusinessLandPart?.transferGain).toBe(87_280_701);
    expect(cur.total.transferTax).toBe(192_278_421);
    expect(prop.total.transferTax).toBe(185_186_315);
  });
});

/**
 * (d) PHD §164⑦ — 엔진은 **이미 가목:나목 비례 안분**이다(`transfer-tax-pre-housing-disclosure.ts:130-146`:
 * `floor(P × 토지분 / (토지분+건물분))`, 건물분은 그 잔액). Excel 정본 fixture(세무사 작성 워크북 근거)로 고정한다.
 *
 * 같은 입력을 뺄셈 경로(비-PHD split)로 계산하면 취득시 토지분(500,320,000)이 추정 취득시 개별주택가격
 * (484,828,268)을 **초과**해 건물분이 0으로 clamp된다 — 실제 데이터에서 개별주택가격 < 가목+나목 괴리가
 * 흔하다는 근거이자, 뺄셈이 성립하지 않는 예다.
 */
describe("(d) PHD §164⑦ — 이미 비례 · 같은 입력을 뺄셈으로 계산하면", () => {
  const common: Partial<TransferTaxInput> = {
    propertyType: "housing",
    transferPrice: PHD_TRANSFER_PRICE,
    transferDate: D("2023-02-16"),
    acquisitionDate: D("2014-09-14"),
    landAcquisitionDate: D("2013-06-01"),
    acquisitionPrice: 0,
    useEstimatedAcquisition: true,
    acquisitionMethod: "estimated",
    expenses: 0,
    isOneHousehold: true,
    householdHousingCount: 2,
    residencePeriodMonths: 0,
  } as Partial<TransferTaxInput>;

  const phd = run({ ...common, landSplitMode: "apportioned", preHousingDisclosure: PHD_INPUT } as Partial<TransferTaxInput>);
  const detail = phd.preHousingDisclosureDetail!;

  it("현행 PHD(비례): 취득시 토지분 336,336,292 + 건물분 148,491,976 = 추정 취득시 개별주택가격 484,828,268 · 세액 26,100,130", () => {
    expect(detail.estimatedHousingPriceAtAcquisition).toBe(PHD_P_A_EST);
    expect(detail.landHousingAtAcquisition).toBe(PHD_LAND_HOUSING_AT_ACQ);
    expect(detail.buildingHousingAtAcquisition).toBe(PHD_BLDG_HOUSING_AT_ACQ);
    expect(detail.landHousingAtAcquisition + detail.buildingHousingAtAcquisition).toBe(PHD_P_A_EST);
    expect(snap(phd)).toMatchObject({ calculatedTax: 26_100_130, totalTax: 28_710_143, taxBase: 118_686_087, transferGain: 147_580_813 });
  });

  it("괴리 실측: 개별주택가격 627M vs 가목+나목 991.9M (+58%) · 토지분만으로도 739.0M·500.3M가 개별주택가격을 넘는다", () => {
    expect(PHD_SUM_T / PHD_TRANSFER_HOUSING_PRICE - 1).toBeCloseTo(0.5819, 3);
    expect(PHD_LAND_STD_AT_TRANSFER).toBeGreaterThan(PHD_TRANSFER_HOUSING_PRICE);
    expect(PHD_LAND_STD_AT_ACQ).toBeGreaterThan(PHD_P_A_EST);
  });

  it("재현 검증: PHD가 만든 비례 토지분을 split 경로 입력으로 넣으면 PHD 모듈과 1원 일치(세액 26,100,130)", () => {
    const re = run({
      ...common,
      isSeparateAcquisition: false,
      landAcqMode: "estimated",
      buildingAcqMode: "estimated",
      standardPriceAtAcquisition: PHD_P_A_EST,
      standardPricePerSqmAtAcquisition: detail.landHousingAtAcquisition,
      acquisitionArea: 1,
      standardPriceAtTransfer: PHD_TRANSFER_HOUSING_PRICE,
      landStandardPriceAtTransfer: detail.landHousingAtTransfer,
      buildingStandardPriceAtTransfer: PHD_TRANSFER_HOUSING_PRICE - detail.landHousingAtTransfer,
    });
    expect(snap(re)).toEqual(snap(phd));
  });

  it("뺄셈 경로로 같은 입력을 계산: 건물 취득시 기준시가 0 → 건물 환산취득가 0 · 세액 86,234,106 (PHD 비례 대비 +60,133,976)", () => {
    const sub = run({
      ...common,
      isSeparateAcquisition: false,
      landAcqMode: "estimated",
      buildingAcqMode: "estimated",
      standardPriceAtAcquisition: PHD_P_A_EST,
      standardPricePerSqmAtAcquisition: PHD_LAND_SQM_AT_ACQ,
      acquisitionArea: PHD_LAND_AREA,
      standardPriceAtTransfer: PHD_TRANSFER_HOUSING_PRICE,
      landStandardPriceAtTransfer: PHD_LAND_STD_AT_TRANSFER,
      buildingStandardPriceAtTransfer: PHD_BLDG_STD_AT_TRANSFER,
    });
    expect(sub.splitDetail?.building.acquisitionPrice).toBe(0);
    expect(sub.splitDetail?.building.appraisalDeduction).toBe(0);
    expect(sub.splitDetail?.land.acquisitionPrice).toBe(360_648_974);
    expect(sub.calculatedTax).toBe(86_234_106);
    expect(sub.calculatedTax - phd.calculatedTax).toBe(60_133_976);
  });
});
