---
name: tax-summary-sidebar-pattern
description: 세금 마법사 사이드바 합계 카드 표준 패턴. computeXxxSummary 순수 함수 (lib/stores/) + useMemo 래핑 + 0원·null 미표시 + result 도착 전후 분기 (입력값 추정 vs 엔진값). 데스크톱 sticky / 모바일 상단 grid 레이아웃. 무한 루프 방지 정책 강제.
trigger: 사이드바, sidebar, summary, compute summary, 합계 미리보기, 마법사 합계, useMemo selector, 사이드바 합계, 합계 카드, 8개 동기화 지점 ⑥, 지점 6
---

# tax-summary-sidebar-pattern — 마법사 사이드바 합계 표준

세금 마법사 우측(또는 상단) 합계 카드 표준 구현. 입력 도중 실시간 추정값 + 결과 도착 후 엔진 정확값을 일관되게 표시.

## 적용 시점

- 신규 세목 마법사에 사이드바 추가 (양도세는 적용·상속세 본 세션 추가 / 증여·취득·재산·종부 미적용)
- 8개 동기화 지점 ⑥ (사이드바 합계) 작업 시
- 기존 마법사가 result 도착 전 합계를 표시하지 못하는 경우

## 표준 구조 — 2 파일

### 1. 순수 함수 — `lib/stores/{tax-type}-summary.ts`

```ts
// lib/stores/{tax-type}-summary.ts
import type {
  // 폼 상태 타입 (FormState 부분 집합)
  // 결과 타입 (xxxTaxResult)
  // 필요한 엔진 도메인 타입
} from "@/lib/tax-engine/types/...";
import { evaluateXxx } from "@/lib/tax-engine/...";

export interface XxxSummaryFormInput {
  // 사이드바 계산에 필요한 폼 필드만 (전체 FormState X)
  // 양도세 예: assets, contractTotalPrice
  // 상속세 예: estateItems, presumedItems, debtItems, priorGifts ...
}

export interface XxxSummary {
  // ── 핵심 4필드 (세목별 의미만 다름) ──
  totalBase: number;          // ① 총 과세 대상
  taxableValue: number;       // ② 과세표준 또는 과세가액 (result 우선, 없으면 입력 추정)
  taxBase: number | null;     // ③ 과세표준 (result 도착 시만)
  estimatedTax: number | null; // ④ 최종 세액 (result 도착 시만)
  // ── 보조 메타 (fine-print용) ──
  // 합계의 구성 요소를 분해해서 보여줄 항목들
}

export function computeXxxSummary(
  form: XxxSummaryFormInput,
  result: XxxTaxResult | null,
): XxxSummary {
  // 1. 입력값으로 항목별 합산 (엔진 호출 없이 — heavy 연산 금지)
  //    필요 시 엔진의 작은 helper만 import (e.g. evaluatePresumedItem)
  // 2. 결과 도착 시 엔진 정확값 우선:
  //    const taxableValue = result?.taxableValue ?? inputEstimate;
  // 3. 과세표준·최종 세액은 result 도착 시만 (null fallback)
  return { ... };
}
```

**금지 패턴**:
- ❌ 엔진 메인 함수(calcXxxTax) 직접 호출 — 매 렌더 무거운 계산
- ❌ async/await — 순수 동기 함수
- ❌ Date.now() 등 비순수 호출 — useMemo 캐시 무효화

### 2. UI 컴포넌트 — `components/calc/{tax-type}/XxxSidebar.tsx`

```tsx
"use client";

import { useMemo } from "react";
import { formatKRW } from "@/components/calc/inputs/CurrencyInput";
import {
  computeXxxSummary,
  type XxxSummaryFormInput,
} from "@/lib/stores/{tax-type}-summary";
import type { XxxTaxResult } from "@/lib/tax-engine/types/...";

interface XxxSidebarProps {
  form: XxxSummaryFormInput;
  result: XxxTaxResult | null;
  className?: string;
}

export function XxxSidebar({ form, result, className = "" }: XxxSidebarProps) {
  // ★ useMemo 필수 — 매 렌더 새 객체 생성 시 무한 루프 (feedback_zustand_selector)
  // ★ ESLint react-hooks/preserve-manual-memoization 회피:
  //    의존성 배열에 [form, result]만 — 풀어쓰지 말 것
  const summary = useMemo(
    () => computeXxxSummary(form, result),
    [form, result],
  );

  // 0원·null 항목 미표시 — 입력 가능한 값만
  const hasAnyInput = summary.totalBase > 0;
  if (!hasAnyInput && !result) {
    return (
      <div className={`rounded-lg border border-border bg-muted/30 p-4 ${className}`}>
        <p className="text-xs text-muted-foreground italic">
          입력값을 추가하면 합계가 표시됩니다.
        </p>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border border-indigo-200 dark:border-indigo-900 bg-indigo-50/30 dark:bg-indigo-950/20 p-4 space-y-3 ${className}`}>
      <h3 className="text-xs font-bold text-indigo-900 dark:text-indigo-200 uppercase tracking-wide">
        합계 미리보기
      </h3>
      <div className="space-y-2">
        {summary.totalBase > 0 && <Row label="총 과세 대상" value={formatKRW(summary.totalBase)} />}
        {summary.taxableValue > 0 && <Row label="② 과세가액" value={formatKRW(summary.taxableValue)} highlight />}
        {summary.taxBase !== null && <Row label="③ 과세표준" value={formatKRW(summary.taxBase)} />}
        {summary.estimatedTax !== null && (
          <Row label="④ 자진납부세액" value={formatKRW(summary.estimatedTax)} highlight tone="primary" />
        )}
        {summary.taxBase === null && summary.taxableValue > 0 && (
          <p className="text-xs text-muted-foreground italic pt-1">
            과세표준·세액은 계산 실행 후 표시됩니다.
          </p>
        )}
      </div>
    </div>
  );
}

