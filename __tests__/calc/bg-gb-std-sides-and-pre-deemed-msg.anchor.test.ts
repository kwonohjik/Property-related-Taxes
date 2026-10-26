/**
 * 일반건물 부담부증여 기준시가 한쪽 비움 · 기준시가 평가 1985 전 상속 ⑫ 문구
 * (계획서 `docs/02-design/features/bg-gb-std-sides-and-pre-deemed-msg.plan.md`).
 *
 * - G-1~G-4 단독 × 기준시가·시가 × 토지만·건물만 0 — 모양 A(양식 비움 · ⑧ 우회 → `generalBuildingValuation` 없음)·B(`info`만 0) → 400.
 * - G-5 축 B 지분 `info` · G-6 함께 양도 일반건물 `info` · G-7 취득시 `info`(Q-1 b).
 * - G-8 정상 입력 세액 불변(바닥면적 비움 · 축 B 둘째 지분 양식 비움 포함).
 * - M-1 기준시가 평가 1983 상속 · ① 없음 · 비움 → 엔진 문구(③ 이유 문구 아님) · M-2 시가 평가는 종전 ③ 문구 · M-3 채움 세액 불변.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db/tax-rates", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/db/tax-rates")>();
  return { ...actual, preloadTaxRates: vi.fn() };
});
vi.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true, limit: 30, remaining: 29, resetAt: Date.now() + 60_000 }),
  getClientIp: vi.fn().mockReturnValue("127.0.0.1"),
  shouldBypassRateLimit: vi.fn().mockReturnValue(true),
}));

import { preloadTaxRates } from "@/lib/db/tax-rates";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";
import { allIssues } from "./_helpers/redev-one-house-route";
import { captureBody } from "./_helpers/redev-one-house-route";
import { postTransfer } from "./_helpers/redev-one-house-route";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

type A = Partial<AssetForm> & Record<string, unknown>;
type Body = Record<string, unknown>;

const BG: A = { addressJibun: "서울 강남구 테스트동 1-1", transferType: "burdened_gift", bgDonorRelation: "lineal_descendant", bgValuationMode: "sangjeungbeop_standard" };
const BUY: A = { acquisitionCause: "purchase", acquisitionDate: "2010-03-15" };
const MORT: A = { bgMortgageDebtAmount: "200000000", bgLendingDepositTotal: "0" };
const MKT: A = {
  bgValuationMode: "sangjeungbeop_market", bgMarketValueAtTransfer: "500000000", bgAcquisitionMethod: "actual",
  bgActualAcquisitionTotal: "200000000", bgActualAcquisitionLand: "100000000", bgActualAcquisitionBuilding: "100000000",
};
const GB: A = {
  ...BG, ...BUY, ...MORT, assetKind: "general_building", useEstimatedAcquisition: false, landAcqMode: "actual", buildingAcqMode: "actual",
  gbLandArea: "100", gbBuildingArea: "200", gbBuildingFootprintArea: "50", gbAcqLandPricePerSqm: "1,000,000", gbAcqBuildingValue: "100,000,000", gbZoneType: "general_residential",
  gbTransferLandPricePerSqm: "2,000,000", gbTransferBuildingValue: "200,000,000",
};
const H: A = { ...BG, ...BUY, ...MORT, assetKind: "housing", standardPriceAtTransfer: "400000000", standardPriceAtAcq: "200000000" };
const HALF: A = { ownershipNumerator: "50", ownershipDenominator: "100", addressJibun: "서울 A 1" };
const FRACTIONAL = { assetSplitMode: "fractional", contractTotalPrice: "" };
const INH1983: A = { acquisitionCause: "inheritance", acquisitionDate: "1983-07-26", inheritanceStartDate: "1983-07-26", decedentAcquisitionDate: "1970-01-01" };

const MODES: [string, A][] = [["기준시가", {}], ["시가", MKT]];

function form(assets: A[], extra: Record<string, unknown> = {}): TransferFormData {
  return Object.assign(createDefaultTransferFormData(), {
    transferDate: "2023-02-16", filingDate: "2023-04-30", totalTransferExpense: "0", householdHousingCount: "0", isOneHousehold: false, ...extra,
    assets: assets.map((a, i) => ({ ...makeDefaultAsset(i + 1), ...a }) as AssetForm),
  }) as TransferFormData;
}

/** ⑧을 건너뛰고 ④ body를 보낸다. `edit`로 body를 고치면 API 직접 호출이다. */
async function route(f: TransferFormData, edit?: (b: Body) => void) {
  const body = (await captureBody(f)) as Body;
  edit?.(body);
  const r = await postTransfer(body);
  const data = r.json?.data;
  return {
    status: r.status,
    text: JSON.stringify(r.json),
    fieldErrors: (r.json?.error?.fieldErrors ?? {}) as Record<string, string[]>,
    tax: data?.result?.determinedTax ?? data?.aggregated?.determinedTax,
  };
}

