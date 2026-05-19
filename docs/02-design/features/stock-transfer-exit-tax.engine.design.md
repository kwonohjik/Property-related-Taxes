# 국외전출세·해외주식 양도소득세 — 엔진 설계

> 작성일: 2026-05-19
> 법령 기준: 소득세법 2026.4.21. 시행 / 시행령 2026.4.23. 시행 (계획서 KoreanLaw MCP 검증 계승)
> 코드 구현: 0 (설계 문서 전용)
> 계획서 참조: `docs/00-pm/stock-transfer-exit-tax-foreign-stock.plan.md`

---

## 1. 개요·범위

### 1.1 두 PR 분리

| 구분 | PR-4A — 해외주식 양도소득세 | PR-4B — 국외전출세 |
|---|---|---|
| 근거 | §94①3다목 + §118의2~§118의8 | §118의9~§118의16 |
| 납세자 | 5년 이상 거주자 (국외자산 양도) | 5년+대주주 요건 충족 → 출국 시 간주양도 |
| 과세 시점 | 실제 양도일 | 출국일 (간주양도) |
| 세율 근거 | §118의5 → §55① 준용 | §118의11 별치 계산식 |
| 기본공제 | §118의7 — 연 250만 (§103·§118의10④와 별도 그룹) | §118의10④ — 연 250만 (§103·§118의7과 별도 그룹) |
| 구현 순서 | 선행 (PR-4A) | 후행 (PR-4B, PR-4A 완료 후) |

**PR-4A 선행 이유**: 해외주식은 기존 엔진 흐름(양도가→필요경비→양도차익→기본공제→세율) 재사용 가능. 국외전출세는 간주양도·납부유예·조정공제 등 고유 흐름이 근본적으로 다름.

### 1.2 스코프 내

- **PR-4A**: §94①3다목 거주자의 해외주식 양도 — 실거래가·환율 환산(§178의5)·§118의5 누진세율·§118의6 외국납부세액공제·§118의7 기본공제
- **PR-4B**: §118의9 요건 충족 출국 시 간주양도 — 출국일 시가(§178의9)·§118의11 세율·납부유예(5/10년)·조정공제(§118의12)·외국납부세액공제(§118의13)·§118의14 비거주자 세액공제·보유현황 신고 가산세(§118의15)

### 1.3 스코프 외 (후속 PR 또는 영구 제외)

| 항목 | 이유 |
|---|---|
| §94①3다목 내국법인 해외상장 DR (§157의3②2호 FS-02) | 계획서 §1.3 스코프 외 ↔ §3.1 FS-02 스코프 내 모순 → **PR-4A 스코프 외로 확정. 후속 PR 이관** <!-- 검토 정정 2026-05-19: §1.3 스코프 외 기준으로 FS-02를 후속으로 통일 --> |
| §118의2⑤ 국외 기타자산 (회원권·부동산 관련) | 부동산 도메인 분리 |
| §57 외국납부세액공제 (종합소득 연계) | 별도 정산 프로세스 |
| 조세조약 적용 (미국·일본·중국 등) | 조약별 세율·면제 다양, 별도 조약 DB 필요 |
| §94①4 해외 부동산과다보유법인 주식 | 시가 산정 복잡, 후속 PR |
| §94①4다·라목 기타자산 (국외전출세 §118의9 과세 대상 포함) | v1 스코프 외, 비상장 과점주주 §165④ 보충평가 필요 |

---

## 2. 법령 근거 인용표

> KoreanLaw MCP 검증 완료 (계획서 계승, 24개 조문 전수 실존 확인)

### 2.1 해외주식 양도소득세 (PR-4A)

| 조문 | 제목 | 핵심 내용 |
|---|---|---|
| 소득세법 §94①3다목 | 양도소득의 범위 | 외국법인 발행 또는 외국 시장 상장 주식등 |
| 시행령 §157의3 | 국외주식 등의 범위 | ①외국법인 발행 주식(증권시장 상장분·§178의2④ 제외) ②내국법인 해외증권시장 상장 주식(DR 포함) — FS-02(②2호 DR)는 후속 PR |
| 소득세법 §118의2 | 국외자산 양도소득의 범위 | 양도일까지 **5년 이상** 국내 주소·거소 거주자만. 환차익 제외 단서. **§94①3다목이 §118의2 열거 소득에 명시되어 있지 않아 §118의2~§118의8 직접 적용 여부 재확인 필요 — Do 진입 전 §104①12호 해외주식 전용 세율 조문과의 관계 확인 필수** <!-- 검토 정정 2026-05-19: R1-03 계승 --> |
| 소득세법 §118의3 | 국외자산 양도가액 | 실지거래가액. 불명 시 소재국 시가 → §178의3 보충 |
| 소득세법 §118의4 | 필요경비 계산 | 취득가액(실가·불명 시 §178의3 시가) + 자본적지출 + 양도비. 외화 환산은 §178의5 위임 |
| 시행령 §178의3 | 시가 산정 | 순서: ①외국정부 평가가액 → 없으면 ②~④. **§178의3①단서: §157의3 주식은 ②(실거래)·③(감정)·④(보상) 배제 → ①없으면 §178의3②2호(상증법§63 준용, "이전·이후 각 2월"→"양도일·취득일 이전 1월"로 대체) 직행**. §94①4나목 자산은 다목·라목 주식에 한정하는 괄호 단서 포함 |
| 시행령 §178의5 | 외화환산 | 양도가액·필요경비: 수령·지출일 현재 외국환거래법 기준환율 또는 재정환율 적용. 취득일·양도일 **별도** 환율 적용 |
| 소득세법 §118의5 | 세율 | §55①(종합소득세 누진) **단일 준용**. §118의5①각호(1~3호) 삭제 — §55① 준용 구조. **확정: 6~45% 8구간, 누진공제 0~65,940,000 (stock-rate-tables.ts `BASIC_PROGRESSIVE_BRACKETS` 재사용)** <!-- 세율 환각 정정 2026-05-19 R3 --> |
| 소득세법 §118의6 | 외국납부세액공제 | 세액공제(한도 = 산출세액 × B/C) 또는 필요경비 산입 **선택**. §178의7 위임 |
| 시행령 §178의7 | 외국납부세액 범위 | 외국정부 과세 세액 + 부가세액. 확정신고(예정신고 포함) 기한 내 신청 |
| 소득세법 §118의7 | 기본공제 | 연 250만원. §103①(국내주식 그룹)·§118의10④(국외전출세 그룹)와 **별도 그룹** |
| 소득세법 §118의8 | 준용규정 | §95 준용 단서: "**장기보유특별공제액은 공제하지 아니한다**" — 국외자산 LTHD 미적용 명문 |

