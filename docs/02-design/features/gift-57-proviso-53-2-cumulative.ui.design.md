# UI 설계 — 증여세 갭 2건: §57① 단서 / §53의2 기공제 누적 차감

작성일: 2026-06-11  
작성자: inheritance-gift-tax-ui-senior  
상태: Plan·Design 완료 — Do 착수 대기 (엔진 시니어 타입 확정 후 진행)

---

## 0. 전제 — 현행 코드 실측 결과

아래 인용은 worktree `fix-gift-57-53-2` 기준으로 직접 파일을 Read·grep 하여 확인한 값이다.

| 지점 | 현행 파일 : 줄 |
|---|---|
| ① FormState 타입 | `components/calc/gift-tax-form-shared.tsx:35–68` |
| ② INITIAL_FORM | `components/calc/gift-tax-form-shared.tsx:70–90` |
| ③ normalize | 해당 없음 — `normalizeRestoredFormDates` (`components/calc/inheritance/normalize-restored-form-dates.ts`) 가 날짜 필드만 처리. 신규 boolean/string 필드는 INITIAL_FORM 기본값으로 자동 복원됨 |
| ④ API 변환 | `lib/calc/gift-api.ts:38–85` (`buildGiftTaxInput`) |
| ⑤ Step0·Step3 UI | `components/calc/gift-tax-form-shared.tsx:284–589` |
| ⑥ 사이드바 | GiftTaxForm에 WizardSidebar 없음 — 사이드바 합계 미구현 (양도세와 달리 단일 컬럼 레이아웃). 영향 없음. |
| ⑦ 결과 카드 | `components/calc/results/GiftTaxResultView.tsx`, `GenerationSkipSurchargeBreakdownCard.tsx` |
| ⑧ validation | `components/calc/gift-tax-form-shared.tsx:234–278` (`validateStep`) — 전용 `gift-validate.ts` 파일 없음. `validateStep` 내부에 인라인. |
| ⑨ Zod enum 메인 | `lib/validators/property-valuation-input.ts:767–792` (`giftTaxInputSchema`) |
| ⑩ Zod deductionInput | `lib/validators/gift-aux-schemas.ts:13–24` (`giftDeductionInputSchema`) |
| ⑫ Zod 입력 객체 | `lib/validators/gift-aux-schemas.ts` (deductionInput) + `property-valuation-input.ts` (giftTaxInputSchema) |
| ⑬ fetch body | `components/calc/GiftTaxForm.tsx:128` (`body: JSON.stringify(buildGiftTaxInput(form))`) |
| ⑭ Route handler | `app/api/calc/gift/route.ts:64` (`parsed.data as unknown as GiftTaxInput`) |

**증여세는 `lib/calc/gift-validate.ts` 전용 파일 없음 — `validateStep`이 `gift-tax-form-shared.tsx`에 인라인.**  
신규 validation은 이 함수 내부에 추가한다.

---

## 1. 갭 A — §57① 단서 (최근친 직계비속 사망 시 할증 배제)

### 1-1. 법령 요약

상증법 §57① 단서: "증여자의 최근친인 직계비속이 사망하여 그 사망자의 최근친인 직계비속이 증여받은 경우에는 제1항을 적용하지 아니한다."

예: 조부(甲) → 손자(丁) 증여 시, 甲의 최근친 직계비속인 아버지(乙)가 이미 사망한 경우 세대생략 할증 0%.

### 1-2. 사용자 시나리오 A

1. Step 0에서 증여자 "조부모" 선택
2. 현행 안내문("조부모→손자녀 증여 — 세대생략 §57 할증 30% 자동 적용") 바로 아래에  
   **§57① 단서 ToggleCard** 노출 (donor === "grandparent" 조건부)
3. 토글 ON → "증여자의 최근친 직계비속(예: 부·모)이 이미 사망" 사유 확인
4. Step 3(공제·세액공제) → 계산 → 결과 화면
5. 결과 요약 카드: "세대생략 할증" 행 0원 또는 행 자체 숨김
6. GenerationSkipSurchargeBreakdownCard: 단서 적용 배제 사유 텍스트 표시

