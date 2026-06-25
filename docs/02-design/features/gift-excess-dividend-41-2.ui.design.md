# §41의2 초과배당에 따른 이익의 증여 — UI 설계 문서

> Plan 단일 진실: `docs/00-pm/gift-excess-dividend-41-2.plan.md`  
> 본 문서는 UI 전담 시니어 담당 (①②③⑤⑦⑧ + ⑫⑬ 정합). 엔진 설계 권위는 `*.engine.design.md`.  
> 실측 파일 기준 인용 — 추정 금지.

---

## 0. 현행 MVP 실측 (기존 상태)

| 위치 | 내용 | 파일:라인 |
|---|---|---|
| `DeemedFormState` 필드 | `edExcessDividend: string`, `edIncomeTax: string` (2필드) | `shared.tsx:181-182` |
| `INITIAL_DEEMED` 초기값 | `edExcessDividend: ""`, `edIncomeTax: ""` | `shared.tsx:325-326` |
| UI 위젯 | `ExcessDividendFields` — CurrencyInput 2개 직접입력 | `other-forms.tsx:15-22` |
| API 변환 | `excessDividend: parseAmount(form.edExcessDividend)`, `incomeTaxEquivalent: parseAmount(form.edIncomeTax)` | `gift-deemed-api.ts:231-234` |
| validate | `parseAmount(form.edExcessDividend) <= 0` 검사만 | `gift-deemed-validate.ts:107-108` |
| Zod 스키마 | `excessDividendSchema: { excessDividend, incomeTaxEquivalent }` 2필드 | `validators/gift-deemed-input.ts:164-168` |
| 엔진 | `calcExcessDividendGift` — `초과배당 − 소득세상당액` 단순차감 | `excess-dividend.ts:1-30` |
| 엔진 타입 | `ExcessDividendInput: { excessDividend, incomeTaxEquivalent }` | `types.ts:271-274` |
| 결과뷰 | `DeemedGiftResultView` — breakdown 3행 공통 테이블 | `DeemedGiftResultView.tsx:19-179` |

**확정 보완 방향**: 초과배당금액 자동산정 + 소득세 율표 자동 + 정산 2-pass + 시기 분기.

---

## 0.5 엔진 교차검토 환류 (2026-06-25) — 본 섹션이 하위 본문(§5 이하)보다 우선

엔진 설계와 교차검토 후 UI 설계 3건 정정. 충돌 시 아래가 우선.

1. **신고기한구분 입력 제거 (기존 §5.6 섹션4 폐기)**: 엔진 실측 결과, 영§31의2③1호(신고기한 6.1/7.1 이후 → 정산 미적용)은 현행 법§68① 증여세 신고기한 구조상 **트리거되지 않는다** (증여일 = 배당지급일이 발생연도 내 → 신고기한 = 증여일 말일+3개월 < 발생 다음연도 6.1). 따라서 정산은 현행(2021~)에서 **항상 적용**되며 `isDiligentFiler` 판정은 항상 false. → 신고기한 RadioCardGroup(섹션4)을 **계산 입력에서 제거**. `edFilingDeadlineType` 폼 필드 불요. 성실신고확인대상 여부는 정산증여재산가액 신고기한(5.31 vs 6.30) **안내 텍스트로만** 결과뷰에 표시(선택, 계산 무관).

2. **자동산정 미리보기 산식 제거 (§5.3 정정)**: 비례배당·②비율·초과배당금액은 영§31의2② 정합 계산 필요 → **UI 재구현 금지** (memory `feedback_ui_engine_dual_truth_avoidance`). 입력 화면은 **총 실수령 배당합계(Σ actualDividend)만** 단순 표시. 산정 내역(비례·과소·②비율·초과배당금액)은 **결과뷰에서 엔진 echo(`ExcessDividendDetail`)로** 표시. §5.3의 "Σ(actualDividend_i / ownershipRatio_i × 전체지분합)" 미리보기 산식은 **폐기**(부정확).

3. **A3 자동산정 정답 = 63,000,000** (엔진 설계 §7 A3 정정본): 결과뷰 산정내역 표는 **②비율 < 1 케이스**(기타 과소배당 주주가 분모에 포함)를 정확히 표시. ②비율 100% 가정 금지.

---

## 1. DeemedFormState 신규/변경 필드 (①)

### 1.1 폐지 필드

| 필드 | 폐지 사유 |
|---|---|
| `edExcessDividend: string` | 주주 자동산정으로 대체 (초과배당금액은 파생값) |
| `edIncomeTax: string` | `edIncomeTaxMode` + 모드별 입력으로 대체 |

> 기존 직접입력 2필드는 **모두 폐지**. 엔진이 ExcessDividendInput을 재정의할 때 구 필드명도 제거.

### 1.2 신규 필드 (엔진 시니어가 타입을 확정하면 이 매핑을 따름)

