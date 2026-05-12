# 일반건물 비사업용토지 판정 — 수평투영면적 직접 입력 전환

## Context

### 현재 문제
일반건물(토지+건물 일괄, `assetKind === "general_building"`)의 비사업용토지 판정 시, 사용자에게 **건물 연면적**과 **건물 층수**를 입력받아 엔진이 자동으로 `바닥면적 추정값 = 연면적 ÷ 층수`를 계산하고 있다.

- 위치: `lib/tax-engine/general-building-valuation.ts:306` `const estimatedFloorArea = input.buildingArea / input.buildingFloors;`
- UI 표시 동일 계산: `components/calc/transfer/GeneralBuildingBlock.tsx:38-43` (참고용 추정값 박스)

### 모순 지점
1. **균등층 가정 오차**: 다층 건물에서 각 층 바닥면적이 다른 경우(필로티·테라스 등) 추정값과 실제값 괴리 → 비사업용 판정 결과 부정확.
2. 사용자는 건축물대장에서 **건축면적(=수평투영면적)** 또는 **1층 바닥면적**을 직접 확인할 수 있는데, 이를 무시하고 층수로 추정하는 것은 정밀도 저하.
3. `gbBuildingFloors` 필드는 **비사업용 판정 추정 외 다른 용도가 전혀 없음** (환산비율 — 기준시가만 사용 / 개산공제 — 연면적·기준시가 총액만 사용).

### 의도된 결과
- 사용자가 **건물 수평투영면적(㎡)** 을 직접 입력 → 엔진이 그대로 비사업용 판정에 사용.
- `gbBuildingFloors` 필드는 폐지. 입력 단순화 + 정밀도 향상.
- `gbBuildingArea`(연면적)는 유지 (개산공제·자산 식별 정보로 활용).

### 사용자 결정 사항
1. 층수 입력 **폐지** → 수평투영면적만 직접 입력
2. 입력란은 ① 면적·규모 섹션 내 (토지면적·연면적 아래)

---

## 변경 파일

### ① 폼 타입 (1번째 동기화 지점)
- `lib/stores/calc-wizard-asset.ts` (line 706~ 부근, gb* 필드 정의)
  - `gbBuildingFloors: string` 필드 **제거**
  - `gbBuildingFootprintArea: string` 필드 **추가** — JSDoc: "건물 수평투영면적(㎡). 건축물대장 건축면적 또는 1층 바닥면적. 비사업용토지 판정 기준 (소득세법 시행령 §168의8)"

### ② 초기값 (2번째 동기화 지점)
- `lib/stores/calc-wizard-asset-factory.ts:241` 부근 `makeDefaultAsset`
  - `gbBuildingFloors: ""` 제거
  - `gbBuildingFootprintArea: ""` 추가

### ③ 정규화·마이그레이션 (3번째 동기화 지점)
- `lib/stores/calc-wizard-asset-factory.ts:382` 부근 `migrateAsset`
  - `if (a.gbBuildingFloors === undefined) a.gbBuildingFloors = "";` 줄 제거
  - `if (a.gbBuildingFootprintArea === undefined) a.gbBuildingFootprintArea = "";` 추가
  - **레거시 흡수 로직**: legacy `gbBuildingFloors` + `gbBuildingArea`가 있고 `gbBuildingFootprintArea` 미입력 시 → `String(연면적 / 층수)` 로 자동 변환 후 legacy 키 삭제. sessionStorage 호환.

### ④ API 변환 (4번째 동기화 지점)
- `lib/calc/transfer-tax-api-helpers.ts` `buildGeneralBuildingValuation` (line 136~)
  - `parseInt(asset.gbBuildingFloors)` 제거
  - `parseDecimal(asset.gbBuildingFootprintArea)` 추가 (DecimalInput, 소수점 가능)
  - 미입력 시 undefined 반환 가드 갱신
  - 반환 객체: `buildingFloors` 키 제거, `footprintArea` 키 추가 (또는 동일 키명 `buildingFootprintArea`)

### ⑤ UI 입력 위젯 (5번째 동기화 지점)
- `components/calc/transfer/GeneralBuildingBlock.tsx`
  - `gbBuildingFloors` FieldCard 제거 (line 87-103)
  - 그 자리에 `gbBuildingFootprintArea` FieldCard 추가:
    ```tsx
    <FieldCard
      label="건물 수평투영면적"
      unit="㎡"
      hint="건축물대장 '건축면적' 또는 1층 바닥면적 (㎡). 비사업용토지 판정 기준이 되는 건물 정착면적입니다."
    >
      <DecimalInput
        value={asset.gbBuildingFootprintArea}
        onChange={(v) => onChange({ gbBuildingFootprintArea: v })}
      />
    </FieldCard>
    ```
  - `useMemo` `estimatedFloorArea` 추정 박스(line 38-45, 105-110) **제거** — 직접 입력이므로 추정 불필요
  - `import { useMemo } from "react"` 라인 정리

