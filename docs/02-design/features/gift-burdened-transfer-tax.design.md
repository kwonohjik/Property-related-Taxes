# 부담부증여 양도소득세 통합 표시 — 설계 (v2)

> 증여세 마법사의 부담부증여 부동산 자산에서 채무인수액을 입력하고 "양도소득세 함께 계산" 토글을 켜면,
> 기존 양도세 부담부증여 엔진을 재사용해 양도소득세를 산출하고 증여세 결과화면에 함께 표시한다.

- **브랜치**: `feat/gift-burdened-transfer` (worktree `gift-burdened-transfer`)
- **결정(사용자)**: 입력 위치 = 자산 모달 인라인 ToggleCard · MVP = 단일 자산 · 상증법 기준시가 모드
- **상태**: Plan/Design — Pre-Do anchor A 14/14 PASS. 13단계 자가검토 1차(39건) 반영. C-4 probe 진행 중. Do 대기.

> **v2 변경**: 13단계 자가검토(transfer-tax-senior 17건 + inheritance-gift-tax-senior 22건) 반영.
> 주요: 필드명 매핑 변환(C1)·세대/조정지역 신규입력(C2)·호출흐름 확정(C3)·다자산 차단(C4)·결과뷰 위치(C5)·building 주택분기(H1) 등.

---

## 1. 배경 — 가장 중요한 사실

**양도세 마법사는 이미 부담부증여 시 "양도세(증여자) + 증여세(수증자)"를 한 번에 계산한다.**
`burdened-gift-apportionment.ts:307-380` STEP 7에서 `calcGiftTax()` 호출 → `TransferBurdenedGiftBreakdown.giftTax`.

**결론: 신규 계산 엔진 코드 = 0.** 기존 `calculateTransferTax(input, rates)`를 `transferType:"burdened_gift"`로
호출하는 배선만 증여세 쪽에 추가. `gift → transfer` 엔진 직접 import 금지 → **클라이언트 `/api/calc/transfer` 경유**.

---

## 2. MVP 범위

### 포함
- 부담부증여 부동산 자산 **1건**(단일). **2건 이상 토글 ON 시 validation 차단**(D3·C4)
- 상증법 **기준시가 모드**(`valuationMode:"sangjeungbeop_standard"`)
- category 3종: `real_estate_land`→land / `real_estate_building`→(주택여부)housing|building / `real_estate_apartment`→housing
- 취득가액 = 취득시 기준시가 안분(§159①1호). 실지취득가·시가모드 없음

### 비범위(후속 PR)
- 다자산(2건 이상) 동시 계산·합산 UI
- 상증법 시가 모드
- **다주택 중과**(케이스 12: 다주택+조정+부담부증여) — `detectBurdenedGiftMultiHouseWarning`(apportionment.ts:499-514)이 이미 Phase 2 비스코프 경고. MVP는 **정보성 warning만, 중과세율 미적용**. 단 1세대1주택 비과세 판정용 세대 데이터는 수집(§4-B)
- 양도세 결과 이력 저장(MVP 휘발 — §6 주석)
- 증여세 사이드바 양도세 합계 표기(MVP 결과뷰만 — §9⑥)
- **일부 인수**(`assumedDebtForGift ≠ leaseDeposit + mortgageAmount`, 임대보증금·저당 일부만 인수, 설정액≠인수잔액): MVP 차단+안내. `mortgageSetAmount` 분리 입력·"인수한 임대보증금" 구분은 후속(C-4 probe 잔여 리스크)

---

## 3. category → 양도세 propertyType 매핑

증여세 `standardPrice`는 단일 필드(토지=개별공시지가, 건물·아파트=기준시가), category 단일 종류.

| 증여세 category | 주택여부 입력 | 양도세 propertyType | landStdAt* | buildingStdAt* | 추가 입력 |
|---|---|---|---|---|---|
| `real_estate_land` | — | `land` | `standardPrice` | 0 | 비사업용토지 |
| `real_estate_building` | **주택O** | `housing` | 0 | `standardPrice` | 거주기간·1세대·세대주택수·조정지역 |
| `real_estate_building` | 주택X | `building` | 0 | `standardPrice` | (없음) |
| `real_estate_apartment` | (항상 주택) | `housing` | 0 | `standardPrice` | 거주기간·1세대·세대주택수·조정지역 |

