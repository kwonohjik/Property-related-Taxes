/**
 * 원조합원 **입주권 양도**의 §99·§99의3 차감 기초 — 「당초 취득한 신축주택에 대한 양도소득 범위」 (리뷰 NH-11 · 사용자 결정 Q-21 a: 인가 전 기초식).
 *
 * 감면 신축주택이 재개발로 조합원입주권이 되어 그 입주권을 양도하면 감면은 **당초 취득한 신축주택에 대한 양도소득 범위 안**에서만
 * 적용된다(기획재정부 재산세제과-694(2009.4.2.) · 사전-2021-법령해석재산-1339(2021.11.18.)이 같은 회신을 인용). 그 범위를
 * 「관리처분계획 인가 전 양도소득금액」(소득세법 시행령 §166 인가 전 양도차익 − 그 장기보유특별공제)으로 한다 — 인가 후 권리 가치 상승분과
 * 청산금 납부분은 신축주택에서 생긴 소득이 아니다. 그 기초에 5년 이내 전액 · 5년 후 기준시가 안분을 그대로 적용한다.
 *
 * 승계조합원(인가일 뒤 승계)은 신축주택을 보유한 적이 없어 해당하지 않는다(§99의3은 취득 원인 게이트가 먼저 막는다).
 */
import type { IncomeDeductionResolution } from "./income-deduction-router";
import type { RedevelopmentInfo, RedevelopmentResult } from "../types/transfer-redevelopment.types";

/** 「당초 신축주택 양도소득 범위」 해석 — 화면·결과 고지에 함께 쓴다 */
export const RIGHT_BASE_RULINGS = "기획재정부 재산세제과-694(2009.4.2.) · 사전-2021-법령해석재산-1339(2021.11.18.)";

const NEW_HOUSE_IDS = ["new_99_3", "new_99"] as const;
/** 차감형 감면 id — 이 중 §99·§99의3만 골랐을 때만 기초를 바꾼다(다른 차감형은 입주권 전체 양도소득금액 그대로). */
const OTHER_INCOME_DEDUCTION_IDS = [
  "unsold_98_8", "unsold_98_7", "unsold_99_2", "unsold_98_3", "unsold_98_5", "unsold_98_6", "unsold_98_2", "unsold_98_4", "unsold_98",
];

export interface RightDeductionBase {
  /** 차감 기초 = 인가 전 양도소득금액 */
  base: number;
  /** 입주권 양도소득금액 전체 */
  totalIncome: number;
}

export function newHouseDeductionBase(
  redev: Pick<RedevelopmentInfo, "subject" | "isSuccessorMember">,
  result: Pick<RedevelopmentResult, "preApproval" | "total">,
  reductions: ReadonlyArray<{ type: string }> | undefined,
): RightDeductionBase | undefined {
  if (redev.subject !== "right" || redev.isSuccessorMember === true) return undefined;
  const types = (reductions ?? []).map((r) => r.type);
  if (!types.some((t) => (NEW_HOUSE_IDS as readonly string[]).includes(t))) return undefined;
  if (types.some((t) => OTHER_INCOME_DEDUCTION_IDS.includes(t))) return undefined;
  // 「범위 내」 — 인가 후 차익이 음수(청산금 납부 후 손실)면 입주권 전체 양도소득금액이 더 작다. 그때는 전체가 상한이다.
  const totalIncome = result.total.taxableIncome;
  return {
    base: Math.max(0, Math.min(result.preApproval.gain - result.preApproval.lthd, totalIncome)),
    totalIncome,
  };
}

/** 적용된 §99·§99의3 상세에 차감 기초를 제한했다는 고지를 붙인다(세액은 바꾸지 않는다). */
export function attachRightBaseNotice(resolution: IncomeDeductionResolution, b: RightDeductionBase): void {
  const detail = resolution.new993Detail ?? resolution.new99Detail;
  // 기초가 전체와 같으면(인가 후 차익 ≤ 0) 제한이 세액을 바꾸지 않았다 — 고지하지 않는다
  if (!detail || !detail.isEligible || b.base >= b.totalIncome) return;
  const notice =
    `조합원입주권 양도 — 감면은 당초 취득한 신축주택에 대한 양도소득 범위에서만 적용되므로, 관리처분계획 인가 전 양도소득금액 ` +
    `${b.base.toLocaleString()}을 기초로 계산했습니다. 입주권 양도소득금액 ${b.totalIncome.toLocaleString()} 중 인가 후 권리 가치 상승분과 ` +
    `청산금 납부분 ${Math.max(0, b.totalIncome - b.base).toLocaleString()}은 감면 대상이 아닙니다 (${RIGHT_BASE_RULINGS}).`;
  detail.warnings = [...(detail.warnings ?? []), notice];
}
