# 주식 양도소득세 — 저장·이력·신고서 양식·PDF 인프라 엔진 설계

**담당**: 엔진/타입/저장 인프라 시니어  
**병렬 문서**: `stock-transfer-tax-persistence.ui.design.md` (UI 시니어 담당)  
**범위**: 메타데이터 타입 확장 / LocalTaxType 확장 / title-generator / useAutoSaveCalculation 통합 / /history 분기 / HistoryPdfDocument 분기 / 14지점 책임 분담  
**스코프 외**: 세무서 제출용 별지 서식(소득세법 시행규칙 별지 제84호), 전자신고 파일 생성 — 별도 PDCA

---

## 0. 현황 진단 (Do 진입 전 갭 목록)

| 항목 | 현재 상태 | 필요 작업 |
|---|---|---|
| `LocalTaxType` | `"stock_transfer"` 없음 | 타입 추가 |
| `actions/calculations.ts TaxType` | `"stock_transfer"` 없음 | 타입 추가 + CHECK 마이그레이션 |
| `title-generator.ts` | `stock_transfer` 케이스 없음 | 분기 추가 |
| `HistoryClient.tsx` TAX_TYPE_ROUTES | `stock_transfer` 없음 | 라우트 + 라벨 추가 |
| `HistoryClient.tsx` FILTER_OPTIONS | `stock_transfer` 없음 | 필터 옵션 추가 |
| `HistoryClient.tsx` extractCardSummary | `stock_transfer` 없음 | 요약 추출 분기 추가 |
| `HistoryPdfDocument.tsx` TAX_TYPE_LABELS | `"stock_transfer"` 없음 (이미 snake_case 처리 로직 있음) | 명시 라벨 추가 |
| `HistoryPdfDocument.tsx` extractSummary | 부분 구현(주석 있음, `stock_transfer` 또는 `stock-transfer`) | 정리·보강 |
| `StockTransferTaxCalculator.tsx` | `useAutoSaveCalculation` 미사용 | 훅 통합 |
| `StockTransferFormData` | `securityName`/`securityCode` 없음 | 메타데이터 필드 추가 |
| `db.ts` | 스키마 변경 없음 — LocalTaxType 문자열 추가만으로 충분 | v5 불필요 |

---

## 1. 종목·거래 메타데이터 타입 확장

### 1.1 추가 필드 명세 (StockTransferFormData — ① 동기화 지점)

```ts
// ── 종목·거래 메타데이터 (엔진 계산에 영향 없음 — 식별·표시 전용) ──
securityName: string;           // 종목명 (예: "삼성전자", "비상장 A사") — 필수
securityCode: string;           // 종목코드 (예: "005930") — 비상장 시 빈 문자열 허용
brokerage: string;              // 증권사명 — 선택 (비상장 시 공란 허용)
accountNumberMasked: string;    // 계좌번호 마스킹 (예: "****-****-1234") — 선택
```

**엔진 계산 미영향 확인**: 4개 필드는 `StockTransferInput`으로 변환되지 않는다. `lib/calc/stock-transfer-tax-api.ts` body spread 시 단순 누락(silent drop) 처리로 충분 — 엔진 타입에 추가 불필요.

**비상장 식별자 처리**: `securityCode`가 빈 문자열인 경우 "비상장" fallback을 title-generator에서 처리. 6자리 초과 코드 허용(K-OTC 11자리 등).

### 1.2 초기값 (② 동기화 지점 — createInitialStockFormData)

```ts
securityName: "",
securityCode: "",
brokerage: "",
accountNumberMasked: "",
```

### 1.3 normalizeStockFormData (③ 동기화 지점)

```ts
securityName: strField("securityName"),
securityCode: strField("securityCode"),
brokerage: strField("brokerage"),
accountNumberMasked: strField("accountNumberMasked"),
```

### 1.4 14지점 sync — 메타데이터 4필드 체크리스트

