# 주택 split 파트 이월과세(소득세법 §97의2) — P2 C · P3 A · P4 B · UI·클라이언트 설계

- 계획서: `docs/00-pm/transfer-split-part-carryover.plan.md` §3·§5·§6.3·§6.4·§7·§8 (사용자 확정 2026-10-19, Q-1~Q-10 전부 권장안)
- 형식 선례: `transfer-acq-cause-mixed-d2-4.ui.design.md` · 형제 코드: `GeneralBuildingAcquisitionCardsParts.tsx:316-326`(`GbBuildingCarryoverCard`)
- 짝(엔진): `transfer-split-part-carryover.engine.design.md` — 병렬 작성 중이라 **이 문서 작성 시점에는 존재하지 않아 읽지 못했다**. ④의 API 키·shape는 아래 §2.4 가정이며 **엔진 설계서 §1이 정본, 다르면 이 문서를 맞춘다**. 엔진과 맞출 지점은 §10(E-n)에 모았다.
- 상태: **UI Design — 제품 코드 수정 0.** 워크트리 `Property-related-Taxes-spco` · 브랜치 `feat/transfer-split-part-carryover` · base `a89e81d81`
- 표기: 「실측」 = 이 워크트리에서 throwaway vitest probe 실행값 · 「코드 확인」 = 읽기만 · 「확인 필요」 = 미검증. 화면은 Playwright를 띄우지 않았다(코드 추적 + RTL 렌더 probe).
- 용어: **A** 토지만 이월과세 + 건물 매매·신축 · **B** 건물만 이월과세 + 토지 매매 · **C** 통째 이월과세 + 증여자 토지·건물 취득일 상이.


> ⚠️ **통합 정정(계획서 §11)**: 와이어는 엔진 설계서 §1이 정본(I-2). 파트 카드의 「환산취득가 사용」 토글은 P1~P4에서 **두지 않는다** — 증여자 취득가액 필수 + 안내, 파트 환산은 후속 P6(I-4). 지분 사건 금액 미스케일(I-3)은 이 문서 안대로.

---

## 0. 결론표

| # | 결정 | 근거(절) |
|---|---|---|
| 1 | **순서 P2 C → P3 A → P4 B**. P2에 **고지 문구 교체 1건**(막다른 안내 H-2) 포함 | §3·§9 |
| 2 | 새 폼 키 3: `landCarryover`(A·C 토지 서브폼) · `carryoverDonorSplit`(C 토글, 클라이언트 전용) · `landCauseHost`에 `"carryover_gift"`(B). `LandCause`에 `"carryover_gift"` 추가(라디오 3번째 옵션, `LAND_CAUSE_META`·`BUILDING_CAUSE_META` Record 키 커버리지가 컴파일 가드) | §2.1 |
| 3 | **H-4 선결**: `effectiveLandAcquisitionCause`의 `as` 캐스트(`transfer-land-part-cause.ts:54`)를 화이트리스트로 교체 — 실측: 저장값 `carryover_gift`가 마법사 렌더를 **크래시**시킨다 | §8.1 |
| 4 | 술어는 **별도 3개**: `effectiveLandCarryover`(A) · `effectiveBuildingCarryoverMix`(B) · `effectiveCarryoverDonorSplit`(C). `effectiveBuildingCauseMix`는 넓히지 않는다(소비처 31행/14파일이 상속·증여 의미를 읽는다 — 실측 grep). B가 열어야 하는 흐름 소비처만 합성 술어 `buildingMixCause`로 | §2.2 |
| 5 | 증여자 입력은 **`CarryoverGiftBlock`에 `partMode`**(A `["land"]`·B `["building"]`·C 둘)를 얹고 파트 카드 1개 `SplitPartCarryoverCard`로 재사용. PHD/APD 환산 옵션은 숨기고 일반 기준시가만 | §2.3 |
| 6 | **증여 당시 평가액은 한 곳**: A·B·C 모두 기존 파트 취득가액 칸(`landAcquisitionPrice`·`buildingAcquisitionPrice`, 라벨 「증여 신고가액」) — A·B는 분리 섹션의 기존 칸, C는 파트 카드 안에서 같은 키를 바인딩. 서브폼 `giftDateValuation`은 파트 모드에서 칸 숨김·④ 미전송·⑧ 미요구(이중 진실 금지, 엔진 draft도 파트에 평가액 없음) | §2.3·§2.4 |
| 7 | **Q-8**: A는 증여 등기접수일 입력 시 같은 onChange 배치로 `landAcquisitionDate` 기록·읽기 전용. B·C(이월과세 호스트)는 `carryoverAcquisitionDateFallback` 선례대로 **읽는 쪽 파생**(표시·④·⑧ 3중 일치, store 쓰기 없음) | §4.3·§5.3 |
| 8 | 컴패니언·다건 **명시 차단**(⑤ 숨김+안내 · ⑧ 메시지 · ⑫ 거부 키 · 다건 ⑧⑫). 1세대1주택 겹침은 P5 전까지 ⑧이 엔진 leaf로 차단 + 파트 블록 상단 안내 | §2.6 |
| 9 | H-5(이월과세 호스트+소유자 분리 ⑧ 미검증)·H-6(일반건물 PHD/APD ⑧ 막다른 길)은 **둘 다 결함 실측** — 별건 PR로 분리(P2 선행 권고: H-5, 복사 금지: H-6) | §8 |
| 10 | 800줄: `transfer-tax-validate-acquisition.ts`(774)는 P2에서 이월과세 분기(`:262-356`)를 추출해 ≈690으로. 나머지 파일은 증가분 ≤60줄 또는 신규 파일 | §7 |

---

## 1. 현행 인벤토리 (코드 확인 · 실측)

| 항목 | 위치 | 내용 |
|---|---|---|
| 토지 원인 라디오 | `LandPartCauseBlock.tsx:44-47` | 상속·증여 2옵션. 증여 선택 시 고지(`:58`, testid `land-gift-carryover-notice`) 「이 화면은 그 계산을 지원하지 않으며 일반 증여로 계산」 |
| 토지 원인 메타 | `land-cause-meta.ts` `LAND_CAUSE_META: Record<LandCause,…>` | 접근처 8행: `LandPartCauseBlock:114` · `LandSec164Card:43` · `LandBuildingSplitSection:349,395,396` · `CompanionAcqDateSection:188` · `BuildingSec164Card:73` |
| 건물 원인 토글 | `BuildingCauseMixBlock.tsx:41` | `buildingCauseMixApplicable`(상속·증여 호스트만, `transfer-land-part-cause.ts:73-76`) → 이월과세 호스트는 null. 증여 호스트 고지(`:149`)가 「이월과세면 취득원인을 이월과세로 선택」 → 거기엔 토지 분리 토글이 없다(H-2 막다른 안내) |
| 증여자 입력 | `CarryoverGiftBlock.tsx`(369줄) | 5섹션 ①기본 ②취득가액 ③필요경비 ④비교과세 평가액 ⑤적용배제. 증여자 취득일·가액·자본적지출·평가액이 **1벌**. 앵커 키는 `part` prop으로 `carryover.*`/`buildingCarryover.*` |
| 일반건물 선례 | `GbBuildingCarryoverCard`(`CardsParts.tsx:316`) | `{...asset, carryover: asset.buildingCarryover}`로 블록을 감싸고 onChange에서 `carryover`→`buildingCarryover`로 리맵 |
| ③ 정규화 | `calc-wizard-asset-carryover.ts:157-166` | 호스트가 `carryover_gift`가 아니면 `carryover`를 **기본값으로 덮는다** → A의 토지 입력을 `carryover`에 담으면 복원마다 사라짐(그래서 별도 키) |
| ⑧ 라우팅 | `transfer-tax-validate-acquisition.ts:140`(D2 → `validateBuildingCauseSplit`) · `:262-356`(이월과세 분기, **마지막 `return null`** — `validateSplitDirectInputs`에 닿지 않음) | H-5의 원인 |
| 사이드바 | `transfer-tax-split-acq-mode.ts:243` `separateAcqPartsSum`(D1-4·D2-4 pending) · `transfer-per-asset-summary.ts:472`(결과 후 split 해소) | 이월과세 파트 pending 없음. `isPlainLumpSumAsset:143`은 `carryover_gift` 이미 제외 |

---

## 2. 공통 설계

### 2.1 ①②③ 폼 상태 (신규 키 3 + 타입 확장)

| 키 | 타입·기본 | 의미·규약 |
|---|---|---|
| `landCarryover` | `CarryoverTaxationForm`, `{...CARRYOVER_DEFAULTS}`(`factory.ts:162` 옆) | **A의 토지 + 사건 출처**, C의 토지 파트. 호스트와 무관하게 정규화(호스트 스트리핑 규칙 **미적용**) |
| `carryoverDonorSplit` | `boolean`, `false` | **C 토글**(클라이언트 전용, ④가 보내지 않음). 유효 상태는 `effectiveCarryoverDonorSplit`가 정한다 — 저장값 단독으로 읽지 않는다 |
| `landCauseHost` | 유니온에 `"carryover_gift"` 추가 | B에서 토글을 켠 호스트. 호스트 전환 시 기존 원인 라디오 patch가 태그를 비운다(`CompanionAcquisitionCauseSection.tsx:120`) |
| `LandCause` | `"inheritance"\|"gift"\|"carryover_gift"` | 라디오 3옵션. `LAND_CAUSE_META.carryover_gift`: label 「이월과세(증여)」 · dateLabel 「증여 등기접수일」 · valueLabel `SPLIT_CAUSE_VALUE_LABEL.gift` · priceLabel 「토지 증여 신고가액」 · fixedMode 「실거래가 · 증여 신고가액」. `BUILDING_CAUSE_META.carryover_gift`는 건물 문구 대응 |

- **데이터 배치(Q-2)**: 사건 1벌(등기접수일·산출세액·과세가액·관계·사망·적용배제)의 출처 = `splitCarryoverEventSource(asset)`(`gbCarryoverEventSource` 패턴): 호스트 `carryover_gift`면 `carryover`, 아니면 `landCarryover`. 건물 파트 = `carryover`(B·C), 토지 파트 = `landCarryover`(A·C). `buildingCarryover`는 일반건물 전용이라 재사용하지 않는다(의미 반대 — 계획서 §3.1).
- **③**: `migrateCarryoverFields`(`:157-232`)의 필드별 정규화 본문을 순수 함수 `normalizeCarryoverForm(raw)`로 추출하고, `carryover`(호스트 가드 유지)와 `landCarryover`(항상)가 같은 함수를 쓴다. 호출은 `migrate.ts:277` 옆 1줄. `fillMissingFromFactory`가 `carryoverDonorSplit`·`landCarryover` 부재를 채우지만 **중첩 필드는 못 채우므로** 위 정규화가 필수. **잔재는 지우지 않는다**(D0 G-6 — 읽는 쪽 파생).
- stale 저장 가드: 신규 키 3개 모두 `undefined`를 기본값으로 읽는다 — 구 세션·이력은 항상 「꺼짐」.

### 2.2 술어 (leaf) — 읽는 쪽 파생의 단일 소스 (`lib/calc/transfer-land-part-cause.ts` 227줄, +≈45줄)

