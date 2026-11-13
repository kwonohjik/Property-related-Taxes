# 양도차손 조기 반환 — 취득가액·필요경비 표시 echo 누락 (「취득가액 0 · 필요경비 0」) 계획서

> 2026-11-13 · 코드 읽기 + throwaway probe(API route 직접 POST + `buildRows`·`buildStatementItems` 직접 호출, `makeMockRates`) + Playwright 대조(DP-6 계획서 §9). 출처: `donor-nonhousing-building-penalty-base-dp6.plan.md` §9 «새로 발견한 기존 불일치».
> 표기: **[직접]** 이번 세션 실측·코드 읽기 · **[이전 실측]** 이전 보고 값 · **[해석]** · **[확인 필요]**.
> 상태: **계획 단계 — 사용자 결정 대기(Q-1)**. 코드 변경 없음.

## 0. 결론

| # | 질문 | 결론 |
|---|---|---|
| 1 | 원인 | **양도차손 조기 반환 빌더(`buildLossTransferTaxResult`)가 정상 반환·비과세 조기 반환이 싣는 표시 echo를 싣지 않는다.** `expenses`·`estimatedBase`·`estimatedDeduction`·`estimatedStdPriceAt{Acquisition,Transfer}`·`swapApplied`·`swapComparison`·`capitalExpenditureForDisplay`·§164⑨ 특례 상세 3종이 결과에 없다 [직접: §1]. 표시 코드는 이 값이 없으면 0으로 떨어지거나(명세서) 취득가액에서 역산한다(신고서). |
| 2 | 범위 | **환산뿐 아니라 실가·이월과세 A를 포함한 단건 양도차손 전부.** 같은 입력의 양도차익 건은 정상이다 [직접: §2 표]. 이월과세·§164⑨와 무관하다 — DP-6 Playwright 시료가 공매 주입 이월과세였을 뿐이다. |
| 3 | 화면 영향 | ① 신고서 표: 필요경비가 **취득가액에 흡수**되고 필요경비 칸은 비어 있다(환산 손실: 취득가액 297,000,000 → **302,940,000**). ② 상세명세서 1단계: 환산 손실은 취득가액·필요경비 **0·0**, 실가 손실은 필요경비 **0**. ③ §164⑨ 근거 카드가 뜨지 않는다. ④ 다건 합산: 특례+손실이면 취득가액·필요경비 배분이 틀린다(합계는 맞다) [직접: §2]. |
| 4 | 세액 영향 | **없음.** 양도차손은 결정세액 0이고 §114조의2 가산세 base는 손실 빌더가 별도로 이미 계산한다(`transfer-tax-loss-return.ts:98-120`). 어긋나는 것은 **표시 축뿐**이다 [직접]. |
| 5 | 도달성 | **정상 폼으로 닿는다.** 환산·실가 양도차손은 평범한 입력이다. (공매·수용 특례 셀만 정상 폼에 칸이 없어 직접 API다 — DP-6 V-1.) |
| 6 | 선례 | 같은 병이 **비과세 조기 반환**에서 이미 두 번 고쳐졌다 — `transfer-tax-finalize.ts:604-652` 주석(«신고서가 필요경비를 취득가액에 흡수 … 실측: 경비 20,000,000 · 취득가액 400,000,000 → 420,000,000으로 표시»). 손실 조기 반환만 남았다 [직접]. memory `feedback_early_return_branch_skips_pipeline_stages`. |
| 7 | 권고 | **Q-1 a** — 손실 빌더가 정상 반환과 같은 echo를 싣는다(표시 필드 한정, 세액 불변). |

## 1. 현행 코드 [직접: 코드 읽기]