### 2.2 국외전출세 (PR-4B)

| 조문 | 제목 | 핵심 내용 |
|---|---|---|
| 소득세법 §118의9 | 출국 시 납세의무 | 요건: ①출국일 전 10년 중 5년 이상 국내 주소·거소 ②직전 연도말 대주주(§178의8 → §167의8 준용). 대상: §94①3가·나목 + §94①4다·라목 |
| 시행령 §178의8 | 대주주의 범위 | §167의8①각호 준용. 비상장: 지분 4% 이상 또는 시총 10억 이상(벤처 40억). 상장: §167의8①1호 → 시총 50억 또는 지분율 기준 |
| 시행령 §167의8 | 대주주 기준 (본문) | 비상장: 직전 사업연도말 지분 4% 이상 또는 시총 10억 이상 |
| 소득세법 §118의10 | 과세표준 계산 | 양도가액 = 출국일 시가(§178의9). 필요경비 = §97 준용. 기본공제 연 250만원(④항). 종합소득·§92② 양도소득과 구분 계산 |
| 시행령 §178의9 | 출국일 시가 | ①원칙: 출국일 당시 **거래가액**. ②불명 시 — 상장: §99①3·5·6 기준시가. 비상장: 출국일 **전후 각** 3개월 이내 매매사례가액 → 없으면 §99①4~6 기준시가 |
| 소득세법 §118의11 | 세율·산출세액 | §104①11가목2) 준용. **확정: 3억 이하 20% / 초과 25%(누진공제 15,000,000)** (stock-rate-tables.ts `STOCK_MAJOR_PROGRESSIVE_BRACKETS` 재사용) <!-- 세율 환각 정정 2026-05-19 R3 --> |
| 소득세법 §118의12 | 조정공제 | 실양도가액 < 출국일 시가 시: 산출세액 × (출국일 양도가 − 실양도가) / 출국일 양도차익 |
| 소득세법 §118의13 | 외국납부세액공제 | 한도: 산출세액 − 조정공제액. **§118의13②적용 배제 사유**: 1호 — 외국정부가 출국세 산출세액에 대해 외국납부세액공제를 허용하는 경우, 2호 — 외국정부가 취득가액을 출국일 시가로 조정해주는 경우 (계획서 R1-05: 1호 누락 정정 계승) |
| 소득세법 §118의14 | 비거주자 세액공제 | 실양도 후 §119①11 비거주자 과세 시 §156①7 원천징수액을 산출세액−조정공제 한도로 공제 |
| 소득세법 §118의15 | 신고·납부·가산세 | 납세관리인·보유현황: 출국일 전날까지 신고. **보유현황 작성 기준일: 신고일의 전날** (①후단). 과세표준: 출국월 말일+3개월. 보유현황 미신고 가산세: 출국일 전날 액면금액(무액면: 자본금÷발행총수) 또는 출자가액 × 2%. 경정청구 근거: **§118의15⑤** (실양도일로부터 2년 이내 — §178의10은 신청서 제출 절차, 기한 귀속 조문은 §118의15⑤임) |
| 소득세법 §118의16 | 납부유예 | 납세담보 또는 납세관리인 요건 충족 시 신청. 원칙 5년 (국외유학 등 대통령령 사유 시 10년). 5년 내 미양도 시 5년째 말일+3개월 납부. 유예기간 이자상당액 가산 |
| 시행령 §178의10 | 세액공제 신청 절차 | 조정공제·외국납부세액공제·비거주자 세액공제 신청서 제출: 실양도일로부터 2년 이내 |

---

## 3. 케이스 매트릭스

### 3.1 해외주식 양도소득세 케이스 인벤토리 (PR-4A)

| # | ID | 시나리오 | 법령 근거 | anchor 출처 | 상태 |
|---|---|---|---|---|---|
| 1 | FS-01 | 미국 NYSE 상장 외국법인 주식 실가 양도 (기본) | §94①3다목, §157의3①1호 | FS-anchor-01 자가검증 (§55① 확정 후) | ☐ Do 진입 전 세율 확정 필수 |
| 2 | FS-02 | 해외증권시장 상장 내국법인 DR | §157의3②2호 | — | **후속 PR 이관 (스코프 외 확정)** |
| 3 | FS-03 | 외국법인 주식 취득가액 불명 → §178의3②2호 시가 보충 | §118의3, §178의3 | 자가검증 | ☐ TODO |
| 4 | FS-04 | 외국납부세액 공제 한도 계산 (세액공제 선택) | §118의6, §178의7 | FS-anchor-02 자가검증 | ☐ Do 진입 전 세율 확정 필수 |
| 5 | FS-05 | 외국납부세액 필요경비 산입 선택 | §118의6 | 자가검증 | ☐ TODO |
| 6 | FS-06 | 5년 미만 거주자 — §118의2 납세의무 없음 (과세 제외) | §118의2 | 자가검증 (세액=0) | ☐ TODO |
| 7 | FS-07 | 동일 과세기간 국내주식 + 해외주식 동시 양도 — 기본공제 그룹 분리 | §103①2호(국내) vs §118의7(국외) | 자가검증 | ☐ TODO |
| 8 | FS-08 | 해외주식 양도손실 (양도가 < 취득가) | §118의8 §100 준용 | 자가검증 (세액=0) | ☐ TODO |
| 9 | FS-09 | 해외 비상장 외국법인 주식 (장외 매매) | §157의3①1호, §178의3 | 자가검증 | ☐ TODO |
| 10 | FS-10 | 환율 취득일·양도일 별도 적용 (양도차익 계산) | §178의5 | FS-anchor-01에 포함 | ☐ Do 진입 전 세율 확정 필수 |

### 3.2 국외전출세 케이스 인벤토리 (PR-4B)

