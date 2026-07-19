/**
 * 양도소득세 자산-수준(AssetForm 1건) 유효성 검사
 *
 * transfer-tax-validate.ts에서 분리 (800줄 정책, 2026-06-12 — 오류 일괄 수집 도입).
 * - validateAssetAcquisition: 취득 정보 (취득가·환산·1990·신축·이월과세·겸용주택)
 * - validateAssetEntry: step 0 자산 1건 전체 검증 (assetKind → 지분율 → 취득 → 특례 → 날짜 순서)
 *
 * 모든 함수는 첫 오류 메시지(string) 또는 null 반환 — 자산 내부는 첫 오류 1건,
 * 자산 간 일괄 수집은 transfer-tax-validate.ts의 collectStepIssues가 담당.
 */

import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { validateMixedUseAreas } from "./transfer-tax-validate-mixed-area";
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { validateSplitDirectInputs } from "./transfer-tax-validate-split";
import { validateExprValuationAsset } from "./transfer-tax-validate-expropriation";
import { validateExprValuationParcel } from "./transfer-tax-validate-expropriation";
import { validateAuctionAsset } from "./transfer-tax-validate-expropriation";
import { validateHousingExprAsset } from "./transfer-tax-validate-expropriation";
import { validateSplitLandExprAsset } from "./transfer-tax-validate-expropriation";
import { validateMixedUseExprAsset } from "./transfer-tax-validate-expropriation";
import type { TransferFormData, AssetForm } from "@/lib/stores/calc-wizard-store";
import { validateGeneralBuildingAsset } from "./transfer-tax-validate-gb";
import { validateRedevelopmentAsset } from "./transfer-tax-validate-redev";
import { validateBurdenedGiftAsset } from "./transfer-tax-validate-bg";
import { validateNblDetailedJudgment } from "./transfer-tax-validate-nbl";
import { derivePre1990PhdLandPricePerSqmAtAcq } from "./transfer-pre1990-phd-bridge";

/**
 * 오늘 날짜 — 로컬(KST) 기준 `YYYY-MM-DD` 문자열.
 * `toISOString()`(UTC)은 자정 부근 하루 어긋남 위험 → 로컬 연·월·일로 직접 조립.
 * 클라이언트 검증 전용이라 `new Date()` 허용 (엔진 `new Date(x)` 파싱 금지 정책과 무관).
 * validate.ts(collectStepWarnings)도 import — validate-asset.ts(leaf)에 두어 순환 import 회피.
 */
