/**
 * 상세명세서 산식 중 **JSX 분수(Frac)가 필요한 노드** 모음.
 *
 * `DetailedStatementHelpers.ts`는 `.ts`라 JSX를 담을 수 없다. 단어형 피연산자
 * (숫자가 아니라 「양도시 − 취득시 공시가격」 같은 문구)는 문자열 렌더러
 * `renderFormula`의 자동 분수 치환 대상이 아니므로 여기서 노드로 정의해 주입한다.
 */
import { Frac } from "@/components/calc/results/shared/FormulaParts";

/** §90② 소득금액차감방식 5년 안분 — 분자·분모가 문구라 자동 치환 불가. */
export const INCOME_DEDUCTION_5YEAR_FORMULA = (
  <>
    소득금액차감방식(§90②) 5년 안분 감면대상 양도소득금액 = 양도소득금액 ×{" "}
    <Frac top="(5년시점 − 취득시 공시가격)" bottom="(양도시 − 취득시 공시가격)" />
  </>
);
