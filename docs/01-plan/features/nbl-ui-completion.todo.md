# 비사업용 토지 판정 UI·엔진 완전화 — TODO

> 계획서: `docs/01-plan/features/nbl-ui-completion.plan.md` (v1.2)
> 설계서: `docs/02-design/features/nbl-ui-completion.design.md` (v1.2)
> UI 설계: `docs/02-design/features/nbl-ui-completion.ui.design.md`
> 엔진 설계: `docs/02-design/features/nbl-ui-completion.engine.design.md`
> 작성일: 2026-04-25
> 담당: 프론트엔드(frontend-architect) + 비사업용토지(non-business-land-tax-senior) + QA(transfer-tax-qa)
> 의존: form-visibility-improvement Phase P1 완료 (FieldCard·SectionHeader·WizardSidebar 사용 가능)

---

## 진행 상태 범례

| 기호 | 상태 |
| ---- | ---- |
| `[ ]` | 미시작 |
| `[~]` | 진행 중 |
| `[x]` | 완료 |
| `[!]` | 차단 / 검토 필요 |

---

## 작업 합산 요약

| Phase | 항목 수 | 신규 파일 | 수정 파일 | 신규 테스트 | 예상 시간 |
| ----- | ------- | --------- | --------- | ----------- | --------- |
| P1 AssetForm 확장 + 마이그레이션 | 14 | 0 | 3 | 1 | 1.5일 |
| P2 공용 데이터·컴포넌트 신설 | 8 | 4 | 0 | 1 | 1일 |
| P3 NBL 섹션 컴포넌트 신설 (FieldCard 기반) | 18 | 9 | 0 | 0 | 3일 |
| P4 통합 + 글로벌 NBL 제거 | 6 | 0 | 3 | 0 | 0.5일 |
| P5 엔진 Gap 해소 | 14 | 4 | 5 | 4 | 2일 |
| P6 결과 카드 강화 | 7 | 0 | 1 | 0 | 1일 |
| P7 통합 테스트 + QA | 9 | 2 | 0 | 2 | 1일 |
| **합계** | **76** | **19** | **12** | **8** | **10일** |

---

## Phase P1 — AssetForm 확장 + 마이그레이션

### P1-A `AssetForm` NBL 기본 필드 추가

| 상태 | ID | 작업 | 파일 | 의존 | 완료 기준 |
| ---- | -- | ---- | ---- | ---- | --------- |
| `[x]` | P1-01 | `isNonBusinessLand: boolean` (asset 단위 단순 체크박스) | `lib/stores/calc-wizard-store.ts` (line 141 직후) | - | AssetForm 인터페이스에 정의 |
| `[x]` | P1-02 | `nblUseDetailedJudgment: boolean` (상세 판정 활성화 플래그) | 동상 | P1-01 | 인터페이스 정의 |
| `[x]` | P1-03 | `nblLandType` 6종 union + `nblZoneType` string + `nblBusinessUsePeriods: NblBusinessUsePeriod[]` | 동상 | P1-01 | tsc 통과 |
| `[x]` | P1-04 | `nblFarmingSelf: boolean` + `nblFarmerResidenceDistance: string` (농지 자경·거리) | 동상 | P1-03 | 인터페이스 정의 |
| `[x]` | P1-05 | ⚠️ `nblLandArea` 추가 금지 — `acquisitionArea` 재사용. 주석으로 명시 | 동상 | P1-03 | grep로 nblLandArea 0건 확인 |

### P1-B `AssetForm` NBL 확장 필드 + 신규 타입

