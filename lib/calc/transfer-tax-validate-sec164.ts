/**
 * §164④·⑥·⑤~⑦ **부분 입력 차단** — 「하나라도 손댔으면 끝까지」.
 *
 * ②(§164④~⑦ 취득당시 기준시가)는 all-or-nothing opt-in이라 일부만 입력하면 payload가 생성되지
 * 않고 **① 단독으로 조용히 계산된다**. 그 침묵을 차단으로 바꾼다.
 *
 * ⚠️ **상속 상가 블록에서 떼어냈다** — 종전 검사는 `transfer-tax-validate-asset.ts:117`의
 *    `acquisitionCause === "inheritance"` 블록 **안**에 있어 증여 경로는 도달하지 못했다.
 *    그 블록의 조건만 넓히면 다른 검증(피상속인 취득일·상속개시일 평가액 필수)까지 증여에 걸려
 *    **오차단**되므로, §164 검사만 독립 함수로 분리해 진입부에서 호출한다.
 *
 * 계획서: docs/02-design/features/sec164-partial-input-silent-noop.plan.md §5.1.1
 */

import {
  sec164HouseStatus,
  sec164CommercialStatus,
  sec164LandStatus,
  isPartiallyFilled,
  type Sec164FieldStatus,
} from "./sec164-required-fields";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { calcStdPriceMonths } from "@/lib/tax-engine/same-adjustment-period-std-price";

function message(label: string, s: Sec164FieldStatus): string {
  return (
    `${label}: ${s.clause} 취득당시 기준시가는 ${s.total}개 항목을 **모두** 입력하거나 모두 비워두세요. ` +
    `(누락: ${s.missing.join(" · ")})`
  );
}

/**
 * 부분 입력이면 오류 메시지, 아니면 null.
 *
 * ⚠️ **토지는 `hasPre1990`(환산 모드)에서 제외**한다 — 그 경로는 기존 환산 검증
 * (`transfer-tax-validate-asset.ts:468-486`)이 같은 필드를 **필수로** 요구하므로 메시지가 중복된다.
 * 기존 메시지를 보존해 회귀를 만들지 않는다(계획서 U-3).
 */
export function sec164PartialInputError(asset: AssetForm, label: string): string | null {
  const house = sec164HouseStatus(asset);
  if (isPartiallyFilled(house)) return message(label, house);

  const commercial = sec164CommercialStatus(asset);
  if (isPartiallyFilled(commercial)) return message(label, commercial);

  // 환산 모드는 기존 검증이 담당한다(중복 방지).
  const hasPre1990 =
    (asset.pre1990Enabled ?? false) &&
    asset.assetKind === "land" &&
    !(asset.acquisitionCause === "gift" && (asset.acquisitionDate ?? "") >= "1985-01-01");
  if (!hasPre1990) {
    const land = sec164LandStatus(asset);
    if (isPartiallyFilled(land)) return message(label, land);
  }

  return null;
}

/**
 * ⑧ §164⑧ 동일조정기간 환산 — 토글 ON인데 필수 값이 비어 있으면 차단.
 *
 * ⚠️ **④ API 변환과 같은 fallback을 쓴다**(`buildSameAdjustmentPeriodInput`):
 *   · 조정월수 미입력 → 엔진 기본 12. **여기서 차단하지 않는다** —
 *     ④가 통과시키는 값을 ⑧이 막으면 「UI 통과 ↔ validate 차단」 모순이 된다.
 *   · 산식이 요구하는 상대 기준시가는 **필수** — 없으면 ④가 객체를 만들지 않아
 *     토글만 켜고 아무 일도 일어나지 않는 침묵 no-op이 된다. 그 침묵을 차단으로 바꾼다.
 */
