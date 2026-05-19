# 주식 양도소득세 PR-2 잔여 구현 계획서 v3

> 작성일: 2026-05-19 (v3: 자가 재검토 18건 반영 — 위임 인용·swap 차단 근거·UI 라벨·eventDate 검증·시한 산정)
> v2: KoreanLaw MCP 검증 후 R-1 전면 정정 + R-2 법령 인용 정정
> 작성자: Claude (Opus 4.7)
> 영향 도메인: `lib/tax-engine/stock-transfer/` + `lib/calc/stock-transfer-tax-*.ts` + `lib/api/stock-transfer-tax-schema.ts` + `app/api/calc/stock-transfer/route.ts` + `app/calc/stock-transfer-tax/steps/Step2.tsx` + `components/calc/stock-transfer/` + `components/calc/results/StockTransferTaxResultView.tsx`
> 우선순위: **P2 (도메인 완성도)** — PR-2 케이스 인벤토리 충족도 90% → 100%

## 0. v1 → v2 정정 이력 (KoreanLaw MCP 검증)

### 0.1 R-1 폐기 — 감정가액 모드는 주식 양도세에 법령상 부재

**v1 오류**: "R-1 외부 감정가(`appraisal`) 모드 — 소득세법 §97①1나목 + 시행령 §163①1호 — 감정평가 2건 평균"

**KoreanLaw 검증 (소득세법 시행령 §176의2③, 시행일 2026.4.23.)**:
- §176의2③1호: 매매사례가액 (**주권상장법인 주식등은 제외**)
- §176의2③2호: **둘 이상 감정평가법인등 감정가액** — 단서 본문 "둘 이상의 감정평가법인등이 평가한 것으로서… **주식등을 제외한다**"
- §176의2③3호: 환산취득가액
- §176의2③4호: 기준시가

→ **주식은 감정가액 모드 자체가 법령상 적용 불가**. v1의 R-1은 법령 오류로 **폐기**.
→ `Step2.tsx:420`의 "감정가액 입력은 PR-2에서 완전 지원 예정" 안내 카드는 **삭제** 또는 "주식은 §176의2③2호 단서에 의해 감정가 모드 미적용" 명시로 변경.

### 0.2 R-1' 신설 — 매매사례가액 모드 (비상장 한정)

§176의2③1호: 매매사례가액은 **주권상장법인 주식등만 제외**하므로 **비상장(`marketType="unlisted"`) + 기타자산은 적용 가능**.
- 양도일 또는 취득일 전후 각 3개월 이내
- 동일성·유사성이 있는 자산의 매매사례
- §98① 특수관계인 거래 제외 (객관성 결여 시 적용 배제)

PR-2 핵심 잔여로 R-1'(매매사례가액 모드)를 R-1 대체로 채택.

### 0.3 R-2 법령 인용 정정

**v1 오류**: "시행령 §163⑤ — 무상주·무상감자에 의한 1주당 취득가액 조정"

**KoreanLaw 검증 (소득세법 시행령 §163⑤, 시행일 2026.4.23.)**:
- §163⑤는 **법 §97①3호 위임 — 양도비용(증권거래세·계약서 작성비용·인지대·소개비·명도비용)** 본문. 무상주 환산과 무관.

**실체적 본칙 검토**:
- 무상증자·무상감자 1주당 단가 환산은 **소득세법 시행령에 명시적 본칙 부재**
- 자본준비금·재평가적립금 자본전입 무상증자: 소득세법 §17②2호 가목 단서 (의제배당 제외) → 양도세 도메인에서 1주당 단가 희석 처리
- 이익잉여금 자본전입 무상증자: 소득세법 §17②2호 가목 → 의제배당 (배당소득 도메인)
- 운영 근거: **국세청 양도소득세 집행기준 97-163-12 (무상주 취득가액)** + 소득 46011-… 예규
- 무상감자: 자본준비금 환급 vs 의제배당 (§17②1호) 분기

**v2 인용 정정**:
| 분기 | 법령 근거 | 양도세 처리 |
|---|---|---|
| 자본준비금 무상증자 | 소득세법 §17②2호 가목 단서 (1) 「법인세법」 §16①2호 가목 본문 자본준비금 / (2) 재평가적립금 — 의제배당 제외 | 종전 총 취득원가 불변 / 환산 주식수 ↑ / 1주당 단가 희석 |
| 이익잉여금 무상증자 | 소득세법 §17②2호 가목 (의제배당) | **배당소득 도메인** — 양도세 엔진은 warning 후 skip |
| 무상감자 (실질감자) | 소득세법 §17②1호 (의제배당 — 환급분) | **배당소득 도메인** — warning + skip |
| 무상감자 (형식감자·결손보전) | (의제배당 비대상) | 환산 주식수 ↓ / 1주당 단가 ↑ |
| 1주당 단가 환산 산식 | 집행기준 97-163-12 + 실무 | 총 취득원가 ÷ 환산 후 주식수 |

