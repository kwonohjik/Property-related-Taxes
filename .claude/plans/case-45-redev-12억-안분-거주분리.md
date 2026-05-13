# 사례 45 — 재개발아파트 취득실가 환산(청산금 납부) + 1세대1주택 12억 초과 고가주택

> 입력 자료: `/Users/mynote/Downloads/재개발 취득실가 환산(청산금 납부).pdf` + `/Users/mynote/Downloads/양도소득세 계산 사례/45번.xlsx`
> 시점: 2026-05-13
> 진행 흐름: PDCA Plan → Design → Do → Check → Report (양도세 14개 동기화 지점 준수)

---

## 0. 한눈에 보기

| 항목 | 값 |
|---|---|
| 양도일자 | 2023-02-16 |
| 양도가액 | 1,500,000,000 |
| 종전 단독주택 취득일·매매가 | 2007-04-09 / 450,000,000 |
| 관리처분인가일 | 2013-10-23 |
| 준공검사일(사용승인일) | 2020-11-05 |
| 권리가액 | 650,000,000 |
| 청산금 납부액 | 300,000,000 |
| 필요경비 | 9,000,000 |
| 종전주택 거주기간 | 5년 6월 (5년 이상 ~ 6년 미만) |
| 신축주택 거주 | 없음 (0년) |
| 보유기간 (비과세) | 종전취득 → 신축양도 통산 (15년 10월) |
| 1세대 1주택 | 충족 — 단, 양도가액 > 12억 → 고가주택 안분 |
| 조정대상지역 | 아니오 |
| 자산 종류 | redevelopment_apt (이미 구현) |
| 취득가액 모드 | 쌍방실가 (종전 실가 + 청산금) |

**핵심 anchor (양도코리아 출력):**
| 항목 | 금액 |
|---|---|
| 전체 양도차익 | 740,999,999 |
| 비과세 양도차익 (≤12억) | 592,800,000 |
| 과세대상 양도차익 (>12억) | 148,199,999 |
| 장기보유특별공제 합계 | 74,569,262 |
| 양도소득금액 | 73,630,737 |
| 기본공제 | 2,500,000 |
| 과세표준 | 71,130,737 |
| 세율 | 24% (누진) |
| **산출세액** | **11,311,376** |
| **지방소득세** | **1,131,137** |
| **세액합계** | **12,442,514** |

---

## 1. 법령 / 해석례 근거

| 근거 | 내용 |
|---|---|
| 소법 §89①3·시행령 §154 | 1세대1주택 비과세 |
| 소법 §95③·시행령 §160 | 고가주택(12억 초과) 양도차익 안분 |
| 소법 §95② 표1·표2 | 장기보유특별공제 일반(표1, 보유 ×2%, 30% 캡) / 1세대1주택(표2, 보유×4%+거주×4%, 80% 캡) |
| 소법 §95②·시행령 §159조의4 | 표2 적용 요건 = 거주 2년 이상 |
| 소법 §97·시행령 §163 / §166 / §164⑦ | 재개발·재건축 양도차익 3분할 (인가전·인가후 기존건물·청산금납부분) |
| **사전법령해석재산 2020-386 (2020-11-23)** | **재개발·재건축+청산금 납부 시, 기존주택 2년 거주 충족·신축주택 2년 거주 X 인 경우: 기존건물분 양도차익→표2, 청산금납부분 양도차익→표1** |
| **시행령 §155⑰** | **재개발·재건축 1세대1주택 비과세·LTHD 표2 거주기간 = 종전주택 + 신축주택 통산** |
| 도시및주거환경정비법 §74 등 | 보유기간 통산 (기존취득~신축양도), 공사기간 포함 / 거주기간도 실제거주 통산 |

### 1.1 거주월수 귀속 규칙 (★ 본 PR 핵심 명세 — design.md §5 명문 박스 필수)

| 분기 | LTHD 표 | 보유월수 | 거주월수 |
|---|---|---|---|
| 기존건물분 (인가전 + 인가후 비청산) | 표2 진입 시 | 종전취득 ~ 양도일 | **종전 + 신축 통산** (`prior + new`, §155⑰) |
| 청산금납부분 | 표2 진입 시 | 관리처분인가일 ~ 양도일 | **신축 거주만** (`new`) |
| 표2 진입 가드 (분기별 독립) | 해당 분기의 거주월수 ≥ 24 + 1세대1주택 | — | — |

