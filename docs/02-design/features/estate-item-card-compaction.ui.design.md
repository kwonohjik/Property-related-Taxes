# 상속재산 입력 카드 압축 (A안) — UI 디자인 문서

> **Feature ID**: `estate-item-card-compaction`
> **작성일**: 2026-05-28 (v1)
> **참조 Plan**: [`docs/01-plan/estate-item-card-compaction.plan.md`](../../01-plan/estate-item-card-compaction.plan.md)
> **대상 컴포넌트**: `components/calc/PropertyValuationForm.tsx` (자산 단일 카드)
> **레이어 범위**: ⑤ UI 위젯 단일 (① ~ ⑭ 중 13개 변경 0)

---

## 0. 정정 이력

| # | 일시 | 사유 |
|---|---|---|
| v1 | 2026-05-28 | 최초 작성 |
| v2 | 2026-05-28 | **1차 자가 검토** (D-C1~C5·D-O1~O7·D-X1~X3·D-I1~I3) — 필드명 검증·단일 인스턴스 정책·§14 본체 단일 위치 |
| v3 | 2026-05-28 | **2차 자가 검토** (D2-C1~C4·D2-O1~O4·D2-X1) — col-6 폭·§22 되돌리기 경로·자동 펼침 제거·테스트 ID 사용처 확인 |
| v4 | 2026-05-28 | **Plan↔Design 통합 검토** (INT-1~11) — Plan과 정합 확인. §22 3-state·인라인 자동 펼침·§14 본체 단일 모두 Plan 반영 완료 |

---

## 1. 케이스 인벤토리 (Mandatory · 비면 Do 진입 금지)

### 1.1 카테고리 × variant × 모드 매트릭스

| # | category | variant | mode | §22 칩 | 영농 칩 | 가업 칩 | 분할 칩 | §14 토글 | 비고 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `real_estate_land` | REAL_ESTATE | inheritance | hidden_exp | default | hidden_exp | ON 조건부 | 조건부 | fishing 분기 가능 |
| 2 | `real_estate_land` | REAL_ESTATE | gift | – | – | – | – | – | 협의분할·영농·가업·§22 미노출 |
| 3 | `real_estate_building` | REAL_ESTATE | inheritance | hidden_exp | default | hidden_exp | ON 조건부 | 조건부 | – |
| 4 | `real_estate_apartment` | REAL_ESTATE | inheritance | hidden_exp | default | hidden_exp | ON 조건부 | 조건부 | – |
| 5 | `cash` | SIMPLE | inheritance | **미노출** (hidden_permanent) | – | – | ON 조건부 | – | §22 칩 자체 안 보임 |
| 6 | `financial` | SIMPLE | inheritance | default | – | hidden_exp | ON 조건부 | – | **사용자 스크린샷 시나리오** |
| 7 | `financial` | SIMPLE | gift | – | – | – | – | – | 모든 ⚙️ 항목 미노출 |
| 8 | `deposit` | DEPOSIT | inheritance | hidden_exp | – | – | ON 조건부 | 조건부 | 상속세 전용 |
| 9 | `other` | SIMPLE | inheritance | hidden_exp | default | default | ON 조건부 | – | fishing 시 영농 활성 |

### 1.2 분류 변경 시 매트릭스 (deemedCategory)

| 현재 분류 | 칩 라벨 | tone | ⚙️ 라디오 |
|---|---|---|---|
| `none` (기본) | `[일반]` | violet | 4 라디오, 첫 옵션 선택 |
| `insurance` | `[보험금 §8]` | amber | 두 번째 옵션 선택 |
| `trust` | `[신탁 §9]` | amber | 세 번째 옵션 선택 |
| `retirement` | `[퇴직금 §10]` | amber | 네 번째 옵션 선택 (cash/financial만) |

### 1.3 협의분할 상태 매트릭스 [D-C1 정정]

