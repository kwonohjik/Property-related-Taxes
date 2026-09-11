/**
 * statement-table-types — 순손익·순자산 계산서 «행 기반 표» 공용 타입.
 *
 * 계획서: docs/00-pm/post-listing-statement-table-layout.plan.md §4.3
 *
 * 🔑 **타입을 별도 파일에 두는 이유**: `StatementTable`이 `StatementRow`를 import하고
 *    `StatementRow`가 타입을 다시 `StatementTable`에서 가져오면 순환이 된다.
 *    [[feedback_800line_split_playbook]]
 */

import type React from "react";
import type { StockTransferFormData } from "@/lib/stores/calc-wizard-stock-store";

/** 폼 키 접미사 — `PostListingNetIncomeStatement`의 `Column`과 같은 축 */
export type StatementColumn = "Listing" | "Acq" | "EUTransfer" | "EUAcq";

/**
 * 표의 «열» 하나. 열 수는 1 또는 2다 — 계획서 §4.2.2.
 *
 * ⚠️ 2열 고정이 아니다: `mode="listing_only"` · `acqFaceValueOnly` 분기에서 1열이 된다.
 */
export interface StatementColumnSpec {
  col: StatementColumn;
  /** 열 헤더 1행 — 예: "상장일 직전 사업연도" */
  label: string;
  /** 열 헤더 2행 — 사업연도(예: "2008"). 미입력이면 헤더 2행을 렌더하지 않는다. */
  fiscalYear?: string;
  /** 사업연도 입력 변경. 미지정이면 읽기 전용(연도 입력 비노출). */
  onFiscalYearChange?: (v: string) => void;
}

/** 좌측 `rowSpan` 그룹 라벨 — 이미지 7의 「소득에 가산할 금액」 세로 병합 셀 */
export interface StatementGroupCell {
  label: string;
  rowSpan: number;
}

/** 입력 행 하나 */
export interface StatementInputRow {
  kind: "input";
  /** 폼 키 prefix — 실제 키는 `${keyPrefix}${col}` (예: niAddRow1 + Listing) */
  keyPrefix: string;
  /** 표시 번호 — 예: "1." (번호 없는 행은 생략) */
  num?: string;
  label: string;
  /** 라벨 아래 보조 줄 — 폐지된 `FieldCard` hint의 대체 자리 (계획서 §4.3.1) */
  description?: string;
  /** 음수(결손·△유보) 입력 허용 */
  signed?: boolean;
  /** 입력 불가 행 — 이미지 7의 「비업무용토지 취득세 (현행 삭제)」 회색 행 */
  disabled?: boolean;
  /** 이 행부터 시작하는 그룹 셀 (그룹의 첫 행에만 지정) */
  groupCell?: StatementGroupCell;
  /**
   * 앞선 행의 `groupCell` `rowSpan`에 «덮이는» 행인가.
   *
   * 그룹의 둘째 행부터 `true`. 그룹 첫 행은 `groupCell`을 갖고, 그룹 밖 행은 둘 다 없어
   * 라벨 셀이 2열을 덮는다(`StatementRow`의 `labelColSpan`).
   */
  inGroup?: boolean;
  /** 소수 입력(환원율 %) — 기본은 금액(원) */
  decimal?: boolean;
  /** 입력 단위 표기 — 헤더에 단위가 없을 때만 */
  unit?: string;
}

/** 계산(읽기 전용) 행 하나 */
export interface StatementCalcRowSpec {
  kind: "calc";
  num?: string;
  /**
   * 행 라벨.
   *
   * 🔑 **`ReactNode`인 이유** — 나눗셈은 리터럴 `÷`가 아니라 `<Frac>`으로 쓴다
   *    (`__tests__/components/literal-division-render.test.ts` 래칫 게이트).
   *    입력 행(`StatementInputRow.label`)은 `CurrencyInput`의 `label`·`aria-label`로도 쓰여
   *    `string`이어야 하므로 계산 행만 확장한다.
   */
  label: React.ReactNode;
  description?: string;
  /** 열별 값 — 엔진 echo에서 온다(UI 재계산 금지, 계획서 §6.2) */
  values: Partial<Record<StatementColumn, number>>;
  /** 결론 행 강조 (행 24 · 1주당 순자산가치) */
  emphasis?: boolean;
  /** 값 뒤 단위 — 미지정 시 없음 */
  unit?: string;
  groupCell?: StatementGroupCell;
  /** 앞선 행의 그룹 `rowSpan`에 덮이는가 — `StatementInputRow.inGroup`과 같은 뜻 */
  inGroup?: boolean;
}

export type StatementRowSpec = StatementInputRow | StatementCalcRowSpec;

/** 폼에서 `${keyPrefix}${col}` 문자열 값을 꺼낸다 */
export function readCell(
  form: StockTransferFormData,
  keyPrefix: string,
  col: StatementColumn,
): string {
  const key = `${keyPrefix}${col}` as keyof StockTransferFormData;
  return (form[key] as string) ?? "";
}

/**
 * 금액 칸 정렬 — 고정폭 + tabular-nums + 우측정렬로 천·백만·십억 콤마를 세로 정렬한다.
 *
 * 🔑 공용 `BesshiRow`는 `FilingFormRow` 타입에 묶인 **읽기 전용 결과 표** 렌더러라
 *    입력 셀이 있는 이 표에는 재사용할 수 없다. **클래스 문자열만 같은 값을 쓴다**
 *    (`components/calc/results/shared/BesshiRow.tsx`의 금액 칸과 동일).
 *    [[amount-column-align]]
 */
export const AMOUNT_CELL_CLASS = "text-right font-mono tabular-nums whitespace-nowrap";
