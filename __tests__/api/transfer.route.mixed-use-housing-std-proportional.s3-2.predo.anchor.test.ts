/**
 * S3-2 Pre-Do anchor — 겸용주택 주택분 기준시가 토지·건물 분할: 뺄셈 역산 → 가목:나목 비례 안분.
 *
 * 설계서 `docs/02-design/features/housing-std-split-proportional-s3-2.engine.design.md`
 * 계획서 `docs/00-pm/housing-std-split-proportional.plan.md` §2 「겸용 주택분(비-PHD)」 · S3-1 anchor
 * `transfer.route.housing-std-split-proportional.s3-1.predo.anchor.test.ts`(형식 승계)
 *
 * ## 구성 (Do 완료 — S3-2 구현 후 상태)
 * - (0) 산식 전제 — 비례 토지분은 독립 BigInt 재구현과 1원 일치 · 뺄셈 = 비례 ⇔ H = L + N.
 * - (C) **회귀선**(수정 전후 동일) — 나목 = H − L 이면 비례 = 뺄셈이라 값 불변(항등) ·
 *       PHD 불변 · 12억 안분 불변 · 상가분 불변 · 개산공제 합계(= 라목 가액 × 3%) 불변.
 * - (B) **수정 후 기대값** — 같은 취득일 · 별개 취득(B0 γ1 — 집행기준 99-164-9: 취득당시 주택가격을 토지일 가목:나목으로 안분) · 양도시 나목 ·
 *       PHD 단서 양도비 축(Q-C) · 용도변경 · 나목 누락 차단 · 상속 신고가액만(Q-B: H 불요 — 가목:나목 원값 비율) ·
 *       결과 echo `housingStdSplit` · Route(⑫ strip 방지 + 400 + 컴패니언).
 * - 종전 (A) 「현행 고정」·R-A1(⑫ strip)은 Do로 의미를 잃어 제거했다(설계서 「Do 결과」 참조).
 *
 * ⚠️ 세액은 mock 세율표(`makeMockRates`) 실측값이다(정본 세액 아님). **가상 fixture(실제 신고 사례 아님)** —
 *    가목+나목 = 1.25 × 개별주택가격(양 시점). 산출세액 = `total.transferTax`.
 * ⚠️ 세액이 움직이는 조건: 배율초과(NBL)로 토지분 양도차익이 비사업용 몫이 되거나 · 주택 건물 차손(0 처리) ·
 *    토지/건물 보유기간 상이(B0). 같은 취득일·같은 보유기간·차손 없음이면 분배만 바뀌고 세액은 ±1원이다(EST_SAME).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { calcMixedUseTransferTax } from "@/lib/tax-engine/transfer-tax-mixed-use";
import { apportionByStdPrice } from "@/lib/tax-engine/std-price-apportion";
import { safeMultiplyThenDivide } from "@/lib/tax-engine/tax-utils";
import { makeMockRates, makeMockRatesWithHouseEngine } from "../tax-engine/_helpers/mock-rates";
import type { MixedUseAssetInput } from "@/lib/tax-engine/types/transfer-mixed-use.types";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi
    .fn()
    .mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRatesWithHouseEngine());
});


// ── 하네스 ───────────────────────────────────────────────────────────────
const rates = makeMockRates();
const D = (s: string) => new Date(s);
const TD = D("2024-08-20");
const P = 3_000_000_000;

/** 가상 fixture 리터럴을 `as`로 좁히는 용도 — 나목(`housingBuildingPrice`)은 이제 공용 타입 필드다. */
type StdWithN = { housingBuildingPrice?: number };
/**
 * 가상 fixture — 취득 H 400M · L 120M(1.2M×100㎡) · N 380M / 양도 H_T 1.6B · L_T 1.2B · N_T 800M.
 * 주택 100㎡ · 상가 100㎡ · 토지 200㎡(주택부수 100) · 비과세 아님 · 2010-03-15 동시 취득.
 */
