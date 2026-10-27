/**
 * 이월과세 × 증여자 취득가액 모름 × §164⑦ PHD·APD 환산 — 시나리오 A가 3시점 환산을 쓴다(화면 경로). 계획서 `docs/02-design/features/carryover-phd-owner-split-residuals.plan.md` PHD-1.
 *
 * 수정 전: 이월과세는 매매 블록(취득가액 산정 방식)을 렌더하지 않아 `useEstimatedAcquisition` false · PHD 토글(`usePreHousingDisclosure`)을 일부러 켜지 않아
 * 토지 취득일 후퇴도 없었다 → 엔진의 단건 PHD 경로(`phdSplitPathTaken`)에 닿지 않아 A 취득가액 0 — 양도차익 = 양도가액(12억 · 건물만 7.2억 · 토지만 4.8억).
 * 결과 화면은 A 취득가액을 PHD 환산값(298,136,645)으로 적어 오류가 가려졌다. 엔진 대조(매매 PHD 같은 날짜)는 `carryover-estimated-donor-reestimate.anchor.test.ts` R6.
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
import { ESTIMATED, runOwnerSplit } from "../calc/_helpers/carryover-owner-split-form";
import { ownerSplitForm } from "../calc/_helpers/carryover-owner-split-form";

vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates() as never);

type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** 증여자 2000-01-01 취득(최초 고시 2005-04-30 전) · PHD 11칸 */
const PHD = {
  phdFirstDisclosureDate: "2005-04-30", phdFirstDisclosureHousingPrice: "400,000,000", phdLandAreaSqm: "100", phdLandPricePerSqmAtAcq: "1,000,000",
  phdBuildingStdPriceAtAcq: "100,000,000", phdLandPricePerSqmAtFirst: "1,200,000", phdBuildingStdPriceAtFirst: "110,000,000",
  phdTransferHousingPrice: "1,400,000,000", phdLandPricePerSqmAtTransfer: "5,600,000", phdBuildingStdPriceAtTransfer: "840,000,000",
};
const asset = (mode: "phd" | "apd", selfOwns: string, gift = "0"): Loose => ({
  ...ESTIMATED, ...PHD, selfOwns,
  carryover: { ...ESTIMATED.carryover, estimationMode: mode, donorAcquisitionDate: "2000-01-01", giftTaxCalculated: gift, giftTaxAmount: gift },
});

async function run(a: Loose) {
  const { status, result } = await runOwnerSplit(a);
  const ct = result?.carryoverTaxationDetail as Loose | undefined;
  return { issues: allIssues(ownerSplitForm(a)).map((i) => i.field), status, adopted: ct?.adoptedScenario, gain: result?.transferGain as number, split: result?.splitDetail as Loose | undefined, a: ct?.scenarioA as Loose };
}

describe.each(["phd", "apd"] as const)("%s 환산 donor — 시나리오 A 취득가액이 0이 아니다", (mode) => {
  it.each([
    ["both", 891_428_573, 871_428_573],
    ["building_only", 565_714_286, 545_714_286],
    ["land_only", 325_714_287, 305_714_287],
  ] as const)("%s — 양도차익 %d(수정 전 양도가액 전액) · 증여세 2천만 %d", async (owns, gain, giftGain) => {
    const r = await run(asset(mode, owns));
    expect([r.issues, r.status, r.adopted, r.gain]).toEqual([[], 200, "A", gain]);
    expect(r.split).toBeTruthy();
    expect(r.a.acquisitionPrice).toBe(298_136_645);
    const g = await run(asset(mode, owns, "20,000,000"));
    expect([g.status, g.adopted, g.gain, g.a.giftTaxAddedToExpense]).toEqual([200, "A", giftGain, 20_000_000]);
  });

  it("소유자 분리 — 본인 파트 환산취득가액 = PHD 파트 값(두 파트 합 = A 총 환산취득가액) · 증여세가 있어도 분리 상세 유지", async () => {
    const b = await run(asset(mode, "building_only", "20,000,000"));
    const l = await run(asset(mode, "land_only"));
    expect(b.split?.building.directExpenses).toBe(20_000_000);
    expect(b.a.ownerSplitPart.acquisitionPrice + l.a.ownerSplitPart.acquisitionPrice).toBe(298_136_645);
  });
});

/**
 * F1(사용자 결정 「차단·안내」) — 3시점 분리 경로는 파트 칸만 읽고 자산 단위 자본적지출·증여자 자본적지출을 읽지 않는다. 자동 안분 없이 ⑧·⑫가 같이 막는다.
 * 수정 전 실측: 소유자 같음 자본적지출 4억(수증자·증여자 어느 쪽이든) → A 양도차익 891,428,573 그대로(일반 환산 대조는 §97②2호 단서로 800,000,000).
 */
describe("F1 PHD 환산 이월과세 × 자본적지출 — ⑧·⑫ 차단", () => {
  const withCapex = (owns: string, recip: string, donor: string, part: Loose = {}): Loose => {
    const b = asset("phd", owns);
    return { ...b, ...part, capitalExpenditure: recip, carryover: { ...b.carryover, donorCapitalExpenditure: donor } };
  };
  const zodKeys = async (a: Loose) => {
    const { captureBody } = await import("../calc/_helpers/redev-one-house-route");
    const { postTransfer } = await import("../calc/_helpers/redev-one-house-route");
    const r = await postTransfer((await captureBody(ownerSplitForm(a))) as Loose);
    return { status: r.status, zod: Object.keys((r.json as Loose)?.error?.fieldErrors ?? {}) };
  };

  it.each([
    ["소유자 같음 · 증여자 자본적지출", "both", "", "400,000,000", "carryover.donorCapitalExpenditure", "carryoverTaxation.donorCapitalExpenditure"],
    ["소유자 같음 · 자산 전체 자본적지출", "both", "400,000,000", "", "capitalExpenditure", "capitalExpenditure"],
    ["건물만 · 증여자 자본적지출", "building_only", "", "400,000,000", "carryover.donorCapitalExpenditure", "carryoverTaxation.donorCapitalExpenditure"],
  ] as const)("%s → ⑧ %s · ⑫ 400", async (_n, owns, recip, donor, field, zod) => {
    const a = withCapex(owns, recip, donor);
    expect(allIssues(ownerSplitForm(a)).map((i) => i.field)).toEqual([field]);
    const z = await zodKeys(a);
    expect(z.status).toBe(400);
    expect(z.zod).toContain(zod);
  });

  it("건물만 · 건물분 자본적지출 칸 4억 → 통과 · 3시점 경로가 읽어 §97②2호 단서(건물 양도차익 720,000,000 − 400,000,000)", async () => {
    const a = withCapex("building_only", "400,000,000", "", { buildingDirectExpenses: "400,000,000" });
    const r = await run(a);
    expect([r.issues, r.status]).toEqual([[], 200]);
    expect([r.split?.building.swapApplied, r.split?.building.gain]).toEqual([true, 320_000_000]);
  });

  it("일반 기준시가 환산 이월과세는 영향 없음 — 자본적지출 4억 → 800,000,000(§97②2호 단서)", async () => {
    const r = await run({ ...ESTIMATED, selfOwns: "both", capitalExpenditure: "400,000,000" });
    expect([r.issues, r.status, r.gain]).toEqual([[], 200, 800_000_000]);
  });
});