### 0.4 §163⑤ → §163⑥ (개산공제) 인용 확정

v1에서 `STOCK_LOSS_GAIN_DISCOUNT_RATE` 본문 주변 §163⑥4호(주식 1% 개산공제) 인용은 정확. 변경 없음.

### 0.5 R-3 변경 없음

UI 로드맵 카드 3-state 갱신.

## 1. 배경

### 1.1 PR-2 진행도

`docs/02-design/features/stock-transfer-tax.engine.design.md:475`의 PR-2 케이스 인벤토리(2·9~11·13~17·19·27~28) 중 **11/11 anchor 완료**.

다음 디자인 §460~461 명시 잔여 + v1에서 발견된 stale UI:
- 디자인 §460: "외부 감정가, PR-2" — **법령상 부재 → placeholder 삭제로 종결**
- 디자인 §461: "무상증자·무상감자 환산주식수 — PR-2" — **자본준비금 분기만 본 엔진 구현, 의제배당 분기는 별도 도메인 명시**
- 로드맵 카드 stale

### 1.2 v2 잔여 항목 목록

| # | 항목 | 위치 (현행 placeholder) | 법령 근거 |
|---|---|---|---|
| **R-1'** | **매매사례가액(`market_sample`) 모드 (비상장·기타자산 한정)** | 신규 — `Step2.tsx`에 새 라디오 옵션 | 소득세법 시행령 §176의2③1호 |
| **R-2** | 무상증자·무상감자 환산주식수 (자본준비금 분기만) | 미구현 | 소득세법 §17②2호 가목 단서 + 집행기준 97-163-12 |
| **R-3** | 구현 로드맵 카드 상태 3-state 갱신 | `StockTransferTaxResultView.tsx:655` | UI 메타 |
| **R-4** | 감정가 placeholder 카드 삭제·메시지 변경 | `Step2.tsx:420` | §176의2③2호 단서 |

### 1.3 사용자 보고 (2026-05-19)

> "구현 로드맵 pr-2(비상장 평가 시기별 연혁)이 어디까지 구현되었나요"

## 2. R-1': 매매사례가액(`market_sample`) 모드 (비상장 한정)

### 2.1 법령 근거 (KoreanLaw 본문 발췌, 위임 체인)

```
소득세법 §97①1나목 — "대통령령으로 정하는 매매사례가액, 감정가액 또는 환산취득가액을 순차적으로 적용한 금액"
   ↓ 위임
소득세법 시행령 §163⑫ — "법 제97조제1항제1호나목에서 '대통령령으로 정하는 매매사례가액, 감정가액 또는 환산취득가액'이란 제176조의2제2항부터 제4항까지의 규정에 따른 가액을 말한다."
   ↓ 위임
소득세법 시행령 §176의2③1호 (시행일 2026.4.23.):
  "양도일 또는 취득일 전후 각 3개월 이내에 해당 자산
   (주권상장법인의 주식등은 제외한다)과 동일성 또는 유사성이 있는
   자산의 매매사례가 있는 경우 그 가액"
소득세법 시행령 §176의2③ 단서:
  "다만, 제1호에 따른 매매사례가액 또는 제2호에 따른 감정가액이
   제98조제1항에 따른 특수관계인과의 거래에 따른 가액 등으로서
   객관적으로 부당하다고 인정되는 경우에는 해당 가액을 적용하지 않는다."
```

**적용 범위 확정**:
- 비상장(`marketType="unlisted"`): ✅ 적용 가능
- 코스피·코스닥·코넥스: ❌ "주권상장법인 주식등은 제외" — UI에서 옵션 비활성화
- 기타자산(`marketType="other_asset"`): ✅ 적용 가능 (단서 "주권상장법인 주식등은 제외"만 적용)

### 2.2 입력 필드 설계 (자산-수준)

```ts
// StockTransferInput (lib/tax-engine/stock-transfer/types/stock-transfer.types.ts)
//   acquisitionMode 기존 enum 확장:
//     "actual" | "estimated" | "face_value" | "market_sample"
//   (기존 "appraisal" 폐기 — 법령 부재)

// 신규 필드 (양도시 매매사례가액 + 취득시 매매사례가액 각각 입력 가능):
acquisitionMarketSamplePrice?: number;       // 취득시 매매사례가액 (1주당, 원)
acquisitionMarketSampleDate?: Date;           // 취득시 사례 거래일 (취득일 ±3개월 검증용)
acquisitionMarketSampleCounterparty?: string; // 거래상대 (메타 — 특수관계인 자가 확인용)
transferMarketSamplePrice?: number;           // 양도시 매매사례가액 (1주당, 원) — 양도가액 모드용
transferMarketSampleDate?: Date;
transferMarketSampleCounterparty?: string;
```

