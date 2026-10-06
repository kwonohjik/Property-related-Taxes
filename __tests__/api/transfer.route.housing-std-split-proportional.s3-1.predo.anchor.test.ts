/**
 * S3-1 Pre-Do anchor — 일반 주택 비-별개 취득시 기준시가 분할: 뺄셈 역산 → 비례 안분.
 *
 * 설계서 `docs/02-design/features/housing-std-split-proportional-s3-1.engine.design.md`
 * 계획서 `docs/00-pm/housing-std-split-proportional.plan.md` · 특성화 anchor `…s3-characterization.anchor.test.ts`
 *
 * ## 구성 (S3-1 Do 후 — Pre-Do 때의 (A) 현행 고정 · (R) 재구현 블록은 활성화와 함께 제거했다)
 * - (0) 산식 전제 — 비례 토지분은 독립 BigInt 재구현과 1원 일치(양도가액 안분 함수 `safeMultiplyThenDivide` 대조).
 * - (B) **수정 후 기대값** — a1 129,860,000 · a2 184,060,368(환산 분모도 양도시 개별주택가격 비례, D-1 ⓑ) ·
 *       a3 건물만 74,870,000 / 토지만 42,950,000 · B-4 소유자 분리 + 나목 누락 차단 · B-4b 소유자 분리가 아니면 분할 포기 ·
 *       B-5 토지만 환산도 나목 필요(양 파트 OR) · B-6 별개 취득 + 나목 생략 차단(D-2) · B-7 A3 양도시 후퇴 fallback 차단.
 *       (Pre-Do 때의 B-2 「ⓐ 취득시만 비례」 변형은 D-1 ⓑ 확정으로 삭제 — ⓐ는 토지 환산취득가를 164,571,428로 틀어뜨린다.)
 * - (C) **회귀선**(수정 전후 동일) — 함께 취득 / 별개 취득 불변 / PHD 불변 / 양도가액 안분 불변 /
 *       일반건물 비-별개 불변 / 「분할 값이 세액에 닿지 않는 경우」에는 나목을 요구하지 않음(거짓 요구 금지).
 *
 * ⚠️ 세액은 mock 세율표 실측값이다(정본 세액 아님). 가상 fixture(실제 신고 사례 아님) — 가목+나목 = 1.25×개별주택가격.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { safeMultiplyThenDivide } from "@/lib/tax-engine/tax-utils";
import { calcAcqStdPair } from "@/lib/tax-engine/transfer-tax-split-acq-price";
import { baseTransferInput, makeMockRates } from "../tax-engine/_helpers/mock-rates";
import {
  PHD_INPUT,
  PHD_TRANSFER_PRICE,
} from "../tax-engine/transfer-tax/_helpers/pre-housing-disclosure-fixture";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";

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

import { POST as SINGLE } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

// ── 하네스 ───────────────────────────────────────────────────────────────
const D = (s: string) => new Date(s);
const rates = makeMockRates();
const run = (o: Partial<TransferTaxInput>) => calculateTransferTax(baseTransferInput(o), rates);

type Json = {
  data?: { result?: { determinedTax?: number; calculatedTax?: number } };
  error?: { fieldErrors?: Record<string, unknown>; message?: string };
};
async function post(body: unknown): Promise<{ status: number; json: Json }> {
  const res = await SINGLE(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, json: (await res.json()) as Json };
}
const taxOf = (j: Json) => j.data?.result?.determinedTax;
const fieldKeys = (j: Json) => Object.keys(j.error?.fieldErrors ?? {});

type Snap = ReturnType<typeof snap>;
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

// ── 가상 fixture — 특성화 anchor와 같은 값 ───────────────────────────────
const A = { H: 480_000_000, L: 240_000_000, N: 360_000_000 }; // 취득시 (L = 단가 2,400,000 × 100㎡)
const T = { H: 1_120_000_000, L: 560_000_000, N: 840_000_000 }; // 양도시
/** 독립 재구현 — BigInt 정수 나눗셈(floor). 엔진 함수와 구현이 겹치지 않는다. */
const bigProp = (H: number, L: number, N: number) => Number((BigInt(H) * BigInt(L)) / BigInt(L + N));
const A_LP = bigProp(A.H, A.L, A.N); // 192,000,000
const T_LP = bigProp(T.H, T.L, T.N); // 448,000,000

