"use client";

/**
 * 기타토지 «재산세 분류 근거» 입력 — NBL2611-V1-A (R19 · Q-1 (가)).
 *
 * 재산세 분류(종합합산·별도합산·분리과세·비과세) 칸 아래에서, 건축물 없는 토지의 비종합합산 선언을 뒷받침하는 **사실·출처**를 묻는다(리뷰 §7.4 — 결론 대신 사실).
 * 선택지·표시 여부·철거 바닥면적 칸은 엔진의 술어(`property-tax-basis.ts`)를 그대로 쓴다 — 화면·⑧·⑫·매퍼·엔진이 같은 조건이다.
 * 숨겨진 칸의 값은 store에서 지우지 않는다(이력 복원값 보존). 매퍼가 보내지 않을 뿐이다.
 */
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { PropertyTaxBasisRadio } from "./PropertyTaxBasisRadio";
import { DecimalInput } from "@/components/calc/inputs/DecimalInput";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { toOptionalDate } from "@/lib/api/date-coerce";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { effectiveOtherHasBuildingOf } from "@/lib/calc/nbl-other-state-history-scope";
import {
  propertyTaxBasisOptions,
  requiresDemolishedFloorArea,
  type PropertyTaxBasis,
} from "@/lib/tax-engine/non-business-land/property-tax-basis";
import { NBL_PTAX_DEMOLISHED_STATUS_GRACE_DIRECTION_NOTE } from "@/lib/tax-engine/nbl-confirm-notices";
import { demolishedStatusNotice } from "@/lib/tax-engine/non-business-land/demolished-temp-status";
import { PROPERTY_TAX_TYPE_LABEL } from "@/lib/tax-engine/non-business-land/property-tax-type-label";
import type { PropertyTaxType } from "@/lib/tax-engine/non-business-land/types";

interface Props {
  asset: AssetForm;
  onAssetChange: (patch: Partial<AssetForm>) => void;
  /** form-level 양도일(ISO) — 근거 «철거ㆍ멸실» 한시 지위 고지가 양도일 시행본으로 문구를 고른다(미입력이면 시행본 연혁 안내). */
  transferDate?: string;
}

/** 이 자산의 양도일 현재(꼬리) 근거 선택지에 «철거ㆍ멸실»이 있는가 — 이 칸이 보이는 조건과 같은 엔진 술어(나대지 구간 hint의 «꼬리 칸과 달리» 보충이 읽는다). */
export function tailOffersDemolishedBasis(asset: AssetForm): boolean {
  const declared = asset.nblOtherPropertyTaxType;
  if (!declared) return false;
  return propertyTaxBasisOptions(declared as PropertyTaxType, effectiveOtherHasBuildingOf(asset)).includes("demolished");
}

export function OtherLandPropertyTaxBasisField({ asset, onAssetChange, transferDate }: Props) {
  const declared = asset.nblOtherPropertyTaxType;
  if (!declared) return null;
  const declaredType = declared as PropertyTaxType;
  // NBL-STATE-HISTORY-U0 — `changed`이면 양도일 현재(마지막 사건) 유무로 근거 선택지를 정한다(⑧·⑫·⑭와 같은 파생).
  const hasBuilding = effectiveOtherHasBuildingOf(asset);
  const options = propertyTaxBasisOptions(declaredType, hasBuilding);
  if (options.length === 0) return null;

  // 선언·건축물 유무에 맞지 않는 stale 값은 «미선택»으로 보인다(store 값은 그대로 — 매퍼가 보내지 않는다).
  const stored = asset.nblOtherPropertyTaxBasis;
  const value: "" | PropertyTaxBasis = stored && options.includes(stored) ? stored : "";
  const unconfirmed = value === "" || value === "unknown";

  return (
    <div className="space-y-2" data-testid="nbl-other-tax-basis">
      <FieldCard
        field="nblOtherPropertyTaxBasis"
        label="재산세 분류 근거"
        hint={`건축물이 없는 토지에 「${PROPERTY_TAX_TYPE_LABEL[declaredType]}」을 선택한 근거입니다. 재산세 과세내역(고지서)에서 확인해 고르세요 — 모르면 「모름」을 고르면 됩니다.`}
      >
        <PropertyTaxBasisRadio
          name={`nblOtherPropertyTaxBasis-${asset.assetId ?? "primary"}`}
          tone="sky"
          options={options}
          value={value}
          onChange={(v) => onAssetChange({ nblOtherPropertyTaxBasis: v })}
          testIdOf={(b) => `nbl-other-tax-basis-${b}`}
        />
      </FieldCard>

      {unconfirmed && (
        <ToneCard tone="amber" title="근거가 확인되지 않았습니다 — 확인 필요">
          <p data-testid="nbl-other-tax-basis-unconfirmed" className="text-caption leading-snug">
            근거를 고르지 않거나 「모름」이면 건축물 없는 토지는 종합합산으로 보아 판정합니다(근거 없이 별도합산·분리과세·비과세를 인정하지 않습니다).
          </p>
        </ToneCard>
      )}

      {requiresDemolishedFloorArea(declaredType, hasBuilding, value || undefined) && (
        <FieldCard
          field="nblOtherDemolishedFloorArea"
          label="철거ㆍ멸실 전 건축물 바닥면적"
          unit="㎡"
          hint={
            <>
              철거ㆍ멸실되기 전 건축물의 바닥면적(건축물 외의 시설은 수평투영면적)입니다. 이 면적에 용도지역별 적용배율을 곱한 범위가 별도합산(사업용)으로 남고 초과분은 종합합산(비사업용)입니다.{" "}
              <span data-testid="nbl-other-tax-basis-demolished-notice">{demolishedStatusNotice(toOptionalDate(transferDate))}</span>{" "}
              <span data-testid="nbl-other-tax-basis-demolished-direction">{NBL_PTAX_DEMOLISHED_STATUS_GRACE_DIRECTION_NOTE}</span>
            </>
          }
        >
          <DecimalInput
            value={asset.nblOtherDemolishedFloorArea}
            onChange={(v) => onAssetChange({ nblOtherDemolishedFloorArea: v })}
          />
        </FieldCard>
      )}
    </div>
  );
}
