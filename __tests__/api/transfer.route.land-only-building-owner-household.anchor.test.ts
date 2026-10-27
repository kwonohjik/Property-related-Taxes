/**
 * V-3′ — 토지만 본인 주택 × 건물(주택) 소유자 세대(예·아니오).
 * 계획서 `docs/02-design/features/carryover-phd-owner-split-residuals.plan.md` §3.2·§3.3 Q-2 a · §8.
 *
 * 수정 전: 소유자 분리에서 건물 소유자의 세대를 묻지 않아 토지만 본인 + 1세대1주택이면 그 토지에 무조건 비과세가 났다.
 * 서면4팀-311·재일46014-1793(서면4팀-2512 본문 유사사례)·조심 2008중3554(기각) — 주택 소유자와 세대를 달리하는 사람의 부수토지는
 * 1세대1주택 부속토지로 보지 않고 과세된다(영 §154① 「양도일 현재」).
 *
 * 기대값은 독립 정수 산식이다(엔진 출력 복사 아님) — 매매 3억 · 양도 12억 · 기준시가 토지 40% (양도·취득 모두)
 *   토지 양도가액 480,000,000 − 토지 취득가액 120,000,000 = 양도차익 360,000,000
 *   장특 표1 8년(2015-01-01 → 2023-02-16) 16% = 57,600,000 → 소득금액 302,400,000 − 기본공제 2,500,000 = 299,900,000
 *   산출세액 37,060,000 + (299,900,000 − 150,000,000) × 38% = 94,022,000
 */
import { describe, expect, it, vi } from "vitest";

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
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { asksBuildingOwnerHousehold } from "@/lib/calc/self-owns-scope";
import { landOnlyHouseholdIssue } from "@/lib/api/transfer-tax-schema-household-refines";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const STD = {
  acquisitionArea: "100", transferArea: "100", standardPricePerSqmAtTransfer: "5600000", buildingStandardPriceAtTransfer: "840000000",
  standardPricePerSqmAtAcq: "2400000", standardPriceAtAcq: "480000000", buildingStandardPriceAtAcq: "360000000", standardPriceAtTransfer: "1400000000",
};
/** 1세대1주택 · 보유 8년 · 취득 당시 조정대상지역 지정 전(2015) — 거주요건 없음 */
const ONE_HOUSE = {
  transferDate: "2023-02-16", filingDate: "2023-04-30", totalTransferExpense: "0", householdHousingCount: "1", isOneHousehold: true,
  householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true,
};
const PUR: Loose = {
  addressJibun: "서울 강남구 테스트동 1-1", assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2015-01-01",
  actualSalePrice: "1,200,000,000", fixedAcquisitionPrice: "300,000,000", residenceInputMode: "direct", residencePeriods: [], ...STD,
};
const TAXED = 94_022_000;
const NOTICE = "건물(주택) 소유자가 양도일 현재 본인과 다른 세대";

const form = (a: Loose, hh: Loose = ONE_HOUSE): TransferFormData =>
  Object.assign(createDefaultTransferFormData(), {
    ...hh, contractTotalPrice: String(a.actualSalePrice).replace(/,/g, ""), assets: [{ ...makeDefaultAsset(1), ...a } as AssetForm],
  }) as TransferFormData;

async function run(a: Loose, hh: Loose = ONE_HOUSE) {
  const f = form(a, hh);
  const body = (await captureBody(f)) as Loose;
  const r = await postTransfer(body);
  const result = r.result as Loose | undefined;
  return {
    fields: allIssues(f).map((i) => i.field),
    status: r.status,
    tax: result?.calculatedTax as number | undefined,
    isExempt: result?.isExempt as boolean | undefined,
    landRate: result?.splitDetail?.land.longTermRate as number | undefined,
    notice: ((result?.warnings ?? []) as string[]).some((w) => w.includes(NOTICE)),
    zod: Object.keys((r.json as Loose)?.error?.fieldErrors ?? {}),
    body,
  };
}

