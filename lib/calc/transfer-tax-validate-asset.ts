/**
 * 양도소득세 자산-수준(AssetForm 1건) 유효성 검사
 *
 * transfer-tax-validate.ts에서 분리 (800줄 정책, 2026-06-12 — 오류 일괄 수집 도입).
 * - validateAssetAcquisition: 취득 정보 (취득가·환산·1990·신축·이월과세·겸용주택)
 * - validateAssetEntry: step 0 자산 1건 전체 검증 (assetKind → 지분율 → 취득 → 특례 → 날짜 순서)
 *
 * 모든 함수는 첫 오류 메시지(string) 또는 null 반환 — 자산 내부는 첫 오류 1건,
 * 자산 간 일괄 수집은 transfer-tax-validate.ts의 collectStepIssues가 담당.
 *
 * ## 위임 규약
 *
 * 자산종류·취득원인 전용 규칙은 별도 모듈이 맡고(`-commercial-asset`·`-gb`·`-redev`·`-bg`·
 * `-mixed-use-asset`·`-usage-conversion`·`-nbl`·`-expropriation` 등), 본 파일은 **공통 흐름과
 * 순서**를 갖는다. ⚠️ **진입 조건은 호출부에 남긴다** — 위임 모듈에 조건을 넣어 null을 반환하게
 * 하면 조기 return 순서가 보이지 않아 dead code가 생긴다(용도변경이 부담부증여보다 앞인 이유).
 *
 * 799 → 697줄 (2026-08-07, 상가 3블록 위임 — 트리거 800 직하라 여유분 확보).
 */

import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { replotIncrementStdPriceAtTransfer } from "./replot-increment-std-price";
import { giftEstimatedModeError } from "./transfer-tax-validate-gift-163-9";
import { sec164PartialInputError, sameAdjustmentPeriodError } from "./transfer-tax-validate-sec164";
import { clauseADeclarationError } from "./transfer-tax-validate-clause-a";
import { postDeemedClauseARequiredError } from "./transfer-tax-validate-clause-a";
import { validateCommercialInheritanceAsset } from "./transfer-tax-validate-commercial-asset";
import { validateCommercialAppurtenantLand } from "./transfer-tax-validate-commercial-asset";
import { validateCommercialEstimatedAsset } from "./transfer-tax-validate-commercial-asset";
import { isPhdEligible } from "./phd-eligibility";
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
import { validateSuccessorRightAsset } from "./transfer-tax-validate-successor-right";
import { isSuccessorRightTransfer } from "./transfer-successor-right";
import { validateBurdenedGiftAsset } from "./transfer-tax-validate-bg";
import { isFullFractionalBundle } from "./transfer-tax-api-helpers";
import { validateNblDetailedJudgment } from "./transfer-tax-validate-nbl";
import { validateMixedUseAsset } from "./transfer-tax-validate-mixed-use-asset";
import { validateUsageConversion } from "./transfer-tax-validate-usage-conversion";
import { hasPre1990LandEstimation } from "./transfer-pre1990-land-gate";
import { allowsFamilyBusinessInheritance } from "./transfer-fb-gate";
import { classifySameAdjustmentPeriod } from "@/lib/tax-engine/same-adjustment-period-std-price";

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

