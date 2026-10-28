/**
 * 부수토지 카드의 중과 판정 leaf — 계획서 `docs/02-design/features/bundled-appurtenant-card-multi-house-surcharge.plan.md` (AN-1 ~ AN-3).
 */
import { describe, expect, it } from "vitest";
import {
  APPURTENANT_CARD_SURCHARGE_NOTICE,
  appurtenantCardFollowsSurchargeRate,
  appurtenantCardHouseSurcharge,
  appurtenantCardSurchargeNotice,
  appurtenantCardSurchargeRateInput,
} from "@/lib/tax-engine/appurtenant-card-surcharge";
import { toHouseVerdict } from "@/lib/tax-engine/transfer-tax-one-house-unit";
import { resolveSurchargeApplication, type SurchargeApplication } from "@/lib/tax-engine/transfer-tax-surcharge-predicate";
import type { TransferTaxItemInput } from "@/lib/tax-engine/transfer-tax-aggregate";
import type { TransferTaxInput } from "@/lib/tax-engine/types/transfer.types";
import type { TransferTaxResult } from "@/lib/tax-engine/types/transfer-result.types";

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);
const app = (over: Partial<SurchargeApplication> = {}): SurchargeApplication => ({
  isSurchargeCase: true, isSuspended: false, isSurchargeApplied: true, isRateSurchargeApplied: true,
  effectiveSurchargeType: "multi_house_2", effectiveHouseCount: 2, surchargeTypeKey: "multi_house_2", ...over,
});
const card = (houseSurcharge: SurchargeApplication | undefined, over: Record<string, unknown> = {}) =>
  ({
    propertyType: "land", oneHouseUnitRole: "appurtenant_land", acquisitionDate: d(2014, 1, 1), transferDate: d(2026, 6, 15),
    appurtenantHouseVerdict: { isExempt: false, isPartialExempt: false, houseAcquisitionDate: d(2025, 1, 1), carryoverOneHouseExcluded: false, houseSurcharge },
    ...over,
  }) as unknown as TransferTaxInput;

describe("AN-1 toHouseVerdict — houseSurcharge는 짝 주택 결과의 echo를 그대로 싣는다", () => {
  const house = { propertyType: "housing", acquisitionDate: d(2025, 1, 1) } as unknown as TransferTaxItemInput;
  it("surchargeEcho → houseSurcharge (같은 객체)", () => {
    const echo = app();
    expect(toHouseVerdict(house, { isExempt: false, isPartialExempt: false, surchargeEcho: echo } as TransferTaxResult).houseSurcharge).toBe(echo);
  });
  it("echo가 없으면 undefined(종전)", () => {
    expect(toHouseVerdict(house, { isExempt: false, isPartialExempt: false } as TransferTaxResult).houseSurcharge).toBeUndefined();
  });
});

describe("AN-2 resolveSurchargeApplication — 부수토지 카드는 짝 주택 판정을 그대로 따른다", () => {
  const args = (input: TransferTaxInput) => ({
    propertyType: input.propertyType, isRegulatedArea: false, householdHousingCount: 1, transferDate: input.transferDate,
    oneHouseUnitRole: input.oneHouseUnitRole, appurtenantHouseVerdict: input.appurtenantHouseVerdict,
  });
  it("카드 + verdict.houseSurcharge → 같은 객체(원시 플래그가 1주택·비조정이어도)", () => {
    const echo = app();
    expect(resolveSurchargeApplication(args(card(echo)), undefined, {} as never)).toBe(echo);
  });
  it("짝 주택이 중과 없음이면 카드도 없음(다른 세대 토지만 본인이 이 경로로 빠진다)", () => {
    const none = app({ isSurchargeCase: false, isSurchargeApplied: false, isRateSurchargeApplied: false, effectiveSurchargeType: "none" });
    expect(resolveSurchargeApplication(args(card(none)), undefined, {} as never)).toBe(none);
  });
  it("역할이 카드가 아니거나 verdict 미주입이면 종전(토지는 자산 게이트에 걸려 중과 없음)", () => {
    for (const input of [card(app(), { oneHouseUnitRole: undefined }), card(undefined)]) {
      const r = resolveSurchargeApplication(args(input), undefined, {} as never);
      expect([r.isSurchargeCase, r.isRateSurchargeApplied]).toEqual([false, false]);
    }
  });
});

describe("AN-3 카드 leaf — 세율 축 · 보유기간 · 고지", () => {
  it("appurtenantCardHouseSurcharge: 카드 역할 + verdict일 때만", () => {
    expect(appurtenantCardHouseSurcharge(card(app()))).toBeDefined();
    expect(appurtenantCardHouseSurcharge(card(app(), { oneHouseUnitRole: "appurtenant_excess" }))).toBeUndefined();
    expect(appurtenantCardHouseSurcharge(card(undefined))).toBeUndefined();
  });
  it("appurtenantCardFollowsSurchargeRate: 세율 축(isRateSurchargeApplied)만 — 한시 배제 중이면 false", () => {
    expect(appurtenantCardFollowsSurchargeRate(card(app()))).toBe(true);
    expect(appurtenantCardFollowsSurchargeRate(card(app({ isRateSurchargeApplied: false, isSuspended: true, isSurchargeApplied: false })))).toBe(false);
  });
  it("appurtenantCardSurchargeRateInput: 취득일을 짝 주택 취득일로(합가일이 늦으면 합가일) — 중과 아니면 그대로", () => {
    const base = card(app());
    expect(appurtenantCardSurchargeRateInput(base).acquisitionDate).toEqual(d(2025, 1, 1));
    const merged = card(app(), { appurtenantHouseVerdict: { ...base.appurtenantHouseVerdict, houseMergeDate: d(2025, 6, 1) } });
    expect(appurtenantCardSurchargeRateInput(merged).acquisitionDate).toEqual(d(2025, 6, 1));
    const earlyMerge = card(app(), { appurtenantHouseVerdict: { ...base.appurtenantHouseVerdict, houseMergeDate: d(2024, 6, 1) } });
    expect(appurtenantCardSurchargeRateInput(earlyMerge).acquisitionDate).toEqual(d(2025, 1, 1));
    const none = card(app({ isRateSurchargeApplied: false }));
    expect(appurtenantCardSurchargeRateInput(none)).toBe(none);
  });
  it("appurtenantCardSurchargeNotice: 중과가 실제로 걸릴 때만(유예·비대상은 없음)", () => {
    expect(appurtenantCardSurchargeNotice(card(app()))).toBe(APPURTENANT_CARD_SURCHARGE_NOTICE);
    expect(appurtenantCardSurchargeNotice(card(app({ isSurchargeApplied: false, isSuspended: true })))).toBeUndefined();
    expect(appurtenantCardSurchargeNotice(card(undefined))).toBeUndefined();
  });
});
