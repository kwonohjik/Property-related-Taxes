/**
 * 겸용주택(mixed-use) 자산 전용 취득 검증 — transfer-tax-validate-asset.ts에서 분리 (800줄 정책).
 * calcMixedUseTransferTax 엔진이 주택분·상가분을 별도 처리하므로 generic 취득 검증과 분리한다.
 * validateAssetAcquisition 내 isMixedUseHouse 분기의 본체를 그대로 이관.
 */
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { isPhdEligible } from "./phd-eligibility";
import { validateMixedUseAreas } from "./transfer-tax-validate-mixed-area";
import { validateMixedUseExprAsset } from "./transfer-tax-validate-expropriation";
import { validateMixedUseInheritanceAsset } from "./transfer-tax-validate-mixed-use-inheritance";
import { derivePre1990PhdLandPricePerSqmAtAcq } from "./transfer-pre1990-phd-bridge";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";

export function validateMixedUseAsset(
  asset: AssetForm,
  label: string,
  formTransferDate?: string,
): string | null {
  if (!asset.acquisitionDate) return `${label}: 건물 취득일을 입력하세요.`;
  // 토지·건물 취득일 다름 토글 ON일 때만 토지 취득일 필수. OFF면 acquisitionDate로 폴백.
  // 상속·증여는 토지·건물 모두 상속개시일/증여일 = acquisitionDate 이며 별도 토지 취득일
  // 입력란이 없다(겸용 토글이 hasSeperate를 강제 ON 함). API가 acquisitionDate로 fallback
  // 하므로(transfer-tax-api-mixed-use.ts:77) 매매 split(실제 입력란 존재)만 요구한다.
  if (
    asset.hasSeperateLandAcquisitionDate &&
    asset.acquisitionCause !== "inheritance" &&
    asset.acquisitionCause !== "gift" &&
    !asset.landAcquisitionDate
  )
    return `${label}: 토지 취득일을 입력하세요.`;
  const areaErr = validateMixedUseAreas(asset, label, formTransferDate);
  if (areaErr) return areaErr;
  if (!asset.mixedTransferHousingPrice || parseAmount(asset.mixedTransferHousingPrice) <= 0)
    return `${label}: 양도시 개별주택공시가격을 입력하세요. (양도시 기준시가)`;
  // ⑧ Validation fallback — UI 표시·API 변환이 mixedTransfer || phdLandPricePerSqmAtTransfer 로
  // fallback하므로(주택·상가 부수토지는 동일 필지 = 단가 공유) validate도 PHD 값을 인정한다.
  // 취득측 fallback 인정(아래 :403-408)과 대칭.
  if (
    parseAmount(asset.mixedTransferLandPricePerSqm) <= 0 &&
    parseAmount(asset.phdLandPricePerSqmAtTransfer) <= 0
  )
    return `${label}: 양도시 개별공시지가(원/㎡)를 입력하세요. (양도시 기준시가)`;
  // ⑧ §164⑨1호 겸용 공익수용 특례 — 수용 시 주택분·상가분 토지 보상 4필드 필수 (P7/D8).
  const mixedExprErr = validateMixedUseExprAsset(asset, label, formTransferDate);
  if (mixedExprErr) return mixedExprErr;
  // ⑧ 상속 취득 겸용주택 — §163⑨ 취득가액 직접 산정 (엔진 정합). 분리 파일 참조(800줄 정책).
  const mixedInheritanceErr = validateMixedUseInheritanceAsset(asset, label);
  if (mixedInheritanceErr) return mixedInheritanceErr;
  // ⑧ 겸용 취득가액 총액 안분 (법 §100²) — 매매 + (실거래가 §97①1호가목 / 감정·매매사례 §176의2②③).
  // 셋 다 취득시 기준시가 비율 안분(감정·매매사례는 개산공제 유지). 환산 모드는 아래 별도.
  if (asset.acquisitionCause === "purchase" && !asset.useEstimatedAcquisition) {
    const isAppraisal = asset.isAppraisalAcquisition === true;
    const isSalesCase = asset.isSalesCaseAcquisition === true;
    // ⚠️ 3종 모두 **받침 있는 "액"으로 끝나게** 유지한다 — `:73`이 `${basisLabel}을`로 조사를
    //    고정하므로, 받침 없는 라벨("취득 실거래가")을 쓰면 "실거래가을"이 된다(2026-07-29 정정).
    //    조사 분기 로직을 새로 만들기보다 라벨 어미를 맞추는 쪽이 단순하고, 결과 화면 표기
    //    (`MixedUseResultCard.tsx:334` "취득 실거래가(취득가액)")와도 어긋나지 않는다.
    const basisLabel = isSalesCase ? "매매사례가액" : isAppraisal ? "감정가액" : "취득 실거래가액";
    // 엔진 throw 3종 사전 차단(계산기 500 대신 친절 메시지) — 실거래가·감정·매매사례 공통.
    // 실가/추계 안분은 취득시 단일 기준시가 비율이라 PHD(미공시 3-시점)·보유중용도변경(시점별 면적)·공익수용(환산 분모) 조합 미지원.
    if (asset.usePreHousingDisclosure) {
      return `${label}: 겸용주택 ${basisLabel} + 개별주택가격 미공시(환산) 조합은 아직 지원하지 않습니다. 환산취득가 모드로 입력하세요.`;
    }
    if (asset.hasPartialUsageChange) {
      return `${label}: 겸용주택 ${basisLabel} + 보유 중 일부 용도변경 조합은 아직 지원하지 않습니다. 환산취득가 모드로 입력하세요.`;
    }
    if (asset.transferCause === "public_expropriation") {
      return `${label}: 겸용주택 ${basisLabel} + 공익수용 특례 조합은 아직 지원하지 않습니다.`;
    }
    // 총액 필수 — 매매사례=similarSalesValue, 감정·실거래가=fixedAcquisitionPrice.
    const totalValue = isSalesCase
      ? parseAmount(asset.similarSalesValue)
      : parseAmount(asset.fixedAcquisitionPrice);
    if (totalValue <= 0) {
      return isSalesCase
        ? `${label}: 겸용주택 매매사례가액을 입력하세요. 법 §100²에 따라 취득시 기준시가 비율로 주택분·상가분에 안분합니다.`
        : `${label}: 겸용주택 ${basisLabel}을 입력하세요. 법 §100²에 따라 취득시 기준시가 비율로 주택분·상가분에 안분합니다.`;
    }
    // 취득시 기준시가(안분 비율) 필수 — 감정·매매사례는 개산공제(§163⑥) base로도 사용.
    if (!asset.mixedAcqHousingPrice || parseAmount(asset.mixedAcqHousingPrice) <= 0) {
      return `${label}: 취득시 개별주택공시가격을 입력하세요. (주택분/상가분 안분 비율)`;
    }
    if (
      (!asset.mixedAcqCommercialBuildingPrice || parseAmount(asset.mixedAcqCommercialBuildingPrice) <= 0) ||
      (!asset.mixedAcqLandPricePerSqm || parseAmount(asset.mixedAcqLandPricePerSqm) <= 0)
    ) {
      return `${label}: 취득시 상가건물 기준시가와 개별공시지가를 입력하세요. (주택분/상가분 안분 비율)`;
    }
  }
  // PHD 전용 검증 (취득시 면적 자동 계산 — acquisitionArea 불필요)
  if (asset.usePreHousingDisclosure) {
    if (!asset.phdFirstDisclosureDate) return `${label}: 최초 고시일을 입력하세요.`;
    // §164⑦ 게이트 — 취득일(의제취득일 1985-01-01 반영) ≥ 최초고시일이면 취득당시 고시분 존재 → 3-시점 환산 대상 아님
    if (!isPhdEligible(asset.acquisitionDate, asset.phdFirstDisclosureDate))
      return `${label}: 취득일(의제취득일 1985-01-01 반영)이 최초 고시일 이후입니다. 취득 당시 주택공시가격이 고시되어 있으므로 3-시점 환산(§164⑦) 대상이 아닙니다 — 3-시점 환산을 끄고 취득시 기준시가를 직접 입력하세요.`;
    if (!asset.phdFirstDisclosureHousingPrice || parseAmount(asset.phdFirstDisclosureHousingPrice) <= 0)
      return `${label}: 최초 고시 개별주택가격을 입력하세요.`;
    // ⑧ Validation fallback — API는 phdTransferHousingPrice || mixedTransferHousingPrice 로 fallback.
    // 메인 양도시 섹션에서 입력한 값(mixedTransferHousingPrice)도 인정.
    const transferHousingValue =
      parseAmount(asset.phdTransferHousingPrice) ||
      parseAmount(asset.mixedTransferHousingPrice);
    if (transferHousingValue <= 0)
      return `${label}: 양도시 개별주택가격을 입력하세요. (양도시 기준시가 섹션)`;
    // Case A 4부분 안분 — house_to_commercial + 최초공시일 < 용도변경일 시 상가건물 기준시가 별도 입력 필수
    if (
      asset.hasPartialUsageChange &&
      asset.partialChangeDirection === "house_to_commercial" &&
      asset.partialChangeDate &&
      asset.phdFirstDisclosureDate &&
      asset.phdFirstDisclosureDate < asset.partialChangeDate
    ) {
      // ⑧ Validation fallback — API는 phdCommercialBuildingStdPriceAtAcq || mixedAcqCommercialBuildingPrice fallback.
      // 메인 취득시 상가건물 기준시가도 인정 (UI 통합으로 단일 필드 공유).
      const acqCommercialBuildingValue =
        parseAmount(asset.phdCommercialBuildingStdPriceAtAcq) ||
        parseAmount(asset.mixedAcqCommercialBuildingPrice);
      if (acqCommercialBuildingValue <= 0) {
        return `${label}: Case A 4부분 안분 — 취득시 상가건물 기준시가를 입력하세요. (홈택스 조회)`;
      }
      if (!asset.phdCommercialBuildingStdPriceAtFirst || parseAmount(asset.phdCommercialBuildingStdPriceAtFirst) <= 0) {
        return `${label}: Case A 4부분 안분 — 최초고시 상가건물 기준시가를 입력하세요. (홈택스 조회)`;
      }
    }
  }
  // 보유 중 일부 용도변경 검증 (시행령 §166⑥ + 집행기준 99-164-10)
  if (asset.hasPartialUsageChange) {
    if (!asset.partialChangeDirection) {
      return `${label}: 보유 중 일부 용도변경 — 취득시 자산 구성을 선택하세요.`;
    }
    if (asset.partialChangeAcqResidentialArea) {
      const v = parseFloat(asset.partialChangeAcqResidentialArea);
      if (!Number.isFinite(v) || v < 0) {
        return `${label}: 취득시 주택 연면적이 잘못되었습니다.`;
      }
    }
    if (asset.partialChangeAcqCommercialArea) {
      const v = parseFloat(asset.partialChangeAcqCommercialArea);
      if (!Number.isFinite(v) || v < 0) {
        return `${label}: 취득시 상가 연면적이 잘못되었습니다.`;
      }
    }
    // 주택→상가: 취득시 상가건물 기준시가·개별공시지가는 직접 입력 또는 PHD ① fallback으로 충족
    if (asset.partialChangeDirection === "house_to_commercial") {
      // 상가건물 기준시가: 직접 입력 또는 PHD ① 전체 건물 기준시가 × (상가면적 / 전체면적) 자동 안분
      const directBuilding = parseAmount(asset.mixedAcqCommercialBuildingPrice);
      const phdBuilding = parseAmount(asset.phdBuildingStdPriceAtAcq);
      const resArea = parseFloat(asset.residentialFloorArea) || 0;
      const nonResArea = parseFloat(asset.nonResidentialFloorArea) || 0;
      const totalFloor = resArea + nonResArea;
      const autoBuilding =
        phdBuilding > 0 && totalFloor > 0
          ? Math.floor((phdBuilding * nonResArea) / totalFloor)
          : 0;
      if (directBuilding <= 0 && autoBuilding <= 0) {
        return `${label}: 보유 중 일부 용도변경(주택→상가) — 취득시 상가건물 기준시가를 입력하세요. PHD ① 전체 건물 기준시가 입력 시 자동 안분, 또는 직접 조회·입력해야 합니다.`;
      }
      // 개별공시지가(상가): 직접 입력 / PHD ① 공시지가 / 1990.8.30. 이전 토지 환산(헬퍼) fallback
      const directLandPerSqm = parseAmount(asset.mixedAcqLandPricePerSqm);
      const phdLandPerSqm = parseAmount(asset.phdLandPricePerSqmAtAcq);
      const pre1990LandPerSqm =
        derivePre1990PhdLandPricePerSqmAtAcq(asset, formTransferDate ?? "") ?? 0;
      if (directLandPerSqm <= 0 && phdLandPerSqm <= 0 && pre1990LandPerSqm <= 0) {
        return `${label}: 보유 중 일부 용도변경(주택→상가) — 취득시 개별공시지가(상가)를 입력하세요.`;
      }
    }
    // PHD ON + partialUsageChange ON 조합 시 용도변경일 필수
    // (Case A/B 분기 식별을 위해 firstDisclosureDate 와 비교 필요)
    if (asset.usePreHousingDisclosure) {
      if (!asset.partialChangeDate) {
        return `${label}: 보유 중 일부 용도변경 + 개별주택가격 미공시 환산 동시 사용 시 용도변경일이 필수입니다. 시행령 §164⑤ 환산 산식이 최초공시일과 용도변경일의 선후 관계에 따라 달라집니다.`;
      }
      const ucDate = new Date(asset.partialChangeDate);
      if (Number.isNaN(ucDate.getTime())) {
        return `${label}: 용도변경일 형식이 잘못되었습니다.`;
      }
    }
    // PHD 강제 변경 금지 (이슈 5) — 사용자 직전 상태 보존, 경고만 결과 카드에 표시
  }
  return null;
}
