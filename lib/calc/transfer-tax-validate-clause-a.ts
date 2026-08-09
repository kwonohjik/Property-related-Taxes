/**
 * E-1 — 「가목(§163⑨ 평가액)을 확인할 수 없음」 **명시 선언** 요구 (U2-E).
 *
 * 「소득세법」 §97①1호 **단서**: "가목의 실지거래가액을 확인할 수 없는 경우에 **한정**하여
 * 나목의 금액을 적용한다". 시행령 §163⑨은 상속·증여 자산의 취득가액을 「기준일 현재 상증법
 * §60~66 평가액」으로 **보고**(가목), 같은 조 1호·2호는 기준시가 고시 前 취득에 「그 평가액과
 * §164④~⑦ 가액 **중 많은 금액**」을 쓰게 한다 ⇒ **② 단독도 가목**이다.
 *
 * 현행 엔진은 `clauseA = max(①,②)`가 **0이면** ③(환산·나목)으로 간다
 * (`inheritance-acquisition-price.ts`). 즉 **비워두면 자동으로 나목**이다 —
 * 「확인할 수 없다」를 사용자가 선언한 적이 없는데도 법문상 예외 경로가 열린다.
 *
 * ⇒ ①·② 모두 미충족이면 **차단**하고, 선언(`preDeemedClauseAUnconfirmed`)이 있을 때만 통과시킨다.
 *
 * ## 경계 — 선언은 ③(나목)이 **있는** 구간에서만 효력이 있다
 *
 * · **post-deemed**: 나목이 §163⑨ 의제로 대체돼 ③이 없다. 선언해도 갈 곳이 없어 무의미하다.
 * · **증여 · 실거래가**: 이미 「증여 신고가액을 입력하세요」가 막는다. E-1이 앞서면 그 메시지가
 *   사라지고, 선언으로 **뚫리는** 완화가 되어 버린다 ⇒ 추계 계열에서만 적용한다.
 *
 * 이 경계가 무너지면 E-1은 강화가 아니라 완화다(설계서 §5 X-7·X-12c).
 *
 * ⚠️ **엔진에 보내지 않는다.** 선언은 validate 계층 게이트이고, 결과는 payload에 이미 드러난다
 *    (① 미입력 → `reportedValue` 키 부재 → `clauseA=0` → `converted`).
 *
 * 설계: docs/02-design/features/pre-deemed-clause-a-confirmation-criteria.engine.design.md §4.2
 */

import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { isSec163_9PreDeemed } from "./transfer-163-9-base-date";
import { deriveSec163_9BaseDate } from "./transfer-163-9-base-date";
import { DEEMED_ACQUISITION_DATE } from "./transfer-163-9-base-date";
import {
  isFullyFilled,
  sec164CommercialStatus,
  sec164HouseStatus,
  sec164LandStatus,
} from "./sec164-required-fields";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";

/**
 * ②(§164④~⑦)가 **가목으로 성립**하는가 — 3경로 중 하나라도 완전 충족.
 *
 * ⚠️ `sec164PartialInputError`가 토지에 적용하는 `hasPre1990` **제외 로직은 가져오지 않는다**.
 *    그 제외는 「기존 환산 검증과 메시지가 중복되니까」라는 **표시상의 이유**이지, ②가 가목으로
 *    성립하는지와는 무관하다. 가져오면 토지 `hasPre1990` 경로에서 ②를 「미충족」으로 잘못 읽어
 *    **과잉 차단**한다(anchor X-14b).
 */
export function isSec164ClauseAFilled(asset: AssetForm): boolean {
  return (
    isFullyFilled(sec164HouseStatus(asset)) ||
    isFullyFilled(sec164CommercialStatus(asset)) ||
    isFullyFilled(sec164LandStatus(asset))
  );
}

/** ①(상증법 평가액)의 소스는 취득원인별로 다르다 — 상속은 공시가격 필드, 증여는 「증여 신고가액」. */
function clauseAReportedValue(asset: AssetForm): number {
  const raw =
    asset.acquisitionCause === "gift" ? asset.fixedAcquisitionPrice : asset.publishedValueAtInheritance;
  return parseAmount(raw ?? "");
}

/** 추계 계열(환산·감정가액·매매사례) — 「나목으로 가려는」 상태. */
function isEstimatingMode(asset: AssetForm): boolean {
  return (
    asset.useEstimatedAcquisition === true ||
    asset.isAppraisalAcquisition === true ||
    asset.isSalesCaseAcquisition === true
  );
}

/**
 * 「가목 확인 불가」 선언이 **필요한 상태**인가 — ⑤ UI와 ⑧ validate가 **공유하는 단일 술어**.
 *
 * 어긋나면 「토글은 보이는데 차단은 안 되는」(또는 그 반대) 침묵 실패가 된다
 * (memory `feedback_shared_predicate_argument_parity`).
 */
export function needsClauseADeclaration(asset: AssetForm): boolean {
  if (!isSec163_9PreDeemed(asset)) return false;
  // 증여 실거래가는 「증여 신고가액을 입력하세요」가 이미 막는다 — 여기서 앞지르면 완화가 된다.
  if (asset.acquisitionCause === "gift" && !isEstimatingMode(asset)) return false;
  if (clauseAReportedValue(asset) > 0) return false;
  if (isSec164ClauseAFilled(asset)) return false;
  return true;
}

