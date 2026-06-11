# 조특법 §30의5·§30의6 증여세 과세특례 법문 드리프트 수정 — UI 디자인 문서

> 작성일: 2026-06-11 | 에이전트: inheritance-gift-tax-ui-senior
> 엔진 시니어와 동시 설계, Do 단계는 엔진 선처리 후 UI 시작.

---

## 1. 엔진 변경 요약 (UI 영향 입력)

| 구분 | 현행 코드 상태 | 엔진 시니어 변경 예정 |
|---|---|---|
| §30의5 과세가액 한도 캡 | `StartupFundTaxInput`에 한도 캡 없음 (`special-tax-treatment.ts` 전체) | 한도 50억(일반) / 100억(10명 이상 신규 고용) 캡 신설. `StartupFundTaxInput.startupNewHiresAtLeast10?: boolean` 추가 |
| §30의5 세율 | 현행 코드 주석(line 8)에 "10%(50억 이하)/20%(초과)" — 법문 정합 (기존 드리프트 이미 정정) | 현행 유지 |
| §30의6 한도 | 현행 코드(line 13~14): "10%(600억 이하) / 20년 이상 500억 / 30년 이상 600억" — 법문 정합 | 현행 유지 (400억·20년 구간 드리프트 정정은 엔진 내부) |
| §69 신고세액공제 배제 | `calcGiftTaxCredits`에 §30의5⑪ 배제 로직 없음 — 특례 선택 시에도 `filingCredit > 0` 가능 | `creditInput.specialTreatment === "startup"` 시 `filingCredit = 0` 강제 (`inheritance-gift-tax-credit.ts` L471~478 부근) |

**UI 신규 필드**: `startupNewHiresAtLeast10: boolean` (FormState ①에 추가)

---

## 2. 14개 동기화 지점 — `startupNewHiresAtLeast10`

### ① FormState 타입

**파일**: `components/calc/gift-tax-form-shared.tsx` L71~73

현행:
```typescript
specialTreatment: "" | "startup" | "family_business";
/** 창업자금 §30의5④ — 투자 완료 여부 (startup 선택 시 노출) */
startupInvestmentCompleted: boolean;
```

추가:
```typescript
specialTreatment: "" | "startup" | "family_business";
/** 창업자금 §30의5④ — 투자 완료 여부 (startup 선택 시 노출) */
startupInvestmentCompleted: boolean;
/** 창업자금 §30의5① — 10명 이상 신규 고용 여부 (한도 50억 → 100억, startup 선택 시 노출) */
startupNewHiresAtLeast10: boolean;
```

### ② initial value

**파일**: `components/calc/gift-tax-form-shared.tsx` L98~99 (`INITIAL_FORM`)

현행:
```typescript
startupInvestmentCompleted: false,
```

추가:
```typescript
startupInvestmentCompleted: false,
startupNewHiresAtLeast10: false,
```

### ③ normalize fallback

`normalizeForm` 또는 sessionStorage 마이그레이션 함수가 있으면 `startupNewHiresAtLeast10: form.startupNewHiresAtLeast10 ?? false` 추가.
현재 gift 폼에 명시적 normalize 함수 없음 — zustand `partialize` + `merge`로 관리. 확인 필요: `lib/stores/calc-wizard-migration.ts`에 gift 폼 관련 마이그 분기가 있는지 검토 후 `startupNewHiresAtLeast10 ?? false` fallback 삽입.

### ④ API 변환 (`lib/calc/gift-api.ts`)

**파일**: `lib/calc/gift-api.ts` L53~62 (`creditInput` 조립)

현행 (`startupInvestmentCompleted` 패턴 — L57~61):
```typescript
// G-M7: startupInvestmentCompleted — startup 선택 시에만 전달
startupInvestmentCompleted:
  form.specialTreatment === "startup"
    ? form.startupInvestmentCompleted
    : undefined,
```

