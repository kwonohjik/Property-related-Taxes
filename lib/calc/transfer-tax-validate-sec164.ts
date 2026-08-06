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