→ **사례 45 (C-4)**: 청산금분 거주월수 = 0 < 24 → 표1 강등 (해석례 2020-386 결과와 일치).
→ **C-3 차이점**: 청산금분 거주월수 = 신축거주만 → 보유분(40% 캡) + 거주분(신축연수 × 4%) 로 산정. **기존건물분과 율이 달라질 수 있음** (계획서 §3 매트릭스 C-3 행 정정 필요).

---

## 2. 현재 시스템 진단 (이미 구현된 것 vs 갭)

### 2.1 이미 구현 (commit 743d8e5 — 재개발·재건축 양도세 엔진 + UI)

| 영역 | 파일 | 상태 |
|---|---|---|
| propertyType "redevelopment_apt" 분기 | `lib/tax-engine/transfer-tax.ts` | ✅ |
| 3분할 양도차익 (인가전/인가후 기존건물/청산금) | `lib/tax-engine/redevelopment-split.ts` (407줄) | ✅ |
| 청산금 안분 산식 | `lib/tax-engine/redevelopment-settlement.ts` (213줄) | ✅ |
| LTHD 분기별 산정 (표1/표2 함수 자체는 존재) | `lib/tax-engine/redevelopment-lthd.ts` (290줄) | ✅ |
| 환산 평가 (§164⑦/§166) | `lib/tax-engine/redevelopment-valuation.ts` (310줄) | ✅ |
| transfer-tax.ts 통합 (`transfer-tax-redevelopment.ts`) | 244줄 | ✅ STEP 5·6·7·7.5·9·10 통과 |
| UI 마법사 입력 | `components/calc/transfer/RedevelopmentBlock.tsx` (505줄) | ✅ |
| 결과 카드 | `RedevelopmentDetailCard.tsx` (126줄) | ✅ |
| 상세명세서·신고서 분기 | `DetailedStatementRedevelopmentBuilders.ts` (307줄) + FilingFormTable | ✅ |
| Zod 스키마·callAPI body·Route 매핑 (⑫⑬⑭) | `transfer-tax-schema.ts` 등 | ✅ (사례 44 기준) |
| 사례 44 anchor (1세대1주택 아님, 12억 안분 skip) | `case-44-integration.test.ts` | ✅ |

### 2.2 사례 45가 **신규로** 요구하는 갭 (= 본 PDCA 스코프)

#### 갭 G-1. **12억 초과 고가주택 안분이 redevelopment 분기에서 미구현**

근거 위치: `lib/tax-engine/transfer-tax-redevelopment.ts:9`
```ts
// STEP 3 (12억 안분) — 향후 §95③·§160 통합 (현재 사례 44 1세대1주택 아님, skip)
```
→ **본 PR에서 §95③·§160 안분 통합 필수.**

#### 갭 G-2. **장특공제 분할 적용 (사전법령해석재산 2020-386) — 현재 구현은 청산금분에도 표2 동일 적용 버그**

- 현재 `redevelopment-lthd.ts:194·213·225` — `existingRate`·`pay`·`receive` 분기에서 모두 동일한 `computeLthdRate(holdingYears, isOneHouseSingle, residenceYears)` 호출.
- 즉 **1세대1주택 + 단일 거주연수 ≥ 2년 → 청산금분도 표2** 산정. 이는 사례 44(1세대1주택 false)에서는 가려졌으나 사례 45 진입 시 잘못된 결과(청산금분에 표2 적용)를 낸다.
- 사전법령해석재산 2020-386 명세:
  - 기존건물분 양도차익 → 표2 (기존주택 거주개월수 사용)
  - 청산금납부분 양도차익 → 표1 (신축주택 거주 < 2년이면 표2 진입 불가, 표1 강제)
- **해결**: `computeRedevelopmentLthdRates` 시그니처에 `priorHouseResidenceMonths`·`newHouseResidenceMonths` 두 필드를 받아 **거주월수 귀속을 분리**:
  - `existingResidenceMonths = priorHouseResidenceMonths + newHouseResidenceMonths` (시행령 §155⑰ 통산)
  - `payResidenceMonths      = newHouseResidenceMonths` (해석례 2020-386 — 청산금분은 신축거주만)
  - `existingRate` = `computeLthdRate(existingHolding.years, isOneHouseSingle, floor(existingResidenceMonths/12))` — 표2 진입 조건은 `existingResidenceMonths >= 24`
  - `payRate`      = `computeLthdRate(payHolding.years, isOneHouseSingle, floor(payResidenceMonths/12))` — 표2 진입 조건은 `payResidenceMonths >= 24` (미충족 시 함수 내부에서 표1 강등)
  - `computeLthdRate` 자체는 `residenceYears >= 2` 가드를 이미 가지고 있어(`redevelopment-lthd.ts:259`) 별도 강등 분기 추가 불요. **거주월수 인자만 정확히 분리하여 전달**.