const zeroInfo = (key: string, pick: (b: Body) => unknown) => (b: Body) => {
  (pick(b) as Record<string, number>)[key] = 0;
};
const mainInfo = (b: Body) => b.burdenedGiftInfo;
const shareInfo = (i: number) => (b: Body) => (b.generalBuildingShares as Body[])[i].burdenedGiftInfo;
const companionGbInfo = (b: Body) => (b.companionAssets as Body[]).find((c) => c.assetKind === "general_building")!.burdenedGiftInfo;

describe("G-1~G-4 — 단독 일반건물 · 양도시 기준시가 한쪽 0 → 400", () => {
  for (const [mode, m] of MODES) {
    it(`${mode} · 모양 A(양식 비움) — 토지만·건물만`, async () => {
      const land = await route(form([{ ...GB, ...m, gbTransferLandPricePerSqm: "" }]));
      expect(land.status).toBe(400);
      expect(Object.keys(land.fieldErrors)).toContain("burdenedGiftInfo.landStdPriceAtTransfer");
      const bldg = await route(form([{ ...GB, ...m, gbTransferBuildingValue: "" }]));
      expect(bldg.status).toBe(400);
      expect(Object.keys(bldg.fieldErrors)).toContain("burdenedGiftInfo.buildingStdPriceAtTransfer");
    });
    it(`${mode} · 모양 B(info만 0) — 토지만·건물만`, async () => {
      const land = await route(form([{ ...GB, ...m }]), zeroInfo("landStdPriceAtTransfer", mainInfo));
      expect(Object.keys(land.fieldErrors)).toEqual(["burdenedGiftInfo.landStdPriceAtTransfer"]);
      const bldg = await route(form([{ ...GB, ...m }]), zeroInfo("buildingStdPriceAtTransfer", mainInfo));
      expect(Object.keys(bldg.fieldErrors)).toEqual(["burdenedGiftInfo.buildingStdPriceAtTransfer"]);
    });
  }
});

describe("G-5·G-6 — 지분 분할·함께 양도도 지분·자산의 info를 본다", () => {
  for (const [mode, m] of MODES) {
    it(`G-5 ${mode} · 축 B 지분 info 한쪽 0 → 400`, async () => {
      const f = form([{ ...GB, ...m, ...HALF }, { ...GB, ...m, ...HALF, acquisitionDate: "2012-03-15" }], FRACTIONAL);
      const s1 = await route(f, zeroInfo("landStdPriceAtTransfer", shareInfo(0)));
      expect(Object.keys(s1.fieldErrors)).toEqual(["generalBuildingShares.0.burdenedGiftInfo.landStdPriceAtTransfer"]);
      const s2 = await route(f, zeroInfo("buildingStdPriceAtTransfer", shareInfo(1)));
      expect(Object.keys(s2.fieldErrors)).toEqual(["generalBuildingShares.1.burdenedGiftInfo.buildingStdPriceAtTransfer"]);
    });
    it(`G-6 ${mode} · 함께 양도 일반건물 info 한쪽 0 → 400`, async () => {
      const f = form([{ ...H, ...m }, { ...GB, ...m, addressJibun: "서울 C 3" }]);
      const r = await route(f, zeroInfo("landStdPriceAtTransfer", companionGbInfo));
      expect(Object.keys(r.fieldErrors)).toEqual(["companionAssets.0.burdenedGiftInfo.landStdPriceAtTransfer"]);
    });
  }
});

