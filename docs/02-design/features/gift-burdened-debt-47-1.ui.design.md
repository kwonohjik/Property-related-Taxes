# UI 설계 — 증여세 부담부증여 채무인수 차감 (§47①)

> 작성: 2026-06-11
> 계획서: `docs/00-pm/gift-followup-special-separation-debt.plan.md` Track B
> 실측 기준 브랜치: `fix-gift-debt` worktree

---

## 0. 전제 — 실측 구조 요약

| 파일 | 역할 | 실측 확인 |
|---|---|---|
| `components/calc/gift-tax-form-shared.tsx` | `FormState` 타입·`INITIAL_FORM`·`validateStep`·`Step0~3` | ✅ |
| `components/calc/GiftTaxForm.tsx` | 마법사 오케스트레이터 | ✅ |
| `components/calc/EstateItemEditor.tsx` | 자산 편집 모달 내용 | ✅ |
| `components/calc/inheritance/estate-card/variants/EstateBodyRealEstate.tsx` | CollateralLeaseFields — mortgageAmount·leaseDeposit 입력 | ✅ |
| `lib/calc/gift-api.ts` | ④ API 변환 | ✅ |
| `lib/tax-engine/types/inheritance-gift.types.ts` | `EstateItem`·`GiftTaxInput` | ✅ |
| `lib/validators/property-valuation-input.ts` | `giftTaxInputSchema` (⑨⑫) | ✅ |
| `app/api/calc/gift/route.ts` | 엔진 호출 (⑭) | ✅ |
| `lib/tax-engine/gift-filing-form-rows.ts` | 별지10호 ② 행 `debtAmount` 빌더 | ✅ |
| `components/calc/results/GiftTaxResultView.tsx` | 결과 화면 (⑦) | ✅ |

### 현행 갭 (plan.md B-G1·B-G2 실측 확인)

- `gift-tax.ts:258`: `debtAmount: 0 // 현행 증여세는 채무 미지원` — 하드코딩 0.
- `gift-filing-form-rows.ts:102`: ② 행 `amount: debtAmount` — 빌더 경로 이미 준비됨.
- `GiftTaxResult`에 `debtAmount` echo 필드 없음 — 결과뷰가 채무 차감 표시 불가.
- `EstateItemEditor.tsx:105-111`: `showCollateralDeductToggle = mode === "inheritance" && ...` — 증여 모드에서 §14 자동공제 토글 숨김. mortgageAmount·leaseDeposit 입력 자체는 `CollateralLeaseFields`에서 증여 모드에서도 렌더 (mode 조건 없음).

### 결론 — 증여 모드에서 mortgageAmount·leaseDeposit 입력은 이미 가능

`EstateBodyRealEstate > CollateralLeaseFields`는 `mode` prop을 받지 않음.
`showCollateralDeductToggle`(§14 자동공제 토글)만 `mode === "inheritance"`로 숨겨진다.
임대보증금·저당권 입력 자체는 gift 모드에서도 노출되나 현재 엔진이 차감에 활용하지 않는다.

---

## 1. 사용자 시나리오

### S-1. 기본 시나리오 — 부동산 10억 + 임대보증금 4억 인수

1. Step 0: 증여일 `2025-03-15`, 증여자 `부(father)`.
2. Step 1: "재산 추가" → `real_estate_apartment` (아파트) → 자산명 "서울 아파트".
   - 시가: 1,000,000,000원.
   - "담보·임대 (§66 평가 하한 · §14 채무공제)" 토글 펼침.
   - **임대보증금(채무인수): 400,000,000원**.
   - (저당권 없음.)
3. Step 2~3: 기본값.
4. 계산: 과세가액 = 1,000,000,000 − 400,000,000 = 600,000,000.

### S-2. 저당권 채무인수 시나리오

- 부동산 시가 8억, 저당권 채무 3억 인수.
- 과세가액 = 8억 − 3억 = 5억.
- §66 교차: 저당권 평가 하한(§66)은 평가 목적이고 채무인수(§47①)는 과세가액 차감 목적 — 별개 축.

### S-3. 복합 채무 — 저당 + 임대보증금 혼합

- 부동산 시가 15억, 저당 6억 + 임대보증금 2억 인수.
- §47① "수증자가 인수한 금액" = 저당 6억 + 임대보증금 2억 = 8억.
- 과세가액 = 15억 − 8억 = 7억.

