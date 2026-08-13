/**
 * anchor — F36 (2026-08 코드리뷰) **증축 × 「감정평가가액으로 안분」에서 감정평가가액이
 * 검증도 반영도 되지 않고 조용히 버려졌다**
 *
 * ## 결함
 *
 * 「증축 자산은 감정평가가액으로 안분할 수 없다」 차단이 `saleSplitMode === "actual"` 블록
 * **안**에만 있었다(`transfer-tax-validate-gb-sale.ts`). 그런데 안분 방식 라디오에는 별도의
 * `"appraisal"` 모드가 있고(`SALE_SPLIT_MODE_OPTIONS`), ④ 변환의 `saleAppraisalFields`는
 * 모드 게이트가 없어 감정 2필드를 **항상 전송**한다. 3-way 증축 엔진
 * (`general-building-extension.ts`)은 감정평가 필드를 읽지 않고 「소득세법 시행령」 §166⑥
 * 기준시가 3-way 안분만 하므로, 그 조합에서 감정평가가액이 **아무 데도 쓰이지 않았다**.
 *
 * ## 실측 (2026-08-13 · 총양도 20억 · 감정 토지 6억 / 건물 4억 · 증축 2015-06-01)
 *
 * | | validate | 안분 결과 |
 * |---|---|---|
 * | 증축 ON · 감정 有 (수정 전) | **null(통과)** | land 1,935,596,925 / building1 43,376,547 / building2 21,026,528 |
 * | 증축 ON · 감정 無            | null        | **완전히 동일** ← 감정이 버려졌다 |
 * | 증축 OFF · 감정 有           | null        | land 1,200,000,000 / building 800,000,000 ← 감정이 실제로 안분을 바꾼다 |
 *
 * ## 차단 범위
 *
 * `apportioned`·모드 미지정은 **제외**한다. `saleSplitModePatch("apportioned")`가 감정 3필드를
 * 비우기 이전에 저장된 자산에는 잔존 감정값이 남아 있을 수 있는데, 그 모드는 어차피 기준시가
 * 비율로 안분하므로 차단하면 지금 통과하는 입력을 거짓으로 막는 것이 된다.
 */
import { describe, it, expect } from "vitest";
import { buildGeneralBuildingValuation } from "@/lib/calc/transfer-tax-api-gb";
import { validateGeneralBuildingAsset } from "@/lib/calc/transfer-tax-validate-gb";
import { buildGeneralBuildingAssetCards } from "@/lib/tax-engine/general-building-valuation";
import { makeDefaultAsset } from "@/lib/stores/calc-wizard-asset";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

const TRANSFER = "2026-02-16";
const TOTAL_TRANSFER = 2_000_000_000;

const APPRAISAL = {
  landAppraisalAtTransfer: "600000000",
  buildingAppraisalAtTransfer: "400000000",
} as Partial<AssetForm>;

function gbExtAsset(over: Partial<AssetForm> = {}): AssetForm {
  return {
    ...makeDefaultAsset(1),
    assetKind: "general_building",
    acquisitionCause: "purchase",
    gbBuildingAcquisitionCause: "purchase",
    useEstimatedAcquisition: true,
    acquisitionDate: "1999-05-24",
    landAcquisitionDate: "1999-05-24",
    gbLandArea: "85",
    gbBuildingArea: "180.96",
    gbBuildingFootprintArea: "90.48",
    gbTransferLandPricePerSqm: "10830000",
    gbTransferBuildingValue: "20629440",
    gbAcqLandPricePerSqm: "2800000",
    gbAcqBuildingValue: "2814470",
    gbZoneType: "commercial",
    gbHasExtension: true,
    gbExtensionDate: "2015-06-01",
    gbExtensionAcquisitionCause: "newConstruction",
    gbExtensionAcquisitionMode: "estimated",
    gbTransferExtensionBuildingStdPrice: "10000000",
    gbAcquisitionExtensionBuildingStdPrice: "6000000",
    ...over,
  } as AssetForm;
}

const v = (asset: AssetForm) => validateGeneralBuildingAsset(asset, "자산1", TRANSFER);

