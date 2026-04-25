# 입력폼 가시성 개선 — 상세 설계서

**Feature ID**: `form-visibility-improvement`
**작성일**: 2026-04-25
**작성자**: Claude Code (Opus 4.7)
**PDCA Phase**: Design
**상태**: 초안
**관련 계획서**: [`docs/01-plan/form-visibility-improvement.plan.md`](../../01-plan/form-visibility-improvement.plan.md)
**참조 디자인**: 국세청 홈택스 양도소득세 신고 화면 (사용자 제공 스크린샷 2026-04-25)

---

## 목차

1. [설계 목표 및 비범위](#1-설계-목표-및-비범위)
2. [현행 시스템 분석](#2-현행-시스템-분석)
3. [디자인 토큰 매핑](#3-디자인-토큰-매핑)
4. [컴포넌트 상세 설계](#4-컴포넌트-상세-설계) → 별도 파일 [`form-visibility-improvement.components.md`](./form-visibility-improvement.components.md)
5. [레이아웃 시스템](#5-레이아웃-시스템)
6. [Store Selector 설계](#6-store-selector-설계)
7. [기존 컴포넌트와의 통합](#7-기존-컴포넌트와의-통합)
8. [접근성·반응형 규칙](#8-접근성반응형-규칙)
9. [마이그레이션 전략](#9-마이그레이션-전략)
10. [테스트 전략](#10-테스트-전략)
11. ~~부록 — DOM 구조 청사진~~ → 컴포넌트 명세서로 이관

---

## 1. 설계 목표 및 비범위

### 1.1 목표 (계획서 §1.3 재명시)

- 모든 입력 필드를 **카드형 컨테이너**로 일관 래핑
- **2-컬럼 그리드 + 섹션 헤더**로 정보 구조 가시화
- **좌측 진척·요약 사이드바** 도입 (lg+)
- 양도세 마법사의 **데이터 구조·검증 로직·zustand store는 변경 없음**

### 1.2 비범위

- 엔진 로직, 새 입력 필드, 검증 룰
- 디자인 토큰/색상 팔레트 변경 (shadcn 토큰 그대로 사용)
- 결과 화면(`results/*ResultView.tsx`) 재디자인
- `CompanionAssetCard.tsx` (1000줄 근접) 내부 구조 변경 — 외곽만 적용

---

## 2. 현행 시스템 분석

### 2.1 입력 필드 구조 패턴 (현행 — Step1.tsx)

```tsx
// 현행 — div + label + input (시각적 그룹화 없음)
<div className="space-y-1.5">
  <label className="block text-sm font-medium">
    양도일 <span className="text-destructive">*</span>
  </label>
  <DateInput value={...} onChange={...} />
  <p className="text-xs text-muted-foreground">잔금 청산일 또는 등기 접수일 중 빠른 날</p>
</div>
```

| 요소 | 현행 클래스 | 한계 |
|---|---|---|
| 외곽 | 없음 | 필드끼리 시각 경계 모호 |
| 라벨 | `text-sm font-medium` | 강조 약함 |
| 필수 마커 | `<span className="text-destructive">*</span>` (라벨 우측) | 위치·간격 정의 없음 |
| hint | `text-xs text-muted-foreground` | 일관 |

### 2.2 레이아웃 구조 (현행 — TransferTaxCalculator.tsx)

```
┌──────────────────────────────────────────────────────────┐
│ Header (제목 + 설명)                                      │
├──────────────────────────────────────────────────────────┤
│ StepIndicator (상단 가로 진행 바)                          │
├──────────────────────────────────────────────────────────┤
│ Step{N} 본문 (full width)                                │
│   - space-y-{4,6} 만으로 필드 분리                        │
├──────────────────────────────────────────────────────────┤
│ 네비게이션 버튼 (뒤로 / 다음)                             │
└──────────────────────────────────────────────────────────┘
```

### 2.3 진단 요약

| # | 진단 항목 | 현재 | 목표 |
|---|---|---|---|
| 1 | 필드 시각 경계 | 여백만 | `border + bg-card + radius-lg` 카드 |
| 2 | 라벨 영역 | 입력 위 (vertical) | 데스크톱 좌측 고정폭, 모바일 위 (responsive) |
| 3 | 섹션 헤더 | 텍스트만 | 좌측 점/아이콘 + bottom border + 우측 액션 슬롯 |
| 4 | 진행 표시 | 상단 StepIndicator만 | 좌측 사이드바(lg+) + 상단 폴백(lg 미만) |
| 5 | 결과 미리보기 | 없음 | 사이드바 하단 요약 패널 (양도가액·취득가액·예상 세액) |
| 6 | 인라인 단위 | 컴포넌트별 상이 | `FieldCard`의 `unit` 슬롯으로 통일 |
| 7 | 인라인 액션 | 컴포넌트별 상이 | `FieldCard`의 `trailing` 슬롯으로 통일 |

---

## 3. 디자인 토큰 매핑

`app/globals.css`의 shadcn/Tailwind v4 토큰을 그대로 활용. **신규 토큰은 추가하지 않는다**.

### 3.1 색상 토큰

| 용도 | Tailwind 클래스 | CSS 변수 | 설명 |
|---|---|---|---|
| 카드 배경 | `bg-card` | `--card` | 입력 필드 카드 외곽 |
| 카드 텍스트 | `text-card-foreground` | `--card-foreground` | 카드 내부 기본 텍스트 |
| 라벨 텍스트 | (default) | `--foreground` | 카드 내 라벨 — 카드 배경과의 충분한 대비 |
| hint·placeholder | `text-muted-foreground` | `--muted-foreground` | 보조 설명 |
| 필수 마커·warning | `text-destructive` | `--destructive` | 빨간 `*`, 경고 메시지 |
| 경계선 | `border-border` (기본 `border`) | `--border` | 카드 테두리 |
| 활성 단계 (사이드바) | `bg-primary text-primary-foreground` | `--primary` | 현재 단계 강조 |
| 완료 단계 | `text-primary` (foreground는 그대로) | `--primary` | 체크 아이콘 색 |
| 섹션 점 표시 | `bg-primary` (작은 dot) | `--primary` | 섹션 헤더 좌측 |
| 카드 hover | `bg-muted/40` | `--muted` | 인터랙티브 카드 |
| 섹션 액션 버튼 | shadcn `<Button variant="outline" size="sm">` | — | 우측 슬롯 |

### 3.2 spacing·radius·typography 토큰

| 용도 | 클래스 | 값 |
|---|---|---|
| 카드 radius | `rounded-lg` | `var(--radius)` = `0.625rem` |
| 카드 패딩 | `px-4 py-3` | 16px / 12px |
| 카드 사이 간격 | `space-y-3` (필드끼리), `space-y-6` (섹션끼리) | 12px / 24px |
| 섹션 헤더 하단 간격 | `mb-3 pb-2 border-b` | 12px |
| 라벨 폭 (lg+) | `120px` 고정 (또는 grid `[120px_1fr]`) | — |
| 라벨 폰트 | `text-sm font-medium` | 14px / 500 |
| hint 폰트 | `text-xs` | 12px |
| 사이드바 폭 (lg+) | `w-72` (288px) | — |
| 본문 max-width | `max-w-3xl` (사이드바와 함께 3-col grid 시) | 768px |

### 3.3 ring·focus 토큰

기존 `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring` 패턴 그대로 유지.

---

## 4. 컴포넌트 상세 설계

> 800줄 정책 준수를 위해 컴포넌트별 Props·시각 명세·DOM 구조·사용 예시를 별도 파일로 분리했습니다.
>
> **→ [`form-visibility-improvement.components.md`](./form-visibility-improvement.components.md)** 참조

요약:

| # | 컴포넌트 | 파일 | 역할 |
|---|---|---|---|
| 4.1 | `FieldCard` | `components/calc/inputs/FieldCard.tsx` (신규) | 입력 1개를 카드형 컨테이너로 래핑. label·required·hint·warning·trailing·unit·badge·htmlFor 슬롯. |
| 4.2 | `SectionHeader` | `components/calc/shared/SectionHeader.tsx` (신규) | 섹션 그룹 헤더. title·description·action·leading 슬롯. |
| 4.3 | `WizardSidebar` | `components/calc/shared/WizardSidebar.tsx` (신규) | lg+ 좌측 sticky 진척·요약 사이드바. steps·summary·title·forceShow props. |

파일 크기 예산: 3개 모두 단일 파일 + 800줄 정책 여유 충분.

---

## 5. 레이아웃 시스템

### 5.1 페이지 그리드

```
[lg+]  ┌─ Wizard 페이지 (max-w-6xl mx-auto px-4) ────────────────┐
       │  Header (제목)                                            │
       ├──────┬───────────────────────────────────────────────────┤
       │      │  SectionHeader                                    │
       │ Side │  ┌─ FieldCard ─┐  ┌─ FieldCard ─┐                │
       │ bar  │  │             │  │             │  ← grid 2-col  │
       │      │  └─────────────┘  └─────────────┘                │
       │ (sti │  ┌─ FieldCard (full width) ─┐                    │
       │ cky) │  └──────────────────────────┘                    │
       │      │  네비게이션 버튼 (뒤로 / 다음)                     │
       └──────┴───────────────────────────────────────────────────┘

[lg-]  ┌─ Wizard 페이지 (max-w-3xl mx-auto px-4) ────────────────┐
       │  Header                                                  │
       │  StepIndicator (가로) ← lg 미만에서만 표시                │
       │  SectionHeader                                           │
       │  ┌─ FieldCard ─┐                                         │
       │  └─────────────┘                                         │
       │  ┌─ FieldCard ─┐                                         │
       │  └─────────────┘                                         │
       │  ...                                                     │
       │  네비게이션 버튼                                          │
       └──────────────────────────────────────────────────────────┘
```

### 5.2 `TransferTaxCalculator` 레이아웃 변경

```tsx
// app/calc/transfer-tax/TransferTaxCalculator.tsx (개편 후 골격)
return (
  <div className="mx-auto max-w-6xl px-4 py-8">
    <header className="mb-6">
      <h1 className="text-2xl font-bold">양도소득세 계산</h1>
      <p className="text-sm text-muted-foreground">
        부동산 양도 시 부담할 양도소득세를 계산합니다.
      </p>
    </header>

    {/* lg 미만: 상단 가로 진행 바 */}
    <div className="lg:hidden">
      <StepIndicator
        steps={STEP_LABELS}
        current={currentStep}
        onStepClick={handleStepClick}
      />
    </div>

    <div className="lg:grid lg:grid-cols-[18rem_1fr] lg:gap-8">
      <WizardSidebar
        title="양도소득세"
        steps={sidebarSteps}
        summary={sidebarSummary}
      />

      <main className="space-y-6">
        {/* 현재 Step 본문 */}
        {currentStep === 0 && <Step1 form={form} onChange={setForm} />}
        {/* ... */}

        {/* 네비게이션 */}
        <div className="flex justify-between border-t pt-4">
          <Button variant="outline" onClick={handleBack}>뒤로</Button>
          <Button onClick={handleNext}>다음</Button>
        </div>
      </main>
    </div>
  </div>
);
```

### 5.3 Step 본문 내부 그리드 패턴

각 Step 본문은 `space-y-6`로 섹션 분리, 섹션 내부는 `grid grid-cols-1 lg:grid-cols-2 gap-3`로 카드 배치.

```tsx
// steps/Step1.tsx (개편 후 양도일·신고일 부분)
<section>
  <SectionHeader
    title="기본정보"
    description="계약·신고 정보를 입력하세요"
  />
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
    <FieldCard label="양도일" required hint="잔금 청산일 또는 등기 접수일 중 빠른 날"
               warning={isFilingOverdue(...) && "..."}>
      <DateInput value={form.transferDate} onChange={...} />
    </FieldCard>
    <FieldCard label="신고일"
               hint={form.transferDate ? `신고기한: ${getFilingDeadline(...)}` : "양도일 입력 시 표시됩니다"}>
      <DateInput value={form.filingDate} onChange={...} />
    </FieldCard>
  </div>
</section>

<section>
  <SectionHeader title="양도자산" description="자산을 1건 이상 입력하세요" />
  {/* CompanionAssetsSection — 기존 그대로 (내부 카드화는 후속 PR) */}
</section>
```

---

## 6. Store Selector 설계

`lib/stores/calc-wizard-store.ts`의 **스키마는 변경하지 않는다**. selector만 추가.

### 6.1 `useTransferSummary()` (새 selector)

```typescript
// lib/stores/calc-wizard-store.ts (추가만)
import { type TransferFormData } from "./calc-wizard-store";

export interface TransferSummary {
  totalSalePrice: number;     // 양도가액 합계 (assets.actualSalePrice 합)
  totalAcqPrice: number;       // 취득가액 합계 (assets.fixedAcquisitionPrice 합)
  totalNecessaryExpense: number; // 필요경비 합계 (assets.necessaryExpense 합) — 필드 없으면 0
  netTransferIncome: number;   // 양도가액 - 취득가액 - 필요경비 (음수 가능)
  estimatedTax: number | null; // 엔진 호출 결과가 있으면 그 값, 없으면 null
}

export function useTransferSummary(): TransferSummary {
  return useCalcWizardStore((state) => {
    const f = state.transferForm;
    const totalSalePrice = f.assets.reduce(
      (acc, a) => acc + parseAmount(a.actualSalePrice || "0"),
      0
    );
    const totalAcqPrice = f.assets.reduce(
      (acc, a) => acc + parseAmount(a.fixedAcquisitionPrice || "0"),
      0
    );
    const totalNecessaryExpense = f.assets.reduce(
      (acc, a) => acc + parseAmount(a.necessaryExpense || "0"),
      0
    );
    return {
      totalSalePrice,
      totalAcqPrice,
      totalNecessaryExpense,
      netTransferIncome: totalSalePrice - totalAcqPrice - totalNecessaryExpense,
      estimatedTax: state.transferResult?.totalTax ?? null,
    };
  });
}
```

### 6.2 selector → `WizardSidebarSummaryItem[]` 매핑

```typescript
// app/calc/transfer-tax/TransferTaxCalculator.tsx 내부
const summary = useTransferSummary();

const sidebarSummary: WizardSidebarSummaryItem[] = [
  { label: "양도가액 합계", value: summary.totalSalePrice },
  { label: "취득가액 합계", value: summary.totalAcqPrice },
  { label: "필요경비 합계", value: summary.totalNecessaryExpense },
  { label: "양도소득금액", value: summary.netTransferIncome },
  { label: "납부할 세액", value: summary.estimatedTax, highlight: true },
];
```

> **주의**: `estimatedTax`는 결과 화면을 거쳐야만 값이 채워진다 (계산 전에는 `null` → 사이드바에 `—` 표시). 계획서 §6 위험 항목 "사용자 혼동" 대응안.

### 6.3 step 상태 매핑

```typescript
const STEP_LABELS = [
  "기본사항",
  "취득 상세",
  "보유 상황",
  "감면·공제",
  "가산세",
] as const;

const sidebarSteps: WizardSidebarStep[] = STEP_LABELS.map((label, i) => ({
  label,
  status: i < currentStep ? "done" : i === currentStep ? "active" : "todo",
  onClick: () => handleStepClick(i),
}));
```

---

## 7. 기존 컴포넌트와의 통합

### 7.1 `CurrencyInput` — 카드 모드

`CurrencyInput`은 라벨 내장 모드를 유지하되, `FieldCard`로 외부 래핑 시에는 `label=""`로 비워야 라벨 중복이 없다.

```tsx
// 기존 (단독 모드) — 그대로 동작
<CurrencyInput label="양도가액" value={...} onChange={...} required />

// 신규 (카드 모드)
<FieldCard label="양도가액" required unit="원">
  <CurrencyInput label="" value={...} onChange={...} />
</FieldCard>
```

**리스크**: `CurrencyInput`의 내부 `<span className="...">원</span>` (line 100)이 카드의 `unit` 슬롯과 중복. 해결안:

| 옵션 | 평가 | 결정 |
|---|---|---|
| A. `CurrencyInput`에 `hideUnit` prop 추가 | 가장 깔끔하지만 컴포넌트 수정 필요 | ✅ 채택 |
| B. `FieldCard`에서 `unit` 미사용, `CurrencyInput` 내장 유닛만 사용 | 단위 위치가 입력창 내부(`pr-8`)로 표준 차이 | 차선 |
| C. 무시 (단위 2번 표시) | UX 저하 | ❌ |

→ **결정**: `CurrencyInput`에 `hideUnit?: boolean` prop 1개 추가 (기존 동작 무변경, default false). 카드 모드에서 `hideUnit` true로 호출.

### 7.2 `DateInput`

`DateInput`은 외부에 라벨 슬롯이 없으므로 별도 수정 불필요.

```tsx
<FieldCard label="양도일" required>
  <DateInput value={form.transferDate} onChange={...} />
</FieldCard>
```

### 7.3 `Select` (shadcn)

```tsx
<FieldCard label="신고구분" required>
  <Select value={...} onValueChange={...}>
    <SelectTrigger className="w-full">
      <SelectValue>{getLabel(value)}</SelectValue>
    </SelectTrigger>
    <SelectContent>...</SelectContent>
  </Select>
</FieldCard>
```

> 메모리 규칙(`feedback_select_component`): `<SelectValue />` 단독 사용 금지, 명시적 한국어 라벨 표시. `getLabel()`로 매핑.

### 7.4 `RadioGroup` / 토글 버튼 그룹

라벨이 그룹 전체에 적용되는 경우 `FieldCard`로 감싸기.

```tsx
<FieldCard label="신고구분" required>
  <div className="flex gap-2">
    <Button variant={mode === "preliminary" ? "default" : "outline"} onClick={...}>예정</Button>
    <Button variant={mode === "final" ? "default" : "outline"} onClick={...}>확정</Button>
  </div>
</FieldCard>
```

### 7.5 `StepIndicator` (기존)

- 시그니처 유지 (`steps`, `current`, `onStepClick`).
- 호출부에서 `lg:hidden` 래퍼로 lg 미만에만 노출.
- `WizardSidebar`와 동일한 `STEP_LABELS` 배열 공유.

### 7.6 `CompanionAssetCard` (1000줄 근접)

- **이번 작업에서 내부 변경 없음**.
- 외곽만 `FieldCard` 대신 기존 그대로 두되, 상위 `Step1`에서 `<SectionHeader title="양도자산">`으로 그룹 라벨링만 추가.

---

## 8. 접근성·반응형 규칙

### 8.1 접근성 (a11y)

| 항목 | 규칙 |
|---|---|
| 라벨-입력 연결 | `FieldCard`의 `htmlFor` prop을 받아 `<label htmlFor>` 속성으로 전달. 입력 컴포넌트에 `id` 명시 |
| 필수 마커 음성 | `<span className="text-destructive" aria-hidden>*</span>` + 라벨 텍스트에 `(필수)` 부착 OR `aria-required` 속성 |
| 진행 단계 | `<nav aria-label="진행 단계">`, 현재 단계 `aria-current="step"` |
| 사이드바 영역 | `<aside>` 요소 사용 |
| 키보드 네비게이션 | StepRow가 `<button>`이면 Tab 순서 자연스럽게 따라감 |
| 포커스 링 | 모든 인터랙티브 요소 `focus-visible:ring-2 focus-visible:ring-ring` 유지 |

### 8.2 반응형 breakpoint

| Breakpoint | 폭 | 적용 |
|---|---|---|
| `< sm` (모바일) | <640px | 카드 라벨 위·입력 아래, 그리드 1-col |
| `sm` (태블릿) | ≥640px | 카드 라벨 좌측·입력 우측, 본문 그리드 1-col |
| `lg` (노트북+) | ≥1024px | 좌측 사이드바 노출, 본문 그리드 2-col |
| `xl` (대형) | ≥1280px | (선택) max-width 7xl 확장 — 이번 작업 범위 외 |

> 계획서 §6 위험 "13" 노트북에서 좁아짐"은 1024px에서 사이드바 288px + 본문 max-w-3xl(768px) = 1056px이라 12px 여유. gap 32px 포함 시 ~1088px 최소 권장. 16:10 1280×800 노트북은 안전. 16:9 1366×768은 살짝 빠듯 — Phase 3에서 검증.

---

## 9. 마이그레이션 전략

### 9.1 단계별 롤아웃

계획서 §4의 Phase 진행 순서를 그대로 따르되, 각 Phase의 **commit 단위**를 다음과 같이 분리한다:

| Phase | Commit | 산출물 |
|---|---|---|
| 1 | `feat(ui): FieldCard·SectionHeader·WizardSidebar 공용 컴포넌트 추가` | 컴포넌트 3종 |
| 2.1 | `refactor(transfer): TransferTaxCalculator 사이드바 레이아웃 도입` | 페이지 그리드 + StepIndicator lg:hidden |
| 2.2 | `refactor(transfer): Step1 입력 카드화 + SectionHeader 적용` | Step1 |
| 2.3 | `refactor(transfer): Step3 입력 카드화` | Step3 |
| 2.4 | `refactor(transfer): Step4 입력 카드화 + 섹션 분리` | Step4 |
| 2.5 | `refactor(transfer): Step5 입력 카드화` | Step5 |
| 2.6 | `refactor(transfer): Step6 입력 카드화` | Step6 |
| 2.7 | `feat(store): useTransferSummary selector 추가` | selector + 사이드바 연동 |

> **롤백 안전성**: 각 commit은 단독으로 빌드 가능. Phase 1만 머지된 상태에서도 기존 양도세 마법사가 정상 동작 (FieldCard는 미사용 컴포넌트로 남아있음).

### 9.2 호환성 보증

- **store 스키마 무변경** → sessionStorage에 저장된 게스트 결과는 그대로 복원됨.
- **API 스키마 무변경** → 백엔드 영향 없음.
- **테스트 무변경** → 엔진 회귀 테스트(80 파일) 그린 유지.

### 9.3 후속 PR (Phase 4 — 본 설계 범위 외)

각 세목 적용 시 **본 설계 문서를 그대로 재사용** (FieldCard·SectionHeader·WizardSidebar 시그니처 동일). 세목별 차이는 sidebar `summary` 항목 및 `STEP_LABELS`만:

| 세목 | summary 항목 | STEP_LABELS |
|---|---|---|
| 취득세 | 취득가액 / 시가표준액 / 산출세액 / 부가세 | 취득정보 / 물건상세 / 결과 |
| 재산세 | 공시가격 합계 / 과세표준 / 산출세액 | 자산입력 / 결과 |
| 종부세 | 합산 공시가격 / 공정시장가액 / 산출세액 | 자산입력 / 합산배제 / 결과 |
| 상속세 | 상속재산 / 공제합계 / 산출세액 | 재산입력 / 공제 / 결과 |
| 증여세 | 증여재산 / 공제 / 산출세액 | 재산입력 / 공제 / 결과 |

---

## 10. 테스트 전략

### 10.1 기존 회귀 테스트

- `npm test`(80 파일 / 1,484 cases) 전부 그린 유지.
- 본 작업은 **UI shell만 교체** → 엔진 테스트 무변경 보장.

### 10.2 신규 컴포넌트 단위 테스트 (선택)

본 프로젝트는 엔진 중심 테스트 정책. UI 컴포넌트는 단위 테스트 대신 **Phase 3 시각 회귀 점검**으로 대체. 단, 다음 1개는 단위 테스트 권장:

- `useTransferSummary` selector
  - 자산 0건 → 모든 합계 0
  - 자산 1건 + 양도가액 1억 + 취득가액 5천 + 필요경비 100만 → totalSalePrice 100M, netTransferIncome 49M
  - 자산 3건 reduce 정확성

```typescript
// __tests__/stores/use-transfer-summary.test.ts (신규)
import { describe, it, expect } from "vitest";
import { useCalcWizardStore } from "@/lib/stores/calc-wizard-store";
import { renderHook } from "@testing-library/react";
import { useTransferSummary } from "@/lib/stores/calc-wizard-store";

describe("useTransferSummary", () => {
  it("자산 0건이면 모든 합계 0", () => { /* ... */ });
  it("3건 자산 양도가액·취득가액·필요경비 합산", () => { /* ... */ });
  it("estimatedTax는 transferResult.totalTax가 있으면 그 값, 없으면 null", () => { /* ... */ });
});
```

### 10.3 시각 회귀 점검 (Phase 3)

| 점검 항목 | 도구 |
|---|---|
| 데스크톱 1440×900에서 사이드바·본문 2-col 정상 표시 | 브라우저 dev tools |
| 노트북 1366×768에서 카드 폭 충분 | 〃 |
| 모바일 375×667에서 사이드바 숨김 + StepIndicator 노출 | 〃 |
| `FieldCard` 라벨 좌측 / 입력 우측 정렬 (sm+) | 〃 |
| `FieldCard` 라벨 위 / 입력 아래 (sm 미만) | 〃 |
| 사이드바 sticky 동작 (스크롤 시 따라옴) | 〃 |
| 입력 변경 시 사이드바 합계 즉시 갱신 | 〃 |
| Tab 키 순회 시 자연스러운 포커스 흐름 | 키보드 |
| Lighthouse 접근성 ≥95 | Lighthouse |

---

## 11. ~~부록 — DOM 구조 청사진~~ → 별도 파일로 이관

DOM 구조 청사진(Step1 "기본정보" 섹션 + 사이드바 활성 단계)은 컴포넌트 명세서에 포함되었습니다.

**→ [`form-visibility-improvement.components.md` §5 DOM 구조 청사진](./form-visibility-improvement.components.md#5-dom-구조-청사진)** 참조

---

## 12. 완료 기준 (DoD — Design 단계)

본 설계 문서가 다음을 만족하면 Do 단계로 이행 가능:

- [x] `FieldCard`·`SectionHeader`·`WizardSidebar` 3종의 Props·DOM 구조·시각 명세 완비
- [x] 모든 색·spacing·radius가 기존 shadcn 토큰으로 매핑됨 (신규 토큰 없음)
- [x] 양도세 마법사 레이아웃 변경안의 골격 코드 제시
- [x] `CurrencyInput` 호환 전략 결정 (`hideUnit` prop 추가)
- [x] store 스키마 무변경 + selector 1개 추가로 사이드바 요약 구현 경로 확정
- [x] 접근성·반응형 규칙 명시
- [x] 단계별 commit 분리 전략 + 롤백 안전성 확보
- [x] 테스트 전략 (회귀 그린 유지 + selector 단위 테스트)

---

> **Learning Point**: 이 설계서는 PDCA의 **Design** 단계 산출물입니다. 계획서(Plan)가 "무엇을·왜"를 정했다면, 설계서는 "어떻게"를 코드 수준으로 결정합니다. 다음 단계(**Do**)에서는 이 문서의 §4 Props 시그니처와 §11 DOM 청사진을 그대로 참조해 컴포넌트를 구현하면 됩니다. Phase 1 (`FieldCard`·`SectionHeader`·`WizardSidebar`) 구현부터 시작할지 알려주세요.
