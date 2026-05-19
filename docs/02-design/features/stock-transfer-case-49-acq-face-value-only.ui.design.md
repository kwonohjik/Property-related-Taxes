# UI Design — 사례 49 취득시 장부분실 액면가 + 양도시 보충적 평가 (v2)

작성일: 2026-05-19 (v2 정정: 자체 검토 4건 반영)
대응 계획서: `stock-transfer-case-49-acq-face-value-only.plan.md` v3
대응 엔진 디자인: `.engine.design.md` v2

## 0. v2 정정

| ID | 분류 | 정정 |
|---|---|---|
| DE-2 | 오류 | anchor ID 정규화 — UI-C49-10·11·12·13·14·15·16·17 (10b 폐기) |
| DM-2 | 누락 | `shouldSkipNetIncome` vs `hideAcqColumn` 우선순위 명시 — NA 단독이 상위 |
| DM-3 | 누락 | 산식 풀어쓰기 컴포넌트 `CaseFortyNineFormulaCard.tsx` 명세 추가 |
| DI-1 | 개선 | ToggleCard description 축약 + face_value 차이 안내 별도 hint로 분리 |

---

## 1. 활성 조건

`EstimatedUnlistedBlock`이 렌더된 상태에서 추가 토글:
- 부모 조건: `acquisitionMode === "estimated" && !isListed` (Step2.tsx:396)
- 본 PR 활성 토글: `acqFaceValueOnly === true` + `acqFaceValuePerShare > 0`

---

## 2. 컴포넌트 트리 변경

```
EstimatedUnlistedBlock
├── [기존] 가중치 안내 카드
├── [기존] 모드 토글 RadioCardGroup (simple / full)
├── [신규] ToggleCard acqFaceValueOnly ⬅ unlisted-direct-calc 모드 토글 직후
│     └── CurrencyInput acqFaceValuePerShare (children — 활성 시 펼침)
├── [기존] 순자산 단독 사유 RadioCardGroup
├── if mode === "full":
│     ├── EstimatedUnlistedNetIncomeStatement
│     │     ├── YearColumn col="EUTransfer" (항상)
│     │     └── YearColumn col="EUAcq"   ← acqFaceValueOnly === true 시 비노출 [E-6 패턴 차용]
│     └── EstimatedUnlistedNetAssetStatement
│           ├── YearColumn col="EUTransfer" (항상)
│           └── YearColumn col="EUAcq"   ← acqFaceValueOnly === true 시 비노출
├── if mode === "simple":
│     ├── 양도연도 NI/NA 4 필드 (현행)
│     └── 취득연도 NI/NA 4 필드 ⬅ acqFaceValueOnly === true 시 비노출 + 안내
└── 미리보기 카드 [M-4]
      ├── 양도기준시가 (기존 — useMemo)
      ├── 취득기준시가 — acqFaceValueOnly 시 액면가 직접 표시
      └── 환산취득가 (신규) — acqFaceValueOnly 시만 노출, BigInt 안전 계산
```

---

## 3. ToggleCard 사양 (acqFaceValueOnly)

```tsx
<ToggleCard
  tone="amber"
  label="취득시점 장부분실 — 액면가 적용 (§99①4 후단)"
  description="장부 분실 시 액면가를 취득기준시가로 사용. 양도기준시가는 §165④ 보충 평가 정상 적용."
  checked={form.acqFaceValueOnly ?? false}
  onCheckedChange={(v) => onChange({ acqFaceValueOnly: v })}
>
  <CurrencyInput
    label="1주당 액면가"
    required
    hint="취득기준시가 = 액면가 × 주식수 (§163⑥4 개산공제 1% 자동 적용)"
    value={form.acqFaceValuePerShare}
    onChange={(v) => onChange({ acqFaceValuePerShare: v })}
    placeholder="원/주"
  />
</ToggleCard>
{/* [DI-1] face_value 모드와의 차이 별도 hint */}
{form.acqFaceValueOnly && (
  <p className="ml-4 text-xs text-amber-600">
    ⚠️ 양/취 모두 액면가 적용은 acquisitionMode = "액면가" 모드(별도)를 사용하세요. 본 토글은 취득시점만 액면가를 적용하는 사례 49 전용입니다.
  </p>
)}
```

배치: 가중치 안내 카드 직후 + 모드 토글(simple/full) 직후 + 순자산 단독 사유 직전.

---

## 4. 취득연도 자동 비노출 — Statement 컴포넌트 변경

