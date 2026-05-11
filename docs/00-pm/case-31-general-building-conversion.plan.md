# 사례 31 — 일반건물(토지+건물 일괄) 환산취득가 · 자산별 통산 구현 계획

> 작성일: 2026-05-08
> 사례: 예제 사례 31 (취득 실거래가 환산 — 일반건물)
> PDCA: Plan
> 선행 완료: 사례 22(PHD 3-시점), 23(공동주택 환산), 27(지분 합산), 28(나대지+신축 일괄), 29(상업용 집합건물 호별고시 전 역환산)

---

## 1. 사례 개요

| 항목 | 값 |
|---|---|
| 자산 | 서울 동작구 사당동 132-10 일반건물(근린생활시설 제과점, 1971.10.27 사용승인) |
| 양도일 | 2023-02-19 / 925,000,000원 |
| 취득일 | 1999-05-24 / 실가 확인 불가 → **환산취득가** |
| 토지 부수면적 | 85㎡ |
| 건물 연면적 | 180.96㎡ (철근콘크리트, 2층) |
| 취득원인 | 매매 (등기, 일괄취득) |
| 양도원인 | 매매 (일괄양도) |

### 1.1 예제 산출 결과 (anchor 목표)

| 항목 | 합계 | 토지(1001) | 건물(3001 — 기타건물) |
|---|---:|---:|---:|
| 양도가액 | 925,000,000 | 904,725,192 | 20,274,808 |
| 환산취득가 | 261,569,520 | 233,908,636 | 27,660,876 |
| 기타필요경비(개산공제) | 7,984,341 | 7,140,000 | 844,341 |
| 전체 양도차익 | 655,446,139 | 663,676,556 | **−8,230,409** |
| 장기보유특별공제 | 199,102,966 | 199,102,966 | 0 |
| 양도소득금액 | 456,343,181 | 464,573,590 | −8,230,409 |
| **결손금 1차 통산금액** | — | **−8,230,409** | **+8,230,409** |
| 통산 후 양도소득금액 | 456,343,181 | **456,343,181** | **0** |

### 1.2 핵심 신규 로직

1. **일반건물 환산취득가** (사례 29 호별고시 ≠ 일반건물 ㎡당가 방식)
2. **토지+건물 양도가 안분** (양도일 기준시가 비율)
3. **자산별 환산 분모/분자** — 양도일 기준시가 vs 취득일 기준시가
4. **자산별 개산공제 분리** (토지 3% / 건물 별도)
5. **자산별 결손금 1차 통산 (§102②)** — `transfer-tax-aggregate` 재사용

---

## 2. 인터뷰 결과 요약

| 의문 | 결정 |
|---|---|
| 모듈 구조 | **별도 신규 모듈** `lib/tax-engine/general-building-valuation.ts` (사례 29 commercial-building-valuation 분리) |
| 기준시가 입력 | **건물기준시가 총액 + 공시지가 직접 입력 (단순)** — ㎡당가·구조·경과·위치지수 자동산정은 후속 |
| 1차 통산 | **이미 `transfer-tax-aggregate.ts`에 구현됨** — 사례 31은 aggregate 경로로 묶어서 호출. 미구현 항목은 없음 |
| 개산공제 | **자산별 분리 산정 신규** — 토지(공시지가×면적×3%) + 건물(취득시 건물기준시가×3%) |

---

## 3. 케이스 인벤토리 매트릭스 (Design 단계 진입 전제)

