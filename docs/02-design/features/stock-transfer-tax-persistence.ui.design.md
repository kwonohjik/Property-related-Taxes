# stock-transfer-tax-persistence.ui.design.md

## 주식 양도소득세 — 양도인 인적사항 + 종목 메타데이터 + 저장·수정 UX 디자인

**작성일**: 2026-05-18
**담당**: UI 시니어 (stock-transfer-tax-ui)
**엔진 시니어 협업**: stock-transfer-tax-senior (타입·저장 인프라·title generator·API 14지점)
**참조 현황**: StockTransferTaxCalculator 220줄 / Step1 252 / Step2 432 / Step3 277 / Step4 84 / StockTransferTaxResultView 705줄 / StockFilingFormTable 173줄 / StockFilingFormTableHelpers 621줄

---

## 0. 현황 Gap 분석

| 기능 | 현재 상태 | 목표 |
|---|---|---|
| 종목명 입력 | 없음 | Step1 상단 신규 섹션 |
| 종목코드 | 없음 | Step1 선택 입력 |
| 증권사·계좌번호 | 없음 | Step1 선택 입력 |
| 양도인 표시 | 없음 | 결과 화면 상단 카드 |
| 저장 | 없음 — LocalTaxType에 "stock_transfer" 미등재 | 엔진 시니어가 타입 추가, UI는 훅 연결 |
| 이력 재수정 | 없음 | pendingEditId 패턴 동일 적용 |
| history 화면 진입 | TAX_TYPE_ROUTES에 "stock_transfer" 없음 | 엔진 시니어가 routes 추가, UI 검증 |
| title 자동생성 | title-generator에 "stock_transfer" 없음 | 엔진 시니어 담당, stockName 필드 제공 |
| 신고서 PDF header | 양도인·종목 헤더 없음 | StockFilingFormTable stockName prop 확장 |
| /history 카드 요약 | stock_transfer 분기 없음 (extractCardSummary) | 엔진 시니어 + HistoryClient 분기 추가 |

---

## 1. 사용자 시나리오 (UC 표)

| UC | 사용자 | 시나리오 | 완료 조건 |
|---|---|---|---|
| UC1 | 일반 납세자(본인) | 종목명 입력 → 계산 → 결과 → 자동저장 → /history 재진입 → 수정 → saveAsUpdate | history에 동일 id 1건, 최신 inputData 반영 |
| UC2 | 세무사 | 의뢰인 선택(ProfessionalClientGate 통과) → 종목명 입력 → 계산 → 저장 | clientId != null로 저장, history 의뢰인 필터링 적용 |
| UC3 | 일반 납세자 | per_share 단순 양도 → 결과 → 자동저장 → /history 클릭 → edit 모드 → 필요경비 수정 → 재계산 → saveAsNew | history에 2건(원본 + 수정본) |
| UC4 | 일반 납세자 | 분할 매수(lots 모드) → 대표 종목명 1개 입력 → 계산 | lots 모드에서도 stockName 필수 표시, 신고서 헤더에 종목명 노출 |
| UC5 | 일반 납세자 | 비상장 종목 — 종목코드 없음 → 종목명만 입력 | marketType="unlisted" 시 종목코드 hint 변경, optional 유지 |
| UC6 | 세무사·납세자 | 결과 화면 → "신고서 양식만 PDF" 클릭 → 양도인 이름·종목명이 헤더에 포함된 PDF | printScoped("form-table") 시 TaxpayerHeaderCard가 인쇄 범위에 포함 |
| UC-ERR1 | 어떤 사용자 | 저장 실패 (IndexedDB 200건 상한 도달 등) | amber 토스트 표시, 계산 결과는 그대로 유지 |
| UC-ERR2 | 어떤 사용자 | 네트워크 오류가 아닌 로컬 저장 오류 | setError 반환값 → 결과 화면 amber 인라인 메시지로 표시 |

---

## 2. 종목 메타데이터 입력 UI

### 2.1 배치 위치: Step1 최상단 (섹션 번호 1번)

