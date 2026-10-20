/**
 * Y4e — 「건물(토지 제외)」을 2001.1.1.~2005.4.29.에 상속·증여받고 토지를 따로 매수한 계산(D2)의 일괄 고시 질문 (2026-10-21)
 *
 * 계획서 transfer-acq-cause-mixed.plan.md §13.5 · 사용자 결정 「필수 질문 + 2001.1.1.」.
 * 일반 건물 경계 2001.1.1. = 국세청 고시 「건물에 대한 취득당시 기준시가 산정 기준율」 시행일(「2000.12.31 이전」 취득분이 고시 전). 그 뒤 상속·증여는 영 §163⑨ 단서 2호가 아니다.
 * (상속세 및 증여세법 §61①2호의 국세청장 고시 문언은 2000.7.1. 시행 — 2000.7.1.~12.31.은 확인 필요라 막는다.)
 * 국세청이 토지·건물을 일괄 고시하는 오피스텔·상업용 건물(같은 항 3호)은 첫 고시일이 지역마다 달라 「예」면 막는다. 2001.1.1. 전은 종전 Y4a.
 *
 * 클라이언트 ④(callTransferTaxAPI·callMultiTransferTaxAPI·buildAssetPayload) → ⑫ → ⑭ → 엔진을 실제로 거치고, ⑧(validateAssetAcquisition)과 판정이 같은지 격자로 본다.
 * 시드: 양도 12억(토지 7억 / 건물 5억) 2026-06-30 · 토지 매매 2000-06-10 3억 · 건물 상속(피상속인 1990-01-01) 평가액 3천만.
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
import { POST as MULTI } from "@/app/api/calc/transfer/multi/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { callMultiTransferTaxAPI } from "@/lib/calc/multi-transfer-tax-api";
import { buildLandPartCausePayload } from "@/lib/calc/transfer-tax-api-split";
import { buildingBundledQuestionApplies } from "@/lib/calc/transfer-land-part-cause";
import { validateAssetAcquisition } from "@/lib/calc/transfer-tax-validate-acquisition";
import { collectWithFields } from "@/lib/calc/transfer-tax-validate-field";
import { collectSplitPartCauseIssues, BUILDING_CAUSE_PRE_DISCLOSURE_CARRYOVER_MESSAGE } from "@/lib/tax-engine/transfer-split-part-cause";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { MultiTransferFormData } from "@/lib/stores/multi-transfer-tax-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any;
type Form = ReturnType<typeof createDefaultTransferFormData>;
const TRANSFER_DATE = "2026-06-30";

const req = (url: string, b: object) =>
  new NextRequest(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });

/** D2 토글 ON 비주택 건물 — 건물 상속 `date`, 토지 매매 2000-06-10. */
function building(date: string, over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "building", acquisitionCause: "inheritance", acquisitionDate: date, inheritanceStartDate: date, inheritanceDate: date,
    decedentAcquisitionDate: "1990-01-01", landCauseHost: "inheritance", landAcquisitionCause: "purchase", landAcquisitionDate: "2000-06-10",
    hasSeperateLandAcquisitionDate: true, landAcqMode: "actual", buildingAcqMode: "actual", landAcquisitionPrice: "300,000,000",
    buildingAcquisitionPrice: "30,000,000", actualSalePrice: "1,200,000,000", saleSplitMode: "actual", landTransferPrice: "700,000,000",
    buildingTransferPrice: "500,000,000", landStandardPriceAtTransfer: "700,000,000", buildingStandardPriceAtTransfer: "500,000,000",
    ...over,
  } as AssetForm;
}
function form(assets: AssetForm[], over: Partial<Form> = {}): Form {
  const f = createDefaultTransferFormData();
  f.transferDate = TRANSFER_DATE;
  f.contractTotalPrice = "1,200,000,000";
  f.householdHousingCount = "2";
  f.assets = assets as never;
  return Object.assign(f, over);
}
async function bodyOf(send: () => Promise<unknown>) {
  let body: unknown;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return { ok: true, json: async () => ({ data: { mode: "single", result: {} } }) } as Response;
    }),
  );
  await send().catch(() => undefined);
  vi.unstubAllGlobals();
  return body as J;
}
const ROUTE_FILL = { isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false, annualBasicDeductionUsed: 0, residencePeriodMonths: 0 };
async function single(f: Form) {
  const body = await bodyOf(() => callTransferTaxAPI(f));
  const res = await POST(req("http://l/api/calc/transfer", { ...ROUTE_FILL, ...body }));
  const j = (await res.json()) as J;
  return { status: res.status, body: j, r: j?.data?.result, sent: body };
}
async function multi(f: Form) {
  const m = { taxYear: 2026, annualBasicDeductionUsed: "0", basicDeductionAllocation: "EARLIEST_TRANSFER" } as MultiTransferFormData;
  const body = await bodyOf(() => callMultiTransferTaxAPI(m, [{ propertyId: "p1", propertyLabel: "p1", form: f, completionPercent: 100 }]));
  const res = await MULTI(req("http://l/api/calc/transfer/multi", body));
  return { status: res.status, body: (await res.json()) as J, sent: body };
}
const v8 = (a: AssetForm) => collectWithFields(() => validateAssetAcquisition(a, "자산1", TRANSFER_DATE));

