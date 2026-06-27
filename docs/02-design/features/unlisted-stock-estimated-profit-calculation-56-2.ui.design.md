# UI 설계 — 비상장주식 추정이익 산출방법 정교화 (상증령 §56② / 구 증권공시세칙 6)

> 계획서: `docs/00-pm/unlisted-stock-estimated-profit-calculation-56-2.plan.md`
> 엔진 설계: `docs/02-design/features/unlisted-stock-estimated-profit-calculation-56-2.engine.design.md`
> 진입점: `components/calc/inheritance/unlisted-stock-v2/EstimatedProfitToggle.tsx` (280줄)
> 결과 카드: `components/calc/inheritance/unlisted-stock-v2/PerShareValuationResultCard.tsx` (515줄)
> 작성일: 2026-06-27
>
> **세목 범위**: 상속·증여 전용 (양도세 제외 확정 — §165④는 §54~56 미준용 자족 규정)
> **1차 구현 범위**: Phase B (영역 D 시점안내 + 영역 E 평가기관 메타) — plan §3 / engine.design §0-2 taxonomy 기준
> **보류/제외**: Phase A(자본환원율 — §54① 고정 10% 유지, 출처 미확정), Phase C(구법 B·C 산식 — deferred), Phase D(양도세 — 스코프 제외)

---

## 0. Context — 현행 UI 상태와 이번 변경 범위

### 0-1. 현행 구현 (Do 전 실측 완료)

- `EstimatedProfitToggle.tsx` (280줄): ToggleCard(violet) + RadioCardGroup(7사유) + CurrencyInput[] 동적 행 + 절차 3요건 chip + 미리보기. **`agencies` UI 없음**.
- 미리보기(useMemo): `applyEstimatedProfit(value, capitalizationRate)` — 2인자, `valuationDate` 미주입 → `evaluationMethod` 미표시.
- `PerShareValuationResultCard.tsx:103~109`: ⑤ 1주당 순손익가치 hint = "§56② 추정이익 평균가액 N원 (기관 N개 평균) ÷ 환원율 N%" — **agencyMeta·evaluationMethod 미표시**.
- `DEFAULT_INPUT` (toggle.tsx:51): `{ reasonCode, agencyEstimates: [0,0], filedWithinDeadline: false, baseDateAndReportWithinDeadline: false, sameYearAsInheritanceOrGift: false }` — `agencies` 필드 없음.

### 0-2. 엔진 시니어 신규 타입 (engine.design.md §3~4)

```ts
// estimated-profit-section-56-2.ts 신규 export
export type AgencyType = "credit_rating" | "accounting" | "tax";
export interface AgencyMeta { type: AgencyType; name: string; }

// EstimatedProfitInput 확장
export interface EstimatedProfitInput {
  // ... 기존 5필드 ...
  agencies?: AgencyMeta[];  // 영역 E 신규 optional
}

// EstimatedProfitResult 확장
export interface EstimatedProfitResult {
  // ... 기존 6필드 ...
  agencyMeta?: AgencyMeta[];
  evaluationMethod?: "current" | "legacy";
  evaluationMethodNote?: string;
}

// applyEstimatedProfit 시그니처: 3번째 파라미터 추가
export function applyEstimatedProfit(
  input: EstimatedProfitInput,
  capRate: number,
  valuationDate?: Date,   // 영역 D 신규 — 현행/구법 시점 안내용, 차단 아님
): EstimatedProfitResult
```

### 0-3. orchestrator 변경 (unlisted-orchestrator.ts)

STEP 5.5 호출부에 `input.evaluationDate` 주입 (1줄):
```ts
// 변경 전: applyEstimatedProfit(input.estimatedProfit, capRate)
// 변경 후: applyEstimatedProfit(input.estimatedProfit, capRate, toOptionalDate(input.evaluationDate) ?? input.evaluationDate)
```

---

## 1. 14개 동기화 지점 — 영역 D·E 신규 필드

> 신규 필드: `agencies?: AgencyMeta[]` (입력), `agencyMeta` / `evaluationMethod` / `evaluationMethodNote` (결과)

### 1-1. 클라이언트 8개 지점

