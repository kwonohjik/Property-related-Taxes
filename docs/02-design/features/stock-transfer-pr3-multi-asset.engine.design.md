# 주식 양도소득세 PR-3 — 다자산 합산·가산세·신고서 양식 (엔진 설계)

> 작성일: 2026-05-19 (v1)
> 작성자: Claude (Opus 4.7)
> 계획서: [`docs/00-pm/stock-transfer-pr3.plan.md`](../../00-pm/stock-transfer-pr3.plan.md)
> 부모 디자인: [`stock-transfer-tax.engine.design.md`](./stock-transfer-tax.engine.design.md) (PR-1·PR-2 종합)

## Context

PR-3 범위는 PR-2 완료 시점(2026-05-18) 기준 **케이스 21·25·26 + 다자산 합산 + 신고서 양식 + 증권거래세 시장별 카드**.

엔진·API·Zod·`StockFilingFormTable.isMulti` 는 commit `39fe7a9` (2026-05-19) 에서 이미 구현 완료. **PR-3 본 디자인은 잔여 4영역**:

1. **다자산 합산 UI 폼 상태** (`stockItems[]` + `deductionMode` 신설)
2. **케이스 21 — 외국법인 발행 주식 (§94①3 다목) UI 차단** (engine 미지원 안내)
3. **케이스 25·26 — 가산세 결과 카드 라벨·근거조문 표시** (engine ✅ + UI 라벨)
4. **다종목 anchor 보강** (`case-aggregate-multi-stock.test.ts` 확장)

엔진 측 본질은 변경 0 — 모든 신규 로직은 **API adapter + UI 폼 매핑 + 결과 카드 분기**로 흡수.

## ★ 케이스 인벤토리 (Do 진입 게이트)

| # | 시나리오 | 법령 근거 | anchor 출처 | 테스트 파일 | 상태 |
|---|---|---|---|---|---|
| **MA-01** | 주식 2종목 합산, aggregate 모드, §103①2호 1회 한도 | 소득세법 §103①2호 | engine 기존 (`case-aggregate-multi-stock.test.ts`) | 동상 | ✅ 완료 |
| **MA-02** | 주식 1종목 + 기타자산 1종목, 그룹별 §103①1호/§103①2호 각 1회 | 소득세법 §103①1호·①2호 | engine 기존 | 동상 | ✅ |
| **MA-03** | each_item 모드 — 종목별 250만 (단건 보조 검증용) | engine 기존 | engine 기존 | 동상 | ✅ |
| **MA-04** | 주식 2종목 고액 합산 — 산출세액 19,500,000 합산 | engine 기존 (anchor MA-04-03 = 19,500,000) | engine 기존 | 동상 | ✅ |
| **MA-05** | 단건 ↔ aggregate([단건]) 항등성 | engine 기존 | engine 기존 | 동상 | ✅ |
| **MA-06-01** | 신고서 양식 합계행 양도가 = Σ items.transferPrice | `StockFilingFormTable.tsx` aggregate prop | `case-aggregate-multi-stock.test.ts` 신규 | 동상 | ☐ PR-3 |
| **MA-06-02** | 합계행 acquisitionPrice = 합계 양도가 − 합계 필요경비 − 합계 양도차익 (역산 자기일관성) | [[feedback-redev-filing-form-acquisition-inverse]] | 동상 | 동상 | ☐ PR-3 |
| **MA-06-03** | 종목별 행 헤더에 `stockName` 노출 (빈값 시 "종목 N" fallback) | UI 정책 | 동상 | 동상 | ☐ PR-3 |
| **MA-06-04** | filingViolation 신고-단위 전사 — 모든 종목 동일 가산세율 | adapter spec | 동상 | 동상 | ☐ PR-3 |
| **MA-07** | 다종목 + isFraudulent + 역외 → totalUnderReportPenalty 60% 항등성 | 국세기본법 §47조의3 ①1호 가목 괄호 | 동상 | 동상 | ☐ PR-3 |
| **C21-01** | `marketType="out_of_scope_foreign"` Zod 차단 (정상 입력 시) | 소득세법 §94①3 다목 (본 엔진 미지원) | engine + Zod schema | `pr2-validate.test.ts` 또는 신규 | ☐ PR-3 |
| **C21-02** | UI MarketTypeBlock에 disabled 안내 카드 텍스트 "§94①3 다목" 존재 | UI 정책 | RTL | 신규 `case-21-foreign-card.test.tsx` | ☐ PR-3 |
| **CR-25-01** | 과소신고 부정 결과 카드 "40%" + "국세기본법 §47조의3 ①1호 가목" 텍스트 | RTL | 결과카드 분기 | 신규 `case-25-26-result.test.tsx` | ☐ PR-3 |
| **CR-25-02** | 무신고 부정 결과 카드 "40%" + "국세기본법 §47조의2 ①1호" 텍스트 | RTL | 동상 | 동상 | ☐ PR-3 |
| **CR-26-01** | 과소신고 + 역외 결과 카드 "60%" + "§47조의3 ①1호 가목 괄호" | RTL | 동상 | 동상 | ☐ PR-3 |
| **CR-26-02** | 무신고 + 역외 결과 카드 "60%" + "§47조의2 ①1호 괄호" | RTL | 동상 | 동상 | ☐ PR-3 |
| **MIG-01** | sessionStorage legacy 단건 폼 → `stockItems: [{...legacyFields}]` 자동 마이그레이션 | `calc-wizard-stock-normalize.ts` | 신규 unit 테스트 | `stock-form-migration.test.ts` 신규 | ☐ PR-3 |
| **MA-08** | §103 그룹 독립성 — `realEstateGroupBasicDeductionUsed=2,500,000` + 기타자산 1개 + 주식 1개 → 기타자산 공제 0 / 주식 공제 2,500,000 | 소득세법 §103①1호·①2호 | engine 기존 + UI 안내 카드 | `case-aggregate-multi-stock.test.ts` 확장 | ☐ PR-3 (UI D-7) |

