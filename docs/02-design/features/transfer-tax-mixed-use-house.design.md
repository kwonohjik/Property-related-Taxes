# Design: 양도소득세 — 검용주택(1세대 1주택 + 상가) 분리계산 (Main)

**Plan**: `.claude/plans/image-5-structured-star.md`
**작성일**: 2026-04-29
**상태**: Design 단계 — 함수 시그니처·데이터 흐름·UI props·테스트 매트릭스 확정
**참고 사례**: 이미지5 사례14 (1992 토지 + 1997 상가건물 신축, 23년 보유 후 2022.02.16 양도, 환산취득가액 사용)

**관련 문서 (분할)**:
- `transfer-tax-mixed-use-house.engine.design.md` — 데이터 모델·알고리즘·API·테스트·법령
- `transfer-tax-mixed-use-house.ui.design.md` — UI 컴포넌트·결과 뷰

---

## 0. 요약

소득세법 시행령 §160 ① 단서(2022.1.1 이후 양도분 적용)에 따라 **고가검용주택**의 주택부분과 상가부분을 강제 분리하여 양도소득세를 계산하는 신규 모듈. 12억 초과 비과세는 주택부분에만, 상가부분은 일반건물 양도세 전액 과세, 주택부수토지 배율초과 면적은 비사업용토지 +10%p 중과로 분리한다.

기존 양도세 엔진(`transfer-tax.ts`)·12억 초과 안분(`calcOneHouseProration`)·토지/건물 분리(`calcSplitGain`)·환산취득가액(`calculateEstimatedAcquisitionPrice`)·PHD 3-시점·부수토지 배율판정(`handleExcessAttachedLand`)·비사업용토지 중과(`non-business-land/engine.ts`) 자산을 모두 재사용하고, **검용주택 분리계산 오케스트레이터**(`transfer-tax-mixed-use.ts`)만 신규로 작성한다.

---

## 1. 파일 구조

```
lib/tax-engine/
├── transfer-tax-mixed-use.ts                  (신규) — 검용주택 분리계산 오케스트레이터, ≤ 800줄
├── transfer-tax-mixed-use-helpers.ts          (신규, 임계도달 시) — 양도가액 안분·면적안분·검증 helper
├── transfer-tax-mixed-use-result.ts           (신규, 임계도달 시) — Result/Step 빌더
├── types/transfer-mixed-use.types.ts          (신규) — MixedUseAssetInput·MixedUseGainBreakdown
├── types/transfer.types.ts                    (수정) — TransferTaxInput.mixedUse?, AssetType += "mixed-use-house"
├── transfer-tax.ts                            (수정) — STEP 0.7 분기(자산이 검용주택일 때 calcMixedUseTransferTax 호출)
└── legal-codes/transfer.ts                    (수정) — TRANSFER.MIXED_USE_* 상수 4개 추가

app/api/calc/transfer-tax/
└── route.ts                                   (수정) — mixedUseSchema 추가, Zod discriminatedUnion 분기

lib/api/
└── transfer-tax-schema.ts                     (수정 또는 route 내) — Zod 스키마 동기화

lib/stores/
├── calc-wizard-asset.ts                       (수정) — AssetForm 신규 필드 13개
└── calc-wizard-migration.ts                   (수정) — 검용주택 자산 마이그레이션 (legacy → mixedUse 객체)

components/calc/transfer/
├── AssetForm.tsx                              (수정) — 자산 타입 셀렉트에 "검용주택" 옵션 추가
├── MixedUseSection.tsx                        (신규) — 검용주택 전용 입력 섹션 (자산 토글 ON 시 노출)
├── mixed-use/
│   ├── AreaInputs.tsx                         (신규)
│   ├── DateInputs.tsx                         (신규)
│   ├── StandardPriceInputs.tsx                (신규)
│   └── ResidencyInput.tsx                     (신규)
└── result/
    ├── MixedUseResultCard.tsx                 (신규)
    ├── ApportionmentCard.tsx                  (신규)
    ├── HousingPartCard.tsx                    (신규)
    ├── CommercialPartCard.tsx                 (신규)
    └── NonBusinessLandPartCard.tsx            (신규)

__tests__/tax-engine/
├── transfer-tax/mixed-use-house.test.ts       (신규) — anchor + 9개 시나리오
└── _helpers/mixed-use-fixture.ts              (신규) — 사례14 픽스처 + 변형 케이스

docs/02-design/features/
├── transfer-tax-mixed-use-house.design.md         (본 문서, Main)
├── transfer-tax-mixed-use-house.engine.design.md  (Engine 상세)
└── transfer-tax-mixed-use-house.ui.design.md      (UI 상세)
```

> **수정 우선 / 신규 최소** 원칙. 800줄 정책 임계 도달 시 helpers·result로 분할.

---

## 2. 핵심 결정사항 (Plan Q&A → Design 확정)