| # | 지점 | 파일 (실측 확인) | 변경 내용 |
|---|------|----------------|---------|
| **①** | **폼 상태 타입** | `EstimatedProfitInput` 타입 — `estimated-profit-section-56-2.ts` (엔진 선처리) | `agencies?: AgencyMeta[]` — 엔진 시니어 추가. UI는 이 타입 그대로 사용 |
| **②** | **initial value** | `EstimatedProfitToggle.tsx:51 DEFAULT_INPUT` | `agencies: undefined` 추가 (현재 누락) |
| **③** | **normalize fallback** | `normalize-restored-form-dates.ts:93~105` `...v2` spread | `agencies`는 `{ type: string; name: string }[]` — Date 필드 없음 → `...v2` spread에 자동 포함. **변경 불필요** |
| **④** | **API 변환** | `lib/calc/inheritance-api.ts:71` `estateItems: input.estateItems` | `estateItems` 배열 전체 spread → 내부 `estimatedProfit.agencies` 자동 포함. **변경 불필요** |
| **⑤** | **UI 위젯** | `EstimatedProfitToggle.tsx` | 기관별 AgencyType 선택 + 기관명 텍스트 입력 추가; `valuationDate?: Date` prop 추가 + 미리보기에서 evaluationMethod 배지 표시 |
| **⑥** | **사이드바** | inheritance/gift 사이드바 | `agencies`는 메타데이터(금액 아님) → 사이드바 합계 영향 없음. **변경 불필요** |
| **⑦** | **결과 카드** | `PerShareValuationResultCard.tsx:103~109` | ⑤ hint에 agencyMeta echo(기관명·유형 목록) + evaluationMethod 배지 추가 |
| **⑧** | **validation** | `lib/calc/inheritance-validate-unlisted.ts` | `agencies` optional — 엔진이 warning만(차단 없음). **별도 validation 불필요**. 기존 Zod superRefine(agencyEstimates.length < 2) 유지 |

### 1-2. API/Route 6개 지점

| # | 지점 | 파일 | 변경 내용 |
|---|------|------|---------|
| **⑨** | **Zod enum 메인** | `unlisted-stock-valuation-v2.schema.ts:197~213` | `estimatedProfit.agencies` optional 배열 추가 (AgencyType enum 정의) |
| **⑩** | **Zod 컴패니언** | 해당 없음 | — |
| **⑪** | **Date fallback** | 해당 없음 | `agencies`는 string 필드만 — Date 처리 불필요 |
| **⑫ ★TS 미감지** | **Zod 입력 정의** | `unlisted-stock-valuation-v2.schema.ts` `estimatedProfit` 객체 | `agencies: z.array(z.object({ type: z.enum(["credit_rating","accounting","tax"]), name: z.string() })).optional()` 추가 (**`name`은 min(1) 금지 — 빈 기관명 비차단**; §2 line 102·§6 line 407·§8 line 438·engine.design §9와 통일. CLAUDE.md ⑧ "UI 통과↔validate 차단 모순 금지"). **grep 자가 점검 필수** |
| **⑬ ★TS 미감지** | **body spread** | `inheritance-api.ts:71` `estateItems: input.estateItems` | 배열 전체 pass → 내부 중첩 `agencies` 자동 포함. **별도 변경 없으나 grep으로 `agencies`가 schema에 등장 확인** |
| **⑭ ★TS 미감지** | **Route 매핑** | `app/api/calc/inheritance/route.ts:74` `estateItems: parsedData.estateItems as ...` | `estateItems` 전체 cast → 중첩 `agencies` 자동 포함. **별도 변경 없으나 grep 확인** |

⚠️ **증여세 동일 경로**: `giftTaxInputSchema`의 `giftItems: z.array(estateItemSchema)` → `estateItemSchema`가 `unlistedStockValuationV2Schema`를 포함 → ⑫ 변경이 증여세에도 자동 적용.

---

## 2. Silent fallback / 자동 안분 점검

| 필드 | 빈값 처리 | 정책 결정 |
|------|----------|---------|
| `agencies` 미입력 | `agencyMeta=undefined` → warning 없음 | 완전 optional. **자동 fallback 없음** |
| `valuationDate` 미주입 | `evaluationMethod=undefined` → 시점 배지 미표시 | 차단 아님. **자동 fallback 없음** |
| `agencies.length !== agencyEstimates.length` | 엔진 warning만 | warning만, applied 판정 불변 |
| `agencies[i].name` 빈 문자열 | `agencyMeta` echo + 엔진 warning | 차단 없음(warning) — Zod `name: z.string()` (min(1) 제거) |

`feedback_no_silent_apportion_fallback.md` 준수 — 어떤 필드도 자동 안분/자동 채움 없음.

---

## 3. Cross-field 동기화 — useEffect 사용 금지 사전 선언

