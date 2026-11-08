# 일반건물 부담부증여 — 초과부담부(채무 > 증여가액) 가드 부재 계획서 (Q-4)

> 상태: **계획서 — 결정 대기** (문서만, 코드 변경 없음). 상위: `gb-axis-a-bg-ownership-ratio.plan.md` §0 별건 · §6 Q-4(결정 a: 별건으로 올린다).
> 작성 근거: 종류 4 × 모양 5 × 모드 2 = 40칸 실측(throwaway probe, 저장소에 없음) + 프로토타입 1줄(임시 적용 후 복원) + 회귀 5배치.

## 0. 결론

**일반건물 부담부증여만 채무(B)가 증여가액(C)을 넘어도 계산을 끝낸다.** 주택·토지·재개발 APT는 같은 입력을 `400 [EXCESS_BURDENED_GIFT]`로 막는데, 일반건물은 B > C 8칸(4모양 × 2모드) **전부 200**이다(B = C 경계 2칸도 200이지만 그건 정상). 화면(⑧)은 일반건물도 막으므로 **API 직접 호출에서만** 나온다.

| 항목 | 값 |
|---|---|
| 원인 | 일반건물 경로는 공용 단계 `runBurdenedGiftStep`(가드 `assertBurdenedGiftEligible` 호출)을 지나지 않고 `general-building-route-actual.ts:283`의 `buildBurdenedGiftBreakdown`을 직접 부른다 — 그 앞에 가드가 없다 |
| 수정 | `general-building-route-actual.ts`의 `buildBurdenedGiftBreakdown` 호출 **직전 1줄**(+ import 1줄): `assertBurdenedGiftEligible({ propertyType: "general_building", info: burdenedGiftInfo, ownershipRatio: burdenedGiftOwnershipRatio })` |
| 프로토타입 | B > C 8칸 → 400 `[EXCESS_BURDENED_GIFT]`, B = C 2칸 → 값 그대로(388,000,000 · 750,000,000). 회귀 469·262·744·815·1,495파일 **전부 통과**(기존 테스트가 B > C = 200을 전제한 곳 없음) |
| 화면 영향 | 없음 — ⑧이 이미 막는다(§2 ⑧ 열) |
| 규모 | 코드 2줄 + 주석 1줄 · anchor 1파일 · 구현 약 2~3시간 |

**조용히 틀린 값(B = 9.5억 > C = 8억, 기준시가 모드 단독 100%):** 채무비율 1.1875 · 무상이전분 **−150,000,000** · 양도가액 9.5억(양도시 기준시가 8억보다 큼) · 취득가액 4.75억(취득시 기준시가 4억 × 1.1875) → 양도차익 **460,750,000**. 같은 물건을 B = C(8억)로 넣으면 388,000,000이다. 법령상 정의되지 않은 입력을 에러 없이 숫자로 바꿔 돌려준다.

## 1. 범위

- 범위: 일반건물 부담부증여 실가 경로의 B > C 입력 — 단독 100% · 축 A 단건 · 축 B 60/40 · 함께 양도 100%+50%.
- 범위 밖: 주택·토지·재개발·입주권·상업용(가드가 이미 있다 — §2 · §7 V-2) · ⑧ 게이트에 일반건물 열기(Q-3 별도 계획) · 이월과세·의제취득일 전 교차(§7 V-1).
- 법령 근거(가드 본문이 이미 인용): 소득세법 §88 1호 후단 · 소령 §159①. 가드의 판정 규칙(C = max(보충적평가·담보평가·임대평가), `scaleBurdenedGiftInfo`로 지분분 축소, 채무는 축소하지 않음)은 **바꾸지 않고 재사용**한다.

## 2. 측정 [직접]

시료: 양도시 기준시가 8억 · 취득시 4억 · 시가 10억 · 양도일 2026-02-16. 채무는 B > C가 되게(채권최고액 0 → 담보평가액 0이라 C = 보충적평가/시가): **기준시가 모드** 단독 B = 9.5억(C 8억) · 축 A B = 5억(지분분 C 4억) · 함께 양도 100% B = 9.5억 + 50% B = 5억 · **시가 모드** B = 11억(C 10억) · 축 A 6억(지분분 5억). 화면 경로 그대로(⑧ `collectStepIssues` → ④ `captureBody` → ⑫~⑭ route POST).

