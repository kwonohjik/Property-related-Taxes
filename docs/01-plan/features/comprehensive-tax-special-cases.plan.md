# 종합부동산세 후속 특례 3건 계획서 (comprehensive-tax-special-cases)

> 작성일: 2026-06-11 · worktree `comprehensive-tax-audit`
> 조사: comprehensive-tax-senior(KoreanLaw·코드·사례집 실측) + comprehensive-tax-ui-senior(UI) 병렬 Plan
> 선행: 과세연도별 세법(PR#128) · 재산세 안분 §4의3 주택+토지(PR#128·#129) 머지 완료

---

## 1. 배경 · 범위

과세연도별 세법 지원(2021·2022·2023~) 완료 후 명시적으로 후속 이관한 3건을 구현한다.

| ID | 항목 | 법령 | 난이도 | 단계 |
|---|---|---|---|---|
| **F-1** | 토지분 공정시장가액비율(FMR) 연도화 | 시행령 §2의4② | 하 (연결 작업) | Phase A |
| **F-2** | 법인 주택분 특례 (단일세율·공제 0·상한 배제) | 법 §9②·§8①2호·§10 단서 | 중 | Phase B |
| **F-3** | 부부 공동명의 1주택자 특례 | 법 §10의2·시행령 §5의2 | 중 | Phase C |

⚠️ **조문 정정**: 메모리·기존 결과뷰 경고문에 "법인 §9의2"로 기록돼 있으나 KoreanLaw 실측 결과 **법인 세율 특례는 §9②**(§9의2 아님). 본 계획서부터 §9②로 통일한다.

**범위 제외**: 법인 합산배제 요건 차이(별도 조사 필요 시 후속) · 부부 특례 신청 기한(9.16~9.30) 행정절차 검증(안내 문구만) · §9④ 위임 주택 수 특례(부속토지·지분).

## 2. 법령 근거 (KoreanLaw 실측)

### 2-1. F-2 법인 주택분 — §9② 3분류

§9② 본문: "납세의무자가 법인 또는 법인으로 보는 단체인 경우 제1항에도 불구하고…" (실측 확인)

| 분류 | 대상 | 세율 | 기본공제 (§8①) | 세부담상한 (§10) |
|---|---|---|---|---|
| **§9②1호** | 공공주택사업자 등 시행령 §4의4① 법인 | §9①**1호** 일반 누진세율 (주택 수 무관) | 3호 "그 외" — 9억(2023~)/6억(≤2022) | 적용 |
| **§9②2호** | 공익법인등(1호 미해당) | §9①**각호** 누진세율 (주택 수 따라 1호/2호) | 동일 9억/6억 | 적용 |
| **§9②3호** | 그 외 일반 법인 | **단일 비례세율** — 가목 2주택 이하 / 나목 3주택 이상 (누진공제 없음) | **0원** (§8①2호 축자: "제9조제2항제3호 각 목의 세율이 적용되는 법인…: 0원") | **배제** (§10 단서 축자 확인) |

**§9②1호 예외 법인 (시행령 §4의4① 실측)**: 공공주택사업자(1호)·주택조합(3호)·정비사업 시행자(4호)·민간건설임대 2호↑(5호)·도시개발 임대 시행자(5의2호)·사회적기업/사회적협동조합(6호)·종중(7호).

**§9②3호 연도별 단일세율**:

| 과세연도 | 2주택 이하 | 3주택 이상 (≤2022는 +조정 2주택) | 출처 |
|---|---|---|---|
| 2021·2022 | **3.0%** | **6.0%** | ✅ Phase 0 확정 — 구법 §9②(MST 235367, `applicable_law` 축자) + pdf38 법인 열 병합 셀 600dpi 실측 |
| 2023~ | **2.7%** (1천분의 27) | **5.0%** (1천분의 50) | §9②3호 가·나목 현행 실측 ✓ |

> ≤2022 나목 판정 = 3주택 이상 **OR 조정대상지역 2주택** (pdf38 표 헤더 "3주택 등" + 구법 구조) — 개인 `isMultiHouseRate`와 동일 기준이므로 동일 헬퍼 재사용. 구법 §9②는 1·2·3호 분류가 아니라 "예외 법인(괄호) 제외 + 그 외 법인 각 호 세율" 구조 — 엔진 enum 매핑은 동일(corporate_special = 구법 본문 법인).

### 2-2. F-3 부부 공동명의 1주택자 특례 — §10의2 · 시행령 §5의2

| 항목 | 조문 | 실측 내용 |
|---|---|---|
| 요건 | §10의2①·령 §5의2② | 세대원 1명 + 배우자만이 주택분 재산세 과세대상 **1주택만** 공동 소유, 둘 다 거주자 |
| 납세의무자 | 령 §5의2③ | 시니어 실측 "공동 소유자 간 합의로 정한 자" — ⚠️ 법 §10의2 본문의 "지분율이 큰 자(같으면 합의)" 우선 규정 존재 여부 **재확인 필요 (R-2)** |
| 계산 방식 | §10의2③ | 공동명의 1주택자를 **1세대1주택자로 보아** §8 과세표준·§9 세율 적용 |
| 배우자 지분 합산 | 령 §5의2⑥ | 배우자 소유 지분 **합산**(= 주택 전체 공시가격) |
| 재산세 공제·상한 | 령 §5의2⑦ | 1주택 **전체** 기준 재산세 부과액·재산세상당액 — 기존 §4의3 안분 로직 그대로 |
| 고령자·장기보유 공제 | 령 §5의2⑧ | **납세의무자(신청인)의 연령·보유기간** 기준 |
| 기본공제 | §8①1호 준용 | 12억(2023~) / 11억(2021·2022) — `basicDeductionOneHouse` 기존 값 재사용 |

### 2-3. F-1 토지분 FMR — 시행령 §2의4②

§2의4② 본문 축자: "법 제13조제1항 및 제2항에서 대통령령으로 정하는 공정시장가액비율이란 **100분의 100**을 말하되, 2019년부터 2021년까지…" → 2019=85% · 2020=90% · **2021=95%** · 2022~=100%. (종합합산·별도합산 공통)

## 3. 현행 코드 실측 · 갭

| # | 갭 | 현행 (실측 file:line) | 필요 변경 |
|---|---|---|---|
| G-1 | 법인 기본공제 0원 | `comprehensive-tax.ts:202~206` — `isOneHouseOwner` 이분법(12억/9억)만 | `taxpayerType` 분기 추가 |
| G-2 | 법인 단일세율 | `:218~228` — `isMultiHouseRate()` general/multi 2-세율만 | §9②3호 단일 비례 경로 + historical 연도별 세율 |
| G-3 | 법인 상한 배제 | `:276~286` — `applyTaxCap()` 무조건 호출 | §9②3호 시 호출 생략 |
| G-4 | §9②1·2호 일반세율 법인 | 미구현 | 일반 누진 경로(공제 9억/6억·상한 적용) — 1호는 주택 수 무관 general 표, 2호는 주택 수 분기 |
| G-5 | 부부 공동명의 특례 | 미구현 — `comprehensive-tax.ts:326` 경고 문구만 | `isJointOwnership` 플래그 → 1세대1주택 경로 진입 |
| G-6 | 토지 FMR 연도화 | `comprehensive-historical.ts:30` `fairMarketRatioLand`(2021=0.95) **정의돼 있으나 전달 경로 부재** — `comprehensive-land-aggregate.ts:248` 기본값 1.00 고정 호출, `comprehensive-separate-land.ts:211` FMR 암묵 100% | 토지 계산 함수에 FMR 파라미터 전달 |
| **G-7** | 주택 §4의3 ⑥ 분모 (★Phase 0 신규 발견 — 기머지 다주택 버그) | Step 1 루프 `standardRateTaxSum` = Σ 각 주택 표준세율 세액 | **합산 공시 × 재산세 FMR → 표준세율 누진 1회** (작성방법 pdf38 ⑦ + 사례5 2개 연도 실증. 1주택은 동치라 기존 anchor 미탐지) |

타입: `ComprehensiveTaxInput`(`types/comprehensive.types.ts:179~208`)에 `taxpayerType`·부부특례 필드 전무.

## 4. 엔진 설계 초안

### 4-1. Input 신규 필드 (전부 optional — 하위호환, 기존 anchor 137+ 무변경)

```ts
interface ComprehensiveTaxInput {
  /** 납세의무자 유형. 미입력 = "individual" (기존 동작 불변)
   *  corporate_special: §9②3호 (단일세율·공제0·상한배제)
   *  corporate_general: §9②1호 (일반 누진 — 주택 수 무관 general 표)
   *  corporate_public:  §9②2호 (일반 누진 — 주택 수 분기) */
  taxpayerType?: "individual" | "corporate_special" | "corporate_general" | "corporate_public";

  /** §10의2 부부 공동명의 1주택자 특례 신청. true 시 1세대1주택자 계산 방식.
   *  birthDate/acquisitionDate = 납세의무자(신청인) 기준 (령 §5의2⑧)
   *  properties = 지분 안분 없이 주택 전체 공시가격 (령 §5의2⑥) */
  isJointOwnershipSpecialCase?: boolean;
}
```

> 설계 단계 결정 사항: ① corporate 3분류를 UI에 전부 노출할지(1·2호는 드묾 — "일반 세율 적용 법인" 1개로 묶고 주택 수 분기는 엔진 자동?) — 단, 1호(항상 general 표) vs 2호(주택 수 분기)는 **계산이 다르므로** 엔진 enum은 분리 유지. ② 부부 특례 지분율 입력은 계산 미사용(안내 목적) — 입력 생략이 기본안.

### 4-2. historical 파라미터 확장

```ts
interface ComprehensiveYearParams {
  // ... 기존 ...
  corporateRate2HouseOrLess: number;  // 2023~: 0.027 / ≤2022: R-1 확정 후
  corporateRate3HouseOrMore: number;  // 2023~: 0.050 / ≤2022: R-1 확정 후
}
```

세율 적용은 분수 정수 연산(`floor(base × 27 / 1000)`) — memory `feedback_applyrate_fractional_rate_one_won_error`.

### 4-3. 계산 흐름 변경 지점 (comprehensive-tax.ts)

| Step | F-2 법인 (§9②3호) | F-3 부부 특례 |
|---|---|---|
| Step 3 기본공제 | `corporate_special` → 0원 / `corporate_general·public` → 일반 9억(6억) | `basicDeductionOneHouse` (12억/11억) |
| Step 5 세율 | 단일 비례 — 주택 수는 **`aggregationExclusion.includedCount`(합산배제 후)** 기준으로 가목(2이하)/나목(3이상) 판정(개인 `isMultiHouseRate`와 동일 소스). ≤2022 나목에 조정 2주택 포함 여부는 R-1 연동. 누진공제 없음 / 1호 → general 표 고정(주택 수 무관) / 2호 → 기존 `isMultiHouseRate` 분기(≤2022 조정 토글 입력 유효) | 기존 일반/다주택 로직 그대로 (1주택이므로 general) |
| Step 6 1세대1주택 세액공제 | 법인 전 유형 **배제** (`isOneHouseOwner` 강제 false) | **적용** — 신청인 birthDate/acquisitionDate |
| Step 7 재산세 안분 §4의3 | 동일 (⑤·⑥ 산식 무변경) | 동일 — 주택 전체 기준 (령 §5의2⑦ 정합) |
| Step 8 세부담상한 | `corporate_special` → **호출 생략** / 그 외 법인 → 적용 | 적용 |
| result echo | `taxpayerType`·적용 세율 echo (배지용) | `isJointOwnershipApplied` echo (배지용) |

부부 특례의 엔진 본질: `isJointOwnershipSpecialCase === true` → 1세대1주택자 경로(`isOneHouseOwner`와 동일 취급) + echo. **상호배타 검증**: `isOneHouseOwner && isJointOwnershipSpecialCase` 동시 true 차단(Zod refine + ⑧).

### 4-4. F-1 토지 FMR 연결

1. `calcAggregateLandTaxBase(totalOfficialValue, fairMarketRatio)` — 이미 파라미터 수신 구조(`land-aggregate.ts:27~29`), **호출부만** 수정.
2. `calculateAggregateLandTax(input, fairMarketRatio = 1.00)` / `calculateSeparateAggregateLandTax(lands, fairMarketRatio = 1.00)` 시그니처 확장 (기본값 1.00 → 기존 직접 호출 테스트 무변경).
3. `comprehensive-tax.ts:302~311` Step A/B 호출부에서 `yearParams.fairMarketRatioLand` 전달.
4. 별도합산 내부 `truncateToTenThousand(afterDeduction)` → FMR 곱 적용(`separate-land.ts:211`). 절사 순서는 **추정 불필요** — 종합합산 `calcAggregateLandTaxBase`(`land-aggregate.ts:35~36`)가 이미 `Math.floor(afterDeduction × FMR)` → `truncateToTenThousand` 순서로 확립 → 별도합산도 동일 적용. (Pre-Do anchor로 1원 단위 재확인 — R-5)
5. **결과 echo `fairMarketRatio` 갱신 (STEP 1 검토 #1)**: 현행 상수 고정 echo **4곳** — `land-aggregate.ts:229`(zero)·`:301`(본 계산), `separate-land.ts:253`(zero)·`:274`(본 계산). 파라미터 값으로 교체하지 않으면 **2021 결과뷰가 100%를 오표시** (memory `feedback_engine_result_display_drift` — 산식 반영해도 표시필드 미반영 시 카드 오류). 자기일관성 anchor: `result.taxBase === truncateToTenThousand(floor(afterDeduction × result.fairMarketRatio))`.
6. §4의3 안분 영향(R-4): ⑤ 산식의 재산세 토지 FMR(70%)·최고세율은 **무변경** — 종부세 과표(⑤의 입력)만 95%로 변동. 2021 anchor에서 실측.

## 5. UI 설계 초안 (ui-senior 실측 기반)

### 5-1. 구조 실측 요약

- 마법사: `app/calc/comprehensive-tax/page.tsx` 5단계 (Step1 기본 `:159~252` / Step5 상한 `:451~506`). **API 변환이 page.tsx 인라인**(`callComprehensiveApi` `:526~630`) — 별도 `lib/calc/comprehensive-api.ts` 없음.
- store: `lib/stores/comprehensive-wizard-store.ts` `ComprehensiveFormData` — 법인·부부 필드 전무.
- ⚠️ page.tsx 현재 ~790줄 — 신규 필드 3건 추가 시 **800줄 초과 확실** → **Do 진입 전 `lib/calc/comprehensive-api.ts` 분리 선행** (Phase B 첫 커밋).
- `lib/calc/comprehensive-validate.ts` 부재 — ⑧은 현재 API Zod가 겸임. 신규 차단 검증(상호배타)은 Zod refine + UI 단 차단 모두.

### 5-2. 위젯

**F-2 (Step1 최상단, 과세연도 아래)** — 2단 구성 (STEP 3 검토 #9: 1호/2호는 계산이 달라 UI 구분 입력 필수):
```
납세의무자 유형 — RadioCardGroup (tone sky, native 금지)
  [개인(기본)] [법인]
법인 선택 시 하위 RadioCardGroup — 법인 유형:
  [일반 법인 — 단일세율 (§9②3호, 기본 선택)]
  [공공주택사업자 등 (§9②1호 — 일반 누진세율, 주택 수 무관)]
  [공익법인등 (§9②2호 — 일반 누진세율, 주택 수 분기)]
```
법인 선택 시 노출 매트릭스 (STEP 1 검토 #2·#8 정정):

| Step1~5 요소 | individual | corporate_special (§9②3호) | corporate_general (1호) | corporate_public (2호) |
|---|---|---|---|---|
| 1세대1주택 ToggleCard + 생년월일·취득일 | 표시 | 숨김 | 숨김 | 숨김 |
| 부부 특례 ToggleCard | 표시 | 숨김 | 숨김 | 숨김 |
| Step5 전년도 총세액(세부담상한) | 표시 | **숨김** (§10 단서 상한 배제) | 표시 (상한 적용) | 표시 |
| Step5 조정지역 2주택 ToggleCard (year<2023) | 표시 | **표시** — ≤2022 나목 판정에 조정 2주택 포함 확정(Phase 0 R-1 해소, pdf38 "3주택 등") | 숨김 (주택 수 무관 general 고정) | 표시 (주택 수 분기 — 개인과 동일) |

엔진 단일 진실: 법인 선택 시 store에 잔존하는 `isOneHouseOwner`·`birthDate`·`acquisitionDate`·`isJointOwnershipSpecialCase`는 **엔진이 무시**(`taxpayerType !== "individual"` → 1세대1주택·부부특례 경로 차단)하는 것을 1차 방어로 하고, API 변환(④)에서도 **명시 strip** — 3중 패턴(memory `mirror-pattern`). 안내 카드 수치는 `getComprehensiveParams` 단일 진실(dual-truth 금지).

**F-3 (Step1, 1세대1주택 ToggleCard와 같은 그룹)**:
```
부부 공동명의 1주택자 특례 (§10의2) — ToggleCard
  ON: 생년월일·취득일 DateInput — 기존 store 필드(birthDate·acquisitionDate, store:76~77) 그대로 재사용,
      라벨만 "납세의무자(신청인) 생년월일/최초 취득일"로 변경 (신규 store 필드 아님)
  안내: ① 주택 공시가격은 지분 안분 없이 전체 금액 입력 (령 §5의2⑥)
        ② 납세의무자는 R-2 확정 규정(지분율 큰 자/합의)에 따라 문구 안내 — 계산 미사용이므로 본인/배우자 선택 입력은 두지 않음
```
`isOneHouseOwner`와 상호배타 — 한쪽 ON 시 다른 쪽 disabled + 안내. 법인 선택 시 비노출. **신규 동기화 필드는 `isJointOwnershipSpecialCase` 1개뿐** (생년월일·취득일은 기존 필드 재사용 → 14지점 신규 영향 없음).

**F-1**: 입력 변화 없음. 결과뷰 `AggregateLandSection`·`SeparateLandSection` 과세표준 행 note에 `formatRate(land.fairMarketRatio)` 표시 추가 (주택분 `:172` 패턴 동일).

**결과뷰**: 법인 — 기본공제 행 "적용 없음(§8①2호)" 라벨 + "§9② 법인 단일세율" 배지, 상한 행 비표시. 부부 — "§10의2 부부 공동명의 특례" 배지 + 1세대1주택 공제 breakdown 재사용. 기존 경고 배너(`comprehensive-tax.ts:326`) 문구에서 구현된 항목 제거.

### 5-3. 14개 동기화 지점 (신규 필드: `taxpayerType` · `isJointOwnershipSpecialCase` — 2개뿐, 부부 신청인 생년월일·취득일은 기존 필드 재사용)

①FormData ②initial(`"individual"`/`false`) ③normalize fallback ④API 변환(분리될 `lib/calc/comprehensive-api.ts`) ⑤위젯 ⑥사이드바(종부세 미사용 — 해당 없음) ⑦결과뷰 배지·라벨 ⑧상호배타 차단(UI+Zod 동기) ⑨Zod enum(`lib/validators/comprehensive-input.ts`) ⑩~⑪해당 구조 확인 ⑫Zod 객체 정의 ⑬fetch body spread ⑭route `toEngineInput` 매핑. F-1은 ⑦만.

## 6. Phase 계획

### Phase 0 — Pre-Do 검증 게이트 ✅ 완료 (2026-06-11)

1. **R-1 해소** ✅: `applicable_law`(행위시법 도구)로 2022.6.1 시점 본문(MST 235367, 시행 2021.9.14 — 부칙 §18449 적용례로 2021 귀속에도 적용) 축자:
   - **§9② (구법)**: "법인 또는 법인으로 보는 단체(공공주택사업자 등 … 대통령령으로 정하는 경우는 **제외**)인 경우 … 각 호에 따른 세율" — 구법은 현행 1·2·3호 분류와 달리 **예외 법인을 괄호로 제외**하고 그 외 법인에 각 호 세율. 각 호 수치는 pdf38 신고서 작성방법 세율표 법인 열(600dpi 병합 셀 실측): **2주택 이하 3.0% / 3주택 이상·조정 2주택 6.0% 단일**.
   - **§8① (구법)**: "6억원을 공제(… 제9조제2항 각 호의 세율이 적용되는 경우는 **제외**)" → 법인 공제 0원 ✓
   - **§10 (구법)**: "다만, … 제9조제2항 각 호의 세율이 적용되는 경우는 그러하지 아니하다" → 법인 상한 배제 ≤2022도 동일 ✓. (부수 확인: 상한 300%는 "§9①**2호** 적용대상" — 기구현 `isMultiHouseRate` 2축 판정과 축자 정합)
   - **§9①1·2호 (구법) 세율표 축자** — 누적식 표를 등가 누진공제로 환산해 `BRACKETS_PRE2023_GENERAL/MULTI` 전 구간 일치 검산 ✓ (year-aware 잔여 "법문 축자 확인 1회" 항목도 해소)
   - → **≤2022 법인 지원 가능** — Zod 거부 불요. ≤2022 법인 나목 판정은 조정 2주택 포함(개인과 동일 `isMultiHouseRate` 재사용).
2. **R-2 해소** ✅: 령 §5의2③ "해당 1주택을 소유한 세대원 1명과 그 배우자 중 **공동 소유자간 합의로 정한 사람**" (지분율 우선 규정 없음). ②단서: 배우자가 다른 주택 부속토지 소유 시 특례 제외 — UI 안내 문구 반영. 적용 개시: 사례5 직전연도(2021) 계산이 11억 공제 사용 → 2021 귀속 적용 실증.
3. **사례5·6 재실측** ✅ (300dpi):
   - 사례5 = "부부공동명의 1주택 + **지방저가주택**(§8④2호)" — 특례 신청 시 본인 합산. 확정값: 공시 17억(15억+2억) → 과표 3.6억 → 산출 **2,280,000** → 재산세 공제 **781,356** → **1,498,644** → 고령자 공제 599,457을 **15억/17억 안분** 528,933(§8④ 지방저가 안분 — 범위 외) → 결정 969,711. anchor는 안분 전 단계(1,498,644)까지 채택.
   - 사례6 = 법인 아님("주택 건물·부속토지 소유자가 다른 경우") — 제외 확정.
4. **★ 신규 갭 G-7 발견 (High — 기머지 PR#128 다주택 버그)**: 주택분 §4의3 ⑥ 분모가 **합산 단일 누진**(공시합산 × 재산세 FMR 60% → 주택 표준세율 누진 1회)이어야 하는데 현행은 Σ 각 주택 표준세율 세액. 근거 3중: 작성방법 pdf38 ⑦ 명문 + 사례5 22년분(17억→3,450,000) + 21년분(14.95억→2,958,000). 1주택은 양 방식 동치라 기존 anchor(사례1) 미탐지. **Phase A에 포함**.
5. **anchor 선작성·실패 확보** ✅: `__tests__/tax-engine/comprehensive-special-cases.test.ts` — G-7(현행 864,000 vs 정답 781,356 실패 확인) + SC-A1(현행 5억 vs 정답 4.75억 실패 확인). 산출세액 2,280,000 등 기본 흐름은 현행 통과.

### Phase A — F-1 토지 FMR 연도화 + **G-7 주택 안분 ⑥ 분모 정정** (독립 PR)

- F-1: §4-4 그대로. anchor: SC-A1(2021 과표 4.75억 — 실패 확보 완료) + 2022·현행 무변경 회귀(기존 사례10·11 anchor).
- G-7: `comprehensive-tax.ts` Step 1 루프의 `standardRateTaxSum`(Σ per-house) 누적을 폐기하고 Step 7에서 **합산 공시가격(includedAssessedValue) × 재산세 FMR(60%) → 주택 표준세율 누진 1회**로 ⑥ 산출. anchor: 사례5 공제 781,356·공제후 1,498,644(실패 확보 완료) + 기존 사례1(1주택 — 양 방식 동치, 504,000 무변경 회귀).

### Phase B — F-2 법인 §9② (독립 PR)

선행 커밋: `lib/calc/comprehensive-api.ts` 분리(800줄 정책). 이후 G-1~G-4 + UI + 14지점. **2021~현행 전 연도 지원** (R-1 해소). anchor: 2024 — 공시 20억(§9②3호, 2주택 이하): 공제 0 → 12억 과표 × 2.7% = **32,400,000** / 2022 — 동일 입력 × 3.0% = **36,000,000** / 상한 배제·3주택 나목 케이스 (설계 SC-B 인벤토리).

### Phase C — F-3 부부 §10의2 (독립 PR)

G-5 + UI + 14지점. anchor: **사례5 채택 확정**(Phase 0) — G-7 anchor와 동일 입력을 `isJointOwnershipSpecialCase=true`로 전환(공제 11억 → 산출 2,280,000 → 공제후 1,498,644 + `isJointOwnershipApplied` echo) + 현행 2024 직접 산식(12억 공제 + 신청인 기준 고령자·장기보유) + 상호배타 검증. ※ 고령자 공제 15억/17억 안분(528,933)은 §8④ 지방저가 특례 범위 외 — 결과뷰 안내 문구로만.

## 7. 테스트 계획

- 단위: Phase별 anchor(§6) + 하위호환 회귀(기존 종부세 137+ · 전체 7302 무변경).
- E2E (worktree `E2E_PORT=3100`): `comprehensive-tax-corporation.spec.ts`(법인 선택 → 개인 필드 숨김 + 기본공제 "적용 없음" + 배지) · `comprehensive-tax-spouse-joint.spec.ts`(특례 ON → 신청인 입력 펼침 + 상호배타 + §10의2 배지) · 기존 `comprehensive-tax-year-aware.spec.ts`에 CPT-YA-E2E-4(2021 토지 FMR 95% 표시) 추가.
- 검증 도구: `ui-engine-sync-checker`(14지점) + `bkit:gap-detector`.

## 8. 리스크 · 확인 필요

| # | 항목 | 영향 | 처리 |
|---|---|---|---|
| ~~R-1~~ | 2021·2022 법인 단일세율 | — | ✅ 해소 — 3.0%/6.0% (Phase 0 §6 참조) |
| ~~R-2~~ | §10의2 납세의무자 결정·적용 개시 | — | ✅ 해소 — 합의로 정한 자(령 §5의2③), 2021 귀속 적용 실증 |
| R-3 | 부부 미신청 시 인별 과세(각자 9억) 경로 | 본 계획은 **특례 신청 시나리오만** 구현 — 미신청 비교 계산은 범위 외 명시 | 결과뷰 안내 문구 |
| R-4 | 토지 FMR 95% 시 §4의3 ⑤/⑥ 비율 변동 | Phase A anchor 정확도 | ⑤ 산식 자체 무변경 — 2021 anchor 실측 |
| R-5 | 별도합산 FMR 곱·만원 절사 순서 | 1원 단위 | 종합합산과 동일 순서 적용 + Phase A에서 SC-A2 anchor |
| ~~R-6~~ | 사례5·6 판독 모순/유형 | — | ✅ 해소 — 사례5 채택(§10의2+지방저가), 사례6 제외(법인 아님) |
| R-7 | page.tsx 800줄 초과 | File Size Policy | Phase B 선행 분리 커밋 |
| R-8 | 법인 합산배제 적용 가능 여부 | Step3 노출 정책 | 범위 외 — 현행 유지, 설계 단계 재검토 |
| R-9 | G-7 ⑥ 합산 시 재산세 과표 절사 디테일 (합산공시 × 60%의 절사 위치) | 1원 단위 | 사례5 anchor(781,356 원단위)가 잡음 — Do에서 확정 |

## 9. 완료 기준 (DoD)

- [ ] Phase 0 게이트 전 항목 해소 (R-1·R-2·사례5 재실측)
- [ ] Phase A·B·C 각 anchor toBe 통과 + 기존 전체 테스트 무변경
- [ ] 14지점 전부 (⑫⑬⑭ grep 자가 점검) + 상호배타 ⑧↔Zod 동기
- [ ] tsc 0 · E2E 신규 spec 통과 · 800줄 정책 준수
- [ ] Playwright E2E로 브라우저 확인 (수동 안내 금지)
- [ ] 메모리 §9의2→§9② 조문 정정 반영
