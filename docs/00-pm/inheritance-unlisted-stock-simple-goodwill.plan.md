# 비상장주식 간편평가(V1) 영업권(§59②) 가산 — 계획서

> 작성일 2026-05-27 · 세목: 상속세·증여세 (비상장주식 보충적 평가)
> 작성: inheritance-gift-tax-senior(엔진) + inheritance-gift-tax-ui-senior(UI) 병렬 참여 → 통합
> **상태**: ✅ **구현됨** (2026-08-05 코드 실측) — `e2e/inheritance-unlisted-simple-goodwill.spec.ts` 가 이 계획서를 인용하며 실재한다.
> ⚠️ **산출물 실재까지만 확인했다** — 개별 Phase 완주 여부는 감사하지 않았다.
> ~~종전 표기: 상태: **Plan** (Do 진입 전 Pre-Do anchor 1건 우선 검증 필요)~~

---

## 0. 배경 / 문제

비상장주식 **간편평가(V1)** 는 사용자가 입력한 회사 전체 순자산가치(`netAssetValue`)를 그대로 발행주식수로 나누어 1주당 순자산가치를 산정한다. **영업권(상증법 §55③ + §59②)을 전혀 반영하지 않는다.**

반면 **정식평가(V2)** 는 별지 부표3 제5쪽 「6.영업권」을 통해 영업권을 평가하고, 순자산가액에 가산한다(`unlisted-orchestrator.ts` STEP 6).

→ V1은 §55③(영업권 가산 강행 규정)을 미구현한 **법령 불일치 상태**. 본 PR은 V1에도 영업권을 평가하여 영업권이 0을 초과하면 순자산가치에 가산한다.

### 핵심 발견 — 신규 필수 입력 0건

영업권 산식의 입력값을 간편평가가 **이미 모두 보유**한다:

| 영업권 산식 입력 | 간편평가 보유 필드 |
|---|---|
| 가. 회사 전체 3년 가중평균 순손익액 (§59③ 준용 §56①) | `netIncomeY1~Y3` (또는 legacy `weightedNetIncome`) |
| 다. 평가기준일 현재 자기자본 (= §55① 영업권 포함 전 순자산) | `netAssetValue` |
| 라. 이자율 | 상증규 §19① **법정 10% 고정** (입력 불필요) |
| §55③ 1·2호 배제 사유 | `assetValueOnlyReason` (§54④ 사유) |
| §55③ 3호 (직전 3년 계속 결손) | `netIncomeY1~Y3` 에서 도출 |

→ 영업권 엔진 `lib/tax-engine/property-valuation/goodwill.ts`의 `calcGoodwill()` 을 **그대로 재사용**. 동기화 지점은 사실상 **⑤(미리보기)·⑦(결과 breakdown)** 만 영향.

---

## 1. 법령 근거

> 법령 인용은 `goodwill.ts` 헤더(KoreanLaw 검증 2026-05-22)에 이미 검증 완료. legal-codes 상수도 기존재(§4.3). Do 단계에서 §55③ 3호 "0 이하" 자구만 KoreanLaw 재확인.

- **상증법 §55③**: §55① 순자산가액에 §59② 영업권 가액을 **가산한다**(강행). 단서로 다음 배제:
  - 1호: §54④ 1호(청산·해산·합병) 또는 3호(부동산 80%)
  - 2호: §54④ 2호(사업개시 3년 미만·휴·폐업) — 무체재산권 현물출자 합산 3년 이상은 제외(본 PR 미적용)
  - 3호: 평가기준일 직전 **3개 사업연도 순손익액이 모두 0 이하**(계속결손법인)
- **상증령 §59②③**: 초과이익금액 5년 연금현가 환산. 가중평균 순손익은 §56①·② 준용(1주당 아닌 **회사 전체 금액**).
- **상증규 §19①**: §59② "재정경제부령이 정하는 율" = **100분의 10**.
- **§54④ 5호(주식 80%)·6호(잔여 3년)는 §55③ 배제 대상 아님** → 해당 법인도 영업권 가산.

legal-codes 상수 (기존재 — 신설 불필요):
`VALUATION.UNLISTED_GOODWILL_INCLUDE`(§55③) · `GOODWILL_FORMULA`(§59②) · `GOODWILL_NET_INCOME`(§59③) · `GOODWILL_RATE`(상증규 §19①).

