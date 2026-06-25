import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// 이력은 로컬 IndexedDB 일원화 — 계산 이력 관련 보호 라우트(/api/history·/api/pdf) 제거됨.
// Auth 세션(updateSession)은 유지 — 향후 E2E 암호화 동기화 토대.
const AUTH_ROUTES = ["/auth/login", "/auth/signup"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const { supabaseResponse, user } = await updateSession(request);

  // 인증 라우트: 이미 로그인 상태면 홈으로
  if (AUTH_ROUTES.some((route) => pathname.startsWith(route))) {
    if (user) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
