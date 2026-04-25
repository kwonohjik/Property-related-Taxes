# 비사업용 토지 판정 UI·엔진 완전화 Plan

> **Feature ID**: `nbl-ui-completion`
> **작성일**: 2026-04-24
> **작성자**: kwonohjik
> **목적**: 소득세법 §104조의3 + 시행령 §168조의6~14 기반 비사업용 토지 판정을 사용자가 **UI만으로 완전하게 수행할 수 있도록** UI를 확장하고, 엔진이 요구하는 모든 입력 경로를 노출하며, 엔진의 일부 미구현 분기를 보강한다.
> **관련 엔진**: `lib/tax-engine/non-business-land/` (13 파일, types.ts 542줄 / engine.ts 317줄)
> **관련 UI (현재)**: `app/calc/transfer-tax/steps/step4-sections/NblDetailSection.tsx` (209줄)
> ⚠️ **v1.1 (2026-04-25)**: Stream A 업그레이드 반영 — NBL 필드 AssetForm 이전, 마운트 위치 CompanionAssetCard로 변경, API 경로 정정
> ⚠️ **v1.2 (2026-04-25)**: 시스템 UI 전면 개편 반영 — 4단계 마법사로 단순화(Step3 제거), 공용 컴포넌트(FieldCard·SectionHeader·WizardSidebar) 도입, 마이그레이션 모듈(`calc-wizard-migration.ts`) 분리, form-visibility-improvement 패턴 채택

---

## 0. v1.2 — 시스템 UI 전면 개편으로 인한 변경 (2026-04-25)

### 0.1 4단계 마법사 구조 (Step3 제거)

기존 5단계(Step1·Step3·Step4·Step5·Step6) → **4단계(Step1·Step4·Step5·Step6)**.
- **Step1**: 자산 목록 + 양도·취득 정보 통합 (구 Step3 흡수)
- **Step4**: 보유 상황 (1세대1주택, 다른 보유 주택, NBL 정밀 판정 임시 위치)
- **Step5**: 감면·공제 (자산별 reductions)
- **Step6**: 가산세

마이그레이션: `lib/stores/calc-wizard-migration.ts`의 `migrateLegacyForm()` (239줄, 신규 분리 모듈)에서 5→4 인덱스 매핑 + companionAssets 평탄화 + 13개 취득 필드 root→assets[0] 이전.

### 0.2 공용 컴포넌트 도입 (FieldCard 패턴)

`form-visibility-improvement` feature(별도 plan/design)에서 도입한 표준 UI 빌딩 블록:
- `components/calc/inputs/FieldCard.tsx` (76줄) — label + input + hint + warning + trailing 슬롯의 일관된 필드 레이아웃
- `components/calc/shared/SectionHeader.tsx` (43줄) — 섹션 헤더 (아이콘 + 설명 + action)
- `components/calc/shared/WizardSidebar.tsx` (138줄) — 데스크톱 좌측 사이드바 (단계 + 5개 합계 요약)
- `components/calc/transfer/SelfBuiltSection.tsx` (115줄) — 자가건축 섹션 (참고용 패턴)

NBL 신규 컴포넌트는 **반드시 FieldCard·SectionHeader 패턴 재사용**. 자체 div+label 구조 금지.

### 0.3 calc-wizard-migration.ts 분리 패턴

기존 plan은 `migrateAsset` 함수를 store 파일(`calc-wizard-store.ts`)에 추가하려 했으나, 800줄 정책 + 관심사 분리 원칙에 따라 **마이그레이션 로직은 `calc-wizard-migration.ts`에 별도 함수로 추가**해야 함.
- `migrateLegacyForm()`이 이미 5→4 마이그레이션 처리 중 → 이 함수에 NBL root→asset 이전 로직 inject
- `calc-wizard-store.ts`는 인터페이스 정의 + persist 설정만 담당

### 0.4 현재 NBL 상태 재확인 (commit 1118a45 분석 결과)

전 commit 1118a45에서 시스템 UI는 전면 개편됐으나, **NBL 자체 구현은 시작되지 않은 상태**:
- ❌ NBL 필드는 여전히 `TransferFormData` root (lines 405-410, 6개 필드)
- ❌ `components/calc/transfer/nbl/` 디렉터리 미생성
- ❌ 엔진 Gap 6건 미해소 (grace-period.ts, co-ownership.ts, form-mapper.ts, livestock-standards.ts 모두 미존재)
- ❌ `NblDetailSection` 단일 파일이 여전히 `Step4.tsx`에 마운트 (글로벌, 자산별 아님)