describe("토지만 본인 × 1세대1주택 — 건물(주택) 소유자 세대", () => {
  it("예(같은 세대) → 종전과 같다: 12억 이하 1세대1주택 비과세 · 고지 없음", async () => {
    const r = await run({ ...PUR, selfOwns: "land_only", buildingOwnerSameHousehold: true });
    expect([r.fields, r.status, r.isExempt, r.tax, r.notice]).toEqual([[], 200, true, 0, false]);
    expect(r.body.buildingOwnerSameHousehold).toBe(true);
  });

  it("아니오(다른 세대) → 토지 전액 과세 · 장특 표1 16% · 고지 (1세대1주택이 아닌 세대와 같은 세액)", async () => {
    const r = await run({ ...PUR, selfOwns: "land_only", buildingOwnerSameHousehold: false });
    expect([r.fields, r.status, r.isExempt, r.tax, r.landRate, r.notice]).toEqual([[], 200, false, TAXED, 0.16, true]);
    expect(r.body.buildingOwnerSameHousehold).toBe(false);
    const control = await run({ ...PUR, selfOwns: "land_only", buildingOwnerSameHousehold: false }, { ...ONE_HOUSE, householdHousingCount: "0", isOneHousehold: false });
    expect(control.tax).toBe(TAXED);
  });

  it("미응답 → ⑧·⑫가 같은 칸으로 막는다(모름 칸 없음 — Q-2 a)", async () => {
    const r = await run({ ...PUR, selfOwns: "land_only" });
    expect([r.fields, r.status, r.zod]).toEqual([["buildingOwnerSameHousehold"], 400, ["buildingOwnerSameHousehold"]]);
  });

  it("매매사례가액 취득도 미응답이면 ⑧이 막는다 — 그 분기는 분리 검증 전에 반환한다(리뷰 게이트 F-2 · 수정 전 ⑧ 통과 ↔ ⑫ 400)", async () => {
    const sc = { ...PUR, isSalesCaseAcquisition: true, similarSalesValue: "300,000,000", selfOwns: "land_only" };
    const r = await run(sc);
    expect(r.fields).toContain("buildingOwnerSameHousehold");
    expect(r.zod).toContain("buildingOwnerSameHousehold");
    const answered = await run({ ...sc, buildingOwnerSameHousehold: true });
    expect(answered.fields).not.toContain("buildingOwnerSameHousehold");
  });
});

describe("묻지 않는 자산 — 칸 없음 · 전송 안 함 · 세액 불변", () => {
  it.each([
    ["건물만 본인", { ...PUR, selfOwns: "building_only" }],
    ["소유자 같음", { ...PUR, selfOwns: "both" }],
    ["건물(비주택) 토지만 본인", { ...PUR, assetKind: "building", selfOwns: "land_only" }],
  ] as const)("%s — 남은 「아니오」가 세액을 바꾸지 않는다", async (_n, B) => {
    const a = { ...makeDefaultAsset(1), ...B, buildingOwnerSameHousehold: false } as AssetForm;
    expect(asksBuildingOwnerHousehold(a)).toBe(false);
    const c = await run(B);
    const r = await run({ ...B, buildingOwnerSameHousehold: false });
    expect(r.body.buildingOwnerSameHousehold).toBeUndefined();
    expect([r.fields, r.status, r.tax]).toEqual([c.fields, c.status, c.tax]);
  });

  it("겸용주택은 소유자 분리 축 밖 — 남은 토지만 본인·「아니오」를 보지 않는다", () => {
    const a = { ...makeDefaultAsset(1), ...PUR, isMixedUseHouse: true, selfOwns: "land_only", buildingOwnerSameHousehold: false } as AssetForm;
    expect(asksBuildingOwnerHousehold(a)).toBe(false);
  });
});

