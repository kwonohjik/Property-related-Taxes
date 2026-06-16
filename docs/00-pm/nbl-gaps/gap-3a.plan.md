# NBL 갭 3a — NBL §168의11① 면적기준 호별 정밀판정 — 단일 boolean 해체

> 자동 생성(nbl-gaps-plan 워크플로 planner) — 실제 코드 정독 + KoreanLaw 본문 검증 기반. 마스터: [nbl-remaining-gaps.plan.md](../nbl-remaining-gaps.plan.md)

- **제안 PR**: 단독 PR-C (대형). 다른 잔여 NBL 갭(§168의11②수입금액 — PR#226 완료, §83의5 사유별기간, §168의14②양도일의제)과 묶지 말 것. 이 갭은 OtherLandUsage 데이터모델·14지점·별표 정적상수·UI 위젯을 모두 건드리는 큰 단위이며, 다른 갭은 데이터모델 교집합이 없어 분리 PR이 충돌·리뷰 측면에서 안전. 단, scope out한 "STEP 0.6 boolean-only → 실제 면적안분 중과(5지목 공통)"는 별도 후속 PR로 명시 분리. ⑤⑥(연접 다필지 취득시기 순위)·⑥(복합용도 연면적/바닥면적 안분)도 별도 후속 PR.
- **복잡도**: XL
- **선행(blocker)**: 없음

## Anchor 테스트

### Pre-Do anchor: 부설주차장 설치기준면적 초과분 비사업용 산출 (현행 엔진은 전량 사업용으로 틀린 값) **[Pre-Do]**
- **시나리오**: 기타토지(other_land), landArea=2000㎡, 재산세 종합합산(comprehensive), relatedBusinessType='parking_attached'(부설주차장), standardAreaLimit=1200㎡(주차장법 부설주차장 설치기준면적, 사용자 입력), 기간기준 충족. 현행 코드는 isRelatedToResidenceOrBusiness=true + 기간충족이면 areaProportioning 없이 전량 isBusiness=true(어느 호인지·면적 무관) 반환. 기대: §168의11①2호가목 '설치기준면적 이내의 토지'에 한해 사업용 → 한도 1200㎡ 사업용, 초과 800㎡ 비사업용, nonBusinessRatio=0.4.
- **기대값**: judgeOtherLand(input,rules).areaProportioning를 toBe로 고정: { totalArea:2000, businessArea:1200, nonBusinessArea:800, nonBusinessRatio:0.4 }. 그리고 isBusiness=false(초과분 존재). 현행 코드 실행 시 areaProportioning===undefined, isBusiness===true 로 이 anchor가 FAIL → 디자인 환류 확보. (이 anchor를 먼저 작성해 현행 FAIL 확인 후 Do 진입)
- **법령근거**: 소득세법 시행령 §168의11①2호가목 '「주차장법」에 따른 부설주차장 설치기준면적 이내의 토지'. KoreanLaw get_law_text(mst=286211, jo=제168조의11) 본문 검증 완료 2026-06-16.

### 하치장 매년 최대면적×120% 한도 초과분 비사업용
- **시나리오**: 기타토지, landArea=1500㎡, 종합합산, relatedBusinessType='hatchang'(하치장), maxAnnualArea=1000㎡(매년 물품 보관·관리 최대면적, 사용자 입력) → 한도=1000×1.2=1200㎡. 기간기준 충족.
- **기대값**: areaProportioning를 toBe로 고정: { totalArea:1500, businessArea:1200, nonBusinessArea:300, nonBusinessRatio:0.2 }. isBusiness=false.
- **법령근거**: 소득세법 시행령 §168의11①7호 '매년 물품의 보관·관리에 사용된 최대면적의 100분의 120 이내의 토지'. KoreanLaw 본문 검증 완료.

### 무주택 1세대 1필지 나지 660㎡ 한도 + 660㎡ 이내는 전량 사업용
- **시나리오**: 기타토지, landArea=500㎡, 종합합산, relatedBusinessType='vacant_lot_1household'(무주택1세대 나지), 660㎡ 이내. 기간기준 충족.
- **기대값**: areaProportioning===undefined (한도 이내 → 안분 불필요), isBusiness=true. 같은 케이스에서 landArea=800㎡이면 businessArea=660, nonBusinessArea=140, isBusiness=false.
- **법령근거**: 소득세법 시행령 §168의11①13호 '주택을 소유하지 아니하는 1세대가 소유하는 1필지의 나지 …(660제곱미터 이내에 한한다)'. KoreanLaw 본문 검증 완료.

### raw→엔진 input: relatedBusinessType·standardAreaLimit 매퍼 도달 (⑫⑬⑭ 침묵 strip 방지)
- **시나리오**: nblOtherRelatedBusinessType='parking_attached', nblOtherStandardAreaLimit='1200' 을 raw 페이로드로 buildNblEngineInput 호출.
- **기대값**: input.otherLand.relatedBusinessType==='parking_attached', input.otherLand.standardAreaLimit===1200 (number 변환). raw에 nbl 접두 필드가 운반되고 buildOtherLand가 nested로 변환됨을 확인.
- **법령근거**: 아키텍처 B raw prefix-pick(buildNonBusinessLandRaw가 k.startsWith('nbl') 자동운반) + ⑫Zod 명시 추가 필수.

### 14호(잔여 유사토지) boolean 유지 호환 — 면적인자 미입력 시 전량 판정
- **시나리오**: relatedBusinessType='etc_14호'(또는 미선택 legacy isRelatedToResidenceOrBusiness=true), standardAreaLimit 미입력. 종합합산 + 기간충족.
- **기대값**: areaProportioning===undefined, isBusiness=true (현행 동작 보존 — 14호는 별표 기준면적 없는 '유사토지'이므로 boolean 유지). 기존 other-land.test.ts '종합합산 + 거주·사업관련 O → 사업용' anchor 회귀 통과.
- **법령근거**: 소득세법 시행령 §168의11①14호 '제1호부터 제13호까지 … 유사한 토지'. 별표 기준면적 부재 → boolean 유지가 정확.

---

## 1. 법령 근거 (KoreanLaw 본문 검증 완료 2026-06-16)

`get_law_text(mst=286211, jo=제168조의11)` 및 `get_law_text(mst=286379, jo=제83조의4)` 본문, `get_annexes(소득세법 시행규칙 별표3)` 정본으로 직접 확인.

### §168의11① 14개 호 — 면적기준 매트릭스 (검증된 본문 기준)

| 호 | 토지 유형 | 면적기준 | 면적인자(엔진 입력) | 정본 위치 |
|---|---|---|---|---|
| 1호 가목 | 선수전용 체육시설 | 별표3 기준면적 | (별표 정적상수 또는 standardAreaLimit 직접입력) | 시행규칙 §83의4① 별표3 |
| 1호 가목(2) | (별표4) | 별표4 기준면적 | standardAreaLimit | §83의4③ 별표4 |
| 1호 나목 | 종업원 체육시설 | 별표5 기준면적 | standardAreaLimit | §83의4④ 별표5 |
| 2호 가목 | 부설주차장(주택 제외) | **부설주차장 설치기준면적 이내** | standardAreaLimit(설치기준면적) | §168의11①2호가목 |
| 2호 나목 | 업무용자동차 주차장 | **최저차고기준면적 × 1.5 이내** | minGarageArea(최저차고기준면적) → ×1.5 | §168의11①2호나목 |
| 2호 다목 | 주차장운영업 | **수입금액비율 3%** (면적 아님) | — (§168의11② = PR#226 완료, 본 갭 제외) | §83의4⑥ |
| 3호 | 민간투자사업 조성토지 | 조성완료 2년 경과분 제외 | (면적기준 아님 — boolean+기간) | §83의4⑦ |
| 4호 | 청소년수련시설 | **수용정원 × 200㎡ 초과분 제외** | youthCapacity(수용정원) → ×200 | §83의4⑧ |
| 5호 다목 | 예비군훈련시설 | 별표6 제2호 기준면적 | standardAreaLimit | §83의4⑨⑩ 별표6 |
| 6호 | 휴양시설업 | 합산 기준면적(§83의4⑫ 1~3호 합) | standardAreaLimit(합산값 직접입력) | §83의4⑫ |
| 7호 | 하치장·야적장·적치장 | **매년 최대면적 × 120% 이내** | maxAnnualArea(최대면적) → ×1.2 | §168의11①7호 |
| 8호 | 골재채취장 | 허가받은 바 (면적기준 없음) | (boolean+기간) | §168의11①8호 |
| 9호 | 폐기물처리업 | (면적기준 없음) | (boolean+기간) | §168의11①9호 |
| 10호 | 광천지 | **수입금액비율 4%** | — (§168의11② 제외) | §83의4⑬ |
| 11호 다목 | 양어장·지소 기타 | **수입금액비율 4%** | — (§168의11② 제외) | §83의4⑬ |
| 12호 | 블록·제조·학원·도소매 | **수입금액비율 20/7/10/7/10%** | — (§168의11② 제외) | §83의4⑮ |
| 13호 | 무주택1세대 1필지 나지 | **660㎡ 이내** | (고정상수 660) | §168의11①13호·§83의4⑯⑰ |
| 14호 | 기타 유사토지 | 기준면적 없음 | (boolean 유지) | §168의11①14호 |

**핵심 발견(검증)**: 면적기준이 있는 호는 1·2가·2나·4·5다·6·7·13호. 수입금액비율(2다·10·11다·12호)은 §168의11② 별도 경로(PR#226 완료) → **본 갭 제외**. 3·8·9·14호는 면적기준 없음(boolean+기간만).

별표3·4·5·6 정본은 `get_annexes`로 접근 가능 확인(별표3 직접 추출 성공). 단, 별표3은 종목별 행(축구장 11,000 / 야구장 14,000 …) + 비고 5항(테니스 선수 2인 초과 시 483㎡ 가산 등)의 복잡한 표 → 자동화 산식 재현 비용 높음. **결정**: 1·5다·6호 등 별표 의존 호는 본 PR에서 `standardAreaLimit` 사용자 직접입력으로 처리(별표 자동산출은 후속). 7·13호처럼 단순 산식(×1.2, 660 고정)·4호(수용정원×200)·2나(최저차고×1.5)는 엔진 산식 자동화.

---

## 2. Scope

### In (본 갭)
- `relatedBusinessType` enum 도입(other-land 호별 분기). 현행 단일 boolean(`isRelatedToResidenceOrBusiness`) 해체.
- 면적기준 자동산출 가능 호: **2나(최저차고×1.5), 4(수용정원×200), 7(최대면적×1.2), 13(660㎡ 고정)** — 엔진 산식 자동.
- 면적기준 별표 의존 호: **1·1가(2)·1나·5다·6** — `standardAreaLimit` 직접입력(별표 자동산출 후속 명시).
- 면적기준 없는 호: **3·8·9·14** — boolean+기간 유지(현행 동작 보존).
- `computeAreaProportioning`(pasture.ts:67 패턴) 재사용한 부분 비사업용 산출 → `areaProportioning` 반환.
- 14지점 전수 동기화(④⑬ NBL prefix-pick 자동, ⑫ Zod 명시).
- 결과카드(⑦) 면적안분 표시는 기존 `AreaBar` 재사용(이미 areaProportioning 렌더).

### Out (분리 후속 PR — 명시)
- **STEP 0.6 boolean-only 한계**: transfer-tax.ts:204-223이 `nonBusinessLandJudgment.isNonBusinessLand`(boolean)만 소비 → `areaProportioning`(부분 비사업용)을 **실제 양도세 면적안분 중과**로 반영하는 것은 미구현. other-land가 areaProportioning을 산출해도 STEP 0.6은 전체 비사업용/사업용 boolean으로만 처리. **이는 5지목 공통 별도과제**(pasture·housing 등도 동일). 본 갭은 판정 엔진의 호별 면적초과 산출까지만. (검증: transfer-tax.ts:213-215 `effectiveInput = {...workingInput, isNonBusinessLand: judgment.isNonBusinessLand}` — areaProportioning 미참조)
- **§168의11⑤** 연접 다수 필지 취득시기 순위 기준면적 초과부분 판정(1호 나지/2호 건축물 분기).
- **§168의11⑥** 복합용도 건축물 연면적/바닥면적 안분(특정용도분 부속토지면적).
- 별표3·4·5·6 정본 정적상수 자동산출(1·1가2·1나·5다 면적 자동).
- 수입금액비율(§168의11②) — PR#226 완료.

---

## 3. 데이터 모델 변경

### types.ts — OtherLandUsage 확장 (현재 lib/tax-engine/non-business-land/types.ts:207-214)

신규 enum + 면적인자 추가. 기존 `isRelatedToResidenceOrBusiness`는 **14호/legacy 호환용으로 보존**(deprecated 표기, 미입력 시 fallback).

```
// types.ts 신규 (OtherLandUsage 위에 추가)
export type NblRelatedBusinessType =
  | "sports"               // 1호 체육시설 (별표3/4/5 — standardAreaLimit 직접입력)
  | "parking_attached"     // 2호 가목 부설주차장 (설치기준면적 직접입력)
  | "parking_garage"       // 2호 나목 업무용자동차 주차장 (최저차고기준면적 × 1.5)
  | "youth_training"       // 4호 청소년수련시설 (수용정원 × 200㎡ 초과 제외)
  | "reserve_forces"       // 5호 다목 예비군훈련 (별표6 제2호 — standardAreaLimit)
  | "resort"               // 6호 휴양시설업 (합산 기준면적 직접입력)
  | "hatchang"             // 7호 하치장·야적장 (최대면적 × 120%)
  | "vacant_lot_1household"// 13호 무주택1세대 1필지 나지 (660㎡ 고정)
  | "etc_14호"             // 14호 유사토지 (면적기준 없음 — boolean 유지)
  | "none";                // 호 미해당 (재산세유형·기간기준만)
```

OtherLandUsage 신규 필드 (types.ts:207-214 내부 추가):
```
  /** §168의11① 호별 분기 — 면적기준 정밀판정. 미설정 시 legacy isRelatedToResidenceOrBusiness fallback. */
  relatedBusinessType?: NblRelatedBusinessType;
  /** 별표/설치기준 직접입력 기준면적(㎡) — sports·parking_attached·reserve_forces·resort 호. */
  standardAreaLimit?: number;
  /** 7호 하치장: 매년 최대 사용면적(㎡). 엔진이 ×1.2. */
  maxAnnualArea?: number;
  /** 4호 청소년수련시설: 수용정원(명). 엔진이 ×200㎡. */
  youthCapacity?: number;
  /** 2호 나목: 최저차고기준면적(㎡). 엔진이 ×1.5. */
  minGarageArea?: number;
```

### data/area-standards.ts (신규 파일) — 산식 배율 상수
```
export const NBL_AREA_MULTIPLIER = {
  HATCHANG_RATIO: 1.2,        // 7호 매년 최대면적 × 120%
  YOUTH_PER_CAPITA: 200,      // 4호 수용정원 × 200㎡
  GARAGE_MULTIPLIER: 1.5,     // 2호 나목 최저차고 × 1.5
  VACANT_LOT_1HOUSEHOLD: 660, // 13호 660㎡ 고정
} as const;
```
(역사적 과세 데이터 정적상수 패턴 — feedback_historical_tax_tables 준수. 별표3~6 정본은 후속.)

### legal-codes/transfer.ts — NBL 상수 추가 (현재 line 31·55에 OTHER_LAND/OTHER_LAND_BUSINESS)
```
OTHER_LAND_AREA_SPORTS:        "시행령 §168조의11 ① 1호 + 시행규칙 §83조의4 ①③④",
OTHER_LAND_AREA_PARKING:       "시행령 §168조의11 ① 2호 가목",
OTHER_LAND_AREA_GARAGE:        "시행령 §168조의11 ① 2호 나목",
OTHER_LAND_AREA_YOUTH:         "시행령 §168조의11 ① 4호 + 시행규칙 §83조의4 ⑧",
OTHER_LAND_AREA_RESERVE:       "시행령 §168조의11 ① 5호 다목 + 시행규칙 §83조의4 ⑨⑩",
OTHER_LAND_AREA_RESORT:        "시행령 §168조의11 ① 6호 + 시행규칙 §83조의4 ⑫",
OTHER_LAND_AREA_HATCHANG:      "시행령 §168조의11 ① 7호",
OTHER_LAND_AREA_VACANT_LOT:    "시행령 §168조의11 ① 13호 + 시행규칙 §83조의4 ⑯⑰",
```

---

## 4. 14 동기화 지점 전수 enumerate

NBL prefix-pick 특성: store에 `nbl` 접두 필드명 추가 시 `buildNonBusinessLandRaw`(non-business-land-request.ts:64-65 `k.startsWith('nbl')`)가 ④⑬을 **자동 운반**. ⑫Zod는 명시 추가 필수. neue store 필드명: `nblOtherRelatedBusinessType`·`nblOtherStandardAreaLimit`·`nblOtherMaxAnnualArea`·`nblOtherYouthCapacity`·`nblOtherMinGarageArea`.

| # | 지점 | file:line | 변경 |
|---|---|---|---|
| ① | 폼 상태(AssetForm) | lib/stores/calc-wizard-asset.ts:478-481 (nblOther* 블록) | 5개 store 필드 추가: `nblOtherRelatedBusinessType: "" \| NblRelatedBusinessType`, `nblOtherStandardAreaLimit: string`, `nblOtherMaxAnnualArea: string`, `nblOtherYouthCapacity: string`, `nblOtherMinGarageArea: string` |
| ② | initial(factory) | lib/stores/calc-wizard-asset-factory.ts:220 (nblOtherIsRelatedToResidence 직후) | 5필드 초기값 `""`. **AND** calc-wizard-asset-nbl.ts:193 NBL_DEFAULTS에도 동일 추가(spread 경로 이중 안전) |
| ③ | normalize fallback | calc-wizard-asset-nbl.ts NBL_DEFAULTS(=normalize 단일소스) + factory inline | factory가 활성 inline이므로 ②와 동일 지점. migration(calc-wizard-migration.ts:122-124)은 nblLandType만 이전 — neue 필드는 신규라 legacy 없음, factory default가 normalize 역할 |
| ④ | API변환(raw 빌더) | lib/calc/non-business-land-request.ts:64-65 | **자동**(prefix-pick `k.startsWith('nbl')`). 코드 변경 불필요 |
| ⑤ | UI 위젯 | components/calc/transfer/nbl/OtherLandDetailSection.tsx:95-100 (현 단일 ToggleCard) | ToggleCard → RadioCardGroup(relatedBusinessType 9~10옵션). 선택 호에 따라 면적인자 입력 FieldCard 조건부 노출(parking_attached→standardAreaLimit, hatchang→maxAnnualArea, youth→youthCapacity, garage→minGarageArea, vacant_lot→안내만). DecimalInput 사용(면적㎡) |
| ⑥ | 사이드바 합계 | (해당 없음) | NBL 판정은 합계 금액 미반영 — 변경 없음 |
| ⑦ | 결과카드 | components/calc/NonBusinessLandResultCard.tsx:90-102 (AreaBar 블록) | **이미 areaProportioning 렌더**(면적안분 시각화). 호별 step.detail은 other-land.ts가 채움 → 추가 변경 최소(라벨만). step legalBasis 검증 대상 |
| ⑧ | validation | lib/calc/transfer-tax-validate-asset.ts:447-452 (other_land 분기) | relatedBusinessType이 면적인자 요구 호(parking_attached·hatchang·youth_training·parking_garage·sports·reserve_forces·resort)인데 해당 면적인자 미입력 시 차단. 3중패턴: UI display fallback 없음(미입력=오류) → validate도 동일 차단. 자동안분 fallback 금지(feedback_no_silent_apportion_fallback) |
| ⑨ | Zod enum 메인 | (해당 없음 — NBL은 raw 페이로드, 메인 propertySchema에 nbl enum 직접 없음) | 변경 없음 |
| ⑩ | Zod enum 컴패니언+refines | (해당 없음 — companionAssetSchema는 isNonBusinessLand boolean만) | 변경 없음 |
| ⑪ | 자산-수준 acquisitionDate fallback | non-business-land-request.ts:37-38 (toDate) | 기존 동작 유지 — 변경 없음 |
| ⑫ | **Zod 입력객체 정의** | lib/api/transfer-tax-schema-sub.ts:118-122 (기타토지 블록) | **명시 추가 필수**(침묵 strip 방지): `nblOtherRelatedBusinessType: z.string().optional()`, `nblOtherStandardAreaLimit: z.string().optional()`, `nblOtherMaxAnnualArea: z.string().optional()`, `nblOtherYouthCapacity: z.string().optional()`, `nblOtherMinGarageArea: z.string().optional()` (raw 평면 = 문자열) |
| ⑬ | callTransferTaxAPI body spread | lib/calc/transfer-tax-api.ts:50·467 (nblRaw spread) | **자동**(④ prefix-pick으로 운반됨). multi-transfer-tax-api.ts:24·139도 동일 자동. 코드 변경 불필요 |
| ⑭ | Route handler 엔진 input 매핑 | app/api/calc/transfer/route.ts:213 + multi/route.ts:145 (buildNblEngineInput) | **자동**(buildNblEngineInput→mapAssetToNblInput→buildOtherLand가 nested 변환). buildOtherLand(form-mapper-helpers.ts:170-183) **본문 수정 필요**(아래 §5) — 신규 nbl 필드를 OtherLandUsage로 매핑. Date 변환 불필요(면적은 number) |

**⑫⑬⑭ grep 자가점검**: `grep -n "nblOtherRelatedBusinessType" lib/api/transfer-tax-schema-sub.ts lib/tax-engine/non-business-land/form-mapper-helpers.ts lib/stores/calc-wizard-asset.ts` — 3 파일 모두 hit 확인.

---

## 5. 엔진 로직 (함수·산식·삽입 위치)

### 5.1 form-mapper-helpers.ts: buildOtherLand 확장 (현재 line 170-183)
neue 필드를 OtherLandUsage로 매핑. relatedBusinessType은 string→enum 캐스팅, 면적인자는 parseNumber:
```
relatedBusinessType: (asString(a.nblOtherRelatedBusinessType) || undefined) as NblRelatedBusinessType | undefined,
standardAreaLimit:   parseNumber(asString(a.nblOtherStandardAreaLimit)),
maxAnnualArea:       parseNumber(asString(a.nblOtherMaxAnnualArea)),
youthCapacity:       parseNumber(asString(a.nblOtherYouthCapacity)),
minGarageArea:       parseNumber(asString(a.nblOtherMinGarageArea)),
```

### 5.2 other-land.ts: 호별 면적한도 해석 헬퍼 (신규 함수, 삽입 위치 isBareLand 직후 line 40)
```
function resolveAreaLimit(o: OtherLandUsage): number | undefined {
  switch (o.relatedBusinessType) {
    case "hatchang":              return o.maxAnnualArea !== undefined ? o.maxAnnualArea * 1.2 : undefined;
    case "youth_training":        return o.youthCapacity !== undefined ? o.youthCapacity * 200 : undefined;
    case "parking_garage":        return o.minGarageArea !== undefined ? o.minGarageArea * 1.5 : undefined;
    case "vacant_lot_1household": return 660;
    case "sports":
    case "parking_attached":
    case "reserve_forces":
    case "resort":                return o.standardAreaLimit;  // 직접입력
    case "etc_14호":
    case "none":
    default:                      return undefined;            // 면적기준 없음 → boolean 유지
  }
}
```
**소수 면적 주의**: maxAnnualArea·minGarageArea ×1.2/×1.5는 소수 발생 가능. 면적은 UI 표시 반올림(parseFloat(toFixed(2)))과 일치시키되, 엔진 nonBusinessRatio는 `Math.round(x*10000)/10000`(pasture computeAreaProportioning 동일). 금액 아님 → applyRate 불요.

### 5.3 other-land.ts: judgeOtherLand 본문 — Step 3-1-1 분기 교체 (현재 line 144-182)
현행 `if (o.isRelatedToResidenceOrBusiness)` 블록을 호별 분기로 교체:
1. `relatedBusinessType`이 설정되면 → `resolveAreaLimit(o)` 호출.
2. areaLimit 정의 AND `input.landArea > areaLimit` → `computeAreaProportioning(input.landArea, areaLimit)`(pasture.ts:67 패턴 import 또는 other-land 내 복제) + 기간기준 충족 시: 한도 내 사업용 / 초과분 비사업용 → `isBusiness=false`(초과분 존재), `areaProportioning` 반환, step FAIL("기준면적 N㎡ 초과 → 초과분 M㎡ 비사업용").
3. areaLimit 정의 AND landArea ≤ areaLimit + 기간충족 → `isBusiness=true`, areaProportioning undefined, step PASS.
4. areaLimit undefined(14호·none·면적인자 미입력) AND (`relatedBusinessType==="etc_14호"` OR legacy `isRelatedToResidenceOrBusiness`) + 기간충족 → **현행 동작 보존**(전량 사업용 boolean). 기존 other-land.test.ts:58-73 anchor 회귀 통과.
5. areaProportioning 산출 시 `businessUseRatio`는 pasture.ts:179 패턴대로 `areaProportioning.nonBusinessRatio` 사용(기간비율 아님), criteria는 r1.criteria.

legalBasis: 호별 OTHER_LAND_AREA_* 상수(§4) 사용. buildPass/buildFail Ctx에 areaProportioning 추가 전달(현재 Ctx interface line 185-189에 areaProportioning 없음 → 추가 또는 pasture식 직접 return).

### 5.4 computeAreaProportioning 재사용
pasture.ts:67-78의 `computeAreaProportioning`는 non-exported(파일 로컬). 옵션: (a) `utils/`로 추출 후 양쪽 import(단일소스), 또는 (b) other-land.ts에 동형 복제. **권장 (a)** — utils/period-math.ts 옆 `utils/area-proportioning.ts` 신설 후 pasture.ts·other-land.ts 공용(single-source). pasture.ts:67 삭제·import 교체(별도 미세 변경, 회귀 anchor pasture.test.ts 통과 확인).

---

## 6. UI 변경 (OtherLandDetailSection.tsx)

### 진입점: components/calc/transfer/nbl/OtherLandDetailSection.tsx:95-100
현행 단일 ToggleCard("주택·사업장 부수 토지 여부") 교체:

1. **RadioCardGroup** (`@/components/calc/inputs/RadioCardGroup.tsx`): relatedBusinessType 10옵션(none + 9유형). layout="stack". tone=sky(면적·규모). 각 옵션 라벨에 호 번호·법령 표기("부설주차장 (2호가목)" 등). value=`asset.nblOtherRelatedBusinessType`, onChange→`onAssetChange({nblOtherRelatedBusinessType})`.
2. **조건부 면적인자 FieldCard**(선택 호에 따라):
   - `parking_attached`·`sports`·`reserve_forces`·`resort` → "기준면적(㎡)" DecimalInput → `nblOtherStandardAreaLimit`. hint: 호별 별표/설치기준 설명(한국어, 숫자예시 금지).
   - `hatchang` → "매년 최대 사용면적(㎡)" DecimalInput → `nblOtherMaxAnnualArea`. hint "이 면적의 120%까지 사업용".
   - `youth_training` → "수용정원(명)" DecimalInput → `nblOtherYouthCapacity`. hint "정원 × 200㎡까지 사업용".
   - `parking_garage` → "최저차고기준면적(㎡)" DecimalInput → `nblOtherMinGarageArea`. hint "× 1.5까지 사업용".
   - `vacant_lot_1household` → 안내 카드만(660㎡ 고정, 입력 없음).
   - `etc_14호`·`none` → 면적인자 미노출.
3. 면적인자 카드는 §3 색상카드 패턴(border-sky-200 bg-sky-50/40, 섹션번호) 적용.
4. LawArticleModal: 선택 호의 OTHER_LAND_AREA_* legalBasis 배지.
5. **DecimalInput 필수**(면적㎡·정원명 — CurrencyInput 금지, feedback_decimal_input). 금액(건물가액·토지가액)은 기존 CurrencyInput 유지.
6. 결과카드(NonBusinessLandResultCard.tsx:90-102 AreaBar)는 이미 면적안분 렌더 → 추가 변경 없음(엔진이 areaProportioning 채우면 자동 표시).

**legacy 보존**: 기존 `nblOtherIsRelatedToResidence` boolean은 store/factory/Zod에 잔존(제거 안 함). buildOtherLand가 둘 다 매핑하되 엔진은 relatedBusinessType 우선·undefined 시 isRelatedToResidenceOrBusiness fallback. UI에서는 RadioCardGroup으로 대체하므로 ToggleCard는 제거(또는 etc_14호 옵션이 boolean 역할 흡수).

---

## 7. Edge case · Risk

1. **STEP 0.6 boolean-only 한계(scope out 재확인)**: areaProportioning을 산출해도 실제 양도세 면적안분 중과 미반영(transfer-tax.ts:213-215). 결과카드엔 면적안분 표시되나 세액은 전량 비사업용/사업용. **결과카드에 "면적 초과분은 안분 중과 별도 적용 예정" 안내 또는 후속 PR 명시 필요**. 사용자 혼선 risk — UI hint로 명확화.
2. **소수 면적 정밀도**: ×1.2/×1.5/×200 산식 소수 발생. computeAreaProportioning의 nonBusinessRatio round(×10000) 일관성 유지. 면적 단가 곱셈은 본 갭에 없음(판정만).
3. **14호 회귀**: 기존 other-land.test.ts:58-73(거주·사업관련 O→사업용)이 relatedBusinessType 미설정 시 legacy isRelatedToResidenceOrBusiness fallback으로 통과해야 함. anchor #5로 고정.
4. **별표 미자동화 risk**: sports·reserve_forces·resort·sports(2)는 standardAreaLimit 직접입력 → 사용자가 별표 값을 알아야 함. UI hint에 별표 참조 안내. 별표 자동산출은 후속 PR(get_annexes 정본 활용 가능 — blocker 아님).
5. **2호 다목/10/11다/12호 혼동**: 이들은 수입금액비율(§168의11②, PR#226 완료) — relatedBusinessType enum에 **미포함**(parking_garage는 2호나목, parking_attached는 2호가목만). UI에서 "주차장운영업(2호다목)은 수입금액비율 섹션 사용" 안내로 분리 명확화. RadioCardGroup·수입금액비율 Select 두 경로 공존 — 동시 선택 시 우선순위 검증(validate)에서 명확화 권장.
6. **co-ownership 적용**: engine.ts:178-182 applyCoOwnershipRatio가 areaProportioning을 어떻게 처리하는지 확인 필요(지분율<1 시 면적도 안분되는지) — **확인 필요**(co-ownership.ts Read 후 areaProportioning 스케일 여부 검증).
7. **ExpandToggle/internal id**: 결과카드 "원" 미표기·내부 id 미노출 정책 준수(면적은 ㎡ 표기, 기존 AreaBar 동일).
8. **800줄 정책**: other-land.ts 현재 234줄 → resolveAreaLimit+분기 확장으로 +80~100줄 예상(여유). OtherLandDetailSection.tsx 169줄 → RadioCardGroup+조건부 카드로 +120줄 예상(800 이내). 초과 시 면적인자 입력 sub-component(`OtherLandAreaLimitInput`) 분리.

## 8. Pre-Do anchor 우선 검증 (강제)
Do 진입 전 anchor #1(isPreDo=true) 먼저 작성·실행하여 현행 엔진이 `areaProportioning===undefined`·`isBusiness===true`(전량 사업용) 내는 것을 FAIL로 확보 → 디자인 환류. "현행 일치 예상" 금지. (feedback_pre_anchor_verification)

---

## 🔍 R1 자가검토 정정 (2026-06-16, plan-design-self-review-loop · 실측 검증)

> 7-에이전트 검토(인용 grep/Read 실측) 결과. 정정은 본 절을 우선(본문 인용과 충돌 시 본 절 기준).

| 우선 | 카테고리 | 정정 |
|---|---|---|
| High | 오류 | anchor: `toBe`(참조 비교, 항상 실패) → **`toEqual`**. `AreaProportioning`(types.ts:346-352)은 **`buildingMultiplier: number` 포함**(computeAreaProportioning이 `1` 반환) → 기대값에 `buildingMultiplier:1` 추가(Pre-Do·하치장 anchor 둘 다). |
| Medium | 모순 | `CategoryJudgeResult` **반환타입(types.ts:535)에 `areaProportioning?` 이미 존재**(engine.ts:264 자동 전파). other-land **로컬 Ctx(185-189)에만 부재** → pasture식 직접 객체 return(타입 변경 불요). §5.3 정정. |
| Medium | 오류 | 4호 산식 직접근거=**시행규칙 §83의4⑧**(시행령 §168의11①4호는 위임만). §1 표 산식 셀에 명기. |
| Medium | 개선 | revenueTest 우선순위: 엔진 실행순서 **revenueTest(other-land.ts:95) → isNonComprehensive(113) → relatedBusinessType(145 삽입)**. 동시 선택 시 revenueTest 우선 — validate 상호배타 차단 또는 결정 고정 + UI 동시 활성 방지. §5.3 명기. |
| Medium | 누락 | buildOtherLand(form-mapper-helpers:175)는 **other_land·vacant_lot·miscellaneous 3 landType** 처리. validate(:447)는 other_land만 → vacant_lot 면적인자 침묵통과 가능. 3 landType 일관 처리 또는 제한 근거 명시. |
| Medium | 누락 | buildOtherLand **hasBuilding:false 하드코딩(:178)**·buildingFloorArea 미매핑 — 본 갭(나대지)과 무관 명시, isBareLand(buildingStandardValue 기반)와 비간섭 확인. |
| Low | 오류 | validate 위치: 440-445=공통 필수, 447-452=revenue 블록. 신규 면적인자 검증은 **446 직후 별도 if**. "447-452 other_land 분기" 표기 정정. |
| Low | 누락 | sports enum: 1호 별표3/4/5 3종을 `sports` 단일 통합 → standardAreaLimit 참조 별표 구분불가. RadioCard 라벨에 별표번호 표기 또는 `sports_player`/`sports_employee` 세분. |
| Low | UI누락 | etc_14호 → buildOtherLand `isRelatedToResidenceOrBusiness=true` 도출규칙 §5.1 명시(onChange 동시 set, useEffect 미러링 금지). |
| Low | 개선 | co-ownership **확인 완료**: applyCoOwnershipRatio(co-ownership.ts:32-40)가 areaProportioning 지분 스케일, nonBusinessRatio 불변. §7.6 "확인 필요"→단정. |
