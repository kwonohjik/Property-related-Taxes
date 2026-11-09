/**
 * 축 B(지분 분할) × 부담부증여 — 주택 · 토지 · 상가 · 건물 지분 카드의 양도시 기준시가는 자산 1 값을 쓴다(D-3d · Q-10 a · Q-11 (가)).
 * 계획서 `docs/00-pm/companion-inherit-valuation-share-vp2c.plan.md` §17.
 *
 * 양도시 기준시가는 같은 물건 · 같은 양도일의 물건 단위 값이다(물건 전체 기준 입력 · 엔진이 지분율을 곱한다).
 * 종전: `mergePrimaryBasic`이 병합하지 않아 지분 카드 값(칸 없음 → 빈 값)을 썼다 — 기준시가 평가 · 환산(K-5)에서 ⑧이 숨은 ②를 요구해 막다른 길,
 *   K-5 직접 API는 ⑫ 200 · 지분 2 취득가액 0 → 양도차익 412,800,000(단건 292,800,000).
 * 지금: 부담부증여 지분은 자산 1 값을 병합한다. 일반 양도 지분은 ③에 자기 칸이 있어 그대로다.
 *
 * 시료: 지분 2 = 「+ 지분 추가」 기본값(`makeDefaultAsset`) + 취득원인 · 취득일 · 지분율 · 이 지분 취득시 기준시가. 오라클 = 같은 물건 100% 단건.
 */
import { describe, it, expect, vi } from "vitest";
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

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Kind = "housing" | "land" | "commercial_building" | "building";
const KINDS: Kind[] = ["housing", "land", "commercial_building", "building"];
const x = (o: Record<string, unknown>) => o as unknown as Partial<AssetForm>;
const FIELD: Record<Kind, string> = { housing: "bgActualAcquisitionTotal", land: "bgActualAcquisitionLand", commercial_building: "bgActualAcquisitionTotal", building: "bgActualAcquisitionTotal" };
const LAND = { landAreaM2: "100", acquisitionArea: "100", transferArea: "100", landNature: "independent", companionLandNature: "independent" };
/** 시가 10억 · 양도시 기준시가 8억 · 취득시 기준시가 4억 — vp2c §17.1과 같은 재료. */
const COMMON = { addressJibun: "서울 강남구 테스트동 1-1", acquisitionCause: "purchase", transferType: "burdened_gift", bgDonorRelation: "lineal_descendant", bgLendingDepositTotal: "0",
  standardPriceAtTransfer: "800000000", standardPriceAtAcq: "400000000", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1000000000", bgAcquisitionMethod: "actual" };
const STD = { bgValuationMode: "sangjeungbeop_standard", bgMarketValueAtTransfer: "", bgAcquisitionMethod: "" };
const K5 = { bgAcquisitionMethod: "converted" };
const debt = (d: number) => ({ bgMortgageDebtAmount: String(d), bgMortgageSetAmount: String(d) });
const pct = (n: number) => ({ ownershipNumerator: String(n), ownershipDenominator: "100" });
const primary = (k: Kind, ...o: Record<string, unknown>[]) =>
  Object.assign({ ...makeDefaultAsset(1) }, x({ assetId: "p", ...COMMON, assetKind: k, acquisitionDate: "2015-01-01", ...(k === "land" ? LAND : {}), [FIELD[k]]: "250000000" }), ...o.map(x)) as AssetForm;
/** 「+ 지분 추가」 기본값 지분 카드 — 양도시 기준시가 칸 없음(빈 값). */
const share = (...o: Record<string, unknown>[]) =>
  Object.assign({ ...makeDefaultAsset(2) }, x({ assetId: "s", acquisitionCause: "purchase", acquisitionDate: "2018-01-01", standardPriceAtAcq: "400000000" }), ...o.map(x)) as AssetForm;
const form = (assets: AssetForm[], over: Record<string, unknown> = {}) =>
  rosterForDeclaredCount(rosterForDeclaredCount(Object.assign(createDefaultTransferFormData(), {
    transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", householdHousingCount: "2", isOneHousehold: false,
    householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, assets, assetSplitMode: "fractional", contractTotalPrice: "1000000000",
  }, over))) as TransferFormData;
const single = (k: Kind, ...o: Record<string, unknown>[]) => form([primary(k, ...o)], { assetSplitMode: undefined, contractTotalPrice: "" });

async function post(f: TransferFormData) {
  const body = await captureBody(f);
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(body),
  }));
  const j = (await res.json()) as Loose;
  return { status: res.status, err: JSON.stringify(j.error ?? null).slice(0, 300), gain: (j.data?.aggregated?.totalTransferGain ?? j.data?.result?.transferGain) as number };
}
async function gainOk(f: TransferFormData) {
  expect(allIssues(f)).toEqual([]);
  const r = await post(f);
  expect(r.status, r.err).toBe(200);
  return r.gain;
}

