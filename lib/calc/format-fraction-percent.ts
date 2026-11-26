/**
 * 정수 분수 → 백분율 표기 (표시 전용 · 세액에 쓰지 않는다)
 *
 * 가업상속공제적용률처럼 법정량이 분수인 비율을 화면에 보일 때 쓴다(계획서 F-3).
 * 소수 넷째 자리에서 **절사**하고, 끝의 0은 지우되 소수 둘째 자리까지는 남긴다.
 *   4/5 → "80.00" · 1/3 → "33.3333" · 2/3 → "66.6666" · 1/8 → "12.50"
 * double 나눗셈을 거치지 않도록 BigInt로 계산한다.
 */
export function formatFractionPercent(numerator: number, denominator: number): string {
  if (!(denominator > 0) || !Number.isInteger(numerator) || !Number.isInteger(denominator)) return "0.00";
  const scale = BigInt(10_000);
  const scaled = (BigInt(numerator) * BigInt(100) * scale) / BigInt(denominator);
  const intPart = scaled / scale;
  let frac = (scaled % scale).toString().padStart(4, "0").replace(/0+$/, "");
  if (frac.length < 2) frac = frac.padEnd(2, "0");
  return `${intPart}.${frac}`;
}