이 plan의 모든 마일스톤(M1~M7)은 그대로 유효, 단 작업 시 **0.1~0.3의 새 패턴을 따라야 함**.

---

## 1. 배경 및 현상 진단

### 1.1 현재 상태 (As-Is)

| 영역 | 완성도 | 비고 |
|---|---|---|
| 엔진 판정 로직 | ~90% | 6개 지목 카테고리, 7+1 무조건 면제, 3가지 기간기준, 면적 안분 모두 구현 |
| 엔진 입력 계약 (`NonBusinessLandInput`) | 100% | types.ts에서 24개 optional 구조체 정의 |
| UI 노출 필드 | **~15%** | 지목·면적·용도지역·자경여부·거리·기간배열만 노출 |
| UI 결과 표시 | ~70% | `NonBusinessLandResultCard` 존재, 타임라인·경고·조문 표시 |
| UI↔엔진 매핑 | **이중 경로 혼재** | 단순 `isNonBusinessLand` 체크박스 + `NblDetailSection` 공존 |
| 테스트 | 14개 모듈 (엔진 전용) | UI 통합 테스트 없음 |

### 1.2 실무 커버리지 진단

전체 비사업용 토지 실무 시나리오 대비 **약 20%만 UI로 판정 가능**:

| 시나리오 | 현재 UI 판정 가능? | 누락 원인 |
|---|---|---|
| 단순 농지 자경 (최근 3년 중 2년) | ⚠️ 부분 | 거리 fallback만 사용, 시군구 매칭 불가 |
| 도시편입 농지 3년 유예 | ❌ | 편입일 입력 필드 없음 |
| 임야 (주민등록 재촌 필수) | ❌ | 거주 이력 배열 없음 |
| 상속받은 임야 3년 내 양도 | ❌ | `inheritedForestWithin3Years` 없음 |
| 산림경영계획 인가림 | ❌ | `hasForestPlan` 없음 |
| 축산업 목장용지 | ❌ | 가축 종류·두수·사육기간 없음 |
| 주택 부속토지 배율 초과분 | ❌ | 수도권 여부·주택 면적 없음 |
| 별장 부속토지 REDIRECT | ❌ | 별장 사용기간 없음 |
| 나대지 (재산세 구분) | ❌ | 종합합산·별도합산 구분 없음 |
| 2006.12.31. 이전 상속 농지 | ❌ | 무조건 면제 7종 전혀 없음 |
| 20년 이상 보유 (2007년 이전) | ❌ | 동일 |
| 직계존속 8년 자경 상속·증여 | ❌ | 동일 |
| 공익사업 수용 | ❌ | 동일 |
| 종중 소유 (2005 이전 취득) | ❌ | 동일 |
| 주말농장 의제자경 | ❌ | `farmlandDeeming` 플래그 없음 |
| 한계농지·간척지 | ❌ | 동일 |
| 부득이한 사유 (질병·공사·상속) | ❌ | `gracePeriods` 배열 없음 |

### 1.3 엔진 내부 Gap 분석

엔진도 100% 완성은 아님. `engine.ts` / 각 카테고리 모듈을 정밀 리뷰한 결과:

| 엔진 Gap | 위치 | 심각도 |
|---|---|---|
| ① **§168-11② 수입금액 테스트** (나대지 종합합산 분기) | `other-land.ts` | 🟡 optional로 정의되어 있으나 실제 경유 테스트 부족 |
| ② **목장용지 표준면적 테이블** | `pasture.ts` | 🟡 하드코딩된 축종별 표준면적 현행 가축법 최신화 필요 |
| ③ **도시편입 유예 "연속 1년" 판정** | `period-criteria.ts` | 🟢 Bug-04 수정 완료 (2026-04-21) |
| ④ **별장 REDIRECT 후 재분류** | `villa-land.ts` | 🟡 action 플래그만 반환, 호출자가 실제 재분류 수행하는지 불명 |
| ⑤ **부득이한 사유 유예기간** (§168-14①) | 전체 | 🔴 `gracePeriods` 타입 정의만 있고 실제 판정에 반영 안 됨 |
| ⑥ **비수도권 도시지역 주택 부속토지 5배** | `housing-land.ts` | 🟡 수도권 여부 입력이 optional이라 기본값 처리 불분명 |
| ⑦ **상속 5년 이내 매도 무조건 특례** (§168-14③) | `unconditional-exemption.ts` | 🟢 구현됨, UI에서 노출만 필요 |
| ⑧ **공동상속 지분 판정** | 전체 | 🔴 지분율·공동명의 고려 없음 |

---

## 2. 목표 (Goals)

