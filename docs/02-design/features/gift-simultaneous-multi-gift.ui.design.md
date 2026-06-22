# 동시증여 다중 건 세액 계산 — UI 설계

> 계획서: `docs/00-pm/gift-simultaneous-multi-gift.plan.md`
> 엔진 설계: `docs/02-design/features/gift-simultaneous-multi-gift.engine.design.md`
> 작성일: 2026-06-22
> 브랜치: `feat/gift-simultaneous-multi-gift`

---

## 0. UI 핵심 결정 요약

| 결정 | 내용 | 근거 |
|---|---|---|
| 동시증여 토글 위치 | `GiftCreditChecklist.tsx:277` 기존 ToggleCard 교체 | 계획서 §6 + 실측 |
| 추가 건 카드 방식 | `SimultaneousGiftCard` (신규 컴포넌트, 800줄 분리) | 계획서 결정 D-4 |
| 동일 그룹 차단 시점 | ⑧ validateStep step=3에서 `isSameDonorGroup` 비교 + ⑤ 카드 추가 직후 경고 | 계획서 결정 D-2 |
| GiftSubForm 타입 | `Omit<FormState, "simultaneousGiftForms">` (FormState 재사용) | 엔진 설계 D-1 권장안 |
| 사이드바 | 해당 없음 (증여세 마법사 사이드바 합계 미사용) | 계획서 §8, 실측 |
| 결과뷰 확장 | `GiftTaxResultView` props + `simultaneousResults?: GiftTaxResult[]` | 계획서 §7 |
| 선택 출력(D-5) | 1차: "동시증여 신고서 전체" 단일 토글(`simultaneous-filing-10`) | 계획서 §11 D-5 |
| §53의2 다건 배분(D-3) | 각 추가 건에서 독립 `priorUsedMarriageBirthDeduction` 직접 입력 | 엔진 설계 D-3 |
| 기존 simultaneousGifts 하위호환(D-6) | ✅ **교체(폐기) 확정**(2026-06-22) — 간이 ToggleCard를 완전 입력으로 대체. 저장 데이터는 store migration 흡수 | 확정 |

---

## 1. 사용자 시나리오·플로우

### 1.1 시나리오 A — 부모 + 조부모 동시증여 (핵심 시나리오)

```
[Step0] 수증자 정보 + 증여일 + donor=father 선택
  ↓
[Step1] 증여재산 입력 (아파트 130,000,000원)
  ↓
[Step2] 비과세·사전증여 입력
  ↓
[Step3] 공제·세액공제 (GiftCreditChecklist)
  기존 "동시증여 안분" ToggleCard(간이)를 신규 ToggleCard(완전)로 교체
  ──────────────────────────────────────────────────────
  [동시증여 안분 토글 ON]
    "같은 날 다른 분으로부터도 받으셨나요?"
    → "1단계(관계)부터 입력하세요" 안내 카드 (amber tone)
    [+ 동시증여 추가] 버튼
      → SimultaneousGiftCard 펼침 (건 1)
        ① donor 관계 select (DONOR_OPTIONS 8종)
        ② 증여재산 (EstateItemTableView 재사용)
        ③ 비과세·사전증여 (ExemptionChecklist + PriorGiftInput 재사용)
        ④ 공제 설정 (GiftCreditChecklist 재사용, tone 변경)
        ⑤ [건 삭제] 버튼 (rose-600)
      → 동일 그룹 검사 (donor=grandparent → 그룹 B ≠ 그룹 A 통과)
    [+ 동시증여 추가] 클릭 시 동일 그룹이면 차단 경고
  ──────────────────────────────────────────────────────
  ↓
[계산] API 호출 → calcSimultaneousGifts([건0, 건1])
  ↓
[결과] GiftTaxResultView
  건0 별지 제10호서식 + "조부모로부터 — 70,000,000" 헤더 + 건1 별지
  + 수증자 총 납부세액 합계 카드
```

### 1.2 시나리오 B — 부 + 모 동시증여 (동일 그룹 차단)

```
건0 donor=father → Step3 동시증여 토글 ON → [+ 동시증여 추가]
  → donor=mother 선택 → 차단 팝업:
    "부와 모는 상증법 §47② 동일인 그룹(부모=그룹 A)입니다.
     동일인의 증여는 현재 신고 증여재산에 합산하세요."
  → 추가 차단 (SimultaneousGiftCard 생성 안 됨)
```

