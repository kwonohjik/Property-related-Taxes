/**
 * NBL2611-B4 (R09·R10) — 6호 휴양시설 «상한 이내 실제 면적» 입력의 ⑧·④·⑫·⑭ 정합 + 5호 나목·13호 나지 route 경로.
 * 리뷰 `docs/reviews/nbl-other-categories-review-2026-11.md` §3 V9-DM09 · V9-DM11 · §2 V7-DM02.
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
  // NBL-STATE-HISTORY-U1 픽스처 보정 — 기타토지는 「소유기간 중 건축물 이력」 질문에 답해야 ⑧을 통과한다(미선택 `""`은 ⑧ #1이 막는다). 이 파일의 주제와 무관해 «바뀐 적 없음»으로 둔다.
  nblOtherStateHistoryMode: "unchanged",
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

const RESORT = {
  nblLandType: "other_land",
  nblZoneType: "green",
  nblOtherPropertyTaxType: "comprehensive",
  nblOtherRelatedBusinessType: "resort",
  nblOtherResortOutdoorArea: "500",
} as Partial<AssetForm>;

describe("NBL2611-V9-DM09 · 6호 휴양시설 — 상한만 입력하고 실제 면적을 비우면 막는다 (⑧·⑫)", () => {
  const PARK_STD_ONLY = { nblOtherResortParkingStdArea: "100" } as Partial<AssetForm>;
  const PARK_BOTH = { nblOtherResortParkingStdArea: "100", nblOtherResortParkingActualArea: "50" } as Partial<AssetForm>;
  const BLD_FLOOR_ONLY = { nblOtherResortBuildingFloorArea: "30" } as Partial<AssetForm>;
  const BLD_BOTH = { nblOtherResortBuildingFloorArea: "30", nblOtherResortBuildingArea: "100" } as Partial<AssetForm>;

  it("R1 설치기준면적만 → ⑧이 실제 면적 칸으로 막는다", () => {
    const hit = issuesOf(form(RESORT, PARK_STD_ONLY));
    expect(hit[0]?.field, JSON.stringify(hit)).toBe("nblOtherResortParkingActualArea");
    expect(hit[0]?.message).toContain("실제 부설주차장용 토지 면적");
  });

  it("R2 실제 면적만 → ⑧이 설치기준면적 칸으로 막는다", () => {
    const hit = issuesOf(form(RESORT, { nblOtherResortParkingActualArea: "50" }));
    expect(hit[0]?.field).toBe("nblOtherResortParkingStdArea");
  });

  it("R3 바닥면적(배율 매핑 지역)만 → ⑧이 실제 부속토지 면적 칸으로 막는다", () => {
    const hit = issuesOf(form(RESORT, BLD_FLOOR_ONLY));
    expect(hit[0]?.field).toBe("nblOtherResortBuildingArea");
  });

  it("R4 바닥면적 + 배율 미매핑 지역(residential) → 직접입력 경로라 막지 않는다", () => {
    expect(issuesOf(form(RESORT, { nblZoneType: "residential" }, BLD_FLOOR_ONLY, { nblOtherResortBuildingArea: "100" }))).toEqual([]);
    // 바닥면적만이고 부속토지 면적이 없어도, 상한을 계산할 수 없는 지역에서는 ⑧ 실제 면적 요구를 하지 않는다(엔진도 상한 계산을 하지 않는다)
    expect(issuesOf(form(RESORT, { nblZoneType: "residential" }, BLD_FLOOR_ONLY)).filter((i) => i.field === "nblOtherResortBuildingArea")).toEqual([]);
  });

  it("R5 쌍 완비 → ⑧ 통과 · ④가 실제 주차장 면적을 싣는다 · route 200", async () => {
    const f = form(RESORT, PARK_BOTH, BLD_BOTH);
    expect(issuesOf(f)).toEqual([]);
    const r = await viaRoute(f);
    expect(r.body.nonBusinessLandRaw.nblOtherResortParkingActualArea).toBe("50");
    expect(r.status, JSON.stringify(r.json)).toBe(200);
  });

  it("R6 ⑫ — 설치기준면적만 보낸 직접 호출은 400 (⑧과 같은 문구)", async () => {
    const ok = await bodyOf(form(RESORT, PARK_BOTH));
    const bad = structuredClone(ok);
    bad.nonBusinessLandRaw.nblOtherResortParkingActualArea = "";
    const res = await post(bad);
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.json)).toContain("nblOtherResortParkingActualArea");
    expect(JSON.stringify(res.json)).toContain("실제 부설주차장용 토지 면적");
  });

  it("R7 ⑫ — 바닥면적만 보낸 직접 호출은 400", async () => {
    const ok = await bodyOf(form(RESORT, BLD_BOTH));
    const bad = structuredClone(ok);
    bad.nonBusinessLandRaw.nblOtherResortBuildingArea = "";
    const res = await post(bad);
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.json)).toContain("nblOtherResortBuildingArea");
  });

  it("R8 ⑭ — 실제 면적이 엔진 판정에 닿는다: 같은 상한에서 실제 면적이 작으면 비사업용 면적이 늘어난다", async () => {
    // 옥외 500 + 주차장 min(실제, 100×2) + 건축물 min(실제, 30×7=210). 토지 1,000㎡.
    const full = await viaRoute(form(RESORT, { nblOtherResortParkingStdArea: "100", nblOtherResortParkingActualArea: "200", nblOtherResortBuildingFloorArea: "30", nblOtherResortBuildingArea: "210" }));
    const part = await viaRoute(form(RESORT, { nblOtherResortParkingStdArea: "100", nblOtherResortParkingActualArea: "50", nblOtherResortBuildingFloorArea: "30", nblOtherResortBuildingArea: "60" }));
    expect(full.status, JSON.stringify(full.json)).toBe(200);
    expect(full.nbl?.areaProportioning?.businessArea).toBe(910); // 500 + 200 + 210
    expect(part.nbl?.areaProportioning?.businessArea).toBe(610); // 500 + 50 + 60
    expect(part.nbl?.surcharge?.nonBusinessAreaRatio ?? part.nbl?.nonBusinessAreaRatio).toBeGreaterThan(full.nbl?.surcharge?.nonBusinessAreaRatio ?? full.nbl?.nonBusinessAreaRatio);
  });
});

describe("NBL2611-V7-DM02 · V9-DM11 — route 경로(⑭ 매퍼 → 엔진)", () => {
  const RESERVE = {
    nblLandType: "other_land",
    nblOtherPropertyTaxType: "comprehensive",
    nblOtherRelatedBusinessType: "reserve_forces",
    nblOtherReserveUnitSize: "le800",
    nblOtherReserveFacilities: ["tactical"],
  } as Partial<AssetForm>;

  it("Z1 5호 + 상업지역 → 비사업용 · 녹지 → 사업용(기준면적 15,000㎡ 이내)", async () => {
    const urban = await viaRoute(form(RESERVE, { nblZoneType: "commercial" }));
    const out = await viaRoute(form(RESERVE, { nblZoneType: "green" }));
    expect(urban.status, JSON.stringify(urban.json)).toBe(200);
    expect(urban.nbl?.isNonBusinessLand).toBe(true);
    expect(out.nbl?.isNonBusinessLand).toBe(false);
    expect(urban.total!).toBeGreaterThan(out.total!);
  });

  it("Z2 13호 + 건축물 있음 → 비사업용 · 건축물 없음 → 사업용(660㎡ 이내)", async () => {
    const VAC = { nblLandType: "other_land", nblZoneType: "management", nblOtherPropertyTaxType: "comprehensive", nblOtherRelatedBusinessType: "vacant_lot_1household", acquisitionArea: "600", transferArea: "600" } as Partial<AssetForm>;
    const bare = await viaRoute(form(VAC));
    const built = await viaRoute(form(VAC, { nblOtherHasBuilding: true, nblOtherBuildingFloorArea: "50", nblOtherBuildingValue: "100,000,000", nblOtherLandValue: "1,000,000,000" }));
    expect(bare.status, JSON.stringify(bare.json)).toBe(200);
    expect(bare.nbl?.isNonBusinessLand).toBe(false);
    expect(built.nbl?.isNonBusinessLand).toBe(true);
  });
});