| 술어 | 정의 | 소비 |
|---|---|---|
| `effectiveLandAcquisitionCause` | **변경**: `carryover_gift`·`purchase`·그 밖 → `""`, `inheritance`·`gift`만 통과(캐스트 삭제). 반환형 불변 | H-4 크래시 차단, D1 소비처 9곳+ 무영향 |
| `effectiveLandCarryover(asset)` → `""\|"carryover_gift"` | `landPartCauseApplicable` ∧ `hasSeperateLandAcquisitionDate` ∧ `landCauseHost===acquisitionCause` ∧ `landAcquisitionCause==="carryover_gift"` ∧ 소유자 분리 아님 ∧ 부담부증여 아님 ∧ **첫 자산** | A |
| `effectiveBuildingCarryoverMix(asset)` → `""\|"carryover_gift"` | `acquisitionCause==="carryover_gift"` ∧ 주택·건물(겸용 아님) ∧ `hasSeperateLandAcquisitionDate` ∧ `landCauseHost==="carryover_gift"` ∧ `landAcquisitionCause==="purchase"` ∧ 소유자 분리·부담부증여 아님 ∧ 첫 자산 | B |
| `effectiveCarryoverDonorSplit(asset)` → boolean | `carryoverDonorSplit` ∧ 호스트 `carryover_gift` ∧ 주택·건물(겸용 아님) ∧ B 아님 ∧ 소유자 분리·부담부증여 아님 ∧ 첫 자산 | C |
| `partCarryover(asset)` → `{land,building}` | 위 셋에서 파생: A `{land:T}` · B `{building:T}` · C 둘 다 | ④⑤⑥⑧ 공통 |
| `landCauseDisplay(asset)` → `LandCause\|""` | `effectiveLandAcquisitionCause \|\| (effectiveLandCarryover ? "carryover_gift" : "")` | `CompanionAcqPurchaseBlock.tsx:324` 1회 계산 주입(재파생 금지) |
| `buildingMixCause(asset)` | `effectiveBuildingCauseMix \|\| effectiveBuildingCarryoverMix` | 아래 흐름 소비처 |

- **B가 열어야 하는 흐름 소비처**(`effectiveBuildingCauseMix` 31행 중, 「건물은 비매매·토지는 매매」 구조를 읽는 곳): `engineLandOverlay` · `landCauseMixActive` · `hasStaleSplitInput`·`withBuildingActualWhenMix`·`normalizeBuildingCauseInputs`(`transfer-land-part-cause.ts`) · `CompanionAcquisitionCauseSection`의 `d2On`·`buildingCause` 주입 · `CompanionAcqDateSection`(라벨) · `LandBuildingSplitSection`(건물 칩) · `separateAcqPartsSum`(⑥) · `validate-acquisition.ts:140` 라우팅. **열지 않는 곳**(상속·증여 고유 의미): `transfer-tax-api-inheritance`·`-houses`·`gift-household-payload`·`transfer-fb-gate`·`BuildingSec164Card`·`transfer-building-sec164-bridge`·다건 ⑧. Do 단계 시작 시 31행 전수 grep으로 이 분류를 재확인한다 — **「배치했다 ≠ 처리했다」**.
- 정규화 사본 `normalizeSplitCarryoverInputs(asset)`(A만): `landAcquisitionDate`를 `landCarryover.giftRegistryDate`로 덮은 사본. ④⑥⑧이 `normalizeBuildingCauseInputs`와 같은 자리에서 통과시킨다(A의 날짜는 입력 시 write-through + 읽는 쪽 사본, 둘이 어긋나도 증여 등기접수일이 정본).

### 2.3 컴포넌트 (재사용 우선 · 신규 4)

| 컴포넌트 | 일 | 크기 |
|---|---|---|
| `CarryoverGiftBlock`(기존, +≈60줄 → ≈430) | `partMode?: {parts: ("land"\|"building")[]; eventKey: "carryover"\|"landCarryover"}` — 켜면 ①등기접수일(+C 토글) → ②③ 파트 카드 → ④증여세(산출세액·과세가액 GB 형식) → ⑤적용배제. **세대 사실 질문 숨김**(Q-9), 환산 옵션은 일반 기준시가만 | 수정 |
| `SplitPartCarryoverCard.tsx`(신규) | 한 파트의 증여자 입력: 증여자 취득일 → 취득가액(실가 \| 일반 기준시가 환산 분자) → 증여자 자본적지출 → (C만) 증여 신고가액(= `landAcquisitionPrice`/`buildingAcquisitionPrice` 바인딩). props `part`·`value`·`onPatch`·`anchorKey`·`showGiftPrice`. 증여자 자본적지출 라벨 **「증여자가 지출한 자본적 지출」**로 수증자 자본적지출(파트 `*DirectExpenses`)과 구분 | ≈170 |
| `LandCarryoverCard.tsx`(신규, A) | `GbBuildingCarryoverCard` 패턴 래퍼: `CarryoverGiftBlock partMode={["land"], eventKey:"landCarryover"}` + onChange 리맵(`carryover`→`landCarryover`) + 증여 등기접수일 write-through | ≈90 |
| B 마운트(신규 `BuildingCarryoverMixPanel`, §5) | `BuildingCauseMixBlock` 패널 안에 `CarryoverGiftBlock partMode={["building"], eventKey:"carryover"}`를 마운트(§5) | 수정 |
| `CarryoverPartsSaleAxis.tsx`(신규, C) | `NonPurchaseSplitInputsBlock`(178줄)의 하단(파트 자본적지출 `SplitPartCapexFields` + 축 A `LandBuildingSaleSplitSection`)을 **취득시 기준시가 안분 칸 없이** 노출. 게이트 `effectiveCarryoverDonorSplit` | ≈70 |

- `useEffect → store` 미러링 **0**. 파생은 렌더 중 술어 호출로 표시만, 쓰기는 사용자 onChange 안의 단일 배치 patch만(`feedback_multikey_patch_stale_spread_overwrite`).
- 공용 규약: 토글 `ToggleCard`(tone amber=취득·분리계산, OFF도 tone 유지), 라디오 `RadioCardGroup`, 안내 `ToneCard`, 금액 `CurrencyInput`·날짜 `DateInput`·`FieldCard hint`(placeholder 숫자 예시 금지, 「없으면 비워두세요」는 귀속 명확 칸만), 라벨 정본 클래스(임의 px 금지), 법령 링크 `LawArticleModal`. 포커스 전체선택은 `SelectOnFocusProvider` 자동.
- **자동 안분 fallback 금지**: 증여세 상당액 파트 안분은 영 §163의2② 명문 안분(일반건물 기확정)이라 허용, 그 밖의 빈 칸은 ⑧이 차단한다. 파트 모드 환산 분모(양도시 기준시가)는 입력 칸(축 A)에서 받는다(E-6).

### 2.4 ④ API 변환 — **엔진 설계서 §1이 정본, 다르면 이 절을 맞춘다**

- **와이어(엔진 draft에서 읽음)**: 사용자 가정(`landCarryoverTaxation`·`buildingCarryoverTaxation`)과 달리 엔진 Pre-Do 초안(`__tests__/api/transfer.route.split-part-carryover.predo.anchor.test.ts` 「설계서 §1 — 와이어」 주석; 설계서 본문은 미확인)은 **사건 1벌 `carryoverGiftEvent`(등기접수일·산출세액·과세가액·관계·사망·적용배제) + 파트 N벌 `landCarryoverPart`·`buildingCarryoverPart`(증여자 취득일·가액·자본적지출·환산 분자)** 이고, **파트에 평가액이 없다**(`*AcquisitionPrice`가 정본 = 영 §163의2② 안분 분자 = ②3호 B 취득가액). 일반건물 legacy `*CarryoverTaxation`·최상위 `carryoverTaxation`과의 병용은 400(T8). C도 `landAcquisitionCause:"carryover_gift"`, `landAcquisitionDate`=증여 등기접수일, `isSeparateAcquisition:false`를 ④가 파생해 보낸다. 이하는 이 와이어 기준이며 키 이름이 바뀌면 `GbCarryover*` 타입 재사용 부분만 고친다.
- 빌더: 일반건물 비공개 `buildPart`·`buildEngineShaped`·`PART_SCALE`·`scaleByMap`(`transfer-tax-api-gb-carryover.ts:70,94,169,217`)에서 Part·사건·스케일 부분을 공용 모듈 `transfer-tax-api-part-carryover.ts`로 **추출**(일반건물은 import만 바꿈, 동작 불변 — 회귀 방어선: 일반건물 이월과세 anchor 7파일 + `e2e/general-building-carryover.spec.ts`). 주택용 어댑터 `buildSplitCarryoverPayload(asset)`가 **컨벤션 반대**(주택: 토지 overlay·건물 = `acquisitionCause`)를 흡수: A `{land: landCarryover}` · B `{building: carryover}` · C `{land: landCarryover, building: carryover}`, 사건 = `splitCarryoverEventSource`.
- **전송 지점은 `buildLandPartCausePayload` 한 곳**(단건·다건·컴패니언 3호출 공용 — D1-4·D2-4가 쓰는 자리). 키가 3경로 body에 동일하게 실리고, 차단 경로는 ⑧이 먼저 막되 우회 시 ⑫가 거부(침묵 strip 방지 — 엔진 SPCO-0c가 현재 strip을 실측). 반환형 `landAcquisitionCause`에 `"carryover_gift"` 추가. **파트에 stray 금지**(T15): 술어 거짓이면 Part·사건을 보내지 않는다.
- C의 split 활성: `isSplitPayloadActive`(`transfer-tax-api-split.ts:67`)와 `partInputsActive`(파트 취득가액·자본적지출 송신 게이트) 두 곳에 `effectiveCarryoverDonorSplit` 항 추가 — 빠지면 C에서 `landAcquisitionPrice`가 전송되지 않는다. `landAcquisitionDate`는 `carryoverAcquisitionDateFallback`(`transfer-tax-api-carryover.ts:143`)으로 후퇴 송신(`buildSplitPayload`의 소유자 분리 후퇴 식 `:190`과 같은 패턴). 최상위 `carryoverTaxation`은 B·C에서 **미전송**(`buildCarryoverPayload` 호출부 `api.ts:700`·`companion-payload.ts:551`에 `!partCarryoverActive` 가드).
- 지분(공유) 모드: 증여자 취득가액·자본적지출은 `applyRatio`, 기준시가·증여세 2칸은 미스케일(`PART_SCALE`·`GIFT_EVENT_SCALE` 승계 — V-5/E-8).
- `phdFlagEffective`·PHD payload: 파트 모드에서는 무시 — `landCauseMixActive`에 편입(D1 T-3 규약).

### 2.5 ⑧ 공통 규약

- 단일 소스: 구조 규칙은 엔진 leaf `collectSplitPartCauseIssues`가 정한다(`validateLandPartCause` → `transfer-tax-validate-split.ts:174`). 이월과세 **입력 필수 칸**은 새 모듈 `transfer-tax-validate-split-carryover.ts`(≈120줄)의 `validateSplitCarryoverInputs(asset,label)`이 **화면 위→아래 순서**로 걷고 첫 미완 칸 앵커로 이동한다(`validateLandSec164Inputs` 선례). 일반건물 `validateGbCarryover`의 파트 루프(`validate-gb-carryover.ts:68-95`)를 `validateCarryoverParts(parts, event, label)`로 추출해 공유한다(동작 불변).
- leaf issue(`carryoverGiftEvent`·`landCarryoverPart`·`buildingCarryoverPart` 누락) → 위 함수가 첫 미완 칸으로 변환.
- **3중 패턴**: `estimationMode`(파트 모드에서 `general` 고정)는 표시·④·⑧ 모두 `c.estimationMode || "general"`로 읽는다. 토글/라디오 기본값이 어긋나면 막다른 길(`feedback_ui_input_path_enumeration`).
- 공통 선행 오류(GB 선례): 관계 「그 외」→ 원인 라디오 앵커(`landAcquisitionCause` 또는 `acquisitionCause`) · 사망 선언+관계 미선택 → `…donorRelation` · 가업상속공제 선언 → 차단 문구(앵커 없음, 기존 `(a)`와 같음).
- `field` 문자열은 화면에 **각 1개** `data-field`로 존재해야 한다(이동 불능 0). 신규 앵커: `landCarryover.{giftRegistryDate,donorAcquisitionDate,donorAcquisitionPrice,donorStandardPriceAtAcquisition,donorCapitalExpenditure,giftTaxBase,donorRelation}` · `carryoverDonorSplit` · 기존 재사용 `landAcquisitionCause`·`landAcquisitionPrice`·`buildingAcquisitionPrice`.

