# components/calc/ — 세금 계산 UI

Layer 1의 프런트엔드 측. 마법사(StepWizard) 기반 폼 + 결과 화면.

## StepWizard 패턴

각 세금 계산기는 여러 단계로 나뉘며, 상태는 zustand store (`lib/stores/calc-wizard-store.ts`)에 보관.

### 네비게이션 규칙 (절대)

- 모든 단계에 **뒤로가기 + 다음 버튼 필수**.
- 1단계 뒤로가기 = 홈(`/`) 으로 이동.
- 결과 화면의 "다시 계산하기" 는 마지막 입력 단계(감면/가산세 등)로 복귀 (첫 화면 아님).

### Step 파일 분리 규칙 (2026-04 리팩터링 후)

Calculator가 800줄 초과 + Step이 3개 이상이면 각 Step을 별도 파일로 분리. 예시:

```
app/calc/transfer-tax/                  # 양도세: Step1↔Step3 통합 후 4단계 (2026-04-25)
├── TransferTaxCalculator.tsx           # 오케스트레이터 + 사이드바 레이아웃
└── steps/
    ├── Step1.tsx  # 자산 목록 + 양도일·신고일 + 취득 상세 모두 (자산 카드 내부에 환산·1990·감정가액·신축 통합)
    ├── Step4.tsx  # 보유 상황 (NBL·다주택·합가) — UI 인덱스 1
    ├── Step5.tsx  # 감면·공제 (자산별 체크박스) — UI 인덱스 2
    └── Step6.tsx  # 가산세 (단건 모드 전용) — UI 인덱스 3
# (Step3.tsx 폐지: 취득 정보가 자산 카드 안으로 통합됨)

components/calc/acquisition/
├── shared.ts          # 상수·FormState·INITIAL_FORM·validateStep·CSS classes (API 호출은 lib/calc/acquisition-tax-api.ts)
├── Step0.tsx ~ Step5.tsx  # 6단계 전부 별도 파일
├── normalize.ts · deemed/ # 폼 정규화 + 간주취득
└── AcquisitionSidebar.tsx
```

**파일명 vs UI 인덱스 주의 (양도세)**: 파일명은 historical naming(Step1·Step4·Step5·Step6)을 유지하지만 마법사 UI는 0~3 인덱스. `STEPS_SINGLE = ["자산 목록", "보유 상황", "감면·공제", "가산세"]`. `stepComponentsAll`이 매핑.

**Props 시그니처**: `{ form, onChange: (d: Partial<FormData>) => void }` + Step별 필요 콜백. 플래그(`isHousing` 등)는 상위에서 파생해 주입.

### 자산-수준 통합 원칙 (2026-04-25 Step1↔Step3 통합 이후)

양도세 마법사는 **취득 정보 13필드**를 폼-전역에서 **자산-수준(`AssetForm`)으로 마이그레이션**:

- `acquisitionMethod` 폼 필드 폐지 → 자산-수준 `useEstimatedAcquisition` (boolean) + `isAppraisalAcquisition` (boolean) 두 플래그로 표현
- `appraisalValue` 폐지 → 감정가액 모드에서는 `fixedAcquisitionPrice`에 그대로 입력 (실가 입력 루틴과 단일화)
- `isSelfBuilt`/`buildingType`/`constructionDate`/`extensionFloorArea` 4필드 → `AssetForm`에 자산별 저장
- `pre1990*` 7필드 → `AssetForm`에 자산별 저장 (이미 자산-수준에 존재)

**API 변환 (`lib/calc/transfer-tax-api.ts`)**: 엔진 입력의 `acquisitionMethod` 키는 자산 플래그에서 도출:
```typescript
const isAppraisal = primary.isAppraisalAcquisition === true;
const isEstimated = !isAppraisal && primary.useEstimatedAcquisition;
acquisitionMethod: isAppraisal ? "appraisal" : isEstimated ? "estimated" : "actual"
```