function allocationOf(asset: AssetForm): number[] {
  const payload = buildGeneralBuildingValuation(asset, TRANSFER) as Record<string, unknown>;
  return buildGeneralBuildingAssetCards({
    ...payload,
    totalTransferPrice: TOTAL_TRANSFER,
    transferDate: new Date(TRANSFER),
    acquisitionDate: new Date(asset.acquisitionDate),
    landAcquisitionDate: new Date(asset.landAcquisitionDate || asset.acquisitionDate),
    ownershipRatio: 1,
  } as never).assetCards.map((c) => c.transferPrice);
}

describe("F36 — 증축 × 감정평가 안분은 모드를 가리지 않고 차단된다", () => {
  it("🔴 「감정평가가액으로 안분」 모드에서도 차단된다 (종전 통과)", () => {
    const err = v(gbExtAsset({ saleSplitMode: "appraisal", ...APPRAISAL }));
    expect(err).toContain("감정평가가액으로 안분할 수 없습니다");
  });

  it("구분 기재(actual) 모드의 종전 차단은 그대로다 — 블록 밖으로 옮겨도 유지", () => {
    const err = v(
      gbExtAsset({ saleSplitMode: "actual", landTransferPrice: "1500000000", ...APPRAISAL }),
    );
    expect(err).toContain("감정평가가액으로 안분할 수 없습니다");
  });

  it("감정평가가액이 없으면 감정 모드여도 통과한다 — 차단 사유는 감정값이다", () => {
    expect(v(gbExtAsset({ saleSplitMode: "appraisal" }))).toBeNull();
  });

  it("🔑 기준시가 안분(apportioned)의 잔존 감정값은 차단하지 않는다 — 거짓 차단 금지", () => {
    expect(v(gbExtAsset({ saleSplitMode: "apportioned", ...APPRAISAL }))).toBeNull();
    // 모드 미지정(레거시 자산)도 화면 기본값이 apportioned이므로 같다.
    expect(v(gbExtAsset(APPRAISAL))).toBeNull();
  });

  it("증축이 없으면 감정 모드가 정상 경로다 — 차단 대상이 아니다", () => {
    expect(v(gbExtAsset({ gbHasExtension: false, saleSplitMode: "appraisal", ...APPRAISAL }))).toBeNull();
  });
});

/**
 * 차단의 **근거**를 고정한다 — 「증축이면 감정이 계산에 도달하지 않는다」가 사실이 아니게 되면
 * (예: 3-way가 감정 basis를 지원하게 되면) 이 단언이 먼저 깨져 차단 자체를 재검토하게 만든다
 * (`feedback_negative_assertion_needs_mutation_probe`).
 */
describe("F36 근거 — 증축 3-way는 감정평가가액을 읽지 않는다", () => {
  it("🔑 증축 ON에서는 감정 有·無의 안분값이 원 단위까지 같다", () => {
    const withApp = allocationOf(gbExtAsset({ saleSplitMode: "appraisal", ...APPRAISAL }));
    const without = allocationOf(gbExtAsset({ saleSplitMode: "appraisal" }));
    expect(withApp).toEqual([1_935_596_925, 43_376_547, 21_026_528]);
    expect(withApp).toEqual(without);
  });

  it("🔑 대조군 — 증축 OFF에서는 같은 감정평가가액이 안분을 바꾼다", () => {
    const withApp = allocationOf(
      gbExtAsset({ gbHasExtension: false, saleSplitMode: "appraisal", ...APPRAISAL }),
    );
    expect(withApp).toEqual([1_200_000_000, 800_000_000]);
  });

  it("④는 모드와 무관하게 감정 2필드를 싣는다 — 그래서 ⑧이 유일한 관문이다", () => {
    const payload = buildGeneralBuildingValuation(
      gbExtAsset({ saleSplitMode: "appraisal", ...APPRAISAL }),
      TRANSFER,
    ) as Record<string, unknown>;
    expect(payload.landAppraisalAtTransfer).toBe(600_000_000);
    expect(payload.buildingAppraisalAtTransfer).toBe(400_000_000);
  });
});
