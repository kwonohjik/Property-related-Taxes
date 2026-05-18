# 주식 양도세 — 취득 후 상장 환산취득가 PDF 완전 재현 (UI 설계)

> **Plan**: [`../../00-pm/stock-transfer-post-listing-pdf-replica.plan.md`](../../00-pm/stock-transfer-post-listing-pdf-replica.plan.md)
> **Engine**: [`stock-transfer-post-listing-pdf-replica.engine.design.md`](./stock-transfer-post-listing-pdf-replica.engine.design.md)
> **작성일**: 2026-05-18
> **세목**: stock-transfer
> **세션 책임**: `stock-transfer-tax-ui-senior` (Phase D~G·H)
> **개정 이력**: v1 (초안) → v2 (Round 3 — D-01~D-15 반영) → **v3 (Round 4 — C-01~03 + H-01~07 + M-01~08 + L-01~03 반영, 2026-05-18)**

## Context

PDF 사례 48의 환산취득가 산출 다이얼로그 3종(상장시 주당 평가액·순손익 계산서·순자산가액 계산서)을 마법사 Step 2 내부에 완전 재현. 현행 `PostListingValuationCard.tsx`의 간이 4필드 입력을 보존하면서, 모드 토글(`unlistedDetailMode`)로 부분/완전 재현 모드를 선택 가능하게 한다.

---

## 1. 사용자 시나리오

### Scenario A — 회귀 호환 (Simple 모드, default)
사례 48과 동일하게 외부에서 보충적 평가를 마친 사용자가 4개 결과값(61,570 / 5,352 / 44,520 / 4,348)만 입력하여 즉시 환산취득가 산출. **기존 사용자 경험 보존**.

### Scenario B — 부분 재현 (Listing-only)
상장연도 결산서만 보유하고 취득연도는 외부 계산을 마친 경우, 상장연도 순손익·순자산 상세 입력 + 종가 화면 + 취득연도 결과값 직접 입력.

### Scenario C — 완전 재현 (Full mode)
양도코리아 PDF 그대로 모든 결산서 원천 데이터를 입력. 일자별 종가 16~32셀 + 순손익 16행 × 2열 + 순자산 18행 × 2열 + 영업권 + 환원율. **80필드 입력 → 환산 1주당 자동 산출**.

### Scenario D — 부동산과다보유
`isHeavyRealEstateForValuation === true` 체크된 사용자가 Full mode 진입 시 가중치 자동 반전(2:3) 적용, 미리보기·결과 카드 모두 반전 표시.

### Scenario E — §81④ 월할 가산
취득일 평가 = 상장일 평가인 동일 사업연도 케이스에서 `monthlyAccrualToggle` 수동 ON. 가산 결과 안내.

---

## 2. UI 구조

### 2.1 진입 게이트 (R2-05 우선순위, D-02 정정)

`isListed`는 **`marketType` 기반 파생** (`taxCategory` 아님). 현행 `Step2.tsx`:
```ts
const isListed = ["kospi", "kosdaq", "konex"].includes(formData.marketType);
```
`taxCategory`는 시장 + 대주주 + 회사 분류 합산 후 산출되는 별도 enum이며, 본 게이트와 무관.

```
Step 2 (취득가액)
└── acquisitionMode === "estimated"
    └── isListed (marketType ∈ {kospi, kosdaq, konex} 기반 파생)
        └── PostListingValuationCard
            ├── ToggleCard `acquiredBeforeListing` (기존, amber)
            │   └── 카드 ON 시:
            │       ├── 환산 산식 안내 (violet)
            │       ├── (NEW) unlistedDetailMode RadioCardGroup ─── 3 옵션
            │       │   ├── "simple"  : 결과값 4개 직접 입력 (현행)
            │       │   ├── "listing_only" : 상장연도만 상세
            │       │   └── "full" : PDF 3개 화면 모두 재현
            │       ├── (mode==="simple") 현행 4필드 그대로
            │       ├── (mode==="listing_only" or "full")
            │       │   ├── <PostListingClosingPriceTable /> (full 한정)
            │       │   ├── <PostListingNetIncomeStatement /> (조건부 컬럼)
            │       │   ├── <PostListingNetAssetStatement /> (조건부 컬럼)
            │       │   └── <PostListingFormulaPreview />
            │       ├── ToggleCard `monthlyAccrualToggle` (rose) (Case 5)
            │       │   └── **표시 조건 (D-10)**: unlistedDetailMode !== "simple"
            │       │       ─ simple 모드 사용자는 §81④ 가산을 4 결과값에 미리 반영했다고 가정 → 토글 숨김
            │       │       ─ listing_only · full 모드에서만 노출
            │       └── ToggleCard `tradingHaltAtTransfer` (rose, **disabled** + tooltip "후속 PR")
            │           └── (C-06) — 본 PR에서 보존하되 비활성
```

