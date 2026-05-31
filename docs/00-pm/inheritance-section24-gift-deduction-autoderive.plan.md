# §24 종합한도 — 사전증여 증여재산공제 자동 도출 (계획 + 13단계 자가검증)

> 2026-05-31. 사용자 지적(이미지49/50): §24 종합한도가 사전증여재산에서 §53 증여재산공제(배우자 600m + 직계비속 50m = 650m)를 차감하지 않아 ceiling 과소(5,315m, 정답 5,965m).

## 1. 문제 (probe 실증)

| | 사전증여 순 차감액 | §24 ceiling |
|---|---|---|
| 현재(버그) | 2,960m (전액) | 8,775 − 500 − 2,960 = **5,315m** |
| 교재(정답) | 2,960 − 650 = 2,310m | 8,775 − 500 − 2,310 = **5,965m** |

`applyDeductionLimit` 산식 구조는 정확(`net = totalGift − giftDeductions`). **`giftDeductions`가 0으로 전달되는 입력 경로**가 원인.

## 2. 법령 근거 (KoreanLaw mst 276123, 시행 20260102)

§24 3호: 가산 증여재산가액 − (§53·§53의2·§54 공제받은 금액). **단서**: 3호는 과세가액 5억원 초과 시에만 적용.

## 3. 근본 원인 — 자동 도출 누락 + dual-truth

- §24 한도(`inheritance-tax.ts:444`)는 `input.deductionInput.priorGiftDeductionTotal ?? 0` — **수동 입력 필드 의존**. UI(`step4-5.tsx`)는 `AutoSuggestBadge`로 제안만, 사용자가 "적용" 클릭해야 반영. 미클릭 → 0.
- 반면 **배우자 법정상속분 분자**(`inheritance-tax.ts:263-272`)는 `calcRelationDeduction`(§53)으로 **엔진 자동 도출**(giftTaxBase 우선 → doneeRelation fallback). → 두 경로 불일치.
- 기존 anchor A-9/A-10은 fixture `deductionInput.priorGiftDeductionTotal = 650_000_000`을 **직접 세팅**해 5,965m 통과 → 실제 미입력 경로(0)의 버그를 가림(dual-truth).

## 4. 설계

### 4.1 엔진 — 자동 도출 함수 신설

`lib/tax-engine/deductions/inheritance-deductions.ts`에 순수 함수:

```
computePriorGiftDeductionForLimit(preGifts, deathDate): number
  // §13 cutoff 통과 건만 (aggregatePriorGiftsForInheritance와 동일 isWithin13Cutoff). 영리법인 포함.
  // 건별 우선순위 (배우자 분자와 일관):
  //   1. giftTaxBase 명시 → max(0, giftAmount − giftTaxBase)  (= 그 증여의 §53+§53의2+§54 공제 실액)
  //   2. giftTaxBase 없고 doneeRelation 있음 → 관계별 그룹에 모아 calcRelationDeduction(그룹합, 관계한도 1회)
  //   3. 둘 다 없음 → 0 (보수적 — 화면에 보이지 않는 미입력 건의 과대공제 차단)
  // 반환 = Σ(1) + Σ(2)
```

`inheritance-tax.ts` Phase D 호출:
```
priorGiftDeductionTotal:
  input.deductionInput.priorGiftDeductionTotal     // 명시 override 우선
  ?? computePriorGiftDeductionForLimit(input.preGiftsWithin10Years, input.deathDate)  // 미입력 시 자동
```
buildInput이 `parseAmount(...) || undefined`라 미입력/0 → undefined → 자동 도출. 명시값 → override.

### 4.2 §24 단서 (5억 초과 조건) — 함께 구현

`applyDeductionLimit`: `taxableEstateValue ≤ 5억`이면 §24 3호(사전증여) 차감 0. (1·2호 유증·포기는 단서 무관, 항상 차감.)

### 4.3 dual-truth 차단 — suggest 단일화

`lib/calc/suggestPriorGiftDeductionTotal`가 엔진 `computePriorGiftDeductionForLimit` 재사용(lib/calc→lib/tax-engine 정방향 import OK) → UI 제안값 = 엔진 실제값. cutoff용 deathDate를 suggest에 전달(step4-5에 prop 추가).

### 4.4 케이스 인벤토리

