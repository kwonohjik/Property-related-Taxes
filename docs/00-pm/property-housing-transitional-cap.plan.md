# 주택 재산세 세부담상한 경과조치(부칙 제15조) 구현 계획 — v1 본세

작성일: 2026-06-24
대상 엔진: 재산세(property-tax)
상태: 설계 완료, Do 대기

---

## 1. 배경 — 실측 차이

실제 고지서(용인 기흥 구갈동 아파트, 1세대1주택, 2023~2025 정기분) vs 앱 계산 비교에서, **앱이 주택 재산세 세부담상한을 미적용해 본세를 과다 계산**함을 확인.

| 연도 | 앱 본세(산출세액) | 실제 본세 | 과다 |
|---|---|---|---|
| 2025 | 266,072 | 236,800 | **+29,272원/연** |

원인: `lib/tax-engine/property-tax.ts:352-398` `applyTaxCap()`이 `objectType === "housing"`을 §122 단서로 완전 배제(주석 "v1 미지원"). 산출세액(266,072)을 그대로 확정세액으로 사용.

검증: 지방교육세(=본세×20%)로 역산한 본세가 **3년 연속 정확히 110%씩 증가**(195,700 → 215,300 → 236,800) — 세부담상한 110% 작동의 결정적 증거.

---

## 2. 법령 근거 (KoreanLaw MCP 검증 완료)

| 조문 | 내용 |
|---|---|
| **법률 제19230호(2023.3.14) 부칙 제15조** | "제122조의 개정규정(주택 세부담상한 폐지, 시행 2024.1.1) 시행 전에 주택 재산세가 과세된 주택에 대해서는 2028년 12월 31일까지 종전의 규정에 따른다." |
| **종전 §122(2023 시행본)** | 주택 재산세 산출세액(§112①각 호 및 ②)이 직전연도 재산세액 상당액의 비율 초과 시 그 금액. 공시가격 **3억↓ 105% / 3억 초과~6억 110% / 6억 초과 130%**. 법인 소유 주택 제외. |
| **시행령 §118** | 직전연도 재산세액 상당액 = §112①1호(본세)·§112①2호·②(도시지역분 등) **각각 별도 산출**. 2호 가목 단서 — "직전연도에 해당 납세의무자에게 과세된 세액이 있으면 그 세액으로 한다"(직전 실제 과세 세액). |

이 아파트는 2023년에 이미 과세 → **2024~2028 종전 세부담상한 적용 대상**. 공시가격 약 5.18억(3~6억) → **110%**.

---

## 3. Anchor 데이터 (본세, 3년 실측)

| 연도 | 과세표준 | 본세 산출세액 | 전년본세×110% | 결정 본세(min) | 실제 고지 |
|---|---|---|---|---|---|
| 2023 | 187,880,000 | 195,760 | — | 195,760 | 195,700 |
| 2024 | 198,462,000 | 216,924 | 195,700×1.1=215,270 | 215,270 | 215,300 |
| 2025 | 223,036,000 | 266,072 | 215,300×1.1=**236,830** | **236,830** | 236,800 |

**anchor 채택값: 법령 산식(`Math.floor`) 기준** → 2025 본세 `236,830`.
실제 고지(236,800)와 **30원 차이**는 역산·연도별 절사 누적오차(±30 진동 확인). 테스트는 `toBe(236_830)` + 오차 주석.

---

## 4. v1 Scope — 본세 세부담상한만

### 4-1. 신규 input 필드

```typescript
// lib/tax-engine/types/property.types.ts — PropertyTaxInput
/**
 * [부칙 제15조 경과조치] 직전연도 주택 재산세 본세 (§112①1호, 고지서 '재산세' 항목).
 * 입력 시 공시가격 구간 기준 세부담상한 적용 (objectType==="housing" 전용).
 * 미입력 시 상한 미적용 + warning. objectType!=="housing" 시 무시.
 */
previousYearHousingBaseTax?: number;
```

기존 `previousYearTax`(비주택용)와 **별도 신설** — §118이 본세/도시지역분 각각 별도 산출을 요구하고, 주택은 본세만 v1 대상이므로 의미 분리.

> **직전세액 산정 방식 분리(M2)**: 종부세 측 `buildHousingPropertyTaxWithCap`(comprehensive-housing-tax-cap.ts:44)은 직전세액을 **직전공시로 재산정**(§118 2호 가목 본문, `calculatePropertyTax` 재호출). 재산세 마법사 v1은 **납세자 고지서 직접입력**(§118 2호 가목 단서 "직전 실제 과세 세액"). 두 방식 모두 §118 적법 — 마법사는 사용자가 고지서를 들고 있으므로 직접입력이 정확. recompute는 v2.

### 4-2. 신규 함수 (800줄 정책 → 분리)

