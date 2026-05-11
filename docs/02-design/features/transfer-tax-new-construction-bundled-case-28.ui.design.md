# 양도소득세 사례 28 — 나대지 취득 후 주택 신축 일괄양도 UI 디자인

**작성일**: 2026-05-07  
**작성자**: transfer-tax-ui-senior  
**대응 엔진 디자인**: `transfer-tax-new-construction-bundled-case-28.engine.design.md`  
**계획서**: `.claude/plans/image-44-image-45-joyful-spark.md`  
**PDCA 단계**: Design

---

## 1. Context — 사용자 시나리오 (7단계)

사례 28 (예제 PDF): 갑氏가 2022.1.8 나대지(토지) 취득 후 2022.8.29 사용승인을 받아 주택을 신축하고, 2023.3.6 주택+부수토지를 일괄양도(4억)한 케이스.

| 단계 | 사용자 행동 | UI 반응 |
|---|---|---|
| 1 | Step1 → "자산 추가" → 자산종류 "주택" 선택 | 자산 카드 생성. 취득원인 라디오 그룹 표시 |
| 2 | 취득원인에서 **"신축(자가건축)"** 선택 | 사용승인일 DateInput 노출 + 영 §162①4호 helper-text 표시. isSelfBuilt=true 자동 설정 없음(별도 가산세 필드와 독립) |
| 3 | 사용승인일 2022.8.29 입력 / 취득가액 1억(신축비용) | 신축주택 취득일 기준: 영 §162①4호 안내 배지 유지 |
| 4 | 자산 카드 내 "건물 정착면적(㎡)" 입력 (123.12㎡) + "도시지역 여부" 토글 ON | 자동으로 부수토지 한도 계산 가능 상태 표시 |
| 5 | "동반자산 추가" → 토지 추가 (2022.1.8 취득, 1.5억, 206.6㎡, 공시지가 540,000원/㎡) | CompanionAssetCard 생성. 부수토지 한도 산정: 123.12×5=615.6㎡ ≥ 206.6㎡ → 전량 부수토지 |
| 6 | 양도일 2023.3.6, 일괄양도가액 4억, bundledSaleMode = apportioned | 주택 카드 상단에 "주택·부수토지 일체과세 자동 적용 중" 배지 노출. 건물 보유 약 6개월(1년 미만) → 자동 분기 조건 충족 |
| 7 | 결과 화면 확인: 세율 70%, 산출세액 103,250,000 / "토지 세율 수동 지정" 토글 ON → 라디오 60%/40%/누진 선택 가능 | 수동 오버라이드 전환 후 재계산 시 세율 변동 확인 |

---

## 2. 케이스 인벤토리 표 (엔진 디자인 1:1 정합)

> 엔진 디자인 케이스 매트릭스와 행 수 및 분류가 일치해야 함.

