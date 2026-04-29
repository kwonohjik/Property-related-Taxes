# 사례14 — 검용주택(1세대 1주택 + 상가) 양도소득세 계산기 구현 계획

## 개정 이력

| 일자 | 변경 | 사유 |
|---|---|---|
| 2026-04-29 v1 | 초안 작성 — calcSplitGain 재사용 가정, 12억 안분 우선 | — |
| 2026-04-29 v2 | 젠스파크 검토 의견 반영 (5개 항목): | — |
|  | 1) calcSplitGain 미재사용 — `propertyType` 가드 우회 불가, 신규 `calcHousingGainSplit`/`calcCommercialGainSplit` 작성 | 코드-문서 일치 |
|  | 2) `buildHousingPart` 4단계 처리 순서 명문화 (① 비사업용 이전 → ② 12억 안분 → ③ 장기보유공제 → ④ 양도소득금액) | 비사업용 이전과 12억 안분의 교차 처리 모호성 제거. 비사업용토지는 1세대1주택 비과세 대상 아님 |
|  | 3) 결과 카드에 `MixedUseCalculationRoute` 메타 5필드 노출 (취득시 주택공시가격 출처/환산경로/12억 분기/표 분기 사유/배율 근거) | 학습·검증 가치 — "왜 이 세액인지" 설명 |
|  | 4) 보유기간 산정 규칙 표 추가 (토지=`landAcquisitionDate`, 건물=`buildingAcquisitionDate`, 비사업용 이전분=토지 보유연수 재사용) | 명문화 |
|  | 5) 회귀 테스트 SC-3b 추가 (12억 초과 + 배율초과 동시 발생 케이스) | 잠재 이중 계산 방어 |

---

## Context

이미지5의 **사례14**(1세대 1주택 + 상가 검용주택, 22.1.1 이후 양도분 분리계산)를 우리 양도소득세 계산기로 풀어내기 위한 신규 기능 추가 계획.

**왜 필요한가**
- 양도소득세 엔진은 단독주택·상가·토지 단일 자산 케이스는 모두 지원하지만, **검용주택(주택+비주택 복합건물)** 의 양도세 분리계산은 미구현
- 22.1.1 이후 양도분부터 소득세법 시행령 §160 ① 단서가 적용되어 **주택연면적 ≥ 상가연면적이라도 강제 분리** 계산하도록 변경됨
- 12억 초과 고가주택 비과세는 **주택부분에만** 적용, 상가부분은 일반건물 양도세 전액 과세, 주택부수토지 배율초과 면적은 **비사업용토지 +10%p 중과**
- 사례14는 1992 토지 + 1997 건물 신축 + 취득가액 미확인 → **환산취득가액**까지 결합된 복잡 시나리오

**최종 목표**: 사례14 입력값으로 양도코리아 23번 메뉴와 동일한 세액 산출 + 학습·검증 가능한 3분할 결과 뷰

---

## 사용자 결정사항 (Q&A 결과)

| 항목 | 결정 |
|---|---|
| 적용 양도시점 | **2022.1.1 이후만** (이전 양도분은 향후 확장) |
| 취득가액 환산 흐름 | 양도가액→주택부분/상가부분 기준시가 비율 안분 → 각 부분 §97 환산 → 토지/건물 기준시가 비율 재안분 |
| 양도시·취득시 기준시가 정의 | **주택부분** = 개별주택공시가격 (한 값) / **상가부분** = (개별공시지가 × 상가부수토지 면적) + 상가건물 기준시가. 상가부수토지 면적 = 전체 토지 × 상가연면적/(주택+상가 연면적) 자동안분 |
| 부수토지 배율초과 분리 시점 | **주택부분 양도차익 계산 후** 면적비율 추가 분리 (주택→비사업용 토지로 일부 이동) |
| 장기보유특별공제 | 주택=표2(거주 2년+이면 최대 80%), 상가=표1, 비사업용토지=표1 |
| 정착면적 입력 | 건축물대장상 **주택연면적/(주택+상가 연면적)** 비율로 자동 안분 (1층 면적 기준) |
| 취득시 기준시가 | 토지 1992 + 건물 1997 분리 입력 + **PHD 3-시점 자동 환산 옵션** 제공 |
| 결과 화면 | **학습·검증용 3분할 카드**(주택/상가/비사업용토지) + 합산세액 |

---

## 재사용 자산 (수정 없이 그대로 사용)