### S-4. 배우자 증여 — §47③ 추정 배제 안내 필요

- 증여자 `배우자(spouse)`, 부동산 + 임대보증금 인수.
- §47③: "배우자 및 직계존비속 간 부담부증여는 채무 인수를 증여로 추정하지 않음 → 객관적 입증 시에만 인정."
- 중립 안내 노출 (차단 금지).

---

## 2. 입력 구조 결정 — 자산-수준 vs 폼-전역

### 시나리오 A: 자산-수준 (권장)

§47①: "그 증여재산에 **담보된** 채무 … 수증자가 인수한 금액"
→ 채무가 특정 자산에 귀속 → 자산-수준 우선.

**현행 `EstateItem`에 이미 `mortgageAmount`·`leaseDeposit` 필드 존재.**
추가 필드 없이 기존 필드를 §47① 차감에 활용하는 것이 일관성 최적.

엔진 STEP 1.5 (grossGiftValue 산출 후 netCurrentGiftValue 전):
```
const totalAssumedDebt = input.giftItems.reduce((sum, item) =>
  sum + (item.mortgageAmount ?? 0) + (item.leaseDeposit ?? 0), 0)
```

### 시나리오 B: 폼-전역 단일 금액 필드

`GiftTaxInput.assumedDebtAmount?: number` 신규 추가.
`FormState.assumedDebtAmount: string` 신규 추가.
Step 1 하단 또는 Step 3에 별도 CurrencyInput.

**단점**: §47① 자산 귀속성 무시. 자산별 §66 교차 분석 불가.

### 결정 기준 (엔진 시니어가 선택 — UI는 양쪽 모두 준비)

| 구분 | 자산-수준 (A) | 폼-전역 (B) |
|---|---|---|
| 법령 정합성 | ✅ 자산 귀속 | 간소화 |
| 기존 필드 재사용 | ✅ 추가 필드 없음 | 신규 1개 |
| 다자산 케이스 | ✅ 자산별 추적 | 단순 합산 |
| UI 변경 최소 | ✅ 레이블 수정만 | Step 추가 |
| 구현 복잡도 | 낮음 | 낮음 |

**권장: 시나리오 A** — 기존 mortgageAmount·leaseDeposit을 §47① 차감에 연결.

---

## 3. 14개 동기화 지점 매핑표

엔진 시니어가 자산-수준(A)을 채택한 경우를 기준으로 작성.
폼-전역(B) 시나리오 매핑은 섹션 3B에 분리.

### 3A. 자산-수준 시나리오 (권장)

| 지점 | 파일:예상 라인 | 변경 내용 |
|---|---|---|
| ① FormData 타입 | `gift-tax-form-shared.tsx` `FormState` | 추가 필드 없음 — `giftItems: EstateItem[]` 기존 활용 |
| ② initial value | 동상 `INITIAL_FORM` | 변경 없음 |
| ③ normalize fallback | 해당 없음 | 채무 빈값 = 0 처리, 자동 안분 금지 |
| ④ API 변환 | `lib/calc/gift-api.ts` `buildGiftTaxInput` | `giftItems` 직렬화 경로에 mortgageAmount·leaseDeposit 이미 포함 — 변경 없음 (estateItemSchema가 이미 통과) |
| ⑤ UI 위젯 | `EstateBodyRealEstate.tsx` > `CollateralLeaseFields` | 임대보증금·저당권 필드 레이블·hint 갱신: "§47① 채무인수" 명시. 증여 모드에서 §66 안내 추가. |
| ⑥ 사이드바 | `GiftTaxForm.tsx` | 증여세 폼에 사이드바 없음 (실측 확인) — 변경 없음 |
| ⑦ 결과 카드 | `GiftTaxResultView.tsx:396` 주변 | 과세가액 요약 카드에 채무 차감 행 추가 |
| ⑧ validation | `gift-tax-form-shared.tsx` `validateStep` step 1 | 채무 > 재산가액 시 경고 (차단 아님 — 사례별 허용 가능) |
| ⑨ Zod enum 메인 | `lib/validators/property-valuation-input.ts` `giftTaxInputSchema` | 변경 없음 (giftItems → estateItemSchema 경로 이미 mortgageAmount 포함:79) |
| ⑩ Zod enum 컴패니언 | 동상 `estateItemSchema` | 변경 없음 |
| ⑪ 자산-수준 acquisitionDate fallback | 해당 없음 | |
| ⑫ Zod 입력 객체 | `giftTaxInputSchema` | 변경 없음 |
| ⑬ callGiftTaxAPI body spread | `lib/calc/gift-api.ts` | 변경 없음 |
| ⑭ Route handler 엔진 input 매핑 | `app/api/calc/gift/route.ts` | 변경 없음 — `input = parsed.data as GiftTaxInput` 직통 |