### 4-A. `EstimatedUnlistedNetIncomeStatement` (Net Asset도 동일 패턴)

```tsx
import { shouldSkipNetIncome } from "@/lib/tax-engine/stock-transfer/unlisted-flat-adapter";

export function EstimatedUnlistedNetIncomeStatement({ form, onChange }: Props) {
  // [DM-2] 분기 우선순위 — NA 단독이 상위 케이스 (사례 49보다 먼저 평가)
  //  Priority 1: shouldSkipNetIncome === true → 전체 비노출 (E-6 unlisted-direct-calc 기존)
  //  Priority 2: shouldSkipNetIncome === false && hideAcqColumn === true → EUAcq만 비노출 (본 PR)
  //  두 조건 동시 true 시 전체 비노출 우선 (NA 단독 평가가 사례 49보다 상위 — NI 자체가 무의미)
  if (shouldSkipNetIncome(form)) {
    return <NetAssetOnlyNotice />;
  }
  // [사례 49] acqFaceValueOnly 시 EUAcq 컬럼 비노출
  const hideAcqColumn = form.acqFaceValueOnly === true;
  return (
    <div className="rounded-lg border border-sky-200 bg-sky-50/30 p-4 space-y-3">
      <Header />
      {hideAcqColumn && (
        <p className="rounded border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-800">
          ⓘ {UNLISTED_MESSAGES.ACQ_FACE_VALUE_NOTICE} (취득연도 NI/NA 입력 비노출)
        </p>
      )}
      <div className={`grid gap-3 ${hideAcqColumn ? "grid-cols-1" : "grid-cols-1 md:grid-cols-2"}`}>
        <YearColumn form={form} onChange={onChange} col="EUTransfer" />
        {!hideAcqColumn && <YearColumn form={form} onChange={onChange} col="EUAcq" />}
      </div>
    </div>
  );
}
```

### 4-B. simple 모드 — 취득연도 4 필드 비노출

EstimatedUnlistedBlock 내부 simple 분기:
```tsx
{mode === "simple" && !form.acqFaceValueOnly && (
  <TransferYearAndAcquisitionYearInputs />
)}
{mode === "simple" && form.acqFaceValueOnly && (
  <>
    <TransferYearInputs />
    <AcqFaceValueNoticeBanner />
  </>
)}
```

---

## 5. 미리보기 카드 분기 [M-4]

### 5-A. 취득기준시가 (acqFaceValueOnly 활성 시)

```tsx
{form.acqFaceValueOnly && acqFaceValuePerShare > 0 && (
  <div className="rounded border border-amber-200 bg-amber-50/60 px-3 py-2 text-sm text-amber-800">
    <span className="font-medium">
      취득기준시가 (액면가) = {acqFaceValuePerShare.toLocaleString()}원/주 × {shares.toLocaleString()}주
      = {(acqFaceValuePerShare * shares).toLocaleString()}원
    </span>
    <span className="block text-xs mt-1">§99①4 후단 — 장부분실 액면가</span>
  </div>
)}
```

### 5-B. 환산취득가 (신규 — acqFaceValueOnly 활성 시만)

```tsx
{form.acqFaceValueOnly && conversionPreview !== null && (
  <div className="rounded border border-fuchsia-200 bg-fuchsia-50/60 px-3 py-2 text-sm text-fuchsia-800">
    <p className="font-medium">환산취득가 (사례 49)</p>
    <p className="text-xs mt-1">
      = 양도가 × (액면가 ÷ 양도기준시가)
    </p>
    <p className="text-xs">
      = {transferPrice.toLocaleString()} × ({acqFaceValuePerShare.toLocaleString()} ÷ {transferStdAfterFloor.toLocaleString()})
    </p>
    <p className="font-semibold text-fuchsia-900 mt-1">
      = {conversionPreview.toLocaleString()}원
    </p>
  </div>
)}
```

→ E-5 정정 적용: float ratio 표시 대신 분자·분모 분리 표시.

---

## 6. UI 케이스 매트릭스 (계획서 §3-D와 동일 — 8 케이스)

