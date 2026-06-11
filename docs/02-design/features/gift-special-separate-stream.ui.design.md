# Track A Phase 1 — 조특법 특례 2-스트림 분리과세 UI 디자인

> 작성일: 2026-06-11 | 에이전트: inheritance-gift-tax-ui-senior
> 상위 계획: `docs/00-pm/gift-followup-special-separation-debt.plan.md` Track A
> 엔진 시니어 병렬 설계 중 — 필드명·타입은 엔진 설계 확정 후 합치.
> 현행 실측 기반 — 추정 없음.

---

## 0. 현행 구조 실측 요약

| 위치 | 현행 상태 |
|---|---|
| `FormState.specialTreatment` | `"" \| "startup" \| "family_business"` (gift-tax-form-shared.tsx:71) |
| `FormState.giftItems` | `EstateItem[]` — 특례 귀속 필드 없음 |
| `PriorGift.specialTreatmentType` | 미존재 — inheritance-prior-gift.types.ts 전체 |
| Step3 RadioCardGroup | gift-tax-form-shared.tsx:594 — 전체 증여에 단일 특례 선택 |
| `GiftTaxResult.specialTreatmentCredit` | `TaxCreditResult.specialTreatmentCredit` (절감액 공제 방식) |
| `TaxCreditBreakdownCard` | "조특법 과세특례 (창업·가업)" 단일 행 (TaxCreditBreakdownCard.tsx:470) |
| API 변환 | gift-api.ts:56 `specialTreatment: form.specialTreatment || undefined` |
| validate | gift-tax-form-shared.tsx:250 `validateStep` — specialTreatment 검증 없음 |

**현행 갭 (plan A-2 대조)**

| 갭 ID | 현행 코드 위치 | UI 영향 |
|---|---|---|
| G1 | gift-tax.ts:114 `aggregatedGiftValue` 분기 없음 | 혼합 입력 불가 |
| G2 | gift-tax.ts:205-210 `calcGiftTaxCredits` 전체 순증여가액 | 특례 자산 귀속 선택 UI 없음 |
| G3 | inheritance-prior-gift.types.ts PriorGift 특례 필드 없음 | 과거 특례 prior 구분 입력 불가 |
| G4 | TaxCreditBreakdownCard.tsx:470 절감액 단일 행 | 2-스트림 결과 표시 불가 |

---

## 1. 사용자 시나리오 3건

### 시나리오 A — 창업자금 단독 증여 (30억)

```
Step 0: 증여자=부, 증여일=2025-01-15, 수증자=성인
Step 1: 자산 1건 (창업자금 현금 3,000,000,000원)
         └ 특례 귀속 → 창업자금 §30의5 [자동 단일 귀속]
Step 2: 사전증여 없음, 비과세 없음
Step 3: 창업자금 과세특례 선택됨 (Step1에서 이미 표시·연동)
         startupInvestmentCompleted=true, startupNewHiresAtLeast10=false
         → isFiledOnTime: §30의5⑪ 신고세액공제 자동 배제 안내
결과: 특례 스트림 전용 — (3,000,000,000 − 5억) × 10% = 250,000,000
       일반 스트림 세액 0
       §69 신고세액공제 배제(⑪) 명시
```

**UX 포인트**: 자산이 1개이고 창업자금 특례 선택 시 → 해당 자산에 자동 귀속 표시 (사용자 확인만). 별도 멀티선택 UI 불필요.

### 시나리오 B — 혼합 증여 (창업자금 30억 + 일반 아파트 5억)

```
Step 0: 증여자=부, 증여일=2025-01-15
Step 1: 자산 2건
         자산①: 현금 3,000,000,000 (창업자금 현금)
                  SpecialTreatmentBadge → "§30의5 창업자금 특례"
         자산②: 아파트 500,000,000
                  SpecialTreatmentBadge → "일반 증여"
Step 2: 사전증여 없음
Step 3: RadioCardGroup specialTreatment = "startup"
         "특례 대상 자산: 현금 (자산①)" — 연동 표시
         혼합 증여 안내: "일반 스트림(아파트 5억)과 특례 스트림(창업자금 30억)으로 분리 계산됩니다"
결과:
  일반 스트림: 500,000,000 − §53 공제 → §56 누진세율
  특례 스트림: (3,000,000,000 − 5억) × 10%
  최종 납부세액 = 일반 + 특례
```

