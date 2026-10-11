/**
 * G4-3 — 이월과세(`carryover_gift`) 주택 + 명부 1채: 취득일 칸이 없는 화면 상태(`acquisitionDate ""`)에서
 * ⑧을 통과한 입력을 ⑫가 400으로 막던 결함.
 *
 * 본문 `acquisitionDate`만 `acquisitionDate || carryover.giftRegistryDate` fallback을 쓰고, 명부 양도 행(`houses[0]`)과
 * §155① 종전주택 취득일은 원시 빈 값을 보냈다 → `houses.0.acquisitionDate` Invalid ISO date 400. 양도 행만 고치면 §155①
 * 도출(`!prev`)이 조용히 빠져 비과세가 과세로 바뀐다.
 *
 * ⚠️ 이 anchor는 **종전주택 취득일을 증여일로 볼지 증여자 취득일로 볼지 단언하지 않는다**(결정 대기 축 — 「소득세법 시행령」
 * 제155조제1항의 「종전의 주택을 취득한 날」). 세 소비처가 본문과 **같은 값**을 쓰는지(3중 패턴)와, 이 사실관계에서 두 날짜 어느 쪽이든 같은
 * 결론(신규주택 취득 후 1년 경과·양도는 3년 이내 → 일시적 2주택 비과세)만 단언한다.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

import { POST as SINGLE } from "@/app/api/calc/transfer/route";
import { preloadTaxRates, loadFallbackTransferRates } from "@/lib/db/tax-rates";
import { callTransferTaxAPI } from "@/lib/calc/transfer-tax-api";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import type { HouseEntry } from "@/lib/stores/calc-wizard-asset-nbl";

type Obj = Record<string, unknown>;
const TRANSFER_DATE = "2025-06-01";
const EUMSEONG = "4377037000"; // 충북 음성군 — 조정대상지역 지정 이력 없음

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockImplementation(
    async () => loadFallbackTransferRates(new Date(TRANSFER_DATE)) as Awaited<ReturnType<typeof preloadTaxRates>>,
  );
});
afterEach(() => vi.unstubAllGlobals());

const row = (over: Partial<HouseEntry>): HouseEntry =>
  ({
    region: "non_capital",
    officialPrice: "300000000",
    isInherited: false,
    isLongTermRental: false,
    isApartment: false,
    isOfficetel: false,
    isUnsoldHousing: false,
    ...over,
  }) as HouseEntry;

/** 직계 이월과세(증여자 2010-03-01 취득 → 2022-03-01 증여), 명부에 2024-05-30 취득 주택, 2025-06-01 9억 양도. */
function form(o: { cause: "carryover_gift" | "gift"; acq: string; roster: boolean }) {
  const f = createDefaultTransferFormData();
  Object.assign(f, {
    transferDate: TRANSFER_DATE,
    isOneHousehold: true,
    contractTotalPrice: "900000000",
    householdNoPresaleRightsConfirmed: true,
    householdNoOtherHousesConfirmed: !o.roster,
    residencePeriodMonths: "0",
  });
  Object.assign(f.assets[0], {
    assetKind: "housing",
    acquisitionCause: o.cause,
    acquisitionDate: o.acq,
    actualSalePrice: "900000000",
    fixedAcquisitionPrice: "300000000",
    addressJibun: "테스트 주소 1",
    regionCode: EUMSEONG,
    residenceInputMode: "direct",
    residencePeriods: [],
    residencePeriodMonthsAsset: "0",
    ...(o.cause === "carryover_gift"
      ? {
          carryover: {
            ...CARRYOVER_DEFAULTS,
            giftRegistryDate: "2022-03-01",
            donorAcquisitionDate: "2010-03-01",
            donorAcquisitionPrice: "300000000",
            giftDateValuation: "700000000",
            giftTaxAmount: "0",
            donorRelation: "lineal",
            // 결정 #33·#34 필수 사실 질문 — 이 파일의 관심사는 취득일 fallback이라 중립값 「아니오」(별도세대).
            donorSameHousehold: "no" as const,
          },
        }
      : {}),
  });
  f.houses = o.roster ? [row({ id: "h1", acquisitionDate: "2024-05-30", regionCode: EUMSEONG })] : [];
  return f;
}

async function run(f: ReturnType<typeof form>) {
  const issues: string[] = [];
  for (let s = 0; s <= 5; s++) for (const i of collectStepIssues(s, f)) issues.push(`${s}:${i.field ?? ""}:${i.message}`);
  let body: Obj = {};
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_u: string, init: RequestInit) => {
      body = JSON.parse(String(init.body));
      return { ok: true, json: async () => ({ data: { mode: "single", result: {} } }) } as Response;
    }),
  );
  await callTransferTaxAPI(f).catch(() => undefined);
  vi.unstubAllGlobals();
  const res = await SINGLE(
    new NextRequest("http://l/api/calc/transfer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  const json = (await res.json()) as { data?: { result?: Obj }; error?: unknown };
  return { issues, body, status: res.status, json, result: json.data?.result };
}

describe("G4-3 이월과세 + 명부 — 취득일 칸이 비어도 ⑫가 막지 않는다", () => {
  it("취득일 빈 값: ⑧ 통과 ↔ ⑫ 200, 명부 양도 행·§155① 종전주택 취득일이 본문과 같은 값, 일시적 2주택 비과세", async () => {
    const r = await run(form({ cause: "carryover_gift", acq: "", roster: true }));
    expect(r.issues).toEqual([]);
    expect(r.status, JSON.stringify(r.json).slice(0, 300)).toBe(200);
    const b = r.body as { acquisitionDate: string; houses: { acquisitionDate: string }[]; temporaryTwoHouse?: Obj };
    expect(b.acquisitionDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // 세 소비처(본문·명부 양도 행·§155①)가 같은 leaf를 읽는다 — 날짜 선택(증여일/증여자 취득일)은 단언하지 않는다.
    expect(b.houses[0].acquisitionDate).toBe(b.acquisitionDate);
    expect(b.temporaryTwoHouse).toMatchObject({ previousAcquisitionDate: b.acquisitionDate, newAcquisitionDate: "2024-05-30" });
    expect(r.result).toMatchObject({ isExempt: true, exemptReason: "일시적 2주택 비과세" });
  }, 60_000);

  it("긍정 짝 — 같은 사실을 「증여」(취득일 직접 입력)로 입력하면 같은 결론", async () => {
    const r = await run(form({ cause: "gift", acq: "2022-03-01", roster: true }));
    expect(r.status).toBe(200);
    expect(r.result).toMatchObject({ isExempt: true, exemptReason: "일시적 2주택 비과세" });
  }, 60_000);

  it("긍정 짝 — 이월과세 + 명부 0채는 종전에도 1세대1주택 비과세", async () => {
    const r = await run(form({ cause: "carryover_gift", acq: "", roster: false }));
    expect(r.status).toBe(200);
    expect(r.result).toMatchObject({ isExempt: true, exemptReason: "1세대1주택 비과세" });
  }, 60_000);
});