function base(over: Record<string, unknown> = {}, n?: { a?: number | null; t?: number | null }): MixedUseAssetInput {
  const nA = n?.a === undefined ? 380_000_000 : n.a;
  const nT = n?.t === undefined ? 800_000_000 : n.t;
  return {
    isMixedUseHouse: true,
    residentialFloorArea: 100,
    nonResidentialFloorArea: 100,
    buildingFootprintArea: 100,
    totalLandArea: 200,
    landAcquisitionDate: D("2010-03-15"),
    buildingAcquisitionDate: D("2010-03-15"),
    transferStandardPrice: {
      housingPrice: 1_600_000_000,
      commercialBuildingPrice: 100_000_000,
      landPricePerSqm: 12_000_000,
      ...(nT === null ? {} : { housingBuildingPrice: nT }),
    } as StdWithN,
    acquisitionStandardPrice: {
      housingPrice: 400_000_000,
      commercialBuildingPrice: 80_000_000,
      landPricePerSqm: 1_200_000,
      ...(nA === null ? {} : { housingBuildingPrice: nA }),
    } as StdWithN,
    residencePeriodYears: 0,
    isMetropolitanArea: true,
    zoneType: "general_residential",
    isOneHouseExempt: false,
    ...over,
  } as unknown as MixedUseAssetInput;
}
/** 항등 입력 — N = H − L (뺄셈과 비례가 일치) */
const ID = { a: 280_000_000, t: 400_000_000 };
const ACTUAL = { useActualAcquisition: true, acquisitionActualTotalPrice: 900_000_000 };
const APPRAISAL = { useAppraisalSalesAcquisition: true, acquisitionActualTotalPrice: 900_000_000 };
const EXP = { capitalExpenditure: 50_000_000, transferExpense: 30_000_000 };
const PROVISO = { capitalExpenditure: 900_000_000, transferExpense: 30_000_000 };
/** 토지 2005-06-10 / 건물 2010-03-15 (B0) — 건물일 가목 1.8M · 건물일 나목 320M(가목+나목 = 1.25H) */
const sep = (nb = 320_000_000, extra: Record<string, unknown> = {}) => ({
  landAcquisitionDate: D("2005-06-10"),
  buildingAcquisitionDate: D("2010-03-15"),
  acquisitionStandardPrice: {
    housingPrice: 400_000_000,
    commercialBuildingPrice: 80_000_000,
    landPricePerSqm: 1_200_000,
    landPricePerSqmAtBuildingAcq: 1_800_000,
    housingBuildingPrice: nb,
  } as StdWithN,
  ...extra,
});
const phd = (extra: Record<string, unknown> = {}) => ({
  usePreHousingDisclosure: true,
  landAcquisitionDate: D("2000-01-01"),
  buildingAcquisitionDate: D("2000-01-01"),
  acquisitionStandardPrice: { housingPrice: undefined, commercialBuildingPrice: 30_000_000, landPricePerSqm: 600_000 },
  preHousingDisclosure: {
    firstDisclosureDate: D("2005-04-30"),
    firstDisclosureHousingPrice: 200_000_000,
    landPricePerSqmAtAcquisition: 600_000,
    buildingStdPriceAtAcquisition: 50_000_000,
    landPricePerSqmAtFirstDisclosure: 900_000,
    buildingStdPriceAtFirstDisclosure: 70_000_000,
    transferHousingPrice: 1_600_000_000,
    landPricePerSqmAtTransfer: 12_000_000,
    buildingStdPriceAtTransfer: 800_000_000,
  },
  ...extra,
});
/** 고가 + 배율초과(정착면적 20㎡ → 인정 30㎡ < 부수토지 100㎡) — 토지분 양도차익이 비사업용 몫이 된다 */
const nblHigh = (nT: number) => ({
  isOneHouseExempt: true,
  residencePeriodYears: 10,
  buildingFootprintArea: 20,
  transferStandardPrice: {
    housingPrice: 3_200_000_000,
    commercialBuildingPrice: 100_000_000,
    landPricePerSqm: 12_000_000,
    housingBuildingPrice: nT,
  } as StdWithN,
});

