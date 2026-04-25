# NBL 작업 격리 전략 — 다른 세션과 병행 진행 계획

## Context

다른 세션에서 양도소득세 계산기의 **다중 양도 / 일괄양도 / 집계** 관련 대규모 업그레이드가 진행 중이다 (`git status` 기준 27개 변경 파일). 이 작업은 비사업용 토지(NBL)와 무관하지만, 두 작업 모두 양도세 영역의 핵심 파일을 건드리므로 단순 병렬 진행 시 머지 충돌이 발생한다.

본 문서는 **NBL UI 완전화 작업**(`docs/01-plan/features/nbl-ui-completion.plan.md`)을 다른 세션의 진행에 영향을 주지 않으면서 **지금 즉시 시작**하기 위한 격리 전략을 정의한다. 목표는:
- Stream A(다중 양도 업그레이드)의 파일 변경에 NBL 작업이 영향받지 않을 것
- NBL 작업이 Stream A의 머지 시점에 충돌을 최소화하고 빠르게 rebase 가능할 것
- NBL 작업의 첫 5개 마일스톤(M1~M5)은 충돌 위험 없는 파일에서만 진행할 것

---

## 충돌 표면 분석 결과

### Stream A가 현재 수정 중인 파일 (27개)

핵심:
- `app/calc/transfer-tax/TransferTaxCalculator.tsx`
- `app/calc/transfer-tax/multi/MultiTransferTaxCalculator.tsx` (다중 양도 모드)
- `lib/api/transfer-tax-schema.ts`
- `lib/calc/multi-transfer-tax-api.ts`
- `lib/stores/multi-transfer-tax-store.ts`
- `lib/tax-engine/transfer-tax-aggregate.ts` + 신규 `transfer-tax-aggregate-helpers.ts` (대규모 helper 추출 리팩터)
- `lib/tax-engine/types/transfer-aggregate.types.ts`
- `components/calc/results/MultiTransferTaxResultView.tsx`, `TransferTaxResultView.tsx`
- `components/calc/transfer/AggregateSettingsPanel.tsx`, `CompanionAcqPurchaseBlock.tsx`, `CompanionAssetsSection.tsx`
- `components/calc/inputs/CurrencyInput.tsx`, `StandardPriceInput.tsx`
- `__tests__/tax-engine/five-year-cumulative-aggregate.test.ts`

### NBL 작업이 건드릴 파일 분류

**🟢 Safe (Stream A 미수정 — 충돌 0)**:
- `lib/tax-engine/non-business-land/*` (engine.ts, types.ts, period-criteria.ts, pasture.ts, villa-land.ts 수정)
- `lib/tax-engine/non-business-land/co-ownership.ts`, `grace-period.ts`, `form-mapper.ts`, `data/livestock-standards.ts` (신규)
- `components/calc/transfer/nbl/*` (전부 신규 디렉터리)
- `app/calc/transfer-tax/steps/Step4.tsx` (Stream A는 Step1·Step3만)
- `app/calc/transfer-tax/steps/step4-sections/NblDetailSection.tsx` (제거 대상)
- `components/calc/results/NonBusinessLandResultCard.tsx`
- `lib/korean-law/sigungu-codes.ts` (신규)
- `lib/stores/calc-wizard-store.ts` (Stream A 미수정 — TransferFormData 확장 안전)
- `__tests__/tax-engine/non-business-land/*` (신규)

**🔴 Hard Conflict (양 스트림 모두 편집 필요)**:
1. `app/calc/transfer-tax/TransferTaxCalculator.tsx` — Stream A는 multi-mode 통합, NBL은 form-mapper 호출 1줄 + import 1줄
2. `lib/tax-engine/transfer-tax.ts` — Stream A 수정 중. NBL은 `judgeNonBusinessLand` 호출부(라인 207~225)에서 입력 형태 확장 가능성

**🟡 Soft Conflict (같은 파일이지만 영역 분리됨)**:
- `lib/api/transfer-tax-schema.ts` — Stream A 수정 중. NBL은 `nonBusinessLandDetailsSchema`(라인 67) 영역만 확장
- `lib/calc/transfer-tax-api.ts` — Stream A 미수정으로 보임. NBL은 라인 168, 294의 `nblDetails`→`nonBusinessLandDetails` plumbing 확장

