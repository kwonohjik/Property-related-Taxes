# 상속세 마법사 레이아웃 개선 설계서 (v3)

> **상태**: Design v3 (1차·2차 자체검토 + Plan↔Design 통합 비교 반영)

## v2 → v3 정정 (Plan ↔ Design 통합 비교)

| # | 카테고리 | 정정 |
|---|---|---|
| U-1 | 동기화 | Plan v4와 `top-36` 동기 확정 |
| U-2 | 참조 | Plan v4 §11(U-2)에 헤더↔페이지 폭 비대칭 명시 추가 — Design D-1과 동일 결론 |
| U-3 | 추가 검증 | Design §6 시나리오 매트릭스 M1~M12 + Plan §10 위험표 정합 ✅ — 추가 변경 없음 |
| U-4 | 회귀 안전 | StepIndicator className optional prop 추가가 다른 5대 마법사 호출처(transfer·gift·acquisition·property·comprehensive·stock-transfer-tax)에 영향 없음 — Plan §7 회귀 영향 평가와 동일 결론 |
> **작성일**: 2026-05-21

## v1 → v2 정정 (1차 자체검토)

| # | 카테고리 | 정정 |
|---|---|---|
| D-1 | **누락 (중대)** | 글로벌 헤더 `max-w-4xl`(896px) vs 페이지 `max-w-5xl`(1024px) — 의뢰인 배너 중앙선 페이지보다 좁아 시각 비대칭. 헤더는 다른 페이지(다른 마법사) 영향 차단을 위해 그대로 두되 **시각 비대칭은 의도된 동작**으로 명시 (의뢰인 배너 가독성 유지) |
| D-2 | 누락 | sticky offset `top-32`(128px) 실제 sticky 영역 ≈141px(헤더 56 + py-3 24 + StepIndicator ~60 + border 1)에 13px 부족 → **`top-36`(144px)** 권장 |
| D-3 | 누락 | `max-h-[calc(100vh-9rem)]` (144px 차감) — `top-36`(144px)과 정합 ✅ |
> **참조 Plan**: [`docs/00-pm/inheritance-wizard-layout-revamp.plan.md`](../../00-pm/inheritance-wizard-layout-revamp.plan.md) v3

---

## §1. 개요

상속세 마법사(`/calc/inheritance-tax`)의 UI 레이아웃을 다음 3가지로 개선:

1. **StepIndicator를 sticky로** — 헤더 바로 아래에 항상 노출
2. **합계 미리보기 사이드바를 좌측으로** — 입력 영역과 시각 인접
3. **페이지 폭을 1024px로 확장** — 자산 카드 영역 약 668px 확보

본 변경은 **상속세 마법사 한정**. 다른 5대 세금 마법사(양도·증여·취득·재산·종부)는 비변경.

### 1.1 변경 범위 요약

| 파일 | 변경 종류 | 영향 |
|---|---|---|
| `app/calc/inheritance-tax/page.tsx` | max-width 변경 | 상속세 페이지 |
| `components/calc/StepIndicator.tsx` | `className?` prop 추가 | 전 마법사 (옵셔널이라 회귀 0) |
| `components/calc/InheritanceTaxForm.tsx` | sticky 래퍼·grid 좌우 반전·사이드바 sticky | 상속세 폼 |

---

## §2. Before / After 시각화

### 2.1 Before (현행)

```
┌─ 글로벌 헤더 (sticky top-0, z-50, h-14) ───────────┐
│ 한국 부동산 세금 계산기 │ 의뢰인: 홍길동 [변경] │ ⋯ │
└────────────────────────────────────────────────────┘

  ┌─ max-w-2xl (672px) ──────────────┐
  │ 상속세 계산기 (h1)                 │
  │ 설명 텍스트                        │
  │                                    │
  │ ① ── ② ── ③ ── ④ ── ⑤            │  ← StepIndicator (스크롤 시 사라짐)
  │                                    │
  │ ┌─ 입력 영역 ─┐  ┌─ 사이드바 ─┐ │
  │ │ Step 1     │  │ 합계       │  │
  │ │ 자산 입력  │  │ 미리보기   │  │
  │ │ ~300px     │  │ 300px      │  │
  │ │            │  │ sticky     │  │
  │ └────────────┘  └────────────┘ │
  └────────────────────────────────────┘
```

