import { db } from "./db";
import { getCurrentUserId } from "./current-user";
import type { UserId } from "./constants";
import type { UserProfile } from "./types";

export interface UserRepository {
  getProfile(): Promise<UserProfile | null>;
  upsertProfile(input: { displayName: string; birthDate: string | null }): Promise<UserProfile>;
  clearProfile(): Promise<void>;
}

/**
 * uid를 클로저로 캡처. 모든 쿼리는 자동으로 uid 필터.
 */
export function createUserRepository(uid: UserId): UserRepository {
  return {
    async getProfile() {
      const rec = await db.userProfile.get(uid);
      return rec ?? null;
    },

    async upsertProfile({ displayName, birthDate }) {
      const now = new Date().toISOString();
      const existing = await db.userProfile.get(uid);
      const next: UserProfile = existing
        ? { ...existing, displayName, birthDate, updatedAt: now }
        : { id: uid, displayName, birthDate, createdAt: now, updatedAt: now };
      await db.userProfile.put(next);
      return next;
    },

    async clearProfile() {
      await db.userProfile.delete(uid);
    },
  };
}

/** 기본 인스턴스 — 호출 측은 uid를 의식하지 않음 */
export const userRepository = createUserRepository(getCurrentUserId());