현재 Step1 구조 (v2.2):
- 섹션 1: 시장 분류 (MarketTypeBlock)
- 섹션 2: 회사 분류 (CompanyTypeBlock)
- 섹션 3+: 거래 lot / 취득원인 / 대주주 / 기타자산

변경 후:
- **섹션 0 (신규)**: 종목 정보 (SecurityMetadataBlock) — 계산 식별용, 번호는 1번
- 섹션 1 → 2: 시장 분류
- 섹션 2 → 3: 회사 분류
- 이하 +1 shift

**이유**: 종목명은 이하 모든 입력의 맥락 레이블 역할. 사이드바·결과 화면에서 가장 먼저 표시.

### 2.2 신규 FieldCard 배치 흐름 (SecurityMetadataBlock)

```
┌──────────────────────────────────────────────┐
│  ❶ 종목 정보                                  │
│                                              │
│  종목명 *                                    │
│  [________________] (FieldCard, 필수)        │
│  hint: 예시 — EXAMPLE HOLDINGS, 예제 전자    │
│                                              │
│  종목코드 (선택)                              │
│  [________________]                          │
│  hint: 상장 6자리 (예: 123456), 비상장은 생략  │
│  [비상장 시 hint 변경] ↓                      │
│  hint: 비상장 종목은 종목코드가 없어도 됩니다   │
│                                              │
│  증권사 (선택)                                │
│  [________________]                          │
│  hint: 예시 — 예제증권, EXAMPLE 자산운용      │
│                                              │
│  계좌번호 (선택)                              │
│  [________________]                          │
│  hint: 뒤 4자리만 입력하거나 전체 입력         │
│  placeholder: 예: ****-1234                  │
└──────────────────────────────────────────────┘
```

**종목코드 조건부 hint**:
- `marketType === "unlisted"` → hint: "비상장 종목은 종목코드가 없어도 됩니다"
- 기타 or "" → hint: "상장 6자리 숫자 (예: 005930). 고유 식별용, 계산에 영향 없음"

**단일 종목 원칙**: 분할 매수·매도(lotsMode="split")여도 종목은 1개. 여러 종목 동시 신고는 현재 범위 밖임을 hint 안내 → 별도 신고 안내 카드 표시.

```
[lotsMode="split" 시 안내 카드 (sky tone)]
여러 종목을 동시에 신고하는 경우 종목별로 별도 계산 후 
각각 저장한 뒤 /history에서 확인하세요.
(다자산 합산 신고는 추후 업데이트 예정)
```

### 2.3 신규 컴포넌트: SecurityMetadataBlock

위치: `components/calc/stock-transfer/SecurityMetadataBlock.tsx`

Props:
```ts
interface SecurityMetadataBlockProps {
  stockName: string;
  stockCode: string;
  brokerName: string;
  accountNumber: string;
  marketType: StockTransferFormData["marketType"];
  onChange: (patch: Partial<StockTransferFormData>) => void;
}
```

렌더 원칙:
- FieldCard(tone="sky") 래퍼 — rose 시장과 구분
- 종목명: 필수 표시 (`*`), 빈 값이면 Step1 → Step2 진행 시 validation 차단
- 종목코드·증권사·계좌번호: 선택 — `hint="없으면 비워두세요"` (피드백 feedback_no_silent_apportion_fallback 준수)

### 2.4 StockTransferFormData 신규 필드 (4개 — ⑤ 동기화 지점)

엔진 시니어에게 전달:

```ts
// ── 종목 메타데이터 (저장·표시용 — 계산 미영향) ──
stockName: string;         // 종목명 (필수)
stockCode: string;         // 종목코드 (선택, 6자리 pattern hint)
brokerName: string;        // 증권사 (선택)
accountNumber: string;     // 계좌번호 마스킹 (선택)
```

**3중 패턴 (factory default = normalize = UI)**:
- `stockName`: default `""`, normalize `""`, UI 직접 사용 (fallback prop 없음)
- `stockCode`, `brokerName`, `accountNumber`: 모두 `""` default — optional이므로 validation에서 차단 안 함

---

## 3. 양도인 인적사항 노출