### 2.2 After (변경 후)

```
┌─ 글로벌 헤더 (sticky top-0, z-50, h-14) ─────────────────────┐
│ 한국 부동산 세금 계산기 │ 의뢰인: 홍길동 [변경] │ ⋯           │
└──────────────────────────────────────────────────────────────┘

┌─ StepIndicator sticky (top-14, z-30, backdrop-blur) ─────────┐
│  ① ── ② ── ③ ── ④ ── ⑤                                       │ ← 항상 노출
└──────────────────────────────────────────────────────────────┘

  ┌─ max-w-5xl (1024px) ───────────────────────────────────┐
  │ 상속세 계산기 (h1)                                       │
  │ 설명 텍스트                                              │
  │                                                          │
  │ ┌─ 사이드바 ─┐  ┌─ 입력 영역 ───────────────────────┐ │
  │ │ 합계       │  │ Step 1                              │ │
  │ │ 미리보기   │  │ 자산 입력                           │ │
  │ │ 300px      │  │ 668px                               │ │
  │ │ sticky     │  │                                     │ │
  │ │ top-36     │  │                                     │ │
  │ └────────────┘  └─────────────────────────────────────┘ │
  └────────────────────────────────────────────────────────┘
  ※ 헤더(max-w-4xl=896px)와 페이지(max-w-5xl=1024px) 폭 불일치 —
    의뢰인 배너 시각 비대칭은 헤더 호환성 우선 의도된 동작
```

### 2.3 모바일 (lg 미만, < 1024px)

```
┌─ 글로벌 헤더 sticky ─────────────┐
└──────────────────────────────────┘
┌─ StepIndicator sticky ───────────┐
│ ① ② ③ ④ ⑤                       │
└──────────────────────────────────┘
┌─ 사이드바 (상단 stack, 비-sticky) ┐
│ 합계 미리보기                     │
└──────────────────────────────────┘
┌─ 입력 영역 ──────────────────────┐
│ Step 1 자산 입력                  │
└──────────────────────────────────┘
```

---

## §3. 구현 명세

### 3.1 `components/calc/StepIndicator.tsx` — className prop 추가

**Before**:
```tsx
export interface StepIndicatorProps {
  steps: string[];
  current: number;
  onStepClick?: (index: number) => void;
}

export function StepIndicator({ steps, current, onStepClick }: StepIndicatorProps) {
  return (
    <div className="flex items-center gap-1 mb-6">
      ...
```

**After**:
```tsx
export interface StepIndicatorProps {
  steps: string[];
  current: number;
  onStepClick?: (index: number) => void;
  /** root div에 추가 적용할 className (예: `!mb-0`로 기본 mb-6 override) */
  className?: string;
}

export function StepIndicator({ steps, current, onStepClick, className }: StepIndicatorProps) {
  return (
    <div className={cn("flex items-center gap-1 mb-6", className)}>
      ...
```

`cn()`은 이미 import 됨 (`import { cn } from "@/lib/utils";` 라인 3).

### 3.2 `app/calc/inheritance-tax/page.tsx` — max-w-5xl

**Before**: `<div className="mx-auto max-w-2xl px-4 py-8">`
**After**: `<div className="mx-auto max-w-5xl px-4 py-8">`

### 3.3 `components/calc/InheritanceTaxForm.tsx` — sticky·grid 좌우 반전