| 지점 | 파일 | 필요 작업 | 담당 |
|---|---|---|---|
| ① FormData 타입 | `calc-wizard-stock-store.ts:StockTransferFormData` | 4 필드 추가 | 엔진 |
| ② initial 값 | `calc-wizard-stock-store.ts:createInitialStockFormData` | 4 필드 빈 문자열 | 엔진 |
| ③ normalize | `calc-wizard-stock-store.ts:normalizeStockFormData` | `strField(...)` 4개 | 엔진 |
| ④ API 변환 | `lib/calc/stock-transfer-tax-api.ts` | 미전달 — 변환 불필요 | 엔진 |
| ⑤ UI 위젯 | `Step1.tsx` 상단 메타데이터 섹션 신규 | TextInput × 4 | UI |
| ⑥ 사이드바 합계 | `StockSidebar.tsx` | 금액 0원 제외 규칙 적용 시 표시 불필요 — 변경 없음 | — |
| ⑦ 결과 카드 | `Step4.tsx` 결과 상단 종목 배지 | securityName + marketType | UI |
| ⑧ validation | `lib/calc/stock-transfer-tax-validate.ts` | `securityName` 빈 문자열 경고(warning, error 아님) | 엔진 |
| ⑨ Zod enum 메인 | `app/api/calc/stock-transfer/route.ts` | 미전달 — Zod 불필요 | — |
| ⑩ Zod 컴패니언 | 동일 route | 불필요 | — |
| ⑪ acquisitionDate fallback | 동일 route | 영향 없음 | — |
| ⑫ Zod 입력 객체 정의 | 동일 route | 불필요 (엔진 미전달) | — |
| ⑬ callStockTransferTaxAPI body spread | `lib/calc/stock-transfer-tax-api.ts` | 불필요 — body에서 제외 | — |
| ⑭ Route handler 엔진 매핑 | 동일 route | 불필요 | — |

> 메타데이터 필드는 엔진 미전달이므로 ④⑨⑩⑪⑫⑬⑭는 변경 없음. ①②③⑤⑦⑧만 동기화.

---

## 2. LocalTaxType 확장 + DB 스키마

### 2.1 `lib/storage/types.ts` 변경

```ts
// Before
export type LocalTaxType =
  | "transfer" | "inheritance" | "gift"
  | "acquisition" | "property" | "comprehensive_property";

// After — stock_transfer 추가
export type LocalTaxType =
  | "transfer" | "inheritance" | "gift"
  | "acquisition" | "property" | "comprehensive_property"
  | "stock_transfer";
```

### 2.2 `actions/calculations.ts` TaxType 변경

```ts
// After — stock_transfer 추가
export type TaxType =
  | "transfer" | "transfer_multi"
  | "inheritance" | "gift"
  | "acquisition" | "property" | "comprehensive_property"
  | "stock_transfer";
```

### 2.3 Supabase 마이그레이션 파일

**경로**: `supabase/migrations/20260519000001_add_stock_transfer_tax_type.sql`

```sql
-- stock_transfer 세목 추가
-- 기존 CHECK 제약 교체 (Postgres는 CHECK 제약 ALTER COLUMN 미지원 — 드롭 후 재추가)
ALTER TABLE calculations
  DROP CONSTRAINT chk_calculations_tax_type;

ALTER TABLE calculations
  ADD CONSTRAINT chk_calculations_tax_type
    CHECK (tax_type IN (
      'transfer', 'inheritance', 'gift',
      'acquisition', 'property', 'comprehensive_property',
      'stock_transfer'
    ));
```

### 2.4 Dexie(IndexedDB) 스키마 영향

**영향 없음 확인**: Dexie `taxType` 컬럼은 인덱스용 문자열이며 CHECK 제약 없음. `LocalTaxType` 유니언에 `"stock_transfer"`만 추가하면 `db.ts` v5 업그레이드 불필요. 기존 v4 스키마 그대로 사용.

---

## 3. title-generator 분기 추가

### 3.1 `lib/storage/title-generator.ts` 변경 사항

**TAX_LABEL 추가**:
```ts
const TAX_LABEL: Record<LocalTaxType, string> = {
  // ... 기존 6개 ...
  stock_transfer: "주식 양도소득세",
};
```