/** 다필지 자산 검증 — 다필지 모드일 때(A12: 컴패니언은 호출부에서 먼저 차단된다). */
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
export function validateAssetAcquisition(
  asset: AssetForm,
  label: string,
  formTransferDate?: string,
  /**
   * 첫 자산이 아닌 자산(함께양도 컴패니언·지분 2번째 이후) 여부.
   *
   * 🔴 **§164⑤ 3-시점 환산(PHD) 11필드 요구를 끄는 데만 쓴다.** ④가 PHD를 싣는 지점은
   *    `buildPreHousingDisclosurePayload(primary, …)` **한 곳뿐**이라 첫 자산이 아니면
   *    그 값이 엔진에 도달하지 않는다(⑫·⑭를 배관해도 `calcSplitGain`이
   *    `landAcquisitionDate` 부재로 `null` — 실측 응답 바이트 동일).
   *    종전에는 채우지 않으면 진행이 막히고 채우면 통째로 버려졌다.
   *    ⑤도 같은 축에서 토글을 숨긴다(`CompanionAcqPurchaseBlock.isNonPrimaryAsset`) —
   *    두 층이 **같은 사실**(첫 자산 여부)을 보게 해서 UI 통과↔validate 차단 모순을 막는다.
   */
  isNonPrimaryAsset = false,
  /** 컴패니언 함께 부담부증여 — 증여계약 전체 인수 채무 합계. 근거는 `validateBurdenedGiftAsset`. */
  contractAssumedDebtTotal?: number,
): string | null {
  // ── 비주택 → 주택 용도변경 (§95⑤·⑥ · 시행령 §154⑤ 단서) ──
  // ⚠️ **모든 조기 return보다 앞**이다 — 부담부증여(C-24)·겸용주택(C-14)·이월과세(C-21)는
  //    각자 전용 검증으로 빠져나가므로, 뒤에 두면 차단이 필요한 바로 그 조합에서 dead code가 된다.
  const conversionError = validateUsageConversion(asset, label, formTransferDate);
  if (conversionError) return conversionError;

  // ── 부담부증여 (소령 §159 + 증여세 통합 §53·§47②) — 별도 모듈로 분리 (800줄 정책, 2026-05-12) ──
  const bgError = validateBurdenedGiftAsset(asset, label, contractAssumedDebtTotal);
  if (bgError) return bgError;

  // ── §164④·⑥·⑤~⑦ 부분 입력 차단 (소령 §163⑨1호·2호) ──
  // ②는 all-or-nothing opt-in이라 일부만 입력하면 payload가 생성되지 않고 ① 단독으로 조용히
  // 계산된다. 자산종류·취득원인·기간 분기는 `sec164*Status`가 내부에서 처리하므로 여기서
  // 분기하지 않는다. **상속 상가 블록(:아래)보다 앞**이어야 증여 경로가 도달한다.
  const sec164Error = sec164PartialInputError(asset, label);
  if (sec164Error) return sec164Error;

  // ⑧ §164⑧ 동일조정기간 환산 — 토글 ON인데 상대 기준시가가 비면 침묵 no-op이 된다.
  const sapError = sameAdjustmentPeriodError(asset, label, formTransferDate);
  if (sapError) return sapError;

  // ── E-1: 「가목 확인 불가」 명시 선언 (법 §97①1호 단서 · U2-E) ──
  // pre-deemed에서 ①·② 모두 미충족이면 엔진이 **조용히** ③(나목)으로 간다. 법문상 나목은
  // 「가목을 확인할 수 없는 경우에 한정」이므로, 그 예외에 해당함을 선언하게 한다.
  // ⚠️ **§164 부분입력 차단 뒤**여야 한다 — 앞에 두면 「②를 절반 채운」 사용자가 선언 요구를
  //    먼저 받아 정작 채우다 만 칸을 못 찾는다. 술어는 ⑤ UI와 공유(`needsClauseADeclaration`).
  const clauseAError = clauseADeclarationError(asset, label);
  if (clauseAError) return clauseAError;

  // ── post-deemed 상속: ①(상증법 평가액) 또는 ②(§164⑤~⑦) 필수 (근거·예외는 함수 JSDoc) ──
  // ⚠️ E-1과 **같은 자리**여야 한다 — 위 조기 return(용도변경·부담부증여)보다 뒤면 dead code다.
  const postDeemedError = postDeemedClauseARequiredError(asset, label);
  if (postDeemedError) return postDeemedError;

  // ── 상업용건물·오피스텔 전용 검증 — transfer-tax-validate-commercial-asset.ts 위임 ──
  // ⚠️ **순서와 「종료 vs 계속」이 규칙의 일부다**(위임 모듈 헤더 참조):
  //   · 상속 인터셉트는 stale `useEstimatedAcquisition=true`에서도 상속을 잡아야 하므로
  //     환산 블록·generic 검증(`if(!isEstimated)`)보다 **먼저**·**isEstimated 무관**하게 둔다.
  //   · 상속·환산 두 블록은 진입하면 **항상 종료**한다(`return`). 조건을 함수 안으로 옮겨
  //     null을 반환하게 만들면 상속 상가가 generic 취득 검증으로 흘러가 다른 규칙을 탄다.
  if (asset.assetKind === "commercial_building" && asset.acquisitionCause === "inheritance") {
    return validateCommercialInheritanceAsset(asset, label);
  }

  // §163⑨ 상가 증여 추계모드 차단 — 상가 환산 검증보다 먼저(실거래가는 generic으로 fall-through).
  const cbGiftEstErr =
    asset.assetKind === "commercial_building" ? giftEstimatedModeError(asset, label) : null;
  if (cbGiftEstErr) return cbGiftEstErr;

  // 부수토지 초과분 판정 — 미해당이면 null로 **계속 진행**(취득 모드와 직교).
  const cbAppurtenantErr = validateCommercialAppurtenantLand(asset, label);
  if (cbAppurtenantErr) return cbAppurtenantErr;

  if (asset.assetKind === "commercial_building" && asset.useEstimatedAcquisition) {
    return validateCommercialEstimatedAsset(asset, label, formTransferDate);
  }

  // ── 일반건물(토지+건물 일괄) 전용 검증 — transfer-tax-validate-gb.ts 위임 ──
  if (asset.assetKind === "general_building") {
    return validateGeneralBuildingAsset(asset, label, formTransferDate);
  }

  /**
   * ── 승계조합원 입주권 (§97①1호 가목) — §166 검증 **이전**에 가른다 (2026-08-23) ──
   *
   * §166①은 「조합에 기존건물과 그 부수토지를 **제공하고 취득한**」 조합원으로 요건을 한정하므로
   * 승계자는 대상이 아니다. 그대로 `validateRedevelopmentAsset`을 태우면 권리가액·청산금 방향 등
   * **입력할 수 없는 값**을 요구하게 된다 — 실제로 종전에는 「승계조합원 모드를 ON 하세요」 안내가
   * 화면에 없는 토글(②-a, #1245에서 완공APT 전용으로 분리)을 가리켜 영구 차단이었다.
   * 술어는 `transfer-successor-right.ts` 단일 소스(UI·API·사이드바 공용).
   */
  if (isSuccessorRightTransfer(asset)) {
    const successorError = validateSuccessorRightAsset(asset, label);
    if (successorError) return successorError;
    return null;
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

  /**
   * ⑧ 비사업용 토지 정밀판정 토글 ON — 필수 입력 차단 (UI 통과↔판정 누락 침묵 모순 방지).
   *
   * 🔴 **취득원인 분기보다 앞이어야 한다** (A3-01·V9-a·V9-c, 2026-09-02 코드리뷰).
   *    종전에는 `:352`(일반 취득 검증 직전)에 있었는데, 그 위치는 `carryover_gift`(아래)와
   *    `newConstruction`(:317)의 `return null`보다 **뒤**라 두 취득원인에서는 통째로
   *    도달하지 않았다. 그러면 지목·용도지역 미입력이 조용히 통과하고, ④
   *    `buildNonBusinessLandRaw`가 raw를 버려 정밀판정이 사라진 채 사용자 플래그로
   *    §104①8호 +10%p만 붙는다(「조용한 모드 강등」 — 실측 과표 6.555억에서 +65,550,000원).
   *    NBL 판정은 취득원인·취득모드와 **직교**하므로 여기서 한 번만 검사한다.
   *    (본체는 800줄 정책으로 transfer-tax-validate-nbl.ts에 분리)
   */
  const nblErr = validateNblDetailedJudgment(asset, label, formTransferDate);
  if (nblErr) return nblErr;

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

    // (b-3a) §97조의2 ① 본문 — 대상은 **배우자·직계존비속뿐**이다.
    // 그 외 관계는 이월과세 자체가 성립하지 않으므로 취득원인을 바꿔야 한다.
    if (c.donorRelation === "other")
      return `${label}: 이월과세는 배우자 또는 직계존비속으로부터 증여받은 경우에만 적용됩니다 (「소득세법」 제97조의2 제1항). 취득 원인을 "증여"로 변경하세요.`;

    // (b-3) §97조의2 ① 관계요건 — 사망을 선언했으면 관계가 있어야 판정이 갈린다.
    //
    // ⚠️ 관계를 **단독으로 필수화하지 않는다**. 구형 sessionStorage에는 이 필드가 없어
    //    필수화하면 기존 이월과세 입력이 전부 차단된다
    //    (memory `feedback_blocking_validation_full_e2e_regression`).
    //    사망 미선언이면 관계는 판정에 영향이 없다(`isCarryoverRelationExcluded`).
    if (c.donorDeceased && !c.donorRelation)
      return `${label}: 증여자와의 관계를 선택하세요 (소득세법 §97조의2 ①).`;

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

  const isSalesCase = asset.isSalesCaseAcquisition === true;
  const isAppraisal = !isSalesCase && asset.isAppraisalAcquisition === true;
  const isEstimated = !isSalesCase && !isAppraisal && asset.useEstimatedAcquisition === true;
  // hasPre1990: ④ `transfer-tax-api.ts`와 **같은 술어**(3중 패턴) — `transfer-pre1990-land-gate.ts` 단일 소스.
  const hasPre1990 = hasPre1990LandEstimation(asset);
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
  if (isParcelMode) {
    /**
     * A12(2026-09-02): **컴패니언(함께양도 2번째 이후) 자산의 다필지는 미지원**이다.
     *
     * ⑤는 토글을 렌더하고 ⑧은 필지별 입력을 **필수로 요구**하는데, ④ `buildAssetPayload`는
     * `parcels`를 만들지 않고 ⑫ `companionAssetSchema`에도 그 키가 없어 **입력이 통째로
     * 사라진다**(실측 2,173,600 ~ 15,488,000원, 필지 간 취득시기 격차에 비례).
     *
     * 사용자 결정(2026-09-02)에 따라 **명시 차단**으로 확정한다. 정식 지원은 ⑫⑬⑭ 3계층
     * 신설이 필요한 신규 기능 규모이고, 채택 시 컴패니언에도 `firstParcelAcqDate` 규약(A15)을
     * 맞춰야 같은 입력이 primary/companion 위치에 따라 다른 세액을 내지 않는다.
     *
     * ⚠️ **⑤ 토글을 숨기는 것만으로는 부족하다** — 이미 `parcelMode: true`가 저장된 stale
     *    세션 폼은 토글이 사라진 채 `validateParcelMode`만 계속 돌아 「화면에 없는 칸을
     *    입력하라」가 된다(`feedback_new_asset_field_stale_sessionstorage_guard`).
     *    그래서 ⑤ 게이트와 ⑧ 차단을 **함께** 넣는다.
     */
    if (isNonPrimaryAsset)
      return `${label}: 함께양도 자산은 다필지(환지·합병) 입력을 지원하지 않습니다. 다필지 토지는 첫 번째 자산으로 옮기거나 「여러 필지를 각각 다른 시기에 취득」을 해제하세요.`;
    return validateParcelMode(asset, formTransferDate);
  }

  // 2) 면적 시나리오
  // partial 불변식은 면적 섹션이 노출되는 전 자산유형 공통(land·housing) —
  //   AREA_SCENARIOS_BY_ASSET_KIND(AssetSectionBasic)와 대응. 환지는 토지 제도(소득령 §162①9호 단서)라 land 한정.
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
       *      면적을 정정했고, 겸용 일괄은 엔진이 §100② 비율로 안분한다.
       *
       * ⚠️ **일반건물은 여기 오지 않는다** — `:165`가 `validateGeneralBuildingAsset`으로
       *    early return하기 때문이다. 그쪽은 축 A 2칸이 없어 `acq > tr`가 항상 false라
       *    같은 규칙을 여기에 써 봐야 dead code다. 대응 검증은 `transfer-tax-validate-gb.ts`
       *    (「일부 양도」 토글 ON 자체가 확정 상태)에 둔다 — O-4 · 2026-08-12.
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
  // 🔴 첫 자산이 아니면 PHD는 ④가 싣지 않아 엔진에 도달하지 않는다 ⇒ 11필드를 요구하지 않는다.
  //    (stale `usePreHousingDisclosure`가 남아 있어도 dead-end를 만들지 않는다.)
  const usesPhd = asset.usePreHousingDisclosure === true && !isNonPrimaryAsset;

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

    /**
     * A11(2026-09-02) — §164⑦ 산식 **괄호 단서**(§164⑧ 준용) 미구현 구간 차단.
     *
     * 조문(법제처 `lsInfoR.do` 산식 이미지 `<img alt="@@LATEX@@…">` 디코드 — **조문 본문
     * 텍스트에는 없다**): 「… / …최초로 공시한 주택가격공시당시의 …합계액**(취득당시의 가액과
     * 최초로 공시한 주택가격 공시당시의 가액이 동일한 경우에는 제8항의 규정을 준용한다)**」
     *
     * 두 합계가 같으면 비율이 1이 되어 `P_A_est = P_F`가 되고 환산이 무의미해진다
     * (실측 10,288,162원 과소). 트리거는 우연이 아니다 — §164③이 「새로운 기준시가가 고시되기
     * 전에 취득…하는 경우에는 **직전의 기준시가**에 의한다」이므로 취득일이 최초공시일 직전
     * 고시주기 안이면 두 시점이 같은 고시분으로 귀착해 **필연적으로 일치**한다.
     *
     * ⚠️ **「같으면 항상 틀린다」가 아니다.** 「소득세법 시행규칙」 §80①2호(취득연도의 다음 연도
     *    말일 **후**)면 대체분모 = 취득당시 가액이라 **비율 1이 곧 법령이 요구하는 값**이다.
     *    ⇒ **1호 구간에서만** 차단한다. 그 연도 축은 저장소에 이미 있는 도메인 무관 leaf를 쓴다.
     *
     * ⚠️ 인자 의미 주의(`feedback_shared_predicate_argument_parity`) — 그 leaf의 「양도」 자리에
     *    §164⑦ 준용에서는 **「최초공시」**가 들어간다. 축이 다르므로 이름이 아니라 의미로 맞춘다.
     *
     * ⚠️ 합계 산식은 **엔진과 floor 위치를 맞춘다** — `transfer-tax-pre-housing-disclosure.ts`는
     *    `landPricePerSqm * area`를 floor 없이 곱한 뒤 건물분을 더한다(§164⑥의 `INT()`와 다르다).
     *    어긋나면 ⑧이 보는 조건과 엔진 판정이 갈린다.
     *
     * 형제 §164⑥은 이 규칙을 이미 구현·차단했다(`commercial-164-6-proviso.ts` ·
     * `transfer-tax-validate-commercial-asset.ts:163-166`). §164⑦만 그 밖에 있었다 —
     * 저장소 전체에서 `164⑦` × `제8항` 교집합 grep 0건으로, 의도적 유보가 아니라 미인지다.
     *
     * 1차 조치는 **탐지 + 차단**이다(사용자 결정 2026-09-02). 산정하려면 B(전기 기준시가합)·
     * D(조정월수) 입력을 ①②③⑤⑧⑫에 신설해야 하고, 현재 폼에 그 칸이 없다
     * (실측 `calcSec164_8AdjustedDenominator(A, undefined, 24, 12) = null`).
     */
    const phdArea = parseFloat(asset.acquisitionArea) || 0;
    const phdSumAtAcq =
      parseAmount(asset.phdLandPricePerSqmAtAcq) * phdArea +
      parseAmount(asset.phdBuildingStdPriceAtAcq);
    const phdSumAtFirst =
      parseAmount(asset.phdLandPricePerSqmAtFirst) * phdArea +
      parseAmount(asset.phdBuildingStdPriceAtFirst);
    if (
      asset.acquisitionDate &&
      asset.phdFirstDisclosureDate &&
      classifySameAdjustmentPeriod({
        standardPriceAtAcquisition: phdSumAtAcq,
        // §164⑦ 준용에서 「양도」 자리 = 「최초공시」
        standardPriceAtTransfer: phdSumAtFirst,
        acquisitionDate: new Date(asset.acquisitionDate),
        transferDate: new Date(asset.phdFirstDisclosureDate),
      }) === "clause_1"
    ) {
      return `${label}: 취득당시 기준시가합과 최초공시당시 기준시가합이 같습니다 — §164⑦ 산식 괄호 단서에 따라 §164⑧을 준용해야 하는데, 준용 산정에 필요한 전기(취득 직전 고시분) 기준시가합 입력 칸이 아직 없습니다. 3-시점 환산(§164⑦)을 끄고 취득시 기준시가를 직접 입력하세요.`;
    }
  }

  // 5) 취득가액 — 실거래가·감정가액 모두 fixedAcquisitionPrice 입력 루틴.
  //    ※ 재개발/재건축(assetKind === "redevelopment_apt")은 위 §166 분기에서 이미 return 처리됨.
  //
  // 🔴 **부담부증여 제외** (2026-08-12 · O-2).
  //
  // 부담부증여는 취득가액을 「소득세법 시행령」 제159조 제1항 제1호가 **자동 산정**한다
  // (기준시가 모드 = 취득시 기준시가 × 채무비율 / 시가 모드 = K-4 실지·K-5 환산). 그래서 UI도
  // 자산 전체 취득가액 칸을 숨긴다(`CompanionAcqPurchaseBlock.tsx:366` 게이트).
  //
  // 그런데 이 검사에는 그 게이트가 없어, **입력할 칸이 화면에 없는데 그 칸을 채우라고 막는**
  // 상태였다 — 바로 아래 별개 취득 주석이 경고하는 그 함정에 부담부증여만 빠져 있었다.
  // 실측(2026-08-12): `housing`·`building`·`land`·`commercial_building` 4종 모두
  // 「자산: 취득가액을 입력하세요」로 **계산이 영구 차단**됐다(취득원인 무관).
  //
  // 시가 모드 K-4의 실지취득가액은 `bgActual*` 필드이고 `validateBurdenedGiftAsset`(4)가 따로
  // 검사한다 — 여기서 `fixedAcquisitionPrice`를 요구할 이유가 없다.
  //
  // 설계: docs/02-design/features/burdened-gift-acq-std-price-input-path.plan.md §9 O-2
  if (!isEstimated && !hasPre1990 && asset.transferType !== "burdened_gift") {
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
      // 증여자 취득일은 **필수가 아니다** — 단순 증여의 세율 보유기간은 「증여받은 날」부터이고
      // (§104② 본문 + 영 §162①5호), §104②2호는 「§97의2①에 해당하는 자산」 = 이월과세
      // (`carryover_gift`)에만 적용된다. 종전에는 「단기보유 통산」을 명목으로 필수였다.
      // 값이 입력되면 순서 검증(`donorAcquisitionDate < acquisitionDate`)은 그대로 걸린다.
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
      // ~~P2c: 별도 취득가액 필수 검증 불요(엔진이 미입력 시 0 처리)~~
      // 🔴 **2026-08-07 정정** — 「엔진이 0 처리」는 **3자 max 시절의 판단**이다. #1089가 가목
      //   우선으로 재편한 뒤로 ①·② 미입력은 **「가목 확인 불가」를 선언한 것과 같은 효과**를 내어
      //   법문상 나목이 금지된 구간에서 나목이 적용된다. ⇒ 진입부 **E-1**(`clauseADeclarationError`)이
      //   담당한다. 「UI/API 통과 ↔ validate 차단 모순」 우려는 E-1이 **선언 토글이라는 통과 경로를
      //   함께** 주므로 발생하지 않는다(dead-end 회피 — memory `feedback_ui_gate_removes_sole_input_path`).
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
  const splitLandExprError = validateSplitLandExprAsset(a, label, form.transferDate, index > 0);
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

  /**
   * 단건 + 지분 모드 — **선언이 없으면** 차단한다 (R4, 2026-09-03).
   *
   * 폼 데이터만으로는 두 사용자가 **구별되지 않는다**:
   *  - 축 A(공유 소유): 물건의 60%만 내 것 → 이 1건으로 계산하는 것이 **정확**
   *  - 축 B 오입력: 100% 내 것인데 60%+40% 2회 취득 → 나머지 40%가 **통째로 누락 = 세액 과소**
   *
   * 종전에는 둘 다 막았다. 그런데 ① 기본정보는 「공유 지분율」 칸과 「100% 기준으로 입력하세요」
   * 안내를 **단건에도 렌더**한다(`AssetSectionBasic.tsx` — `splitMode !== "fractional"`).
   * 값을 넣으면 통과 경로가 없어 **dead-end**였다(memory `feedback_ui_gate_removes_sole_input_path`).
   *
   * 우회로도 성립하지 않는다. 「100/100 + 지분분 금액」으로 넣으면 **물건 전체 기준 판정**이
   * 지분분으로 내려간다 — 12억 고가주택 문턱을 가로지르는 구간에서 **전액 비과세로 오판**한다
   * (route 실측: 24억 물건 40% 지분 1세대1주택 → 정답 9,900,000원 vs 우회로 0원).
   * 지분율을 넣으면 `totalPropertyTransferPrice`(`transfer-tax-api.ts`)·부담부증여
   * `wholePropertySupplementary`가 물건 전체를 분모로 유지한다.
   *
   * ⇒ 사용자가 **스스로 축 A임을 선언**하면 통과시킨다. **자동판정은 금지**다 —
   *   판별 불가한 것을 추정하면 조용히 틀린다. E-1(`clauseADeclarationError`)과 같은 형태다.
   *
   * ⚠️ 조건의 `form.assets.length === 1`은 **유지**한다. 다자산(축 B — 지분 분할 취득)은
   *    이 게이트의 대상이 아니고, 부담부증여 × 축 B는 `transfer-tax-validate.ts`의
   *    별개 게이트(Gate-B)가 계속 막는다. 두 게이트는 서로 간섭하지 않는다.
   */
  if (form.assets.length === 1 && ownN < ownD && a.ownershipRemainderThirdParty !== "yes") {
    return `${label}: 지분 모드 자산(${ownN}/${ownD})은 단독으로 계산할 수 없습니다. 나머지 지분도 내 것이면 그 지분을 별도 자산으로 추가하고, 나머지가 타인 소유이면 「나머지 지분은 타인 소유」를 선택하세요. 단독 소유라면 지분율을 100%로 입력하세요.`;
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
      // 자기 standardPriceAtTransfer 없어도 통과 (⑤·⑥·④와 **같은 leaf**, 모순 차단).
      const replotIncDerivable =
        replotIncrementStdPriceAtTransfer(a, form.assets[0]) !== undefined;
      if (!replotIncDerivable && (!a.standardPriceAtTransfer || parseAmount(a.standardPriceAtTransfer) <= 0))
        return `${label}: 양도시 기준시가를 입력하세요.`;
    }
  }

  // 자산별 취득 정보 검증 (취득일 + 취득가 + 환산 + 1990 + 신축)
  // `index > 0` = 첫 자산 아님 ⇒ §164⑤ PHD 요구 해제 (⑤ `isNonPrimaryAsset`와 같은 술어).
  /**
   * 컴패니언(다른 물건) 함께 부담부증여에서만 「채무 > 0」 판정을 **신고 단위**로 옮긴다.
   * 축 B(전 자산 지분 분할)는 물건이 하나이고 카드마다 물건 전체 채무를 입력하는 규약이라
   * 자산별 판정이 그대로 맞다 — `isFullFractionalBundle`이 두 축을 가른다.
   */
  const contractAssumedDebtTotal =
    form.assets.length > 1 &&
    !isFullFractionalBundle(form.assets) &&
    form.assets.some((x) => x.transferType === "burdened_gift")
      ? form.assets.reduce(
          (sum, x) =>
            sum +
            (parseAmount(x.bgLendingDepositTotal) || 0) +
            (parseAmount(x.bgMortgageDebtAmount) || 0),
          0,
        )
      : undefined;
  const acqError = validateAssetAcquisition(a, label, form.transferDate, index > 0, contractAssumedDebtTotal);
  if (acqError) return acqError;

  // ⑧ 가업상속공제 §97의2④ 의제 취득가액 — 토글 ON 시 4필드 전수 입력 강제
  // 자동 안분 fallback 금지 원칙 준수 (feedback_no_silent_apportion_fallback)
  if (a.familyBusinessInheritance && !allowsFamilyBusinessInheritance(a)) {
    // ④가 이미 payload에서 떼어내지만, stale 저장소에서 복원된 입력이 화면에 보이지 않는 채
    // 남아 있을 수 있다. 「침묵 오산보다 명시 차단」 규약(A04).
    return `${label}: 가업상속공제 §97의2④는 상속으로 취득한 자산에만 적용됩니다. 취득원인을 상속으로 되돌리거나 가업상속공제 입력을 해제하세요.`;
  }
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