| 종류 | 모양 | ⑧ (기준시가·시가 둘 다) | ⑫ 수정 전 |
|---|---|---|---|
| 주택 · 토지 · 재개발 APT | 단독 100% · 축 A 50% · 축 B 60/40 · 함께 양도 | 차단 («채무액이 증여가액 초과») | **400 `[EXCESS_BURDENED_GIFT]`** — 전 칸(3종류 × 4모양 × 2모드 = 24칸) |
| **일반건물** | 단독 100% | 차단 | **200** · 기준시가 460,750,000 · 시가 825,000,000 |
| 일반건물 | 축 A 50% | 차단 | **200** · 242,500,000 · 450,000,000 |
| 일반건물 | 축 B 60/40 | 차단 | **200** · 460,750,000 · 825,000,000 |
| 일반건물 | 함께 양도 100%+50% | 차단 | **200** · 703,250,006 · 1,275,000,002 |
| 전 종류 | 단독 100% B = C (경계) | 통과 | 200 · 기준시가 388,000,000 · 시가 750,000,000 (일반건물 = 주택 = 토지) |

- B = C는 어느 종류도 막지 않는다(`>`만 막는다) — 가드가 «초과»만 거른다는 경계.
- 일반건물 함께 양도의 끝자리 +6 / +2는 이 계획의 판정과 무관하다(원인 **확인 필요** — 파트 안분 반올림으로 보이나 이번에 측정하지 않았다).
- 일반건물은 «⑧은 막는데 ⑫는 계산한다» — 화면을 우회한 API 직접 호출에서만 드러난다. 다른 종류는 ⑫도 같은 사실을 막아 두 겹이다.

### 2.1 코드로 확인한 호출 경로 [직접 — 코드 읽기]

| 경로 | 가드 호출 | 근거 |
|---|---|---|
| 일반 단건(주택·토지·입주권·상업용 등) | 있다 | `lib/tax-engine/transfer-tax-precalc.ts:269` `runBurdenedGiftStep` → `lib/tax-engine/transfer-tax-burdened-gift-step.ts:59` `assertBurdenedGiftEligible`. `runBurdenedGiftStep`의 호출처는 이 한 곳뿐 |
| 재개발 | 있다 | 위와 같은 단계 + `redevelopment-burdened-gift.ts:105` 주석이 «`assertBurdenedGiftEligible`이 B > C를 이미 fail-fast»를 전제로 두 번째 방어선(`debt > valuation` 던짐)을 둔다 |
| **일반건물 실가 전 모양** | **없다** | `buildBurdenedGiftBreakdown` 호출처 3곳 중 `app/api/calc/transfer/general-building-route-actual.ts:283`은 가드 호출이 없고(import 26행에 `buildBurdenedGiftBreakdown`만), `transfer-tax-burdened-gift-step.ts:84`는 가드 뒤이며, `transfer-tax-aggregate-burdened-gift.ts:34`는 묶음 «물건 전체» 표시용 재계산이다(자산별 카드가 판정) |

일반건물의 단건·축 B·함께 양도가 모두 이 호출(`general-building-route-actual.ts`)을 거친다는 것은 **프로토타입 실측**(한 곳에 가드를 두자 B > C 8칸 전부 400)으로 확인했다. 호출 사슬의 줄 번호는 단건 `general-building-route-helper.ts:225`(`calculateGeneralBuildingActualTransfer`) · 축 B·함께 양도 `general-building-part-cards.ts:159`(`buildActualGeneralBuildingCards`)이고, 단건 안쪽 중간 단계(`general-building-route-carryover.ts:123`)에서 route-actual로 이어지는 호출은 줄 단위로 따라가지 않았다(**확인 필요** — 실측으로는 닫힘).

## 3. 원인과 수정안

