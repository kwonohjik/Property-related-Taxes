# 일반건물 토지/건물 취득원인 분리 입력 — Plan

> 사례 32 작업 후속 UX 개선. 양도코리아 UI 패턴(토지/건물 분리 입력)에 정렬.
> 작성일: 2026-05-10
> 우선순위: Medium (사례 31·32 모두 영향, 후속 사례에 선행 작업)

---

## Context

**문제**: 사례 32(신축 건물 단기양도 §114조의2) 구현 후 사용자 피드백:
- 자산-수준 "취득원인" 버튼 중 **"신축(자가건축)" 옵션**과 ⑤ 섹션의 **"자가건축(신축취득)" 토글**이 같은 의미로 **이중 입력**
- 취득원인 "매매" 선택 후 그 바로 아래 "취득일"이 (실제로는 **토지** 취득일임에도) 라벨에 자산 구분 없음
- 한참 아래 ⑤ 섹션에서 다시 "건물 취득일" 입력 → **흐름 단절·맥락 분리**

**근본 원인**: 일반건물(토지+건물 일괄)은 본질적으로 **토지·건물의 취득원인·취득일이 다를 수 있는** 자산인데, 자산-수준 단일 `acquisitionCause` + `acquisitionDate` 만으로 표현 → 자연스러운 표현 불가.

**참고**: 양도코리아 UI(`사례 32 Image 2`)는 구분 단계에서 토지·건물 각각 취득일자·취득원인을 별도로 입력. 본 작업은 그 패턴에 정렬.

---

## 목표

자산종류 = `general_building` 선택 시 취득 정보 영역을 **토지/건물 2개 카드**로 분리:
- 각 카드에 자체 **취득원인** + **취득일** 입력
- ⑤ 신축 정보 섹션 **완전 제거**, `gbIsSelfBuilt` 토글 폐지
- `gbIsSelfBuilt`는 `gbBuildingAcquisitionCause === "newConstruction"` 에서 자동 도출
- §114조의2 가산세 안내 배지는 "건물 취득일" 카드 내 즉시 표시

---

## 케이스 인벤토리

### 토지 취득시기 법리 (사전 정리, 리스크 #1 반영)

법령 정확성 — 상속·증여 토지의 취득시기는 다음과 같이 분기됩니다:

| 토지 acquisitionCause | LTHD 보유기간 기산점 (§98 + 영 §162①5호) | 환산취득가 분자(취득시 기준시가) 시점 |
|---|---|---|
| `purchase` | 매매계약일·잔금일·등기접수일 (영 §162①·②) | 동일 |
| `inheritance` | **상속개시일** (피상속인 취득일 아님) | 상속개시일 시점 기준시가 |
| `gift` | **증여일** | 증여일 시점 기준시가 |
| `carryover_gift` (배우자·직계존비속 §97의2) | **증여자(피이월자) 취득일** ← 이월과세 핵심 | 증여자 취득일 시점 기준시가 |

→ "토지 취득일" 필드 의미는 항상 **세법상 취득시기**(LTHD·환산 분자 기산점). 자산-수준 `decedentAcquisitionDate` / `donorAcquisitionDate` 등 보조 필드는 이월과세·상속 보충적평가 등 별도 입력 — 본 plan에서는 그대로 유지(영향 없음).

### 인벤토리 표 (10행으로 확장)