/** 선언이 필요한데 하지 않았으면 오류 메시지, 아니면 null. */
export function clauseADeclarationError(asset: AssetForm, label: string): string | null {
  if (!needsClauseADeclaration(asset)) return null;
  if (asset.preDeemedClauseAUnconfirmed === true) return null;
  return (
    `${label}: 「소득세법」 §97①1호 단서상 환산 등 추계는 **가목(§163⑨ 평가액)을 확인할 수 없는 경우에 한정**됩니다. ` +
    `기준일 현재 상증법 평가액이나 §164④~⑦ 기준시가를 입력하거나, 「가목을 확인할 수 없음」을 선택하세요.`
  );
}

/**
 * post-deemed 상속 — ①(상증법 평가액) 또는 ②(§164⑤~⑦) **필수**.
 *
 * 「상속세 및 증여세법」 §60③: "시가를 산정하기 **어려운 경우에는** … 제61조부터 제65조까지에
 * 규정된 방법으로 평가한 가액을 시가로 **본다**" ⇒ **평가액이 「없는」 상태는 법적으로 성립하지
 * 않는다**. 따라서 법 §97①1호 단서의 「가목을 확인할 수 없는 경우」에 해당하지 않아
 * **나목(환산)에 도달하지 않는다** — pre-deemed와 달리 **갈 곳이 없다**.
 *
 * ⇒ 선언(E-1)은 여기서 **효력이 없다**. 필수 입력이다.
 *
 * ⚠️ 종전에는 **주택·토지·건물**이 통과해 취득가액 **0**으로 계산됐다(양도차익 = 양도가액 전액,
 *    경고 0건). 상가는 이미 같은 규칙으로 막고 있었다 — 그 게이트를 3종에 넓힌 것이다.
 *
 * **통과 경로는 이미 화면에 있다** — `PostDeemedInputs`의 「평가방법 선택(§60 시가 / §61~65
 * 보충적) + 보충적 평가 보조계산」이 상증법 §60③을 그대로 구현하고, 산출 결과가 ①로 동기화된다.
 *
 * 설계: docs/02-design/features/post-deemed-clause-a-required.plan.md §4
 */
export function postDeemedClauseARequiredError(asset: AssetForm, label: string): string | null {
  if (asset.acquisitionCause !== "inheritance") return null;
  const baseDate = deriveSec163_9BaseDate(asset);
  // pre-deemed는 E-1이 담당한다(그쪽은 ③이 있어 선언이 성립한다).
  if (!baseDate || baseDate < DEEMED_ACQUISITION_DATE) return null;

  /**
   * 취득가액의 실제 소스가 따로 있거나, 다른 게이트가 이미 막는 자산은 제외한다(§4.2).
   *
   * ⚠️ **제외 사유는 전부 여기 적는다.** 종전에는 화이트리스트가 3종뿐이라 나머지 5종이
   *    **말없이** 빠졌고, 그중 분양권은 **아무 게이트도 막지 않아** 취득가액 0으로 계산됐다
   *    (2026-08-09 8종 전수 실측 — 실측표는 anchor JSDoc).
   *
   * | assetKind | 막는 주체 |
   * |---|---|
   * | `housing`·`land`·`building`·**`presale_right`** | **이 함수** |
   * | 겸용주택(`isMixedUseHouse`) | `mixedAcq*` 3필드가 취득가액을 만든다 |
   * | `commercial_building` | 전용 블록이 같은 규칙으로 막는다 — 중복 차단은 메시지만 흐린다 |
   * | `redevelopment_apt`·`right_to_move_in` | §166①③④ 별도 경로. `validateRedevelopmentAsset`이 종전자산 취득가액(`redevActualAcquisitionPrice`)·환산 분모를 **필수**로 요구해 0이 되지 않는다(분기 전수 실측) |
   * | `general_building` | `transfer-tax-validate-gb.ts`가 **파트별로** ①을 요구한다. 여기서 또 막으면 토지·건물 어느 쪽이 빈지 못 알려주는 일반 메시지가 먼저 나온다 |
   *
   * 🔴 **분양권은 제외 대상이 아니다.** 그 화면에는 직접 취득가액 칸이 **없어** ①(상속세
   *    신고가액)이 **유일한 취득가액 입력 경로**다 — 비우면 대체 소스가 없다.
   */
  if (asset.isMixedUseHouse) return null;
  if (
    asset.assetKind === "commercial_building" ||
    asset.assetKind === "redevelopment_apt" ||
    asset.assetKind === "right_to_move_in" ||
    asset.assetKind === "general_building"
  ) {
    return null;
  }
  if (!["housing", "land", "building", "presale_right"].includes(asset.assetKind ?? "")) return null;

  // ⚠️ 상속의 ① 소스는 `publishedValueAtInheritance` **하나뿐**이다
  //    (`transfer-tax-api-inheritance.ts:52-54` — `fixedAcquisitionPrice`는 증여용).
  //    stale 세션에 후자가 남아 있어도 그 값은 §163⑨ 경로로 가지 않으므로 통과 사유가 아니다.
  if (parseAmount(asset.publishedValueAtInheritance ?? "") > 0) return null;
  // ②도 가목이다 — §163⑨2호 「평가한 가액과 §164⑤~⑦ 가액 **중 많은 금액**」.
  if (isSec164ClauseAFilled(asset)) return null;

  return `${label}: 상속개시일 평가액(상속세 신고가액)을 입력하세요.`;
}
