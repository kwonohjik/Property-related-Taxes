# 비상장주식 PR-G2 — 영업권 §59③ 추정이익 준용 구현계획

> **Source**: PR-G(`docs/00-pm/inheritance-unlisted-stock-estimated-profit-section-56-2.plan.md`) §9 후속 PR-G2 + D-4 scoped 분리
> **Date**: 2026-05-27
> **선행**: PR-G(§56② 추정이익 갈음) 완료(`0aa702b`). 본 PR은 그 직접 후속 — 추정이익을 **영업권 가중평균(§59③)**까지 전파.
> **정책**: [[feedback_korean_law_82_vs_81_2_drift]] · [[feedback_pre_anchor_verification]] · [[feedback_anchor_correction_legal_priority]] · [[single-source-engine-helper]] · [[feedback_numeric_impact_verify_before_bug_claim]]

---

## 1. 법령 근거 (KoreanLaw MCP 검증 2026-05-27, 상증령 mst=283637)

### §59③ (원문, PR-G에서 직접 검증)

> ③ 제2항을 적용함에 있어서 최근 3년간의 순손익액의 가중평균액은 **제56조제1항 및 제2항을 준용**하여 평가한다. 이 경우 같은 조 제1항 중 **'1주당 순손익액'과 같은 조 제2항 중 '1주당 추정이익'은 '순손익액'으로 본다**.

### §59② (영업권 산식 — 별지 부표3 5쪽)

> ② 영업권의 평가는 초과이익금액을 영업권지속연수(5년)를 고려하여 환산한 가액에 의한다.
> 가. 최근 3년 순손익액 가중평균(§56①·② 준용) / 나. 가 × 50% / 다. 자기자본 / 마. 다 × 10% / 초과이익 = max(나−마, 0) / 자. = Σ 초과이익/(1.1)^n (n=1..5)

### ★ 해석 — 추정이익의 회사 전체 환산 (D-1 근거)

§56①의 "1주당 순손익액" → §59③ 의제 "순손익액"(회사 전체). 현행 `companyWeighted3y`가 이미 `finalNetIncomes`(회사 전체 각 사업연도 순손익액)를 가중평균하여 충족.

§56②의 "1주당 추정이익" → §59③ 의제 "순손익액"(회사 전체). 사용자 입력은 **1주당** 추정이익이므로, 회사 전체 = **1주당 추정이익 평균가액 × 발행주식총수**로 환산(per-share→company, §56① 경로의 ×주식수 대칭).

> ∴ `companyWeighted3y(추정) = estimatedProfitAverage × totalShares`. §56① 경로(1주당 가중평균 × 주식수 ≈ 회사 전체 가중평균)와 차원 일치.

### ★ 차원 필요성 검증 (KoreanLaw MCP 재확인 2026-05-27 — 환산이 필수임을 입증)

§59② 산식: `초과이익 = (가.순손익액 × 50%) − (다.자기자본 × 10%)`. **다.자기자본은 회사 전체(§55① 순자산가액, 수십억대 원)**이므로 가.순손익액도 **반드시 회사 전체**여야 뺄셈이 성립한다(goodwill.ts 주석도 "가. 회사 전체 3년 가중평균" 명시). 1주당 추정이익(천원대)을 그대로 쓰면 자기자본(수십억)과 스케일 불일치 → `나−마` 항상 음수 → 영업권 0으로 왜곡. 따라서 §59③ "1주당 추정이익→순손익액" 의제는 **×발행주식총수 환산을 법령 구조상 필연**으로 요구. `estimatedProfitAverage × totalShares`가 유일 정합 해석(단순 per-share 사용은 산식 파괴).

**전수 검증 (인용 오류 0)**: §59②③(영업권·준용)·§56②(추정이익)·§55③(배제 1·2·3호 무간섭)·§17의3④(수익가치×환원율) 모두 MCP 원문 대조. [[feedback_korean_law_82_vs_81_2_drift]].

---

## 2. 현행 영업권 경로 + 갈음 지점

`unlisted-orchestrator.ts` (STEP 5.5 추정이익 갈음 → STEP 6 영업권):

```ts
// STEP 5.5 (PR-G): estimatedProfitResult 산출 + netIncomePerShare 갈음 (이미 구현)
// STEP 6: 영업권 산식용 — 회사 전체 가중평균 순손익액
const companyWeightedRaw = (finalNetIncomes[0]*3 + finalNetIncomes[1]*2 + finalNetIncomes[2]*1)/6;
const companyWeighted3y = Math.max(0, Math.floor(companyWeightedRaw));   // ← 갈음 지점
const goodwill = calcGoodwill({ weightedAvg3y: companyWeighted3y, selfCapital, rate, ... });
```