### 2.2 컴포넌트 분할 (800줄 정책 사전 적용)

| 컴포넌트 | 줄 수 (추정) | 책임 |
|---|---|---|
| `PostListingValuationCard.tsx` (orchestrator) | ~280 | 모드 토글·게이트·sub-component 조합·기존 simple 입력 |
| `PostListingClosingPriceTable.tsx` | ~260 | F-03~F-06 일자별 종가 16~32 셀 + 종가합계·평균 useMemo (H-01 import) |
| `PostListingNetIncomeStatement.tsx` | ~340 | 순손익 16행 × 2열 + 보조 2행 (주식수·환원율) + 1주당 가액 useMemo (H-02 import) |
| `PostListingNetAssetStatement.tsx` | ~300 | 순자산 18행 × 2열 + 영업권 + 1주당 자산 useMemo (H-03 import) |
| `PostListingFormulaPreview.tsx` | ~150 | 6단계 환산 미리보기 (H-04·환산비율·1주당 취득기준시가·총취득가) |

**Props 시그니처**:
```tsx
interface SubComponentProps {
  form: Pick<StockTransferFormData, /* 해당 필드들 */>;
  onChange: (patch: Partial<StockTransferFormData>) => void;
  /** 부동산과다 가중치 반전 — Preview에만 필요 (D-09 정밀화) */
  isHeavyRE?: boolean;
}
```

**isHeavyRE 주입 경로 (D-09 정밀화)**: `isHeavyRE`는 **`PostListingFormulaPreview`에만 필요** — H-04 가중평균 산식에 영향. NetIncome/NetAsset Statement 자체는 가중치와 무관 (1주당 순손익가치·순자산가치만 산출). orchestrator는 `form.isHeavyRealEstateForValuation` 한 곳을 읽어 Preview에 직접 prop drilling.

**RadioCardGroup `unlistedDetailMode` 명세 (D 추가)**:
```tsx
<RadioCardGroup
  name="unlistedDetailMode"
  value={form.unlistedDetailMode || "simple"}  // 3중 패턴 default
  onChange={(v) => onChange({ unlistedDetailMode: v as "simple"|"listing_only"|"full" })}
  tone="amber"
  layout="stack"
  options={[
    { value: "simple", label: "간이 (결과값 4개 직접 입력)",
      description: "외부에서 보충적 평가를 마친 사용자용 — 현행 방식 (회귀 호환)" },
    { value: "listing_only", label: "부분 재현 (상장연도만 상세)",
      description: "상장연도 결산서만 보유한 경우 — 취득연도는 결과값 직접 입력" },
    { value: "full", label: "완전 재현 (PDF 3개 화면)",
      description: "양도코리아 PDF 그대로 — 종가 표 + 순손익 + 순자산 결산서 원천 입력" },
  ]}
/>
```

### 2.3 UI 위젯 표준

- **공용 컴포넌트만** 사용 (`CurrencyInput`·`DateInput`·`FieldCard`·`ToggleCard`·`RadioCardGroup`)
- 다-섹션 폼 색상 카드 + 섹션 번호 패턴 (`components/calc/CLAUDE.md` 강제)
  - 종가 화면 → `border-emerald-200 bg-emerald-50/40` (양도시점 → 본 케이스에선 상장시점)
  - 순손익 화면 → `border-amber-200 bg-amber-50/40`
  - 순자산 화면 → `border-sky-200 bg-sky-50/40`
  - 미리보기 → `border-violet-300 bg-violet-50`
- **placeholder 숫자 예시 금지** (C-01 정정 — Round 1)
- **포커스 시 전체 선택**: Provider 자동 적용 (수동 onFocus 금지)

---

## 3. 14개 동기화 지점 (Definition of Done)