### 1.3 시나리오 C — 부모 + 직계비속 동시증여 (완전 별도)

```
건0 donor=father → 건1 donor=lineal_descendant
  → 공제그룹 다름(adult ≠ descendant) → 안분 없이 각 5천만원 공제
  → 결과: 별지 2개, 합계 카드
```

---

## 2. 8개 UI 동기화 지점 (①~⑧)

### ① FormState 타입 변경

**파일**: `components/calc/gift-tax-form-shared.tsx:83` (실측)

기존 `simultaneousGifts` 필드 유지(하위호환) + 신규 필드 추가:

```ts
// gift-tax-form-shared.tsx — FormState 인터페이스 83번 줄 이후에 추가
/**
 * 동시증여 추가 건 배열 (신규 완전 입력 방식, §46①2호)
 * - undefined: 동시증여 없음 (토글 OFF)
 * - []:        토글 ON 빈 상태 (아직 추가 전)
 * - [...]:     데이터 있음
 *
 * 기존 simultaneousGifts(간이)는 하위호환을 위해 병행 유지.
 * simultaneousGiftForms가 있으면 완전 경로 우선.
 */
simultaneousGiftForms?: GiftSubForm[];
```

`GiftSubForm` 타입 정의(동일 파일 또는 `gift-tax-form-shared.tsx` 상단):

```ts
// FormState 재사용 — 재귀 방지를 위해 Omit<FormState, "simultaneousGiftForms">
export type GiftSubForm = Omit<FormState, "simultaneousGiftForms">;
```

**변경 사유**: `GiftSubForm = Omit<FormState, "simultaneousGiftForms">` 로 선언하면 `buildGiftTaxInput(subForm as FormState)` 호출로 ④ API 변환 로직 중복 없음. `result`·`step` 등 UI-only 필드는 엔진 변환 시 무시됨 (엔진 설계 D-1 권장안).

### ② INITIAL_FORM 갱신

**파일**: `components/calc/gift-tax-form-shared.tsx:119` (실측)

```ts
export const INITIAL_FORM: FormState = {
  // ... 기존 필드 전부 유지 ...
  simultaneousGiftForms: undefined,   // 추가 (3-state OFF)
  // 기존 simultaneousGifts: undefined 도 유지
};
```

### ③ normalize fallback

**파일**: `lib/stores/calc-wizard-migration.ts` (Date 복원)

동시증여 추가 건에는 비상장주식 `valuationDate`(Date 타입) 등이 포함될 수 있음. sessionStorage 복원 시 ISO string → Date 변환 필요.

```ts
// normalize 함수 또는 migrateLegacyForm 내부에 추가
if (form.simultaneousGiftForms) {
  form.simultaneousGiftForms = form.simultaneousGiftForms.map((sub) =>
    normalizeDatesInSubForm(sub)  // 비상장주식 valuationDate 등 복원
  );
}
```

단, GiftSubForm이 FormState 재사용이므로 기존 normalizeRestoredFormDates를 재활용 가능.

### ④ API 변환

**파일**: `lib/calc/gift-api.ts` (현행 `buildGiftTaxInput` `:41` 확인)

신규 함수 `buildSimultaneousGiftInputs` 추가:

```ts
// gift-api.ts — 신규 함수 (엔진 설계 공개 계약 §2)
/**
 * FormState(건 0) + simultaneousGiftForms(건 1..) → GiftTaxInput[] 변환
 * ④ API 변환 지점. buildGiftTaxInput을 내부에서 N번 호출.
 * @returns [건0, ...추가건] GiftTaxInput 배열
 */
export function buildSimultaneousGiftInputs(form: FormState): GiftTaxInput[] {
  const base = buildGiftTaxInput(form);
  if (!form.simultaneousGiftForms || form.simultaneousGiftForms.length === 0) {
    return [base];
  }
  const additional = form.simultaneousGiftForms.map((sub) =>
    buildGiftTaxInput(sub as FormState)
  );
  return [base, ...additional];
}
```

**callGiftTaxAPI body spread (⑬)**: `lib/calc/gift-api.ts` 의 fetch body 에 `simultaneousGiftForms` 직렬화 추가 필요 (TS 미감지 → grep 자가 점검).

### ⑤ UI 위젯

**위치**: `components/calc/gift/GiftCreditChecklist.tsx:274~350` (동시증여 ToggleCard 기존 영역)

#### 기존 ToggleCard 교체 방식