export function todayLocalISO(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

// ─── 장기임대주택 거주주택 비과세 특례 검증 (⑧, 소령 §155⑳) ──────

/**
 * 장기임대주택 거주주택 비과세 특례 서브 검증.
 * API/UI fallback 없음 → validate에서 동일하게 명시 차단.
 * 자동 안분 fallback 금지 원칙 준수.
 */
function validateRentalHousingException(
  rh: AssetForm["rentalHousingException"] | undefined,
  asset: AssetForm,
  label: string,
  formTransferDate?: string,
): string | null {
  if (!rh?.applyException) return null;

  // 임대주택 1호 이상 필수
  if (!rh.rentalUnits || rh.rentalUnits.length === 0) {
    return `${label}: 장기임대주택 특례 — 임대주택 정보를 1호 이상 입력하세요.`;
  }

  // 호별 검증
  for (let i = 0; i < rh.rentalUnits.length; i++) {
    const u = rh.rentalUnits[i];
    const unitLabel = `${label} 임대주택 #${i + 1}`;
    if (!u.registrationDate) return `${unitLabel}: 등록일을 입력하세요.`;
    if (!u.standardPriceAtRentalStart || parseAmount(u.standardPriceAtRentalStart) <= 0) {
      return `${unitLabel}: 임대개시일 기준시가를 입력하세요.`;
    }
    if (!u.requirementsConfirmed) {
      return `${unitLabel}: 기타 요건 자기확인이 필요합니다 (임대료 5% 상한, 등록 유지 등).`;
    }
  }

  // B 시나리오 추가 검증
  if (rh.scenario === 'B') {
    if (!rh.priorResidenceTransferDate) {
      return `${label}: PHRP 시나리오 — 직전거주주택 양도일을 입력하세요.`;
    }
    const pAcq = parseAmount(rh.standardPriceAtAcquisitionForPhrp ?? "");
    const pPrior = parseAmount(rh.standardPriceAtPriorTransfer ?? "");
    const pTransfer = parseAmount(rh.standardPriceAtTransferForPhrp ?? "");

    if (pAcq <= 0) return `${label}: 임대→거주 전환 주택 시나리오 — 취득 당시 기준시가를 입력하세요.`;
    if (pPrior <= 0) return `${label}: 임대→거주 전환 주택 시나리오 — 직전거주주택 양도 당시 기준시가를 입력하세요.`;
    if (pTransfer <= 0) return `${label}: 임대→거주 전환 주택 시나리오 — 현 양도 당시 기준시가를 입력하세요.`;

    // 시점 일관성 확인 (경고 수준 — 실무 이례 케이스 차단하지 않고 경고만)
    if (pPrior < pAcq) {
      return `${label}: PHRP 시나리오 — 직전 양도 당시 기준시가(${pPrior.toLocaleString()})가 취득 당시(${pAcq.toLocaleString()})보다 작습니다. 확인 후 재입력하세요.`;
    }
    if (pTransfer < pPrior) {
      return `${label}: PHRP 시나리오 — 현 양도 당시 기준시가(${pTransfer.toLocaleString()})가 직전 양도 당시(${pPrior.toLocaleString()})보다 작습니다. 확인 후 재입력하세요.`;
    }

    // 분모 0 방지
    if (pTransfer === pAcq) {
      return `${label}: PHRP 시나리오 — 취득 당시와 현 양도 당시 기준시가가 동일하여 §161① 비율을 계산할 수 없습니다.`;
    }
  }

  // 거주주택 취득일 검증 (자산-수준)
  if (!asset.acquisitionDate) {
    return `${label}: 장기임대주택 특례 — 거주주택 취득일을 입력하세요.`;
  }

  // §155⑳ 거주주택 거주 2년 + 보유 2년 요건 — 침묵 실패 차단
  const liveMonthsRaw = asset.residencePeriodMonthsAsset ?? "";
  const liveMonthsVal = parseInt(String(liveMonthsRaw).replace(/,/g, "") || "0", 10);

  if (!liveMonthsVal || liveMonthsVal < 24) {
    return `${label}: 장기임대주택 특례 — 거주주택 거주기간 2년(24개월) 이상이 필요합니다. 보유 상황 단계에서 "거주기간(개월)"을 24 이상으로 입력하세요. (현재: ${liveMonthsVal || 0}개월)`;
  }

  // 보유기간 24개월 검증 (취득일 ~ 양도일)
  if (formTransferDate && asset.acquisitionDate) {
    const acqMs = new Date(asset.acquisitionDate).getTime();
    const trnMs = new Date(formTransferDate).getTime();
    if (Number.isFinite(acqMs) && Number.isFinite(trnMs)) {
      const days = Math.floor((trnMs - acqMs) / (1000 * 60 * 60 * 24));
      if (days < 730) {
        return `${label}: 장기임대주택 특례 — 거주주택 보유기간 2년(730일) 이상이 필요합니다. (취득일~양도일: ${days}일)`;
      }
    }
  }

  return null;
}

/** 다필지 자산 검증 — primary 자산이 다필지 모드일 때 */
function validateParcelMode(primary: AssetForm, formTransferDate?: string): string | null {
  const parcels = primary.parcels ?? [];
  if (parcels.length === 0) return "필지를 최소 1개 추가하세요.";
  for (let i = 0; i < parcels.length; i++) {
    const p = parcels[i];
    const label = `필지 ${i + 1}`;
    const scenario = p.areaScenario ?? "partial";

    if (!p.useDayAfterReplotting && !p.acquisitionDate)
      return `${label}: 취득일을 선택하세요.`;
    if (p.useDayAfterReplotting && !p.replottingConfirmDate)
      return `${label}: 환지처분확정일을 선택하세요.`;

    if (scenario === "reduction") {
      if (!p.entitlementArea || parseFloat(p.entitlementArea) <= 0)
        return `${label}: 권리면적을 입력하세요.`;
      if (!p.allocatedArea || parseFloat(p.allocatedArea) <= 0)
        return `${label}: 교부면적을 입력하세요.`;
      if (!p.priorLandArea || parseFloat(p.priorLandArea) <= 0)
        return `${label}: 종전토지면적을 입력하세요.`;
      if (parseFloat(p.entitlementArea) <= parseFloat(p.allocatedArea))
        return `${label}: 감환지는 권리면적이 교부면적보다 커야 합니다.`;
    } else {
      if (!p.transferArea || parseFloat(p.transferArea) <= 0)
        return `${label}: 양도면적을 입력하세요.`;
      if (scenario === "partial") {
        if (!p.acquisitionArea || parseFloat(p.acquisitionArea) <= 0)
          return `${label}: 총 취득면적을 입력하세요.`;
        if (parseFloat(p.acquisitionArea) < parseFloat(p.transferArea))
          return `${label}: 취득면적은 양도면적 이상이어야 합니다.`;
      }
    }

    if (p.acquisitionMethod === "estimated") {
      if (!p.standardPricePerSqmAtAcq || parseFloat(p.standardPricePerSqmAtAcq) <= 0)
        return `${label}: 취득시 ㎡당 기준시가를 입력하세요.`;
      if (!p.standardPricePerSqmAtTransfer || parseFloat(p.standardPricePerSqmAtTransfer) <= 0)
        return `${label}: 양도시 ㎡당 기준시가를 입력하세요.`;
      // 공익수용 §164⑨ 1호 필지별 min[] 특례 — 보상 2필드 필수 (별도 모듈)
      const parcelExprError = validateExprValuationParcel(primary, p, label, formTransferDate);
      if (parcelExprError) return parcelExprError;
    } else {
      if (!p.acquisitionPrice || parseAmount(p.acquisitionPrice) <= 0)
        return `${label}: 취득가액을 입력하세요.`;
    }
  }
  return null;
}

/** 자산 카드 1건의 취득 정보 검증 (취득가·환산·1990·신축) */
export function validateAssetAcquisition(asset: AssetForm, label: string, formTransferDate?: string): string | null {
  // ── 부담부증여 (소령 §159 + 증여세 통합 §53·§47②) — 별도 모듈로 분리 (800줄 정책, 2026-05-12) ──
  const bgError = validateBurdenedGiftAsset(asset, label);
  if (bgError) return bgError;

  // ── 상업용건물·오피스텔 환산취득가 전용 검증 (⑧, 소령 §164⑧, §176조의2②2호) ──
  // ⑧ 동기화 원칙: API buildCommercialBuildingValuation 의 undefined 반환 조건과 동일하게 차단.
  if (asset.assetKind === "commercial_building" && asset.useEstimatedAcquisition) {
    // cbEra 선택 필수
    if (!asset.cbEra) {
      return `${label}: 상업용건물·오피스텔 — 호별고시 취득 시점을 선택하세요.`;
    }
    // 면적 3종 필수
    if (!parseDecimal(asset.cbExclusiveArea))
      return `${label}: 전용면적을 입력하세요.`;
    if (!parseDecimal(asset.cbSharedArea))
      return `${label}: 공유면적을 입력하세요.`;
    if (!parseDecimal(asset.cbLandArea))
      return `${label}: 대지면적을 입력하세요.`;
    // 호별고시가 공통 필수
    if (!parseAmount(asset.cbUnitPriceAtTransfer))
      return `${label}: 양도시 ㎡당 호별고시가를 입력하세요.`;
    if (!parseAmount(asset.cbUnitPriceAtFirstOrAcq))
      return `${label}: ${asset.cbEra === "pre_disclosure" ? "최초고시(2005)" : "취득시"} ㎡당 호별고시가를 입력하세요.`;
    // 양도시 개별공시지가 공통 필수
    if (!parseAmount(asset.cbLandPricePerSqmAtTransfer))
      return `${label}: 양도시 개별공시지가(원/㎡)를 입력하세요.`;

    if (asset.cbEra === "pre_disclosure") {
      // 건물 기준시가 3시점 필수 (총액, 원 — 외부에서 ㎡당 단가 × 연면적 보정계수 반영)
      if (!parseAmount(asset.cbBuildingStdPriceAtAcq))
        return `${label}: 취득시 건물 기준시가(총액)를 입력하세요.`;
      if (!parseAmount(asset.cbBuildingStdPriceAtFirst))
        return `${label}: 최초고시시(2005) 건물 기준시가(총액)를 입력하세요.`;
      if (!parseAmount(asset.cbBuildingStdPriceAtTransfer))
        return `${label}: 양도시 건물 기준시가(총액)를 입력하세요.`;
      // 개별공시지가 3시점 필수
      if (!parseAmount(asset.cbLandPricePerSqmAtAcq))
        return `${label}: 취득시 개별공시지가(원/㎡)를 입력하세요.`;
      if (!parseAmount(asset.cbLandPricePerSqmAtFirst))
        return `${label}: 최초고시시(2005) 개별공시지가(원/㎡)를 입력하세요.`;
    }

    if (asset.cbEra === "post_disclosure") {
      // post_disclosure: 취득시 개별공시지가 필수
      if (!parseAmount(asset.cbLandPricePerSqmAtAcq))
        return `${label}: 취득시 개별공시지가(원/㎡)를 입력하세요.`;
    }

    // 상업용건물 환산취득가 검증 완료 — 일반 취득 검증 스킵
    if (!asset.acquisitionDate) return `${label}: 취득일을 입력하세요.`;
    return null;
  }

  // ── 일반건물(토지+건물 일괄) 전용 검증 — transfer-tax-validate-gb.ts 위임 ──
  if (asset.assetKind === "general_building") {
    return validateGeneralBuildingAsset(asset, label, formTransferDate);
  }

  // ── 재개발/재건축 (시행령 §166) — assetKind="redevelopment_apt" 또는 "right_to_move_in" 시 ──
  // redevSubject="" 미입력 시에도 redev 검증 진입 (3중 패턴 — API/validate 동기화):
  // buildRedevelopmentPayload와 동일 fallback (right_to_move_in → "right", 그 외 → "apt")
  if (asset.assetKind === "redevelopment_apt" || asset.assetKind === "right_to_move_in") {
    const redevError = validateRedevelopmentAsset(asset, label);
    if (redevError) return redevError;
    // redevelopment 검증 통과 후 일반 취득 검증 스킵 (별도 분기 — 양도가액·취득가액은 redev 분기에서 처리)
    if (!asset.acquisitionDate) return `${label}: 취득일을 입력하세요.`;
    return null;
  }

  // ── 이월과세(증여) 전용 검증 — carryover_gift 시 일반 취득 검증 스킵 ──
  if (asset.acquisitionCause === "carryover_gift") {
    const c = asset.carryover;

    // (a) 가업상속공제 최우선 차단 (§97조의2 ④)
    if (c?.exclusionDeclared?.isFamilyBusinessInheritedAsset === true) {
      return `${label}: 가업상속공제 적용 자산은 현재 버전에서 지원하지 않습니다. 세무사에게 수동 계산을 의뢰하세요 (소득세법 §97조의2 ④).`;
    }

    if (!c) return `${label}: 이월과세 증여 정보를 입력하세요.`;

    // (b) 필수 날짜 필드
    if (!c.giftRegistryDate) return `${label}: 증여 등기접수일을 입력하세요.`;
    if (!c.donorAcquisitionDate) return `${label}: 증여자 취득일을 입력하세요.`;

    // (b-2) 날짜 순서 — 증여자 취득 → 증여 등기 → 양도 (gift/inheritance 원인과 동일 수준 차단)
    if (c.donorAcquisitionDate >= c.giftRegistryDate)
      return `${label}: 증여자 취득일은 증여 등기접수일보다 이전이어야 합니다.`;
    if (formTransferDate && c.giftRegistryDate >= formTransferDate)
      return `${label}: 증여 등기접수일은 양도일보다 이전이어야 합니다.`;

    // (c) 비교과세 B 시나리오 취득가
    if (parseAmount(c.giftDateValuation) <= 0)
      return `${label}: 증여 당시 평가액을 입력하세요.`;

    // (d) 취득가액 — 환산 미사용 시 직접 입력 필수
    if (!c.useEstimatedAcquisition && parseAmount(c.donorAcquisitionPrice) <= 0) {
      return `${label}: 증여자 취득가액을 입력하세요. (환산취득가 사용 시 토글 켜기)`;
    }

    // (e) 환산 사용 시 모드 선택 필수 + 모드별 필수 필드 검증
    if (c.useEstimatedAcquisition) {
      // 환산 모드 미선택 차단
      if (!c.estimationMode) {
        return `${label}: 환산 방식(일반 기준시가/개별주택가격 미공시/공동주택 최초고시 전)을 선택하세요.`;
      }

      if (c.estimationMode === "general") {
        // 일반 기준시가 환산 — donorStandardPrice* 2개 필수
        if (parseAmount(c.donorStandardPriceAtAcquisition) <= 0)
          return `${label}: 취득시 기준시가를 입력하세요.`;
        if (parseAmount(c.donorStandardPriceAtTransfer) <= 0)
          return `${label}: 양도시 기준시가를 입력하세요.`;
      } else if (c.estimationMode === "phd") {
        // PHD §164⑤ — asset 수준 phdFirstDisclosureDate 등 필수
        if (!asset.phdFirstDisclosureDate) return `${label}: 최초 고시일을 입력하세요.`;
        if (parseAmount(asset.phdFirstDisclosureHousingPrice) <= 0)
          return `${label}: 최초 고시 개별주택가격을 입력하세요.`;
        const transferPrice =
          parseAmount(asset.phdTransferHousingPrice) || parseAmount(asset.standardPriceAtTransfer);
        if (transferPrice <= 0) return `${label}: 양도시 개별주택가격을 입력하세요.`;
      } else if (c.estimationMode === "apd") {
        // APD — PHD와 동일 경로(preHousingDisclosure)를 사용하므로 같은 필드 검증
        if (!asset.phdFirstDisclosureDate) return `${label}: 최초 고시일(공동주택 최초공시일)을 입력하세요.`;
        if (parseAmount(asset.phdFirstDisclosureHousingPrice) <= 0)
          return `${label}: 최초공시 공동주택가격을 입력하세요.`;
        const transferPrice =
          parseAmount(asset.phdTransferHousingPrice) || parseAmount(asset.standardPriceAtTransfer);
        if (transferPrice <= 0) return `${label}: 양도시 공동주택가격을 입력하세요.`;
      }
    }

    // (f) 음수 차단
    if (parseAmount(c.donorCapitalExpenditure) < 0)
      return `${label}: 증여자 자본적지출은 음수일 수 없습니다.`;
    if (parseAmount(c.giftTaxAmount) < 0)
      return `${label}: 증여세 상당액은 음수일 수 없습니다.`;

    // carryover_gift 검증 완료 — 일반 취득 검증 스킵
    return null;
  }

  // 겸용주택 분리계산은 calcMixedUseTransferTax 엔진이 별도 처리 — 전용 검증 후 return
  if (asset.isMixedUseHouse === true) {
    if (!asset.acquisitionDate) return `${label}: 건물 취득일을 입력하세요.`;
    // 토지·건물 취득일 다름 토글 ON일 때만 토지 취득일 필수. OFF면 acquisitionDate로 폴백.
    if (asset.hasSeperateLandAcquisitionDate && !asset.landAcquisitionDate)
      return `${label}: 토지 취득일을 입력하세요.`;
    const areaErr = validateMixedUseAreas(asset, label);
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
    // PHD 전용 검증 (취득시 면적 자동 계산 — acquisitionArea 불필요)
    if (asset.usePreHousingDisclosure) {
      if (!asset.phdFirstDisclosureDate) return `${label}: 최초 고시일을 입력하세요.`;
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

  // ── 신축(자가건축) 케이스 전용 검증 (사례 28, 영 §162①4호) ──
  if (asset.acquisitionCause === "newConstruction") {
    // 4시점 중 최소 1개 필수 (영 §162①4호 취득일 기준)
    // G-5: 사용검사필증 교부일(approvalCertificateDate) 추가로 4시점 중 하나면 충족
    const hasAnyDate =
      !!asset.occupancyApprovalDate ||
      !!asset.approvalCertificateDate ||
      !!asset.temporaryApprovalDate ||
      !!asset.actualUseDate;
    if (!hasAnyDate) {
      return `${label}: 신축 주택의 사용승인일을 입력하세요. (소득세법 시행령 §162①4호 — 사용승인일·사용검사필증 교부일·임시사용승인일·사실상 사용일 중 하나 이상 필수)`;
    }
    // 취득가액(신축비용) 필수
    if (!asset.fixedAcquisitionPrice || parseAmount(asset.fixedAcquisitionPrice) <= 0) {
      return `${label}: 신축 비용(취득가액)을 입력하세요.`;
    }
    // acquisitionDate는 4시점 중 가장 이른 날이 자동으로 폼에 동기화되므로 별도 검증 불필요.
    // (CompanionAssetCard 신축 분기에서 4시점 onChange 시점에 acquisitionDate를 자동 patch)
    // manualHoldingPeriodOverride 유효값 검증 (undefined이면 자동 분기 — 허용)
    const validOverrides = ["shortTermHousing70", "shortTerm60", "progressive"];
    if (
      asset.manualHoldingPeriodOverride !== undefined &&
      !validOverrides.includes(asset.manualHoldingPeriodOverride)
    ) {
      return `${label}: 토지 세율 수동 지정 값이 유효하지 않습니다.`;
    }
    // 신축 + companion 토지가 있고 1년 미만 보유 예상 시 건물 정착면적 필수 (부수토지 한도 산정)
    // 여기서는 보유기간 계산이 어렵고 면적은 있으면 더 좋으므로 강제 차단 대신 경고 수준만 유지.
    // 실제 엔진 분기에서 buildingFootprintArea가 없으면 자동 분기가 비활성됨.
    return null;
  }

  if (!asset.acquisitionDate) return `${label}: 취득일을 입력하세요.`;

  // ⑧ 비사업용 토지 정밀판정 토글 ON — 필수 입력 차단 (UI 통과↔판정 누락 침묵 모순 방지).
  // 취득 모드(환산·감정·실거래)와 직교하므로 모드 분기 이전에 검사. (본체는 800줄 정책으로 분리)
  const nblErr = validateNblDetailedJudgment(asset, label, formTransferDate);
  if (nblErr) return nblErr;

  const isSalesCase = asset.isSalesCaseAcquisition === true;
  const isAppraisal = !isSalesCase && asset.isAppraisalAcquisition === true;
  const isEstimated = !isSalesCase && !isAppraisal && asset.useEstimatedAcquisition === true;
  const hasPre1990 = (asset.pre1990Enabled ?? false) && asset.assetKind === "land";
  const isParcelMode = asset.parcelMode === true && asset.assetKind === "land";

  // 0) 매매사례가액 추계(§176의2③1호) — salesCase 모드 시 similarSalesValue 필수
  if (isSalesCase) {
    if (!asset.similarSalesValue || parseAmount(asset.similarSalesValue) <= 0)
      return `${label}: 매매사례가액을 입력하세요.`;
    // 개산공제 base: 취득시 기준시가(standardPriceAtAcq) 필수 — 0 허용(입력 없으면 개산공제 0)
    // 단, 아예 검증 차단보다는 사용자 확인 유도 힌트만 제공 (추계는 기준시가 불확실 케이스가 많음)
    return null;
  }

  // 1) 다필지 모드는 별도 검증
  if (isParcelMode) return validateParcelMode(asset, formTransferDate);

  // 2) 환지처분 시나리오
  if (asset.assetKind === "land") {
    const scenario = asset.areaScenario ?? "same";
    if (scenario === "reduction") {
      if (!asset.replottingConfirmDate) return `${label}: 환지처분확정일을 입력하세요.`;
      if (!asset.entitlementArea || parseFloat(asset.entitlementArea) <= 0)
        return `${label}: 환지 권리면적을 입력하세요.`;
      if (!asset.allocatedArea || parseFloat(asset.allocatedArea) <= 0)
        return `${label}: 환지 교부면적을 입력하세요.`;
      if (!asset.priorLandArea || parseFloat(asset.priorLandArea) <= 0)
        return `${label}: 환지 이전 종전면적을 입력하세요.`;
      if (parseFloat(asset.entitlementArea) <= parseFloat(asset.allocatedArea))
        return `${label}: 감환지는 권리면적이 교부면적보다 커야 합니다.`;
    }
    if (scenario === "increase") {
      if (!asset.replottingConfirmDate) return `${label}: 환지처분확정일을 입력하세요.`;
      if (!asset.acquisitionArea || parseFloat(asset.acquisitionArea) <= 0)
        return `${label}: 종전토지 면적(③ 취득정보의 취득 당시 면적)을 입력하세요.`;
      if (!asset.transferArea || parseFloat(asset.transferArea) <= 0)
        return `${label}: 권리면적(양도 당시 면적)을 입력하세요.`;
    }
  }

  // 3) 1990.8.30. 이전 토지 환산 (자산-수준)
  if (hasPre1990) {
    const areaSqm = parseFloat((asset.acquisitionArea || "").replace(/,/g, ""));
    if (!areaSqm || areaSqm <= 0) return `${label}: 취득 당시 면적(㎡)을 입력하세요.`;
    if (!asset.pre1990PricePerSqm_1990 || parseAmount(asset.pre1990PricePerSqm_1990) <= 0)
      return `${label}: 1990.1.1. 개별공시지가(원/㎡)를 입력하세요.`;
    // 양도시 기준시가는 상위 standardPriceAtTransfer 필드로 입력 (㎡당 단가 × 면적 총액).
    // pre1990PricePerSqm_atTransfer(입력 UI 없는 필드)는 더 이상 검사하지 않음.
    if (!asset.standardPriceAtTransfer || parseAmount(asset.standardPriceAtTransfer) <= 0)
      return `${label}: 양도 당시 기준시가를 입력하세요.`;
    const gradeValid = (raw: string) => {
      const n = Number((raw || "").replace(/,/g, ""));
      return Number.isFinite(n) && n > 0;
    };
    if (!gradeValid(asset.pre1990Grade_current)) return `${label}: 1990.8.30. 현재 토지등급을 입력하세요.`;
    if (!gradeValid(asset.pre1990Grade_prev)) return `${label}: 1990.8.30. 직전 토지등급을 입력하세요.`;
    if (!gradeValid(asset.pre1990Grade_atAcq)) return `${label}: 취득시 유효 토지등급을 입력하세요.`;
  }

  // 4) 환산취득가 — 기준시가
  // 주의: usePreHousingDisclosure === true 경로에서는 §164⑤ 3-시점 입력으로 자동 도출되므로
  //   standardPriceAtAcq / standardPriceAtTransfer 직접 입력 불요.
  // 겸용주택 PHD는 위 isMixedUseHouse 분기에서 이미 return되어 이 줄에 도달하지 않음.
  // hasSeperateLandAcquisitionDate 무관 — 취득일 동일(사례 23 공동주택 등)해도 PHD 경로는 표준시가 직접 입력 불요.
  const usesPhd = asset.usePreHousingDisclosure === true;

  if (isEstimated && !hasPre1990 && !usesPhd) {
    if (!asset.standardPriceAtAcq || parseAmount(asset.standardPriceAtAcq) <= 0)
      return `${label}: 취득 당시 기준시가를 입력하세요.`;
    if (!asset.standardPriceAtTransfer || parseAmount(asset.standardPriceAtTransfer) <= 0)
      return `${label}: 양도 당시 기준시가를 입력하세요.`;
  }

  // 4-2) 개별주택가격 미공시 취득 환산 (§164⑤) — 일반 자산: 11개 필수 필드
  // PHD §164⑤ 는 환산취득가 산식의 일부이므로 환산 모드(isEstimated)에서만 검증.
  // 실거래가/감정가액 모드에서 usePreHousingDisclosure 플래그가 잔존해도 무시.
  if (usesPhd && isEstimated) {
    if (!asset.phdFirstDisclosureDate)
      return `${label}: 최초 고시일을 입력하세요.`;
    // ISO 날짜 유효성 — 존재하지 않는 날(1993-02-30 등) 차단
    {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(asset.phdFirstDisclosureDate);
      const d = m ? new Date(asset.phdFirstDisclosureDate) : null;
      if (!m || !d || isNaN(d.getTime()) ||
          d.getUTCFullYear() !== Number(m[1]) ||
          d.getUTCMonth() + 1 !== Number(m[2]) ||
          d.getUTCDate() !== Number(m[3])) {
        return `${label}: 최초 고시일이 유효하지 않습니다. (예: 공동주택 최초고시 1993-02-01)`;
      }
    }
    if (!asset.phdFirstDisclosureHousingPrice || parseAmount(asset.phdFirstDisclosureHousingPrice) <= 0)
      return `${label}: 최초 고시 개별주택가격을 입력하세요.`;
    // 일반 자산: acquisitionArea 직접 입력 필요 (겸용주택은 면적 자동 계산이므로 제외)
    if (!asset.acquisitionArea || parseFloat(asset.acquisitionArea) <= 0)
      return `${label}: 토지 면적(㎡)을 입력하세요. (자산 기본 정보)`;
    if (!asset.phdLandPricePerSqmAtAcq || parseAmount(asset.phdLandPricePerSqmAtAcq) <= 0)
      return `${label}: 취득시 토지 단위 공시지가를 입력하세요.`;
    if (!asset.phdBuildingStdPriceAtAcq || parseAmount(asset.phdBuildingStdPriceAtAcq) <= 0)
      return `${label}: 취득시 건물 기준시가를 입력하세요.`;
    if (!asset.phdLandPricePerSqmAtFirst || parseAmount(asset.phdLandPricePerSqmAtFirst) <= 0)
      return `${label}: 최초공시일 토지 단위 공시지가를 입력하세요.`;
    if (!asset.phdBuildingStdPriceAtFirst || parseAmount(asset.phdBuildingStdPriceAtFirst) <= 0)
      return `${label}: 최초공시일 건물 기준시가를 입력하세요.`;
    if (!asset.phdTransferHousingPrice || parseAmount(asset.phdTransferHousingPrice) <= 0)
      return `${label}: 양도시 개별주택가격을 입력하세요.`;
    if (!asset.phdLandPricePerSqmAtTransfer || parseAmount(asset.phdLandPricePerSqmAtTransfer) <= 0)
      return `${label}: 양도시 토지 단위 공시지가를 입력하세요.`;
    if (!asset.phdBuildingStdPriceAtTransfer || parseAmount(asset.phdBuildingStdPriceAtTransfer) <= 0)
      return `${label}: 양도시 건물 기준시가를 입력하세요.`;
  }

  // 5) 취득가액 — 실거래가·감정가액 모두 fixedAcquisitionPrice 입력 루틴.
  //    ※ 재개발/재건축(assetKind === "redevelopment_apt")은 위 §166 분기에서 이미 return 처리됨.
  if (!isEstimated && !hasPre1990) {
    if (asset.acquisitionCause === "purchase") {
      if (!asset.fixedAcquisitionPrice || parseAmount(asset.fixedAcquisitionPrice) <= 0)
        return `${label}: ${isAppraisal ? "감정가액" : "취득가액"}을 입력하세요.`;
    } else if (asset.acquisitionCause === "gift") {
      if (!asset.fixedAcquisitionPrice || parseAmount(asset.fixedAcquisitionPrice) <= 0)
        return `${label}: 증여 신고가액을 입력하세요.`;
      if (!asset.donorAcquisitionDate)
        return `${label}: 증여자 취득일을 입력하세요.`;
    } else if (asset.acquisitionCause === "burdened_gift") {
      // ⑧ 부담부증여 (소령 §159) — Phase 2 (2026-05-12): 메뉴 재설계로 acquisitionCause==="burdened_gift" 폐지.
      // 레거시 데이터는 normalize에서 transferType="burdened_gift" + acquisitionCause="gift" 로 자동 이전.
      // 본 분기에 도달했다면 normalize 미실행 또는 직접 입력된 비정상 상태 — gift 분기로 fallback.
      if (!asset.fixedAcquisitionPrice || parseAmount(asset.fixedAcquisitionPrice) <= 0)
        return `${label}: 증여 신고가액을 입력하세요.`;
      if (!asset.donorAcquisitionDate)
        return `${label}: 증여자 취득일을 입력하세요.`;
    } else if (asset.acquisitionCause === "inheritance") {
      if (!asset.decedentAcquisitionDate)
        return `${label}: 피상속인 취득일을 입력하세요.`;
      if (
        asset.assetKind === "housing" &&
        asset.decedentSameHouseholdBeforeInheritance &&
        !asset.decedentCohabitationHoldingStartDate
      )
        return `${label}: 동일세대 상속이면 동일세대 거주·보유 개시일을 입력하세요. (§154⑧3호 통산)`;
      const hasAuto = asset.inheritanceValuationMode === "auto";
      const hasManual =
        asset.inheritanceValuationMode === "manual" &&
        asset.fixedAcquisitionPrice &&
        parseAmount(asset.fixedAcquisitionPrice) > 0;
      if (!hasAuto && !hasManual)
        return `${label}: 상속 취득가액(보충평가 또는 직접입력)을 입력하세요.`;
    }
  }

  // 6) 신축·증축 (매매 + housing/building 전용)
  if (asset.isSelfBuilt && asset.acquisitionCause === "purchase") {
    if (!asset.buildingType) return `${label}: 신축·증축 구분을 선택하세요.`;
    if (!asset.constructionDate) return `${label}: 신축·증축 완공일을 입력하세요.`;
    // 보유 중 공사 완료가 전제 — 양도일 이후 완공은 모순 (완공 당일 양도는 허용)
    if (formTransferDate && asset.constructionDate > formTransferDate)
      return `${label}: 신축·증축 완공일이 양도일(${formTransferDate}) 이후입니다. 날짜를 확인하세요.`;
    if (asset.buildingType === "extension" && (!asset.extensionFloorArea || parseFloat(asset.extensionFloorArea) <= 0))
      return `${label}: 증축 부분 바닥면적을 입력하세요.`;
    // §114조의2① Phase2: 증축부분 취득시 기준시가 필수 (환산 취득가 산출 기준)
    if (asset.buildingType === "extension" && (!asset.extensionStdPriceAtAcquisition || parseAmount(asset.extensionStdPriceAtAcquisition) <= 0))
      return `${label}: 증축부분 취득(완공)당시 기준시가 총액을 입력해 주세요.`;
  }

  // 토지/건물 분리 직접 입력(§166⑥) — 입력 합이 총액을 초과하면 잔액이 음수가 된다.
  // 판정식은 엔진 splitPair와 단일 소스(isSplitPairOverflow) — ⑧ 규칙(UI 통과 ↔ validate 차단 모순) 방지.
  const splitErr = validateSplitDirectInputs(asset, label);
  if (splitErr) return splitErr;

  return null;
}

/**
 * 날짜 순서 교차 검증 — 자산 카드 실시간 인라인 경고(UI)와
 * 단계 차단(validateAssetEntry)이 공유하는 단일 진실.
 * label 없는 순수 메시지 반환 — 차단 경로에서는 호출부가 `${label}: ` prefix를 붙인다.
 */
export function getAssetDateOrderError(
  a: AssetForm,
  transferDate: string | undefined,
): string | null {
  // 취득일-양도일 순서 (다필지 모드 외)
  if (!a.parcelMode && a.acquisitionDate && transferDate && a.acquisitionDate >= transferDate)
    return "취득일은 양도일보다 이전이어야 합니다.";
  // 상속·증여자 취득일 순서
  if (
    a.acquisitionCause === "inheritance" &&
    a.decedentAcquisitionDate &&
    a.acquisitionDate &&
    a.decedentAcquisitionDate >= a.acquisitionDate
  )
    return "피상속인 취득일은 상속개시일보다 이전이어야 합니다.";
  if (
    a.acquisitionCause === "gift" &&
    a.donorAcquisitionDate &&
    a.acquisitionDate &&
    a.donorAcquisitionDate >= a.acquisitionDate
  )
    return "증여자 취득일은 증여일보다 이전이어야 합니다.";
  return null;
}

/**
 * step 0 자산 1건 전체 검증 — assetKind → 지분율 → 일괄양도 양도가액 → 취득 정보
 * → 가업상속·장기임대 특례 → 날짜 순서. 첫 오류 메시지 반환 (자산 내부 1건).
 *
 * collectStepIssues(transfer-tax-validate.ts)가 자산별로 호출해 일괄 수집한다.
 */
export function validateAssetEntry(
  a: AssetForm,
  index: number,
  form: TransferFormData,
): string | null {
  const label = form.assets.length === 1 ? "자산" : `자산 ${index + 1}`;

  if (!a.assetKind) return `${label}: 자산 유형을 선택하세요.`;

  // ── 양도일·취득일 정합 검증 (모든 자산 공통, 분기 진입 전) ──
  // YYYY-MM-DD 사전식 비교 = 날짜 비교 동치. 빈 값이면 skip(존재성은 분기별 검증). strict > → 당일(==) 통과.
  const today = todayLocalISO();
  if (a.acquisitionDate && form.transferDate && a.acquisitionDate > form.transferDate) {
    return `${label}: 양도일(${form.transferDate})이 취득일(${a.acquisitionDate})보다 빠릅니다. 취득 후에만 양도할 수 있습니다.`;
  }
  if (
    a.hasSeperateLandAcquisitionDate && a.landAcquisitionDate && form.transferDate &&
    a.landAcquisitionDate > form.transferDate
  ) {
    return `${label}: 양도일(${form.transferDate})이 토지 취득일(${a.landAcquisitionDate})보다 빠릅니다.`;
  }
  // 취득일 미래 차단 (미래 취득은 입력 오류). 양도일<취득일 다음에 둠 — 둘 다 미래여도 모순이 먼저 잡히게.
  if (a.acquisitionDate && a.acquisitionDate > today) {
    return `${label}: 취득일(${a.acquisitionDate})이 오늘 이후입니다. 미래 날짜는 입력할 수 없습니다.`;
  }
  if (a.hasSeperateLandAcquisitionDate && a.landAcquisitionDate && a.landAcquisitionDate > today) {
    return `${label}: 토지 취득일(${a.landAcquisitionDate})이 오늘 이후입니다.`;
  }

  // ⑧ §164⑨ 1호 공익수용 환산 min[] 특례 — 보상 2필드 필수 (별도 모듈, 800줄 정책)
  const exprError = validateExprValuationAsset(a, label, form.transferDate);
  if (exprError) return exprError;

  // ⑧ §164⑨ 2호 공매·경락 특례 — 공매·경락가액 필수 + N3 배타 (P4)
  const auctionError = validateAuctionAsset(a, label, form.transferDate);
  if (auctionError) return auctionError;

  // ⑧ §164⑨ 1호 주택 총액 트랙 — 보상 총액 2필드 필수 (P5)
  const housingExprError = validateHousingExprAsset(a, label, form.transferDate);
  if (housingExprError) return housingExprError;

  // ⑧ §164⑨ 1호 건물 split 토지분 트랙 — 토지분 보상 2필드 필수 + 주택 regular split 차단 (P6/D6)
  const splitLandExprError = validateSplitLandExprAsset(a, label, form.transferDate);
  if (splitLandExprError) return splitLandExprError;

  // ⑧ landNature 필수 차단 — 토지 자산이 포함된 일괄양도 시 명시 선택 강제
  // 자동 안분 fallback 금지 원칙 준수 (부수토지/독립 나대지에 따라 세율 분기가 달라짐)
  if (a.assetKind === "land") {
    const hasHousingInBundle = form.assets.some(
      (other) =>
        other.assetId !== a.assetId &&
        (other.assetKind === "housing" ||
          other.assetKind === "right_to_move_in" ||
          other.assetKind === "presale_right"),
    );
    if (hasHousingInBundle && !a.landNature) {
      return `${label}: 토지 성격(부수토지 / 독립 나대지)을 선택하세요. 주택·입주권과 함께 일괄양도하는 토지는 성격에 따라 세율이 달라집니다.`;
    }
  }

  // 공유 지분율 검증 (분자 ≤ 분모, 분모 > 0)
  const ownN = parseFloat(a.ownershipNumerator || "100");
  const ownD = parseFloat(a.ownershipDenominator || "100");
  if (!isFinite(ownN) || !isFinite(ownD)) return `${label}: 지분율 분자/분모는 숫자여야 합니다.`;
  if (ownD <= 0) return `${label}: 지분율 분모는 0보다 커야 합니다.`;
  if (ownN <= 0) return `${label}: 지분율 분자는 0보다 커야 합니다.`;
  if (ownN > ownD) return `${label}: 지분율 분자는 분모를 초과할 수 없습니다.`;
  if (ownD > 1000) return `${label}: 지분율 분모는 1000 이하여야 합니다.`;

  // 단건 + 지분 모드 차단 — 합산 신고 없이 ratio < 1.0 자산을 단독 계산 시 잘못된 결과
  // (사례 27 같은 동일 물건 다회 분할 취득은 모든 지분을 별도 자산으로 추가해야 정확)
  if (form.assets.length === 1 && ownN < ownD) {
    return `${label}: 지분 모드 자산(${ownN}/${ownD})은 단독으로 계산할 수 없습니다. 같은 물건의 다른 지분도 별도 자산으로 추가하거나, 단독 소유라면 지분율을 100/100으로 입력하세요.`;
  }

  // 다자산 양도가액 — 지분 모드(ratio < 1.0) 자산은 양도가액이 총양도가 × ratio로
  // 자동 결정되므로 actualSalePrice·standardPriceAtTransfer 모두 검증 면제.
  // 동일 물건 지분 단계취득 케이스(사례 27)에서 안분 키 입력 강요 차단.
  const isFractionalAsset = ownN < ownD;
  // 증환지 증가분 존재 시 양도가액 구분 기재(actual) 불가 → 양도시 기준시가 안분 강제 (Step1 토글 숨김과 일치)
  const effBundledMode = form.assets.some((x) => x.isReplotIncrement) ? "apportioned" : form.bundledSaleMode;
  if (form.assets.length > 1 && !isFractionalAsset) {
    if (effBundledMode === "actual") {
      if (!a.actualSalePrice || parseAmount(a.actualSalePrice) <= 0)
        return `${label}: 계약서상 양도가액을 입력하세요.`;
    } else {
      // 증환지 증가분은 당초분(assets[0]) ㎡당 기준시가 × 증가분 면적으로 파생(live fallback) →
      // 자기 standardPriceAtTransfer 없어도 통과 (UI/API와 동일 fallback, 모순 차단).
      const replotIncDerivable =
        a.isReplotIncrement &&
        parseAmount(form.assets[0]?.standardPricePerSqmAtTransfer) > 0 &&
        parseFloat((a.transferArea || "").replace(/,/g, "")) > 0;
      if (!replotIncDerivable && (!a.standardPriceAtTransfer || parseAmount(a.standardPriceAtTransfer) <= 0))
        return `${label}: 양도시 기준시가를 입력하세요.`;
    }
  }

  // 자산별 취득 정보 검증 (취득일 + 취득가 + 환산 + 1990 + 신축)
  const acqError = validateAssetAcquisition(a, label, form.transferDate);
  if (acqError) return acqError;

  // ⑧ 가업상속공제 §97의2④ 의제 취득가액 — 토글 ON 시 4필드 전수 입력 강제
  // 자동 안분 fallback 금지 원칙 준수 (feedback_no_silent_apportion_fallback)
  if (a.familyBusinessInheritance) {
    const fb = a.familyBusinessInheritance;
    if (fb.decedentAcquisitionPrice == null || parseAmount(String(fb.decedentAcquisitionPrice)) < 0)
      return `${label}: 가업상속공제 — 피상속인 취득가액을 입력하세요.`;
    if (fb.inheritanceMarketValue == null || parseAmount(String(fb.inheritanceMarketValue)) <= 0)
      return `${label}: 가업상속공제 — 상속개시일 현재 자산가액을 입력하세요.`;
    if (fb.fbDeductionAppliedRate == null || fb.fbDeductionAppliedRate < 0 || fb.fbDeductionAppliedRate > 1)
      return `${label}: 가업상속공제 — 적용률은 0~1 범위여야 합니다.`;
    if (!fb.inheritanceDate)
      return `${label}: 가업상속공제 — 상속개시일을 입력하세요.`;
  }

  // ⑧ 장기임대주택 거주주택 비과세 특례 검증 (소령 §155⑳)
  const rhError = validateRentalHousingException(a.rentalHousingException, a, label, form.transferDate);
  if (rhError) return rhError;

  // 날짜 순서 (취득-양도·상속·증여) — 실시간 인라인 경고와 단일 진실 공유
  const dateOrderError = getAssetDateOrderError(a, form.transferDate);
  if (dateOrderError) return `${label}: ${dateOrderError}`;

  return null;
}
