/**
 * ⑧ 이월과세 × 당초 증여 때 인수한 채무 — 필수·상한·미지원 차단 (공용 leaf).
 *
 * `assumedDebtIssue`는 일반건물 이월과세(`transfer-tax-validate-gb-carryover.ts`)가 쓰던 함수를 옮긴 것이다 — 메시지가 두 벌이면 한쪽만 고쳐진다.
 * `validateCarryoverDebt`는 E1(주택·토지·상업용건물 단건·함께 양도)의 조각 규칙 입력을 본다. 같은 규칙을 ⑫(`refineCarryoverTaxation`)가 와이어에서 한다.
 * 노출·전송·필수·차단이 읽는 술어는 `carryoverPurchasedPartScope` **하나**다(3중 패턴).
 */
import { parseAmount } from "@/lib/calc/number-parse";
import { fieldError } from "./transfer-tax-validate-field";
import { carryoverPurchasedPartScope } from "./carryover-gift-assumed-debt";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { CarryoverTaxationForm } from "@/lib/stores/calc-wizard-asset-carryover";

/**
 * 당초 증여 때 인수한 채무 — 사건 토글(`event.giftDebtAssumed`)이 켜졌으면 그 파트 칸이 필수이고 평가액 이하다.
 * 영 §163의2②2호 분자 = 평가액 − 채무(④ `carryoverAssumedDebt`와 같은 술어 · 계획서 `carryover-gift-tax-numerator-net.plan.md` §4.3). 앵커는 리터럴 삼항.
 */
export function assumedDebtIssue(event: CarryoverTaxationForm | undefined, part: CarryoverTaxationForm | undefined, label: string, onBuilding: boolean): string | null {
  if (!event?.giftDebtAssumed) return null;
  if ((part?.giftAssumedDebt ?? "").trim() === "")
    return fieldError(onBuilding ? "buildingCarryover.giftAssumedDebt" : "carryover.giftAssumedDebt", `${label}: 당초 증여 때 인수한 채무를 입력하세요 — 증여세 과세가액에서 빠진 그 자산의 채무입니다. 없으면 0을 입력하세요 (「상속세 및 증여세법」 제47조 제1항).`);
  if (parseAmount(part?.giftAssumedDebt ?? "") > parseAmount(part?.giftDateValuation ?? ""))
    return fieldError(onBuilding ? "buildingCarryover.giftAssumedDebt" : "carryover.giftAssumedDebt", `${label}: 당초 증여 때 인수한 채무가 증여 당시 평가액보다 큽니다.`);
  return null;
}

/** E1 — scope=apply ∧ 토글 ON이면 채무 칸 필수·상한·r = 1 규칙. scope=unsupported ∧ 토글 ON이면 토글을 끄게 막는다. 그 밖은 null. */
export function validateCarryoverDebt(
  asset: AssetForm,
  label: string,
  formTransferDate: string | undefined,
  opts?: { isNonPrimary?: boolean },
): string | null {
  const c = asset.carryover;
  if (!c?.giftDebtAssumed) return null;
  const scope = carryoverPurchasedPartScope(asset, opts);
  if (scope.kind === "unsupported")
    return fieldError("carryover.giftDebtAssumed", `${label}: 이 자산(${scope.reason})에서는 당초 증여 때 인수한 채무 부분을 시나리오 A에서 나누어 계산하지 못합니다 — «당초 증여 때 채무를 인수했다»를 끄세요. 채무를 뺀 과세가액 기준으로 계산한 금액은 «증여세 상당액»에 입력합니다.`);
  if (scope.kind !== "apply") return null;
  const base = assumedDebtIssue(c, c, label, false);
  if (base) return base;
  // 채무 = 평가액(r = 1)이면 증여받은 부분이 없다 — 증여세 상당액·증여자 자본적지출을 적용할 곳이 없어 조용히 버리지 않고 막는다.
  const debt = parseAmount(c.giftAssumedDebt);
  if (debt > 0 && debt === parseAmount(c.giftDateValuation)) {
    if (parseAmount(c.giftTaxAmount) > 0)
      return fieldError("carryover.giftTaxAmount", `${label}: 당초 증여 때 인수한 채무가 증여 당시 평가액과 같으면 증여받은 부분이 없어 증여세 상당액을 적용할 곳이 없습니다(「소득세법」 제97조의2 제1항 제3호) — 이 칸을 비우세요.`);
    // 증여자 자본적지출은 ④가 2024.1.1. 이후 양도분만 싣는다(같은 기준으로만 막는다).
    if ((formTransferDate ?? "") >= "2024-01-01" && parseAmount(c.donorCapitalExpenditure) > 0)
      return fieldError("carryover.donorCapitalExpenditure", `${label}: 당초 증여 때 인수한 채무가 증여 당시 평가액과 같으면 증여받은 부분이 없어 증여자 자본적지출을 적용할 곳이 없습니다(「소득세법」 제97조의2 제1항 제2호) — 이 칸을 비우세요.`);
  }
  return null;
}