describe("⑧↔⑫ 격자 — 같은 술어", () => {
  it.each([
    ["housing", "land_only", undefined, true],
    ["housing", "land_only", true, false],
    ["housing", "land_only", false, false],
    ["housing", "building_only", undefined, false],
    ["housing", "both", undefined, false],
    ["building", "land_only", undefined, false],
  ] as const)("%s · %s · %s → 차단 %s", (kind, owns, ans, blocked) => {
    const a = { ...makeDefaultAsset(1), ...PUR, assetKind: kind, selfOwns: owns, buildingOwnerSameHousehold: ans } as AssetForm;
    expect(asksBuildingOwnerHousehold(a) && a.buildingOwnerSameHousehold === undefined).toBe(blocked);
    expect(landOnlyHouseholdIssue({ propertyType: kind, selfOwns: owns, buildingOwnerSameHousehold: ans }) !== null).toBe(blocked);
  });

  it("함께 양도 자산(컴패니언) 토지만 본인 미응답도 ⑧·⑫가 막는다", async () => {
    const f = Object.assign(createDefaultTransferFormData(), {
      ...ONE_HOUSE, contractTotalPrice: "1700000000",
      assets: [
        { ...makeDefaultAsset(1), ...PUR, actualSalePrice: "500,000,000", acquisitionArea: "", transferArea: "" } as AssetForm,
        { ...makeDefaultAsset(2), ...PUR, selfOwns: "land_only" } as AssetForm,
      ],
    }) as TransferFormData;
    const r = await postTransfer((await captureBody(f)) as Loose);
    expect(allIssues(f).map((i) => i.field)).toContain("buildingOwnerSameHousehold");
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.json)).toContain("같은 세대인지 선택");
  });
});

describe("다건(⑭ multi route)·함께 양도 자산(⑭ 컴패니언 매핑)도 답이 엔진에 닿는다", () => {
  /** 다건 본문 — 8억 1세대1주택 · 토지만 본인(기준시가 토지 3억 : 건물 1억). 같은 세대면 전액 비과세. */
  const multiBody = (same: boolean) => ({
    taxYear: 2024,
    annualBasicDeductionUsed: 0,
    properties: [
      {
        propertyId: "p1", propertyLabel: "p1", propertyType: "housing", transferPrice: 800_000_000, transferDate: "2024-03-01",
        acquisitionPrice: 300_000_000, acquisitionDate: "2003-01-15", expenses: 0, useEstimatedAcquisition: false,
        householdHousingCount: 1, isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false,
        isNonBusinessLand: false, isOneHousehold: true, residencePeriodMonths: 0, annualBasicDeductionUsed: 0,
        selfOwns: "land_only", buildingOwnerSameHousehold: same, landAcquisitionDate: "2003-01-15",
        standardPricePerSqmAtAcquisition: 100_000, acquisitionArea: 1000, standardPriceAtAcquisition: 200_000_000,
        buildingStandardPriceAtAcquisition: 100_000_000, landStandardPriceAtTransfer: 300_000_000, buildingStandardPriceAtTransfer: 100_000_000,
      },
    ],
  });
  async function postMulti(body: unknown) {
    const { POST } = await import("@/app/api/calc/transfer/multi/route");
    const { NextRequest } = await import("next/server");
    const res = await POST(new NextRequest("http://localhost/api/calc/transfer/multi", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
    return { status: res.status, json: (await res.json()) as Loose };
  }

  it("다건 — 같은 세대면 결정세액 0 · 다른 세대면 비과세가 아니고 고지가 붙는다", async () => {
    const same = await postMulti(multiBody(true));
    const other = await postMulti(multiBody(false));
    expect([same.status, other.status]).toEqual([200, 200]);
    expect(same.json.data.determinedTax ?? same.json.data.totalTax).toBe(0);
    expect(other.json.data.properties?.[0]?.isExempt ?? false).toBe(false);
    expect(JSON.stringify(other.json)).toContain(NOTICE);
  });

  it("컴패니언 — 함께 양도한 주택이 토지만 본인 · 다른 세대면 그 자산 고지가 붙고 총세액이 오른다", async () => {
    const f = (same: boolean) =>
      Object.assign(createDefaultTransferFormData(), {
        ...ONE_HOUSE, contractTotalPrice: "1700000000",
        assets: [
          { ...makeDefaultAsset(1), ...PUR, assetKind: "land", actualSalePrice: "500,000,000", acquisitionArea: "", transferArea: "" } as AssetForm,
          { ...makeDefaultAsset(2), ...PUR, selfOwns: "land_only", buildingOwnerSameHousehold: same } as AssetForm,
        ],
      }) as TransferFormData;
    const same = await postTransfer((await captureBody(f(true))) as Loose);
    const other = await postTransfer((await captureBody(f(false))) as Loose);
    expect([same.status, other.status]).toEqual([200, 200]);
    expect(JSON.stringify(same.json)).not.toContain(NOTICE);
    expect(JSON.stringify(other.json)).toContain(NOTICE);
  });
});
