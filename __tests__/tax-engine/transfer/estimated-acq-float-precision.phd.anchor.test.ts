/**
 * 환산취득가액 부동소수 1원 과소 — 개별주택가격 미공시 취득(PHD, 영 §164⑦) 14곳 + 감면 PHD 헬퍼 anchor (2026-10-21)
 *
 * 계획: docs/00-pm/estimated-acquisition-float-precision.plan.md §2(P 모양)·§3(#3~#17)·§4.1(PHD#6 실측 — 기존 회귀 격자가 결정세액만 비교해 지나감)
 *
 * 옛 식 `Math.floor(a * b / c)`는 곱이 `Number.MAX_SAFE_INTEGER`를 넘고 하위 비트가 있으면 반올림돼
 * 참값이 정수일 때 1원 과소가 난다. 「개별주택가격 = 그 시점 기준시가 합」인 항등 가족에서 참값이 모두 정수라
 * 한 입력이 여러 지점을 동시에 건드린다(아래 `PREMISE`가 지점별 옛 식 과소를 고정한다 — 전제가 깨지면 anchor가 의미를 잃는다).
 * 기대값은 리터럴 + 테스트 안의 BigInt 오라클(엔진 함수와 구현이 겹치지 않는다)로 이중 고정한다.
 */
import { describe, it, expect } from "vitest";
import { calcPreHousingDisclosureGain } from "@/lib/tax-engine/transfer-tax-pre-housing-disclosure";
import { calcReductionAcquisitionStdPrice } from "@/lib/tax-engine/transfer-reductions/phd-helper";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { baseTransferInput, makeMockRates } from "../_helpers/mock-rates";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

const big = (a: number, b: number, c: number) => Number((BigInt(a) * BigInt(b)) / BigInt(c));
const oldFormula = (a: number, b: number, c: number) => Math.floor((a * b) / c);

/** 옛 식이 참값보다 1 작은 지점임을 고정 */
function premise(label: string, a: number, b: number, c: number, exact: number) {
  expect(big(a, b, c), `${label} 참값`).toBe(exact);
  expect(oldFormula(a, b, c), `${label} 옛 식(1원 과소)`).toBe(exact - 1);
}

// ── 기본 3시점 (#3~#8: 109·116·122·128·140·144) ──────────────────────────────────
// 취득시·최초공시·양도시 기준시가 합이 각각 개별주택가격과 같은 가족(최초공시 2배·양도시 4배).
const BASIC_X = 1_047_417_496;
const BASIC_INPUT = {
  firstDisclosureDate: new Date("2005-04-30"),
  firstDisclosureHousingPrice: 523_708_748, // = 최초공시 기준시가 합
  landArea: 250,
  landPricePerSqmAtAcquisition: 943_103,
  buildingStdPriceAtAcquisition: 26_078_624,
  landPricePerSqmAtFirstDisclosure: 1_886_206,
  buildingStdPriceAtFirstDisclosure: 52_157_248,
  transferHousingPrice: 1_047_417_496, // = 양도시 기준시가 합
  landPricePerSqmAtTransfer: 3_772_412,
  buildingStdPriceAtTransfer: 104_314_496,
};

