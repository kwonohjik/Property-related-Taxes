# 주택 split 파트 이월과세(§97의2) — 엔진 설계 (P1)

**계획서**: [`docs/00-pm/transfer-split-part-carryover.plan.md`](../../00-pm/transfer-split-part-carryover.plan.md) (Q-1~Q-10 확정)
**Pre-Do anchor**: `__tests__/api/transfer.route.split-part-carryover.predo.anchor.test.ts` (현행 고정 15건 pass · 목표 16건 skip)
**작성**: 2026-10-19 · base master `a89e81d81` · 이 문서의 수치는 전부 같은 route·같은 mock 세율의 **대리 계산 실측**이다(§9).

> 이 문서의 §1이 **와이어 정본**이다. UI(④⑤⑧)는 §1·§6에 맞춘다. 계획서와 다른 점은 §0 「보강」에 모았다.


> ⚠️ **통합 정정(계획서 §11)**: §5 지분 판단 중 「사건 금액(산출세액·과세가액)도 스케일」은 채택하지 않는다 — 일반건물 `GIFT_EVENT_SCALE`이 전부 미스케일이다(I-3). 파트 금액·파트 평가액만 스케일.

---

## 0. 결정 요약

| # | 결정 | 근거 |
|---|---|---|
| D-1 | 새 엔진 모듈은 **입력 치환 해결자 1개**(`transfer-tax-split-carryover.ts`). `calcSplitGain`·장특·세율·§104⑤ 엔진은 **한 줄도 바꾸지 않는다** | A 채택 입력 = 파트 취득일·취득가액을 증여자 값으로 바꾼 **일반 split**이라 장특 `holdingYears`(`transfer-tax-split-gain.ts:331,335`)·세율 기산(`transfer-tax-appurtenant-land.ts:69` `resolveLandRateBasis`)이 같은 치환 날짜를 읽는다 → 두 기산이 구조적으로 일치 |
| D-2 | 해결자는 `runPreCalculationSteps`의 **STEP 0.476**(0.475 바로 뒤, `transfer-tax-precalc.ts:158` 블록 다음)에 꽂고 `calculateTransferTax`를 **주입**받아 재귀 호출한다 (`calcCarryoverScenarios`와 같은 구조) | 순환 의존 회피, 재귀 시 서브객체를 비워 무한 루프 없음 |
| D-3 | ②3호는 **파트별 A/B**를 기존 `resolveFilingUnitCarryoverScope`(`transfer-tax-aggregate-carryover-scope.ts:62`)로 푼다 — 순차 고정점, 동률 A, 순서 토지→건물, MAX_PASSES 2 | N-1 사용자 결정(2026-08-23)이 「2ⁿ 전수는 조문에 없는 최적화」로 기각. 1,050 격자로 실측(§4) |
| D-4 | 와이어는 **증여 사건 1벌(`carryoverGiftEvent`) + 파트 N벌(`landCarryoverPart`·`buildingCarryoverPart`)** — 최상위 형제 키. 엔진 input 필드명은 `landCarryoverTaxation`·`buildingCarryoverTaxation`·`carryoverGiftEvent` | 아래 「보강」 |
| D-5 | 증여세 상당액 안분 = ⑭ 합성기(`apportionGiftTax`), **한도 = 그 파트 gain** = 해결자 | Q-4. 자산 단위 한도는 실측으로 echo가 갈린다(anchor SPCO-T4) |
| D-6 | 1세대1주택(`isHousing ∧ isOneHousehold ∧ ¬isUnregistered`)과 겹치면 leaf가 400 | Q-5. 엔진·⑫·⑧ 공유 |
| D-7 | 다건(MULTI_REJECT_RULES)·컴패니언·**주 자산+컴패니언 병용**은 ⑫에서 명시 거부 | Q-6·Q-7. 병용은 신규 결정(§4.5·§10 V-9) |

**보강 (계획서 §6.1 문구와 다른 점 — 확인 요청)**
1. 와이어에 엔진 모양(`landCarryoverTaxation` 등)을 받지 **않는다**. 엔진 모양은 `giftTaxAmount`·`giftDateValuation`을 요구하는데, 앞은 Q-4(엔진 안분)와 이중 진실이고 뒤는 이미 있는 `landAcquisitionPrice`와 이중 진실이다. 일반건물이 같은 이유로 UI는 「사건+파트」, 엔진 모양은 하위 호환으로 둔 선례(`general-building-entry.ts:43-90` `composeGbCarryover`)를 따라, **엔진 모양은 ⑭ 합성기의 출력 이름**으로만 쓴다. `carryoverTaxationEngineShape`는 와이어에서 재사용하지 않고 그 안의 `carryoverExclusionShape`·사건 shape(`transfer-tax-building-schemas.ts:407`)만 추출해 공유한다.
2. 계획서 §4 C 기대 **295,566,000은 두 파트 모두 A일 때의 값**이다. Q-3(파트별)로 판정하면 토지가 ②3호로 배제되어 **300,018,000**이다(§4.4).

---

## 1. API 와이어 계약 (정본)

### 1.1 키와 위치

모두 `POST /api/calc/transfer` 본문의 **최상위 형제 키**다(`landAcquisitionCause`와 같은 층, `transfer-tax-schema-base-shape.ts:309`).

| 키 | 모양 | 비고 |
|---|---|---|
| `carryoverGiftEvent` | `{ giftRegistryDate:date, giftTaxCalculated:int≥0, giftTaxBase:int>0, donorRelation?:"spouse"\|"lineal"\|"other", donorDeceased?:boolean, exclusionDeclared?:… }` | 일반건물 사건 shape(`transfer-tax-building-schemas.ts:407-419`)를 `carryoverGiftEventShape`로 **추출해 공유** |
| `landCarryoverPart` | `{ donorAcquisitionDate:date, donorAcquisitionPrice:int>0, donorCapitalExpenditure?:int≥0 }` | 신규 `splitCarryoverPartShape`. **평가액 칸이 없다** — 파트 평가액은 기존 `landAcquisitionPrice`가 정본 |
| `buildingCarryoverPart` | 같은 모양 | 건물 파트 |

P1에 **싣지 않는 것**: 환산(`useEstimatedAcquisition`·`donorStandardPriceAtAcquisition`, V-4), 세대 연속성(`donorSameHousehold*`, V-6), `spouseGiftOneHouseAtGiftDate`(②2호, P5).

### 1.2 케이스별 조합 (이 표가 ⑤·⑧·⑫의 공통 진실)

| | `acquisitionCause`(건물) | `landAcquisitionCause` | 서브객체 | `landAcquisitionDate` | `acquisitionDate` | 파트 평가액 |
|---|---|---|---|---|---|---|
| **A** 토지만 | `purchase`·`newConstruction`·생략 | `carryover_gift` | 사건 + `landCarryoverPart` | **= `giftRegistryDate`** | 건물 취득일 | `landAcquisitionPrice`>0 |
| **B** 건물만 | `carryover_gift` | **`purchase`(필수)** | 사건 + `buildingCarryoverPart` | 토지 매매일 | **= `giftRegistryDate`** | `buildingAcquisitionPrice`>0 |
| **C** 둘 다 | `carryover_gift` | `carryover_gift` | 사건 + 두 파트 | **= `giftRegistryDate`** | **= `giftRegistryDate`** | 둘 다 >0 |

