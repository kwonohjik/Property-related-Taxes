/**
 * ⑧ 조특법 §99의4·§98의9 — 주택 수 제외 선언의 **필수값** (계산기·판정 메뉴 공용 leaf, OH-28).
 *
 * 취득일·기준시가(§99의4) / 취득일·취득가·전용면적(§98의9)은 엔진이 「미입력 = 불성립」으로 읽는
 * 값이라, 비워 둔 채 선언하면 화면은 켰는데 판정에는 닿지 않는다. 소재지·고향 확인 토글은 막지
 * 않는다 — 엔진이 불성립 사유로 안내한다(낙관 입력 패턴).
 *
 * §99의4 추가 필수값(엔진은 미입력을 「불성립 + 확인 필요」로 읽는다 — 직접 API·옛 이력):
 * - ③ 연접 여부 예/아니오/모름 (리뷰 NH-30 · Q-13 — 기본값 없음)
 * - 종전 면적 요건 범위 안(대지 2021.1.1. 전 양도 · 주택 2017.1.1. 전 양도)의 대지면적·주택 유형·면적 (NH-05 PR-2b · Q-8 (a))
 * - 수도권 행 모순: 행 법정동코드가 예외 아닌 수도권인데 소재지 요건을 켰으면 막는다 (NH-20 · Q-7 (b)) — ⑫와 같은 함수
 *
 * 🔑 계산기(`transfer-tax-validate-reductions.ts`)와 판정 메뉴(`one-house-exemption-validate.ts`)가
 *    **같은 함수**를 부른다 — 두 벌이면 한쪽만 개정 반영된다.
 */
import { parseAmount } from "@/lib/calc/number-parse";
import { parseDecimal } from "@/lib/calc/number-parse";
import type { AssetReductionForm } from "@/lib/stores/calc-wizard-asset";
import type { SpecialHouseExclusionFormItem } from "@/lib/stores/calc-wizard-asset-reduction";
import { usesContractDateOnly, usesRentalStartDate } from "@/lib/tax-engine/transfer-reductions/unsold-hybrid-p5";
import { new994CapitalRegionConflict } from "@/lib/tax-engine/transfer-reductions/new-99-4-size";
import { resolveNew994SizeScope } from "@/lib/tax-engine/transfer-reductions/new-99-4-size";
import { new994AdjacentAnswer } from "./new-99-4-form";
import { toOptionalDate } from "@/lib/api/date-coerce";

export function collectHouseCountExclusionReductionErrors(
  r: AssetReductionForm,
  /** 양도일 — 면적 요건 범위·수도권 예외 지역 시기를 가른다. 빠뜨린 호출부를 컴파일러가 찾도록 필수(값은 비어도 된다) */
  transferDate: string | undefined,
): string[] {
  const errors: string[] = [];
  if (r.type === "new_99_4_rural" || r.type === "new_99_4_hometown") {
    const isRural = r.type === "new_99_4_rural";
    const label994 = isRural ? "§99의4 농어촌주택" : "§99의4 고향주택";
    if (!r.ruralHouseAcquisitionDate)
      errors.push(`${label994} 적용: ${isRural ? "농어촌주택" : "고향주택"} 취득일을 입력하세요.`);
    if (parseAmount(r.ruralHouseStdPrice || "0") <= 0)
      errors.push(`${label994} 적용: 취득 당시 기준시가 합계(주택+부속토지)를 입력하세요.`);
    if (!new994AdjacentAnswer(r))
      errors.push(
        `${label994} 적용: 일반주택과 행정구역상 같거나 연접한 지역에 있는지(예·아니오·모름) 선택하세요 (조특법 §99의4③).`,
      );
    const transfer = toOptionalDate(transferDate);
    const acquired = toOptionalDate(r.ruralHouseAcquisitionDate);
    const scope = resolveNew994SizeScope({ transferDate: transfer, ruralHouseAcquisitionDate: acquired });
    if (scope.land && !(parseDecimal(r.ruralLandAreaSqm994 || "") > 0))
      errors.push(`${label994} 적용: 2021.1.1. 전 양도분은 대지면적(660㎡ 이내 요건)을 입력하세요.`);
    if (scope.house) {
      if (!r.ruralHouseType994)
        errors.push(`${label994} 적용: 2017.1.1. 전 양도분은 주택 유형(공동주택·그 밖의 주택)을 선택하세요 — 면적 기준이 다릅니다.`);
      else if (r.ruralHouseType994 === "multi_unit" && !(parseDecimal(r.ruralHouseExclusiveAreaSqm994 || "") > 0))
        errors.push(`${label994} 적용: 공동주택 전용면적(116㎡ 이내 요건)을 이 주택의 기본 정보 「전용면적」에 입력하세요.`);
      else if (r.ruralHouseType994 === "other" && !(parseDecimal(r.ruralHouseFloorAreaSqm994 || "") > 0))
        errors.push(`${label994} 적용: 주택 연면적(150㎡ 이내 요건)을 입력하세요.`);
    }
    const conflict = new994CapitalRegionConflict({
      isHometown: !isRural,
      meetsLocationRequirement: r.meetsLocationRequirement,
      regionCode: r.ruralHouseRegionCode,
      transferDate: transfer,
      ruralHouseAcquisitionDate: acquired,
    });
    if (conflict) errors.push(`${label994} 적용: ${conflict}`);
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

/**
 * 명부 행 ⑥ 「감면주택」(`special`) 선언의 필수값 — 계산기·판정 메뉴 공용 leaf.
 *
 * 조문 미선택 · §97·§97의2 임대개시일 미입력 · §98의8·§99의2 매매계약일 미입력(엔진이 「미입력 = 불성립」으로
 * 읽는다 — 비워 두면 조용히 다른 경로(일시적 2주택 등)로 판정된다). 본 요건 확인 토글은
 * 막지 않는다 — 엔진이 불성립 사유로 안내한다(낙관 입력 패턴).
 */
export function collectSpecialHouseExclusionRowErrors(e: SpecialHouseExclusionFormItem): string[] {
  if (!e.article) return ["주택 수 제외 — 감면주택의 적용 조문을 선택하세요."];
  if (usesRentalStartDate(e.article) && !e.houseRentalStartDate) {
    return ["주택 수 제외 — 임대주택의 임대개시일을 입력하세요."];
  }
  if (usesContractDateOnly(e.article) && !e.houseContractDate) {
    return ["주택 수 제외 — 이 조문은 감면주택의 최초 매매계약일로 판정합니다. 매매계약일을 입력하세요."];
  }
  return [];
}
