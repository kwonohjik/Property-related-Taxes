# 부담부증여 × 일체 주택 × 신축 — 「소득세법」 §114조의2 가산세 기준액에서 토지분 제외 (V-7) 계획서

> 작성 2026-11-05 · 상태: **결정 완료 — 방향(사용자 「토지분은 가산세 기준액에 제외해야 함」) · Q-1~Q-4 모두 a(「모두 권장안으로」)** · PR-1 엔진 §6 · PR-2 화면 대기
> 출처: `bg-carryover-k5-transferor-sec163-9.plan.md` §5.1 「확인 필요(별건 V-7)」
> 선례(일반 양도): 본인 신축 `transfer-tax-self-built-housing-penalty.ts`(`selfBuiltHousing` · 계획서 `docs/00-pm/self-built-housing-building-base-114-2.plan.md`) · 이월과세 증여자 신축 `transfer-tax-carryover-donor-penalty.ts` `housingBase`(`donorBuilt.housing` · 계획서 `docs/00-pm/carryover-donor-built-114-2.plan.md` Q-2)

## 0. 결론

부담부증여(§159) 경로의 §114조의2 가산세 기준액은 「채무비율 안분 후 **건물 자리**의 환산취득가액·감정가액」이다(`transfer-tax-burdened-gift-step.ts:175-247`). 일체 주택은 ④가 주택공시가격(토지 포함 한 값)을 건물 자리에 싣고 토지 자리를 0으로 보내므로, 그 값이 곧 **토지분을 포함한 주택 전체** 값이다. 법문은 「해당 건물의 감정가액 또는 환산취득가액」이라 토지분은 빠져야 한다. 일반 양도 경로는 두 축 모두 이미 건물분으로 나누지만(선례), 부담부증여는 두 축 모두 그 입력을 막아 두었다(`lib/calc/self-built-housing-scope.ts:76` · 엔진 `transfer-tax-self-built-housing-penalty.ts:75`).

## 1. 법문 (KoreanLaw MCP · 현행 mst 280405)

- 「소득세법」 제114조의2 제1항 — 「… 건물을 신축 또는 증축 … 하고 그 건물의 취득일 또는 증축일부터 5년 이내에 해당 건물을 양도하는 경우로서 제97조제1항제1호나목에 따른 감정가액 또는 환산취득가액을 그 취득가액으로 하는 경우에는 **해당 건물의 감정가액**(증축의 경우 증축한 부분에 한정한다) **또는 환산취득가액**(증축의 경우 증축한 부분에 한정한다)의 100분의 5에 해당하는 금액을 … 결정세액에 더한다.」
- 건물분 산정 근거(선례 계획서 §3.3 · Q-2 확정 · 재론 금지): 「소득세법」 제99조 제1항 제1호 라목(주택 = 부수토지 포함 일체 공시) · 제100조 제2항 · 영 제166조 제6항(토지·건물 가액 구분 불분명 → 기준시가 비율 안분) · 조심2016중0801. 건물분 기준시가 = 주택공시가격 × 건물기준시가 ÷ (토지공시가격 + 건물기준시가).

## 2. 현행 (코드 확인 · 수치는 기존 anchor)

| 축 | 위치 | 기준액 | 기존 anchor |
|---|---|---|---|
| 양도인 본인 신축 · K-5 | `transfer-tax-burdened-gift-step.ts` `isK5SelfBuilt` → `estimatedBase = building.acquisitionPrice` | 주택 전체 환산 × 채무비율 | `burdened-gift-114-2-penalty.test.ts` — 200M × 100M/400M = 50M · 가산세 2,500,000 |
| 양도인 본인 신축 · K-7 | 같은 파일 `isAppraisalSelfBuilt` → `penaltyAxis.base = building.acquisitionPrice` | 주택 전체 감정가액 × 채무비율 | `burdened-gift-appraisal-114-2-penalty.anchor.test.ts` |
| 당초 증여자 신축(이월과세 A) · K-5/K-7 | `transfer-tax-carryover-donor-penalty.ts` `withBgDonorBuiltPenalty` → 위 step의 base(probe) | 같음(당초 증여자 기준) | `carryover-donor-built-bg.anchor.test.ts` — K-5 93,750,000 · K-7 125,000,000 |

`withBgDonorBuiltPenalty` 주석의 「A 입력이 이미 당초 증여자 기준이라 그 base 가 곧 «증여자 기준·건물분»이다(D2·D4)」는 토지·건물 칸이 나뉜 **일반건물**에서만 맞다.

## 3. 바뀔 산식 (선례와 같은 헬퍼 · 손계산 예시)

- K-5: 기준액 = S_b × B_acq ÷ B_tr. S_b = 부담부증여 양도가액(채무 안분분)의 건물분(양도 당시 토지·건물 기준시가 비율), B_acq = 취득 당시 건물분 기준시가, B_tr = 양도 당시 건물분 기준시가. 비율이 같은 축에서 나뉘므로 근사적으로 「현행 × B_acq ÷ H_acq」다.
- K-7: 기준액 = 건물분 감정가액 × 채무비율. 건물분 감정가액 = 건물 감정가액 직접 입력, 없으면 감정가액 총액을 취득 당시 토지·건물 기준시가 비율로 안분(본인 신축 선례 `appraisal.mode`와 같다).
- 손계산(당초 증여자 K-5 anchor 시료 + 가정 입력 · **엔진 미실측**): S = 500,000,000 · H_T = 800,000,000 · 당초 증여자 취득 당시 H = 150,000,000 · 토지공시가격 1억 · 건물기준시가 6천만 → B_acq = 150,000,000 − ⌊150,000,000 × 1억 ÷ 1.6억⌋ = 56,250,000 → 기준액 ≈ 500,000,000 × 56,250,000 ÷ 800,000,000 = 35,156,250(현행 93,750,000) · 가산세 ≈ 1,757,812(현행 4,687,500). 양도 당시 토지·건물 비율을 넣으면 절사로 1원 단위가 달라질 수 있다 — Pre-Do anchor로 확정.

