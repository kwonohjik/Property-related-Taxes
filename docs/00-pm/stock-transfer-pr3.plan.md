# 주식 양도소득세 PR-3 구현 계획서 v3

> 작성일: 2026-05-19 (v3: 자가 재검토 11건 반영 — Pre-Do anchor·specificMatching 차단 anchor·각 종목 신고-단위 필드 일관성·sessionStorage 마이그레이션 anchor 보강)
> v2: KoreanLaw MCP 검증 후 가산세·기본공제 그룹 인용 전면 정정 + §94①3 다목 라벨 정정
> v1: 초안
> 작성자: Claude (Opus 4.7)
> 우선순위: **P2 (도메인 완성도)** — 케이스 인벤토리 21·25·26 + 다종목 합산 UI 종결
> 영향 도메인:
> - `lib/stores/calc-wizard-stock-store.ts` + `calc-wizard-stock-normalize.ts` (다종목 폼 상태 신설)
> - `app/calc/stock-transfer-tax/StockTransferTaxCalculator.tsx` + `steps/Step1~3.tsx` (종목 N개 입력 UX)
> - `components/calc/stock-transfer/` (StockItemCard·StockItemsList·StockAggregateSidebar 신설)
> - `components/calc/results/StockTransferTaxResultView.tsx` (다자산 결과 카드 + 로드맵 카드)
> - `lib/calc/stock-transfer-tax-api.ts` (다종목 → `{items, deductionMode}` 변환)
> - `lib/calc/stock-transfer-tax-validate.ts` (종목별 + 합산 검증)
> - `__tests__/tax-engine/stock-transfer/` (다자산·foreign-block·로드맵 anchor 보강)

## 0. v1 → v2 정정 이력 (KoreanLaw MCP 검증, 2026-05-19)

[[feedback-korean-law-82-vs-81-2-drift]] 정책 적용 — 위임 체인 끝까지 추적 후 인용. v1에서 **소득세법 §47의2** 로 인용한 가산세 본칙은 **국세기본법** 임.

### 0.1 가산세 본칙 인용 정정 — 소득세법 → 국세기본법

**v1 오류**: "소득세법 §47의2②1 본문 — 부정행위 과소신고 40%" / "단서 60%"

**KoreanLaw MCP 검증 (국세기본법, 시행일 2026.1.2.)**:

| 가산세 유형 | 정확 조문 | 본칙 | 부정행위 | 역외거래 부정 |
|---|---|---|---|---|
| **무신고가산세** | 국세기본법 §47조의2 ①2호 | 20% | ①1호 본문 — 40% | ①1호 괄호 — 60% |
| **과소신고가산세** | 국세기본법 §47조의3 ①2호 | 10% | ①1호 가목 — 40% | ①1호 가목 괄호 — 60% |
| **납부지연가산세** | 국세기본법 §47조의4 | — | — | — |

→ 본문 인용 전부 정정:
- 무신고(`filingViolation="non_report"`) 부정 = **국세기본법 §47조의2 ①1호** (본문 40% + 괄호 역외 60%)
- 과소신고(`filingViolation="under_report"`) 부정 = **국세기본법 §47조의3 ①1호 가목** (본문 40% + 괄호 역외 60%)
- 무신고 일반 = **국세기본법 §47조의2 ①2호** (20%)
- 과소신고 일반 = **국세기본법 §47조의3 ①2호** (10%)
- 납부지연 = **국세기본법 §47조의4**
- 부수 영향: 디자인 §70 `소득세법 §47의2·§47의4 — 가산세` 도 **소득세법 → 국세기본법** 정정 필요 (후속 디자인 PR).
- 부수 영향: `lib/tax-engine/stock-transfer/stock-transfer-finalize.ts:34~38, 53, 58` 의 `(§47의2②1)` 주석도 정정 대상 (코드 PR-3-c 동반).

### 0.2 역외거래 vs 국제거래 라벨 정정

**v1 오류**: "국제거래 부정 60%" / `isInternationalTransaction`

**KoreanLaw 본문**: "역외거래(役外去來)에서 발생한 부정행위" — 국세기본법 §47조의2 ①1호 괄호 / §47조의3 ①1호 가목 괄호.

→ **엔진 input 필드명**(`isInternationalTransaction`)은 **변경 없음** (PR 범위 외 — 후속 rename PR). **UI 라벨·결과 카드 표시·근거 조문 인용은 "역외거래" 로 표기 강제**.

UI 라벨:
- ❌ "국제거래 부정" / "국제거래 가산세 60%"
- ✅ "역외거래 부정행위" / "역외거래 부정 가산세 60% (국세기본법 §47조의3 ①1호 가목 괄호)"

### 0.3 §103 ①1호·①2호 그룹 인용 정정

**v1 오류**: "주식 그룹 기본공제 -2,500,000 (§103**②**2호)" / "기타자산 그룹 기본공제 -2,500,000 (§103**②**1호)"

**KoreanLaw 본문 (소득세법 §103, 시행일 2026.4.21.)**:
- §103 ① — 그룹별 250만원 공제 본칙. **각 호별 그룹**:
  - **§103 ①1호** = §94①1호·2호·**4호** (토지·건물 + 부동산권리 + **기타자산**)
  - **§103 ①2호** = §94①3호 (**주식**)
  - §103 ①3호 = §94①5호 (파생상품)
  - §103 ①4호 = §94①6호 (신탁수익권)
- §103 ② — 감면소득 우선 공제 순서 규정 (그룹 정의 아님)

→ **모든 §103②1호·②2호 인용을 §103①1호·①2호로 정정**:
- 주식 그룹 = `basicDeductionGroup: "stock"` = **§103 ①2호**
- 부동산·부동산권리·기타자산 그룹 = `basicDeductionGroup: "real_estate_and_other_asset"` = **§103 ①1호**