### 1-3. 14개 동기화 지점 — 갭 A

#### ① FormState 타입 변경

파일: `components/calc/gift-tax-form-shared.tsx`

```typescript
// 신규 추가 (Step 0 섹션 §57 단서)
/** §57① 단서 — 증여자의 최근친 직계비속(부·모) 사망 시 할증 배제 */
isSection57ProvisoApplied: boolean;
```

#### ② INITIAL_FORM 초기값

```typescript
isSection57ProvisoApplied: false,
```

#### ③ normalize fallback

boolean 필드 — sessionStorage 복원 시 undefined → false 기본값 유지 (INITIAL_FORM 스프레드로 자동 처리).  
별도 normalize 로직 불필요.

#### ④ API 변환 — `lib/calc/gift-api.ts:38–85` (`buildGiftTaxInput`)

엔진 시니어가 `GiftTaxInput`에 추가할 필드명 확정 후 매핑. 예상 매핑:

```typescript
// GiftTaxInput 신규 필드 (엔진 확정 후 갱신):
isSection57ProvisoApplied: form.isSection57ProvisoApplied || undefined,
```

3중 패턴: `form.isSection57ProvisoApplied || undefined` — false 시 undefined로 전송해 엔진 기본(할증 적용) 유지.  
**단, Zod 스키마(⑫)와 validateStep(⑧)에서도 동일 fallback 인식 필요.**

#### ⑤ UI 입력 위젯

위치: `components/calc/gift-tax-form-shared.tsx` — `Step0` 함수, `form.donor === "grandparent"` 조건 블록 내부.

현행 코드 (`gift-tax-form-shared.tsx:344–348`):
```tsx
{form.donor === "grandparent" && (
  <p className="text-[11px] text-rose-700 bg-rose-50/70 rounded px-2 py-1">
    조부모→손자녀 증여 — 세대생략 §57 할증 30% (또는 미성년+20억 초과 시 40%) 자동 적용됩니다.
  </p>
)}
```

이 블록 **직후**에 아래 ToggleCard 삽입:

```tsx
{form.donor === "grandparent" && (
  <ToggleCard
    tone="rose"
    title="§57① 단서 — 증여자의 최근친 직계비속 사망 (할증 배제)"
    description="증여자(조부모)의 최근친 직계비속(부·모)이 이미 사망하여 그 사망자의 최근친 직계비속(손자녀)이 증여받는 경우. 이 경우 세대생략 할증(30%·40%)이 적용되지 않습니다."
    checked={form.isSection57ProvisoApplied}
    onCheckedChange={(v) => set({ isSection57ProvisoApplied: v })}
  />
)}
```

**tone**: `rose` — 지역·지정 정보 및 "경고성 조건 배제" 계열.  
**활성화 조건**: `donor === "grandparent"` 일 때만 노출 (3-state 정책 준수 — donor가 grandparent가 아닌 경우 폼 필드 자체는 FormState에 보존되지만 UI 노출·API 전송 모두 억제됨).

#### ⑥ 사이드바 합계

GiftTaxForm에 WizardSidebar 없음 — 영향 없음.

#### ⑦ 결과 카드 산식·표시

**GiftTaxResultView** (`components/calc/results/GiftTaxResultView.tsx:325–432`)

현행: `result.generationSkipSurcharge > 0` 조건으로 "세대생략 할증과세" 행 표시.  
변경: 할증 배제 시 `generationSkipSurcharge === 0` → 기존 조건 그대로 행 숨김. 별도 수정 불필요.

**GenerationSkipSurchargeBreakdownCard** (`components/calc/results/GenerationSkipSurchargeBreakdownCard.tsx`)

엔진 결과에 §57 단서 배제 사유가 담긴 경우 카드 표시 조건 검토:

- 현행 표시 게이트: `result.generationSkipSurchargeDetail !== null` (`GiftTaxResultView.tsx:446`)
- 배제 시 엔진이 `generationSkipSurchargeDetail = null` + `generationSkipSurcharge = 0` 반환 → 카드 자동 숨김