✅ D-6 **교체(폐기) 확정**(2026-06-22). **기존 간이 ToggleCard를 신규 완전 ToggleCard로 교체**(간이 `simultaneousGifts` 폐기). 간이는 공제 안분만 하고 상대방 건 세액을 계산하지 않는 반쪽 기능이므로 완전 입력으로 대체한다. 저장된 간이 데이터는 store migration에서 `simultaneousGiftForms`로 흡수하거나 무시(공제 안분값은 완전 경로가 재계산).

#### 신규 동시증여 완전 입력 ToggleCard

```tsx
<ToggleCard
  tone="sky"
  title="같은 날 다른 분으로부터도 받으셨나요? (동시증여 — 세액 전체 계산)"
  description="각 증여 건의 산출세액을 전부 계산하고 수증자 총 납부세액 합계를 확인합니다. 
               공제 한도는 §46①2호에 따라 과세가액 비율로 자동 안분됩니다."
  checked={form.simultaneousGiftForms !== undefined}
  onCheckedChange={(v) => set({ simultaneousGiftForms: v ? [] : undefined })}
>
  {/* 안내 카드 */}
  {(form.simultaneousGiftForms ?? []).length === 0 && (
    <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-xs text-amber-800">
      1단계(증여자 관계)부터 입력하세요. 아래 버튼을 눌러 추가 건을 입력합니다.
    </div>
  )}

  {/* 추가 건 카드 반복 */}
  {(form.simultaneousGiftForms ?? []).map((sub, i) => (
    <SimultaneousGiftCard
      key={i}
      index={i}
      sub={sub}
      mainDonor={form.donor}
      onChange={(partial) => {
        const next = [...(form.simultaneousGiftForms ?? [])];
        next[i] = { ...next[i], ...partial };
        set({ simultaneousGiftForms: next });
      }}
      onDelete={() => {
        set({
          simultaneousGiftForms: (form.simultaneousGiftForms ?? []).filter((_, j) => j !== i),
        });
      }}
    />
  ))}

  {/* 추가 버튼 */}
  <button
    type="button"
    onClick={() => {
      // D-2: 추가 전 동일 그룹 미리 확인 없음 — 카드에서 donor 선택 후 validateStep에서 차단
      set({
        simultaneousGiftForms: [
          ...(form.simultaneousGiftForms ?? []),
          { ...INITIAL_FORM } as GiftSubForm,
        ],
      });
    }}
    className="rounded-md border border-sky-300 bg-sky-100/60 px-3 py-2 text-xs font-medium text-sky-800 hover:bg-sky-100"
  >
    + 동시증여 추가
  </button>
</ToggleCard>
```

#### SimultaneousGiftCard 신규 컴포넌트

**파일**: `components/calc/gift/SimultaneousGiftCard.tsx` (신규, 800줄 정책 준수)

```tsx
// SimultaneousGiftCard — 동시증여 추가 건 1개 카드 (800줄 정책으로 분리)
// 재사용: PropertyValuationForm, ExemptionChecklist, PriorGiftInput, GiftCreditChecklist

interface SimultaneousGiftCardProps {
  index: number;
  sub: GiftSubForm;
  mainDonor: GiftDonorRelation;   // 건 0의 donor (동일 그룹 경고용)
  onChange: (partial: Partial<GiftSubForm>) => void;
  onDelete: () => void;
}
```

### ⑥ 사이드바 합계

증여세 마법사는 사이드바 합계 selector를 사용하지 않음 (계획서 §8 "해당 없음", 실측 GiftTaxResultView 무관).

**N/A** — 변경 없음.

### ⑦ 결과 카드 산식·표시

**파일**: `components/calc/results/GiftTaxResultView.tsx:57~107` (Props, 실측)

#### Props 확장

```ts
interface Props {
  result: GiftTaxResult;          // 기존: 건 0
  // ... 기존 props 유지 ...
  /**
   * 동시증여 추가 건 결과 배열 (건 1..)
   * 없으면 단건 모드 (하위 호환)
   */
  simultaneousResults?: GiftTaxResult[];
  /**
   * 추가 건별 증여자 관계 레이블 — 결과 헤더 표시용
   * simultaneousResults와 동일 인덱스
   */
  simultaneousResultLabels?: string[];  // 예: ["조부모로부터 — 70,000,000"]
}
```

#### 결과 화면 배치 순서