### 3.1 결과 화면 상단 — TaxpayerHeaderCard

위치: StockTransferTaxResultView.tsx 최상단 (PdfActions 버튼 위)

컴포넌트: `components/calc/stock-transfer/StockTaxpayerHeaderCard.tsx`

```
┌────────────────────────────────────────────────┐
│  양도인 정보              [정보 수정 →]          │
│                                                │
│  성명: 홍길동             종목명: EXAMPLE전자   │
│  모드: 납세자             종목코드: 123456      │
│  (세무사 모드)            증권사: EXAMPLE증권  │
│  의뢰인: 김납세 씨         양도일: 2024.06.15   │
└────────────────────────────────────────────────┘
```

**모드별 분기**:
- `mode === "taxpayer"`: `useUserProfile().profile.displayName` 표시
- `mode === "professional"` + activeClientId: 의뢰인 이름 표시 ("의뢰인: {name}")
- `mode === "professional"` + !activeClientId: "의뢰인 미선택 — 계정 없이 저장됩니다" amber 경고

**"정보 수정" 링크**:
- taxpayer 모드 → `/profile`
- professional 모드 → `/clients`

**인쇄 포함**: `data-print-section="taxpayer-header"` 적용 → printScoped에서 "form-table" 범위에 포함

Props:
```ts
interface StockTaxpayerHeaderCardProps {
  stockName: string;
  stockCode?: string;
  brokerName?: string;
  transferDate: string;
  result: StockTransferResult;
}
```
`useUserProfile()`과 `useProfessionalStore()`를 내부에서 직접 호출 — prop drilling 없이 자체 완결.

### 3.2 사이드바 — 종목명 라벨 (⑥ 동기화 지점)

StockSidebar.tsx에서 stockName이 있는 경우 사이드바 상단에 종목 라벨 추가:

```
┌────────────────────────┐
│  [EXAMPLE전자]          │  ← stockName badge (amber tone)
│  주식 양도세 요약        │
│  ...                   │
└────────────────────────┘
```

StockSidebar Props에 `stockName?: string` 추가.

---

## 4. 신고서 양식 컴포넌트 강화

### 4.1 현황

- `StockFilingFormTable.tsx` (173줄) — JSX 렌더만, `stockName` prop 이미 존재
- `StockFilingFormTableHelpers.ts` (621줄) — 헬퍼·타입. 800줄 근접 — 분할 주의

### 4.2 신고서 헤더 확장

현재 헤더: 타이틀 + stockName 배지 + PDF 버튼

확장 후: 양도인 성명, 종목명, 계좌, 신고연도, 양도일 영역 추가

`StockFilingFormTableProps` 확장 (엔진 시니어 협업):
```ts
interface StockFilingFormTableProps {
  // 기존
  result: StockTransferResult;
  aggregate?: StockTransferAggregate;
  onPrint?: () => void;
  title?: string;
  subtitle?: string;
  stockName?: string;
  // 신규 추가
  taxpayerName?: string;      // useUserProfile().profile.displayName or 의뢰인 이름
  stockCode?: string;
  brokerName?: string;
  accountNumber?: string;     // 마스킹 후 표시
  filingYear?: number;        // transferDate에서 자동 추출
}
```

헤더 레이아웃 (신규):
```
별지 제84호 서식 — 주식 양도소득세 신고서 (참고용)

양도인: 홍길동          종목명: EXAMPLE전자 (123456)
증권사: EXAMPLE증권     계좌번호: ****-1234
과세연도: 2024          양도일: 2024.06.15
```

### 4.3 800줄 정책 영향 평가

`StockFilingFormTableHelpers.ts` 현재 621줄. 헤더 확장 + 신규 계산 로직 예상 추가량 ~50줄 → **671줄 예상 — 안전**.

신규 컴포넌트 `StockTaxpayerHeaderCard.tsx` 별도 파일 (~80줄 예상). 분리 안전.

### 4.4 화면 미리보기 vs PDF 인쇄 전략