| 트리거 필드 | 갱신 대상 | 구현 패턴 |
|------------|---------|---------|
| `agencyEstimates` 항목 추가/삭제 | `agencies` 배열 길이 | `handleAddAgency`/`handleRemoveAgency` onChange 동기화 (useEffect 금지). agencies 길이 != estimates 길이 → warning만(차단 아님) |
| `valuationDate` (prop) | `evaluationMethod` 배지 | useMemo 파생값(preview) — store write 금지 |

`feedback_useeffect_store_mirror_forbidden.md` 준수.

---

## 4. UI 입력 위젯 설계 (⑤) — EstimatedProfitToggle.tsx 수정

### 4-1. 엔진 계산 순서 = UI 위젯 순서 확인

엔진 `applyEstimatedProfit` 계산 순서:
1. 4요건 AND 검증 (hasTwoAgencies + proceduralOk)
2. estimatedProfitAverage = floor(Σ agencyEstimates / n)
3. perShareIncomeValue = floor(estimatedProfitAverage / capRate)
4. agencyMeta echo + evaluationMethod 분기 (신규)

UI 위젯 순서(기존 유지 + 신규 추가):
1. §17의3① 사유 RadioCardGroup (reasonCode) — 기존 ①
2. 동적 기관 행 (agencyEstimates[] + agencies[]) — 기존 ② 확장 **★신규**
3. 절차 3요건 chip (§56② 2·3·4호) — 기존 ③
4. 미리보기 (평균가액 ÷ 환원율 + **evaluationMethod 배지** 신규) — 기존 ④ 확장

### 4-2. EstimatedProfitToggleProps 확장

```ts
export interface EstimatedProfitToggleProps {
  value: EstimatedProfitInput | undefined;
  onChange: (next: EstimatedProfitInput | undefined) => void;
  capitalizationRate?: number;
  sectionNum?: number;
  /**
   * 영역 D — 시점 안내용 평가기준일.
   * UnlistedStockV2Card의 effectiveInput.evaluationDate 을 주입.
   * undefined 시 evaluationMethod 배지 미표시 (차단 아님).
   */
  evaluationDate?: Date;  // 신규
}
```

`UnlistedStockV2Card.tsx` 호출부 수정:
```tsx
<EstimatedProfitToggle
  value={input.estimatedProfit}
  onChange={(next) => wrappedOnChange({ ...input, estimatedProfit: next })}
  capitalizationRate={input.capitalizationRate}
  sectionNum={4}
  evaluationDate={effectiveInput.evaluationDate}   // 신규
/>
```

### 4-3. DEFAULT_INPUT 수정 (② initial)

```ts
// 기존
const DEFAULT_INPUT: EstimatedProfitInput = {
  reasonCode: "merger_split_business_change",
  agencyEstimates: [0, 0],
  filedWithinDeadline: false,
  baseDateAndReportWithinDeadline: false,
  sameYearAsInheritanceOrGift: false,
};

// 변경 후
const DEFAULT_INPUT: EstimatedProfitInput = {
  reasonCode: "merger_split_business_change",
  agencyEstimates: [0, 0],
  agencies: undefined,  // 신규 — optional, 미입력 OK
  filedWithinDeadline: false,
  baseDateAndReportWithinDeadline: false,
  sameYearAsInheritanceOrGift: false,
};
```

### 4-4. 기관 행 UI 확장 — agencyEstimates[] 와 agencies[] 1:1 표시

기존 행(CurrencyInput만) → 3-필드 행(유형 선택 + 기관명 + 추정이익)으로 확장.

**agencies 배열 동기화**: `handleAddAgency`에서 `agencies`도 동시 확장, `handleRemoveAgency`에서 동시 제거. 사용자가 유형·이름을 선택하면 `agencies[i]`를 업데이트.

```
┌ 평가기관 1 ─────────────────────────────────────── (violet 서브) ┐
│  유형:  ○ 신용평가전문기관  ○ 회계법인  ○ 세무법인  (RadioCardGroup inline) │
│  기관명: [____________________________________________] (text input)        │
│  1주당 추정이익: [CurrencyInput] (원, 환원 전 금액)                          │
└──────────────────────────────────────────────────────────────────┘
┌ 평가기관 2 ─────────────────────────────────────── (violet 서브) ┐
│  유형:  ○ 신용평가전문기관  ○ 회계법인  ○ 세무법인                           │
│  기관명: [____________________________________________]                      │
│  1주당 추정이익: [CurrencyInput]                     [삭제] (≥3개 시)        │
└──────────────────────────────────────────────────────────────────┘
[+ 평가기관 추가]
```

