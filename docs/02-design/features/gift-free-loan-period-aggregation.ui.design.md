# §41의4 금전무상대출 다년 기간 안분 + §43② 합산 — UI 설계 (UI DESIGN)

> 상위 계획서: [`docs/00-pm/gift-free-loan-period-aggregation.plan.md`](../../00-pm/gift-free-loan-period-aggregation.plan.md)
> 엔진 설계: `docs/02-design/features/gift-free-loan-period-aggregation.engine.design.md` **(작성 중 — 엔진 타입 확정 후 ⑫⑬⑭ 동기화 필수)**
> 기존 UI 설계: [`gift-deemed-transfer.ui.design.md`](./gift-deemed-transfer.ui.design.md)
> 브랜치: `feat/gift-free-loan-41-4`
> 작성일: 2026-06-25

---

## 0. 배경 및 범위

### 현행 `FreeLoanFields` (shared.tsx:422~447 기준)

```
대출금액  [CurrencyInput]
실제 지급이자  [CurrencyInput]
적정이자율 안내 (4.6% 자동)
특수관계인 토글  [ToggleCard violet]
정당한 사유 토글  [ToggleCard amber] (비특수관계인 시만 노출)
```

현행 폼 상태(`deemed-form-state.ts:105~108`):
- `loanAmount: string`
- `loanInterest: string`
- `loanRelated: boolean`
- `loanJustifiable: boolean`

### 추가 대상

| 기능 | 현황 | 추가 필드 |
|---|---|---|
| §41의4② 다년 기간 안분 | 없음 — 1년 단건만 | `loanStartDate`, `loanEndDate` |
| §43² 1년 이내 동일거래 합산 | 없음 — router.ts 주석만 | `loanLoans?: LoanLoanItem[]` (3-state) |

---

## 1. 입력 위젯 ASCII

### 1.1 단건 ↔ 다건 모드 토글

`feedback_three_state_optional_mode_toggle` 준수 — `undefined`(OFF) / `[](ON 빈)` / `[...](데이터)` 3-state.
- `loanLoans === undefined` → **단건 모드** (현행 FreeLoanFields 그대로, 기간 확장)
- `loanLoans !== undefined` → **다건 모드** (§43² 합산 테이블)

```
┌ 금전 무상대출 (§41의4) ───────────── rose ─┐
│                                              │
│  [ToggleCard sky] 여러 건 합산 계산 (§43②)  │
│   ON: 1년 이내 다수 대출을 합산하여 과세     │
│   testid: loan-multi-toggle                  │
│                                              │
│  ┌── 단건 모드 (loanLoans === undefined) ──┐ │
│  │  특수관계인 간 거래 [ToggleCard violet]  │ │
│  │  testid: loan-related                   │ │
│  │  대출금액  [ CurrencyInput ] 원          │ │
│  │  testid: loan-amount                    │ │
│  │  실제 지급이자 [ CurrencyInput ] 원      │ │
│  │  testid: loan-interest                  │ │
│  │   hint: 무이자면 비워두세요              │ │
│  │                                         │ │
│  │  [ToggleCard amber] 대출 기간 입력       │ │
│  │   (§41의4② 다년 안분 계산)              │ │
│  │   testid: loan-period-toggle            │ │
│  │   ON 시 확장:                           │ │
│  │   ┌──────────────────────────────────┐ │ │
│  │   │ 대출 시작일 [DateInput]           │ │ │
│  │   │  testid: loan-start-date          │ │ │
│  │   │ 대출 종료일 [DateInput]           │ │ │
│  │   │  testid: loan-end-date            │ │ │
│  │   │                                   │ │ │
│  │   │ ⓘ hint: 기간 입력 시 연도별 별개  │ │ │
│  │   │   증여로 분할됩니다.              │ │ │
│  │   │   (상증법 §41의4②)               │ │ │
│  │   └──────────────────────────────────┘ │ │
│  │                                         │ │
│  │  ┌ 비특수관계인 ──────────────────────┐ │ │
│  │  │ [ToggleCard amber]                  │ │ │
│  │  │  정당한 사유 있음 (§41의4③)        │ │ │
│  │  │  testid: loan-justifiable           │ │ │
│  │  └────────────────────────────────────┘ │ │
│  └─────────────────────────────────────────┘ │
│                                              │
│  ┌── 다건 모드 (loanLoans !== undefined) ──┐ │
│  │  §43② 1년 이내 동일거래 합산            │ │
│  │  (각 건의 증여이익이 1천만 미만이어도   │ │
│  │   합산 후 과세)                          │ │
│  │                                          │ │
│  │  ┌ 대출 1 ──────────── [× 삭제] ──────┐ │ │
│  │  │ 대출일  [DateInput]                 │ │ │
│  │  │  testid: loan-item-date-0           │ │ │
│  │  │ 대출금액 [CurrencyInput] 원         │ │ │
│  │  │  testid: loan-item-amount-0         │ │ │
│  │  │ 실제 지급이자 [CurrencyInput] 원    │ │ │
│  │  │  testid: loan-item-interest-0       │ │ │
│  │  │  hint: 무이자면 비워두세요          │ │ │
│  │  └────────────────────────────────────┘ │ │
│  │  ┌ 대출 2 ──────────── [× 삭제] ──────┐ │ │
│  │  │ 대출일  [DateInput]                 │ │ │
│  │  │ 대출금액 [CurrencyInput] 원         │ │ │
│  │  │ 실제 지급이자 [CurrencyInput] 원    │ │ │
│  │  └────────────────────────────────────┘ │ │
│  │  [+ 대출 추가]  testid: loan-item-add   │ │ │
│  │                                          │ │
│  │  특수관계인 간 거래 [ToggleCard violet]  │ │
│  │  testid: loan-multi-related             │ │ │
│  │  ┌ 비특수관계인 ─────────────────────┐  │ │
│  │  │ 정당한 사유 있음 [ToggleCard amber] │  │ │
│  │  │ testid: loan-multi-justifiable      │  │ │
│  │  └───────────────────────────────────┘  │ │
│  │  ⓘ 증여시기: 합산액이 1천만 도달하는    │ │
│  │   마지막 대출일 (상증령 §32의4)          │ │
│  └─────────────────────────────────────────┘ │
│                                              │
│  적정이자율: 2016.3.7~ 연 4.6% (자동 적용)  │
│  (상증법§41의4④→상증령§31의4①→            │
│   상증칙§10의5→법인세법시행규칙§43②)       │
└──────────────────────────────────────────────┘
```

