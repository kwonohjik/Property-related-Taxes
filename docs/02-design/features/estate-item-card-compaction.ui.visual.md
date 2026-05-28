# 상속재산 입력 카드 압축 — UI 시각 디자인 문서

> **Feature ID**: `estate-item-card-compaction`
> **작성일**: 2026-05-28
> **참조 Plan**: [`docs/01-plan/estate-item-card-compaction.plan.md`](../../01-plan/estate-item-card-compaction.plan.md) (v4)
> **참조 UI Design**: [`estate-item-card-compaction.ui.design.md`](./estate-item-card-compaction.ui.design.md) (v4)
> **목적**: 픽셀-퍼펙트 시각 명세 — ASCII 목업 + 색상·간격·타이포·인터랙션 토큰

---

## 1. 디자인 토큰

### 1.1 간격 (Spacing)

| 토큰 | 값 (rem / px) | 적용 |
|---|---|---|
| card-padding | `p-4` (1rem / 16px) | 카드 외곽 |
| card-gap | `space-y-3` (0.75rem / 12px) | 카드 내부 섹션 간 |
| section-gap | `space-y-2` (0.5rem / 8px) | 섹션 내부 행 간 |
| chip-gap | `gap-1.5` (0.375rem / 6px) | 칩 사이 간격 |
| inline-margin | `mt-2` (0.5rem / 8px) | 헤더 ↔ 인라인 펼침 패널 |
| advanced-margin | `mt-3` (0.75rem / 12px) | Body ↔ ⚙️ 패널 |

### 1.2 폰트

| 영역 | 클래스 | 크기 / 굵기 |
|---|---|---|
| 카테고리 라벨 (헤더) | `font-semibold text-sm` | 14px / 600 |
| 카드 인덱스 (예: "1") | `font-semibold text-sm` | 14px / 600 |
| 칩 라벨 | `text-[11px] font-medium` | 11px / 500 |
| 입력 라벨 | `text-xs font-medium` | 12px / 500 |
| hint 텍스트 | `text-[11px] text-slate-500` | 11px / 400 |
| 평가액 (금액) | `tabular-nums text-sm` | 14px / 400 (등폭 숫자) |
| 삭제 버튼 | `text-xs` | 12px / 400 |

### 1.3 색상 토큰 (Tailwind)

| 의미 | tone | 적용 칩 |
|---|---|---|
| 기본·정보 | `gray` | chip-estimated-value (미입력), chip-section22 (OFF) |
| 자격·거주 | `violet` | chip-classification (일반), 사용자 지정 외곽 |
| 간주상속재산·경고 | `amber` | chip-classification (보험/신탁/퇴직), 협의분할 미입력 |
| 긍정·금융공제 | `emerald` | chip-section22 (ON) |
| 분할·면적 | `sky` | chip-heir-allocation (협의분할 ON) |
| 지정·중요 | `rose` | (본 PR 미사용 — 향후 §22② 최대주주용) |

### 1.4 외곽선·radius

| 컴포넌트 | radius | border |
|---|---|---|
| 카드 외곽 | `rounded-lg` | `border` (gray-200 / dark gray-700) |
| 칩 | `rounded-full` | `border` (tone-200) |
| ⚙️ 패널 | `rounded-md` | `border` (slate-200 / dark slate-700) |
| 인라인 펼침 패널 | `rounded-md` | `border-l-2 border-{tone}-300` (좌측만) |

---

## 2. 시각 목업 — variant SIMPLE (financial · 사용자 스크린샷 시나리오)

### 2.1 기본 상태 (~200px) — 데스크톱

```
┌──────────────────────────────────────────────────────────────────────────┐
│  🏛  예금·펀드·채권·공제금 1   [ⓘ평가액 1,100,000,000]                 │
│       [일반] [§22 ✓] [협의분할 ✓]              [⚙️ 옵션] [삭제]         │
│  ────────────────────────────────────────────────────────────────────── │
│  ┌────────────────────────┬──────────────────────────────────┐         │
│  │ 자산 명칭              │ 잔액 또는 시가                    │         │
│  │ [00 은행 예금       ]  │ [   1,100,000,000  ] 원          │         │
│  └────────────────────────┴──────────────────────────────────┘         │
│  §62·시행령 §19① 평가기준일 잔액                                       │
└──────────────────────────────────────────────────────────────────────────┘
   ↑ p-4 / space-y-3 / bg-white dark:bg-gray-900 / border rounded-lg
```