### 2.3 엔진 분기

`stock-valuation-market-sample.ts` 신규 (~120줄):

```ts
export interface MarketSampleValuationResult {
  perShareValue: number;       // 그대로 (원 단위)
  totalValue: number;          // perShareValue × shareCount
  appliedRules: string[];      // ["소득세법 §97①1나목", "시행령 §176의2③1호"]
  warnings: string[];          // 3개월 초과 / 특수관계인 의심 경고
}

export function validateMarketSampleDate(
  sampleDate: Date,
  referenceDate: Date,    // 취득일 또는 양도일
): { ok: boolean; daysDelta: number; warning?: string } {
  const delta = Math.abs(sampleDate.getTime() - referenceDate.getTime()) / 86400000;
  if (delta > 90) {
    return { ok: false, daysDelta: delta, warning: `매매사례 거래일이 기준일 ±3개월 초과 (${delta.toFixed(0)}일)` };
  }
  return { ok: true, daysDelta: delta };
}

export function calcAcquisitionFromMarketSample(
  input: StockTransferInput,
  shareCount: number,
): MarketSampleValuationResult { ... }
```

**적용 우선순위 검증** (§176의2③ 본문 "순차적 적용"):
- 매매사례가액 입력 시 → 환산취득가액·기준시가 분기 진입 차단 (acquisitionMode가 명시 선택이므로 자동 보장)
- **법 §97②2호 단서 swap 비교는 환산취득가액(`acquisitionMode="estimated"`) 전용** — 본문이 "환산취득가액으로 하는 경우로서" 명시 → 매매사례 모드는 §97②1호 "실지거래가액으로 보는 경우"에 흡수되므로 swap 자동 비대상 (KoreanLaw 본문 확인 — 추가 검증 불필요).

**사용자 자율 선택의 의미**: 시행령 §176의2 본칙은 **결정·경정** 단계의 우선순위. 신고 시 사용자가 매매사례·환산 등을 자율 선택하는 것은 책임 영역. 세무서 결정·경정 단계에서 §98① 특수관계인 부당거래·3개월 초과 등에 의해 부인 가능 → UI에서 안내·warning만 표시, 차단은 시장 유형 게이트(§176의2③1호 단서 "주권상장법인 주식등 제외")만 강제.

### 2.4 시장 유형 게이트

```ts
// validate (lib/calc/stock-transfer-tax-validate.ts)
if (acquisitionMode === "market_sample") {
  if (marketType === "kospi" || marketType === "kosdaq" || marketType === "konex") {
    errors.push({
      field: "acquisitionMode",
      message: "매매사례가액 모드는 비상장·기타자산 전용입니다 (시행령 §176의2③1호 단서 — 주권상장법인 주식등 제외)",
      severity: "error",
    });
  }
}
```

UI에서는 `marketType` 변경 시 자동으로 `market_sample` 옵션 disabled (3중 패턴 일관).

### 2.5 §163⑥ 개산공제 + 자본적지출·양도비

매매사례가액 모드 = "실지거래가액 추계"의 1순위. 환산취득가액·기준시가가 아닌 **실지거래가액 의제** → §97②1호 "취득가액을 실지거래가액에 의하는 경우"로 분류.
- §163⑥ 개산공제(취득시 기준시가 × 1%) **미적용**
- 자본적지출·양도비(§97①2호·3호 + §163③·⑤) **실액 적용 가능** (사용자 `input.actualExpenses` 명시 시 차감)
- swap 비교 자동 차단 (§97②2호는 환산취득가액 전용)

### 2.6 분할 매수(split) + 매매사례 차단

`acquisitionLots[]` lot별 `acquisitionMode` 미지원 (lot 타입은 일자·수량·가격만). split 모드와 결합 시:
- Zod refine: `lotsMode === "split" && acquisitionMode === "market_sample"` → error "매매사례가액 모드는 단건 모드 전용 (lot별 사례가 다른 경우 후속 PR)"
- validate: 동일 error 동기
- UI: split 활성 시 `market_sample` 라디오 disabled + disabledReason

## 3. R-2: 무상증자·무상감자 환산주식수

### 3.1 법령 근거 (KoreanLaw 본문 발췌 — v1 §163⑤ 오기 정정)

