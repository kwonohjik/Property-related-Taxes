# Korean Tax Calc — 인증 & 사용자 흐름 설계 (Design Document)

> PDCA Design Phase | 2026-04-14
> Plan Reference: `docs/01-plan/features/korean-tax-calc.plan.md` (Phase 2)
> DB Schema Reference: `docs/02-design/features/korean-tax-calc-db-schema.design.md`
> Tech Stack: Supabase Auth + Next.js 15 Middleware + zustand (sessionStorage persist)

---

## Context Anchor

| Dimension | Content |
|-----------|---------|
| **WHY** | 비로그인 사용자도 세금 계산은 자유롭게 허용하되, 이력 저장·PDF 등 부가 기능은 로그인 유도로 전환율 확보 |
| **WHO** | 비로그인 방문자(일회성 계산), 로그인 사용자(반복 계산·이력 관리), 전문가(대량 이력) |
| **RISK** | 소셜 로그인 redirect 시 sessionStorage 데이터 유실, 비로그인→로그인 전환 시 결과 이관 실패 |
| **SUCCESS** | 비로그인 계산 100% 허용, 로그인 전환 시 결과 자동 이관, 소셜 로그인 3초 이내 완료 |
| **SCOPE** | 인증 방식, 라우트 보호, 비로그인→로그인 이관, 사용자 프로필, 세션 관리 |

---

## 1. 인증 전략 개요

### 1.1 핵심 정책: 비로그인 계산 허용

```
┌─────────────────────────────────────────────────────┐
│                     비로그인 사용자                     │
│                                                     │
│  허용:                                               │
│  ✅ 세금 계산 (6종 모두)     POST /api/calc/*         │
│  ✅ 결과 화면 보기                                    │
│  ✅ 세금 가이드 읽기                                  │
│                                                     │
│  제한 (로그인 유도):                                   │
│  🔒 이력 저장               → "로그인 시 자동 저장"    │
│  🔒 이력 조회/삭제           GET/DELETE /api/history  │
│  🔒 PDF 다운로드            POST /api/pdf            │
└─────────────────────────────────────────────────────┘
```

### 1.2 인증 방식

| 방식 | Provider | 비고 |
|------|----------|------|
| 이메일/비밀번호 | Supabase Auth | 기본 |
| 구글 | Supabase Auth (Google OAuth) | 소셜 |
| 카카오 | Supabase Auth (Kakao OAuth) | 한국 사용자 대상 필수 |

**소셜 로그인 제약:**
- **redirect 방식만 사용** (popup 방식 금지)
- 이유: popup 방식은 새 탭/창이 열리며 sessionStorage가 탭 격리됨 → 비로그인 계산 결과 이관 실패
- Supabase `signInWithOAuth({ provider, options: { redirectTo } })` 사용

---

## 2. 라우트 보호 설계

### 2.1 Next.js Middleware

```typescript
// middleware.ts
import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const PROTECTED_ROUTES = ['/history', '/api/history', '/api/pdf'];
const AUTH_ROUTES = ['/auth/login', '/auth/signup'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Supabase 세션 확인
  const supabase = createServerClient(/* env */);
  const { data: { session } } = await supabase.auth.getSession();

  // 보호 라우트 접근 시 로그인 페이지로 리다이렉트
  if (PROTECTED_ROUTES.some(route => pathname.startsWith(route))) {
    if (!session) {
      const loginUrl = new URL('/auth/login', request.url);
      loginUrl.searchParams.set('redirectTo', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // 로그인 상태에서 인증 페이지 접근 시 홈으로
  if (AUTH_ROUTES.some(route => pathname.startsWith(route))) {
    if (session) {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/history/:path*', '/api/history/:path*', '/api/pdf/:path*',
            '/auth/:path*'],
};
```

### 2.2 라우트 보호 매트릭스

| 라우트 | 비로그인 | 로그인 | 비고 |
|--------|---------|--------|------|
| `/` | ✅ | ✅ | 랜딩 |
| `/calc/*` | ✅ | ✅ | 계산기 폼 |
| `/api/calc/*` | ✅ | ✅ | 계산 API (rate limit 적용) |
| `/guide/*` | ✅ | ✅ | 세금 가이드 (SSG) |
| `/auth/*` | ✅ | 리다이렉트(/) | 인증 페이지 |
| `/history` | 리다이렉트(login) | ✅ | 이력 목록 |
| `/api/history` | 401 | ✅ | 이력 API |
| `/api/pdf` | 401 | ✅ | PDF API |
| `/result/[id]` | 401 | ✅ | 저장된 이력 상세 |

---

## 3. 비로그인→로그인 결과 이관

### 3.1 이관 흐름

