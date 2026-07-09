"use client";

import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { MixedUseLegacyStdPrice } from "./MixedUseLegacyStdPrice";
import { MixedUseAssetMajorStdPrice } from "./MixedUseAssetMajorStdPrice";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  transferDate?: string;
  useEstimatedAcquisition?: boolean;
  transferSectionNum?: number;
  acqSectionNum?: number;
  /** 소재지 지번 주소 — Vworld 공시지가 조회용 */
  jibun?: string;
}

/**
 * 겸용주택 기준시가 입력 — 레이아웃 오케스트레이터.
 *
 * - 용도변경 없음(`hasPartialUsageChange === false`) → 자산-우선(주택/상가) 레이아웃.
 *   상가건물은 한 번 계산으로 취득·양도 동시 입력(onApplyBoth), 오적용 footgun 제거.
 * - 보유 중 일부 용도변경(`hasPartialUsageChange === true`) → 현행 시점-우선(legacy) 레이아웃 유지
 *   (Case A 4부분 안분·Case B·방향 분기).
 *
 * 두 경로 모두 동일 폼 필드에 read/write → 엔진 페이로드 불변(API 변환 무관).
 * 섹션 번호: 시점-우선 ②양도/③취득, 자산-우선 ②주택/③상가 (parent 전달값 재사용).
 */
export function MixedUseStandardPriceInputs({
  asset,
  onChange,
  transferDate,
  useEstimatedAcquisition,
  transferSectionNum,
  acqSectionNum,
  jibun,
}: Props) {
  if (asset.hasPartialUsageChange) {
    return (
      <MixedUseLegacyStdPrice
        asset={asset}
        onChange={onChange}
        transferDate={transferDate}
        useEstimatedAcquisition={useEstimatedAcquisition}
        transferSectionNum={transferSectionNum}
        acqSectionNum={acqSectionNum}
        jibun={jibun}
      />
    );
  }

  return (
    <MixedUseAssetMajorStdPrice
      asset={asset}
      onChange={onChange}
      transferDate={transferDate}
      useEstimatedAcquisition={useEstimatedAcquisition}
      housingSectionNum={transferSectionNum}
      commercialSectionNum={acqSectionNum}
      jibun={jibun}
    />
  );
}
