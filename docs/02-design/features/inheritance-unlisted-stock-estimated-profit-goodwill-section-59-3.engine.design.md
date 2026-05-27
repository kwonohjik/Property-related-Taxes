# 비상장주식 영업권 §59③ 추정이익 준용 — 엔진 설계 (PR-G2)

> **Plan**: `docs/00-pm/inheritance-unlisted-stock-estimated-profit-goodwill-section-59-3.plan.md`
> **UI**: `inheritance-unlisted-stock-estimated-profit-goodwill-section-59-3.ui.design.md`
> **선행**: PR-G(§56② 추정이익 갈음, `0aa702b`). 본 PR은 추정이익을 영업권 가중평균까지 전파.
> **법령 검증**: KoreanLaw MCP 2026-05-27 (상증령 mst=283637) — §59②③·§56②·§55③·§17의3④ 전수 직접대조, 인용 오류 0

## Context

PR-G에서 §56② 추정이익은 **순손익가치(⑤)만** 갈음하고, 영업권 §59②의 가중평균(가.)은 실제 순손익 유지(scoped, "미반영" warning). 그러나 §59③은 영업권 가중평균을 **§56①·② 준용**으로 평가하고 "§56② '1주당 추정이익'은 '순손익액'으로 본다"고 의제하므로, **추정이익 적용 시 영업권 가중평균도 추정이익 기준**이어야 충실. 본 PR이 그 갭을 채우고 PR-G의 미반영 warning을 §59③ 준용으로 전환한다.

**★ 차원 필요성**: §59② `초과이익 = (가.순손익액×50%) − (다.자기자본×10%)`. 다.자기자본은 **회사 전체**(§55①, 수십억대)이므로 가.도 회사 전체여야 함. ∴ §59③ "1주당 추정이익→순손익액" 의제는 `평균가액 × 발행주식총수` 환산을 **산식 구조상 필연**으로 요구(per-share 직접 사용 시 스케일 불일치로 영업권 0 왜곡).

---

## ★ 케이스 인벤토리 (필수)

| # | 시나리오 | 법령 근거 | anchor 출처 | 테스트 파일 | 상태 |
|---|---------|----------|-------------|-----------|------|
| 1 | 추정이익 applied + 영업권>0 → companyWeighted3y = 평균가액 × 발행주식총수 | 영 §59③ 준용 §56② | 손계산(평균가액×주식수) | EP9-1 | ☐ TODO |
| 2 | 추정이익 ON vs OFF → goodwillFinal 상이 (comparative) | 영 §59②③ | ON≠OFF 비교 | EP9-2 | ☐ TODO |
| 3 | 추정이익 applied + §55③ 배제(3년결손/청산) → goodwillFinal=0 유지 | 영 §55③ | excludedByLaw 유지 | EP9-3 | ☐ TODO |
| 4 | EP-5 교체 — "미반영" warning 부재 + appliedRules §59③ 준용(goodwill>0 시) | 영 §59③ | warning 부재·rule 존재 | EP-5(교체) | ☐ TODO |
| 5 | 회귀 — 추정이익 미적용 시 영업권 불변 | — | finalNetIncomes 기반 유지 | 전체 회귀 | ☐ TODO |
| 6 | overflow — 고추정이익 × 대량주식수 → safeMultiply 정상 | (정수연산 정책) | safeMultiply 동작 | EP9-1 변형(선택) | ☐ TODO |

**규칙**: 행≥1 충족. EP9-1 RED 선확인([[feedback_pre_anchor_verification]]).

---

## 법령 근거

```
영 §59②: 영업권 = 초과이익금액을 지속연수(5년) 환산. 가.3년 순손익액 가중평균 / 나.가×50% /
         다.자기자본(§55① 회사 전체) / 마.다×10% / 초과이익=max(나−마,0) / 자.=Σ초과이익/(1.1)^n
영 §59③: 가중평균액은 §56①·② 준용. §56① '1주당 순손익액'·§56② '1주당 추정이익'은 '순손익액'으로 본다.
영 §56②: (PR-G) 둘 이상 평가기관 1주당 추정이익 평균가액으로 가중평균액 갈음.
영 §55③: 영업권 가산 배제 (1호 청산·부동산80% / 2호 3년미만 / 3호 3년 계속결손) — 무간섭.
규 §17의3④: 추정이익 평균가액 = 수익가치 × 환원율.
```

