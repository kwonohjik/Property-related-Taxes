/**
 * PR-14 anchor (2026-11 리뷰 D-39 · D-25 · I-02 최소안) — API 직접 호출에서만 닿는 판정 route ↔ 계산기 route 정합.
 *
 * D-39(결정 Q-7 (a)): 토지만 본인 × 건물 소유자 다른 세대 — 계산기는 과세인데 판정 route는 그 답을 버려 비과세였다 → 판정 파이프라인 단계 6.9가
 *   계산기 STEP 1과 같은 leaf(`applyLandOnlyHouseholdRule`)를 부른다. 같은 세대는 둘 다 비과세 + 합가일 확인.
 * D-25(결정 Q-4 A): 계산기 route는 판정 메뉴 전용 키(비거주자 · 잔금 전 멸실 특약)를 400으로 거절한다.
 */
import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { POST as judgePOST } from "@/app/api/calc/one-house-exemption/route";
import { POST as calcPOST } from "@/app/api/calc/transfer/route";
import { buildOneHouseExemptionApiBody } from "@/lib/calc/one-house-exemption-api";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { buildCaseForm } from "./one-house-rulings/harness";
import { mkCase } from "./_one-house-pr3a-judge-route";
import { handoff } from "./_one-house-pr6a-routes";
import { captureBody } from "./_one-house-pr3a-calc-route";
import { calculateTransferTax, type TransferTaxInput } from "@/lib/tax-engine/transfer-tax";
import { runOneHouseJudgmentPipeline } from "@/app/api/calc/one-house-exemption/judgment-pipeline";
import { parseRatesFromMap } from "@/lib/tax-engine/transfer-tax-helpers";
import { baseTransferInput, makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { LAND_ONLY_OTHER_HOUSEHOLD_UNMET_ID, LAND_ONLY_SAME_HOUSEHOLD_MERGE_ID } from "@/lib/tax-engine/one-house/land-only-verdict";

async function post(route: typeof judgePOST, url: string, body: Record<string, unknown>) {
  const res = await route(
    new NextRequest(`http://localhost${url}`, {
      method: "POST",
      headers: { "content-type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
      body: JSON.stringify(body),
    }),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, json: (await res.json()) as any };
}

// 지방(비조정) 주택 · 보유 7년 · 8억 — 일반 1주택이면 비과세
const f = buildCaseForm(mkCase("2025-05-01", {
  isOneHousehold: true, transferDate: "2025-06-01", contractTotalPrice: "800000000",
  asset: { assetKind: "housing", acquisitionDate: "2018-01-01", regionCode: "4182025021", addressJibun: "경기도 가평군 가평읍 읍내리 1", residenceInputMode: "direct", residencePeriods: [], residencePeriodMonthsAsset: "0" },
  houses: [],
}));

async function judge(over: Record<string, unknown>) {
  return post(judgePOST, "/api/calc/one-house-exemption", { ...(buildOneHouseExemptionApiBody(f) as Record<string, unknown>), ...over });
}
async function calc(over: Record<string, unknown>) {
  const t = handoff(f);
  const body = await captureBody({ ...t, assets: [{ ...t.assets[0], fixedAcquisitionPrice: "300000000" }, ...t.assets.slice(1)] } as never);
  return post(calcPOST, "/api/calc/transfer", { ...body, ...over });
}

describe("D-39 · I-02 격자 — 같은 TransferTaxInput을 계산기 엔진과 판정 파이프라인에(토지만 본인 × 건물 소유자 세대)", () => {
  const rates = makeMockRates();
  const D = (x: string) => new Date(x);
  /** 지방 8억 · 주택·토지 2014-09-01 별개 취득 · 거주 10년(`land-only-lthd-rate-basis.anchor`와 같은 모양) */
  const input = (over: Partial<TransferTaxInput>) =>
    baseTransferInput({
      propertyType: "housing", transferPrice: 800_000_000, acquisitionPrice: 400_000_000,
      landTransferPrice: 320_000_000, buildingTransferPrice: 480_000_000, landStandardPriceAtTransfer: 320_000_000, buildingStandardPriceAtTransfer: 480_000_000,
      landAcquisitionPrice: 100_000_000, buildingAcquisitionPrice: 300_000_000,
      acquisitionDate: D("2014-09-01"), landAcquisitionDate: D("2014-09-01"), transferDate: D("2024-06-01"),
      isSeparateAcquisition: true, landAcqMode: "actual", buildingAcqMode: "actual",
      residencePeriodMonths: 120, isOneHousehold: true, householdHousingCount: 1, expenses: 0, annualBasicDeductionUsed: 0,
      ...over,
    } as Partial<TransferTaxInput>);
  const pipeline = (i: TransferTaxInput) => runOneHouseJudgmentPipeline(i, parseRatesFromMap(rates), D("2024-06-01"), false).judgment;
  it.each([
    ["본인이 모두 소유(대조)", {}, true],
    ["토지만 본인 · 건물 소유자 같은 세대", { selfOwns: "land_only", buildingOwnerSameHousehold: true, buildingOwnerHouseholdMerged: false }, true],
    ["토지만 본인 · 건물 소유자 다른 세대", { selfOwns: "land_only", buildingOwnerSameHousehold: false }, false],
  ] as const)("%s — 계산기 = 판정 = 비과세 %s", (_n, over, exempt) => {
    const i = input(over as Partial<TransferTaxInput>);
    expect(calculateTransferTax(i, rates).isExempt).toBe(exempt);
    expect(pipeline(i).isExempt).toBe(exempt);
  });
  it("다른 세대는 사유 카드 · 같은 세대(합가 여부 미응답)는 합가일 확인", () => {
    const other = pipeline(input({ selfOwns: "land_only", buildingOwnerSameHousehold: false } as Partial<TransferTaxInput>));
    expect(other.unmetExceptions.map((u) => u.id)).toContain(LAND_ONLY_OTHER_HOUSEHOLD_UNMET_ID);
    const same = pipeline(input({ selfOwns: "land_only", buildingOwnerSameHousehold: true } as Partial<TransferTaxInput>));
    expect(same.undetermined.map((u) => u.id)).toContain(LAND_ONLY_SAME_HOUSEHOLD_MERGE_ID);
  });
});

describe("D-25 계산기 route — 판정 메뉴 전용 키 400", () => {
  it.each([
    ["transferorNonResidentAtTransfer", true],
    ["demolishedBeforeBalance", { contractDate: "2023-01-01" }],
  ] as const)("%s", async (key, value) => {
    const r = await calc({ [key]: value });
    expect(r.status).toBe(400);
    expect(Object.keys(r.json.error.fieldErrors)).toEqual([key]);
  });
  it("대조 — 판정 route는 같은 키를 받는다", async () => {
    expect((await judge({ transferorNonResidentAtTransfer: false })).status).toBe(200);
  });
});
