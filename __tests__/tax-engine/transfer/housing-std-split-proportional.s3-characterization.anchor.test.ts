/**
 * ⚠️ **S3-1 이후 갱신본(2026-10)** — 일반 주택 비-별개 취득의 뺄셈 역산은 비례 안분으로 교체됐다. 그 경로의 「현행 값 고정」
 * 12건은 `__tests__/api/transfer.route.housing-std-split-proportional.s3-1.predo.anchor.test.ts`(B-1~B-7)가 승계했고
 * 이 파일에서는 제거했다. 남은 것: 겸용 주택분(S3-2 대상 — 아직 뺄셈)·PHD(이미 비례)·양도가액 안분·별개 취득 파트 독립.
 * 아래 본문 중 「현행(뺄셈)」 서술이 **겸용(c)** 에만 해당함에 유의.
 *
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
  PHD_BLDG_STD_AT_ACQ,
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

  it("calcAcqStdPair — 주택: 비-별개 + 나목 → 비례 쌍(buildingDerived=true, stdSplit echo) / 나목 없으면 쌍 없음 / 별개 + 나목 → 파트 독립 / 별개 + 나목 없음 → 건물분 null (S3-1)", () => {
    const base = baseTransferInput({
      standardPricePerSqmAtAcquisition: 2_400_000,
      acquisitionArea: 100,
      standardPriceAtAcquisition: A.H,
    });
    // 비-별개 + 나목: 토지분 = floor(480M × 240M ÷ 600M) = 192M, 건물분 = 480M − 192M = 288M (뺄셈이었다면 240M/240M)
    expect(calcAcqStdPair({ ...base, buildingStandardPriceAtAcquisition: A.N })).toEqual({
      land: A_LP,
      building: A.H - A_LP,
      buildingDerived: true,
      stdSplit: { housingTotal: A.H, landStd: A.L, buildingStd: A.N, landBasis: A_LP, buildingBasis: A.H - A_LP },
    });
    // 비-별개 + 나목 없음: 뺄셈으로 후퇴하지 않는다 — 쌍 없음
    expect(calcAcqStdPair(base)).toBeNull();
    const separate = { ...base, isSeparateAcquisition: true, buildingStandardPriceAtAcquisition: A.N };
    expect(calcAcqStdPair(separate)).toEqual({ land: A.L, building: A.N, buildingDerived: false });
    // 별개취득 + 나목 없음(D-2): 한시 후퇴(뺄셈)가 제거되어 건물분 null — 호출부가 건물분을 지목해 차단한다
    expect(calcAcqStdPair({ ...base, isSeparateAcquisition: true })).toEqual({ land: A.L, building: null, buildingDerived: false });
    // 일반건물(`building`)은 이번 범위 밖 — 레거시 뺄셈 유지
    expect(calcAcqStdPair({ ...base, propertyType: "building" })).toEqual({ land: A.L, building: A.H - A.L, buildingDerived: true });
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
      buildingStandardPriceAtAcquisition: A.N, // S3-1 — 비례 쌍의 분모(없으면 분할 포기)
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
 *    (UI는 취득일이 다르면 `isSeparateAcquisition=true`를 파생해 보내고, 그 경로는 파트별 실가 완결이다).
 *    UI에서 도달하는 근접 경로는 a3(소유자 분리·취득일 동일)다 — S3-1에서 취득시 건물분은 뺄셈이 아니라 비례 안분이다.
 */
describe("(a) 일반 주택 split — 소유자 분리(UI 입구) · 취득시 결합가 비례 안분 (S3-1)", () => {
  // a1(일반·토지 20년/건물 8년) · a2(환산) 의 「현행(뺄셈)」 vs 「비례」 고정은 S3-1에서 predo anchor B-1·B-2가 승계했다
  //   — 비례: a1 129,860,000 · a2 184,060,368 (나목 입력 + 환산 분모도 양도시 개별주택가격 비례).
  // a1·a2 모두 엔진 직접 입력 경로(UI 입구는 소유자 분리 a3뿐)이고, 나목이 없으면 분할을 포기한다(B-4b).

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
    const WITH_N = { acquisitionArea: 100, standardPricePerSqmAtAcquisition: A.L / 100, buildingStandardPriceAtAcquisition: A.N };

    // 건물만 97,380,000 → 74,870,000 / 토지만 21,905,000 → 42,950,000 은 predo anchor B-3이 승계했다(Route).
    it("건물만 소유·토지만 소유: 나목을 넣으면 비례 안분 — 74,870,000 / 42,950,000 (뺄셈은 97,380,000 / 21,905,000이었다)", () => {
      expect(a3("building_only", WITH_N).calculatedTax).toBe(74_870_000);
      expect(a3("land_only", WITH_N).calculatedTax).toBe(42_950_000);
    });

    it("둘 다 소유 + 취득일 동일 + 장특공제율 동일이면 분할 방식이 세액에 영향 없다(토지·건물 합 불변)", () => {
      expect(a3("both", WITH_N).calculatedTax).toBe(141_060_000);
    });
  });
});

