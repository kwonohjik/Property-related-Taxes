# 재개발/재건축 양도소득세 — 계산 엔진 + 사례 44 UI 구현 계획

## Context

재개발·재건축 양도소득세는 **관리처분 인가일**을 분기점으로 양도차익을 ① 인가전(기존 부동산분 → 권리가액으로 양도 의제) + ② 인가후(완성 APT 양도 시) + ③ 청산금 납부/수령분으로 **3분할** 하는 고유 로직이다. LTHD 보유기간도 분기별로 분리 기산하며, 환산취득가는 **권리가액 × (취득시 기준시가 / 관리처분인가일 기준시가)** 의 비표준 공식을 사용한다.

현재 코드베이스는 `propertyType="right_to_move_in"` 타입만 정의되어 있고(주택 수 산정·LTHD 원조합원 단서 §95② 일부만 반영), **관리처분 인가일·권리가액·청산금**은 입력 필드조차 없다. PDF 6페이지(재개발·재건축의 계산 사례, 제1~8절) + 양도코리아 11개 사례 시트(36~46) 학습 결과를 바탕으로 **엔진은 매트릭스 전체(입주권 양도·APT 양도·실가/환산·납부/수령·토지출자/주택출자 조합)** 를 구현하고, **UI는 사례 44(APT-환산-납부-주택출자)** 만 노출하는 점진적 확장 전략을 채택한다.

PDF 학습 핵심:
- **제3절** 입주권 양도 — 청산금 납부/수령 안분 매트릭스
- **제4절** APT 양도 — 토지출자/주택출자 × 납부/수령 4분기
- **제5절** LTHD 적용 보유기간 (분기 분리)
- **제6절** 환산취득가 공식 — 종전부동산 환산취득가 = 양도가액 × (취득시 기준시가 / 관리처분 인가일 기준시가). **취득시 기준시가 ≤ 취득전기 기준시가** 일 때 최초고시 기준시가로 대체
- **제7절** 권리가액의 토지·건물 분리 평가
- **제8절** 청산금 양도차익 산정 — 청산금 / (권리가액+청산금) 비율로 인가후 양도차익 안분

### 법령 인용 (law.go.kr 2026-05-13 확인)

| 표기 | 정확 조문 | 핵심 내용 |
|---|---|---|
| 소득세법 §95② | 본법 제95조 제2항 (시행 2026-04-21) | "조합원입주권(조합원으로부터 취득한 것은 제외한다)에 대하여 그 자산의 양도차익(조합원입주권을 양도하는 경우에는 「도시 및 주거환경정비법」 제74조에 따른 관리처분계획 인가 ... 전 토지분 또는 건물분의 양도차익으로 한정한다)" — **원조합원만 LTHD, 인가전 분에 한정** |
| 소득세법 §89①3호 | 본법 제89조 제1항 제3호 | 1세대 1주택 비과세 (12억 초과 고가주택 제외). 사용자 지적대로 **§89②가 아님** — ②는 주택+입주권/분양권 보유 시 §89①3호 적용 배제 규정 |
| 소득세법 §89①4호 | 본법 제89조 제1항 제4호 | 조합원입주권 비과세 (12억 초과 시 과세) |
| 시행령 §176의2②2호 | 시행령 제176조의2 제2항 제2호 | 환산취득가 산식: **양도당시 실지거래가액 × (취득당시 기준시가 / 양도당시 기준시가)** — ③이 아닌 **②2호**가 산식 직접 규정 |
| 시행령 §164⑦ | 시행령 제164조 제7항 | 개별주택가격·공동주택가격 **최초 공시 이전 취득** 시 환산 단서 |
| 시행령 §154 | 시행령 제154조 | **1세대 1주택 보유 2년 요건** — 사용자 지적대로 사례 46의 정확 근거. 본법 §89가 아님 |
| 도시정비법 §74 | 도시 및 주거환경정비법 제74조 | **관리처분계획의 인가** — 분양대상자별 종전 토지/건축물 명세 및 사업시행계획인가 고시일 기준 가격 확정 |
| 빈집·소규모주택정비법 §29 | 빈집 및 소규모주택 정비에 관한 특례법 제29조 | 사업시행계획 인가 — 재개발·재건축 외 소규모주택 정비 사업 cross-ref |