### ⑥ 사이드바 합계 (6번째 동기화 지점)
- `lib/stores/calc-wizard-store.ts` `computeTransferSummary` — `gbBuildingFloors` 참조 grep 후 없으면 변경 없음.

### ⑦ 결과 카드 (7번째 동기화 지점)
- `components/calc/results/GeneralBuildingValuationDetailCard.tsx` — `buildingFloors`·`estimatedFloorArea` 표시 부분이 있다면 `footprintArea` 직접 표시로 교체.
- `lib/tax-engine/general-building-valuation.ts:140-145` 부근 — 출력 필드 `estimatedFloorArea` (추정 바닥면적)을 `footprintArea` 로 명명 변경 검토. 결과 표시도 "추정 바닥면적" → "수평투영면적"으로 라벨 변경.

### ⑧ Validation (8번째 동기화 지점)
- `lib/calc/transfer-tax-validate.ts:203-236`
  - `if (!floors || floors < 1) return ${label}: 건물 층수를 입력하세요.;` 제거
  - 추가: `if (!parseDecimal(asset.gbBuildingFootprintArea)) return ${label}: 건물 수평투영면적을 입력하세요.;`

### ⑨⑩⑫ Zod 스키마 (9·10·12번째 동기화 지점)
- `lib/api/transfer-tax-schema.ts` 또는 `transfer-tax-schema-sub.ts` — `generalBuildingValuation` 스키마에서 `buildingFloors: z.number()` 제거, `footprintArea: z.number().positive()` 추가.

### ⑬⑭ 엔진 (Route handler 매핑은 변경 없음, 엔진 input 타입만)
- `lib/tax-engine/general-building-valuation.ts`
  - `GeneralBuildingInput` 타입(line 36-72): `buildingFloors: number` 제거, `footprintArea: number` 추가
  - 비사업용 판정 계산(line 303-308):
    ```typescript
    // 기존: const estimatedFloorArea = input.buildingArea / input.buildingFloors;
    // 신규: const footprintArea = input.footprintArea;
    const allowedLandArea = footprintArea * multiplier;
    const isWithinNblRatio = input.landArea <= allowedLandArea;
    ```
  - 출력 객체 `estimatedFloorArea` → `footprintArea` (또는 동일 키명 유지하며 의미만 명확화)

### 테스트
- `__tests__/tax-engine/transfer-tax/general-building-valuation.test.ts`
- `__tests__/tax-engine/transfer-tax/general-building-case-31.test.ts`
- `__tests__/tax-engine/transfer-tax/general-building-case-31-bundled.test.ts`
  - 입력에서 `buildingFloors: 2` 같은 값 제거
  - 동등 의미의 `footprintArea: <기존 buildingArea ÷ buildingFloors 결과>` 입력으로 교체 (anchor 결과 보존)
  - 사례 31 anchor: 기존 `buildingArea: 180.96, buildingFloors: 2` → `footprintArea: 90.48`

---

## 활용 기존 함수·패턴

| 기존 코드 | 위치 | 활용 방법 |
|---|---|---|
| `parseDecimal` | `components/calc/inputs/DecimalInput.tsx` | 수평투영면적도 소수점 입력이므로 동일 헬퍼 사용 |
| `LandPriceLookupField`·`FieldCard` 색상 카드 패턴 | `GeneralBuildingBlock.tsx` ① 섹션 | 신규 입력란도 같은 sky 카드 내부에 위치 — 새 컴포넌트 불필요 |
| 마이그레이션 흡수 패턴 | `calc-wizard-asset-factory.ts:383` (gbUseEstimatedAcquisition 흡수 로직) | 동일 패턴으로 floors → footprintArea 자동 변환 |
| `useEstimatedAcquisition` 단일 source-of-truth | 본 PDCA 직전 작업 결과 | 신규 입력란도 `useEstimatedAcquisition === true` 일 때만 의미 — 마운트 조건 그대로 |

---

## 회귀 영향