**기관 유형 라벨** (law-cite 주석):
```
credit_rating: "신용평가전문기관 (자본시장법 §335의3 인가)" — 상증규 §17의3③
accounting:    "공인회계사법에 따른 회계법인"
tax:           "세무사법에 따른 세무법인"
```

**유형 선택**: `RadioCardGroup layout="inline"` — 3 옵션, violet tone. agencies가 undefined인 경우(기존 데이터 하위호환) 기관명/유형 입력란은 표시하되 초기값 미선택. `onChange` 시 `agencies` 배열 초기화하여 write.

**기관명 입력**: `<input type="text">` (포커스 시 전체선택은 `SelectOnFocusProvider` 전역 자동). `hideLabel` 패턴으로 FieldCard 내 라벨 숨김. placeholder: "기관명 입력 (예: NICE신용평가, 삼일회계법인)".

**선택/미선택 fallback**: `agencies` 미입력 시 해당 행의 유형/기관명 빈 값 → warning(엔진 차단 없음). validation에서 차단 불필요(optional).

**agencies 초기화 로직** — `handleAddAgency` 수정:
```ts
const handleAddAgency = () => {
  if (!value) return;
  onChange({
    ...value,
    agencyEstimates: [...value.agencyEstimates, 0],
    agencies: value.agencies
      ? [...value.agencies, { type: "credit_rating", name: "" }]
      : undefined,  // agencies가 undefined이면 유지 (기존 데이터 하위호환)
  });
};
```

agencies를 처음 입력하는 시점(유형 또는 이름 선택):
```ts
const handleAgencyTypeChange = (idx: number, type: AgencyType) => {
  if (!value) return;
  const currentAgencies = value.agencies ?? value.agencyEstimates.map(() => ({ type: "credit_rating" as AgencyType, name: "" }));
  const next = [...currentAgencies];
  next[idx] = { ...next[idx], type };
  onChange({ ...value, agencies: next });
};
const handleAgencyNameChange = (idx: number, name: string) => {
  if (!value) return;
  const currentAgencies = value.agencies ?? value.agencyEstimates.map(() => ({ type: "credit_rating" as AgencyType, name: "" }));
  const next = [...currentAgencies];
  next[idx] = { ...next[idx], name };
  onChange({ ...value, agencies: next });
};
```

> 🟠 **정정 (residual — echo 잡음 방지)**: 위 fallback은 `agencies`를 `agencyEstimates`와 **인덱스 정합**시키기 위해 전체 행을 패딩한다(희소 배열로 두면 결과 카드에서 `agencyMeta[i]` undefined 접근 위험). 단, 미편집 형제 행이 `type:"credit_rating"/name:""`로 실체화되어 결과 카드에 `(기관명 미입력)` echo가 남는 문제는 **결과 카드 echo 측에서 "type 미선택(=기본값 유지) AND name 빈" 행을 필터링**하여 차단한다(아래 §6 echo 정정). 비차단 정책(⑫·§6·§8)이므로 validation 차단은 발생하지 않으며, echo 필터는 표시 잡음만 제거한다.

### 4-5. 미리보기 확장 — evaluationMethod 배지 + agencyCount 확인

```ts
// useMemo 수정 — evaluationDate prop 주입
const preview = useMemo(
  () => (value ? applyEstimatedProfit(value, capitalizationRate, evaluationDate) : null),
  [value, capitalizationRate, evaluationDate],
);
```

미리보기 영역 추가 표시:
```
추정이익 평균가액 {N}원 (기관 {n}개 평균) ÷ 환원율 10% = 1주당 순손익가치 {M}원
[현행] 평가기준일 2012.12.6 이후 — 현금흐름할인모형·배당할인모형 등 미래 수익가치 모형 적용 추정이익 입력
↑ or ↑
[구법 안내] 평가기준일이 2012.12.5 이전입니다. 구법 산식이 적용될 수 있습니다. 세무사 확인 필요.
↑ evaluationDate 없으면 배지 없음
```

배지 스타일:
- `"current"`: `rounded-sm bg-violet-100 text-violet-700 border border-violet-300 px-1.5 py-0.5 text-[10px] font-medium` 텍스트: "현행"
- `"legacy"`: `rounded-sm bg-amber-100 text-amber-700 border border-amber-300 px-1.5 py-0.5 text-[10px] font-medium` 텍스트: "구법 안내"

`evaluationMethodNote` 표시: 배지 우측 인라인 또는 아래 줄. 구법(legacy) 시 `text-amber-700` 경고 박스.

### 4-6. 길이 불일치 warning 표시 (agencies ≠ estimates)

