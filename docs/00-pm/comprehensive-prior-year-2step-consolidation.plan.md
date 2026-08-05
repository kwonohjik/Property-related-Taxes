# 종합부동산세 직전연도 입력 2단계 통합 — 계획서

> 작성 2026-06-16 (개정 4: 13단계 자가검토 정정 9건 반영) · 대상: 종합부동산세 주택 세부담상한 입력 동선
> **상태**: ✅ **구현됨** (2026-08-05 코드 실측) — `app/calc/comprehensive-tax/page.tsx:48` `STEPS`가 **4단계**(5단계 세부담상한 제거 완료) + `priorHouseValues`가 `priorAssessedValue`에서 **파생**(`comprehensive-api.ts:416`) — 계획서 「단일 입력원」 설계 그대로.
> ⚠️ **산출물 실재까지만 확인했다** — 개별 Phase 완주 여부는 감사하지 않았다.
> ~~종전 표기: **Plan (Do 미착수)** · **엔진 계산식 무변경** / 변환·UI·검증 레이어 재배치~~

## 1. 배경 — 무엇이 문제인가

직전연도 주택 공시가격을 **두 곳에서 입력**받고, 그 둘을 Zod가 상호배타로 막아 사용자가 막다른 길에 빠진다.

| 입력 위치 | 필드 | 엔진 용도 |
|---|---|---|
| 2단계 주택 카드 토글 | `priorAssessedValue` (주택별) | layer-1 재산세 세부담상한(§122) → 재산세 부과세액 ⓐ |
| 5단계 자동계산 모드 | `previousYearAuto.priorHouseValues` (주택별) | layer-2 종부세상당액(§9③) → 종부세 세부담상한(§10) |

- 같은 주택의 직전 공시가격은 하나의 값인데 입력을 2번 받고, refine ⑫(`comprehensive-input.ts:566~579`)가 동시 입력을 막아 충돌(실제 재현).
- 엔진(`comprehensive-prior-year.ts`)은 직전 공시 하나로 재산세상당액+종부세상당액을 **모두** 계산 → 입력은 1개면 충분.

### 사용자 결정 (2026-06-16, 최종)
1. **직전연도 공시가격(주택별)을 단일 입력원**으로, 2단계 **당해 공시가격 바로 아래**에 배치.
2. **직전 세액 직접입력(주택별·세대) 모드는 제거.** — 직전 재산세만으론 §10 세부담상한 분모(직전 종부세+재산세)가 불완전해 부정확(`applyTaxCap` 산식·warning 확정). 직전 공시가격이면 엔진이 재산세·종부세 상당액을 모두 자동 산출해 정확.
3. 세부담상한 모드는 **① 적용 안 함 / ② 직전 공시가격 자동** 2택.
4. 5단계(주택 세부담상한) 제거, 4단계 마법사로 재구성.
5. 조회 근거: `standard-price/route.ts`가 `year` 파라미터 수신(line 113·216) → 같은 PNU로 `year-1` 조회 가능. 직전 공시도 조회 버튼으로 자동 확보.
6. 토지(종합합산·별도합산) 영향 없음(§7).

## 2. 목표 / 비목표

**목표**
- 직전연도 주택 공시가격을 2단계 단일 입력원으로 일원화(중복·상호배타 제거).
- 직전 공시 입력란에 `StandardPriceInput` 재사용(`referenceDate = year-1`) → 직전연도 조회 버튼.
- 세부담상한 모드 2택(미적용/직전 공시 자동), 직전 세대속성(조정지역·1세대1주택) 동반.
- 5단계 흡수·제거, 단계 재구성.

**비목표 (엔진 무변경)**
- 엔진 계산식(layer-1 `comprehensive-housing-tax-cap.ts` / layer-2 `comprehensive-prior-year.ts` / `applyTaxCap`) 변경 없음.
- 토지 세부담상한 로직·입력(Step 4) 변경 없음.
- 세부담상한 세법 규칙(§122 구간율·폐지연도·§10 150%/300%) 변경 없음.

## 3. 현황 인벤토리 (file:line 실측)

### 폼 상태 — `lib/stores/comprehensive-wizard-store.ts`
- PropertyForm(주택별): `priorAssessedTaxCapEnabled`(:68), `priorAssessedValue`(:69), `previousYearTotalTax`(:80 — **DEAD, 제거 대상**)
- FormData: `previousYearTotalTax`(:155 — **제거 대상**), `previousYearCapMode`(:157), `previousYearAutoAssessedValue`(:158), `previousYearAutoIsOneHouse`(:159), `previousYearAutoHouseValues`(:160 — **제거, priorAssessedValue로 흡수**), `previousYearAutoIsMultiAdjusted`(:161)
- initial(:215~252), normalize/migration(:491~505)