**감정가액 + 개산공제 자동 적용**: 엔진 `calcTransferGain`(`transfer-tax-helpers.ts`)이 `acquisitionMethod === "appraisal"` 시 자동으로 `취득시 기준시가 × 3%` 개산공제 적용 (소득세법 시행령 §163⑥).

**1990 환산 표시 조건**: `assetKind === "land"` AND `acquisitionDate < "1990-08-30"` AND 환산취득가 모드. 토지 외 자산은 토지등급 환산 미적용 (법령상 토지 전용).

**sessionStorage 마이그레이션**: `lib/stores/calc-wizard-migration.ts`의 `migrateLegacyForm`이 legacy 폼-전역 13필드 → assets[0]로 자동 이전.

## 공용 입력 컴포넌트 (절대 규칙)

| 용도 | 컴포넌트 | 이유 |
|---|---|---|
| 날짜 입력 | `@/components/ui/date-input.tsx` (`DateInput`) | `<input type="date">` 사용 금지. 연도 6자리 표시 버그 회피 + 연/월/일 분리 입력. |
| 금액 입력 (원·정수) | `@/components/calc/inputs/CurrencyInput.tsx` | 자동 콤마 포맷. `parseAmount()` 로 "1,500,000" → 1500000 정수 변환. `hideUnit` prop으로 카드 모드에서 단위 중복 방지. **소수점 입력 불가** — 소수점이 필요한 필드에 사용 시 333.06 → 33306 버그 발생. |
| 소수점 숫자 입력 | `@/components/calc/inputs/DecimalInput.tsx` (`DecimalInput`) | 면적(㎡)·연수 등 소수점이 필요한 필드 전용. 콤마 포맷 없이 입력한 그대로 표시. `parseDecimal()` 로 문자열 → float 변환. **CurrencyInput 대체 불가** — 원화가 아닌 소수 숫자에는 반드시 이 컴포넌트를 사용. |
| 필드 카드 | `@/components/calc/inputs/FieldCard.tsx` | 라벨·hint·warning·trailing·unit 슬롯을 통일. 데스크톱 좌-라벨 / 모바일 위-라벨. |
| 섹션 헤더 | `@/components/calc/shared/SectionHeader.tsx` | 큰 그룹 시작점 (점·아이콘 + 굵은 텍스트 + 우측 액션 슬롯). |
| 진척 사이드바 | `@/components/calc/shared/WizardSidebar.tsx` | lg(1024px) 이상 좌측 sticky. 단계 + 합계 요약. 마법사용. |
| 개별공시지가 입력 | `@/components/calc/inputs/LandPriceLookupField.tsx` (`LandPriceLookupField`) | 공시지가(원/㎡) 전용. 기준연도+Vworld 조회+토지기준시가 자동 계산 포함. CurrencyInput 단독 사용 금지. |
| 분기 토글 / 옵션 토글 | `@/components/calc/inputs/ToggleCard.tsx` (`ToggleCard`) | 모드/분기 토글 통합 카드. ON 시 tone(amber·rose·violet·emerald·sky)으로 카드 전체 강조 + 펼침 children 지원. variant="card"(기본, 펼침)·"chip"(인라인). Switch 기반. native checkbox 신규 사용 금지. |
| 3-시점 기준시가 입력 | `@/components/calc/transfer/ThreePointStandardPriceInput.tsx` | 취득·최초공시·양도 3시점 토지·건물 기준시가. `splitHousingCommercialForAcqAndFirst` prop 활성 시 모든 시점에서 주택분/상가분 같은 행 4부분 표시 (Case A 전용). |
| 라디오 그룹 | `@/components/calc/inputs/RadioCardGroup.tsx` (`RadioCardGroup`) | 라디오 그룹 통합 컴포넌트. ToggleCard와 동일한 가시성 원칙(미선택 옵션도 tone 배경 유지). layout="stack"(세로 카드)·"inline"(가로 컴팩트). options 배열로 일괄 렌더. native radio 신규 사용 금지. |
| 신축·증축 입력 | `@/components/calc/transfer/SelfBuiltSection.tsx` | 자산-수준 4필드 (isSelfBuilt·buildingType·constructionDate·extensionFloorArea). `acquisitionCause === "purchase"` + housing/building 자산 전용. |
| 감면 통합 패널 | `@/components/calc/transfer/UnifiedReductionPanel.tsx` | 5카테고리·23개 조문 통합 UI. standalone(자경·공익)=체크박스, 그룹(장기임대·신축·미분양)=펼침 헤더+라디오. 시한 외/미구현 항목 자동 disabled. Step5 내 `ReductionExpansion.tsx` 대체 (폐지). |
| 감면 조문 PHD 환산 입력 | `@/components/calc/transfer/ReductionPhdInput.tsx` | 신축주택 감면 조문(§99의3 등)용 §164⑤ 환산 위젯. 자산-수준 PHD와 별도 — 취득일 < 최초공시일 자동 감지 후 활성화. |
| 1990 환산 | `@/components/calc/inputs/Pre1990LandValuationInput.tsx` | 토지 자산 + acquisitionDate < 1990-08-30 시 자동 활성화. 자산-수준 props (`form` = `Pre1990FormSlice`). |
| 주소 검색 | `@/components/ui/address-search.tsx` | Vworld 주소 검색 API. 조정대상지역·공시가격 조회에 필수 (지번 주소). |
| 리셋 버튼 | `@/components/calc/shared/ResetButton.tsx` | 1단계에만 배치. 확인 다이얼로그 포함. |