실제 필드명: `EstateItem.heirAllocations?: HeirAllocation[]` (확인: `inheritance-gift.types.ts:197`)

| heirs 수 | item.heirAllocations | 칩 표시 | 칩 라벨 | tone |
|---|---|---|---|---|
| 0 | – | 미노출 | – | – |
| 1+ | undefined (법정분할 자동) | 노출 | `[법정분할]` | gray |
| 1+ | `[]` (협의분할 ON · 미입력) | 노출 | `[협의분할 (미입력)]` | amber 경고 |
| 1+ | `[{ heirId, amount }, ...]` | 노출 | `[협의분할 ✓]` | sky |

### 1.4 §22 상태 매트릭스 [D-C2 정정]

실제 필드명: `EstateItem.isFinancialAssetForDeduction?: boolean` (확인: `FinancialDeductionChip.tsx:42`).
세 가지 값 (`true` / `false` / `undefined`):

| isFinancialAssetForDeduction | resolveFinancialEligibility | 칩 라벨 | tone |
|---|---|---|---|
| `undefined` AND defaultEligible=true | true | `[§22 ✓]` (기본) | emerald |
| `undefined` AND defaultEligible=false | false | `[§22 ✗]` (기본) | gray |
| `true` (사용자 지정 ON) | true | `[§22 ✓ 지정]` | emerald + violet 외곽 |
| `false` (사용자 지정 OFF) | false | `[§22 ✗ 지정]` | gray + violet 외곽 |

칩 클릭 동작 (즉시 토글): `eligible ? false : true`를 `isFinancialAssetForDeduction`에 set. "기본값으로 되돌리기"는 ⚙️ 안 FinancialDeductionChip 컴포넌트의 기존 버튼 사용 (칩에서는 미제공).

### 1.5 §14 자동공제 상태 매트릭스

실제 필드명: `EstateItem.deductSecuredClaimAsDebt?: boolean` (확인: `:186`).

| deductSecuredClaimAsDebt | 칩 표시 조건 | 칩 라벨 |
|---|---|---|
| `undefined` 또는 `false` | 칩 미노출 | – |
| `true` | mode=inheritance + securedClaimTotal>0 | `[§14 담보공제]` (amber) |

---

## 2. 컴포넌트 트리

```
EstateItemCardShell (NEW · 외곽 컨테이너)
├── EstateItemHeader (NEW)
│   ├── 아이콘 + 카테고리 라벨 + index
│   ├── EstateItemHeaderChips (NEW)
│   │   ├── chip-estimated-value (항상)
│   │   ├── chip-classification (mode=inheritance) → inline expand
│   │   ├── chip-section22 (visibility !== permanent) → toggle
│   │   ├── chip-heir-allocation (heirs > 0) → inline expand
│   │   ├── chip-farming (visibility !== permanent) → inline expand
│   │   ├── chip-family-business (visibility !== permanent) → inline expand
│   │   └── chip-secured-claim-14 (deductSecuredClaimAsDebt) → ⚙️ 펼침 위임
│   ├── ⚙️ 옵션 버튼 (N 배지)
│   └── 삭제 버튼
│
├── EstateChipInlineExpand (NEW · 칩 직하 단일 패널 — accordion)
│   ├── 분류 펼침: DeemedCategorySection
│   ├── 분할 펼침: HeirAllocationToggleSection
│   ├── 영농 펼침: FarmingCategorySection
│   └── 가업 펼침: FamilyBusinessCategorySection
│
├── Body (variant 분기)
│   ├── EstateBodySimple (NEW · cash/financial/other)
│   ├── EstateBodyRealEstate (NEW · land/building/apartment)
│   │   ├── AddressSearch (재사용)
│   │   ├── 별칭 input
│   │   ├── 시가·감정평가액·StandardPriceInput·임대보증금·저당권
│   │   └── §14 ToggleCard (조건부)
│   └── EstateBodyDeposit (NEW · deposit)
│
└── EstateItemAdvancedPanel (NEW · ⚙️ 펼침)
    ├── EstimatedValuePreview (재사용 · 상세 우선순위 표)
    ├── DeemedCategorySection (재사용)
    ├── FinancialDeductionChip (재사용 · visibility=default일 때)
    ├── FarmingCategorySection (재사용 · visibility=default)
    ├── FamilyBusinessCategorySection (재사용 · visibility=default)
    ├── hidden_expandable 섹션 (영농/가업/§22)
    ├── §14 ToggleCard (조건부)
    └── HeirAllocationToggleSection (재사용 · 칩에서 인라인 펼치지 않은 경우)
```

