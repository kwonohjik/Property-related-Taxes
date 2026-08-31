"use client";

import { useEffect, useState } from "react";
import { userRepository } from "./user-repository";
import type { UserProfile } from "./types";

/**
 * 현재 사용자 프로필을 로드하는 공통 훅.
 * mode 기본값: "taxpayer"
 */
export function useUserProfile() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    /**
     * 언마운트 후 setState 차단.
     *
     * 🔴 종전에는 가드가 없어 테스트가 끝나고 jsdom이 내려간 뒤 promise가 resolve되면
     *    `ReferenceError: window is not defined`가 **unhandled rejection**으로 떴다.
     *    테스트는 전건 통과인데 vitest job이 실패한다(CI run 33371294165 · test 1/4).
     *    파일 배치·타이밍에 따라 발화해 「flaky」로 보이지만 원인은 이 누수다.
     */
    let alive = true;
    userRepository.getProfile().then((p) => {
      if (!alive) return;
      setProfile(p);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  const mode = profile?.mode ?? "taxpayer";

  return { profile, loading, mode };
}