**UX 포인트**: 자산이 2건 이상이고 특례 선택 시 → 특례 귀속 자산 멀티선택 카드 노출 (Step3에서). 각 자산 카드에 `SpecialTreatmentBadge` 표시 (귀속 선택 후 Step1 카드에 배지 반영).

### 시나리오 C — 과거 창업자금 이력 + 신규 창업자금

```
Step 0: 증여자=부, 증여일=2025-06-01
Step 1: 자산 1건 — 신규 창업자금 현금 10억
Step 2: 사전증여 1건
         └ GiftRowEditor에 specialTreatmentType 위젯 노출
           → "startup" 선택: "과거 창업자금 (§30의5① 후단 — 기간 무관 합산)"
           → giftTaxBase ⑤, computedTax ⑦ 입력 (기존 동일인 합산과 동일 위치)
Step 3: specialTreatment = "startup"
결과:
  특례 스트림: 과거 창업자금 합산 후 누계로 (10억 + 과거 금액) 적용
  일반 prior는 특례 스트림에서 제외(⑪)
  §47 일반 합산에서도 과거 창업자금 제외
```

**UX 포인트**: 과거 창업자금 prior는 specialTreatmentType="startup" 선택 시 기간 무관 합산 안내 표시.

---

## 2. 자산 귀속 UX 결정

### 2.1 문제 정의

현행 `specialTreatment` RadioCardGroup은 Step3 (gift-tax-form-shared.tsx:594)에 있고, 자산은 Step1에 있다. Track A는 "어떤 자산이 특례 귀속인가"를 알아야 2-스트림 분리가 가능하다.

**단일 진실 위치 결정**: `EstateItem` 자산-수준에 `specialTreatmentTag?: "startup" | "family_business"` 추가 (엔진 시니어 합치 대상). 이 필드가 단일 진실.

**useEffect 미러링 금지** — Step3에서 자산 선택 → EstateItem에 write하는 것은 직접 store update (useEffect 없음).

### 2.2 선택된 설계안: "Step3 귀속 선택 카드 + Step1 배지"

Step3에 `SpecialTreatmentAssetSelector` 컴포넌트를 추가 (`specialTreatment !== ""` 시 노출):

```
[Step3] 조특법 과세특례
  RadioCardGroup: 해당없음 / 창업자금 / 가업승계
  
  specialTreatment = "startup" 선택 시:
  ┌─────────────────────────────────────────────────────┐
  │ 특례 귀속 자산 선택 (§30의5⑪)                       │  emerald 카드
  │ 일반 증여재산과 분리 계산됩니다.                       │
  │                                                      │
  │ ☑ [현금] 3,000,000,000원 ← 특례 귀속              │
  │ ☐ [아파트] 500,000,000원   ← 일반 스트림            │
  │                                                      │
  │ ⓘ 자산이 1개이면 자동 귀속됩니다.                     │
  └─────────────────────────────────────────────────────┘
```

**자산 1개 단독 케이스**: 자동 귀속 → 카드 읽기 전용으로 표시 (멀티선택 불필요).

**자산 0개**: 특례 귀속 선택 카드 미노출 + 경고 ("증여재산을 먼저 입력하세요").

**Step1 배지 연동**: Step1의 EstateItemEditor (PropertyValuationForm 상단)에 `SpecialTreatmentBadge` 표시:
- `specialTreatmentTag === "startup"` → emerald 배지 "§30의5 특례"
- `undefined` → 배지 없음 (일반 스트림)

**단일 진실 데이터 흐름**:
```
Step3 체크박스 onChange
  → giftItems[i].specialTreatmentTag = "startup" | undefined (직접 store write)
  → Step1 배지 자동 반영 (파생 표시, useEffect 없음)
```

**UI 순서 = 계산 로직 순서 원칙 검토**:
- 계산 순서: 자산 평가(Step1) → 비과세(Step2) → 특례 귀속 결정(Step3) → 스트림 분리
- 현행 Step 구조(1=자산, 2=합산, 3=공제)와 충돌 없음
- 특례 귀속 선택은 Step3에서 특례 RadioCardGroup 직후에 배치 → 영향 필드(자산 멀티선택) 직후 로직 순서 준수