엔진 result `warnings[]`에 "기관 메타 수(N)와 추정이익 수(M)가 다릅니다" warning이 포함될 때:
- 미리보기 박스 하단에 `⚠️ {warning}` 표시 (rose-toned 인라인)
- **차단 아님** — 입력 계속 가능

### 4-7. 800줄 정책 점검

`EstimatedProfitToggle.tsx` 현재 280줄. 기관 유형/이름 입력 추가 예상 +40~60줄 → **340줄 이하 예상**, 800줄 정책 위반 없음. Do 단계에서 실측 필요.

---

## 5. 결과 카드 설계 (⑦) — PerShareValuationResultCard.tsx

### 5-1. ⑤ 1주당 순손익가치 hint 분기 (lines 103~109 확장)

현행 hint:
```ts
result.estimatedProfitResult?.applied
  ? `§56② 추정이익 평균가액 ${N}원 (기관 ${n}개 평균) ÷ 환원율 ${R}%`
  : `최근 3년 가중평균 ${W}원 ÷ 환원율 ${R}%`
```

변경 후:
```ts
result.estimatedProfitResult?.applied
  ? buildEstimatedProfitHint(result.estimatedProfitResult, result.capitalizationRate)   // 신규 헬퍼 — capRate는 최상위 결과에서 주입
  : `최근 3년 가중평균 ${W}원 ÷ 환원율 ${R}%`
```

헬퍼 `buildEstimatedProfitHint` (컴포넌트 내부 순수함수):
```ts
function buildEstimatedProfitHint(r: EstimatedProfitResult, capRate: number): string {
  // capRate는 최상위 UnlistedStockValuationResult.capitalizationRate (현행 카드 line 107 패턴).
  // EstimatedProfitResult 타입에는 capitalizationRate 필드가 없음 → 부모에서 주입. ?? 0.1 하드코딩 금지.
  const base = `§56② 추정이익 평균가액 ${fmt(r.estimatedProfitAverage)}원 (기관 ${r.agencyCount}개 평균) ÷ 환원율 ${(capRate * 100).toFixed(0)}%`;
  // agencies가 있으면 기관 유형·이름 목록 병렬 표시
  if (r.agencyMeta && r.agencyMeta.length > 0) {
    const agencyList = r.agencyMeta.map((a) => `${AGENCY_TYPE_LABEL[a.type]} ${a.name}`).join(" / ");
    return `${base} — ${agencyList}`;
  }
  return base;
}
```

### 5-2. evaluationMethod 배지 표시 (§56② notice 영역 추가)

`result.estimatedProfitResult.applied=true` + `evaluationMethod` 있을 때 notice 박스 하단 추가:

```tsx
{result.estimatedProfitResult?.evaluationMethod && (
  <div
    className={`mt-1 flex items-center gap-1.5 text-[10px] ${
      result.estimatedProfitResult.evaluationMethod === "legacy"
        ? "text-amber-700"
        : "text-violet-600"
    }`}
    data-testid="result-evaluation-method-badge"
  >
    <span className={`rounded-sm px-1.5 py-0.5 font-medium border ${
      result.estimatedProfitResult.evaluationMethod === "legacy"
        ? "bg-amber-100 border-amber-300 text-amber-700"
        : "bg-violet-100 border-violet-300 text-violet-700"
    }`}>
      {result.estimatedProfitResult.evaluationMethod === "legacy" ? "구법 안내" : "현행"}
    </span>
    <span>{result.estimatedProfitResult.evaluationMethodNote}</span>
  </div>
)}
```

### 5-3. agencyMeta 기관 목록 표시

notice 박스 내 `applied=true` 섹션 하단 추가:
```tsx
{(() => {
  // echo 잡음 필터 — 미편집 형제 행(기본 type + name 빈)은 표시 제외 (§4-4 정정)
  const shown = (result.estimatedProfitResult.agencyMeta ?? [])
    .filter((a) => a.name.trim() !== "" || a.type !== "credit_rating");
  return shown.length > 0 ? (
  <div className="mt-1 space-y-0.5">
    {shown.map((a, i) => (
      <p key={i} className="text-[10px] leading-snug">
        · 기관 {i+1}: {AGENCY_TYPE_LABEL[a.type]} — {a.name || "(기관명 미입력)"}
      </p>
    ))}
  </div>
  ) : null;
})()}
```

**AGENCY_TYPE_LABEL** (컴포넌트 파일 상단 상수):
```ts
const AGENCY_TYPE_LABEL: Record<AgencyType, string> = {
  credit_rating: "신용평가전문기관",
  accounting: "회계법인",
  tax: "세무법인",
};
```