describe("PHD 기본 3시점 — calcPreHousingDisclosureGain", () => {
  const r = calcPreHousingDisclosureGain(BASIC_X, BASIC_INPUT);

  it("전제: 6개 지점 모두 옛 식이 1원 과소 (곱이 2^53 초과 + 참값 정수)", () => {
    const sumA = r.sumAtAcquisition;
    const sumF = r.sumAtFirstDisclosure;
    const sumT = r.sumAtTransfer;
    premise("109", BASIC_INPUT.firstDisclosureHousingPrice, sumA, sumF, 261_854_374);
    premise("116", BASIC_INPUT.transferHousingPrice, r.landStdAtTransfer, sumT, 943_103_000);
    premise("122", BASIC_X, 943_103_000, BASIC_INPUT.transferHousingPrice, 943_103_000);
    premise("128", 261_854_374, r.landStdAtAcquisition, sumA, 235_775_750);
    premise("140", BASIC_X, 261_854_374, BASIC_INPUT.transferHousingPrice, 261_854_374);
    premise("144", 261_854_374, 235_775_750, 261_854_374, 235_775_750);
  });

  it("#3 109 추정 취득시 개별주택가격 P_A_est = 261,854,374 (옛 …373)", () => {
    expect(r.estimatedHousingPriceAtAcquisition).toBe(261_854_374);
  });
  it("#4 116 양도시 토지 성분 = 943,103,000 (옛 …999)", () => {
    expect(r.landHousingAtTransfer).toBe(943_103_000);
    expect(r.buildingHousingAtTransfer).toBe(1_047_417_496 - 943_103_000);
  });
  it("#5 122 토지 양도가액 = 943,103,000 (옛 …999)", () => {
    expect(r.landTransferPrice).toBe(943_103_000);
    expect(r.buildingTransferPrice).toBe(BASIC_X - 943_103_000);
  });
  it("#6 128 취득시 토지 성분 = 235,775,750 (옛 …749)", () => {
    expect(r.landHousingAtAcquisition).toBe(235_775_750);
    expect(r.buildingHousingAtAcquisition).toBe(261_854_374 - 235_775_750);
  });
  it("#7 140 총 환산취득가액 = 261,854,374 (옛 …373)", () => {
    expect(r.totalEstimatedAcquisitionPrice).toBe(261_854_374);
  });
  it("#8 144 토지 환산취득가액 = 235,775,750 (옛 …749) · 건물분은 잔액", () => {
    expect(r.landAcquisitionPrice).toBe(235_775_750);
    expect(r.buildingAcquisitionPrice).toBe(261_854_374 - 235_775_750);
  });
});

describe("PHD 기본 3시점 — 엔진 경유(주택 split, preHousingDisclosure)", () => {
  const rates = makeMockRates();
  const input = baseTransferInput({
    propertyType: "housing",
    transferPrice: BASIC_X,
    transferDate: new Date("2023-02-16"),
    acquisitionDate: new Date("2014-09-14"),
    landAcquisitionDate: new Date("2013-06-01"),
    acquisitionPrice: 0,
    useEstimatedAcquisition: true,
    acquisitionMethod: "estimated",
    expenses: 0,
    isOneHousehold: true,
    householdHousingCount: 2,
    residencePeriodMonths: 0,
    landSplitMode: "apportioned",
    preHousingDisclosure: BASIC_INPUT,
  } as Partial<TransferTaxInput>);

  it("PHD 상세·split 파트의 환산취득가액이 참값이다", () => {
    const r = calculateTransferTax(input, rates);
    expect(r.preHousingDisclosureDetail?.totalEstimatedAcquisitionPrice).toBe(261_854_374);
    expect(r.preHousingDisclosureDetail?.landAcquisitionPrice).toBe(235_775_750);
    expect(r.preHousingDisclosureDetail?.landTransferPrice).toBe(943_103_000);
    expect(r.splitDetail?.land.acquisitionPrice).toBe(235_775_750);
    expect(r.splitDetail?.land.transferPrice).toBe(943_103_000);
  });
});

