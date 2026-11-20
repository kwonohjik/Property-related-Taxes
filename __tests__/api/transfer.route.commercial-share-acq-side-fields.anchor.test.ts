/**
 * 상가(상업용 건물 · 오피스텔) 축 B 지분 카드 — 취득 쪽 칸은 지분 값, 물건 단위 칸은 자산 1 값.
 * 계획서 docs/00-pm/commercial-share-acq-side-fields.plan.md · 사용자 결정 2026-11-16 「취득 쪽 지분 값 + 양도 쪽 숨김」.
 *
 * 종전(2026-09-03 개방): 상가 하위 칸 16개를 통째로 자산 1 값으로 병합했다. 지분마다 취득일이 다른데 취득 쪽 칸도 덮여
 * - 매매 지분 × 환산: 지분 카드의 「취득시 ㎡당 호별고시가」가 무시되고 자산 1 값으로 계산(CS-2 198,320,000 — 정답 97,480,000)
 * - 상속 지분 × §164⑥(§163⑨ 단서 2호): 지분 카드에 넣은 칸을 ⑧이 「누락」으로 막았다(CS-1 — 화면에서 ② 도달 불가)
 * 화면 경로(⑧ · ④ 본문 · ⑫ · ⑭)로 계산한다. 세율은 mock — 양도차익으로 본다.
 */
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import { allIssues, captureBody } from "../calc/_one-house-pr3a-calc-route";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type AssetForm, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { rosterForDeclaredCount } from "@/__tests__/calc/_helpers/roster-for-declared-count";
import { mergePrimaryBasic } from "@/lib/calc/transfer-tax-api-helpers";
import { CB_SHARE_OBJECT_FIELDS } from "@/lib/calc/commercial-share-object-fields";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);
type A = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const AREA: A = { cbExclusiveArea: "50", cbSharedArea: "20", cbLandArea: "100" };
const mk = (n: number, ...o: A[]) => Object.assign({ ...makeDefaultAsset(n) }, ...o) as AssetForm;
const form = (assets: AssetForm[], over: A = {}) =>
  rosterForDeclaredCount(rosterForDeclaredCount(Object.assign(createDefaultTransferFormData(), {
    transferDate: "2023-02-16", filingDate: "2023-04-30", totalTransferExpense: "0", householdHousingCount: "0", isOneHousehold: false,
    householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, assets, contractTotalPrice: "1000000000", ...over,
  }))) as TransferFormData;
const AB = { assetSplitMode: "fractional" };
async function post(f: TransferFormData) {
  const body = await captureBody(f);
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(body),
  }));
  const j = (await res.json()) as A;
  return { status: res.status, err: JSON.stringify(j.error ?? null), gain: j.data?.aggregated?.properties?.map((p: A) => p.transferGain) ?? j.data?.result?.transferGain };
}
async function gains(f: TransferFormData) {
  expect(allIssues(f)).toEqual([]);
  const r = await post(f);
  expect(r.status, r.err).toBe(200);
  return r.gain;
}

/** §164⑥ 취득 쪽 5칸(+ §164⑤ 준용 확인) — 화면에서는 지분 카드 ③ 「§164⑥ 취득당시 기준시가」 섹션에 뜬다 */
const SEC164_6: A = { cbUnitPriceAtFirstOrAcq: "10000000", cbLandPricePerSqmAtAcq: "500000", cbLandPricePerSqmAtFirst: "700000", cbBuildingStdPriceAtAcq: "30000000", cbBuildingStdPriceAtFirst: "40000000", cbAcqBuildingStdBy164_5: true };
const INH2003: A = { acquisitionCause: "inheritance", acquisitionDate: "2003-06-01", inheritanceStartDate: "2003-06-01", decedentAcquisitionDate: "1990-01-01", publishedValueAtInheritance: "100000000" };
const primaryRegular = mk(1, { assetId: "p", addressJibun: "서울 강남구 테스트동 1-1", assetKind: "commercial_building", standardPriceAtTransfer: "400000000", standardPriceAtAcq: "200000000",
  acquisitionCause: "purchase", acquisitionDate: "2015-01-01", actualSalePrice: "1000000000", fixedAcquisitionPrice: "100000000", ownershipNumerator: "60", ownershipDenominator: "100", ...AREA });
const inhShare = (...o: A[]) => mk(2, { assetId: "s", ownershipNumerator: "40", ownershipDenominator: "100", ...INH2003 }, ...o);

describe("CS-1 상속 지분 × §164⑥ — 지분 카드 칸이 ② (0.4 × (10억 − max(1억, 509,090,909)))", () => {
  it("단건 오라클(같은 사실 물건 전체) 490,909,091", async () => {
    const single = mk(1, { assetId: "x", addressJibun: "서울 강남구 테스트동 1-1", assetKind: "commercial_building", standardPriceAtTransfer: "400000000", standardPriceAtAcq: "200000000", actualSalePrice: "1000000000", ...INH2003, ...AREA, ...SEC164_6 });
    expect(await gains(form([single]))).toBe(490_909_091);
  });
  it("지분 카드에 넣은 칸 — ⑧ 0 · 지분 2 = 196,363,637", async () => {
    expect(await gains(form([primaryRegular, inhShare(SEC164_6)], AB))).toEqual([540_000_000, 196_363_637]);
  });
  it("칸을 비우면 평가액만 — 0.4 × 9억 = 360,000,000", async () => {
    expect(await gains(form([primaryRegular, inhShare()], AB))).toEqual([540_000_000, 360_000_000]);
  });
  it("값이 자산 1에만 있으면(화면에서 지분 칸이 아닌 곳) 쓰지 않는다 — ⑧이 지분 카드 칸을 짚는다", () => {
    const issues = allIssues(form([mk(1, primaryRegular, SEC164_6, { cbLandPricePerSqmAtAcq: "" }), inhShare({ cbLandPricePerSqmAtAcq: "500000" })], AB));
    expect(issues.some((i) => i.includes(":cbUnitPriceAtFirstOrAcq:자산 2:"))).toBe(true);
  });
});

