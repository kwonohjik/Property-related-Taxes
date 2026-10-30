# 이월과세 × 시가 모드 × 담보 승 — 당초 증여자 취득시 기준시가 필수 (⑫ 침묵 A = B 차단)

> 선행: 「이월과세 담보·임대 승 ⑧↔⑫ 격자」 측정(2026-10-30, 108칸). 사용자 지시: 「결함 1 ⑫ 차단 진행해」.

## 1. 사실 (실측)

시가 모드 부담부증여에서 담보평가(상증법 §66)가 시가보다 커서 이기면, 「소득세법 시행령」 §159①1호 괄호로 **취득가액이 취득시 기준시가 × 채무비율로 강제**된다
(`resolveBgAcquisitionBasis` → `collateralForcedStdInMarketMode`). 이월과세(§97의2)면 시나리오 A는 **당초 증여자 취득시 기준시가**, B는 양도인 취득시 기준시가를 쓴다.

그런데 게이트 `assertCarryoverDonorBasis` 는 **산정방식(실지)의 칸**(당초 증여자 실지취득가액)만 요구했다. 칸별로 값을 달리한 16조합 실측(주택 단건):

| 당초 증여자 기준시가 | 당초 증여자 실지 | 종전 ⑫ | 비고 |
|---|---|---|---|
| 있음(150M) | 있음(120M) | 200 | A = 150M(기준시가 사용) · B = 500M |
| **없음** | 있음 | **200** | **A = 500M = B** — 쓰이는 칸이 비어도 통과 |
| 있음 | 없음 | 400 | 쓰이지 않는 칸을 요구 |

일반건물 묶음도 같다(기준시가 없음 ⇒ 200, A = B = 200M). 환산(K-5)·감정/매매사례(K-6/K-7)는 두 게이트가 이미 기준시가를 요구해 정합이다.
화면에서는 ⑧ 의 시가 모드 담보 승 차단(`transfer-tax-validate-bg.ts:271`)이 앞서 막아 **API 직접 호출에서만** 도달한다.

## 2. 원인

`applyCarryoverDonorBasis` 의 `d.landStdPriceAtAcquisition ?? info.landStdPriceAtAcquisition` 는 「모드에서 쓰지 않는 칸을 보존」하려는 fallback 인데(주석), 담보 승에서는 그 칸이 **쓰이는데도** 게이트가 요구하지 않아 양도인 값이 들어간다.
시나리오 A = B 이면 §97의2②3호 비교가 성립하지 않고 이월과세가 **조용히 무력화**된다 — 게이트 주석이 막으려던 바로 그 상태다(`feedback_no_silent_apportion_fallback`).

## 3. 수정

`lib/tax-engine/transfer-tax-carryover-burdened-gift.ts` `assertCarryoverDonorBasis`: 시가 모드 ∧ 담보 승(엔진과 같은 `resolveBgAcquisitionBasis`·`computeSangjeungbeopValuation`, 지분은 `scaleBurdenedGiftInfo`)이면
**증여받은 파트의 당초 증여자 취득시 기준시가를 추가로 요구**한다(없으면 `TaxCalculationError(INVALID_INPUT)` → 400). 기존 요구(방식별 칸)는 그대로 둔다 — 쓰이지 않는 칸 요구 삭제는 범위 밖.
이 게이트는 단건·컴패니언 모두 같은 경로(`transfer-tax-carryover.ts` Step 2d)라 한 곳이다.

## 4. 검증 (`transfer.route.bg-carryover-collateral-donor-std.anchor.test.ts` 6건)

- CD-1 주택 단건 · CD-2 일반건물 묶음 — 기준시가 비움 ⇒ 400(종전 200) · 채움 ⇒ 200 ∧ A ≠ B(주택 150M/500M, 일반건물 50M/200M).
- CD-3 보충적평가 승(괄호 미발동) — 기준시가를 비워도 200(과차단 없음).
- 뮤테이션: 신규 블록 제거 → CD-1·CD-2 red.

## 5. 범위 밖

- ⑧ 의 시가 모드 담보 승 차단(`:271`)·묶음 게이트(이월과세 제외)는 그대로다 — 풀이 1·2단계는 별건.
- 쓰이지 않는 칸(담보 승의 당초 증여자 실지취득가액·추정값) 요구는 그대로다.
- 별건 발견: 기준시가 모드 부담부증여에서 양도인 취득시 기준시가를 비우면 ⑫ 200(⑧은 차단, 이월과세 무관) — 이 PR 에서 고치지 않는다.
