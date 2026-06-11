# 증여세 부담부증여 채무인수 차감 엔진 설계 (§47①)

> 작성: 2026-06-11  
> 범위: Track B (plan: `docs/00-pm/gift-followup-special-separation-debt.plan.md`)  
> 법령: 상증법 §47① · §47③ · 시행령 §36 · §10  
> Pre-Do Anchor 파일: `__tests__/tax-engine/inheritance-gift/gift-burdened-debt-47-1-anchor.test.ts`

---

## 1. 법문 인용 (KoreanLaw 검증 기반)

### 상증법 §47①
> "증여세 과세가액은 증여재산가액을 합친 금액에서 **그 증여재산에 담보된 채무**(그 증여재산에 관련된 채무 등 대통령령으로 정하는 채무를 포함한다)로서 **수증자가 인수한 금액**을 뺀 금액으로 한다."

- 핵심: 과세가액 = 증여재산가액 − 수증자 인수 채무
- "그 증여재산에 담보된" → **자산 귀속 원칙** (채무가 특정 자산에 연결)
- 시행령 §36: 인수 채무 범위 — "임대보증금, 해당 재산에 담보된 금융기관 채무 등"이 포함 (시행령 조회 필요 — 확인 필요로 표기)

### 상증법 §47③
> "배우자·직계존비속 간 부담부증여는 채무 인수를 추정하지 아니한다. 다만, 객관적으로 인정되는 것인 경우에는 그러하지 아니하다."

- 배우자·직계존비속 간 증여: 기본 미인정, 입증 시 인정
- UI 처리: 차단(validation 오류)이 아닌 **안내 문구 표시** + 명시 opt-in 토글
- 법령 정확성 원칙: "절감" 표현 금지 — 중립 서술

---

## 2. Pre-Do Anchor 실측 결과

| Anchor | 항목 | 현행값 | 기대값(§47① 구현 후) |
|--------|------|--------|----------------------|
| A-1 | grossGiftValue (10억 토지) | 1,000,000,000 | 1,000,000,000 (불변) |
| A-1 | aggregatedGiftValue | 1,000,000,000 | 600,000,000 |
| A-1 | taxBase (공제 5천만 후) | 950,000,000 | 550,000,000 |
| A-2 | computedTax | 225,000,000 | 105,000,000 |
| A-2 | finalTax | 218,250,000 | 101,850,000 |
| B-1 | 별지 10호 ② debtAmount | 0 (하드코딩) | 400,000,000 |
| B-2 | buildFilingFormRows 자체 | 정상 (debtAmount 전달 시 표시) | - |
| C-1 | §66 MAX 적용 여부 | 적용됨 (mortgageAmount=4억 > standardPrice=3억 → grossGiftValue=4억) | 동일 |

**중요 발견 — §66 MAX 교차**:
- C-1 실측: 증여세 엔진도 property-valuation.ts를 통해 §66 MAX 평가를 적용함
- mortgageAmount=4억, standardPrice=3억 → grossGiftValue=4억(§66 MAX)
- 이 경우 §47① 채무인수 4억을 차감하면 netCurrentGiftValue=0

---

## 3. 현행 갭 파일:라인 (실측)

| 갭ID | 파일 | 라인 | 현행 코드 | 필요 변경 |
|------|------|------|-----------|-----------|
| B-G1 | `lib/tax-engine/gift-tax.ts` | 258 | `debtAmount: 0` | `debtAmount: sumAssumedDebt` |
| B-G1 | `lib/tax-engine/gift-tax.ts` | 112 | `netCurrentGiftValue = max(0, grossGiftValue − exemptAmount)` | `− assumedDebtTotal` 추가 |
| B-G1 | `lib/tax-engine/types/inheritance-gift.types.ts` | 1636 | `debtAssumed?: number` optional | 엔진 결과에 실값 채우기 |
| B-G1 | `lib/tax-engine/gift-tax-filing-form-besshi10.ts` | 74 | `netCurrent = grossGiftValue − exemptAmount` | 채무 차감 반영 필요 |
| B-G1 | `components/calc/gift-tax-form-shared.tsx` | FormState | 채무 입력 필드 없음 | 자산-수준 EstateItem 필드 활용 |