- 모든 케이스에서 `landAcquisitionDate`·`landAcqMode`·`buildingAcqMode`("actual" 고정)·`landAcquisitionPrice`·`buildingAcquisitionPrice`·양도가액 분리 입력이 와야 한다(별개 취득 split 입력과 동일). 이월과세 파트의 취득일 = 증여 등기접수일(Q-8) — 어긋나면 400(§6 S5).
- C에서 **top-level `carryoverTaxation`은 오지 않는다**(§2.1). B·C 호스트(`acquisitionCause: carryover_gift`)에 `carryoverTaxation`이 없어도 통과하도록 `required-refines.ts:196` 블록을 `&& !hasSplitPartCarryover`로 좁힌다(안 좁히면 「carryoverTaxation이 필요합니다」로 B·C가 400 — 본 설계의 가장 눈에 안 띄는 배선).
- 파트 서브객체가 있는데 해당 파트 원인이 `carryover_gift`가 아니면(또는 반대) **400** — 조용히 버리지 않는다(S1).

### 1.3 ⑫ 수정점

| 위치 | 변경 |
|---|---|
| 신규 `lib/api/transfer-tax-schema-split-carryover.ts`(leaf) | `carryoverGiftEventShape`·`splitCarryoverPartShape`·`splitCarryoverShape = { carryoverGiftEvent, landCarryoverPart, buildingCarryoverPart }` |
| `transfer-tax-schema-base-shape.ts` (`:309` 부근) | `...splitCarryoverShape` spread. 이 파일은 `splitAcquisitionShape`를 spread하지 **않고** 인라인 복사본을 가진다(grep) — 주 자산·다건 item이 여기서 키를 얻는다 |
| `transfer-tax-schema-split.ts` `splitAcquisitionShape` | 같은 spread(컴패니언이 받아야 §6 S2가 **명시 거부**한다. 받지 않으면 Zod가 조용히 strip — anchor SPCO-0o) |
| `transfer-tax-schema-required-refines-2a.ts:391` `refineSplitPartCause` | leaf 새 facts 전달(§6). 호출 2곳: 주 자산 `:506`, 컴패니언 `transfer-tax-schema.ts:150`(prefix) |
| `transfer-tax-schema-required-refines.ts:196` | `&& !(landCarryoverPart \|\| buildingCarryoverPart)` |
| 신규 refine | 파트 평가액 합 ≤ `giftTaxBase`(`refineGbCarryover` `partValueSum` 거울, `required-refines-gb.ts:253`), `donorRelation:"other"`는 값 검사 건너뜀(`:236` 선례) |
| `transfer-tax-schema-multi-refines.ts:40` `MULTI_REJECT_RULES` | `carryoverGiftEvent`·`landCarryoverPart`·`buildingCarryoverPart`: `whenPresent`; `landAcquisitionCause`: 값이 `carryover_gift`면 거부. **키 커버리지 가드** `transfer.route.multi-key-coverage-f12.test.ts:70`의 `scalar` 집합에 `landAcquisitionCause` 추가 |

### 1.4 ⑭ 매핑·Date 변환

- 주 자산: `app/api/calc/transfer/engine-input.ts:363-373`(split 블록) 옆에 `...composeSplitCarryover(data)` 한 줄. **컴패니언은 매핑하지 않는다**(`bundled-split-helpers.ts:411-417` 불변 — ⑫가 거부하므로 도달 불가).
- 신규 `lib/tax-engine/transfer-split-carryover-compose.ts`(순수):
  `composeSplitCarryover(d): { carryoverGiftEvent?; landCarryoverTaxation?; buildingCarryoverTaxation? }`
  - Date 변환(`lib/api/date-coerce.ts` `toDate`/`toOptionalDate`): `giftRegistryDate`·`donorAcquisitionDate`. **여기서만** 한다(⑭ 규약 — 문자열이 엔진에 도달하면 `Date < string` 침묵 false).
  - 파트별 `CarryoverTaxationInput`(`types/transfer-carryover.types.ts`)을 만든다: `giftDateValuation = d.landAcquisitionPrice`(건물은 `buildingAcquisitionPrice`), `giftTaxAmount = apportionGiftTax({giftTaxCalculated, giftTaxBase}, giftDateValuation)`(`carryover-gift-tax-apportion.ts:50`, 한도 **전**), `useEstimatedAcquisition:false`, 사건의 `donorRelation`·`donorDeceased`·`exclusionDeclared`를 **두 파트에 같은 값**으로 복사.
  - 파트 서브객체가 없으면 해당 키를 내지 않는다(키 부재 = 그 파트 일반).

### 1.5 엔진 input (`types/transfer.types.ts:1412` `landDonorAcquisitionDate` 옆)

```ts
landCarryoverTaxation?: CarryoverTaxationInput;      // A·C
buildingCarryoverTaxation?: CarryoverTaxationInput;  // B·C
carryoverGiftEvent?: { giftRegistryDate: Date; giftTaxCalculated: number; giftTaxBase: number }; // echo 전용
```
기존 `landDonorAcquisitionDate`(`transfer-tax-schema-split.ts:42`)는 A에서 **쓰지 않는다**: 해결자가 치환 입력에서 `landAcquisitionCause`를 비우므로 §104②2호 경로(`resolveRateBasis`)는 타지 않고 날짜 자체가 기산이다(§3.3).

### 1.6 ④(UI)가 지킬 것

① 위 케이스 표대로 두 날짜를 **한 번의 onChange 배치 patch**로 쓴다(useEffect 미러링 금지). ② 와이어에 `landCarryoverPart` 등은 해당 파트 원인이 이월과세일 때만, ⑧과 ⑫는 같은 leaf(§6). ③ 지분(`ownershipRatio<1`): 파트 금액(`donorAcquisitionPrice`·`donorCapitalExpenditure`)·사건 금액(`giftTaxCalculated`·`giftTaxBase`)도 파트 칸과 같은 `ratioed`로 스케일(V-5, `transfer-tax-api-split.ts:266,285`와 한 줄). ④ B·C 호스트에서 `isSeparateAcquisition`은 종전대로 날짜 비교로 파생(C는 false — §2.3).

---

## 2. 자산 단위 이월과세(STEP 0.475)와의 관계

### 2.1 규칙

| 규칙 | 내용 | 강제 지점 |
|---|---|---|
| R-1 | **상호배제**: top-level `carryoverTaxation`이 있으면 파트 서브객체(와이어·엔진)는 올 수 없다. 반대도 같다 | leaf S3 → ⑫ 필드 `carryoverTaxation` · 엔진 throw · ⑧ |
| R-2 | 게이트가 겹치지 않는다: 0.475는 `acquisitionCause==="carryover_gift" ∧ carryoverTaxation`(`precalc.ts:158`), 0.476은 `landCarryoverTaxation ∨ buildingCarryoverTaxation`. R-1 덕에 한 입력이 둘을 동시에 타지 않는다 | — |
| R-3 | 자산 단위 이월과세 + split 입력(`landAcquisitionDate`)은 **⑫ 400**으로 닫는다. 종전에는 재귀 시나리오 A의 `acquisitionCause:"gift"`가 Y8(`transfer-split-part-cause.ts:283-290`, `LAND_CAUSE_ABSENT`)에 걸려 **엔진 throw(필드오류 없음)** 로만 막혔다(anchor SPCO-0i·0j) | leaf S3 |
| R-4 | 0.476의 재귀 입력은 서브객체 3키를 비운다 → 재진입 없음. 0.475 재귀(`buildInputB`/`inputABase`)는 서브객체가 없으니 0.476을 타지 않는다 | 해결자 |

