/**
 * L8 NH-51 route anchor — §99의4⑤를 **계산기 폼 → ④ 변환 → ⑫ Zod → ⑭ route → 엔진** 전 구간으로 확인한다.
 * 엔진 단독 값은 `__tests__/tax-engine/transfer/new-99-4-para5.anchor.test.ts`가 고정한다. 새 입력 칸이 없어(§99의4 선언 + 보유 주택 목록 재사용)
 * 이 파일의 주장은 «농어촌주택 취득일이 양도일 뒤인 선언이 ⑧·⑫·⑭를 막힘 없이 통과해 엔진 ⑤ 판정에 닿는다»이다.
 */
import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST as CALC_POST } from "@/app/api/calc/transfer/route";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm, AssetReductionForm } from "@/lib/stores/calc-wizard-asset";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";

const rural = (acq: string): AssetReductionForm =>
  ({
    type: "new_99_4_rural",
    ruralHouseAcquisitionDate: acq,
    ruralHouseStdPrice: "150000000",
    isRegisteredHanok: false,
    adjacentArea994: "no",
    meetsLocationRequirement: true,
    ruralLandAreaSqm994: "500",
    ruralHouseType994: "other",
    ruralHouseFloorAreaSqm994: "100",
  }) as unknown as AssetReductionForm;

const otherHouse = (over: Partial<HouseEntry> = {}): HouseEntry =>
  ({
    id: "h1",
    region: "capital",
    regionCode: "1165010100",
    acquisitionDate: "2016-03-01",
    officialPrice: "250000000",
    isInherited: false,
    isLongTermRental: false,
    isApartment: false,
    isOfficetel: false,
    isUnsoldHousing: false,
    ...over,
  }) as HouseEntry;

function formOf(reduction: AssetReductionForm | undefined, houses: HouseEntry[]): TransferFormData {
  const f = createDefaultTransferFormData();
  const a = {
    ...makeDefaultAsset(1),
    residenceInputMode: "direct",
    residencePeriods: [],
    assetKind: "housing",
    acquisitionCause: "purchase",
    acquisitionDate: "2015-03-01",
    fixedAcquisitionPrice: "500000000",
    acquisitionPrice: "500000000",
    regionCode: "1168010100",
    standardPriceAtTransfer: "300000000",
    reductions: reduction ? [reduction] : [],
  } as unknown as AssetForm;
  return {
    ...f,
    assets: [a],
    transferDate: "2020-08-01",
    contractTotalPrice: "1200000000",
    isOneHousehold: true,
    householdHousingCount: String(1 + houses.length),
    houses,
    presaleRights: [],
  } as unknown as TransferFormData;
}

async function post(f: TransferFormData) {
  const cap: { body?: Record<string, unknown> } = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init?: RequestInit) => {
      cap.body = JSON.parse(String(init?.body));
      return { ok: true, json: async () => ({ mode: "single", result: {} }) } as unknown as Response;
    }),
  );
  await callTransferTaxAPI(f);
  vi.unstubAllGlobals();
  const res = await CALC_POST(
    new NextRequest("http://localhost/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
      body: JSON.stringify(cap.body),
    }),
  );
  const json = await res.json();
  expect(res.status, JSON.stringify(json).slice(0, 400)).toBe(200);
  return json.data.result as {
    totalTax: number;
    surchargeType?: string;
    longTermHoldingDeduction: number;
    steps: { label: string }[];
  };
}

describe("§99의4⑤ 계산기 route", () => {
  it("[R-0] 선언 없음 → 2주택 중과", async () => {
    const f = formOf(undefined, [otherHouse()]);
    const r = await post(f);
    expect(r.surchargeType).toBe("multi_house_2");
    expect(r.longTermHoldingDeduction).toBe(0);
  });

  it("[R-1] 농어촌주택 2020-09-15 취득(양도 뒤 예정신고기한 안) → 중과 없음 · 장특 적용 · ⑤ 계산 과정", async () => {
    const f = formOf(rural("2020-09-15"), [otherHouse()]);
    // ⑧ — 양도일 뒤 취득일을 막지 않는다(§99의4 선언 자체 오류 없음)
    expect(collectStepIssues(1, f).filter((i) => i.message.includes("§99의4")).map((i) => i.message)).toEqual([]);
    const r = await post(f);
    expect(r.surchargeType).toBeUndefined();
    expect(r.longTermHoldingDeduction).toBeGreaterThan(0);
    expect(r.steps.some((s) => s.label.includes("§99의4⑤") && s.label.includes("중과 비적용"))).toBe(true);
  });

  it("[R-1+] 짝 — 예정신고기한(2020-10-31) 다음 날 취득 → 중과 그대로", async () => {
    const r = await post(formOf(rural("2020-11-01"), [otherHouse()]));
    expect(r.surchargeType).toBe("multi_house_2");
    expect(r.steps.some((s) => s.label.includes("§99의4⑤") && s.label.includes("적용하지 않음"))).toBe(true);
  });
});
