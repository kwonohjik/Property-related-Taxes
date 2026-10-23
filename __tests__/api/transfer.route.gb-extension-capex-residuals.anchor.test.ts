/**
 * 일반건물 증축 자본적지출 — 남은 한계 2건 + O-1 (2026-10-23)
 *
 * 계획서: `docs/00-pm/gb-extension-capex-residuals.plan.md` (Q-1 b · Q-2 a · Q-3 a 확정). 폼 → ⑧ → ④ → ⑫ → ⑭ → ⑦ 산식 · mock 세율.
 *
 * - L1 지분 분할(축 B) 결과 산식이 단건·축 A와 같은 형식이다 — 증축 가산(`partDirectAddition`·`partBeforeExtensionCapex`)과
 *   증축 없는 실가 경로(`shareActualExpenseEcho`) 둘 다. 종전: 「자산별 양도비 (§97① 나목)」·「사용자 직접 입력」.
 * - L2 ⑫는 증축 자산의 자본적지출이 있는데 「그중 증축 전」 키가 없으면 400. ④는 칸이 화면에 있을 때만 총액을 싣는다 —
 *   부담부증여로 칸이 숨은 증축 자산이 ⑧ 통과 ↔ ⑫ 400으로 갈리지 않는다.
 * - O-1 분리 OFF·부담부증여에서 숨은 파트 자본적지출 칸의 잔존값을 ④가 싣지 않는다(종전: 엔진이 공제 — 251,130,000).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { allIssues, captureBody, newForm } from "../calc/_one-house-pr3a-calc-route";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { buildGbExpenseFormula } from "@/components/calc/results/transfer/DetailedStatementGbFormulas";
import type { AssetForm, TransferFormData } from "@/lib/stores/calc-wizard-store";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

const T = 1_600_000_000;
const BASE: Partial<AssetForm> = {
  assetKind: "general_building",
  addressJibun: "서울 강남구 역삼동 1",
  gbAcqLandPricePerSqm: "1000000",
  gbAcqBuildingValue: "150000000",
  gbLandArea: "205",
  gbBuildingArea: "300",
  gbBuildingFootprintArea: "135",
  gbZoneType: "general_residential",
  gbTransferLandPricePerSqm: "5514000",
  gbTransferBuildingValue: "259072400",
  actualSalePrice: String(T),
  ownershipNumerator: "100",
  ownershipDenominator: "100",
};
/** 매매 · 분리 ON · 파트 실가 + 파트 자본적지출. */
const BUY: Partial<AssetForm> = {
  ...BASE,
  acquisitionCause: "purchase",
  gbBuildingAcquisitionCause: "purchase",
  hasSeperateLandAcquisitionDate: true,
  landAcquisitionDate: "2005-05-01",
  acquisitionDate: "2010-05-01",
  landAcqMode: "actual",
  buildingAcqMode: "actual",
  landAcquisitionPrice: "400000000",
  buildingAcquisitionPrice: "200000000",
  landDirectExpenses: "10000000",
  buildingDirectExpenses: "4000000",
};
/** 매매 · 분리 OFF · 자산 단위 실가 — 파트 칸은 화면에 없다. */
const OFF: Partial<AssetForm> = {
  ...BUY,
  hasSeperateLandAcquisitionDate: false,
  acquisitionDate: "2005-05-01",
  fixedAcquisitionPrice: "600000000",
  landAcquisitionPrice: "",
  buildingAcquisitionPrice: "",
  landDirectExpenses: "",
  buildingDirectExpenses: "",
};
/** 증축분 실가 · 건물 파트 자본적지출 2천만(그중 증축 전 5백만) · 양도비 1천만. */
const EXT: Partial<AssetForm> = {
  gbHasExtension: true,
  gbExtensionDate: "2018-05-01",
  gbExtensionArea: "50",
  gbExtensionAcquisitionMode: "actual",
  gbExtensionAcquisitionCause: "purchase",
  gbExtensionActualAcquisitionPrice: "50000000",
  gbTransferExtensionBuildingStdPrice: "40000000",
  gbAcquisitionExtensionBuildingStdPrice: "30000000",
  buildingDirectExpenses: "20000000",
  gbBuildingCapexBeforeExtension: "5000000",
  landDirectExpenses: "",
  transferExpense: "10000000",
};
const BG: Partial<AssetForm> = {
  transferType: "burdened_gift",
  acquisitionCause: "gift",
  gbBuildingAcquisitionCause: "gift",
  bgValuationMode: "sangjeungbeop_standard",
  bgLendingDepositTotal: "100000000",
  bgDonorRelation: "lineal_ascendant_adult",
};
const share = (n: string) => ({ ownershipNumerator: n, ownershipDenominator: "100" }) as Partial<AssetForm>;
const HALF_A = { ...share("50"), ownershipRemainderThirdParty: "yes" } as Partial<AssetForm>;
const FRACTIONAL = { assetSplitMode: "fractional" } as Partial<TransferFormData>;

