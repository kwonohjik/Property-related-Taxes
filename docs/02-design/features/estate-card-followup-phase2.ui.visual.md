# estate-card-followup Phase 2 — UI 시각 디자인

> **Feature ID**: `estate-card-followup-phase2`
> **작성일**: 2026-05-28
> **참조 Plan**: [`estate-card-followup-phase2.plan.md`](../../01-plan/estate-card-followup-phase2.plan.md) (v4)
> **참조 Design**: [`estate-card-followup-phase2.design.md`](./estate-card-followup-phase2.design.md) (v3)
> **목적**: PR-D/E/F/G 픽셀-퍼펙트 시각 명세

---

## 1. PR-D — variant 본체 시각

### 1.1 EstateBodySimple (cash · financial · other)

```
┌────────────────────────────────────────────────────────────────┐
│ data-testid="estate-body-variant-simple-{itemId}"             │
│ space-y-3                                                      │
│                                                                │
│ ── 자산 명칭 ─────────────────────────────────────────────────│
│ [00 은행 예금 (placeholder 카테고리별 다름)              ]    │
│                                                                │
│ ── 평가 우선순위 안내 (sky hint) ─────────────────────────────│
│ ℹ️ §60 시가우선 / 카테고리별 hint                            │
│                                                                │
│ ── 잔액 또는 시가 (카테고리별 라벨) ──────────────────────────│
│ [   1,100,000,000   ] 원                                      │
│                                                                │
│ (other 카테고리만) ── 감정평가액 ─────────────────────────────│
│ [                  ] 원                                       │
└────────────────────────────────────────────────────────────────┘
```

### 1.2 EstateBodyRealEstate (real_estate 3종 + fishing 분기)

```
┌────────────────────────────────────────────────────────────────┐
│ data-testid="estate-body-variant-realestate-{itemId}"         │
│ space-y-3                                                      │
│                                                                │
│ ── 소재지 (소재지 검색 OR 선적지·어장 검색 fishing) ──────────│
│ <AddressSearch ... value={addrValue} onChange={...}>          │
│   도로명 + 지번 + 건물명 + 상세주소 + Vworld 좌표 자동       │
│ [별칭 (선택): 강남 아파트                                ]   │
│ ※ 소재지 검색하면 자산명 자동 입력 / fishing은 §16②1호 검증 │
│                                                                │
│ ── 평가 우선순위 안내 (sky hint) ─────────────────────────────│
│ ℹ️ 시가 → 감정가 → 기준시가 순 (§61①)                       │
│                                                                │
│ ── 평가 입력 ─────────────────────────────────────────────────│
│ [시가              ] 원   [감정평가액         ] 원            │
│                                                                │
│ ── 보충적 평가 (StandardPriceInput + Vworld 자동조회) ────────│
│ ⚠️ 공시가격 자동 조회는 지번 주소 필수                       │
│ 기준연도 [2025 ▼] [총액] [/㎡ 단가] [🔍 자동조회]            │
│                                                                │
│ (apartment·building) ── 임대보증금 (세입자) ─────────────────│
│ [   200,000,000   ] 원                                        │
│                                                                │
│ ── 저당권 채권액 (§66) ────────────────────────────────────│
│ [   300,000,000   ] 원                                        │
│                                                                │
│ (조건부) ── §14 자동공제 ToggleCard (amber) ───────── ●ON  │ │
│ 이 담보채무를 §14 부채로 자동 공제                         │ │
└────────────────────────────────────────────────────────────────┘
```

### 1.3 EstateBodyDeposit (전세보증금)

```
┌────────────────────────────────────────────────────────────────┐
│ data-testid="estate-body-variant-deposit-{itemId}"            │
│ space-y-3                                                      │
│                                                                │
│ ── 자산 명칭 ─────────────────────────────────────────────────│
│ [강남 ○동 전세보증금                                    ]   │
│                                                                │
│ ── 평가 우선순위 안내 ───────────────────────────────────────│
│ ℹ️ 임차인이 임대인에게 맡긴 전세보증금 — 반환받을 채권 액면가 │
│                                                                │
│ ── 임대보증금 (자산본체) ────────────────────────────────────│
│ [   500,000,000   ] 원                                        │
│ <hint>환산가액 = 보증금 ÷ 12% · 채권 액면가                  │
│                                                                │
│ (조건부) ── §14 자동공제 ToggleCard (amber) ─────────────  │ │
└────────────────────────────────────────────────────────────────┘
```