**대표 양도일 추출 함수 신규** (`extractStockTransferDate`):

```ts
/**
 * 주식 양도세 대표 양도일 결정 규칙.
 *
 * 1. lotsMode === "split" + transferLots.length > 0
 *    → 최종 lot의 transferDate (배열 마지막 = 가장 늦은 양도일)
 * 2. 단건 모드 (lotsMode === "single")
 *    → 최상위 transferDate 직접 사용
 * 3. 위 2가지 실패 시 → null (createdAt 기반 fallback으로 떨어짐)
 */
function extractStockTransferDate(input: Record<string, unknown>): string | null {
  const lotsMode = input.lotsMode as string | undefined;
  if (lotsMode === "split") {
    const lots = input.transferLots as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(lots) && lots.length > 0) {
      // 마지막 lot transferDate = 최종 양도일
      const last = lots[lots.length - 1];
      return formatDate(last.transferDate as string | undefined);
    }
  }
  // 단건 또는 lots 미입력
  return formatDate(input.transferDate as string | undefined);
}
```

**종목명 추출 함수 신규** (`extractStockSecurityName`):

```ts
function extractStockSecurityName(input: Record<string, unknown>): string | null {
  const name = (input.securityName as string | undefined)?.trim();
  if (name) return name;
  // securityName 없을 때 marketType 기반 fallback
  const marketType = input.marketType as string | undefined;
  if (marketType === "unlisted") return "비상장주식";
  if (marketType === "other_asset") return "기타자산";
  return null;
}
```

**generateTitle 분기 추가**:

```ts
if (taxType === "stock_transfer") {
  const securityName = extractStockSecurityName(inputData);
  const date = extractStockTransferDate(inputData);
  if (securityName && date) return `${label} — ${securityName} (양도 ${date})`;
  if (securityName) return `${label} — ${securityName}`;
  if (date) return `${label} — 양도 ${date}`;
}
```

**title 예시**:
- `"주식 양도소득세 — 삼성전자 (양도 2025.07.15)"`
- `"주식 양도소득세 — 비상장 A사 (양도 2025.03.01)"`
- `"주식 양도소득세 — 비상장주식"` (securityName 미입력 + marketType=unlisted)
- `"주식 양도소득세 — 2025.12.01"` (2025-12-01 저장)

---

## 4. 저장 흐름 — useAutoSaveCalculation 통합

### 4.1 StockTransferTaxCalculator.tsx 훅 추가

**대표 양도일 결정 (taxLawVersion)**:
- `lotsMode === "split"` + `transferLots` 있음 → 최종 lot `transferDate`
- 단건 → `formData.transferDate`
- 두 경우 모두 없으면 → `new Date().toISOString().split("T")[0]` (fallback)

```tsx
// 추가 import
import { useAutoSaveCalculation } from "@/lib/storage/use-auto-save-calculation";
import { useProfessionalStore } from "@/lib/stores/professional-store";

// 컴포넌트 내부 — result 판정
const isResult = result !== null && currentStep === 3; // Step4가 3번째(0-indexed)

// 대표 양도일 계산 (useMemo)
const representativeTransferDate = useMemo(() => {
  if (formData.lotsMode === "split" && formData.transferLots.length > 0) {
    const last = formData.transferLots[formData.transferLots.length - 1];
    return last.transferDate || formData.transferDate || "";
  }
  return formData.transferDate || "";
}, [formData.lotsMode, formData.transferLots, formData.transferDate]);

const { activeClientId } = useProfessionalStore();

const { pendingEditId, saveAsUpdate, saveAsNew } = useAutoSaveCalculation({
  taxType: "stock_transfer",
  inputData: formData as unknown as Record<string, unknown>,
  resultData: isResult ? (result as unknown as Record<string, unknown>) : null,
  taxLawVersion: representativeTransferDate || new Date().toISOString().split("T")[0],
  clientId: activeClientId,
});
```

### 4.2 수정 모드(editingCalculationId) 진입 흐름