**규칙**: 행 ≥ 1 충족 (17건). 케이스 인벤토리 부모 디자인 §21~28 + 본 PR-3 신규 분기 통합.

## 법령 근거 (KoreanLaw MCP 검증, 2026-05-19)

```
소득세법 §94①3 다목 — 외국법인 발행 주식·해외상장 주식 (본 엔진 미지원)
소득세법 §103 ①1호 — §94①1호·2호·4호 그룹 (부동산·부동산권리·기타자산)
소득세법 §103 ①2호 — §94①3호 그룹 (주식)
소득세법 §103 ② — 감면소득 우선 공제 순서 (그룹 정의 아님)

국세기본법 §47조의2 — 무신고가산세
  · ① 1호 본문: 부정행위 무신고 40%
  · ① 1호 괄호: "역외거래에서 발생한 부정행위인 경우에는 100분의 60"
  · ① 2호: 일반 무신고 20%
국세기본법 §47조의3 — 과소신고·초과환급신고가산세
  · ① 1호 가목 본문: 부정행위로 인한 과소신고납부세액등 × 40%
  · ① 1호 가목 괄호: "역외거래에서 발생한 부정행위로 인한 경우에는 100분의 60"
  · ① 1호 나목: 부정행위 외 부분 10%
  · ① 2호: 일반 과소신고 10%
국세기본법 §47조의4 — 납부지연가산세 (본 PR 범위 외 — 납부일 확정 후 산정)
```

**v1 인용 오류 정정 이력**: 디자인 부모 문서 §70 `소득세법 §47의2·§47의4 — 가산세` 도 후속 PR에서 **국세기본법** 으로 정정 필요. 본 PR-3 디자인은 정확 인용을 기준으로 작성.

## 엔진 input 타입 (변경 없음 — adapter 만 변경)

부모 디자인의 `StockTransferInput` (`stock-transfer-tax.engine.design.md:140`) 그대로 사용. 다자산은 동일 input을 **`{items: StockTransferInput[], deductionMode}` 래퍼** 로 합산.

```ts
// 본 PR-3에서 변경 없음 — calc-wizard-stock-store 의 신규 폼 타입은
// API adapter 내부에서 N개 StockTransferInput으로 풀어내고 위 래퍼로 직렬화

export interface StockTransferAggregateApiPayload {
  items: StockTransferInputPayload[];     // 각 항목에 신고-단위 공통 필드 전사
  deductionMode: "each_item" | "aggregate";
}
```