### 1.2 기간 토글 (단건 모드 내부) 상세

`loanStartDate`·`loanEndDate` 둘 다 비어 있으면 기간 미입력 → 엔진은 단건 1년 경로 (회귀 보존).

- 토글 tone: `amber` (계산 모드 변경)
- 토글 variant: `card` (children 펼침)
- 토글 ON / OFF: `freePeriods` 3-state 선례와 동일하게 `undefined` OFF / `{ startDate:"", endDate:"" }` ON

### 1.3 다건 테이블 선례

`CapitalDecreaseShareholderTable.tsx` (감자 §39의2 주주 명단) 패턴 차용:
- 행 추가/삭제 버튼
- 행별 고유 `id` (클라이언트 UUID `loan-item-{seq}-{timestamp}`)
- 각 행: `DateInput` + `CurrencyInput` × 2
- 행 삭제 testid: `loan-item-delete-{i}`
- 테이블 wrapper testid: `loan-items-table`

---

## 2. 결과뷰 (`DeemedGiftResultView.tsx`)

기존 `periodBreakdown` 렌더 블록(line:490~517) 및 `thresholdEcho` 패턴 확장.

### 2.1 사례1 — 다년 기간 안분 결과

```
┌ 연도별 증여이익 (§41의4② — 매년 새로 대출받은 것으로 본다) ── amber ─┐
│ [ExpandToggleButton]  tone=amber                                         │
│                                                                           │
│ 대출금액: 1,000,000,000  /  적정이자율: 4.6%  /  실제이자율: 3%         │
│                                                                           │
│ ┌──────────────────┬──────────────────┬──────────────────┬───────┐       │
│ │ 증여일           │ 대출금액         │ 연 증여이익      │ 적용  │       │
│ ├──────────────────┼──────────────────┼──────────────────┼───────┤       │
│ │ 2022.1.2. (1년차)│ 1,000,000,000    │    16,000,000    │  ○    │       │
│ │  (365일/365일)   │                  │                  │       │       │
│ ├──────────────────┼──────────────────┼──────────────────┼───────┤       │
│ │ 2023.1.2. (2년차)│ 1,000,000,000    │    15,956,164    │  ○    │       │
│ │  (364일/365일)   │                  │                  │       │       │
│ └──────────────────┴──────────────────┴──────────────────┴───────┘       │
│                                                                           │
│ 각 연도는 별개 증여로 해당 증여일에 별도 신고합니다.                     │
│ 이 결과의 증여재산가액은 현재 증여일(첫 번째 연도) 기준입니다.           │
│                                                                           │
│ 2년차 산식: 연 증여이익 16,000,000 × 364일 / 365일 = 15,956,164         │
│  ※ §41의4② 의제 도출 — 일수/365 명문 조항 없음, 교재 기준              │
│  [상증법 §41의4②]  [LawArticleModal]                                    │
└───────────────────────────────────────────────────────────────────────────┘
```

