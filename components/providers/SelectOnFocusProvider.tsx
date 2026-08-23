"use client";

/**
 * 전역 Select-on-Focus Provider
 *
 * document 전체에 focus 이벤트 위임(capture phase)을 등록하여
 * 모든 텍스트·숫자 입력 필드에 포커스 시 자동 전체 선택 동작을 부여한다.
 *
 * - 개별 컴포넌트에 onFocus={(e) => e.target.select()} 없이도 자동 적용됨
 * - requestAnimationFrame: 아래 두 가지 때문에 한 프레임 미룬다
 *     1. Chrome의 mousedown→focus 순서로 인한 selection 덮어쓰기 방지
 *     2. CurrencyInput은 포커스 시 표시값을 "1,000,000" → "1000000"로 바꾼다.
 *        그 리렌더 **후에** 선택해야 raw 전체가 잡힌다 (CurrencyInput.tsx:90·106)
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

/**
 * 다음 프레임에 전체선택한다 — 단, 그 사이에 **포커스가 떠났거나 사용자가 입력을 시작했으면**
 * 건너뛴다.
 *
 * 🔑 술어가 「입력이 시작됐는가」(keydown)인 이유 — 「값이 바뀌었는가」로 판정하면
 *    CurrencyInput의 포커스 시 포맷 전환(콤마 제거)까지 입력으로 오인해 전체선택이 죽는다.
 *    값 변경은 오지만 keydown은 오지 않는 경우(포맷 전환·자동조회 주입)와,
 *    둘 다 오는 경우(실제 타이핑)를 가르는 것은 keydown뿐이다.
 *
 * 가드가 없으면: 포커스 직후 한 프레임 안에 첫 키가 들어온 경우 rAF가 뒤늦게 전체선택을 걸어
 * **이미 입력된 글자를 다시 선택 범위에 넣는다**. 소재지 한글 입력(useHangulTyping)에서
 * 초성 유실로 드러났다 — `가라` → `ㅏ라`.
 *
 * 계약 고정: `__tests__/components/select-on-focus-provider.anchor.test.tsx` (SOF-1~7)
 */
function selectOnNextFrame(el: HTMLInputElement | HTMLTextAreaElement) {
  let typed = false;
  const markTyped = () => {
    typed = true;
  };
  el.addEventListener("keydown", markTyped, { once: true });
  requestAnimationFrame(() => {
    el.removeEventListener("keydown", markTyped);
    if (document.activeElement !== el || typed) return;
    el.select();
  });
}

export function SelectOnFocusProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const handleFocus = (e: FocusEvent) => {
      const target = e.target as HTMLElement;

      if (target.tagName === "TEXTAREA") {
        selectOnNextFrame(target as HTMLTextAreaElement);
        return;
      }

      if (target.tagName === "INPUT") {
        const inputType = ((target as HTMLInputElement).type ?? "").toLowerCase();
        if (SELECT_ON_FOCUS_TYPES.has(inputType)) {
          selectOnNextFrame(target as HTMLInputElement);
        }
      }
    };

    document.addEventListener("focus", handleFocus, true);
    return () => document.removeEventListener("focus", handleFocus, true);
  }, []);

  return <>{children}</>;
}