---

## 사례 매트릭스 (디자인 표 — Plan 단계 필수 enumerate)

| 사례 | 양도대상 | 출자대상 | 취득가액 | 청산금 | UI 노출 | 비고 |
|---|---|---|---|---|---|---|
| 36 | 입주권 | (해당없음) | 실가 | 납부 | ❌(엔진만) | `right_to_move_in` 확장, anchor 등록 |
| 37 | 입주권 | (해당없음) | 환산 | 납부 | ❌ | 권리가액 × 비율, anchor 등록 |
| 38 | 입주권 | (해당없음) | 실가 | 수령 | ❌ | anchor 등록 |
| 39 | 입주권 | (해당없음) | 환산 | 수령 | ❌ | anchor 등록 |
| 40 | APT 완공 | 토지 | 실가 | 납부 | ❌ | `redevelopment_apt` 신규, anchor 등록 |
| 41 | APT 완공 | 토지 | 환산 | 납부 | ❌ | anchor 등록 |
| 42 | APT 완공 | 토지 | 실가 | 수령 | ❌ | **anchor 보류** (xlsx "교재 답 상이" 명기 — 정답 불확실) |
| 43 | APT 완공 | 토지 | 환산 | 수령 | ❌ | **anchor 보류** (xlsx 시트 미존재 — 정답 미확정) |
| **44** | **APT 완공** | **주택** | **환산** | **납부** | **✅ UI 구현** | **PDF anchor: 산출 56,799,400 / 지방 5,679,940 / 합 62,479,340** |
| 45 | APT 완공 | 주택 | 실가 | 납부 | ❌ | 1세대1주택 12억 안분 + LTHD 표2, anchor 등록 |
| 46 | APT 완공 | 주택 | 실가 | 수령 | ❌ | 보유 2년 미충족 비과세 미달 (시행령 §154 근거), anchor 등록 |

**사례 42·43 처리 정책**: 엔진 일반화로 계산은 **가능**하지만, 양도코리아 PDF 산출값이 교재와 상이하다고 명기된 만큼 anchor 등록은 보류. 계산 결과는 회귀 테스트에 산출(snapshot)만 두고, "정답 합치" toBe 검증은 후속 PR에서 국세청 해석례·집행기준 추가 자료로 확정 후 등록.

**엔진 분기 결정 변수 (입력)**:
- `redevelopmentSubject`: `"right"` (입주권) | `"apt"` (완공 APT)
- `originalAssetType`: `"land"` (토지출자) | `"housing"` (주택출자) — `subject="apt"` 시
- `useEstimatedAcquisition`: 기존 boolean 재사용 (실가/환산)
- `settlementDirection`: `"pay"` (납부) | `"receive"` (수령)

---

## 핵심 계산 산식 (Engine Spec)

### A. 3분할 양도차익 산정

**Step 1 — 인가전(기존 부동산분) 양도차익**
- 양도가액 = `권리가액`
- 취득가액:
  - 실가: 입력값 `actualAcquisitionPrice`
  - 환산: `floor(권리가액 × (취득시 기준시가 / 관리처분인가일 기준시가))` (시행령 §176의2②2호, BigInt floor)
    - 매핑 근거: 재개발 인가전 분의 양도 의제 시점이 인가일이므로 "양도당시 기준시가 = 관리처분인가일 기준시가"
    - **§164⑦ 단서 트리거 정정**: ❌ "취득시 ≤ 취득전기" 폐기 → ✅ **`acquisitionDate < firstDisclosureDate`** (취득일이 개별주택가격/공동주택가격 최초 공시일 이전). 단서 발동 시 **§164⑤ 준용** 대체 산식 (토지/건물 분리 안분).
    - rounding 모드: 시행령 미규정 → 기본 `floor`. 사례 44 사전 손계산 → `141,221,532` (xlsx 141,221,534 와 2원 차이, 산출세액 anchor 56,799,400 이 최종 정합)
