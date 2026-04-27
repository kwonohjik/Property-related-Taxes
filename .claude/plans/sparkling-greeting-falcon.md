# 토지·건물 소유자 분리 양도 — case 12 구현 (상세 Todo List)

## Context

이미지 사례 12: **갑이 단독주택의 건물만 소유, 부속토지는 갑의 부인 소유**. 일괄양도가액 15억으로 양도한 뒤 **갑의 세액만 계산**하는 사례. 양도소득세는 인별 과세이므로(소령 §166⑥, §168②) 부부 합산 신고 불가, 갑은 건물 분만·부인은 토지 분만 각자 신고해야 한다.

**현재 엔진 상태**:
- ✅ 토지/건물 취득일 분리 양도차익(`transfer-tax-split-gain.ts:79`)
- ✅ 일괄양도가액 기준시가 비율 안분
- ✅ 환산취득가 토지/건물 분리
- ✅ PHD(개별주택가격 미공시 §164⑤) 3-시점 환산 — 1999년 단독주택 취득에 정확히 매칭
- ✅ 장기보유특별공제 토지·건물 각 보유연수 독립 계산
- ❌ **"본인이 토지(또는 건물)만 소유"를 표현하고 자기 신고분만 세액에 반영하는 분기**

**해법**: 새 필드 `selfOwns: "both" | "building_only" | "land_only"` 추가. PHD 경로 + selfOwns 조합으로 사례 12 정확 재현. 양 방향(건물주·토지주) 모두 동일 마법사로 처리.

**전제**:
- selfOwns="building_only" → 보유연수 anchor = `acquisitionDate` (건물 취득일)
- selfOwns="land_only" → 보유연수 anchor = `landAcquisitionDate` (토지 취득일)
- selfOwns ≠ "both" → `hasSeperateLandAcquisitionDate=true` 강제, `landAcquisitionDate` 필수
- 1세대 부부 합산 자동 판정·조정대상지역 중과는 **본 작업 범위 외**

---

## Todo List (실행 순서)

### Phase 1 — Pure Engine 타입 확장

- [ ] **T1.1** `lib/tax-engine/types/transfer.types.ts:248` — `TransferTaxInput` 인터페이스에 `selfOwns?: "both" | "building_only" | "land_only"` 추가
  - JSDoc에 소령 §166⑥·§168②, "both" 외 값 사용 시 `landAcquisitionDate` 필수임을 명시
- [ ] **T1.2** `lib/tax-engine/types/transfer.types.ts:551` — `SplitGainResult` 인터페이스에 `selfOwns: "both" | "building_only" | "land_only"` 메타 필드 추가 (UI 결과 뷰가 참조)
- [ ] **T1.3** 영향 받는 export·재수출 라인 확인 (`lib/tax-engine/transfer-tax.ts` 의 type re-export)

### Phase 2 — Pure Engine 분기 로직

- [ ] **T2.1** `lib/tax-engine/transfer-tax-split-gain.ts:79` — `calcSplitGain()` 정상 흐름의 return에 `selfOwns: input.selfOwns ?? "both"` 첨부
- [ ] **T2.2** `lib/tax-engine/transfer-tax-split-gain.ts:176` — `calcSplitGainPreDisclosure()` (PHD 경로) return에도 동일 selfOwns 첨부
- [ ] **T2.3** **마스킹 정책 결정**: 본인 외 파트의 `transferPrice / acquisitionPrice / gain` 등은 split-gain.ts 단계에서 마스킹하지 않고 원본값 유지 (결과 뷰에서 회색 표시 가능하게). 합산은 메인 엔진(transfer-tax.ts)에서 처리 — 주석으로 정책 명시
- [ ] **T2.4** `lib/tax-engine/transfer-tax-helpers.ts:389~419` — `calcLongTermHoldingDeduction()` 분리 분기에 selfOwns 적용:
  - `const ownsLand = (input.selfOwns ?? "both") !== "building_only"`
  - `const ownsBuilding = (input.selfOwns ?? "both") !== "land_only"`
  - `landDed = ownsLand ? applyRate(...) : 0`
  - `buildingDed = ownsBuilding ? applyRate(...) : 0`
  - `splitDetail.land/building.longTermDeduction` 값 갱신은 그대로 유지 (0이면 결과 뷰가 처리)
- [ ] **T2.5** `transfer-tax-helpers.ts:392~397` — 1세대1주택 12억 임계값 안분 산식에서 selfOwns 적용 시 `input.transferPrice` 대신 본인 분 양도가액(`splitDetail.building.transferPrice` 또는 `splitDetail.land.transferPrice`) 사용 (사례 12는 1세대1주택 X라 무관하지만 일관성 위해 처리)

