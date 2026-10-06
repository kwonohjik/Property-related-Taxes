"use client";

/**
 * 취득시 **건물 기준시가**(소득세법 §99①1호 **나목**) 입력칸 — 직접 입력 + 「건물 기준시가 계산」 모달.
 *
 * 두 경로가 **같은 폼 필드**(`AssetForm.buildingStandardPriceAtAcq`)와 **같은 모달 런처**를 쓴다
 * (prefill 사본이 갈리지 않게 한 곳에 정의 — `feedback_ui_engine_dual_truth_avoidance`):
 *
 * - `proportional` (S3-1) — **일반 주택 비-별개 취득 + 소유자 분리**. 개별주택가격(부수토지 포함 결합 공시)을
 *   토지 기준시가(가목) : 건물 기준시가(나목) **비율로 안분**하는 분모다
 *   (`토지분 = 개별주택가격 × 가목 ÷ (가목 + 나목)` — 양도소득세 집행기준 99-164-9). 필수. 노출·⑧ 필수·④ 전송·⑫ 요구·
 *   엔진 throw가 **같은 술어**(`ownerSplitHousingNeedsBuildingStd`)를 쓴다.
 * - `separate` — **별개 취득**(토지·건물 취득일이 다름)의 건물분. 각 파트가 자기 취득일의 직전 고시분을 쓰는
 *   파트 독립 입력이다(필수 여부는 `LandBuildingSplitSection`의 파트 술어가 정한다).
 *
 * testid는 경로별로 분리한다 — 같은 `split-building-std-acq-card`를 비-별개에서 쓰면 기존 DOM 테스트의
 * 「별개 전용 카드는 비-별개에서 0개」 단언이 흐려지고, 두 카드가 동시에 렌더되는 불변식 위반도 가려진다.
 *
 * 입력 방식은 **모달 + 직접 입력 허용**이다 — 국세청 건물 기준시가는 모달 산정 외에도 홈택스·세무사 산정서로 얻으며,
 * 양도시 칸(`TransferBuildingStdFields`)도 계산기 결과를 덮어쓸 수 있게 편집 칸을 유지한다.
 */

import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { BuildingStdPriceModalButton } from "@/components/calc/building-std-price/BuildingStdPriceModalButton";
import { stdPriceAddressOf } from "@/components/calc/transfer/asset-std-price-address";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  transferDate?: string;
  variant: "proportional" | "separate";
}

export function AcqBuildingStdField({ asset, onChange, transferDate, variant }: Props) {
  const proportional = variant === "proportional";
  return (
    <>
      <div data-testid={proportional ? "acq-building-std-card" : "split-building-std-acq-card"}>
        <FieldCard
          field="buildingStandardPriceAtAcq"
          label={proportional ? "취득시 건물 기준시가" : "취득시 건물기준시가"}
          required={proportional}
          unit="원"
          hint={
            proportional
              ? "국세청 건물 기준시가 산정 방법(건축물대장 연면적 기준)으로 구한 취득일 직전 고시분입니다. 개별주택가격(부수토지 포함)을 토지 기준시가 : 건물 기준시가 비율로 나누는 데 씁니다."
              : "건물 취득일 직전 고시분 (§164③). 취득시기가 다르므로 결합 공시액을 나눠 쓰면 건물분에 토지 취득시점이 섞인다."
          }
        >
          <CurrencyInput
            label=""
            hideUnit
            value={asset.buildingStandardPriceAtAcq}
            onChange={(v) => onChange({ buildingStandardPriceAtAcq: v })}
            data-testid={proportional ? "acq-building-std" : "split-building-std-acq"}
          />
        </FieldCard>
      </div>
      <div className="flex justify-end">
        <BuildingStdPriceModalButton
          lockedTaxType="transfer"
          buttonLabel="취득시 건물 기준시가 계산"
          initialAddress={stdPriceAddressOf(asset)}
          // 「건물 기준시가 계산서」 서식 출력의 스냅샷 소스 — 키가 없으면 서식이 비어 출력된다.
          // 시점 세그먼트 `acq` 규약: building-std-snapshot-keys.ts. 두 경로가 같은 키를 쓴다(동시에 렌더되지 않는다).
          snapshotKey={`bsp-${asset.assetId}-split-acq`}
          applyTimePoint="acquisition"
          prefill={{
            landAreaM2: asset.acquisitionArea,
            // 기본정보 「건물 연면적」이 정본(anchor A-3).
            floorArea: asset.buildingFloorArea || undefined,
            acquisitionDate: asset.acquisitionDate,
            transferDate,
            // 취득시 위치지수 소스. 트랙 분기(취득 ≤2000이면 2001 기준)는 모달이 `pickAcqLocationIndexLandPrice`로 처리한다.
            acqLandPricePerSqm: asset.standardPricePerSqmAtAcq,
          }}
          onApply={(v: number) => onChange({ buildingStandardPriceAtAcq: String(v) })}
        />
      </div>
    </>
  );
}