function run(price: number, asset: MixedUseAssetInput) {
  const r = calcMixedUseTransferTax(price, TD, asset, rates);
  const h = r.housingPart;
  return {
    std: [h.landStdPriceAtAcq, h.buildingStdPriceAtAcq] as const,
    transferPrice: [h.landTransferPrice, h.buildingTransferPrice] as const,
    acqPrice: [h.landAcqPrice, h.buildingAcqPrice] as const,
    ded: [h.landAppraisalDed, h.buildingAppraisalDed] as const,
    gain: [h.landTransferGain, h.buildingTransferGain] as const,
    commercialIncome: r.commercialPart.incomeAmount,
    tax: r.total.transferTax,
    proviso: r.necessaryExpenseProviso?.chosen,
  };
}

/** 독립 재구현 — BigInt 정수 나눗셈(floor). 엔진 함수와 구현이 겹치지 않는다. */
const bigProp = (H: number, L: number, N: number) => Number((BigInt(H) * BigInt(L)) / BigInt(L + N));

// ── (0) 산식 전제 ────────────────────────────────────────────────────────
describe("(0) 비례 산식 — 토지분 floor 먼저, 건물분 잔액 흡수 (S3-1 공용 leaf `apportionByStdPrice`)", () => {
  it("손계산: 400M × 120/500 = 96M · 건물 304M / 양도시 1,600M × 1,200/2,000 = 960M · 640M", () => {
    expect(bigProp(400_000_000, 120_000_000, 380_000_000)).toBe(96_000_000);
    expect(apportionByStdPrice(400_000_000, 120_000_000, 380_000_000)).toEqual({ land: 96_000_000, building: 304_000_000 });
    expect(apportionByStdPrice(1_600_000_000, 1_200_000_000, 800_000_000)).toEqual({ land: 960_000_000, building: 640_000_000 });
  });

  it("엔진 leaf와 독립 BigInt 재구현이 1원 일치 — 안전 정수 초과 포함", () => {
    const cases: [number, number, number][] = [
      [400_000_000, 120_000_000, 380_000_000],
      [1_000_000_007, 333_333_333, 700_000_001], // 곱 3.3e17 > 2^53
      [9_000_000_000, 5_000_000_000, 7_000_000_000], // 곱 4.5e19
    ];
    for (const [H, L, N] of cases) {
      expect(safeMultiplyThenDivide(H, L, L + N)).toBe(bigProp(H, L, N));
      expect(apportionByStdPrice(H, L, N).land).toBe(bigProp(H, L, N));
    }
  });

  it("뺄셈이 비례와 같아지는 필요충분조건은 H = L + N (그때만 land′ = L)", () => {
    expect(bigProp(400_000_000, 120_000_000, 280_000_000)).toBe(120_000_000);
    expect(bigProp(400_000_000, 120_000_000, 380_000_000)).not.toBe(120_000_000);
  });
});

