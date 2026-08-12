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