**Step1 자산 모달에 특례 토글 추가 (선택 옵션) — 채택하지 않는 이유**:
- 자산 추가 모달이 이미 PropertyValuationForm으로 복잡함 (800줄 정책 위협)
- 특례 귀속은 "어떤 자산에 적용할지"를 결정하는 Step3 의사결정으로 성격상 Step3에 귀속이 자연스러움
- Step1 모달에 추가하면 Step3 RadioCardGroup과 이중 입력 경로 발생 (dual-truth 위험)

---

## 3. PriorGift 특례 구분 위젯 설계

### 3.1 `GiftRowEditor`에 `specialTreatmentType` 추가

**파일**: `components/calc/prior-gift/GiftRowEditor.tsx` (686줄 현재)

**노출 조건**: `showGiftPhaseA === true` (증여세 모드 한정) 시에만 표시.

**이유**: 상속세 모드의 PriorGift는 §13 합산 목적 — 특례 타입 구분이 상속세 §13⑧·§24에 영향을 주지만 (Track A-Phase 2 범위), 현재 Phase 1은 증여세 엔진만 대상이므로 증여세 모드 한정으로 노출.

**위치**: Phase A 섹션 (gift-tax-form-shared.tsx 기준 GiftRowEditor내 violet 카드 `§47` 블록) 최상단에 배치.

```tsx
{/* 특례 구분 — 증여세 모드 showGiftPhaseA===true 전용 */}
{showGiftPhaseA && (
  <div className="space-y-1">
    <label className="block text-xs font-medium text-violet-700">
      이 사전증여의 과세특례 여부
    </label>
    <RadioCardGroup<"none" | "startup" | "family_business">
      name={`priorGiftSpecialType-${index}`}
      tone="emerald"
      layout="inline"
      value={gift.specialTreatmentType ?? "none"}
      onChange={(v) =>
        set({ specialTreatmentType: v === "none" ? undefined : v })
      }
      options={[
        { value: "none", label: "일반 증여" },
        { value: "startup", label: "창업자금 §30의5" },
        { value: "family_business", label: "가업승계 §30의6" },
      ]}
    />
    {gift.specialTreatmentType === "startup" && (
      <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
        ⓘ §30의5① 후단 — 창업자금은 증여 시기와 무관하게 현재 신고분과 합산됩니다.
           §47②(10년 합산)에서 제외되어 별도 스트림으로 계산됩니다.
      </p>
    )}
  </div>
)}
```

### 3.2 `PriorGiftHistoryModal` 메타 연동 여부

**결정**: Phase 1 미연동 (조건부 제외).

이력 조회 모달(`gift/PriorGiftHistoryModal.tsx`)이 자동 채워주는 필드는 현재 `giftDate`, `giftAmount`, `giftTaxPaid`, `donor` 등이다. `specialTreatmentType`은 이력 저장 스키마에 없으므로 조회 시 undefined가 되어 "일반 증여"로 표시된다. 사용자가 이력 자동채움 후 해당 회차가 특례였으면 직접 변경하는 수동 경로가 명확하다.

Phase 2 (상속 연계) 시 `CalculationRecord`에 `specialTreatment` 메타가 저장되면 자동 연동 추가 가능.

---

## 4. 결과 화면 재설계

### 4.1 2-스트림 표시 구조

현행 `GiftTaxResultView.tsx`의 과세표준/산출세액 흐름:

```
grossGiftValue → exemptAmount → aggregatedGiftValue → totalDeduction → taxBase → computedTax
```

2-스트림 후 엔진이 반환할 것으로 예상되는 구조 (엔진 시니어 합치 후 확정):

```typescript
// 엔진 시니어 설계 중 — 합치 후 확정 필요
// 아래는 UI 설계 목적의 잠정 명세
interface GiftTaxResult {
  // 기존 (일반 스트림 합산 결과로 재정의 가능성 있음)
  grossGiftValue: number;
  taxBase: number;
  computedTax: number;
  
  // 신규 2-스트림 (엔진 시니어 합치 대상)
  normalStream?: {
    grossValue: number;         // 일반 스트림 재산가액
    aggregatedValue: number;    // §47 합산 (일반 prior만)
    deduction: number;          // §53 공제
    taxBase: number;
    computedTax: number;
  };
  specialStream?: {
    type: "startup" | "family_business";
    grossValue: number;         // 특례 재산가액
    priorSpecialAccumulated: number;  // 과거 특례 prior 합산 (§30의5① 후단)
    deduction: number;          // 5억/10억 공제
    taxBase: number;
    taxRate: number;            // 10% 또는 20%
    computedTax: number;
    filingCreditExcluded: boolean;  // §30의5⑪ §69 배제 여부
  };
}
```