### 5-4. warnings 표시 확장 (기존 경로 재사용)

기존 `result.estimatedProfitResult.warnings.map(...)` 표시 영역이 이미 있으므로 (lines 133~137) 추가 구현 불필요. agencies 불일치 warning도 자동 표시됨.

### 5-5. 산식 표현 (한국어 풀어쓰기 — feedback_result_view_korean_formula)

결과 카드 ⑤ 행의 hint 표현:
```
§56② 추정이익 평균가액 1,200원 (신용평가전문기관 NICE, 회계법인 삼일 — 2개 기관 평균)
  ÷ §54① 순손익가치환원율 10% (상증규 §17 고정) = 1주당 순손익가치 12,000원
```

`floor()` 묵시, `Math.round()` 표현 금지. 변수 약어(`P_F` 등) 금지.

### 5-6. 800줄 정책 점검

`PerShareValuationResultCard.tsx` 현재 515줄. 추가 예상 +30~50줄 → **565줄 이하 예상**, 800줄 정책 위반 없음. Do 단계에서 실측 필요.

---

## 6. Zod 스키마 변경 (⑫) — unlisted-stock-valuation-v2.schema.ts

```ts
// lines 197~213 기존 estimatedProfit 객체에 agencies 필드 추가
estimatedProfit: z
  .object({
    reasonCode: z.enum([...]),
    agencyEstimates: z.array(z.number().finite()),
    filedWithinDeadline: z.boolean(),
    baseDateAndReportWithinDeadline: z.boolean(),
    sameYearAsInheritanceOrGift: z.boolean(),
    // 영역 E 신규 — optional, 차단 없음
    agencies: z
      .array(
        z.object({
          type: z.enum(["credit_rating", "accounting", "tax"]),
          name: z.string(),  // min(1) 제거 — 빈 기관명은 엔진 warning만(차단 없음), 완전 optional 정책 일관
        }),
      )
      .optional(),
  })
  .optional(),
```

기존 superRefine(agencyEstimates.length < 2) 유지. `agencies.length` 검증은 엔진 warning으로만(차단 아님).

---

## 7. 법령 상수 추가 (inheritance-gift.ts VALUATION)

엔진 설계 §7 참조. UI 측 import 예시:
```ts
import { VALUATION } from "@/lib/tax-engine/legal-codes/inheritance-gift";
// VALUATION.UNLISTED_ESTIMATED_AGENCY_TYPE → "상증규 §17의3③"
// VALUATION.UNLISTED_ESTIMATED_INCOME_FORMULA → "상증규 §17의3④"
```

FieldCard hint·LawArticleModal 참조 시 법령 리터럴 직접 작성 금지 — 상수 사용.

---

## 8. Validation (⑧)

| 규칙 | 위치 | 방식 |
|------|------|------|
| `agencyEstimates.length < 2` | Zod superRefine (기존 :319) | 차단 (기존 유지) |
| `agencies.length !== agencyEstimates.length` | 엔진 warning only | warning 표시, 차단 없음 |
| `agencies[i].name` 빈 문자열 | 엔진 warning only | warning 표시, 차단 없음 (Zod `name: z.string()` — min(1) 없음) |
| `agencies[i].type` 유효값 | Zod `z.enum(["credit_rating","accounting","tax"])` | parse 실패 (차단) |

`feedback_validation_sync_8th_point.md` 동기화: UI fallback(agencies optional) → validation도 optional 취급(차단 없음) — 일관.

---

## 9. 사이드바 (⑥)

`agencies`는 금액이 아닌 메타데이터. 사이드바 합계 표시 대상 아님. `feedback_pdca_session_efficiency.md`: 사이드바는 계산 가능 항목만.

---

## 10. 케이스 매트릭스 — UI 분기 전수

> 영역 D·E 1차 구현 케이스. 기존 EP-1~EP-9-3 회귀 케이스는 변경 없음.