| # | 지점 | 위치 / 작업 |
|---|---|---|
| ① | FormData 타입 | `lib/stores/calc-wizard-stock-store.ts` `StockTransferFormData`에 80 신규 필드 (모드 2 + 종가 4 + 순손익 36 + 순자산 38). `string[]` 2종 명시 |
| ② | initial value | `INITIAL_STOCK_FORM_DATA` — string은 빈문자, `string[]`은 빈배열, `unlistedDetailMode: "simple"`, `monthlyAccrualToggle: false`, `niDiscountRateListing: "10"`, `niDiscountRateAcq: "10"` |
| ③ | normalize | `normalizeStockForm` — undefined → "" / Array.isArray ? ... : []. `unlistedDetailMode` enum 빈문자 → `"simple"` (4중 일관성 [[feedback_store_default_vs_ui_display_fallback]]) |
| ④ | API 변환 | `lib/calc/stock-transfer-tax-api.ts` — `unlistedDetailMode === "full"` 분기에서 **`adaptFlatToApiBody(form)` 호출**하여 body에 `postListingDetail` nested + `acquiredBeforeListing=true` 합성. 환원율 % → decimal 변환은 adapter 내부 |
| ⑤ | UI 입력 위젯 | §2.2 4 신규 sub-component |
| ⑥ | 사이드바 합계 | **D-01 정정**: `computeStockSummary` 함수는 **존재하지 않음**. 실제 통합 위치 = `components/calc/stock-transfer/StockSidebar.tsx`의 `summary` useMemo. 현행 8개 표준 표시 항목(양도가액·취득가액·필요경비·양도소득금액·기본공제·과세표준·산출세액·지방소득세)을 유지하고, **"취득가액" 항목의 effective 값에 full mode adapter 호출을 추가**하여 `adaptFlatToApiBody(form).postListingDetail`이 활성이면 환산 결과값으로 자동 반영. 별도 (a)(b)(c) 3종 추가 항목 X (8항목 표준 깨짐 방지). 0·NaN 가드 |
| ⑦ | 결과 카드 | `StockTransferTaxResultView`에 `PostListingDetailCard` 신설 — `LotMatchingDetailCard` 직후 위치. PDF 6 중간값 + 사례 자가검증 라인(양도가 − 환산취득가 − 개산공제 = 양도차익) + 80% 하한 미적용 violet 안내 |
| ⑧ | Validation | `stock-transfer-tax-validate.ts` Step2 — 모드별 매트릭스:<br>• `simple`: 현행 4필드 필수<br>• `listing_only`: 종가 4 + 상장 18 = 22 필수 + 취득 4 결과값 직접<br>• `full`: 80필드 모두 필수<br>**Round 4 H-03 추가 조합 차단**: `tradingHaltAtTransfer === true && acquiredBeforeListing === true && unlistedDetailMode !== "simple"` → "거래정지 + 취득 후 상장 환산 조합은 후속 PR 예정" 명확한 오류 차단<br>API/UI fallback 일관성 — UI 통과↔validate 차단 모순 방지 [[feedback_validation_sync_8th_point]] |
| ⑨ | Zod enum (메인) | `lib/api/stock-transfer-tax-schema.ts` — `unlistedDetailModeSchema = z.enum(["simple","listing_only","full"]).optional().default("simple")` |
| ⑩ | Zod enum (컴패니언) | N/A (자산-수준 아님) |
| ⑪ | acquisitionDate fallback | N/A |
| ⑫ | Zod 입력 객체 | `stock-transfer-tax-schema.ts` — 80필드 모두 정의. `string[]` 2종은 `z.array(z.string()).optional().default([])`. flat 입력 받아서 schema 통과 후 route handler에서 nested 변환 |
| ⑬ | callStockTransferAPI body spread | **`buildPostListingApiBody(form)` 헬퍼 분리** (`lib/calc/stock-transfer-post-listing-api-helper.ts` 신규 ~120줄). callStockTransferAPI 본체에서는 `...buildPostListingApiBody(form)` 한 줄만 추가 (800줄 정책 준수) |
| ⑭ | route handler 매핑 | `app/api/calc/stock-transfer/route.ts` — **단건 POST + buildEngineInput 두 곳 모두** 매핑. nested object로 합성하여 엔진 `StockTransferInput.postListingDetail` 채움. grep 점검: `grep -n "listingPriceClosing\\|niAddRow1" route.ts` 2회 이상 |

