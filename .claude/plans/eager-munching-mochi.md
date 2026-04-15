# Plan: 포커스 시 전체 선택(Select-on-Focus) 전역 적용

## Context

현재 상태:
- 이 프로젝트의 모든 기존 입력 필드는 `onFocus={(e) => e.target.select()}`를 개별 추가하여 규칙을 지킴
- 문제: 새로운 `<input>`/`<textarea>`를 추가할 때마다 개발자가 수동으로 붙여야 함 → 누락 가능성 존재
- `~/.claude/CLAUDE.md` 파일 미존재 → 다른 프로젝트에서는 이 규칙이 자동 적용되지 않음
- 사용자 요청: 이미 값이 있는 필드에 커서가 들어오면 **자동으로 전체 선택** → 모든 프로젝트에 적용

목표:
1. **이 프로젝트**: 이벤트 위임(event delegation) 방식으로 **모든 input/textarea에 자동 적용**
2. **모든 프로젝트**: Claude Code 사용자 전역 규칙(`~/.claude/CLAUDE.md`)에 등록

---

## 구현 계획

### Step 1 — `~/.claude/CLAUDE.md` 생성 (전역 규칙)

**경로**: `/Users/mynote/.claude/CLAUDE.md`

모든 프로젝트에서 Claude Code가 코드를 작성할 때 자동으로 따르는 사용자 전역 규칙.
아래 내용으로 생성:

```markdown
# Global Coding Rules — kwonohjik

## Input Select-on-Focus (모든 프로젝트 필수)

텍스트·숫자 입력 필드에 커서가 들어오면 기존 값을 전체 선택해야 한다.

### 적용 방법 (우선순위 순)

1. **프로젝트에 SelectOnFocusProvider가 있으면**: 별도 처리 불필요 — 자동 적용
2. **공유 컴포넌트(CurrencyInput, DateInput 등)**: 컴포넌트 내부에 내장
3. **개별 `<input>`/`<textarea>` 직접 작성 시**: 반드시 추가
   ```tsx
   onFocus={(e) => e.target.select()}
   ```

### 대상 타입
- `type="text"`, `type="number"`, `type="email"`, `type="tel"`, `type="password"`, `type="search"`, `type="url"`
- `<textarea>`

### 제외 타입
- `type="checkbox"`, `type="radio"`, `type="submit"`, `type="button"`, `type="file"`, `type="hidden"`, `type="range"`, `type="color"`
```

---

### Step 2 — `SelectOnFocusProvider` 컴포넌트 생성

**경로**: `/Users/mynote/workspace/Property-related-Taxes/components/providers/SelectOnFocusProvider.tsx`

이벤트 위임(capture phase)을 사용해 document 전체의 focus 이벤트를 감지.
개별 컴포넌트에 `onFocus`를 추가하지 않아도 자동 적용됨.

```tsx
"use client";
import { useEffect } from "react";

// 전체 선택 대상 input type 목록
const SELECT_ON_FOCUS_TYPES = new Set([
  "text", "number", "email", "tel", "password", "search", "url", "",
]);

export function SelectOnFocusProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const handleFocus = (e: FocusEvent) => {
      const target = e.target as HTMLInputElement | HTMLTextAreaElement;
      if (target.tagName === "TEXTAREA") {
        requestAnimationFrame(() => target.select());
        return;
      }
      if (
        target.tagName === "INPUT" &&
        SELECT_ON_FOCUS_TYPES.has((target.type ?? "").toLowerCase())
      ) {
        requestAnimationFrame(() => target.select());
      }
    };

    document.addEventListener("focus", handleFocus, true); // capture phase
    return () => document.removeEventListener("focus", handleFocus, true);
  }, []);

  return <>{children}</>;
}
```

**`requestAnimationFrame` 사용 이유**: Chrome에서 `mousedown` 직후 `focus` 이벤트가 발생하면 select() 후 커서 위치가 덮어쓰여질 수 있음. rAF로 한 프레임 지연시켜 안정적으로 선택됨.

---

### Step 3 — `app/layout.tsx`에 SelectOnFocusProvider 추가

**경로**: `/Users/mynote/workspace/Property-related-Taxes/app/layout.tsx`

기존 `ThemeProvider` 안쪽에 `SelectOnFocusProvider`를 래핑:

```tsx
// 변경 전
<ThemeProvider ...>
  <AuthMigrationListener />
  {children}
</ThemeProvider>

// 변경 후
<ThemeProvider ...>
  <SelectOnFocusProvider>
    <AuthMigrationListener />
    {children}
  </SelectOnFocusProvider>
</ThemeProvider>
```

---

### Step 4 — 메모리 업데이트

**경로**: `/Users/mynote/.claude/projects/-Users-mynote-workspace-Property-related-Taxes/memory/feedback_select_on_focus.md`

`SelectOnFocusProvider`로 전역 처리됨을 반영하여 업데이트.

---

## 수정 파일 목록

| 파일 | 작업 |
|------|------|
| `~/.claude/CLAUDE.md` | **신규 생성** — 사용자 전역 규칙 |
| `components/providers/SelectOnFocusProvider.tsx` | **신규 생성** — 이벤트 위임 provider |
| `app/layout.tsx` | **수정** — SelectOnFocusProvider 추가 |
| `memory/feedback_select_on_focus.md` | **수정** — 전역 provider 반영 |

> 기존 공유 컴포넌트(CurrencyInput, DateInput, AddressSearch)의 개별 `onFocus` 핸들러는
> 유지 (명시적 의도 + provider와 중복이나 무해함).

---

## 검증 방법

1. `npm run build` — 빌드 오류 없음 확인
2. `npm run dev` — 개발 서버 실행
3. 양도소득세 계산기에서:
   - 금액 입력 후 다른 필드 클릭 → 원래 필드 클릭 → 전체 선택 확인
   - 숫자 입력 필드(거주기간, 토지면적 등) 동일 확인
   - DateInput 연/월/일 각 필드 확인
4. 신규 `<input>` 추가 시 `onFocus` 없어도 자동 선택됨 확인