const asset = (n: number, ...over: Partial<AssetForm>[]) => Object.assign({ ...makeDefaultAsset(n) }, ...over) as AssetForm;
function form(assets: AssetForm[], extra: Partial<TransferFormData> = {}): TransferFormData {
  const f = newForm();
  f.transferDate = "2026-02-16";
  f.filingDate = "2026-05-31";
  f.contractTotalPrice = String(T);
  f.assets = assets;
  return Object.assign(f, extra);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;
type Prop = { propertyId: string; necessaryExpense: number };
async function post(body: unknown) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
      body: JSON.stringify(body),
    }),
  );
  return { status: res.status, json: (await res.json()) as Json };
}
async function run(f: TransferFormData) {
  const body = await captureBody(f);
  const { status, json } = await post(body);
  const agg = json.data?.aggregated;
  const gb = agg?.generalBuildingValuationDetail;
  const formulas: Record<string, string | undefined> = {};
  for (const p of (agg?.properties ?? []) as Prop[]) {
    formulas[p.propertyId] = gb
      ? buildGbExpenseFormula({ ...p, capitalExpenditureForDisplay: 0 } as never, gb)
      : undefined;
  }
  return { status, json, body, issues: allIssues(f), tax: agg?.calculatedTax as number | undefined, formulas };
}
const gvOf = (b: Json) => b.generalBuildingValuation ?? b.assets?.[0]?.generalBuildingValuation;

describe("L1 지분 분할(축 B) 결과 산식 — 단건·축 A와 같은 형식", () => {
  it("증축 · 50/50 → 원건물 「증축 전 자본적지출 + 안분」 · 증축분 「안분 가산」(축 A 50%와 같은 문구 · 종전 「자산별 양도비」·「사용자 직접 입력」)", async () => {
    const a = await run(form([asset(1, BUY, EXT, HALF_A)]));
    const b = await run(form([asset(1, BUY, EXT, share("50")), asset(2, BUY, EXT, share("50"))], FRACTIONAL));
    expect(b.status).toBe(200);
    const b1 = "증축 전 자본적지출 2,500,000 + 자본적지출·양도비 안분 7,403,099 = 9,903,099 (§97②1호)";
    const b2 = "자본적지출·양도비 안분 = 1,143,017 (§97②1호 — 실지거래가액 파트 가산)";
    expect(a.formulas.building1).toBe(b1);
    expect(a.formulas.building2).toBe(b2);
    for (const k of ["0", "1"]) {
      expect(b.formulas[`building1#${k}`]).toBe(b1);
      expect(b.formulas[`building2#${k}`]).toBe(b2);
      expect(b.formulas[`land#${k}`]).toBe("자본적지출·양도비 안분 = 3,953,884 (§97②1호 — 실지거래가액 파트 가산)");
    }
  });

  it("증축 없음 · 실가 · 30/70 → 지분마다 자기 금액으로 「양도비 안분 + 자본적지출 직접 입력」(종전 「자산별 양도비 (§97① 나목)」)", async () => {
    const r = await run(
      form([asset(1, BUY, share("30"), { transferExpense: "10000000" }), asset(2, BUY, share("70"), { transferExpense: "10000000" })], FRACTIONAL),
    );
    expect(r.status).toBe(200);
    for (const [k, f] of Object.entries(r.formulas)) {
      expect(f, k).toMatch(/^양도비 .*\n\s+자본적지출 [\d,]+ \((토지|건물) 칸 직접 입력\)\n\s+합계 = /);
    }
    // 지분별 금액 — 지분 0(30%)과 지분 1(70%)의 직접 입력값이 다르다(한 벌 echo였다면 한쪽은 합계가 안 맞아 종전 문구로 떨어진다).
    expect(r.formulas["land#0"]).toContain("자본적지출 3,000,000 (토지 칸 직접 입력)");
    expect(r.formulas["land#1"]).toContain("자본적지출 7,000,000 (토지 칸 직접 입력)");
  });
});