#### 갭 G-3. **장특공제는 "과세대상 양도차익(12억 초과분)"에만 적용**

xlsx C17=74,569,262 = (D17 24,000,000 + E17 44,418,947 + F17 6,150,315) ≈ 74,569,262
- 분할 검증:
  - D17 = 인가전 과세대상 양도차익 40,000,000 × 60% (표2) = 24,000,000
  - E17 = 인가후 비청산분 과세대상 양도차익 74,031,579 × 60% (표2) = 44,418,947
  - F17 = 청산금분 과세대상 양도차익 34,168,421 × 18% (표1) = 6,150,315
- 즉 **(전체 양도차익 × 0.2) → 분할 → 표1/표2 별도 적용 → 합산** 순서.

#### 갭 G-4. **anchor 테스트 / UI 표시 / 상세명세서 산식**

- 사례 45 anchor 테스트 신설 (`case-45-integration.test.ts`).
- 결과 카드 `RedevelopmentDetailCard.tsx`에 "12억 안분 + 표1/표2 분할 적용" 산식 노출.
- 상세명세서 `DetailedStatementRedevelopmentBuilders.ts`에 "비과세 양도차익 / 과세대상 양도차익 / 분할 LTHD" 행 추가.

#### 갭 G-5. **UI 신축주택 거주기간 입력 분리**

PDF 3p 화면: "① 기존주택 거주기간 (5년~6년 미만)" + "② 신축주택 2년 실거주여부 (2년미만)" — 두 개 별도 입력.

- 현 `RedevelopmentBlock.tsx`에 종전·신축 거주기간이 분리되어 있는지 점검 필요.
- 분리 부재 시 신규 필드 추가:
  - `redevelopment.priorHouseResidenceMonths` (종전주택 거주 개월)
  - `redevelopment.newHouseResidenceMonths` (신축주택 거주 개월)
- 14지점 ①~⑭ 전수 동기화.

---

## 3. 케이스 매트릭스 (분기 enumerate)

| # | 1세대1주택 | 양도가액 vs 12억 | 종전 거주 ≥2년 | 신축 거주 ≥2년 | 분기 산식 |
|---|---|---|---|---|---|
| C-1 | X | - | - | - | 과세 100% / LTHD 모두 표1 (현 사례 44 — 회귀 보존) |
| C-2 | O | ≤12억 | - | - | 비과세 100% (산출세액 0) |
| **C-3** | **O** | **>12억** | **≥2년** | **≥2년** | **(12억초과) 기존건물분=표2[보유+(prior+new)거주], 청산금분=표2[보유+new거주]** — 두 분기 율 不一致 가능 |
| **C-4** | **O** | **>12억** | **(prior+new)≥2년** | **new<2년** | **(12억초과) 기존건물분=표2, 청산금분=표1 ← 사례 45 (new=0)** |
| C-5 | O | >12억 | (prior+new)<2년 | new<2년 | (12억초과) 두 분기 모두 표1 (§159의4 미충족) |
| C-6 | O | >12억 | (prior+new)<2년 | new≥2년 | 이론적으로만 가능(prior<0 불가) — physically C-3와 동치. 본 PR 명시 제외 |

→ **본 PDCA 본스코프 = C-2·C-3·C-4·C-5**. C-6은 산술적으로 발생 불가능(`new≤prior+new`).
→ **C-3 anchor 설계**: 기존건물분 거주월수와 청산금분 거주월수를 의도적으로 다르게 setting (예 prior=60, new=30) 하여 두 분기 율 차이를 toBe 로 고정 — 거주 귀속 분리 회귀 보호.

---

## 4. 입력값·내부 변수·결과 anchor (사례 45)

### 4.1 입력 (UI/엔진 동일)