```
[건 0] 기존 결과 카드 전체 (무변경)
  └── GiftTaxFilingFormTable result={result}

[건 1] (simultaneousResults?.[0] 있을 때)
  ┌── 헤더: "조부모로부터 — 70,000,000원 증여" (sky tone 배지)
  └── GiftTaxFilingFormTable result={simultaneousResults[0]}

... (건 N)

[합계 카드] (simultaneousResults?.length > 0 일 때)
  ┌── "수증자 총 납부세액 합계"
  └── Σ finalTax = result.finalTax + simultaneousResults.reduce((s,r) => s+r.finalTax, 0)
```

#### 합계 카드 산식 (한국어 풀어쓰기)

```
수증자 총 납부세액 합계 = 건 0 결정세액 + 건 1 결정세액 + … + 건 N 결정세액
```

숫자 옆 변수명 라벨: "건 0 결정세액 (직계존속)" 등 `donorGroup` 기반.

#### 선택 출력 (`availablePrintIds`) 확장

```ts
// GiftTaxResultView.tsx의 availablePrintIds useMemo에 추가
if (
  simultaneousResults &&
  simultaneousResults.length > 0 &&
  simultaneousResults.some((r) => r.besshi10Rows?.length > 0)
) {
  s.add("simultaneous-filing-10");
}
```

`GIFT_PRINT_SECTIONS`(GiftTaxResultViewHelpers.tsx에서 정의)에 항목 추가:

```ts
// "simultaneous-filing-10": 동시증여 신고서 전체 (건 1..N 별지 제10호서식)
```

#### PDF 확장 (`lib/pdf/gift-besshi-pages.tsx:58`)

```tsx
// gift-besshi-pages.tsx — 동시증여 신고서 PDF 렌더
const simultaneousResults = (r as SimultaneousGiftResponse).simultaneousResults ?? [];
const simFF10 = want("simultaneous-filing-10") && simultaneousResults.length > 0;

// ...existing ff10...

{simFF10 && simultaneousResults.map((sr, i) => {
  const rows = (sr.besshi10Rows ?? []) as FilingFormRow[];
  return rows.length > 0
    ? <FilingForm10PdfPage key={`sim-${i}`} rows={rows} />
    : null;
})}
```

### ⑧ Validation (gift-tax-form-validate.ts:29)

**파일**: `components/calc/gift-tax-form-validate.ts:29` (실측)

`validateStep(step, form)` 에 step=3(공제 단계) 검증 추가:

```ts
// step === 3 분기 내부에 추가
if (step === 3) {
  // 기존 검증 ...

  // D-2: 동일 그룹 차단 (건 0 + 모든 추가 건 전수 비교 — 추가 건끼리도 검사)
  if (form.simultaneousGiftForms && form.simultaneousGiftForms.length > 0) {
    for (let i = 0; i < form.simultaneousGiftForms.length; i++) {
      const sub = form.simultaneousGiftForms[i];
      if (!sub.donor) {
        return "동시증여 추가 건의 증여자 관계를 선택하세요.";
      }
      // 자신보다 앞선 모든 건(건 0 = j:-1 포함)과 동일 그룹이면 차단
      // → 건1 조부 + 건2 조모(둘 다 그룹 B)처럼 추가 건끼리 동일인도 차단
      for (let j = -1; j < i; j++) {
        const otherDonor = j === -1 ? form.donor : form.simultaneousGiftForms[j].donor;
        if (otherDonor && isSameDonorGroup(sub.donor, otherDonor)) {
          const otherLabel = j === -1 ? "현재 신고 건" : `동시증여 건 ${j + 1}`;
          return `동시증여 건 ${i + 1}(${DONOR_LABELS[sub.donor]})이 ${otherLabel}(${DONOR_LABELS[otherDonor]})과 같은 동일인 그룹(상증법 §47②)입니다. 동일인의 증여는 한 건으로 합산해 입력하세요.`;
        }
      }
      // 추가 건 증여재산 입력 검증
      if (sub.giftItems.length + sub.stockItems.length === 0) {
        return "동시증여 추가 건의 증여재산을 1개 이상 입력하세요.";
      }
    }
  }
}
```

**3중 패턴 준수**: `simultaneousGiftForms`는 3-state(undefined/[]/[...]) — `validateStep`에서 `undefined`이면 비활성으로 skip, `[]`이면 "데이터 없음"으로 skip, `[...]`이면 전수 검증.

---

