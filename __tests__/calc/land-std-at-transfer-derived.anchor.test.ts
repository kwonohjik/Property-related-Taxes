/**
 * 양도시 토지분 기준시가 — 저장값이 아니라 파생값이 정본 (A7)
 *
 * ## 문제
 *
 * 「소득세법」 제99조 제1항 제1호 **가목**의 토지분 기준시가는 "㎡당 개별공시지가 × 면적"이
 * 정의 그 자체라 별도 고시 총액이 없다. 그래서 UI에도 **직접 입력 칸이 없고**
 * (`TransferStdPriceCards.tsx:88-91`), `landStandardPriceAtTransfer`는 사용자가 적는 값이
 * 아니라 **파생값의 캐시**다.
 *
 * 그런데 그 캐시를 갱신하는 경로는 `writeLandStd`(`TransferStdPriceCards.tsx:50-58`)
 * 하나뿐인데, 곱셈 인자 `transferArea`를 쓰는 경로는 넷이다 — 나머지 셋은 캐시를 갱신하지 않는다
 * (`AssetAreaSection.tsx:323·373·412` · `AssetSectionTransfer.tsx:105` ·
 *  `CompanionAcquisitionCauseSection.tsx:171`).
 *
 * ⇒ ③ 취득정보에서 면적 100으로 총액을 만든 뒤 ① 기본정보에서 면적을 200으로 고치면
 *   캐시가 100 기준으로 남는다.
 *
 * ## 세액 영향 (실측 — `land-building-split.test.ts` S1 fixture, 면적이 절반으로 어긋난 경우)
 *
 *   정확한 값(501,600,000) → 산출세액 20,202,957 · 지방소득세 2,020,295
 *   stale  값(250,800,000) → 산출세액          0 · 지방소득세         0
 *
 * 양도가액 안분 비율(`calcSaleApportionRatio`)과 환산 분모가 함께 틀어지며 세액이 통째로
 * 사라진다 — **과소신고 방향**이다.
 *
 * ## 계약
 *
 * `resolveLandStdAtTransfer`가 단일 소스다. 단가와 면적이 모두 있으면 **항상 그 곱**이 이기고,
 * 저장값은 둘 중 하나가 없을 때만(legacy·stale sessionStorage 호환) 쓰인다.
 * API 변환(`transfer-tax-api-split.ts`)과 validate(`transfer-tax-validate-split.ts`)가
 * 같은 함수를 쓴다 — 한쪽만 바꾸면 "UI 통과 ↔ 엔진 입력 불일치"가 재발한다.
 *
 * ⛔ 저장값 우선으로 되돌리지 말 것.
 */
import { describe, it, expect } from "vitest";
import { resolveLandStdAtTransfer } from "@/lib/calc/transfer-tax-split-acq-mode";
import { buildSplitPayload } from "@/lib/calc/transfer-tax-api-split";
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