### UI
- 2단계 `components/calc/PropertyListInput.tsx`: 당해 공시 `StandardPriceInput`(:177), 직전공시 토글(:370~388, 카드 하단 → 이동)
- 5단계 `app/calc/comprehensive-tax/page.tsx` `Step5TaxCap`(:334~449) — **제거 대상**
- 단계 매핑: `page.tsx:644~648` (0 기본 / 1 주택 / 2 합산배제 / 3 토지 / 4 세부담상한)

### 변환 — `lib/calc/comprehensive-api.ts`
- `priorAssessedValue` 전송(:251~254), `previousYearAuto` 구성(:385~435), `previousYearTotalTax` 전송(:456~458 — 제거)

### 엔진 (무변경 대상)
- layer-1 `comprehensive-housing-tax-cap.ts` — `priorAssessedValue`로 직전 재산세 → 당해 ⓐ §122 상한
- layer-2 `comprehensive-prior-year.ts` `calcPreviousYearEquivalent` — `priorHouseValues`로 재산세상당액+종부세상당액
- 세부담상한 `comprehensive-tax.ts:589·593` `applyTaxCap(당해종부세, ⓐ, prevTotalForCap, capRate)`. `prevTotalForCap = input.previousYearTotalTax ?? previousYearEquivalent?.total` — **직접입력 제거 시 항상 자동계산(previousYearEquivalent.total) 경로**.

## 4. 핵심 설계 결정

