# 동시증여 다중 건 세액 계산 — 엔진 설계

> 계획서: `.claude/worktrees/gift-simultaneous-multi/docs/00-pm/gift-simultaneous-multi-gift.plan.md`
> 작성일: 2026-06-22
> 브랜치: `feat/gift-simultaneous-multi-gift`

---

## Context

증여세 납세의무자는 수증자다(상증법 §4의2①). 같은 날 부모로부터 130,000,000원, 조부모로부터 70,000,000원을 동시에 받았다면 두 건 모두 수증자가 신고·납부한다. 현행 `simultaneousGifts` 필드는 **현재 신고 건의 공제 한도 안분에만** 사용되며(계획서 §1 실측), 상대방 건(조부모 70M)의 산출세액·세대생략 할증·신고세액공제는 계산되지 않는다.

이 설계는 각 증여 건을 완전 `GiftTaxInput`으로 받아 `calcGiftTax`를 N번 호출하는 신규 오케스트레이터 `calcSimultaneousGifts`를 정의한다. 엔진 변경 최소화(기존 안분 메커니즘 무변경), 단일 소스(기존 헬퍼 100% 재사용)가 핵심 원칙이다.

---

## ★ 케이스 인벤토리 (Do 진입 전 필수 — 행 = anchor 테스트 1개 이상)

| # | 시나리오 | 법령 근거 | 입력 | 기대 산출 (원단위) | 테스트 파일 | 상태 |
|---|---------|----------|------|--------------------|------------|------|
| A-1 | 부모 130M + 조부모 70M 동시증여 → 직계존속 5천만 한도 안분 | 상증령 §46①2호 | 건0: father 130M / 건1: grandparent 70M / priorUsed 0 | 건0 공제 32,500,000 (`50M×130/200`) / 건1 공제 17,500,000 (`50M×70/200`) | `simultaneous-apportionment.test.ts` | TODO |
| A-2 | 조부모 건 §57 세대생략 30% 할증 | 상증법 §57① | 건1: grandparent 70M / isGenerationSkip=true / 성년 | 건1 산출세액에 30% 할증 정상 반영 | `simultaneous-generation-skip.test.ts` | TODO |
| A-3 | 수증자 총 납부세액 합계 | — | A-1 두 건 finalTax 합산 | Σ finalTax = 건0.finalTax + 건1.finalTax | `simultaneous-apportionment.test.ts` | TODO |
| A-4 | 동일인 합산 방어 가드 (부 130M + 모 50M = 그룹 A) | 상증법 §47② | 건0: father 130M / 건1: mother 50M | 방어 가드 발동 → 1건 180M 합산, 결과 배열 길이 1 | `simultaneous-same-group-guard.test.ts` | TODO |
| A-5 | 완전 별도 (직계존속 부모 + 직계비속) → 공제 그룹 다름, 안분 없음 | 상증법 §53 | 건0: father 100M / 건1: lineal_descendant 80M | 건0 공제 50M(전액, 안분 없음) / 건1 공제 50M(전액) | `simultaneous-separate-group.test.ts` | TODO |
| A-6 | 이미지7 재현 — 현재 신고 60M + 동시증여 100M (직계존속, 성년, priorUsed=0, 기한 내 신고) | 상증령 §46①2호 / 상증법 §69 | 건0: father 60M / 건1: grandparent 100M / 둘 다 성년·priorUsed 0 / isFiledOnTime=true (건0·건1 공제그룹 동일=직계존속, 동일인 그룹 다름 A≠B → 안분) | 건0 공제 18,750,000 (`50M×60/160`) / 건0 과세표준 41,250,000 / 건0 산출세액 4,125,000 / 건0 신고세액공제 123,750 / 건0 신고납부 4,001,250 | `simultaneous-image7-anchor.test.ts` | TODO |
| A-7 | 사전증여 합산 포함 — 동시증여 건에 priorGifts 있는 경우 | 상증법 §47② | 건1: grandparent 70M + priorGifts [{3년 전 조부모 30M}] | 건1 합산과세가액 = 70M + 30M = 100M (§47 그룹 B 합산) | `simultaneous-prior-gifts.test.ts` | TODO |

**규칙**: anchor 출처 미발견 행은 ☐ 상태로 유지. 발견 즉시 추가.

