# 증여세 특례 2-스트림 분리과세 엔진 설계
# gift-special-separate-stream.engine.design.md

> 작성: 2026-06-11
> 근거: 조특법 §30의5 (시행 20260602, MST 286597) · §30의6⑤ 준용
> 선행: PR #114(D1~D5) · PR #117(§47① 채무인수)
> Pre-Do anchor 실측: `__tests__/tax-engine/inheritance-gift/pre-do-anchor-special-stream.test.ts`

---

## 1. 법문 요건 (현행 확정)

### 1.1 §30의5 핵심 조항

**§30의5①** (과세특례 본문):
- 창업자금에 대해 5억 공제, 10% 단일세율
- "창업자금을 2회 이상 증여받거나 부모로부터 각각 증여받는 경우에는 각각의 증여세 과세가액을 합산하여 적용한다" → **기간 무관 합산 (①후단)**

**§30의5⑪** (합산 배제·§69 배제):
- "동일인(그 배우자를 포함한다)으로부터 증여받은 창업자금 **외의** 다른 증여재산의 가액은 창업자금에 대한 증여세 과세가액에 가산하지 아니하며"
  → 일반 재산은 특례 스트림 과세가액에 합산 금지 (§47② 배제)
- "신고세액공제(§69)를 적용하지 아니한다" (PR #114 D5 기구현)

**§30의5⑫** (특례신청 게이트):
- "증여세 과세표준 신고기한까지 특례신청을 하여야 한다. 신고기한까지 특례신청을 하지 아니한 경우에는 이 특례규정을 적용하지 아니한다"
  → **강행규정**: 미신청 시 특례 전체 배제 → 일반 증여세 과세

**§30의6⑤**: "제30조의5 제8항부터 제13항까지 준용" → §30의5⑪·⑫ 모두 준용

### 1.2 갭 요약 (계획서 A-2 실측 확인)

| 갭 | 법문 근거 | Pre-Do anchor 실증 |
|---|---|---|
| G1: 일반 prior §47 합산 (⑪ 위반) | §30의5⑪ | [B-1] aggregatedGiftValue=30억(20억+10억) |
| G2: 혼합 증여 전체에 특례 적용 | §30의5①·⑪ | [A-1] specialTreatmentCredit=9.65억(35억 기준) |
| G3: 특례 prior 기간무관 합산 불가 | §30의5①후단 | [C-2] 15년 전 prior 제외(aggregatedGiftValue=20억) |
| G4: "절감액 공제" 방식 | §30의5 스트림 구조 | 전 anchor에 걸쳐 일관된 왜곡 |

---

## 2. 현행값 vs 기대값 비교표 (anchor 실측)

| 케이스 | 현행 finalTax (실측) | 2-스트림 기대값 |
|---|---|---|
| A. 혼합(창업30억+일반5억) | 300,000,000 원 (3억) | 창업세(2.5억) + 일반세(별도 계산) > 3억 |
| B. 일반prior10억+창업20억 | 100,000,000 원 (1억) | 창업세(1.5억) + 일반스트림(prior 제외) |
| C. 15년前특례prior10억+창업20억 | 150,000,000 원 (1.5억) | 창업세(2억) — 기납부5천만차감 = 1.5억 |

A: 현행 3억 < 기대(2-스트림 합산) → 일반분 세액 누락으로 세액 과소
B: 현행 1억 (prior §58 기납부 공제 흡수로 특례 절감 극대화) vs 기대(prior 제외 후 창업 1.5억 + 일반 스트림 별도)
C: 15년 전 특례 prior → 현행은 §47 cutoff 제외로 우연히 같은 값(1.5억), 기대는 기간무관 합산으로 1.5억→2억

---

## 3. 설계 결정 (Do 진입 전 확정)

### 3.1 2-스트림 아키텍처

```
calcGiftTax(input)
  ├─ (specialTreatment 없음) → 기존 단일 스트림 (100% 보존)
  │
  └─ (specialTreatment = "startup" | "family_business")
       ├─ [특례 스트림] calcSpecialStream(specialItems, specialPriors, brackets)
       │     → 특례 자산만 (§30의5① 한도 적용)
       │     → 과거 특례 prior 합산 (①후단, 기간 무관)
       │     → 5억/10억 공제 → 10%(/20%) → §69 배제
       │     → 기납부 특례세액 차감 (§58 유사)
       │
       └─ [일반 스트림] calcOrdinaryStream(ordinaryItems, ordinaryPriors, brackets)
             → 일반 자산만 (특례 자산 제외)
             → 일반 prior만 §47② 합산 (기간 10년 cutoff)
             → §53·§53의2 공제 → §56 누진 → §57 → §58 → §69

최종 = 특례 스트림 세액 + 일반 스트림 세액
```

### 3.2 자산 귀속 입력 설계

**단순화 원칙**: 자산 1개 = 자동 특례 귀속, 혼합 = 명시 선택

| 시나리오 | 입력 방식 |
|---|---|
| giftItems 1개 + specialTreatment 선택 | 자동 특례 귀속 (isSpecialTreatmentAsset 불필요) |
| giftItems N개 + specialTreatment 선택 | 자산-수준 `isSpecialTreatmentAsset: boolean` 필드 — UI에서 각 자산에 라디오 선택 |
| specialTreatment 미선택 | isSpecialTreatmentAsset 무시 |

**EstateItem 확장**: `isSpecialTreatmentAsset?: boolean` 추가 (optional — 미선택 시 undefined = 일반 귀속)

**침묵 누락 방지** (memory: feedback_silent_omission_full_input_enforcement):
- specialTreatment 선택 + giftItems 2개 이상 시 isSpecialTreatmentAsset 미설정 자산 → validation 차단
- "특례 귀속 자산을 선택해 주세요" 오류 메시지

### 3.3 PriorGift.specialTreatmentType 추가

```typescript
// inheritance-prior-gift.types.ts 확장
interface PriorGift {
  // 기존 필드 유지 ...

  /**
   * §30의5①후단·§30의6⑤ 기간무관 합산용 — 과거 특례 회차 구분.
   * "startup": 창업자금 (§30의5)
   * "family_business": 가업승계 (§30의6)
   * undefined: 일반 증여 (§47② 10년 cutoff 합산)
   *
   * §30의5⑪: specialTreatmentType 설정 prior는 일반 §47② 합산에서 제외.
   * 특례 스트림에서만 합산(기간 무관).
   */
  specialTreatmentType?: "startup" | "family_business";

  /**
   * 과거 특례 회차에서 실제 납부한 특례세액 (§58 유사 차감용).
   * specialTreatmentType 있을 때만 유효.
   * 예: 과거 창업자금 10억 → 특례세액 5천만 납부 → 5천만 입력
   */
  priorSpecialTaxPaid?: number;
}
```

### 3.4 특례신청 게이트 (§30의5⑫)

**결정**: specialTreatment 선택 = 신청 의제로 단순화 (개발 단순화 + 실무 동일 효과)

**근거**:
- §30의5⑫: "증여세 과세표준 신고기한까지 특례신청"
- 계산기 특례 선택 = 신청 의도 표명으로 간주. 실제 신청서 제출 여부는 사용자 책임
- UI 경고 문구 추가: "특례 적용을 위해 신고기한 내 특례신청서(§30의5⑫)를 반드시 제출하세요"
- `specialTreatment` 입력 필드 = 기존 GiftTaxCreditInput 확장 (신규 필드 불필요)

### 3.5 specialTreatmentCredit 처리

**결정**: deprecated — 0으로 고정, 새 필드로 대체

| 필드 | 처리 방법 |
|---|---|
| `creditDetail.specialTreatmentCredit` | 0으로 고정 (deprecated, 2-스트림 후 의미 없음) |
| 신규 `specialStreamTax` | 특례 스트림 세액 (GiftTaxResult에 추가) |
| 신규 `ordinaryStreamTax` | 일반 스트림 세액 |
| 기존 `computedTax` | `ordinaryStreamTax` (단일 스트림이면 동일, 혼합은 일반분만) |
| 기존 `finalTax` | `specialStreamTax + ordinaryStreamTax - 공제` (변경 없음) |

**결과뷰·별지10호 영향**:
- `TaxCreditBreakdownCard.tsx:144` — `creditDetail.specialTreatmentCredit` → 0으로 고정, 대신 별도 카드에 특례 세액 표시
- `gift-tax-filing-form-besshi10.ts:144` — ㊶ "그 밖의 공제·감면세액" → 0 (특례세액은 별도 산출 구조로 전환)
- `inheritance-filing-form-helpers.ts:92-101` — `specialTreatment` 분기 → 유지 (별지 10호 재산종류코드)

### 3.6 일반 스트림 §53·§53의2 공제 분배

**결정**: 공제는 일반 스트림에만 귀속 (특례 스트림은 법정 5억/10억 공제 전용)

**근거**: §30의5①은 §53·§53의2에도 불구하고 별도 공제(5억)를 규정 → 특례 스트림은 법정 공제로 독립

**구현**:
- `GiftDeductionInput`은 일반 스트림에만 전달
- 특례 스트림은 `STARTUP_BASE_DEDUCTION(5억)` 또는 `FAMILY_BUSINESS_BASE_DEDUCTION(10억)` 고정

### 3.7 §57 세대생략 할증 귀속

**결정**: 세대생략 할증은 각 스트림 산출세액에 독립 적용 (grandparent 증여 시)

- 일반 스트림 할증: 일반 스트림 산출세액 기준
- 특례 스트림 할증: 특례 스트림 산출세액 기준 (§30의6⑤ → §30의5 준용 — 할증 명시 배제 없음)

---

## 4. 케이스 매트릭스 전수 (설계 요구사항 §1)

| # | 케이스 | 일반 스트림 | 특례 스트림 | finalTax 구성 |
|---|---|---|---|---|
| M-01 | 특례 자산만 (prior 없음) | 없음 (0) | 특례가액 - 공제 → 10% | 특례 스트림 세액만 |
| M-02 | 일반 자산만 (specialTreatment 없음) | §47·§53·§56 정상 | 없음 (0) | 기존 단일 스트림 (100% 보존) |
| M-03 | 혼합 증여 (특례+일반, prior 없음) | 일반분 → §53·§56 | 특례분 → 5억 공제 → 10% | 두 스트림 합산 |
| M-04 | 일반 prior 10년 내 + 신규 특례 | 일반 prior는 일반 스트림 §47 합산 | 신규 특례분만 | 특례 스트림 + 일반 스트림(prior 포함) |
| M-05 | 특례 prior 10년 내 + 신규 특례 | prior 제외 (§30의5⑪) | 특례 스트림 합산(prior+신규, 기간무관) - 공제 - 기납부특례세액 | 특례 스트림만 (prior 기납부 차감) |
| M-06 | 특례 prior 15년 전 + 신규 특례 | prior 제외 | 특례 스트림 기간무관 합산 | 특례 스트림 (C-현행 vs 기대 비교) |
| M-07 | 혼합 prior (일반+특례) + 신규 특례 | 일반 prior만 §47 합산 | 특례 prior만 기간무관 합산 | 두 스트림 합산 |
| M-08 | 혼합 prior (일반+특례) + 신규 혼합 | 일반분+일반prior → §47 | 특례분+특례prior → ①후단 | 두 스트림 합산 |
| M-09 | 특례 미적격 폴백 (투자 미완료) | 전체 일반 과세 | 없음 (특례 배제) | 기존 단일 스트림 (PR #114 폴백 유지) |
| M-10 | §30의5 한도 초과분 | 한도 초과분 → 일반 스트림 | 한도 내분만 → 특례 | 두 스트림 합산 |
| M-11 | 세대생략 + 창업자금 특례 (grandparent) | 일반 스트림 §57 | 특례 스트림 §57 | 두 스트림 할증 합산 |
| M-12 | §53의2 혼인·출산 공제 + 일반 스트림 | §53의2 공제 일반 스트림만 | 특례 스트림 공제 없음 (법정 5억) | 정상 |
| M-13 | 가업승계(§30의6) + 일반 자산 혼합 | 일반분 일반 스트림 | 가업주식 특례 스트림 (120억 기준) | 두 스트림 합산 |
| M-14 | 특례 선택 + giftItems 2개 미귀속 | — | — | validation 차단 (침묵 누락 방지) |

---

## 5. 파일 분리 계획 (800줄 정책)

### 5.1 현재 줄수

| 파일 | 현재 줄수 | 2-스트림 추가 후 예상 |
|---|---|---|
| `gift-tax.ts` | 380줄 | ~500줄 (스트림 분기 추가) — 800 이내 |
| `credits/special-tax-treatment.ts` | 338줄 | ~180줄 (절감액 계산 제거, 스트림 계산으로 이전) |
| `gift-prior-aggregation.ts` | 179줄 | ~280줄 (특례 prior 분리 함수 추가) |
| `inheritance-gift-tax-credit.ts` | 517줄 | ~520줄 (specialTreatmentCredit=0 처리) |

→ 800줄 위반 없음. 분리 불필요.

단, `calcSpecialStream`·`calcOrdinaryStream` 로직이 커지면 `gift-special-stream.ts` 신규 파일로 분리 준비.

### 5.2 신규 파일

```
lib/tax-engine/
  gift-special-stream.ts          ← 신규: 2-스트림 계산 모듈
    calcSpecialTreatmentStream()  — 특례 스트림
    calcOrdinaryGiftStream()      — 일반 스트림
    partitionGiftItems()          — 자산 귀속 분류
    filterSpecialPriors()         — 특례 prior 필터 (specialTreatmentType 있는 것)
    filterOrdinaryPriors()        — 일반 prior 필터 (specialTreatmentType 없는 것)
```

---

## 6. 14개 동기화 지점 — 엔진 책임 명세

### 6.1 엔진 책임 지점 (⑨⑩⑫⑭)

**⑨ Zod enum 메인** (`app/api/calc/gift/route.ts` Zod 스키마):
- `EstateItemSchema`: `isSpecialTreatmentAsset: z.boolean().optional()` 추가
- `PriorGiftSchema`: `specialTreatmentType: z.enum(["startup", "family_business"]).optional()` 추가
- `PriorGiftSchema`: `priorSpecialTaxPaid: z.number().int().nonnegative().optional()` 추가

**⑩ Zod enum 컴패니언**: addPropertyRefines에서 특례 귀속 검증
- giftItems.length > 1 + specialTreatment 선택 → isSpecialTreatmentAsset 미설정 항목 차단

**⑫ Zod 입력 객체 정의**: GiftTaxInput 타입 전달 경로 전수 확인 (⑬ body spread 포함)

**⑭ Route handler 엔진 input 매핑**: 신규 필드가 Date 변환 없음(boolean·number·enum) → coerceDates 대상 아님

### 6.2 UI 책임 지점 (①~⑧, ⑪⑬)

| 지점 | 담당 | 변경 사항 |
|---|---|---|
| ①폼 상태 | UI 시니어 | `isSpecialTreatmentAsset` 자산-수준 store 필드 추가 |
| ②initial | UI 시니어 | `isSpecialTreatmentAsset: undefined` initial 추가 |
| ③normalize | UI 시니어 | `isSpecialTreatmentAsset` 정규화 (undefined → false?) |
| ④API 변환 | UI 시니어 | `gift-api.ts` 자산-수준 spread에 `isSpecialTreatmentAsset` 포함 |
| ⑤UI 위젯 | UI 시니어 | 자산 카드에 "특례 귀속" 라디오 추가 (specialTreatment 선택 시 조건부 표시) |
| ⑥사이드바 합계 | UI 시니어 | 특례분/일반분 합계 분리 표시 |
| ⑦결과 카드 | UI 시니어 | 스트림 분리 산식 표시 + specialTreatmentCredit 제거 |
| ⑧validation | UI 시니어 | isSpecialTreatmentAsset 미설정 차단 + §30의5⑫ 신청 안내 |
| ⑪fallback | 없음 (boolean에 fallback 불필요) | — |
| ⑬body spread | UI 시니어 | 자산-수준 spread 확인 |

---

## 7. GiftTaxResult 신규 필드 (결과 타입 확장)

```typescript
interface GiftTaxResult {
  // ... 기존 필드 유지 (하위 호환) ...

  /**
   * 특례 스트림 세액 (2-스트림 분리 시).
   * specialTreatment 미선택 시 0.
   */
  specialStreamTax?: number;

  /**
   * 일반 스트림 세액.
   * specialTreatment 미선택 시 computedTax와 동일.
   */
  ordinaryStreamTax?: number;

  /**
   * 특례 스트림 기반 합산 과세가액 (별지 10호 표시용).
   * 특례 prior 기간무관 합산 결과.
   */
  specialStreamAggregatedValue?: number;
}
```

**Map 금지**: 모든 신규 필드는 Record 또는 단순 타입만 사용 (memory: feedback_engine_result_map_json_loss)

---

## 8. §58 유사 기납부 특례세액 차감 방식

**§30의5①후단 합산 시 기납부 특례세액 처리**:

```
특례 스트림 합산 과세가액 = 신규 특례가액 + 과거 특례 prior 가액(기간무관)
특례 과세표준 = 합산 과세가액 - 5억/10억 공제
특례 산출세액(합산) = 과세표준 × 10%(/20%)
기납부 특례세액 = Σ(priorSpecialTaxPaid) — 과거 회차 납부세액 합산
최종 특례 스트림 세액 = max(0, 합산 산출세액 - 기납부 특례세액)
```

**§58 ①과의 비교**: 일반 §58 기납부 공제는 일반 스트림에만 적용. 특례 스트림에는 priorSpecialTaxPaid 전용 차감.

---

## 9. Pre-Do anchor 파일

위치: `__tests__/tax-engine/inheritance-gift/pre-do-anchor-special-stream.test.ts`

| Anchor | 목적 | 현행 finalTax | 상태 |
|---|---|---|---|
| A-1 | 혼합 증여 35억 전체 특례 왜곡 실증 | 300,000,000 | 통과 (현행 고정) |
| A-2 | 창업자금 30억 단독 특례세액 기준 | 250,000,000 | 통과 |
| B-1 | 일반 prior 10억 §47 합산 실증 | aggregated=30억 | 통과 |
| B-2 | prior 유무 computedTax 차이 실측 | prior있음>없음 | 통과 |
| C-1 | 10년내 특례 prior §47 합산(구분불가) | aggregated=30억 | 통과 |
| C-2 | 15년전 특례 prior §47 cutoff 제외 실증 | aggregated=20억 | 통과 |
| C-3 | PriorGift.specialTreatmentType 미존재 확인 | undefined | 통과 |
| Summary | 3 케이스 현행값 고정 | A:3억, B:1억, C:1.5억 | 통과 |

**Do 완료 후 변경 예상**:
- A-현행 3억 → 기대: 2.5억(특례) + 일반 5억분 세액(약 수천만) > 3억
- B-현행 1억 → 기대: 창업 1.5억 + 일반 스트림(prior 제외) 별도 계산
- C-현행 1.5억 → 기대: 기간무관 합산으로 2억(기납부5천만 차감)

---

## 10. 구현 순서 (Do 단계)

### Phase 1: 엔진 타입 확장 (anchor 선처리)

1. `lib/tax-engine/types/inheritance-prior-gift.types.ts`:
   - `PriorGift.specialTreatmentType?: "startup" | "family_business"` 추가
   - `PriorGift.priorSpecialTaxPaid?: number` 추가

2. `lib/tax-engine/types/inheritance-gift.types.ts`:
   - `EstateItem.isSpecialTreatmentAsset?: boolean` 추가
   - `GiftTaxResult.specialStreamTax?: number` 추가
   - `GiftTaxResult.ordinaryStreamTax?: number` 추가

### Phase 2: 2-스트림 모듈 구현

3. `lib/tax-engine/gift-special-stream.ts` 신규:
   - `partitionGiftItems()`: isSpecialTreatmentAsset 기준 분류
   - `filterSpecialPriors()`: specialTreatmentType 있는 prior만
   - `filterOrdinaryPriors()`: specialTreatmentType 없는 prior만
   - `calcSpecialTreatmentStream()`: 특례 스트림 계산
   - `calcOrdinaryGiftStream()`: 일반 스트림 계산

### Phase 3: gift-tax.ts 통합

4. `lib/tax-engine/gift-tax.ts` STEP 0 (specialTreatment 분기):
   - specialTreatment 선택 시 → 2-스트림 경로
   - 미선택 시 → 기존 단일 스트림 (코드 변경 없음)

5. `lib/tax-engine/inheritance-gift-tax-credit.ts`:
   - `specialTreatmentCredit = 0` (deprecated, 2-스트림 후 계산 이전)

### Phase 4: 14지점 동기화 (Zod·Route·UI)

6. `app/api/calc/gift/route.ts`: Zod 스키마 신규 필드 추가
7. `lib/calc/gift-api.ts`: API 변환 신규 필드 spread
8. `lib/calc/gift-validate.ts`: validation 규칙 추가

### Phase 5: anchor 테스트 갱신

9. `pre-do-anchor-special-stream.test.ts`: 현행 expect → 기대값으로 갱신
10. 케이스 매트릭스 M-01~M-14 unit test 추가

---

## 11. 범위 외 (A-Phase 2 별도 PR)

- G5: 상속세 §13 기간무관 가산 (`inheritance-tax.ts` · `inheritance-gift-common.ts`)
  - `PriorGift.specialTreatmentType` 재사용
  - `isWithin13Cutoff` 게이트에 `specialTreatmentType` 예외 추가
  - `computePriorGiftDeductionForLimit` 수정 (§24③ 창업자금 가산 제외)
  - 상속 anchor 영향 전수 확인 필요 — 별도 PR 분리
