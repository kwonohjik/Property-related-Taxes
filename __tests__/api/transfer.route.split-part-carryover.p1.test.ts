/**
 * 주택 split 파트 이월과세(소득세법 §97의2①) P1 — 엔진·API 구현 anchor (2026-10-19)
 *
 * 설계: docs/02-design/features/transfer-split-part-carryover.engine.design.md · 계획서 §11 (I-1~I-9)
 * Pre-Do anchor(`...predo.anchor.test.ts`)가 SPCO-T1~T16(핵심 수치·차단 게이트)을 고정한다. 이 파일은 그 밖의 분기를 잠근다:
 * 증여자 자본적지출(시행시기 가드)·적격 배제(기간·관계)·⑫ 값 검사·B·C 호스트 required 좁히기·V-5 지분 스케일·V-6 중과·ⓐ 독립 proxy 대조.
 *
 * 🔑 기대값의 정본은 **독립 proxy**다 — 같은 route에 «파트 이월과세 키 없이» 증여자 취득일·취득가액을 치환한 **일반 split**을 넣은 결과.
 * 해결자가 만든 입력과 proxy 입력이 같은 세액을 내면 치환·한도·경비 합산이 맞다는 뜻이고, 둘이 같은 코드를 타지 않는다.
 * mock 세율 — 같은 시드끼리 상대 비교만 의미가 있다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

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

const BASE = {
  propertyType: "housing",
  useEstimatedAcquisition: false,
  transferPrice: 1_200_000_000,
  transferDate: "2025-06-30",
  acquisitionPrice: 0,
  expenses: 0,
  isOneHousehold: false,
  householdHousingCount: 2,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  residencePeriodMonths: 0,
  annualBasicDeductionUsed: 0,
  isSeparateAcquisition: true,
  landAcqMode: "actual",
  buildingAcqMode: "actual",
  saleSplitMode: "actual",
  landTransferPrice: 700_000_000,
  buildingTransferPrice: 500_000_000,
  landStandardPriceAtTransfer: 700_000_000,
  buildingStandardPriceAtTransfer: 500_000_000,
  acquisitionCause: "purchase",
};

const req = (url: string, b: object) =>
  new NextRequest(`http://localhost${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(b),
  });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Out = { status: number; body: any; r: any };

/** `__DEL__`은 BASE 키를 지운다. */
async function post(over: Record<string, unknown>, base: Record<string, unknown> = BASE): Promise<Out> {
  const merged: Record<string, unknown> = { ...base, ...over };
  for (const k of Object.keys(merged)) if (merged[k] === "__DEL__") delete merged[k];
  const res = await POST(req("/api/calc/transfer", merged));
  const body = await res.json();
  return { status: res.status, body, r: body?.data?.result };
}

const fieldErrors = (o: Out): Record<string, string[]> => o.body?.error?.fieldErrors ?? {};

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

// ─────────────────────────────────────────────────────────────────────────
// 시드
// ─────────────────────────────────────────────────────────────────────────

/** 자산 단위 이월과세 서브객체(현행 top-level `carryoverTaxation`) — 증여자 취득일·가액을 1벌만 받는다. */
const TOP_CT = (donorAcquisitionDate: string) => ({
  giftRegistryDate: "2023-03-01",
  donorAcquisitionDate,
  donorAcquisitionPrice: 100_000_000,
  useEstimatedAcquisition: false,
  giftTaxAmount: 30_000_000,
  giftDateValuation: 900_000_000,
  donorRelation: "lineal",
  exclusionDeclared: {},
});
/** C1/C2 — 통째 이월과세(split 입력 없음). 증여자가 토지·건물을 다른 날 취득했어도 칸이 1벌이다. */
const WHOLE_HOUSE_CARRYOVER = (donorAcquisitionDate: string) => ({
  acquisitionCause: "carryover_gift",
  acquisitionDate: "2023-03-01",
  landAcquisitionDate: "__DEL__",
  isSeparateAcquisition: "__DEL__",
  landAcqMode: "__DEL__",
  buildingAcqMode: "__DEL__",
  saleSplitMode: "__DEL__",
  landTransferPrice: "__DEL__",
  buildingTransferPrice: "__DEL__",
  landStandardPriceAtTransfer: "__DEL__",
  buildingStandardPriceAtTransfer: "__DEL__",
  carryoverTaxation: TOP_CT(donorAcquisitionDate),
});

