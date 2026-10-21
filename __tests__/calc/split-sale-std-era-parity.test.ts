/**
 * 분리 계산 양도시 기준시가 V7 — 양도일 2016.1.1. 전 연혁 면제 ⑧≡⑫ 격자 (2026-10-21)
 *
 * 계획서: docs/00-pm/split-v7-era-and-legacy-expense.plan.md §1 · §4-1
 *
 * ⑧(`transfer-tax-validate-split-sale-std.ts` `saleStdPriceWaivedByEra`)은 «양도일 2016.1.1. 전 ∧ 구분 기재 ∧ 환산 파트 없음»이면
 * 양도시 기준시가 두 칸을 요구하지 않는데, ⑫ V7(`transfer-tax-schema-required-refines-2a.ts`)은 연혁을 보지 않아 400이었다.
 * 이월과세 C뿐 아니라 일반 분리취득·신축+토지 상속도 같았다(계획서 §1.1).
 *
 * 불변식 (A) ⑧ 통과 ⇒ ⑫ 200 · (B) ⑧ 차단 ⇔ ⑫ 400 · (C) 면제 구간에서 기준시가 값은 세액을 바꾸지 않는다.
 * 증여자 환산 파트(P6)의 «면제하지 않음»은 P6 격자(`_helpers/split-carryover-p6-grid.ts` 연혁 면제 경계 셀)가 지킨다.
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
import { POST as POST_MULTI } from "@/app/api/calc/transfer/multi/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { buildPropertyPayload } from "@/lib/calc/multi-transfer-tax-api";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { bodyOf, routeOf, issuesOf, cAsset, cForm } from "./_helpers/split-carryover-c-form";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
});

const EARLY = "2015-12-31";
const BOUNDARY = "2016-01-01";
const NO_STD = { landStandardPriceAtTransfer: "", buildingStandardPriceAtTransfer: "" };

/** 일반 분리취득 — 토지 2003 · 건물 2005 매매 · 양쪽 실가 · 구분 기재 */
const general = (over: Record<string, unknown> = {}) =>
  ({
    ...makeDefaultAsset(1),
    addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2005-06-01",
    landAcquisitionDate: "2003-06-01",
    hasSeperateLandAcquisitionDate: true,
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    landAcquisitionPrice: "300,000,000",
    buildingAcquisitionPrice: "250,000,000",
    saleSplitMode: "actual",
    landTransferPrice: "1,200,000,000",
    buildingTransferPrice: "300,000,000",
    actualSalePrice: "1,500,000,000",
    ...NO_STD,
    ...over,
  }) as unknown as AssetForm;

/** 신축 + 토지 상속(D1) */
const newConstruction = (over: Record<string, unknown> = {}) =>
  general({
    acquisitionCause: "newConstruction",
    occupancyApprovalDate: "2005-06-01",
    fixedAcquisitionPrice: "250,000,000",
    buildingAcquisitionPrice: "",
    landAcquisitionCause: "inheritance",
    landCauseHost: "newConstruction",
    landDecedentAcquisitionDate: "1990-04-01",
    ...over,
  });

/** 이월과세 C — 증여 2012 · 건물 증여자 2010 · 토지 증여자 1995 */
const carryoverC = (over: Record<string, unknown> = {}) => {
  const seed = cAsset() as unknown as { carryover: Record<string, unknown> };
  return cAsset({ carryover: { ...seed.carryover, giftRegistryDate: "2012-03-01", donorAcquisitionDate: "2010-06-01" }, ...NO_STD, ...over });
};

