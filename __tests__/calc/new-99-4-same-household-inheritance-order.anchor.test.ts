/**
 * L8 NH-06 anchor — 동일세대 상속 일반주택의 「농어촌주택등 취득 전 보유」 순서 (조특법 §99의4①)
 *
 * 리뷰 `docs/reviews/new-housing-99-review-2026-11.md` NH-06 · 사용자 결정 Q-9 「일반주택 쪽만」.
 *
 * 법문·회신(KoreanLaw MCP 실독 2026-11-06):
 *  - 조특법 §99의4① 「…농어촌주택등을 취득하여 3년 이상 보유하고 그 농어촌주택등 취득 전에 보유하던 다른 주택(…"일반주택"…)을
 *    양도하는 경우에는 그 농어촌주택등을 해당 1세대의 소유주택이 아닌 것으로 보아…」 — 보유 주체는 **1세대**다.
 *  - 기준-2017-법령해석재산-0222(법령해석과-2945, 2017.10.20.) — 「농어촌주택 취득기간은 1세대를 기준으로 판단하는 것임
 *    (같은 세대원에게 증여한 경우 증여자의 취득시기를 기준으로 판단함)」.
 *
 * 고치는 것: 동일세대 상속(§154⑧3호)으로 받은 일반주택은 「상속개시일」이 아니라 **피상속인과 동일세대로 보유하기 시작한 날**을
 *   농어촌주택 취득일과 비교한다. 농어촌주택 쪽 취득일에는 세대 취득일을 적용하지 않는다(그 선언의 취득일 그대로).
 *
 * | # | 층 | 주장 |
 * |---|---|---|
 * | E-1 | 엔진 | 세대 보유 개시 2005 · 농어촌 2012 → 비과세 0 (종전 190,366,000) |
 * | E-2 | 엔진 | 경계 짝 — 개시일 = 농어촌 취득일 → 과세 / 하루 앞 → 비과세 |
 * | E-3 | 엔진 | 음성 짝 — 동일세대 아님 · 매매 취득 · 개시일이 농어촌 뒤 → 과세 |
 * | E-4 | 엔진 | 농어촌 행에는 세대 취득일을 적용하지 않는다 — 농어촌 취득이 상속개시일(2018) 뒤인 선언은 비과세 안 됨 |
 * | C-1 | 화면 ⑤ | 판정 메뉴 머리말 제외 행 집합(`eligibleCountExcludedHouseIds`)이 엔진과 같다 · 음성 짝 |
 * | M-1 | 판정 메뉴 route | ④ → route 결론이 엔진과 같다 · 음성 짝 |
 */
import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { calculateTransferTax } from "@/lib/tax-engine/transfer-tax";
import { resolveHceGeneralHouseAcquisitionDate } from "@/lib/tax-engine/transfer-tax-precalc";
import { eligibleCountExcludedHouseIds } from "@/lib/calc/house-count-exclusion-rows";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import {
  createInitialOneHouseJudgmentForm,
  type OneHouseJudgmentFormData,
} from "@/lib/stores/one-house-judgment-form.types";
import type { AssetForm, AssetReductionForm } from "@/lib/stores/calc-wizard-asset";
import { POST } from "@/app/api/calc/one-house-exemption/route";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";
import { RH_ANSWERED_NO } from "./_helpers/phrp-154-10-answer";
import type { TransferTaxInput } from "@/lib/tax-engine/transfer-tax";

const D = (s: string) => new Date(s);
const rates = makeMockRates();
const TAXED = 190_366_000;

// ── 엔진 ────────────────────────────────────────────────────────────
const rural = (acq: string) => ({
  type: "new_99_4_rural" as const,
  ruralHouseAcquisitionDate: D(acq),
  ruralHouseStdPrice: 150_000_000,
  isRegisteredHanok: false,
  adjacentArea994: "no" as const,
  meetsLocationRequirement: true,
  // 2021.1.1. 전 양도분 종전 면적 요건(대지 660㎡·주택 150㎡) — 요건을 갖춘 농어촌주택
  ruralLandAreaSqm994: 500,
  ruralHouseType994: "other" as const,
  ruralHouseAreaSqm994: 100,
});

