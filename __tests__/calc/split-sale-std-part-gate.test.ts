/**
 * Pre-Do anchor — 양도시 기준시가 **파트별** 필수 판정 (§7.2 게이트 파트 분해).
 *
 * 계획서: docs/02-design/features/transfer-split-std-price-colocation.plan.md §8.1
 *
 * 배경: 기준시가 카드를 "그 값을 쓰는 섹션 아래"로 옮기면(이미지 6·7),
 *   · 구분양도 + **토지만** 환산 → 토지 양도시 기준시가만 화면에 있다
 *   · 구분양도 + **건물만** 환산 → 건물 양도시 기준시가만 화면에 있다
 * 그런데 현행 validate는 한쪽만 환산이어도 **양쪽**을 요구한다 → 입력 칸 없는 차단(dead-end).
 * 반대로 화면에서 사라진 파트의 **잔존값**이 양도가액 안분 분모로 살아남는 경로도 열린다
 * (`splitPair(total, undefined, undefined, saleRatio)` — transfer-tax-split-gain.ts:409-420).
 *
 * 이 anchor는 **Do 착수 전에 현행 실패를 확인**하기 위한 것이다(A1·A2·A5·A6 🔴 예상).
 */
import { describe, it, expect } from "vitest";
import { validateSplitDirectInputs } from "@/lib/calc/transfer-tax-validate-split";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset-factory";

const LAND_STD = "300,000,000";
const BLDG_STD = "100,000,000";

/** 분리 축 활성 + 구분양도(actual) 기본형. 양도가액 한쪽 입력으로 V4는 통과시킨다. */
function asset(over: Partial<ReturnType<typeof makeDefaultAsset>> = {}) {
  return {
    ...makeDefaultAsset(1),
    assetKind: "housing" as const,
    hasSeperateLandAcquisitionDate: true,
    saleSplitMode: "actual" as const,
    actualSalePrice: "1,000,000,000",
    fixedAcquisitionPrice: "400,000,000",
    landTransferPrice: "600,000,000", // V4 통과용 — 구분 근거 있음
    ...over,
  };
}

describe("A. 파트별 양도시 기준시가 필수 — 한쪽만 환산이면 그 파트만 요구", () => {
  it("A1 🔴 구분양도 + 토지만 환산 + 토지 std만 입력 → 통과해야 한다", () => {
    const err = validateSplitDirectInputs(
      asset({
        landAcqMode: "estimated",
        buildingAcqMode: "actual",
        buildingAcquisitionPrice: "100,000,000",
        standardPricePerSqmAtTransfer: "1,500,000",
        transferArea: "200",
        landStandardPriceAtTransfer: LAND_STD,
        // buildingStandardPriceAtTransfer 미입력 — 건물은 실가라 환산 분모가 필요 없다
      }),
      "자산 1",
    );
    expect(
      err,
      "건물이 실지거래가액이면 건물 양도시 기준시가는 계산 어디에도 등장하지 않는다 (split-gain.ts:258-262)",
    ).toBeNull();
  });

  it("A2 🔴 구분양도 + 건물만 환산 + 건물 std만 입력 → 통과해야 한다", () => {
    const err = validateSplitDirectInputs(
      asset({
        landAcqMode: "actual",
        buildingAcqMode: "estimated",
        landAcquisitionPrice: "300,000,000",
        buildingStandardPriceAtTransfer: BLDG_STD,
        // landStandardPriceAtTransfer 미입력
      }),
      "자산 1",
    );
    expect(err).toBeNull();
  });

  it("A3 일괄양도 + 한쪽만 입력 → 차단 유지 (안분에는 양쪽 필요)", () => {
    const err = validateSplitDirectInputs(
      asset({
        saleSplitMode: "apportioned",
        landTransferPrice: "",
        standardPricePerSqmAtTransfer: "1,500,000",
        transferArea: "200",
        landStandardPriceAtTransfer: LAND_STD,
      }),
      "자산 1",
    );
    expect(err).toContain("양도시 기준시가");
  });

  it("A4 구분양도 + 양쪽 실가 → 양도시 기준시가 요구 없음", () => {
    const err = validateSplitDirectInputs(
      asset({
        landAcqMode: "actual",
        buildingAcqMode: "actual",
        landAcquisitionPrice: "300,000,000",
        buildingAcquisitionPrice: "100,000,000",
      }),
      "자산 1",
    );
    expect(err).toBeNull();
  });

  it("A5 🔴 selfOwns=building_only + 환산 → 건물분만 요구 (토지 gain은 폐기됨)", () => {
    const err = validateSplitDirectInputs(
      asset({
        selfOwns: "building_only",
        useEstimatedAcquisition: true, // 파트 라디오 비노출 → legacy 파생으로 양쪽 estimated
        buildingStandardPriceAtTransfer: BLDG_STD,
        // landStandardPriceAtTransfer 미입력 — 토지는 타인 소유라 그 gain을 버린다
        //                                     (transfer-tax.ts:315-316)
        // ⚠️ 2026-07-30 — **취득시** 기준시가를 픽스처에 추가했다. 이 검증의 관심사는
        //    「양도시」 기준시가 축인데, 종전 픽스처는 취득시 기준시가도 비워 두고 통과를
        //    기대했다. 그 조합은 양쪽 환산이라 취득시 기준시가가 **반드시 필요**하며
        //    (환산 분자), 없으면 엔진이 조용히 null을 반환해 `selfOwns`가 무시된다.
        //    V8이 그 갭을 메우므로 이 축을 만족시킨 뒤 원래 대상만 검증한다.
        standardPricePerSqmAtAcq: "1,000,000",
        acquisitionArea: "100",
        standardPriceAtAcq: "250,000,000",
      }),
      "자산 1",
    );
    expect(
      err,
      "비소유 파트는 파트 섹션 자체가 렌더되지 않아 입력 칸이 없다 — 요구하면 dead-end",
    ).toBeNull();
  });
});

