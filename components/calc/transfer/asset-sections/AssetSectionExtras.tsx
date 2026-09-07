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
import { isRentalHousingExceptionApplicable } from "@/lib/calc/rental-housing-exception-scope";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  transferDate?: string;
}

export function AssetSectionExtras({ asset, onChange, transferDate }: Props) {
  return (
    <>
      {/*
        비사업용 토지 정밀 판정.

        🔴 **`nblUseDetailedJudgment`를 게이트에 넣지 말 것** (2026-09-07 재검증 H7).
           `NblSectionContainer`는 그 플래그가 false일 때 **「+ 상세 판정 시작」 복귀 버튼**을
           렌더한다. 게이트에 플래그를 걸면 그 분기가 도달 불가가 되어, 컨테이너 안의 「접기」를
           누르는 순간 **되돌릴 수단이 함께 사라진다**.

           주 자산은 `SpecialSituationSection`에 별도 복귀 라디오(「판정 도움/판정 완료」)가 있어
           복구되지만, 컴패니언 카드에는 그것이 없어 **비가역**이었다. 그 상태에서
           `isNonBusinessLand`는 true로 남으므로 ④는 상세 페이로드를 안 보내고 엔진은
           지목·재촌·유예기간 판정 없이 §104①8호 +10%p만 확정한다 — 조용한 모드 강등이다.
      */}
      {asset.assetKind === "land" && asset.isNonBusinessLand && (
        <NblSectionContainer asset={asset} onAssetChange={onChange} transferDate={transferDate} />
      )}

      {/* 장기임대주택 보유자 거주주택 비과세 특례 — 주택 자산에만 표시 (소령 §155⑳) */}
      {isRentalHousingExceptionApplicable(asset.assetKind) && (
        <RentalHousingExceptionSection
          rh={asset.rentalHousingException ?? { ...RENTAL_HOUSING_EXCEPTION_DEFAULTS }}
          asset={asset}
          acquisitionDate={asset.acquisitionDate}
          transferDate={transferDate ?? ""}
          onChangeResidence={(patch) => onChange(patch)}
          onChange={(rh) => onChange({ rentalHousingException: rh })}
        />
      )}
    </>
  );
}
