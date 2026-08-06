/**
 * anchor: 별개 취득(토지·건물 취득시점 상이) — 자산 전체 「취득가액」 총액을 요구하면 안 된다.
 *
 * 🔴 버그 재현 (2026-07-29 사용자 보고):
 *   토지 취득가액 150,000,000 + 건물 취득가액 100,000,000을 모두 입력했는데
 *   "자산: 취득가액을 입력하세요."로 계산이 차단됨.
 *
 * 원인: 별개 취득이면 UI가 자산 전체 취득가액 칸을 숨기고(CompanionAcqPurchaseBlock의
 * `isSeparateAcq` 게이트 — "별개 취득이면 파트 블록이 대신한다") 파트별 칸으로 대체하는데,
 * validate는 여전히 `fixedAcquisitionPrice`(총액)를 필수로 요구했다.
 * → 입력할 칸이 화면에 없는데 그 칸을 채우라고 막는 상태(⑧ 규칙 위반).
 *
 * 파트별 취득가액 필수는 `validateSplitDirectInputs` → `validateSeparateAcqParts`(V1·V2)가
 * 이미 담당한다 — 총액 검사는 별개 취득에서 폐지돼야 한다(소득세법 §97①1호·§114⑦).
 */
import { describe, it, expect } from "vitest";
import { validateAssetAcquisition } from "@/lib/calc/transfer-tax-validate-asset";
import { isSeparateAcquisition } from "@/lib/calc/transfer-tax-split-acq-mode";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";

/** 사용자 보고 화면과 동일한 입력 상태 */
function separateAcqAsset(over: Partial<ReturnType<typeof makeDefaultAsset>> = {}) {
  return {
    ...makeDefaultAsset(1),
    assetKind: "building" as const,
    acquisitionCause: "purchase" as const,
    hasSeperateLandAcquisitionDate: true,
    acquisitionDate: "2025-08-29", // 건물 취득일
    landAcquisitionDate: "2025-01-08", // 토지 취득일 (≠ 건물)
    landAcqMode: "actual" as const,
    buildingAcqMode: "actual" as const,
    landAcquisitionPrice: "150,000,000",
    buildingAcquisitionPrice: "100,000,000",
    fixedAcquisitionPrice: "", // ← UI에 칸 자체가 없다
    saleSplitMode: "actual" as const,
    actualSalePrice: "500,000,000",
    // 양도가액 구분 근거 — 구분양도를 골랐으면 §166⑥상 필수다(V4). 이 anchor의 검증 대상은
    // "자산 전체 취득가액 총액을 요구하지 않는다"이므로, 무관한 V4 오류가 먼저 걸리지 않게 채운다.
    landTransferPrice: "300,000,000",
    // **양도시** 기준시가 — Phase 1-D부터 구분 기재 시 필수다(§100③). 잔액 도출분(건물 2억)도
    // 판정 대상이라 양쪽이 필요하다. 이 anchor의 대상은 「자산 전체 취득가액 총액을 요구하지
    // 않는다」이므로 무관한 V7 오류가 먼저 걸리지 않게 3:2로 채운다.
    landStandardPriceAtTransfer: "300,000,000",
    buildingStandardPriceAtTransfer: "200,000,000",
    ...over,
  };
}

describe("별개 취득 — 자산 전체 취득가액 총액 요구 금지", () => {
  it("전제: 이 자산은 별개 취득으로 판정된다", () => {
    expect(isSeparateAcquisition(separateAcqAsset())).toBe(true);
  });

  it("🔴 토지·건물 취득가액을 모두 입력했으면 총액 미입력으로 차단하지 않는다", () => {
    const err = validateAssetAcquisition(separateAcqAsset(), "자산", "2026-03-01");
    expect(err, "입력할 칸이 화면에 없는 총액을 요구하면 계산이 영구 차단된다").toBeNull();
  });

  it("파트 취득가액이 비면 **파트 단위** 오류로 차단한다 (총액 오류 아님)", () => {
    const err = validateAssetAcquisition(
      separateAcqAsset({ buildingAcquisitionPrice: "" }),
      "자산",
      "2026-03-01",
    );
    expect(err).toContain("건물 취득가액");
    expect(err, "총액 문구로 되돌아가면 사용자가 어디를 채울지 알 수 없다").not.toBe(
      "자산: 취득가액을 입력하세요.",
    );
  });

  it("회귀 0 — 별개 취득이 아니면 총액은 여전히 필수", () => {
    const err = validateAssetAcquisition(
      separateAcqAsset({
        hasSeperateLandAcquisitionDate: false,
        landAcquisitionDate: "",
      }),
      "자산",
      "2026-03-01",
    );
    expect(err).toBe("자산: 취득가액을 입력하세요.");
  });

  it("회귀 0 — 분리 토글은 켰지만 취득일이 같으면(겸용·소유자분리 경로) 총액 필수 유지", () => {
    const err = validateAssetAcquisition(
      separateAcqAsset({ landAcquisitionDate: "2025-08-29" }), // 건물 취득일과 동일
      "자산",
      "2026-03-01",
    );
    expect(err).toBe("자산: 취득가액을 입력하세요.");
  });
});