| 기능 | 파일경로:라인 | 활용 |
|---|---|---|
| 12억 초과 비과세 안분 | `lib/tax-engine/transfer-tax-helpers.ts:314-318` (`calcOneHouseProration`) | 주택부분 양도차익에 그대로 적용 |
| ~~토지/건물 분리 양도차익~~ (v2 변경) | ~~`calcSplitGain`~~ → 신규 `calcHousingGainSplit`/`calcCommercialGainSplit` | `calcSplitGain`은 `propertyType !== "housing"/"building"` 가드로 검용주택 거부 → 동일 산술 패턴(개산공제 §163⑥, 보유연수 분리)을 따르되 `MixedUseAssetInput` + `MixedUseDerivedAreas`를 직접 받는 신규 함수로 작성 (transfer-tax-mixed-use-helpers.ts:113~232) |
| 환산취득가액 | `lib/tax-engine/transfer-tax-helpers.ts:38-52` (`calculateEstimatedAcquisitionPrice`) | 주택·상가 각 양도가액 안분분으로 §97 환산 호출 |
| PHD 3-시점 알고리즘 | `lib/tax-engine/transfer-tax-pre-housing-disclosure.ts:35-80` | 1997 신축 건물 기준시가 미공시 시 토글로 활용 |
| 부수토지 배율 판정 | `lib/tax-engine/non-business-land/housing-land.ts:111-118` + `urban-area.ts:72-89` (`getHousingMultiplier`) | 주택 정착면적 × 3·5·10배 적용. 검용주택용은 정착면적 자동 안분 후 호출 |
| 비사업용토지 +10%p 중과 | `lib/tax-engine/non-business-land/engine.ts:293-298` | 배율초과 면적의 양도차익에 적용 (장기보유공제 표1 + 기본세율+10%p) |
| 장기보유공제 표1·표2 | `lib/tax-engine/transfer-tax-helpers.ts:382-406` | 부분별 안분 후 각각 적용 |
| Vworld 공시지가 조회 | `app/api/address/standard-price/route.ts` | 양도시 토지 기준시가 자동조회 (1992·1997 시점은 수동 입력) |
| 자산-수준 필드 패턴 | `components/calc/transfer/AssetForm.tsx` | 검용주택 신규 필드(주택연면적·상가연면적·1층면적 등) 자산-수준에 추가 |

---

## 신규 구현 사항

### 1. 데이터 모델 (자산-수준 필드 확장)

**파일**: `lib/tax-engine/transfer-tax-types.ts` (또는 자산 타입 정의 위치)

```typescript
// 검용주택 자산 수준 필드 (모두 optional, isMixedUseHouse=true일 때만 필수)
isMixedUseHouse?: boolean              // 검용주택 토글 (양도일 ≥ 2022.1.1 시 분리계산 강제)
residentialFloorArea?: number          // 주택 연면적 (㎡, 건축물대장)
nonResidentialFloorArea?: number       // 비주택(상가) 연면적 (㎡)
buildingFootprintArea?: number         // 건물 정착면적 = 1층 면적 (㎡)
totalLandArea?: number                 // 전체 토지 면적 (㎡, 기존 필드 재사용 가능)

// 양도시·취득시 시점별 기준시가 (분리계산용)
// 안분 단위: 주택부분 = 개별주택공시가격(단일값) / 상가부분 = (공시지가 × 상가부수토지 면적) + 상가건물 기준시가
transferStandardPrice?: {
  housingPrice: number        // 양도시 개별주택공시가격 (주택건물 + 주택부수토지 일괄)
  commercialBuildingPrice: number  // 양도시 상가건물 기준시가 (사용자 입력, 토지 제외)
  landPricePerSqm: number     // 양도시 개별공시지가 (원/㎡, 상가부수토지 산정용)
}
acquisitionStandardPrice?: {
  housingPrice?: number       // 취득시 개별주택공시가격 (미공시 시 PHD로 자동 산정)
  commercialBuildingPrice?: number  // 취득시(=신축일) 상가건물 기준시가 (사용자 입력)
  landPricePerSqm: number     // 취득시 개별공시지가 (원/㎡)
}

// 자동 산출되는 파생값 (엔진에서 계산, UI WizardSidebar에 미리표시)
// commercialLandArea = totalLandArea × nonResidentialFloorArea / (residentialFloorArea + nonResidentialFloorArea)
// commercialPartTotalPrice = (landPricePerSqm × commercialLandArea) + commercialBuildingPrice

// 거주기간 (장기보유공제 표2 적용용 — 기존 필드 활용 가능 시 재사용)
residencePeriodYears?: number
```