## 3. SimultaneousGiftCard ASCII 목업

```
┌─────────────────────────────────────────────────────────────────────┐
│  동시증여 추가 건 1  [삭제 ✕]                                         │
│  (sky border, bg-sky-50/40)                                          │
├─────────────────────────────────────────────────────────────────────┤
│  ① 증여자 관계 (RadioCardGroup, tone=sky)                             │
│     [부] [모] [조부모]* [배우자] [직계비속] [형제] [기타친족] [기타]     │
│     * 조부모 선택 시: "세대생략 할증(§57) 자동 적용"  amber 안내      │
│                                                                       │
│  ② 증여재산 (EstateItemTableView 재사용)                              │
│     ┌──────────────────────────────────────────────────────┐         │
│     │ 자산명      종류      평가액       [+ 자산 추가]       │         │
│     │ 아파트      부동산    70,000,000원  [편집] [삭제]      │         │
│     └──────────────────────────────────────────────────────┘         │
│                                                                       │
│  ③ 비과세 · 사전증여 (ExemptionChecklist + PriorGiftInput)           │
│     [▼ 펼치기] (기본 접힘 — 선택 없으면 표시 불필요)                  │
│                                                                       │
│  ④ 공제 설정 (GiftCreditChecklist 재사용)                             │
│     · 혼인·출산 공제 priorUsedMarriageBirthDeduction 독립 입력        │
│     · 기한 내 신고 여부 (§69 신고세액공제 3%)                         │
│     [▼ 펼치기] (기본 접힘)                                            │
└─────────────────────────────────────────────────────────────────────┘
```

**컴포넌트 재사용 상세**:

| 섹션 | 재사용 컴포넌트 | 파일 위치 (실측) |
|---|---|---|
| 관계 선택 | `RadioCardGroup` + `DONOR_OPTIONS` | `gift-tax-form-shared.tsx:175` |
| 증여재산 테이블 | `EstateItemTableView` / `EstateItemEditor` | `components/calc/gift/` |
| 비과세 | `ExemptionChecklist` | `components/calc/gift/ExemptionChecklist.tsx` |
| 사전증여 | `PriorGiftInput` | `components/calc/gift/PriorGiftInput.tsx` |
| 공제·세액공제 | `GiftCreditChecklist` (sub prop=true 시 간소 모드) | `components/calc/gift/GiftCreditChecklist.tsx` |

**donor 선택과 세대생략 자동 처리**: `donor === "grandparent"` 이면 빌드 시 `isGenerationSkip=true` 자동 설정 (기존 엔진 동작, `buildGiftTaxInput` `gift-api.ts:96` 실측 기준). UI 별도 토글 불필요.

---

## 4. 결과뷰 N개 별지 제10호서식 렌더 구조

### 4.1 헤더 레이블 생성 로직

```ts
function buildSimultaneousResultLabel(
  result: GiftTaxResult,
  subForm: GiftSubForm,
): string {
  const donorLabel = DONOR_LABELS[subForm.donor] ?? "기타";
  const grossValue = result.grossGiftValue.toLocaleString("ko-KR");
  return `${donorLabel}로부터 — ${grossValue}원 증여`;
}
// 예: "조부모로부터 — 70,000,000원 증여"
```

### 4.2 합계 카드 (수증자 총 납부세액)

```tsx
{simultaneousResults && simultaneousResults.length > 0 && (
  <div className="rounded-xl border-2 border-sky-300 bg-sky-50/60 p-4 space-y-2">
    <h3 className="text-sm font-bold text-sky-900">
      수증자 총 납부세액 합계 (상증법 §4의2①)
    </h3>
    <table className="w-full text-xs">
      <tbody>
        <tr>
          <td className="text-sky-700">
            건 0 결정세액 ({DONOR_LABELS[mainDonor]})
          </td>
          <td className="text-right font-mono tabular-nums">
            {formatKRW(result.finalTax)}
          </td>
        </tr>
        {simultaneousResults.map((sr, i) => (
          <tr key={i}>
            <td className="text-sky-700">
              건 {i + 1} 결정세액 ({simultaneousResultLabels?.[i] ?? ""})
            </td>
            <td className="text-right font-mono tabular-nums">
              {formatKRW(sr.finalTax)}
            </td>
          </tr>
        ))}
        <tr className="border-t border-sky-300 font-bold">
          <td className="text-sky-900 pt-1">합계</td>
          <td className="text-right font-mono tabular-nums text-sky-900 pt-1">
            {formatKRW(
              result.finalTax +
                simultaneousResults.reduce((s, r) => s + r.finalTax, 0)
            )}
          </td>
        </tr>
      </tbody>
    </table>
    <p className="text-[10px] text-sky-600">
      수증자 총 납부세액 합계 = 건 0 결정세액 + 건 1 결정세액 + … + 건 N 결정세액
    </p>
  </div>
)}
```