```typescript
// ── §41의2 초과배당 — 보완 필드 ──

// (A) 배당지급일 (증여일 기준, 기존 giftDate와 별도 or 대체)
edDividendDate: string;           // DateInput, "YYYY-MM-DD"
// → 증여일(giftDate)로 사용. 단, DeemedDetailModal 공통 giftDate와 중복될 수 있으므로
//   엔진 시니어 설계에서 별도 필드 필요 여부 확인 필요 (§9 확인필요 #1 참조)

// (B) 주주 배열 — 비례배당·과소배당 자동산정
edShareholders: EdShareholderRow[] | undefined;
// undefined = OFF(미입력), [] = ON(빈 배열), [...] = 데이터 있음 (3-state)

// EdShareholderRow 형태 (엔진 타입 확정 전 UI 설계 기준)
// {
//   id: string;                    // 행 고유 ID (클라이언트 키)
//   name: string;                  // 주주명 (표시용)
//   isRelatedParty: boolean;       // 특수관계인 여부 (수증자가 되는 주주)
//   isMajorShareholder: boolean;   // 최대주주등 여부 (배당 포기/과소배당 주주)
//   actualDividend: string;        // CurrencyInput — 실수령 배당금
//   ownershipRatioPct: string;     // DecimalInput — 지분율 (%)
//   // 자동산정 파생(읽기전용 미리보기 — 엔진 echo와 대조 표시)
//   // proportionalDividend: number; // 비례배당 = 총배당 × 지분율 (useMemo 파생)
//   // underpaidDividend: number;   // 과소배당 = 비례배당 − 실수령
//   // excessDividend: number;      // 초과배당금액 = ①×② (서버 echo)
// }

// (C) 소득세 상당액 모드
edIncomeTaxMode: "table" | "separate" | "comprehensive" | "nontaxable" | undefined;
// "table"          = 율표 자동 (§31의2③2호 — 미확정)
// "separate"       = 분리과세 세액 직접입력 (§31의2③2호·규칙§10의3②2호)
// "comprehensive"  = 종합과세 Max(ⓐ−ⓑ, 14%) 입력 (§31의2③2호·규칙§10의3②3호)
// "nontaxable"     = 비과세 → 소득세 0 (규칙§10의3②1호)

// (D) 분리과세 모드 직접입력
edSeparateTaxAmount: string;       // CurrencyInput

// (E) 종합과세 Max 산식 입력
edComprehensiveTaxBase: string;    // CurrencyInput — 수증자 종합소득과세표준 (ⓐ 분자)
// ⓑ 분자 = edComprehensiveTaxBase − 엔진산정 초과배당금액(Gross-up 제외분)
// ※ ⓐ−ⓑ 계산은 엔진 수행. UI는 edComprehensiveTaxBase만 입력받고
//   엔진 echo로 max(ⓐ−ⓑ, 14%) 결과를 읽기전용 표시

// (F) 시기 분기 — 신고기한 구분 (§31의2③1호·⑥ 정산 미적용 게이트)
edFilingDeadlineType: "regular" | "sincere" | undefined;
// "regular"  = 일반 신고기한 5.31 → 영③2호(율표) 또는 정산 적용
// "sincere"  = 성실신고확인대상 6.30 → 동일
// 이 필드는 영③1호 게이트에만 사용:
//   신고기한이 6.1(일반) / 7.1(성실) 이후 → 정산 미적용 + 처음부터 실제소득세

// (G) 정산 모드 (현행 2021~ 전용, §41의2②③)
edSettlementMode: boolean;         // ToggleCard(emerald)
// true = 정산 입력 활성화

// (H) 실제 소득세 (정산 시 §31의2④)
edActualIncomeTax: string;         // CurrencyInput — 실제 소득세납부세액 (납부=0 포함)
```

### 1.3 필드 요약 표

| 신규 필드 | 타입 | 비고 |
|---|---|---|
| `edDividendDate` | `string` | 공통 giftDate와 중복 여부 §9 확인 필요 |
| `edShareholders` | `EdShareholderRow[] \| undefined` | 3-state |
| `edIncomeTaxMode` | `"table"\|"separate"\|"comprehensive"\|"nontaxable"\|undefined` | RadioCardGroup |
| `edSeparateTaxAmount` | `string` | 분리과세 직접입력 |
| `edComprehensiveTaxBase` | `string` | 종합과세 과세표준 |
| `edFilingDeadlineType` | `"regular"\|"sincere"\|undefined` | 정산 미적용 게이트 |
| `edSettlementMode` | `boolean` | ToggleCard |
| `edActualIncomeTax` | `string` | 정산 실제소득세 |

---

## 2. INITIAL_DEEMED 추가 (②)

```typescript
// shared.tsx INITIAL_DEEMED에 추가 (edExcessDividend·edIncomeTax 제거)
edDividendDate: "",
edShareholders: undefined,
edIncomeTaxMode: undefined,
edSeparateTaxAmount: "",
edComprehensiveTaxBase: "",
edFilingDeadlineType: undefined,
edSettlementMode: false,
edActualIncomeTax: "",
```

---

## 3. normalize (③)

