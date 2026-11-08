# 일반건물 부담부증여 × 공유 소유(축 A) — 지분율을 §159에 넘기도록 고치는 계획

- 상태: **계획서 + 결정 게이트 (코드 변경 없음)**. 작성 2026-11-07, 기준 master `5e989f187`.
- 선행 측정: PR #2975 `docs/00-pm/bg-fractional-winner-kinds-grid.plan.md` §3.2·§3.2 승자 갈림 표 (Q-2 a 확정, 2026-11-07). 이 문서는 그 결함의 **수정 계획**이다.
- 표기: **[직접]** = 이 문서 작성 중 직접 실행·대조. **확인 필요** = 미측정·미해명.
- 용어: 축 A = 공유 소유(내 지분만큼 소유, 채무 = 내 인수분) · 축 B = 같은 물건 지분 분할 · 함께 양도 = 한 신고서에 여러 물건. 값 = 양도차익(`totalTransferGain`).

## 0. 결론

1. **결함 확정.** 일반건물 부담부증여(소령 §159①)에서 공유 소유(축 A) 자산은 화면 안내문이 «평가액은 물건 전체로 입력하면 엔진이 지분분으로 환산합니다»라고 약속하는데(`components/calc/transfer/BurdenedGiftBlock.tsx:275-281`), 일반건물 계산 경로가 **지분율을 §159에 넘기지 않아** 환산이 일어나지 않는다. 주택·토지·재개발은 같은 입력에서 같은 종류 단건(반 크기)과 일치한다.
2. **수정은 두 줄이다.** 단건 경로 1줄(`general-building-route-helper.ts:233` 아래) + 함께 양도 경로 1줄(`general-building-part-cards.ts:397`의 `undefined` 자리). 축 B는 이미 같은 인자를 넘기고 있다. 임시 적용(프로토타입, 복원 확인)으로 **격자 15칸 중 축 A 단건 3칸·함께 양도 3칸, 모두 6칸의 불일치 −154,500,000 · −18,727,272 · +31,000,000이 모두 0**이 되고, 관련 테스트 615파일 7,625건과 `tsc`가 그대로 통과했다 [직접].
3. **지금 화면에서 도달하는 값이다.** 기준시가 모드 단건 담보·임대 승은 ⑧이 통과시킨다(−154,500,000 / −18,727,272). 시가 모드와 함께 양도는 ⑧이 막지만 ⑫(API 직접)는 같은 값을 낸다.
4. **부수 효과(표시):** 잘못된 값 때문에 «무상이전분 1억»이 생겨 결과에 증여세 블록(증여세 4,850,000)이 나오던 입력이, 수정 후 무상이전분 0이 되어 그 블록이 사라진다. 세액이 아니라 표시다 — 결과 카드 확인은 구현 PR에서 한다(V-3).
5. **별건 발견(이 수정과 무관, 같은 측정에서 나옴):** 일반건물 ⑫에는 **초과부담부(B > C) 차단이 없다** — 단독 100%도 채무 9.5억 > 증여가액 8억이 200으로 계산된다. 주택은 400(`EXCESS_BURDENED_GIFT`). 화면은 ⑧이 막아 API 직접 호출에서만 나온다. Q-4로 분리했다.

## 1. 범위

- 포함: 일반건물(`general_building`) 부담부증여의 축 A 단건 · 함께 양도 컴패니언의 지분 < 100% 자산. 실가 경로(`actualPriceMode`)만 — 부담부증여는 실가 경로로만 흐른다(⑫ `refineGbBurdenedGiftActualPath`).
- 제외(별도): 이월과세 · 의제취득일 전 상속·증여 파트 · 토지·건물 분리 취득일 — **확인 필요**(V-1·V-2·V-4). ⑧ 게이트에 일반건물을 여는 일(Q-3). 초과부담부 가드(Q-4).

## 2. 재현 [직접]

시료: 일반건물, 양도시 기준시가 8억(토지 ㎡당 600만 × 100㎡ + 건물 2억) · 취득시 4억(토지 ㎡당 200만 × 100㎡ + 건물 2억) · 시가 10억 · 지분 50%, 양도일 2026-02-16. 대조 기준 = 같은 물건의 **반 크기 단건**(평가액·기준시가·실지취득가 모두 ×0.5, 채무·보증금·임대료는 본인 인수분 그대로). 화면 경로 그대로(⑧ `collectStepIssues` → ④ `captureBody` → ⑫~⑭ route POST).