- 필요경비: 인가전 분 입력값
- 양도차익 ① = 권리가액 − 취득가액 − 필요경비

**Step 2 — 인가후(완공 APT) 양도차익 — `subject="apt"` 만**
- 양도가액 = 입력 `transferPrice` (완공 APT 매매가)
- 분양가 = `권리가액 + 청산금납부액` (혹은 `권리가액 − 청산금수령액`)
- 인가후 총 양도차익 = 양도가액 − 분양가
- **안분 비율**:
  - 기존주택분 비율 = `권리가액 / 분양가`
  - 청산금 납부분 비율 = `청산금 / 분양가`
- 인가후 기존주택분 양도차익 ②₁ = 인가후 총 양도차익 × 기존주택분 비율
- 청산금 납부분 양도차익 ②₂ = 인가후 총 양도차익 × 청산금분 비율

**청산금 수령 케이스 (사례 38/39/42/46)**:
- 청산금 수령분 양도차익 = (청산금 수령액) − (청산금 수령분 취득가액 안분)
  - 취득가액 안분 = 종전 취득가액 × (청산금 수령액 / 권리가액)
- LTHD 미적용 가능(PDF 제5절 보유기간 기산 단서 — 인가후 사용권 미발생, 권리가액에서 분리)

**의제 양도가액 vs 실제 양도일 분리 (구현 주석 필수)**:
- APT 양도(`subject="apt"`) 케이스에서 인가전 분의 **양도가액은 권리가액으로 의제**하지만, **양도일은 실제 완공 APT 양도일**을 그대로 사용.
- LTHD 기산 종료일도 실제 양도일 — 의제 양도가액 사용과 보유기간 산정은 분리된 계산축.
- `redevelopment-split.ts` 함수 시그니처 JSDoc에 명시: `/** @param actualTransferDate - 실제 양도일 (LTHD 종료일·세율 적용 연도). 의제 양도가액(권리가액)과 분리 */`

### B. LTHD 분기별 기산 (PDF 제5절)

**B-1. 양도대상별 LTHD 적용 범위 — §95② 단서 정확 해석**

§95② 본법 단서: "조합원입주권을 양도하는 경우에는 ... 관리처분계획 인가 ... 전 토지분 또는 건물분의 양도차익으로 한정한다"

→ **입주권 양도 vs APT 양도** LTHD 적용 범위가 다름:

| 양도대상 | 인가전 분 LTHD | 인가후 기존주택분 LTHD | 청산금 분 LTHD |
|---|---|---|---|
| **입주권 양도** (사례 36~39) | ✅ 적용 (취득일~양도일, 단 원조합원만 §95② 단서 단서) | **❌ 미적용** (인가후 분 양도차익은 LTHD 대상 아님 — §95② 단서로 인가전 한정) | **❌ 미적용** (청산금 = 부동산 권리, LTHD 대상 자산 아님) |
| **APT 양도** (사례 40~46) | ✅ 적용 (취득일~양도일) | ✅ 적용 (취득일~양도일) | ✅ 적용 (관리처분 인가일~양도일, 새 취득일) |

**기산일·종료일** (APT 양도 케이스):

| 분기 | 기산일 | 종료일 | 비고 |
|---|---|---|---|
| 인가전 분 | 취득일 | 양도일 | 전체 보유기간 (3분할이어도 동일) |
| 인가후 기존주택분 | 취득일 | 양도일 | 동일 |
| 청산금 납부분 | **관리처분 인가일** | 양도일 | 새 취득일 |

**LTHD 율 적용**:
- 일반 케이스: 표1 (3년차 6%, 매년 2% 가산, 15년+ 30% 캡)
- 1세대1주택 + 거주요건 충족: 표2 (보유 40% + 거주 40% = 최대 80%) — 사례 45
- 입주권: §95② 단서 — **원조합원만** LTHD 적용. 승계조합원(`isSuccessorRightToMoveIn=true`) 미적용

### C. 1세대1주택 12억 안분 (사례 45)
- 과세대상 양도차익 = 양도차익 × (양도가액 − 12억) / 양도가액
- 분기별 3분할 후 각각 12억 안분 적용 → 합산

