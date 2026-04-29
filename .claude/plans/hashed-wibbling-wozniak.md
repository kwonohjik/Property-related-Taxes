# 토글·체크박스 가시성 개선 — Phase 2 전체 적용

## Context

Phase 1 (2026-04-29 완료): `components/calc/inputs/ToggleCard.tsx` 공용 컴포넌트를 신설하고 6개 파일·핵심 분기 토글에 적용. 사용자 피드백으로 OFF 상태에도 tone 배경(`bg-{tone}-50/70`)을 항상 유지하는 가시성 원칙 확립 (`CLAUDE.md`·메모리 저장 완료).

**Phase 2 범위**: 프로젝트 전체에 ToggleCard 일관 적용. 잔여 native `<input type="checkbox">` **57개 / 24개 파일**을 ToggleCard로 교체해 6대 세목·전 마법사에서 동일한 토글 시각 언어를 만든다.

**의도한 결과**: 어느 세목·페이지에서든 사용자가 토글 컨트롤의 위치·상태를 즉시 인지. 새 토글 추가 시에도 ToggleCard만 사용하도록 native checkbox 0건 달성.

**사용자 결정** (이번 세션):
- **분할 방식**: 세목별 5개 PR (PR 2A~2E)
- **순서**: 양도세 → 상속·증여 → 취득세 → 재산세·공용
- **라디오 처리**: 이번 작업 범위 밖 (`RadioCard`는 별도 plan)
- **검증 강도**: 각 PR 후 `npm run build` + `npm test` 전체 + 시각 점검

상세 인벤토리는 [`toggle-card-rollout-plan.md`](toggle-card-rollout-plan.md) 참조.

---

## Approach

### PR 분할 전략 (세목별 5개)

| PR | 대상 폴더·파일 | 체크박스 | 핵심 tone |
|---|---|---:|---|
| **2A** 양도세 NBL | `transfer/nbl/` 7개 파일 | 26 | sky / violet |
| **2B** 양도세 inheritance + 잔여 | `transfer/inheritance/` 3개 + `CompanionAssetCard` + `inputs/Pre1990LandValuationInput` | 7 | amber |
| **2C** 상속·증여세 | `InheritanceTaxForm` / `GiftTaxForm` / `HeirComposition` / `StockValuationForm` / `PriorGiftInput` | 12 | violet (일부 amber) |
| **2D** 취득세 | `AcquisitionTaxForm` / `acquisition/Step1` | 5 | rose / amber / violet |
| **2E** 재산세·공용 | `property/Step0` / `Step2SeparateAggregate` / `inputs/SelfFarmingIncorporationInput` / `inputs/ParcelListInput` / `exemption/ExemptionChecklist` | 7 | violet / sky |

### 반복 작업 패턴 (각 파일마다 동일)

1. **체크박스 분류**:
   - 분기 토글 (활성 시 후속 입력 펼침/숨김) → `variant="card"` + `children`
   - 인라인 옵션 (라벨 옆 짧은 토글) → `variant="chip"`
   - 단일 옵션 (boolean 1개, children 없음) → `variant="card"`
2. **tone 결정 트리** (의미별):
   - 취득 시기·방식·환산? → `amber`
   - 거주·세대·자격? → `violet`
   - 지역·구역·지정? → `rose`
   - 양도 시점·시가? → `emerald`
   - 면적·규모·필지? → `sky`
3. **import 추가**: `import { ToggleCard } from "@/components/calc/inputs/ToggleCard";`
4. **교체**: native `<input type="checkbox">` + `<label>` → `<ToggleCard tone="…" title="…" description="…" checked={…} onCheckedChange={…} />`
5. **부수 효과 보존**: 체크 시 자동 리셋·자동 ON·다른 필드 자동 변경 등 기존 onChange 로직은 onCheckedChange로 그대로 이전.

### 800줄 정책 동시 점검

각 PR 시작 시 대상 파일 라인 수 확인. 700줄 이상이면 ToggleCard 적용 + 분할까지 같은 PR에서 처리. 현재 확인된 NBL 파일들은 모두 250줄 이하 — 분할 불필요.

### Phase 2A 구체 작업 (가장 먼저 실행)

대상 파일 (라인 수):
- `transfer/nbl/UnconditionalExemptionSection.tsx` (229) — 7개 체크박스. 무조건 비사업용 배제 사유 다중 선택. tone=`violet` (자격 사유)
- `transfer/nbl/FarmlandDetailSection.tsx` (143) — 7개. 농지 자경·재촌·도시 지정. tone=`sky` (토지 사용 사유)
- `transfer/nbl/ForestDetailSection.tsx` (111) — 5개. 임야 사용 사유. tone=`sky`
- `transfer/nbl/VillaLandDetailSection.tsx` (69) — 3개. 별장 부지. tone=`sky`
- `transfer/nbl/PastureDetailSection.tsx` (104) — 2개. 목장 사용. tone=`sky`
- `transfer/nbl/ResidenceHistorySection.tsx` (133) — 1개. 거주 이력. tone=`violet`
- `transfer/nbl/OtherLandDetailSection.tsx` (94) — 1개. 기타 토지. tone=`sky`

같은 페이지(NBL 마법사) 내 일관성을 위해 토지 성격은 `sky`, 자격·이력은 `violet`로 통일.

---

## Critical Files

**수정 대상**: 인벤토리 표의 24개 파일 (Phase 2A~2E 합계).

**무수정 (Phase 1에서 신설 완료)**:
- `components/calc/inputs/ToggleCard.tsx` — 그대로 재사용 (variant=card/chip, tone 5종, disabled, disabledReason 모두 지원)

**참고 자료**:
- `components/calc/CLAUDE.md` — ToggleCard 가시성 원칙 섹션 (강제 규칙)
- `~/.claude/projects/-Users-mynote-workspace-Property-related-Taxes/memory/feedback_toggle_card_visibility.md` — Why·How to apply 메모

---

## Verification

### 각 PR (2A~2E) 별

- [ ] `npm run build` — TypeScript strict + Next.js compile 통과
- [ ] `npm run lint` — 신규 에러 없음 (사전 5건은 무관)
- [ ] `npm test` — 1,714 tests 그린 (UI 변경 → 엔진 무영향 예상)
- [ ] 브라우저 시각 점검 (`npm run dev`):
  - 해당 세목 마법사 1회전 — 토글 OFF/ON, 펼침 동작, 클릭 영역
  - tone 색조가 의미에 맞고 페이지 내 일관됨
  - 다크모드 (system theme 토글)
  - 부수 효과 (자동 리셋·자동 ON) 동일 동작

### Phase 2 완료 후

- [ ] `grep -rn 'type="checkbox"' components/calc --include="*.tsx" | wc -l` → **0**
- [ ] `components/calc/CLAUDE.md` 업데이트 — Phase 2 완료 표기, native checkbox 신규 작성 금지 강제 규칙 강화
- [ ] 메모리 `feedback_toggle_card_visibility.md` 갱신 — "프로젝트 전체 적용 완료(2026-04-29~)" 추가
- [ ] `feedback_toggle_card_visibility.md` 의 적용 범위 갱신
- [ ] 라디오 처리(`RadioCard` 신설) 별도 plan 작성

### 진행 순서

1. **PR 2A 즉시 시작** — NBL 7개 파일 → build·test → 시각 점검
2. PR 2A 검증 통과 후 PR 2B 시작 (Inheritance + 잔여)
3. 이후 2C → 2D → 2E 순차