`lib/tax-engine/property-tax-housing-cap.ts` 신규 (현 property-tax.ts 791줄):

```typescript
export function applyHousingTransitionalCap(
  calculatedTax: number,
  publishedPrice: number,
  taxYear: number,
  previousYearHousingBaseTax?: number,
): HousingCapResult {
  // G2: taxYear > 2028 → 만료, 미적용 + warning
  // G3: previousYearHousingBaseTax == null → 미적용 + warning
  // capRate = resolveHousingCapRate(publishedPrice)  // 105/110/130
  // capLimit = applyRate(previousYearHousingBaseTax, capRate)  // floor
  // determinedTax = Math.min(calculatedTax, capLimit)
}

function resolveHousingCapRate(publishedPrice: number): number {
  // <=3억 → 1.05, <=6억 → 1.10, else → 1.30 (기존 HOUSING_TAX_CAP_* 상수 사용)
}
```

> **single-source(H2)**: 구간 판정은 종부세 `getHousingTaxCapPct`(comprehensive-prior-year.ts:206)와 **동일 상수**(`HOUSING_TAX_CAP_BRACKET_1/2`·`PCT_1/2/3`)를 공유한다. 단 `getHousingTaxCapPct`는 `assessmentYear ≥ 2024`이면 `null`(폐지)을 반환해 **부칙 제15조 미반영** 상태라 v1에서 그대로 재사용 불가. v1은 재산세 전용 `resolveHousingCapRate`로 분리(2024~2028 구간율 반환), **상수만 공유**. v2에서 양 함수 통합(아래 §7).

### 4-3. 게이트 매트릭스 (전수 enumerate)

| G1 housing | G2 taxYear≤2028 | G3 직전본세 입력 | G4 taxYear≥2024 | 결과 |
|:---:|:---:|:---:|:---:|---|
| Y | Y | Y | Y | **상한 적용** (본래 대상) |
| Y | Y | N | Y | 미적용 + warning("직전본세 입력 시 상한 적용") |
| Y | N | - | - | 미적용 (2029~ 만료) |
| Y | - | - | N | 미적용 (2023↓, 현 엔진 범위 밖 — pass-through) |
| N | - | - | - | 비주택 기존 로직(150% 상한) 유지 |
| **종부세 내부 호출** | - | **N(입력 없음)** | - | **미적용** — `comprehensive-tax.ts`가 `calculatePropertyTax({objectType,publishedPrice,isOneHousehold,targetDate})`만 넘기고 `previousYearHousingBaseTax` 미전달 → G3 미충족 → `determinedTax` 불변 → **종부세 회귀 0** (C2 가드) |

- **신축 주택**(2024 이후 첫 과세): 직전본세 없음 → G3 미충족 → 자연 배제. 별도 플래그 불필요.
- **종부세 회귀 차단(C2)**: 게이트가 "`previousYearHousingBaseTax` 입력 시에만 적용"이므로, 종부세가 재산세공제 ⓐ를 위해 호출하는 `calculatePropertyTax`(입력 없음)는 영향받지 않는다. 종부세 측 주택 세부담상한은 별도 함수(`buildHousingPropertyTaxWithCap`)가 유지 — **v1은 종부세 코드 무변경**.

### 4-4. 산식

```
본세 산출세액  = calcHousingTax(effectiveTaxBase, publishedPrice, isOneHousehold)  [floor 완료]
상한 한도      = floor(previousYearHousingBaseTax × capRate)   [applyRate, §118]
결정 본세      = min(본세 산출세액, 상한 한도)
지방교육세     = determinedTax × 20%   [자동 연동 — calcSurtax 무변경]
```

### 4-5. result 필드

```typescript
// PropertyTaxResult — 기존 calculatedTaxBeforeCap/taxCapRate/determinedTax 재사용 + 신규:
housingTransitionalCap?: {
  applied: boolean;
  capRate: number;              // 1.05/1.10/1.30
  previousYearBaseTax: number;  // 입력값
  baseCapLimit: number;         // floor(직전×율)
  baseCalculatedTax: number;    // 상한 전 산출세액
  baseDeterminedTax: number;    // = determinedTax
  legalBasis: string;           // "지방세법 법률 제19230호 부칙 제15조"
};
```

### 4-6. 신규 상수

```typescript
// legal-codes/property.ts
// PROPERTY: TAX_CAP_TRANSITIONAL: "지방세법 법률 제19230호 부칙 제15조"
// PROPERTY_CONST: HOUSING_TAX_CAP_EXPIRY_YEAR: 2028
//                 (HOUSING_TAX_CAP_PCT_1/2/3, BRACKET_1/2, ABOLISHED_YEAR:2024 기존 존재)
```

---

## 5. 14지점 동기화