| 상태 | ID | 작업 | 파일 | 의존 | 완료 기준 |
| ---- | -- | ---- | ---- | ---- | --------- |
| `[x]` | P1-06 | 신규 타입 선언: `ResidenceHistoryInput` / `GracePeriodInput` | `lib/stores/calc-wizard-store.ts` | - | 두 인터페이스 export |
| `[x]` | P1-07 | 위치·거주 필드 4종 (`nblLandSigunguCode/Name`, `nblResidenceHistories`) | AssetForm | P1-01, P1-06 | 인터페이스 정의 |
| `[x]` | P1-08 | 무조건 면제 §168-14③ 10필드 (체크박스 7 + 날짜 3) | AssetForm | P1-01 | 10개 필드 추가 |
| `[x]` | P1-09 | 도시편입·수도권·공동상속 3필드 (`nblUrbanIncorporationDate`, `nblIsMetropolitanArea`, `nblOwnershipRatio`) | AssetForm | P1-01 | 인터페이스 정의 |
| `[x]` | P1-10 | 농지 세부 7필드 (`nblFarmlandIs*` 6종 + `nblFarmlandConversionDate`) | AssetForm | P1-01 | 인터페이스 정의 |
| `[x]` | P1-11 | 임야 세부 5필드 (`nblForest*`) | AssetForm | P1-01 | 인터페이스 정의 |
| `[x]` | P1-12 | 목장 세부 6필드 (`nblPasture*` + `nblPastureLivestockPeriods`) | AssetForm | P1-01 | 인터페이스 정의 |
| `[x]` | P1-13 | 주택 부속(`nblHousingFootprint`) + 별장 5필드(`nblVilla*` + `nblVillaUsePeriods`) + 나대지 4필드(`nblOther*`) | AssetForm | P1-01 | 인터페이스 정의 |
| `[x]` | P1-14 | 부득이한 사유 (`nblGracePeriods: GracePeriodInput[]`) | AssetForm | P1-06 | 인터페이스 정의 |
| `[x]` | P1-15 | `makeDefaultAsset()`에 모든 신규 필드 기본값 추가 (boolean false / string "" / array []) | `lib/stores/calc-wizard-store.ts` | P1-01~P1-14 | 신규 자산 생성 시 NaN/undefined 0건 |

### P1-C root nbl* 제거 + `migrateLegacyForm()` 확장 + persist bump

| 상태 | ID | 작업 | 파일 | 의존 | 완료 기준 |
| ---- | -- | ---- | ---- | ---- | --------- |
| `[x]` | P1-16 | `TransferFormData`에서 NBL 6필드 제거 (`nblLandType`, `nblLandArea`, `nblZoneType`, `nblFarmingSelf`, `nblFarmerResidenceDistance`, `nblBusinessUsePeriods`) + `isNonBusinessLand` root 제거 | `lib/stores/calc-wizard-store.ts` (lines 405-410) | P1-15 | tsc 에러 발생 → P1-17~P1-19로 해결 |
| `[x]` | P1-17 | `migrateLegacyForm()`에 root → primaryAsset 이전 블록 추가 (legacy.nblLandType 존재 시) | `lib/stores/calc-wizard-migration.ts:29~239` | P1-16 | 7개 필드 모두 이전 |
| `[x]` | P1-18 | `legacy.nblLandArea` → `primaryAsset.acquisitionArea` (비어있을 때만) | `calc-wizard-migration.ts` | P1-17 | 면적 손실 0 |
| `[x]` | P1-19 | persist version bump (현재 → +1) + `migrateLegacyForm` end의 destructuring filter (line 180~231)에 `nbl*` 7키 추가 | `calc-wizard-store.ts` + `calc-wizard-migration.ts` | P1-16 | 마이그레이션 후 root에 nbl* 0건 |

### P1-D API 어댑터 수정 — `form.nbl*` → `primary.nbl*`

| 상태 | ID | 작업 | 파일 | 의존 | 완료 기준 |
| ---- | -- | ---- | ---- | ---- | --------- |
| `[x]` | P1-20 | `transfer-tax-api.ts:160~200` 의 `nblDetails` 빌드 코드 수정 — `form.nblLandType` → `primary.nblLandType`, `form.nblLandArea` → `primary.acquisitionArea` 등 | `lib/calc/transfer-tax-api.ts` | P1-19 | tsc 통과 + 단일 토지 시나리오 회귀 0 |
| `[x]` | P1-21 | `multi-transfer-tax-api.ts:15~50` 동일 패턴 — 자산별 loop에서 `asset.nbl*` 읽기 | `lib/calc/multi-transfer-tax-api.ts` | P1-19 | 다중 토지 자산 각각 nblDetails 별도 생성 |
| `[x]` | P1-22 | `__tests__/lib/transfer-step-migration.test.ts`에 NBL root→asset 이전 테스트 4건 추가 (단순 nblLandType 이전 / nblLandArea→acquisitionArea / 빈값 처리 / 다른 자산 영향 없음) | `__tests__/lib/transfer-step-migration.test.ts` | P1-19 | 4건 신규 통과 |