단서 배제 사유를 별도로 표시하려면:

```tsx
{/* §57 단서 적용 안내 — 할증 0원이지만 배제 사유 표시 */}
{result.isSection57ProvisoApplied && result.generationSkipSurcharge === 0 && (
  <div className="border border-rose-100 rounded-xl bg-rose-50/30 px-4 py-3 text-sm text-rose-700">
    세대생략 할증과세 배제 (상증법 §57① 단서) — 증여자의 최근친 직계비속 사망
  </div>
)}
```

이를 위해 `GiftTaxResult`에 `isSection57ProvisoApplied?: boolean` echo 필드 필요.  
**엔진 시니어에게 result echo 필드 추가 요청 필요 — 설계 통합 시 확인.**

**GiftTaxFilingFormTable** / `gift-tax-filing-form-besshi10.ts`:  
㉝ "세대생략가산세" 행은 `surcharge = r.generationSkipSurchargeDetail?.additionalSurcharge ?? 0` 로 계산됨.  
배제 시 자동 0원 표시 — 별도 수정 불필요.

#### ⑧ validation (validateStep 내부 추가)

`components/calc/gift-tax-form-shared.tsx:234–278` — `validateStep` 함수 step 0 블록에 추가:

```typescript
if (step === 0) {
  if (!form.giftDate) return "증여일을 입력하세요.";
  if (!form.donor) return "증여자를 선택하세요.";
  // §57 단서는 선택사항 — 추가 validation 없음
  // (donor !== "grandparent" 이면서 isSection57ProvisoApplied = true인 경우는
  //  UI가 토글을 숨기므로 API 전송 시 undefined → 엔진 무시. 3중 패턴 준수)
}
```

API 전송 시 `donor !== "grandparent"` 이면 `buildGiftTaxInput`에서 `isSection57ProvisoApplied`를 `undefined`로 strip.  
Zod `giftTaxInputSchema`에서 `isSection57ProvisoApplied: z.boolean().optional()` 추가.

---

## 2. 갭 B — §53의2 기공제 누적 차감 (수증자별 통산 1억)

### 2-1. 법령 요약

상증법 §53의2①후단·②후단·③: 혼인·출산 공제는 수증자 기준으로 합산하여 통생 1억원이 한도다. 즉 이전 증여에서 혼인·출산 공제를 이미 받은 금액이 있으면, 이번 증여에서 공제 가능한 잔여 한도는 "1억 − 이미 공제받은 금액"이다.

예: 결혼 시 조부모로부터 4천만원 혼인공제 수령 → 이후 출산 시 부모로부터 증여할 때 출산공제 한도는 6천만원으로 제한.

### 2-2. 현행 엔진 상태

`lib/tax-engine/deductions/gift-deductions.ts:43`: `MARRIAGE_BIRTH_MAX = 100_000_000`

현행 `calcMarriageBirthDeduction` (같은 파일 116–155줄)은 이번 증여 건 내부에서만 1억 캡을 적용하고, 과거 타 증여에서 기수령한 §53의2 공제 누적은 반영하지 않음.

`lib/calc/prior-gift-marriage-birth-cap.ts`는 상속세 사전증여 흡수용 `makeMarriageBirthCapper`이며, 증여세 이번 건 입력에 대한 수증자 통생 누적 차감 로직과는 별개.

**따라서 엔진 신규 입력**: `GiftDeductionInput.cumulativeMarriageBirthUsed?: number` (수증자가 과거에 이미 공제받은 §53의2 합계 — 사용자 직접 입력).

### 2-3. 사용자 시나리오 B

1. Step 3(공제·세액공제) — "혼인·출산 공제(§53의2)" 섹션 노출 조건: `donorRelation === "lineal_ascendant_adult" || "lineal_ascendant_minor"` (현행 동일)
2. 혼인공제 또는 출산공제 중 하나라도 입력 → **"이미 공제받은 혼인·출산 공제액" CurrencyInput** 동시 노출 (해당 조건에 항상 노출, 미입력 시 0으로 처리)
3. 엔진: `min(marriageExemption + birthExemption, MARRIAGE_BIRTH_MAX - cumulativeUsed)`로 공제 산정
4. 결과 화면: "혼인·출산 공제" 행에 잔여한도 산식 한국어 풀어쓰기 표시

