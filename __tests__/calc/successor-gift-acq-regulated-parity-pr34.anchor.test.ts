/**
 * PR-34 anchor (2026-11 리뷰 D-86 · 결정 Q-29 (a)) — 승계조합원 완공APT 증여 승계 통산의 「취득 당시 조정대상지역」 화면 판정을 엔진에 맞춘다.
 *
 * 엔진은 통산이 서면 [세대 보유 시작일, 증여일] 둘 다 지정 중일 때만 거주요건을 건다(`resolveGiftResidenceDates` — Q-29 (a) 현행). 화면(⑤ 자동 판정·⑧ 실효값·
 * Step4 안내·주소 문자열 경로 ④ boolean)은 이 사실을 basis로 읽지 않아 준공일 하나로 판정했다. 서울 마포는 2023.1.5. 해제 · 2025.10.16. 재지정.
 *
 * | # | 시료 | 화면 실효값(수정 후 = 엔진) |
 * |---|---|---|
 * | A1 | 시작 2018 · 인가 2019 · 증여 2020 · 준공 2023-06-01(해제 뒤) | true (종전 false — 준공일 기준) |
 * | A2 | 시작 2023-02 · 인가 2023-03 · 증여 2023-06 · 준공 2025-11-01(재지정 뒤) | false (종전 true) |
 * | A3 | A1에서 같은 세대 「아니오」 — 통산 없음 | 준공일 기준 그대로 |
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeMockRates } from "../tax-engine/_helpers/mock-rates";

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
import { redevAptForm, runCalc } from "./_helpers/redev-one-house-route";
import { calcEffectiveWasRegulatedAtAcquisition, GIFT_HOUSEHOLD_SCOPE_PRIMARY } from "@/lib/calc/effective-regulated-at-acquisition";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});

const MAPO = "1144010100";
function form(d: { start: string; approval: string; gift: string; completion: string; transfer: string }, over: Record<string, unknown> = {}) {
  return redevAptForm({
    kind: "redevelopment_apt",
    price: "1000000000",
    assetOver: {
      acquisitionCause: "gift", acquisitionDate: d.gift, donorAcquisitionDate: d.start, giftDonorRelation: "spouse", regionCode: MAPO,
      residenceInputMode: "direct", residencePeriodMonthsAsset: "6", residencePeriods: [],
      redevApprovalDate: d.approval, redevCompletionDate: d.completion, redevPriorHouseResidenceMonths: "0", redevNewHouseResidenceMonths: "6",
      redevOriginalAssetType: "housing", redevIsSuccessorMember: "yes",
      redevSuccessorGiftSameHousehold: "yes", redevSuccessorGiftDonorHouseMember: "yes", redevSuccessorGiftHouseholdStartDate: d.start,
      fixedAcquisitionPrice: "500000000", redevSettlementDirection: "", redevSettlementAmount: "",
      ...over,
    },
    formOver: { transferDate: d.transfer, filingDate: d.transfer, residencePeriodMonths: "6" } as never,
  });
}
const A1 = { start: "2018-01-01", approval: "2019-06-01", gift: "2020-01-01", completion: "2023-06-01", transfer: "2025-07-01" };
const A2 = { start: "2023-02-01", approval: "2023-03-01", gift: "2023-06-01", completion: "2025-11-01", transfer: "2026-03-02" };
const screen = (f: ReturnType<typeof form>) =>
  calcEffectiveWasRegulatedAtAcquisition(f.assets[0] as AssetForm, undefined, undefined, GIFT_HOUSEHOLD_SCOPE_PRIMARY);

describe("D-86 화면 「취득 당시 조정대상지역」 = 엔진 plan", () => {
  it("A1 — 화면 true · 엔진도 거주요건(6개월 미달)으로 과세", async () => {
    expect(screen(form(A1))).toBe(true);
    const r = await runCalc(form(A1));
    expect(r.issues).toEqual([]);
    expect(r.result.isExempt).toBe(false);
  });
  it("A2 — 화면 false · 엔진도 비과세", async () => {
    // 거주 0개월(리뷰 시료) — 준공 뒤 4개월이라 6개월은 보유기간을 넘는다.
    const f = form(A2, { residencePeriodMonthsAsset: "0", redevNewHouseResidenceMonths: "0" });
    expect(screen(f)).toBe(false);
    const r = await runCalc(f);
    expect(r.issues).toEqual([]);
    expect(r.result.isExempt).toBe(true);
  });
  it("A3 대조 — 같은 세대 「아니오」면 통산이 없어 준공일 기준(해제 뒤) false", () => {
    expect(screen(form(A1, { redevSuccessorGiftSameHousehold: "no", redevSuccessorGiftDonorHouseMember: "", redevSuccessorGiftHouseholdStartDate: "" }))).toBe(false);
  });
});