- **H1 정정**: `real_estate_building`은 단독·다가구 등 **주택**을 포함 → "주택 여부" 입력으로 분기. 주택이면 `housing`(비과세·LTHD·중과 활성), 비주택이면 `building`.
- **§159 적법성(M5)**: 토지 단독(land)은 `buildingStd=0`, 건물 단독(building/housing)은 `landStd=0`. `burdened-gift-apportionment.ts:244` `transferDenominator = landStd + buildingStd` → 단일종류는 한쪽 0이 분모. Anchor C로 정상 확인됨.
- **아파트 공시가(M6)**: 공동주택공시가격(토지+건물 합산 단일가)을 `buildingStdPriceAtTransfer`에 넣어 `housing`으로 계산 — Anchor B에 아파트 케이스 1건 추가해 실증(§8).

---

## 4. 입력 필드 — 보유분 / 신규 / 기본값

### (A) 증여세가 이미 보유 → 자동 전달 (매핑 변환 규칙 명시 — C1)

| 양도세 input | 증여세 출처 / 변환 |
|---|---|
| `transferDate`(=양도일) | 증여일 `giftDate` |
| `lendingDepositTotal` / `mortgageDebtAmount` | ✅ **C-4 확정(probe)**: `item.leaseDeposit` / `item.mortgageAmount`. 양도가액 B = `leaseDeposit + mortgageAmount`. ⑧에서 `assumedDebtForGift === leaseDeposit + mortgageAmount` 일치 강제(불일치=차단) |
| `annualRentTotal` | **`(item.monthlyRent ?? 0) × 12`** (월세→연액 환산 — C1 핵심. 누락 시 임대평가 1/12 오류) |
| `mortgageSetAmount` | `item.mortgageAmount` (미입력 시 `mortgageDebtAmount` fallback) |
| `landStdPriceAtTransfer` / `buildingStdPriceAtTransfer` | `item.standardPrice`(증여일=양도일), category로 land/building 배정(§3) |
| `giftBuildingStdPriceAtTransfer` | `item.standardPrice`(building·apt, §61 층별가감 동일값) — H2 |
| `donorRelation` | 증여세 Step0 `donorRelation`(수증자→증여자 관계). 역방향 `giftDonor` 매핑은 apportionment.ts:314-326이 처리(M2 anchor 확인) |
| `isGenerationSkip`·`isMinorDonee`·`priorGiftsWithin10Years` | 증여세 Step0·Step2 |
| `propertyType` | `item.category` + 주택여부(§3) |
| `valuationMode` | `"sangjeungbeop_standard"` 고정(MVP) |

### (B) 증여세엔 없음 → 신규 입력 필수 ★

| 필드 | 적용 | 용도 |
|---|---|---|
| `acquisitionDate` (취득일) | 전체 | 보유기간(LTHD·단기세율) |
| `standardPriceAtAcquisition` (취득시 기준시가) | 전체 | §159①1호 안분 분자. **land는 `LandPriceLookupField` 필수**(H5) |
| `householdHousingCount` (세대 보유 주택 수) | housing | 비과세·중과 판정. 미전달 시 1세대1주택 **차단**(C2) |
| `isRegulatedArea` (양도시 조정지역) | housing | 중과 플래그 경로(transfer-tax.ts:496-498) |
| `isOneHousehold` (1세대1주택 여부) | housing | 비과세 판정(transfer-tax.ts:270) |
| `residencePeriodMonths` (거주기간) | housing | 1세대1주택 LTHD 표2. ON 시 필수(H11) |
| `wasRegulatedAtAcquisition` (취득시 조정지역) | housing | 비과세 거주요건 |
| `temporaryTwoHouse` (`previousAcquisitionDate`+`newAcquisitionDate`) | housing·2주택 | 일시적 2주택 비과세(H4). `householdHousingCount===2`일 때만 노출 |
| `isNonBusinessLand` (비사업용 토지) | land | 중과 |

### (C) 기본값
| 필드 | 기본값 |
|---|---|
| `isUnregistered` | false |
| `isOneHousehold` | false (안전 방향 — 미입력 시 비과세 미적용) |
| `householdHousingCount` | 1 (1채 보유 가정) |
| `mortgageSetAmount` | `mortgageDebtAmount` fallback |
| `reductions` | [] |
| `acquisitionMethod` | 불요 — 엔진 STEP 0.48이 `useEstimatedAcquisition:false` 강제 override(M3) |