| # | 모드 | 분기 | anchor 키 | 기대값 / 비고 |
|---|---|---|---|---|
| 31-A1 | 양도가 안분 (토지) | 양도일 기준시가 비율 | `case31_allocation_land` | 904,725,192 |
| 31-A2 | 양도가 안분 (건물) | 잔액 보정 | `case31_allocation_building` | 20,274,808 |
| 31-B1 | 환산취득가 (토지) | 토지 양도가 × (취득시/양도시 토지 기준시가) | `case31_acq_land` | 233,908,636 |
| 31-B2 | 환산취득가 (건물) | 건물 양도가 × (취득시/양도시 건물 기준시가) | `case31_acq_building` | 27,660,876 |
| 31-C | 개산공제 (토지) | 1998년 공시 × 85㎡ × 3% | `case31_estimated_deduction_land` | 7,140,000 |
| 31-D | 개산공제 (건물) | 취득시 건물기준시가 × 3% | `case31_estimated_deduction_building` | 844,341 |
| 31-E1 | 양도차익 (토지) | 양도가 − 환산취득가 − 개산공제 | `case31_gain_land` | +663,676,556 |
| 31-E2 | 양도차익 (건물) | 차손 발생 | `case31_gain_building` | **−8,230,409** (장특 전) |
| 31-F1 | 보유기간 | 1999-05-24 → 2023-02-19 = 만 23년 | `case31_holding_years_floor` | 23 |
| 31-F2 | 장특공제율 (토지) | 표1 일반, 15년 이상 상한 30% | `case31_ltsd_rate_land` | 0.30 |
| 31-F3 | 장특공제 (토지) | 663,676,556 × 30% | `case31_ltsd_land` | 199,102,966 |
| 31-F4 | 장특공제 (건물) | 차손 → 장특 미적용 | `case31_ltsd_building` | **0** |
| 31-G1 | 양도소득금액 (건물, 통산 전) | 차손 그대로 | `case31_income_building_pre_offset` | **−8,230,409** |
| 31-G2 | §102② 1차 통산 흡수액 | 토지로 흡수 | `case31_offset_amount` | **+8,230,409** |
| 31-G3 | 양도소득금액 (토지, 통산 후) | 464,573,590 − 8,230,409 | `case31_income_land_post_offset` | 456,343,181 |
| 31-H | 통산후 양도소득금액 합계 | 토지 통산후 + 건물 0 | `case31_total_income` | 456,343,181 |
| 31-I | 산출세액 | 양도연도 2023 §55 누진세율 (기본세율) | `case31_calc_tax` | 155,597,272 |
| 31-J | 지방소득세 | 산출세액 × 10% | `case31_local_tax` | 15,559,727 |
| 31-K | 비사업용토지 판정 | 바닥면적(연면적÷층수) × 배율 | `case31_nbl_within_ratio` | true (사업용) |

> 31-D 분모 검증: 844,341 ÷ 0.03 = **28,144,700** → "취득시 건물기준시가"로 확정.
> 31-A 역산: 양도시 건물기준시가 ≈ **20,629,440** → "양도시 건물기준시가"로 확정 (Design에서 정밀 재검증).
> **통산 순서 강제 검증** (31-E2 → 31-F4 → 31-G1 → 31-G2 → 31-G3): 차손은 장특 전 발생, 장특은 자기 차익에만, 통산은 장특 후 양도소득금액 단계 — 4개 anchor 단독으로 깨지면 회귀.

---

## 4. 모듈 설계

### 4.1 신규 파일

```
lib/tax-engine/general-building-valuation.ts        (신규, ~250줄)
  ├ allocateBundledTransferPrice()    토지·건물 양도가 안분
  ├ calculateConvertedAcquisition()    환산취득가 자산별 산정
  ├ calculateEstimatedDeduction()      개산공제 자산별 (토지 3% / 건물 3%)
  └ types: GeneralBuildingInput / Output

__tests__/tax-engine/transfer/general-building-valuation.test.ts  (anchor 11종)
__tests__/tax-engine/transfer/case31-general-building-bundled.test.ts (E2E aggregate 통합)
```

### 4.2 입력 타입 (UI ↔ 엔진 계약)

```ts
type GeneralBuildingInput = {
  // 양도
  totalTransferPrice: number;          // 925,000,000
  transferDate: Date;                  // 2023-02-19
  // 취득
  acquisitionDate: Date;               // 1999-05-24
  // 면적
  landArea: number;                    // 85
  buildingArea: number;                // 180.96
  // 양도시점 기준시가 (안분 분모)
  transferLandPrice: number;           // 양도시 공시지가 (원/㎡) — 이미지의 2022년 10,830,000
  transferBuildingValue: number;       // 양도시 건물기준시가 총액 (원)
  // 취득시점 기준시가 (환산 분자)
  acquisitionLandPrice: number;        // 취득시 공시지가 (원/㎡) — 1998년 2,800,000
  acquisitionBuildingValue: number;    // 취득시 건물기준시가 총액 (원) — 약 28,144,700
  // 공통
  estimatedDeductionRate?: number;     // 기본 0.03 (시행령 §163⑥)
};

type GeneralBuildingOutput = {
  allocation: { land: number; building: number };       // 양도가 안분
  acquisition: { land: number; building: number };      // 환산취득가
  estimatedDeduction: { land: number; building: number };
  // aggregate 엔진에 넘길 자산 카드 2장
  assetCards: AssetCard[];
};
```