추가 (동일 3중 패턴 적용):
```typescript
// G-M8: startupNewHiresAtLeast10 — startup 선택 시에만 전달
startupNewHiresAtLeast10:
  form.specialTreatment === "startup"
    ? form.startupNewHiresAtLeast10
    : undefined,
```

**3중 패턴 근거**: `startupInvestmentCompleted`와 동일 — `specialTreatment !== "startup"`이면 `undefined` strip. API 변환(④)·validate(⑧)·UI 노출 조건(⑤) 세 곳 모두 동일 `specialTreatment === "startup"` 조건으로 일치.

### ⑤ UI 위젯

**파일**: `components/calc/gift-tax-form-shared.tsx` L596~605 (`Step3` 내 startup 조건부 블록)

현행 위치 (L596~605):
```tsx
{/* G-M7: 창업자금 투자 완료 여부 (§30의5④) — startup 선택 시 노출 */}
{form.specialTreatment === "startup" && (
  <ToggleCard
    tone="emerald"
    title="창업자금 투자 완료 (§30의5④)"
    description="증여일로부터 2년 이내 창업법인 설립 및 투자 완료 여부. 미완료 시 과세특례 미적용."
    checked={form.startupInvestmentCompleted}
    onCheckedChange={(v) => set({ startupInvestmentCompleted: v })}
  />
)}
```

추가 위젯 (기존 G-M7 ToggleCard 바로 아래):
```tsx
{/* G-M8: 10명 이상 신규 고용 여부 (§30의5①) — startup 선택 시 노출 */}
{form.specialTreatment === "startup" && (
  <ToggleCard
    tone="emerald"
    title="창업을 통하여 10명 이상 신규 고용 (§30의5①)"
    description="창업자금 증여세 과세특례 적용 한도: 10명 이상 신규 고용 시 100억원, 그 외 50억원 (조특법 §30의5①)."
    checked={form.startupNewHiresAtLeast10}
    onCheckedChange={(v) => set({ startupNewHiresAtLeast10: v })}
  />
)}
```

**노출 조건**: `form.specialTreatment === "startup"` 시만 렌더 — 기존 `startupInvestmentCompleted`(G-M7)과 동일 조건. `specialTreatment`가 `"family_business"` 또는 `""`(none)이면 미노출.

**onChange 초기화 연동**: `specialTreatment` 라디오 변경 시 기존 코드(L583~585)에서 `val !== "startup"` 이면 `startupInvestmentCompleted: false` 초기화하고 있음. 동일 패턴으로 `startupNewHiresAtLeast10: false`도 함께 초기화.

```typescript
// L580~586 onChange 수정:
onChange={(v) => {
  const val = v === "none" ? "" : v;
  set({
    specialTreatment: val,
    ...(val !== "startup" ? {
      startupInvestmentCompleted: false,
      startupNewHiresAtLeast10: false,   // 추가
    } : {}),
  });
}}
```

**tone**: emerald (기존 `startupInvestmentCompleted` 토글과 동일 — 창업·가업 특례 그룹)

**UI 순서 = 엔진 계산 순서 원칙**: 엔진 `calcStartupFundSpecialTax`는 ① 투자완료 체크 → ② 과세표준 산정 → ③ 세율 적용 → ④ 한도 캡 적용 순이므로, G-M7(투자완료) → G-M8(고용한도) 순서 유지.

### ⑥ 사이드바 합계

`startupNewHiresAtLeast10`은 boolean toggle이므로 금액이 없다. 사이드바 금액 합계에 영향 없음 — 동기화 불필요.

### ⑦ 결과 카드

**파일**: `components/calc/TaxCreditBreakdownCard.tsx` L458~462 (조특법 과세특례 행)

현행:
```tsx
<CreditRow
  label="조특법 과세특례 (창업·가업)"
  amount={credit.specialTreatmentCredit}
  lawRef="조특 §30의5·§30의6"
/>
```

`specialTreatmentCredit`은 이미 엔진이 한도 캡 적용 후의 최종 절감액을 반환하므로 UI는 금액 그대로 표시. 별도 변경 불필요.