---

## 4. 입력 설계 결정 — 자산-수준 vs 폼-전역

### 결론: 자산-수준 (EstateItem 확장)

**근거**:
1. **법령 귀속 원칙**: §47① "그 증여재산에 담보된 채무" — 채무가 특정 자산에 귀속됨
2. **§66 교차 회피**: 같은 EstateItem에 mortgageAmount(평가용)와 assumedDebtAmount(§47① 차감용)를 분리 보관하여 이중 역할 명확화
3. **상속세 패턴 일관성**: `deductSecuredClaimAsDebt` 패턴 참조하되, 증여에서는 **§14 공제(상속채무)**가 아닌 **§47① 과세가액 제외**로 성질이 다름을 명시

### EstateItem 확장 필드 (2개)
```typescript
// inheritance-gift.types.ts EstateItem 인터페이스에 추가

/** §47① 부담부증여 수증자 인수 채무액 (원).
 *
 * 법령: 상증법 §47① — "수증자가 인수한 금액"을 과세가액에서 차감.
 * 성질 구분:
 *   - 이 필드: §47① **과세가액 차감** (증여 전용)
 *   - mortgageAmount: §66 MAX 평가 상향 + 선택적으로 §14 상속채무 공제 (상속 전용)
 *   두 필드는 동일 자산에 공존 가능 — §66 MAX 교차 케이스 참조 (§5.2)
 *
 * undefined/0: 부담부증여 아님 (기본)
 * 양수: 수증자가 인수하기로 한 채무액
 *
 * 음수 가드: Math.max(0, ...) 엔진에서 처리
 * §47③ 배우자·직계존비속: UI에서 안내 문구 표시, 차단 안 함
 */
assumedDebtForGift?: number;

/** §47③ 부담부증여 채무 인수 객관적 입증 여부 토글 (배우자·직계존비속 한정).
 *
 * - undefined/false: 미입증 (기본 — §47③ 추정 배제)
 * - true: 입증됨 (금융기관 채무 확인서 등 객관적 증빙 첨부)
 *
 * 엔진은 assumedDebtForGift > 0이면 관계 불문 차감 처리.
 * UI에서 donorRelation이 배우자/직계존비속인 경우 이 토글 ON 시 안내 문구 표시.
 * 자동 차단(validation 오류) 금지 — §47③ 단서 "객관적으로 인정되는 것"에 해당 시 인정.
 */
burdenedGiftDebtConfirmed?: boolean;
```

---

## 5. §66 MAX 교차 케이스 매트릭스

| 케이스 | mortgageAmount | assumedDebtForGift | §66 평가 grossGiftValue | §47① 차감 | 결과 netCurrentGiftValue |
|--------|----------------|-------------------|------------------------|------------|--------------------------|
| 1. 저당 없음 | undefined | 0 | standardPrice | 0 | standardPrice − exemptAmount |
| 2. 저당 < 보충평가 | 2억 | 0 | standardPrice(3억) | 0 | 3억 − exemptAmount |
| 3. 저당 > 보충평가, 채무 인수 없음 | 4억 | 0 | 4억(MAX) | 0 | 4억 − exemptAmount |
| **4. 저당 = 인수 채무** | **4억** | **4억** | **4억(MAX)** | **4억** | **0 − exemptAmount → max(0,0)=0** |
| 5. 저당 > 인수 채무 | 5억 | 3억 | 5억(MAX) | 3억 | 2억 − exemptAmount |
| 6. 인수 채무 > 자산 평가액 | 2억 | 3억 | 2억 | 2억(max(0,음수)→0) | 0 |
| 7. 임대보증금 포함 | leaseDeposit=1억 | 1억(인수 가정) | MAX(보충, 임대환산, 저당−신용보증) | 1억 | 평가액 − 1억 |
| 8. 배우자 증여 + 채무 | 4억 | 4억 | 4억(MAX) | 4억(§47③ 안내+확인) | 0 (입증 시) |

