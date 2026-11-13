# 부담부증여 지분 재개발 완공 아파트 × 시가 · 환산취득가액(K-5) · 담보 승 — 전면 개방 (Q-1 b)

- 상태: **Q-1 a · Q-2 a · Q-3 a 확정(2026-11-13 사용자: 권장안)** · PR-1(⑫ 지분 축소) 진행 · PR-2(축 전달 · 게이트) 대기. 작성 2026-11-13, 기준 master `b1f2140c5`.
- 선행: `bg-redev-fractional-collateral-win.plan.md`(V-S1g) §4 Q-1 b · §5 V-G9 · §7 「범위 밖」. 그 문서는 Q-1 a(부분 개방)로 닫았고, 이 문서가 남겨 둔 조합을 연다.
- 표기: **[직접]** = 이 문서를 쓰면서 직접 실행하고 대조함. **[코드]** = 코드만 읽음. **확인 필요** = 측정하지 않았거나 원인을 밝히지 못함.

## 0. 결론

| 질문 | 답 |
|---|---|
| 지금 막혀 있는 조합 | 재개발 완공 아파트 · 원조합원(승계 제외) · 부담부증여 · 시가 모드 · 환산취득가액(K-5) · 담보(상증법 §66) 승 · **지분 보유**(축 A 단건 · 축 B · 함께 양도의 지분 자산). ⑧이 `bgRedevMarketConvertedFractional`로 막고 «실지취득가액을 고르세요»라고 안내한다 |
| 엔진 값은 맞는가 | **맞다.** 청산금 납부·수령·토지 출자 × 3모양 = 9칸이 모두 같은 시나리오 단건(오라클)과 일치한다. 현행에서도, 아래 수정을 임시로 넣은 상태에서도 같다 [직접] |
| 축만 넣으면 되는가 | **안 된다. ⑫에 막다른 길이 하나 더 있다.** 두 leaf에 축을 넣으면 ⑤·⑧은 «취득시 기준시가»로 정리되고 §166③ 칸을 요구하지 않는다. 그런데 ⑫ `refineRedevelopment166_3Inputs`가 승자를 **지분 축소 없이** 판정해(지분 담보 승 → 보충 승으로 읽음) §166③ 칸을 계속 요구한다. 그래서 §166③ 칸을 비우면 ⑧ 0건 → ⑫ 400이 된다(9/9칸) [직접] |
| 고치면 정합하는가 | ⑫ refine에 엔진과 같은 지분 축소(`scaleBurdenedGiftInfo(info, ownershipRatio)`)를 넣으면 27칸 전부 정합한다. 취득시 기준시가를 채우면 9/9 일치. 비우면 ⑧ 차단 ∧ ⑫ 400(⑧ ⊇ ⑫). §166③ 칸을 비우면 ⑧ 0건 ∧ ⑫ 200 ∧ 값 동일. 대조로 잰 K-5 보충 승 9칸은 값이 변하지 않는다 [직접] |
| 규모 | 중간 규모. 축 인자를 받는 함수 6개(leaf 2 + 래퍼 4)와 호출처 약 20곳, ⑫ refine 1곳, 게이트 1줄, ⑧ 문구 정리, 단언이 뒤집히는 기존 테스트 4파일 + E2E 1건 (§3) |

## 1. 측정 [직접]

### 1.1 방법