| # | ID | 시나리오 | 법령 근거 | anchor 출처 | 상태 |
|---|---|---|---|---|---|
| 1 | ET-01 | 5년 이상 거주 상장 대주주 즉시 납부 (기본) | §118의9, §118의11 | ET-anchor-01 자가검증 (§118의11 확정 후) | ☐ Do 진입 전 세율 확정 필수 |
| 2 | ET-02 | 납부유예 5년 내 실제 양도 → 조정공제 + 외국납부세액공제 | §118의12, §118의13, §118의16 | ET-anchor-02 자가검증 | ☐ Do 진입 전 세율 확정 필수 |
| 3 | ET-03 | 납부유예 5년 경과 미양도 → 말일+3개월 납부 | §118의16 | 자가검증 | ☐ TODO |
| 4 | ET-04 | 국외유학 사유 납부유예 10년 연장 | §118의16 + 시행령 사유 | 자가검증 | ☐ TODO |
| 5 | ET-05 | 실양도가 < 출국일 시가 → 조정공제 (§118의12) | §118의12 | ET-anchor-02 | ☐ Do 진입 전 세율 확정 필수 |
| 6 | ET-06 | 외국 실양도 후 외국납부세액 → §118의13①공제 | §118의13 | 자가검증 | ☐ TODO |
| 7 | ET-07 | §118의13②1호: 외국이 산출세액 공제 허용 → §118의13 적용 배제 | §118의13②1호 | 자가검증 (외국납부세액공제=0) | ☐ TODO |
| 8 | ET-08 | §118의13②2호: 외국이 취득가액을 출국일 시가로 조정 → §118의13 적용 배제 | §118의13②2호 | 자가검증 | ☐ TODO |
| 9 | ET-09 | 실양도 후 §119①11 비거주자 과세 → §118의14 원천징수액 공제 | §118의14 | 자가검증 | ☐ TODO |
| 10 | ET-10 | 보유현황 미신고 가산세 (액면금액 2%) | §118의15 | 자가검증 | ☐ TODO |
| 11 | ET-11 | 5년 미만 거주 → §118의9 비해당 (과세 제외) | §118의9①1호 | 자가검증 (세액=0) | ☐ TODO |
| 12 | ET-12 | 비상장 주식 출국일 시가: 매매사례 없음 → §99①4 기준시가 | §178의9②2호나목 | 자가검증 | ☐ TODO |
| 13 | ET-13 | 상장·비상장 혼합 보유 출국 — 종목별 별도 계산 후 합산 | §118의10 | 자가검증 | ☐ TODO |

---

## 4. 파일 분할 계획

### 4.1 신규 파일 구조

```
lib/tax-engine/stock-transfer/
  foreign-stock.ts                ← PR-4A: §118의2~§118의8 순수 함수 메인 흐름 (350~450줄)
  foreign-stock-rate.ts           ← §118의5 → §55① 누진세율 + 지방소득세 (80~120줄)
  exit-tax.ts                     ← PR-4B: §118의9~§118의16 메인 흐름 (400~500줄)
  exit-tax-valuation.ts           ← 출국일 시가 산정 §178의9 상장/비상장 분기 (150~200줄)
  exit-tax-deferred.ts            ← 납부유예·조정공제·가산이자 계산 (200~280줄)
  types/
    foreign-stock.types.ts        ← ForeignStockInput / ForeignStockResult
    exit-tax.types.ts             ← ExitTaxInput / ExitTaxHolding / ExitTaxResult
```

### 4.2 기존 파일 영향

| 파일 | 변경 내용 |
|---|---|
| `stock-classification.ts` | `taxCategory` 결과 타입에 `"foreign_stock"` / `"exit_tax"` 추가. `out_of_scope_foreign` 분기를 `foreign_stock` 분기로 교체 (PR-4A 완료 시점). `isForeignTaxCategory()` 헬퍼 신규 추가 |
| `types/stock-transfer.types.ts` | `StockTransferResult.taxCategory` enum 확장 (2종 추가) |
| `stock-transfer-tax.ts` | orchestrator 분기: `marketType === "foreign_stock"` 시 `calculateForeignStock()` 위임. `"exit_tax"` 시 `calculateExitTax()` 위임 |
| `lib/calc/stock-transfer-tax-validate.ts` | `"foreign_stock"` / `"exit_tax"` 분기 추가. 현재 791줄 — **PR-4A 착수 전 `validate-foreign.ts` 분리 필요 (800줄 정책 위반 임박)** |

### 4.3 orchestrator 분기 추가 위치 (stock-transfer-tax.ts)

```typescript
// 기존 marketType 분기 끝 (other_asset 이후)
if (input.marketType === "foreign_stock") {
  return calculateForeignStock(input as ForeignStockInput);
}
if (input.marketType === "exit_tax") {
  return calculateExitTax(input as ExitTaxInput);
}
```

---

## 5. 타입 변경

### 5.1 taxCategory enum 확장

현재 `StockTransferResult.taxCategory`:
```
"listed_major" | "listed_otc_non_major" | "listed_off_market_non_major"
| "listed_non_major_in_market" | "unlisted_major" | "unlisted_non_major"
| "other_asset" | "kotc_sme_mid_exempt" | "kotc_venture_exempt"
| "out_of_scope_foreign"
```

PR-4A 완료 후 추가:
```
| "foreign_stock"     ← §94①3다목 해외주식 (out_of_scope_foreign 대체)
```

PR-4B 완료 후 추가:
```
| "exit_tax"          ← §118의9 국외전출세
```

**주의**: `isMajorTaxCategory()` 헬퍼가 substring `includes("major")` 사용하지 않는지 확인 (`feedback_enum_substring_match_forbidden`). `isForeignTaxCategory(c)` 신규 헬퍼 추가:
```typescript
export function isForeignTaxCategory(c: string): boolean {
  return c === "foreign_stock" || c === "exit_tax";
}
```

### 5.2 ForeignStockInput 타입 (PR-4A) — `types/foreign-stock.types.ts`