- **조기 반환 지점:** `lib/tax-engine/transfer-tax.ts:456-458` `if (transferGain <= 0 && lossTaxableGain <= 0) return buildLossTransferTaxResult({...})`. 이 시점에 이미 `calcTransferGain` 결과(`transfer-tax.ts:368`: `usedEstimated, estimatedBase, estimatedDeduction, expenses: appliedExpenses, swapApplied, swapComparison, depreciationAmount, expropriationValuationDetail, auctionValuationDetail, housingExpropriationValuationDetail`)가 스코프에 있다.
- **손실 빌더 반환부:** `lib/tax-engine/transfer-tax-loss-return.ts:185` `usedEstimatedAcquisition: usedEstimated`, `depreciationAmount` 만 싣는다. `estimatedBase`는 인자로 받지만 **§114조의2 base(`pb0`) 계산에만** 쓰고 결과에는 싣지 않는다(`:98-102`).
- **정상 반환(대조):** `lib/tax-engine/transfer-tax-normal-return.ts:157-168` — `estimatedBase`·`estimatedDeduction`·`estimatedStdPriceAtAcquisition/Transfer`·`expenses: appliedExpenses`·`swapApplied`·`swapComparison`·`expropriationValuationDetail`·`auctionValuationDetail`·`housingExpropriationValuationDetail`·`capitalExpenditureForDisplay`.
- **비과세 조기 반환(선례):** `transfer-tax-finalize.ts:621`(`expenses`)·`:637-638`(`swapApplied`·`swapComparison`)·`:651-652`(`estimatedBase`·`estimatedDeduction`) — 같은 이유로 추가됐다.
- **소비처 1 — 신고서 표:** `components/calc/results/transfer/FilingFormTableHelpers.ts:323-326` `estimatedDisplay = swapApplied ? null : (usedEstimatedAcquisition && estimatedBase !== undefined) ? {...} : null` → 손실이면 `null`이라 «양도가 − 차익»으로 취득가액을 **역산**하고 필요경비는 비운다.
- **소비처 2 — 상세명세서 1단계:** `components/calc/results/transfer/DetailedStatementHelpers.ts:329-332` `(result.estimatedBase ?? 0) - depreciation`, `:424-426` `result.expenses ?? 0` → 손실이면 **0**.
- **소비처 3 — 다건 합산:** `lib/tax-engine/transfer-tax-aggregate-display-echo.ts:186-194` `r.result.estimatedBase ?? (raw 기준시가 비례식)` — 폴백은 §164⑨ 특례를 모른다(같은 파일 주석 F-14가 «폴백은 남긴다»고 명시).

## 2. 측정 [직접 — throwaway probe, 2026-11-13]

시료: 건물 · 양도가 300,000,000 · 양도일 2026-03-01. `buildRows(result,"single",…)`(신고서)·`buildStatementItems(…)`(명세서)를 **API 결과에 그대로** 돌렸다.

| 시료 | 양도차익 | 신고서 취득가액 / 필요경비 | 명세서 취득가액 / 필요경비 | 결과 `estimatedBase`·`expenses` | §164⑨ 카드 |
|---|---|---|---|---|---|
| **L1 환산 손실**(취득시 198M · 양도시 200M → 환산 297,000,000 · 개산공제 5,940,000) | −2,940,000 | **302,940,000 / 비어 있음** | **0 / 0** | ∅ / ∅ | — |
| L2 환산 **이익**(대조, 190M) | +9,300,000 | 285,000,000 / 5,700,000 | 285,000,000 / 5,700,000 | 있음 | — |
| **A1 실가 손실**(취득 320M · 경비 5M) | −25,000,000 | **325,000,000 / 비어 있음** | 325,000,000 / **0** | ∅ / ∅ | — |
| A2 실가 **이익**(대조) | +45,000,000 | 250,000,000 / 5,000,000 | 250,000,000 / 5,000,000 | — / 5,000,000 | — |
| A3 환산 손실 + 자본적지출 2천만 | −2,940,000 | 302,940,000 / 비어 있음 | 0 / 0 | ∅ / ∅ | — |
| **L4b 환산 + 공매 150M 손실**(실제 환산 400,000,000 · 개산공제 6,000,000) | −106,000,000 | **406,000,000 / 비어 있음** | **0 / 0** | ∅ / ∅ | **없음** |
| L5b 환산 + 공매 **이익**(대조) | +97,000,000 | 200,000,000 / 3,000,000 | 200,000,000 / 3,000,000 | 있음 | **있음** |
| **L6 이월과세 A + 공매 2억 손실** | −6,000,000 | **306,000,000 / 비어 있음** | **0 / 0** | ∅ / ∅ | 없음 |
| L7 이월과세 A **이익**(대조) | +144,000,000 | 150,000,000 / 6,000,000 | 150,000,000 / 6,000,000 | 있음 | — |

**다건(`/multi`) 합산 열** [직접]: L1은 297,000,000 / 5,940,000으로 **정확**(폴백이 특례 없는 환산을 재현). **L4b(특례 + 손실)는 취득가액 150,000,000 / 필요경비 256,000,000** — 실제 400,000,000 / 6,000,000. 합계 406,000,000은 맞다(필요경비를 취득가액에서 역산하는 구조라 항등식이 오류를 가린다 — DP-6 V-5와 같은 형태). 이익 대조 L5b는 200,000,000 / 3,000,000으로 정확.