**통합 방식 유지** (분리 X):
- `data-print-section` 속성 기반 범위 인쇄 방식을 유지
- `printScoped("form-table")` → `[data-print-section="taxpayer-header"]` + `[data-print-section="stock-form-table"]` 포함
- CSS `@media print` → 불필요 UI 숨김 이미 적용됨

**분리 시 ROI 낮음**: React PDF 라이브러리 추가 도입 없이 현재 브라우저 인쇄 방식으로 충분.

---

## 5. PDF 다운로드 트리거 UX

### 5.1 현재 PdfActions 버튼 위치

StockTransferTaxResultView.tsx의 `PdfActions` 컴포넌트:
- "전체 PDF 다운로드" — `printScoped("full")`
- "신고서 양식만 PDF" — `printScoped("form-table")`

→ 현재 구조 유지. 위치는 결과 상단 (TaxpayerHeaderCard 다음).

### 5.2 다운로드 파일명 규칙

브라우저 인쇄 방식이므로 `document.title` 변경으로 제어:
```
주식양도세_EXAMPLE전자_2024.06.15.pdf
→ document.title = `주식양도세_${stockName}_${transferDate}` (인쇄 직전 set, 인쇄 후 원복)
```

구현 위치: `PdfActions` 컴포넌트 내 `onClick` 핸들러에서 title 임시 변경.

### 5.3 HistoryPdfDocument 연결 지점 (엔진 시니어 담당)

엔진 시니어가 `HistoryPdfDocument`에 `stock_transfer` 분기를 추가하면 UI 시니어는:
1. StockTransferTaxResultView에서 "PDF 다운로드" 버튼에 `HistoryPdfDocument` 트리거 추가
2. 현재 브라우저 인쇄 방식과 병행 유지 (엔진 시니어 완료 후 교체)

---

## 6. /history 화면 진입·재수정 UX

### 6.1 history 화면 진입

엔진 시니어 담당:
- `LocalTaxType`에 `"stock_transfer"` 추가 (`lib/storage/types.ts`)
- `TAX_TYPE_ROUTES`에 `"stock_transfer": "/calc/stock-transfer-tax"` 추가 (`app/history/HistoryClient.tsx`)
- `TAX_TYPE_LABELS`에 `"stock_transfer": "주식 양도소득세"` 추가
- `extractCardSummary` stock_transfer 분기 추가 (stockName + transferDate)
- `FILTER_OPTIONS`에 필터 추가

UI 시니어 담당:
- `page.tsx` (`app/calc/stock-transfer-tax/page.tsx`) — `searchParams.edit` 수신 → store hydration
- StockTransferTaxCalculator에 `pendingEditId` 패턴 연결

### 6.2 store hydration 흐름

`page.tsx` (Server Component → Client 전달):
```
GET /calc/stock-transfer-tax?edit={id}
→ page.tsx가 searchParams 수신
→ <StockTransferTaxCalculatorWithEdit editId={id} />
→ Client Component에서 calculationRepository.get(id) → store hydration
→ sessionStorage.setItem("editingCalculationId", id)
```

대안 (현재 transfer-tax와 동일 패턴):
```
/history에서 sessionStorage.setItem("editingCalculationId", id) 먼저 쓰고
→ router.push("/calc/stock-transfer-tax")
→ useAutoSaveCalculation 훅이 마운트 시 sessionStorage 읽어 pendingEditId 반환
```

**현재 부동산 양도세와 동일 패턴(sessionStorage 방식) 사용** — 일관성 유지.

### 6.3 수정 모드 헤더 배지

StockTransferTaxCalculator 헤더 영역:
```tsx
{pendingEditId && (
  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full border border-amber-300">
    수정 중: {stockName || "이전 계산"}
  </span>
)}
```

### 6.4 저장 방식 선택 UI

결과 화면 최상단 (TaxpayerHeaderCard 상단):
```tsx
{pendingEditId && (
  <div className="mb-4 flex items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm">
    <span className="flex-1 text-amber-800">
      이전 이력을 불러와 수정했습니다. 저장 방식을 선택하세요.
    </span>
    <button onClick={saveAsUpdate}>기존 이력 덮어쓰기</button>
    <button onClick={saveAsNew}>새 이력으로 저장</button>
  </div>
)}
```

