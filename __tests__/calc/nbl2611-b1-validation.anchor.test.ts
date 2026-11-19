/**
 * NBL2611-B1 (R05) — ⑧·⑫ 검증 정합 + 지목별 입력 소비 술어.
 * 리뷰 `docs/reviews/nbl-other-categories-review-2026-11.md` §2 V8-VL02·V9-DM06 · §3 V2-PR04 · §4 V6-PU11 · §6 Q-10·Q-12.
 *
 * 입력은 화면 폼 → ⑧(`collectStepIssues`) → ④(`callTransferTaxAPI`) → 실제 route(⑫⑭) → 엔진이다.
 * 금액은 mock 세율표(`makeMockRates`) 실측이다 — 차이의 유무·방향·규모만 유효하다.
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const T = "2024-06-03";

/** 토지 1,000㎡ · 취득가 4억 · 양도가 10억 — 정밀판정 ON. 지목·용도지역은 각 블록이 채운다. */
const LAND = {
  assetKind: "land",
  acquisitionCause: "purchase",
  acquisitionDate: "2013-06-01",
  acquisitionArea: "1000",
  transferArea: "1000",
  addressJibun: "서울 강남구 테스트동 1",
  fixedAcquisitionPrice: "400000000",
  standardPriceAtTransfer: "500000000",
  isNonBusinessLand: true,
  nblUseDetailedJudgment: true,
} as Partial<AssetForm>;

function form(...parts: Array<Partial<AssetForm>>): TransferFormData {
  const f = createDefaultTransferFormData();
  f.transferDate = T;
  f.filingDate = "2024-08-31";
  f.contractTotalPrice = "1000000000";
  f.assets = [Object.assign({ ...makeDefaultAsset(1) }, LAND, ...parts) as AssetForm];
  return f;
}

async function bodyOf(f: TransferFormData): Promise<Loose> {
  const cap: { body?: Loose } = {};
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
    cap.body = JSON.parse(String(init?.body));
    return { ok: true, json: async () => ({ data: { mode: "single", result: {} } }) } as unknown as Response;
  }));
  try { await callTransferTaxAPI(f); } catch { /* body만 필요하다 */ }
  vi.unstubAllGlobals();
  return cap.body!;
}

async function post(body: Loose) {
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }));
  const json = (await res.json()) as Loose;
  return { status: res.status, json, result: json?.data?.result as Loose | undefined };
}

/** ⑧ 이슈(전 단계) */
const issuesOf = (f: TransferFormData) =>
  [0, 1, 2, 3, 4, 5].flatMap((s) => collectStepIssues(s, f)).map((i) => ({ field: i.field as string | undefined, message: i.message }));

/** ⑧을 우회해 ④→route만 */
async function viaRoute(f: TransferFormData) {
  const body = await bodyOf(f);
  const r = await post(body);
  return { ...r, body, total: r.result?.totalTax as number | undefined, nbl: r.result?.nonBusinessLandJudgmentDetail as Loose | undefined };
}

const VILLA = {
  nblLandType: "villa_land",
  nblZoneType: "general_residential",
  nblIsMetropolitanArea: "yes",
  nblHousingFootprint: "400",
} as Partial<AssetForm>;

describe("NBL2611-V8-VL02 · 별장 사용기간 행 — 역순·같은 날 행이 조용히 버려지지 않는다", () => {
  const USE_OK = [{ startDate: "2013-06-02", endDate: "2024-01-01", usageType: "별장 사용" }];
  const USE_REVERSED = [{ startDate: "2024-01-01", endDate: "2013-06-02", usageType: "별장 사용" }];
  const USE_SAME_DAY = [{ startDate: "2020-01-01", endDate: "2020-01-01", usageType: "별장 사용" }];

  it("V0 기준 — 정상 행(14년 사용)은 별장(농어촌주택 아님) 비사업용 · 총세액 227,491,000", async () => {
    // 종전 실측(수정 전 · ⑧ 우회): 같은 입력의 **역순 행**은 행이 버려져 별장 사용 0일 → 주택부수토지 재분류 → 사업용 176,286,000
    // (비사업용 227,491,000 대비 −51,205,000 과소). 지금은 ⑧(V2)·⑫(V4)가 그 행 자체를 막는다.
    const ok = await viaRoute(form(VILLA, { nblVillaUsePeriods: USE_OK }));
    expect(ok.status).toBe(200);
    expect(ok.nbl?.isNonBusinessLand).toBe(true);
    expect(ok.total).toBe(227_491_000);
  });

  it("V2 역순 행 → ⑧이 그 행의 종료일 칸으로 막는다", () => {
    const hit = issuesOf(form(VILLA, { nblVillaUsePeriods: USE_REVERSED }));
    expect(hit.length, JSON.stringify(hit)).toBeGreaterThan(0);
    expect(hit[0].field).toBe("nblVillaUsePeriods.0.endDate");
    expect(hit[0].message).toContain("별장 사용기간 1번째 행");
    expect(hit[0].message).toContain("빠릅니다");
  });

  it("V3 같은 날 행 → ⑧이 막는다", () => {
    const hit = issuesOf(form(VILLA, { nblVillaUsePeriods: USE_SAME_DAY }));
    expect(hit[0]?.field).toBe("nblVillaUsePeriods.0.endDate");
    expect(hit[0]?.message).toContain("같습니다");
  });

  it("V4 ⑫ — API 직접 호출의 역순 행도 400", async () => {
    const ok = await bodyOf(form(VILLA, { nblVillaUsePeriods: USE_OK }));
    const bad = structuredClone(ok);
    bad.nonBusinessLandRaw.nblVillaUsePeriods = USE_REVERSED;
    const res = await post(bad);
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.json)).toContain("nblVillaUsePeriods");
  });
});