### 2.2 C 시나리오 입력 (같은 날 증여, 수증자 쪽 두 취득일이 같다)

호스트 `acquisitionCause: carryover_gift` · `landAcquisitionCause: carryover_gift`. 두 날짜가 `giftRegistryDate`로 같으므로 ④는 `isSeparateAcquisition:false`를 파생한다. 해결자는 **시나리오 입력마다 `isSeparateAcquisition`을 날짜 비교로 재파생**한다(`dayKey(land) !== dayKey(building)`) — 엔진은 별개취득을 재판정하지 않으므로(`transfer-tax-split-gain.ts:131` 주석) 안 하면 A(증여자 날짜가 다름)가 비-별개 경로로 흘러 §166⑥ 기준시가 안분을 탄다.

### 2.3 시나리오별 split 경로 (실측: SPCO 대리 계산)

| 시나리오 | 토지일 / 건물일 | `isSeparateAcquisition` | 취득가액 | 양도가액 |
|---|---|---|---|---|
| A (둘 다 적용) | 증여자 1995-03-01 / 2015-06-01 | true | 파트 `donorAcquisitionPrice`(+증여세 상당액을 파트 필요경비로) | 파트 양도가액 입력(`resolveTransferPriceSplit`, 안분 근거 불변) |
| B (둘 다 미적용) | 증여일 / 증여일 | **false** | 파트 평가액 `landAcquisitionPrice`·`buildingAcquisitionPrice` (**명시값 사용** — 비-별개라도 파트 값이 있으면 그대로) | 같음 |
| 혼합(토지만 A 등) | 1995 / 증여일 | true | 위 두 줄의 파트별 합 | 같음 |

양도가액 안분(§166⑥·§100③)은 취득 쪽 시나리오와 **독립**이다 — 양도가·양도시 기준시가·구분 기재만 읽고(`transfer-tax-split-sale-price.ts`), 어느 시나리오든 같은 값이다. B 시나리오 실측: 토지 2.4억·건물 6.6억 동일일 split = 93,110,000 = 같은 증여를 단일 자산 취득가액 9억으로 계산한 값(C-00 대조 일치; 건물 파트 gain −1.6억이 토지 +4.6억과 자산 내에서 상쇄 — 기존 split 동작).

---

## 3. 해결자 `calcSplitCarryoverScenarios`

### 3.1 위치·시그니처

`lib/tax-engine/transfer-tax-split-carryover.ts` (신규, ≈250줄). Layer 2 순수 — DB 호출 없음, 세율은 인자.

```ts
export function calcSplitCarryoverScenarios(
  rawInput: TransferTaxInput,
  rates: TaxRatesMap,
  calculate: (i: TransferTaxInput, r: TaxRatesMap) => { determinedTax: number },   // 주입
): { adoptedInput: TransferTaxInput; detail: SplitCarryoverDetail } | null          // null = 파트 서브객체 없음(skip)
```
`TransferTaxAcquisitionOptions.carryoverScenarioOverride`는 받지 않는다 — 다건이 막혀 있어 소비자가 없다(§4.5).

호출: `precalc.ts` 0.475 블록 뒤. 반환 `carryoverDetail`(자산 단위)과 **별개 필드** `splitCarryover`를 `pre`에 싣는다. `workingInput = adoptedInput`. `input`(원본)은 그대로 둔다 — 감면 5년 요건·§99의4 취득순서가 수증자 본인 날짜를 읽는 규약(`precalc.ts:221-231` 선례).

### 3.2 절차

1. **leaf 진입 검사**: §6 facts로 `collectSplitPartCauseIssues` → 첫 항목을 `TaxCalculationError(INVALID_INPUT)`로 던진다(직접 호출 엔진도 ⑫와 같은 거부).
2. 파트별 **적격 판정** ①·③: `judgeCarryoverEligibility(ct, transferDate)`(`carryover-eligibility.ts:65`). 사건 수준 사실이 두 파트에 같아 결과는 같다. 부적격이면 두 파트 전부 B 고정, `exclusionReason`을 echo(②3호 비교 없음).
3. 증여자 자본적지출: 양도일 < 2024-01-01이면 0(`DONOR_CAPEX_EFFECTIVE_DATE`, `transfer-tax-carryover.ts:55` — export로 승격해 공유).
4. **증여세 한도**(파트별): 그 파트만 A로 치환한 입력(증여세 산입 **전**, 증여자 자본적지출 반영)에 `calcSplitGain`을 돌려 `part.gain`을 얻고 `cap = max(0, gain)`, `added = min(ct.giftTaxAmount, cap)`, `limitApplied = ct.giftTaxAmount > cap`. 파트 gain은 상대 파트의 배정과 무관하다(양도가액·취득가액이 파트별).
5. `buildScenarioInput(raw, assignment)`(§3.3)로 입력을 만들고 `resolveFilingUnitCarryoverScope(적격 파트 index, ov => calculate(build(ov), rates).determinedTax)`(§4).
6. 최종 assignment의 입력 = `adoptedInput`. echo는 §7.

### 3.3 입력 치환 (A는 증여자 값, B는 수증자 값)

| 필드 | 파트 A(적용) | 파트 B(미적용·배제) |
|---|---|---|
| 토지 `landAcquisitionDate` / 건물 `acquisitionDate` | `ct.donorAcquisitionDate` | 증여 등기접수일(원 입력 그대로) |
| `landAcquisitionPrice` / `buildingAcquisitionPrice` | `ct.donorAcquisitionPrice` | `ct.giftDateValuation`(= 원 입력) |
| `landDirectExpenses` / `buildingDirectExpenses` | 원값(없으면 0) + 증여자 자본적지출 + `added` | 원값 |
| 공통 | 아래 | |

공통(어느 assignment든): `acquisitionCause` = 건물 파트가 이월과세 대상이었으면 `"purchase"`(`buildInputB`와 같은 이유 — `"carryover_gift"`로 두면 배제 자산에 통산이 들어가는 과소과세, `transfer-tax-carryover.ts:598` 주석), 아니면 원값; `landAcquisitionCause`·`landDecedentAcquisitionDate`·`landDonorAcquisitionDate` 비움; `isSeparateAcquisition` 재파생(§2.2); 서브객체 3키 비움(R-4); `houseCountExclusionAcquisitionDate = raw.houseCountExclusionAcquisitionDate ?? raw.acquisitionDate`(건물 A 치환이 §99의4 취득순서를 앞당기지 않도록 — 자산 단위 `resolveHouseCountExclusionAcqDate` 선례); `giftHouseholdBasis`는 건드리지 않는다(V-6).

⚠️ `expenses`(deprecated 총액)가 >0이면 `splitPair`(`transfer-tax-split-acq-price.ts:145-153`)가 한쪽만 입력된 파트의 반대편을 `총액 − 입력값`으로 도출해 증여세 가산이 반대 파트 경비를 밀어낸다 → leaf S8로 **막는다**(신규 입력 경로는 항상 0).

### 3.4 장특·세율 기산 일관성