describe("④ 전송 — 질문이 열린 자리에서 고른 값만", () => {
  it("2003 「아니오」·「예」는 싣고, 미선택은 싣지 않는다", () => {
    expect(buildLandPartCausePayload(building("2003-05-01", { buildingBundledStdPrice: "no" })).buildingBundledStdPrice).toBe("no");
    expect(buildLandPartCausePayload(building("2003-05-01", { buildingBundledStdPrice: "yes" })).buildingBundledStdPrice).toBe("yes");
    expect("buildingBundledStdPrice" in buildLandPartCausePayload(building("2003-05-01"))).toBe(false);
  });
  it("질문이 닫힌 자리의 잔재는 싣지 않는다 — 2005-04-30 · 2000-12-31 · 주택 · D2 꺼짐 · 건물 매매", () => {
    const stale = { buildingBundledStdPrice: "no" } as const;
    for (const a of [
      building("2005-04-30", stale),
      building("2000-12-31", stale),
      building("2003-05-01", { ...stale, assetKind: "housing" }),
      building("2003-05-01", { ...stale, hasSeperateLandAcquisitionDate: false }),
      building("2003-05-01", { ...stale, acquisitionCause: "purchase", landCauseHost: "purchase" as never }),
    ]) {
      expect(buildingBundledQuestionApplies(a), `${a.assetKind}/${a.acquisitionDate}/${a.acquisitionCause}`).toBe(false);
      expect("buildingBundledStdPrice" in buildLandPartCausePayload(a)).toBe(false);
    }
  });
});

describe("단건 ④ → ⑫ → ⑭ → 엔진", () => {
  it("「아니오」 → 200 · 건물 취득가액 = 평가액 30,000,000 그대로(단서 2호 비교 없음) · 2005-04-30 상속과 같은 건물 취득가액", async () => {
    const s = await single(form([building("2003-05-01", { buildingBundledStdPrice: "no" })]));
    expect(s.sent.buildingBundledStdPrice).toBe("no");
    expect(s.status, JSON.stringify(s.body)).toBe(200);
    expect(s.r.splitDetail.building.acquisitionPrice).toBe(30_000_000);
    expect(s.r.splitDetail.building.acquisitionBasis).toBeUndefined();
    const out = await single(form([building("2005-04-30")]));
    expect(out.status, JSON.stringify(out.body)).toBe(200);
    expect(out.r.splitDetail.building.acquisitionPrice).toBe(30_000_000);
  });
  it("미선택 → 400 buildingBundledStdPrice(확인 요구) · 「예」 → 400(지원 안 함) · 2000-12-31 → 400 acquisitionDate(Y4a)", async () => {
    const miss = await single(form([building("2003-05-01")]));
    expect(miss.status).toBe(400);
    expect(miss.body.error.fieldErrors.buildingBundledStdPrice?.[0]).toContain("확인이 필요합니다");
    const yes = await single(form([building("2003-05-01", { buildingBundledStdPrice: "yes" })]));
    expect(yes.status).toBe(400);
    expect(yes.body.error.fieldErrors.buildingBundledStdPrice?.[0]).toContain("지원하지 않습니다");
    const pre = await single(form([building("2000-12-31", { buildingBundledStdPrice: "no" })]));
    expect(pre.status).toBe(400);
    expect(pre.body.error.fieldErrors.acquisitionDate?.[0]).toContain("일반 건물은 2001.1.1. 전");
  });
});

describe("다건 합산 route (⑭ multi/route.ts)", () => {
  it("「아니오」 → 200 · 단건과 같은 totalTax · 미선택 → 400", async () => {
    const f = form([building("2003-05-01", { buildingBundledStdPrice: "no" })]);
    const s = await single(f);
    const m = await multi(f);
    expect(JSON.stringify(m.sent)).toContain("\"buildingBundledStdPrice\":\"no\"");
    expect(m.status, JSON.stringify(m.body)).toBe(200);
    expect(m.body.data.totalTax).toBe(s.r.totalTax);
    expect((await multi(form([building("2003-05-01")]))).status).toBe(400);
  });
});

