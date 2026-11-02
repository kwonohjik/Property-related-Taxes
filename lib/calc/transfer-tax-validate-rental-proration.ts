/**
 * ⑧ validate — §97의3·§97의5 **임대기간 분 양도차익 안분** 입력 검사 (조특령 §97의3⑤·§97의5②).
 *
 * `transfer-tax-validate-reductions.ts`(773줄)에서 분리한 leaf다 — 「안분 축」이라는 자연 이음매.
 * 엔진 `calcRentalGainFraction`이 기준시가를 실제로 요구하는 조건과 **같은 조건**에서만 묻는다(3중 패턴):
 *
 * - 안분 기산일은 원 입력 임대일이 아니라 **의제 개시일**(임대일·등록일·사업자등록일 중 늦은 날)이다
 *   — 엔진 `rental-97-3.ts` 단계 7과 같은 축(계획서 #2). 종전 ⑧은 원 임대일로 비교해,
 *   등록·사업자등록이 취득보다 늦은 사안을 통과시킨 뒤 엔진이 `MISSING_PRORATION_PRICES`로 막았다.
 * - §97의3은 양도일 2020.12.31 이전이면 안분 자체가 없다(법 §97의3① 「양도함으로써 발생하는 소득」
 *   — `data/rental-97-3-proration-era.ts`, 계획서 #4). 그 구간은 기준시가를 묻지 않는다.
 *
 * 반환: 위반 메시지(`fieldError`로 입력칸 기록) 또는 null.
 */
import { parseAmount } from "@/lib/calc/number-parse";
import { isRental973WholeGainEraString } from "@/lib/tax-engine/data/rental-97-3-proration-era";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { AssetReductionForm } from "@/lib/stores/calc-wizard-asset-reduction";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import { fieldError } from "./transfer-tax-validate-field";
import { engineStdPriceAtTransfer } from "./engine-std-price-at-transfer";
import { rental97EffectiveStartString } from "./rental-97-effective-start";
import { rental973DeemedStartString } from "./rental-97-effective-start";

type ProrationReduction = Extract<AssetReductionForm, { type: "rental_97_3" | "rental_97_5" }>;

export function rentalProrationIssue(args: {
  r: ProrationReduction;
  label: string;
  asset: AssetForm;
  assetIndex: number;
  form: TransferFormData;
  /** 원조합원 §166 자산의 화면에 없는 기준시가 칸(`redevHiddenGeneralStdPrice`) */
  redevHiddenStd: { acq: boolean; transfer: boolean };
}): string | null {
  const { r, label, asset, assetIndex, form, redevHiddenStd } = args;

  // D2-06 — 3-state 미선택을 「계속 임대」로 읽지 않는다.
  if (r.rentalContinuesToTransfer === null || r.rentalContinuesToTransfer === undefined)
    return fieldError(`reduction.${r.type}.rentalContinuesToTransfer`, `${label} 적용: 임대가 양도일까지 계속되었는지 선택하세요 (조특령 ${r.type === "rental_97_5" ? "§97의5②" : "§97의3⑤"}).`);

  // §97의3 양도일 2020.12.31 이전 — 안분 없음(엔진 `prorationEra === "whole_gain"`). B·E·D 기준시가를 묻지 않는다.
  const wholeGain = r.type === "rental_97_3" && isRental973WholeGainEraString(form.transferDate || "");

  if (!wholeGain && r.rentalContinuesToTransfer === false && parseAmount(r.stdPriceAtRentalEnd || "0") <= 0)
    return fieldError(`reduction.${r.type}.stdPriceAtRentalEnd`, `${label} 적용: 임대 종료일 당시 기준시가를 입력하세요 (안분 산식의 B). 자동 안분은 수행하지 않습니다.`);

  // 엔진 기산일과 같은 축 — 임대개시일·등록일·사업자등록일 중 늦은 날 (YYYY-MM-DD 문자열 max).
  // §97의3 단기→장기 변경신고 주택은 단기 임대기간 산입을 반영한 의제 개시일(PR-C — 엔진 leaf 단일 소스).
  const start = r.type === "rental_97_3" ? rental973DeemedStartString(r) : rental97EffectiveStartString(r);

  // §97의5①2호·§97의3①1호 — 조기 종료면 기간 판정의 종점(임대 종료일)이 필수. 엔진 `MISSING_RENTAL_END_DATE`·
  // `INVALID_RENTAL_END_DATE`와 같은 조건이다(YYYY-MM-DD 문자열 비교).
  if (r.rentalContinuesToTransfer === false) {
    const end = r.rentalEndDate || "";
    if (!end)
      return fieldError(`reduction.${r.type}.rentalEndDate`, `${label} 적용: 양도 전에 임대를 종료했으면 임대 종료일을 입력하세요 (${r.type === "rental_97_5" ? "§97의5①2호" : "§97의3①1호"} — 임대기간 판정의 종점).`);
    if ((start && end < start) || (form.transferDate && end > form.transferDate))
      return fieldError(`reduction.${r.type}.rentalEndDate`, `${label} 적용: 임대 종료일은 임대개시일(등록일·사업자등록일이 늦으면 그날)과 양도일 사이여야 합니다.`);
  }

  /**
   * Q10 — 분모의 두 시점(E 취득당시 · D 양도당시). 감면-수준 override 또는
   * 자산-수준(환산 모드) 값 중 **하나는** 있어야 한다.
   *
   * ⚠️ **안분이 실제로 필요할 때만 묻는다** — `calcRentalGainFraction`은
   *    「양도일까지 계속 임대 + (개시일 ≤ 취득일 또는 §97의5)」이면 기준시가를 **보지도 않고**
   *    비율 1을 돌려준다. 그 경우까지 막으면 필요 없는 값을 요구하는 오탐이 된다.
   *    §97의5②는 분자의 감수가 취득당시라 계속 임대면 개시일과 무관하게 비율 1이다.
   */
  const prorationNeeded =
    !wholeGain &&
    (r.rentalContinuesToTransfer === false ||
      (r.type !== "rental_97_5" && !!start && !!asset.acquisitionDate && start > asset.acquisitionDate));
  if (!prorationNeeded) return null;

  const hasAcqStd =
    parseAmount(r.stdPriceAtAcquisition || "") > 0 ||
    (!redevHiddenStd.acq && parseAmount(asset.standardPriceAtAcq || "") > 0);
  const hasTransferStd =
    parseAmount(r.stdPriceAtTransfer || "") > 0 || engineStdPriceAtTransfer(form, assetIndex) > 0;
  if (hasAcqStd && hasTransferStd) return null;

  const prorationMsg =
    `${label} 적용: 안분 산식의 취득 당시·양도 당시 기준시가를 입력하세요 ` +
    (redevHiddenStd.acq
      ? `(이 자산은 자산 카드에 기준시가 칸이 없어 감면 카드에 입력합니다). `
      : `(감면 카드의 두 칸, 또는 자산 카드의 환산 입력). `) +
    `자동 안분은 수행하지 않습니다.`;
  // 두 칸을 한꺼번에 묻는 메시지 — 비어 있는 칸(취득 당시 먼저)으로 보낸다
  return !hasAcqStd
    ? fieldError(`reduction.${r.type}.stdPriceAtAcquisition`, prorationMsg)
    : fieldError(`reduction.${r.type}.stdPriceAtTransfer`, prorationMsg);
}