---

## 2. 설계 결정 (권고안)

| # | 결정 | 권고 | 근거 |
|---|---|---|---|
| D-1 | 영업권 적용 방식 | **(A) 항상 자동 가산 (토글 없음)** | §59②는 "평가한다" 강행 규정. 사용자 요청("0 이상이면 감안")과 부합. 동기화 지점 ⑤만 영향. ↔ (B)옵션 토글은 법령 의도 위반 + ①②③④⑤⑧ 전부 확장 |
| D-2 | 영업권 이자율 | **10% 하드코딩 (입력 미노출)** | 상증규 §19① 법정 고정. 입력 노출 시 혼란 + 동기화 지점 확장 |
| D-3 | §55③ 3호 계속결손 | **`netIncomeY1~Y3` 에서 엔진 내부 도출** (명시 override 필드 없음 — R2-1) | "간편" 철학상 별도 입력 회피. 3년치는 직전 1·2·3 사업연도 그 자체 → deterministic 법령 판정. 자동 안분 fallback과 무관 |
| D-4 | 영업권 산식 가중평균 floor | **`Math.max(0, Math.floor((Y1×3+Y2×2+Y3×1)/6))`** | V2 오케스트레이터(`companyWeighted3y`)와 일관. V1 기존 `resolveWeightedNetIncome`(floor 없음)과 별도 헬퍼로 분리 |

> D-1~D-4는 권고안이며 사용자 검토 대상. (A)·하드코딩·도출이 법령 정합 + 최소 변경.

---

## 3. 엔진 변경 명세 (`property-valuation-stock.ts`)

### 3.1 타입 변경 — **없음** (신규 필드 0건, 전부 기존 필드에서 도출)

`UnlistedStockData`에 **신규 필드를 추가하지 않는다.** 영업권 산식 입력은 기존 필드(`netIncomeY1~Y3`·`weightedNetIncome`·`netAssetValue`·`assetValueOnlyReason`)에서 모두 도출:

- `intangibleDeduction`(아. 무체재산권 차감): **V1 범위 제외** (정식평가 V2 영역). `calcGoodwill`에 전달하지 않음 → 기본값 0.
- `isContinuousLossLastThreeYears`(§55③ 3호): **엔진 내부 도출** (§3.3) — 명시 override 필드 불필요.
- `goodwillRate`: 추가 안 함 (D-2, 상증규 §19① 법정 10% 고정).

> **★ Zod strip 검증 (C2)**: `lib/validators/property-valuation-input.ts`의 `unlistedStockDataSchema = z.object({...})`는 unknown 키를 strip한다. 신규 필드를 추가해 wire(client→API→engine)로 보내려면 이 스키마에 반드시 등록해야 하고(누락 시 침묵 strip — 14지점 ⑫⑬⑭), normalize·initial까지 동기화가 필요하다. **전부 기존 필드 도출로 설계하여 Zod·normalize·initial 변경 0건 + strip 위험 원천 제거.**

### 3.2 enum 매핑 헬퍼 (내부 pure, export 불필요)

V1 `UnlistedAssetValueOnlyReason`(`...stock_80...`) ↔ goodwill `UnlistedNetAssetOnlyReason`(`...stock_holding_80...`) 불일치 해소.

```ts
function mapToNetAssetOnlyReason(
  r: UnlistedAssetValueOnlyReason | undefined,
): UnlistedNetAssetOnlyReason | undefined {
  if (!r) return undefined;
  const map: Record<UnlistedAssetValueOnlyReason, UnlistedNetAssetOnlyReason | undefined> = {
    liquidation:    "liquidation",
    lt3y:           "lt3y",
    real_estate_80: "real_estate_80",
    stock_80:       undefined,   // §55③ 배제 대상 아님 → 영업권 정상 가산
    remaining_3y:   undefined,   // §55③ 배제 대상 아님 → 영업권 정상 가산
  };
  return map[r];
}
```

> `calcGoodwill`의 §55③ 배제 판정은 `liquidation·real_estate_80·lt3y`만 사용하므로 `stock_80`↔`stock_holding_80` 자구 차이는 영업권 결과에 무영향. 단 타입 안전을 위해 매핑 필수.