**의제 적용**: §56① "1주당 순손익액"→"순손익액"(회사 전체) = 현행 `companyWeighted3y`(finalNetIncomes 가중). §56② "1주당 추정이익"→"순손익액"(회사 전체) = `estimatedProfitAverage × totalShares`.

---

## 엔진 input 타입

**변경 없음** — `UnlistedStockValuationInput.estimatedProfit`(PR-G)·`totalShares` 재사용.

## 엔진 result 타입

**신규 필드 없음** — 기존 `goodwillCalculation.weightedAvg3y`(회사 전체 가중평균)가 추정이익 적용 시 환산값 자동 노출. 근거는 `appliedRules` 문자열(§59③ 준용, goodwill>0 시).

---

## 계산 알고리즘 (단계별)

`evaluateUnlistedStockV2` STEP 6 (영업권) 진입 직전:
```ts
let companyWeighted3y = Math.max(0, Math.floor(companyWeightedRaw));   // 현행 (회사 전체 가중평균)
if (estimatedProfitResult?.applied) {
  // §59③: 1주당 추정이익 → 순손익액(회사 전체) = 평균가액 × 발행주식총수
  companyWeighted3y = Math.max(0, safeMultiply(estimatedProfitResult.estimatedProfitAverage, input.totalShares));
}
const goodwill = calcGoodwill({ weightedAvg3y: companyWeighted3y, selfCapital, rate, ... });  // 시그니처 무변경

// EP-5 교체: 기존 "§59③ 미반영" warning 제거
if (estimatedProfitResult?.applied && goodwill.goodwillFinal > 0) {
  appliedRules.push("상증령 §59③ — 영업권 가중평균 순손익액도 추정이익 기준 적용");
}
```

**하류 무변경**: `calcGoodwill`의 나·마·초과이익(max 0)·Σ(5년 연금현가)·§55③ 배제 모두 그대로. 환산은 입력값(가.)만 바꿈.

---

## Silent fallback / 자동 안분 후보 식별

- **환산은 estimated applied 시에만** — 미적용 시 현행 finalNetIncomes 경로 유지(자동 0채움·자동 환산 없음).
- **음수 가드**: `Math.max(0, ...)` — §59② 초과이익이 이미 0 하한이라 음수 추정이익은 goodwill 0(법령 산식 자체 하한, 임의 보정 아님).
- **§55③ 배제 무간섭**: 환산은 `calcGoodwill` 진입 전 입력값만 변경. 배제 판정(netAssetOnlyReason·continuousLoss)은 무수정.
- **safeMultiply**: overflow 방어([[bigint-round-half-up]] 인접 정책), 일반 케이스 Number 그대로.

---

## 테스트 약속

- 케이스 인벤토리 6행 → EP9-1~3 + EP-5 교체 + 회귀 + (선택)overflow.
- EP9-1 손계산 원단위 `toBe()`: weightedAvg3y === estimatedProfitAverage × totalShares.
- EP9-2 comparative(ON≠OFF) — exact goodwill annuity 값은 Do에서 1건 고정.
- ★ PR-G EP-5(미반영 warning 단언)는 §59③ 준용으로 **교체**([[feedback_anchor_correction_legal_priority]]).
- 추정이익 미적용 시 전체 회귀 0 변동.

---

## UI 통합 위임

- UI 명세는 `inheritance-unlisted-stock-estimated-profit-goodwill-section-59-3.ui.design.md`.
- **8 동기화 지점 영향: ⑦ 결과 카드만**(신규 input 0). 대상 2곳(화면·PDF 병렬, PR-G S-8 패턴):
  - `PerShareValuationResultCard.tsx` — ③ 순자산가액 hint 영업권 옆 §59③ 한 줄(추정이익 applied + goodwill>0 시)
  - `lib/pdf/UnlistedStockBesshiPdfDocument.tsx` 5쪽 영업권 가. — weightedAvg3y 자동 환산 반영 + 추정이익 시 note(화면과 동일 문구)
  - besshi 화면 5쪽 `Page5GoodwillTable.tsx`(가. weightedAvg3y)도 자동 반영 + 추정이익 시 note
- ①~⑥·⑧ 무영향(estimatedProfit는 PR-G에서 이미 결선). 증여세 공용(`GiftTaxForm`) 자동 적용.