describe("NBL2611-Q-12 · 별장 사용기간 0행 — 1행 이상 또는 「사용 없음」 확인", () => {
  const USE_OK = [{ startDate: "2013-06-02", endDate: "2024-01-01", usageType: "별장 사용" }];

  it("Q1 0행 + 미확인 → ⑧이 확인 칸으로 막는다", () => {
    const hit = issuesOf(form(VILLA, { nblVillaUsePeriods: [] }));
    expect(hit[0]?.field, JSON.stringify(hit)).toBe("nblVillaNoUseConfirmed");
    expect(hit[0]?.message).toContain("별장으로 사용한 기간 없음");
  });

  it("Q2 0행 + 확인 → 통과 · 주택부수토지 재분류 사업용", async () => {
    const f = form(VILLA, { nblVillaUsePeriods: [], nblVillaNoUseConfirmed: true });
    expect(issuesOf(f)).toEqual([]);
    const r = await viaRoute(f);
    expect(r.status).toBe(200);
    expect(r.nbl?.isNonBusinessLand).toBe(false);
  });

  it("Q3 1행 이상이면 확인 없이 통과", () => {
    expect(issuesOf(form(VILLA, { nblVillaUsePeriods: USE_OK }))).toEqual([]);
  });

  it("Q4 ⑫ — 0행 + 미확인 직접 호출은 400, 확인하면 200", async () => {
    const ok = await bodyOf(form(VILLA, { nblVillaUsePeriods: [], nblVillaNoUseConfirmed: true }));
    expect((await post(ok)).status).toBe(200);
    const bad = structuredClone(ok);
    bad.nonBusinessLandRaw.nblVillaNoUseConfirmed = false;
    const res = await post(bad);
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.json)).toContain("nblVillaNoUseConfirmed");
  });

  it("Q5 다른 지목의 stale 별장 0행·미확인은 막지 않는다(과차단 방지)", () => {
    expect(issuesOf(form({ nblLandType: "forest", nblZoneType: "agriculture_forest", nblVillaUsePeriods: [], nblVillaNoUseConfirmed: false }))).toEqual([]);
  });
});