| # | 시나리오 | 토지 acqCause | 건물 acqCause | 토지 취득일 의미 | 건물 취득일 | 가산세 |
|---|---|---|---|---|---|---|
| 1 | **사례 31 본 (토지+건물 동시 매매)** | purchase | purchase | 매매 잔금일 1999-05-24 | 동일 | 미적용 |
| 2 | **사례 32 본 (토지 매매 + 건물 신축)** | purchase | newConstruction | 2008-03-17 | 사용승인일 2018-03-31 | **5% 발동** |
| 3 | 토지 매매 + 건물 매매 (취득일 다름) | purchase | purchase | A | B (≠A) | 미적용 |
| 4-a | 토지 상속(일반) + 건물 신축 | inheritance | newConstruction | **상속개시일** | 사용승인일 | **5% 발동** |
| 4-b | 토지 상속이월과세 + 건물 신축 (드뭄) | (해당 없음 — 이월과세는 증여만) | — | — | — | — |
| 5 | 토지 증여(일반) + 건물 매매 | gift | purchase | **증여일** | 매매 취득일 | 미적용 |
| 6 | 토지·건물 모두 상속 | inheritance | inheritance | 상속개시일 | 동일 | 미적용 |
| 7-a | 토지 증여(일반) + 건물 신축 | gift | newConstruction | 증여일 | 사용승인일 | **5% 발동** |
| 7-b | **토지 증여이월과세(§97의2) + 건물 신축** | carryover_gift | newConstruction | **증여자 취득일** | 사용승인일 | **5% 발동** + 이월과세 |
| 8 | (validate) 건물 취득원인 미선택 → 차단 (silent fallback 금지) | * | undefined | * | undefined | 차단 |

**규칙**: 행 10개 → Do 단계 진입 가능.

**anchor 약속**:
- #1, #2 → 기존 사례 31 38 anchor + 사례 32 30 anchor 회귀 보존
- #3 → 신규 anchor 1 (취득일 분리)
- #4-a → 신규 anchor 1 (상속 토지 + 신축)
- #4-b → "이월과세는 증여만 적용 (§97의2 ①)" 회귀 가드 (해당 케이스 차단)
- #5 → 신규 anchor 1 (증여 토지)
- #6 → 신규 anchor 1 (전체 상속)
- #7-a → 신규 anchor 1 (증여 + 신축)
- #7-b → **신규 anchor 1 (이월과세 + 신축)** — `carryoverTaxation` 객체 + 건물 §114조의2 동시 발동 통합 검증
- #8 → validate 차단 가드 1

총 신규 anchor 6 + 회귀 가드 2 + 사례 31·32 회귀.

**리스크 #1 해소**: 토지 취득시기 표기를 "상속개시일"·"증여일"·"증여자 취득일(이월과세)"로 정확화. 케이스 #7-b를 명시적으로 enumerate하여 anchor에 포함 → §97의2 이월과세와 §114조의2 가산세 cross-cutting 회귀 보호.

---

## UI 디자인 (Mockup)

### 변경 전 (현재)

```
[자산종류: 일반건물(토지+건물 일괄)]

취득 원인
[매매] [상속] [증여] [이월과세(증여)] [신축(자가건축)]   ← 5번째가 중복

취득일
[ 2008 - 03 - 17 ]   ← 토지 취득일이지만 라벨 미명시

취득가액 산정 방식
[실거래가] [환산취득가] [감정가액]

일반건물 (토지·건물 분리 산정)
  ① 면적·규모
  ② 양도시 기준시가
  ③ 취득시 기준시가
  ⑤ 신축 정보   ← 별도 섹션
    [자가건축(신축취득) 토글]   ← 중복
    건물 취득일: [ 2018 - 03 - 31 ]
    ⚠ 가산세 안내
  ④ 비사업용토지 판정
```

### 변경 후 (A안)

```
[자산종류: 일반건물(토지+건물 일괄)]

┌─────────────────────────────────────┐
│ 📌 토지 취득                         │
│   취득원인: [매매] [상속] [증여] [이월과세]│
│   취득일:   [ 2008 - 03 - 17 ]      │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ 🏗 건물 취득                         │
│   취득원인: [매매] [상속] [증여] [신축(자가건축)] │
│   취득일:   [ 2018 - 03 - 31 ]      │
│             ↳ 사용승인서 교부일·사실상 사용일· │
│               임시사용승인일 중 빠른 날 (§162①4호) │
│   ⚠ 환산취득가액 가산세 적용 — 5% (§114조의2 ①) │
│     (건물 취득원인=신축 + 5년 이내 양도 시 자동) │
└─────────────────────────────────────┘

취득가액 산정 방식
[실거래가] [환산취득가] [감정가액]

일반건물 (토지·건물 분리 산정)
  ① 면적·규모
  ② 양도시 기준시가
  ③ 취득시 기준시가
  ④ 비사업용토지 판정
```