| 모양 | 값 | 수정 전 차이 | 수정 후 차이 | ⑧ |
|---|---|---|---|---|
| 축 A 단건 | 기준시가 · 담보(채무 7억) | **−154,500,000** | 0 | 통과 |
| 축 A 단건 | 기준시가 · 임대 | **−18,727,272** | 0 | 통과 |
| 축 A 단건 | 시가 · 담보 | **+31,000,000** | 0 | 차단 |
| 함께 양도 100%+50% | 기준시가 · 담보 | −154,500,000 | 0 | 차단 |
| 함께 양도 | 기준시가 · 임대 | −18,727,272 | 0 | 차단 |
| 함께 양도 | 시가 · 담보 | +31,000,000 | 0 | 차단 |
| 축 A 단건 · 함께 양도 | 기준시가·시가 · 보충 (4칸) | 0 | 0 | 통과 |
| 축 B 60/40 (5칸) | 전부 | 0 (임대 +4원 — 토지·건물 파트 안분 반올림, 수정 전과 같다) | 같다 | 통과/차단 |

**승자 갈림 [직접]:** 채무 M을 바꾸면(보충 = 양도시 기준시가, 담보 = M) 수정 전 ⑫는 보충 8억(지분을 줄이지 않은 값)과 M을 비교하고, 올바른 판정은 지분분 4억과 M의 비교다.

| M | 수정 전 ⑫ 승 | 올바른 승(반 크기 단건) | 수정 전 차이 | 수정 후 차이 |
|---|---|---|---|---|
| 3억 이하 | 보충 | 보충 | 0 | 0 |
| 4.5억 | 보충 | 담보 | −25,750,000 | 0 |
| 6억 | 보충 | 담보 | −103,000,000 | 0 |
| 7억 | 보충 | 담보 | −154,500,000 | 0 |
| 9억 | 담보 | 담보 | −206,000,000 | 0 |

**손계산(기준시가 · 담보 · 채무 7억):** 증여가액 C = max(보충 8억 × 50% = 4억, 담보 7억) = 7억 → 채무비율 7억 ÷ 7억 = 1 → 양도가액 7억, 취득가액 = 취득시 기준시가 4억 × 50% × 1 = 2억, 개산공제 3% = 600만 → 양도차익 **494,000,000**. 수정 후 실행값과 일치. 수정 전은 C = 8억(지분 미축소) → 채무비율 0.875 → 취득가액 3.5억 · 개산공제 1,050만 → 339,500,000.

## 3. 원인과 수정안

**원인.** 부담부증여 엔진 `buildBurdenedGiftBreakdown`은 `ownershipRatio`를 받아 §159의 A·C(평가액·기준시가)를 **한 곳에서** 지분분으로 줄인다(`lib/tax-engine/burdened-gift-apportionment.ts:122-127`, `scaleBurdenedGiftInfo` — B(채무)는 그대로). 주택·토지는 일반 단건 단계가 그 값을 넘긴다(`transfer-tax-burdened-gift-step.ts`). 일반건물은 자기 경로(`general-building-route-*`)를 타서 **축 B 지분 카드만** 넘긴다:

- 소비: `general-building-route-actual.ts:289` `ownershipRatio: burdenedGiftOwnershipRatio` (주석 «축 B 지분 카드만 — 단건·컴패니언은 undefined = 종전»)
- 타입: `general-building-route-actual.types.ts:47` («공유 소유 단건의 `ownershipRatio` 미전달은 별건, 계획서 V-5»)
- 단건 호출: `general-building-route-helper.ts:222-` `calculateGeneralBuildingActualTransfer({...})`에 인자 없음 (함수는 `ownershipRatio` 파라미터를 이미 받는다 — 개산공제 base·구분 기재 안분에만 쓴다)
- 함께 양도 호출: `general-building-part-cards.ts:397` `buildGbPartCards(..., bgInfo, undefined, ...)` — `burdenedGiftOwnershipRatio` 자리에 `undefined`
- 축 B: `general-building-fractional.ts:249` `burdened ? share.ownershipRatio : undefined` — 이미 넘긴다

