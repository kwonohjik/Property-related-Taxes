/**
 * 판정 메뉴 — 매매특약에 따른 잔금 전 주택 멸실 사실의 ⑤(칸)·④(본문)·⑧(검증) 공용 게이트와 본문 조각 (결정 #46).
 *
 * 엔진: `lib/tax-engine/one-house/demolished-before-balance.ts` · 연혁 `data/demolished-before-balance-era.ts`.
 */
import { toDate } from "@/lib/api/date-coerce";
import { isBalanceDateStatusContract } from "@/lib/tax-engine/data/demolished-before-balance-era";
import { judgmentSaleIsHousing, type OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";

type Form = Pick<
  OneHouseJudgmentFormData,
  "demolishedBeforeBalance" | "demolishedBeforeBalanceContractDate" | "transferDate" | "assets"
>;

/** 칸이 열리는가 — 양도 대상이 주택일 때만(입주권 양도에는 멸실할 주택이 없다). ⑤·④·⑧이 같은 술어를 쓴다. */
export function judgmentDemolishedVisible(form: Pick<OneHouseJudgmentFormData, "assets">): boolean {
  return judgmentSaleIsHousing(form);
}

/** 선언이 유효한가 — 칸이 열려 있고 토글이 켜졌을 때. 숨은 뒤 남은 stale 값은 보내지 않는다. */
export function judgmentDemolishedDeclared(form: Form): boolean {
  return judgmentDemolishedVisible(form) && form.demolishedBeforeBalance === true;
}

export function buildDemolishedPayload(form: Form) {
  return judgmentDemolishedDeclared(form) && form.demolishedBeforeBalanceContractDate
    ? { demolishedBeforeBalance: { contractDate: form.demolishedBeforeBalanceContractDate } }
    : {};
}

/** 매매계약일이 잔금청산일 현황 판정 대상인가(2022-12-20 이후) — ⑧ 경고가 읽는다. */
export function judgmentDemolishedStatusRuleApplies(form: Form): boolean {
  return (
    judgmentDemolishedDeclared(form) &&
    !!form.demolishedBeforeBalanceContractDate &&
    isBalanceDateStatusContract(toDate(form.demolishedBeforeBalanceContractDate, "demolishedBeforeBalanceContractDate"))
  );
}

type Issue = { field: string; message: string; severity: "error" | "warning" };

/**
 * ⑧ — 토글을 켜면 매매계약일이 필수이고 양도일(잔금청산일)보다 뒤일 수 없다. 2022-12-20 이후 계약이면 계산기 인계 경고를 더한다:
 * 판정 메뉴 전용 사실이라 계산기로 넘기면 양도 대상이 주택으로 다시 판정된다(비거주자와 같은 방식).
 */
export function demolishedFieldIssues(form: Form): Issue[] {
  if (!judgmentDemolishedDeclared(form)) return [];
  const date = form.demolishedBeforeBalanceContractDate;
  if (!date) {
    return [{
      field: "demolishedBeforeBalanceContractDate",
      severity: "error",
      message: "매매계약일을 입력하세요 — 2022.12.20. 이후 체결한 계약인지에 따라 양도물건 판정 기준일이 달라집니다.",
    }];
  }
  if (form.transferDate && date > form.transferDate) {
    return [{
      field: "demolishedBeforeBalanceContractDate",
      severity: "error",
      message: "매매계약일이 양도일(잔금청산일)보다 뒤입니다.",
    }];
  }
  if (!judgmentDemolishedStatusRuleApplies(form)) return [];
  return [{
    field: "demolishedBeforeBalance",
    severity: "warning",
    message:
      "잔금 전 멸실 특약은 이 판정에만 반영됩니다 — 양도세 계산기로 넘기면 양도 대상이 주택으로 다시 판정되니, 계산기에서는 양도 대상을 「단순토지」로 입력해 세액을 확인하세요.",
  }];
}