| # | 케이스 | 자동분기 조건 | UI 상태 | 세율 적용 | 결과 표시 |
|---|---|---|---|---|---|
| C-01 | 한도 내 + 자동 분기 (사례 28 본 케이스) | housing 1년 미만 + land companion + 면적 ≤ 5배 한도 + 수동 미지정 | 일체과세 배지 표시, 토글 OFF | companion 토지 70% | 단일 세율 행, 법령 주석 |
| C-02 | 한도 초과 + 도시지역(5배) | 동일. companion.area > footprint × 5 | 한도 초과 경고 배지 + 면적 분리 안내 | 한도 내 토지 70%, 초과분 40%(1년≤보유<2년) | 표에 "토지(부수)" + "토지(한도초과)" 행 분리 |
| C-03 | 한도 초과 + 도시지역 외(10배) | isUrbanArea=false + companion.area > footprint × 10 | 도시지역 외 배지 + 초과 경고 | 한도 내 70%, 초과분 보유기간 세율 | 표에 행 분리 동일 |
| C-04 | 수동 오버라이드 70% | manualHoldingPeriodOverride = "shortTermHousing70" | 토글 ON, 라디오 70% 선택 | 토지 70% 강제 | 세율 셀 "수동 지정 70%", 주석 없음 |
| C-05 | 수동 오버라이드 40% | manualHoldingPeriodOverride = "shortTerm60"  | 토글 ON, 라디오 40% 선택 (※계획서 enum명은 shortTerm60이나 UI 라벨은 "40%" — 엔진 설계서 확정 후 enum명 정렬 필요) | 토지 40% 강제 | 세율 셀 "수동 지정 40%", 주석 없음 |
| C-06 | 수동 오버라이드 누진 | manualHoldingPeriodOverride = "progressive" | 토글 ON, 라디오 "누진세율" 선택 | 누진세율 적용 | 세율 셀 "수동 지정(누진)" |
| C-07 | 건물 보유 12개월 정확히 (경계값) | acquisitionCause = "newConstruction" + 사용승인일 기준 보유 = 12개월 | 자동 분기 배지 미표시 (1년 미만 아님 — 1년 이상) | companion 토지 본래 세율 (1년≤보유<2년 → 40%) | 일체과세 배지 없음, 일반 세율 표시 |
| C-08 | 신축주택 취득일 = 사용승인일 | 취득원인 "신축" + occupancyApprovalDate 입력 | 사용승인일 DateInput 노출, 영 §162①4호 helper-text | 취득일 = 사용승인일 기준 보유기간 산정 | 취득일 라벨에 "사용승인일 기준" 주석 |
| C-09 | 신축주택 취득일 = 사실상 사용일 | 취득원인 "신축" + actualUseDate 입력 (사용승인일 없거나 사실상 사용일이 이전) | 사실상 사용일 DateInput 노출, "사용승인일보다 이른 경우 적용" 안내 | 취득일 = 사실상 사용일 기준 | 취득일 라벨에 "사실상 사용일 기준" 주석 |
| C-10 | 신축주택 취득일 = 임시사용승인일 | 취득원인 "신축" + temporaryApprovalDate 입력 (임시사용승인이 사용승인보다 이전) | 임시사용승인일 DateInput 노출 | 취득일 = 임시사용승인일 기준 | 취득일 라벨에 "임시사용승인일 기준" 주석 |
| C-11 | companion이 housing 아닌 일반 토지 단독 양도 | primary=housing이 아닌 경우 / companion=housing인 경우 | 자동 분기 배지 미표시, 토지 수동 오버라이드 토글 미노출 | 토지 본래 보유기간 세율 | 영향 없음 |

**총 11개 케이스** — 엔진 디자인 anchor 그룹(A·B·C·D) 총 20개 테스트와 매핑.

---

## 3. 신규 UI 위젯 명세

### 3.1 AssetForm 신규 필드 — 주택 자산 카드 (primary)

| 필드명 | 타입 | 용도 | 초기값 |
|---|---|---|---|
| `acquisitionCause` | `"purchase" \| "inheritance" \| "gift" \| "carryover_gift" \| "newConstruction"` | 신축주택 분기 트리거 | `"purchase"` |
| `occupancyApprovalDate` | `string` (YYYY-MM-DD) | 사용승인일 — 영 §162①4호 취득일 기준 | `""` |
| `actualUseDate` | `string` (YYYY-MM-DD) | 사실상 사용일 (사용승인 전 실사용 시) | `""` |
| `temporaryApprovalDate` | `string` (YYYY-MM-DD) | 임시사용승인일 | `""` |
| `buildingFootprintArea` | `string` | 건물 정착면적(㎡) — 부수토지 한도 산정 | `""` |
| `isUrbanArea` | `boolean` | 도시지역 여부 — 5배/10배 분기 | `true` |

