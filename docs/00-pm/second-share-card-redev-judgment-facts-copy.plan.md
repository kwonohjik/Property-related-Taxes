# 같은 물건 지분 둘째 카드 — 입주권 판정 선언 6필드를 첫 카드 값으로 복사 (계획서 v0.2)

- 작성: 2026-10-18 · base `origin/master` fa20cd4b3
- 출처: 1주택 코드 리뷰 별건 8건 재분류(2026-10-18) 중 ④ — 「같은 물건 지분 둘째 카드 선언 입력 경로 없음」(#13, 2026-10-12 남김)
- 사용자 결정(2026-10-18): **판정 메뉴 확장이 아니라 첫 카드 값 복사 방식**으로 고친다. Q-1 = **(b) 복사 + 지분 취득일이 다르면 확인 필요 고지**.

## 1. 결함

축 B(1인이 같은 물건을 지분으로 나눠 취득 — 「같은 물건 지분 분할」)의 원조합원 **조합원입주권** 양도에서,
둘째 이후 지분 카드는 §89①4호 판정 선언을 받을 곳이 없다. 그 카드는 자기 칸의 **빈 값**을 엔진에 보내고,
엔진은 그 카드만 1세대1입주권 비과세를 불성립으로 판정한다. **오류도 고지도 없다.**

### 1.1 실측 (워크트리 probe, mock 세율 — 과세 여부와 비율만 의미 있음)

입주권 50%+50%, 인가일 2022-03-01, 첫 카드 「인가일 요건 충족」 선언, 청산금 카드별 25,000,000.

| 양도가액 | 둘째 카드 상태 | 카드 0 | 카드 1 | 합계 세액 |
|---|---|---|---|---|
| 10억 | **빈 값(현행 화면이 만드는 상태)** | 비과세 · 0 | 비과세 없음 · 57,010,000 | **62,711,000** |
| 10억 | 첫 카드 값 복사 | 비과세 · 0 | 비과세 · 0 | **0** |
| 20억 | 빈 값 | 고가 안분 · 77,150,000 | 안분 없음 · 259,110,000 | **404,217,000** |
| 20억 | 첫 카드 값 복사 | 고가 안분 · 77,150,000 | 고가 안분 · 77,150,000 | **197,703,000** |
| 10억·20억 | 첫 카드 「미충족」 | 두 카드 모두 과세 | | 150,766,000 · 624,178,500(빈 값·복사 같음) |

복사 결과는 기존 #11 anchor(`__tests__/calc/one-right-shared-ownership-high-value-11.anchor.test.ts`, 축 B 50+50 · 20억 → 두 카드 비율 0.4,
10억 → 두 카드 전액 비과세)와 같다. 그 anchor가 통과하는 것은 둘째 카드를 **`{ ...a0 }`로 복사해 만들기 때문**이다(`:156`) —
실제 화면이 만드는 카드(빈 값)와 다르다. ⇒ 지금 안전망은 이 결함을 가린다([[feedback_fixture_default_masks_gate_defect]]).

### 1.2 원인 (file:line)

| 단계 | 사실 |
|---|---|
| 카드 생성 | 지분 토글이 둘째 카드를 `makeDefaultAsset(2)`로 만든다 — `app/calc/transfer-tax/steps/Step1.tsx:131`. 6필드 기본값은 전부 `""` — `lib/stores/calc-wizard-asset-factory.ts:556,565,571-574` |
| 입력 경로 | 6필드의 편집 위젯은 판정 메뉴에만 있고(`app/calc/one-house-exemption/steps/Step3.tsx:385-391` `RedevelopmentRightExemptionSection`), 판정 메뉴는 **`assets[0]`만** 다룬다(`Step3.tsx:62,66-68`). 계산기는 입주권이면 읽기 전용 요약만 보여 준다(`components/calc/transfer/RedevelopmentBlock.tsx:154` `ImportedRedevRightFactsCard`) |
| ④ 병합 | 축 B 둘째 카드는 `mergePrimaryBasic(a, primary)`로 물건 단위 값을 첫 카드에서 받는다(`lib/calc/transfer-tax-api-bundled.ts:72`). 그러나 병합 목록(`lib/calc/transfer-tax-api-helpers.ts:139-216`)에 6필드가 없다 |
| ⑬ 전송 | 둘째 카드 `redevelopment` 서브객체는 그 카드 자기 칸을 읽는다 — `lib/calc/transfer-tax-api-companion-payload.ts:402-403` → `lib/calc/transfer-tax-api-redev.ts:170-233` |
| 엔진 | `exemptionEligibleAtApproval !== true`이면 §89①4호 불성립 — `lib/tax-engine/transfer-tax-redevelopment-transforms.ts:239` |