### Anchor 보존 전략
- 사례 31 입력값 `buildingArea: 180.96`, `buildingFloors: 2` → 직접 입력 `footprintArea: 90.48`
- 엔진 계산 결과 (`allowedLandArea = 90.48 × 3 = 271.44`)는 동일 → **모든 산출세액·납부세액 anchor 38개 보존**.
- 테스트 입력 객체만 키 교체.

### sessionStorage 레거시 호환
- 기존 사용자가 입력하던 `gbBuildingFloors: "2"` + `gbBuildingArea: "180.96"` 데이터는 마이그레이션 함수에서 `gbBuildingFootprintArea: "90.48"` 로 자동 흡수.
- 한 번 흡수 후 legacy 키 삭제 → 영구 정리.

---

## 검증 (Verification)

### 자동 테스트
```bash
npx tsc --noEmit                                          # 타입 0건
npx vitest run __tests__/tax-engine/transfer-tax/general-building-case-31.test.ts
npx vitest run __tests__/tax-engine/transfer-tax/general-building-case-31-bundled.test.ts
npx vitest run __tests__/tax-engine/transfer-tax/general-building-valuation.test.ts
npx vitest run __tests__/tax-engine/transfer-tax/      # 694건 회귀 보존
npm run check:pre-pr
```

### 브라우저 수동 확인
1. `npm run dev` → `/calc/transfer-tax`
2. 자산종류 = "일반건물(토지+건물 일괄)" + 라디오 = "환산취득가"
3. ① 면적·규모 섹션에 입력란 3개 확인:
   - 토지면적
   - 건물 연면적
   - **건물 수평투영면적** (신규)
   - ~~건물 층수~~ (제거됨)
4. 추정 바닥면적 박스가 사라지고 수평투영면적이 직접 입력값으로 표시됨
5. 사례 31 입력 (토지 400㎡, 연면적 180.96㎡, 수평투영면적 90.48㎡) → 결과 화면 비사업용 판정 = 사업용(부수토지 인정)
6. 수평투영면적을 작게 입력(예: 20㎡) → 비사업용 토지로 판정 전환 확인

### 레거시 sessionStorage 체크
- DevTools → Application → sessionStorage `transfer-tax-wizard` → 기존 `gbBuildingFloors: "2"` 항목이 있던 사용자 → 페이지 새로고침 시 `gbBuildingFootprintArea`로 자동 변환되어 입력값 유지.

---

## 14개 동기화 지점 매트릭스

| # | 지점 | 변경 |
|---|---|---|
| ① | 폼 타입 (AssetForm) | `gbBuildingFloors` 삭제, `gbBuildingFootprintArea` 추가 |
| ② | initial value | factory에서 키 교체 |
| ③ | normalize fallback | 레거시 흡수 로직 (floors → footprintArea 변환) |
| ④ | API 변환 | `buildGeneralBuildingValuation` 키 교체 |
| ⑤ | UI 입력 위젯 | GeneralBuildingBlock ① 섹션 — 층수 FieldCard 제거, 수평투영면적 FieldCard 추가, `useMemo` 추정 박스 삭제 |
| ⑥ | 사이드바 합계 | 영향 없음 (grep 확인) |
| ⑦ | 결과 카드 산식 | "추정 바닥면적" 라벨 → "수평투영면적" |
| ⑧ | Validation | floors 검증 제거, footprintArea 필수 검증 추가 |
| ⑨⑩⑫ | Zod enum/객체 | `generalBuildingValuation` 스키마 키 교체 |
| ⑪ | acquisitionDate fallback | 영향 없음 |
| ⑬ | callTransferTaxAPI body spread | 영향 없음 (객체 내부 키만 변경) |
| ⑭ | Route handler 매핑 | 영향 없음 |

---

## 작업 순서

1. **엔진 input/output 타입 변경** (`general-building-valuation.ts`) — 컴파일러가 모든 사용처를 감지
2. **API 변환·Zod 스키마** (`transfer-tax-api-helpers.ts` + `transfer-tax-schema.ts`)
3. **폼 타입·initial·migration** (`calc-wizard-asset.ts` + `calc-wizard-asset-factory.ts`)
4. **Validation** (`transfer-tax-validate.ts`)
5. **UI** (`GeneralBuildingBlock.tsx`) — 층수 FieldCard 제거 + 수평투영면적 FieldCard 추가 + useMemo 박스 제거
6. **결과 카드 라벨 정리** (필요 시)
7. **Anchor 테스트 입력값 키 교체** + 회귀 실행
8. **브라우저 수동 확인**