// ── (0) 산식 전제 ────────────────────────────────────────────────────────
describe("(0) 비례 산식 — 토지분 floor 먼저, 건물분 잔액 흡수", () => {
  it("손계산: 480M×240/600 = 192M · 건물 288M / 양도시 1,120M×560/1,400 = 448M · 672M", () => {
    expect(A_LP).toBe(192_000_000);
    expect(A.H - A_LP).toBe(288_000_000);
    expect(T_LP).toBe(448_000_000);
    expect(T.H - T_LP).toBe(672_000_000);
  });

  it("엔진의 양도가액 안분 함수(safeMultiplyThenDivide)와 독립 BigInt 재구현이 1원 일치 — 안전 정수 초과(BigInt 경로) 포함", () => {
    const cases: [number, number, number][] = [
      [A.H, A.L, A.N],
      [T.H, T.L, T.N],
      [1_000_000_007, 333_333_333, 700_000_001], // 곱 3.3e17 > 2^53
      [9_000_000_000, 5_000_000_000, 7_000_000_000], // 곱 4.5e19
      [60_000_000, 50_000_000, 30_000_000], // 집행기준 99-164-9 형태 (50:30 → 37,500,000)
    ];
    for (const [H, L, N] of cases) expect(safeMultiplyThenDivide(H, L, L + N)).toBe(bigProp(H, L, N));
    expect(bigProp(60_000_000, 50_000_000, 30_000_000)).toBe(37_500_000);
    expect(60_000_000 - 37_500_000).toBe(22_500_000);
  });

  it("뺄셈이 비례와 같아지는 필요충분조건은 H = L + N — 그때만 land′ = L", () => {
    expect(bigProp(600_000_000, 240_000_000, 360_000_000)).toBe(240_000_000);
    expect(bigProp(A.H, A.L, A.N)).not.toBe(A.L);
  });
});

// ── 시나리오 입력 ────────────────────────────────────────────────────────
const COMMON: Partial<TransferTaxInput> = {
  propertyType: "housing",
  transferPrice: 1_200_000_000,
  transferDate: D("2026-06-30"),
  isOneHousehold: false,
  householdHousingCount: 2,
};
/** a1 — 일반 주택, 토지 20년/건물 8년, 취득가 총액 실가 안분 (엔진·API 직접 입력 경로) */
const a1 = (extra: Partial<TransferTaxInput>) =>
  run({
    ...COMMON,
    acquisitionDate: D("2018-03-02"),
    landAcquisitionDate: D("2006-05-10"),
    acquisitionPrice: 700_000_000,
    isSeparateAcquisition: false,
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    standardPriceAtAcquisition: A.H,
    landStandardPriceAtTransfer: T.L,
    buildingStandardPriceAtTransfer: T.N,
    ...extra,
  });
/** a2 — 같은 보유, 양쪽 환산 */
const a2 = (extra: Partial<TransferTaxInput>) =>
  run({
    ...COMMON,
    acquisitionDate: D("2018-03-02"),
    landAcquisitionDate: D("2006-05-10"),
    acquisitionPrice: 0,
    useEstimatedAcquisition: true,
    isSeparateAcquisition: false,
    landAcqMode: "estimated",
    buildingAcqMode: "estimated",
    standardPriceAtAcquisition: A.H,
    standardPriceAtTransfer: T.H,
    ...extra,
  });
/** 수정 후 사용자가 입력하는 형태 — 가목(단가×면적) + 나목 + 결합가 */
const WITH_N = {
  acquisitionArea: 100,
  standardPricePerSqmAtAcquisition: A.L / 100,
  buildingStandardPriceAtAcquisition: A.N,
};