### 3.3 계속결손 도출 헬퍼

```ts
function deriveContinuousLoss(data: UnlistedStockData): boolean {
  const has3y = data.netIncomeY1 != null && data.netIncomeY2 != null && data.netIncomeY3 != null;
  if (!has3y) return false; // 일부 미입력 = 판정 유보
  return (data.netIncomeY1 ?? 0) <= 0 && (data.netIncomeY2 ?? 0) <= 0 && (data.netIncomeY3 ?? 0) <= 0; // §55③ 3호: "0 이하"
}
```

> **★ 수치 중복성 (C3)**: 직전 3년이 모두 ≤0이면 가중평균 ≤0 → `resolveWeightedNetIncome3yForGoodwill`이 `max(0,…)=0` → 나=0 → 초과이익 `max(0, 0−마)=0` → **goodwillFinal은 이미 0**. 즉 `deriveContinuousLoss`는 **`excludedByLaw="continuous_loss_3y"` 라벨을 부여하기 위한 것**이며 수치 결과를 바꾸지 않는다. 단, "일부만 적자라 가중평균 ≤0"(전부 ≤0 아님)인 경우와 구분되어 UI 배제 사유 문구가 정확해진다(계속결손 vs 초과이익 0).

### 3.4 가중평균 헬퍼 (영업권 전용, floor)

```ts
function resolveWeightedNetIncome3yForGoodwill(data: UnlistedStockData): number {
  const has3y = data.netIncomeY1 != null || data.netIncomeY2 != null || data.netIncomeY3 != null;
  if (has3y) {
    const raw = ((data.netIncomeY1 ?? 0)*3 + (data.netIncomeY2 ?? 0)*2 + (data.netIncomeY3 ?? 0)*1) / 6;
    return Math.max(0, Math.floor(raw));
  }
  return Math.max(0, Math.floor(data.weightedNetIncome ?? 0)); // legacy fallback
}
```

### 3.5 `calcUnlistedStockPerShareValue` 본문 변경

현행 `const perShareAssetValue = calcPerShareNetAssetValue(data.netAssetValue, data.totalShares);` 직전에 삽입:

```ts
// §55③: 영업권(§59②) 평가 후 순자산 가산
const goodwill = calcGoodwill({
  weightedAvg3y: resolveWeightedNetIncome3yForGoodwill(data),
  selfCapital: Math.max(0, data.netAssetValue),         // 다. §55① 영업권 포함 전 순자산
  // rate 생략 → goodwill.ts 기본 0.10 (상증규 §19①)
  // intangibleDeduction 미전달 → V1 범위 제외(기본 0)
  netAssetOnlyReason: mapToNetAssetOnlyReason(data.assetValueOnlyReason),
  isContinuousLossLastThreeYears: deriveContinuousLoss(data),
});
const netAssetWithGoodwill = Math.max(0, data.netAssetValue) + goodwill.goodwillFinal;
const perShareAssetValue = calcPerShareNetAssetValue(netAssetWithGoodwill, data.totalShares);
```

### 3.6 반환 타입 echo + breakdown

반환 타입에 echo 추가 (UI 미리보기가 `ReturnType<typeof calcUnlistedStockPerShareValue>` 직접 사용 → **자동 전파**):

```ts
{
  perShareIncomeValue, perShareAssetValue, perShareWeightedValue,
  perShareMinValue, perShareFinalValue,
  goodwill,              // UnlistedGoodwillResult (echo — UI 산출근거·배제사유 표시용)
  netAssetWithGoodwill,  // 영업권 가산 후 회사 전체 순자산 (echo)
}
```

`evaluateUnlistedStock` breakdown: `goodwill.goodwillFinal > 0` 시 "영업권 (§59②)" 줄 + "1주당 순자산가치 (영업권 포함)" 라벨로 갱신. `lawRef`는 기존 `VALUATION.GOODWILL_FORMULA` / `UNLISTED_GOODWILL_INCLUDE` 사용.

### 3.7 §54④ × 영업권 상호작용 매트릭스 (V2 일관성)