### 2.6 차단 지점 (P5 전까지)

| 대상 | ⑤ | ⑧ | ⑫/엔진 | 다건 |
|---|---|---|---|---|
| **컴패니언**(두 번째 이후 자산, Q-6) | 라디오 옵션·C 토글·B 토글을 **숨기고** 한 줄 안내(N6). 기존 whole-asset 이월과세는 종전 그대로(`companion-payload.ts:551`) | `validateAssetAcquisition(isNonPrimaryAsset)`에서 `partCarryoverRequested(asset)`(저장 플래그·원인값 기준, 첫 자산 조건 **제외**)이면 메시지 + 앵커 `landAcquisitionCause`/`carryoverDonorSplit`. **주 자산이 파트 이월과세이고 함께 양도 자산이 1건 이상이면**(`form.assets.length>1`) 주 자산도 차단 + N8(엔진 T13 400: 파트 비교가 신고 전체 결정세액을 못 봄) | `companionAssetSchema` superRefine이 새 키 거부(E-9) | — |
| **다건 합산**(Q-7) | 다건 임베드 화면은 단건 마법사 그대로라 ⑤는 동일 | `multi-transfer-tax-validate.ts:145` 옆에 `partCarryoverRequested`면 `MULTI_CARRYOVER_UNSUPPORTED_MESSAGE` (B·C는 호스트 `carryover_gift`로 이미 막힘 — **A만 신규 구멍**) | `MULTI_REJECT_RULES`(`schema-multi-refines.ts:40-48`)에 `landAcquisitionCause`(`carryover_gift`)·`carryoverGiftEvent`·`landCarryoverPart`·`buildingCarryoverPart` 추가(엔진 T11). `transfer.route.multi-key-coverage-f12.test.ts`가 누락 시 실패해야 정상 | 위 |
| **1세대1주택 겹침**(Q-5) | 파트 블록 상단 amber `ToneCard`(N4) | 보유 상황 단계(UI 인덱스 1)에서 엔진 leaf 호출 → 같은 문구, 앵커는 `isOneHousehold`. 엔진 draft 술어 = `isOneHousehold ∧ 주택 ∧ 미등기 아님`(T10, **E-4**) | 엔진 400 + 안내 | 위 |
| 부담부증여·소유자 분리 | 세 토글 모두 `disabled`(끄는 방향은 허용) + `disabledReason` | 술어가 무효로 읽음 → 요구 없음 | 기존 R-X1·R-X4 | — |

### 2.7 고지 문구 (정확한 초안)

| ID | 위치(testid) | 새 문구 | 시점 |
|---|---|---|---|
| N1 | `land-gift-carryover-notice`(`LandPartCauseBlock.tsx:58`, 라디오가 「증여」일 때) | 양도일부터 소급하여 10년(2023.1.1. 전 증여는 5년) 이내에 **배우자·직계존비속**으로부터 증여받은 토지는 취득가액·보유기간을 증여자 기준으로 계산하는 이월과세 대상입니다(소득세법 §97의2①). 이월과세 대상이면 위 토지 취득 원인에서 **「이월과세(증여)」**를 선택하세요. 「증여」는 그 밖의 사람에게서 증여받았거나 위 기간이 지난 경우에 고르며, 증여일 평가액·증여일 취득의 일반 증여로 계산됩니다. | P3 |
| N2 | `building-gift-carryover-notice`(`BuildingCauseMixBlock.tsx:149`) **중간본** | …이월과세 대상인지 확인하세요(소득세법 §97의2①). 이 화면은 **건물만 이월과세이고 토지는 매수한 경우를 아직 계산하지 못하며**, 건물은 일반 증여(증여일 평가액·증여일 취득)로 계산됩니다. 토지·건물이 모두 이월과세 대상이면 취득 원인을 「이월과세(증여)」로 선택하세요 — 증여자가 토지와 건물을 다른 날 취득했다면 그 화면에서 따로 입력합니다. | **P2** |
| N2′ | 같은 자리 **최종본** | …이월과세 대상이면 취득 원인을 「이월과세(증여)」로 바꾸고 그 화면에서 **「토지는 다른 원인으로 취득」**(토지 매수)을 켜세요. 취득 원인을 바꾸면 이 토글은 꺼집니다. 「증여」로 계산하면 건물은 일반 증여(증여일 평가액·증여일 취득)입니다. | P4 |
| N3 | 증여자 취득일 hint(`BuildingCauseMixBlock.tsx` 증여 분기 FieldCard) | 중간본(P2): 선택 입력 — 단순 증여의 세율 보유기간은 증여받은 날부터입니다(소득세법 §104② 본문). 건물만 이월과세이고 토지는 매수한 조합은 아직 계산하지 못합니다. / 최종본(P4): 선택 입력 — …증여자 기준 통산이 필요하면 위 안내대로 취득 원인을 「이월과세(증여)」로 선택하세요. | P2 / P4 |
| N4 | 파트 모드 블록 상단 amber `ToneCard`(`split-carryover-onehouse-notice`) | 토지·건물 중 한 부분이라도 이월과세(소득세법 §97의2) 대상으로 입력하면 **1세대1주택 비과세(§89①3호) 판정 대상인 양도는 아직 계산하지 못합니다** — 이월과세 적용 여부(§97의2②2호)가 비과세 판정에 따라 달라지기 때문입니다. 비과세 판정 대상이 아닌 양도에서만 이 입력을 쓸 수 있습니다. | P2·P3·P4 |
| N5 | 파트 블록 하단 caption(`split-carryover-household-note`, Q-9) | 증여자와 증여일부터 양도일까지 계속 같은 세대였는지는 묻지 않습니다. 이 사실은 1세대1주택 비과세 판정의 보유기간 통산·거주요건에 쓰이는데 이 입력은 그 판정과 함께 계산하지 않으므로 세액에 반영되지 않습니다 — 해당하는 양도라면 <b>확인 필요</b>입니다. | P2·P3·P4 |
| N6 | 컴패니언 자산 카드(`split-carryover-companion-note`) | 함께 양도하는 두 번째 이후 자산에는 토지·건물 파트 이월과세를 쓸 수 없습니다 — 이 입력은 첫 번째 자산에서만 계산됩니다. 자산 전체를 하나의 증여자 취득으로 보는 이월과세는 그대로 입력할 수 있습니다. | P2 |
| N8 | 주 자산 파트 이월과세 블록 상단(함께 양도 자산이 있을 때, `split-carryover-companion-exists-note`) | 함께 양도하는 다른 자산이 있으면 토지·건물 파트 이월과세를 아직 계산하지 못합니다 — 파트별 비교과세(②3호)가 신고 전체의 결정세액을 보지 못하기 때문입니다. 이 입력은 이 자산 한 건만 양도할 때 쓸 수 있습니다. | P2 |
| N7 | A 토지 취득일 읽기 전용 힌트(`land-carryover-date-note`) | 토지 취득일은 아래 이월과세 정보의 증여 등기접수일입니다(이월과세 토지는 증여받은 날 취득, 보유기간·장기보유특별공제는 증여자 취득일부터). | P3 |

⚠️ 셀렉터 유일성: N1 문구에 「증여자 취득일」을 넣지 않는다(`e2e/transfer-acq-cause-mixed-d0.spec.ts:39` `getByText("증여자 취득일")` `toHaveCount(0)`). 신규 카드 어디에도 「취득 당시 개별주택가격 미공시」·「상속세 신고 시 평가방법」 문구 금지(D2 spec 단언). N2 계열은 `toContainText("이월과세")`(`d2-2.spec.ts:143`)를 만족한다.

---

## 3. P2 — C: 통째 이월과세 + 증여자 토지·건물 취득일 상이

### 3.1 ①~⑧

| 지점 | 파일 | 변경 |
|---|---|---|
| ① | `calc-wizard-asset-split-acq.ts` · `calc-wizard-asset-carryover.ts` | `carryoverDonorSplit`·`landCarryover` 타입. 주석에 「읽는 쪽은 `effectiveCarryoverDonorSplit`」 |
| ② | `calc-wizard-asset-factory.ts:162` | `carryoverDonorSplit:false` · `landCarryover:{...CARRYOVER_DEFAULTS}` |
| ③ | `calc-wizard-asset-carryover.ts` · `…-migrate.ts:277` | §2.1의 `normalizeCarryoverForm` 추출 + `landCarryover` 정규화 |
| ④ | 공용 빌더 모듈 추출 + `buildLandPartCausePayload`(§2.4). `isSplitPayloadActive`·`partInputsActive` C 항 | 사건 = `carryover`, 건물 Part = `carryover`, 토지 Part = `landCarryover`. 파트 평가액은 `landAcquisitionPrice`·`buildingAcquisitionPrice` |
| ⑤ | `CarryoverGiftBlock`(partMode) · `SplitPartCarryoverCard` · `CarryoverPartsSaleAxis` · `CompanionAcquisitionCauseSection.tsx:371-381` | §3.2 |
| ⑥ | `transfer-per-asset-direct.ts`(168줄) `directAcqRaw` ③-1 분기 | §3.4 |
| ⑦ | §6 | 4뷰 |
| ⑧ | 신규 `transfer-tax-validate-split-carryover.ts` + `validate-acquisition.ts` 이월과세 분기 추출 | §3.5 |

### 3.2 ⑤ 위젯 배치 (이월과세 호스트, `carryoverDonorSplit` ON 기준 — 위→아래 = 계산 순서)

```
취득 원인 [이월과세(증여)]
┌ amber 카드 「이월과세(증여) 정보」 (소득세법 §97조의2) ───────────────────────────┐
│ ToneCard N4 (1세대1주택 비과세 판정 대상은 계산 불가)                               │
│ ① 증여 기본 정보: [증여 등기접수일](사건 1벌, 앵커 carryover.giftRegistryDate)       │
│    ToggleCard(amber) 「증여자가 토지·건물을 다른 날 취득」 — ON caption: 건물 칸에는   │
│    지금까지 입력한 증여자 정보가 그대로 남습니다, 건물 기준 값인지 확인하세요         │
│ ② 토지 — 증여자 취득  SplitPartCarryoverCard part=land     (landCarryover.*)         │
│ ③ 건물 — 증여자 취득  SplitPartCarryoverCard part=building (carryover.*)             │
│    카드 순서: 증여자 취득일 → 취득가액[환산 토글: 일반 기준시가만] → 증여자가 지출한    │
│    자본적 지출 → 증여 신고가액(= 비교과세 B 시나리오 파트 취득가액, 파트 가액 칸 바인딩)│
│ ④ 증여세·필요경비: [증여세 산출세액][증여세 과세가액] (사건 1벌, 영 §163의2②)         │
│ ⑤ 적용배제 선언 (기존 섹션 — 세대 사실 질문만 숨김, N5)                              │
└────────────────────────────────────────────────────────────────────────────────────┘
토글 ON일 때만: CarryoverPartsSaleAxis = 수증자 파트 자본적지출(SplitPartCapexFields) + 축 A 양도가액 구분/일괄·양도시 기준시가
```