/**
 * B. 잔존 기준시가로 양도가액이 안분되는 경로 — **차단하지 않는다**(2026-07-30 확정).
 *
 * 검토 초안은 이를 Critical 결함으로 봤으나, 실측 결과 **이번 배치 변경이 만드는 상황이 아니다**:
 * 구분양도 + 양쪽 실지거래가액에서는 현행 `needsSaleStdPrice`
 * (LandBuildingSaleSplitSection.tsx:183-186)도 false라 축 A 카드가 **이미** 숨는다.
 * 2026-07-29에 그 경로를 "정당한 입력"으로 확정했고(S1 해소), 사용자가 **직접 입력한**
 * 기준시가로 §166⑥ → 부가세령 §64①1호의 법정 안분을 하는 것은 자동 안분 fallback이 아니다.
 * 값은 모드를 되돌리면 화면에 복귀한다(표시 게이트만).
 */
describe("B. 잔존 기준시가 안분 — 기존 §64①1호 정책 유지 (회귀 가드)", () => {
  it("A6 구분양도 + 토지만 환산 + 양도가액 2칸 공백 + 건물 std 잔존 → 통과 (법정 안분)", () => {
    const err = validateSplitDirectInputs(
      asset({
        landAcqMode: "estimated",
        buildingAcqMode: "actual",
        buildingAcquisitionPrice: "100,000,000",
        landTransferPrice: "", // 2칸 모두 공백
        buildingTransferPrice: "",
        standardPricePerSqmAtTransfer: "1,500,000",
        transferArea: "200",
        landStandardPriceAtTransfer: LAND_STD,
        // 일괄양도에서 입력했다가 구분양도로 되돌린 뒤 남은 값 — 이 배치에서는 **화면에 없다**
        buildingStandardPriceAtTransfer: BLDG_STD,
      }),
      "자산 1",
    );
    expect(
      err,
      "S1 정책(2026-07-29) 유지 — 사용자가 입력한 기준시가 비율 안분은 §64①1호 법정 방법이다",
    ).toBeNull();
  });

  it("A7 양쪽 환산 + std 2필드 + 양도가액 공백 → 통과 유지 (S1 시나리오 보존)", () => {
    const err = validateSplitDirectInputs(
      asset({
        landAcqMode: "estimated",
        buildingAcqMode: "estimated",
        landTransferPrice: "",
        buildingTransferPrice: "",
        standardPricePerSqmAtTransfer: "1,500,000",
        transferArea: "200",
        landStandardPriceAtTransfer: LAND_STD,
        buildingStandardPriceAtTransfer: BLDG_STD,
      }),
      "자산 1",
    );
    expect(
      err,
      "양쪽 환산이면 두 카드가 모두 화면에 있다 — 사용자가 보고 입력한 값이므로 안분이 정당",
    ).toBeNull();
  });
});

describe("C. 메시지 토큰 보존 — 기존 anchor 4곳이 'ㅇ도시 기준시가' 부분문자열에 의존", () => {
  it("A9 파트별 메시지도 '양도시 기준시가' 연속 토큰을 포함한다", () => {
    const landErr = validateSplitDirectInputs(
      asset({ saleSplitMode: "apportioned", landTransferPrice: "" }),
      "자산 1",
    );
    expect(landErr).toContain("양도시 기준시가");
  });
});