**포커스 시 전체 선택**: `SelectOnFocusProvider` (`components/providers/SelectOnFocusProvider.tsx`) 가 layout에 전역 등록되어 모든 `<input>`/`<textarea>` 에 자동 적용. 개별 `onFocus={(e) => e.target.select()}` 추가 불필요.

## 결과 화면 구조

`components/calc/results/{TaxType}ResultView.tsx` — `result` prop 받아 섹션별 카드로 렌더.

공통 섹션:
- 요약 카드 (총 납부세액 + 주요 단계)
- CalculationStep 목록 (산식·근거조문 포함)
- 상세 카드 (서브엔진별: `MultiHouseSurchargeDetailCard`, `NonBusinessLandResultCard`, `AcquisitionSurchargeDetailCard`, `SeparateTaxationDetailCard`, `TaxCreditBreakdownCard` 등)
- `DisclaimerBanner` (모든 결과 화면 하단 고정)
- `LoginPromptBanner` (비로그인 시 이력 저장 유도)

## Zustand 마법사 Store (`lib/stores/calc-wizard-store.ts`)

- sessionStorage persist. 비로그인 계산 결과 보존 → 로그인 후 이력 마이그레이션 (로컬 IndexedDB — Server Action 미경유).
- **`result` 필드는 partialize에서 제외**: 민감정보 + Date 직렬화 문제.
- `pendingMigration` 플래그로 마이그레이션 1회성 보장.
- **legacy 폼 마이그레이션은 `lib/stores/calc-wizard-migration.ts`로 분리** (800줄 정책 준수). `migrateLegacyForm(legacy, defaultFormData)`로 호출.

### useTransferSummary — 사이드바 합계 selector

```typescript
// hook으로 직접 호출 금지 — useSyncExternalStore 무한 루프 발생.
// TransferTaxCalculator 에서 useMemo로 래핑해 사용:
const transferSummary = useMemo(
  () => computeTransferSummary(formData, result),
  [formData.assets, formData.contractTotalPrice, result]
);
```

`computeTransferSummary(formData, result)`은 순수 함수 (`lib/stores/calc-wizard-store.ts`). 양도가액·취득가액·필요경비·양도소득금액·납부세액 5필드 반환.

## UI 시니어 분리 (2026-04-30)

엔진 시니어가 input/result 타입을 명세하면, 대응 UI 시니어가 다음 모두를 구현. 엔진 시니어는 UI 작업을 직접 수행하지 않음.