**케이스 4 주의**: §66 MAX 평가가 mortgageAmount(4억)를 올려놓고, §47①이 다시 4억을 차감하면 netCurrentGiftValue=0이 된다. 이는 법령상 정당함 — "담보채권액 = 인수채무"인 경우 과세가액 0.

**음수 가드 필수**: `Math.max(0, grossGiftValue − exemptAmount − assumedDebtTotal)`

---

## 6. 엔진 파이프라인 변경 명세

### 6.1 gift-tax.ts 변경 위치

```
STEP 1: 재산 평가 → grossGiftValue (기존 불변)
STEP 2: 비과세 차감 → exemptAmount (기존 불변)

[신규] STEP 2.5: §47① 채무인수 합산
  assumedDebtTotal = sum(item.assumedDebtForGift ?? 0 for item in giftItems)
  = Math.max(0, 합계) [음수 가드]

STEP 3 수정:
  기존: netCurrentGiftValue = Math.max(0, grossGiftValue − exemptAmount)
  변경: netCurrentGiftValue = Math.max(0, grossGiftValue − exemptAmount − assumedDebtTotal)

STEP 11 수정 (filingFormRows 빌드):
  기존: debtAmount: 0
  변경: debtAmount: assumedDebtTotal

STEP 10 수정 (결과 조립):
  debtAssumed: assumedDebtTotal  [기존 optional → 실값 채우기]
```

### 6.2 gift-tax-filing-form-besshi10.ts 변경 (derivePriorGiftAddition)

```typescript
// 기존 (line 74)
function derivePriorGiftAddition(r): number {
  const netCurrent = Math.max(0, r.grossGiftValue - r.exemptAmount);
  return Math.max(0, r.aggregatedGiftValue - netCurrent);
}

// 변경
function derivePriorGiftAddition(r): number {
  const debtAssumed = r.debtAssumed ?? 0;
  const netCurrent = Math.max(0, r.grossGiftValue - r.exemptAmount - debtAssumed);
  return Math.max(0, r.aggregatedGiftValue - netCurrent);
}
```

**이유**: aggregatedGiftValue = netCurrentGiftValue + priorAggregation.totalAmount
- §47① 채무 차감 후 netCurrentGiftValue가 줄어들므로 역산 시 debtAssumed를 포함해야 정합

### 6.3 사전증여(PriorGift) 입력 정의 명확화

**결정**: 이전 증여 회차의 `giftAmount`는 **채무 차감 전 증여재산가액** vs **채무 차감 후 과세가액** 중 어느 것인가?

→ **채무 차감 후 과세가액**(netCurrentGiftValue)으로 입력 받는다.

**근거**:
- `PriorGift.giftAmount`는 §47 합산 시 기합산분으로 사용됨
- 상증법 §47①의 과세가액이 이미 채무 차감 후 금액이므로, 사전증여 합산 시에도 동일 기준 적용
- UI 안내: "이전 증여 과세가액(채무 차감 후 금액) 입력" 라벨 추가

---

## 7. 14개 동기화 지점 명세

| 지점 | 파일 | 변경 내용 |
|------|------|-----------|
| ①폼 상태 | `components/calc/gift-tax-form-shared.tsx` | FormState: 변경 없음 (EstateItem 필드 사용) |
| ②initial | `components/calc/gift-tax-form-shared.tsx` | INITIAL_FORM.giftItems: EstateItem 기본값 변경 없음 |
| ③normalize | `lib/stores/gift-wizard-store.ts` or form shared | EstateItem normalize: assumedDebtForGift 숫자 변환 |
| ④API 변환 | `lib/calc/gift-api.ts` | buildGiftTaxInput: giftItems의 assumedDebtForGift 그대로 전달 (strip 불필요) |
| ⑤UI 위젯 | `components/calc/gift/EstateItemForm.tsx` | assumedDebtForGift CurrencyInput 추가 + §47③ 안내 문구 |
| ⑥사이드바 합계 | gift 사이드바 컴포넌트 | 채무 차감분 표시 (0원 제외 정책) |
| ⑦결과 카드 | `components/calc/gift/GiftTaxResultCard.tsx` | debtAssumed 행 표시 (별지 ② 연동) |
| ⑧validation | 증여 validate (없으면 신규 생성) | assumedDebtForGift >= 0 + §47③ 안내 (차단 없음) |
| ⑨Zod enum 메인 | `lib/validators/property-valuation-input.ts` estateItemSchema | `assumedDebtForGift: z.number().nonnegative().optional()` |
| ⑩Zod enum 컴패니언 | giftTaxInputSchema | giftItems → estateItemSchema 경유로 자동 처리 |
| ⑪자산-수준 fallback | route.ts | 해당 없음 (acquisitionDate fallback 패턴 아님) |
| ⑫Zod 입력 객체 | `lib/validators/property-valuation-input.ts` estateItemSchema | assumedDebtForGift 추가 (⑨와 동일 파일) |
| ⑬API body spread | `lib/calc/gift-api.ts` buildGiftTaxInput | allItems spread — assumedDebtForGift 자동 포함 (EstateItem 필드이므로 spread 정합) |
| ⑭Route handler | `app/api/calc/gift/route.ts` | 엔진 input 매핑 — Zod 통과 후 calcGiftTax(input) 직접 전달, 별도 매핑 불필요 |