testid: `loan-period-breakdown`

산식 표기 규칙:
- "원" 생략 (`feedback_no_won_suffix`)
- 금액 우측정렬 `font-mono tabular-nums whitespace-nowrap` (`amount-column-align`)
- 변수 약어 금지 — "연 증여이익", "대출금액", "일수" 한국어 풀어쓰기 (`feedback_result_view_korean_formula`)
- `floor()` 명시 금지 — "절사" 주석으로 표현

### 2.2 사례2 — §43² 합산 결과

```
┌ §43② 동일거래 합산 증여이익 ─────────────── sky ─┐
│ [ExpandToggleButton] tone=sky                       │
│                                                     │
│ ┌────────────┬────────────┬────────────┬──────────┐ │
│ │ 대출일     │ 대출금액   │ 건별 이익  │ 누계     │ │
│ ├────────────┼────────────┼────────────┼──────────┤ │
│ │ 2022.5.4.  │ 300,000,000│  4,800,000 │ 4,800,000│ │
│ ├────────────┼────────────┼────────────┼──────────┤ │
│ │ 2022.9.20. │ 100,000,000│  4,600,000 │ 9,400,000│ │
│ ├────────────┼────────────┼────────────┼──────────┤ │
│ │ 2023.4.25. │ 500,000,000│ 10,000,000 │19,400,000│ │
│ │  ▶ 증여시기│            │            │  (과세)  │ │
│ └────────────┴────────────┴────────────┴──────────┘ │
│                                                     │
│ 합계 증여이익: 19,400,000                           │
│ 증여시기: 2023.4.25. (합산액 1천만 초과 도달일)     │
│                                                     │
│ ⓘ 개별 건으로는 1천만 미만이더라도                  │
│   1년 이내 동일거래를 합산하여 과세합니다.           │
│   [상증법 §43②]  [상증령 §32의4]  [LawArticleModal] │
└─────────────────────────────────────────────────────┘
```

testid: `loan-aggregation-result`

표 우측 컬럼(누계) 강조: 과세 도달 행에 `bg-sky-100 font-semibold` 배지.
증여시기 행에 `▶` 마커.

---

## 3. 사이드바 합계 (`computeDeemedSummary` 또는 유사 selector)

`gift-deemed-transfer.ui.design.md §4` 기준 `사이드바 N/A` — 의제 계산은 결과뷰 단일. 변경 없음.

단, 다건 모드에서 합산 증여이익이 계산된 경우 결과뷰 상단 "증여재산가액" 표시에 `합산 총액: 19,400,000` 반영.

---

## 4. 14 동기화 지점 표

| # | 지점 | 신규 필드 / 위치 | 비고 |
|---|---|---|---|
| ① | 폼 상태 타입 | `deemed-form-state.ts` `DeemedFormState` | `loanStartDate: string`, `loanEndDate: string`, `loanLoans?: LoanLoanItem[]` 추가 |
| ② | initial value | `INITIAL_DEEMED` | `loanStartDate: ""`, `loanEndDate: ""`, `loanLoans: undefined` |
| ③ | normalize fallback | `INITIAL_DEEMED` 기준 — 기간 비어있으면 단건 경로. `loanLoans undefined`이면 단건 | useEffect store 미러링 금지 |
| ④ | API 변환 | `lib/calc/gift-deemed-api.ts` `free_loan` case (~line 100) | `loanStartDate/EndDate → date 변환` + `loanLoans → LoanLoanItem[]` 배열 변환 |
| ⑤ | UI 위젯 | `components/calc/deemed-gift/shared.tsx` `FreeLoanFields` | §1 ASCII 위젯대로 확장 |
| ⑥ | 사이드바 합계 | N/A (기존 의제 계산기 정책 유지) | 결과뷰에서 합산 총액 표시 |
| ⑦ | 결과 카드 산식 | `components/calc/results/DeemedGiftResultView.tsx` | §2 결과뷰 블록 추가 |
| ⑧ | validation | `lib/calc/gift-deemed-validate.ts` `free_loan` case (~line 63) | 기간 입력 시 start ≤ end 검증, 다건 모드 시 최소 1건 + 각 건 대출일·금액 필수 |
| ⑨ | Zod enum 메인 | `app/api/calc/gift-deemed/route.ts` | `free_loan` case 확장 (기간·배열 필드) |
| ⑩ | Zod enum 컴패니언 | `addPropertyRefines` (해당 시) | N/A (단일 route) |
| ⑪ | acquisitionDate fallback | N/A | 해당 없음 |
| **⑫** | **Zod 입력 객체 정의** | **route.ts Zod schema** | **`loanStartDate?: z.string()`, `loanEndDate?: z.string()`, `loanLoans?: z.array(loanItemSchema)` — TS 미감지, grep 필수** |
| **⑬** | **callDeemedAPI body spread** | **`gift-deemed-api.ts` fetch body** | **신규 필드 spread 누락 시 침묵 strip — grep으로 확인** |
| **⑭** | **Route 엔진 input 매핑** | **route.ts `→ calcDeemedGift(input)` 직전** | **Date 변환: `loanStartDate`·`loanEndDate`는 문자열 그대로(엔진 date-coerce 정책 — 날짜는 string으로 전달)** |

