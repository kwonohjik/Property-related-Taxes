# 사례 32 — 신축 건물 단기양도 §114조의2 5% 가산세 (일반건물 환산취득가) — 엔진 설계

> 본 문서는 사례 32의 엔진 측 설계만 다룬다. UI는 `case-32-general-building-short-term.ui.design.md`(별도) 참조.
> 승인된 plan: `.claude/plans/image-1-image-2-logical-lollipop.md`

## Context

사례 31(일반건물 일괄 환산취득가)이 완료된 직후, 양도코리아 PDF #32에서 **건물 신축 5년 이내 단기양도** 케이스가 추가됐다. 사례 31과의 차이는 단 두 가지:
1. 토지 취득일(2008.3.17)과 건물 취득일(2018.3.31, 영 §162①4호 빠른 날)이 다르다 — 두 자산이 동일 `acquisitionDate`를 공유하던 사례 31 가정 깨짐.
2. **소득세법 §114조의2 ① "감정가액 또는 환산취득가액 적용에 따른 가산세"** — 건물 환산취득가액 × 5%를 양도소득 결정세액에 가산.

기구현 인프라(`calculateBuildingPenalty()` / finalize STEP 10.5 / `buildGeneralBuildingAssetCards()`)를 그대로 재사용하고, 토지·건물 취득일 분리와 `isSelfBuilt` 플래그 패스스루만 추가한다.

---

## ★ 케이스 인벤토리 (필수 — 비어 있으면 Do 단계 진입 금지)

| # | 시나리오 | propertyType | gbIsSelfBuilt | buildingAcq vs landAcq | 양도일−건물취득일 | 법령 근거 | anchor 출처 | 테스트 파일 | 상태 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | **사례 32 본** — 일반건물 환산 + 토지·건물 취득일 분리 + 신축 5년 이내 | general_building | true | 다름(2008.3.17 / 2018.3.31) | 4년 10개월 19일 (~4.88년) | §114조의2 ① + 영 §166⑥ + 영 §176의2 ② + 영 §163⑥ + 영 §162① 4호 | 양도코리아 PDF #32 Image 4 (양도소득금액 계산명세서) | `general-building-case-32.test.ts` | ☐ TODO |
| 2 | 신축 5년 만료 직전 — 가산세 발동 경계 | general_building | true | 다름 | 5년 −1일 (예: 2018.3.31 → 2023.3.30) | §114조의2 ① "5년 이내" | (경계 가드) | 동일 파일 | ☐ TODO |
| 3 | 신축 5년 당일 — 가산세 미발동 (현행 코드 `>= 5` 면제) | general_building | true | 다름 | 5년 정각 (2018.3.31 → 2023.3.31) | §114조의2 ① — 현행 코드 동작 회귀 가드 | (경계 가드 / 법해석 별도 검토 메모) | 동일 파일 | ☐ TODO |
| 4 | 신축 5년 +1일 — 가산세 미발동 | general_building | true | 다름 | 5년 +1일 | §114조의2 ① 적용 안 함 | (경계 가드) | 동일 파일 | ☐ TODO |
| 5 | gbIsSelfBuilt=false (일반 매입 건물) — 가산세 미적용 | general_building | false | 다름 | 4.88년 | §114조의2 ① "신축 또는 증축" 요건 미충족 | (회귀 가드) | 동일 파일 | ☐ TODO |
| 6 | 사례 31 호환 — gbIsSelfBuilt 미입력 + buildingAcq 미입력 → fallback 토지 취득일 | general_building | undefined | 동일(fallback) | (사례 31 입력값) | 사례 31 — 변경 없음 회귀 보존 | `general-building-case-31.test.ts` 38 anchor | ☑ 기존 |
| 7 | 토지 카드는 가산세 미적용 (법령상 건물 한정) | general_building | true (건물에만) | 다름 | 4.88년 | §114조의2 ① "건물의 환산취득가액" — 토지 제외 | 토지 카드 `penaltyTax === 0` | 동일 파일 | ☐ TODO |
| 8 | validate 차단 — gbIsSelfBuilt=true + buildingAcq 미입력 | general_building | true | undefined | — | 정책 #1 자동 fallback 금지 — `feedback_no_silent_apportion_fallback.md` | (validation 검증) | `transfer-tax-validate.test.ts` | ☐ TODO |

