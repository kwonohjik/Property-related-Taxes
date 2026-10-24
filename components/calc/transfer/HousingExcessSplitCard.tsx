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
 *
 * #17-6 — 실지거래가액 취득이면 취득 당시 계약서의 토지·건물 구분금액(선택)을 더 받아 「소득세법」 §100③(30% 이상 차이 → 불분명 의제)로 판정한다.
 * 노출 술어 `housingExcessNeedsAcqContract`는 ④·⑧과 같다. 양도 쪽 구분금액은 받지 않는다(양도 당시 토지·건물 기준시가는 종전처럼 항상 필요).
 */
import { CurrencyInput } from "@/components/calc/inputs/CurrencyInput";
import { FieldCard } from "@/components/calc/inputs/FieldCard";
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { LandPriceLookupField } from "@/components/calc/inputs/LandPriceLookupField";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import { AcqBuildingStdField } from "./AcqBuildingStdField";
import { TransferBuildingStdFields } from "./TransferStdPriceCards";
import {
  housingExcessAreaOfAsset,
  housingExcessNeedsLandSplit,
  housingExcessUsesInheritedTotal,
  housingExcessUsesPhdSplit,
} from "@/lib/calc/housing-excess-split";
import { isBeforeHousePriceFirstDisclosure } from "@/lib/tax-engine/housing-excess-split";
import { housingExcessCapexParts, housingExcessNeedsCapexSplit } from "@/lib/calc/housing-excess-split";
import {
  housingExcessAcqContractAsksProviso,
  housingExcessAcqContractEra,
  housingExcessAcqContractParts,
  housingExcessNeedsAcqContract,
} from "@/lib/calc/housing-excess-acq-contract";
import { deriveLegacyPartAcqMode } from "@/lib/calc/transfer-tax-split-acq-mode";
import {
  APARTMENT_ACQ_PRICE_AGENCY_NOTE,
  APARTMENT_ACQ_PRICE_SENTENCE,
  housingConvertedPriceName,
  housingDisclosedPriceName,
  housingFirstDisclosureDateNote,
  isPhdApartment,
  phdDisclosedPriceName,
  resolveHousingKind,
} from "@/lib/calc/phd-housing-term";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

interface Props {
  asset: AssetForm;
  onChange: (patch: Partial<AssetForm>) => void;
  transferDate?: string;
  /** 첫 자산이 아님(함께 양도 카드) — §164⑦ PHD는 첫 자산에만 닿는다 */
  isNonPrimary?: boolean;
}

const COUNT_WORD: Record<number, string> = { 4: "네", 5: "다섯", 6: "여섯" };

