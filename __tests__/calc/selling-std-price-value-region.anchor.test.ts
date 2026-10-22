/**
 * anchor(④→⑫→⑭→엔진) — 계산기 양도 주택의 양도 당시 기준시가가 양도 주택 행에 도착해 §167의3①1호 판정을 가른다
 * (계획서 `calc-selling-house-std-price-value-region.plan.md` §1.2 · SP-3).
 *
 * 공통: 양도 2021-06-01 · 양도가 10억 · 취득 2015-01-01 · 취득가 5억 · 매매·실가. 명부는 강남(지역기준) 공시가 5억.
 * 전주 완산구는 2020-12-18~2022-09-26 조정대상지역이고 가액기준이다. 수정 전 값: 비움 → 164,560,000(중과 없음 · ⑧ 무경고).
 *
 * | # | 명부 | 기준시가 | 판정 | 총세액 |
 * |---|---|---|---|---|
 * | M-1 | 2채 | 비움 | ⑧ 차단 | — |
 * | M-2 | 2채 | 4억 | 3주택 이상 중과 | 355,135,000 |
 * | M-3 | 2채 | 2.5억 | 1호 — 중과 없음 | 164,560,000 |
 * | M-4 | 1채 | 4억 | 2주택 중과 | 300,410,000 |
 * | PHD | 2채 | PHD 칸 4억 | 3주택 이상 중과(양도 주택 행 400,000,000) | — |
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as CALC_POST } from "@/app/api/calc/transfer/route";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";

const GANGNAM = "1168010100";
const JEONJU = "4511110100";
const row = (id: string): HouseEntry =>
  ({ id, region: "capital", regionCode: GANGNAM, acquisitionDate: "2010-01-01", officialPrice: "500000000", acquisitionOrigin: "general",
     isInherited: false, isLongTermRental: false, isApartment: true, isOfficetel: false, isUnsoldHousing: false }) as HouseEntry;

function form(houses: HouseEntry[], over: Partial<AssetForm> = {}): TransferFormData {
  return {
    ...createDefaultTransferFormData(),
    transferDate: "2021-06-01",
    contractTotalPrice: "1000000000",
    householdHousingCount: String(1 + houses.length),
    isOneHousehold: true,
    houses,
    presaleRights: [],
    assets: [
      { ...makeDefaultAsset(1), assetKind: "housing", acquisitionCause: "purchase", acquisitionDate: "2015-01-01", regionCode: JEONJU,
        addressJibun: "전북 전주시 완산구 중앙동1가 1", actualSalePrice: "1000000000", fixedAcquisitionPrice: "500000000", acquisitionPrice: "500000000", ...over },
    ],
  } as unknown as TransferFormData;
}

async function body(f: TransferFormData): Promise<Record<string, unknown>> {
  const cap: { body?: Record<string, unknown> } = {};
  vi.stubGlobal("fetch", vi.fn(async (_u: string, init?: RequestInit) => {
    cap.body = JSON.parse(String(init?.body));
    return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
  }));
  await callTransferTaxAPI(f);
  vi.unstubAllGlobals();
  return cap.body!;
}
const sellingRow = (b: Record<string, unknown>) => (b.houses as { id: string; officialPrice: number }[]).find((h) => h.id === "selling")!;

async function run(f: TransferFormData) {
  const res = await CALC_POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST",
    headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
    body: JSON.stringify(await body(f)),
  }));
  const json = await res.json();
  expect(res.status, JSON.stringify(json).slice(0, 300)).toBe(200);
  return json.data.result as { totalTax: number; surchargeType?: string; multiHouseSurchargeDetail?: { effectiveHouseCount: number } };
}
const stdIssue = (f: TransferFormData) => collectStepIssues(0, f).some((i) => i.message.includes("양도 당시 기준시가(주택 공시가격)"));

describe("SP-3 — 양도 주택 기준시가가 1호 판정을 가른다", () => {
  it("[M-1] 비움 → ⑧이 막는다", () => {
    expect(stdIssue(form([row("h1"), row("h2")]))).toBe(true);
  });
  it("[M-2] 4억 → 3주택 이상 중과 355,135,000", async () => {
    const f = form([row("h1"), row("h2")], { standardPriceAtTransfer: "400000000" });
    expect(stdIssue(f)).toBe(false);
    const r = await run(f);
    expect([r.surchargeType, r.multiHouseSurchargeDetail?.effectiveHouseCount, r.totalTax]).toEqual(["multi_house_3plus", 3, 355_135_000]);
  });
  it("[M-3] 2.5억 → 1호로 중과 없음 164,560,000", async () => {
    const r = await run(form([row("h1"), row("h2")], { standardPriceAtTransfer: "250000000" }));
    expect([r.surchargeType ?? "none", r.multiHouseSurchargeDetail?.effectiveHouseCount, r.totalTax]).toEqual(["none", 2, 164_560_000]);
  });
  it("[M-4] 1채 + 4억 → 2주택 중과 300,410,000", async () => {
    const r = await run(form([row("h1")], { standardPriceAtTransfer: "400000000" }));
    expect([r.surchargeType, r.totalTax]).toEqual(["multi_house_2", 300_410_000]);
  });
  it("[PHD] §164⑦ 3시점 칸의 양도시 개별주택가격이 양도 주택 행에 도착한다(일반 칸에 남은 값은 쓰지 않는다)", async () => {
    const b = await body(
      form([row("h1"), row("h2")], { useEstimatedAcquisition: true, usePreHousingDisclosure: true, phdTransferHousingPrice: "400000000", standardPriceAtTransfer: "100000000" }),
    );
    expect(sellingRow(b).officialPrice).toBe(400_000_000);
  });
});
