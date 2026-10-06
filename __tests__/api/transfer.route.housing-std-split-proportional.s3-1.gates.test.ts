/**
 * S3-1 게이트 — ⑫ 400 · ④ 전송 조건 · E-4 막다른 길 없음 · `stdSplit` echo 범위 · 큰 금액 정밀도.
 *
 * 격자 패리티(⑤⑧④⑫엔진)는 `__tests__/calc/owner-split-building-std-leaf-parity.test.ts`가 맡는다.
 * 여기서는 개별 시나리오를 이름 붙여 고정한다. 값 근거는 `…s3-1.predo.anchor.test.ts`와 같은 가상 fixture
 * (취득시 H 480M · L 240M · N 360M / 양도시 H 1,120M · L 560M · N 840M).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { calcSplitGain } from "@/lib/tax-engine/transfer-tax-split-gain";
import { buildSplitPayload } from "@/lib/calc/transfer-tax-api-split";
import { validateSplitDirectInputs } from "@/lib/calc/transfer-tax-validate-split";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { baseTransferInput, makeMockRates } from "../tax-engine/_helpers/mock-rates";
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

type Json = { error?: { fieldErrors?: Record<string, unknown> } ; data?: { result?: { splitDetail?: { stdSplit?: unknown } } } };
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
const fieldKeys = (j: Json) => Object.keys(j.error?.fieldErrors ?? {});

const BODY: Record<string, unknown> = {
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
  standardPriceAtAcquisition: 480_000_000,
  standardPricePerSqmAtAcquisition: 2_400_000,
  acquisitionArea: 100,
  landStandardPriceAtTransfer: 560_000_000,
  buildingStandardPriceAtTransfer: 840_000_000,
  selfOwns: "building_only",
  buildingStandardPriceAtAcquisition: 360_000_000,
};

describe("⑫ Route 400 — 소유자 분리 + 비례 입력", () => {
  it("나목 + 총액 + 단가·면적 모두 있으면 200 (기준선)", async () => {
    const r = await post(BODY);
    expect(r.status, JSON.stringify(r.json.error)).toBe(200);
    // echo — 일반 주택 비-별개 비례 안분 내역이 결과에 실린다
    expect(r.json.data?.result?.splitDetail?.stdSplit).toEqual({
      housingTotal: 480_000_000,
      landStd: 240_000_000,
      buildingStd: 360_000_000,
      landBasis: 192_000_000,
      buildingBasis: 288_000_000,
    });
  });

  it("D-2 별개 취득 + 나목 생략 + 환산(결합 총액만) → 400 buildingStandardPriceAtAcquisition (레거시 뺄셈 후퇴 제거)", async () => {
    const r = await post({
      ...BODY,
      selfOwns: undefined,
      useEstimatedAcquisition: true,
      acquisitionPrice: 0,
      landAcqMode: "estimated",
      buildingAcqMode: "estimated",
      standardPriceAtTransfer: 1_120_000_000,
      landAcquisitionDate: "2006-05-10",
      isSeparateAcquisition: true,
      buildingStandardPriceAtAcquisition: undefined,
    });
    expect(r.status).toBe(400);
    expect(fieldKeys(r.json)).toContain("buildingStandardPriceAtAcquisition");
  });

  it("환산 + 주택 비-별개: 나목이 있어도 결합 총액(비례의 분자)이 없으면 400 standardPriceAtAcquisition — 나목이 총액 필수를 면제하지 않는다", async () => {
    const r = await post({
      ...BODY,
      selfOwns: undefined,
      useEstimatedAcquisition: true,
      acquisitionPrice: 0,
      landAcqMode: "estimated",
      buildingAcqMode: "estimated",
      standardPriceAtTransfer: 1_120_000_000,
      standardPriceAtAcquisition: undefined,
    });
    expect(r.status).toBe(400);
    expect(fieldKeys(r.json)).toContain("standardPriceAtAcquisition");
  });

  it("환산 파트(소유자 분리) + 양도시 개별주택가격 없음 → 400 standardPriceAtTransfer (환산 분모도 비례)", async () => {
    const r = await post({ ...BODY, buildingAcqMode: "estimated", buildingAcquisitionPrice: undefined });
    expect(r.status).toBe(400);
    expect(fieldKeys(r.json)).toContain("standardPriceAtTransfer");
  });

  it("환산 파트(소유자 분리) + 양도시 개별주택가격 있음 → 200", async () => {
    const r = await post({
      ...BODY,
      buildingAcqMode: "estimated",
      standardPriceAtTransfer: 1_120_000_000,
    });
    expect(r.status, JSON.stringify(r.json.error)).toBe(200);
  });

  it("부정 짝: 소유자 분리여도 본인 파트 취득가액을 직접 입력하면(비율 불요) 나목이 없어도 200", async () => {
    const r = await post({
      ...BODY,
      buildingStandardPriceAtAcquisition: undefined,
      buildingAcquisitionPrice: 400_000_000,
      landAcquisitionPrice: 300_000_000,
    });
    expect(r.status, JSON.stringify(r.json.error)).toBe(200);
  });
});

describe("E-4 — 소유자 분리 ON → 단가 입력 → OFF: 칸 없는 요구(막다른 길)가 없다", () => {
  const stale = (over: Partial<AssetForm> = {}): AssetForm =>
    ({
      ...makeDefaultAsset(1),
      assetKind: "housing",
      acquisitionCause: "purchase",
      acquisitionDate: "2018-03-02",
      hasSeperateLandAcquisitionDate: true, // 소유자 분리 토글이 매매에서 같이 켠 값 — OFF해도 남는다
      landAcquisitionDate: "2018-03-02",
      selfOwns: "both", // OFF
      landAcqMode: "estimated",
      buildingAcqMode: "estimated",
      standardPriceAtAcq: "480,000,000",
      standardPricePerSqmAtAcq: "2,400,000",
      acquisitionArea: "100",
      buildingStandardPriceAtAcq: "", // 소유자 분리 상태에서 입력하지 않았거나 숨겨짐
      saleSplitMode: "apportioned",
      standardPricePerSqmAtTransfer: "5,600,000",
      transferArea: "100",
      buildingStandardPriceAtTransfer: "840,000,000",
      ...over,
    }) as AssetForm;

  it("⑧ 나목·양도시 개별주택가격을 요구하지 않는다 / ④ 보내지 않는다 / 엔진은 던지지 않고 분할을 포기한다", () => {
    const a = stale();
    expect(validateSplitDirectInputs(a, "자산 1") ?? "").not.toMatch(/건물 기준시가를 계산기로|개별주택가격으로 환산/);
    const split = buildSplitPayload(a, { isBurdenedGift: false, usesPhd: false, ratioed: () => undefined });
    expect(split.buildingStandardPriceAtAcquisition).toBeUndefined();
    expect(split.standardPriceAtTransfer).toBeUndefined();
    const input = baseTransferInput({
      propertyType: "housing",
      transferPrice: 1_200_000_000,
      transferDate: new Date("2026-06-30"),
      acquisitionDate: new Date("2018-03-02"),
      landAcquisitionDate: new Date("2018-03-02"),
      acquisitionPrice: 0,
      useEstimatedAcquisition: true,
      isSeparateAcquisition: false,
      landAcqMode: "estimated",
      buildingAcqMode: "estimated",
      standardPriceAtAcquisition: 480_000_000,
      standardPricePerSqmAtAcquisition: 2_400_000,
      acquisitionArea: 100,
      standardPriceAtTransfer: 1_120_000_000,
      landStandardPriceAtTransfer: 560_000_000,
      buildingStandardPriceAtTransfer: 840_000_000,
    });
    expect(() => calcSplitGain(input)).not.toThrow();
    expect(calcSplitGain(input)).toBeNull();
  });
});

describe("④ 전송 — 별개 취득은 결합 총액을 덮어쓰고, 소유자 분리 비례는 총액을 그대로 둔다", () => {
  const owner = (over: Partial<AssetForm> = {}): AssetForm =>
    ({
      ...makeDefaultAsset(1),
      assetKind: "housing",
      acquisitionCause: "purchase",
      acquisitionDate: "2018-03-02",
      hasSeperateLandAcquisitionDate: true,
      landAcquisitionDate: "2018-03-02",
      selfOwns: "building_only",
      landAcqMode: "actual",
      buildingAcqMode: "actual",
      standardPriceAtAcq: "480,000,000",
      standardPricePerSqmAtAcq: "2,400,000",
      acquisitionArea: "100",
      buildingStandardPriceAtAcq: "360,000,000",
      ...over,
    }) as AssetForm;
  const payload = (a: AssetForm) =>
    buildSplitPayload(a, { isBurdenedGift: false, usesPhd: false, ratioed: () => undefined });

  it("소유자 분리 + 비례: 나목 전송 · standardPriceAtAcquisition 키는 덮어쓰지 않는다(본체 값 유지)", () => {
    const p = payload(owner());
    expect(p.buildingStandardPriceAtAcquisition).toBe(360_000_000);
    expect("standardPriceAtAcquisition" in p).toBe(false);
  });

  it("별개 취득: 나목 전송 + 결합 총액은 undefined로 덮어쓴다(종전 규약 — 회귀 0)", () => {
    const p = payload(owner({ selfOwns: "both", landAcquisitionDate: "2006-05-10" }));
    expect(p.buildingStandardPriceAtAcquisition).toBe(360_000_000);
    expect("standardPriceAtAcquisition" in p).toBe(true);
    expect(p.standardPriceAtAcquisition).toBeUndefined();
  });

  it("stale 나목(소유자 분리 OFF · 취득일 동일): 숨은 값은 전송되지 않는다", () => {
    const p = payload(owner({ selfOwns: "both" }));
    expect(p.buildingStandardPriceAtAcquisition).toBeUndefined();
  });

  it("본인 파트 취득가액 직접 입력(비율 불요) → 나목 미전송", () => {
    const p = payload(owner({ landAcqMode: "actual", buildingAcqMode: "actual", buildingAcquisitionPrice: "400,000,000", landAcquisitionPrice: "300,000,000" }));
    expect(p.buildingStandardPriceAtAcquisition).toBeUndefined();
  });

  it("환산 파트: 양도시 개별주택가격 전송(자산 환산 플래그가 꺼져 있어도) / 환산 파트 없으면 미전송", () => {
    expect(payload(owner({ buildingAcqMode: "estimated", standardPriceAtTransfer: "1,120,000,000" })).standardPriceAtTransfer).toBe(1_120_000_000);
    expect(payload(owner({ standardPriceAtTransfer: "1,120,000,000" })).standardPriceAtTransfer).toBeUndefined();
  });
});

describe("`stdSplit` echo 범위 · 정밀도", () => {
  const house = (over: Partial<TransferTaxInput>) =>
    baseTransferInput({
      propertyType: "housing",
      transferPrice: 1_200_000_000,
      transferDate: new Date("2026-06-30"),
      acquisitionDate: new Date("2018-03-02"),
      landAcquisitionDate: new Date("2018-03-02"),
      acquisitionPrice: 700_000_000,
      isSeparateAcquisition: false,
      landAcqMode: "actual",
      buildingAcqMode: "actual",
      standardPriceAtAcquisition: 480_000_000,
      standardPricePerSqmAtAcquisition: 2_400_000,
      acquisitionArea: 100,
      buildingStandardPriceAtAcquisition: 360_000_000,
      landStandardPriceAtTransfer: 560_000_000,
      buildingStandardPriceAtTransfer: 840_000_000,
      ...over,
    });

  it("일반 주택 비-별개에만 존재 — 별개 취득·일반건물은 없다(E-3)", () => {
    expect(calcSplitGain(house({}))?.stdSplit).toBeDefined();
    expect(
      calcSplitGain(house({ isSeparateAcquisition: true, landAcquisitionDate: new Date("2006-05-10"), landAcquisitionPrice: 300_000_000, buildingAcquisitionPrice: 400_000_000 }))?.stdSplit,
    ).toBeUndefined();
    expect(calcSplitGain(house({ propertyType: "building" }))?.stdSplit).toBeUndefined();
  });

  it("건물분 = 총액 − 토지분(잔액 흡수) · 곱이 안전 정수를 넘는 고가(BigInt 경로)도 독립 BigInt 재구현과 1원 일치", () => {
    const H = 9_000_000_000;
    const L = 5_000_000_000; // 단가 50,000,000 × 100㎡
    const N = 7_000_000_000;
    const r = calcSplitGain(
      house({
        standardPriceAtAcquisition: H,
        standardPricePerSqmAtAcquisition: L / 100,
        buildingStandardPriceAtAcquisition: N,
      }),
    );
    const expectedLand = Number((BigInt(H) * BigInt(L)) / BigInt(L + N));
    expect(r?.stdSplit?.landBasis).toBe(expectedLand);
    expect(r?.stdSplit?.buildingBasis).toBe(H - expectedLand);
    expect((r?.stdSplit?.landBasis ?? 0) + (r?.stdSplit?.buildingBasis ?? 0)).toBe(H);
  });

  it("H < L(결합가가 토지 기준시가보다 작음)에서도 건물분이 양수 — 뺄셈은 0으로 clamp했다", () => {
    const r = calcSplitGain(
      house({ standardPriceAtAcquisition: 483_000_000, standardPricePerSqmAtAcquisition: 2_369_000, acquisitionArea: 212, buildingStandardPriceAtAcquisition: 220_890_540 }),
    );
    expect(r?.stdSplit?.buildingBasis).toBeGreaterThan(0);
    expect((r?.stdSplit?.landBasis ?? 0) + (r?.stdSplit?.buildingBasis ?? 0)).toBe(483_000_000);
  });
});