---

## 8. GiftTaxResult 변경 명세

```typescript
// 기존 (optional — 현행 undefined)
debtAssumed?: number;  // ㉒ §47 채무액

// 변경: 엔진에서 실값 채워 반환
// - assumedDebtTotal = 0이면 0 반환 (undefined 아님)
// - 별지 10호 ㉒ 행: r.debtAssumed ?? 0 → 이미 정합
// - filingFormRows ② debtAmount: assumedDebtTotal 로 연동
// - aggregatedGiftValue echo: grossGiftValue - exemptAmount - debtAssumed + priorTotal (결과 카드 산식)
```

---

## 9. 음수 가드 전략

```typescript
// 3중 가드
const assumedDebtTotal = Math.max(
  0,
  input.giftItems.reduce((s, item) => s + (item.assumedDebtForGift ?? 0), 0)
);

const netCurrentGiftValue = Math.max(
  0,
  grossGiftValue - exemptAmount - assumedDebtTotal
  // 채무 > (재산가액 - 비과세) → 0 처리
);
```

케이스 매트릭스 §5.2 케이스 6 (인수 채무 > 자산 평가액) 처리:
- 과세가액이 음수가 될 수 없음 → Math.max(0, ...) 처리
- 결과 warnings에 "채무인수액이 증여재산가액을 초과하여 과세가액 0으로 처리됩니다" 추가

---

## 10. 상속세 §14 vs 증여세 §47① 성질 구분 (반드시 명시)

| 구분 | 상속세 §14 | 증여세 §47① |
|------|-----------|-------------|
| 법적 성질 | 피상속인의 **채무** 공제 | 부담부증여 수증자 **인수 채무** 과세가액 제외 |
| 발동 조건 | deductSecuredClaimAsDebt=true (opt-in) | assumedDebtForGift > 0 |
| 헬퍼 | deriveCollateralDebts() | 신규 필요 없음 (직접 합산) |
| §66 교차 | mortgageAmount/leaseDeposit과 중첩 | 동일 자산에서 §66 평가에 사용된 금액과 §47① 차감 구분 |
| 양도세 연계 | 없음 | 채무인수분 → 증여자의 유상양도 (transfer burdened_gift 기구현, 안내만) |

**설계 원칙**: `mortgageAmount`(평가용) = `assumedDebtForGift`(§47① 차감용) 관계는 사용자가 명시 입력. 자동 동기화(useEffect 미러링) 금지. 같은 금액을 두 필드에 중복 입력하는 것은 허용 — 두 로직이 독립적으로 각 필드를 소비.

---

## 11. 양도세 연계 안내 (스코프 외)

채무인수분은 증여자 입장에서 유상양도 처리 대상:
- `transfer burdened_gift` 양도세 계산기: 이미 구현 완료 (`lib/calc/transfer-tax-api-burdened-gift.ts`)
- 증여세 결과 화면에서 안내 카드만 표시: "채무인수분은 증여자의 양도소득세 신고 대상일 수 있습니다. 양도세 계산기에서 확인하세요."
- 자동 연동(금액 자동 이전) 스코프 외

