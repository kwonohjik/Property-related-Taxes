"use client";

/**
 * useHangulTyping — 영문 IME 상태에서도 한글이 입력되게 하는 keydown 인터셉터
 *
 * 배경: 브라우저는 OS IME를 한글 모드로 강제 전환할 수 없다. CSS `ime-mode`는
 * deprecated(Chrome 미지원·Firefox 86에서 제거)이고 macOS에서는 어떤 브라우저도
 * 지원하지 않는다. 그래서 "포커스 시 한글 모드"를 흉내 내려면 영문 자판 키를
 * 직접 자모로 조합하는 수밖에 없다.
 *
 * 이중 변환 방지: IME가 실제로 한글 모드이면 keydown의 `key`가 `"Process"`(keyCode 229)로
 * 오거나 `isComposing`이 true이므로, 두 경우 모두 인터셉트하지 않고 IME에 맡긴다.
 * 즉 사용자가 이미 한글 모드면 이 훅은 아무 일도 하지 않는다.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ 의존 계약 — 「입력이 시작된 뒤에는 아무도 전체선택을 걸지 않는다」
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * 이 훅은 keydown 시점의 `start !== end`(선택 영역 있음)를 **「사용자가 대체를 원한다」**로
 * 읽고 조합을 새로 세운다(아래 `createState(text.slice(0, start))`). 그 해석의 전제는
 * **그 선택이 사용자의 것**이라는 점인데, 훅은 keydown만 관측하므로 **선택의 출처를 알 방법이
 * 없다** — 첫 키 시점에도 `lastEmitRef.current === text`라(마운트 시 `useRef(value)`)
 * 값으로도 구분되지 않는다. 그래서 위 계약이 **외부 전제**가 된다.
 *
 * 2026-08-23에 그 계약이 깨져 있었다: `SelectOnFocusProvider`의 rAF `select()`가 첫 키보다
 * 늦게 실행되면 이미 `ㄱ`이 된 입력을 **다시 전체선택**했고(selection `(0,1)`), 둘째 키에서
 * 위 해석이 오판이 되어 초성이 사라졌다 — `가라` → `ㅏ라`.
 * 실측: 키 간격 10·30·50·100ms에서 **0/5**, 0ms에서만 5/5(한 프레임 안에 다 들어가서).
 * ⇒ Provider의 rAF 콜백에 **keydown 가드**를 넣어 해소했다. 이 훅은 변경하지 않았다.
 *
 * ❌ 재검토 금지 — 훅 쪽에서 고치려는 시도는 전부 실패했다:
 *  · `select` 이벤트로 선택의 출처 판정 → 우리 emit 이후에도 SELECT가 온다(실측 반증)
 *  · emit 전/후 `setSelectionRange`로 캐럿 접기 → rAF가 뒤에 와서 덮어쓴다(0/5)
 *
 * 계약 고정: `__tests__/components/select-on-focus-provider.anchor.test.tsx` (SOF-2·SOF-7)
 *            `e2e/address-hangul-typing.spec.ts` 「포커스 시 전체선택 후 …」(`delay:100` 필수)
 * 실측·기각안: `docs/02-design/features/select-on-focus-raf-race.plan.md`
 */

import { useCallback, useRef } from "react";
import {
  backspace,
  createState,
  flush,
  input,
  jamoOfKey,
  textOf,
  type HangulState,
} from "@/lib/utils/hangul-automata";

interface UseHangulTypingOptions {
  /** 현재 입력값 (controlled) */
  value: string;
  /** 변환된 값을 상위로 전달 */
  onChange: (next: string) => void;
  /** false이면 인터셉트하지 않는다 (기본 true) */
  enabled?: boolean;
}

export function useHangulTyping({ value, onChange, enabled = true }: UseHangulTypingOptions) {
  const stateRef = useRef<HangulState>(createState(value));
  /** 마지막으로 이 훅이 만들어 낸 값 — 외부에서 값이 바뀌었는지 판별용 */
  const lastEmitRef = useRef<string>(value);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!enabled) return;
      // IME가 한글 모드로 조합 중이면 그대로 맡긴다 (이중 변환 방지)
      if (e.nativeEvent.isComposing || e.key === "Process" || e.nativeEvent.keyCode === 229) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const el = e.currentTarget;
      const text = el.value;
      const start = el.selectionStart ?? text.length;
      const end = el.selectionEnd ?? text.length;

      // 커서 뒤에 텍스트가 남는 중간 편집은 다루지 않는다 (조합 위치가 끝이라는 전제)
      if (end !== text.length) {
        stateRef.current = createState(text);
        lastEmitRef.current = text;
        return;
      }

      // 외부에서 값이 바뀌었거나 선택 영역이 있으면 조합 상태를 다시 세운다
      let st = stateRef.current;
      if (lastEmitRef.current !== text || start !== end) {
        st = createState(text.slice(0, start));
      }

      const jamo = jamoOfKey(e.key);
      if (jamo) {
        const next = input(st, jamo);
        e.preventDefault();
        stateRef.current = next;
        const nextText = textOf(next);
        lastEmitRef.current = nextText;
        onChange(nextText);
        return;
      }

      if (e.key === "Backspace") {
        // 선택 영역 삭제는 브라우저 기본 동작에 맡긴다
        if (start !== end) {
          stateRef.current = createState("");
          lastEmitRef.current = "";
          return;
        }
        const next = backspace(st);
        if (!next) {
          stateRef.current = createState(text.slice(0, Math.max(0, start - 1)));
          lastEmitRef.current = "";
          return;
        }
        e.preventDefault();
        stateRef.current = next;
        const nextText = textOf(next);
        lastEmitRef.current = nextText;
        onChange(nextText);
        return;
      }

      // 그 외 키(숫자·공백·방향키·Enter 등)는 기본 동작에 맡기고 조합만 확정한다
      stateRef.current = flush(st);
      lastEmitRef.current = "";
    },
    [enabled, onChange],
  );

  return { onKeyDown };
}