```
소득세법 §17②2호 가목 (시행일 2026.4.21.):
  의제배당 = "법인의 잉여금의 전부 또는 일부를 자본 또는 출자에 전입함으로써 취득하는 주식 또는 출자의 가액"
  단서 (의제배당 제외 사유):
    (1) 「법인세법」 §16①2호 가목 자본준비금 (주식발행초과금·합병·분할·교환차익 등 일부 제외)
    (2) 「법인세법 시행령」 §12①1호 재평가적립금 (1%세율 분 제외)
    → 위 단서 해당 무상증자는 의제배당 비대상 = 양도세 도메인

소득세법 §17②1호:
  의제배당 = "주식소각·자본감소·잉여금자본전입 등으로 인하여 받는 금전 및 기타 재산의 가액"
  → 무상감자 중 실질감자(자본환급)는 의제배당 → 배당소득 도메인
  → 형식감자(결손보전)는 의제배당 비대상 → 양도세 도메인 (단가 환산만)

운영 근거 (시행령 본칙 부재 → 실무):
  국세청 양도소득세 집행기준 97-163-12 (무상주 취득가액 1주당 환산)
  소득 46011-… 예규 (자본준비금 무상증자의 취득시기는 종전 주식 취득시기 승계)
```

### 3.2 입력 필드 (자산-수준 — 시계열 배열)

```ts
// StockTransferInput 신규
capitalAdjustments?: {
  type: "bonus_capital_reserve"      // 자본준비금 무상증자 (양도세 — 1주당 단가 희석)
      | "bonus_retained_earnings"    // 이익잉여금 무상증자 (의제배당 — skip + warning)
      | "reduction_proportional"     // 비례감자·결손보전 등 형식감자 (양도세 — 1주당 단가 상승)
      | "reduction_capital_return";  // 자본환급 무상감자 (의제배당 — skip + warning)
  eventDate: Date;                    // 권리락일 또는 자본감소 효력일
  ratio: number;                      // 무상증자: 배정비율 (0 < ratio ≤ 10, 일반적 0.1~1.0)
                                      // 무상감자: 감자비율 (0 < ratio < 1)
  notes?: string;                     // 사용자 메모
}[];
```

**UI 라벨(한국어)**:
- `bonus_capital_reserve` → "무상증자 — 자본준비금 (양도세 처리)"
- `bonus_retained_earnings` → "무상증자 — 이익잉여금 (배당소득 — 별도 처리)"
- `reduction_proportional` → "무상감자 — 비례감자·결손보전 (양도세 처리)"
- `reduction_capital_return` → "무상감자 — 자본환급 (배당소득 — 별도 처리)"

각 옵션 description hint에 §17② 단서 본문 발췌 노출.

### 3.3 엔진 분기

`stock-capital-adjustments.ts` 신규 (~150줄):

```ts
export interface CapitalAdjustmentResult {
  adjustedShareCount: number;          // 환산 후 주식수 (취득가액 분모용)
  adjustedPerShareCost: number;        // 환산 후 1주당 취득가액 (= totalCost / adjustedShareCount, floor)
  totalCostInvariant: number;          // 총 취득원가 (불변 검증용)
  applied: CapitalAdjustmentApplied[];
  warnings: string[];                  // 의제배당 skip 안내
  appliedRules: string[];
}

export function adjustShareCountAndCost(
  baseShareCount: number,
  baseTotalAcquisitionCost: number,
  adjustments: NonNullable<StockTransferInput["capitalAdjustments"]>,
): CapitalAdjustmentResult {
  let count = baseShareCount;
  const cost = baseTotalAcquisitionCost;  // 불변
  const applied: CapitalAdjustmentApplied[] = [];
  const warnings: string[] = [];
  const appliedRules: string[] = [];

  // 시계열 정렬 (eventDate 오름차순)
  const sorted = [...adjustments].sort((a, b) => a.eventDate.getTime() - b.eventDate.getTime());

  for (const adj of sorted) {
    switch (adj.type) {
      case "bonus_capital_reserve":
        count = Math.floor(count * (1 + adj.ratio));
        applied.push({ ...adj, beforeShares: prevCount, afterShares: count });
        appliedRules.push("소득세법 §17②2호 가목 단서 (자본준비금 자본전입 — 의제배당 제외)");
        break;
      case "reduction_proportional":
        count = Math.floor(count * (1 - adj.ratio));
        applied.push({ ... });
        appliedRules.push("형식감자 (비례감자·결손보전 — 의제배당 비대상)");
        break;
      case "bonus_retained_earnings":
        warnings.push(`${formatDate(adj.eventDate)}: 이익잉여금 무상증자는 의제배당(§17②2호 가목) — 배당소득 도메인에서 별도 처리. 본 엔진 양도세 환산에서는 skip.`);
        // 주식수·취득가액 불변
        break;
      case "reduction_capital_return":
        warnings.push(`${formatDate(adj.eventDate)}: 무상감자(실질·자본환급)는 의제배당(§17②1호) — 배당소득 도메인. 본 엔진에서는 skip.`);
        break;
    }
  }

  const adjustedPerShareCost = Math.floor(cost / count);
  return {
    adjustedShareCount: count,
    adjustedPerShareCost,
    totalCostInvariant: cost,
    applied,
    warnings,
    appliedRules,
  };
}
```

