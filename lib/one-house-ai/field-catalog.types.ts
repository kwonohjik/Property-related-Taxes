/**
 * 1세대1주택 AI 사실 추출 — 필드 사전 타입.
 *
 * LLM은 판정 메뉴 폼(`OneHouseJudgmentFormData`)을 직접 만들지 않고
 * 「경로 = 값」 목록만 낸다. 경로·값은 이 사전으로 검증한 뒤 폼에 넣는다(`apply-extraction.ts`).
 *
 * 경로 표기:
 * - 최상위: `transferDate`
 * - 양도 자산: `asset.acquisitionDate`
 * - 명부 주택 행: `houses[].acquisitionDate` (행은 추출 결과의 `rowId`로 묶는다)
 * - 그 밖 배열 행: `presaleRights[].type`, `asset.residencePeriods[].moveInDate` …
 * - 객체: `asset.rentalHousingException.scenario`, `asset.rentalHousingException.rentalUnits[].rentalCategory`
 */

export type FieldKind =
  /** YYYY-MM-DD */
  | "date"
  | "boolean"
  /** `values` 중 하나 */
  | "enum"
  /** 원 단위 정수 문자열(폼이 문자열로 보관) */
  | "amount"
  /** 정수 문자열(개월·년·㎡·% 등 — 폼이 문자열이면 문자열) */
  | "intString"
  /** 소수·음수를 받는 숫자 문자열(인상률 %·면적·연수 — 화면이 DecimalInput) */
  | "decimalString"
  /** 정수 숫자(폼이 number로 보관) */
  | "int"
  | "string";

export type FieldSpec = {
  /** 위 경로 표기 */
  path: string;
  kind: FieldKind;
  /** enum 허용값 — 값마다 뜻을 한국어로 */
  values?: { value: string; label: string }[];
  /** 화면 라벨(UI 그대로) */
  label: string;
  /** 무엇을 넣는 칸인지 — 법적 의미·기준일·언제 쓰는지. UI 안내 문구·타입 주석 근거 */
  hint: string;
  /** 같이 채워야 의미가 있는 선행 조건(예: `houses[].isInherited = true`일 때만) */
  when?: string;
};
