/**
 * D2-2 격자 — 화면에서 만들 수 있는 D2 상태를 ⑧ → ④ → ⑫·엔진에 태운다 (막다른 길 실측).
 *
 * 축: 호스트(상속·증여) × 토지 방식(실가·환산·감정·매매사례) × 양도가액 방식(구분·일괄) × 입력 상태(정상·가액 비움·자산 단위 자본적지출·
 *     파트 자본적지출·동일세대·건물 방식 stale 환산).
 * 단언: (1) ⑧ 통과 ⇒ ⑫ 200 (「⑧ 통과 ↔ ⑫ 400」 0) (2) ⑧이 막으면 그 field가 화면 앵커(`D2_UI_ANCHORS`)에 있다(칸 없는 차단 0).
 * 앵커 목록은 렌더 테스트가 「화면에 실재」를 단언한다.
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
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { validateAssetAcquisition } from "@/lib/calc/transfer-tax-validate-acquisition";
import { collectWithFields } from "@/lib/calc/transfer-tax-validate-field";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { D2_UI_ANCHORS } from "./_d2-ui-anchors";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

const TRANSFER_DATE = "2026-06-30";

function base(host: "inheritance" | "gift", over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "housing",
    acquisitionCause: host,
    acquisitionDate: "2025-05-01",
    inheritanceStartDate: host === "inheritance" ? "2025-05-01" : "",
    inheritanceDate: host === "inheritance" ? "2025-05-01" : "",
    decedentAcquisitionDate: host === "inheritance" ? "2000-01-01" : "",
    landAcquisitionCause: "purchase",
    landCauseHost: host,
    landAcquisitionDate: "2025-01-10",
    hasSeperateLandAcquisitionDate: true,
    landAcqMode: "actual",
    buildingAcqMode: "actual",
    landAcquisitionPrice: "300,000,000",
    buildingAcquisitionPrice: "400,000,000",
    actualSalePrice: "1,200,000,000",
    saleSplitMode: "actual",
    landTransferPrice: "700,000,000",
    buildingTransferPrice: "500,000,000",
    landStandardPriceAtTransfer: "700,000,000",
    buildingStandardPriceAtTransfer: "500,000,000",
    acquisitionArea: "200",
    transferArea: "200",
    standardPricePerSqmAtAcq: "100,000",
    buildingStandardPriceAtAcq: "50,000,000",
    ...over,
  } as AssetForm;
}

const form = (a: AssetForm): TransferFormData =>
  ({
    transferDate: TRANSFER_DATE, filingDate: "2026-08-31", assets: [a], houses: [], presaleRights: [],
    contractTotalPrice: "1200000000", totalTransferExpense: "0", householdHousingCount: "1", isOneHousehold: false,
  }) as unknown as TransferFormData;

async function twelve(a: AssetForm): Promise<number> {
  const cap: { body?: Record<string, unknown> } = {};
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
    cap.body = JSON.parse(String(init?.body));
    return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
  }));
  await callTransferTaxAPI(form(a));
  vi.unstubAllGlobals();
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      isRegulatedArea: false, wasRegulatedAtAcquisition: false, isUnregistered: false, isNonBusinessLand: false,
      annualBasicDeductionUsed: 0, ...cap.body, isOneHousehold: false, householdHousingCount: 1, residencePeriodMonths: 0,
    }),
  }));
  return res.status;
}

const LAND_MODES: [string, Partial<AssetForm>][] = [
  ["실가", {}],
  ["환산", { landAcqMode: "estimated", landAcquisitionPrice: "" }],
  ["감정", { landAcqMode: "appraisal" }],
  ["매매사례", { landAcqMode: "salesCase", landAcquisitionPrice: "", landSalesCaseValue: "280,000,000" }],
];
const SALE_SPLITS: [string, Partial<AssetForm>][] = [
  ["구분양도", {}],
  ["일괄양도", { saleSplitMode: "apportioned", landTransferPrice: "", buildingTransferPrice: "" }],
];
const STATES: [string, Partial<AssetForm>][] = [
  ["정상", {}],
  ["건물 가액 비움", { buildingAcquisitionPrice: "" }],
  ["토지 가액·매매사례 비움", { landAcquisitionPrice: "", landSalesCaseValue: "" }],
  ["자산 단위 자본적지출", { capitalExpenditure: "10,000,000" }],
  ["파트 자본적지출", { landDirectExpenses: "5,000,000", buildingDirectExpenses: "3,000,000" }],
  ["동일세대 통산(시작일 있음)", { decedentSameHouseholdBeforeInheritance: true, decedentCohabitationHoldingStartDate: "1995-01-01", decedentCohabitationResidenceMonths: "60" }],
  ["동일세대 통산(시작일 비움)", { decedentSameHouseholdBeforeInheritance: true }],
  ["건물 방식 stale 환산", { buildingAcqMode: "estimated", useEstimatedAcquisition: true }],
  ["숨은 신고가액 stale", { publishedValueAtInheritance: "900,000,000", inheritanceValuationMethod: "appraisal", fixedAcquisitionPrice: "800,000,000" }],
];

describe("D2-2 격자 — 호스트 × 토지 4방식 × 양도가액 2방식 × 입력 상태", () => {
  it("⑧ 통과 ⇒ ⑫ 200 · ⑧ 차단 ⇒ 이동 field가 화면 앵커에 있다", async () => {
    const anchors = new Set<string>(D2_UI_ANCHORS);
    // 환산·일괄양도는 화면에서 기준시가 카드가 따로 열리는 칸(축 A·토지 카드)이다 — 앵커 목록은 그 field도 쓸 수 있다.
    for (const f of ["standardPricePerSqmAtTransfer", "standardPricePerSqmAtAcq", "acquisitionArea", "landTransferPrice", "buildingTransferPrice", "buildingStandardPriceAtAcq", "landStandardPriceAtTransfer", "buildingStandardPriceAtTransfer"]) anchors.add(f);

    const stuck: string[] = [];
    const noField: string[] = [];
    let passCells = 0;
    let blockCells = 0;
    for (const host of ["inheritance", "gift"] as const) {
      for (const [mn, mo] of LAND_MODES) {
        for (const [sn, so] of SALE_SPLITS) {
          for (const [stn, sto] of STATES) {
            if (host === "gift" && stn.startsWith("동일세대")) continue; // 동일세대는 상속 전용
            const a = base(host, { ...mo, ...so, ...sto });
            const name = `${host}/토지 ${mn}/${sn}/${stn}`;
            const r = collectWithFields(() => validateAssetAcquisition(a, "자산1", TRANSFER_DATE));
            if (r.result === null) {
              passCells++;
              const status = await twelve(a);
              if (status !== 200) stuck.push(`${name} → ⑫ ${status}`);
            } else {
              blockCells++;
              // 정상 입력(정상·동일세대 시작일 있음·파트 자본적지출·건물 stale 환산·숨은 stale)은 전 방식에서 통과해야 한다 — 정상 입력이 막히면 과차단
              if (/^(정상|파트 자본적지출|동일세대 통산\(시작일 있음\)|건물 방식 stale 환산|숨은 신고가액 stale)$/.test(stn))
                noField.push(`과차단 ${name}: ${r.result.slice(0, 80)}`);
              const f = r.fieldOf(r.result);
              if (!f || !anchors.has(f)) noField.push(`${name} → ${f ?? "(field 없음)"}: ${r.result.slice(0, 60)}`);
            }
          }
        }
      }
    }
    console.log(`D2 격자: ⑧ 통과 ${passCells}셀 · ⑧ 차단 ${blockCells}셀`);
    expect(stuck, `⑧ 통과 ↔ ⑫ 차단 막다른 길:\n${stuck.join("\n")}`).toEqual([]);
    expect(noField, `⑧ 차단인데 화면에 칸이 없다:\n${noField.join("\n")}`).toEqual([]);
    expect(passCells).toBeGreaterThan(50);
  }, 180_000);
});