// ── 4부분(겸용, Case A) (#9~#16: 223·232·234·236·241·246·248·250) ─────────────────
interface Four { name: string; args: [number, number, number, number, number, number, number, number]; hits: string[] }
/** (주택토지㎡, 상가토지㎡, 취득시 토지단가, 취득시 주택건물, 최초공시 배수, 양도시 배수, 취득시 상가건물, 양도가 배수) */
function fourInput([hl, cl, pA, bA, k1, k2, cbA, mult]: Four["args"]) {
  const pF = pA * k1, bF = bA * k1, pT = pA * k2, bT = bA * k2, cbF = cbA * k1, cbT = cbA * k2;
  const sumA4 = (hl + cl) * pA + bA + cbA;
  const housingAtT = hl * pT + bT; // 양도시 개별주택가격 = 주택부분 기준시가 합
  const sumShare = housingAtT + cl * pT + cbT;
  const X4 = sumShare * mult;
  return {
    X4,
    inp: {
      firstDisclosureDate: new Date("2005-04-30"),
      firstDisclosureHousingPrice: k1 * sumA4, // = 최초공시 4부분 기준시가 합
      landArea: hl, landPricePerSqmAtAcquisition: pA, buildingStdPriceAtAcquisition: bA,
      landPricePerSqmAtFirstDisclosure: pF, buildingStdPriceAtFirstDisclosure: bF,
      transferHousingPrice: housingAtT, landPricePerSqmAtTransfer: pT, buildingStdPriceAtTransfer: bT,
      commercialBuildingStdPriceAtAcq: cbA, commercialBuildingStdPriceAtFirstDisclosure: cbF, commercialBuildingStdPriceAtTransfer: cbT,
      housingLandArea: hl, commercialLandArea: cl, housingBuildingStdPriceAtTransfer: bT, totalTransferPriceForFourPart: X4,
    },
    // 독립 오라클(BigInt) — 엔진 함수와 구현이 겹치지 않는다
    oracle: (() => {
      const pAest = big(k1 * sumA4, sumA4, k1 * sumA4);
      const hLshare = big(housingAtT, hl * pT, housingAtT);
      const hBshare = housingAtT - hLshare;
      return {
        pAest, hLshare, hBshare, sumShare,
        hLT: big(X4, hLshare, sumShare), hBT: big(X4, hBshare, sumShare), cLT: big(X4, cl * pT, sumShare),
        totalEstAcq: big(X4, pAest, sumShare),
        hLA: big(pAest, hl * pA, sumA4), hBA: big(pAest, bA, sumA4), cLA: big(pAest, cl * pA, sumA4),
      };
    })(),
  };
}

const FOURS: (Four & { lit: Record<string, number> })[] = [
  { name: "A(8·10·12·14)", args: [140, 70, 1_479_719, 102_813_204, 8, 8, 48_380_904, 1], hits: ["8", "10", "12", "14"],
    lit: { pAest: 461_935_098, hLshare: 1_657_285_280, hBshare: 822_505_632, sumShare: 3_695_480_784, hLT: 1_657_285_280, hBT: 822_505_632, cLT: 828_642_640, totalEstAcq: 461_935_098, hLA: 207_160_660, hBA: 102_813_204, cLA: 103_580_330 } },
  { name: "S7(7)", args: [90, 100, 461_933, 146_278_710, 5, 5, 73_089_729, 1], hits: ["7"],
    lit: { pAest: 307_135_709, hLshare: 207_869_850, hBshare: 731_393_550, sumShare: 1_535_678_545, hLT: 207_869_850, hBT: 731_393_550, cLT: 230_966_500, totalEstAcq: 307_135_709, hLA: 41_573_970, hBA: 146_278_710, cLA: 46_193_300 } },
  { name: "S9(9)", args: [40, 20, 1_541_190, 63_807_506, 8, 8, 37_410_908, 3], hits: ["9"],
    lit: { pAest: 193_689_814, hLshare: 493_180_800, hBshare: 510_460_048, sumShare: 1_549_518_512, hLT: 1_479_542_400, hBT: 1_531_380_144, cLT: 739_771_200, totalEstAcq: 581_069_442, hLA: 61_647_600, hBA: 63_807_506, cLA: 30_823_800 } },
  { name: "S11(11)", args: [40, 20, 1_541_190, 63_807_506, 8, 8, 37_410_908, 1], hits: ["11"],
    lit: { pAest: 193_689_814, hLshare: 493_180_800, hBshare: 510_460_048, sumShare: 1_549_518_512, hLT: 493_180_800, hBT: 510_460_048, cLT: 246_590_400, totalEstAcq: 193_689_814, hLA: 61_647_600, hBA: 63_807_506, cLA: 30_823_800 } },
  { name: "S13(13)", args: [30, 20, 1_725_031, 117_983_374, 10, 3, 40_062_199, 1], hits: ["13"],
    lit: { pAest: 244_297_123, hLshare: 155_252_790, hBshare: 353_950_122, sumShare: 732_891_369, hLT: 155_252_790, hBT: 353_950_122, cLT: 103_501_860, totalEstAcq: 244_297_123, hLA: 51_750_930, hBA: 117_983_374, cLA: 34_500_620 } },
];

