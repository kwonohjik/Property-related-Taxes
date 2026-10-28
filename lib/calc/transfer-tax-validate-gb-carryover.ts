/**
 * 일반건물 ⑧ — **이월과세(§97의2) 입력 검증**
 *
 * `transfer-tax-validate-gb.ts`에서 분리(2026-08-13, 800줄 정책). 로직 변경 없이 순수 추출.
 * 호출부는 `validateGeneralBuildingAsset` 하나뿐이고, 그 함수의 **첫 관문**이다.
 */

import { parseAmount } from "@/lib/calc/number-parse";
import type { AssetForm } from "@/lib/stores/calc-wizard-store";
import type { CarryoverTaxationForm } from "@/lib/stores/calc-wizard-asset-carryover";
import { fieldError } from "./transfer-tax-validate-field";
import { gbCarryoverEventSource } from "./transfer-tax-api-gb-carryover";
import { carryoverEstimationModeSupported } from "./phd-toggle-scope";
import { validateDonorBuiltGb } from "./transfer-tax-validate-donor-built-gb";
import { gbBgGiftTaxNumerator, gbBgGiftTaxReturn } from "./gb-bg-gift-tax-return";
import { gbBgGiftValuationByPart } from "./gb-bg-gift-tax-return";
import { carryoverAssumedDebt } from "./carryover-gift-assumed-debt";
import { assumedDebtIssue, validateGbCarryoverDebt } from "./transfer-tax-validate-carryover-debt";
import { validateGbCarryoverDebtScope } from "./transfer-tax-validate-carryover-debt";
import { carryoverGiftTaxedValue } from "./carryover-gift-assumed-debt";
import { gbBgSplitsGiftValuation } from "./gb-bg-gift-tax-return";
import { bgCarryoverForm, bgPartialCarryover } from "./bg-carryover-parts";
import { isBgPresumedMethod } from "./burdened-gift-presumed-acquisition";

/**
 * ⑧ 이월과세(§97의2) 입력 검증 — 일반건물 전용.
 *
 * 🔴 **가장 위험한 실패 모드를 막는다.** ④ `buildGbCarryoverPayload`는 증여 등기접수일이나
 *    증여자 취득일이 비면 서브객체를 만들지 않는다 ⇒ **조용히 미발동**으로 되돌아간다.
 *    사용자는 입력했다고 믿는데 세액이 안 바뀐다 — 이 기능이 애초에 고치려던 그 증상이다.
 *
 * ⇒ ④와 **같은 조건**을 본다(메모리 `feedback_shared_predicate_argument_parity`).
 *
 * ⚠️ **UI에 있는 칸만 요구한다.** 건물 파트를 안 골랐으면 건물 칸을 묻지 않는다.
 */