/** A — 토지만 이월과세(증여자 2000-01-01 취득 1억 · 증여세 산출 2천만 · 과세가액 3억) + 건물 2021-03-01 매매 4억. */
const A_FIELDS = {
  acquisitionDate: "2021-03-01",
  buildingAcquisitionPrice: 400_000_000,
  landAcquisitionDate: "2023-03-01",
  landAcquisitionPrice: 300_000_000, // 증여일 평가액 = ②3호 B 취득가액 = 영 §163의2② 안분 분자
  landAcquisitionCause: "carryover_gift",
};
/** 설계서 §1 — 와이어: 증여 사건 1벌 + 파트 N벌(최상위 형제 키). 파트에는 평가액이 없다(`*AcquisitionPrice`가 정본). */
const EVENT = (over: Record<string, unknown> = {}) => ({
  giftRegistryDate: "2023-03-01",
  giftTaxCalculated: 20_000_000,
  giftTaxBase: 300_000_000,
  donorRelation: "lineal",
  ...over,
});
const LAND_PART = (over: Record<string, unknown> = {}) => ({
  donorAcquisitionDate: "2000-01-01",
  donorAcquisitionPrice: 100_000_000,
  ...over,
});
const A_NEW = { ...A_FIELDS, carryoverGiftEvent: EVENT(), landCarryoverPart: LAND_PART() };

/** B — 건물만 이월과세(증여자 2015-06-01 취득 1억 · 증여세 2천만 · 과세가액 4억) + 토지 2008-01-01 매매 1.2억. */
const B_FIELDS = {
  acquisitionCause: "carryover_gift",
  acquisitionDate: "2023-03-01",
  buildingAcquisitionPrice: 400_000_000,
  landAcquisitionCause: "purchase",
  landAcquisitionDate: "2008-01-01",
  landAcquisitionPrice: 120_000_000,
};
const B_NEW = {
  ...B_FIELDS,
  carryoverGiftEvent: EVENT({ giftTaxBase: 400_000_000 }),
  buildingCarryoverPart: { donorAcquisitionDate: "2015-06-01", donorAcquisitionPrice: 100_000_000 },
};

/** C — 주택 통째 이월과세인데 증여자가 토지 1995-03-01(5천만)·건물 2015-06-01(5천만)을 따로 취득. 증여세 산출 3천만 · 과세가액 9억(토지 2.4억/건물 6.6억). */
const C_FIELDS = {
  acquisitionCause: "carryover_gift",
  acquisitionDate: "2023-03-01",
  buildingAcquisitionPrice: 660_000_000,
  landAcquisitionCause: "carryover_gift",
  landAcquisitionDate: "2023-03-01",
  landAcquisitionPrice: 240_000_000,
  isSeparateAcquisition: false, // 수증자 쪽 두 취득일이 같은 날 — ④가 파생하는 값(설계서 §2.3)
};
const C_NEW = {
  ...C_FIELDS,
  carryoverGiftEvent: EVENT({ giftTaxCalculated: 30_000_000, giftTaxBase: 900_000_000 }),
  landCarryoverPart: LAND_PART({ donorAcquisitionDate: "1995-03-01", donorAcquisitionPrice: 50_000_000 }),
  buildingCarryoverPart: { donorAcquisitionDate: "2015-06-01", donorAcquisitionPrice: 50_000_000 },
};


const num = (o: Out) => o.r?.determinedTax as number;

describe("P1-1 A 증여자 자본적지출 (§97의2①2호, 2024.1.1. 이후 양도분만)", () => {
  it("양도 2025: 증여자 자본적지출 1천만이 토지 필요경비에 더해진다 — 증여세 상당액 2천만과 합 3천만 (독립 proxy와 같은 세액)", async () => {
    // 증여자 취득가 6천만 — 경비가 커져도 A가 B(169,860,000)보다 작아지지 않아 ②3호가 A를 유지하는 입력
    const part = LAND_PART({ donorAcquisitionPrice: 60_000_000, donorCapitalExpenditure: 10_000_000 });
    const o = await post({ ...A_NEW, landCarryoverPart: part });
    expect(o.status).toBe(200);
    const proxy = await post({
      ...A_FIELDS, landAcquisitionCause: "__DEL__", landAcquisitionDate: "2000-01-01", landAcquisitionPrice: 60_000_000, landDirectExpenses: 30_000_000,
    });
    expect(num(o)).toBe(num(proxy));
    const land = o.r.splitDetail.land;
    expect(land.directExpenses).toBe(30_000_000);
    expect(land.carryover).toMatchObject({ judgment: "applied", donorCapexAdded: 10_000_000, donorCapexGuardApplied: false, giftTaxAddedToExpense: 20_000_000 });
    // 자본적지출이 세액을 실제로 움직인다 — 같은 입력에서 자본적지출만 뺀 값보다 작다
    const noCapex = await post({ ...A_NEW, landCarryoverPart: LAND_PART({ donorAcquisitionPrice: 60_000_000 }) });
    expect(num(o)).toBeLessThan(num(noCapex));
  });

  it("②3호가 자본적지출까지 반영해 비교한다: 증여자 취득가 1억 + 자본적지출 1천만이면 A(169,460,000) < B(169,860,000) → 미적용(tax_comparison)", async () => {
    const o = await post({ ...A_NEW, landCarryoverPart: LAND_PART({ donorCapitalExpenditure: 10_000_000 }) });
    expect(o.status).toBe(200);
    expect(num(o)).toBe(169_860_000);
    expect(o.r.splitDetail.land.carryover).toMatchObject({
      judgment: "excluded", exclusionReason: "tax_comparison", donorCapexAdded: 0, giftTaxAddedToExpense: 0,
      comparison: { determinedTaxWithCarryover: 169_460_000, determinedTaxWithout: 169_860_000 },
    });
  });

  it("양도 2023-09-30(2024.1.1. 전): 시행시기 가드 — 증여자 자본적지출은 0 처리, echo에 가드 발동이 남는다(세액은 입력 유무와 무관)", async () => {
    const withCapex = await post({ ...A_NEW, transferDate: "2023-09-30", landCarryoverPart: LAND_PART({ donorCapitalExpenditure: 10_000_000 }) });
    const without = await post({ ...A_NEW, transferDate: "2023-09-30" });
    expect(withCapex.status).toBe(200);
    expect(num(withCapex)).toBe(num(without));
    expect(withCapex.r.splitDetail.land.carryover).toMatchObject({ donorCapexAdded: 0, donorCapexGuardApplied: true });
  });
});