---

## 4. 모드별 화면 동작 표

| 모드 | 종가 표 | 순손익 (상장열) | 순손익 (취득열) | 순자산 (상장열) | 순자산 (취득열) | 4 결과 필드 |
|---|---|---|---|---|---|---|
| `simple` | 숨김 | 숨김 | 숨김 | 숨김 | 숨김 | **표시 + 필수** (현행 동작) |
| `listing_only` | 표시 | 표시 | **숨김** | 표시 | **숨김** | 취득 2개만 표시 + 필수 |
| `full` | 표시 | 표시 | 표시 | 표시 | 표시 | 숨김 (adapter가 자동 합성) |

**Mode 전환 시 데이터 보존 + 안내 (D-09)**: 모드 변경해도 입력 데이터는 store에 그대로 유지. 단순 표시 토글. 사용자가 모드를 오가며 점진적으로 입력 가능. **카드 상단에 1줄 안내**: "모드를 변경해도 이미 입력한 상세 데이터는 보존되며, 모드를 되돌리면 다시 표시됩니다." (혼란 차단). full → simple 전환 시에는 4 결과값을 별도 입력해야 결과 산출됨을 추가 안내.

**종가 표 일자 자동 채움 (D-04 + Round 4 H-01)**: 사용자가 `listingDate` 입력 시 종가 표 1행 일자 = `listingDate`, 이후 +1일씩 32행까지 자동 채움. 휴일·주말은 일자만 채우고 종가는 빈문자(사용자가 비워둠). onChange cross-field로 처리 (useEffect → store 미러링 금지 — [[feedback_useeffect_store_mirror_forbidden]]).

**`listingDate` 입력 위치·trigger 명세 (Round 4 H-01)**:
- `listingDate`는 본 PR 신규 필드가 **아님** — 기존 `StockTransferInput.listingDate` (현행 PostListingValuationCard L117~122의 `DateInput`)
- trigger: `acquiredBeforeListing` 토글 ON + `listingDate` 입력 완료(blur or onChange) 시점에 종가 표 32셀 일자 자동 채움
- `listingDate` 미입력 상태에서 사용자가 `unlistedDetailMode = "full"` 또는 `"listing_only"` 선택 시 종가 표 상단에 amber 안내: "상장일을 먼저 입력하세요" + 종가 표 전체 disabled
- `listingPriceBasisDate` (F-05) default 산식 = `listingDate ± 1일` (R-06 Phase A 결론 종속). listingDate 변경 시 onChange cross-field로 basisDate 자동 갱신

**종가 표 데이터 구조 vs UI 배치 (D-05)**: 데이터는 단일 `string[]` 32 슬롯 (간단·일관). UI 렌더링은 2-col grid로 PDF 좌(0~15행)·우(16~31행) 시각 배치. 모바일도 2-col 유지 (셀이 작아 가능).

**종가 표 행 추가/제거 (D-06)**: **32셀 고정 표시**. "+행 추가" 버튼 없음 — 빈 셀은 거래일 계산에서 자동 제외. PDF UX와 동일.

**niShareCount vs naShareCount (D-08)**: 분리 입력 강제 (분할·증자 가능성). 두 셀 옆에 sky 안내 카드 1줄: "보통 두 값은 동일합니다. 분할·증자 시에만 다르게 입력하세요."

---

## 5. 미리보기(`PostListingFormulaPreview`) 명세

### 5.1 6단계 표시
```
[1] 상장일 직후 1개월 종가합계 168,040 ÷ 거래일 21 = 종가평균 8,001     ← H-01
[2] 상장연도 1주당 순손익가치 61,570 (= netIncomeAmount/주식수/환원율)   ← H-02
[3] 상장연도 1주당 순자산가치 5,352   (= netAssetAmount/주식수)         ← H-03
[4] 상장연도 가중평균 평가가액 = 61,570×3/5 + 5,352×2/5 = 39,083        ← H-04
[5] 동일 — 취득연도 4,452 → 44,520 / 4,348 → 28,451
[6] 환산비율 = 28,451 ÷ 39,083 = 0.72792
    1주당 취득기준시가 = floor(8,001 × 0.72792) = 5,824
    총 환산취득가 = 5,824 × 주식수 5,000 = 29,120,000
```