### 3.4 eventDate 검증 (validate + Zod 동기)

```ts
// validate
for (const adj of capitalAdjustments ?? []) {
  if (adj.eventDate <= acquisitionDate) {
    errors.push({ field: "capitalAdjustments", message: "발생일이 취득일 이전 — 종전 보유자에게만 영향, 본 거주자 양도세 산정에 미해당", severity: "error" });
  }
  if (adj.eventDate > transferDate) {
    errors.push({ field: "capitalAdjustments", message: "발생일이 양도일 이후 — 양도 이후 사건은 본 거주자 양도차익에 미반영", severity: "error" });
  }
  if (adj.ratio <= 0) {
    errors.push({ field: "capitalAdjustments", message: "ratio는 0보다 커야 함", severity: "error" });
  }
  if ((adj.type === "reduction_proportional" || adj.type === "reduction_capital_return") && adj.ratio >= 1) {
    errors.push({ field: "capitalAdjustments", message: "감자비율은 1 미만 (100% 감자는 청산)", severity: "error" });
  }
  if (adj.type.startsWith("bonus_") && adj.ratio > 10) {
    errors.push({ field: "capitalAdjustments", message: "무상증자 배정비율 10 초과 — 입력 확인 권장", severity: "warning" });
  }
}
```

엔진 시계열 정렬은 자동 (`sort((a,b) => a.eventDate - b.eventDate)`). UI에서도 "추가 후 자동 정렬" 안내 + 표 행 순서는 정렬 결과 그대로 표시.

### 3.5 분할 매수 모드 상호작용

`acquisitionLots[]` + `capitalAdjustments[]` 동시 사용은 본 PR 범위 외:
- Zod refine: `lotsMode === "split" && capitalAdjustments?.length > 0` → error
- validate: 동일 error 동기
- UI: split 활성 시 CapitalAdjustmentsBlock 섹션 disabled + 안내

후속 PR: lot별 발생일 ↔ adjustment eventDate 시계열 매칭 헬퍼.

### 3.5.1 PostListingDetail 모드 호환성

`postListingDetail` (취득 후 상장 환산 §165⑤) 활성 시에도 capital_adjustments는 동시 적용 가능:
- 취득 후 상장 환산은 양도일 vs 취득일 기준시가 비율로 환산취득가 산출 → totalAcquisitionPrice 도출
- capital_adjustments는 totalAcquisitionPrice 도출 **이후** 1주당 단가 환산만 영향
- 따라서 두 기능 직교 — 정책상 제약 없음

### 3.5.2 transferMarketSamplePrice + transferStdInputMode 우선순위

`transferPriceMode === "actual"` AND `transferMarketSamplePrice` 입력 시:
- `transferPrice = transferMarketSamplePrice × shareCount` (사례가 우선)
- `transferStdInputMode = "daily" | "direct"` 입력 무관 (양도일 기준시가는 환산 모드에서만 사용)
- `perShareTransferPrice` 입력값은 무시 (사례가가 우선)
- UI에서 사례가 입력 시 perShareTransferPrice 필드 disabled + 안내

### 3.6 양도 주식수와의 관계

- `input.shareCount` = 사용자가 입력한 **양도 시점 주식수** (이미 모든 무상증자·감자 반영된 후 수치)
- `adjustedShareCount` = 환산 후 주식수 (취득가액 산정 분모 — `totalCost / adjustedShareCount`로 1주당 환산)
- 양도가액(`transferPrice = perShareTransferPrice × shareCount`)은 무영향

**자기일관성 anchor**: `adjustedShareCount === shareCount` (사용자 입력이 시계열 결과와 일치) — Zod refine에 warning 추가.

## 4. R-3: 구현 로드맵 카드 3-state

### 4.1 `StockTransferTaxResultView.tsx:652-683` 갱신

```tsx
type PrStatus = "completed" | "current" | "pending";

const stages: { label: string; desc: string; status: PrStatus }[] = [
  { label: "PR-1", desc: "상장 대주주·취득 후 상장",     status: "completed" },
  { label: "PR-2", desc: "비상장·평가·시기별 연혁",       status: "completed" },  // R-1'·R-2 머지 후
  { label: "PR-3", desc: "다자산·가산세·신고서",         status: "current"   },
  { label: "후속", desc: "§97의2·국외전출세·해외주식",   status: "pending"   },
];
```

색상 매핑:
- `completed`: emerald (border-emerald-300 bg-emerald-50 text-emerald-800) + ✓ 배지
- `current`: sky (border-sky-400 bg-sky-100 text-sky-800) + "현재" 배지
- `pending`: slate (border-slate-200 bg-white text-slate-600 opacity-60)

## 5. R-4: 감정가 placeholder 카드 삭제·메시지 변경

