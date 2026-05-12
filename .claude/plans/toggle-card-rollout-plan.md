# ToggleCard 전체 적용 계획 (Phase 2)

## Context

Phase 1(2026-04-29 완료)에서 6개 파일에 ToggleCard를 적용해 겸용주택·신축·PHD·임대·어린이집 등 핵심 분기 토글의 가시성을 개선했다. 잔여 native checkbox **57개 / 24개 파일**과 라디오 사용 **7개 파일**이 남아 있다.

**목적**: 프로젝트 전체에서 토글 시각 언어를 일관되게 만들어 사용자가 어떤 페이지·세목에서도 토글 컨트롤의 위치·상태를 즉시 인지하도록 한다.

**원칙 재확인** (`feedback_toggle_card_visibility.md`):
- OFF 상태에도 tone 배경(`bg-{tone}-50/70`) 항상 유지
- ON/OFF는 Switch thumb·border 진하기·ring·title 색 4신호로 구분
- tone 의미 매핑: amber(취득·분리계산) / rose(지역) / violet(거주·자격) / emerald(양도시점) / sky(면적·규모)

---

## Inventory — 잔여 native checkbox

### 양도세 (12개 파일 / 35개 체크박스)

| 파일 | # | 추정 tone | 토글 성격 |
|---|---:|---|---|
| `transfer/nbl/UnconditionalExemptionSection.tsx` | 7 | violet | 무조건 비사업용 배제 사유 7종 (다중 선택) |
| `transfer/nbl/FarmlandDetailSection.tsx` | 7 | sky | 농지 자경·재촌·도시 지정 등 |
| `transfer/nbl/ForestDetailSection.tsx` | 5 | sky | 임야 사용 사유 |
| `transfer/nbl/VillaLandDetailSection.tsx` | 3 | sky | 별장 부지 사유 |
| `transfer/nbl/PastureDetailSection.tsx` | 2 | sky | 목장 사용 사유 |
| `transfer/nbl/ResidenceHistorySection.tsx` | 1 | violet | 거주 이력 |
| `transfer/nbl/OtherLandDetailSection.tsx` | 1 | sky | 기타 토지 사유 |
| `transfer/inheritance/PreDeemedInputs.tsx` | 3 | amber | 의제취득 전 평가 옵션 |
| `transfer/inheritance/PostDeemedInputs.tsx` | 1 | amber | 의제취득 후 평가 옵션 |
| `transfer/inheritance/HouseValuationSection.tsx` | 1 | amber | 주택 평가 |
| `transfer/CompanionAssetCard.tsx` | 1 | amber | 동반자산 옵션 |
| `inputs/Pre1990LandValuationInput.tsx` | 1 | amber | 1990 환산 |

### 상속·증여 (5개 파일 / 13개)

| 파일 | # | 추정 tone | 성격 |
|---|---:|---|---|
| `InheritanceTaxForm.tsx` | 5 | violet | 동거주택공제·기업상속 등 |
| `GiftTaxForm.tsx` | 3 | violet | 증여 사전합산·세대생략 등 |
| `HeirComposition.tsx` | 2 | violet | 상속인 구성 |
| `StockValuationForm.tsx` | 1 | amber | 비상장주식 평가 옵션 |
| `PriorGiftInput.tsx` | 1 | violet | 사전증여 합산 |

### 취득세 (2개 파일 / 5개)

| 파일 | # | 추정 tone | 성격 |
|---|---:|---|---|
| `AcquisitionTaxForm.tsx` | 3 | rose / amber | 조정대상지역·생애최초 등 |
| `acquisition/Step1.tsx` | 2 | violet | 물건 상세 옵션 |

### 재산세 (2개 파일 / 4개)

| 파일 | # | 추정 tone | 성격 |
|---|---:|---|---|
| `property/Step2SeparateAggregate.tsx` | 2 | sky | 별도합산 사업용 옵션 |
| `property/Step0.tsx` | 2 | violet | 1세대1주택·고령자 등 |

### 공용·기타 (3개 파일 / 3개)

| 파일 | # | 추정 tone | 성격 |
|---|---:|---|---|
| `inputs/SelfFarmingIncorporationInput.tsx` | 1 | amber | 자경 법인전환 |
| `inputs/ParcelListInput.tsx` | 1 | sky | 필지 옵션 |
| `exemption/ExemptionChecklist.tsx` | 1 | violet | 감면 체크 |

### 라디오 사용 7개 파일 (별개 처리)

`Pre1990LandValuationInput`, `property/Step0`, `Step1`, `Step2SeparateAggregate`, `Step2Separated`, `transfer/CompanionAcqInheritanceBlock`, `transfer/nbl/HousingLandDetailSection` — 라디오는 **이번 작업 범위 밖**. 별도 `RadioCard` 패턴 신설 후 처리 권장 (아래 "결정 필요" 참조).

