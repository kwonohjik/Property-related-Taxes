/**
 * D2-1 Check 후속 #1 — 상속·증여 호스트의 **화면에 없는 stale 분리 입력**은 ④·⑧·⑥이 「분리 없음」으로 읽는다 (2026-10-09)
 *
 * 만드는 경로: 일반건물에서 「취득일 다름」 + 토지 상속·증여 입력 → 자산 종류를 주택·건물로 전환(전환 patch가 `hasSeperate…`를 끄지 않음),
 * 또는 2026-07-30 이전 저장분. HEAD: ⑧ 통과·⑫ 200(토지를 상속으로 침묵 계산) → D2-1 최초 구현: Y8로 ⑧·⑫ 차단인데 고칠 칸이 화면에 없음.
 * 수정: `hasStaleSplitInput` 술어로 읽는 쪽 파생(D0 G-6) — 저장값은 지우지 않는다. 비-stale 경로(D1·소유자 분리·부담부증여·일반건물)는 같은 객체를 돌려준다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { buildPropertyPayload } from "@/lib/calc/multi-transfer-tax-api";
import { buildAssetPayload } from "@/lib/calc/transfer-tax-api-companion-payload";
import { validateAssetAcquisition } from "@/lib/calc/transfer-tax-validate-acquisition";
import { isSeparateAcquisition, separateAcqPartsSum } from "@/lib/calc/transfer-tax-split-acq-mode";
import { validateAssetEntry } from "@/lib/calc/transfer-tax-validate-asset";
import { computeTransferPerAssetSummary } from "@/lib/stores/transfer-per-asset-summary";
import { isSplitPayloadActive } from "@/lib/calc/transfer-tax-api-split";
import { hasStaleSplitInput, normalizeBuildingCauseInputs } from "@/lib/calc/transfer-land-part-cause";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const TD = "2026-06-30";

/** 상속 호스트 + 토지 취득일 분리 잔재(토지 상속·증여 overlay 값까지) + 파트 가액 잔존 — 화면은 자산 단위 상속 계산만 보여준다. */
function stale(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "housing", acquisitionCause: "inheritance", acquisitionDate: "2018-03-02", inheritanceStartDate: "2018-03-02", inheritanceDate: "2018-03-02",
    decedentAcquisitionDate: "2000-01-01", publishedValueAtInheritance: "700,000,000", inheritanceValuationMethod: "appraisal",
    actualSalePrice: "1,200,000,000", standardPriceAtTransfer: "1,200,000,000",
    hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2008-05-10", landAcquisitionCause: "inheritance", landDecedentAcquisitionDate: "1990-01-01",
    landAcqMode: "actual", buildingAcqMode: "actual", landAcquisitionPrice: "300,000,000", buildingAcquisitionPrice: "400,000,000",
    saleSplitMode: "actual", landTransferPrice: "700,000,000", buildingTransferPrice: "500,000,000",
    landStandardPriceAtTransfer: "700,000,000", buildingStandardPriceAtTransfer: "500,000,000",
    ...over,
  } as unknown as AssetForm;
}
const clean = (a: AssetForm): AssetForm => ({ ...a, hasSeperateLandAcquisitionDate: false });

const form = (a: AssetForm): TransferFormData =>
  ({ transferDate: TD, filingDate: "2026-08-31", assets: [a], houses: [], presaleRights: [], contractTotalPrice: "1200000000", totalTransferExpense: "0", householdHousingCount: "1", isOneHousehold: false }) as unknown as TransferFormData;

async function bodyOf(a: AssetForm): Promise<Record<string, unknown>> {
  let body: Record<string, unknown> = {};
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
    body = JSON.parse(String(init?.body));
    return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
  }));
  await callTransferTaxAPI(form(a));
  vi.unstubAllGlobals();
  return body;
}
const ENGINE_BASE = { isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, annualBasicDeductionUsed: 0, isOneHousehold: false, householdHousingCount: 1, residencePeriodMonths: 0 };
async function route(body: Record<string, unknown>) {
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...ENGINE_BASE, ...Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined)) }) }));
  const j = await res.json();
  return { status: res.status, tax: j?.data?.result?.determinedTax as number | undefined, sd: j?.data?.result?.splitDetail, body: j };
}