### 법리 (H3 보강)
- 양도일=증여일, 취득일=증여자 당초 취득일. 보유기간·세율·LTHD 모두 이 날짜 기준(transfer-tax-rate-calc.ts:262-269).
- 납세의무자=증여자. 1세대1주택·중과 판정도 **증여자 기준**.
- **경과규정**: 취득일 2017.8.3 이전 조정지역 취득이면 거주요건 면제(소령 §154① 단서·부칙, `residenceTransitionAcquisitionDate`). MVP는 `acquisitionDate`로 자동 처리 가능한지 Do 1단계 확인(C-5).

---

## 5. 데이터 모델

`EstateItem`에 optional 중첩(3-state: undefined=토글 OFF). `feedback_three_state_optional_mode_toggle` 준수.

```ts
// lib/tax-engine/types/inheritance-gift-estate.types.ts
interface EstateItem {
  // ...기존...
  assumedDebtForGift?: number;                            // 기존 §47①
  burdenedGiftTransferTax?: BurdenedGiftTransferTaxInput; // 신규(토글 ON 시만)
}

interface BurdenedGiftTransferTaxInput {
  acquisitionDate: Date;                  // 취득일(증여자 당초)
  standardPriceAtAcquisition: number;     // 취득시 기준시가(단일, category로 land/building 매핑)
  isHousing?: boolean;                    // real_estate_building의 주택 여부(H1). apartment=항상 true
  // housing 전용
  householdHousingCount?: number;         // 세대 보유 주택 수(기본 1)
  isOneHousehold?: boolean;               // 1세대1주택(기본 false)
  isRegulatedArea?: boolean;              // 양도시 조정지역
  wasRegulatedAtAcquisition?: boolean;    // 취득시 조정지역(거주요건)
  residencePeriodMonths?: number;         // 거주기간
  temporaryTwoHouse?: { previousAcquisitionDate: Date; newAcquisitionDate: Date };
  // land 전용
  isNonBusinessLand?: boolean;
  // 공통 선택
  isUnregistered?: boolean;               // 기본 false
}
```

> 증여세 엔진(gift-tax.ts)은 이 필드를 **읽지 않는다**(양도세 전용). 직렬화 strip 위험 점검(§9).
> 결과는 EstateItem에 저장하지 않음(휘발) — 계산 액션 시점 API 호출 → 결과뷰 props.

---

## 6. 데이터 흐름 (C3 확정: 계산 액션 내 직렬 호출 + props 주입)

```
[증여세 폼] EstateItem.burdenedGiftTransferTax (토글 ON, 단일자산)
   │  ① 폼상태  ② initial(EstateItem 팩토리: undefined)  ③ normalize(optional → 자동 undefined)
   ▼
[계산 액션] 증여세 API(/api/calc/gift) 완료 직후 ──직렬──▶
   │  ④ lib/calc/gift-burdened-transfer-api.ts (신규): 토글ON 자산 → TransferTax body 구성
   │     - 보유분(A) 매핑변환 + 신규(B) + 기본값(C), transferType:"burdened_gift"
   │     - ⑬ 이 body 구성이 곧 신규 ⑬ 지점 — 기존 transfer Zod 스키마 호환 grep 자가점검
   ▼
POST /api/calc/transfer  (자산 1건 = 1 호출)
   │  ⑨⑩⑫ Zod(기존 재사용) ⑪⑭ Route 엔진 매핑(Date 변환 date-coerce)
   ▼
calculateTransferTax(input, rates) → TransferTaxResult (taxableGain·determinedTax, +giftTax 교차검증)
   │
   ▼
[GiftTaxForm] 결과를 transferTaxResults prop으로 ──▶ [GiftTaxResultView] (stateless)
   │  ⑦ BurdenedTransferTaxResultCard.tsx (신규 분리 컴포넌트) — line~554(2-스트림 끝 이후)
```