```typescript
export type ForeignStockInput = {
  // ── 납세의무 요건 ──
  yearsResidentInKorea: number;          // §118의2: 5년 이상 확인용 (만 년 수)

  // ── 자산 분류 ──
  /** §157의3①1호: 외국법인 발행 주식 */
  isListedForeignCorp: boolean;
  stockName: string;                     // 종목명 (표시용)
  countryCode: string;                   // ISO 2자리 국가코드 (외국납부세액 국가 확인)

  // ── 양도 정보 ──
  shareCount: number;                    // 주수 (정수)
  transferDate: Date;
  transferPriceMode: "per_share" | "total";
  /** 1주당 외화 양도단가 (transferPriceMode="per_share") */
  perShareTransferPriceForeign?: number;
  /** 총 외화 양도가액 (transferPriceMode="total") */
  totalTransferPriceForeign?: number;
  transferCurrencyCode: string;          // "USD" | "JPY" | "EUR" | "HKD" | "CNY" | "GBP" | "OTHER"
  transferExchangeRate: number;          // 양도일 기준환율 (원/외화). §178의5

  // ── 취득 정보 ──
  acquisitionDate: Date;
  acquisitionMode: "actual" | "market_price"; // 실가 또는 §178의3 시가 산정
  /** 1주당 외화 취득단가 (acquisitionMode="actual") */
  perShareAcquisitionPriceForeign?: number;
  acquisitionCurrencyCode: string;
  acquisitionExchangeRate: number;       // 취득일 기준환율. §178의5

  // ── 필요경비 (외화) ──
  capitalExpenditureForeign: number;     // 자본적지출액 (§118의4)
  transferCostForeign: number;           // 양도비 (§118의4)

  // ── 외국납부세액 (§118의6) ──
  hasForeignTax: boolean;
  foreignTaxPaidForeign?: number;        // 외국에서 납부한 세액 (외화)
  foreignTaxCurrencyCode?: string;
  foreignTaxExchangeRate?: number;       // 납세일 기준환율
  foreignTaxMethod: "credit" | "expense"; // §118의6 선택

  // ── 기타 ──
  isElectronicFiling: boolean;
};
```

### 5.3 ForeignStockResult 타입 (PR-4A)

```typescript
export type ForeignStockResult = {
  taxCategory: "foreign_stock" | "out_of_scope" | "not_liable"; // not_liable: 5년 미만 거주
  isLiable: boolean;                     // §118의2 납세의무 충족 여부
  ineligibleReason?: string;             // 비해당 사유 설명

  // ── 양도가액 (원화 환산) ──
  transferPriceKrw: number;              // 양도가액 원화 (환율 환산 후)
  acquisitionPriceKrw: number;           // 취득가액 원화
  necessaryExpensesKrw: number;          // 자본적지출 + 양도비 원화
  transferGain: number;                  // 양도차익 (음수 가능)
  basicDeduction: number;                // §118의7 기본공제
  taxBase: number;                       // 과세표준

  // ── 세율 적용 ── <!-- 세율 환각 정정 2026-05-19 R3 -->
  /** §55① 6~45% 8구간 확정 (stock-rate-tables.ts BASIC_PROGRESSIVE_BRACKETS) */
  incomeTax: number;                     // 산출세액
  localIncomeTax: number;                // 지방소득세 (10원 미만 절사)

  // ── 외국납부세액공제 ──
  foreignTaxCreditLimit?: number;        // 공제한도 (세액공제 선택 시)
  foreignTaxCreditApplied?: number;      // 실제 공제액
  foreignTaxExpenseApplied?: number;     // 필요경비 산입액 (필요경비 선택 시)

  // ── 최종 ──
  finalTax: number;                      // 최종 납부세액 (산출세액 − 공제)
  finalLocalTax: number;

  // ── 산식 echo (결과 카드 표시용) ──
  transferExchangeRate: number;
  acquisitionExchangeRate: number;
  foreignTaxExchangeRate?: number;
};
```

### 5.4 ExitTaxInput 타입 (PR-4B) — `types/exit-tax.types.ts`

```typescript
export type ExitTaxInput = {
  // ── 거주자 요건 (§118의9①1호) ──
  yearsResidentLast10: number;           // 출국일 전 10년 중 국내 거주 합계 (5년 이상 필수)
  departureDate: Date;                   // 출국일

  // ── 대주주 요건 (§178의8 → §167의8) ──
  isMajorShareholder: boolean;           // 직전 연도말 기준 대주주 여부

  // ── 보유 주식 (종목별 다건) ──
  holdings: ExitTaxHolding[];

  // ── 납부유예 (§118의16) ──
  deferralRequested: boolean;
  deferralReason: "none" | "study_abroad" | "other_10yr"; // 10년 연장 사유

  // ── 납부유예 후 실제 양도 (경정청구용 입력) ──
  actualTransferDate?: Date;             // 실제 양도일
  actualTransferPricePerShare?: number;  // 실제 양도단가 (원화)

  // ── 외국납부세액 (§118의13) ──
  foreignTaxPaid?: number;              // 외국 실양도 후 납부세액 (원화 환산)
  /**
   * §118의13②적용 배제 사유
   * "none"          = 배제 사유 없음 → §118의13①공제 적용
   * "credit_allowed" = 1호: 외국정부가 산출세액에 대해 공제 허용
   * "step_up"       = 2호: 외국정부가 취득가액을 출국일 시가로 조정
   */
  foreignTaxExclusionReason: "none" | "credit_allowed" | "step_up";

  // ── §118의14 비거주자 세액공제 ──
  domesticSourceTaxWithheld?: number;   // §156①7 원천징수액

  // ── 보유현황 신고 ──
  hasFiledHoldingsReport: boolean;      // 보유현황 출국 전날까지 신고 여부
};

export type ExitTaxHolding = {
  id: string;                            // UI key (nanoid)
  stockName: string;
  marketType: "kospi" | "kosdaq" | "konex" | "unlisted";
  shareCount: number;
  acquisitionDate: Date;                 // **배열 내 Date — route handler에서 map 변환 필수** <!-- 검토 정정 2026-05-19: R2-04 계승 -->
  perShareAcquisitionPrice: number;     // 취득가액 (원화)
  // ── 출국일 시가 (§178의9) ──
  departureDayValuationMode: "market_price" | "prior_year_std" | "unlisted_sample" | "unlisted_std";
  departureDayMarketPrice?: number;     // 출국일 거래가액 (§178의9①)
  priorYearEndMonthAvg?: number;        // §99①3 기준시가 (상장 시가 불명)
  unlistedSamplePrice?: number;         // 비상장 매매사례가액 (전후 각 3개월)
  unlistedStdPricePerShare?: number;    // §99①4 비상장 기준시가 (매매사례 없음)
};
```

### 5.5 ExitTaxResult 타입 (PR-4B)

