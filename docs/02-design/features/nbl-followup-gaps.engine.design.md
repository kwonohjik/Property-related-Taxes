# NBL 후속 갭 엔진 설계 (F1·F2·F3)

> 계획: `docs/00-pm/nbl-gaps/nbl-followup-gaps.plan.md` + `gap-f{1,2,3}-*.plan.md`. 법령 근거 실측(mst=286211·286379, 2026-06-17). 본 문서는 엔진/데이터 레이어 구현 명세.

---

## 0. 케이스 인벤토리 (input → expected)

### F1 — 양도일 의제
| # | 지목 | 취득일 | 실제 양도일 | reason | 의제일 | §168의6 판정 기준일 | 도시/편입 기준일 | 기대 |
|---|---|---|---|---|---|---|---|---|
| F1-1 | 기타토지 | 2015-01-01 | 2024-01-01 | auction | 2020-01-01 | 2020-01-01 | 2024-01-01 | 보유 5년·window 단축 판정 |
| F1-2 | 농지 | 2010-01-01 | 2024-01-01 | none | — | 2024-01-01 | 2024-01-01 | 회귀(실제 양도일) |
| F1-3 | 목장 | — | — | auction | 의제일 | 의제일 | **실제 양도일** | 편입유예·도시지역 실제 양도일 |
| F1-4 | — | — | — | auction | (빈값) | — | — | validate 차단 |

### F3 — 부분 면적안분 중과
| # | 지목 | isNonBusiness | nonBusinessRatio | calculatedTax 산식 |
|---|---|---|---|---|
| F3-1 | 목장 초과 | true | 0.333 | 누진(taxBase) + floor(floor(taxBase×0.333)×0.10) |
| F3-2 | 농지(안분無) | true | 1 | 누진(taxBase) + floor(taxBase×0.10) (회귀) |
| F3-3 | 사업용 | false | 0 | 누진만 |
| F3-4 | 목장 초과+단기1년 | true | 0.333 | max(taxBase×0.50, 누진+안분중과) |

### F2 — 별표 자동산출
| # | 호 | 입력 | 기준면적 |
|---|---|---|---|
| F2-1 | 1호 sports 실외 축구장 | sportsFacilityType=soccer | 11,000 |
| F2-2 | 5호 reserve le2400 [tactical,range] | unitSize+facilities | 32,475 |
| F2-3 | 1호 sports 미선택 | standardAreaLimit=5000 | 5,000 (fallback) |
| F2-4 | 목장 별표1의3 | livestockType+count | 현행 하드코딩 (blocker) |

---

## 1. 타입 변경

### F1 (`non-business-land/types.ts`)
```ts
export type DeemedTransferReason =
  | "none" | "auction" | "public_sale"
  | "kamco_consignment" | "newspaper_public_offering" | "republication";

interface NonBusinessLandInput {
  // ...
  deemedTransferReason?: DeemedTransferReason; // 기본 none
  deemedTransferDate?: Date;                   // reason≠none 시 필수
}
```

### F3 (`non-business-land/types.ts` + `types/transfer.types.ts`)
```ts
// NonBusinessLandJudgment.surcharge (types.ts:420~425)
surcharge: {
  surchargeType: "non_business_land";
  additionalRate: number;
  nonBusinessAreaRatio: number;  // 신규 — 면적안분 없으면 1 (§168의11⑤⑥)
  longTermDeductionExcluded: boolean;
  basicDeductionApplied: boolean;
}
// TransferTaxInput (types/transfer.types.ts:77) — 엔진 내부 파생(사용자 입력 아님)
nonBusinessLandAreaRatio?: number;
```
⚠️ **surcharge 조립 3곳 동기화 (tsc 강제)** — `nonBusinessAreaRatio`를 필수 필드로 추가하므로:
- `engine.ts:256 assemble`: `nonBusinessAreaRatio: isNonBusinessLand ? (categoryResult?.areaProportioning?.nonBusinessRatio ?? 1) : 0`
- `engine.ts:286 makeSurchargeResult`(→ `createBusinessResult:295`·`createNonBusinessResult:315` 경유): `nonBusinessAreaRatio: isNonBusinessLand ? 1 : 0` (면적안분 정보 없는 레거시 팩토리 → 전량/0)

### F2 (`non-business-land/types.ts` + `data/area-standards.ts`)
```ts
// OtherLandUsage 추가 (선택)
sportsFacilityType?: keyof typeof SPORTS_OUTDOOR_STD | keyof typeof SPORTS_INDOOR_STD;
reserveForcesUnitSize?: "le800"|"le2400"|"le5000"|"gt5000";
reserveForcesFacilities?: Array<"tactical"|"shooting_prep"|"range"|"basic">;
// area-standards.ts — 별표3 실외11·실내3 / 별표6 부대편성4×시설4 (정본 실측)
```