describe("CS-2 매매 지분 × 환산 — 지분 취득일의 「취득시 ㎡당 호별고시가」", () => {
  const EST: A = { assetKind: "commercial_building", ...AREA, cbTotalLandArea: "1000", cbTotalBuildingFootprintArea: "800", cbZoneType: "general_residential",
    cbUnitPriceAtTransfer: "4000000", cbLandPricePerSqmAtTransfer: "3000000", useEstimatedAcquisition: true };
  const p = mk(1, { assetId: "p", addressJibun: "서울 강남구 테스트동 1-1", acquisitionCause: "purchase", acquisitionDate: "2015-01-01", actualSalePrice: "1000000000",
    ownershipNumerator: "60", ownershipDenominator: "100", ...EST, cbUnitPriceAtFirstOrAcq: "2000000", cbLandPricePerSqmAtAcq: "1500000" });
  const share = (unit: string) => mk(2, { assetId: "s", ownershipNumerator: "40", ownershipDenominator: "100", acquisitionCause: "purchase", acquisitionDate: "2019-01-01",
    useEstimatedAcquisition: true, cbUnitPriceAtFirstOrAcq: unit, cbLandPricePerSqmAtAcq: "1500000" });
  it("단건 오라클 — 2019 취득 · 3.0M 243,700,000 / 2.0M 495,800,000", async () => {
    const single = (u: string) => mk(1, { assetId: "x", addressJibun: "서울 강남구 테스트동 1-1", acquisitionCause: "purchase", acquisitionDate: "2019-01-01", actualSalePrice: "1000000000", ...EST, cbUnitPriceAtFirstOrAcq: u, cbLandPricePerSqmAtAcq: "1500000" });
    expect(await gains(form([single("3000000")]))).toBe(243_700_000);
    expect(await gains(form([single("2000000")]))).toBe(495_800_000);
  });
  it("지분 3.0M — 0.4 × 243,700,000 = 97,480,000 (종전 자산 1 값 2.0M으로 198,320,000)", async () => {
    expect(await gains(form([p, share("3000000")], AB))).toEqual([297_480_000, 97_480_000]);
  });
  it("지분 칸을 비우면 ⑧이 지분 카드 칸을 짚는다 — 자산 1 값으로 대신하지 않는다", () => {
    const issues = allIssues(form([p, share("")], AB));
    expect(issues.some((i) => i.includes(":cbUnitPriceAtFirstOrAcq:자산 2:")), JSON.stringify(issues)).toBe(true);
  });
  it("지분 2.0M — 198,320,000 (자산 1과 같은 값이면 종전과 같다)", async () => {
    expect(await gains(form([p, share("2000000")], AB))).toEqual([297_480_000, 198_320_000]);
  });
});

describe("CS-3 병합 규칙 — 물건 단위 12칸만 자산 1 값", () => {
  it("물건 단위 칸 목록", () => {
    expect([...CB_SHARE_OBJECT_FIELDS]).toEqual([
      "cbTotalLandArea", "cbTotalBuildingFootprintArea", "cbZoneType", "cbUnapprovedBuilding", "cbLandArea", "cbExclusiveArea", "cbSharedArea",
      "cbUnitPriceAtTransfer", "cbLandPricePerSqmAtTransfer", "cbBuildingStdPriceAtTransfer",
      // NBL2611-V5-BX01 — 초과분 토지·건물 구분 기준시가의 양도 당시 2칸(취득 당시 2칸은 지분마다 달라 카드별 입력)
      "cbPartTransferLandStd", "cbPartTransferBuildingStd",
    ]);
  });
  it("취득 쪽 칸(§164⑧ 준용 포함)은 지분 값 · 물건 단위 칸은 자산 1 값", () => {
    const p = mk(1, { assetKind: "commercial_building", cbZoneType: "commercial", cbUnitPriceAtTransfer: "4000000", cbUnitPriceAtFirstOrAcq: "1", cbBuildingStdPriceAtAcq: "1", cbBuildingStdPriceAtFirst: "1", cbLandPricePerSqmAtFirst: "1", cbPrevStdPriceSum: "1", cbStdPriceAdjustMonths: "1" });
    const s = mk(2, { cbZoneType: "", cbUnitPriceAtTransfer: "9", cbUnitPriceAtFirstOrAcq: "2", cbBuildingStdPriceAtAcq: "2", cbBuildingStdPriceAtFirst: "2", cbLandPricePerSqmAtFirst: "2", cbPrevStdPriceSum: "2", cbStdPriceAdjustMonths: "2" });
    const m = mergePrimaryBasic(s, p);
    expect([m.cbZoneType, m.cbUnitPriceAtTransfer]).toEqual(["commercial", "4000000"]);
    expect([m.cbUnitPriceAtFirstOrAcq, m.cbBuildingStdPriceAtAcq, m.cbBuildingStdPriceAtFirst, m.cbLandPricePerSqmAtFirst, m.cbPrevStdPriceSum, m.cbStdPriceAdjustMonths]).toEqual(["2", "2", "2", "2", "2", "2"]);
  });
});