### ⑫⑬⑭ grep 자가 점검 경로

```bash
# ⑫ Zod schema에 loanStartDate 정의 여부
grep -n "loanStartDate\|loanEndDate\|loanLoans" \
  app/api/calc/gift-deemed/route.ts

# ⑬ fetch body에 신규 필드 포함 여부
grep -n "loanStartDate\|loanEndDate\|loanLoans" \
  lib/calc/gift-deemed-api.ts

# ⑭ Route 엔진 매핑
grep -n "loanStartDate\|loanEndDate\|loanLoans" \
  app/api/calc/gift-deemed/route.ts
```

---

## 5. 신규 폼 상태 타입 (제안 — 엔진 설계 확정 후 동기화)

> 아래는 계획서 §4.2 권장안 기준. 엔진 설계 파일 확정 후 타입 불일치 시 **엔진 우선**.

### 5.1 단건 다년 — 기간 필드

```typescript
// deemed-form-state.ts DeemedFormState 추가 (현행 loanRelated 직후)
loanStartDate: string;   // YYYY-MM-DD (DateInput 출력, 빈 문자열 = 기간 미입력)
loanEndDate: string;     // YYYY-MM-DD (DateInput 출력, 빈 문자열 = 기간 미입력)
```

`loanStartDate`·`loanEndDate` 둘 다 비어있으면 → 엔진에 전달 안 함 (기존 단건 경로).

### 5.2 다건 합산 — 배열 (3-state)

```typescript
// deemed-form-state.ts에 추가
export interface LoanLoanItem {
  id: string;          // 클라이언트 UUID (화면 key용)
  loanDate: string;    // YYYY-MM-DD (DateInput)
  amount: string;      // CurrencyInput 입력값 (parseAmount 변환은 API에서)
  interest: string;    // CurrencyInput 입력값 (무이자=빈 문자열)
}

// DeemedFormState에 추가
loanLoans?: LoanLoanItem[];
// undefined = 단건 모드 OFF
// [] = 다건 모드 ON 빈 (validate 차단)
// [{...}] = 데이터
```

`makeLoanItem` 팩토리:
```typescript
let loanSeq = 0;
export function makeLoanItem(): LoanLoanItem {
  loanSeq += 1;
  return {
    id: `loan-item-${loanSeq}-${Math.floor(performance.now())}`,
    loanDate: "",
    amount: "",
    interest: "",
  };
}
```

### 5.3 INITIAL_DEEMED 추가 초기값

```typescript
// INITIAL_DEEMED 추가
loanStartDate: "",
loanEndDate: "",
loanLoans: undefined,
```

---

## 6. API 변환 확장 (④) — `gift-deemed-api.ts`

### 6.1 현행 `free_loan` case (line ~100~108)

```typescript
case "free_loan":
  return {
    type: "free_loan",
    loanAmount: parseAmount(form.loanAmount),
    actualInterestPaid: parseAmount(form.loanInterest),
    appropriateRate: resolveFreeLoanRate(form.giftDate || "2024-01-01"),
    isRelatedParty: form.loanRelated,
    hasJustifiableReason: form.loanJustifiable,
  };
```

### 6.2 확장 후 (엔진 타입 확정 후 실제 구현)