치환 입력이 곧 일반 split이므로 `holdingYears`(장특)·`resolveLandRateBasis`(세율)·주택 `max(토지, 건물 취득일)`(`appurtenant-land.ts:47-55`)가 **같은 치환 날짜**를 읽는다. 실측 대조: A 채택 토지 `hy=25 lt=0.3 rule=own rb=2000-01-01` (= 대리 `토지 purchase 2000-01-01`과 세액 172,260,000 동일). 표시(`rateBasisRule:"donor"`)는 echo가 덮어쓴다(§7).

### 3.5 후속 영향 (확인한 것만)

- 중과·비사업용 판정은 `workingInput`을 읽으므로 치환 날짜를 본다. 건물 A에서 `acquisitionDate`가 증여자 날짜가 되어도 §99의4·§98의9 취득순서는 위 `houseCountExclusionAcquisitionDate`로 보호된다. 조정대상지역 「취득 당시」(`giftHouseholdBasis`)는 V-6.
- 1세대1주택 표2·부수토지 장특 통칙(`transfer-tax-lthd.ts:422-436`)은 §6 게이트가 입구에서 막아 P1에서 닿지 않는다.

---

## 4. ②3호 — 파트별 결정 규칙

### 4.1 규칙

기존 드라이버를 그대로 쓴다: 이월과세 적격 파트 index(`토지=0, 건물=1`)를 모두 **A**로 두고, 파트 i에 대해 「i만 A / i만 B(나머지는 현재 확정값)」의 결정세액을 비교해 `with < without`이면 B(②3호 배제), 아니면 A(**동률 A** — 「적은 경우」만 배제). 한 pass에서 바뀐 게 없으면 종료, 최대 2 pass. 호출은 assignment 키로 메모이즈(`JSON.stringify(ov)`).

- **전수 탐색을 쓰지 않는다**: 조문은 「그 자산에 ①을 적용/미적용」의 2항 비교이고, N-1에서 같은 이유로 기각됐다(`aggregate-carryover-scope.ts:23`).
- **`refCalculatedTax` 역안분 금지**(F03·§104⑤): 파트 세액을 쪼개지 않고 **자산 전체 결정세액**(`determinedTax`, §92③2호)을 두 번 돌려 비교한다.
- 비교 비용: 2파트 4조합 상한이나 메모로 실호출은 최대 4회 + 최종 본 계산 1회.

### 4.2 왜 독립 판정이 아닌가 — 1,050 격자 실측

격자: 양도일 3종(2025-06-30·2024-06-30·2023-09-30) × 증여자 날짜쌍 5 × 토지 증여자가 5 × 건물 증여자가 5 × 증여세 3 (유효 1,050건, 날짜 역전 75건 제외). 파트 4조합의 결정세액 T(00·01·10·11)을 route로 실측(mock 세율).

| 집계 | 값 |
|---|---|
| 안정 구성(적용 파트는 `T(X)≥T(X∖p)`, 배제 파트는 `T(X∪p)<T(X)`) **유일** | 950 |
| 안정 구성 **둘** | 100 (전부 양도일 2023-09-30·2024-06-30, 즉 **증여 후 2년 미만** — 단기세율이 파트를 서로 가린다) |
| 안정 구성 없음 | 0 |
| 순차 고정점 결과가 안정 구성이 아닌 경우 | 0 |
| 순차 고정점 ≠ 세액 최대 구성 | 18 (전부 `01` vs `10` 둘 다 안정인 구간) |
| 「각 파트를 둘 다 미적용 기준선과 따로 비교」 ≠ 순차 | 190 |

⇒ **독립 판정은 틀린다**(190건). 순차 고정점은 **항상 안정 구성**을 낸다. 안정 구성이 둘인 100건에서만 순서가 결과를 가르며(18건에서 최대 49,000,000원 차이), 이는 N-1이 이미 받아들인 순서 의존이다(`MAX_PASSES` 주석 `:46-53`). 순서는 **토지 → 건물**(§94①1호 열거 순서). 이 구간의 대표 입력을 anchor SPCO-T9에 고정했다(T01 320,250,000 ↔ T10 341,250,000).

### 4.3 tie

동률(`with === without`)은 A. 실측 격자 중 한 파트라도 동률인 경우 89건. 한도 anchor SPCO-T4가 동률(15,884,999)에서 A가 채택되는 구조 — 한도를 자산 gain으로 잘못 잡으면 `with < without`이 되어 B로 뒤집힌다(echo가 갈린다).

### 4.4 ⚠️ 계획서 C 기대값 정정 (Q-3 vs 일체 비교)

계획서 §4 C 입력(토지 증여자 1995-03-01 5천만, 건물 2015-06-01 5천만, 증여세 3천만, 평가 토지 2.4억·건물 6.6억)의 4조합 실측:

| 구성 | T |
|---|---|
| 00 (둘 다 미적용) | 93,110,000 |
| 10 (토지만 A) | 89,082,000 |
| 01 (건물만 A) | **300,018,000** |
| 11 (둘 다 A) | 295,566,000 |

파트별 판정: 토지는 `T(11)=295,566,000 < T(01)=300,018,000` → ②3호 배제, 건물은 `T(01) ≥ T(00)` → 유지 ⇒ **300,018,000**(anchor SPCO-T6). 주택을 한 자산으로 비교하면 `T(11) ≥ T(00)`이라 295,566,000이다. 두 독법은 V-1(정면 해석례 미확보)에 걸려 있고 Q-3은 파트별로 확정됐으므로 **본 설계는 300,018,000**을 따른다. 둘 다 A로 가는 입력(평가 토지 4억·건물 5억)은 295,790,000(SPCO-T7).

### 4.5 신고단위(컴패니언) — 주 자산 + 컴패니언 병용을 닫는 이유

단건 엔진의 비교는 **자기 자산만** 본다. N-1이 보인 것처럼 다른 자산이 있으면 세율군 전환이 §104⑤ 누진 합산·§102② 통산·기본공제를 함께 움직여 단건 비교가 틀린다(300 격자 중 7건 전부 과소). 파트 이월과세는 이 위험이 두 배(파트 2개)다. P1은 `companionAssets.length>0 ∧ 파트 서브객체`를 ⑫에서 400(S2′)으로 닫는다. 열려면 `CarryoverScenarioOverrides`를 `{land,building}`으로 넓히는 별도 작업(Q-7과 같은 후속).

---

## 5. 증여세 상당액 (영 §163의2②)