### 2.1 정량 목표

- **UI 커버리지**: 위 시나리오 17종 중 **15종 이상 판정 가능** (≥88%)
- **엔진 Gap 해소**: 🔴 심각 2건 + 🟡 중간 4건 = 6건 개선
- **gap-detector Match Rate**: UI↔엔진 구조체 매칭 **≥95%**
- **테스트**: UI 통합 테스트 추가 (시나리오 17종 각 1건 이상)
- **사용자 판정 시간**: 평균 입력 시간 ≤ 5분 (현재 측정 불가)

### 2.2 정성 목표

- 사용자가 **전문 지식 없이도** 자연어 가이드·툴팁으로 필드 의미 이해 가능
- 불필요한 필드는 조건부 렌더링으로 숨겨 **인지 부하 최소화**
- 판정 결과에 **"왜 이렇게 판정됐는지"** 명확한 설명 타임라인 제공
- 이중 경로(단순 체크박스 vs 상세 입력) **통합**

---

## 3. 범위 (Scope)

### 3.1 In Scope

1. **UI 확장**: `CompanionAssetCard.tsx` 내부에 지목별 아코디언 구조 추가 (Step4 글로벌 방식 → 자산 카드 내부로 이전)
2. **신규 섹션 추가**:
   - 거주 이력 타임라인 입력기
   - 무조건 사업용 체크리스트 (§168-14③ 7종)
   - 지목별 세부 섹션 (농지·임야·목장·대지·별장·나대지)
   - 부득이한 사유 입력기 (`gracePeriods`)
   - 도시편입일 입력
   - 수도권 여부 토글
3. **엔진 보강**:
   - `gracePeriods` 실제 판정 로직 연결
   - 공동상속 지분 판정
   - 목장용지 표준면적 테이블 현행화
   - 별장 REDIRECT 자동 재분류
4. **상태 관리**:
   - `calc-wizard-store.ts`의 `AssetForm` 확장 (~30 필드) + root nbl* 7개 제거 + `migrateAsset` root→asset 이전
   - `nblLandArea` 별도 추가 없음 — `AssetForm.acquisitionArea` 재사용 (area-taxonomy.md 원칙 B)
   - 단순 체크박스 → 상세 입력 전환 플로우 (자산 카드 단위)
5. **결과 표시 강화**:
   - `NonBusinessLandResultCard`에 안분 계산 상세 표시
   - 무조건 면제 적용 시 조문·이유 prominent 표시
6. **테스트**:
   - UI 통합 테스트 (Playwright or vitest+jsdom)
   - 엔진 신규 분기 단위 테스트

### 3.2 Out of Scope

- 비사업용 토지 **세액 계산 자체** 변경 (이미 +10%p 중과·장특공 배제 구현됨)
- 양도소득세 전체 마법사 구조 변경 (Step 1~4 골격 유지)
- PDF 출력 디자인 변경
- 재산세·종부세 등 타 세목 비사업용 판정 연동 (별도 Plan 필요)
- 모바일 네이티브 특화 UI (반응형 수준에서만)

---

## 4. 구현 계획 (Milestones)

### M1 — 설계 및 타입 계약 (1일)

**산출물**:
- `docs/02-design/features/nbl-ui-completion.design.md`
- `TransferFormData` 확장 타입 초안
- UI↔엔진 매핑 테이블

**작업**:
- [ ] `NonBusinessLandInput` 전체 필드를 `AssetForm` flat 필드로 매핑 설계 (root TransferFormData 아님)
- [ ] 지목별 조건부 렌더링 규칙 정의
- [ ] 단순 체크박스 → 상세 전환 UX 플로우 정의
- [ ] 모든 필드에 대한 legal basis (조문 번호) 매핑

**완료 기준**: Design 문서에 17개 시나리오 각각의 입력 경로 명시

---

### M2 — UI 1순위: 무조건 면제 체크리스트 + 거주 이력 (2일)

**근거**: 최소 노력으로 최대 커버리지 확보. 무조건 면제가 걸리면 엔진이 즉시 분기 종료하므로 입력 비용 대비 효과 최대.

**산출물**:
- `components/calc/transfer/nbl/UnconditionalExemptionSection.tsx` (신규)
- `components/calc/transfer/nbl/ResidenceHistorySection.tsx` (신규)
- `AssetForm` 확장 + root nbl* 제거 + migrateAsset