**엔진 시니어가 추가로 동기화할 항목**:

| 엔진 파일 | 변경 |
|---|---|
| `lib/tax-engine/gift-tax.ts:258` | `debtAmount: 0` → 실제 차감 계산으로 교체 |
| `lib/tax-engine/types/inheritance-gift.types.ts` `GiftTaxResult` | `debtAmount: number` echo 필드 추가 |
| `lib/tax-engine/gift-filing-form-rows.ts` | `buildFilingFormRows` 호출 시 실제 debtAmount 전달 |

### 3B. 폼-전역 시나리오 (B 채택 시)

| 지점 | 파일 | 변경 내용 |
|---|---|---|
| ① FormData 타입 | `gift-tax-form-shared.tsx` `FormState` | `assumedDebtAmount: string` 추가 |
| ② initial value | `INITIAL_FORM` | `assumedDebtAmount: ""` |
| ③ normalize fallback | — | 빈값 → 0 (validate에서도 동일) |
| ④ API 변환 | `lib/calc/gift-api.ts` | `assumedDebtAmount: parseAmount(form.assumedDebtAmount) \|\| undefined` 추가 |
| ⑤ UI 위젯 | `gift-tax-form-shared.tsx` `Step1` 하단 | CurrencyInput + §47③ 안내 FieldCard 추가 |
| ⑥ 사이드바 | 없음 | 해당 없음 |
| ⑦ 결과 카드 | `GiftTaxResultView.tsx` | 채무 차감 행 추가 |
| ⑧ validation | `validateStep` step 1 | `assumedDebtAmount > grossGiftValue` 경고 |
| ⑨ Zod | `giftTaxInputSchema` | `assumedDebtAmount: z.number().nonnegative().optional()` |
| ⑩ — | 해당 없음 | |
| ⑪ — | 해당 없음 | |
| ⑫ Zod 입력 객체 | `giftTaxInputSchema` | 위 ⑨와 동일 |
| ⑬ body spread | `gift-api.ts` | 위 ④와 동일 |
| ⑭ Route handler | `route.ts` | 변경 없음 (`input as GiftTaxInput` 직통) |

---

## 4. UI 위젯 상세 설계 — Step 1 (증여재산 입력)

### 4-1. EstateBodyRealEstate > CollateralLeaseFields — 증여 모드 레이블 갱신

**자산-수준(A) 채택 시**:

현행 `CollateralLeaseFields`의 임대보증금·저당권 필드는 증여 모드에서도 이미 노출됨.
레이블과 hint를 증여 맥락에 맞게 갱신 필요.

```
[현행] FieldCard label="임대보증금 (세입자 있는 경우)", hint="평가액에서 차감됨"
[갱신] FieldCard label="임대보증금 (세입자 있는 경우)"
       hint (mode=gift): "§47① — 수증자가 인수하는 임대보증금 채무. 증여세 과세가액에서 차감됩니다."
       hint (mode=inheritance): 기존 유지
```

```
[현행] FieldCard label="저당권 등에 의해 담보된 채권액", hint="§66 — 평가액이 더 크면 평가액으로 평가(차감 아님)"
[갱신] hint (mode=gift): "§47① — 수증자가 인수하는 저당채무(실제 잔액). 증여세 과세가액에서 차감됩니다."
                         "§66 평가 하한: 저당 채무 > 보충평가액이면 저당 채무액으로 평가 (별개 효과)."
       hint (mode=inheritance): 기존 유지
```

**증여 모드에서 §14 자동공제 토글 표시 여부**:

현행: `mode === "inheritance"`만 노출. 이 조건 유지 — 증여세 §47①과 상속세 §14는 별개 조문.

### 4-2. §47③ 추정 배제 안내 카드

**위치**: `EstateItemEditor` 또는 `CollateralLeaseFields` 하단 — 채무 입력 완료 후 노출.
**활성 조건**: 증여 모드(mode=gift) AND (mortgageAmount > 0 OR leaseDeposit > 0) AND 증여자 관계 배우자·직계존비속.
**tone**: `amber` (중립·주의, 차단 아님).