| # | acqFaceValueOnly | mode | isNetAssetOnly | 양도연도 | 취득연도 | 액면가 | 미리보기 |
|---|---|---|---|---|---|---|---|
| 1 | F | simple | F | NI+NA 노출 | NI+NA 노출 | — | 양도·취득기준시가 (기존) |
| 2 | F | simple | T | NA만 | NA만 | — | 양도·취득기준시가 (기존) |
| 3 | F | full | F | NI 24행 + NA 19행 | NI 24행 + NA 19행 | — | 양도·취득기준시가 (기존) |
| 4 | F | full | T | NA 19행 | NA 19행 | — | 양도·취득기준시가 (기존) |
| **5** | **T** | **simple** | **F** | **NI+NA 노출** | **비노출** | **필수** | **양도기준시가 + 액면가 + 환산취득가 3 카드** |
| **6** | **T** | **simple** | **T** | **NA만** | **비노출** | **필수** | **양도기준시가(NA단독) + 액면가 + 환산취득가** |
| **7** | **T** | **full** | **F** | **EUTransfer NI+NA** | **비노출** | **필수** | **양도기준시가(가중평균) + 액면가 + 환산취득가** |
| **8** | **T** | **full** | **T** | **EUTransfer NA만** | **비노출** | **필수** | **양도기준시가(NA단독) + 액면가 + 환산취득가** |

---

## 7. 결과 카드 [GAP-2 패턴 차용]

`StockTransferTaxResultView`에 prop 추가:

```tsx
interface StockTransferTaxResultViewProps {
  // ... 기존 ...
  acqFaceValueOnly?: boolean;
}
```

헤더 영역:
```tsx
{acqFaceValueOnly && (
  <span className="px-3 py-1 rounded-full border text-sm bg-amber-50 text-amber-700 border-amber-200">
    {UNLISTED_MESSAGES.ACQ_FACE_VALUE_BADGE}
  </span>
)}
```

산식 풀어쓰기 카드 (계획서 §8-B 동일):
```
양도기준시가 산정 (소득세법 §165④1 가중평균)
  = (1주당 순손익가치 × 가중치 + 1주당 순자산가치 × 가중치) ÷ 5
  = 50,000원
  ※ 80% 하한 발동 (§165④1 단서) → 64,000원

취득기준시가 (소득세법 §99①4 후단 — 장부분실 액면가)
  = 1주당 액면가 × 주식수
  = 5,000 × 2,000주 = 10,000,000원

환산취득가 (§99①4 후단 + §165④ 혼합)
  = 양도가 × (액면가 ÷ 양도기준시가)
  = 100,000,000 × (5,000 ÷ 64,000)
  = 7,812,500원

개산공제 (시행령 §163⑥4 — 1%)
  = 취득기준시가 × 1%
  = 10,000,000 × 1% = 100,000원
```

Step4에서 prop 전달:
```tsx
<StockTransferTaxResultView
  // ... 기존 ...
  acqFaceValueOnly={form.acqFaceValueOnly}
/>
```

### 7-A. 산식 풀어쓰기 카드 컴포넌트 [DM-3]

신규 파일 `components/calc/stock-transfer/CaseFortyNineFormulaCard.tsx`:

```tsx
"use client";

interface CaseFortyNineFormulaCardProps {
  transferPrice: number;
  acqFaceValuePerShare: number;
  shareCount: number;
  /** §165④1 가중평균 산식 표시용 */
  niPerShare: number;
  naPerShare: number;
  niWeight: 2 | 3;
  naWeight: 2 | 3;
  weighted: number;
  /** 80% 하한 적용 후 양도기준시가 (engine result.transferStdPriceAfterFloor) */
  transferStdPriceAfterFloor: number;
  floor80Applied: boolean;
  acquisitionStdPriceTotal: number;
  acquisitionPrice: number;  // 환산취득가 (engine result)
  expenses: number;          // §163⑥4 개산공제 (engine result)
}

export function CaseFortyNineFormulaCard(props: CaseFortyNineFormulaCardProps) {
  return (
    <div className="rounded-lg border border-fuchsia-200 bg-fuchsia-50/60 p-4 space-y-3 text-sm">
      <p className="font-semibold text-fuchsia-800">사례 49 산식 (소득세법 §99①4 후단 + §165④ 혼합)</p>
      {/* 4 섹션 — 양도기준시가 / 취득기준시가 / 환산취득가 / 개산공제 */}
      <FormulaSection title="양도기준시가 산정 (§165④1 가중평균)" steps={[...]} />
      <FormulaSection title="취득기준시가 (§99①4 후단 — 장부분실 액면가)" steps={[...]} />
      <FormulaSection title="환산취득가 (§99①4 후단 + §165④ 혼합)" steps={[...]} />
      <FormulaSection title="개산공제 (시행령 §163⑥4 — 1%)" steps={[...]} />
    </div>
  );
}
```

