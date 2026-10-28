/**
 * 화면 경로(폼 → ④ → ⑫ → route) — 토지만 본인 × 같은 세대의 세대 합가 여부·합가일(계획서 `docs/02-design/features/land-only-household-merge-date.plan.md` Q-1 b · Q-2 a).
 *
 * 시료(독립 정수 산식): 양도 12억 = 토지 4.8억 + 건물 7.2억 · 토지 취득가 1.2억 · 주택 2015-01-01 · 토지 2010-01-01(13년) · 2023-02-16 양도 · 1세대1주택(12억 이하).
 *   합가일 2022-06-01(양도 8개월 전): 보유요건 2년 미달 → 토지분 비과세 제외 · 토지 양도차익 360,000,000
 *   장특 표1 토지 13년 26% = 93,600,000 → 266,400,000 − 기본공제 2,500,000 = 263,900,000 × 단기 70%(합가 8개월) = 184,730,000
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { allIssues } from "../calc/_helpers/redev-one-house-route";
import { captureBody } from "../calc/_helpers/redev-one-house-route";
import { postTransfer } from "../calc/_helpers/redev-one-house-route";
import { POST as MULTI } from "@/app/api/calc/transfer/multi/route";
import { callMultiTransferTaxAPI } from "@/lib/calc/multi-transfer-tax-api";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { MultiTransferFormData } from "@/lib/stores/multi-transfer-tax-store";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
afterEach(() => vi.unstubAllGlobals());

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const STD = {
  acquisitionArea: "100", transferArea: "100", standardPricePerSqmAtTransfer: "5600000", buildingStandardPriceAtTransfer: "840000000",
  standardPricePerSqmAtAcq: "2400000", standardPriceAtAcq: "480000000", buildingStandardPriceAtAcq: "360000000", standardPriceAtTransfer: "1400000000",
};
const ONE_HOUSE = {
  transferDate: "2023-02-16", filingDate: "2023-04-30", totalTransferExpense: "0", householdHousingCount: "1", isOneHousehold: true,
  householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true,
};
const PUR: Loose = {
  addressJibun: "서울 강남구 테스트동 1-1", assetKind: "housing", assetLabel: "주택", acquisitionCause: "purchase", acquisitionDate: "2015-01-01",
  actualSalePrice: "1,200,000,000", fixedAcquisitionPrice: "300,000,000", residenceInputMode: "direct", residencePeriods: [], ...STD,
  hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2010-01-01", landAcqMode: "actual", buildingAcqMode: "actual",
  landAcquisitionPrice: "120,000,000", buildingAcquisitionPrice: "180,000,000", saleSplitMode: "actual",
  landTransferPrice: "480,000,000", buildingTransferPrice: "720,000,000",
};
const SAME = { selfOwns: "land_only", buildingOwnerSameHousehold: true };
const MERGED = { ...SAME, buildingOwnerHouseholdMerged: true, buildingOwnerHouseholdMergeDate: "2022-06-01" };

const form = (a: Loose): TransferFormData =>
  Object.assign(createDefaultTransferFormData(), {
    ...ONE_HOUSE, contractTotalPrice: String(a.actualSalePrice).replace(/,/g, ""), assets: [{ ...makeDefaultAsset(1), ...a } as AssetForm],
  }) as TransferFormData;

async function run(a: Loose) {
  const f = form(a);
  const body = (await captureBody(f)) as Loose;
  const r = await postTransfer(body);
  const result = r.result as Loose | undefined;
  return {
    fields: allIssues(f).map((i) => i.field),
    status: r.status,
    tax: result?.calculatedTax as number | undefined,
    isExempt: result?.isExempt as boolean | undefined,
    warnings: (result?.warnings ?? []) as string[],
    zod: Object.keys((r.json as Loose)?.error?.fieldErrors ?? {}),
    body,
  };
}

async function runMulti(a: Loose): Promise<number> {
  const f = form(a);
  let body: unknown;
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => {
    body = JSON.parse(String(init.body));
    return { ok: true, json: async () => ({ data: {} }) } as Response;
  }));
  const mf = { taxYear: 2023, annualBasicDeductionUsed: "0", basicDeductionAllocation: "EARLIEST_TRANSFER" } as MultiTransferFormData;
  await callMultiTransferTaxAPI(mf, [{ propertyId: "p1", propertyLabel: "p1", form: f, completionPercent: 100 }]).catch(() => undefined);
  vi.unstubAllGlobals();
  const res = await MULTI(new NextRequest("http://l/api/calc/transfer/multi", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  expect(res.status).toBe(200);
  return ((await res.json()) as { data: { totalTax: number } }).data.totalTax;
}

describe("합가 여부 · 합가일 — 화면 → route", () => {
  it("합가함(2022-06-01) — 토지분 비과세 제외 · 184,730,000 · 합가일 반영 고지 · body에 합가 여부·합가일", async () => {
    const r = await run({ ...PUR, ...MERGED });
    expect([r.fields, r.status, r.isExempt, r.tax]).toEqual([[], 200, false, 184_730_000]);
    expect(r.warnings.some((w) => w.includes("입력하신 세대 합가일(2022-06-01)"))).toBe(true);
    expect([r.body.buildingOwnerHouseholdMerged, r.body.buildingOwnerHouseholdMergeDate]).toEqual([true, "2022-06-01"]);
  });

  it("처음부터 같은 세대 — 비과세 그대로 0 · 합가일은 싣지 않는다(남은 날짜 잔재 무시)", async () => {
    const r = await run({ ...PUR, ...SAME, buildingOwnerHouseholdMerged: false, buildingOwnerHouseholdMergeDate: "2022-06-01" });
    expect([r.fields, r.status, r.isExempt, r.tax]).toEqual([[], 200, true, 0]);
    expect(r.body.buildingOwnerHouseholdMerged).toBe(false);
    expect(r.body.buildingOwnerHouseholdMergeDate).toBeUndefined();
  });

  it("합가 후 2년 이상(2020-06-01)이면 비과세 그대로 0", async () => {
    const r = await run({ ...PUR, ...SAME, buildingOwnerHouseholdMerged: true, buildingOwnerHouseholdMergeDate: "2020-06-01" });
    expect([r.fields, r.status, r.isExempt, r.tax]).toEqual([[], 200, true, 0]);
  });

  it("다건 1건 = 단건 — 합가함 · 총세액 203,203,000(= 184,730,000 × 1.1)", async () => {
    expect(await runMulti({ ...PUR, ...MERGED })).toBe(203_203_000);
  });
});

describe("필수 2택 — ⑧·⑫가 같은 칸으로 막는다(⑧ 통과 ↔ ⑫ 400 모순 금지)", () => {
  it("미응답 → 합가 여부 칸", async () => {
    const r = await run({ ...PUR, ...SAME });
    expect([r.fields, r.status, r.zod]).toEqual([["buildingOwnerHouseholdMerged"], 400, ["buildingOwnerHouseholdMerged"]]);
  });

  it("합가함인데 합가일 없음 → 합가일 칸", async () => {
    const r = await run({ ...PUR, ...SAME, buildingOwnerHouseholdMerged: true });
    expect([r.fields, r.status, r.zod]).toEqual([["buildingOwnerHouseholdMergeDate"], 400, ["buildingOwnerHouseholdMergeDate"]]);
  });

  it("합가일이 양도일(2023-02-16) 이후 → 합가일 칸 · 양도일 당일은 통과", async () => {
    const after = await run({ ...PUR, ...SAME, buildingOwnerHouseholdMerged: true, buildingOwnerHouseholdMergeDate: "2023-02-17" });
    expect([after.fields, after.status, after.zod]).toEqual([["buildingOwnerHouseholdMergeDate"], 400, ["buildingOwnerHouseholdMergeDate"]]);
    const same = await run({ ...PUR, ...SAME, buildingOwnerHouseholdMerged: true, buildingOwnerHouseholdMergeDate: "2023-02-16" });
    expect([same.fields, same.status]).toEqual([[], 200]);
  });

  it("매매사례가액 취득도 미응답이면 ⑧이 막는다 — 그 분기는 분리 검증 전에 반환한다", async () => {
    const sc = { ...PUR, ...SAME, isSalesCaseAcquisition: true, similarSalesValue: "300,000,000" };
    const r = await run(sc);
    expect(r.fields).toContain("buildingOwnerHouseholdMerged");
    expect(r.zod).toContain("buildingOwnerHouseholdMerged");
  });

  it("함께 양도 자산(컴패니언) 토지만 본인 같은 세대 미응답도 ⑧·⑫가 막는다", async () => {
    const f = Object.assign(createDefaultTransferFormData(), {
      ...ONE_HOUSE, contractTotalPrice: "1700000000",
      assets: [
        { ...makeDefaultAsset(1), ...PUR, actualSalePrice: "500,000,000", acquisitionArea: "", transferArea: "" } as AssetForm,
        { ...makeDefaultAsset(2), ...PUR, ...SAME } as AssetForm,
      ],
    }) as TransferFormData;
    const r = await postTransfer((await captureBody(f)) as Loose);
    expect(allIssues(f).map((i) => i.field)).toContain("buildingOwnerHouseholdMerged");
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.json)).toContain("처음부터 같은 세대였는지");
  });
});

describe("함께 양도 자산(⑭ 컴패니언 매핑) — 합가일이 엔진에 닿는다", () => {
  it("함께 양도한 주택이 토지만 본인 · 합가함(2022-06-01) — 처음부터 같은 세대보다 총세액이 오른다(토지분 비과세 제외)", async () => {
    const f = (extra: Loose) =>
      Object.assign(createDefaultTransferFormData(), {
        ...ONE_HOUSE, contractTotalPrice: "1700000000",
        assets: [
          { ...makeDefaultAsset(1), ...PUR, assetKind: "land", actualSalePrice: "500,000,000", acquisitionArea: "", transferArea: "" } as AssetForm,
          { ...makeDefaultAsset(2), ...PUR, ...SAME, ...extra } as AssetForm,
        ],
      }) as TransferFormData;
    const total = async (extra: Loose) => {
      const r = await postTransfer((await captureBody(f(extra))) as Loose);
      expect(r.status).toBe(200);
      return (r.json as Loose).data?.aggregated?.totalTax as number;
    };
    const from = await total({ buildingOwnerHouseholdMerged: false });
    const merged = await total({ buildingOwnerHouseholdMerged: true, buildingOwnerHouseholdMergeDate: "2022-06-01" });
    expect(merged).toBeGreaterThan(from);
  });
});

describe("묻지 않는 경우 — 남은 합가 답은 전송하지 않고 세액을 바꾸지 않는다", () => {
  it.each([
    ["다른 세대", { selfOwns: "land_only", buildingOwnerSameHousehold: false }],
    ["건물만 본인", { selfOwns: "building_only" }],
    ["소유자 같음", { selfOwns: "both" }],
  ] as const)("%s", async (_n, B) => {
    const c = await run({ ...PUR, ...B });
    const r = await run({ ...PUR, ...B, buildingOwnerHouseholdMerged: true, buildingOwnerHouseholdMergeDate: "2022-06-01" });
    expect(r.body.buildingOwnerHouseholdMerged).toBeUndefined();
    expect(r.body.buildingOwnerHouseholdMergeDate).toBeUndefined();
    expect([r.fields, r.status, r.tax]).toEqual([c.fields, c.status, c.tax]);
  });
});
