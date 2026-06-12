# 종합부동산세 §8④ 1세대1주택자 의제 + 세액공제 안분 계획서 (comprehensive-tax-section8-4)

> 작성일: 2026-06-12 · worktree `comprehensive-tax-audit`
> 조사: comprehensive-tax-house-senior(KoreanLaw·사례집 재실측·코드) + comprehensive-tax-ui-senior(UI) 병렬 Plan
> 선행: special-cases Phase A·B·C 머지 완료 (PR#131 → #137 → #138)

---

## 1. 배경 · 범위

사례5(부부특례+지방저가)의 마지막 단계 — 고령자 공제 **15억/17억 안분(528,933) → 결정세액 969,711** — 가 §8④ 미구현으로 범위 외였다. 조사 결과 §8④ 의제 본체 외에 **기머지 엔진의 세액공제 적용 순서 버그(GAP-1)** 가 추가 발견됐다.

| ID | 항목 | 법령 | 성격 | 단계 |
|---|---|---|---|---|
| **GAP-1** | 세액공제 적용 순서 정정 — 재산세 안분 **후** 세액 기준 | §9⑤·⑥·⑦ | ★기머지 버그 (Critical) | Phase D-1 (독립 PR) |
| **GAP-2** | §8④ 의제 (부속토지·일시적 2주택·상속·지방저가) + §9⑦·⑨ 공시가 안분 | §8④·§8⑤·령 §4의2·§9⑦⑨ | 신규 기능 | Phase D-2 |
| **GAP-3** | 주택 수 제외 연동 (령 §4의3③3호 나·라·마목) | 령 §4의3③ | 신규 (D-2 포함) | Phase D-2 |

**범위 제외**: 령 §4의3③3호 **바목** 한시 특례(소형신축·준공후미분양·인구감소지역 2024.1.10~) — 주택 수 제외만 관련, §8④ 의제와 무관 (별도 후속). 합산배제(§8②)와의 교차는 현행 로직 유지.

## 2. 법령 근거 (KoreanLaw 실측 — 현행 MST 280417 / 시행령 MST 283639)

### 2-1. §8④ 각 호 (축자 확보)

| 호 | 유형 | 시행령 요건 (§4의2 실측) | 신청 (§8⑤) |
|---|---|---|---|
| 1호 | 1주택 + **다른 주택의 부속토지**(건물·토지 소유자 상이) | — | 불요 (당연 적용) |
| 2호 | **일시적 2주택** — 1주택 양도 전 대체취득 | 신규주택 취득일부터 **3년 이내** (령 §4의2①) | 9.16~9.30 신청 |
| 3호 | 1주택 + **상속주택** | 상속개시 **5년 미경과** OR 지분 **40% 이하** OR 지분 공시 **6억 이하**(수도권 외 3억) (령 §4의2②) | 신청 |
| 4호 | 1주택 + **지방 저가주택** | 공시 **4억 이하**(현행) AND 소재지 요건(수도권·광역시·특별자치시 외 / 광역시 군 / 세종 읍면 / 인구감소+접경) (령 §4의2③) | 신청 |

### 2-2. 세액공제 산식 — §9⑤·⑥·⑦·⑨ (축자 확보)

- **§9⑥ (고령자)·⑧ (장기보유)**: 공제액 = "**제1항·제3항 및 제4항에 따라 산출된 세액**"에 공제율 — **§9③이 재산세 공제 조항**이므로 공제 base는 **재산세 비율안분 공제 후 세액** (→ GAP-1).
- **§9⑦ (§8④ 해당 고령자)·⑨ (장기보유)**: 위 base에서 각 호 산출세액(부속토지분/신규주택분/상속주택분/지방저가주택분 — **공시가격합계액으로 안분**)을 **제외한 금액**에 공제율.
- 80% 캡(§9⑤ 후단): 안분 적용 후 합산 공제율에 적용 — `floor(base × ratio × min(senior+longTerm, 0.80))`.

### 2-3. 주택 수 제외 — 령 §4의3③3호 (기존 Phase 0에서 일부 실측, 재확인)

나목(상속주택 — §4의2② 동일 요건) · 다목(무허가 부속토지) · **라목(§8④2호 신규주택)** · **마목(§8④4호 지방저가)** → §9 세율 주택 수 계산에서 제외. ※ 현행 엔진 `isMultiHouseRate(year, includedCount, …)`의 `includedCount`는 합산배제(§8②)만 반영 — §4의3③ 제외 미반영 (GAP-3).

### 2-4. 사례 실측 (300dpi 재실측 — 원단위)

**사례4 (일시적 2주택 §8④2호, 2022)**: 공시 27억(18.1억+8.9억) → 공제 11억 → 과표 9.6억 → 산출 **8,520,000**(기존 YA-2 anchor) → ⓐ 5,220,000 · ⑤ 2,304,000 · ⑥ 5,850,000(27억×60%×0.4%−63만 — 합산 단일 누진 ⑥ 3차 증거) → 안분 공제 **2,055,877**(PDF) → 공제후 **6,464,123** = 결정세액 (세액공제 0%). ⚠️ 엔진 floor 계산 2,055,876 — **1원 차이** (R-1).

**사례5 (부부 §10의2 + 지방저가 §8④4호, 2022)**: 산출 2,280,000 → 안분 공제 781,356 → **1,498,644** → §9⑦ 공제 = floor(1,498,644 × **15억/17억** × 40%) = **528,933** → 결정 **969,711**. (검산 일치 ✓ — 공제 base가 재산세 공제 **후**·안분 분자가 지방저가 제외 1주택 공시)

## 3. 갭 상세 · 현행 코드 실측

### GAP-1 — 세액공제 순서 (★기머지 버그, 법령 §9⑥ 축자 + 사례5 명시 2중 실증)

- 현행: Step 6 세액공제(`comprehensive-tax.ts:269~290`, base = `calculatedTax` 안분 전) → Step 7 재산세 안분(`:292~326`, 상한 = `taxAfterOneHouseDeduction`).
- 법령: 재산세 공제(§9③) **선적용** → 그 후 세액에 공제율(§9⑥⑧).
- 영향: 세액공제 적용 케이스 전부 **과다 공제**(현행이 납세자 유리 방향 오류). 기존 anchor 중 **SC-C1만** 영향 — 실측 근거: `comprehensive-tax-integration.test.ts`의 birthDate 케이스 2건(SC1 9억 비과세·SC2 15억)은 공제율·`isMaxCapApplied`·부등식 단언만이라 무영향, `deductionAmount` 원단위 단언은 SC-C1(`special-cases.test.ts:212`) 1건. **720,000 → 374,400 재산정** (memory `feedback_anchor_correction_legal_priority`). 검산: 15억 1채 → 재산세 공제 432,000 → base 468,000 × 80% = 374,400 → 결정 93,600.
- 변경: Step 6 ↔ 7 순서 교환 + `applyOneHouseDeduction` 첫 인자 = `taxAfterPropertyCredit` + `calculatePropertyTaxCreditProration` 상한 인자 = `calculatedTax` + **부수 갱신**: integration SC2 주석 "(재산세 안분 공제 전 단계)" 구식화 정정 · 결과뷰 `HousingTaxSection` 행 순서를 새 계산 순서(안분 → 세액공제)에 맞춰 재배치 (계산 순서 = UI 순서 정책).

### GAP-2 — §8④ 의제 + §9⑦⑨ 안분 (미구현)

- `ComprehensiveProperty`(`types/comprehensive.types.ts:164~172`)에 특례 유형 필드 없음 — 어느 주택이 특례주택인지 지정 불가.
- `applyOneHouseDeduction`(`comprehensive-tax-helpers.ts:61~80`) — 안분 파라미터 없음.
- 안분 산식(사례5 역산 확정): `공제 = floor(base × (1주택 공시 / 전체 공시) × min(공제율 합, 0.8))`. 분자 "1주택 공시" = 합산배제 후 공시 합산 − §8④ 특례주택(none 제외) 공시 합산.

### GAP-3 — 주택 수 제외 연동

`section8para4Type`이 **2호(라목)·3호(나목)·4호(마목)** 인 주택은 `isMultiHouseRate` 판정용 count에서 제외 (령 §4의3③3호). ★**1호 부속토지는 제외 근거 없음** (STEP 1 검토 #1 — 다목은 "무허가 건축물 부속토지" 전용 축자 확인): 1호는 세율 주택 수에 **포함**하되 §9⑦**1호**의 공제 안분 제외만 적용 (R-8에서 실무 재확인). 기본공제·과세표준 합산에는 전 유형 **포함** (의제는 "1세대1주택자로 본다"일 뿐 합산 과세 유지 — 사례4·5 정합).

## 4. 엔진 설계 초안

### 4-1. 타입

```ts
export type Section8Para4Type =
  | "none"                  // 기본 (의제 없음)
  | "appurtenant_land_only" // §8④1호 부속토지 (신청 불요)
  | "temporary_two_house"   // §8④2호 일시적 2주택
  | "inherited_house"       // §8④3호 상속주택
  | "regional_low_price";   // §8④4호 지방 저가주택

interface ComprehensiveProperty {
  // ... 기존 ...
  section8para4Type?: Section8Para4Type;  // 미입력 = "none" (per-property 특례주택 지정)
}

interface ComprehensiveTaxResult {
  // ... 기존 ...
  /** §8④ 의제 적용 echo — 유형·안분 비율(1주택 공시/전체)·제외 공시 합계 (결과뷰 산식 표시용) */
  section8para4Detail?: {
    appliedTypes: Section8Para4Type[];
    mainHouseAssessedValue: number;
    excludedAssessedValue: number;
  };
}
```

> 설계 단계 결정: 유형별 요건(신규주택 취득일·상속개시일·지분율)을 엔진이 **검증**할지(차단) UI 안내만 할지 — 지방저가 공시 기준액이 연도별로 다를 수 있어(R-2) 1차는 **UI 검증(⑧ Zod) + 엔진은 신뢰 입력**, 요건 자동 판정은 후속.

### 4-2. oneHouseTreatment 확장 (엔진 단일 진실 — UI/API 파생 금지)

```ts
const hasSection8para4 = input.properties.some(
  (p) => (p.section8para4Type ?? "none") !== "none" && !isExcluded(p));
const oneHouseTreatment = !isCorporate &&
  (input.isOneHouseOwner || isJointApplied || hasSection8para4);
```

UI 시니어 안 C의 "API ④에서 isOneHouseOwner=true 파생"은 **채택하지 않음** — 파생은 엔진 1곳(단일 진실)에서. API는 입력 그대로 전달. (사례5 = §10의2 + §8④4호 **동시 적용** 조합이 자연스럽게 성립 — isJointApplied ∥ hasSection8para4.)

### 4-3. Step 순서 교환 + 안분 (GAP-1·2)

```
Step 5 산출세액 → Step 6 재산세 비율안분 공제(상한 = calculatedTax) → taxAfterPropertyCredit
→ Step 7 1세대1주택 세액공제: applyOneHouseDeduction(
    taxAfterPropertyCredit, birthDate, acquisitionDate, assessmentDate,
    apportionment?: { mainHouseAssessedValue, totalAssessedValue }  // §8④ 시만
  )  // 내부: floor(base × main/total × min(합산율, 0.8)) — 분수 정수 주의 (main/total 곱은 safeMultiplyThenDivide)
→ Step 8 상한 (무변경)
```

`mainHouseAssessedValue = includedAssessedValue − Σ(특례주택 공시)`. §8④ 미해당(순수 1주택·부부특례)은 apportionment 생략(비율 1).

### 4-4. 주택 수 제외 (GAP-3) — 이원화 (13단계 STEP 6 #5 정정)

령 §4의3③3호 축자: **라목(2호 신규)·마목(4호 지방저가)은 "§8④…에 따라 1세대 1주택자로 보는 자가 소유한" 주택 한정** — 의제 성립 시만 제외. **나목(상속주택)은 전제 없음** — 무조건 제외. `rateHouseCount = includedCount − 상속주택 수 − (의제 성립 시 2·4호 수)`. 1호(부속토지)는 차감하지 않음 (R-8). 의제 성립 조건: 일반주택(none) **정확히 1채** + 특례주택 ≥ 1 (§8④ 본문 "1주택과 … 함께 소유" — 지정만으로 의제 금지, 미성립 시 경고). 법인 가/나목 판정도 동일 count.

### 4-5. 하위호환

신규 필드 optional·"none" 기본 → 기존 anchor 영향은 **SC-C1 1건만** (GAP-1 법령 재산정 — §3 참조). 그 외 anchor(birthDate 미입력)는 무변경. E2E CPT-E2E-2(공제 표시)는 표시 검증이라 통과 예상 — Phase D-1에서 실측.

## 5. UI 설계 초안 (안 C 변형 — 파생은 엔진)

- **Step2 PropertyListInput 주택 카드**: "§8④ 1세대1주택자 의제 특례" ToggleCard(violet) → ON 시 유형 RadioCardGroup 4종 + 유형별 조건부 입력: 2호 → 신규주택 취득일 DateInput / 3호 → 상속개시일 DateInput + 지분율 DecimalInput / 4호 → 추가 입력 없음(기존 `location`·`assessedValue` 재사용, ⑧에서 요건 검증) / 1호 → 안내만.
- **Step1 관계**: §8④ 지정 주택이 있으면 1세대1주택 ToggleCard에 안내("§8④ 특례 지정됨 — 자동으로 1세대1주택자 계산") — disabled 처리 여부는 디자인 단계 확정. 부부 §10의2와는 **동시 가능** (사례5).
- **⑦ 결과뷰**: 공제 breakdown에 안분 행 추가 — "1주택분 안분 (15억 ÷ 17억)" + §8④ 유형 배지. `section8para4Detail` echo 사용 (UI 재계산 금지 — dual-truth).
- **⑧**: 4호 지정 시 `location === "non_metro"` + 공시 기준액 이하 검증(기준액은 R-2 확정 후 — 연도별 상수) / 3호 지분율 0~100. UI 차단 ↔ Zod 동기.
- **14지점**: per-property 신규 4필드(`section8para4Type`·`newHouseAcquisitionDate`·`inheritanceOpenDate`·`inheritanceShareRatio`) — ①~③ store PropertyEntry · ④⑬ api.ts property 변환 · ⑤ PropertyListInput · ⑦ 결과뷰 · ⑧⑨⑫ Zod property 스키마 · ⑭ route 주택 변환 블록(**Date 변환 포함** — `lib/api/date-coerce.ts`).

## 6. Phase 계획

### Phase 0 — Pre-Do 잔여 확인 (게이트)

1. **R-1 사례4 1원 차이**: PDF 2,055,877 vs 엔진 floor 2,055,876 — ⓐ(5,220,000) 구성 행별 재실측로 원인 확정(반올림 vs ⓐ 차이). anchor는 법령 floor 원칙 우선이되 ⓐ 검증 후 확정.
2. **R-2 지방저가 공시 기준액 연혁**: 현행 령 §4의2③ = 4억 — 2022 당시 3억 추정(사례5 세종 2억은 양쪽 충족이라 미판별). `applicable_law`(시행령, 2022-06-01)로 축자 → 연도별 상수(⑧ 검증용).
3. **R-3 2022 구법 §8④ 호 구조**: 부칙 §18977(2022.9.15 — "시행일이 속하는 연도분부터") 적용으로 2022년분 적용은 사례집이 실증. 구법 호 번호가 현행과 다를 가능성(일시적 2주택이 2호 vs 3호 — 시니어 보고 내 표기 혼재) → 축자로 호 매핑 확정 (엔진 enum은 유형 기반이라 영향 없음, 주석·라벨 정확성).
4. **R-8 §8④1호 부속토지 세율 주택 수**: 령 §4의3③ 제외 근거 부재(다목=무허가 전용) → "포함" 설계의 실무 재확인 — 국세청 해석례·신고서 작성방법(pdf38) 주택 수 기재 요령 재독.
5. Pre-Do anchor 선작성·실패 확보: GAP-1(YA-new-3 374,400 — 현행 720,000과 불일치 실증)·사례5 full(969,711).

### Phase D-1 — GAP-1 세액공제 순서 정정 (독립 PR — §8④ 없이도 성립하는 법령 버그)

Step 6↔7 교환 + `applyOneHouseDeduction` base 변경 + SC-C1 재산정(374,400) + anchor: 순수 1주택 직접 산식 + 사례5 부분(1,498,644 기준 공제 — 안분 없는 §10의2 단독 케이스 직접 산식). 전체 회귀 + CPT-E2E-2 실측.

### Phase D-2 — §8④ 의제 + §9⑦⑨ 안분 + 주택 수 제외 (PR)

타입·엔진(§4-2~4-4)·UI(§5)·14지점·E2E. anchor: **사례5 full 결정세액 969,711**(D2-1 — §10의2+§8④4호 복합) · **사례4 결정세액 6,464,12X**(D2-2 — 일시적 2주택, R-1 확정값) · 상속주택 직접 산식(D2-3 — 사례집 부재) · 주택 수 제외 검증 **이원화**: 상속(나목 무전제 — 일반 2주택+상속 3주택 → 중과 아님, D2-4) / 라·마목(의제 성립 시 — D2-4b. ※ "지방저가 포함 3주택 중과 배제"는 마목 전제상 **성립 불가** — 13단계 STEP 6 #5).

## 7. 리스크 · 확인 필요

| # | 항목 | 처리 |
|---|---|---|
| R-1 ✅ | 사례4 안분 공제 1원 차이 | **해소**: ⓐ5,220,000·⑤2,304,000·⑥5,850,000 → floor 2,055,876(PDF 2,055,877은 반올림)·결정 6,464,124. 법령 floor 채택 |
| R-2 ✅ | 지방저가 공시 기준액 연도별 | **해소(부분)**: 현행 §4의2③1호=4억(KoreanLaw 축자). 2022 금액은 historical MST fetch 불가 → 추정 금지: **Zod ⑧는 location(비수도권)만 차단**, 금액은 엔진 신뢰 입력+UI 안내(연도 자동판정 후속) |
| R-3 ✅ | 2022 구법 §8④ 호 매핑 | **해소**: 시행령 §4의2 ①2호·②3호·③4호 — 2022.9~현행 안정(라벨·주석용) |
| R-4 | GAP-1이 §10의2 단독(Phase C 기머지)에도 영향 — SC-C1 재산정 | 법령 정합 재산정 (memory anchor_correction_legal_priority) |
| R-5 | §9⑦1호 부속토지 안분 — 사례집 사례 부재 | 직접 산식 anchor, 후순위 |
| R-6 | §8④ 다중 지정(예: 상속+지방저가 동시 보유) 시 안분 분자 | 산식상 Σ 제외 — 직접 산식 anchor로 고정. 법문 "각 호의 어느 하나" 복수 적용 가능 여부 디자인 단계 축자 재확인 |
| R-7 | PropertyListInput 800줄 근접 여부 | 실측 253줄 — 여유. 초과 시 카드 분리 |
| R-8 ✅ | §8④1호 부속토지의 세율 주택 수 포함 여부 | **해소**: §4의3③3호 다목 = "무허가·무권원 건축 부속토지" 전용(KoreanLaw 축자) → §8④1호 일반 부속토지 제외 근거 부재 → **포함** |
| R-9 ✅ | 법인 × 령 §4의3③ 주택 수 제외 적용 여부 | **해소**: 라·마목 "1세대1주택자로 보는 자"(개인 의제) 한정 → 법인 의제 불가 → 법인은 §8④ 기반 제외 **미적용**(gate `!isCorporate`) |

## 8. 완료 기준 (DoD) — ✅ 전부 충족 (2026-06-12)

- [x] Phase 0 게이트 (R-1·R-2·R-3·R-8·R-9 KoreanLaw 축자 + Pre-Do anchor 구현후 probe 실증)
- [x] Phase D-1: SC-C1 재산정(374,400/93,600 — plan 정확, Phase 0 수기 576,000은 오류·probe로 정정) + integration SC2 주석 + 결과뷰 행 순서 + 전체 회귀
- [x] Phase D-2: 사례4 **6,464,124**(R-1 floor) · 사례5 **969,711** 원단위 + D2-1~D2-8 anchor + 주택 수 제외 이원화(나목 무전제·라마목 의제) + 14지점 + E2E (CPT-S8 3건 + 기존 12 회귀)
- [x] tsc 0 · 800줄 준수 (최대 PropertyListInput 364·결과뷰 668) · Playwright E2E 15/15 green
- [x] 메모리·계획서 환류 (GAP-1은 기머지 버그 — 커밋 메시지·메모리 별도 명기. 단일 응답 완주로 D-1·D-2 동일 커밋, 독립 PR 대신 별도 명기로 충족)

> **Do 환류**: D-2 §8④4호 Zod ⑧은 **location(비수도권)만 차단**으로 deviation (R-2 — 2022 기준액 축자 불가). 금액은 엔진 신뢰 입력 + UI 안내(현행 4억). GAP-1 SC-C1 정확값은 plan/design의 374,400/93,600이 옳았음(creditRaw 432,000이 구 코드선 세액공제 후 잔액 180,000으로 capped됐던 것).