| assetValueOnlyReason | §55③ 배제 | goodwillFinal | perShareAssetValue | perShareFinalValue |
|---|---|---|---|---|
| 미입력(일반) | 없음 | ≥0 | netAsset+goodwill | max(가중평균, 순자산×80%) |
| liquidation(1호) | 1호 배제 | 0 | netAsset | 무조건 순자산 |
| lt3y(2호) | 2호 배제 | 0 | netAsset | 무조건 순자산 |
| real_estate_80(3호) | 1호 배제 | 0 | netAsset | 단서: 가중평균<순자산이면 순자산 |
| stock_80(5호) | 배제 없음 | ≥0 | netAsset+goodwill | 단서: 가중평균<순자산이면 순자산 |
| remaining_3y(6호) | 배제 없음 | ≥0 | netAsset+goodwill | 무조건 순자산 |

---

## 4. UI 변경 명세

### 4.1 8개 동기화 지점 (분기 A 채택 시)

| 지점 | 영향 | 작업 |
|---|---|---|
| ① 폼 타입 | 없음 | (영업권 입력 없음) |
| ② initial | 없음 | — |
| ③ normalize | 없음 | — |
| ④ API 변환 | 없음 | estateItems 통째 전달 — 신규 전송 필드 없음 |
| ⑤ UI 위젯 | **있음** | `UnlistedStockPreview` echo 줄 + 산출근거 펼침 + §55③ amber 배지 + 순자산 hint 갱신 |
| ⑥ 사이드바 | **자동(값 변동)** | `StockValuationForm` effectiveValuation·"주식 합계(예상)"이 `perShareFinalValue×ownedShares`로 자동 증가 (코드 변경 없음, 검증만) |
| ⑦ 결과 카드 | 자동 | 엔진 breakdown 줄 추가가 자동 렌더 |
| ⑧ validation | 없음 | 신규 입력 없음 (C2 — Zod·validate 무변경 보장) |

> 분기 B(토글/이자율 입력) 채택 시 ①②③④⑤⑧ 확장 — 권고 안 함.

### 4.1.1 V1 평가 함수 소비자 전수 (C1 — `calcUnlistedStockPerShareValue` grep 확인)

영업권은 `calcUnlistedStockPerShareValue` 한 곳 수정으로 아래 **모든 소비자에 자동 전파**된다:

| 소비자 | 사용 값 | 영향 |
|---|---|---|
| `lib/tax-engine/valuation/resolve-estate-item-value.ts:86` | `perShareFinalValue × ownedShares` | **실제 평가액** — 세액·인적공제·§22·가업·협의분할 perHeir에 반영 (`inheritance-deduction-suggest.ts`가 위임) |
| `lib/tax-engine/property-valuation-stock.ts` `evaluateUnlistedStock` | breakdown + valuatedAmount | 결과 카드(⑦) |
| `components/calc/UnlistedStockSimpleFields.tsx:181` | preview (ReturnType) | 입력 미리보기(⑤) |
| `components/calc/StockValuationForm.tsx:325·450` | effectiveValuation·합계 | 사이드바(⑥) |

> ⚠️ **C6 (범위외 관찰)**: `resolve-estate-item-value.ts:86`은 `isRealEstateHeavy`를 `false`로 하드코딩(실제 세액 경로가 부동산과다보유 가중치를 미반영하는 기존 dual-truth). **영업권은 가중치를 사용하지 않으므로 본 PR과 무관** — 별도 트랙. 본 PR은 이 동작을 변경하지 않는다.

### 4.2 `UnlistedStockPreview` 산출근거 — 이미지25 구조 4줄 (R2-5)

엔진 계산 순서 = UI 표시 순서. **이미지25(㉮~㉱)와 동일 구조**로 표시(단위 혼선 제거 — 회사 전체 ㉮㉯㉰ → 1주당 ㉱):

| 표기 | 줄 | 값(echo) | 단위 |
|---|---|---|---|
| ㉮ | 영업권 포함 전 순자산가액 | `max(0, netAssetValue)` | 회사 전체 |
| ㉯ | 영업권 평가액 (§59②) ▼산출근거 | `goodwill.goodwillFinal` | 회사 전체 |
| ㉰ | 영업권 포함 순자산가액 | `netAssetWithGoodwill` | 회사 전체 |
| ㉱ | 1주당 순자산가치 | `perShareAssetValue` (= ㉰ ÷ 발행주식수) | 1주당 |