### 5.2 이중 진실 차단 ([[feedback_ui_engine_dual_truth_avoidance]])
- 본 미리보기는 **엔진 H-01·H-02·H-03·H-04 import 후 호출** — 자체 산식 재구현 0건
- Flat → Nested 어댑터(`lib/tax-engine/stock-transfer/post-listing-flat-adapter.ts`)도 엔진 모듈에서 import — UI 자체 매핑 0건. import path 명시
- useMemo dependency는 80필드 전부 — 변경 즉시 갱신

### 5.3 점진적 표시 (D-12)

미완 입력 시 단계별 가시 규칙:

| 단계 | 활성 조건 | 표시 |
|---|---|---|
| [1] 종가 평균 | `closing.closes`에 ≥ 1 셀 채워짐 | `종가합계 X ÷ 거래일 Y = 평균 Z` |
| [2] 상장연도 평가 | 상장 순손익(addA/subB + shareCount + discountRate) + 순자산(자산총계 + 부채총계 + shareCount) 모두 채워짐 | `상장연도 1주당 가중평균 = 39,083` |
| [3] 취득연도 평가 | 동상 (취득연도) | `취득연도 1주당 가중평균 = 28,451` |
| [4] 환산비율 + 1주당 + 총취득가 | [1]·[2]·[3] 모두 완료 + 종가 평균 > 0 | 6단계 모두 표시 |

미완 단계는 회색 placeholder: "취득연도 결산서 입력 시 환산비율이 표시됩니다" 등.

### 5.4 입력 단계 80% 하한 안내 (D-안내 보강)
Preview 카드 하단에 violet 작은 안내 1줄: "환산비율 산정에는 80% 하한이 적용되지 않습니다 (양도일 비상장 평가와 별개)." 사용자가 "내 ratio가 80% 미만이면 자동 보정될까?" 혼란 차단.

---

## 6. 결과 화면 (`PostListingDetailCard`)

### 6.1 노출 게이트 + 위치 (D-03 정정)

**게이트** (split·single 모드 무관):
```ts
const showPostListingDetailCard =
  result.acquiredBeforeListing === true &&
  (result.postListingDetail?.detail != null ||
   (result.postListingDetail?.totalAcquisitionPrice ?? 0) > 0);
```

**위치 분기**:
- `lotsMode === "split"` → `LotMatchingDetailCard` 직후
- `lotsMode === "single"` → 취득가액 산출 섹션 다음 (CalculationStep 목록 중 "취득가액 산정" 단계 직후)

**모드 표시 배지** (우측 상단): Simple(amber) / Listing-only(violet) / Full(emerald). tone은 ToggleCard 패턴과 일치.

### 6.2 표시 항목
1. **법조문 배지 (D-11 + Phase A 정정)**: `§165⑤ 단서` (본칙) + `§165④1` (가중) + `시행규칙 §81② → 상증령 §17` (환원율 10%) + `§81④` (월할 가산) + (참고) `상증법 §63①·§54·§55`. **각 배지 클릭 시 `LawArticleModal` + `/api/law/article` 라우트로 원문 모달** ([[feedback_law_article_link]] 적용)
2. **6 중간값**: 종가평균·상장연도 평가·취득연도 평가·환산비율·1주당 취득기준시가·총취득가
3. **자가검증 라인** (R2-08):
   ```
   양도가액 44,750,000 − 환산취득가 29,120,000 − 개산공제 291,200 = 양도차익 15,338,800
                            ↓
   기본공제 2,500,000 → 과세표준 13,338,800 → 산출세액 (PDF anchor와 1:1 대조)
   ```
4. **violet 안내**: "환산비율 산정에는 80% 하한 미적용 — 양도일 기준 비상장 평가(§165④1 단서)와 별개" (C-05)
5. **mode === "full"** 시 PDF 3개 화면 입력 행 수 요약: "종가 21일·순손익 32셀·순자산 34셀"

### 6.3 모바일 반응형 (D-13)

