# 주식 양도소득세 — 대주주 판정 교재 정합화 (Phase A·B) 엔진 설계 v2

> Plan 문서: [`docs/00-pm/stock-major-shareholder-textbook-alignment.plan.md`](../../00-pm/stock-major-shareholder-textbook-alignment.plan.md) v4
> UI 측 명세: `stock-major-shareholder-textbook-alignment.ui.design.md` v2
> 작성: 2026-05-19 (v2 — 1·2차 검토 + Plan 통합 반영)
> 법령 검증 정책: KoreanLaw MCP 검증 생략 (사용자 지시) — 교재(소득세법 강의서 §3장) 표기 채택
> v1 → v2 변경: §6 `appliedThreshold` 5→7필드 정정, `buildAppliedThreshold` 헬퍼 명시, PHB-04 회귀 위험 케이스 구체화

---

## Context

선행 PR(2026-05-17 `stock-transfer-applied-threshold-sync`)에서 UI ↔ 엔진 단일 진실 정합화 완료. 그러나 `stock-rate-tables.ts` 시기별 매트릭스 자체에 교재 대비 4개 매트릭스 행 누락(F-01·F-02·F-03) + 비상장 벤처기업 시총 임계 분기 누락(F-05).

본 디자인은 **Phase A (시기별 매트릭스 행 추가) + Phase B (비상장 벤처 임계 분기)** 의 엔진 명세. Phase C(UI hint 9종)는 별도 ui.design.md.

---

## ★ 케이스 인벤토리

| # | 시나리오 | 필수 입력 (anchor용) | 법령/교재 근거 | anchor 출처 | 테스트 파일 | 상태 |
|---|---|---|---|---|---|---|
| PHA-01 | 2016-03-31 이전 코스피 — 현행 임계 유지 | marketType="kospi" / priorYearEndDate=2016-03-31 | 시행령 §157 (2016.4.1. 개정 이전) | 현행 행 회귀 | `textbook-alignment-thresholds.test.ts` | ☐ TODO |
| PHA-02 | 2016-04-01 코스피 — F-01 신설 행 | marketType="kospi" / priorYearEndDate=2016-04-01 | 시행령 §157 (2016.4.1. 개정) — 교재 ⑤ 1%/25억 | 교재 §3장 이미지 48 ⑤ | `textbook-alignment-thresholds.test.ts` | ☐ TODO |
| PHA-03 | 2016-03-31 코스닥 — 현행 임계 유지 | marketType="kosdaq" / priorYearEndDate=2016-03-31 | 시행령 §157 (2013.8.29. 개정 이후) | 현행 행 회귀 | `textbook-alignment-thresholds.test.ts` | ☐ TODO |
| PHA-04 | 2016-04-01 코스닥 — F-02 신설 행 | marketType="kosdaq" / priorYearEndDate=2016-04-01 | 시행령 §157 (2016.4.1. 개정) — 교재 ⑤ 2%/20억 | 교재 §3장 이미지 48 ⑤ | `textbook-alignment-thresholds.test.ts` | ☐ TODO |
| PHA-05 | 2016-03-31 비상장 — 현행 임계 유지 (★ v3 정정) | marketType="unlisted" / priorYearEndDate=2016-03-31 | 시행령 §167의8 (2016.1.1.~3.31. 교재 미명시) | 현행 행 회귀 — 추정 금지 | `textbook-alignment-thresholds.test.ts` | ☐ TODO |
| PHA-06 | 2016-04-01 비상장 — F-03 신설 행 | marketType="unlisted" / priorYearEndDate=2016-04-01 | 시행령 §167의8 (2016.4.1. 개정) — 교재 ⑤ 2%/50억 | 교재 §3장 이미지 48 ⑤ | `textbook-alignment-thresholds.test.ts` | ☐ TODO |
| PHA-07 | 2024-01-01 4종 시장 회귀 | priorYearEndDate=2024-01-01, marketType=각 시장 | 시행령 §157·§167의8 현행 | 현행 행 회귀 | `textbook-alignment-thresholds.test.ts` | ☐ TODO |
| PHA-08 | 2020-04-01 4종 시장 회귀 | priorYearEndDate=2020-04-01, marketType=각 시장 | 시행령 §157·§167의8 (2020.4.1. 개정) | 현행 행 회귀 | `textbook-alignment-thresholds.test.ts` | ☐ TODO |
| PHB-01 | 비상장 벤처 시총 30억 → 비대주주 (40억 미달) | marketType="unlisted" / isVentureCompany=true / selfMarketCap=3,000,000,000 / selfShareRatio=0.01 | 시행령 §167의8①2호 나목 — 교재 §3장 이미지 48 ⑤ 별도 컬럼 | 교재 §3장 | `textbook-alignment-venture.test.ts` | ☐ TODO |
| PHB-02 | 비상장 벤처 시총 45억 → 대주주 (40억 초과) | marketType="unlisted" / isVentureCompany=true / selfMarketCap=4,500,000,000 / selfShareRatio=0.01 | 시행령 §167의8①2호 나목 단서 | 교재 §3장 | `textbook-alignment-venture.test.ts` | ☐ TODO |
| PHB-03 | 비상장 비벤처 시총 15억 → 대주주 (10억 초과) | marketType="unlisted" / isVentureCompany=false / selfMarketCap=1,500,000,000 | 시행령 §167의8①2호 (현행) | 현행 행 회귀 | `textbook-alignment-venture.test.ts` | ☐ TODO |
| PHB-04 | 회귀 — 기존 비상장 anchor 전체 (벤처 입력 누락 허용) | 기존 비상장 테스트의 모든 입력 + `isVentureCompany?: undefined` | optional default | 기존 anchor 회귀 | 기존 `__tests__/tax-engine/stock-transfer/` | ☐ TODO |

