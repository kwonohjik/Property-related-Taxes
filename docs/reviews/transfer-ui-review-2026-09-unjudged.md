# 양도세 UI 코드리뷰 대장 — **미판정 잔여 23건 재판정** (2026-09-08)

> 원 리뷰: 2026-09-05 · 기준 `7a8fc524` · 246파일 56,377줄 · 25 버킷(`bucket-D01`~`D25`) 병렬 리뷰
> 재판정 기준: `master` **26e4eb46** (2026-09-08) — 원 리뷰 후 hint 캠페인 3~5라운드와
> UI 리뷰 배치 #1482~#1546이 들어간 뒤의 코드다.

## 0. 「미판정 155건」의 정체

원 리뷰 `RESUME.md`에 남은 문장이 출처다:

> 검증 단계 **세션 한도로 155/352 실패** → 확정 110건

**이 155건은 이미 대부분 해소됐다.** 그 뒤 복구 실행(`recover.py`)이 모집단을 다시 갈랐다:

| 단계 | 건수 |
|---|---|
| 1차 발견 | 321 |
| 중복 제거 | **302** |
| 복구 실행에서 판정 완료(`settled`) | 245 (실재 160 · 기각 85) |
| 판정 못 함(`need`) | **57** |
| 그중 대장(`final.json` 216건)에 등재돼 이후 처리된 것 | 34 |
| **끝까지 판정되지 않은 것** | **23** |

⇒ **진짜 미판정 잔여는 23건**이다. 두 반증 렌즈가 서로 갈렸는데(`adj` 21 · `verify` 2)
3차 판정 에이전트가 세션 한도로 죽어 어느 쪽으로도 확정되지 않은 건들이다.

> ⚠️ 대장 216건 자체는 #1482~#1529로 **미결 0건 종결**됐다. 이 23건은 그 216건에
> **애초에 들어가지 못한** 별도 모집단이다 — 「종결」이 셌던 분모 밖에 있었다
> (`feedback_closure_claim_scoped_to_verified_subset`).

## 1. 재판정 결과

**실재 19건**(high 2 · medium 10 · low 7) · **이미 닫힘 4건**.

### 🔴 high — 세액·요건 판정에 직결

| ID | 위치 | 판정 |
|---|---|---|
| **R23** | `lib/tax-engine/transfer-tax-amendment.ts:177` | ✅ 실재 |
| **R21** | `components/calc/transfer/RentalHousingExceptionSection.tsx:347` | ✅ 실재 |

#### R23 — 「정당한 사유 면제(§48①2호) — 가산세 0」이 **아무 효과가 없다**

- ⑤ `AmendmentBlock.tsx:224-228` 라디오: 「정당한 사유 면제 (국세기본법 §48①2호) / 증액보상금 등 — **가산세 0**」
- store 기본값이 **`"exempt"`** (`calc-wizard-store.ts:153` · `multi-transfer-tax-store.ts:102`)
- 엔진 `transfer-tax-amendment.ts:177` 첫 분기가 **모드를 보지 않는다**:
  `if (applyUnderReportingPenalty && additionalTax > 0)` → `exempt`도 여기로 들어와
  `underReportingReductionRate = 0` ⇒ `underReportingPenalty = grossUnder` **전액**
- `:222`의 `else if (… mode === "exempt")` 분기는 `additionalTax <= 0`일 때만 도달 —
  그때는 어차피 0이다. **면제 분기는 의미 있는 경우에 한 번도 실행되지 않는다.**
- 결과 카드 `AmendmentResultCard.tsx:151`은 `underReportingPenalty > 0`이라 전액을 찍고
  `totalPayable`에 포함한다.

⇒ 화면은 「가산세 0」이라 말하고 엔진은 10%·40%·60%를 전액 부과한다. **기본값 경로**다.

#### R21 — 거주기간이 `direct` 모드인데 구간 에디터가 0을 보여주고, 건드리면 값이 무너진다

- 기본값 `residenceInputMode: "direct"` (`calc-wizard-asset-residence.ts:17`)
- `RentalHousingExceptionSection.tsx:344` `PeriodRangeEditor`가 `asset.residencePeriods`
  (direct 모드에선 비어 있음)를 그리므로 **합계 0개월**로 보인다
- 같은 카드 `:306`의 `deriveResidencePeriodMonths`는 direct 값을 제대로 읽어
  `:321` 「✓ 충족」을 표시한다 ⇒ **한 카드가 자기 자신과 모순**