- 화면 경로 그대로: 폼 → ⑧(`collectStepIssues` 0~5단계) → ④(`captureBody`) → ⑫~⑭(route POST). 헬퍼와 시료는 기존 anchor(`__tests__/api/transfer.route.bg-redev-fractional-win.anchor.test.ts` 1~91행)를 그대로 가져왔다. 양도시 기준시가 8억 · 취득시 기준시가 4억 · 시가 10억 · K-5 §166③ 칸(인가일 개별주택공시가격 3억 · 취득당시 1.5억 · 토지 출자는 토지 칸) · 양도일 2026-02-16.
- 모양: A = 축 A 50% 단건(채무 7억) · B = 축 B 60/40(물건 전체 채무 14억) · C = 함께 양도 100%(채무 16억) + 50%(채무 7억).
- 오라클: 같은 시나리오 단건이다. A는 반 크기 단건(K-5 · 채무 7억), B는 100% 단건(채무 14억), C는 단건 100% + 반 크기 단건의 합이다. 단독 100% K-5 담보 승은 현행에서도 정합하게 계산된다(V-S1g §3.3 대조).
- 칸 상태 3가지: `filled`(전부 채움) · `stdBlank`(취득시 기준시가 `standardPriceAtAcq` 비움) · `sec166Blank`(§166③ 칸 4개 비움). 대조로 `suppWin`(K-5 보충 승: 채무 3억·6억·3억)을 함께 쟀다.
- 실행은 3회다: ① 현행 → ② leaf 축 전달 임시 패치 → ③ ②에 ⑫ 지분 축소를 더한 임시 패치. 패치는 `git checkout -- lib`로 되돌렸고 `git status`가 깨끗한 것을 확인했다. 측정 코드와 결과 원본은 저장소 밖에 있다(§6).

### 1.2 결과

| 칸 상태 | ① 현행 | ② leaf 축만 | ③ leaf 축 + ⑫ 지분 축소 |
|---|---|---|---|
| filled (9) | ⑧ 1~2건(게이트 차단) · ⑫ 200 · **9/9 일치** | ⑧ 0 · ⑫ 200 · 9/9 일치 | ⑧ 0 · ⑫ 200 · **9/9 일치** |
| stdBlank (9) | ⑧ 차단(게이트) · ⑫ 400(취득시 기준시가) | ⑧ `standardPriceAtAcq` 차단 · ⑫ 400 | 같음 — **⑧ ⊇ ⑫** |
| sec166Blank (9) | ⑧ 차단(게이트) · ⑫ 400(§166③ 분모) | **⑧ 0 · ⑫ 400 — 막다른 길** | ⑧ 0 · ⑫ 200 · 값 = filled |
| suppWin (9, 대조) | ⑧ 0 · ⑫ 200 | 같음 | 같음 — 9칸 값 불변(①과 비교) |

- 일치한 값: 납부 · 토지 출자는 A 447,609,250 · B 895,218,500 · C 1,542,827,750, 수령은 A 509,000,001 · B 1,018,000,000 · C 1,727,000,001.
- 현행 ①의 숨은 사실: 이 조합은 ⑧을 통과하더라도 **칸 두 벌을 모두 채워야** 200이 된다. ④가 `useEstimatedAcquisition: true`를 보내 ⑫가 §166③ 칸을 요구하고(`transfer-tax-api.ts:399`), 엔진은 담보 승이라 §166③ 값을 쓰지 않고 취득시 기준시가를 요구한다. 지금은 ⑧ 게이트가 이 모순을 가리고 있다.
- ⑫ 원인 [코드]: `lib/api/transfer-tax-schema-redev-166-3-refines.ts:78-88`의 `bgConverted`는 `computeSangjeungbeopValuation(…, info)`를 **축소하지 않은 info**로 부른다. 엔진은 `scaleBurdenedGiftInfo(info, ownershipRatio)`로 시가를 지분분으로 줄인 다음 비교한다(`transfer-tax-burdened-gift-step.ts:71-77`). 같은 ⑫ 안의 `collateralForcesStdAcquisition`(`transfer-tax-schema-collateral-win.ts:47-62`)는 이미 축소해서 비교한다. 축소하면 시가만 작아지므로 «보충 → 담보» 방향으로만 판정이 바뀐다. 단독 소유(비율 1 또는 미지정)는 바뀌지 않는다.

## 2. 호출처 — 축이 필요한 곳 (V-G9 해소) [코드]