### 2-4. 14개 동기화 지점 — 갭 B

#### ① FormState 타입 변경

파일: `components/calc/gift-tax-form-shared.tsx`

```typescript
// Step 3 — 혼인·출산 공제 섹션에 추가
/** §53의2③ 수증자 통산 기공제액 — 이전 증여에서 이미 공제받은 혼인·출산 공제 합계 */
cumulativeMarriageBirthUsed: string;
```

#### ② INITIAL_FORM 초기값

```typescript
cumulativeMarriageBirthUsed: "",
```

#### ③ normalize fallback

string 필드 — undefined → `""` 기본값 (INITIAL_FORM 스프레드로 자동 처리).  
별도 normalize 불필요.

#### ④ API 변환 — `lib/calc/gift-api.ts` (`buildGiftTaxInput`)

`deductionInput` 객체 내 신규 필드 추가:

```typescript
const deductionInput: GiftDeductionInput = {
  donorRelation: deriveDonorRelation(form.donor, form.isMinorDonee),
  marriageExemption: parseAmount(form.marriageExemption) || undefined,
  birthExemption: parseAmount(form.birthExemption) || undefined,
  priorUsedDeduction: parseAmount(form.priorUsedDeduction) || undefined,
  // 신규: §53의2③ 수증자 통산 기공제액
  cumulativeMarriageBirthUsed: parseAmount(form.cumulativeMarriageBirthUsed) || undefined,
};
```

3중 패턴: `|| undefined` — 0 또는 빈 문자열이면 undefined로 전송 → 엔진 기본(기공제 0) 유지.

#### ⑤ UI 입력 위젯

위치: `components/calc/gift-tax-form-shared.tsx` — `Step3` 함수, 혼인·출산 공제 섹션 내부 (`gift-tax-form-shared.tsx:467–491`).

현행 혼인·출산 공제 섹션 구조:
```tsx
{(form.donorRelation === "lineal_ascendant_adult" || form.donorRelation === "lineal_ascendant_minor") && (
  <div className="border rounded-lg p-4 space-y-3">
    <h4>혼인·출산 공제 (§53의2, 최대 각 1억)</h4>
    <p>...</p>
    <CurrencyInput label="혼인공제" ... />
    <CurrencyInput label="출산공제" ... />
  </div>
)}
```

이 섹션 내부, 출산공제 CurrencyInput **직후**에 아래 필드 삽입:

```tsx
<CurrencyInput
  label="이미 공제받은 혼인·출산 공제액 (§53의2③)"
  value={form.cumulativeMarriageBirthUsed}
  onChange={(v) => set({ cumulativeMarriageBirthUsed: v })}
  hint="과거 다른 증여에서 §53의2 공제를 이미 받은 금액 합계 (없으면 빈칸)"
  placeholder="없으면 빈칸"
/>
```

**노출 조건**: 혼인·출산 공제 섹션 전체와 동일 — `donorRelation === "lineal_ascendant_adult" || "lineal_ascendant_minor"`.  
혼인·출산 값 입력 여부와 무관하게 섹션이 보이면 항상 함께 노출한다 (사전 기공제가 있어야 차감이 의미 있지만, 사용자가 섹션을 열었다는 것은 혼인·출산 공제 대상임을 의미하므로 항상 물어보는 것이 자연스럽고 오입력 방지에도 유리함).

**placeholder**: 숫자 예시 금지 — "없으면 빈칸" (CLAUDE.md 정책).

#### ⑥ 사이드바 합계

GiftTaxForm에 WizardSidebar 없음 — 영향 없음.

#### ⑦ 결과 카드 산식·표시

**GiftTaxResultView** 혼인·출산 공제 표시:

현행: `allBreakdown`에 포함된 `"혼인·출산 공제 합계 (최대 1억, 직계존속 한정)"` 행이 CalculationStep 목록에 렌더됨.

엔진이 기공제를 차감한 잔여 한도로 공제를 산출하므로 breakdown 산식이 자동 반영된다. 단, 기공제 입력이 있는 경우 CalculationStep에 아래 행이 추가되어야 한다 (엔진 시니어에게 요청):

```
"기수령 혼인·출산 공제 차감 (§53의2③)"  amount: -cumulativeMarriageBirthUsed
"잔여 혼인·출산 공제 한도"  amount: max(0, 1억 - cumulativeUsed)
```

결과 카드 한국어 산식 예시:
```
혼인 공제 + 출산 공제 합계 = xxx원
이미 공제받은 혼인·출산 공제액 = -yyy원  (§53의2③)
적용 가능 잔여 한도 = min(합계, 1억 − 기공제액) = zzz원
```

**GiftTaxFilingFormTable** / `gift-tax-filing-form-besshi10.ts`:  
㉖ "증여재산공제 — 직계존비속" 행은 `totalDeduction`에서 도출되므로 자동 반영됨 — 별도 수정 불필요.

#### ⑧ validation (validateStep 내부 추가)

`components/calc/gift-tax-form-shared.tsx:234–278` — `validateStep` step 3 블록 추가:

```typescript
if (step === 3) {
  // §53의2③ 기공제액 상한 — 1억을 초과하는 값은 의미 없음
  const cumUsed = parseAmount(form.cumulativeMarriageBirthUsed);
  if (cumUsed > 100_000_000) {
    return "이미 공제받은 혼인·출산 공제액은 1억원을 초과할 수 없습니다.";
  }
}
```

API 전송: `parseAmount(form.cumulativeMarriageBirthUsed) || undefined` → 0 입력 시 undefined로 처리됨. Zod 스키마(⑩)에서 `cumulativeMarriageBirthUsed: z.number().min(0).max(100_000_000).optional()` 추가.

---

## 3. 신고서 양식 표 영향 분석

### 3-1. 별지10호 서식 (`gift-tax-filing-form-besshi10.ts`)

- **㉖** 증여재산공제 행: `split.lineal` (relationDeduction + marriageBirthDeduction 합산값에서 도출됨) — 엔진이 잔여 한도로 계산한 값이 자동 반영. 별도 수정 불필요.
- **㉝** 세대생략가산세: `r.generationSkipSurchargeDetail?.additionalSurcharge ?? 0` — §57 단서 배제 시 0원 자동 표시. 별도 수정 불필요.

### 3-2. `gift-filing-form-rows.ts` (12행/18행 신고서)

- 현행 구조 그대로 유지 — 엔진 계산값이 바뀌면 자동 반영됨.
- §57 단서 배제 시 generationSkipDetail = null → useEighteen = false → 12행 사례 1 표시. 정상.

---

## 4. Zod 스키마 변경 사항 (⑨⑩⑫)

### 4-1. `lib/validators/gift-aux-schemas.ts` — `giftDeductionInputSchema` (⑩)

```typescript
export const giftDeductionInputSchema = z.object({
  donorRelation: z.enum([...]),
  marriageExemption: z.number().min(0).max(100_000_000).optional(),
  birthExemption: z.number().min(0).max(100_000_000).optional(),
  priorUsedDeduction: z.number().nonnegative().optional(),
  // 신규 B
  cumulativeMarriageBirthUsed: z.number().min(0).max(100_000_000).optional(),
});
```

### 4-2. `lib/validators/property-valuation-input.ts` — `giftTaxInputSchema` (⑨⑫)

```typescript
export const giftTaxInputSchema = z.object({
  // ... 기존 필드 ...
  isGenerationSkip: z.boolean(),
  // 신규 A
  isSection57ProvisoApplied: z.boolean().optional(),
  // deductionInput은 giftDeductionInputSchema 수정으로 자동 처리
  deductionInput: giftDeductionInputSchema,
  // ...
});
```

---

