# NBL UI 완전화 계획 — Stream A 업그레이드 반영판

## Context

직전 세션에서 NBL(비사업용 토지) UI·엔진 완전화를 위한 격리 작업 계획을 세웠으나, 그 사이 다른 세션에서 진행 중이던 양도소득세 계산기 업그레이드가 **master에 머지 완료**되었다 (`git status` clean, 최근 5개 커밋 모두 transfer 관련).

업그레이드는 NBL과 무관한 영역(다중 양도, 자산별 입력 통합, 면적 시나리오, Step2 제거)이지만 결과적으로 **양도세 계산기의 입력 모델이 자산별(per-asset) 통합 구조로 전환**되었다. NBL은 이 통합에서 누락된 마지막 영역으로 남았다.

본 계획서는:
1. 업그레이드된 아키텍처 분석 결과
2. 기존 NBL plan(`docs/01-plan/features/nbl-ui-completion.plan.md`)에 반영해야 할 변동사항
3. 이를 반영한 새 작업 전략

을 정리하여 NBL plan·design 문서 정정 + 즉시 구현 진입 경로를 확정한다.

---

## 발견된 업그레이드 (master HEAD = 5dce876)

### 1. Step2 제거, 5단계 마법사로 단순화

이전: Step1~Step6 (6단계) → 현재: Step1, Step3, Step4, Step5, Step6 (Step2 제거, 5개 파일)
- Step1 자산 목록 (구 Step1+Step2 통합, 자산 카드 내부 입력)
- Step3 양도 정보
- Step4 취득 정보 + 1세대1주택 + NBL 정밀 판정 (현재 NBL이 마운트된 곳)
- Step5 감면·공제
- Step6 가산세

`TransferTaxCalculator.tsx:332` step indicator가 새 순서.

### 2. AssetForm 자산별 통합 패턴

`lib/stores/calc-wizard-store.ts:93~204` `AssetForm`이 자산 1건의 모든 입력을 보유:
- 자산 종류 / 취득원인 / 취득·양도일
- 취득가액 / 양도가액 / 기준시가
- **면적 시나리오** (`acquisitionArea`, `transferArea`, `areaScenario`, 환지 3필드) — area-taxonomy.md 원칙 적용
- 감면 (자산별 `reductions[]`)
- 상속 평가 (보충적평가·신고가액)
- 다필지 `parcels[]`

`CompanionAssetsSection.tsx`는 `formData.assets`를 map으로 렌더 → `CompanionAssetCard.tsx`(704줄)가 자산 1건의 모든 입력 UI 보유.

**Mental model**: 1 AssetForm = 1 양도 자산. 자산-specific anything goes into AssetForm.

### 3. 면적 3필드 표준 (area-taxonomy.md)

`AssetForm`에 다음 필드 도입됨:
- `acquisitionArea` (취득 당시 면적)
- `transferArea` (양도 당시 면적)
- `areaScenario`: "same" | "partial" | "reduction" | "increase"
- 환지 시 `replottingConfirmDate`, `entitlementArea`, `allocatedArea`, `priorLandArea`

원칙 B(계산 편의용 중간값 제거)에 따라 `landAreaM2`·`pre1990AreaSqm` 등은 폐지됨.

### 4. NBL은 자산별 통합에서 누락 (마지막 holdout)

`TransferFormData`(calc-wizard-store.ts:378, 384~389)에 NBL 필드 7종 여전히 ROOT 레벨:
```ts
isNonBusinessLand, nblLandType, nblLandArea, nblZoneType,
nblFarmingSelf, nblFarmerResidenceDistance, nblBusinessUsePeriods
```

`transfer-tax-api.ts:168`은 `form.nbl*`(root) + `primary.acquisitionDate`(asset)를 결합하여 nblDetails 생성. **다중 토지 자산을 한 양도 신고에 담는 케이스에서 primary 자산 외에는 NBL 정밀 판정 불가**.

### 5. Integration seam은 그대로

- `lib/calc/transfer-tax-api.ts:168, 294` — `nblDetails` → `nonBusinessLandDetails`
- `lib/calc/multi-transfer-tax-api.ts:21, 123` — 같은 패턴
- `lib/api/transfer-tax-schema.ts:67, 450` — `nonBusinessLandDetailsSchema`
- `lib/tax-engine/transfer-tax.ts:49, 211~213` — `judgeNonBusinessLand` 호출

API/엔진 경계는 안전하게 유지 — UI·매퍼만 수정하면 된다.

---

## NBL Plan 변경 영향 (5건)

### 영향 1: 격리 전략 자체 폐기