```typescript
export type ExitTaxResult = {
  taxCategory: "exit_tax" | "not_liable";
  isLiable: boolean;                    // §118의9 요건 충족 여부
  ineligibleReason?: string;

  // ── 종목별 계산 결과 ──
  holdingDetails: ExitTaxHoldingResult[];

  // ── 합산 과세표준 ──
  totalTransferGain: number;            // 전체 양도차익 합산
  basicDeduction: number;               // §118의10④ 250만
  taxBase: number;                      // 과세표준

  // ── §118의11 산출세액 (§104①11가목2) 20%/25% 확정) ── <!-- 세율 환각 정정 2026-05-19 R3 -->
  incomeTax: number;
  localIncomeTax: number;

  // ── 납부유예 ──
  deferralYears: number;                // 5 또는 10
  deferredTaxAmount: number;            // 유예 세액
  deferralInterestNote: string;         // "납부유예 이자상당액은 실제 납부 시 별도 계산"

  // ── 경정청구 (실양도 후) ──
  adjustmentDeduction?: number;         // §118의12 조정공제액
  foreignTaxCreditApplied?: number;     // §118의13 외국납부세액공제액
  domesticTaxCreditApplied?: number;    // §118의14 공제액
  finalTaxAfterAdjustment?: number;     // 경정 후 최종 세액

  // ── 가산세 ──
  holdingsReportPenalty?: number;       // §118의15 보유현황 미신고 가산세
};

export type ExitTaxHoldingResult = {
  id: string;                           // ExitTaxHolding.id 참조
  stockName: string;
  departureDayValue: number;            // 출국일 시가 × 주수
  acquisitionCost: number;              // 취득가액 합계
  transferGain: number;                 // 양도차익 (종목별)
};
```

---

## 6. Zod 입력 객체 정의 (14지점 ⑫)

### 6.1 PR-4A Zod schema (`app/api/calc/stock-transfer/route.ts` 또는 별도 `schemas/foreign-stock.schema.ts`)

```typescript
export const ForeignStockInputSchema = z.object({
  yearsResidentInKorea: z.number().int().min(0),
  isListedForeignCorp: z.boolean(),
  stockName: z.string().min(1),
  countryCode: z.string().length(2),
  shareCount: z.number().int().positive(),
  transferDate: z.string(),             // ISO string — route handler에서 toDate()
  transferPriceMode: z.enum(["per_share", "total"]),
  perShareTransferPriceForeign: z.number().min(0).optional(),
  totalTransferPriceForeign: z.number().min(0).optional(),
  transferCurrencyCode: z.string(),
  transferExchangeRate: z.number().positive(),
  acquisitionDate: z.string(),          // ISO string
  acquisitionMode: z.enum(["actual", "market_price"]),
  perShareAcquisitionPriceForeign: z.number().min(0).optional(),
  acquisitionCurrencyCode: z.string(),
  acquisitionExchangeRate: z.number().positive(),
  capitalExpenditureForeign: z.number().min(0),
  transferCostForeign: z.number().min(0),
  hasForeignTax: z.boolean(),
  foreignTaxPaidForeign: z.number().min(0).optional(),
  foreignTaxCurrencyCode: z.string().optional(),
  foreignTaxExchangeRate: z.number().positive().optional(),
  foreignTaxMethod: z.enum(["credit", "expense"]),
  isElectronicFiling: z.boolean(),
}).superRefine((d, ctx) => {
  if (d.transferPriceMode === "per_share" && d.perShareTransferPriceForeign == null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "1주당 양도가액 필수" });
  }
  if (d.transferPriceMode === "total" && d.totalTransferPriceForeign == null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "총 양도가액 필수" });
  }
  if (d.hasForeignTax && d.foreignTaxPaidForeign == null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "외국납부세액 입력 필수" });
  }
});
```

### 6.2 PR-4B Zod schema

```typescript
export const ExitTaxHoldingSchema = z.object({
  id: z.string(),
  stockName: z.string().min(1),
  marketType: z.enum(["kospi", "kosdaq", "konex", "unlisted"]),
  shareCount: z.number().int().positive(),
  acquisitionDate: z.string(),          // ISO — route handler에서 배열 map toDate()
  perShareAcquisitionPrice: z.number().min(0),
  departureDayValuationMode: z.enum(["market_price", "prior_year_std", "unlisted_sample", "unlisted_std"]),
  departureDayMarketPrice: z.number().min(0).optional(),
  priorYearEndMonthAvg: z.number().min(0).optional(),
  unlistedSamplePrice: z.number().min(0).optional(),
  unlistedStdPricePerShare: z.number().min(0).optional(),
});

export const ExitTaxInputSchema = z.object({
  yearsResidentLast10: z.number().int().min(0),
  departureDate: z.string(),            // ISO — route handler toDate()
  isMajorShareholder: z.boolean(),
  holdings: z.array(ExitTaxHoldingSchema).min(1),
  deferralRequested: z.boolean(),
  deferralReason: z.enum(["none", "study_abroad", "other_10yr"]),
  actualTransferDate: z.string().optional(),
  actualTransferPricePerShare: z.number().min(0).optional(),
  foreignTaxPaid: z.number().min(0).optional(),
  foreignTaxExclusionReason: z.enum(["none", "credit_allowed", "step_up"]),
  domesticSourceTaxWithheld: z.number().min(0).optional(),
  hasFiledHoldingsReport: z.boolean(),
});
```

---

## 7. 계산 알고리즘

### 7.1 PR-4A 해외주식 계산 흐름 (`foreign-stock.ts`)

```
STEP 1: 납세의무 확인
  yearsResidentInKorea >= 5 → 납세의무 있음
  미충족 → { taxCategory: "not_liable", isLiable: false } 즉시 반환

STEP 2: 양도가액 원화 환산 (§178의5)
  transferPriceKrw = (shareCount × perShareTransferPriceForeign) × transferExchangeRate
  (또는 totalTransferPriceForeign × transferExchangeRate)

STEP 3: 취득가액 원화 환산
  acquisitionMode="actual":
    acquisitionPriceKrw = shareCount × perShareAcquisitionPriceForeign × acquisitionExchangeRate
  acquisitionMode="market_price":
    §178의3 시가 산정 → 외국정부 평가 → 없으면 §178의3②2호(상증법§63 준용, 이전 1월 평균)

STEP 4: 필요경비 원화 환산
  capitalExpenditureKrw = capitalExpenditureForeign × transferExchangeRate  (지출일 기준 환율)
  transferCostKrw = transferCostForeign × transferExchangeRate
  ※ 외국납부세액 필요경비 산입 선택 시 foreignTaxExpenseKrw 추가 포함

STEP 5: 양도차익
  transferGain = transferPriceKrw − acquisitionPriceKrw − necessaryExpensesKrw

STEP 6: 기본공제 (§118의7)
  basicDeduction = min(2_500_000, transferGain)  // 손실 시 0

STEP 7: 과세표준
  taxBase = max(0, transferGain − basicDeduction)
  ※ LTHD 미적용 (§118의8 단서)

STEP 8: §55① 누진세율 적용 (§118의5) <!-- 세율 환각 정정 2026-05-19 R3 -->
  incomeTax = calculateProgressiveTax(taxBase, BASIC_PROGRESSIVE_BRACKETS)
  // §55① 6~45% 8구간 확정 — stock-rate-tables.ts BASIC_PROGRESSIVE_BRACKETS 재사용

STEP 9: 외국납부세액공제 (§118의6, foreignTaxMethod="credit")
  foreignTaxCreditLimit = incomeTax  // 단일 국외자산 → 한도 = 산출세액 전액
  foreignTaxCreditApplied = min(foreignTaxPaidKrw, foreignTaxCreditLimit)

STEP 10: 지방소득세
  localIncomeTax = floor10((incomeTax − foreignTaxCreditApplied) × 0.1)

STEP 11: 최종 납부세액
  finalTax = incomeTax − foreignTaxCreditApplied
  finalLocalTax = localIncomeTax
```