**색상**: 토지 카드 = sky tone, 건물 카드 = amber tone (기존 ③ 취득시 기준시가와 동일).
**번호**: ⑤ 신축 정보 섹션 제거 → 일반건물 섹션은 ①②③④ 4개만 유지.

---

## 폼 상태 변경

### 폐지 (1) — 타입에서 완전 제거 (리스크 #2)

```ts
// AssetForm 자산-수준
gbIsSelfBuilt: boolean;          // ❌ 타입에서 삭제 (deprecated 패턴 거부)
                                  //    legacy sessionStorage 데이터는 normalizeAsset M-1에서
                                  //    1회 변환 후 delete a.gbIsSelfBuilt
```

### 신규 (1)

```ts
// AssetForm 자산-수준
gbBuildingAcquisitionCause?:
  | "purchase"
  | "inheritance"
  | "gift"
  | "carryover_gift"   // §97의2 이월과세 (배우자·직계존비속) — 기존 enum과 동일
  | "newConstruction"; // 신축(자가건축) — §114조의2 가산세 발동 키
//
// general_building 자산종류에서만 의미 있음. 다른 자산종류에서는 undefined.
// validate ⑧에서 general_building 시 필수 강제.
```

### 유지 (의미만 변경)

| 필드 | 현재 의미 | 변경 후 의미 |
|---|---|---|
| `acquisitionCause` | 자산-수준 단일 취득원인 | **토지** 취득원인 (general_building 한정) |
| `acquisitionDate` | 자산-수준 단일 취득일 | **토지** 취득일 (general_building 한정) |
| `gbBuildingAcquisitionDate` | 신축 시 사용승인일 | **건물** 취득일 (모든 building acq cause 공통) |

**다른 자산종류(housing/land/building 등)에서는** `acquisitionCause`·`acquisitionDate` 의미 그대로 유지 — 영향 없음.

---

## 엔진 input 영향

### `GeneralBuildingInput` 변경

```ts
// 기존
isSelfBuilt?: boolean;          // ⛔ 변경 없음 (라우트 헬퍼에서 도출)
buildingAcquisitionDate?: Date; // ✅ 그대로

// 신규
buildingAcquisitionCause?: "purchase" | "inheritance" | "gift" | "newConstruction";
//   라우트 헬퍼에서 isSelfBuilt = (buildingAcquisitionCause === "newConstruction")
//   현재 acquisitionCause(=토지) 와 별도로 building 카드의 자체 취득원인.
```

### 라우트 헬퍼 (`general-building-route-helper.ts`)

```ts
// dispatchGeneralBuilding() 내부 — silent fallback 제거 (리스크 #3)
// Zod에서 buildingAcquisitionCause 필수 강제 + normalizeAsset M-2 보완
//   → 이 시점에서 항상 정의된 값 보장
const buildingAcqCause = coercedGbRaw.buildingAcquisitionCause as
  | "purchase" | "inheritance" | "gift" | "carryover_gift" | "newConstruction";
const isSelfBuilt = buildingAcqCause === "newConstruction";

// buildProperties() 건물 카드:
//   acquisitionCause: buildingAcqCause,           // 건물 자체 취득원인
//   isSelfBuilt: isBuilding && isSelfBuilt,
//   constructionDate: isBuilding && isSelfBuilt ? card.buildingAcquisitionDate : undefined,
//   decedentAcquisitionDate / donorAcquisitionDate:
//     건물 취득원인이 inheritance/gift/carryover_gift일 때만 의미 있음.
//     기존 자산-수준 필드를 건물에 매핑할지, 별도 필드(gbBuildingDecedent... 등)로 분리할지는
//     Design 단계에서 케이스 #4-a, #6, #7-b anchor 조립 시 결정.
//     (잠정: 건물 상속·증여 케이스는 사례문제 PDF 발견 후 해당 anchor와 함께 후속 PR로 분리)
```