부동산 양도세 TransferTaxCalculator.tsx L449~467 패턴 그대로 차용.

---

## 7. 14개 동기화 지점 — 책임 분담표

### UI 시니어 담당 (⑤⑥⑦)

| 지점 | 파일 | 작업 내용 |
|---|---|---|
| ⑤ UI 위젯 | `components/calc/stock-transfer/SecurityMetadataBlock.tsx` (신규) | 종목명·코드·증권사·계좌 4 FieldCard |
| ⑤ Step1 통합 | `app/calc/stock-transfer-tax/steps/Step1.tsx` | SecurityMetadataBlock 섹션 0 추가 |
| ⑥ 사이드바 | `components/calc/stock-transfer/StockSidebar.tsx` | stockName prop 추가 + 배지 렌더 |
| ⑥ Calculator | `app/calc/stock-transfer-tax/StockTransferTaxCalculator.tsx` | StockSidebar에 stockName 전달 |
| ⑦ 결과 카드 | `components/calc/results/StockTransferTaxResultView.tsx` | StockTaxpayerHeaderCard 삽입 |
| ⑦ 신규 | `components/calc/stock-transfer/StockTaxpayerHeaderCard.tsx` (신규) | 양도인 + 종목 헤더 카드 |
| ⑦ 신고서 헤더 | `components/calc/stock-transfer/StockFilingFormTable.tsx` | 신규 props 수신 + 헤더 확장 |
| 저장 훅 연결 | `app/calc/stock-transfer-tax/StockTransferTaxCalculator.tsx` | useAutoSaveCalculation 추가 |
| pendingEditId UI | 동상 | amber 배지 + saveAsUpdate / saveAsNew 버튼 |
| title 임시변경 | `components/calc/results/StockTransferTaxResultView.tsx` PdfActions | document.title 변경 로직 |

### 엔진 시니어 담당 (①②③④⑧⑨⑩⑪⑫⑬⑭)

| 지점 | 파일 | 작업 내용 |
|---|---|---|
| ① 폼 타입 | `lib/stores/calc-wizard-stock-store.ts` | 4필드 (stockName·stockCode·brokerName·accountNumber) |
| ② initial | 동상 `createInitialStockFormData()` | 4필드 `""` 추가 |
| ③ normalize | 동상 `normalizeStockFormData()` | 4필드 strField 추가 |
| ④ API 변환 | `lib/calc/stock-transfer-tax-api.ts` | 4필드 → engine input 매핑 (계산 미영향 — echo 패턴) |
| ⑧ validate | `lib/calc/stock-transfer-tax-validate.ts` | stockName 빈 값 → step1 error 추가 |
| ⑨ Zod enum | `app/api/calc/stock-transfer/route.ts` | stockName string optional 정의 |
| ⑫ Zod 객체 | 동상 | 4필드 Zod 정의 추가 (누락 시 침묵 stripping) |
| ⑬ body spread | `lib/calc/stock-transfer-tax-api.ts` | callStockTransferTaxAPI body에 4필드 포함 |
| ⑭ Route handler | `app/api/calc/stock-transfer/route.ts` | parsed 4필드 → engine input 매핑 |
| LocalTaxType | `lib/storage/types.ts` | "stock_transfer" 추가 |
| title generator | `lib/storage/title-generator.ts` | stock_transfer 분기 — "주식 양도소득세 — {stockName} (양도 {date})" |
| HistoryClient | `app/history/HistoryClient.tsx` | TAX_TYPE_ROUTES·TAX_TYPE_LABELS·FILTER_OPTIONS·extractCardSummary |
| FilingFormTableProps | `components/calc/stock-transfer/StockFilingFormTableHelpers.ts` | taxpayerName·stockCode·brokerName·accountNumber·filingYear 추가 |

### 3중 패턴이 필요한 필드

