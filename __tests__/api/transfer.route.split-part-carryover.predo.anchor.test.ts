/**
 * Pre-Do anchor: 주택 split 파트 이월과세(소득세법 §97의2) — **현행 동작 고정 + 목표값(skip)** (2026-10-19)
 *
 * 설계: docs/02-design/features/transfer-split-part-carryover.engine.design.md
 * 계획: docs/00-pm/transfer-split-part-carryover.plan.md §4(실측)·§8(결정)
 *
 * 이 파일의 **활성 테스트는 변경 전 실측값**이다. P1이 의도적으로 바꾸는 값은 `it.skip`(목표)으로 따로 적었다.
 * 활성 테스트가 구현 후 깨지면 (a) 설계서 §8의 「전환」과 1:1이면 해당 줄을 목표 기대로 뒤집고 근거를 남기고, (b) 아니면 회귀다.
 * `it.skip`의 기대값은 전부 **대리 계산**이다 — 이월과세 A는 「파트 취득일·취득가액(증여자 취득가 + 증여세 상당액)을 치환한 일반 split」,
 * B(미적용)는 「증여일·증여 당시 평가액으로 둔 일반 split」을 같은 route·같은 mock 세율로 돌린 값이다
 * (probe 출력은 설계서 §9 근거 표). 채택은 파트별 ②3호 순차 고정점(`resolveFilingUnitCarryoverScope`, 동률 A).
 *
 * 공통 시드: 주택, 양도 12억(토지 7억/건물 5억), 양도일 2025-06-30, 증여 등기접수일 2023-03-01, 비과세 아님(isOneHousehold false),
 * 파트 실가(별개 취득). mock 세율 — 같은 시드끼리 상대 비교만 의미가 있다.
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
import { POST as MULTI } from "@/app/api/calc/transfer/multi/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import {
  PART_CARRYOVER_INPUT_REQUIRED_MESSAGE,
  PART_CARRYOVER_STRAY_MESSAGE,
  PART_CARRYOVER_HOST_UNSUPPORTED_MESSAGE,
  PART_CARRYOVER_TOP_LEVEL_CONFLICT_MESSAGE,
  PART_CARRYOVER_ONE_HOUSE_MESSAGE,
  LAND_CAUSE_ABSENT_MESSAGE,
} from "@/lib/tax-engine/transfer-split-part-cause";
import { MULTI_CARRYOVER_UNSUPPORTED_MESSAGE } from "@/lib/calc/multi-transfer-support-messages";

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

async function postMulti(property: Record<string, unknown>): Promise<Out> {
  const res = await MULTI(
    req("/api/calc/transfer/multi", {
      taxYear: 2025,
      annualBasicDeductionUsed: 0,
      properties: [{ propertyId: "p1", propertyLabel: "p1", ...BASE, ...property }],
    }),
  );
  const body = await res.json();
  return { status: res.status, body, r: body?.data };
}

/** 컴패니언 = 주택(토지·건물 별개 취득). 주 자산은 토지 한 필지(일괄양도 분기를 켜기 위한 자리). */
const COMPANION_PRIMARY = {
  propertyType: "land",
  transferDate: "2025-06-30",
  transferPrice: 600_000_000,
  acquisitionDate: "2010-01-01",
  acquisitionPrice: 200_000_000,
  expenses: 0,
  useEstimatedAcquisition: false,
  householdHousingCount: 0,
  isRegulatedArea: false,
  wasRegulatedAtAcquisition: false,
  isUnregistered: false,
  isNonBusinessLand: false,
  isOneHousehold: false,
  reductions: [],
  annualBasicDeductionUsed: 0,
  residencePeriodMonths: 0,
  standardPriceAtTransferForApportion: 400_000_000,
  totalSalePrice: 1_800_000_000,
};
const companionHousing = (over: Record<string, unknown>) => ({
  assetId: "c1",
  assetLabel: "주택",
  assetKind: "housing",
  standardPriceAtTransferForApportion: 1_200_000_000,
  standardPriceAtTransfer: 1_200_000_000,
  directExpenses: 0,
  acquisitionCause: "purchase",
  acquisitionDate: "2021-03-01",
  fixedAcquisitionPrice: 400_000_000,
  reductions: [],
  isOneHousehold: false,
  landAcquisitionDate: "2023-03-01",
  isSeparateAcquisition: true,
  landAcqMode: "actual",
  buildingAcqMode: "actual",
  landAcquisitionPrice: 300_000_000,
  buildingAcquisitionPrice: 400_000_000,
  landStandardPriceAtTransfer: 700_000_000,
  buildingStandardPriceAtTransfer: 500_000_000,
  ...over,
});
async function postCompanion(over: Record<string, unknown>, primary: Record<string, unknown> = {}): Promise<Out> {
  const res = await POST(
    req("/api/calc/transfer", { ...COMPANION_PRIMARY, ...primary, companionAssets: [companionHousing(over)] }),
  );
  const body = await res.json();
  return { status: res.status, body, r: body?.data?.aggregated };
}