```
┌─────────────────────────────────────────────────────────┐
│ 비로그인 사용자                                           │
│                                                         │
│ 1. 세금 계산 수행                                        │
│    → API 결과를 zustand store에 저장                     │
│    → sessionStorage에 자동 persist                       │
│                                                         │
│ 2. 결과 화면에서 LoginPromptBanner 표시                   │
│    "로그인하면 이 결과가 자동 저장됩니다"                    │
│    [로그인] [회원가입]                                    │
│                                                         │
│ 3. 로그인 클릭 → /auth/login?redirectTo=/calc/...        │
│    ※ redirectTo에 현재 페이지 경로 포함                    │
│                                                         │
│ 4. 로그인 완료 (이메일 또는 소셜 redirect)                 │
│    → onAuthStateChange 리스너 발화                       │
│    → sessionStorage에서 임시 결과 확인                    │
│    → DB 자동 저장 (saveCalculation)                      │
│    → sessionStorage 정리                                │
│    → 토스트: "이전 계산 결과가 저장되었습니다"               │
│    → redirectTo 경로로 이동                              │
└─────────────────────────────────────────────────────────┘
```

### 3.2 이관 구현

```typescript
// lib/auth/result-migration.ts

interface PendingResult {
  taxType: TaxType;
  inputData: Record<string, unknown>;
  resultData: Record<string, unknown>;
  calculatedAt: string;            // ISO 문자열
}

const PENDING_KEY = 'pending-calc-results';

// 비로그인 시 결과 임시 저장
function savePendingResult(result: PendingResult): void {
  const existing = getPendingResults();
  existing.push(result);
  // 최대 5건만 보관 (sessionStorage 용량 보호)
  const trimmed = existing.slice(-5);
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(trimmed));
}

// 보류 결과 조회
function getPendingResults(): PendingResult[] {
  const raw = sessionStorage.getItem(PENDING_KEY);
  if (!raw) return [];
  return JSON.parse(raw);
}

// 로그인 후 이관 실행
async function migratePendingResults(userId: string): Promise<number> {
  const pending = getPendingResults();
  if (pending.length === 0) return 0;

  let migrated = 0;
  for (const result of pending) {
    await saveCalculation({
      userId,
      taxType: result.taxType,
      inputData: result.inputData,
      resultData: result.resultData,
      taxLawVersion: getCurrentTaxLawVersion(),
    });
    migrated++;
  }

  // 정리
  sessionStorage.removeItem(PENDING_KEY);
  return migrated;
}
```

### 3.3 AuthStateChange 리스너

```typescript
// components/providers/AuthProvider.tsx

'use client';

import { useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { migratePendingResults } from '@/lib/auth/result-migration';
import { toast } from 'sonner'; // 또는 shadcn/ui toast

export function AuthProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const supabase = createBrowserClient(/* env */);

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          // 비로그인 결과 이관
          const count = await migratePendingResults(session.user.id);
          if (count > 0) {
            toast.success(`이전 계산 결과 ${count}건이 저장되었습니다`);
          }
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  return <>{children}</>;
}
```

---

## 4. 사용자 프로필 자동 생성

### 4.1 Auth Trigger (Supabase SQL)

```sql
-- Supabase Auth 회원가입 시 users 테이블에 프로필 자동 생성
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, display_name, created_at)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'full_name', new.email),
    now()
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

### 4.2 소셜 로그인 display_name 매핑

| Provider | display_name 소스 |
|----------|-------------------|
| 이메일 | `email` (@ 앞 부분) |
| Google | `raw_user_meta_data.full_name` |
| Kakao | `raw_user_meta_data.full_name` 또는 `kakao_account.profile.nickname` |

---

## 5. 인증 UI

### 5.1 로그인 페이지 (`/auth/login`)

```
┌─────────────────────────────────────────┐
│            부동산 세금 계산기              │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │  [G] 구글로 로그인                  │  │
│  └───────────────────────────────────┘  │
│  ┌───────────────────────────────────┐  │
│  │  [K] 카카오로 로그인                │  │
│  └───────────────────────────────────┘  │
│                                         │
│  ─────── 또는 ───────                   │
│                                         │
│  이메일  [                           ]  │
│  비밀번호 [                           ]  │
│                                         │
│  [로그인]                               │
│                                         │
│  계정이 없으신가요? [회원가입]             │
└─────────────────────────────────────────┘
```

- 소셜 로그인 버튼 상단 배치 (전환 마찰 최소화)
- `redirectTo` 쿼리 파라미터로 로그인 후 원래 페이지로 복귀

### 5.2 Header 인증 상태

```
비로그인: [로그인] [회원가입]
로그인:   [OOO님 ▼]
            ├─ 계산 이력
            ├─ 설정
            └─ 로그아웃