> **주의**: `buildingFootprintArea`는 검용주택 `AssetForm`에 이미 존재(line 588). 신축주택 케이스에서 동일 필드를 재사용. normalize fallback은 검용주택 케이스와 동일 방식으로 처리.
>
> `acquisitionCause`에 `"newConstruction"` 추가 시 기존 `"purchase"` | `"inheritance"` | `"gift"` | `"carryover_gift"` enum에 새 값 추가. Zod 스키마(⑨), AssetForm 타입(①), validate(⑧) 모두 동기화 필요.

### 3.2 AssetForm 신규 필드 — 동반 토지 자산 (companion)

| 필드명 | 타입 | 용도 | 초기값 |
|---|---|---|---|
| `manualHoldingPeriodOverride` | `"shortTermHousing70" \| "shortTerm60" \| "progressive" \| undefined` | 부수토지 세율 수동 오버라이드 | `undefined` |

> `CompanionAssetForm = AssetForm` 타입 별칭 사용 중. `AssetForm`에 필드 추가 → companion 카드에 자동 반영.

### 3.3 취득원인 라디오 — "신축(자가건축)" 옵션 추가

**위치**: `components/calc/transfer/CompanionAssetCard.tsx` 내 `ACQUISITION_CAUSE_OPTIONS` 배열 (line 39-44)

현재 옵션:
```
["매매", "상속", "증여", "이월과세(증여)"]
```

변경 후:
```
["매매", "상속", "증여", "이월과세(증여)", "신축(자가건축)"]
```

**컴포넌트**: `RadioCardGroup` — layout="inline". tone="amber" (취득 정보).

**선택 시 동작**:
- `acquisitionCause: "newConstruction"` 설정
- 사용승인일 DateInput 슬롯 노출 (조건부 렌더)
- 영 §162①4호 helper-text 배지 표시
- `isSelfBuilt` = true 자동 설정 안 함 (§114조의2 가산세 판정 토글과 독립)

### 3.4 신축주택 취득일 입력 블록 — `NewConstructionDateBlock` (신규 컴포넌트)

**위치**: `components/calc/transfer/NewConstructionDateBlock.tsx` (신규 파일)  
**렌더 조건**: `asset.acquisitionCause === "newConstruction"`  
**배치**: 취득원인 라디오 바로 아래, 취득일 DateInput 위

```
[amber ToggleCard 느낌의 색상 섹션]
  ① 사용승인일 (영 §162①4호 — 취득일 기준)
     DateInput — 사용승인일·사용검사필증 교부일
     hint: "자가건축 주택의 취득일은 사용승인일(영 §162①4호) 기준입니다."

  ② 임시사용승인일 (사용승인일보다 이른 경우에만)
     DateInput — optional
     hint: "임시사용승인일이 사용승인일보다 이른 경우 입력하세요."

  ③ 사실상 사용일 (사용승인 전 실제 사용 시)
     DateInput — optional
     hint: "사용승인일 전 실제 입주·사용한 경우 입력하세요."

  [자동 판정 안내 박스]
  "위 세 날짜 중 가장 이른 날이 취득일로 적용됩니다."
```

**섹션 색상**: amber (취득 정보 tone).  
**컴포넌트 구조**: 다-섹션 패턴 (3개 서브섹션 → 색상 카드 + 원형 번호 ①②③).

### 3.5 건물 정착면적 + 도시지역 입력 — `FootprintAreaSection` (신규 or 기존 확장)

**위치**: 주택 자산 카드 내. 신축주택 케이스 + 동반 토지가 있을 때 노출.  
**렌더 조건**: `asset.acquisitionCause === "newConstruction" && hasCompanionLand`

```
[sky 색상 카드 — 면적·규모 섹션]
  "부수토지 한도 산정 (영 §154⑦)"

  건물 정착면적 (㎡)
  DecimalInput — 소수점 2자리 허용
  hint: "건물이 지면에 접한 1층 바닥면적(㎡)을 입력하세요."

  도시지역 여부
  RadioCardGroup — layout="inline"
    옵션: ["도시지역 (5배 한도)", "도시지역 외 (10배 한도)"]
    hint: "국토계획법상 도시지역 내 소재하면 '도시지역' 선택."

  [자동 계산 결과 박스 — amber]
  "부수토지 인정 한도: {건물정착면적} × {5 또는 10} = {한도면적}㎡"
  "동반 토지 면적 {companion.area}㎡ → {한도 내 / 한도 초과 X.XX㎡} 판정"
```