### 2.2 칩 인라인 펼침 (분류 클릭 시)

```
┌──────────────────────────────────────────────────────────────────────────┐
│  🏛  예금·펀드·채권·공제금 1   [ⓘ평가액 1,100,000,000]                 │
│       [일반 ▼] [§22 ✓] [협의분할 ✓]            [⚙️ 옵션] [삭제]         │
│         ▼  (분류 칩 직하)                                              │
│  ┌─ 간주상속재산 분류 (§8·§9·§10) ──────────────── × ┐                 │
│  │ ( ●일반 )  ( ○ 보험금 §8 )  ( ○ 신탁 §9 )  ( ○ 퇴직금 §10 )     │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│  ────────────────────────────────────────────────────────────────────── │
│  [00 은행 예금       ]  [   1,100,000,000  ] 원                        │
│  §62·시행령 §19① 평가기준일 잔액                                       │
└──────────────────────────────────────────────────────────────────────────┘
   ↑ 인라인 패널: border border-violet-200 bg-violet-50/40 rounded-md p-3
     좌측 vertical bar: border-l-2 border-violet-400 ml-1
```

### 2.3 ⚙️ 펼침 (옵션 N개 비기본값)

```
┌──────────────────────────────────────────────────────────────────────────┐
│  🏛  예금·펀드·채권·공제금 1   [ⓘ평가액 1,100,000,000]                 │
│       [보험금 §8] [§22 ✗ 지정] [협의분할 ✓]  [⚙️ 옵션 (2)] [삭제]      │
│  ────────────────────────────────────────────────────────────────────── │
│  [00 은행 예금       ]  [   1,100,000,000  ] 원                        │
│  §62·시행령 §19① 평가기준일 잔액                                       │
│  ────────────────────────────────────────────────────────────────────── │
│  ┌─ ⚙️ 고급 옵션 ─────────────────────────────────────── × 닫기 ─┐    │
│  │                                                                  │    │
│  │ ── 예상 평가 우선순위 ─────────────────────────────────       │    │
│  │ | 적용 방법    | 시가                                  │       │    │
│  │ |--------------|----------------------------------------|       │    │
│  │ | 예상 평가액  |                       1,100,000,000   │       │    │
│  │                                                                  │    │
│  │ ── hidden_expandable (영농 §16⑤·가업 §15⑤ 미해당)            │    │
│  │   (financial 카테고리 → 영농=hidden_permanent → 미노출)         │    │
│  │   (financial 가업=hidden_expandable → 펼침 링크 노출 시 표시)   │    │
│  └──────────────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────────────┘
   ↑ ⚙️ 패널: border border-slate-200 bg-slate-50/40 rounded-md p-4
```

---

## 3. 시각 목업 — variant REAL_ESTATE (apartment)

### 3.1 기본 상태 (~700px)

```
┌──────────────────────────────────────────────────────────────────────────┐
│  🏢  아파트·공동주택 1     [ⓘ평가액 850,000,000]                       │
│       [일반] [§22 ✗] [협의분할 ✓] [영농 §16⑤ 미선택]                  │
│                                                  [⚙️ 옵션] [삭제]       │
│  ────────────────────────────────────────────────────────────────────── │
│  ── 소재지 ─────────────────────────────────────────────────────────  │
│  ┌─ AddressSearch ────────────────────────────────────────────────┐    │
│  │ 도로명: [강남구 테헤란로 123        ] 🔍 검색                  │    │
│  │ 지번:   [강남구 역삼동 100-1        ]                          │    │
│  │ 건물명: [○○아파트              ]                              │    │
│  │ 상세:   [101동 1502호           ]                              │    │
│  │ PNU:    1168010100100010001 / 좌표: 37.5012, 127.0395          │    │
│  └────────────────────────────────────────────────────────────────┘    │
│  [별칭 (선택): 강남 아파트                                       ]    │
│  ※ 소재지 검색하면 자산명·좌표 자동 입력                              │
│                                                                          │
│  ── 평가 (시가 → 감정가 → 기준시가 §61①) ─────────────────────────  │
│  ┌────────────────────────┬───────────────────────────────────┐       │
│  │ 시가 (매매·수용·경매)  │ 감정평가액                          │       │
│  │ [               ]      │ [                 ]                  │       │
│  └────────────────────────┴───────────────────────────────────┘       │
│  ┌─ StandardPriceInput (공동주택 기준시가) ─────────────────────┐    │
│  │ 기준연도: [2025 ▼]   [기준시가 850,000,000 원]   [🔍 자동조회]│    │
│  │ ※ 시가·감정가 모두 없을 때 최종 적용                          │    │
│  └────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ┌────────────────────────┬───────────────────────────────────┐       │
│  │ 임대보증금 (세입자)    │ 저당권 담보 채권액                  │       │
│  │ [   200,000,000 ] 원   │ [   300,000,000   ] 원              │       │
│  └────────────────────────┴───────────────────────────────────┘       │
│                                                                          │
│  ┌─ ToggleCard (amber) ─────────────────────────────────────── ●ON  │  │
│  │ 이 담보채무를 §14 부채로 자동 공제                              │  │
│  │ 재산평가 담보채권액이 §14 채무로 과세가액에서 공제됩니다.        │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
```