**Playwright(브라우저 인쇄) 대조** [DP-6 계획서 §9]: 공매 주입 이월과세 손실 시료에서 인쇄 1단계 요약 행이 «취득가액 0 · 필요경비 0», 신고서 표가 «취득가액 1,006,000,000 · 필요경비 -»로 나왔고 **#3291 전후 동일**했다.

## 3. 영향 범위와 한계

- **세액:** 영향 없음(표시 축). 단 양도차손이 다건 통산에서 쓰이는 값은 `transferGain`이며 이번 echo와 무관하다 [해석 — 소비처 전수는 V-1].
- **신고서 서식:** 필요경비 칸이 비고 취득가액이 부풀어 제출용 서식의 두 칸 의미가 틀린다. 양도차손 신고도 별지 양식을 제출하므로 의미 있다 [해석].
- **화면:** 명세서 1단계 요약 «0 · 0»은 같은 화면의 산식 문장(`양도가(1,000,000,000) - 취득가(환산 1,000,000,000) - 경비(개산공제 6,000,000)`)과 모순이다(Playwright 확인).

## 4. 수정안 (Q-1)

- **a (권고) — 손실 빌더가 정상 반환과 같은 echo를 싣는다.** `transfer-tax.ts:458` 호출에 이미 스코프에 있는 값(`appliedExpenses`·`estimatedDeduction`·`swapApplied`·`swapComparison`·`expropriationValuationDetail`·`auctionValuationDetail`·`housingExpropriationValuationDetail`·`rawInput.capitalExpenditure`)을 넘기고, `transfer-tax-loss-return.ts`가 `estimatedBase`·`estimatedStdPrice*`와 함께 정상 반환(`transfer-tax-normal-return.ts:157-168`)과 **같은 식으로** 싣는다. 세액 경로는 손대지 않는다. 엔진 입출력 타입은 optional 필드를 채우는 것뿐이라 14지점 동기화는 없다(결과 echo 추가) [해석].
  - 규모: 엔진 2파일 약 20~30줄 + anchor. 예상 3시간(anchor → 구현 → 뮤테이션 → 회귀 5배치 → CI).
  - 위험: 손실 결과에 `expenses`·`estimatedBase`가 생기면 그 필드를 읽는 소비처가 달라질 수 있다 — 다건 집계(`transfer-tax-aggregate-display-echo.ts`)는 오히려 폴백 대신 엔진 값을 쓰게 되어 L4b가 고쳐진다(F-14 공백 해소). 다른 소비처는 V-1에서 전수 확인 후 착수한다.
- **b — 표시 함수가 손실이면 재계산한다.** 신고서·명세서·다건에서 §164⑨ 분모까지 재현해야 하고 엔진과 이중 진실이 된다. 비권고.
- **c — 현행 유지(한계로 기록).** 세액은 맞으므로 «완료 처리»할 수 있다. 다만 정상 폼에서 닿고 비과세 조기 반환은 이미 같은 병을 고쳤다.

## 5. 미검증 · 확인 필요

- **V-1** 손실 결과의 `expenses`·`estimatedBase`·`swapApplied`를 읽는 소비처 전수(다건 집계·PDF `ResultPdfTransferSections`·사이드바·재개발·분리 취득) — 이번에 신고서 표·명세서·다건 합산 열만 측정했다.
- **V-2** `swapApplied`가 손실에서 성립하는 시료(자본적지출 > 개산공제)의 표시 — A3은 환산 본문(swap 아님)이었다. swap 손실 시료는 미측정.
- **V-3** 다른 조기 반환 분기(`transfer-tax.ts:121`·`:155`·`:278` 재개발·`:366` 다필지·`:543` 일체주택 분리)의 echo 대조 — 이번 범위 밖, 전수 대조 필요(memory 교훈).
- **V-4** 화면 렌더는 DP-6 Playwright(이월과세 손실 1건)로만 봤다. 평범한 환산·실가 손실의 화면은 `buildRows`·`buildStatementItems` 직접 호출 값이며 브라우저에서 보지 않았다.
- **V-5** 양도차손 신고서에 필요경비 칸을 비우고 취득가액에 합쳐 표시하는 것이 의도된 관행인지 — 비과세 조기 반환 주석은 이를 사고로 규정했으나 손실 건에 대한 별도 법령·서식 근거는 확인하지 못했다.
- **V-6** 기존 anchor 중 손실 결과에 echo 부재를 고정한 것이 있는지 — 전수 grep 하지 않았다(착수 시 회귀 5배치로 확인).

## 6. 결정 요청

- **Q-1:** a 손실 빌더가 정상 반환과 같은 표시 echo를 싣는다(권고, 세액 불변) / b 표시 함수 보정 / c 현행 유지·한계 기록.
