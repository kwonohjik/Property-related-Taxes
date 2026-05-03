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
    userRepository.getProfile().then((p) => {
      setProfile(p);
      setLoading(false);
    });
  }, []);

  const mode = profile?.mode ?? "taxpayer";

  return { profile, loading, mode };
}