### 엔진/API 측
| 지점 | 파일 | 변경 |
|---|---|---|
| ①타입 input | `types/property.types.ts` | `previousYearHousingBaseTax?` 추가 |
| 타입 result | `types/property.types.ts` | `housingTransitionalCap?` 추가 |
| ⑨⑫ Zod | `validators/property-input.ts` | `previousYearHousingBaseTax` z.number().int().nonneg().optional() + superRefine housing 게이트 |
| ⑭ Route | `app/api/calc/property/route.ts` | `parsed.data as PropertyTaxInput` 자동 반영(타입 일치) |
| 엔진 분기 | `property-tax.ts` Step3 | housing+2024≤year≤2028 분기 → `applyHousingTransitionalCap()` 호출 |

### 클라이언트 측
| 지점 | 파일 | 변경 |
|---|---|---|
| ① FormState | `components/calc/property/shared.ts` | `housingPreviousYearTax: string` (+ 노출제어 토글 `housingTaxCapEnabled: boolean`) |
| ② initial | `INITIAL_FORM` | `""` / `false` |
| ③ normalize | shared.ts / migration | `?? ""` / `?? false` |
| ④ API 변환 | `buildPropertyTaxRequestBody()` shared.ts:360 | housing+토글 ON+입력 시 `previousYearHousingBaseTax: parseAmount(...)` 전송 |
| ⑤ UI 위젯 | `Step3.tsx:14-32` | housing 분기를 ToggleCard + CurrencyInput(직전 본세)로 교체. 공시구간 105/110/130 자동 안내 칩 |
| ⑥ 사이드바 | — | `totalPayable` 재사용, 변경 불필요 |
| ⑦ 결과 카드 | `PropertyTaxResultView.tsx:480-515` | `housingTransitionalCap.applied` 시 "산출 266,072 → 직전본세×110% 236,830 → 확정" 흐름 표시 |
| ⑧ validation | `validateStep()` shared.ts:239 | housing+토글 ON+본세 미입력 → 차단(자동 안분 fallback 금지). OFF → 미차단·미전송(④와 정합) |

---

## 6. anchor 테스트 계획

`__tests__/tax-engine/property/housing-transitional-cap.test.ts` (toBe 고정):

- **TC-1** 2025 본세: `determinedTax` `toBe(236_830)`, `housingTransitionalCap.capRate` `toBe(1.10)`, `baseCapLimit` `toBe(236_830)`, `baseCalculatedTax` `toBe(266_072)`
- **TC-2** 2024 본세: 직전 195,700×1.1=215,270 → `toBe(215_270)`
- **TC-3** 직전본세 미입력 → `determinedTax` `toBe(266_072)`, `housingTransitionalCap` `toBeUndefined()`, warning 포함
- **TC-4** 공시 3억↓ → capRate `toBe(1.05)`
- **TC-5** 공시 6억↑ → capRate `toBe(1.30)`
- **TC-6** taxYear=2029 → 만료, 미적용 + warning
- **TC-7** taxYear=2023 → pass-through (기존 동작)
- **TC-8** 비주택 회귀 → 기존 150% 상한 유지
- **TC-9 (종부세 회귀 가드, C2)** `calculatePropertyTax({objectType:"housing", publishedPrice:223_036_000, isOneHousehold:true, targetDate:"2025-06-01"})` — `previousYearHousingBaseTax` **미전달** → `determinedTax` `toBe(266_072)`(상한 미적용), `housingTransitionalCap` `toBeUndefined()`. 종부세 호출 경로 불변 보장.
- 주석: 실제 고지(236,800)와 30원 차이 = 역산·절사 누적오차

---

## 7. v1 Scope 제외 — 후속 과제

### 🔴 v2: 도시지역분 세부담상한·과세표준 차이
실측에서 도시지역분(§112①2호)이 **재산세 본세와 다른 과세표준으로 산정**됨을 발견:

| 연도 | 도시지역분 | ÷0.0014 = 도시 과표 | 재산세 과표 | 비율 |
|---|---|---|---|---|
| 2023 | 259,880 | 185,628,571 | 187,880,000 | 0.988 |
| 2024 | 274,680 | 196,200,000 | 198,462,000 | 0.988 |
| 2025 | 302,480 | 216,057,143 | 223,036,000 | **0.969** |

- 도시지역분 실효세율이 0.14%가 아니라 약 0.1384%(2023·2024).
- **2024 도시지역분(274,680)이 산출액(277,847)보다 작은데 세부담상한 한도(285,868)에도 안 걸림** → 세부담상한으로 설명 불가.
- **원인: 도시지역분 과세표준 산정 자체의 별도 요인**(과세표준상한 별도 적용 등 의심).
- **선결 데이터**: 위택스/정부24의 본세·도시지역분 **분리 고지값** + 시행령 §112 도시지역분 과세표준 산정 추가 분석.
- v1에서는 도시지역분 현행 유지(상한 미적용) → 앱 312,250 vs 실제 302,480 차이(연 9,770원) 잔존. **계획서·결과뷰에 명시**.