### D. 청산금 수령 + 1세대1주택 비과세 미충족 (사례 46)
- **시행령 §154** 1세대1주택 보유 2년 요건 **미충족** → 비과세 배제 (본법 §89가 아님 — 사용자 검토 반영)
- 양도차익 = 청산금 수령액 − 안분 취득가액 (= 종전 취득가액 × 청산금수령액/권리가액)
- **일반 LTHD 표1 + 일반 누진세율 적용** (단기 보유세율 무관 — 사례 46 실제 보유 6년 9월 = 표1 6년차 12%, 단기 1년/2년 미만 아님)
- ⚠️ 정정 사유: 이전 서술 "단기 보유세율(40~50%) 적용 가능"은 사례 46과 안 맞음. 단기 세율은 보유 1년/2년 미만 케이스에만 적용

---

## 사례 44 정확값 anchor (xlsx 추출)

```
입력:
  양도일: 2023-02-16, 취득일: 2005-04-09, 관리처분 인가일: 2009-10-23
  양도가액(완공 APT): 525,000,000
  권리가액: 219,218,500
  청산금 납부액: 92,781,500  (분양가 = 312,000,000)
  취득가액: 환산 (입력 불명)
  필요경비(인가전): 2,551,049
  토지면적: 83.2㎡

  기존부동산 주택 기준시가:
    관리처분 인가일: 132,000,000
    최초 고시: 86,000,000
    취득일:    85,034,988  (토지 81,060,995 + 건물 3,973,993)

기대값(anchor):
  인가전 환산취득가: 141,221,534  (= 권리가액 × (85,034,988/132,000,000) 근사 + 안분)
  인가전 양도차익:    75,445,917  (= 219,218,500 − 141,221,534 − 2,551,049)
  인가전 LTHD:        22,633,775  (= 75,445,917 × 30% — 17년 10월 보유 표1)
  인가후 분양가:     312,000,000  (= 219,218,500 + 92,781,500)
  인가후 양도차익:   213,000,000  (= 525,000,000 − 312,000,000)
  인가후 기존주택분 양도차익: 149,658,784  (= 213M × 219.22/312)
  인가후 기존주택분 LTHD:      44,897,635  (= 149,658,784 × 30%)
  청산금 납부분 양도차익:      63,341,216  (= 213M × 92.78/312)
  청산금 납부분 LTHD:          16,468,716  (= 63,341,216 × 26% — 13년 3월 표1)
  합계 양도차익:    288,445,917
  합계 LTHD:         84,000,126
  양도소득금액:    204,445,791
  기본공제:          2,500,000
  과세표준:        201,945,791
  산출세액:         56,799,400  ★ 핵심 anchor
  지방소득세:        5,679,940  ★
  세액합계:         62,479,340  ★
```

---

## 구현 범위

### 1. 엔진 (매트릭스 전체)

**신규/수정 파일 (800줄 정책 선제 5파일 분할 — 총 ~900줄)**:

| 파일 | 종류 | 라인 추정 | 책임 |
|---|---|---|---|
| `lib/tax-engine/types/transfer.types.ts` | 수정 | +30 | `propertyType` 에 `"redevelopment_apt"` 추가, `RedevelopmentInfo` 인터페이스 신설 |
| `lib/tax-engine/redevelopment.ts` | **신규** | ~200 | Orchestrator — 3분할 분기 라우팅, sibling 합산, finalize 입력 빌더 |
| `lib/tax-engine/redevelopment-split.ts` | **신규** | ~250 | 인가전·인가후 양도차익 3분할 (Step 1·Step 2 안분 산식) |
| `lib/tax-engine/redevelopment-lthd.ts` | **신규** | ~150 | 분기별 보유기간 기산 (취득일·관리처분일·양도일) + 표1/표2 율 산정 |
| `lib/tax-engine/redevelopment-settlement.ts` | **신규** | ~150 | 청산금 납부/수령 안분 — 분양가 산정, 권리가액/청산금 비율, 수령 시 취득가 안분 |
| `lib/tax-engine/redevelopment-valuation.ts` | **신규** | ~150 | 권리가액 환산취득가 (취득시/관리처분/최초고시/취득전기 4시점 비교 + §164⑦ 단서) |
| `lib/tax-engine/transfer-tax.ts` | 수정 | +50 | 재개발 분기 라우팅 (right_to_move_in 확장 + redevelopment_apt 신설) |
| `lib/tax-engine/transfer-tax-finalize.ts` | 수정 | +30 | 인가전·인가후 기존주택분·청산금 **LTHD 3줄 분기 emit** (산식 출력) |
| `lib/tax-engine/legal-codes/transfer.ts` | 수정 | +8 | 상수 `INCOME_TAX_§95②`, `INCOME_TAX_§89①3호`, `INCOME_TAX_§89①4호`, `INCOME_TAX_DECREE_§176조의2②2호`, `INCOME_TAX_DECREE_§164⑦`, `INCOME_TAX_DECREE_§154`, `URBAN_RENOVATION_§74` 신설. **각 상수에 `// law.go.kr 확인 2026-05-13 (소득세법 시행 2026-04-21 / 시행령 2026-04-23 / 도시정비법 2026-01-02)` 주석 동반** |

**800줄 분할 사유**: 단일 파일에 3분할 + LTHD 분기 + 청산금 안분 + 환산을 담으면 통상 800~900줄. 처음부터 sibling **5파일**(orchestrator + split + lthd + settlement + valuation)로 쪼개 git blame 보존 + 후속 PR에서 부분 변경 시 충돌 최소화. `general-building-*.ts` (valuation/extension/converted-housing) 패턴 그대로 따름.

**입력 인터페이스 추가 (transfer.types.ts)**:
```ts
export interface RedevelopmentInfo {
  managementDisposalDate: Date;           // 관리처분 인가일
  rightsValue: number;                    // 권리가액 (원)
  settlementDirection: "pay" | "receive"; // 청산금 납부/수령
  settlementAmount: number;               // 청산금 금액
  preApprovalExpenses: number;            // 인가전 분 필요경비
  originalAssetType: "land" | "housing";  // 출자 자산 (subject="apt" 시)
  // 환산 케이스 추가
  acquisitionStdPrice?: number;           // 취득시 기준시가 (주택분)
  managementDisposalStdPrice?: number;    // 관리처분 인가일 기준시가
  firstDisclosureStdPrice?: number;       // 최초 고시 기준시가
  preAcquisitionStdPrice?: number;        // 취득 전기 기준시가 (비교용)
}
```

### 2. API 변환 (14개 동기화 지점)

**수정 파일**:
- `lib/calc/transfer-tax-api.ts` — `redevelopment` 파라미터 매핑 (지점 ④)
- `lib/calc/transfer-tax-api-helpers.ts` — `buildRedevelopmentInfo()` 신규 (지점 ⑬ body spread)
- `lib/calc/transfer-tax-validate.ts` — 사례 44 필드 검증 (지점 ⑧)
- `app/api/calc/transfer/route.ts` — Zod enum 추가, `coerceDates(['managementDisposalDate'])` 추가 (지점 ⑨⑫⑭)

**Zod 스키마 추가**:
```ts
const RedevelopmentSchema = z.object({
  managementDisposalDate: z.coerce.date(),
  rightsValue: z.number().int().min(0),
  settlementDirection: z.enum(["pay", "receive"]),
  settlementAmount: z.number().int().min(0),
  preApprovalExpenses: z.number().int().min(0),
  originalAssetType: z.enum(["land", "housing"]),
  acquisitionStdPrice: z.number().int().min(0).optional(),
  managementDisposalStdPrice: z.number().int().min(0).optional(),
  firstDisclosureStdPrice: z.number().int().min(0).optional(),
  preAcquisitionStdPrice: z.number().int().min(0).optional(),
});
```

### 3. UI — 사례 44만 (APT-환산-납부-주택출자)