### 4.2 결과 카드 변경 설계

**현행**: 단일 흐름 카드 (grossGiftValue → finalTax).

**신규**: 스트림 유무에 따른 분기 표시.

#### Case 1: 특례 단독 (일반 스트림 없음)
```
┌─────────────────────────────────────────────────────┐
│ 조특법 과세특례 — 창업자금 §30의5                     │  emerald 헤더
├─────────────────────────────────────────────────────┤
│ 창업자금 증여가액                      3,000,000,000 │
│ 공제 (§30의5① — 5억)                   -500,000,000 │
│ 과세표준                               2,500,000,000 │
│ 세율 10%                                             │
│ 산출세액                                 250,000,000 │
│ 신고세액공제: §30의5⑪ 배제 (0원)                    │
│ (세대생략 할증 — 해당 시)                            │
│ 결정세액                                 250,000,000 │
└─────────────────────────────────────────────────────┘
```

#### Case 2: 혼합 (일반 + 특례)
```
┌─────────────────────────────────────────────────────┐
│ 일반 증여 스트림                                      │  gray 헤더
├─────────────────────────────────────────────────────┤
│ 일반 재산가액                             500,000,000 │
│ 사전증여 합산 (§47 일반 prior)                     0  │
│ 증여재산공제 (§53)                       -50,000,000 │
│ 과세표준                                  450,000,000 │
│ 산출세액 (§56 누진)                        50,000,000 │
└─────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────┐
│ 창업자금 특례 스트림 (§30의5)                        │  emerald 헤더
├─────────────────────────────────────────────────────┤
│ 창업자금 가액                           3,000,000,000 │
│ 공제 (5억)                               -500,000,000 │
│ 과세표준                                2,500,000,000 │
│ 세율 10%                                             │
│ 산출세액                                  250,000,000 │
│ §69 신고세액공제 배제 (§30의5⑪)                     │
└─────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────┐
│ 최종 납부세액 (일반 + 특례)                           │  highlight
│ = 50,000,000 + 250,000,000                          │
│ = 300,000,000                                        │
└─────────────────────────────────────────────────────┘
```

#### 기존 TaxCreditBreakdownCard 호환 처리

현행 `specialTreatmentCredit` 필드 (절감액 공제 방식)가 2-스트림 전환 후 어떻게 처리될지는 엔진 시니어가 결정 (plan A-3 "deprecated 또는 재정의"). UI는 두 경우 모두 지원:

- **재정의 케이스**: `specialTreatmentCredit > 0`이면 `TaxCreditBreakdownCard`에서 기존 행 유지 + 아래에 "2-스트림으로 계산됨" 안내 배지
- **deprecated 케이스**: `specialTreatmentCredit === 0`이면 행 미표시 (기존 로직: `amount === 0 && !formula → return null` — 자동 처리)

신규 `SpecialStreamResultCard` 컴포넌트 (`GiftTaxResultView.tsx` 내 또는 분리)에서 `result.specialStream`이 있으면 렌더링.

### 4.3 별지 10호 처리 결정

**결정**: 특례 스트림은 별지 10호 표에 포함하지 않음. 별지 10호는 일반 스트림 기준으로 기존 18행 유지.

**법적 근거**: 조특법 §30의5⑫ — 창업자금 증여세 과세특례는 별도 창업자금특례신청서(조특법 시행규칙 별지 제43호 서식)를 함께 제출한다. 별지 10호는 상증법 기반 일반 증여세 신고서 — 특례 계산을 별지 10호에 통합하면 서식 취지 위반.

**구현 방침**:
- 별지 10호 (`GiftTaxFilingFormTable.tsx`)는 `normalStream` 기준으로 렌더링 (일반 스트림 세액)
- 특례 스트림은 별도 `SpecialStreamSummaryCard` (결과 화면 하단 추가 섹션)
- 특례신청서 서식 재현은 Phase 1 범위 외 — "별도 창업자금특례신청서 제출 필요" 안내 문구만 표시

