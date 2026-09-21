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
import { canDeclareRentalHousingException } from "@/lib/calc/rental-housing-exception-scope";

interface Props {
  asset: AssetForm;
  /** 자산 인덱스 — §155⑳ 위치 축 게이트(④는 primary만 보낸다). */
  assetIndex: number;
  onChange: (patch: Partial<AssetForm>) => void;
  transferDate?: string;
}

export function AssetSectionExtras({ asset, assetIndex, onChange, transferDate }: Props) {
  /**
   * 🔴 **컴패니언에는 §155⑳ 카드를 띄우지 않는다** (P6-c-4). ④는 단건·다건 모두 primary만
   *    보낸다 — 엔진 입력의 `rentalHousingException`이 top-level **단일 객체**이기 때문이다.
   *    종전에는 ⑤가 모든 주택 자산에 카드를 띄우고 ⑧도 모든 자산을 검증해서, 컴패니언에서
   *    토글을 켜면 **계산이 차단되는데 다 채워도 세액이 한 푼도 안 달라졌다**(실측).
   */
  const canDeclareRental = canDeclareRentalHousingException(asset.assetKind, assetIndex);
  /**
   * 🔑 **stale 선언은 말로 밝힌다**(OH-20). 값을 지우지는 않는다 — 세액 영향이 0이라 남아도
   *    무해하고, 첫 자산을 지우면 이 자산이 primary로 승격하므로 그때 선언이 살아 있어야 한다.
   */
  const hasOrphanRentalDeclaration =
    !canDeclareRental && asset.rentalHousingException?.applyException === true;
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

      {/* 장기임대주택 보유자 거주주택 비과세 특례 — 주택 **주 자산**에만 표시 (소령 §155⑳) */}
      {hasOrphanRentalDeclaration && (
        <div
          className="rounded-lg border border-amber-200 bg-amber-50/40 p-3 text-xs text-amber-900"
          data-testid="rental-exception-companion-notice"
        >
          <p className="font-semibold">
            장기임대주택 거주주택 특례(소령 §155⑳)는 이 자산에 적용되지 않습니다
          </p>
          <p className="mt-0.5 leading-relaxed">
            이 특례는 <strong>양도 대상 거주주택 1건</strong>에 대한 것이라 <strong>자산 1</strong>에서만
            선언합니다. 여기 남아 있는 선언은 세액에 반영되지 않습니다 — 자산 1로 옮겨 입력하세요.
          </p>
        </div>
      )}
      {canDeclareRental && (
        <RentalHousingExceptionSection
          rh={asset.rentalHousingException ?? { ...RENTAL_HOUSING_EXCEPTION_DEFAULTS }}
          asset={asset}
          acquisitionDate={asset.acquisitionDate}
          transferDate={transferDate ?? ""}
          mode="calc"
          onChangeResidence={(patch) => onChange(patch)}
          onChange={(rh) => onChange({ rentalHousingException: rh })}
        />
      )}
    </>
  );
}