### 4.3 별지 제10호서식 반복 렌더

```tsx
{/* 건 0 — 기존 GiftTaxFilingFormTable 무변경 */}
<PrintSection id="filing-form-10" selectedIds={selectedPrintIds}>
  <GiftTaxFilingFormTable result={result} />
</PrintSection>

{/* 건 1..N — 동시증여 신고서 */}
{simultaneousResults && simultaneousResults.length > 0 && (
  <PrintSection id="simultaneous-filing-10" selectedIds={selectedPrintIds}>
    {simultaneousResults.map((sr, i) => (
      <div key={i} className="space-y-2">
        {/* 건 헤더 */}
        <div className="flex items-center gap-2 px-1">
          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-semibold text-sky-700">
            건 {i + 1}
          </span>
          <span className="text-sm font-medium text-gray-700">
            {simultaneousResultLabels?.[i]}
          </span>
        </div>
        <GiftTaxFilingFormTable result={sr} />
      </div>
    ))}
  </PrintSection>
)}
```

---

## 5. D-2 동일 그룹 차단 — UI 위치·메시지

### 5.1 차단 위치 (2단계 방어)

| 단계 | 위치 | 방식 |
|---|---|---|
| 1차 (실시간) | `SimultaneousGiftCard` 내 donor 선택 직후 | 인라인 경고 메시지 (amber FieldCard warning) |
| 2차 (단계 이동 차단) | `validateStep(3, form)` — `GiftTaxForm.tsx:108` 호출 | 오류 반환으로 다음 단계 차단 |
| 3차 (방어 가드) | 엔진 `calcSimultaneousGifts` STEP 1 | 비정상 입력 자동 합산 + warnings 추가 |

### 5.2 1차 인라인 경고 (SimultaneousGiftCard 내부)

```tsx
{sub.donor && isSameDonorGroup(sub.donor, mainDonor) && (
  <FieldCard
    label=""
    warning={`${DONOR_LABELS[sub.donor]}와 현재 신고의 ${DONOR_LABELS[mainDonor]}는 상증법 §47② 동일인 그룹입니다.
동일인의 증여는 현재 신고 증여재산에 합산하고 여기에 입력하지 마세요.`}
  />
)}
```

### 5.3 2차 validateStep 오류 메시지

```
동시증여 추가 건(조부모)이 현재 신고 건(조부모)과 같은 동일인 그룹(상증법 §47②)입니다.
동일인의 증여는 현재 신고 증여재산에 합산하고 여기에 추가하지 마세요.
```

---

## 6. E2E 플로우 (Playwright)

**파일**: `e2e/gift-simultaneous.spec.ts` (신규)
**포트**: `E2E_PORT=3101`

### 6.1 핵심 테스트 시나리오

```ts
test("A-6 이미지7 재현 — 건0 직계존속 60M + 동시증여 100M", async ({ page }) => {
  // 건 0 입력 (Step0~Step2)
  // Step3 동시증여 토글 ON
  await page.getByRole("switch", { name: /같은 날 다른 분으로부터도/ }).click();
  await page.getByRole("button", { name: "+ 동시증여 추가" }).click();

  // SimultaneousGiftCard 내 관계 선택 (RadioCardGroup — testId 셀렉터 사용)
  // 주의: RadioCardGroup name=label+description 복합 → data-testid 셀렉터 권장
  await page.getByTestId("sim-card-0-donor-grandparent").click();

  // 증여재산 추가 (모달 방식)
  await page.getByTestId("sim-card-0-add-item").click();
  // ... 자산 입력 모달 ...
  await page.getByTestId("sim-card-0-item-modal-confirm").click();

  // 계산
  await page.getByRole("button", { name: "계산하기" }).click();

  // 결과 검증
  // 건 0 별지 제10호서식 ㉔ (공제): 18,750,000
  await expect(page.getByTestId("besshi10-row-deduction-0")).toContainText("18,750,000");
  // 건 0 결정세액: 4,001,250
  await expect(page.getByTestId("besshi10-row-final-tax-0")).toContainText("4,001,250");
  // 건 1 별지 존재
  await expect(page.getByText("건 1")).toBeVisible();
  // 합계 카드
  await expect(page.getByText("수증자 총 납부세액 합계")).toBeVisible();
});

test("D-2 동일 그룹 차단 — 부 + 모", async ({ page }) => {
  // ... 건 0 donor=father 설정 ...
  // 동시증여 추가 후 donor=mother 선택
  await page.getByTestId("sim-card-0-donor-mother").click();
  // 경고 메시지 확인
  await expect(page.getByText(/동일인 그룹/)).toBeVisible();
  // 다음 단계 버튼 클릭 시 차단
  await page.getByRole("button", { name: "다음" }).click();
  await expect(page.getByText(/동일인 그룹.*§47/)).toBeVisible();
});
```