### Phase 3 — Pure Engine 메인 흐름

- [ ] **T3.1** `lib/tax-engine/transfer-tax.ts:375` — `calcTransferGain()` 호출 직후 selfOwns 기반 합산 양도차익 도출:
  ```ts
  const selfOwns = effectiveInput.selfOwns ?? "both";
  const ownerAdjustedGain = splitDetail
    ? (selfOwns === "building_only" ? splitDetail.building.gain
       : selfOwns === "land_only"   ? splitDetail.land.gain
       : splitDetail.land.gain + splitDetail.building.gain)
    : rawGain;
  ```
- [ ] **T3.2** 동일 위치 — `taxableGain` 변수를 `ownerAdjustedGain` 으로 치환
- [ ] **T3.3** `transfer-tax.ts` `calcTax()` 호출 직전 — 단기/장기 세율 판정 anchor 보정:
  ```ts
  const rateInput = selfOwns === "land_only" && effectiveInput.landAcquisitionDate
    ? { ...effectiveInput, acquisitionDate: effectiveInput.landAcquisitionDate }
    : effectiveInput;
  ```
  → `calcTax(taxBase, parsedRates, rateInput, ...)` 로 호출
- [ ] **T3.4** 양도차익 결과 출력(`return { taxableGain, splitDetail, ... }`)에서 `splitDetail`은 그대로 (마스킹 없이) 노출 — UI가 selfOwns로 필터링
- [ ] **T3.5** CalculationStep 로그 — selfOwns ≠ "both" 시 "본인 신고분: 건물(토지) — 타인 소유 부분 제외" 단계 추가

### Phase 4 — API Schema (Zod 검증)

- [ ] **T4.1** `lib/api/transfer-tax-schema.ts:71~93` — `transferTaxInputSchema` 에 `selfOwns: z.enum(["both", "building_only", "land_only"]).optional()` 추가
- [ ] **T4.2** 동일 파일 — `.refine()` 추가:
  - `selfOwns !== "both"` 시 `hasSeperateLandAcquisitionDate === true` AND `landAcquisitionDate` 존재 필수
  - `propertyType` 은 "housing" 또는 "building" 만 허용 (토지·기타 자산은 분리 소유 개념 부적용)
- [ ] **T4.3** 에러 메시지 한국어화: "토지·건물 소유자가 다른 경우 토지 취득일을 입력해 주세요"

### Phase 5 — Wizard Store (자산-수준 필드)

- [ ] **T5.1** `lib/stores/calc-wizard-asset.ts:262` 부근 (토지/건물 분리 섹션) — `AssetForm` 인터페이스에 `selfOwns: "both" | "building_only" | "land_only"` 추가 (optional 아닌 default 값 항상 유지)
- [ ] **T5.2** `lib/stores/calc-wizard-asset.ts:420` `makeDefaultAsset()` — `selfOwns: "both"` 기본값 추가
- [ ] **T5.3** `lib/stores/calc-wizard-asset.ts:565` `migrateAsset()` — 누락 시 `"both"` 채움 (sessionStorage 기존 데이터 호환)

### Phase 6 — API 매핑

- [ ] **T6.1** `lib/calc/transfer-tax-api.ts:100~450` — `primary.selfOwns` → 엔진 input의 `selfOwns` 매핑 추가
- [ ] **T6.2** 동일 파일 — selfOwns ≠ "both" 시 `hasSeperateLandAcquisitionDate=true`, `landAcquisitionDate` 강제 (방어적 — UI에서도 강제하지만 이중 안전)
- [ ] **T6.3** 양도가액·취득가액 안분 override(landTransferPrice 등) 처리 시 selfOwns 와 충돌 없는지 확인 — selfOwns="building_only" 인데 사용자가 landTransferPrice 직접 입력해도 엔진은 안분값 그대로 사용

### Phase 7 — UI: 입력 폼

- [ ] **T7.1** `components/calc/transfer/CompanionAcqPurchaseBlock.tsx:188` 부근 — "토지와 건물의 취득일이 다른가요?" 체크박스 직후 신규 섹션 추가:
  ```
  [ ] 토지와 건물의 소유자가 다른가요? (배우자·공유자 등)
    └─ ( ) 모두 본인 소유 [기본]
       ( ) 건물만 본인 소유 (토지는 타인)
       ( ) 토지만 본인 소유 (건물은 타인)
  ```