**작업**:
- [ ] `UnconditionalExemptionSection` 구현 — 7개 체크박스 + 각 케이스별 날짜·플래그 입력
  - 2006.12.31. 이전 상속 (상속일 DateInput)
  - 2007 이전 20년 이상 보유 (자동 계산 + 토글)
  - 직계존속 8년 자경 상속·증여 (존속 거주 증빙 체크)
  - 공익사업 수용 (수용일)
  - 공장 인접지 (legacy, info 라벨)
  - 종중 소유 + 2005.12.31. 이전 취득
  - 도시편입 농지·임야 종중·상속 특례
- [ ] `ResidenceHistorySection` 구현 — 배열 입력 (시작일·종료일·시군구명·주민등록 여부)
- [ ] `NonBusinessLandInput.unconditionalExemption` 및 `ownerProfile.residenceHistories` 매핑
- [ ] 통합 테스트: 7개 면제 각각 1건씩

**완료 기준**: 2006 이전 상속·종중·수용 3개 시나리오 UI만으로 판정 통과

---

### M3 — UI 2순위: 지목별 세부 섹션 (3일)

**산출물**:
- `components/calc/transfer/nbl/FarmlandDetailSection.tsx`
- `components/calc/transfer/nbl/ForestDetailSection.tsx`
- `components/calc/transfer/nbl/PastureDetailSection.tsx`
- `components/calc/transfer/nbl/HousingLandDetailSection.tsx`
- `components/calc/transfer/nbl/VillaLandDetailSection.tsx`
- `components/calc/transfer/nbl/OtherLandDetailSection.tsx`

**작업**:
- [ ] **농지 세부**:
  - `farmlandDeeming.isWeekendFarm` (주말농장)
  - `farmlandDeeming.isConversionApproved` (전용허가 + 허가일)
  - `farmlandDeeming.isMarginalFarm` (한계농지)
  - `farmlandDeeming.isReclaimedLand` (간척지)
  - `farmlandDeeming.isPublicProjectUse` (공익사업용)
  - `farmlandDeeming.isSickElderlyRental` (질병·고령 임대)
- [ ] **임야 세부**:
  - `forestDetail.hasForestPlan` (산림경영계획 인가)
  - `forestDetail.isPublicInterest` (공익림)
  - `forestDetail.isProtectedForest` (보안림·문화재)
  - `forestDetail.isForestSuccessor` (임업후계자)
  - `forestDetail.inheritedForestWithin3Years` (상속 3년 내)
- [ ] **목장 세부**:
  - `pasture.isLivestockOperator` (축산업 영위)
  - `pasture.livestockType` (한우·젖소·돼지·가금 등)
  - `pasture.livestockCount` (두수)
  - `pasture.livestockPeriods` (사육기간 배열)
  - `pasture.inheritanceDate` (상속일, 해당 시)
- [ ] **주택 부속토지**:
  - `isMetropolitanArea` (수도권 여부)
  - `housingFootprint` (주택 연면적)
  - → 3배/5배/10배 자동 계산 안내 배지
- [ ] **별장 세부**:
  - `villa.villaUsePeriods` (별장 사용기간 배열)
  - `villa.isEupMyeon` (읍·면 소재)
  - `villa.isRuralHousing` (농어촌주택 요건)
  - `villa.isAfter20150101` (2015.1.1. 이후 취득)
- [ ] **나대지 세부**:
  - `otherLand.propertyTaxType` (종합합산/별도합산/분리과세)
  - `otherLand.buildingValueKrw` (건물가액 — 2% 추정 분기용)
  - `otherLand.landValueKrw` (토지가액)
  - `otherLand.isRelatedToResidence` (주택 부속 관련 여부)

**완료 기준**: 각 지목별 2개 이상 시나리오 UI 판정 통과

---

### M4 — UI 3순위: 지원 필드 + 플로우 통합 (2일)

**산출물**:
- `components/calc/transfer/nbl/GracePeriodSection.tsx` (부득이한 사유)
- `components/calc/transfer/nbl/NblSectionContainer.tsx` (통합 컨테이너)
- 단순 체크박스 → 상세 입력 전환 UX

**작업**:
- [ ] `GracePeriodSection` 구현 — `gracePeriods` 배열 입력 (사유·시작·종료)
  - 상속으로 인한 부득이
  - 법령상 사용제한
  - 매매계약 중
  - 공사 중
  - 질병·취학·근무상 형편
- [ ] `urbanIncorporationDate` 입력 필드 (도시편입일)
- [ ] `landLocation.sigunguCode` + `adjacentSigunguCodes` 입력기 (시군구 선택 컴포넌트 필요)
- [ ] `asset.isNonBusinessLand` 체크박스 → 상세 입력 활성화 버튼으로 전환 (자산 카드 내부)
  - 체크 시 `NblSectionContainer` 펼침
  - 상세 입력 있으면 엔진 판정 결과가 `asset.isNonBusinessLand` 덮어씀 + 충돌 경고 표시
