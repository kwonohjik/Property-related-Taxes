/**
 * 「조정대상지역 판정 — 확인 필요」 고지 문구 — 결과 화면(`RegulatedAreaAssumptionLine`)과 PDF(`ResultPdfDocument`)가 같은 문구를 쓴다.
 * 값은 ④와 같은 leaf(`regulatedAddressAssumptions`)에서 온다. 계획서 `docs/00-pm/regulated-area-notices-followup.plan.md`.
 */
import {
  regulatedAddressAssumptions,
  type RegulatedAddressAssumption,
  type RegulatedFlagsForm,
} from "./effective-regulated-at-acquisition";
import type { TransferFormData } from "@/lib/stores/calc-wizard-form.types";

export const REGULATED_ASSUMPTION_TITLE = "조정대상지역 판정 — 확인 필요";

const WHICH_LABEL = { transfer: "양도일", acquisition: "취득 당시" } as const;

/** 「직접 선택」 칸이 있는 곳 — 계산기는 「보유 상황」, 판정 메뉴는 「② 양도 대상 주택」. */
export type RegulatedAssumptionSelectWhere = "calculator" | "judgment";

const SELECT_WHERE_LABEL: Record<RegulatedAssumptionSelectWhere, string> = {
  calculator: "「보유 상황」",
  judgment: "「② 양도 대상 주택」",
};

/** 줄 앞부분 — 「양도일(2026-06-01)」 */
export function regulatedAssumptionRowHead(r: RegulatedAddressAssumption): string {
  return `${WHICH_LABEL[r.which]}(${r.dateLabel ? `${r.dateLabel} ` : ""}${r.date})`;
}

/** 줄 판정 부분 — 「조정대상지역으로 보고 계산」 */
export function regulatedAssumptionRowVerdict(r: RegulatedAddressAssumption): string {
  return r.isRegulated ? "조정대상지역으로 보고 계산" : "조정대상지역 아님으로 계산";
}

/**
 * 끝 줄(할 일) — 줄을 넘기면, 직접 선택할 칸이 없는 줄(`selectable: false` — 입주권)뿐일 때 존재하지 않는 칸을 가리키지 않는다.
 * `selectable`이 없는 줄(이 필드가 생기기 전 이력 데이터)은 종전대로 칸이 있는 것으로 읽는다.
 */
export function regulatedAssumptionFooter(
  where: RegulatedAssumptionSelectWhere = "calculator",
  rows?: readonly Pick<RegulatedAddressAssumption, "selectable">[],
): string {
  const lookup = "소재지 주소만으로 판정했습니다. 주소검색으로 소재지를 고르면 법정동코드로 동 단위까지 판정합니다.";
  if (rows && rows.length > 0 && rows.every((r) => r.selectable === false)) return lookup;
  return `${lookup} 또는 ${SELECT_WHERE_LABEL[where]}에서 조정대상지역 여부를 직접 선택하세요.`;
}

/** PDF에 싣는 고지 묶음 — 건(다건은 건마다 label)별 줄. 화면 줄과 같은 leaf다. */
export type RegulatedAssumptionPdfGroup = { label?: string; rows: RegulatedAddressAssumption[] };

/**
 * PDF 입력(`inputData.regulatedAreaAssumptions`)을 만든다 — 줄이 없는 건은 뺀다. 화면 줄이 `PrintSection` 밖이라 항상 인쇄되듯,
 * PDF도 항목 선택과 무관하게 싣는다.
 */
export function regulatedAssumptionPdfGroups(
  items: { form: (RegulatedFlagsForm & Pick<TransferFormData, "regionCode">) | null | undefined; label?: string }[],
): RegulatedAssumptionPdfGroup[] {
  return items
    .map(({ form, label }) => ({ label, rows: form ? regulatedAddressAssumptions(form) : [] }))
    .filter((g) => g.rows.length > 0);
}