- 토글 OFF 화면은 **종전 그대로**(회귀 0): `CarryoverGiftBlock` 비-partMode 경로 불변.
- 토글 근거 **모드 토글은 영향받는 필드 직전**(①의 등기접수일 바로 아래, 증여자 취득일 직전).
- 토글 `disabled`: 소유자 분리 ON · 부담부증여 · B 활성(상호 잠금, 끄는 방향 허용) · 컴패니언(숨김).
- 파트 카드의 환산: `ToggleCard 「환산취득가 사용」` ON이면 「증여자 취득 당시 기준시가」 1칸(`donorStandardPriceAtAcquisition`)만. 환산 방식 라디오(`CarryoverEstimationSection`)는 파트 모드에서 렌더하지 않는다(일반 기준시가 고정, PHD/APD 숨김 — 확정 결정). 분모는 축 A의 파트 양도시 기준시가(E-6).
- **세대 사실 질문 숨김**: `carryoverHouseholdFactVisible(asset)`에 `&& !partCarryoverActive(asset)`를 더해 ⑤(`CarryoverGiftBlock.tsx:360`)·⑧(`validate-carryover-household`)·④(`carryoverHouseholdPayload`)가 **같은 술어**로 묻지 않는다(3중).
- 증여 신고가액은 C에서 파트 카드가 `landAcquisitionPrice`/`buildingAcquisitionPrice`를 바인딩해 받고(앵커 동일), 두 파트 합이 증여세 과세가액을 넘으면 ⑧이 막는다(GB Σ 검증과 같은 규칙).

### 3.3 전환·stale (읽는 쪽 파생이 정본)

| 상황 | 규칙 |
|---|---|
| 토글 ON→OFF | `effectiveCarryoverDonorSplit` 거짓 → 카드·④ 파트 키·⑧ 요구 소멸. `landCarryover` 값 보존(재ON 시 복원). `carryover.*` 는 다시 자산 전체 1벌로 읽힌다 |
| 토글 OFF→ON | `carryover.*`(기존 자산 전체 입력)는 **건물 값으로 재해석**(caption 고지), `landCarryover`는 비어 있음 → ⑧이 토지 칸을 요구. 복사·초기화 안 함 |
| 취득 원인을 이월과세에서 바꿈 | 술어가 호스트 불일치로 무효. 값 보존(`carryover`는 ③ 호스트 가드가 기존대로 기본값 처리 — 단 `landCarryover`·`carryoverDonorSplit`은 지우지 않는다) |
| 소유자 분리 ON | 술어 거짓(⑧이 소유자 분리 규칙으로 안내, H-5 수정 후). 토글은 `disabled`+`disabledReason` |
| B 토글 ON | C 토글 `disabled`(「토지는 다른 원인으로 취득」을 끄면 켤 수 있습니다) |
| 첫 자산이 아니게 됨(첫 자산 삭제 등) | ⑤ 숨김 + ⑧ N6 차단. 값 보존 |

### 3.4 ⑥ 사이드바

- 입력 단계: `directAcqRaw`(`transfer-per-asset-direct.ts:120` ③ 앞)에 `effectiveCarryoverDonorSplit(a) → {value:0, pending:true}`. C는 `isSeparateAcquisition`(=토지 취득일 분리) 경로가 아니라 기존 분기 ⑤(`fixedAcquisitionPrice`)로 흘러 부분값을 오독할 수 있다.
- 필요경비: `splitHasNonActualOwnedPart`에 「이월과세 소유 파트」를 비-actual로 편입(증여세 상당액·증여자 자본적지출이 엔진 확정 후라 부분합을 총액으로 보이지 않게).
- 결과 후: `transfer-per-asset-summary.ts:472` 기존 분기(`isSingle && acqPending && singleResult?.splitDetail`)가 `summarizeSplitGain().acquisitionDeducted`로 해소 — C는 split 경로라 추가 분기 불필요. **Pre-Do 실측 필수**(D2-4 교훈: 입력 단계 pending이 결과 후에도 「계산 후 표시」에 갇히는지). 입력을 고친 뒤 옛 엔진 값에 머무는지(결과 무효화 `feedback_store_update_must_invalidate_result`)도 함께 본다.

### 3.5 ⑧ 필수 칸 순서 (= 화면 위→아래, 엔진 leaf와 ⑧≡⑫ 격자)

1. 관계 「그 외」(앵커 `acquisitionCause`) → 사망+관계 미선택(`carryover.donorRelation`) → 가업상속 선언(차단 문구)
2. `carryover.giftRegistryDate`(< 양도일) 
3. 토지: `landCarryover.donorAcquisitionDate`(< 증여 등기접수일) → `landCarryover.donorAcquisitionPrice` 또는 환산 `donorStandardPriceAtAcquisition` → 자본적지출(음수 불가) → `landAcquisitionPrice`(>0)
4. 건물: `carryover.donorAcquisitionDate` → `carryover.donorAcquisitionPrice`/`donorStandardPriceAtAcquisition` → 자본적지출 → `buildingAcquisitionPrice`(>0)
5. 증여세: `carryover.giftTaxBase` 필수(산출세액은 0 허용 — 엔진 draft), Σ 파트 증여 신고가액 ≤ 과세가액
6. `validateSplitDirectInputs` 계열: 수증자 파트 자본적지출·축 A(양도가액 구분 → `saleSplitMode`/`landTransferPrice`/`buildingTransferPrice`, 양도시 기준시가 `landStandardPriceAtTransfer`/`buildingStandardPriceAtTransfer`)
7. P5 차단(§2.6)
- **⑧≡⑫ 격자**(차원: 모드 {A,B,C,없음} × 입력 {전부, 칸 1개씩 비움 ×12, Σ 초과, 등기일≥양도일, 증여자일≥등기일, 소유자 분리, 부담부증여, 컴패니언, 비주택} ≈ 120셀): 「⑧ 통과 ⇒ ⑫ 200」(막다른 길 0) · 「⑧ 차단 사유 field는 화면 앵커 1개」 · 차단 셀의 기대값은 **엔진 leaf**에서 읽는다(`feedback_fe8_vs_12_parity_grid`).

### 3.6 테스트 (Pre-Do anchor → RED → GREEN)

PC1 술어 진리표(`effectiveCarryoverDonorSplit` × 호스트·소유자 분리·부담부증여·컴패니언·겸용·비주택) · PC2 ④ 3경로 parity(단건 `callTransferTaxAPI` = 다건 `buildPropertyPayload` = 컴패니언 `buildAssetPayload`의 신규 키 바이트 동일, 토글 OFF는 종전 body와 **완전 동일**) · PC3 ⑧ 순서·격자(§3.5)와 세대 사실 질문 3중(⑤⑧④ 모두 미질문) · PC4 RTL(OFF 화면 불변, ON 카드 2·앵커 각 1개, PHD/APD 옵션·「취득 당시 개별주택가격 미공시」 부재) · PC5 ⑥ pending→해소→입력 수정 후 옛 값 아님 · PC6 H-4 회귀 가드(§8.1) · PC7 stale(OFF→ON 값 보존·재해석, 호스트 전환, B 상호 잠금). 뮤테이션: 술어 조건 각 1개·세대 가드·⑥ pending·⑧ Σ·3경로 중 1곳 키 누락 제거 — 전부 KILLED.

## 4. P3 — A: 토지만 이월과세 + 건물 매매·신축

### 4.1 ①~⑧

| 지점 | 변경 |
|---|---|
| ① | `landAcquisitionCause` 유니온에 `"carryover_gift"` 추가(`calc-wizard-asset-split-acq.ts:32`), `LandCause`·META(§2.1) |
| ② ③ | P2에서 완료(`landCarryover`). 추가 없음 |
| ④ | `buildLandPartCausePayload`: `effectiveLandCarryover` 분기에서 `landAcquisitionCause:"carryover_gift"` + `landCarryoverTaxation`·`carryoverGiftEvent`·`landCarryoverPart`. 토지 취득일 = `normalizeSplitCarryoverInputs`가 덮은 증여 등기접수일. `landDecedentAcquisitionDate` 미전송 |
| ⑤ | §4.2 |
| ⑥ | `separateAcqPartsSum`(`split-acq-mode.ts:266`)에 `parts[0].owned && effectiveLandCarryover(asset)` → `pending=true`(D1-4 토지 1줄 옆, +2줄) |
| ⑦ | §6 |
| ⑧ | `validateLandPartCause`(`validate-split.ts:174`)가 leaf issue(G-1 해소 후 서브객체 필수) → `validateSplitCarryoverInputs` 위임 |

### 4.2 ⑤ 위젯 배치

- `LandPartCauseBlock`(285줄, +≈45): ①토글(기존) → ②**원인 라디오 3옵션**(상속·증여·**이월과세(증여)**) → 이월과세 선택 시 `LandCarryoverCard`(amber, 번호 ①~⑤) 아래, **기존 `LandSec164Card`·`DecedentDateField`는 렌더하지 않는다**(이월과세 증여는 ≥2013 — §163⑨ 단서 구간에 닿지 않음. `isSec163_9LandProviso`가 `effectiveLandAcquisitionCause`만 읽어 자동 비발동 — 부정형 anchor로 고정).
- 호스트별:
  - **매매 호스트**: 블록은 원인·고지만 두고 토지 취득일(날짜 2열)·토지 가액(취득가액 산정 방식 ①)은 `CompanionAcqPurchaseBlock`이 `landCauseDisplay`로 라벨을 바꾼다 → 토지 취득일 라벨 「토지 증여 등기접수일」+ `DateInput disabled`+N7, 평가액 라벨 「토지 증여 신고가액」(고정 칩 「실거래가 · 증여 신고가액」).
  - **신축 호스트**: 블록이 직접 칸을 가진다(`LandPartCauseBlock.tsx:224-235`). 토지 취득일 `FieldCard`는 읽기 전용 + N7, 가액 칸 라벨 동일.
- 위 → 아래: (소유자 분리 OFF 확인) → 토글 → 원인 → **이월과세 정보 블록(등기접수일 → 관계 → 증여자 취득일 → 증여자 취득가액 → 증여자 자본적지출 → 증여세 산출세액·과세가액 → 적용배제)** → [날짜 2열: 토지 읽기 전용 | 건물 취득일] → 취득가액 산정 방식(토지 증여 신고가액 · 건물 매매/신축) → 파트 자본적지출 → 축 A.
- 증여자 자본적지출(증여자가 지출, 이월과세 블록) vs 수증자 자본적지출(파트 `landDirectExpenses`) 라벨 구분(§2.3).

### 4.3 Q-8 날짜 처리 + 전환

- 증여 등기접수일 `onChange(v)` 한 patch: `{ landCarryover:{...c, giftRegistryDate:v}, landAcquisitionDate: v }` (단일 배치, 다중 키 stale spread 금지). 라디오를 이월과세로 바꿀 때도 같은 patch로 `landAcquisitionDate`를 `landCarryover.giftRegistryDate`(있으면)로 맞춘다. 읽는 쪽 `normalizeSplitCarryoverInputs`가 어긋남(수동 편집 잔재)을 증여 등기접수일로 덮는다(3중).
- 라디오 이월과세→증여: `landAcquisitionDate`는 그대로(증여일, 일반 증여에서도 의미 유효) · `landCarryover` 값 보존 · N1 노출.
- 같은 날(Q-4) 규칙: 토지 증여일 = 건물 취득일이어도 A에서는 증여자 취득일이 별개라 차단하지 않는다 → leaf 확정 필요(E-5).
- 호스트 전환·토글 OFF: 기존 D1 규칙(`landCauseHost` 불일치 → 무효, 값 보존). **토글 OFF patch가 `landAcquisitionCause`만 비우고 `landCarryover`는 건드리지 않는다.**
- 소유자 분리와 상호 잠금(기존 `ownerSplit` 규칙 그대로, `LandPartCauseBlock.tsx:117`).

### 4.4 ⑧ 순서

1. leaf 구조(`landAcquisitionCause`) → 관계 「그 외」(`landAcquisitionCause`) → 사망+관계(`landCarryover.donorRelation`) 
2. `landCarryover.giftRegistryDate` → `…donorAcquisitionDate` → 가액/환산 분자 → 자본적지출 → 증여세 `…giftTaxBase`(+Σ)
3. `landAcquisitionPrice`(= 증여 당시 평가액, >0) → 건물 취득일 `acquisitionDate` → 건물 가액(기존) → 파트 자본적지출 → 축 A
4. 같은 날(해당 시) → P5 차단
- 앵커 전수: 위 필드 각 1개, 기존 앵커 재사용(`landAcquisitionPrice`, `acquisitionDate`).