## 5. 케이스 매트릭스

### 갭 A: §57 단서 (3가지 주요 케이스)

| donor | isSection57ProvisoApplied | 예상 결과 |
|---|---|---|
| grandparent | false (기본) | 세대생략 할증 30% (또는 40%) 적용 |
| grandparent | true | 세대생략 할증 0원, 단서 배제 표시 |
| father / mother / 기타 | n/a (UI 미노출, undefined) | 세대생략 할증 미적용 (donorGroup != "B") |

### 갭 B: §53의2 기공제 누적 (4가지 주요 케이스)

| donorRelation | marriageExemption | birthExemption | cumulativeMarriageBirthUsed | 예상 공제 |
|---|---|---|---|---|
| lineal_ascendant_adult | 0 | 0 | 0 | 0원 |
| lineal_ascendant_adult | 80,000,000 | 0 | 0 | 80,000,000원 |
| lineal_ascendant_adult | 80,000,000 | 0 | 40,000,000 | min(80,000,000, 1억-4천만) = 60,000,000원 |
| lineal_ascendant_adult | 60,000,000 | 60,000,000 | 0 | min(1.2억, 1억) = 100,000,000원 |
| lineal_ascendant_adult | 60,000,000 | 60,000,000 | 70,000,000 | min(1.2억, 1억-7천만) = min(1.2억, 3천만) = 30,000,000원 |
| spouse | 80,000,000 | 0 | 0 | 0원 (§53의2 비적용) |

---

## 6. Definition of Done 체크리스트 (Do 단계용)

Do 착수 전 엔진 시니어가 확정해야 하는 사항:

- [ ] `GiftTaxInput` 신규 필드명 확정 (예: `isSection57ProvisoApplied?: boolean`)
- [ ] `GiftDeductionInput` 신규 필드명 확정 (예: `cumulativeMarriageBirthUsed?: number`)
- [ ] `GiftTaxResult` echo 필드 추가 여부 (§57 단서 배제 사유 표시용 `isSection57ProvisoApplied?: boolean`)

Do 완료 기준:

- [ ] ① FormState 타입에 `isSection57ProvisoApplied: boolean`, `cumulativeMarriageBirthUsed: string` 추가
- [ ] ② INITIAL_FORM 초기값 반영
- [ ] ③ normalize — boolean/string 신규 필드는 INITIAL_FORM 기본값으로 자동 처리 확인
- [ ] ④ `buildGiftTaxInput` — 두 필드 모두 엔진 input 매핑
- [ ] ⑤ Step0 ToggleCard (rose, donor=grandparent 조건), Step3 CurrencyInput (혼인출산 섹션 내) 구현
- [ ] ⑥ 사이드바 없음 — skip
- [ ] ⑦ GiftTaxResultView — §57 단서 배제 안내 div, 혼인·출산 공제 breakdown 산식 자동 반영 확인
- [ ] ⑧ validateStep step 0 (grandparent 이외 isSection57ProvisoApplied strip 보장), step 3 (cumulativeMarriageBirthUsed 상한 1억 검증)
- [ ] ⑨ `giftTaxInputSchema`에 `isSection57ProvisoApplied: z.boolean().optional()` 추가
- [ ] ⑩ `giftDeductionInputSchema`에 `cumulativeMarriageBirthUsed: z.number().min(0).max(100_000_000).optional()` 추가
- [ ] ⑫ Zod 입력 객체 정의 일치 확인 (⑩ 수정이 자동 반영됨)
- [ ] ⑬ `GiftTaxForm.tsx:128` fetch body는 `buildGiftTaxInput(form)` 호출 — ④ 수정으로 자동 반영
- [ ] ⑭ `app/api/calc/gift/route.ts:64` — `parsed.data as unknown as GiftTaxInput` 패턴 유지, 추가 수정 불필요
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/gift-tax/` 통과
- [ ] 브라우저 수동 확인: 조부모 선택 시 §57 단서 토글 노출, 혼인·출산 섹션 내 기공제 필드 노출, Network 탭 request body에 신규 필드 포함 확인
