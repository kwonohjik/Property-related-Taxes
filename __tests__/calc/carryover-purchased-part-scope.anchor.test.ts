/**
 * anchor — 이월과세 채무 부분(매입분): 범위 술어 `carryoverPurchasedPartScope` / `carryoverPurchasedPartDebt` — ⑤ 노출 · ④ 전송 · ⑧ 필수·차단이 읽는 **하나**.
 * 설계서 §3.4 · UI 설계서 §2.1. 판정 순서: 일반건물·파트 이월과세 = numerator_only · 부담부증여(일반건물 밖) = unsupported · 그 밖 미지원 조합 = unsupported · 나머지 = apply.
 */
import { describe, it, expect } from "vitest";
import { carryoverPurchasedPartScope, carryoverPurchasedPartDebt } from "@/lib/calc/carryover-gift-assumed-debt";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-store";
import { CARRYOVER_DEFAULTS } from "@/lib/stores/calc-wizard-asset-carryover";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

const asset = (over: Partial<AssetForm> = {}, co: Record<string, unknown> = {}): AssetForm =>
  ({
    ...makeDefaultAsset(1), assetKind: "housing", acquisitionCause: "carryover_gift",
    carryover: { ...CARRYOVER_DEFAULTS, giftRegistryDate: "2023-06-01", donorAcquisitionDate: "2000-06-01", giftDateValuation: "1,000,000,000", giftDebtAssumed: true, giftAssumedDebt: "400,000,000", ...co },
    ...over,
  }) as AssetForm;
const kind = (a: AssetForm, opts?: { isNonPrimary?: boolean }) => carryoverPurchasedPartScope(a, opts).kind;

describe("범위 술어 — kind 격자", () => {
  it("E1: 주택 · 토지 · 상업용건물 → apply", () => {
    for (const assetKind of ["housing", "land", "commercial_building"] as const) expect(kind(asset({ assetKind }))).toBe("apply");
  });
  it("이월과세가 아니면 none", () => {
    expect(kind(asset({ acquisitionCause: "purchase" }))).toBe("none");
  });
  it("주택 분리 계산 · 파트 이월과세(C) → numerator_only (자기 위치의 토글 · V-7 분자 전용 — 비지원 + 결과 고지 T2)", () => {
    expect(kind(asset({ carryoverDonorSplit: true } as Partial<AssetForm>))).toBe("numerator_only");
  });
  it("일반건물 일반 양도(E2) → apply · 부담부증여 일반건물(E4) → numerator_only · 이월과세가 아니면 none (PR-2 승격)", () => {
    expect(kind(asset({ assetKind: "general_building" }))).toBe("apply");
    expect(kind(asset({ assetKind: "general_building", transferType: "burdened_gift" } as Partial<AssetForm>))).toBe("numerator_only");
    expect(kind(asset({ assetKind: "general_building", acquisitionCause: "purchase" }))).toBe("none");
  });
  it("일반건물 건물만 이월과세 — acquisitionCause가 이월과세가 아니어도 apply (gbBuildingAcquisitionCause가 정본)", () => {
    expect(kind(asset({ assetKind: "general_building", acquisitionCause: "purchase", gbBuildingAcquisitionCause: "carryover_gift" }))).toBe("apply");
  });
  it.each<[string, Partial<AssetForm>, string]>([
    ["감면 선택", { reductions: [{ type: "self_farming" } as never] } as Partial<AssetForm>, "감면"],
    ["주택→상가 용도변경", { gbHouseToCommercialConversion: true } as Partial<AssetForm>, "취득 시점"],
  ])("일반건물 %s → unsupported (사유는 ⑧·⑫와 같은 상수)", (_n, over, hint) => {
    const s = carryoverPurchasedPartScope(asset({ assetKind: "general_building", ...over }));
    expect(s.kind).toBe("unsupported");
    expect(s.kind === "unsupported" && s.reason.includes(hint)).toBe(true);
  });
  it("함께 양도 둘째 자산의 C 잔재는 꺼진 것으로 읽는다 → apply", () => {
    expect(kind(asset({ carryoverDonorSplit: true } as Partial<AssetForm>), { isNonPrimary: true })).toBe("apply");
  });
  it.each<[string, Partial<AssetForm>]>([
    ["부담부증여(지금 양도)", { transferType: "burdened_gift" } as Partial<AssetForm>],
    ["입주권", { assetKind: "right_to_move_in" }],
    ["분양권", { assetKind: "presale_right" }],
    ["재개발 아파트", { assetKind: "redevelopment_apt" }],
    ["겸용주택", { isMixedUseHouse: true } as Partial<AssetForm>],
    ["다필지", { assetKind: "land", parcelMode: true, parcels: [{} as never] } as Partial<AssetForm>],
    ["소유자 분리", { selfOwns: "land_only" } as Partial<AssetForm>],
    ["감면 선택", { reductions: [{ type: "self_farming" } as never] } as Partial<AssetForm>],
  ])("unsupported — %s (reason 문자열을 준다)", (_n, over) => {
    const s = carryoverPurchasedPartScope(asset(over));
    expect(s.kind).toBe("unsupported");
    expect(s.kind === "unsupported" && s.reason.length > 0).toBe(true);
  });
  it("증여자 환산 PHD·증여자 신축·증축도 unsupported", () => {
    expect(kind(asset({}, { useEstimatedAcquisition: true, estimationMode: "phd" }))).toBe("unsupported");
    expect(kind(asset({}, { donorBuilt: true }))).toBe("unsupported");
  });
});

describe("carryoverPurchasedPartDebt — ④가 보내는 값(apply ∧ 토글 ON ∧ 채무 > 0일 때만 > 0)", () => {
  it("apply + ON", () => expect(carryoverPurchasedPartDebt(asset())).toBe(400_000_000));
  it("토글 OFF · 채무 0 · 공백 → 0(조각 없음)", () => {
    expect(carryoverPurchasedPartDebt(asset({}, { giftDebtAssumed: false }))).toBe(0);
    expect(carryoverPurchasedPartDebt(asset({}, { giftAssumedDebt: "0" }))).toBe(0);
    expect(carryoverPurchasedPartDebt(asset({}, { giftAssumedDebt: "" }))).toBe(0);
  });
  it("일반건물(파트마다 ④가 따로 싣는다) · unsupported(부담부증여) → 0 — 남은 ON 값이 새 키로 새지 않는다", () => {
    expect(carryoverPurchasedPartDebt(asset({ assetKind: "general_building" }))).toBe(0);
    expect(carryoverPurchasedPartDebt(asset({ transferType: "burdened_gift" } as Partial<AssetForm>))).toBe(0);
  });
});
