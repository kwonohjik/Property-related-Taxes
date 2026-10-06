/**
 * 겸용주택(mixed-use) 자산 전용 취득 검증 — transfer-tax-validate-asset.ts에서 분리 (800줄 정책).
 * calcMixedUseTransferTax 엔진이 주택분·상가분을 별도 처리하므로 generic 취득 검증과 분리한다.
 * validateAssetAcquisition 내 isMixedUseHouse 분기의 본체를 그대로 이관.
 */
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { isPhdEligible } from "./phd-eligibility";
import { isMixedUseCaseA } from "./mixed-use-case";
import { validateMixedUseAreas } from "./transfer-tax-validate-mixed-area";
import { validateMixedUseExprAsset } from "./transfer-tax-validate-expropriation";
import { validateMixedUseInheritanceAsset } from "./transfer-tax-validate-mixed-use-inheritance";
import { derivePre1990PhdLandPricePerSqmAtAcq } from "./transfer-pre1990-phd-bridge";
import { mixedAcqCommercialBuildingStd } from "./transfer-tax-api-mixed-use";
import { mixedAcqLandPricePerSqm } from "./transfer-tax-api-mixed-use";
import {
  isMixedAcqDatesSeparate,
  mixedAcqLandPricePerSqmAtBuildingAcq,
  needsMixedAcqLandPriceAtBuildingAcq,
} from "./mixed-use-acq-date-split";
import {
  mixedAcqHousingBuildingStd,
  mixedTransferHousingBuildingStd,
  needsMixedHousingBuildingStdAtAcq,
  needsMixedHousingBuildingStdAtTransfer,
} from "./mixed-use-housing-std-split";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import { fieldError } from "./transfer-tax-validate-field";