- 가드는 단일 책임이다: `burdened-gift-eligibility.ts:54` `assertBurdenedGiftEligible`이 propertyType 범위·초과부담부(`:102` `giftValuation > 0 && assumedDebt > giftValuation` → `INVALID_INPUT` `[EXCESS_BURDENED_GIFT]`, route가 400으로 응답 — `lib/api/tax-error-response.ts:22`)를 한다. 일반건물 경로가 이 호출을 건너뛰는 것이 전부다.
- 수정 diff(프로토타입, 복원 확인):
  ```diff
  app/api/calc/transfer/general-building-route-actual.ts
   import { buildBurdenedGiftBreakdown } from "@/lib/tax-engine/burdened-gift-apportionment";
  +import { assertBurdenedGiftEligible } from "@/lib/tax-engine/burdened-gift-eligibility";
   ...
  +    assertBurdenedGiftEligible({ propertyType: "general_building", info: burdenedGiftInfo, ownershipRatio: burdenedGiftOwnershipRatio });
       const breakdown = buildBurdenedGiftBreakdown({
  ```
- 가드의 `ownershipRatio`: 축 B는 종전부터, 단건·컴패니언 축 A는 #2990부터 `burdenedGiftOwnershipRatio`가 실린다. 그래서 축 A 단건의 지분분 C로 비교된다(축 A B = 5억 > 지분분 C 4억이 400이 된 것으로 확인 — §4).
- 같이 고칠 주석: `general-building-route-actual.ts:289`의 «축 B 지분 카드만 — … (단건·컴패니언은 undefined = 종전)»은 #2990 이후 **거짓**이다(단건·컴패니언도 지분율을 넘긴다). 내 변경(#2990)이 만든 낡은 주석이라 같은 PR에서 정정한다.
- 별건으로 **언급만**(고치지 않는다): `lib/tax-engine/legal-codes/burdened-gift.ts:82` 주석이 «`general-building-route-actual.ts` `calculateGeneralBuildingActualTransfer`»라 하지만 그 함수는 `general-building-route-carryover.ts:123`에 있다.

## 4. 프로토타입 검증 [직접]