---

## STEP 0 — 사전 점검

**파일 영향 매트릭스**:

| 파일 | Phase A 변경 | Phase B 변경 |
|---|---|---|
| `lib/tax-engine/stock-transfer/stock-rate-tables.ts` | KOSPI·KOSDAQ·UNLISTED 매트릭스 행 1건씩 추가 (총 3행), `MajorShareholderThreshold` 인터페이스에 `ruleSource?`·`isVentureRule?` 신설 | `getMajorShareholderThreshold()` 시그니처 `options?: { isVentureCompany?: boolean }` 추가, 분기 로직 |
| `lib/tax-engine/stock-transfer/stock-classification.ts` | (변경 없음 — 매트릭스 조회만 영향) | `judgeIsMajorShareholder()` 에서 `input.isVentureCompany` 를 options로 전달, `ClassificationResult.appliedThreshold` 확장 |
| `lib/tax-engine/stock-transfer/types/stock-transfer.types.ts` | (변경 없음) | `ClassificationResult.appliedThreshold` 에 `isVentureRule?`·`ruleSource?` optional 필드 추가 |
| `lib/tax-engine/stock-transfer/stock-transfer-tax.ts` | (변경 없음) | (간접 영향 — TypeScript 자동 감지, propagation 검증만) |

**파일 분할 정책**: 변경 후 파일 크기 점검 — `stock-rate-tables.ts` 현재 ~210 lines, +20 line 예상. 800 line 정책 무관.

---

## STEP 1 — Phase A: 시기별 매트릭스 행 추가

### 1.1 코스피 (`KOSPI_MAJOR_THRESHOLDS`)

기존 행 사이에 F-01(2016-04-01) 신설:

```ts
export const KOSPI_MAJOR_THRESHOLDS: MajorShareholderThreshold[] = [
  { from: new Date("2024-01-01"), shareRatioThreshold: 0.01, marketCapThreshold: 5_000_000_000 },
  { from: new Date("2020-04-01"), shareRatioThreshold: 0.01, marketCapThreshold: 1_000_000_000 },
  { from: new Date("2018-04-01"), shareRatioThreshold: 0.01, marketCapThreshold: 1_500_000_000 },
  { from: new Date("2017-01-01"), shareRatioThreshold: 0.01, marketCapThreshold: 2_500_000_000 },
  // ★ F-01 신설 (2016.4.1.~2016.12.31. — 교재 §3장 이미지 48 ⑤) — KoreanLaw 미검증
  { from: new Date("2016-04-01"), shareRatioThreshold: 0.01, marketCapThreshold: 2_500_000_000 },
  { from: new Date("2013-01-01"), shareRatioThreshold: 0.02, marketCapThreshold: 5_000_000_000 },
  { from: new Date("1999-01-01"), shareRatioThreshold: 0.05, marketCapThreshold: Infinity },
  { from: new Date("1900-01-01"), shareRatioThreshold: 0.05, marketCapThreshold: Infinity },
];
```

