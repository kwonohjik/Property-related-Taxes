/**
 * anchor — 다주택 중과 판정 ⑤ 세부담 시뮬레이션(계획서 §4.7 · MH-P6 · P8): 폼 → ④ 본문 + `simulation` → route(Zod·엔진 2회) → 응답.
 *
 * 강남 양도 주택(2015-01-01 취득, 양도가액 10억 · 취득가액 5억 · 필요경비 1천만) 공통.
 * - S-1 3주택 이상 중과(2021-06-01) — A 347,435,000 / B 160,688,000 · 장특 A 0 · B 58,800,000(12%) · 가산 30%p
 * - S-2 2주택 중과 — A 293,810,000 / B 160,688,000
 * - S-3 한시 유예(2023-06-01) — A = B 151,470,000 · S-4 1주택(2021) — 중과 없음이라 A = B
 * - S-5 1주택 비과세(2023-06-01 · 12억 이하) — 두 쪽 모두 비과세 · 0
 * - S-6 `simulation` 없음 → 응답에 없다(판정만) · S-7 판정 범위 밖(2018.4.1. 전) → 싣지 않는다
 * - S-8 상속 취득(본문에 원인이 실린다) → route가 `unsupported` · S-9 Zod — 취득가액 0은 400
 */
import { describe, it, expect } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/calc/multi-house-surcharge-judgment/route";
import { buildMultiHouseSurchargeApiBody } from "@/lib/calc/multi-house-surcharge-api";
import { RATE_LIMIT_BYPASS_HEADER } from "@/lib/api/rate-limit";
import type { MultiHouseSurchargeJudgmentResponse } from "@/app/api/calc/multi-house-surcharge-judgment/route";
import type { OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";
import { buildCaseForm, type RulingCase } from "./one-house-rulings/harness";

const GANGNAM = "1168010100";
const SIM = { acquisitionPrice: 500_000_000, expenses: 10_000_000 };

function form(otherHouses: number, transferDate: string, asset: Record<string, unknown> = {}): OneHouseJudgmentFormData {
  return buildCaseForm({
    id: "sim", docNo: "", docDate: "", basis: "current", today: "2026-10-23", summary: "", bucket: "match",
    form: {
      transferDate,
      contractTotalPrice: "1000000000",
      isOneHousehold: true,
      asset: { assetKind: "housing", acquisitionDate: "2015-01-01", regionCode: GANGNAM, standardPriceAtTransfer: "500000000", ...asset },
      houses: Array.from({ length: otherHouses }, (_, i) => ({
        id: `h${i + 1}`, regionCode: GANGNAM, officialPrice: "500000000", acquisitionDate: "2015-01-01",
      })),
    },
  } as unknown as RulingCase);
}

async function post(body: unknown) {
  const res = await POST(
    new NextRequest("http://localhost/api/calc/multi-house-surcharge-judgment", {
      method: "POST",
      headers: { "content-type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" },
      body: JSON.stringify(body),
    }),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, json: (await res.json()) as any };
}
async function simulate(f: OneHouseJudgmentFormData, simulation: unknown = SIM): Promise<MultiHouseSurchargeJudgmentResponse> {
  const r = await post({ ...buildMultiHouseSurchargeApiBody(f), simulation });
  expect(r.status, JSON.stringify(r.json?.error)).toBe(200);
  return r.json.data;
}
function computed(d: MultiHouseSurchargeJudgmentResponse) {
  const s = d.simulation;
  if (s?.status !== "computed") throw new Error(`simulation not computed: ${JSON.stringify(s)}`);
  return s;
}

describe("MH-P6 세부담 시뮬레이션", () => {
  it("[S-1] 3주택 이상 중과 — A 판정대로 · B 중과 없는 세대 구성 · 차액", async () => {
    const d = await simulate(form(2, "2021-06-01"));
    expect(d.headline!.result.surchargeType).toBe("multi_house_3plus");
    const s = computed(d);
    expect([s.withSurcharge.totalTax, s.withoutSurcharge.totalTax, s.difference]).toEqual([347_435_000, 160_688_000, 186_747_000]);
    expect([s.withSurcharge.longTermHoldingDeduction, s.withoutSurcharge.longTermHoldingDeduction]).toEqual([0, 58_800_000]);
    expect([s.withSurcharge.surchargeRate, s.withoutSurcharge.surchargeRate]).toEqual([0.3, null]);
    expect([s.withSurcharge.transferGain, s.withoutSurcharge.transferGain]).toEqual([490_000_000, 490_000_000]);
  });
  it("[S-2] 2주택 중과 — 가산 20%p", async () => {
    const s = computed(await simulate(form(1, "2021-06-01")));
    expect([s.withSurcharge.totalTax, s.withoutSurcharge.totalTax]).toEqual([293_810_000, 160_688_000]);
    expect(s.withSurcharge.surchargeRate).toBe(0.2);
  });
  it("[S-3] 한시 유예 — 중과 유형은 남아도 A = B", async () => {
    const d = await simulate(form(2, "2023-06-01"));
    expect(d.headline!.result.isSurchargeSuspended).toBe(true);
    const s = computed(d);
    expect([s.withSurcharge.totalTax, s.withoutSurcharge.totalTax, s.difference]).toEqual([151_470_000, 151_470_000, 0]);
  });
  it("[S-4] 1주택 — 중과 없음이라 A = B", async () => {
    const d = await simulate(form(0, "2021-06-01"));
    expect(d.headline!.result.surchargeType).toBe("none");
    const s = computed(d);
    expect([s.withSurcharge.totalTax, s.difference]).toEqual([160_688_000, 0]);
  });
  it("[S-5] 1주택 비과세 — 두 쪽 모두 비과세 · 0", async () => {
    const s = computed(await simulate(form(0, "2023-06-01")));
    expect([s.withSurcharge.isExempt, s.withoutSurcharge.isExempt, s.withSurcharge.totalTax, s.difference]).toEqual([true, true, 0, 0]);
  });
  it("[S-6] simulation 없음 → 응답에 싣지 않는다", async () => {
    const r = await post(buildMultiHouseSurchargeApiBody(form(2, "2021-06-01")));
    expect(r.status).toBe(200);
    expect(r.json.data.simulation).toBeUndefined();
    expect(r.json.data.headline.result.surchargeType).toBe("multi_house_3plus");
  });
  it("[S-7] 판정 범위 밖(2018.4.1. 전) → 싣지 않는다", async () => {
    const d = await simulate(form(2, "2018-03-01"));
    expect(d.scope).toEqual({ supported: false, reason: "before_2018_04_01" });
    expect(d.simulation).toBeUndefined();
  });
  it("[S-8] 상속 취득 — route가 본문의 원인을 보고 계산하지 않는다", async () => {
    const d = await simulate(form(2, "2021-06-01", { acquisitionCause: "inheritance", decedentAcquisitionDate: "2005-01-01" }));
    expect(d.simulation).toEqual({ status: "unsupported", reason: "not_purchase_housing" });
  });
  it("[S-9] Zod — 취득가액 0은 400", async () => {
    const r = await post({ ...buildMultiHouseSurchargeApiBody(form(2, "2021-06-01")), simulation: { acquisitionPrice: 0, expenses: 0 } });
    expect(r.status).toBe(400);
    expect(Object.keys(r.json.error.fieldErrors)).toContain("simulation.acquisitionPrice");
  });
});