### 신고-단위 공통 필드 전사 매트릭스 (A7)

다자산 모드에서 다음 6필드는 **신고서 1매 단위** 이므로 모든 `items[i]` 에 동일 값 전사:

| 필드 | 단위 | 다종목 시 처리 |
|---|---|---|
| `filingType` | 신고서 | 단일 값 → 모든 items |
| `filingDate` | 신고일 | 단일 값 → 모든 items (string→Date coerce by route) |
| `isElectronicFiling` | 전자신고 | 단일 값 (§52의2 세액공제 1회 한도 — engine aggregate 함수가 보장) |
| `filingViolation` | 신고불성실 | 단일 값 (§47조의2/§47조의3 신고-단위) |
| `isFraudulent` | 부정행위 | 단일 값 |
| `isInternationalTransaction` | 역외거래 | 단일 값 |
| `realEstateGroupBasicDeductionUsed` | 그룹 한도 | 단일 값 (aggregate engine이 §103①1호 계산 시 사용) |

→ Adapter (`lib/calc/stock-transfer-tax-api.ts`) 책임. **종목-수준 필드는 종목별 독립**.

## 엔진 result 타입 (변경 없음)

`StockTransferAggregateResult` (`stock-transfer-tax.ts:558`) 그대로 사용. 표시 라벨만 변경 (UI 디자인 참조).

## 계산 알고리즘 (변경 없음 — 부모 디자인 §346~ 그대로)

`calculateStockTransferTaxAggregate()` 의 each_item / aggregate 분기 그대로. **본 PR-3 디자인은 새로운 알고리즘을 도입하지 않음**.

## Silent fallback / 자동 안분 후보 식별

- ❌ `stockName` 빈값 → "종목 1·2·…" 자동 부여 → **fallback 허용** (display only, 엔진 무관)
- ❌ `stockItems.length === 0` 자동 채우기 → **금지** (validate 차단)
- ❌ 종목별 `marketType` 미선택 자동 추정 → **금지** (validate 차단)
- ✅ 신고-단위 6필드 → adapter에서 모든 items에 전사 (이는 **사용자 명시 입력의 전사**이므로 silent fallback 아님)

## Validation 분기

```
종목별 (각 stockItems[i]):
  · 기존 단건 validate 재귀
  · 첫 오류 시 해당 종목 id 반환 → UI focus

합산 (전체):
  · stockItems.length ≥ 1 (Zod min 1 일관)
  · 종목 ≥ 2 시 marketType="out_of_scope_foreign" 0건
  · 종목 ≥ 2 시 specificMatching 모드 차단 — 자동 cost_allocation
  · deductionMode === "aggregate" 시 신고-단위 6필드 모두 단일 값 (adapter 보장)
```

## 테스트 약속

- engine: MA-01~05 (기존 ✅) + MA-06-01~04 + MA-07 (신규)
- Zod: C21-01 (기존 ✅ — 재확인)
- UI: C21-02, CR-25-01·02, CR-26-01·02 (신규 RTL)
- migration: MIG-01 (신규 unit)
- D-7 cross-domain: **MA-08** — `realEstateGroupBasicDeductionUsed = 2,500,000` + 기타자산 종목 1개 + 주식 종목 1개 → 기타자산 그룹 공제 0 / 주식 그룹 공제 2,500,000 (§103 그룹 독립성)

## Cross-cutting / 후속

본 PR-3 범위 외 (후속 PR):
- 디자인 부모 §70 `소득세법 §47의2·§47의4` → 국세기본법 정정 (디자인-only PR)
- `stock-transfer-finalize.ts` 주석 §47의2②1 → 국세기본법 §47조의2/§47조의3 (코드 PR-3-c 동반 정정)
- `isInternationalTransaction` 필드명 → `isOffshoreTransaction` (의미 일치) — rename PR
- 다종목 specificMatching 모드 (PR-3-b 차단 영역)
- §126의3 국외전출세
- §94①3 다목 외국법인 발행 주식 엔진 지원