```
/history → 레코드 클릭 → sessionStorage.setItem("editingCalculationId", id)
  → router.push(TAX_TYPE_ROUTES["stock_transfer"])
  → StockTransferTaxCalculator 마운트
  → store hydration (normalizeStockFormData 적용)
  → 사용자가 값 수정 후 계산 실행
  → Step4(결과) 마운트 시 useAutoSaveCalculation 발동
  → pendingEditId != null → 자동 저장 skip → UI에 "수정 저장" / "새 이력으로 저장" 버튼 표시
```

**store hydration 위치**: `StockTransferTaxCalculator.tsx` useEffect + `normalizeStockFormData` 적용 패턴은 부동산 양도세와 동일.

```tsx
useEffect(() => {
  if (typeof window === "undefined") return;
  const editId = sessionStorage.getItem("editingCalculationId");
  if (!editId) return;
  calculationRepository.get(editId).then((record) => {
    if (!record || record.taxType !== "stock_transfer") return;
    const normalized = normalizeStockFormData(record.inputData);
    // store 전체 교체 — updateFormData가 아닌 store.setState 직접 사용
    useStockTransferStore.setState({ formData: normalized });
  });
}, []); // 마운트 1회
```

### 4.3 actions/calculations.ts Server Action 분기

```ts
// taxType union에 "stock_transfer" 추가만으로 충분 — 별도 분기 불필요
// saveCalculation 함수는 taxType을 그대로 Supabase에 저장
```

---

## 5. /history 라우트 분기

### 5.1 `app/history/HistoryClient.tsx` 변경

**TAX_TYPE_ROUTES 추가**:
```ts
const TAX_TYPE_ROUTES: Partial<Record<LocalTaxType, string>> = {
  // ...기존...
  stock_transfer: "/calc/stock-transfer-tax",
};
```

**TAX_TYPE_LABELS 추가**:
```ts
const TAX_TYPE_LABELS: Record<string, string> = {
  // ...기존...
  stock_transfer: "주식 양도소득세",
};
```

**FILTER_OPTIONS 추가**:
```ts
const FILTER_OPTIONS: { label: string; value: LocalTaxType | "all" }[] = [
  // ...기존 6개...
  { label: "주식 양도소득세", value: "stock_transfer" },
];
```

**extractCardSummary 분기 추가**:

```ts
if (taxType === "stock_transfer") {
  // 종목명 = securityName
  const securityName = (inputData.securityName as string | undefined)?.trim() || null;
  // 대표 양도일 추출 (단건 vs 분할 lot)
  const lotsMode = inputData.lotsMode as string | undefined;
  let transferDateStr: string | undefined;
  if (lotsMode === "split") {
    const lots = inputData.transferLots as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(lots) && lots.length > 0) {
      transferDateStr = lots[lots.length - 1].transferDate as string | undefined;
    }
  }
  transferDateStr = transferDateStr || (inputData.transferDate as string | undefined);
  const dateLabel = fmt(transferDateStr, "양도일");
  return { address: securityName, dateLabel };
}
```

> `extractCardSummary`에서 `address` 파라미터를 종목명으로 재활용. HistoryClient 카드 레이아웃상 "소재지" 영역에 종목명 표시 — UI 시니어가 라벨 조정 필요("소재지" → "종목명·소재지").

**extractTotalTax — stock_transfer 분기**:

주식 양도세 resultData 구조:
- 단건: `{ result: StockTransferResult }` — `result.totalTax` / `result.isExempt`
- 분할: `{ result: StockTransferAggregateResult, mode: "aggregate" }` — `result.totalTax`

기존 `extractTotalTax` 로직이 이미 `resultData?.result?.totalTax`와 `resultData?.totalTax`를 모두 탐색하므로 **변경 없음**. `isExempt` 경로도 `resultData?.result?.isExempt`로 탐색.

### 5.2 세목별 날짜 필드명 매핑 (lib/storage/CLAUDE.md 보완)

```
stock_transfer: "대표 transferDate" — 단건=top-level transferDate, 분할=최종 lot transferDate
```