> `buildingFootprintArea` 필드는 검용주택에서 이미 사용 중(line 588). 신축 케이스에서 **동일 필드 재사용** — 별도 필드 신설 금지. 렌더 조건만 확장.

### 3.6 일체과세 자동 적용 배지 (주택 자산 카드 상단)

**렌더 조건**:
```
primary.acquisitionCause === "newConstruction"
&& 사용승인일 기준 보유 < 12개월
&& companion 자산 중 assetKind === "land"인 것이 있음
&& companion.area <= primary.buildingFootprintArea × (isUrbanArea ? 5 : 10)
&& companion.manualHoldingPeriodOverride === undefined
```

**배지 스타일**: `bg-amber-100 border border-amber-300 text-amber-800 rounded px-2 py-1 text-xs`

**텍스트**: "주택·부수토지 일체과세 자동 적용 중 (§89·영 §154⑦, 재산-53·재산-1354)"

### 3.7 한도 초과 경고 배지 (조건부)

**렌더 조건**: `companion.area > primary.buildingFootprintArea × (isUrbanArea ? 5 : 10)`

**배지 스타일**: `bg-rose-100 border border-rose-300 text-rose-800 rounded px-2 py-1 text-xs`

**텍스트**: "부수토지 한도 초과 {초과면적.toFixed(2)}㎡ — 초과분은 일반 토지로 분리과세됩니다 (§154⑦)"

### 3.8 토지 세율 수동 지정 토글 + 라디오 — companion 토지 카드

**위치**: `components/calc/transfer/CompanionAssetCard.tsx` — 동반 토지 자산 카드 하단  
**렌더 조건**: `companion.assetKind === "land"` (신축 케이스 외에도 일반적으로 표시하되, 자동 분기 배지 없을 때는 숨김 또는 별도 설명으로 표시)

```
[ToggleCard — tone="amber"]
  title: "토지 세율 수동 지정"
  description: "자동 분기 결과를 직접 변경합니다 (전문가 검토 후 사용)."
  checked: companion.manualHoldingPeriodOverride !== undefined
  ON 시:
    RadioCardGroup — layout="stack"
      options:
        - value: "shortTermHousing70", label: "70% — 단기보유 주택 세율 적용"
        - value: "shortTerm60",        label: "40% — 1년~2년 보유 토지 세율 적용"
                                                  (※ enum명은 엔진 설계서 확정 후 맞춤)
        - value: "progressive",        label: "누진세율 — 기본세율 적용"
```

**OFF 상태**: `bg-amber-50/70` 배경 유지 (가시성 원칙).

---

## 4. 결과 화면 변경

### 4.1 FilingFormTable 세율 셀 주석

**파일**: `components/calc/results/transfer/FilingFormTableHelpers.ts` (및 `FilingFormTableAggregateHelpers.ts`)

세율 행 (`taxRate` rowKey) 셀에 자동 분기 메타데이터가 있을 때 한국어 주석 노출:

**자동 분기 시**:
```
70%
(주택·부수토지 일체과세 — §89·영 §154⑦)
(기재부 재산-53(2015.1.15) / 재산-1354(2022.10.27))
```

**수동 오버라이드 시**: 주석 없음. 셀 값만 표시 (예: "70% (수동지정)").

### 4.2 한도 초과분 분리 표시 (FilingFormTable)

한도 초과 케이스에서 결과 표의 자산 열이 분리됨:

| 항목 | 합계 | 주택 | 토지(부수) | 토지(한도초과) |
|---|---|---|---|---|
| 취득일 | — | 2022-08-29 | 2022-01-08 | 2022-01-08 |
| 보유기간 | — | 6개월 | 14개월 | 14개월 |
| 양도가액 | 400,000,000 | ... | ... | ... |
| 세율 | — | 70% | 70%(일체과세) | 40% |