| 세목 | UI 에이전트 |
|---|---|
| 양도소득세 | `transfer-tax-ui-senior` |
| 취득세 | `acquisition-tax-ui-senior` |
| 재산세 | `property-tax-ui-senior` |
| 종합부동산세 | `comprehensive-tax-ui-senior` |
| 상속·증여 | `inheritance-gift-tax-ui-senior` |

**자동 검증**: 작업 완료 직후 `ui-engine-sync-checker` 호출로 클라이언트 8개 동기화 지점 매핑 누락 점검.

## UI 통합 8개 동기화 지점 (Definition of Done — 강제 · 루트 CLAUDE.md 14지점 중 클라이언트 8)

엔진 input·result 타입에 새 필드가 추가되거나 변경될 때 다음이 **모두** 동기화되어야 작업 완료. 하나라도 누락되면 미완료.

| # | 지점 | 위치 |
|---|---|---|
| ① | 폼 상태 타입 (FormData/AssetForm) | `lib/stores/calc-wizard-asset.ts` · `calc-wizard-store.ts` 또는 `components/calc/{tax-type}/shared.ts` |
| ② | initial value | 동상 (`makeDefaultAsset` / `defaultFormData` / `INITIAL_FORM`) |
| ③ | normalize fallback | 동상 (`migrateAsset` 등) — sessionStorage 마이그레이션 호환 |
| ④ | API 변환 | `lib/calc/{tax-type}-api.ts` (없으면 route handler 진입 변환) |
| ⑤ | UI 입력 위젯 | 마법사 단계 컴포넌트 — 활성화 조건·tone 색상 고려 |
| ⑥ | 사이드바 합계 (해당 시) | `compute*Summary` selector |
| ⑦ | 결과 카드 산식·표시 | `{TaxType}ResultView` + 상세 카드들 — 산식 숫자 옆 변수명 라벨 |
| ⑧ | **Validation** | `lib/calc/{tax-type}-validate.ts` — API/UI fallback이 있는 필드는 validate에서도 같은 fallback 인식 (UI/API 통과 ↔ validate 차단 모순 방지) |

자가 점검 후 보고:

- [ ] 8개 지점 모두 동기화 확인
- [ ] API에 fallback 추가 시 validation에도 같은 fallback 인식 (⑧)
- [ ] `npx tsc --noEmit` 오류 0건
- [ ] 회귀 테스트 통과
- [ ] 브라우저 수동 확인 또는 미수행 명시
- [ ] (권장) `ui-engine-sync-checker` 호출 결과 첨부

## UI 수정 시 체크리스트