축을 넣을 곳은 `redevPreApprovalAcqMode`(`lib/calc/redev-pre-approval-acq-mode.ts:46`)와 `redevPreApprovalExpensesUnused`(`:101`)의 `bgCollateralForcesStdAcq(asset)` 두 줄이다(`:58`, `:115`). 두 leaf 모두 같은 파일 안에서 4번 다시 불린다(`:106`, `:110`, `:112`, `:137`). 아래 **축 무관** 표시는 부담부증여 갈래가 그 값을 돌려주지 않거나, 지분이면 게이트 밖이라 축이 결과를 바꾸지 못하는 경우다.

### 2.1 `redevPreApprovalAcqMode` — 외부 12곳

| # | 호출처 | 비교 | 축 출처 | 조치 |
|---|---|---|---|---|
| 1 | `transfer-tax-validate-acquisition.ts:322` | `=== "carryover_donor"` | — | 축 무관(부담부증여 갈래는 `estimated`·`burdened_gift`만 돌려줌) |
| 2 | `burdened-gift-acq-std-price.ts:83` | `=== "estimated"` | 인자 `isFractionalSplit` 있음 | 넘김 |
| 3 | `redev-phd-trigger.ts:58` (`isRedevPhdTriggered`) | `!== "estimated"` | 없음 | 래퍼에 인자 추가 → §2.3 |
| 4 | `transfer-tax-api.ts:399` | `=== "estimated"` | `fractionalBundleMerge`(`:125`) | 넘김 |
| 5 | `transfer-tax-validate-redev.ts:72` | `acqMode` | 없음. 호출자 `validate-acquisition.ts:311`에 `isFractionalSplitAxis` 있음 | 인자 추가 |
| 6 | `transfer-pre1990-redev-bridge.ts:36` (`redevLandSec164Applies`) | `!== "estimated"` | 없음 | 래퍼에 인자 추가 → §2.3 |
| 7 | `transfer-tax-validate-clause-a.ts:173` | `!== "actual"` | — | 축 무관(부담부증여 갈래는 `actual`을 돌려주지 않음) |
| 8 | `transfer-tax-validate-bg.ts:458` | `=== "estimated"` | `isFractionalSplitAxis` 있음 | 넘김 |
| 9 | `transfer-tax-api-companion-payload.ts:629` | `isBgPreDeemedAsset ∧ …` | — | 축 무관(의제취득일 전 지분은 게이트 밖 → `bgCollateralForcesStdAcq` = false) |
| 10 | `BurdenedGiftBlock.tsx:446` | `=== "estimated"` | prop `isFractionalSplit` 있음 | 넘김 |
| 11 | `RedevelopmentValuationSection.tsx:43` | `acqMode` | 없음. 부모 `RedevelopmentBlock.tsx:622` | prop 추가 |
| 12 | `RedevelopmentBlock.tsx:127` | `redevAcqMode` | 없음. 부모 `AssetSectionAcquisition.tsx:367`에 `splitMode` 있음 | prop 추가 |

### 2.2 `redevPreApprovalExpensesUnused` — 외부 6곳

| # | 호출처 | 축 출처 | 조치 |
|---|---|---|---|
| 1 | `lib/stores/transfer-per-asset-summary.ts:592` | `formData`(`:171` `axisBBundle`) | 넘김 |
| 2 | `transfer-tax-api-redev.ts:123` (`buildRedevelopmentPayload`, 청산금 수령 단독 신고만) | 없음 → §2.3 | 빌더 인자 추가 |
| 3 | `redev-legacy-expense-unused.ts:28` | 없음. 호출자 `validate-acquisition.ts:346` · `AssetSectionExpense.tsx:267`에 축 있음 | 인자 추가 |
| 4·5 | `RedevelopmentBlock.tsx:450`·`:467` | §2.1 #12와 같은 prop | 넘김 |
| 6 | `AssetSectionExpense.tsx:98` | prop `isFractionalSplit` 있음 | 넘김 |