- 기존 "1주당 순자산가치" 줄을 ㉱로 대체(이제 영업권 포함). `goodwillFinal=0`이면 ㉯·㉰는 *"영업권 0 — 미가산"* 으로 축약, ㉱는 종전과 동일값.
- ㉯ ▼산출근거 펼침(echo-field-pattern · formula-display-builder): 가(가중평균)·나(가×50%)·다(자기자본=㉮)·마(다×10%)·초과이익(나−마, 음수0)·자(영업권 평가액) 6줄. 변수 약어·`floor()` 금지, 한국어 풀어쓰기. `print-only-css-toggle`로 인쇄 시 자동 펼침.
- 이 4줄은 "1주당 순손익가치" 줄과 "가중평균(순손익×3 + 순자산×2 ÷5)" 줄 **사이**에 위치(가중평균이 ㉱를 입력으로 쓰므로).

> **★ 미리보기 vs 결과 카드 구분 (IC-1)**: ㉮㉯㉰㉱ + 산출근거 6줄 펼침은 **입력 미리보기(`UnlistedStockPreview`, ⑤)** 전용 — `calcUnlistedStockPerShareValue` echo(`goodwill`·`netAssetWithGoodwill`)를 직접 받기 때문. **결과 카드(⑦)** 는 `evaluateUnlistedStock`의 `PropertyValuationResult.breakdown`만 받으므로(echo 없음) "영업권 (§59②)" 줄 + "1주당 순자산가치(영업권 포함)" 라벨 수준으로 표시. 결과 카드에 6줄 산출근거가 필요하면 breakdown에 가/나/마/초과이익 줄을 추가해야 하나, 본 PR은 미리보기에 산출근거 집중·결과 카드는 영업권 줄 1개로 한정.

### 4.3 순자산 입력 hint 갱신 + 안내 박스

- 기존 hint "총자산 − 총부채" → **"영업권 포함 전 자기자본(= 총자산 − 총부채). 영업권은 §59②에 따라 자동 산출·가산됩니다."**
- `netIncomeY1~Y3` 모두 입력되어 영업권 미리계산이 가능할 때만 sky/indigo 안내 박스 노출(조건부).

### 4.4 §55③ 배제 표시 (amber)

엔진 echo `goodwill.excludedByLaw` **우선** 표시(`liquidation`/`real_estate_80`/`lt3y`/`continuous_loss_3y` → 한국어 사유). echo 없을 때만 UI가 3호(3년 ≤0) 독립 판정 fallback. → UI-engine dual-truth 회피([[feedback_ui_engine_dual_truth_avoidance]]).

> **R2-6 amber 중첩 방지**: 3년 계속결손은 기존 "적자법인 — 순손익가치 0" amber 경고와 동시 발생한다. 두 메시지를 별개 박스로 쌓지 말고, `excludedByLaw="continuous_loss_3y"` 시 영업권 배제 문구를 **적자법인 경고 안에 통합 한 줄**로 표기(중복 amber 박스 금지).

### 4.5 UX/회귀 위험

| 위험 | 대응 |
|---|---|
| 기존 간편평가 결과 증가 | sky 안내 + 산출근거 펼침으로 투명성. 법령상 정당 |
| 미리보기 무한루프 | `useMemo` + 엔진 헬퍼 단일 출처 유지. UI 영업권 재계산 금지 |
| 800줄 경계 | 추가 줄로 임계 시 `UnlistedStockPreviewSection.tsx` 분리 |
| §55③ 이중 판정 | echo 우선, UI는 fallback (4.4) |

---

## 5. Pre-Do Anchor (Do 진입 전 1건 우선 — [[feedback_pre_anchor_verification]])

**파일**: `__tests__/tax-engine/property-valuation-stock-goodwill.test.ts` (신규)

PDF 사례 5 = 사용자 첨부 이미지25 (발행 20,000주, 순자산 100,000,000−40,000,000=60,000,000):