- [ ] **T7.2** selfOwns ≠ "both" 선택 시 동작:
  - `hasSeperateLandAcquisitionDate=true` 자동 체크 + 잠금 (체크박스 disabled, hint 표시)
  - 토지 취득일 입력 필드 강조 (필수 표시 *)
- [ ] **T7.3** PHD 토글 영역 — 1999년 등 단독주택 미공시 취득 시 PHD 권장 hint 추가 ("개별주택가격 공시(2005.1.1) 이전 취득은 PHD 환산을 권장합니다")
- [ ] **T7.4** Props 추가: `selfOwns`, `onSelfOwnsChange` — `CompanionAcqPurchaseBlock` 인터페이스 + `CompanionAssetCard.tsx` 호출부 + `Step1.tsx` 콜백 연결
- [ ] **T7.5** `components/calc/transfer/LandBuildingSplitSection.tsx` — selfOwns 받아 본인 외 파트 입력 필드 시각적 회색 처리 + "타인 신고분 (참고용)" hint. read-only 강제는 하지 않음 (자동 안분값을 사용자가 override 가능하게 유지)

### Phase 8 — UI: 결과 뷰

- [ ] **T8.1** `components/calc/results/TransferTaxResultView.tsx` — `result.splitDetail.selfOwns` 분기:
  - 분리 양도차익 카드 헤더에 배지: "본인 신고분: 건물 / 토지 / 양쪽"
  - 본인 외 파트 행은 회색 + 우측에 "타인 소유 — 본인 신고 대상 아님" 주석
- [ ] **T8.2** 합계 카드 — `taxableGain` 은 이미 selfOwns 반영된 값이므로 기존 표시 그대로. 단, "토지 분 양도차익은 부인 신고 대상" 같은 컨텍스트 주석 추가
- [ ] **T8.3** CalculationStep 표시 — Phase 3에서 추가한 "본인 신고분: 건물(토지) — 타인 소유 부분 제외" 단계 노출

### Phase 9 — 테스트

- [ ] **T9.1** `__tests__/tax-engine/transfer-tax/owner-split-case12.test.ts` (신규) — 사례 12 anchor 테스트 작성
  - propertyType: "housing"
  - transferDate: 2020-02-16, transferPrice: 1_500_000_000
  - acquisitionDate: 1999-05-20, landAcquisitionDate: 1999-05-20
  - useEstimatedAcquisition: true
  - selfOwns: "building_only"
  - preHousingDisclosure: PHD 3-시점 데이터 (이미지 표 그대로)
    - 취득시(1998): perSqm=930_000, area=350
    - 최초공시(2005): perSqm=1_620_000, P_F=430_000_000
    - 양도시(2019): perSqm=2_548_000, P_T=690_000_000
    - 건물 기준시가는 합리적 추정값 (또는 사용자 표 보강 후 확정)
  - isOneHousehold: false, householdHousingCount: 2, isRegulatedAreaAtTransfer: false
- [ ] **T9.2** 검증 항목:
  1. `result.splitDetail.selfOwns === "building_only"`
  2. `result.splitDetail.land.gain` 은 계산되어 있되, `result.taxableGain` 합산에 미포함
  3. `result.splitDetail.building.longTermDeduction > 0`, `result.splitDetail.land.longTermDeduction === 0`
  4. `result.totalTax` 첫 통과값을 expectedTotal anchor (회귀 가드)
  5. 보유연수 anchor: 건물 취득일 기준 (20년+)
- [ ] **T9.3** 반대 케이스 테스트 (`owner-split-land-only.test.ts` 또는 동일 파일 내 `describe.each`) — selfOwns="land_only" 로 토지주(부인) 입장 신고
- [ ] **T9.4** 회귀 테스트 실행:
  - `npx vitest run __tests__/tax-engine/transfer-tax/land-building-split.test.ts` (S1~S5 모두 통과)
  - `npx vitest run __tests__/tax-engine/transfer-tax/pre-housing-disclosure.test.ts`
  - selfOwns 미지정 시 "both" 기본값 → 기존 동작 동일성 확인

### Phase 10 — Lint·Build·수동 검증

