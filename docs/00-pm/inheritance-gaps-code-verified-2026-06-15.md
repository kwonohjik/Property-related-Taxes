# 상속세 잔여 갭 — 실제 코드 기준 검증 (2026-06-15)

> ⚠️ 이 문서는 `docs/00-pm/*.plan.md` 계획 문서가 아니라 **실제 코드·테스트(`lib/`·`components/`·`__tests__/`)** 를 grep/Read로 실측해 작성했다.
> 계획 문서는 작업 *전* 작성된 것이라 이미 구현 완료된 항목도 "미구현"으로 적혀 있어 갭 판정 근거로 부적합하다.

## 결론

상속세 엔진은 **거의 완전 구현 상태**. 4개 영역 병렬 검증 결과, 1차에 "미구현"으로 의심됐던 항목 대부분이 구현 확인됐고 실제 남은 갭은 5건(+stale 주석 1건)뿐이다.

## 구현 확인 완료 (갭 아님)

| 항목 | 근거 file:line |
|---|---|
| §58 부담부증여 사전증여세액 안분 한도식 | `types/transfer-burdened-gift.types.ts:90~105`, `burdened-gift-apportionment.ts:341~376`, `inheritance-gift-tax-credit.ts:429~451` |
| 상속세 세액공제 echo (§28·§29·§30·§69) | `inheritance-gift-tax-credit.ts:343~360`, `components/calc/TaxCreditBreakdownCard.tsx:1~11` |
| §30 단기재상속공제 | `inheritance-tax.ts:281~322`, `credits/short-term-reinheritance.ts:28~39` |
| §24 종합한도 분자 보정 | `inheritance-tax.ts:442~451`, `deductions/inheritance-deduction-limit.ts:57~70,124~165` |
| 복수가업 순차공제 (상증령 §15④) | `deductions/family-business.ts:111~145`, `types/...:128~135`, `__tests__/.../family-business-multiple.test.ts` |
| 개정연혁 시기별 임계 (한도·매출·지분) | `family-business.ts:70~95,154~162`, `family-business-autoderive.ts:120~124` |
| 중견 200% 가드 + taxIfNoFBD 2-pass | `deductions/family-business-200pct-guard.ts`, `inheritance-tax.ts:454~496` |
| 사업무관자산 5종 차감 (상증령 §15⑤2호) | `family-business.ts:248~258`, `property-valuation-corporate.ts:100~130` |
| 양도세 이월과세 공제 (§18의2⑩) | `credits/family-business-cgt-credit.ts:44~65`, `transfer-tax-family-business.ts` |
| 영농상속공제 입력·자격평가·거주지검증 | `deductions/inheritance-farming-deduction.ts`, `Step4Deductions.tsx:313~327`(UI 항상 노출) |
| 물납 §73 / 연부연납 §71·§72 | `credits/payment-in-kind.ts`, `credits/installment-payment.ts`, Step4 UI + 결과 카드 |
| 비과세 §11~§12·§16~§17, 평가 §60~§66 | `exemption-rules.ts`, `property-valuation.ts`, `inheritance-cultural-heritage-deferral.ts` |
| §30의5 창업·§30의6 가업승계 특례 + §13 연계 | `credits/special-tax-treatment.ts`, `inheritance-gift-tax-credit.ts:208~256` |
| §21① 단서 무신고 일괄공제 5억 | `deductions/inheritance-deductions.ts:465~489` (커밋 2a564308) |

## 실제 남은 갭

### 🔴 신규 구현 필요

1. **가업 거주자 요건 §18의2① ("거주자의 사망")**
   - `family-business.ts`·`types/inheritance-family-business.types.ts`에 `decedentType` 필드 **0건**
   - `evaluateFamilyBusinessEligibility`(family-business.ts:174~226)에 비거주자 검증 코드 없음
   - → 비거주자 피상속인도 가업상속공제 부적격 처리 안 됨 (요건 위배). 가장 명확한 법령 갭.

2. **국기법 §26의2④⑤ 부과제척기간 만료 배제**
   - TODO: `legal-codes/inheritance-gift.ts:291`, `inheritance-gift-tax-credit.ts:53`
   - 제척기간 만료된 사전증여의 §28 증여세액공제 배제 미적용. 극히 드문 edge case.

### 🟡 부분구현 / 설계상 분리

3. **영농 사후관리(추징)** — 엔진 `calcFarmingPostMgmt`(`deductions/farming-post-mgmt.ts:112`)·테스트·전용 시뮬레이터 페이지 `/calc/inheritance-postmgmt` 완성. 단 메인 마법사 미통합·`inheritance-tax.ts` orchestrator 미호출. 사후관리는 상속 수년 뒤 위반 시 별도 계산이라 설계상 분리이나, 마법사에 페이지 안내가 없으면 UX 갭.

4. **물납 자산 자동분류** — `credits/payment-in-kind.ts:205~209`에서 거주주택·국채·처분제한증권을 estate flag 부재로 0 hardcode → 사용자 수동 보정 필요. EstateItem 타입에 flag 추가 시 자동화 가능.

5. **공익법인 사후관리** — §48 3년 추징 로직 미구현(안내 warning만, `exemption-evaluator.ts`), §16② 동족주식 한도(5/10/20%)는 타입만 정의(`exemption-rules.ts:162~176`) 엔진 차감 미구현.

### ⚪ stale 주석 (코드 무영향, 1줄 정리만 권장)

- `types/inheritance-gift.types.ts:1292` result echo 필드 `lumpSumForcedByUnfiled` 주석 "★ Pre-Do stub 2026-06-07, 엔진 미구현" → 실제로는 `deductions/inheritance-deductions.ts:476,489`에서 계산·반환됨.