- [ ] `NblSectionContainer`: 지목 선택에 따라 해당 지목 섹션만 렌더
- [ ] `CompanionAssetCard.tsx` 수정 — `asset.assetKind === "land"` 조건부 블록에 NblSectionContainer 마운트
- [ ] `Step4.tsx` 수정 — 글로벌 NblDetailSection 제거, `step4-sections/NblDetailSection.tsx` 삭제

**완료 기준**: 단순→상세 전환 플로우 E2E 동작, 충돌 경고 표시

---

### M5 — 엔진 Gap 해소 (2일)

**산출물**:
- `lib/tax-engine/non-business-land/grace-period.ts` (신규 또는 engine.ts 내부 확장)
- `lib/tax-engine/non-business-land/co-ownership.ts` (신규)
- `lib/tax-engine/non-business-land/data/livestock-standards.ts` (신규 상수)

**작업**:
- [ ] **🔴 gracePeriods 실제 판정 반영**:
  - 현재 타입만 있고 기간 기준 계산에 반영 안 됨
  - `period-criteria.ts`에서 유예기간을 `effectiveBusinessDays`에 가산
  - 엔진 unit test 추가 (각 사유별 1건)
- [ ] **🔴 공동상속 지분 판정**:
  - `ownerProfile.ownershipRatio` 필드 추가
  - 무조건 면제·재촌자경 요건이 지분별 판단될 수 있도록 분기
  - 가이드: 상속지분 공유일 경우 각 공유자별 별도 판단 (판례 다수)
- [ ] **🟡 목장용지 표준면적 테이블**:
  - 현행 축산법 시행규칙 별표2 기준 상수화
  - `pasture.ts`에서 하드코딩 제거 → 상수 import
- [ ] **🟡 별장 REDIRECT 자동 재분류**:
  - 현재 `action: "REDIRECT_TO_CATEGORY"` 플래그만 반환
  - `engine.ts`의 orchestrator에서 자동 재호출 (`categoryGroup = "housing"`)
- [ ] **🟡 수도권 여부 기본값 처리**:
  - `isMetropolitanArea` 미지정 시 **경고 발생** + 보수적으로 수도권으로 간주
- [ ] **🟡 수입금액 테스트 (§168-11②)**:
  - `other-land.ts`에서 실제 비교 로직 확인 및 테스트 보강

**완료 기준**: 8개 엔진 Gap 중 6개 해소, 관련 테스트 모두 통과

---

### M6 — 결과 표시 강화 (1일)

**산출물**:
- `components/calc/results/NonBusinessLandResultCard.tsx` 개편
- 새로운 설명 섹션 컴포넌트

**작업**:
- [ ] 무조건 면제 적용 시 **"사업용 판정 — 법령 §X조 ①호에 의함"** 배지 강조
- [ ] 지목별 판정 근거 별도 블록 (농지: 거주·자경 일수 / 임야: 주민등록 상태 / 등)
- [ ] 면적 안분 시각화 (사업용 vs 비사업용 면적 bar chart)
- [ ] 유예기간 적용 내역 타임라인
- [ ] 판정 결과 요약 → "이 토지는 ○○ 사유로 비사업용 토지에 해당합니다 (§X조). 따라서 기본세율 +10%p 중과, 장기보유특별공제 배제됩니다." 자연어 설명

**완료 기준**: 결과 카드에서 판정 사유·조문·숫자 모두 확인 가능

---

### M7 — 통합 테스트 + QA (1일)

**산출물**:
- `__tests__/tax-engine/non-business-land/integration.test.ts`
- `__tests__/ui/nbl-wizard.test.tsx` (신규)

**작업**:
- [ ] 17개 시나리오 각각에 대한 UI→엔진→결과 E2E 테스트
- [ ] 이중 경로 충돌 테스트 (체크박스 true + 상세 입력 business)
- [ ] 필드 누락 시 경고 동작 테스트
- [ ] `tax-qa-lead` 에이전트로 전체 양도세 regression 확인
- [ ] `gap-detector`로 설계↔구현 Match Rate 측정

**완료 기준**: 전체 테스트 통과, Match Rate ≥95%, regression 0건

---

## 5. 구현 상세 (Key Decisions)

### 5.1 UI 아키텍처 결정

