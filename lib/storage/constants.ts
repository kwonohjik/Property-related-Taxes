/**
 * 로컬 단계 단일 사용자 식별자.
 *
 * 향후 Supabase 인증 도입 시:
 *   - `lib/storage/current-user.ts`의 `getCurrentUserId()`만 교체.
 *   - 이 상수는 그대로 두고, repository는 주입받은 uid로만 동작.
 *
 * 호출 측에서 이 상수를 직접 import 하지 말 것 — 항상 `getCurrentUserId()` 경유.
 */
export const LOCAL_USER_ID = "local-user" as const;

/** 사용자 ID 타입. 로컬은 LOCAL_USER_ID, 향후 Supabase는 uuid string */
export type UserId = typeof LOCAL_USER_ID | string;