### 4.3 핵심 산식

#### A) 양도가 안분 (양도일 기준시가 비율)

```
토지 기준시가  = 양도시 공시지가(원/㎡) × 토지면적
건물 기준시가  = 양도시 건물기준시가 총액
합계          = 토지 + 건물
토지 양도가   = 총양도가 × (토지 기준시가 / 합계)
건물 양도가   = 총양도가 − 토지 양도가  (잔액 보정)
```

검증: 925,000,000 × (10,830,000×85)/(10,830,000×85 + 건물기준시가) ≈ 904,725,192

→ 역산하면 양도시 건물기준시가 ≈ 20,629,440 (Design에서 정확값 확정)

#### B) 환산취득가 (시행령 §176의2④)

```
토지 환산  = 토지 양도가 × (취득시 토지 기준시가 / 양도시 토지 기준시가)
건물 환산  = 건물 양도가 × (취득시 건물 기준시가 / 양도시 건물 기준시가)
```

검증:
- 토지: 904,725,192 × (2,800,000×85) / (10,830,000×85) = 904,725,192 × 0.258540 ≈ 233,908,636 ✓
- 건물: 20,274,808 × (28,144,700 / 20,629,440) ≈ 27,660,876 ✓

#### C) 개산공제 (시행령 §163⑥)

```
토지 개산공제  = 취득시 공시지가(원/㎡) × 토지면적 × 3%   = 2,800,000×85×0.03 = 7,140,000 ✓
건물 개산공제  = 취득시 건물기준시가 총액 × 3%             = 28,144,700×0.03 ≈ 844,341 ✓
```

> **시행령 §163⑥ 정확 규정**: 등기 자산(토지·일반건물·주택 모두) **3%**, 미등기 자산 **0.3%**. 본 사례는 등기 일반건물 + 등기 토지 → 둘 다 3% 적용. 자산종류별 분기 없음.
> 상수명: `ESTIMATED_DEDUCTION_RATE_LAND_BUILDING = 0.03` (legal-codes/transfer.ts).

### 4.4 1차 통산 (§102②) — aggregate 위임 + 순서 보장 검증

`general-building-valuation`은 자산 카드 2장을 만들어 `calculateAggregateTransferTax()`로 위임. 통산·장특공제·기본공제·세율적용은 기존 aggregate 엔진이 처리.

**전제(Design에서 grep 검증 필수)** — `transfer-tax-aggregate.ts`가 다음 순서를 보장하는지:

```
[자산별 차익 계산] → [자산별 장특공제] → [자산별 양도소득금액] → [§102② 통산]
```

검증 포인트:
- 건물 차손(−8,230,409)은 **장특 전 단계**에서 발생 → 장특 0
- 토지 장특(199,102,966)은 **자기 차익**(663,676,556)에만 적용
- 통산은 **장특 후 양도소득금액**에서 수행 → 토지 464,573,590 − 8,230,409 = 456,343,181

aggregate 엔진이 이 순서를 깨면 토지 장특이 통산 후 잔여에 적용되어 anchor가 달라짐. **31-F4·31-G1·31-G2·31-G3 4개 anchor 단독으로 회귀 검출** (11종 → **17종**으로 확장).

### 4.5 비사업용토지 판정 (§104의3 / 시행령 §168의11)

상업용 일반건물(근린생활시설) 부수토지는 **건물 바닥면적**(1층 정착면적) × 용도지역 배율로 판정.

| 용도지역 | 배율 |
|---|---|
| 도시지역 내 주거·상업·공업 | 3배 |
| 도시지역 내 녹지 | 5배 |
| 그 외 | 10배 |

> ⚠️ **바닥면적 ≠ 연면적**: 사례 31의 180.96㎡는 2층 건물 연면적. 도면 미노출이므로 간이 추정으로 `연면적 ÷ 층수 = 90.48㎡`. 사당동(준주거·상업 가정) 3배 → 271.44㎡. 실제 부수토지 85㎡ ≪ 271.44㎡ → 사업용 (중과 미발동).
> Design 단계에서 사용자에게 "1층 바닥면적" 입력 필드를 별도 노출할지(precision) vs `연면적÷층수` 자동 추정(MVP) 중 결정. 본 계획은 **자동 추정 MVP**로 진행.