**원칙**: 2026-04-25 자산-수준 통합 정책에 따라 모두 `AssetForm` 자산별로 저장. 폼-전역 필드 추가 금지.

---

### 2. 엔진 — 검용주택 분리계산 모듈 신규

**신규 파일**: `lib/tax-engine/transfer-tax-mixed-use.ts` (≤ 800줄, 800줄 정책 준수)

**책임**: 검용주택 입력을 받아 주택부분·상가부분·비사업용토지부분 양도소득금액을 산출하는 순수 함수

**핵심 함수 시그니처**:
```typescript
export function calcMixedUseTransferTax(
  input: TransferTaxInput,
  asset: MixedUseAsset,
  legalCodes: TaxRateMap,
): MixedUseGainBreakdown {
  // STEP 1: 양도시점 분기 — transferDate ≥ 2022-01-01 이면 강제 분리
  // STEP 2: 양도가액 안분
  //   주택부분 기준시가 = 양도시 개별주택공시가격
  //   상가부분 기준시가 = (양도시 개별공시지가 × 상가부수토지 면적) + 양도시 상가건물 기준시가
  //   상가부수토지 면적 = 전체 토지 × 상가연면적 / (주택+상가 연면적)
  //   주택 양도가액 = 총양도가액 × 주택부분 기준시가 / (주택부분 + 상가부분 기준시가)
  //   상가 양도가액 = 총양도가액 - 주택 양도가액
  // STEP 3: 주택부분 환산취득가액 — calcEstimatedAcquisitionPrice() 재사용
  // STEP 4: 주택 양도차익 산정 — calcHousingGainSplit() (신규, 토지/건물 분리)
  // STEP 5+6: buildHousingPart() 4단계 처리 (v2 — 교차 처리 명문화)
  //   ① 비사업용 이전 (안분 전): nonBusinessTransferredGain = floor(landGain × nonBizRatio)
  //   ② 12억 안분 (비사업용 제외 후 잔여 양도차익에만 §89 ① 3호 단서 적용)
  //   ③ 장기보유공제 (안분 후 양도차익에 표율 적용 — transfer-tax-helpers 패턴 일치)
  //   ④ 양도소득금액 = 안분 양도차익 - 공제액
  //   주의: 비사업용토지는 1세대1주택 비과세 대상 아니므로 12억 안분 미적용
  // STEP 7: 상가부분 환산취득가액 + 양도차익 산정
  // STEP 8: 부분별 장기보유공제 적용 (주택=표2, 상가=표1, 비사업용=표1)
  // STEP 9: 부분별 양도소득금액 → 합산 → 기본공제 250만 → 세율
  return { housingPart, commercialPart, nonBusinessPart, total }
}
```

**STEP 별 기존 함수 재사용 매핑**:
- STEP 2: 신규 헬퍼 `apportionTransferPrice()` (양도시 기준시가 비율로 안분)
- STEP 3·7: `calculateEstimatedAcquisitionPrice()` (transfer-tax-helpers.ts:38)
- STEP 4·7 토지/건물 분리: ~~`calcSplitGain()`~~ → 신규 `calcHousingGainSplit`·`calcCommercialGainSplit` (helpers.ts:113~232) — `calcSplitGain`은 `propertyType` 가드로 거부됨
- STEP 5+6: `buildHousingPart()` 4단계 (helpers.ts:299~370) — v2: 12억 안분 ⊕ 비사업용 이전 교차 처리 명문화
- STEP 6 배율: `getHousingMultiplier()` 재사용 (urban-area.ts:72) + `calcExcessLandRatio()` 신규 (helpers.ts:281~292)
- STEP 8: `applyLongTermDeduction()` 패턴 — 표1/표2 분기는 transfer-tax-helpers.ts:382 참고
- STEP 9 비사업용 +10%p: `engine.ts:293-298` 패턴 재현

**PHD 통합 (선택 옵션)**:
- 사용자가 `usePreHousingDisclosure: true` 토글 시 STEP 3에서 `calcViaPHD()` 분기
- 검용주택 PHD 적용 적합성에 대한 안내 메시지 표시 (`이미지5는 단순 §97 환산 사용`)