---

## 법령 근거

```
상증법 §4의2① : 납세의무자 = 수증자 (한 날 다수 증여도 수증자 동일)
상증법 §47②  : 동일인(직계존속 + 그 배우자) 10년 합산 — getDonorGroup 단일 소스
상증령 §46①2호: 동시증여 시 공제 한도를 과세가액 비율로 안분
                  floor(잔여한도 × 현재순과세가액 / (현재 + 동시증여 합))
상증법 §53   : 증여재산공제 한도 (배우자 6억 / 직계존속 성년 5천 / 미성년 2천 / 직계비속 5천 / 기타친족 1천)
상증법 §57①  : 세대생략 30% 할증 / 미성년 + 20억 초과 40% 할증
상증법 §69   : 신고세액공제 3%
```

법령 조문 상수: `lib/tax-engine/legal-codes/inheritance-gift.ts`의 `GIFT.*` 상수 사용.
- `GIFT.SIMULTANEOUS_APPORTIONMENT` = §46①2호 (`gift-deductions.ts:125` 현재 적용 중, 실측 확인)

---

## 기존 헬퍼 재사용 (single-source 원칙)

계획서 §3(2026-06-22 실측 결과) 및 코드 실측을 통해 확정:

| 헬퍼 | 파일:라인 | 역할 | 재사용 방법 |
|-----|----------|------|-------------|
| `getDonorGroup(donor)` | `gift-prior-aggregation.ts:31` | A~G 그룹 반환 (부=모=A, 조부모=B 등) | STEP 1 동일인 합산 가드 + STEP 2 공제그룹 판정 |
| `isSameDonorGroup(a, b)` | `gift-prior-aggregation.ts:51` | 두 donor가 같은 그룹인지 bool 반환 | STEP 1 동일인 합산 가드 |
| `deriveDonorRelation(donor, isMinorDonee)` | `prior-gift-donee-derive.ts:101` | father/mother/grandparent → lineal_ascendant_adult(adult/minor) 등 DonorRelation 5종 변환 | STEP 2 공제그룹 분류 + simultaneousGifts 주입 |
| `calcRelationDeduction(input, gross, current)` | `gift-deductions.ts:59` | 관계별 공제 + §46①2호 안분 | STEP 3에서 기존 `calcGiftTax` 내부에서 자동 호출 (무변경) |
| `calcGiftTax(input, options)` | `gift-tax.ts:74` | 단건 증여세 전체 계산 | STEP 3에서 mergedGifts마다 1회 호출 |

**신규 그룹 판정 헬퍼 작성 금지** — 계획서 §3 결정 및 기존 헬퍼로 3분기 전부 판정 가능(실측 확인).

---

## 오케스트레이터 알고리즘 — `calcSimultaneousGifts`

### 파일 위치

`lib/tax-engine/gift-simultaneous.ts` (신규, 800줄 정책 준수 예상 — 300줄 내외)

### 함수 시그니처

```ts
export function calcSimultaneousGifts(
  gifts: GiftTaxInput[],
  options?: GiftTaxEngineOptions,
): GiftTaxResult[]
```

- `gifts[0]` = 현재 신고 건 (건 0)
- `gifts[1..]` = 동시증여 추가 건
- 반환: 신고서(건) 수와 동일한 길이의 `GiftTaxResult[]`
- 수증자 총 납부세액 합계(Σ finalTax)는 결과뷰 책임 — 엔진 미반환

### STEP 1: 동일인 합산 가드

**목적**: D-2 결정(UI에서 동일 그룹 차단)으로 정상 경로에서는 발동하지 않음. 비정상 입력 방어.

```
판정: isSameDonorGroup(gifts[i].donor, gifts[j].donor) === true (i ≠ j)

발동 시 처리:
  1) 같은 getDonorGroup 건들을 1개로 병합:
     - 병합 대상: giftItems, stockItems (concat)
     - exemptionItems: 병합 (concat, 중복 제거 불필요 — 서식 UI 단독 제어)
     - priorGiftsWithin10Years: 병합 (concat)
     - 기준 건 = gifts 중 같은 그룹의 첫 번째 (donor, giftDate, isMinorDonee, deductionInput, creditInput 등 스칼라 필드 보존)
     - priorUsedDeduction: 병합된 건들의 최댓값 (상한 보수 — 같은 그룹이므로 동일해야 함)
  2) 결과: mergedGifts 배열 (동일인 그룹 수 = 신고서 수)
  3) 병합 발생 시 warnings에 "동일인(같은 그룹) 건이 자동 합산됨 — UI에서 한 카드로 입력하세요" 추가

병합 없을 때: mergedGifts = gifts (복사본)
```

