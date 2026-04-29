# RadioCard 패턴 신설 및 적용 (Phase 3)

## Context

ToggleCard 마이그레이션(2026-04-29 완료) 후속 작업. 라디오 사용 7개 파일·9개 그룹·약 25개 라디오 입력에 동일한 가시성 원칙(OFF에도 tone 배경)을 적용한다. 현재는 카드형(`Step2Separated`의 `has-[:checked]:`)과 인라인 단순 라디오가 혼재.

**의도한 결과**: ToggleCard와 시각 언어가 통일된 RadioCardGroup으로 모든 라디오를 교체. 사용자가 분기 토글이든 옵션 선택이든 동일한 카드 색조 시스템에서 인지.

## Inventory

| 파일 | 그룹 수 | tone | 비고 |
|---|---:|---|---|
| `property/Step2Separated.tsx` | 2 (4+3) | sky | 1번째는 이미 `has-[:checked]:` 모범 |
| `property/Step1.tsx` | 1 | sky | landTaxType (3종 토지분류) |
| `property/Step0.tsx` | 2 | violet/sky | objectType + buildingType |
| `property/Step2SeparateAggregate.tsx` | 1 | sky | saZoningDistrict |
| `transfer/nbl/HousingLandDetailSection.tsx` | 1 | rose | metro (수도권 yes/no) |
| `transfer/CompanionAcqInheritanceBlock.tsx` | 1 | amber | inheritanceAssetKind |
| `inputs/Pre1990LandValuationInput.tsx` | 1 | amber | grade mode (number/value) |

## Approach

### 1. `RadioCardGroup` 신설 — `components/calc/inputs/RadioCardGroup.tsx`

API:
```ts
interface RadioCardOption<T extends string> {
  value: T;
  label: string;
  description?: ReactNode;
  trailing?: ReactNode;     // 세율·배지 등 우측 슬롯
  hint?: ReactNode;         // 경고/힌트 하단 표시
}

interface RadioCardGroupProps<T extends string> {
  name: string;
  options: RadioCardOption<T>[];
  value: T | "";
  onChange: (value: T) => void;
  tone?: ToggleCardTone;     // 기본 violet
  layout?: "stack" | "inline";  // stack=세로 카드 / inline=가로 컴팩트
  className?: string;
}
```

### 2. 시각 디자인 (ToggleCard 원칙 준수)

| 신호 | 미선택 | 선택됨 |
|---|---|---|
| 배경 | `bg-{tone}-50/70` (옅음) | `bg-{tone}-100/70` (진함) + `ring-1 ring-{tone}-200/50` |
| border | `border-{tone}-200/70` | `border-{tone}-300` |
| label 색 | 기본 | `text-{tone}-900 font-semibold` |
| 라디오 마커 | `accent-{tone}-500` | `accent-{tone}-600` |

CSS 패턴: `has-[:checked]:` 활용해 라디오 native 스타일 유지 + 카드 강조.

### 3. 적용 (7개 파일)

각 파일별로:
1. options 배열을 컴포넌트 상단에 const로 추출 (이미 SEPARATED_TYPE_OPTIONS 등 일부 정의됨, 가능하면 재사용)
2. 라디오 그룹 부분을 `<RadioCardGroup ... />` 으로 단일 교체
3. import 추가

### 4. 검증
- `npm run build` + `npm test` (1,714 그린)
- `grep -c 'type="radio"' components/calc/**/*.tsx` → 0
- 브라우저 시각 점검 (각 마법사 1회전, OFF/ON 색조)

## Critical Files

**신규**:
- `components/calc/inputs/RadioCardGroup.tsx` (~150줄)

**수정** (7개):
- `property/Step2Separated.tsx`, `Step1.tsx`, `Step0.tsx`, `Step2SeparateAggregate.tsx`
- `transfer/nbl/HousingLandDetailSection.tsx`
- `transfer/CompanionAcqInheritanceBlock.tsx`
- `inputs/Pre1990LandValuationInput.tsx`

**문서**:
- `components/calc/CLAUDE.md` — RadioCardGroup 행 추가, 가시성 원칙에 라디오 포함
- 메모리 `feedback_toggle_card_visibility.md` — 라디오까지 확장 사실 추가