- 에디터를 한 번이라도 건드리면 `onChange`가 `residenceInputMode: "interval"`로 바꾸고,
  `deriveResidencePeriodMonths`는 `interval && periods.length > 0`이면 구간 합산으로 가므로
  **direct 개월이 0으로 무너진다**
- 안내문 「어디서 입력해도 자동 동기화됩니다」도 direct 모드에서는 사실이 아니다

⇒ §155⑳ 거주주택 2년 요건 판정에 직결.

### 🟠 medium 10건

| ID | 위치 | 결함 | 방향 |
|---|---|---|---|
| **R06** | `nbl/OtherLandDetailSection.tsx:273` | 「건축물 바닥면적」 hint가 **2% 미만 케이스만** 설명 → 정상 건물 보유자가 칸을 비운다. 엔진 Step 0.6(`other-land.ts:165-172`)은 `buildingFloorArea > 0`일 때만 §101①2호 배율 한도를 판정 ⇒ 초과 부속토지가 **사업용으로 남는다** | 세액 **과소** |
| **R11** | `lib/calc/transfer-tax-validate-nbl.ts:210` | ⑤는 `nblLandType !== "housing_site"`로 게이트(`NblSectionContainer.tsx:284`)하는데 ⑧은 **지목을 안 본다**. 지목을 주택부수토지로 바꾸면 섹션이 사라지고 사유는 남아 **화면에 없는 칸을 요구하며 영구 차단**(리셋 패치 없음) | dead-end |
| **R13** | `HousePriceYearLookup.tsx:32` | 다른 보유주택 공시가격 조회 기준연도 기본값이 **오늘 연도**(`String(CURRENT_YEAR)`). 이 값은 §167의3①1호 주택 수 산정 기준시가로 그대로 실린다. 컴포넌트가 `transferDate`를 받지도 않는다 | 판정 오류 |
| **R14** | `HousingContribEstimatedSection.tsx:47` | §166③ 미리보기가 `Math.floor(stdAtAcq * 0.03)`로 **지분율 미반영**. 엔진은 `computeLumpSumDeductionBase(…, input.ownershipRatio)`(`redevelopment.ts:540`) ⇒ 지분 자산에서 미리보기 ≠ 실제 | 표시 불일치 |
| **R16** | `BurdenedGiftPriorGiftsBlock.tsx:71-74` | 안내문 「미입력 시 합산 누진만 적용되고 **공제가 누락됩니다**」 — 실제로는 `validate-bg.ts:308-312`가 **계산을 차단**한다 | 안내 반대 |
| **R03** | `TransferTaxCalculator.tsx:378·625` | 다건 임베드에서 `handleBack`의 `if (!isEmbeddedInMulti) router.push("/")`(`:222`)는 **사문화**됐다 — step 0에서 `WizardBackNav`가 `onBack`을 부르지 않고 `HomeButton`을 직접 렌더(`WizardNav.tsx:56`)하므로 다건 흐름을 벗어난다. 헤더에도 하나 더 있어 **HomeButton 2개** | 도달성 |
| **R09** | `DetailedStatementRedevelopmentBuilders.ts:83` | `legal: "본 PR 미지원"` — 상세명세서의 **법령근거 자리**에 개발 용어가 인쇄된다 | 금지 표현 |
| **R17** | `SettlementExemptionGuideCard.tsx:48·53` | 화면에 「(**후속 PR**)」·「**후속 PR C-F1** 트래킹」 노출 | 금지 표현 |
| **R20** | `HouseEntryEditor.tsx:435` | 9유형(가~자목) 매트릭스가 「임대사업자 정식 등록」 토글 **밖**의 형제로 놓여, 등록 OFF면 유형을 다 채워도 `isLongTermRentalHousingExempt`가 `hasBasicRegistration`에서 `false` 반환(`multi-house-surcharge-count.ts:210`) — **침묵 미적용** | 안내 부재 |
| **R02** | `SelfBuiltSection.tsx:52·119` | 화면 인용이 「§114조의2」뿐 — 컴포넌트 전체에 **법령명이 한 번도 렌더되지 않는다**(파일 4행의 「소득세법」은 주석) | 인용 규약 |