**정수 연산 주의**: giftItems 병합은 배열 concat이므로 금액 연산 없음 — 이후 calcGiftTax STEP 1(재산 평가 합산)에서 자동 처리.

### STEP 2: 공제그룹 분류 + `simultaneousGifts` 자동 주입

**목적**: 같은 공제그룹(DonorRelation 기준) 건들이 안분되도록 `simultaneousGifts`를 오케스트레이터가 자동 채움. 기존 `calcRelationDeduction` 안분 로직 무변경.

```
각 건 i에 대해:
  1) donorRelationI = deriveDonorRelation(mergedGifts[i].donor, mergedGifts[i].isMinorDonee)
     → DonorRelation 5종 중 하나

  2) netCurrentGiftValueI 정확 계산 — ★2-PASS 방식 (정정: 추정치 폐기):
     §46①2호 안분 분모는 "증여세 과세가액"(= 평가액 − 비과세 − 채무) 비율이다.
     비과세(exempt)를 0으로 추정하면 비과세 있는 건에서 안분이 부정확 →
     법령 정확성 위반(memory feedback_no_silent_apportion_fallback). 따라서 정확 산출한다.

     PASS 1 (안분 파라미터 산출): STEP 1 병합 후 각 건을
       simultaneousGifts 미주입 상태로 calcGiftTax 호출 → resultPass1[i].
       netCurrentGiftValueI = resultPass1[i].netCurrentGiftValue
         (★ GiftTaxResult에 netCurrentGiftValue echo 필드 신규 추가 — echo-field-pattern.
          gift-tax.ts:159 값 = max(0, grossGiftValue − exemptAmount − assumedDebtTotal)을
          result에 노출. 산식/계산 영향 0, 회귀 위험 0.)
       ※ echo 미추가 시 재구성식: grossGiftValue − exemptAmount − debtAssumed — 단 debtAssumed는
         일반 스트림 채무만 담으므로(types:688) 부정확 가능 → **echo 추가가 정답**.

     PASS 2 (최종): 아래 4)에서 PASS 1의 netCurrentGiftValueI를 simultaneousGifts에
       주입하여 각 건 calcGiftTax 재호출 → 최종 results (STEP 3).

     ※ N은 보통 2~3건 → 2N회 호출이나 비용 무시 가능. 정확성 우선.
     ※ A-6 이미지7(비과세 0·채무 0)은 어느 방식이든 동일값이나, 비과세 있는 일반 케이스는 2-pass만 §46①2호 정합.

  3) 같은 공제그룹(donorRelationI 일치) 건 j ≠ i 목록 → sameGroupPeers[i]

  4) 각 건 i의 deductionInput을 수정한 새 객체 생성:
     updatedDeductionInput = {
       ...mergedGifts[i].deductionInput,
       donorRelation: donorRelationI,     // ★ 필수: 안분 필터가 이 값과 비교
       simultaneousGifts: sameGroupPeers[i].map(j => ({
         donorRelation: deriveDonorRelation(mergedGifts[j].donor, mergedGifts[j].isMinorDonee),
         taxableValue: netCurrentGiftValueJ,  // j건의 순 과세가액 추정
       })),
     }

  5) 완전 별도 그룹 건 (sameGroupPeers[i].length === 0):
     updatedDeductionInput.simultaneousGifts = undefined (안분 없음)
     → calcRelationDeduction 단건 경로(line:97) 진입 → min(remaining, grossGiftValue) 전액 공제
```

**안분 필터 동작 (실측)**: `gift-deductions.ts:90~91`
```ts
const sameGroup = (input.simultaneousGifts ?? []).filter(
  (g) => g.donorRelation === input.donorRelation && g.taxableValue > 0,
);
```
→ `input.donorRelation`이 `deriveDonorRelation` 결과와 일치해야 `sameGroup`에 잡힘. STEP 2에서 `donorRelation` 주입이 필수인 이유.

