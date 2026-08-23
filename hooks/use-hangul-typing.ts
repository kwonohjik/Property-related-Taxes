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
 * 🔴 알려진 제약 — 전체선택 직후 둘째 자모에서 초성이 유실된다 (2026-08-23 등재)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * **증상**: 입력칸을 포커스하면 `SelectOnFocusProvider`가 전체 선택한다. 그 상태에서
 * `가라`를 치면 **`ㅏ라`**가 된다 — 첫 초성 `ㄱ`만 사라진다.
 *
 * **원인**: 브라우저는 controlled input의 `value`가 바뀌어도 **선택 범위를 클램프해 유지**한다.
 * Playwright 실측(`/calc/property-tax` 소재지):
 *
 *     첫 키 전  : value `테헤란로`  selection (0,4)   ← 전체선택
 *     첫 키 후  : value `ㄱ`        selection (0,1)   ← **범위가 남는다**
 *     둘째 키 후: value `ㅏ`                          ← 아래 `start !== end` 분기가 다시 발동
 *
 * 이 훅은 `start !== end`를 「사용자가 대체를 원한다」로 해석해 조합을 새로 세운다(정상 의도).
 * 그런데 위 잔존 범위는 **사용자의 선택이 아니라 우리 emit의 부산물**이라 오판이 된다.
 *
 * **왜 아직 안 고쳤나** — 훅은 keydown만 관측하므로 「사용자의 select-all」과
 * 「우리 emit의 잔존 범위」를 구분할 근거가 없다. 두 가지를 시도했고 둘 다 불충분했다:
 *
 *  1. emit 직후 `el.setSelectionRange(len, len)`으로 캐럿 접기 — 로컬 5회 중 2회만 통과.
 *     React가 커밋 시 선택을 복원하는 경로와 경합한다.
 *  2. 「커밋 지연 → 조합 리셋」 가설로 emit 이력 기반 판정 — 단위 테스트로는 재현·해소됐으나
 *     브라우저에서는 전혀 개선되지 않았다(React 18은 discrete 이벤트에서 동기 flush한다).
 *
 * ⇒ 제대로 고치려면 선택 영역의 **출처**를 알아야 한다(focus/select/mouse 이벤트까지 관측하거나,
 *   포커스 시 전체선택 정책 자체를 재검토). 별건 설계 필요.
 *
 * **테스트 상태**: `e2e/address-hangul-typing.spec.ts`의 「포커스 시 전체선택 후 …」는
 * 이 결함과 얽히지 않도록 **첫 자모 대체까지만** 검증하도록 범위를 좁혀 두었다.
 * 여기가 고쳐지면 그 테스트를 `rkfk` → `가라` 전체 단언으로 되돌릴 것.
 * (`known-failures.ts`에는 넣지 않았다 — 그 목록은 줄이기만 한다.)
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
