/**
 * §99의4 리뷰 후속 L2b — route 경유(계산기 폼 → ④ → ⑫ Zod → ⑭ → 엔진) 세액 anchor
 *
 * 시료: 충북 음성 일반주택(2010 취득·4억) 9억 양도 · 거주 60개월 · 비조정 · 명부 §99의4 농어촌주택 행 1채(1.5억). fallback 세율.
 * 「대조」 = 같은 사실에서 행의 선언을 뺀 계산(선언 불성립과 같은 세액이어야 한다).
 *
 * | # | 수정 전(실측 c6a4268eb) | 수정 후 |
 * |---|---:|---:|
 * | NH-20 양평 행(수도권) + 소재지 ON | 0 | ⑫ 400 (⑧도 같은 문장) — 끄면 124,366,000 |
 * | NH-20 연천 행(예외) + 소재지 ON [짝] | 0 | 0 |
 * | NH-30 연접 미응답 | 0 | 124,366,000 (= 대조) · ADJACENT_UNCONFIRMED |
 * | NH-30 「아니오」 [짝] | 0 | 0 |
 * | NH-50 적격 1채 + 3.5억(한도 초과) 1채 | 128,766,000 | 0 |
 * | 면적 R4×C2(2019 양도) 대지 661㎡ | 0 | 160,160,000 (= 대조) |
 * | 면적 R4×C2 대지 660㎡ [짝] | 0 | 0 |
 * | 면적 R4×C1(2016 양도) 연면적 151㎡ | 0 | 대조와 같은 세액(2018 전 양도는 fallback 근사라 절대값 미고정 — 계획서 §3-3) |
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST as SINGLE } from "@/app/api/calc/transfer/route";
import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { collectCountExclusionIssues } from "@/lib/calc/transfer-tax-validate-count-exclusion";
import type { HouseEntry, RowCountExclusionReduction } from "@/lib/stores/calc-wizard-asset-nbl";

type Form = ReturnType<typeof createDefaultTransferFormData>;
let TD = "2025-06-02";
const EUMSEONG = "4377037000";
const YANGPYEONG = "4183025000";
const YEONCHEON = "4180025000";

function form(houses: HouseEntry[], genAcq = "2010-01-01"): Form {
  const f = createDefaultTransferFormData();
  f.isOneHousehold = true;
  f.assets[0] = { ...f.assets[0], assetKind: "housing", acquisitionDate: genAcq, fixedAcquisitionPrice: "400,000,000", regionCode: EUMSEONG };
  return Object.assign(f, {
    transferDate: TD,
    contractTotalPrice: "900,000,000",
    residencePeriodMonths: "60",
    householdHousingCount: String(houses.length + 1),
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    houses,
  });
}

const DECL = (over: Partial<RowCountExclusionReduction> = {}): RowCountExclusionReduction =>
  ({
    type: "new_99_4_rural",
    ruralHouseAcquisitionDate: "",
    ruralHouseStdPrice: "150000000",
    isRegisteredHanok: false,
    adjacentArea994: "no",
    meetsLocationRequirement: true,
    ...over,
  }) as RowCountExclusionReduction;

const row = (id: string, regionCode: string, acq: string, decl: RowCountExclusionReduction | undefined, over: Partial<HouseEntry> = {}): HouseEntry =>
  ({
    id,
    region: "non_capital",
    regionCode,
    acquisitionDate: acq,
    officialPrice: "150000000",
    isInherited: false,
    isLongTermRental: false,
    isApartment: false,
    isOfficetel: false,
    isUnsoldHousing: false,
    addressJibun: "충청북도 음성군 감곡면 리 1",
    acquisitionOrigin: "general",
    ...(decl ? { countExclusion: { kind: "reduction", reduction: decl } } : {}),
    ...over,
  }) as HouseEntry;

async function single(f: Form) {
  let body: unknown;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return { ok: true, json: async () => ({ data: { mode: "single", result: {} } }) } as Response;
    }),
  );
  await callTransferTaxAPI(f).catch(() => undefined);
  vi.unstubAllGlobals();
  const res = await SINGLE(
    new NextRequest("http://l/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
  );
  const json = (await res.json()) as { data?: { result: Record<string, unknown> }; error?: unknown };
  if (res.status !== 200) return { status: res.status, error: JSON.stringify(json), totalTax: undefined, new994: undefined };
  const r = json.data!.result;
  const d = r.new994Detail as { isEligible: boolean; ineligibleReasons?: { code: string }[] } | undefined;
  return {
    status: 200,
    error: "",
    totalTax: r.totalTax as number,
    new994: d ? (d.isEligible ? "eligible" : (d.ineligibleReasons ?? []).map((x) => x.code).join(",")) : undefined,
  };
}

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(
    async () => loadFallbackTransferRates(new Date(TD)) as Awaited<ReturnType<typeof preloadTaxRates>>,
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  TD = "2025-06-02";
});

describe("NH-20 — 명부 행 법정동코드가 예외 아닌 수도권 + 소재지 ON (Q-7 (b) 차단)", () => {
  it("양평 행: ⑧이 막고 ⑫도 400 — 같은 문장", async () => {
    const f = form([row("r", YANGPYEONG, "2018-05-01", DECL())]);
    expect(collectCountExclusionIssues(f).join(" ")).toContain("수도권으로 조회됩니다");
    const r = await single(f);
    expect(r.status).toBe(400);
    expect(r.error).toContain("수도권으로 조회됩니다");
  });
  it("양평 행 소재지 OFF → 계산 진행, 선언 불성립 = 대조 124,366,000", async () => {
    const off = await single(form([row("r", YANGPYEONG, "2018-05-01", DECL({ meetsLocationRequirement: false }))]));
    const control = await single(form([row("r", YANGPYEONG, "2018-05-01", undefined)]));
    expect(off.totalTax).toBe(124_366_000);
    expect(control.totalTax).toBe(124_366_000);
  });
  it("[짝] 연천 행(접경 예외) + 소재지 ON → 막지 않고 적격 0", async () => {
    const f = form([row("r", YEONCHEON, "2018-05-01", DECL())]);
    expect(collectCountExclusionIssues(f)).toEqual([]);
    const r = await single(f);
    expect(r.new994).toBe("eligible");
    expect(r.totalTax).toBe(0);
  });
});

describe("NH-30 — 연접 3상태 (Q-13)", () => {
  it("미응답: ⑧이 묻고, 직접 보낸 본문은 엔진이 ADJACENT_UNCONFIRMED → 124,366,000(= 대조)", async () => {
    const f = form([row("r", EUMSEONG, "2018-05-01", DECL({ adjacentArea994: "" }))]);
    expect(collectCountExclusionIssues(f).join(" ")).toContain("예·아니오·모름");
    const r = await single(f);
    expect(r.new994).toBe("ADJACENT_UNCONFIRMED");
    expect(r.totalTax).toBe(124_366_000);
  });
  it("옛 저장값 isAdjacentArea:false(기본값)는 미응답으로 강등 — 같은 결과", async () => {
    const legacy = { ...DECL(), adjacentArea994: undefined, isAdjacentArea: false } as RowCountExclusionReduction;
    const f = form([row("r", EUMSEONG, "2018-05-01", legacy)]);
    expect(collectCountExclusionIssues(f).join(" ")).toContain("예·아니오·모름");
    expect((await single(f)).new994).toBe("ADJACENT_UNCONFIRMED");
  });
  it("모름 → 124,366,000 · [짝] 아니오 → 0", async () => {
    expect((await single(form([row("r", EUMSEONG, "2018-05-01", DECL({ adjacentArea994: "unknown" }))]))).totalTax).toBe(124_366_000);
    expect((await single(form([row("r", EUMSEONG, "2018-05-01", DECL())]))).totalTax).toBe(0);
  });
});

describe("NH-50 — 가액 초과 선언은 「1채」에서 뺀다 (Q-10)", () => {
  it("r1(1.5억) + r2(3.5억 — 한도 3억 초과) 둘 다 선언 → 128,766,000 → 0", async () => {
    TD = "2024-06-01";
    const r = await single(
      form([row("r1", EUMSEONG, "2015-03-01", DECL()), row("r2", EUMSEONG, "2022-03-01", DECL({ ruralHouseStdPrice: "350000000" }))]),
    );
    expect(r.new994).toBe("eligible");
    expect(r.totalTax).toBe(0);
  });
  it("[짝] r2가 소재지 미확인(사용자 답 요건)이면 종전대로 2채 → 128,766,000", async () => {
    TD = "2024-06-01";
    const r = await single(
      form([row("r1", EUMSEONG, "2015-03-01", DECL()), row("r2", EUMSEONG, "2022-03-01", DECL({ meetsLocationRequirement: false }))]),
    );
    expect(r.new994).toBe("MULTIPLE_HOUSES");
    expect(r.totalTax).toBe(128_766_000);
  });
});

describe("NH-05 PR-2b — 종전 면적 요건", () => {
  it("R4×C2(2019 양도) 대지 661㎡ → 불성립 = 대조 160,160,000 · [짝] 660㎡ → 0", async () => {
    TD = "2019-06-01";
    const over = await single(form([row("r", EUMSEONG, "2015-03-01", DECL({ ruralLandAreaSqm994: "661" }))], "2012-01-01"));
    const control = await single(form([row("r", EUMSEONG, "2015-03-01", undefined)], "2012-01-01"));
    const within = await single(form([row("r", EUMSEONG, "2015-03-01", DECL({ ruralLandAreaSqm994: "660" }))], "2012-01-01"));
    expect(over.new994).toBe("LAND_AREA_EXCEEDED");
    expect(control.totalTax).toBe(160_160_000);
    expect(over.totalTax).toBe(160_160_000);
    expect(within.totalTax).toBe(0);
  });
  it("R4×C2 대지 미입력 → ⑧이 묻고, 직접 본문은 AREA_UNCONFIRMED = 대조", async () => {
    TD = "2019-06-01";
    const f = form([row("r", EUMSEONG, "2015-03-01", DECL())], "2012-01-01");
    expect(collectCountExclusionIssues(f).join(" ")).toContain("대지면적");
    const r = await single(f);
    expect(r.new994).toBe("AREA_UNCONFIRMED");
    expect(r.totalTax).toBe(160_160_000);
  });
  it("R4×C1(2016 양도) 그 밖의 주택 연면적 151㎡ → 대조와 같은 세액 · 공동주택 전용(행 값) 116㎡ → 0", async () => {
    TD = "2016-06-01";
    const facts = { ruralLandAreaSqm994: "330" };
    const over = await single(
      form([row("r", EUMSEONG, "2014-03-01", DECL({ ...facts, ruralHouseType994: "other", ruralHouseFloorAreaSqm994: "151" }))], "2008-01-01"),
    );
    const control = await single(form([row("r", EUMSEONG, "2014-03-01", undefined)], "2008-01-01"));
    expect(over.new994).toBe("HOUSE_AREA_EXCEEDED");
    expect(over.totalTax).toBe(control.totalTax);
    const multi = await single(
      form([row("r", EUMSEONG, "2014-03-01", DECL({ ...facts, ruralHouseType994: "multi_unit" }), { exclusiveArea: "116" })], "2008-01-01"),
    );
    expect(multi.new994).toBe("eligible");
    expect(multi.totalTax).toBe(0);
  });
});