---

## 5. 14개 동기화 지점 매핑표 (잠정 — 엔진 합치 후 확정)

엔진 시니어가 확정할 신규 필드: `EstateItem.specialTreatmentTag`, `PriorGift.specialTreatmentType`, `GiftTaxResult.normalStream`, `GiftTaxResult.specialStream`.

### 클라이언트 8개 지점

#### ① FormState 타입 (`gift-tax-form-shared.tsx`)

현행 변경 없음 (specialTreatment는 유지). 신규 필드 없음 — 특례 귀속은 `EstateItem`에 저장.

단, `GiftTaxFormState`가 `giftItems: EstateItem[]`을 포함하므로 EstateItem에 `specialTreatmentTag` 추가 시 자동 포함.

#### ② initial value

`EstateItem` factory (`createInitialEstateItem` 또는 상응 초기화)에 `specialTreatmentTag: undefined` 추가.

`PriorGift` 초기값: `priorGifts: []` 기존 유지 → 신규 `PriorGift`에 `specialTreatmentType: undefined` default 자동 적용.

#### ③ normalize fallback

`EstateItem`의 normalize: `specialTreatmentTag: item.specialTreatmentTag ?? undefined` (sessionStorage 기존 데이터 호환).

`PriorGift`의 normalize: `specialTreatmentType: gift.specialTreatmentType ?? undefined`.

#### ④ API 변환 (`lib/calc/gift-api.ts`)

`buildGiftTaxInput`에서 `giftItems` 변환 시 `specialTreatmentTag` 그대로 전달. strip 없음.

`priorGiftsWithin10Years` 변환 시 `specialTreatmentType` 그대로 전달 (현행 `sourceCalculationId` strip 패턴 참조).

```typescript
priorGiftsWithin10Years: form.priorGifts.map(
  ({ sourceCalculationId: _src, ...rest }) => rest,  // 기존 — sourceCalculationId만 strip
),
// specialTreatmentType은 strip하지 않음 — 엔진 필요
```

#### ⑤ UI 위젯

**Step1 자산 카드**: `EstateItem.specialTreatmentTag` 있으면 `SpecialTreatmentBadge` 렌더링 (read-only 표시, 변경은 Step3에서).

**Step3 특례 귀속 선택**: `SpecialTreatmentAssetSelector` 컴포넌트 신규 — `specialTreatment !== ""` 시 노출.

**GiftRowEditor**: `showGiftPhaseA` 시 `specialTreatmentType` RadioCardGroup 추가 (섹션 3.1 참조).

#### ⑥ 사이드바 합계

현행 `GiftTaxForm.tsx`의 사이드바 합계 (총 증여재산가액)는 스트림 구분 없이 전체 합산 표시 유지.

혼합 시 "(창업자금 30억 포함)" 서브텍스트 추가 — `giftItems.some(i => i.specialTreatmentTag)` 시.

#### ⑦ 결과 카드

섹션 4.2 설계안 참조:
- `result.specialStream` 있으면 `SpecialStreamResultCard` 렌더링
- `result.normalStream` 있으면 `NormalStreamResultCard` (기존 카드 재구성)
- 최종 납부세액 합산 표시
- `TaxCreditBreakdownCard` `specialTreatmentCredit` 호환 처리

#### ⑧ Validation (`gift-tax-form-shared.tsx` `validateStep`)

**Step3 추가 검증**:
```typescript
if (step === 3) {
  // ... 기존 §53의2③ 검증 유지 ...
  
  // 특례 선택 시 귀속 자산 필수
  if (form.specialTreatment !== "") {
    const allItems = [...form.giftItems, ...form.stockItems];
    if (allItems.length > 0) {
      const hasTaggedAsset = allItems.some(
        (it) => it.specialTreatmentTag === form.specialTreatment
      );
      if (!hasTaggedAsset) {
        return `${form.specialTreatment === "startup" ? "창업자금" : "가업승계"} 특례를 적용할 자산을 선택하세요.`;
      }
    }
    // 자산 0개이면 Step1 검증에서 차단됨 — 이중 검증 불필요
  }
  
  // Prior에서 specialTreatmentType 선택 시 giftTaxBase/computedTax 필수 여부는
  // 기존 isSameDonorGroup 게이트와 동일 로직 — 특례 prior는 별도 스트림이므로
  // 동일인 그룹 무관하게 ⑤·⑦ 필수. (엔진 시니어 합치 후 정확한 요건 확정)
}
```

