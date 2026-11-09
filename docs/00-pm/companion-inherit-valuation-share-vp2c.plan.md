# 매매 함께 양도 × 컴패니언 상속 × 지분 — `inheritanceValuation` 지분 축소를 지키는 테스트가 없다 (V-P2c)

- 상태: **구현 완료(결정 Q-1 a, 2026-11-09)** — 결과는 §5. 기준 master `df6be3f15`.
- 선행: `bg-pre-deemed-fractional-companion-vp2.plan.md`(#3041) §5 V-P2c — 부담부증여 뮤테이션 중 `companion-payload.ts:205`만 `__tests__/api`·`__tests__/calc` 전체를 통과했다.
- 표기: **[직접]** = 이 문서 작성 중 직접 실행·대조. **[코드]** = 코드 읽기만. **확인 필요** = 미측정·미해명.

## 0. 결론

| 질문 | 답 |
|---|---|
| 그 줄은 무엇을 하는가 | 함께 양도 묶음의 **상속 컴패니언**이 지분이면 `publishedValueAtInheritance`(상증법 평가액)를 지분율로 줄여 `inheritanceValuation`에 싣는다(`companion-payload.ts:203-207`). 소비처는 안분 준비 `bundled-apportionment.ts:114` — `calculateInheritanceAcquisitionPrice`로 그 자산의 안분용 취득가액(`allocatedAcquisitionPrice`)을 만든다 [코드] |
| 값이 틀리는가 | **틀리지 않는다.** 토지 · 주택 × 상속 1995(의제 후) · 1983(의제 전) × 양도가액 구분기재(actual) · 총액 안분(apportioned) = **8칸 전부 단건 합과 일치**(diff 0), 컴패니언 `allocatedAcquisitionPrice` 100,000,000(= 평가액 2억 × 50%) [직접] |
| 그런데 왜 문제인가 | 줄을 끄면(지분 미축소) **최종 값은 그대로인데 안분 echo가 두 배**가 된다: 8칸 전부 `apportionment.apportioned[컴패니언].allocatedAcquisitionPrice` 100,000,000 → **200,000,000**, 최종 `properties[].acquisitionPrice`는 100,000,000 그대로, 양도차익 900,000,000 그대로 [직접, 뮤테이션 적용 상태에서 측정 후 `cmp` 복원]. 즉 이 줄은 **맞고, 아무 테스트도 지키지 않는다** |
| 왜 최종 값은 안 변하는가 | ~~`adjustedAcqPrice`가 덮는 것으로 보인다~~ — **틀렸다(§7)**. `adjustedAcqPrice`는 매매 환산 컴패니언에만 채워진다. 덮는 쪽은 엔진 STEP 0.45(§163⑨ 상속 취득가액 의제)다. ④가 따로 지분 축소해 싣는 `inheritedAcquisition.reportedValue`로 취득가액을 다시 쓴다 [직접] |
| 화면에 닿는가 | 사이드바 자산별 요약은 `bundledEcho?.acq ?? bundledMatch.allocatedAcquisitionPrice`(`transfer-per-asset-summary.ts:378`)로 엔진 echo를 먼저 읽는다 [코드]. 안분 echo가 직접 보이는 화면·`allocatedAcquisitionPrice`의 나머지 소비처(`transfer-per-asset-debt-pieces.ts:28` · `gb-result-block-views.ts:66` 등)는 **전수 확인하지 않았다 — 확인 필요** |
| 판정 | 사용자 결정 **Q-1 a(8칸 안전망 anchor 추가 · 안분 echo 단언 포함 · 코드 변경 없음)** — §3 |

## 1. 범위

- 컴패니언 종류: 토지 · 주택(`house_individual`). 주 자산은 토지 매매 100%(취득가액 3억 · 양도시 기준시가 5억).
- 컴패니언: 상속, 평가액 2억 · 양도시 기준시가 6억 · 양도가액 10억(물건 전체 기준) · **지분 50%**.
- 변수: 상속일 1995-05-05(의제 후) · 1983-07-26(의제 전) × 묶음 모드 `actual`(총 13억, 자산별 구분기재 8억 + 5억) · `apportioned`(총 13억을 양도시 기준시가 5:3으로 안분 → 812,500,000 / 487,500,000).
- 대조: 단건 합 — 주 자산 단건 + 컴패니언을 반 크기로 줄인 단건(양도차익 5억 + 4억 = 9억).
- 측정하지 않은 것: 상가 · 건물 · 재개발 · 분양권 컴패니언 · 3건 이상 묶음 · 증여 컴패니언(이 줄은 `acquisitionCause === "inheritance"`만) · 지분 50%가 아닌 비율 · 축 B(전 자산 지분 — 별도 경로) · 건물 상속·토지 매매 혼합(`effectiveBuildingCauseMix` 제외 분기) · 세액(양도차익 합계만 비교, 세율은 mock).

## 2. 측정 방법 [직접]

화면 경로 그대로 — 폼 → ⑧(`collectStepIssues` 0~5단계) → ④(`captureBody`) → ⑫~⑭(route POST). 비교는 `aggregated.totalTransferGain`과 `aggregated.properties[]`(자산별 양도가액·취득가액·양도차익), `apportionment.apportioned[]`(안분 echo). 주택 시료의 첫 시도는 ⑧이 «함께 양도 토지의 토지 성격 미선택»(`landNature`)으로 막았다 — 주 자산 토지에 `landNature: standalone`을 넣어 재측정했다(내 시료 누락). probe는 throwaway(미커밋).

| 순서 | 내용 |
|---|---|
| 1 | 8칸 기본 측정 — 전부 ⑧ 0건 · ⑫ 200 · diff 0 |
| 2 | 줄 `:205`를 `applyRatio` 없이 `parseAmount(...)`만 쓰도록 변형(cp 백업) → 같은 8칸 재측정 → 안분 echo 비교 → 복원 후 `cmp` |

## 3. 결정 (2026-11-09 사용자 결정: Q-1 a)

| Q | 내용 | 권장 |
|---|---|---|
| Q-1 | 이 8칸을 **안전망 anchor**로 고정할까 — 단언: ⑧ 0건 · ⑫ 200 · 양도차익 = 단건 합 · **컴패니언 `allocatedAcquisitionPrice` = 평가액 × 지분율**(이 줄을 지키는 유일한 단언). 코드 변경 없음 | **a 추가** / b 문서만 |

## 4. 미검증 · 확인 필요

| 번호 | 내용 |
|---|---|
| V-P2c-1 | ✅ 해명(§7) — 덮는 쪽은 `adjustedAcqPrice`가 아니라 STEP 0.45. 덮이지 않는 조건은 `ownsAcquisitionSubobject`가 참인 상속 컴패니언(승계 입주권 · 준공 전 받은 승계 완공 APT) |
| V-P2c-2 | 안분 echo `allocatedAcquisitionPrice`가 화면에 그대로 나오는 곳(소비처 전수) |
| V-P2c-3 | 상가 · 건물 · 재개발 · 분양권 컴패니언 · 3건 묶음 · 50% 외 지분의 값 — **재개발 · 분양권은 §6에서 측정(결함 없음)**. 상가 · 건물 · 3건 묶음은 이 문서에 기록 없음 |
| — | 사람이 직접 한 브라우저 수동 확인은 하지 않았다 |

## 5. 구현 결과 (Q-1 a)

`lib/**`·`app/**` 코드 변경은 없다.

| 항목 | 결과 |
|---|---|
| 안전망 anchor | 신규 `__tests__/api/transfer.route.companion-inherit-valuation-share.anchor.test.ts` 8건(종류·상속일 4 × 모드 2). 각 칸 ⑧ 0건 · ⑫ 200 · 양도차익 = 단건 합 = 900,000,000 · 안분 echo(주 자산 300,000,000 · 컴패니언 100,000,000) · 자산별 최종 취득가액 · 자산별 양도가액(actual 8억/5억 · apportioned 812,500,000/487,500,000) |
| 뮤테이션 3/3 KILLED | cp 백업 → 변형 → 신규 anchor → 복원 → `cmp`(복원 확인 3/3). **Mc1** `companion-payload.ts:205` 평가액 지분 제거 → **8건 전부 실패**(이 줄을 지키는 첫 테스트) · **Mc5** `:407` 기준시가 안분 지분 제거 → 4건(apportioned 모드) · **Mb** `bundled-apportionment.ts:114` 소비처의 컴패니언 평가액 2배 → 8건 |
| 회귀 | api 483파일 6403 · lib 262파일 3357 · components 750파일 6895 · calc 827파일 11588 · tax-engine 1502파일 19001 — 전부 통과(실패 0) |
| 정적 검사 | `tsc --noEmit` 0건 · 신규 테스트 1파일 eslint 0건 |
| Playwright | **돌리지 않았다** — 화면·코드 변경이 없다 |

### 5.1 이번에 확인하지 않은 것

- V-P2c-1~3 그대로 **확인 필요**(`adjustedAcqPrice`가 덮는 경로 · echo 화면 소비처 · 상가 등 다른 종류와 50% 외 지분).
- 사람이 직접 한 브라우저 수동 확인.


## 6. V-P2c-3 측정 — 재개발 · 분양권 컴패니언 (2026-11-09)

**결론: 결함이 없다.** 10종 × 지분 3종(50 · 100 · 30%) × 결정 방식 2종(`actual` · `apportioned`)을 합친 60칸 전부 ⑧ 0건 · ⑫ 200이다. 묶음 양도차익 합계는 단건 합과 1원까지 같다. `actual` 30칸은 컴패니언 자산의 양도차익 · 장기보유특별공제도 단건과 같다 [직접]. 코드 변경은 없다.

### 6.1 범위 · 방법 [직접]

- 주 자산: §1과 같다(토지 매매 100% · 취득가액 3억 · 양도 8억 · 기준시가 5억). 컴패니언은 상속 · 지분 · 금액은 물건 전체(100%) 기준 입력이다.
- 종류 10: 분양권 상속 2021 · 원조합원 입주권 · 완공 APT 2000 상속(① 3억만 / ① + ② §164⑤ 7.2억) · 원조합원 토지 출자 입주권 · 완공 APT 1988 상속(① + ② §164④ 4.8억) · 승계 완공 APT 준공 뒤 상속 2023 · 준공 전 상속 2021 · 승계 입주권 상속 2021. 원조합원 시료는 `transfer.route.redev-companion-sec164-carry.anchor.test.ts`와 같다(청산금 납부 1억 · 권리가액 5억).
- 대조: 주 자산 단건 + 컴패니언을 지분율 크기로 줄인 100% 단건. 줄이는 칸은 양도가액 · 기준시가 · ① · 권리가액이다. ②는 「① 칸에 ② 값을 넣은 것과 같다」는 위 anchor의 동치를 써서 ① = ② × 지분율로 바꿨다. **청산금은 줄이지 않는다** — 화면 규약상 지분 납부분을 직접 입력한다(`transfer-tax-api-redev.ts` `settlementAmount` 주석).
- 경로: 폼 → ⑧(`collectStepIssues` 0~5) → ④(`captureBody`) → ⑫~⑭(route POST). probe는 throwaway(미커밋).

### 6.2 결과 [직접]

| 항목 | 결과 |
|---|---|
| 양도차익 합계 = 단건 합 | 60/60 |
| `actual` 컴패니언 양도차익 · 장특공제 = 단건 | 30/30 |
| `apportioned` 자산별 값 | 단건과 다르다 — 총액을 양도시 기준시가 비율로 다시 나누기 때문이다(설계). 예: 분양권 50% 컴패니언 양도가액 = 13억 × 3억 ÷ 8억 = 487,500,000 → 양도차익 387,500,000. 합계는 같다 |
| 손계산 1칸 | 원조합원 토지 출자 입주권 50%: 취득가액 = max(① 1.5억, ② 2.4억) + 청산금 1억 = 340,000,000 · 양도가액 550,000,000 → 양도차익 210,000,000(엔진 값과 같다) |

### 6.3 뮤테이션 [직접] — cp 백업 → 변형 → 60칸 재측정 → 복원 후 `cmp`(2/2)

| 변형 | 바뀐 칸 | 기존 테스트 |
|---|---|---|
| **M1** `transfer-tax-api-companion-payload.ts` `inheritanceValuation` 평가액 지분 제거(§0의 그 줄) | 10종 전부 지분 칸 echo 2배. **승계 입주권 상속 · 승계 완공 APT 준공 전 상속만 최종 값도 바뀐다** — 50% 양도차익 합계 735,000,000 → 510,000,000(지분 칸 4칸씩). 나머지 8종은 최종 값이 그대로다 | 이미 KILLED(§5 Mc1 · V-P2c anchor 8건) |
| **M2** 같은 파일 `buildRedevPayloadForCompanion(asset, getOwnershipRatio(asset))` → 지분율 미전달 | 원조합원 6종 지분 칸에서 컴패니언 장특공제가 바뀐다(예: 입주권 ① 50% 28,000,000 → 98,000,000). 양도차익은 그대로다 | KILLED — 관련 api · calc 199파일 중 11파일 24건 실패(`redev-fractional-axis-b` · `bg-pre-deemed-fractional-other-kinds` V-P2 등) |

### 6.4 V-P2c-1에 대한 부분 답

- 승계 입주권 · 준공 전 받은 승계 완공 APT(권리를 상속)는 그 줄의 값이 **최종 취득가액이 된다**(M1이 최종 값을 바꾼다).
- 원조합원 · 준공 뒤 받은 승계 완공 APT는 덮인다.
- 왜 갈리는지는 §7에서 추적했다.
- 두 경우 모두 기준 값은 단건과 같다.

### 6.5 시료 정정 (내 오류)

- 첫 측정에서 지분 칸이 2억 ~ 2.8억 어긋났다. 대조 단건의 `contractTotalPrice`를 지분분으로 넣어 양도가액이 두 번 줄었기 때문이다. 단건 화면은 「양도가액」 칸을 `contractTotalPrice`로 동기화한다(`CompanionSaleModeBlock.tsx:295` 주석). 그래서 두 값이 다른 상태는 화면에서 만들 수 없다. 물건 전체 값으로 넣자 반 크기 단건과 같아졌다.
- 토지 출자 시료에 `inheritanceAssetKind: undefined`를 넣자 ⑧ 0건 · ⑫ 400(`landStdPriceAtApproval must be > 0`)이 났다. 이 필드는 타입상 필수이고 기본값이 `"land"`라(`calc-wizard-asset-factory.ts:134`) 화면에서 만들 수 없다. `"land"`로 넣자 200이 났다.
- 토지 출자 ②를 지분율로 줄이지 않은 대조도 4칸을 어긋나게 했다. 고친 뒤 0이다.

### 6.6 확인하지 않은 것

- 상가 · 건물 · 3건 이상 묶음(이 문서에 측정 기록 없음) · 증여 컴패니언 · 축 B · 부담부증여 · 세액(세율 mock · 양도차익 · 장특공제만 비교).
- 사람이 직접 한 브라우저 수동 확인.

## 7. V-P2c-1 원인 추적 (2026-11-09)

**결론: 상속 컴패니언의 지분 축소는 ④에서 같은 비율로 두 번, 따로 일어난다.**

- 한쪽(L1)은 안분 경로에 싣는 값이다.
- 다른 쪽(L2)은 엔진 STEP 0.45가 쓰는 §163⑨ 운반 값이다.
- L2가 실리면 STEP 0.45가 L1에서 온 취득가액을 덮는다. L2가 안 실리는 종류만 L1이 최종 값이 된다.
- 계획서 §0의 가설(`adjustedAcqPrice`가 덮는다)은 틀렸다.

### 7.1 경로 [코드 · 직접]

| 단계 | 위치 | 내용 |
|---|---|---|
| L1 | `transfer-tax-api-companion-payload.ts` `inheritanceValuation` | 평가액 × 지분율 → ⑭ `bundled-apportionment.ts` (2) `calculateInheritanceAcquisitionPrice` → 안분 `allocatedAcquisitionPrice` |
| 안분 뒤 | `bundled-split-helpers.ts:177` | 엔진 입력 `acquisitionPrice = ctx.adjustedAcqPrice ?? a.allocatedAcquisitionPrice`. `adjustedAcq`는 `acquisitionCause === "purchase" && useEstimatedAcquisition`일 때만 채운다(`bundled-apportionment.ts` (4.5)). 그래서 상속 컴패니언은 언제나 L1 값이 들어간다 |
| L2 | `transfer-tax-api-companion-payload.ts` `...(ownsAcquisitionSubobject(asset) ? {} : buildInheritedAcquisitionPayload(asset, ratio, fractional) …)` → `transfer-tax-api-inheritance.ts:91`(의제 전) · `:136`(의제 후) | 평가액 × 지분율을 `inheritedAcquisition.reportedValue`로 싣는다 |
| 덮어쓰기 | `inheritance-acquisition-helpers.ts:57` `if (!rawInput.inheritedAcquisition) return null` → `applyResultToInput`(`:451`) `acquisitionPrice: result.acquisitionPrice` | L2가 있으면 STEP 0.45가 ①②(③) 중 채택 값으로 취득가액을 다시 쓴다. 없으면 L1 값이 그대로 남는다 |
| 갈림 | `ownsAcquisitionSubobject`(같은 파일 하단) | 겸용 · 일반건물 · `right_to_move_in`(§163⑨ 의제 아님) · `redevelopment_apt`(부담부증여 의제 전 아님 ∧ §163⑨ 의제 아님)이면 참 → L2를 싣지 않는다 |

### 7.2 실측 [직접] — 지분 50% · `actual` · 14종(§1 토지 · 주택 4종 + §6 10종)

| 종류 | `inheritedAcquisition` | 안분 echo | 최종 취득가액 | 최종 값을 정하는 줄 |
|---|---|---|---|---|
| 토지 · 주택 상속 1995 · 1983 (4) | 실림(post · pre-deemed) · 100,000,000 | 100,000,000 | 100,000,000 | L2 |
| 분양권 상속 2021 | 실림 · 100,000,000 | 100,000,000 | 100,000,000 | L2 |
| 원조합원 입주권 · 완공 APT · 토지 출자 (6) | 실림 · 150,000,000 | 150,000,000 | ①② 채택 값 + 청산금(예: ① 단독 250,000,000) | L2 |
| 승계 완공 APT 준공 뒤 상속 | 실림 · 225,000,000 | 225,000,000 | 225,000,000 | L2 |
| 승계 완공 APT 준공 전 상속 · 승계 입주권 상속 (2) | **없음** | 225,000,000 | 225,000,000 | **L1** |

### 7.3 뮤테이션 [직접] — cp 백업 → 변형 → 복원 후 `cmp`

| 변형 | 최종 값이 바뀐 종류(14종 × 지분 3 × 모드 2) | 기존 테스트 |
|---|---|---|
| M1 L1 지분 제거(§5 Mc1 · §6.3) | 승계 권리 상속 2종만(지분 칸 4칸씩). 나머지는 echo만 | KILLED — V-P2c anchor 8건 |
| **M3** L2 지분 제거(`transfer-tax-api-inheritance.ts:91` · `:136` 두 곳) | 12종(L1 종류 2종 제외). 예: 토지 50% 900,000,000 → 800,000,000 · 승계 준공 뒤 735,000,000 → 510,000,000. 원조합원 ①+② 50%는 그대로다(축소 안 한 ① 3억 < ② 3.6억이라 ②가 채택됨) | KILLED — api · calc 162파일 중 7파일 35건(`companion-inherit-valuation-share` · `nh99-l14-redev-inherited-member` · `multi-inherited-acq-display-echo` 등) |

### 7.4 판단

- 두 줄은 같은 값(평가액 × 지분율)을 만들어 값 결함이 없다(§6 60칸 · §1 8칸).
- 각 줄이 최종 값을 정하는 종류에서 둘 다 뮤테이션이 잡힌다.
- 코드 변경은 필요 없다.
- 남는 위험: 한쪽만 고치면 종류에 따라 결과가 갈린다. 지분 규약을 바꾸는 PR은 두 곳(L1 · L2)을 함께 봐야 한다. anchor 머리 주석에 이 사실을 적었다.