**왜 보충 승은 맞았나.** 보충 승이면 양도가액 = A × B/C에서 A = C라 B가 되고, 취득가액 = 취득시 기준시가 × B/C에서 분자·분모가 같은 비율로 줄어 약분된다. 그래서 계획서 `gb-burdened-gift-silent-drop.plan.md` §14.7(«시가·기준시가 모드에서는 스케일 유무가 결과를 못 바꾼다. 필요한 유일한 조합은 담보평가 승인데 ⑧이 막아 폼으로는 못 만든다»)이 쓰였다. **이번 측정이 그 서술을 정정한다:** 기준시가 모드의 담보·임대 승은 ⑧이 통과시켜 폼으로 만들 수 있고, 임대 승도 값이 어긋난다(§14.7은 임대를 시가 모드 `max`에 들지 않는다는 점만 봤다). 구현 PR에서 §10 V-5·§14.7 서술을 정정한다.

**수정안(프로토타입 diff, 복원 확인):**

```diff
--- a/app/api/calc/transfer/general-building-route-helper.ts
@@ dispatchCoercedGeneralBuilding — 실가 분기
         burdenedGiftInfo,
+        ...(burdenedGiftInfo ? { burdenedGiftOwnershipRatio: ownershipRatio } : {}),
--- a/app/api/calc/transfer/general-building-part-cards.ts
@@ buildGbCompanionItems
       bgInfo,
-      undefined,
+      bgInfo ? src.ownershipRatio : undefined,
```

- `ownershipRatio`가 undefined이거나 ≥ 1이면 `scaleBurdenedGiftInfo`가 그대로 돌려준다 — 단독 소유·함께 양도의 100% 자산은 무변경(격자 «함께 100%+50%»의 합이 단건 합과 0 차이).
- 14개 동기화 지점: 새 입력 필드가 없다. `GeneralBuildingActualPricePayload.burdenedGiftOwnershipRatio`가 이미 있고(Zod 대상 아님 — 내부 payload), ⑭ 단계에서 값을 운반하는 것뿐이다. 구조 가드 `__tests__/api/gb-route-actual-payload-forwarding.anchor.test.ts`가 있다.
- 주석 정정: `route-actual.ts:289` · `route-actual.types.ts:42-49` · `part-cards.ts:116-117`이 «축 B 전용 / 단건·컴패니언 미전달»을 말한다 — 구현 때 같이 고친다.

## 4. 프로토타입 검증 [직접]

- 관련 테스트 묶음 `npx vitest run general-building gb- burdened bundled companion carryover` — **615파일 7,625건 전부 통과**(수정 적용 상태). 현행 거동(지분 미전달)을 고정한 anchor가 없었다는 뜻이다 — 구현 PR의 anchor가 처음 고정한다.
- `npx tsc --noEmit` 오류 0건.
- 응답 명세 차이(수정 후, 축 A 단건 기준시가 담보 7억): `ownershipRatio` 0.5 · `fractionalHighValueDenominator` 14억(지분 모드 12억 판정 분모)이 새로 실린다. 보충 8억 → 4억(지분분), 선택 모드 보충 → 담보, 채무비율 0.875 → 1, 무상이전분 1억 → 0, 토지·건물 파트 취득가액 1.75억/1.75억 → 1억/1억, 개산공제 525만/525만 → 300만/300만. **증여세 블록(증여세 4,850,000)은 무상이전분이 0이 되어 사라진다.** 세액(결정세액) 열 대조는 하지 않았다 — 양도차익만 대조했다(V-9).
- 되돌림: 프로토타입은 `git checkout`으로 복원했고 이 PR은 문서만 담는다.

## 5. 구현 계획 (결정 후 별도 구현 PR에서 — 이 문서 PR은 머지)

1. **anchor 선작성(수정 전 실패해야 한다):** `__tests__/api/transfer.route.gb-axis-a-bg-ratio.anchor.test.ts` — 기존 `transfer.route.bg-axis-a-nonsupp-win.anchor.test.ts`의 KIND 시료 틀을 쓴다. 케이스: 축 A 단건 기준시가 담보·임대 · 시가 담보(⑫ 직접) · 함께 양도 100%+50% 담보·임대·시가 담보 · 승자 갈림 M=4.5억·6억·7억·9억 · 보충 불변 대조. 오라클 = 반 크기 단건(+ 함께 양도는 단건 합), 손계산 494,000,000 고정. 수정 전 실행값(339,500,000 등)이 실패 메시지로 나오는지 확인한다.
2. **수정 2줄 + 주석 정정.**
3. **뮤테이션(cp 백업/복원):** (M1) 단건 줄 제거 → 단건 anchor만 죽는다 (M2) 컴패니언 줄 제거 → 함께 양도 anchor만 죽는다 (M3) 컴패니언을 `src.ownershipRatio` 대신 1로 → 함께 양도 50% 자산 anchor가 죽는다.
4. **회귀(배치, `__tests__/lib` 포함):** api · lib · components · calc · tax-engine. 프로토타입은 이름 필터 묶음만 돌렸으므로 전수 배치는 구현 때 한다.
5. `tsc` · `eslint` · **Playwright 확인**(일반건물 공유 소유 기준시가 담보 승 → 결과 카드의 취득가액·개산공제·증여세 블록 유무·지분 표기).
6. 결과 섹션을 이 문서에 추가, PR 제목·본문 갱신, pre-push 통과 후 CI 대기.
7. 문서 정정: `gb-burdened-gift-silent-drop.plan.md` §10 V-5 · §14.7 서술.