---

## 6. HistoryPdfDocument 분기

### 6.1 `lib/pdf/HistoryPdfDocument.tsx` 변경

**TAX_TYPE_LABELS 추가**:
```ts
const TAX_TYPE_LABELS: Record<string, string> = {
  // ...기존...
  stock_transfer: "주식 양도소득세",
};
```

**extractSummary 분기 — stock_transfer 정리·보강**:

현재 `HistoryPdfDocument.tsx:258-268`에 `stock_transfer` 또는 `stock-transfer` 처리 로직이 주석(`// P3 G-09`)과 함께 부분 구현되어 있음. 이를 표준화:

```ts
if (tax_type === "stock_transfer") {
  const securityName = (input_data.securityName as string | undefined)?.trim();
  const shareCount = input_data.shareCount as number | undefined;
  const lotsMode = input_data.lotsMode as string | undefined;
  let perSharePrice: number | undefined;
  if (lotsMode === "split") {
    const lots = input_data.transferLots as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(lots) && lots.length > 0) {
      // 분할 모드: 총 주식수 × 평균 단가 표시 불가 — 종목명만
      return securityName ? `${securityName} (분할 양도 ${lots.length}건)` : "분할 양도";
    }
  }
  perSharePrice = input_data.perShareTransferPrice as number | undefined;
  const acquiredBefore = input_data.acquiredBeforeListing as boolean | undefined;
  if (acquiredBefore && typeof shareCount === "number" && typeof perSharePrice === "number") {
    const prefix = securityName ? `${securityName} ` : "";
    return `${prefix}${shareCount.toLocaleString()}주 × ${formatKRW(perSharePrice)} (취득 후 상장 §165⑤)`;
  }
  if (typeof shareCount === "number" && typeof perSharePrice === "number") {
    const prefix = securityName ? `${securityName} ` : "";
    return `${prefix}${shareCount.toLocaleString()}주 × ${formatKRW(perSharePrice)}`;
  }
  return securityName || "주식 양도";
}
```

### 6.2 양도인 인적사항 PDF 표시

`HistoryPdfDocument`는 현재 양도인 인적사항을 PDF에 포함하지 않는 이력 목록형 보고서. 주식 세목도 동일하게 이력 목록형으로 표시.

개별 계산서 PDF(ResultPdfDocument — 세무서 제출용 별지) 구현은 **스코프 외**. 상세 설계는 별도 PDCA에서.

### 6.3 HistoryPdfDocument 주식 양도세 컬럼

이력 목록 표 컬럼 구조는 변경 없음(날짜·세목·요약·세액). `extractSummary`의 "요약" 컬럼에 종목명·주수·단가가 표시됨.

---

## 7. resultData 구조 정의 (저장 시 참조)

주식 양도세 API 응답 → `resultData`로 저장되는 구조:

```ts
// 단건 (lotsMode === "single")
// resultData = { result: StockTransferResult }
// resultData.result.totalTax  ← HistoryClient extractTotalTax가 result.totalTax 탐색
// resultData.result.isExempt

// 분할 (lotsMode === "split", mode: "aggregate")
// resultData = { result: StockTransferAggregateResult, mode: "aggregate" }
// resultData.result.totalTax  ← 동일 경로
```

기존 `extractTotalTax` 구현이 `resultData?.result?.totalTax` 경로를 이미 탐색하므로 **추가 변경 없음**.

---

## 8. 케이스 인벤토리 (Do 진입 게이트 — 행≥1)

