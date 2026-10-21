/**
 * P2 C 술어·정규화·③ 마이그레이션 단위 (2026-10-19)
 *
 * 설계: docs/02-design/features/transfer-split-part-carryover.ui.design.md §2.1·§2.2
 *
 * `effectiveCarryoverDonorSplit`는 ⑤ 카드·④ 전송·⑥ 사이드바·⑧ 검증이 읽는 **유일한** 술어다. 저장 토글은 잔재일 수 있어 단독으로 읽지 않는다 —
 * 진리표로 모든 «꺼짐» 사유를 한 칸씩 확인하고, 값은 지우지 않는다는 것(읽는 쪽 파생)을 같이 잠근다.
 */
import { describe, it, expect } from "vitest";
import { effectiveCarryoverDonorSplit, partCarryover, normalizeBuildingCauseInputs } from "@/lib/calc/transfer-land-part-cause";
import { isSeparateAcquisition } from "@/lib/calc/transfer-tax-split-acq-mode";
import { carryoverAcquisitionDateFallback, carryoverHouseholdFactVisible } from "@/lib/calc/transfer-tax-api-carryover";
import { migrateAsset } from "@/lib/stores/calc-wizard-asset";
import { CARRYOVER_DEFAULTS, normalizeCarryoverForm } from "@/lib/stores/calc-wizard-asset-carryover";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { cAsset } from "./_helpers/split-carryover-c-form";

const base = () => cAsset();

describe("PC1 effectiveCarryoverDonorSplit 진리표", () => {
  it("기준: 토글 ON ∧ 이월과세(증여) ∧ 주택 ∧ 겸용·소유자 분리·부담부증여 아님 ∧ 첫 자산 → true", () => {
    expect(effectiveCarryoverDonorSplit(base())).toBe(true);
    expect(partCarryover(base())).toEqual({ land: true, building: true });
  });

  it.each([
    ["토글 OFF", { carryoverDonorSplit: false }],
    ["취득 원인이 이월과세가 아님(매매)", { acquisitionCause: "purchase" }],
    ["취득 원인 증여", { acquisitionCause: "gift" }],
    ["토지 자산", { assetKind: "land" }],
    ["일반건물", { assetKind: "general_building" }],
    ["겸용주택", { isMixedUseHouse: true }],
    ["소유자 분리(건물만)", { selfOwns: "building_only" }],
    ["소유자 분리(토지만)", { selfOwns: "land_only" }],
    ["부담부증여", { transferType: "burdened_gift" }],
  ])("%s → false (값은 지우지 않는다)", (_, patch) => {
    const a = cAsset(patch);
    expect(effectiveCarryoverDonorSplit(a)).toBe(false);
    expect(partCarryover(a)).toEqual({ land: false, building: false });
    // 읽는 쪽 파생 — 입력 값은 그대로(토글을 되돌리면 복원)
    expect(a.landCarryover?.donorAcquisitionPrice).toBe("50,000,000");
    expect(a.landAcquisitionPrice).toBe("240,000,000");
  });

  it("비주택 건물(building)은 켤 수 있다 — 엔진 isSplitable와 같은 범위", () => {
    expect(effectiveCarryoverDonorSplit(cAsset({ assetKind: "building" }))).toBe(true);
  });

  it("함께 양도 자산(isNonPrimary)이면 false — 파트 이월과세는 첫 자산에서만 계산된다(엔진 S0)", () => {
    expect(effectiveCarryoverDonorSplit(base(), { isNonPrimary: true })).toBe(false);
    expect(effectiveCarryoverDonorSplit(base(), { isNonPrimary: false })).toBe(true);
  });
});