// ── (C) 회귀선 — 수정 전후 동일 ──────────────────────────────────────────
describe("(C) 회귀선 — 수정 전후 값이 같아야 한다", () => {
  it("C-1 항등: 나목 = H − L 이면 비례 = 뺄셈 — 같은 취득일 환산·실가(+비용)·단서 · 별개 취득 · NBL이 **현행 값과 1원까지 동일** (수정 후에도 이 리터럴이 그대로여야 한다)", () => {
    const est = run(P, base({}, ID));
    expect(est.std).toEqual([120_000_000, 280_000_000]);
    expect(est.transferPrice).toEqual([1_241_379_309, 413_793_104]);
    expect(est.acqPrice).toEqual([124_137_930, 289_655_173]);
    expect(est.ded).toEqual([3_600_000, 8_400_000]);
    expect(est.tax).toBe(697_999_552);

    const actExp = run(P, base({ ...ACTUAL, ...EXP }, ID));
    expect(actExp.acqPrice).toEqual([180_000_000, 420_000_000]);
    expect(actExp.ded).toEqual([22_413_792, 27_471_265]);
    expect(actExp.tax).toBe(595_270_862);

    const proviso = run(P, base(PROVISO, ID));
    expect(proviso.proviso).toBe("direct");
    expect(proviso.ded).toEqual([192_413_793, 424_137_931]);
    expect(proviso.tax).toBe(604_750_862);

    // 별개 취득: 건물일 나목 = H − 건물일 가목×면적 = 220M, 양도시 나목 = H_T − L_T = 400M
    // 🔁 분할(토지분 = 토지일 가목 원값)은 항등 그대로지만, 환산 분자는 2026-10-07에 H(400M) → 취득당시 주택가격
    //    P = 120M + 220M = 340M으로 정정됐다(분할 합과 같은 값 — 집행기준 99-164-9). 그래서 취득가·세액은 회귀선이 아니다.
    const b0 = run(P, base(sep(220_000_000), { t: 400_000_000 }));
    expect(b0.std).toEqual([120_000_000, 220_000_000]);
    expect(b0.acqPrice).toEqual([124_137_930, 227_586_207]); // 환산 351,724,137 × 120 : 220 (분자 H 시절 146,044,624 / 267,748,479)
    expect(b0.tax).toBe(698_647_552); // 분자 H 시절 678,734,368

    // NBL 고가: 취득시 나목 280M, 양도시 나목 = 3,200M − 1,200M = 2,000M / 12억 이하: 양도시 나목 400M
    expect(run(5_000_000_000, base(nblHigh(2_000_000_000), { a: 280_000_000 })).tax).toBe(739_278_267);
    expect(
      run(1_900_000_000, base({ isOneHouseExempt: true, residencePeriodYears: 10, buildingFootprintArea: 20 }, ID)).tax,
    ).toBe(330_396_675);
  });

  it("C-2 PHD(나목 불요) — 단서 없는 경우 801,651,505 불변 · PHD는 N 입력이 와도 무시", () => {
    expect(run(P, base(phd())).tax).toBe(801_651_505);
    expect(run(P, base(phd(), { a: null, t: null })).tax).toBe(801_651_505);
  });

  it("C-3 같은 취득일·같은 보유기간·차손 없음이면 세액은 ±1원 — 개산공제 합계 = 라목 가액(400M) × 3% = 12,000,000 불변", () => {
    const r = run(P, base());
    expect(r.ded[0] + r.ded[1]).toBe(12_000_000);
    expect(r.acqPrice[0] + r.acqPrice[1]).toBe(413_793_103); // 환산취득가 총액 = 양도가 × H_A/H_T — 분할 전 값 불변
  });

  it("C-4 상가분은 어느 경로에서도 불변 — 상가 양도소득금액", () => {
    expect(run(P, base()).commercialIncome).toBe(814_990_347);
    expect(run(P, base({}, ID)).commercialIncome).toBe(814_990_347);
    expect(run(P, base(ACTUAL)).commercialIncome).toBe(747_641_380);
  });

  it("C-5 12억 초과 비과세 안분(배율초과 없음): 파트 양도차익 합이 같아 산출세액 511,775,500 불변", () => {
    const hi = {
      isOneHouseExempt: true,
      residencePeriodYears: 10,
      transferStandardPrice: { housingPrice: 3_200_000_000, commercialBuildingPrice: 100_000_000, landPricePerSqm: 12_000_000, housingBuildingPrice: 1_600_000_000 } as StdWithN,
    };
    expect(run(5_000_000_000, base(hi)).tax).toBe(511_775_500);
  });

  it("C-6 상속·증여(공시 후 · 개별주택가격 있음): 분배만 바뀌고 세액 704,055,000 불변 — 같은 보유기간·차손 없음", () => {
    expect(run(P, base({ acquisitionByInheritance: true, housingInheritedExpense: 20_000_000 })).tax).toBe(704_055_000);
  });
});

