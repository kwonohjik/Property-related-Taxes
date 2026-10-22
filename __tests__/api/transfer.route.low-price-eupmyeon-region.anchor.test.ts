/**
 * route 관측 — 폼 → ④ API 변환(`region` 파생) → ⑫ Zod → ⑭ route → 엔진. 읍·면 3억 이하 주택이 주택 수에서 빠지는가.
 * 엔진 anchor·법령 근거: `__tests__/tax-engine/multi-house-surcharge/low-price-eupmyeon-region.anchor.test.ts`
 * 계획서: docs/00-pm/multi-house-surcharge-eupmyeon-region.plan.md
 *
 * 새 입력은 없다 — 명부 행의 기존 `regionCode`가 새 판정(§167의3①1호 · §167의10①1호 괄호의 읍·면)에 실제로 도달하는지 본다.
 *
 * | 시료(서울 강남 양도 · 2026-07-01 · 명부 1채 2억) | 수정 전 | 수정 후 |
 * |---|---|---|
 * | 남양주 화도읍(읍) | 주택 수 2 · multi_house_2 | 주택 수 1 · none |
 * | 대조: 남양주 호평동(동) | 주택 수 2 · multi_house_2 | 불변 |
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi
    .fn()
    .mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(false),
}));

import { POST } from "@/app/api/calc/transfer/route";
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRatesWithHouseEngine } from "../tax-engine/_helpers/mock-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { deriveHouseRegionFromCode } from "@/lib/calc/house-region";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRatesWithHouseEngine());
});

type Form = ReturnType<typeof createDefaultTransferFormData>;

const GANGNAM = "1168010100"; // 서울 강남구 역삼동
const HWADO_EUP = "4136025621"; // 경기 남양주시 화도읍 마석우리
const HOPYEONG_DONG = "4136010100"; // 경기 남양주시 호평동

/** 명부 행 — 주소 검색이 만드는 것과 같게 `region`을 코드에서 파생한다(`buildHouseAddressPatch`). */
function row(code: string): HouseEntry {
  return {
    id: "h2",
    region: deriveHouseRegionFromCode(code),
    regionCode: code,
    acquisitionDate: "2016-01-01",
    officialPrice: "200000000",
    isInherited: false,
    isLongTermRental: false,
    isApartment: true,
    isOfficetel: false,
    isUnsoldHousing: false,
  } as HouseEntry;
}

function form(houses: HouseEntry[]): Form {
  const f = createDefaultTransferFormData();
  f.isOneHousehold = true;
  f.assets[0] = {
    ...f.assets[0],
    assetKind: "housing",
    acquisitionDate: "2015-01-01",
    fixedAcquisitionPrice: "300,000,000",
    regionCode: GANGNAM,
  };
  return Object.assign(f, {
    transferDate: "2026-07-01",
    contractTotalPrice: "2,000,000,000",
    residencePeriodMonths: "0",
    householdHousingCount: String(houses.length + 1),
    isRegulatedArea: true,
    wasRegulatedAtAcquisition: true,
    houses,
  });
}

type MultiHouse = { surchargeType: string; effectiveHouseCount: number };
async function run(f: Form): Promise<MultiHouse> {
  let body: unknown;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return { ok: true, json: async () => ({ data: { mode: "single", result: {} } }) } as Response;
    }),
  );
  await callTransferTaxAPI(f).catch(() => undefined);
  vi.unstubAllGlobals();
  const res = await POST(
    new NextRequest("http://l/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  const json = (await res.json()) as { data?: { result?: { multiHouseSurchargeEvaluation?: MultiHouse } } };
  expect(res.status, JSON.stringify(json).slice(0, 400)).toBe(200);
  return json.data!.result!.multiHouseSurchargeEvaluation!;
}

describe("route — 읍·면 3억 이하 주택의 주택 수 불산입", () => {
  it("R1 강남 양도 + 화도읍 2억 → 주택 수 1 · 중과 없음 (수정 전 multi_house_2)", async () => {
    const mh = await run(form([row(HWADO_EUP)]));
    expect(mh.effectiveHouseCount).toBe(1);
    expect(mh.surchargeType).toBe("none");
  });

  it("R2 대조 — 강남 양도 + 호평동(동) 2억 → 종전대로 2주택 중과", async () => {
    const mh = await run(form([row(HOPYEONG_DONG)]));
    expect(mh.effectiveHouseCount).toBe(2);
    expect(mh.surchargeType).toBe("multi_house_2");
  });
});