| 화면 | 데스크톱 (≥ 768px) | 모바일 (< 768px) |
|---|---|---|
| 종가 표 16~32셀 | 2-col grid (PDF 좌·우) | **2-col 유지** (셀 폭 작아 가능) |
| 순손익 24행 × 2열 | 2-col (상장 / 취득 가로 정렬) | **세로 적층** — 상장연도 표 → 취득연도 표 순 |
| 순자산 20행 × 2열 | 동상 | 동상 |
| Preview 6단계 | 1-col 카드 | 동상 |
| 결과 카드 | 1-col | 동상 (행 줄바꿈 자동) |

---

## 7. PostListingValuationCard 정정 항목 (현행 위반)

| # | 라인 (현행) | 정정 | 책임 (D-15) |
|---|---|---|---|
| C-01 (L131·146·154·171·179) | `placeholder="8,001"` 등 숫자 예시 5건 | 한국어 설명 ("상장일 직후 1개월간 거래일 평균 종가") | **ui** |
| C-02 (L128) | "상장일 직전 1개월" 라벨 | Phase A KoreanLaw §165⑤ 결론 반영 ("직전" 또는 "직후") | **ui** (엔진 결론 종속) |
| C-03 (`stock-valuation-post-listing.ts` L10 주석) | 엔진 주석 "상장일 1개월" 모호 | Phase A 결론 반영 | **engine** |
| C-04 (`legal-codes/stock.ts`) — **Phase A 정정** | v3 "§82" → **§81② + 상증령 §17** 정정 | `ENFORCEMENT_RULE_81_2_DISCOUNT_RATE: "소득세법 시행규칙 §81②"` + `INHERITANCE_GIFT_RULE_17_DISCOUNT_RATE: "상속세및증여세법 시행규칙 §17"` 2건 추가 | **common** (legal-codes) |
| C-05 (결과 카드) | 80% 하한 비적용 명시 누락 | violet 안내 카드 추가 | **ui** |
| C-06 (L219~225) | `tradingHaltAtTransfer` 토글 활성 | full mode 진입 시 disabled + tooltip "거래정지 시나리오는 후속 PR" | **ui** |
| C-07 (`legal-codes/stock.ts`) | C-04와 동일 항목 — 추가 위치 명시 | STOCK 객체 멤버 (L157 아래) | **common** |
| C-08 (UI 환원율) | 입력은 `"10"`, 라벨/표시에 `%` suffix. 미리보기 혼용 위험 | **D-07 결정**: `DecimalInput` + 라벨 `%` (소수점 가능 — 향후 환원율 변동 대비). adapter에서 % → decimal 변환 | **ui** |
| **C-09 (D-14 + Round 4 H-05)** | `/api/pdf` PDF 출력 템플릿에 PostListingDetailCard 누락 | **Phase H 진입 전 grep 확정 (`grep -rn \"stock-transfer\" app/api/pdf/`)**: 현행 라우트 정확 경로(`app/api/pdf/route.ts` 또는 `app/api/pdf/[type]/route.ts`) + React 컴포넌트 분리 위치(`components/pdf/StockTransferPdfReport.tsx` 가정) 모두 확정 후 신규 섹션 추가. 검증: PDF 출력 결과에 6 중간값 + 자가검증 라인 + 80% 하한 안내 포함 | **ui** (PDF 출력) |

---

## 8. 자가 점검 체크리스트 (Phase H 종료 시)