- [ ] **T10.1** `npm run lint` — ESLint 통과
- [ ] **T10.2** `npm run build` — Next.js 16 production 빌드 통과
- [ ] **T10.3** `npx vitest run __tests__/tax-engine/` — 양도세 외 회귀 없음
- [ ] **T10.4** `npm run dev` 실행 후 마법사 수동 테스트:
  1. 자산 종류=주택, 취득일 1999-05-20, 양도일 2020-02-16
  2. "토지와 건물의 소유자가 다른가요?" 체크 → "건물만 본인 소유" 선택
  3. PHD 토글 활성화 후 표 데이터 입력
  4. 일괄양도가액 1.5억 입력
  5. 1세대 보유 주택 수 = 2 (다주택), 조정대상지역 = 아니오
  6. 결과 뷰: "본인 신고분: 건물" 배지, 토지 행 회색 처리, 갑의 세액만 표시
- [ ] **T10.5** 반대 케이스 수동 검증 — selfOwns="land_only" 로 부인 입장 신고 시 토지 분만 결과에 반영
- [ ] **T10.6** sessionStorage migrate 검증 — 기존 자산 데이터(selfOwns 누락)가 "both" 로 이전되어 무회귀

### Phase 11 — 마무리

- [ ] **T11.1** 800줄 정책 점검 — 변경된 파일 중 800줄 초과 시 분할
- [ ] **T11.2** 새 anchor 테스트의 `expected*` 상수에 사례 출처 주석 ("이미지 case 12, 1999.5.20 취득 / 2020.2.16 양도")
- [ ] **T11.3** CLAUDE.md 갱신 검토 — selfOwns 사용 가이드를 "Critical Design Decisions" 섹션에 추가할지 결정 (사용자 요청 시에만)

---

## Verification (최종)

| 항목 | 명령 / 절차 | 통과 조건 |
|---|---|---|
| 단위 테스트 (anchor) | `npx vitest run __tests__/tax-engine/transfer-tax/owner-split-case12.test.ts` | 신규 케이스 통과 |
| 회귀 테스트 (양도세) | `npx vitest run __tests__/tax-engine/transfer-tax/` | 80 파일 전체 무회귀 |
| Lint | `npm run lint` | 0 error |
| Build | `npm run build` | 0 error |
| 수동 (건물주) | dev 서버 사례 12 입력 | "본인 신고분: 건물" 표시 + 갑 세액만 산출 |
| 수동 (토지주) | dev 서버 selfOwns="land_only" | 토지 분만 결과 반영 |
| 마이그레이션 | 기존 sessionStorage 데이터 로드 | "both" 로 자동 채움, 무회귀 |

---

## Out of Scope (다음 PR 또는 별개 이슈)

- 1세대 정의(소령 §152) 부부 합산 자동 판정 — 현재 `householdHousingCount` 직접 입력 유지
- 양도가액 안분 비율의 시점(취득시 vs 양도시 기준시가) 일반 경로 정합성 — PHD 경로는 양도시 기준시가 비율로 안분되므로 사례 12에 무관, 별개 이슈로 기록
- 혼합 단기세율(토지 장기 + 건물 단기 → 파트별 세율) — 기존 미구현 한계 그대로
- 조정대상지역 다주택 중과 — 사용자 지시로 본 작업에서 무시

---

## Critical Files Quick Reference

| 파일 | 역할 | 주요 라인 |
|---|---|---|
| `lib/tax-engine/types/transfer.types.ts` | TransferTaxInput·SplitGainResult 타입 | 202~248, 551~558 |
| `lib/tax-engine/transfer-tax-split-gain.ts` | 분리 양도차익 계산 | 79, 176 |
| `lib/tax-engine/transfer-tax-pre-housing-disclosure.ts` | PHD 3-시점 (재사용, 무수정) | 35~143 |
| `lib/tax-engine/transfer-tax-helpers.ts` | 장기보유공제 분리 적용 | 389~419 |
| `lib/tax-engine/transfer-tax.ts` | 메인 오케스트레이터 | 375~542 |
| `lib/api/transfer-tax-schema.ts` | API zod 검증 | 71~93 |
| `lib/stores/calc-wizard-asset.ts` | AssetForm 자산-수준 | 155~411, 420, 565 |
| `lib/calc/transfer-tax-api.ts` | 자산 → 엔진 input 매핑 | 100~450 |
| `components/calc/transfer/CompanionAcqPurchaseBlock.tsx` | 취득 정보 입력 + 분리 토글 | 180~285 |
| `components/calc/transfer/LandBuildingSplitSection.tsx` | 토지·건물 가액 분리 입력 | 전체 |
| `components/calc/results/TransferTaxResultView.tsx` | 결과 뷰 | 분리 결과 카드 부분 |
| `__tests__/tax-engine/transfer-tax/owner-split-case12.test.ts` | 신규 anchor 테스트 | 신규 작성 |
