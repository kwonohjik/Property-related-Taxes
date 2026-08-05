# 장기임대주택 양도소득세 감면 (조특법 §97 시리즈) 구현 계획서

> **상태**: ✅ **구현 완료** (PR#119 · 2026-06-11) — 2026-08-04 코드 실측 · 2026-08-05 인용 PR·커밋 재검증(종전 헤더는 stale이었음).
> ~~종전 표기: Plan (Do 미착수)~~
> **작성일**: 2026-06-11
> **작성**: long-term-rental-tax-senior (엔진) + transfer-tax-ui-senior (UI) 병렬 Plan, 오케스트레이터 통합
> **선행 문서**: `docs/00-pm/transfer-reduction-expansion.plan.md` §3.1 · `docs/02-design/features/transfer-reduction-mapping-audit.md` §4.1
> **검증 표기**: ✅ = KoreanLaw MCP 원문 검증 완료 / ⚠️ = 확인 필요 (추정 단정 금지)

---

## 1. 배경 — 현행 3경로 공존 (전부 실측 확인)

| 경로 | 위치 | 상태 | 문제 |
|---|---|---|---|
| **A. 단순 경로** (UI 유일 실경로) | Step5 `long_term_rental`(rentalYears·rentIncreaseRate) → `lib/calc/transfer-tax-api-helpers.ts:424` → `lib/tax-engine/transfer-tax-rate-calc.ts:571` | 동작 중 | `rentalYears≥8 && 인상률≤5% → 산출세액×50%`. §97의3 효과는 **장특공제율 특례**인데 세액감면으로 처리 — **산식 범주 오류 (D-4)** |
| **B. 정밀 경로** (dead path) | `lib/tax-engine/rental-housing-reduction.ts`(529줄) `calculateRentalReduction`·`getLongTermDeductionOverride` — `rate-calc.ts:462`·`transfer-tax-helpers.ts:520`에 배선 | UI 도달 불가 | `rentalReductionDetails`를 UI/API 변환에서 생성하는 곳 **0건** (전 코드베이스 grep). 유형 매핑·§133 한도도 법령과 불일치 (D-1·D-2·D-3) |
| **C. 신규 라우터** (Phase 1 stub) | `lib/tax-engine/transfer-reductions/` — metadata 6개 ID + period-check 시한검증 | stub | `evaluateReduction` 전부 `isEligible:false`. §99의3만 완전 구현(`new-99-3.ts`) — 확장 템플릿 |

UI 라벨 드리프트: Step5 REDUCTION_LABELS desc는 "§97의3 → 장특공제율 70%"인데 엔진 A경로는 세액 50% 감면.

---

## 2. 법령 원문 검증 결과 (KoreanLaw MCP, 2026-06-11 현행)

### 2.1 조문별 요건·효과 확정표

| 조문 | 요건 (✅ 원문 확정) | 효과 | 시한 | 중복배제 |
|---|---|---|---|---|
| **§97① 본문** ✅ | 1986.1.1~2000.12.31 신축 국민주택(또는 1985.12.31 이전 신축·1986.1.1 미입주 공동주택)을 2000.12.31 이전 임대개시, **5년+ 임대** | **산출세액 50% 감면** | 임대개시 ~2000.12.31 | §127⑦ |
| **§97① 단서** ✅ | (a) 건설임대 5년+ (b) 매입임대 5년+ (1995.1.1 이후 취득·취득 시 미입주) (c) 10년+ 임대 | **양도소득세 면제 (100%)** | 동일 | §127⑦ |
| **§97②** ✅ | 위 임대주택은 소법 §89①3호 적용 시 소유주택 비포함 | 주택수 제외 | — | — |
| **§97의2** ✅ | 건설임대 1999.8.20~2001.12.31 신축 / 매입임대 동기간 **매매계약+계약금 지급**·취득 시 미입주, 5년+ 임대 | 양도소득세 면제 (100%) — ⚠️ F-1: 세액 기준인지 소득금액 기준인지 시행령·집행기준 확인 필요 | 1999.8.20~2001.12.31 | §127⑦ |
| **§97의3** ✅ | 공공지원민간·장기일반민간임대 **2027.12.31까지 등록** + **10년+ 계속 임대** + 임대료 증액 제한(령 위임). 2020.7.11 이후 단기→장기 변경분 제외. ⚠️ R-5: 임대개시일 기준시가 6억/3억 요건 존재·범위 별도 확인 | **장특공제율 70%** (§95① 공제율 대체 — 세액감면 아님) | 등록 ~2027.12.31 | **§97의3② — §97의4와 중복 불가** |
| **§97의4** ✅(본문) | 민간건설·민간매입·공공건설·공공매입임대(령 §167의3①2호가·다목)를 **6년+ 임대** | **장특공제 추가율 가산** (§95①② 공제율 + 추가율). ⚠️ R-3: 추가율 표 수치(6~7년 2% … 10년+ 10%)는 API 응답에 표 누락 — 원문 직접 대조 필요 | 2014.1.1~ 등록 | §97의3②와 연동 |
| **§97의5** ✅ | **2018.12.31까지 취득**(매매계약+계약금 포함) + **취득일부터 3개월 내 등록** + **10년+ 계속 임대** + §97의3①2호 임대료 요건 | **임대기간 중 발생 양도소득 산출세액 100% 감면** | ~2018.12.31 | **§97의5② — §97의3·§97의4와 중복 불가** |

### 2.2 횡단 발견 (프로젝트 전반 영향)

1. **§127⑦ vs §127②** ✅: 양도세 감면 중복배제("둘 이상 감면 동시 적용 시 하나만 선택")는 **§127⑦**. 현행 코드 주석·CLAUDE.md·메모리에 "§127②"로 기재 — 기능(후보 max 패턴)은 법령 취지와 일치, **조문 인용만 정정 대상** (D-7).
2. **§133 종합한도 비대상** ✅: §133①은 §33·§43·§66~§70·§85의10 등을 열거 — **§97 시리즈 미열거**. 레거시 `applyAnnualLimit`("1억+초과분 50%")은 **법령 근거 없음** (D-3). `aggregate-reduction-limits.ts`의 rental 미포함이 정합 상태.
3. **8년 50% 경과규정** ⚠️ R-1: 현행 §97의3 원문은 10년 70% 단일. 레거시의 8년 50%는 2018 개정 전 구법 — 부칙 경과규정 존속 여부 KoreanLaw 부칙 조회로 미확정. **Phase 2 착수 전 확정 필수**.
4. **§97의5 85㎡ 요건** ⚠️ R-2: 본조 원문에 없음 — 시행령 위임 확인 필요.

### 2.3 드리프트 확정 목록

| # | 위치 | 내용 | 심각도 |
|---|---|---|---|
| D-1 | `rental-housing-reduction.ts` `public_construction` | §97을 "5년·100%"로 오매핑 — 본문 50%/단서 100% 미분리, 유형명도 오분류 | 고 |
| D-2 | 동파일 `public_purchase` (`rental-housing-reduction.ts:286`) | §97의5를 **의무 0년**으로 처리 — 실제 10년+ | 고 |
| D-3 | 동파일 `applyAnnualLimit` | §97 시리즈에 §133 한도 적용 — 법령 근거 없음 | 중 |
| D-4 | `transfer-tax-rate-calc.ts:571` | §97의3을 산출세액×50%로 처리 — 장특공제율 특례와 범주 자체가 다름. **UI 실경로라 최고 심각도** | 최고 |
| D-5 | 동파일 8년 50% 분기 | 경과규정 부칙 존속 미확정 | ⚠️ R-1 |
| D-6 | `RentalHousingType` 4유형 | 실제 6개 조문과 1:1 비대응 | 고 |
| D-7 | 전 코드·문서 "§127②" | 실제 §127⑦ | 저 (인용만) |
| D-8 | Step5 라벨 ↔ 엔진 산식 | 라벨 "장특 70%" vs 산식 세액 50% | 고 |
| D-9 | §97의5 85㎡ | 시행령 미확인 | ⚠️ R-2 |

---

## 3. 통합 전략 (권고안)

**신규 라우터(C) 중심 + 정밀 엔진(B) 순수 헬퍼만 분해 이식 + 단순 경로(A) 경과 유지 후 제거.**

- C는 23개 ID 체계·metadata·period-check·§99의3 완전구현 패턴이 정비된 확장 표준.
- B 전체 재활용은 D-1·D-2·D-3 오류 전파 위험 — `calculateEffectiveRentalPeriod`(공실 180일 차감)·`validateRentIncrease`(5% 검증)·`convertToStandardDeposit`(전월세 환산)만 이식.
- A는 신규 경로 연결 완성 전 제거 시 기존 사용자 계산 0원 회귀 — **Phase 3 완료 후 플래그 분기, Phase 4 완료 후 최종 제거** (R-4).
- 레거시 `long_term_rental` 이력: `reductionTypeLabel` alias 보존(표시 호환), 재계산 시 신규 입력 유도 안내.

---

## 4. 엔진 계획

### 4.1 모듈 구조 (`transfer-reductions/` 하위, 800줄 정책)

```
transfer-reductions/
├── rental-97-shared-helpers.ts   [신규] 유효임대기간·임대료검증·전월세환산 (B에서 이식, ~150줄)
├── rental-97-main.ts             [신규] §97① 본문 50% + 단서 100% — evaluateRental97Main
├── rental-97-2.ts                [신규] §97의2 100% — evaluateRental972
├── rental-97-3.ts                [신규] §97의3 장특 70% — evaluateRental973 (핵심)
├── rental-97-4.ts                [신규] §97의4 장특 추가율 — evaluateRental974
├── rental-97-5.ts                [신규] §97의5 세액 100% — evaluateRental975
├── index.ts                      (기존) switch 분기 추가
├── metadata.ts                   (기존) isFullyImplemented 갱신 + **rental_97_4.effectCategory 정정** (metadata.ts:119 — 현행 "long_term_holding_special" → "long_term_holding_additional")
├── period-check.ts               (기존) 경과규정 날짜 보완
└── types.ts                      (기존) effectCategory 확장
```

**effectCategory union 확장 위치**: `lib/tax-engine/legal-codes/transfer.ts:560` `ReductionEffectCategory` — `"long_term_holding_additional"` 멤버 추가 (metadata·결과 타입·UI 분기 공통 사용).

### 4.2 결과 타입 골격 (effectCategory별 분리)

```typescript
interface RentalLthdResult {       // §97의3·§97의4 — 장특공제 영향
  effectCategory: "long_term_holding_special" | "long_term_holding_additional";
  overrideRate?: number;           // §97의3: 0.70 (대체)
  additionalRate?: number;         // §97의4: 0.02~0.10 (가산)
  eligibleRentalYears: number;
}
interface RentalTaxAmountResult {  // §97 본문/단서·§97의2·§97의5 — 산출세액 영향
  effectCategory: "tax_amount";
  reductionRate: number;           // 0.5 | 1.0
  reductionAmount: number;         // 원 절사
  isFullExemption: boolean;
}
```

### 4.3 적용 지점 (file:line 실확인)

| 효과 범주 | 통합 지점 |
|---|---|
| 장특 override (§97의3) | `transfer-tax-helpers.ts:519` L-1c 블록 — 데이터 소스를 `rentalReductionDetails` → 신규 evaluator 결과로 교체. `calcLongTermHoldingDeduction`에 `rentalLthdOverride?` 매개변수 추가 |
| 장특 추가율 (§97의4) | `transfer-tax-helpers.ts:540` `rateForYears` 반환값에 `Math.min(holdingRate + additionalRate, 상한)` 가산. §95① 단서(미등기 등) 배제 반영 |
| 세액감면 (§97·§97의2·§97의5) | `transfer-tax-rate-calc.ts` `calcReductions` candidates 배열 push (R-2-V2 블록 `rate-calc.ts:460` 패턴) |
| 단순 경로 제거 | `rate-calc.ts:571` — R-4 시점에 제거 |

### 4.4 중복배제 매트릭스

| 조합 | 가부 | 근거 |
|---|---|---|
| §97의3 ↔ §97의4 | 불가 | §97의3② ✅ |
| §97의3·§97의4 ↔ §97의5 | 불가 | §97의5② ✅ |
| §97 본문/단서·§97의2·§97의5(세액감면) ↔ §69 자경·§77 수용 등 | 선택 1건 | §127⑦ ✅ |
| §97의3·§97의4(과세특례) ↔ §69 자경 등 카테고리 간 | ⚠️ F-2 미확정 | §127⑦ "감면규정" 범위 여부 — v1은 동시 선택 시 경고 표시 |
| 장특특례(§97의3·4) ↔ 세액감면 — 엔진 단계가 달라(STEP 4 vs STEP 7) max 패턴 부적용 | — | **UI 라디오 단일 선택 강제로 v1 해결** (기존 `toggleGroupRadio` 재사용) |

### 4.5 §133 한도

신규 구현에서 **§97 시리즈에 §133 한도 미적용** (✅ 비열거 확정). 레거시 `applyAnnualLimit` 이식하지 않음. `aggregate-reduction-limits.ts`·인별 5년 이력(priorReductionUsage)도 rental 미포함 유지.

---

## 5. UI 계획

### 5.1 입력 흐름 — 인터뷰식 선처리 + 직접 선택 혼합 (권고)

rental 펼침 헤더 상단에 지역 상태(useState) 질문 2개(등록 시점·임대 유형) → 시한 불일치 항목 강조 disabled → 라디오 직접 선택은 계속 지원. store 미저장(미러링 금지 정책 부합).

### 5.2 AssetReductionForm 신규 variant (① 지점)

`rental_97_3` / `rental_97_4` / `rental_97_5` / `rental_97_main`·`rental_97_proviso` / `rental_97_2` 5개 variant 신설 (`lib/stores/calc-wizard-asset-reduction.ts`). 기존 `long_term_rental` variant는 **deprecation alias로 보존** (자동 변환 금지 — 엔진 경로가 다름). 공통 필드: `registrationDate`(**명명 통일** — 엔진 `PeriodCheckContext.registrationDate`와 동일 키, `rentalRegistrationDate` 금지)·`isTaxRegistered`·`rentalStartDate`·`officialPriceAtStart`·`region`·`rentalHousingType`·`propertyType`. 조문 특화: §97의5 `exclusiveAreaSqm`(DecimalInput)·3개월 등록 자동 검증, §97 `constructionYear`·`isNationalHousing`(국민주택 확인 토글)·`provisoCase`(a/b/c), §97의2는 자산-수준 `assetContractDate` 재사용.

### 5.3 rentHistory·vacancyPeriods — 2단계 간소화 (권고)

- **간소화 모드(기본)**: "임대료 5% 위반 이력 있습니까?" `rentIncreaseViolationMode: "none" | "has_violation"` 명시 선택 강제(자동 안분 fallback 금지 정합). "없음" → 엔진에 `rentHistory: []`.
- **정밀 모드(위반 있음 시 필수)**: 계약별 [계약일·유형(전세/월세/반전세)·월세·보증금] 행 추가 입력.
- 공실도 동일: "6개월+ 공실 있습니까?" 토글 → 있으면 DateInput 쌍 구간 입력.

### 5.4 UnifiedReductionPanel rental 그룹

§99의3 `New993InputForm` 패턴(`UnifiedReductionPanel.tsx:393` 정의·372 사용) 차용 — violet ToggleCard + children 펼침 폼. §97의3 폼은 다-섹션 색상 카드+번호 패턴 강제: ①등록·신분(violet) ②임대 개시(violet — 기준시가 hint는 ⚠️ R-5 확정 후 기재) ③임대료 검증(violet) ④공실(sky) + 경과규정 버전·의무기간 자동 표시 박스(emerald, useMemo 파생). 상세 와이어프레임은 Design 단계 `{feature}.ui.design.md`로 이관.

### 5.5 결과 표시

- §97의3·§97의4: 세액감면 행이 아니라 **장특공제 행**에 "(§97의3 특례율 70% 적용)" 라벨. `RentalReductionDetailCard.tsx:147`의 `specialLongTermDeductionRate` 표시 재사용. 산식은 한국어 풀어쓰기: `양도차익 500,000,000 × 장특공제율 70% (§97의3 특례) = 350,000,000`.
- §97의5: 기존 `result.reductionAmount` 흐름. §97의2(소득금액 단계 ⚠️ F-1)와 §97의5(세액 단계)의 산식 단계 차이를 카드에 명시.
- 사이드바: `result.reductionAmount` 기존 경로 — 변경 불필요 (⑥).

### 5.6 14개 동기화 지점 매핑

| 지점 | 파일 |
|---|---|
| ① 폼 타입 | `lib/stores/calc-wizard-asset-reduction.ts` |
| ② initial | `UnifiedReductionPanel.tsx:106` `getReductionDefault` |
| ③ normalize | `lib/stores/calc-wizard-migration.ts` + `calc-wizard-asset-factory.ts` |
| ④ API 변환 | `lib/calc/transfer-tax-api-helpers.ts:401` `toEngineReductions` |
| ⑤ UI 위젯 | `UnifiedReductionPanel.tsx` 신규 서브 컴포넌트 (800줄 초과 시 `components/calc/transfer/rental/` 분리) |
| ⑥ 사이드바 | 변경 없음 |
| ⑦ 결과 카드 | `RentalReductionDetailCard.tsx` + `TransferTaxResultView.tsx` LTHD 행 |
| ⑧ validation | `lib/calc/transfer-tax-validate.ts` — `rentIncreaseViolationMode` 미선택 차단, API fallback과 3중 일치 |
| ⑨⑩⑫ Zod | `lib/api/transfer-tax-schema-sub.ts:166` `reductionSchema`(z.discriminatedUnion)에 신규 variant 추가 — 배열 사용처 2곳(`schema-sub.ts:347` 컴패니언 + `transfer-tax-schema.ts:134` 메인) 자동 반영 (실측 확정) |
| ⑪⑭ Route | `app/api/calc/transfer/route.ts:199` `data.reductions.map((r): TransferReduction => ...)` — 신규 variant 분기 + `registrationDate`·`rentalStartDate` 등 Date 변환 (실측 확정) |
| ⑬ body spread | `lib/calc/transfer-tax-api.ts:464` reductions 기존 포함 — 신규 필드 strip grep 자가점검 |

### 5.7 레거시 라벨 정정

- `Step5.tsx:22` `long_term_rental` desc → "구 방식 입력 (deprecated)" 표기 + 서브패널에 amber 안내 배너("신규 §97의3 입력은 감면 그룹 패널 사용").
- `metadata.ts` `isFullyImplemented` — 구현 완료 시 조문별 true 갱신 (현행 3개 → 단계적 확대).

---

## 6. Phase 분할 + Anchor 전략

| Phase | 내용 | 커밋 단위 | Pre-Do Anchor |
|---|---|---|---|
| **P1** (1일) | `rental-97-shared-helpers.ts` 이식 + types/effectCategory 확장 + variant 골격 | 1 | A-1·A-2: 공실 149일(미차감)/210일(차감) 유효임대기간 |
| **P2** (2일) | **§97의3** 엔진+UI 완전 구현 — evaluator·L-1c 교체·variant·폼·API·validate. **착수 전 R-1(8년 50% 부칙)·R-5(기준시가 요건) 확정** | 2 (엔진→UI) | B-1: 10년 임대·양도차익 5억 → 장특 3.5억·양도소득금액 1.5억·기본공제 §103 250만 차감 → 과세표준 147,500,000 → §55 누진(8,800만 초과~1.5억 이하 **35% 구간**·누진공제 15,440,000) 산출세액 **36,185,000** (양도연도 법정세율 직접 계산, `reductionAmount=0` 확인) |
| **P3** (1일) | **§97의5** — evaluator·candidates push·variant·폼(85㎡ ⚠️ R-2 확정 후)·3개월 등록 자동검증 | 1 | C-1: 2018.10.1 취득·12.1 등록·10년 임대 → 산출세액 5천만 전액 감면 / C-2: 2019.2.1 등록(3개월 초과) → 불적용 |
| **P4** (2일) | §97 본문/단서·§97의2·§97의4(R-3 추가율 표 확정 후) + 단순 경로(`rate-calc.ts:571`) 제거(R-4) + 레거시 정정(D-1·D-2·D-3) + 테스트 이관 | 조문별 1 | 조문별 법정 산식 직접 계산 anchor |

테스트 배치: `__tests__/tax-engine/transfer-tax/rental-97-{shared-helpers,3,5,main,2,4}.test.ts`.

**Numeric 영향 (D-4 정정 시)**: 기존 사용자 `rentalYears≥8` 입력 케이스 — 산출세액×50% → 장특공제 70% 특례로 전환. 어느 쪽이 유리한지는 양도차익 규모에 의존 — P2 anchor에서 동일 입력 신구 비교값 명시 후 보고서에 기재.

---

## 7. 사용자 결정·확인 필요 사항

| ID | 내용 | 시점 |
|---|---|---|
| **R-1** ⚠️ 잔존 | §97의3 8년 50% 경과규정 부칙 존속 여부 — Do에서 미확정 유지: 현행 10년 70%만 구현, 미달 시 사유 안내. 부칙 확정 시 `rental-97-3.ts` 분기 추가 | 후속 |
| **R-2** ✅ 확정 (2026-06-11) | §97의5 면적 요건 **없음** (본조·령 §97의5 모두 부재) — 면적 입력 미구현 | 종결 |
| **R-3** ⚠️ 잔존 | §97의4 추가율 표 — 법 본문 내 표가 법제처 API 응답 누락. 표 상수 구현 + `isFullyImplemented=false`(UI 비활성). 원문 확정 시 플래그만 전환 | 후속 |
| **R-4** | 단순 경로(`rate-calc` 이동 후 `transfer-tax-reductions-calc.ts`) 제거 시점 — 현행 병존 유지 | 후속 |
| **R-5** ✅ 확정 (2026-06-11) | 령 §97의3③: 5% 증액·**국민주택규모**·10년·기준시가 6억(수도권 밖 3억) — 4요건 전부 evaluator 구현 | 종결 |
| **F-1** ✅ 확정 (2026-06-11) | §97의2① "양도소득세를 면제" = 세액 단계 100% | 종결 |
| **F-2** ⚠️ | §97의3·§97의4(제목 "과세특례")가 §127⑦ "감면규정" 범위에 포함되는지 — 포함 시 §69 자경 등 **카테고리 간** 동시 적용도 선택 1건 강제 필요. v1 정책: rental 카테고리 내 라디오 단일 선택 + 카테고리 간 동시 선택 시 결과 화면 경고 표시(차단은 F-2 확정 후) | P2 착수 전 |
| **D-7** | 코드·문서 "§127②" → "§127⑦" 일괄 정정 (별도 정정 커밋 — 기능 무영향) | 임의 |
| **scope** | §97② 주택수 제외 효과는 **본 Phase 범위 외** — 1세대1주택 판정 입력(`householdHousingCount`)은 폼-전역 사용자 입력이며 자동 연동하지 않음. §97 폼에 안내 hint만 표시 | — |

---

## 8. E2E 시나리오 후보

1. **§97의3 장특 70%**: 2015 취득·2016 등록·10년+ 임대·위반 없음 → 결과 카드 특례율 표시 + `reductionAmount` 행 미표시 (특례율 수치는 R-1 확정에 따름)
2. **§97의5 100%**: 2017.11 취득·2018.1 등록(3개월 내)·75㎡·10년+ → 산출세액 전액 감면
3. **불적용**: 임대개시 기준시가 초과 → `isEligible:false` + 사유 카드 표시

---

## 9. 참조 실확인 요약

| 인용 | 확인 방법 |
|---|---|
| `rate-calc.ts:571` 단순 경로 / `:460-467` R-2-V2 / `helpers.ts:519-533` L-1c | grep+Read 실측 |
| `lib/calc/` rentalReductionDetails 생성 0건 | 전 코드베이스 grep |
| `rental-housing-reduction.ts:286` 의무 0년 | Read 실측 |
| `aggregate-reduction-limits.ts` rental 미포함 | Read 실측 |
| §97·§97의2·§97의3·§97의5·§127⑦·§133 열거 | KoreanLaw MCP 원문 조회 ✅ |
| §97의4 추가율 표·§97의3 부칙·§97의5 시행령 | ⚠️ 미완 — R-1·R-2·R-3 |