배치: `StockTransferTaxResultView` 내부 8항목 결과 표 직후, 상세 카드들 직전. 활성 조건: `acqFaceValueOnly === true`.

데이터 소스 — Step4에서 `result.transferStdPriceAfterFloor` + form 값 + result.acquisitionPrice/expenses를 prop으로 전달. `transferPrice`는 `result.transferPrice` 우선 fallback `parseAmount(form.transferTotalPrice)`.

---

## 8. 14 동기화 지점 (UI 측면)

| # | 지점 | 변경 위치 |
|---|---|---|
| ① 폼 타입 | `calc-wizard-stock-store.ts` interface | 2 필드 |
| ② initial | `createInitialStockFormData` | false / "" |
| ③ normalize | `calc-wizard-stock-normalize.ts` | boolField + strField |
| ④ API 변환 [DR-3] | `lib/calc/stock-transfer-tax-api.ts` `acquisitionMode === "estimated"` 분기 내 — 2 필드 body spread + adapter EUAcq skip | engine.design §6 참조 |
| ⑤ UI 위젯 | `EstimatedUnlistedBlock` + 2 Statement 컴포넌트 + 미리보기 카드 + `CaseFortyNineFormulaCard` | 토글 + 액면가 + 비노출 분기 + 환산 미리보기 + 산식 카드 |
| ⑦ 결과 카드 | `StockTransferTaxResultView` + 산식 풀어쓰기 카드 | 배지 + 산식 |
| ⑧ Validate | `stock-transfer-tax-validate.ts` | 액면가 필수 + face_value 충돌 |

→ UI 측 8 지점 중 6 지점 변경 (⑥ 사이드바, ④ API는 engine.design 담당).

---

## 9. tone 색상

- ToggleCard: **amber** (취득시점 정보)
- 액면가 입력란: amber (ToggleCard tone 상속)
- 취득기준시가 미리보기: amber
- 환산취득가 미리보기 (신규): **fuchsia** (혼합 산식의 특수성 강조)
- 결과 배지: amber
- 비노출 안내 메시지: amber 텍스트

---

## 10. UI 테스트 anchor (계획서 §10-A C49-10~12)

| ID | 검증 |
|---|---|
| UI-C49-10 | acqFaceValueOnly = true 시 EUAcq YearColumn `queryByText("취득연도 직전 (비상장 §165④)") === null` |
| UI-C49-11 | simple 모드 + acqFaceValueOnly = true 시 취득연도 NI/NA 4 필드 비노출 + 안내 배너 표시 |
| UI-C49-12 | acqFaceValueOnly = true 결과 카드 헤더 `ACQ_FACE_VALUE_BADGE` 텍스트 노출 |
| UI-C49-13 | acqFaceValueOnly + full 모드 시 EUTransfer는 노출, EUAcq 비노출 |
| UI-C49-14 | 액면가 입력 후 환산취득가 미리보기 카드 노출 + 분자/분모 가시 |
| UI-C49-15 | acqFaceValueOnly OFF→ON→OFF 토글 시 acqFaceValuePerShare store 보존 + 취득연도 NI/NA 데이터 복원 |
| UI-C49-16 | acquisitionMode = face_value로 변경 시 validate 에러 표시 (M-5 차단 규칙) |
| UI-C49-17 | [DM-2] shouldSkipNetIncome === true + hideAcqColumn === true 동시 시 NetAssetOnlyNotice 노출 (전체 비노출 우선) |

---

## 11. UX 흐름 시나리오

1. 사용자가 비상장 종목 선택 → `acquisitionMode = "estimated"` 선택
2. EstimatedUnlistedBlock 노출 → 가중치 안내 카드 + 모드 토글
3. 사용자가 simple 또는 full 모드 선택
4. **사례 49 토글 활성화** → ToggleCard 펼침 → 액면가 입력란 노출
5. 액면가 입력 (예: 5,000원/주)
6. 취득연도 입력란 자동 비노출 + 안내 메시지
7. 양도연도 NI/NA 정상 입력
8. 미리보기 카드 즉시 갱신:
   - 양도기준시가 (보충 평가 + 80% 하한)
   - 취득기준시가 (액면가 × 주식수)
   - 환산취득가 (BigInt 안전 계산)
9. "계산하기" 버튼 클릭 → 결과 화면 → 헤더 배지 + 한국어 산식 풀어쓰기 카드 표시
