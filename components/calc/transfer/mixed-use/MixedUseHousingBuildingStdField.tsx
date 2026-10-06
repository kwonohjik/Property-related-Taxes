"use client";

import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { BuildingStdPriceModalButton } from "@/components/calc/building-std-price/BuildingStdPriceModalButton";
import { stdPriceAddressOf } from "@/components/calc/transfer/asset-std-price-address";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import {
  housingFloorAreaForModal,
  needsMixedHousingBuildingStdAtAcq,
  needsMixedHousingBuildingStdAtTransfer,
} from "@/lib/calc/mixed-use-housing-std-split";
import {
  isMixedAcqDatesSeparate,
  needsMixedAcqLandPriceAtBuildingAcq,
} from "@/lib/calc/mixed-use-acq-date-split";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  /** 입력 시점 — 취득시(amber) / 양도시(emerald). 각 시점 sub-block 맨 아래에 꽂는다. */
  timePoint: "acq" | "transfer";
  transferDate?: string;
  /** 취득시 라벨 — 상속·증여는 「상속개시일」·「증여일」. 기본 「취득시」. */
  acqLabel?: string;
  /** 주택부수토지 면적(㎡) — 양도시 모달 토지 면적 prefill. 취득시는 면적을 엔진이 정하므로 넘기지 않는다. */
  landArea?: number;
  /** 이미 같은 톤의 시점 박스 안에 놓일 때 true — 톤 카드를 이중으로 두르지 않는다(양도 sub-block·Legacy 시점 박스). */
  embedded?: boolean;
}

/**
 * 겸용주택 — **주택건물 기준시가**(나목) 입력칸 (S3-2). 직접 입력 + 「건물 기준시가 계산」 모달.
 *
 * 개별주택가격(주택건물 + 부수토지 결합 공시)을 토지분·건물분으로 나눌 때 뺄셈이 아니라
 * **토지 기준시가(가목) : 주택건물 기준시가(나목) 비례**를 쓴다. 이 칸이 비례의 나목이다.
 * 상가건물 기준시가(③)와는 **다른 값**이다 — 이 칸은 주택 부분 연면적만, 상가 부분·토지는 제외한다.
 *
 * 노출 술어는 ④ 전송·⑧ 필수·⑫·엔진과 같은 leaf(`mixed-use-housing-std-split.ts`) — 거짓이면 **미렌더**
 * (값은 store에 남되 보내지도 요구하지도 않는다). 폴백 없음(미입력은 ⑧이 막는다).
 *
 * 입력 방식은 모달 + 직접 입력 허용이다 — 국세청 건물 기준시가는 모달 산정 외에도 홈택스·세무사 산정서로 얻는다.
 * 폼 필드·연면적 소스·스냅샷 키가 일반 주택 `AcqBuildingStdField`와 전부 달라 별도 컴포넌트로 둔다.
 */