// 기대 스냅샷 — (A) 현행 / (B) 수정 후
const A1_PROP: Snap = {
  calculatedTax: 129_860_000,
  totalTax: 142_846_000,
  taxBase: 389_500_000,
  transferGain: 500_000_000,
  land: { transferPrice: 480_000_000, acquisitionPrice: 280_000_000, appraisalDeduction: 0, gain: 200_000_000, longTermRate: 0.3 },
  building: { transferPrice: 720_000_000, acquisitionPrice: 420_000_000, appraisalDeduction: 0, gain: 300_000_000, longTermRate: 0.16 },
};
/** ⓑ 양도시 분모도 개별주택가격 척도로 비례(448M·672M) — 계획서 §3 a2, PHD 정본과 동치. */
const A2_WIDE: Snap = {
  calculatedTax: 184_060_368,
  totalTax: 202_466_404,
  taxBase: 523_810_402,
  transferGain: 671_314_287,
  land: { transferPrice: 480_000_000, acquisitionPrice: 205_714_285, appraisalDeduction: 5_760_000, gain: 268_525_715, longTermRate: 0.3 },
  building: { transferPrice: 720_000_000, acquisitionPrice: 308_571_428, appraisalDeduction: 8_640_000, gain: 402_788_572, longTermRate: 0.16 },
};

const A3_BODY = (selfOwns?: "building_only" | "land_only") => ({
  propertyType: "housing",
  useEstimatedAcquisition: false,
  transferPrice: 1_200_000_000,
  transferDate: "2026-06-30",
  acquisitionDate: "2018-03-02",
  landAcquisitionDate: "2018-03-02",
  acquisitionPrice: 700_000_000,
  expenses: 0,
  isOneHousehold: false,
  householdHousingCount: 2,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  residencePeriodMonths: 0,
  annualBasicDeductionUsed: 0,
  isSeparateAcquisition: false,
  landAcqMode: "actual",
  buildingAcqMode: "actual",
  standardPriceAtAcquisition: A.H,
  standardPricePerSqmAtAcquisition: A.L / 100,
  acquisitionArea: 100,
  landStandardPriceAtTransfer: T.L,
  buildingStandardPriceAtTransfer: T.N,
  ...(selfOwns ? { selfOwns } : {}),
});
/** 별개 취득 + 나목 입력 + 환산 양쪽 + 양도시 감정평가가액 양쪽 + 양도시 기준시가(파트) 없음 */
const A3_REACH_BODY: Record<string, unknown> = (() => {
  const b: Record<string, unknown> = {
    ...A3_BODY(),
    acquisitionPrice: 0,
    useEstimatedAcquisition: true,
    landAcqMode: "estimated",
    buildingAcqMode: "estimated",
    standardPriceAtTransfer: T.H,
    landAcquisitionDate: "2006-05-10",
    isSeparateAcquisition: true,
    buildingStandardPriceAtAcquisition: A.N,
    landAppraisalAtTransfer: 500_000_000,
    buildingAppraisalAtTransfer: 700_000_000,
    saleSplitMode: "appraisal",
  };
  delete b.landStandardPriceAtTransfer;
  delete b.buildingStandardPriceAtTransfer;
  return b;
})();

/** b1 — 12억 초과 1세대1주택 + 부수토지 배율 초과, 별개 취득(엔진·API 직접 입력) */
const b1 = (extra: Partial<TransferTaxInput>) =>
  run({
    propertyType: "housing",
    transferPrice: 2_000_000_000,
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
    buildingFootprintArea: 25,
    appurtenantLandZone: "metropolitan_residential",
    acquisitionArea: 100,
    ...extra,
  });