기존 plan은 `git worktree`로 Stream A와 격리하는 전략을 핵심으로 했으나, **Stream A 머지 완료**로 격리는 더 이상 필요하지 않다. 단순 feature branch(`feature/nbl-ui-completion`)만 사용.

### 영향 2: NBL 필드 위치 변경 — TransferFormData → AssetForm

기존 plan: TransferFormData에 ~30개 nbl* 필드 추가
**새 plan**: AssetForm에 NBL 필드 이전 + 신규 필드 추가
- 자산별 통합 패턴(Stream A가 정착시킨 원칙)에 일관성 부여
- 다중 토지 자산 각각이 NBL 판정 가능 (multi-asset 본질적 개선)
- 기존 root nbl* 7개는 `migrateAsset`에서 primary AssetForm으로 이전 후 root에서 삭제

### 영향 3: 면적 필드 중복 제거 — `nblLandArea` 폐지

기존 plan: `nblLandArea`를 별도 필드로 유지
**새 plan**: area-taxonomy.md 원칙 B 준수 — `AssetForm.acquisitionArea` 또는 `transferArea` 재사용
- form-mapper에서 시나리오에 따라 분기
- `nblLandArea` 신규 추가 안 함 (기존 root 필드는 migrate에서 acquisitionArea로 이전 후 삭제)

### 영향 4: NblDetailSection 마운트 위치 변경

기존 plan: Step4 내부 `NblSectionContainer` (글로벌)
**새 plan**: `CompanionAssetCard.tsx` 내부 (자산 카드별, `assetKind === "land"`일 때만)
- Step4의 NBL 섹션은 제거 (이미 자산 카드에서 모든 자산 입력 처리됨)
- 자산 카드의 신규 sub-section으로 NBL 정밀 판정 블록 추가

### 영향 5: API 어댑터 수정 영역

기존 plan: `transfer-tax-api.ts:168`은 그대로 두고 form-mapper 추가
**새 plan**: `transfer-tax-api.ts:168~184`를 자산별 read로 수정
- `form.nbl*` → `asset.nbl*` 읽기로 변경
- multi-mode loop에서 자산별로 nblDetails 빌드 가능
- `multi-transfer-tax-api.ts:21~37` 동일 패턴 적용

---

## 새 작업 전략

### Phase 0: 브랜치 & Plan 정정 (0.5일)

```bash
# master에서 직접 작업하지 않고 feature branch
git checkout -b feature/nbl-ui-completion master
```

워크트리 불필요 (Stream A 머지 완료). 단일 working tree에서 작업.

**Plan/Design 문서 정정**:
1. `docs/01-plan/features/nbl-ui-completion.plan.md`
   - API 경로 정정: `app/api/calc/transfer-tax/route.ts` → `app/api/calc/transfer/route.ts`
   - "TransferFormData에 nbl* 필드 추가" → "AssetForm에 nbl* 필드 이전·추가"
   - "Step4 NblSectionContainer 마운트" → "CompanionAssetCard 내부 마운트"
   - "nblLandArea 별도 필드" → "AssetForm.acquisitionArea 재사용"
   - 부록 A 매핑 테이블 — TransferFormData 행 → AssetForm 행으로 변경
2. `docs/02-design/features/nbl-ui-completion.design.md` (메인) — 파일 구조 표 정정
3. `docs/02-design/features/nbl-ui-completion.engine.design.md` — TransferFormData 정의를 AssetForm 정의로 교체
4. `docs/02-design/features/nbl-ui-completion.ui.design.md` — 컨테이너 플로우 다이어그램에서 Step4.tsx 위치를 CompanionAssetCard로 교체

### Phase 1: AssetForm 확장 + 마이그레이션 (M2 일부, 1일)

- `lib/stores/calc-wizard-store.ts`
  - `AssetForm`에 NBL 필드 추가 (~30개) — area 필드 다음 위치(line 141 직후)
  - root `TransferFormData`의 nbl* 7개 필드 제거
  - `migrateAsset`에 root → asset 이전 로직 추가:
    ```ts
    function migrateAsset(asset, rootForm) {
      // root.nblLandType이 있으면 primary asset으로 이전
      if (rootForm.nblLandType && asset.isPrimaryForHouseholdFlags) {
        asset.nblLandType = rootForm.nblLandType;
        asset.nblZoneType = rootForm.nblZoneType;
        asset.nblFarmingSelf = rootForm.nblFarmingSelf;
        // ... 7개 모두
      }
      return asset;
    }
    ```
  - persist version bump (3 → 4)
- 기존 사용자 데이터 호환성 확보