다만 한도 적용 사실을 결과 카드에서 알 수 있도록 엔진 `breakdown`에 한도 캡 적용 라인이 포함될 것(엔진 시니어 책임). `TaxCreditBreakdownCard`는 `breakdown` 목록을 펼침으로 이미 표시하므로 추가 UI 변경 없이 자동 노출됨.

### ⑧ Validation (`lib/calc/gift-validate.ts`)

**확인 필요**: `gift-validate.ts` 파일이 존재하는지 확인. 현행 `validateStep`은 `gift-tax-form-shared.tsx` L247~302에 inline으로 정의됨 (별도 `gift-validate.ts` 미발견).

`startupNewHiresAtLeast10`은 boolean toggle로 validation 차단 조건 없음 (켜거나 끄는 것 모두 유효). validate에서 추가 처리 불필요.

단, 기존 `startupInvestmentCompleted` 패턴처럼 3중 패턴 원칙 준수: API 변환에서 `specialTreatment !== "startup"` 시 `undefined` strip → validate에서는 이 필드에 대해 별도 강제 차단 없음 → UI 통과/차단 모순 없음.

### ⑨ Zod enum 메인

`lib/validators/gift-aux-schemas.ts` L36~41 (`giftTaxCreditInputSchema`) 에서 `startupNewHiresAtLeast10` 추가:

현행 (L36~41):
```typescript
export const giftTaxCreditInputSchema = z.object({
  foreignTaxPaid: z.number().nonnegative().optional(),
  isFiledOnTime: z.boolean(),
  specialTreatment: z.enum(["startup", "family_business"]).optional(),
  startupInvestmentCompleted: z.boolean().optional(),
});
```

추가:
```typescript
export const giftTaxCreditInputSchema = z.object({
  foreignTaxPaid: z.number().nonnegative().optional(),
  isFiledOnTime: z.boolean(),
  specialTreatment: z.enum(["startup", "family_business"]).optional(),
  startupInvestmentCompleted: z.boolean().optional(),
  startupNewHiresAtLeast10: z.boolean().optional(),    // 추가
});
```

### ⑩ Zod enum 컴패니언 + addPropertyRefines

증여세 Route 파일에 별도 `addPropertyRefines` 패턴이 있는지 확인 필요.
**실측 필요**: `app/api/calc/gift-tax/route.ts` 내 Zod schema 조립 위치 확인 후 `giftTaxCreditInputSchema` 사용 경로 추적. 현재 `gift-aux-schemas.ts`의 `giftTaxCreditInputSchema`가 Route에서 직접 사용되는 구조이므로 ⑨ 수정으로 ⑩도 자동 반영될 가능성 높음 — Do 단계에서 grep 실증 필요.

### ⑪ 자산-수준 acquisitionDate fallback

증여세 특례 필드는 자산-수준이 아닌 폼-전역 creditInput 소속이므로 해당 없음.

### ⑫ Zod 입력 객체 정의

`GiftTaxCreditInput` 타입 (`lib/tax-engine/types/inheritance-tax-credit.types.ts` L83~92):

현행:
```typescript
export interface GiftTaxCreditInput {
  foreignTaxPaid?: number;
  isFiledOnTime: boolean;
  specialTreatment?: "startup" | "family_business";
  startupInvestmentCompleted?: boolean;
}
```

추가 (엔진 시니어가 수행):
```typescript
export interface GiftTaxCreditInput {
  foreignTaxPaid?: number;
  isFiledOnTime: boolean;
  specialTreatment?: "startup" | "family_business";
  startupInvestmentCompleted?: boolean;
  /** 창업자금 10명 이상 신규 고용 여부 — 한도 캡 50억 → 100억 (§30의5①) */
  startupNewHiresAtLeast10?: boolean;
}
```

⑫는 엔진 시니어 책임. UI 시니어는 Do 단계에서 이 타입이 추가된 후 ①④⑨를 정렬.

### ⑬ callGiftTaxAPI body spread