// ── (B) 수정 후 기대값 — S3-1 Do에서 it.skip을 푼다 ──────────────────────
describe("(B) S3-1 수정 후 — 비례 안분 + 나목 필수 (Do에서 활성화)", () => {
  it("B-1 a1: 나목 입력 → 토지비율 192/480 = 40% · 취득가 280M/420M · 세액 129,860,000", () => {
    const r = a1(WITH_N);
    expect(snap(r)).toEqual(A1_PROP);
    expect(r.splitDetail?.apportionRatio?.land).toBe(0.4);
    // 결합 공시에서 나온 값이므로 echo는 유지(UI 문구만 비례 서술로)
    expect(r.splitDetail?.building.stdPriceDerivedFromTotal).toBe(true);
  });

  it("B-2 a2 환산(D-1 ⓑ 양도시 분모도 비례): 184,060,368 (양도시 개별주택가격 H_T로 분모를 척도 정리) · 토지 환산취득가 205,714,285 불변", () => {
    const r = a2({ ...WITH_N, landStandardPriceAtTransfer: T.L, buildingStandardPriceAtTransfer: T.N });
    expect(snap(r)).toEqual(A2_WIDE);
  });

  it("B-3 a3 Route: 건물만 74,870,000 / 토지만 42,950,000 (나목 입력)", async () => {
    for (const [selfOwns, tax] of [
      ["building_only", 74_870_000],
      ["land_only", 42_950_000],
    ] as const) {
      const r = await post({ ...A3_BODY(selfOwns), buildingStandardPriceAtAcquisition: A.N });
      expect(r.status, JSON.stringify(r.json.error)).toBe(200);
      expect(taxOf(r.json)).toBe(tax);
    }
  });

  it("B-4 소유자 분리 + 나목 누락은 차단 — 엔진 throw / Route 400 `buildingStandardPriceAtAcquisition` (뺄셈 fallback 금지, Q-3)", async () => {
    const noN = { acquisitionArea: 100, standardPricePerSqmAtAcquisition: A.L / 100 };
    for (const selfOwns of ["building_only", "land_only"] as const) {
      expect(() => a1({ ...noN, selfOwns })).toThrow(/건물 기준시가/);
      const r = await post(A3_BODY(selfOwns));
      expect(r.status).toBe(400);
      expect(fieldKeys(r.json)).toContain("buildingStandardPriceAtAcquisition");
    }
  });

  it("B-4b 소유자 분리가 **아닌** 비-별개는 나목이 없어도 던지지 않는다 — 분할 포기(null, 종전 split-gain.ts:99 규약) · Route 200 (UI 설계 E-4: stale 단가 세션의 막다른 길 방지)", async () => {
    const r = a1({ acquisitionArea: 100, standardPricePerSqmAtAcquisition: A.L / 100 });
    expect(r.splitDetail).toBeUndefined(); // 현행은 뺄셈으로 분할이 돈다(A-1)
    const api = await post(A3_BODY());
    expect(api.status, JSON.stringify(api.json.error)).toBe(200);
  });

  it("B-5 토지만 환산 + 건물 실가에서도 나목이 필요하다(양 파트 OR 술어, 소유자 분리) — 없으면 throw, 있으면 토지 환산취득가 205,714,285(= 480M × 192M ÷ 448M, 분자·분모 모두 비례 척도)", () => {
    const mixed = (extra: Partial<TransferTaxInput>) =>
      run({
        ...COMMON,
        acquisitionDate: D("2018-03-02"),
        landAcquisitionDate: D("2006-05-10"),
        acquisitionPrice: 700_000_000,
        isSeparateAcquisition: false,
        selfOwns: "land_only",
        landAcqMode: "estimated",
        buildingAcqMode: "actual",
        buildingAcquisitionPrice: 400_000_000,
        standardPriceAtAcquisition: A.H,
        standardPriceAtTransfer: T.H,
        acquisitionArea: 100,
        standardPricePerSqmAtAcquisition: A.L / 100,
        landStandardPriceAtTransfer: T.L,
        buildingStandardPriceAtTransfer: T.N,
        ...extra,
      });
    expect(() => mixed({})).toThrow();
    // 분자 192M(취득시 비례) ÷ 분모 448M(양도시 비례) — 척도가 같아 현행(원값/원값) 205,714,285와 일치.
    expect(mixed({ buildingStandardPriceAtAcquisition: A.N }).splitDetail?.land.acquisitionPrice).toBe(205_714_285);
    // 분모를 원값(560M)으로 두면(ⓐ) 164,571,428로 틀어진다 — D-1 ⓑ가 필요한 이유.
    expect(safeMultiplyThenDivide(480_000_000, A_LP, T.L)).toBe(164_571_428);
  });

  it("B-6 b1 별개 취득 + 나목 생략 + 결합 총액만(D-2): 레거시 뺄셈 후퇴가 사라져 엔진 throw (현행 45,128,160)", () => {
    expect(() =>
      b1({
        standardPriceAtAcquisition: A.H,
        standardPricePerSqmAtAcquisition: A.L / 100,
        landStandardPriceAtTransfer: T.L,
        buildingStandardPriceAtTransfer: T.N,
      }),
    ).toThrow();
  });

  it("B-7 A3: 환산 파트 + 양도시 기준시가 없음은 감정평가가액 양쪽이어도 차단 — Route 400 (현행 200 141,615,200)", async () => {
    const r = await post(A3_REACH_BODY);
    expect(r.status).toBe(400);
    expect(fieldKeys(r.json)).toEqual(
      expect.arrayContaining(["landStandardPriceAtTransfer", "buildingStandardPriceAtTransfer"]),
    );
  });
});