// ── (B) 수정 후 기대값 ──────────────────────────────────────────────────
describe("(B) 수정 후 — 가목:나목 비례 (설계 프로토타입 실측)", () => {
  it("B-1 환산·같은 취득일: 취득시 96M/304M · 양도가 토지분 60%(993,103,447) · 개산공제 2,880,000 + 9,120,000(합 12,000,000) · 세액 +1원", () => {
    const r = run(P, base());
    expect(r.std).toEqual([96_000_000, 304_000_000]);
    expect(r.transferPrice).toEqual([993_103_447, 662_068_966]);
    expect(r.acqPrice).toEqual([99_310_344, 314_482_759]);
    expect(r.ded).toEqual([2_880_000, 9_120_000]);
    expect(r.tax).toBe(697_999_553);
  });

  it("B-2 실가(+공통비용)·감정: 건물 차손이 사라지거나 줄어 세액이 움직인다 — 611,249,483 · 584,359,138 · 605,115,083", () => {
    expect(run(P, base(ACTUAL)).acqPrice).toEqual([144_000_000, 456_000_000]);
    expect(run(P, base(ACTUAL)).tax).toBe(611_249_483);
    expect(run(P, base({ ...ACTUAL, ...EXP })).tax).toBe(584_359_138);
    expect(run(P, base(APPRAISAL)).tax).toBe(605_115_083);
  });

  it("B-3 §97②2호 단서(환산 + 큰 자본적지출): 취득·양도비 안분 축이 모두 비례 — 601,399,138", () => {
    const r = run(P, base(PROVISO));
    expect(r.proviso).toBe("direct");
    expect(r.ded).toEqual([153_931_034, 462_620_690]);
    expect(r.tax).toBe(601_399_138);
  });

  it("B-4 배율초과(NBL) — 토지분 양도차익이 커져 비사업용 몫이 커진다: 고가 739,278,267 → 787,282,713 · 12억 이하 330,396,675 → 298,347,993 · 일반 701,173,820 → 697,999,553", () => {
    const hi = run(5_000_000_000, base(nblHigh(1_600_000_000)));
    expect(hi.gain).toEqual([1_414_262_857, 1_684_848_254]);
    expect(hi.tax).toBe(787_282_713);
    const low = run(1_900_000_000, base({ isOneHouseExempt: true, residencePeriodYears: 10, buildingFootprintArea: 20 }));
    expect(low.tax).toBe(298_347_993);
    expect(run(P, base({ buildingFootprintArea: 20 })).tax).toBe(697_999_553);
  });

  it("B-5 별개 취득(B0, Q-A γ1 — 집행기준 99-164-9): 취득당시 주택가격 = 400M × (120M+320M)/(180M+320M) = 352M → 토지 96M · 건물 256M · 개산공제 2.88M + 7.68M · 환산 분자도 352M → 696,513,398", () => {
    const r = run(P, base(sep()));
    expect(r.std).toEqual([96_000_000, 256_000_000]);
    // 환산취득가 = floor(1,655,172,413 × 352M/1,600M) = 364,137,930 → 96 : 256 (분자 H=400M 시절 413,793,103 → 112,852,664 / 300,940,439)
    expect(r.acqPrice).toEqual([99_310_344, 264_827_586]);
    expect(r.acqPrice[0] + r.acqPrice[1]).toBe(Number((1_655_172_413n * 352_000_000n) / 1_600_000_000n));
    expect(r.ded).toEqual([2_880_000, 7_680_000]);
    expect(r.tax).toBe(696_513_398); // 분자 H 시절 680,547,003
    expect(run(P, base({ ...sep(), ...ACTUAL })).tax).toBe(594_231_865);
    expect(run(P, base({ ...sep(), ...APPRAISAL })).tax).toBe(588_622_345);
  });

  it("B-6 PHD + 단서: 양도비 안분 축이 PHD 자체 양도시 분할(60:40)로 — 토지 양도비분 309,117,089 → 306,634,330 · 세액 불변 582,788,884 · 신규 입력 없음", () => {
    const r = run(P, base(phd(PROVISO), { a: null, t: null }));
    expect(r.ded).toEqual([306_634_330, 253_873_437]);
    expect(r.tax).toBe(582_788_884);
  });

  it("B-7 용도변경: 상가→주택은 양도시 나목만 필요(취득시 나목 불요) — 취득시 합계를 양도시 **비례 비율**로 차용 132M/88M · 주택→상가는 취득시 주택부분 나목도 필요 154,838,709/245,161,291", () => {
    const c2h = base(
      {
        acquisitionStandardPrice: { housingPrice: undefined, commercialBuildingPrice: 200_000_000, landPricePerSqm: 1_200_000 } as StdWithN, // N_A 없음
        partialUsageChange: { direction: "commercial_to_house", usageChangeDate: D("2018-01-01") },
      },
      { a: null },
    );
    expect(run(P, c2h).std).toEqual([132_000_000, 88_000_000]);
    expect(() => run(P, { ...c2h, transferStandardPrice: { ...c2h.transferStandardPrice, housingBuildingPrice: undefined } } as MixedUseAssetInput)).toThrow(/나목/);
    const h2c = base({ partialUsageChange: { direction: "house_to_commercial", acqResidentialArea: 200, acqCommercialArea: 0, usageChangeDate: D("2018-01-01") } });
    expect(run(P, h2c).std).toEqual([154_838_709, 245_161_291]);
  });

  // ── 환산 분자 = 취득당시 주택가격 P (2026-10-07 정정) — 리뷰가 짚은 구별력 공백 2분기 (L2 ≠ L1) ──
  it("B-5a 주택→상가 + 별개 취득 + §97 환산: 취득시 면적이 주택 전체(200㎡)라 P = ⌊400M × (240M+320M) ÷ (360M+320M)⌋ = 329,411,764 — 분자 = P", () => {
    const r = calcMixedUseTransferTax(
      P,
      TD,
      base({
        ...sep(),
        partialUsageChange: { direction: "house_to_commercial", acqResidentialArea: 200, acqCommercialArea: 0, usageChangeDate: D("2018-01-01") },
      }),
      rates,
    );
    const pIndep = Number((400_000_000n * (240_000_000n + 320_000_000n)) / (360_000_000n + 320_000_000n));
    expect(pIndep).toBe(329_411_764);
    expect(r.housingPart.housingStdSplit?.acq?.convertedHousingTotal).toBe(pIndep);
    expect(r.housingPart.acqHousingStandardPrice).toBe(pIndep);
    expect(r.housingPart.estimatedAcquisitionPrice).toBe(
      Number((BigInt(r.apportionment.housingTransferPrice) * BigInt(pIndep)) / BigInt(r.apportionment.housingStandardPrice)),
    );
  });

  it("B-5b 공익수용 §164⑨1호 + 별개 취득: 분자는 P(352M), 분모만 수용 특례값 — 수용 아님보다 환산취득가가 크다", () => {
    const plain = calcMixedUseTransferTax(P, TD, base(sep()), rates);
    const r = calcMixedUseTransferTax(
      P,
      TD,
      base({ ...sep(), transferCause: "public_expropriation", housingCompensationTotal: 1_200_000_000, housingCompensationBasisTotal: 1_400_000_000 }),
      rates,
    );
    const den = r.expropriationDetail?.housing?.chosen;
    expect(den).toBeDefined();
    expect(den).toBeLessThan(1_600_000_000); // 특례가 실제로 분모를 낮췄다(구별력)
    expect(r.housingPart.acqHousingStandardPrice).toBe(352_000_000);
    expect(r.housingPart.estimatedAcquisitionPrice).toBe(
      Number((BigInt(r.apportionment.housingTransferPrice) * 352_000_000n) / BigInt(den!)),
    );
    expect(r.housingPart.estimatedAcquisitionPrice).toBeGreaterThan(plain.housingPart.estimatedAcquisitionPrice);
  });

  it("B-8 상속·증여: 분배 96M/304M · 세액 불변 704,055,000 — 취득 신고가액 450M + H 400M이면 108M/342M", () => {
    expect(run(P, base({ acquisitionByInheritance: true, housingInheritedExpense: 20_000_000 })).std).toEqual([96_000_000, 304_000_000]);
    const rep = run(P, base({ acquisitionByInheritance: true, housingInheritedValue: 450_000_000, housingInheritedExpense: 20_000_000, commercialInheritedValue: 100_000_000 }));
    expect(rep.acqPrice).toEqual([108_000_000, 342_000_000]);
  });

  it("B-9 나목 누락 → 차단(뺄셈 fallback 없음): 취득시·양도시 각각 throw", () => {
    expect(() => run(P, base({}, { a: null }))).toThrow(/나목/);
    expect(() => run(P, base({}, { t: null }))).toThrow(/나목/);
    expect(() => run(P, base({}, { a: 0 }))).toThrow(/나목/);
    // 별개 취득(B0)도 건물 취득일 기준 나목이 없으면 차단
    const noNb = { ...sep(), acquisitionStandardPrice: { ...(sep().acquisitionStandardPrice as object), housingBuildingPrice: undefined } };
    expect(() => run(P, base(noNb))).toThrow(/나목/);
  });

  it("B-10 (Q-B · 사용자 확정) 상속 신고가액만(개별주택가격 없음) → **H를 요구하지 않는다** — 가목:나목 원값 비율로 분할: 450M × 120/500 = 108M / 342M (현행의 「전부 토지분」 침묵 오배분 제거)", () => {
    const inh = (nA: number | null) =>
      base(
        {
          acquisitionByInheritance: true,
          housingInheritedValue: 450_000_000,
          commercialInheritedValue: 100_000_000,
          acquisitionStandardPrice: {
            housingPrice: undefined,
            commercialBuildingPrice: 80_000_000,
            landPricePerSqm: 1_200_000,
            ...(nA === null ? {} : { housingBuildingPrice: nA }),
          } as StdWithN,
        },
        { a: nA },
      );
    const r = run(P, inh(380_000_000));
    expect(r.acqPrice).toEqual([108_000_000, 342_000_000]);
    expect(r.std).toEqual([120_000_000, 380_000_000]); // basis = 가목·나목 원값(H 없음)
    // H를 줘도(400M) 같은 결과 — 계산에 안 쓰이는 칸을 필수로 만들지 않는다.
    const withH = run(P, base({ acquisitionByInheritance: true, housingInheritedValue: 450_000_000, commercialInheritedValue: 100_000_000 }));
    expect(withH.acqPrice).toEqual([108_000_000, 342_000_000]);
    // 나목은 그래도 필수 — 없으면 차단(뺄셈·전부 토지분으로 후퇴하지 않는다)
    expect(() => run(P, inh(null))).toThrow(/나목/);
  });
});