### 1.4 fishing 분기 시각 차이 (REAL_ESTATE 내부)

| 영역 | 일반 소재지 | fishing |
|---|---|---|
| AddressSearch 라벨 | "소재지 검색" | "선적지·어장 연안 검색" |
| 자산명 자동 hint | "소재지 검색하면 자산명 자동 입력" | "선적지·어장 연안 주소를 검색하면 자산명·좌표가 자동 입력 (§16②1호나 거주지 30km 자동 검증용)" |
| 좌표 저장 필드 | `estateLatLng` | `fishingAnchorLatLng` |
| 시·군·구 코드 | `estateSigunguCode` | `fishingAnchorSigunguCode` |

---

## 2. PR-D — forceExpand 자동 해제 플로우

### 2.1 시퀀스 다이어그램

```
[자산 5+ 시 사용자가 카드 접음]
   ↓
collapsed=true, data-collapsed="true"
본체 영역 hidden (mount 유지, local state 보존)
   ↓
[사용자 ⚙️ 옵션 버튼 click]
   ↓
ItemEditor: setForceExpandKey(prev + 1) + setAdvancedOpen(true)
   ↓
Shell의 useEffect 트리거 (forceExpand 변경 감지)
   ↓
firstMountRef.current === false → setCollapsed(false)
   ↓
data-collapsed="false" 자동 전환
본체 노출 + ⚙️ 패널 펼침 (animate-in slide-in-from-top-2)
```

### 2.2 forceExpand 시각적 동작

```
┌── collapse=true 상태 ─────────────────────────┐
│  [🏛 예금 1] [칩] ... [⚙️ 옵션] [삭제]        │
│  [⬇️ 펼치기]                                  │
│                                                │
│  (본체 hidden — 헤더만 노출)                  │
└────────────────────────────────────────────────┘
                  ↓ ⚙️ 클릭
        forceExpandKey 증가 신호
                  ↓
┌── collapse=false + advancedOpen=true 상태 ────┐
│  [🏛 예금 1] [칩] ... [⚙️ 옵션] [삭제]        │
│  [⬆️ 접기]                                    │
│                                                │
│  [본체 입력 영역 노출]                        │
│  [⚙️ 고급 옵션 패널 펼침 (slide-in)]         │
└────────────────────────────────────────────────┘
```

---

## 3. PR-E — 주식 카드 통합 시각 (EstateCommonAttributesSection)

### 3.1 상장주식·V1 simple 카드 헤더

```
┌────────────────────────────────────────────────────────────────┐
│ [📈 상장주식 1]  [ⓘ평가액 850,000,000]                      │
│  [일반] [협의분할 ✓] [영농 §16⑤] [가업 §15⑤]               │
│  [최대주주 §22②]    ← 신규 chip-major-shareholder (rose)    │
│                            [⚙️ 옵션 (1)] [삭제]              │
└────────────────────────────────────────────────────────────────┘
   (chip-section22는 hidden_permanent로 자동 미노출)
```

### 3.2 비상장 V2 formal 카드

```
┌────────────────────────────────────────────────────────────────┐
│ [📊 비상장주식 1]  [ⓘ평가액 1,200,000,000]                  │
│  [일반] [협의분할 ✓] [영농 §16⑤] [가업 §15⑤]               │
│  (chip-major-shareholder 미노출 — V2 카드 내부 자체 토글)    │
│                            [⚙️ 옵션] [삭제]                  │
└────────────────────────────────────────────────────────────────┘
```

### 3.3 chip-major-shareholder 토글 상태

