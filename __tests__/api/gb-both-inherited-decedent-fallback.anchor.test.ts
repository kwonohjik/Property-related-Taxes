/**
 * anchor — 일반건물 · 분리 ON · 토지·건물 모두 상속 · 「건물 피상속인 취득일」 비움: 엔진이 건물에 대신 쓰는
 * 토지의 피상속인 취득일도 건물 상속개시일보다 앞서야 한다(⑧·⑫). 계획서
 * `docs/02-design/features/gb-both-inherited-decedent-fallback.plan.md`. 세율 mock — 정본 세액 아님.
 *
 * 종전: 같은 날짜를 건물 칸에 직접 쓰면 #2923 검사가 막지만, 비우면 ⑧·⑫를 통과해 엔진이 그 날로 세율을 판정했다.
 */
import { describe, expect, it, vi } from "vitest";

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
import { allIssues } from "../calc/_helpers/redev-one-house-route";
import { captureBody } from "../calc/_helpers/redev-one-house-route";
import { postTransfer } from "../calc/_helpers/redev-one-house-route";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const TOTAL = "1200000000";
const form = (a: Loose): TransferFormData =>
  Object.assign(createDefaultTransferFormData(), {
    transferDate: "2026-06-30", filingDate: "2026-08-31", contractTotalPrice: TOTAL, totalTransferExpense: "0", householdHousingCount: "0",
    householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true, isOneHousehold: false,
    assets: [{ ...makeDefaultAsset(1), addressJibun: "서울 강남구 테스트동 1-1", actualSalePrice: TOTAL, ...a }] as AssetForm[],
  }) as TransferFormData;
const GB: Loose = {
  assetKind: "general_building", gbLandArea: "200", gbBuildingArea: "300", gbBuildingFootprintArea: "100", gbZoneType: "general_residential",
  gbTransferLandPricePerSqm: "5000000", gbTransferBuildingValue: "300000000", gbAcqLandPricePerSqm: "2000000", gbAcqBuildingValue: "150000000", fixedAcquisitionPrice: "",
};
/** 분리 ON · 건물 상속개시일 B · 토지 상속개시일 L · 토지 피상속인 D · 건물 피상속인 bd(비우면 엔진이 D를 건물에 쓴다) */
const BOTH = (B: string, L: string, D: string, bd: string) => ({ ...GB, hasSeperateLandAcquisitionDate: true, acquisitionCause: "inheritance",
  gbBuildingAcquisitionCause: "inheritance", acquisitionDate: B, landAcquisitionDate: L, inheritanceStartDate: L, decedentAcquisitionDate: D,
  gbBuildingDecedentAcquisitionDate: bd, publishedValueAtInheritance: "500000000", gbBuildingInheritedValue: "200000000", landAcqMode: "actual", buildingAcqMode: "actual" });

async function run(a: Loose) {
  const f = form(a);
  const r = await postTransfer((await captureBody(f)) as Loose);
  return {
    issues: allIssues(f).map((i) => [i.field ?? null, i.message]),
    status: r.status,
    fieldErrors: (r.json?.error?.fieldErrors ?? {}) as Record<string, string[]>,
    tax: (r.json?.data?.aggregated as Loose | undefined)?.determinedTax as number | undefined,
  };
}
const MSG8 = "자산: 토지의 피상속인 취득일이 건물 상속개시일보다 늦어 건물에 쓸 수 없습니다. 건물 피상속인 취득일을 따로 입력하세요.";
const MSG12 = "토지의 피상속인 취득일이 건물 상속개시일보다 늦어 건물에 쓸 수 없습니다. 건물 피상속인 취득일을 따로 입력하세요";
const KEY12 = "generalBuildingValuation.buildingDecedentAcquisitionDate";

describe("Q-1 토지 값 대체 — 건물 상속개시일보다 늦으면 ⑧·⑫ 차단", () => {
  it.each([
    ["F2 건물 2025-01-01 · 토지 2026-01-01 · 토지 피상속인 2025-06-01", BOTH("2025-01-01", "2026-01-01", "2025-06-01", "")],
    ["F5 건물 2010-01-01 · 토지 2024-01-10 · 토지 피상속인 2015-01-01", BOTH("2010-01-01", "2024-01-10", "2015-01-01", "")],
    // 경계 — 토지 피상속인 취득일 = 건물 상속개시일(같은 날도 「이전」이 아니다)
    ["F8 건물 2025-01-01 · 토지 2026-01-01 · 토지 피상속인 2025-01-01(같은 날)", BOTH("2025-01-01", "2026-01-01", "2025-01-01", "")],
  ])("%s · 건물 칸 비움 → 차단(종전 통과)", async (_n, a) => {
    const r = await run(a);
    expect(r.issues).toEqual([["gbBuildingDecedentAcquisitionDate", MSG8]]);
    expect(r.status).toBe(400);
    expect(r.fieldErrors[KEY12]).toEqual([MSG12]);
  });
  it.each([
    ["F1 같은 날 상속 · 토지 피상속인 2000 · 비움", BOTH("2025-01-01", "2025-01-01", "2000-01-01", ""), 173_060_000],
    ["F3 F2 + 건물 피상속인 2024-12-31 직접", BOTH("2025-01-01", "2026-01-01", "2025-06-01", "2024-12-31"), 199_000_000],
    ["F4 F2 + 건물 피상속인 2000 직접", BOTH("2025-01-01", "2026-01-01", "2025-06-01", "2000-01-01"), 180_932_307],
    ["F6 F5 + 건물 피상속인 2005 직접", BOTH("2010-01-01", "2024-01-10", "2015-01-01", "2005-01-01"), 163_829_230],
    ["F7 토지 값이 건물보다 앞섬(다른 날 상속) · 비움", BOTH("2025-01-01", "2026-01-01", "2000-01-01", ""), 173_060_000],
  ])("%s → 통과 · 세액 불변", async (_n, a, tax) => {
    const r = await run(a);
    expect(r.issues).toEqual([]);
    expect(r.status).toBe(200);
    expect(r.tax).toBe(tax);
  });
  it("대조 — 같은 날 상속에서 토지 피상속인 ≥ 상속개시일은 종전 토지 검사 하나만(새 문구 중복 없음)", async () => {
    const r = await run(BOTH("2025-01-01", "2025-01-01", "2025-01-01", ""));
    expect(r.issues).toEqual([["decedentAcquisitionDate", "자산: 피상속인 취득일은 상속개시일보다 이전이어야 합니다."]]);
    expect(r.status).toBe(400);
    expect(r.fieldErrors[KEY12]).toBeUndefined();
  });
});
