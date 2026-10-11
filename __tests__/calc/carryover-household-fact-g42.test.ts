/**
 * 결정 #33·#34 — 이월과세 「증여자와 계속 같은 세대」 사실의 ④ 전송 · ③ 마이그레이션 · ⑧ 필수 · Step4 기준일.
 *
 * ⑤(노출)·⑧(필수)·④(전송)는 같은 술어 `carryoverHouseholdFactVisible`을 쓴다 — 화면에 없는 질문을 요구하거나(막다른 오류)
 * 질문이 있는데 보내지 않는(no-op) 상태가 없어야 한다.
 */
import { describe, it, expect } from "vitest";
import {
  buildCarryoverPayload,
  carryoverResidenceJudgmentDate,
  carryoverHouseholdFactVisible,
} from "@/lib/calc/transfer-tax-api-carryover";
import { migrateCarryoverFields, CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import { collectStepIssues } from "@/lib/calc/transfer-tax-validate";
import { withPrimary } from "../../e2e/_helpers/validation-field-jump-cases";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";

const asset = (c: Partial<NonNullable<AssetForm["carryover"]>> = {}, over: Partial<AssetForm> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1),
    addressJibun: "서울 강남구 테스트동 1-1",
    assetKind: "housing",
    acquisitionCause: "carryover_gift",
    carryover: {
      ...CARRYOVER_DEFAULTS,
      giftRegistryDate: "2020-01-01",
      donorAcquisitionDate: "2010-01-01",
      donorRelation: "spouse",
      giftDateValuation: "300000000",
      donorAcquisitionPrice: "200000000",
      ...c,
    },
    ...over,
  }) as AssetForm;

const ct = (a: AssetForm) =>
  buildCarryoverPayload(a, "2026-02-16", 1)!.carryoverTaxation as Record<string, unknown>;

describe("④ 전송", () => {
  it("[H-1] 예 → continuous true + 시작일, 아니오 → false(시작일 제외), 미답 → 미전송(미확인)", () => {
    expect(ct(asset({ donorSameHousehold: "yes", donorHouseholdHoldingStartDate: "2012-05-05" }))).toMatchObject({
      donorSameHouseholdContinuous: true,
      donorHouseholdHoldingStartDate: "2012-05-05",
    });
    const no = ct(asset({ donorSameHousehold: "no", donorHouseholdHoldingStartDate: "2012-05-05" }));
    expect(no.donorSameHouseholdContinuous).toBe(false);
    expect(no.donorHouseholdHoldingStartDate).toBeUndefined();
    const unanswered = ct(asset({ donorSameHousehold: "" }));
    expect(unanswered.donorSameHouseholdContinuous).toBeUndefined();
  });
  it("[H-2] 부정 짝: 증여자 사망 · 그 외 관계 · 비주택이면 남은 답을 싣지 않는다(stale 차단)", () => {
    for (const a of [
      asset({ donorSameHousehold: "yes", donorHouseholdHoldingStartDate: "2012-05-05", donorDeceased: true }),
      asset({ donorSameHousehold: "yes", donorHouseholdHoldingStartDate: "2012-05-05", donorRelation: "other" }),
      asset({ donorSameHousehold: "yes", donorHouseholdHoldingStartDate: "2012-05-05" }, { assetKind: "land" }),
    ]) {
      expect(ct(a).donorSameHouseholdContinuous).toBeUndefined();
      expect(ct(a).donorHouseholdHoldingStartDate).toBeUndefined();
    }
  });
});