**결정 A**: 지목별 조건부 렌더링을 **탭 UI** 대신 **조건부 아코디언**으로 구현.
- 이유: 지목은 1개만 선택되므로 탭은 과한 UI. 아코디언은 접혀있어 인지 부하 낮음.
- 예외: 무조건 면제 섹션은 지목 선택 전에 먼저 노출 (적용되면 이후 필드 불필요).

**결정 B**: `AssetForm` 확장 방식은 **flat 필드**로 유지 (기존 `nbl*` prefix 컨벤션). ⚠️ v1.1 수정: TransferFormData root → AssetForm으로 위치 변경.
- 이유: zustand persist 직렬화 호환성 + 자산별 통합 원칙(Stream A) 일관성.
- trade-off: AssetForm 인터페이스 비대화. 대신 주석 섹션으로 그룹화. `lib/tax-engine/non-business-land/form-mapper.ts`의 `mapAssetToNblInput(asset, dates)` 에서 flat→nested 변환 집중.
- `nblLandArea` 별도 필드 없음 — `asset.acquisitionArea` 재사용.

**결정 C**: 시군구 입력은 **자동완성 Select**로 구현.
- 데이터: `lib/korean-law/sigungu-codes.ts` (신규 상수) — 행안부 시군구 표준코드 (약 250개)
- fallback: 사용자가 모를 경우 기존 거리(km) 필드도 유지

### 5.2 엔진 변경 시 하위호환

- `NonBusinessLandInput`의 기존 필드 시그니처 변경 없음 (추가만)
- `gracePeriods`·`ownerProfile.ownershipRatio`는 optional 유지
- 기존 14개 테스트 모두 통과해야 함 (regression)

### 5.3 법령 상수

- 신규 상수는 모두 `lib/tax-engine/legal-codes/transfer.ts`의 `NBL.*` 네임스페이스에 추가
- 예: `NBL.GRACE_INHERITANCE`, `NBL.GRACE_LEGAL_RESTRICTION`, `NBL.CO_OWNERSHIP`
- UI의 툴팁·결과 조문 표시에 동일 상수 사용

### 5.4 데이터 마이그레이션 ⚠️ v1.1 추가

- zustand persist version 3 → 4 bump
- `migrateAsset` 함수에서 root `nbl*` 7개 필드를 primary AssetForm(`assets[0]`)으로 이전 후 root에서 삭제
- 기존 세션 사용자의 데이터 손실 없음 (migrate 함수가 이전 보장)
- `NblSectionContainer`에서 "상세 입력으로 전환" CTA 제공 → 기존 플래그 유지한 채 상세 입력 가능

### 5.5 API 경로 정정 ⚠️ v1.1 추가

- `app/api/calc/transfer/route.ts` (기존 오기: `app/api/calc/transfer-tax/route.ts`)
- `lib/calc/transfer-tax-api.ts:168` — `form.nbl*` 읽기를 `primary.nbl*`(AssetForm) 읽기로 수정
- `lib/calc/multi-transfer-tax-api.ts` — 자산별 loop에서 `asset.nbl*` 읽기

---

## 6. 리스크 및 완화 (Risk Register)

| 리스크 | 영향도 | 가능성 | 완화책 |
|---|---|---|---|
| 입력 필드 폭증으로 UX 복잡화 | 🔴 High | 중 | 조건부 렌더링, 무조건 면제 우선 노출, 툴팁 |
| 시군구 코드 데이터 유지보수 | 🟡 Med | 중 | 행안부 CSV 연 1회 업데이트 스크립트 |
| 기존 단순 체크박스 사용자 혼란 | 🟡 Med | 중 | 충돌 경고 + "전환" CTA |
| 엔진 변경으로 기존 테스트 깨짐 | 🔴 High | 낮 | gracePeriods·ownershipRatio optional 유지 |
| 공동상속 지분 판례 해석 불확실 | 🟡 Med | 중 | 판례 조사 → inheritance-gift-tax-nontax-teacher 에이전트 활용 |
| 파일 800줄 한도 위반 | 🟢 Low | 중 | 지목별 섹션 파일 분리, 예상 평균 150~250줄 |

---

## 7. 의존성

### 7.1 코드 의존성

- `lib/stores/calc-wizard-store.ts` — `TransferFormData` 확장
- `lib/tax-engine/non-business-land/types.ts` — `NonBusinessLandInput` 확장
- `lib/tax-engine/non-business-land/engine.ts` — gracePeriods·재분류 처리
- `app/calc/transfer-tax/steps/Step4.tsx` — 신규 섹션 마운트
- `components/calc/results/NonBusinessLandResultCard.tsx` — 결과 표시 개편

### 7.2 외부 의존성