describe("P1-2 적격 배제 — 기간(③)·관계(①)는 ②3호 비교 없이 두 파트 B 고정", () => {
  // 증여 2013-03-01 → 양도 2025-06-30은 12년(> 10년, 2023.1.1. 전 증여라 5년 창)
  const OLD_GIFT = {
    ...A_NEW,
    landAcquisitionDate: "2013-03-01",
    carryoverGiftEvent: EVENT({ giftRegistryDate: "2013-03-01" }),
  };
  it("기간 초과(period_exceeded): 증여자 값이 쓰이지 않는다 — 이월과세 키 없는 일반 split(증여일 기산)과 같은 세액 · 비교 echo 없음", async () => {
    const o = await post(OLD_GIFT);
    expect(o.status).toBe(200);
    const proxy = await post({ ...A_FIELDS, landAcquisitionCause: "__DEL__", landAcquisitionDate: "2013-03-01" });
    expect(num(o)).toBe(num(proxy));
    const land = o.r.splitDetail.land;
    expect(land.carryover).toMatchObject({ judgment: "excluded", exclusionReason: "period_exceeded", donorCapexAdded: 0, giftTaxAddedToExpense: 0 });
    expect(land.carryover.comparison).toBeUndefined();
    expect(land.acquisitionDate).toBe("2013-03-01"); // 장특 기산 = 증여 등기접수일
    expect(land.acquisitionPrice).toBe(300_000_000); // B 취득가액 = 증여 당시 평가액
  });

  it("관계 요건 불충족(relation other): 같은 B 고정 · 증여자 값 검사(평가액 합 ≤ 과세가액)는 건너뛴다", async () => {
    const o = await post({
      ...A_NEW,
      carryoverGiftEvent: EVENT({ donorRelation: "other", giftTaxBase: 100_000_000 }), // 평가액 3억 > 과세가액 1억이어도 통과
    });
    expect(o.status).toBe(200);
    expect(o.r.splitDetail.land.carryover).toMatchObject({ judgment: "excluded", exclusionReason: "relation_invalid" });
    expect(num(o)).toBe(169_860_000); // 이월과세 없는 단순 증여 값
  });

  it("건물 B도 같다: 건물 이월과세 + 기간 초과 → 증여일 기산(B)", async () => {
    const o = await post({
      ...B_NEW, acquisitionDate: "2013-03-01",
      carryoverGiftEvent: EVENT({ giftRegistryDate: "2013-03-01", giftTaxBase: 400_000_000 }),
      buildingCarryoverPart: { donorAcquisitionDate: "2005-06-01", donorAcquisitionPrice: 100_000_000 },
    });
    expect(o.status).toBe(200);
    expect(o.r.splitDetail.building.carryover).toMatchObject({ judgment: "excluded", exclusionReason: "period_exceeded" });
    expect(o.r.splitDetail.building.acquisitionDate).toBe("2013-03-01");
  });
});