describe("A7 — resolveLandStdAtTransfer", () => {
  it("[A7-01] 단가 × 면적이 저장값을 이긴다 (stale 캐시 무시)", () => {
    const v = resolveLandStdAtTransfer({
      standardPricePerSqmAtTransfer: "2,368,000",
      transferArea: "212",
      // ③에서 면적 106일 때 만들어져 남은 stale 캐시
      landStandardPriceAtTransfer: "250,800,000",
    });
    expect(v).toBe(Math.floor(2_368_000 * 212)); // 502,016,000
  });

  it("[A7-02] 면적만 바뀌어도 결과가 따라온다 — 같은 단가, 두 면적", () => {
    const base = { standardPricePerSqmAtTransfer: "1,000,000", landStandardPriceAtTransfer: "" };
    expect(resolveLandStdAtTransfer({ ...base, transferArea: "100" })).toBe(100_000_000);
    expect(resolveLandStdAtTransfer({ ...base, transferArea: "200" })).toBe(200_000_000);
  });

  it("[A7-03] 소수 면적도 절사 규약이 같다 (writeLandStd·LandPriceLookupField와 동일 floor)", () => {
    const v = resolveLandStdAtTransfer({
      standardPricePerSqmAtTransfer: "1,234,567",
      transferArea: "33.33",
    });
    expect(v).toBe(Math.floor(1_234_567 * 33.33)); // 41,148,118
  });

  it("[A7-04] 단가가 없으면 저장값으로 후퇴 (legacy·총액만 있는 자산)", () => {
    const v = resolveLandStdAtTransfer({
      transferArea: "212",
      landStandardPriceAtTransfer: "501,600,000",
    });
    expect(v).toBe(501_600_000);
  });

  it("[A7-05] 면적이 없으면 저장값으로 후퇴", () => {
    const v = resolveLandStdAtTransfer({
      standardPricePerSqmAtTransfer: "2,368,000",
      landStandardPriceAtTransfer: "501,600,000",
    });
    expect(v).toBe(501_600_000);
  });

  it("[A7-06] 아무것도 없으면 undefined — 0으로 만들지 않는다 (validate가 '미입력'으로 차단해야 함)", () => {
    expect(resolveLandStdAtTransfer({})).toBeUndefined();
    expect(
      resolveLandStdAtTransfer({
        standardPricePerSqmAtTransfer: "0",
        transferArea: "0",
        landStandardPriceAtTransfer: "0",
      }),
    ).toBeUndefined();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 배선 anchor — API 변환이 실제로 헬퍼를 쓰는가
//
// 헬퍼만 고치고 호출부를 되돌리면(저장값 우선) 위 단위 테스트는 전부 통과하면서
// 엔진에는 다시 stale이 흘러간다. 페이로드까지 고정해 그 회귀를 막는다.
// ──────────────────────────────────────────────────────────────────────────────

describe("A7 — buildSplitPayload가 파생값을 엔진에 넣는다", () => {
  /** 양도시 토지분 기준시가가 페이로드에 실리는 조합: 구분양도(actual) + 토지 환산. */
  function splitAsset(over: Partial<AssetForm> = {}): AssetForm {
    return {
      ...makeDefaultAsset(1),
      assetKind: "housing",
      hasSeperateLandAcquisitionDate: true,
      saleSplitMode: "actual",
      landAcqMode: "estimated",
      buildingAcqMode: "estimated",
      actualSalePrice: "1,000,000,000",
      landTransferPrice: "600,000,000",
      standardPricePerSqmAtTransfer: "2,368,000",
      transferArea: "212",
      buildingStandardPriceAtTransfer: "125,400,000",
      ...over,
    };
  }

  function payload(over: Partial<AssetForm> = {}) {
    return buildSplitPayload(splitAsset(over), {
      isBurdenedGift: false,
      usesPhd: false,
      ratioed: (v) => parseAmount(v ?? "") || undefined,
    });
  }

  it("[A7-07] stale 저장값이 있어도 단가 × 면적이 실린다", () => {
    const p = payload({ landStandardPriceAtTransfer: "250,800,000" });
    expect(p.landStandardPriceAtTransfer).toBe(Math.floor(2_368_000 * 212));
  });

  it("[A7-08] ①에서 면적만 고쳐도 페이로드가 따라온다", () => {
    const before = payload({ transferArea: "106", landStandardPriceAtTransfer: "250,808,000" });
    const after = payload({ transferArea: "212", landStandardPriceAtTransfer: "250,808,000" });
    expect(before.landStandardPriceAtTransfer).toBe(Math.floor(2_368_000 * 106));
    expect(after.landStandardPriceAtTransfer).toBe(Math.floor(2_368_000 * 212));
    expect(after.landStandardPriceAtTransfer).not.toBe(before.landStandardPriceAtTransfer);
  });

  it("[A7-09] 건물분(나목)은 저장값 그대로 — 국세청장 산정액이라 직접 입력이 정본", () => {
    const p = payload();
    expect(p.buildingStandardPriceAtTransfer).toBe(125_400_000);
  });
});
