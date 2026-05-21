# 별지 제9호서식 부표 1 — 재산종류코드 정합화 계획서

> 2026-05-21 · feature: `inheritance-besshi-9-buppyo-1-property-code-alignment`
> 선행: PR-D KoreanLaw MCP 별지 검증 (`e87be7c`)
> 소관: `inheritance-gift-tax-ui-senior` (UI 라벨) · `inheritance-gift-tax-senior` (enum 정합)

## 1. 배경

PR-D (`e87be7c`)에서 별지 제9호서식 부표 1·2 의 KoreanLaw MCP 본문 확인 결과, 현행 `GiftPriorPropertyCategory` enum 라벨이 부표 1 양식의 재산종류코드와 일부 차이 발견:

| 현행 enum | 부표 1 양식 | 차이 |
|---|---|---|
| `real_estate_land` → "02 토지" | **02 토지I (순수토지)** · **03 토지II (일반건물 부수토지)** | 토지를 2종으로 분리해야 함 |
| `listed_stock` → "09 상장주식" | **09 유가증권(상장)** | 명칭 정정 |
| `unlisted_stock` → "10 비상장주식" | **10 유가증권(비상장)** | 명칭 정정 |
| `deposit` → "11 금융재산 (예금)" | **11 금융재산 (현금, 유가증권 제외)** | 보조 라벨 정정 |
| 미존재 | **04 개별주택**, **06 오피스텔·상업용건물**, **08 부동산을 취득할 수 있는 권리**, **13 가상자산**, **14 서화·골동품 등** | enum 미존재 — 부동산 분류 누락 |

## 2. KoreanLaw 본문 (부표 1 양식)

```
01 현금
02 토지I (순수토지)
03 토지II (일반건물의 부수토지)
04 개별주택 (부수토지 포함)
05 공동주택 (부수토지 포함)
06 오피스텔·상업용건물 (부수토지 포함)
07 일반건물 (부수토지 제외)
08 부동산을 취득할 수 있는 권리
09 유가증권 (상장)
10 유가증권 (비상장)
11 금융재산 (현금, 유가증권 제외)
12 기타재산
13 가상자산
14 서화·골동품 등 (시행령 §52② 2호)
```

재산구분코드 (별지 9호 부표 1·2 가산 증여재산 분류):
```
A11 상속재산 (상속인)
A12 상속재산 (상속인 외)
A13 상속개시 전 처분재산
A21 증여재산 가산 (상속인)
A22 증여재산 가산 (상속인 외)
A23 증여재산 가산 (창업자금 — 조특법 §30의5)
A24 증여재산 가산 (가업승계 — 조특법 §30의6)
B11 비과세재산 (금양임야)
B12 비과세재산 (공공단체 유증)
B13 비과세재산 (기타)
B21 과세가액불산입 (공익법인 출연재산)
B22 과세가액불산입 (공익신탁재산)
```

## 3. 변경 범위

### 3-1. `GiftPriorPropertyCategory` enum 확장 (`lib/tax-engine/types/inheritance-gift.types.ts:282-284`)

```ts
export type GiftPriorPropertyCategory =
  | "cash"                          // 01
  | "real_estate_land_pure"         // 02 토지I (NEW)
  | "real_estate_land_attached"     // 03 토지II (NEW)
  | "real_estate_individual_house"  // 04 개별주택 (NEW)
  | "real_estate_apartment"         // 05 공동주택 (기존)
  | "real_estate_officetel"         // 06 오피스텔·상업용 (NEW)
  | "real_estate_building"          // 07 일반건물 (기존)
  | "real_estate_acquisition_right" // 08 부동산 권리 (NEW)
  | "listed_stock"                  // 09 (기존)
  | "unlisted_stock"                // 10 (기존)
  | "financial"                     // 11 (기존)
  | "other"                         // 12 (기존)
  | "virtual_asset"                 // 13 가상자산 (NEW)
  | "artwork"                       // 14 서화·골동품 (NEW)
  ;
```

기존 `real_estate_land` · `deposit` 은 deprecated 처리:
- legacy 마이그레이션: `real_estate_land` → `real_estate_land_pure` (순수토지로 가정)
- `deposit` → `financial` 자동 변환

### 3-2. 재산구분코드 enum 신규

```ts
export type EstatePropertyKindCode =
  | "A11" | "A12" | "A13"
  | "A21" | "A22" | "A23" | "A24"
  | "B11" | "B12" | "B13" | "B21" | "B22";
```

`PriorGift.propertyKindCode?: EstatePropertyKindCode` 추가:
- 자연인 상속인 사전증여 → A21
- 자연인 비상속인 사전증여 → A22 (영리법인 포함)
- 조특법 §30의5 창업자금 → A23
- 조특법 §30의6 가업승계 → A24

자동 추론: `beneficiaryType` + `specialTreatment` 기반 default 값. 사용자 명시 입력은 옵션.

### 3-3. 라벨 매핑 (`PriorGiftInput.tsx:99-109` · `InheritanceFilingFormTable.tsx:37-47`)