`edShareholders` 배열 각 행의 문자열 필드는 API 변환 시 `parseAmount` / `parseDecimal`로 변환.  
sessionStorage 마이그레이션 호환: 구 `edExcessDividend`·`edIncomeTax` 필드가 잔존하면 무시(폐지 필드). normalize 단계에서 `undefined`는 `undefined` 유지 (3-state 보존).

---

## 4. API 변환 (④) · fetch body (⑬)

현행 `gift-deemed-api.ts:231-234` (`case "excess_dividend"`) 전면 교체:

```typescript
case "excess_dividend": {
  // (1) 주주 배열 → shareholders 변환
  const shareholders = (form.edShareholders ?? []).map((row) => ({
    name: row.name,
    isRelatedParty: row.isRelatedParty,
    isMajorShareholder: row.isMajorShareholder,
    actualDividend: parseAmount(row.actualDividend),
    ownershipRatioPct: parseDecimal(row.ownershipRatioPct),
  }));

  // (2) 소득세 모드별 필드 매핑
  const incomeTaxMode = form.edIncomeTaxMode ?? "table"; // 미선택=율표
  const separateTaxAmount =
    incomeTaxMode === "separate" ? parseAmount(form.edSeparateTaxAmount) : undefined;
  const comprehensiveTaxBase =
    incomeTaxMode === "comprehensive" ? parseAmount(form.edComprehensiveTaxBase) : undefined;

  // (3) 정산 게이트 (신고기한구분 + settleMode)
  const isSettlement = form.edSettlementMode && form.edFilingDeadlineType !== undefined;
  const actualIncomeTax = isSettlement ? parseAmount(form.edActualIncomeTax) : undefined;

  return {
    type: "excess_dividend",
    dividendDate: form.edDividendDate || form.giftDate, // §9 확인 전 fallback
    shareholders,
    incomeTaxMode,
    separateTaxAmount,
    comprehensiveTaxBase,
    filingDeadlineType: form.edFilingDeadlineType,
    settlementMode: form.edSettlementMode,
    actualIncomeTax,
  };
}
```

> 엔진 시니어가 `ExcessDividendInput` 타입을 확정하면 위 반환 객체의 키명을 그대로 맞춤.  
> `dividendDate`는 `coerceDates(obj, ["dividendDate"])` 처리 (`date-coerce.ts` 패턴).

---

## 5. UI 위젯 재설계 — ExcessDividendFields (⑤)

### 5.1 전체 구조 (DeemedDetailModal 내부 렌더)

```
ExcessDividendFields
├── [섹션 1 sky] 증여일 (배당지급일)    ← DateInput
├── [섹션 2 sky] 주주 입력 테이블        ← EdShareholderTable
│   ├── 주주 행 (N개) — name/isRelated/isMajor/actualDiv/ratio
│   ├── + 주주 추가 버튼
│   └── [읽기전용 자동산정 박스] — 총배당·비례배당·과소배당·②비율·초과배당금액 (useMemo 미리보기)
├── [섹션 3 amber] 소득세 상당액 모드    ← RadioCardGroup(4옵션)
│   ├── [모드=table]         자동 — 율표 적용 (증여일 연도 자동 분기)
│   ├── [모드=nontaxable]    비과세 → 소득세 0원
│   ├── [모드=separate]      분리과세 세액 직접입력  ← CurrencyInput
│   └── [모드=comprehensive] 종합과세 과세표준 입력  ← CurrencyInput + 자동산정박스
├── [섹션 4 violet] 신고기한 구분        ← RadioCardGroup (일반/성실신고, 현행 2021~ 시)
│   └── (증여일 2021.1.1 미만이면 섹션 4·5 숨김)
└── [섹션 5 emerald] 정산 (§41의2②③)   ← ToggleCard
    └── (settleMode=true 시 펼침)
        ├── 실제 소득세납부세액            ← CurrencyInput
        └── [읽기전용] 정산 결과 (엔진 echo)
```

### 5.2 섹션 색상·번호 매핑

| # | 섹션 | 색조 | 핵심 컴포넌트 |
|---|---|---|---|
| 1 | 증여일 (배당지급일) | slate | DateInput |
| 2 | 주주 입력 및 초과배당금액 자동산정 | sky | EdShareholderTable |
| 3 | 소득세 상당액 모드 | amber | RadioCardGroup(4옵션) + 조건부 입력 |
| 4 | 신고기한 구분 | violet | RadioCardGroup(2옵션) — 현행 2021~ 전용 |
| 5 | 정산 (§41의2②③) | emerald | ToggleCard + CurrencyInput |

### 5.3 EdShareholderTable 컴포넌트 명세

