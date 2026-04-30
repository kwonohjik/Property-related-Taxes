# Design: 검용주택 — 보유 중 일부 용도변경 분리계산 (Main)

**Plan**: `.claude/plans/image-1-reflective-engelbart.md`
**작성일**: 2026-04-30
**상태**: Design 단계 — 함수 시그니처·데이터 흐름·UI props·테스트 매트릭스 확정 (Plan 승인 후)
**참고 사례**: 이미지1 갑氏 사례 — 1985.1.1 의제취득한 단독주택을 2011.8.5에 일부면적(80.23㎡)을 근린생활시설로 용도변경 → 2023.2.16에 1,300,000,000원 양도

**관련 문서 (분할)**:
- `transfer-tax-mixed-use-partial-change.engine.design.md` — 데이터 모델·알고리즘·API·테스트·법령
- `transfer-tax-mixed-use-partial-change.ui.design.md` — UI 컴포넌트·결과 카드

**기반 모듈 (재사용)**:
- `transfer-tax-mixed-use-house.design.md` (검용주택 분리계산 본체)
- 본 문서는 검용주택 모듈에 **"보유 중 일부 용도변경" 토글 분기**를 추가하는 확장 설계

---

## 0. 요약

소득세법 시행령 §166⑥ 및 양도소득세 집행기준 99-164-10에 따라, **양도시점에는 검용주택**(주택+상가 혼재)이지만 **취득시점에는 전체가 단독주택(또는 전체가 상가)**이었던 사례를 처리하기 위한 신규 분기. 양도가액은 양도시점 비율로(주택=개별주택공시가격, 상가=건물기준시가+공시지가), 취득가액은 **취득시 개별주택공시가격(또는 상가 기준시가)을 양도시 면적비율로** 안분한다.

기존 `transfer-tax-mixed-use.ts`(581줄, 시행령 §166⑥의 양도시 비율 ≠ 취득시 비율 분기 이미 보유) 엔진을 **그대로 재사용**하고, `calcCommercialGainSplit` / `calcHousingGainSplit` 두 헬퍼에 **direction 분기 + PHD 결합**만 additive하게 추가한다.

**1차 PR 범위 (Phase 1)**:
- `house_to_commercial` (주택→상가) — PDF 갑氏 anchor로 검증
- `commercial_to_house` (상가→주택) — 미러 분기 구현 + "보수 검토 필요" 배지 표시

---

## 1. 파일 구조

```
lib/tax-engine/
├── transfer-tax-mixed-use.ts                  (수정) — 오케스트레이터에서 acqDerived·housingAcqResult 인자 추가 전달
├── transfer-tax-mixed-use-helpers.ts          (수정) — computeAcqDerivedAreas 신설 + calcHousing/CommercialGainSplit 분기
├── types/transfer-mixed-use.types.ts          (수정) — MixedUseAssetInput.partialUsageChange 추가, MixedUseGainBreakdown.partialUsageChange 메타 추가
├── legal-codes/transfer.ts                    (수정) — TRANSFER.PARTIAL_USAGE_CHANGE_* 상수 2개 추가 (§166⑥, 집행기준 99-164-10)

app/api/calc/transfer/
└── route.ts                                   (수정) — mixedUseSchema.partialUsageChange 추가 (Zod)

lib/api/
└── transfer-tax-schema-sub.ts                 (수정) — partialUsageChangeSchema 신규

lib/calc/
├── transfer-tax-api.ts                        (수정) — mixedUsePayload에 partialUsageChange 매핑 + silent skip 방지 throw
└── transfer-tax-validate.ts                   (수정) — direction 미선택 검증, 면적 음수 검증

lib/stores/
├── calc-wizard-asset.ts                       (수정) — AssetForm 신규 5필드
├── calc-wizard-migration.ts                   (수정) — 신규 필드 backward compat 가드
└── (확인) actions/calculations.ts             (확인 후 수정 가능) — DB 영속화 경로에 가드 적용

components/calc/transfer/
├── MixedUseSection.tsx                        (수정) — MixedUseToggleRow를 grid-cols-2로 변경 + 새 ToggleCard
└── mixed-use/
    ├── PartialUsageChangeInputs.tsx           (신규) — 방향 Select + 자동/수정 면적 입력
    ├── MixedUseAreaInputs.tsx                 (수정) — 취득시 면적 자동 표시 (hasPartialUsageChange ON 시)
    ├── MixedUseStandardPriceInputs.tsx        (수정) — direction별 입력 hidden 분기
    └── MixedUseExpandedPanel                  (수정 in MixedUseSection.tsx) — PartialUsageChangeInputs 마운트

components/calc/results/mixed-use/
└── MixedUseResultCard.tsx                     (수정) — 신규 "취득시점 자산 구성" 섹션 + direction별 캡션 + 보수 검토 배지

__tests__/tax-engine/transfer-tax/
└── mixed-use-partial-usage-change.test.ts     (신규) — anchor + 6개 시나리오

__tests__/tax-engine/_helpers/
└── mixed-use-fixture.ts                       (수정) — partialUsageChangeFixture(direction) factory + PARTIAL_USAGE_CHANGE_ANCHORS

docs/02-design/features/
├── transfer-tax-mixed-use-partial-change.design.md         (본 문서, Main)
├── transfer-tax-mixed-use-partial-change.engine.design.md  (Engine 상세)
└── transfer-tax-mixed-use-partial-change.ui.design.md      (UI 상세)
```