describe("NBL2611-V9-DM06 · 직전 수입금액 ↔ 직전 토지가액 쌍", () => {
  const OTHER = {
    nblLandType: "other_land",
    nblZoneType: "commercial",
    nblOtherPropertyTaxType: "comprehensive",
    nblRevenueBusinessType: "parking_operation",
    nblRevenueCurrentRevenue: "3,000,000",
    nblRevenueCurrentLandValue: "500,000,000",
  } as Partial<AssetForm>;
  const PRIOR_REV = { nblRevenuePriorRevenue: "100,000,000" } as Partial<AssetForm>;
  const PRIOR_LAND = { nblRevenuePriorLandValue: "500,000,000" } as Partial<AssetForm>;

  it("D0 기준 — 직전 쌍 완비: 비율②(당해+직전) 충족 → 사업용 · 총세액 176,286,000", async () => {
    // 종전 실측(수정 전 · ⑧ 우회): 직전 수입만 넣으면(직전 토지가액 공란) ②가 조용히 빠져 비사업용 227,491,000 (+51,205,000 과대).
    const both = await viaRoute(form(OTHER, PRIOR_REV, PRIOR_LAND));
    expect(both.status).toBe(200);
    expect(both.nbl?.isNonBusinessLand).toBe(false);
    expect(both.total).toBe(176_286_000);
  });

  it("D1 수입만 → ⑧이 직전 토지가액 칸으로 막는다", () => {
    const hit = issuesOf(form(OTHER, PRIOR_REV));
    expect(hit[0]?.field, JSON.stringify(hit)).toBe("nblRevenuePriorLandValue");
  });

  it("D2 쌍 완비 → 통과 · ②로 사업용", async () => {
    const f = form(OTHER, PRIOR_REV, PRIOR_LAND);
    expect(issuesOf(f)).toEqual([]);
    expect((await viaRoute(f)).nbl?.isNonBusinessLand).toBe(false);
  });

  it("D3 토지가액만(자동조회가 채우는 쪽) → 막지 않는다 — 직전 수입 0이면 ②≤①이라 결과가 같다", () => {
    expect(issuesOf(form(OTHER, PRIOR_LAND))).toEqual([]);
  });

  it("D4 둘 다 없음 → 통과", () => {
    expect(issuesOf(form(OTHER))).toEqual([]);
  });

  it("D5 ⑫ — 수입만 보낸 직접 호출은 400", async () => {
    const ok = await bodyOf(form(OTHER, PRIOR_REV, PRIOR_LAND));
    const bad = structuredClone(ok);
    bad.nonBusinessLandRaw.nblRevenuePriorLandValue = "";
    const res = await post(bad);
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.json)).toContain("nblRevenuePriorLandValue");
  });

  it("D6 간주임대료(직전 보증금·일수)만 있어도 직전 토지가액이 필요하다", () => {
    const hit = issuesOf(form(OTHER, { nblRevenuePriorDeposit: "1,000,000,000", nblRevenuePriorRentDays: "365" }));
    expect(hit[0]?.field).toBe("nblRevenuePriorLandValue");
  });
});

describe("NBL2611-V2-PR04 · 양도일 의제일 범위", () => {
  const SEP = {
    nblLandType: "other_land",
    nblZoneType: "commercial",
    nblOtherPropertyTaxType: "separate",
    nblOtherHasBuilding: true,
    nblOtherBuildingFloorArea: "400",
    nblOtherBuildingValue: "100,000,000",
    nblOtherLandValue: "500,000,000",
  } as Partial<AssetForm>;
  const deemed = (d: string) => ({ nblDeemedTransferReason: "auction", nblDeemedTransferDate: d }) as Partial<AssetForm>;

  it("P0 기준 — 의제 없는 별도합산 기타토지(건축물 부속 · 기간기준 충족)는 사업용 · 총세액 176,286,000", async () => {
    // 종전 실측(수정 전 · ⑧ 우회): 취득일(2013-06-01) 이전 의제일(2012-01-01)을 넣으면 소유일수 0 → 「0일 보유」 비사업용 227,491,000 (+51,205,000 과대),
    // 사유는 「종합합산 + 거주·사업관련 미해당」으로 오표기. 지금은 ⑧(P2~P4)·⑫(P6)가 입력 자체를 막고 엔진은 경고를 남긴다.
    const none = await viaRoute(form(SEP));
    expect(none.status).toBe(200);
    expect(none.nbl?.isNonBusinessLand).toBe(false);
    expect(none.total).toBe(176_286_000);
  });

  it("P1 의제 없음 → ⑧ 통과(기준)", () => {
    expect(issuesOf(form(SEP))).toEqual([]);
  });

  it("P2 의제일 < 취득일 → ⑧ 차단", () => {
    const hit = issuesOf(form(SEP, deemed("2012-01-01")));
    expect(hit[0]?.field, JSON.stringify(hit)).toBe("nblDeemedTransferDate");
    expect(hit[0]?.message).toContain("취득일");
  });

  it("P3 의제일 = 취득일 → ⑧ 차단", () => {
    expect(issuesOf(form(SEP, deemed("2013-06-01")))[0]?.field).toBe("nblDeemedTransferDate");
  });

  it("P4 의제일 > 양도일 → ⑧ 차단", () => {
    const hit = issuesOf(form(SEP, deemed("2024-06-04")));
    expect(hit[0]?.field).toBe("nblDeemedTransferDate");
    expect(hit[0]?.message).toContain("양도일");
  });

  it("P5 정상 의제일(취득 이후·양도 이전) → 통과 · 경계(양도일 당일)도 통과", () => {
    expect(issuesOf(form(SEP, deemed("2020-03-01")))).toEqual([]);
    expect(issuesOf(form(SEP, deemed("2024-06-03")))).toEqual([]);
  });

  it("P6 ⑫ — 취득일 이전 의제일 직접 호출은 400", async () => {
    const ok = await bodyOf(form(SEP, deemed("2020-03-01")));
    expect((await post(ok)).status).toBe(200);
    const bad = structuredClone(ok);
    bad.nonBusinessLandRaw.nblDeemedTransferDate = "2012-01-01";
    const res = await post(bad);
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.json)).toContain("nblDeemedTransferDate");
  });

  it("P7 의제를 소비하지 않는 지목(주택부수토지)의 stale 의제 값은 막지도 보내지도 않는다", async () => {
    const stale = { nblLandType: "housing_site", nblZoneType: "general_residential", nblIsMetropolitanArea: "yes", nblHousingFootprint: "400", ...deemed("2012-01-01") } as Partial<AssetForm>;
    const f = form(stale);
    expect(issuesOf(f)).toEqual([]);
    const body = await bodyOf(f);
    expect(body.nonBusinessLandRaw.nblDeemedTransferReason).toBe("none");
    expect(body.nonBusinessLandRaw.nblDeemedTransferDate).toBe("");
  });
});