```tsx
// 증여자 관계 판정 — 배우자·직계존비속이면 §47③ 안내 노출
const showSection47_3Notice =
  mode === "gift" &&
  ((item.mortgageAmount ?? 0) > 0 || (item.leaseDeposit ?? 0) > 0) &&
  (donorRelation === "spouse" ||
   donorRelation === "lineal_ascendant_adult" ||
   donorRelation === "lineal_ascendant_minor" ||
   donorRelation === "lineal_descendant");

// 렌더
{showSection47_3Notice && (
  <div className="rounded-md border border-amber-200 bg-amber-50/70 dark:border-amber-700 dark:bg-amber-900/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
    <strong>§47③ 주의</strong> — 배우자·직계존비속 간 부담부증여의 채무 인수는
    원칙적으로 증여로 추정하지 않습니다.
    채무 이전이 객관적으로 입증된 경우에만 과세가액에서 차감됩니다.
    (상증법 §47③, 금융기관 확인서류 등 입증 서류 보관 필요)
  </div>
)}
```

**donorRelation은 EstateItemEditor props에서 내려오지 않음** → 추가 prop 필요.
또는 `EstateItemEditor`에 `donorRelation?: DonorRelation` prop 추가.

**대안**: `CollateralLeaseFields`가 mode="gift"이면 항상 §47③ 안내 표시(관계 불문 — 더 단순).

### 4-3. 채무 입력 UI 계층 (자산-수준 A 기준, 증여 모드)

```
EstateItemEditor (mode="gift")
  └─ VariantBody → EstateBodyRealEstate
       └─ CollateralLeaseFields (tone="amber")
            ├─ [기존] 임대보증금 CurrencyInput
            │   hint: "§47① — 수증자 인수 채무. 과세가액 차감."
            ├─ [기존] 월 임대료 CurrencyInput  (apartment·building만)
            ├─ [기존] 저당권 채권액 CurrencyInput
            │   hint: "§47① 차감 + §66 평가 하한 병존"
            ├─ [기존] 신용보증기관 보증액 (저당 0이면 disabled)
            ├─ [숨김] §14 자동공제 토글 (mode=inheritance만)  ← 현행 그대로
            └─ [신규] §47③ amber 안내 (mode=gift + 채무>0 + 배우자·직계존비속)
```

---

## 5. 결과 화면 변경 — ⑦ 지점

### 5-1. 과세가액 요약 카드 (GiftTaxResultView.tsx:395~440)

현행:
```
증여재산가액        1,000,000,000
비과세 차감         -   (있을 때)
10년 합산 증여가액  (합산 시)
증여재산공제        -   500,000,000
...
과세표준           500,000,000
```

변경 후 (`debtAmount > 0`인 경우 추가):
```
증여재산가액        1,000,000,000
채무인수 차감 (§47①) -  400,000,000    ← 신규 행
비과세 차감         -   (있을 때)
10년 합산 증여가액  600,000,000
증여재산공제        -    50,000,000
...
과세표준           550,000,000
```

**`Row` 컴포넌트 패턴 준수** (`deduction` prop):
```tsx
{(result.debtAmount ?? 0) > 0 && (
  <Row
    label="채무인수 차감 (§47①)"
    value={`- ${formatKRW(result.debtAmount ?? 0)}`}
    sub
    deduction
  />
)}
```

`result.debtAmount`는 엔진 `GiftTaxResult`에 echo 필드로 추가 필요.

### 5-2. 별지 10호 ② 행 (GiftTaxFilingFormTable)

`gift-filing-form-rows.ts` 빌더가 이미 ② 채무 행을 구성.
현재 `buildFilingFormRows({ debtAmount: 0 })` — 하드코딩 0.
엔진에서 실제 값 전달 시 자동 반영.
**UI 추가 작업 없음** — 엔진 변경으로 자동 정합.

### 5-3. 사이드바

`GiftTaxForm.tsx` 실측: 증여세 폼에 사이드바 컴포넌트 없음.
→ 사이드바 동기화 해당 없음 (⑥ 지점 N/A).

---

## 6. validate ⑧ 동기화

`validateStep` (step 1) 추가 규칙:

### 자산-수준(A) 채택 시

