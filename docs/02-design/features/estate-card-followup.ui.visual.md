# estate-card-followup — UI 시각 디자인 (3 PR 통합)

> **Feature ID**: `estate-card-followup`
> **작성일**: 2026-05-28
> **참조 Plan**: [`estate-card-followup.plan.md`](../../01-plan/estate-card-followup.plan.md) (v4)
> **참조 Design**: [`estate-card-followup.design.md`](./estate-card-followup.design.md) (v4)
> **목적**: PR-A/B/C 픽셀-퍼펙트 시각 명세

---

## 1. PR-A — variant 본체 시각 (FU-1)

### 1.1 EstateBodySimple (cash / financial / other)

```
┌────────────────────────────────────────────────────────────────┐
│ data-testid="estate-body-variant-simple-{itemId}"             │
│ space-y-3                                                      │
│                                                                │
│ ── 자산 명칭 (선택) ─────────────────────────────────────────│
│ [00 은행 예금 (placeholder 카테고리별)              ]          │
│                                                                │
│ ── 잔액 또는 시가 ──────────────────────────────────────────│
│ [   1,100,000,000   ] 원                                      │
│ <hint>평가기준일 현재 잔액 (cash·financial 카테고리별 다름) │
│                                                                │
│ (other 카테고리만) ── 감정평가액 ──────────────────────────│
│ [                  ] 원                                       │
└────────────────────────────────────────────────────────────────┘
   ↑ FieldCard 기존 패턴 보존 — 시각 변경 0
```

### 1.2 EstateBodyRealEstate (land / building / apartment)

```
┌────────────────────────────────────────────────────────────────┐
│ data-testid="estate-body-variant-realestate-{itemId}"         │
│ space-y-3                                                      │
│                                                                │
│ ── 소재지 (소재지 검색) ────────────────────────────────────│
│ <AddressSearch (Vworld) — 기존 위젯 그대로>                   │
│ ⚠️ 공시가격 자동 조회는 지번 주소 필수                       │
│ [별칭: 강남 아파트                                       ]   │
│ ※ 소재지 검색하면 자산명 자동 입력                          │
│                                                                │
│ ── 평가 우선순위 (§61①) ───────────────────────────────────│
│ ℹ️ 시가 → 감정가 → 기준시가 순 적용                         │
│                                                                │
│ ┌─────────────────────┬─────────────────────┐                │
│ │ 시가                 │ 감정평가액           │                │
│ │ [             ]      │ [             ]      │                │
│ └─────────────────────┴─────────────────────┘                │
│                                                                │
│ ── 보충적 평가 (공시지가·기준시가) ──────────────────────────│
│ <StandardPriceInput propertyKind={...} enableLookup={true}>   │
│  기준연도 [2025 ▼] [총액] [/㎡ 단가] [🔍 자동조회]            │
│                                                                │
│ (apartment·building만) ── 임대보증금 ──────────────────────│
│ [               ] 원 — 평가액 차감                            │
│                                                                │
│ ── 저당권 채권액 (§66) ────────────────────────────────────│
│ [               ] 원                                          │
│ <hint>평가기준일 실제 채무 잔액(설정액 아님)                  │
│                                                                │
│ (조건부) ── §14 자동공제 ToggleCard (amber) ────── ●ON  │   │
│ 이 담보채무를 §14 부채로 자동 공제                         │   │
└────────────────────────────────────────────────────────────────┘
```

### 1.3 EstateBodyDeposit (전세보증금)

```
┌────────────────────────────────────────────────────────────────┐
│ data-testid="estate-body-variant-deposit-{itemId}"            │
│ space-y-3                                                      │
│                                                                │
│ ── 자산 명칭 ───────────────────────────────────────────────│
│ [강남 ○동 전세보증금                                    ]   │
│                                                                │
│ ── 임대보증금 (자산본체) ──────────────────────────────────│
│ [   500,000,000   ] 원                                        │
│ ℹ️ 환산가액 = 보증금 ÷ 12% · 채권 액면가 (상속세 전용)       │
│                                                                │
│ (조건부) ── §14 자동공제 ToggleCard (amber) ─────────────  │
└────────────────────────────────────────────────────────────────┘
```

---

## 2. PR-B — 주식 카드 칩 시각 (FU-2)

### 2.1 ListedStockEditor / UnlistedStockCard (V1)