- **결과뷰는 stateless**: 내부 useEffect/fetch 금지. 부모(GiftTaxForm) 계산 액션에서 직렬 호출 후 props 주입(C3·L4·증#20).
- C-3 해소: §5(props)와 §6(트리거) 모순 → **계산 액션 직렬 + props** 단일안.

---

## 7. UI 설계

### 7.1 입력 — 자산 모달 인라인 토글 (H7·H8·H5·M7 반영)
`components/calc/inheritance/estate-card/variants/EstateBodyRealEstate.tsx`
(mode==="gift" && category∈부동산3종)

- **위치(H7)**: 기존 §47③ ToggleCard+안내(line 648~667) **이후**. 논리순서: §47① 채무인수 → §47③ 입증 → 양도소득세.
- **노출조건(H8)**: `(item.assumedDebtForGift ?? 0) > 0` (단순 표시 게이트 — 숫자 파생 허용)
- **ON/OFF 상태(H8)**: `burdenedGiftTransferTax !== undefined` (3-state, truthy/length derive 금지)
- **토글↔객체 동기화**: onChange 핸들러로 (useEffect→store 미러링 금지 — `mirror-pattern`)
- **다자산 차단(C4)**: 토글ON 자산이 이미 1개 있으면 추가 ON 시 안내+validation 차단
- **category별 조건부 입력(M7)** + 필드 순서(엔진 처리 순 = UI 순, `feedback_ui_order_follows_logic`):

| category | 입력 필드 순서 |
|---|---|
| `real_estate_land` | 취득일 → 취득시 기준시가(**LandPriceLookupField**) → 비사업용토지 → 신고기한 |
| `real_estate_building` | **주택 여부(ToggleCard, `isHousing`)** → [주택O]아래 housing 세트 / [주택X]취득일·취득시 기준시가·신고기한만 |
| `real_estate_apartment` | (주택 자동 `isHousing=true`) 취득일 → 취득시 기준시가 → 1세대1주택 → 세대주택수 → 양도시조정지역 → 취득시조정지역 → 거주기간 → [2주택시]일시적2주택 → 신고기한 |

> P1: `real_estate_building`이 주택이면 apartment와 동일한 housing 필드 세트 노출, 비주택이면 취득일·취득시 기준시가·신고기한만. 주택 여부 토글이 분기 선행.

- tone: 양도세 맥락 구분색(`sky`/`indigo`). 안내: "부담부증여 채무인수분은 유상양도로 보아 증여자에게 양도소득세가 과세됩니다(소득세법 §88·소령 §159)."
- 입력 컴포넌트: `DateInput`(취득일)·`LandPriceLookupField`(land 기준시가)·`CurrencyInput`(building 기준시가)·`DecimalInput`(거주기간)·`ToggleCard`/`RadioCardGroup`(여부). native 금지, select-on-focus.

### 7.2 결과 — 양도세 카드 (C5·L2)
- **신규 분리 컴포넌트** `components/calc/results/BurdenedTransferTaxResultCard.tsx` (GiftTaxResultView 761줄 → 800줄 정책, L2)
- **위치(C5)**: `GiftTaxResultView.tsx` **line~554(2-스트림 블록 끝 이후)** — 2-스트림 유무 무관 증여세 결과 맨 아래
- props: `transferTaxResults: TransferTaxResult[]`(MVP 길이 0|1)
- 산식 분해: 양도가액(=채무인수액) → 취득가액(취득시 기준시가 안분) → 양도차익 → 장기보유공제 → 과세표준 → 산출세액 → 지방소득세 → 합계
- `formula-display-builder`·`amount-column-align`. 한국어 산식(`feedback_result_view_korean_formula`)·"원" 금지·내부 id 금지.

---

## 8. Pre-Do Anchor — A(PASS) / B(Do중) 구분 (D8·L1)

### Anchor A (엔진 재사용 가능성) — ✅ 14/14 PASS
기존 `burdened-gift-housing.test.ts`·`burdened-gift-land.test.ts` 차용.
임시: `__tests__/tax-engine/transfer-tax/_predo-burdened-gift-anchor.test.ts`.
- A-1 housing(건물만 land=0): `building.transferPrice=500,000,000`, `calculatedTax=45,458,000`(케이스4 일치). **결과 필드명 `taxableGain`**
- A-2 land(토지만 building=0): `land.transferPrice=1,000,000,000`, `taxBase=456,140,000`, `calculatedTax=156,516,000`(케이스6 일치)
- Anchor C(단일종류 안분): 한쪽 0에서 crash/NaN 없음, 합=채무액. floor 잔액 흡수 정상
- Anchor B(평가액 C 일치): 일반 케이스 양도세 `supplementary` = 증여세 `valuatedAmount` 완전 일치. 담보>기준시가도 결과 동일(경로 상이·무해)
- **추가 예정(M6)**: 실제 아파트(공동주택공시가) `housing` 케이스 1건

### Anchor B (폼→타입→API→결과 파이프라인) — Do 중 최초 검증
신규 `BurdenedGiftTransferTaxInput` → `gift-burdened-transfer-api.ts` 변환 → `/api/calc/transfer` → 결과뷰 도달.
A는 엔진 재사용만 입증했고, 신규 매핑 경로는 미검증(증#21).

---

## 9. 14개 동기화 지점 (C6·H6·H10·M4 반영)

| 지점 | 구현 위치 / 정책 |
|---|---|
| ① 폼 상태 | `EstateItem.burdenedGiftTransferTax` |
| ② initial | **EstateItem 생성 팩토리**에서 `burdenedGiftTransferTax: undefined` 명시(C6/증#7) |
| ③ normalize | optional 추가 → 기존 자산 로드 시 자동 undefined, migrate 불요(C6/증#8) |
| ④ API 변환 | **신규** `lib/calc/gift-burdened-transfer-api.ts` (기존 `transfer-tax-api-burdened-gift.ts`는 반대방향이라 별개) |
| ⑤ UI 위젯 | EstateBodyRealEstate 토글+섹션(§7.1) |
| ⑥ 사이드바 | **MVP 미포함**(결과뷰만, H10/D5). 양도세는 별도 납세의무자 |
| ⑦ 결과 | `BurdenedTransferTaxResultCard`(§7.2) |
| ⑧ validation | **`gift-tax-form-shared.tsx:245 validateStep()` 내부**(H6). 토글ON 시 취득일·취득시 기준시가 필수, housing은 거주기간 필수(H11). **C-4: `assumedDebtForGift === leaseDeposit + mortgageAmount` 일치 강제**(불일치=차단, 일부인수 비범위). 자동 안분 fallback 금지 → 미입력=차단 |
| ⑨⑩⑫ Zod | 기존 transfer 스키마 재사용 |
| ⑬ body spread | ④ helper의 body 구성이 **신규 ⑬ 지점**(M4) — Zod shape 호환 grep 자가점검 |
| ⑪⑭ Route | 기존 transfer route 재사용, Date 변환 `date-coerce` |

---

## 10. 파일 변경 목록 (H6·L2 정정)

| 파일 | 변경 |
|---|---|
| `lib/tax-engine/types/inheritance-gift-estate.types.ts` | `BurdenedGiftTransferTaxInput` + EstateItem 필드 |
| `components/calc/inheritance/estate-card/variants/EstateBodyRealEstate.tsx` | 토글 + category별 입력 섹션 |
| (EstateItem 생성 팩토리 — Do 1단계 위치 확정) | `burdenedGiftTransferTax: undefined` initial |
| `lib/calc/gift-burdened-transfer-api.ts` (신규) | 토글ON 자산 → transfer API body 매핑·호출 |
| `components/calc/gift-tax-form-shared.tsx` | `validateStep()` 토글ON 필수필드(⑧) + 다자산 차단(C4) + 계산 액션 직렬 호출(C3) |
| `components/calc/results/GiftTaxResultView.tsx` | line~554 카드 삽입점 + `transferTaxResults` prop |
| `components/calc/results/BurdenedTransferTaxResultCard.tsx` (신규) | 양도세 결과 카드(L2 분리) |
| `__tests__/tax-engine/...` | Anchor A/B/C(+아파트) 정식 승격 |
| `e2e/gift-burdened-transfer.spec.ts` | E2E(토글→입력→결과 카드) |

---

## 11. 리스크·확인 필요

- ✅ **C-4 확정(probe)**: 매핑 = `leaseDeposit→lendingDepositTotal`, `mortgageAmount→mortgageDebtAmount`, `monthlyRent×12→annualRentTotal`, `mortgageSetAmount=mortgageAmount fallback`. B=`leaseDeposit+mortgageAmount`, §66 담보평가(`lendingDepositTotal+mortgageSetAmount`)·§50⑦ 임대평가 모두 정확(실측 200M/300M/12M→B500M·C담보500M·C임대300M). 후보 B(전액 mortgageDebtAmount)는 임대보증금 소실로 임대평가 오류 → 기각. 일부 인수는 §2 비범위·⑧ 일치 강제
- 🔶 **C-5** 2017.8.3 경과규정 거주요건 면제가 `acquisitionDate`로 자동 처리되는지 → Do 1단계 확인
- 🔶 donorRelation 방향(수증자→증여자)이 `giftDonor` 역매핑(apportionment.ts:314-326)에서 정확한지 → anchor(M2)
- ✅ C-1(단일종류 안분)·C-2(평가액 C 일치) — Anchor C·B PASS
- **이력**: 양도세 결과 MVP 미저장(휘발) — 재조회 시 미표시(H9). 후속 PR 스키마 확장
- **중과**: 다주택 중과 MVP 비스코프(warning만) — 1세대1주택 판정용 세대 데이터만 수집
