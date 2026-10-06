"use client";

import { LandPriceLookupField } from "@/components/calc/inputs/LandPriceLookupField";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { needsMixedAcqLandPriceAtBuildingAcq } from "@/lib/calc/mixed-use-acq-date-split";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  /** 소재지 지번 주소 — Vworld 공시지가 조회용 */
  jibun?: string;
  /**
   * 주택부수토지 면적(㎡) — 있으면 「토지기준시가」 확인 열을 보인다. 없으면 2열로 축소한다
   * (용도변경 Legacy 레이아웃: 취득시 면적은 엔진이 정하므로 화면이 재계산하지 않는다 — dual-truth 회피).
   */
  area?: number;
}

/**
 * 겸용주택 — 주택부수토지 개별공시지가 (**건물 취득일 기준**) 입력칸 (B0).
 *
 * 개별주택공시가격(건물 취득일 공시)은 토지+건물 결합가라 가목(같은 날짜의 토지 기준시가) : 나목(주택건물 기준시가)
 * 비율로 나누는데(S3-2 — 종전 뺄셈 아님), 토지·건물 취득일이 다르면 기존 「토지 취득일 기준」 공시지가로는
 * 그 비례의 가목을 건물 취득일과 맞출 수 없다. 노출 술어는 ④ 전송·⑧ 필수와 같은
 * `needsMixedAcqLandPriceAtBuildingAcq` — 거짓이면 **미렌더**(값은 store에 남되 보내지도 요구하지도 않는다).
 *
 * 폴백 없음: `mixedAcqLandPricePerSqm`(토지 취득일 값)·PHD·1990 환산으로 채우지 않는다.
 */
export function MixedUseAcqHousingLandPriceField({ asset, onChange, jibun, area }: Props) {
  if (!needsMixedAcqLandPriceAtBuildingAcq(asset)) return null;
  const landDate = asset.landAcquisitionDate || asset.acquisitionDate;
  return (
    <ToneCard tone="amber" title="주택부수토지 개별공시지가 — 건물 취득일 기준">
      <div data-testid="mixed-acq-land-price-at-building-acq" className="space-y-2">
        <p className="text-caption">
          토지 취득일({landDate})과 건물 취득일({asset.acquisitionDate})이 달라, 위 개별주택공시가격과 같은 날짜의
          토지 공시지가가 따로 필요합니다.
        </p>
        <LandPriceLookupField
          pricePerSqm={asset.mixedAcqLandPricePerSqmAtBuildingAcq ?? ""}
          data-field="mixedAcqLandPricePerSqmAtBuildingAcq"
          onPricePerSqmChange={(v) => onChange({ mixedAcqLandPricePerSqmAtBuildingAcq: v })}
          area={area !== undefined && area > 0 ? area : undefined}
          hideLandStdPrice={area === undefined}
          referenceDate={asset.acquisitionDate}
          jibun={jibun}
          label="주택부수토지 개별공시지가 (원/㎡) — 건물 취득일 기준"
          hint="개별주택공시가격은 토지+건물 일괄가액이라, 이를 토지분·건물분으로 나누려면 같은 기준일(건물 취득일)의 토지 기준시가(공시지가 × 주택부수토지 면적)가 필요합니다. 상가부수토지 개별공시지가(토지 취득일 기준)로 대신하지 않습니다."
          placeholder="건물 취득일 기준 개별공시지가 /㎡"
          pricePerSqmTestId="mixed-acq-land-price-at-building-acq-input"
          landStdPriceTestId={area !== undefined ? "mixed-acq-land-std-at-building-acq" : undefined}
        />
      </div>
    </ToneCard>
  );
}