> R20 주석: 엔진 동작은 **법령상 옳다**(각 목 공통으로 임대사업자등록·사업자등록이 요건).
> 결함은 「전제 토글이 꺼진 채로 매트릭스를 채우게 두고 아무 말도 안 한다」는 UI 쪽이다.
> ⇒ 원 제기의 high는 **medium으로 강등**한다.

### ⚪ low 7건

| ID | 위치 | 결함 |
|---|---|---|
| R05 | `inheritance/PreDeemedInputs.tsx:237·357` | `unit="원"`과 `trailing`을 함께 넘김 — `FieldCard.tsx:79-82`가 `trailing ? … : unit ?`이라 **`unit`은 죽은 prop** |
| R07 | `mixed-use/MixedUseAreaInputs.tsx:140` | 가드가 `footprint <= 0`만 막는다. 건물 100㎡ + 상가 120㎡ → `residualArea(100,120) = −20`이 주택 축에 저장돼 **건드리지도 않은 칸 이름으로 차단** |
| R08 | `results/transfer/FilingFormTable.tsx:169` | 금액 셀에 `tabular-nums` 누락 — 규약은 4클래스(`components/calc/CLAUDE.md:176`) |
| R12 | `PreHousingDisclosureSection.tsx:61` | 주택유형이 `useState` 로컬이라 단계 이동·새로고침 시 「단독·다가구」로 되돌아가 **저장된 공동주택가격에 개별주택가격 라벨**이 붙는다 |
| R15 | `OwnershipRatioInput.tsx:89` | 경고 문구가 「공유 지분율…」 고정(`transfer-tax-api-asset-basics.ts:112-121`). `AssetSectionAcquisition.tsx:100`은 `label="취득 지분율"`로 부른다 ⇒ **화면에 없는 칸 이름** |
| R18 | `nbl/NblSectionContainer.tsx:141` | 의제 성립 시 `opacity-50 pointer-events-none`뿐 — 키보드·스크린리더에는 잠기지 않는다(`inert` 미사용) |
| R19 | `ResidencePeriodSection.tsx:108` | `bg-white` 하드코딩 — 다크모드에서 흰 카드 안에 검은 FieldCard |

### ✅ 이미 닫힘 4건 — 재제안 금지

| ID | 위치 | 무엇이 닫았나 |
|---|---|---|
| R01 | `CompanionSaleModeBlock.tsx:45` | 이제 `RadioCardGroup`(tone="amber", columns={2})을 쓴다 — `radio-card-group-required` 해소 |
| R04 | `TransferTaxCalculator.tsx` | 확인 없는 native 「초기화」가 사라지고 `RestartFromScratchButton`(폐기 확인 Dialog)로 대체(`TransferTaxResultView.tsx:741` · `BundledAllocationCard.tsx:536`). `components/calc/CLAUDE.md:14`가 그 결정을 규약으로 못박았다 |
| R10 | `DetailedStatementRedevelopmentBuilders.ts` | 라벨에서 `(zeroBranch)` 제거 — 잔존 6곳은 **전부 주석**(`FilingFormTableColumns.ts:76` 등) |
| R22 | `RentalHousingExceptionDetailCard.tsx:146` | §161① 블록이 `isScenarioB &&`로 게이트 — A 시나리오에 틀린 근거가 붙지 않는다 |

> R10·R22는 **문자열이 사라진 것이 아니라 게이트·라벨이 실제로 바뀐 것**을 확인했다
> (`feedback_evidence_disappearance_is_not_a_fix`).

## 2. 대장 밖에서 같이 나온 것

- **B1** `RedevelopmentBlockCards.tsx:112` — 화면 본문에 「§97①2·3호 슬롯은 법문상 존재하나
  **본 PR 미매핑** — 별도 산정 시 직접 신고 권장」이 렌더된다. R09·R17과 같은 축인데
  23건 모집단 밖이라 별도로 적는다.

## 3. 남은 구조적 공백 (이 23건과 별개)

원 리뷰 `gaps.json`의 `criticFail 3` — **누락 점검 3종이 한 번도 돌지 못했다**:

1. `critic:rules` — 규칙 전수 대조
2. `critic:sync` — AssetForm × ④⑤⑧ 동기화 전수
3. `critic:flow` — validate 오류 메시지 역추적(도달 불가 차단 탐지)

R11·R16처럼 이 23건 안에서 나온 결함이 **정확히 `critic:flow`가 잡았어야 할 형태**라,
그 축은 아직 모집단 자체가 비어 있다고 봐야 한다.
