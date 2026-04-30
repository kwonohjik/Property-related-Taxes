# 연부취득 UI 설계 — 7개 동기화 지점 + 컴포넌트 명세

**상위 문서**: [acquisition-tax-installment.ui.design.md](acquisition-tax-installment.ui.design.md)
**작성일**: 2026-05-01

---

## 동기화 지점 ① — FormState 추가 필드

위치: `components/calc/acquisition/shared.ts` — `FormState` 인터페이스 끝에 추가

```typescript
// ─── [연부취득] §10의5 ───
/** 연부취득 여부 — 매매 + ON 시 회차 입력 섹션 활성화 */
isInstallmentAcquisition?: boolean;
/** 연부 매매계약일 (YYYY-MM-DD) — 2년 이상 검증 기준점 */
installmentContractDate?: string;
/** 총 매매계약금액 (원) — 시가표준액 비교용, 과세표준에는 회차 합산 사용 */
installmentTotalContractPrice?: string;
/** 연부 회차 배열 */
installments?: Array<{
  id: string;                 // UUID — React key
  label?: string;             // 사용자 라벨 ("계약금", "중도금1", "잔금" 등)
  paymentDate: string;        // 지급일 (YYYY-MM-DD)
  amount: string;             // 지급액 (CurrencyInput 문자열 — 콤마 포함)
}>;
```

`InstallmentPayment` 엔진 타입과 UI 폼 타입의 차이:

| 필드 | 엔진 타입 | 폼 타입 | 비고 |
|---|---|---|---|
| `paymentDate` | `string` | `string` | 동일 |
| `amount` | `number` | `string` | 폼은 CurrencyInput 문자열, API 변환 시 parseAmount() 적용 |
| `id` | 없음 | `string` | React key 전용, 엔진에 미전달 |
| `label` | 없음 | `string?` | 사용자 라벨, 엔진에 미전달 |

---

## 동기화 지점 ② — INITIAL_FORM 추가 기본값

위치: `components/calc/acquisition/shared.ts` — `INITIAL_FORM` 객체 끝에 추가

```typescript
// 연부취득
isInstallmentAcquisition: false,
installmentContractDate: "",
installmentTotalContractPrice: "",
installments: [],
```

---

## 동기화 지점 ③ — normalize.ts fallback 추가

위치: `components/calc/acquisition/normalize.ts` — `normalizeAcquisitionForm()` 내부 추가

```typescript
// 연부취득 — legacy에 없으면 INITIAL_FORM 기본값
isInstallmentAcquisition: typeof legacy.isInstallmentAcquisition === "boolean"
  ? (legacy.isInstallmentAcquisition as boolean)
  : INITIAL_FORM.isInstallmentAcquisition,
installmentContractDate:
  (legacy.installmentContractDate as string) ?? INITIAL_FORM.installmentContractDate,
installmentTotalContractPrice:
  (legacy.installmentTotalContractPrice as string) ?? INITIAL_FORM.installmentTotalContractPrice,
installments: Array.isArray(legacy.installments)
  ? (legacy.installments as FormState["installments"])
  : INITIAL_FORM.installments,
```

---

## 동기화 지점 ④ — API 변환 (`lib/calc/acquisition-tax-api.ts`)

`buildAcquisitionTaxBody()` 내부에 아래 블록을 `// ─── 공사비 ───` 블록 바로 뒤에 추가:

```typescript
// ─── 연부취득 (§10의5) ───
if (
  form.isInstallmentAcquisition &&
  Array.isArray(form.installments) &&
  form.installments.length > 0
) {
  const engineInstallments = form.installments
    .filter((p) => p.paymentDate && parseAmount(p.amount))
    .map((p) => ({
      paymentDate: p.paymentDate,
      amount: parseAmount(p.amount) ?? 0,
    }));
  if (engineInstallments.length > 0) {
    body.installments = engineInstallments;
    // 연부취득 시 reportedPrice = 회차 합산
    // 서버에서도 installments[]가 있으면 reportedPrice 무시
    // (acquisition-tax-base.ts의 우선순위 1번: 연부 > 부담부증여 > 원시취득 > ...)
    body.reportedPrice = engineInstallments.reduce((s, p) => s + p.amount, 0);
  }
}
```

`balancePaymentDate` 처리: 연부 ON 시 마지막 회차 지급일을 `balancePaymentDate`로 전달하여
취득 시기 계산이 최종 회차 기준이 되도록 한다.

```typescript
// 연부 ON 시 마지막 회차 지급일 → balancePaymentDate 자동 설정
if (form.isInstallmentAcquisition && Array.isArray(form.installments)) {
  const lastPayment = [...form.installments]
    .filter((p) => p.paymentDate)
    .sort((a, b) => a.paymentDate.localeCompare(b.paymentDate))
    .at(-1);
  if (lastPayment?.paymentDate) {
    body.balancePaymentDate = lastPayment.paymentDate;
  }
}
```

