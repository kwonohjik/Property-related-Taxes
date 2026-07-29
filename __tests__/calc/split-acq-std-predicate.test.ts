/**
 * anchor: 취득시 기준시가 술어(`requiresAcqStdPrice`)의 **계층 간 인자 동일성** + validate V3 게이트.
 *
 * 계획서: docs/02-design/features/transfer-split-part-std-card-gating.plan.md §6 Phase 1-a
 *
 * 🔴 교훈: "같은 함수를 공유한다"는 단일 소스의 **필요조건일 뿐 충분조건이 아니다** —
 *   인자 구성이 다르면 UI·validate·엔진의 판정이 갈라진다.
 *
 * 🔴 G10(V3): `transfer-tax-validate-split.ts:102-106`은 술어를 거치지 않고
 *   `buildingStandardPriceAtAcq`가 입력돼 있으면 무조건 토지분을 요구한다. 파트 카드를 술어로
 *   숨기면 **입력 칸이 없는데 차단되는 dead-end**가 신규 발생한다.
 * 🔴 G11(expenses): UI 호출부는 `expenses`를 넘기지 않고 `AssetForm`에도 그 프로퍼티가 없어
 *   ⑥절이 UI·validate에서 dead인데, 엔진은 `input.expenses = parseAmount(directExpenses)`
 *   (`transfer-tax-api.ts:238-243`)를 받아 live다 → UI 숨김 ↔ 엔진 throw.
 */
import { describe, it, expect } from "vitest";
import { requiresAcqStdPrice } from "@/lib/calc/transfer-tax-split-acq-mode";
import { validateSplitDirectInputs } from "@/lib/calc/transfer-tax-validate-split";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

function asset(init: Partial<AssetForm>): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "building",
    acquisitionCause: "purchase",
    acquisitionDate: "2025-08-29",
    landAcquisitionDate: "2015-01-08",
    hasSeperateLandAcquisitionDate: true,
    ...init,
  } as AssetForm;
}

/** 양쪽 실지거래가액 + 구분양도 가액 입력 → 술어 전 절 false */
const ACTUAL_BOTH: Partial<AssetForm> = {
  landAcqMode: "actual",
  buildingAcqMode: "actual",
  landAcquisitionPrice: "240000000",
  buildingAcquisitionPrice: "60000000",
  saleSplitMode: "actual",
  landTransferPrice: "400000000",
  buildingTransferPrice: "100000000",
};

describe("G10 — validate V3가 술어를 거친다 (dead-end 방지)", () => {
  it("G10 일반건물 + 건물분 기준시가 잔존 + 실가/실가 → 차단하지 않는다", () => {
    // 사용자가 환산일 때 건물분을 입력한 뒤 실가로 되돌린 상태.
    // 값 보존 원칙상 buildingStandardPriceAtAcq는 남아 있고, 파트 카드는 술어로 숨겨진다.
    // → V3가 술어를 거치지 않으면 "있지도 않은 칸"을 요구한다.
    const err = validateSplitDirectInputs(
      asset({
        ...ACTUAL_BOTH,
        buildingStandardPriceAtAcq: "100000000",
        standardPricePerSqmAtAcq: "",
        acquisitionArea: "",
      }),
      "자산 1",
    );
    expect(err, `입력 칸이 숨겨진 상태에서 그 칸을 요구하면 dead-end: ${err}`).toBeNull();
  });

  it("G10-b 취득시 기준시가가 실제로 필요하면 V3는 종전대로 차단 (회귀 0)", () => {
    const err = validateSplitDirectInputs(
      asset({
        landAcqMode: "estimated",
        buildingAcqMode: "estimated",
        saleSplitMode: "apportioned",
        landStandardPriceAtTransfer: "111564000",
        buildingStandardPriceAtTransfer: "100835280",
        buildingStandardPriceAtAcq: "100000000",
        standardPricePerSqmAtAcq: "",
        acquisitionArea: "",
      }),
      "자산 1",
    );
    expect(err).toMatch(/토지분도|㎡당 개별공시지가/);
  });
});

describe("G11 — 술어 인자 동일성 (expenses)", () => {
  it("G11-a legacy 자본적지출 총액이 있으면 ⑥절이 true (엔진과 동일 판정)", () => {
    // 엔진은 input.expenses = parseAmount(directExpenses)를 받아 ⑥절이 live다.
    // UI·validate가 이 인자를 넘기지 않으면 카드를 숨겨 엔진 throw로 이어진다.
    expect(
      requiresAcqStdPrice(
        { ...ACTUAL_BOTH, expenses: 30_000_000 },
        { landMode: "actual", buildingMode: "actual", isSeparate: true, hasSaleRatio: true },
      ),
      "총액 안분이 필요한데 파트 2칸이 비면 취득시 비율이 유일한 도출 수단",
    ).toBe(true);
  });

  it("G11-b validate가 UI와 같은 판정을 낸다 (directExpenses → expenses 전달)", () => {
    // validate는 asset을 통째로 넘기지만 AssetForm에는 `expenses`가 없다(`directExpenses`가 실제 필드).
    // 인자를 보정하지 않으면 여기서 술어가 false가 되어 엔진과 어긋난다.
    //
    // ⚠️ 주택으로 검증한다 — 일반건물은 V6(건물분 필수, Phase 3)가 V5보다 먼저 걸려 다른
    //    메시지를 낸다. 여기서 보려는 것은 **⑥절 인자가 전달되는가** 하나이므로, V6와 섞이지
    //    않는 자산 종류를 골라 검증 대상을 좁힌다.
    const a = asset({
      ...ACTUAL_BOTH,
      assetKind: "housing",
      directExpenses: "30000000",
      landDirectExpenses: "",
      buildingDirectExpenses: "",
    });
    const err = validateSplitDirectInputs(a, "자산 1");
    expect(err, "엔진이 취득시 기준시가를 요구하는 입력이면 validate도 같이 요구해야 한다").toMatch(
      /㎡당 개별공시지가/,
    );
  });

  it("G11-c 파트 자본적지출이 채워져 있으면 ⑥절은 false (안분 불요)", () => {
    expect(
      requiresAcqStdPrice(
        { ...ACTUAL_BOTH, expenses: 30_000_000, landDirectExpenses: "20000000", buildingDirectExpenses: "10000000" },
        { landMode: "actual", buildingMode: "actual", isSeparate: true, hasSaleRatio: true },
      ),
    ).toBe(false);
  });
});
