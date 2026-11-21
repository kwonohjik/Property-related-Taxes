/**
 * 화면이 사라질 때 끊기는 AbortSignal (2026-11 리뷰 I-28) — AI 요청을 언마운트에서만 중단한다.
 * 추출 대화창을 닫는 것은 낭비가 아니다(다시 열면 결과가 보인다) — 그래서 닫기에는 걸지 않는다.
 * 컨트롤러는 effect 안에서 만든다 — 개발 모드의 effect 이중 실행이 렌더 때 만든 컨트롤러를 영구히 끊지 않게.
 */
import { useEffect, useRef } from "react";

export function useUnmountSignal(): () => AbortSignal | undefined {
  const ref = useRef<AbortController | null>(null);
  useEffect(() => {
    const c = new AbortController();
    ref.current = c;
    return () => c.abort();
  }, []);
  return () => ref.current?.signal;
}