describe("stale 분리 입력 — 상속·증여 호스트 (D2 토글 없음)", () => {
  it.each([
    ["상속 · overlay 상속 잔재", {}],
    ["증여", { acquisitionCause: "gift", decedentAcquisitionDate: "", donorAcquisitionDate: "", fixedAcquisitionPrice: "700,000,000", landAcquisitionCause: "gift" }],
    ["overlay 없음", { landAcquisitionCause: "" }],
    ["D2 잔재(`purchase`)지만 호스트 태그 없음", { landAcquisitionCause: "purchase", landCauseHost: "" }],
  ] as const)("%s → 술어가 stale로 읽는다 · ④ body에 분리 입력이 없고 ⑧ 통과 · ⑫ 200 · 세액이 분리 없는 같은 자산과 같다", async (_n, over) => {
    const a = stale(over as Partial<AssetForm>);
    expect(hasStaleSplitInput(a)).toBe(true);
    expect(isSplitPayloadActive(a, false)).toBe(false);
    expect(isSeparateAcquisition(a)).toBe(false);
    // ④
    const b = await bodyOf(a);
    expect(b.landAcquisitionDate).toBeUndefined();
    expect(b.landAcquisitionCause).toBeUndefined();
    expect(b.isSeparateAcquisition).toBeUndefined();
    expect(b.landAcquisitionPrice).toBeUndefined();
    expect(JSON.stringify(b)).toBe(JSON.stringify(await bodyOf(clean(a)))); // 분리를 끈 자산과 body가 바이트 동일
    // ⑧
    expect(validateAssetAcquisition(a, "자산1", TD)).toBe(validateAssetAcquisition(clean(a), "자산1", TD));
    // ⑫·엔진
    const r = await route(b);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.sd).toBeUndefined(); // 분리 계산이 아니라 자산 단위 상속 계산
    expect(r.tax).toBe((await route(await bodyOf(clean(a)))).tax);
  });

  it("컴패니언·다건 ④도 같다 — stale 분리 입력을 싣지 않는다", async () => {
    const a = stale();
    const comp = buildAssetPayload({ ...a, assetId: "c1" } as AssetForm, "apportioned", TD) as Record<string, unknown>;
    const compClean = buildAssetPayload({ ...clean(a), assetId: "c1" } as AssetForm, "apportioned", TD) as Record<string, unknown>;
    expect(JSON.stringify(comp)).toBe(JSON.stringify(compClean));
    const multi = buildPropertyPayload(form(a)) as unknown as Record<string, unknown>;
    expect(JSON.stringify(multi)).toBe(JSON.stringify(buildPropertyPayload(form(clean(a)))));
  });

  it("⑥ 파트 합계도 stale 가액을 읽지 않는다 — 분리 없는 자산과 같은 경로", () => {
    expect(normalizeBuildingCauseInputs(stale()).hasSeperateLandAcquisitionDate).toBe(false);
    expect(separateAcqPartsSum(stale())).toEqual(separateAcqPartsSum(clean(stale())));
  });

  it("⑥ 자산 행 취득가액 · ⑧ 날짜 정합(숨은 토지 취득일이 양도일 이후여도 막히지 않음)도 분리 없는 자산과 같다", () => {
    const a = stale({ landAcquisitionDate: "2027-01-01" }); // 화면에 없는 토지일이 양도일(2026-06-30) 이후
    const rows = (x: AssetForm) => computeTransferPerAssetSummary(form(x), null).rows[0];
    expect(rows(a).acqPrice).toBe(rows(clean(a)).acqPrice);
    expect(rows(a).acqPending).toBe(rows(clean(a)).acqPending);
    const dateErr = (x: AssetForm) => validateAssetEntry(x, 0, form(x));
    expect(dateErr(a)).toBe(dateErr(clean(a)));
    expect(String(dateErr(a) ?? "")).not.toContain("토지 취득일");
    // 환산 미리보기 게이트(`canPreviewEstimated`)도 stale 분리 입력에 막히지 않는다
    const est = { landAcquisitionPrice: "", buildingAcquisitionPrice: "", inheritanceStartDate: "", publishedValueAtInheritance: "", useEstimatedAcquisition: true, standardPriceAtAcq: "600,000,000", standardPriceAtTransfer: "1,200,000,000", fixedAcquisitionPrice: "" } as Partial<AssetForm>;
    expect(rows(clean(stale(est))).acqPrice).toBe(600_000_000); // 환산 미리보기: 12억 × 6억 ÷ 12억 (비어 있지 않은 값을 비교한다)
    expect(rows(stale(est)).acqPrice).toBe(rows(clean(stale(est))).acqPrice);
    // 긍정 짝: D1 호스트(매매)의 분리 입력은 종전대로 날짜 정합을 검증한다
    expect(String(dateErr({ ...a, acquisitionCause: "purchase", landCauseHost: "purchase" } as unknown as AssetForm) ?? "")).toContain("토지 취득일");
  });

  it("Y8(API 직접 호출 방어)은 유지 — stale 정규화는 클라이언트 읽기 쪽 파생일 뿐 ⑫는 그대로 400", async () => {
    const b = await bodyOf(clean(stale()));
    const direct = await route({ ...b, isSeparateAcquisition: true, landAcquisitionDate: "2008-05-10", landAcqMode: "actual", buildingAcqMode: "actual", landAcquisitionPrice: 300_000_000, buildingAcquisitionPrice: 400_000_000, landTransferPrice: 700_000_000, buildingTransferPrice: 500_000_000, landStandardPriceAtTransfer: 700_000_000, buildingStandardPriceAtTransfer: 500_000_000 });
    expect(direct.status).toBe(400);
    expect(JSON.stringify(direct.body)).toContain("토지 취득원인이 없습니다");
  });
});