```
┌────────────────────────────────────────────────────────────────┐
│ [📈 상장주식 1]  [ⓘ평가액 850,000,000]                       │
│  [일반] [협의분할 ✓] [영농 §16⑤] [가업 §15⑤]               │
│  [최대주주 §22②]                                             │
│                                       [⚙️ 옵션 (1)] [삭제]   │
└────────────────────────────────────────────────────────────────┘
                              ↑ 신규 chip-major-shareholder
                                tone: rose (선택) / gray (미선택)
                                즉시 토글 (펼침 없음)
```

### 2.2 chip-major-shareholder 디테일

```
┌── 최대주주 미선택 (gray) ──────┐
│  최대주주 §22②                  │
│  bg-gray-100 / text-gray-700    │
└──────────────────────────────────┘

┌── 최대주주 선택 (rose · 경고) ──┐
│  최대주주 §22② ✓                │
│  bg-rose-100 / text-rose-800    │
│  → §22② 금융재산공제 배제      │
│  hover: "§22② 배제 vs §22① 적용"│
└──────────────────────────────────┘
```

### 2.3 UnlistedStockV2Card (V2 — 칩 미노출)

V2는 카드 내부 자체 `MajorShareholderStockToggle` 사용 → 헤더에 `chip-major-shareholder` 미노출 (중복 회피).
`showMajorShareholderChip=false` props 전달.

### 2.4 ⚙️ 안 §22 사용자 지정 override (INT-8)

stock visibility=hidden_permanent이지만 `isFinancialAssetForDeduction !== undefined`인 경우 ⚙️ 안에 노출:

```
┌── ⚙️ 고급 옵션 ───────────────────────────────────── × ──┐
│ ── 예상 평가 우선순위 ─────────────────────                │
│ ...                                                         │
│                                                             │
│ ── §22 고급 override (사용자 지정 시만) ──────────────    │
│ <FinancialDeductionChip — 기본 분리·재사용>                │
│  ●ON / ●OFF + [기본값으로 되돌리기]                       │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. PR-C — collapse 시각 (FU-3)

### 3.1 펼친 상태 (자산 5+ 시 collapse 토글 노출)

```
┌────────────────────────────────────────────────────────────────┐
│ data-testid="estate-card-shell-{itemId}" data-collapsed="false"│
│                                                                │
│ [🏛 예금·펀드·채권·공제금 1]  [ⓘ평가액 1,100,000,000]        │
│  [일반] [§22 ✓] [협의분할 ✓]            [⚙️ 옵션] [삭제]    │
│                                                                │
│  [⬆️ 접기]  ← 신규 (자산 5+ 시만 노출)                       │
│  text-xs text-slate-500 print:hidden                          │
│                                                                │
│ ── 본체 (variant·인라인·⚙️ 모두 표시) ─────────────────────│
│ [00 은행 예금   ]  [1,100,000,000  ] 원                       │
│ ...                                                            │
└────────────────────────────────────────────────────────────────┘
```

### 3.2 접힌 상태

```
┌────────────────────────────────────────────────────────────────┐
│ data-testid="estate-card-shell-{itemId}" data-collapsed="true" │
│                                                                │
│ [🏛 예금·펀드·채권·공제금 1]  [ⓘ평가액 1,100,000,000]        │
│  [일반] [§22 ✓] [협의분할 ✓]            [⚙️ 옵션] [삭제]    │
│                                                                │
│  [⬇️ 펼치기]                                                  │
│                                                                │
│ (본체·인라인·⚙️ 패널 모두 hidden + print:block)               │
└────────────────────────────────────────────────────────────────┘
   ↑ 카드 높이 ~70px (헤더 1행 + 칩 1행 + 토글 + 패딩)
   ↑ 자산 10개 시 화면 ~700px만 차지 (선행 700/카드 → 70/카드 = 90% 추가 압축)
```

### 3.3 collapse 자동 트리거 hint (5번째 자산 추가 시)

```
┌── toast (1회만, localStorage hint 저장) ────────────────┐
│ ℹ️ 자산이 5개를 넘었습니다.                               │
│    카드 우측 ⬆️ 접기 버튼으로 압축할 수 있습니다.        │
│                                          [확인]          │
└──────────────────────────────────────────────────────────┘
```

### 3.4 collapse 상태에서 ⚙️ 클릭 → 자동 해제

사용자 인터랙션:
```
[접힌 상태] ⚙️ 옵션 클릭
   → setCollapsed(false) + setAdvancedOpen(true)
   → 카드 펼침 + ⚙️ 패널 펼침
