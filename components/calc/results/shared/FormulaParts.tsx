"use client";

/**
 * 결과 화면 산식 공용 파츠 (전 세목 결과뷰 공통).
 *
 * - `Frac`: `× (A ÷ B)` 한 줄 나열 대신 분자/분모 세로 분수 표기.
 * - `FLine`: `|` 같은 인라인 구분자 대신 줄바꿈 단락.
 *
 * 정책: 결과 산식은 한국어 풀어쓰기 + 분수·괄호로 구조 표현, 구분자는 줄바꿈
 * (2026-07-22 사용자 지시, MixedUseResultCard에서 시작해 전 결과뷰 공통화).
 */

export function Frac({ top, bottom }: { top: React.ReactNode; bottom: React.ReactNode }) {
  return (
    <span className="inline-flex flex-col items-center align-middle text-center leading-tight mx-0.5">
      <span className="px-1">{top}</span>
      <span className="px-1 border-t border-muted-foreground/40">{bottom}</span>
    </span>
  );
}

export function FLine({ children }: { children: React.ReactNode }) {
  return <span className="block">{children}</span>;
}

/**
 * 문자열 산식 안의 `분자 / 분모`를 `Frac` 세로 분수로 치환해 렌더한다.
 *
 * 대상은 **숫자(콤마 포함) 또는 괄호로 묶인 수식**이 양쪽에 있는 나눗셈만이다.
 * "소득세법 §97 / 시행령 §163" 같은 법령 인용 슬래시는 치환하지 않는다.
 */
const OPERAND = String.raw`(?:\([^()]*\)|\d[\d,]*(?:\.\d+)?%?)`;
const FRACTION_RE = new RegExp(`(${OPERAND})\\s*[/÷]\\s*(${OPERAND})`, "g");

export function renderFormula(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  FRACTION_RE.lastIndex = 0;
  while ((m = FRACTION_RE.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(<Frac key={m.index} top={m[1]} bottom={m[2]} />);
    last = m.index + m[0].length;
  }
  if (parts.length === 0) return text;
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

/** ReactNode 산식 — 문자열이면 분수 치환, 이미 JSX면 그대로. */
export function FormulaText({ value }: { value: React.ReactNode }) {
  return <>{typeof value === "string" ? renderFormula(value) : value}</>;
}