describe("③ 마이그레이션", () => {
  it("[H-3] 구형 record에는 두 필드가 없다 → 미답(\"\")으로 채운다 · 알 수 없는 값은 미답", () => {
    const a = { acquisitionCause: "carryover_gift", carryover: { giftRegistryDate: "2020-01-01", donorAcquisitionDate: "2010-01-01" } } as Record<string, unknown>;
    migrateCarryoverFields(a);
    expect((a.carryover as AssetForm["carryover"])!.donorSameHousehold).toBe("");
    expect((a.carryover as AssetForm["carryover"])!.donorHouseholdHoldingStartDate).toBe("");
    const b = { acquisitionCause: "carryover_gift", carryover: { donorSameHousehold: "maybe", donorHouseholdHoldingStartDate: 5 } } as Record<string, unknown>;
    migrateCarryoverFields(b);
    expect((b.carryover as AssetForm["carryover"])!.donorSameHousehold).toBe("");
    const c = { acquisitionCause: "carryover_gift", carryover: { donorSameHousehold: "yes", donorHouseholdHoldingStartDate: "2012-05-05" } } as Record<string, unknown>;
    migrateCarryoverFields(c);
    expect((c.carryover as AssetForm["carryover"])!.donorSameHousehold).toBe("yes");
    expect((c.carryover as AssetForm["carryover"])!.donorHouseholdHoldingStartDate).toBe("2012-05-05");
  });
});

describe("⑧ 필수 질문", () => {
  const issues = (a: AssetForm) =>
    collectStepIssues(0, withPrimary(a as unknown as Record<string, unknown>) as unknown as TransferFormData).map((i) => i.field);

  it("[H-4] 미답이면 막고, 답하면 풀린다 — 관계를 고르지 않아도 묻는다", () => {
    expect(issues(asset({ donorSameHousehold: "" }))).toContain("carryover.donorSameHousehold");
    expect(issues(asset({ donorSameHousehold: "no" }))).not.toContain("carryover.donorSameHousehold");
    expect(issues(asset({ donorSameHousehold: "", donorRelation: "" }))).toContain("carryover.donorSameHousehold");
  });
  it("[H-5] 예 + 시작일: 비면 막고 경계 ±1(증여자 취득일·증여 등기접수일)", () => {
    const f = (start: string) => issues(asset({ donorSameHousehold: "yes", donorHouseholdHoldingStartDate: start }));
    expect(f("")).toContain("carryover.donorHouseholdHoldingStartDate");
    expect(f("2009-12-31")).toContain("carryover.donorHouseholdHoldingStartDate");
    expect(f("2010-01-01")).not.toContain("carryover.donorHouseholdHoldingStartDate");
    expect(f("2019-12-31")).not.toContain("carryover.donorHouseholdHoldingStartDate");
    expect(f("2020-01-01")).toContain("carryover.donorHouseholdHoldingStartDate");
  });
  it("[H-6] 증여자 사망 · 그 외 관계 · 비주택에서는 묻지 않아 막지 않는다(막다른 오류 방지)", () => {
    expect(issues(asset({ donorSameHousehold: "", donorDeceased: true }))).not.toContain("carryover.donorSameHousehold");
    expect(issues(asset({ donorSameHousehold: "" }, { assetKind: "land" }))).not.toContain("carryover.donorSameHousehold");
    expect(carryoverHouseholdFactVisible(asset({ donorDeceased: true }))).toBe(false);
  });
});

describe("Step4 자동 판별 기준일 (G4-1)", () => {
  it("[H-7] 계속 같은 세대 확인 → 세대 보유 시작일, 아니면 증여 등기접수일(자산 카드에 취득일 칸이 없다)", () => {
    expect(carryoverResidenceJudgmentDate(asset({ donorSameHousehold: "yes", donorHouseholdHoldingStartDate: "2015-03-03" }))).toBe("2015-03-03");
    expect(carryoverResidenceJudgmentDate(asset({ donorSameHousehold: "no", donorHouseholdHoldingStartDate: "2015-03-03" }))).toBe("2020-01-01");
    expect(carryoverResidenceJudgmentDate(asset({ donorSameHousehold: "" }))).toBe("2020-01-01");
    // 범위 밖 시작일(증여 등기접수일 이후)은 쓰지 않는다
    expect(carryoverResidenceJudgmentDate(asset({ donorSameHousehold: "yes", donorHouseholdHoldingStartDate: "2020-01-01" }))).toBe("2020-01-01");
    expect(carryoverResidenceJudgmentDate({ ...asset(), acquisitionCause: "purchase" } as AssetForm)).toBeUndefined();
  });
});
