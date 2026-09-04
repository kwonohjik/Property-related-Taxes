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
import { validateExprValuationAsset } from "./transfer-tax-validate-expropriation";
import { validateAuctionAsset } from "./transfer-tax-validate-expropriation";
import { validateHousingExprAsset } from "./transfer-tax-validate-expropriation";
import { validateSplitLandExprAsset } from "./transfer-tax-validate-expropriation";
import { validateRentalHousingException } from "./transfer-tax-validate-rental-exception";
import type { TransferFormData, AssetForm } from "@/lib/stores/calc-wizard-store";
import { isFullFractionalBundle } from "./transfer-tax-api-helpers";
import { allowsFamilyBusinessInheritance } from "./transfer-fb-gate";

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

// ─── ⑧ 취득가액 축 검증 — transfer-tax-validate-acquisition.ts로 분리 (800줄 정책, 재export 호환) ───
export { validateAssetAcquisition } from "./transfer-tax-validate-acquisition";
import { validateAssetAcquisition } from "./transfer-tax-validate-acquisition";

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
