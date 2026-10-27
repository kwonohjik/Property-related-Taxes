/**
 * 합산 신고(함께 양도) 자산별 표시 echo — 이월과세 × 소유자 분리는 본인 파트 값이다. 계획서 `docs/02-design/features/carryover-phd-owner-split-residuals.plan.md` V-2.
 *
 * 수정 전: 이월과세 채택값이 있으면 분리 합을 꺼(`transfer-tax-aggregate-display-echo.ts`) 양도가액 일괄 총액 · 취득가액 자산 전체 · 필요경비 역산을 썼다
 * (건물만 850,000,000 · 300,000,000 · 220,000,000 · B 채택이면 필요경비 −20,000,000). 표시 전용 — 세액 불변.
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
import { ESTIMATED, KNOWN, withGift } from "../calc/_helpers/carryover-owner-split-form";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { createDefaultTransferFormData, type TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const HH = {
  transferDate: "2025-06-30", filingDate: "2025-08-31", totalTransferExpense: "0", householdHousingCount: "0", isOneHousehold: false,
  householdNoOtherHousesConfirmed: true, householdNoPresaleRightsConfirmed: true,
};
/** 1번 자산 = 이월과세 소유자 같음(5억) · 2번 자산 = 시료. 일괄 17억 → 2번 자산 일괄 양도가액 850,000,000 */
async function second(a: Loose) {
  const f = Object.assign(createDefaultTransferFormData(), {
    ...HH, contractTotalPrice: "1700000000",
    assets: [
      { ...makeDefaultAsset(1), ...KNOWN, selfOwns: "both", actualSalePrice: "500,000,000", carryover: { ...KNOWN.carryover, donorAcquisitionPrice: "100,000,000" } } as AssetForm,
      { ...makeDefaultAsset(2), ...a } as AssetForm,
    ],
  }) as TransferFormData;
  const r = await postTransfer((await captureBody(f)) as Loose);
  const p = (r.json as Loose)?.data?.aggregated?.properties?.[1] as Loose | undefined;
  return { issues: allIssues(f).map((i) => i.field), status: r.status, p };
}

describe("V-2 합산 echo — 이월과세 × 소유자 분리 = 본인 파트", () => {
  it.each([
    ["건물만 · 실가 · A 채택", { ...KNOWN, selfOwns: "building_only" }, "A", [510_000_000, 180_000_000, 0, 330_000_000]],
    ["건물만 · 실가 · 증여세 2천만", { ...withGift(KNOWN, "20,000,000"), selfOwns: "building_only" }, "A", [510_000_000, 180_000_000, 20_000_000, 310_000_000]],
    ["토지만 · 실가", { ...KNOWN, selfOwns: "land_only" }, "A", [340_000_000, 120_000_000, 0, 220_000_000]],
    ["건물만 · B 채택(증여자 10억) — 수정 전 필요경비 −20,000,000", { ...KNOWN, selfOwns: "building_only", carryover: { ...KNOWN.carryover, donorAcquisitionPrice: "1,000,000,000" } }, "B", [510_000_000, 540_000_000, 0, -30_000_000]],
  ] as const)("%s", async (_n, a, adopted, [tp, acq, exp, gain]) => {
    const { issues, status, p } = await second(a);
    expect([issues, status, p?.carryoverTaxationDetail?.adoptedScenario]).toEqual([[], 200, adopted]);
    expect([p?.transferPrice, p?.acquisitionPrice, p?.necessaryExpense, p?.transferGain]).toEqual([tp, acq, exp, gain]);
    expect(p!.transferPrice - p!.acquisitionPrice - p!.necessaryExpense).toBe(p!.transferGain);
  });

  it("건물만 · 환산 — 본인 파트 환산취득가액·개산공제(등식 성립)", async () => {
    const { status, p } = await second({ ...ESTIMATED, selfOwns: "building_only" });
    expect(status).toBe(200);
    expect([p?.transferPrice, p?.acquisitionPrice]).toEqual([510_000_000, p?.carryoverTaxationDetail?.scenarioA?.ownerSplitPart?.acquisitionPrice]);
    expect(p!.transferPrice - p!.acquisitionPrice - p!.necessaryExpense).toBe(p!.transferGain);
  });

  it("소유자 같음(대조) — 종전 이월과세 채택값(850,000,000 · 300,000,000 · 0)", async () => {
    const { status, p } = await second({ ...KNOWN, selfOwns: "both" });
    expect([status, p?.transferPrice, p?.acquisitionPrice, p?.necessaryExpense]).toEqual([200, 850_000_000, 300_000_000, 0]);
  });
});