### 핵심 발견 — 이미 plumbing 완성

NBL의 UI→API→엔진 경로는 **이미 wiring 완료** 상태:
- `lib/calc/transfer-tax-api.ts:168` `const nblDetails = ...`
- `lib/calc/transfer-tax-api.ts:294` `nonBusinessLandDetails: nblDetails` 전달
- `lib/api/transfer-tax-schema.ts:67, 450` Zod 스키마 정의·라우팅
- `lib/tax-engine/transfer-tax.ts:49, 207-213` 엔진 호출

**즉, NBL 작업은 신규 경로를 만들지 않고 기존 경로의 입력 필드만 확장**하면 된다. 충돌 표면은 매우 작다.

### 기존 Plan 문서의 정정 필요

`docs/01-plan/features/nbl-ui-completion.plan.md`에서 API 경로를 `app/api/calc/transfer-tax/route.ts`로 표기했으나, **실제 경로는 `app/api/calc/transfer/route.ts`**. 첫 작업 단계에서 plan·design 문서 모두 정정.

---

## 격리 전략 — Git Worktree 방식 (권장)

### 왜 Worktree인가

- Stream A가 27개 dirty 파일을 가진 상태이므로 같은 working tree에서 branch switch는 stash 위험
- worktree는 별도 디렉터리에 별도 working tree를 두므로 Stream A의 진행에 **완전 격리**
- 각 worktree는 같은 `.git/`을 공유하므로 디스크·git history는 분리되지 않음 (효율적)

### 권장 setup

```bash
# 1. 깨끗한 master 기준으로 worktree 생성 (Stream A는 master에서 그대로 진행)
git worktree add -b feature/nbl-ui-completion ../Property-related-Taxes-nbl master

# 2. 새 worktree로 이동
cd ../Property-related-Taxes-nbl

# 3. 의존성 설치 (node_modules는 worktree마다 별도)
npm install

# 4. 환경변수 복사
cp ../Property-related-Taxes/.env.local .env.local 2>/dev/null || true

# 5. 별도 dev 서버 포트로 실행 (Stream A가 3000을 쓰는 경우)
PORT=3001 npm run dev
```

### 작업 디렉터리 구조

```
~/workspace/
├── Property-related-Taxes/            ← Stream A (다중 양도 업그레이드, master + dirty)
└── Property-related-Taxes-nbl/        ← Stream B (NBL UI 완전화, feature/nbl-ui-completion)
```

각 디렉터리에서 독립적으로 `git status` / `git commit` 가능. 같은 `.git`을 공유하므로 한쪽에서 commit하면 다른 쪽 `git log`에서 보임.

---

## 작업 순서 — Phase 분리

NBL 작업의 **M1~M5는 100% Safe 파일에서만** 수행하여 Stream A와의 충돌을 0으로 유지. M6~M7의 통합 단계만 Stream A 머지 이후로 미룬다.

### Phase 0: Worktree Setup (5분)

위 setup 명령 실행 + `.env.local` 복사 + dev 서버 기동 확인.

### Phase 1 — M1~M5: Safe 파일만 (총 9 man-day)

순서대로 진행. 모두 🟢 Safe 파일.

**M1 설계 정정 (0.5일)**
- `docs/01-plan/features/nbl-ui-completion.plan.md` API 경로 정정
- `docs/02-design/features/nbl-ui-completion.design.md` 동일 정정
- 기존 `transfer-tax-api.ts:168,294` plumbing 재사용 명시

**M2 무조건 면제 + 거주 이력 (2일)**
- `lib/stores/calc-wizard-store.ts` — TransferFormData 확장 (M2~M5 한 번에 모든 필드 추가하는 것 권장 — 머지 충돌 표면 단축)
- `components/calc/transfer/nbl/UnconditionalExemptionSection.tsx`
- `components/calc/transfer/nbl/ResidenceHistorySection.tsx`
- `components/calc/transfer/nbl/shared/SigunguSelect.tsx`
- `lib/korean-law/sigungu-codes.ts`

**M3 지목별 세부 6개 섹션 (3일)**
- `components/calc/transfer/nbl/{Farmland,Forest,Pasture,HousingLand,VillaLand,OtherLand}DetailSection.tsx`