→ 엔진 result 타입의 enum 라벨(`"real_estate_and_other_asset"`)은 §103①1호와 정합 — 변경 없음. **결과 카드 표시 + 산식 인용만 §103① 시리즈로 정정**.

### 0.4 §94①3 다목 — "별도 도메인" → "본 엔진 미지원" 정정

**v1 오류**: "외국법인 발행 주식·해외 상장 주식은 **별도 도메인** (§94①3 다목)"

**KoreanLaw 본문 (소득세법 §94①3 다목, 2026.4.21. 시행)**:
> "외국법인이 발행하였거나 외국에 있는 시장에 상장된 주식등으로서 대통령령으로 정하는 것"

→ §94①3 다목은 **본 양도소득세의 과세대상** (별개 세목이 아님). 본 엔진이 현재 미지원할 뿐. "별도 도메인" 라벨은 사용자가 다른 세금(국외전출세 §126의3 등)과 혼동할 위험.

→ UI 라벨 정정:
- ❌ "별도 도메인 — 본 계산기 범위 밖"
- ✅ "본 계산기 현재 미지원 (소득세법 §94①3 다목 — 외국법인 발행 주식·해외상장 주식). 후속 PR 지원 예정. 신고서는 동일 양도소득세 양식 사용."

### 0.5 v2 정정 누적 영향 요약

본 정정으로 변경되는 본문 위치 (v2 → v3 번호 재정렬 후): §1.1 (케이스 21·25·26 행), §2 (R-9·R-12 행), §7.2 결과 카드 산식, §10.2 disabled 카드 description, §11.1 가산세 섹션 라벨, §14 R-12 전체, §16 DoD 가산세 RTL, §18 v2 검증 약속 — **모두 v2에서 일괄 정정 완료**.

엔진 변경 없음 (필드명 `isInternationalTransaction` 유지). 표시 라벨·근거조문 인용·주석만 정정.

### 0.6 v2 → v3 자가 재검토 추가 정정 (2026-05-19)

v2 작성 후 전체 자가 점검에서 발견한 11건 정정·보강:

| # | 항목 | 영향 §  | 조치 |
|---|---|---|---|
| **A1** | §0.3·§0.4 "v1 오류" 인용이 bulk replace로 정정값과 동일해진 사고 | §0.3·§0.4 | 원본 오류값 복원 (§103②·"별도 도메인") |
| **A2** | 케이스 21 UX 실체 — `MarketTypeBlock` 5번째 옵션을 "교육용 disabled 카드"로 명시 (현재는 enum에 아예 없음) | §10.1·§10.2 | 명세 추가 |
| **A3** | `stockName` 빈값 fallback — 결과 카드/사이드바/신고서표 모두 "종목 N" (N=1~) | §4.2·§7.2·§8 | fallback 규칙 추가 |
| **A4** | `filingDate` Date 직렬화 — adapter 의 string → Date 변환 / route `coerceDates` 호환 | §5.2·§5.3 | adapter 명세 추가 |
| **A5** | specificMatching 차단 anchor (다종목 모드 시 cost_allocation 강제) | §6.2·§6.3 | validate 추가 anchor 명시 |
| **A6** | sessionStorage 마이그레이션 anchor (legacy 단건 → items[0]) | §6 | 마이그레이션 단위 테스트 추가 |
| **A7** | 신고-단위 공통 필드 6개 전사 매트릭스를 R-3 본문에 표기 | §5.2 | 명시 표 추가 |
| **A8** | `activeStockItemId` 삭제 시 fallback 규칙 명시 (첫 종목 자동 선택) | §4.5 | 정책 강화 |
| **A9** | 다종목 모드 deductionMode 라벨 — "aggregate" 권장 default 명시 | §3.2 UX | 기본값 + 안내문 추가 |
| **A10** | R-9 결과 카드 가산세 산식 라벨 — `산출세액 × 40%` 산식 표기는 본세만 곱셈, **확정세액 아님** 주의 | §11.1 | 산식 표기 정정 |
| **A11** | 다종목 + filingViolation 시 가산세 산식 — 항등성 검증 anchor MA-07 신설 (1원 단위 ±2원 허용) | §14.3 | anchor 명시 + 사유 첨부 |

## 1. 배경 — PR-3 케이스 인벤토리 현황

`docs/02-design/features/stock-transfer-tax.engine.design.md:476` 의 PR-3 범위:
> **PR-3**: 케이스 21, 25~26, 다자산 합산 + 부정·국제 가산세 + 신고서 양식 + 증권거래세 시장별 표시

### 1.1 사전 자가 점검 (코드베이스 grep, 2026-05-19)