- [ ] `DateInput` 사용 (type="date" 아님)
- [ ] 금액(원) input은 `CurrencyInput` + `parseAmount`. 소수점 값(면적㎡·연수)에는 **반드시 `DecimalInput` + `parseDecimal`** 사용. CurrencyInput에 소수점 값 입력 시 333.06 → 33306 버그 발생
- [ ] `FieldCard` 외부에서 `CurrencyInput` 사용 시 `hideUnit` prop으로 단위 중복 방지
- [ ] `onFocus` 수동 추가 금지 (Provider가 처리)
- [ ] StepWizard 네비게이션 버튼 빠짐 없음
- [ ] 양도세 자산-수준 필드 추가 시 `AssetForm` (폼-전역 `TransferFormData` 아님)
- [ ] API 호출은 `lib/calc/{tax-type}-api.ts` 의 `call*API()` 를 거침 (직접 fetch 금지)
- [ ] `validateStep()` 로직 업데이트 (단계별 필수 필드). 양도세는 4단계: 0=자산 / 1=보유 / 2=감면 / 3=가산세
- [ ] zustand store selector는 매 렌더 새 객체 반환 금지 — `useMemo` 또는 atomic selector 사용 (무한 루프 방지)
- [ ] 800줄 정책 준수 — Phase별 sub-component 추출 (예: `SelfBuiltSection`)
- [ ] **UI 순서 = 엔진 계산 로직 순서**: 입력 필드 배치 전 엔진 함수의 변수 사용 순서 확인. 모드 토글은 영향 받는 필드 직전. 같은 그룹 내에서도 알고리즘 의존 순서 (예: PHD 토지면적이 모든 후속 곱셈 인자이므로 최상단)
- [ ] **placeholder 정확성**: "자동 안분"은 엔진이 실제로 안분할 때만. 자본적지출처럼 귀속이 명확해야 하는 필드는 "없으면 비워두세요"
- [ ] **사이드바 합계**: 입력된 값으로 계산 가능한 항목만 표시 (0원·null 제외). 환산 모드의 취득가액처럼 API 결과 후에야 알 수 있는 값은 결과 도착 후 노출
- [ ] **결과 뷰 산식**: 변수 약어(`P_F`, `Sum_A`) 금지·한국어 풀어쓰기, 법정 용어 우선, 중간 산술 결과 미표시, `floor()` 묵시 처리
- [ ] **금액 칸 정렬 (모든 표·신고서·보고서 공통)**: 금액(원) 셀은 `text-right font-mono tabular-nums whitespace-nowrap` — 천·백만·십억 콤마 세로 정렬. 공용 `BesshiRow`/`BesshiColumn`(`components/calc/results/shared/BesshiRow.tsx`) 재사용 우선. 상세: `amount-column-align` 스킬
- [ ] **면적 반올림 일관성**: 비율 계산으로 파생한 면적(부수토지 등)은 단가 곱셈 전 `parseFloat(rawArea.toFixed(2))`로 반올림. 표시 자리수와 계산 자리수를 반드시 일치시킴 (미적용 시 표시 76.51 / 계산 76.508 → 오차 발생)
- [ ] **개별공시지가 필드는 `LandPriceLookupField` 필수**: `components/calc/inputs/LandPriceLookupField.tsx`. 기준연도 드롭다운 + Vworld 조회 버튼 + 토지기준시가 자동 계산 포함. CurrencyInput 단독 사용 금지.
- [ ] **다-섹션 입력 폼 색상 카드 + 섹션 번호**: 3개 이상 서브섹션이 연속되는 입력 영역은 반드시 색상 카드 + 섹션 번호 패턴 적용 (아래 참고)

## 다-섹션 입력 폼 — 색상 카드 + 섹션 번호 패턴 (강제 규칙)

3개 이상의 서브섹션이 연속되는 입력 폼에는 반드시 아래 패턴을 적용한다.

### 구조

```tsx
// 부모: sectionNum prop으로 번호 주입 (순서 변경 시 한 곳만 수정)
<SubSection sectionNum={1} />
<SubSection sectionNum={2} />

// 자식 컴포넌트
<div className="rounded-lg border border-sky-200 bg-sky-50/40 p-3 space-y-2">
  <div className="flex items-center gap-2">
    {sectionNum !== undefined && (
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-200 text-[10px] font-bold text-sky-800 select-none">
        {sectionNum}
      </span>
    )}
    <p className="text-xs font-semibold text-sky-700">섹션 제목</p>
  </div>
  {/* 내부 항목 — 항목별 번호 없음, 섹션 번호만 */}
  <FieldCard ...>...</FieldCard>
</div>
```

### 색상 가이드

| 섹션 성격 | 테두리/배경/텍스트 |
|---|---|
| 면적·규모 | `border-sky-200 bg-sky-50/40` / `text-sky-700` / `bg-sky-200 text-sky-800` |
| 양도시 기준시가 | `border-emerald-200 bg-emerald-50/40` / `text-emerald-700` / `bg-emerald-200 text-emerald-800` |
| 취득시 기준시가 | `border-amber-200 bg-amber-50/40` / `text-amber-700` / `bg-amber-200 text-amber-800` |
| 거주·보유 정보 | `border-violet-200 bg-violet-50/40` / `text-violet-700` / `bg-violet-200 text-violet-800` |
| 지역·지정 정보 | `border-rose-200 bg-rose-50/40` / `text-rose-700` / `bg-rose-200 text-rose-800` |