describe("L2 ⑫ 「그중 증축 전」 필수 · ④ 칸이 있을 때만 전송", () => {
  it("분리 OFF 자산 단위 자본적지출 · 증축 전 키 생략 → 400(종전 200 · 전부 증축 후로 계산)", async () => {
    const f = form([asset(1, OFF, EXT, { buildingDirectExpenses: "", gbBuildingCapexBeforeExtension: "", capitalExpenditure: "20000000", gbCapexBeforeExtension: "0" })]);
    const body = await captureBody(f);
    expect(gvOf(body).capitalExpenditureBeforeExtension).toBe(0);
    expect((await post(body)).status).toBe(200);
    delete gvOf(body).capitalExpenditureBeforeExtension;
    const r = await post(body);
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.json.error)).toContain("capitalExpenditureBeforeExtension");
  });

  it("분리 ON 건물 파트 자본적지출 · 증축 전 키 생략 → 400", async () => {
    const body = await captureBody(form([asset(1, BUY, EXT)]));
    expect(gvOf(body).buildingDirectExpensesBeforeExtension).toBe(5_000_000);
    delete gvOf(body).buildingDirectExpensesBeforeExtension;
    const r = await post(body);
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.json.error)).toContain("buildingDirectExpensesBeforeExtension");
  });

  it("증축 없으면 묻지 않는다 — 자본적지출만 있어도 200", async () => {
    const r = await run(form([asset(1, OFF, { capitalExpenditure: "20000000" })]));
    expect(r.status).toBe(200);
  });

  it("🔴 부담부증여 · 증축 · 숨은 자본적지출 칸 2천만 → ⑧ 통과 = ⑫ 통과(200) · 증축으로 싣지 않는다 · 결과는 빈 칸과 같다", async () => {
    const hidden = await run(form([asset(1, OFF, EXT, BG, { capitalExpenditure: "20000000", gbCapexBeforeExtension: "" })]));
    const clean = await run(form([asset(1, OFF, EXT, BG, { capitalExpenditure: "", gbCapexBeforeExtension: "" })]));
    expect(hidden.issues).toEqual([]);
    expect(hidden.status).toBe(200);
    // #2459 이후 부담부증여는 증축 토글이 숨어(⑤) 증축으로 계산하지 않는다 — 실가 경로라 ⑫ 「증축 전」 필수 규칙의 대상이 아니다.
    //   (종전 단언 「④ 자본적지출 미전송」은 증축 경로 전제였다. 실가 경로의 §159는 이 평가 방식에서 자본적지출을 쓰지 않아 결과가 같다.)
    expect(gvOf(hidden.body).extensionInfo).toBeUndefined();
    expect(JSON.stringify(hidden.json.data)).toBe(JSON.stringify(clean.json.data));
  });

  it("🔴 부담부증여 · 숨은 양도비 칸 잔존값도 ④ 미전송 — #2459 라우팅(부담부증여 → 실가 갈래) 뒤에도 같은 규칙", async () => {
    const hidden = await run(form([asset(1, OFF, EXT, BG, { capitalExpenditure: "", gbCapexBeforeExtension: "", transferExpense: "20000000" })]));
    const clean = await run(form([asset(1, OFF, EXT, BG, { capitalExpenditure: "", gbCapexBeforeExtension: "" })]));
    expect(hidden.status).toBe(200);
    expect(gvOf(hidden.body).transferExpense).toBeUndefined();
    expect(JSON.stringify(hidden.json.data)).toBe(JSON.stringify(clean.json.data));
  });
});

describe("O-1 숨은 파트 자본적지출 칸 잔존값 — ④ 미전송", () => {
  it("🔴 분리 OFF · 증축 없음 · 건물 파트 칸 2천만 잔존 → 세액 257,010,000 = 빈 칸(종전 251,130,000)", async () => {
    const stale = await run(form([asset(1, OFF, { buildingDirectExpenses: "20000000", capitalExpenditure: "0" })]));
    const clean = await run(form([asset(1, OFF, { capitalExpenditure: "0" })]));
    expect(stale.issues).toEqual([]);
    expect(gvOf(stale.body).buildingDirectExpenses).toBeUndefined();
    expect(stale.tax).toBe(257_010_000);
    expect(clean.tax).toBe(257_010_000);
  });

  it("분리 OFF · 증축 · 건물 파트 칸 잔존 → 미전송 · ⑫ 필수 규칙에 걸리지 않는다(200)", async () => {
    const r = await run(form([asset(1, OFF, EXT, { buildingDirectExpenses: "20000000", gbBuildingCapexBeforeExtension: "", capitalExpenditure: "0" })]));
    expect(r.issues).toEqual([]);
    expect(r.status).toBe(200);
    expect(gvOf(r.body).buildingDirectExpenses).toBeUndefined();
    expect(gvOf(r.body).buildingDirectExpensesBeforeExtension).toBeUndefined();
  });

  it("부담부증여 · 분리 ON · 숨은 파트 칸 잔존 → 미전송", async () => {
    const body = await captureBody(form([asset(1, BUY, BG)]));
    expect(gvOf(body).landDirectExpenses).toBeUndefined();
    expect(gvOf(body).buildingDirectExpenses).toBeUndefined();
  });

  it("분리 ON 매매 · 파트 칸(화면에 있음)은 종전대로 싣는다", async () => {
    const body = await captureBody(form([asset(1, BUY)]));
    expect(gvOf(body).landDirectExpenses).toBe(10_000_000);
    expect(gvOf(body).buildingDirectExpenses).toBe(4_000_000);
  });
});