---

## 5. UI 설계 — `propertyType: "general_building"` 추가

### 5.1 케이스 매트릭스 (UI 시니어 점검용)

| 모드 | propertyType | 환산 여부 | 자산 수 | UI 분기 |
|---|---|---|---|---|
| 일반건물·일괄·환산 | `general_building` | true | 2 (토지·건물 자동) | 본 사례 31 |
| 일반건물·일괄·실가 | `general_building` | false | 2 | (후속) |
| 일반건물·각각 양도 | `general_building` | — | 1 | (후속) |

### 5.2 신규 입력 필드 (자산-수준 AssetForm)

```
gbTransferLandPricePerSqm    양도시 공시지가(원/㎡)   LandPriceLookupField
gbTransferBuildingValue       양도시 건물기준시가 총액  CurrencyInput
gbAcqLandPricePerSqm          취득시 공시지가(원/㎡)   LandPriceLookupField
gbAcqBuildingValue            취득시 건물기준시가 총액  CurrencyInput
gbLandArea                    토지면적 (㎡)            DecimalInput
gbBuildingArea                건물 연면적 (㎡)         DecimalInput
gbAcquisitionDate             취득일                   DateInput
gbUseEstimatedAcquisition     환산취득가 사용 토글     ToggleCard (true 고정)
gbEstimatedDeductionRate      개산공제율 (기본 3%)     선택 — 기본 hidden
```

### 5.3 14개 동기화 지점 체크리스트 (Design 단계에서 매트릭스 작성)

① 폼 상태 타입 → ② initial → ③ normalize → ④ API 변환 → ⑤ UI 입력 → ⑥ 사이드바 합계 → ⑦ 결과 카드 → ⑧ validate → ⑨~⑭ Zod·route handler

> ⑫⑬⑭ 누락 시 데이터 침묵 stripping 위험. UI 시니어가 grep 자가점검 필수.

---

## 6. 작업 분담 (PDCA Plan→Do)

### 6.1 에이전트 구성 (Plan부터 병렬)

- **transfer-tax-senior**: `general-building-valuation.ts` 엔진 + aggregate 통합 + anchor 11종
- **transfer-tax-ui-senior**: AssetForm 신규 9필드 + 14개 동기화 + propertyType 디스커버리
- **transfer-deduction-senior** (자문): 개산공제 시행령 §163⑥ 조문·요율 검증
- **transfer-tax-qa**: anchor 100% 일치 + 612개 회귀 테스트 보존

### 6.2 PDCA 단계

1. **Design**: `docs/02-design/features/case-31-general-building.engine.design.md` 신규. 케이스 인벤토리 11행 + 양도시 건물기준시가 역산값 확정 + 산식 합의.
2. **Do** (병렬):
   - 엔진: 신규 모듈 + aggregate 어댑터 + anchor 11종
   - UI: AssetForm 신규 propertyType + 14지점 + 브라우저 수동 확인
3. **Check**: `ui-engine-sync-checker` + `tax-qa-lead` + 브라우저 폼 입력 → 결과 925→456,343,181 확인
4. **Act**: 메모리 인덱스 갱신 + CLAUDE.md 진행상황 한 줄 추가

---

## 7. anchor 후보 (구현 게이트) — 17종

```ts
// general-building-valuation.test.ts (단위 — 환산·안분·개산공제)
case31_allocation_land               → 904,725,192
case31_allocation_building           → 20,274,808
case31_acq_land                      → 233,908,636
case31_acq_building                  → 27,660,876
case31_estimated_deduction_land      → 7,140,000
case31_estimated_deduction_building  → 844,341
case31_gain_land                     → 663,676,556     // 장특 전
case31_gain_building                 → -8,230,409      // 장특 전 (차손)

// case31-general-building-bundled.test.ts (E2E aggregate — 통산 순서 검증)
case31_holding_years_floor           → 23
case31_ltsd_rate_land                → 0.30
case31_ltsd_land                     → 199,102,966
case31_ltsd_building                 → 0               // ★ 차손이므로 장특 미적용
case31_income_building_pre_offset    → -8,230,409      // ★ 통산 전 양도소득금액
case31_offset_amount                 → 8,230,409       // ★ §102② 흡수액
case31_income_land_post_offset       → 456,343,181     // ★ 토지 통산 후
case31_total_income                  → 456,343,181
case31_nbl_within_ratio              → true            // 사업용 (배율 내)

// 후속 (Design에서 §55 정확세율로 직접 계산해 확정)
case31_calc_tax                      → 155,597,272 (2023년 §55 직접 누진계산)
case31_local_tax                     → 15,559,727 (산출세액 × 10%, 원미만 절사)
```