예상 규모: 코드 2줄 + 주석 · anchor 1파일 · 문서 정정. 구현 약 반나절(회귀·Playwright 포함).

## 6. 결정 (2026-11-08 사용자: Q-1~Q-4 모두 권장안 a, 이 계획서 PR은 머지 후 구현은 새 PR)

> 아래 각 항목의 권장안(a)이 채택됐다. 선택지 원문은 결정 근거로 남긴다.

**Q-1. 수정 범위 ✅ 채택 a**
- (a) 단건 + 함께 양도 둘 다. ⑧이 막고 있어도 ⑫는 같은 값을 내므로(API 직접) 두 경로를 한 번에 맞춘다.
- (b) 단건만. 함께 양도는 ⑧이 막고 있다는 이유로 미룬다 — 같은 결함이 ⑫에 남는다.

**Q-2. 이월과세 · 의제취득일 전 상속·증여 · 분리 취득일 × 축 A ✅ 채택 a**
- (a) 이 수정과 **분리**한다. 먼저 구현 PR에서 이 세 갈래에 이 수정이 닿는지 측정(V-1·V-2·V-4)해 닿지 않으면 «막힘»으로 기록하고, 닿으면 별도 계획서로 올린다.
- (b) 같은 PR에서 전부 맞춘다 — 측정이 먼저 필요해 범위가 불명확하다.