**수정 파일**:
- `lib/stores/calc-wizard-asset.ts` — `AssetForm` 에 `assetKind: "redevelopment_apt"` 추가 + 12개 redev 필드 (지점 ①②③)
- `components/calc/steps/AssetForm.tsx` — `RedevelopmentBlock` 신규 컴포넌트 추가 (지점 ⑤)
- `components/calc/steps/blocks/RedevelopmentBlock.tsx` — **신규**, 사례 44 입력 UI:
  - 양도대상 ToggleCard: 입주권 / 완공 APT (사례 44는 후자 강제)
  - 출자대상 ToggleCard: 토지 / 주택 (사례 44는 후자 강제)
  - 취득가액 모드: 실가 / 환산 (`useEstimatedAcquisition` 재사용)
  - 청산금 방향 RadioCardGroup: 납부 / 수령
  - 관리처분 인가일 (DateInput)
  - 권리가액·청산금 (CurrencyInput)
  - 인가전 필요경비 (CurrencyInput)
  - 환산 모드일 때: 4개 기준시가 입력 (CurrencyInput × 4)
  - 미리보기 카드 (useMemo): 인가전 환산취득가 + 분양가 + 분기별 양도차익
- `components/calc/Sidebar.tsx` — **사이드바 합계 변경 없음 / 권리가액·청산금은 추가하지 않음** (CLAUDE.md "사이드바 합계는 계산 가능한 항목만" 규칙 — 권리가액·청산금은 단일 입력 변수이지 합계가 아님). 사이드바는 양도가액·환산취득가·필요경비·양도차익만 표시. **권리가액·청산금은 RedevelopmentBlock 의 미리보기 카드 + ResultCard 분기별 출력에 노출** (지점 ⑥은 무변경, 지점 ⑤·⑦에서 처리)
- `components/calc/results/ResultCard.tsx` — 3분할 결과 카드 추가 (지점 ⑦)
- `components/calc/results/FilingFormTable.tsx` — 신고서 표에 **인가전 / 인가후 기존주택분 / 청산금 납부분** 3열 출력. **`transfer-tax-finalize.ts` 의 LTHD 분기 emit 3줄과 1:1 매칭 검증 필수** — 사용자(세무사)가 신고서에 옮길 때 LTHD 22,633,775 / 44,897,635 / 16,468,716 3줄이 finalize emit 라인 ID와 정확히 일치해야 함. 매칭 검증 anchor 1건 추가 (`expect(emit.lines.filter(l => l.code === 'LTHD').length).toBe(3)`)

### 4. Anchor 테스트