### D-1. 직전 공시가격(주택별) → 각 주택 카드, 당해 공시 바로 아래 ★단일 입력원
- `priorAssessedValue`(현 카드 하단 :370)를 당해 공시(:177) **직하**로 이동.
- 위젯: `StandardPriceInput` 재사용, `referenceDate = (과세연도-1)-06-01` → 직전연도 조회 버튼.
- 이 하나의 입력이 layer-1(재산세 ⓐ §122) + layer-2(종부세상당액 §9③·§10) **모두**의 원천(D-4 공급).
- 주택별 ON/OFF 토글(`priorAssessedTaxCapEnabled`)은 세대 모드(D-2)로 대체.
- ⚠️ **혼재 차단(정정 #5)**: `priorAssessedValue`는 주택별 입력이나 `priorHouseValues`는 전 주택 합산이라, ② 모드에서 **일부 주택만 직전공시 입력 시 합산이 부정확**. → ② 모드 선택 시 **전 주택 직전공시 필수**(⑧ validation, §6).

### D-2. 세부담상한 모드 2택 → 주택 목록 하단(세대 단위)
- 라디오: **① 적용 안 함 / ② 직전 공시가격으로 자동 계산**.
- ② 선택 시 각 주택 카드의 직전 공시 입력란(D-1) 활성. ① 선택 시 숨김(세부담상한 미적용·warning).
- **직전 세액 직접입력 모드 전면 제거** (`previousYearTotalTax` direct 경로 폐기).
- (정정 #7) `previousYearCapMode` 타입을 **`"none" | "auto"` enum으로 확정**(① none / ② auto). boolean 대신 enum 유지 — 향후 모드 확장 여지 + 3-state 명시 정책 부합.

### D-3. 직전 세대속성 → 2단계, ② 모드 시 노출
- `previousYearAutoIsMultiAdjusted`(직전 조정지역 2주택)·`previousYearAutoIsOneHouse`(직전 1세대1주택)는 세대 단위 → 주택 목록 하단(D-2 영역), ② 모드에서만.

### D-4. layer-1·2 단일 입력원 공급 + previousYearAuto 전체 구성 + refine 제거
- 변환(`comprehensive-api.ts`): 주택별 `priorAssessedValue`(D-1)에서 `previousYearAuto` 객체 **전체**를 파생 구성. 하나의 입력 → 두 layer 모두 주입.
- **(정정 #2) `previousYearAuto` 11필드 소스 표** (현 api:385~435 기준, 소스만 교체):

  | 필드 | 정정 후 소스 |
  |---|---|
  | `assessedValue` | `Σ properties[].priorAssessedValue` (priorSum) |
  | `priorHouseValues` | `properties[].priorAssessedValue` 배열 (←기존 previousYearAutoHouseValues) |
  | `isOneHouseOwner` | D-3 `previousYearAutoIsOneHouse` |
  | `isMultiHouseInAdjustedArea` | D-3 `previousYearAutoIsMultiAdjusted` |
  | `taxableHouseCount` | `priorHouseValues.length` |
  | `birthDate`·`acquisitionDate` | 기본정보(1단계) 재사용 |
  | `reductionRate`·`ownershipRatio` | `properties[0]` 기준(현행 유지) |
  | `priorSection8Para4Value` | §8④ 주택 직전공시 합(현행 도출 유지) |
  | `appurtenantSplit` | `properties[0]` 직전 시가표준액(현행 유지) |

- **(정정 #3) 1주택·다주택 단일 소스화**: 현행 1주택=`AutoAssessedValue`(단일) / 다주택=`AutoHouseValues`(배열) 이원 분기를 **`properties[].priorAssessedValue` 단일 소스로 통합**(1주택도 `properties[0].priorAssessedValue`). 분기 제거.
- **(정정 #6) 합산배제 주택 포함 정책**: `priorHouseValues`는 직전 **재산세상당액** 합산용(`comprehensive-prior-year.ts`). 합산배제 주택도 직전 재산세는 부과되므로 **직전공시 포함**(종부세 과세 제외와 별개). → 변환에서 `exclusionType` 무관하게 전 주택 `priorAssessedValue` 합산. 케이스 C9'로 anchor.
- refine ⑫(:566~579) **제거**(단일 원천이므로 중복 아님). direct↔auto 상호배타 refine(:538)은 direct 경로 폐기로 **불필요 → 제거**.
- ⚠️ dual-truth 방지: `priorAssessedValue` 단일 진실, `previousYearAuto.priorHouseValues`는 변환 파생만(사용자 직접 입력란 없음).

### D-5. 5단계 제거 → 4단계 마법사 재구성
- `STEPS = ["기본 정보","주택 목록","합산배제","토지 정보"]` (세부담 상한 제거).
- `page.tsx:644~648` 단계 렌더 재매핑, `StepIndicator`·`STEP_MIGRATION` 갱신.
- 토지 세부담상한은 Step 4(토지)에 그대로.

### D-6. DEAD/폐기 필드 정리
- 제거: PropertyForm `previousYearTotalTax`(:80, DEAD), FormData `previousYearTotalTax`(:155), `previousYearAutoAssessedValue`(:158)·`previousYearAutoHouseValues`(:160) — `priorAssessedValue`(주택별)로 흡수.
- 마이그레이션(③):
  - **다주택**: 기존 `previousYearAutoHouseValues[i]` → `properties[i].priorAssessedValue`
  - **(정정 #1) 당해 1주택**: 기존 `previousYearAutoAssessedValue`(단일) → `properties[0].priorAssessedValue`
  - 기존 direct `previousYearTotalTax`(세대 1건) 보유자는 **공시가격 역산 불가** → ② 모드 전환 후 직전 공시 재입력 안내(또는 미적용 처리)
  - `currentStep` 4→3 재매핑

## 5. 케이스 매트릭스 (전수 — Pre-Do anchor 대상)

| # | 주택수 | 모드 | §122(연도) | 직전1세대1주택 | 직전 조정2주택 | 기대 동작 |
|---|---|---|---|---|---|---|
| C1 | 1 | ① 미적용 | - | - | - | 세부담상한 생략(warning), 당해세액 그대로 |
| C2 | 1 | ② 자동 | 2022 | OFF | - | layer-1 ⓐ Min + layer-2 종부세상당액(§10) |
| C3 | 1 | ② 자동 | 2024+ (폐지) | OFF | - | §122 Min 미적용, §10만 |
| C4 | 1 | ② 자동 | 2022 | ON | - | layer-2 고령자·장기보유 직전 재판정 |
| C5 | 다주택 | ② 자동 | 2022 | OFF | OFF | 주택별 직전공시 합산, 일반세율 |
| C6 | 다주택 | ② 자동 | 2022 | OFF | ON(≤2022) | 직전 중과세율(housingBracketsMulti) |
| C7 | 다주택(3+) | ② 자동 | 2022 | OFF | - | 3주택 자동 중과 |
| C8 | 다주택 | ② 자동 | 2022 | - | - | §8④ 특례주택 혼재 시 직전 안분(`priorSection8Para4Value`) |
| **C0** | 1/다주택 | ②(또는 ①) | - | - | - | **법인 corporate_special**: 세부담상한 배제(`tax.ts:409·443` undefined) — 직전공시 입력해도 미적용 (정정 #4) |
| **C9'** | 다주택 | ② 자동 | 2022 | - | - | **합산배제 주택 혼재**: exclusionType≠none 주택도 직전 재산세상당액 합산에 직전공시 포함(종부세 과세 제외와 별개) (정정 #6) |

> 각 케이스를 기존 교재 anchor(사례4·5·6·8·9)에 매핑하여 **숫자 무변경** 회귀로 고정.

## 6. 동기화 지점 영향 (8/14)

| 지점 | 영향 | 비고 |
|---|---|---|
| ① 폼 상태 | **중** | direct 관련 필드 제거, AutoHouseValues→priorAssessedValue 흡수 |
| ② initial | 소 | 제거 필드 정리 |
| ③ normalize/migration | **중** | AutoHouseValues→priorAssessedValue, currentStep 4→3, direct 보유자 안내 |
| ④ API 변환 | **대** | priorAssessedValue→previousYearAuto 파생(D-4), direct 분기 제거 |
| ⑤ UI 위젯 | **대** | 2단계 직전공시 재배치·모드 2택·세대속성, 5단계 제거 |
| ⑥ 사이드바 | 소 | 합계 로직 유지 |
| ⑦ 결과 카드 | 소 | `ComprehensiveTaxResultView:577` 세부담상한 표시 유지 |
| ⑧ validation | **중** | (정정 #5·#9) **② 모드에서만 전 주택 직전공시 필수**(① 미적용은 불필요 — 혼재 합산 부정확 차단), refine ⑫·direct↔auto 제거 |
| ⑫ Zod 입력객체 | **중** | refine ⑫·direct↔auto 제거, `previousYearTotalTax`/`previousYearAuto.priorHouseValues` 정리 |
| ⑬ body spread | 소 | 파생 후 동일 spread |

## 7. 토지 무영향 — 검증 완료

- 토지 세부담상한은 **Step 4(토지 정보)**에 독립 존재(`page.tsx:171·219·235`). 자체 모드(`landAggregatePriorMode`/`landSeparatePriorMode`)·자체 필드 — `previousYearCapMode`(주택)와 무관(`comprehensive-api.ts:316~354`).
- 주택↔토지 교차 refine 없음. 엔진 `comprehensive-separate-land.ts`/`comprehensive-land-aggregate.ts` 별도 계산.
- 부가 이점: 토지는 이미 "물건 단계에 세부담상한 통합" 패턴 → 주택 통합 시 동선 일관.

## 8. Pre-Do Anchor 계획 (Do 진입 전 필수)

1. **A-1 직전공시 단일입력 양 layer**: ② 모드에서 주택별 `priorAssessedValue`만으로 변환이 layer-2(§10)까지 파생 → 기존 5단계 auto 입력과 **동일 결과**. (정정 #8) **1주택**(properties[0].priorAssessedValue == 기존 previousYearAutoAssessedValue)·**다주택**(properties[].priorAssessedValue == 기존 previousYearAutoHouseValues) **양 케이스** 교재 사례8·9 숫자 toBe() 고정.
2. **A-2 §10 정확성**: 직전 공시 → `previousYearEquivalent.total`(종부세+재산세) → `applyTaxCap` 분모. 직전 재산세만 넣던 오류가 구조적으로 불가능함을 확인.
3. **A-3 토지 무영향 회귀**: 종합합산·별도합산 토지 결과 불변.
4. **A-4 미적용 경로**: ① 미적용 시 당해세액 그대로(warning).

> "현행 일치 예상" 금지 — A-1 먼저 실패 확보 후 변환 설계 환류.

## 9. 작업 분할 (Phase)

- **Phase A**: Pre-Do anchor(§8) 작성·실행 → 환류.
- **Phase B**: API 변환 — priorAssessedValue에서 **previousYearAuto 전체 11필드 구성**(D-4 표 — 단순 priorHouseValues 파생이 아님), 1주택·다주택 단일 소스화, direct 분기·refine ⑫ 제거. (정정 #10)
- **Phase C**: 2단계 UI — 직전 공시(D-1, StandardPriceInput year-1) / 모드 2택(D-2) / 세대속성(D-3).
- **Phase D**: 5단계 제거 + 단계 재매핑(D-5) + StepIndicator/STEPS.
- **Phase E**: validation 이동(⑧) + 마이그레이션(③, AutoHouseValues→priorAssessedValue, direct 보유자 안내).
- **Phase F**: 결과뷰 확인 + 회귀 `npx vitest run __tests__/tax-engine/comprehensive*` + E2E(2단계 직전공시 입력→계산→세부담상한).

## 10. 리스크 / 롤백

| 리스크 | 대응 |
|---|---|
| refine ⑫ 제거 후 dual-truth 재발 | priorAssessedValue 단일 진실, previousYearAuto 파생만 |
| 기존 direct(전년 총세액) 보유자 값 유실 | 공시 역산 불가 → ② 전환·직전 공시 재입력 안내(migration) |
| §122 폐지연도(2024+) 분기 누락 | C3 anchor |
| 토지 회귀 | A-3 anchor |
| 직전 공시가격 조회 실패(단독주택 등) | 수동입력 fallback(공시가격알리미 값) — 입력 자체는 항상 가능 |
| 동시 세션 git 충돌 | 격리 worktree 작업 후 머지 |

## 11. 확정 완료 / 잔여

- ✅ 직전 공시가격 단일 입력원(세액 직접입력 제거)
- ✅ "적용 안 함" 옵션(② 외 ①)
- ✅ 5단계 제거
- ✅ 마이그레이션: AutoHouseValues→주택별 priorAssessedValue (direct 세대 1건 보유자는 재입력 안내)
- 잔여: 없음 → **Phase A(anchor) 착수 가능**