**규칙 준수**:
- 행 8개 enumerate 완료 — Do 단계 진입 가능 조건 충족.
- "anchor 출처 미발견" 행 없음 — 모두 PDF #32 또는 경계 가드.
- 사용자 추가 케이스 시 코드 작성 전 본 표에 행 추가 의무.

---

## 법령 근거

### 모법 (KoreanLaw MCP 검증 완료, 공포 20260421)

**소득세법 §114조의2(감정가액 또는 환산취득가액 적용에 따른 가산세)**:
> ① 거주자가 건물을 신축 또는 증축(증축의 경우 바닥면적 합계가 85제곱미터를 초과하는 경우에 한정한다)하고 **그 건물의 취득일 또는 증축일부터 5년 이내**에 해당 건물을 양도하는 경우로서 **§97①1호 나목**에 따른 감정가액 또는 환산취득가액을 그 취득가액으로 하는 경우에는 해당 건물의 감정가액(증축의 경우 증축한 부분에 한정한다) 또는 환산취득가액(증축의 경우 증축한 부분에 한정한다)의 **100분의 5**에 해당하는 금액을 §92③2호에 따른 **양도소득 결정세액에 더한다**.
> ② 제1항은 §92③1호에 따른 양도소득 산출세액이 없는 경우에도 적용한다.

### 보충 조문

- **소득세법 §97① 1호 나목**: 환산취득가액 적용 근거 (실지거래가액 미확인 시).
- **소득세법 §98 + 시행령 §162① 4호**: 자가건축 건물의 취득시기 = 사용승인서 교부일·사실상 사용일·임시사용승인일 중 **빠른 날**.
- **소득세법 시행령 §166⑥**: 토지·건물 일괄양도 시 양도가액 안분(양도시 기준시가 비율).
- **소득세법 시행령 §176의2 ②**: 환산취득가액 산식 (양도시 기준시가 분의 취득시 기준시가 비율).
- **소득세법 시행령 §163⑥**: 개산공제율 (등기 자산 3%, 미등기 0.3%).

### 잘못된 인용 금지 (plan 13행)

`§97②` · `§114⑦` · `§176의2⑤` 표기는 **plan·코드·디자인 문서 어디서도 사용 금지**.

### 별도 PR 메모 (본 작업 범위 밖)

기존 `general-building-valuation.ts`의 환산취득가 산식 근거 주석이 「영 §176의2 ④」로 잘못 인용되어 있음 — 실제는 「§176의2 ②」. 별도 PR로 정정(legal-codes/transfer.ts `TRANSFER.GENERAL_BUILDING_ESTIMATED_ACQ` 문자열 변경 + 회귀 테스트 영향만).

---

## 엔진 input 타입 변경

`lib/tax-engine/general-building-valuation.ts:39`의 `GeneralBuildingInput`에 2필드 추가:

```ts
export type GeneralBuildingInput = {
  // ... 기존 필드 (totalTransferPrice, transferDate, acquisitionDate, landArea, …)

  /**
   * 건물 취득일 — 영 §162①4호 빠른 날(사용승인서 교부일·사실상 사용일·임시사용승인일 중).
   * 미입력 시 acquisitionDate(토지 취득일) fallback ← 사례 31 호환.
   * isSelfBuilt=true 시 validation에서 필수 강제.
   */
  buildingAcquisitionDate?: Date;

  /**
   * 신축취득 여부. true 시 건물 카드에 §114조의2 ① 5% 가산세 발동 정보 노출.
   * 라우트 헬퍼 buildProperties()가 건물 카드만 isSelfBuilt: true로 패스스루.
   */
  isSelfBuilt?: boolean;
};
```

**`AssetCardForAggregate` 확장** (line 115 부근) — **변수 단일화**: `buildingAcquisitionDate` 1개만, `constructionDate` 별도 필드 추가하지 않음:

```ts
export type AssetCardForAggregate = {
  // ... 기존 필드

  /** 건물 카드만 set. 라우트가 TransferTaxItemInput 매핑 시 isSelfBuilt 패스스루용. */
  isSelfBuilt?: boolean;

  /**
   * 건물 카드만 set. 영 §162①4호 빠른 날.
   * 환산취득가액 가산세(§114조의2 ①)의 5년 기산점이자 건물 LTHD 보유기간 기산점.
   */
  buildingAcquisitionDate?: Date;
};
```

> 라우트 헬퍼 매핑 시점에서만 `card.buildingAcquisitionDate` → `TransferTaxInput.constructionDate`로 변환. 즉 기존 `calculateBuildingPenalty(input)`이 읽는 `input.constructionDate` 시그니처는 그대로 유지되지만, 그 값의 **원천 단일 필드는 `buildingAcquisitionDate`**. UI·스키마·자산 카드 어디에도 `constructionDate` 변수명 노출 금지.

---

## 엔진 result 타입 변경

기존 `TransferTaxResult.penaltyTax` / `penaltyBase` 필드를 그대로 사용. 신규 result 필드 없음.

신규 anchor:
- 건물 카드의 `result.penaltyTax === 13_300_202` (= 266,004,044 × 0.05, applyRate floor)
- 토지 카드의 `result.penaltyTax === 0` (법령상 건물 한정)

---

## 계산 알고리즘 (단계별)

`buildGeneralBuildingAssetCards()` 5단 파이프라인 그대로 + 라우트 헬퍼 매핑 단계에 패스스루 1줄 추가.

1. **Step 1 — 양도가 안분** (영 §166⑥): 양도시 기준시가 비율로 토지/건물 양도가 분리.
   - 양도시 토지기준시가 = 205㎡ × 5,514,000원/㎡(2022 기준연도) = 1,130,370,000원
   - 양도시 건물기준시가 = 입력값(`transferBuildingStdPrice`)
   - 토지 양도가 = 1,620,000,000 × (1,130,370,000 / 전체기준시가) = 1,317,938,332원 (anchor)
   - 건물 양도가 = 1,620,000,000 × (건물기준시가 / 전체기준시가) = 302,061,668원 (anchor)
2. **Step 2 — 환산취득가** (영 §176의2 ②): 자산별 산식 = `양도가 × 취득시 기준시가 / 양도시 기준시가`.
   - 토지: 취득시 공시지가 = 2007년 3,920,000원/㎡ (취득일 2008.3.17 직전 공시) → 936,945,640원 (anchor)
   - 건물: 입력 `acquisitionBuildingStdPrice` 사용 → 266,004,044원 (anchor)
3. **Step 3 — 개산공제** (영 §163⑥, 등기 3%): `취득시 기준시가 × 3%`
   - 토지: 803,600,000(=205×3,920,000) × 3% = 24,108,000원 (anchor)
   - 건물: 228,146,464(추정) × 3% = 6,844,394원 (anchor)
4. **Step 4 — 비사업용토지 판정** (영 §168의12): zoneType + 수도권 + 건물 footprint × 배율 비교. 본 사례는 사업용으로 가정(Image 4 결과).
5. **Step 5 — 자산 카드 2장 생성**:
   - 토지 카드(propertyType="land", `acquisitionDate`=2008.3.17): 양도차익 356,884,692, LTHD 14년 28% = 99,927,713, 양도소득금액 256,956,979 (anchor)
   - 건물 카드(propertyType="general_building_unit", **`acquisitionDate`=`buildingAcquisitionDate`=2018.3.31**, `isSelfBuilt`=true): 양도차익 29,213,230, LTHD 4년 8% = 2,337,058, 양도소득금액 26,876,172 (anchor)