**Before** (라인 344-365):
```tsx
<StepIndicator steps={[...STEPS]} current={step} onStepClick={(i) => setStep(i)} />

<div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6 items-start">
  <div className="min-h-[300px]">
    {step === 0 && <Step0 form={form} set={set} />}
    {step === 1 && <Step1 form={form} set={set} />}
    {step === 2 && <Step2 form={form} set={set} />}
    {step === 3 && <Step3 form={form} set={set} />}
    {step === 4 && <Step4 form={form} set={set} />}
  </div>

  <aside className="lg:sticky lg:top-4 self-start order-first lg:order-last">
    <InheritanceSidebar form={form} result={result} />
  </aside>
</div>
```

**After**:
```tsx
{/* StepIndicator sticky — 헤더 바로 아래, 인쇄 시 일반 흐름 */}
<div className="sticky top-14 z-30 -mx-4 px-4 py-3 bg-background/95 backdrop-blur border-b border-border/60 mb-4 print:static print:bg-transparent print:backdrop-blur-0 print:border-0">
  <StepIndicator
    steps={[...STEPS]}
    current={step}
    onStepClick={(i) => setStep(i)}
    className="!mb-0"
  />
</div>

{/* 그리드: 데스크톱 좌(사이드바) / 우(입력) · 모바일 상단 stack · 인쇄 단일 컬럼 */}
<div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6 items-start print:block">
  {/* 사이드바 — 좌측 sticky (데스크톱) / 상단 stack (모바일·인쇄) */}
  <aside className="order-first lg:sticky lg:top-36 self-start max-h-[calc(100vh-9rem)] overflow-y-auto print:static print:max-h-none print:overflow-visible">
    <InheritanceSidebar form={form} result={result} />
  </aside>

  {/* 입력 영역 */}
  <div className="min-h-[300px]">
    {step === 0 && <Step0 form={form} set={set} />}
    {step === 1 && <Step1 form={form} set={set} />}
    {step === 2 && <Step2 form={form} set={set} />}
    {step === 3 && <Step3 form={form} set={set} />}
    {step === 4 && <Step4 form={form} set={set} />}
  </div>
</div>
```

---

## §4. CSS 클래스 명세

### 4.1 StepIndicator sticky 래퍼

| 클래스 | 효과 | 의도 |
|---|---|---|
| `sticky top-14` | 헤더(`h-14`=56px) 바로 아래 sticky | 의뢰인 배너 직하 |
| `z-30` | StepIndicator 영역 z-index | 헤더(z-50)·모달/드롭다운(z-50) 보다 낮음, 일반 input 보다 높음 |
| `-mx-4 px-4` | 컨테이너 padding 무시 full-bleed | 좌우 끝까지 backdrop 효과 |
| `py-3` | 상하 패딩 12px | StepIndicator 영역 시각 분리 |
| `bg-background/95 backdrop-blur` | 반투명 + 블러 | 스크롤 시 뒤 콘텐츠 가독성 ↑ |
| `border-b border-border/60` | 하단 경계선 | 본문과 시각 분리 |
| `mb-4` | sticky 영역 종료 후 본문 간격 | 24px |
| `print:static print:bg-transparent print:backdrop-blur-0 print:border-0` | 인쇄 시 sticky·블러·경계 해제 | 잉크 절약·자연 흐름 |

### 4.2 사이드바 aside

| 클래스 | 효과 |
|---|---|
| `order-first` | 모바일·인쇄에서 상단 표시 (현행 유지) |
| `lg:sticky lg:top-36` | 데스크톱에서 sticky, 헤더(56) + sticky 래퍼(py-3 24 + StepIndicator ~60 + border 1) = 141px → 여유 마진 144px(`top-36`) |
| `self-start` | grid 첫 행 위쪽 정렬 |
| `max-h-[calc(100vh-9rem)]` | 화면 잔여 영역 (헤더 56 + StepIndicator 80 + 여유 = 144px=9rem 차감) |
| `overflow-y-auto` | 합계 카드 길어지면 내부 스크롤 |
| `print:static print:max-h-none print:overflow-visible` | 인쇄 시 일반 흐름 |