```

### 5.3 LoginPromptBanner (계산 결과 화면)

```
┌─────────────────────────────────────────────────┐
│  💡 로그인하면 계산 결과가 자동 저장되고,            │
│     PDF 다운로드도 가능합니다.                      │
│                                                  │
│     [로그인]  [회원가입]         [닫기]             │
└─────────────────────────────────────────────────┘
```

- 비로그인 + 결과 화면에서만 표시
- 닫기 가능 (sessionStorage에 dismissed 상태 저장, 같은 세션 내 재표시 안 함)

---

## 6. 세션 관리

### 6.1 Supabase 세션 설정

```typescript
// lib/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

```typescript
// lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );
}
```

### 6.2 세션 갱신

- Supabase 자동 갱신 (기본 JWT 만료: 1시간, 리프레시 토큰으로 자동 갱신)
- `createBrowserClient`가 내부적으로 `onAuthStateChange`에서 토큰 자동 갱신 처리
- 서버 컴포넌트에서는 매 요청 시 `getSession()`으로 유효성 확인

### 6.3 로그아웃

```typescript
async function handleLogout() {
  const supabase = createClient();
  await supabase.auth.signOut();
  // zustand store 초기화 (계산 결과 정리)
  useCalcWizardStore.getState().reset();
  router.push('/');
}
```

---

## 7. OAuth 콜백 처리

### 7.1 콜백 Route Handler

```typescript
// app/auth/callback/route.ts
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const redirectTo = searchParams.get('redirectTo') || '/';

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(`${origin}${redirectTo}`);
    }
  }

  // 에러 시 로그인 페이지로 (에러 메시지 포함)
  return NextResponse.redirect(
    `${origin}/auth/login?error=auth_callback_failed`
  );
}
```

### 7.2 소셜 로그인 호출

```typescript
// 구글
await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: {
    redirectTo: `${window.location.origin}/auth/callback?redirectTo=${encodeURIComponent(currentPath)}`,
  },
});

// 카카오
await supabase.auth.signInWithOAuth({
  provider: 'kakao',
  options: {
    redirectTo: `${window.location.origin}/auth/callback?redirectTo=${encodeURIComponent(currentPath)}`,
  },
});
```

---

## 8. 보안 고려사항

| 항목 | 구현 |
|------|------|
| **RLS** | calculations 테이블: `auth.uid() = user_id` — 본인 데이터만 접근 |
| **CSRF** | Supabase Auth PKCE flow 기본 적용 (SPA 보안 강화) |
| **Rate Limiting** | 로그인 시도: 분당 5회 (Supabase 기본), 계산 API: 분당 30회 (Upstash) |
| **세션 하이재킹** | Supabase JWT + HttpOnly 쿠키 (서버 사이드), secure + sameSite 설정 |
| **비밀번호 정책** | Supabase Auth 기본 (최소 6자), 추가 강화 없음 (MVP) |
| **환경변수** | `SUPABASE_URL`, `SUPABASE_ANON_KEY`: 클라이언트 노출 허용 (RLS 보호), `SUPABASE_SERVICE_ROLE_KEY`: 서버 전용, 절대 클라이언트 노출 금지 |

---

## 9. 설계 결정 기록 (ADR)

### ADR-1: 왜 redirect 방식만 사용하는가?

- **문제**: popup 방식 소셜 로그인 시 새 창이 열리면 sessionStorage가 탭 격리
- **영향**: 비로그인 계산 결과가 sessionStorage에 있으므로, popup 창에서는 접근 불가 → 이관 실패
- **결론**: 모든 소셜 로그인은 redirect 방식 사용. 같은 탭에서 진행되므로 sessionStorage 보존

### ADR-2: 왜 pending 결과를 sessionStorage에 저장하는가?

- **localStorage 안**: 여러 탭에서 중복 이관 위험, 명시적 정리 필요
- **sessionStorage**: 탭 종료 시 자동 정리, 이관 후 명시적 삭제
- **서버**: 비로그인 사용자 식별 불가 (anonymousId 방식은 복잡도 증가)
- **결론**: sessionStorage + 최대 5건 보관 + 이관 후 삭제

### ADR-3: 왜 카카오 로그인을 포함하는가?

- **대상 사용자**: 40~60대 한국인 → 카카오 계정 보유율이 Google보다 높음
- **Supabase 지원**: Kakao를 공식 OAuth provider로 지원
- **설정 요구**: 카카오 Developer 앱 등록 + 도메인 설정 필요
- **결론**: MVP에 카카오 포함 (사용자 전환율 직접 영향)