| # | 케이스 | totalGift | giftDeductions | ceiling 기대 |
|---|---|---|---|---|
| C1 | 교재(배우자760+장남1500+법인700), 유증500 | 2,960m | 650m(배600+장50+법0) | 5,965m |
| C2 | priorGiftDeductionTotal 명시 700m override | 2,960m | 700m | 5,915m |
| C3 | preGifts 없음 | 0 | 0 | 8,775−500 = 8,275m |
| C4 | doneeRelation·giftTaxBase 둘 다 미입력 | 2,960m | 0 | 5,315m(보수적) |
| C5 | 단서 — 과세가액 4억(≤5억), preGift 1억 | 1억 | (3호 미적용) | 4억−유증−0 |
| C6 | 같은 관계 복수(배우자 4억+3억=7억) | 7억 | 6억(한도1회, **건별이면 7억 오류**) | … |

### 4.5 UI (14 동기화 지점)

엔진 input/result **타입 무변경**(preGifts·priorGiftDeductionTotal·deductionLimitDetail 모두 기존). 영향:
- ⑤ UI 위젯: `priorGiftDeductionTotal` 수동 입력 hint를 "미입력 시 사전증여 수증자 관계로 §53 공제 자동 계산"으로 수정. suggest에 deathDate prop 전달.
- ⑦ 결과 카드: `DeductionLimitDetailCard`는 이미 `priorGiftDeductionTotal` 표시 → 자동 도출값(650m)이 자동 노출. "자동" 배지 추가(선택).
- ①②③④⑥⑧⑨⑩⑪⑫⑬⑭: 무영향(타입·변환·validate·Zod·route 변경 없음).

## 5. 13단계 자가검증

### [1] 계획 작성 → [2] 검토1 → [3] 정정1

| 검토1 (법령정확성·dual-truth) | 정정1 |
|---|---|
| §24 3호 차감 = 증여공제(§53·53의2·54). 산식 totalGift−giftDeductions 맞음 | 확정 |
| ★ suggest(doneeRelation 그룹)와 엔진(giftTaxBase 우선) 알고리즘 불일치 시 새 dual-truth | §4.3 suggest 엔진 재사용 단일화 추가 |
| ★ fixture preGifts에 doneeRelation 없음(giftTaxBase만) → 실사용(doneeRelation) 경로 anchor 부재 | fixture에 doneeRelation 보강 + 자동 도출 anchor |

### [4] 검토2 → [5] 정정2

| 검토2 (cutoff·영리법인·관계한도) | 정정2 |
|---|---|
| ★ 자동 도출이 §13 cutoff 미적용 시 totalGift(cutoff 적용)와 분모 불일치 | §4.1 isWithin13Cutoff 동일 필터 명시 |
| 영리법인 사전증여(700m) 공제 0 — totalGift엔 포함, giftDeductions엔 0 | giftTaxBase=giftAmount(법인) → 공제 0 자동. 정합 |
| ★ 같은 관계 복수 건 건별 calcRelationDeduction → 한도 중복(C6) | 관계별 그룹 합산 후 1회 한도 (suggest 방식 채택) |

### [6] 엔진설계 → [7] 검토 → [8] 정정

| 엔진검토 | 정정 |
|---|---|
| `??` 연산: 0 입력도 자동 도출되나? | buildInput `|| undefined` → 0=undefined=자동. 의도 부합(증여공제 0 강제 실무 없음) |
| ★ 단서(5억) 미구현 — 같은 함수, §24 완성도 | §4.2 함께 구현 + C5 anchor |
| `computePriorGiftDeductionForLimit` 800줄? inheritance-deductions.ts 695줄 | 함수 ~30줄 추가 → 분리 불요(여유). 초과 시 farming처럼 분리 |

### [9] UI설계 → [10] 검토 → [11] 정정

| UI검토 | 정정 |
|---|---|
| 수동 입력 필드 유지? 자동인데 혼란 | 유지(override 용도) + hint "미입력 시 자동" |
| ★ suggest deathDate 없음 → cutoff 불일치 | step4-5에 deathDate prop 전달 |
| 결과 카드 자동/수동 구분 | DeductionLimitDetailCard에 "자동" 안내(priorGiftDeductionTotal>0 && 수동미입력) |

### [12] 통합비교 → [13] 정정

| 통합검토 (계획↔엔진↔UI↔anchor) | 정정 |
|---|---|
| numeric 영향: C1 세액 0(Min 4,600m), C6·영향케이스 실재 | anchor에 세액 무변(C1) + 영향(C6) 양쪽 |
| 회귀: 기존 priorGiftDeductionTotal 명시 케이스 → override 유지 | A-9/A-10 통과 유지 확인 |
| ★ fixture priorGiftDeductionTotal=650m 제거 시 자동 650m 나와야 dual-truth 차단 | fixture override 제거 anchor + giftTaxBase/doneeRelation 자동 anchor 양립 |

**정정 누계: 12건.** Do 진입 가능 (케이스 인벤토리 행 6 ≥ 1 충족).