**신규 파일** `__tests__/tax-engine/transfer/redevelopment.spec.ts`:
- 사례 44 anchor 9개 (`산출세액 toBe(56_799_400)`, `지방소득세 toBe(5_679_940)`, `세액합계 toBe(62_479_340)` 핵심 3개 + 인가전 환산 141,221,534 + 인가전 양도차익 75,445,917 + 분양가 312,000,000 + LTHD 합계 84,000,126 + 양도소득금액 204,445,791 + 과세표준 201,945,791)
- 사례 36, 37, 38, 39, 40, 41, 45, 46 anchor 각 3~5개 (사례 42·43 보류, 총 24~40개)
- **환산 단서 분기 별도 anchor (사용자 제안 #4)**: 사례 44 외에 "취득시 기준시가 ≤ 취득전기 기준시가" 단서를 타는 가공 케이스 1건 — `firstDisclosureStdPrice` 대체 경로 검증
- **finalize LTHD 3줄 매칭 anchor**: `expect(emit.lthdLines.length).toBe(3)` + 각 라인 금액 toBe
- **목표**: 40~55개 anchor (사례 42·43 보류로 하향), 전체 회귀 0건

---

## 디자인 문서 (PDCA Design)

**파일**: `docs/02-design/features/transfer-redevelopment.engine.design.md` — `_template.engine.design.md` 복사 + 케이스 인벤토리 표 11행 + 환산 산식 변종 표 + LTHD 분기표 + cross-cutting matrix (1세대1주택 안분, 입주권 §95② 단서, 단기보유, 다주택 중과 — 모두 후속 PR 정책 표 명시)

**케이스 인벤토리 행 ≥ 11 (사례 36~46) 필수** — CLAUDE.md 디자인 단계 게이트.

---

## 검증 (Verification)

```bash
# 1. 엔진 anchor (사례 36~46)
npx vitest run __tests__/tax-engine/transfer/redevelopment.spec.ts

# 2. 회귀 전수 (양도세 1000+ anchor)
npx vitest run __tests__/tax-engine/transfer/

# 3. 타입 검사
npm run typecheck

# 4. 14개 동기화 지점 자가 점검
npx ui-engine-sync-checker  (또는 agent 호출)

# 5. 브라우저 수동 검증 (사례 44)
npm run dev
# /calc/transfer-tax 진입 → 자산 추가 → 재개발 APT 선택
# → 사례 44 값 입력 → 산출세액 56,799,400 / 지방세 5,679,940 / 합계 62,479,340 확인
# → Network 탭 request body 에 redevelopment 객체 포함 확인
```

**Definition of Done 체크리스트**:
- [ ] PDCA 디자인 문서 케이스 인벤토리 11행
- [ ] 사례 44 산출세액/지방세/세액합계 3개 toBe anchor 정확 일치
- [ ] 사례 36, 37, 38, 39, 40, 41, 45, 46 회귀 anchor 통과 (사례 42·43 보류 명시)
- [ ] 14개 동기화 지점 sync-checker 0건
- [ ] `npx tsc --noEmit` 0건
- [ ] 브라우저 수동 입력 → Network body 확인
- [ ] **800줄 정책: 5파일 선제 분할 (redevelopment.ts ≤ 200 / split ≤ 250 / lthd ≤ 150 / settlement ≤ 150 / valuation ≤ 150, 총 ~900줄)**
- [ ] **store 마이그레이션 등록 (`lib/stores/calc-wizard-migration.ts` version bump + 12개 redev 필드 default 부여)**
- [ ] **법령 인용 조문 번호 law.go.kr 재확인 + 확인일자 주석 (legal-codes/transfer.ts)**
  - §95② / §89①3호 / §89①4호 / 시행령 §176의2②2호 / §164⑦ / §154 / 도시정비법 §74
- [ ] **사례 42·43 anchor 보류 명시 (디자인 문서 + spec 주석)**
- [ ] **§164⑦ 단서 분기 anchor 1건 (사례 44 외 가공 케이스, `acquisitionDate < firstDisclosureDate` 트리거)**
- [ ] **§95③·시행령 §160 상수 추가 (사례 45 12억 안분 위임 근거)**
- [ ] **빈집소규모정비법 §29 슬롯 — `approvalLawBasis` 식별자 사전 도입 + 타입 테스트**
- [ ] **청산금 수령 `settlementSaleDate` 필드 분리 (소유권이전 고시일 다음날 = LTHD 종료일, NTS 집행기준 + 소법 §95④)**
- [ ] **환산취득가 rounding 모드 명시 (`acquisitionRounding`, 기본 `floor`) + 사례 44 손계산 anchor 확정**
- [ ] **시행령 §166 (재개발/재건축 양도차익 산정 본문) 인용 — `§166`, `§166②1호`, `§166⑤` 3개 상수 추가**
  - §166①1호·①2호 (입주권 양도)
  - §166②1호 (APT 양도 — 사례 44 핵심 본문)
  - §166③ (환산취득가)
  - §166⑤1호·2호 (LTHD 보유기간 분기 — 입주권/APT 구분)
- [ ] **LawArticleModal 배지 4위치 (④ violet 카드 + ⑤ rose 카드 + ⑦ 결과카드 헤더 + 결과카드 분기별)**
- [ ] **사례 44 mock 데이터 취득일 명시** (2005-04-09 → 보유 17년 10개월 출처 자기설명)
- [ ] **Zod refine 4건** (수령 시 SaleDate / apt+originalAssetType / 환산 기준시가 쌍 / §164⑦ 트리거)
- [ ] **B-1: `postApprovalExpenses` 필드 추가** (인가후 분 필요경비, 기본 0) + AssetForm.expenses 매핑 정책 명시
- [ ] **B-2: 사례 46 본 PR 범위 = 과세 산출 anchor만**. 시행령 §154 비과세 자동 판정은 후속 PR
- [ ] **B-3: 청산금 수령 LTHD 근거 표기 — §166⑤ 직접 명시 없음 / 본법 §95④ + NTS 집행기준 조합**으로 도출 명시
- [ ] **B-4: §160 12억 안분 적용 단위 = 합계 양도차익에 1회 적용** (UI 분기 표시는 동일 비율 분배)
- [ ] **B-5: §166④2호 분기 본 PR 미지원** (`rightsValue > 0` validate 강제) — 후속 PR로 분리
- [ ] **C-1: 테스트 파일 sibling 3분할** (`redevelopment/right.spec.ts` / `apt-land.spec.ts` / `apt-housing.spec.ts` + `_helpers.ts` fixture)
- [ ] **C-2: valuation.ts 라인 추정 갱신** (150 → ~220, 5파일 총합 ~970줄, 각 파일 ≤ 250 안전)
- [ ] **C-3: §166③ 1차 근거 + §176의2②2호 보조 근거** 산식 인용 명시 (재개발 전용 vs 일반 부동산 매핑)
- [ ] **C-4: LTHD 분배법칙 산술 동일성** 명시 — 묶음(§166⑤2호나목)·분기별 산출 두 방식 같은 결과 (사례 44 84,000,126 검증)
- [ ] **finalize LTHD 3줄 emit ↔ FilingFormTable 3열 1:1 매칭 anchor**
- [ ] **의제 양도가액 vs 실제 양도일 분리 주석 (redevelopment-split.ts JSDoc)**

---

## 후속 PR (이번 PR 범위 외 — 디자인 문서에 명시)

| 후속 항목 | 사유 |
|---|---|
| 사례 36~43 UI 노출 (입주권 양도·APT 토지출자) | 본 PR은 사례 44 UI 만 |
| 1세대1주택 12억 안분 통합 (사례 45) | 기존 housing 분기와 cross-cutting — 별도 PR |
| 보유 2년 미충족 비과세 (사례 46) | 시행령 §154 (1세대1주택 보유 요건) cross-cutting — 본법 §89② 아님 |
| 다주택 중과 배제 (재개발 입주권) | §104⑦ 단서 — 별도 정책 매트릭스 |
| 분양권→입주권 전환 LTHD | §95② 추가 단서 |
| 권리가액 토지·건물 분리 평가 (PDF 제7절) | 자산-수준 분리 회계, 사례 44 범위 외 |

---

## 핵심 파일 경로 (Critical Files)

**Engine**:
- `lib/tax-engine/types/transfer.types.ts:79` — propertyType enum
- `lib/tax-engine/transfer-tax.ts` — orchestrator (재개발 분기 추가)
- `lib/tax-engine/transfer-tax-finalize.ts` — 산식 emit (LTHD 3줄 분기)
- `lib/tax-engine/redevelopment.ts` (신규 — Orchestrator)
- `lib/tax-engine/redevelopment-split.ts` (신규 — 3분할 양도차익)
- `lib/tax-engine/redevelopment-lthd.ts` (신규 — 분기별 보유기간·율)
- `lib/tax-engine/redevelopment-settlement.ts` (신규 — 청산금 안분)
- `lib/tax-engine/redevelopment-valuation.ts` (신규 — 환산취득가)

**API**:
- `app/api/calc/transfer/route.ts`
- `lib/calc/transfer-tax-api.ts`
- `lib/calc/transfer-tax-api-helpers.ts`
- `lib/calc/transfer-tax-validate.ts`

**UI**:
- `lib/stores/calc-wizard-asset.ts:52` — assetKind enum
- `components/calc/steps/AssetForm.tsx`
- `components/calc/steps/blocks/RedevelopmentBlock.tsx` (신규)

**Reference patterns (재사용)**:
- 환산취득가 패턴: `commercial-building-valuation.ts`, `general-building-valuation.ts`
- 자산-수준 블록 패턴: `general-building-extension.ts` + AssetForm gb* 필드
- 14개 동기화 지점 체크리스트: `CLAUDE.md` Definition of Done
