/**
 * ⑧ 조특법 §99의4·§98의9 — 주택 수 제외 선언의 **필수값** (계산기·판정 메뉴 공용 leaf, OH-28).
 *
 * 취득일·기준시가(§99의4) / 취득일·취득가·전용면적(§98의9)은 엔진이 「미입력 = 불성립」으로 읽는
 * 값이라, 비워 둔 채 선언하면 화면은 켰는데 판정에는 닿지 않는다. 소재지·연접·확인 토글은 막지
 * 않는다 — 엔진이 불성립 사유로 안내한다(낙관 입력 패턴).
 *
 * 🔑 계산기(`transfer-tax-validate-reductions.ts`)와 판정 메뉴(`one-house-exemption-validate.ts`)가
 *    **같은 함수**를 부른다 — 두 벌이면 한쪽만 개정 반영된다.
 */
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { parseDecimal } from "@/components/calc/inputs/DecimalInput";
import type { AssetReductionForm } from "@/lib/stores/calc-wizard-asset";

export function collectHouseCountExclusionReductionErrors(r: AssetReductionForm): string[] {
  const errors: string[] = [];
  if (r.type === "new_99_4_rural" || r.type === "new_99_4_hometown") {
    const isRural = r.type === "new_99_4_rural";
    const label994 = isRural ? "§99의4 농어촌주택" : "§99의4 고향주택";
    if (!r.ruralHouseAcquisitionDate)
      errors.push(`${label994} 적용: ${isRural ? "농어촌주택" : "고향주택"} 취득일을 입력하세요.`);
    if (parseAmount(r.ruralHouseStdPrice || "0") <= 0)
      errors.push(`${label994} 적용: 취득 당시 기준시가 합계(주택+부속토지)를 입력하세요.`);
  }
  if (r.type === "unsold_98_9") {
    if (!r.unsoldHouseAcquisitionDate) errors.push("§98의9 적용: 준공후미분양주택 취득일을 입력하세요.");
    if (parseAmount(r.unsoldHouseAcquisitionPrice || "0") <= 0)
      errors.push("§98의9 적용: 준공후미분양주택 취득가액을 입력하세요.");
    if (!(parseDecimal(r.unsoldHouseExclusiveArea || "") > 0))
      errors.push("§98의9 적용: 준공후미분양주택 전용면적(㎡)을 입력하세요.");
  }
  return errors;
}
