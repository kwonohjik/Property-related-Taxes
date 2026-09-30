# 양도세 계산기 — 조특법 주택 수 제외(§99의4·§98의9·감면주택)를 보유 주택 명부 행과 연결

> 작성 2026-09-30 · 상태 **Plan — Q-1~Q-6 추천안 확정 · V-1~V-4 확인 완료(§7-1) · Q-2′ 확정(§7-2) · Do 구현 완료(§7-3)** · 대상 화면 `/calc/transfer-tax` ② 보유 상황(Step4) · ③ 감면·공제(Step5) · 다건 `/calc/transfer-tax/multi`
> 선행: PR #1881(`one-house-judgment-count-exclusion-row-link.plan.md`) — 판정 메뉴를 명부 행으로 옮겼고, 계산기는 **범위 밖**으로 남겼다(그 계획서 Q-1(a) · §8).
> 인용 기준: master `7e039d3f`(PR #1881 머지 직후). 조사: 엔진 시니어·UI 시니어 병렬(읽기 전용) → 핵심 인용은 본인이 재확인.

## 1. 문제 요약

계산기에서 **직접 입력한** 조특법 주택 수 제외 선언은 명부의 어느 주택인지 모른다. 엔진은 요건을 충족한 선언 1건마다 세대 주택 수에서 1을 뺄 뿐이다(`lib/tax-engine/transfer-tax-house-exclusion-step.ts:205-208`).

| # | 계산기 입력 | 현재 | 법령상 |
|---|---|---|---|
| C2 | 명부 R(농어촌)·N(신규) + §99의4 선언 | **과세** | 비과세 — 서면-2021-부동산-6220 |
| C3 | 명부 없음 · 주택 수 1 + §99의4 선언 | **과세**(1−1=0채) | 비과세(실제 1채면 선언 자체가 불필요) |
| **C6** | 명부 N(2016, 처분기한 경과) + §99의4 선언(R 명부에 없음) | **비과세** | **과세 — 과소과세** |

- 선행 계획서 §7-1 V-1 실측: C6 법령상 세액 114,686,000. 이번 재측정(엔진 시니어, 취득가액 3억 가정)은 186,846,000 — **취득가액 가정이 달라 절대값만 다르고 판정 패턴은 동일**하다. anchor에서는 한 픽스처로 고정한다.
- C6은 두 해석(① R을 명부에 안 넣었을 뿐 → S+N+R, R 제외 후 2채 / ② R이 없다 → S+N) **어느 쪽이든 과세**다. 엔진이 실제로 뺀 것은 N이다.
- 전 케이스 `validateStep` 오류 0건(엔진 시니어 probe) — 사용자에게 신호가 없다.

## 2. 현황 실측

### 2-1. 이미 준비된 것 (PR #1881)

- 단건 `houseId` 배관은 끝까지 열려 있다: ④ `toEngineReductions`(`lib/calc/transfer-tax-api-reductions.ts`) · 감면주택 `transfer-tax-api.ts:497` · Zod `transfer-tax-schema-reductions.ts` · `transfer-tax-schema.ts` · route `engine-input.ts`.
- §155① 신규 주택 후보 제외: 계산기 호출부가 모두 `excludedHouseIds: eligibleCountExcludedHouseIds(form)`을 넘긴다(예: `transfer-tax-api.ts:560`).
- 단 `linkedDeclarations`는 **`houseId`가 있는 선언만** 읽는다(`lib/calc/house-count-exclusion-rows.ts:83-90`). 계산기 직접 입력분은 `houseId`가 없어 걸러진다 ⇒ 판정 메뉴에서 넘겨받은 선언만 고쳐져 있다.
- probe C2h(엔진 시니어): C2와 같은 입력에 `houseId="r"`만 붙이면 **비과세** — 행 연결만 되면 C2는 엔진 변경 없이 고쳐진다.

### 2-2. 입력 위치 — 두 곳, 둘 다 행이 아니다

| 선언 | 저장 | 화면 |
|---|---|---|
| §99의4 농어촌·고향 · §98의9 | `form.assets[i].reductions[]` (자산별) | ③ Step5 `UnifiedReductionPanel`(`app/calc/transfer-tax/steps/Step5.tsx:114`) → `UnifiedReductionGroupSection.tsx:355`·`:367` |
| 보유 감면주택(10개 조문) | `form.specialHouseExclusions[]` (폼 전역) | ② Step4 `HouseCountExemptionInputs.tsx:83-84` `SpecialHouseExclusionSection` |

- 엔진에 가는 것은 **대표 자산**의 선언뿐이다(`transfer-tax-api.ts:85` `toEngineReductions(primary.reductions …)`).
- 패널의 자산종류 게이트는 `housing`·`right_to_move_in`·`presale_right`·`redevelopment_apt`(`lib/tax-engine/transfer-reductions/asset-kind-gate.ts:43-48`). 판정 메뉴는 입주권 양도에서 닫는다(`judgmentSaleIsHousing`, `lib/stores/one-house-judgment-form.types.ts:118-122`).

### 2-3. 명부의 노출 조건 — 주택 수 2 이상에서만 뜬다

- 중과 트랙: `SurchargeJudgmentSection.tsx:60` `isHousingLike(primaryKind) && householdHousingCount >= 2`.
- 한시배제 창: `Step4.tsx:672` — `houseCountInputsVisible`(`lib/calc/house-count-inputs-scope.ts:42-51`).
- 명부가 비면 스칼라가 정본(D-4, `lib/calc/household-house-count.ts:90-97`). 명부 행이 있으면 `1 + 행 수`. 양도 자산이 `housing`이 아니면 명부와 무관하게 스칼라(F1, `:94`).
- 명부(② Step4)가 감면 패널(③ Step5)보다 **앞 단계**다(`TransferTaxCalculator.tsx:329-331`).

### 2-4. 같은 선언의 제2 축은 없다 (§99의4·§98의9) — 감면주택은 있다

- §99의4·§98의9는 효과 유형이 `house_count_exclusion`뿐이고 감면액 계산(`lib/tax-engine/transfer-tax-reductions-calc.ts`)에 나오지 않는다 ⇒ 행으로 옮겨도 잃는 축이 없다.
- 감면주택 조문 id(`new_99`·`unsold_98_x` 등)는 **양도 자산 자신의 감면**으로도 쓰인다(`assets[0].reductions`). 행 연결 대상은 「보유 중인 다른 감면주택」 배열 `specialHouseExclusions`뿐이다 — 양도 자산의 감면 선언을 건드리면 안 된다.
- 중과 주택 수는 불변(R-D, `transfer-tax-house-exclusion-step.ts:196-198`). 15호 축(`surcharge15HouseCount`)은 개수 규칙이 그대로라 영향 없음(엔진 시니어 확인).

### 2-5. 다건

- 단건 계산기 폼을 건별로 보내고(`lib/calc/multi-transfer-tax-api.ts:165-175`) 각 건이 자기 `houses`로 판정 — 건끼리 섞이지 않는다.
- 감면주택은 다건에서 차단(`lib/calc/multi-transfer-tax-validate.ts:186-188`), 컴패니언 자산도 차단(`:189`).
- 🔴 행으로 옮기면 이 차단이 **폼 전역 배열만** 보므로 행 기반 감면주택이 차단을 우회하고, ⑬ `buildPropertyPayload`는 감면주택을 싣지 않아 **조용히 사라진다**(UI 시니어). ⇒ 차단 조건을 행까지 넓혀야 한다.

## 3. 법령 근거

선행 계획서 §3 그대로(조특법 MST 284389 실독). 요점만:

- §99의4① · §98의9①: 「**그** 농어촌주택등(준공후미분양주택)을 해당 1세대의 소유주택이 아닌 것으로 보아 「소득세법」 제89조제1항제3호를 적용」 ⇒ 대상은 **특정 주택 1채**, 효과는 **§89①3호(주택 양도 비과세)** 한정.
- 재산세과-1096 · 부동산납세과-91: 농어촌주택등 2채면 미적용(PR #1881 엔진 반영 완료).

## 4. 해결 방향

### 4-1. 원칙

1. **판정 메뉴와 같은 정본** — 명부 행 `HouseEntry.countExclusion`(`lib/stores/calc-wizard-asset-nbl.ts`)이 유일한 입력원. 두 화면이 하나의 구조를 쓴다.
2. **행이 없는 선언은 입력 구조상 존재할 수 없게** — C3·C6을 검증 문구가 아니라 입력 경로로 막는다.
3. **엔진은 바꾸지 않는다** — `houseId` 없는 선언의 스칼라 차감을 엔진에서 끄면 저장된 이력의 재계산 세액이 조용히 바뀐다. 막는 곳은 ⑧이다.

### 4-2. 안 비교 — **A 추천**

| | A. 명부 행 ⑥으로 이전 (판정 메뉴와 동일) | B. 감면 패널 유지 + 「어느 주택」 선택기 |
|---|---|---|
| 사실 입력 | 행 값 1곳(`rowFacts`) | 패널·행 2곳 → 취득일 불일치 검증 추가 필요(dual truth) |
| C3·C6 | 입력 구조로 불가 | 선택 안 하면 ⑧ 차단 |
| 행 삭제 시 | 선언도 함께 사라짐 | dangling `houseId` 정리 필요(onChange에서) |
| 판정 메뉴 재사용 | `HouseEntryCountExclusionSection`·`rowCountExclusionReductions` 그대로 | 별도 선택기 신설 |
| 깨지는 테스트 | 많음(§6) | 적음 |

⇒ **A**. B는 이중 입력을 남긴 채 선택기를 하나 더 얹는 구조라 판정 메뉴와 진실이 갈라진다.

### 4-3. 1단계 — ④⑬ 배관 (행 → 엔진)

- `transfer-tax-api.ts` 본문: 게이트(§4-5) 안에서 `rowCountExclusionReductions(form.houses)`를 `reductions`에, `rowSpecialHouseExclusions(form.houses)`를 `specialHouseExclusions`에 덧붙인다(`houseId` 포함, 사실은 행 값 — 이미 `house-count-exclusion-rows.ts`가 한다).
- `multi-transfer-tax-api.ts`: 같은 leaf로 건별 `reductions`에 §99의4·§98의9 행 선언을 싣는다.
- 판정 → 계산기 전달 `withRowCountExclusions`(`lib/calc/one-house-judgment-handoff.ts:135-148`): **행을 그대로 넘긴다**(`countExclusion` 유지, 저장소로 옮기지 않음). 남기면 행과 `reductions`에 같은 선언이 이중으로 실린다.
- Zod·route는 변경 없음(`houseId` 이미 통과).

### 4-4. 2단계 — ⑤ UI

- `HouseCountExemptionInputs`에 `countExclusionEnabled`를 계산기에서도 켠다(게이트 §4-5) → 행 편집 모달 ⑥ + 「주택 수 제외」 배지 + 세대 단위 `SpecialHouseExclusionSection` 숨김(이미 `:83`에 구현).
- `UnifiedReductionPanel`: `new_99_4_rural`·`new_99_4_hometown`·`unsold_98_9`를 **선택지에서 뺀다** + 한 줄 안내 「보유 주택 목록의 해당 주택 「편집」 → ⑥에서 지정」(Q-3).
- 🔑 명부가 주택 수 2 이상에서만 뜨므로(§2-3) 「농어촌주택을 가진 사람」은 실제 보유 수(2 이상)를 입력해야 명부가 열린다 — 사실대로 입력하면 자연스럽게 열린다. 안내 문구에 「농어촌주택도 보유 주택 수에 포함해 입력」을 명시한다.

### 4-5. 게이트 — ⑤ ④ ⑧ 같은 술어

- 행 ⑥을 여는 조건 = ④가 행 선언을 싣는 조건 = ⑧이 행 선언을 검증하는 조건.
- 🔴 **패널에서 세 유형을 빼는 범위와 ⑥을 여는 범위가 같아야 한다.** 패널은 지금 `housing`·`right_to_move_in`·`presale_right`·`redevelopment_apt` 4종에 열린다(`asset-kind-gate.ts:43-48`). ⑥을 그보다 좁게 열면 나머지 양도자는 **입력 경로를 잃는다**(`feedback_ui_gate_removes_sole_input_path`).
- 추천: **⑥ = 명부가 뜨는 조건 = `isHousingLike`(4종, `lib/calc/housing-like-asset.ts:40-45`)**. 패널의 현행 범위를 그대로 옮긴다 — 좁히기는 V-1 결과로 별도 결정(Q-2).
- ⚠️ 명부로 주택 수를 세는 규칙(F1)은 `=== "housing"`만이고 `redevelopment_apt`도 제외다(`lib/calc/household-house-count.ts:40-47`, `:92`). 그 4종 중 `housing` 외에는 **스칼라가 정본**이라 행 선언은 §155① 후보 제외(`:281` F1 조기반환)에 쓰이지 않고 엔진 스칼라 차감에만 쓰인다. 그래도 C6은 막힌다 — 행이 있어야 선언이 존재하므로 「명부에 없는 주택」을 뺄 수 없다.
- 게이트 밖에서 행에 `countExclusion`이 남아 있으면(자산종류를 바꾼 경우) ④는 싣지 않고 ⑧도 막지 않는다 — 판정 메뉴 `judgmentSaleIsHousing` 게이트와 같은 처리.

### 4-6. 3단계 — ⑧ 검증

- 행 필수값: `collectHouseCountExclusionReductionErrors`(판정 메뉴 leaf) 재사용, 「보유 주택 N: …」 형식.
- **행이 지정되지 않은 옛 선언**(대표 자산 `reductions`의 §99의4·§98의9 중 `houseId` 없음 · `specialHouseExclusions` 중 `houseId` 없음) → 차단(Q-1).
- 다건: `multi-transfer-tax-validate.ts:186`의 감면주택 차단을 행 기반(`countExclusion.kind === "special"`)까지 넓힌다(Q-4).
- 🔴 `transfer-tax-validate.ts`가 **787줄** — 새 로직은 별도 leaf(`transfer-tax-validate-count-exclusion.ts`)로. 한 줄 호출만 추가.

### 4-7. 옛 기록 호환

| 기록 | 상태 | 처리 |
|---|---|---|
| 계산기 직접 입력(`houseId` 없음) | sessionStorage·이력 복원(`transfer-resume-entry.ts`) | 계산기판 `LegacyCountExclusionNotice` — 목록 + 「기존 선언 삭제」 + ⑧ 차단(Q-1). 자동으로 행에 옮기지 않는다(어느 행인지 모름) |
| 판정 메뉴에서 넘겨받은 선언(`houseId` 있음, PR #1881 이후 저장분) | 저장소에 행 id 포함 | **해당 행으로 결정적으로 되돌린다**(Q-5) — 행 id가 있으므로 추측이 아니다. 패널에서 이 유형이 사라지므로 두면 「보이지 않는 선언」이 된다 |

- 저장된 결과 스냅샷은 그대로 보인다 — 막는 것은 **다시 계산할 때**뿐.

### 4-8. ⑥ 사이드바 · ⑦ 결과

- ⑥ `lib/stores/transfer-per-asset-summary.ts:690`은 `a.reductions`의 type만 칩으로 만든다 → 행 선언이 칩에서 사라진다. 행 기반 칩 추가. (파일 701줄 — 추가분은 leaf에서.)
- ⑦ `ReductionDetailCards.tsx:230`은 `new994Detail`(**첫 선언**)만 그린다. 엔진 결과 `houseCountExclusion.details`에 `houseId`가 있으므로 「보유 주택 N — 농어촌주택등」으로 전건 표시(Q-6). 카드 하나로 결과뷰 3곳(`TransferTaxResultView`·`BundledAllocationSubCards`·`MultiTransferPropertyBreakdown`)에 반영된다. `MixedUseResultCard` 경유 여부는 V-3.

## 5. 작업 순서 (Do — Q·V 확정 후)

```
0. V-1~V-4 확인                                        → verify: §7 기록
1. anchor 선작성(Pre-Do): C2·C3·C6 계산기 route + 짝   → verify: 현행에서 C2·C6 RED
2. ④⑬ 배관 + handoff 변경 (§4-3)                      → verify: C2 GREEN, ROW-8·9 갱신
3. ⑧ leaf + 레거시 차단 + 다건 차단 확장 (§4-6)        → verify: C3·C6 차단 anchor GREEN
4. ⑤ UI — 명부 ⑥ 켜기 · 패널 유형 제거 · 레거시 카드  → verify: UI 테스트
5. ⑥⑦ 칩·결과 카드 (§4-8)                             → verify: UI 테스트
6. E2E 이전·신규 · 전체 회귀 · sync-checker           → verify: DoD
```

## 6. 테스트 계획

| 대상 | 종류 | 단언 |
|---|---|---|
| C2 | 계산기 route anchor | 명부 행 R(⑥ 농어촌)·N → 비과세 / 짝: R ⑥ 해제 → 과세 |
| C6 | validate anchor | 명부 N + 옛 선언(`houseId` 없음) → ⑧ 차단 / 짝: 선언 삭제 → 과세 114,686,000(픽스처 고정) |
| C3 | 입력 구조 | 패널에 유형 없음(UI) · 옛 선언은 C6과 같은 차단 |
| 게이트 | anchor | ⑤ ④ ⑧ 술어 동일(4종) · 게이트 밖(토지 등) + 행 ⑥ 잔존 → ④ 미적재·⑧ 미차단 · 재개발 아파트 양도 + 행 ⑥ → 적재(입력 경로 보존) |
| 다건 | anchor | 행 기반 감면주택 → 다건 차단 / §99의4 행 → 건별 적재 |
| handoff | anchor | 판정 → 계산기: 행 `countExclusion` 유지, `reductions` 중복 0 |
| 옛 기록(Q-5) | anchor | `houseId` 있는 저장소 선언 → 해당 행으로 이동, 세액 불변 |

**기존 테스트 영향**(UI 시니어 grep, Do에서 재확인):
- E2E 재작성: `transfer-99-4.spec.ts` · `transfer-98-9.spec.ts`(패널 클릭 경로) · `transfer-p5.spec.ts`(감면주택 스위치) · `reduction-994-stdprice-lookup.spec.ts`(`new994-stdprice-*` — 행 모달에서 조회로 이전).
- UI: `__tests__/components/calc/special-house-exclusion-surcharge-window.anchor.test.tsx`(D4-03-2~6, 세대 단위 섹션 제목 유일성).
- anchor: `one-house-count-exclusion-row-link.anchor.test.ts` ROW-8(전달 변환)·ROW-9+(「행 id 없으면 종전 결함」 — 의도적으로 뒤집힘).
- ⚠️ `농어촌주택` 문자열은 §155⑦(소득세법 시행령 농어촌주택, **다른 축**) spec에도 나온다(`transfer-155-7-rural-location-auto.spec.ts` 등) — 역방향 grep은 testid·필드명으로.

## 7. 레지스터

### 사용자 결정 (Q) — ✅ 2026-09-30 전건 추천안으로 확정 (Q-2는 V-1 결과로 §7-2 재확인)

| # | 질문 | 선택지 | 추천 |
|---|---|---|---|
| Q-1 | 행이 지정되지 않은 옛 선언 | (a) 차단 + 삭제 안내 (b) 종전대로 1채 차감 + 경고 | **(a)** — (b)는 C6 과소과세를 보존한다. 판정 메뉴 Q-2와 같다 |
| Q-2 | 행 ⑥을 여는 양도 자산 | (a) 패널 현행과 같은 4종(`isHousingLike`) (b) `housing`만 (c) 판정 메뉴처럼 입주권만 제외 | **(a)** — 이번 변경은 입력 **위치**만 옮긴다. (b)·(c)는 패널 제거와 겹쳐 나머지 양도자의 유일한 입력 경로를 없앤다. 권리 양도에서 적용 여부(V-1)는 별도 결정 |
| Q-3 | 감면 패널의 세 유형 | (a) 선택지에서 제거 + 안내 한 줄 (b) 비활성 칩으로 남김 | **(a)** — 남기면 「어디서 입력하나」가 두 곳으로 보인다 |
| Q-4 | 다건에서 행 기반 감면주택 | (a) 지금처럼 차단(행까지 확장) (b) 지원 | **(a)** — 다건 감면주택 지원은 별개 축(H-1) |
| Q-5 | `houseId` 있는 저장소 선언(판정 메뉴 전달분) | (a) 해당 행 ⑥으로 이동 (b) 그대로 두고 계속 적재 | **(a)** — 결정적 이동이고, (b)는 화면에 안 보이는 선언이 세액을 바꾼다 |
| Q-6 | ⑦ 결과 카드 | (a) 전건 + 「보유 주택 N」 (b) 현행(첫 선언만) | **(a)** — 판정 메뉴 결과뷰와 맞춘다 |

### 가정 (A)

- A-1 엔진 판정 로직 변경 없음 — C2h probe가 근거(§2-1).
- A-2 `HouseEntryCountExclusionSection`은 계산기 명부 모달에서도 그대로 쓸 수 있다(프롭 배선은 이미 계산기 경로에 있음: `HouseCountExemptionInputs.tsx:79` → `HousesListSection` → `HouseEntryEditor`). 계산기 전용 차이는 V-2.

### 미검증 (V) — ✅ 2026-09-30 전건 확인(§7-1)

| # | 확인 | 방법 |
|---|---|---|
| V-1 ✅ 권리 양도 효과 없음 | 입주권(§89①4호) 양도에서 §99의4·§98의9 주택 수 제외가 적용되는가 · 현 엔진은 입주권 양도에서 이 선언을 쓰는가 | KoreanLaw 조문·해석례 + route probe |
| V-2 ✅ 같은 컴포넌트 | 계산기 명부 모달에서 ⑥ `rowFacts`(취득일·지번·가액·면적·법정동코드)가 모두 채워지는가 — 판정 메뉴와 입력 필드가 다른가 | 컴포넌트 렌더 probe |
| V-3 ✅ 카드 1곳 · PDF 없음 | `MixedUseResultCard`·PDF·신고서가 `new994Detail`·`specialHouseExclusionDetail`을 소비하는가 | grep |
| V-4 ✅ 닿는다 → 감지는 전 자산 | 컴패니언 자산(`assets[1..]`)의 §99의4 선언이 엔진에 닿는가 — 닿지 않으면 옛 기록 레거시 목록에 포함할지 | ④ 코드 + probe |

### 7-1. V 확인 결과 (2026-09-30)

**V-1 — 권리 양도에서는 선언이 효과가 없다. 법문도 주택 양도로 한정된다.**

- 법문(조특법 MST 284389 §99의4① 재실독): 「그 농어촌주택등 취득 전에 보유하던 다른 **주택**(이하 「일반주택」)을 양도하는 경우 … 「소득세법」 제89조제1항**제3호**를 적용」. 양도 대상은 주택이고, 의제는 3호(주택) 한정이다. §98의9①도 「준공후미분양주택을 취득하기 전에 보유한 **주택**을 양도하는 경우」로 같은 구조다(선행 계획서 §3).
- 해석례: 국세청 법령해석 검색 「조합원입주권 농어촌주택」·「입주권 양도 농어촌주택」 모두 1건(81090, 2023.06.22)만 나온다. 이 건은 종전**주택**을 양도하는 사안이다. 입주권 양도에 이 의제를 넓힌 근거는 찾지 못했다.
- 엔진 probe(throwaway `callTransferTaxAPI` 본문 → 계산기 route, 실행 후 삭제). 조건: 양도 2024-06-01, 취득 2015-01-01, 9억, 취득가액 3억, 스칼라 주택 수 2, 명부 없음, §99의4 선언(행 id 없음).

| 양도 자산 | 선언 없음 | 선언 있음 | 해석 |
|---|---|---|---|
| `housing` | 과세 186,846,000 | **비과세 0** | C6 결함 |
| `redevelopment_apt` | 과세 264,600,600 | **비과세 0** | C6 결함 — 같은 결함이 재개발 아파트에도 있다 |
| `right_to_move_in` | 과세 317,823,000 | 과세 317,823,000 | 효과 없음 |
| `presale_right` | 과세 394,350,000 | 과세 394,350,000 | 효과 없음 |

- 코드 근거:
  - 입주권 §89①4호 판정(`transfer-tax-redevelopment-steps.ts:249` → `transfer-tax-redevelopment-transforms.ts:205-208`)은 `redevInput = effectiveInput`(`transfer-tax.ts:160`)의 주택 수를 읽는다. STEP 0.9 제외(`:207`)가 붙기 **전** 값이다.
  - 완공 아파트(subject `apt`)는 `judgeRedevAptOneHouseExemption`(`:173`)이 제외를 반영한다.
  - 분양권은 1세대1주택 비과세 대상이 아니다(`transfer-tax-exemption.ts:253` `propertyType !== "housing"`).

**V-2 — 계산기 명부 모달은 판정 메뉴와 같은 컴포넌트이고 같은 칸을 가진다.**

- `HouseEntryEditor`의 호출부는 `HousesListSection.tsx:587` **1곳**뿐이다. 두 메뉴가 같은 모달을 쓴다.
- `transferDate`(`:591`)와 `countExclusionEnabled`(`:593`)도 이미 넘긴다.
- ⑥이 읽는 행 값(지번 `addressJibun`, 법정동코드 `regionCode`, 취득가액 `:153`, 전용면적 `:141`)은 `BasicInfoSection`에 **조건 없이** 있다. 계산기 전용 차이는 없다 ⇒ A-2 확정.

**V-3 — 결과 표시는 `ReductionDetailCards` 1곳이다. PDF와 신고서는 소비하지 않는다.**

- `new994Detail`·`unsold989Detail`·`specialHouseExclusionDetail`의 소비처는 `ReductionDetailCards.tsx:115-132, 230-232, 318-320`과 판정 route `app/api/calc/one-house-exemption/route.ts:233`뿐이다(`components`·`app`·`lib` 전역 grep, 엔진 제외).
- 결과뷰 4개가 모두 이 카드를 렌더한다:
  - `TransferTaxResultView`
  - `BundledAllocationSubCards`
  - `MultiTransferPropertyBreakdown`
  - **`MixedUseCalculationSections.tsx:737`**(겸용)
- ⇒ 카드 1곳만 고치면 된다.
- ⚠️ **정정(2026-09-30, S4)**: 겸용은 카드 컴포넌트를 렌더하지만 `result`에 `total.reductionDetails`(세액감면형 7종)만 넘겨, 이 세 detail이 **한 번도 도달하지 않았다**. 「렌더한다」는 컴포넌트 존재만 본 것이고 입력 배선은 보지 않았다 — S4에서 수정.

**V-4 — 컴패니언 자산의 선언도 엔진에 닿는다.**

- 대표 자산은 `transfer-tax-api.ts:85`를 거친다. 컴패니언은 `bundled-split-helpers.ts:543` `mapReductionsToEngine(c.reductions)`를 거쳐 자기 엔진 실행에 실린다. 주석이 「§99의4·§98의9 `.getTime is not a function` 500」 수정 이력을 적고 있다(F14).
- 컴패니언 실행에서 제외가 실제로 세액을 바꾸는지는 측정하지 않았다(확인 필요).
- ⇒ 설계 보정: 옛 선언 감지(⑧, 레거시 카드)는 **모든 자산**의 `reductions`를 훑는다. 효과가 있든 없든 막는 쪽이 보수적 상위집합이다. 행 선언을 싣는 곳(④)은 판정 메뉴와 같이 **대표 자산**이다.

### 7-2. 설계 보정 — ✅ Q-2′ 확정 (2026-09-30)

V-1에 따르면 `right_to_move_in`·`presale_right` 양도에서는 이 선언이 **현행 엔진에서도 효과가 없고, 법문도 주택 양도로 한정**된다. Q-2(a)(4종)의 근거는 「입력 경로 보존」이었다. 그런데 보존할 효과가 없으므로, 4종으로 열면 **효과 없는 입력을 계속 노출**하는 셈이다.

| 안 | ⑥·④·⑧ 게이트 | 결과 |
|---|---|---|
| Q-2(a) 확정대로 | 4종 | 권리 양도자에게 효과 없는 ⑥이 보인다. 권리 양도의 옛 선언도 차단된다(불필요한 마찰) |
| **Q-2′ (추천)** | **`housing`·`redevelopment_apt`** | C6이 실재하는 두 종류만 연다. 권리 양도의 옛 선언은 효과가 없으므로 막지 않고 둔다(⑧ 게이트도 같은 술어) |

- Q-2′를 택해도 잃는 계산 경로는 0이다(V-1 표).
- 패널에서 세 유형을 빼는 범위도 같은 2종으로 맞춘다. 권리 양도에서 패널에 남기는 것도 무의미하므로 4종 전부에서 빼는 편이 단순하다. 이 경우 권리 양도에서는 입력 자체가 사라진다(효과 0이라 손실 없음).

### 7-3. 구현 결과 (2026-09-30 — 브랜치 `feat/calc-count-exclusion-row-link`)

**설계에서 바뀐 것**

- **엔진 판정 무변경**(A-1 유지). 처음에는 Q-6도 엔진 결과를 늘리지 않았다 — `new994Detail`·`unsold989Detail`은 첫 선언의 평가 결과 **그 객체**라 행 id가 런타임에 이미 실려 온다(`unsold-98-9.ts:259-260` ← `evaluateNew994Declarations`). 결과 화면이 가진 명부로 「보유 주택 N (취득일)」로 바꾼다(`components/calc/results/transfer/count-exclusion-house-ref.ts`). 같은 유형 2건 이상은 엔진이 전건 불성립(재산세과-1096)이라 첫 카드로 결과를 잃지 않는다. 명부를 모르는 화면(일괄·다건 하위 카드)은 표시를 생략한다. → 이후 S3에서 결과에 선언 전건을 싣도록 확장(아래 표).
- 패널 카테고리 부제목의 고정 개수가 목록과 어긋났다 — 「§99 시리즈 (4개)」→「§99·§99의3 (2개)」, 「(10개)」→「(9개)」(`metadata.ts` — 소비처는 패널 1곳). 헤더 카운터도 같은 3유형을 뺀다(`countActiveReductionsByCategory(ctx, exclude)`).
- 🔴 **PR #1881 잠복 결함 발견·수정** — 명부 행에서 「감면주택」만 고르고 조문을 아직 고르지 않은 순간 `eligibleCountExcludedHouseIds`가 빈 조문으로 평가기를 불러 `TypeError`(`unsold-hybrid-p5.ts:395` 조문 표 조회). 판정 메뉴 ③ 헤더 `useMemo`(`Step2.tsx:135`)가 매 렌더 부르므로 화면이 깨질 수 있었다. `linkedDeclarations`에서 조문 없는 항목을 뺀다(CR-11).
- 판정 메뉴 옛 선언 카드를 공용 본체(`components/calc/transfer/CountExclusionLegacyNotice.tsx`)로 뺐다 — 계산기 카드(`CalcCountExclusionLegacyNotice`)와 같은 본체.
- ⑧ 기존 폼 전역 감면주택 검증 루프를 새 leaf로 옮겨 `transfer-tax-validate.ts`는 787 → 772줄.

**테스트**

- anchor `__tests__/calc/transfer-calc-count-exclusion-row-link.anchor.test.ts` 21건 — CR-1~CR-11. CR-2+ 과세 **186,846,000**(취득가액 3억 픽스처 — §1의 114,686,000은 선행 probe의 다른 취득가액이다).
- UI `__tests__/components/calc/transfer-calc-count-exclusion-row-link.ui.test.tsx` 9건 — 패널 부재·안내 · 명부 ⑥ 게이트(주택·재개발·입주권 짝) · 옛 선언 카드 삭제 · 사이드바 칩 · 결과 카드 「보유 주택 N」.
- 뮤테이션(백업 복사본 원복): 게이트 항상 참 → 5건 KILLED · 행 선언 미적재 → 6건 · 옛 선언 감지 대표 자산만 → CR-2c · 결과 카드 houseRef 제거 → UI-5 · 복원 이동 제거 → CR-9m · 조문 필터 제거 → CR-6s·CR-11.
- 재작성: ROW-8·ROW-9+(판정 메뉴 anchor — 전달이 행째로 바뀜) · D4-03-2~7(주택 양도는 명부, 권리 양도는 폼 전역 섹션 — 두 경로 각각 「정확히 1벌」) · T-08(게이트 밖 자산으로).
- E2E: 재작성 4(`transfer-99-4`·`transfer-98-9`·`reduction-994-stdprice-lookup`·`transfer-p5` — 공용 시드 `e2e/_helpers/transfer-seed.ts`) · 신규 `transfer-calc-count-exclusion-row.spec.ts` 3(CCX-1 행 ⑥ → 본문 houseId → 비과세 → 결과 「보유 주택 1」 · CCX-1+ 짝 과세 · CCX-2 옛 선언 카드 삭제). 역방향 grep 관련 E2E 86건 중 85 통과 · `gift-deemed-history` GDH-4 1건은 단독 재실행 4/4 통과(증여세 경로 — 이번 diff 무관).

**Check — `ui-engine-sync-checker`(14지점, 정적) blocking 0 · should-fix 3**

| # | 지적 | 처리 |
|---|---|---|
| S2 | 대표 자산이 게이트 밖(토지 등)이면 함께 양도하는 **주택(컴패니언)**의 옛 §99의4·§98의9 선언이 ③ 패널에서 사라진 채 무검증으로 컴패니언 엔진 실행에 실린다 | ✅ 수정 — 옛 선언 감지·삭제의 게이트를 **선언이 붙은 자산 자신의 종류**로(`unlinkedCountExclusionDeclarations`·`clearUnlinkedCountExclusions`). ⑧·안내 카드가 같은 함수. CR-2l(토지+주택 컴패니언 → 차단) · CR-2l+(컴패니언이 입주권 → 미차단). 이 경우 명부가 보이지 않아(대표 자산이 주택이 아님) 해소 경로는 삭제뿐이다 — 컴패니언 선언의 효과는 미측정(V-4)이라 막는 쪽이 보수적 |
| S1 | 비한시배제 분기에서 스칼라 주택 수를 1로 낮추면 명부가 숨는데 ⑥이 채워진 행은 남아 ④가 싣는다 | ✅ 후속 수정 — `transfer-count-exclusion-hidden-roster.plan.md`(실측: 스칼라 정본 + ⑥이면 0채로 과세 186,846,000·264,600,600 → ⑧ 차단 · 명부 게이트 단일 술어). 아래는 착수 전 판단 기록: ⏸ 기록만 — 명부 행이 있으면 주택 수 자체가 `1 + 행 수`로 계산되고(`household-house-count.ts:94`) 불일치 안내(`house-count-mismatch`)가 뜨는 **종전 구조**다. 행 필드 전체(§155 사실·상속 등)에 공통이고 이번 diff가 만든 경로가 아니다. 선언이 가리키는 주택은 실재하는 행이라 C6(명부에 없는 주택)과 다르다 |
| S3 | Q-6(a) 「전건」 — 결과 카드는 유형별 첫 선언만 그린다 | ✅ 수정(사용자 결정 「엔진까지 이어서」) — 엔진 결과에 `houseCountExclusionDetails`(선언 전건 · 행 id 포함)를 싣고 반환 경로에 모두 이었다: 주택 수 제외 단계 → 비과세 조기 반환(`finalize`) · 일반(`normal-return`) · 차손(`loss-return`) · 재개발(`redevelopment-apt-exemption`→`redevelopment` 펼침) · 겸용(`mixed-use-exemption`·`mixed-use`) · 일괄 자산별(`aggregate-pickers`). 매개변수는 필수로 둬 빠진 호출부를 컴파일러가 잡는다. 카드는 전건을 그리고, 이 필드가 없는 옛 결과는 종전 첫 선언 카드로 대체한다. anchor CR-12(조기 반환)·CR-12t(일반)·CR-12l(차손)·CR-12r(재개발)·CR-12d(같은 유형 두 행) + UI-6 — 경로별 뮤테이션 5종 KILLED. 겸용·일괄 경로는 타입 배선만(anchor 없음) |
| S4 | (머지 후 후속) 겸용 결과뷰에 조특법 주택 수 제외 카드가 없다 — 엔진은 detail을 결과 최상위(D4-02 echo)에 싣는데 결과뷰가 `total.reductionDetails`만 넘겼다. 세액은 맞고(route가 `engineInput.reductions`를 싣는다) 어느 주택인지·적용 불가 사유·§99의4⑥ 추징 경고만 사라졌다. #1884 이전부터 있던 표시 결함 | ✅ 수정 — `MixedUseCalculationSections`가 네 detail(`new994Detail`·`unsold989Detail`·`houseCountExclusionDetails`·`specialHouseExclusionDetail`)을 합쳐 넘기고 `houses={formData?.houses}`를 전달(단건과 같은 배선). anchor `mixed-use-count-exclusion-cards.anchor.test.tsx` 6건(MXC-0 구별력 · §99의4 카드+「보유 주택 2」+§99의4⑥ · 적용 불가 사유 · 감면주택 행 표시 · 명부 없음 짝 · 대조군) — 뮤테이션 3종(houses 미전달·§99의4 미전달·감면주택 미전달) KILLED. E2E CCX-3(겸용 폼 → 본문 houseId → 결과 「보유 주택 1」) — 수정 제거 시 실패 확인 |

- 주석 정정: `calc-wizard-asset-nbl.ts`(「판정 메뉴에서만 입력」) · `New994InputForm`·`Unsold989InputForm`(「판정 메뉴 명부 행에서 쓸 때」).
- note: 같은 행 id의 저장소 선언이 둘이면 이동 시 하나만 남는다(판정 메뉴 전달은 행당 1건이라 생기지 않는 형태) · 다건 `properties[].form` 복원 경로에는 Q-5 이동이 없다(행 id 선언은 판정 → 단건 전달에서만 생긴다 — 남아도 `linkedDeclarations`가 읽어 올바르게 계산되고 보이지만 않는다).

## 8. 곁가지 (범위 밖 — 기록만)

- §99의4⑦ 과세특례신청 처리 부재(선행 계획서 V-5) — 이 축과 무관.
- `multi/route.ts:124` 감면주택 매핑은 ⑬이 싣지 않아 도달하지 않는 경로다(엔진 시니어). 다건 감면주택 지원(Q-4 (b)) 때 함께 본다.

## 9. 완료 기준 (DoD)

- [ ] C2 비과세 · C6 차단 · C3 입력 경로 없음 — anchor + 짝
- [ ] ⑤ ④ ⑧ 게이트 동일 술어(3중 패턴)
- [ ] 14지점 — ①②③ 행 필드(기존) · ④⑬ 행 적재 · ⑤ ⑥ ⑦ · ⑧ · ⑨~⑭ 변경 없음 확인
- [ ] 판정 → 계산기 전달 중복 0 · 옛 기록 2종 처리
- [ ] 800줄: `transfer-tax-validate.ts`(787) 무증가
- [ ] E2E 이전 4건 + 신규 1건 · 전체 vitest · tsc 0 · lint 0
- [ ] 브라우저 확인(Playwright): 명부 ⑥ 지정 → 계산 → 결과 「보유 주택 N」