describe("P1-3 ⑫ 값 검사·B·C 호스트 required 좁히기", () => {
  it("파트 평가액 합이 증여세 과세가액을 넘으면 400 · carryoverGiftEvent.giftTaxBase (일반건물 refineGbCarryover의 거울)", async () => {
    const o = await post({ ...C_NEW, carryoverGiftEvent: EVENT({ giftTaxCalculated: 30_000_000, giftTaxBase: 800_000_000 }) }); // 토지 2.4억 + 건물 6.6억 = 9억 > 8억
    expect(o.status).toBe(400);
    expect(Object.keys(fieldErrors(o))).toContain("carryoverGiftEvent.giftTaxBase");
  });

  it("증여자 취득일이 증여 등기접수일보다 늦으면 400 · landCarryoverPart.donorAcquisitionDate", async () => {
    const o = await post({ ...A_NEW, landCarryoverPart: LAND_PART({ donorAcquisitionDate: "2023-03-02" }) });
    expect(o.status).toBe(400);
    expect(Object.keys(fieldErrors(o))).toContain("landCarryoverPart.donorAcquisitionDate");
  });

  it("증여자 취득가액 0은 파트 환산이 없으므로(I-4) 400 · landCarryoverPart.donorAcquisitionPrice", async () => {
    const o = await post({ ...A_NEW, landCarryoverPart: LAND_PART({ donorAcquisitionPrice: 0 }) });
    expect(o.status).toBe(400);
    expect(Object.keys(fieldErrors(o))).toContain("landCarryoverPart.donorAcquisitionPrice");
  });

  it("I-9: B·C 호스트(acquisitionCause carryover_gift)는 자산 단위 carryoverTaxation 없이 통과하지만, 파트 서브객체도 없는 통째 이월과세는 종전대로 carryoverTaxation 필수", async () => {
    const b = await post(B_NEW);
    expect(b.status).toBe(200);
    expect(fieldErrors(b).carryoverTaxation).toBeUndefined();
    const whole = await post({ ...WHOLE_HOUSE_CARRYOVER("1995-03-01"), carryoverTaxation: "__DEL__" });
    expect(whole.status).toBe(400);
    expect(Object.keys(fieldErrors(whole))).toContain("carryoverTaxation");
  });

  it("S8: 자산 단위 필요경비 총액(expenses)이 있으면 파트 이월과세와 함께 못 쓴다 → 400 · expenses", async () => {
    const o = await post({ ...A_NEW, expenses: 5_000_000 });
    expect(o.status).toBe(400);
    expect(Object.keys(fieldErrors(o))).toContain("expenses");
  });

  it("토지·건물 분리 계산 대상이 아닌 자산(토지)에 실린 파트 이월과세는 조용히 버려지지 않고 400", async () => {
    const o = await post({ ...A_NEW, propertyType: "land" });
    expect(o.status).toBe(400);
    expect(Object.keys(fieldErrors(o))).toEqual(expect.arrayContaining(["landCarryoverPart", "carryoverGiftEvent"]));
  });
});

describe("P1-4 1세대1주택과 겹쳐도 400이 아니다 (P5 — S9 게이트 삭제, 해결자의 §97의2②2호 판정)", () => {
  const ONE_HOUSE = {
    isOneHousehold: true, householdHousingCount: 1, transferPrice: 800_000_000, landTransferPrice: 500_000_000, buildingTransferPrice: 300_000_000,
    landStandardPriceAtTransfer: 500_000_000, buildingStandardPriceAtTransfer: 300_000_000, landAcquisitionPrice: 300_000_000, buildingAcquisitionPrice: 200_000_000,
  };
  it("주택 + 1세대1주택(B 건물 증여 2년 3개월) → 200 · 이미 비과세라 ②2호 미발동 · 이월과세 적용 (T10과 같은 입력의 B 변형)", async () => {
    const b = await post({ ...B_NEW, ...ONE_HOUSE, buildingAcquisitionPrice: 400_000_000, landAcquisitionPrice: 120_000_000 });
    expect(b.status).toBe(200);
    expect(b.r.determinedTax).toBe(0);
    expect(b.r.splitDetail.building.carryover.judgment).toBe("applied");
  });
  it("비주택 건물(building) + isOneHousehold → 닫지 않는다(비과세 평가가 없다)", async () => {
    const o = await post({ ...A_NEW, propertyType: "building", ...ONE_HOUSE, landAcquisitionPrice: 300_000_000, buildingAcquisitionPrice: 400_000_000 });
    expect(Object.keys(fieldErrors(o))).not.toContain("isOneHousehold");
  });
  it("미등기 양도는 닫지 않는다(비과세 평가가 시작되지 않는다)", async () => {
    const o = await post({ ...A_NEW, ...ONE_HOUSE, isUnregistered: true, landAcquisitionPrice: 300_000_000, buildingAcquisitionPrice: 400_000_000 });
    expect(Object.keys(fieldErrors(o))).not.toContain("isOneHousehold");
  });
});

