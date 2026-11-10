# 다건 건별 «결정세액(참고)»·감면 표시값이 단건·합산 결과와 어긋난다 — 상세명세서 산식이 등식으로 성립하지 않는다

- 상태: **구현 완료**(Q-1 a · Q-2 a · Q-3 a 적용, §7) — 기준 master `cb9c88a37`(구현 중 `bbc75ff97`까지 병합).
- 출처: #3146(V-3 다건 도달 고정) 조사 중 발견한 별건 — 다건 건별 `reductionAmount` 표시값이 단건과 다르다(§97 본문 단독 85,030,000 vs 84,530,000, 총세액은 같음).
- 영향 범위: **표시만**이다. 합산 `totalTax`·`determinedTax`·`reductionAmount`는 단건과 같다(§3). 세액 계산에 쓰이는 경로는 못 찾았다(§2.3).

## 0. 결론

| 항목 | 내용 |
|---|---|
| 원인 | 다건 집계가 건별 `reductionAmount`(`standalone`)를 **기본공제를 뺀 소득 기준의 단독 감면액**으로 싣는다(`transfer-tax-aggregate-once.ts:515`, 단건 엔진을 `skipBasicDeduction=true`로 호출 — 같은 파일 :537-538 주석). 그런데 `refCalculatedTax`는 **기본공제를 배분한 뒤** 과세표준(`taxBaseShare`) 기준이다. 둘을 `refDeterminedTax = max(0, refCalculatedTax − standalone)`(:557)로 빼서 **기준이 다른 두 값을 섞는다** [직접, 코드 읽기] |
| 실측 (주택 1장 · 다건 route 건 1개) | 단건·합산은 §97 본문 감면 84,530,000 · 결정 84,530,000 · 지방소득세 8,453,000인데, 건별은 단독 감면 85,030,000(+500,000) · `refDeterminedTax` 84,030,000(−500,000). §77은 +150,000 / −150,000. 감면 없음에서도 건별 `determinedTax`가 +1,000,000(170,060,000 vs 169,060,000) [직접, §3.2] |
| 화면에 나오는 모양 | ① 상세명세서 결정세액 산식이 «169,060,000 − 84,530,000 = 84,030,000» — **등식이 성립하지 않는다**(`buildDeterminedTaxFormula`) ② 신고서 건별 열의 감면세액 85,030,000·결정세액 84,030,000 — 합계 열(84,530,000)과 다름 ③ 건별 신고서 어댑터의 지방소득세 8,403,000(단건 8,453,000) ④ 아코디언 «감면세액 −85,030,000» vs 합산 카드 «84,530,000» [직접, §3.3] |
| 건수가 늘면 | 2건 시료(§97 본문 + 감면 없음)에서 건별 산식이 «170,060,000 − 93,892,020 = 85,030,000»(실제 76,167,980)로 **8,862,020** 어긋난다. 건별 산출세액이 «자산 단독 세액»인데 배분 감면은 «합산 누진 구간 몫»이라 갈린다 [직접, §3.4] |
| 세액 영향 | 없음 — 1건 시료에서 합산 총세액·결정세액·감면이 단건과 같다. 표시 전용 echo(`PerPropertyBreakdown`)다 [직접] |
| 권장 | **Q-1 a**(`refDeterminedTax`를 배분 감면 기준으로 통일) · **Q-2 a**(아코디언 감면 행·산식도 배분 감면) · **Q-3 보류**(`determinedTax(p)`·PDF는 측정 뒤) |

## 1. 범위

- 대상: 다건(`/api/calc/transfer/multi`) 결과의 건별 `PerPropertyBreakdown`에서 `reductionAmount`·`reductionAggregated`·`refDeterminedTax`·`determinedTax`의 정의와 이를 읽는 화면(`MultiTransferPropertyBreakdown`·`FilingFormTableAggregateHelpers`·`DetailedStatementFormulaBuilders`).
- 제외: 합산 계산 자체(`aggregateReductions`) · 건별 «산출세액(참고)» `refCalculatedTax`의 산식 · PDF 건별 섹션(§5 V-3).

## 2. 코드 실독 [직접]

### 2.1 값의 정의 (`lib/tax-engine/types/transfer-aggregate.types.ts`)