### 4.5 테스트·E2E

Pre-Do: PC1~PC7의 A판 + `LAND_CAUSE_META` 키 커버리지(타입) + N1 노출 조건. 반전은 §9. 뮤테이션에 `normalizeSplitCarryoverInputs` 제거·`LandSec164Card` 비노출 가드 제거 포함.

## 5. P4 — B: 건물만 이월과세 + 토지 매매

### 5.1 ①~⑧

| 지점 | 변경 |
|---|---|
| ① | `landCauseHost` 유니온 확장(§2.1). `buildingCauseMixApplicable`은 **건드리지 않는다** — 새 `buildingCarryoverMixApplicable` |
| ④ | `buildLandPartCausePayload`: `effectiveBuildingCarryoverMix` → `landAcquisitionCause:"purchase"`(엔진 overlay) + `buildingCarryoverTaxation`·`carryoverGiftEvent`·`buildingCarryoverPart`. 건물 취득일 = `carryoverAcquisitionDateFallback(asset)`. 건물 방식은 `actual` 고정(`withBuildingActualWhenMix`가 B도 포함) |
| ⑤ | §5.2 |
| ⑥ | `separateAcqPartsSum`: `parts[1].owned && effectiveBuildingCarryoverMix` → pending (`split-acq-mode.ts:266,269` D1-4·D2-4 옆) |
| ⑦ | §6 |
| ⑧ | `validate-acquisition.ts:140` 라우팅을 `buildingMixCause`로 넓히되 **이월과세 필드 검증을 `validateBuildingCauseSplit` 앞에 둔다**(`validateSplitCarryoverInputs` → `validateBuildingCauseSplit`). 이월과세 호스트의 `(g)` 세대 질문은 건너뜀(Q-9) |

### 5.2 ⑤ 위젯 배치 (이월과세 호스트)

```
취득 원인 [이월과세(증여)]
(소유자 분리 OFF) ToggleCard(amber) 「토지는 다른 원인으로 취득」 — 건물은 이월과세(증여), 토지는 매수
 └ ON 패널 (BuildingCauseMixBlock, testid land-part-cause-building-cause 재사용): ToneCard N4 + 안내
    CarryoverGiftBlock partMode=["building"] eventKey="carryover"  (하단 마운트 :371는 B에서 숨김)
      ① 등기접수일 → 관계/사망 → ② 건물 증여자 취득(취득일 → 가액/환산 → 증여자 자본적지출) → ③ 증여세 → ⑤ 적용배제
      (증여 당시 평가액 칸 없음 — 건물 증여 신고가액을 아래 칸에서 받는다)
CompanionAcqPurchaseBlock(buildingCause="carryover_gift"): [토지 취득일 | 건물 증여 등기접수일(읽기 전용)] → 토지 4방식 | 건물 고정 칩 + 평가액
```