| 항목 | 결정 | 비고 |
|---|---|---|
| 적용 양도시점 | **2022.1.1 이후만** | 시행령 §160 ① 단서 발효일 기준 |
| 취득가액 환산 흐름 | 양도가액 → 주택/상가 안분 → 각 부분 §97 환산 → 토지/건물 재안분 | 사용자 명시 흐름 |
| 양도시·취득시 기준시가 정의 | 주택=개별주택공시가격(단일) / 상가=(공시지가×상가부수토지)+상가건물기준시가 | 양도·취득 동일 패턴 |
| 부수토지 배율초과 분리 | 주택부분 양도차익 산정 후 면적비율 추가 분리 | 주택→비사업용 양도차익 이전 |
| 장기보유공제 | 주택=표2(거주 2년+이면 최대 80%), 상가=표1, 비사업용=표1 | 시행령 §159의4 거주공제 요건 |
| 정착면적 안분 | 건축물대장 주택연면적/(주택+상가) 비율로 자동 안분 | 1층 면적 입력 → 자동 |
| 취득시 기준시가 | 토지/건물 분리 시점 입력 + PHD 3-시점 자동 환산 옵션 | 1992+1997 분리 케이스 대응 |
| 결과 화면 | 학습·검증용 4-카드(안분/주택/상가/비사업용) + 합산 | 양도코리아 23번 메뉴와 비교 가능 |

---

## 3. 마이그레이션·호환성

- 기존 자산이 `assetType === "house"` 또는 `"commercial"` 였던 사용자는 영향 없음
- 신규 `"mixed-use-house"` 타입은 `AssetForm.assetType` 셀렉트에 추가만 됨
- store 마이그레이션: `migrateLegacyForm`에서 검용주택 13필드 빈 값 초기화
- API: 기존 단일 자산 페이로드는 그대로 동작, `mixed-use-house` 자산 발견 시에만 신규 분기
- 기존 `__tests__/tax-engine/transfer-tax/*.test.ts` 모두 통과 유지

---

## 4. 작업 의존 그래프

```
[1] types/transfer-mixed-use.types.ts 신규
[2] legal-codes/transfer.ts 상수 추가
[3] transfer-tax-mixed-use.ts 신규 (STEP 1~9)
    └── (재사용) calcOneHouseProration, calcSplitGain, calculateEstimatedAcquisitionPrice,
                handleExcessAttachedLand, getHousingMultiplier, applyNonBusinessSurcharge
[4] route.ts Zod 스키마 + Orchestrator 분기
[5] _helpers/mixed-use-fixture.ts (사례14 픽스처)
[6] mixed-use-house.test.ts (anchor + 9 시나리오) — TDD
[7] calc-wizard-asset.ts AssetForm 필드 추가 + migration
[8] AssetForm.tsx 자산 타입 옵션 추가
[9] MixedUseSection.tsx + 4 sub-input 컴포넌트
[10] MixedUseResultCard.tsx + 4 sub-card 컴포넌트
[11] E2E (npm run dev + 사례14 입력)
[12] 800줄 정책 검사 + 분할
```

순서: [1·2] → [3] → [4·5·6] (병렬) → [7·8] → [9] → [10] → [11] → [12]

---

## 5. 미해결 / 향후 확장

| 항목 | 처리 |
|---|---|
| 22.1.1 이전 양도분 | 본 설계 범위 외. 향후 `transfer-tax-mixed-use-pre2022.ts` 별도 모듈 추가 시 면적 비교 분기(주택>상가→전체주택) 구현 |
| 검용주택 PHD 적합성 | 토글로 옵션 제공. UI에 "이미지5 사례는 단순 §97 환산 사용" 안내. 향후 PHD 분리 알고리즘 별도 검토 |
| 다중 검용주택 (상가 2동 등) | 본 설계는 단일 자산 단위 분리계산. 다물건 합산은 STEP 9 합산 로직으로 자동 처리되나, 검용주택 자산을 2개 이상 입력하는 UX는 향후 검증 |
| 800줄 정책 | `transfer-tax-mixed-use.ts` 가 800줄 초과 우려 시 `transfer-tax-mixed-use-helpers.ts` / `-result.ts`로 분할 |
| 상가부분에서 1세대1주택 외 비과세 특례 | 현재 미구현. 사례14 범위 외 |

---

## 6. 검증 체크리스트 (Definition of Done)

- [ ] `npx vitest run __tests__/tax-engine/transfer-tax/mixed-use-house.test.ts` — 10/10 통과 (anchor + 9 시나리오)
- [ ] `npm test` — 1,493+ 통과, 회귀 0건
- [ ] `npm run lint` — 타입체크·ESLint 0 에러
- [ ] 800줄 정책 — 신규 파일 모두 ≤ 800줄
- [ ] E2E: 사례14 입력 → 양도코리아 23번 메뉴 출력값과 원단위 일치
- [ ] 결과 뷰 4개 카드 + 합산 카드 모두 한국어 라벨 + 법조문 모달 정상 동작
- [ ] WizardSidebar에 주택연면적 비율·상가부수토지 면적 등 파생값 즉시 표시
- [ ] PHD 토글 ON/OFF 양쪽 경로 모두 정상 결과 산출
- [ ] 22.1.1 이전 양도일 입력 시 명확한 경고 노출

세부 구현은 분할 문서를 참조:
- 데이터 모델·알고리즘·API·테스트 → `transfer-tax-mixed-use-house.engine.design.md`
- UI 컴포넌트·결과 뷰 → `transfer-tax-mixed-use-house.ui.design.md`