`Step2.tsx:420` 영역:
- v1 안내 ("감정가액 입력은 PR-2에서 완전 지원 예정") 카드 **삭제**
- `acquisitionMode` enum에서 `"appraisal"` 옵션 제거 (UI 라디오 + 타입 + Zod + validate 일괄)
- 또는 옵션은 유지하되 항상 disabled + disabledReason "주식 양도세에서는 적용 불가 (시행령 §176의2③2호 단서 — 주식등 제외)"

권장: **enum 제거 + 잔여 dead-code 정리** (현재 어떤 anchor도 appraisal을 양수 결과로 검증하지 않음)

## 6. 케이스 인벤토리 (anchor 매트릭스)

### 6.1 R-1' anchor (매매사례가액 모드, 비상장)

| ID | 조건 | 입력 | 기대 결과 |
|---|---|---|---|
| MS-1 | 비상장 + 취득 매매사례 정상 | marketType=unlisted, acquisitionMode=market_sample, acquisitionMarketSamplePrice=100,000, sampleDate=취득일+1개월 | totalAcquisitionPrice = 100,000 × shareCount / 개산공제 미적용 |
| MS-2a | 코스피 시도 → validate error | marketType=kospi, acquisitionMode=market_sample | "비상장·기타자산 전용 (§176의2③1호 단서)" |
| MS-2b | 코스닥 시도 → validate error | marketType=kosdaq | 동상 |
| MS-2c | 코넥스 시도 → validate error | marketType=konex | 동상 |
| MS-3 | 3개월 초과 → warning + 진행 (date-fns differenceInDays 사용) | sampleDate=취득일+100일 | warning "3개월 초과 (100일)" + 계산은 진행 |
| MS-4 | 양도 매매사례 + 취득 매매사례 동시 | transferMarketSamplePrice / acquisitionMarketSamplePrice 모두 입력 | transferPrice·acquisitionPrice 양쪽 매매사례 적용 |
| MS-5 | 특수관계인 의심 (counterparty 명시 — UX 한정) | counterparty="대표이사" 등 | warning "특수관계인 의심 — §98① 본문 검토" |
| MS-6 | 기타자산(other_asset) 적용 가능 | marketType=other_asset | error 없음 |

### 6.2 R-2 anchor (무상증자·감자)

| ID | 조건 | 입력 | 기대 결과 |
|---|---|---|---|
| CA-1 | 자본준비금 무상증자 단일 | base=1,000주/1억, type=bonus_capital_reserve, ratio=0.5 | adjustedShareCount=1,500 / adjustedPerShareCost=66,666 (floor(1억/1500)) / totalCostInvariant=1억 |
| CA-2 | 형식감자 단일 | base=1,000주/1억, type=reduction_loss_offset, ratio=0.2 | adjustedShareCount=800 / adjustedPerShareCost=125,000 |
| CA-3 | 자본준비금 → 형식감자 시계열 | [{cap_reserve,0.5}, {loss_offset,0.2}] | 1,000→1,500→1,200 / 83,333 |
| CA-4 | 이익잉여금 무상증자 skip | type=bonus_retained_earnings | warning 발동 + 주식수 불변 + appliedRules에 의제배당 명시 |
| CA-5 | 무상감자 실질환급 skip | type=reduction_capital_return | warning + skip |
| CA-6 | split 모드 + capitalAdjustments → Zod error | lotsMode=split, capitalAdjustments.length>0 | "단건 모드 전용" |
| CA-7 | adjustedShareCount ≠ shareCount → warning | base=1,000 → 무상증자 0.5 → 1,500, 사용자 shareCount=2,000 입력 | warning "환산 결과 1,500 ≠ 입력 양도 2,000 — 입력 확인" |
| CA-8 | 자기일관성 anchor (사례 — 1주당 단가 unchanged when ratio=0 → validate error) | ratio=0 | validate "ratio는 0보다 커야 함" |
| CA-9 | eventDate < acquisitionDate → validate error | eventDate=취득 1년 전 | "발생일이 취득일 이전" |
| CA-10 | eventDate > transferDate → validate error | eventDate=양도 1개월 후 | "발생일이 양도일 이후" |
| CA-11 | 무상감자 ratio=1 → validate error | type=reduction_proportional, ratio=1 | "감자비율은 1 미만 (100% 감자는 청산)" |
| CA-12 | 시계열 무순서 입력 → 엔진 자동 정렬 | [{날짜B}, {날짜A}] (A < B) | applied 배열은 A→B 순 |

### 6.3 R-3·R-4 회귀 anchor