describe("G-7 — 취득시 기준시가 info 한쪽 0 → 400 (Q-1 b)", () => {
  for (const [mode, m] of MODES) {
    it(`${mode} · 토지만·건물만`, async () => {
      const land = await route(form([{ ...GB, ...m }]), zeroInfo("landStdPriceAtAcquisition", mainInfo));
      expect(Object.keys(land.fieldErrors)).toEqual(["burdenedGiftInfo.landStdPriceAtAcquisition"]);
      const bldg = await route(form([{ ...GB, ...m }]), zeroInfo("buildingStdPriceAtAcquisition", mainInfo));
      expect(Object.keys(bldg.fieldErrors)).toEqual(["burdenedGiftInfo.buildingStdPriceAtAcquisition"]);
    });
  }
});

describe("G-8 — 정상 입력은 세액 그대로", () => {
  const cases: [string, () => TransferFormData, number][] = [
    ["단독 · 기준시가", () => form([GB]), 11_332_800],
    ["단독 · 시가", () => form([{ ...GB, ...MKT }]), 15_605_000],
    ["단독 · 기준시가 · 바닥면적 비움(일반 자산 경로)", () => form([{ ...GB, gbBuildingFootprintArea: "" }]), 11_332_800],
    ["단독 · 시가 · 바닥면적 비움(일반 자산 경로)", () => form([{ ...GB, ...MKT, gbBuildingFootprintArea: "" }]), 15_605_000],
    ["축 B · 기준시가", () => form([{ ...GB, ...HALF }, { ...GB, ...HALF, acquisitionDate: "2012-03-15" }], FRACTIONAL), 11_798_400],
    ["축 B · 시가", () => form([{ ...GB, ...MKT, ...HALF }, { ...GB, ...MKT, ...HALF, acquisitionDate: "2012-03-15" }], FRACTIONAL), 16_445_000],
    ["축 B · 기준시가 · 둘째 지분 양식 칸 비움", () => form([{ ...GB, ...HALF }, { ...GB, ...HALF, acquisitionDate: "2012-03-15", gbTransferLandPricePerSqm: "", gbTransferBuildingValue: "" }], FRACTIONAL), 11_798_400],
    ["함께 양도 · 기준시가", () => form([H, { ...GB, addressJibun: "서울 C 3" }]), 35_289_000],
    ["함께 양도 · 시가", () => form([{ ...H, ...MKT }, { ...GB, ...MKT, addressJibun: "서울 C 3" }]), 48_422_000],
  ];
  for (const [name, make, tax] of cases) {
    it(`${name} → ${tax.toLocaleString()}`, async () => {
      const f = make();
      expect(allIssues(f).filter((i) => !/다른 보유 주택이 없는지|분양권·입주권이 없는지/.test(i.message))).toEqual([]);
      const r = await route(f);
      expect(r.status).toBe(200);
      expect(r.tax).toBe(tax);
    });
  }
});

describe("M-1~M-3 — 기준시가 평가 1983 상속 · ① 없음 · 양도시 기준시가 비움", () => {
  const ENGINE = /기준시가로 평가했는데 양도시 기준시가가 없습니다/;
  const HI: A = { ...H, ...INH1983, standardPriceAtTransfer: "" };
  const cases: [string, A][] = [
    ["주택", HI],
    ["주택 · 의제취득일 기준시가 있음", { ...HI, standardPriceAtDeemedDate: "100000000", inheritedStdPriceAtDeemed: "100000000" }],
    ["토지", { ...HI, assetKind: "land", transferArea: "100", acquisitionArea: "100", standardPricePerSqmAtTransfer: "" }],
  ];
  for (const [name, a] of cases) {
    it(`M-1 ${name} → 엔진 문구(§159①2호) · ③ 이유 문구 없음`, async () => {
      const r = await route(form([a]));
      expect(r.status).toBe(400);
      expect(r.text).toMatch(ENGINE);
      expect(r.fieldErrors["inheritedAcquisition.standardPriceAtTransfer"]).toBeUndefined();
    });
  }
  it("M-2 시가 평가 → 종전 ③ 문구 그대로", async () => {
    const r = await route(form([{ ...HI, ...MKT }]));
    expect(r.status).toBe(400);
    expect(r.fieldErrors["inheritedAcquisition.standardPriceAtTransfer"]?.[0]).toMatch(/환산취득가액은 양도시 기준시가가 필요합니다/);
  });
  it("M-3 채움 → 세액 9,936,000", async () => {
    expect((await route(form([{ ...HI, standardPriceAtTransfer: "400000000" }]))).tax).toBe(9_936_000);
  });
});