describe("NBL2611-V6-PU11 · ⑫ 지목 필수 (정밀판정 ON · 의제 불성립)", () => {
  const FARM = { nblLandType: "farmland", nblZoneType: "agriculture_forest", nblFarmingSelf: true } as Partial<AssetForm>;

  it("U1 지목 공란 + 의제 불성립 → 400 (nblLandType)", async () => {
    // 종전 실측(수정 전): 200 · 총세액 227,491,000 · 사유 「지목 분류 불가 — 비사업용 간주」(농지 자경 기준 176,286,000 대비 +51,205,000).
    const ok = await bodyOf(form(FARM));
    const bad = structuredClone(ok);
    bad.nonBusinessLandRaw.nblLandType = "";
    bad.nonBusinessLandRaw.nblExemptLongOwned20y = true;
    const res = await post(bad);
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.json)).toContain("nblLandType");
  });

  it("U2 지목 공란 + 의제 성립(공익수용 · 고시일 2006.12.31. 이전) → ⑧ 통과 · raw 전송 · ⑫ 400 아님 — ⑧ 통과 ↔ ⑫ 400 모순 금지", async () => {
    const exemptForm = form(FARM, {
      nblLandType: "",
      nblZoneType: "",
      transferCause: "public_expropriation",
      expropriationNoticeDate: "2005-01-01",
      // 의제가 성립하면 ⑧이 건너뛰는 입력(비활성 칸의 stale 역순 행) — ⑫도 같은 이유로 건너뛰어야 한다
      nblVillaUsePeriods: [{ startDate: "2024-01-01", endDate: "2013-06-02", usageType: "별장 사용" }],
    });
    expect(issuesOf(exemptForm)).toEqual([]);
    const body = await bodyOf(exemptForm);
    expect(body.nonBusinessLandRaw, "의제 성립 시 지목이 비어도 raw를 보낸다").toBeDefined();
    expect(body.nonBusinessLandRaw.nblLandType).toBe("");
    const res = await post(body);
    expect(res.status, JSON.stringify(res.json?.error ?? res.json)).toBe(200);
    expect(res.result?.nonBusinessLandJudgmentDetail?.isNonBusinessLand).toBe(false);
  });
});

describe("NBL2611-V6-D · Zod enum — 미지원 분류·호는 400", () => {
  const OTHER = { nblLandType: "other_land", nblZoneType: "commercial", nblOtherPropertyTaxType: "separate" } as Partial<AssetForm>;

  it("E1 재산세 분류 미지원 값 → 400", async () => {
    const ok = await bodyOf(form(OTHER));
    expect((await post(ok)).status).toBe(200);
    const bad = structuredClone(ok);
    bad.nonBusinessLandRaw.nblOtherPropertyTaxType = "separat";
    const res = await post(bad);
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.json)).toContain("nblOtherPropertyTaxType");
  });

  it("E2 호 미지원 값 → 400", async () => {
    const ok = await bodyOf(form(OTHER, { nblOtherRelatedBusinessType: "none" }));
    const bad = structuredClone(ok);
    bad.nonBusinessLandRaw.nblOtherRelatedBusinessType = "etc_15호";
    const res = await post(bad);
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.json)).toContain("nblOtherRelatedBusinessType");
  });

  it("E3 비선택(\"\")은 통과 — 다른 지목 자산의 기본값이 400이 되지 않는다", async () => {
    const ok = await bodyOf(form({ nblLandType: "farmland", nblZoneType: "agriculture_forest", nblFarmingSelf: true }));
    expect(ok.nonBusinessLandRaw.nblOtherPropertyTaxType).toBe("");
    expect((await post(ok)).status).toBe(200);
  });
});

