/**
 * 일반건물 부담부증여 남은 별건 (계획서 `docs/02-design/features/bg-gb-residuals.plan.md`).
 *
 * - D-1 바닥면적 비움 → ⑧이 칸을 짚는다(종전: 통과 → 일반 자산 경로 → 토지 별도 취득일 소실).
 * - D-2 ⑧ 우회 · 바닥면적 비움 → ⑫ `generalBuildingValuation` 400 — 단독 · 함께 양도 · 축 B 첫 지분(본문이 컴패니언 모양이 된다).
 * - D-3 채운 시료 세액 — 토지 별도 취득일이 반영된 일반건물 경로 값.
 * - D-4 축 B(지분 2개 이상)는 최상위 값 묶음이 없어도 통과 — route가 지분 배열만 읽는다(리뷰 게이트 지적).
 * - C-1 기준시가 평가 · 1983 상속 · 의제취득일 기준시가 없음 → 엔진 문구(§159①1호 괄호) · C-2 시가 평가는 종전 ⑫ 문구.
 * - C-3 입주권은 제외하지 않는다 — 입주권 × 부담부증여 × 1985 전은 차단 유지(Q-30).
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
const SEP: A = { hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2021-06-01" };
const H: A = { ...BG, ...BUY, ...MORT, assetKind: "housing", standardPriceAtTransfer: "400000000", standardPriceAtAcq: "200000000" };
const HALF: A = { ownershipNumerator: "50", ownershipDenominator: "100", addressJibun: "서울 A 1" };
const FRACTIONAL = { assetSplitMode: "fractional", contractTotalPrice: "" };
const INH1983: A = { acquisitionCause: "inheritance", acquisitionDate: "1983-07-26", inheritanceStartDate: "1983-07-26", decedentAcquisitionDate: "1970-01-01" };
const NO_FP: A = { gbBuildingFootprintArea: "" };

function form(assets: A[], extra: Record<string, unknown> = {}): TransferFormData {
  return Object.assign(createDefaultTransferFormData(), {
    transferDate: "2023-02-16", filingDate: "2023-04-30", totalTransferExpense: "0", householdHousingCount: "0", isOneHousehold: false, ...extra,
    assets: assets.map((a, i) => ({ ...makeDefaultAsset(i + 1), ...a }) as AssetForm),
  }) as TransferFormData;
}

/** 1세대 판정 확인란 안내는 이 결함과 무관하다 — 빼고 본다. */
const issues = (f: TransferFormData) => allIssues(f).filter((i) => !/다른 보유 주택이 없는지|분양권·입주권이 없는지/.test(i.message));

/** ⑧을 건너뛰고 ④ body를 보낸다(API 직접 호출과 같다). */
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

describe("D-1 — 바닥면적 비움 → ⑧이 칸을 짚는다", () => {
  for (const [mode, m] of [["기준시가", {}], ["시가", MKT]] as [string, A][]) {
    it(`${mode} · 단독`, () => {
      const first = issues(form([{ ...GB, ...m, ...SEP, ...NO_FP }]))[0];
      expect(first?.field).toBe("gbBuildingFootprintArea");
    });
  }
  it("축 B 첫 지분 · 함께 양도 일반건물도 그 자산을 짚는다", () => {
    const axisB = issues(form([{ ...GB, ...HALF, ...NO_FP }, { ...GB, ...HALF, acquisitionDate: "2012-03-15" }], FRACTIONAL))[0];
    expect(axisB?.field).toBe("gbBuildingFootprintArea");
    const comp = issues(form([H, { ...GB, ...NO_FP, addressJibun: "서울 C 3" }]))[0];
    expect(comp?.field).toBe("gbBuildingFootprintArea");
    expect(comp?.message).toMatch(/^자산 2:/);
  });
});

describe("D-2 — ⑧ 우회 · 바닥면적 비움 → ⑫가 일반건물 값을 요구 (종전 200 · 토지 별도 취득일 소실)", () => {
  it("단독 — 기준시가·시가", async () => {
    for (const m of [{}, MKT]) {
      const r = await route(form([{ ...GB, ...m, ...SEP, ...NO_FP }]));
      expect(r.status).toBe(400);
      expect(Object.keys(r.fieldErrors)).toEqual(["generalBuildingValuation"]);
    }
  });
  it("함께 양도 일반건물", async () => {
    const r = await route(form([H, { ...GB, ...SEP, ...NO_FP, addressJibun: "서울 C 3" }]));
    expect(Object.keys(r.fieldErrors)).toEqual(["companionAssets.0.generalBuildingValuation"]);
  });
  it("축 B 첫 지분 비움 — 본문이 컴패니언 모양(주 자산 + 컴패니언, 둘 다 값 묶음 없음)이 되어 두 경로 모두 막힌다", async () => {
    const f = form([{ ...GB, ...SEP, ...HALF, ...NO_FP }, { ...GB, ...SEP, ...HALF, acquisitionDate: "2012-03-15", ...NO_FP }], FRACTIONAL);
    const r = await route(f);
    expect(r.status).toBe(400);
    expect(Object.keys(r.fieldErrors).sort()).toEqual(["companionAssets.0.generalBuildingValuation", "generalBuildingValuation"]);
  });
});