// ── (C) 회귀선 — 수정 전후 동일 ──────────────────────────────────────────
describe("(C) 회귀선 — 수정 전후 값이 같아야 한다", () => {
  it("C-1 함께 취득·같은 보유기간(장특 율 동일) — 분할 방식이 세액에 영향 없음: 둘 다 소유 141,060,000 (Route, 나목 유무 무관)", async () => {
    const noN = await post(A3_BODY());
    const withN = await post({ ...A3_BODY(), buildingStandardPriceAtAcquisition: A.N });
    expect(taxOf(noN.json)).toBe(141_060_000);
    expect(taxOf(withN.json)).toBe(141_060_000);
    // 재구현(비례 토지분)으로도 같다 — 토지·건물 합 불변
    const prop = await post({ ...A3_BODY(), acquisitionArea: 1, standardPricePerSqmAtAcquisition: A_LP });
    expect(taxOf(prop.json)).toBe(141_060_000);
  });

  it("C-2 별개 취득 + 나목 입력은 파트 독립(결합가 미참조) — 환산 양쪽 182,874,960 · 쌍 {240M, 360M} · 비율 40%", () => {
    const sep = run({
      ...COMMON,
      acquisitionDate: D("2018-03-02"),
      landAcquisitionDate: D("2006-05-10"),
      acquisitionPrice: 0,
      useEstimatedAcquisition: true,
      isSeparateAcquisition: true,
      landAcqMode: "estimated",
      buildingAcqMode: "estimated",
      acquisitionArea: 100,
      standardPricePerSqmAtAcquisition: A.L / 100,
      buildingStandardPriceAtAcquisition: A.N,
      standardPriceAtTransfer: T.H,
      landStandardPriceAtTransfer: T.L,
      buildingStandardPriceAtTransfer: T.N,
    });
    expect(sep.calculatedTax).toBe(182_874_960);
    expect(sep.totalTax).toBe(201_162_456);
    expect(sep.splitDetail?.land.acquisitionPrice).toBe(205_714_285); // 480M × 240/560
    expect(sep.splitDetail?.building.acquisitionPrice).toBe(308_571_428); // 720M × 360/840
    expect(sep.splitDetail?.apportionRatio?.land).toBe(0.4);
    expect(sep.splitDetail?.building.stdPriceDerivedFromTotal).toBe(false);
    // 결합 총액을 넣어도 무시된다(파트 독립)
    const withTotal = run({
      ...COMMON,
      acquisitionDate: D("2018-03-02"),
      landAcquisitionDate: D("2006-05-10"),
      acquisitionPrice: 0,
      useEstimatedAcquisition: true,
      isSeparateAcquisition: true,
      landAcqMode: "estimated",
      buildingAcqMode: "estimated",
      acquisitionArea: 100,
      standardPricePerSqmAtAcquisition: A.L / 100,
      buildingStandardPriceAtAcquisition: A.N,
      standardPriceAtAcquisition: 999_999_999,
      standardPriceAtTransfer: T.H,
      landStandardPriceAtTransfer: T.L,
      buildingStandardPriceAtTransfer: T.N,
    });
    expect(snap(withTotal)).toEqual(snap(sep));
  });

  it("C-3 PHD §164⑦(이미 비례) 불변 — 세액 26,100,130", () => {
    const phd = run({
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
      landSplitMode: "apportioned",
      preHousingDisclosure: PHD_INPUT,
    } as Partial<TransferTaxInput>);
    expect(phd.calculatedTax).toBe(26_100_130);
    expect(phd.totalTax).toBe(28_710_143);
  });

  it("C-4 양도가액 토지·건물 안분은 이미 가목:나목 비례 — 480M/720M, 개별주택가격(standardPriceAtTransfer)과 무관", () => {
    const x = a1({ ...WITH_N, standardPriceAtTransfer: 600_000_000 });
    const y = a1({ ...WITH_N, standardPriceAtTransfer: 2_400_000_000 });
    expect(x.splitDetail?.land.transferPrice).toBe(480_000_000);
    expect(x.splitDetail?.building.transferPrice).toBe(720_000_000);
    expect(snap(x)).toEqual(snap(y));
  });

  it("C-5 일반건물(propertyType=building) 비-별개는 이번 범위 밖 — 레거시 뺄셈 쌍 {240M, 240M} · 세액 236,137,680 유지", () => {
    const input = {
      ...COMMON,
      propertyType: "building",
      acquisitionDate: D("2018-03-02"),
      landAcquisitionDate: D("2018-03-02"),
      acquisitionPrice: 0,
      useEstimatedAcquisition: true,
      isSeparateAcquisition: false,
      landAcqMode: "estimated",
      buildingAcqMode: "estimated",
      standardPriceAtAcquisition: A.H,
      acquisitionArea: 100,
      standardPricePerSqmAtAcquisition: A.L / 100,
      standardPriceAtTransfer: T.H,
      landStandardPriceAtTransfer: T.L,
      buildingStandardPriceAtTransfer: T.N,
    } as Partial<TransferTaxInput>;
    expect(calcAcqStdPair(baseTransferInput(input))).toEqual({ land: A.L, building: A.H - A.L, buildingDerived: true });
    expect(run(input).calculatedTax).toBe(236_137_680);
  });

  it("C-6 거짓 요구 금지 — 양쪽 실가 + 두 파트 취득가액 직접입력이면 쌍이 소비되지 않으므로 나목 없이 통과, 세액 141,060,000", () => {
    const r = run({
      ...COMMON,
      acquisitionDate: D("2018-03-02"),
      landAcquisitionDate: D("2018-03-02"),
      acquisitionPrice: 700_000_000,
      isSeparateAcquisition: false,
      landAcqMode: "actual",
      buildingAcqMode: "actual",
      landAcquisitionPrice: 300_000_000,
      buildingAcquisitionPrice: 400_000_000,
      landStandardPriceAtTransfer: T.L,
      buildingStandardPriceAtTransfer: T.N,
      // 취득시 기준시가·나목 모두 없음
    });
    expect(r.calculatedTax).toBe(141_060_000);
    expect(r.splitDetail?.land.acquisitionPrice).toBe(300_000_000);
    expect(r.splitDetail?.building.acquisitionPrice).toBe(400_000_000);
  });
});