---

## 3. 칩 시각 명세

### 3.1 기본 스펙

```tsx
<button
  type="button"
  role="button"
  aria-expanded={isExpandable ? isExpanded : undefined}
  aria-pressed={isToggle ? isOn : undefined}
  aria-controls={isExpandable ? `chip-panel-${chipId}-${itemId}` : undefined}
  data-testid={`estate-chip-${chipId}-${itemId}`}
  className={cn(
    "inline-flex items-center gap-1 rounded-full",
    "px-2.5 py-0.5 text-[11px] font-medium",
    "border transition-colors",
    toneClasses[tone],          // 정적 매핑 (CLAUDE.md tailwind-static-tone)
    "hover:brightness-95",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1",
  )}
>
  {label}
  {isExpandable && <ChevronDown className="h-3 w-3" />}
</button>
```

### 3.2 tone 정적 매핑 (Record · CLAUDE.md 정책)

```ts
const CHIP_TONE_CLASSES: Record<ChipTone, string> = {
  gray: "bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-700",
  violet: "bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-900/30 dark:text-violet-200 dark:border-violet-800",
  amber: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-800",
  emerald: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-200 dark:border-emerald-800",
  sky: "bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-900/30 dark:text-sky-200 dark:border-sky-800",
  rose: "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-900/30 dark:text-rose-200 dark:border-rose-800",
};
```

### 3.3 칩별 hover tooltip

| chip | tooltip |
|---|---|
| `chip-estimated-value` | "적용 평가: {시가|감정가|기준시가}\n금액: {amount.toLocaleString()}원\n§60 시가우선" |
| `chip-classification` | "간주상속재산 분류 (§8·§9·§10). 클릭하여 변경" |
| `chip-section22` | "§22 금융재산공제: ON이면 순금융재산의 20%(최대 2억) 공제 적용. 클릭하여 토글" |
| `chip-heir-allocation` | "상속인·수유자별 협의분할 입력. OFF면 법정상속분(민법 §1009) 자동 안분" |
| `chip-farming` | "영농상속 자산 분류 (§16⑤). 클릭하여 분류 선택" |
| `chip-family-business` | "가업상속 자산 분류 (§15⑤). 클릭하여 분류 선택" |
| `chip-secured-claim-14` | "저당채무를 §14 부채로 자동 공제 중. 클릭하여 OFF" |

---

## 4. ⚙️ 패널 시각 명세

### 4.1 헤더

```
┌──── ⚙️ 고급 옵션 ────────────────────────────── × 닫기 ──┐
```

- 외곽: `border border-slate-200 rounded-lg bg-slate-50/40 p-4 dark:bg-slate-900/40 dark:border-slate-700`
- 헤더 행: `flex items-center justify-between mb-3`
- 닫기 버튼: 우측 `×` 아이콘

### 4.2 내부 섹션 spacing

```
space-y-3 (섹션 간)
├ EstimatedValuePreview (재사용 카드 · 상세 표)
├ ── 구분선 (border-t border-slate-200) ──
├ 간주상속재산 분류 (라디오 4)
├ §22 금융재산공제 토글 (visibility=default)
├ 영농 카테고리 (visibility=default)
├ 가업 카테고리 (visibility=default)
├ ── hidden_expandable 섹션 (펼침 링크) ──
└ ── 협의분할 ──
```

