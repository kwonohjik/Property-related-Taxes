/**
 * PSA-E2 — 철거 요건 칸의 입구: ⑫ Zod(침묵 strip 가드) · ⑩ superRefine(`propertyDemolishedFactIssue` — ⑧과 같은 함수) · 요구되지 않은 칸 무시 · 과세기준일 단일 소스.
 * 계획서 docs/01-plan/features/property-separate-demolished-requirements.engine.plan.md §5.5 · §6 · §7(K-2·K-4·K-15·K-16·K-23~K-25·K-30·K-31) · M11 · M13.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi
    .fn()
    .mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));
vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn().mockRejectedValue(new Error("offline")) };
});

import { POST } from "@/app/api/calc/property/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { PROPERTY_BUILDING_PERMIT_ISSUE_MESSAGE } from "@/lib/tax-engine/property-separate-requirements";
import { PROPERTY_DEMOLISHED_ISSUE_MESSAGE } from "@/lib/tax-engine/property-separate-requirements";

async function post(body: Record<string, unknown>) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/property", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, json: await res.json() };
}
const M = PROPERTY_DEMOLISHED_ISSUE_MESSAGE;
const itemErrors = (json: { error?: { details?: Record<string, string[]> } }) => json.error?.details?.separateAggregateItem ?? [];

/** 건축물 300㎡ 상업(3배) · 바닥 100(한도 300) · 철거 2026-01-01 · 허가 yes · 건축 외 용도 no · 과세기준일 2026-06-01 */
const BUILDING = {
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
/** 주택 부속토지 400㎡ — 바닥면적·용도지역 없음 */
const HOUSE = {
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
const land = (item: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  objectType: "land",
  landTaxType: "separate_aggregate",
  publishedPrice: Number(item.landArea) * 1_000_000,
  targetDate: "2026-06-01",
  otherSeparateAggregateValue: 0,
  otherComprehensiveValue: 0,
  separateAggregateItem: item,
  ...extra,
});

describe("⑫ — 새 키 6칸 선언(침묵 strip 가드 · M11) — 선언이 빠지면 값이 사라져 대조군이 400이 된다", () => {
  it("K-1 대조군: 허가 yes → 200 · 별도합산 430,000 / 516,000(키가 strip되면 «허가 없음»으로 400)", async () => {
    const r = await post(land(BUILDING));
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(r.json.data.determinedTax).toBe(430_000);
    expect(r.json.data.totalPayable).toBe(516_000);
  });

  it("K-2 허가 no → 200 · 종합합산 이관 800,000 / 960,000 · 이관 사유 permit(echo가 엔진에 도달)", async () => {
    const r = await post(land({ ...BUILDING, demolishedPermit: "no" }));
    expect(r.status).toBe(200);
    expect(r.json.data.determinedTax).toBe(800_000);
    expect(r.json.data.totalPayable).toBe(960_000);
    expect(r.json.data.landSplit.comprehensive.transferReasons).toEqual(["permit"]);
  });

  it("건축 외 용도 yes → other_use · 종류가 도달하는지: 주택 400㎡는 배율 한도 없이 전부 별도합산(K-15 — 건축물이면 일부 이관)", async () => {
    const a = await post(land({ ...BUILDING, demolishedOtherUse: "yes" }));
    expect(a.json.data.landSplit.comprehensive.transferReasons).toEqual(["other_use"]);
    const h = await post(land(HOUSE));
    expect(h.status, JSON.stringify(h.json)).toBe(200);
    expect(h.json.data.determinedTax).toBe(640_000);
    expect(h.json.data.landSplit.comprehensive).toBeUndefined();
  });

  it("K-16 빈집정비 yes 도달 — 철거 2024-06-15 → 3년 안 별도합산 640,000 (빈집 no면 이관 1,150,000)", async () => {
    const yes = await post(land({ ...HOUSE, demolishedDate: "2024-06-15", demolishedVacantHouse: "yes" }));
    const no = await post(land({ ...HOUSE, demolishedDate: "2024-06-15", demolishedVacantHouse: "no" }));
    expect(yes.json.data.determinedTax).toBe(640_000);
    expect(no.json.data.determinedTax).toBe(1_150_000);
  });

  it("2호 단서 2칸(공용 사용 · 유료) 도달 — 유료 yes 640,000 / 무상(no) 1,150,000 + 비과세 고지", async () => {
    const base = { ...HOUSE, demolishedDate: "2024-06-15", demolishedVacantHouse: "yes", demolishedOtherUse: "yes", demolishedPublicUse: "yes" };
    const paid = await post(land({ ...base, demolishedPublicUsePaid: "yes" }));
    const free = await post(land({ ...base, demolishedPublicUsePaid: "no" }));
    expect(paid.json.data.determinedTax).toBe(640_000);
    expect(free.json.data.determinedTax).toBe(1_150_000);
    expect(free.json.data.landSplit.comprehensive.transferReasons).toEqual(["public_use_unpaid"]);
    expect(free.json.data.warnings.join("\n")).toContain("비과세");
  });
});

describe("⑩ — 요구된 칸이 비면 400(⑧과 같은 문구) · 요구되지 않은 칸은 무시", () => {
  it("K-4 허가 «» → 400 · 엔진 상수 문구", async () => {
    const r = await post(land({ ...BUILDING, demolishedPermit: "" }));
    expect(r.status).toBe(400);
    expect(itemErrors(r.json)).toEqual([M.demolishedPermit]);
  });

  it("허가 미전송(키 없음)도 같은 400", async () => {
    const { demolishedPermit: _omit, ...item } = BUILDING;
    const r = await post(land(item));
    expect(r.status).toBe(400);
    expect(itemErrors(r.json)).toEqual([M.demolishedPermit]);
  });

  it("건축 외 용도 «» → 400", async () => {
    const r = await post(land({ ...BUILDING, demolishedOtherUse: "" }));
    expect(itemErrors(r.json)).toEqual([M.demolishedOtherUse]);
  });

  it("K-31 종류 미선택 → 400 (철거 1년 초과여도 종류는 항상 요구)", async () => {
    const { demolishedKind: _omit, ...item } = BUILDING;
    expect(itemErrors((await post(land(item))).json)).toEqual([M.demolishedKind]);
    expect(itemErrors((await post(land({ ...item, demolishedDate: "2025-05-31" }))).json)).toEqual([M.demolishedKind]);
  });

  it("K-30 철거일 > 과세기준일 → 400 «철거일은 과세기준일 이전»", async () => {
    const r = await post(land({ ...BUILDING, demolishedDate: "2026-06-02" }));
    expect(r.status).toBe(400);
    expect(itemErrors(r.json)).toEqual([M.demolishedAfterBaseDate]);
  });

  it("철거일 없음 → 400 «철거ㆍ멸실일을 입력»", async () => {
    const { demolishedDate: _omit, ...item } = BUILDING;
    expect(itemErrors((await post(land(item))).json)).toEqual([M.demolishedDate]);
  });

  it("공장용지 ∧ 주택 → 400 · 공장용지 ∧ 건축물은 200", async () => {
    expect(itemErrors((await post(land({ ...HOUSE, isFactory: true }))).json)).toEqual([M.demolishedFactoryHouse]);
    expect((await post(land({ ...BUILDING, isFactory: true }))).status).toBe(200);
  });

  it("빈집정비 칸(주택·2024.6.1.~) 비면 400 · 공용 사슬: 건축 외 yes ∧ 빈집 yes일 때만 공용 칸 요구, 공용 yes일 때만 유료 칸 요구", async () => {
    // PSA-S1 — 빈집정비는 일반 기간 안 주택에서 건축 외 «예» 뒤 단서 하위 칸(건축 외 «아니오»면 요구 0 · 현행은 400)
    expect((await post(land({ ...HOUSE, demolishedVacantHouse: "" }))).status).toBe(200);
    expect(itemErrors((await post(land({ ...HOUSE, demolishedOtherUse: "yes", demolishedVacantHouse: "" }))).json)).toEqual([M.demolishedVacantHouse]);
    // 일반 기간 밖·빈집 3년 안 주택은 빈집정비가 관문 — 비면 400, «아니오»면 접힘이 확정돼 허가·건축 외 용도를 요구하지 않는다(현행은 허가 400)
    const gate = { ...HOUSE, demolishedDate: "2024-06-15", demolishedPermit: "", demolishedOtherUse: "", demolishedVacantHouse: "" };
    expect(itemErrors((await post(land(gate))).json)).toEqual([M.demolishedVacantHouse]);
    expect((await post(land({ ...gate, demolishedVacantHouse: "no" }))).status).toBe(200);
    expect(itemErrors((await post(land({ ...gate, demolishedVacantHouse: "yes" }))).json)).toEqual([M.demolishedPermit]);
    const chain = { ...HOUSE, demolishedDate: "2024-06-15", demolishedVacantHouse: "yes", demolishedOtherUse: "yes" };
    expect(itemErrors((await post(land(chain))).json)).toEqual([M.demolishedPublicUse]);
    expect(itemErrors((await post(land({ ...chain, demolishedPublicUse: "yes" }))).json)).toEqual([M.demolishedPublicUsePaid]);
    expect((await post(land({ ...chain, demolishedPublicUse: "no" }))).status).toBe(200);
  });

  it("K-23·무시 — 요구되지 않은 칸에 값(또는 «»)이 들어와도 400이 아니라 무시: 건축물이 보낸 빈집정비·공용·유료, 철거 1년 초과의 허가·건축 외 용도", async () => {
    const stale = { demolishedVacantHouse: "yes", demolishedPublicUse: "yes", demolishedPublicUsePaid: "no" };
    const a = await post(land({ ...BUILDING, ...stale }));
    expect(a.status, JSON.stringify(a.json)).toBe(200);
    expect(a.json.data.determinedTax).toBe(430_000);
    const blank = await post(land({ ...BUILDING, demolishedVacantHouse: "", demolishedPublicUse: "", demolishedPublicUsePaid: "" }));
    expect(blank.status).toBe(200);
    const over = await post(land({ ...BUILDING, demolishedDate: "2025-05-31", demolishedPermit: "", demolishedOtherUse: "" }));
    expect(over.status).toBe(200);
    expect(over.json.data.determinedTax).toBe(800_000);
  });

  it("3지선다 밖의 값·종류 밖의 값은 400", async () => {
    expect((await post(land({ ...BUILDING, demolishedPermit: "maybe" }))).status).toBe(400);
    expect((await post(land({ ...BUILDING, demolishedKind: "land" }))).status).toBe(400);
  });

  it("철거 OFF — 철거 칸이 와도 무시(요구 0 · 판정 불변)", async () => {
    const off = { ...BUILDING, demolished: false, demolishedDate: undefined, demolishedPermit: "no", demolishedKind: "house", buildingPermit: "yes" };
    const r = await post(land(off));
    expect(r.status).toBe(200);
    expect(r.json.data.determinedTax).toBe(430_000);
  });
});

describe("Q-8 — 바닥면적·용도지역은 «읽을 때만» 요구 (M12 — ⑧은 필수·⑫는 비요구인 막다른 길 가드)", () => {
  it("K-15 주택 · 바닥면적·용도지역 없음 → 200", async () => {
    expect((await post(land(HOUSE))).status).toBe(200);
  });

  it("K-25 건축물 · 과세기준일 2023-06-01(면적 문언 전) · 바닥면적·용도지역 없음 → 200 · 1,000㎡ 전부 1,900,000", async () => {
    const { buildingFloorArea: _f, zoningDistrict: _z, ...rest } = BUILDING;
    const r = await post(land({ ...rest, landArea: 1000, demolishedDate: "2023-03-01", demolishedOtherUse: undefined }, { targetDate: "2023-06-01" }));
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(r.json.data.determinedTax).toBe(1_900_000);
  });

  it("K-26 건축물 · 2024-06-01~ · 바닥면적 없음 → 400 · 용도지역 없음 → 400", async () => {
    const { buildingFloorArea: _f, ...noFloor } = BUILDING;
    expect(itemErrors((await post(land(noFloor))).json)).toEqual([M.buildingFloorArea]);
    const { zoningDistrict: _z, ...noZone } = BUILDING;
    expect(itemErrors((await post(land(noZone))).json)).toEqual([M.zoningDistrict]);
  });

  it("건축물 · 철거 1년 초과 → 바닥면적·용도지역 비요구(기간 접힘이라 읽지 않음)", async () => {
    const { buildingFloorArea: _f, zoningDistrict: _z, ...rest } = BUILDING;
    expect((await post(land({ ...rest, demolishedDate: "2025-05-31" }))).status).toBe(200);
  });

  it("철거 OFF 건축물은 용도지역·바닥면적이 항상 필수(종전 규칙 유지)", async () => {
    const off = { id: "p1", jurisdictionCode: "000000", landArea: 300, officialLandPrice: 1_000_000 };
    const r = await post(land(off));
    expect(r.status).toBe(400);
    expect(itemErrors(r.json)).toEqual(["용도지역을 선택하세요.", "별도합산 토지는 건축물 바닥면적(㎡)이 필요합니다(「지방세법 시행령」 §101①1호).", PROPERTY_BUILDING_PERMIT_ISSUE_MESSAGE]);
  });
});

describe("M13 — 과세기준일 단일 소스: 서버 시간대와 무관하게 UTC 연도 6.1.", () => {
  const prevTz = process.env.TZ;
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    if (prevTz === undefined) delete process.env.TZ;
    else process.env.TZ = prevTz;
  });

  it("12.31. 23:30 UTC(KST는 이듬해 1.1. 08:30) — targetDate 미전송이면 과세기준일 2026-06-01 · 결과·요구 판정이 같은 해를 본다", async () => {
    process.env.TZ = "Asia/Seoul";
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-12-31T23:30:00Z"));
    expect(new Date().getFullYear()).toBe(2027); // 전제 — 로컬 달력은 이듬해
    // 철거 2026-01-01: 과세기준일 2026-06-01이면 기간 안(요건 칸 요구) · 2027-06-01이면 1년 초과(칸 비요구 · 이관)
    const { targetDate: _t, ...body } = land(BUILDING);
    const r = await post(body);
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(r.json.data.targetDate).toBe("2026-06-01");
    expect(r.json.data.determinedTax).toBe(430_000);
    // 합산 칸 요구 술어(`propertyLandSplitRequiredFor`)도 같은 과세기준일을 본다 — 2026-06-01이면 별도합산 300㎡ 전부라 타 종합합산 칸 비요구(2027-06-01이면 이관분이 생겨 400)
    const { otherComprehensiveValue: _c, ...onlySeparate } = body as Record<string, unknown>;
    expect((await post(onlySeparate)).status).toBe(200);
    // 같은 시점에 허가 칸이 비면 400 — 2027-06-01로 읽으면 칸을 안 묻는다
    const { demolishedPermit: _p, ...noPermit } = BUILDING;
    const { targetDate: _t2, ...body2 } = land(noPermit);
    expect((await post(body2)).status).toBe(400);
  });
});

describe("M13 — 세율 조회 기준일(route)도 같은 과세기준일", () => {
  const prevTz = process.env.TZ;
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    if (prevTz === undefined) delete process.env.TZ;
    else process.env.TZ = prevTz;
  });

  it("targetDate 미전송 · 12.31. 23:30 UTC(KST 이듬해) → preloadTaxRates 기준일 2026-06-01", async () => {
    process.env.TZ = "Asia/Seoul";
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://supabase.invalid");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-12-31T23:30:00Z"));
    vi.mocked(preloadTaxRates).mockClear();
    const { targetDate: _t, ...body } = land(BUILDING);
    expect((await post(body)).status).toBe(200);
    expect(vi.mocked(preloadTaxRates)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(preloadTaxRates).mock.calls[0][1]?.toISOString()).toBe("2026-06-01T00:00:00.000Z");
  });
});