**검증**: PHA-01 (현행 행 매칭) + PHA-02 (신설 행 매칭).

### 1.2 코스닥 (`KOSDAQ_MAJOR_THRESHOLDS`)

```ts
  // 기존 2017.1.1.~ 행 다음
  { from: new Date("2017-01-01"), shareRatioThreshold: 0.02, marketCapThreshold: 2_000_000_000 },
  // ★ F-02 신설 (2016.4.1.~2016.12.31. — 교재 §3장 이미지 48 ⑤) — KoreanLaw 미검증
  { from: new Date("2016-04-01"), shareRatioThreshold: 0.02, marketCapThreshold: 2_000_000_000 },
  // 2013.8.29.~2016.3.31. (구간 단축)
  { from: new Date("2013-08-29"), shareRatioThreshold: 0.02, marketCapThreshold: 4_000_000_000 },
```

**검증**: PHA-03·PHA-04.

### 1.3 비상장 (`UNLISTED_MAJOR_THRESHOLDS`)

```ts
  { from: new Date("2020-04-01"), shareRatioThreshold: 0.04, marketCapThreshold: 1_000_000_000 },
  { from: new Date("2018-04-01"), shareRatioThreshold: 0.04, marketCapThreshold: 1_500_000_000 },
  { from: new Date("2017-01-01"), shareRatioThreshold: 0.04, marketCapThreshold: 2_500_000_000 },
  // ★ F-03 신설 (2016.4.1.~2016.12.31. — 교재 §3장 이미지 48 ⑤ 비상장 2%/50억) — KoreanLaw 미검증
  // 2016.1.1.~3.31. 구간은 교재 미명시 → 추정 금지, 현행 행(4%/50억) 유지
  { from: new Date("2016-04-01"), shareRatioThreshold: 0.02, marketCapThreshold: 5_000_000_000 },
  { from: new Date("2013-01-01"), shareRatioThreshold: 0.04, marketCapThreshold: 5_000_000_000 },
  { from: new Date("1900-01-01"), shareRatioThreshold: 0.05, marketCapThreshold: Infinity },
```

**검증**: PHA-05 (현행 행 4%/50억 유지) + PHA-06 (신설 행 2%/50억).

### 1.4 코넥스 — 변경 없음

코넥스(`KONEX_MAJOR_THRESHOLDS`)는 2013.7.1.~2023.12.31. 전 구간 4%/10억 단일 임계 → 시기 경계 행 추가 불필요 (결과 정합).

PHA-07·PHA-08 코넥스 회귀 anchor 통해 변경 없음 확인.

---

## STEP 2 — Phase B: 비상장 벤처기업 임계 분기

### 2.1 `MajorShareholderThreshold` 인터페이스 확장

```ts
// stock-rate-tables.ts
export interface MajorShareholderThreshold {
  /** 적용 시작일 (이상) */
  from: Date;
  /** 지분율 임계 (0.01 = 1%) */
  shareRatioThreshold: number;
  /** 시총 임계 (원) */
  marketCapThreshold: number;
  /** ★ Phase B 신설 — 적용 규칙 출처 (UI 라벨링용) */
  ruleSource?: "§157" | "§167의8①2호" | "§167의8①2호_벤처";
  /** ★ Phase B 신설 — 비상장 벤처기업 임계 적용 여부 (UI 배지 분기용) */
  isVentureRule?: boolean;
}
```

**주의**: 매트릭스 상수 정의 시점에는 `ruleSource`·`isVentureRule` 미설정(undefined). `getMajorShareholderThreshold()` 반환 시점에 동적 부착.

### 2.2 `getMajorShareholderThreshold()` 시그니처 확장

