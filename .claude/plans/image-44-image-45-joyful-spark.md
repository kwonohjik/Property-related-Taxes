# 주택 부수토지 명시 입력 전환 — 사례 28 후속 보완

## Context

사례 28(나대지+신축주택 일괄양도) 구현 후 사용자 검증에서 본질적 결함이 식별됨:

**현재 구현의 문제**:
- 부수토지 자동 분기가 "주택+토지 일괄양도 + 주택 보유 1년 미만"이라는 잘못된 휴리스틱에 의존
- 그러나 **부수토지 판정은 단기보유 여부와 법령상 무관** (영 §154⑦은 면적 한도만 규정, 보유기간 조건 없음)
- 부수토지=주택의 사용·효용에 객관적으로 기여하는 토지 (사실 판정) + 면적 한도 충족
- 단기보유는 세율(70%) 결정에만 영향, 부수토지 판정과 분리되어야 함
- 현재 "auto/일괄70%/자산별/누진" 폼-수준 4옵션 라디오는 사용자 의도 표현이 모호하고 자산별 차이를 반영 못함

**전환 목표**:
1. 부수토지 여부를 토지 자산 카드에서 사용자가 명시적으로 선언 (Yes/No 라디오)
2. 자동 분기 조건에서 "주택 보유 1년 미만" 제거 — 부수토지 판정과 세율 결정 분리
3. 부수토지=Yes 선언 시 **포괄적 일체과세** — 보유기간별 세율 + 장기보유특별공제 + 누진세율 모두 주택 기준으로 적용
4. 폼-수준 `appurtenantLandRateMode` 라디오 **제거** — 자산-수준 명시 입력으로 일원화
5. 토지+주택 일괄양도 시 landNature 미입력은 Step1 검증 차단

**사용자 결정 사항 (인터뷰 확정)**:
- enum 2단계: `"appurtenant_to_housing"` | `"non_business_land"`
- 폼-수준 라디오 제거
- 부수토지=Yes일 때 세율·장기보유특별공제·누진세율 포괄적 일체 적용
- 미입력 시 검증 차단 (자동 default 금지 — 자동 안분 fallback 금지 정책 일관)

---

## 변경 대상 파일

### 1. 엔진 (Pure Layer)
- `lib/tax-engine/types/transfer.types.ts` — `landNature` 필드 추가, `manualHoldingPeriodOverride` deprecated 표기
- `lib/tax-engine/appurtenant-land-rate.ts` — 자동 분기 조건 단순화 (단기보유 조건 제거, landNature 우선)
- `lib/tax-engine/transfer-tax-rate-calc.ts` — 부수토지=Yes 시 보유기간별 주택 세율 동적 적용 (현재 70% 고정 → 동적)
- `lib/tax-engine/transfer-tax-helpers.ts` — 장기보유특별공제(`calcLongTermDeduction`)에서 부수토지=Yes 자산은 주택 기준 표 1/표 2 자동 적용

### 2. 타입 / Zod 스키마
- `lib/api/transfer-tax-schema.ts` — 메인 input의 `landNature` 추가, `appurtenantLandRateMode` 제거
- `lib/api/transfer-tax-schema-sub.ts` — companion에 `landNature` 추가

### 3. API 변환·Route
- `lib/calc/transfer-tax-api.ts` — primary 자산 변환에 `landNature` spread, `appurtenantLandRateMode` 전송 제거
- `lib/calc/transfer-tax-api-helpers.ts` — `buildAssetPayload`에 `landNature` spread
- `app/api/calc/transfer/route.ts` — `resolveUserModeOverride` 호출 제거, primary land patch에서 `userModeOverride` 분기 제거

### 4. 폼 상태·정규화·검증
- `lib/stores/calc-wizard-asset.ts` — `AssetForm`에 `landNature: "appurtenant_to_housing" | "non_business_land" | undefined` 추가
- `lib/stores/calc-wizard-asset-factory.ts` — initial / normalize fallback (undefined 보존)
- `lib/stores/calc-wizard-store.ts` — `TransferFormData`에서 `appurtenantLandRateMode` 제거
- `lib/calc/transfer-tax-validate.ts` — 토지+주택 일괄양도 시 토지 자산의 `landNature` 필수 검증 (Step1)