const fieldErrors = (o: Out): Record<string, string[]> => o.body?.error?.fieldErrors ?? {};
const errText = (o: Out): string => JSON.stringify(o.body?.error ?? o.body);

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

// ─────────────────────────────────────────────────────────────────────────
// P1 이후 상태 — 종전 «현행 고정» 줄은 설계서 §8.1대로 전환했다 (G-1/`:249` → S1·S3·S0, strip → 명시 거부).
// SPCO-0g/0h(자산 단위 이월과세 277,590,000 / 322,530,000)는 **불변** — 회귀 방어.
// ─────────────────────────────────────────────────────────────────────────

describe("SPCO-0 전환 — A 토지만 이월과세 (서브객체 없는 입력은 G-1 대신 S1 필수 누락)", () => {
  it("SPCO-0a 토지 파트 이월과세 원인만 있고 landCarryoverPart가 없으면 400 · 필드오류 landCarryoverPart = S1 (종전 G-1 `landAcquisitionCause` 전면 차단을 대체; 서브객체가 있는 A는 T1)", async () => {
    const o = await post({ ...A_FIELDS });
    expect(o.status).toBe(400);
    expect(fieldErrors(o).landCarryoverPart).toContain(PART_CARRYOVER_INPUT_REQUIRED_MESSAGE);
  });

  it("SPCO-0b 일반건물용 엔진 모양 `landCarryoverTaxation`은 와이어 키가 아니다 — strip되어 S1 필수 누락 400 (엔진 모양을 와이어로 받지 않는다 · 설계서 §0 보강 1)", async () => {
    const o = await post({
      ...A_FIELDS,
      landCarryoverTaxation: { ...TOP_CT("2000-01-01"), giftTaxAmount: 20_000_000, giftDateValuation: 300_000_000 },
    });
    expect(o.status).toBe(400);
    expect(fieldErrors(o).landCarryoverPart).toContain(PART_CARRYOVER_INPUT_REQUIRED_MESSAGE);
  });

  it("SPCO-0c 🔴 새 키를 원인이 이월과세가 아닌 파트에 얹으면 더는 조용히 strip(200 169,860,000)되지 않고 400 stray", async () => {
    const plain = await post({ ...A_FIELDS, landAcquisitionCause: "gift" });
    const withNewKeys = await post({
      ...A_FIELDS,
      landAcquisitionCause: "gift",
      carryoverGiftEvent: EVENT(),
      landCarryoverPart: LAND_PART(),
    });
    expect(plain.status).toBe(200);
    expect(plain.r.determinedTax).toBe(169_860_000); // 단순 증여 — 이월과세 아님
    expect(withNewKeys.status).toBe(400);
    expect(fieldErrors(withNewKeys).landCarryoverPart).toContain(PART_CARRYOVER_STRAY_MESSAGE);
  });

  it("SPCO-0d A′ 신축 건물 + 서브객체 없는 토지 이월과세도 S1 400 (서브객체가 있는 A′는 T2)", async () => {
    const o = await post({ ...A_FIELDS, acquisitionCause: "newConstruction" });
    expect(o.status).toBe(400);
    expect(fieldErrors(o).landCarryoverPart).toContain(PART_CARRYOVER_INPUT_REQUIRED_MESSAGE);
  });

  it("SPCO-0e 1세대1주택(8억) × 서브객체 없는 토지 이월과세 → S1 필수 누락이 먼저(비과세 0원으로 새지 않는다). 서브객체가 있는 겹침은 T10 = S9", async () => {
    const o = await post({
      ...A_FIELDS,
      isOneHousehold: true,
      householdHousingCount: 1,
      transferPrice: 800_000_000,
      landTransferPrice: 500_000_000,
      buildingTransferPrice: 300_000_000,
      landStandardPriceAtTransfer: 500_000_000,
      buildingStandardPriceAtTransfer: 300_000_000,
      landAcquisitionPrice: 300_000_000,
      buildingAcquisitionPrice: 200_000_000,
    });
    expect(o.status).toBe(400);
    expect(fieldErrors(o).landCarryoverPart).toContain(PART_CARRYOVER_INPUT_REQUIRED_MESSAGE);
  });
});