**M4 지원 필드 + 플로우 통합 (2일)**
- `components/calc/transfer/nbl/NblSectionContainer.tsx`
- `components/calc/transfer/nbl/GracePeriodSection.tsx`
- `app/calc/transfer-tax/steps/Step4.tsx` 수정 (Stream A는 Step1·Step3만 수정 → 충돌 없음)
- `app/calc/transfer-tax/steps/step4-sections/NblDetailSection.tsx` 제거

**M5 엔진 Gap 해소 (2일)**
- `lib/tax-engine/non-business-land/grace-period.ts` 신규
- `lib/tax-engine/non-business-land/co-ownership.ts` 신규
- `lib/tax-engine/non-business-land/data/livestock-standards.ts` 신규
- `lib/tax-engine/non-business-land/form-mapper.ts` 신규
- `lib/tax-engine/non-business-land/{engine,types,period-criteria,pasture,villa-land}.ts` 수정
- 엔진 단위 테스트 작성

이 시점에 Phase 1 commit. NBL 엔진 Gap 해소·UI 컴포넌트·신규 매퍼가 Stream A와 독립적으로 동작.

### Phase 2 — Sync Point (Stream A 머지 대기 또는 rebase)

Stream A가 master에 머지되면:

```bash
cd ../Property-related-Taxes-nbl
git fetch origin
git rebase origin/master
```

Conflict 예상:
- `lib/stores/calc-wizard-store.ts` — Stream A가 form 필드를 추가했다면 충돌 가능 (현재 git status에서는 미수정 상태이므로 가능성 낮음)

이 단계에서 충돌이 적게 발생하도록 Phase 1을 **단일 커밋이 아닌 의미 단위 커밋**으로 분할 권장 (M2/M3/M4/M5 각각).

### Phase 3 — M6~M7: 통합 + Hard Conflict 영역 (2일)

Stream A의 머지가 완료된 master 기준으로 진행. 이 시점에는 충돌 발생 시 즉시 해결 가능.

**M6 결과 표시 강화 (1일)**
- `components/calc/results/NonBusinessLandResultCard.tsx` 개편
- `components/calc/results/TransferTaxResultView.tsx`에서 NBL 카드 props 확장 (Stream A가 이 파일을 수정했으므로 conflict 가능 — Phase 3에서 처리)

**M6 통합 seam (TransferTaxCalculator.tsx 1줄 추가)**
- `app/calc/transfer-tax/TransferTaxCalculator.tsx` — `mapFormToNblInput()` 호출 1줄 + import 1줄 추가
- 충돌 영역 최소화: API submit 함수 내부에 `const nblInput = mapFormToNblInput(form, context); payload.nblDetails = nblInput;` 형태로 단 한 곳만 편집

**M6 스키마 확장 (transfer-tax-schema.ts)**
- `lib/api/transfer-tax-schema.ts:67`의 `nonBusinessLandDetailsSchema` 확장 (신규 필드 추가)
- 영역 분리되어 있으므로 충돌 가능성 낮음

**M7 통합 테스트 + QA (1일)**
- `__tests__/tax-engine/non-business-land/integration.test.ts` (17 시나리오)
- `__tests__/ui/nbl-wizard.test.tsx`
- `npm test` 전체 통과 확인 + `tax-qa-lead` 에이전트로 양도세 regression 확인
- `gap-detector` 1회 실행 → Match Rate 측정

---

## Critical Files (수정 또는 참조 필수)

### 격리 전략 setup
- `~/workspace/Property-related-Taxes-nbl/` (신규 worktree, NBL 작업 전용)
- `feature/nbl-ui-completion` 브랜치

### Stream A 미수정 (Phase 1에서 자유롭게 작업)
- `lib/stores/calc-wizard-store.ts` (TransferFormData 확장)
- `lib/tax-engine/non-business-land/*` (전체)
- `lib/tax-engine/legal-codes/transfer.ts` (NBL.* 상수 추가)
- `app/calc/transfer-tax/steps/Step4.tsx` (수정)
- `lib/calc/transfer-tax-api.ts` (Stream A 미수정 — `nblDetails` 변환 plumbing)