**Orchestrator 연결**:
- `app/api/calc/transfer-tax/route.ts`에서 자산 중 `isMixedUseHouse: true` 발견 시 `calcMixedUseTransferTax()`로 분기
- 결과를 기존 `TransferTaxResult.steps` 배열에 3분할 카드용 메타로 추가

---

### 3. UI — 입력 마법사 확장

**수정 파일**:
- `components/calc/transfer/AssetForm.tsx` — 자산 타입 선택에 "검용주택(주택+상가)" 옵션 추가
- `components/calc/transfer/MixedUseSection.tsx` (신규) — 검용주택 전용 입력 섹션

**MixedUseSection 입력 필드** (UI 표시 순서 = 엔진 계산 순서 원칙 준수):

```
[FieldCard] 검용주택 여부 토글  (자산 타입 = 검용주택일 때 활성)
  └─ 안내: "2022.1.1 이후 양도분은 주택연면적 ≥ 상가연면적이라도 분리계산"

── 면적 정보 (정착면적 자동 안분용)
[FieldCard] 주택 연면적 (㎡)        ← 건축물대장 [LawArticleModal §160①]
[FieldCard] 상가 연면적 (㎡)        ← 건축물대장
[FieldCard] 건물 정착면적 (㎡)      ← 1층 면적, 자동안분 기준

── 토지 정보 (분리 취득일 + PHD 토글)
[FieldCard] 전체 토지 면적 (㎡)
[FieldCard] 토지 취득일 (≠ 건물 취득일 토글 → 1992.1.1)
[FieldCard] 건물 취득일 / 신축일 (1997.9.12)
[FieldCard] (옵션) PHD 3-시점 환산 토글  ← 검용주택 적합성 경고 라벨

── 시점별 기준시가
[FieldCard] 양도시 개별주택공시가격       [Vworld 조회]  ← 주택건물+주택부수토지 일괄
[FieldCard] 양도시 상가건물 기준시가      ← 토지 제외 (사용자 직접 입력)
[FieldCard] 양도시 개별공시지가/㎡       [Vworld 조회]  ← 상가부수토지 산정용
[Auto display] 양도시 상가부수토지 기준시가 = 공시지가 × 상가부수토지 면적 (자동계산)
[Auto display] 양도시 상가부분 기준시가 합계 = 상가부수토지 + 상가건물 (자동계산)

[FieldCard] 취득시 개별주택공시가격       (PHD 토글 시 자동, 미공시 시 PHD 활성화 권유)
[FieldCard] 취득시 상가건물 기준시가      (1997 신축 시점 — 사용자 직접 입력)
[FieldCard] 취득시 개별공시지가/㎡       (1992 시점 — 사용자 직접 입력 또는 Vworld)
[Auto display] 취득시 상가부수토지 기준시가 = 공시지가 × 상가부수토지 면적 (자동계산)

── 거주·보유기간 (장기보유공제 표2 판정)
[FieldCard] 거주기간 (년) — 1세대1주택 표2 적용 여부 자동 판정
```

**WizardSidebar**: 입력된 면적·기준시가로부터 **주택연면적 비율**, **주택 정착면적 자동값**을 미리 표시 (엔진 계산 전이라도 산출 가능한 항목만).

---

### 4. UI — 결과 뷰 (학습·검증 3분할 카드)

**수정 파일**: `components/calc/transfer/ResultView.tsx` (또는 신규 `MixedUseResultCard.tsx`)