```
EdShareholderTable
  Props: { shareholders: EdShareholderRow[] | undefined; onChange: (rows) => void }

렌더:
  [추가 버튼] "+ 주주 추가" (sky-outline)

  주주가 있으면:
  table
    thead: 이름 / 특수관계인 / 최대주주등 / 실수령배당(원) / 지분율(%)
    tbody: 각 행
      ├── name: <input type="text"> (일반 입력)
      ├── isRelatedParty: ToggleCard(variant="chip", tone="sky")
      ├── isMajorShareholder: ToggleCard(variant="chip", tone="rose")
      ├── actualDividend: CurrencyInput (hideUnit)
      ├── ownershipRatioPct: DecimalInput + "%" 단위
      └── [삭제] × 버튼

  [자동산정 읽기전용 박스] bg-sky-100/60 border border-sky-200 (useMemo 파생)
    ├── 총 실수령 배당합계:  {formatKRW(sumActual)}
    ├── 총 비례 배당합계:   {formatKRW(sumProportional)}
    ├── 총 과소배당금액:    {formatKRW(sumUnderpaid)}   ← 최대주주등 과소배당 합
    ├── ② 비율:            {(ratio × 100).toFixed(4)}%  ← 특수관계인 과소 / 총 과소
    └── 초과배당금액 (미리보기): {formatKRW(excessDividendPreview)}
    p.text-xs: "* 위 값은 UI 미리보기입니다. 최종 계산은 서버 엔진이 확정합니다."
```

**useMemo 파생 계산 (UI 미리보기 전용 — 엔진 계산 재구현 금지)**:
- 총 비례배당 = Σ(actualDividend_i / ownershipRatio_i × 전체지분합) — 단 지분합이 100%여야 의미 있음
- 각 행 비례배당 = 총배당 × ownershipRatioPct / 100 (총배당=Σ actualDividend 중 최대주주로 계산해야 하나 단순 예시)
- ※ 실제 영§31의2② 산식은 엔진이 확정. UI useMemo는 "대략적 예상" 레벨만 표시
- **useEffect → store 미러링 금지**: 미리보기 값을 store에 저장하지 않음. 읽기전용 표시만.

### 5.4 소득세 모드 RadioCardGroup (섹션 3)

```tsx
<RadioCardGroup
  name="ed-income-tax-mode"
  tone="amber"
  value={form.edIncomeTaxMode ?? "table"}
  onChange={(v) => set({ edIncomeTaxMode: v as EdIncomeTaxMode })}
  options={[
    {
      value: "table",
      label: "율표 자동 (미확정)",
      description: "시행규칙 §10의3① — 증여일 연도 율표 자동 적용",
      testId: "ed-mode-table",
    },
    {
      value: "nontaxable",
      label: "비과세",
      description: "소득령 §26의3⑥ — 소득세 0원",
      testId: "ed-mode-nontaxable",
    },
    {
      value: "separate",
      label: "분리과세",
      description: "소득법 §14⑤ — 해당 세액 직접 입력",
      testId: "ed-mode-separate",
    },
    {
      value: "comprehensive",
      label: "종합과세",
      description: "소득법 §14② — Max(ⓐ−ⓑ, 초과배당×14%) 산식",
      testId: "ed-mode-comprehensive",
    },
  ]}
/>

{/* 분리과세 직접입력 */}
{form.edIncomeTaxMode === "separate" && (
  <CurrencyInput
    label="분리과세 소득세액"
    value={form.edSeparateTaxAmount}
    onChange={(v) => set({ edSeparateTaxAmount: v })}
    hint="분리과세 적용 소득세납부세액 (규칙§10의3②2호)"
  />
)}

{/* 종합과세 과세표준 입력 */}
{form.edIncomeTaxMode === "comprehensive" && (
  <>
    <CurrencyInput
      label="수증자 종합소득과세표준"
      value={form.edComprehensiveTaxBase}
      onChange={(v) => set({ edComprehensiveTaxBase: v })}
      hint="ⓐ 계산 기준 — (과세표준 × 세율) − ((과세표준−초과배당) × 세율) vs 초과배당×14% 중 큰 값"
    />
    {/* 읽기전용: 엔진 echo 전 미리보기는 표시 불가 (엔진 의존) */}
    <p className="text-xs text-muted-foreground">
      Max(종합소득세율 적용 차액, 초과배당금액 × 14%) — 서버 계산 후 결과에 표시됩니다
    </p>
  </>
)}
```

### 5.5 증여일 연도 → 시기 분기 자동 적용 (UI 조건부 렌더)

```
const giftYear = form.edDividendDate
  ? parseInt(form.edDividendDate.slice(0, 4))
  : form.giftDate
  ? parseInt(form.giftDate.slice(0, 4))
  : undefined;

const isCurrentLaw = giftYear !== undefined && giftYear >= 2021;
const isOldLaw     = giftYear !== undefined && giftYear >= 2018 && giftYear <= 2020;
```

- `isOldLaw = true` → 섹션 4(신고기한) · 섹션 5(정산) 숨김 + sky 안내 카드 표시:
  > "2018~2020년 증여 — 구법 적용: 소득세 상당액은 산출세액에서 공제됩니다 (과세표준 = 초과배당금액 전액)"
