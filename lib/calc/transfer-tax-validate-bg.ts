/**
 * 부담부증여(burdened gift) 자산-수준 validation.
 *
 * transfer-tax-validate.ts 800줄 정책으로 분리 (2026-05-12 Phase 3 후속).
 *
 * 책임:
 *  (1) propertyType 지원 범위 (housing·land·building·general_building·commercial_building)
 *  (2) 평가 모드 선택 필수
 *  (3) 인수 채무 입력 필수 (보증금 + 차입금 ≥ 1)
 *  (4) 시가 모드 — 양도시·취득시 시가 평가액 필수, B/C > 1 차단 (소득세법 §88 1호 후단·소령 §159①)
 *  (5) Phase 3 — donorRelation 필수 (silent default 회피)
 *  (6) Phase 3 — 사전증여 행 부분 입력 차단 (silent drop 회피)
 *
 * 기준시가 모드 B/C > 1 검사는 엔진 `assertBurdenedGiftEligible()`에서 fail-fast.
 *
 * 호환성: 레거시 `acquisitionCause === "burdened_gift"`는 normalize에서 transferType로 이전.
 *
 * @returns 차단 메시지 (검증 실패 시) | null (통과)
 */

import { parseAmount } from "@/lib/calc/number-parse";
import { redevPreApprovalAcqMode } from "./redev-pre-approval-acq-mode";
import { getOwnershipRatio } from "./transfer-tax-api-helpers";
import { formatOwnershipPercent } from "./transfer-tax-api-helpers";
import { applyRatio } from "@/lib/tax-engine/tax-utils";
import { needsBgAcqStdPriceInput, resolveBgAcqStdPrice } from "./burdened-gift-acq-std-price";
import { bgCoDonorNeedsStdPrice } from "./burdened-gift-acq-std-price";
import { isBgPreDeemedAsset } from "./bg-pre-deemed";
import { gbBgThreeWayParts } from "./bg-pre-deemed-mode";
import { gbPartReportedField } from "./gb-pre-deemed";
import { bgPreDeemedError } from "./transfer-tax-validate-bg-pre-deemed";
import { effectiveGbLandPriceAtAcq } from "./transfer-pre1990-gb-bridge";
import { bgMixedUseBlock, isMixedBurdenedGift } from "./burdened-gift-mixed-use-scope";
import { isMixedBgDeemedPath } from "./burdened-gift-mixed-use-scope";
import { mixedBgCompanionBlockMessage } from "./burdened-gift-mixed-use-preview";
import {
  deriveMemberRightsValue,
  deriveRightValuationTotal,
} from "./burdened-gift-right-valuation";
import { ASSET_KIND_LABELS } from "@/components/calc/transfer/asset-labels";
import { isBgSuccessorRight } from "./transfer-successor-right";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import {
  BG_PRESUMED_LABEL,
  bgAppraisalExtensionPenaltyApplies,
  bgPresumedBlock,
  bgPresumedInputKind,
  firstEmptyBgPresumedField,
  hasBgPresumedAmount,
  isBgPostDeemedInheritance,
  isBgPresumedMethod,
} from "./burdened-gift-presumed-acquisition";
import { fieldError, type IssueField } from "./transfer-tax-validate-field";
import { validateDonorBuiltBg } from "./transfer-tax-validate-donor-built-bg";
import { bgCollateralForcesStdAcq, bgWholeGiftValuation } from "./burdened-gift-collateral-win";
import { bgFractionalCollateralWin } from "./burdened-gift-collateral-win";
import { bgSplitAxisCollateralWinUnsupported } from "./burdened-gift-collateral-win";
import { BG_RTMI_WINNER_CAUSE } from "./burdened-gift-collateral-win";
import { buildBurdenedGiftInfo } from "./transfer-tax-api-burdened-gift";
import { companionBurdenedGiftValuations } from "./transfer-tax-api-burdened-gift";
import { stdPriceAtTransferComesFromElsewhere } from "./burdened-gift-transfer-price-scope";
import { bgAnyCarryover, bgCarryoverForm, bgCarryoverParts } from "./bg-carryover-parts";
import { bgHouseSplitActive } from "./bg-house-split";
import { validateBgHouseSplit } from "./transfer-tax-validate-bg-house-split";

/**
 * 부담부증여 지원 자산 종류 — **⑧ validate 층 게이트**(3층 중 하나).
 *
 * 나머지 둘은 ⑤ `TransferModeBlock.tsx`의 `SUPPORTED_ASSET_KINDS`,
 * 엔진 `burdened-gift-eligibility.ts`의 `BURDENED_GIFT_SUPPORTED_PROPERTY_TYPES`다.
 * 세 배열의 내용 동일성은 `burdened-gift-gate-parity.anchor.test.ts`가 단언한다.
 *
 * · F-3 (2026-05-12): `commercial_building` 편입.
 * · 2026-09-08: `redevelopment_apt` 편입 (§166② 완공 신축주택 × §159).
 */
const SUPPORTED_KINDS: AssetForm["assetKind"][] = [
  "housing",
  "land",
  "building",
  "general_building",
  "commercial_building",
  "redevelopment_apt",
  "right_to_move_in",
];

/**
 * 조합원입주권 단건·묶음 자산의 비보충 승자(담보 §66 · 임대 §61⑤) 차단 — 시가·기준시가 모드 공통.
 * 기준시가 모드에서도 엔진이 담보·임대 승 입주권을 400으로 중단하므로(`burdened-gift-apportionment.ts` fail-fast) ⑧이 앞서 막는다(⑧ ⊇ ⑫).
 * 승자를 확정하지 못하는 자산(`wholeValuation` 없음 — 축 B 등)은 건너뛴다.
 */
function rtmiNonSupplementaryWinnerIssue(
  asset: AssetForm,
  label: string,
  wholeValuation: ReturnType<typeof bgWholeGiftValuation>,
): string | undefined {
  if (!wholeValuation || wholeValuation.selectedMode === "supplementary" || asset.assetKind !== "right_to_move_in") return undefined;
  const mortgage = wholeValuation.selectedMode === "mortgage";
  const decided = mortgage
    ? `담보평가액(${wholeValuation.value.toLocaleString()}원 — 「상속세 및 증여세법」 제66조)${asset.bgValuationMode === "sangjeungbeop_market" ? "이 시가보다 커서 증여가액이 담보평가액이 됩니다" : "으로 증여재산 평가가 결정됩니다"}`
    : `임대료 환산액(${wholeValuation.value.toLocaleString()}원 — 「상속세 및 증여세법」 제61조 제5항)으로 증여재산 평가가 결정됩니다`;
  return fieldError(mortgage ? "bgMortgageDebtAmount" : "bgLendingDepositTotal", `${label}: ${decided}. ${BG_RTMI_WINNER_CAUSE}`);
}

/** B/C > 1 차단 문구 — 시가 모드·기준시가 모드가 같은 사실을 말한다(엔진 `EXCESS_BURDENED_GIFT` 와 같은 조건). */
function debtExceedsGiftValueMessage(label: string, assumedDebt: number, giftValuation: number, scaleNote: string): string {
  return `${label}: 채무액(${assumedDebt.toLocaleString()}원)이 증여가액(${giftValuation.toLocaleString()}원)${scaleNote}을 초과합니다. 채무액÷증여가액이 1을 넘으면 증여가액을 초과하는 부분까지 양도로 보게 되어 계산할 수 없습니다(소득세법 §88 1호 후단, 소령 §159①). 양도 형태를 "일반 양도"로 변경하거나 평가액·채무액을 재확인하세요.`;
}

/**
 * 안내문의 자산 열거는 **위 배열에서 파생**한다 — 손으로 쓰지 않는다.
 *
 * 종전에는 「주택·토지·건물·일반건물·상업용건물·오피스텔」이 문자열에 박혀 있었다.
 * ⑤는 같은 드리프트(F-3 상업용건물 편입 시 문구만 남음)를 겪고 이미 파생으로 고쳤는데
 * 여기만 하드코딩이 남아, 다음 편입 때 조용히 낡을 자리였다.
 */
const SUPPORTED_LABELS = SUPPORTED_KINDS.map((k) => ASSET_KIND_LABELS[k]).join("·");