**한국어 풀어쓰기 원칙**: "양도가액 400,000,000 × 토지 기준시가 비율 → 토지(부수) 양도가액 X / 토지(한도초과) 양도가액 Y"

**변수 약어 금지**: `P_F`, `R_T` 등 코드 변수명 노출 금지. 모든 숫자에 한국어 라벨.

### 4.3 결과 화면 산식 표시 원칙 (사례 28 기준)

```
[양도가액 배분]
  기준시가 비율 안분 (§166⑥)
  토지 양도가액: 양도가액 400,000,000 × 토지 기준시가 217,540,000 / 전체 기준시가 합계 → 217,542,381
  건물 양도가액: 400,000,000 × 건물 기준시가 / 전체 기준시가 합계 → 182,457,619

[세율 적용]
  주택 보유기간: 2022.8.29 → 2023.3.6 (6개월 7일) — 1년 미만
  부수토지 일체과세 원리(§89①3호·영 §154⑦)에 따라 토지에도 주택 세율 70% 적용
  → 토지·건물 양도차익 합계 150,000,000 전액에 70% 세율 적용
  산출세액: 과세표준 147,500,000 × 70% = 103,250,000
```

---

## 5. 14개 동기화 지점 매핑 표

### 클라이언트 8개

| # | 지점 | 파일 경로 | 변경 내용 |
|---|---|---|---|
| ① | 폼 상태 타입 | `lib/stores/calc-wizard-asset.ts` | `acquisitionCause` enum에 `"newConstruction"` 추가. `occupancyApprovalDate`, `actualUseDate`, `temporaryApprovalDate`, `isUrbanArea` 필드 추가. `manualHoldingPeriodOverride` 필드 추가 (AssetForm 공용 — companion 포함) |
| ② | initial value | `lib/stores/calc-wizard-asset-factory.ts` → `makeDefaultAsset`, `makeDefaultCompanionAsset` | 신규 필드 초기값: `occupancyApprovalDate: ""`, `actualUseDate: ""`, `temporaryApprovalDate: ""`, `isUrbanArea: true`, `manualHoldingPeriodOverride: undefined` |
| ③ | normalize fallback | `lib/stores/calc-wizard-asset-factory.ts` → `migrateAsset` | 기존 sessionStorage에 없는 신규 필드는 초기값으로 fallback. `acquisitionCause`가 없거나 알 수 없는 값이면 `"purchase"` fallback |
| ④ | API 변환 | `lib/calc/transfer-tax-api.ts` | `acquisitionCause === "newConstruction"` 시 페이로드에 `occupancyApprovalDate`, `actualUseDate`, `temporaryApprovalDate`, `isUrbanArea`, `buildingFootprintArea` 포함. companion 빌드 시 `manualHoldingPeriodOverride` 포함 |
| ⑤ | UI 입력 위젯 | `components/calc/transfer/CompanionAssetCard.tsx`, `NewConstructionDateBlock.tsx` (신규), `FootprintAreaSection` 추가 | 취득원인 "신축" 옵션 + 사용승인일 블록 + 건물정착면적+도시지역 섹션 + 일체과세 배지 + companion 수동 토글 |
| ⑥ | 사이드바 합계 | 해당 없음 | 영향 없음. `computeTransferSummary`는 기존 양도가액·취득가액 합계만 사용 |
| ⑦ | 결과 카드 산식 | `components/calc/results/transfer/FilingFormTableHelpers.ts`, `FilingFormTableAggregateHelpers.ts` | 세율 셀 주석(일체과세 법령 근거), 한도 초과 시 토지 행 분리 |
| ⑧ | Validation | `lib/calc/transfer-tax-validate.ts` | 신축 케이스: 사용승인일 필수 검증. 건물정착면적 > 0 검증. `manualHoldingPeriodOverride` 유효값 검증. acquisitionCause = "newConstruction" 시 기존 "purchase" fallback 없이 명시 차단 |