```ts
{
  propertyType: "redevelopment_apt",
  transferDate: "2023-02-16",
  acquisitionDate: "2007-04-09",   // 종전 단독주택 취득일
  transferPrice: 1_500_000_000,
  acquisitionPrice: 450_000_000,   // 종전 실거래가
  expenses: 9_000_000,
  useEstimatedAcquisition: false,  // 쌍방실가 모드
  isOneHousehold: true,            // ← 사례 44 와 다름
  householdHousingCount: 1,
  isRegulatedArea: false,
  redevelopment: {
    subject: "apt",
    approvalLawBasis: "urban_renovation_art_74",
    approvalDate: "2013-10-23",
    rightsValue: 650_000_000,
    settlementDirection: "pay",
    settlementAmount: 300_000_000,
    preApprovalExpenses: 0,
    postApprovalExpenses: 9_000_000,        // 인가후 분 필요경비 9백만원
    originalAssetType: "housing",            // 주택출자
    priorHouseResidenceMonths: 66,   // 5년 6월 (종전주택 실거주)
    newHouseResidenceMonths: 0,      // 신축주택 거주 없음
    // (취득가액 모드 = 쌍방실가 — useEstimatedAcquisition=false, acquisitionPrice=450M)
  },
}
```

### 4.2 엔진 산출 (anchor)

| 변수 | 산식 | 금액 |
|---|---|---|
| 전체 양도차익 | 1,500,000,000 − 750,000,000(=450M+300M) − 9,000,000 | 740,999,999 (단수 1) |
| 청산금분 양도차익 | 541,000,000 × 300/950 (인가후 양도차익 × 청산금/(권리+청산)) | 170,842,105 |
| 기존건물분 양도차익 | 740,999,999 − 170,842,105 | 570,157,894 |
| 비과세 양도차익 | 740,999,999 × 1,200,000,000/1,500,000,000 | 592,800,000 |
| 과세대상 양도차익 | 740,999,999 × 300,000,000/1,500,000,000 | 148,199,999 |
| ↳ 기존건물분 과세대상 | 570,157,894 × 0.2 | 114,031,579 |
| ↳ 청산금분 과세대상 | 170,842,105 × 0.2 | 34,168,421 |
| ↳ (xlsx 표현) 인가전 과세대상 | 200,000,000 × 0.2 | 40,000,000 |
| ↳ (xlsx 표현) 인가후 비청산분 과세대상 | (541M−170.84M) × 0.2 | 74,031,579 |
| LTHD 표2 율 (기존건물분) | 보유 15년10월 = 40% 캡 + 거주 5년 = 20% | 60% |
| LTHD 표1 율 (청산금분) | 보유 9년3월 × 2% | 18% |
| 기존건물분 LTHD | 114,031,579 × 60% | 68,418,947 |
| 청산금분 LTHD | 34,168,421 × 18% | 6,150,316 |
| LTHD 합계 | (반올림 단수 보정) | **74,569,262** |
| 양도소득금액 | 148,199,999 − 74,569,262 | 73,630,737 |
| 기본공제 | 정액 | 2,500,000 |
| 과세표준 | 73,630,737 − 2,500,000 | 71,130,737 |
| 산출세액 (§55 누진, 8800만 미만 24%) | 71,130,737 × 24% − 5,760,000 | **11,311,376** |
| 지방소득세 (×10%, 원미만 절사) | 1,131,137 | **1,131,137** |
| 세액합계 | 11,311,376 + 1,131,137 | **12,442,513~12,442,514** |

> 단수 차이(740,999,999 vs 741,000,000)는 PDF상의 1원 단수로, **엔진 anchor는 원단위 결정값**으로 고정한다 (memory `feedback_pdf_example_test_anchoring.md`).

---

## 5. 구현 작업 분해 (14개 동기화 지점 매핑)

### 5.1 엔진 (Layer 2)

| # | 파일 | 작업 |
|---|---|---|
| E-1 | `lib/tax-engine/types/transfer-redevelopment.types.ts` | `priorHouseResidenceMonths`·`newHouseResidenceMonths` 필드 추가 (기존 `residencePeriodMonths`가 단일이면 분리), `isOneHousehold` 통합 |
| E-2 | `lib/tax-engine/redevelopment-lthd.ts` | 신축주택 2년 미충족 시 청산금분 → 표1 강제, 기존건물분 → 종전 거주월수로 표2 적용 |
| E-3 | `lib/tax-engine/transfer-tax-redevelopment.ts` | **STEP 3 (12억 안분) 신규**: §160 안분 산식 — 비과세/과세대상 양도차익 분리 → 분기별 LTHD를 과세대상 양도차익에만 적용 |
| E-4 | `lib/tax-engine/redevelopment.ts` | result 에 `highValueAllocation: { nontaxableGain, taxableGain, taxableRatio }` 필드 추가 |
| E-5 | `lib/tax-engine/legal-codes/transfer.ts` | 사전법령해석재산 2020-386 상수 추가 (`PRIOR_RULING_2020_386`) |

