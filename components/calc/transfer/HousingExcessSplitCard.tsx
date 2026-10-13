"use client";

/**
 * 같은 날 취득 주택의 **배율 초과 부수토지 분리** 입력 카드 — 취득시 3칸 + 양도시 2칸 (#17 · S08-1).
 *
 * 노출 술어는 `housingExcessNeedsLandSplit` 하나다 — ④ 전송(`buildSplitPayload`)·⑧ 필수(`validateHousingExcessSplitInputs`)·엔진 게이트가
 * 같은 술어를 읽으므로 «칸이 없는 요구»도 «칸은 있는데 전송 안 함»도 없다. 조건이 아니면 렌더하지 않는다(값은 지우지 않는다).
 *
 * 면적은 이 카드가 받지 않는다 — ①의 «토지 면적» 칸이 정본이다(취득·양도 면적을 같은 값으로 쓴다). 소재지 구분·정착면적도 ①이다.
 * 법정 구분 방식은 영 §166⑥·부가가치세법 시행령 §64①1호의 기준시가 안분이라 자동 안분 fallback이 아니다 — 미입력은 ⑧이 막는다.
 *
 * 환산·감정·매매사례 취득(#17-4)은 취득가액 칸의 «취득시 기준시가»가 이미 같은 값(취득 당시 개별주택가격 — `standardPriceAtAcq`)을 받는다.
 * 같은 필드를 두 번 그리지 않도록 그때는 이 카드에서 그 칸을 빼고 나머지 네 칸만 받는다(⑧은 같은 필드를 그대로 요구한다).
 *
 * #17 후속 — 자산 전체 자본적지출이 있으면 「그중 토지분 자본적지출」 1칸을 더 연다(건물분 = 전체 − 토지분, 계산값 표시). 노출 술어
 * `housingExcessNeedsCapexSplit`는 ⑧·④와 같다 — 별개취득 토글이 켜져 있으면 분리 섹션의 파트 칸이 받으므로 열지 않는다.
 */
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { LandPriceLookupField } from "@/components/calc/inputs/LandPriceLookupField";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { AcqBuildingStdField } from "./AcqBuildingStdField";
import { TransferBuildingStdFields } from "./TransferStdPriceCards";
import { housingExcessAreaOfAsset, housingExcessNeedsLandSplit } from "@/lib/calc/housing-excess-split";
import { housingExcessCapexParts, housingExcessNeedsCapexSplit } from "@/lib/calc/housing-excess-split";
import { deriveLegacyPartAcqMode } from "@/lib/calc/transfer-tax-split-acq-mode";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  transferDate?: string;
}

const COUNT_WORD: Record<number, string> = { 4: "네", 5: "다섯", 6: "여섯" };

export function HousingExcessSplitCard({ asset, onChange, transferDate }: Props) {
  if (!housingExcessNeedsLandSplit(asset, transferDate)) return null;
  const excess = housingExcessAreaOfAsset(asset, transferDate);
  const landArea = parseDecimal(asset.transferArea) || parseDecimal(asset.acquisitionArea) || undefined;
  // 환산·감정·매매사례면 취득시 개별주택가격은 취득가액 칸의 «취득시 기준시가»가 받는다 — 여기서 다시 그리지 않는다.
  const acqTotalElsewhere = deriveLegacyPartAcqMode(asset) !== "actual";
  const capex = housingExcessNeedsCapexSplit(asset, transferDate) ? housingExcessCapexParts(asset) : null;
  return (
    <ToneCard tone="amber" title="배율 초과 부수토지 분리 — 토지·건물 기준시가 입력" bodyClassName="space-y-3">
      <div data-testid="housing-excess-split-card" className="space-y-3">
        <p className="text-caption text-amber-900 leading-relaxed">
          토지 면적이 건물 정착면적의 지역별 배율 한도를 <strong>{excess.toFixed(2)}㎡</strong> 넘습니다. 한도 초과분은 1세대1주택 비과세에서 제외되고
          비사업용 토지(소득세법 §104의3①5호)로 과세되므로, 토지·건물 가액을 기준시가 비율로 나눠 초과분을 분리합니다
          (소득세법 시행령 §166⑥ · 부가가치세법 시행령 §64①1호). 아래 {COUNT_WORD[(acqTotalElsewhere ? 4 : 5) + (capex ? 1 : 0)]} 칸을 모두 입력하세요.
        </p>

        <div className="space-y-2">
          <p className="text-xs font-semibold text-amber-900">취득 당시</p>
          {acqTotalElsewhere ? (
            <p className="text-caption text-amber-900" data-testid="housing-excess-acq-total-elsewhere">
              취득시 개별주택가격(부수토지 포함)은 취득가액 산정 방식에서 입력한 「취득시 기준시가」를 그대로 씁니다.
            </p>
          ) : (
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
          )}
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

        {capex && (
          <div className="space-y-2" data-testid="housing-excess-capex">
            <p className="text-xs font-semibold text-amber-900">자본적지출 토지분·건물분</p>
            <FieldCard
              field="housingExcessLandCapex"
              label="그중 토지분 자본적지출"
              required
              unit="원"
              hint={`필요경비 칸의 자본적지출 ${capex.total.toLocaleString()} 중 토지에 들인 금액입니다 (전부 건물분이면 0). 자본적지출은 공통 비용 안분 대상이 아니어서 귀속을 나눠 입력합니다 (소득세법 §100② 후문).`}
            >
              <CurrencyInput
                label=""
                hideUnit
                value={asset.housingExcessLandCapex ?? ""}
                onChange={(v) => onChange({ housingExcessLandCapex: v })}
                data-testid="housing-excess-land-capex"
              />
            </FieldCard>
            <p className="text-caption text-amber-900" data-testid="housing-excess-building-capex">
              건물분 자본적지출 = {capex.total.toLocaleString()} − 토지분 ={" "}
              <strong>{capex.building === null ? "토지분 입력 후 표시" : capex.building.toLocaleString()}</strong>
            </p>
          </div>
        )}
      </div>
    </ToneCard>
  );
}
