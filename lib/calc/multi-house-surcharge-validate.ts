/**
 * ⑧ 다주택 중과 판정 메뉴 단계별 검증 (계획서 `multi-house-surcharge-judgment-menu.plan.md` §5.9 · P6a).
 *
 * = 1주택 판정 메뉴의 단계 검증 **전부** + 중과 축.
 *
 * 🔑 1주택 검증을 덜어 내지 않는다(계획서 초판 §5.9 「단계별 규칙을 골라 조합」 정정). 그 오류는 대부분 ⑫ refine의 거울
 *    (같은 `propertySchema`라 중과 route도 같은 조건으로 400을 낸다)이거나 결과에 함께 싣는 1세대1주택 비과세 요약(D3a)이
 *    틀려지는 입력이다. 경고는 진행을 막지 않는다.
 *
 * 중과 축은 계산기 ⑧과 **같은 leaf**(`transfer-tax-validate-surcharge-axis.ts`)를 부르고, 게이트는 ⑤ 위젯과 같은 술어다:
 * - 명부 행: `houseRowSurchargeAxisIssue` — 1주택 검증이 그 행에 이미 오류를 냈으면 더하지 않는다(계산기와 같은 「행별 첫 오류 1건」).
 *   가액기준 행의 기준시가(`houseRowIsValueCriteria`) — 비우면 엔진이 0을 3억 이하로 읽는다.
 * - 양도 주택: M1 양도 당시 기준시가(`sellingTransferStdPriceRequired`) · 자체 배제 특례 · 공고 전 매매계약
 * - 한시 유예 나·다목: `collectGracePeriodIssues` — 판정 폼엔 주택 수 스칼라가 없어 파생 폼으로(④ 전송과 같은 게이트)
 */
import { parseAmount } from "@/lib/calc/number-parse";
import {
  validateStepByIndex as validateOneHouseStepByIndex,
  type OneHouseJudgmentValidationError,
} from "./one-house-exemption-validate";
import {
  collectGracePeriodIssues,
  collectSellingHouseSurchargeIssues,
  houseRowSurchargeAxisIssue,
} from "./transfer-tax-validate-surcharge-axis";
import { houseRowIsValueCriteria, sellingTransferStdPriceRequired } from "./surcharge-price-criteria";
import { withDerivedHouseCount, type OneHouseJudgmentFormData } from "@/lib/stores/one-house-judgment-form.types";

type Errors = OneHouseJudgmentValidationError[];

const err = (field: string, message: string): OneHouseJudgmentValidationError => ({ field, message, severity: "error" });

/** ② 양도 대상 — M1 */
function surchargeSaleIssues(form: OneHouseJudgmentFormData): Errors {
  if (!sellingTransferStdPriceRequired(form) || parseAmount(form.assets[0].standardPriceAtTransfer) > 0) return [];
  return [
    err(
      "standardPriceAtTransfer",
      "양도 대상 주택의 양도 당시 기준시가를 입력하세요 — 가액기준 지역이라 3억원 이하면 주택 수에서 빠집니다(소득세법 시행령 §167의3①1호).",
    ),
  ];
}

/** ③ 보유 주택·권리 — 행 중과 축 · 양도 주택 자체 배제 · 한시 유예 */
function surchargeRosterIssues(form: OneHouseJudgmentFormData, oneHouse: Errors): Errors {
  const out: Errors = [];
  const rowsWithError = new Set(
    oneHouse.filter((e) => e.severity === "error" && e.field.startsWith("houses.")).map((e) => e.field.split(".")[1]),
  );
  form.houses?.forEach((h, i) => {
    if (!h.acquisitionDate || rowsWithError.has(String(i))) return;
    const label = `보유 주택 ${i + 1}`;
    if (houseRowIsValueCriteria(h) && parseAmount(h.officialPrice) <= 0) {
      out.push(
        err(
          `houses.${i}.officialPrice`,
          `${label}: 가액기준 지역 주택이면 기준시가(공시가격)를 입력하세요 — 3억원 이하면 주택 수에서 빠집니다(소득세법 시행령 §167의3①1호).`,
        ),
      );
      return;
    }
    // §155⑧ 「각각 1개씩」 둘째 행은 1주택 검증이 그 행의 오류로 이미 막아 위에서 걸러진다 — 사슬 인자는 비운다.
    const issue = houseRowSurchargeAxisIssue(h, label, form.transferDate, undefined);
    if (issue) out.push(err(`houses.${i}`, issue));
  });
  for (const issue of collectSellingHouseSurchargeIssues(form)) out.push(err(issue.field ?? "sellingHouseExclusion", issue.message));
  for (const issue of collectGracePeriodIssues(withDerivedHouseCount(form))) out.push(err(issue.field ?? "gracePeriod", issue.message));
  return out;
}

/** 화면 인덱스 → 그 단계의 검증. 인덱스는 1주택 판정 메뉴와 같다(0 세대 · 1 양도 대상 · 2 보유 주택). */
export function validateSurchargeStepByIndex(form: OneHouseJudgmentFormData, step: number): Errors {
  const oneHouse = validateOneHouseStepByIndex(form, step);
  if (step === 1) return [...oneHouse, ...surchargeSaleIssues(form)];
  if (step === 2) return [...oneHouse, ...surchargeRosterIssues(form, oneHouse)];
  return oneHouse;
}

export function getSurchargeStepErrorCount(form: OneHouseJudgmentFormData, step: number): number {
  return validateSurchargeStepByIndex(form, step).filter((e) => e.severity === "error").length;
}

export function getSurchargeStepWarningCount(form: OneHouseJudgmentFormData, step: number): number {
  return validateSurchargeStepByIndex(form, step).filter((e) => e.severity === "warning").length;
}

export function validateAllSurchargeSteps(form: OneHouseJudgmentFormData): Errors {
  return [0, 1, 2].flatMap((step) => validateSurchargeStepByIndex(form, step));
}