- **안분**: `apportionGiftTax`(floor, `min(raw, calc)`)를 ⑭ 합성기에서 파트 평가액으로 호출. 파트별 floor이므로 합이 산출세액보다 1~2원 작을 수 있다(잔액 흡수 안 함 — anchor SPCO-T7: 13,333,333 + 16,666,666 = 29,999,999). 자동 안분 fallback 금지 정책과 무관하다 — 조문이 명문으로 안분을 정한다(일반건물 기확정).
- **한도**: 「양도가액에서 §97①·②의 금액을 공제한 잔액」 = 그 파트의 gain(사전-2025-법규재산-0366 「해당 자산」, `carryover-land-split.ts` 주석). 자산 단위(`transfer-tax-carryover.ts:299-304` `gainBeforeGiftTax = result.transferGain`)와 다르다. 실측(SPCO-T4): 건물 gain 1억이 있는 자산에서 자산 한도(1.1억)로 잡으면 안분 1억이 전액 산입되어 토지 gain −9천만·T(A)=0 < T(B)로 A가 배제된다; 파트 한도(1천만)는 토지 gain 0 동률로 A 유지 — 세액(15,884,999)은 같고 **echo의 채택 여부가 갈린다**.
- **반영 위치**: 해당 파트 `*DirectExpenses`에 합산(실가 모드 파트는 swap이 없고 전액 차감 — `applyAssetSwap` 실가 분기). echo `directExpenses`에 증여세가 섞이므로 분해는 `carryover.giftTaxAddedToExpense`로 한다.
- **지분(V-5) 판단**: GB의 2026-08-23 반전(스케일, `transfer-tax-api-gb-carryover.ts:255-275`)과 split `ratioed`(`transfer-tax-api-split.ts:266,285`)가 같은 규약이라 **스케일한다**. 증여세 산식은 산출세액·평가액·과세가액을 모두 같은 비율로 줄이면 결과도 그 비율이다. 단 3개 floor가 1~2원 어긋날 수 있다 → P1 anchor로 `ownershipRatio` 0.5·0.6의 100% 환산 대비 허용치를 **실측으로 정한다**(허용 불가면 `ownershipRatio<1`을 S9로 막는다).

---

## 6. 차단 게이트와 leaf 변경 (`transfer-split-part-cause.ts`)

### 6.1 facts 추가 (전부 선택 — 생략 = 그 결합이 아니다)

```ts
hasLandCarryover?: boolean; hasBuildingCarryover?: boolean;  // 파트 서브객체 존재(와이어 *CarryoverPart ⇔ 엔진 *CarryoverTaxation)
hasTopLevelCarryover?: boolean;       // 자산 단위 carryoverTaxation
partCarryoverSupported?: boolean;     // 단건 주 자산만 true. 다건·컴패니언은 생략
hasCompanions?: boolean;              // ⑫ 전용(엔진 생략)
carryoverGiftDate?: string;           // 사건 giftRegistryDate YYYY-MM-DD
isOneHousehold?: boolean; isUnregistered?: boolean;
hasLegacyExpenses?: boolean;          // input.expenses > 0
```
`SplitPartCauseField`에 `landCarryoverPart`·`buildingCarryoverPart`·`carryoverTaxation`·`carryoverGiftEvent`·`isOneHousehold`·`expenses` 추가(⑫는 같은 이름 경로, ⑧은 폼 칸 매핑).

### 6.2 규칙 (순서 = throw·⑧ 표시 순서. 앞이 레버가 다른 항목을 가리지 않게)

| ID | 조건 | 메시지 상수(신규) | field |
|---|---|---|---|
| S0 | 파트 이월과세 입력이 있는데 `!partCarryoverSupported` (다건·컴패니언) | `PART_CARRYOVER_HOST_UNSUPPORTED_MESSAGE` — 「다건 합산·함께 양도 2번째 이후 자산에서는 토지·건물 파트 이월과세를 지원하지 않습니다」 | `landAcquisitionCause` |
| S2′ | `hasCompanions ∧ (hasLandCarryover ∨ hasBuildingCarryover)` | `PART_CARRYOVER_COMPANION_MESSAGE` — §4.5 사유 (소득세법 §92③2호) | `landCarryoverPart` |
| S3 | `hasTopLevelCarryover ∧ (파트 서브객체 ∨ landAcquisitionDate 존재)` | `PART_CARRYOVER_TOP_LEVEL_CONFLICT_MESSAGE` | `carryoverTaxation` |
| S1 | 원인 ⇔ 서브객체 불일치: 토지 `carryover_gift ∧ !hasLandCarryover`(**필수 누락 — G-1 대체**) · `hasLandCarryover ∧ 원인≠carryover_gift`(stray) · 건물도 같음(`acquisitionCause`) | `PART_CARRYOVER_INPUT_REQUIRED_MESSAGE` / `…_STRAY_MESSAGE` | `landCarryoverPart` 등 |
| S4 | 구조: 부담부증여·PHD·가업상속·소유자 분리·건물 원인이 상속/증여/부담부(C 제외) | **기존 D1/D2 구조 목록 재사용**(`LAND_CAUSE_BURDENED_GIFT_MESSAGE` 등) — 이월과세 파트를 「mixed/buildingInherited」로 간주해 같은 배열을 탄다 | 기존 |
| S5 | `carryoverGiftDate`와 파트 취득일(토지 `landAcquisitionDate`, 건물 `acquisitionDate`) 불일치 | `PART_CARRYOVER_DATE_MISMATCH_MESSAGE` — 「이월과세 파트의 취득일은 증여 등기접수일과 같아야 합니다」 | `landAcquisitionDate`/`acquisitionDate` |
| S6 | 파트 모드 ≠ actual (G-2 확장) | 기존 `LAND_INHERITED_ESTIMATION_MESSAGE`·`BUILDING_CAUSE_ESTIMATION_MESSAGE` | `landAcqMode`/`buildingAcqMode` |
| S7 | 파트 평가액 ≤ 0 (D2 Y9 확장 — 같은 날은 파트 완결 규칙이 꺼져 있어 0으로 계산됨) | 기존 `BUILDING_CAUSE_*_PRICE_REQUIRED_MESSAGE` 일반화 | `landAcquisitionPrice`/`buildingAcquisitionPrice` |
| S8 | `hasLegacyExpenses ∧ 파트 이월과세` | `PART_CARRYOVER_LEGACY_EXPENSES_MESSAGE` — 파트 칸으로 입력 | `expenses` |
| S9 | **1세대1주택 게이트** `isHousing ∧ isOneHousehold===true ∧ ¬isUnregistered ∧ (hasLand ∨ hasBuilding)` | `PART_CARRYOVER_ONE_HOUSE_MESSAGE` — 「1세대1주택 비과세(소득세법 §89①3호)와 겹치는 토지·건물 파트 이월과세는 아직 지원하지 않습니다 — §97의2②2호 판정이 필요합니다」 | `isOneHousehold` |

- **게이트 식별 입력**: 판정 엔진 `checkExemptionCore`가 비과세 평가를 시작하는 조건과 같다 — `propertyType==="housing" ∧ isOneHousehold ∧ ¬isUnregistered`(`one-house/pending.ts:168`, `transfer-tax-exemption.ts:244,339`). 비주택(`building`)은 비과세 평가가 없어 닫지 않는다. 모름(`isOneHousehold` 생략) = 불성립이라 닫지 않는다. ⑧은 ④가 `isOneHousehold`에 실제로 싣는 값을 넣어야 한다(3중 패턴).
- **엔진 안전망**: S9가 입력 술어라서, 해결자는 어느 시나리오 결과든 `isExempt ∨ isPartialExempt`이면 같은 메시지로 던진다(술어와 판정 엔진이 갈릴 때의 침묵 방지).
- 이월과세 단서 연동: 영 §163⑨ 단서 1호(1990.8.30.)·2호(2005.4.30.) 술어(`isSec163_9LandProviso`·`isSec163_9BuildingProviso`)는 `carryover_gift`도 `gift`로 보고 기존 Y4/D1-4 차단을 유지한다(증여일 5·10년 창으로는 사실상 도달하지 않으나 비용이 한 줄이다).

### 6.3 G-1(`:296`)·`:249` 처리