> **수정 우선 / 신규 최소** 원칙. 신규 파일은 `PartialUsageChangeInputs.tsx`와 테스트 파일 2개만. 엔진은 무신설.

---

## 2. 핵심 결정사항

| 항목 | 결정 | 비고 |
|---|---|---|
| 엔진 신설 여부 | **신설 금지** — 기존 `transfer-tax-mixed-use-helpers.ts`에 분기만 추가 | additive only |
| 양방향 enum | `partialChangeDirection: "house_to_commercial" \| "commercial_to_house"` | 향후 enum 확장 가능 구조 |
| 취득시 면적 입력 | 양도시 (주택+상가) 합계로 **자동 계산**, 사용자가 수정 가능한 `DecimalInput` 노출 | 단순 케이스 디폴트 + 증축/멸실 경고 |
| 토글 위치 | "검용주택 분리계산" 토글의 **오른쪽** (grid-cols-2) | tone amber 통일 |
| 토글 가드 | `disabled={!asset.isMixedUseHouse}` + `disabledReason` | 검용주택 활성화 후 사용 가능 |
| 취득가액 안분 산식 | **취득시 개별주택공시가격 × 양도시 면적비율** (집행기준 99-164-10) | 양도시 가격을 끌어 쓰는 것 아님 |
| 토지/건물 내부 분리 | 양도시 비율 fallback (취득시점 분리값 없음) | `acqLandStd=0` 버그 방지 |
| PHD 결합 | `usePreHousingDisclosure=true` 시 PHD가 역산한 `phdAcqHousingPrice`를 면적비율 안분 기준으로 사용 | PDF 갑氏(1985 의제취득) anchor 통과 핵심 |
| PHD 강제 변경 | **금지** — 사용자 직전 상태 보존 | 1990 이전 의제취득 케이스 대응 |
| commercial_to_house 처리 | 엔진 구현 + 결과 카드 "법령 적용에 보수 검토 필요" 배지 | PDF 직접 사례 부재 (사용자 양방향 요구사항 충족) |
| Silent skip 방지 | API 매핑에서 `hasPartialUsageChange===true && !partialChangeDirection` 시 명시적 throw | 일반 검용주택으로 잘못 계산 방지 |
| 결과 카드 캡션 | direction별 사전 정의 템플릿 분리 | 학습·검증성 향상 |
| 면적 자동값 한계 | 단순 용도변경 케이스에만 정확. 증축·멸실 시 사용자 수정 권고 | amber 안내 박스 항상 노출 |
| **🚨 다주택자 1세대1주택 비과세 미적용** (UI 누락 검토 추가) | `MixedUseAssetInput.isOneHouseExempt` 신규 필드 + `buildHousingPart` 분기 | PDF 갑氏(2주택자) anchor 통과 필수 — 본 PR 포함 |
| **산정면적·전체면적·정착면적 라벨 명확화** | "주택 연면적 (산정면적, ㎡)" / "건물 정착면적 (1층 바닥면적, ㎡)" | UI hint 보강 — `MixedUseAreaInputs.tsx` |
| **의제취득일 안내** | 1985.1.1 이전 취득 시 자산 카드 DateInput에 "의제취득(§98) 적용" 배지 + PHD 안내 | UI 안내 — `MixedUsePreHousingDisclosureSection` |
| **양도시 상가건물 기준시가 조회 안내** | "국세청 홈택스 > 기준시가 조회" 링크 추가 | UI hint — `MixedUseStandardPriceInputs` |