```ts
export function getMajorShareholderThreshold(
  marketType: "kospi" | "kosdaq" | "konex" | "unlisted",
  priorYearEndDate: Date,
  options?: { isVentureCompany?: boolean }, // ★ Phase B 신설
): MajorShareholderThreshold {
  let thresholds: MajorShareholderThreshold[];
  if (marketType === "kospi") thresholds = KOSPI_MAJOR_THRESHOLDS;
  else if (marketType === "kosdaq") thresholds = KOSDAQ_MAJOR_THRESHOLDS;
  else if (marketType === "konex") thresholds = KONEX_MAJOR_THRESHOLDS;
  else thresholds = UNLISTED_MAJOR_THRESHOLDS;

  const sorted = [...thresholds].sort((a, b) => b.from.getTime() - a.from.getTime());
  const match = sorted.find((t) => priorYearEndDate >= t.from) ?? sorted[sorted.length - 1];

  // ★ Phase B — 비상장 벤처기업 분기 (§167의8①2호 나목 단서)
  if (marketType === "unlisted" && options?.isVentureCompany) {
    return {
      ...match,
      marketCapThreshold: 4_000_000_000, // 40억
      ruleSource: "§167의8①2호_벤처",
      isVentureRule: true,
    };
  }

  // 일반 분기 — ruleSource·isVentureRule 부착
  return {
    ...match,
    ruleSource: marketType === "unlisted" ? "§167의8①2호" : "§157",
    isVentureRule: false,
  };
}
```

**불변량**:
- `marketType !== "unlisted"` 일 때 `isVentureRule === false`, `ruleSource === "§157"` 강제
- `marketType === "unlisted" && options?.isVentureCompany === true` 일 때 `marketCapThreshold === 4_000_000_000` 강제
- 기존 매트릭스 행은 불변 — `ruleSource`·`isVentureRule`는 반환 시점에만 동적 부착

### 2.3 `appliedThreshold` 확장 (2차 검토 정정)

`StockTransferResult.appliedThreshold` 는 이미 5필드 보유 (`types/stock-transfer.types.ts:565`):
```ts
appliedThreshold?: {
  shareRatio: number;
  marketCap: number;
  marketType: "kospi" | "kosdaq" | "konex" | "unlisted";
  priorYearEndDate: string; // ISO YYYY-MM-DD
  fromDate: string;          // ISO YYYY-MM-DD — 해당 임계 적용 시작일
};
```

★ Phase B 확장 — 7필드:
```ts
appliedThreshold?: {
  shareRatio: number;
  marketCap: number;
  marketType: "kospi" | "kosdaq" | "konex" | "unlisted";
  priorYearEndDate: string;
  fromDate: string;
  /** ★ Phase B 신설 — UI 배지·hint 분기용 */
  isVentureRule?: boolean;
  /** ★ Phase B 신설 — 결과 카드 조문 라벨용 */
  ruleSource?: "§157" | "§167의8①2호" | "§167의8①2호_벤처";
};
```

`ClassificationResult.appliedThreshold` 도 동일 구조 — `stock-classification.ts` 의 `threshold` 객체에서 모두 전파.

**`buildAppliedThreshold(input, classification)` 헬퍼**: `stock-transfer-tax.ts:545` 에 이미 존재. Phase B는 이 헬퍼가 `classification.appliedThreshold` 의 `isVentureRule`·`ruleSource` 를 그대로 통과 전파하도록 한 줄 추가:

```ts
function buildAppliedThreshold(input, classification) {
  if (!classification.appliedThreshold) return undefined;
  return {
    ...classification.appliedThreshold, // shareRatio, marketCap, isVentureRule, ruleSource 자동 전파
    marketType: input.marketType,
    priorYearEndDate: toISO(input.priorYearEndDate),
    fromDate: resolveThresholdFromDate(input.marketType, input.priorYearEndDate),
  };
}
```
※ spread 순서 주의 — 기존 marketType·priorYearEndDate·fromDate 가 input에서 override되도록 위 순서 유지.

### 2.4 `judgeIsMajorShareholder()` 갱신