### 4.3 ⚙️ 자동 펼침 트리거

- 협의분할 ON 변경 시 → `setAdvancedOpen(true)` 직접 호출 (onChange 콜백 경유, useEffect 0)
- ⚙️ 닫기 버튼 클릭 → `setAdvancedOpen(false)`

---

## 5. 본체(Body) 시각 명세 — variant별

### 5.1 EstateBodySimple (cash · financial · other)

```
┌─────────────────────────────────────────────────────────┐
│ grid grid-cols-12 gap-3                                 │
│ ┌────────── col-span-5 ──────────┬── col-span-7 ──────┐│
│ │ [00 은행 예금          ]        │ [1,100,000,000] 원 ││
│ └─────────────────────────────────┴────────────────────┘│
│ <p text-xs text-slate-500>§62·시행령 §19① ... </p>     │
└─────────────────────────────────────────────────────────┘
```

- 데스크톱 (md~): 5:7 2열
- 모바일: 12:12 세로 스택 (자산명칭 → 금액)
- input은 `CurrencyInput hideUnit + suffix="원"` (R7)
- 자산명칭은 일반 `<input>` (별칭 textbox)

### 5.2 EstateBodyRealEstate (land · building · apartment) [D2-C1 정정]

```
┌─────────────────────────────────────────────────────────┐
│ ── 소재지 ─────────────────────────────────────────── │
│ <AddressSearch ... />                                   │
│ [별칭: 강남 아파트              ]                       │
│ ※ 소재지 검색하면 자산명 자동 입력 (기존 hint 그대로)  │
├─────────────────────────────────────────────────────────┤
│ ── 평가 (시가 → 감정가 → 기준시가) ───────────────── │
│ 데스크톱 md~: 2열 (시가 col-6 / 감정가 col-6)           │
│ 데스크톱 lg~: 2열 그대로                                │
│ 모바일 ~sm:  세로 스택 (col-12 시가 → col-12 감정가)   │
│ ┌─ CurrencyInput min-width: 11ch (천억 단위 13자 보장) ┐│
│ │ [시가      1,100,000,000  원]                       ││
│ │ [감정가    1,050,000,000  원]                       ││
│ └────────────────────────────────────────────────────┘ │
│ [StandardPriceInput] (col-12 — 자동조회 위젯 그대로)   │
├─────────────────────────────────────────────────────────┤
│ grid grid-cols-12 gap-3 (md~: col-6 / sm: col-12)      │
│ [임대보증금] [저당채권액]                               │
│ §14 ToggleCard (조건부 — securedClaimTotal > 0)         │
└─────────────────────────────────────────────────────────┘
```

CurrencyInput 폭 보장:
```tsx
<CurrencyInput hideUnit suffix="원" inputClassName="min-w-[12ch] text-right tabular-nums" />
```
`tabular-nums` + `min-w-[12ch]`로 1조원(13자리) 표시까지 안정. 잘림 시 자동 wrap (모바일).

- 섹션 구분선: `border-t border-slate-200`
- 라벨은 좌측 상단 정렬 (현재 FieldCard 패턴 유지)
- fishing 분기 시 AddressSearch 라벨만 변경 (Plan §5.5)

### 5.3 EstateBodyDeposit

```
┌─────────────────────────────────────────────────────────┐
│ grid grid-cols-12 gap-3                                 │
│ [별칭] (col-5)         [임대보증금] (col-7) 원          │
│ <p hint>환산가액 = 보증금 ÷ 12% · 채권 액면가</p>      │
│ §14 ToggleCard (조건부)                                 │
└─────────────────────────────────────────────────────────┘
```

---

## 6. 인라인 펼침 패널 (EstateChipInlineExpand)

### 6.1 동작 (Accordion · R10)