const engineInput = (over: Partial<TransferTaxInput>) =>
  baseTransferInput({
    propertyType: "housing",
    transferPrice: 800_000_000,
    acquisitionPrice: 300_000_000,
    acquisitionCause: "inheritance",
    acquisitionDate: D("2018-09-01"),
    transferDate: D("2020-08-01"),
    isOneHousehold: true,
    householdHousingCount: 2,
    isRegulatedArea: false,
    residencePeriodMonths: 0,
    decedentSameHouseholdBeforeInheritance: true,
    ...over,
  });
const run = (over: Partial<TransferTaxInput>) => calculateTransferTax(engineInput(over), rates);

describe("E 엔진 — 동일세대 상속 일반주택의 보유 개시일로 농어촌주택 순서를 본다", () => {
  it("[E-0] 정본 함수 — 동일세대 상속이면 세대 보유 개시일 / 아니면 취득일", () => {
    const hh = { decedentCohabitationHoldingStartDate: D("2005-03-01") };
    expect(resolveHceGeneralHouseAcquisitionDate(engineInput(hh))).toEqual(D("2005-03-01"));
    expect(resolveHceGeneralHouseAcquisitionDate(engineInput({ ...hh, decedentSameHouseholdBeforeInheritance: false }))).toEqual(D("2018-09-01"));
    expect(resolveHceGeneralHouseAcquisitionDate(engineInput({ ...hh, acquisitionCause: "purchase" }))).toEqual(D("2018-09-01"));
    // 개시일이 상속개시일 이후면 엔진 정본이 버린다
    expect(resolveHceGeneralHouseAcquisitionDate(engineInput({ decedentCohabitationHoldingStartDate: D("2018-09-02") }))).toEqual(D("2018-09-01"));
  });

  it("[E-1] 세대 보유 개시 2005-03-01 · 농어촌 2012-05-01 → 취득 전 보유 → 비과세 0", () => {
    const r = run({ decedentCohabitationHoldingStartDate: D("2005-03-01"), reductions: [rural("2012-05-01")] });
    expect(r.isExempt).toBe(true);
    expect(r.totalTax).toBe(0);
    expect(r.new994Detail?.isEligible).toBe(true);
  });

  it("[E-2] 경계 — 개시일 = 농어촌 취득일 → 과세 190,366,000 / 하루 앞(2012-04-30) → 비과세 0", () => {
    const eq = run({ decedentCohabitationHoldingStartDate: D("2012-05-01"), reductions: [rural("2012-05-01")] });
    expect(eq.isExempt).toBe(false);
    expect(eq.totalTax).toBe(TAXED);
    const before = run({ decedentCohabitationHoldingStartDate: D("2012-04-30"), reductions: [rural("2012-05-01")] });
    expect(before.isExempt).toBe(true);
    expect(before.totalTax).toBe(0);
  });

  it("[E-3] 음성 짝 — 동일세대 아님 · 매매 취득 · 개시일이 농어촌 취득 뒤 → 과세 190,366,000", () => {
    const hh = { decedentCohabitationHoldingStartDate: D("2005-03-01"), reductions: [rural("2012-05-01")] };
    expect(run({ ...hh, decedentSameHouseholdBeforeInheritance: false }).totalTax).toBe(TAXED);
    expect(run({ ...hh, acquisitionCause: "purchase" }).totalTax).toBe(TAXED);
    expect(run({ ...hh, decedentCohabitationHoldingStartDate: D("2013-01-01") }).totalTax).toBe(TAXED);
  });

  it("[E-4] 농어촌 행에는 세대 취득일을 적용하지 않는다 — 농어촌 취득 2019-01-01(상속개시 뒤)이어도 일반주택이 먼저라 순서는 성립하고, 농어촌 취득일 자체는 선언 그대로", () => {
    // 순서: 세대 보유 2005 < 농어촌 2019 → 성립. 단 농어촌 쪽이 세대 취득일(2005)로 바뀌면 취득기간(2003.8.1.~) 안이라 구분이 안 되므로
    // 보유연수로 가른다 — 농어촌 취득 2019-01-01 → 양도 2020-08-01 = 1년(선언 날짜 그대로). 세대 취득일이면 15년이다.
    const r = run({ decedentCohabitationHoldingStartDate: D("2005-03-01"), reductions: [rural("2019-01-01")] });
    const d = r.new994Detail;
    expect(d?.isEligible).toBe(true);
    expect(d && d.isEligible ? d.ruralHoldingYears : undefined).toBe(1);
  });
});