| 필드 | UI display | API 변환 fallback | validate fallback |
|---|---|---|---|
| `stockName` | 직접 사용 (fallback prop 없음, factory `""`) | `stockName \|\| ""` (echo) | `""` → step1 error |
| `stockCode` | 직접 사용 | `stockCode \|\| ""` | 선택 — 차단 안 함 |
| `brokerName` | 직접 사용 | `brokerName \|\| ""` | 선택 — 차단 안 함 |
| `accountNumber` | 직접 사용 | `accountNumber \|\| ""` | 선택 — 차단 안 함 |

**3중 패턴 참조**: `feedback_store_default_vs_ui_display_fallback.md` — `value={form.stockName || "기본값"}` 형태의 UI fallback 사용 금지. factory `""` → UI 직접 사용.

---

## 8. 케이스 인벤토리 표

| # | 케이스 | 시장 | 종목코드 | 저장 모드 | 예외·분기 |
|---|---|---|---|---|---|
| K-1 | UC1 — 본인 단순 양도, 자동저장·재열람 | kospi | 있음 | 자동 신규 → /history → saveAsUpdate | 수정 덮어쓰기 정상 동작 |
| K-2 | UC2 — 세무사, 의뢰인 선택 후 저장 | kosdaq | 있음 | 자동 신규 (clientId != null) | ProfessionalClientGate 통과 필수 |
| K-3 | UC3 — 단순 양도 → 수정 → saveAsNew | kospi | 있음 | 신규 → /history → saveAsNew | 이력 2건 생성 |
| K-4 | UC4 — 분할 매수 lots 모드 | konex | 있음 | 자동 신규 | 여러 종목 안내 카드 노출 (lotsMode="split") |
| K-5 | UC5 — 비상장 종목코드 없음 | unlisted | 없음("") | 자동 신규 | 종목코드 hint 변경, validation 차단 없음 |
| K-6 | UC6 — 신고서 PDF, 양도인 헤더 포함 | any | optional | 저장 무관 | printScoped("form-table") 범위에 TaxpayerHeaderCard 포함 |
| K-7 | 비과세 (장내 비대주주) — 저장 | kospi | 있음 | 자동 신규 | result.isExempt=true → "비과세" 배지, 세액 0 저장 |
| K-8 | 저장 실패 (IndexedDB 상한 200건) | any | any | 실패 — amber 토스트 | 재시도 버튼 옵션, 결과 화면 유지 |
| K-9 | 저장 성공 후 /history에서 삭제 | any | any | 삭제 후 리스트 갱신 | stock_transfer 필터 적용 |
| K-10 | 수정 모드 진입 — stockName 복원 | any | any | pendingEditId 있음 | 수정 중 배지에 stockName 표시 |

---

## 9. 800줄 정책 영향 분석

### 현재 파일별 줄수

| 파일 | 현재 | 예상 추가 | 예상 합계 | 분할 필요? |
|---|---|---|---|---|
| StockTransferTaxCalculator.tsx | 220 | +60 (useAutoSaveCalculation + pendingEditId UI) | ~280 | 안전 |
| Step1.tsx | 252 | +30 (SecurityMetadataBlock 섹션) | ~282 | 안전 |
| Step2.tsx | 432 | 0 | 432 | 주의 (향후 추가 시 분할 검토) |
| Step3.tsx | 277 | 0 | 277 | 안전 |
| Step4.tsx | 84 | 0 | 84 | 안전 |
| StockTransferTaxResultView.tsx | 705 | +40 (TaxpayerHeaderCard 삽입 + PdfActions 확장) | ~745 | **주의** — 800줄 근접 |
| StockFilingFormTable.tsx | 173 | +40 (헤더 확장) | ~213 | 안전 |
| StockFilingFormTableHelpers.ts | 621 | +30 (Props 타입 확장) | ~651 | 안전 |
| StockSidebar.tsx | 미확인 | +15 | TBD | 확인 후 판단 |

### 분할 경고: StockTransferTaxResultView.tsx

현재 705줄 + 추가 예상 40줄 = **745줄 — 800줄 정책 경계**.

사전 분할 안 (Do 단계 진입 전 확인):
1. `StockTransferPenaltyCard.tsx` 분리 — 가산세 섹션 (~120줄)
2. `StockTransferLthdCard.tsx` 분리 — 장기보유공제 섹션 (~80줄)
→ 분리 후 ResultView ~500줄, 각 카드 ~100줄