| 필드 | 타입 주석 | 값 (§97 본문 1건) |
|---|---|---|
| `reductionAmount` | «건별 단독 감면액 … 합산 재계산 전의 값으로 비교·디버깅용» | 85,030,000 |
| `reductionAggregated` | «합산 재계산 후 이 건에 배분된 감면세액» | 84,530,000 |
| `refDeterminedTax` | «= max(0, refCalculatedTax − reductionAmount)» | 84,030,000 |
| `refCalculatedTax` | 자산별 산출세액(참고) — `taxBaseShare` 기준 | 169,060,000 |

즉 `reductionAmount`가 «비교·디버깅용 단독값»이라는 것은 **의도된 설계**다. 문제는 그 단독값을 화면용 `refDeterminedTax`에 그대로 쓴 데 있다.

### 2.2 산정 (`lib/tax-engine/transfer-tax-aggregate-once.ts`)

- :515 `standalone = r.result.reductionAmount` — 건별 단건 엔진 결과(`skipBasicDeduction=true`).
- :537-538 주석: «단건 엔진은 skipBasicDeduction=true로 호출되어 r.result.determinedTax는 양도소득금액 기준 부정확. taxBaseShare … 기준으로 다건 컨텍스트에서 재계산해 노출한다» — **산출세액은 이 방침대로 고쳤는데 감면은 고치지 않았다.**
- :557 `refDeterminedTax = max(0, refCalculatedTax − standalone)` · :615-616 `refDeterminedTax`, `reductionAmount: standalone`.
- :573 `determinedTax: r.result.determinedTax` — 위 주석이 «부정확»이라 한 그 값을 그대로 싣는다.

### 2.3 읽는 곳

| 위치 | 읽는 값 | 쓰임 |
|---|---|---|
| `FilingFormTableAggregateHelpers.ts:363-366` | `refCalculatedTax − refDeterminedTax`(감면세액 열) · `refDeterminedTax`(결정세액·총결정세액 열) | 신고서 건별 열 |
| `DetailedStatementFormulaBuilders.ts:190` | `refCalculatedTax − reductionAggregated = refDeterminedTax` | 상세명세서 결정세액 산식 문자열 |
| `MultiTransferPropertyBreakdown.tsx:57,108` | `getRefDeterminedTax(b)`(결정세액·지방소득세) · `reductionAggregated`(감면) | 건별 신고서 어댑터(같은 표에 두 기준이 섞인다) |
| 같은 파일 :409-428 | `breakdown.reductionAmount`(감면 행) · `refDeterminedTax` | 아코디언 «감면세액»·«결정세액(참고)» |
| `MultiTransferTaxResultView.tsx:285,302` | `reductionAmount`(«건별 단독감면» 열) · `reductionAggregated`(«배분 감면» 열) | 표 — **두 열이 의도적으로 따로 있다** |
| `ResultPdfTransferSections.tsx:564` | `determinedTax` | PDF «결정세액 기여분 (참고)» (§5 V-3) |

세액·정산 계산(`totalTax` 등)에 쓰이는 경로는 grep으로 찾지 못했다 — `refDeterminedTax`의 비테스트 소비처는 위 표뿐이다(`types` 주석의 «기납부세액 자동 계산 등에 사용»은 현재 코드에 대응 호출이 없다).

## 3. 측정 [직접]

### 3.1 방법

throwaway probe(`__tests__/calc/zz-probe-ra.test.ts`, 커밋하지 않고 삭제). `__tests__/calc/_helpers/single-multi-route-parity.ts`의 `runSingle`·`buildMultiBody`·`postMulti`로 같은 폼을 단건 route와 다건 route(건 1개 / 2개)에 보내고, 건별 값으로 `breakdownToFilingResult`·`buildDeterminedTaxFormula`를 직접 호출했다. 주택 1장, 양도가 900,000,000, 취득가 200,000,000(실지), 양도일 2025-08-01, 취득 2003-03-01(§97 본문은 1995-02-01). 세율표는 route 폴백.

### 3.2 1건 — 단건·합산 vs 건별

| 감면 | 단건 감면 · 결정 · 지방소득세 | 합산(다건 최상위) 감면 · 결정 | 건별 `reductionAmount`(단독) | 건별 `reductionAggregated`(배분) | 건별 `refDeterminedTax` |
|---|---|---|---|---|---|
| 없음 | 0 · 169,060,000 · — | — | 0 | — | (건별 `determinedTax` **170,060,000**) |
| §97 본문 | 84,530,000 · 84,530,000 · 8,453,000 | 84,530,000 · 84,530,000 | **85,030,000** | 84,530,000 | **84,030,000** |
| §77 | 25,359,000 · 143,701,000 · 14,370,100 | 25,359,000 · 143,701,000 | **25,509,000** | 25,359,000 | **143,551,000** |
| §97의5 (100%) | 169,060,000 · 0 · 0 | 169,060,000 · 0 | 170,060,000 | 169,060,000 | 0 (0으로 cap — 어긋남이 가려진다) |
| §99의3 (차감형) | 0 · 136,393,333 · — | — | 0 | — | (건별 `determinedTax` 137,393,333) |