- `isCurrentLaw = true` → 섹션 4·5 표시
- 연도 미입력 → 섹션 4·5 숨김 + "증여일(배당지급일)을 입력하면 시기별 계산방식이 결정됩니다" 안내

### 5.6 신고기한 구분 RadioCardGroup (섹션 4, 현행 전용)

```tsx
{isCurrentLaw && (
  <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3 space-y-2">
    <div className="flex items-center gap-2">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-violet-200 text-[10px] font-bold text-violet-800">4</span>
      <p className="text-xs font-semibold text-violet-700">신고기한 구분 (§41의2③·시행령§31의2③1호)</p>
    </div>
    <RadioCardGroup
      name="ed-filing-deadline"
      tone="violet"
      value={form.edFilingDeadlineType ?? "regular"}
      onChange={(v) => set({ edFilingDeadlineType: v as FilingDeadlineType })}
      options={[
        {
          value: "regular",
          label: "일반 (5.31)",
          description: "신고기한 발생연도 다음연도 5.31 — 율표 적용 후 정산(§41의2②③) 가능",
          testId: "ed-filing-regular",
        },
        {
          value: "sincere",
          label: "성실신고확인대상 (6.30)",
          description: "신고기한 6.30 — 율표 적용 후 정산 가능",
          testId: "ed-filing-sincere",
        },
      ]}
    />
    <p className="text-xs text-muted-foreground">
      신고기한이 6.1(일반) / 7.1(성실) 이후 → 처음부터 실제소득세 적용, 정산 미발생 (시행령§31의2③1호·⑥)
    </p>
    {/* 영③1호 해당 안내 — edIncomeTaxMode가 실제 세액 확정 모드인 경우 */}
    {(form.edIncomeTaxMode === "separate" || form.edIncomeTaxMode === "comprehensive") && (
      <div className="rounded bg-violet-100/60 px-2 py-1.5 text-xs text-violet-700">
        실제소득세 모드 선택 — 시행령§31의2③1호 해당 시 정산이 적용되지 않습니다.
      </div>
    )}
  </div>
)}
```

### 5.7 정산 ToggleCard (섹션 5, 현행 전용)

```tsx
{isCurrentLaw && (
  <ToggleCard
    tone="emerald"
    checked={form.edSettlementMode}
    onCheckedChange={(v) => set({ edSettlementMode: v })}
    title="정산 입력 (§41의2②③)"
    description="실제 소득세 납부 후 당초·정산 증여세 차액을 계산합니다"
    data-testid="ed-settlement-toggle"
  >
    <div className="space-y-3 pt-1">
      <CurrencyInput
        label="실제 소득세납부세액 (§31의2④)"
        value={form.edActualIncomeTax}
        onChange={(v) => set({ edActualIncomeTax: v })}
        hint="납부세액 0원인 경우도 0 입력 (규칙§10의3② 확정소득세)"
      />
      <p className="text-xs text-muted-foreground">
        정산 결과(당초·정산 증여세 차액·추납/환급)는 계산 후 결과 화면에 표시됩니다.
      </p>
    </div>
  </ToggleCard>
)}
```

### 5.8 케이스별 UI 분기 표 (C1~C8)

| 케이스 | 증여일 연도 | isOldLaw | isCurrentLaw | 섹션4·5 | 소득세 모드 기본 | 정산 ToggleCard |
|---|---|---|---|---|---|---|
| C1 (2024, 율표) | 2024 | false | true | 표시 | "table" | 표시(OFF) |
| C2 (2024, 분리) | 2024 | false | true | 표시 | "separate" | 표시(OFF/ON) |
| C3 (2024, 종합) | 2024 | false | true | 표시 | "comprehensive" | 표시(ON) |
| C4 (2024, 비과세) | 2024 | false | true | 표시 | "nontaxable" | 표시(OFF) |
| C5 (2019, 구법) | 2019 | true | false | 숨김 | "table" 고정 | 숨김 |
| C6 (2019, 구법종합) | 2019 | true | false | 숨김 | "comprehensive" | 숨김 |
| C7 (2022, 영③1호) | 2022 | false | true | 표시 | "separate" or "comprehensive" | 표시(OFF, 모드=실제세액이므로) |
| C8 (초과배당≤소득세) | - | - | - | - | 어느 모드든 | - → 결과 exclusionReason 표시 |

> C8은 UI 입력이 특수한 것이 아니라 엔진 결과가 `applied=false`이고 `exclusionReason`이 "초과배당금액이 소득세 상당액 이하 — 이익 없음"으로 표시됨. §47② 합산배제 안내 카드 추가.

---

## 6. 사이드바 합계 (⑥)

deemed gift 계산기는 독립 계산기 (마법사 StepWizard 외부). 사이드바 없음 — 해당 없음.

---

## 7. 결과뷰 변경 명세 (⑦) — DeemedGiftResultView.tsx

### 7.1 현행 결과뷰 구조 실측

`DeemedGiftResultView.tsx:19-179` — `breakdown: CalculationStep[]` 공통 테이블 렌더.  
`result.thresholdEcho`, `result.subGifts`, `result.periodBreakdown`, `result.rectification`, `result.exclusionReason`, `result.applied` 조건부 섹션.