### 5.2 클라이언트 변환 (8개 지점)

| 지점 | 파일 | 작업 |
|---|---|---|
| ① 폼 상태 | `lib/stores/calc-wizard-asset-redev.ts` | `priorHouseResidenceMonths`·`newHouseResidenceMonths` 추가 |
| ② initial | 동상 | 기본값 0 |
| ③ normalize | `lib/calc/transfer-tax-api-helpers.ts` | parseInt + 음수 가드 |
| ④ API 변환 | `lib/calc/transfer-tax-api.ts` | redevelopment payload 에 두 필드 spread |
| ⑤ UI 위젯 | `components/calc/transfer/RedevelopmentBlock.tsx` | 종전·신축 거주 입력 분리(DecimalInput 개월 단위) + 사례 45 가이드 카드 |
| ⑥ 사이드바 합계 | `components/calc/sidebar/*` (양도세) | 영향 없음 (개월수는 합계 비대상) |
| ⑦ 결과 카드 | `RedevelopmentDetailCard.tsx` + `DetailedStatementRedevelopmentBuilders.ts` | "12억 안분" 행 + "표2/표1 분할 적용 근거(2020-386)" 한국어 산식 |
| ⑧ validation | `lib/calc/transfer-tax-validate-redev.ts` | `priorHouseResidenceMonths>=0`·신축 거주 0 허용·1세대1주택 ON일 때만 의미 |

### 5.3 API/Route (6개 지점)

| 지점 | 파일 | 작업 |
|---|---|---|
| ⑨ Zod enum (main) | `lib/api/transfer-tax-schema.ts` | propertyType enum 변경 없음 |
| ⑩ Zod enum (companion) + addPropertyRefines | 동상 | 필요 시 1세대1주택 강제 refine |
| ⑪ acquisitionDate fallback | `app/api/calc/transfer/route.ts` | 변경 없음 |
| **⑫ Zod 입력 객체 정의** | `transfer-tax-schema.ts` redevelopment object | **두 필드 추가** (number≥0) |
| **⑬ callTransferTaxAPI body spread** | `transfer-tax-api.ts` | **두 필드 spread 명시** |
| **⑭ Route handler 엔진 input 매핑** | `app/api/calc/transfer/route.ts` | **redevelopment 객체에 두 필드 매핑** (Date 변환 불요) |

### 5.4 테스트

| 파일 | 항목 |
|---|---|
| `__tests__/tax-engine/transfer-tax/redevelopment/case-45-integration.test.ts` (신규) | C-4 전수 anchor 13개 (전체 양도차익·청산금분·기존건물분·12억 안분 비과세/과세·표1/표2 율·LTHD 분할·LTHD 합계·산출세액·지방세·세액합계) |
| `__tests__/tax-engine/transfer-tax/redevelopment/case-45-12억-branches.test.ts` (신규) | C-2 (12억 이하 비과세) / **C-3 (prior=60, new=30 의도적 비대칭 → existingRate와 payRate 율 차이 toBe anchor — 거주귀속 분리 회귀 보호)** / C-5 (prior+new<24 → 두 분기 모두 표1 강등) |
| `__tests__/tax-engine/transfer-tax/redevelopment/case-44-integration.test.ts` (회귀) | C-1 결과 보존 — 1세대1주택 false 분기 LTHD 모두 표1 유지 |
| `__tests__/components/calc/results/transfer/DetailedStatementRedevelopmentBuilders.test.ts` (확장) | 12억 안분 행·분할 LTHD 행 산식 toBe anchor 2~3건 |

### 5.5 디자인 문서

- `docs/02-design/features/transfer-tax-redevelopment.engine.design.md` 업데이트: §3 케이스 매트릭스에 C-2~C-6 행 추가, §5 STEP 3 (12억 안분) 활성화 명세, 사전법령해석재산 2020-386 인용.
- `docs/02-design/features/transfer-tax-redevelopment.ui.design.md` 업데이트: 종전·신축 거주 입력 분리 UI mock + 결과 카드 분할 산식 mock.