// ── 화면 ⑤ · 판정 메뉴 ─────────────────────────────────────────────
const SAME_HOUSEHOLD: Partial<AssetForm> = {
  acquisitionDate: "2018-09-01",
  acquisitionCause: "inheritance",
  decedentAcquisitionDate: "2005-03-01",
  decedentSameHouseholdBeforeInheritance: true,
  decedentCohabitationHoldingStartDate: "2005-03-01",
  decedentCohabitationResidenceMonths: "0",
};

const asset = (over: Partial<AssetForm> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    rentalHousingException: RH_ANSWERED_NO,
    residenceInputMode: "direct",
    residencePeriods: [],
    assetKind: "housing",
    ...SAME_HOUSEHOLD,
    ...over,
  }) as AssetForm;

const RURAL_REDUCTION = {
  type: "new_99_4_rural",
  ruralHouseAcquisitionDate: "2012-05-01",
  ruralHouseStdPrice: "150000000",
  isRegisteredHanok: false,
  adjacentArea994: "no" as const,
  meetsLocationRequirement: true,
  ruralLandAreaSqm994: "500",
  ruralHouseType994: "other",
  ruralHouseAreaSqm994: "100",
} as AssetReductionForm;

const ruralRow = {
  id: "r",
  region: "non_capital",
  acquisitionDate: "2012-05-01",
  officialPrice: "150000000",
  isInherited: false,
  isLongTermRental: false,
  countExclusion: { kind: "reduction", reduction: RURAL_REDUCTION },
};

const jForm = (assetOver: Partial<AssetForm> = {}) =>
  ({
    ...createInitialOneHouseJudgmentForm(),
    assets: [asset(assetOver)],
    transferDate: "2020-08-01",
    contractTotalPrice: "800000000",
    isOneHousehold: true,
    isRegulatedArea: false,
    wasRegulatedAtAcquisition: false,
    houses: [ruralRow],
    presaleRights: [],
  }) as unknown as OneHouseJudgmentFormData;

async function judge(f: OneHouseJudgmentFormData) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/one-house-exemption", {
      method: "POST",
      headers: { "content-type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
      body: JSON.stringify(buildOneHouseExemptionApiBody(f)),
    }),
  );
  const json = await res.json();
  expect(res.status, JSON.stringify(json)).toBe(200);
  return json.data;
}

describe("C 화면 ⑤ — 제외 행 집합이 엔진과 같다", () => {
  it("[C-1] 동일세대 상속 · 보유 개시 2005 → 농어촌 행 제외 / 짝 — 동일세대 아님 · 개시일이 농어촌 뒤 → 제외 안 함", () => {
    expect([...eligibleCountExcludedHouseIds(jForm())]).toEqual(["r"]);
    expect([...eligibleCountExcludedHouseIds(jForm({ decedentSameHouseholdBeforeInheritance: false }))]).toEqual([]);
    expect([...eligibleCountExcludedHouseIds(jForm({ decedentCohabitationHoldingStartDate: "2013-01-01" }))]).toEqual([]);
  });
});

describe("M 판정 메뉴 — ④ → route", () => {
  it("[M-1] 동일세대 상속 · 농어촌 2012 → 2채 → 1채로 보아 비과세", async () => {
    const d = await judge(jForm());
    expect(d.houseCount.total).toBe(2);
    expect(d.houseCount.countedForExemption).toBe(1);
    expect(d.judgment.isExempt).toBe(true);
  });

  it("[M-1+] 짝 — 동일세대가 아니면(상속개시 2018 > 농어촌 2012) 2채 그대로 과세", async () => {
    const d = await judge(jForm({ decedentSameHouseholdBeforeInheritance: false, decedentCohabitationHoldingStartDate: "" }));
    expect(d.houseCount.countedForExemption).toBe(2);
    expect(d.judgment.isExempt).toBe(false);
  });
});