- 차이는 감면율에 비례한다: 본문 50% → +500,000, §77 15% → +150,000, §97의5 100% → +1,000,000. 감면 없음의 `determinedTax` +1,000,000은 **기본공제 2,500,000 × 한계세율 40%**(`appliedRate` 0.4)와 같다 — 건별 값이 기본공제를 흡수하기 전 기준이라는 설명과 일치한다 [직접: 값 일치 · 인과는 :537 주석].
- 합산 총세액은 단건과 같았다(본문 109,889,000 · §77 163,142,900 — #3146 anchor 값).

### 3.3 화면에 나오는 모양 (1건)

| 위치 | §97 본문 | §77 |
|---|---|---|
| 상세명세서 결정세액 산식 | «169,060,000 − 84,530,000 = **84,030,000**» (실제 84,530,000) | «169,060,000 − 25,359,000 = **143,551,000**» (실제 143,701,000) |
| 신고서 건별 열 감면세액 / 결정세액 | 85,030,000 / 84,030,000 (합계 열 84,530,000 / 84,530,000) | 25,509,000 / 143,551,000 |
| 건별 신고서 어댑터 `breakdownToFilingResult` 결정 · 지방소득세 | 84,030,000 · **8,403,000** (단건 8,453,000) | 143,551,000 · **14,355,100** (단건 14,370,100) |

### 3.4 2건 (§97 본문 카드 + 감면 없음 카드)

합산: 산출세액 374,610,000 · 감면 93,892,020 · 결정 280,717,980 · 총세액 327,568,182 · 기본공제 2,500,000(2번째 카드에 배분).

| 건 | `refCalculatedTax` | 단독 | 배분 | `refDeterminedTax` | 산식 문자열 |
|---|---|---|---|---|---|
| p1 본문 | 170,060,000 | 85,030,000 | 93,892,020 | 85,030,000 | «170,060,000 − 93,892,020 = 85,030,000» (실제 76,167,980, 차 **8,862,020**) |
| p2 감면 없음 | 169,060,000 | 0 | 0 | 169,060,000 | «169,060,000 (감면 없음)» |

건별 산출세액은 «그 자산만의 세액»(`taxBaseShare × 세율`)이고 배분 감면은 «합산 누진 구간에서 나온 몫»이라 건수가 늘면 어긋남이 커진다. 건별 값은 처음부터 «(참고)»이고 합이 합산과 맞지 않는다고 주석에 적혀 있다(`gb-part-card.ts:9` 외) — 그러나 **한 줄 산식이 등식으로 성립하지 않는 것**은 «참고»로 설명되지 않는다.

## 4. 결정 대기

### Q-1. `refDeterminedTax`의 감면 기준

| 안 | 내용 | 비용·위험 |
|---|---|---|
| **a (권장)** | `refDeterminedTax = max(0, refCalculatedTax − reductionAggregated)`(`transfer-tax-aggregate-once.ts:557`). 타입 주석(`transfer-aggregate.types.ts`)도 맞춘다. 1건이면 단건·합산과 정확히 같아진다(84,530,000 · 143,701,000) | 한 줄 + 주석. 신고서 열(`reductionTax = refCalc − refDet`)은 자연히 배분 감면이 되고, 산식(:190)은 등식이 성립한다. 신고서 열의 cap(감면 ≤ 산출세액)은 `max(0, …)`가 그대로 지킨다(`filing-form-exempt-gain-reduction-cap.test.tsx` 의도 유지). **기존 테스트 11개가 `refDeterminedTax`를 참조** — 값을 고정한 단언은 반전 대상이다(실행해서 전수, §5 V-1). 저장된 옛 이력(IndexedDB)의 `refDeterminedTax`는 바뀌지 않는다(옛 값 그대로 표시) |
| b | 값은 두고 표시만 «단독 기준»이라 밝힌다 | 등식 불성립은 사라지지만(산식을 단독 감면으로 바꿔야 함) 합산 카드의 감면(84,530,000)과 다른 숫자가 나란히 남는다 |
| c | 현행 유지 + 고정 anchor | 표시 불일치가 남는다 |

권장 a의 근거: ① 이 필드의 정의가 «다건 컨텍스트 결정세액(참고)»인데 같은 파일 :537 주석이 이미 «기본공제 반영 기준으로 재계산해 노출한다»는 방침이고, 감면만 그 방침에서 빠져 있다. ② 1건에서 단건과 같아지는 유일한 기준이다. ③ 세액 경로가 아니라 표시 전용이다(§2.3).

### Q-2. 아코디언 «감면세액»·«결정세액(참고)» 산식

`MultiTransferPropertyBreakdown.tsx:409-428`은 `breakdown.reductionAmount`(단독값)로 감면 행과 산식을 그린다. Q-1 a 이후 `refDeterminedTax`와 짝이 맞으려면 **배분 감면(`reductionAggregated`)** 을 써야 한다.

| 안 | 내용 |
|---|---|
| **a (권장)** | 감면 행 값과 산식 문자열을 `reductionAggregated`로 바꾼다. «건별 단독감면» 열(표)은 의도된 설계(두 열이 따로 있음)라 그대로 둔다 |
| b | 하지 않는다 — Q-1 a만 적용하면 아코디언이 «산출세액 − 감면 85,030,000 = 84,530,000»이 되어 그 쪽이 새 불일치가 된다 |

### Q-3. 건별 `determinedTax`(`r.result.determinedTax`) · PDF «결정세액 기여분 (참고)»

:573이 싣는 건별 `determinedTax`는 :537 주석이 «부정확»이라 한 값(감면 없음에서도 +1,000,000)이고 PDF(`ResultPdfTransferSections.tsx:564`)가 읽는다. PDF 건별 섹션이 이 필드를 어떤 입력으로 채우는지 이번에 측정하지 않았다.

| 안 | 내용 |
|---|---|
| **a (권장)** | 이번 PR에서는 건드리지 않고 측정 항목으로 남긴다(§5 V-3). Q-1 a 구현 때 `determinedTax`를 `refDeterminedTax`와 같은 기준으로 바꿀지는 PDF를 본 뒤 정한다 |
| b | `determinedTax: refDeterminedTax`로 같이 바꾼다 — PDF 출력 변경이 따라와 범위가 늘어난다 |

## 5. 미검증 · 확인 필요

- V-1: 기존 테스트 11개(`__tests__/components/` 위주) 중 `refDeterminedTax` **값**을 고정한 단언의 범위 — 구현 단계에서 실행해 전수 확인한다. 이 계획서에서는 파일 목록과 일부 문맥만 읽었다.
- V-2: 건수가 많은 경우(3건 이상)·비교과세·부분 비사업용·분할(GB) 자산에서 `reductionAggregated`와 `refCalculatedTax`가 어떻게 어긋나는지 — 2건 시료 1개만 측정했다. `max(0, …)` cap이 걸리는 경계(`reductionAggregated > refCalculatedTax`)는 측정하지 않았다.
- V-3: PDF 건별 섹션(`ResultPdfTransferSections.tsx:564` 부근)이 읽는 `p`의 실제 필드와 출력 — 코드 한 줄만 읽었다.
- V-4: 옛 저장 이력의 `refDeterminedTax`(혼합 기준)가 새 코드에서 그대로 표시되는지 — **후속 조사에서 표시 경로 없음으로 정리**(`multi-per-asset-display-followup.plan.md` §4). 위 «재계산 없이 저장값을 읽는 구조»는 확인한 적이 없는 서술이었다.
- V-5: 브라우저 수동 확인은 하지 않았다(렌더 컴포넌트 출력이 아니라 어댑터·산식 함수를 직접 호출해 측정했다).
- 합산 `aggregateReductions` 자체의 정확성은 이 조사 범위가 아니다(단건과 같은 값이 나온 것만 확인).

## 6. 구현 계획 (결정 후 — 계획만, Q-1 a · Q-2 a · Q-3 a 가정)

1. **anchor 선행**(구현 전 실패 확인): ① 다건 1건 route — §97 본문·§77 시료에서 `refDeterminedTax`가 단건 결정세액과 같다 · `breakdownToFilingResult`의 지방소득세가 단건과 같다 ② `buildDeterminedTaxFormula(p)`의 «A − B = C»가 산술적으로 성립한다(문자열 파싱) ③ 신고서 건별 열 `reductionTax + determinedTax = calculatedTax`(cap 경계 포함) ④ 2건 시료의 산식 등식. 구현 전에는 ①②가 실패해야 한다.
2. **엔진 한 줄**: `transfer-tax-aggregate-once.ts:557`의 `standalone` → `reductionAggregated`. 타입 주석 정정.
3. **아코디언**(Q-2 a): 감면 행·산식의 `breakdown.reductionAmount` → `reductionAggregated`.
4. **기존 테스트 반전**: `refDeterminedTax` 참조 11개를 실행해 값 고정 단언을 찾고, 같은 단언을 쓰는 형제 테스트를 전수 grep한다(공유 단언 반전 — 옛 값 허용 금지).
5. **뮤테이션**: `reductionAggregated` → `standalone` 되돌림 · cap `max(0,…)` 제거 · 아코디언만 되돌림 · 어댑터가 `refDeterminedTax` 대신 재계산.
6. 회귀 5묶음(`__tests__/api` · `tax-engine` · `calc` · `lib` · `components`) + tsc + eslint. UI 문구·레이아웃 변경은 없다(숫자만 바뀜) — Playwright는 아코디언을 여는 흐름이 기존 spec에 있으면 1건, 없으면 생략하고 사유 기록.

## 7. 구현 결과 (Q-1 a · Q-2 a · Q-3 a — 사용자 「모두 권장안으로」)

### 7.1 변경

| 파일 | 변경 |
|---|---|
| `lib/tax-engine/transfer-tax-aggregate-once.ts` | `refDeterminedTax = max(0, refCalculatedTax − reductionAggregated)` (종전 `standalone`). 유형별 재계산 엔트리가 없으면 `reductionAggregated`가 `standalone` 그대로라 그 경로는 값이 변하지 않는다 |
| `lib/tax-engine/types/transfer-aggregate.types.ts` | `refDeterminedTax` 주석 정정. 종전 주석의 «기납부세액 자동 계산 등에 사용된다»는 현재 코드에 소비처가 없다(`lib`·`app` grep: 선언 외 `aggregate-once.ts` 대입 1곳뿐) — 표시 전용이라고 고쳤다 |
| `components/calc/results/MultiTransferPropertyBreakdown.tsx` | 아코디언 «감면세액» 행 값과 노출 조건, «결정세액 (참고)» 산식 → `reductionAggregated`. 옛 이력 대체 계산도 `reductionAggregated ?? reductionAmount`. **계획서에 없던 추가 1건**: «감면세액» 행 아래 문구는 단건 엔진 단계(`steps`)의 문구라 단독값(100,000,000)을 담는다 → 값(배분)과 다르면 « → 합산 재계산 후 배분 N»을 덧붙인다 (§7.4) |
| `components/calc/results/MultiTransferTaxSummaryCard.tsx` | `getRefDeterminedTax` 옛 이력 대체 계산을 같은 규칙으로 (기존 anchor `multi-breakdown-adapter-contract`가 «대체 값이 정상 경로와 같다»를 지켜 주고 있어 이 변경 없이는 실패했다) |

건별 `determinedTax`(`:573`)·PDF «결정세액 기여분 (참고)»·«건별 단독감면» 열(표)은 손대지 않았다(Q-3 a · 의도된 설계).

### 7.2 anchor (구현 전 실패 확인 → 구현 후 통과)

- `__tests__/api/transfer.multi-route.per-asset-ref-determined-tax.anchor.test.ts` 11건. 구현 전 **7건 실패 · 4건 통과**(통과 4건은 §97의5 시료 3건과 cap 경계로, 종전에도 결정세액이 0이라 값을 고정하는 용도). 실패 값이 §3 측정과 정확히 일치: 84,030,000 vs 84,530,000 · 143,551,000 vs 143,701,000 · 2건 산식 76,167,980 vs 85,030,000.
  - 1건 §97 본문·§77·§97의5: 건별 `refDeterminedTax`·어댑터 `determinedTax`·`localIncomeTax`가 단건 route와 같다.
  - `buildDeterminedTaxFormula`의 «A − B = C» 문자열을 파싱해 산술 등식을 확인 (1건 2종 + 2건).
  - `산출세액 − 결정세액 = 배분 감면` (신고서 건별 열 `reductionTax + determinedTax = calculatedTax`의 전제).
  - **cap 경계**: §97의5 카드 + 감면 없는 카드 2건 — 배분 감면 210,863,773 > 건별 산출세액 193,380,000인 실제 시료를 찾아 `refDeterminedTax = 0`을 고정 (V-2 일부 해소).
- `__tests__/components/multi-breakdown-accordion-ref-determined-q2.anchor.test.tsx` 4건 (자경농지 §69 2건 — 산출 148,340,000 · 단독 100,000,000 · 배분 61,013,645 · 결정 87,326,355; 종전 48,340,000): 엔진 관측값 · 산식 등식 «148,340,000 - 61,013,645 = 87,326,355» · 아코디언 감면 행/산식 · 옛 이력 대체 계산.

### 7.3 뮤테이션 (백업 → 변이 → 복원 → `cmp` 일치)

| # | 변이 | 결과 |
|---|---|---|
| M1 | 엔진 `reductionAggregated` → `standalone` | 11건 실패 (route anchor 7 · 아코디언 anchor 3 · 기존 어댑터 계약 1) |
| M2 | 엔진 `max(0, …)` 제거 | cap 경계 1건 실패 |
| M3 | 아코디언 감면 행 값 → `reductionAmount` | 1건 실패 |
| M4 | 아코디언 «결정세액 (참고)» 산식 → `reductionAmount` | 1건 실패 |
| M5 | 아코디언 옛 이력 대체 → `reductionAmount` | 1건 실패 |
| M6 | 합계 카드 `getRefDeterminedTax` 대체 → `reductionAmount` | 1건 실패 (기존 계약 테스트) |
| M7 | «배분 N» 덧붙임 제거 | 1건 실패 |

### 7.4 기존 테스트와 계획서 대비 차이 (정직 공개)

- `refDeterminedTax`를 참조하는 기존 테스트 11개를 실행했다 — **값을 고정한 단언은 없었다**(반전한 단언 0). 1건만 실패했고(`multi-breakdown-adapter-contract` E-2 «fallback 값이 형제 카드와 같다»), 값 반전이 아니라 대체 계산 두 곳을 정상 경로와 같은 규칙으로 맞추라는 요구였다.
- 계획서 §2.3·Q-2는 «감면 행 값과 산식»으로 적었으나 **«감면세액» 행 아래 문구가 단건 엔진 단계 문구(단독값)** 라는 점은 구현 중 아코디언 렌더로 처음 확인했다. 값만 바꾸면 «문구 100,000,000 / 값 −61,013,645»가 새로 생겨 «배분» 덧붙임을 추가했다.
- §6의 «어댑터가 `refDeterminedTax` 대신 재계산» 변이는 쓰지 않았다 — 어댑터가 `getRefDeterminedTax`(M6)를 부르는 구조라 M6이 같은 축을 덮는다.
- 신고서 건별 열(`FilingFormTableAggregateHelpers.ts:363-366`)은 코드 변경이 없다. `reductionTax = max(0, 산출 − 결정)`이라 `refDeterminedTax`가 바뀌면 자동으로 따라간다 — 이 열을 직접 렌더한 테스트는 추가하지 않았고 위 «산출 − 결정 = 배분 감면» 필드 단언으로 갈음했다.

### 7.5 검증

- 회귀 5묶음 전부 통과: `__tests__/api` 517파일·7003건 · `tax-engine` 1520파일·19265건 · `calc` 847파일·11760건 · `lib` 265파일·3408건 · `components` 768파일·7029건.
- `tsc --noEmit` 0건 · 변경 파일 `eslint` 오류 0 (`MultiTransferTaxSummaryCard.tsx:103` 미사용 `_properties` 경고 1건은 이 변경 밖의 기존분).
- **Playwright 생략**: 기존 E2E에 아코디언의 «감면세액» 행·«결정세액 (참고)»를 보는 흐름이 없다(`e2e` grep 0건). **브라우저 수동 확인도 하지 않았다** — 렌더 컴포넌트를 jsdom으로 직접 렌더해 확인했다.

### 7.6 남은 확인 필요

- 3건 이상·비교과세·분할(GB) 자산에서 `reductionAggregated`와 `refCalculatedTax` 관계 — 2건 시료(+ cap 경계 1건)만 측정했다.
- 건별 `determinedTax`·PDF «결정세액 기여분 (참고)» (V-3, Q-3 a로 별건).
- ~~**옛 저장 이력**: `refDeterminedTax`가 저장돼 있으면 옛 혼합 기준 값이 그대로 표시된다~~ → **정정(후속 조사 `multi-per-asset-display-followup.plan.md` §4)**: 저장된 다건 결과를 건별 뷰·PDF로 다시 그리는 경로를 찾지 못했다. 이 서술은 근거 없이 쓴 것이었다. 대체 계산(필드 부재 시)은 새 규칙이라는 부분만 코드로 확인된 사실이다 (V-4).