describe("P1-5 V-5 지분(ownershipRatio) — 파트 금액·평가액만 스케일, 사건은 스케일하지 않는다 (I-3)", () => {
  // ④ `ratioed`(= floor)로 스케일한 payload를 직접 만든다: 양도가·취득가·증여자 취득가·평가액·자본적지출은 ×r, 사건(산출세액·과세가액)·기준시가는 그대로.
  const scaled = (r: number) => ({
    ...A_NEW,
    ownershipRatio: r,
    transferPrice: Math.floor(1_200_000_000 * r),
    landTransferPrice: Math.floor(700_000_000 * r),
    buildingTransferPrice: Math.floor(500_000_000 * r),
    landAcquisitionPrice: Math.floor(300_000_000 * r),
    buildingAcquisitionPrice: Math.floor(400_000_000 * r),
    landCarryoverPart: LAND_PART({ donorAcquisitionPrice: Math.floor(100_000_000 * r) }),
  });
  it("0.5: 산입 증여세 상당액 = 100%의 정확히 절반, 파트 gain도 절반", async () => {
    const full = await post(A_NEW);
    const half = await post(scaled(0.5));
    expect(half.status).toBe(200);
    expect(half.r.splitDetail.land.carryover.giftTaxAddedToExpense).toBe(full.r.splitDetail.land.carryover.giftTaxAddedToExpense / 2);
    expect(half.r.splitDetail.land.gain).toBe(full.r.splitDetail.land.gain / 2);
    expect(half.r.splitDetail.land.carryover.judgment).toBe("applied");
  });
  it("0.6: 어긋남 < 1원 — 증여세 상당액 12,000,000 = 0.6 × 20,000,000 (사건 미스케일 + 분자 스케일)", async () => {
    const o = await post(scaled(0.6));
    expect(o.status).toBe(200);
    expect(o.r.splitDetail.land.carryover.giftTaxApportioned).toBe(12_000_000);
  });
});

describe("P1-6 V-6 중과(다주택·조정대상지역) — 파트 이월과세 채택 입력은 증여자 날짜로 치환한 일반 split과 같은 판정", () => {
  // 양도 2027-06-30(중과 유예 종료 후) · 2주택 · 조정대상지역 — mock 세율. 중과 구간은 장특 배제(lt 0).
  const REG = { householdHousingCount: 2, isRegulatedArea: true, wasRegulatedAtAcquisition: true, transferDate: "2027-06-30" };
  it("A: 중과(multi_house_2) 하에서도 채택 A = 증여자 날짜 치환 proxy와 세액·중과 유형이 같다", async () => {
    const o = await post({ ...A_NEW, ...REG });
    const proxy = await post({
      ...A_FIELDS, ...REG, landAcquisitionCause: "__DEL__", landAcquisitionDate: "2000-01-01", landAcquisitionPrice: 100_000_000, landDirectExpenses: 20_000_000,
    });
    expect(o.status).toBe(200);
    expect(o.r.surchargeType).toBe("multi_house_2");
    expect(o.r.surchargeType).toBe(proxy.r.surchargeType);
    expect(num(o)).toBe(num(proxy));
    expect(o.r.splitDetail.land.carryover.judgment).toBe("applied");
  });
  it("B: 건물 파트도 같다(증여자 날짜 2015-06-01 치환 proxy와 일치) — `giftHouseholdBasis`를 건드리지 않는 수증자 본인 기준", async () => {
    const o = await post({ ...B_NEW, ...REG });
    const proxy = await post({
      ...B_FIELDS, ...REG, acquisitionCause: "purchase", acquisitionDate: "2015-06-01", buildingAcquisitionPrice: 100_000_000, buildingDirectExpenses: 20_000_000, landAcquisitionCause: "__DEL__",
    });
    expect(o.status).toBe(200);
    expect(o.r.surchargeType).toBe(proxy.r.surchargeType);
    expect(num(o)).toBe(num(proxy));
  });
});

describe("P1-7 독립 proxy 대조 — T1·T5·T6의 채택 세액이 proxy와 같다(기대값을 해결자 출력에서 가져오지 않는다)", () => {
  it("T1 A: 토지만 증여자 값(2000-01-01·1억+증여세 2천만) 치환 = 172,260,000", async () => {
    const proxy = await post({
      ...A_FIELDS, landAcquisitionCause: "__DEL__", landAcquisitionDate: "2000-01-01", landAcquisitionPrice: 100_000_000, landDirectExpenses: 20_000_000,
    });
    expect(num(proxy)).toBe(172_260_000);
    expect(num(await post(A_NEW))).toBe(172_260_000);
  });
  it("T6 C 토지 B·건물 A 혼합 = 300,018,000 (건물만 증여자 값 치환 · 토지는 증여일/평가액 그대로)", async () => {
    // 건물 증여세 상당액 = floor(3천만 × 6.6억 ÷ 9억) = 22,000,000
    expect(Math.floor((30_000_000 * 660_000_000) / 900_000_000)).toBe(22_000_000);
    const proxy = await post({
      ...C_FIELDS, acquisitionCause: "purchase", landAcquisitionCause: "__DEL__", isSeparateAcquisition: true,
      acquisitionDate: "2015-06-01", buildingAcquisitionPrice: 50_000_000, buildingDirectExpenses: 22_000_000,
    });
    expect(proxy.status).toBe(200);
    expect(num(proxy)).toBe(300_018_000);
    expect(num(await post(C_NEW))).toBe(300_018_000);
  });
});