### 5. UI
- `components/calc/transfer/CompanionAssetCard.tsx` — `assetKind === "land"` 블록에 RadioCardGroup "주택 부수토지 여부" 추가 (면적 입력 직후, ~L284)
- `app/calc/transfer-tax/steps/Step1.tsx` — 폼-수준 `APPURTENANT_LAND_RATE_OPTIONS` 라디오 제거
- 토지 카드 라디오:
  - "주택 부수토지" — 함께 양도되는 주택의 사용·효용에 기여
  - "독립 나대지" — 주택과 무관한 별도 토지 (별도 필지·분리 사용)
- 라벨 helper-text: "토지가 주택의 마당·정원·진입로 등 사용·효용에 기여하면 '부수토지'. 별도 필지로 분리·독립 사용되면 '독립 나대지'."

### 6. 결과 표
- `components/calc/results/transfer/FilingFormTable.tsx` — 토지 자산 라벨에 부수토지/나대지 구분 표시 (예: "토지(부수토지)" / "토지(독립 나대지)")
- 한도 초과 split 시 라벨은 그대로 ("토지(부수)" / "토지(한도초과)")

### 7. 테스트 (anchor 마이그레이션)
- `__tests__/tax-engine/transfer-tax/new-construction-bundled-case-28.test.ts` — 모든 anchor에 `landNature: "appurtenant_to_housing"` 명시 입력 추가
- `__tests__/tax-engine/transfer-tax/new-construction-bundled-case-28-g3.test.ts` — 동상
- `__tests__/tax-engine/transfer-tax/new-construction-bundled-case-28-g4.test.ts` — 동상
- 신규 anchor:
  - 부수토지=Yes + 주택 2년 이상 보유 → 토지에 누진세율 + 장기보유특별공제 (주택 기준)
  - 부수토지=No (독립 나대지) + 주택 단기 → 토지 본래 세율 (현재 자동분기와 분리)
  - landNature 미입력 시 validate 차단 (UI 단위)

---

## 핵심 로직 — 자동 분기 조건 단순화

### Before (잘못된 결합)
```ts
if (
  isPrimaryHousing &&
  isCompanionLand &&
  isBundled &&
  isPrimaryShortTerm &&        // ← 잘못된 조건 (법령상 무관)
  hasFootprintArea
) {
  // 70% 강제
}
```

### After (올바른 분리)
```ts
// 1) 부수토지 판정 — 사용자 명시 입력 단독
if (companion.landNature !== "appurtenant_to_housing") {
  return { applied: false };  // 독립 나대지 또는 미선언
}

// 2) 면적 한도 검증 (영 §154⑦)
const limitArea = primary.buildingFootprintArea × multiplier(zone);
const excessArea = max(0, companion.area - limitArea);

// 3) 세율 결정 — 부수토지=Yes면 주택 보유기간 기준 세율 동적 적용 (포괄적 일체)
//    주택 1년 미만 → 70%
//    주택 1~2년   → 60%
//    주택 2년 이상 → 누진세율 + 장기보유특별공제(주택 기준)
const rate = housingRateForHoldingPeriod(primary.holdingMonths);
return { applied: true, unifiedRate: rate, excessArea, ... };
```

### 장기보유특별공제 일체 적용
`lib/tax-engine/transfer-tax-helpers.ts`의 `calcLongTermDeduction()`에서:
- 자산이 토지이지만 `landNature === "appurtenant_to_housing"`이고 primary가 housing이면:
  - 주택의 보유기간·거주기간 표(표 1: 6%/8%, 표 2: 거주포함 4%+4%) 적용
  - 1세대1주택 비과세 12억 초과분도 주택 기준으로 처리

---

## 14개 동기화 지점 점검 (DoD)