### 2.3 축을 가지지 않은 래퍼와 그 호출처

| 래퍼 | 호출처 |
|---|---|
| `isRedevPhdTriggered` | `transfer-tax-api-redev.ts:97` · `transfer-tax-validate-redev.ts:493` · `transfer-pre1990-redev-bridge.ts:39` · `RedevelopmentValuationSection.tsx:58`·`:200` · 같은 파일 `:121` |
| `redevLandSec164Applies` | `transfer-tax-validate-redev.ts:292`·`:505` · 같은 파일 `:44` · `RedevLandSec164Input.tsx:30` |
| `buildRedevelopmentPayload` | `transfer-tax-api-primary-context.ts:205`(form 있음) · `transfer-tax-api-companion-payload.ts:495` · `transfer-tax-validate-redev.ts:214` · `rental-residence-requirement-status.ts:75` |

- 이 경로가 결과를 바꾸는 시료는 §1에 **없다.** 시료 취득일이 2015-01-01이라 §164⑦(최초 공시일 전 취득)과 §164④(1990.8.30. 전 토지)가 발동하지 않는다. 축 없는 호출이 남으면 이 변형에서 «⑤ 숨김 ↔ ⑧·⑫ 요구»가 갈릴 수 있다 → V-1·V-2.

## 3. 바꿀 것 (Q-1 a · Q-2 a · Q-3 a 기준)

1. **leaf 2개**: `redevPreApprovalAcqMode`와 `redevPreApprovalExpensesUnused`에 선택 인자 `isFractionalSplit?: boolean`를 추가하고, 파일 안 재호출 4곳까지 그대로 넘긴다. 미지정이면 종전처럼 동작한다(`bgCollateralForcesStdAcq` 3상태 규약).
2. **래퍼 4개**(`isRedevPhdTriggered` · `redevLandSec164Applies` · `buildRedevelopmentPayload` · `validateRedevelopmentAsset`)와 `redevLegacyExpenseUnusedMessage`·`redevLegacyExpenseUnused`에 같은 인자를 추가하고, §2의 «넘김» 호출처를 모두 바꾼다.
3. **⑫** `refineRedevelopment166_3Inputs`: `bgConverted` 판정을 `scaleBurdenedGiftInfo(info, data.ownershipRatio)`로 한다. 타입 `Redev166_3Like`에 `ownershipRatio?: number`를 추가한다. 주 자산과 컴패니언 모두 본문에 `ownershipRatio`가 실린다(§1.2 ③ C 모양의 컴패니언 50%가 200을 받음). 이 수정만으로도 직접 API에서 «엔진이 쓰지 않는 §166③ 칸 요구 400»이 풀린다.
4. **게이트**: `bgFractionalCollateralKindSupported`에서 `!bgRedevMarketConvertedFractional(asset)`를 뺀다. `bgRedevMarketConvertedFractional`과 `bgRedevConvertedBlockNote`는 호출처가 없어지면 지운다(⑧ 문구 3곳: `transfer-tax-validate-bg.ts:340`·`:522`, `burdened-gift-collateral-win.ts:164`). 게이트·`BG_FRACTIONAL_SCOPE_TEXT` 주석에서 «K-5 제외»를 지운다.
5. **Q-3 a일 때**: `redevPreApprovalExpensesWinnerDependent`와 그 안내 문장을 지운다. 축이 들어가면 K-4 담보 승 지분은 칸이 숨고 개산공제 안내가 뜬다(단독 100%와 같은 규칙). 보충 승은 칸이 보인다.
6. **테스트**:
   - anchor 신규: 27칸(§1.2 ③)과 보충 승 9칸 안전망.
   - 뒤집히는 기존 단언: `bg-redev-fractional-win.anchor` RD-3 전체 · RD-5 게이트 단언, `bg-axis-a-nonsupp-win.anchor`(K-5 차단 문구), `components/redev-fractional-expense-winner-note.anchor`(Q-3 a면 삭제 또는 반전), E2E `bg-redev-fractional-win.spec.ts` RD-E3.
   - ⑤ 렌더 anchor(jsdom): 축 A·B에서 취득시 기준시가 카드는 있고 §166③ D 칸은 없음.
   - 뮤테이션: 축 인자 제거 · ⑫ 축소 제거 · 게이트 K-5 제외 복원.
