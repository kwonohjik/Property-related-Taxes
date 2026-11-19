"use client";

/**
 * ⑤ 기타 특례 — 비사업용 토지 정밀판정(land) / 장기임대 거주주택 특례(housing·입주권).
 * CompanionAssetCard L701–720 JSX를 그대로 이동 (border-t 래퍼는 AssetSection 컨테이너로 대체).
 * 조건부 섹션 — 호출부(orchestrator)가 둘 중 하나라도 적용될 때만 렌더.
 */
import type { RentalResidenceRequirementFacts } from "@/lib/calc/rental-residence-requirement-status";
import type { MergeRentalState } from "@/lib/calc/merge-rental-carveout-form";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { NblSectionContainer } from "../nbl/NblSectionContainer";
import { NblDesignatedAreaQuestion } from "../nbl/NblDesignatedAreaQuestion";
import { NblScreeningToggle } from "../nbl/NblScreeningToggle";
import { RentalHousingExceptionSection } from "../RentalHousingExceptionSection";
import { RENTAL_HOUSING_EXCEPTION_DEFAULTS } from "@/lib/stores/calc-wizard-asset-factory";
import { canDeclareRentalHousingException } from "@/lib/calc/rental-housing-exception-scope";
import { primaryAcquisitionDateOf } from "@/lib/calc/transfer-tax-api-carryover";
import { calcEffectiveWasRegulatedAtAcquisition } from "@/lib/calc/effective-regulated-at-acquisition";

interface Props {
  asset: AssetForm;
  /** 자산 인덱스 — §155⑳ 위치 축 게이트(④는 primary만 보낸다). */
  assetIndex: number;
  /**
   * 판정 메뉴에서 사실을 넘겨받은 적이 있는가 (`hasJudgmentProvenance`) — P6-c-5.
   * 안내 문구가 「판정하러 가세요」/「선언이 없습니다」를 가른다.
   */
  judgmentLoaded?: boolean;
  onChange: (patch: Partial<AssetForm>) => void;
  transferDate?: string;
  /** 폼-전역 「취득 당시 조정대상지역」 저장값 — 주소(법정동코드)가 없을 때만 쓴다(G1-13). */
  wasRegulatedAtAcquisition?: boolean;
  /** ④의 법정동코드 폴백(`form.regionCode`) */
  formRegionCode?: string;
  /** §155④⑤ × ⑳ 상대 쪽 임대 — ⑧과 같은 술어(첫 자산) */
  mergeRental?: MergeRentalState;
  /** §155⑳ 카드 거주·보유 표시용 폼 사실(상생임대 · §154① 단서) — ⑧과 같은 값 */
  rentalResidenceFacts?: Pick<RentalResidenceRequirementFacts, "winWinResidenceExempt" | "provisoReason" | "provisoScope">;
}

export function AssetSectionExtras({ asset, assetIndex, judgmentLoaded, onChange, transferDate, wasRegulatedAtAcquisition, formRegionCode, mergeRental, rentalResidenceFacts }: Props) {
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
        비사업용 토지 표지·정밀 판정.

        NBL2611-R21 — **함께 양도 토지 카드(자산 2 이후)는 주 자산과 같은 「비사업용 토지 여부 검토」 토글을 갖는다**(Q-9 (가) · `NblScreeningToggle`).
           종전에는 이 카드에 토글이 없어 공익수용 프리필이 켠 표지를 끌 수 없었다. 정밀판정을 접으면(`nblUseDetailedJudgment` false) ④가 raw를 안 보내
           서버는 표지만 보고 카드 전량에 +10%p를 붙이는데, 표지를 끌 수단이 없어 비가역이었다. 이제 토글 해제가 표지와 정밀판정을 함께 끈다.
           주 자산(자산 1)은 Step4 `SpecialSituationSection`이 같은 컴포넌트를 쓰므로 여기서는 그리지 않는다.

        🔴 **컴패니언의 정밀판정 입력(`NblSectionContainer`)은 라디오가 「판정 도움 필요」일 때만 그린다.** 토글 아래 라디오가 복귀 수단이라
           컨테이너 안의 「+ 상세 판정 시작」 복귀 버튼은 중복이다. 자산 1은 종전 그대로(표지만 보고 그린다 — 복귀 라디오는 Step4에 있다).
      */}
      {/* 주택 부수토지(`landNature: "appurtenant"`)는 한도 초과분이 엔진에서 자동으로 비사업용 토지 카드가 된다 — 토글을 새로 켜게 하지 않는다(이미 켜져 있으면 끌 수 있게 둔다). */}
      {asset.assetKind === "land" && assetIndex > 0 && (asset.landNature !== "appurtenant" || asset.isNonBusinessLand) && (
        <NblScreeningToggle asset={asset} onChange={onChange} transferDate={transferDate} idSuffix={`companion-${assetIndex}`} />
      )}
      {asset.assetKind === "land" && asset.isNonBusinessLand && (assetIndex === 0 || asset.nblUseDetailedJudgment) && (
        <NblSectionContainer asset={asset} onAssetChange={onChange} transferDate={transferDate} />
      )}
      {/* 양도일 2009.3.16.~2015.12.31.의 비사업용 토지 — 8호 중과 유예 요건(지정지역 여부). 그 기간에만 뜬다. 컴패니언은 위 토글 안에 같은 질문이 있다. */}
      {asset.assetKind === "land" && asset.isNonBusinessLand && assetIndex === 0 && (
        <NblDesignatedAreaQuestion
          transferDate={transferDate}
          value={asset.isDesignatedArea}
          onChange={(isDesignatedArea) => onChange({ isDesignatedArea })}
          idSuffix={`companion-${assetIndex}`}
        />
      )}
      {/* 주택 부수토지 컴패니언 — 토글은 꺼져 있어도 한도 초과분이 엔진에서 자동으로 비사업용 토지 카드(`__excess`)가 된다. 같은 유예 질문을 한다. */}
      {asset.assetKind === "land" && !asset.isNonBusinessLand && asset.landNature === "appurtenant" && (
        <NblDesignatedAreaQuestion
          transferDate={transferDate}
          value={asset.isDesignatedArea}
          onChange={(isDesignatedArea) => onChange({ isDesignatedArea })}
          idSuffix={`companion-appurtenant-${assetIndex}`}
          subject="한도 초과분 토지(주택 부수토지 배율 초과)"
        />
      )}

      {/* 장기임대주택 보유자 거주주택 비과세 특례 — 주택 **주 자산**에만 표시 (소령 §155⑳) */}
      {hasOrphanRentalDeclaration && (
        <div
          className="rounded-lg border border-amber-200 bg-amber-50/40 p-3 text-xs text-amber-900 dark:text-amber-200 dark:bg-amber-950/40"
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
          acquisitionDate={primaryAcquisitionDateOf(asset) ?? ""}
          transferDate={transferDate ?? ""}
          mode="calc"
          judgmentLoaded={judgmentLoaded}
          onChangeResidence={(patch) => onChange(patch)}
          onChange={(rh) => onChange({ rentalHousingException: rh })}
          mergeRental={mergeRental}
          residenceFacts={rentalResidenceFacts}
          // §154⑩ 표준 경로(I-5) — 2019.2.12 전 취득 분기의 거주요건 실시간 표시. ⑧과 같은 실효값(G1-13).
          wasRegulatedAtAcquisition={calcEffectiveWasRegulatedAtAcquisition(asset, wasRegulatedAtAcquisition, formRegionCode, {
            isPrimary: assetIndex === 0,
          })}
        />
      )}
    </>
  );
}