describe("함께 양도 자산(컴패니언) — ④ buildAssetPayload · ⑫ 컴패니언 스키마 · ⑭ bundled-split-helpers", () => {
  function bundled(companion: AssetForm): Form {
    const land = { ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 2-1", assetKind: "land", acquisitionCause: "purchase", acquisitionDate: "2010-01-01", fixedAcquisitionPrice: "100,000,000", standardPriceAtTransfer: "300,000,000", actualSalePrice: "300,000,000" } as AssetForm;
    return form([land, { ...companion, assetId: "c1" } as AssetForm], { contractTotalPrice: "1,500,000,000", bundledSaleMode: "actual" as never } as never);
  }
  it("「아니오」 → body에 실리고 200 · 컴패니언 건물 취득가액 30,000,000 · 미선택 → 400 companionAssets.0.buildingBundledStdPrice", async () => {
    const s = await single(bundled(building("2003-05-01", { buildingBundledStdPrice: "no" })));
    expect(s.sent.companionAssets[0].buildingBundledStdPrice).toBe("no");
    expect(s.status, JSON.stringify(s.body)).toBe(200);
    const c1 = s.body.data.aggregated.properties.find((p: J) => p.propertyId === "c1");
    expect(c1.splitDetail.building.acquisitionPrice).toBe(30_000_000);
    const miss = await single(bundled(building("2003-05-01")));
    expect(miss.status).toBe(400);
    expect(Object.keys(miss.body.error.fieldErrors ?? {})).toContain("companionAssets.0.buildingBundledStdPrice");
  });
});

describe("⑧ ≡ ⑫ 격자 — 날짜 × 답 × 원인(상속·증여): ⑧이 통과면 ⑫도 통과, ⑧이 막으면 ⑫도 막는다", () => {
  const DATES = ["2000-12-31", "2001-01-01", "2003-05-01", "2005-04-29", "2005-04-30"] as const;
  const ANSWERS = ["", "yes", "no"] as const;
  /** 법령 기대: 2001.1.1. 전은 늘 차단 · 구간 안은 「아니오」만 통과 · 2005-04-30은 답과 무관하게 통과 */
  const expected = (d: string, ans: string) => (d < "2001-01-01" ? "block" : d >= "2005-04-30" ? "pass" : ans === "no" ? "pass" : "block");

  it.each(["inheritance", "gift"] as const)("%s — 15셀", async (host) => {
    for (const d of DATES) {
      for (const ans of ANSWERS) {
        const a = building(d, {
          acquisitionCause: host, landCauseHost: host as never, buildingBundledStdPrice: ans,
          ...(host === "gift" ? { decedentAcquisitionDate: "" } : {}),
        });
        const cell = `${host}/${d}/${ans || "미선택"}`;
        const eightRes = v8(a);
        const eight = eightRes.result ? "block" : "pass";
        const twelve = (await single(form([a]))).status === 200 ? "pass" : "block";
        expect(eight, `⑧ ${cell} ${eightRes.result ?? ""}`).toBe(expected(d, ans));
        expect(twelve, `⑫ ${cell}`).toBe(expected(d, ans));
        // 질문 칸에 막히면 ⑧이 그 칸으로 데려간다(고칠 수 있는 칸)
        if (eight === "block" && d >= "2001-01-01") expect(eightRes.fieldOf(eightRes.result!), cell).toBe("buildingBundledStdPrice");
      }
    }
  });
});

describe("C(이월과세 + 증여자 취득일 상이)는 이번 변경 밖 — 비주택도 2005.4.30. 전 증여는 종전처럼 막는다", () => {
  it("leaf: C 비주택 2003 증여 → 종전 C 문구(acquisitionDate) · 「아니오」가 와도 같다", () => {
    const C = {
      isSplitable: true, hasLandAcquisitionDate: true, landAcquisitionCause: "carryover_gift", hasLandDecedentAcquisitionDate: false, landMode: "actual" as const,
      landAcquisitionDate: "2003-05-01", buildingAcquisitionCause: "carryover_gift", buildingAcquisitionDate: "2003-05-01", buildingMode: "actual" as const,
      selfOwns: "both" as const, isHousing: false, hasLandCarryover: true, hasBuildingCarryover: true, carryoverGiftDate: "2003-05-01",
    };
    for (const buildingBundledStdPrice of [undefined, "no", "yes"] as const) {
      const issues = collectSplitPartCauseIssues({ ...C, buildingBundledStdPrice });
      expect(issues.find((i) => i.field === "acquisitionDate")?.message, String(buildingBundledStdPrice)).toBe(BUILDING_CAUSE_PRE_DISCLOSURE_CARRYOVER_MESSAGE);
      expect(issues.some((i) => i.field === "buildingBundledStdPrice")).toBe(false);
    }
  });
});