### 4.3 grid 컨테이너

| 클래스 | 효과 |
|---|---|
| `grid grid-cols-1` | 모바일 단일 컬럼 |
| `lg:grid-cols-[300px_1fr]` | 데스크톱 좌 300px / 우 1fr (≈668px) |
| `gap-6` | 컬럼 간격 24px |
| `items-start` | 위쪽 정렬 |
| `print:block` | 인쇄 시 grid 해제, 자연 흐름 |

---

## §5. z-index 계층

```
z-50  글로벌 헤더 (app/layout.tsx:66)
z-50  모달 Dialog overlay/content (components/ui/dialog.tsx)
z-50  AddressSearch 드롭다운 (components/ui/address-search.tsx)
z-30  StepIndicator sticky 래퍼 (신규)
z-0   일반 콘텐츠 (사이드바·입력 영역)
```

별도 stacking context: 글로벌 헤더와 모달은 같은 z-50이지만 모달은 `fixed inset-0` 별도 컨텍스트 → 충돌 없음.

---

## §6. 시나리오 매트릭스 (브라우저 점검 필수)

| # | 시나리오 | 데스크톱(≥1024px) | 모바일(<1024px) | 인쇄 |
|---|---|---|---|---|
| M1 | 페이지 진입 | 헤더·StepIndicator sticky / 좌 사이드바 / 우 입력 영역 | 헤더·StepIndicator sticky / 사이드바 상단 stack / 입력 영역 | 일반 흐름 단일 컬럼 |
| M2 | 입력 영역 길게 스크롤 | StepIndicator·헤더·사이드바 모두 sticky 유지 | StepIndicator sticky 유지 / 사이드바 스크롤로 이동 | (해당 없음) |
| M3 | Step 1 자산 추가 (협의분할 토글) | 라벨 가로 표시 (자산 카드 폭 ≈668px) | 협의분할 토글 가시성 유지 | 단일 컬럼 |
| M4 | Step 4 공제 입력 (긴 폼) | 좌측 사이드바에서 실시간 합계 확인 | 사이드바는 상단 카드 — 스크롤로 이동 | 자연 흐름 |
| M5 | 사이드바 합계 매우 김 | 내부 `overflow-y-auto`로 사이드바 스크롤 | 자연 흐름 | 자연 흐름 |
| M6 | StepIndicator 클릭 (단계 이동) | 어느 스크롤 위치에서도 가능 | 동일 | (해당 없음) |
| M7 | 헤더 메뉴(계산 이력·테마 토글) 클릭 | StepIndicator(z-30) 위로 헤더(z-50) 메뉴 정상 표시 | 동일 | (해당 없음) |
| M8 | AddressSearch 자동완성 펼침 | 드롭다운(z-50) StepIndicator(z-30) 위에 표시 | 동일 | (해당 없음) |
| M9 | 결과 화면 진입 (계산 완료) | `if (result)` 분기로 InheritanceTaxResultView 단독 렌더 → StepIndicator 자체 미렌더 | 동일 | 결과 카드 자연 흐름 |
| M10 | 인쇄 (Cmd+P) | sticky·grid 해제 단일 컬럼 | 동일 | 적용 |
| M11 | 직전 PR3 협의분할 라벨 세로 표시 회귀 | 자산 영역 폭 668px로 자연 해소 | (모바일은 폭 제약 다름) | (해당 없음) |
| M12 | 다른 마법사 (양도·증여 등) | StepIndicator className 옵셔널 — 변경 없음 | 동일 | 동일 |

---

## §7. 회귀 영향 평가