| # | 지점 | 변경 |
|---|---|---|
| ① 폼 상태 타입 | `AssetForm.landNature` 추가 |
| ② initial value | `landNature: undefined` |
| ③ normalize fallback | undefined 보존 |
| ④ API 변환 | `transfer-tax-api.ts` / `-api-helpers.ts` `landNature` spread |
| ⑤ UI 입력 위젯 | CompanionAssetCard 토지 블록 RadioCardGroup |
| ⑥ 사이드바 합계 | 영향 없음 |
| ⑦ 결과 카드 산식 | FilingFormTable 토지 라벨에 "(부수토지)/(독립 나대지)" 표기 |
| ⑧ validation | 토지+주택 일괄양도 시 토지 자산 `landNature` 필수 차단 |
| ⑨ Zod enum 메인 | `transfer-tax-schema.ts` `landNature` enum, `appurtenantLandRateMode` 제거 |
| ⑩ Zod enum 서브 | `transfer-tax-schema-sub.ts` companion `landNature` enum |
| ⑪ acquisitionDate fallback | 영향 없음 |
| ⑫ Zod 입력 객체 | 신규 enum 명시 정의 |
| ⑬ callTransferTaxAPI body spread | `landNature` 포함, `appurtenantLandRateMode` 제거 |
| ⑭ Route handler 매핑 | `landNature`가 engineInput·companion 모두로 forwarding |

---

## anchor 인벤토리 (사례 28 마이그레이션 + 신규)

### 사례 28 본 케이스 (마이그레이션)
- T-01~T-12: 모든 입력에 `landNature: "appurtenant_to_housing"` 명시 추가, PDF 정답 103,250,000 동일 유지
- T-13~T-15: 수동 오버라이드 anchor (manualHoldingPeriodOverride 그대로 유지)
- T-16: 12개월 경계 → **의미 변경**: 부수토지=Yes + 주택 12개월 정확 → 60% 적용 (이전 "자동 분기 비활성"에서 변경)
- T-17: companion 비주택 토지 단독 → 부수토지 판정 무관
- T-18·T-19: 한도 초과 도시지역/도시지역 외 → 한도 내(주택 세율)/초과(토지 본래) 분리
- T-20: §103 단일 적용

### 신규 anchor (의미 변경 검증)
- T-33 부수토지=Yes + 주택 2년 이상 → 토지에 누진세율 + 장기보유특별공제(주택 표 1/2)
- T-34 부수토지=Yes + 주택 1~2년 → 토지 60%
- T-35 부수토지=No (독립 나대지) + 주택 단기 → 토지 본래 세율(40%) (자동 분기 진입 차단)
- T-36 landNature 미입력 + 토지+주택 일괄 → validate 차단 (단위 테스트)
- T-37 한도 초과 + 부수토지=Yes + 주택 2년 이상 → 한도 내 누진세율 / 한도 초과 토지 본래

---

## 검증 방법 (end-to-end)

```bash
# 1) 타입체크
npx tsc --noEmit

# 2) 단위 테스트 — 사례 28 디렉터리
npx vitest run __tests__/tax-engine/transfer-tax/new-construction-bundled-case-28.test.ts
npx vitest run __tests__/tax-engine/transfer-tax/new-construction-bundled-case-28-g3.test.ts
npx vitest run __tests__/tax-engine/transfer-tax/new-construction-bundled-case-28-g4.test.ts

# 3) 회귀 테스트 — 양도세 전체
npx vitest run __tests__/tax-engine/transfer-tax/

# 4) 통합 게이트
npm run check:pre-pr
```

### 브라우저 수동 확인 시나리오
1. `/calc/transfer-tax` → Step1 자산 추가
2. 자산 1 = 토지(나대지) — 면적·취득일 입력 → **신규 라디오 "주택 부수토지" 선택**
3. 자산 2 = 주택(신축) — 사용승인일·신축비용·정착면적·zone(수도권 도시지역 3배) 입력
4. 양도일 2023.3.6, 양도가액 4억, apportioned 모드
5. **Step1 폼-수준 라디오 4옵션 사라짐** 확인 (자산별 명시 입력으로 대체)
6. landNature 미선택 시 다음 단계 진행 차단 + 한국어 검증 메시지 노출 확인
7. landNature="주택 부수토지" 선택 시:
   - 결과 표 토지 라벨 "토지(부수토지)" 표시
   - 산출세액 **103,250,000** / 지방소득세 10,325,000 (PDF 정답)
   - 세율 셀 주석 "주택·부수토지 일체과세(§89·영§154⑦)" 노출