`estimatedProfitResult`(STEP 5.5)가 STEP 6보다 먼저 산출되므로 **companyWeighted3y 1곳만** 조건부 교체하면 됨. `calcGoodwill` 시그니처·하류(나·마·초과이익·Σ·§55③ 배제) **무변경 자동 전파**.

---

## 3. 설계 결정

### D-1. 추정이익 적용 시 companyWeighted3y 회사 전체 환산

```ts
let companyWeighted3y = Math.max(0, Math.floor(companyWeightedRaw));
if (estimatedProfitResult?.applied) {
  // §59③: 1주당 추정이익을 순손익액으로 본다 → 회사 전체 = 평균가액 × 발행주식총수
  companyWeighted3y = Math.max(0, safeMultiply(estimatedProfitResult.estimatedProfitAverage, input.totalShares));
}
```

- **safeMultiply 사용**([[single-source-engine-helper]] `tax-utils`): 평균가액 × 주식수 overflow 방어(대형 법인 고추정이익 × 수백만주). 일반 케이스는 Number 그대로.
- **음수 가드**: `Math.max(0, ...)` 유지 — §59②의 초과이익(`max(나−마,0)`)이 어차피 0 하한이라 음수 추정이익은 goodwill 0. (PR-G D-3 음수 displace는 순손익가치 전용, 영업권은 산식 자체 0 하한.)

### D-2. §55③ 영업권 배제 무간섭

`calcGoodwill`의 §55③ 배제(청산·부동산80%·3년결손)는 `companyWeighted3y` 값과 무관하게 동작(`netAssetOnlyReason`·`isContinuousLossLastThreeYears` 기반). 추정이익 환산은 **배제 안 되는 경우의 가중평균 입력값만** 바꿈. 배제 시 `goodwillFinal=0` 그대로. → **§55³ 로직 변경 0**.

### D-3. EP-5 warning → §59③ 준용 반영 안내로 전환

PR-G에서 추가한 "§59③ 미반영" warning(orchestrator:261~265) **제거**. 대신:
- **companyWeighted3y 환산(override)은 estimated applied 시 항상 적용**(§59③ 준용은 강제).
- **`appliedRules` 안내는 `goodwill.goodwillFinal > 0` 시에만** push("상증령 §59③ — 영업권 가중평균 순손익액도 추정이익 기준 적용"). 영업권 0/§55③ 배제 시 문구 생략(노이즈 회피, F-5).
- ★ PR-G의 anchor **EP-5(미반영 warning 검증)는 본 PR에서 §59③ 준용 검증으로 교체**([[feedback_anchor_correction_legal_priority]] — 동작 변경에 맞춰 anchor 정정).

### D-4. 결과 echo (선택, 최소)

`UnlistedStockValuationResult.goodwillCalculation.weightedAvg3y`가 이미 회사 전체 가중평균을 노출 → 추정이익 적용 시 자동으로 환산값 표시. 별도 신규 필드 불요. appliedRules 문자열로 근거 노출.

---

## 4. 변경 지점

| # | 파일 | 변경 |
|---|---|---|
| C-1 | `unlisted-orchestrator.ts` | companyWeighted3y `const`→`let` + applied 시 `safeMultiply(estimatedProfitAverage, totalShares)` 환산. **`safeMultiply` 신규 import from `@/lib/tax-engine/tax-utils`** (orchestrator 현재 미import — line 73 export 확인) |
| C-2 | `unlisted-orchestrator.ts` | EP-5 "§59③ 미반영" warning 제거 + appliedRules에 §59③ 준용 push |
| C-3 | `estimated-profit-section-56-2.test.ts` | PR-G EP-5 교체: 미반영 warning → §59③ 준용 appliedRules + 영업권 가중평균=추정이익×주식수 검증. 신규 EP9-1~3 |
| C-4 (UI, 최소) | `PerShareValuationResultCard.tsx` | ③ 순자산가액 hint의 영업권 표시 옆 — 추정이익 적용 시 "영업권 가중평균 추정이익 기준(§59③)" 한 줄. besshi 5쪽 가. 라벨 자동 반영(weightedAvg3y) + 추정이익 시 note |

> **신규 input 필드·Zod·폼 위젯 없음**(추정이익 입력은 PR-G 완료분 재사용). 본 PR은 엔진 내부 갈음 + 표시·anchor.
> **8 동기화 지점 영향 범위(F-4)**: ①~⑥·⑧ 무영향(신규 입력 0). **⑦ 결과 카드(C-4)만** 해당 — goodwill `weightedAvg3y` echo 자동 반영 + 산출근거 한 줄. ④ API·⑧ validation 무변경(estimatedProfit는 PR-G에서 이미 결선).