| 영역 | 현재 상태 | 잔여 |
|---|---|---|
| **케이스 21** — 외국법인 발행 주식 (소득세법 §94①3 다목) 본 엔진 미지원 | Zod refine (`stock-transfer-tax-schema.ts:285`) + `taxCategory="out_of_scope_foreign"` enum | UI 사전 disabled 카드 + 안내 / anchor 1건 |
| **케이스 25** — 과소신고 부정 40% (국세기본법 §47조의3 ①1호 가목) | `case-25-26-penalty.test.ts` 존재 (engine ✅) + `finalize.ts:52` 매트릭스 구현 | Step3 토글 UX 검증 + 결과 카드 표시 anchor |
| **케이스 26** — 역외거래 부정 60% (국세기본법 §47조의2 ①1호 괄호 / §47조의3 ①1호 가목 괄호) | engine 매트릭스 ✅ (commit `39fe7a9`) | UI 라벨·근거조문 표시 anchor |
| **가산세 게이트** `filingViolation` | Step3 라디오 + finalize 매트릭스 ✅ | 다종목 모드 전파(신고-단위 공통 필드) |
| **다자산 합산 엔진** | `calculateStockTransferTaxAggregate()` ✅ + `StockTransferAggregateResult` ✅ | — |
| **다자산 합산 API/Zod** | `items: stockTransferInputSchema.array()` ✅ + `deductionMode` ✅ + route 분기 ✅ | UI 변환 누락 |
| **다자산 합산 폼 상태** | **부재** — `StockTransferFormData`는 단건 모델 | **신설 필요 (PR-3 핵심)** |
| **다자산 합산 UI** | StockFilingFormTable.isMulti ✅ (표 라벨만) | **종목 N개 입력 마법사 신설 (PR-3 핵심)** |
| **증권거래세 시장별 카드** | `SecuritiesTransactionTaxCard.tsx` ✅ (단건) | 다자산 분기 + 시장 라벨 |
| **신고서 양식 다자산 32행** | `StockFilingFormTable.tsx` + `StockFilingFormTableHelpers.ts` ✅ | 종목 ≥ 2 anchor 4건 + 합계행 검증 |
| **로드맵 카드 PR-3 상태** | `StockTransferTaxResultView.tsx:669` = `"current"` | PR-3 완료 후 `"completed"` |

→ 결론: **엔진·API·신고서표는 90% 구현 완료**. PR-3 잔여의 80%는 **다자산 마법사 UI 신설** + **케이스 21 UI 차단** + **anchor·로드맵 갱신**.

### 1.2 Pre-Do anchor 우선 검증 항목

[[feedback-pre-anchor-verification]] 정책 — Do 진입 전 핵심 anchor 1건 우선 작성.

- **P-1**: `calculateStockTransferTaxAggregate([A, B])` 시 `basicDeductionByGroup.stock` 합이 정확히 2,500,000 이하 1회 한도 — **§103 ①2호** (이미 `MA-04-02` 존재 — 재확인)
- **P-2**: 동일 입력의 단건 `calculateStockTransferTax(A)` 와 `calculateStockTransferTaxAggregate([A])` 결과가 **finalTax·calculatedTax·localIncomeTax 모두 동일** (항등성 — `MA-05-*` 존재, **신고서양식 데이터까지 동일성 확인**)
- **P-3**: `marketType: "out_of_scope_foreign"` 입력 → Zod 차단 (이미 구현됨, anchor 추가)
- **P-4**: `filingViolation="non_report"` + `isFraudulent=true` + `isInternationalTransaction=true` → 가산세율 = 60% — **국세기본법 §47조의2 ①1호 괄호** (engine ✅)
- **P-5**: `filingViolation="under_report"` + `isFraudulent=true` + `isInternationalTransaction=true` → 가산세율 = 60% — **국세기본법 §47조의3 ①1호 가목 괄호** (engine ✅)
- **P-6**: 신고-단위 공통 필드(filingViolation·isFraudulent·isInternationalTransaction·filingDate·isElectronicFiling·realEstateGroupBasicDeductionUsed) 가 각 `items[i]` 에 동일 값 전사 검증 (adapter 단위 — R-3·R-4 일관성)

## 2. 잔여 항목 일람

| # | 항목 | 위치 | 법령·디자인 근거 |
|---|---|---|---|
| **R-1** | 다종목 폼 상태 (`stockItems: StockItemForm[]` + `deductionMode`) | `calc-wizard-stock-store.ts` 확장 | 디자인 §462 + addPropertyRefines 패턴 |
| **R-2** | 다종목 마법사 UI (목록·추가·삭제·복제) | Step1 신규 진입 + StockItemsList | UI 정책 — 양도세 자산-수준 패턴 차용 |
| **R-3** | API 변환 (단일↔다자산 자동 분기) | `lib/calc/stock-transfer-tax-api.ts` | Zod `items` array 기존 스키마 |
| **R-4** | Validation (종목별 + 합산 + each_item/aggregate 일관성) | `stock-transfer-tax-validate.ts` | 14지점 ⑧ |
| **R-5** | 다자산 결과 카드 (종목별 카드 + 합산 카드) | `StockTransferTaxResultView.tsx` 다자산 분기 | 결과 14지점 ⑦ |
| **R-6** | 다자산 사이드바 합계 (`StockAggregateSidebar`) | 신규 또는 `StockSidebar.tsx` 확장 | 14지점 ⑥ |
| **R-7** | 신고서 양식 다자산 anchor (≥ 2 종목 합계행 자기일관성) | `__tests__/tax-engine/stock-transfer/` | `feedback_redev_filing_form_acquisition_inverse` 패턴 |
| **R-8** | 케이스 21 UI 차단 + 안내 카드 | `MarketTypeBlock.tsx` 또는 Step1 | §94①3 다목 |
| **R-9** | 케이스 25·26 결과 카드 가산세 표시 라벨·근거조문 | `StockTransferTaxResultView.tsx` 가산세 섹션 | 국세기본법 §47조의2 ①1호 / §47조의3 ①1호 가목 |
| **R-10** | 증권거래세 시장별 카드 다자산 분기 (종목별 정보성) | `SecuritiesTransactionTaxCard.tsx` | 디자인 §463 |
| **R-11** | 로드맵 카드 상태 갱신 (`PR-3: "completed"` + 후속 `"current"`) | `StockTransferTaxResultView.tsx:669` | UI 메타 |
| **R-12** | 다자산 가산세 게이트 — `filingViolation` 종목별 vs 신고-단위 결정 | Step3 라벨 + engine spec 명시 | 국세기본법 §47조의2·§47조의3 적용 단위 |

## 3. R-1: 다종목 폼 상태 신설

### 3.1 현재 구조

