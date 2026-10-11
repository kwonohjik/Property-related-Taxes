"use client";

/**
 * 같은 날 취득 주택의 **배율 초과 부수토지 분리** 입력 카드 — 취득시 3칸 + 양도시 2칸 (#17 · S08-1).
 *
 * 노출 술어는 `housingExcessNeedsLandSplit` 하나다 — ④ 전송(`buildSplitPayload`)·⑧ 필수(`validateHousingExcessSplitInputs`)·엔진 게이트가
 * 같은 술어를 읽으므로 «칸이 없는 요구»도 «칸은 있는데 전송 안 함»도 없다. 조건이 아니면 렌더하지 않는다(값은 지우지 않는다).
 *
 * 면적은 이 카드가 받지 않는다 — ①의 «토지 면적» 칸이 정본이다(취득·양도 면적을 같은 값으로 쓴다). 소재지 구분·정착면적도 ①이다.
 * 법정 구분 방식은 영 §166⑥·부가가치세법 시행령 §64①1호의 기준시가 안분이라 자동 안분 fallback이 아니다 — 미입력은 ⑧이 막는다.
 */
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { LandPriceLookupField } from "@/components/calc/inputs/LandPriceLookupField";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { AcqBuildingStdField } from "./AcqBuildingStdField";
import { TransferBuildingStdFields } from "./TransferStdPriceCards";
import { housingExcessAreaOfAsset, housingExcessNeedsLandSplit } from "@/lib/calc/housing-excess-split";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  transferDate?: string;
  /** 첫 자산(주 자산) 여부 — 컴패니언 주택 카드는 이 입력 경로가 없다 */
  isFirst?: boolean;
}

export function HousingExcessSplitCard({ asset, onChange, transferDate, isFirst }: Props) {
  if (!housingExcessNeedsLandSplit(asset, transferDate, isFirst === true)) return null;
  const excess = housingExcessAreaOfAsset(asset, transferDate);
  const landArea = parseDecimal(asset.transferArea) || parseDecimal(asset.acquisitionArea) || undefined;
  return (
    <ToneCard tone="amber" title="배율 초과 부수토지 분리 — 토지·건물 기준시가 입력" bodyClassName="space-y-3">
      <div data-testid="housing-excess-split-card" className="space-y-3">
        <p className="text-caption text-amber-900 leading-relaxed">
          토지 면적이 건물 정착면적의 지역별 배율 한도를 <strong>{excess.toFixed(2)}㎡</strong> 넘습니다. 한도 초과분은 1세대1주택 비과세에서 제외되고
          비사업용 토지(소득세법 §104의3①5호)로 과세되므로, 토지·건물 가액을 기준시가 비율로 나눠 초과분을 분리합니다
          (소득세법 시행령 §166⑥ · 부가가치세법 시행령 §64①1호). 아래 다섯 칸을 모두 입력하세요.
        </p>

        <div className="space-y-2">
          <p className="text-xs font-semibold text-amber-900">취득 당시</p>
          <FieldCard
            field="standardPriceAtAcq"
            label="취득시 개별주택가격 (부수토지 포함)"
            required
            unit="원"
            hint="취득일 직전 고시된 개별주택가격(토지 포함 결합 공시)입니다. 토지분 : 건물분 기준시가 비율로 취득가액을 나눕니다."
          >
            <CurrencyInput
              label=""
              hideUnit
              value={asset.standardPriceAtAcq ?? ""}
              onChange={(v) => onChange({ standardPriceAtAcq: v })}
              data-testid="housing-excess-acq-total"
            />
          </FieldCard>
          <LandPriceLookupField
            label="취득시 토지 공시지가"
            data-field="standardPricePerSqmAtAcq"
            pricePerSqm={asset.standardPricePerSqmAtAcq ?? ""}
            onPricePerSqmChange={(v) => onChange({ standardPricePerSqmAtAcq: v })}
            area={parseDecimal(asset.acquisitionArea) || undefined}
            referenceDate={asset.acquisitionDate}
            jibun={asset.addressJibun}
            hint="취득일 직전 고시 개별공시지가 (원/㎡) — 토지 기준시가 = ㎡당 공시지가 × ①의 토지 면적 (§99①1호 가목)"
          />
          <AcqBuildingStdField asset={asset} onChange={onChange} transferDate={transferDate} variant="proportional" />
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold text-amber-900">양도 당시</p>
          <LandPriceLookupField
            label="양도시 토지 공시지가"
            data-field="standardPricePerSqmAtTransfer"
            pricePerSqm={asset.standardPricePerSqmAtTransfer ?? ""}
            onPricePerSqmChange={(v) => onChange({ standardPricePerSqmAtTransfer: v, transferArea: asset.transferArea || asset.acquisitionArea })}
            area={landArea}
            referenceDate={transferDate}
            jibun={asset.addressJibun}
            hint="양도일 직전 고시 개별공시지가 (원/㎡) — 양도가액을 토지·건물로 나누는 비율의 토지 몫 (취득일이 아니라 양도일 기준)"
          />
          <TransferBuildingStdFields asset={asset} onChange={onChange} transferDate={transferDate} placement="saleAxis" />
        </div>
      </div>
    </ToneCard>
  );
}