### 7.2 PR-4B 국외전출세 계산 흐름 (`exit-tax.ts`)

```
STEP 1: §118의9 요건 확인
  yearsResidentLast10 >= 5 AND isMajorShareholder → 납세의무 있음

STEP 2: 종목별 출국일 시가 산정 (exit-tax-valuation.ts)
  departureDayValuationMode별:
    "market_price"    → departureDayMarketPrice 직접 사용
    "prior_year_std"  → priorYearEndMonthAvg (§99①3)
    "unlisted_sample" → unlistedSamplePrice (전후 각 3개월)
    "unlisted_std"    → unlistedStdPricePerShare (§99①4 기준시가)

STEP 3: 종목별 양도차익
  holdingGain[i] = (departureDayValue[i] − acquisitionCost[i])

STEP 4: 합산 과세표준
  totalGain = sum(holdingGain)
  basicDeduction = 2_500_000
  taxBase = max(0, totalGain − basicDeduction)

STEP 5: §118의11 산출세액 <!-- 세율 환각 정정 2026-05-19 R3 -->
  incomeTax = applyStockMajorProgressiveTax(taxBase)
  // §104①11가목2) 확정: STOCK_MAJOR_PROGRESSIVE_BRACKETS 재사용
  localIncomeTax = floor10(incomeTax × 0.1)

STEP 6: 납부유예 처리 (§118의16)
  deferralRequested=true:
    deferralYears = deferralReason="study_abroad" ? 10 : 5
    deferredTaxAmount = incomeTax  // 전액 유예
    납부유예 이자상당액은 미계산 (v1 스코프 외)

STEP 7: 경정청구 계산 (납부유예 후 실양도 시 — exit-tax-deferred.ts)
  조정공제 (§118의12):
    if actualTransferPricePerShare < departureDayPricePerShare:
      realTransferLoss = departureDayValue − actualTransferValue (전체 종목 합산)
      adjustmentDeduction = incomeTax × realTransferLoss / totalGain
  외국납부세액공제 (§118의13):
    foreignTaxCreditLimit = incomeTax − adjustmentDeduction
    foreignTaxExclusionReason !== "none" → 공제 배제
    foreignTaxCreditApplied = min(foreignTaxPaid, foreignTaxCreditLimit)
  §118의14 비거주자 세액공제:
    domLimit = incomeTax − adjustmentDeduction
    domesticTaxCreditApplied = min(domesticSourceTaxWithheld, domLimit)

STEP 8: 보유현황 미신고 가산세 (§118의15)
  hasFiledHoldingsReport=false:
    holdingsReportPenalty = sum(faceValue[i] × 주수[i]) × 0.02
```

---

## 8. Silent fallback / 자동 안분 후보 식별

| 필드 | 처리 방침 |
|---|---|
| `acquisitionExchangeRate` | 미입력 → validation 차단. "한국은행 고시 기준환율 확인 필요" 안내. 자동 조회 v1 스코프 외 |
| `transferExchangeRate` | 미입력 → validation 차단 |
| `perShareAcquisitionPriceForeign` | `acquisitionMode="actual"` 시 미입력 → validation 차단. `"market_price"` 시 미사용 |
| `departureDayMarketPrice` | `departureDayValuationMode="market_price"` 시 미입력 → validation 차단 |
| `foreignTaxPaidForeign` | `hasForeignTax=true` 시 미입력 → validation 차단 |
| `holdings[]` 배열 | 최소 1건 — validation 차단 |

**자동 안분 금지** (`feedback_no_silent_apportion_fallback`): 환율·외화 단가·외국납부세액 일체 자동 추정 금지.

---

## 9. anchor 테스트 계획

### 9.1 PR-4A anchor

**FS-anchor-01: 미국 주식 기본 케이스 (환율 환산 + §55① 누진)**

```
입력:
  yearsResidentInKorea: 7 (납세의무 충족)
  isListedForeignCorp: true
  shareCount: 1_000
  perShareTransferPriceForeign: 150          (USD)
  transferExchangeRate: 1_350                (원/USD)
  perShareAcquisitionPriceForeign: 80        (USD)
  acquisitionExchangeRate: 1_200             (원/USD)
  capitalExpenditureForeign: 0
  transferCostForeign: 200                   (USD — 수수료)
  hasForeignTax: false
  foreignTaxMethod: "credit"

자가검증:
  transferPriceKrw = 1_000 × 150 × 1_350 = 202_500_000
  acquisitionPriceKrw = 1_000 × 80 × 1_200 = 96_000_000
  transferCostKrw = 200 × 1_350 = 270_000
  transferGain = 202_500_000 − 96_000_000 − 270_000 = 106_230_000
  basicDeduction = 2_500_000
  taxBase = 103_730_000

  §55① 확정: 8,800만~1.5억 구간 35%, 누진공제 15,440,000 <!-- 세율 환각 정정 2026-05-19 R3 -->
  incomeTax = 103_730_000 × 35% − 15_440_000 = 36_305_500 − 15_440_000 = 20_865_500
  localIncomeTax = floor10(20_865_500 × 0.1) = 2_086_550
  finalTax = 20_865_500
```

**FS-anchor-02: 외국납부세액 공제 한도 계산** <!-- 세율 환각 정정 2026-05-19 R3 -->

```
FS-anchor-01 기반 + foreignTaxPaidForeign: 2_000 (USD, foreignTaxExchangeRate: 1_350)
  foreignTaxPaidKrw = 2_000 × 1_350 = 2_700_000
  foreignTaxCreditLimit = 20_865_500 (incomeTax — 단일 국외자산)
  foreignTaxCreditApplied = min(2_700_000, 20_865_500) = 2_700_000
  finalTax = 20_865_500 − 2_700_000 = 18_165_500
  localIncomeTax = floor10(18_165_500 × 0.1) = 1_816_550
```