type Shape = { name: string; make: (over?: Record<string, unknown>) => AssetForm; sale: string; multi: boolean; companion: boolean };
const SHAPES: Shape[] = [
  // 함께 양도 두 번째 자산의 매매 분리취득은 연혁과 무관하게 ⑫가 화면에 없는 `fixedAcquisitionPrice`를 요구해 400이다(별건 — 계획서 §6).
  // 그 결함이 이 격자의 연혁 셀을 가리지 않도록 함께 양도 셀은 신축 + 토지 상속 형태로만 본다.
  { name: "일반 분리취득", make: general, sale: "1500000000", multi: true, companion: false },
  { name: "신축 + 토지 상속", make: newConstruction, sale: "1500000000", multi: true, companion: true },
  // 파트 이월과세는 첫 자산 전용·다건 미지원(P1~P6 설계) — 단건만
  { name: "이월과세 C", make: carryoverC, sale: "1200000000", multi: false, companion: false },
];

const form = (s: Shape, transferDate: string, over: Record<string, unknown> = {}): TransferFormData =>
  cForm({ transferDate, filingDate: `${transferDate.slice(0, 4)}-${transferDate.endsWith("12-31") ? "12-31" : "02-28"}`, contractTotalPrice: s.sale }, s.make(over));

async function single(f: TransferFormData) {
  return routeOf(POST, await bodyOf(f));
}

async function multi(f: TransferFormData) {
  const payload = buildPropertyPayload(f as never) as Record<string, unknown>;
  const res = await POST_MULTI(
    new NextRequest("http://localhost/api/calc/transfer/multi", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        taxYear: Number(f.transferDate.slice(0, 4)),
        properties: [{ propertyId: "p1", propertyLabel: "p1", ...JSON.parse(JSON.stringify(payload)) }],
        annualBasicDeductionUsed: 0,
      }),
    }),
  );
  return res.status;
}

/** 함께 양도 — 분리 계산 자산을 두 번째(컴패니언)로 둔다 */
function withCompanionFirst(s: Shape, transferDate: string, over: Record<string, unknown> = {}): TransferFormData {
  const first = {
    ...makeDefaultAsset(1),
    addressJibun: "서울 강남구 테스트동 2-2",
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2010-03-02",
    fixedAcquisitionPrice: "300,000,000",
    actualSalePrice: "400,000,000",
  } as unknown as AssetForm;
  const second = { ...s.make(over), assetId: "a2" } as AssetForm;
  return cForm(
    {
      transferDate,
      filingDate: `${transferDate.slice(0, 4)}-${transferDate.endsWith("12-31") ? "12-31" : "02-28"}`,
      assets: [first, second],
      contractTotalPrice: String(Number(s.sale) + 400_000_000),
      bundledSaleMode: "actual",
    } as Partial<TransferFormData>,
  );
}

const stdIssue = (f: TransferFormData) =>
  issuesOf(f).filter((i) => /양도시 기준시가/.test(i.message ?? "") || /StandardPrice.*AtTransfer|standardPricePerSqmAtTransfer|transferArea/.test(i.field ?? ""));

