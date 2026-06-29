"use client";

/**
 * ⑤ 기타 특례 — 비사업용 토지 정밀판정(land) / 장기임대 거주주택 특례(housing·입주권).
 * CompanionAssetCard L701–720 JSX를 그대로 이동 (border-t 래퍼는 AssetSection 컨테이너로 대체).
 * 조건부 섹션 — 호출부(orchestrator)가 둘 중 하나라도 적용될 때만 렌더.
 */
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { NblSectionContainer } from "../nbl/NblSectionContainer";
import { RentalHousingExceptionSection } from "../RentalHousingExceptionSection";
import { RENTAL_HOUSING_EXCEPTION_DEFAULTS } from "@/lib/stores/calc-wizard-asset-factory";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  transferDate?: string;
}

export function AssetSectionExtras({ asset, onChange, transferDate }: Props) {
  return (
    <>
      {/* 비사업용 토지 정밀 판정 — "판정 도움" 모드일 때만 표시 */}
      {asset.assetKind === "land" && asset.isNonBusinessLand && asset.nblUseDetailedJudgment && (
        <NblSectionContainer asset={asset} onAssetChange={onChange} transferDate={transferDate} />
      )}

      {/* 장기임대주택 보유자 거주주택 비과세 특례 — 주택 자산에만 표시 (소령 §155⑳) */}
      {(asset.assetKind === "housing" || asset.assetKind === "right_to_move_in") && (
        <RentalHousingExceptionSection
          rh={asset.rentalHousingException ?? { ...RENTAL_HOUSING_EXCEPTION_DEFAULTS }}
          acquisitionDate={asset.acquisitionDate}
          transferDate={transferDate ?? ""}
          residencePeriodMonthsAsset={asset.residencePeriodMonthsAsset}
          onChangeResidencePeriodMonths={(v) => onChange({ residencePeriodMonthsAsset: v })}
          onChange={(rh) => onChange({ rentalHousingException: rh })}
        />
      )}
    </>
  );
}