---

## 3. 마이그레이션·호환성

- 기존 `isMixedUseHouse=true` 자산은 영향 없음 (`hasPartialUsageChange === false` 디폴트)
- 신규 5필드는 `migrateLegacyForm`에서 `?? false` / `?? ""` 가드로 backward compat
- **영속화 경로 전수조사 (이슈 21 반영)**: `actions/calculations.ts` saveCalculation/loadCalculation, DB JSON 컬럼, API 응답 변환 등 모든 진입점에 가드 적용
- API: `partialUsageChange === undefined` 시 기존 검용주택 분기 그대로 동작
- 기존 `__tests__/tax-engine/transfer-tax/mixed-use-house.test.ts` 모두 통과 유지 (회귀 검증)

---

## 4. 작업 의존 그래프

```
[0] 사전 검증 — apportionTransferPrice 코드 정독, PDF 본문 산식과 일치 확인
[1] types/transfer-mixed-use.types.ts 수정 — partialUsageChange 필드
[2] legal-codes/transfer.ts 상수 추가 — TRANSFER.PARTIAL_USAGE_CHANGE_*
[3] calc-wizard-asset.ts AssetForm 5필드 + makeDefaultAsset 디폴트
[4] calc-wizard-migration.ts 가드 + 영속화 경로 전수조사
[1.5] PDF 갑氏 손계산 + anchor 산출 → mixed-use-fixture.ts 상수 고정
[5] computeAcqDerivedAreas 신설 (transfer-tax-mixed-use-helpers.ts)
[6] calcCommercialGainSplit 시그니처 변경 + house_to_commercial 분기 + PHD 결합
[7] calcHousingGainSplit 시그니처 변경 + commercial_to_house 분기
[8] transfer-tax-mixed-use.ts 오케스트레이터 배선
[9] mixed-use-partial-usage-change.test.ts (anchor + 경계 + PHD 결합 + 회귀)
[10] route.ts Zod + transfer-tax-api.ts 매핑 + transfer-tax-validate.ts 검증
[11] MixedUseSection.tsx 토글 그리드화
[12] PartialUsageChangeInputs.tsx 신규
[13] MixedUseStandardPriceInputs.tsx 조건 hidden + MixedUseAreaInputs.tsx 자동 면적
[14] MixedUseResultCard.tsx direction별 캡션 + "취득시점 자산 구성" 섹션
[15] E2E (npm run dev + 갑氏 사례 입력 → 결과 anchor 일치)
[16] 회귀 (npm test 전체)
```

순서: [0] → [1·2·3·4] (병렬) → [1.5] → [5·6·7·8] (의존) → [9] (TDD) → [10] → [11·12·13] (병렬) → [14] → [15·16]

---

## 5. 미해결 / 향후 확장 (Phase 2)

| 항목 | 처리 |
|---|---|
| `acqApportionMethod` enum 옵션화 | 현재 디폴트 `"area"` 하드코딩. `"area" \| "standardPrice"` 사용자 선택 가능하도록 확장 |
| 토글 자동 ON UX (이슈 20) | 보유 중 일부 용도변경 토글 ON 시 `isMixedUseHouse` 자동 활성화. 현재는 `disabled` 가드로 보호 — `hasSeperateLandAcquisitionDate` 사이드이펙트 충돌 검토 후 도입 |
| 취득시 토지면적 별도 입력 | 분필·합필·도로편입 케이스 대응을 위해 `partialChangeAcqLandArea` 필드 추가 |
| 다중 용도변경 이력 | 현재는 단일 변경 시점. 2회 이상 용도변경 이력 처리는 별도 모듈 |
| commercial_to_house 직접 사례 발굴 | PDF·국세청 회신 추가 입수 후 산식 재검증 |