```ts
type InlineExpandKey = "classification" | "section22" | "heir" | "farming" | "family-business" | null;

const [expanded, setExpanded] = useState<InlineExpandKey>(null);

function onChipClick(key: InlineExpandKey) {
  if (key === "section22" || key === "secured-claim-14") {
    // 즉시 토글, 펼침 없음
    toggleField(key);
    return;
  }
  setExpanded((prev) => (prev === key ? null : key));
}
```

### 6.2 펼침 패널 시각

```
┌─────────────────────────────────────────────────────────┐
│ (헤더 행)                                                │
├─────────────────────────────────────────────────────────┤
│ ┌─ 인라인 펼침 패널 ─────────────────────────── × ──┐  │
│ │ {분류 라디오 4 | 협의분할 칩+input | 영농·가업} │  │
│ └────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────┤
│ (Body)                                                   │
└─────────────────────────────────────────────────────────┘
```

- 패널 외곽: `border border-{tone}-200 bg-{tone}-50/40 rounded-md p-3 mt-2`
- 닫기 버튼: 우상단 × (`setExpanded(null)`)

---

## 7. testid 매트릭스 (Plan §7 동결)

### 7.1 기존 testid (변경 0)

| testid | 위치 |
|---|---|
| `estate-item-deemed-category-{none|insurance|trust|retirement}-{itemId}` | DeemedCategorySection 내부 |
| `estate-item-section22-toggle-{itemId}` | FinancialDeductionChip 내부 |
| `estate-item-heir-allocation-toggle-{itemId}` | HeirAllocationToggleSection 내부 |
| `estate-item-heir-allocation-amount-{heirId}-{itemId}` | HeirAllocationInput 내부 |
| `estate-item-secured-claim-toggle-{itemId}` | PropertyValuationForm:441~494 → EstateBody* 안 |

### 7.2 신규 testid

| testid | 위치 | 용도 |
|---|---|---|
| `estate-chip-estimated-value-{itemId}` | EstateItemHeaderChips | hover tooltip |
| `estate-chip-classification-{itemId}` | – | 인라인 펼침 트리거 |
| `estate-chip-section22-{itemId}` | – | 즉시 토글 |
| `estate-chip-heir-allocation-{itemId}` | – | 인라인 펼침 트리거 |
| `estate-chip-farming-{itemId}` | – | 인라인 펼침 트리거 |
| `estate-chip-family-business-{itemId}` | – | 인라인 펼침 트리거 |
| `estate-chip-secured-claim-14-{itemId}` | – | 즉시 토글 (⚙️와 동기화) |
| `estate-advanced-panel-toggle-{itemId}` | EstateItemHeader | ⚙️ 버튼 |
| `estate-advanced-panel-{itemId}` | EstateItemAdvancedPanel | 패널 컨테이너 (펼침 시 존재) |
| `estate-inline-expand-{key}-{itemId}` | EstateChipInlineExpand | 칩 인라인 패널 |

---

## 8. 상태 관리 (zustand·로컬 분리)

| 상태 | 위치 | 이유 |
|---|---|---|
| `EstateItem.*` 모든 필드 | zustand store (`calc-wizard-store`) | 폼 데이터 — 기존 그대로 |
| `advancedOpen` (⚙️ 펼침) | local useState (per item) | UI 일시 상태 |
| `inlineExpanded` (칩 펼침 key) | local useState (per item) | UI 일시 상태, accordion |
| `addrValue` (AddressSearch) | local useState | 기존 패턴 유지 (좌표 string 변환) |
| `standardPricePerSqm` | local useState | 기존 패턴 유지 |

→ **useEffect → store 미러링 0건** ([[feedback_useeffect_store_mirror_forbidden]] 준수)

---

## 9. 접근성 (a11y)