```
┌── 미선택 (gray) ──────────────────────┐
│  최대주주 §22②                          │
│  bg-gray-100 text-gray-700              │
│  hover tooltip: "§22② 배제 vs §22① 적용"│
└──────────────────────────────────────────┘
            ↓ click (즉시 토글)
┌── 선택 (rose · 경고) ──────────────────┐
│  최대주주 §22② ✓                        │
│  bg-rose-100 text-rose-800              │
│  → §22② 금융재산공제 배제              │
└──────────────────────────────────────────┘
```

### 3.4 ⚙️ 안 §22 사용자 지정 override (stock + INT-8)

```
┌── ⚙️ 고급 옵션 ─────────────────── × 닫기 ─┐
│ ── 예상 평가 우선순위 ─────────────         │
│ ...                                          │
│                                              │
│ ── §22 고급 (사용자 지정) ───────────────  │
│ (stock visibility=hidden_permanent + 사용자가│
│  isFinancialAssetForDeduction 명시한 경우만)│
│                                              │
│ <FinancialDeductionChip>                     │
│  공제 대상 [기본 제외]                       │
│  ●OFF / ●ON                                  │
│  [기본값으로 되돌리기]                       │
│ </FinancialDeductionChip>                    │
└──────────────────────────────────────────────┘
```

---

## 4. PR-F — ⋮ 메뉴 + CategoryChangeDialog 시각

### 4.1 헤더 ⋮ 메뉴

```
┌────────────────────────────────────────────────────────────────┐
│ [🏛 예금 1] [칩]              [⋮] [⚙️ 옵션] [삭제]            │
│                                ↑                              │
│                          DropdownMenu trigger                 │
│                          testid="estate-card-actions-         │
│                                   menu-{itemId}"              │
└────────────────────────────────────────────────────────────────┘
                                ↓ click
                        ┌──────────────────┐
                        │ 카테고리 변경     │  ← testid="estate-
                        │   testid 참조     │       card-category-
                        └──────────────────┘       change-{itemId}"
                        (shadcn DropdownMenuContent)
```

### 4.2 CategoryChangeDialog (그룹 간 변경 — rose)

```
┌── 카테고리 변경 ──────────────────────── × ─┐
│ testid="category-change-dialog-{itemId}"     │
│                                              │
│ 현재 카테고리: [예금·펀드·채권·공제금]      │
│                                              │
│ 변경할 카테고리:                             │
│ ( ●아파트·공동주택 )                        │
│ ( ○단독주택·건물 )                          │
│ ( ○토지 )                                   │
│ ( ○현금 )                                   │
│ ( ●예금·펀드·채권·공제금 ) (현재)           │
│ ( ○전세보증금 반환채권 ) (상속세만)         │
│ ( ○기타 재산 )                              │
│                                              │
│ ┌── ⚠️ 그룹 간 변경 — 손실 필드 ─────────┐ │
│ │  ✗ 소재지 주소 (estateAddress)         │ │
│ │  ✗ 기준시가/공시지가                    │ │
│ │  ✗ 임대보증금                           │ │
│ │  ✗ 저당권 채권액                        │ │
│ │  ✗ §14 담보채무 자동공제                │ │
│ │  ※ 자산명·평가액·협의분할은 보존        │ │
│ └──────────────────────────────────────────┘│
│                                              │
│ [취소]              [변경 확인 (필드 손실)] │
│                          ↑                  │
│                    bg-rose-600 text-white   │
│                    testid="category-change- │
│                              confirm-{id}"  │
└──────────────────────────────────────────────┘
```

### 4.3 CategoryChangeDialog (그룹 내 변경 — indigo)

```
┌── 카테고리 변경 ──────────────────────── × ─┐
│ 현재: 단독주택·건물                          │
│ 변경: ●아파트·공동주택 (그룹 내 — 전 필드 보존)│
│                                              │
│ ✓ 자산명·소재지·시가·감정가·기준시가·임대보증금│
│   ·저당권·§14 토글 모두 보존                │
│                                              │
│ [취소]                       [변경 확인]    │
│                              ↑              │
│                        bg-indigo-600         │
└──────────────────────────────────────────────┘
```