### STEP 3 (PASS 2): 각 건 calcGiftTax 재호출

PASS 1(STEP 2-2)에서 얻은 정확한 `netCurrentGiftValueI`를 `simultaneousGifts`에 주입한 상태로 재계산한다.

```
results: GiftTaxResult[] = []

for each i in 0..mergedGifts.length-1:
  inputI = { ...mergedGifts[i], deductionInput: updatedDeductionInput[i] }
  resultI = calcGiftTax(inputI, options)
  results.push(resultI)

return results
```

이 시점부터 모든 처리는 기존 `calcGiftTax` 내부에 위임:
- **STEP 1 (재산 평가)**: giftItems 합산 `grossGiftValue`
- **STEP 2 (비과세)**: 건별 exemptions 처리
- **STEP 3 (§47 사전증여 합산)**: priorGiftsWithin10Years 건별 독립
- **STEP 4 (§53 공제)**: STEP 2에서 주입된 `simultaneousGifts` → `calcRelationDeduction` 자동 안분
- **STEP 7 (§57 세대생략)**: donorGroup=B(조부모) → 30%/40% 할증 자동
- **STEP 8 (세액공제)**: `isFiledOnTime` → 3% 신고세액공제 자동

---

## 3분기 판정 매트릭스 (전수 enumerate)

| 건0 donor | 건1 donor | getDonorGroup 비교 | deriveDonorRelation 비교 | 분기 결과 |
|---------|---------|------------------|------------------------|---------|
| father | mother | A = A | adult = adult | STEP 1 방어 가드 발동 → 1건 합산 (D-2 정상 경로에선 UI 차단) |
| father | grandparent | A ≠ B | adult = adult | 공제그룹 안분 (§46①2호) |
| father | lineal_descendant | A ≠ D | adult ≠ descendant | 완전 별도 (안분 없음) |
| father | spouse | A ≠ C | adult ≠ spouse | 완전 별도 |
| father | other_relative | A ≠ F | adult ≠ other_relative | 완전 별도 |
| grandparent | grandparent | B = B | adult = adult | STEP 1 방어 가드 발동 → 1건 합산 |
| grandparent | lineal_descendant | B ≠ D | adult ≠ descendant | 완전 별도 |

**§57 세대생략 자동 처리**: grandparent 건은 `getDonorGroup → "B"` → `calcGiftGenerationSkipSurchargeWithLimit`에서 30%(미성년+20억 초과 40%) 자동 적용. 오케스트레이터 별도 처리 불필요.

---

## 신규 타입 시그니처

### 엔진 오케스트레이터 (신규 파일)

```ts
// lib/tax-engine/gift-simultaneous.ts

import type { GiftTaxInput, GiftTaxResult } from "./types/inheritance-gift.types";
import type { GiftTaxEngineOptions } from "./gift-tax";

/**
 * 동시증여 다중 건 세액 계산 오케스트레이터 (상증령 §46①2호)
 *
 * gifts[0] = 현재 신고 건, gifts[1..] = 동시증여 추가 건
 *
 * STEP 1: 동일인 합산 가드 (getDonorGroup 일치 → 병합)
 * STEP 2: 공제그룹 분류 + simultaneousGifts 자동 주입
 * STEP 3: 각 건 calcGiftTax 호출
 *
 * @returns GiftTaxResult[] — 신고서 수와 동일 길이. Σ finalTax는 호출자 책임.
 */
export function calcSimultaneousGifts(
  gifts: GiftTaxInput[],
  options?: GiftTaxEngineOptions,
): GiftTaxResult[]
```

### GiftTaxResult echo 필드 추가 (기존 파일 변경)

```ts
// lib/tax-engine/types/inheritance-gift.types.ts — GiftTaxResult 확장
export interface GiftTaxResult extends TaxResultMeta {
  // ... 기존 필드 ...
  /**
   * 금번 증여 순 과세가액 = max(0, grossGiftValue − exemptAmount − assumedDebtTotal).
   * 2-pass 안분 분모 산출용 echo (gift-tax.ts:159 값 노출, 산식·계산 영향 0).
   */
  netCurrentGiftValue?: number;
}
```

### FormState 확장 (기존 파일 변경)