**FS-anchor-03: 5년 미만 거주자 납세의무 없음**

```
입력: yearsResidentInKorea: 3
기대: taxCategory="not_liable", isLiable=false, finalTax=0
→ 세율 확정 무관하게 anchor 작성 가능 (즉시 작성 가능)
```

### 9.2 PR-4B anchor

**ET-anchor-01: 기본 즉시 납부 (상장 대주주)**

```
입력:
  yearsResidentLast10: 8
  isMajorShareholder: true
  holdings: [{ marketType: "kospi", shareCount: 100_000,
               departureDayMarketPrice: 50_000, perShareAcquisitionPrice: 20_000 }]
  deferralRequested: false

자가검증:
  totalGain = 100_000 × (50_000 − 20_000) = 3_000_000_000
  taxBase = 3_000_000_000 − 2_500_000 = 2_997_500_000
  §118의11 → §104①11가목2) 확정: 3억 초과 25%, 누진공제 15,000,000 <!-- 세율 환각 정정 2026-05-19 R3 -->
  incomeTax = 2_997_500_000 × 25% − 15_000_000 = 734_375_000
  localIncomeTax = floor10(734_375_000 × 0.1) = 73_437_500
```

**ET-anchor-02: 조정공제 (실양도가 < 출국일 시가)**

```
ET-anchor-01 기반 + 납부유예 후 실양도가 40_000원/주
  actualTransferValue = 100_000 × 40_000 = 4_000_000_000
  departureDayValue = 100_000 × 50_000 = 5_000_000_000
  realTransferLoss = 5_000_000_000 − 4_000_000_000 = 1_000_000_000
  totalGain = 3_000_000_000 (출국일 기준)
  adjustmentDeduction = 734_375_000 × (1_000_000_000 / 3_000_000_000) = 244_791_666 <!-- 세율 환각 정정 2026-05-19 R3 -->
```

**ET-anchor-03: 5년 미만 거주 → 납세의무 없음**

```
입력: yearsResidentLast10: 4, isMajorShareholder: true
기대: taxCategory="not_liable", isLiable=false
→ 세율 확정 무관, 즉시 작성 가능
```

---

## 10. 2-Layer 영향 분석

### 10.1 Layer 1 (Orchestrator: `app/api/calc/stock-transfer/route.ts`)

| 변경 항목 | 상세 |
|---|---|
| Zod discriminatedUnion | `taxCategory: "foreign_stock"` 분기 추가 (PR-4A), `"exit_tax"` 분기 추가 (PR-4B) |
| coerceDates | `transferDate`, `acquisitionDate` (PR-4A). `departureDate`, `actualTransferDate`, **`holdings[]` 배열 내 `acquisitionDate` map 처리** (PR-4B) — 평면 coerceDates로 배열 내부 미변환 위험 주의 <!-- 검토 정정 2026-05-19: R2-04 계승 --> |
| 엔진 input 매핑 | `calculateForeignStock(input)` / `calculateExitTax(input)` 위임 |

### 10.2 Layer 2 (Pure Engine)

| 모듈 | 영향 |
|---|---|
| `stock-classification.ts` | `taxCategory` 반환 타입 확장 + `isForeignTaxCategory()` 헬퍼 추가 |
| `foreign-stock.ts` (신규) | §118의2~§118의8 순수 함수 |
| `foreign-stock-rate.ts` (신규) | §55① 누진세율 표 + `calculateProgressiveTax` 적용 |
| `exit-tax.ts` (신규) | §118의9~§118의16 메인 흐름 |
| `exit-tax-valuation.ts` (신규) | 출국일 시가 산정 (상장/비상장 분기) |
| `exit-tax-deferred.ts` (신규) | 납부유예·조정공제·가산 이자 |
| 기존 엔진 (`stock-transfer-tax.ts`) | **영향 최소화** — orchestrator 분기 추가 2줄만 |

---

## 11. PR 의존 순서

```
PR-3 완료 (현재)
  └─ PR-4A: 해외주식 (선행)
       ├─ A-1: validate.ts 800줄 분리 선행 (validate-foreign.ts 신규)
       ├─ A-2: 타입 정의 (foreign-stock.types.ts + Zod schema)
       ├─ A-3: 엔진 구현 (foreign-stock.ts + foreign-stock-rate.ts)
       ├─ A-4: route.ts 통합 + validate 차단 해제
       ├─ A-5: UI (Step1 분기 + ForeignStockBlock + ExchangeRateInput)
       └─ A-6: anchor 테스트 (FS-anchor-01, 02, 03)
            └─ PR-4B: 국외전출세 (후행)
                 ├─ B-1: 타입 정의 (exit-tax.types.ts + Zod schema)
                 ├─ B-2: 출국일 시가 산정 (exit-tax-valuation.ts)
                 ├─ B-3: 납부유예·조정공제 (exit-tax-deferred.ts)
                 ├─ B-4: 메인 엔진 (exit-tax.ts)
                 ├─ B-5: route.ts + validate 통합
                 ├─ B-6: UI (국외전출세 전용 탭 또는 별도 페이지)
                 └─ B-7: anchor 테스트 (ET-anchor-01, 02, 03)
```

---

## 12. 리스크·미해결

### 12.1 Do 진입 전 필수 선행 <!-- 세율 환각 정정 2026-05-19 R3 — 세율 확정 완료 -->

| 번호 | 사항 | 영향 범위 | 상태 |
|---|---|---|---|
| ~~CRITICAL-1~~ | ~~§55① 세율표 확인~~ | FS-anchor-01·02, PR-4A `FOREIGN_STOCK_BRACKETS` | **완료** — 6~45% 8구간 확정 (stock-rate-tables.ts `BASIC_PROGRESSIVE_BRACKETS` 재사용) |
| ~~CRITICAL-2~~ | ~~§118의11 계산식 확인~~ | ET-anchor-01·02, PR-4B `applyExitTaxRate()` | **완료** — 20%/25% 2구간 확정 (stock-rate-tables.ts `STOCK_MAJOR_PROGRESSIVE_BRACKETS` 재사용) |

### 12.2 기타 리스크