describe("P1-8 echo — 적용(A) 파트는 이월과세 취득원인·증여자 기산 규칙, 배제(B) 파트는 증여일 기산(일반 증여 — 통산 없음)", () => {
  it("A 적용 토지: acquisitionCause carryover_gift · rateBasisRule donor · rateBasisAcquisitionDate 증여자 취득일 · 자산 단위 detail은 비워 둔다", async () => {
    const o = await post(A_NEW);
    const land = o.r.splitDetail.land;
    expect(land).toMatchObject({ acquisitionCause: "carryover_gift", rateBasisRule: "donor", rateBasisAcquisitionDate: "2000-01-01", acquisitionDate: "2000-01-01" });
    // 건물은 이월과세 입력이 없다 — 일반 매매 echo 그대로
    expect(o.r.splitDetail.building).toMatchObject({ acquisitionCause: "purchase", rateBasisRule: "own" });
    expect(o.r.splitDetail.carryoverEvent).toEqual({ giftRegistryDate: "2023-03-01", giftTaxCalculated: 20_000_000, giftTaxBase: 300_000_000, applicablePeriodYears: 10 });
    expect(o.r.carryoverTaxationDetail).toBeUndefined();
  });
  it("B 배제 토지(②3호): 증여일 기산 · rateBasisRule own — 일반 증여(gift)로 계산하되 §104②2호 통산(carryover_gift 전용)은 들어가지 않는다", async () => {
    const o = await post({ ...A_NEW, landCarryoverPart: LAND_PART({ donorAcquisitionPrice: 400_000_000 }) });
    expect(o.r.splitDetail.land).toMatchObject({ rateBasisRule: "own", acquisitionDate: "2023-03-01", acquisitionCause: "gift" });
  });
  it("계산 단계에 파트별 판정 한 줄이 남는다", async () => {
    const o = await post(C_NEW);
    const labels = (o.r.steps as { label: string }[]).map((s) => s.label);
    expect(labels).toEqual(expect.arrayContaining(["토지 파트 이월과세 판정", "건물 파트 이월과세 판정"]));
  });
});

/**
 * 리뷰 C-2 — B 고정 파트(기간 초과·관계 부적격·②3호 배제)는 **이월과세 키 없는 일반 증여와 같은 계산**이어야 한다.
 * 파트 취득원인을 `purchase`로 두면 영 §163⑨ 단서 1호·2호(max(평가액, 영 §164④·⑦ 가액)) 술어가 꺼져 일반 증여보다 취득가액이 작아졌다
 * (토지 증여 1989-05-01 · 평가액 3억 · 영 §164④ 가액 5억 → 121,860,000 ↔ 일반 증여 67,270,000).
 */