```typescript
case "free_loan": {
  const base = {
    type: "free_loan" as const,
    loanAmount: parseAmount(form.loanAmount),
    actualInterestPaid: parseAmount(form.loanInterest),
    appropriateRate: resolveFreeLoanRate(form.giftDate || "2024-01-01"),
    isRelatedParty: form.loanRelated,
    hasJustifiableReason: form.loanJustifiable,
  };
  // 다년 기간 (단건 모드 + 기간 입력된 경우)
  if (!form.loanLoans && form.loanStartDate && form.loanEndDate) {
    return {
      ...base,
      loanStartDate: form.loanStartDate,   // 문자열 그대로 (date-coerce는 route에서)
      loanEndDate: form.loanEndDate,
    };
  }
  // 다건 합산 모드
  if (form.loanLoans !== undefined) {
    return {
      ...base,
      loanLoans: form.loanLoans.map((item) => ({
        loanDate: item.loanDate,
        amount: parseAmount(item.amount),
        actualInterestPaid: parseAmount(item.interest),
        appropriateRate: resolveFreeLoanRate(item.loanDate || form.giftDate || "2024-01-01"),
      })),
    };
  }
  return base;
}
```

> **주의**: 엔진 입력 타입(`FreeLoanInput`)에 `loanStartDate`·`loanEndDate`·`loanLoans` 필드가 추가되어야 함. 엔진 설계 확정 전까지 타입 오류 발생 가능 — Do 단계에서 엔진 선처리 후 UI 작업.

---

## 7. Validation 확장 (⑧) — `gift-deemed-validate.ts`

### 현행 (line ~63~65)

```typescript
case "free_loan":
  if (parseAmount(form.loanAmount) <= 0) return "대출금액을 입력하세요";
  break;
```

### 확장 후

```typescript
case "free_loan":
  // 다건 모드
  if (form.loanLoans !== undefined) {
    if (form.loanLoans.length === 0) return "대출 건을 1건 이상 입력하세요";
    for (let i = 0; i < form.loanLoans.length; i++) {
      const item = form.loanLoans[i];
      if (!item.loanDate) return `대출 ${i + 1}번: 대출일을 입력하세요`;
      if (parseAmount(item.amount) <= 0) return `대출 ${i + 1}번: 대출금액을 입력하세요`;
    }
    break;
  }
  // 단건 모드
  if (parseAmount(form.loanAmount) <= 0) return "대출금액을 입력하세요";
  // 기간 입력 시 start ≤ end 검증
  if (form.loanStartDate && form.loanEndDate) {
    if (form.loanStartDate > form.loanEndDate) return "대출 종료일이 시작일보다 앞섭니다";
    if (!form.loanEndDate) return "대출 종료일을 입력하세요";
    if (!form.loanStartDate) return "대출 시작일을 입력하세요";
  }
  break;
```

**3중 패턴 강제** (`mirror-pattern`):
- `loanLoans` 배열의 display fallback은 `undefined`(비어있음) → API도 undefined 전달 → validate도 undefined = 단건 모드로 인식.
- `loanStartDate`·`loanEndDate` 빈 문자열 fallback: API는 조건부 전달, validate도 동일하게 빈 문자열이면 기간 미입력으로 인식(검증 건너뜀).

---

## 8. 결과뷰 신규 렌더 블록

`DeemedGiftResultView.tsx`에 추가 (기존 `periodBreakdown` 렌더 블록 이후, `rectification` 블록 이전):

### 8.1 다년 기간 안분 블록

```tsx
{/* §41의4② 다년 기간 안분 (free_loan 전용 periodBreakdown) */}
{result.type === "free_loan" && result.periodBreakdown && result.periodBreakdown.length > 0 && (
  <div
    className="rounded-lg border border-amber-200 bg-amber-50/40 p-4"
    data-testid="loan-period-breakdown"
  >
    <div className="flex items-center justify-between">
      <p className="text-sm font-semibold text-amber-800">
        연도별 증여이익 (§41의4② — 매년 새로 대출받은 것으로 본다)
      </p>
      <ExpandToggleButton open={showLoanPeriod} onClick={() => setShowLoanPeriod(!showLoanPeriod)} tone="amber" />
    </div>
    <div className={showLoanPeriod ? "mt-3 block" : "mt-3 hidden print:block"}>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-amber-700">
            <th className="py-1 text-left font-medium">증여일</th>
            <th className="py-1 text-right font-medium">일수</th>
            <th className="py-1 text-right font-medium">연 증여이익</th>
            <th className="py-1 text-right font-medium">적용</th>
          </tr>
        </thead>
        <tbody>
          {result.periodBreakdown.map((p) => (
            <tr key={p.index} className="border-t border-amber-100">
              <td className="py-1.5 pr-2 text-muted-foreground">
                {p.giftDate || "미입력"}
                {p.index > 0 && (
                  <span className="ml-1 text-xs text-amber-500">({p.index + 1}년차)</span>
                )}
              </td>
              <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap text-xs">
                {/* periodBreakdown에 dayCount 필드 필요 — 엔진 설계 확정 후 연동 */}
                {/* p.dayCount !== undefined ? `${p.dayCount}/365일` : "365일" */}
              </td>
              <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                {formatKRW(p.benefit)}
              </td>
              <td className="py-1.5 text-right text-xs">{p.applied ? "○" : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-muted-foreground">
        각 연도는 별개 증여로 해당 증여일에 별도 신고합니다.
        위 증여재산가액은 현재 증여일(1년차) 기준입니다.
      </p>
      <p className="mt-1 text-xs text-amber-600">
        ※ §41의4② 의제 도출 — 일수/365 명문 조항 없음, 분모 365 고정(교재 기준)
      </p>
      <p className="mt-1">
        <LawArticleModal legalBasis={GIFT.FREE_LOAN} />
      </p>
    </div>
  </div>
)}
```