describe("D-4 — 축 B는 최상위 값 묶음 없이도 통과", () => {
  it("정상 축 B 요청에서 최상위 generalBuildingValuation만 지움 → 200 · 22,814,500(지운 것과 같은 세액)", async () => {
    const f = form([{ ...GB, ...SEP, ...HALF }, { ...GB, ...SEP, ...HALF, acquisitionDate: "2012-03-15" }], FRACTIONAL);
    const r = await route(f, (b) => {
      expect((b.generalBuildingShares as unknown[]).length).toBe(2);
      delete b.generalBuildingValuation;
    });
    expect(r.status).toBe(200);
    expect(r.tax).toBe(22_814_500);
  });
});

describe("D-3 — 채운 시료는 일반건물 경로 세액 그대로", () => {
  const cases: [string, () => TransferFormData, number][] = [
    ["단독 · 기준시가", () => form([GB]), 11_332_800],
    ["단독 · 시가", () => form([{ ...GB, ...MKT }]), 15_605_000],
    ["단독 · 기준시가 · 토지 2021 취득", () => form([{ ...GB, ...SEP }]), 22_669_000],
    ["단독 · 시가 · 토지 2021 취득", () => form([{ ...GB, ...MKT, ...SEP }]), 28_580_000],
    ["함께 양도 · 토지 2021 취득", () => form([H, { ...GB, ...SEP, addressJibun: "서울 C 3" }]), 41_663_000],
    ["축 B · 토지 2021 취득", () => form([{ ...GB, ...SEP, ...HALF }, { ...GB, ...SEP, ...HALF, acquisitionDate: "2012-03-15" }], FRACTIONAL), 22_814_500],
  ];
  for (const [name, make, tax] of cases) {
    it(`${name} → ${tax.toLocaleString()}`, async () => {
      const f = make();
      expect(issues(f)).toEqual([]);
      const r = await route(f);
      expect(r.status).toBe(200);
      expect(r.tax).toBe(tax);
    });
  }
});

describe("C-1·C-2 — 1983 상속 · ① 없음 · 의제취득일 기준시가 없는 요청", () => {
  const HI: A = { ...H, ...INH1983 };
  const dropDeemed = (b: Body) => {
    delete (b.inheritedAcquisition as Body).standardPriceAtDeemedDate;
  };
  const ENGINE = /기준시가로 평가해 부담부증여하면 .*의제취득일 기준시가를 입력하세요/;
  it("C-1 기준시가 평가 — ① 없음·있음 모두 엔진 문구(§159①1호 괄호) · ⑫ 「취득가액 원천」 문구 없음", async () => {
    for (const a of [HI, { ...HI, publishedValueAtInheritance: "150000000" }]) {
      const r = await route(form([a]), dropDeemed);
      expect(r.status).toBe(400);
      expect(r.text).toMatch(ENGINE);
      expect(r.fieldErrors["inheritedAcquisition.reportedValue"]).toBeUndefined();
    }
  });
  it("C-1 대조 — 채운 요청 세액 9,936,000", async () => {
    expect((await route(form([HI]))).tax).toBe(9_936_000);
  });
  it("C-3 입주권(`redevelopment` 없는 API 직접 요청)은 종전 ⑫ 문구로 막는다 — Q-30 차단 유지", async () => {
    const r = await route(form([HI]), (b) => {
      dropDeemed(b);
      b.propertyType = "right_to_move_in";
    });
    expect(r.status).toBe(400);
    expect(r.fieldErrors["inheritedAcquisition.reportedValue"]?.[0]).toMatch(/취득가액 원천이 필요합니다/);
  });
  it("C-2 시가 평가 — 종전 ⑫ 「취득가액 원천」 문구 그대로", async () => {
    const r = await route(form([{ ...HI, ...MKT }]), dropDeemed);
    expect(r.status).toBe(400);
    expect(r.fieldErrors["inheritedAcquisition.reportedValue"]?.[0]).toMatch(/취득가액 원천이 필요합니다/);
  });
});