8. landNature="독립 나대지"로 변경 시:
   - 토지 40%, 주택 70% 분리 적용 (자동 분기 미진입)
   - 합계 산출세액 자산별 합과 일관

---

## 회귀 영향

- **사례 28 anchor 38개**: 모든 anchor에 `landNature` 명시 추가 후 동일 결과 유지
- **사례 27 (지분 합산)**: 토지 자산 없음 → 영향 없음
- **이월과세, PHD, 장기임대**: companion이 토지인 케이스 없음 → 영향 없음
- **다주택 중과, 비사업용 토지**: 별도 분기, 영향 없음

---

## 작업 순서 (Do 단계 진입 후)

1. **0순위** — 디자인 문서 갱신 (`docs/02-design/features/transfer-tax-new-construction-bundled-case-28.engine.design.md`, `*.ui.design.md`)에 landNature 명시 입력 정책 반영
2. **1순위** — 엔진 시니어 + UI 시니어 병렬 호출:
   - 엔진: 타입·Zod·API 변환·route·자동 분기 단순화·LTHD 일체 적용·anchor 마이그레이션
   - UI: AssetForm·factory·CompanionAssetCard 라디오·Step1 폼-수준 라디오 제거·validate·결과 표 라벨
3. **2순위** — 회귀 테스트 통과 확인
4. **3순위** — 브라우저 수동 확인 (사용자)

---

## 완료 정의 (DoD)

- [ ] `AssetForm.landNature` 필드 추가 + factory + normalize
- [ ] Zod 메인+서브 enum 정의 + `appurtenantLandRateMode` 제거
- [ ] `appurtenant-land-rate.ts` 자동 분기 조건에서 `isPrimaryShortTerm` 제거 + `landNature === "appurtenant_to_housing"` 추가
- [ ] 부수토지=Yes 시 보유기간별 동적 주택 세율 적용 (70%/60%/누진)
- [ ] 장기보유특별공제도 주택 기준 표 1/2 적용 (포괄적 일체)
- [ ] CompanionAssetCard 토지 블록 RadioCardGroup 추가
- [ ] Step1 폼-수준 `APPURTENANT_LAND_RATE_OPTIONS` 제거
- [ ] validate에 토지+주택 일괄양도 시 `landNature` 필수 검증 추가
- [ ] 결과 표 토지 라벨에 부수토지/나대지 표기
- [ ] 사례 28 anchor 38개 모두 마이그레이션 + 신규 anchor 5개(T-33~T-37) 추가
- [ ] `npx tsc --noEmit` 0건
- [ ] 양도세 회귀 테스트 100% 통과
- [ ] 브라우저 수동 확인 (사용자가 별도 수행)

---

## 주요 참조 파일·라인

| 항목 | 파일 | 라인 |
|---|---|---|
| 자동 분기 함수 | `lib/tax-engine/appurtenant-land-rate.ts` | 95-180 |
| 토지 자산 카드 | `components/calc/transfer/CompanionAssetCard.tsx` | 246-340 (assetKind=="land" 블록) |
| 폼-수준 라디오 (제거 대상) | `app/calc/transfer-tax/steps/Step1.tsx` | 19-44, 50-53 |
| AssetForm 타입 | `lib/stores/calc-wizard-asset.ts` | 274-330 |
| factory | `lib/stores/calc-wizard-asset-factory.ts` | 80-100, 320-330 |
| Zod 메인 | `lib/api/transfer-tax-schema.ts` | 180-195 (appurtenantLandRateMode 위치) |
| Zod 서브 | `lib/api/transfer-tax-schema-sub.ts` | 360-415 (companion enum 영역) |
| API 변환 | `lib/calc/transfer-tax-api.ts` / `-api-helpers.ts` | 750-780 / 280-340 |
| Route handler | `app/api/calc/transfer/route.ts` | 380-390, 595-635 |
| Validate | `lib/calc/transfer-tax-validate.ts` | (Step1 분기 신규 추가) |
| 결과 표 | `components/calc/results/transfer/FilingFormTable*.ts` | aggregate 헬퍼 |
| 사례 28 fixtures | `__tests__/tax-engine/transfer-tax/_helpers/case-28-fixtures.ts` | 전체 |