export function validateGbCarryover(asset: AssetForm, label: string, formTransferDate?: string): string | null {
  const landIsCarryover = asset.acquisitionCause === "carryover_gift";
  const buildingIsCarryover = asset.gbBuildingAcquisitionCause === "carryover_gift";
  if (!landIsCarryover && !buildingIsCarryover) return null;

  // 증여 사건 정보의 출처 — ④ `buildGbCarryoverPayload`와 **같은 함수**(G1)
  const c = gbCarryoverEventSource(asset);

  /**
   * §97조의2 ① **관계요건** — 증여 **사건**의 사실이라 사건 출처(`c`) 하나가 정본이다.
   * 일반 경로(`transfer-tax-validate-asset.ts`)와 **같은 조건**을 본다 —
   * 관계는 단독 필수화하지 않고, 사망을 선언했을 때만 요구한다.
   *
   * 🔑 **부담부증여 조기 반환보다 앞에 둔다** (O-3, 2026-08-10).
   *    아래 조기 반환은 「당초 증여자」 입력 요구를 가로채지 않으려는 것인데,
   *    ① 본문 요건은 그 요구와 **직교**다. 뒤에 두면 부담부증여에서 「그 외」를 고른
   *    사용자가 **아무 안내 없이** 이월과세만 조용히 꺼진다(엔진은 정확히 배제하므로
   *    세액은 맞지만, 왜 안 걸렸는지 화면이 말해 주지 않는다). BG-W-01·02가 고정한다.
   */
  if (c?.donorRelation === "other")
    return fieldError(landIsCarryover ? "acquisitionCause" : "gbBuildingAcquisitionCause", `${label}: 이월과세는 배우자 또는 직계존비속으로부터 증여받은 경우에만 적용됩니다 (「소득세법」 제97조의2 제1항). 취득 원인을 "증여"로 변경하세요.`);

  if (c?.donorDeceased && !c.donorRelation)
    return fieldError("carryover.donorRelation", `${label}: 증여자와의 관계를 선택하세요 (「소득세법」 제97조의2 제1항).`);

  /**
   * 🔴 **나머지는 부담부증여에서 손대지 않는다** (2026-08-10 정정).
   *
   * 초안은 「범위 밖이니 차단」이었다. **틀렸다** — 그 사이 다른 줄기(D-7a·D-7b,
   * `burdened-gift-carryover-159-97-2.plan.md`)가 **지원을 열었다**. 근거는 국세청
   * 재산세과-1059: 「영 §159 제1호에 따른 취득가액 산정 시 §97①1호 가액에 **이월과세가
   * 적용되는 것임**」. 그쪽 ⑧는 「당초 증여자」 두 벌 입력을 요구한다.
   *
   * 여기서 차단 메시지를 띄우면 그 요구가 화면에 닿기 전에 가로채 **지원된 기능이 막힌다**
   * (E2E `transfer-burdened-gift-carryover-block.spec.ts` CB-2로 실측).
   *
   * ⇒ 이 아래는 **일반 양도의 GB 이월과세**만 본다. 부담부증여는 그쪽 경로에 맡긴다.
   *    예외는 증여세 칸 하나다 — 화면이 일반건물이면 부담부증여여도 산출세액·과세가액을 받고, ④가 그 짝으로 상당액을 만든다.
   *    빈 값은 막지 않으므로(증여세 없음) 「당초 증여자」 요구를 가로채지 않는다(`gb-bg-carryover-gift-tax-input.plan.md` §4.2).
   */
  /**
   * 부담부증여 × 한 파트만 이월과세 — 서버는 `carryoverDonorBasis.parts`로 증여받은 파트만 계산한다(`gb-bg-part-carryover-calc.plan.md` PR-1·PR-2).
   * 감정가액·매매사례가액(K-6·K-7)은 당초 증여자 쪽 방식이라 한 신고 안에서 파트마다 방식이 갈린다 — 아직 계산하지 못한다(Q-3 a · 엔진 `assertPartialCarryoverSupported`와 같은 조건).
   */
  if (asset.transferType === "burdened_gift" && bgPartialCarryover(asset) && isBgPresumedMethod(asset.bgAcquisitionMethod))
    return fieldError("bgAcquisitionMethod", `${label}: 토지·건물 중 한 파트만 이월과세(증여)일 때는 취득가액 산정방식으로 감정가액·매매사례가액을 아직 계산하지 못합니다 — 「소득세법」 제97조의2 제1항은 증여받은 파트에만 당초 증여자의 취득가액을 쓰는데, 감정가액·매매사례가액은 당초 증여자 쪽 방식이라 증여받지 않은 파트의 방식과 갈립니다. 실지취득가액 또는 환산취득가액을 선택하세요.`);

  /**
   * 부담부증여 × 둘 다 이월과세 — 당초 증여자의 **건물** 취득일(시나리오 A 건물 기산일 · 「소득세법」 제95조 제4항 단서 「해당 자산을 취득한 날」).
   * 분리 ON 건물 블록 · 분리 OFF 건물분 칸이 같은 키다. 토지 날짜로 채우지 않는다(④ 전송 조건과 같다 · `gb-bg-donor-building-acquisition-date.plan.md` Q-1 a).
   */
  if (asset.transferType === "burdened_gift" && gbBgSplitsGiftValuation(asset) && !asset.buildingCarryover?.donorAcquisitionDate)
    return fieldError("buildingCarryover.donorAcquisitionDate", `${label}: 당초 증여자가 건물을 취득한 날을 입력하세요 — 건물 보유기간은 증여자가 그 건물을 취득한 날부터 셉니다(「소득세법」 제95조 제4항). 직접 신축했으면 사용승인서 교부일 등입니다(「소득세법 시행령」 제162조 제1항 제4호).`);

  // 증여세 칸 — 사건 출처가 건물 블록(건물만 이월과세)이면 앵커도 그쪽이다.
  if (asset.transferType === "burdened_gift") return validateGbBgGiftTax(asset, label, !landIsCarryover);

  if (!c?.giftRegistryDate)
    return fieldError("carryover.giftRegistryDate", `${label}: 증여 등기접수일을 입력하세요 (「소득세법」 제97조의2 제3항 — 적용기간 기산일).`);

  // 당초 증여 때 인수한 채무 — 조각 규칙을 적용할 수 없는 자산(감면·용도변경)에서 토글이 켜져 있으면 끄게 막는다(채무 칸 필수 검사보다 앞 — 이 상태의 UI는 채무 칸을 숨긴다).
  const debtScopeBlock = validateGbCarryoverDebtScope(asset, c, label);
  if (debtScopeBlock) return debtScopeBlock;

  const parts: Array<[CarryoverTaxationForm | undefined, string]> = [];
  if (landIsCarryover) parts.push([c, `${label} 토지`]);
  if (buildingIsCarryover) parts.push([asset.buildingCarryover ?? c, `${label} 건물`]);

  for (const [p, partLabel] of parts) {
    const isBuildingPart = partLabel.endsWith(" 건물");
    if (!p?.donorAcquisitionDate)
      return fieldError(isBuildingPart ? "buildingCarryover.donorAcquisitionDate" : "carryover.donorAcquisitionDate", `${partLabel}: 증여자의 취득일을 입력하세요 (「소득세법」 제95조 제4항 — 보유기간 기산일).`);
    if (!parseAmount(p.giftDateValuation))
      return fieldError(isBuildingPart ? "buildingCarryover.giftDateValuation" : "carryover.giftDateValuation", `${partLabel}: 증여 당시 평가액을 입력하세요 (비교과세 시나리오 B 취득가액).`);
    const debtIssue = assumedDebtIssue(c, p, partLabel, isBuildingPart);
    if (debtIssue) return debtIssue;
    if (p.useEstimatedAcquisition) {
      if (!p.estimationMode)
        return fieldError(isBuildingPart ? "buildingCarryover.estimationMode" : "carryover.estimationMode", `${partLabel}: 증여자 취득가액의 환산 방식을 선택하세요.`);
      /**
       * 일반건물은 `general`만 지원한다(`carryoverEstimationModeSupported` — ⑤ 옵션 노출·④ 전송과 같은 술어). PHD·APD가 남아 있으면
       * (세션 잔재) 그 방식의 입력 칸이 이 자산에는 없으므로, **방식을 다시 고르게** 한다 — 아래 기준시가 요구가 그 칸 없는
       * 상태에서 막다른 길이 되는 것(H-6)과, 통과해도 고른 방식이 반영되지 않는 조용한 오인을 함께 막는다.
       */
      if (!carryoverEstimationModeSupported("general_building", p.estimationMode))
        return fieldError(isBuildingPart ? "buildingCarryover.estimationMode" : "carryover.estimationMode", `${partLabel}: 일반건물 이월과세의 환산취득가액은 「일반 기준시가 환산」만 지원합니다 — 환산 방식을 「일반 기준시가 환산」으로 선택하세요 (개별주택가격 미공시·공동주택 최초고시 전 방식은 이 자산의 계산에 반영되지 않습니다).`);
      if (!parseAmount(p.donorStandardPriceAtAcquisition))
        return fieldError(isBuildingPart ? "buildingCarryover.donorStandardPriceAtAcquisition" : "carryover.donorStandardPriceAtAcquisition", `${partLabel}: 증여자 취득 당시 기준시가를 입력하세요 (환산 분자).`);
      // 건물 파트의 «증여자 신축·증축»(§114조의2, PR-5a) — 환산 입력 다음 질문이라 검증 순서도 그 뒤다. 토지 파트는 대상이 아니다(D4).
      if (isBuildingPart) {
        const donorBuiltErr = validateDonorBuiltGb(asset, partLabel);
        if (donorBuiltErr) return donorBuiltErr;
      }
    } else if (!parseAmount(p.donorAcquisitionPrice)) {
      return fieldError(isBuildingPart ? "buildingCarryover.donorAcquisitionPrice" : "carryover.donorAcquisitionPrice", `${partLabel}: 증여자의 취득가액을 입력하세요 (「소득세법」 제97조의2 제1항 제1호).`);
    }
  }

  // 당초 증여 때 인수한 채무 부분(매입분) — 조각 규칙을 적용할 수 없는 입력 차단(⑫ `refineGbCarryover` 거울 · 엔진 설계서 PR-2 R5)
  const debtBlock = validateGbCarryoverDebt(
    asset,
    c,
    parts.map(([p, partLabel]) => ({ form: p, onBuilding: partLabel.endsWith(" 건물") })),
    label,
    formTransferDate,
  );
  if (debtBlock) return debtBlock;

  // 짝 반쪽 — ④ `gbCarryoverUsesPartShape`는 둘 다 > 0일 때만 신고서 금액을 보내고, 아니면 화면에 없는 상당액 칸(0)으로 내려간다.
  //   사건 출처가 건물 서브폼(건물만 이월과세)이면 앵커도 그쪽이다(화면 건물 블록 `field` 접두어).
  const pairIssue = giftTaxPairIssue(c, label, !landIsCarryover, c?.giftDebtAssumed === true);
  if (pairIssue) return pairIssue;

  /**
   * 🔑 **Σ 검증** — 영 §163의2②의 안분 분모가 사용자 입력이라, 파트 합이 분모를 넘으면
   *    증여세 상당액 합계가 산출세액을 초과한다. 엔진은 파트별로만 보므로 여기서 잡는다.
   *    (분모를 안 넣었으면 legacy `giftTaxAmount` 경로라 검증 대상이 아니다.)
   */
  const giftTaxBase = parseAmount(c.giftTaxBase);
  if (giftTaxBase > 0) {
    // 영 §163의2②2호 분자 = 평가액 − 당초 증여 때 인수한 채무(「상속세 및 증여세법」 제47조 제1항).
    const sum = parts.reduce((s, [p]) => s + carryoverGiftTaxedValue(parseAmount(p?.giftDateValuation), carryoverAssumedDebt(c, p)), 0);
    if (sum > giftTaxBase)
      return `${label}: 파트별 증여세 과세가액(증여 당시 평가액 − 당초 증여 때 인수한 채무) 합계(${sum.toLocaleString()}원)가 증여세 과세가액(${giftTaxBase.toLocaleString()}원)을 초과합니다${c.giftDebtAssumed ? "" : DEBT_HINT}.`;
  }
  return null;
}