| # | 시나리오 | UI 입력 | 예상 표시 |
|---|---------|--------|---------|
| UI-DE-1 | agencies 미입력 + agencyEstimates 2개 입력 | 유형/이름 선택 안 함 | 미리보기: "기관 2개 평균" (기관명 없음), agencyMeta=undefined |
| UI-DE-2 | agencies 2개 입력(유형+이름) + agencyEstimates 2개 | 유형·이름 모두 입력 | 미리보기: "신용평가전문기관 NICE / 회계법인 삼일", warning 없음 |
| UI-DE-3 | agencies 3개 + agencyEstimates 2개 (불일치) | 기관 3개 선택, 추정이익 2개 | ⚠️ warning "기관 메타 수(3)와 추정이익 수(2)가 다릅니다", applied 유지 |
| UI-DE-4 | valuationDate=2012-12-05 주입 | evaluationDate prop으로 전달 | [구법 안내] 배지 + evaluationMethodNote |
| UI-DE-5 | valuationDate=2012-12-06 주입 | evaluationDate prop으로 전달 | [현행] 배지 + note |
| UI-DE-6 | valuationDate 없음 (undefined) | effectiveInput.evaluationDate=undefined | 배지 없음 |
| UI-DE-7 | 기관명 빈 문자열 입력 → 계산 시도 | agencies[0].name="" | 차단 없음 — Zod 통과, agencyMeta echo 시 "(기관명 미입력)" 표시 + 엔진 warning |
| UI-DE-R | 기존 agencyEstimates only 데이터 (agencies=undefined) | 복원 후 Toggle ON | 기관 행 표시 + 유형/이름 빈값, 기존 추정이익 보존 |

---

## 11. anchor 기대값 (UI 관점 — 엔진 anchor DE-1~DE-8와 쌍)

**UI-DE-2 미리보기 표시** (테스트 목적, E2E anchor):
```
input.agencies = [
  { type: "credit_rating", name: "NICE신용평가" },
  { type: "accounting",    name: "삼일회계법인" },
]
input.agencyEstimates = [1_000, 1_400]
→ 미리보기: "추정이익 평균가액 1,200원 (기관 2개 평균) ÷ 환원율 10% = 1주당 순손익가치 12,000원"
→ agencyMeta 표시: "· 기관 1: 신용평가전문기관 — NICE신용평가 / · 기관 2: 회계법인 — 삼일회계법인"
```

**UI-DE-4 구법 안내 배지** (valuationDate=2012-12-05):
```
→ [구법 안내] "평가기준일이 2012.12.5 이전입니다. 구법(연도별 주당추정이익 산식 + 3:2 가중평균)이 적용될 수 있습니다."
→ warning 포함 표시 (엔진 warning 배열)
```

---

## 12. E2E 시나리오 (`e2e/unlisted-stock-estimated-profit-agencies.spec.ts`)

패턴: `feedback_browser_verify_with_playwright.md` — `e2e/*.spec.ts` 신설.

1. 상속세 비상장주식 V2 정식평가 → EstimatedProfitToggle ON
2. §17의3① 사유 선택 (예: 합병·분할 3호)
3. 기관 1 유형 "신용평가전문기관" + 기관명 "NICE신용평가" + 추정이익 1,000원 입력
4. 기관 2 유형 "회계법인" + 기관명 "삼일" + 추정이익 1,400원 입력
5. 절차 3요건 체크
6. 미리보기 확인: "추정이익 평균가액 1,200원 (기관 2개 평균) ÷ 환원율 10% = 1주당 순손익가치 12,000원"
7. 전체 계산 → 결과 카드 ⑤ 확인: agencyMeta 표시 "신용평가전문기관 NICE신용평가 / 회계법인 삼일"
8. 기관 3 추가(+ 평가기관 추가) → agencies warning 표시 확인
9. (valuationDate있는 경우) evaluationMethod 배지 확인

```ts
// data-testid 목록 (신규)
"estimated-profit-agency-type-{idx}"   // RadioCardGroup role=radiogroup
"estimated-profit-agency-name-{idx}"   // text input
"result-evaluation-method-badge"       // 결과 카드 배지
"result-agency-meta-list"              // 기관 목록
```

---

## 13. 8개 동기화 지점 점검 체크리스트 (Do 완료 전 자가 점검)