`StockTransferFormData` (calc-wizard-stock-store.ts:78) 는 단건 평면 구조. 모든 필드(`marketType`·`shareCount`·`perShareTransferPrice`·`acquisitionLots[]` 등)가 직접 폼-전역에 위치.

### 3.2 신규 구조 (Flat → Mixed)

[[feedback-flat-vs-nested-form-field-decision]] 정책 적용: **공통 필드는 폼-전역**, **종목-수준 필드는 `stockItems[]`** 로 분리.

```ts
// lib/stores/calc-wizard-stock-store.ts (확장)

/**
 * 종목-수준 입력 — `StockTransferInput`(엔진)의 종목별 필드 1:1 미러
 * 신고-단위 공통 필드(filingViolation·isFraudulent·isInternationalTransaction·filingDate·
 *   isElectronicFiling·realEstateGroupBasicDeductionUsed)는 형식 외부 폼-전역에 둠
 */
export interface StockItemForm {
  id: string;                                 // uuid (UI 키 + specificMatching 식별)
  stockName: string;                          // 종목명 (UI 표시·신고서 양식 헤더)
  marketType: StockTransferFormData["marketType"];
  // ... 모든 종목-수준 필드 (현재 StockTransferFormData에서 종목-수준만 발췌)
  acquisitionLots: AcquisitionLot[];
  transferLots: TransferLot[];
  // ... 평가 필드, 환산 필드 등
}

export interface StockTransferFormData {
  // ────── 신고-단위 공통 ──────
  filingType: "preliminary" | "final" | "revised";
  filingDate: string;
  isElectronicFiling: boolean;
  filingViolation: "none" | "under_report" | "non_report";
  isFraudulent: boolean;
  isInternationalTransaction: boolean;
  realEstateGroupBasicDeductionUsed: number;

  // ────── 다종목 ──────
  stockItems: StockItemForm[];                // 최소 1, 최대 N
  activeStockItemId: string;                   // 현재 편집 중인 종목 id (UI focus)
  deductionMode: "each_item" | "aggregate";   // 기본 "aggregate"
  // ... (기존 평면 필드는 stockItems[0]으로 마이그레이션)
}
```

### 3.3 sessionStorage 마이그레이션 (normalize)

기존 단건 폼 → `stockItems: [{ id: "legacy-0", ...legacyFields }]` 1:1 변환. `lib/stores/calc-wizard-stock-normalize.ts:23` 의 `normalizeStockFormData()` 확장.

[[feedback-store-default-vs-ui-display-fallback]] 정책 적용 — factory default + normalize 빈배열 처리 + UI fallback 3중 일관성.

### 3.4 위험·차단점

- **R-1.a 800줄 정책**: `calc-wizard-stock-store.ts` 가 현재 558줄. `StockItemForm` 분리로 +200줄 예상 → **`calc-wizard-stock-item.ts` 별도 파일 분리** 선행.
- **R-1.b SessionStorage breaking change**: 기존 사용자 폼 데이터가 `migrateFromLegacy()` 단계에서 1회만 변환되어야 함. 양도세 `migrateLegacyForm()` 패턴(`lib/stores/calc-wizard-migration.ts`) 차용.
- **R-1.c `activeStockItemId`**: 별도 store 필드. partialize는 포함 (UI 상태 보존), `result` 와 동일 위계.

## 4. R-2: 다종목 마법사 UI

### 4.1 단계 구성 (변경 없음 — 4단계)

```
Step1: 기본정보 + 종목 목록    ← (변경) 종목 추가/삭제/복제 + 종목별 marketType·shareCount
Step2: 거래·평가 (활성 종목)   ← (변경) activeStockItemId 종목의 거래·평가
Step3: 가산세·신고            ← (변경 없음 — 신고-단위 공통)
Step4: 결과                  ← (변경) 종목별 카드 + 합산 카드
```

### 4.2 Step1 UX

```
┌─────────────────────────────────────────────┐
│ 종목 목록 (1/N)                              │
│ ┌─────────────────────────────────────────┐ │
│ │ ● 삼성전자 — KOSPI · 대주주             │ │  ← 활성 (sky tone)
│ │   양도 100주 · 2026-03-15                │ │
│ │   [편집] [복제] [삭제]                   │ │
│ └─────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────┐ │
│ │ ○ (주)예시바이오 — 비상장 · 비대주주    │ │  ← 비활성
│ │   양도 5,000주 · 2026-04-20              │ │
│ │   [편집] [복제] [삭제]                   │ │
│ └─────────────────────────────────────────┘ │
│ [+ 종목 추가]                                │
│                                              │
│ 기본공제 적용 방식                            │
│ ◉ 합산 (aggregate) — 그룹별 1회 250만원      │
│ ○ 종목별 각자 (each_item) — 단건 보조 검증용 │
└─────────────────────────────────────────────┘
```

- 종목 ≥ 2 일 때만 `deductionMode` 라디오 표시 (1건이면 항등).
- `[+ 종목 추가]` 시 빈 `StockItemForm` 푸시 + `activeStockItemId` 자동 전환.
- `[복제]` 시 종목 전체 깊은 복사 후 `id` 새로 발급 + `stockName` 끝에 ` (사본)` 부착.
- 단일 종목만 있을 때는 종목 목록 영역 숨김(레거시 UX 보존) — `stockItems.length === 1 && stockName === ""` 조건.

### 4.3 Step2 UX

```
┌──────────────────────────────────────┐
│ 현재 편집 종목: 삼성전자 (KOSPI)     │  ← 헤더 sticky
│ [목록으로 ←]              [다음 종목 →] │
└──────────────────────────────────────┘
[기존 Step2 내용 — 모두 activeStockItemId 종목 컨텍스트로 동작]
```