```ts
const GIFT_PRIOR_CATEGORY_LABELS: Record<GiftPriorPropertyCategory, string> = {
  cash: "01 현금",
  real_estate_land_pure: "02 토지I (순수토지)",
  real_estate_land_attached: "03 토지II (일반건물 부수토지)",
  real_estate_individual_house: "04 개별주택 (부수토지 포함)",
  real_estate_apartment: "05 공동주택 (부수토지 포함)",
  real_estate_officetel: "06 오피스텔·상업용건물 (부수토지 포함)",
  real_estate_building: "07 일반건물 (부수토지 제외)",
  real_estate_acquisition_right: "08 부동산을 취득할 수 있는 권리",
  listed_stock: "09 유가증권 (상장)",
  unlisted_stock: "10 유가증권 (비상장)",
  financial: "11 금융재산 (현금, 유가증권 제외)",
  other: "12 기타재산",
  virtual_asset: "13 가상자산",
  artwork: "14 서화·골동품 등",
};
```

### 3-4. sessionStorage 마이그레이션

`lib/stores/calc-wizard-migration.ts` 또는 `inheritance` 마이그레이션 모듈에서:

```ts
function migratePriorGiftLegacyCategory(c: string | undefined): GiftPriorPropertyCategory | undefined {
  if (!c) return undefined;
  if (c === "real_estate_land") return "real_estate_land_pure";
  if (c === "deposit") return "financial";
  return c as GiftPriorPropertyCategory;
}
```

## 4. 14 동기화 지점

| # | 지점 | 변경 |
|---|---|---|
| ① 폼 상태 | GiftPriorPropertyCategory enum 확장 + propertyKindCode | 본 PR |
| ② initial | undefined 유지 (기존 fallback) | — |
| ③ normalize | legacy 매핑 — `real_estate_land` → `real_estate_land_pure` | 본 PR |
| ④ API 변환 | spread 자동 통과 | — |
| ⑤ UI 위젯 | PriorGiftInput select 옵션 6개 추가 | 본 PR |
| ⑥ 사이드바 | 변경 없음 | — |
| ⑦ 결과 카드 | InheritanceFilingFormTable 라벨 매핑 업데이트 | 본 PR |
| ⑧ Validation | enum 값 확장 — Zod 자동 | — |
| **⑨ Zod enum** | **priorGiftSchema.propertyCategory enum 신규 6 값 추가** | 본 PR |
| ⑩~⑭ | — | — |

## 5. 케이스 매트릭스

| # | 시나리오 | 입력 | 기대 |
|---|---|---|---|
| P1 | 신규 — 토지I 선택 | propertyCategory="real_estate_land_pure" | 라벨 "02 토지I (순수토지)" |
| P2 | 신규 — 토지II 선택 | propertyCategory="real_estate_land_attached" | 라벨 "03 토지II ..." |
| P3 | 신규 — 가상자산 | propertyCategory="virtual_asset" | 라벨 "13 가상자산" |
| P4 (회귀) | legacy "real_estate_land" import | sessionStorage 마이그레이션 | "real_estate_land_pure" 자동 변환 |
| P5 (회귀) | legacy "deposit" import | sessionStorage 마이그레이션 | "financial" 자동 변환 |
| P6 (회귀) | 기존 12 기타재산 | propertyCategory="other" | "12 기타재산" — 무변화 |
| P7 | propertyKindCode 자동 추론 | beneficiaryType="corporate" | A22 default |

## 6. anchor 검증

- ANCHOR-P1: legacy → 신규 enum 마이그레이션
- ANCHOR-P2: Zod 신규 enum 값 통과
- ANCHOR-P3: propertyKindCode 자동 추론 — beneficiaryType + specialTreatment 분기
- ANCHOR-P4 (회귀): 기존 코드 정상 동작

## 7. 작업량 예상

| 항목 | 변경 |
|---|---|
| GiftPriorPropertyCategory enum 확장 + EstatePropertyKindCode | ~30줄 |
| Zod priorGiftSchema | ~10줄 |
| 라벨 매핑 (PriorGiftInput · InheritanceFilingFormTable) | ~30줄 |
| sessionStorage 마이그레이션 | ~20줄 |
| anchor 4건 | ~120줄 |
| **합계** | **~210줄** |

## 8. Out-of-Scope

- 부표 5 영리법인 면제 명세 (별도 계획서)
- 상속세 모드 모달 활성화 (별도 계획서)
- 신고서 양식 별지 9호 부표 1·2 본문 컴포넌트 (현재는 InheritanceFilingFormTable 만 — 부표 1 합산 행은 미구현)

## 9. Definition of Done

- [ ] KoreanLaw MCP 부표 1 양식 본문 재확인 후 enum 값·라벨 동결
- [ ] GiftPriorPropertyCategory enum + propertyKindCode 확장
- [ ] Zod priorGiftSchema 신규 값
- [ ] PriorGiftInput · InheritanceFilingFormTable 라벨 매핑 동기화
- [ ] sessionStorage 마이그레이션 (legacy → 신규)
- [ ] anchor P1~P4 통과
- [ ] P4·P5·P6 회귀 보호
- [ ] `npx tsc --noEmit` 0건
- [ ] inheritance 회귀 0건

## 10. 우선순위

소규모 마이크로 PR (≤210줄). 부표 5 (계획서 2) 보다 먼저 적용 가능 — enum 확장은 부표 5 컴포넌트의 라벨 매핑 의존성. 권장 순서:

1. 본 PR (부표 1 enum 정합) — 1주 이내
2. 모달 활성화 PR (계획서 1) — UI 변경, 본 PR 의존성 없음
3. 부표 5 PR (계획서 2) — 본 PR + 모달 PR 완료 후