### 1.3 대상 6필드 (판정 메뉴만 받는 §89①4호 사실)

| 필드 | 의미 | 엔진 사용 |
|---|---|---|
| `redevExemptionEligibleAtApproval` | 인가일 현재 §89①3호 가목 기존주택 요건 충족 자기선언 | 비과세·고가 안분·표2 강등(`transforms.ts:239`, `redevelopment-lthd.ts:60,90`) |
| `redevLandHouseholdOwnedBuilding` | 토지 출자 입주권 — 같은 세대가 건물 소유(#13, §89①4호 본문) | `transfer-tax-redevelopment-land-right.ts` |
| `redevOtherHouseAcquisitionDate` | §89①4호 나목 — 그 1주택 취득일 | 나목 판정 |
| `redevOtherHouseDisposalDelayReason` | 나목 괄호 — 영 §155⑱ 사유 | 나목 판정 |
| `redevPriorHouseHoldingMonths` | 인가일 기준 종전주택 보유월수 | **엔진 계산에 미사용**(UI 경고 카드용 — `transfer-tax-api-redev.ts:222-223`) |
| `redevPriorHouseResidenceMonths` | 인가일 기준 종전주택 거주월수 | 표2 거주분 등 |

`ImportedRedevRightSlice`(`components/calc/transfer/ImportedRedevRightFactsCard.tsx:32`)는 위 6 + `redevOriginalAssetType` 7키다.
**`redevOriginalAssetType`은 제외한다** — 계산기에도 카드별 입력 칸이 있다(`RedevelopmentBlock.tsx` ② 「출자 자산」 라디오).

## 2. 설계

### 2.1 단일 leaf

`lib/calc/` 에 순수 함수 하나를 둔다(이름 예: `inheritedRightJudgmentFacts(companion, primary)`):

```
복사 조건(AND)
  ① primary.assetKind === "right_to_move_in"       — 판정 메뉴가 이 6필드를 소유하는 축(one-house-exemption-api.ts:343)
  ② !isSuccessorRightTransfer(primary)             — 승계조합원은 §166·§89①4호 가목 경로가 아니다
  ③ !isSuccessorRightTransfer(companion)           — 그 지분이 승계 취득분이면 「인가일 현재 기존주택 소유」 선언을 옮기지 않는다
조건 성립 → primary의 6필드를 그대로 반환 / 불성립 → {} (현행 그대로)
```

호출부 두 곳이 이 leaf 하나를 쓴다:

1. **`mergePrimaryBasic`**(`transfer-tax-api-helpers.ts:139`)의 반환에 spread. ⇒ ④(`transfer-tax-api-bundled.ts:72`)와
   ⑧(`lib/calc/transfer-tax-validate.ts:405`)이 함께 따라온다. 다른 호출부(`transfer-tax-api-gb-shares.ts:101`,
   `components/calc/transfer/BurdenedGiftTrancheBasisBlock.tsx:33`)는 일반건물·부담부증여 경로라 ①이 거짓 → 무변경.
2. **`CompanionAssetCard`의 `acquisitionAsset`**(`components/calc/transfer/CompanionAssetCard.tsx:153`)에도 같은 leaf를 덮는다.
   ⇒ 둘째 카드의 읽기 전용 요약(`ImportedRedevRightFactsCard`)이 **엔진이 쓰는 값**을 보여 준다(지금은 빈 값을 보여 준다).
   그 컴포넌트 주석(`:139-152`)의 「`assetKind`만 덮는다 — 더 넘기면 ③의 `onChange`가 물건 단위 값을 지분 카드에서 편집하는
   경로를 연다」 우려는 이 6필드에 해당하지 않는다: 입주권이면 계산기에 6필드 편집 위젯이 없다
   (`ExemptionAtApprovalCard`는 `!isRightSubject`일 때만 — `RedevelopmentBlock.tsx:284-294`, 거주 분할은 `:544-545`).

### 2.2 왜 입주권으로 한정하나 — 완공APT는 카드별 입력이다

`redevelopment_apt`(완공 신축주택 양도)에서는 같은 이름의 필드 중 둘이 **계산기 카드마다 편집**된다:
`redevExemptionEligibleAtApproval`(`ExemptionAtApprovalCard`, `RedevelopmentBlock.tsx:294`)·
`redevPriorHouseResidenceMonths`(`RedevelopmentResidenceSplitSection`, `:545` → 그 파일 `:114,171`).
완공APT까지 복사하면 **둘째 카드 화면이 보여 주는 값과 엔진 값이 갈린다**. 조건 ①이 그것을 막는다
(판정 메뉴 소유 축도 `assetKind === "right_to_move_in"` — `lib/calc/redev-field-scope.ts:52-62`의 `exemptionAtApprovalInScope`와 같은 축).

### 2.3 둘째 카드에 남아 있던 자기 값

예전 이력·다른 모드에서 넘어온 둘째 카드가 6필드에 자기 값을 갖고 있으면, 복사 조건이 성립할 때 **첫 카드 값이 이긴다**.
`mergePrimaryBasic`의 다른 물건 단위 값(소재지·부담부증여 채무 등)과 같은 규약이다. 둘째 카드 자기 값은 지우지 않는다(저장값 불변 —
지분 모드를 끄면 종전대로).

### 2.4 Q-1 (b) 고지 — 다건 엔진 자산별 경고 승격 지점

복사는 클라이언트(④)에서 일어나지만, 「둘째 지분 취득일이 첫 지분과 다르다」는 **축 B 지분 카드 전부를 함께 보는 층**에서만 판정된다.
단건 엔진은 자기 자산 하나만 받는다. ⇒ 다건 엔진이 자산별 단건 결과를 받는 지점
(`lib/tax-engine/transfer-tax-aggregate-asset-records.ts:159` 자산별 경고 승격)에서, 기존 공유지분 고지 모듈
(`lib/tax-engine/transfer-tax-redevelopment-shared-ownership.ts`)에 둔 순수 함수로 붙인다.

조건(AND): 그 항목이 `soleSplitAcquisition === true`(route가 축 B에서만 붙인다 — `app/api/calc/transfer/route.ts:477`) ·
자산 index ≥ 1 · `redevelopment.subject === "right"` · `exemptionEligibleAtApproval === true` ·
단건 결과가 §89①4호 비과세 또는 고가 안분을 적용함(`oneRightExemptionApplied`·`oneRightHighValueApplied` — 선언이 결론에 쓰였을 때만) ·
그 항목 취득일 ≠ 첫 항목 취득일. 세액 불변, 자산 라벨을 붙여 집계 경고에 싣는다(같은 지점의 기존 규약).

## 3. 14 동기화 지점

| 지점 | 변경 |
|---|---|
| ①②③ 폼·initial·normalize | 없음(필드 신설 없음) |
| ④ API 변환 | `mergePrimaryBasic` + leaf |
| ⑤ UI 위젯 | `CompanionAssetCard` `acquisitionAsset` overlay(표시 전용, 입력 위젯 신설 없음) |
| ⑥ 사이드바 | 없음 — 결과 도착 후 엔진값을 읽는지 확인만(V-4) |
| ⑦ 결과 카드 | 없음(엔진 결과 그대로) |
| ⑧ validate | `transfer-tax-validate.ts:405`가 같은 `mergePrimaryBasic`을 써서 자동 정합. 6필드를 둘째 카드에서 따로 검사하는 규칙이 있는지 확인(V-3) |
| ⑨~⑭ Zod·route | 없음 — 컴패니언 `redevelopment` 서브객체는 이미 6필드를 싣는다 |

## 4. 검증 계획

### 4.1 anchor (새 파일, `__tests__/calc/`)

둘째 카드를 **`makeDefaultAsset` 기반**으로 만든다 — `{ ...a0 }` 복사 금지(1.1의 가림 재발 방지).

| ID | 시료 | 기대 |
|---|---|---|
| SC-1 | 입주권 50+50 · 10억 · 첫 카드 「충족」 | 두 카드 모두 비과세, 합계 0 (현행 62,711,000) |
| SC-2 | 같은 · 20억 | 두 카드 모두 고가 안분, 카드별 과세 양도차익 같음, 합계 = #11 anchor 값 (현행 404,217,000) |
| SC-3 | 첫 카드 「미충족」 | 두 카드 모두 과세(복사가 불리 방향도 옮김) |
| SC-4 | 첫 카드 나목 취득일 입력 | 둘째 카드 payload `otherHouseAcquisitionDate` = 첫 카드 값 |
| SC-5 부정 | 완공APT(`redevelopment_apt`) 50+50, 두 카드 인가일 선언이 서로 다름 | 둘째 카드는 자기 값 유지(복사 안 함) |
| SC-6 부정 | 둘째 카드 승계조합원(`isSuccessorRightToMoveIn`) | 복사 안 함 |
| SC-6b 부정 | 첫 카드 승계조합원 · 둘째 카드 비승계 | 복사 안 함 |
| SC-7 부정 | 함께 양도(서로 다른 물건, 축 B 아님) | 복사 안 함 — `fractionalBundleMerge` 거짓 |
| SC-9 고지 | 같은 입주권, 둘째 지분 취득일만 다름 · 10억 | 세액 = SC-1과 같음 · 둘째 지분 라벨로 확인 필요 고지 1건 |
| SC-10 고지 부정 | 취득일 같음 / 첫 카드 「미충족」(10b) / 「충족」이나 다른 주택 보유로 4호 불성립(10c) | 고지 없음 |
| SC-10d 고지 leaf | `soleSplitAcquisition` 없음(함께 양도·단건) | 고지 없음 |
| SC-8 화면 | `CompanionAssetCard` 둘째 카드 렌더 | `ImportedRedevRightFactsCard`가 첫 카드 선언(「충족 선언」)을 표시 |

### 4.2 뮤테이션 (KILLED 확인)

leaf 조건 ①②③ 각각 삭제 · spread 제거(`mergePrimaryBasic`) · overlay 제거(`CompanionAssetCard`) — 6종.
하네스 주의: [[feedback_mutation_harness_cwd_reset_false_killed]] · [[feedback_mutation_probe_git_checkout_destroys_wip]].

### 4.3 회귀

- `npx vitest run __tests__/calc/ __tests__/tax-engine/transfer/` → `npm run check:pre-pr`
- 역방향 grep: 축 B 입주권 픽스처가 둘째 카드에 첫 카드와 **다른** 6필드 값을 넣고 그 값을 단언하는 테스트·E2E가 있는지
  (필드명으로 grep — [[feedback_e2e_reverse_grep_by_field_not_phrase]]). 있으면 그 단언의 의도를 먼저 확인한다.
- 브라우저: 입주권 → 지분 분할 토글 → 둘째 카드 요약 표시 · 계산 → Network body 둘째 자산 `redevelopment.exemptionEligibleAtApproval: true` (Playwright).

## 5. 사용자 결정 (Q)

- **Q-1 지분마다 취득일이 다를 때.** 엔진은 지분 카드를 자산별로 판정하고, 일반 주택 경로는 각 카드의 자기 취득일로 보유기간을 센다.
  입주권 경로의 인가일 요건은 계산이 아니라 **자기선언 하나**라서, 복사하면 늦게 취득한 지분에도 첫 카드 선언이 그대로 적용된다.
  - (a) 복사만 한다.
  - (b) **복사 + 고지 (권고)** — 둘째 카드 취득일이 첫 카드와 다르고 복사된 선언이 「충족」이면, 「지분별 취득일이 달라 인가일 현재 보유요건이
    지분마다 다를 수 있다 — 확인 필요」를 그 카드 결과에 싣는다. 세액 불변.
  - (c) 취득일이 다르면 그 카드에 별도 선언을 요구 — 판정 메뉴 확장이 필요해 이번 결정(복사 방식)과 충돌.
  - 권고 근거: 「모르는 사실은 혜택 불성립 + 확인 필요」 원칙([[feedback_unknown_fact_applies_unfavorably]])과 복사 결정 사이의 절충.
  - ✅ **결정(2026-10-18): (b).** 설계는 §2.4.
    지분 추가 취득분의 보유기간 기산 해석은 확인하지 못했다(V-1).

## 6. 미검증 (V)

- **V-1** 같은 주택 지분을 나눠 취득한 경우 §154① 보유기간(및 §89①4호 인가일 요건)을 지분별 취득일로 세는지 — 해석례 미확보.
  KoreanLaw MCP 국세청 검색 2회(「지분 추가 취득 보유기간 1세대1주택 비과세」·「추가 취득한 지분 보유기간」) 결과 없음. Q-1 (b)의 고지 문구가 여기에 의존.
- **V-2** 둘째 카드가 승계조합원일 때 컴패니언 빌더가 `redevelopment` 서브객체를 만든다(`companion-payload.ts:402` — 승계 제외 없음).
  primary는 승계면 서브객체를 만들지 않는다(`transfer-tax-api-primary-context.ts:37,167-169`). 이 비대칭이 결함인지는 **별건**으로 실측한다(이번 범위 밖, SC-6은 복사 여부만 본다).
- **V-3** ⑧이 둘째 카드의 6필드를 따로 검사하는 규칙 유무 — 지금 확인된 것은 `lib/calc/one-right-na-facts-validate.ts:33`(primary만). 착수 시 grep 전수.
- **V-4** 다건 계산기(단건 폼 임베드)와 사이드바가 같은 `mergePrimaryBasic` 경로를 타는지 — 착수 시 확인.

## 7. 범위 밖

- 판정 메뉴에 카드별 선언 입력 추가(사용자가 복사 방식을 택함).
- `redevOriginalAssetType`(계산기 카드별 입력 유지).
- 완공APT 6필드(카드별 입력이 정상).
- V-2 승계 컴패니언 서브객체 비대칭.

## 8. 실행 순서

1. ✅ Q-1 결정 반영 → 계획서 v0.2
2. anchor SC-1~SC-10 작성 → 현행에서 SC-1~4·SC-8 실패, SC-5~7 통과 확인 (verify: 실패 메시지가 1.1 수치와 일치)
3. leaf + `mergePrimaryBasic` spread → SC-1~7 통과
4. `CompanionAssetCard` overlay → SC-8 통과
5. 고지 leaf + 다건 엔진 배선 → SC-9·SC-10 통과
6. 뮤테이션 6종 KILLED · 역방향 grep · `check:pre-pr` · Playwright 확인
7. 커밋 → PR → CI 롤업 전건 SUCCESS + `headRefOid` 일치 확인 후 머지(`--auto` 금지)

## 9. 실행 결과 (2026-10-18)

- 구현: `lib/calc/sole-split-right-judgment-facts.ts`(leaf) · `mergePrimaryBasic` spread(`transfer-tax-api-helpers.ts`) ·
  `CompanionAssetCard` `acquisitionAsset` overlay · 고지 `soleSplitRightShareDateNotice`(`transfer-tax-redevelopment-shared-ownership.ts`) +
  다건 엔진 배선(`transfer-tax-aggregate-asset-records.ts` 자산별 경고 승격 루프).
- anchor: `__tests__/calc/sole-split-right-judgment-facts-copy.anchor.test.ts` 15건 · `__tests__/components/sole-split-right-judgment-facts-card.anchor.test.tsx` 2건.
  수정 전 실패 5건(SC-1·2·4·4b·9)이 1.1 수치와 일치(SC-9는 고지 0건).
- 뮤테이션 9종 전부 KILLED: 입주권 조건 · 첫 카드 승계 · 둘째 카드 승계 · spread 삭제 · overlay 삭제 · 거주월수 복사 누락 ·
  고지 취득일 비교 · 고지 적용 여부 · 고지 축 B 조건.

### 계획 대비 변경

- **고지 조건 축소.** 계획 §2.4의 `subject === "right"`·`exemptionEligibleAtApproval === true`·「자산 index ≥ 1」을 뺐다.
  뮤테이션에서 셋 다 생존했다 — 비과세·고가 안분 적용(`oneRight*Applied`)은 입주권 + 「충족」 선언 없이는 생기지 않고
  (`transforms.ts:239`), 첫 지분은 자기 자신과 취득일이 같아 빠진다. 겹친 방어라 남은 조건이 이미 막는다.
- **SC-6b 시료 보강.** 첫 카드 승계 시료가 둘째 카드에도 승계 표시를 복사해 「둘째 카드 승계」 조건이 대신 막고 있었다(뮤테이션 생존으로 발견).
  둘째 카드를 비승계로 명시했다.
- **SC-8 부정 짝 보강.** 함께 양도 둘째 카드가 `housing`이면 재개발 블록 자체가 렌더되지 않아 공허하게 통과했다 — 입주권 카드로 바꾸고
  블록 렌더를 함께 단언한다.
