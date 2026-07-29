/**
 * anchor: 일반건물 별개취득 — 결합 총액 전송 차단 + 건물분 필수 검증 (Phase 3 · H4·H6).
 *
 * 계획서: docs/02-design/features/transfer-split-part-std-card-gating.plan.md §6 Phase 3
 *
 * 🔴 H6(stale): 자산 전체 블록을 읽기 전용으로 바꾸면 `standardPriceAtAcq`를 더는 입력하지 않는데,
 *   폼에 남은 옛 값이 계속 전송되면 엔진이 legacy 역산(`calcAcqStdPair` :58-61)으로 그 값을 쓴다 —
 *   **화면에 보이지 않는 값이 계산에 쓰이는** 상태. 별개취득 일반건물은 파트 독립이 정본이므로
 *   전송 자체를 차단한다(폼 값은 보존 — 토글을 되돌리면 복귀).
 * 🔴 H4(건물분 필수): 전송을 차단하면 건물분이 비었을 때 엔진이 총액 역산으로 후퇴할 수 없어
 *   `calcAcqStdPair` null → `TaxCalculationError` throw가 된다. validate가 먼저 필드 오류로 알린다.
 */
import { describe, it, expect } from "vitest";
import { buildSplitPayload } from "@/lib/calc/transfer-tax-api-split";
import { validateSplitDirectInputs } from "@/lib/calc/transfer-tax-validate-split";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

function asset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "building",
    acquisitionCause: "purchase",
    acquisitionDate: "2018-06-01",
    landAcquisitionDate: "2015-06-01",
    hasSeperateLandAcquisitionDate: true,
    landAcqMode: "estimated",
    buildingAcqMode: "estimated",
    saleSplitMode: "apportioned",
    landStandardPriceAtTransfer: "600,000,000",
    buildingStandardPriceAtTransfer: "400,000,000",
    standardPricePerSqmAtAcq: "1,000,000",
    acquisitionArea: "200",
    buildingStandardPriceAtAcq: "350,000,000",
    standardPriceAtAcq: "999,999,999", // 읽기 전용 전환 전에 입력됐던 stale 총액
    ...over,
  } as AssetForm;
}

describe("H6 — 결합 총액 stale 전송 차단", () => {
  it("H6-a 일반건물 별개취득이면 standardPriceAtAcquisition을 전송하지 않는다", () => {
    const body = buildSplitPayload(asset(), {
      isBurdenedGift: false,
      usesPhd: false,
      ratioed: (v) => (v ? parseInt(String(v).replace(/,/g, ""), 10) || undefined : undefined),
    });
    // 본체(`transfer-tax-api.ts:269`)가 넣은 값을 이 빌더의 spread(:316)가 덮어쓴다.
    expect(
      Object.prototype.hasOwnProperty.call(body, "standardPriceAtAcquisition"),
      "override 키가 없으면 본체 값이 그대로 전송된다",
    ).toBe(true);
    expect(
      body.standardPriceAtAcquisition,
      "화면에 보이지 않는 값이 엔진 계산에 도달하면 안 된다",
    ).toBeUndefined();
  });

  it("H6-b 주택은 차단 대상 아님 (라목 결합 공시가 정본)", () => {
    const body = buildSplitPayload(asset({ assetKind: "housing", buildingStandardPriceAtAcq: "" }), {
      isBurdenedGift: false,
      usesPhd: false,
      ratioed: (v) => (v ? parseInt(String(v).replace(/,/g, ""), 10) || undefined : undefined),
    });
    expect(Object.prototype.hasOwnProperty.call(body, "standardPriceAtAcquisition")).toBe(false);
  });

  it("H6-c 비-별개취득(취득일 동일)도 차단 대상 아님", () => {
    const body = buildSplitPayload(asset({ landAcquisitionDate: "2018-06-01" }), {
      isBurdenedGift: false,
      usesPhd: false,
      ratioed: (v) => (v ? parseInt(String(v).replace(/,/g, ""), 10) || undefined : undefined),
    });
    expect(Object.prototype.hasOwnProperty.call(body, "standardPriceAtAcquisition")).toBe(false);
  });
});

describe("H4 — 건물분 취득시 기준시가 필수", () => {
  it("H4-a 일반건물 별개취득 + 취득시 기준시가 필요 + 건물분 미입력 → 필드 오류", () => {
    const err = validateSplitDirectInputs(asset({ buildingStandardPriceAtAcq: "" }), "자산 1");
    expect(err, "총액 역산 경로가 차단되므로 건물분이 없으면 엔진이 계산 실패한다").toMatch(
      /건물.*기준시가/,
    );
  });

  it("H4-b 건물분을 입력하면 통과", () => {
    expect(validateSplitDirectInputs(asset(), "자산 1")).toBeNull();
  });

  it("H4-c 취득시 기준시가가 불요하면(실가/실가) 건물분도 요구하지 않는다", () => {
    const err = validateSplitDirectInputs(
      asset({
        landAcqMode: "actual",
        buildingAcqMode: "actual",
        landAcquisitionPrice: "300,000,000",
        buildingAcquisitionPrice: "250,000,000",
        buildingStandardPriceAtAcq: "",
        standardPricePerSqmAtAcq: "",
        acquisitionArea: "",
      }),
      "자산 1",
    );
    expect(err, "쓰이지도 않는 값을 필수로 요구하면 거짓 요구다").toBeNull();
  });

  it("H4-d 주택은 건물분 필수 대상 아님 (파트 독립 입력 자체가 없다)", () => {
    expect(
      validateSplitDirectInputs(asset({ assetKind: "housing", buildingStandardPriceAtAcq: "" }), "자산 1"),
    ).toBeNull();
  });
});
