/**
 * NBL2611-V7-S (R18 · D3) — 다목 선택지 완비 + 14호 정리의 ⑧·④·⑫·⑭ 정합 (route 경로).
 * 리뷰 `docs/reviews/nbl-other-categories-review-2026-11.md` §3 V7-S · §6 Q-5 (나) · Q-6 (다).
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
import { migrateAsset } from "@/lib/stores/calc-wizard-asset-migrate";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const T = "2024-06-03";

/** 토지 1,000㎡ · 취득가 4억 · 양도가 10억 — 정밀판정 ON, 기타토지(종합합산 선언) · 관리지역. */
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
  nblLandType: "other_land",
  nblZoneType: "management",
  nblOtherPropertyTaxType: "comprehensive",
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

const issuesOf = (f: TransferFormData) =>
  [0, 1, 2, 3, 4, 5].flatMap((s) => collectStepIssues(s, f)).map((i) => ({ field: i.field as string | undefined, message: i.message }));

async function viaRoute(f: TransferFormData) {
  const body = await bodyOf(f);
  const r = await post(body);
  return { ...r, body, total: r.result?.totalTax as number | undefined, nbl: r.result?.nonBusinessLandJudgmentDetail as Loose | undefined };
}

const ho = (v: string, more: Partial<AssetForm> = {}) => ({ nblOtherRelatedBusinessType: v, ...more }) as Partial<AssetForm>;

describe("누락 호 5종(면적기준 없음) — 선택 → ⑧ 통과 · route 200 · 전량 사업용 + «확인 필요»", () => {
  it.each(["sports_facility_business", "stadium_operation", "aggregate_extraction", "waste_treatment", "fish_farm_licensed"])(
    "H-%s",
    async (v) => {
      const f = form(ho(v));
      expect(issuesOf(f)).toEqual([]);
      const r = await viaRoute(f);
      expect(r.status, JSON.stringify(r.json)).toBe(200);
      expect(r.nbl?.isNonBusinessLand).toBe(false);
      expect(JSON.stringify(r.nbl?.warnings ?? r.result?.warnings ?? [])).toContain("확인 필요");
    },
  );

  it("H-0 종전: 같은 토지를 «해당 없음»으로 두면 비사업용 — 그래서 호를 못 고르면 과대 판정이었다", async () => {
    const none = await viaRoute(form(ho("none")));
    const lic = await viaRoute(form(ho("waste_treatment")));
    expect(none.nbl?.isNonBusinessLand).toBe(true);
    expect(lic.nbl?.isNonBusinessLand).toBe(false);
    expect(none.total!).toBeGreaterThan(lic.total!);
  });

  it("H-X ⑫ — 알 수 없는 호 문자열은 400 (자유 문자열 방지)", async () => {
    const ok = await bodyOf(form(ho("waste_treatment")));
    const bad = structuredClone(ok);
    bad.nonBusinessLandRaw.nblOtherRelatedBusinessType = "waste_disposal";
    expect((await post(bad)).status).toBe(400);
  });
});

describe("Q-5 (나) 14호 — 선택지는 유지하되 사업용 불인정 + 확인 필요", () => {
  it("E14-1 ⑧ 통과 · route 200 · 비사업용 · 해당 없음과 같은 판정·같은 세액", async () => {
    const f = form(ho("etc_14호"));
    expect(issuesOf(f)).toEqual([]);
    const etc = await viaRoute(f);
    const none = await viaRoute(form(ho("none")));
    expect(etc.status, JSON.stringify(etc.json)).toBe(200);
    expect(etc.nbl?.isNonBusinessLand).toBe(true);
    expect(etc.total).toBe(none.total); // 종전엔 etc가 사업용이라 세액이 낮았다(−57,150,000 방향)
  });

  it("E14-2 «확인 필요» 고지가 결과에 남는다", async () => {
    const r = await viaRoute(form(ho("etc_14호")));
    const warns = JSON.stringify(r.nbl?.warnings ?? r.result?.warnings ?? []);
    expect(warns).toContain("확인 필요");
    expect(warns).toContain("14호");
  });

  it("E14-3 이력 복원: 기존 이력의 etc_14호 선택은 그대로 복원되고 판정만 바뀐다(마이그레이션 없음)", () => {
    const a = migrateAsset({ ...makeDefaultAsset(1), nblOtherRelatedBusinessType: "etc_14호" });
    expect(a.nblOtherRelatedBusinessType).toBe("etc_14호");
  });
});

describe("3호 — 조성 완료일(2년 단서)", () => {
  const THREE = ho("private_investment_land");

  it("T-1 ⑧ — 조성 완료일 미입력은 그 칸으로 막는다", () => {
    const hit = issuesOf(form(THREE));
    expect(hit[0]?.field, JSON.stringify(hit)).toBe("nblOtherPrivateInvestCompletionDate");
    expect(hit[0]?.message).toContain("조성 완료일");
  });

  it("T-2 ⑭ — 완료일이 엔진에 닿는다: 취득 직후 완료 · 양도가 2년 안 → 사업용, 11년 보유 → 비사업용", async () => {
    const recent = await viaRoute(form({ acquisitionDate: "2023-06-01" }, THREE, { nblOtherPrivateInvestCompletionDate: "2023-06-01" }));
    const old = await viaRoute(form(THREE, { nblOtherPrivateInvestCompletionDate: "2013-06-01" }));
    expect(recent.body.nonBusinessLandRaw.nblOtherPrivateInvestCompletionDate).toBe("2023-06-01"); // ④
    expect(recent.status, JSON.stringify(recent.json)).toBe(200);
    expect(recent.nbl?.isNonBusinessLand).toBe(false);
    expect(old.nbl?.isNonBusinessLand).toBe(true);
  });

  it("T-3 ⑫ — 완료일을 비운 직접 호출은 400 (⑧과 같은 문구)", async () => {
    const ok = await bodyOf(form(THREE, { nblOtherPrivateInvestCompletionDate: "2013-06-01" }));
    const bad = structuredClone(ok);
    bad.nonBusinessLandRaw.nblOtherPrivateInvestCompletionDate = "";
    const res = await post(bad);
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.json)).toContain("nblOtherPrivateInvestCompletionDate");
    expect(JSON.stringify(res.json)).toContain("조성 완료일");
  });
});