describe("P1-9 B 고정 파트 = 일반 증여 (영 §163⑨ 단서 1호·2호 구간)", () => {
  const SEC164 = 500_000_000;
  // 단서 1호: 토지 1990.8.30. 전 증여. 토지 B(증여일·평가액) + 건물 매매 2021
  const LAND_PROVISO = {
    ...A_FIELDS,
    landAcquisitionDate: "1989-05-01",
    landSec164Value: SEC164,
  };
  const landNew = (event: Record<string, unknown>, part: Record<string, unknown> = {}) => ({
    ...LAND_PROVISO,
    carryoverGiftEvent: EVENT({ giftRegistryDate: "1989-05-01", ...event }),
    landCarryoverPart: LAND_PART({ donorAcquisitionDate: "1980-01-01", ...part }),
  });
  const landPlain = () => ({ ...LAND_PROVISO, landAcquisitionCause: "gift" });

  it("토지 단서 1호 · 기간 초과(period_exceeded): 취득가액 max(3억, 5억)=5억 · 일반 증여와 같은 세액", async () => {
    const plain = await post(landPlain());
    expect(plain.status).toBe(200);
    expect(plain.r.splitDetail.land.acquisitionPrice).toBe(SEC164);
    const o = await post(landNew({}));
    expect(o.status).toBe(200);
    expect(o.r.splitDetail.land.carryover).toMatchObject({ judgment: "excluded", exclusionReason: "period_exceeded" });
    expect(o.r.splitDetail.land.acquisitionPrice).toBe(SEC164);
    expect(o.r.splitDetail.land.acquisitionBasis).toMatchObject({ rule: "sec163_9_1", adopted: "sec164" });
    expect(num(o)).toBe(num(plain));
  });

  it("토지 단서 1호 · 관계 부적격(relation other): 같다", async () => {
    const o = await post(landNew({ donorRelation: "other" }));
    expect(o.status).toBe(200);
    expect(o.r.splitDetail.land.carryover).toMatchObject({ judgment: "excluded", exclusionReason: "relation_invalid" });
    expect(num(o)).toBe(num(await post(landPlain())));
  });

  it("토지 단서 1호 · ②3호 배제(tax_comparison): 양도 1993-06-30(증여 4년 — 5년 창 안) · 증여자 취득가 과다로 A < B → B = 일반 증여", async () => {
    const base = { ...LAND_PROVISO, transferDate: "1993-06-30", acquisitionDate: "1990-03-01" };
    const plain = await post({ ...base, landAcquisitionCause: "gift" });
    expect(plain.status, JSON.stringify(plain.body?.error ?? {})).toBe(200);
    const o = await post({
      ...base,
      carryoverGiftEvent: EVENT({ giftRegistryDate: "1989-05-01" }),
      landCarryoverPart: LAND_PART({ donorAcquisitionDate: "1980-01-01", donorAcquisitionPrice: 900_000_000 }),
    });
    expect(o.status, JSON.stringify(o.body?.error ?? {})).toBe(200);
    expect(o.r.splitDetail.land.carryover).toMatchObject({ judgment: "excluded", exclusionReason: "tax_comparison" });
    expect(o.r.splitDetail.land.acquisitionPrice).toBe(SEC164);
    expect(num(o)).toBe(num(plain));
  });

  // 단서 2호: 건물 2005.4.30. 전 증여(단독·다가구주택, 영 §164⑦ 건물 몫 ②). 건물 B(증여일·평가액) + 토지 매매 overlay
  const BUILDING_SEC164 = 600_000_000;
  const BUILDING_PROVISO = {
    ...B_FIELDS,
    acquisitionDate: "2004-06-01",
    buildingHouseKind: "house_individual",
    buildingSec164Value: BUILDING_SEC164,
  };
  const buildingNew = (event: Record<string, unknown>, part: Record<string, unknown> = {}, over: Record<string, unknown> = {}) => ({
    ...BUILDING_PROVISO,
    ...over,
    carryoverGiftEvent: EVENT({ giftRegistryDate: "2004-06-01", giftTaxBase: 400_000_000, ...event }),
    buildingCarryoverPart: { donorAcquisitionDate: "1995-06-01", donorAcquisitionPrice: 100_000_000, ...part },
  });
  const buildingPlain = (over: Record<string, unknown> = {}) => ({ ...BUILDING_PROVISO, ...over, acquisitionCause: "gift" });

  it("건물 단서 2호 · 기간 초과: 취득가액 max(4억, 6억)=6억 · 일반 증여와 같은 세액", async () => {
    const plain = await post(buildingPlain());
    expect(plain.status, JSON.stringify(plain.body?.error ?? {})).toBe(200);
    expect(plain.r.splitDetail.building.acquisitionPrice).toBe(BUILDING_SEC164);
    const o = await post(buildingNew({}));
    expect(o.status, JSON.stringify(o.body?.error ?? {})).toBe(200);
    expect(o.r.splitDetail.building.carryover).toMatchObject({ judgment: "excluded", exclusionReason: "period_exceeded" });
    expect(o.r.splitDetail.building.acquisitionPrice).toBe(BUILDING_SEC164);
    expect(o.r.splitDetail.building.acquisitionBasis).toMatchObject({ rule: "sec163_9_2", adopted: "sec164" });
    expect(num(o)).toBe(num(plain));
  });

  it("건물 단서 2호 · 관계 부적격: 같다", async () => {
    const o = await post(buildingNew({ donorRelation: "other" }));
    expect(o.status).toBe(200);
    expect(o.r.splitDetail.building.carryover).toMatchObject({ judgment: "excluded", exclusionReason: "relation_invalid" });
    expect(num(o)).toBe(num(await post(buildingPlain())));
  });

  it("건물 단서 2호 · ②3호 배제: 양도 2008-06-30(증여 4년) · 증여자 취득가 과다 → B = 일반 증여", async () => {
    const over = { transferDate: "2008-06-30", landAcquisitionDate: "2005-01-01" };
    const plain = await post(buildingPlain(over));
    expect(plain.status, JSON.stringify(plain.body?.error ?? {})).toBe(200);
    const o = await post(buildingNew({}, { donorAcquisitionPrice: 900_000_000 }, over));
    expect(o.status, JSON.stringify(o.body?.error ?? {})).toBe(200);
    expect(o.r.splitDetail.building.carryover).toMatchObject({ judgment: "excluded", exclusionReason: "tax_comparison" });
    expect(o.r.splitDetail.building.acquisitionPrice).toBe(BUILDING_SEC164);
    expect(num(o)).toBe(num(plain));
  });

  it("건물 단순 증여(gift)는 §104②2호 통산을 만들지 않는다 — 배제된 건물의 세율 기산은 증여일(own)", async () => {
    const o = await post(buildingNew({ donorRelation: "other" }));
    expect(o.r.splitDetail.building).toMatchObject({ acquisitionCause: "gift", rateBasisRule: "own", rateBasisAcquisitionDate: "2004-06-01" });
  });

  it("C 둘 다 B(같은 날 비-별개): 토지 원인 없는 일반 통째 증여 입력과 같은 세액 — D3(토지 gift + 건물 gift 금지)를 피한다", async () => {
    const bothB = { ...C_NEW, carryoverGiftEvent: EVENT({ giftTaxCalculated: 30_000_000, giftTaxBase: 900_000_000, donorRelation: "other" }) };
    const o = await post(bothB);
    expect(o.status, JSON.stringify(o.body?.error ?? {})).toBe(200);
    const plain = await post({
      ...C_FIELDS, acquisitionCause: "gift", landAcquisitionCause: "__DEL__", isSeparateAcquisition: false,
    });
    expect(plain.status, JSON.stringify(plain.body?.error ?? {})).toBe(200);
    expect(num(o)).toBe(num(plain));
  });

  it("C 토지 A·건물 B(건물 기간 후 증여자 값 있음 아님 — 건물만 관계 부적격은 사건 수준이라 두 파트 모두 B): 건물 gift + 토지 overlay purchase 조합이 leaf를 통과한다", async () => {
    // 토지만 적격·건물만 ②3호 배제가 되는 입력은 T6/T7이 고정한다(토지 B·건물 A). 반대 방향(토지 A·건물 B) 구성이 leaf에서 막히지 않는지 본다.
    const o = await post({
      ...C_NEW,
      landAcquisitionPrice: 400_000_000,
      buildingAcquisitionPrice: 500_000_000,
      buildingCarryoverPart: { donorAcquisitionDate: "2015-06-01", donorAcquisitionPrice: 900_000_000 }, // 건물 A < B → 건물 배제
    });
    expect(o.status, JSON.stringify(o.body?.error ?? {})).toBe(200);
    expect(o.r.splitDetail.building.carryover).toMatchObject({ judgment: "excluded", exclusionReason: "tax_comparison" });
    expect(o.r.splitDetail.land.carryover.judgment).toBe("applied");
  });
});