export function validateMixedUseAsset(
  asset: AssetForm,
  label: string,
  formTransferDate?: string,
): string | null {
  if (!asset.acquisitionDate) return fieldError("acquisitionDate", `${label}: 건물 취득일을 입력하세요.`);
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
    return fieldError("landAcquisitionDate", `${label}: 토지 취득일을 입력하세요.`);
  const areaErr = validateMixedUseAreas(asset, label, formTransferDate);
  if (areaErr) return areaErr;
  if (!asset.mixedTransferHousingPrice || parseAmount(asset.mixedTransferHousingPrice) <= 0)
    return fieldError("mixedTransferHousingPrice", `${label}: 양도시 개별주택공시가격을 입력하세요. (양도시 기준시가)`);
  // ⑧ Validation fallback — UI 표시·API 변환이 mixedTransfer || phdLandPricePerSqmAtTransfer 로
  // fallback하므로(주택·상가 부수토지는 동일 필지 = 단가 공유) validate도 PHD 값을 인정한다.
  // 취득측 fallback 인정(아래 :403-408)과 대칭.
  if (
    parseAmount(asset.mixedTransferLandPricePerSqm) <= 0 &&
    parseAmount(asset.phdLandPricePerSqmAtTransfer) <= 0
  )
    return fieldError("mixedTransferLandPricePerSqm", `${label}: 양도시 개별공시지가(원/㎡)를 입력하세요. (양도시 기준시가)`);
  // ⑧ S3-2 — 양도시 주택건물 기준시가(나목). 개별주택가격(H_T)을 토지 기준시가 : 건물 기준시가 비율로
  // 토지분·건물분에 나누는 분모다. 노출(⑤)·전송(④)·⑫·엔진과 **같은 leaf 술어**(`needsMixedHousingBuildingStdAtTransfer`) —
  // 폴백·뺄셈 후퇴 없음. 조문 인용은 확인 전이라 싣지 않는다.
  if (needsMixedHousingBuildingStdAtTransfer(asset) && mixedTransferHousingBuildingStd(asset) <= 0)
    return fieldError(
      "mixedTransferHousingBuildingStdPrice",
      `${label}: 양도시 주택건물 기준시가를 입력하세요. 겸용주택의 개별주택가격(주택건물+부수토지)은 토지 기준시가 : 건물 기준시가 비율로 토지분·건물분에 나눕니다 — 주택 부분 연면적 기준으로 계산기에서 산정하거나 직접 입력하세요.`,
    );
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
      return fieldError(
        isSalesCase ? "similarSalesValue" : "fixedAcquisitionPrice",
        isSalesCase
          ? `${label}: 겸용주택 매매사례가액을 입력하세요. 법 §100²에 따라 취득시 기준시가 비율로 주택분·상가분에 안분합니다.`
          : `${label}: 겸용주택 ${basisLabel}을 입력하세요. 법 §100²에 따라 취득시 기준시가 비율로 주택분·상가분에 안분합니다.`,
      );
    }
    // 취득시 기준시가(안분 비율) 필수 — 감정·매매사례는 개산공제(§163⑥) base로도 사용.
    if (!asset.mixedAcqHousingPrice || parseAmount(asset.mixedAcqHousingPrice) <= 0) {
      return fieldError("mixedAcqHousingPrice", `${label}: 취득시 개별주택공시가격을 입력하세요. (주택분/상가분 안분 비율)`);
    }
    // 한 메시지가 두 칸을 묻는다 — 비어 있는 칸(건물 먼저)으로 보낸다.
    const acqCommBuildingMissing =
      !asset.mixedAcqCommercialBuildingPrice || parseAmount(asset.mixedAcqCommercialBuildingPrice) <= 0;
    if (
      acqCommBuildingMissing ||
      (!asset.mixedAcqLandPricePerSqm || parseAmount(asset.mixedAcqLandPricePerSqm) <= 0)
    ) {
      return fieldError(acqCommBuildingMissing ? "mixedAcqCommercialBuildingPrice" : "mixedAcqLandPricePerSqm", `${label}: 취득시 상가건물 기준시가와 개별공시지가를 입력하세요. (주택분/상가분 안분 비율)`);
    }
  }
  // 환산·신축·1985 전 상속·증여 경로 — 엔진이 취득시 기준시가로 주택분·상가분 취득가액을 만든다
  // (`transfer-tax-mixed-use-helpers.ts` 주택분 `housingPrice ?? 0` · `-commercial.ts` 상가분 필수).
  // 비우면 주택분 취득가액이 조용히 0이 되거나(세액 증가) 상가분에서 500이 났다(2026-09-30).
  // 실거래가·감정·매매사례 매매는 위 블록이 이미 요구한다. ⑫ `mixedUseAssetSchema` superRefine이 거울이다.
  const isPurchaseActualLike = asset.acquisitionCause === "purchase" && !asset.useEstimatedAcquisition;
  const isPostDeemedInheritOrGift =
    (asset.acquisitionCause === "inheritance" || asset.acquisitionCause === "gift") &&
    asset.acquisitionDate >= "1985-01-01";
  if (
    !isPurchaseActualLike &&
    !isPostDeemedInheritOrGift &&
    !asset.usePreHousingDisclosure &&
    !(asset.hasPartialUsageChange && asset.partialChangeDirection === "commercial_to_house") &&
    parseAmount(asset.mixedAcqHousingPrice) <= 0
  )
    return fieldError("mixedAcqHousingPrice", `${label}: 취득시 개별주택공시가격을 입력하세요. (주택분 환산취득가 분자 — 미공시 주택이면 §164⑦ 3-시점 환산을 켜세요)`);
  const commStdMissing = mixedAcqCommercialBuildingStd(asset) <= 0;
  if (
    !isPurchaseActualLike &&
    !(asset.usePreHousingDisclosure && isMixedUseCaseA(asset)) &&
    (commStdMissing || mixedAcqLandPricePerSqm(asset, formTransferDate ?? "") <= 0)
  )
    return fieldError(commStdMissing ? "mixedAcqCommercialBuildingPrice" : "mixedAcqLandPricePerSqm", `${label}: 취득시 상가건물 기준시가와 개별공시지가를 입력하세요. (상가분 취득가액 산정)`);
  // ⑧ B0 — 토지·건물 취득일이 다르면 개별주택공시가격(건물 취득일)을 가목:나목 비례로 나눌 때의 가목
  // (주택부수토지 공시지가)도 **건물 취득일 기준**이어야 한다. 노출(⑤)·전송(④)과 같은 술어(`needsMixedAcqLandPriceAtBuildingAcq`)·
  // 같은 값 해소 — 폴백 없음(토지 취득일 값·PHD·1990 환산으로 대체하지 않는다. ⑫·엔진도 같은 조건으로 막는다).
  if (needsMixedAcqLandPriceAtBuildingAcq(asset) && mixedAcqLandPricePerSqmAtBuildingAcq(asset) <= 0)
    return fieldError(
      "mixedAcqLandPricePerSqmAtBuildingAcq",
      `${label}: 건물 취득일(${asset.acquisitionDate}) 기준 주택부수토지 개별공시지가(원/㎡)를 입력하세요. 토지 취득일(${asset.landAcquisitionDate || asset.acquisitionDate})과 달라 토지 취득일 기준 공시지가로 대신할 수 없습니다. (개별주택공시가격을 같은 날짜의 토지 기준시가 비율로 나눕니다)`,
    );
  // ⑧ S3-2 — 취득시 주택건물 기준시가(나목). 환산·실가·감정·상속증여의 취득시 주택 토지분·건물분이 이 비례에 의존한다.
  // 토지·건물 취득일이 다르면(B0) **건물 취득일** 기준 값. 상가→주택 용도변경·PHD는 술어가 거짓이라 요구하지 않는다.
  if (needsMixedHousingBuildingStdAtAcq(asset) && mixedAcqHousingBuildingStd(asset) <= 0) {
    const acqWord =
      asset.acquisitionCause === "inheritance" ? "상속개시일" : asset.acquisitionCause === "gift" ? "증여일" : "취득시";
    return fieldError(
      "mixedAcqHousingBuildingStdPrice",
      `${label}: ${acqWord} 주택건물 기준시가를 입력하세요${
        isMixedAcqDatesSeparate(asset)
          ? `(토지·건물 취득일이 달라 건물 취득일 ${asset.acquisitionDate} 기준 값)`
          : ""
      }. 겸용주택의 개별주택가격(주택건물+부수토지)은 토지 기준시가 : 건물 기준시가 비율로 토지분·건물분에 나눕니다 — 주택 부분 연면적 기준으로 계산기에서 산정하거나 직접 입력하세요.`,
    );
  }
  // PHD 전용 검증 (취득시 면적 자동 계산 — acquisitionArea 불필요)
  if (asset.usePreHousingDisclosure) {
    if (!asset.phdFirstDisclosureDate) return fieldError("phdFirstDisclosureDate", `${label}: 최초 고시일을 입력하세요.`);
    // §164⑦ 게이트 — 취득일(의제취득일 1985-01-01 반영) ≥ 최초고시일이면 취득당시 고시분 존재 → 3-시점 환산 대상 아님
    if (!isPhdEligible(asset.acquisitionDate, asset.phdFirstDisclosureDate))
      return fieldError("phdFirstDisclosureDate", `${label}: 취득일(의제취득일 1985-01-01 반영)이 최초 고시일 이후입니다. 취득 당시 주택공시가격이 고시되어 있으므로 3-시점 환산(§164⑦) 대상이 아닙니다 — 3-시점 환산을 끄고 취득시 기준시가를 직접 입력하세요.`);
    if (!asset.phdFirstDisclosureHousingPrice || parseAmount(asset.phdFirstDisclosureHousingPrice) <= 0)
      return fieldError("phdFirstDisclosureHousingPrice", `${label}: 최초 고시 개별주택가격을 입력하세요.`);
    // ④(`transfer-tax-api-mixed-use.ts`)는 아래 두 값이 없으면 PHD 객체를 빼고 보낸다 — 그러면 주택분
    // 취득가액이 조용히 0이 되면서 결과는 PHD 경로로 표시됐다(2026-09-30).
    if (parseAmount(asset.phdLandPricePerSqmAtFirst) <= 0)
      return fieldError("phdLandPricePerSqmAtFirst", `${label}: 최초공시일 토지 단위 공시지가를 입력하세요.`);
    if (mixedAcqLandPricePerSqm(asset, formTransferDate ?? "") <= 0)
      return fieldError("phdLandPricePerSqmAtAcq", `${label}: 취득시 토지 단위 공시지가를 입력하세요. (1990.8.30. 이전 취득이면 토지등급가액 환산을 켜고 등급을 입력하세요 — 소득세법 시행령 §164④)`);
    // ⑧ Validation fallback — API는 phdTransferHousingPrice || mixedTransferHousingPrice 로 fallback.
    // 메인 양도시 섹션에서 입력한 값(mixedTransferHousingPrice)도 인정.
    const transferHousingValue =
      parseAmount(asset.phdTransferHousingPrice) ||
      parseAmount(asset.mixedTransferHousingPrice);
    if (transferHousingValue <= 0)
      return fieldError("mixedTransferHousingPrice", `${label}: 양도시 개별주택가격을 입력하세요. (양도시 기준시가 섹션)`);
    // Case A 4부분 안분 — house_to_commercial + 최초공시일 < 용도변경일 시 상가건물 기준시가 별도 입력 필수
    // 판정은 정본 헬퍼 하나뿐이다 — 종전에는 ⑤ Legacy·⑧·④가 각자 표현식을 갖고 있었다.
    if (isMixedUseCaseA(asset)) {
      // ⑧ Validation fallback — API는 phdCommercialBuildingStdPriceAtAcq || mixedAcqCommercialBuildingPrice fallback.
      // 메인 취득시 상가건물 기준시가도 인정 (UI 통합으로 단일 필드 공유).
      const acqCommercialBuildingValue =
        parseAmount(asset.phdCommercialBuildingStdPriceAtAcq) ||
        parseAmount(asset.mixedAcqCommercialBuildingPrice);
      if (acqCommercialBuildingValue <= 0) {
        return fieldError("mixedAcqCommercialBuildingPrice", `${label}: Case A 4부분 안분 — 취득시 상가건물 기준시가를 입력하세요. (홈택스 조회)`);
      }
      if (!asset.phdCommercialBuildingStdPriceAtFirst || parseAmount(asset.phdCommercialBuildingStdPriceAtFirst) <= 0) {
        return fieldError("phdCommercialBuildingStdPriceAtFirst", `${label}: Case A 4부분 안분 — 최초고시 상가건물 기준시가를 입력하세요. (홈택스 조회)`);
      }
    }
  }
  // 보유 중 일부 용도변경 검증 (시행령 §166⑥ + 집행기준 99-164-10)
  if (asset.hasPartialUsageChange) {
    if (!asset.partialChangeDirection) {
      return fieldError("partialChangeDirection", `${label}: 보유 중 일부 용도변경 — 취득시 자산 구성을 선택하세요.`);
    }
    if (asset.partialChangeAcqResidentialArea) {
      const v = parseFloat(asset.partialChangeAcqResidentialArea);
      if (!Number.isFinite(v) || v < 0) {
        return fieldError("partialChangeAcqResidentialArea", `${label}: 취득시 주택 연면적이 잘못되었습니다.`);
      }
    }
    if (asset.partialChangeAcqCommercialArea) {
      const v = parseFloat(asset.partialChangeAcqCommercialArea);
      if (!Number.isFinite(v) || v < 0) {
        return fieldError("partialChangeAcqCommercialArea", `${label}: 취득시 상가 연면적이 잘못되었습니다.`);
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
        return fieldError("mixedAcqCommercialBuildingPrice", `${label}: 보유 중 일부 용도변경(주택→상가) — 취득시 상가건물 기준시가를 입력하세요. PHD ① 전체 건물 기준시가 입력 시 자동 안분, 또는 직접 조회·입력해야 합니다.`);
      }
      // 개별공시지가(상가): 직접 입력 / PHD ① 공시지가 / 1990.8.30. 이전 토지 환산(헬퍼) fallback
      const directLandPerSqm = parseAmount(asset.mixedAcqLandPricePerSqm);
      const phdLandPerSqm = parseAmount(asset.phdLandPricePerSqmAtAcq);
      const pre1990LandPerSqm =
        derivePre1990PhdLandPricePerSqmAtAcq(asset, formTransferDate ?? "") ?? 0;
      if (directLandPerSqm <= 0 && phdLandPerSqm <= 0 && pre1990LandPerSqm <= 0) {
        return fieldError("mixedAcqLandPricePerSqm", `${label}: 보유 중 일부 용도변경(주택→상가) — 취득시 개별공시지가(상가)를 입력하세요.`);
      }
    }
    // PHD ON + partialUsageChange ON 조합 시 용도변경일 필수
    // (Case A/B 분기 식별을 위해 firstDisclosureDate 와 비교 필요)
    if (asset.usePreHousingDisclosure) {
      if (!asset.partialChangeDate) {
        return fieldError("partialChangeDate", `${label}: 보유 중 일부 용도변경 + 개별주택가격 미공시 환산 동시 사용 시 용도변경일이 필수입니다. 시행령 §164⑤ 환산 산식이 최초공시일과 용도변경일의 선후 관계에 따라 달라집니다.`);
      }
      const ucDate = new Date(asset.partialChangeDate);
      if (Number.isNaN(ucDate.getTime())) {
        return fieldError("partialChangeDate", `${label}: 용도변경일 형식이 잘못되었습니다.`);
      }
    }
    // PHD 강제 변경 금지 (이슈 5) — 사용자 직전 상태 보존, 경고만 결과 카드에 표시
  }
  return null;
}