### 6.2 Playwright 셀렉터 함정 주의 (memory: project_gift_donor_paid_tax_grossup 등)

- `RadioCardGroup` 셀렉터: `name=label+description` 복합 → `data-testid` 권장
- 모달 닫기: backdrop 클릭이 아닌 확인 버튼 클릭
- `getByLabel("일")` 오매칭 주의 → `getByRole("textbox", { name: "일" })` 한정
- 동시증여 카드는 인덱스 기반 `data-testid="sim-card-{i}-..."`로 구별

---

## 7. 케이스 인벤토리 (UI 관점)

엔진 설계 A-1~A-7에 대응하는 UI 관점 행:

| # | 시나리오 | UI 진입 | 결과화면 검증 |
|---|---------|---------|-------------|
| A-1 | 부모 130M + 조부모 70M 동시증여 → 안분 | Step3 동시증여 ON → 건1 조부모 70M 입력 | 건0 공제 32,500,000 / 건1 공제 17,500,000 확인 |
| A-2 | 조부모 건 세대생략 30% 할증 | 건1 donor=grandparent → 자동 할증 (§57) | 건1 별지 세대생략 할증 행 확인 |
| A-3 | 수증자 총 납부세액 합계 | A-1과 동일 | 합계 카드 Σ finalTax = 두 건 합 |
| A-4 | 부 130M + 모 50M → D-2 차단 | 건1 donor=mother → 인라인 경고 + 단계 차단 | 오류 메시지 표시, 결과 미진행 |
| A-5 | 부모 + 직계비속 → 완전 별도 | 건1 donor=lineal_descendant | 건0 공제 50M 전액 / 건1 공제 50M 전액 |
| A-6 | 이미지7 재현 60M + 100M | Step3 동시증여 ON → 건1 100M 입력 | 건0 과세표준 41,250,000 / 납부 4,001,250 원단위 일치 |
| A-7 | 사전증여 포함 건1 조부모 70M + 3년 전 30M | 건1 PriorGiftInput 30M 추가 | 건1 합산과세가액 100M 표시 |

---

## 8. 14개 동기화 지점 커버리지 (UI 담당 8개)

| # | 지점 | 파일:위치 | 변경 내용 | 상태 |
|---|-----|----------|----------|------|
| ① | FormState | `gift-tax-form-shared.tsx:83` | `simultaneousGiftForms?: GiftSubForm[]` 추가 | TODO |
| ② | INITIAL_FORM | `gift-tax-form-shared.tsx:119` | `simultaneousGiftForms: undefined` 추가 | TODO |
| ③ | normalize | `lib/stores/calc-wizard-migration.ts` | sub-form 내 Date 필드 복원 (비상장주식 valuationDate) | TODO |
| ④ | API 변환 | `lib/calc/gift-api.ts:41` | `buildSimultaneousGiftInputs` 신규 함수 | TODO |
| ⑤ | UI 위젯 | `GiftCreditChecklist.tsx:274` + 신규 `SimultaneousGiftCard.tsx` | 완전 입력 카드 반복 UI | TODO |
| ⑥ | 사이드바 | — | 해당 없음 (증여세 사이드바 합계 미사용) | N/A |
| ⑦ | 결과 카드 | `GiftTaxResultView.tsx:57` | `simultaneousResults?` prop + N개 별지 + 합계 카드 | TODO |
| ⑧ | validation | `components/calc/gift-tax-form-validate.ts:29` | step=3 동일 그룹 차단 + 추가 건 필수 검증 | TODO |
| ⑨ | Zod 메인 | `lib/validators/property-valuation-input.ts:495` | `giftSubFormSchema` 배열 | 엔진/API 담당 |
| ⑩ | Zod 보조 | `lib/validators/property-valuation-input.ts` | 동시증여 sub-form 배열 스키마 | 엔진/API 담당 |
| ⑪ | Zod 자산 | `lib/validators/estate-item-schema.ts` | 재사용 예상, 변경 없음 | 엔진/API 담당 |
| ⑫ | Zod 입력 객체 | `lib/validators/property-valuation-input.ts` | `simultaneousGiftForms` 배열 필드 | 엔진/API 담당 **(TS 미감지)** |
| ⑬ | API fetch body | `lib/calc/gift-api.ts` | `simultaneousGiftForms` body spread | 엔진/API 담당 **(TS 미감지)** |
| ⑭ | Route handler | `app/api/calc/gift/route.ts:48` | `calcSimultaneousGifts` 분기 + `simultaneousResults` 반환 | 엔진/API 담당 **(TS 미감지)** |