**Phase P1 완료 기준**: `npm test -- transfer-step-migration` 통과 + `npm run build` 0 에러 + 기존 양도세 단순 계산 동작 회귀 0

---

## Phase P2 — 공용 데이터·컴포넌트 신설

### P2-A `sigungu-codes.ts` 신규 — 행안부 시군구 표준코드

| 상태 | ID | 작업 | 파일 | 의존 | 완료 기준 |
| ---- | -- | ---- | ---- | ---- | --------- |
| `[x]` | P2-01 | `SigunguCode` 인터페이스 + `SIGUNGU_CODES` 상수 (시도별 묶음, ~250개) | `lib/korean-law/sigungu-codes.ts` (신규) | - | 800줄 이하, 17개 시도 모두 포함 |
| `[x]` | P2-02 | `lookupSigungu(code)` + `searchSigungu(query)` 헬퍼 함수 | 동상 | P2-01 | 자동완성 lookup 시간 < 5ms |
| `[x]` | P2-03 | 인접 시군구(`adjacentCodes`) 데이터 사전 계산 — 경계 공유 + 30km 이내. 도서지역(제주·울릉) `[]` | 동상 | P2-01 | 17개 시도 표본 검증 |
| `[x]` | P2-04 | `__tests__/lib/sigungu-codes.test.ts` (신규) — lookup·search·adjacent 5건 | `__tests__/lib/sigungu-codes.test.ts` | P2-03 | 5건 통과 |

### P2-B 공용 NBL UI 컴포넌트

| 상태 | ID | 작업 | 파일 | 의존 | 완료 기준 |
| ---- | -- | ---- | ---- | ---- | --------- |
| `[x]` | P2-05 | `SigunguSelect.tsx` 신규 — props: `{ value, valueName?, onChange, placeholder?, className? }` | `components/calc/transfer/nbl/shared/SigunguSelect.tsx` | P2-02 | 자동완성 동작, 키보드 ↑↓ 선택 |
| `[x]` | P2-06 | `SigunguSelect`는 `FieldCard`로 감싸 사용 (자체 wrap 금지) — props에 `label?` / `hint?` 추가 안 함 | 동상 | P2-05 | NblSection 측에서 FieldCard로 wrap |
| `[x]` | P2-07 | `BusinessUsePeriodsInput.tsx` 신규 — 기존 `NblDetailSection.tsx:155~204`의 사업용 기간 배열 UI 추출 | `components/calc/transfer/nbl/shared/BusinessUsePeriodsInput.tsx` | - | DateInput x2 + usageType + 추가/삭제 |
| `[x]` | P2-08 | onFocus 전체선택 규칙 준수 + 800줄 이하 | 동상 | P2-07 | input 5종 모두 onFocus select |

**Phase P2 완료 기준**: 공용 컴포넌트 4개 export 가능 상태 + 시군구 검색 동작 검증

---

## Phase P3 — NBL 섹션 컴포넌트 신설 (FieldCard 기반)

> ⚠️ **모든 섹션 컴포넌트는 `FieldCard` + `SectionHeader` 필수 사용**. 자체 div+label 구조 금지.
> props 시그니처 통일: `{ asset: AssetForm, onAssetChange: (patch: Partial<AssetForm>) => void }`

### P3-A `NblSectionContainer.tsx` 통합 컨테이너

| 상태 | ID | 작업 | 파일 | 의존 | 완료 기준 |
| ---- | -- | ---- | ---- | ---- | --------- |
| `[x]` | P3-01 | 디렉터리 생성 `components/calc/transfer/nbl/` | - | - | mkdir 완료 |
| `[x]` | P3-02 | `NblSectionContainer.tsx` 골격 — 토글(`asset.nblUseDetailedJudgment`) + 6 자식 섹션 조건부 렌더 | `components/calc/transfer/nbl/NblSectionContainer.tsx` | P3-01, P1-15 | 토글 ON/OFF 동작 |
| `[x]` | P3-03 | 무조건 면제 체크 시 하위 섹션 음영 (`opacity-50` + 안내 Badge) | 동상 | P3-02 | 시각 회귀 검증 |
| `[x]` | P3-04 | 지목 선택에 따라 6개 DetailSection 중 하나만 렌더 | 동상 | P3-02 | 지목 6종 전환 시 1개만 표시 |