```ts
it("[V1-GW-1] PDF 사례 5(이미지25) 영업권 가산 — 1주당 순자산 4,587원 (현행 RED)", () => {
  const data: UnlistedStockData = {
    totalShares: 20_000, ownedShares: 10_000,
    netIncomeY1: 23_500_000, netIncomeY2: 40_000_000, netIncomeY3: 22_000_000,
    netAssetValue: 60_000_000, capitalizationRate: 0.10, weightedNetIncome: 0,
  };
  const r = calcUnlistedStockPerShareValue(data, false);
  // 엔진은 정확 연금현가 Σ(1/1.1^n)=3.79078676… 사용 → 31,747,839
  // PDF는 표 4자리 3.7908 → 31,747,950 (111원 차이, goodwill.ts 주석 문서화)
  expect(r.goodwill.goodwillFinal).toBe(31_747_839); // 현행 RED (필드 부재)
  // ★ floor 절사가 111원 차이를 흡수 → 1주당은 PDF와 동일 4,587원
  expect(r.perShareAssetValue).toBe(4_587);          // 현행 3,000(60,000,000/20,000) → 구현 후 4,587
});
```

검증 경로: 가중평균 (23,500,000×3+40,000,000×2+22,000,000×1)/6 = **28,750,000** → 나 14,375,000 → 다 60,000,000 → 마 6,000,000 → 초과이익 8,375,000 → 사/자 **31,747,839**(엔진) / 31,747,950(PDF 표) → 영업권 포함 순자산 91,747,839 ÷ 20,000 = 4,587.39 → floor **4,587원**(PDF 일치).

> **영업권 중간값 111원 차이는 PDF 표 반올림(3.7908) 사유** — `goodwill.ts`에 기존 문서화. 1주당 순자산가치는 floor 절사로 PDF와 정확히 일치(1원 tolerance 범위). 연금현가 계수 하드코딩(3.7908)은 V2 공유 `goodwill.ts` 회귀 위험으로 **미채택** — 정확값 + 표 반올림 메모 유지.
> 현행 엔진은 `goodwill` 필드·가산이 없어 RED. 실측 후 디자인 환류. "현행 일치 예상" 가정 금지.

---

## 6. 케이스 인벤토리 (anchor 10건 — `property-valuation-stock-goodwill.test.ts`)

| ID | 케이스 | 기대 |
|---|---|---|
| V1-GW-1 | PDF 사례 5(이미지25) 영업권 양수 | goodwillFinal 31,747,839 (PDF 표 31,747,950, 111원 차이) / perShareAssetValue **4,587** (20,000주, PDF 일치) |
| V1-GW-2 | 초과이익 음수 (사례 6) | goodwillFinal 0 / 순자산 불변 / `excludedByLaw` undefined |
| V1-GW-3 | liquidation (§55③1호) | goodwillFinal 0 / `excludedByLaw="liquidation"` |
| V1-GW-4 | lt3y (§55③2호) | goodwillFinal 0 / `excludedByLaw="lt3y"` |
| V1-GW-5 | real_estate_80 (§55③1호) | goodwillFinal 0 / `excludedByLaw="real_estate_80"` |
| V1-GW-6 | 3년 계속결손 도출 (모두 ≤0) | goodwillFinal 0 (가중평균≤0로 이미 0) / **`excludedByLaw="continuous_loss_3y"`** (라벨 검증, C3) |
| V1-GW-7 | stock_80 (배제 없음, 영업권 양수) | goodwillFinal >0 가산 / `excludedByLaw` undefined |
| V1-GW-8 | remaining_3y (배제 없음, 영업권 양수) | goodwillFinal >0 가산 / `excludedByLaw` undefined |
| V1-GW-9 | legacy fallback (netIncomeY1~Y3 미입력, weightedNetIncome=28,750,000) | goodwillFinal 31,747,839 (GW-1 동일) |
| V1-GW-10 | 자본잠식 (netAssetValue=−5,000,000, Y1~Y3 양수로 가중평균>0) → selfCapital 0 | 마=0 → 초과이익=나 → goodwillFinal>0 / netAssetWithGoodwill = goodwillFinal (음수 순자산 0 가드 후 영업권만) |

> 무체재산권 차감(`intangibleDeduction`)·명시 override는 V1 범위 제외 — 해당 anchor 삭제(C4). `calcGoodwill` 자체의 무체재산권 차감은 V2 테스트가 이미 커버.

---

## 7. 회귀 영향 (기존 anchor 재산정)