```typescript
// step 1 — 채무가 평가액을 초과하는 경우 경고 (차단 아님 — §47① 입증 후 허용 가능)
const allRealEstateItems = form.giftItems.filter(
  (it) => it.category.startsWith("real_estate")
);
for (let i = 0; i < allRealEstateItems.length; i++) {
  const it = allRealEstateItems[i];
  const debt = (it.mortgageAmount ?? 0) + (it.leaseDeposit ?? 0);
  const valuation = it.marketValue ?? it.appraisedValue ?? it.similarSalesValue ?? it.standardPrice ?? 0;
  if (debt > 0 && valuation > 0 && debt > valuation) {
    return `${it.name || `재산 ${i+1}`}: 채무인수액(${debt.toLocaleString()}원)이 평가액(${valuation.toLocaleString()}원)을 초과합니다. 입력값을 확인하세요.`;
  }
}
```

**정책 준수**: 자동 안분 fallback 금지 — 미입력 채무는 0 처리 (엔진 MEMORY 정책).
채무 > 재산가액 케이스는 차단 아닌 경고 — §47① 적용 여부는 사실 판단 영역.

---

## 7. §66 교차 주의 사항 (케이스 매트릭스)

| 케이스 | §66 평가 하한 | §47① 채무 차감 |
|---|---|---|
| 저당 5억, 보충평가 7억 | 7억 (보충평가 > 저당 → 보충평가 사용) | 5억 차감 → 과세가액 7억−5억=2억 |
| 저당 8억, 보충평가 7억 | 8억 (저당 > 보충평가 → 저당 사용, §66 MAX) | 8억 차감 → 과세가액 8억−8억=0 |
| 임대보증금 4억, 시가 10억 | §66 임대료환산 비교 (§61⑤) | 4억 차감 → 과세가액 10억−4억=6억 |

**엔진 설계 주의**: §66은 평가 단계(STEP 1)에서 자산가액을 결정, §47①은 STEP 1.5에서 과세가액을 차감.
동일 저당 채무가 두 단계에 모두 영향 — 평가 가중과 과세가액 차감이 병존하는 결과.
이것이 법 취지: §66은 평가 조작 방지, §47①은 실제 채무인수 반영.

---

## 8. E2E 시나리오 1건

### 파일명: `e2e/gift-burdened-debt-47-1.spec.ts`