export function sameAdjustmentPeriodError(
  asset: AssetForm,
  label: string,
  transferDate?: string,
): string | null {
  if (!asset.sapEnabled) return null;

  /**
   * 🔴 **겸용주택·부담부증여는 아직 도달하지 않는다 — 침묵 대신 차단한다.**
   *
   * 두 경로는 `calculateTransferTax`의 STEP 0.47을 타지 않는다:
   *   · 겸용주택   `calcMixedUseTransferTax`가 **별도 진입점**이다(route.ts:392).
   *   · 부담부증여 안분은 `landStdPriceAtTransfer`·`buildingStdPriceAtTransfer`라는
   *     **다른 필드**를 쓴다 — 자산-수준 `standardPriceAtTransfer` 치환이 닿지 않는다.
   *
   * 두 경로 모두 §80⑤ 후단(*"토지와 건물 기준시가 조정월수가 서로 다른 경우에는 각각
   * 계산하여 합한 금액으로 한다"*)에 따라 **부분별 전기 기준시가·조정월수**가 필요한데,
   * 현재 입력 모델은 자산당 1쌍뿐이다. 한 쌍을 양쪽에 쓰면 조용히 틀린 세액이 나온다.
   *
   * ⇒ 입력 모델을 부분 축으로 확장하기 전까지는 **차단**한다. 토글이 켜졌는데 아무 일도
   *   일어나지 않는 것보다, 왜 안 되는지 알려주는 편이 낫다.
   */
  if (asset.isMixedUseHouse) {
    return (
      `${label}: 겸용주택은 주택분·상가분의 기준시가 조정월수가 서로 다를 수 있어 ` +
      `부분별 전기 기준시가가 필요합니다(소득세법 시행규칙 §80⑤ 후단). ` +
      `현재는 지원하지 않으니 「동일조정기간 양도당시 기준시가 환산」을 꺼주세요.`
    );
  }
  if (asset.transferType === "burdened_gift") {
    return (
      `${label}: 부담부증여는 토지·건물 기준시가를 나누어 안분하므로 부분별 전기 기준시가가 ` +
      `필요합니다(소득세법 시행규칙 §80⑤ 후단). 현재는 지원하지 않으니 ` +
      `「동일조정기간 양도당시 기준시가 환산」을 꺼주세요.`
    );
  }

  const formula = asset.sapFormula ?? "prev";

  /**
   * §80③ 대체 산정 — 피연산자가 덜 채워지면 ⑤가 「전기의 기준시가」를 비운 채로 두고,
   * ④는 그 빈 값을 보고 `sameAdjustmentPeriod`를 아예 보내지 않는다(침묵 no-op).
   * 아래 「전기의 기준시가가 필요합니다」보다 **먼저** 사유를 특정해 말한다.
   */
  if (formula === "prev") {
    const basis = asset.sapPriorBasis ?? "direct";
    if (
      basis === "first_notice_rate" &&
      !(parseAmount(asset.sapFirstNoticeStdPrice ?? "") > 0 &&
        parseFloat((asset.sapNoticeBaseRate ?? "").replace(/,/g, "")) > 0)
    ) {
      return (
        `${label}: 전기의 기준시가를 「최초고시 × 기준율」로 산정하려면 ` +
        `국세청장이 최초로 고시한 기준시가와 고시 기준율을 모두 입력하세요` +
        `(소득세법 시행규칙 §80③2호).`
      );
    }
    if (
      basis === "ratio_conversion" &&
      !(parseAmount(asset.standardPriceAtAcq ?? "") > 0 &&
        parseAmount(asset.sapPriorLandBuildingSum ?? "") > 0 &&
        parseAmount(asset.sapAcqLandBuildingSum ?? "") > 0)
    ) {
      return (
        `${label}: 전기의 기준시가를 「합계액 비율환산」으로 산정하려면 취득당시 기준시가와 ` +
        `전기·취득당시의 토지·건물 기준시가 합계액이 모두 필요합니다` +
        `(소득세법 시행규칙 §80③3호).`
      );
    }
  }

  const raw = formula === "prev" ? asset.sapPriorStdPrice : asset.sapNewStdPrice;
  if (!raw || parseAmount(raw) <= 0) {
    return formula === "prev"
      ? `${label}: 동일조정기간 환산(소득세법 시행규칙 §80①1호가목)에는 전기의 기준시가가 필요합니다.`
      : `${label}: 동일조정기간 환산(소득세법 시행규칙 §80①1호나목)에는 새로운 기준시가가 필요합니다.`;
  }

  // 나목 요건 검증 — 보유월수가 조정월수를 넘으면 「양도일+2월 내 새 고시」 전제가 깨진 것이다.
  // 그대로 계산하면 양도당시 기준시가가 새 기준시가를 넘어서 세액이 과대해진다.
  if (formula === "new" && asset.acquisitionDate && transferDate) {
    const months = calcStdPriceMonths(
      new Date(`${asset.acquisitionDate}T00:00:00`),
      new Date(`${transferDate}T00:00:00`),
    );
    const adj = asset.sapAdjustMonths
      ? Number(asset.sapAdjustMonths.replace(/,/g, ""))
      : 12;
    if (months > 0 && adj > 0 && months > adj) {
      return (
        `${label}: 보유기간 월수(${months})가 기준시가 조정월수(${adj})보다 큽니다. ` +
        `제2산식(소득세법 시행규칙 §80①1호나목)은 「양도일부터 2월이 되는 날이 속하는 월의 말일까지 ` +
        `새로운 기준시가가 고시된 경우」가 전제이므로 이 조합은 성립하지 않습니다. ` +
        `조정월수를 확인하거나 제1산식(가목)을 선택하세요.`
      );
    }
  }

  // 조정월수는 선택 입력이지만, 넣었다면 양수여야 한다(0·음수는 나눗셈이 성립하지 않는다).
  if (asset.sapAdjustMonths) {
    const months = Number(asset.sapAdjustMonths.replace(/,/g, ""));
    if (!Number.isFinite(months) || months <= 0) {
      return `${label}: 기준시가 조정월수는 1개월 이상이어야 합니다 (소득세법 시행규칙 §80②1호).`;
    }
  }

  return null;
}