영업권을 무조건 가산하므로 `calcUnlistedStockPerShareValue`/`evaluateUnlistedStock`/`resolveEstateItemValue`를 쓰는 기존 anchor 중 **영업권>0가 되는 케이스**가 깨진다. Do 단계 전수 검토 필요:

- `netIncomeY1~Y3`(또는 weightedNetIncome>0) 입력 + `netAssetValue>0` + 배제사유 없는 anchor → perShareAssetValue/perShareWeightedValue/perShareFinalValue/valuatedAmount 상승.
- **5호(stock_80)·6호(remaining_3y)도 변동**: §55③ 배제 대상 아님 → 영업권 가산되어 perShareAssetValue/final 상승. (1·2·3호와 달리 변함)
- **무변화**: 적자법인(가중평균≤0 → 영업권 0)·§54④ 1·2·3호 배제·자본잠식(selfCapital 0이어도 영업권 양수면 변동) anchor 중 영업권 0인 것.
- **간접 영향 테스트**: `resolve-estate-item-value` 경유 상속·증여 통합 anchor(비상장 simple 보유 시 총상속재산·공제·세액)와 `unlisted-stock-deficit-negative.test.ts`(자본잠식)·`inheritance/` 통합 테스트 전수 grep 필요.
- **전략**: 배제 사유 주입 또는 영업권 정합값으로 재산정([[feedback_anchor_correction_legal_priority]]). legacy 저장 데이터도 영업권 적용됨(법령 정합) — 주석 명시. [[feedback_numeric_impact_verify_before_bug_claim]] — 재산정 전 실패 anchor로 변동 실증.

---

## 8. e2e (`e2e/inheritance-unlisted-simple-goodwill.spec.ts`)

GW-1 영업권 줄 노출 / GW-2 산출근거 6줄 펼침 / GW-3 hint "영업권 포함 전" / GW-4 안내 박스 / GW-5 3년 음수 → amber 배제 / GW-6 영업권0 시 순자산 동일 / GW-7 영업권>0 시 가산 후 증가 / GW-8 부동산과다보유 토글 회귀.

> 브라우저 확인은 Playwright e2e로 충족 ([[feedback_browser_verify_with_playwright]]).

---

## 9. 변경 파일 요약

| 파일 | 유형 | 내용 |
|---|---|---|
| `property-valuation-stock.ts` | 함수 | `calcUnlistedStockPerShareValue` 영업권 가산 + 헬퍼 3개(`mapToNetAssetOnlyReason`·`deriveContinuousLoss`·`resolveWeightedNetIncome3yForGoodwill`) + 반환 echo(`goodwill`·`netAssetWithGoodwill`) + `evaluateUnlistedStock` breakdown |
| `components/calc/UnlistedStockSimpleFields.tsx` | UI | `UnlistedStockPreview` echo 줄·펼침·amber·hint (⑤) |
| `__tests__/tax-engine/property-valuation-stock-goodwill.test.ts` | 신규 | V1-GW-1~10 |
| `__tests__/tax-engine/property-valuation-stock.test.ts` 및 관련 통합 anchor | 수정 | 영업권>0 anchor 재산정 (§7) |
| `e2e/inheritance-unlisted-simple-goodwill.spec.ts` | 신규 | GW-1~8 |

> **타입 변경 없음**(C2 — 신규 필드 0건). `legal-codes` 상수도 기존재 — 신설 없음. **상속세·증여세 양쪽 적용**(C5 — 공유 엔진 + `UnlistedStockSimpleFields` `mode` prop). 변경 파일은 단 2개(엔진 1 + UI 1) + 테스트.

---

## 10. Do 진입 전 체크리스트

- [ ] Pre-Do anchor V1-GW-1 작성·실행 → RED 확보 → 실측 환류
- [ ] 사용자 설계 결정 D-1~D-4 확인 (특히 D-1 자동 가산)
- [ ] `UnlistedStockSimpleFields.tsx` 현행 줄 수 → 800줄 임계 시 분리 골격 사전 설계
- [ ] KoreanLaw로 §55③ 3호 "0 이하" 자구 재확인
- [ ] 기존 anchor 재산정 범위 엔진↔테스트 정렬
- [ ] 14지점 중 ⑤⑦ 외 무영향 grep 자가 점검