interface RowProps {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
  tone?: "primary" | "add" | "sub";
}

function Row({ label, value, sub, highlight, tone }: RowProps) {
  const valueClass =
    tone === "primary"
      ? "text-indigo-700 dark:text-indigo-300 font-bold"
      : tone === "add"
        ? "text-emerald-600 dark:text-emerald-400"
        : tone === "sub"
          ? "text-rose-600 dark:text-rose-400"
          : "";
  return (
    <div className={`flex items-baseline justify-between gap-2 ${highlight ? "border-t border-indigo-200 dark:border-indigo-900 pt-2" : ""}`}>
      <div className="flex-1 min-w-0">
        <p className={`text-xs ${highlight ? "font-semibold" : "text-muted-foreground"}`}>{label}</p>
        {sub && <p className="text-[10px] text-muted-foreground/80 mt-0.5">{sub}</p>}
      </div>
      <span className={`text-sm font-mono whitespace-nowrap ${valueClass}`}>{value}</span>
    </div>
  );
}
```

## 마법사 통합 — grid 레이아웃 1줄

```tsx
// XxxTaxForm.tsx
<div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6 items-start">
  <div className="min-h-[300px]">
    {/* 마법사 step 콘텐츠 */}
  </div>
  <aside className="lg:sticky lg:top-4 self-start order-first lg:order-last">
    <XxxSidebar form={form} result={result} />
  </aside>
</div>
```

**모바일 배치**: `order-first lg:order-last` — 모바일에서는 콘텐츠 위에, 데스크톱에서는 우측 sticky.

## anchor 테스트 4건 표준

`__tests__/tax-engine/{tax-type}/summary.test.ts`:

```ts
describe("computeXxxSummary — 4필드", () => {
  it("A-01 결과 미도착 시 입력값으로 총·과세가액 추정", () => {
    const summary = computeXxxSummary(formInput, null);
    expect(summary.totalBase).toBe(EXPECTED);
    expect(summary.taxBase).toBeNull();
    expect(summary.estimatedTax).toBeNull();
  });

  it("A-02 결과 도착 시 엔진값 사용 — taxBase·estimatedTax 채워짐", () => {
    const result = calcXxxTax(EXAMPLE_INPUT);
    const summary = computeXxxSummary(formInput, result);
    expect(summary.taxableValue).toBe(result.taxableValue);
    expect(summary.taxBase).toBe(EXPECTED_TAX_BASE);
    expect(summary.estimatedTax).toBe(EXPECTED_FINAL_TAX);
  });

  it("A-03 빈 폼 — 모두 0/null", () => { ... });

  it("A-04 legacy 모드 (해당 시) — 구필드 fallback", () => { ... });
});
```

## 정책 강제 (CLAUDE.md 준수)

| # | 규칙 | 적용 |
|---|---|---|
| Z1 | useMemo 없이 사용 금지 | 매 렌더 새 객체 → useSyncExternalStore 무한 루프 |
| Z2 | 의존성 배열에 `[form, result]`만 | preserve-manual-memoization ESLint 충돌 회피 |
| Z3 | 0원·null 미표시 | "입력 가능한 값만" 노출 (CLAUDE.md `feedback_사이드바_합계`) |
| Z4 | result 도착 전후 분기 | `result?.xxx ?? inputEstimate` 패턴 일관 |
| Z5 | tone 색조 정책 | indigo(highlight) / emerald(add) / rose(sub) / primary(final) |
| Z6 | sticky 위치 | `lg:sticky lg:top-4 self-start` (스크롤 시 따라감) |

## 본 프로젝트 적용 사례

| 세목 | 위치 | 4필드 |
|---|---|---|
| 양도세 | `lib/stores/calc-wizard-store.ts` (`computeTransferSummary`) | 양도가액·취득가액·필요경비·납부세액 |
| 상속세 | `lib/stores/inheritance-summary.ts` (`computeInheritanceSummary`) | 총상속·과세가액·과세표준·자진납부세액 |
| 증여세·취득세·재산세·종부세 | **미구현** — 본 skill 적용 대상 |

## 신규 세목 추가 워크플로

1. `lib/stores/{tax-type}-summary.ts` 신규 — 4필드 + 보조 메타 정의
2. `components/calc/{tax-type}/XxxSidebar.tsx` 신규 — useMemo 래핑
3. `XxxTaxForm.tsx` grid 레이아웃 1줄 추가
4. `__tests__/tax-engine/{tax-type}/summary.test.ts` anchor 4건
5. 회귀 0건 확인 + 8개 동기화 지점 ⑥ 체크박스 완료

## 트러블슈팅

| 증상 | 원인 | 해결 |
|---|---|---|
| 무한 루프 (Maximum update depth) | useMemo 누락 | `useMemo(() => compute..., [form, result])` 강제 |
| ESLint react-hooks/preserve-manual-memoization 오류 | 의존성 배열에 form.field 풀어쓰기 | `[form, result]`로 압축 |
| result 도착 후 합계 안 바뀜 | result?.xxx 미사용 | 4필드 모두 `result?.xxx ?? inputEstimate` |
| 결과 일치 안 함 (정확값 vs 추정값) | 입력 추정 산식이 엔진과 다름 | result 도착 시 무조건 엔진값 우선 |