// ── Route — ⑫ strip / 필수화 (⑭ 상위 키 커버리지 가드가 못 보는 중첩 키 방어) ────────────────
const L2 = 1_800_000;
function body(opts: { nT?: number; nA?: number; landPerSqmAtBuildingAcq?: number } = {}) {
  const { nT, nA, landPerSqmAtBuildingAcq = L2 } = opts;
  return {
    transferPrice: P,
    acquisitionPrice: 900_000_000,
    acquisitionDate: "2010-03-15",
    transferDate: "2024-08-20",
    expenses: 0,
    useEstimatedAcquisition: true,
    householdHousingCount: 1,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    isUnregistered: false,
    isNonBusinessLand: false,
    isOneHousehold: false,
    reductions: [] as unknown[],
    annualBasicDeductionUsed: 0,
    residencePeriodMonths: 0,
    propertyType: "mixed-use-house" as const,
    mixedUse: {
      isMixedUseHouse: true as const,
      residentialFloorArea: 100,
      nonResidentialFloorArea: 100,
      buildingFootprintArea: 100,
      totalLandArea: 200,
      landAcquisitionDate: "2005-06-10",
      buildingAcquisitionDate: "2010-03-15",
      transferStandardPrice: {
        housingPrice: 1_600_000_000,
        commercialBuildingPrice: 100_000_000,
        landPricePerSqm: 12_000_000,
        ...(nT !== undefined ? { housingBuildingPrice: nT } : {}),
      },
      acquisitionStandardPrice: {
        housingPrice: 400_000_000,
        commercialBuildingPrice: 80_000_000,
        landPricePerSqm: 1_200_000,
        landPricePerSqmAtBuildingAcq: landPerSqmAtBuildingAcq,
        ...(nA !== undefined ? { housingBuildingPrice: nA } : {}),
      },
      residencePeriodYears: 0,
      isOneHouseExempt: false,
      isMetropolitanArea: true,
      zoneType: "general_residential" as const,
    },
  };
}
async function post(payload: unknown) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  );
  return {
    status: res.status,
    json: (await res.json()) as {
      data?: { mode: string; result: { total: { determinedTax: number }; housingPart: {
        buildingStdPriceAtAcq: number;
        acqHousingStandardPrice?: number;
        housingStdSplit?: { acq?: { kind: string; convertedHousingTotal?: number } };
      } } };
      error?: unknown;
    },
  };
}