- 헤더에 현재 편집 종목명 + 시장 표시.
- 종목 ≥ 2 일 때만 `[다음 종목 →]` 노출 (마지막 종목이면 disabled).
- 모든 입력은 `stockItems[i]` 타깃 — `onChange(patch)` 가 `updateActiveItem(patch)` 로 라우팅.

### 4.4 신규 컴포넌트

- `components/calc/stock-transfer/StockItemsList.tsx` (Step1 종목 목록 카드)
- `components/calc/stock-transfer/StockItemCard.tsx` (목록 row — sky/slate tone)
- `components/calc/stock-transfer/ActiveItemHeader.tsx` (Step2 헤더 sticky)
- 기존 `MarketTypeBlock`·`SecurityMetadataBlock`·`SplitLotsBlock` 등은 props 시그니처 `onChange: (patch: Partial<StockItemForm>) => void` 로 통일 (현재 `Partial<StockTransferFormData>` → 종목 컨텍스트로 변경).

### 4.5 위험·차단점

- **R-2.a Props refactor 범위**: 종목-수준 컴포넌트 20개 이상. 한 PR에서 모두 변환 시 800줄 + TS 연쇄오류 위험 [[feedback-pdca-session-efficiency]]. **선행 PR**: `onChange` props 시그니처 일괄 변경 + `useActiveStockItem()` 훅 도입(단건 폼이어도 작동하는 어댑터).
- **R-2.b activeStockItemId 동기화**: 종목 삭제 시 active가 사라지면 첫 종목으로 fallback. `useEffect → store` 미러링 금지 [[feedback-useeffect-store-mirror-forbidden]] — `removeStockItem(id)` action 내부에서 처리.
- **R-2.c 종목별 specificMatching ID 충돌**: 종목 간 lot id가 겹쳐도 무방하나, `specificMatchings` 의 (acqLotId, transferLotId)는 종목 컨텍스트 안에서만 매칭. 다종목 specificMatching 모드는 PR-3에서 **단일 종목 한정으로 차단** (다종목 시 자동 cost_allocation only).

## 5. R-3: API 변환 (단일↔다자산 자동 분기)

### 5.1 현재

`lib/calc/stock-transfer-tax-api.ts` 의 `callStockTransferTaxAPI(body)` 는 단건 body 전송. route.ts L67 에서 `"items" in body` 감지로 aggregate 분기.

### 5.2 변경

```ts
// lib/calc/stock-transfer-tax-api.ts

export function toAPIPayload(form: StockTransferFormData) {
  const items = form.stockItems.map(toItemPayload);
  const isAggregate = items.length > 1;

  if (!isAggregate) {
    // 단건 호환 모드 — items[0] 평탄화 (route.ts 단건 경로 진입)
    return {
      ...toItemPayload(form.stockItems[0]),
      // 신고-단위 공통 필드 머지
      filingType: form.filingType,
      filingDate: form.filingDate,
      isElectronicFiling: form.isElectronicFiling,
      filingViolation: form.filingViolation,
      isFraudulent: form.isFraudulent,
      isInternationalTransaction: form.isInternationalTransaction,
      realEstateGroupBasicDeductionUsed: form.realEstateGroupBasicDeductionUsed,
    };
  }

  return {
    items: items.map((it) => ({
      ...it,
      // 신고-단위 공통 필드를 각 종목에도 전사 (route.ts 단건 calc 시 필요)
      filingType: form.filingType, filingDate: form.filingDate,
      isElectronicFiling: form.isElectronicFiling,
      filingViolation: form.filingViolation,
      isFraudulent: form.isFraudulent,
      isInternationalTransaction: form.isInternationalTransaction,
      realEstateGroupBasicDeductionUsed: form.realEstateGroupBasicDeductionUsed,
    })),
    deductionMode: form.deductionMode,
  };
}
```

- 단건 path를 유지하여 route.ts 변경 0 보장 (R-3.a 회귀 차단).
- `toItemPayload(item)` 는 종목-수준 평탄화만 담당 — 단위 변환·빈 슬롯 처리는 adapter 내부 일괄 [[feedback-flat-vs-nested-form-field-decision]].

### 5.3 14지점 점검

| # | 지점 | 변경 |
|---|---|---|
| ① | FormData 타입 | `stockItems[]` + `deductionMode` 추가 (R-1) |
| ② | initial | `createInitialStockFormData()` → `stockItems: [createInitialStockItem()]` |
| ③ | normalize | `normalizeStockFormData()` 마이그레이션 (legacy → items[0]) |
| ④ | API 변환 | 위 4.2 (R-3) |
| ⑤ | UI 위젯 | Step1 목록 + Step2 헤더 (R-2) |
| ⑥ | 사이드바 합계 | `StockSidebar` 다자산 분기 (R-6) |
| ⑦ | 결과 카드 | 종목별 + 합산 (R-5) |
| ⑧ | Validation | R-4 |
| ⑨ | Zod enum 메인 | (변경 없음 — items array 기존) |
| ⑩ | Zod enum 컴패니언 | N/A |
| ⑪ | acquisitionDate fallback | (변경 없음) |
| ⑫ | Zod 입력 객체 정의 | (변경 없음 — `stockTransferInputSchema.array()` 기존) |
| ⑬ | callAPI body spread | 4.2 body 빌더 변경 |
| ⑭ | Route handler 엔진 매핑 | (변경 없음 — route L66 자동 분기) |

→ ⑨~⑫⑭ 변경 없음. **TypeScript 침묵 stripping 위험 없음** (기존 array 스키마 활용).

## 6. R-4: Validation

### 6.1 종목별 검증

각 `stockItems[i]` 에 대해 기존 단건 `validateStockTransferStep(item, step)` 재귀 적용. 첫 오류 발견 종목 id를 반환하여 UI가 해당 종목으로 focus 이동.

### 6.2 합산 검증