```

시각: 부드러운 슬라이드 다운 애니메이션 (선행 PR `animate-in fade-in slide-in-from-top-2`)

---

## 4. PR-C — 카테고리 변경 Dialog (FU-6)

### 4.1 헤더 ⋮ 메뉴

```
┌─────────────────────────────────────────────────┐
│ [🏛 예금 1]  [⋮]  [⚙️ 옵션] [삭제]              │
│              ↓ 클릭                              │
│              ┌──────────────────────┐            │
│              │ 카테고리 변경         │  ← 메뉴   │
│              └──────────────────────┘            │
└─────────────────────────────────────────────────┘
   ↑ ⋮ : Tabler/Lucide MoreVertical 아이콘
     testid="estate-card-actions-menu-{itemId}"
   ↑ 메뉴: shadcn DropdownMenu
     testid="estate-card-category-change-{itemId}"
```

### 4.2 CategoryChangeDialog

```
┌── 카테고리 변경 ────────────────────── × 취소 ──┐
│ testid="category-change-dialog-{itemId}"        │
│                                                  │
│ 현재 카테고리: [예금·펀드·채권·공제금]          │
│                                                  │
│ 변경할 카테고리:                                 │
│ ( ●아파트·공동주택 ) ← 변경하려는 항목         │
│ ( ○단독주택·건물 )                              │
│ ( ○토지 )                                       │
│ ( ○현금 )                                       │
│ ( ○예금·펀드·채권·공제금 )  (현재)              │
│ ( ○기타 재산 )                                  │
│                                                  │
│ ⚠️ 그룹 간 변경 — 다음 필드가 삭제됩니다:       │
│   • 자산명: ✓ 유지                              │
│   • 평가액: marketValue → 보존                  │
│   • 잔액 정보(통장명·증권 등): ✗ 삭제           │
│   • 협의분할 정보: ✓ 유지                       │
│                                                  │
│ [취소]                  [변경 확인 (rose)]      │
│                          testid="category-      │
│                          change-confirm-{id}"   │
└──────────────────────────────────────────────────┘
   ↑ shadcn Dialog (외부 클릭·Esc로 닫힘)
   ↑ confirm 버튼 = rose-600 (destructive)
```

### 4.3 그룹 내 변경 (경고 없음)

```
┌── 카테고리 변경 ────────────────────── × 취소 ──┐
│ 현재: 토지                                       │
│ 변경: ●아파트·공동주택 (그룹 내 — 전 필드 보존)│
│                                                  │
│ [취소]                          [변경 확인]    │
└──────────────────────────────────────────────────┘
   ↑ confirm 버튼 = indigo-600 (안전)