/**
 * 부담부증여 일반건물의 증여세 칸 — ④ `buildCarryoverPayload`가 짝(`gbBgGiftTaxReturn`)으로 영 §163의2② 상당액을 만든다.
 * 짝이 반만 차면 ④는 종전 상당액 칸(화면에 없다 → 0)으로 내려가 **입력이 조용히 사라진다** ⇒ 여기서 막는다.
 * 분자(2호 자산가액 = 증여 당시 평가액 × 지분율)가 없으면 상당액이 0이고, 과세가액을 넘으면 산출세액 전액을 넘보는 입력이다.
 */
function validateGbBgGiftTax(asset: AssetForm, label: string, onBuilding: boolean): string | null {
  const c = bgCarryoverForm(asset);
  const pairIssue = giftTaxPairIssue(c, label, onBuilding);
  if (pairIssue) return pairIssue;
  if (!gbBgGiftTaxReturn(asset)) return null;
  const base = parseAmount(c?.giftTaxBase ?? "");
  const numerator = gbBgGiftTaxNumerator(asset);
  /**
   * 토지·건물 둘 다 이월과세 — 분자는 **토지분 + 건물분** 증여 당시 평가액이다(④·엔진 배분과 같은 술어 · 계획서 `gb-bg-carryover-gift-tax-part-limit.plan.md` Q-2 a · Q-3 b).
   * 한쪽이 비면 상당액도 배분도 틀어진다 — 종전에는 건물분이 계산에 닿지 않아 비어도 통과했다.
   */
  const byPart = gbBgGiftValuationByPart(asset);
  const debtHint = c?.giftDebtAssumed ? "" : DEBT_HINT;
  if (byPart) {
    if (!(byPart.land > 0))
      return fieldError("carryover.giftDateValuation", `${label}: 토지분 증여 당시 평가액을 입력하세요 — 증여세 상당액 안분의 분자입니다 (「소득세법 시행령」 제163조의2 제2항 제2호).`);
    if (!(byPart.building > 0))
      return fieldError("buildingCarryover.giftDateValuation", `${label}: 건물분 증여 당시 평가액을 입력하세요 — 토지·건물을 함께 증여받았으면 증여세 상당액을 토지분·건물분 평가액 비율로 나눕니다. 토지분 칸에 자산 전체 평가액이 들어 있으면 토지 평가액으로 고친 뒤 입력하세요 (「소득세법 시행령」 제163조의2 제2항 제2호).`);
    const debtIssue = assumedDebtIssue(c, asset.carryover, `${label} 토지분`, false) ?? assumedDebtIssue(c, asset.buildingCarryover, `${label} 건물분`, true);
    if (debtIssue) return debtIssue;
    // 토지분 칸 자산 전체 — PR-2(#2592) 전 화면은 이 칸을 자산 전체로 받았다. 저장 시점으로 골라낼 수 없어 문구로만 알린다(계획서 V-5 · a).
    if (numerator > base)
      return fieldError("buildingCarryover.giftDateValuation", `${label}: 토지분·건물분 증여세 과세가액(증여 당시 평가액 − 당초 증여 때 인수한 채무) 합계(지분 몫 ${numerator.toLocaleString()}원)가 증여세 과세가액(${base.toLocaleString()}원)을 초과합니다 — 토지분 칸에 자산 전체 평가액을 넣었는지 확인하세요${debtHint}.`);
    return null;
  }
  const debtIssue = assumedDebtIssue(c, c, label, onBuilding);
  if (debtIssue) return debtIssue;
  if (!(numerator > 0))
    return fieldError(onBuilding ? "buildingCarryover.giftDateValuation" : "carryover.giftDateValuation", `${label}: 증여 당시 평가액을 입력하세요 — 증여세 상당액 안분의 분자입니다 (「소득세법 시행령」 제163조의2 제2항 제2호).`);
  if (numerator > base)
    return fieldError(onBuilding ? "buildingCarryover.giftDateValuation" : "carryover.giftDateValuation", `${label}: 증여세 과세가액(증여 당시 평가액 − 당초 증여 때 인수한 채무, 지분 몫 ${numerator.toLocaleString()}원)이 신고서의 증여세 과세가액(${base.toLocaleString()}원)을 초과합니다${debtHint}.`);
  return null;
}