| 리스크 | 대응 방안 |
|---|---|
| validate.ts 800줄 초과 | PR-4A A-1 단계로 `validate-foreign.ts` 분리 선행 (현재 791줄) |
| `taxCategory` substring 매칭 버그 | `isForeignTaxCategory()` 헬퍼 추가 + `includes` 패턴 grep 점검 |
| PR-4B `holdings[]` 배열 내 Date 침묵 stripping | route handler에서 `holdings.map(h => ({ ...h, acquisitionDate: toDate(h.acquisitionDate, "acquisitionDate") }))` 별도 처리 |
| 실시간 환율 API 부재 | v1: 사용자 직접 입력 + hint "한국은행 홈페이지 고시 기준환율" |
| §118의16④ 납부유예 이자상당액 시행령 위임 | v1: 이자 미계산 + "실제 납부 시 별도 계산 필요" 안내 |
| 납부유예 중 귀국(재입국) 처리 | 스코프 외 + 안내 카드 |
| §94①3다목 + §94①4 동시 해당 (§94② 우선) | 스코프 외 차단 + "해당 시 세무사 상담" 안내 |

---

## 13. 계획서 ↔ 엔진 디자인 정합 점검

| 계획서 항목 | 엔진 디자인 반영 여부 |
|---|---|
| PR-4A·4B 분리 | ✅ §1.1 분리 확인 |
| taxCategory enum 2종 추가 | ✅ §5.1 |
| ForeignStockInput 후보 필드 | ✅ §5.2 (외화 단위 명시, transferPriceMode 추가) |
| ExitTaxInput 후보 필드 | ✅ §5.4 (foreignTaxExclusionReason enum 3값으로 정정 R2-02 계승) |
| 환율 취득일·양도일 별도 | ✅ §5.2, §7.1 STEP 2~4 |
| 기본공제 3그룹 분리 | ✅ §1.1 표, §7.1 STEP 6, §7.2 STEP 4 |
| LTHD 미적용 (§118의8) | ✅ §7.1 STEP 7 주석 |
| FS-02(DR) 후속 PR 이관 | ✅ §1.3 (R2-01 계승) |
| 보유현황 신고일 기준 (신고일 전날) | ✅ §2.2 §118의15 행 (R1-08 계승) |
| §118의13② 1호 배제 사유 | ✅ §5.4 foreignTaxExclusionReason + §2.2 §118의13 행 (R1-05 계승) |
| holdings[] 배열 Date 배열 map 처리 | ✅ §6.2 ExitTaxHoldingSchema 주석 + §12.2 (R2-04 계승) |
| FS-03 시가 산정 §178의3 단서 | ✅ §2.1 §178의3 행, §3.1 FS-03 (R1-04 계승) |

---

## 검토 이력

### 엔진 디자인 자체 검토 (2026-05-19)

| # | 분류 | 발견 내용 | 정정 위치 | 심각도 |
|---|---|---|---|---|
| ED-01 | CRITICAL | FS-02 DR 스코프 모순 (§1.3 외 ↔ 케이스 인벤토리 내) — 후속 PR 이관으로 확정 | §1.3, §3.1 FS-02 | CRITICAL |
| ED-02 | CRITICAL | `foreignTaxExclusionReason` boolean 단일 필드로 §118의13②1호·2호 구분 불가 → 3값 enum으로 정정 | §5.4 ExitTaxInput | CRITICAL |
| ED-03 | IMPORTANT | PR-4B holdings[] 배열 내 acquisitionDate Date 변환 — 평면 coerceDates 미처리 위험 명시 누락 | §6.2, §12.2 | IMPORTANT |
| ED-04 | IMPORTANT | 계획서 §178의10을 경정청구 기한 조문으로 오기재 — §118의15⑤로 정정 | §2.2 §118의15 행 | IMPORTANT |
| ED-05 | IMPORTANT | §178의9 "전후 3개월" → "전후 각 3개월" 정정 | §2.2 §178의9 행, §5.4 | IMPORTANT |
| ED-06 | IMPORTANT | §118의13②적용 배제 사유 1호(산출세액 공제 허용) 누락 → 추가 | §2.2 §118의13 행, §7.2 | IMPORTANT |
| ED-07 | NON-CRITICAL | `ForeignStockResult`에 `transferPriceMode` echo 필드 누락 → 결과 카드 표시용 환율 echo 필드 추가 | §5.3 | NON-CRITICAL |
| ED-08 | NON-CRITICAL | validate.ts 800줄 임박(791줄) — PR-4A 착수 전 분리 선행 명시 | §4.2, §11 A-1 단계 | NON-CRITICAL |

**자체 검토 발견·정정 총계: CRITICAL 2건, IMPORTANT 4건, NON-CRITICAL 2건 = 총 8건**

### 라운드 3 — 세율 anchor 환각 정정 + cross-doc 정합 (2026-05-19) <!-- cross-check 정정 2026-05-19 -->

| # | 분류 | 발견 내용 | 정정 위치 |
|---|---|---|---|
| R3-01 | CRITICAL 정정 | §55① 세율 환각 제거 — "16%~55%·Do 전 확인" 표현 → 확정값(6~45%, BASIC_PROGRESSIVE_BRACKETS) | §2.1, §5.3, §7.1, §9.1 |
| R3-02 | CRITICAL 정정 | §118의11 세율 환각 제거 — "추정 1안/2안·Do 전 확인" 표현 → 확정값(20%/25%, STOCK_MAJOR_PROGRESSIVE_BRACKETS) | §2.2, §5.5, §7.2, §9.2, §12.1 |
| R3-03 | CRITICAL 정정 | FS-anchor-01 산출세액 확정: 20,865,500 (8,800만~1.5억 구간 35%) | §9.1 |
| R3-04 | CRITICAL 정정 | FS-anchor-02 최종세액 확정: 18,165,500 | §9.1 |
| R3-05 | CRITICAL 정정 | ET-anchor-01 산출세액 확정: 734,375,000 | §9.2 |
| R3-06 | CRITICAL 정정 | ET-anchor-02 조정공제액 확정: 244,791,666 | §9.2 |
| R3-07 | IMPORTANT 정정 | §12.1 "Do 진입 전 필수 선행" 2건 → 완료 상태로 업데이트 | §12.1 |
| R3-08 | cross-check | 계획서 §4.3 세율 표현과 엔진 디자인 §2.1 일치 확인 ✅ | cross-doc |
| R3-09 | cross-check | 계획서 §4.4 세율 표현과 엔진 디자인 §2.2 일치 확인 ✅ | cross-doc |

**라운드 3 정정: CRITICAL 6건, IMPORTANT 1건, cross-check 2건 = 총 9건**