- R-3: 단위 테스트 불필요 (UI 메타). E2E·visual regression은 본 계획 범위 외.
- R-4: `acquisitionMode === "appraisal"` 케이스 0건 사전 grep 검증 → enum 제거 후 typecheck 0건이 anchor 역할. 검증 명령:
  ```bash
  grep -rn "appraisal" lib/tax-engine/stock-transfer/ lib/calc/stock-transfer-* lib/api/stock-transfer-* lib/stores/calc-wizard-stock-* app/calc/stock-transfer-tax/ __tests__/tax-engine/stock-transfer/ 2>/dev/null
  ```
  결과가 모두 placeholder·주석·dead-code임을 확인 후 제거.

### 6.4 회귀 anchor (기존 보존)

- 기존 PR-1/PR-2 anchor 345건 PASS 보존
- `case-49-unlisted-exchange.test.ts` 사례 49 (acquisitionMode="estimated") 변경 없음
- `case-13-19-valuation.test.ts` 시기별 연혁 5건 변경 없음

## 7. 14지점 동기화 (Definition of Done)

| # | 지점 | R-1' (매매사례가액) 변경 | R-2 (capital_adjustments) 변경 | R-4 (appraisal 제거) |
|---|---|---|---|---|
| ① | FormData 타입 (`calc-wizard-stock-store.ts`) | 6 신규 필드 (acq/transferMarketSample*) | `capitalAdjustments: CapitalAdjustmentForm[]` | `acquisitionMode` enum에서 `"appraisal"` 제거 |
| ② | INITIAL_FORM | 모두 ""/0/undefined | `[]` | default = "actual" 유지 |
| ③ | normalize | strField/numField/dateField | 배열 normalize | enumField allow-list 갱신 |
| ④ | API 변환 (`stock-transfer-tax-api.ts`) | 6 필드 spread | 배열 spread | dead-code 삭제 |
| ⑤ | UI 입력 위젯 | `MarketSampleBlock.tsx` 신규 (tone="amber") | `CapitalAdjustmentsBlock.tsx` 신규 (테이블 + add/remove) | Step2.tsx 라디오 옵션 제거 + 안내 카드 삭제 |
| ⑥ | 사이드바 합계 | 변경 없음 (취득가액에 흡수) | 변경 없음 | — |
| ⑦ | 결과 카드 | `MarketSampleDetailCard` (사례 표시 + 산식) | `CapitalAdjustmentsTimeline` (시계열 표 + 환산 산식) | — |
| ⑧ | Validation | 시장 유형 게이트 + ±3개월 warning | ratio 0~1 / split 모드 차단 / type 분기 | enum 통과만 |
| ⑨ | Zod enum 메인 | `acquisitionModeSchema` 확장 (`"market_sample"` 추가) | `capitalAdjustmentSchema` 신규 | `"appraisal"` 제거 |
| ⑩ | Zod 컴패니언 (`addStockRefines`) | market_sample + 상장시장 모순 차단 | split + adjustments 모순 차단 | — |
| ⑪ | acquisitionDate fallback | 변경 없음 | 변경 없음 | — |
| ⑫ | Zod 입력 객체 정의 | 6 필드 optional 추가 | 배열 optional 추가 | enum 갱신 |
| ⑬ | callTransferTaxAPI body spread | 6 필드 | 배열 | dead-code 삭제 |
| ⑭ | Route handler 엔진 input 매핑 | 6 필드 + sampleDate Date 변환 + STOCK_DATE_FIELDS 갱신 (`acquisitionMarketSampleDate`·`transferMarketSampleDate` + 배열 dot-notation `capitalAdjustments[].eventDate`) | 동상 | enum 갱신 |

**5단 파이프라인 전수 점검**: 폼(①②③) → 변환(④⑬) → fetch body(⑬) → Zod(⑨⑩⑫) → Route(⑪⑭) → 엔진 input.

## 8. PDCA 단계

### 8.1 Pre-Do (사전 검증)

- [x] **KoreanLaw MCP로 §176의2③·§17② 본문 정확 인용 검증 완료** (v2 작성 본 단계에서 수행)
- [ ] Pre-Do anchor 우선 작성 (MS-1·CA-1 각 1건) — 실패 메시지 확보 후 디자인 환류 (memory `feedback_pre_anchor_verification`)
- [ ] 기존 사례 49 회귀 통과 확인 (acquisitionMode="estimated" 보존)

### 8.2 Do (구현 순서 — Plan 병렬 / Do 시퀀셜)