### 3.2 모바일 (sm 이하)

- 헤더 칩: flex-wrap 2~3행
- 시가/감정가: col-12 세로 스택
- 임대보증금/저당권: col-12 세로 스택

---

## 4. 시각 목업 — variant DEPOSIT

```
┌──────────────────────────────────────────────────────────────────────────┐
│  🔑  전세보증금 반환채권 1   [ⓘ평가액 500,000,000]                     │
│       [일반] [§22 ✓ 지정] [협의분할 ✓]      [⚙️ 옵션 (1)] [삭제]       │
│  ────────────────────────────────────────────────────────────────────── │
│  ┌────────────────────────┬───────────────────────────────────┐       │
│  │ 별칭 (선택)            │ 임대보증금                          │       │
│  │ [강남 ○동 전세    ]   │ [   500,000,000   ] 원              │       │
│  └────────────────────────┴───────────────────────────────────┘       │
│  ※ 환산가액 = 보증금 ÷ 12% · 채권 액면가 (상속세 전용)               │
│                                                                          │
│  ┌─ ToggleCard (amber) §14 자동공제 (조건부) ─────────────── ●OFF  │  │
│  │ ... (담보채권액 있을 때만 노출)                                  │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## 5. 헤더 칩 상세 시각

### 5.1 칩 단일 시안 (확대)

```
┌──── chip-estimated-value (정보 칩, hover tooltip) ────┐
│  ⓘ  평가액 1,100,000,000                              │
│  bg-gray-100 / text-gray-700 / border-gray-200        │
│  hover: tooltip "적용 평가: 시가 / §60 시가우선"     │
└─────────────────────────────────────────────────────────┘

┌──── chip-classification (펼침 칩) ──────────────────┐
│  일반  ▼                                              │
│  bg-violet-100 / text-violet-800 / border-violet-200  │
│  aria-expanded={open}                                │
└─────────────────────────────────────────────────────────┘

┌──── chip-section22 ON (즉시 토글, 3-state) ────────┐
│  §22 ✓                                                │
│  bg-emerald-100 / text-emerald-800                    │
│  사용자 지정 시: + ring-1 ring-violet-300           │
└─────────────────────────────────────────────────────────┘

┌──── chip-section22 OFF (3-state) ──────────────────┐
│  §22 ✗                                                │
│  bg-gray-100 / text-gray-700                          │
│  사용자 지정 시: + ring-1 ring-violet-300           │
└─────────────────────────────────────────────────────────┘

┌──── chip-heir-allocation (협의분할 ON, 펼침) ──────┐
│  협의분할 ✓  ▼                                       │
│  bg-sky-100 / text-sky-800                            │
└─────────────────────────────────────────────────────────┘

┌──── chip-heir-allocation (법정분할, OFF) ──────────┐
│  법정분할                                             │
│  bg-gray-100 / text-gray-700                          │
└─────────────────────────────────────────────────────────┘

┌──── chip-heir-allocation (협의분할 미입력 경고) ────┐
│  협의분할 (미입력) ▼                                 │
│  bg-amber-100 / text-amber-800 (경고)                │
└─────────────────────────────────────────────────────────┘