/**
 * (b) 고가주택(12억 초과) 1세대1주택 + 부수토지 배율 초과분 — 단건 주택.
 *
 * 배율 초과분 판정(G-2)은 `isSeparateAcquisition === true` 전용이다(`transfer-tax-appurtenant-land.ts:154-157`).
 * 별개취득은 건물 나목을 파트 독립으로 입력한다. 종전의 「나목 생략 → 레거시 뺄셈 후퇴」는 S3-1 D-2에서 차단으로 바뀌었다
 * (predo anchor B-6).
 */
describe("(b) 단건 주택 고가 + 부수토지 배율 초과분 (별개취득 · 파트 독립 경로)", () => {
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

  // 「별개 취득 + 나목 생략 → 레거시 뺄셈 후퇴」(세액 45,128,160)는 S3-1 D-2에서 **차단**으로 바뀌었다 — predo anchor B-6.
  //  나목을 입력하는 파트 독립 경로의 값은 아래 「비례」 테스트가 고정한다.

  it("파트 독립(나목 입력): 건물 환산취득가 514.3M · 세액 40,001,547 · 초과분 양도차익 112,845,714 (토지 개산공제 5.76M)", () => {
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

  it("🔄 S3-1 정합: 같은 입력(추정 취득시 개별주택가격 + 가목·나목)을 split 경로에 넣으면 비례 안분이 PHD 모듈과 같은 토지분을 만든다", () => {
    // PHD가 쓰는 입력 그대로 — 추정 취득시 개별주택가격 484,828,268 · 가목 500,320,000 · 나목 220,890,540 /
    // 양도시 개별주택가격 627M · 가목 739,032,000 · 나목 252,871,000. split 경로는 이제 같은 비례 산식을 쓴다.
    const re = run({
      ...common,
      isSeparateAcquisition: false,
      landAcqMode: "estimated",
      buildingAcqMode: "estimated",
      standardPriceAtAcquisition: PHD_P_A_EST,
      standardPricePerSqmAtAcquisition: PHD_LAND_SQM_AT_ACQ,
      acquisitionArea: PHD_LAND_AREA,
      buildingStandardPriceAtAcquisition: PHD_BLDG_STD_AT_ACQ,
      standardPriceAtTransfer: PHD_TRANSFER_HOUSING_PRICE,
      landStandardPriceAtTransfer: PHD_LAND_STD_AT_TRANSFER,
      buildingStandardPriceAtTransfer: PHD_BLDG_STD_AT_TRANSFER,
    });
    // 취득시 토지분·건물분 = PHD 모듈의 값과 1원 일치
    expect(re.splitDetail?.stdSplit?.landBasis).toBe(PHD_LAND_HOUSING_AT_ACQ);
    expect(re.splitDetail?.stdSplit?.buildingBasis).toBe(PHD_BLDG_HOUSING_AT_ACQ);
    // 환산 분모(양도시)도 PHD와 같은 척도: 627M × 739,032,000 ÷ 991,903,000 = 467,155,623
    expect(re.splitDetail?.land.acquisitionPrice).toBe(
      Math.floor((detail.landHousingAtAcquisition / detail.landHousingAtTransfer) * re.splitDetail!.land.transferPrice),
    );
  });

  it("🔄 S3-1: 나목이 없으면 뺄셈으로 후퇴하지 않는다 — 분할을 포기한다(종전: 건물분 0 clamp → 건물 환산취득가 0 · 세액 86,234,106)", () => {
    const noN = run({
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
    expect(noN.splitDetail).toBeUndefined();
    expect(noN.calculatedTax).not.toBe(86_234_106);
  });
});