```ts
// components/calc/gift-tax-form-shared.tsx — FormState 인터페이스 확장

export interface FormState extends AppraisalFeeFormFields {
  // ... 기존 필드 전부 유지 (건 0) ...

  /**
   * 동시증여 추가 건 배열 — 기존 simultaneousGifts 대체 (3-state 유지)
   * - undefined: 동시증여 토글 OFF
   * - []: 토글 ON 빈 상태 (UI에서 추가 전)
   * - [...]: 데이터 있음
   *
   * D-6 미결정: 기존 simultaneousGifts(간이)와 병행 여부.
   * 현 단계: 신규 simultaneousGiftForms만 구현, 간이 경로 하위 호환 별도 결정.
   */
  simultaneousGiftForms?: GiftSubForm[];
}
```

### GiftSubForm 타입 (D-1 확정 필요)

```ts
/**
 * 동시증여 추가 건 입력 폼 서브타입
 *
 * D-1 미결정: FormState 완전 재사용(중첩 FormState[]) vs 부분집합 신규 타입.
 *
 * 엔진 관점 권장안:
 *   FormState 완전 재사용 — buildGiftTaxInput(subForm)을 그대로 호출해
 *   GiftTaxInput 변환이 가능하므로 ④ API 변환 로직 중복 없음.
 *   result·step 등 UI-only 필드는 GiftTaxInput 변환 시 무시됨.
 *   단, 800줄 정책 위해 `simultaneousGiftForms?: FormState[]`로 선언 후
 *   각 추가 건 UI는 SimultaneousGiftCard 독립 컴포넌트로 격리.
 *
 * 대안(부분집합 신규 타입 GiftSubForm):
 *   필요 필드: donor, isMinorDonee, isSubstituteGift, giftDate,
 *             giftItems, stockItems, exemptionItems, priorGifts,
 *             marriageExemption, birthExemption, priorUsedDeduction,
 *             priorUsedMarriageBirthDeduction, isFiledOnTime,
 *             foreignTaxPaid, specialTreatment, familyBusinessYears,
 *             donorPaysGiftTax, donorHasJointLiability, doneePaidGiftTax
 *   제외: result, step, sidebarSummary 등 UI 전용 필드
 *   단점: buildGiftTaxInput 로직 복제 필요.
 *
 * → Design 단계에서 FormState 재사용으로 확정 권장.
 *   타입 별칭: `export type GiftSubForm = Omit<FormState, "simultaneousGiftForms">` (재귀 방지)
 */
export type GiftSubForm = Omit<FormState, "simultaneousGiftForms">;
```

### API 변환 신규 함수

```ts
// lib/calc/gift-api.ts — 신규 함수 추가

/**
 * FormState(건 0) + simultaneousGiftForms(건 1..) → GiftTaxInput[] 변환
 * ④ API 변환 지점. buildGiftTaxInput을 내부에서 N번 호출.
 */
export function buildSimultaneousGiftInputs(form: FormState): GiftTaxInput[]
```

### Route 응답 타입 변경

```ts
// app/api/calc/gift/route.ts — 응답 형태 변경

// 기존: { success: true, result: GiftTaxResult }
// 신규: { success: true, result: GiftTaxResult, simultaneousResults?: GiftTaxResult[] }

// simultaneousResults 없음 = 단건 (하위 호환)
// simultaneousResults 있음 = 다건 (건 0은 result, 건 1.. 은 simultaneousResults)
```

---

## 14개 동기화 지점 커버리지 표

