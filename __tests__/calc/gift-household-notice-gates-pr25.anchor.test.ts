/**
 * PR-25 anchor (2026-11 리뷰 D-52 · D-53 · D-62 · I-24) — 증여 세대 고지.
 *
 * | # | 결함 | 주장 |
 * |---|---|---|
 * | D-52 | 통산 시작일(혼인·합가 전 취득분) 축이 고지 게이트에 없음 | 시작일을 증여자 취득일로 바꾼 판정이 다르면 확인 필요 고지 · 같으면 없음 |
 * | D-53 | 이월과세 A 채택 비과세에서 세대 통산이 §97의2②2호로 결론을 가르는데 계산기 고지 없음 | B 계산의 세대 고지를 이월과세 전용 문장으로 승계 |
 * | D-62 | A(보유기간 = 증여자 취득일)의 고지가 「증여일부터 보유기간」으로 단정 | `holdingAlreadyAtDonor`로 문장을 가른다(고지 4종 + 표2 미답 분기) |
 * | I-24 | 「그 밖의 친족」 질문에 1세대 범위 안내 없음 | §88 6호 범위를 덧붙인다 · 배우자·직계는 그대로 |
 *
 * 공통: 증여자 취득 2010-03-01 · 증여 2025-06-01 · 양도 2026-02-16 · 9억 · 비조정.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeMockRates, baseTransferInput } from "../tax-engine/_helpers/mock-rates";
vi.mock("@/lib/db/tax-rates", async (o) => ({ ...(await o<typeof import("@/lib/db/tax-rates")>()), preloadTaxRates: vi.fn() }));
import { preloadTaxRates } from "@/lib/db/tax-rates";
import { runCalc } from "./_one-house-pr3a-calc-route";
import { runJudgment } from "./_one-house-pr6a-routes";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import { createInitialOneHouseJudgmentForm, type OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";
import {
  CARRYOVER_B_GIFT_HOUSEHOLD_REASON,
  GIFT_HOUSEHOLD_CONSOLIDATION_DETAIL_ID,
  giftHouseholdNotice,
} from "@/lib/tax-engine/one-house/gift-household-notice";
import { giftTable2PriorResidenceNotice } from "@/lib/tax-engine/one-house/gift-table2-notice";
import { giftHouseholdQuestionText } from "@/lib/calc/gift-household-payload";
import type { GiftHouseholdBasis } from "@/lib/tax-engine/one-house/gift-household-basis";

beforeEach(() => {
  vi.mocked(preloadTaxRates).mockResolvedValue(makeMockRates());
});
const D = (s: string) => new Date(s);

describe("D-52 통산 시작일 축 — 판정 메뉴", () => {
  const form = (start: string, transfer = "2026-02-16") =>
    ({
      ...createInitialOneHouseJudgmentForm(),
      assets: [
        {
          ...makeDefaultAsset(1),
          residenceInputMode: "direct",
          residencePeriods: [],
          assetKind: "housing",
          acquisitionCause: "gift",
          acquisitionDate: "2025-06-01",
          donorAcquisitionDate: "2010-03-01",
          giftDonorRelation: "spouse",
          giftSameHousehold: "yes",
          giftHouseholdHoldingStartDate: start,
        },
      ],
      transferDate: transfer,
      contractTotalPrice: "900000000",
      isOneHousehold: true,
      isRegulatedArea: false,
      wasRegulatedAtAcquisition: false,
      houses: [],
      presaleRights: [],
    }) as unknown as OneHouseJudgmentFormData;
  const ids = (r: Awaited<ReturnType<typeof runJudgment>>) => r.data.judgment.undetermined.map((u: { id: string }) => u.id);
  it("시작일 2025-01-01(혼인일) → 과세 · 시작일이 결론을 가르므로 확인 필요 고지", async () => {
    const r = await runJudgment(form("2025-01-01"));
    expect(r.data.judgment.isExempt).toBe(false);
    expect(ids(r)).toContain(GIFT_HOUSEHOLD_CONSOLIDATION_DETAIL_ID);
  });
  it("짝 — 증여 3년 뒤 양도면 시작일과 무관하게 비과세라 고지 없음", async () => {
    const r = await runJudgment(form("2025-01-01", "2028-07-01"));
    expect(r.data.judgment.isExempt).toBe(true);
    expect(ids(r)).not.toContain(GIFT_HOUSEHOLD_CONSOLIDATION_DETAIL_ID);
  });
});

describe("D-53 이월과세 A 채택 비과세 — 계산기", () => {
  const form = (sh: "yes" | "no", transfer = "2026-02-16") =>
    ({
      ...createDefaultTransferFormData(),
      transferDate: transfer,
      contractTotalPrice: "900000000",
      isOneHousehold: true,
      householdHousingCount: "1",
      householdNoPresaleRightsConfirmed: true,
      householdNoOtherHousesConfirmed: true,
      assets: [
        {
          ...makeDefaultAsset(1),
          assetKind: "housing",
          addressJibun: "서울 마포구 테스트동 1-1",
          regionCode: "1144010100",
          acquisitionCause: "carryover_gift",
          residenceInputMode: "direct",
          residencePeriods: [],
          residencePeriodMonthsAsset: "0",
          carryover: {
            ...CARRYOVER_DEFAULTS,
            giftRegistryDate: "2025-06-01",
            donorAcquisitionDate: "2010-03-01",
            donorRelation: "spouse",
            giftDateValuation: "600000000",
            donorAcquisitionPrice: "200000000",
            donorSameHousehold: sh,
            donorHouseholdHoldingStartDate: sh === "yes" ? "2010-03-01" : "",
          },
        },
      ],
    }) as never;
  it("「예」 → A 채택 0원 + 이월과세 전용 세대 고지(B 계산이 통산에 달림)", async () => {
    const r = await runCalc(form("yes"));
    expect(r.issues).toEqual([]);
    expect(r.isExempt).toBe(true);
    expect(r.warnings).toContain(CARRYOVER_B_GIFT_HOUSEHOLD_REASON);
  });
  it("짝 — 「아니오」 → B 채택 과세 · 승계 고지 없음", async () => {
    const r = await runCalc(form("no"));
    expect(r.isExempt).toBe(false);
    expect(r.totalTax).toBeGreaterThan(0);
    expect(r.warnings ?? []).not.toContain(CARRYOVER_B_GIFT_HOUSEHOLD_REASON);
  });
  it("짝 — 증여 3년 뒤 양도면 B도 통산 없이 비과세라 고지 없음", async () => {
    const r = await runCalc(form("yes", "2028-07-01"));
    expect(r.status, JSON.stringify(r.issues)).toBe(200);
    expect(r.isExempt).toBe(true);
    expect(r.warnings ?? []).not.toContain(CARRYOVER_B_GIFT_HOUSEHOLD_REASON);
  });
});

describe("D-62 이월과세 A 고지 문장", () => {
  const basis = (over: Partial<GiftHouseholdBasis>): GiftHouseholdBasis => ({
    giftDate: D("2022-06-01"),
    donorAcquisitionDate: D("2010-03-01"),
    ...over,
  });
  const cases: Partial<GiftHouseholdBasis>[] = [
    { donorDeceased: true },
    { rejoinedAfterDivorce: true, continuousSameHousehold: true, householdHoldingStartDate: D("2018-01-01") },
    {},
    { continuousSameHousehold: true, householdHoldingStartDate: D("2018-01-01") },
  ];
  it("A(holdingAlreadyAtDonor)는 「증여일부터 보유기간」·「증여일 기준」을 단정하지 않는다 · B는 종전 문장", () => {
    for (const c of cases) {
      const a = giftHouseholdNotice(basis({ ...c, holdingAlreadyAtDonor: true }), "carryover_gift")!.reason;
      expect(a, JSON.stringify(c)).not.toMatch(/증여일부터 보유기간|세율 보유기간은 증여일 기준/);
      expect(a).toContain("증여자 취득일부터");
      const b = giftHouseholdNotice(basis(c), "gift")!.reason;
      expect(b).toMatch(/증여일부터 보유기간|증여일 기준으로 계산/);
    }
  });
  it("표2 미답 분기도 A면 「보유·거주기간은 증여일부터」를 쓰지 않는다", () => {
    const input = (holdingAlreadyAtDonor: boolean) =>
      baseTransferInput({
        propertyType: "housing",
        isOneHousehold: true,
        householdHousingCount: 1,
        acquisitionDate: D("2020-01-01"),
        transferDate: D("2026-06-01"),
        transferPrice: 2_000_000_000,
        acquisitionPrice: 500_000_000,
        residencePeriodMonths: 12,
        giftHouseholdBasis: {
          giftDate: D("2020-01-01"),
          donorAcquisitionDate: D("2010-03-01"),
          continuousSameHousehold: true,
          householdHoldingStartDate: D("2010-03-01"),
          ...(holdingAlreadyAtDonor ? { holdingAlreadyAtDonor: true } : {}),
        },
      });
    const notice = (h: boolean) =>
      giftTable2PriorResidenceNotice({ input: input(h), deemedOneHouseBy155: false, isHighValuePartial: true, lthdApplies: true });
    expect(notice(false)).toContain("표2 공제율의 보유·거주기간은 증여일부터 센 본인의 기간");
    expect(notice(true)).toContain("사전-2025-법규재산-1126");
    expect(notice(true)).not.toContain("보유·거주기간은 증여일부터");
  });
});

describe("I-24 그 밖의 친족 질문 — 1세대 범위", () => {
  it("other만 §88 6호 범위를 덧붙이고 배우자·직계는 그대로", () => {
    expect(giftHouseholdQuestionText("other")).toContain("소득세법 §88 6호");
    expect(giftHouseholdQuestionText("other")).toContain("형제자매");
    expect(giftHouseholdQuestionText("lineal")).not.toContain("§88");
    expect(giftHouseholdQuestionText("spouse")).toContain("혼인이 유지");
  });
});