### 7.2 §41의2 전용 결과 카드 신규 추가

엔진 시니어가 `DeemedGiftResult`의 excess_dividend 분기에 다음 필드를 추가할 때 UI가 렌더:

```typescript
// 엔진 result에서 excess_dividend 타입에 추가될 필드 (엔진 설계 권위)
interface ExcessDividendResultDetail {
  // 주주별 자동산정 내역
  shareholderBreakdown: {
    name: string;
    proportionalDividend: number;   // 비례배당
    underpaidDividend: number;      // 과소배당 (최대주주등)
    excessDividendForRecipient: number; // 수증자 초과배당금액
    incomeTaxEquivalent: number;    // 소득세 상당액
    deemedGiftValue: number;        // 증여재산가액 (수증자별)
  }[];
  // 소득세 율표 적용 내역
  taxRateBreakdown?: {
    tableSet: "2018-2024" | "2024-current";
    appliedBracket: string;         // "1억5천 초과 ~ 3억 이하 (38%)"
    baseAmount: number;             // 율표 base 금액
    excessAmount: number;           // 초과분
    rate: number;                   // 세율 (0.38 등)
    incomeTax: number;              // 소득세 상당액
  };
  // 시기 분기
  lawPeriod: "old_2018_2020" | "current_2021_present";
  // 정산 (현행 + settleMode=true)
  settlement?: {
    initialGiftTax: number;         // 당초 증여세액 (㉮)
    settledGiftTax: number;         // 정산 증여세액 (⑭)
    additionalTax: number;          // 추납 (⑭−㉮), 음수=환급
    isRefund: boolean;
  };
}
```

### 7.3 결과뷰 추가 섹션 와이어프레임

```
[기존] 증여재산가액 (증여이익) 카드 — breakdown 공통 테이블 (유지)
  └── breakdown 행:
      - "초과배당금액"
      - "초과배당금액에 대한 소득세 상당액"
      - "증여재산가액 (초과배당금액 − 소득세 상당액)"

[신규 A] 주주별 자동산정 내역 카드 (sky, ExpandToggleButton 포함)
  ← shareholderBreakdown 존재 시 렌더
  table
    thead: 주주명 / 비례배당 / 과소배당 / 초과배당금액 / 소득세상당액 / 증여재산가액
    tbody: N행 (금액 text-right font-mono tabular-nums whitespace-nowrap)
  합계 행: 굵게 표시

[신규 B] 소득세 상당액 율표 적용 내역 카드 (amber, 율표 모드일 때만)
  ← taxRateBreakdown 존재 시 렌더
  - 적용 율표 세트: 2018~2024.3.21 (6구간) / 2024.3.22~현행 (7구간)
  - 적용 구간: "{appliedBracket}"
  - 산식: "{baseAmount}원 + ({excessAmount}원 초과분 × {rate×100}%)"
  - 소득세 상당액: {incomeTaxEquivalent}원

[신규 C] 구법(2018~2020) 산출세액공제 안내 카드 (violet, lawPeriod=old_2018_2020)
  - "구법 적용: 소득세 상당액은 과세표준에서 차감하지 않고 산출세액에서 공제합니다"
  - breakdown이 구법 방식 산출세액 표시

[신규 D] 정산 카드 (emerald, settlement 존재 시)
  - "당초 증여세액 (율표 소득세 기준)": {initialGiftTax}원
  - "정산 증여세액 (실제소득세 기준)": {settledGiftTax}원
  - "정산 추납/환급 세액": {|additionalTax|}원 [추납 / 환급]
  ← additionalTax 음수이면 "환급" rose 강조, 양수이면 "추납" amber 강조

[신규 E] §47② 합산배제 안내 (C8, applied=false)
  ← exclusionReason + "§47② 동일인 재차증여 합산 적용 배제 대상입니다" 추가 안내
  ← 계산 영향 없음. 안내 카드(sky)만.

[신규 F] 연대납부의무 면제 안내 (§4의2⑥ 단서, applied=true 시)
  ← "초과배당 증여세는 연대납부의무가 면제됩니다 (§4의2⑥ 단서)" 안내 카드(slate)
  ← 계산 영향 없음. Plan §5 특칙.
```

### 7.4 산식 한국어 풀어쓰기 원칙

- "초과배당금액에 대한 소득세 상당액" 라벨 사용 (약어 금지)
- "floor()" 표현 금지 — "원 미만 절사" 표기
- 율표 적용: "731만원 + (5,220만원 초과분 × 24%)" 형태
- 정산: "정산 증여세액 − 당초 증여세액" 표기

---

## 8. validate 변경 (⑧)

`lib/calc/gift-deemed-validate.ts:107-108` 교체:

```typescript
case "excess_dividend": {
  const shareholders = form.edShareholders;
  // 주주 배열 검증
  if (!shareholders || shareholders.length === 0) {
    return "주주를 1명 이상 입력하세요";
  }
  // 관련 주주 필수 (수증자 = 특수관계인)
  const hasRelated = shareholders.some((r) => r.isRelatedParty);
  if (!hasRelated) return "특수관계인(수증자)이 되는 주주를 1명 이상 지정하세요";
  // 과소배당 주주 필수 (배당 포기/불균등 = 최대주주등)
  const hasMajor = shareholders.some((r) => r.isMajorShareholder);
  if (!hasMajor) return "배당을 포기·과소수령한 최대주주등을 1명 이상 지정하세요";
  // 각 행 배당·지분율 검증
  for (const row of shareholders) {
    if (parseAmount(row.actualDividend) < 0) return "실수령 배당금은 0 이상이어야 합니다";
    if (parseDecimal(row.ownershipRatioPct) <= 0) return `${row.name || "주주"}: 지분율을 입력하세요`;
  }
  // 소득세 모드 필수
  if (!form.edIncomeTaxMode) return "소득세 상당액 모드를 선택하세요";
  // 분리과세 직접입력
  if (form.edIncomeTaxMode === "separate") {
    if (parseAmount(form.edSeparateTaxAmount) < 0)
      return "분리과세 소득세액을 입력하세요";
  }
  // 종합과세 과세표준
  if (form.edIncomeTaxMode === "comprehensive") {
    if (parseAmount(form.edComprehensiveTaxBase) <= 0)
      return "수증자 종합소득과세표준을 입력하세요";
  }
  // 정산 시 실제소득세
  if (form.edSettlementMode) {
    if (form.edActualIncomeTax === "") return "실제 소득세납부세액을 입력하세요 (0원이면 0 입력)";
  }
  break;
}
```

**⑧ 정책 준수**: API 변환의 `incomeTaxMode ?? "table"` fallback 동일. validate도 `form.edIncomeTaxMode`가 `undefined`이면 "소득세 상당액 모드를 선택하세요"로 차단 (UI 통과 ↔ validate 차단 모순 없음).

---

## 9. Zod 스키마 변경 (⑫)

`lib/validators/gift-deemed-input.ts:164-168` `excessDividendSchema` 전면 교체:

```typescript
const edShareholderRowSchema = z.object({
  name: z.string().optional(),
  isRelatedParty: z.boolean(),
  isMajorShareholder: z.boolean(),
  actualDividend: z.number().nonnegative(),
  ownershipRatioPct: z.number().positive(),
});

const excessDividendSchema = z.object({
  type: z.literal("excess_dividend"),
  dividendDate: z.string().optional(), // date-coerce 후 Date → string ISO
  shareholders: z.array(edShareholderRowSchema).min(1),
  incomeTaxMode: z.enum(["table", "separate", "comprehensive", "nontaxable"]),
  separateTaxAmount: z.number().nonnegative().optional(),
  comprehensiveTaxBase: z.number().nonnegative().optional(),
  filingDeadlineType: z.enum(["regular", "sincere"]).optional(),
  settlementMode: z.boolean().optional(),
  actualIncomeTax: z.number().nonnegative().optional(),
});
```

> 엔진 시니어가 `ExcessDividendInput` 타입을 확정하면 키명 정합.

---

## 10. Route Handler 변경 (⑭)

`app/api/calc/gift-deemed/route.ts` — 현재 `excessDividend`·`incomeTaxEquivalent` 직접 매핑 제거, 신규 객체 전달:

```typescript
// Date 변환
const input = coerceDates(body, ["dividendDate"]) as ExcessDividendInput;
// (엔진 ExcessDividendInput 타입에 dividendDate?: Date 확정 후 동기화)
```

---

## 11. 8개 동기화 지점 체크 (DoD 자가점검)

| # | 지점 | 위치 | 이 설계에서의 변경 |
|---|---|---|---|
| ① | 폼 상태 타입 | `shared.tsx:181-182` → 전면 교체 | 8필드 신규, 2필드 폐지 |
| ② | initial value | `shared.tsx:325-326` | 8필드 초기값 추가, 2필드 제거 |
| ③ | normalize | `gift-deemed-api.ts` | 주주 배열 parseAmount/parseDecimal |
| ④ | API 변환 | `gift-deemed-api.ts:231-234` | case "excess_dividend" 전면 교체 |
| ⑤ | UI 위젯 | `other-forms.tsx:15-22` | ExcessDividendFields 전면 재설계 |
| ⑥ | 사이드바 | 해당 없음 | — |
| ⑦ | 결과 카드 | `DeemedGiftResultView.tsx` | A~F 섹션 추가 |
| ⑧ | validate | `gift-deemed-validate.ts:107-108` | case "excess_dividend" 전면 교체 |

API/Route 추가:

| # | 지점 | 위치 | 변경 |
|---|---|---|---|
| ⑫ | Zod 입력 객체 | `validators/gift-deemed-input.ts:164` | excessDividendSchema 전면 교체 |
| ⑬ | fetch body | `gift-deemed-api.ts` buildDeemedGiftInput | 신규 객체 반환 |
| ⑭ | Route 매핑 | `app/api/calc/gift-deemed/route.ts` | dividendDate Date 변환 |