| # | 케이스 | marketType / lotsMode | 인적사항 | 저장 시 title 예시 | 대표 양도일 | 비고 |
|---|---|---|---|---|---|---|
| C-1 | 단순 양도 (단건) — taxpayer 모드 | kospi / single | UserProfile.displayName | "주식 양도소득세 — 삼성전자 (양도 2025.07.15)" | formData.transferDate | securityName 입력 필수 권고 |
| C-2 | 세무사 모드 — Client 선택 | kosdaq / single | Client.name | "주식 양도소득세 — 카카오 (양도 2025.09.01)" | formData.transferDate | clientId HistoryClient 필터 작동 |
| C-3 | 분할 매수·매도 lot (split) | unlisted / split | UserProfile | "주식 양도소득세 — 비상장 A사 (양도 2025.12.31)" | transferLots 마지막 row transferDate | lots 0건 시 fallback = formData.transferDate |
| C-4 | 비상장 (securityCode 없음) | unlisted / single | UserProfile | "주식 양도소득세 — 비상장 A사" (날짜 미입력) | formData.transferDate | securityCode 빈 문자열 허용 |
| C-5 | 수정 모드 재진입 (editingCalculationId) | any / any | any | (수정 후 덮어쓰기 또는 신규 저장) | — | pendingEditId 흐름 / store hydration 검증 |
| C-6 | 200건 상한 + 삭제 | any / any | any | oldest 자동 삭제 후 저장 | — | calculation-repository 기존 로직 재사용 |
| C-7 | 취득 후 상장 (§165⑤) — securityName 미입력 | kosdaq / single | UserProfile | "주식 양도소득세 — 2025.07.15" (날짜만) | formData.transferDate | securityName="" fallback createdAt |
| C-8 | 비과세 (장내 비대주주) | kospi / single | UserProfile | "주식 양도소득세 — 삼성전자 (양도 2025.05.10)" | formData.transferDate | isExempt=true → totalTax 표시 "비과세" |

---

## 9. 800줄 영향 평가

| 파일 | 현재 줄수 | 변경 예상 | 초과 여부 | 대응 |
|---|---|---|---|---|
| `lib/tax-engine/stock-transfer/stock-transfer-tax.ts` | 798 | +0 (메타데이터 미전달) | 경계 주의 | 기능 추가 없음 — 안전 |
| `lib/calc/stock-transfer-tax-validate.ts` | 582 | +10 (securityName 경고 1건) | 여유 | 안전 |
| `lib/calc/stock-transfer-tax-api.ts` | 331 | +0 | 여유 | 안전 |
| `app/api/calc/stock-transfer/route.ts` | 279 | +0 | 여유 | 안전 |
| `lib/stores/calc-wizard-stock-store.ts` | ~650 | +15 (4필드 × 3위치) | 여유 | 안전 |
| `lib/storage/title-generator.ts` | 74 | +30 | 여유 | 안전 |
| `app/history/HistoryClient.tsx` | ~250 | +25 | 여유 | 안전 |
| `lib/pdf/HistoryPdfDocument.tsx` | ~320 | +20 | 여유 | 안전 |
| `app/calc/stock-transfer-tax/StockTransferTaxCalculator.tsx` | ~180 | +30 (훅 추가 + hydration) | 여유 | 안전 |

**주의**: `stock-transfer-tax.ts`가 현재 798줄로 800줄 경계. 이번 작업에서 직접 수정하지 않으나, 후속 기능 추가 시 즉시 분할 필요.

---

## 10. 14지점 sync 책임 분담 총괄표

| 지점 | 항목 | 담당 | 파일 |
|---|---|---|---|
| ① | FormData 타입 (securityName 4필드 추가) | 엔진 | `lib/stores/calc-wizard-stock-store.ts` |
| ② | initial 값 (빈 문자열 4개) | 엔진 | 동일 파일 `createInitialStockFormData` |
| ③ | normalize (strField × 4) | 엔진 | 동일 파일 `normalizeStockFormData` |
| ④ | API 변환 (미전달) | — | 변경 없음 |
| ⑤ | UI 위젯 (종목명 TextInput 등 Step1 상단) | UI | `steps/Step1.tsx` |
| ⑥ | 사이드바 합계 (메타데이터 미표시) | — | 변경 없음 |
| ⑦ | 결과 카드 종목 배지 | UI | `steps/Step4.tsx` |
| ⑧ | validation (securityName 빈값 warning) | 엔진 | `lib/calc/stock-transfer-tax-validate.ts` |
| ⑨ | Zod enum 메인 (미전달) | — | 변경 없음 |
| ⑩ | Zod 컴패니언 (미전달) | — | 변경 없음 |
| ⑪ | acquisitionDate fallback | — | 변경 없음 |
| ⑫ | Zod 입력 객체 정의 (미전달) | — | 변경 없음 |
| ⑬ | callStockTransferTaxAPI body spread (제외) | — | 변경 없음 |
| ⑭ | Route handler 엔진 매핑 (미전달) | — | 변경 없음 |