---

## 적용 전략

### 분할 단위 — 세목별 5개 PR (권장)

같은 세목 내에서 토글 의미와 tone 일관성을 유지하기 쉽고, 회귀 검증 범위가 좁아진다.

| PR | 대상 | 체크박스 수 | 예상 LOC 변경 |
|---|---|---:|---:|
| **2A** 양도세 NBL | `transfer/nbl/*` 7개 파일 | 26 | ~400 |
| **2B** 양도세 inheritance | `transfer/inheritance/*` 3개 + `CompanionAssetCard` + `Pre1990LandValuationInput` | 7 | ~120 |
| **2C** 상속·증여 | `InheritanceTaxForm` / `GiftTaxForm` / `HeirComposition` / `StockValuationForm` / `PriorGiftInput` | 12 | ~250 |
| **2D** 취득세 | `AcquisitionTaxForm` / `acquisition/Step1` | 5 | ~100 |
| **2E** 재산세·공용 | `property/Step0` / `Step2SeparateAggregate` / `inputs/SelfFarmingIncorporationInput` / `inputs/ParcelListInput` / `exemption/ExemptionChecklist` | 7 | ~140 |

### 적용 패턴 (반복 작업)

각 파일마다 동일한 다섯 단계:

1. **검토**: 체크박스의 영향 분류
   - **분기 토글** (활성 시 후속 필드 펼침/숨김 또는 다른 모드 진입) → `variant="card"` + children 펼침
   - **인라인 옵션** (라벨 옆 칩, 영향 작음) → `variant="chip"`
   - **단일 옵션** (boolean 1개) → `variant="card"` (children 없음)
2. **import 추가**: `import { ToggleCard } from "@/components/calc/inputs/ToggleCard";`
3. **교체**: `<input type="checkbox" .../>` + label → `<ToggleCard tone="…" title="…" checked={…} onCheckedChange={…} />`
4. **부수 효과 보존**: 체크 시 자동 리셋·자동 ON 등 기존 onChange 로직 동일 보존
5. **회귀 확인**: `npm run build` + 해당 세목 테스트 (`npx vitest run __tests__/tax-engine/<tax>.test.ts`)

### tone 결정 시 의사결정 트리

```
토글이 묻는 것이…
├─ 취득 시기·방식·환산? → amber
├─ 거주·세대·자격·소속? → violet
├─ 지역·구역·지정? → rose
├─ 양도 시점·시가? → emerald
└─ 면적·규모·필지·범위? → sky
```

판단이 모호한 경우 같은 페이지 내 다른 토글과 tone을 통일 (사용자 인지 비용 최소화).

### 라디오 버튼 처리 (이번 범위 밖)

라디오는 "여러 선택지 중 하나"라 토글과 의미가 다르다. ToggleCard로 부적합. 별도 `RadioCard` 패턴 신설 권장:

- 카드 안 라디오 그룹, ON된 항목만 tone 강조 (이미 일부 `has-[:checked]:` 패턴으로 구현됨)
- `Step2Separated.tsx`의 4개 분리과세 토지 유형이 모범 구현 (가져다 쓸 수 있음)

이번 작업 완료 후 별도 plan으로 진행 권장.

---

## 결정 필요 사항

1. **분할 방식**: 세목별 5개 PR(권장) vs 단일 PR vs 다른 단위
2. **라디오 처리**: 이번 작업 범위 밖(권장) vs 함께 RadioCard 신설
3. **순서 우선순위**: 위 표 순서(양도→상속·증여→취득→재산) vs 사용자 활동 빈도 우선(양도세 우선이면 동일)
4. **검증 강도**: 각 PR 후 `npm test` 전체 + 시각 점검 vs 빌드만 + 일괄 시각 점검
5. **800줄 정책**: 적용 대상 중 800줄 근접 파일이 있으면 분할까지 동시 진행 vs 별도 작업

---

## Critical Files (수정 대상)

상세 인벤토리 표의 24개 파일. 신규 추가 파일 없음 (ToggleCard는 Phase 1에서 신설 완료).

## Verification

각 PR 별:
- [ ] `npm run build` — TypeScript strict 통과
- [ ] `npm run lint` — 신규 에러 없음 (사전 5건은 무관)
- [ ] `npm test` — 1,714 tests 그린 (UI만 변경, 엔진 무영향 예상)
- [ ] 브라우저 시각 점검 — 해당 세목 마법사 1회전, 토글 OFF/ON·펼침·다크모드

전체 완료 후:
- [ ] 모든 native checkbox 0건 확인 (`grep -c 'type="checkbox"' components/calc/**/*.tsx`)
- [ ] `components/calc/CLAUDE.md` 업데이트 — Phase 2 완료 표기
- [ ] 메모리 `feedback_toggle_card_visibility.md` 의 적용 범위 갱신