`lib/calc/gift-api.ts`의 `buildGiftTaxInput`은 `creditInput` 객체를 spread 없이 직접 구성하므로 별도 spread 동기화 불필요. ④ 지점(L53~62)에서 명시 매핑으로 전달됨.

### ⑭ Route handler 엔진 input 매핑

`app/api/calc/gift-tax/route.ts`에서 `creditInput`은 Zod parse 후 그대로 엔진에 전달될 것으로 예상. Do 단계에서 Route 파일 실측 후 `startupNewHiresAtLeast10` 필드가 엔진까지 전달되는 경로 확인.

---

## 3. 결과 화면 영향 분석

### 3.1 §69 신고세액공제 0 처리 — TaxCreditBreakdownCard

**현행 상태**: `inheritance-gift-tax-credit.ts` L471~478에서 특례 선택 시 `§30의5⑪` 배제 로직 없음. `remainingTax`에서 `specialTreatmentCredit`을 차감하고 남은 금액의 3%를 `filingCredit`으로 계산 중 (L473~476).

**엔진 시니어가 추가할 로직**: `creditInput.specialTreatment === "startup"` 시 `filingCredit = 0` 강제. 엔진 `breakdown`에 "§30의5⑪ 규정 — 창업자금 특례 선택 시 신고세액공제 배제" 항목 추가.

**UI 영향**:
- `TaxCreditBreakdownCard`의 `CreditRow` (L452~457):
  ```tsx
  <CreditRow
    label="신고세액공제 (3%)"
    amount={credit.filingCredit}  // 0이면 CreditRow 내부 "if (amount === 0) return null" → 행 미렌더
    lawRef="§69"
    formula={section69Formula}
  />
  ```
  `CreditRow` (L302~304): `if (amount === 0) return null` — 0이면 행 자체 미노출.

- **배제 사유 안내 필요성**: `filingCredit = 0`이면 `CreditRow`가 null을 반환해 행이 아예 사라짐. 사용자 입장에서 "신고세액공제가 왜 없지?"라는 의문이 생길 수 있음.
  
  **설계 결정**: 엔진 `breakdown`에 배제 사유 라인이 이미 포함되면 `TaxCreditBreakdownCard`의 "펼침" 영역에서 확인 가능. 하지만 `CreditRow`가 0이면 펼침 자체가 렌더되지 않으므로 사유 안내가 사용자에게 전달되지 않는 문제 있음.
  
  **해결 방안**: `CreditRow`에 `zeroReason?: string` prop 신설 — `amount === 0 && zeroReason` 이면 행을 미노출하는 대신 회색 안내 행 표시. 또는 특례 선택 시 신고세액공제 행 아래 note 표시.
  
  **권장**: `zeroReason` prop 신설보다 단순한 방법 — `section69Formula` 빌더에서 `filingCredit === 0 && specialTreatmentCredit > 0` 케이스를 감지하여 "§30의5⑪ — 창업자금 과세특례 선택 시 신고세액공제 배제" 안내 React 노드를 반환하고, `CreditRow`에 `amount={0}`이어도 `formula`가 있으면 행을 렌더하도록 `CreditRow` 조건 수정. 구체적으로:
  
  ```
  CreditRow (현행): if (amount === 0) return null;
  CreditRow (수정): if (amount === 0 && !formula) return null;
  ```
  
  이렇게 하면 `filingCredit = 0`이어도 `formula`(배제 사유 안내)가 있으면 행이 렌더됨.
  
  `buildSection69Formula` 빌더 수정 사항:
  - 입력에 `specialTreatmentCredit > 0 && filingCredit === 0` 케이스 분기 추가
  - 이 경우 "신고세액공제 = 0 (§30의5⑪ — 창업자금 특례 선택 시 배제)" 안내 노드 반환

### 3.2 별지 10호 (gift-tax-filing-form-besshi10.ts) §69 행

**파일**: `lib/tax-engine/gift-tax-filing-form-besshi10.ts` L140

```typescript
{ number: "㊵", column: "right", label: "신고세액공제", amount: r.creditDetail.filingCredit, display: "amount", lawRef: "§69" },
```