### API/Route 6개 (⑫⑬⑭ TypeScript 미감지 — 특히 주의)

| # | 지점 | 파일 경로 | 변경 내용 | TypeScript 감지 여부 |
|---|---|---|---|---|
| ⑨ | Zod enum (메인) | `lib/api/transfer-tax-schema.ts` | `acquisitionCause` enum에 `"newConstruction"` 추가 | 감지됨 |
| ⑩ | Zod enum (서브) | `lib/api/transfer-tax-schema-sub.ts` → `companionAssetSchema` | `manualHoldingPeriodOverride: z.enum(["shortTermHousing70", "shortTerm60", "progressive"]).optional()` 추가 | 감지됨 |
| ⑪ | acquisitionDate fallback | `lib/api/transfer-tax-schema.ts` 또는 route handler | 신축주택 케이스: `occupancyApprovalDate` / `actualUseDate` / `temporaryApprovalDate` 중 가장 이른 날을 취득일로 사용하는 로직 | 감지됨 |
| ⑫ | Zod 입력 객체 정의 | `lib/api/transfer-tax-schema.ts` (메인 입력 스키마) | 신축주택 관련 필드(`occupancyApprovalDate`, `actualUseDate`, `temporaryApprovalDate`, `buildingFootprintArea`, `isUrbanArea`)를 Zod 스키마에 명시적으로 선언. **미정의 시 침묵 stripping 발생** | **미감지** |
| ⑬ | callTransferTaxAPI body spread | `lib/calc/transfer-tax-api.ts` | fetch body 조립 시 신규 필드가 실제로 포함되는지 grep 자가 점검. 헬퍼 함수에만 추가하고 메인 body에 spread 누락하는 패턴 차단 | **미감지** |
| ⑭ | Route handler 엔진 매핑 | `app/api/calc/transfer-tax/route.ts` | Zod 통과 후 엔진 input으로 신규 필드 forwarding. `occupancyApprovalDate` 등 Date 변환 포함 (`toOptionalDate` 사용) | **미감지** |

> **⑫⑬⑭ TypeScript 미감지 경고**: 이 세 지점은 컴파일러가 누락을 감지하지 못한다. Do 단계에서 grep으로 자가 점검 필수:
> ```bash
> grep -n "occupancyApprovalDate\|manualHoldingPeriodOverride\|buildingFootprintArea" \
>   lib/api/transfer-tax-schema.ts lib/calc/transfer-tax-api.ts app/api/calc/transfer-tax/route.ts
> ```
> 세 파일 모두에서 각 필드가 검색되어야 완료.

---

## 6. 사이드바 합계 영향

**영향 없음** — 사이드바는 `computeTransferSummary`를 통해 양도가액·취득가액·필요경비·납부세액 5필드를 표시하며, 신규 필드(건물정착면적·도시지역·수동오버라이드)는 API 결과 후에야 세율 영향이 확정된다. 따라서 사이드바 합계 선택 노출 변경 없음.

---

## 7. 공통 UI 규칙 준수 확인