describe("SPCO-0 전환 — B 건물만 이월과세", () => {
  it("SPCO-0f 건물 이월과세에 **자산 단위** carryoverTaxation + 토지 매매 overlay(split) 병용은 400 · 필드오류 carryoverTaxation = S3 (종전 `:249` 한 문구를 대체; 파트 서브객체 B는 T5 = 200)", async () => {
    const o = await post({ ...B_FIELDS, carryoverTaxation: TOP_CT("2015-06-01") });
    expect(o.status).toBe(400);
    expect(fieldErrors(o).carryoverTaxation).toEqual([PART_CARRYOVER_TOP_LEVEL_CONFLICT_MESSAGE]);
  });
});

describe("SPCO-0 현행 — C 통째 이월과세 (증여자 토지·건물 취득일이 다를 때)", () => {
  it("SPCO-0g C1 증여자 취득일 칸에 **토지일(1995)** → 277,590,000 (전체 장특 30% · A 277,590,000 ≥ B 93,110,000 → A) — 자산 단위 경로 **불변**", async () => {
    const o = await post(WHOLE_HOUSE_CARRYOVER("1995-03-01"));
    expect(o.status).toBe(200);
    expect(o.r.determinedTax).toBe(277_590_000);
    expect(o.r.carryoverTaxationDetail.adoptedScenario).toBe("A");
    expect(o.r.carryoverTaxationDetail.scenarioA.determinedTax).toBe(277_590_000);
    expect(o.r.carryoverTaxationDetail.scenarioB.determinedTax).toBe(93_110_000);
    expect(o.r.splitDetail).toBeUndefined();
  });

  it("SPCO-0h C2 증여자 취득일 칸에 **건물일(2015)** → 322,530,000 (전체 장특 20%) — 자산 단위 경로 **불변** (같은 사건인데 칸 입력만으로 +44,940,000 — C는 파트 이월과세 T6이 풀었다)", async () => {
    const o = await post(WHOLE_HOUSE_CARRYOVER("2015-06-01"));
    expect(o.status).toBe(200);
    expect(o.r.determinedTax).toBe(322_530_000);
    expect(o.r.carryoverTaxationDetail.adoptedScenario).toBe("A");
  });

  it("SPCO-0i C3 자산 이월과세 + 수증자 쪽 토지·건물 같은 날 split → 400 (재귀 시나리오 A가 Y8 `LAND_CAUSE_ABSENT`에 걸린 엔진 throw — 종전과 같다: 필드오류 없음). 파트 서브객체 없는 기존 입력은 P1 전과 같다(`regression-grid.test.ts`) — 병용은 파트 이월과세로", async () => {
    const o = await post({
      acquisitionCause: "carryover_gift",
      acquisitionDate: "2023-03-01",
      landAcquisitionDate: "2023-03-01",
      isSeparateAcquisition: false,
      carryoverTaxation: TOP_CT("1995-03-01"),
      landAcquisitionPrice: 240_000_000,
      buildingAcquisitionPrice: 660_000_000,
    });
    expect(o.status).toBe(400);
    expect(fieldErrors(o)).toEqual({});
    expect(errText(o)).toContain(LAND_CAUSE_ABSENT_MESSAGE.slice(0, 30));
  });

  it("SPCO-0j C4 증여자 토지일을 landAcquisitionDate에 넣어도 400 (같은 사유 — 종전과 같다)", async () => {
    const o = await post({
      acquisitionCause: "carryover_gift",
      acquisitionDate: "2023-03-01",
      landAcquisitionDate: "1995-03-01",
      carryoverTaxation: TOP_CT("2015-06-01"),
      landAcquisitionPrice: 50_000_000,
      buildingAcquisitionPrice: 50_000_000,
    });
    expect(o.status).toBe(400);
    expect(errText(o)).toContain(LAND_CAUSE_ABSENT_MESSAGE.slice(0, 30));
  });

  it("SPCO-0i′ 파트 서브객체와 자산 단위 병용은 S3 — 병용 수단이 필요하면 파트 이월과세만 쓴다", async () => {
    const o = await post({ ...C_NEW, carryoverTaxation: TOP_CT("1995-03-01") });
    expect(o.status).toBe(400);
    expect(fieldErrors(o).carryoverTaxation).toEqual([PART_CARRYOVER_TOP_LEVEL_CONFLICT_MESSAGE]);
  });

  it("SPCO-0k 자산 이월과세 + 토지 overlay carryover_gift 병용 → 400 · S3 (상호배제 문구 — S1 필수 누락은 S3가 가려 같이 뜨지 않는다)", async () => {
    const o = await post({
      acquisitionCause: "carryover_gift",
      acquisitionDate: "2023-03-01",
      landAcquisitionDate: "2023-03-01",
      landAcquisitionCause: "carryover_gift",
      carryoverTaxation: TOP_CT("1995-03-01"),
    });
    expect(o.status).toBe(400);
    expect(fieldErrors(o).carryoverTaxation).toEqual([PART_CARRYOVER_TOP_LEVEL_CONFLICT_MESSAGE]);
    expect(fieldErrors(o).landCarryoverPart ?? []).toEqual([]);
  });
});