### Phase 2: 무조건 면제 + 거주 이력 (M2 나머지, 2일)

- `components/calc/transfer/nbl/UnconditionalExemptionSection.tsx` — 자산 props 받음
- `components/calc/transfer/nbl/ResidenceHistorySection.tsx` — 자산 props 받음
- `components/calc/transfer/nbl/shared/SigunguSelect.tsx`
- `lib/korean-law/sigungu-codes.ts` — 행안부 시군구 코드 상수 (~250개)

모든 섹션 컴포넌트 시그니처:
```ts
interface NblSectionProps {
  asset: AssetForm;
  onAssetChange: (patch: Partial<AssetForm>) => void;
}
```

### Phase 3: 지목별 6개 섹션 (M3, 3일)

- `components/calc/transfer/nbl/{Farmland,Forest,Pasture,HousingLand,VillaLand,OtherLand}DetailSection.tsx`

### Phase 4: NblSectionContainer + 자산 카드 통합 (M4, 2일)

- `components/calc/transfer/nbl/NblSectionContainer.tsx` — 무조건 면제 + 지목 스위처 + 거주 이력 + 부득이한 사유 통합
- `components/calc/transfer/nbl/GracePeriodSection.tsx`
- `components/calc/transfer/CompanionAssetCard.tsx` 수정 — `assetKind === "land"` 조건부 렌더에 NblSectionContainer 마운트
- `app/calc/transfer-tax/steps/Step4.tsx` 수정 — 글로벌 NblDetailSection import 제거, 단순 `isNonBusinessLand` 체크박스만 유지(또는 제거)
- `app/calc/transfer-tax/steps/step4-sections/NblDetailSection.tsx` 제거

### Phase 5: 엔진 Gap 해소 (M5, 2일) — UI 변경과 무관, 병렬 가능

- `lib/tax-engine/non-business-land/grace-period.ts` 신규
- `lib/tax-engine/non-business-land/co-ownership.ts` 신규
- `lib/tax-engine/non-business-land/data/livestock-standards.ts` 신규
- `lib/tax-engine/non-business-land/form-mapper.ts` 신규 — `mapAssetToNblInput(asset, dates)`
- `lib/tax-engine/non-business-land/{engine,types,period-criteria,pasture,villa-land}.ts` 수정
- 엔진 단위 테스트 신규 25건

### Phase 6: API 어댑터 수정 (M6 일부, 0.5일)

- `lib/calc/transfer-tax-api.ts:168~184` 수정 — `form.nbl*` → `primary.nbl*` 읽기
- `lib/calc/multi-transfer-tax-api.ts:21~37` 동일 — 자산별 loop에서 `asset.nbl*` 읽기
- form-mapper 통합 — primary asset에서 nblInput 생성하여 API payload에 넣음

### Phase 7: 결과 카드 강화 (M6 나머지, 1일)

- `components/calc/results/NonBusinessLandResultCard.tsx` 개편
- 무조건 면제 강조 / 면적 안분 시각화 / 유예기간 타임라인

### Phase 8: 통합 테스트 + QA (M7, 1일)

- `__tests__/tax-engine/non-business-land/integration.test.ts` (17 시나리오)
- `__tests__/ui/nbl-wizard.test.tsx`
- 기존 1,407 테스트 + 신규 ~46건 모두 통과 확인
- `tax-qa-lead` 에이전트로 양도세 regression 검증
- `gap-detector` Match Rate 측정

**총 예상 공수**: Phase 0~8 합계 = 약 12 man-day (기존 plan과 동일)

---

## Critical Files

### Plan/Design 정정 (Phase 0)
- `docs/01-plan/features/nbl-ui-completion.plan.md`
- `docs/02-design/features/nbl-ui-completion.design.md`
- `docs/02-design/features/nbl-ui-completion.ui.design.md`
- `docs/02-design/features/nbl-ui-completion.engine.design.md`

### Phase 1 (AssetForm 확장)
- `lib/stores/calc-wizard-store.ts:93~204` (AssetForm 정의 영역)
- `lib/stores/calc-wizard-store.ts:274~322` (migrateAsset, ParcelFormItem 등)
- `lib/stores/calc-wizard-store.ts:378, 384~389` (root nbl* 필드 제거)
- `lib/stores/calc-wizard-store.ts:440, 446~451` (defaults 정리)

### Phase 2~4 (UI)
- `components/calc/transfer/nbl/*` (전부 신규 디렉터리, 약 10 파일)
- `components/calc/transfer/CompanionAssetCard.tsx:704줄` 내부에 NblSectionContainer 마운트 1곳
- `app/calc/transfer-tax/steps/Step4.tsx` (NblDetailSection 제거)