### 토지 카드 영향

토지 카드는 `acquisitionCause = (자산-수준 acquisitionCause)` — 변경 없음.
단 다음 분기 의미가 명확해짐:
- `acquisitionCause === "inheritance"` → 토지가 상속 → `decedentAcquisitionDate` 적용
- `acquisitionCause === "gift"` → 토지가 증여 → `donorAcquisitionDate` 적용
- 건물에는 별개로 `buildingAcquisitionCause` 적용

---

## 14개 동기화 지점 변경 매트릭스

| # | 지점 | 변경 |
|---|---|---|
| ① | FormData 타입 | `gbIsSelfBuilt` **타입에서 제거**, `gbBuildingAcquisitionCause` 추가 (5개 enum) |
| ② | initial value | `gbBuildingAcquisitionCause: undefined` 추가. `gbIsSelfBuilt` 초기값 제거 |
| ③ | normalize fallback | **M-1**: legacy `gbIsSelfBuilt` 1회 변환 후 `delete`. **M-2**: 사례 31 호환 — `gbBuildingAcquisitionCause` 미입력 시 `acquisitionCause`로 명시 채워넣기 |
| ④ | API 변환 | `buildGeneralBuildingValuation()`: `buildingAcquisitionCause` 전달 (`isSelfBuilt` 제거) |
| ⑤ | UI 입력 위젯 | **AssetForm 취득 정보 영역 재구성** — 일반건물 시 토지/건물 2카드. ⑤ 신축 정보 섹션 제거. 가산세 안내 배지를 건물 카드 내 이동 |
| ⑥ | 사이드바 합계 | 변경 없음 |
| ⑦ | 결과 카드 산식 | 변경 없음 (가산세 라인 그대로) |
| ⑧ | validation | (a) `general_building` + `!gbBuildingAcquisitionCause` → 차단. (b) `gbBuildingAcquisitionCause === "newConstruction"` + `!gbBuildingAcquisitionDate` → 차단 (silent fallback 금지 — 리스크 #3) |
| ⑨~⑩ | Zod enum | (메인) `acquisitionCause` enum 그대로 5개 옵션. (companion) 변경 없음 |
| ⑪ | acquisitionDate fallback | 변경 없음 (기존 fallback 패턴 유지) |
| ⑫ | **Zod 입력 객체** ★ | `generalBuildingValuationSchema.buildingAcquisitionCause: z.enum([...])` (`.optional()` **없음** — 필수 강제). `isSelfBuilt` 필드 **삭제** (deprecated 표시 거부) |
| ⑬ | callTransferTaxAPI body spread | 변경 없음 |
| ⑭ | **Route handler 매핑** ★ | `dispatchGeneralBuilding`에서 `isSelfBuilt = buildingAcqCause === "newConstruction"` 도출. **fallback 없음** — Zod·normalize·validate 3중 보장으로 항상 정의됨 |

---

## 마이그레이션 전략 (sessionStorage 호환)

기존 사용자가 sessionStorage에 저장한 legacy 데이터 처리.

### A안 채택 — 명시적 마이그레이션 + 필드 자체 제거 (리스크 #2 해소)

**deprecated 유지 패턴 거부**. legacy 진실 원천이 남으면 6개월 후 누군가 `gbIsSelfBuilt`로 분기를 추가해 사례 32 회귀 발생.

```ts
// lib/stores/calc-wizard-asset-factory.ts (또는 동등 normalize 위치)
function normalizeAsset(a: AssetForm): AssetForm {
  // ...

  // (M-1) gbIsSelfBuilt 폐지 마이그레이션 — 2026-05-10
  // 입력 시 무조건 변환 후 필드 자체 삭제 → 두 진실 원천 차단
  if ("gbIsSelfBuilt" in a) {
    const legacy = (a as { gbIsSelfBuilt?: boolean }).gbIsSelfBuilt;
    if (legacy === true && !a.gbBuildingAcquisitionCause) {
      a.gbBuildingAcquisitionCause = "newConstruction";
    }
    delete (a as { gbIsSelfBuilt?: boolean }).gbIsSelfBuilt;
  }

  // (M-2) 사례 31 호환 — 일반건물에서 gbBuildingAcquisitionCause 미입력 시
  //       토지 acquisitionCause로 명시적 채워넣기 (silent fallback 금지, 리스크 #3 해소)
  // 신규 입력은 UI/validate가 차단하므로 이 경로는 legacy sessionStorage만 진입.
  if (
    a.assetKind === "general_building"
    && !a.gbBuildingAcquisitionCause
    && a.acquisitionCause
  ) {
    a.gbBuildingAcquisitionCause = a.acquisitionCause;
    a.gbBuildingAcquisitionDate = a.gbBuildingAcquisitionDate || a.acquisitionDate;
  }

  return a;
}
```

**핵심 변경**:
- `gbIsSelfBuilt` 타입에서 제거. legacy 데이터는 normalize 1회 통과 후 영구 삭제.
- 사례 31 legacy 호환 — fallback이 아닌 **명시적 마이그레이션**. 신규 입력은 UI에서 두 필드 모두 입력하므로 이 경로 미사용.

### 라우트 헬퍼 fallback 제거 (리스크 #3 해소)

기존 plan의 다음 코드는 **삭제**:

```ts
// ❌ 삭제 — silent fallback (정책 #1 위반 우려)
const buildingAcqCause = coercedGbRaw.buildingAcquisitionCause ?? gbRaw.acquisitionCause;
```

대신:

```ts
// ✅ 명시적 — Zod 통과 후이므로 buildingAcquisitionCause 항상 존재
//    (없으면 normalizeAsset M-2 가 채워넣었거나, validate 차단됨)
const buildingAcqCause = coercedGbRaw.buildingAcquisitionCause as
  "purchase" | "inheritance" | "gift" | "carryover_gift" | "newConstruction";
const isSelfBuilt = buildingAcqCause === "newConstruction";
```

**Zod 스키마 변경**: `generalBuildingValuationSchema.buildingAcquisitionCause`는 **`.optional()` 제거** — Zod 단계에서 필수 강제. (단, sessionStorage legacy 호환을 위해 normalize 후 항상 채워지는 것이 보장됨.)

**validate 강화 (⑧)**:

```ts
// general_building + buildingAcquisitionCause 미입력 → 차단
if (
  asset.assetKind === "general_building"
  && !asset.gbBuildingAcquisitionCause
) {
  return {
    code: "general_building.building_acquisition_cause_required",
    message: "건물 취득원인을 선택하세요.",
  };
}
// general_building + newConstruction + 건물취득일 미입력 → 차단 (기존 가드)
if (/* ... */) { /* 기존 동일 */ }
```

---

## 변경 파일 (예상)

| 파일 | 변경 |
|---|---|
| `lib/stores/calc-wizard-asset.ts` | `AssetForm` 타입 — `gbIsSelfBuilt` deprecated, `gbBuildingAcquisitionCause` 추가 |
| `lib/stores/calc-wizard-asset-factory.ts` | initial + normalize 마이그레이션 |
| `lib/api/transfer-tax-schema.ts` | `generalBuildingValuationSchema` Zod 변경 |
| `lib/calc/transfer-tax-api-helpers.ts` | `buildGeneralBuildingValuation()` 변환 |
| `lib/calc/transfer-tax-validate.ts` | validation 가드 갱신 |
| `app/api/calc/transfer/route.ts` | engineInput 매핑 시 isSelfBuilt 도출 |
| `app/api/calc/transfer/general-building-route-helper.ts` | `dispatchGeneralBuilding` isSelfBuilt 도출 로직 |
| `lib/tax-engine/general-building-valuation.ts` | input 타입에 `buildingAcquisitionCause` 추가, 카드 acquisitionCause 분기 |
| `components/calc/transfer/AssetForm.tsx` (또는 동등) | **취득 정보 영역 재구성** — 일반건물 분기 시 2카드 |
| `components/calc/transfer/GeneralBuildingBlock.tsx` | ⑤ 신축 정보 섹션 제거, 가산세 안내 배지 위치 변경 |
| `__tests__/tax-engine/transfer-tax/general-building-case-31.test.ts` | 입력 마이그레이션 (`acquisitionCause: "purchase"`, `buildingAcquisitionCause: "purchase"`) |
| `__tests__/tax-engine/transfer-tax/general-building-case-32.test.ts` | 입력 마이그레이션 (`buildingAcquisitionCause: "newConstruction"` 명시) |
| 신규 `__tests__/.../general-building-acq-cause-matrix.test.ts` | 케이스 #3·#4-a·#5·#6·#7-a·#7-b (총 6 anchor) + #4-b·#8 회귀 가드 (총 8 it) |

**총 12파일** (11 수정 + 1 신규).

---

## 정책 점검 (PM 단계)

| 정책 | 적용 여부 |
|---|---|
| `feedback_no_silent_apportion_fallback.md` ★★★ | ✅ **3중 차단** — (a) Zod 필수 + (b) normalizeAsset M-2 명시 마이그레이션 + (c) validate ⑧ 차단. 라우트 헬퍼 `?? acquisitionCause` fallback **삭제**. 리스크 #3 해소. |
| `feedback_useeffect_store_mirror_forbidden.md` | ✅ 토지/건물 취득원인 변경 시 종속 필드(`gbBuildingAcquisitionDate` 등) 클리어는 onChange 핸들러에서 직접 |
| `feedback_design_law_cases.md` | ✅ 케이스 인벤토리 10행 enumerate (사례 31·32 + 토지 상속/증여/이월과세 × 건물 매매/신축 매트릭스 + validate 가드) |
| `feedback_pdca_session_efficiency.md` | ✅ 디자인 매트릭스에 마이그레이션 전략·법리(취득시기)·800줄 분할 신호 사전 포함 |
| `feedback_ui_input_path_enumeration.md` ★★★ | ✅ 토지 acqCause 4종(purchase/inheritance/gift/carryover_gift) × 건물 acqCause 5종(+newConstruction) = 20분기 사전 검토. 실제 anchor 7개 + 회귀 가드 2개로 압축 |
| `feedback_api_zod_schema_sync.md` ★★★ | ✅ 14개 동기화 지점 매트릭스 작성. 특히 ⑫ `buildingAcquisitionCause` `.optional()` **제거**(필수 강제) + ⑭ route handler fallback 제거 |
| **법령 정확성 (신규)** | ✅ 토지 취득시기 분기(상속개시일·증여일·증여자 취득일) 케이스 인벤토리 사전 정리. 케이스 #4-b "이월과세는 증여만 적용 (§97의2 ①)" 명시 |

---

## 검증 (Verification)

```bash
# 1. 사례 31 회귀 (38 anchor)
npx vitest run __tests__/tax-engine/transfer-tax/general-building-case-31.test.ts \
              __tests__/tax-engine/transfer-tax/general-building-case-31-bundled.test.ts

# 2. 사례 32 회귀 (30 anchor)
npx vitest run __tests__/tax-engine/transfer-tax/general-building-case-32.test.ts

# 3. 신규 케이스 매트릭스 anchor (#3·#4-a·#5·#6·#7-a·#7-b + #4-b·#8 가드)
npx vitest run __tests__/tax-engine/transfer-tax/general-building-acq-cause-matrix.test.ts

# 4. 전체 회귀
npx tsc --noEmit
npx vitest run

# 5. 브라우저 수동 확인
npm run dev
# → /calc/transfer → 자산종류 "일반건물" 선택
# → 토지 카드 / 건물 카드 분리 표시 확인
# → 사례 31 시나리오: 토지 매매 + 건물 매매 동일 취득일 → 결과 동일
# → 사례 32 시나리오: 토지 매매 + 건물 신축 → §114조의2 가산세 라인 자동 발동
# → sessionStorage 마이그레이션 확인 (legacy gbIsSelfBuilt=true 데이터 → newConstruction 자동 변환)
```

---

## 800줄 분할 점검

| 파일 | 현재 | 예상 후 | 신호 |
|---|---|---|---|
| `GeneralBuildingBlock.tsx` | ~310 | ~270 (⑤ 섹션 제거) | OK ↓ |
| `AssetForm.tsx` | (확인 필요) | +30~50 (토지/건물 2카드) | 확인 후 결정 |
| `lib/stores/calc-wizard-asset.ts` | 787 | ±0 | 임계 — 마이그레이션 추가 시 분할 검토 |
| `general-building-valuation.ts` | 508 | +5 | OK |
| `general-building-route-helper.ts` | ~365 | +10 | OK |

`calc-wizard-asset.ts`가 787줄 임계점 — Do 단계 진입 전 별도 분할 PR 선행 검토.

---

## 작업 순서 (PDCA 5단계)

1. **PM 단계**: 본 plan 승인 + 정책 6개 점검 ✅
2. **Design 단계**:
   - `docs/02-design/features/general-building-split-acquisition-cause.engine.design.md` 작성
   - `docs/02-design/features/general-building-split-acquisition-cause.ui.design.md` 작성
   - 케이스 매트릭스 8행, 14개 sync 매트릭스, 마이그레이션 시나리오 enumerate
3. **Do — 엔진 시니어**:
   - `GeneralBuildingInput`에 `buildingAcquisitionCause` 추가
   - `dispatchGeneralBuilding` isSelfBuilt 도출 로직
   - Zod 스키마 변경
   - 테스트 #1·#2 마이그레이션 + #3~#7 신규 anchor
4. **Do — UI 시니어**:
   - AssetForm 취득 정보 영역 재구성 (토지/건물 2카드)
   - GeneralBuildingBlock ⑤ 섹션 제거
   - sessionStorage 마이그레이션 (`normalizeAsset` 패치)
   - validation 가드 갱신
5. **Check**:
   - `ui-engine-sync-checker` (8개 sync point + ⑫⑭ 강조)
   - `transfer-tax-qa` (사례 31·32 회귀 + 신규 anchor)
   - 브라우저 수동 확인 (sessionStorage 마이그레이션 포함)
6. **Act**:
   - 메모리 갱신 (사례 31·32 메모리 본 변경 메모 추가)
   - CLAUDE.md "최근 완료" 갱신
   - 향후 케이스(상속·증여 토지 + 신축 건물 등) 가이드 메모 추가

---

## Status

| 단계 | 상태 |
|---|---|
| 1. PM/Plan | 🟡 본 문서 (승인 대기) |
| 2. Design | ☐ TODO |
| 3. Do | ☐ TODO |
| 4. Check | ☐ TODO |
| 5. Act | ☐ TODO |

---

## 비고

- **사용자 학습 부담**: 일반건물 자산종류 사용자에게는 UI가 변경됨. 기존 사용자가 "신축(자가건축)" 버튼을 찾지 못할 수 있음 → 건물 카드의 "신축(자가건축)" 옵션이 동일 위치에 그대로 보임으로 해소.
- **양도코리아 호환성**: 본 변경 후 양도코리아 UI(Image 2 사례 32 입력 화면)와 1:1 매핑. 책 사례 따라 입력하기 직관적.
- **확장성**: 향후 사례(토지 상속+건물 신축, 토지 증여+건물 매매 등)를 자연스럽게 수용. 현재 단일 acquisitionCause 구조는 이런 케이스 표현 불가 → 본 변경이 선행되어야 함.
