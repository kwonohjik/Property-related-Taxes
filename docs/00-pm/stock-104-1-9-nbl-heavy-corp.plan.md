# B — §104①9호 비사업용 토지 과다소유법인 주식 세율(기본세율 + 10%p) 구현 계획

**상태**: 🟡 **착수 조건 충족** — 법령 체인 전부 본문 확보(§2). 미착수.
**선행**: [[stock-other-asset-104-5-and-104-1-9.plan.md]] 결함 B (A는 PR#1026으로 종결)
**후속**: 같은 계획서 결함 C(§104⑤ 후단 8호·9호 동일 자산 의제) — **이 건이 선행돼야 한다**

---

## 1. 문제

`applyStockTaxRate`가 기타자산 두 분류를 **모두 §55① 기본누진**으로 보낸다.

```
lib/tax-engine/stock-transfer/stock-transfer-rate-calc.ts:117-130
  case "other_asset_block_shareholder":
  case "other_asset_heavy_re": {
    const { rate, deduction, tax } = calcProgressiveTaxFromBrackets(
      taxBase, BASIC_PROGRESSIVE_BRACKETS);
```

「소득세법」 §104①**9호**에 해당하면 **별도 세율표**(16~55%)를 써야 하는데, 그 판정 입력이 없어
9호로 갈 길 자체가 없다.

**실측**(2026-08-03 · `other_asset_heavy_re` · 과세표준 297,500,000):

| | 세율 | 세액 |
|---|---|---:|
| 현행 (§104①1호 = §55① 기본누진) | 38% | 93,110,000 |
| §104①9호 표 (1.5억~3억: 5,206만 + 초과액 × 48%) | 48% | 122,860,000 |
| **차이** | | **29,750,000** (= 과세표준 × 10%) |

## 2. 법령 체인 (전부 본문 확보)

| 조문 | 내용 | 출처 |
|---|---|---|
| 「소득세법」 §104①9호 | 「§94①4호**다목 및 라목**에 따른 자산 중 §104의3에 따른 **비사업용 토지의 보유 현황을 고려하여 대통령령으로 정하는 자산**」 + **별도 세율표 16~55%** | MST 285523 |
| 「소득세법 시행령」 **§167조의7** (「비사업용 토지 과다소유법인 주식의 범위」) | 「법 §104①9호에서 "대통령령으로 정하는 자산"이란 법 §94①4호 **다목 또는 라목**에 해당하는 주식등으로서 **해당 법인의 자산총액 중 「법인세법」 §55조의2②에 따른 비사업용토지의 가액이 차지하는 비율이 100분의 50 이상**인 법인의 주식등을 말한다」 | MST 286211 |
| 「법인세법」 §55의2② | 「비사업용 토지」 정의 — 소유기간 중 대통령령으로 정하는 기간 동안 ①농지 ②임야 ③목장용지 ④그 외 토지 ⑤주택 부속토지 중 배율 초과분 ⑥별장 부속토지 ⑦유사 토지 | MST 280349 |

> ✅ **착수 조건이던 「법인세법 §55의2② 정의 확인」 완료.** 다만 그 판정은 **법인의 자산 구성 사실**이라
> 우리 엔진이 재현할 대상이 **아니다** — 사용자(또는 법인)가 산정한 비율을 입력받는다(§4 D-1).

### 2-A. ⭐ 세율표 검산 — **기본표에서 `rate`만 +10%p, `deduction`은 동일**

법정 9호 표를 `tax = base × rate − deduction` 표준형으로 변환하면 누진공제가 기본표와 **완전히 같다**.
8구간 전부 손검산했다(대표 3건):

| 과세표준 구간 | 9호 법문 | 변환 deduction | 기본표 deduction | 일치 |
|---|---|---:|---:|:--:|
| 1,400만 ~ 5,000만 | 224만 + 초과액 × 25% | 5,000만×25% − 1,124만 = **1,260,000** | 1,260,000 (15%) | ✅ |
| 1.5억 ~ 3억 | 5,206만 + 초과액 × 48% | 3억×48% − 1억2,406만 = **19,940,000** | 19,940,000 (38%) | ✅ |
| 10억 초과 | 4억8,406만 + 초과액 × 55% | 10억×55% − 4억8,406만 = **65,940,000** | 65,940,000 (45%) | ✅ |

**수학적 필연이다** — `tax₉ = tax_기본 + 0.1 × base = base×(r+0.1) − d`. 곧 `d' = d`.
⇒ 표를 새로 하드코딩하지 말고 **`BASIC_PROGRESSIVE_BRACKETS`에서 파생**하고, 파생값이 법정 표와
일치함을 **anchor로 8구간 전수 고정**한다(드리프트 0 + 정본 검증 동시 달성).

## 3. 현행 코드 지도 (실측 file:line)

| 축 | 위치 |
|---|---|
| 세율 분기 | `lib/tax-engine/stock-transfer/stock-transfer-rate-calc.ts:117-130` |
| 누진표 상수 | `lib/tax-engine/stock-transfer/stock-rate-tables.ts:210-219` (연도 분기 **없음**) |
| 분류 | `lib/tax-engine/stock-transfer/stock-classification.ts:245-272` (다목/라목) |
| `applyStockTaxRate` 호출처 | 5파일 10곳 (`stock-transfer-tax` · `-aggregate` · `-rate-calc` · `lot-allocation-tax` · 테스트 1) |
| §104⑤ 버킷 | `stock-transfer-aggregate.ts` `computeOtherAssetComparativeTax` (PR#1026 신설) |

**파일 크기 여유**: rate-calc 192줄 · rate-tables 219줄 · classification 444줄 · aggregate 368줄 — 전부 정책 내.

### 14 동기화 지점 경로 (`isHeavyRealEstateForRate` 추적으로 확정)

| # | 지점 | 위치 |
|---|---|---|
| ① | 폼 타입 | `lib/stores/calc-wizard-stock-store.ts:97` |
| ② | initial | `lib/stores/calc-wizard-stock-store.ts:459` |
| ③ | normalize | `lib/stores/calc-wizard-stock-normalize.ts:76` |
| ④ | API 변환 | `lib/calc/stock-transfer-tax-api.ts:296` |
| ⑤ | UI 위젯 | `components/calc/stock-transfer/OtherAssetBlock.tsx:81` |
| ⑥ | 사이드바 합계 | **해당 없음** — 주식 전용 summary 함수 없음(세액은 result 경유 자동 반영) |
| ⑦ | 결과 카드 | `components/calc/results/StockTransferTaxResultView.tsx:85·102` — **`Record<taxCategory,…>` 전수 강제** |
| ⑧ | validation | `lib/calc/stock-transfer-tax-validate.ts:105` |
| ⑨~⑫ | Zod | `lib/api/stock-transfer-tax-schema.ts:161` — **단건·다건 공용**(`:542` `items: stockTransferInputSchema.array()`) |
| ⑬ | body spread | `lib/calc/stock-transfer-tax-api.ts` (④와 같은 파일) |
| ⑭ | Route 매핑 | `app/api/calc/stock-transfer/route.ts:148` `buildEngineInput` — **단건·다건 공용** |

**추가 3곳**(14지점 밖이나 누락 시 침묵):
- Step1 조건부 노출 `app/calc/stock-transfer-tax/steps/Step1.tsx:283-296`
- 신고서 라벨 `components/calc/stock-transfer/StockFilingFormTableHelpers.ts:136`
- **부담부증여 경유 호출** `lib/calc/gift-burdened-transfer-api.ts:420` — 신규 필드 기본값 필요

## 4. 설계 판단 (대안 병기 — 조용히 고르지 않는다)

### D-1. 입력 형태 — **비율 숫자** vs boolean

| 안 | 내용 | 평가 |
|---|---|---|
| **가 (권고)** | `nblRatioOfCorpAssets?: number`(%) 입력 → 엔진이 **50% 임계 판정** | 임계가 법정이라 **엔진이 판정해야 드리프트가 없다**. 다목의 `cumulativeTransferRatio`(3년 누적 양도 비율) **선례와 동형** |
| 나 | `isNonBusinessLandHeavyCorp: boolean` 체크박스 | 단순하나 사용자가 임계까지 판단해야 하고, 임계 개정 시 UI 문구만 바뀌어 **엔진과 갈린다** |

⇒ **가** 채택. **미입력(undefined) = 9호 미해당(§104①1호)** — 「법 근거 없이 불리 적용 금지(명문부재=유리)」.
차단하지 않는다(기존 기타자산 신고 흐름을 깨지 않는다).

### D-2. 세율 분기 키 — **`taxCategory` 확장** vs 별도 플래그

| 안 | 내용 | 평가 |
|---|---|---|
| **가 (권고)** | `taxCategory`에 `other_asset_block_shareholder_nbl` · `other_asset_heavy_re_nbl` **2종 추가**(13→15) | `Record<taxCategory,…>` 2곳 + switch가 **컴파일 에러로 누락을 강제**한다. 결과 화면에 「§104①9호」가 라벨로 자연히 드러난다 |
| 나 | `applyStockTaxRate`에 optional param 추가 | 호출처 5파일 10곳 중 **넘기기를 잊으면 9호가 조용히 사라진다** — ⑫⑬⑭ 침묵 strip과 같은 실패 양식 |

⇒ **가** 채택. 카테고리가 2종 느는 비용보다 **침묵 누락 차단**이 크다.
9호는 다목·라목 **둘 다**에 얹히므로 2종이 필요하다(시행령 §167의7 「다목 **또는** 라목」).

### D-3. §104⑤ 버킷 — 주식 자체 vs 부동산 `clauseBucketKey` 공용화

⇒ **자체 최소 버킷** 채택. 호가 **1호·9호 둘뿐**이라 `taxCategory` 2분기로 충분하다.
부동산 `transfer-tax-rate-clause.ts`를 import하면 **크로스 도메인 의존**이 생긴다(서브엔진 순환 금지 원칙).
공용 승격은 결함 C(크로스 엔진 합산) 착수 시 재검토한다.

### D-4. ⚠️ §104⑤ MAX가 **비로소 진짜로 작동**한다

PR#1026(A)은 「기타자산은 전부 §104①1호 ⇒ 1호 = 2호」를 전제로 **합산 누진 1회**로 구현했다.
9호가 생기면 호가 둘이 되어:

- **1호** = 기타자산 **전체** 과세표준 합계액에 §55① 기본누진 (9호분도 기본세율로)
- **2호** = 버킷별 합산 — (1호 그룹 합산 누진) + (9호 그룹 합산 누진 + 10%p)
- **MAX(1호, 2호)** — 9호 1건 + 1호 1건처럼 버킷이 각 1건이면 **1호가 이길 수 있다**

⇒ `computeOtherAssetComparativeTax`를 버킷 2개 + MAX로 확장한다. **PR#1026의 anchor A-1 주석이
이 조건을 이미 적어 뒀다**(「§104①9호가 구현되면 호가 둘이 되어 버킷 분리가 필요」).

## 5. Phase 계획

```
Phase 0 (Pre-Do anchor · feedback_pre_anchor_verification)
  → 9호 세율표 파생값 == 법정 표 8구간 전수 anchor를 **먼저** 작성·실행
  → verify: 파생 실패 시 표 설계를 여기서 되돌린다(Do 진입 전 환류)

Phase 1 엔진 — 세율
  1-1 stock-rate-tables.ts: NBL_HEAVY_CORP_BRACKETS = BASIC에서 rate +0.1 파생
  1-2 types: taxCategory 2종 추가 → Record 2곳이 컴파일 에러 (D-2 안전망 발동 확인)
  1-3 stock-transfer-rate-calc.ts: case 2개 추가
  1-4 stock-classification.ts: nblRatioOfCorpAssets ≥ 50 → _nbl 카테고리
  → verify: 과세표준 297,500,000 → 122,860,000 (실측 도출값)

Phase 2 엔진 — §104⑤ 버킷 (D-4)
  2-1 computeOtherAssetComparativeTax를 버킷 2개 + MAX로 확장
  2-2 PR#1026 anchor A-1 주석 갱신(「호가 하나」 전제 해제)
  → verify: 9호 1건 + 1호 1건에서 MAX가 1호를 고르는 케이스 재현

Phase 3 배관 — 14지점 (§3 표 순서대로)
  → verify: grep 자가 점검 ⑫⑬⑭ + tsc 0

Phase 4 표시
  4-1 결과 카드 라벨·법령근거 (Record 강제로 이미 열림)
  4-2 신고서 helper 라벨
  4-3 부담부증여 경유 기본값 (gift-burdened-transfer-api.ts:420)
  → verify: 브라우저 수동 확인(폼→계산→결과 · Network 탭 신규 필드)
```

## 6. 리스크

| # | 리스크 | 대응 |
|---|---|---|
| R-1 | 9호 세율표를 파생으로 만들면 법정 표와 갈릴 수 있다 | Phase 0 anchor가 **8구간 전수**를 법문 수치로 고정 |
| R-2 | **연혁 미확인** — 9호 표가 과거 연도에 달랐는지 조사하지 않았다 | `BASIC_PROGRESSIVE_BRACKETS`가 이미 **연도 분기 없음**이라 같은 한계를 승계한다(신규 결함 아님). 별건으로 남긴다 |
| R-3 | `taxCategory` 확장이 소비처를 깨뜨린다 | **의도된 것**이다 — Record 2곳 + switch가 컴파일 에러로 전부 드러난다 |
| R-4 | 부담부증여 경유 호출에 신규 필드 누락 | optional이라 타입은 통과 → **Phase 4-3에서 명시 추가** + grep 점검 |
| R-5 | 사용자가 「비사토 가액 비율」을 산정하기 어렵다 | 미입력 = 미해당(§4 D-1). FieldCard `hint`에 「법인 재무제표 기준·법인세법 §55의2②」 명시 |

## 7. 범위 밖

- **결함 C**(§104⑤ 후단 8호·9호 동일 자산 의제 — 부동산 ↔ 주식 크로스 엔진). 이 건 완료 후 별건.
- **차손 통산(§102②)** 주식 엔진 미구현 — PR#1026에서 확인한 별건.
- 「법인세법 §55의2②」 비사업용 토지 판정 **엔진 구현** — 법인의 자산 구성 사실이라 대상 아님(§2 주석).