6. **Step 6 — 라우트 헬퍼 매핑** (`general-building-route-helper.ts:buildProperties()`): 건물 카드만 `useEstimatedAcquisition: true`, `acquisitionMethod: "estimated"`, `isSelfBuilt: card.isSelfBuilt`, `constructionDate: card.buildingAcquisitionDate` 패스스루.
7. **Step 7 — calculateBuildingPenalty()** (`transfer-tax-rate-calc.ts:67-100` 변경 없음): 건물 카드 단독 calcTransferTax 진입 시 finalize STEP 10.5에서 발동.
   - `input.isSelfBuilt = true` ✓
   - `input.acquisitionMethod = "estimated"` ✓
   - `input.constructionDate = 2018.3.31`, `input.transferDate = 2023.2.19`, yearsHeld = 4.88 < 5 ✓
   - `penaltyBase = input.estimatedBase = 266,004,044`
   - `penaltyTax = applyRate(266_004_044, 0.05) = 13,300,202` (anchor)

---

## Silent fallback / 자동 안분 후보 식별

- **`buildingAcquisitionDate ?? acquisitionDate` fallback**: 사례 31 호환용. `isSelfBuilt=true` 경로에서는 validation ⑧이 차단하므로 silent fallback 발동 불가. `isSelfBuilt=false` 경로(=사례 31)에서만 발동 — 정책 #1(`feedback_no_silent_apportion_fallback.md`) 위반 아님.
- **건물 환산취득가의 자동 안분 없음**: `acquisitionBuildingStdPrice` 미입력 시 면적 비율 등으로 자동 채우기 금지. validation에서 차단.
- **개산공제 3% 고정**: 영 §163⑥ 명시 조항이므로 자동 fallback 아님(정책 예외).

---

## 테스트 약속

`__tests__/tax-engine/transfer-tax/general-building-case-32.test.ts` 신규.

### 본 사례 anchor (17개)

| # | 검증 대상 | 기댓값 | 출처 |
|---|---|---|---|
| 1 | 토지 양도가액 | `1_317_938_332` | PDF #32 Image 4 |
| 2 | 건물 양도가액 | `302_061_668` | PDF #32 Image 4 |
| 3 | 토지 환산취득가 | `936_945_640` | PDF #32 Image 4 |
| 4 | 건물 환산취득가 | `266_004_044` | PDF #32 Image 4 |
| 5 | 토지 개산공제 | `24_108_000` | PDF #32 Image 4 (기타 필요경비) |
| 6 | 건물 개산공제 | `6_844_394` | PDF #32 Image 4 (기타 필요경비) |
| 7 | 토지 양도차익 | `356_884_692` | PDF #32 Image 4 |
| 8 | 건물 양도차익 | `29_213_230` | PDF #32 Image 4 |
| 9 | 토지 LTHD (14년 28%) | `99_927_713` | §95② 별표2 + PDF |
| 10 | 건물 LTHD (4년 8%) | `2_337_058` | §95② 별표2 + PDF |
| 11 | 토지 양도소득금액 | `256_956_979` | PDF #32 Image 4 |
| 12 | 건물 양도소득금액 | `26_876_172` | PDF #32 Image 4 |
| 13 | 양도소득금액 합계 | `283_833_151` | PDF #32 Image 4 |
| 14 | **§114조의2 가산세** | `13_300_202` | = 266,004,044 × 5% (applyRate floor) |
| 15 | 토지 카드 penaltyTax | `0` | 법령상 건물 한정 |
| 16 | 토지 카드 usedEstimatedAcquisition | `true` | 정책 #4 회귀 가드 |
| 17 | 건물 카드 usedEstimatedAcquisition | `true` | 정책 #4 회귀 가드 |

### 5년 기산점 경계 가드 (3개)

| # | 시나리오 | buildingAcq | transferDate | 기댓값 |
|---|---|---|---|---|
| 18 | 만 5년 −1일 | 2018-03-31 | 2023-03-30 | `penaltyTax > 0` (5% 적용) |
| 19 | 만 5년 정각 | 2018-03-31 | 2023-03-31 | `penaltyTax === 0` (현행 `>= 5` 면제 — 법해석 별도 검토 메모) |
| 20 | 만 5년 +1일 | 2018-03-31 | 2023-04-01 | `penaltyTax === 0` |

### validate 차단 가드 (1개)