describe("SD-1 지분 2 양도시 기준시가 칸 없음(빈 값) — ⑧ 0 · ⑫ 200 · 양도차익 = 100% 단건", () => {
  // [이름, 모드, 채무, 고정값]
  const CELLS: [string, Record<string, unknown>, number, number][] = [
    ["기준시가 보충", STD, 400_000_000, 194_000_000],
    ["기준시가 담보", STD, 900_000_000, 488_000_000],
    ["시가 보충 K-5 환산", K5, 600_000_000, 292_800_000],
  ];
  for (const k of KINDS) for (const [name, mode, d, fixed] of CELLS) {
    it(`${k} · ${name}`, async () => {
      const b = await gainOk(form([primary(k, pct(60), mode, debt(d)), share(pct(40))]));
      expect(b).toBe(await gainOk(single(k, mode, debt(d))));
      expect(b).toBe(fixed);
    });
  }
});

describe("SD-2 자산 1 양도시 기준시가를 비우면 계속 막는다(형제 안전망)", () => {
  for (const k of KINDS) {
    it(`${k} 기준시가 보충 — ⑧이 자산 1을 짚는다 ∧ ⑫ 400`, async () => {
      const f = form([primary(k, pct(60), STD, debt(400_000_000), { standardPriceAtTransfer: "", standardPricePerSqmAtTransfer: "" }), share(pct(40))]);
      const is = allIssues(f).map(String);
      expect(is.some((m) => m.includes("자산 1:") && m.includes("standardPriceAtTransfer"))).toBe(true);
      expect((await post(f)).status).toBe(400);
    });
  }
});

describe("SD-3 병합 범위", () => {
  const p = (o: Record<string, unknown> = {}) => primary("housing", o);
  const s = share({ standardPriceAtTransfer: "123000000", standardPricePerSqmAtTransfer: "77" });
  it("부담부증여 주택 · 토지 · 상가 · 건물 지분 → 자산 1 값", () => {
    for (const k of KINDS) {
      const m = mergePrimaryBasic(s, primary(k, { standardPricePerSqmAtTransfer: "8000000" }));
      expect(m.standardPriceAtTransfer).toBe("800000000");
      expect(m.standardPricePerSqmAtTransfer).toBe("8000000");
    }
  });
  it("일반 양도 지분 → 그 지분 칸 값 그대로(③에 자기 칸이 있다)", () => {
    expect(mergePrimaryBasic(s, p({ transferType: "regular" })).standardPriceAtTransfer).toBe("123000000");
  });
  it("재개발 APT(D-3f · vp2c §19.4 · Q-13 a) → 자산 1 값", () => {
    expect(mergePrimaryBasic(s, p({ assetKind: "redevelopment_apt" })).standardPriceAtTransfer).toBe("800000000");
  });
  it("입주권(평가 3항 — 이 값을 쓰지 않는다) · 일반건물(`mergeGbPropertyLevel`) → 종전 그대로", () => {
    for (const assetKind of ["right_to_move_in", "general_building"]) expect(mergePrimaryBasic(s, p({ assetKind })).standardPriceAtTransfer).toBe("123000000");
  });
  it("자산 1 자신은 그대로", () => {
    const a = p();
    expect(mergePrimaryBasic(a, a).standardPriceAtTransfer).toBe("800000000");
  });
});
