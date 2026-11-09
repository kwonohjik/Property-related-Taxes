# §99 계열 × 비주택 자산 — 직접 API로 감면이 그대로 적용된다 (NH-54)

- 상태: **구현 완료(2026-11-09)** — 사용자 결정 Q-1 a · Q-2 a · Q-3 a(「모두 권장안으로」). 결과는 §7. 기준 master `35936240e`.
- 출처: `project_99_993_994_review_2026_11` 리뷰 NH-54 — 「§99 자산 종류 게이트가 ⑤⑧에만 있고 ⑫·엔진에는 없다」. 2026-11-09 코드 대조에서 열린 7건 중 하나로 확인했다.
- 표기: **[직접]** = 이 문서 작성 중 직접 실행·대조. **[코드]** = 코드 읽기만. **확인 필요** = 미측정·미해명.

## 0. 결론

| 질문 | 답 |
|---|---|
| 화면에서 도달하는가 | **아니다.** ⑧이 막는다. 토지로 바꿔 `validateStep2Reductions`를 돌리면 「감면은 주택 양도에만 적용됩니다」로 차단된다 [직접]. 이력 불러오기도 계산 때 ⑧을 다시 탄다 [코드 — 확인 필요: 이력 경로 실행은 안 함] |
| 직접 API로 도달하는가 | **그렇다.** ⑫ Zod에 종류 게이트가 없고, 엔진은 §98 6조문 × 재개발APT·입주권·분양권만 걷어 낸다 [코드: `asset-kind-gate.ts:157-179` — 주석 :159-160이 「토지·건물 등 비주택 × 주택 감면은 엔진이 막지 않는다」고 스스로 적어 두었다] |
| 세액이 얼마나 틀리는가 | §99의3 × 토지 · 건물(토지 제외) · 상가건물: **124,366,000 → 83,610,998, 40,755,002 과소** [직접 — 주택 모양 본문의 `propertyType`만 바꾼 시료]. 앞서 보고한 59,571,000은 **이번에 재현하지 못했다**(그 시료를 다시 찾지 않았다 — 확인 필요) |
| 다른 조문은 | §99(`new_99`) · §97 본문(`rental_97_main`) · 자경(`self_farming`)은 이번 시료로는 **주택에서도 감면이 안 걸려** 영향 크기를 못 쟀다(차이 0) — 종류 게이트가 필요한지는 «조건이 맞는 시료에서의 크기»가 **확인 필요** |
| 엔진 진입에서 막으면 되는가 | **그대로는 안 된다.** 엔진 `propertyType`로 `isReductionAllowedForAssetKind`를 걸어 보니 토지·건물·상가건물 40,755,002는 0으로 닫혔지만, **정상 경로 한 곳의 값이 바뀌었다**(§3.3) — 다건 집계가 겸용 컴패니언을 상가 land·building 카드로 쪼개 각 카드에 §99의3을 싣고 있었다 |
| 권장 | **⑫(Zod) 쪽에서 막는다** — 쪼개기 전의 원본 본문에서 `propertyType` ↔ 감면 id를 단일 소스 술어로 대조(§4 Q-1 a). 엔진 쪽은 건드리지 않는다 |

## 1. 범위

- 비교 축: 감면 id × 엔진 `propertyType`(land · building · commercial_building · right_to_move_in · presale_right · redevelopment_apt). 일반건물은 `generalBuildingValuation`이 없으면 400이라 이번 시료로는 측정하지 못했다.
- 시료: 주택 · 양도 2024-07-01 · 양도가액 8억 · 취득 3억(취득일 2005-06-01 · 계약일 2002-12-01) · 1세대 2주택. 감면 4종(`new_99_3` · `new_99` · `rental_97_main` · `self_farming`)을 폼에 넣어 ④로 본문을 만든 뒤 `propertyType`만 바꿔 단건 route에 직접 POST.
- 측정하지 않은 것: 다건 route 직접 호출 · 일반건물 · 감면 id 전수(≈25종) · 세율표는 mock(정본 세액 아님).

## 2. 측정 방법 [직접]

throwaway probe(미커밋): 폼 → ④(`captureBody`) → 본문 `propertyType` 치환 → 단건 route POST. 감면 있음/없음의 `totalTax` 차이를 본다. ⑧은 `validateStep2Reductions`에 `assetKind: "land"`를 넣어 별도로 확인했다.

## 3. 측정 결과 [직접]

### 3.1 현행 코드 — 직접 API 도달

| 감면 | 주택 | 토지 | 건물 | 상가건물 | 입주권 | 재개발APT | 분양권 |
|---|---|---|---|---|---|---|---|
| §99의3 (감면 있음→없음 차이) | 40,755,002 | **40,755,002** | **40,755,002** | **40,755,002** | 40,755,002 | 40,755,002 | 90,000,000 |
| §99 · §97 본문 · 자경 | 0 | 0 | 0 | 0 | 0 | 0 | 0 (시료가 안 걸림 — 영향 크기 확인 필요) |