| 항목 | 처리 |
|---|---|
| 칩 키보드 접근 | `<button type="button">` + Tab 이동 + Enter/Space 활성화 |
| aria-expanded | 펼침 칩에 적용, 토글 칩은 aria-pressed |
| aria-controls | 펼침 칩 → 패널 id 참조 |
| 스크린리더 라벨 | 칩 라벨 텍스트로 충분 (예: "[보험금 §8]") |
| 색맹 고려 | ✓/✗ 텍스트 명시, 색상만으로 ON/OFF 구분 금지 |
| 포커스 링 | `focus-visible:ring-2 focus-visible:ring-offset-1` |

---

## 10. 인쇄 (PDF) 처리

```tsx
// 펼침 상태: 화면=local state, 인쇄=강제 펼침
<div className={cn(
  isAdvancedOpen ? "block" : "hidden",
  "print:block"
)}>
  <EstateItemAdvancedPanel ... />
</div>

// ⚙️ 버튼은 인쇄 시 숨김
<button className="print:hidden" ...>⚙️ 옵션</button>
```

→ PDF 출력 시 모든 ⚙️ 패널이 자동 펼침, 칩은 그대로 표시.

---

## 11. 반응형 (Tailwind breakpoint)

| 영역 | sm (~640) | md (640~) | lg (1024~) |
|---|---|---|---|
| 헤더 칩 영역 | flex-wrap (2~3행) | flex-wrap (1~2행) | 단일행 |
| 액션 버튼 (⚙️·삭제) | 우측 고정 | 우측 고정 | 우측 고정 |
| Body SIMPLE | 세로 2행 | 5:7 2열 | 5:7 2열 |
| Body REAL_ESTATE 그리드 | col-12 모두 세로 | col-6 2열 | col-6 2열 |
| ⚙️ 패널 | 풀 폭 | 풀 폭 | 풀 폭 |
| 인라인 펼침 | 풀 폭 | 풀 폭 | 풀 폭 |

---

## 12. 변경 옵션 카운트 (R11) [D-C2 정정 — 실제 필드명]

```ts
// chip-config.ts
import { resolveFinancialEligibility, getCategoryDefaultEligibility } from "@/lib/calc/financial-deduction-resolver";

export function countNonDefaultOptions(item: EstateItem, mode: "inheritance" | "gift"): number {
  if (mode !== "inheritance") return 0;
  let n = 0;
  if ((item.deemedCategory ?? "none") !== "none") n++;
  // §22: 사용자 지정값이 기본값과 다른 경우만 카운트
  if (item.isFinancialAssetForDeduction !== undefined &&
      item.isFinancialAssetForDeduction !== getCategoryDefaultEligibility(item)) n++;
  if (item.heirAllocations !== undefined) n++;                  // 협의분할 ON (빈 배열 포함)
  if (item.farmingCategory !== undefined) n++;
  if (item.familyBusinessCategory !== undefined) n++;
  if (item.deductSecuredClaimAsDebt === true) n++;
  return n;
}
```

⚙️ 버튼 라벨: `[⚙️ 옵션]` 또는 `[⚙️ 옵션 (N)]`

---

## 12.5 본 디자인 추가 결정 사항 (D-O1~O7·D-X1~X3 정정)

### D-O1·D-O3·D-X1 — 단일 인스턴스 정책 (인라인 vs ⚙️)

**문제**: 분류·분할·영농·가업 4종 입력 컴포넌트(`DeemedCategorySection` 등)가 인라인 펼침과 ⚙️ 패널 양쪽에서 렌더되면 상태 충돌·테스트 ID 중복 발생.

**정책**:
- **칩 인라인 펼침** = 입력 컴포넌트의 **유일한 위치** (해당 칩이 노출되는 경우)
- **⚙️ 패널**은 입력 컴포넌트를 직접 렌더하지 **않음**. 대신 ⚙️ 안에는:
  - EstimatedValuePreview (상세 우선순위 표)
  - hidden_expandable 섹션 (visibility=hidden_expandable인 영농·가업·§22 컴포넌트 — 칩 미노출 대안)
  - §14 ToggleCard (조건부)