---

## 동기화 지점 ⑤ — UI 입력 위젯

### Step0 — 연부 토글 추가

기존 취득가액 `CurrencyInput` 바로 위(소재지 입력 바로 아래)에 `ToggleCard`를 추가한다.

레이아웃 (isOnerous 분기 내):

```
[소재지 입력]
← 신규: acquisitionCause === "purchase" 일 때만
  [연부취득 ToggleCard (amber)]
[취득가액 CurrencyInput] ← 연부 OFF 시만 표시
[연부취득 infoBanner] ← 연부 ON 시만 표시
[잔금 지급일 DateInput] ← 연부 ON 시 라벨: "마지막 회차 (잔금) 지급일"
[등기접수일 DateInput]
```

ToggleCard 명세:

| 속성 | 값 |
|---|---|
| `tone` | `amber` |
| `variant` | `card` |
| `title` | 연부취득 (2년 이상 분할 지급, §10의5) |
| `description` | 매매대금을 2년 이상에 걸쳐 분할 지급하는 방식. 각 회차 지급일마다 별도 신고 의무 발생. |
| `checked` | `form.isInstallmentAcquisition ?? false` |
| `onChange` | `(v) => set("isInstallmentAcquisition", v)` |

ToggleCard 바로 옆 TaxHelp:

```typescript
<TaxHelp
  title="연부취득 (지방세법 §10의5·§20⑤)"
  summary="매매대금을 2년 이상 분할 지급하는 취득. 각 회차마다 별도 신고 의무."
  details={`## 연부취득이란 (§6 17호)
매매대금을 취득일부터 **2년 이상**에 걸쳐 분할 지급하는 매매 방식입니다.

## 취득 시기 (§20⑤)
각 회차 지급일이 **각각의 취득 시기**입니다.
계약금 지급일, 중도금 지급일, 잔금 지급일 모두 별개의 취득일이 됩니다.

## 신고·납부 의무 (§20⑤)
각 회차 지급일부터 **60일 이내**에 취득세를 신고·납부해야 합니다.
미신고·지연 시 가산세가 부과됩니다.

## 과세표준 (§10의5)
각 회차의 **사실상 지급액**이 과세표준입니다.
이 계산기는 모든 회차 합산을 간이 계산합니다.

## 주의사항
- 분할 지급 기간이 2년 미만이면 연부취득 요건 미충족
  → 잔금 지급일 기준 일반 매매로 처리됨
- 등기는 잔금 납부 후 일괄 처리 가능
- 실무상 각 회차 납부 증빙 보관 필수`}
  legalBasis="지방세법 §10의5 / §20⑤"
/>
```

ToggleCard children (ON 시):

```tsx
{/* 매매계약일 — 2년 이상 요건 기준점 */}
<div>
  <label className={labelCls}>매매계약일</label>
  <DateInput
    value={form.installmentContractDate ?? ""}
    onChange={(v) => set("installmentContractDate", v)}
  />
  <p className="text-xs text-muted-foreground mt-1">
    연부취득 요건 검증 기준일 (§6 17호: 2년 이상 분할)
  </p>
</div>
{/* 총 계약금액 — 선택 입력 */}
<CurrencyInput
  label="총 매매계약금액 (선택)"
  value={form.installmentTotalContractPrice ?? ""}
  onChange={(v) => set("installmentTotalContractPrice", v)}
  placeholder="시가표준액 비교용 (과세표준은 회차 합산으로 결정)"
/>
{/* 안내 배너 */}
<div className={warnBannerCls}>
  회차별 지급일·지급액은 다음 단계(물건 상세)에서 입력합니다.
</div>
```

취득가액 입력 분기 변경:

```tsx
{/* 연부 OFF: 기존 취득가액 입력 */}
{isOnerous && !form.isInstallmentAcquisition && (
  <CurrencyInput label="취득가액 (실거래가)" ... />
)}
{/* 연부 ON: 안내 배너 (회차 합산이 과세표준) */}
{isOnerous && form.isInstallmentAcquisition && (
  <div className={infoBannerCls}>
    연부취득의 과세표준은 각 회차 지급액의 합산입니다.
    총 계약금액은 위 입력란에 참고용으로 입력하세요.
  </div>
)}
```

### Step1 — InstallmentPaymentsSection 추가

일반 매매 물건 상세(sky 카드) 하단에 조건부 렌더:

```tsx
{/* 연부 회차 정보 — 매매 + 연부 ON 시만 표시 */}
{!isDeemedAcquisitionCause(form.acquisitionCause) &&
  form.acquisitionCause === "purchase" &&
  form.isInstallmentAcquisition && (
  <InstallmentPaymentsSection
    installments={form.installments ?? []}
    contractDate={form.installmentContractDate}
    onChange={(rows) => set("installments", rows)}
  />
)}
```