### 8.2 §43² 합산 결과 블록

```tsx
{/* §43② 동일거래 합산 증여이익 (loanLoans 다건 모드) */}
{result.type === "free_loan" && result.aggregationResult && (
  <div
    className="rounded-lg border border-sky-200 bg-sky-50/40 p-4"
    data-testid="loan-aggregation-result"
  >
    <div className="flex items-center justify-between">
      <p className="text-sm font-semibold text-sky-800">
        §43② 동일거래 합산 증여이익
      </p>
      <ExpandToggleButton open={showAgg} onClick={() => setShowAgg(!showAgg)} tone="sky" />
    </div>
    <div className={showAgg ? "mt-3 block" : "mt-3 hidden print:block"}>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-sky-700">
            <th className="py-1 text-left font-medium">대출일</th>
            <th className="py-1 text-right font-medium">대출금액</th>
            <th className="py-1 text-right font-medium">건별 이익</th>
            <th className="py-1 text-right font-medium">누계</th>
          </tr>
        </thead>
        <tbody>
          {result.aggregationResult.items.map((item, i) => (
            <tr
              key={i}
              className={`border-t ${
                item.isThresholdCrossing
                  ? "bg-sky-100 font-semibold border-sky-300"
                  : "border-sky-100"
              }`}
            >
              <td className="py-1.5 pr-2 text-muted-foreground">
                {item.loanDate}
                {item.isThresholdCrossing && (
                  <span className="ml-1 text-xs font-medium text-sky-700">▶ 증여시기</span>
                )}
              </td>
              <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                {formatKRW(item.amount)}
              </td>
              <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                {formatKRW(item.benefit)}
              </td>
              <td className="py-1.5 text-right font-mono tabular-nums whitespace-nowrap">
                {formatKRW(item.cumulative)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex items-center justify-between">
        <p className="text-sm text-sky-800">
          합계 증여이익
        </p>
        <p className="text-right font-mono text-lg font-bold tabular-nums text-sky-900">
          {formatKRW(result.aggregationResult.totalBenefit)}
        </p>
      </div>
      {result.aggregationResult.giftDate && (
        <p className="mt-1 text-xs text-muted-foreground">
          증여시기: {result.aggregationResult.giftDate}{" "}
          (합산액 1천만 초과 도달일 — 상증령 §32의4)
        </p>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        ⓘ 개별 건으로는 1천만 미만이더라도 1년 이내 동일거래를 합산하여 과세합니다.
      </p>
      <p className="mt-1">
        <LawArticleModal legalBasis={GIFT.SAME_TRANSACTION_AGGREGATION} />
        {" "}
        <LawArticleModal legalBasis={GIFT.SAME_TRANSACTION_AGG_RULE} />
      </p>
    </div>
  </div>
)}
```

> **주의**: `result.aggregationResult` 필드는 엔진 설계 확정 후 타입에 맞게 조정. 위는 계획서 §4.2 권장안 기준 잠정 명칭. `GIFT.SAME_TRANSACTION_AGGREGATION`·`GIFT.SAME_TRANSACTION_AGG_RULE` 상수는 `legal-codes/inheritance-gift.ts`에 추가 필요.

---

## 9. 케이스 매트릭스 UI 분기

계획서 §3 전수 enumerate 기준:

| 케이스 | `loanLoans` | `loanStartDate/EndDate` | UI 모드 | 결과뷰 |
|---|---|---|---|---|
| LOAN-1~4 (기존) | undefined | 빈 문자열 | 단건·기간 없음 | 기존 breakdown 그대로 |
| PERIOD-2 (정확 2년) | undefined | 입력됨 | 단건·기간 있음 | `loan-period-breakdown` 2행 (안분 없음) |
| **PERIOD-1 (사례1)** | undefined | 입력됨 | 단건·기간 있음 | `loan-period-breakdown` 2행 (2년차 안분) |
| PERIOD-3 (기간 미정) | undefined | 빈 문자열 | 단건·기간 없음 | 기존 단건 결과 |
| AGG-3 (단건만) | `undefined` | — | 단건 | 기존 |
| **AGG-1 (사례2)** | `[...3건]` | — | 다건 | `loan-aggregation-result` 3행 |
| AGG-2 (1년 초과 분리) | `[...N건]` | — | 다건 | `loan-aggregation-result` (1년 밖 건 별도 표시) |

---

## 10. UI 규칙 준수 체크리스트 (Do 단계)

- [ ] `DateInput` 사용 (`type="date"` 금지) — `feedback_date_input`
- [ ] `CurrencyInput` + `parseAmount` (금액), 소수점 없음 — `feedback_decimal_input`
- [ ] `ToggleCard`(기간 토글·다건 토글·특수관계인·정당사유) OFF도 tone 배경 유지 — `feedback_toggle_card_visibility`
- [ ] `loanLoans` 3-state `undefined`/`[]`/`[...]` 엄수 — length 파생으로 ON/OFF 판단 금지 (`feedback_three_state_optional_mode_toggle`)
- [ ] `useEffect → store` 미러링 금지 — `feedback_useeffect_store_mirror_forbidden`
- [ ] validate 동기화: `loanLoans undefined` = 단건, `loanStartDate/EndDate` 빈 문자열 = 기간 없음 — `feedback_validation_sync_8th_point`
- [ ] 자동 안분 fallback 금지 — 기간 미입력 시 단건 경로(안분 없음), 빈 값 자동채움 없음 — `feedback_no_silent_apportion_fallback`
- [ ] 결과 산식 한국어 풀어쓰기, 약어·`floor()` 금지 — `feedback_result_view_korean_formula`
- [ ] "원" 생략 + `font-mono tabular-nums` — `feedback_no_won_suffix`, `amount-column-align`
- [ ] placeholder 숫자 예시 금지 → `FieldCard hint` 사용
- [ ] `LawArticleModal` 배지: §41의4②·§43②·§32의4 — `feedback_law_article_link`
- [ ] `ExpandToggleButton` + 인쇄 CSS-only (`print:block`) — `feedback_result_expand_toggle_standard`
- [ ] testid 전수 명세 (§1 ASCII 표 참조)
- [ ] 800줄 정책: `FreeLoanFields` 확장 후 `shared.tsx` 800줄 초과 시 `free-loan-form.tsx`로 분리
- [ ] 결과뷰 신규 `useState` 추가 (`showLoanPeriod`, `showAgg`) — `DeemedGiftResultView.tsx` 800줄 확인

---

## 11. E2E 케이스 (계획서 §8 기준)

`e2e/gift-deemed-free-loan-period-agg.spec.ts` 신규:

- **PERIOD-1**: 사례1 — 대출금액 10억, 시작 2022-01-02, 종료 2023-12-31, 이자율 3% → 결과뷰 `loan-period-breakdown` 2행, 1년차 `16,000,000` + 2년차 `15,956,164`
- **AGG-1**: 사례2 — 3건 입력(㉮3억3%·㉯1억무상·㉰5억2.6%) → `loan-aggregation-result` 합계 `19,400,000`, 증여시기 `2023.4.25.`
- **LOAN-1 회귀**: 기간·다건 없이 단건 3억 무이자 → 기존 결과 `13,800,000` (회귀)

---

## 12. 엔진 설계 미확정 항목 (Do 전 동기화 필요)

> 엔진 설계 파일 생성 후 아래 항목 확정하여 본 문서 갱신.

| 항목 | 현재 가정 (계획서 §4.2) | 엔진 확정 후 |
|---|---|---|
| `FreeLoanInput` 기간 필드명 | `loanStartDate: string`, `loanEndDate: string` | 확정 전 |
| 다건 배열 필드명 | `loanLoans: LoanItem[]` | 확정 전 — `free_loan_aggregated` 별도 type vs `free_loan` 확장 |
| `periodBreakdown` 행 타입 | 기존 `{ index, giftDate, baseValue, benefit, applied }` 확장 | `dayCount` 필드 추가 여부 |
| 합산 결과 필드명 | `aggregationResult: { items, totalBenefit, giftDate }` | 확정 전 |
| `GIFT.SAME_TRANSACTION_AGGREGATION` 상수 | 미생성 | `legal-codes/inheritance-gift.ts` 추가 필요 |