- 즉, **칩 노출 시 ⚙️에서는 동일 항목 미노출** → 1 인스턴스 보장 → testid 중복 0

### D2-C2 — §22 사용자 지정값 되돌리기 경로

**문제**: D-O1 정책으로 §22 칩이 노출되면 ⚙️ 안에 FinancialDeductionChip 비노출 → 사용자가 "기본값으로 되돌리기" 버튼을 못 씀.

**정책**:
- 칩 즉시 토글은 **3-state 순환**: `undefined (기본)` → `true (사용자 ON)` → `false (사용자 OFF)` → `undefined (기본 복귀)`
- 사용자 지정 상태(true/false)일 때 칩에 violet 외곽 추가하여 "기본값과 다름" 표시 (§1.4)
- 사용자가 기본값으로 되돌리려면 칩을 2회 더 클릭 (3-state 순환)
- 칩 hover tooltip: "클릭 시 ON→OFF→기본 순환"

### D2-C3 — 기존 e2e/anchor testid 사용처 검증

`grep -rn estate-item-* __tests__/ e2e/` 결과: **현재 0건**. 기존 anchor가 testid에 의존하지 않음 → testid 동결 정책은 "미래 anchor 보호용" 정책으로 격하. 본 PR에서 testid 변경은 무방하나, Plan §7의 testid 정의는 신규 anchor 작성을 위한 명세로 활용.

### D2-X1 — ⚙️ 자동 펼침 제거

**문제**: 분할 칩 노출 시 인라인 펼침만 사용. ⚙️에 분할 입력 없음 → 자동 펼침은 실효 0.

**정책**: §4.3의 "협의분할 ON 시 ⚙️ 자동 펼침"을 **인라인 자동 펼침**으로 변경:
- 협의분할 칩 클릭으로 ON 변경 시 → 동일 칩 패널 자동 펼친 상태로 유지
- ⚙️ 자동 펼침 호출 0건 → useEffect 정책 무관
- Plan §9 X1 정정의 onChange 콜백도 인라인 패널 open 상태 유지로 단순화

### D2-O1 — 인라인 펼침 패널 위치

인라인 펼침 패널은 **헤더 행 바로 아래, Body 위**에 배치. 헤더 직하에 시각적으로 칩과 연결되도록 `mt-2` + 좌측 vertical bar(`border-l-2 border-{tone}-300`) 추가.

### D2-O2 — ⚙️/인라인 펼침 시 스크롤

- 펼침 시 페이지 스크롤 자동 조정 없음 (사용자 의도 보존)
- 단, ⚙️ 펼침 시 카드 외곽이 자동으로 viewport에 들어오도록 `scrollIntoView({ block: "nearest" })` 호출 (옵션 — 후속 검토)

### D2-O3 — 빈 카드 시각

`computeEffectiveValuation(item) === 0` 시:
- `chip-estimated-value` 라벨: `[ⓘ 평가액 미입력]` (gray + dashed border)
- variant SIMPLE은 헤더 카테고리 라벨 우측 칩으로 충분
- 사용자가 금액 입력 즉시 칩 라벨 업데이트 (zustand selector 반응)

### D2-O4 — 삭제 confirmation

기존 :221 `onRemove` 단순 호출 (confirmation 없음). 본 PR도 유지. 협의분할 등록 자산 삭제 시 별도 경고는 기존 정책 그대로 (없음).

### D-O2·D-O4·D-X2 — §14 토글 단일 위치

**결정**: §14 자동공제 토글은 **본체(EstateBodyRealEstate/Deposit) 내부 단일 위치**.
- 헤더 칩(`chip-secured-claim-14`)은 **상태 표시 + ON→OFF 즉시 토글**만 (켜진 상태에서만 노출)
- ⚙️ 패널·인라인 패널에는 §14 토글 미노출
- Plan §3.3 deposit variant에 §14 토글 추가 ([D-X2 정정])