`filingCredit = 0`이면 ㊵ 행에 `0`이 그대로 표시됨. 별지 서식 특성상 0 표시가 정합 — 법정 서식이므로 행 삭제 불가. 별도 UI 변경 불필요.

### 3.3 한도 초과분 일반과세 표시

**현행 엔진**: `calcStartupFundSpecialTax` L104에서 `taxBase = Math.max(0, giftAmount - STARTUP_BASE_DEDUCTION)` — 과세가액 한도 캡 없음. 엔진 시니어가 `startupNewHiresAtLeast10`을 받아 `Math.min(giftAmount, CAP_AMOUNT)` 적용 후 초과분 일반세율 처리할 예정.

**UI 영향**: 엔진 `breakdown`에 "한도 초과 — 50억/100억 초과분 일반 증여세 적용" 항목이 추가되면 `TaxCreditBreakdownCard` 펼침 영역에서 자동 노출됨. 별도 UI 추가 불필요.

---

## 4. E2E 시나리오 설계

### 시나리오: [E2E-GST-1] 창업자금 특례 + 신규 고용 토글 → 한도 100억 반영 + §69 배제 확인

```
파일: e2e/gift-special-treatment-startup.spec.ts

시나리오:
  증여일: 2025-01-01
  증여자: 부(father)
  증여재산: 토지 / 평가액 6,000,000,000 (60억)
  Step3 — 조특법 과세특례: startup 선택
  G-M7(투자완료) ON
  G-M8(신규 고용 10명 이상) ON
  → 계산 실행
  결과 검증:
    1. 세액공제 내역 카드에 "조특법 과세특례 (창업·가업)" 행 표시
    2. 신고세액공제 행: amount=0이면 §30의5⑪ 배제 안내 표시 (또는 0으로 표시)
    3. 별지10호 ㊵ 행에 0 표시 (법정 서식 정합)
```

**E2E 구현 주의 (기존 gift E2E 헬퍼 패턴)**:

1. `addLandAsset` 헬퍼 사용 + `keepModalOpen: true` 후 `page.getByPlaceholder(/본가 토지/).fill("본가 토지")` — 자산명 모달 내 입력 필수.
2. `page.getByRole("dialog").getByRole("button", { name: "닫기" }).click()` 후 모달 닫기 확인.
3. Step1→2→3 이동: `nextSteps(page, 2)` (헬퍼 사용).
4. Step3 — 조특법 과세특례 RadioCardGroup에서 "startup" 선택:
   ```typescript
   await page.getByText("창업자금 증여세 과세특례 (§30의5)").click();
   ```
5. G-M7 토글 ON:
   ```typescript
   await page.getByText("창업자금 투자 완료 (§30의5④)").click();
   ```
6. G-M8 토글 ON:
   ```typescript
   await page.getByText("창업을 통하여 10명 이상 신규 고용 (§30의5①)").click();
   ```
7. 계산: `calcAndWaitResult(page, { taxType: "gift" })`.
8. 결과 검증: `expect(page.getByText("조특법 과세특례 (창업·가업)")).toBeVisible()`.

**함정 주의** (memory: `project_gift_57_proviso_53_2_cumulative`):
- `addLandAsset` + `keepModalOpen` 패턴: 토지 카테고리 자산명은 모달 내 placeholder `/본가 토지/` fill 필수. 모달 닫기 전 `estate-edit-dialog` hidden 확인.
- worktree 실행 시 `E2E_PORT=3100` 필수.

---

## 5. 케이스 매트릭스

| specialTreatment | startupNewHiresAtLeast10 | 과세가액 한도 | §69 filingCredit | UI G-M8 노출 |
|---|---|---|---|---|
| `""` (none) | false (초기화) | 해당 없음 (일반 증여세) | 정상 계산 | 미노출 |
| `"startup"` | false | 50억 캡 | 0 (§30의5⑪ 배제) | 노출 |
| `"startup"` | true | 100억 캡 | 0 (§30의5⑪ 배제) | 노출 |
| `"family_business"` | false (초기화) | 가업 한도 별도 | 정상 계산 | 미노출 |