굵은 칸이 ⑧이 막는 종류인데 ⑫·엔진이 막지 않는 칸이다. 입주권·재개발APT·분양권은 §99 계열 카테고리 게이트(`NEW_UNSOLD_HOUSING_KINDS`)가 **허용**하는 종류라 결함이 아니다 [코드: `asset-kind-gate.ts:45-50`].

### 3.2 ⑧ ↔ ⑫ 격자

⑧ 게이트 호출: `lib/calc/transfer-tax-validate-reductions.ts:180`(`isReductionAllowedForAssetKind`) [코드]. ⑫에는 같은 술어의 호출이 **없다** — 감면 필수 입력 거울인 `refineReductionRequiredInputs`(`lib/api/transfer-tax-schema-reduction-refines.ts:20`)는 종류를 보지 않는다 [코드]. 이 함수의 호출처는 주 자산 `transfer-tax-schema-refines.ts:164`, 컴패니언 `transfer-tax-schema.ts:200` 두 곳이다 [코드].

### 3.3 엔진 진입 게이트를 시험 적용했을 때 (throwaway · 되돌림)

`stripAssetKindGatedReductions`(`asset-kind-gate.ts:164`)를 «엔진 `propertyType` → 종류» 사상 + `isReductionAllowedForAssetKind` 전 id로 넓혀 회귀 5배치를 돌렸다.

| 배치 | 결과 |
|---|---|
| api | 6426 통과 · **1 실패** — `transfer.route.companion-mixed-use-acq-cause-nh14` purchase 셀: 총세액 242,772,000 → **251,052,000(+8,280,000)** |
| tax-engine | 18998 통과 · **3 실패** — `reduction-detail-cards.anchor` A-1a~c(`self_farming` 시료). 시료의 `propertyType`은 `baseTransferInput` 기본값이다(기본값 값은 **확인 필요**) |
| calc · lib · components | 실패 0 |

- api 1건의 원인 [직접: 걷힌 호출의 스택]: `transfer-tax-aggregate-asset-records.ts:140`(`computeOne`)이 겸용 컴패니언을 주택 파트(`mu-house-*`) · 상가 land · building 카드로 쪼개 각 카드를 `calculateTransferTax`에 넣는다. 상가 카드 `propertyType`은 land · building인데 컴패니언의 §99의3이 그대로 실려 있어, 게이트가 걷으면 값이 바뀐다. **「엔진 `propertyType` = ⑧의 `assetKind`」가 성립하지 않는 경로가 있다.**
- 이 기존 값(242,772,000)이 법령상 맞는지는 **이 PR 범위 밖이다** — 겸용 컴패니언의 상가 파트 카드에 §99의3(감면주택 중과 배제 · 소득 차감)이 실리는 것이 의도인지는 **확인 필요**(별건 V-N1).

## 4. 결정 (Q-1 a · Q-2 a · Q-3 a — 2026-11-09 「모두 권장안으로」)

| 번호 | 질문 | 선택지 | 권장 |
|---|---|---|---|
| Q-1 | 어디서 막을까 | **a** ⑫(Zod)에서 쪼개기 전 원본 본문 대조 — 주 자산(`transfer-tax-schema-refines.ts:164` 곁) · 컴패니언(`transfer-tax-schema.ts:200` 곁), 400. ⑧↔⑫ 정합과 같은 모양 · **b** 엔진 진입(§3.3) — 정상 경로 값이 바뀌므로 V-N1을 먼저 풀어야 함 · **c** 안 막고 문서로만 남김 | **a** |
| Q-2 | 막는 범위 | **a** ⑧과 같은 단일 소스 술어 `isReductionAllowedForAssetKind` 전 id · **b** §99 계열 4개 id만 | **a** (⑧과 똑같이 막아야 «UI 통과↔차단 모순»이 없다) |
| Q-3 | 막는 방식 | **a** 400 + 한국어 메시지(⑧ 문구 재사용) · **b** 걷어 내고 고지(US-44 §98 방식) | **a** (US-44는 옛 이력 입력을 지키려던 것 — 이번은 ⑧을 항상 거치는 입력이라 직접 호출자에게만 해당. 조용히 다른 세액을 주는 것보다 오류가 낫다) |

## 5. 미검증 · 확인 필요