### 🔴 v2: 종부세 측 부칙 제15조 반영 + dual-truth 통합 (C1·M1)
종부세 엔진은 주택 세부담상한을 **이미 별도 보유**: `buildHousingPropertyTaxWithCap`(comprehensive-housing-tax-cap.ts:44)이 `getHousingTaxCapPct(assessmentYear, currentAssessedValue)`(comprehensive-prior-year.ts:206)로 ⓐ(재산세공제, §9③)에 105/110/130 상한 적용.
- **문제**: `getHousingTaxCapPct`가 `assessmentYear ≥ 2024`이면 `null` 반환 → **종부세도 부칙 제15조(2028까지) 미반영**. 2025년 종부세의 재산세공제 ⓐ가 상한 미적용 본세 기준으로 산정될 수 있음(정확도 갭).
- **v1 영향 없음**: 재산세 v1은 `getHousingTaxCapPct`·종부세 코드를 **건드리지 않음**(C2 가드). 종부세 anchor 회귀 0.
- **v2 통합**: `getHousingTaxCapPct`에 "2024 전 과세 이력" 입력을 추가해 2024~2028 구간율 반환하도록 부칙 반영 → 재산세 v1 함수와 단일화(single-source). 종부세 anchor 재검증 필수(HIGH 회귀 위험).

### 🟡 후속: 기타
- **법인 소유 주택 제외**(§122 단서): 엔진에 법인/개인 구분 필드 없음 → 인프라 선결 필요.
- **§118 4호 특례**: 직전 §111의2 특례 적용 주택이 당해 9억 초과로 특례 미적용 전환 시 직전 과세 세액 사용.
- **지역자원시설세 건물분 입력 누락**: `housingBuildingValue` 미입력 시 0(실제 40,480). 별도 UX 과제(건물분 시가표준액 입력 경로).

---

## 8. 미확정·리스크

| # | 항목 | 처리 |
|---|---|---|
| R-1 | 본세 30원 차이(236,830 vs 236,800) | 법령 산식 `Math.floor` 기준 anchor, 오차 주석. 절사 방식은 분리 고지값 확보 시 재검토 |
| R-2 | §118 직접입력 vs 재산정(recompute) | v1 직접입력 단일 모드(§118 단서 충실, 고지서 기준). recompute는 후속 |
| R-3 | 직전 본세 입력 UX 부담 | 토글 OFF 기본값, hint "전년도 고지서 '재산세' 금액(분납 시 합산)". 미입력 시 graceful(상한 미적용) |
| R-4 | 1세대1주택 특례 교차 | capRate는 공시가격 구간 기준이라 특례 여부 무관. 엔진 처리 |

---

## 9. 구현 단계 (Do)

1. `legal-codes/property.ts` — `TAX_CAP_TRANSITIONAL`, `HOUSING_TAX_CAP_EXPIRY_YEAR:2028` 추가
2. `types/property.types.ts` — input `previousYearHousingBaseTax?`, result `housingTransitionalCap?`
3. `property-tax-housing-cap.ts` 신규 — `applyHousingTransitionalCap()` + `resolveHousingCapRate()`
4. `property-tax.ts` Step3 — housing+2024≤year≤2028 분기 호출, legalBasis 추가
5. `validators/property-input.ts` — Zod 필드 + superRefine housing 게이트
6. `shared.ts` — FormState 필드 + INITIAL_FORM + normalize + buildPropertyTaxRequestBody 분기 + validateStep
7. `Step3.tsx` — housing 분기 ToggleCard + CurrencyInput 교체
8. `PropertyTaxResultView.tsx` — housingTransitionalCap 표시 블록
9. `__tests__/tax-engine/property/housing-transitional-cap.test.ts` — anchor 8케이스
10. 게이트: `npx tsc --noEmit` 0건 → `npx vitest run __tests__/tax-engine/property/` → 브라우저 E2E(토글 ON → 215,300 입력 → request body `previousYearHousingBaseTax` 확인 → 결과 236,830)

---

## 10. 완료 기준 (DoD)

- [ ] 본세 anchor 8케이스 통과 (2025=236,830)
- [ ] 14지점 동기화(엔진 5 + 클라 8, 도시지역분 제외)
- [ ] `tsc --noEmit` 0건 / 재산세 vitest 회귀 통과
- [ ] 결과뷰에 본세 세부담상한 흐름 + "도시지역분 상한 미반영(후속)" 안내
- [ ] 브라우저 수동 확인 (Network request body 신규 필드)