| # | 지점 | 파일:위치 | 변경 내용 | TS 감지 여부 |
|---|-----|----------|----------|------------|
| ① | FormState | `gift-tax-form-shared.tsx:37` | `simultaneousGiftForms?: GiftSubForm[]` 신규 필드 | O |
| ② | INITIAL_FORM | `gift-tax-form-shared.tsx:119` | `simultaneousGiftForms: undefined` 추가 (3-state) | O |
| ③ | normalize | `lib/stores/calc-wizard-migration.ts` 또는 normalize 함수 | sub-form 내 Date 필드(비상장주식 valuationDate 등) ISO string 복원 | O (선택) |
| ④ | API 변환 | `lib/calc/gift-api.ts` | `buildSimultaneousGiftInputs(form): GiftTaxInput[]` 신규 함수 | O |
| ⑤ | UI 위젯 | `components/calc/gift/GiftCreditChecklist.tsx` + 신규 `SimultaneousGiftCard.tsx` | 토글 ON → 카드 반복 UI (D-4 경량 카드) | O |
| ⑥ | 사이드바 합계 | 증여세 마법사 사이드바 | 계획서 §8 "해당 없음"으로 표기됨 — 증여세 사이드바가 합계 selector를 사용하지 않음 | N/A |
| ⑦ | 결과 카드 | `GiftTaxResultView.tsx:57` | `simultaneousResults?: GiftTaxResult[]` prop 추가 + N개 별지 + 합계 카드 | O |
| ⑧ | validation | `lib/calc/gift-tax-form-validate.ts:29` | 각 sub-form 단계 검증 추가 / 동일 그룹 경고 | O |
| ⑨ | Zod 메인 | `lib/validators/property-valuation-input.ts:495` (`giftTaxInputSchema`) | 다건 배열 스키마 또는 동시증여 sub-form 배열 스키마 추가 | **TS 미감지** |
| ⑩ | Zod 보조 | `lib/validators/property-valuation-input.ts` 또는 `gift-aux-schemas.ts` | `giftSubFormSchema` 신규 — GiftSubForm 배열 검증 | **TS 미감지** |
| ⑪ | Zod 자산수준 fallback | `lib/validators/estate-item-schema.ts` | 기존 재사용 예상, 변경 없음 | O |
| ⑫ | Zod 입력 객체 정의 | `lib/validators/property-valuation-input.ts` | `giftTaxInputSchema` 또는 신규 `simultaneousGiftRequestSchema` — sub-form 배열 필드 포함 | **TS 미감지** |
| ⑬ | API fetch body | `lib/calc/gift-api.ts` (callGiftTaxAPI body spread) | `simultaneousGiftForms: buildSimultaneousGiftInputs(form)` 추가 | **TS 미감지** |
| ⑭ | Route handler 엔진 매핑 | `app/api/calc/gift/route.ts:48~80` | 배열 입력 parse → `calcSimultaneousGifts` 또는 분기 호출 / 응답에 `simultaneousResults` 추가 | **TS 미감지** |

**⑨⑩⑫⑬⑭는 TypeScript가 미감지하므로 Do 완료 시 grep 자가 점검 필수** (memory `feedback_api_zod_schema_sync`).

---

## 미결정 사항 — 엔진 관점 안

### D-1: GiftSubForm 타입 확정

**엔진 관점 권장**: `FormState` 완전 재사용 (`Omit<FormState, "simultaneousGiftForms">`로 재귀 방지).
- `buildGiftTaxInput(subForm as FormState)` 호출로 ④ API 변환 로직 중복 없음
- `result`·`step` 등 UI-only 필드는 GiftTaxInput 변환 시 자동으로 무시됨
- 단점: FormState에 무관 필드 오염 가능 — 그러나 엔진 계산 무영향
- 대안(부분집합 신규 타입) 선택 시 buildGiftTaxInput 유사 로직 복제 필요 → DRY 위반

### D-3: §53의2 혼인·출산 1억 다건 배분

엔진 관점에서 현행 `calcMarriageBirthDeduction` (`gift-deductions.ts:165`)이 `simultaneousGifts` 안분을 이미 지원(`gift-deductions.ts:192~207` 실측). 오케스트레이터가 `simultaneousGifts`를 자동 주입하면 **혼인·출산공제도 자동 안분**된다.

단, `priorUsedMarriageBirthDeduction`(§53의2③ 수증자 통산 기공제액)은 건 0에서 입력하고 건 1은 건 0의 실제 공제 결과를 반영해야 한다(순환 참조 위험). **엔진 관점 안**: 다건 입력 시 UI에서 각 건의 `priorUsedMarriageBirthDeduction`을 독립 입력받는다. 오케스트레이터가 순차 계산(건 0 결과에서 priorUsed를 건 1에 주입)하는 것은 N건이 모두 직계존속인 경우에만 필요하고, 실무에서 같은 날 직계존속 다건이 모두 §53의2를 신청하는 경우는 극히 드물어 **Design에서 안 제시**(계획서 §11 D-3 결정).