---

## 6. 검증 체크리스트 (Definition of Done)

### 6-A. 본 PR 핵심
- [ ] `npx vitest run __tests__/tax-engine/transfer-tax/mixed-use-partial-usage-change.test.ts` — anchor + 6개 시나리오 통과
- [ ] `npm test` — 1,714+ 통과, 회귀 0건 (특히 `mixed-use-house.test.ts` 그대로 그린)
- [ ] `npm run lint` — 타입체크·ESLint 0 에러
- [ ] 800줄 정책 — 신규/수정 파일 모두 ≤ 800줄
- [ ] E2E: PDF 갑氏 입력 → 손계산 anchor 원단위 일치 (다주택자 분기 적용 후)
- [ ] 역방향 (commercial_to_house) 미러 케이스 → 결과 카드에 "법령 적용에 보수 검토 필요" 배지 노출
- [ ] 토글 OFF backward compat — 기존 검용주택 시나리오 동일 결과 산출
- [ ] PHD 결합 케이스 — `house_to_commercial` + `usePreHousingDisclosure=true` 정상 작동
- [ ] 결과 카드 산식 캡션이 direction별로 정확히 분리됨
- [ ] 영속화 가드 — 기존 이력 1건 로드 시 토글 OFF 보장
- [ ] API silent skip 방지 — 토글 ON & direction 미선택 시 명시적 Error throw

### 6-B. UI 누락 보강 (Engine 8절·UI 10절 — 별도 검증)
- [ ] **Critical** — 다주택자 케이스에서 `isOneHouseExempt = false`로 12억 비과세 미적용 + 표1 장기보유공제 적용
- [ ] **Critical** — 검용주택 패널 상단에 1세대 1주택 비과세 적용 여부 안내 박스 노출
- [ ] PHD 1985 의제취득 케이스 — 1990년 공시지가 사용 안내 박스 노출
- [ ] 산정면적·전체면적·정착면적 라벨 명확 (PDF 갑氏 입력 시 헷갈리지 않음)
- [ ] 의제취득(§98) 안내 배지 — 자산 카드 취득일 ≤ 1985-01-01 시 자동 표시
- [ ] 양도시 상가건물 기준시가 — 국세청 홈택스 조회 링크 안내
- [ ] PDF 갑氏 입력 흐름 매핑표 — 마법사 도움말 또는 결과 화면 노출

세부 구현은 분할 문서를 참조:
- 데이터 모델·알고리즘·API·테스트 → `transfer-tax-mixed-use-partial-change.engine.design.md`
- UI 컴포넌트·결과 카드 → `transfer-tax-mixed-use-partial-change.ui.design.md`

---

## 7. 법령 매핑

| 조문 | 적용 |
|---|---|
| 소득세법 시행령 §166⑥ | 양도가액 안분비율 ≠ 취득가액 안분비율 — 본 분기의 법적 근거 |
| 소득세법 §97 | 환산취득가액 일반 산식 |
| 양도소득세 집행기준 99-164-10 | "취득가액을 안분함에 있어서는 개별주택가격을 기준으로 안분" — 면적비율 안분 산식의 직접 근거 (재산-1384, 2009.7.8.) |
| 소득세법 시행령 §163⑥ | 환산취득가 사용 시 개산공제 (취득시 토지/건물 기준시가 × 3%) |
| 소득세법 시행령 §164⑤ | 개별주택공시가격 미공시 시 PHD 3-시점 환산 |
| 소득세법 §95② / §159의4 | 장기보유공제 (주택=표2, 상가=표1) |
| 소득세법 §89 ① 3호 단서 | 1세대1주택 비과세 (12억 초과 안분) |
| 소득세법 시행령 §168의12 | 주택부수토지 배율(3·5·10배) |
| 소득세법 §104의3 | 비사업용토지 +10%p 가산 (배율초과 면적) |

---

## 8. 개정 이력 (Change Log)

| 일자 | 변경 | 사유 |
|---|---|---|
| 2026-04-30 v1 | 초안 — Plan(image-1-reflective-engelbart.md) 승인 후 작성 | 검용주택 모듈 확장 분기 |