---

## 2. 알고리즘

### F1 — `engine.ts` 헬퍼 + 5 judge
```
getPeriodJudgmentDate(input):
  if reason≠none && deemedTransferDate: return deemedTransferDate
  return transferDate

# 5 judge(farmland·forest·pasture·other·villa)에서:
  pjDate = getPeriodJudgmentDate(input)
  meetsPeriodCriteria(periods, acquisitionDate, pjDate, cat, rules, gracePeriods)  # 인자만
  period 배열 종료(fullPeriod/livestockPeriods/nonVilla) = pjDate
# 불변(실제 transferDate): isUrbanFor*·checkIncorporationGrace·isRelatedPasture 상속3년·무조건의제
```
근거: `meetsPeriodCriteria` 내부가 transferDate를 window 종료(`period-criteria.ts:124·130·135·138)로 사용 → 인자 치환만으로 window 전체 의제일화. §168의6은 순수 기간기준(편입유예 없음, get_law_text 실측).

### F3 — `rate-calc.ts:272` 중과분만 안분
```
if input.isNonBusinessLand && surchargeRates.non_business_land:
  additionalRate = surchargeRates.non_business_land.additionalRate  # 0.10
  ratio = input.nonBusinessLandAreaRatio ?? 1
  { progressiveTax, baseRate, deduction } = computeBracketBreakdown(taxBase, brackets)
  surchargedBase = applyRate(taxBase, ratio)            # floor(taxBase×ratio)
  surchargeAmount = applyRate(surchargedBase, additionalRate)
  nblTax = progressiveTax + surchargeAmount
  # §104①후단 단기(50%/40%) — 전체 taxBase 기준, ratio 무관
  # ⚠️ 단기율 채택 시 자산 전체 50/40% → 부분안분 효과 상실(법령상 "큰 산출세액" 우선)
  if 단기 && applyRate(taxBase, 단기율) > nblTax: return 단기율
  return { calculatedTax: nblTax, appliedRate: baseRate + additionalRate×ratio, ... }
# ratio=1이면 surchargedBase=taxBase → 기존 산식 완전 동일(회귀)
```
정수: `applyRate`(=floor) 2단. ratio 소수4(`area-proportioning.ts:12`). LTHD §95표1 불변.

### F2 — `other-land.ts:resolveAreaLimit` 별표 lookup
```
case "sports":
  if sportsFacilityType: return SPORTS_*_STD[sportsFacilityType]  # 별표3
  return o.standardAreaLimit                                       # fallback
case "reserve_forces":
  # 별표6 비고: 사격술예비·사격장·기초훈련장은 전술교육장에서 실시 불가 시에만 포함 → 사용자가 facilities로 포함 시설 선택
  if reserveForcesUnitSize: return Σ RESERVE_FORCES_STD[unitSize][f] for f in facilities  # 별표6
  return o.standardAreaLimit
# 복잡 비고(용도지역별 배율·종목합산·선수가산·6호 휴양 3요소)·목장 별표1의3 = 직접입력/하드코딩 유지
```

---

## 3. 동기화 지점 요약

| 갭 | 신규 입력 | 14지점 핵심 | 결과뷰 |
|---|---|---|---|
| F1 | reason·의제일 (2) | ⑤ DeemedTransferSection · ⑧ validate · ⑫ Zod · ⑭ Date변환 | 의제일·사유 행 |
| F3 | **없음**(엔진 파생) | ⑦ 결과카드만 | 안내문 갱신·부분안분 세액 |
| F2 | sports·reserve 선택 (3) | ⑤ 하위 select · ⑧ fallback validate · ⑫ Zod(배열) · ⑭ buildOtherLand | 자동 기준면적·별표 근거 |

---

## 4. anchor (Pre-Do)

- F1: AT-F1-1(의제일 판정 플립, FAIL 선확보)·F1-2(회귀)·F1-3(편입/도시 실제 양도일)·F1-4(validate)
- F3: AT-F3-1(부분안분 numeric 실증, FAIL 선)·F3-2(ratio=1 회귀)·F3-4(단기 §104①후단)·F3-5(1원 오차)·F3-6(LTHD 불변)·F3-7(3지목)
- F2: AT-F2-1(soccer 자동)·F2-3(fallback)·F2-4(별표1의3 동결 toBe)

---

## 5. blocker·scope OUT

- 별표1의3(목장 per-head): get_annexes 가지번호 파서 실패 → Do bylSeq 탐색/법제처 직접, 정본 전 numeric 동결.
- §168의11⑥ 복합용도 건축물 부속토지 안분(`buildingMultiplier`)·별표3 비고 용도지역별 배율(지방세법 교차)·6호 휴양 §83의4⑫ 3요소 = 직접입력 유지.