1. **R-4 dead-code 제거**: appraisal enum + 안내 카드 삭제 (가장 침습 적음, 첫 단계로 회귀 0건 확인)
2. **R-1' 엔진**: `stock-valuation-market-sample.ts` 신규 (~120줄) + `marketSampleDetail` echo
3. **R-1' 14지점**: ①~⑭ 일괄
4. **R-1' anchor**: MS-1~MS-6
5. **R-2 엔진**: `stock-capital-adjustments.ts` 신규 (~150줄) + `capitalAdjustmentsDetail` echo
6. **R-2 14지점**: ①~⑭
7. **R-2 anchor**: CA-1~CA-8
8. **R-3 UI**: `PrRoadmapCard` 3-state 갱신 (R-1'·R-2 머지 후)
9. **회귀**: `npx vitest run __tests__/tax-engine/stock-transfer/` + 전체 `npm test`

### 8.3 Check

- [ ] `ui-engine-sync-checker` 호출 → 14지점 0 누락
- [ ] `npx tsc --noEmit` 0건
- [ ] anchor 신규 14건 (MS-1~6 + CA-1~8) 모두 PASS
- [ ] 회귀 0건 (현행 3,568 PASS 보존)
- [ ] **브라우저 수동 확인** — 비상장 라디오 → 매매사례 모드 → 6 필드 입력 → 결과 확인 / 무상증자 1행 추가 → 환산 단가 변동 확인 / 로드맵 카드 3-state 시각 확인

### 8.4 Act (디자인 환류)

- `stock-transfer-tax.engine.design.md:475` PR-2 잔여 표기 갱신 (R-1' 매매사례·R-2 자본준비금만 명시)
- `stock-transfer-tax.engine.design.md:364` "appraisal: (외부 감정가, PR-2)" 라인 정정 → "(시행령 §176의2③2호 단서 — 주식 양도세 적용 불가, 미구현)"
- `recent-completions.md` 항목 추가
- 메모리 `project_stock_transfer_pr2_remaining.md` 신규

## 9. 종료 조건

- [ ] R-1' (매매사례가액 모드) 엔진 + UI + anchor 6건 완료
- [ ] R-2 (무상증자·감자 자본준비금 분기) 엔진 + UI + anchor 8건 완료
- [ ] R-3 (로드맵 카드 3-state) UI 갱신
- [ ] R-4 (appraisal placeholder 삭제 + enum 정리) 완료
- [ ] 14지점 sync 100% (5단 파이프라인 grep 검증)
- [ ] TypeScript 0건
- [ ] 회귀 0건 (3,568 → ≥3,582 PASS)
- [ ] 브라우저 수동 확인 또는 미수행 명시
- [ ] PR-2 → PR-3 승급 (로드맵 카드 status 갱신)

## 10. 후속 (본 계획서 범위 외)

- 분할 매수(`lotsMode="split"`) + capital_adjustments 시계열 결합 — 후속 PR
- 의제배당 분(이익잉여금 무상증자·실질감자) 본격 처리 — 배당소득 도메인 (별도 엔진)
- 외국법인·해외상장(§94①3 다목) — 후속
- 매매사례가액 §98① 특수관계인 자동 검출 — UX 인텔리전스 후속

## 11. 위험 요소

| 위험 | 완화 |
|---|---|
| `acquisitionMode = "market_sample"` 신규 enum이 5단 파이프라인 어딘가에서 silent stripping | Pre-Do MS-2 (시장 게이트 error) 우선 작성으로 차단 + grep `acquisitionMode` 모든 매칭 점검 |
| 의제배당 vs 자본준비금 자본전입 구분 모호 → 사용자 오선택 | 입력 toggle 4-state 분리(`bonus_capital_reserve` / `bonus_retained_earnings` / `reduction_loss_offset` / `reduction_capital_return`) + 각 선택지에 도움말 hint + 의제배당 분기는 warning 발동 후 skip |
| 무상증자 시 단가 floor로 1원 손실 (1,000주 × 0.5 = 1,500 / 1억 ÷ 1,500 = 66,666.67 → 66,666) | 총 취득원가 불변 보장 — `totalCost / adjustedShareCount` floor만 1주당 표시용. 양도차익 계산 시 `totalCost` 직접 사용 (계약상 floor 손실 차단) |
| Split 모드 + capital_adjustments 조합 미구현 → 사용자 혼란 | Zod refine + validate에서 "단건 모드 전용" error + UI에서 split 활성 시 capital_adjustments 섹션 disabled |
| `appraisal` enum 제거 시 sessionStorage 기존 사용자 값 있을 경우 normalize 에러 | `enumField` allow-list에서 제외 시 default(`"actual"`)로 자동 마이그레이션 — `calc-wizard-stock-normalize.ts` |
| 매매사례 ±3개월 초과 시 error vs warning | warning 채택 (사용자 책임 영역 — 세무서 결정·경정 시 부인 가능성만 안내). 시행령 §176의2③1호 본문은 "3개월 이내" 본칙이나, 사용자가 결정·경정 단계 외에서 자율 산정하는 경우 차단보다 안내가 합리적 |
| 사용자가 input.shareCount(양도 주식수)와 adjustedShareCount(취득가액 분모) 혼동 | UI 결과 카드에 두 수치 명시적 라벨 분리 + Sidebar에서는 양도 주식수만 표시 (취득 분모는 결과 상세에만) |
