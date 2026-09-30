/**
 * 검증 오류 → 고칠 입력칸으로 이동 (DOM 전용).
 *
 * 계획서: `docs/00-pm/transfer-validation-field-jump.plan.md` D-4
 *
 * - 대상은 `data-field` 앵커다(`FieldCard field`·`DateInput`/`CurrencyInput` `data-field`).
 * - 자산 수준 오류는 **그 자산 카드 안에서만** 찾는다 — 카드마다 같은 키가 반복된다.
 * - 같은 키가 여러 곳에 있을 수 있다(분기별 렌더·중복 섹션). **보이는 첫 번째**를 고른다.
 *   접힌 섹션은 `hidden`이라 DOM에는 있으나 보이지 않는다 — 그런 후보는 건너뛴다.
 */
import type { ValidationIssue } from "@/lib/calc/transfer-tax-validate";

const FOCUSABLE =
  'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])';

function isShown(el: HTMLElement): boolean {
  return typeof el.checkVisibility === "function" ? el.checkVisibility() : el.offsetParent !== null;
}

function candidates(issue: ValidationIssue): HTMLElement[] {
  if (!issue.field) return [];
  const scope: ParentNode | null =
    issue.assetIndex != null
      ? document.querySelector(`[data-asset-card-index="${issue.assetIndex}"]`)
      : document;
  if (!scope) return [];
  return Array.from(scope.querySelectorAll<HTMLElement>(`[data-field="${CSS.escape(issue.field)}"]`));
}

export function findIssueTarget(issue: ValidationIssue): HTMLElement | null {
  return candidates(issue).find(isShown) ?? null;
}

function focusTarget(target: HTMLElement) {
  // center — 하단 sticky 오류 목록에 입력칸이 가리지 않도록
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  const focusEl = target.matches(FOCUSABLE) ? target : target.querySelector<HTMLElement>(FOCUSABLE);
  focusEl?.focus({ preventScroll: true });
}

/**
 * 후보가 접힌 자산 섹션(`AssetSection` — `data-asset-section` 바로 아래 헤더 버튼) 안에 있으면
 * 그 헤더를 눌러 펼친다. 섹션의 열림 상태는 카드 내부 state라 **사용자와 같은 경로**로 연다.
 */
function expandCollapsedSection(el: HTMLElement): boolean {
  const header = el
    .closest<HTMLElement>("[data-asset-section]")
    ?.querySelector<HTMLElement>(':scope > button[aria-expanded="false"]');
  if (!header) return false;
  header.click();
  return true;
}

/**
 * 입력칸으로 스크롤하고 커서를 둔다. 대상을 못 찾으면 false — 호출부가 후퇴한다.
 * 접힌 섹션 안에만 있으면 펼친 뒤 다음 틱에 이동한다(오류가 없는 카드의 폼 전역 입력 —
 * 예: 단건 모드의 양도가액은 자산 카드 ② 안에 있다).
 */
export function jumpToIssueField(issue: ValidationIssue): boolean {
  const all = candidates(issue);
  const shown = all.find(isShown);
  if (shown) {
    focusTarget(shown);
    return true;
  }
  if (!all.some(expandCollapsedSection)) return false;
  setTimeout(() => {
    const t = findIssueTarget(issue);
    if (t) focusTarget(t);
  }, 60);
  return true;
}