| 규칙 | 준수 방법 |
|---|---|
| DateInput 사용 | 사용승인일·임시사용승인일·사실상 사용일 모두 `DateInput` 컴포넌트. `type="date"` 직접 사용 금지 |
| DecimalInput 사용 | 건물 정착면적(㎡): `DecimalInput` + `parseDecimal`. `CurrencyInput` 사용 시 소수점 버그 발생 |
| ToggleCard | 도시지역 여부 = `RadioCardGroup`(양자택일). 수동 오버라이드 = `ToggleCard` + 내부 `RadioCardGroup`. native checkbox/radio 신규 작성 금지 |
| RadioCardGroup | 취득원인 그룹 + 수동 세율 라디오 모두 `RadioCardGroup`. 미선택 옵션도 amber tone 배경 유지 |
| tone 배경 (OFF 상태) | 수동 오버라이드 ToggleCard: OFF 시 `bg-amber-50/70`, ON 시 `ring-1 ring-amber-200/50` |
| placeholder 숫자 예시 금지 | 건물 정착면적 placeholder: "건물이 지면에 접한 1층 바닥면적" — 숫자 예시 없음 |
| "원" 단위 결과 끝 표기 금지 | FilingFormTable 셀: "103,250,000" (끝에 "원" 없음) |
| 결과 산식 한국어 풀어쓰기 | "P_F" 등 변수 약어 금지. "양도가액 400,000,000 × 토지 기준시가 비율 → 217,542,381" 형식 |
| floor() 산식 표기 금지 | Math.floor() 묵시 처리. 중간 산술 결과 미표시 |
| SelectOnFocusProvider | 자동 전역 적용. `onFocus={(e) => e.target.select()}` 개별 추가 금지 |
| 법령 정확성 최우선 | "절세 효과" 등 납세자 유리 표현 금지. "§89·영 §154⑦에 따라 부수토지에 70% 적용" 형식 |

---

## 8. Zustand Selector 무한 루프 방지 점검

신규 필드 추가 시 다음 안티패턴을 주의:

### 금지 패턴
```tsx
// ❌ 매 렌더 새 객체 반환 — useSyncExternalStore 무한 루프
const buddoDetails = useTransferStore(state => ({
  buildingFootprintArea: state.assets[0]?.buildingFootprintArea,
  isUrbanArea: state.assets[0]?.isUrbanArea,
}));
```

### 허용 패턴
```tsx
// ✅ atomic selector
const buildingFootprintArea = useTransferStore(
  state => state.assets[0]?.buildingFootprintArea ?? ""
);
const isUrbanArea = useTransferStore(
  state => state.assets[0]?.isUrbanArea ?? true
);

// ✅ useMemo (계산된 파생값)
const buddoLimit = useMemo(() => {
  const area = parseFloat(buildingFootprintArea) || 0;
  return area * (isUrbanArea ? 5 : 10);
}, [buildingFootprintArea, isUrbanArea]);
```

### 일체과세 배지 계산도 동일 원칙
배지 표시 여부(companionArea, buddoLimit 비교)는 `useMemo`로 파생. `useEffect`로 store에 배지 상태를 저장하는 패턴 절대 금지 (useEffect → store 미러링 금지 정책).

---

## 9. 브라우저 수동 확인 시나리오 (7단계)

계획서 `.claude/plans/image-44-image-45-joyful-spark.md`의 검증 방법과 동일:

1. `/calc/transfer-tax` 진입
2. Step1: 자산 1 = 주택, 취득원인 "신축(자가건축)" 선택 → 사용승인일 `2022-08-29` 입력, 취득가액 `1억`
3. 건물 정착면적 `123.12` ㎡ 입력, 도시지역 선택
4. "동반자산 추가" → 토지: 취득일 `2022-01-08`, 취득가액 `1.5억`, 면적 `206.6㎡`, 공시지가 `540,000원/㎡`
5. 양도일 `2023-03-06`, 일괄양도가액 `4억`, bundledSaleMode = "기준시가 비율 안분"
6. **주택 카드 상단에** "주택·부수토지 일체과세 자동 적용 중" **배지 확인**
7. "계산하기" → 결과 화면:
   - 적용 세율 **70%** + "재산-1354" 주석 표시 확인
   - 산출세액 **103,250,000** / 지방소득세 **10,325,000** 일치 확인
8. 동반 토지 카드 → "토지 세율 수동 지정" 토글 ON → **40%** 선택 → 재계산 시 산출세액 변동 확인
9. **Network 탭**: request body에 `manualHoldingPeriodOverride`, `buildingFootprintArea`, `isUrbanArea`, `occupancyApprovalDate` 필드 포함 여부 확인

---

## 10. 수정 대상 파일 목록

### 기존 파일 수정

