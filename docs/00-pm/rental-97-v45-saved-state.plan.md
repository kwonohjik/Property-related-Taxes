# 레거시 `long_term_rental`·저장 상태 경로로 한 카드에 임대 조문이 둘 이상 담기는가 (V-6 계획서 V-4·V-5)

- 상태: **구현 완료(Q-1 a · Q-2 a, Q-3은 #3144로 이관)**. 기준 master `cc4b91094`. 구현 결과는 §7.
- 출처: `docs/00-pm/rental-97-overlap-v6.plan.md` §5 V-4(legacy `long_term_rental` 도달 여부) · V-5(저장 이력·정규화로 UI에 임대 조문이 둘 이상 담길 수 있는지).
- 도달 경로: 패널 라디오가 같은 범주를 하나만 남겨 클릭으로는 임대 조문이 하나만 담긴다(§2.4). 직접 API 호출은 ⑫가 막는다(V-6, #3126). 이번은 **저장 상태 경로**(sessionStorage 복원 · IndexedDB 이력 「편집」 · 백업 가져오기 · 다건 편입)다.

## 0. 결론

| 항목 | 내용 |
|---|---|
| V-4 ① 이관이 중복 조합을 만드는가 | **이관 코드는 중복을 새로 만들지 않는다.** 구 폼-전역 스키마는 항목 하나뿐이라 `reductions`를 통째로 `[rental_97_3]`로 교체한다. 자산 폼 경로는 원소별 1:1 치환(`map`)이라 **입력에 이미 있던 항목을 그대로 둔다** — 입력이 `[LTR, 97의4]`면 `[97의3, 97의4]`, `[LTR, 97의3]`이면 같은 id 둘 `[97의3, 97의3]`이 된다 [측정 §3.1]. 다만 그 입력(LTR과 `rental_97_*`가 한 카드에 공존)을 만든 UI 버전이 **git 이력상 없다**(§2.5) |
| V-4 ② API `type:"long_term_rental"` | **400.** 본 자산 · 컴패니언 모두 `reductions.N.type: Invalid input`(`reductionSchema` 판별 유니온에 없음). strip이 아니다 [측정 §3.4]. 단 `priorReductionUsage[].type`에는 아직 허용된다(200) |
| V-4 ③ 엔진 잔존 참조 | 계산 분기는 **없다**(`calcReductions`에 LTR 분기 없음 — 직접 호출 시 감면 0). 남은 것은 표·라벨·타입뿐이다(§2.6). `calcReductions` 안의 «구버전 sessionStorage 마이그레이션 전용» 주석(`transfer-tax-reductions-calc.ts:424-426`)은 LTR 분기가 사라진 뒤 낡았다 |
| V-5 저장 상태로 임대 둘 이상이 담기는가 | **담긴다.** 정규화·복원 어느 경로도 같은 범주 중복을 정리하지 않고 순서까지 그대로 보존한다(15쌍 전부, `mergePersistedWizard` 포함) [§3.2]. 저장 상태에 이미 있어야 한다 — UI 클릭·이관이 새로 만들지는 않는다. 현실적 출처는 **손으로 고친 백업 파일/세션**뿐이다(백업 가져오기는 `inputData`를 검증하지 않는다 — `backup-validate.ts:49`) |
| ⑧이 막는가 | 명문 배제 3쌍(§97의3×§97의4 · §97의5×§97의3/4)과 §97의3/4 × (본문·단서·§97의2)는 **막는다**(15쌍 중 9쌍). 같은 문구가 ⑫에서도 400. **본문·단서·§97의2·§97의5 사이 6쌍은 ⑧·⑫ 모두 통과한다**(§3.3) |
| ⑤가 표시하는가 | 둘 다 ON으로 보인다. **중복 배너는 없다.** §127⑦ 배너(`trackConflict`)는 §127⑦ 분류 충돌일 때만 뜨고 명문 배제 3쌍에는 뜨지 않는다 [렌더 §3.5]. 안내는 「다음」을 눌렀을 때의 ⑧ 메시지뿐이다 |
| `toggleGroupRadio` | 같은 **범주** 전체를 지우고 새 항목 하나를 붙인다(`UnifiedReductionPanel-defaults.ts:71-89`). 저장 상태 로딩 때는 **호출되지 않는다**(복원 경로에 없음). 중복 상태에서 선택된 카드를 끄면 **범주 전체가 비워지고**, 안 고른 카드를 켜면 그 하나만 남는다 — 막다른 길은 아니다 [§3.5] |
| **새로 발견** | 본문·단서·§97의2·§97의5 사이 쌍은 ⑧·⑫를 통과한 뒤 **배열 순서로 감면액이 갈린다**: `[본문, 단서]` 84,530,000 · `[단서, 본문]` 169,060,000. V-6 계획서 §1은 이 쌍을 «`calcReductions` max 패턴이 맡는다»며 제외했는데 실측은 max가 아니다(§3.3). UI로는 못 만들고 API·저장 상태로만 닿는다 → Q-3 |

정정(브리핑과 다른 점): **«다음» 버튼은 현재 단계를 검증한다**(`TransferTaxCalculator.tsx:241-247`). 검증 없이 이동하는 것은 **단계 탭**이다(`:262` 주석)이고, «계산하기»는 전 단계를 다시 검증한다(`:264-280`).

## 1. 범위

- 대상: ① 레거시 `long_term_rental` 이관 4경로와 API·엔진 잔존 ② 저장 상태가 한 카드 `reductions`에 임대 범주 id 둘 이상을 담는 경로 ③ 담겼을 때 ⑧·⑫·⑤ 동작.
- 제외: 임대 조문 효과 산식 자체 · 다건 `properties[]` ⑧ 경로 실측(코드만 확인, §5) · 사용자 로컬 IndexedDB에 실제로 몇 건 있는지(측정 불가) · `new_housing`·`unsold_housing` 레거시(LTR와 같은 처지이나 이번 대상 아님).

## 2. 코드 실독

### 2.1 이관 4경로 [직접]

| 경로 | 위치 | 동작 |
|---|---|---|
| 구 폼-전역 스키마(`assets` 없음) | `calc-wizard-migration.ts:167-190` | `primaryAsset.reductions = [legacyLongTermRentalToRental973(...)]` — **대입**(교체). 구 폼은 `reductionType` 라디오 하나(`0e6dbdaf7^:app/calc/transfer-tax/steps/Step5.tsx:39-42`)라 입력도 하나. 동반자산은 `reductionType: "" | "self_farming"`뿐(`0e6dbdaf7^:lib/stores/calc-wizard-store.ts:205`)이라 구 스키마에서 LTR 동반자산은 만들 수 없다 |
| 자산 폼(세션 복원 · 이력 「편집」 · 다건 편입 공통) | `calc-wizard-asset-migrate-rental-split.ts:29-34` | `a.reductions.map(...)` — LTR 원소만 `legacyLongTermRentalToRental973`로 **1:1 치환**. 다른 원소는 손대지 않고 중복 검사·범주 정리 없음. 호출: `calc-wizard-asset-migrate.ts:225` |
| 호출 경로 3곳 | 세션: `calc-wizard-store.ts:291-301`(`migratePersistedTransferForm`), 이력 편집: `transfer-resume-entry.ts:123-138`, 다건: `multi-transfer-tax-store.ts:326-327` | 세 곳 모두 위 `migrateAsset`를 지난다 |
| IndexedDB v4 업그레이드 | `db.ts:120-125`, `reduction-reclassification.ts:96-99` | `calculations.inputData.assets[].reductions[].type`만 제자리 치환(`long_term_rental`→`rental_97_3`). 다른 필드는 그대로 두고 **다건(`properties[].form.assets`)은 대상이 아니다** — 다건은 읽을 때 위 `migrateMultiForm`이 맡는다. v4 이후 저장분은 이 업그레이드를 받지 않고 읽을 때 정규화만 받는다 |
| 치환 결과 | `legacy-rental-reduction.ts:23-52` | 등록일·임대개시일은 비움(없는 사실을 만들지 않음). `rentIncreaseViolationMode`는 구 폼 «임대료 인상률(%)»(`rentIncreaseRate`, 구 기본값 `"5"` — `116a03fee^:Step5.tsx:26`)가 5 초과면 `has_violation`, 아니면 `none` |

### 2.2 ⑧이 막는 방식 [직접]

- `validateStep2Reductions`(`transfer-tax-validate-reductions.ts:115`)는 먼저 카드 전체 id로 §127⑦ 분류 충돌을 본다(`:149-150`), 이어 `reductions`를 돌며 `rental97SeriesIssue`를 부른다. 명문 배제 3쌍은 그 안에서 **필드 검사 뒤에** 발화한다(`transfer-tax-validate-rental-97.ts:171-172`). 그래서 이관 직후처럼 날짜가 빈 §97의3이 첫 항목이면 «임대개시일을 입력하세요»가 먼저 나오고, 채운 뒤에야 중복 문구가 나온다(§3.1 E).
- 호출처: «다음»(`TransferTaxCalculator.tsx:241-247`) → `collectWizardStepIssues` → `collectStepIssues(2)`(`filing-unit-correction.ts:43-50`) → `validateStep2Reductions`(`transfer-tax-validate.ts:549`). «계산하기»(`handleSubmit` `:276-280`)는 `passesAllSteps`(`:264`)로 전 단계를 다시 본다.
- ⑫: `refineReductionTrack127_7`(`transfer-tax-schema-reduction-refines.ts:54-79`)가 같은 `findRental97StatutoryOverlap`을 쓴다. 본 자산(`transfer-tax-schema-refines.ts:166`)·컴패니언(`transfer-tax-schema.ts:202`)·다건 항목(`propertyItemSchema.superRefine` → `addPropertyRefines`, `transfer-tax-schema.ts:500`)이 같은 refine을 지난다(코드 읽기).

### 2.3 ⑤ 패널 [직접]

- 각 임대 카드의 체크는 `reductions.some(r => r.type === id)`(`UnifiedReductionGroupSection.tsx:272`)라 중복 상태를 그대로 켠 채로 그린다. 서브폼은 `reductions.find(r => r.type === id)`라 **같은 id가 둘이면 첫 항목만** 편집된다.
- 배너: `trackConflict`(`UnifiedReductionPanel.tsx:378-398`)는 `findTrack127_7Conflict`만 본다. 명문 배제 3쌍은 `RENTAL_STATUTORY_PAIR_IDS`로 그 함수에서 빠져 있어(`income-deduction-router.ts:147`) 배너 대상이 아니다. 패널 컴포넌트에서 `findRental97StatutoryOverlap` 참조는 0건이다(grep).

### 2.4 `toggleGroupRadio` [직접]

`UnifiedReductionPanel-defaults.ts:71-89`: ① 같은 `category`의 기존 항목을 모두 제거(`LEGACY_TO_CATEGORY`로 `long_term_rental`도 `rental`로 본다) ② `alreadySelected`면 제거만 하고 끝 ③ 아니면 새 기본값 하나를 붙인다. 호출은 `UnifiedReductionPanel.tsx:253-256`의 `toggleGroup` 하나뿐이고, 임대 id를 추가하는 다른 코드는 없다(`getReductionDefault` 호출처 전수 grep: `HouseEntryCountExclusionSection.tsx:80`은 주택 수 제외 3유형 전용). `Step5.tsx:67-69`의 `toggleReduction`은 자경·수용만 받는다. **라디오 클릭 경로 결론: 범주당 하나, 임대 둘 이상 불가.** 저장 상태 로딩에는 이 함수가 끼지 않는다 — 복원은 `migrateAsset`(§2.1)뿐이라 라디오 규칙이 다시 적용되지 않는다.

### 2.5 git 이력 [직접, `git log -S`/`git show`]

| 시점 | 사실 |
|---|---|
| ~2026-04-22 | 폼-전역 `reductionType` 라디오 하나 |
| `0e6dbdaf7` 2026-04-23 | 자산별 `reductions[]` + 평면 체크박스(`toggleReduction`) — LTR는 다른 감면(신축·미분양·자경·수용)과 **함께** 담길 수 있었다. `rental_97_*` id는 아직 없음 |
| `116a03fee` 2026-05-07 | `toggleGroupRadio`·`LEGACY_TO_CATEGORY` 도입(레거시 id를 같은 범주로 취급) |
| `6b40891ac` 2026-05-07 | `rental_97_3`이 저장소에 처음 등장(엔진) |
| `7e6008b03` 2026-06-11 | §97 시리즈 본 구현 — 패널이 `rental_97_*`를 생성 |
| `a53f64cfe` 2026-09-14 | R-4: LTR를 §97의3으로 이관 |

→ LTR와 `rental_97_*`가 **같은 카드에 있던 시점의 UI가 없다**(LTR가 있던 시기엔 `rental_97_*`가 없었고, `rental_97_*`를 고를 수 있게 된 뒤에는 라디오가 LTR를 지웠다). LTR와 **다른 범주**(신축·미분양·자경)의 공존은 가능했다 — 그 경우 이관 결과는 §127⑦ 충돌로 ⑧·⑫가 막는다(§3.1).

### 2.6 `long_term_rental` 잔존 참조 [직접, grep `lib`·`app`·`components`]

계산 분기: **없음**. 읽는 곳은 전부 표·라벨·타입이다.
`transfer-tax-aggregate-pickers.ts:237`(조문 근거 문자열) · `transfer-tax-rural-surtax.ts:108`(농특세 과세 표) · `transfer-reduction-type-labels.ts:28`(라벨 — 저장된 옛 결과 표시용) · `transfer-reductions/asset-kind-gate.ts:266` · `income-deduction-router.ts:163`(세액감면형 id 목록) · `types/transfer-reduction-input.types.ts:55`(타입 유니온 멤버) · `schemas/rate-table.schema.ts:87`(DB 규칙 스키마, 사용처는 `longTermRentalRuleSetSchema` 정의 외 참조를 찾지 못함 — 확인 필요) · `UnifiedReductionPanel-defaults.ts:66` · `lib/api/transfer-tax-schema.ts:125`(`PRIOR_REDUCTION_USAGE_TYPES`). `MultiHouseSurchargeDetailCard.tsx:34`·`multi-house-surcharge.types.ts:753`의 `long_term_rental`은 중과 배제 유형으로 **다른 도메인**이다.

## 3. 측정 [직접]

### 3.1 방법과 V-4 이관 결과

throwaway probe(`__tests__/lib/zz-probe-v45.test.ts` · UI는 `.test.tsx`, 커밋하지 않고 삭제). 순수 함수 직접 호출: `migrateAsset` · `migratePersistedTransferForm` · `mergePersistedWizard` · `migrateReductionReclassification`(가짜 tx) · `toggleGroupRadio`. ⑧은 `validateStep2Reductions(2, form)`·`collectStepIssues(2, form)`, ⑫는 route `POST`(세율표 폴백, V-6 프로브 틀 재사용). LTR 시료: `{type:"long_term_rental", rentalYears:"8", rentIncreaseRate:"3"}`.

| 입력 `reductions` | `migrateAsset` 출력 | ⑧ (이관 직후) | ⑧ (사용자가 §97의3 날짜를 채운 뒤) |
|---|---|---|---|
| `[LTR]` | `[97의3]` (빈 날짜, 모드 `none`) | «§97의3 적용: 임대개시일을 입력하세요.» | 통과 |
| `[LTR, 97의4]` | `[97의3, 97의4]` | 같은 임대개시일 문구 | **§97의3②** 중복 문구 |
| `[97의4, LTR]` | `[97의4, 97의3]` | — | — |
| `[LTR, 97의5]` | `[97의3, 97의5]` | 임대개시일 문구 | **§97의5②** 중복 문구 |
| `[LTR, 97의3]` | `[97의3, 97의3]`(같은 id 둘) | 임대개시일 문구 | **통과**(§3.6) |
| `[LTR, LTR]` | `[97의3, 97의3]` | — | — |
| `[LTR, new_housing]` | `[97의3, new_99]` | §127⑦ 중복배제 | §127⑦ 중복배제 |
| `[LTR, self_farming]` | `[97의3, self_farming]` | §127⑦ 중복배제 | §127⑦ 중복배제 |
| `[LTR]` 인상률 `"8"` | 모드 `has_violation`, `rentHistory: []` | — | — |

- 세션 복원 전체 `mergePersistedWizard`: `[LTR, 97의4]` → `[97의3, 97의4]`(같음).
- 구 폼-전역 스키마: LTR 한 건 → `assets=1`, `[97의3]`. (합성 입력으로 동반자산 `reductionType:"long_term_rental"`을 넣으면 **조용히 `[]`로 버려진다** — 구 스키마가 만들 수 없는 입력이라 실도달은 없다, §2.1.)
- IndexedDB v4 업그레이드(가짜 tx) 후 이어서 `migrateAsset`: `[LTR, 97의3]` → `[97의3, 97의3]` · `[LTR, 97의4]` → `[97의3, 97의4]` · `[LTR, 97의5]` → `[97의3, 97의5]` · `[LTR, new_housing, unsold_housing]` → `[97의3, new_99, unsold_98_3]`. 치환 건수는 각 1(3).
- 엔진 직접 `calcReductions(100,000,000, [LTR])` → 감면 0(분기 없음). 같은 호출에서 `new_housing`(50,000,000)·`unsold_housing`(100,000,000)은 아직 감면을 낸다.

### 3.2 정규화는 임대 중복을 보존한다 (15쌍)

임대 6종 `rental_97_main·proviso·2·3·4·5`의 모든 쌍 15개를 `migrateAsset`에 통과시켰다 — **15쌍 전부 입력과 같은 순서·같은 원소로 출력**됐다.

### 3.3 ⑧·⑫ — 15쌍 [단독 대조 포함]

| 쌍 | ⑧ | ⑫ |
|---|---|---|
| 97의3×97의4 | §97의3② 문구 | 400 · 같은 문구 |
| 97의3×97의5 · 97의4×97의5 | §97의5② 문구 | 400 · 같은 문구 |
| 97의3 또는 97의4 × (본문·단서·§97의2) 6쌍 | §127⑦ 중복배제 | 400 · 같은 문구 |
| **본문×단서 · 본문×§97의2 · 단서×§97의2 · 5×(본문·단서·§97의2)** 6쌍 | **통과** | **200** |

마지막 줄 6쌍(감면액, 같은 카드·같은 입력 — 취득일 1995-02-01(본문·단서) / 2000-06-01(§97의2)):

| 순서 | 감면액 | 적용된 조문 |
|---|---|---|
| `[본문, 단서]` | 84,530,000 | 본문 (단독: 본문 84,530,000 · 단서 169,060,000) |
| `[단서, 본문]` | **169,060,000** | 단서 |
| `[단서, §97의2]` | 169,060,000 | 단서 (단독 둘 다 169,060,000) |
| `[§97의2, 단서]` | 169,060,000 | §97의2 |
| `[본문, §97의2]` | 84,530,000 | 본문 (단독: §97의2 169,060,000) |
| `[§97의2, 본문]` | 169,060,000 | §97의2 |
| `[§97의5(부적격 시료), 본문]` | **0** | §97의5 부적격(`rental97TaxDetail` id=`rental_97_5`, 적격 false) |
| `[본문, §97의5]` | 84,530,000 | 본문 |
| `[§97의5, 단서]` / `[단서, §97의5]` | 0 / 169,060,000 | 위와 같은 양상 |
| `[§97의5, §97의2]` / `[§97의2, §97의5]` | 0 / 169,060,000 | 〃 |

→ 합산(두 배)은 없고 **첫 항목이 승자**이며, 첫 항목이 부적격이면 둘째를 보지 않는다. 코드 근거: `evaluateRental97TaxAmount`가 첫 실질 항목에서 `return dispatch(...)`(`rental-97-router.ts:237-246`). §97의5 시료는 부적격 구성이라 «적격 §97의5 × 다른 조문»의 숫자는 측정하지 못했다(확인 필요).

### 3.4 API — V-4 ②

| 요청 | 결과 |
|---|---|
| `reductions: [{type:"long_term_rental", rentalYears:8, rentIncreaseRate:0.03}]` | 400 · `reductions.0.type: Invalid input` |
| `[rental_97_3, long_term_rental]` | 400 · `reductions.1.type` |
| `[{type:"long_term_rental"}]` | 400 |
| `companionAssets[0].reductions: [{type:"long_term_rental"}]`(2자산 본문) | 400 · `companionAssets.0.reductions.0.type` |
| `priorReductionUsage: [{year:2020, type:"long_term_rental", amount:1000}]` | **200** (`lib/api/transfer-tax-schema.ts:125`). 엔진 효과는 코드상 «한도군 밖 유형은 한도 없음»(`lookupLimit`, `aggregate-reduction-limits.ts`)이라 없을 것으로 보이나 세액 비교는 하지 않았다(확인 필요) |

### 3.5 ⑤·`toggleGroupRadio` — 컴포넌트 렌더 (jsdom, `UnifiedReductionPanel` 상태 래퍼)

| 시나리오 | 결과 |
|---|---|
| 저장 상태 `[97의3, 97의4]` 렌더 | 임대 카드: 본문·단서·§97의2 off(시한 외 비활성) · **§97의3 ON · §97의4 ON** · §97의5 off. 중복 안내 문구 없음(택일입니다·중복하여·하나만 선택·§127⑦·§97의3② 전부 미포함) |
| `[97의3, 97의5]` 렌더 | §97의3 ON · §97의5 ON · 안내 없음 |
| 선택된 §97의3 스위치 클릭 | 상태 `[]` — **범주 전체가 비워진다** |
| 미선택 §97의5 스위치 클릭(`[97의3, 97의4]`에서) | 상태 `[rental_97_5]` |
| `toggleGroupRadio` 순수 호출 | `[97의3]` + 97의4 클릭 → `[97의4]` · `[97의3,97의4]` + 97의3(선택됨) → `[]` · `[97의3,self_farming]` + 97의4 → `[self_farming, 97의4]` |

### 3.6 같은 id 중복

`[97의3, 97의3]` · `[97의4, 97의4]` · `[본문, 본문]` · `[97의5, 97의5]`: ⑧ 통과 · ⑫ 200 · 결과(결정세액·장특·감면)가 **단독과 동일**(예 97의3: 131,726,666 · 장특 303,333,333). 해롭지 않다. 다만 서브폼은 첫 항목만 편집한다(§2.3).

## 4. 결정 (Q-1 a · Q-2 a 확정 · Q-3은 #3144로 이관)

- **Q-1 a 확정** — 구현 변경 없음, 고정 anchor 한 파일(§6·§7).
- **Q-2 a 확정** — ⑤ 배너 추가 안 함, 코드 변경 없음. 짝이 되는 «패널 라디오가 범주째 비운다» 한 가지만 Q-1 anchor의 D절로 고정했다.
- **Q-3 이관** — 세액감면형 임대 쌍의 순서 의존은 #3144에서 `src`를 바꿔 처리한다. 이 문서의 anchor는 그 6쌍의 ⑧·⑫ 동작을 고정하지 않는다(머지되면 400으로 반전되므로).

아래 표는 결정 전 검토 내용을 그대로 둔다.

문제가 «현재 사용자 경로»에서는 재현되지 않는다. 아래는 모두 UI·이관이 만들지 못하는 상태를 어떻게 다룰지에 관한 것이다.

### Q-1. V-4(레거시 `long_term_rental`)에 코드 변경이 필요한가

| 안 | 내용 | 비용·위험 |
|---|---|---|
| **a (권장)** | 구현 변경 없음. 고정 anchor 한 파일: ① 이관은 1:1 치환이며 같은 범주의 다른 id를 지우지도 합치지도 않는다 ② `[LTR, 97의4]` 이관 뒤 «채운 뒤» ⑧이 §97의3② 문구로 막는다 ③ API `long_term_rental`은 본 자산·컴패니언 모두 400 | 작다. 「로드 때 임대 하나만 남기기」 같은 자동 선택이 들어오면 ①이 깨져 알려 준다 |
| b | 이관 때 같은 범주에 이미 있는 id가 있으면 LTR를 버린다 | 어느 쪽을 남길지 법 근거가 없다(§97의3②는 승자를 정하지 않는다 — V-6 Q-1). 자동 선택 금지 원칙과 충돌 |
| c | 변경 없음, anchor도 없음 | 이관 경로 변경 시 안전망이 없다 |

### Q-2. 저장 상태로 담긴 명문 배제 3쌍을 ⑤에 표시하나

| 안 | 내용 | 비용·위험 |
|---|---|---|
| **a (권장)** | 현행 유지. «다음»·«계산하기»의 ⑧ 문구가 안내하고 카드를 끄면 범주가 비워져 다시 고를 수 있다 | UI·이관이 못 만드는 상태라 노출 빈도가 매우 낮다(손으로 고친 백업/세션뿐). 문구 «하나만 선택하세요»와 달리 한 카드를 끄면 둘 다 꺼지는 점은 불편하나 막다른 길은 아니다 |
| b | 패널에 배너 추가(`findRental97StatutoryOverlap` 재사용) | 새 UI 요소 + 톤·문구 규칙(`ToneCard`) · 렌더 테스트. 효과 대비 크다 |
| c | 로드 시 정규화로 하나만 남긴다 | 승자를 법이 정하지 않는다 — 자동 선택 금지 |

### Q-3. 세액감면형 임대 쌍(본문·단서·§97의2·§97의5)의 순서 의존을 어떻게 하나 — **새로 발견**

조특법 §127⑦은 «둘 이상의 양도소득세의 감면규정을 동시에 적용받는 경우에는 그 거주자가 선택하는 하나의 감면규정만을 적용한다»고 정한다 [KoreanLaw MCP, 조특법(MST 284389, 시행 2026-09-18) 제127조 제7항]. 실측은 이 쌍이 ⑧·⑫를 통과하고 배열 순서로 금액이 갈린다(§3.3). V-6 계획서는 «세액감면형끼리 — `calcReductions` max 패턴이 맡는다»며 제외했지만, 임대 평가기는 후보를 하나(첫 항목)만 내므로 max에 닿기 전에 갈린다. 도달: 저장 상태 · 직접 API (UI는 불가).

| 안 | 내용 | 비용·위험 |
|---|---|---|
| **a (권장)** | ⑧·⑫에서 임대 범주 안 **세액감면형 쌍**도 §127⑦ 선택 문구로 막는다(`findTrack127_7Conflict`에 «같은 범주 안 세액감면형 둘 이상» 규칙 추가, ⑧↔⑫ 단일 소스). 자동 선택은 하지 않는다 | V-6과 같은 구조라 작다. §127⑦이 «선택»을 납세자에게 두므로 V-6 원칙(자동 선택 안 함)과 정합. 확인 필요: 같은 조(§97 본문·단서)의 호 분기를 «둘 이상의 감면규정»으로 볼지의 법리 — 막지 않는 쪽이 필요할 수 있다 |
| b | 엔진이 임대 세액감면형 후보를 모두 평가해 `calcReductions` max에 넣는다 | 승자를 엔진이 고른다(§127⑦ «선택» 위반 소지) · 평가기 3곳 변경 |
| c | 현행 유지 + 문서화 | 정상 경로 밖이라 효과는 작으나, 같은 입력의 순서만 바꿔 84,530,000이 갈린다 |

권장 a이되 **별도 계획서·PR**로 다룬다(이번 문서의 V-4·V-5 결론과 독립).

## 5. 미검증 · 확인 필요

- V-1: 사용자 로컬 IndexedDB·세션에 `long_term_rental`이 남은 실제 건수 — 클라이언트 로컬이라 측정 불가. 2026-09-14 이후 «편집»으로 한 번 열면 이관되어 저장된다는 점은 코드로만 확인.
- V-2: 손으로 고친 백업 파일을 가져와 «편집»하는 end-to-end — 가져오기 검증이 `inputData`를 열어 보지 않는다는 것(`backup-validate.ts:49`)과 «편집» 경로가 `migrateAsset`뿐이라는 것은 코드로 보았고, 실제 가져오기→편집 실행은 하지 않았다.
- V-3: 다건 `properties[]` ⑧ — 단건 마법사를 재사용한다는 것(`MultiTransferSteps.tsx` 주석)과 ⑫가 `propertyItemSchema.superRefine`을 지난다는 것은 코드 읽기뿐이고 다건 route 실측은 하지 않았다(상위 V-3 계승).
- V-4: 적격 §97의5와 다른 조문의 조합 금액(§3.3의 §97의5 시료는 부적격). 본문·단서·§97의2끼리의 숫자는 각각 단독 적격인 시료로 측정했다.
- V-5: Playwright·브라우저 실행은 하지 않았다 — ⑤ 결과는 jsdom 렌더이고, 실제 브라우저 CSS·스크롤 동작은 **확인 필요 — Playwright 필요**.
- V-6: `rate-table.schema.ts:87`의 `longTermRentalSchema`가 런타임에서 읽히는지(§2.6).
- 법령: §97의3②·§97의5②는 V-6·V-2 계획서의 실독 인용을 따랐고, 이번에 직접 재조회한 것은 §127⑦·§97의3②(MST 284389)뿐이다.
- 부수 관찰(건드리지 않음): `calcReductions`의 `new_housing`·`unsold_housing` 레거시 분기는 아직 살아 있다(§3.1) — LTR와 같은 처지의 별건. `transfer-tax-reductions-calc.ts:424-426` 주석은 LTR 제거 뒤 낡았다.

## 6. 구현 계획 (Q-1 a · Q-2 a — 실행함)

1. 테스트 `__tests__/lib/rental-97-legacy-ltr-migration.anchor.test.ts` 한 파일(계획서 초안의 위치·이름 그대로. 순수 함수 + route + jsdom 불필요한 순수 호출). 구성: A-1 `migrateAsset` 1:1 치환 · A-2 나머지 이관 경로(세션 복원 · 구 폼-전역 · IndexedDB v4) · B ⑧·⑫ · C API 400 · D 패널 라디오(Q-2 a의 짝).
2. 뮤테이션 10종(§7.2). 계획서 초안의 ③ «LTR 치환을 건너뛰기»·② «`reductionSchema`에 LTR 추가»·① «같은 범주 하나만 남기기»를 모두 포함했다.
3. 소스 코드 변경 없음. tsc/eslint, 회귀 5묶음.

## 7. 구현 결과 [직접]

### 7.1 테스트

- 새 anchor **28건** 통과(`vitest run`, node 환경). 이 테스트는 동작을 바꾸지 않는 **고정**이라 구현 전에 실패하는 것이 없다 — 안전망은 §7.2 뮤테이션으로 확인했다.
- 전제 테스트: 시료가 정말 레거시 타입인지 · 채운 §97의3 단독이 ⑧을 통과하고 ⑫가 200인지(픽스처가 «채운 상태») · 이관 직후 빈 §97의3 단독은 «임대개시일» 문구로 막히는지 · 바꾸기 전 API 본문이 200인지 · 컴패니언 본문이 §97의3 한 건인지.
- 고정한 것: ① 자산 폼 경로 `[LTR, 97의4/97의5/97의3/LTR/본문/신축/자경]`과 `[97의4, LTR]` 이관 결과(원소별 1:1 치환 · 순서 · 같은 id 둘을 합치지 않음 · 다른 원소의 사용자 입력 보존), 임대 6종 30쌍(15쌍 × 두 순서)이 입력 그대로 나옴 ② 세션 복원(`migratePersistedTransferForm`·`mergePersistedWizard`) · 구 폼-전역 `[97의3]`로 교체 · IndexedDB v4 `type`만 제자리 치환 ③ ⑧: 이관 직후 «임대개시일» → 채운 뒤 §97의3②·§97의5② 문구, ⑫도 같은 문구로 400, 신축·자경과는 §127⑦ ④ API `long_term_rental` 본 자산·컴패니언 400 ⑤ `toggleGroupRadio`가 범주째 비움.
- **고정하지 않은 것**: 본문·단서·§97의2·§97의5 사이 6쌍의 ⑧·⑫ 동작(Q-3 → #3144) · 같은 id 둘(`[97의3, 97의3]`)의 ⑧ 통과 · `priorReductionUsage[].type`의 `long_term_rental` 허용(남은 참조 정리 때 바뀔 수 있다).

### 7.2 뮤테이션 (백업 → 변이 → 새 파일 + 관련 기존 5파일 실행 → 복원 → `cmp`)

| 변이 | 위치 | 새 파일 | 관련 기존 5파일(69건) |
|---|---|---|---|
| M1 LTR가 있으면 같은 범주의 다른 `rental_97_*`를 지움 | `calc-wizard-asset-migrate-rental-split.ts` | **10건 실패** | 통과 |
| M2 같은 id·LTR→97의3 중복을 합침 | 〃 | **2건 실패** | 통과 |
| M3 LTR 치환을 건너뜀 | 〃 | **15건 실패** | 1건 실패 |
| M4 `reductionSchema`에 LTR 허용 | `transfer-tax-schema-reductions.ts` | **2건 실패**(본 자산·컴패니언 400) | 1건 실패 |
| M5 ⑧ 명문 배제 호출 제거 | `transfer-tax-validate-rental-97.ts` | **3건 실패** | 18건 실패 |
| M6 ⑫ 명문 배제 refine 제거 | `transfer-tax-schema-reduction-refines.ts` | **3건 실패** | 19건 실패 |
| M7 구 폼-전역 LTR 분기 제거 | `calc-wizard-migration.ts` | **1건 실패** | 4건 실패 |
| M8 IndexedDB v4 LTR 치환 제거 | `reduction-reclassification.ts` | **1건 실패** | 통과(새 파일만 잡음) |
| M9 `toggleGroupRadio`가 같은 범주를 지우지 않음 | `UnifiedReductionPanel-defaults.ts` | **2건 실패** | 통과(새 파일만 잡음) |
| M10 구 폼-전역이 `[97의3]` 외에 §97의4를 덧붙임 | `calc-wizard-migration.ts` | **1건 실패** | 통과(새 파일만 잡음) |

10종 전부 검출, 변이한 8파일 모두 `cmp` 일치로 복원(작업 트리에는 새 테스트 파일만 남음). M8·M9·M10은 새 파일만 잡는 변이다. 한계: «본 자산 `[97의3, LTR]` → `reductions.1.type`» 건은 M4에서 실패하지 않는다 — LTR이 `income-deduction-router.ts`의 세액감면형 목록에 있어 §127⑦ refine이 같은 칸에 오류를 내기 때문이다(M4는 나머지 두 건이 잡는다).

### 7.3 정적 검사·회귀

- `npx tsc --noEmit` 0건 · `npx eslint`(변경 파일) 0건.
- 회귀 5묶음 실패 0: `__tests__/api` 6,858(+todo 6) · `tax-engine` 19,183 · `calc` 11,721 · `lib` 3,396(새 28건 포함, 전 기준선 3,368) · `components` 6,971건.
- Playwright 생략 — UI·소스 변경이 없다(테스트 1개와 이 문서만).

### 7.4 변경 파일

테스트 1개 신설 `__tests__/lib/rental-97-legacy-ltr-migration.anchor.test.ts` · 이 계획서. 소스 코드 변경 없음.