### D-6: 기존 `simultaneousGifts`(간이) 마이그레이션

현행 `FormState.simultaneousGifts` (간이 — 관계+과세가액 1줄 입력)와 신규 `simultaneousGiftForms` (완전 입력) 병행 기간 동안:
- API 변환 ④에서 `simultaneousGiftForms`가 있으면 완전 경로, 없고 `simultaneousGifts`가 있으면 간이 경로(기존 동작)
- Route ⑭에서 `simultaneousGiftForms`가 있으면 `calcSimultaneousGifts`, 없으면 `calcGiftTaxWithDonorPaidTax` (기존)
- **엔진 관점**: 두 경로 모두 Zod 검증 후 각각 엔진 호출 → 하위 호환 유지.
- 간이 → 완전 마이그레이션 일정은 UI 시니어 결정.

---

## 정수 연산·BigInt floor 정책

안분 산식 (`gift-deductions.ts:104~110` 현행 구현):
```ts
// BigInt 연산 (2^53 초과 정밀도) — 변경 없음
const apportioned = Number(
  (BigInt(Math.trunc(remaining)) * BigInt(Math.trunc(currentNetGiftValue))) /
    BigInt(Math.trunc(denominator)),
);
```

오케스트레이터의 `netCurrentGiftValueI`는 추정하지 않고 **PASS 1 calcGiftTax 결과**에서 정확히 취한다:
```
netCurrentGiftValueI = resultPass1[i].netCurrentGiftValue   // = max(0, grossGiftValue − exemptAmount − assumedDebtTotal)
```
- calcGiftTax 내부가 비과세·채무를 정확 차감(gift-tax.ts:159) → 오케스트레이터 산술 없음
- 모든 금액 정수(원). Math.round() 금지. 음수 방어는 gift-tax.ts 내부 Math.max(0,...)
- 모든 금액 정수(원) — Math.floor() 또는 Math.trunc() 사용
- Math.round() 금지
- 음수 방어: Math.max(0, ...) 필수

---

## Silent fallback / 자동 안분 후보 식별

| 필드 | 자동 안분 위험 | 결정 |
|-----|--------------|------|
| `netCurrentGiftValueI` (안분 분모) | 없음 | **2-pass 정확 계산** — PASS1 calcGiftTax가 비과세·채무 차감한 `netCurrentGiftValue` echo를 그대로 사용 (추정·오차 없음) |
| `priorUsedDeduction` (병합 시) | 같은 그룹 건들의 기사용공제가 다를 경우 | 방어 가드 발동(UI 차단) 이후에만 발생 → max() 취하되 경고 추가 |
| `simultaneousGifts` 주입 | 다른 그룹 건이 섞이는 실수 | 명확히 같은 그룹만 주입 (`sameGroupPeers`) |
| §53의2 혼인·출산 `priorUsedMarriageBirthDeduction` | 다건 간 통산 순서 | D-3 미결정 — 각 건 독립 입력으로 처리 |

**자동 안분 fallback 금지** 원칙 준수 (memory `feedback_no_silent_apportion_fallback`): 오케스트레이터는 안분 분모를 **추정하지 않는다** — PASS 1 `calcGiftTax`가 비과세·채무를 정확 차감한 `netCurrentGiftValue`를 산출하고, PASS 2가 그 정확값으로 안분한다.

---

## 테스트 약속

### 테스트 파일 구조

```
__tests__/tax-engine/gift/
├── simultaneous-apportionment.test.ts   # A-1, A-3, A-6
├── simultaneous-generation-skip.test.ts # A-2
├── simultaneous-same-group-guard.test.ts # A-4
├── simultaneous-separate-group.test.ts  # A-5
├── simultaneous-prior-gifts.test.ts     # A-7
└── simultaneous-image7-anchor.test.ts   # A-6 원단위 anchor
```

### A-6 이미지7 anchor (계획서 §10 기준)