**구성**:
```
┌─ 양도가액 안분 (1번 카드) ────────────────────────┐
│ ▸ 주택부분 기준시가                              │
│   양도시 개별주택공시가격            XXX원        │
│ ▸ 상가부분 기준시가                              │
│   양도시 상가부수토지 기준시가       XXX원        │
│     (개별공시지가 × 상가부수토지 면적)            │
│   양도시 상가건물 기준시가           XXX원        │
│   상가부분 합계                     XXX원        │
│ ──────────────────────────────                 │
│ 주택비율                            %            │
│ 주택 양도가액                       XXX원        │
│ 상가 양도가액                       XXX원        │
└──────────────────────────────────────────────┘

┌─ 주택부분 (2번 카드) ─────────────────┐
│ 주택 환산취득가액      XXX원          │
│ 주택 양도차익          XXX원          │
│ ▸ 토지분               XXX원          │
│ ▸ 건물분               XXX원          │
│ 12억 초과 비과세 적용  (양도가액 < 12억 → 전액비과세 / ≥12억 → 안분비율%) │
│ 장기보유공제 (표2)     XX% — XXX원    │
│ 양도소득금액           XXX원          │
└────────────────────────────────────┘

┌─ 상가부분 (3번 카드) ─────────────────┐
│ 상가 환산취득가액      XXX원          │
│ 상가 양도차익          XXX원          │
│ ▸ 토지분               XXX원          │
│ ▸ 건물분               XXX원          │
│ 장기보유공제 (표1)     XX% — XXX원    │
│ 양도소득금액           XXX원          │
└────────────────────────────────────┘

┌─ 비사업용토지 부분 (4번 카드, 배율초과 시) ─┐
│ 주택부수토지 정착면적   XX㎡          │
│ 적용 배율 × 정착면적   XX㎡           │
│ 배율초과 면적          XX㎡  (음수 시 "초과 없음" 표시) │
│ 비사업용 양도차익      XXX원          │
│ 장기보유공제 (표1)     XX% — XXX원    │
│ 양도소득금액           XXX원          │
└────────────────────────────────────┘

┌─ 합산 세액 ─────────────────────────┐
│ 합산 양도소득금액       XXX원         │
│ 기본공제                250만원       │
│ 과세표준                XXX원         │
│ 산출세액 (기본세율)     XXX원         │
│ 비사업용 +10%p 가산세   XXX원         │
│ 양도소득세              XXX원         │
│ 지방소득세 (10%)        XXX원         │
│ 총 납부세액             XXX원         │
└────────────────────────────────────┘
```

**원칙** (CLAUDE.md 결과 뷰 산식 표기):
- 한국어 풀어쓰기 (변수 약어·`floor()` 금지)
- 중간 산술 결과 미표시 (결과값만)
- 법조문 링크: `LawArticleModal`로 `§89①3`·`§95②`·§104의3·시행령 §160·§163·§166·§168의12 직접 조회
- 안분 비율은 % 표시 + 우측 결과값 단일 표기

---

### 5. 테스트 (vitest)

**신규 파일**: `__tests__/tax-engine/transfer-tax/mixed-use-house.test.ts`

**필수 시나리오**:
1. **사례14 anchor 테스트** — 이미지5의 양도가액·기준시가·면적 입력 시 양도코리아 출력값과 원단위 일치 (학습용 PDF 예시 anchoring 정책 — feedback_pdf_example_test_anchoring)
2. **부수토지 배율초과 = 0 (음수)** — 사례14처럼 초과 없을 때 비사업용 부분 미생성 확인
3. **부수토지 배율초과 > 0** — 일반 케이스, 비사업용 분리 + 10%p 가산 검증
4. **12억 미만 주택부분** — 전액 비과세 처리 (주택부분 양도소득금액 0원)
5. **12억 초과 주택부분** — `(transferPrice - 12억) / transferPrice` 안분율 검증
6. **분리 취득일** — 토지 1992 + 건물 1997 → 각자 보유기간 산정
7. **PHD 토글 ON** — 1992~2005 미공시 케이스 자동 환산 (옵션 경로)
8. **거주 2년 미만** — 주택부분 표1 적용 분기 검증 (거주 40% 공제 미충족)
9. **22.1.1 이전 양도일** — 분리계산 강제 미적용 (현재 범위 외 → 에러 또는 단일 자산 처리 안내)

**Mock**: `__tests__/tax-engine/_helpers/` 의 기존 팩토리 활용 (Mock 공유 패턴 — `__tests__/tax-engine/CLAUDE.md`).

---

## 단계별 구현 순서 (PDCA Do)

| # | 단계 | 산출물 | 의존 |
|---|---|---|---|
| 1 | 자산 타입·필드 정의 추가 | `transfer-tax-types.ts` 확장 | — |
| 2 | 엔진 핵심 함수 (`calcMixedUseTransferTax`) | `transfer-tax-mixed-use.ts` 신규 | 1 |
| 3 | 양도가액 안분·환산 헬퍼 (`apportionTransferPrice`) | 같은 파일 또는 helpers | 1 |
| 4 | 주택→비사업용 면적 이전 로직 | 같은 파일 (재사용 함수 호출) | 2 |
| 5 | API Route Orchestrator 분기 추가 | `app/api/calc/transfer-tax/route.ts` | 2 |
| 6 | 사례14 anchor 테스트 작성 (TDD) | `mixed-use-house.test.ts` | 1 |
| 7 | UI — `MixedUseSection` 입력 컴포넌트 | `components/calc/transfer/` 신규 | 1, 5 |
| 8 | UI — 자산 타입 선택 추가 | `AssetForm.tsx` 수정 | 7 |
| 9 | UI — 결과 뷰 3분할 카드 | `MixedUseResultCard.tsx` 신규 | 7 |
| 10 | E2E 검증 (브라우저) | `npm run dev` + 사례14 입력 → 양도코리아 결과와 비교 | 1~9 |
| 11 | 800줄 정책 검사 + 분할 (필요 시) | — | 모든 신규 파일 |

