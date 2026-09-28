/**
 * 부담부증여 양도소득세 카드의 날짜 교환 helper — `BurdenedGiftTransferSection`·`BurdenedGiftHousingFieldSet` 공용.
 *
 * 2026-09-28 E-1 후속: 800줄 정책으로 `BurdenedGiftTransferSection.tsx`에서 주택 필드 세트를 분리하며
 * 두 파일이 함께 쓰는 helper를 옮겼다(동작 그대로).
 */
import { toOptionalDate } from "@/lib/api/date-coerce";

/**
 * Date → YYYY-MM-DD (DateInput 교환용).
 *
 * 🔴 IG-117 — **정변환이 버그였다.** `new Date("YYYY-MM-DD")`는 UTC 자정으로 파싱되는데
 * 종전 이 함수는 로컬 getter(`getFullYear`/`getMonth`/`getDate`)로 되돌렸다. UTC보다 서쪽
 * 타임존에서는 왕복 시 하루가 앞당겨져 취득일·종전/신규 주택 취득일이 화면에서 하루 어긋나고,
 * 사용자가 그 표시를 고치려 재입력하면 그때 잘못된 날짜가 store에 저장된다.
 * 같은 카드의 형제 파일(`BurdenedGiftValuationModeSection`)은 UTC-in/UTC-out이라
 * 한 카드 안에 두 규칙이 공존했다 ⇒ 형제와 동일하게 `toISOString().slice(0,10)`로 통일한다.
 *
 * ⚠️ 인라인 복제 3곳(아래 DateInput들)도 같은 로컬 getter를 쓰고 있었다 — 함께 이 함수로 모은다.
 */
export function dateToStr(d: Date | undefined): string {
  return d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : "";
}

/**
 * YYYY-MM-DD → Date. `toOptionalDate`는 문자열에 대해 `new Date(value)`를 그대로 실행하므로
 * 런타임 동작은 같지만, 루트 CLAUDE.md의 「신규 코드 `new Date(x)` 직접 호출 금지」 정책과
 * 형제 파일 관례에 맞춘다(단일 진입점 유지).
 */
export function strToDate(s: string): Date | undefined {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return undefined;
  return toOptionalDate(s);
}