---

## 13. Definition of Done (UI 담당)

- [ ] `DeemedFormState` ①②③ — `loanStartDate`·`loanEndDate`·`loanLoans` 추가
- [ ] `gift-deemed-api.ts` ④ — 기간·배열 변환 분기
- [ ] `FreeLoanFields` ⑤ — 기간 토글(단건)·다건 테이블
- [ ] 사이드바 ⑥ — N/A (기존 정책 유지)
- [ ] `DeemedGiftResultView.tsx` ⑦ — 2개 블록 추가
- [ ] `gift-deemed-validate.ts` ⑧ — 기간·다건 검증
- [ ] Zod ⑨⑫ — route.ts 기간·배열 필드 선언
- [ ] fetch body ⑬ — API 변환 spread 확인
- [ ] Route 엔진 매핑 ⑭ — 확인
- [ ] ⑫⑬⑭ grep 자가 점검 (§4 표 경로 실행)
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/gift-deemed/` 통과
- [ ] E2E: PERIOD-1·AGG-1·LOAN-1 회귀
- [ ] 브라우저 수동 확인 또는 미수행 명시

---

## 14. 통합비교 정정 (STEP 10/11 — 엔진 설계 확정 반영) ⭐ Do 시 이 섹션 우선

§12 "엔진 미확정 항목"을 엔진 설계(`gift-free-loan-period-aggregation.engine.design.md §13`)와 동기화하여 확정.

### U1. 다년 이자 = 연간 실제이자 금액 (율 입력 위젯 불필요) ⭐
- 다년 모드도 **기존 `loanInterest`(연간 실제이자 금액) 재사용**. 계약이자율(%) 입력 위젯 신설 **안 함**(엔진 contractRate 제거 — engine C1).
- hint 변경: "**연간** 실제 지급이자 (무이자면 비워두세요)". 사례1 입력값 = 30,000,000(10억×3%).
- §1 ASCII 기간 토글 ON 시 **시작일·종료일만** 추가(이자는 상단 `loanInterest` 공유).

### U2. 다건 = 신규 type `free_loan_aggregated` dispatch
- 폼 `loanLoans` 토글은 유지. **API 변환에서 `loanLoans !== undefined`이면 `type:"free_loan_aggregated"` 반환**(free_loan 아님). §6.2 정정.
- 결과뷰 §8.2 분기: `result.type === "free_loan"` → **`result.type === "free_loan_aggregated"`** 로 정정.

### U3. 합산 결과 = `aggregationBreakdown` + `deemedGiftValue` (UI 가정 폐기)
- UI 가정 `aggregationResult:{items,totalBenefit,giftDate}` **폐기**. 엔진 `result.aggregationBreakdown`(배열) 사용.
- §8.2 매핑: `result.aggregationResult.items` → `result.aggregationBreakdown`; `.totalBenefit` → `result.deemedGiftValue`; item `amount/benefit/cumulative` → `loanAmount/rawBenefit/cumulativeBenefit`; `isThresholdCrossing` 플래그 사용; 증여시기 = `aggregationBreakdown.find(i=>i.isThresholdCrossing)?.loanDate`.

### U4. API 변환 필드 매핑 (§6.2 정정)
```typescript
if (form.loanLoans !== undefined) {
  return {
    type: "free_loan_aggregated" as const,   // ← free_loan 아님
    loans: form.loanLoans.map((item) => ({
      loanDate: item.loanDate,
      loanAmount: parseAmount(item.amount),     // ← amount→loanAmount
      actualInterestPaid: parseAmount(item.interest),
      appropriateRate: resolveFreeLoanRate(item.loanDate || form.giftDate || "2024-01-01"),
      isRelatedParty: form.loanRelated,
      hasJustifiableReason: form.loanJustifiable,
      label: item.label,
    })),
  };
}
```

### U5. legal 상수 — `DUP_EXCLUSION_ANNUAL` 재사용
- §8.2 `GIFT.SAME_TRANSACTION_AGGREGATION`·`SAME_TRANSACTION_AGG_RULE`(미존재) → **`GIFT.DUP_EXCLUSION_ANNUAL`** 단일. 다년 블록(§8.1)은 `GIFT.FREE_LOAN_PERIOD`(신규)·`GIFT.FREE_LOAN`.

### U6. `periodBreakdown.dayCount` 표시 활성화
- §8.1 결과뷰 line 450-451 주석 해제: `{p.dayCount !== undefined ? \`${p.dayCount}/365일\` : "—"}`. 엔진이 dayCount echo(engine C2).