### API/Route 6개 지점

#### ⑨ Zod enum 메인 (`app/api/calc/gift-tax/route.ts`)

`giftItemSchema`에 `specialTreatmentTag: z.enum(["startup", "family_business"]).optional()` 추가.

`priorGiftSchema`에 `specialTreatmentType: z.enum(["startup", "family_business"]).optional()` 추가.

#### ⑩ Zod enum 컴패니언

상속세 route의 `priorGiftSchema`에도 `specialTreatmentType` 추가 (Track A-Phase 2를 위한 사전 준비 — 상속세 엔진은 무시하지만 스키마 허용).

#### ⑪ 자산-수준 fallback

`specialTreatmentTag` 는 optional — undefined fallback 없음 (미입력 = 일반 스트림).

#### ⑫ Zod 입력 객체 정의

`GiftTaxInputSchema` (route handler 내부)에 `giftItems[].specialTreatmentTag` + `priorGiftsWithin10Years[].specialTreatmentType` 추가 — TS 미감지 취약점, grep 자가점검 필수.

#### ⑬ callGiftTaxAPI body spread

`gift-api.ts` `buildGiftTaxInput` 반환값이 route handler에 fetch body로 전달될 때 `specialTreatmentTag`·`specialTreatmentType`가 포함되어야 함 — 현행 spread 패턴 확인 필요.

#### ⑭ Route handler 엔진 input 매핑

Route handler에서 `GiftTaxEngine.calculate(input)` 호출 시 `giftItems[].specialTreatmentTag` + `priorGiftsWithin10Years[].specialTreatmentType` 가 `GiftTaxInput`에 포함되어야 함.

---

## 6. E2E 시나리오 2건

### E2E-A: 창업자금 단독 (시나리오 A)

**파일**: `e2e/gift-special-startup-solo.spec.ts`

```typescript
test("창업자금 단독 30억 — 특례 스트림 단독", async ({ page }) => {
  await page.goto("/calc/gift-tax");
  
  // Step 0
  await page.getByRole("button", { name: "증여자" }).click();
  // 함정①: 카테고리 버튼 이모지 라벨 → data-testid 또는 role+name 정확 매칭 필요
  await page.getByRole("option", { name: "부" }).click();
  // 날짜 입력 — DateInput (type="date" 아님)
  await page.getByLabel("증여일").fill("2025-01-15");
  await page.getByRole("button", { name: "다음" }).click();
  
  // Step 1 — 자산 추가
  await page.getByRole("button", { name: "재산 추가" }).click();
  // 함정③: 자산명 필수 입력
  await page.getByRole("textbox", { name: "자산명" }).fill("창업자금");
  // 함정②: ToggleCard 내 입력은 getByRole("textbox", {name}) strict
  await page.getByRole("textbox", { name: "시가" }).fill("3000000000");
  // 카테고리 선택 — 함정①: 이모지 라벨 매칭 금지
  // cash 카테고리 선택 (정확한 selector 실측 필요 — 여기서는 개략 표기)
  await page.getByTestId("category-cash").click();
  await page.getByRole("button", { name: "확인" }).click();
  await page.getByRole("button", { name: "다음" }).click();
  
  // Step 2 — 사전증여 없음, 비과세 없음
  await page.getByRole("button", { name: "다음" }).click();
  
  // Step 3 — 창업자금 특례 선택
  await page.getByRole("radio", { name: "창업자금 증여세 과세특례 (§30의5)" }).click();
  // 단독 자산 → 귀속 자동 안내 확인 (읽기 전용 카드)
  await expect(page.getByText("자동 귀속")).toBeVisible();
  await page.getByRole("checkbox", { name: "창업자금 투자 완료 (§30의5④)" }).click();
  await page.getByRole("button", { name: "계산하기" }).click();
  
  // 결과 검증
  // 특례 스트림 카드 표시
  await expect(page.getByText("창업자금 특례 스트림")).toBeVisible();
  // §69 배제 안내
  await expect(page.getByText("§30의5⑪ 배제")).toBeVisible();
  // 산출세액 = (30억 - 5억) × 10% = 2.5억
  await expect(page.getByText("250,000,000")).toBeVisible();
  // 일반 스트림 없음
  await expect(page.getByText("일반 스트림 없음")).toBeVisible();
});
```