### P3-B `UnconditionalExemptionSection.tsx` (§168-14③ 7종)

| 상태 | ID | 작업 | 파일 | 의존 | 완료 기준 |
| ---- | -- | ---- | ---- | ---- | --------- |
| `[x]` | P3-05 | SectionHeader + 7개 FieldCard 체크박스 + 조건부 DateInput 3종 | `components/calc/transfer/nbl/UnconditionalExemptionSection.tsx` | P3-01, P1-08 | 7개 면제 사유 모두 입력 가능 |
| `[x]` | P3-06 | 하나라도 체크 시 InfoBox 노출 ("엔진이 무조건 사업용으로 판정합니다") | 동상 | P3-05 | 시각 검증 |

### P3-C `ResidenceHistorySection.tsx` 거주 이력

| 상태 | ID | 작업 | 파일 | 의존 | 완료 기준 |
| ---- | -- | ---- | ---- | ---- | --------- |
| `[x]` | P3-07 | SectionHeader + 행별 FieldCard wrap (DateInput x2 + SigunguSelect + 주민등록 체크 + 삭제) | `components/calc/transfer/nbl/ResidenceHistorySection.tsx` | P3-01, P2-05, P1-07 | 배열 추가/삭제 동작 |
| `[x]` | P3-08 | "임야의 경우 주민등록 필수" 안내 InfoBox | 동상 | P3-07 | 안내 표시 |

### P3-D 지목별 6종 — 농지·임야·목장·주택·별장·나대지

| 상태 | ID | 작업 | 파일 | 의존 | 완료 기준 |
| ---- | -- | ---- | ---- | ---- | --------- |
| `[x]` | P3-09 | `FarmlandDetailSection.tsx` — 자경 + 거리 + 의제자경 6종 (FieldCard) | `components/calc/transfer/nbl/FarmlandDetailSection.tsx` | P3-01, P1-10 | 8개 입력 모두 동작, 200줄 이하 |
| `[x]` | P3-10 | `ForestDetailSection.tsx` — 산림경영계획·공익림·보안림·후계자·상속3년 + 주민등록 안내 | `components/calc/transfer/nbl/ForestDetailSection.tsx` | P3-01, P1-11 | 5개 + InfoBox |
| `[x]` | P3-11 | `PastureDetailSection.tsx` — 축산업 + 가축종류 Select(8종) + 두수 + 사육기간 배열 + 상속일 + 특수조직 | `components/calc/transfer/nbl/PastureDetailSection.tsx` | P3-01, P1-12, P2-07 | 6개 입력 동작 |
| `[x]` | P3-12 | `HousingLandDetailSection.tsx` — 수도권 radio + 주택 연면적 + 3/5/10배 자동 계산 안내 Badge | `components/calc/transfer/nbl/HousingLandDetailSection.tsx` | P3-01, P1-13 | 배율 자동 계산 정확 |
| `[x]` | P3-13 | `VillaLandDetailSection.tsx` — 사용기간 배열 + 읍면 + 농어촌주택 + 2015 이후 | `components/calc/transfer/nbl/VillaLandDetailSection.tsx` | P3-01, P1-13, P2-07 | 4개 입력 동작 |
| `[x]` | P3-14 | `OtherLandDetailSection.tsx` — 재산세 분류 Select + 건물가액 + 토지가액 + 주택 관련 + 2% 추정 안내 | `components/calc/transfer/nbl/OtherLandDetailSection.tsx` | P3-01, P1-13 | 4개 입력 + 2% 안내 |

### P3-E `GracePeriodSection.tsx` 부득이한 사유

| 상태 | ID | 작업 | 파일 | 의존 | 완료 기준 |
| ---- | -- | ---- | ---- | ---- | --------- |
| `[x]` | P3-15 | SectionHeader + 사유 Select(7종) + DateInput x2 + 설명 입력 (FieldCard) | `components/calc/transfer/nbl/GracePeriodSection.tsx` | P3-01, P1-14 | 배열 추가/삭제 동작 |
| `[x]` | P3-16 | 7가지 사유: inheritance / legal_restriction / sale_contract / construction / unavoidable / preparation / land_replotting | 동상 | P3-15 | 옵션 7종 모두 표시 |

