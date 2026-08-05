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

import { effectiveCommercialLandPriceAtAcq } from "@/lib/calc/transfer-pre1990-commercial-bridge";
import { isCommercialPre1990Acquisition } from "@/lib/calc/transfer-pre1990-commercial-bridge";
import { isSec164_5ProvisoApplicable } from "@/lib/calc/commercial-164-6-proviso";
import { resolveCbEra } from "@/lib/calc/commercial-cb-era";
import { isSec164_8ProvisoApplicable } from "@/lib/calc/commercial-164-6-proviso";
import { isBeforeBuildingStdPriceNotice } from "@/lib/calc/commercial-164-6-proviso";
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { giftEstimatedModeError } from "./transfer-tax-validate-gift-163-9";
import { isPhdEligible } from "./phd-eligibility";
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
import { validateSplitDirectInputs } from "./transfer-tax-validate-split";
import { isSeparateAcquisition } from "./transfer-tax-split-acq-mode";
import { validateExprValuationAsset } from "./transfer-tax-validate-expropriation";
import { validateExprValuationParcel } from "./transfer-tax-validate-expropriation";
import { validateAuctionAsset } from "./transfer-tax-validate-expropriation";
import { validateHousingExprAsset } from "./transfer-tax-validate-expropriation";
import { validateSplitLandExprAsset } from "./transfer-tax-validate-expropriation";
import { validateRentalHousingException } from "./transfer-tax-validate-rental-exception";
import type { TransferFormData, AssetForm } from "@/lib/stores/calc-wizard-store";
import { validateGeneralBuildingAsset } from "./transfer-tax-validate-gb";
import { validateRedevelopmentAsset } from "./transfer-tax-validate-redev";
import { validateBurdenedGiftAsset } from "./transfer-tax-validate-bg";
import { validateNblDetailedJudgment } from "./transfer-tax-validate-nbl";
import { validateMixedUseAsset } from "./transfer-tax-validate-mixed-use-asset";
import { validateUsageConversion } from "./transfer-tax-validate-usage-conversion";

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
  // ── 비주택 → 주택 용도변경 (§95⑤·⑥ · 시행령 §154⑤ 단서) ──
  // ⚠️ **모든 조기 return보다 앞**이다 — 부담부증여(C-24)·겸용주택(C-14)·이월과세(C-21)는
  //    각자 전용 검증으로 빠져나가므로, 뒤에 두면 차단이 필요한 바로 그 조합에서 dead code가 된다.
  const conversionError = validateUsageConversion(asset, label, formTransferDate);
  if (conversionError) return conversionError;

  // ── 부담부증여 (소령 §159 + 증여세 통합 §53·§47②) — 별도 모듈로 분리 (800줄 정책, 2026-05-12) ──
  const bgError = validateBurdenedGiftAsset(asset, label);
  if (bgError) return bgError;

  // ── 상업용건물·오피스텔 + 상속 (소령 §163⑨) — 환산 검증 전 우선 인터셉트 ──
  // §163⑨: 상속 상가는 상속개시일 상증법 평가액을 취득당시 실지거래가액으로 의제(환산 아님).
  // 아래 환산 블록(useEstimatedAcquisition 게이트)·generic 취득 검증(if(!isEstimated))은 stale
  // useEstimatedAcquisition=true 시 상속을 못 잡으므로, 여기서 isEstimated 무관하게 먼저 처리한다.
  if (asset.assetKind === "commercial_building" && asset.acquisitionCause === "inheritance") {
    if (!asset.acquisitionDate) return `${label}: 취득일(상속개시일)을 입력하세요.`;
    if (!asset.decedentAcquisitionDate) return `${label}: 피상속인 취득일을 입력하세요.`;
    // 환산 제거 후 상속 상가의 유일 취득원 → 필수(generic housing/land의 line 530 "미필수(엔진 0)"와
    // 달리 대체 취득원 부재). API buildInheritedAcquisitionPayload(post-deemed)도 reportedRaw>0 요구 → 정합.
    if (!parseAmount(asset.publishedValueAtInheritance) || parseAmount(asset.publishedValueAtInheritance) <= 0)
      return `${label}: 상속개시일 평가액(상속세 신고가액)을 입력하세요.`;
    // §164⑥ 취득당시 기준시가 (2005.1.1 전 상속) — all-or-nothing opt-in (소령 §163⑨2호).
    // 8필드 중 일부만 입력 시 API가 payload를 침묵 드롭(§164⑥ 미적용) → 부분입력 차단.
    const inhDate164 = asset.inheritanceStartDate || asset.acquisitionDate || "";
    if (inhDate164 && inhDate164 < "2005-01-01") {
      const areas164 = [asset.cbExclusiveArea, asset.cbSharedArea, asset.cbLandArea];
      const amounts164 = [
        asset.cbUnitPriceAtFirstOrAcq,
        asset.cbLandPricePerSqmAtAcq,
        asset.cbLandPricePerSqmAtFirst,
        asset.cbBuildingStdPriceAtAcq,
        asset.cbBuildingStdPriceAtFirst,
      ];
      const filled =
        areas164.filter((f) => parseDecimal(f) > 0).length +
        amounts164.filter((f) => parseAmount(f) > 0).length;
      if (filled > 0 && filled < 8)
        return `${label}: §164⑥ 취득당시 기준시가는 8개 항목(면적 3·최초고시 호별고시가·취득시·최초고시 개별공시지가·건물기준시가)을 모두 입력하거나 모두 비워두세요.`;
      // §164⑥ 단서 — 상속개시 연도 ≤2000이면 나목(건물 기준시가) 가액이 없어 §164⑤ 준용이 필요하다.
      // 8필드를 채워 §164⑥을 적용하는 경우에만 요구한다(전부 비우면 상증법 평가액만 사용 → 무관).
      if (filled === 8 && isBeforeBuildingStdPriceNotice(inhDate164) && !asset.cbAcqBuildingStdBy164_5)
        return `${label}: 취득당시(상속개시일) 건물 기준시가는 §164⑥ 단서에 따라 §164⑤ 준용으로 산정해야 합니다. [건물 기준시가 계산]으로 산정한 뒤 확인란을 체크하세요.`;
    }
    return null;
  }

  // §163⑨ 상가 증여 추계모드 차단 — 아래 상가 환산 검증(:134~)보다 먼저(실거래가는 generic으로 fall-through).
  const cbGiftEstErr =
    asset.assetKind === "commercial_building" ? giftEstimatedModeError(asset, label) : null;
  if (cbGiftEstErr) return cbGiftEstErr;

  // ── 상업용건물·오피스텔 환산취득가 전용 검증 (⑧, 소령 §164⑥, §176조의2②2호) ──
  // ⑧ 동기화 원칙: API buildCommercialBuildingValuation 의 undefined 반환 조건과 동일하게 차단.
  if (asset.assetKind === "commercial_building" && asset.useEstimatedAcquisition) {
    // 적용 cbEra — 명시 선택 없으면 취득일에서 파생(API·UI와 **같은 함수**, 3중 패턴).
    // 취득일이 없으면 파생도 불가하므로 취득일 입력을 먼저 요구한다.
    const era = resolveCbEra(asset);
    if (!era) {
      return `${label}: 상업용건물·오피스텔 — 취득일을 입력하세요 (호별고시 취득 시점 구분의 기준일).`;
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
      return `${label}: ${era === "pre_disclosure" ? "최초고시(2005)" : "취득시"} ㎡당 호별고시가를 입력하세요.`;
    // 양도시 개별공시지가 공통 필수
    if (!parseAmount(asset.cbLandPricePerSqmAtTransfer))
      return `${label}: 양도시 개별공시지가(원/㎡)를 입력하세요.`;

    if (era === "pre_disclosure") {
      // 건물 기준시가 3시점 필수 (총액, 원 — 외부에서 ㎡당 단가 × 연면적 보정계수 반영)
      if (!parseAmount(asset.cbBuildingStdPriceAtAcq))
        return `${label}: 취득시 건물 기준시가(총액)를 입력하세요.`;
      if (!parseAmount(asset.cbBuildingStdPriceAtFirst))
        return `${label}: 최초고시시(2005) 건물 기준시가(총액)를 입력하세요.`;
      if (!parseAmount(asset.cbBuildingStdPriceAtTransfer))
        return `${label}: 양도시 건물 기준시가(총액)를 입력하세요.`;
      // 개별공시지가 3시점 필수.
      // ⑧ API 동일 fallback — 취득 1990-08-30 이전은 가목의 가액이 없어 §164④ 토지등급 환산값을 쓴다.
      // UI 통과 ↔ validate 차단 모순을 막기 위해 API와 **같은 함수**로 유효값을 판정한다.
      if (!effectiveCommercialLandPriceAtAcq(asset, formTransferDate ?? ""))
        return isCommercialPre1990Acquisition(asset)
          ? `${label}: 취득일이 개별공시지가 고시(1990.8.30.) 전입니다 — §164④ 토지등급 환산 입력(1990 공시지가·등급 3종)을 완성하거나 취득시 개별공시지가를 직접 입력하세요.`
          : `${label}: 취득시 개별공시지가(원/㎡)를 입력하세요.`;
      if (!parseAmount(asset.cbLandPricePerSqmAtFirst))
        return `${label}: 최초고시시(2005) 개별공시지가(원/㎡)를 입력하세요.`;
      // §164⑥ 단서 — 취득연도 ≤2000은 나목(건물 기준시가) 가액이 없어 §164⑤ 준용이 필요하다.
      // 준용 산정에는 신축연도·구조·용도가 필요해 엔진이 자동 산정할 수 없으므로(AssetForm 미보유)
      // 사용자의 명시적 확인을 요구한다. 확인 없이 임의 금액이 들어가면 P_A가 조용히 틀린다.
      if (
        isSec164_5ProvisoApplicable(era, asset.acquisitionDate) &&
        !asset.cbAcqBuildingStdBy164_5
      )
        return `${label}: 취득당시 건물 기준시가는 §164⑥ 단서에 따라 §164⑤ 준용으로 산정해야 합니다. [건물 기준시가 계산]으로 산정한 뒤 확인란을 체크하세요.`;
      // §164⑥ 산식 괄호 단서 — 두 시점 기준시가합이 같으면 §164⑧ 준용이 강제된다.
      // B(전기의 기준시가합)가 없으면 준용 산정이 불가하고, 그대로 두면 비율 1로 법령과 다른 값이 나온다.
      if (isSec164_8ProvisoApplicable(asset) && !parseAmount(asset.cbPrevStdPriceSum))
        return `${label}: 취득당시 기준시가합과 최초고시당시 기준시가합이 같습니다 — §164⑥ 산식 괄호 단서에 따라 §164⑧을 준용해야 합니다. 전기(취득 직전 고시분)의 토지·건물 기준시가 합계액을 입력하세요.`;
    }

    if (era === "post_disclosure") {
      // post_disclosure: 취득시 개별공시지가 필수 (API와 동일 유효값 판정)
      if (!effectiveCommercialLandPriceAtAcq(asset, formTransferDate ?? ""))
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
        // §164⑦ 게이트 — 이월과세는 증여자 취득가액 기준: 비교일 = 증여자 취득일
        if (!isPhdEligible(c.donorAcquisitionDate, asset.phdFirstDisclosureDate))
          return `${label}: 증여자 취득일(의제취득일 1985-01-01 반영)이 최초 고시일 이후입니다. 취득 당시 주택공시가격이 고시되어 있으므로 3-시점 환산(§164⑦) 대상이 아닙니다 — 일반 기준시가 환산을 선택하세요.`;
        if (parseAmount(asset.phdFirstDisclosureHousingPrice) <= 0)
          return `${label}: 최초 고시 개별주택가격을 입력하세요.`;
        const transferPrice =
          parseAmount(asset.phdTransferHousingPrice) || parseAmount(asset.standardPriceAtTransfer);
        if (transferPrice <= 0) return `${label}: 양도시 개별주택가격을 입력하세요.`;
      } else if (c.estimationMode === "apd") {
        // APD — PHD와 동일 경로(preHousingDisclosure)를 사용하므로 같은 필드 검증
        if (!asset.phdFirstDisclosureDate) return `${label}: 최초 고시일(공동주택 최초공시일)을 입력하세요.`;
        // §164⑦ 게이트 — 비교일 = 증여자 취득일 (phd 모드와 동일)
        if (!isPhdEligible(c.donorAcquisitionDate, asset.phdFirstDisclosureDate))
          return `${label}: 증여자 취득일(의제취득일 1985-01-01 반영)이 최초 고시일 이후입니다. 취득 당시 주택공시가격이 고시되어 있으므로 3-시점 환산(§164⑦) 대상이 아닙니다 — 일반 기준시가 환산을 선택하세요.`;
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

  // 겸용주택 분리계산은 calcMixedUseTransferTax 엔진이 별도 처리 — 전용 검증 후 return.
  // 본체는 transfer-tax-validate-mixed-use-asset.ts 로 분리 (800줄 정책).
  if (asset.isMixedUseHouse === true) {
    return validateMixedUseAsset(asset, label, formTransferDate);
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
  // hasPre1990: post-1985 증여는 §163⑨ 신고가액 확인 가능 → pre1990 토지등급 배제(api:86 동일 게이트·3중 패턴).
  const hasPre1990 =
    (asset.pre1990Enabled ?? false) &&
    asset.assetKind === "land" &&
    !(asset.acquisitionCause === "gift" && (asset.acquisitionDate ?? "") >= "1985-01-01");
  const isParcelMode = asset.parcelMode === true && asset.assetKind === "land";

  // §163⑨ 표준(generic) 증여 추계모드 차단 — salesCase(:아래)·isAppraisal generic보다 먼저 배치.
  const genericGiftEstErr = giftEstimatedModeError(asset, label);
  if (genericGiftEstErr) return genericGiftEstErr;

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

  // 2) 면적 시나리오
  // partial 불변식은 면적 섹션이 노출되는 전 자산유형 공통(land·housing) —
  //   AREA_SCENARIOS_BY_ASSET_KIND(AssetSectionBasic)와 대응. 환지는 토지 제도(소득령 §162의2)라 land 한정.
  // 미입력 자체는 요구하지 않는다 — 면적을 소비하지 않는 경로(실지거래가·NBL 미사용)에서
  //   필수화하면 과도 차단이 된다. 소비 경로별 요구는 아래 3)·4-2)·NBL·분리 검증이 담당.
  {
    const scenario = asset.areaScenario ?? "same";
    if (scenario === "partial") {
      const acq = parseFloat((asset.acquisitionArea || "").replace(/,/g, ""));
      const tr = parseFloat((asset.transferArea || "").replace(/,/g, ""));
      if (acq > 0 && tr > 0 && acq < tr)
        return `${label}: 취득 당시 면적은 양도 당시 면적 이상이어야 합니다. (① 기본정보)`;

      /**
       * B4-2b — 실거래가 모드에서 「양도분 취득가액이 구분되는가」 선택 강제.
       *
       * 실거래가 모드는 엔진이 취득가액을 안분하지 않으므로 사용자가 **양도분 대응**
       * 금액을 넣어야 정답이 된다. 전체 취득가액을 그대로 넣으면 양도차익이 과소
       * 계상되고(취득 300㎡·양도 100㎡에서 **2억 차이**), 시스템이 그것을 감지할 수 없다.
       *
       * 「자동 안분 fallback 금지 — 미입력은 검증 오류로 차단」 정책에 따라 차단한다.
       * 자동 안분을 하지 않는 이유: 계약서에 구분 기재돼 있으면 그 값이 우선하고
       * (조심 2018부0572 "불분명한 경우"), 무조건 안분은 그 우선순위를 뭉갠다.
       *
       * 게이트를 좁게 둔다:
       *   1. **일부양도가 확정된 상태**만 — 양쪽 면적이 입력되고 `acq > tr`일 때.
       *      한쪽만 입력된 중간 상태나 `acq === tr`(사실상 same)에서 요구하면 입력을 방해한다.
       *   2. **취득가액이 입력된 실거래가 경로**만 — 환산·감정·매매사례는 B4-1이 기준시가
       *      면적을 정정했고, 겸용·증축 일괄은 엔진이 §100② 비율로 안분한다.
       */
      const partialConfirmed = acq > 0 && tr > 0 && acq > tr;
      const isActualPriceMode =
        !asset.useEstimatedAcquisition &&
        !asset.isAppraisalAcquisition &&
        !asset.isSalesCaseAcquisition &&
        !asset.isMixedUseHouse;
      const hasAcqPrice = parseFloat((asset.fixedAcquisitionPrice || "").replace(/,/g, "")) > 0;
      if (partialConfirmed && isActualPriceMode && hasAcqPrice && !asset.partialAcqDistinct) {
        return `${label}: 일부 양도 — 「양도분 취득가액이 구분되는가」를 선택하세요. 전체 취득가액을 그대로 입력하면 양도차익이 과소 계상됩니다. (③ 취득정보)`;
      }
    }
  }

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
        return `${label}: 종전토지 면적(① 기본정보의 취득 당시 면적)을 입력하세요.`;
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
    // §164⑦ 적용가능 게이트 — 취득일(의제취득일 1985-01-01 반영) ≥ 최초고시일이면
    // 취득당시 고시분 존재 → 3-시점 환산 대상 아님 (isPhdEligible 단일 소스).
    // 이월과세(carryover_gift)는 위 전용 블록(:202~)에서 증여자 취득일 기준으로 별도 게이트.
    if (!isPhdEligible(asset.acquisitionDate, asset.phdFirstDisclosureDate)) {
      return `${label}: 취득일(의제취득일 1985-01-01 반영)이 최초 고시일 이후입니다. 취득 당시 주택공시가격이 고시되어 있으므로 3-시점 환산(§164⑦) 대상이 아닙니다 — 3-시점 환산을 끄고 취득시 기준시가를 직접 입력하세요.`;
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
      // ⚠️ **별개 취득(토지·건물 취득시점 상이)은 총액을 요구하지 않는다**.
      // UI가 자산 전체 취득가액 칸을 숨기고(`CompanionAcqPurchaseBlock` isSeparateAcq 게이트 —
      // "별개 취득이면 파트 블록이 대신한다") 파트별 칸으로 대체하므로, 총액을 여기서 요구하면
      // **입력할 칸이 화면에 없는데 그 칸을 채우라고 막는** 상태가 된다(⑧ 규칙 위반 — 계산 영구 차단).
      // 파트별 필수는 `validateSplitDirectInputs`(:524) → `validateSeparateAcqParts`(V1·V2)가
      // 담당하며, 그쪽이 "토지/건물 취득가액을 입력하세요"로 **채울 칸을 지목**한다.
      // 판정은 엔진·API·UI와 **같은 헬퍼**(isSeparateAcquisition) — 재구현하면 dual-truth가 된다.
      if (!isSeparateAcquisition(asset)) {
        if (!asset.fixedAcquisitionPrice || parseAmount(asset.fixedAcquisitionPrice) <= 0)
          return `${label}: ${isAppraisal ? "감정가액" : "취득가액"}을 입력하세요.`;
      }
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
      // P2c: 상속 취득가액은 신고가액(publishedValueAtInheritance) 단일 경로로 항상 전송 →
      // 별도 취득가액 필수 검증 불요(엔진이 미입력 시 0 처리, UI/API 통과 ↔ validate 차단 모순 방지).
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