### 4.4 손실 필드 한국어 라벨 (INT-3)

| 필드 키 | 한국어 라벨 |
|---|---|
| estateAddress | 소재지 주소 |
| estateLatLng | 소재지 좌표 |
| estateSigunguCode | 시·군·구 코드 |
| standardPrice | 기준시가/공시지가 |
| appraisedValue | 감정평가액 |
| leaseDeposit | 임대보증금 |
| mortgageAmount | 저당권 채권액 |
| deductSecuredClaimAsDebt | §14 담보채무 자동공제 |
| securedClaimIsFinancialDebt | 금융회사 채무 여부 |
| securedClaimCreditorName | 채권자명 |
| deemedCategory | 간주상속재산 분류 |
| farmingCategory | 영농상속 자산 분류 |
| familyBusinessCategory | 가업상속 자산 분류 |

---

## 5. 디자인 토큰 (PR 공통)

### 5.1 chip-major-shareholder (rose · INT-1)

| 상태 | light | dark |
|---|---|---|
| 미선택 | `bg-gray-100 text-gray-700 border-gray-200` | `bg-gray-800 text-gray-200 border-gray-700` |
| 선택 | `bg-rose-100 text-rose-800 border-rose-200` | `bg-rose-900/30 text-rose-200 border-rose-800` |

### 5.2 CategoryChangeDialog (PR-F)

| 영역 | 클래스 |
|---|---|
| Dialog 외곽 | shadcn `<Dialog>` + `max-w-md` |
| 손실 필드 amber 박스 | `border border-amber-200 bg-amber-50/40 rounded-md p-3 dark:bg-amber-900/20 dark:border-amber-800` |
| 손실 필드 ✗ 아이콘 | `text-rose-600 dark:text-rose-300` |
| 손실 필드 목록 | `space-y-1 text-xs text-amber-800 dark:text-amber-200` |
| confirm (그룹 간 · destructive) | `bg-rose-600 hover:bg-rose-700 text-white` |
| confirm (그룹 내 · 안전) | `bg-indigo-600 hover:bg-indigo-700 text-white` |
| cancel | `border border-input bg-background hover:bg-accent` |

### 5.3 ⋮ 메뉴 (DropdownMenu)

| 영역 | 클래스 |
|---|---|
| trigger ⋮ 버튼 | `text-xs text-slate-500 hover:text-indigo-600 dark:text-slate-400 px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 print:hidden` |
| DropdownMenuContent | shadcn 기본 + `min-w-[160px]` |
| MenuItem | shadcn 기본 |

---

## 6. testid 매트릭스 (PR-D·E·F·G 통합)

| testid | PR | 위치 |
|---|---|---|
| `estate-body-variant-simple-{itemId}` | PR-D | EstateBodySimple 루트 |
| `estate-body-variant-realestate-{itemId}` | PR-D | EstateBodyRealEstate 루트 |
| `estate-body-variant-deposit-{itemId}` | PR-D | EstateBodyDeposit 루트 |
| `estate-card-actions-menu-{itemId}` | PR-F | 헤더 ⋮ DropdownMenu trigger |
| `estate-card-category-change-{itemId}` | PR-F | ⋮ 메뉴 항목 |
| `category-change-dialog-{itemId}` | PR-F | Dialog 컨테이너 |
| `category-change-radio-{newCategory}-{itemId}` | PR-F | Dialog 라디오 옵션 |
| `category-change-confirm-{itemId}` | PR-F | Dialog confirm 버튼 |

기존 선행 PR testid 모두 보존.

---

## 7. 반응형 매트릭스

| 영역 | sm 미만 | md~lg | lg+ |
|---|---|---|---|
| EstateBodySimple | 자산명+시가 세로 | 12 col 단일 | 동일 |
| EstateBodyRealEstate 평가 그리드 | col-12 세로 | col-6 2열 | 동일 |
| ⋮ 메뉴 위치 | 헤더 우측 wrap | 헤더 우측 고정 | 동일 |
| CategoryChangeDialog | 풀폭 max-h-[90vh] overflow-auto | max-w-md | max-w-md |
| chip-major-shareholder | flex-wrap | 단일행 | 단일행 |