export function HousingExcessSplitCard({ asset, onChange, transferDate, isNonPrimary = false }: Props) {
  // §164⑦ 개별주택가격 미공시 3시점 환산 — 분리 경로는 타지만 받을 칸이 없다(환산 칸의 토지 값·건물 값으로 나눈다). 안내만 한다(#17-5).
  // 이 경로는 PHD 입력 패널이 같은 화면에 있어 이름도 그 패널의 주택유형 라디오(`phdHousingType`)를 따른다 — 패널·결과 화면과 같은 단일 정의.
  if (housingExcessUsesPhdSplit(asset, transferDate, isNonPrimary)) {
    const disclosedName = phdDisclosedPriceName(isPhdApartment(asset));
    return (
      <ToneCard tone="amber" title={`배율 초과 부수토지 분리 — ${disclosedName} 미공시 환산 값으로 분리`} bodyClassName="space-y-2">
        <p className="text-caption text-amber-900 leading-relaxed dark:text-amber-200" data-testid="housing-excess-phd-card">
          토지 면적이 건물 정착면적의 지역별 배율 한도를 <strong>{housingExcessAreaOfAsset(asset, transferDate).toFixed(2)}㎡</strong> 넘습니다.
          한도 초과분은 1세대1주택 비과세에서 제외되고 비사업용 토지(소득세법 §104의3①5호)로 분리 과세합니다. 이 자산은 취득 당시 {disclosedName}이 공시되기 전이라
          §164⑦ 3시점 환산을 쓰므로, 위 환산 칸의 토지 값·건물 값으로 양도가액과 환산취득가액을 토지분·건물분으로 나누어 초과분을 분리합니다 — 이 카드에서 따로
          입력할 칸은 없습니다.
        </p>
      </ToneCard>
    );
  }
  if (!housingExcessNeedsLandSplit(asset, transferDate, isNonPrimary)) return null;
  // 5칸 경로의 이름 — 주택 종류 신호(`resolveHousingKind`)를 따른다. ⑧ 메시지(`validateHousingExcessSplitInputs`)와 같은 함수·같은 이름.
  // 신호가 없으면(PHD 라디오 기본값만 있는 공동주택일 수 있음) 두 이름을 함께 적는다.
  const kind = resolveHousingKind(asset);
  const disclosedName = housingDisclosedPriceName(kind);
  const convertedName = housingConvertedPriceName(kind);
  const excess = housingExcessAreaOfAsset(asset, transferDate);
  const landArea = parseDecimal(asset.transferArea) || parseDecimal(asset.acquisitionArea) || undefined;
  // 환산·감정·매매사례면 취득시 개별주택가격은 취득가액 칸의 «취득시 기준시가»가 받는다 — 여기서 다시 그리지 않는다.
  // 개별주택가격(보충적 평가)으로 평가한 상속·증여 주택(#17-5 ②)이면 그 총액이 곧 상속·증여 평가액이다 — 같은 값을 두 번 받지 않는다.
  const inheritedTotal = housingExcessUsesInheritedTotal(asset, transferDate, isNonPrimary);
  // 2005-04-30 전 취득(PHD 환산이 아닌 경우)은 취득시 개별주택가격 칸에 영 §164⑦ 환산 개별주택가격을 받는다(#17-5 ① — 서면인터넷방문상담4팀-685).
  // 공동주택은 날짜로 단정하지 않는다 — 공시가격 유무가 단지마다 달라 «있었으면 그 값, 없었으면 §164⑥·⑦ 산식 결과»를 조건 문장으로 안내한다(⑧ 메시지와 같은 문장).
  const apartment = kind === "apartment";
  const preDisclosure = !apartment && isBeforeHousePriceFirstDisclosure(asset.acquisitionDate);
  const acqTotalElsewhere = inheritedTotal || deriveLegacyPartAcqMode(asset) !== "actual";
  const capex = housingExcessNeedsCapexSplit(asset, transferDate, isNonPrimary) ? housingExcessCapexParts(asset) : null;
  const contractOpen = housingExcessNeedsAcqContract(asset, transferDate);
  const contract = housingExcessAcqContractParts(asset);
  const contractEra = housingExcessAcqContractEra(transferDate);
  return (
    <ToneCard tone="amber" title="배율 초과 부수토지 분리 — 토지·건물 기준시가 입력" bodyClassName="space-y-3">
      <div data-testid="housing-excess-split-card" className="space-y-3">
        <p className="text-caption text-amber-900 leading-relaxed dark:text-amber-200">
          토지 면적이 건물 정착면적의 지역별 배율 한도를 <strong>{excess.toFixed(2)}㎡</strong> 넘습니다. 한도 초과분은 1세대1주택 비과세에서 제외되고
          비사업용 토지(소득세법 §104의3①5호)로 과세되므로, 토지·건물 가액을 기준시가 비율로 나눠 초과분을 분리합니다
          {inheritedTotal
            ? " (상속·증여 평가액을 건물 기준시가와 토지 개별공시지가로 안분 — 상속세및증여세법 §61①4호, 서면인터넷방문상담4팀-688)."
            : " (소득세법 시행령 §166⑥ · 부가가치세법 시행령 §64①1호)."}{" "}
          아래 {COUNT_WORD[(acqTotalElsewhere ? 4 : 5) + (capex ? 1 : 0)]} 칸을 모두 입력하세요.
        </p>

        <div className="space-y-2">
          <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">취득 당시</p>
          {acqTotalElsewhere ? (
            <p className="text-caption text-amber-900 dark:text-amber-200" data-testid="housing-excess-acq-total-elsewhere">
              {inheritedTotal
                ? "취득시 개별주택가격(부수토지 포함)은 위에서 입력한 상속·증여 평가액(개별주택가격)을 그대로 씁니다."
                : `취득시 ${disclosedName}(부수토지 포함)은 취득가액 산정 방식에서 입력한 「취득시 기준시가」를 그대로 씁니다.`}
            </p>
          ) : (
            <FieldCard
              field="standardPriceAtAcq"
              label={preDisclosure ? `취득시 ${disclosedName} (영 §164⑦ ${convertedName} · 부수토지 포함)` : `취득시 ${disclosedName} (부수토지 포함)`}
              required
              unit="원"
              hint={
                apartment
                  ? `${APARTMENT_ACQ_PRICE_SENTENCE} — ${APARTMENT_ACQ_PRICE_AGENCY_NOTE}. 토지분 : 건물분은 아래 ㎡당 공시지가 : 건물 기준시가 비율로 나눕니다.`
                  : preDisclosure
                  ? `취득일이 ${disclosedName} 최초 공시일${housingFirstDisclosureDateNote(kind)} 전이라 취득 당시 공시가격이 없습니다 — 영 §164⑦ 산식으로 계산한 ${convertedName}(최초 공시 ${disclosedName}에, 취득 당시 토지+건물 기준시가 합계를 최초 공시 당시 토지+건물 기준시가 합계로 나눈 비율을 곱한 값)을 입력하세요. 토지분 : 건물분은 아래 ㎡당 공시지가 : 건물 기준시가 비율로 나눕니다.`
                  : `취득일 직전 고시된 ${disclosedName}(토지 포함 결합 공시)입니다. 토지분 : 건물분 기준시가 비율로 취득가액을 나눕니다.`
              }
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
          <AcqBuildingStdField asset={asset} onChange={onChange} transferDate={transferDate} variant="proportional" priceName={disclosedName} />

          {contractOpen && (
            <div className="space-y-2" data-testid="housing-excess-acq-contract">
              <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">취득 당시 계약서 토지·건물 구분금액 (선택)</p>
              <p className="text-caption text-amber-900 leading-relaxed dark:text-amber-200">
                계약서에 토지 금액과 건물 금액이 따로 적혀 있으면 입력하세요. 비우면 위 기준시가 비율로 취득가액을 나눕니다. 입력하면 두 칸을 모두 채워야 하고
                합이 취득가액({contract.total.toLocaleString()})과 같아야 합니다.
                {contractEra === "none"
                  ? " 양도일이 2016년 1월 1일 전이라 「소득세법」 제100조 제3항의 30% 판정을 하지 않고 입력한 금액을 그대로 씁니다."
                  : " 구분 기재한 가액이 기준시가로 안분계산한 가액과 100분의 30 이상 차이가 있으면 가액 구분이 불분명한 때로 보아 안분 가액을 씁니다(「소득세법」 제100조 제3항). " +
                    "토지·건물 각각을 안분 가액 대비로 비교하며, 비교 단위를 정면으로 정한 예규·재결은 확인하지 못했습니다 — 확인 필요."}
              </p>
              <FieldCard
                field="acqContractLandPrice"
                label="계약서 토지 금액"
                unit="원"
                hint="취득 당시 매매계약서에 토지 가액으로 적힌 금액입니다."
              >
                <CurrencyInput
                  label=""
                  hideUnit
                  value={asset.acqContractLandPrice ?? ""}
                  onChange={(v) => onChange({ acqContractLandPrice: v })}
                  data-testid="housing-excess-acq-contract-land"
                />
              </FieldCard>
              <FieldCard
                field="acqContractBuildingPrice"
                label="계약서 건물 금액"
                unit="원"
                hint="취득 당시 매매계약서에 건물 가액으로 적힌 금액입니다."
              >
                <CurrencyInput
                  label=""
                  hideUnit
                  value={asset.acqContractBuildingPrice ?? ""}
                  onChange={(v) => onChange({ acqContractBuildingPrice: v })}
                  data-testid="housing-excess-acq-contract-building"
                />
              </FieldCard>
              {contract.entered && contract.land !== null && contract.building !== null && (
                <p className="text-caption text-amber-900 dark:text-amber-200" data-testid="housing-excess-acq-contract-sum">
                  토지 금액 + 건물 금액 = <strong>{(contract.land + contract.building).toLocaleString()}</strong>
                  {contract.land + contract.building === contract.total ? " (취득가액과 같음)" : ` (취득가액 ${contract.total.toLocaleString()}과 다름)`}
                </p>
              )}
              {housingExcessAcqContractAsksProviso(asset, transferDate) && (
                <ToggleCard
                  tone="amber"
                  checked={asset.acqContractOtherLaw === true}
                  onCheckedChange={(v) => onChange({ acqContractOtherLaw: v })}
                  title="다른 법령에서 정하는 바에 따라 가액을 구분한 경우"
                  description="켜면 30% 이상 차이가 있어도 계약서 구분금액을 그대로 씁니다. 끄면 해당 없음으로 보아 30% 판정을 적용합니다 (소득세법 시행령 제166조 제8항 제1호)."
                  data-testid="housing-excess-acq-contract-other-law"
                />
              )}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">양도 당시</p>
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
            <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">자본적지출 토지분·건물분</p>
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
            <p className="text-caption text-amber-900 dark:text-amber-200" data-testid="housing-excess-building-capex">
              건물분 자본적지출 = {capex.total.toLocaleString()} − 토지분 ={" "}
              <strong>{capex.building === null ? "토지분 입력 후 표시" : capex.building.toLocaleString()}</strong>
            </p>
          </div>
        )}
      </div>
    </ToneCard>
  );
}