7. **완료 게이트**: `grep -rn 'redevPreApprovalAcqMode(\|redevPreApprovalExpensesUnused(\|isRedevPhdTriggered(\|redevLandSec164Applies(\|buildRedevelopmentPayload('` 결과의 모든 줄이 «축 넘김» 아니면 §2의 «축 무관»으로 분류되어야 한다(memory `feedback_axisless_predicate_call_hides_dead_end_when_gate_opens`).

파일 크기: `transfer-tax-api.ts` 744줄 · `transfer-tax-validate-bg.ts` 697줄 · `transfer-tax-validate-acquisition.ts` 691줄 · `transfer-tax-validate-redev.ts` 672줄 · `RedevelopmentBlock.tsx` 646줄. 모두 1~3줄만 바뀌므로 800줄을 넘지 않는다.

## 4. 결정

**Q-1. 축을 어떻게 전달하는가 — ✅ a 확정**
- (a) **권장 — 선택 인자.** 위 §3의 1·2단계다. `bgCollateralForcesStdAcq`·`needsBgAcqStdPriceInput` 등 이미 있는 축 함수와 같은 규약이라 읽는 사람이 새로 배울 것이 없다. 단점은 호출처가 약 20곳이라는 것이고, 하나라도 빠지면 그 변형에서 막다른 길이 남는다. §3-7 grep 게이트로 막는다.
- (b) 자산 사본에 축을 싣기. 폼 단위에서 `{ ...asset, __splitAxis }`를 만들어 leaf가 읽게 한다. 호출처 수정은 적지만 저장 상태에 없는 숨은 필드가 생기고, 사본을 거치지 않은 경로는 조용히 «축 미지정»이 된다. 권장하지 않는다.

**Q-2. ⑫ refine 지분 축소 — PR을 나누는가 — ✅ a 확정**
- (a) **권장 — PR-1을 따로 둔다.** ⑫만 고치는 PR(§3-3 + 직접 API anchor)을 먼저 낸다. 게이트와 무관하게 지금도 직접 API로 도달하는 400을 푸는 수정이고(엔진이 쓰지 않는 칸 요구), 엔진 값은 바뀌지 않는다. 그 뒤 PR-2에서 축 전달과 게이트를 연다.
- (b) 한 PR로 묶는다. 리뷰 단위는 커지지만 PR 고정비(pre-push·CI)는 한 번만 든다.

**Q-3. «인가전 분 필요경비» 칸 안내(V-S1g Q-2 b)를 어떻게 하는가 — ✅ a 확정** — 축이 들어오면 V-S1g Q-2 a가 가능해진다.
- (a) **권장 — 승자에 따라 칸을 숨긴다**(단독 100%와 같은 규칙). `redevPreApprovalExpensesWinnerDependent`와 안내 문장을 지운다. V-S1g §3.4에서 담보 승은 0원과 2천만 원의 값이 같았고(칸이 쓰이지 않음), 보충 승은 −6,000,000이 차감되어 칸이 필요했다.
- (b) 칸은 두고 안내는 그대로 둔다. 축이 생긴 뒤에도 쓰이지 않는 칸이 보이는 상태가 남는다.

## 5. 미검증 · 확인 필요