---

## 12. §9 확인 필요 사항 (UI 관련)

Plan §9에서 UI 관련 미확정 사항 5건 중 UI에 직접 영향하는 항목:

1. **🔴 deemed↔calcGiftTax 연결 경로** (§4 Plan):
   - 정산 2-pass는 서버(route handler)에서 `calcGiftTax` 2회 호출이 필요.
   - UI 관점: `DeemedGiftResult`에 `settlement` 필드가 추가되면 UI는 섹션 D를 렌더.
   - UI가 2회 API 호출을 직접 하는 방식(클라이언트 2-pass)은 사용 금지 — 엔진 단일 호출로 처리해야 함.
   - **Do 전 엔진 시니어 설계 확정 필수.**

2. **율표 base 값 정확성**:
   - UI는 결과뷰 `taxRateBreakdown.appliedBracket`에 엔진 echo 값을 그대로 표시.
   - UI가 율표를 자체 계산하지 않음 (UI 자체 계산 ↔ 엔진 dual truth 금지 — memory).

3. **종합과세 ⓐ−ⓑ 소득세율 연도 표**: 엔진이 처리. UI 입력은 `edComprehensiveTaxBase` 1필드.

4. **§47② 합산배제 기존 연계**: UI는 안내 카드만 (계산 외). 엔진 설계 확인 불필요.

5. **신고기한구분(영③1호) UI 필요 여부**:
   - **단정**: UI 입력 필요함. `edFilingDeadlineType` RadioCardGroup으로 입력 필수.
   - 이유: 일반(5.31)/성실(6.30) 신고기한을 사용자가 직접 알고 있는 정보이며 시스템이 자동 판정 불가.

---

## 13. 케이스 매트릭스 C1~C8 UI 분기 전수 확인

| # | giftYear | isOldLaw | edIncomeTaxMode | edSettlementMode | 섹션4·5 | 자동산정박스 | 정산카드(결과) |
|---|---|---|---|---|---|---|---|
| C1 | 2024 | false | "table" | false | 표시 | 표시 | 없음 |
| C2 | 2024 | false | "separate" | false/true | 표시 | 표시 | 있을 수 있음 |
| C3 | 2024 | false | "comprehensive" | true | 표시 | 표시 | 있음 |
| C4 | 2024 | false | "nontaxable" | false | 표시 | 표시 | 없음 |
| C5 | 2019 | true | "table" | false | 숨김 | 표시 | 없음 |
| C6 | 2019 | true | "comprehensive" | false | 숨김 | 표시 | 없음 |
| C7 | 2022 | false | "separate"/종합 | false(영③1호→정산미적용) | 표시 | 표시 | 없음(영③1호) |
| C8 | any | - | any | - | 분기대로 | 표시 | 없음, exclusion 표시 |

---

## 14. 파일 영향 범위 (Do 단계 수정 대상)

| 파일 | 변경 내용 | 추정 변경량 |
|---|---|---|
| `components/calc/deemed-gift/shared.tsx` | DeemedFormState 필드 교체·추가, INITIAL_DEEMED | +30줄, -2줄 |
| `components/calc/deemed-gift/other-forms.tsx` | ExcessDividendFields 전면 재작성 (+ EdShareholderTable 신규) | +200줄, -10줄 |
| `lib/calc/gift-deemed-api.ts` | buildDeemedGiftInput excess case 교체 | +40줄, -8줄 |
| `lib/calc/gift-deemed-validate.ts` | excess_dividend case 교체 | +30줄, -3줄 |
| `lib/validators/gift-deemed-input.ts` | excessDividendSchema 교체 | +25줄, -6줄 |
| `components/calc/results/DeemedGiftResultView.tsx` | 신규 섹션 A~F 추가 | +100줄 |
| `app/api/calc/gift-deemed/route.ts` | dividendDate Date 변환 추가 | +5줄 |

> 800줄 정책: `other-forms.tsx`가 현재 128줄이므로 +200줄 추가 후 약 330줄 — 단일 파일 허용 범위.  
> 단, EdShareholderTable이 복잡하면 `components/calc/deemed-gift/ExcessShareholderTable.tsx`로 분리.

---

## 15. Do 단계 전 엔진 시니어 확정 대기 사항

1. `ExcessDividendInput` 전면 재정의 타입 확정 (shareholders 배열·incomeTaxMode enum·settlement 필드)
2. `DeemedGiftResult`의 excess_dividend 타입 분기 필드 확정 (shareholderBreakdown·taxRateBreakdown·settlement)
3. 정산 2-pass 구현 위치 (route vs 엔진 내부) 확정
4. `dividendDate` 필드 — 공통 `giftDate`와 분리 여부 확정

**엔진 시니어 타입 확정 → 이 설계 문서의 ①④⑫⑭ 섹션 키명 동기화 → Do 착수 순서.**