describe("기존 호의 면적 인자 — ⑫도 ⑧과 같은 표로 막는다 (종전 ⑫ 공백: 200 + 전량 사업용)", () => {
  it.each([
    ["hatchang", "nblOtherMaxAnnualArea"],
    ["youth_training", "nblOtherYouthCapacity"],
    ["parking_garage", "nblOtherMinGarageArea"],
    ["parking_attached", "nblOtherStandardAreaLimit"],
  ])("R-%s — 인자 없는 직접 호출은 400 · ⑧도 같은 칸", async (v, field) => {
    expect(issuesOf(form(ho(v)))[0]?.field).toBe(field);
    const ok = await bodyOf(form(ho(v), { [field]: "500" } as Partial<AssetForm>));
    const bad = structuredClone(ok);
    bad.nonBusinessLandRaw[field] = "";
    const res = await post(bad);
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.json)).toContain(field);
  });
});

describe("Q-6 (다) 12호 도소매업 — 규칙 §83조의4⑭ 품목 한정", () => {
  const WH = {
    nblRevenueBusinessType: "wholesale_retail",
    nblRevenueCurrentRevenue: "100000000",
    nblRevenueCurrentLandValue: "500000000", // 20% ≥ 10%
  } as Partial<AssetForm>;

  it("W-1 ⑧ — 품목 미선택은 그 칸으로 막는다", () => {
    const hit = issuesOf(form(ho("none"), WH));
    expect(hit[0]?.field, JSON.stringify(hit)).toBe("nblRevenueWholesaleItem");
  });

  it("W-2 ⑭ — 열거 품목(철근)이면 수입금액비율 충족 시 사업용, ④가 품목을 싣는다", async () => {
    const f = form(ho("none"), WH, { nblRevenueWholesaleItem: "rebar" });
    expect(issuesOf(f)).toEqual([]);
    const r = await viaRoute(f);
    expect(r.body.nonBusinessLandRaw.nblRevenueWholesaleItem).toBe("rebar");
    expect(r.status, JSON.stringify(r.json)).toBe(200);
    expect(r.nbl?.isNonBusinessLand).toBe(false);
  });

  it("W-3 농산물 + 시장·유사 장소 아님 → 12호 불인정(비사업용) · 시장 운영이면 사업용 — ⑧은 막지 않는다", async () => {
    const notMarket = await viaRoute(form(ho("none"), WH, { nblRevenueWholesaleItem: "agricultural_product", nblRevenueWholesaleInMarket: false }));
    const market = await viaRoute(form(ho("none"), WH, { nblRevenueWholesaleItem: "agricultural_product", nblRevenueWholesaleInMarket: true }));
    expect(issuesOf(form(ho("none"), WH, { nblRevenueWholesaleItem: "agricultural_product" }))).toEqual([]);
    expect(notMarket.nbl?.isNonBusinessLand).toBe(true);
    expect(market.nbl?.isNonBusinessLand).toBe(false);
  });

  it("W-4 ⑫ — 품목 없는 직접 호출 400 · 열거 밖 값 400", async () => {
    const ok = await bodyOf(form(ho("none"), WH, { nblRevenueWholesaleItem: "rebar" }));
    const noItem = structuredClone(ok);
    noItem.nonBusinessLandRaw.nblRevenueWholesaleItem = "";
    expect((await post(noItem)).status).toBe(400);
    const odd = structuredClone(ok);
    odd.nonBusinessLandRaw.nblRevenueWholesaleItem = "electronics";
    expect((await post(odd)).status).toBe(400);
  });

  it("W-5 다른 업종으로 바꾸면 남은 품목 값은 엔진에 닿지 않는다(stale 무영향)", async () => {
    const f = form(ho("none"), {
      nblRevenueBusinessType: "parking_operation",
      nblRevenueCurrentRevenue: "100000000",
      nblRevenueCurrentLandValue: "500000000",
      nblRevenueWholesaleItem: "agricultural_product",
      nblRevenueWholesaleInMarket: false,
    });
    expect(issuesOf(f)).toEqual([]);
    const r = await viaRoute(f);
    expect(r.nbl?.isNonBusinessLand).toBe(false); // 주차장운영업 3% 충족 — 품목 단서가 걸리지 않는다
  });

  it("W-6 이력 복원: 도소매업을 골랐던 구 이력은 품목 칸이 비어 ⑧이 품목을 묻는다", () => {
    const a = migrateAsset({ ...makeDefaultAsset(1), nblRevenueBusinessType: "wholesale_retail" });
    expect(a.nblRevenueWholesaleItem).toBe("");
    expect(a.nblRevenueWholesaleInMarket).toBe(false);
  });
});