describe("SPCO-0 전환 — 다건·컴패니언은 명시 거부 (Q-6·Q-7)", () => {
  it("SPCO-0l 다건 `landAcquisitionCause: carryover_gift`(서브객체 없음) → 400 · 공용 leaf S1(종전 G-1 자리) — 서브객체가 있는 입력은 MULTI_REJECT_RULES(T11)", async () => {
    const o = await postMulti({ ...A_FIELDS });
    expect(o.status).toBe(400);
    expect(fieldErrors(o)["properties.0.landCarryoverPart"]).toContain(PART_CARRYOVER_INPUT_REQUIRED_MESSAGE);
  });

  it("SPCO-0m 다건 새 키(원인 gift)는 더는 strip(200 169,860,000)되지 않는다 → 400", async () => {
    const o = await postMulti({
      ...A_FIELDS,
      landAcquisitionCause: "gift",
      carryoverGiftEvent: EVENT(),
      landCarryoverPart: LAND_PART(),
    });
    expect(o.status).toBe(400);
  });

  it("SPCO-0n 컴패니언 `landAcquisitionCause: carryover_gift` → 400 · companionAssets.0.landAcquisitionCause = S0 (컴패니언 호스트 미지원)", async () => {
    const o = await postCompanion({ landAcquisitionCause: "carryover_gift" });
    expect(o.status).toBe(400);
    expect(fieldErrors(o)["companionAssets.0.landAcquisitionCause"]).toContain(PART_CARRYOVER_HOST_UNSUPPORTED_MESSAGE);
  });

  it("SPCO-0o 컴패니언 새 키(원인 gift)는 더는 strip(200 304,050,000)되지 않는다 → 400", async () => {
    const plain = await postCompanion({ landAcquisitionCause: "gift" });
    const withNewKeys = await postCompanion({
      landAcquisitionCause: "gift",
      carryoverGiftEvent: EVENT(),
      landCarryoverPart: LAND_PART(),
    });
    expect(plain.status).toBe(200);
    expect(plain.r.determinedTax).toBe(304_050_000); // 새 키 없는 값 — 이월과세 아님
    expect(withNewKeys.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 목표 (skip) — 기대값 = 대리 계산. P1이 와이어(설계서 §1)와 해결자(§3)를 구현하면 skip을 푼다.
// ─────────────────────────────────────────────────────────────────────────

describe("SPCO-T 목표 — A 토지만 이월과세", () => {
  it("SPCO-T1 A: 172,260,000 — 토지 증여자 2000-01-01(보유 25년·장특 30%)·취득가액 1억+증여세 상당액 2천만, ②3호 A 172,260,000 ≥ B 169,860,000 → A 채택", async () => {
    const o = await post(A_NEW);
    expect(o.status).toBe(200);
    expect(o.r.determinedTax).toBe(172_260_000);
    const land = o.r.splitDetail.land;
    expect(land.acquisitionDate).toBe("2000-01-01"); // 장특 기산일(§95④ 단서) — JSDoc 정정 대상
    expect(land.holdingYears).toBe(25);
    expect(land.longTermRate).toBe(0.3);
    expect(land.acquisitionPrice).toBe(100_000_000);
    expect(land.directExpenses).toBe(20_000_000); // 증여세 상당액(§97의2①3호) — 필요경비
    expect(land.carryover).toMatchObject({
      judgment: "applied",
      donorAcquisitionDate: "2000-01-01",
      donorAcquisitionPrice: 100_000_000,
      giftTaxApportioned: 20_000_000,
      giftTaxAddedToExpense: 20_000_000,
      giftTaxLimitApplied: false,
      giftDateValuation: 300_000_000,
      comparison: { determinedTaxWithCarryover: 172_260_000, determinedTaxWithout: 169_860_000 },
    });
    expect(o.r.splitDetail.building.carryover).toBeUndefined();
    expect(o.r.carryoverTaxationDetail).toBeUndefined(); // 자산 단위 detail은 자산 이월과세 전용
  });

  it("SPCO-T2 A′ 신축 건물도 172,260,000 — 건물 원인이 newConstruction이어도 같다", async () => {
    const o = await post({ ...A_NEW, acquisitionCause: "newConstruction" });
    expect(o.status).toBe(200);
    expect(o.r.determinedTax).toBe(172_260_000);
  });

  it("SPCO-T3 A ②3호 배제: 증여자 취득가 4억(> 증여일 평가액 3억)이면 A 88,550,000 < B 169,860,000 → B 채택 169,860,000 · reason tax_comparison · 장특 기산은 증여일(보유 2년·장특 0)", async () => {
    const o = await post({
      ...A_NEW,
      landCarryoverPart: LAND_PART({ donorAcquisitionPrice: 400_000_000 }),
    });
    expect(o.status).toBe(200);
    expect(o.r.determinedTax).toBe(169_860_000);
    const land = o.r.splitDetail.land;
    expect(land.holdingYears).toBe(2);
    expect(land.acquisitionDate).toBe("2023-03-01");
    expect(land.carryover).toMatchObject({
      judgment: "excluded",
      exclusionReason: "tax_comparison",
      comparison: { determinedTaxWithCarryover: 88_550_000, determinedTaxWithout: 169_860_000 },
    });
  });

  it("SPCO-T4 A 한도 = **파트 gain**(영 §163의2② 후단 · 사전-2025-법규재산-0366 「해당 자산」): 증여세 안분 1억 > 토지 gain 1천만 → 1천만만 산입. 자산 gain(건물 1억 포함)으로 한도를 잡으면 토지 차손이 생겨 A가 배제된다", async () => {
    // 토지: 증여일 평가 7억(=양도가 → B gain 0), 증여자 6.9억(A gain 1천만) · 증여세 산출 1억/과세가액 7억 → 안분 1억.
    // A: 산입 1천만 → 토지 gain 0 → T(A) = T(B) = 15,884,999 (동률 → A). 자산 한도(1.1억) 오구현이면 안분 1억이 전액 산입돼 토지 gain −9천만 · T(A)=0 < T(B) → B 채택(echo가 갈린다; 대리 실측 landAcquisitionPrice 7.9억 → 0).
    const o = await post({
      ...A_NEW,
      landAcquisitionPrice: 700_000_000,
      carryoverGiftEvent: EVENT({ giftTaxCalculated: 100_000_000, giftTaxBase: 700_000_000 }),
      landCarryoverPart: LAND_PART({ donorAcquisitionPrice: 690_000_000 }),
    });
    expect(o.status).toBe(200);
    expect(o.r.determinedTax).toBe(15_884_999);
    expect(o.r.splitDetail.land.carryover).toMatchObject({
      judgment: "applied",
      giftTaxApportioned: 100_000_000,
      giftTaxLimitCap: 10_000_000,
      giftTaxAddedToExpense: 10_000_000,
      giftTaxLimitApplied: true,
    });
    expect(o.r.splitDetail.land.gain).toBe(0);
  });
});

describe("SPCO-T 목표 — B 건물만 이월과세", () => {
  it("SPCO-T5 B: 261,210,000 — 건물 증여자 2015-06-01(보유 10년·장특 20%)·취득가액 1억+증여세 상당액 2천만, A 261,210,000 ≥ B 175,530,000 → A 채택", async () => {
    const o = await post(B_NEW);
    expect(o.status).toBe(200);
    expect(o.r.determinedTax).toBe(261_210_000);
    const b = o.r.splitDetail.building;
    expect(b.acquisitionDate).toBe("2015-06-01");
    expect(b.holdingYears).toBe(10);
    expect(b.longTermRate).toBe(0.2);
    expect(b.carryover).toMatchObject({
      judgment: "applied",
      giftTaxAddedToExpense: 20_000_000,
      comparison: { determinedTaxWithCarryover: 261_210_000, determinedTaxWithout: 175_530_000 },
    });
    expect(o.r.splitDetail.land.carryover).toBeUndefined();
    expect(o.r.splitDetail.land.holdingYears).toBe(17); // 토지 매매 2008-01-01 그대로
  });
});

describe("SPCO-T 목표 — C 주택 통째 이월과세 + 증여자 토지·건물 취득일이 다름", () => {
  it("SPCO-T6 C(Q-3 파트별 ②3호): 300,018,000 — 토지만 적용 시 T=89,082,000, 건물만 300,018,000, 둘 다 295,566,000. 토지는 「적용 295,566,000 < 미적용 300,018,000」이라 배제(tax_comparison), 건물은 적용 유지. (⚠️ 주택 일체로 비교하면 295,566,000 — 설계서 §4.4·V-1)", async () => {
    const o = await post(C_NEW);
    expect(o.status).toBe(200);
    expect(o.r.determinedTax).toBe(300_018_000);
    const { land, building } = o.r.splitDetail;
    expect(land.carryover).toMatchObject({
      judgment: "excluded",
      exclusionReason: "tax_comparison",
      comparison: { determinedTaxWithCarryover: 295_566_000, determinedTaxWithout: 300_018_000 },
    });
    expect(land.holdingYears).toBe(2); // 배제 → 증여일 기산
    expect(building.carryover).toMatchObject({
      judgment: "applied",
      comparison: { determinedTaxWithCarryover: 300_018_000, determinedTaxWithout: 93_110_000 },
    });
    expect(building.holdingYears).toBe(10); // 증여자 건물 2015-06-01
    expect(building.longTermRate).toBe(0.2);
  });

  it("SPCO-T7 C 양쪽 적용형: 증여 평가 토지 4억/건물 5억(증여세 3천만 → 안분 13,333,333 / 16,666,666)이면 둘 다 A → 295,790,000 (토지 30%·건물 20%)", async () => {
    const o = await post({
      ...C_NEW,
      landAcquisitionPrice: 400_000_000,
      buildingAcquisitionPrice: 500_000_000,
      carryoverGiftEvent: EVENT({ giftTaxCalculated: 30_000_000, giftTaxBase: 900_000_000 }),
    });
    expect(o.status).toBe(200);
    expect(o.r.determinedTax).toBe(295_790_000);
    const { land, building } = o.r.splitDetail;
    expect(land.carryover.giftTaxApportioned).toBe(13_333_333); // floor(3천만 × 4억 / 9억)
    expect(building.carryover.giftTaxApportioned).toBe(16_666_666); // floor(3천만 × 5억 / 9억) — 합 29,999,999(각각 floor, 잔액 흡수 안 함)
    expect(land.holdingYears).toBe(30);
    expect(building.holdingYears).toBe(10);
    expect(land.carryover.judgment).toBe("applied");
    expect(building.carryover.judgment).toBe("applied");
  });

  it("SPCO-T8 C ↔ 자산 단위 이월과세 상호배제: top-level carryoverTaxation + 파트 서브객체를 함께 보내면 400 (이중 적용 금지) — 필드오류 carryoverTaxation", async () => {
    const o = await post({ ...C_NEW, carryoverTaxation: TOP_CT("1995-03-01") });
    expect(o.status).toBe(400);
    expect(Object.keys(fieldErrors(o))).toContain("carryoverTaxation");
  });
});

describe("SPCO-T 목표 — 순서 의존 사례 (V-8 확인 필요)", () => {
  it("SPCO-T9 단기 구간에서 두 파트가 서로를 가린다: 양도 2023-09-30, 증여자 토지 2022-07-01(5천만)·건물 2022-09-01(6.6억), 증여 평가 토지 2.4억/건물 6.6억(증여세 0) → T00=208,250,000 · T01=320,250,000 · T10=341,250,000 · T11=292,500,000. 안정 구성이 {01,10} 둘이며 순차 고정점(토지→건물)은 01 = 320,250,000 (건물 우선이면 341,250,000)", async () => {
    const o = await post({
      ...C_NEW,
      transferDate: "2023-09-30",
      carryoverGiftEvent: EVENT({ giftTaxCalculated: 0, giftTaxBase: 900_000_000 }),
      landCarryoverPart: LAND_PART({ donorAcquisitionDate: "2022-07-01", donorAcquisitionPrice: 50_000_000 }),
      buildingCarryoverPart: { donorAcquisitionDate: "2022-09-01", donorAcquisitionPrice: 660_000_000 },
    });
    expect(o.status).toBe(200);
    expect(o.r.determinedTax).toBe(320_250_000);
    expect(o.r.splitDetail.land.carryover.judgment).toBe("excluded");
    expect(o.r.splitDetail.building.carryover.judgment).toBe("applied");
  });
});

describe("SPCO-T 목표 — 차단 게이트 (Q-5·Q-6·Q-7, 설계서 §6·§8)", () => {
  it("SPCO-T10 1세대1주택 비과세와 겹치면(isOneHousehold ∧ 주택 ∧ 미등기 아님) P5 전까지 400 + 안내 — 비과세 0원으로 새지 않는다 (SPCO-0e 전환)", async () => {
    const o = await post({
      ...A_NEW,
      isOneHousehold: true,
      householdHousingCount: 1,
      transferPrice: 800_000_000,
      landTransferPrice: 500_000_000,
      buildingTransferPrice: 300_000_000,
      landStandardPriceAtTransfer: 500_000_000,
      buildingStandardPriceAtTransfer: 300_000_000,
      landAcquisitionPrice: 300_000_000,
      buildingAcquisitionPrice: 200_000_000,
    });
    expect(o.status).toBe(400);
    const msgs = Object.values(fieldErrors(o)).flat().join(" | ");
    expect(msgs).toMatch(/1세대1주택/);
    expect(msgs).toMatch(/§97의2/);
    expect(msgs).toContain(PART_CARRYOVER_ONE_HOUSE_MESSAGE);
    expect(msgs).not.toContain(PART_CARRYOVER_INPUT_REQUIRED_MESSAGE);
  });

  it("SPCO-T11 다건(합산): 새 키·`landAcquisitionCause: carryover_gift` 모두 MULTI_REJECT_RULES로 명시 거부 — strip(200)이 아니다 (SPCO-0m 전환)", async () => {
    const a = await postMulti({ ...A_NEW });
    expect(a.status).toBe(400);
    expect(Object.keys(fieldErrors(a))).toEqual(expect.arrayContaining(["properties.0.landCarryoverPart", "properties.0.carryoverGiftEvent"]));
    expect(fieldErrors(a)["properties.0.landCarryoverPart"]).toContain(MULTI_CARRYOVER_UNSUPPORTED_MESSAGE);
    const b = await postMulti({ ...A_FIELDS, landAcquisitionCause: "gift", carryoverGiftEvent: EVENT(), landCarryoverPart: LAND_PART() });
    expect(b.status).toBe(400);
    expect(Object.keys(fieldErrors(b))).toEqual(expect.arrayContaining(["properties.0.carryoverGiftEvent"]));
  });

  it("SPCO-T12 컴패니언: 새 키는 400 (SPCO-0o 전환) — 첫 자산 전용", async () => {
    const o = await postCompanion({ landAcquisitionCause: "gift", carryoverGiftEvent: EVENT(), landCarryoverPart: LAND_PART() });
    expect(o.status).toBe(400);
    expect(Object.keys(fieldErrors(o))).toEqual(expect.arrayContaining(["companionAssets.0.carryoverGiftEvent"]));
  });

  it("SPCO-T13 주 자산이 파트 이월과세이고 컴패니언이 있으면 400 — 단건 ②3호 비교는 신고 전체 결정세액(§92③2호)을 못 본다(N-1) · 설계서 §4.5", async () => {
    const res = await POST(
      req("/api/calc/transfer", {
        ...BASE,
        ...A_NEW,
        totalSalePrice: 1_800_000_000,
        standardPriceAtTransferForApportion: 1_200_000_000,
        companionAssets: [companionHousing({})],
      }),
    );
    expect(res.status).toBe(400);
  });

  it("SPCO-T14 증여 등기접수일 ≠ 파트 취득일이면 400 — 한 곳 입력 규약(Q-8)을 엔진·⑫도 강제한다 (필드오류 landAcquisitionDate)", async () => {
    const o = await post({ ...A_NEW, landAcquisitionDate: "2023-04-01" });
    expect(o.status).toBe(400);
    expect(Object.keys(fieldErrors(o))).toContain("landAcquisitionDate");
  });

  it("SPCO-T15 파트 서브객체가 있는데 해당 파트 원인이 이월과세가 아니면 400 — 조용히 버리지 않는다 (stray)", async () => {
    const o = await post({ ...A_NEW, landAcquisitionCause: "gift" });
    expect(o.status).toBe(400);
    expect(Object.keys(fieldErrors(o))).toContain("landCarryoverPart");
  });

  it("SPCO-T16 원인이 이월과세인데 서브객체가 없으면 400 — 취득가액 0 침묵 계산 금지", async () => {
    const o = await post({ ...A_FIELDS });
    expect(o.status).toBe(400);
    expect(Object.keys(fieldErrors(o))).toContain("landCarryoverPart");
    expect(fieldErrors(o).landCarryoverPart).toContain(PART_CARRYOVER_INPUT_REQUIRED_MESSAGE);
  });
});