- [ ] ① 80 신규 필드 모두 `StockTransferFormData`에 정의
- [ ] ② initial value 78건 (string 빈문자 / string[] 빈배열 / enum default)
- [ ] ③ normalize 4중 일관성 (factory·UI·normalize·sessionStorage 마이그)
- [ ] ④ `adaptFlatToApiBody` 호출 1곳, `unlistedDetailMode === "full"` 분기 명시
- [ ] ⑤ 4 sub-component 모두 ≤ 400줄, orchestrator ≤ 350줄
- [ ] ⑥ 사이드바 합계 3종 표시 + undefined 가드
- [ ] ⑦ `PostListingDetailCard` 신설 + 6 중간값 + 자가검증 라인 + 80% 하한 안내
- [ ] ⑧ validate 모드별 매트릭스 (4·22·80) — 단위 테스트 3건 추가
- [ ] ⑨ Zod enum `unlistedDetailMode` 3종 추가
- [ ] ⑩ N/A (자산-수준 아님)
- [ ] ⑪ N/A
- [ ] ⑫ Zod 80필드 모두 정의 + `z.array(z.string()).optional().default([])` 2건
- [ ] ⑬ `buildPostListingApiBody` 헬퍼 분리, callStockTransferAPI 800줄 미만
- [ ] ⑭ route.ts 두 곳 매핑 (grep 2회 이상 일치)
- [ ] **Flat → Nested 어댑터 단일 위치** (`post-listing-flat-adapter.ts`) UI·API 양쪽 import
- [ ] **진입 게이트 우선순위** 4-state 시뮬 (acquiredBeforeListing × unlistedDetailMode)
- [ ] **C-01~C-08 정정 8건** 완료
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/stock-transfer/` 100% PASS
- [ ] `ui-engine-sync-checker` 결과 누락 0건
- [ ] **브라우저 수동 확인**: full mode → PDF 사례 입력 → 결과 5,824 / 29,120,000 정합 + Network 탭 80필드 송신 확인
- [ ] **D-04~D-09 UX 시뮬**: 일자 자동 채움 + 종가 2-col grid + 빈 셀 자동 제외 + niShareCount/naShareCount 분리 + 모드 전환 안내 1회 표시
- [ ] **D-11 법조문 모달**: §165⑤·§165④1·§81②·§81④·상증령 §17 배지 4개 클릭 시 LawArticleModal 4회 정상 노출
- [ ] **D-12 점진적 표시 4단계**: 단계별 미완 상태에서 회색 placeholder + 완료 시 자동 표시
- [ ] **D-13 모바일**: 종가 2-col 유지 + 순손익·순자산 2열 적층 (모바일 < 768px)
- [ ] **D-14 PDF 출력**: `/api/pdf` 결과에 PostListingDetailCard 6 중간값 + 자가검증 라인 포함
- [ ] **Round 4 C-01**: 신규 필드 총 80건 (모드 2 + 종가 4 + 순손익 36 + 순자산 38) — 부채 데이터 10행 정정 반영
- [ ] **Round 4 C-02**: `StockTransferResult.acquiredBeforeListing` echo 필드 추가 + 결과 카드 게이트 정상 작동
- [ ] **Round 4 C-03**: `adaptFlatToApiBody` 반환 타입에 listing_only 모드 4 필드 + `listingDatePriceAvg1Month` 포함 (Pick 7개)
- [ ] **Round 4 H-01**: listingDate 입력 → 종가 표 32셀 일자 자동 채움 + listingDate 미입력 시 종가 표 disabled + amber 안내
- [ ] **Round 4 H-02**: adapter 3 분기 동작 (simple/listing_only/full) 단위 테스트 통과
- [ ] **Round 4 H-03**: `tradingHaltAtTransfer + acquiredBeforeListing + unlistedDetailMode !== "simple"` 조합 차단 테스트 PL-VALIDATE
- [ ] **Round 4 H-04**: Result `detail` 모드별 활성 조건 (simple = mode만 / listing_only = listing 측만 / full = 전체) 자가검증
- [ ] **Round 4 H-05**: PDF 출력 라우트 경로 grep 확정 후 신규 섹션 추가
- [ ] **Round 4 H-06**: PL-FLOOR-1(0.85) + PL-FLOOR-2(0.50) 양방향 통과
- [ ] **Round 4 H-07**: `post-listing-validate.test.ts` 4건 통과 (3 모드 + 1 조합 차단)
- [ ] **Round 4 M-01**: 모드 전환 안내 1회만 표시 + LocalStorage flag 동작
- [ ] **Round 4 M-03**: 모바일 break point `sm:`/`md:`/`lg:` 정확 적용
- [ ] **Round 4 M-04**: tradingHalt 모든 모드 disabled 일관성
- [ ] **Round 4 M-06**: sessionStorage 실측 + `lib/stores/calc-wizard-migration.ts` 80필드 normalize 마이그
- [ ] **Round 4 M-07**: Phase G 종료 시 `wc -l` 실측 + 초과 시 추가 분할
- [ ] **Round 4 M-08**: 점진적 표시 4단계 placeholder 표준 문구 적용

---

## 8.5 Round 4 추가 정밀화 (M-01~M-08)

### M-01. 모드 전환 안내 카드 표시 정책
- **표시 조건**: 모드 전환 직후 1회만 (`useState<boolean>` flash, 4초 후 자동 소거 또는 사용자 닫기)
- 항상 표시 시 노이즈 — 첫 전환 후 LocalStorage `seenModeTransitionHint = true` 저장하여 재진입 시 자동 숨김

### M-02. Pre-Do anchor 재실행 시점
- Phase A 결론(시기 직전/직후) 변경 즉시 5건 재실행 (자동 trigger)
- Phase B 진입 직전 cross-check 1회
- Phase C 엔진 헬퍼 H-01~H-05 구현 후 3회차 재실행

### M-03. 모바일 break point 정확화
- 종가 표 2-col 유지 = Tailwind `sm:` (640px 이상)
- 순손익·순자산 2열 = `md:` (768px 이상). 그 미만은 세로 적층
- 사이드바 sticky = `lg:` (1024px 이상) — 본 PR 미변경
- 결과 카드 = 항상 1-col (모바일·데스크톱 공통)

### M-04. Case 6 (`tradingHaltAtTransfer`) 모드 일관성
- 본 PR에서는 **모든 모드(simple·listing_only·full)에서 disabled + tooltip "거래정지 시나리오는 후속 PR 예정"** (이전 v2 "full 진입 시"만 disabled → 일관성 정정)
- Case 6 후속 PR에서 일괄 활성화

### M-05. 메모리 환류 신규 정책 후보 사전 명시
Phase K에서 신규 도출 가능 후보:
- `feedback_pdf_table_row_one_to_one_mapping.md` — PDF 표 행 번호 1:1 변수명 매핑 패턴
- `feedback_flat_vs_nested_form_field_decision.md` — 대용량(80+) flat vs nested 폼 필드 결정 기준
- `feedback_multi_year_statement_input_ux.md` — 다년도 결산서 입력 UX 패턴 (2열 × 24행)

### M-06. sessionStorage 직렬화 + IndexedDB 영향 점검
- 신규 80필드 + 기존 stock store ~150필드 = ~230필드 직렬화
- [[lib/storage/CLAUDE.md]] 참조 — Dexie/IndexedDB 마이그 영향 확인 필요
- Phase H 진입 전 sessionStorage 5MB·IndexedDB 50MB 한도 대비 실측 (사례 1건 입력 시 ~50KB 추정 → 안전)
- `lib/stores/calc-wizard-migration.ts` 80 신규 필드 normalize 마이그 패스 추가

### M-07. UI sub-component 800줄 실측 게이트 (Phase G 종료 시)
- 4 sub + orchestrator 합 ~1330줄 예상 — ToggleCard·FieldCard·CurrencyInput 다수 사용 시 실측 초과 가능
- Phase G 종료 시 `wc -l components/calc/stock-transfer/PostListing*.tsx` 실측
- 초과 시 즉시 추가 분할 (예: `PostListingNetIncomeStatement.tsx` 350줄 → `.Listing.tsx` + `.Acq.tsx` 분리)

### M-08. 점진적 표시 placeholder 표준화 (D-12 보강)
- 회색 placeholder 텍스트는 `FieldCard hint` 패턴과 일관 (text-muted-foreground + text-xs)
- 단계별 문구:
  - [1] 미완 시: "거래일별 종가 입력 시 평균이 표시됩니다"
  - [2] 미완 시: "상장연도 결산서 입력 완료 시 1주당 가중평균이 표시됩니다"
  - [3] 미완 시: "취득연도 결산서 입력 완료 시 환산비율이 표시됩니다"
  - [4] 미완 시: "위 3단계 완료 시 1주당 취득기준시가가 표시됩니다"

---

## 9. PDCA 환류 산출물 (Phase K)

- `MEMORY.md` 신규 entry: `project_stock_transfer_post_listing_pdf_replica.md`
  - 80필드 flat 구조 + 4중 일관성
  - Flat → Nested 어댑터 단일 위치 패턴
  - PDF 표 행 1:1 명세 정책 (가능 시 신규 `feedback_pdf_table_row_one_to_one_mapping.md`)
- `recent-completions.md`: 본 PR 한 줄 요약 + 후속 신호 5개 (거래정지·§165⑥·양도일 1개월·§81④ 자동·환원율 시간별)
- `roadmap.md`: stock-transfer 진행률 갱신