### P3-F 공통 — 지원 필드 + 충돌 감지

| 상태 | ID | 작업 | 파일 | 의존 | 완료 기준 |
| ---- | -- | ---- | ---- | ---- | --------- |
| `[x]` | P3-17 | `NblSectionContainer`에 도시편입일 + 수도권 라디오 + 공동상속 지분(0~1) FieldCard 추가 | `NblSectionContainer.tsx` | P3-02, P1-09 | 3개 입력 동작 |
| `[x]` | P3-18 | 충돌 감지 — `asset.nblUseDetailedJudgment && judgmentResult` 시 단순 체크박스 vs 엔진 결과 비교, 차이 시 경고 표시 | 동상 | P3-02 | 충돌 시 InfoBox 노출 |

**Phase P3 완료 기준**: 9개 컴포넌트 모두 export 가능 + 각 파일 200줄 이하 + 시각 검증 단계별 통과

---

## Phase P4 — 통합 + 글로벌 NBL 제거

### P4-A `CompanionAssetCard.tsx` 마운트

| 상태 | ID | 작업 | 파일 | 의존 | 완료 기준 |
| ---- | -- | ---- | ---- | ---- | --------- |
| `[x]` | P4-01 | `CompanionAssetCard.tsx` 내부 `assetKind === "land"` 조건부 블록에 `<NblSectionContainer asset={asset} onAssetChange={onAssetChange} />` 1줄 추가 | `components/calc/transfer/CompanionAssetCard.tsx` | P3-02 | 토지 자산에서만 NBL 섹션 노출 |
| `[x]` | P4-02 | `CompanionAssetCard.tsx` 라인 수가 800줄 초과하지 않는지 확인 | 동상 | P4-01 | wc -l 통과 |

### P4-B `Step4.tsx` 글로벌 제거

| 상태 | ID | 작업 | 파일 | 의존 | 완료 기준 |
| ---- | -- | ---- | ---- | ---- | --------- |
| `[x]` | P4-03 | `Step4.tsx`의 `NblDetailSection` import + 사용처 제거 | `app/calc/transfer-tax/steps/Step4.tsx` | P4-01 | grep로 NblDetailSection 0건 |
| `[x]` | P4-04 | `Step4.tsx`의 단순 isNonBusinessLand 체크박스(line 282~309)는 자산 카드 내부로 이동했으므로 제거 | 동상 | P4-03 | tsc 통과 |
| `[x]` | P4-05 | 옛 파일 `app/calc/transfer-tax/steps/step4-sections/NblDetailSection.tsx` (208줄) 삭제 | - | P4-04 | 파일 부재 확인 |
| `[x]` | P4-06 | `npm run build` + `npm run lint` 0 에러 | - | P4-05 | 빌드 통과 |

**Phase P4 완료 기준**: 기존 단순 NBL 시나리오 회귀 0 + 토지 자산에서만 NBL 섹션 노출

---

## Phase P5 — 엔진 Gap 해소 (UI 작업과 병렬 가능)

### P5-A 신규 엔진 모듈 4종

| 상태 | ID | 작업 | 파일 | 의존 | 완료 기준 |
| ---- | -- | ---- | ---- | ---- | --------- |
| `[x]` | P5-01 | `grace-period.ts` — `calculateGraceDaysInWindow(periods, window)` 구현. 중복 제거 후 윈도우 내 일수 합산 | `lib/tax-engine/non-business-land/grace-period.ts` (신규) | - | tsc 통과 |
| `[x]` | P5-02 | `co-ownership.ts` — `applyCoOwnershipRatio(judgment, ratio)`. 면적 안분만 비례, 판정 자체 불변. 대법 2015두39439 주석 | `lib/tax-engine/non-business-land/co-ownership.ts` (신규) | - | tsc 통과 |
| `[x]` | P5-03 | `data/livestock-standards.ts` — `LIVESTOCK_STANDARD_AREA` 8종(한우·젖소·돼지모돈·돼지비육·가금·말·양·염소) + `getLivestockStandardArea(type, count)` | `lib/tax-engine/non-business-land/data/livestock-standards.ts` (신규) | - | 8종 모두 정의 |
| `[x]` | P5-04 | `form-mapper.ts` — `mapAssetToNblInput(asset, dates): NonBusinessLandInput \| null`. asset.nblUseDetailedJudgment === false면 null 반환 | `lib/tax-engine/non-business-land/form-mapper.ts` (신규) | P1-15 | 모든 nbl* 필드 매핑 |
| `[x]` | P5-05 | `form-mapper.ts` — landArea는 asset.acquisitionArea 사용 (nblLandArea 폐지) | 동상 | P5-04 | acquisitionArea 참조 |