**저장 인프라 전용 추가 동기화 지점** (14지점 외):

| 파일 | 변경 내용 | 담당 |
|---|---|---|
| `lib/storage/types.ts` | `LocalTaxType`에 `"stock_transfer"` 추가 | 엔진 |
| `actions/calculations.ts` | `TaxType`에 `"stock_transfer"` 추가 | 엔진 |
| `lib/storage/title-generator.ts` | `stock_transfer` 분기 + 2 헬퍼 함수 신규 | 엔진 |
| `app/history/HistoryClient.tsx` | TAX_TYPE_ROUTES + LABELS + FILTER + extractCardSummary 4곳 | 엔진 |
| `lib/pdf/HistoryPdfDocument.tsx` | TAX_TYPE_LABELS + extractSummary 2곳 | 엔진 |
| `app/calc/stock-transfer-tax/StockTransferTaxCalculator.tsx` | useAutoSaveCalculation 훅 + hydration useEffect | 엔진 |
| `supabase/migrations/` | 신규 마이그레이션 SQL | 엔진 |

---

## 11. 마이그레이션 호환성

### 11.1 기존 저장된 부동산 양도세 등 이력

영향 없음. `LocalTaxType` 유니언 확장은 기존 레코드의 `taxType` 값을 변경하지 않음.

### 11.2 sessionStorage·zustand persist

`StockTransferFormData`에 신규 필드(securityName 등) 추가 시 기존 persist 데이터에 해당 키가 없는 경우 → `normalizeStockFormData`의 `strField(...)` fallback이 `""` 반환. **자동 안분 fallback 금지 정책** 위반 없음 — 빈 문자열 반환은 미입력 상태이며 validation에서 warning으로 처리(error 아님).

### 11.3 Dexie v5 불필요 이유

IndexedDB `calculations` 테이블의 `taxType` 인덱스는 단순 문자열 인덱스. 새 문자열 값 `"stock_transfer"` 삽입 시 자동으로 인덱스에 추가됨. 스키마 버전 업그레이드 불필요.

---

## 12. 의존성 방향

```
저장 인프라 (lib/storage/) ← useAutoSaveCalculation ← StockTransferTaxCalculator
  ↑
title-generator ← extractStockTransferDate (신규)
                ← extractStockSecurityName (신규)

HistoryClient ← calculationRepository.list({ taxType: "stock_transfer" })
             → sessionStorage.setItem("editingCalculationId")
             → router.push("/calc/stock-transfer-tax")

HistoryPdfDocument ← HistoryRecord (tax_type: "stock_transfer")
```

부동산 `transfer-tax.ts` 의존 없음. stock-transfer 독립 도메인 원칙 유지.

---

## 13. cross-reference (UI 시니어 디자인 문서)

`stock-transfer-tax-persistence.ui.design.md`에서 담당해야 할 항목:

- ⑤ Step1.tsx 상단 "종목 정보" 섹션 — securityName(TextInput 필수), securityCode(선택), brokerage(선택), accountNumberMasked(선택)
- ⑦ Step4.tsx 결과 카드 상단 — 종목명 배지 + marketType 라벨
- pendingEditId 수정 저장 UI — "이전 이력 덮어쓰기" / "새 이력으로 저장" 버튼 (TransferTaxCalculator 패턴 참조)
- HistoryClient.tsx 카드 레이아웃 "소재지" → "종목명/소재지" 라벨 조정
- 신고서 양식 컴포넌트 (별지 제84호 서식) — 스코프 외 or UI 시니어 별도 결정 필요