describe("P1-10 증여자 취득일이 같은 날인 두 파트(AA) — 비-별개로 재파생돼도 파트 명시값을 쓴다 (리뷰 anchor 부재 (2))", () => {
  // 증여자가 토지·건물을 같은 날(2010-01-01) 취득: 치환 날짜가 같아 isSeparateAcquisition=false. 파트 취득가액 명시값은 그대로 쓰여야 한다.
  const SAME_DAY = {
    ...C_NEW,
    landCarryoverPart: LAND_PART({ donorAcquisitionDate: "2010-01-01", donorAcquisitionPrice: 50_000_000 }),
    buildingCarryoverPart: { donorAcquisitionDate: "2010-01-01", donorAcquisitionPrice: 50_000_000 },
  };
  it("AA 비교 세액(echo)이 «치환한 일반 split»(비-별개 · 파트 명시값 · 증여세 상당액 8,000,000/22,000,000)과 같다", async () => {
    const o = await post(SAME_DAY);
    expect(o.status, JSON.stringify(o.body?.error ?? {})).toBe(200);
    const proxy = await post({
      ...C_FIELDS, acquisitionCause: "purchase", landAcquisitionCause: "__DEL__", isSeparateAcquisition: false,
      acquisitionDate: "2010-01-01", landAcquisitionDate: "2010-01-01",
      landAcquisitionPrice: 50_000_000, buildingAcquisitionPrice: 50_000_000, landDirectExpenses: 8_000_000, buildingDirectExpenses: 22_000_000,
    });
    expect(proxy.status, JSON.stringify(proxy.body?.error ?? {})).toBe(200);
    const { land, building } = o.r.splitDetail;
    // 채택이 어느 쪽이든 «건물 A를 고정한 상태의 토지 적용 세액» 또는 «토지 적용 상태의 건물 적용 세액»이 AA다
    const aa = building.carryover.judgment === "applied" ? land.carryover.comparison.determinedTaxWithCarryover : building.carryover.comparison.determinedTaxWithCarryover;
    expect(land.carryover.judgment === "applied" || building.carryover.judgment === "applied").toBe(true);
    if (land.carryover.judgment === "applied" && building.carryover.judgment === "applied") expect(num(o)).toBe(num(proxy));
    else expect(aa).toBe(num(proxy));
    expect(land.carryover.giftTaxApportioned).toBe(8_000_000);
    expect(building.carryover.giftTaxApportioned).toBe(22_000_000);
  });
});