### P5-B 기존 엔진 파일 수정

| 상태 | ID | 작업 | 파일 | 의존 | 완료 기준 |
| ---- | -- | ---- | ---- | ---- | --------- |
| `[x]` | P5-06 | `period-criteria.ts` — `meetsPeriodCriteria()`에서 `rules.gracePeriods` 가산 (3년/5년/전체 윈도우) | `lib/tax-engine/non-business-land/period-criteria.ts` | P5-01 | 가산 후 effectiveBusinessDays 증가 |
| `[x]` | P5-07 | `engine.ts` — Villa REDIRECT 자동 재분류 (`action === "REDIRECT_TO_CATEGORY"` 시 housing으로 재호출) | `lib/tax-engine/non-business-land/engine.ts` | - | Villa 사용기간 충분 시 housing 판정 |
| `[x]` | P5-08 | `engine.ts` — `applyCoOwnershipRatio` 적용 (input.ownerProfile.ownershipRatio < 1 시) | 동상 | P5-02 | 면적 안분 지분 비례 |
| `[x]` | P5-09 | `housing-land.ts` — `isMetropolitanArea === undefined` 시 warning + true 보수처리 | `lib/tax-engine/non-business-land/housing-land.ts` | - | warning 메시지 + 3배 적용 |
| `[x]` | P5-10 | `pasture.ts` — 표준면적 하드코딩 제거 → `getLivestockStandardArea` import 사용 | `lib/tax-engine/non-business-land/pasture.ts` | P5-03 | 하드코딩 0건 |
| `[x]` | P5-11 | `types.ts` — `OwnerProfile.ownershipRatio?: number` 추가 | `lib/tax-engine/non-business-land/types.ts` | - | 신규 필드 optional |

### P5-C 엔진 단위 테스트

| 상태 | ID | 작업 | 파일 | 의존 | 완료 기준 |
| ---- | -- | ---- | ---- | ---- | --------- |
| `[x]` | P5-12 | `grace-period.test.ts` — 7가지 사유 + 중복 제거 + 윈도우 경계 8건 | `__tests__/tax-engine/non-business-land/grace-period.test.ts` (신규) | P5-01 | 8건 통과 |
| `[x]` | P5-13 | `co-ownership.test.ts` — 지분 100/50/33.3% + 면적 안분 + 판정 불변 5건 | `__tests__/tax-engine/non-business-land/co-ownership.test.ts` (신규) | P5-02 | 5건 통과 |
| `[x]` | P5-14 | `form-mapper.test.ts` — 6 지목 × 정상/빈값 + 무조건면제 매핑 12건 | `__tests__/tax-engine/non-business-land/form-mapper.test.ts` (신규) | P5-04 | 12건 통과 |

**Phase P5 완료 기준**: `npm test -- non-business-land` 신규 25건 + 기존 14건 = 39건 통과

---

## Phase P6 — 결과 카드 강화

### P6-A `NonBusinessLandResultCard` 개편

