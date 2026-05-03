import { LOCAL_USER_ID, type UserId } from "./constants";

/**
 * 현재 활성 사용자 ID 반환.
 *
 * **이 함수는 향후 Supabase 인증 도입 시 교체되는 단일 지점이다.**
 *
 * 로컬 단계: LOCAL_USER_ID 고정.
 * 인증 도입 시:
 *   ```ts
 *   import { createClient } from "@/lib/supabase/client";
 *   export async function getCurrentUserId(): Promise<UserId | null> {
 *     const supabase = createClient();
 *     const { data: { user } } = await supabase.auth.getUser();
 *     return user?.id ?? null;
 *   }
 *   ```
 *   → barrel에서 `await getCurrentUserId()`로 사용.
 *
 * Repository 외 다른 곳에서 LOCAL_USER_ID를 직접 import 하지 말 것.
 */
export function getCurrentUserId(): UserId {
  return LOCAL_USER_ID;
}