export function validateBurdenedGiftAsset(
  asset: AssetForm,
  label: string,
  /**
   * 컴패니언(다른 물건) 함께 부담부증여 — **증여계약 전체의 인수 채무 합계**.
   *
   * 🔑 이 축에서는 **채무가 0인 자산이 정상**이다. 근저당이 물건 하나에만 설정된 채로
   *    두 물건을 함께 부담부증여하면 다른 물건의 입력 채무는 0이지만, 소령 §159①의 B/C는
   *    **증여계약 단위**라 그 물건도 양도가액을 갖는다(④가 자산가액 비율로 재배분한다).
   *    자산별로 「채무 > 0」을 요구하면 그 조합이 통째로 막힌다.
   *
   * ⇒ 이 값이 주어지면 (3) 필수 검사를 **신고 단위 합계**로 판정한다. 단건·축 B에서는
   *   undefined이므로 종전 자산별 판정이 그대로다.
   */
  contractAssumedDebtTotal?: number,
  /**
   * 폼-전역 양도일(= 증여일, YYYY-MM-DD) — K-7(감정가액) × 신축·증축 5년 이내(§114조의2) 판정에 쓴다.
   * 없으면 그 판정을 건너뛴다(단위 테스트·옛 호출부 호환).
   */
  formTransferDate?: string,
  /**
   * 지분 분할 취득(축 B) 묶음 여부 — B/C>1 검사의 **스케일 규칙**을 가른다.
   * 축 A(공유 소유)는 공유자마다 별개 증여계약이라 채무를 해당 지분 인수분으로 입력하지만, 축 B는 한 사람의 **하나의 증여계약**이라
   * 채무·시가를 **물건 전체**로 입력하고 ④가 지분율로 안분한다(`debtScaleRatio`). 그래서 축 B에서는 시가를 줄이지 않고 비교한다.
   */
  isFractionalSplitAxis?: boolean,
  /** 축 B 둘째 이후 지분 카드인가 — 그 카드에는 ② 양도정보가 없어 물건 단위 칸은 첫 카드를 가리켜야 한다. */
  isNonPrimaryShare?: boolean,
): string | null {
  const isBurdenedGift =
    asset.transferType === "burdened_gift" ||
    asset.acquisitionCause === "burdened_gift";
  if (!isBurdenedGift) return null;
  /**
   * 축 B 둘째 이후 원조합원 입주권 지분 — 「종전 부동산 실지취득가액」은 첫 카드에서 받아 병합한다(`mergePrimaryBasic`).
   * 이 카드에는 칸이 없으므로 첫 카드 칸을 가리킨다(계획서 `bg-axis-b-right-share-inputs.plan.md` Q-2 a).
   */
  const rightShareAcqPointer =
    asset.assetKind === "right_to_move_in" && isFractionalSplitAxis === true && isNonPrimaryShare === true
      ? `${label}: 원조합원 지분의 종전 부동산 실지취득가액을 첫 번째 지분 카드 「② 양도정보」에 물건 전체 기준으로 입력하세요(첫 카드가 승계조합원이면 「원조합원 지분의 종전 부동산 실지취득가액」, 원조합원이면 「종전 부동산 실지취득가액」 칸). 지분율로 안분됩니다.`
      : undefined;

  // (1) F-3 (2026-05-12): commercial_building 확장
  if (!SUPPORTED_KINDS.includes(asset.assetKind)) {
    return `${label}: 부담부증여는 ${SUPPORTED_LABELS} 자산에서만 지원됩니다 (현재: ${ASSET_KIND_LABELS[asset.assetKind] ?? asset.assetKind}).`;
  }

  /**
   * (1-a) 겸용주택 × 부담부증여 — 2026-10-16 PR-1(엔진)·PR-3(화면)으로 **계산한다**. 종전 일괄 차단(「세액 0」 방지)을 대체한다.
   *
   * 여기서는 **BG 공통 검증보다 앞**에서 막아야 하는 것만 본다 — 그 뒤 검증은 이 조합에서 채울 수 없는 칸을 요구하기 때문이다:
   *  · 함께 양도·지분 분할 묶음(엔진 MB-6 — 문구는 엔진 leaf의 것)
   *  · UI P1 좁힘: 취득원인 이월과세·신축, 남아 있는 신축·증축 값(`bgMixedUseBlock`) — 상속·증여는 PR-7b-7a부터 연다
   * 엔진 차단(MB-1~18)·필수 입력·귀속(MB-13)·구분 감정평가(MB-17)·초과부담부는 `validateMixedUseBurdenedGift`(취득 검증의 겸용 분기)가
   * 엔진 leaf(`analyzeMixedBurdenedGift`)로 판정한다 — 규칙 복제 없음.
   */
  if (isMixedBurdenedGift(asset)) {
    if (contractAssumedDebtTotal !== undefined || isFractionalSplitAxis === true) {
      return fieldError("transferType", `${label}: ${mixedBgCompanionBlockMessage()}`);
    }
    const uiBlock = bgMixedUseBlock(asset);
    if (uiBlock) return fieldError(uiBlock.field, `${label}: ${uiBlock.long}`);
  }

  /**
   * (1-b) ✅ **이월과세(증여) 조합 지원 개시** (2026-08-10 D-7b) — 종전 차단을 **해제한다**.
   *
   * ## 근거 — 국세청 재산세과-1059(2009.12.18.)
   *
   * > 「거주자가 배우자로부터 부동산을 증여받은 후 (기간 내에) 다시 그 배우자에게 증여받은
   * >   부동산을 **부담부증여**하는 경우로서 「소득세법 시행령」 **제159조 제1호에 따른
   * >   취득가액 산정 시** 「소득세법」 제97조 제1항 제1호에 따른 가액에 배우자
   * >   **이월과세 규정이 적용되는 것임**」
   *
   * ⇒ §159①1호 **A의 기준 시점이 「양도인의 취득 당시」 → 「당초 증여자의 취득 당시」로 옮겨진다.**
   *
   * ## 종전에 왜 막았고, 무엇이 바뀌었나
   *
   * 종전에는 §159가 `burdenedGiftInfo`에서 취득가액을 따로 구해 **이월과세 입력이 계산에
   * 도달하지 않았다**(실측: 취득원인 4종 모두 71,260,000). D-7a가 세 축을 배선했다:
   *   · 취득가액(§97의2①1호) — `carryoverDonorBasis`를 §159에 주입
   *   · 증여세 상당액(①3호)  — 채무비율 안분 후 한도(시행령 §163의2②)로 필요경비 산입
   *   · 보유기간(§95④ 단서)  — 종전부터 반영
   *
   * ## 그래서 여기서 지키는 것은 「차단」이 아니라 **「두 벌 모두 입력」**이다
   *
   * §97의2②3호 비교는 **양도인 기준**(시나리오 B)과 **당초 증여자 기준**(시나리오 A)을
   * 동시에 요구한다. ❌ 미입력 시 양도인 값으로 fallback하면 시나리오 A = B가 되어
   * §97의2가 **조용히 무력화**된다(`feedback_no_silent_apportion_fallback`).
   *
   * 설계: `docs/02-design/features/burdened-gift-carryover-159-97-2.plan.md` §5.6·§8
   */
  // 일반건물은 토지·건물 중 한 파트라도 이월과세면 연다 — 증여받은 파트의 칸만 요구한다(`gb-bg-part-carryover-calc.plan.md` §4.5).
  if (bgAnyCarryover(asset)) {
    const missing = missingCoDonorBasisLabel(asset);
    if (missing) {
      return fieldError(missing.field, `${label}: 이월과세가 적용되므로 「당초 증여자」(= 양도인에게 이 자산을 증여한 사람)의 ${missing.label}을(를) 입력하세요. 소득세법 제97조의2 제1항 제1호가 취득가액을 당초 증여자의 취득 당시 금액으로 정하는데, 부담부증여의 취득가액은 같은 법 시행령 제159조 제1항 제1호가 양도인 기준으로 따로 산정하므로 두 값이 모두 필요합니다(같은 조 제2항 제3호의 세액 비교).`);
    }
    // 일반건물은 양도 당시 건물이 있다 — 당초 증여자 건물 기준시가 0을 거부한다(⑫ `GB_BG_BUILDING_STD_ZERO_MESSAGE`와 같은 조건 · `gb-bg-donor-building-acquisition-date.plan.md` Q-2 a). 토지 자산의 0은 그대로다.
    if (
      asset.assetKind === "general_building" && bgCarryoverParts(asset).building && bgCoDonorNeedsStdPrice(asset) &&
      (asset.bgCoDonorBuildingStdPriceAtAcq ?? "").trim() !== "" && parseAmount(asset.bgCoDonorBuildingStdPriceAtAcq) === 0
    )
      return fieldError("bgCoDonorBuildingStdPriceAtAcq", `${label}: 일반건물의 당초 증여자 취득 당시 건물 기준시가는 0일 수 없습니다 — 당초 증여자가 건물을 신축했으면 사용승인일 당시(「소득세법 시행령」 제162조 제1항 제4호) 건물 기준시가를 입력하세요.`);

    /**
     * ⚠️ 엔진 `assertCarryoverDonorBasis`의 throw는 **둘**이다. 위 「당초 증여자 필드 미입력」
     *    외에 `ct.useEstimatedAcquisition === true`도 fail-fast로 막는다
     *    (`transfer-tax-carryover-burdened-gift.ts:99~106`). ⑧이 그 한 쪽만 미러하고 있어,
     *    「환산취득가 사용」을 켠 사용자는 ⑧이 오히려 환산 모드 선택·취득시 기준시가 입력을 요구한
     *    끝에 통과하고(⑫ Zod도 통과 — 실측) 제출 시점에 **HTTP 500 배너**를 받았다.
     *    인라인 필드 오류로 앞당긴다.
     *
     * 🔴 **UI 토글을 숨기지 않는 이유**: 일반양도 상태에서 토글을 켠 뒤 양도 형태를 부담부증여로
     *    바꾸면 store에 `carryover.useEstimatedAcquisition = true`가 남는데, 그 상태에서 토글을
     *    숨기면 **플래그를 끌 유일한 입력 경로가 사라져** 500이 영구화된다
     *    (`feedback_ui_gate_removes_sole_input_path`). ⑧ 차단만 둔다.
     *
     * ⚠️ 검사 순서는 위 `missingCoDonorBasisLabel`보다 **뒤**여야 한다. 앞에 두면 지원되는
     *    조합(환산 OFF)에서 「당초 증여자 입력 요구」를 가로챈다
     *    (`transfer-tax-validate-gb-carryover.ts:60`에 같은 유형의 정정 이력이 남아 있다).
     */
    if (bgCarryoverForm(asset)?.useEstimatedAcquisition) {
      return `${label}: 부담부증여에서는 이월과세 취득가액을 환산으로 구할 수 없습니다. 취득가액은 소득세법 시행령 제159조 제1항 제1호가 정하므로, 「환산취득가 사용」을 끄고 당초 증여자의 취득 당시 값은 「이월과세 — 「당초 증여자」 취득 당시 값」에 입력하거나, 환산이 필요하면 부담부증여 평가 유형을 「시가」 + 취득가액 산정방식 「환산취득가액」으로 선택하세요.`;
    }
  }

  // (2) 평가 모드 선택 필수
  if (!asset.bgValuationMode) {
    return fieldError("bgValuationMode", `${label}: 부담부증여 평가 유형(상증법 기준시가·시가)을 선택하세요.`);
  }

  // (3) 인수 채무 입력 필수
  const lending = parseAmount(asset.bgLendingDepositTotal) || 0;
  const mortgage = parseAmount(asset.bgMortgageDebtAmount) || 0;
  const assumedDebt = lending + mortgage;
  if (contractAssumedDebtTotal !== undefined) {
    if (contractAssumedDebtTotal <= 0) {
      return fieldError("bgLendingDepositTotal", `${label}: 부담부증여 인수 채무액(임대보증금 + 담보차입금)을 입력하세요. 여러 물건을 함께 부담부증여하는 경우 채무가 설정된 물건에만 입력하면 됩니다.`);
    }
  } else if (assumedDebt <= 0) {
    return fieldError("bgLendingDepositTotal", `${label}: 부담부증여 인수 채무액(임대보증금 + 담보차입금)을 입력하세요.`);
  }

  // (4) 시가 모드 — 양도시 시가 + 취득가액 산정방식(K-4/K-5) + B/C>1 차단 (§100①·§159①1호 본문)
  if (asset.bgValuationMode === "sangjeungbeop_market") {
    if (!parseAmount(asset.bgMarketValueAtTransfer)) {
      return fieldError("bgMarketValueAtTransfer", `${label}: 부담부증여 시가 모드 — 양도시 시가 평가액을 입력하세요.`);
    }
  }
  // (4-0) 주택·건물 × 토지·건물 취득일 다름 — 파트 칸(설계서 `bg-house-building-split.design.md` Q-2 a · Q-3 a). 아래 총액 칸 요구보다 먼저다.
  const houseSplit = bgHouseSplitActive(asset);
  const houseSplitIssue = validateBgHouseSplit(asset, label);
  if (houseSplitIssue) return houseSplitIssue;
  if (asset.bgValuationMode === "sangjeungbeop_market") {
    /**
     * 취득가액 산정방식별 필수 입력 (H-5: bgMarketValueAtAcquisition 무조건 차단 제거)
     *
     * ⚠️ **조합원입주권은 K-4 고정**이라 ⑤가 산정방식 라디오를 렌더하지 않는다
     *    (④ API 변환도 `acquisitionMethod: "actual"`을 강제한다). 여기서 선택을 요구하면
     *    **화면에 없는 컨트롤을 요구**하게 되어 영구 차단이 된다 — ④와 같은 값으로 읽는다.
     *    실지취득가액 자체는 (5-d)가 요구한다.
     */
    const acqMethod =
      asset.assetKind === "right_to_move_in" ? "actual" : asset.bgAcquisitionMethod || "";
    /**
     * 담보 승(「상속세 및 증여세법」 제66조) — 단독 소유 단건만 엔진과 같은 증여가액 C로 판정한다(`bgWholeGiftValuation` 범위 주석).
     * 조합원입주권은 담보·임대 승이면 취득가액을 기준시가로 정해야 하는데 입주권 기준시가 입력 경로가 없어 막는다(`BG_RTMI_WINNER_CAUSE` — 겸용은 MB-7이 막는다).
     * 이월과세는 막지 않는다 — 두 시나리오 모두 취득시 기준시가 × 채무비율이고 당초 증여자 기준시가는 아래 `missingCoDonorBasisLabel`이 요구한다
     * (`bg-carryover-mkt-collateral-win.plan.md`). 계획서 `docs/00-pm/burdened-gift-residuals-o3-o5-o8.plan.md` O-5.
     */
    // 함께 부담부증여 묶음의 자산도 같다 — 균일 승자는 ⑧ 승자 게이트(`transfer-tax-validate.ts`)를 통과하고, 그 자산의 증여가액 C는 엔진이 쓰는 값(담보 승이면 담보평가액)이다.
    // 종전에는 묶음에서 이 판정을 건너뛰어 시가를 분모로 둬, 담보평가액 = 채무인 정당한 자산을 「채무액이 증여가액 초과」로 막았다.
    // 축 B(지분 분할 취득)는 채무·시가를 물건 전체로 입력하므로 비율 1로 물건 전체를 판정한다(`bgWholeGiftValuation` 주석). 종전에는 축 B를 건너뛰어
    // 증여가액 C가 시가로 남았고, 시가 모드 담보 승이면 «채무액이 증여가액 초과»라는 틀린 사유로 막았다(⑫는 200 — 계획서 `bg-axis-b-mkt-collateral-win.plan.md`).
    const splitAxis = isFractionalSplitAxis === true;
    const wholeValuation = bgWholeGiftValuation(asset, splitAxis);
    const rtmiIssue = rtmiNonSupplementaryWinnerIssue(asset, label, wholeValuation);
    if (rtmiIssue) return rtmiIssue;
    // 축 B 시가 모드 담보 승 — 취득가액 처리(취득시 기준시가 × 채무비율)를 확인한 범위는 주택뿐이다. 그 밖의 종류는 «채무액 초과»가 아니라 이 사유로 막는다.
    if (splitAxis && bgSplitAxisCollateralWinUnsupported(asset)) {
      return fieldError(
        "bgMortgageDebtAmount",
        `${label}: 지분 분할 취득(같은 물건)에서 담보평가액(「상속세 및 증여세법」 제66조)이 시가보다 커서 증여가액이 담보평가액이 됩니다. 이 경우의 취득가액(「소득세법 시행령」 제159조 제1항 제1호 괄호 — 취득시 기준시가 × 채무비율)은 주택(이월과세·의제취득일 전 상속·증여 제외)만 계산합니다. 시가·채무액·채권최고액을 재확인하거나 다른 평가 유형으로 입력하세요.`,
      );
    }
    // 담보 승이면 취득가액은 산정방식과 무관하게 취득시 기준시가 × 채무비율이다(엔진 `acqStdPriceForced`) — 방식별 금액 칸은 쓰이지 않아
    // 요구하지 않는다(⑤가 그 칸을 숨긴다). 산정방식 선택 자체는 ⑫가 요구하므로 아래 「미지정」 검사는 남긴다. 취득시 기준시가는 (5-c)가 요구한다.
    const collateralForced = bgCollateralForcesStdAcq(asset, splitAxis);
    // 일반건물 — 의제취득일 전 상속·증여 파트만 3자 max(Q-28 · PR-7b-6). 두 파트 다면 산정방식이 없고, 한 파트면 다른 파트의 금액만 요구한다.
    const gbParts = gbBgThreeWayParts(asset);
    if (isBgPreDeemedAsset(asset) || gbParts.all || isMixedBgDeemedPath(asset)) {
      // 의제취득일 전 상속·증여 토지·주택·상가·건물 — 산정방식 대신 엔진이 ①②③ 중 큰 금액(담보 승이면 의제취득일 기준시가)을 쓴다.
      //   ⑤가 라디오를 숨기고 ⑫도 요구하지 않는다. ①②③ 입력은 아래 `bgPreDeemedError`·E-1·PD-1이 본다(계획서 §18).
      // 겸용 상속·증여 취득 — 주택분·상가분 평가액이 취득가액이다(소령 §163⑨ · PR-7b-7a). 평가액은 겸용 검증(엔진 MB-11)이 요구한다.
    } else if (collateralForced) {
      // 재개발 완공 아파트 × 매매사례가액·감정가액 — 엔진이 담보 승 여부보다 먼저 막는다(`transfer-tax-burdened-gift-step.ts`).
      //   ⑤는 두 옵션을 비활성화하므로 자산 종류를 바꿔 값이 남은 경우다. 상속 사유는 담보 승에서 엔진이 방식을 읽지 않아 막지 않는다.
      const presumedBlock = isBgPresumedMethod(acqMethod) ? bgPresumedBlock(asset) : null;
      if (presumedBlock?.reason === "redevelopment") {
        return fieldError("bgAcquisitionMethod", `${label}: ${presumedBlock.long}`);
      }
      if (!acqMethod) {
        return fieldError("bgAcquisitionMethod", `${label}: 부담부증여 시가 모드 — 취득가액 산정방식(실지취득가액·매매사례가액·감정가액·환산취득가액)을 선택하세요 (소득세법 §100①). 담보평가액이 시가보다 커서 계산에는 취득시 기준시가가 쓰이지만, 산정방식 선택은 필요합니다.`);
      }
    } else if (acqMethod === "actual") {
      // K-4 실지취득가액 안분 — 자산별 실지취득가 필수 (자동 안분 fallback 금지)
      if (asset.assetKind === "general_building" && gbParts.any) {
        const field = gbParts.land ? "bgActualAcquisitionBuilding" : "bgActualAcquisitionLand";
        if (!parseAmount(asset[field])) {
          return fieldError(field, `${label}: 부담부증여 실지취득가액 — 의제취득일(1985.1.1.) 전 파트가 아닌 ${gbParts.land ? "건물" : "토지"}의 실지취득가액을 입력하세요 (§97①1호가목).`);
        }
      } else if (asset.assetKind === "general_building") {
        if (
          !parseAmount(asset.bgActualAcquisitionLand) &&
          !parseAmount(asset.bgActualAcquisitionBuilding)
        ) {
          return fieldError("bgActualAcquisitionLand", `${label}: 부담부증여 실지취득가액 안분 — 토지 또는 건물의 실지취득가액을 입력하세요 (§97①1호가목).`);
        }
      } else if (asset.assetKind === "land") {
        if (!parseAmount(asset.bgActualAcquisitionLand)) {
          return fieldError("bgActualAcquisitionLand", `${label}: 부담부증여 실지취득가액 안분 — 토지 실지취득가액을 입력하세요.`);
        }
      } else if (!houseSplit && !isBgSuccessorRight(asset) && !parseAmount(asset.bgActualAcquisitionTotal)) {
        // 승계 입주권은 승계 블록 2칸이 실지취득가액이다 — 승계 검증(`validateSuccessorRightAsset`)이 요구한다.
        return fieldError("bgActualAcquisitionTotal", rightShareAcqPointer ?? `${label}: 부담부증여 실지취득가액 안분 — 실지취득가액을 입력하세요.`);
      }
    } else if (isBgPresumedMethod(acqMethod)) {
      /**
       * K-6 매매사례가액(§176의2③1호) · K-7 감정가액(③2호) — 소득세법 §97①1호나목. 필요경비는 개산공제만이다.
       * 고를 수 없는 자산(상속)은 ⑤가 두 옵션을 비활성화하는 **같은 술어**로 막는다.
       */
      const methodLabel = BG_PRESUMED_LABEL[acqMethod];
      const block = bgPresumedBlock(asset);
      if (block) {
        return fieldError("bgAcquisitionMethod", `${label}: ${block.long}`);
      }
      if (asset.acquisitionCause === "carryover_gift") {
        /**
         * 이월과세 × K-6/K-7 — 방식은 **당초 증여자** 쪽이다(소법 §97의2①1호). 그 금액은 이월과세 박스의 당초 증여자 칸이고
         * (`missingCoDonorBasisLabel`이 이미 요구했다), 양도인 쪽(시나리오 B)은 증여받은 자산이라 소령 §163⑨가 증여일 상증법 평가액을
         * 실지거래가액으로 본다 — K-4 실지취득가액 칸이 그 값이다. 어느 쪽도 다른 쪽으로 대신하지 않는다.
         */
        if (asset.assetKind === "general_building") {
          if (!parseAmount(asset.bgActualAcquisitionLand) && !parseAmount(asset.bgActualAcquisitionBuilding)) {
            return fieldError("bgActualAcquisitionLand", `${label}: 이월과세 — 양도인(증여받은 사람)이 증여받은 때의 상증법 평가액(토지 또는 건물)을 입력하세요 (소령 §163⑨ · 시나리오 B).`);
          }
        } else if (asset.assetKind === "land") {
          if (!parseAmount(asset.bgActualAcquisitionLand)) {
            return fieldError("bgActualAcquisitionLand", `${label}: 이월과세 — 양도인(증여받은 사람)이 증여받은 때의 상증법 평가액(토지)을 입력하세요 (소령 §163⑨ · 시나리오 B).`);
          }
        } else if (!houseSplit && !parseAmount(asset.bgActualAcquisitionTotal)) {
          return fieldError("bgActualAcquisitionTotal", `${label}: 이월과세 — 양도인(증여받은 사람)이 증여받은 때의 상증법 평가액을 입력하세요 (소령 §163⑨ · 시나리오 B).`);
        }
        // 신축·증축 × 이월과세는 화면에서 도달하지 않는다 — 신축 입력은 매매 취득에서만 열린다(`selfBuiltActive`).
        //   API 직접 호출은 엔진 `assertCarryoverDonorBasis`가 막는다.
      } else if (asset.assetKind === "general_building" && gbParts.any) {
        const field = gbParts.land ? "bgPresumedAcquisitionBuilding" : "bgPresumedAcquisitionLand";
        if (!parseAmount(asset[field])) {
          return fieldError(field, `${label}: 부담부증여 ${methodLabel} — 의제취득일(1985.1.1.) 전 파트가 아닌 ${gbParts.land ? "건물" : "토지"}의 취득 당시 ${methodLabel}을 입력하세요 (소득세법 시행령 §176의2③${acqMethod === "appraisal" ? "2" : "1"}호).`);
        }
      } else if (!hasBgPresumedAmount(asset)) {
        const kind = bgPresumedInputKind(asset);
        const target = kind === "split" ? "토지 또는 건물의 " : kind === "land" ? "토지 " : "";
        return fieldError(
          firstEmptyBgPresumedField(asset),
          `${label}: 부담부증여 ${methodLabel} — ${target}취득 당시 ${methodLabel}을 입력하세요 (소득세법 시행령 §176의2③${acqMethod === "appraisal" ? "2" : "1"}호).`,
        );
      }
      // 증축 5년 이내 × 감정가액 — §114조의2 가산세 base는 「증축한 부분에 한정한 감정가액」이다. 엔진이 같은 조합(`calculateBuildingPenalty`)에서
      //   그 값을 요구하므로(`transfer-tax-burdened-gift-step.ts`) 같은 술어로 여기서 먼저 알린다. 신축은 건물 전체 감정가액 안분값이 base라 칸이 없다.
      if (acqMethod === "appraisal" && bgAppraisalExtensionPenaltyApplies(asset, formTransferDate)) {
        // 지분 분할 취득(축 B) — 증축 입력은 주 자산에만 있어 지분마다 다른 증축 감정가액을 받을 경로가 없다. 계속 막는다.
        if (isFractionalSplitAxis) {
          return fieldError(
            "bgAcquisitionMethod",
            `${label}: 지분 분할 취득(같은 물건을 서로 다른 날 나눠 취득)에서 증축 건물을 5년 이내 양도하면서 취득가액을 감정가액으로 산정하면 「소득세법」 제114조의2에 따라 증축한 부분의 감정가액에 5% 가산세가 붙는데, 지분마다 증축한 부분의 감정가액을 받는 칸이 없어 계산할 수 없습니다. 취득가액 산정방식을 「실지취득가액 안분」으로 선택하세요.`,
          );
        }
        const extensionAppraisal = parseAmount(asset.bgPresumedExtensionAppraisal);
        if (!extensionAppraisal) {
          return fieldError(
            "bgPresumedExtensionAppraisal",
            `${label}: 건물을 증축하고 증축일부터 5년 이내에 양도하면서 취득가액을 감정가액으로 산정하면 「소득세법」 제114조의2에 따라 증축한 부분의 감정가액에 5% 가산세가 붙습니다 — 증축한 부분의 감정가액을 입력하세요(건물 전체로 대신할 수 없습니다).`,
          );
        }
        // 부분이 전체를 넘을 수 없다 — 엔진과 같은 상한(분리 입력이면 건물, 총액 입력이면 총액).
        const kind = bgPresumedInputKind(asset);
        const cap = kind === "split" ? parseAmount(asset.bgPresumedAcquisitionBuilding) : parseAmount(asset.bgPresumedAcquisitionTotal);
        if (cap > 0 && extensionAppraisal > cap) {
          return fieldError(
            "bgPresumedExtensionAppraisal",
            `${label}: 증축한 부분의 감정가액이 ${kind === "split" ? "건물 감정가액" : "감정가액 총액"}(${cap.toLocaleString()}원)보다 클 수 없습니다.`,
          );
        }
      }
    } else if (acqMethod === "converted") {
      // 상속받은 자산(상속개시일 1985.1.1. 이후) — 영 §163⑨ 평가액이 가목이라 환산 불가(E-1 한계 G6 ·
      //   ⑤ 라디오와 같은 술어 · 증여세 부담부증여 경로와 같은 결론).
      if (isBgPostDeemedInheritance(asset)) {
        return fieldError("bgAcquisitionMethod", `${label}: 상속받은 자산은 상속개시일 현재 「상속세 및 증여세법」 평가액이 취득 당시 실지거래가액입니다(소득세법 시행령 §163⑨) — 환산취득가액을 쓸 수 없습니다(소득세법 §97①1호 단서). 「실지취득가액 안분」에 상속개시일 평가액(상속세 신고·결정가액)을 입력하세요.`);
      }
      // K-5 환산취득가액 — 취득·양도시 기준시가 필수. general_building은 (5-b)에서 별도 검사.
      //   칸은 「② 양도정보」에 있다(B2 — 종전에는 시가 모드가 두 칸을 숨겨 채울 곳이 없었다).
      //   재개발 완공 아파트는 취득시 기준시가(일반 환산 분자)를 쓰지 않는다 — 종전 부동산 취득가액을 §166③으로 환산하고
      //   그 분자·분모는 재개발 블록 ⑤가 받는다(`redevPreApprovalAcqMode` · `needsBgAcqStdPriceInput`과 같은 예외).
      const redevSec166 = asset.assetKind === "redevelopment_apt" && redevPreApprovalAcqMode(asset) === "estimated";
      // 겸용주택은 양도시·취득시 기준시가를 4부분 겸용 패널이 받는다 — 총액 칸이 화면에 없다(요구하면 막다른 길). 엔진 MB-11이 4부분을 요구한다.
      if (asset.assetKind !== "general_building" && asset.assetKind !== "land" && !isMixedBurdenedGift(asset)) {
        if (
          !parseAmount(asset.standardPriceAtTransfer) ||
          (!redevSec166 && !parseAmount(asset.standardPriceAtAcq))
        ) {
          return fieldError(
            !parseAmount(asset.standardPriceAtTransfer) ? "standardPriceAtTransfer" : "standardPriceAtAcq",
            `${label}: 부담부증여 환산취득가액 — 「② 양도정보」의 양도시·취득시 기준시가를 입력하세요 (소령 §176의2②2호).`,
          );
        }
      }
      /**
       * 토지 — 양도시 기준시가가 환산 **분모**다. 비면 엔진이 토지 취득가액을 0으로 낸다
       * (`burdened-gift-apportionment.ts` K-5 `landStdPriceAtTransfer === 0 ? 0`) — 막히지 않는 오답이었다
       * (2026-09-30 막다른 오류 작업 중 별건). ④와 같은 해석: 총액이 없으면 ㎡당 공시지가 × 양도면적
       * (`transfer-tax-api-burdened-gift.ts` 토지 분기). 취득시 기준시가는 아래 (5-c)가 같은 방식으로 요구한다.
       */
      if (asset.assetKind === "land") {
        const perSqm = parseAmount(asset.standardPricePerSqmAtTransfer);
        const area = parseFloat((asset.transferArea || "").replace(/,/g, "")) || 0;
        if (!parseAmount(asset.standardPriceAtTransfer) && !(perSqm > 0 && area > 0)) {
          return fieldError("standardPriceAtTransfer", `${label}: 부담부증여 환산취득가액 — 양도시 기준시가(또는 양도 당시 ㎡당 공시지가 + 면적)를 입력하세요. 환산취득가액의 분모이므로 비우면 취득가액이 0으로 계산됩니다 (소득세법 시행령 제176조의2 제2항 제2호).`);
        }
      }
    } else {
      // 미지정: 취득가액 산정방식 선택 강제 (시가 모드 입력 미완성 — collectStepIssues 단계 차단)
      return fieldError("bgAcquisitionMethod", `${label}: 부담부증여 시가 모드 — 취득가액 산정방식(실지취득가액·매매사례가액·감정가액·환산취득가액)을 선택하세요 (소득세법 §100①).`);
    }
    // 의제취득일 전 파트의 ① 상증법 평가액 — 필수(상속 Q-29 · 증여 Q-14·G-5). ②는 취득시 기준시가 칸이라 늘 있고, 선언으로 ③만 쓰는 길은 두지 않는다.
    // ⑫는 `reported: 0`을 「① 없음」으로 받는다(PR-7b-6a 계약 R-0·R-2) — 화면만 선언 토글이 없어 요구하는 의도된 비대칭이다(계획서 bg-gb-residuals.plan.md §2.2).
    for (const part of ["land", "building"] as const) {
      const field = gbPartReportedField(asset, part);
      if (gbParts[part] && !parseAmount(asset[field])) {
        const what = field === "publishedValueAtInheritance" || field === "gbBuildingInheritedValue" ? "상속개시일 평가액(상속세 신고·결정가액)" : "증여일 평가액(증여세 신고·결정가액)";
        return fieldError(
          field,
          `${label}: 의제취득일(1985.1.1.) 전에 ${field === "publishedValueAtInheritance" || field === "gbBuildingInheritedValue" ? "상속" : "증여"}받은 ${part === "land" ? "토지" : "건물"}의 취득가액은 ① ${what}·② 의제취득일 기준시가·③ 환산취득가액 중 큰 금액에 채무비율을 곱합니다 — ①을 입력하세요 (소득세법 시행령 §159①1호·§163⑨·§176조의2④).`,
        );
      }
    }
    // B/C > 1 차단 — C는 증여가액이다.
    //
    // 단독 소유 단건은 엔진과 같은 C(시가와 담보평가 중 큰 금액 — 「상속세 및 증여세법」 제66조)로 비교한다. 종전에는 시가만 분모로 둬
    // 담보평가액 = 인수 채무(채무비율 1)인 정당한 경우까지 막았다(O-5). 담보평가액이 채무보다 작으면(채권최고액 < 채무) 여전히 막힌다.
    //
    // ⚠️ 지분 모드(종전 처리 유지): 엔진이 §159의 C를 **지분분**으로 축소하므로(`scaleBurdenedGiftInfo`)
    //    여기서도 같은 스케일로 비교해야 한다. 물건 전체 시가로 비교하면 UI는 통과하는데
    //    엔진이 EXCESS_BURDENED_GIFT로 죽는 "UI 통과 ↔ 엔진 차단" 모순이 된다.
    //    채무는 사용자가 **해당 지분 인수분**을 입력하므로 스케일하지 않는다.
    const ratio = getOwnershipRatio(asset);
    const marketWhole = parseAmount(asset.bgMarketValueAtTransfer) || 0;
    // 축 B는 채무·시가 모두 물건 전체 입력이므로 줄이지 않는다(축 A만 시가를 지분분으로 줄여 지분 인수분 채무와 비교).
    const giftValuationMarket = ratio < 1 && !isFractionalSplitAxis ? applyRatio(marketWhole, ratio) : marketWhole;
    const giftValuation = wholeValuation?.value ?? giftValuationMarket;
    // 지분 자산(축 A)의 담보 승 — 채무 합계가 시가 해당분보다 커서 아래 「초과」 검사에 걸리지만 그 사유가 아니라 이 범위 밖이라 막는 것이다(`bgFractionalCollateralWin`).
    if (!isFractionalSplitAxis && bgFractionalCollateralWin(asset)) {
      return `${label}: 지분 ${formatOwnershipPercent(asset.ownershipNumerator, asset.ownershipDenominator)}를 가진 자산에서 담보평가액(「상속세 및 증여세법」 제66조)이 시가 해당분보다 커서 증여가액이 담보평가액이 됩니다. 이 경우의 취득가액(「소득세법 시행령」 제159조 제1항 제1호 괄호 — 취득시 기준시가 × 채무비율)을 지분 자산에는 확인하지 못해 계산하지 않습니다. 단독 소유라면 지분율을 100%로 입력하고, 시가·채무액·채권최고액을 재확인하세요.`;
    }
    if (giftValuation > 0 && assumedDebt > giftValuation) {
      const scaleNote =
        ratio < 1 && !isFractionalSplitAxis
          ? ` (지분 ${formatOwnershipPercent(asset.ownershipNumerator, asset.ownershipDenominator)} 해당분 — 물건 전체 ${marketWhole.toLocaleString()}원)`
          : wholeValuation?.selectedMode === "mortgage"
            ? ` (시가 ${marketWhole.toLocaleString()}원보다 큰 담보평가액 — 「상속세 및 증여세법」 제66조: 임대보증금 + 채권최고액과 담보채무 중 적은 금액)`
            : "";
      return debtExceedsGiftValueMessage(label, assumedDebt, giftValuation, scaleNote);
    }
  }
  // 기준시가 모드 — 증여가액 C = Max(보충적·담보·임대)를 엔진과 같은 경로(`companionBurdenedGiftValuations` — 지분 축소 → Max)로 구해 같은 B/C > 1 검사를 한다.
  // 엔진은 자산마다 자기 채무와 자기 증여가액을 비교하므로(묶음의 주 자산·컴패니언 모두 실측) 자산별 검사가 같은 기준이다. 종전에는 이 검사가 없어 ⑧ 통과 뒤 엔진이 500 으로 죽었다.
  // 축 B(지분 분할 취득)는 채무·평가 모두 물건 전체 입력이라 지분을 줄이지 않는다(시가 모드와 같다).
  if (asset.bgValuationMode !== "sangjeungbeop_market") {
    const stdRatio = isFractionalSplitAxis === true ? 1 : getOwnershipRatio(asset);
    const stdValuation = companionBurdenedGiftValuations([buildBurdenedGiftInfo(asset)], [stdRatio])[0];
    if (stdValuation && stdValuation.value > 0 && assumedDebt > stdValuation.value) {
      return debtExceedsGiftValueMessage(label, assumedDebt, stdValuation.value, "");
    }
  }

  // (5) Phase 3 — donorRelation 필수
  if (!asset.bgDonorRelation) {
    return fieldError("bgDonorRelation", `${label}: 부담부증여 — 증여자-수증자 관계를 선택하세요 (상증법 §53 증여재산공제 산정).`);
  }

  // (5-b) 일반건물(general_building) 부담부증여 — §159①1호 환산용 취득시 기준시가 필수
  // §159①1호 단서(양도가액을 §99 기준시가로 산정 시 취득가액도 기준시가)에 따라
  // 사용자가 실거래가를 입력했더라도 취득시 기준시가가 산식 입력으로 필요.
  if (asset.assetKind === "general_building") {
    // 1990.8.30. 전 상속·증여 토지는 등급 환산값(④·⑤ display fallback과 같은 leaf · PR-7b-2 G-3)
    if (!effectiveGbLandPriceAtAcq(asset, formTransferDate ?? "")) {
      return fieldError("gbAcqLandPricePerSqm", `${label}: 부담부증여 — 취득시 토지 ㎡당 공시지가를 입력하세요 (소령 §159①1호 환산).`);
    }
    if (!parseAmount(asset.gbAcqBuildingValue)) {
      return fieldError("gbAcqBuildingValue", `${label}: 부담부증여 — 취득시 건물 기준시가를 입력하세요 (소령 §159①1호 환산).`);
    }
  }

  /**
   * (5-c⁰) 기준시가 모드 — **양도시 기준시가 필수** (계획서 `bg-std-mode-transfer-std-required.plan.md` §3.1).
   *
   * 증여가액 C와 양도가액이 이 값으로 정해진다(소득세법 시행령 제159조 제1항 제2호). 비우면 엔진이 담보평가액을 C로 고르고
   * 양도가액을 0으로 계산해, 취득가액만 남은 양도차손 → 세액 0이 됐다(1985 이후 매매·증여·재개발·축 B 공통 실측).
   * 판정 값은 ④가 엔진에 싣는 leaf 그대로다 — 토지는 「양도시 기준시가 ‖ ㎡당 공시지가 × 면적」(3중 패턴).
   * 일반건물·겸용·조합원입주권은 공용 칸이 없어 각자 칸 규칙이 막는다(`stdPriceAtTransferComesFromElsewhere`).
   */
  if (asset.bgValuationMode === "sangjeungbeop_standard" && !stdPriceAtTransferComesFromElsewhere(asset)) {
    const info = buildBurdenedGiftInfo(asset);
    if (info.landStdPriceAtTransfer + info.buildingStdPriceAtTransfer <= 0) {
      const what = asset.assetKind === "land" ? "양도시 기준시가(또는 양도 당시 ㎡당 공시지가 + 면적)를" : "「② 양도정보」의 양도시 기준시가를";
      return fieldError("standardPriceAtTransfer", `${label}: 부담부증여 기준시가 평가 — ${what} 입력하세요. 증여가액과 양도가액이 이 값으로 정해지므로 비우면 계산할 수 없습니다 (소득세법 시행령 제159조 제1항 제2호).`);
    }
  }

  /**
   * (5-c) 기준시가 모드 — **취득시 기준시가 필수** (2026-08-12 신설 · O-1).
   *
   * §159①1호 A괄호의 취득가액은 「취득시 기준시가 × 채무비율」이다. 이 값이 0이면 취득가액도
   * 0이 되어 양도차익이 통째로 부풀지만(실측 257,500,000원 과대), 종전에는 **입력 화면도
   * validate도 없어** 아무도 알려주지 않았다. 자동 fallback은 금지이므로(루트 CLAUDE.md
   * 「미입력은 검증 오류로 차단」) 여기서 막는다.
   *
   * ⚠️ 게이트·값 해석은 **UI(⑤)와 같은 함수**를 쓴다 — 술어가 갈리면 「칸은 뜨는데 계산은
   *    막힌다」가 된다. `general_building`은 (5-b)가 gb* 축으로 따로 검사한다.
   */
  // (5-c′) 의제취득일 전 상속·증여 토지·주택·상가·건물 — 의제취득일 기준시가(기준시가 평가) 또는 증여 신고가액(시가 평가) (계획서 §18)
  const preDeemedErr = bgPreDeemedError(asset, label, formTransferDate);
  if (preDeemedErr) return preDeemedErr;

  if (needsBgAcqStdPriceInput(asset, isFractionalSplitAxis === true) && resolveBgAcqStdPrice(asset) <= 0) {
    // 시가 모드 담보 승 — 엔진이 같은 상태에서 400을 낸다(「취득시 기준시가를 입력하세요」). 칸은 ⑤가 같은 술어로 연다(O-5).
    if (bgCollateralForcesStdAcq(asset, isFractionalSplitAxis === true)) {
      const acqStdInput =
        asset.assetKind === "land" ? "취득시 기준시가(또는 취득 당시 ㎡당 공시지가 + 면적)를" : "「② 양도정보」의 취득시 기준시가를";
      return fieldError("standardPriceAtAcq", `${label}: 부담부증여 — 담보평가액이 시가보다 커서 증여가액이 담보평가액(「상속세 및 증여세법」 제66조)이고, 취득가액은 산정방식과 관계없이 취득시 기준시가 × 채무비율입니다(「소득세법 시행령」 제159조 제1항 제1호 괄호). ${acqStdInput} 입력하세요.`);
    }
    // K-6/K-7도 이 칸이 개산공제 base다 — 위 금액 검사는 통과해도 이 값이 비면 개산공제가 0이 된다.
    if (asset.bgValuationMode === "sangjeungbeop_market" && isBgPresumedMethod(asset.bgAcquisitionMethod)) {
      const acqStdInput =
        asset.assetKind === "land"
          ? "취득시 기준시가(또는 취득 당시 ㎡당 공시지가 + 면적)를"
          : "「② 양도정보」의 취득시 기준시가를";
      return fieldError("standardPriceAtAcq", `${label}: 부담부증여 ${BG_PRESUMED_LABEL[asset.bgAcquisitionMethod]} — ${acqStdInput} 입력하세요. 필요경비는 개산공제(취득시 기준시가 × 채무비율 × 개산공제율)뿐이라 이 값이 비면 개산공제가 0으로 계산됩니다 (소득세법 시행령 제163조 제6항).`);
    }
    // 시가 + 환산(K-5)도 이 칸을 쓴다(B2) — 주택·건물은 위 K-5 검사가 먼저 잡으므로 여기 오는 것은 토지다
    if (asset.bgValuationMode === "sangjeungbeop_market")
      return fieldError("standardPriceAtAcq", `${label}: 부담부증여 환산취득가액 — 취득시 기준시가(또는 취득 당시 ㎡당 공시지가 + 면적)를 입력하세요. 환산취득가액은 양도가액에 「취득시 기준시가를 양도시 기준시가로 나눈 비율」을 곱한 값입니다 (소득세법 시행령 제176조의2 제2항 제2호).`);
    return fieldError("standardPriceAtAcq", asset.assetKind === "land"
      ? `${label}: 부담부증여 기준시가 모드 — 취득시 기준시가(또는 취득 당시 ㎡당 공시지가 + 면적)를 입력하세요. 취득가액 = 취득시 기준시가 × 채무비율입니다 (소득세법 시행령 제159조 제1항 제1호).`
      : `${label}: 부담부증여 기준시가 모드 — 「② 양도정보」의 취득시 기준시가를 입력하세요. 취득가액 = 취득시 기준시가 × 채무비율이므로, 미입력 시 취득가액이 0으로 계산됩니다 (소득세법 시행령 제159조 제1항 제1호).`);
  }

  /**
   * (5-d) 조합원입주권 — 상증법 §61③ 평가 3항 + K-4 취득가액 (2026-09-08).
   *
   * §61③ 평가는 §159①1호 A괄호의 열거에 없어 **취득가액이 실지거래가액**이다(K-4 전용).
   * 그래서 (5-c)의 취득시 기준시가는 요구하지 않고(`needsBgAcqStdPriceInput`이 제외),
   * 대신 **평가 3항과 실지취득가액**을 요구한다.
   *
   * ⚠️ 조합원권리가액은 ⑤ 표시·④ 전송과 **같은 파생**을 본다
   *    (`deriveMemberRightsValue` — 재개발 권리가액 프리필). 여기서 명시 입력만 보면
   *    「화면에는 값이 보이는데 검증이 막는」 3중 패턴 위반이 된다.
   */
  if (asset.assetKind === "right_to_move_in") {
    if (deriveMemberRightsValue(asset) <= 0) {
      return fieldError("bgRightMemberRightsValue", `${label}: 조합원입주권 증여재산 평가 — 조합원권리가액을 입력하세요 (상속세 및 증여세법 시행규칙 제16조 제3항 — 종전 토지·건축물 가격 × 비례율). 재개발 정보의 권리가액을 입력해 두면 그 값이 파생됩니다.`);
    }
    // 원조합원만 — 승계조합원의 실지취득가액은 승계 블록 2칸이고 승계 검증이 요구한다(`isBgSuccessorRight`).
    if (!isBgSuccessorRight(asset) && (parseAmount(asset.bgActualAcquisitionTotal) || 0) <= 0) {
      if (rightShareAcqPointer) return fieldError("bgActualAcquisitionTotal", rightShareAcqPointer);
      return fieldError("bgActualAcquisitionTotal", `${label}: 조합원입주권 부담부증여 — 종전 부동산의 실지취득가액을 입력하세요. 증여재산 평가가 「소득세법 시행령」 제159조 제1항 제1호 괄호의 열거(상속세 및 증여세법 제61조 제1항·제2항·제5항 및 제66조)에 없는 같은 법 제61조 제3항이므로, 취득가액은 기준시가가 아니라 실지거래가액입니다 (소득세법 제97조 제1항 제1호 가목 · 시행령 제166조 제1항 제1호).`);
    }
    /**
     * 🔴 자기일관 — 3항 합이 ④가 보내는 평가액 총액과 일치해야 한다.
     *
     * ④는 `deriveRightValuationTotal`을 `buildingStdPriceAtTransfer`에 싣고, 엔진은
     * `rightValuationDetail.total`을 따로 기록한다. 두 값이 갈리면 결과 화면의 명세와
     * 실제 안분 분모가 어긋나는데 **세액은 조용히 나온다**. ④·⑧이 같은 파생을 쓰므로
     * 정상 경로에서는 항상 일치하고, 이 검사는 파생이 갈라진 순간을 잡는 트립와이어다.
     */
    const parts =
      deriveMemberRightsValue(asset) +
      (parseAmount(asset.bgRightPaidInstallments) || 0) +
      (parseAmount(asset.bgRightPremium) || 0);
    if (parts !== deriveRightValuationTotal(asset)) {
      return `${label}: 조합원입주권 증여재산 평가 항목의 합계가 평가액과 일치하지 않습니다. 조합원권리가액·납입금·프리미엄을 재확인하세요.`;
    }
  }

  // (5-c″) 기준시가 모드 조합원입주권 × 담보·임대 승 — 평가 3항·실지취득가액 필수 검사 **뒤**여야 한다(앞에 두면 그 안내를 가린다). 시가 모드는 위 (4) 안에서 같은 헬퍼가 막는다.
  if (asset.bgValuationMode === "sangjeungbeop_standard" && isFractionalSplitAxis !== true) {
    const rtmiIssue = rtmiNonSupplementaryWinnerIssue(asset, label, bgWholeGiftValuation(asset));
    if (rtmiIssue) return rtmiIssue;
  }

  // (5-d) 이월과세 × 당초 증여자 신축·증축 §114조의2 (PR-4) — 환산(K-5)·감정(K-7) 입력 다음 순서. 범위 밖 stale 은 요구하지 않는다.
  const donorBuiltErr = validateDonorBuiltBg(asset, label, formTransferDate, isFractionalSplitAxis === true || contractAssumedDebtTotal !== undefined);
  if (donorBuiltErr) return donorBuiltErr;

  // (6) Phase 3 — 사전증여 행별 부분 입력 검증
  const priorGifts = asset.bgPriorGifts ?? [];
  for (let i = 0; i < priorGifts.length; i++) {
    const row = priorGifts[i];
    const hasDate = !!row.giftDate;
    const amount = parseAmount(row.giftAmount) || 0;
    if (hasDate && amount <= 0) {
      return fieldError(`bgPriorGifts.${i}.giftAmount`, `${label}: 사전증여 #${i + 1} — 증여일이 입력되었으나 증여재산가액이 0입니다. 가액을 입력하거나 행을 삭제하세요.`);
    }
    if (!hasDate && amount > 0) {
      return fieldError(`bgPriorGifts.${i}.giftDate`, `${label}: 사전증여 #${i + 1} — 증여재산가액이 입력되었으나 증여일이 비어있습니다.`);
    }
    // §58 Phase A — 유효 사전증여 행은 당시 산출세액·과세표준 입력 필수 (미입력 시 공제 누락·이중과세)
    if (hasDate && amount > 0) {
      if ((parseAmount(row.computedTax) || 0) <= 0) {
        return fieldError(`bgPriorGifts.${i}.computedTax`, `${label}: 사전증여 #${i + 1} — §58 기납부세액공제 적용을 위해 당시 산출세액을 입력하세요.`);
      }
      if ((parseAmount(row.giftTaxBase) || 0) <= 0) {
        return fieldError(`bgPriorGifts.${i}.giftTaxBase`, `${label}: 사전증여 #${i + 1} — §58 한도 산정을 위해 당시 과세표준을 입력하세요.`);
      }
    }
  }

  return null;
}

