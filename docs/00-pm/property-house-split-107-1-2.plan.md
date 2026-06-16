# 재산세 §107①2호 — 주택 건물·부속토지 소유자 분리 안분 작업 계획서

- 작성일: 2026-06-16
- 브랜치: `feat/property-house-split` (worktree: `.claude/worktrees/property-house-split`, DEV 3001 / E2E 3101)
- 베이스: master `4de9ea30` (PR #216·#217·#218 반영 — §107 나머지 분기 완료 상태)
- 근거 메모리: `project_property_taxpayer_verification` (잔여 1건)
- 법령 검증: 지방세법 §107①2호 + §4①② (KoreanLaw MST 282559, 시행 2026-04-24) 본문 직접 대조 완료

---

## 1. 배경 — 법령 (검증 완료)

### §107①2호 본문
> 주택의 건물과 부속토지의 소유자가 다를 경우: 그 주택에 대한 **산출세액을 제4조제1항 및 제2항에 따른 건축물과 그 부속토지의 시가표준액 비율로 안분계산(按分計算)한 부분**에 대해서는 그 소유자

### §4①② 시가표준액
- **§4①**: 토지·주택 시가표준액 = 부동산가격공시법 공시가격 (개별공시지가·개별주택가격·공동주택가격).
- **§4②**: 그 외 건축물 = 거래·신축가격 등 기준가격에 종류·구조·용도·경과연수 반영, 지자체장 결정.

### 핵심 성격 — 산출세액 안분 (메모리 정정)
- **과세표준·세율 계산은 주택 전체로 불변.** 산출세액(determinedTax) 단계에서 **건축물 시가표준액 : 부속토지 시가표준액 비율**로 안분하여 건물 소유자·토지 소유자에게 각각 귀속.
- 즉 기존 공유 안분(`distributeCoOwnershipTax`)과 **동일 단계·동일 구조**. 차이는 (a) 비율이 지분율이 아니라 시가표준액 비율, (b) 안분 대상이 정확히 2인(건물주·토지주) 고정.
- ⚠️ 이전 메모리 "과세표준 계산과 결합되어 복잡"은 **부정확** — 실제로는 산출세액 안분이며 난이도는 공유 안분과 동급. 계획서에서 정정.

---

## 2. 현행 코드 (실측)

- `property-tax.ts:709~744`: 주택 산출세액 → `determinedTax`(세부담상한 후, 주택은 §122 단서로 미적용=동일) → `totalPayable`(+부가세).
- `property-tax.ts:721~726`: `housingBuildingValue`(주택 건축물 부분 시가표준액, §146④ 단서용) 이미 입력 존재 → `applyRate(housingBuildingValue, fairMarketRatio)`로 소방분 과세표준 산출.
- `types/property.types.ts:95~99`: `housingBuildingValue?: number` — "주택 건축물 부분 시가표준액 (원) … objectType==='housing' 전용·선택".
- `property-taxpayer.ts`: `determineTaxpayer` 11분기(§107 각 호) + `buildTaxpayerOutcome`(본세·고지액 2기준 안분, co_owner 전용).
- `PropertyCoOwnershipDistribution`(property.types.ts): `{ distributions: {ownerId, shareRatio, taxAmount, totalAmount}[], roundingDiff }`.

→ **건축물 시가표준액(`housingBuildingValue`)은 이미 있음. 부속토지 시가표준액 입력만 신규.** 안분 헬퍼는 공유 패턴 재사용 가능.

---

## 3. 설계

### 3-1. 입력 (taxpayerInfo 확장)
```ts
// PropertyTaxInput.taxpayerInfo 에 추가
isHouseSplit?: boolean;       // §107①2호 — 주택 건물·부속토지 소유자 분리
buildingOwner?: string;       // 건축물 소유자
landOwner?: string;           // 부속토지 소유자
landStdValue?: number;        // 부속토지 시가표준액 (§4① 개별공시지가) — 신규
// [확정] 건축물 시가표준액 = 기존 PropertyTaxInput.housingBuildingValue(§146④) 재사용.
//   엔진에서 determineTaxpayer/안분 헬퍼에 buildingStdValue로 주입 (입력 1개 절약).
```
- **주택(objectType==="housing") 전용.** 비주택에서 무시.
- 엔진 내부 정규화: PropertyObjectInput에 `buildingStdValue`·`landStdValue` 두되, `calculatePropertyTax`가 `buildingStdValue ← input.housingBuildingValue` 주입 후 `determineTaxpayer` 호출(대표=큰 쪽 판정) + 안분.

### 3-2. 판정 (determineTaxpayer)
- **Pick 확장 [정정 #1·#3]**: `PropertyObjectInput`에 `buildingStdValue?: number`·`landStdValue?: number` 추가, `determineTaxpayer` Pick에 두 필드 + `isHouseSplit`·`buildingOwner`·`landOwner` 포함. `calculatePropertyTax`가 호출 시 `buildingStdValue ← input.housingBuildingValue` 주입(재사용), `landStdValue ← input.taxpayerInfo.landStdValue` 전달.
- `isHouseSplit && buildingOwner && landOwner && buildingStdValue>0 && landStdValue>0` → §107①2호 분기.
- `PropertyTaxpayerType`에 **`building_owner`·`land_owner`** 추가. 대표 납세의무자 = **시가표준액 큰 쪽**(buildingStdValue ≥ landStdValue → building_owner, 아니면 land_owner). [확정 §7-2]
- **우선순위 [정정 #6·#7]**: ②각호(신탁·연부·체비지·외국인·종중·파산)는 "①에도 불구하고" → ① 전체에 우선. house_split(§107①2호 단서)은 **②각호 분기 뒤, 사실상소유자(①본문) 앞**에 배치(①단서이므로 ①본문보다 우선). 공유(①1호)와 house_split(①2호)은 **둘 다 ①단서로 상호배타**(UI 라디오 1택 — coOwnershipShares와 isHouseSplit 동시 입력 없음). 엔진도 분기 1택 반환이라 충돌 없음.

### 3-3. 안분 로직 (신규 헬퍼)
- 비율: `buildingRatio = buildingStdValue / (buildingStdValue + landStdValue)`, `landRatio = 1 - buildingRatio`.
- **BigInt 전체 연산 [정정 #9]**: `buildingTax = Number(BigInt(determinedTax) * BigInt(buildingStdValue) / BigInt(sum))`, `landTax = determinedTax − buildingTax`(잔액 흡수 — `feedback_floor_residual_absorption`). 대표 = `buildingStdValue >= landStdValue ? building_owner : land_owner`.
- 본세(determinedTax) + 고지액(totalPayable) 2기준 (공유와 동일).
- overflow 주의: 고가주택 세액 × 시가표준액 > `MAX_SAFE_INTEGER`(~10^17) → BigInt에서 곱·나눗셈 완결, 중간 number/`safeMultiply` 변환 금지 (`feedback_safemul_decimal_apportion_precision`).

### 3-4. 결과 (신규 필드)
```ts
// PropertyTaxResult 에 추가
houseSplitDistribution?: {
  buildingOwner: string; buildingStdValue: number; buildingTaxAmount: number; buildingTotalAmount: number;
  landOwner: string;     landStdValue: number;     landTaxAmount: number;     landTotalAmount: number;
  buildingRatio: number; // 표시용 (건물 시가표준액 비율)
};
```
- Map 금지 → 객체(`feedback_engine_result_map_json_loss`).

### 3-5. UI
- `OwnershipType`에 `house_split` 추가 (주택일 때만 노출). Step0 OWNERSHIP_OPTIONS.
- 입력: 건물주·토지주 + **건축물 시가표준액(기존 `housingBuildingValue` 폼 필드 재사용 — house_split ON 시 소유 형태 섹션에서 노출·필수)** + 부속토지 시가표준액(`landStdValue` 신규). **FormState 신규 = isHouseSplit·buildingOwner·landOwner·landStdValue 4개** (건축물값은 housingBuildingValue 재사용).
- 결과 카드: 건물분/토지분 안분 표(소유자·시가표준액·본세·고지액 2열).
- **[정정 #5] §146④ 소방분과 housingBuildingValue 공유**: house_split ON이어도 §146④ 주택 건물분 소방분(housingFireServiceTaxBase)은 독립 산출(같은 housingBuildingValue → 두 용도 동시 사용). 충돌 없음.

---

## 4. 14개 동기화 지점

| # | 지점 | 위치 | 조치 |
|---|---|---|---|
| ① | FormState | `shared.ts` | isHouseSplit/buildingOwner/landOwner/buildingStdValue/landStdValue 폼 필드 |
| ② | INITIAL_FORM | `shared.ts` | 초기값 |
| ③ | normalize | N/A | 재산세 전용 normalize 없음 |
| ④ | API 변환 | `shared.ts` buildPropertyTaxRequestBody | ownershipType==="house_split" → taxpayerInfo 매핑 |
| ⑤ | UI 위젯 | `Step0.tsx` | house_split 라디오 + 입력 4개 (주택 전용 노출) |
| ⑥ | 사이드바 | N/A | 금액 아님 |
| ⑦ | 결과 카드 | `PropertyTaxResultView.tsx` | houseSplitDistribution 안분 표 + TAXPAYER_TYPE_LABEL **building_owner·land_owner 2 라벨** |
| ⑧ | validation | `shared.ts` validateStep | house_split 시 건물주·토지주·시가표준액 2개 필수(미입력 차단 — 안분 불가) |
| ⑨ | Zod | `lib/validators/property-input.ts` | taxpayerInfo **4필드**(isHouseSplit·buildingOwner·landOwner·landStdValue) optional (buildingStdValue는 housingBuildingValue 재사용 — 기존 Zod에 존재) |
| ⑩ | 엔진 input | `types/property.types.ts` | taxpayerInfo **4필드** + PropertyObjectInput `buildingStdValue`·`landStdValue`(Pick·주입 전용) |
| ⑪ | route 매핑 | `route.ts` | 캐스팅 통과 |
| ⑫ | 결과 타입 | `types/property.types.ts` | houseSplitDistribution + PropertyTaxpayerType 2종 |
| ⑬ | 엔진 파이프라인 | `property-tax.ts` | Step 0 판정(buildingStdValue←housingBuildingValue 주입) + **주택 main return 전용** houseSplit 부착(buildHouseSplitOutcome). co_owner와 배타 |
| ⑭ | DB 저장 | `route.ts` | 자동 |

> ⑧ 주의: 공유·기타 6종은 미입력=fallback(차단 안 함)이었으나, **house_split은 안분 비율 계산에 시가표준액 2개가 필수** → 미입력 시 안분 불가. validate 차단이 타당(단 isHouseSplit ON일 때만). UI 통과↔validate 일관 위해 UI도 필수 표시.

---

## 5. Pre-Do anchor (Do 진입 전)

1. **A-1**: `determineTaxpayer({ registeredOwner:"-", isHouseSplit:true, buildingOwner:"건물주", landOwner:"토지주", buildingStdValue:600_000_000, landStdValue:400_000_000 })` → type `building_owner`(6억>4억 큰 쪽), name "건물주". 현재 미구현 → 실패 → 구현 후 통과. (Pick에 buildingStdValue·landStdValue 포함 전제)
2. **A-2**: `calculatePropertyTax({ objectType:"housing", publishedPrice, taxpayerInfo:{ isHouseSplit, ...6:4 } })` → `houseSplitDistribution.buildingTaxAmount + landTaxAmount === determinedTax` (floor 잔액 흡수), `buildingTotalAmount + landTotalAmount === totalPayable`, `buildingRatio === 0.6`.
3. **A-3**: isHouseSplit 미입력 시 기존 주택 세액·결과 전부 불변 + houseSplitDistribution undefined.
4. **A-4 (overflow)**: housingBuildingValue=50억 · landStdValue=50억 · 고가주택(산출세액 수천만) → 세액×시가표준액 > MAX_SAFE → BigInt 경로로 `buildingTaxAmount + landTaxAmount === determinedTax` 정확(±0). Number 직접 곱이면 실패해야 정상.

---

## 6. 작업 순서 (Do 시퀀셜)

1. legal-codes: `TAXPAYER_HOUSE_SPLIT = "지방세법 §107①2호"` 상수.
2. 타입: PropertyTaxpayerType 2종(building_owner·land_owner), taxpayerInfo 5필드, PropertyTaxResult.houseSplitDistribution.
3. 엔진: determineTaxpayer house_split 분기 + 안분 헬퍼(`buildHouseSplitOutcome`) + calculatePropertyTax 주택 경로 조립.
4. anchor A-1/A-2/A-3.
5. Zod·route·API 변환·validate.
6. UI: Step0 house_split + 결과 카드.
7. 테스트 + E2E (E2E_PORT=3101).

엔진 시니어 직접 구현(법령 정합) → UI 시니어 위임. Check: 14지점 grep + E2E 실측.

---

## 7. 결정 확정 (2026-06-16 사용자 승인)

1. ✅ **건축물 시가표준액**: 기존 `housingBuildingValue`(§146④) **재사용**. 별도 입력 없음. 부속토지 시가표준액(`landStdValue`)만 신규. 엔진이 `buildingStdValue ← housingBuildingValue` 주입.
2. ✅ **대표 납세의무자**: **시가표준액 큰 쪽**(건물 vs 토지). 공유 안분(지분 최대자 대표) 패턴 일관.
3. ✅ **안분 기준**: **본세(determinedTax) + 고지액(totalPayable) 2기준**. `houseSplitDistribution`에 buildingTaxAmount·buildingTotalAmount·landTaxAmount·landTotalAmount.
4. ✅ **validate**: house_split ON 시 부속토지 시가표준액 + 건축물(housingBuildingValue) 미입력이면 **안분 불가 → 차단**. 기타 6종(fallback 미차단)과 달리 필수.

---

## 부록 — 관련 메모리
- `project_property_taxpayer_verification` (잔여 1건 → 본 작업)
- `feedback_floor_residual_absorption` (안분 잔액)
- `feedback_applyrate_fractional_rate_one_won_error` (분수 정수 연산)
- `feedback_engine_result_map_json_loss` (결과 객체)
- `feedback_korean_law_citation_verify` (§107①2호·§4 검증 완료)