describe("정규화 사본 · 별개취득 · 세대 사실 · 취득일 (3중 일치)", () => {
  it("normalizeBuildingCauseInputs: C이면 파트 방식을 actual로 고정(숨은 환산·감정 잔재가 ⑧·⑥·④를 바꾸지 않는다)", () => {
    const n = normalizeBuildingCauseInputs(cAsset({ landAcqMode: "estimated", buildingAcqMode: "appraisal" }));
    expect([n.landAcqMode, n.buildingAcqMode]).toEqual(["actual", "actual"]);
    // 이미 actual이면 같은 객체
    const a = cAsset({ landAcqMode: "actual", buildingAcqMode: "actual" });
    expect(normalizeBuildingCauseInputs(a)).toBe(a);
    // 부정형 짝 — C가 아니면 모드를 건드리지 않는다
    const off = cAsset({ carryoverDonorSplit: false, landAcqMode: "estimated" });
    expect(normalizeBuildingCauseInputs(off).landAcqMode).toBe("estimated");
  });

  it("isSeparateAcquisition: C는 수증자 쪽 취득일이 하나라 «별개 취득»이 아니다(취득일 분리 잔재가 있어도)", () => {
    const stale = cAsset({ hasSeperateLandAcquisitionDate: true, landAcquisitionDate: "2010-01-01", acquisitionDate: "2012-02-02" });
    expect(isSeparateAcquisition(stale)).toBe(false);
    // 부정형 짝 — 토글 OFF면 종전대로 날짜 비교
    expect(isSeparateAcquisition({ ...stale, carryoverDonorSplit: false })).toBe(true);
  });

  it("carryoverHouseholdFactVisible: P5부터 C도 묻는다(건물이 증여받은 주택) — ⑤⑧④가 같은 술어 · 증여자 사망이면 묻지 않는다", () => {
    expect(carryoverHouseholdFactVisible(cAsset())).toBe(true);
    expect(carryoverHouseholdFactVisible(cAsset({ carryoverDonorSplit: false }))).toBe(true);
    expect(carryoverHouseholdFactVisible(cAsset({ carryoverDonorSplit: false, carryover: { ...CARRYOVER_DEFAULTS, donorDeceased: true } }))).toBe(false);
  });

  it("carryoverAcquisitionDateFallback: C는 증여 등기접수일(남은 acquisitionDate 잔재가 이기지 않는다), 아니면 종전 우선순위", () => {
    expect(carryoverAcquisitionDateFallback(cAsset({ acquisitionDate: "2019-05-05" }))).toBe("2023-03-01");
    expect(carryoverAcquisitionDateFallback(cAsset({ carryoverDonorSplit: false, acquisitionDate: "2019-05-05" }))).toBe("2019-05-05");
  });
});

describe("③ 마이그레이션 — 구 세션·이력은 항상 «꺼짐»", () => {
  it("신규 키가 없는 구 자산 → carryoverDonorSplit false · landCarryover 기본값", () => {
    const raw = { ...makeDefaultAsset(1) } as unknown as Record<string, unknown>;
    delete raw.carryoverDonorSplit;
    delete raw.landCarryover;
    const m = migrateAsset(raw as unknown as AssetForm);
    expect(m.carryoverDonorSplit).toBe(false);
    expect(m.landCarryover).toEqual(CARRYOVER_DEFAULTS);
  });

  it("값이 있으면 보존하고, 취득 원인을 바꿔도 landCarryover는 지우지 않는다(carryover와 다르다 — 호스트 스트리핑 없음)", () => {
    const m = migrateAsset({ ...cAsset({ acquisitionCause: "purchase" }) } as unknown as AssetForm);
    expect(m.carryoverDonorSplit).toBe(true);
    expect(m.landCarryover?.donorAcquisitionPrice).toBe("50,000,000");
    // 기존 규약 불변 — carryover는 이월과세 호스트가 아니면 기본값으로 되돌린다
    expect(m.carryover).toEqual(CARRYOVER_DEFAULTS);
  });

  it("형이 틀린 값은 기본값으로: 문자열 토글·숫자 서브필드", () => {
    const m = migrateAsset({ ...cAsset(), carryoverDonorSplit: "true", landCarryover: { donorAcquisitionPrice: 5, donorRelation: "x" } } as unknown as AssetForm);
    expect(m.carryoverDonorSplit).toBe(false);
    expect(m.landCarryover?.donorAcquisitionPrice).toBe("");
    expect(m.landCarryover?.donorRelation).toBe("");
  });

  it("normalizeCarryoverForm: 기존 carryover 정규화 본문과 같다(회귀 0) — 알 수 없는 입력은 기본값", () => {
    expect(normalizeCarryoverForm(undefined)).toEqual(CARRYOVER_DEFAULTS);
    expect(normalizeCarryoverForm({ donorRelation: "spouse", donorDeceased: true }).donorDeceased).toBe(true);
    expect(normalizeCarryoverForm({ exclusionDeclared: { oneHouseExemptionApplies: true } }).exclusionDeclared.legacyOneHouseExemptionDeclared).toBe(true);
  });
});
