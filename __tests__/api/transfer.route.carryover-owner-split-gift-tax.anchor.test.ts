/**
 * 이월과세 × 소유자 분리 — 증여세 상당액(소득세법 §97의2①3호) 경로. 계획서 `docs/02-design/features/carryover-owner-split-display-gift-tax.plan.md` V-5 · Q-2 (a).
 *
 * 영 §163의2②: 증여세 상당액 = 증여세 산출세액 × 「양도한 해당 자산가액」 ÷ 증여세 과세가액 — 소유자 분리에서 양도한 자산은 본인 파트뿐이라 전액이 그 파트의 필요경비다.
 * 수정 전(mock 세율):
 *  · V-5b 증여자 취득가액 앎 — 증여세 상당액을 양도비처럼 양도가액 비율로 파트에 나눠 비소유 파트 몫이 버려졌다(2천만 중 1,200만만 차감 · 540,000,000 → 528,000,000).
 *  · V-5a 환산 — A를 실가로 바꿔 다시 계산해 분리 상세(splitDetail)가 사라졌다(세액은 맞음).
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
import { ESTIMATED, KNOWN, withGift, runOwnerSplit } from "../calc/_helpers/carryover-owner-split-form";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

async function run(a: Loose) {
  const { form, status, result: res } = await runOwnerSplit(a);
  const ct = res?.carryoverTaxationDetail as Loose | undefined;
  return {
    issues: allIssues(form).map((i) => i.field),
    status,
    gain: res?.transferGain as number | undefined,
    split: res?.splitDetail as Loose | undefined,
    adopted: ct?.adoptedScenario as string | undefined,
    scenarioA: ct?.scenarioA as Loose | undefined,
    scenarioB: ct?.scenarioB as Loose | undefined,
  };
}

describe("V-5b 증여자 취득가액 앎 — 증여세 상당액 전액이 본인 파트 필요경비", () => {
  it.each([
    ["building_only", "building", 540_000_000, 520_000_000],
    ["land_only", "land", 360_000_000, 340_000_000],
  ] as const)("%s — 증여세 0이면 %s 파트 양도차익 %d, 2천만이면 %d(수정 전 비율만큼만 차감)", async (owns, part, before, after) => {
    const r0 = await run({ ...KNOWN, selfOwns: owns });
    expect([r0.issues, r0.status, r0.adopted, r0.gain]).toEqual([[], 200, "A", before]);
    const r = await run({ ...withGift(KNOWN, "20,000,000"), selfOwns: owns });
    expect([r.issues, r.status, r.adopted, r.gain]).toEqual([[], 200, "A", after]);
    expect(r.split?.[part].directExpenses).toBe(20_000_000);
    expect([r.scenarioA?.giftTaxAddedToExpense, r.scenarioA?.transferGain]).toEqual([20_000_000, after]);
  });

  it("소유자 같음(대조) — 880,000,000 그대로(자산 단위 경로)", async () => {
    const r = await run({ ...withGift(KNOWN, "20,000,000"), selfOwns: "both" });
    expect([r.issues, r.status, r.adopted, r.gain]).toEqual([[], 200, "A", 880_000_000]);
  });

  it("한도 — 증여세 상당액이 본인 파트 양도차익보다 크면 그 양도차익까지(건물만 540,000,000 → 0)", async () => {
    const r = await run({ ...withGift(KNOWN, "600,000,000"), selfOwns: "building_only" });
    expect([r.issues, r.status]).toEqual([[], 200]);
    expect([r.scenarioA?.giftTaxLimitCap, r.scenarioA?.giftTaxAddedToExpense, r.scenarioA?.giftTaxLimitApplied, r.scenarioA?.transferGain]).toEqual([540_000_000, 540_000_000, true, 0]);
  });
});

describe("V-5a 증여자 취득가액 모름(환산) — 실가로 바꾸지 않고 분리 계산을 유지한다", () => {
  it.each([
    ["building_only", "building", 560_314_286, 540_314_286, 154_285_714],
    ["land_only", "land", 373_542_858, 353_542_858, 102_857_142],
  ] as const)("%s — 분리 상세가 남고 %s 파트에 증여세 상당액이 들어간다", async (owns, part, before, after, acq) => {
    const r0 = await run({ ...ESTIMATED, selfOwns: owns });
    expect([r0.issues, r0.status, r0.adopted, r0.gain]).toEqual([[], 200, "A", before]);
    const r = await run({ ...withGift(ESTIMATED, "20,000,000"), selfOwns: owns });
    expect([r.issues, r.status, r.adopted, r.gain]).toEqual([[], 200, "A", after]);
    expect([r.split?.[part].acqMode, r.split?.[part].acquisitionPrice, r.split?.[part].directExpenses]).toEqual(["estimated", acq, 20_000_000]);
  });
});

describe("시나리오 본인 파트 echo(ownerSplitPart) — 채택되지 않은 시나리오 카드도 본인 파트 양도가액·취득가액을 적는다(V-4·V-1)", () => {
  it("B 채택(증여자 취득가액 10억) — A 카드: 7.2억 · 6억 · 1.2억(수정 전 양도 12억 · 취득 10억)", async () => {
    const r = await run({ ...KNOWN, selfOwns: "building_only", carryover: { ...KNOWN.carryover, donorAcquisitionPrice: "1,000,000,000" } });
    expect([r.issues, r.status, r.adopted]).toEqual([[], 200, "B"]);
    expect([r.scenarioA?.ownerSplitPart, r.scenarioA?.transferGain]).toEqual([{ transferPrice: 720_000_000, acquisitionPrice: 600_000_000 }, 120_000_000]);
    expect([r.scenarioB?.ownerSplitPart, r.scenarioB?.transferGain]).toEqual([{ transferPrice: 720_000_000, acquisitionPrice: 540_000_000 }, 180_000_000]);
  });

  it("A 채택 — B 카드: 7.2억 · 5.4억 · 1.8억(수정 전 취득 9억) · A 카드: 7.2억 · 1.8억 · 5.4억", async () => {
    const r = await run({ ...KNOWN, selfOwns: "building_only" });
    expect([r.issues, r.status, r.adopted]).toEqual([[], 200, "A"]);
    expect(r.scenarioA?.ownerSplitPart).toEqual({ transferPrice: 720_000_000, acquisitionPrice: 180_000_000 });
    expect([r.scenarioB?.ownerSplitPart, r.scenarioB?.transferGain]).toEqual([{ transferPrice: 720_000_000, acquisitionPrice: 540_000_000 }, 180_000_000]);
  });

  it("소유자 같음 — echo 없음(자산 전체 값이 곧 신고 단위)", async () => {
    const r = await run({ ...KNOWN, selfOwns: "both" });
    expect([r.status, r.scenarioA?.ownerSplitPart, r.scenarioB?.ownerSplitPart]).toEqual([200, undefined, undefined]);
  });
});