### D-O5 — 협의분할 빈 배열 경고

`heirAllocations === []` 상태에서:
- 칩: `[협의분할 (미입력)]` (amber)
- 칩 클릭 → 인라인 펼침 → 칩+input 표시 + 상단에 amber 경고 텍스트: "분배 대상이 없습니다. 상속인을 선택하세요"
- 합계 검증은 기존 `HeirAllocationInput` 내부 rose 경고 그대로

### D-O6 — Vworld 로딩 중 칩 상태

- 자동조회 중에는 ⚙️ 버튼·칩 모두 정상 활성
- AddressSearch / StandardPriceInput 내부 로딩 spinner는 기존 그대로 (본 PR 변경 0)

### D-O7 — pendingDeemed 사전선택 + 카드 추가

- 사용자가 폼 상단에서 `pendingDeemed=insurance` 선택 후 financial 카드 추가
- 새 카드 `item.deemedCategory = "insurance"`로 초기화 (기존 :641 로직 보존)
- 헤더 칩 초기 라벨: `[보험금 §8]` (amber)
- 분류 칩은 인라인 펼치지 않은 상태로 노출

### D-X3 — 색상 + 텍스트 이중 신호

- ON: `[§22 ✓]` (체크 글리프) + emerald
- OFF: `[§22 ✗]` (X 글리프) + gray
- 분할: `[법정분할]` / `[협의분할 ✓]` (텍스트로 명시)
- 색맹 사용자도 텍스트만으로 상태 구분 가능

### D-I1 — 칩 정렬 우선순위 (좌→우)

```
1. chip-estimated-value (항상 1번째)
2. chip-classification
3. chip-section22
4. chip-heir-allocation
5. chip-farming
6. chip-family-business
7. chip-secured-claim-14
```

### D-I2 — 인라인 패널·⚙️ 패널 컴포넌트 단일화

- `EstateChipInlineExpand` 와 `EstateItemAdvancedPanel`은 별개 컴포넌트
- 그러나 내부 입력 컴포넌트는 D-O1 정책으로 **위치별 분리 렌더**:
  - 분류·분할·영농·가업·§22: 칩 있으면 인라인만, 없으면 ⚙️만 (hidden_expandable)
- 입력 컴포넌트 자체는 한 번만 import, 두 위치에서 재사용 (props·callback 동일)

### D-I3 — countNonDefaultOptions 단위 anchor

§12 함수에 대한 anchor 1건 추가:
- 모든 필드 기본값 → 0
- deemedCategory=insurance → 1
- heirAllocations=[] → 2
- heirAllocations=[{...}] → 2 (배열 길이와 무관)
- isFinancialAssetForDeduction 사용자 지정 = 기본값 → 0 (변경 없음)
- 모든 필드 비기본값 → 6

→ Anchor #4 신설 (Plan §8에 추가 필요)

---

## 13. 디자인 결정 사항 매핑 (Plan §14)

| Plan Q# | 디자인 반영 |
|---|---|
| Q1 (c) 칩별 분기 | §6.1 onChipClick switch |
| Q2 (a) 자산 카드별 | §8 local useState per item |
| Q3 (a) 자동 펼침 | §4.3 onChange 콜백 |
| Q4 (a) PropertyValuationForm만 | §2 컴포넌트 트리에서 주식 카드 제외 |
| Q5 (a) 본체 보존 | §5 본체 위젯 100% 재사용 |

---

## 14. 참조

- Plan: `docs/01-plan/estate-item-card-compaction.plan.md`
- components/calc/CLAUDE.md (tone 매핑·hideUnit·SelectOnFocusProvider)
- 정책 메모리: [[feedback_useeffect_store_mirror_forbidden]] · [[feedback_tailwind_static_tone_mapping]] · [[print-only-css-toggle]] · [[mirror-pattern]]
- 기존 코드: `PropertyValuationForm.tsx:43,151,211,498,524,562`
