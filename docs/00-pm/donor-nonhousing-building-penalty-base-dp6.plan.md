# 이월과세 × 증여자 신축·증축 — 비주택 건물 가산세 base 정렬 (DP-6) 계획서

> 2026-11-12 · 코드 읽기 + throwaway probe(API route 직접 POST, `makeMockRates`) + KoreanLaw MCP(소득세법 §114조의2). 출처: `self-built-housing-164-9-plan.md` §9 «확인 필요 1»·DP-6 / 메모리 `project_self_built_housing_building_base_plan`.
> 표기: **[직접]** 이번 세션 조회·실측 · **[이전 실측]** 이전 PR 보고서의 값(이번 재확인 안 함) · **[해석]** · **[확인 필요]**.
> 상태: **결정 대기(Q-1)** — 코드 변경 없음.

## 0. 결론

| # | 질문 | 결론 |
|---|---|---|
| 1 | 결함인가 | **그렇다.** 일체 주택은 가산세 base를 A 양도차익의 환산 분모(영 §164⑨ 특례 반영 H_T′)로 정렬했는데(#2501), **비주택 건물**(단독 신축·증축)은 특례 **전** 분모를 그대로 쓴다. A의 양도차익은 특례 분모로 계산되므로 같은 A 안에서 가산세 base와 실제 환산취득가액이 어긋난다 [직접: §2]. |
| 2 | 법문상 base | 소득세법 §114조의2①: «…환산취득가액을 그 취득가액으로 하는 경우에는 해당 건물의 … **환산취득가액**(증축의 경우 증축한 부분에 한정한다)의 100분의 5에 해당하는 금액을 … 결정세액에 더한다» [직접]. 즉 base = **양도차익 계산에 실제로 쓰인 환산취득가액**이다. |
| 3 | 세액 영향 | 결정세액·양도차익은 불변. **가산세 base와 가산세(+지방소득세)만** 바뀐다. 시료(공매 경락 2억·S=4억): 신축 base 150,000,000 → **300,000,000**(가산세 7,500,000 → 15,000,000), 증축 22,500,000 → **45,000,000**(1,125,000 → 2,250,000) [직접]. |
| 4 | 도달성 | 이월과세 자산은 화면에 보상액·경락가 칸이 없어(자산 단위 «환산» 토글 부재) **직접 API·stale 플래그**로만 도달한다 [이전 실측: PR-B 보고서 §9 «확인 필요 2»; 이번 재확인 안 함 → 확인 필요]. 정상 폼 입력의 수치는 바뀌지 않는다 [해석]. |
| 5 | 권고 | **a 정렬한다**(Q-1). 같은 단일 소스 함수(`resolveConversionDenominatorAtTransfer`)로 두 줄을 바꾸는 규모이고 일체 주택과 일관된다. 다만 출하 수치가 바뀌므로 승인이 필요하다(PR-B Q-4와 같은 사유). |

## 1. 현행 코드 [직접: 코드 읽기]

`lib/tax-engine/transfer-tax-carryover-donor-penalty.ts` `withDonorBuiltPenalty`(:208-236):

- 일체 주택(`propertyType === "housing"`): `housingBase()` — `resolveConversionDenominatorAtTransfer(rawInput)`의 H_T′로 건물분을 안분(:143-145). **정렬됨.**
- 비주택 **증축**: `calculateEstimatedAcquisitionPrice(rawInput.transferPrice, extensionStdPriceAtAcquisition, rawInput.standardPriceAtTransfer)` (:231-232) — 분모 = 특례 전 `standardPriceAtTransfer`.
- 비주택 **단독 신축**: `base = detail.scenarioA.acquisitionPrice` (:235) — `transfer-tax-carryover.ts:215-218`의 `donorAcqPrice = calculateEstimatedAcquisitionPrice(transferPrice, stdAtAcq, stdAtTransfer)`로, 역시 특례 전 분모.

반면 A의 양도차익은 `calcTransferGain`이 `resolveConversionDenominatorAtTransfer`(1호 수용 per-sqm·주택 총액, 2호 공매·경락)로 특례 분모를 읽는다 (`transfer-tax-expropriation-valuation.ts:392`). BG 변형(`withBgDonorBuiltPenalty`)은 채택 입력으로 본 계산을 다시 돌려 **실제 값**을 읽으므로 이 어긋남이 없다.

## 2. 측정 [직접 — throwaway probe, API route POST, 2026-11-12]

시료: 건물 · 양도가 3억 · 증여자 취득 당시 기준시가 2억 · 양도 당시 기준시가 4억 · 증여자 신축 2022-01-10 → 양도 2026-03-01(5년 이내) · A 채택. 증축은 증축 취득 당시 기준시가 3천만원.

| 셀 | 분모(특례) | A 양도차익 | 가산세 base (현행) | 가산세 | 총납부 | **정렬 시 base(= tp×분자÷분모)** | 정렬 시 가산세 |
|---|---:|---:|---:|---:|---:|---:|---:|
| 신축 · 특례 없음 | 4억 | 144,000,000 | 150,000,000 | 7,500,000 | 41,308,300 | 150,000,000 | 7,500,000 |
| 신축 · 공매 경락 2억 | 2억 | **−6,000,000** | 150,000,000 | 7,500,000 | 8,250,000 | **300,000,000** | 15,000,000 |
| 신축 · 수용 per-sqm(분모 2억) | 2억 | **−6,000,000** | 150,000,000 | 7,500,000 | 8,250,000 | **300,000,000** | 15,000,000 |
| 증축 · 특례 없음 | 4억 | 144,000,000 | 22,500,000 | 1,125,000 | 34,295,800 | 22,500,000 | 1,125,000 |
| 증축 · 공매 경락 2억 | 2억 | −6,000,000 | 22,500,000 | 1,125,000 | 1,237,500 | **45,000,000** | 2,250,000 |
| 증축 · 수용 per-sqm | 2억 | −6,000,000 | 22,500,000 | 1,125,000 | 1,237,500 | **45,000,000** | 2,250,000 |

- 특례 셀의 A 양도차익 −6,000,000 = 양도가 3억 − 환산취득가액(3억 × 2억 ÷ 2억 = **300,000,000**) − 개산공제(취득 당시 기준시가 3% = 6,000,000). 즉 실제로 쓰인 환산취득가액은 300,000,000인데 `scenarioA.acquisitionPrice`(= 현행 base)는 150,000,000으로 남는다 [직접].
- 총납부 증가(정렬 시): 신축 +8,250,000(가산세 +7,500,000 + 지방소득세 +750,000) · 증축 +1,237,500(+1,125,000 + 112,500) [해석: 가산세 5%, 지방소득세 10%].
- 특례 없는 셀은 현행과 정렬 후가 **바이트 동일**하다(분모가 같다).

## 3. 정렬안 (Q-1 a)

- 증축: 분모 `rawInput.standardPriceAtTransfer` → `resolveConversionDenominatorAtTransfer(rawInput).denominator`.
- 단독 신축: `detail.scenarioA.acquisitionPrice` 대신 `calculateEstimatedAcquisitionPrice(transferPrice, standardPriceAtAcquisition, conv.denominator)` (특례 없으면 현행과 같다). **swap 전 값**이라는 기존 주석(§97②2호 단서 swap이 발동해도 «환산을 썼다는 사실»에 붙는 가산세)은 유지한다.
- echo: 신축에도 `formula`(multiplicand·numerator·denominator)를 싣고, 특례가 걸리면 특례 분모를 표시한다(증축은 이미 formula가 있음) — 일체 주택 `housingSplit.sec164_9`와 같은 방식은 비주택에서는 불필요(주택 안분이 없음). 표시 변경 범위는 구현 때 UI 시니어 확인.
- 영향 파일: `transfer-tax-carryover-donor-penalty.ts` 한 곳 + 고정 anchor `__tests__/api/transfer.route.carryover-donor-built-164-9.anchor.test.ts:349-359`(«DP-6 범위 밖 고정», 150,000,000 → 300,000,000으로 반전) + 신규 anchor(증축·수용·공매·특례 없음 격자). 엔진 입출력·API 불변 → 14지점 동기화 없음(echo 필드를 늘리면 ⑦ 결과 카드만).
- 예상: 반나절(anchor 격자 → 구현 → 뮤테이션 → 회귀 5배치 → CI).

## 4. 미검증 · 확인 필요

- **V-1** 정상 폼에서의 도달 불가를 이번에 다시 확인하지 않았다 (PR-B 보고서의 «이월과세 자산은 자산 단위 환산 토글이 없어 보상액·경락가 칸이 열리지 않음»을 인용).
- **V-2** 일반건물(GB) 이월과세 라우트(`general-building-route-carryover.ts`)·함께 양도 컴패니언의 비주택 donor 신축·증축이 같은 base를 쓰는지 — 이번에 측정하지 않았다.
- **V-3** 지분 양도(`ownershipRatio`)에서 `transferPrice`(지분 환산 전/후)와 분모의 척도 — 단독 신축 base가 `scenarioA.acquisitionPrice`를 읽는 현행과 `calculateEstimatedAcquisitionPrice(transferPrice, …)`가 같은 척도인지.
- **V-4** 정면 해석례 부재(PR-B V-1)는 그대로 — 결과 고지에 «확인 필요» 유지.
- **V-5** A 카드의 «취득가액» 표시값(`scenarioA.acquisitionPrice` 150,000,000)이 특례 셀에서 실제 환산취득가액(300,000,000)과 다르게 보이는 표시 드리프트(PR-B 보고서 «확인 필요 3») — 세액은 정확, 별건.

## 5. 결정 요청

- **Q-1 (권고 a):** a 비주택 건물 donor 가산세 base를 A 양도차익의 환산 분모(영 §164⑨ 특례 반영)로 정렬한다 — 출하 수치가 위 §2대로 바뀐다(정상 폼 입력은 불변) / b 현행 유지 — 도달 경로가 직접 API·stale 플래그뿐이라 «완료 처리»하고 한계로 기록한다.