## 4. 사용자 결정 (Q-n)

### Q-1 범위
- **a (권장)** 두 축 모두(양도인 본인 신축 K-5·K-7 + 당초 증여자 신축 A K-5·K-7). 같은 결함이다.
- b 당초 증여자 신축만(V-7 원래 기록 범위).

### Q-2 입력
- **a (권장)** 선례 입력을 그대로 쓴다 — 본인 신축은 `selfBuiltHousing`(부담부증여 제외 해제), 당초 증여자 신축은 `carryoverDonorBasis.donorBuilt.housing`(일반 양도 `donorBuilt.housing`과 같은 모양). 화면은 기존 카드를 부담부증여 블록에서도 연다.
- b 부담부증여 전용 칸을 새로 만든다.

### Q-3 입력 부재
- **a (권장)** 선례와 같이 **던진다**(⑧ 차단 · ⑫ 400 · 엔진 INVALID_INPUT) — 관대하게 전체 값으로 계산하면 토지분 과다 부과가 조용히 남는다(선례 PR-4 엄격화 Q-2와 같은 이유). 기존 부담부증여 일체 주택 신축 시료는 입력을 추가해야 한다.
- b 입력이 없으면 현행(전체 값) + 「확인 필요」 고지.

### Q-4 PR
- **a (권장)** PR-1 엔진(두 축 · 입력 부재는 아직 현행 유지 플래그 없이 Pre-Do anchor) → PR-2 화면 ④⑤⑧⑫ + 엄격화. 엔진만 먼저 바꿔도 입력이 없으면 현행과 같으므로 나눌 수 있다.
- b PR 1개.

## 5. 확인 필요 (V-n)

- **V-1** 상업용 건물·오피스텔(「소득세법」 제99조 제1항 제1호 다목 — 토지 포함 일괄 고시) × 부담부증여 × 신축 — 같은 결함인지. 일반 양도 선례도 주택만 다룬다.
- **V-2** 공동주택(공동주택가격) — 선례의 건물분 산식(토지공시가격 = 개별공시지가 × 면적)이 공동주택 대지권에도 맞는지 선례 계획서 범위 확인.
- **V-3** 증축 — 선례(본인 신축)는 증축을 범위에서 뺐다(Q-4). 부담부증여 증축은 이미 「증축 부분 기준시가」(K-5)·「증축 부분 감정가액」(K-7)을 따로 받아 토지분이 섞이지 않는지 확인.
- **V-4** 지분·묶음·겸용 경로의 도달 여부.

## 6. PR-1 엔진 (구현)

- leaf `lib/tax-engine/burdened-gift-housing-penalty-base.ts` `bgHousingBuildingPenaltyBase` — 환산 S_b × B_acq ÷ B_tr · 감정 건물 자리 취득가액 × 건물 감정가액 ÷ 총액(직접 또는 취득 당시 비율). 입력이 모자라면 undefined.
- §159 스텝(`transfer-tax-burdened-gift-step.ts`) — 일체 주택 × 신축(본인·당초 증여자) × `selfBuiltHousing` 있으면 K-5 `estimatedBase`·K-7 `penaltyAxis.base`를 위 값으로. 증축은 종전(V-3).
- 당초 증여자: `withBgDonorBuiltPenalty`가 `donorBuilt.housing`을 채택 입력의 `selfBuiltHousing`으로 옮기고, `donorBuiltFactsOf`가 §159 소스 입력으로 넘긴다(빠뜨리면 probe·본 계산 모두 종전 base — 실측으로 확인).
- 입력 검사: `assertSelfBuiltHousingInput` 부담부증여 분기(`assertBgSelfBuiltHousingInput`) — 주택·신축·시가 환산/감정·필수 칸. 일반 양도 경로(`unreachableReason`)는 부담부증여에서 계속 관여하지 않는다(스텝이 읽는다).
- anchor `__tests__/tax-engine/transfer-tax/bg-housing-114-2-building-base.anchor.test.ts` 5건 = §3 손계산 그대로: 본인 신축 K-5 20,000,000 · 가산세 1,000,000(총부담 −1,650,000) · K-7 직접 60,000,000 / 비율 48,000,000 · 당초 증여자 K-5 35,156,250 · 1,757,812 · K-7 46,875,000 · 2,343,750. 입력 없으면 종전 값(회귀 0). 종전 단언(`self-built-housing-penalty.anchor.test.ts` 「부담부증여는 이 입력을 거부」)을 반전.
- 뮤테이션 8/9 — 살아남은 1건은 스텝의 증축 제외 조건(입력 검사가 먼저 막아 닿지 않는 이중 방어선).