---

## 12. 테스트 계획 (Do 단계)

### 필수 케이스 (anchor 업그레이드)

| 테스트 ID | 케이스 | 기대값 |
|-----------|--------|--------|
| BD-1 | 10억 토지 + 4억 채무 인수, 직계비속 | taxBase=5.5억, finalTax=101,850,000 |
| BD-2 | 채무 > 재산가액 (10억 토지 + 12억 채무) | netCurrentGiftValue=0, taxBase=0, finalTax=0 + warning |
| BD-3 | §66 MAX 교차: mortgageAmount=4억=assumedDebt → grossGiftValue=4억, netCurrentGiftValue=0 | taxBase=0 |
| BD-4 | 배우자 증여 + 4억 채무 + burdenedGiftDebtConfirmed=true | 차감 적용, 안내 warning 포함 |
| BD-5 | 별지 10호 ② 행 debtAmount 실값 | debtAmount=4억 표시 |
| BD-6 | besshi10 ㉒ 채무액 행 | r.debtAssumed=4억 → ㉒ amount=4억 |
| BD-7 | besshi10 ㉔ 과세가액 행 역산 | ⑰−⑱−⑲−⑳−㉑−㉒+㉓ 정합 |
| BD-8 | sectionList 사전증여 합산 정합 | priorGift 기준 과세가액 합산 |

### 기존 테스트 영향 분석

- `gift.test.ts`, `case-2-generation-skip.test.ts`, `gift-section47-cutoff-day-precision.test.ts`:
  - `assumedDebtForGift` 미입력 → `assumedDebtTotal=0` → 기존 동작 100% 보존
  - **영향 없음**
- `gift-filing-form-row5-formula.test.ts`:
  - `debtAmount: 0` 직접 전달 — 기존 그대로 통과
  - **영향 없음**
- `besshi10.test.ts` (있다면):
  - `debtAssumed` 0으로 전달 시 ㉒=0 — 기존 통과
  - **영향 없음**

---

## 13. 작업 파일 목록 (Do 단계)

### 엔진 (시니어 책임)
1. `lib/tax-engine/types/inheritance-gift.types.ts` — EstateItem: `assumedDebtForGift?`, `burdenedGiftDebtConfirmed?` 추가
2. `lib/tax-engine/gift-tax.ts` — STEP 2.5 추가, STEP 3 수정, STEP 10/11 수정
3. `lib/tax-engine/gift-tax-filing-form-besshi10.ts` — `derivePriorGiftAddition` 수정

### API/Zod
4. `lib/validators/property-valuation-input.ts` — estateItemSchema: `assumedDebtForGift`, `burdenedGiftDebtConfirmed` 추가

### 클라이언트 변환
5. `lib/calc/gift-api.ts` — buildGiftTaxInput: EstateItem spread 자동 처리 (변경 없을 수 있음)

### UI (UI 시니어 책임)
6. `components/calc/gift/[EstateItemForm 컴포넌트]` — CurrencyInput 추가 + §47③ 안내 문구
7. 사이드바 합계 업데이트
8. 결과 카드 `debtAssumed` 표시

### 테스트
9. `__tests__/tax-engine/inheritance-gift/gift-burdened-debt-47-1-anchor.test.ts` — Pre-Do anchor를 Do anchor로 업그레이드 (BD-1~BD-8)

---

## 14. 자가 점검 (완료 전)

- [ ] 케이스 매트릭스 §5.2 전수 (8케이스)
- [ ] 음수 가드 Math.max(0) 3중 적용
- [ ] §47③ 배우자/직계존비속 안내 문구, 차단 없음 확인
- [ ] §14 vs §47① 성질 구분 — 두 필드 독립 소비 확인
- [ ] besshi10.ts derivePriorGiftAddition 역산 정합
- [ ] 기존 테스트 영향 없음 (`assumedDebtForGift` undefined 시 legacy 동작 100% 보존)
- [ ] 14지점 ⑫⑬⑭ grep 자가점검
- [ ] tsc --noEmit 0건
- [ ] vitest inheritance-gift/ 전체 통과