- 행안부 시군구 표준코드 (정적 데이터, 빌드타임 embed)
- 축산법 시행규칙 별표2 (표준면적 테이블)
- 소득세법·시행령 조문 상수 (이미 legal-codes에 존재)

### 7.3 에이전트 활용

| Milestone | 추천 에이전트 |
|---|---|
| M1 설계 | `non-business-land-tax-senior` + `Plan` |
| M2~M4 UI | `transfer-tax-senior` + `frontend-architect` |
| M5 엔진 | `non-business-land-tax-senior` + `transfer-tax-senior` |
| M6 결과 UI | `frontend-architect` |
| M7 QA | `transfer-tax-qa` + `tax-qa-lead` + `gap-detector` |

---

## 8. 성공 지표 (Success Metrics)

| 지표 | 측정 방법 | 목표 |
|---|---|---|
| UI 시나리오 커버리지 | 17개 시나리오 각 통합 테스트 | ≥15건 통과 |
| 엔진 Gap 해소 | 8개 Gap 중 해소 건수 | ≥6건 |
| gap-detector Match Rate | `.bkit/state/pdca-status.json` | ≥95% |
| 기존 테스트 통과 | `npm test` | 1,407 + 신규 테스트 100% 통과 |
| 입력 시간 | 내부 UX 테스트 5건 평균 | ≤5분 |
| 파일 크기 | 800줄 한도 | 100% 준수 |
| 결과 카드 설명 충실도 | 판정 사유·조문·숫자 3요소 포함 | 100% 시나리오에서 충족 |

---

## 9. 타임라인 (예상)

```
Week 1 (Day 1-5)
├─ Day 1     : M1 설계
├─ Day 2-3   : M2 무조건 면제 + 거주 이력
├─ Day 4-5   : M3 지목별 세부 섹션 (전반부: 농지·임야)

Week 2 (Day 6-10)
├─ Day 6     : M3 지목별 세부 섹션 (후반부: 목장·대지·별장·나대지)
├─ Day 7-8   : M4 지원 필드 + 플로우 통합
├─ Day 9     : M5 엔진 Gap 해소 (전반부)
├─ Day 10    : M5 엔진 Gap 해소 (후반부) + M6 결과 표시

Week 3 (Day 11-12)
├─ Day 11    : M7 통합 테스트
└─ Day 12    : QA + gap-detector + Report
```

**총 예상 공수**: 12 man-day
**우선순위**: M2 (무조건 면제) → M5 (엔진 Gap) → M3 (지목별 세부) → M4 (플로우) → M6 (결과) → M7 (QA)

---

## 10. Next Actions

1. **이 Plan 승인 후** `/pdca design nbl-ui-completion` 실행 → Design 문서 생성
2. Design 문서에서 다음 항목 확정:
   - `TransferFormData` 확장 필드 전체 정의
   - 각 UI 섹션의 props·emit 시그니처
   - 엔진 변경 전후 `NonBusinessLandInput` diff
   - 시군구 코드 테이블 데이터 소스
3. Design 확정 후 `/pdca do nbl-ui-completion` → 구현 시작
4. M2 완료마다 `gap-detector` 실행하여 Match Rate 모니터링
5. M7 완료 후 `/pdca report nbl-ui-completion`

---

## 부록 A: `NonBusinessLandInput` 필드 전체 매핑 초안

> ⚠️ v1.1: 모든 `AssetForm` 컬럼은 이제 `TransferFormData` root가 아닌 `AssetForm` 소속임.