---

## 검증 방법 (Verification)

1. **단위 테스트**: `npx vitest run __tests__/tax-engine/transfer-tax/mixed-use-house.test.ts`
2. **전체 테스트**: `npm test` (기존 1,484개 회귀 무영향 확인)
3. **타입체크**: `npm run lint`
4. **E2E 사례14 입력**:
   - `npm run dev` 후 `/calc/transfer-tax` 접속
   - 자산 타입 = 검용주택, 양도일 = 2022.02.16, 토지 168.3㎡, 주택 91.78㎡, 상가 ~277.6㎡, 1층 100㎡, 토지 취득 1992.1.1, 건물 신축 1997.9.12
   - 양도시·취득시 기준시가 입력 → 결과 카드 4개 + 합산 세액 확인
5. **법조문 링크 검증**: 결과 뷰의 `§89①3` `§95②` `§104의3` `§160` `§163` `§166` `§168의12` 모두 정상 모달 표시
6. **회귀**: 단독주택·상가·토지 단일 자산 케이스가 검용주택 분기 추가 후에도 동일 세액 산출

---

## 주요 위험 / 결정 보류 항목

| 항목 | 처리 방안 |
|---|---|
| 검용주택 PHD 적합성 | 토글로 옵션 제공 + UI에 "이미지5 사례는 단순 §97 환산 사용" 안내 노출 |
| 22.1.1 이전 양도분 | 본 계획 범위 외 (향후 `mixed-use-pre2022.ts` 분리). 입력 시 경고 노출 |
| ~~양도시 "건물기준시가"의 정의~~ | **해결됨** — 상가부분 기준시가 = (개별공시지가 × 상가부수토지 면적) + 상가건물 기준시가. 양도시·취득시 동일 패턴 |
| ~~기존 `calcSplitGain` 의 검용주택 호환성~~ (v2 해결) | `calcSplitGain` 첫 가드(`propertyType !== "housing"/"building"`)로 검용주택은 `null` 반환 → 우회 불가. 동일 산술 패턴을 따르되 `MixedUseAssetInput`을 직접 받는 신규 함수 `calcHousingGainSplit`/`calcCommercialGainSplit` 작성 |
| 800줄 정책 | `transfer-tax-mixed-use.ts` 가 800줄 초과 우려 시 `mixed-use-helpers.ts` / `mixed-use-types.ts` / `mixed-use-result.ts` 로 분할 |

---

## 핵심 파일 요약 (수정·신규)

**신규 파일**:
- `lib/tax-engine/transfer-tax-mixed-use.ts`
- `components/calc/transfer/MixedUseSection.tsx`
- `components/calc/transfer/MixedUseResultCard.tsx`
- `__tests__/tax-engine/transfer-tax/mixed-use-house.test.ts`

**수정 파일**:
- `lib/tax-engine/transfer-tax-types.ts` — 검용주택 자산 필드 추가
- `app/api/calc/transfer-tax/route.ts` — Orchestrator 분기
- `components/calc/transfer/AssetForm.tsx` — 자산 타입 옵션 추가
- `app/calc/transfer-tax/steps/Step*.tsx` — `MixedUseSection` 통합 (Step 결정은 구현 시)
- `lib/tax-engine/legal-codes/transfer.ts` — 검용주택 관련 법조문 상수 보강 (§160 단서 등)

**무수정 (재사용만)**:
- `transfer-tax-helpers.ts` (calcOneHouseProration, calculateEstimatedAcquisitionPrice 등)
- `transfer-tax-split-gain.ts`
- `transfer-tax-pre-housing-disclosure.ts`
- `non-business-land/housing-land.ts`, `non-business-land/engine.ts`
- `app/api/address/standard-price/route.ts` (Vworld)