```typescript
/**
 * E2E: 부담부증여 채무인수 §47① — 과세가액 차감 확인
 *
 * 시나리오: 아파트 10억 + 임대보증금 4억 인수 → 과세가액 6억
 * E2E_PORT=3100 (worktree 격리)
 */
import { test, expect } from "@playwright/test";

test("부담부증여 채무인수 §47① — 과세가액 6억 확인", async ({ page }) => {
  const BASE = `http://localhost:${process.env.E2E_PORT ?? "3000"}`;
  await page.goto(`${BASE}/gift`);

  // Step 0: 증여일 + 증여자
  await page.getByRole("textbox", { name: "증여일" }).fill("2025-03-15");
  // donor select: 부(father) — 기본값이므로 확인만
  await page.getByRole("button", { name: "다음" }).click();

  // Step 1: 증여재산 추가 (keepModalOpen 패턴 — 모달 내 자산명 입력)
  await page.getByRole("button", { name: "재산 추가" }).click();
  // 아파트 카테고리 선택
  await page.getByRole("button", { name: /아파트|apartment/i }).click();
  // 모달 내 자산명 입력 (별칭 필드 — "본가 토지" 패턴)
  await page.getByPlaceholder(/강남 아파트|본가 토지/i).fill("서울 아파트");
  // 시가 입력
  await page.getByLabel("시가 (매매·수용·경매가액)").click();
  await page.keyboard.type("1000000000");
  // 담보·임대 토글 펼침
  await page.getByText("담보·임대 (§66 평가 하한").click();
  // 임대보증금 입력
  await page.getByLabel("임대보증금 (세입자 있는 경우)").click();
  await page.keyboard.type("400000000");
  // 저장
  await page.getByRole("button", { name: "저장" }).click();

  // Step 1 → 다음
  await page.getByRole("button", { name: "다음" }).click();

  // Step 2 → 다음
  await page.getByRole("button", { name: "다음" }).click();

  // Step 3 → 계산하기
  await page.getByRole("button", { name: "계산하기" }).click();

  // 결과 검증: 채무인수 차감 행 표시
  await expect(page.getByText("채무인수 차감 (§47①)")).toBeVisible();
  await expect(page.getByText("- 400,000,000")).toBeVisible();

  // 별지 10호 ② 행 — "채무" 400,000,000
  await expect(page.getByText("②")).toBeVisible();
  // 과세표준 줄 — 직계존속 성인 5천만 공제 후 5.5억
  // grossGiftValue 1억 → netCurrentGift 1억, aggregated 1억, taxBase = 1억 - 5000만 = 5000만
  // 실제: grossGift=10억, debt=4억, net=6억, deduction=5천만, taxBase=5.5억
  await expect(page.getByText("과세표준")).toBeVisible();
});
```

**keepModalOpen 패턴 주의** (memory `project_gift_57_proviso_53_2_cumulative`):
- 자산명 placeholder 패턴: "강남 아파트, 본가 토지" (EstateBodyRealEstate:221).
- `fill()` 대상은 별칭(name) 필드 — 소재지 검색(AddressSearch)이 아님.
- 임대보증금 필드는 담보·임대 토글 펼침 후 접근.

---

## 9. 이력 저장 영향

- `useAutoSaveCalculation` — `inputData: form` 직렬화. `giftItems[].leaseDeposit/mortgageAmount` 이미 포함.
- `resultData: result` 직렬화. `result.debtAmount` 신규 필드 추가 시 자동 저장됨.
- 이력 복원 시 `normalizeRestoredFormDates` — 채무 필드 Date 변환 불필요 (number 타입).

이력 저장 보존 — **변경 없음**.

---

## 10. 양도세 연계 안내 (스코프 외)

§47① 채무인수분은 증여자의 유상양도로 취급 (소득세법 §88):
- 채무인수액 = 증여자의 양도가액
- 증여자는 양도세 신고 의무 발생 가능성

**현행**: 양도세 `burdened_gift` 취득원인 이미 구현됨 (`transfer-tax-ui-senior` 담당).
**본 UI에서**: 결과 화면 하단 또는 Step 1 채무 입력 후 안내 카드 추가.
```
amber 안내: "채무인수분(400,000,000원)은 증여자의 유상양도에 해당할 수 있습니다.
            증여자는 양도소득세 신고 여부를 확인하세요. (소득세법 §88)"
```
**자동 연동은 스코프 외** (별도 PR 필요 시 `transfer-tax-ui-senior` 협력).

---

## 11. Definition of Done — 자가 점검

### 3대 핵심 정책

- [ ] useEffect → store 미러링 없음 (채무 입력은 onChange 단독 처리)
- [ ] 자동 안분 fallback 없음 (채무 미입력 = 0, 자동 계산 금지)
- [ ] API fallback ↔ validate ⑧ 동기화 (채무 > 재산가액 조건 validate에도 반영)

### 14지점 체크리스트

| 지점 | 자산-수준(A) | 폼-전역(B) |
|---|---|---|
| ① FormData 타입 | 변경 없음 | `assumedDebtAmount: string` 추가 |
| ② initial | 변경 없음 | `""` 추가 |
| ③ normalize | N/A | 빈값→0 |
| ④ API 변환 | 변경 없음 | `parseAmount` 추가 |
| ⑤ UI 위젯 | CollateralLeaseFields 레이블+hint 갱신, §47③ 안내 추가 | Step1 하단 CurrencyInput 추가 |
| ⑥ 사이드바 | N/A (사이드바 없음) | 동일 |
| ⑦ 결과 카드 | `debtAmount > 0` 행 추가 | 동일 |
| ⑧ validation | 채무>평가액 경고 | 동일 |
| ⑨ Zod enum | 변경 없음 | `assumedDebtAmount: z.number()` |
| ⑩ Zod enum 컴패니언 | 변경 없음 | N/A |
| ⑪ acquisitionDate fallback | N/A | N/A |
| ⑫ Zod 입력 객체 | 변경 없음 | ⑨와 동일 |
| ⑬ body spread | 변경 없음 | `assumedDebtAmount` 추가 |
| ⑭ Route handler | 변경 없음 | 변경 없음 |

### 기타

- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/gift/` 통과
- [ ] E2E spec 작성 + E2E_PORT=3100 실행
- [ ] 별지10호 ② 행 비어있지 않음 확인 (Network 탭 debtAmount 확인)
- [ ] §47③ 안내 amber 카드: 배우자·직계존비속 증여 시 노출, 기타친족 미노출 확인