---

## 6. 위험 / 결정사항

| # | 위험 | 결정 |
|---|---|---|
| R-1 | 단수 1원 (740,999,999 vs 741,000,000) — 엔진 정수 연산 결과 vs PDF 합산 | **엔진 결과를 anchor 기준값**으로 고정. PDF 단수 1은 양도코리아 내부 반올림 차이로 명시 |
| R-2 | "기존주택 거주 2년+ / 신축 거주 X" 분기 명세는 사전법령해석례(2020-386)일 뿐 모법 명시 X | 디자인 문서 §1 법령 근거에 해석례 전문(요지) 인용 + `legal-codes/transfer.ts` 상수화 |
| R-3 | C-6 (종전 <2년 / 신축 ≥2년) 분기 해석 불명 | 본 PR 스코프 제외 (validate 차단 또는 후속 PR 명시) |
| R-7 | 사례 44 회귀 — `isOneHouseSingle=false`이므로 LTHD 분기 진입 자체가 표1 단일이며 거주분리 추가 영향 0. 단, 사례 44 anchor가 `residencePeriodMonths` 0으로 동작 중인지 확인 필요 | `case-44-integration.test.ts` 결과(LTHD 율) 변동 무 확인을 Check 단계 첫 항목 |
| R-4 | `redevelopment-lthd.ts` 290줄·`-split.ts` 407줄 — 800줄 정책 여유 있음 | 본 PR은 신규 STEP 3 60~80줄 추가 예상, 안전 |
| R-5 | UI 입력 분리 시 기존 단일 `residencePeriodMonths` 마이그레이션 필요할 수 있음 | `calc-wizard-asset-redev.ts` 마이그레이션 함수에 fallback (단일 → 종전 거주로 매핑, 신축=0) |
| R-6 | 1세대1주택 ON + redevelopment 케이스에 대해 다른 양도세 분기(`isOneHousehold` 일반 12억 안분)와 중복 작동 가능 | `transfer-tax.ts` STEP 0.6 분기에서 redevelopment_apt 인 경우 일반 12억 안분 skip, `transfer-tax-redevelopment.ts` STEP 3 에서만 처리. **회귀 보호 2건 추가**: ① `case-44-integration.test.ts`에 "STEP 0.6 일반 안분 미발동" 단위 anchor 1건 (`result.steps` 내 `STEP_3_HIGH_VALUE` 라벨이 일반 12억 분기에서 발동하지 않음을 확인) ② 일반 양도세 1세대1주택 12억 사례(주거용 토지·일반주택) 결과 불변 회귀 1건 (`__tests__/tax-engine/transfer-tax/one-house/` 기존 anchor 그대로 통과) |

---

## 7. Definition of Done (자가 점검)

- [ ] 케이스 매트릭스 C-1~C-5 전부 anchor (특히 C-4 사례 45)
- [ ] 14지점 전수 (⑫⑬⑭ grep 자가 점검 — `priorHouseResidenceMonths`·`newHouseResidenceMonths` 5단 파이프라인 통과)
- [ ] API fallback ↔ validation 동기화 (1세대1주택 OFF 시 두 필드 0 fallback)
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/transfer-tax/redevelopment/` 전부 통과 (사례 44 회귀 포함)
- [ ] 디자인 문서 (engine/ui) 케이스 매트릭스·STEP 3 명세 갱신
- [ ] 브라우저 수동 확인: redevelopment_apt + 1세대1주택 ON + 12억 초과 입력 → 결과카드 산식·신고서 표 단위 일치 (Network 탭 redevelopment.priorHouseResidenceMonths 확인)

---

## 8. 진행 순서 (PDCA)

1. **Plan (현재)** — 본 계획서 확정
2. **Design** — engine/ui design.md 업데이트 (시니어 에이전트 `transfer-tax-senior`+`transfer-tax-ui-senior` 병렬 호출)
3. **Do** — 엔진(E-1~E-5) + 클라이언트(①~⑧) + API(⑫⑬⑭) + 테스트 + UI
4. **Check** — `ui-engine-sync-checker` + `transfer-tax-qa` + 브라우저 수동
5. **Report** — 완료 보고서 + memory 갱신 (`project_case_45_redev_12억_residence_split.md`)