| 영역 | 변경 | 회귀 위험 | 대응 |
|---|---|---|---|
| `StepIndicator.tsx` | className optional prop 추가 | 기존 호출처(transfer·gift·acquisition·property·comprehensive·stock-transfer-tax) 영향 없음 — 옵셔널 | tsc 통과 + 다른 마법사 브라우저 확인 |
| `app/calc/inheritance-tax/page.tsx` | max-w-2xl → max-w-5xl | 상속세 페이지만. 결과 카드는 `overflow-x-auto` 기존 처리 | 결과 화면 진입 시 가시 점검 |
| `InheritanceTaxForm.tsx` | sticky·grid·order 변경 | 상속세 폼만. 엔진/타입 무관 | 회귀 anchor 0 (UI만) |

자동 anchor 없음 — 브라우저 수동 점검 M1~M12로 대체.

---

## §8. 컴포넌트 의존 트리

```
app/layout.tsx (헤더 sticky top-0 z-50, max-w-4xl)
  ↓
app/calc/inheritance-tax/page.tsx (max-w-5xl ← 변경)
  ↓
ProfessionalClientGate
  ↓
InheritanceTaxForm (← 변경)
  ├─ StepIndicator (sticky 래퍼 안 ← 신규 className prop)
  │
  ├─ <div grid grid-cols-1 lg:grid-cols-[300px_1fr]>  ← 좌우 반전
  │   ├─ aside (order-first, lg:sticky top-32)
  │   │  └─ InheritanceSidebar
  │   └─ div (입력 영역)
  │      └─ Step0~Step4
  │
  └─ 결과 화면 분기 (result !== null)
      └─ InheritanceTaxResultView (sticky 무관)
```

---

## §9. 정책 사전 적용 ([[MEMORY.md]])

- [[feedback_useeffect_store_mirror_forbidden]] — useEffect 미사용 ✅
- [[tax-summary-sidebar-pattern]] — `InheritanceSidebar` 컴포넌트는 그대로, 위치만 변경 ✅
- [[feedback_macos_scrollbar_autohide_workaround]] — 자산 영역 폭 확대로 가로 스크롤 발생 가능성 감소. 발생 시 `HorizontalScrollContainer` 적용 ✅

---

## §10. 위험·대응

| 항목 | 위험 | 대응 |
|---|---|---|
| `mb-6` 중복 | StepIndicator 내부 + sticky 래퍼 mb-4 중복 → 영역 부풀려 | `className="!mb-0"` override |
| 사이드바 내용 길이 | 합계 카드 길어지면 sticky 영역 밖 | `max-h-[calc(100vh-9rem)] overflow-y-auto` |
| 인쇄 가독성 | sticky·blur 인쇄 시 잉크 비용 | `print:static print:backdrop-blur-0 print:bg-transparent print:border-0` |
| 다른 마법사 영향 | StepIndicator className 추가가 기존 호출처에 영향 | 옵셔널 prop — tsc 통과 |
| 결과 화면 max-w-5xl | 결과 카드(`HeirAllocationTable` 등) 폭 확대 | `overflow-x-auto` 기존 처리로 안전 |
| sticky offset 정확도 | StepIndicator 영역 높이 동적 변동 (모바일 라벨 줄바꿈) | `top-32`(128px) 여유 마진 |

---

## §11. Definition of Done

- [ ] `StepIndicator.tsx` className optional prop 추가, `cn()` 적용
- [ ] `app/calc/inheritance-tax/page.tsx` max-w-5xl
- [ ] `InheritanceTaxForm.tsx` StepIndicator sticky 래퍼
- [ ] grid `300px_1fr` 좌우 반전
- [ ] 사이드바 `order-first lg:sticky lg:top-36` + max-h + overflow-y-auto
- [ ] print: 처리 4종 (static·backdrop-blur-0·bg-transparent·border-0·block·max-h-none·overflow-visible)
- [ ] tsc 0 errors
- [ ] vitest 4,134 passed 유지
- [ ] 브라우저 체크리스트 M1~M12 통과
- [ ] 다른 마법사 영향 0건 (StepIndicator className 옵셔널 회귀 확인)
- [ ] 직전 PR3 협의분할 라벨 세로 표시 자연 해소 확인 (M3·M11)