- 자동 계산 결과 박스도 해당 카드의 색조로 통일 (`bg-*/100/60 border border-*/200`)
- 카드 간 간격은 `space-y-3`
- **대표 구현**: `components/calc/transfer/mixed-use/` (면적·기준시가·거주 섹션 ①~⑤)

### 톤 단일 소스 + `<ToneCard>` (2026-07-10 표준화)

위 색상 가이드의 톤은 **canonical 정적 소스** `components/calc/shared/tones.ts`(`Tone` 6톤 × `TONE[t].card/title/badge/chip/toggle`)에서만 가져온다. **동적 `bg-${tone}` 보간 금지**(production JIT purge silent failure — `feedback_tailwind_static_tone_mapping`) → `scripts/check-tone-classes.sh`가 pre-push 하드블록.

신규 안내/섹션 카드는 인라인 `className` 하드코딩 대신 공용 컴포넌트를 쓴다:

| 상황 | 사용 |
|---|---|
| 비접힘 안내/섹션 카드 | `<ToneCard tone [title] [sectionNum]>` (`components/calc/shared/ToneCard.tsx`). `sectionNum` 有=번호배지+제목·`title`만=제목형·둘 다 無=순수 톤 박스. `sectionNum`은 `string`("1-A")·`number`. 외곽 `p`/`space-y`는 `className`/`bodyClassName`으로 조정(cn/twMerge) |
| 서술형 접힘 도움말(왜·어떻게) | `<CollapsibleHintCard tone summary>` (print 유지) |
| 상태 배지·자동계산 결과박스 톤 | `TONE[tone].badge`(bg-200) / `TONE[tone].chip`(bg-100) |
| 도메인 enum 신호등(저율/기본/중과 등 3+단계) | **로컬 정적 `Record<Tone,string>` 허용**(이미 정책준수 — 강제통합 안 함) |
| 공식 서식 replica 표 | gray/neutral/zinc 유지(원본 재현 — 변경 금지) |

- **2축 주의**: 같은 팔레트가 입력 섹션 성격(amber=취득·violet=거주 등)과 메시지 상태(amber=주의·emerald=성공 등)를 겸한다 — 톤 선택 시 문맥으로 판단.
- **green≈emerald 중복**: `green`은 `emerald`와 동의어(비과세·긍정)이나 `green-100≠emerald-100` 픽셀 상이 → 신규는 `emerald` 사용 권장(기존 green 미변경).
- **blue**(법령배지)는 카드 톤 축 아님 → `components/calc/shared/lawBadge.ts`의 `LAW_BADGE_CLASS` 별도 상수.
- 설계·근거: `docs/02-design/features/ui-color-tone-tokenization.plan.md`.

## 토글 가시성 원칙 — ToggleCard (강제 규칙)

분기·옵션 토글은 반드시 `@/components/calc/inputs/ToggleCard.tsx`(`ToggleCard`) 사용. native `<input type="checkbox">` 신규 작성 금지 (2026-04-29 프로젝트 전체 마이그레이션 완료, native checkbox 0건).

라디오 그룹은 반드시 `@/components/calc/inputs/RadioCardGroup.tsx`(`RadioCardGroup`) 사용. native `<input type="radio">` 신규 작성 금지 (2026-04-30 프로젝트 전체 마이그레이션 완료, RadioCardGroup 컴포넌트 내부 외 native radio 0건). ToggleCard와 동일한 가시성 원칙 적용 — **미선택 옵션도 tone 배경 항상 유지**, 선택된 옵션만 ring·border 진하기·title 색으로 강조.

### OFF 상태에도 tone 배경 항상 유지

