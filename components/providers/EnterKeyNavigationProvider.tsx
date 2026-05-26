"use client";

/**
 * 전역 Enter-키 입력 이동 Provider
 *
 * 텍스트·숫자 입력 필드에서 Enter를 누르면 같은 스코프(form / dialog / 전체)의
 * 다음 입력 필드로 포커스를 이동한다. 이동 후에는 SelectOnFocusProvider가
 * 자동 전체 선택을 수행하므로 즉시 덮어쓰기가 가능하다.
 *
 * 설계 (docs/00-pm/ui-polish-sidebar-label-enter.plan.md):
 * - bubble phase 등록: 컴포넌트 자체 onKeyDown(autocomplete 항목 선택 등)이 먼저 실행될 기회를 가짐
 * - 대상: <input type=text|number|email|tel|password|search|url|""> 만. textarea·select·라디오·체크박스 제외
 * - IME 가드: isComposing / keyCode 229 (한글 조합 확정 Enter 보호)
 * - 옵트아웃: [data-enter-nav="off"] 하위 입력은 전역 이동 비활성 (자체 Enter 핸들러 보유 컴포넌트)
 * - 스코프: 가장 가까운 form / [role=dialog] / [data-enter-nav-scope] 내에서만 순환, 없으면 document 전체
 */

import { useEffect } from "react";

/** Enter 이동 대상 input[type] (SelectOnFocusProvider와 동일 집합) */
const ENTER_NAV_TYPES = new Set([
  "text",
  "number",
  "email",
  "tel",
  "password",
  "search",
  "url",
  "", // type 속성 없는 경우 (기본값 text)
]);

/** 포커스 가능한 대상 input 셀렉터 (세부 type 필터는 isEligible에서 재확인) */
const FOCUSABLE_SELECTOR =
  'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="file"]):not([type="range"]):not([type="color"]):not([type="date"])';

function isEligible(el: Element | null): el is HTMLInputElement {
  if (!el || el.tagName !== "INPUT") return false;
  const input = el as HTMLInputElement;
  if (input.disabled || input.readOnly) return false;
  if (input.tabIndex === -1) return false;
  if (input.offsetParent === null) return false; // 숨김(display:none 등)
  const type = (input.type ?? "").toLowerCase();
  if (!ENTER_NAV_TYPES.has(type)) return false;
  // 자체 Enter 핸들러를 가진 컴포넌트(autocomplete·표)는 제외
  if (input.closest('[data-enter-nav="off"]')) return false;
  return true;
}

/**
 * `fromEl` 기준 DOM 순서상 다음 포커스 대상 input을 반환.
 *
 * - `fromEl`이 후보(eligible)에 포함되면 기존과 동일하게 그 다음 후보를 반환.
 * - `fromEl`이 옵트아웃 영역(자체 Enter 핸들러 표 등) 안이라 후보에 없으면,
 *   `compareDocumentPosition`으로 DOM상 뒤에 있는 첫 eligible을 반환
 *   (FiscalYearAdjustmentTable의 마지막 셀 → 표 밖 복귀에 사용).
 *
 * 스코프: 가장 가까운 form / [role=dialog] / [data-enter-nav-scope], 없으면 document.
 */
export function getNextFocusableInput(fromEl: HTMLElement): HTMLInputElement | null {
  const scope =
    fromEl.closest<HTMLElement>('form, [role="dialog"], [data-enter-nav-scope]') ??
    document;

  const candidates = Array.from(
    scope.querySelectorAll<HTMLInputElement>(FOCUSABLE_SELECTOR),
  ).filter(isEligible);

  const idx = candidates.indexOf(fromEl as HTMLInputElement);
  if (idx !== -1) return candidates[idx + 1] ?? null;

  // fromEl이 후보에 없는 경우(옵트아웃 영역) — DOM상 뒤의 첫 eligible
  for (const cand of candidates) {
    if (fromEl.compareDocumentPosition(cand) & Node.DOCUMENT_POSITION_FOLLOWING) {
      return cand;
    }
  }
  return null;
}

export function EnterKeyNavigationProvider() {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.shiftKey) return;
      // IME 조합 중 Enter(한글 등) 무시
      if (e.isComposing || e.keyCode === 229) return;

      const target = e.target as HTMLElement | null;
      if (!isEligible(target)) return;

      // Enter 기본 동작(form submit 등) 차단 후 다음 입력으로 이동
      e.preventDefault();
      getNextFocusableInput(target)?.focus();
      // 포커스 후 전체 선택은 SelectOnFocusProvider(RAF)가 처리
      // 마지막 입력이면 next=null → 포커스 유지
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return null;
}