**허용오차 정책**: 원 단위 정수 anchor는 `toBe()` 정확 일치. 환산 산식 부동소수 누적오차 후보(case31_acq_*, case31_allocation_building)는 **±5원 이내** 허용 — Design에서 qa-lead가 정밀도 정책 최종 확정.

---

## 8. 리스크 / 미결사항

| 리스크 | 대응 |
|---|---|
| 양도시 건물기준시가 정확값 미확정 | **20,629,440** 으로 잠금. Design에서 정밀 재검증 (allocation_building anchor와 정합) |
| 취득시 건물기준시가 정확값 | **28,144,700** 으로 잠금 (개산공제 844,341 ÷ 0.03 역산) |
| 1971년 사용승인 → 경과연수 50년+ 처리 | 기준시가 총액 직접 입력이므로 엔진 산정 불요. ㎡당가·지수 자동산정은 후속 PDCA |
| `propertyType: "general_building"` 추가 시 다른 분기 회귀 | aggregate 엔진은 각 자산을 별도 카드로 처리하므로 영향 최소. 612 회귀 테스트로 보증 |
| 개산공제율 시행령 인용 | `legal-codes/transfer.ts`에 **`ESTIMATED_DEDUCTION_RATE_LAND_BUILDING = 0.03`** 상수 추가 (등기 전체 자산 공통, 미등기 0.003 별도) |
| **aggregate 통산 순서 보장** | Design에서 transfer-tax-aggregate.ts grep — (차익→장특→소득금액→§102②) 순서가 코드로 보장되는지 확인 후 진입. 깨져 있으면 본 작업에서 순서 교정 포함 |
| **NBL 바닥면적 산정** | MVP는 `연면적 ÷ 층수`. Design에서 사용자 입력 필드 추가 여부 결정. 본 사례는 어느 쪽이든 사업용 |
| 양도연도 §55 정확세율표 | feedback_transfer_year_tax_rate.md ★★★ 정책 — 외부 자료 산출값 추종 금지, 2023년 누진세율로 직접 계산 |

---

## 9. Definition of Done

- [ ] 케이스 매트릭스 **17행** 모두 anchor 통과 (특히 통산 순서 4종: ltsd_building=0 / income_building_pre_offset / offset_amount / income_land_post_offset)
- [ ] 14개 동기화 지점 grep 자가점검 (특히 ⑫⑬⑭ Zod·route)
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/transfer/` 612+신규 통과
- [ ] 브라우저 수동: 사당동 132-10 입력 → 결과 합계 양도소득금액 **456,343,181** 확인
- [ ] 양도시·취득시 건물기준시가 = **20,629,440 / 28,144,700** Design에 명기
- [ ] aggregate 통산 순서 grep 검증 결과 Design에 기록 (차익→장특→소득금액→§102②)
- [ ] 사례 27·28·29 회귀 anchor 보존
- [ ] 메모리 `project_general_building_case_31.md` + 인덱스 등록

---

## 10. Design 진입 전 잠금 항목 (요약)

| # | 항목 | 확정값 / 정책 | 책임 |
|---|---|---|---|
| 1 | 양도시 건물기준시가 (단일소스) | **20,629,440** | engine-senior |
| 2 | 취득시 건물기준시가 | **28,144,700** | engine-senior |
| 3 | anchor 허용오차 정책 | 정수 anchor 정확 / 환산 산식 ±5원 | qa-lead |
| 4 | 개산공제 상수명 | `ESTIMATED_DEDUCTION_RATE_LAND_BUILDING = 0.03` | deduction-senior |
| 5 | anchor 종수 | 17종 (통산 순서 4종 단독 포함) | qa-lead |
| 6 | 장특 30% 상한 도달 | 보유 23년 → 표1 상한 30% | engine-senior |
| 7 | NBL 바닥면적 산정식 | `연면적 ÷ 층수` 자동 추정 (MVP) | engine-senior |
| 8 | 개산공제율 정책 | 등기 자산 일률 3% (주택·일반건물·토지 공통) / 미등기 0.3% — "주택 0.3%" 표현 사용 금지 | doc |