`__tests__/calc/transfer-tax-validate.test.ts` (또는 동일 파일)에 추가:
- `gbIsSelfBuilt=true` + `gbBuildingAcquisitionDate` 미입력 → validate가 한국어 오류 메시지로 차단.

### 회귀 가드 (사례 31)

기존 `general-building-case-31.test.ts` (38 anchor) + `general-building-case-31-bundled.test.ts` 모두 변경 없이 통과해야 함.

---

## 800줄 분할 사전 점검

| 파일 | 현재 | 예상 후 | 여유 |
|---|---|---|---|
| `general-building-valuation.ts` | 478 | ~498 | 302줄 |
| `general-building-route-helper.ts` | 346 | ~360 | 440줄 |
| `transfer-tax-schema.ts` | 656 | ~660 | 140줄 |
| `transfer-tax-api-helpers.ts` | (확인) | +2줄 | OK |
| `transfer-tax-api.ts` | 794 | **변경 없음** | 6줄 |
| `transfer-tax-rate-calc.ts` | (변경 없음) | — | — |
| `transfer-tax-finalize.ts` | 212 | **변경 없음** | — |

분할 신호 없음.

---

## UI 통합 위임

- UI 측 명세는 `case-32-general-building-short-term.ui.design.md`(별도 작성)에 정의.
- 14개 동기화 지점은 UI 시니어 책임. 본 엔진 디자인은 input/result 타입 + 라우트 헬퍼 매핑만 정의.
- 핵심 인터페이스: `gbBuildingAcquisitionDate` (string YYYY-MM-DD), `gbIsSelfBuilt` (boolean) 두 필드를 폼/Zod/API 변환/validation 5단 파이프라인에 누락 없이 동기화.

---

## 교차 분기 명시 (Plan 작업 순서 #2)

> "환산취득가액 가산세(소득세법 §114조의2 ①)는 §99의3 고가주택 12억 안분과 무관하게 **건물 환산취득가액 전체 × 5%** 로 결정세액에 가산. 비사업용토지 중과세율(§104①)과도 별개 — 중과세율은 산출세액 단계, 가산세는 결정세액 단계에서 합산. 미래 사례(§99의3 신축주택 + 단기 / NBL 토지+신축건물 일괄 등)에서 산식 충돌 가능성 사전 차단."

---

## 정책 적용 매트릭스 (1단계 PM 점검 결과 반영)

| # | 정책 메모리 | 본 엔진 디자인 적용 |
|---|---|---|
| 1 | `feedback_no_silent_apportion_fallback.md` | `buildingAcquisitionDate ?? acquisitionDate` fallback은 사례 31 호환용으로만 발동(isSelfBuilt=false 경로). isSelfBuilt=true 경로는 validation ⑧이 차단. |
| 2 | `feedback_useeffect_store_mirror_forbidden.md` | UI 디자인 문서에서 onChange 핸들러 패턴 강제 (엔진 디자인 외 영역). |
| 3 | `feedback_transfer_year_tax_rate.md` | PDF #32는 양도소득금액 283,833,151까지만 표시 → anchor도 거기까지 fix. 산출세액 이후는 회귀 가드만. 2023년 양도 누진세율표 = 2022 동일(메모리). |
| 4 | `feedback_estimated_deduction_separation.md` | anchor #16, #17로 `usedEstimatedAcquisition=true` 명시. estimatedBase·estimatedDeduction 누락 시 즉시 anchor 실패. |
| 5 | `feedback_3point_input_consistency.md` | 본 사례는 2시점, 신규 필드는 가격 아님 → 무관. |

---

## Status

| 단계 | 상태 |
|---|---|
| 1. PM/Plan | ✅ 완료 (plan 승인 + 5개 정책 점검 + 보완 2건 반영) |
| 2. Design (engine) | ✅ 본 문서 |
| 2. Design (UI) | ☐ TODO (`case-32-general-building-short-term.ui.design.md`) |
| 3. Do (engine senior) | ☐ TODO |
| 3. Do (UI senior) | ☐ TODO |
| 4. Check | ☐ TODO |
| 5. Act | ☐ TODO |