**⑫⑬⑭는 TypeScript 미감지 → Do 완료 시 grep 자가 점검 필수** (memory `feedback_api_zod_schema_sync`).

---

## 9. 3핵심 정책 자가 점검

| 정책 | 이 설계에서 준수 여부 |
|---|---|
| useEffect → store 미러링 금지 | SimultaneousGiftCard onChange는 직접 store set. useEffect 없음 |
| 자동 안분 fallback 금지 | 안분 분모(`netCurrentGiftValue`)는 엔진 2-pass 결과 echo 필드 사용 (추정 없음) |
| Validation 8번째 동기화 강제 | `simultaneousGiftForms` 3-state: undefined=skip / []=skip / [...]= validateStep 전수 |

---

## 10. 미결정 사항 — 구현 전 확정 필요

| # | 사항 | 현재 결정 | 상세 |
|---|---|---|---|
| D-5 후속 | 건별 별지서식 선택 출력 분리 | 1차: 단일 토글 `simultaneous-filing-10` | 2차에서 건별 suffix 분리 검토 |
| D-6 하위호환 | 간이 `simultaneousGifts` 폐기 vs 병행 | ✅ **교체(폐기) 확정**(2026-06-22). 저장 데이터는 store migration 흡수 | 확정 |
| `GiftSubForm` 내 `isGenerationSkip` | `donor === "grandparent"` 시 자동 → UI 토글 필요 없음 | UI 토글 제거 (기존 동작 동일) | `buildGiftTaxInput` `:86` 기준 |

---

## 11. Phase 구현 순서 (UI 담당)

| Phase | 내용 | 완료 기준 |
|---|---|---|
| Phase 3 (UI 입력) | ①②③⑤⑧ + `buildSimultaneousGiftInputs`(④) + `SimultaneousGiftCard.tsx` 신규 | E2E 추가 건 입력·검증 동작 |
| Phase 4 (결과뷰) | ⑦ `GiftTaxResultView` props 확장 + N개 별지 + 합계 카드 + 선택출력 | N개 결과 카드 렌더 |
| Phase 5 (E2E) | `e2e/gift-simultaneous.spec.ts` A-1~A-7 스펙 | spec 통과 (E2E_PORT=3101) |

---

## 12. Do 완료 전 자가 점검 체크리스트

- [ ] `GiftSubForm = Omit<FormState, "simultaneousGiftForms">` 타입 선언 확인
- [ ] `INITIAL_FORM.simultaneousGiftForms = undefined` 추가 확인
- [ ] `buildSimultaneousGiftInputs` 신규 함수 + ⑬ body spread 확인
- [ ] `SimultaneousGiftCard.tsx` 800줄 미만
- [ ] D-2 동일 그룹 차단: 인라인 경고(⑤) + validateStep(⑧) 양쪽 모두 구현
- [ ] `GiftTaxResultView` `simultaneousResults?` prop 추가 + 합계 카드
- [ ] 선택 출력 `simultaneous-filing-10` 추가
- [ ] PDF `gift-besshi-pages.tsx:58` 동시증여 신고서 렌더
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/gift/` 통과 (회귀)
- [ ] ⑫⑬⑭ grep 자가 점검 (callGiftTaxAPI body, Route handler, Zod)
- [ ] E2E A-6 이미지7 원단위 anchor 통과
- [ ] 브라우저 수동 확인 또는 미수행 명시