- 위 1줄을 임시 적용 → 일반건물 10칸 재측정: **B > C 8칸 전부 400**(`[EXCESS_BURDENED_GIFT]`), **B = C 2칸 전부 값 불변**(388,000,000 · 750,000,000).
- 회귀(프로토타입 적용 상태): `__tests__/api` 469파일/6,105 · `__tests__/lib` 262/3,356 · `__tests__/components` 744/6,861 · `__tests__/calc` 815/11,437 · `__tests__/tax-engine` 1,495/18,891 — **전부 통과**. 즉 기존 어느 테스트도 일반건물 B > C = 200을 고정해 두지 않았고, 가드의 C가 일반건물 정당한 입력(#2990의 축 A 담보 승 B = 담보평가액 · 함께 양도 담보 승 등)을 오탐해 막은 곳도 없다.
- 복원: `route-actual.ts` diff 0 확인. 이 PR은 문서만 담는다.

## 5. 구현 계획 (결정 후 별도 구현 PR)

1. **anchor 선작성(수정 전 실패):** `__tests__/api/transfer.route.gb-excess-burdened-gift.anchor.test.ts` — 일반건물 5모양 × 2모드 B > C 8칸 → 400 + 본문 `[EXCESS_BURDENED_GIFT]` · B = C 2칸 200 + 값 고정(388,000,000 · 750,000,000) · 비교군 주택 단독 B > C 400(같은 코드·같은 문구 골격). 수정 전 실행값(460,750,000 등)이 실패 메시지로 나오는지 확인.
2. **수정:** 가드 1줄 + import 1줄 + `:289` 주석 정정.
3. **뮤테이션(cp 백업/복원):** (M1) 가드 줄 제거 → 8칸 사망 (M2) `ownershipRatio` 인자 제거 → 축 A·함께 양도 50% 칸만 사망(물건 전체 C로 비교돼 통과) (M3) `propertyType`를 지원 외 값으로 → 전 칸 다른 사유로 사망.
4. **회귀(배치, `__tests__/lib` 포함):** api · lib · components · calc · tax-engine.
5. `tsc` · `eslint`.
6. **Playwright: 불필요하다고 판단** — 화면(⑧)은 이미 일반건물 B > C를 막고 UI 변화가 없다(§2 ⑧ 열 — 일반건물 B > C 8칸 전부 «차단», B = C 2칸은 통과). API 400 응답만 바뀐다. (⑧ 차단 화면 자체는 기존 E2E가 다룬다 — 확인 필요: 일반건물 B > C 화면 차단을 고정한 E2E가 있는지, 없으면 구현 때 anchor `collectStepIssues` 단언으로 갈음.)
7. 결과 섹션 추가 · PR 제목·본문 갱신 · pre-push 통과 · CI 대기.

## 6. 결정 대기

**Q-1. 가드 위치 (권장 a)**
- (a) `general-building-route-actual.ts`의 `buildBurdenedGiftBreakdown` 호출 직전 **한 곳**. 5모양이 모두 이 호출을 거친다(§2.1 · 프로토타입 8칸 전부 400).
- (b) 모양별 호출처(`general-building-route-helper.ts` · `general-building-part-cards.ts` · 축 B)에 각각 — 한 곳이 빠지면 그 모양이 조용히 열린다.

**Q-2. 오류 형식 (권장 a)**
- (a) `assertBurdenedGiftEligible` 재사용 — 주택·토지·재개발과 같은 `INVALID_INPUT` · `[EXCESS_BURDENED_GIFT]` 문구 · 400. 종류 간 응답이 같아진다.
- (b) 일반건물 전용 문구 신설 — 종류마다 문구가 갈라지고 ⑧의 `debtExceedsGiftValueMessage`와도 어긋난다.

**Q-3. 낡은 주석 `:289` 정정을 같은 PR에 넣는다 (권장 a)**
- (a) 넣는다 — #2990이 만든 거짓 주석이라 «내 변경이 만든 낡은 것»이다.
- (b) 넣지 않는다 — 거짓 주석이 남는다.

**Q-4. 이월과세 시나리오(A·B) × 초과부담부 (권장 a)**
- (a) 구현 PR 첫 단계로 측정(V-1)해 결과를 anchor로 고정한다. 시나리오 하나만 B > C일 때 채택 시나리오와 무관하게 400이 되는지(과차단) 확인한다.
- (b) 측정 없이 가드만 넣는다 — 이월과세 과차단 가능성을 모른 채 간다.

## 7. 미검증 · 확인 필요

| 번호 | 항목 | 상태 |
|---|---|---|
| V-1 | 이월과세 × 일반건물 BG: `route-carryover.ts`가 시나리오 A·B를 각각 `run`(`:172` `toTransferorBasisInfo` · `:184` `applyCarryoverDonorBasis`)하므로 가드가 시나리오마다 돈다. 둘의 C가 같은지(양도시 기준시가·시가는 같다고 읽히나 **실측 안 함**) | **확인 필요** — 구현 PR 첫 단계(Q-4) |
| V-2 | 입주권·상업용·건물(`building`)·분양권: 코드 읽기로는 모두 `runBurdenedGiftStep` 단일 호출처(`transfer-tax-precalc.ts:269`)를 지난다 | **확인 필요** — 코드 읽기만, 격자 실측은 주택·토지·재개발·일반건물 4종류 |
| V-3 | 일반건물 층별 가감율(`giftBuildingStdPriceAtTransfer`)·의제취득일 전 파트에서 가드의 C가 `buildBurdenedGiftBreakdown`의 C와 같은지. 회귀 통과는 오탐이 없다는 간접 증거일 뿐 직접 대조가 아님 | **확인 필요** — 구현 PR anchor로 B = C 경계 칸(층별 가감율 입력)을 추가 |
| V-4 | B > C일 때 일반건물 응답의 증여세 블록(`gratuitousPortion` −150,000,000 → 무상이전분 ≤ 0이라 증여세 블록 생략으로 읽힘) 표시 | 수정 뒤 400이라 해당 없음 — 측정하지 않음 |
| V-5 | 일반건물 B > C를 고정한 기존 E2E(화면 차단) 유무 | **확인 필요** — §5-6 |

## 8. 재현

- probe는 저장소에 없다(throwaway). 격자: 4종류 × 5모양 × 2모드 + B = C 경계 — 시료 구성은 `bg-fractional-winner-kinds-grid.plan.md` §2와 같고 채무만 `bgMortgageSetAmount: "0"`(담보평가액 0)으로 C를 보충적평가/시가에 고정했다.
- 프로토타입: §3의 diff 2줄. 복원 후 `git diff` 0 확인.
- 회귀: `npx vitest run __tests__/api`, `__tests__/lib`, `__tests__/components`, `__tests__/calc`, `__tests__/tax-engine`.