### E2E-B: 혼합 증여 (시나리오 B)

**파일**: `e2e/gift-special-startup-mixed.spec.ts`

```typescript
test("혼합 증여 창업자금30억+아파트5억 — 2-스트림 분리", async ({ page }) => {
  await page.goto("/calc/gift-tax");
  
  // Step 0
  // (Step 0 입력 생략 — E2E-A 동일)
  
  // Step 1 — 자산 2건
  // 자산① 현금 3억 (창업자금)
  await page.getByRole("button", { name: "재산 추가" }).click();
  await page.getByRole("textbox", { name: "자산명" }).fill("창업자금");
  await page.getByTestId("category-cash").click();
  await page.getByRole("textbox", { name: "시가" }).fill("3000000000");
  await page.getByRole("button", { name: "확인" }).click();
  
  // 자산② 아파트 5억
  await page.getByRole("button", { name: "재산 추가" }).click();
  await page.getByRole("textbox", { name: "자산명" }).fill("강남 아파트");
  await page.getByTestId("category-real_estate_apartment").click();
  await page.getByRole("textbox", { name: "공시가격" }).fill("500000000");
  await page.getByRole("button", { name: "확인" }).click();
  await page.getByRole("button", { name: "다음" }).click();
  
  // Step 2 — skip
  await page.getByRole("button", { name: "다음" }).click();
  
  // Step 3 — 창업자금 특례 + 귀속 자산 선택
  await page.getByRole("radio", { name: "창업자금 증여세 과세특례 (§30의5)" }).click();
  // 2건이므로 멀티선택 카드 노출
  await expect(page.getByText("특례 귀속 자산 선택")).toBeVisible();
  // 창업자금 현금 체크 (아파트는 미체크)
  await page.getByRole("checkbox", { name: "현금" }).click();
  await page.getByRole("button", { name: "계산하기" }).click();
  
  // 결과 검증
  // 일반 스트림 표시
  await expect(page.getByText("일반 증여 스트림")).toBeVisible();
  // 특례 스트림 표시
  await expect(page.getByText("창업자금 특례 스트림")).toBeVisible();
  // 최종 납부세액 = 일반 + 특례
  await expect(page.getByText("최종 납부세액")).toBeVisible();
});
```

**증여 자산 모달 selector 3함정 (memory project_gift_burdened_debt_47_1 반영)**:

1. **함정①**: 카테고리 버튼 이모지 라벨 → `getByText("🏠 주택")` 매칭 금지 → `data-testid="category-{enum}"` 사용
2. **함정②**: ToggleCard 내 입력은 `getByLabel` 3중 매칭 strict 위반 → `getByRole("textbox", {name: "라벨명"})` 사용
3. **함정③**: 자산명 필수 입력 — 자산 추가 후 모달 내 이름 먼저 입력

---

## 7. 엔진 시니어와의 합치 필요 사항 (Do 단계 이전 확정 필요)

| # | 항목 | UI 영향 |
|---|---|---|
| 1 | `EstateItem.specialTreatmentTag` 필드명·타입 확정 | ① FormState, ④ API 변환, ⑤ 위젯 |
| 2 | `PriorGift.specialTreatmentType` 필드명·타입 확정 | ③ normalize, ④ API 변환, ⑧ validate |
| 3 | `GiftTaxResult.normalStream / specialStream` 구조 확정 | ⑦ 결과 카드 |
| 4 | `specialTreatmentCredit` deprecated 여부 | TaxCreditBreakdownCard 호환 처리 |
| 5 | 특례 stram §69 배제 결과 필드명 | SpecialStreamResultCard §69 배제 표시 |
| 6 | §47② 미적용 echoflag 여부 (⑪ 배제 표시용) | 결과 카드 안내 문구 |

---

## 8. Definition of Done 자가 점검 (Do 단계 완료 후 재점검)

