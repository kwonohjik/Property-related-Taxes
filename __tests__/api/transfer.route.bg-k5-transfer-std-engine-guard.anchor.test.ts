/**
 * 부담부증여 시가 · 환산취득가액(K-5) — 양도시 기준시가가 없으면 엔진이 막는다(직접 API · 계획서 `docs/00-pm/companion-inherit-valuation-share-vp2c.plan.md` §21).
 *
 * 종전: `burdenedGiftInfo.land/buildingStdPriceAtTransfer`가 0이면 K-5 분기(`burdened-gift-acquisition.ts`)가 취득가액을 0으로 두고 200 —
 *   주 자산 단건 · 축 B 지분 컴패니언 · 함께 양도 컴패니언 모두 양도차익이 부풀었다(단건 292,800,000 → 592,800,000 · 축 B → 412,800,000 · 묶음 585,600,000 → 885,600,000).
 *   화면 경로는 ⑧(`transfer-tax-validate-bg.ts` K-5)이 먼저 막는다 — 직접 API만의 구멍이었다.
 * 지금: 기준시가 모드 가드(`burdened-gift-apportionment.ts`)와 같은 fail-fast — 경로 하나에서 모든 모양을 막는다.
 *
 * - KG-1 4종 × (단건 · 축 B · 함께 양도) 양도시 기준시가 0 → 400 · 문구
 * - KG-2 대조 — 정상 입력 200(292,800,000 · 585,600,000) · K-4 실지는 양도시 기준시가 0이어도 그대로(환산 분모를 쓰지 않는다 · 450,000,000)
 * - KG-3 시가 모드 산정방식 누락 — 단건 ⑫ · 컴패니언(축 B · 함께 양도)은 엔진이 이미 400(형제 안전망 고정)
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
import { captureBody } from "../calc/_one-house-pr3a-calc-route";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type AssetForm, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import { rosterForDeclaredCount } from "@/__tests__/calc/_helpers/roster-for-declared-count";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Kind = "housing" | "land" | "commercial_building" | "building";
const KINDS: Kind[] = ["housing", "land", "commercial_building", "building"];
const LAND = { landAreaM2: "100", acquisitionArea: "100", transferArea: "100", landNature: "independent", companionLandNature: "independent" };
const FIELD: Record<Kind, string> = { housing: "bgActualAcquisitionTotal", land: "bgActualAcquisitionLand", commercial_building: "bgActualAcquisitionTotal", building: "bgActualAcquisitionTotal" };
/** 시가 10억 · 양도시 기준시가 8억 · 취득시 기준시가 4억 · 채무 6억 — vp2c §17.1과 같은 재료. */
const COMMON = { addressJibun: "서울 강남구 테스트동 1-1", acquisitionCause: "purchase", transferType: "burdened_gift", bgDonorRelation: "lineal_descendant", bgLendingDepositTotal: "0",
  standardPriceAtTransfer: "800000000", standardPriceAtAcq: "400000000", bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "1000000000", bgAcquisitionMethod: "converted",
  bgMortgageDebtAmount: "600000000", bgMortgageSetAmount: "600000000" };
const asset = (n: number, k: Kind, ...o: Record<string, unknown>[]) =>
  Object.assign({ ...makeDefaultAsset(n) }, { assetId: `a${n}`, ...COMMON, assetKind: k, acquisitionDate: "2015-01-01", ...(k === "land" ? LAND : {}), [FIELD[k]]: "250000000" }, ...o) as unknown as AssetForm;
const BASE = { transferDate: "2026-02-16", filingDate: "2026-04-30", totalTransferExpense: "0", householdHousingCount: "2", isOneHousehold: false, householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true };
const form = (assets: AssetForm[], over: Record<string, unknown> = {}) => rosterForDeclaredCount(Object.assign(createDefaultTransferFormData(), BASE, { assets }, over)) as TransferFormData;
const pct = (n: number) => ({ ownershipNumerator: String(n), ownershipDenominator: "100" });
/** [모양, 폼, 본문에서 그 자산의 burdenedGiftInfo] */
const SHAPES: [string, (k: Kind, ...o: Record<string, unknown>[]) => TransferFormData, (b: Loose) => Loose][] = [
  ["단건", (k, ...o) => form([asset(1, k, ...o)]), (b) => b.burdenedGiftInfo],
  ["축 B 지분 컴패니언", (k, ...o) => form([asset(1, k, pct(60), ...o), asset(2, k, pct(40), { acquisitionDate: "2018-01-01" }, ...o)], { assetSplitMode: "fractional", contractTotalPrice: "1000000000" }), (b) => b.companionAssets[0].burdenedGiftInfo],
  ["함께 양도 컴패니언", (k, ...o) => form([asset(1, k, ...o), asset(2, k, { addressJibun: "서울 강남구 테스트동 2-2" }, ...o)], { assetSplitMode: "companion", bundledSaleMode: "actual", contractTotalPrice: "2000000000" }), (b) => b.companionAssets[0].burdenedGiftInfo],
];

async function post(f: TransferFormData, mut: (b: Loose) => void = () => {}) {
  const b = (await captureBody(f)) as Loose;
  mut(b);
  const res = await POST(new NextRequest("http://localhost/api/calc/transfer", {
    method: "POST", headers: { "Content-Type": "application/json", [RATE_LIMIT_BYPASS_HEADER]: "1" }, body: JSON.stringify(b),
  }));
  const j = (await res.json()) as Loose;
  return { status: res.status, err: JSON.stringify(j.error ?? null), gain: (j.data?.aggregated?.totalTransferGain ?? j.data?.result?.transferGain) as number };
}
const zeroTransferStd = (pick: (b: Loose) => Loose) => (b: Loose) => {
  const info = pick(b);
  info.landStdPriceAtTransfer = 0;
  info.buildingStdPriceAtTransfer = 0;
};

describe("KG-1 K-5 · 양도시 기준시가 0 → 엔진 400", () => {
  for (const k of KINDS) for (const [shape, make, pick] of SHAPES) {
    it(`${k} · ${shape}`, async () => {
      const r = await post(make(k), zeroTransferStd(pick));
      expect(r.status).toBe(400);
      expect(r.err).toContain("환산취득가액으로 취득가액을 산정하는데 양도시 기준시가가 없습니다");
    });
  }
});

describe("KG-2 대조 — 막지 않는다", () => {
  for (const k of KINDS) {
    it(`${k} · 정상 입력 단건 292,800,000 · 축 B 292,800,000 · 묶음 585,600,000`, async () => {
      const gains = await Promise.all(SHAPES.map(async ([, make]) => (await post(make(k))).gain));
      expect(gains).toEqual([292_800_000, 292_800_000, 585_600_000]);
    });
    it(`${k} · K-4 실지는 양도시 기준시가 0이어도 그대로 450,000,000`, async () => {
      const [, make, pick] = SHAPES[0];
      const r = await post(make(k, { bgAcquisitionMethod: "actual" }), zeroTransferStd(pick));
      expect(r.status, r.err).toBe(200);
      expect(r.gain).toBe(450_000_000);
    });
  }
});

describe("KG-3 시가 모드 산정방식 누락 — 이미 400(형제 안전망)", () => {
  for (const k of KINDS) for (const [shape, make, pick] of SHAPES) {
    it(`${k} · ${shape}`, async () => {
      const r = await post(make(k), (b) => { delete pick(b).acquisitionMethod; });
      expect(r.status).toBe(400);
      expect(r.err).toMatch(/산정방식/);
    });
  }
});
