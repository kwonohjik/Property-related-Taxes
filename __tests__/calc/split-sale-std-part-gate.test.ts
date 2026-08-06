/**
 * 양도시 기준시가 필수 판정 — **구분양도에서도 양쪽 필수** (Phase 1-D)
 *
 * 계획서: docs/02-design/features/transfer-split-std-price-colocation.plan.md §8.1
 *        · general-building-sale-split-mode.plan.md §12.7 (R-7)
 *
 * ## 🔴 2026-08-06 — 이 파일의 계약은 **뒤집혔다**
 *
 * 종전 계약(2026-07-30 파트 배치): 「구분양도 + 토지만 환산 → **토지분만** 요구」.
 * 그 근거는 **「건물이 실지거래가액이면 건물 양도시 기준시가는 계산 어디에도 등장하지 않는다」**
 * 였다. 그 전제가 깨졌다.
 *
 * 「소득세법」 제100조 **제3항**이 구분 기장한 가액을 **안분계산한 가액과 비교**하도록 요구하고,
 * 안분값은 「부가가치세법 시행령」 제64조 제1항에 따라 **양도시 토지·건물 기준시가 양쪽**에서
 * 나온다 ⇒ 실가 파트의 기준시가도 **판정에 등장한다**.
 *
 * ⚠️ 「기준시가가 없으면 30% 판정을 건너뛴다」는 채택하지 않았다 — 칸을 비워 두는 것만으로 가드를
 *    우회할 수 있으면 가드가 아니다(계획서 §12.7이 그 대안을 명시적으로 기각했다).
 *    ⇒ 노출을 없애는 대신 **필수로** 만들었고, 배치는 「항상 축 A」로 불변이 됐다
 *      (`saleStdPlacement` — dead-end 없음: 축 A 카드는 구분/일괄 라디오와 같은 섹션에 있다).
 *
 * ## dead-end 검증 (이 파일이 지키는 것)
 *
 * 요구하는 값은 **반드시 화면에 있어야** 한다. 그 parity는 `needsSaleStdPart`가
 * `saleStdPlacement`에서 파생되는 구조로 보장하고(`split-sale-std-placement.test.ts`),
 * 여기서는 **validate가 실제로 양쪽을 요구하는지**를 고정한다.
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

describe("A. 구분양도에서도 양도시 기준시가 **양쪽** 필수 (§100③)", () => {
  it("A1 🔴 토지만 환산 + 토지 std만 → **차단** (종전 계약의 반대)", () => {
    const err = validateSplitDirectInputs(
      asset({
        landAcqMode: "estimated",
        buildingAcqMode: "actual",
        buildingAcquisitionPrice: "100,000,000",
        standardPricePerSqmAtTransfer: "1,500,000",
        transferArea: "200",
        landStandardPriceAtTransfer: LAND_STD,
        // buildingStandardPriceAtTransfer 미입력 — 종전에는 「환산 분모로 안 쓰이니 불요」였다.
        // 이제는 §100③ 안분값의 분모로 등장하므로 필요하다.
      }),
      "자산 1",
    );
    expect(err, "건물분 기준시가가 없으면 안분값을 만들 수 없어 30% 판정이 불가능하다").toContain(
      "양도시 기준시가",
    );
  });

  it("A2 🔴 건물만 환산 + 건물 std만 → **차단**", () => {
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
    expect(err).toContain("양도시 기준시가");
  });

  it("A3 일괄양도 + 한쪽만 입력 → 차단 유지 (안분에는 양쪽 필요 — 무회귀)", () => {
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

  it("A4 🔴 양쪽 실가여도 요구한다 — 우회 경로를 남기지 않는다", () => {
    const err = validateSplitDirectInputs(
      asset({
        landAcqMode: "actual",
        buildingAcqMode: "actual",
        landAcquisitionPrice: "300,000,000",
        buildingAcquisitionPrice: "100,000,000",
      }),
      "자산 1",
    );
    expect(
      err,
      "이 조합을 통과시키면 칸을 비워 두는 것만으로 §100③ 가드를 우회할 수 있다",
    ).toContain("양도시 기준시가");
  });

  it("A5 selfOwns=building_only여도 양쪽 요구 — 구분 기재는 총액을 나눈다", () => {
    // 종전에는 「비소유 파트의 gain은 폐기되니 그 파트 분모도 불요」였다. 그러나 구분 기재는
    // **총액을 두 파트로 나누는** 행위이고, 과세되는 파트의 양도가액이 그 나눔에 직접 좌우된다
    // ⇒ 판정이 필요하고, 판정에는 양쪽 기준시가가 필요하다.
    const err = validateSplitDirectInputs(
      asset({
        selfOwns: "building_only",
        useEstimatedAcquisition: true,
        buildingStandardPriceAtTransfer: BLDG_STD,
        standardPricePerSqmAtAcq: "1,000,000",
        acquisitionArea: "100",
        standardPriceAtAcq: "250,000,000",
      }),
      "자산 1",
    );
    expect(err).toContain("양도시 기준시가");
  });

  it("A5b 양쪽 다 채우면 통과한다 — 요구가 충족 가능함을 확인 (dead-end 아님)", () => {
    const err = validateSplitDirectInputs(
      asset({
        landAcqMode: "actual",
        buildingAcqMode: "actual",
        landAcquisitionPrice: "300,000,000",
        buildingAcquisitionPrice: "100,000,000",
        landStandardPriceAtTransfer: "600,000,000",
        buildingStandardPriceAtTransfer: "400,000,000",
      }),
      "자산 1",
    );
    expect(err).toBeNull();
  });
});

/**
 * B. 기준시가 비율 안분 — 기존 §64①1호 정책 유지 (회귀 가드).
 *
 * 사용자가 **직접 입력한** 기준시가로 §166⑥ → 부가령 §64①1호의 법정 안분을 하는 것은 자동 안분
 * fallback이 아니다(2026-07-29 S1 확정). 그 정책은 그대로다 — 1-D가 바꾼 것은 **필수 범위**이지
 * 안분의 정당성이 아니다.
 */
describe("B. 기준시가 비율 안분 — §64①1호 정책 유지 (회귀 가드)", () => {
  it("A6 토지만 환산 + 양도가액 2칸 공백 + std 양쪽 → 통과 (법정 안분)", () => {
    const err = validateSplitDirectInputs(
      asset({
        landAcqMode: "estimated",
        buildingAcqMode: "actual",
        buildingAcquisitionPrice: "100,000,000",
        landTransferPrice: "", // 2칸 모두 공백 → 일괄 안분
        buildingTransferPrice: "",
        standardPricePerSqmAtTransfer: "1,500,000",
        transferArea: "200",
        landStandardPriceAtTransfer: LAND_STD,
        buildingStandardPriceAtTransfer: BLDG_STD,
      }),
      "자산 1",
    );
    expect(err).toBeNull();
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
    expect(err).toBeNull();
  });
});

describe("C. 메시지 토큰 보존 — 기존 anchor 4곳이 '양도시 기준시가' 부분문자열에 의존", () => {
  it("A9 파트별 메시지도 '양도시 기준시가' 연속 토큰을 포함한다", () => {
    const landErr = validateSplitDirectInputs(
      asset({ saleSplitMode: "apportioned", landTransferPrice: "" }),
      "자산 1",
    );
    expect(landErr).toContain("양도시 기준시가");
  });
});