---

## 6. 자가 점검 체크리스트 (Do 단계 완료 전 필수)

- [ ] ① `FormState` — `startupNewHiresAtLeast10: boolean` 추가
- [ ] ② `INITIAL_FORM` — `startupNewHiresAtLeast10: false` 추가
- [ ] ③ normalize/migration — `startupNewHiresAtLeast10 ?? false` fallback
- [ ] ④ `gift-api.ts` `creditInput` — `startup` 시만 전달 (3중 패턴)
- [ ] ⑤ UI 위젯 — `specialTreatment === "startup"` 조건 ToggleCard + onChange 초기화 연동
- [ ] ⑥ 사이드바 — 해당 없음 (boolean)
- [ ] ⑦ 결과 카드 — `TaxCreditBreakdownCard` `CreditRow` 0+formula 렌더 수정 + §30의5⑪ 배제 안내
- [ ] ⑧ validation — 차단 조건 없음, 3중 패턴 모순 없음 확인
- [ ] ⑨ `giftTaxCreditInputSchema` — `startupNewHiresAtLeast10: z.boolean().optional()`
- [ ] ⑩ Route Zod 조립 실측 — ⑨ 수정으로 자동 반영 여부 확인
- [ ] ⑫ `GiftTaxCreditInput` 타입 추가 — 엔진 시니어 완료 후 확인
- [ ] ⑬ `buildGiftTaxInput` body — 명시 매핑 확인 (spread 아님)
- [ ] ⑭ Route handler 엔진 input 매핑 — `startupNewHiresAtLeast10` 전달 경로 실측
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/inheritance-gift/` 회귀 통과
- [ ] E2E spec 작성 완료 (서버 미실행 시 명시)
- [ ] 브라우저 확인 또는 미수행 명시

---

## 7. 참조 — 현행 코드 위치 (실측)

| 항목 | 파일 | 라인 |
|---|---|---|
| `FormState` 타입 (specialTreatment 등) | `components/calc/gift-tax-form-shared.tsx` | L71~73 |
| `INITIAL_FORM` | `components/calc/gift-tax-form-shared.tsx` | L98~99 |
| `validateStep` | `components/calc/gift-tax-form-shared.tsx` | L247~302 |
| RadioCardGroup 조특법 과세특례 | `components/calc/gift-tax-form-shared.tsx` | L576~593 |
| G-M7 ToggleCard (투자완료) | `components/calc/gift-tax-form-shared.tsx` | L597~605 |
| `buildGiftTaxInput` `creditInput` 조립 | `lib/calc/gift-api.ts` | L53~62 |
| `giftTaxCreditInputSchema` | `lib/validators/gift-aux-schemas.ts` | L36~41 |
| `GiftTaxCreditInput` interface | `lib/tax-engine/types/inheritance-tax-credit.types.ts` | L83~92 |
| `calcGiftTaxCredits` §69 적용 | `lib/tax-engine/inheritance-gift-tax-credit.ts` | L471~478 |
| `calcStartupFundSpecialTax` | `lib/tax-engine/credits/special-tax-treatment.ts` | L83~167 |
| `StartupFundTaxInput` | `lib/tax-engine/credits/special-tax-treatment.ts` | L59~70 |
| `CreditRow` (`amount === 0` 조건) | `components/calc/TaxCreditBreakdownCard.tsx` | L302~304 |
| `buildSection69Formula` | `components/calc/TaxCreditBreakdownCard.tsx` | L233~287 |
| 별지10호 ㊵ 신고세액공제 행 | `lib/tax-engine/gift-tax-filing-form-besshi10.ts` | L140 |
| 기존 gift E2E 헬퍼 패턴 | `e2e/gift-57-proviso-substitute-gift.spec.ts` | L66~74 |
| E2E 헬퍼 시그니처 | `e2e/_helpers/tax-flow.ts` | L81~171 |