| 엔진 필드 | 현재 UI | 신규 `AssetForm` 필드 | Milestone |
|---|---|---|---|
| `landType` | ✅ root `nblLandType` | `asset.nblLandType` (migrate) | Phase 1 |
| `landArea` | ✅ root `nblLandArea` | **`asset.acquisitionArea` 재사용** (nblLandArea 폐지) | Phase 1 |
| `zoneType` | ✅ root `nblZoneType` | `asset.nblZoneType` (migrate) | Phase 1 |
| `acquisitionDate`, `transferDate` | ✅ AssetForm.acquisitionDate / form.transferDate | 기존 유지 | - |
| `isFarmingSelf` | ✅ root `nblFarmingSelf` | `asset.nblFarmingSelf` (migrate) | Phase 1 |
| `farmerResidenceDistance` | ✅ root `nblFarmerResidenceDistance` | `asset.nblFarmerResidenceDistance` (migrate) | Phase 1 |
| `businessUsePeriods` | ✅ root `nblBusinessUsePeriods` | `asset.nblBusinessUsePeriods` (migrate) | Phase 1 |
| `landLocation.sigunguCode` | ❌ | `asset.nblLandSigunguCode` | Phase 2 |
| `ownerLocation.sigunguCode` | ❌ | 거주 이력과 연동 | M2 |
| `adjacentSigunguCodes` | ❌ | (자동 계산 또는 수동) | M4 |
| `ownerProfile.residenceHistories[]` | ❌ | `ResidenceHistorySection` | M2 |
| `unconditionalExemption.*` (7종) | ❌ | `UnconditionalExemptionSection` | M2 |
| `urbanIncorporationDate` | ❌ | `UrbanIncorporationField` | M4 |
| `farmlandDeeming.*` (6종) | ❌ | `FarmlandDetailSection` | M3 |
| `forestDetail.*` (5종) | ❌ | `ForestDetailSection` | M3 |
| `pasture.*` (5종) | ❌ | `PastureDetailSection` | M3 |
| `villa.*` (4종) | ❌ | `VillaLandDetailSection` | M3 |
| `otherLand.*` (4종) | ❌ | `OtherLandDetailSection` | M3 |
| `isMetropolitanArea` | ❌ | 주택토지 섹션 토글 | M3 |
| `housingFootprint` | ❌ | `HousingLandDetailSection` | M3 |
| `gracePeriods[]` | ❌ | `GracePeriodSection` | M4 |
| `ownerProfile.ownershipRatio` (신규) | ❌ | Step 1에서 수집 연동 | M5 |
| `revenueTest.*` | ❌ | `OtherLandDetailSection`의 선택 블록 | M3 |

---

## 부록 B: 시나리오별 입력 경로 (샘플 3건)

### 시나리오 1: 2006.12.31. 이전 상속 농지 (무조건 면제)

```
1. 자산 카드(토지) → NblSectionContainer 열기  [v1.1: Step4 → 자산 카드]
2. 지목 = "농지" 선택
3. 무조건 면제 섹션에서 "2006.12.31. 이전 상속" 체크
4. 상속일 DateInput = 2004-05-15
5. 양도일 Step 3에서 이미 입력됨 (예: 2009-06-01)
   → 엔진: inheritance ≤ 2006-12-31 && transfer ≤ 2009-12-31
   → 즉시 "사업용" 판정, 이후 필드 입력 불필요
```

### 시나리오 2: 도시편입 농지 3년 유예

```
1. 자산 카드(토지) → NblSectionContainer 열기  [v1.1: Step4 → 자산 카드]
2. 지목 = "농지", 면적: asset.acquisitionArea = 800, 용도지역 = "일반주거지역" 입력
3. 도시편입일 = 2020-03-01 입력 (신규 필드)
4. 농지 세부 섹션에서 자경 여부 체크
5. 거주 이력에서 편입 전 1년 연속 거주 확인 (시군구 일치 + 주민등록)
6. 양도일이 편입일 + 3년 이내면 유예 적용
   → 엔진: checkIncorporationGrace() 성공
   → "사업용 (도시편입 3년 유예 §168-14③)" 판정
```

### 시나리오 3: 상속받은 임야 3년 내 양도

```
1. 자산 카드(토지) → NblSectionContainer 열기  [v1.1: Step4 → 자산 카드]
2. 지목 = "임야" 선택
3. 임야 세부 섹션에서 "상속 3년 내 양도" 체크
4. 상속일 입력 (예: 2024-02-10)
5. 양도일 (Step 3) = 2026-12-20
   → 3년 이내 확인
   → 엔진: forestDetail.inheritedForestWithin3Years = true
   → "사업용 (상속 임야 3년 내 양도 특례)" 판정
```

---

## 부록 C: 참고 조문

- 소득세법 §104조의3 (비사업용 토지 중과)
- 소득세법 시행령 §168조의6 (기간 기준)
- 소득세법 시행령 §168조의7 (부득이한 사유)
- 소득세법 시행령 §168조의8 (농지 판정)
- 소득세법 시행령 §168조의9 (임야 판정)
- 소득세법 시행령 §168조의10 (목장용지 판정)
- 소득세법 시행령 §168조의11 (기타 토지 판정)
- 소득세법 시행령 §168조의12 (주택 부속토지 배율)
- 소득세법 시행령 §168조의13 (별장 판정)
- 소득세법 시행령 §168조의14 (부득이한 사유·무조건 면제)
- 소득세법 시행규칙 §83조의5 (농지 자경 의제)

---

## 승인

- [ ] 계획 검토 완료
- [ ] 우선순위 확정
- [ ] `/pdca design nbl-ui-completion` 실행 준비