| 위치 | 종전 | P1 |
|---|---|---|
| `:296` G-1 (`cause==="carryover_gift"` 무조건) | 전면 차단 | S1 「서브객체 필수」로 교체. 서브객체가 있으면 통과 |
| `:248-249` (건물 `carryover_gift ∨ burdened_gift` + 토지 `purchase`) | 한 문구로 차단 | **`burdened_gift`만 차단 유지**(`BUILDING_CAUSE_BURDENED_OVERLAY_MESSAGE` — 이월과세 어휘 제거). `carryover_gift`는 S1이 대신하고, B는 통과 |
| `BUILDING_CAUSE_UNSUPPORTED`(`:220`) | 토지 상속·증여 혼합 차단 | 그대로. 단 `hasLandCarryover ∧ 건물 원인 ∈ {inheritance, gift, burdened_gift}`도 같은 문구로 차단(C 제외: 건물 `carryover_gift`는 허용) |
| Y8(`:283-290`) | 건물 `inheritance/gift` + 토지 원인 없음 + 날짜 다름 | 건물 `carryover_gift`도 포함(호스트가 split을 켜면 토지 원인 필수) |

`LAND_CARRYOVER_UNSUPPORTED_MESSAGE`·`BUILDING_CAUSE_CARRYOVER_BURDENED_MESSAGE` 상수는 의미가 바뀌므로 삭제하고 위 신규 상수로 대체한다(참조 테스트는 §8).

---

## 7. echo (`types/transfer-split-gain.types.ts`)

```ts
interface SplitPartCarryoverEcho {                       // SplitPartResult.carryover? — 이월과세 입력이 있던 파트만
  judgment: "applied" | "excluded";
  exclusionReason?: CarryoverExclusionReason | "tax_comparison";   // 적격 판정 사유 or ②3호
  donorAcquisitionDate: string; donorAcquisitionPrice: number;
  donorCapexAdded: number; donorCapexGuardApplied: boolean;
  giftDateValuation: number;                              // B 취득가액 = 안분 분자
  giftTaxApportioned: number;                             // 한도 前
  giftTaxLimitCap: number; giftTaxAddedToExpense: number; giftTaxLimitApplied: boolean;
  comparison?: FilingUnitCarryoverComparison;             // {determinedTaxWithCarryover, determinedTaxWithout} 재사용
}
// splitDetail.carryoverEvent?: { giftRegistryDate; giftTaxCalculated; giftTaxBase; applicablePeriodYears: 5|10 }
```
- **부착 지점**: `transfer-tax.ts:382`에서 `calcTransferGain(effectiveInput)`가 돌려준 `splitDetail`에 `attachSplitCarryoverEcho(splitDetail, pre.splitCarryover)`를 바로 적용한다(결과 조립 경로 전부가 같은 변수를 쓴다). 입력에 숨은 필드를 싣지 않는다.
- **A 파트 echo 덮어쓰기**: `acquisitionCause:"carryover_gift"`, `rateBasisRule:"donor"`, `rateBasisAcquisitionDate`·`appliedRateBasisDate` = 증여자 날짜(치환 입력이 만든 값은 `purchase/own`이므로 `buildSplitPartCauseEcho`(`transfer-split-part-echo.ts:48-83`) 결과를 이 지점에서 교정). B(배제) 파트는 치환 값 그대로(`gift` 계열 없음 — `buildInputB` 규약).
- **JSDoc 정정**: `SplitPartResult.acquisitionDate`의 「장특 기산일을 따로 두지 않는다: 둘이 갈리는 것은 §95④ 단서 … 그 파트는 D1 범위 밖」(`types/transfer-split-gain.types.ts:164-169`)을 「해당 시나리오가 실제로 쓴 취득일 = 장특 기산일. 이월과세 A 파트는 증여자 취득일, 배제(B) 파트는 증여 등기접수일」로 바꾼다.
- 자산 단위 `carryoverTaxationDetail`은 **채우지 않는다**(자산 이월과세 전용, 의미 오염 방지 — anchor SPCO-T1이 `undefined` 고정).

---

## 8. 영향 경로와 전환

### 8.1 활성 anchor의 전환 (이름에 `[전환 …]` 표시한 줄 = 이 표와 1:1)

| anchor | 현행 | P1 이후 |
|---|---|---|
| SPCO-0a/0d | 400 G-1 | 200 (SPCO-T1/T2) |
| SPCO-0b | 400 G-1(`landCarryoverTaxation` 동봉) | 400 S1 필수 누락(키는 와이어에 없어 strip) |
| SPCO-0c | 새 키 strip → 200 169,860,000 | 400 S1 stray |
| SPCO-0e | 400 G-1 | 400 S9 (T10) |
| SPCO-0f | 400 `:249` | 200 (T5) |
| SPCO-0i/0j | 엔진 throw, 필드오류 없음 | ⑫ 필드오류 `carryoverTaxation` (S3) |
| SPCO-0k | 400 G-1 | 400 S3 |
| SPCO-0l/0n | 400 G-1(다건·컴패니언) | 400 S0 / MULTI 규칙 문구 |
| SPCO-0m/0o | 새 키 strip → 200 | 400 (T11/T12) |
| SPCO-0g/0h | 자산 단위 277,590,000 / 322,530,000 | **불변**(자산 단위 경로 — 회귀 방어) |

### 8.2 기존 테스트 기대값 변경 (실측 grep)

| 파일 | 줄 | 변경 |
|---|---|---|
| `__tests__/api/transfer.route.split-land-part-cause.d0.anchor.test.ts` | `:105` D0-1 | 메시지 부분문자열 「이월과세로 계산하는 기능은 지원하지 않습니다」 → S1 필수 누락 문구 (400 유지) |
| 같은 파일 | `:190`, `:244` | 경로(`landAcquisitionCause`)만 단언 — **불변**(S0/S1 모두 같은 field) |
| `__tests__/tax-engine/transfer/split-part-rate.anchor.test.ts` | `:431-440` A-14c | 엔진 throw 부분문자열 교체 |
| `__tests__/tax-engine/transfer/split-part-cause.d2.test.ts` | `:121` | `buildingAcquisitionCause` 두 값 루프 → `burdened_gift`는 신규 overlay 문구, `carryover_gift`는 S1로 분리 |
| `__tests__/api/transfer.route.multi-key-coverage-f12.test.ts` | `:70` | `scalar` 집합에 `landAcquisitionCause` |
| `e2e/transfer-acq-cause-mixed-d0.spec.ts:36-41`, `d1-2.spec.ts:47`, `d2-2.spec.ts:143`, `__tests__/calc/transfer-land-part-cause.d2.predo.render.test.tsx:190` | 「지원하지 않는다」 고지 testid | **UI 단계(P2~P4)** — P1에서는 불변(고지 컴포넌트는 안 건드림) |

그 밖은 없다: `grep`한 `LAND_CARRYOVER_UNSUPPORTED_MESSAGE`·`BUILDING_CAUSE_CARRYOVER_BURDENED_MESSAGE` 참조 테스트가 위 4개 파일이 전부다(`d1.predo.anchor`·`d1.predo.test`·`d2.predo.anchor`는 다른 상수 문구 — 불변 확인 필요 시 P1 첫 실행에서 red로 드러난다).

### 8.3 소비처