- [ ] ① `DEFAULT_INPUT`에 `agencies: undefined` 추가 확인
- [ ] ② `EstimatedProfitToggleProps`에 `evaluationDate?: Date` 추가 확인
- [ ] ③ `normalize-restored-form-dates.ts` — `agencies` passthrough 확인 (`...v2` spread 내 estmatedProfit 포함 여부 grep)
- [ ] ④ `inheritance-api.ts` — `estateItems` 전체 spread로 `agencies` 자동 포함 확인
- [ ] ⑤ `EstimatedProfitToggle.tsx` — 기관 유형 RadioCardGroup + 기관명 input + evaluationMethod 배지 미리보기 구현
- [ ] ⑥ 사이드바 — 변경 없음 확인
- [ ] ⑦ `PerShareValuationResultCard.tsx` — agencyMeta 기관 목록 + evaluationMethod 배지 구현
- [ ] ⑧ validation — agencies optional, 차단 없음(엔진 warning만) 동기화 확인
- [ ] ⑨/⑫ `unlisted-stock-valuation-v2.schema.ts` — `estimatedProfit.agencies` Zod 정의 추가
- [ ] ⑫ grep 자가 점검: `agencies` 가 `schema.ts` + `inheritance-api.ts(에 estateItems로 간접)` + `route.ts(에 estateItems로 간접)` 모두 경로상 존재 확인
- [ ] `npx tsc --noEmit` 오류 0건
- [ ] `npx vitest run __tests__/tax-engine/property-valuation/estimated-profit-section-56-2.test.ts` — 기존 EP-1~EP-9-3 회귀 + 신규 DE-1~DE-8 통과
- [ ] 브라우저 수동 확인 또는 미수행 명시
- [ ] 800줄 정책: `EstimatedProfitToggle.tsx`(현 280줄 + 예상 +60줄) + `PerShareValuationResultCard.tsx`(현 515줄 + 예상 +40줄) 모두 800줄 이하 확인

---

## 14. 보류·제외 항목 (UI 측)

| 항목 | 상태 | 사유 |
|------|------|------|
| Phase A — 자본환원율 "차입금×1.5" UI | 보류 | §54① capRate = 상증규 §17 연 10% 고정. UI 입력 슬롯 추가 금지. 출처(구 증권공시세칙 수익가치용) 미확정. |
| Phase C — 구법 B·C 보조 계산 패널 | deferred | 실 사례 1건 확보 후 착수. B·C deferred 착수 시: `pretaxContinuingIncome`·`preferredDividendAdj`·`corporateTax` = CurrencyInput; `yearEndShares`(주) = 정수 입력(`DecimalInput`+`parseDecimal`후 parseInt). 보조계산기 결과 → `agencyEstimates` 주입(엔진 단일 소스 유지). ≥2 정합 필수. |
| Phase D — 양도세 UI 연결 | 스코프 제외 | §165④ 자족 규정. `transferYearNetIncomePerShare` 등 양도세 순손익 필드에 추정이익 갈음 주입 금지. |
| 평가기관별 자체 수익가치 모형 입력 (B·C deferred) | deferred | 현행법(2012.12.6+): 평가기관이 자체 모형으로 산출한 1주당 추정이익 직접 입력. 구법 산식(B/C)은 deferred 완료 후 보조계산기 패널로만 제공. |

---

## 15. 협력 에이전트 통보

| 대상 | 통보 내용 |
|------|---------|
| `inheritance-gift-tax-senior` | 엔진: `AgencyType`, `AgencyMeta`, `EstimatedProfitInput.agencies?`, `EstimatedProfitResult` 3필드, `applyEstimatedProfit` 3번째 파라미터 추가. Zod ⑫ 추가 필요. |
| `transfer-tax-ui-senior` | 영향 없음 (§165④ 자족 규정 — 양도세 스코프 제외 확정) |
| `inheritance-valuation-senior` | `unlisted-orchestrator.ts` STEP 5.5 3번째 파라미터 추가 (1줄). |
| `inheritance-gift-tax-qa` | DE 케이스 회귀 검증. |

---

## 법령 검증 상태 (추정 금지 준수)

| 조문 | 상태 | 내용 |
|------|------|------|
| 상증령 §56② 4요건 | 검증됨 (engine.design §1-1) | 4요건 AND — 기존 구현 유지 |
| 상증규 §17 환원율 10% | 검증됨 (plan §결정2) | KoreanLaw mst=284609, 연 100분의 10 고정값. capRate 변경 금지 |
| 상증규 §17의3③ 신용평가전문기관 | 검증됨 (engine.design §1-3) | 자본시장법 §335의3 인가 |
| 상증규 §17의3④ 추정이익 평균가액 정의 | 검증됨 (engine.design §1-4) | 수익가치 × §54① 환원율 — 환원율 상쇄 전제 |
| 소득세법 시행령 §165④ 양도세 자족 규정 | 검증됨 (plan §결정1) | §54~56 미준용 — 양도세 스코프 제외 근거 |
| 구 증권공시세칙 6 부칙 (임계 날짜 2012-12-06) | 확인 필요 | 교재 이미지 기반. KoreanLaw 검증 불가(폐지 추정). 엔진 안내 전용, 차단 금지. 주석 "확인 필요" 명시 필수. |
| "차입금 가중평균이자율 × 1.5" 자본환원율 출처 | 미확정 | 1차 법령 근거 미확정. UI 도입 금지. |