### Phase 5 (엔진)
- `lib/tax-engine/non-business-land/*`

### Phase 6 (API 어댑터)
- `lib/calc/transfer-tax-api.ts:160~205` (callTransferTaxAPI, primary 자산 읽기)
- `lib/calc/multi-transfer-tax-api.ts:15~50` (자산별 loop)

### 재사용할 기존 함수·경로
- `lib/calc/transfer-tax-api.ts:168` `nblDetails` 변환 패턴 — 위치만 root → asset로 옮김
- `lib/api/transfer-tax-schema.ts:67` `nonBusinessLandDetailsSchema` — 신규 필드 optional 추가
- `lib/tax-engine/transfer-tax.ts:49, 211~213` `judgeNonBusinessLand` 호출 — 변경 없음
- `lib/stores/calc-wizard-store.ts` `migrateAsset` 패턴 — root → asset 이전 로직 동일 형태로 추가
- `components/calc/transfer/CompanionAssetCard.tsx` 자산 카드 내부 sub-section 패턴 — 면적 시나리오 섹션과 동일 패턴으로 NBL 섹션 추가

---

## Verification

### Phase 0 verification (Plan/Design 정정 후)
- 4개 문서 모두 AssetForm 기준으로 정정되었는지 grep:
  ```bash
  grep -n "TransferFormData.*nbl\|nblLandArea\|app/api/calc/transfer-tax/route" \
    docs/01-plan/features/nbl-ui-completion.plan.md \
    docs/02-design/features/nbl-ui-completion*.design.md
  ```
  결과 0개여야 함.

### Phase 1 verification (AssetForm 확장)
```bash
npm test -- calc-wizard-store
# migrate 함수 테스트 통과
npm run build
# 타입 체크 통과
```

### Phase 2~4 verification (UI 컴포넌트)
- 자산 카드에서 토지 선택 시 NblSectionContainer 렌더 확인
- 다른 자산(주택)에서 미렌더 확인
- 무조건 면제 체크 시 하위 섹션 음영 처리

### Phase 5 verification (엔진)
```bash
npm test -- non-business-land
# 신규 25건 + 기존 14건 = 39건 통과
```

### Phase 6 verification (API)
- 단일 토지 자산: `form.nbl*` 마이그레이션 후에도 기존 API 응답 동일 (regression 0)
- 다중 토지 자산: 각 자산별 nblDetails 별도 생성 확인

### Phase 7~8 verification (통합)
```bash
# 1. 양도세 단순 계산 — Stream A 업그레이드 기능 정상
# 2. NBL 단순 체크박스 경로 — 기존 동작 유지
# 3. NBL 상세 판정 17개 시나리오 — Plan §1.2 시나리오 매트릭스
# 4. 다중 토지 양도 — 자산별 NBL 판정 합계
npm test
# 1,407 + ~46 = ~1,453건 통과
npm run build
# 빌드 성공
# /pdca check nbl-ui-completion
# gap-detector Match Rate ≥95%
```

---

## Risks & Mitigations

| 리스크 | 완화책 |
|---|---|
| `AssetForm`에 30 필드 추가로 인터페이스 비대화 | 주석 섹션 구분(// ── NBL 공통 ── 등), area 시나리오와 같은 그룹 패턴 사용 |
| migrateAsset에서 root → asset 이전 시 데이터 손실 | persist version bump + migrate 함수 단위 테스트 (5건+) 작성 |
| Step4의 단순 isNonBusinessLand 체크박스 처리 결정 | 자산 카드 내부 NblSectionContainer가 모든 케이스 흡수 → root 체크박스 제거 권장 |
| `transfer-tax-api.ts` 수정 시 single/multi 양쪽 깨질 위험 | 한 번에 두 어댑터 모두 수정, 단위 테스트로 회귀 차단 |
| 자산 카드 컴포넌트(704줄)가 800줄 초과할 위험 | NblSectionContainer를 별도 파일로 두고 import만, CompanionAssetCard 내부는 ~10줄 추가에 그침 |
| 엔진 변경으로 기존 14건 깨짐 | additive only 원칙 — `ownershipRatio`·`gracePeriods` 처리 모두 optional 분기 |

---

## Next Action

1. 본 plan 사용자 승인
2. ExitPlanMode 후 Phase 0 시작 — `feature/nbl-ui-completion` 브랜치 생성 + Plan/Design 4개 문서 정정
3. 정정 후 Phase 1 (`/pdca do nbl-ui-completion`) 진입