| 상태 | ID | 작업 | 파일 | 의존 | 완료 기준 |
| ---- | -- | ---- | ---- | ---- | --------- |
| `[x]` | P6-01 | 최상단 자연어 요약 배너 — "이 토지는 비사업용 토지입니다 (§168-14③). 기본세율 +10%p 중과, 장기보유특별공제 배제됩니다." | `components/calc/results/NonBusinessLandResultCard.tsx` | P5-11 | 시각 검증 |
| `[x]` | P6-02 | 무조건 면제 적용 시 강조 Badge + 사유 1줄 설명 | 동상 | P6-01 | 7가지 면제 사유 표시 |
| `[x]` | P6-03 | 지목별 판정 근거 별도 블록 (농지: 거주·자경 일수 / 임야: 주민등록 / 등) | 동상 | P6-01 | 지목별 다른 표시 |
| `[x]` | P6-04 | 면적 안분 시각화 — 사업용 vs 비사업용 bar chart (주택·목장 시) | 동상 | P5-08 | 비율 정확 |
| `[x]` | P6-05 | 유예기간 내역 타임라인 (gracePeriods 표시) | 동상 | P5-06 | 기간 표시 |
| `[x]` | P6-06 | 적용 조문 목록 — 기존 유지 (변경 없음) | 동상 | - | 회귀 0 |
| `[x]` | P6-07 | SectionHeader 패턴 사용 + 800줄 이하 | 동상 | - | 일관성 검증 |

**Phase P6 완료 기준**: 17개 시나리오 결과 카드 시각 검증 통과 + 800줄 이하

---

## Phase P7 — 통합 테스트 + QA

### P7-A 통합 테스트 17 시나리오

| 상태 | ID | 작업 | 파일 | 의존 | 완료 기준 |
| ---- | -- | ---- | ---- | ---- | --------- |
| `[x]` | P7-01 | `integration.test.ts` 신규 — 17 시나리오 셋업 (AssetForm fixture) | `__tests__/tax-engine/non-business-land/integration.test.ts` (신규) | P5-04 | 17개 fixture 정의 |
| `[x]` | P7-02 | 시나리오 1~7 (지목별 단순) — 농지 자경 / 도시편입 유예 / 임야 주민등록 / 임야 상속 3년 / 산림경영계획 / 축산업 목장 / 주택 부속 배율 | 동상 | P7-01 | 7건 통과 |
| `[x]` | P7-03 | 시나리오 8~14 (특례·면제) — 별장 REDIRECT / 나대지 종합합산 / 2007 이전 20년 / 직계존속 8년 / 공익사업 수용 / 종중 2005 이전 / 주말농장 의제자경 | 동상 | P7-01 | 7건 통과 |
| `[x]` | P7-04 | 시나리오 15~17 (복합) — 한계농지·간척지 / 부득이한 사유(질병) / 공동상속 50% 지분 + 임야 주민등록 부족 | 동상 | P7-01 | 3건 통과 |

### P7-B UI 통합 테스트

| 상태 | ID | 작업 | 파일 | 의존 | 완료 기준 |
| ---- | -- | ---- | ---- | ---- | --------- |
| `[x]` | P7-05 | `nbl-wizard.test.tsx` 신규 — vitest+jsdom으로 NblSectionContainer 렌더링 | `__tests__/ui/nbl-wizard.test.tsx` (신규) | P3-02 | 컴포넌트 마운트 |
| `[x]` | P7-06 | 토글 ON/OFF, 지목 변경 시 조건부 렌더 검증 | 동상 | P7-05 | 4건 통과 |

### P7-C QA 회귀 검증

| 상태 | ID | 작업 | 파일 | 의존 | 완료 기준 |
| ---- | -- | ---- | ---- | ---- | --------- |
| `[x]` | P7-07 | `npm test` 전체 1,407건 + 신규 ~50건 100% 통과 | - | P7-04, P7-06 | 회귀 0 |
| `[x]` | P7-08 | `tax-qa-lead` 에이전트 호출 — 양도세 전체 시나리오 회귀 검증 | - | P7-07 | 0 critical issues |
| `[x]` | P7-09 | `gap-detector` 실행 — Match Rate ≥95% | - | P7-07 | 95%+ |

**Phase P7 완료 기준**: 전체 테스트 통과 + tax-qa-lead 0 critical + gap-detector ≥95%

---

## 의존성 그래프

```
P1-A ──→ P1-B ──→ P1-C ──→ P1-D ──→ P5-A(form-mapper)
                              │
                              └──→ P3-A(컨테이너)
                                       │
P2-A ──→ P2-B ────────────────────────┘
                                       │
                                       ├──→ P3-B (무조건면제)
                                       ├──→ P3-C (거주이력)
                                       ├──→ P3-D (지목별 6종)
                                       ├──→ P3-E (부득이)
                                       └──→ P3-F (지원필드·충돌)
                                                │
                                                └──→ P4-A → P4-B
                                                              │
P5-A(엔진) ──→ P5-B ──→ P5-C ────────────────────────────────┤
                              │                              │
                              └──→ P6-A ────────────────────┤
                                                              │
                                                              └──→ P7-A → P7-B → P7-C
```