describe("Route — 신규 중첩 필드 `housingBuildingPrice`가 ⑫를 통과해 엔진에 도달하는가 (strip 아님)", () => {
  it("R-B1 나목을 실으면 엔진에 도달 — 건물분 256M · 696,513,398 (나목 값을 바꾸면 결과가 바뀐다 = strip 아님)", async () => {
    const a = await post(body({ nT: 800_000_000, nA: 320_000_000 }));
    expect(a.status).toBe(200);
    expect(a.json.data!.result.housingPart.buildingStdPriceAtAcq).toBe(256_000_000);
    expect(a.json.data!.result.total.determinedTax).toBe(696_513_398);
    // 환산 분자 = 분할 합(취득당시 주택가격 P) — 한 계산 안에 취득당시 기준시가가 둘(H·P)이 되지 않는다
    const hp = a.json.data!.result.housingPart;
    expect(hp.housingStdSplit?.acq?.kind).toBe("separate_date_converted");
    expect(hp.acqHousingStandardPrice).toBe(352_000_000);
    expect(hp.acqHousingStandardPrice).toBe(hp.housingStdSplit?.acq?.convertedHousingTotal);
    const b = await post(body({ nT: 800_000_000, nA: 160_000_000 }));
    expect(b.json.data!.result.housingPart.buildingStdPriceAtAcq).not.toBe(256_000_000);
  });

  it("R-B2 나목 누락 → 400 + 필드 지목(취득시·양도시 각각) — 뺄셈 fallback 없음", async () => {
    const noA = await post(body({ nT: 800_000_000 }));
    expect(noA.status).toBe(400);
    expect(JSON.stringify(noA.json)).toContain("housingBuildingPrice");
    const noT = await post(body({ nA: 320_000_000 }));
    expect(noT.status).toBe(400);
    expect(JSON.stringify(noT.json)).toContain("housingBuildingPrice");
  });
});