describe.each(SHAPES)("$name", (s) => {
  it(`면제 — 양도일 ${EARLY} · 구분 기재 · 실가: ⑧ 통과 ⇒ ⑫ 200, 세액은 기준시가를 넣은 것과 같다`, async () => {
    const f = form(s, EARLY);
    expect(issuesOf(f)).toEqual([]);
    const r = await single(f);
    expect(r.status, JSON.stringify(r.fieldErrors)).toBe(200);
    const withStd = await single(form(s, EARLY, { landStandardPriceAtTransfer: "100,000,000", buildingStandardPriceAtTransfer: "1,400,000,000" }));
    expect(withStd.status).toBe(200);
    expect(r.json.data.result.determinedTax).toBe(withStd.json.data.result.determinedTax);
  });

  it(`경계 — 양도일 ${BOUNDARY}: ⑧ 차단 ⇔ ⑫ 400 (§100③ 30% 판정의 비교 기준)`, async () => {
    const f = form(s, BOUNDARY);
    expect(stdIssue(f).length).toBeGreaterThan(0);
    const r = await single(f);
    expect(r.status).toBe(400);
    expect(Object.keys(r.fieldErrors)).toEqual(expect.arrayContaining(["landStandardPriceAtTransfer"]));
  });

  it("일괄양도(안분)면 면제하지 않는다 — ⑧ 차단 ⇔ ⑫ 400", async () => {
    const f = form(s, EARLY, { saleSplitMode: "apportioned", landTransferPrice: "", buildingTransferPrice: "" });
    expect(stdIssue(f).length).toBeGreaterThan(0);
    expect((await single(f)).status).toBe(400);
  });

  if (s.multi) {
    it("다건 — 같은 폼이 multi route에서도 면제(200) · 경계는 400", async () => {
      expect(await multi(form(s, EARLY))).toBe(200);
      expect(await multi(form(s, BOUNDARY))).toBe(400);
    });
  }

  if (s.companion) {
    it("함께 양도 두 번째 자산 — ⑧ 통과 ⇒ ⑫ 200 · 경계는 ⑧ 차단 ⇔ ⑫ 400", async () => {
      const early = withCompanionFirst(s, EARLY);
      expect(issuesOf(early)).toEqual([]);
      const r = await single(early);
      expect(r.status, JSON.stringify(r.fieldErrors)).toBe(200);
      const boundary = withCompanionFirst(s, BOUNDARY);
      expect(stdIssue(boundary).length).toBeGreaterThan(0);
      const rb = await single(boundary);
      expect(rb.status).toBe(400);
      expect(Object.keys(rb.fieldErrors).some((k) => k.startsWith("companionAssets.0.") && k.includes("StandardPriceAtTransfer"))).toBe(true);
    });
  }
});

describe("이월과세 C — 증여자 환산 파트가 있으면 면제하지 않는다 (상대 파트 기준시가도 V7이 요구)", () => {
  // P6 격자의 연혁 셀은 환산 파트 **자신의** 기준시가만 비운다 — 그 칸은 이월과세 refine(`refineSplitCarryoverValues`)이 따로 요구한다.
  // V7의 증여자 환산 보정이 지키는 것은 **상대 파트** 칸이다(⑧ `partDonorEstimated` 보정과 같은 뜻).
  const est = { partEstimated: true, donorAcquisitionPrice: "", donorStandardPriceAtAcquisition: "30,000,000" };
  const seed = carryoverC() as unknown as { carryover: Record<string, unknown>; landCarryover: Record<string, unknown> };
  const cells = [
    { part: "토지", over: { landCarryover: { ...seed.landCarryover, ...est }, landStandardPriceAtTransfer: "700,000,000" }, blank: "buildingStandardPriceAtTransfer" },
    { part: "건물", over: { carryover: { ...seed.carryover, ...est }, buildingStandardPriceAtTransfer: "500,000,000" }, blank: "landStandardPriceAtTransfer" },
  ] as const;
  for (const c of cells) {
    it(`${c.part} 증여자 환산 · 양도일 ${EARLY} · 상대 파트 기준시가 비움: ⑧ 차단 ⇔ ⑫ 400`, async () => {
      const f = form(SHAPES[2], EARLY, c.over);
      expect(stdIssue(f).length, JSON.stringify(issuesOf(f))).toBeGreaterThan(0);
      const r = await single(f);
      expect(r.status).toBe(400);
      expect(Object.keys(r.fieldErrors)).toContain(c.blank);
    });
  }
});

describe("환산 파트가 있으면 면제하지 않는다 (환산취득가액의 분모)", () => {
  it(`일반 분리취득 · 토지 환산 · 양도일 ${EARLY}: ⑧ 차단 ⇔ ⑫ 400`, async () => {
    const f = form(SHAPES[0], EARLY, {
      landAcqMode: "estimated",
      landAcquisitionPrice: "",
      standardPricePerSqmAtAcq: "500,000",
      acquisitionArea: "200",
    });
    expect(stdIssue(f).length).toBeGreaterThan(0);
    const r = await single(f);
    expect(r.status).toBe(400);
    expect(Object.keys(r.fieldErrors)).toEqual(expect.arrayContaining(["landStandardPriceAtTransfer"]));
  });
});