| ID | 내용 | 언제 |
|---|---|---|
| V-1 | §164⑦ 발동(취득일 < 최초 공시일) × K-5 × 지분 담보 승 — `isRedevPhdTriggered`를 축 없이 부르는 곳이 남으면 ⑤·⑧·④가 갈리는가 | PR-2 착수 직후, 코드 수정 전 측정 |
| V-2 | §164④(종전 토지 취득일 < 1990.8.30.) × 토지 출자 × K-5 × 지분 담보 승 — `redevLandSec164Applies` 같은 위험 | 위와 같음 |
| V-3 | 청산금 수령분 단독 신고(`redevReceiveOnlyMode`) × 지분 담보 승(V-S1g V-G10) — `buildRedevelopmentPayload:123` | 위와 같음 |
| V-4 | ⑤ 화면(jsdom·Playwright) — 축 A·B·C에서 취득시 기준시가 카드와 §166③ 칸 표시. §1은 술어만 쟀다 | PR-2 |
| V-5 | 사이드바(`transfer-per-asset-summary.ts:592`) 계산 전 필요경비 «계산 후 표시»가 축에 따라 바뀌는가 | PR-2 |
| V-6 | 안분(인가 전·후) 뒤 최종 양도차익 손계산 — V-S1g V-G7과 같은 한계. 이번에도 단건 오라클로만 대조했다 | 남은 한계 |
| V-G8 | 청산금 수령 축 B ±1~3원(V-S1g) — 이번 시료의 수령 B는 1,018,000,000 = 오라클 | 게이트와 무관 |

## 6. 재현

- 측정 코드와 결과 원본은 저장소에 두지 않았다(throwaway). 작성 세션 scratchpad의 `probe/zz-probe-redevk5.test.ts`, `before.json`(① 현행), `after.json`(② leaf 축만), `after2.json`(③ ⑫ 축소 추가), `temp-patch2.diff`(임시 패치 전문)에 있다.
- 실행 방법: 테스트를 `__tests__/api/`에 임시로 복사하고 `PROBE_OUT=<경로> npx vitest run …`을 실행한다. ②·③은 `git apply temp-patch2.diff`(③), ②는 그중 `lib/api` 파일만 빼고 적용한다.

## 7. PR-1 결과 — ⑫ 지분 축소 (Q-2 a, 2026-11-13)

| 항목 | 결과 |
|---|---|
| 코드 | `lib/api/transfer-tax-schema-redev-166-3-refines.ts` — `bgConverted` 승자 판정을 `scaleBurdenedGiftInfo(info, data.ownershipRatio)`로 한다. 타입에 `ownershipRatio?` 추가. 주 자산(`transfer-tax-schema-refines.ts:465`)과 컴패니언(`transfer-tax-schema.ts:214`) 모두 본문의 `ownershipRatio`를 읽는다 |
| anchor | 신규 `__tests__/api/transfer.route.bg-redev-fractional-166-3-scale.anchor.test.ts` 15건 — **수정 전 9 실패 · 6 통과**. K5S-1 축 A·B × 3시나리오(직접 API 본문 = ④ 본문 + 주 자산 `useEstimatedAcquisition: false`) · K5S-2 함께 양도 50% 컴패니언(④ 본문 그대로) — §166③ 칸을 비워도 200이고 단건 오라클과 같다. K5S-3 안전망(불변): 지분 보충 승은 400 · 단독 100% 담보 승은 200 |
| 뮤테이션 | 축소 제거(= 수정 전) → 9건 사망 |
| 회귀 | 필터 `redev · 166-3 · 166_3 · bg-redev · bg-axis · bg-fractional · collateral` 254파일 3,139건 통과 · 전체는 pre-push |
| 정적 검사 | `tsc` 0건 · eslint 0건 |
| 화면 경로 | 바뀌지 않는다. ⑧ 게이트가 그대로 막고 있고, ④가 주 자산에 `useEstimatedAcquisition: true`를 보내 ⑫가 §166③ 칸을 요구한다(축 없는 `redevPreApprovalAcqMode` — `transfer-tax-api.ts:399`). 둘 다 PR-2에서 고친다 |