**Do 단계 시작 시 ResultView 분할을 먼저 수행한 후 TaxpayerHeaderCard 삽입**.

### 신규 컴포넌트

| 신규 파일 | 예상 줄수 | 비고 |
|---|---|---|
| `SecurityMetadataBlock.tsx` | ~90줄 | 4 FieldCard + marketType 조건부 hint |
| `StockTaxpayerHeaderCard.tsx` | ~80줄 | useUserProfile + useProfessionalStore 내부 호출 |

---

## 10. 컴포넌트 구조 다이어그램

```
app/calc/stock-transfer-tax/
├── page.tsx
│   └── searchParams.edit → editId 전달
├── StockTransferTaxCalculator.tsx  [+useAutoSaveCalculation, +pendingEditId UI]
│   ├── StepIndicator
│   ├── StockSidebar  [+stockName prop]
│   ├── Step1  [+SecurityMetadataBlock 섹션]
│   │   └── SecurityMetadataBlock (신규)
│   │       ├── FieldCard stockName (필수)
│   │       ├── FieldCard stockCode (선택, hint 조건부)
│   │       ├── FieldCard brokerName (선택)
│   │       └── FieldCard accountNumber (선택)
│   ├── Step2
│   ├── Step3
│   └── Step4 (결과)

components/calc/results/
└── StockTransferTaxResultView.tsx  [+StockTaxpayerHeaderCard, +PdfActions title 변경]
    ├── StockTaxpayerHeaderCard (신규)  ← useUserProfile(), useProfessionalStore() 내부
    ├── PdfActions  [+document.title 임시 변경]
    ├── StockFilingFormTable  [+taxpayerName, stockCode, brokerName, accountNumber, filingYear props]
    └── (분할 후) StockTransferPenaltyCard / StockTransferLthdCard

components/calc/stock-transfer/
├── SecurityMetadataBlock.tsx (신규)
├── StockTaxpayerHeaderCard.tsx (신규)
├── StockSidebar.tsx  [+stockName prop]
└── StockFilingFormTable.tsx  [+헤더 확장]
```

---

## 11. 엔진 시니어 → UI 시니어 인계 지점

Do 단계 시작 전 엔진 시니어가 완료해야 UI 시니어가 훅 연결 가능한 항목:

1. `LocalTaxType`에 `"stock_transfer"` 추가 — useAutoSaveCalculation taxType 파라미터
2. `title-generator.ts` stock_transfer 분기 — generateTitle 정상 호출 위해
3. `StockTransferFormData` 4필드 추가 (①②③ 완료) — SecurityMetadataBlock props 타입
4. `StockFilingFormTableProps`에 taxpayerName 등 신규 props (Helpers 파일) — 헤더 확장 위해

나머지(⑨⑩⑫⑬⑭ Route·Zod)는 엔진 시니어 완료 후 전체 파이프라인 통합 테스트.

---

## 12. 검증 시나리오 (Do 완료 후 수동 확인)

1. Step1 진입 → 종목명 빈 값 → "다음" 클릭 → validation 오류 표시
2. 종목명 입력 → 단계 진행 → 계산 → 결과 화면 상단 TaxpayerHeaderCard 표시 확인
3. 결과 화면 "신고서 양식만 PDF" → 헤더에 양도인·종목명 포함 확인
4. 비상장 선택 → 종목코드 hint 변경 확인 ("비상장 종목은 종목코드가 없어도 됩니다")
5. 계산 완료 → /history에서 "주식 양도소득세" 필터 → 저장된 이력 확인
6. 이력 클릭 → /calc/stock-transfer-tax?edit={id} → 수정 중 배지 + amber 저장 선택 UI
7. "기존 이력 덮어쓰기" → /history에서 동일 id 1건 확인
8. "새 이력으로 저장" → /history에서 2건 확인
9. Network 탭 request body에 stockName·stockCode·brokerName·accountNumber 포함 확인 (⑬⑭ 검증)