- `stockItems.length ≥ 1` (zod min 1 일관)
- 종목별 `stockName` 비어 있어도 허용 (UX — 단건 케이스 호환)
- 종목 ≥ 2 시 `marketType === "out_of_scope_foreign"` 0건 (UI 사전 차단 — R-8)
- 종목 ≥ 2 시 specificMatching 모드 차단 (R-2.c)
- `deductionMode === "aggregate"` 일 때 모든 종목의 `realEstateGroupBasicDeductionUsed` 가 **단일 값** (각 종목 동일 신고 = 동일 신고-단위) — adapter에서 자동 전사하므로 자동 보장

### 6.3 fallback 일관성

[[feedback-validation-sync-8th-point]] — API에서 신고-단위 공통 필드를 각 종목에 전사하므로 validate도 동일 fallback 적용. UI/API 통과 ↔ validate 차단 모순 없음.

## 7. R-5: 다자산 결과 카드

### 7.1 분기

```tsx
// StockTransferTaxResultView.tsx
if (mode === "aggregate" && aggregate) {
  return <AggregateResultView aggregate={aggregate} />;
}
return <SingleResultView result={result} />; // 기존
```

### 7.2 `AggregateResultView` 구성

```
┌─ 합산 요약 카드 ───────────────────────────┐
│ 총 양도소득금액    XXX,XXX,XXX             │
│ 주식 그룹 기본공제 -2,500,000 (§103①2호)  │
│ 기타자산 그룹 기본공제 -2,500,000 (§103①1호)│
│ 합산 과세표준       XXX,XXX,XXX             │
│ 합산 산출세액       XXX,XXX,XXX             │
│ + 신고불성실 가산세 XXX,XXX                │
│ - 전자신고 세액공제 -20,000                 │
│ ─────────────────                           │
│ 합산 결정세액        XXX,XXX,XXX           │
│ 합산 지방소득세      XX,XXX,XXX            │
└────────────────────────────────────────────┘

┌─ 종목별 상세 (1/N) ────────────────────────┐
│ ▶ 삼성전자 (KOSPI 대주주)                  │
│   양도가 … / 취득가 … / 차익 …            │
│   (펼침: 기존 SingleResultView 미니버전)   │
└────────────────────────────────────────────┘
┌─ 종목별 상세 (2/N) ────────────────────────┐
│ ▶ (주)예시바이오 (비상장 비대주주)         │
└────────────────────────────────────────────┘

┌─ 신고서 양식 32행 ─────────────────────────┐
│ (StockFilingFormTable aggregate prop ✅)   │
└────────────────────────────────────────────┘
```

### 7.3 산식 표시 [[feedback-result-view-korean-formula]]

- 변수 약어·`floor()` 금지
- "합산 산출세액 = 종목A 9,500,000 + 종목B 10,000,000" (MA-04-03 anchor와 일치)
- 그룹별 기본공제 표시: "주식 그룹 — 250만 한도, 소득금액 XX,XXX,XXX 중 2,500,000 적용"

## 8. R-6: 사이드바 합계

### 8.1 분기

```ts
// StockSidebar.tsx
if (form.stockItems.length > 1) {
  // 다자산 모드 — 항목별 양도가·취득가·필요경비 합산
  items.push({ label: "총 양도가액", value: sumOf(stockItems, "transferPrice") });
  items.push({ label: "총 취득가액", value: sumOf(stockItems, "acquisitionPrice") });
  // ...
  if (aggregate) {
    items.push({ label: "합산 산출세액", value: aggregate.totalCalculatedTax });
    items.push({ label: "합산 결정세액", value: aggregate.totalFinalTax });
  }
}
```

- 입력으로 계산 가능한 항목만 표시 (0원·null 제외) [[feedback-no-won-suffix]] [[feedback-tax-calculation-principle]].
- 환산 모드 종목 양도가는 API 결과 도착 후만 사이드바 노출.

## 9. R-7: 신고서 양식 다자산 anchor

### 9.1 추가 anchor (case-aggregate-multi-stock.test.ts 확장)

| ID | 시나리오 | 자기일관성 |
|---|---|---|
| **MA-06-01** | 2종목 합산, filingFormData.totalTransferPrice = Σ items[i].transferPrice | `aggregate.items.reduce((s,r)=>s+r.transferPrice,0)` |
| **MA-06-02** | 합계행 acquisitionPrice = 합계 양도가 − 합계 필요경비 − 합계 양도차익 [[feedback-redev-filing-form-acquisition-inverse]] | 역산 자기일관성 |
| **MA-06-03** | 종목별 행 헤더에 `stockName` 노출 (`StockFilingFormTable.tsx:53` 확장) | `isMulti` 모드 분기 |
| **MA-06-04** | filingViolation 종목 단위 전파 — 모든 행이 동일 가산세율 표시 | adapter 전사 검증 |

### 9.2 호환성

기존 단건 anchor `case-3-8-listed.test.ts` 등은 회귀 0 보장 — `aggregate` prop 미주입 시 기존 동작 보존.

## 10. R-8: 케이스 21 — 외국법인 UI 차단

### 10.1 위치

`components/calc/stock-transfer/MarketTypeBlock.tsx` — 시장 라디오 그룹.

### 10.2 변경 (v3 정정 — A2)

현재 `MarketTypeBlock` 의 marketType enum 은 4종(`kospi`·`kosdaq`·`konex`·`unlisted`·`other_asset`). **외국법인 옵션은 enum에 존재하지 않으므로**, 본 변경은 **enum 추가가 아니라 별도 "교육용 disabled 카드"** 를 RadioCardGroup 외부에 시각적으로 부착하는 형태로 구현.