- [ ] **①** `EstateItem.specialTreatmentTag` FormState에 포함 확인 (엔진 합치 후)
- [ ] **②** `giftItems` 초기값에 `specialTreatmentTag: undefined` 포함
- [ ] **③** sessionStorage 역직렬화 시 `specialTreatmentTag: item.specialTreatmentTag ?? undefined` normalize
- [ ] **④** `gift-api.ts` `buildGiftTaxInput`에서 `specialTreatmentTag`·`specialTreatmentType` 전달 (strip 없음)
- [ ] **⑤-a** Step3 `SpecialTreatmentAssetSelector` — 자산 1개 자동 귀속 / 2개 이상 멀티선택
- [ ] **⑤-b** Step1 자산 카드 `SpecialTreatmentBadge` 표시
- [ ] **⑤-c** `GiftRowEditor` `specialTreatmentType` RadioCardGroup (showGiftPhaseA 한정)
- [ ] **⑥** 사이드바 합계 — "창업자금 포함" 서브텍스트 (혼합 시)
- [ ] **⑦-a** `SpecialStreamResultCard` 렌더링 (normalStream/specialStream 기반)
- [ ] **⑦-b** 별지 10호 일반 스트림 기준 유지 확인
- [ ] **⑦-c** `TaxCreditBreakdownCard` `specialTreatmentCredit` 호환 처리
- [ ] **⑧** `validateStep(3)` — 특례 선택 시 귀속 자산 없으면 오류
- [ ] **⑨** `giftItemSchema`에 `specialTreatmentTag` optional 추가
- [ ] **⑩** `priorGiftSchema`에 `specialTreatmentType` optional 추가
- [ ] **⑫** Zod 입력 객체 정의에 두 필드 추가 (grep 자가점검)
- [ ] **⑬** fetch body에 두 필드 포함 확인
- [ ] **⑭** Route handler → 엔진 input 매핑 확인
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/gift-tax/` 통과
- [ ] E2E-A·E2E-B spec 통과 (E2E_PORT=3100)
- [ ] 브라우저 수동 확인 또는 미수행 명시

---

## 9. Pre-Do Anchor 후보

Do 단계 진입 전 다음 anchor 1건을 먼저 작성·실행하여 엔진 설계 환류 기회 확보:

**Anchor-1 (최우선)**: 혼합 증여 — 창업자금 30억 + 일반 5억
```typescript
// __tests__/tax-engine/gift-tax/special-stream-mixed.anchor.test.ts
test("혼합 증여: 창업자금 30억 + 일반 아파트 5억 — 2-스트림 분리", () => {
  const input: GiftTaxInput = {
    giftDate: "2025-01-15",
    giftItems: [
      { category: "cash", ..., specialTreatmentTag: "startup" },        // 창업자금
      { category: "real_estate_apartment", standardPrice: 500_000_000 }, // 아파트
    ],
    creditInput: { specialTreatment: "startup", isFiledOnTime: true },
  };
  const result = calculateGiftTax(input, rates);
  
  // 특례 스트림
  expect(result.specialStream?.taxBase).toBe(2_500_000_000);  // 30억 - 5억
  expect(result.specialStream?.computedTax).toBe(250_000_000); // × 10%
  expect(result.specialStream?.filingCreditExcluded).toBe(true); // §30의5⑪
  
  // 일반 스트림 (아파트 5억 — 성인 직계존속 공제 5천만)
  expect(result.normalStream?.taxBase).toBe(450_000_000);  // 5억 - 5천만
  // § 56 누진: 1억 이하 10%, 1억~5억 20% 누진공제 1천만
  // = (450,000,000 × 0.20) - 10,000,000 = 80,000,000
  expect(result.normalStream?.computedTax).toBe(80_000_000);
  
  // §28 증여세액공제 — 특례 prior의 경우 (이 케이스는 사전증여 없음 → 0)
  
  // 최종
  expect(result.finalTax).toBe(330_000_000); // 250,000,000 + 80,000,000
});
```

**Anchor 실패 시 처리**: 엔진 시니어에게 타입 구조 재검토 요청 → 디자인 문서 갱신 → Do 미착수.

---

_이 문서는 Do 단계 착수 전 엔진 시니어 확인 완료 후 최종 확정._