describe("PHD 4부분 안분 — 지점별 옛 식 과소 입력", () => {
  it.each(FOURS)("$name — 엔진 = 리터럴 = BigInt 오라클", ({ args, lit }) => {
    const { X4, inp, oracle } = fourInput(args);
    const r = calcPreHousingDisclosureGain(X4, inp);
    const f = r.fourPartApportionment!;
    expect(f).toBeDefined();
    const got = {
      pAest: r.estimatedHousingPriceAtAcquisition,
      hLshare: f.housingLandStdShare, hBshare: f.housingBuildingStdShare, sumShare: f.sumAtTransferShare,
      hLT: f.housingLandTransferPrice, hBT: f.housingBuildingTransferPrice, cLT: f.commercialLandTransferPrice,
      totalEstAcq: f.totalEstAcq,
      hLA: f.housingLandAcqShare, hBA: f.housingBuildingAcqShare, cLA: f.commercialLandAcqShare,
    };
    expect(got).toEqual(lit);
    expect(got).toEqual(oracle);
    // 잔액 흡수 규약 유지 — 4부분 합이 입력 총액·추정 취득시 개별주택가격과 같다
    expect(f.housingLandTransferPrice + f.housingBuildingTransferPrice + f.commercialLandTransferPrice + f.commercialBuildingTransferPrice).toBe(X4);
    expect(f.housingLandAcqShare + f.housingBuildingAcqShare + f.commercialLandAcqShare + f.commercialBuildingAcqShare).toBe(r.estimatedHousingPriceAtAcquisition);
  });

  it("전제: 각 표본이 가리키는 지점에서 옛 식이 1원 과소", () => {
    const check = (name: string, site: string) => {
      const s = FOURS.find((x) => x.name.startsWith(name))!;
      const { X4, inp } = fourInput(s.args);
      const r = calcPreHousingDisclosureGain(X4, inp);
      const f = r.fourPartApportionment!;
      const sites: Record<string, [number, number, number]> = {
        "7": [inp.transferHousingPrice, f.housingLandStdAtTransfer, f.housingLandStdAtTransfer + f.housingBuildingStdAtTransfer],
        "8": [X4, f.housingLandStdShare, f.sumAtTransferShare],
        "9": [X4, f.housingBuildingStdShare, f.sumAtTransferShare],
        "10": [X4, f.commercialLandStdAtTransfer, f.sumAtTransferShare],
        "11": [X4, r.estimatedHousingPriceAtAcquisition, f.sumAtTransferShare],
        "12": [r.estimatedHousingPriceAtAcquisition, f.housingLandStdAtAcq, f.sumAtAcq4],
        "13": [r.estimatedHousingPriceAtAcquisition, f.housingBuildingStdAtAcq, f.sumAtAcq4],
        "14": [r.estimatedHousingPriceAtAcquisition, f.commercialLandStdAtAcq, f.sumAtAcq4],
      };
      const [a, b, c] = sites[site];
      expect(oldFormula(a, b, c), `${name} 지점 ${site}`).toBe(big(a, b, c) - 1);
    };
    for (const s of FOURS) for (const h of s.hits) check(s.name.split("(")[0], h);
  });
});

// ── 감면 경로 PHD 추정 취득시 기준시가 (#17: phd-helper.ts:126) ─────────────────────
describe("감면 PHD 헬퍼 calcReductionAcquisitionStdPrice", () => {
  it("추정 취득시 기준시가 = 217,926,506 (옛 …505)", () => {
    const sumA = 100 * 1_541_190 + 63_807_506;
    const sumF = 100 * 12_329_520 + 510_460_048;
    expect(sumF).toBe(1_743_412_048);
    expect(sumA).toBe(217_926_506);
    premise("#17(126)", 1_743_412_048, sumA, sumF, 217_926_506);
    const r = calcReductionAcquisitionStdPrice({
      firstDisclosurePrice: 1_743_412_048,
      landAreaSqm: 100,
      landPricePerSqmAtAcquisition: 1_541_190,
      landPricePerSqmAtFirstDisclosure: 12_329_520,
      buildingStdPriceAtAcquisition: 63_807_506,
      buildingStdPriceAtFirstDisclosure: 510_460_048,
    });
    expect(r.estimatedAcquisitionStdPrice).toBe(217_926_506);
  });
});