┌──── chip-farming (펼침) ───────────────────────────┐
│  영농 §16⑤  ▼                                        │
│  bg-violet-100 / text-violet-800                      │
└─────────────────────────────────────────────────────────┘

┌──── chip-family-business (펼침) ───────────────────┐
│  가업 §15⑤  ▼                                        │
│  bg-violet-100 / text-violet-800                      │
└─────────────────────────────────────────────────────────┘

┌──── chip-secured-claim-14 (즉시 토글, ON만 노출) ──┐
│  §14 담보공제                                         │
│  bg-amber-100 / text-amber-800                        │
│  hover: "클릭하여 OFF"                              │
└─────────────────────────────────────────────────────────┘
```

### 5.2 칩 정렬 우선순위 (좌→우)

```
[ⓘ평가액] [분류] [§22] [협의분할] [영농] [가업] [§14]
   1       2      3       4         5      6      7
```

### 5.3 액션 영역 우측 고정

```
... [chips wrap]                            [⚙️ 옵션 (N)] [삭제]
                                                  ↑           ↑
                                                  │           text-red-500
                                                  │           hover bg-red-50
                                                  text-xs px-2 py-1
                                                  rounded hover bg-slate-100
```

---

## 6. 인라인 펼침 패널 시각

### 6.1 분류 펼침 (violet)

```
┌─ 인라인 펼침: 간주상속재산 분류 ──────────────── × 닫기 ─┐
│ border border-violet-200 bg-violet-50/40 rounded-md     │
│ border-l-4 border-violet-400 (좌측 강조)                │
│ p-3 mt-2                                                │
│                                                          │
│ ( ●일반 )  ( ○ 보험금 §8 )  ( ○ 신탁 §9 )  ( ○ 퇴직금 §10 ) │
│                                                          │
│ RadioCardGroup layout="inline" — 미선택도 violet 배경    │
└──────────────────────────────────────────────────────────┘
```

### 6.2 협의분할 펼침 (sky)

```
┌─ 인라인 펼침: 상속인·수유자별 협의분할 ────────── × 닫기 ─┐
│ border border-sky-200 bg-sky-50/40 rounded-md           │
│ border-l-4 border-sky-400                               │
│ p-3 mt-2                                                │
│                                                          │
│ [HeirAllocationToggleSection 컴포넌트 그대로]           │
│   ●ON   ✓배우자  + 자녀(맏)  + 자녀(둘째)              │
│   배우자 (김마누라)  [   1,100,000,000           ] 원   │
│   합계 1,100,000,000 ✓                                  │
└──────────────────────────────────────────────────────────┘
```

### 6.3 영농·가업 펼침 (violet — 동일 tone)

```
┌─ 인라인 펼침: 영농상속 자산 분류 (§16⑤) ────────── × ─┐
│ border-l-4 border-violet-400                            │
│ [FarmingCategorySection 컴포넌트 그대로]                │
└──────────────────────────────────────────────────────────┘
```

---

## 7. ⚙️ 패널 시각

### 7.1 외곽

```
┌─ ⚙️ 고급 옵션 ──────────────────────────────────── × 닫기 ─┐
│ border border-slate-200 bg-slate-50/40 rounded-md          │
│ p-4 mt-3 space-y-3                                          │
│                                                              │
│ [내부 섹션들 — D-O1 정책: 칩 노출 항목은 ⚙️에 미노출]      │
└──────────────────────────────────────────────────────────────┘
```

### 7.2 내부 섹션 헤더

```
── 예상 평가 우선순위 ──────────────────────
text-xs font-semibold text-slate-700
border-t border-slate-200 pt-2
```

---

## 8. 인터랙션 상태 (마이크로 인터랙션)

### 8.1 칩 hover

- `hover:brightness-95` (배경 약간 어둡게)
- 펼침 칩: `▼` 회전 (펼친 상태에서 `rotate-180`)
- `transition-all duration-150`

### 8.2 ⚙️ 버튼 hover

- `hover:bg-slate-100 dark:hover:bg-slate-800`
- `transition-colors duration-150`
- 펼친 상태: `bg-slate-100` 유지

### 8.3 인라인 펼침 애니메이션

- `animate-in fade-in slide-in-from-top-2 duration-200` (tailwindcss-animate)
- 닫힘: `animate-out fade-out slide-out-to-top-2 duration-150`

### 8.4 ⚙️ 패널 애니메이션

- 동일 (slide-in-from-top + fade-in)

### 8.5 카드 hover (전체)

- `hover:shadow-sm` (다른 카드와 시각 구분)
- 활성 카드 (포커스 안에 있는 카드): `ring-1 ring-indigo-200`

---

## 9. 다크 모드 색조

| 영역 | light | dark |
|---|---|---|
| 카드 외곽 | `bg-white` | `bg-gray-900` |
| 카드 border | `border-gray-200` | `border-gray-700` |
| 칩 violet | `bg-violet-100 text-violet-800` | `bg-violet-900/30 text-violet-200` |
| 칩 amber | `bg-amber-100 text-amber-800` | `bg-amber-900/30 text-amber-200` |
| 칩 emerald | `bg-emerald-100 text-emerald-800` | `bg-emerald-900/30 text-emerald-200` |
| 칩 sky | `bg-sky-100 text-sky-800` | `bg-sky-900/30 text-sky-200` |
| 칩 gray | `bg-gray-100 text-gray-700` | `bg-gray-800 text-gray-200` |
| ⚙️ 패널 배경 | `bg-slate-50/40` | `bg-slate-900/40` |
| 인라인 패널 배경 | `bg-{tone}-50/40` | `bg-{tone}-900/20` |
| hint 텍스트 | `text-slate-500` | `text-slate-400` |

---

## 10. 인쇄 (PDF) 시각

```
@media print {
  /* ⚙️ 버튼·삭제 버튼 숨김 */
  [data-print-hide], button[data-testid$="-toggle"]:not([data-print-keep]) {
    display: none;
  }

  /* ⚙️ 패널 자동 펼침 */
  [data-testid^="estate-advanced-panel-"] {
    display: block !important;
  }

  /* 인라인 펼침 패널 자동 펼침 */
  [data-testid^="estate-inline-expand-"] {
    display: block !important;
  }

  /* 칩 외곽선 강화 (인쇄 가독성) */
  .chip {
    border-width: 1.5px;
  }

  /* 배경색 강제 인쇄 */
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
```

→ Tailwind `print:hidden` / `print:block` 클래스로 구현.

---

## 11. 반응형 매트릭스

| breakpoint | 헤더 칩 | Body SIMPLE | Body REAL_ESTATE | ⚙️/인라인 |
|---|---|---|---|---|
| ~639 (sm 미만) | wrap 2~3행, 액션 우측 | 12:12 세로 | 12:12 세로 (각 input col-12) | 풀 폭 |
| 640~1023 (sm~md) | wrap 1~2행 | 5:7 2열 | 6:6 2열 | 풀 폭 |
| 1024+ (lg) | 단일행 | 5:7 2열 | 6:6 2열 (입력) | 풀 폭 |

---

## 12. 컴포넌트 사이즈 가이드

| 컴포넌트 | 최대 너비 | 최대 높이 | 비고 |
|---|---|---|---|
| EstateItemCardShell | 100% (부모 컨테이너) | auto | 부모는 max-w-3xl (~768px) |
| 헤더 행 | 100% | min-h-[40px] | 칩 wrap 시 가변 |
| 칩 | auto | 22px | px-2.5 py-0.5 |
| ⚙️ 버튼 | auto | 28px | px-2 py-1 |
| CurrencyInput | 100% | 36px | h-9 |
| 인라인 펼침 패널 | 100% | auto (max 200px 권장) | overflow-auto |
| ⚙️ 패널 | 100% | auto | 펼침 시 500px 이하 권장 |

---

## 13. 접근성 (a11y) 시각 토큰

| 항목 | 토큰 |
|---|---|
| focus ring | `ring-2 ring-offset-1 ring-indigo-500` |
| 키보드 활성 칩 | `outline-none focus-visible:ring-2` |
| disabled 상태 | `opacity-50 cursor-not-allowed` |
| 경고 상태 (협의분할 미입력) | `border-amber-300 bg-amber-50` |
| 에러 상태 (합계 불일치) | `border-rose-300 bg-rose-50` (기존 HeirAllocationInput) |

---

## 14. 빈 카드·로딩 상태 (D2-O3·D2-O6)

### 14.1 방금 추가한 빈 카드

```
┌──────────────────────────────────────────────────────────────────────────┐
│  🏛  예금·펀드·채권·공제금 1   [ⓘ 평가액 미입력]                       │
│       [일반] [§22 ✓]                              [⚙️ 옵션] [삭제]      │
│  ────────────────────────────────────────────────────────────────────── │
│  [자산 명칭 입력           ]  [잔액 또는 시가         ] 원              │
│  §62·시행령 §19① 평가기준일 잔액                                       │
└──────────────────────────────────────────────────────────────────────────┘
   ↑ chip-estimated-value: gray + 점선 border (border-dashed)
   ↑ 입력란: placeholder 표시
```

### 14.2 자동조회 로딩

- StandardPriceInput 내부 spinner (기존)
- ⚙️/칩은 정상 활성
- 자동조회 완료 시 chip-estimated-value 라벨 즉시 갱신 (zustand selector 반응)

---

## 15. 사용자 플로우 다이어그램

```
[자산 추가] → (카드 빈 상태, 칩 [일반][§22✓][⚙️ 옵션])
    ↓
[금액 입력] → chip-estimated-value 즉시 갱신 [ⓘ 평가액 1,100,000,000]
    ↓
[분류 칩 클릭] → 인라인 펼침 (violet 패널) → 라디오 선택 → 칩 [보험금 §8]
                                                            └ 칩 tone amber
    ↓
[§22 칩 클릭] → 3-state 순환:
                undef → true: [§22 ✓ 지정] (violet 외곽)
                true  → false: [§22 ✗ 지정] (violet 외곽)
                false → undef: [§22 ✓] (기본, 외곽 없음)
    ↓
[협의분할 칩 클릭] → 인라인 펼침 (sky 패널) → 분배 입력
    ↓
[⚙️ 클릭] → 슬라이드 다운 → 상세 우선순위 표 + hidden_expandable
    ↓
[삭제 클릭] → 즉시 삭제 (confirmation 없음, 기존 정책)
```

---

## 16. 테스트 ID 시각 매핑

```
data-testid="estate-card-shell-{itemId}"               → 카드 외곽
data-testid="estate-card-header-{itemId}"              → 헤더 행
data-testid="estate-chip-estimated-value-{itemId}"     → ⓘ 평가액 칩
data-testid="estate-chip-classification-{itemId}"      → 분류 칩
data-testid="estate-chip-section22-{itemId}"           → §22 칩
data-testid="estate-chip-heir-allocation-{itemId}"     → 분할 칩
data-testid="estate-chip-farming-{itemId}"             → 영농 칩
data-testid="estate-chip-family-business-{itemId}"     → 가업 칩
data-testid="estate-chip-secured-claim-14-{itemId}"    → §14 칩

data-testid="estate-advanced-panel-toggle-{itemId}"    → ⚙️ 버튼
data-testid="estate-advanced-panel-{itemId}"           → ⚙️ 패널 (펼침 시)
data-testid="estate-card-remove-{itemId}"              → 삭제 버튼

data-testid="estate-inline-expand-{key}-{itemId}"      → 인라인 패널
   key ∈ {classification, heir-allocation, farming, family-business}
```

---

## 17. 변경 사항 요약 (시각 압축 효과)

| variant | Before | After 기본 | After ⚙️ 펼침 | 감소율 |
|---|---|---|---|---|
| SIMPLE (financial) | 700px | 200px | 380px | -71% (기본) |
| REAL_ESTATE (apartment) | 1100px | 700px | 880px | -36% (기본) |
| DEPOSIT | 750px | 250px | 430px | -67% (기본) |
| 칩 5~7개 wrap (모바일) | – | +20px (2행) | – | – |

---

## 18. 참조

- Plan: `docs/01-plan/estate-item-card-compaction.plan.md` (v4)
- UI Design: `estate-item-card-compaction.ui.design.md` (v4)
- Tailwind tone 매핑: [[components/calc/CLAUDE.md]] 토글 가시성 §
- 정책: [[feedback_tailwind_static_tone_mapping]] · [[print-only-css-toggle]] · [[mirror-pattern]]
- 기존 컴포넌트 시각 참조: `FinancialDeductionChip.tsx` (emerald 카드), `HeirAllocationToggleSection` (sky 톤)