- 다건: ⑧ `multi-transfer-tax-validate.ts:145`에 `landAcquisitionCause==="carryover_gift"`·파트 서브폼 거부 추가, ⑫ 위 §1.3.
- 컴패니언: ⑫ S0, ④ `companion-payload.ts`가 새 키를 내지 않음(UI), ⑤ 숨김.
- 결과 4뷰·PDF: `splitDetail.*.carryover`·`carryoverEvent`를 읽는 신규 표시는 P2~P4. P1에서 기존 소비처가 **새로 만나는 값**은 `acquisitionDate`(증여자 날짜)·`rateBasisRule:"donor"`·`acquisitionCause:"carryover_gift"`뿐 — `splitCauseLabel`(`transfer-tax-split-display.ts:56`)은 이미 `carryover_gift`를 안다. 표시 소비처 목록: `components/calc/results/transfer/split-acq-text.ts`·`SplitGainDetailSection.tsx`·`FilingFormTableHelpers.ts`·`lib/pdf/ResultPdfTransferSections.tsx`.

---

## 9. 실측 근거 (route 직접 호출, mock 세율, 양도 12억=토지 7억+건물 5억, 양도일 2025-06-30)

| 라벨 | 입력 요지 | 결정세액 |
|---|---|---|
| A-A | 토지 2000-01-01 1.2억(1억+증여세 2천만) + 건물 2021 4억 | 172,260,000 (토지 hy25·30%) |
| A-B | 토지 증여일 3억 + 건물 2021 4억 | 169,860,000 (토지 hy2·0) |
| A 배제 | 증여자 4억 → A 취득 4.2억 | A 88,550,000 < B 169,860,000 |
| A 한도 | 평가 7억·증여자 6.9억·증여세 1억 → 산입 1천만 | 15,884,999 (A=B 동률) · 자산한도 가정 시 A 0 |
| B-A | 건물 2015-06-01 1.2억 + 토지 2008 1.2억 | 261,210,000 |
| B-B | 건물 증여일 4억 + 토지 2008 1.2억 | 175,530,000 |
| C 00/10/01/11 | §4.4 | 93,110,000 / 89,082,000 / 300,018,000 / 295,566,000 |
| C′ 00/10/01/11 | 평가 토지 4억·건물 5억 | 93,110,000 / 151,326,666 / 234,610,000 / 295,790,000 |
| C 자산 단위 | 증여자 날짜 칸 1995 / 2015 | 277,590,000 / 322,530,000 (현행 그대로) |
| 새 키 strip | 원인 gift + 새 키 | 169,860,000 = 키 없는 값 |

---

## 10. 확인 필요 (P1에서의 처리)

| # | 내용 | P1 처리 |
|---|---|---|
| V-1 | ②3호 비교 단위 파트별 vs 주택 일체 — 정면 해석례 미확보. 같은 입력이 300,018,000 ↔ 295,566,000 | Q-3대로 파트별. §4.4 anchor가 두 값을 모두 고정. 사용자 재확인 권장 |
| V-4 | 증여자가 토지·건물을 **총액으로만** 취득 | 와이어가 파트별 `donorAcquisitionPrice>0`을 요구 → 총액만 있으면 입력 불가(⑧ 안내). 자동 안분 금지 |
| V-5 | 지분 모드 스케일 | 스케일(§5). 3개 floor 어긋남은 P1 anchor로 허용치 실측, 불가 시 S9로 `ownershipRatio<1` 차단 |
| V-6 | 이월과세 파트의 다주택·조정대상지역 「취득 당시」(`giftHouseholdBasis`) | 설정하지 않음(수증자 본인 기준). 영향이 있는 중과 구간의 anchor를 P1에서 한 건 측정해 변화가 없으면 종결, 있으면 S로 차단 |
| V-7 | H-4(`effectiveLandAcquisitionCause` 캐스트 크래시)·H-5(⑧ 조기 return) | **P0 실측 대상**(본 작업에서 측정하지 않음) |
| V-8 | 안정 구성이 둘일 때 순서 | 토지→건물(N-1 선례). 단기 구간 100/1,050, 18건에서 최대 49,000,000원. 다른 규칙(최대세액 등)은 조문에 없음 — 사용자 판단 요청 |
| V-9 | **주 자산 + 컴패니언 병용** | P1에서 닫음(S2′). Q-6 확정문은 「컴패니언 차단」이라 병용은 신규 결정 |
| V-10 | 증여 등기접수일 전 소유권 이전이 있었던 경우 등 §97의2③ 「등기부상 소유기간」 | 엔진은 `giftRegistryDate`를 신뢰(자산 단위와 동일) |
| V-11 | ⑬ `callTransferTaxAPI` body spread가 새 키를 통과시키는지 | **확인 필요(미측정)** — P1에서 ④ 출력 → 네트워크 body 대조 anchor |

---

## 11. P1 작업 목록 (순서 = 의존)

1. **P1-0** 레지스트리: 신규 메시지 상수·`DONOR_CAPEX_EFFECTIVE_DATE` export·`carryoverGiftEventShape` 추출(일반건물 스키마가 이를 import하도록 — 동작 불변).
2. **P1-1** leaf: facts·S0~S9, G-1/`:249`/Y8 교체(§6). 엔진·⑫·⑧이 같은 호출 인자를 쓰도록 `refineSplitPartCause`·`calcSplitGain`·`validateLandPartCause` 호출부 3곳 동기화. 단위 테스트(`split-part-cause.*.test.ts`) 먼저.
3. **P1-2** ⑫: 스키마 파일·base-shape/`splitAcquisitionShape` spread·`required-refines.ts:196` 좁히기·합 검사·MULTI 규칙·커버리지 가드. anchor SPCO-T8·T11~T16 해제.
4. **P1-3** ⑭: `composeSplitCarryover` + `engine-input.ts:363` 한 줄 + 타입(§1.5).
5. **P1-4** 해결자(§3) + `precalc.ts` STEP 0.476 + `pre.splitCarryover` 전달 + echo 부착(§7). anchor SPCO-T1~T7·T9 해제.
6. **P1-5** 회귀: 전 세목 `npm run test:transfer` 후 §8.2 테스트 갱신, 뮤테이션 확인(① `isSeparateAcquisition` 재파생 제거 → T6·T7 red? ② 파트 한도를 자산 gain으로 → T4 red? ③ 순서 뒤집기 → T9 red?) — 확인 필요, 해보고 결과를 기록.
7. **P1-6** 지분 anchor(V-5)·⑬ 대조(V-11).

완료 보고 전 자가 점검: 14지점 중 ①~③·⑤~⑦은 UI 단계(P2~), P1은 ④ 계약(§1.6)·⑧ leaf 공유·⑨⑩⑫⑬⑭·엔진. ⑧ 동기화(8번째)는 §6 leaf 단일 소스로 만족 — UI 호출부가 ④와 같은 값을 넣는지는 P2에서 격자(⑧ 차단 ⇔ ⑫ 차단)로 검증한다.

---

## 12. P1 구현 정정 (2026-10-19, Do 환류)

구현 중 설계서와 달라진 점. 전부 anchor로 고정돼 있다 — 뒤집으면 해당 테스트가 빨개진다.