```tsx
// MarketTypeBlock.tsx 하단에 정보 카드(라디오 외부)
<div className="mt-3">
  <ToggleCard
    tone="rose"
    disabled
    disabledReason="본 계산기 현재 미지원 — 소득세법 §94①3 다목 (외국법인 발행 주식·해외상장 주식). 후속 PR에서 지원 예정. 양도소득세 신고서는 동일 양식 사용"
    title="외국법인 발행·해외 상장 주식 (선택 불가)"
    description="해외 발행/상장 주식의 양도는 양도소득세 §94①3 다목 대상이지만 본 엔진은 아직 지원하지 않습니다. 국외전출세(§126의3)와는 별개입니다."
  />
</div>
```

- 라디오 선택 자체에 추가하지 않는 이유: enum에 `out_of_scope_foreign` 같은 값을 추가하면 form data 직렬화·Zod·route 모두 영향. 본 PR-3 범위 외.
- Zod 차단은 안전망(에이전트 직접 호출·legacy 폼)으로 유지 — `out_of_scope_foreign` enum 은 result.taxCategory 분류용으로만 살아 있음.
- anchor: Step1 렌더 후 disabled 카드 텍스트 "본 계산기 현재 미지원" + "§94①3 다목" 존재 확인 (RTL — `getByText`).

## 11. R-9: 케이스 25·26 결과 카드

### 11.1 가산세 섹션 표시 (v3 — A10 산식 정정)

```
┌─ 가산세·세액공제 ──────────────────────────┐
│ 신고불성실 가산세                            │
│   분기: 과소신고(filingViolation=under_report) │
│         또는 무신고(non_report)              │
│   적용율: 40% (부정행위)                     │
│   근거: 국세기본법 §47조의3 ①1호 가목 (과소) │
│         / §47조의2 ①1호 (무신고)             │
│   산식: **과소신고납부세액등** XXX,XXX × 40%│  ← 산출세액이 아님 (§47조의3 ① 기준)
│         또는 **무신고납부세액** × 40% (§47조의2 ①) │
│   금액: XXX,XXX                              │
│                                              │
│ 납부지연가산세 (국세기본법 §47조의4)         │
│   — 본 PR 범위 외 (납부일 확정 후 별도 산정) │
└────────────────────────────────────────────┘
```

- 적용율 매트릭스 라벨 (filingViolation × isFraudulent × isInternationalTransaction):
  - 10% — under_report 일반 (국세기본법 §47조의3 ①2호)
  - 20% — non_report 일반 (국세기본법 §47조의2 ①2호)
  - 40% — 부정행위 (과소신고 국세기본법 §47조의3 ①1호 가목 / 무신고 §47조의2 ①1호)
  - **60%** — 부정행위 + **역외거래** (과소신고 §47조의3 ①1호 가목 괄호 / 무신고 §47조의2 ①1호 괄호)
- 근거조문 트리거(`LawArticleModal`): 국세기본법 §47조의2 ①1호(무신고) / §47조의3 ①1호 가목(과소신고) — 본문 40% + 괄호 역외 60%

### 11.2 anchor

- C25-* (existing) — `finalize.ts` 매트릭스 호출 검증
- 신규 **CR-25-01**: 과소신고 분기 결과 카드 렌더 시 "40%" 라벨 + "국세기본법 §47조의3 ①1호 가목" 텍스트 존재 (RTL)
- 신규 **CR-25-02**: 무신고 분기 결과 카드 렌더 시 "40%" 라벨 + "국세기본법 §47조의2 ①1호" 텍스트 존재
- 신규 **CR-26-01**: 과소신고 + 역외 결과 카드 렌더 시 "60%" 라벨 + "국세기본법 §47조의3 ①1호 가목 괄호" 텍스트 존재
- 신규 **CR-26-02**: 무신고 + 역외 결과 카드 렌더 시 "60%" 라벨 + "국세기본법 §47조의2 ①1호 괄호" 텍스트 존재

## 12. R-10: 증권거래세 시장별 카드 (다자산 분기)

### 12.1 변경

```tsx
// SecuritiesTransactionTaxCard.tsx
if (aggregate) {
  return aggregate.items.map((item, idx) => (
    <SecuritiesTransactionTaxCard
      key={idx}
      result={item}
      stockName={form.stockItems[idx].stockName}
    />
  ));
}
```

- 시장별 세율(코스피·코스닥 0.15% / 코넥스 0.10% / 비상장 0.35%)은 기존 `securities-transaction-tax.ts` 사용 — 변경 0.
- 종목별 카드 헤더에 `stockName` 표시.
- 정보성 카드 (과세표준 합산에 영향 없음) 명시.

## 13. R-11: 로드맵 카드 갱신

### 13.1 변경

`StockTransferTaxResultView.tsx:664~671`

```diff
  const stages: { label: string; desc: string; status: PrStatus }[] = [
    { label: "PR-1", desc: "상장 대주주·취득 후 상장", status: "completed" },
    { label: "PR-2", desc: "비상장·평가·시기별 연혁", status: "completed" },
-   { label: "PR-3", desc: "다자산·가산세·신고서", status: "current" },
-   { label: "후속", desc: "§97의2·국외전출세·해외주식", status: "pending" },
+   { label: "PR-3", desc: "다자산·가산세·신고서", status: "completed" },
+   { label: "후속", desc: "§97의2·국외전출세·해외주식", status: "current" },
  ];
```

- PR-3 모든 R-1~R-12 anchor 통과 후 본 변경 commit (R-7·R-9 anchor 충족 시).

## 14. R-12: 다자산 가산세 게이트 적용 단위 결정

### 14.1 국세기본법 §47조의2·§47조의3 적용 단위 검토

국세기본법 §47조의2(무신고)·§47조의3(과소신고) 가산세는 **신고-단위(예정신고서 1매)** 에 부과. 다종목 1매 신고에서 부정행위 1건이라도 발견되면 **전체 산출세액 합산에 40%** 적용.

