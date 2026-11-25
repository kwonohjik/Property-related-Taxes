/**
 * 재산세 별도합산 철거·허가 요건 — 직접 API(`POST /api/calc/property`) 입구 E2E (PSA-X)
 *
 * 화면(PSA-U1·E3)은 «요구된 칸»만 채워 보내지만, 직접 호출은 그 보호막이 없다 — 실서버 경로(Zod ⑫ → superRefine ⑩ → 엔진)에서
 * 빠진·모순된 사실 칸이 침묵 통과(유리/불리한 오답)하지 않고 400 + 구체 문구로 막히는지 확인한다.
 * 상세 분기는 vitest route anchor(`__tests__/api/property.route.*.anchor.test.ts`)가 갖고, 여기엔 실서버 대표 건만 둔다.
 * 과세기준일은 `targetDate: "2026-06-01"` 고정(요구 술어·한시 기간이 날짜로 정해짐 → 올해와 무관하게 결정적).
 *
 * 세액 오라클(계획서 §7 K-표 · 총 납부세액 = 본세 × 1.2):
 *   건축물 300㎡ 상업(공시가격 3억 · 바닥 100 → 기준면적 300㎡) — 철거 2026-01-01 · 허가 예 · 건축 외 아니오 → 430,000 / 516,000 (K-1)
 *   허가 아니오 → 800,000 / 960,000 (K-2 · 이관 사유 permit)   비철거 허가 예 → 430,000 / 516,000 (K-27)
 * 실행: E2E_PORT=3174 npx playwright test e2e/property-separate-requirements-api.spec.ts
 */
import { test, expect, type APIRequestContext } from "@playwright/test";
import {
  PROPERTY_BUILDING_PERMIT_ISSUE_MESSAGE,
  PROPERTY_DEMOLISHED_ISSUE_MESSAGE as M,
} from "../lib/tax-engine/property-separate-requirements";
import { PROPERTY_LAND_SPLIT_INPUT_MESSAGE } from "../lib/tax-engine/property-land-split-tax";

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const post = async (request: APIRequestContext, body: Json) => {
  const res = await request.post("/api/calc/property", { data: body });
  return { status: res.status(), json: (await res.json()) as Json };
};
/** 키를 뺀 사본 — 칸 «미전송» 재현 */
const without = (o: Json, key: string): Json => {
  const c = { ...o };
  delete c[key];
  return c;
};
const itemErrors = (json: Json): string[] => json.error?.details?.separateAggregateItem ?? [];

/** 철거 건축물 — 허가 예 · 건축 외 용도 아니오 */
const DEMOLISHED_BUILDING = {
  id: "p1",
  jurisdictionCode: "000000",
  landArea: 300,
  officialLandPrice: 1_000_000,
  zoningDistrict: "commercial",
  buildingFloorArea: 100,
  demolished: true,
  demolishedDate: "2026-01-01",
  demolishedKind: "building",
  demolishedPermit: "yes",
  demolishedOtherUse: "no",
};
/** 비철거 건축물 — 허가·사용승인 칸 */
const LIVE_BUILDING = {
  id: "p1",
  jurisdictionCode: "000000",
  landArea: 300,
  officialLandPrice: 1_000_000,
  zoningDistrict: "commercial",
  buildingFloorArea: 100,
  buildingPermit: "yes",
};
const land = (item: Json, extra: Json = {}) => ({
  objectType: "land",
  landTaxType: "separate_aggregate",
  publishedPrice: 300_000_000,
  targetDate: "2026-06-01",
  otherSeparateAggregateValue: 0,
  otherComprehensiveValue: 0,
  separateAggregateItem: item,
  ...extra,
});

