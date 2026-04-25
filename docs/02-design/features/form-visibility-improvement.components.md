# 입력폼 가시성 개선 — 컴포넌트 상세 명세 (부록)

**Feature ID**: `form-visibility-improvement`
**상위 문서**: [`form-visibility-improvement.design.md`](./form-visibility-improvement.design.md)
**작성일**: 2026-04-25
**범위**: §4 컴포넌트 상세 설계 + §11 DOM 청사진 (상위 설계서 800줄 정책 준수를 위해 분리)

---

## 목차

1. [`FieldCard`](#1-fieldcard)
2. [`SectionHeader`](#2-sectionheader)
3. [`WizardSidebar`](#3-wizardsidebar)
4. [컴포넌트 파일 크기 예산](#4-컴포넌트-파일-크기-예산)
5. [DOM 구조 청사진](#5-dom-구조-청사진)

---

## 1. `FieldCard`

**파일**: `components/calc/inputs/FieldCard.tsx` (신규)

### 1.1 책임

- 입력 컨트롤(`children`) 1개를 카드형 컨테이너로 감싼다.
- 라벨·필수 마커·hint·warning·trailing·unit 슬롯을 일관 배치.
- 데스크톱은 라벨 좌측·입력 우측, 모바일은 라벨 위·입력 아래.

### 1.2 Props

```typescript
export interface FieldCardProps {
  /** 라벨 텍스트 (필수). 빈 문자열이면 라벨 영역 자체를 숨김 (체크박스 그룹 등 라벨이 부적절한 경우) */
  label: string;
  /** 필수 마커(*) 표시 여부 */
  required?: boolean;
  /** 입력 컨트롤 (CurrencyInput, DateInput, Select, RadioGroup, ...) */
  children: React.ReactNode;
  /** 입력 아래 회색 보조 설명 */
  hint?: React.ReactNode;
  /** 입력 아래 빨간 경고 (hint와 별도 줄) */
  warning?: React.ReactNode;
  /** 입력 우측 인라인 액션 (예: <Button>검색</Button>). 단위와 동시 사용 시 trailing이 우선 */
  trailing?: React.ReactNode;
  /** 입력 우측 단위 표시 (예: "원", "㎡", "%"). trailing이 있으면 무시 */
  unit?: string;
  /** 라벨 영역 우측에 작은 보조 라벨 (예: 카드 #1, 자산 1번) */
  badge?: React.ReactNode;
  /** 카드 자체 disabled 표시 (입력은 children에서 별도 disabled 처리) */
  disabled?: boolean;
  /** 추가 className (외곽 div) */
  className?: string;
  /** 라벨이 가리키는 input의 id — 접근성 */
  htmlFor?: string;
}
```

### 1.3 시각 명세

```
┌─ FieldCard (데스크톱 sm+) ──────────────────────────────┐
│  [* 양도일]    │  [DateInput.................]  [원]    │
│  ↑ 120px      │  ↑ flex-1                    ↑ unit    │
│                │                                          │
│                │  ⚠ 신고기한을 지났습니다                 │  ← warning
│                │  잔금 청산일 또는 등기 접수일 중 빠른 날 │  ← hint
└──────────────────────────────────────────────────────────┘

┌─ FieldCard (모바일) ──────────────────────┐
│  * 양도일                                 │
│  [DateInput..........................][원]│
│  ⚠ 신고기한을 지났습니다                  │
│  잔금 청산일 또는 등기 접수일 중 빠른 날  │
└────────────────────────────────────────────┘
```

### 1.4 DOM 구조

```tsx
<div
  data-slot="field-card"
  data-disabled={disabled || undefined}
  className={cn(
    "rounded-lg border bg-card px-4 py-3",
    "grid gap-3 sm:grid-cols-[120px_1fr] sm:items-start",
    disabled && "opacity-60",
    className
  )}
>
  {/* 라벨 영역 */}
  {label && (
    <label
      htmlFor={htmlFor}
      className="flex items-center gap-1 text-sm font-medium pt-1.5 sm:pt-2"
    >
      {required && <span className="text-destructive" aria-hidden>*</span>}
      <span>{label}</span>
      {badge && <span className="ml-auto">{badge}</span>}
    </label>
  )}
  {/* 입력 영역 */}
  <div className="space-y-1.5">
    <div className="flex items-center gap-2">
      <div className="flex-1">{children}</div>
      {trailing ? (
        <div className="shrink-0">{trailing}</div>
      ) : unit ? (
        <span className="shrink-0 text-xs text-muted-foreground">{unit}</span>
      ) : null}
    </div>
    {warning && <p className="text-xs font-medium text-destructive">{warning}</p>}
    {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
  </div>
</div>
```

### 1.5 사용 예시

```tsx
// 양도세 Step1 — 양도일
<FieldCard
  label="양도일"
  required
  htmlFor="transfer-date"
  hint="잔금 청산일 또는 등기 접수일 중 빠른 날"
  warning={
    isFilingOverdue(form.transferDate, form.filingDate)
      ? `⚠ 신고기한(${getFilingDeadline(form.transferDate)})을 지났습니다 — 무신고·지연납부 가산세가 자동 적용됩니다.`
      : undefined
  }
>
  <DateInput
    id="transfer-date"
    value={form.transferDate}
    onChange={(v) => onChange({ transferDate: v })}
  />
</FieldCard>
```

```tsx
// 양도가액 — unit 슬롯 + CurrencyInput hideUnit
<FieldCard label="양도가액" required unit="원">
  <CurrencyInput
    label=""
    hideUnit
    value={form.assets[0].actualSalePrice}
    onChange={(v) => updateAsset(0, { actualSalePrice: v })}
  />
</FieldCard>
```

```tsx
// 주소 — trailing 슬롯
<FieldCard label="소재지" required hint="지번 주소 (조정대상지역·공시가격 조회용)"
           trailing={<Button size="sm" variant="outline" onClick={openSearch}>검색</Button>}>
  <Input value={address} readOnly />
</FieldCard>
```

---

## 2. `SectionHeader`

**파일**: `components/calc/shared/SectionHeader.tsx` (신규)

### 2.1 책임

- 큰 섹션(예: "기본정보", "양도자산 정보", "감면·공제")의 시작을 표시.
- 우측에 액션 슬롯 제공 (예: "새로작성하기", "신고서 불러오기").

### 2.2 Props

```typescript
export interface SectionHeaderProps {
  /** 섹션 제목 (필수) */
  title: string;
  /** 부제목 (선택) — 제목 아래 회색 작은 글씨 */
  description?: React.ReactNode;
  /** 우측 액션 영역 (Button 1~N개) */
  action?: React.ReactNode;
  /** 좌측 leading 아이콘 (default: 작은 점) */
  leading?: React.ReactNode;
  /** 추가 className */
  className?: string;
}
```

### 2.3 시각 명세

```
┌─────────────────────────────────────────────────────┐
│  • 기본정보                  [새로작성하기] [불러오기]│
│  계약·신고 정보를 입력하세요                          │
├─────────────────────────────────────────────────────┘
```

### 2.4 DOM 구조

```tsx
<div
  data-slot="section-header"
  className={cn("mb-3 border-b pb-2", className)}
>
  <div className="flex items-center justify-between gap-2">
    <h3 className="flex items-center gap-2 text-base font-semibold">
      {leading ?? (
        <span
          className="h-1.5 w-1.5 rounded-full bg-primary"
          aria-hidden
        />
      )}
      <span>{title}</span>
    </h3>
    {action && <div className="flex items-center gap-2">{action}</div>}
  </div>
  {description && (
    <p className="mt-1 text-xs text-muted-foreground">{description}</p>
  )}
</div>
```

### 2.5 사용 예시

```tsx
<SectionHeader
  title="기본정보"
  description="계약·신고 정보를 입력하세요"
  action={
    <>
      <Button size="sm" variant="outline" onClick={resetForm}>새로작성하기</Button>
      <Button size="sm" variant="outline" onClick={loadDraft}>불러오기</Button>
    </>
  }
/>
```

---

## 3. `WizardSidebar`

**파일**: `components/calc/shared/WizardSidebar.tsx` (신규)

### 3.1 책임

- lg(1024px) 이상에서 좌측에 sticky 사이드바로 진척 + 요약을 표시.
- lg 미만에서는 자체적으로 `null` 반환 — 호출부는 상단 `StepIndicator`로 폴백.

### 3.2 Props

```typescript
export interface WizardSidebarStep {
  /** 표시 라벨 */
  label: string;
  /** 부제 (선택) — 라벨 아래 회색 작은 글씨 */
  description?: string;
  /** 진행 상태 */
  status: "done" | "active" | "todo";
  /** 클릭 시 해당 단계로 이동 (선택). 없으면 비활성 */
  onClick?: () => void;
}

export interface WizardSidebarSummaryItem {
  /** 표시 라벨 (예: "양도가액 합계") */
  label: string;
  /** 값 (number → 콤마 + "원"; string → 그대로 표시; null → "—") */
  value: number | string | null;
  /** true 시 큰 글씨 + primary 색 (예: "납부할 세액") */
  highlight?: boolean;
  /** 단위 override (default: number 시 "원") */
  unit?: string;
}

export interface WizardSidebarProps {
  /** 진행 단계 목록 (현재/완료/예정) */
  steps: WizardSidebarStep[];
  /** 요약 항목 목록 — 카드 1개에 모아 표시. 빈 배열이면 요약 카드 미표시 */
  summary?: WizardSidebarSummaryItem[];
  /** 사이드바 상단 헤더 (예: 마법사 이름 "양도소득세") */
  title?: string;
  /** lg 미만에서도 노출 강제 (테스트용). default: false (lg 이상만 표시) */
  forceShow?: boolean;
}
```

### 3.3 시각 명세

```
┌─ WizardSidebar (lg+) ──────────┐
│  양도소득세                     │ ← title
│                                 │
│  [● 기본사항을 입력하세요]      │ ← active (bg-primary)
│  ○ 양도자산 및 소득금액         │
│   · 양도가액 합계      0원      │
│   · 취득가액 합계      0원      │
│   · 필요경비 합계      0원      │
│   · 양도소득금액 합계  0원      │
│  ○ 세액계산                     │
│   · 감면대상 소득금액  0원      │
│   · 기본공제금액       0원      │
│   · 과세표준           0원      │
│  ✓ 신고서 제출                  │ ← done (체크)
│   납부할 세액          0원      │ ← highlight
└─────────────────────────────────┘
```

### 3.4 DOM 구조 (요약)

```tsx
<aside
  data-slot="wizard-sidebar"
  className={cn(
    "w-72 shrink-0 space-y-4",
    !forceShow && "hidden lg:block",
    "lg:sticky lg:top-20"
  )}
>
  {title && <h2 className="px-4 text-base font-semibold">{title}</h2>}

  {/* 진행 단계 카드 */}
  <nav aria-label="진행 단계" className="rounded-lg border bg-card p-2">
    <ul className="space-y-1">
      {steps.map((s, i) => (
        <li key={i}>
          <StepRow step={s} />
        </li>
      ))}
    </ul>
  </nav>

  {/* 요약 카드 */}
  {summary && summary.length > 0 && (
    <div className="rounded-lg border bg-card p-4 space-y-2">
      {summary.map((item, i) => (
        <SummaryRow key={i} item={item} />
      ))}
    </div>
  )}
</aside>
```

### 3.5 `StepRow` 내부 동작

| status | 클래스 | 부가 |
|---|---|---|
| `active` | `bg-primary text-primary-foreground rounded-md px-3 py-2 text-sm font-medium` | `aria-current="step"` |
| `done` | `text-foreground rounded-md px-3 py-2 text-sm hover:bg-muted/40` | 좌측 체크(`✓`) 아이콘 |
| `todo` | `text-muted-foreground rounded-md px-3 py-2 text-sm hover:bg-muted/40` | — |

- `onClick`이 있으면 `<button type="button" onClick={...}>`, 없으면 `<div>`.
- 모든 행에 `focus-visible:ring-2 focus-visible:ring-ring` 적용.

### 3.6 `SummaryRow` 내부 동작

| 모드 | 클래스 |
|---|---|
| 일반 | `flex items-baseline justify-between text-sm` |
| highlight | `flex items-baseline justify-between text-base font-semibold text-primary border-t pt-2 mt-2` |

값 렌더 규칙:

```typescript
function renderValue(value: number | string | null, unit?: string): string {
  if (value === null) return "—";
  if (typeof value === "number") return value.toLocaleString() + (unit ?? "원");
  return value;
}
```

---

## 4. 컴포넌트 파일 크기 예산

| 컴포넌트 | 예상 줄 수 | 800줄 정책 여유 |
|---|---|---|
| `FieldCard.tsx` | ~70 | 충분 |
| `SectionHeader.tsx` | ~35 | 충분 |
| `WizardSidebar.tsx` | ~150 (sub-components 포함) | 충분 |

> 모두 단일 파일로 작성 가능. `WizardSidebar`의 `StepRow`·`SummaryRow`는 같은 파일 내 helper 함수로.

---

## 5. DOM 구조 청사진

상위 설계서 §11에서 옮긴 완성형 DOM. 구현 시 그대로 참조.

### 5.1 Step1 "기본정보" 섹션 완성형 DOM

```html
<section>
  <div data-slot="section-header" class="mb-3 border-b pb-2">
    <div class="flex items-center justify-between gap-2">
      <h3 class="flex items-center gap-2 text-base font-semibold">
        <span class="h-1.5 w-1.5 rounded-full bg-primary"></span>
        <span>기본정보</span>
      </h3>
    </div>
    <p class="mt-1 text-xs text-muted-foreground">계약·신고 정보를 입력하세요</p>
  </div>

  <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
    <!-- 양도일 카드 -->
    <div data-slot="field-card"
         class="rounded-lg border bg-card px-4 py-3 grid gap-3 sm:grid-cols-[120px_1fr] sm:items-start">
      <label for="transfer-date" class="flex items-center gap-1 text-sm font-medium pt-1.5 sm:pt-2">
        <span class="text-destructive">*</span>
        <span>양도일</span>
      </label>
      <div class="space-y-1.5">
        <div class="flex items-center gap-2">
          <div class="flex-1">
            <!-- DateInput 내부 (연/월/일 분리 input 3개) -->
          </div>
        </div>
        <p class="text-xs text-muted-foreground">잔금 청산일 또는 등기 접수일 중 빠른 날</p>
      </div>
    </div>

    <!-- 신고일 카드 (동일 구조, required 없음) -->
    <div data-slot="field-card"
         class="rounded-lg border bg-card px-4 py-3 grid gap-3 sm:grid-cols-[120px_1fr] sm:items-start">
      <label for="filing-date" class="flex items-center gap-1 text-sm font-medium pt-1.5 sm:pt-2">
        <span>신고일</span>
      </label>
      <div class="space-y-1.5">
        <div class="flex items-center gap-2">
          <div class="flex-1"><!-- DateInput --></div>
        </div>
        <p class="text-xs text-muted-foreground">신고기한: 2026-06-30 (양도월 말일 + 2개월)</p>
      </div>
    </div>
  </div>
</section>
```

### 5.2 사이드바 활성 단계 DOM

```html
<aside data-slot="wizard-sidebar"
       class="w-72 shrink-0 space-y-4 hidden lg:block lg:sticky lg:top-20">
  <h2 class="px-4 text-base font-semibold">양도소득세</h2>

  <nav aria-label="진행 단계" class="rounded-lg border bg-card p-2">
    <ul class="space-y-1">
      <li>
        <button type="button" aria-current="step"
                class="w-full text-left rounded-md px-3 py-2 bg-primary text-primary-foreground text-sm font-medium">
          기본사항
        </button>
      </li>
      <li>
        <button type="button"
                class="w-full text-left rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted/40">
          ✓ 취득 상세
        </button>
      </li>
      <li>
        <button type="button"
                class="w-full text-left rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted/40">
          보유 상황
        </button>
      </li>
      <li>
        <button type="button"
                class="w-full text-left rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted/40">
          감면·공제
        </button>
      </li>
      <li>
        <button type="button"
                class="w-full text-left rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted/40">
          가산세
        </button>
      </li>
    </ul>
  </nav>

  <div class="rounded-lg border bg-card p-4 space-y-2">
    <div class="flex items-baseline justify-between text-sm">
      <span class="text-muted-foreground">양도가액 합계</span>
      <span>0원</span>
    </div>
    <div class="flex items-baseline justify-between text-sm">
      <span class="text-muted-foreground">취득가액 합계</span>
      <span>0원</span>
    </div>
    <div class="flex items-baseline justify-between text-sm">
      <span class="text-muted-foreground">필요경비 합계</span>
      <span>0원</span>
    </div>
    <div class="flex items-baseline justify-between text-sm">
      <span class="text-muted-foreground">양도소득금액</span>
      <span>0원</span>
    </div>
    <div class="flex items-baseline justify-between text-base font-semibold text-primary border-t pt-2 mt-2">
      <span>납부할 세액</span>
      <span>—</span>
    </div>
  </div>
</aside>
```

---

> 본 부록의 §1~§3은 상위 설계서 §4를 대체하고, §5는 상위 설계서 §11을 대체합니다. 상위 설계서에는 본 파일로의 링크만 남겨 800줄 정책을 준수합니다.