ToggleCard는 OFF/ON 모두 `bg-{tone}-50/70` 배경을 적용한다. 회색·중립 배경(`bg-card`·`bg-background`·`bg-muted/30`) **금지**.

**이유**: 회색 배경을 OFF로 사용하면 분기 토글이 평범한 라벨에 묻혀 사용자가 토글 컨트롤의 존재조차 인지하지 못한다. 카드 자체가 색상으로 발견되어야 하며, 상태(ON/OFF)는 부차적 신호로 충분하다 (사용자 피드백, 2026-04-29).

### ON/OFF 구분은 4가지 보조 신호

배경은 동일해도 아래 신호로 상태가 명확히 구분된다:

| 신호 | OFF | ON |
|---|---|---|
| Switch thumb 위치 | 좌측 | 우측 |
| border | `border-{tone}-200/70` (옅음) | `border-{tone}-300` (진함) |
| ring | 없음 | `ring-1 ring-{tone}-200/50` |
| title 색 | 기본(`font-semibold`만) | `text-{tone}-900` |

### tone 매핑 (의미별)

| tone | 의미 | 사용 예 |
|---|---|---|
| `amber` | 취득·분리계산 모드 | 겸용주택, 신축, PHD §164⑤, 토지/건물 분리·소유자 분리 |
| `rose` | 지역·지정 정보 | 수도권 지역, 조정대상지역 |
| `violet` | 거주·자격 정보 | 임대 최초계약, 어린이집 인가증·실사용, 사원주택 제공 |
| `emerald` | 긍정·확정·평가 정보 | 평가심의위원회·상장 전 토글 등 (비상장주식 V2, 전 세목 다수) |
| `sky` | 면적·규모·일반 정보 | 다수 (전 세목) |

### variant

- `card` (기본): 풀 카드. `children` 펼침 영역 지원 (ON 시에만 렌더, 좌측 색조 인디케이터 자동)
- `chip`: 인라인 칩. 라벨 옆 짧은 토글에 사용 (예: "취득일" 라벨 옆 토지/건물 분리 토글). children 미지원

### `disabled` + `disabledReason`

비활성 사유가 있으면 `disabled` + `disabledReason`을 함께 전달. card variant는 description 자리에, chip variant는 hover title + description 자리에 자동 표시.

### 직접 토글 카드를 만드는 경우(예외적)

ToggleCard로 표현하기 어려운 특수 케이스에도 동일 원칙 준수:
- OFF 상태에 `bg-{tone}-50/70` 배경 필수
- 회색 배경(`bg-card`·`bg-muted`) 사용 금지
- ON/OFF 구분은 위 4신호 중 최소 2개 이상 차별화

## 같은 의미 폼 필드의 양방향 read/write 통합 (2026-05-03 이후)

겸용주택 Case A 4부분 안분에서 "취득시 상가건물 기준시가"·"양도시 상가건물 기준시가"가 메인 섹션과 PHD 섹션 두 곳에서 입력되는 문제를 해결한 패턴.

**원칙**: 별도 폼 필드 신설 금지. **단일 폼 필드를 두 위치에서 양방향 read/write**.

- 같은 폼 필드 (예: `mixedAcqCommercialBuildingPrice`, `mixedTransferCommercialBuildingPrice`)를 두 컴포넌트에서 직접 read/write
- `useEffect → store` 미러링 정책 위반 없음 (직접 동일 필드 수정 — 자동 동기화)
- API/Validation은 fallback 패턴으로 양쪽 인식 (`phdField || mixedField`) — CLAUDE.md ⑧ 정책 준수
- 사용자가 어디서 입력하든 자동 동기화, 데이터 중복 방지

**적용 예**: `MixedUsePreHousingDisclosureSection.tsx` 의 `commercialBuildingStdPriceAtAcq/AtTransfer` props가 메인 섹션의 동일 필드를 직접 수정.

## placeholder에 숫자 예시 금지 (전 세목 공통, 2026-05-03 이후)