- 건물 취득일 칸: 표시값 = `acquisitionDate || carryover.giftRegistryDate`(`carryoverAcquisitionDateFallback` 표시 fallback), `DateInput disabled`+N7류 힌트. **store 쓰기 없음** — ④ fallback과 ⑧ 입력(leaf `buildingAcquisitionDate`)이 같은 식(3중).
- 마운트 조건 확장: `CompanionAcquisitionCauseSection.tsx`의 `(asset.acquisitionCause==="purchase" || d2On)`에 `|| buildingCarryoverOn`, `CarryoverGiftBlock` 하단 마운트는 `&& !buildingCarryoverOn`.
- 토글 `disabled`: 소유자 분리 ON · 부담부증여 · C 활성(상호 잠금). `BuildingCauseMixBlock`은 `buildingCauseMixApplicable ∨ buildingCarryoverMixApplicable`일 때 렌더, 호스트별 분기는 파일이 ≈215줄이 되므로 **이월과세 패널은 별 컴포넌트 `BuildingCarryoverMixPanel.tsx`(≈90)** 로 둔다(`BuildingCauseMixBlock`은 토글+분기만).
- 비교과세 B 시나리오 건물 취득가액 = `buildingAcquisitionPrice`(건물 증여 신고가액) 하나 — `carryover.giftDateValuation` 칸은 숨기고 보내지 않는다(§0 #6).

### 5.3 전환·stale

| 상황 | 규칙 |
|---|---|
| 호스트 이월과세→증여 | 기존 원인 라디오 patch가 `landCauseHost`를 비움 → B 무효, D2 gift 토글은 다시 켜야 함(N2′가 알린다). 값 보존 |
| 증여→이월과세 | D2 gift 토글도 태그가 비워져 꺼짐 → 이월과세 화면에서 B 토글을 다시 켠다 |
| 토글 OFF | `{landAcquisitionCause:"", landCauseHost:"", hasSeperateLandAcquisitionDate:false, landAcqMode:"", buildingAcqMode:""}` 단일 배치(D2와 동일). `carryover` 보존 — 자산 전체 1벌로 재해석 |
| 증여 등기접수일 변경 | 파생이라 추가 patch 없음 |

### 5.4 ⑧ 순서

1. 구조(`landAcquisitionCause`) → 관계/사망 → `carryover.giftRegistryDate` → `carryover.donorAcquisitionDate` → `carryover.donorAcquisitionPrice`/환산 분자 → 자본적지출 → `carryover.giftTaxBase`(+Σ)
2. 토지 취득일 `landAcquisitionDate`(기존 D2 순서) → 건물 증여 신고가액 `buildingAcquisitionPrice` → 토지 방식·가액 → 파트 자본적지출 → 축 A → P5 차단
3. 건물 취득일 칸은 파생이라 오류 앵커가 아니다(등기접수일 오류가 먼저 잡는다)

### 5.5 테스트

PC1~PC7의 B판 + **D2 회귀**(상속·증여 호스트 D2 격자 `transfer-land-part-cause.d2.predo*.test.ts` 전건 불변) + 부정형 짝(`effectiveBuildingCauseMix`가 이월과세 호스트에서 여전히 `""` — `d2.predo.test.ts:198-203` A3 유지).

---

## 6. ⑦ 결과 4뷰 — 파트 이월과세 표시 항목 (엔진 echo 필드명은 E-7 정본)

| 항목 | 카드(`SplitGainDetailSection`+신규 `SplitCarryoverComparisonCard`) | 상세명세서(`split-acq-text.ts`) | 신고서(`FilingFormTableHelpers.ts`) | PDF(`ResultPdfTransferSections.tsx`) |
|---|---|---|---|---|
| 파트 취득 원인 | 기존 `split-card-cause-*`가 「이월과세(증여)」(`splitCauseLabel`) | 파트 태그 「토지(이월과세 — 증여자 취득가액)」/채택이 B면 「토지(증여 신고가액)」 | 취득가액 칸 주석 | 동 |
| 취득가액 분해 | 증여자 취득가액 X + 증여자 자본적지출 Y + 증여세 상당액 Z (각 숫자 옆 변수명 라벨) | 한국어 풀어쓰기 산식 | 칸 합계+각주 | 동 |
| 증여세 상당액 | `산출세액 × 해당 자산가액 ÷ 증여세 과세가액`(`Frac`), 한도(양도가액 − §97①·② 금액) 적용 시 「한도 적용」 | 동 | — | — |
| 환산(해당 시) | `양도가액 × 증여자 취득 당시 기준시가 ÷ 양도시 기준시가` | 동 | — | — |
| 장기보유 보유기간 | 파트별 기산일 = **증여자 취득일**(`split-card-lthd-start-land/building`), 기존 세율 기산 echo(`rule:"donor"`)와 구분 표기 | 동 | 보유기간 칸 | 동 |
| 비교과세(②3호) | 파트별 A(적용)/B(미적용) 결정세액 두 값 + 채택 배지(`ScenarioCol` 재사용 — export). 배제 시 사유 라벨(`CARRYOVER_EXCLUSION_REASON_LABELS`). **「토지·건물을 각각 비교」 + 해석례 미확보 한 줄(확인 필요)** | 동 | 채택 시나리오 주석 | 동 |
| 안내 | 1세대1주택 비과세 판정과 함께 계산하지 않음(N4)·동일세대 사실 미반영(N5) | — | — | — |

- 새 파일: `lib/tax-engine/transfer-tax-split-carryover-display.ts`(`splitCarryoverView(part)` — 4뷰가 같은 view를 읽는다, 502줄인 `transfer-tax-split-display.ts`는 건드리지 않음) · `FilingFormTableSplitCarryover.ts`(신고서 행; `FilingFormTableHelpers.ts` 700줄 증가 없음). PDF leaf는 `ALL_LEAVES` 동기화 테스트 갱신(`feedback_print_leaf_add_unit_test_sync`).
- echo가 없는 구 이력은 종전 화면(모든 신규 표시는 optional 가드). 산식 규약: 변수 약어·`floor()` 금지, 중간 산술 미표시, 「원」 접미사 금지.
- 환산 파트의 개산공제 표기는 기존 `split-card-lump-base-*` 재사용.

## 7. 파일 크기 (800줄 정책)

| 파일 | 현재→증가 | 조치 |
|---|---|---|
| `transfer-tax-validate-acquisition.ts` | **774**→+6 | **P2에서 이월과세 분기(`:262-356`, ≈95줄)를 `transfer-tax-validate-carryover-asset.ts`로 추출**(동작 불변) → ≈690 |
| `transfer-tax-split-acq-mode.ts` | 730→+6 | 불필요(착지 ≤750). ≥750이면 `separateAcqPartsSum` 분리 |
| `transfer-tax-api.ts` · `-api-split.ts` · `-validate-split.ts` · `calc-wizard-asset-migrate.ts` · `transfer-per-asset-summary.ts` | 716·370·675·679·668→0~+25 | 전송·검증은 신규 모듈/`buildLandPartCausePayload`, 정규화 본문은 carryover 파일, summary는 분기 추가 없음 |
| `FilingFormTableHelpers.ts` · `transfer-tax-split-display.ts` | 700·502→0 | 신규 파일(§6) |
| `CompanionAcqPurchaseBlock.tsx` · `CarryoverGiftBlock.tsx` · `LandPartCauseBlock.tsx` · `BuildingCauseMixBlock.tsx` · `CompanionAcquisitionCauseSection.tsx` | 576·369·285·168·384→+15·+60·+45·+45·+25 | 주입값 교체/분기만. B 패널·파트 카드는 신규 파일 |
| 신규 | — | `SplitPartCarryoverCard`≈170 · `LandCarryoverCard`≈90 · `BuildingCarryoverMixPanel`≈90 · `CarryoverPartsSaleAxis`≈70 · `validate-split-carryover`≈120 · `api-part-carryover`≈250(추출) · `split-carryover-display`≈110 |

---

## 8. 런타임 실측 (H-4 · H-5 · H-6) — throwaway probe(`__tests__/**/_spco-ui-probe*`, 보고 후 삭제)

### 8.1 H-4 — 저장값 `landAcquisitionCause:"carryover_gift"` 렌더 → **크래시 확인 (잠재 결함)**

- 재현: `makeDefaultAsset` + 주택, 호스트 `purchase`(취득일 2021-03-01) 또는 `newConstruction`(사용승인 2020-06-01), `landAcquisitionCause:"carryover_gift"`, `landCauseHost:`호스트와 동일, `hasSeperateLandAcquisitionDate:true`, `landAcquisitionDate:"2023-03-01"`, 파트 방식 `actual`.
- 술어: `effectiveLandAcquisitionCause`·`engineLandOverlay` = `"carryover_gift"`(캐스트 통과 — `transfer-land-part-cause.ts:54`), `landCauseMixActive` = true.
- ⑤ `render(<CompanionAcquisitionCauseSection …/>)` → **두 호스트 모두 `TypeError: Cannot read properties of undefined (reading 'label')`** (`LandPartCauseBlock.tsx:114` `LAND_CAUSE_META[cause]` = undefined → 활성 분기 `meta.label`). 같은 키 접근 7행(§1)이 연쇄 후보.
- ⑧ 크래시 아님 — G-1 메시지 「…토지 파트만 배우자·직계존비속 이월과세로 계산하는 기능은 지원하지 않습니다…」(정상 차단). ④ body는 `landAcquisitionCause:"carryover_gift"`·`isSeparateAcquisition:true`·`landAcquisitionDate:"2023-03-01"` 그대로 전송.
- **판정: 잠재 결함(현행 UI로는 도달 불가).** 라디오가 2옵션이고 타입 유니온이 막는다. 그러나 `migrateAsset`은 `undefined`만 채우고(`migrate.ts:82`) 값을 거르지 않으므로 손상·시드된 sessionStorage/이력은 복원 때마다 같은 렌더에 도달한다(루프 여부 미실행 — 확인 필요). **P3에서 값이 합법화되는 순간 META 누락이 곧 현실 결함**이라 §2.2의 화이트리스트 교체와 META 키 추가를 P3 선결로 둔다. 회귀 가드 PC6.

### 8.2 H-5 — 이월과세 호스트 + 소유자 분리 → **⑧ 미검증 확인 (⑧≢⑫ 결함, 막다른 길은 아님)**

- 재현: 주택, `acquisitionCause:"carryover_gift"`, `selfOwns:"building_only"`(및 `land_only`), 이월과세 서브폼 완비(등기 2023-03-01·증여자 2000-01-01·가액·평가액·관계 spouse·동일세대 「아니오」), 양도일 2025-06-30, 안분 칸(취득시 기준시가·면적·양도시 기준시가) **전부 비움**.
- ⑧ `collectStepIssues(0)` → **오류 0건(통과)** (`validate-acquisition.ts:355` 이월과세 분기 `return null`). ④ body에 `selfOwns`+`carryoverTaxation` 전송. ⑫ **400** `fieldErrors`: `standardPricePerSqmAtAcquisition`·`acquisitionArea`·`standardPriceAtAcquisition`(「토지·건물 소유자가 다르면 취득가액을 기준시가 비율로 나눠야 합니다…」)·`landStandardPriceAtTransfer`·`buildingStandardPriceAtTransfer`. 대조군 `selfOwns:"both"`는 ⑧ 통과·⑫ 200.
- 칸이 화면에 있다: `NonPurchaseSplitInputsBlock`(`CompanionAcquisitionCauseSection.tsx:381`)이 이월과세 호스트에서도 렌더. 채우면(단가·면적·총액·건물 기준시가·양도시 토지·건물 기준시가) ⑧ 통과 · ⑫ **200 · `carryoverTaxationDetail`·`splitDetail` 존재 · 결정세액 67,052,856**(mock 세율). 그래서 **침묵 오답도 막다른 길도 아니다** — ⑧이 안내하지 않아 「다음」 통과 후 서버 400으로만 알게 되는 ⑧≢⑫ 모순(`feedback_validation_sync_8th_point`).
- 수정 방향(미구현, 효과는 함수 단독 호출만 확인): 이월과세 분기 끝에서 `selfOwns≠both`면 `validateSplitDirectInputs`로 위임. 같은 입력에서 이 함수는 「…취득 당시 ㎡당 개별공시지가·면적·기준시가 총액을 입력하세요 (소득세법 §99①1호·시행령 §166⑥)」(앵커 이동 가능)를 낸다. 위임 후 이월과세 leaf와의 충돌 격자는 미검증.
- **판정: 결함(🟠 ⑧≢⑫).** 별건 소형 PR 권고 — **P2 첫 커밋이 아니라 선행 PR**(기존 기능 동작을 바꾸므로 P2 diff에서 분리). 이월과세 분기를 어차피 추출하는 P2와 충돌하지 않게 H-5가 먼저 머지되는 순서가 낫다.

### 8.3 H-6 — 일반건물 이월과세 환산 + PHD/APD → **막다른 길 확인 (결함)**

- 재현: 일반건물(`assetKind:"general_building"`, 토지 이월과세, 환산 모드 기준선), 이월과세 서브폼 `useEstimatedAcquisition:true`, `estimationMode` ∈ {general, phd, apd}, `donorStandardPriceAtAcquisition` 비움(phd/apd) — `general`은 80,000,000/200,000,000 입력.
- ⑧ `collectStepIssues(0)`: general **0건** · phd **「carryover.donorStandardPriceAtAcquisition: 자산 토지: 증여자 취득 당시 기준시가를 입력하세요 (환산 분자).」** · apd 동일. ④ `landCarryoverTaxation`은 phd/apd에서 `donorStandardPriceAtAcquisition` 키 자체가 없다.
- 화면: 그 칸은 `CarryoverEstimationSection.tsx`의 `general` 분기 안(`:92-163`)에만 있고 phd/apd 분기(`:165-205`)에는 없다 → 이동 앵커가 화면에 없는 **막다른 길**. 주택 whole-asset 경로의 ⑧(`validate-acquisition.ts:313-345`)은 모드별로 갈라 phd/apd에 이 칸을 요구하지 않는다 — 일반건물 ⑧(`validate-gb-carryover.ts:81-82`)만 모드를 구분하지 않는다.
- **판정: 결함(일반건물 한정, ⑧이 화면보다 엄격).** 별건 PR(권고: 일반건물 ⑧을 모드별로 분기하거나 일반건물 화면에서 phd/apd 옵션 제거 — 후자는 일반건물에 개별주택가격 개념이 없어 근거가 더 명확하나 **결정 대상**). 이 설계의 파트 모드는 phd/apd를 숨기므로 영향 없음 — **`validateCarryoverParts` 추출 시 이 모드-무구분 규칙을 그대로 복사하지 않는다**(추출 함수는 일반 기준시가 고정 전제). 미검증: 일반건물 ④가 phd/apd에서 PHD payload를 실제로 싣는지.

## 9. 기존 테스트 반전·갱신 · 신규 테스트

### 9.1 반전·갱신 (역방향 grep — **필드명·testid·상수** 기준)

| 파일:위치 | 현재 → 조치 |
|---|---|
| `e2e/transfer-acq-cause-mixed-d0.spec.ts:37` · `d1-2.spec.ts:46` · `split-mode-gating.spec.ts:739` | `land-acq-cause` 안 `getByRole("radio",{name:"증여"})` → **`exact:true` 필수**(P3) — 「이월과세(증여)」 옵션이 생기면 Playwright 부분 일치로 strict 위반. 옵션 수를 세는 단언은 grep 0건 |
| 같은 spec `:41`·`:47` · `d2-2.spec.ts:143` | `land-gift-carryover-notice` visible · `building-gift-carryover-notice` toContainText("이월과세") → 유지(testid 불변, N1·N2·N2′ 만족). 문구 단언 추가 |
| `e2e/transfer-acq-cause-mixed-d2-2.spec.ts:214-217` | 「이월과세(증여)에는 토글이 없다」 `toHaveCount(0)` → **P4 반전**(토글 visible). 부담부증여 호스트 `toHaveCount(0)`은 유지 |
| `__tests__/calc/transfer-land-part-cause.d2.predo.render.test.tsx:56-61` A3 | 이월과세 호스트에 D1 토글 부재 → 유지 + B 토글 가시 단언 추가(P4). `:190` 유지 |
| `…d2.predo.test.ts:198-203` A3 | `effectiveLandAcquisitionCause(이월과세 호스트)==""` → **유지**(부정형 짝 — B는 별 술어) |
| `__tests__/api/transfer.route.split-land-part-cause.d1.predo.anchor.test.ts:395-410` D1-Z 격자 | `carry` 열 → 서브객체 없는 `landAcquisitionCause:"carryover_gift"` 단독 셀 기대값을 엔진 설계(E-1)에 맞춰 갱신, ⑧≡⑫ 동일 단언 유지 |
| `__tests__/api/transfer.route.multi-key-coverage-f12.test.ts` | 새 키 미등록 시 실패해야 정상 → P2에서 4키 등록 후 통과 확인. 엔진 `split-part-cause.d1/d2.test.ts`(R-X5·`BUILDING_CAUSE_UNSUPPORTED`)는 엔진 소관 |

### 9.2 신규 E2E (`e2e/transfer-split-part-carryover-{c,a,b}.spec.ts`, 시드는 `e2e/_helpers/split-acq-display.ts` · `general-building-carryover.spec.ts` 구성, 워크트리는 `E2E_PORT` 필수)

공통 단언(각 spec): **Network 요청 body에 신규 키 존재**(폼에서 payload가 만들어지는지 — vitest가 못 잡는 결함) · 사용하지 않는 키 부재(C: 최상위 `carryoverTaxation`·`landDecedentAcquisitionDate`·`landSec164Value`) · 결과 4뷰 testid · 사이드바 취득가액 pending→값 · ⑧ 빈 상태에서 「다음」→ 첫 빈 칸 이동(§3.5/4.4/5.4 순서대로 한 칸씩 채움) · 모바일 375px 스크린샷(칸 잘림 0) · 컴패니언 카드에서 N6·토글 부재 · 다건 임베드에서 차단 · 1세대1주택 겹침 시 N4/차단 · 부정형 짝(토글 OFF·원인 변경 시 키 소멸, 값 복원) · 「취득 당시 개별주택가격 미공시」 부재.
- 추가: `e2e/_helpers/validation-field-jump-cases-split-carryover.ts`(이동 앵커 케이스 표, 기존 `…-gb.ts` 형식) · H-5 선행 PR용 `carryover + selfOwns` ⑧ 이동 케이스.

---

## 10. 엔진 설계와 맞출 접점 (E-n)

엔진 설계서가 아직 없어 「draft」는 엔진 Pre-Do 초안 anchor(`__tests__/api/transfer.route.split-part-carryover.predo.anchor.test.ts` SPCO-T1~T16·헤더 주석)에서 읽은 값이다. 설계서 본문 확정 후 먼저 대조한다.

| # | 지점 | 이 문서의 가정(= draft) | 어긋나면 |
|---|---|---|---|
| E-1 | **와이어 키** | `carryoverGiftEvent`+`landCarryoverPart`/`buildingCarryoverPart`, 파트에 평가액 없음(`*AcquisitionPrice` 정본), `giftTaxBase` 필수·`giftTaxCalculated` 0 허용(SPCO-T 0건 확인). **사용자 가정 `*CarryoverTaxation`과 다르다** | §2.4·§3.5 키 이름 치환, 평가액 바인딩(§0 #6) 재검토 |
| E-2 | A/B/C 파생값 | A·C `landAcquisitionCause:"carryover_gift"`, B `"purchase"`+건물 원인 `carryover_gift`; C `isSeparateAcquisition:false`·`landAcquisitionDate`=등기일; B·C 최상위 `carryoverTaxation` 병용 400(T8)·stray Part 400(T15)·서브객체 없는 이월과세 400(T16) | ④ 파생식·`isSplitPayloadActive`/`partInputsActive` 항 수정 |
| E-3 | 날짜 강제 | 증여 등기접수일 ≠ 파트 취득일이면 400 `landAcquisitionDate`(T14) — 한 곳 입력(Q-8)과 일치 | ⑧에 같은 검사(3중) |
| E-4 | 1세대1주택 차단 | `isOneHousehold ∧ 주택 ∧ 미등기 아님`이면 P5 전 400(T10) | ⑧ 보유 상황 단계가 같은 leaf를 호출, 앵커·문구 정본은 엔진 |
| E-5 | 컴패니언·다건 | 다건 `MULTI_REJECT_RULES` 명시 거부(T11)·컴패니언 새 키 400(T12)·**주 자산 파트 이월과세 + 컴패니언 존재 400(T13)** | §2.6 행·N6·N8 문구 |
| E-6 | 환산 범위·분모 | 파트 모드는 일반 기준시가만, 분모 = 파트 양도시 기준시가(축 A) — 설계서 미확인 | 미지원이면 환산 토글 제거 + ⑧ 차단 |
| E-7 | 결과 echo | 파트별 증여자 취득일·A/B 결정세액·채택·배제 사유·증여세 상당액 분해(산출세액·평가액·과세가액·한도)·환산 분자/분모, `SplitPartResult` JSDoc 갱신 | 필드명 정본, §6 표 문구만 조정 |
| E-8 | 지분 스케일(V-5)·비주택 `building` 허용·같은 날(Q-4)·Y8 | `PART_SCALE` 승계 · 비주택 허용(`isLandBuildingSplitable`) · A·C에서 같은 날 비차단 | 비주택 제외면 술어에 `assetKind==="housing"` 추가(3중), 같은 날 차단이면 N7·⑧ 문구 |

---

## 11. 확인 필요 / 미검증 레지스트리 · 사용자 결정

- 사용자에게 다시 물을 것: **없음.** (하위 UI 선택은 이 문서가 정했다 — C 토글 ON 시 기존 입력을 건물로 재해석+고지, B·C 날짜는 읽는 쪽 파생, A만 write-through, H-5 선행 PR.) 단 **E-1(사용자 가정 키 ≠ 엔진 draft 와이어)** 은 엔진 설계서 확정을 따른다.
- 미검증: V-U1 H-4 손상 저장값의 복원 크래시 루프 여부 · V-U2 데스크톱·모바일 화면(§3.2·§5.2 목업은 코드 추적 기반, 구현 시 Playwright 확인) · V-U3 환산 분모 = 파트 양도시 기준시가 가정(E-6) · V-U4 H-5 수정의 통합 효과(함수 단독 호출만 확인, 이월과세 leaf 충돌 격자 미검증) · V-U5 일반건물 ④의 phd/apd payload 송신 여부 · V-U6 파트 모드에서 배우자 예외 사실(`spouseGiftOneHouseAtGiftDate`) 질문 숨김 가정(P5와 연동, 엔진 확인).
- 법령 인용은 계획서 §2(KoreanLaw 조회 2026-10-19)를 따르며 이 문서가 새 해석을 추가하지 않는다. 비교과세 단위(Q-3)는 정면 해석례 미확보(V-1) — 결과 화면에 「확인 필요」를 싣는다.

---

## 12. P2(C) 구현 환류 (2026-10-19, Do 단계 — 설계와 달라진 점 · 설계가 말하지 않은 것)

구현·검증 중 설계서와 달라지거나 설계가 비워 둔 곳을 모았다. 전부 anchor·E2E로 고정돼 있다 — 뒤집으면 해당 테스트가 빨개진다.

| # | 설계 | 구현 | 근거 |
|---|---|---|---|
| U-1 | §2.4 일반건물 비공개 빌더(`buildPart`·`PART_SCALE` 등)를 공용 모듈로 **추출** | **추출하지 않았다.** 신규 `transfer-tax-api-split-carryover.ts`가 와이어(사건 1벌 + 파트 2벌)를 독립 구현하고 일반건물 코드는 한 줄도 바꾸지 않았다 | 파트에 평가액·환산 필드가 없어 모양이 다르다(일반건물은 `giftDateAssetValue`·`useEstimatedAcquisition` 포함). 추출은 일반건물 회귀 위험만 키운다(Surgical). 지분 규약(I-3)은 같은 식 — 사건 금액 미스케일, 파트 금액만 `ratioed` |
| U-2 | §2.2 `effectiveCarryoverDonorSplit` 첫 자산 조건 | `opts.isNonPrimary`를 받는다. 순서를 모르는 곳(정규화 사본 · `carryoverHouseholdFactVisible` · 거주 구간 안내 술어)은 생략한다 | 그 자리의 값은 ⑤·⑧·④가 모두 같은 술어를 읽으므로 어긋나지 않는다. 컴패니언에 잔재 토글이 남는 경로는 U-16에서 실측으로 확정했다(지분 분할 카드는 첫 자산을 복제하지 않는다 — 형제는 기본 자산) |
| U-3 | §3.1 ④ | `isSplitPayloadActive` · `partInputsActive` · 토지 취득일에 C 항 외에 **같은 술어로 막아야 하는 잔재 5곳**을 더 넣었다 — `isSeparateAcquisition`(취득일 분리 잔재) · `normalizeBuildingCauseInputs`(파트 방식 actual 고정) · `phdFlagEffective`(PHD 자동 ON 잔재) · `isCarryoverGeneral`·`carryoverPhdMode`(환산 잔재) · `d2Mix`(자산 단위 추계 플래그 잔재) · `carryoverAcquisitionDateFallback`(남은 `acquisitionDate`) | 격자 `c.parity-grid`의 「잔재」 9셀이 각각 ⑫ 400을 냈다(엔진 S4·S5·`appraisalValue` 요구). 화면에 없는 값이 ④로 새면 막다른 길 |
| U-4 | — (설계 없음) | C에서 ④는 `expenses: 0`을 싣는다(`acquisitionPrice`는 그대로 — 뮤테이션으로 0 고정이 불필요함을 확인했다: 엔진이 C에서 총액을 읽지 않고 ⑧의 «파트 합 ≤ 총액» 검사만 `skipTotals`로 건너뛴다). ⑧은 «이전 입력 형식 필요경비»가 **보이는 경우만** 막고(`data-field="directExpenses"` 추가) 숨은 잔재는 무시한다 | 자산 단위 필요경비 총액은 파트에 안분되지 않는다(엔진 S8: `expenses > 0` 400). 보이면 입력을 조용히 버리지 않고, 숨었으면 화면에 없는 값을 보내지 않는다 |
| U-5 | §3.5 ⑧ 순서 | 화면 순서대로 구현(가업 선언 → 등기접수일 → 관계 → 토지 파트 → 건물 파트 → 증여세 → leaf → 축 A). 증여자 취득일 ≤ 증여일을 **거울**로 둔다(엔진 F-6, 같은 날 허용 — 자산 전체 이월과세 ⑧의 「이전이어야」보다 느슨) | 격자: ⑧ 통과 ⇒ ⑫ 200, leaf 소관(S9·S2′·F-6·Σ·필수 칸) ⑧ 차단 ⇔ ⑫ 400 |
| U-6 | §3.5 S9 | S9(1세대1주택 겹침)는 **보유 상황 단계(UI 인덱스 1)**에서 검증하고 앵커는 «1세대 해당» 토글(`data-field="isOneHousehold"` 추가). 자산 단계에서는 `isOneHousehold`를 넘기지 않는다 | 1세대 여부는 그 단계에서 정해진다. 자산 단계에서 막으면 고칠 칸이 다른 화면에 있다 |
| U-7 | §3.4 ⑥ | `directAcqRaw`가 C이면 `pending`, `splitHasNonActualOwnedPart`가 C이면 참 → 입력 단계는 «계산 후 표시», 결과 후 기존 분기(`summarizeSplitGain`)가 푼다. 추가 분기 없음 | `__tests__/lib/transfer-per-asset-summary.split-carryover-c.test.ts` |
| U-8 | §6 ⑦ | 4뷰 공용 view `transfer-tax-split-carryover-display.ts`. 상세명세서는 일자 그룹을 렌더하지 않으므로 파트별 기산일은 **산출세액 행 ※**와 숨은 일자 행에 싣는다. 신고서는 `FilingFormTableSplitCarryover.ts`(`FilingFormTableHelpers.ts` 증가 8줄) | 일자 그룹 미렌더 규약(`DetailedStatementConfig.ts`) |
| U-9 | §6 「확인 필요」 | **엔진 echo에 표지가 없어 최소 추가**: `SplitCarryoverEventEcho.orderDependent?: true` — 두 파트 모두 ②3호 대상이고 안정 구성이 둘 이상일 때만. 해결자가 4조합 결정세액(대부분 메모에 있음)으로 판정하고 **세액·채택은 바꾸지 않는다** | 설계서 §4.2(100/1,050) |
| U-10 | §3.2 건물 카드 caption | «토글 ON 시 입력이 건물로 재해석된다» 고지를 **조건 없이 항상** 건물 카드에 둔다(「토글을 켜기 전에 입력한 값이 있다면」) | 토글 시점에만 보이는 고지는 상태로 표현할 수 없다(`useEffect`→store 금지) |
| U-11 | 범위 밖(미지원) | 증여일 < 2005-04-30(영 §163⑨ 단서 2호) C는 ⑧이 막는다 — ④가 `buildingHouseKind`·`buildingSec164Value`를 싣지 않아 엔진 Y4가 400. 앵커는 증여 등기접수일. 증여일이 그 구간이 되려면 양도일 ≤ 2010-04-30(5년 적용기간)이라 도달이 매우 좁다 | P5 이후 |
| U-12 | N2·N3 | H-2 중간본을 `BuildingCauseMixBlock`에 반영(`building-gift-carryover-notice` testid 유지) | §2.7 |
| U-13 | §6 ⑦ 기산일 | 장기보유특별공제 기산일과 **세율 기산일을 가른다**. 종전 문구 「증여자 취득일부터 보유기간·세율 기산」은 주택 토지 파트에서 틀렸다 — 엔진은 세율에 `max(법정 기산일, 건물 취득일)`을 쓴다(probe: 양도 2025-06-30 · 증여 2023-03-01 · 토지 증여자 1995-03-01 · 건물 증여자 2015-06-01 · 양쪽 적용 → 장특 기산 1995-03-01, `appliedRateBasisDate` 2015-06-01). 장특 기산 = 엔진 파트 `acquisitionDate`, 세율 기산 = `appliedRateBasisDate`이고 **엔진이 파트별로 세율을 판정했을 때(`partRateBasisApplied`)만** 낸다(D1-3 규약). 4뷰: 카드 `split-card-lthd-start-*` + `split-card-rate-basis-*`, 상세명세서 산출세액 ※·취득가액 각주, 신고서 취득일 각주·보유기간 각주(「장기보유특별공제 보유기간」), PDF 판정 행 | `split-carryover-p2c.rate-basis.ui.anchor.test.tsx` — 단기 경계 시료 3종(건물 증여자 취득일 2년 미만·1년 미만·정확히 2년)에서 표시 세율 기산일 = 엔진 echo, 결정세액은 엔진값 그대로 |
| U-14 | §6 「확인 필요」 | 상세명세서 산출세액 ※에도 `splitCarryoverNotices`를 싣는다(카드·PDF와 같은 문장). 신고서는 채택 주석만 둔다 | views anchor |
| U-15 | §3.1 토글 | 저장값 ON인데 `effectiveCarryoverDonorSplit`가 거짓(소유자 분리·부담부증여)이면 토글 아래에 「지금 조건에서는 적용되지 않습니다 — 사유」 한 줄(`carryover-donor-split-inactive`). 값은 지우지 않는다 | `split-carryover-p2c.section.ui.test.tsx` |
| U-16 | U-2 | 컴패니언 ON 잔재: 첫 자산에서 켠 뒤 종류를 토지로 바꾸고 「주택 먼저로 교환」으로 그 자산을 두 번째로 내린 다음 다시 주택으로 바꾸면 컴패니언에 ON 잔재가 선다(지분 분할 카드는 첫 자산을 복제하지 않는다 — 실측). 그대로 두면 ④ 본문 `companionAssets[].isSeparateAcquisition`이 true→false로 뒤집히고 ⑥ 취득가액이 9억→«계산 후 표시»가 된다. 읽는 쪽 `neutralizeCarryoverDonorSplitForCompanion`이 ④ 본문 조립·⑥ 행 합계에서 컴패니언의 토글을 꺼진 것으로 읽는다(값 보존). ⑧은 `isNonPrimaryAsset`로 이미 갈려 중화가 필요 없음을 뮤테이션으로 확인했다 | `transfer-split-part-carryover.c.companion-residue.test.ts` |
| U-17 | §3.3 축 A 게이트 | `CompanionAcqPurchaseBlock`의 `isSeparateAcquisition` 호출이 ④·⑧과 같은 입력(취득원인·토지 원인·호스트·양도 유형·소유자·C 토글)을 넘긴다 — 일부만 넘기면 stale·C 판정이 꺼져 UI=별개 취득, ④=아님으로 갈린다 | `split-carryover-p2c.purchase-block-gate.ui.test.tsx` |
| U-18 | U-11 | C의 고시 전 증여 차단 문구는 C에 있는 조치만 안내한다 — D2의 「토지는 다른 원인으로 취득을 끄세요」는 C에 없다. 같은 leaf에서 `landPurchase`가 거짓일 때(= C) `BUILDING_CAUSE_PRE_DISCLOSURE_CARRYOVER_MESSAGE`·`BUILDING_CAUSE_APARTMENT_CARRYOVER_MESSAGE`(증여 등기접수일 확인 또는 C 토글 끄기). 격자 셀 6종(증여일 2005-04-29/04-30 · 1990-08-29, 주택·비주택 건물): ⑧ 차단 ⇔ ⑫ 400 | `c.parity-grid` |

### 12.1 검증 요약

- 격자 `__tests__/calc/transfer-split-part-carryover.c.parity-grid.test.ts` — 폼 → ④ body → ⑫ route와 ⑧(단계 0·1)을 같은 폼에서 나란히. 기준 셀 결정세액 300,018,000(엔진 C_NEW와 일치).
- E2E `e2e/transfer-split-part-carryover-c.spec.ts`(요청 body 새 키·결과 4뷰·컴패니언·다건·1세대1주택·이력 복원·구 이력·handoff 상태·⑧ 순서·모바일) + `transfer-validation-field-jump.spec.ts` «c: » 18건.
- 개발 서버: 워크트리 `node_modules`가 심볼릭 링크라 Turbopack이 root 밖으로 보고 panic한다 — E2E를 돌릴 때만 `next.config.ts`에 `turbopack.root`를 임시로 줬다(커밋하지 않는다).

---

## 13. P3(A) 구현 환류 (2026-10-20, Do 단계 — 설계와 달라진 점 · 설계가 말하지 않은 것)

| # | 설계 | 구현 | 근거 |
|---|---|---|---|
| U-19 | §2.2 H-4 | `effectiveLandAcquisitionCause`가 `inheritance`·`gift`만 돌려준다(캐스트 삭제). ⑤ `LandPartCauseBlock`도 저장값을 캐스트하지 않고 `landCauseDisplay`에서 읽는다 | 실측: P2 머지 후에도 저장값 `carryover_gift`가 매매·신축 두 호스트에서 `TypeError … reading 'label'`로 렌더를 깼다. 캐스트만 바꾸고 A를 열지 않으면 P1 테스트 2건(`body-spread` · D1-Z3 `carry` 칸)이 캐스트 통과에 기대고 있어 빨개진다 — 그래서 단독 PR이 아니라 P3 첫 단계로 함께 했다. 두 테스트는 A 폼 경로로 옮겼다(D1-Z3 `carry` 칸은 이제 ⑧이 A로 읽어 증여 등기접수일을 요구 ⇔ ⑫ 400) |
| U-20 | §2.2 `effectiveLandCarryover` = … ∧ 소유자 분리 아님 ∧ 부담부증여 아님 ∧ 첫 자산 | **세 조건을 술어에 넣지 않았다.** 호스트·분리·호스트 태그·원인만 본다. 소유자 분리·부담부증여는 leaf S4가, 함께 양도 자산은 ⑧ 맨 앞(leaf S0 문구)이 막고, ④는 함께 양도 자산이면 키를 싣지 않는다(`partCarryover`·`buildSplitCarryoverPayload`의 `isNonPrimary`) | 술어에서 조용히 끄면 토지가 «매매 토지 + 증여 신고가액»으로 계산된다(D1과 같은 이유 — D1 술어도 이 셋을 거르지 않고 leaf가 막는다). 격자 `구조:` 셀 2개가 ⑧ 차단 ⇔ ⑫ 400 |
| U-21 | §2.3 `CarryoverGiftBlock partMode` | **partMode를 두지 않았다.** 새 `LandCarryoverCard`가 `SplitPartCarryoverCard`(증여 신고가액 칸 선택화) + `SplitCarryoverParts`에서 추출한 `SplitCarryoverGiftTaxCard` + `CarryoverGiftExclusionSection`(`anchorPrefix` 추가)를 조립한다 | `CarryoverGiftBlock`은 418줄이고 모든 칸이 `carryover`에 묶여 있다 — partMode를 얹으면 자산 전체 이월과세 경로를 건드린다(Surgical). A의 토지 증여 신고가액은 기존 토지 가액 칸이 받으므로 카드에서 뺐다(같은 `data-field` 두 개 금지 — RTL·E2E가 앵커 각 1개를 단언) |
| U-22 | §2.5 `validateSplitCarryoverInputs` | 이름을 `validateSplitCarryoverParts`로 바꾸고 C·A 공용으로 일반화했다. 끝의 `validateSplitDirectInputs` 호출은 호출부로 옮겼다(C: `validateCarryoverAsset` · A: `validateSplitDirectInputs` 자신이 `validateLandPartCause` 다음에 잇는다) | A 위임(`validateLandPartCause` → 이 모듈)과 이 모듈의 `validateSplitDirectInputs` import가 순환을 만든다 |
| U-23 | §4.4 ⑧ 순서 | 함께 양도 2번째 이후 자산의 A는 **맨 앞**에서 막는다(입력을 다 채운 뒤 알게 하지 않는다). 앵커는 토지 취득 원인 | 엔진 S0 |
| U-24 | §4.3 「같은 날(Q-4): A에서는 차단하지 않는다 → leaf 확정 필요(E-5)」 | **⑧이 막는다**(D1과 같은 ⑤·⑧ 정책, ⑫는 통과). 앵커 `landCarryover.giftRegistryDate` | 같은 날이면 `isSeparateAcquisition`이 false가 되어 파트 완결 규칙이 서지 않는다 — D1·D2가 같은 이유로 막는다. leaf를 바꾸지 않는 보수적 선택(격자 strictOnly 셀) |
| U-25 | — (설계 없음) | 신축 호스트 건물 취득가액 후퇴(`splitBuildingAcqPriceInput` — 「신축비용」 칸)가 A에서도 서게 했다 | 빠지면 신축 + A에서 건물 취득가액이 비어 ⑧이 화면에 없는 건물 칸을 요구했다(probe에서 발견) |
| U-26 | — | 구주택 멸실·신축 통산(`landRebuildHost`)은 A에서 열지 않는다. 매매 호스트 축 B의 영 §163⑨ 단서 카드 3종(`LandSec164Card`·`HouseLandSec164Card`·`HouseFirstDisclosureEntryCard`)도 D1 원인에서만 연다 | 매매 호스트 판정이 «토지 overlay 없음»이라 A가 D1 술어에서 빠진 뒤 통산 블록이 열렸다. 이월과세 증여는 양도일 전 10년 안이라 단서 구간에 닿지 않는다(격자 `잔재:` 셀) |
| U-27 | §6 ⑦ | **결과 결함 수정**: 신고서 합계·건물 열과 상세명세서 취득일이 «파트 이월과세면 수증자 취득일 = 증여 등기접수일»(C 전제)로 고정돼 있어 A의 건물 매수일(2021-03-01)이 등기접수일(2023-03-01)로 나왔다. view에 `buildingGifted`(건물 파트도 증여)를 두고 두 뷰가 그것을 읽는다. 상세명세서 산식 문구도 「건물 취득일 — 토지는 이월과세(증여)」로 갈린다 | `split-carryover-p3a.views.ui.anchor.test.tsx` · E2E 신고서 취득일자 행 |
| U-28 | §4.3 Q-8 | 읽는 쪽 사본은 별 함수 `normalizeSplitCarryoverInputs`가 아니라 기존 `normalizeBuildingCauseInputs`에 A 분기로 넣었다(토지 취득일 ← 증여 등기접수일, 토지 방식 `actual`) | ④·⑥·⑧이 이미 그 한 함수를 통과시킨다 — 새 통과 지점을 만들면 빠뜨리는 소비처가 생긴다 |
| U-29 | — | 다건 ⑧(`validateMultiSupportedMode`)이 A도 「단건 전용」으로 막는다. ④ `expenses`는 `partCarryover(primary).land`이면 0(C·A 공통, 엔진 S8) | 설계 §2.6 «A만 신규 구멍» |
| U-30 | — | ⑤·⑧이 취득시 기준시가 필요 판정에 넘기는 `expenses`도 ④와 같게 `partCarryover(asset).land`이면 0(`withExpenses` · `CompanionAcqPurchaseBlock` `acqStdNeedFlags`) | 숨은 이전 형식 필요경비 잔재가 남으면 ⑧이 계산에 쓰이지 않는 건물 기준시가를 요구했다(격자 「숨은 이전 형식 필요경비」 셀이 잡음) |
| U-31 | — | `CompanionAcqPurchaseBlock`의 `isSeparateAcquisition` 부분 객체 호출에 `landCarryover`를 넘긴다 | 빠지면 A 정규화가 토지 취득일을 빈 등기접수일로 덮어 ⑤만 «별개 취득 아님» — ④가 읽지 않는 자산 전체 「취득가액 산정 방식·취득가액 *」 칸이 떴다(P2 Check ②와 같은 부류) |

### 13.1 검증 요약

- 격자 `__tests__/calc/transfer-split-part-carryover.a.parity-grid.test.ts` — 매매·신축 두 호스트 × 셀(leaf 소관·⑧ 전용·잔재·구조) + 앵커·S9·S2′·컴패니언·다건·부정형 짝·H-4. 기준 셀 결정세액 172,260,000(엔진 SPCO-T1과 일치).
- ⑤ `__tests__/components/split-carryover-p3a.section.ui.test.tsx`(라디오 3옵션·앵커 각 1개·읽기 전용 날짜·Q-8 한 patch·컴패니언 옵션 숨김·H-4 회귀) · ⑥ `__tests__/lib/transfer-per-asset-summary.split-carryover-a.test.ts` · ⑦ `__tests__/components/split-carryover-p3a.views.ui.anchor.test.tsx`.
- 뮤테이션 15건 전부 KILLED(H-4 화이트리스트·정규화 A 분기·`partCarryover` A·신축 건물가 후퇴·④ A payload·⑥ pending·⑥ 비실가·다건 차단·재건축 호스트 제외·⑧ 비주 자산·⑧ 같은 날·⑧ A 진입·결과 `buildingGifted`·⑧/④ expenses 0). E2E는 ④ A payload 변형으로 실패 확인.
- 🔴 별건(P3 범위 밖, 미수정): **신축 호스트 + 토지 상속·증여(D1) + 숨은 이전 형식 필요경비** → ⑧이 `buildingStandardPriceAtAcq`를 요구하지만 신축 호스트에는 그 칸이 없다(매매 블록 미마운트). probe 실측 — 매매 호스트는 카드가 열려 정합.
- E2E `e2e/transfer-split-part-carryover-a.spec.ts`. 기존 spec 3곳(`d0`·`d1-2`·`split-mode-gating`)의 토지 원인 «증여» 라디오 셀렉터에 `exact: true`(§9.1).