test.describe("직접 API 400 — 철거·허가 요건 입구 (PSA-X)", () => {
  test("대조군 — 완전 입력은 200 · 철거 K-1 516,000 / 비철거 K-27 516,000", async ({ request }) => {
    const a = await post(request, land(DEMOLISHED_BUILDING));
    expect(a.status, JSON.stringify(a.json)).toBe(200);
    expect([a.json.data.determinedTax, a.json.data.totalPayable]).toEqual([430_000, 516_000]);
    const b = await post(request, land(LIVE_BUILDING));
    expect(b.status, JSON.stringify(b.json)).toBe(200);
    expect([b.json.data.determinedTax, b.json.data.totalPayable]).toEqual([430_000, 516_000]);
  });

  test("철거 ON + 종류 없음 → 400 · 종류 문구", async ({ request }) => {
    const r = await post(request, land(without(DEMOLISHED_BUILDING, "demolishedKind")));
    expect(r.status).toBe(400);
    expect(itemErrors(r.json)).toEqual([M.demolishedKind]);
    expect(itemErrors(r.json)[0]).toContain("주택인지 주택이 아닌 건축물인지 선택하세요");
  });

  test("요구된 사실 칸이 «» → 400 · 허가 문구(칸이 비면 «아니오»로 읽지 않음)", async ({ request }) => {
    const r = await post(request, land({ ...DEMOLISHED_BUILDING, demolishedPermit: "" }));
    expect(r.status).toBe(400);
    expect(itemErrors(r.json)).toEqual([M.demolishedPermit]);
  });

  test("철거일 > 과세기준일 → 400 · «철거일은 과세기준일 이전»", async ({ request }) => {
    const r = await post(request, land({ ...DEMOLISHED_BUILDING, demolishedDate: "2026-06-02" }));
    expect(r.status).toBe(400);
    expect(itemErrors(r.json)).toEqual([M.demolishedAfterBaseDate]);
    expect(itemErrors(r.json)[0]).toContain("철거일은 과세기준일 이전");
  });

  test("공장용지 + 주택 철거 → 400 · 공장용지 건축물은 200", async ({ request }) => {
    const house = {
      id: "p1",
      jurisdictionCode: "000000",
      landArea: 400,
      officialLandPrice: 1_000_000,
      demolished: true,
      demolishedDate: "2026-01-01",
      demolishedKind: "house",
      demolishedPermit: "yes",
      demolishedOtherUse: "no",
      demolishedVacantHouse: "no",
    };
    const bad = await post(request, land({ ...house, isFactory: true }, { publishedPrice: 400_000_000 }));
    expect(bad.status).toBe(400);
    expect(itemErrors(bad.json)).toEqual([M.demolishedFactoryHouse]);
    const ok = await post(request, land({ ...DEMOLISHED_BUILDING, isFactory: true }));
    expect(ok.status, JSON.stringify(ok.json)).toBe(200);
  });

  test("비철거 건축물(2011.6.1.~) + 허가·사용승인 칸 없음 → 400 · 허가 문구 / 빈 문자열도 400", async ({ request }) => {
    const item = without(LIVE_BUILDING, "buildingPermit");
    const none = await post(request, land(item));
    expect(none.status).toBe(400);
    expect(itemErrors(none.json)).toEqual([PROPERTY_BUILDING_PERMIT_ISSUE_MESSAGE]);
    const blank = await post(request, land({ ...item, buildingPermit: "" }));
    expect(blank.status).toBe(400);
    expect(itemErrors(blank.json)).toEqual([PROPERTY_BUILDING_PERMIT_ISSUE_MESSAGE]);
  });

  test("합산 칸 — 이관분이 있는데 타 종합합산 칸 누락 → 400(자동 0 금지) · 별도합산분이 있는데 타 별도합산 칸 누락 → 400", async ({ request }) => {
    // 허가 «아니오» → 전량 종합합산 이관이라 타 종합합산 칸이 요구된다(타 별도합산은 비요구)
    const noCompr = without(land({ ...DEMOLISHED_BUILDING, demolishedPermit: "no" }), "otherComprehensiveValue");
    const a = await post(request, noCompr);
    expect(a.status).toBe(400);
    expect(a.json.error.details.otherComprehensiveValue).toEqual([PROPERTY_LAND_SPLIT_INPUT_MESSAGE.otherComprehensiveValue]);
    // 전량 별도합산(허가 예) → 타 별도합산 칸이 요구된다
    const noSep = without(land(DEMOLISHED_BUILDING), "otherSeparateAggregateValue");
    const b = await post(request, noSep);
    expect(b.status).toBe(400);
    expect(b.json.error.details.otherSeparateAggregateValue).toEqual([PROPERTY_LAND_SPLIT_INPUT_MESSAGE.otherSeparateAggregateValue]);
  });

  test("3지선다 밖의 값(허가 «maybe»·비철거 허가 «maybe»)·종류 밖의 값 → 400", async ({ request }) => {
    expect((await post(request, land({ ...DEMOLISHED_BUILDING, demolishedPermit: "maybe" }))).status).toBe(400);
    expect((await post(request, land({ ...DEMOLISHED_BUILDING, demolishedKind: "land" }))).status).toBe(400);
    expect((await post(request, land({ ...LIVE_BUILDING, buildingPermit: "maybe" }))).status).toBe(400);
  });

  test("허가 «아니오»·«모름» → 200 · 종합합산 이관 960,000(막지 않고 이관 · 사유 노출)", async ({ request }) => {
    const no = await post(request, land({ ...DEMOLISHED_BUILDING, demolishedPermit: "no" }));
    expect(no.status, JSON.stringify(no.json)).toBe(200);
    expect([no.json.data.determinedTax, no.json.data.totalPayable]).toEqual([800_000, 960_000]);
    expect(no.json.data.landSplit.comprehensive.transferReasons).toEqual(["permit"]);
    const unknown = await post(request, land({ ...LIVE_BUILDING, buildingPermit: "unknown" }));
    expect(unknown.status, JSON.stringify(unknown.json)).toBe(200);
    expect(unknown.json.data.totalPayable).toBe(960_000);
  });

  test("분리과세 공장용지 허가·사용승인 미이행 → 422 · «종합합산 과세 유형으로 재입력» (별도합산 안내 없음)", async ({ request }) => {
    const r = await post(request, {
      objectType: "land",
      landTaxType: "separated",
      publishedPrice: 300_000_000,
      targetDate: "2026-06-01",
      separateTaxationItem: { isFactoryLand: true, factoryLocation: "industrial_zone", factoryIsUnpermitted: true },
    });
    expect(r.status, JSON.stringify(r.json)).toBe(422);
    expect(r.json.error.message).toContain("종합합산 과세 유형으로 재입력하세요.");
    expect(r.json.error.message).not.toContain("종합합산 또는 별도합산");
    expect(r.json.error.message).toContain("§101① 단서");
  });
});