/** 합계 초과 메시지 꼬리 — 토글이 꺼져 있을 때만 붙인다(평가액이 과세가액을 넘는 흔한 원인이 인수채무다). */
const DEBT_HINT = " — 당초 증여 때 인수한 채무가 있으면 «당초 증여 때 채무를 인수했다»를 켜고 채무를 입력하세요(「상속세 및 증여세법」 제47조 제1항)";

/**
 * 증여세 산출세액·과세가액 **짝 반쪽** — 일반 양도(④ `gbCarryoverUsesPartShape`)·부담부증여(④ `gbBgGiftTaxReturn`) 모두
 * 둘 다 > 0일 때만 신고서 금액으로 상당액을 만들고, 아니면 화면에 없는 상당액 칸(→ 0)으로 내려가 **입력이 조용히 사라진다**
 * (실측 2026-10-26: 산출세액만 → 163,932,000 = 증여세 없음, 짝 → 160,572,000). 빈 칸 쪽으로 이동시킨다.
 */
/** `onBuilding` — 사건 출처가 건물 서브폼(건물만 이월과세)이면 앵커도 `buildingCarryover.*`다. 앵커는 리터럴 삼항으로 쓴다(앵커 커버리지 게이트가 정적으로 읽는다). */
function giftTaxPairIssue(c: CarryoverTaxationForm | undefined, label: string, onBuilding: boolean, debtAssumed = false): string | null {
  const calculated = parseAmount(c?.giftTaxCalculated ?? "");
  const base = parseAmount(c?.giftTaxBase ?? "");
  // 당초 증여 때 채무를 인수했으면(일반 양도 일반건물) 두 칸이 **모두** 있어야 한다 — ④ `gbCarryoverUsesPartShape`가 이 짝일 때만 인수채무를 와이어에 싣는다(K-2). 산출세액 0은 입력이다.
  if (debtAssumed && !(base > 0))
    return fieldError(onBuilding ? "buildingCarryover.giftTaxBase" : "carryover.giftTaxBase", `${label}: 당초 증여 때 채무를 인수했으면 증여세 신고서의 과세가액을 입력하세요 — 인수한 채무를 시나리오 A에서 나누어 계산하는 데 산출세액·과세가액이 함께 필요합니다 (「소득세법 시행령」 제163조의2 제2항 제3호).`);
  if (debtAssumed && (c?.giftTaxCalculated ?? "").trim() === "")
    return fieldError(onBuilding ? "buildingCarryover.giftTaxCalculated" : "carryover.giftTaxCalculated", `${label}: 당초 증여 때 채무를 인수했으면 증여세 산출세액을 입력하세요 — 증여세가 없었다면 0을 입력합니다 (「소득세법 시행령」 제163조의2 제2항 제1호).`);
  if (calculated > 0 && !(base > 0))
    return fieldError(onBuilding ? "buildingCarryover.giftTaxBase" : "carryover.giftTaxBase", `${label}: 증여세 과세가액을 입력하세요 — 산출세액과 함께 있어야 증여세 상당액을 계산합니다 (「소득세법 시행령」 제163조의2 제2항 제3호).`);
  // 산출세액 「0」은 입력이다(증여재산공제로 세액 0 — 칸 안내도 「없으면 0」). 상당액도 0이 맞으므로 **빈 칸**만 막는다.
  if (base > 0 && (c?.giftTaxCalculated ?? "").trim() === "")
    return fieldError(onBuilding ? "buildingCarryover.giftTaxCalculated" : "carryover.giftTaxCalculated", `${label}: 증여세 산출세액을 입력하세요 — 과세가액과 함께 있어야 증여세 상당액을 계산합니다 (「소득세법 시행령」 제163조의2 제2항 제1호). 증여세가 없었다면 0을 입력하세요.`);
  return null;
}