**Q-3. 수정 뒤 ⑧ 게이트에 일반건물을 연다 ✅ 채택 a (이 수정에는 넣지 않고 별도 계획)**
- (a) 별도 계획(PR #2975 Q-1의 토지와 같은 방식). 일반건물은 취득시 기준시가 칸이 `gbAcqLandPricePerSqm`·`gbAcqBuildingValue`(토지·건물 파트)라 ⑤ 칸 측정이 따로 필요하다.
- (b) 이 PR에서 같이 연다 — 범위가 커진다.

**Q-4. 일반건물 ⑫ 초과부담부 가드 부재 ✅ 채택 a**
- (a) 별건으로 올린다. 이 수정과 무관하고(단독 100%에서도 재현), 화면은 ⑧이 막아 API 직접에서만 나온다. 먼저 일반건물 경로가 `assertBurdenedGiftEligible`을 우회하는지(`transfer-tax-burdened-gift-step.ts:59`는 일반 단건 단계) 읽고 별도 계획서를 쓴다.
- (b) 이 PR에 같이 넣는다 — 지분 수정과 한 PR에 섞인다.

## 7. 미검증 · 확인 필요

| # | 항목 | 비고 |
|---|---|---|
| V-1 | 이월과세 일반건물 × 축 A — `general-building-route-carryover.ts` · `bundled-gb-carryover-units.ts`가 지분율을 운반하는지, ⑧이 이 조합을 통과시키는지 | 측정 안 함. 위 두 줄이 이 갈래에 닿는지 불명 |
| V-2 | 의제취득일 전 상속·증여 일반건물 파트(`preDeemedParts`) × 축 A | 측정 안 함 |
| V-3 | 결과 카드(`BurdenedGiftDetailCard`) — 지분 모드 12억 판정 분모 행(`fractionalHighValueDenominator`, `:118-122`)이 비주택 일반건물에서 뜨는지 · 증여세 블록 유무 · 지분 표기 | 응답 명세만 봤다. 렌더 측정은 구현 PR(Playwright) |
| V-4 | 토지·건물 분리 취득일(`burdenedGiftSplitParts`) × 축 A 값 | 측정 안 함 |
| V-5 | 시가 모드 보충 승 · 양도일 2023.2.28. 전(담보 승 괄호 미열거 시기)(PR #2975 V-S1f) | 측정 안 함 |
| V-6 | 다건(multi) 경로의 일반건물 축 A | 측정 안 함 |
| V-7 | 함께 양도에서 채무 재배분(`assumedDebtOverride`)과 지분 축소의 결합 — 균일 승자 묶음 합 = 단건 합 오라클이 담보·임대·시가 담보에서 모두 성립하는지 | 3칸(기준시가 담보·임대·시가 담보)은 0 차이. 혼합 승자는 ⑧이 막는다 |
| V-8 | 지분 모드 12억 분모가 일반건물 세액 경로에서 쓰이는지(`transfer-tax-burdened-gift-step.ts:250`은 일반 단건 단계) | 일반건물은 그 단계를 타지 않는 것으로 보이나 읽기만 했다 |
| V-9 | 양도차익이 아니라 **결정세액** 대조 | 이번 격자는 양도차익만 대조 |

## 8. 재현

- 측정 코드(저장소 밖): scratchpad `keep/probe-vs1b.test.ts`(격자) · `keep/probe-vs1d.test.ts`(승자 갈림 + 초과부담부) — 이 PR에는 넣지 않는다. 프로토타입 diff: scratchpad `gbA-prototype.diff`.
- 실행: 측정 코드를 `__tests__/probe/`에 두고 `PROBE_OUT=<경로> npx vitest run __tests__/probe/<파일>`. 격자 틀은 `__tests__/api/transfer.route.bg-axis-a-nonsupp-win.anchor.test.ts`.
- 부하가 40~60이면 pre-push가 무관한 파일에서 시간 초과로 실패한다 — 푸시 전 `sysctl -n vm.loadavg` 확인.

## 9. 구현 결과 (2026-11-08, 결정 Q-1~Q-4 모두 a)

| 항목 | 결과 |
|---|---|
| 코드 | `general-building-route-helper.ts` 단건 실가 분기에 `burdenedGiftOwnershipRatio: ownershipRatio`(부담부증여일 때만) · `general-building-part-cards.ts` 컴패니언 `bgInfo ? src.ownershipRatio : undefined` — 2줄 + 주석 |
| anchor | `__tests__/api/transfer.route.gb-axis-a-bg-ratio.anchor.test.ts` 13건. **수정 전 10 실패 · 3 통과**(불변 대조 3건), 실패값이 §2와 같다(339,500,000 · 62,545,456 · 525,000,000 · 218,250,000 · 291,000,000 · 488,000,000 · 1,527,500,000 · 225,090,912 · 1,713,000,000). 수정 후 13/13 |
| 뮤테이션 | M1 단건 줄 제거 → 7건 사망(GA-1 3 · GA-2 4) · M2 컴패니언 줄 제거 → 3건(GA-3) · M3 컴패니언 비율 1 → 3건(GA-3). 단건·컴패니언 경로가 서로 분리되어 죽는다. 매번 `cmp`로 복원 확인 |
| 회귀 | api 467파일/6,073 · lib 262/3,356 · components 743/6,848 · calc 815/11,437 · tax-engine 1,495/18,889 — 전부 통과(`__tests__/lib` 포함) |
| 정적 검사 | `tsc` 0건 · eslint 오류 0건(경고 4건은 이번에 건드리지 않은 `general-building-route-helper.ts`의 기존 미사용 import) |
| Playwright | `e2e/gb-axis-a-bg-ownership-ratio.spec.ts` 2건 통과. 단건 줄을 뺀 뮤테이션에서 GA-E1 사망(화면에 339,500,000 · 증여세 4,850,000 블록). 수정 후 스크린샷: 채무비율 100% · 취득가액 2억 · 개산공제 600만 · 양도차익 494,000,000 · 무상이전분 0 · **증여세 블록 없음** |
| 문서 정정 | `gb-burdened-gift-silent-drop.plan.md` 서술 3곳(축 A 한계 · §10 V-5 · §14.7)을 «값이 바뀐다, 수정함»으로 정정 |

**남은 것(이 PR 범위 밖):** Q-2 이월과세·의제취득일 전·분리 취득일 × 축 A 측정(V-1·V-2·V-4) · Q-3 ⑧ 게이트에 일반건물 열기(별도 계획) · Q-4 ⑫ 초과부담부 가드(별도 계획).