---

## 5. Pre-Do anchor (RED 우선)

`estimated-profit-section-56-2.test.ts` 확장:

- **EP9-1 (RED→GREEN)**: 추정이익 applied + 영업권>0 케이스. `result.goodwillCalculation.weightedAvg3y === estimatedProfitAverage × totalShares` 확인. 현행(PR-G)은 finalNetIncomes 기반 → RED. 환산 후 GREEN.
- **EP9-2 (영업권 값 변동, comparative)**: 동일 입력 추정이익 ON vs OFF → `goodwillCalculation.goodwillFinal` **상이**(추정이익×주식수 ≠ 과거 순손익 가중평균일 때). 영업권은 5년 연금현가(×3.7908) annuity라 exact 손계산 번호 대신 **ON≠OFF 비교 단언**(weightedAvg3y 변동 → goodwillFinal 변동 방향 일관). exact 값은 Do에서 1건 고정.
- **EP9-3 (§55③ 배제 무간섭)**: 추정이익 applied + `isContinuousLossLastThreeYears=true`(또는 netAssetOnlyReason 청산) → `goodwillFinal===0`·`excludedByLaw` 유지(환산이 배제를 깨지 않음).
- **EP-5 교체**: 기존 "§59③ 미반영" warning 부재 + `appliedRules`에 "§59③" 준용 문자열 존재.

---

## 6. Definition of Done

- [ ] EP9-1~3 + EP-5 교체 통과 (RED 선확인)
- [ ] PR-G 기존 anchor 회귀 — 추정이익 **미적용** 시 영업권 불변(EP-5 외 전부), 추정이익 OFF 전체 케이스 numeric 0 변동
- [ ] `npx tsc --noEmit` 0 + `npm test` 전수
- [ ] safeMultiply overflow 방어 확인(대형 케이스 anchor 선택)
- [ ] §59②③ + §56②(준용) + §55③(무간섭) 인용 주석 명시
- [ ] e2e: PR-G 기존 spec 회귀(영업권 표시 깨짐 0). 신규 e2e 불요(엔진 내부 변경)
- [ ] 한국어 커밋 + push

---

## 7. 실행 순서 (Do)

1. EP9-1 RED 작성·확인(현행 finalNetIncomes 기반 != 추정이익×주식수).
2. C-1 orchestrator 환산 분기 + safeMultiply import.
3. C-2 warning 제거 + appliedRules.
4. C-3 EP-5 교체 + EP9-1~3 GREEN.
5. C-4 결과카드·besshi note(최소).
6. `npm test` 전수 + tsc 0.

---

## 8. 리스크

- **R-1 EP-5 회귀 anchor 충돌**: PR-G EP-5가 "미반영 warning"을 단언 → 본 PR이 동작 변경하므로 **반드시 EP-5를 교체**(미수정 시 RED 잔존). [[feedback_anchor_correction_legal_priority]].
- **R-2 차원 환산 오류**: per-share(평균가액) × 주식수 = 회사 전체. 주식수 누락 시 영업권 과소(1주당 그대로 사용). EP9-1 손계산으로 고정.
- **R-3 overflow**: 고추정이익 × 수백만주 → Number 한계 근접. safeMultiply([[bigint-round-half-up]] 인접 정책) 사용.
- **R-4 §55③ 깨짐**: 환산을 calcGoodwill 진입 전에만 하고 배제 로직은 무수정 → EP9-3로 배제 유지 검증.

---

## 9. 후속 / 한계

- §59③은 §56①②만 준용 — §17의3⑤ 환산주식수·§17의3② 연환산이 영업권 가중평균에도 적용되는지는 별도 트랙(현행 companyWeighted3y는 finalNetIncomes 기반이라 §56⑤ 유상증자 조정은 반영, 연환산은 회사 전체라 무관).
- **★ 추정이익 적용 시 bypass(F-3)**: estimated applied이면 companyWeighted3y가 `평균가액 × 주식수`로 **전체 대체**되므로 finalNetIncomes 기반 §56⑤ 조정·§17의3② 연환산은 goodwill에서 **자연 bypass**(§56②이 가중평균액 전체를 갈음하는 법령 구조와 일치 — 별도 처리 불요).
- 추정이익 평균가액은 §17의3④ 수익가치 기반(외부 평가기관) — 영업권 환산도 동일 신뢰. 정합성은 사용자 책임.