### 14.2 엔진 현재 동작 (확인)

`calculateStockTransferTaxAggregate()` aggregate 모드:
- 각 종목에 동일 `isFraudulent`·`isInternationalTransaction` 전사 → 각 종목 `underReportPenalty` 계산
- `totalUnderReportPenalty = items.reduce(...)` 합산

→ **법령 정합** (합산 산출세액에 40% 적용한 값과 종목별 40% 합산 값은 산술적으로 동일).

### 14.3 UI 라벨

Step3 가산세 카드에 안내 추가:
> "가산세(국세기본법 §47조의2 무신고·§47조의3 과소신고)는 **신고서 1매 단위**로 적용됩니다. 다종목 신고 시 한 종목이라도 부정행위에 해당하면 전체 합산 산출세액에 가산세율이 적용됩니다."

- anchor: `case-aggregate-multi-stock.test.ts` 에 **MA-07**: 2종목 합산 + isFraudulent=true → `totalUnderReportPenalty = totalCalculatedTax × 0.40` (1원 단위 ±2원 허용 — 종목별 floor 합산 vs 합계 floor 차이)

## 15. PR 분할 약속

PR-3 본 계획은 **3개 sub-PR** 로 분할.

### PR-3-a: 폼 상태·API·Validation 인프라 (R-1·R-3·R-4)

- `StockItemForm` 분리 + factory + normalize 마이그레이션
- `toAPIPayload()` 단일↔다자산 자동 분기
- `validateStockTransferStep` 종목별 + 합산
- 종목-수준 컴포넌트 props 시그니처 일괄 변경 (`onChange: Partial<StockItemForm>`)
- **UI 변경 0** — 사용자는 여전히 단건 모드만 작동 (stockItems.length === 1)
- anchor: P-1 ~ P-2 회귀 0 보장

### PR-3-b: 다자산 마법사 UI + 결과 (R-2·R-5·R-6·R-7·R-10)

- Step1 종목 목록 UI (`StockItemsList`·`StockItemCard`)
- Step2 `ActiveItemHeader` sticky
- `AggregateResultView` 결과 분기
- `StockSidebar` 다자산 합계
- `StockFilingFormTable.isMulti` 헤더에 `stockName` 노출 (`MA-06-03`)
- `SecuritiesTransactionTaxCard` 다자산 분기
- anchor MA-06-01~04 추가

### PR-3-c: 케이스 21·25·26 UI 마감 + 로드맵 (R-8·R-9·R-11·R-12)

- `MarketTypeBlock` 외국법인 disabled 카드
- 결과 카드 가산세 섹션 적용율·근거조문 표시
- Step3 가산세 안내 카드 (국세기본법 §47조의2·§47조의3 신고-단위 표시)
- `PrRoadmapCard` PR-3 = completed, 후속 = current
- anchor CR-25-01·CR-26-01·MA-07

## 16. 완료 조건 (Definition of Done)

PR-3-a~c 모두 완료 시:

- [ ] 14지점 모두 동기화 (`ui-engine-sync-checker` 0 누락)
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/stock-transfer/` 전체 통과
- [ ] 신고서 양식 다자산 anchor MA-06-01~04 + MA-07 통과
- [ ] 결과 카드 가산세 적용율 4-state(10/20/40/60%) RTL 확인
- [ ] 외국법인 시장 옵션 disabled 시각 확인 (Step1)
- [ ] 로드맵 카드 PR-3 emerald + 후속 sky
- [ ] **브라우저 수동 확인** — 종목 2개 입력 → aggregate 결과 → Network 탭 `{items: [...], deductionMode: "aggregate"}` 확인
- [ ] PR-2 기존 anchor 회귀 0 (3,452 PASS 기준선 유지)
- [ ] 디자인 문서 `stock-transfer-tax.engine.design.md:476` PR-3 케이스 인벤토리 충족도 갱신
- [ ] memory 갱신: `project_stock_transfer_pr3_multi_asset.md` 신설

## 17. 후속 (PR-3 범위 외)

본 계획서는 PR-3 한정. 다음은 **후속 PR** 명시:

- §97의2 토지·건물 이월과세 (주식 미적용 — 별도 도메인)
- 국외전출세 (소득세법 §126의3·§126의4)
- 해외상장 주식 (§94①3 다목 — 외국법인 발행 주식과 별개)
- 부당행위계산 부인 §101② (특수관계인 저가 양도)
- 양도손실 통산 (§103①2호 같은 그룹 내 — aggregate 모드의 진정한 통산은 본 PR에서 그룹별 기본공제 한정)
- 다종목 specificMatching 모드 (R-2.c 차단된 영역)

## 18. v1 → v2 점검 약속

Do 진입 전 다음을 KoreanLaw MCP로 재검증:

- ✅ **v2에서 완료** — 국세기본법 §47조의2 ①1호 (무신고 부정 40%/역외 60%) + §47조의3 ①1호 가목 (과소신고 부정 40%/역외 60%) 정정. §47의4 → 국세기본법 §47조의4 정정
- §103①2호 그룹별 250만 한도 (양도세집행기준 103-…)
- ✅ **v2에서 완료** — "외국법인이 발행하였거나 외국에 있는 시장에 상장된 주식등으로서 대통령령으로 정하는 것" (소득세법 §94①3 다목, 2026.4.21. 시행). 본 엔진 양도소득세 범위 "내"이나 현재 미지원 — UI 라벨에서 "별도 도메인" 표현 제거

[[feedback-korean-law-82-vs-81-2-drift]] 정책 — 추정 인용 금지. v2에서 위임 체인 끝까지 추적 후 라벨 확정.