### Phase 3 (Stream A 머지 후 처리)
- `app/calc/transfer-tax/TransferTaxCalculator.tsx` ← form-mapper 호출 1줄 + import
- `lib/api/transfer-tax-schema.ts` ← `nonBusinessLandDetailsSchema` 확장
- `lib/tax-engine/transfer-tax.ts` ← (필요 시) 엔진 호출부 확장
- `components/calc/results/TransferTaxResultView.tsx` ← NBL 카드 props 확장

### 재사용할 기존 함수·경로
- `lib/calc/transfer-tax-api.ts:168` `const nblDetails = ...` — 이미 `nblDetails` 변환 패턴 존재, NBL form-mapper 결과를 여기로 흘려보내면 됨
- `lib/calc/transfer-tax-api.ts:294` `nonBusinessLandDetails: nblDetails` — 이미 wiring 완료
- `lib/tax-engine/transfer-tax.ts:49,207-225` — `judgeNonBusinessLand()` 호출 패턴 그대로 재사용
- `lib/api/transfer-tax-schema.ts:67,450` — `nonBusinessLandDetailsSchema` 확장

---

## Verification

### Phase 0 verification
```bash
cd ../Property-related-Taxes-nbl
git status              # clean
git branch --show-current   # feature/nbl-ui-completion
PORT=3001 npm run dev   # http://localhost:3001 정상 기동
```

### Phase 1 verification (각 마일스톤별)
```bash
# 격리된 worktree에서
cd ../Property-related-Taxes-nbl
npm test -- non-business-land   # 엔진 신규 테스트 통과
npm test                        # 전체 1,407+신규 통과
npm run lint                    # 0 error
npm run build                   # 빌드 성공

# Stream A 영향 확인 (다른 worktree)
cd ../Property-related-Taxes
git status              # NBL 작업이 이쪽 status에 영향 없음 확인
```

### Phase 2 verification (rebase 후)
```bash
cd ../Property-related-Taxes-nbl
git rebase origin/master
# conflict 발생 시 영역별 처리
npm test                # rebase 후 전체 테스트 통과
```

### Phase 3 verification (통합)
```bash
# 1. 양도세 단순 계산 (NBL 미사용) — Stream A 기능 정상 동작
curl -X POST http://localhost:3001/api/calc/transfer ...

# 2. NBL 단순 체크박스 경로 — 기존 동작 유지
# 3. NBL 상세 판정 17개 시나리오 — 신규 동작
# 4. tax-qa-lead 에이전트로 양도세 전체 regression
```

### 머지 시 Conflict 해결 가이드
- `TransferTaxCalculator.tsx`: Stream A의 multi-mode 변경은 그대로 두고, NBL form-mapper 호출 1줄만 submit 함수 내부 적절한 위치에 추가
- `transfer-tax-schema.ts`: Stream A 변경 영역과 `nonBusinessLandDetailsSchema` 영역 분리되어 있으면 양쪽 변경 모두 보존
- `transfer-tax.ts`: NBL은 라인 207~225 영역만 건드리므로 Stream A의 다른 영역과 분리 가능

---

## Risks & Mitigations

| 리스크 | 완화책 |
|---|---|
| Stream A가 `calc-wizard-store.ts`를 나중에 수정 | M2 시작 전 `git diff master..origin/master -- lib/stores/calc-wizard-store.ts`로 사전 확인 |
| Stream A가 머지되지 않은 상태로 NBL이 먼저 완성 | M5까지 진행 후 Phase 2 대기, Stream A 머지 후 Phase 3 |
| worktree 디스크 사용량 증가 (`node_modules`) | 1회성 비용, 작업 종료 시 `git worktree remove ../Property-related-Taxes-nbl` |
| 두 worktree에서 같은 파일을 동시에 편집 | Phase 1은 Safe 파일만이라 발생 불가, Phase 3에 진입 시점에 한 worktree로 통합 |
| 머지 시 `nonBusinessLandDetailsSchema` 영역 충돌 | 영역 분리 명확, conflict marker 만나면 양쪽 변경 모두 keep |

---

## Next Action

Phase 0 setup 명령 4줄 실행. 이후 Phase 1 M1부터 NBL 작업 시작.
