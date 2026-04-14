"use client";

/**
 * 전역 Select-on-Focus Provider
 *
 * document 전체에 focus 이벤트 위임(capture phase)을 등록하여
 * 모든 텍스트·숫자 입력 필드에 포커스 시 자동 전체 선택 동작을 부여한다.
 *
 * - 개별 컴포넌트에 onFocus={(e) => e.target.select()} 없이도 자동 적용됨
 * - requestAnimationFrame: Chrome의 mousedown→focus 순서로 인한 selection 덮어쓰기 방지
 * - capture phase: React 합성 이벤트보다 먼저 실행되어 모든 입력 필드에 적용
 */

import { useEffect } from "react";

/** 전체 선택 적용 대상 input[type] */
const SELECT_ON_FOCUS_TYPES = new Set([
  "text",
  "number",
  "email",
  "tel",
  "password",
  "search",
  "url",
  "", // type 속성 없는 경우 (기본값 text)
]);

export function SelectOnFocusProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const handleFocus = (e: FocusEvent) => {
      const target = e.target as HTMLElement;

      if (target.tagName === "TEXTAREA") {
        requestAnimationFrame(() => (target as HTMLTextAreaElement).select());
        return;
      }

      if (target.tagName === "INPUT") {
        const inputType = ((target as HTMLInputElement).type ?? "").toLowerCase();
        if (SELECT_ON_FOCUS_TYPES.has(inputType)) {
          requestAnimationFrame(() => (target as HTMLInputElement).select());
        }
      }
    };

    document.addEventListener("focus", handleFocus, true);
    return () => document.removeEventListener("focus", handleFocus, true);
  }, []);

  return <>{children}</>;
}