```

---

## 5. 디자인 토큰 (PR 공통)

### 5.1 collapse 토글 색상

| 상태 | light | dark |
|---|---|---|
| 펼친(⬆️ 접기) | `text-slate-500 hover:text-indigo-600` | `text-slate-400 hover:text-indigo-300` |
| 접힌(⬇️ 펼치기) | 동일 | 동일 |

### 5.2 chip-major-shareholder (rose)

| 상태 | 클래스 |
|---|---|
| 미선택 | `bg-gray-100 text-gray-700 border-gray-200` |
| 선택 | `bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-900/30 dark:text-rose-200` |

### 5.3 카테고리 변경 Dialog

| 영역 | 클래스 |
|---|---|
| Dialog 외곽 | shadcn `<Dialog>` + `max-w-md` |
| 그룹 간 변경 경고 영역 | `border border-amber-200 bg-amber-50/40 rounded-md p-3 text-xs text-amber-800` |
| 손실 필드 목록 | `space-y-1 text-xs` 각 항목 `flex items-center gap-2` (✓/✗ 아이콘) |
| confirm 버튼 (그룹 간) | `bg-rose-600 hover:bg-rose-700 text-white` (destructive) |
| confirm 버튼 (그룹 내) | `bg-indigo-600 hover:bg-indigo-700 text-white` |

---

## 6. testid 매트릭스 (최종)

| testid | PR | 노출 조건 |
|---|---|---|
| `estate-body-variant-simple-{itemId}` | PR-A | cash·financial·other |
| `estate-body-variant-realestate-{itemId}` | PR-A | real_estate_* |
| `estate-body-variant-deposit-{itemId}` | PR-A | deposit |
| `estate-chip-major-shareholder-{itemId}` | PR-B | 상장·V1 inheritance |
| `estate-card-shell-{itemId}` | PR-C | 항상 (외곽 컨테이너) |
| `estate-card-collapse-toggle-{itemId}` | PR-C | 자산 5+ |
| `estate-card-actions-menu-{itemId}` | PR-C | 항상 (헤더 ⋮) |
| `estate-card-category-change-{itemId}` | PR-C | ⋮ 메뉴 항목 |
| `category-change-dialog-{itemId}` | PR-C | Dialog 펼침 시 |
| `category-change-confirm-{itemId}` | PR-C | Dialog 안 |

기존 선행 PR testid는 모두 보존 (변경 0).

---

## 7. 반응형 매트릭스

| 영역 | sm 미만 | md~lg | lg+ |
|---|---|---|---|
| EstateBodySimple | 자산명+금액 세로 스택 | 5:7 2열 | 5:7 2열 |
| EstateBodyRealEstate 평가 그리드 | col-12 세로 | col-6 2열 | col-6 2열 |
| EstateBodyDeposit | col-12 세로 | col-5/7 2열 | col-5/7 2열 |
| chip-major-shareholder | flex-wrap | 단일행 | 단일행 |
| collapse 토글 | 풀폭 | 자동 폭 | 자동 폭 |
| CategoryChangeDialog | 풀폭 max-h-[90vh] overflow-auto | max-w-md | max-w-md |

---

## 8. 인쇄 (PDF) 시각

```
@media print {
  /* collapse 자동 펼침 — body slot의 hidden 클래스 강제 unhide */
  [data-testid^="estate-card-shell-"][data-collapsed="true"] > div:last-child {
    display: block !important;
  }

  /* collapse 토글 버튼 숨김 */
  [data-testid^="estate-card-collapse-toggle-"] {
    display: none !important;
  }

  /* 헤더 ⋮ 메뉴 + ⚙️ 버튼 + 삭제 버튼 숨김 */
  [data-testid^="estate-card-actions-menu-"],
  [data-testid^="estate-advanced-panel-toggle-"],
  [data-testid^="estate-card-remove-"] {
    display: none !important;
  }

  /* 칩 외곽선 강화 */
  [data-testid^="estate-chip-"] {
    border-width: 1.5px;
  }
}
```

Tailwind 클래스 기반:
- `print:hidden` — collapse 토글·⋮ 메뉴·⚙️ 버튼·삭제 버튼
- `hidden print:block` — collapse 시 body slot 자동 노출

---

## 9. 사용자 플로우 (PR-C 통합)

### 9.1 자산 5개 추가 후 카드 정리

```
[자산 5번째 추가]
   ↓
toast 표시: "5개 이상 — ⬆️ 접기 가능" (1회만)
   ↓
사용자 카드 1~3번 ⬆️ 클릭 → 접힘 (헤더만 노출)
   ↓
4·5번 카드는 펼친 상태 유지 (사용자 선택)
   ↓
브라우저 새로고침
   ↓
localStorage에서 collapse 상태 복원 (1~3번 접힘, 4·5번 펼침)
```

### 9.2 카테고리 변경 플로우

```
[카드 헤더 ⋮ 클릭]
   ↓
드롭다운 → "카테고리 변경"
   ↓
CategoryChangeDialog 펼침
   ↓
새 카테고리 선택 (예: financial → real_estate_apartment)
   ↓
그룹 간 변경 감지 → 손실 필드 amber 경고 표시
   ↓
사용자 [변경 확인] 클릭 (rose 버튼)
   ↓
pickPreservedFields 호출 → onUpdate
   ↓
카드 카테고리 변경 + 비호환 필드 자동 삭제
   ↓
헤더 칩 (분류·§22·영농·가업) 즉시 재평가
```

---

## 10. 참조

- Plan v4: `docs/01-plan/estate-card-followup.plan.md`
- Design v4: `docs/02-design/features/estate-card-followup.design.md`
- 선행 PR Visual: `estate-item-card-compaction.ui.visual.md`
- e2e 영향: `e2e/inheritance-stock-financial-chip-absent.spec.ts`, `e2e/inheritance-unlisted-v1-section22-toggle.spec.ts`