/**
 * 이월과세 「당초 증여자」 한 벌 중 **모드별 필수 칸이 비었는지** 판정한다 (D-7b).
 *
 * ## ⚠️ 엔진과 **같은 규칙**이어야 한다
 *
 * 판정 기준은 `lib/tax-engine/transfer-tax-carryover-burdened-gift.ts`의
 * `describeRequiredDonorFields()`와 1:1로 맞춰져 있다. 어긋나면 「UI는 통과시키는데 엔진이
 * throw」하거나 그 반대가 된다(메모리 `feedback_validation_sync_8th_point`).
 *
 * ⚠️ **0은 미입력이 아니다.** 건물이 없는 토지 자산은 건물 기준시가를 `0`으로 명시해야 하고,
 *    그때 `parseAmount("0")`은 0을 돌려준다. 그래서 판정은 **빈 문자열 검사**로 한다
 *    (`parseAmount(v) > 0`으로 쓰면 사용자가 넣은 0이 미입력으로 둔갑한다).
 *
 * @returns 비어 있는 항목의 한국어 라벨 | null (전부 채워짐)
 */
function missingCoDonorBasisLabel(asset: AssetForm): { label: string; field: IssueField } | null {
  const filled = (v: string | undefined) => v !== undefined && v.trim() !== "";

  // K-1~K-3(기준시가 모드) · K-5(환산) — 둘 다 취득시 기준시가 두 칸을 쓴다.
  //   K-5에 전용 칸을 두지 않는 것은 환산이 **이 칸을 분자로** 자동 추종하기 때문이다(이중 진실 방지).
  // K-6/K-7 — 개산공제 base로 같은 두 칸이 필요하다(필요경비는 개산공제만).
  // 담보 승 — 두 시나리오 모두 취득시 기준시가를 읽고 당초 증여자의 매매사례가액·감정가액은 읽히지 않는다(⑤가 그 칸을 숨기고 엔진도 요구하지 않는다).
  const isPresumed =
    asset.bgValuationMode === "sangjeungbeop_market" && isBgPresumedMethod(asset.bgAcquisitionMethod) && !bgCollateralForcesStdAcq(asset);
  const needsStdPrice = bgCoDonorNeedsStdPrice(asset);
  if (isPresumed) {
    const methodLabel = BG_PRESUMED_LABEL[asset.bgAcquisitionMethod as "salesCase" | "appraisal"];
    const kind = bgPresumedInputKind(asset);
    const has =
      kind === "split"
        ? filled(asset.bgCoDonorPresumedAcquisitionLand) || filled(asset.bgCoDonorPresumedAcquisitionBuilding)
        : kind === "land"
          ? filled(asset.bgCoDonorPresumedAcquisitionLand)
          : filled(asset.bgCoDonorPresumedAcquisitionTotal);
    if (!has) {
      return {
        label: methodLabel,
        field: kind === "total" ? "bgCoDonorPresumedAcquisitionTotal" : "bgCoDonorPresumedAcquisitionLand",
      };
    }
  }
  // 증여받은 파트의 칸만 요구한다 — 한 파트만이면 다른 파트 칸은 화면에 없다(⑤ · 엔진 `describeRequiredDonorFields`와 같은 조건).
  const parts = bgCarryoverParts(asset);
  if (needsStdPrice) {
    const landEmpty = parts.land && !filled(asset.bgCoDonorLandStdPriceAtAcq);
    const buildingEmpty = parts.building && !filled(asset.bgCoDonorBuildingStdPriceAtAcq);
    if (landEmpty || buildingEmpty) {
      // 입력칸 이동 — 빈 쪽(토지 먼저)
      return {
        label: parts.land && parts.building ? "취득 당시 토지·건물 기준시가" : parts.land ? "취득 당시 토지 기준시가" : "취득 당시 건물 기준시가",
        field: landEmpty ? "bgCoDonorLandStdPriceAtAcq" : "bgCoDonorBuildingStdPriceAtAcq",
      };
    }
    return null;
  }

  // K-4(시가 + 실지취득가액)
  if (asset.bgAcquisitionMethod === "actual") {
    /**
     * 🔴 토지 자산은 **토지 칸 하나로 충족**한다(2026-09-30 B1). 화면은 토지 칸만 렌더하고(건물·총액 칸 없음)
     *    건물 부분이 없는 것은 사실이다 — ④가 건물을 0으로 싣는다(`buildCarryoverDonorBasis`).
     *    종전에는 「분리 2칸 또는 총액」을 요구해 채울 칸 없는 영구 차단이었다.
     *    양도인 K-4(위 `validateBurdenedGiftAsset`)도 토지는 토지 칸만 요구한다.
     */
    // 주택·건물은 토글 C가 켜져 있을 때만 토지·건물 칸이 있고 ④가 싣는다 — 켰다 끈 뒤 남은 값으로 통과시키지 않는다(2026-10-27 실측: 통과 → 서버 400).
    const houseSplit = bgHouseSplitActive(asset);
    const partsOnScreen = (asset.assetKind !== "housing" && asset.assetKind !== "building") || houseSplit;
    const hasSplit = partsOnScreen &&
      (!parts.land || filled(asset.bgCoDonorActualAcquisitionLand)) &&
      (asset.assetKind === "land" || !parts.building || filled(asset.bgCoDonorActualAcquisitionBuilding));
    // 한 파트만이면 총액은 파트를 가를 수 없다(엔진이 거부 · Q-4) — 일반건물 화면에는 총액 칸이 없다.
    //   주택·건물 토지·건물 취득일 다름(토글 C)도 총액 칸이 없다(`validateBgHouseSplit`이 두 칸을 요구한다).
    const hasTotal = parts.land === parts.building && !houseSplit && filled(asset.bgCoDonorActualAcquisitionTotal);
    if (!hasSplit && !hasTotal) {
      // 입력칸 이동 — 화면은 자산 종류로 칸을 가른다(일반건물·토지·토지·건물 분리 주택 = 토지·건물 분리, 그 외 = 총액)
      const splitUi = asset.assetKind === "general_building" || asset.assetKind === "land" || houseSplit;
      const landEmpty = parts.land && !filled(asset.bgCoDonorActualAcquisitionLand);
      return {
        label: "실지취득가액(토지·건물 분리 또는 단일 총액)",
        // 건물 칸은 일반건물에만 렌더된다 — 토지는 토지 칸
        field: !splitUi ? "bgCoDonorActualAcquisitionTotal" : landEmpty || asset.assetKind === "land" ? "bgCoDonorActualAcquisitionLand" : "bgCoDonorActualAcquisitionBuilding",
      };
    }
    return null;
  }

  // legacy — 시가 모드인데 산정방식을 고르지 않은 경우.
  //   (K-6/K-7은 여기로 오지 않는다 — `validateBurdenedGiftAsset` (1-b)가 같은 자산을 앞에서 차단한다.)
  if (!filled(asset.bgCoDonorMarketValueAtAcquisition)) {
    return { label: "취득 당시 시가 평가액", field: "bgCoDonorMarketValueAtAcquisition" };
  }
  return null;
}