| 번호 | 내용 |
|---|---|
| V-1 | ⑫ 컴패니언 본문의 `propertyType` 필드 이름과 값 집합(주 자산은 `transfer-tax-schema-base-shape.ts:58`) — 구현 때 확인 |
| V-2 | 다건 route(`properties[]`)는 `addPropertyRefines`(`transfer-tax-schema.ts:497`)를 타므로 같은 refine이 닿을 것으로 보이나 **직접 호출은 안 했다** |
| V-3 | 정상 경로에서 원본 본문 `propertyType`이 land · building · commercial_building · general_building인데 ⑧ `assetKind`는 주택인 조합이 있는지 — ④ `primaryEnginePropertyType`(`transfer-tax-api-helpers.ts:384`)은 주 자산에 한해 `assetKind`와 1:1(겸용 → `mixed-use-house`, 재개발 `right` → `right_to_move_in`)임을 읽었다. 컴패니언 쪽은 확인 필요 |
| V-4 | §99 · §97 본문 · 자경 × 비주택의 세액 영향 크기(조건이 맞는 시료 필요) |
| V-5 | 일반건물 × §99 계열(`generalBuildingValuation` 있는 시료 필요) |
| V-N1 | 겸용 컴패니언의 상가 파트 카드에 §99의3이 실려 세액이 움직이는 것이 의도인지(§3.3) — 별건 |
| — | 사람이 직접 한 브라우저 수동 확인은 하지 않았다 |

## 6. 구현 계획 (Q-1 a · Q-2 a · Q-3 a일 때, 결정 후 같은 PR)

1. `refineReductionRequiredInputs`에 `propertyType`을 받는 인자를 더하고 `isReductionAllowedForAssetKind` 호출 → 400. 호출처 2곳(`transfer-tax-schema-refines.ts:164` · `transfer-tax-schema.ts:200`)에 전달. 엔진 `propertyType` → 종류 사상은 `mixed-use-house` → housing, 그 외 1:1, 미지의 값은 막지 않음.
2. anchor: 감면 id × 종류 격자 — ⑧ 차단 칸은 ⑫ 400, ⑧ 허용 칸은 ⑫ 200 (⑧↔⑫ 정합 격자). 주 자산 · 컴패니언 · 다건.
3. 뮤테이션: 술어 제거 · 종류 사상 한 칸 누락 · 컴패니언 호출 제거.
4. 회귀 5배치(api · lib · components · calc · tax-engine) · tsc · eslint. 화면 변경 없음 → Playwright 불필요.
5. 이 문서 §7(구현 결과) 추가.

## 7. 구현 결과

| 항목 | 결과 |
|---|---|
| 코드 | ⑫ `refineReductionAssetKindGate`(`lib/api/transfer-tax-schema-reduction-refines.ts`) 신설 — 주 자산 `transfer-tax-schema-refines.ts`(`propertyType`) · 컴패니언 `transfer-tax-schema.ts`(`assetKind`) 두 곳에서 호출, 400 · 경로 `…reductions.N.type`. 와이어 종류 → 게이트 종류 사상 `reductionAssetKindFromWire`(겸용 `mixed-use-house`·`mixed_use_house` → 주택, 모르는 값은 막지 않음)와 문구 `assetKindGateMessage`를 `asset-kind-gate.ts`에 두고, ⑧(`transfer-tax-validate-reductions.ts`)도 같은 함수를 쓰게 바꿨다(문구 불변 — 단일 소스). 엔진은 건드리지 않았다 |
| 안전망 anchor | `transfer.route.reduction-asset-kind-gate-nh54.anchor.test.ts` 38건 — 감면 4종 × 종류 7 = 28칸 ⑧↔⑫ 격자(⑧이 막는 칸은 ⑫도 같은 문구 400, 허용 칸은 게이트 문구 없음) · §99의3 × 토지·건물·상가건물 고정값(주택 83,610,998 → 400) · 입주권·재개발APT·분양권 200 유지 · 자경 반대 방향 문구 · 컴패니언 3종 400 + 주택 통과 |
| 뮤테이션 5/5 KILLED | cp 백업 → 변형 → 이 anchor + `companion-mixed-use-acq-cause-nh14` → 복원 → `cmp`(5/5). M1 주 자산 호출 제거 21실패 · M2 컴패니언 호출 제거 3실패 · M3 사상에서 land 누락 5실패 · M4 `mixed_use_house`를 land로 사상 16실패(겸용 컴패니언 anchor 포함) · M5 문구 함수가 항상 undefined 8실패(고정값 셀이 잡는다 — 격자는 ⑧·⑫가 같은 함수라 함께 통과하므로 고정값이 필요하다) |
| 회귀 | api 485파일 6465 · tax-engine 1502파일 19001 · calc 827파일 11588 · lib 262파일 3357 · components 750파일 6895 — **전부 통과(실패 0)**. §3.3 엔진 시험 적용 때의 api 1건·tax-engine 3건 실패는 ⑫ 방식에서 나오지 않았다 |
| 정적 검사 | `tsc --noEmit` 0건 · 변경 파일 eslint 0건 |
| Playwright | **돌리지 않았다** — 화면 변경 없음(⑧ 문구는 그대로) |

### 남은 확인 필요
- V-2 다건 route 직접 호출은 anchor에 넣지 않았다(같은 `addPropertyRefines`를 타는 것은 코드로만 확인).
- V-4 · V-5 · V-N1은 그대로다(§5).
- 사람이 직접 한 브라우저 수동 확인은 하지 않았다.