describe("NBL2611-V10-PU10·V8-VL08 · ④ 전송 게이트 — 숨긴 칸 값은 store에 남고 서버에는 가지 않는다", () => {
  const STALE = { nblUrbanIncorporationDate: "2020-01-01", nblIsMetropolitanArea: "no" } as Partial<AssetForm>;

  it("별장: 도시편입일 미전송(\"\") · 수도권은 전송(재분류 판정이 쓴다) · store 값은 그대로", async () => {
    const f = form(VILLA, { nblVillaNoUseConfirmed: true }, STALE);
    const body = await bodyOf(f);
    expect(body.nonBusinessLandRaw.nblUrbanIncorporationDate).toBe("");
    expect(body.nonBusinessLandRaw.nblIsMetropolitanArea).toBe("no");
    expect(f.assets[0].nblUrbanIncorporationDate).toBe("2020-01-01"); // 지우지 않는다(이력 복원 보존)
  });

  it("기타토지: 도시편입일·수도권 모두 미전송", async () => {
    const body = await bodyOf(form({ nblLandType: "other_land", nblZoneType: "commercial", nblOtherPropertyTaxType: "separate" }, STALE));
    expect(body.nonBusinessLandRaw.nblUrbanIncorporationDate).toBe("");
    expect(body.nonBusinessLandRaw.nblIsMetropolitanArea).toBe("");
  });

  it("농지: 도시편입일 전송 · 수도권 미전송", async () => {
    const body = await bodyOf(form({ nblLandType: "farmland", nblZoneType: "agriculture_forest", nblFarmingSelf: true }, STALE));
    expect(body.nonBusinessLandRaw.nblUrbanIncorporationDate).toBe("2020-01-01");
    expect(body.nonBusinessLandRaw.nblIsMetropolitanArea).toBe("");
  });

  it("표시 전용 표지(nblOtherLegacyRelatedReselect)는 서버로 가지 않는다", async () => {
    const body = await bodyOf(form({ nblLandType: "other_land", nblZoneType: "commercial", nblOtherPropertyTaxType: "separate", nblOtherLegacyRelatedReselect: true }));
    expect("nblOtherLegacyRelatedReselect" in body.nonBusinessLandRaw).toBe(false);
  });
});

describe("NBL2611-V8-VL02 · 유예 행 — ⑧·⑫ 같은 helper(역순·같은 날·사유별 필수)", () => {
  const FARM = { nblLandType: "farmland", nblZoneType: "agriculture_forest", nblFarmingSelf: true } as Partial<AssetForm>;
  const grace = (g: Record<string, string>) => ({ nblGracePeriods: [{ reasonCode: "use_prohibited", anchorDate: "", endDate: "", description: "", ...g }] }) as unknown as Partial<AssetForm>;

  it("G1 개시일 > 종료일 → ⑧이 종료일 칸으로 막는다", () => {
    const hit = issuesOf(form(FARM, grace({ anchorDate: "2020-06-01", endDate: "2020-01-01" })));
    expect(hit[0]?.field, JSON.stringify(hit)).toBe("nblGracePeriods.0.endDate");
    expect(hit[0]?.message).toContain("빠릅니다");
  });

  it("G2 5호 착공일 > 건설진행 종료일 → 막는다 · 종료일 비움(양도일까지 진행 가정)은 통과", () => {
    const five = { reasonCode: "construction_in_progress", secondaryDate: "2020-06-01" };
    expect(issuesOf(form(FARM, grace({ ...five, endDate: "2020-01-01" })))[0]?.field).toBe("nblGracePeriods.0.endDate");
    expect(issuesOf(form(FARM, grace({ ...five, endDate: "" })))).toEqual([]);
  });

  it("G3 ⑫ — 유예 행 역순 직접 호출은 400 · 정상 행은 200", async () => {
    const ok = await bodyOf(form(FARM, grace({ anchorDate: "2020-01-01", endDate: "2020-06-01" })));
    expect((await post(ok)).status).toBe(200);
    const bad = structuredClone(ok);
    bad.nonBusinessLandRaw.nblGracePeriods[0].anchorDate = "2020-06-01";
    bad.nonBusinessLandRaw.nblGracePeriods[0].endDate = "2020-01-01";
    const res = await post(bad);
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.json)).toContain("nblGracePeriods");
  });

  it("G4 기존 ⑧ 필수 문구는 그대로 — 개시일 비움", () => {
    const hit = issuesOf(form(FARM, grace({ anchorDate: "", endDate: "2020-06-01" })));
    expect(hit[0]?.message).toContain("유예기간 — 개시일을 입력하세요.");
  });
});