| # | 설계서 | 구현 | 근거 |
|---|---|---|---|
| F-1 | §3.1 STEP 0.476은 0.475 **바로 뒤** | **0.475 앞** (`transfer-tax-precalc.ts`) | R-1(자산 단위 + 파트 상호배제)을 leaf S3가 보려면 raw `carryoverTaxation`이 보여야 한다. 0.475가 먼저 돌면 재귀 입력이 `carryoverTaxation`을 비운 채 파트 서브객체를 물고 가 충돌이 안 보인다. 위치를 뒤로 옮기는 뮤테이션(M19)이 `split-part-carryover.resolver.test.ts`에서 red |
| F-2 | §6.1 `partCarryoverSupported`: 단건만 true, 다건·컴패니언 **생략** | **컴패니언만 명시 `false`**, 생략·true = 받는다. 다건은 `MULTI_REJECT_RULES`(키 단위)가 막는다 | leaf 테스트·⑧이 facts를 생략해도 S0가 오발동하지 않게. 다건에 S0까지 걸면 같은 키에 거부 문구가 둘 뜬다 |
| F-3 | §6.2 S1 필수 누락 field | `landCarryoverPart`/`buildingCarryoverPart`/`carryoverGiftEvent`(입력 칸) | anchor T15·T16이 이 칸을 단언한다. 종전 `landAcquisitionCause` 칸을 보는 격자 테스트(`d1.predo.anchor` Z1·Z3, `d0.anchor` D0-Z)는 KEYS/기대 칸에 `landCarryoverPart`를 추가했다 |
| F-4 | §7 A 파트 echo `rateBasisAcquisitionDate`·`appliedRateBasisDate` = 증여자 날짜 | `acquisitionCause`·`rateBasisRule`만 교정. 날짜는 **세율 판정이 쓴 값**을 그대로 둔다 | 주택 토지 파트의 `appliedRateBasisDate`는 `max(토지, 건물 취득일)`(주택 부수토지 보유기간)이라 증여자 날짜와 다를 수 있다(T1: 2021-03-01). 교정하면 echo가 판정과 어긋난다(`feedback_engine_result_display_drift`) |
| F-5 | §8.1 SPCO-0f → 200 (T5) | 400 (S3, field `carryoverTaxation`) | 0f 입력은 **자산 단위** `carryoverTaxation` + 토지 overlay라 상호배제 대상이다. B의 200은 파트 서브객체 입력(T5) |
| F-6 | §1.3 refine | `donorAcquisitionDate ≤ giftRegistryDate` 검사 **추가** (field `…Part.donorAcquisitionDate`) | 증여자 취득일이 증여일보다 늦으면 장특 기산이 뒤집힌다. ⑧(P2)도 같은 조건을 거울로 가져야 한다 |
| F-7 | §6.2 | `isSplitable=false`(토지·건물이 아닌 자산)에 실린 파트 서브객체·사건은 stray 400 | 조용히 버려지는 입력 금지 |
| F-8 | §6.2 S1 | 사건 ⇔ 파트 짝 검사 추가: 파트가 있는데 사건이 없으면 필수 누락, 사건만 있으면 stray (field `carryoverGiftEvent`) | 사건 없는 파트는 ⑭ 합성기가 키를 내지 않아 «일반 증여로 조용히 계산»된다 |
| F-9 | §3.3 공통: 건물 이월과세 대상이었으면 `acquisitionCause`=`purchase`, `landAcquisitionCause` 비움 · §6.3 :260 「영 §163⑨ 단서 … 증여일 5·10년 창으로는 사실상 도달하지 않는다」 | **B 확정 파트는 `gift`**(토지 B → `landAcquisitionCause: gift`, 건물 B → `acquisitionCause: gift`), A 파트는 `purchase`. 둘 다 B면 토지 원인 없음(D3: 토지 gift + 건물 gift 금지), 건물 B + 토지 A면 토지 overlay `purchase`(D2) | 취득가액 리뷰 게이트 C-2. `purchase`로 두면 단서 술어(`resolveLandPartAcquisition` 토지 gift 필수 · `resolveBuildingPartAcquisition` 토지 overlay purchase + 건물 gift)가 꺼져 기간 초과·관계 부적격·②3호 배제 B가 일반 증여보다 취득가액이 작았다(토지 증여 1989-05-01 · 평가액 3억 · `landSec164Value` 5억 → 121,860,000 ↔ 일반 증여 67,270,000). :260은 틀렸다 — 기간 초과·관계 부적격 B는 증여일이 임의로 옛날일 수 있다. §104②2호 통산은 `carryover_gift` 전용이고 증여자 취득일 입력이 없는 `gift`는 증여일 기산이라(`rateBasisRule: own`, anchor `p1.test.ts` P1-9) 통산 방지 목적은 그대로 달성된다. echo의 B 파트 `acquisitionCause`는 `gift` |
| F-10 | §2.1 R-3 / §6.2 S3: 자산 단위 이월과세 + **토지 취득일 분리 입력(`landAcquisitionDate`)** 도 ⑫에서 400 | **닫지 않는다.** S3는 ① 파트 서브객체가 있을 때, ② 서브객체 없이도 종전에 막히던 결합(건물 이월과세 호스트 + 토지 overlay `purchase` = 종전 `:249` / overlay 이월과세 = 종전 G-1)만 닫는다. 토지 원인이 없는 «자산 단위 + 토지 취득일»(소유자 분리·PHD 후퇴 송신 포함)은 종전 경로 그대로(엔진 재귀 Y8 또는 200). leaf의 «토지 이월과세 원인»은 토지 취득일·서브객체·사건 중 하나가 있을 때만 읽는다(종전 G-1과 같은 게이트). 다건의 `landAcquisitionCause: carryover_gift` 단독 거부 규칙은 제거(공용 leaf S1이 종전 G-1처럼 막는다) | 기존 기능 회귀 — 소유자 분리 × 자산 단위 이월과세(H-5 정상 경로, 종전 200)를 400으로 막았다. 설계서 «R-3: 엔진 throw로만 막혀 있었다 → ⑫ 400으로 닫는다»는 **종전 200 입력까지 닫는 과잉**이었다. 계약: «파트 서브객체 없는 입력은 P1 전과 상태·세액이 같다» — 회귀 격자 `transfer.route.split-part-carryover.regression-grid.test.ts`(1176셀, 기준값 = P1 전 master f499f987e 실측: 200 288 · 400 888)가 고정한다. SPCO-0i/0j는 종전 엔진 throw 기대로 되돌렸다 |

**V-5 확정**: 지분 스케일 유지(사건 미스케일 + 파트 스케일). 240셀 격자 실측 최대 어긋남 0.99원(`split-part-carryover.compose.test.ts`) → `ownershipRatio<1` 차단(S9) 불요.
**V-6 확정**: 2주택·조정대상지역·양도 2027-06-30(유예 종료 후, mock 세율)에서 A·B 모두 채택 입력 = 증여자 날짜 치환 일반 split과 세액·중과 유형(`multi_house_2`)이 같다(`p1.test.ts` P1-6). `giftHouseholdBasis`는 건드리지 않는다(수증자 본인 기준).
**V-11 확정**: `callTransferTaxAPI` body는 허용목록 없이 ④ 출력 최상위 키를 그대로 싣는다 — 새 키가 ⑬→⑫→⑭→엔진까지 strip 없이 통과(`__tests__/calc/transfer-split-part-carryover.body-spread.test.ts`). ④ 빌더(`buildSplitPayload`)가 새 키를 만드는 일은 P2~.