병렬 가능 그룹:
- **그룹 1**: P5-A(엔진 신규) + P5-B(엔진 수정) + P5-C(엔진 테스트) — UI와 무관, 별도 진행
- **그룹 2**: P3-B / P3-C / P3-D / P3-E — P3-A 완료 후 동시 진행
- **그룹 3**: P2-A(시군구 데이터) + P1-A(AssetForm) — 시작 시 병렬

---

## 마일스톤별 시간 예상

| 마일스톤 | 작업 | 누적 일수 |
| -------- | ---- | --------- |
| **M0** Phase 0 (브랜치+문서 정정) | ✅ 완료 | 0.5일 |
| **M1** Phase P1 (AssetForm + 마이그레이션 + API) | P1-01 ~ P1-22 | 2.0일 |
| **M2** Phase P2 (시군구 데이터 + 공용 컴포넌트) | P2-01 ~ P2-08 | 3.0일 |
| **M3** Phase P3 (NBL 9 컴포넌트) | P3-01 ~ P3-18 | 6.0일 |
| **M4** Phase P4 (통합 + 글로벌 제거) | P4-01 ~ P4-06 | 6.5일 |
| **M5** Phase P5 (엔진 Gap 해소) | P5-01 ~ P5-14 | 8.5일 (P3와 병렬 시 -1.5일) |
| **M6** Phase P6 (결과 카드) | P6-01 ~ P6-07 | 9.5일 |
| **M7** Phase P7 (테스트·QA) | P7-01 ~ P7-09 | 10.5일 |

**총 76개 작업 / 10.5일** (병렬 진행 시 약 9일)

---

## 리스크 체크리스트

| 시점 | 리스크 | 차단 조치 |
| ---- | ------ | --------- |
| P1-16 시작 시 | root nbl* 제거로 tsc 다발 에러 | P1-15까지 모두 완료 후 진행 / 한 번에 처리 |
| P3-D 시작 시 | 6개 파일 중복 코드 발생 가능 | P3-A의 NblSectionContainer가 props 패턴 표준화 |
| P5-A·P5-B 동시 진행 | grace-period.ts와 period-criteria.ts 동시 수정 충돌 | P5-01 → P5-06 순차 진행 |
| P7-08 시작 시 | tax-qa-lead가 critical 발견 | rollback 가능한 단위로 commit (Phase별) |

---

## 완료 정의 (Definition of Done)

이 todo가 100% 완료되었다고 판정하려면:

- [ ] 76개 항목 모두 `[x]`
- [ ] `npm test` 전체 100% 통과 (1,407 + ~50 신규)
- [ ] `npm run build` 0 에러 / `npm run lint` 0 에러
- [ ] `gap-detector` Match Rate ≥95%
- [ ] 17개 시나리오 모두 UI에서 입력 → 결과 카드 검증 통과
- [ ] `tax-qa-lead` 에이전트 0 critical issues
- [ ] 800줄 정책 100% 준수 (모든 신규/수정 파일)
- [ ] 기존 사용자 sessionStorage 데이터 자동 마이그레이션 검증 (3개 시나리오)

---

## 참고 — Plan/Design 문서 매핑

| Phase | 참조 문서 섹션 |
| ----- | -------------- |
| P1 | engine.design §1.1 (AssetForm 확장), §1.1.1 (마이그레이션 v1.2) |
| P2 | ui.design §10 (시군구 자동완성), §2.1 (FieldCard 패턴) |
| P3 | ui.design §1 (컨테이너 플로우), §3~§6 (각 섹션) |
| P4 | design §2 (파일 구조), plan §0.1 (4단계 마법사) |
| P5 | engine.design §3~§7 (Gap 해소), §8 (테스트) |
| P6 | ui.design §8 (결과 카드 변경) |
| P7 | engine.design §8.2 (통합 테스트 17 시나리오), plan §1.2 (시나리오 매트릭스) |