입력란 `placeholder`에 특정 숫자(계산 예제·Excel 예제 숫자 등) 사용 금지. 도움말이 필요한 경우 **한국어 설명**으로만 표시.

- 잘못된 예: `placeholder="예: 91.78"`, `placeholder="예: 10,000,000"`
- 올바른 예: `placeholder="양도시 주거용 합계 면적"`, `placeholder="금액 입력 (원)"`
- 입력 형식 안내가 필요하면 FieldCard의 `hint` prop에 한국어로 작성

## 라벨 타이포그래피 규칙 (전 세목 공통 — 2026-07-10 표준화)

폰트 = **Pretendard**(self-host, `app/fonts/PretendardVariable.woff2`, `app/layout.tsx` next/font/local). 라벨 크기는 **역할 → 정본 클래스**로 고정한다. 임의 크기 폰트(`text-[Npx]`·`text-[Nrem]`·`text-[Nem]`) **금지** — `scripts/check-font-sizes.sh`가 **pre-push에서 하드블록**(CI는 비차단이라 pre-push가 진짜 게이트).

| 역할 | 정본 클래스 | 크기 |
|---|---|---|
| 계산기 페이지 제목 (h1) | `text-2xl` | 24px |
| 마법사 단계 제목 (h2) | `text-lg` | 18px |
| 섹션 헤더 제목 | `text-base` | 16px |
| 필드 라벨 · 옵션 제목 | `text-sm` | 14px |
| hint · 단위 · 배지 · 경고 · 서브섹션 제목 | `text-xs` | 12px |
| 캡션 · fine print · 보조 본문 | `text-caption` | 11px |
| 번호배지 · pill · 상첨자 극소 chrome | `text-micro` | 10px |

- **온-스케일(12~24)은 내장 Tailwind 클래스가 정본** — 같은 크기에 새 토큰명 신설 금지(`text-hint` 같은 중복 이름 = 원래 병 재생산).
- **오프스케일 2종만 커스텀**: `text-caption`(11)·`text-micro`(10) — `app/globals.css` `@utility`, **font-size만**(행간은 기존 `leading-*`가 제어).
- 굵기는 토큰 미포함 — 역할별 표준 굵기를 `font-medium`/`font-semibold`로 병기.
- `font-mono`(금액 칼럼)는 대상 아님([amount-column-align] 스킬).
- 배지·chrome엔 `text-micro`(10), 읽는 보조 텍스트엔 `text-caption`(11) — 크기가 곧 chrome/text 구분.
- 설계·근거: `docs/02-design/features/ui-label-typography-standardization.plan.md`.

## 모달 런처 버튼 규칙 (전 세목 공통 — 2026-07-10)

하위 모달(Dialog)을 여는 **런처 버튼**(계산·조회 헬퍼·이력 불러오기)은 `<Button variant="modalLauncher">`(연녹색, "자동" 배지 톤 `bg-green-100/text-green-700`) 사용. `components/ui/button.tsx` 단일 소스(dark override 없음 — 배지와 전 테마 동일).

- **native `<button>`로 런처 신규 작성 금지** → `<Button variant="modalLauncher" size={...}>`.
- **size**: 라벨 12px면 `xs`/`sm`, **14px면 `default`**(Button `sm`·`xs`는 둘 다 12px, `default`만 14px).
- `data-testid`·`title`·`disabled`는 `<Button>`이 `...props`로 통과 → **그대로 전달**(테스트 셀렉터·툴팁·비활성 사유 보존).
- **제외**(이 variant 아님): 항목 추가/편집(+add) 에디터, 드롭다운(autocomplete·시군구·주소검색), 도움말 ⓘ(`TaxHelp`), 법조문/판례 인용 링크(`LawArticleModal` 등), 확인/폐기 다이얼로그.
- 인라인 "다시 계산" 재오픈 링크는 chip 대신 녹색 텍스트 링크(`text-green-700 underline`) 유지 가능.
- 설계: `docs/02-design/features/modal-launcher-button-style.plan.md`.