---

## 컴포넌트 명세 — InstallmentPaymentsSection.tsx

경로: `components/calc/acquisition/InstallmentPaymentsSection.tsx` (신규, 독립 파일)

tone: amber

비주얼 구조:

```
[amber 카드: border-amber-200 bg-amber-50/40]
  헤더
  ├─ 섹션 번호 배지 (amber)
  ├─ 제목: "연부 회차 정보"
  ├─ 회차 수 배지: "N회차" (amber)
  └─ "+ 회차 추가" 버튼 (오른쪽)

  [2년 미만 경고 배너 — amber, contractDate 대비 마지막 paymentDate < 24개월 시]
  "첫 회차 ~ 마지막 회차 간격이 2년 미만입니다. 연부취득 요건(§6 17호)을 확인하세요."

  [회차 카드 배열 — 각 회차]
  ├─ 라벨 text input (선택) — "계약금" / "중도금 N차" / "잔금"
  ├─ DateInput — 지급일 (필수)
  ├─ CurrencyInput — 지급액 (필수)
  └─ [삭제] 버튼 — rows.length <= 1 시 disabled

  합계 라인
  ├─ 총 N회차 / 합계 X원
  └─ 마지막 회차 지급일: YYYY-MM-DD
```

타입 정의 (컴포넌트 내부):

```typescript
export interface InstallmentRow {
  id: string;           // crypto.randomUUID() — React key
  label?: string;       // 사용자 라벨 (선택)
  paymentDate: string;  // YYYY-MM-DD
  amount: string;       // CurrencyInput 문자열 (콤마 포함)
}

interface Props {
  installments: InstallmentRow[];
  contractDate?: string;           // Step0의 installmentContractDate (2년 검증용)
  onChange: (rows: InstallmentRow[]) => void;
}
```

순수 헬퍼 함수 (컴포넌트 외부 정의):

```typescript
function addRow(rows: InstallmentRow[]): InstallmentRow[] {
  return [...rows, { id: crypto.randomUUID(), label: "", paymentDate: "", amount: "" }];
}

function removeRow(rows: InstallmentRow[], id: string): InstallmentRow[] {
  if (rows.length <= 1) return rows;
  return rows.filter((r) => r.id !== id);
}

function updateRow(
  rows: InstallmentRow[],
  id: string,
  patch: Partial<InstallmentRow>
): InstallmentRow[] {
  return rows.map((r) => (r.id === id ? { ...r, ...patch } : r));
}
```

초기 3행 자동 추가 (빈 배열로 마운트 시):

```typescript
useEffect(() => {
  if (installments.length === 0) {
    onChange([
      { id: crypto.randomUUID(), label: "계약금", paymentDate: "", amount: "" },
      { id: crypto.randomUUID(), label: "중도금", paymentDate: "", amount: "" },
      { id: crypto.randomUUID(), label: "잔금",   paymentDate: "", amount: "" },
    ]);
  }
}, []); // mount 시 1회만
```

2년 이상 검증:

```typescript
const isUnder2Years = useMemo(() => {
  if (!contractDate) return false;
  const lastPayment = [...installments]
    .filter((r) => r.paymentDate)
    .sort((a, b) => a.paymentDate.localeCompare(b.paymentDate))
    .at(-1)?.paymentDate;
  if (!lastPayment) return false;
  const contractMs = new Date(contractDate).getTime();
  const lastMs = new Date(lastPayment).getTime();
  const diffMonths = (lastMs - contractMs) / (1000 * 60 * 60 * 24 * 30.44);
  return diffMonths < 24;
}, [installments, contractDate]);
```

합계:

```typescript
const total = useMemo(
  () => installments.reduce((s, r) => s + (parseAmount(r.amount) ?? 0), 0),
  [installments]
);
```

구현 규칙:
1. zustand 직접 mutate 금지 — `onChange(newArray)` 패턴 준수
2. DateInput 사용 필수 (`type="date"` 금지)
3. CurrencyInput 사용 필수 (amount는 원화)
4. SelectOnFocusProvider 자동 적용이므로 라벨 input에 `onFocus` 수동 추가 불필요

---

## 동기화 지점 ⑥ — 사이드바 (`AcquisitionSidebar`)

`AcquisitionSummary` 인터페이스 확장:

```typescript
export interface AcquisitionSummary {
  // ...기존 필드...
  isInstallment?: boolean;
  installmentCount?: number;
}
```

`computeAcquisitionSummary()` 함수 — 일반 취득 분기 진입 직후 연부 분기 추가:

```typescript
// ─── 연부취득 분기 ───
if (form.isInstallmentAcquisition && Array.isArray(form.installments) && form.installments.length > 0) {
  const installmentTotal = form.installments.reduce(
    (s, p) => s + (parseAmount(p.amount) ?? 0), 0
  );
  // acqValue를 회차 합산으로 대체하여 세율 미리보기도 올바르게 계산
  const acqValue = installmentTotal > 0 ? installmentTotal : null;
  // 기존 estimatedBaseRate 계산 로직 재활용 (주택 유상거래 분기 그대로)
  // ... estimatedBaseRate 계산 ...
  return {
    acquisitionValue: acqValue,
    standardValue: parseAmount(form.standardValue) || null,
    houseCountAfter: form.propertyType === "housing"
      ? (parseInt(form.houseCountAfter) > 0 ? parseInt(form.houseCountAfter) : null)
      : null,
    isRegulated: form.isRegulatedArea,
    isCorporation: form.acquiredBy === "corporation",
    estimatedBaseRate,
    isInstallment: true,
    installmentCount: form.installments.length,
  };
}
```

사이드바 렌더 — `summaryItems` 구성:

```tsx
// 연부 항목 우선 표시
if (summary.isInstallment && summary.installmentCount) {
  summaryItems.push({ label: "취득 방식", value: "연부취득 (§10의5)" });
  summaryItems.push({ label: "회차 수",   value: `${summary.installmentCount}회차` });
}
// 이후 기존 항목 (취득가액 = 회차 합산, 주택 수, 예상 세율 등) 그대로
```

`useMemo` 의존성 배열 추가:

```typescript
const summary = useMemo(() => computeAcquisitionSummary(form), [
  // ...기존 의존성...
  form.isInstallmentAcquisition,
  form.installments,        // 배열 참조 변경 시 재계산
  form.installmentTotalContractPrice,
]);
```

---

## 동기화 지점 ⑦ — 결과 카드 (`AcquisitionTaxResultView.tsx`)

### 표시 조건

```typescript
const isInstallment = result.taxBaseMethod === "installment";
```

### InstallmentSummaryCard (결과 화면 내 지역 함수)

위치: 기존 "과세표준 결정" 섹션 바로 아래 (또는 메인 요약 카드 하단)

결과 화면에 전달할 회차 정보는 **엔진이 반환하지 않으므로** 폼 상태를 별도 prop으로 전달받거나,
sessionStorage에서 복원한 폼 데이터를 활용한다.
현재 `AcquisitionTaxResultView`는 `result` prop만 받으므로 회차 표는 `result.steps[]`의 `warnings`에 포함된 안내 문구를 참조하거나, 상위 컴포넌트(`AcquisitionTaxForm`)에서 `installments` prop을 추가로 전달하는 방식으로 구현한다.

권장 방식 — 상위 prop 추가:

```typescript
// AcquisitionTaxResultView props 확장
interface Props {
  result: AcquisitionTaxResult;
  installments?: Array<{ label?: string; paymentDate: string; amount: string }>;
}
```

결과 화면 렌더 구조:

```
[amber 카드] 연부취득 (§10의5)
  과세표준 결정 방식
    각 회차 지급액을 합산하여 과세표준 결정
    = 계약금 X원 + 중도금 Y원 + 잔금 Z원
    = 총 N회차 합계 [합계금액]원
    근거: 지방세법 §10의5

  신고·납부 기한 (각 회차 별도)
    각 회차 지급일부터 60일 이내 신고·납부 (지방세법 §20⑤)

  [회차별 신고기한 표]
  │ 회차 │ 라벨    │ 지급일       │ 지급액    │ 신고기한     │ D-day │
  │  1  │ 계약금  │ 2025-01-10  │ 5,000만원 │ 2025-03-11  │ D-x  │
  │  2  │ 중도금  │ 2026-01-10  │ 2,000만원 │ 2026-03-11  │ D-x  │
  │  3  │ 잔금    │ 2027-01-10  │ 3,000만원 │ 2027-03-11  │ D-x  │

  D-day: 기존 FilingDeadlineCounter 컴포넌트 재사용
```

신고기한 계산 (UI 레벨):

```typescript
function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
// filingDeadline = paymentDate + 60일
```

다주택 + 연부 안내 배너 (조건부):

```tsx
{isInstallment && result.isSurcharged && (
  <div className={warnBannerCls}>
    <p className="font-semibold">연부취득 + 다주택 주의사항</p>
    <p>
      이 결과는 취득 시점 기준 주택 수로 세율을 계산한 합산 간이 계산입니다.
      각 회차 지급일 시점의 주택 수가 달라 중과세율이 회차별로 다를 수 있습니다.
    </p>
  </div>
)}
```

파일 분리 기준: `AcquisitionTaxResultView.tsx`가 800줄에 근접하면
`components/calc/results/acquisition/InstallmentResultCard.tsx`로 분리한다.