```ts
// simultaneous-image7-anchor.test.ts
import { calcSimultaneousGifts } from "@/lib/tax-engine/gift-simultaneous";

describe("A-6 이미지7 재현 — 건0 직계존속 60M + 동시증여 100M", () => {
  it("건0 공제·과세표준·산출세액·신고세액공제·납부액이 원단위 일치", () => {
    // 계획서 §10 A-6: 현재 신고 60M 직계존속 + 동시증여 100M
    // 공제 = 50M × 60 / (60+100) = 50M × 60/160 = 18,750,000
    // 과세표준 = 60,000,000 - 18,750,000 = 41,250,000
    // 산출세액 = 41,250,000 × 10% = 4,125,000 (1억 이하 10%)
    // 신고세액공제 = floor(4,125,000 × 3%) = 123,750
    // 납부세액 = 4,125,000 - 123,750 = 4,001,250
    const [result0] = calcSimultaneousGifts([건0_father60M, 건1_grandparent100M]);
    expect(result0.totalDeduction).toBe(18_750_000);
    expect(result0.taxBase).toBe(41_250_000);
    expect(result0.computedTax).toBe(4_125_000);
    expect(result0.finalTax).toBe(4_001_250);
  });
});
```

### A-1 안분 원단위 anchor

```ts
// A-1: 건0 부모 130M / 건1 조부모 70M / 직계존속 성년 / priorUsed=0
// 건0 공제 = floor(50M × 130M / 200M) = floor(32,500,000) = 32,500,000
// 건1 공제 = floor(50M × 70M / 200M) = floor(17,500,000) = 17,500,000
// 잔여한도 확인: 건0 + 건1 = 32.5M + 17.5M = 50M (정합)
expect(result[0].totalDeduction).toBe(32_500_000);
expect(result[1].totalDeduction).toBe(17_500_000);
```

### floor 잔액 흡수 1원 정합 확인

안분 결과의 1원 오차(memory `feedback_floor_residual_absorption`):
- 건0 공제 + 건1 공제 ≤ 잔여한도 (floor 절사로 합이 한도 이하 가능, 정책상 허용)
- anchor 테스트에서 두 건의 공제 합이 한도를 초과하지 않음을 검증

---

## 구현 Phase (계획서 §9 기반)

| Phase | 내용 | 설계 지점 | 완료 기준 |
|-------|------|----------|---------|
| Phase 0 (Pre-Do) | `deriveDonorRelation('grandparent', false)` 실측 + A-1 throwaway anchor → 설계 환류 | `prior-gift-donee-derive.ts:101~119` | anchor 실패 확보 |
| Phase 1 (엔진) | `gift-simultaneous.ts` 작성 + STEP 1~3 구현 | `lib/tax-engine/gift-simultaneous.ts` (신규) | A-1~A-7 vitest 통과 |
| Phase 2 (API/Zod) | `giftSubFormSchema` + route 분기 (⑨⑩⑫⑬⑭) | `validators`, `route.ts` | TS 0건 + ⑨⑩⑫⑬⑭ grep 통과 |
| Phase 3 (UI 입력) | `SimultaneousGiftCard` + 토글 + ④ 변환 + ⑧ validation | UI 시니어 담당 | E2E 추가 건 입력 동작 |
| Phase 4 (결과뷰) | N개 별지서식 + 합계 카드 + PDF | UI 시니어 담당 | N개 결과 카드 렌더 |
| Phase 5 (E2E) | Playwright 2건 입력→계산→별지 2개·합계 검증 | `e2e/gift-simultaneous.spec.ts` (E2E_PORT=3101) | spec 통과 |

---

## UI 통합 위임

UI 측 명세는 `gift-simultaneous-multi-gift.ui.design.md` (별도 작성)에 위임.

엔진 시니어가 정의하는 공개 계약:
1. `calcSimultaneousGifts(gifts: GiftTaxInput[], options?: GiftTaxEngineOptions): GiftTaxResult[]`
2. `buildSimultaneousGiftInputs(form: FormState): GiftTaxInput[]` (④ API 변환 — `gift-api.ts`)
3. 응답 구조: `{ result: GiftTaxResult, simultaneousResults?: GiftTaxResult[] }`

UI 시니어가 구현할 사항:
- `SimultaneousGiftCard` 컴포넌트 (D-4 경량 카드)
- `GiftTaxResultView` props 확장
- 8개 동기화 지점 ①②③⑤⑥⑦⑧
- ⑥ 사이드바 합계: 계획서 §8 "해당 없음" 유지 (증여세 마법사는 합계 selector 미사용)