export function MixedUseHousingBuildingStdField({
  asset,
  onChange,
  timePoint,
  transferDate,
  acqLabel = "취득시",
  landArea,
  embedded = false,
}: Props) {
  const isAcq = timePoint === "acq";
  const visible = isAcq ? needsMixedHousingBuildingStdAtAcq(asset) : needsMixedHousingBuildingStdAtTransfer(asset);
  if (!visible) return null;

  // 토지·건물 취득일이 다르면(B0) 취득시 나목은 **건물 취득일** 기준이다 — 형제 칸(`MixedUseAcqHousingLandPriceField`)처럼 라벨에 밝힌다.
  const buildingDayBasis = isAcq && isMixedAcqDatesSeparate(asset);
  const label = isAcq
    ? `${acqLabel} 주택건물 기준시가${buildingDayBasis ? " — 건물 취득일 기준" : ""}`
    : "양도시 주택건물 기준시가";
  const value = (isAcq ? asset.mixedAcqHousingBuildingStdPrice : asset.mixedTransferHousingBuildingStdPrice) ?? "";
  const testIdBase = isAcq ? "mixed-acq-housing-building-std" : "mixed-transfer-housing-building-std";

  // 취득시 가목 단가 prefill — 모달의 취득 위치지수 칸은 **건물 취득일** 기준이다.
  //  · 토지일 = 건물일: 상가부수토지 단가(주택·상가는 한 필지 한 단가) — PHD ① fallback
  //  · 별개 취득(B0): 건물 취득일 기준 칸(B0)의 값 — 토지 취득일 값은 다른 연도라 주입하면 위치지수 오산
  //  B0 칸이 열려 있지 않으면(술어 거짓) 값이 있어도 넘기지 않는다.
  const acqLandPrice = isMixedAcqDatesSeparate(asset)
    ? needsMixedAcqLandPriceAtBuildingAcq(asset)
      ? asset.mixedAcqLandPricePerSqmAtBuildingAcq || undefined
      : undefined
    : asset.mixedAcqLandPricePerSqm || asset.phdLandPricePerSqmAtAcq || undefined;
  const floorArea = housingFloorAreaForModal(asset, timePoint);

  const content = (
    <>
      <div data-testid={`${testIdBase}-card`}>
        <FieldCard
          field={isAcq ? "mixedAcqHousingBuildingStdPrice" : "mixedTransferHousingBuildingStdPrice"}
          label={label}
          required
          unit="원"
          hint={
            "주택 부분 연면적만의 국세청 건물 기준시가입니다(상가 부분·토지 제외). 개별주택가격(주택건물+부수토지)을 토지 기준시가 : 이 건물 기준시가 비율로 나누는 데 씁니다. 토지 기준시가는 개별공시지가 × 주택부수토지 면적입니다." +
            (isAcq
              ? buildingDayBasis
                ? ` 토지 취득일(${asset.landAcquisitionDate})과 건물 취득일(${asset.acquisitionDate})이 달라, 개별주택가격과 같은 건물 취득일 기준 값을 입력합니다.`
                : ""
              : " 양도일 기준 값입니다.")
          }
        >
          <CurrencyInput
            label=""
            hideUnit
            value={value}
            onChange={(v) => onChange(isAcq ? { mixedAcqHousingBuildingStdPrice: v } : { mixedTransferHousingBuildingStdPrice: v })}
            data-testid={testIdBase}
          />
        </FieldCard>
      </div>
      <div className="flex justify-end">
        <BuildingStdPriceModalButton
          lockedTaxType="transfer"
          buttonLabel={isAcq ? "취득시 주택건물 기준시가 계산" : "양도시 주택건물 기준시가 계산"}
          initialAddress={stdPriceAddressOf(asset)}
          // 「건물 기준시가 계산서」 서식 출력의 스냅샷 소스 — 키가 없으면 서식이 비어 출력된다.
          // 시점별 2키(`-mx-housing-{acq|transfer}`): building-std-snapshot-keys.ts. 상가 통합 모달(`-mx-commercial`)·
          // PHD 배치(`-phd-*`)와 키가 겹치지 않는다.
          snapshotKey={`bsp-${asset.assetId}-mx-housing-${isAcq ? "acq" : "transfer"}`}
          applyTimePoint={isAcq ? "acquisition" : "transfer"}
          prefill={{
            floorArea: floorArea || undefined,
            acquisitionDate: asset.acquisitionDate,
            transferDate,
            ...(isAcq
              ? {
                  acqLandPricePerSqm: acqLandPrice,
                  acqLandPricePerSqm2001: asset.phdLandPricePerSqmAtAcq2001 || undefined,
                }
              : {
                  landAreaM2: landArea !== undefined && landArea > 0 ? String(landArea) : undefined,
                  transferLandPricePerSqm:
                    asset.mixedTransferLandPricePerSqm || asset.phdLandPricePerSqmAtTransfer || undefined,
                }),
          }}
          onApply={(v: number) =>
            onChange(isAcq ? { mixedAcqHousingBuildingStdPrice: String(v) } : { mixedTransferHousingBuildingStdPrice: String(v) })
          }
        />
      </div>
    </>
  );
  if (embedded) return <div className="space-y-1.5">{content}</div>;
  return (
    <ToneCard tone={isAcq ? "amber" : "emerald"} bodyClassName="space-y-1.5">
      {content}
    </ToneCard>
  );
}