---

## 8. 인쇄 (PDF) 시각

```css
@media print {
  /* PR-D collapse 자동 펼침 (선행 정책) */
  [data-card-body][data-collapsed-hidden] { display: block !important; }
  [data-testid^="estate-card-collapse-toggle-"] { display: none !important; }

  /* PR-F ⋮ 메뉴 + Dialog 인쇄 시 숨김 */
  [data-testid^="estate-card-actions-menu-"] { display: none !important; }
  [data-testid^="category-change-dialog-"] { display: none !important; }

  /* PR-D ⚙️·삭제 버튼 숨김 (선행 정책) */
  [data-testid^="estate-advanced-panel-toggle-"],
  [data-testid^="estate-card-remove-"] { display: none !important; }

  /* 칩 외곽선 강화 */
  [data-testid^="estate-chip-"] { border-width: 1.5px; }
}
```

Tailwind 클래스: `print:hidden` (모든 액션 버튼) · `print:block` (body slot)

---

## 9. 사용자 플로우 다이어그램

### 9.1 카테고리 변경 플로우 (PR-F)

```
[자산 카드 ⋮ click]
   ↓
DropdownMenu 펼침 → "카테고리 변경" 선택
   ↓
CategoryChangeDialog 펼침
   ↓
사용자 새 카테고리 라디오 선택 (예: financial → real_estate_apartment)
   ↓
oldGroup (financial) ≠ newGroup (real_estate) → 그룹 간 변경 감지
   ↓
pickPreservedFields(item, newCategory) 호출
   ↓
preserved = { id, name, heirAllocations, marketValue, category: newCategory }
손실 필드 = (item에 있고 preserved에 없는 키들)
   ↓
amber 박스에 손실 필드 13개 매트릭스 중 해당 항목만 표시
confirm 버튼 = rose (destructive)
   ↓
사용자 [변경 확인 (필드 손실)] click
   ↓
onConfirm(newCategory, preserved) 호출
   ↓
PropertyValuationForm.handleUpdate(index, { ...preserved })
   ↓
카드 카테고리 변경 → variant 자동 재선택 → 헤더 칩 즉시 갱신
```

### 9.2 collapse + forceExpand 플로우 (PR-D)

```
[자산 5번째 추가]
   ↓
사용자 카드 1번 ⬆️ 접기 → collapsed=true, localStorage 저장
   ↓
잠시 후 사용자 1번 카드의 ⚙️ 옵션 click
   ↓
ItemEditor: setForceExpandKey(0→1) + setAdvancedOpen(true)
   ↓
Shell useEffect: forceExpand 1 감지 (firstMountRef는 false 이미)
   ↓
setCollapsed(false) → localStorage="false"
   ↓
data-collapsed="false" + body slot 노출 + ⚙️ 패널 펼침
```

---

## 10. anchor 시각 매트릭스

### PR-D
- variant 3종 렌더 (testid 확인)
- fishing 분기 AddressSearch 라벨
- forceExpand 시퀀스 (Pre/Act/Post)

### PR-E
- ListedStockEditor chip-major-shareholder 노출
- UnlistedStockV2Card chip-major-shareholder 미노출
- stock §22 override ⚙️ 노출

### PR-F
- ⋮ 메뉴 펼침 → 항목 click → Dialog 펼침
- 그룹 내/간 confirm 버튼 색상 분기
- 손실 필드 한국어 라벨 표시

### PR-G
- 칩 키보드 Tab/Enter/Space
- 칩↔⚙️ 상태 동기 (countNonDefaultOptions 배지)

---

## 11. 참조

- Plan v4
- Design v3
- 선행 Visual: `estate-card-followup.ui.visual.md`
- 선행 PR: `8d18f15`, `5e5bb0b`
- 정책: [[components/calc/CLAUDE.md]] (tone·hideUnit) · [[feedback_tailwind_static_tone_mapping]] · [[print-only-css-toggle]] · [[mirror-pattern]]