describe("건드리지 않는 경로 — 같은 객체를 돌려준다 (body 바이트 동일)", () => {
  const same = (a: AssetForm) => {
    expect(hasStaleSplitInput(a)).toBe(false);
    expect(normalizeBuildingCauseInputs(a)).toBe(a);
  };
  it("D1 호스트(신축·매매) · 소유자 분리 · 부담부증여 · 일반건물 · 겸용 · 분리 OFF · D2 유효", () => {
    same(stale({ acquisitionCause: "purchase", landCauseHost: "purchase" as never }));
    same(stale({ acquisitionCause: "newConstruction", landCauseHost: "newConstruction" as never }));
    same(stale({ selfOwns: "land_only", landAcquisitionCause: "" }));
    same(stale({ selfOwns: "building_only" }));
    same(stale({ transferType: "burdened_gift", acquisitionCause: "gift" }));
    same(stale({ assetKind: "general_building" }));
    same(stale({ isMixedUseHouse: true }));
    same(stale({ hasSeperateLandAcquisitionDate: false }));
    same(stale({ landAcquisitionCause: "purchase", landCauseHost: "inheritance" as never, buildingAcqMode: "actual" })); // D2 유효(+ 방식 이미 actual)
  });
  it("소유자 분리(상속 호스트 · hasSeperate 켜짐)의 ④ 토지 취득일 후퇴 송신은 종전 그대로", async () => {
    const a = stale({ selfOwns: "land_only", landAcquisitionCause: "" });
    const b = await bodyOf(a);
    expect(b.landAcquisitionDate).toBe("2008-05-10"); // hasSeperate && landAcquisitionDate → 입력값 그대로
    expect(b.selfOwns).toBe("land_only");
  });
});