```ts
function judgeIsMajorShareholder(input: StockTransferInput): {
  isMajor: boolean;
  threshold: { shareRatio: number; marketCap: number; isVentureRule?: boolean; ruleSource?: "§157" | "§167의8①2호" | "§167의8①2호_벤처" };
  mismatchWarning?: string;
} {
  const { marketType, priorYearEndDate } = input;

  if (marketType === "other_asset") {
    return {
      isMajor: input.isMajorShareholder,
      threshold: { shareRatio: 0, marketCap: 0 },
    };
  }

  // ★ Phase B — isVentureCompany options 전달
  const rawThreshold = getMajorShareholderThreshold(
    marketType as "kospi" | "kosdaq" | "konex" | "unlisted",
    priorYearEndDate,
    { isVentureCompany: input.isVentureCompany },
  );

  // ... 기존 isMajor 판정 로직 (effectiveShareRatio·effectiveMarketCap) ...

  return {
    isMajor,
    threshold: {
      shareRatio: rawThreshold.shareRatioThreshold,
      marketCap: rawThreshold.marketCapThreshold,
      isVentureRule: rawThreshold.isVentureRule,
      ruleSource: rawThreshold.ruleSource,
    },
    mismatchWarning,
  };
}
```

`classifyStockTransfer()` 반환의 `appliedThreshold` 매핑은 기존 `threshold` 객체를 그대로 전달 → 자동 확장.

---

## STEP 3 — 회귀 보호 정책

### 3.1 PHB-04 — 기존 anchor 회귀 (1차 검토 정정)

`isVentureCompany`는 `StockTransferInput`에 이미 **required** 필드로 존재 (`types/stock-transfer.types.ts` `isVentureCompany: boolean` — optional 아님). 즉 기존 anchor는 모두 `isVentureCompany: false` 또는 `true` 명시값 보유.

**Pre-Do grep 점검**:
```bash
grep -rn "isVentureCompany" __tests__/tax-engine/stock-transfer/
```
- 비상장(`marketType: "unlisted"`) anchor 중 `isVentureCompany: true` 명시 케이스: 이전엔 임계 영향 0 (현행 비벤처 10억 매트릭스만) → Phase B 도입 시 시총 임계가 10억→40억 변경됨 → **회귀 가능성**
- `isVentureCompany: false` 명시 케이스: 현행 비벤처 10억 그대로 → 영향 없음

**Pre-Do 정정 작업**: `isVentureCompany: true` 인 기존 비상장 anchor의 expected 결과가 본 PR 후에도 정합한지 시총·결과 재검산. 어긋나면 anchor를 v3 정정값으로 갱신 (PHB-04 안에 명시).

### 3.2 PHA 회귀 — 시기 경계 8건

PHA-01·03·05 (2016-03-31, 현행 행 유지) + PHA-02·04·06 (2016-04-01, 신설 행) + PHA-07·08 (2024·2020 회귀).

**중요**: PHA-05 expected = 4%/50억 (현행 행). v3에서 2%/50억 추정 금지 정책 반영.

---

## STEP 4 — 자가 일관성 anchor (불변량 검증)

```ts
// PHB-01 expected
expect(threshold.shareRatio).toBe(0.04); // 비상장 벤처도 지분율은 4% 유지
expect(threshold.marketCap).toBe(4_000_000_000); // 시총만 40억으로 변경
expect(threshold.isVentureRule).toBe(true);
expect(threshold.ruleSource).toBe("§167의8①2호_벤처");

// PHB-03 expected (비벤처)
expect(threshold.marketCap).toBe(1_000_000_000); // 비벤처 10억
expect(threshold.isVentureRule).toBe(false);
expect(threshold.ruleSource).toBe("§167의8①2호");

// PHA-02 expected (코스피 2016-04-01)
expect(threshold.shareRatio).toBe(0.01);
expect(threshold.marketCap).toBe(2_500_000_000);
expect(threshold.ruleSource).toBe("§157");
expect(threshold.isVentureRule).toBe(false);
```

---

## STEP 5 — Pre-Do 우선 작성 anchor (메모리 [[feedback_pre_anchor_verification]])

Phase A·B Plan/Design 완료 후 Do 진입 전:

1. **PHA-01·PHA-05·PHA-06** anchor 우선 작성 (시기 경계 임계 변화 + 비상장 추정 금지 검증)
2. **PHB-01·PHB-02** anchor 우선 작성 (벤처 40억 분기 동작)
3. 실패 메시지 확보 → 디자인 환류 (예: 매트릭스 sort 순서가 잘못 정렬되어 PHA-02가 PHA-01과 같은 행에 매칭되는 등 회귀 발견 시 즉시 정정)

---

## STEP 6 — 14지점 동기화 — 엔진 도메인 변경 분석 (1차 검토 정정)

본 STEP은 **엔진/타입 변경**의 14지점 파급만 분석. UI 변경(⑤·⑦)은 ui.design.md STEP 3 참조.

| # | 지점 | 엔진 변경 영향 |
|---|---|---|
| ① 폼 상태 | 변경 없음 (`isVentureCompany`는 기존 필드 재활용) |
| ②~④ | 변경 없음 |
| ⑤ UI 위젯 (호출 파급) | `MajorShareholderBlock` 의 `getMajorShareholderThreshold()` 호출이 새 options 파라미터 인식 필요 — **UI 디자인에서 처리** |
| ⑥ | 변경 없음 |
| ⑦ 결과 카드 (호출 파급) | `ClassificationResult.appliedThreshold` 확장 → 결과 뷰에서 신규 import — **UI 디자인에서 처리** |
| ⑧ validation | 변경 없음 |
| ⑨~⑭ | 변경 없음 (입력 필드 추가 아님 — `isVentureCompany` 는 이미 Zod·route·API 매핑 등록되어 있음) |

**Pre-Do 점검**: `grep -n "isVentureCompany" app/api/calc/stock-transfer/route.ts lib/calc/stock-transfer-api.ts` 로 ⑫⑬⑭ 기등록 확인.

---

## STEP 7 — QA·Check

- `npx vitest run __tests__/tax-engine/stock-transfer/textbook-alignment-thresholds.test.ts` PHA-01~08 통과
- `npx vitest run __tests__/tax-engine/stock-transfer/textbook-alignment-venture.test.ts` PHB-01~04 통과
- `npx vitest run __tests__/tax-engine/stock-transfer/` 전체 회귀 0건
- `ui-engine-sync-checker` read-only — `appliedThreshold` 확장 필드 UI 노출 검증

---

## 위험 매트릭스

| # | 위험 | 완화 |
|---|---|---|
| RE-1 | F-03 비상장 2% 임계 KoreanLaw 미검증 | 교재 §3장 채택, 코드 주석 "KoreanLaw 미검증" 명시 |
| RE-2 | 기존 비상장 anchor가 `isVentureCompany: undefined` 로 매칭 시 비벤처 경로(10억)로 떨어져 회귀 깨질 가능 | Pre-Do grep + PHB-04 명시 회귀 anchor + optional default → false 매핑 보장 |
| RE-3 | `appliedThreshold.isVentureRule`·`ruleSource` 신설로 기존 결과 카드 부수 효과 | optional 필드 — undefined 기본값으로 기존 카드 동작 보존 |
| RE-4 | 매트릭스 sort 순서로 PHA 신설 행이 기존 행을 가리는 사이드이펙트 | `sorted = sort(b.from - a.from)` 단조성 유지, PHA-01~06 6건 경계 anchor로 검증 |

---

## Definition of Done

- [ ] `MajorShareholderThreshold` 인터페이스에 `ruleSource?`·`isVentureRule?` 추가
- [ ] `getMajorShareholderThreshold()` 시그니처에 `options?: { isVentureCompany?: boolean }` 추가
- [ ] KOSPI·KOSDAQ·UNLISTED 매트릭스에 `from: 2016-04-01` 행 1건씩 추가 (3행)
- [ ] `judgeIsMajorShareholder()` 가 `input.isVentureCompany` options 전달
- [ ] `ClassificationResult.appliedThreshold` 에 `isVentureRule?`·`ruleSource?` 확장
- [ ] PHA-01~08 anchor 8건 toBe 통과
- [ ] PHB-01~04 anchor 4건 toBe 통과
- [ ] 전체 회귀 0건 (`npx vitest run __tests__/tax-engine/stock-transfer/`)
- [ ] 코드 주석에 "교재 §3장 발췌 기준 (KoreanLaw MCP 미검증)" 명시