| 파일 경로 | 변경 성격 |
|---|---|
| `lib/stores/calc-wizard-asset.ts` | `acquisitionCause` enum 확장 + 신규 필드 3개 추가 (①) |
| `lib/stores/calc-wizard-asset-factory.ts` | `makeDefaultAsset`, `makeDefaultCompanionAsset`, `migrateAsset` (②③) |
| `lib/calc/transfer-tax-api.ts` | 신축 케이스 API 변환 + companion `manualHoldingPeriodOverride` (④⑬) |
| `lib/calc/transfer-tax-validate.ts` | 신축 케이스 validation 분기 추가 (⑧) |
| `lib/api/transfer-tax-schema.ts` | `acquisitionCause` enum 확장 + 신규 필드 Zod 정의 (⑨⑫) |
| `lib/api/transfer-tax-schema-sub.ts` → `companionAssetSchema` | `manualHoldingPeriodOverride` Zod 추가 (⑩) |
| `app/api/calc/transfer-tax/route.ts` | 엔진 input forwarding + Date 변환 (⑪⑭) |
| `components/calc/transfer/CompanionAssetCard.tsx` | 취득원인 라디오 "신축" 옵션 + 수동 오버라이드 토글 + 일체과세 배지 (⑤) |
| `components/calc/results/transfer/FilingFormTableHelpers.ts` | 세율 셀 주석 로직 추가 (⑦) |
| `components/calc/results/transfer/FilingFormTableAggregateHelpers.ts` | 한도 초과 행 분리 로직 (⑦) |

### 신규 파일 작성

| 파일 경로 | 역할 |
|---|---|
| `components/calc/transfer/NewConstructionDateBlock.tsx` | 신축주택 취득일 3-시점 입력 블록 (⑤) |
| `__tests__/tax-engine/transfer-tax/new-construction-bundled-case-28.test.ts` | anchor 테스트 20개 (엔진 시니어 작성) |

---

## 11. DoD 자가 점검 체크리스트

- [ ] 케이스 매트릭스 11개 행 모두 enumerate 완료 (엔진 디자인과 1:1 정합 확인 필요)
- [ ] 14개 동기화 지점 명세 완료 (특히 ⑫⑬⑭ TypeScript 미감지 영역 grep 점검 방법 명시됨)
- [ ] API fallback 추가 시 validation도 동기화 (⑧) — `"newConstruction"` → validate에서 동일하게 인식
- [ ] Zustand selector 무한 루프 방지 패턴 명시됨
- [ ] 공통 UI 규칙 7개 항목 준수 확인됨
- [ ] 브라우저 수동 확인 9단계 시나리오 명시됨
- [ ] `buildingFootprintArea` 중복 정의 방지 — 검용주택 기존 필드 재사용 확인
- [ ] 수정/신규 파일 목록 완비

---

## 부록 — 법령 근거 요약 (UI 안내 문구용)

| 법령 | 내용 | UI 노출 위치 |
|---|---|---|
| 소득세법 §89①3호 | 1세대1주택 + 부수토지 비과세 범위 규정 | 일체과세 배지 |
| 소득세법 시행령 §154⑦ | 부수토지 한도: 도시지역 5배, 도시지역 외 10배 | 한도 계산 안내 박스, 한도 초과 경고 |
| 소득세법 시행령 §162①4호 | 자가건축 주택 취득일 = 사용승인일 등 중 가장 이른 날 | 사용승인일 DateInput helper-text |
| 기재부 재산-53(2015.1.15) | 신축 주택+부수토지 일괄양도 시 토지도 주택 세율 적용 | FilingFormTable 세율 주석 |
| 기재부 재산-1354(2022.10.27) | 동 해석 재확인 | FilingFormTable 세율 주석 |
| 소득세법 §104①3호 단서 | 주택 1년 미만 보유: 70% | 세율 셀 |
| 소득세법 §104① 후단 | 복수 세율 해당 시 큰 산출세액 적용 | 결과 산식 보조 주석 |
