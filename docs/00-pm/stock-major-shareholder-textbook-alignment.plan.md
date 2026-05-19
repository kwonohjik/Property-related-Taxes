# 주식 양도소득세 — 대주주 판정 교재 정합화 계획서 v6

> 작성일: 2026-05-19 (v6 — F-06 완료 반영)
> 작성자: Claude (Opus 4.7)
> 영향 도메인: `lib/tax-engine/stock-transfer/` + `components/calc/stock-transfer/` + `__tests__/tax-engine/stock-transfer/`
> 우선순위: **P0 (오판정 직결)** — 비상장 벤처 시총 임계 누락 + 2016.4.1.~12.31. 구간 시기 매트릭스 부정확
> 근거 자료: 양도소득세 교재 발췌 이미지 47~51 (시기별 대주주 임계표 ①~⑤ + Check Point ①~⑰ + 세율 단일화 부칙)
> 선행 분석: 2026-05-19 비교 보고서 (대화 이력) — 일치 41개 / 불일치 5개 / 미구현 11개
> **법령 검증 정책 (사용자 지시 2026-05-19)**: 본 계획은 **KoreanLaw MCP 검증 생략**. 교재(소득세법 강의서 §3장) 표기를 진실 기준으로 채택, 부칙 직접 확인 미수행. 실행 시 R-1 위험 인지하고 진행.
> v1 → v2 변경 사항: §15 정정 이력 참조 (10건 반영).
> v2 → v3 변경 사항: §16 정정 이력 참조 (P0 2건 + P1 2건 + P2 6건 = 10건 추가 반영).
> v3 → v4 변경 사항: §17 정정 이력 참조 (디자인 1·2차 검토 + Plan↔Design 통합 검토 결과 6건 반영).
> v4 → v5 변경 사항: §18 정정 이력 참조 (Phase C 후속 PR → 본 PR 완료로 이동, hint 9종 + 3 그룹 collapsible UI 구현).
> v5 → v6 변경 사항: §19 정정 이력 참조 (F-06 후속 PR → 본 PR 완료로 이동, 비거래일 검증 hint 추가).

---

## 1. 배경

### 1.1 현재 상태

`stock-rate-tables.ts` 의 `KOSPI_MAJOR_THRESHOLDS` / `KOSDAQ_MAJOR_THRESHOLDS` / `KONEX_MAJOR_THRESHOLDS` / `UNLISTED_MAJOR_THRESHOLDS` 4개 시기별 매트릭스가 대주주 자동 판정의 단일 진실(`getMajorShareholderThreshold()` → `judgeIsMajorShareholder()` → `appliedThreshold` 결과 객체).

선행 PR(2026-05-17 `stock-transfer-applied-threshold-sync.plan.md`)에서 UI ↔ 엔진 단일 진실 정합화 완료. 그러나 매트릭스 자체에 교재 대비 5가지 불일치 + 11가지 Check Point 미구현 발견.

### 1.2 핵심 위험

비상장 **벤처기업** 시총 임계 **40억** (시행령 §167의8①2호 나목·이미지 50 ⑤행) 미구현 → 비벤처 기준 **10억** 단일 적용으로 시총 10억~40억 구간의 비상장 벤처기업 종목 양도 시 **대주주 오판정**. UI는 안내 문구(`MajorShareholderBlock.tsx:231`)로만 노출되어 메모리 정책 [[feedback_ui_engine_dual_truth_avoidance]] 위반 상태.

---

## 2. 교재 vs 앱 불일치 매트릭스

### 2.1 시기별 임계 (이미지 48 ①~⑤)

| # | 구간 | 시장 | 교재 | 현행 앱 | 정정 후 |
|---|---|---|---|---|---|
| F-01 | 2016.4.1.~2016.12.31. | 코스피 | 1% / 25억 | 2% / 50억 (2013~2016 통합) | 1% / 25억 (행 신설, from=2016-04-01) |
| F-02 | 2016.4.1.~2016.12.31. | 코스닥 | 2% / 20억 | 2% / 40억 (2013.8.29~) | 2% / 20억 (행 신설, from=2016-04-01) |
| F-03 | 2016.4.1.~2016.12.31. | 비상장 | **2% / 50억** | 4% / 50억 (2013.1.1~) | 2% / 50억 (행 신설, **from=2016-04-01** — 2016.1.1.~3.31. 추정 금지) |
| ~~F-04~~ | ~~2016.1.1.~2016.3.31.~~ | 비상장 | (교재 미명시) | 4% / 50억 (2013.1.1~) | **본 PR 범위 제외** — 교재 미명시 구간 추정 금지 (메모리 정책 [[feedback_no_silent_apportion_fallback]] 정신 준수) |
| F-05 | **상시 유효** (§167의8①2호 나목 — §157의 2017.2.3. 삭제와 무관, §167의8은 변동 없음) | 비상장 벤처 | 4% / **40억** | **누락** (비벤처 10억 적용) | `isVentureCompany` 분기 신설 |

### 2.2 시가총액 산정 기준일 (이미지 49 (3))

| # | 항목 | 교재 | 현행 앱 |
|---|---|---|---|
| F-06 | 상장 fallback | 직전사업연도 종료일 종가 → **없으면 직전거래일 종가** | `priorYearEndDate` 단일 입력 (fallback 자동화 없음) |
| F-07 | 비상장 | 소득세법 기준시가 (소령 §165④) | ✅ 보충적 평가 모듈로 산정 (이미 정합) |

### 2.3 Check Point ①~⑰ (이미지 50~51)

| # | 교재 규정 | 분류 | 본 PR 처리 |
|---|---|---|---|
| F-08 ① | 직전사업연도 비상장 → 양도시점 코스닥 상장법인 → **양도일 현재 코스닥 임계 적용** (회신문 기획재정부재산-1483은 2009.9.21. 시점 100분의 5 — 현행 적용 시 양도일 시점 임계 사용, "5%" 그대로 인용 금지) | 특수분기 | **§3 별도 PR 분리** |
| F-09 ② | 합병법인 신주 교부 후 양도 → 피합병법인 합병등기일 기준 | 특수분기 | 별도 PR 분리 |
| F-10 ③ | 분할 시 분할 전 법인 분할등기일 기준 (안분 ❌) | 특수분기 | 별도 PR 분리 |
| F-11 ④ | 무상증자 신주 포함 시총 산정 | UI hint (v3 추가) | **본 PR — hint 9종 중 1건** (§6.2 F-11 추가) |
| F-12 ⑤ | 자본시장법 §178 투자기구 간접투자 주식 합산 ❌ | 특수분기 | 별도 PR 분리 |
| F-13 ⑥ | 중소기업창업투자조합 → 조합원 기준 | 특수분기 | 별도 PR 분리 |
| F-14 ⑦ | 분할신설법인 직전사업연도 미존재 → 분할 전 직전사업연도 | 특수분기 | 별도 PR 분리 |
| F-15 ⑧ | 대차주식 포함 (2013.2.15. 이후) | UI hint (v2 정정) | **본 PR — hint만** (자동 가산은 후속 PR). v1의 토글 신설 정책 폐기 |
| F-16 ⑨ | 사모펀드 간접소유 주식 합산 (2013.2.15. 이후) | UI hint (v2 정정) | **본 PR — hint만** (자동 가산은 후속 PR). v1의 토글 신설 정책 폐기 |
| F-17 ⑩ | 신주인수권 포함 | UI hint | 본 PR (hint·LawArticleModal) |
| F-18 ⑪ | 콜옵션·주식매수선택권 **불포함** | UI hint | 본 PR (hint) |
| F-19 ⑫ | 의결권 없는 자기주식 포함 | UI hint | 본 PR (hint) |
| F-20 ⑬ | 무의결권 우선주 포함 | UI hint | 본 PR (hint) |
| F-21 ⑭ | 기타주주에 비거주자 포함 | UI hint | 본 PR (hint) |
| F-22 ⑮ | 전환사채 가액 **불포함** 시총 산정 | UI hint | 본 PR (hint) |
| F-23 ⑯ | 신설법인 → 설립등기일 기준 | 특수분기 | 별도 PR 분리 |
| F-24 ⑰ | 직전사업연도 종료일 미보유 → 특수관계 기타주주 합산 판정 | ⚠️ **부분 정합** | 본 PR 범위 외 — 현행은 `isLargestShareholderGroup` 토글이 ON일 때만 합산. 본인 미보유(0%) + 특수관계인 합산 케이스에서 사용자 토글 OFF 시 비대주주 오판정 가능. **후속 PR §12에서 본인 미보유 시 강제 합산 분기 신설** |

### 2.4 세율 단일화 부칙 (이미지 49 상단)

| # | 항목 | 본 PR 처리 |
|---|---|---|
| F-25 | 2016.1.1. 현재 의무보호예수 중인 중소기업 대주주 → 보호예수 종료 6개월 후 양도 시 20% | **후속 PR로 분리** (§12 참조) — 본 계획서 Phase A/B/C 범위 외 |

---

## 3. PR 분리 전략

본 계획서는 **3개 PR로 분할** 추진. 각 PR 회귀 위험을 격리하여 anchor 보존성 보장.

### Phase A — 시기별 매트릭스 행 추가 (★★★)

**범위**: F-01 / F-02 / F-03 (2016.4.1.~12.31. 구간, F-04 제외 — 교재 미명시)
**영향 파일**: `stock-rate-tables.ts` (3 행 추가, 각 시장 `from: 2016-04-01`)
**회귀 위험**: 낮음 — 신규 구간만 추가, 기존 행 유지. 2016.1.1.~3.31. 구간은 현행 행(코스피 2%/50억, 코스닥 2%/40억, 비상장 4%/50억) 유지.
**anchor**: 시기 경계 8건 (PHA-01~08, §4.4 참조)

### Phase B — 비상장 벤처기업 임계 분기 (★★★)

**범위**: F-05
**영향 파일** (v4 정정):
- `stock-rate-tables.ts` — `getMajorShareholderThreshold()` 시그니처에 `options?: { isVentureCompany?: boolean }` 추가 + `MajorShareholderThreshold` 인터페이스에 `ruleSource?`·`isVentureRule?` 필드 신설
- `stock-classification.ts` `judgeIsMajorShareholder()` — `input.isVentureCompany` 를 options로 전달, threshold 객체에 `isVentureRule`·`ruleSource` 전파
- `stock-transfer-tax.ts` `buildAppliedThreshold()` — spread 패턴으로 자동 전파 (변경 최소)
- `types/stock-transfer.types.ts` `appliedThreshold` 5필드 → 7필드 (신설 2건)
- `MajorShareholderBlock.tsx` — 안내 문구 **갱신** (제거 아님 — 비벤처/벤처 양 분기 표시)
- `components/calc/results/StockTransferTaxResultView.tsx` — `appliedThreshold` **신규 import** + violet 배지 + ruleSource 라벨 분기 추가

**회귀 위험**: 중간 — `isVentureCompany` 는 `StockTransferInput` 의 required 필드(v4 검증) — 기존 anchor 모두 명시값 보유. 회귀 가능성은 **`isVentureCompany: true` 인 비상장 anchor** 가 본 PR 후 시총 임계 10억→40억 변경으로 결과 정합 깨질 가능. Pre-Do grep 검산.
**anchor**: PHB-01~04 (비상장 벤처 시총 30억=비대주주 / 45억=대주주 / 비벤처 15억=대주주 / 기존 회귀)

### Phase C — UI hint 9종 (v3 — F-11 무상증자 추가)

**범위**: F-11 / F-15 / F-16 / F-17~F-22 — 모두 **UI hint·LawArticleModal 안내만** (v1의 토글 신설 정책 폐기, v3 무상증자 hint 추가)
**영향 파일**:
- `MajorShareholderBlock.tsx` — hint 9종 (무상증자·대차주식·사모펀드·신주인수권·콜옵션·자기주식·우선주·비거주자·전환사채)
- `lib/korean-law/aliases.ts` — 미등록 조문 alias 추가 (시행령 §157, §167의8)
- 엔진·API·Zod 변경 없음

**회귀 위험**: 매우 낮음 — UI 문자열·LawArticleModal trailing 배지만 추가
**anchor**: 미적용 (UI 비기능 변경) — 대신 Playwright 또는 수동 캡처 검증 (PHC-A1~A2 시각 확인 항목)

**Phase C 정책 결정 사유** (v2 정정): v1의 `includesLendingShares`/`includesPEFIndirectShares` 토글은 "엔진 자동 가산 없음 + hint만"으로 정의되어 의미 모호 (사용자가 토글해도 결과 동일). 메모리 [[feedback_no_silent_apportion_fallback]] 정신에 비추어 **자동 가산 로직 없는 토글은 입력 혼란만 유발** → 토글 폐기, hint만으로 사용자 책임 안내. 자동 가산은 별도 후속 PR(§12)로 분리.

### 별도 PR (본 계획 범위 외)

- F-06 (직전거래일 fallback)
- F-08~F-10·F-12~F-14·F-23 (합병·분할·간접투자·신설법인 특수분기)
- F-25 (2016.1.1. 의무보호예수 부칙)

---

## 4. Phase A 상세 — 시기별 매트릭스 행 추가

### 4.0 코넥스 정합성 (v3 명시)

코넥스(`KONEX_MAJOR_THRESHOLDS`)는 본 PR에서 **변경 불필요**.

- 교재 ②③④⑤(2016.4.1.~2023.12.31.) 코넥스 임계: 모두 4% / 10억
- 현행 매트릭스: `from: 2013-07-01` (시장 개설) 단일 행 4% / 10억
- 시기별 행이 누락되어 있으나 **단일 임계 통합으로 결과 정합** (PHA-01~08 코넥스 분기 추가 anchor 불필요)

코드 리뷰 시 "코넥스도 2016.4.1. 행 추가?" 혼동 차단용 명시.

### 4.1 코스피 (`KOSPI_MAJOR_THRESHOLDS`)

```ts
export const KOSPI_MAJOR_THRESHOLDS: MajorShareholderThreshold[] = [
  { from: new Date("2024-01-01"), shareRatioThreshold: 0.01, marketCapThreshold: 5_000_000_000 },
  { from: new Date("2020-04-01"), shareRatioThreshold: 0.01, marketCapThreshold: 1_000_000_000 },
  { from: new Date("2018-04-01"), shareRatioThreshold: 0.01, marketCapThreshold: 1_500_000_000 },
  { from: new Date("2017-01-01"), shareRatioThreshold: 0.01, marketCapThreshold: 2_500_000_000 },
  // ★ F-01 신설 (2016.4.1.~2016.12.31.)
  { from: new Date("2016-04-01"), shareRatioThreshold: 0.01, marketCapThreshold: 2_500_000_000 },
  // 2013.1.1.~2016.3.31. (구간 단축)
  { from: new Date("2013-01-01"), shareRatioThreshold: 0.02, marketCapThreshold: 5_000_000_000 },
  // ...
];
```

### 4.2 코스닥 (`KOSDAQ_MAJOR_THRESHOLDS`)

```ts
  // ★ F-02 신설
  { from: new Date("2016-04-01"), shareRatioThreshold: 0.02, marketCapThreshold: 2_000_000_000 },
  // 2013.8.29.~2016.3.31. (구간 단축)
  { from: new Date("2013-08-29"), shareRatioThreshold: 0.02, marketCapThreshold: 4_000_000_000 },
```

### 4.3 비상장 (`UNLISTED_MAJOR_THRESHOLDS`)

```ts
  // 2020.4.1.~ 현재 (현행 유지)
  { from: new Date("2020-04-01"), 0.04, 1_000_000_000 },
  // 2018.4.1.~ 2020.3.31. (현행 유지)
  { from: new Date("2018-04-01"), 0.04, 1_500_000_000 },
  // 2017.1.1.~ 2018.3.31. (현행 유지)
  { from: new Date("2017-01-01"), 0.04, 2_500_000_000 },
  // ★ F-03 신설 (2016.4.1.~2016.12.31. — 교재 ⑤ 비상장 2% / 50억)
  { from: new Date("2016-04-01"), shareRatioThreshold: 0.02, marketCapThreshold: 5_000_000_000 },
  // 2013.1.1.~ 2016.3.31. (구간 단축) — 2016.1.1.~3.31.은 교재 미명시 → 현행 임계 유지
  { from: new Date("2013-01-01"), 0.04, 5_000_000_000 },
  // ~ 2012.12.31. fallback
  { from: new Date("1900-01-01"), 0.05, Infinity },
```

> ⚠️ **법령 검증 정책 (v2)**: F-03 비상장 2% 임계는 교재 §3장 표기 기준. KoreanLaw MCP 부칙 확인은 사용자 지시(2026-05-19)에 따라 생략. 실행 시 R-1 위험 유지하고 추후 실무 검증 필요 시 시행령 §167의8①2호 부칙(2016년 개정) 수기 확인 권장. 2016.1.1.~3.31. 구간은 교재 미명시 → **현행 행(4%/50억) 유지** (추정 입력 금지, 메모리 정책 [[feedback_no_silent_apportion_fallback]] 정신 준수).

### 4.4 Phase A anchor (Pre-Do 우선 검증)

```
PHA-01: priorYearEndDate = 2016-03-31, 코스피 → 2% / 50억 (현행 행 유지)
PHA-02: priorYearEndDate = 2016-04-01, 코스피 → 1% / 25억 (F-01 신설 행)
PHA-03: priorYearEndDate = 2016-03-31, 코스닥 → 2% / 40억 (현행 행 유지)
PHA-04: priorYearEndDate = 2016-04-01, 코스닥 → 2% / 20억 (F-02 신설 행)
PHA-05: priorYearEndDate = 2016-03-31, 비상장 → 4% / 50억 (★ v2 정정: 현행 4%/50억 유지, 교재 미명시 구간)
PHA-06: priorYearEndDate = 2016-04-01, 비상장 → 2% / 50억 (F-03 신설 행)
PHA-07: 회귀 — 2024-01-01 4종 시장 (현행 임계 유지)
PHA-08: 회귀 — 2020-04-01 4종 시장
```

> ★ v2 정정: PHA-05 expected 값을 "2%/50억" → "4%/50억"으로 변경. 2016.1.1.~3.31. 구간은 교재 미명시이므로 현행 임계(4%/50억) 유지하여 추정 금지 정책 준수.

---

## 5. Phase B 상세 — 비상장 벤처기업 시총 40억

### 5.1 인터페이스 변경

```ts
// stock-rate-tables.ts
export interface MajorShareholderThreshold {
  from: Date;
  shareRatioThreshold: number;
  marketCapThreshold: number;
  /** ★ v2 신설 — 적용 규칙 출처 (UI 라벨링용) */
  ruleSource?: "§157" | "§167의8①2호" | "§167의8①2호_벤처";
  /** ★ v2 신설 — 비상장 벤처기업 임계 적용 여부 (UI 배지 분기용) */
  isVentureRule?: boolean;
}

export function getMajorShareholderThreshold(
  marketType: "kospi" | "kosdaq" | "konex" | "unlisted",
  priorYearEndDate: Date,
  options?: { isVentureCompany?: boolean }, // ★ 신설
): MajorShareholderThreshold {
  // ... 기존 로직 ...
  // 비상장 벤처기업 분기 (§167의8①2호 나목 단서)
  if (marketType === "unlisted" && options?.isVentureCompany && match) {
    return {
      ...match,
      marketCapThreshold: 4_000_000_000, // 40억
      ruleSource: "§167의8①2호_벤처",
      isVentureRule: true,
    };
  }
  return {
    ...match,
    ruleSource: marketType === "unlisted" ? "§167의8①2호" : "§157",
    isVentureRule: false,
  };
}
```

### 5.2 결과 객체 (`appliedThreshold`) 확장 (v4 정정)

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

★ Phase B 확장 — 7필드 (신설 2건):
```ts
appliedThreshold?: {
  // ... 위 5필드 그대로 ...
  /** ★ v2 신설 — UI 배지·hint 분기용 */
  isVentureRule?: boolean;
  /** ★ v2 신설 — 결과 카드 조문 라벨용 */
  ruleSource?: "§157" | "§167의8①2호" | "§167의8①2호_벤처";
};
```

`stock-classification.ts` `judgeIsMajorShareholder()` 반환에 `isVentureRule`·`ruleSource` 전파.
`stock-transfer-tax.ts:545` 의 `buildAppliedThreshold(input, classification)` 헬퍼는 기존 spread 패턴으로 자동 전파됨 (변경 최소).

결과 뷰(`components/calc/results/StockTransferTaxResultView.tsx`) 는 `appliedThreshold.isVentureRule === true` 분기로 violet 배지 표시.

⚠️ v4 발견: 현행 결과 뷰가 `appliedThreshold` 를 import하지 않음 (grep 0건) → 신규 import + 분기 통합 작업 필요. Phase B 범위에 명시.

### 5.3 호출부 동기화 (v3 — symbol 기반 표기)

라인 번호는 시점 의존성이 있어 선행 PR(파일 분할·정렬) 영향 발생 시 어긋남. **symbol·함수명 기반**으로 표기.

- `stock-classification.ts` `judgeIsMajorShareholder()` 본문 — `{ isVentureCompany: input.isVentureCompany }` 전달
- `MajorShareholderBlock.tsx` `threshold` useMemo — 의존성 배열에 `form.isVentureCompany` 추가
- `MajorShareholderBlock.tsx` 벤처기업 안내 문구(현재 "※ 벤처기업은 시총 임계 40억") → **"자동 적용 중 — 시총 임계 40억 (§167의8①2호 나목)" 으로 갱신** (제거 아님)
- **결과 카드 컴포넌트** — `appliedThreshold.isVentureRule` 분기 violet 배지 + `ruleSource` 조문 라벨 추가
  - ✅ v4 동결 (2026-05-19 grep 검증): 실제 파일 경로는 `components/calc/results/StockTransferTaxResultView.tsx`. v3의 `StockResultCard.tsx` 가정 경로는 폐기.

### 5.4 Phase B anchor

```
PHB-01: marketType=unlisted, isVentureCompany=true, selfMarketCap=30억 → 비대주주 (40억 미달)
        + appliedThreshold.isVentureRule === true / ruleSource === "§167의8①2호_벤처"
PHB-02: marketType=unlisted, isVentureCompany=true, selfMarketCap=45억 → 대주주 (40억 초과)
        + appliedThreshold.marketCap === 4_000_000_000
PHB-03: marketType=unlisted, isVentureCompany=false, selfMarketCap=15억 → 대주주 (10억 초과)
        + appliedThreshold.isVentureRule === false / ruleSource === "§167의8①2호"
PHB-04: 회귀 — 기존 비상장 anchor 전체 통과 (벤처 여부 = 기존 입력 그대로, isVentureRule undefined 허용)
```

### 5.5 회귀 보호 — 기존 anchor 영향 (v4 정정)

`isVentureCompany` 는 `StockTransferInput` 의 **required boolean** (`types/stock-transfer.types.ts:46` — v4 검증). 즉 기존 anchor 모두 `true` 또는 `false` 명시값 보유.

**Pre-Do grep**:
```bash
grep -rn "isVentureCompany" __tests__/tax-engine/stock-transfer/ | grep "true"
grep -rn "marketType.*unlisted" __tests__/tax-engine/stock-transfer/
```

**위험 케이스**: 두 grep 결과의 **교집합** (비상장 + 벤처 true) — Phase B 도입 시 시총 임계 10억 → 40억 변경으로 expected 결과 정합이 깨질 가능. 발견 시 anchor expected 값을 v4 정정값으로 갱신 (PHB-04 안에 명시).

**안전 케이스**: 비상장 + 벤처 false / 상장 (kospi·kosdaq·konex) → 본 PR 영향 없음 (회귀 0건).

---

## 6. Phase C 상세 — UI hint 9종 (v3 — F-11 무상증자 추가)

### 6.1 정책 결정 (v2 정정 유지)

v1의 `includesLendingShares` / `includesPEFIndirectShares` 토글 신설 정책을 **폐기**한다. 사유:

- 본 PR은 "엔진 자동 가산 없음 + hint만"으로 정의되어 토글 효과가 무 → 사용자 입력 혼란 유발
- 메모리 [[feedback_no_silent_apportion_fallback]] 정신 (자동 fallback 금지) 비추어, **자동 가산 로직이 없는 토글은 책임 소재만 모호하게 함**
- 토글 자동 가산 구현은 입력 명세(특수관계인 범위·사모펀드 식별)가 복잡 → 별도 후속 PR로 분리 (§12)

→ Phase C는 **UI hint 9종 안내·LawArticleModal 배지만** 구현. 엔진·타입·API·Zod·validate 변경 0.

### 6.2 UI hint 9종 (`MajorShareholderBlock.tsx`)

각 입력 카드 하단 `<HintCard tone="info">` 또는 FieldCard `hint` 로 노출:

- **F-11** 무상증자: "당해 법인 증자로 취득한 신주(직전사업연도 종료일 현재 미상장)는 시총 산정에 포함 (서면4팀-716, 2008.3.19.)" ★ v3 신설
- **F-15** 대차주식: "2013.2.15. 이후 대차거래는 대여자 주식으로 보아 대주주 판정 (시총·지분율에 사전 합산 입력)"
- **F-16** 사모펀드 간접소유: "2013.2.15. 이후 사모펀드 간접소유 주식 합산 (시총·지분율에 사전 합산 입력)"
- **F-17** 신주인수권: "시총 산정 시 신주인수권 포함 (소득세법 §157④, 부동산거래-526)"
- **F-18** 콜옵션·주식매수선택권: "콜옵션·주식매수선택권은 시총 산정에서 제외 (서면법령해석 재산 2014-22136)"
- **F-19** 자기주식: "의결권 없는 자기주식도 발행주식총수에 포함 (법령해석 재산 2015-2137)"
- **F-20** 우선주: "무의결권 우선주 포함 (서면부동산 2015-2562)"
- **F-21** 비거주자: "특수관계 기타주주에 비거주자 포함 (부동산거래관리-866)"
- **F-22** 전환사채: "전환사채 가액은 시총 산정 시 제외 (법령해석 재산 2015-0434)"

### 6.3 LawArticleModal 연계

신규 조문 9건은 `lib/korean-law/aliases.ts` 별칭 확인 → 미등록 시 등록. `FieldCard trailing` 배지로 `§157`·`§167의8` 링크 노출. 메모리 [[feedback_law_article_link]] 패턴 준수.

### 6.4 Phase C 검증 (anchor 미적용 — UI 비기능)

UI 문자열·LawArticleModal 배지만 추가이므로 vitest anchor 없음. 대신 **시각 확인 항목**:

```
PHC-A1: MajorShareholderBlock 화면에 hint 9종 모두 노출 확인 (LawArticleModal trailing 배지 9개)
PHC-A2: 각 hint 클릭 → LawArticleModal 정상 표시 (조문·해석례 9건)
```

Playwright .mjs 자동 회귀 또는 수동 캡처로 검증.

---

## 7. 14개 동기화 지점 체크 (v2 정정 — Phase C 토글 폐기 반영)

Phase A·B만 엔진·타입 변경. Phase C는 UI 비기능 (hint·LawArticleModal)이므로 14지점 동기화 부담 없음.

| # | 지점 | Phase A | Phase B | Phase C |
|---|---|---|---|---|
| ① 폼 상태 | `lib/stores/calc-wizard-form-stock.ts` | — | — | — (토글 폐기) |
| ② initial | factory default | — | — | — |
| ③ normalize | 정규화 | — | — | — |
| ④ API 변환 | `lib/calc/stock-transfer-api.ts` | — | — | — |
| ⑤ UI 위젯 | `MajorShareholderBlock.tsx` | 시기 라벨 텍스트 갱신 | `threshold` useMemo 의존성 `isVentureCompany` 추가 + 벤처 안내 갱신 | hint 9종 + LawArticleModal 배지 |
| ⑥ 사이드바 합계 | — | — | — | — |
| ⑦ 결과 카드 | `components/calc/results/StockTransferTaxResultView.tsx` (★ v4 동결) | 기존 `fromDate` 데이터 활용 (신규 작업 0건) | **★ `appliedThreshold` 신규 import + isVentureRule violet 배지 + ruleSource 라벨 분기 통합** | — |
| ⑧ validation | `lib/calc/stock-transfer-validate.ts` | — | — | — |
| ⑨ Zod enum 메인 | `app/api/calc/stock-transfer/route.ts` | — | — | — |
| ⑩ Zod enum 컴패니언 | — | — | — | — |
| ⑪ acquisitionDate fallback | — | — | — | — |
| ⑫ Zod 입력 객체 | route.ts schema | — | — | — |
| ⑬ callAPI body spread | `lib/calc/stock-transfer-api.ts` | — | — | — |
| ⑭ Route handler 엔진 매핑 | route.ts L122 + L203 | — | — | — |

Phase B의 결과 객체 확장(`appliedThreshold.isVentureRule`·`ruleSource`)은 `types/stock-transfer.types.ts`에만 영향 — TypeScript 자동 감지 보장. ⑫⑬⑭ grep 자가 점검은 본 PR에서 변경 없음 확인용으로 수행.

---

## 8. 디자인 문서 산출물

- `docs/02-design/features/stock-major-shareholder-textbook-alignment.engine.design.md` — Phase A·B 엔진 명세 + 케이스 인벤토리 표 (PHA-01~08 + PHB-01~04)
- `docs/02-design/features/stock-major-shareholder-textbook-alignment.ui.design.md` — Phase C UI 명세 + 14지점 동기화 표 + **hint 9종 문구 동결** (F-11·F-15·F-16·F-17·F-18·F-19·F-20·F-21·F-22)

케이스 인벤토리 표 행≥1 필수 (CLAUDE.md PDCA Definition of Done).

---

## 9. Pre-Do anchor 우선 검증 (메모리 [[feedback_pre_anchor_verification]])

Phase A·B Plan/Design 완료 후 Do 진입 전:

1. PHA-01·PHA-05·PHA-06 anchor 우선 작성 + 실행 → 실패 메시지 확보 (PHA-05는 v2 정정값 4%/50억 기준)
2. PHB-01·PHB-02 anchor 우선 작성 → 벤처 임계 40억 분기 동작 검증
3. **v2 정정 — KoreanLaw MCP 검증 생략 (사용자 지시 2026-05-19)**:
   - F-03 비상장 2% 임계: 교재 §3장 표기를 진실 기준으로 채택 + 코드 주석에 "교재 발췌 기준 (KoreanLaw 미검증)" 명시
   - F-05 비상장 벤처 40억: 동일 정책 — 교재 기준 채택
   - 실무 검증 필요 시 시행령 §167의8①2호 부칙(2016 / 2017.2.3.) 수기 확인 권장 (R-1 위험 유지)

---

## 10. QA·Check 단계

- `tax-qa-lead` 병렬 호출 — `stock-transfer-qa` + 회귀 anchor
- `ui-engine-sync-checker` 14지점 read-only 검증
- 브라우저 수동 확인: 2016-04-01 직전·직후 priorYearEndDate 입력 → UI 미리보기 임계 변경 확인
- 비상장 벤처 토글 ON/OFF 시 자동 판정 결과 변경 확인

---

## 11. 위험·미정 사항

| # | 위험 | 완화 방안 |
|---|---|---|
| R-1 | F-03 비상장 2% 임계 법령 미확인 (사용자 지시로 KoreanLaw MCP 검증 생략) | 교재 §3장 표기 채택 + 코드 주석 명시 + 실무 필요 시 시행령 §167의8①2호 부칙 수기 확인 권장 |
| R-2 | 기존 비상장 anchor가 벤처 가정 누락 | Pre-Do grep + 명시적 `isVentureCompany: false` 추가 |
| R-3 | Phase C 9개 hint 문구가 사용자 혼란 유발 | LawArticleModal 연계 + tone="info" 유지 |
| R-4 | F-25 보호예수 부칙 누락으로 2016.1.1. 직후 양도 케이스 미커버 | 별도 PR로 분리 (§12) |
| R-5 (★ v2 신설) | KOSDAQ 2013.8.29.~2016.3.31. 4%/40억 임계는 교재 미명시 추정 | 현행 유지 — 변경 시 별도 검증 + 추가 anchor |
| R-6 (★ v2 신설) | 비상장 2016.1.1.~3.31. 구간 임계 교재 미명시 | 추정 입력 금지 — 현행 행(4%/50억) 유지, 사용자 명시 입력 시에만 검토 |
| R-7 (★ v2 신설, v4 정정) | `appliedThreshold` 7필드 확장 (`isVentureRule`·`ruleSource` 신설) 시 결과 뷰가 미import 상태 → **신규 import + 분기 통합 작업** 누락 위험 | `StockTransferTaxResultView.tsx` 에서 명시적 `result.appliedThreshold` 접근 + optional 필드 undefined 가드로 기존 동작 보존 |

---

## 12. 후속 PR (본 계획 범위 외)

- ~~**F-06**~~ — ✅ 본 PR 완료 (수동 입력 경로 안내 hint + 키움 자동 fallback 기존 보존)
- **F-08 ① / F-23 ⑯** — 상장 전환 / 신설법인 설립등기일 기준일 자동화
- **F-09 ② / F-10 ③ / F-14 ⑦** — 합병·분할 등기일 분기
- **F-12 ⑤ / F-13 ⑥** — 자본시장법 §178 투자기구 / 중소기업창업투자조합 합산 분기
- **F-15 ⑧ / F-16 ⑨ 자동 가산** — 대차주식·사모펀드 입력값을 엔진에서 자동 시총 가산 (본 PR은 사용자 수기 합산)
- **F-24 ⑰ 본인 미보유 시 합산 강제** (★ v3 신설) — 직전사업연도 종료일 본인 보유주식 0% + 특수관계인 합산만으로 대주주 판정 강제 분기. 기획재정부 금융세제-327, 2020.12.10.
- **F-25** — 2016.1.1. 의무보호예수 부칙 토글

---

## 13. Definition of Done

- [ ] Phase A·B·C 3개 PR 분리 완료
- [ ] ~~KoreanLaw MCP로 F-03·F-04·F-05 법령 검증~~ (v2: 사용자 지시로 생략, 교재 기준 채택)
- [ ] PHA-01~08 + PHB-01~04 anchor toBe 통과 (PHA-05는 v2 정정값 4%/50억)
- [ ] Phase C 시각 확인 PHC-A1·A2 (hint 9종 + LawArticleModal 배지)
- [ ] 14지점 sync-checker 0 누락 (Phase B의 `appliedThreshold` 결과 객체 확장만 영향)
- [ ] `npx vitest run __tests__/tax-engine/stock-transfer/` 전체 통과 (회귀 0건)
- [ ] 브라우저 수동 확인 (시기 경계 + 벤처 토글 + hint 9종)
- [ ] `MajorShareholderBlock.tsx:231` 안내 문구를 **"자동 적용 중 — §167의8①2호 나목 (40억)"** 으로 갱신 (v2: 단순 정보 표시를 자동 판정 반영 사실 표시로 승격, 메모리 [[feedback_ui_engine_dual_truth_avoidance]] 정합 강화)
- [ ] 결과 카드에 `appliedThreshold.isVentureRule` 분기 violet 배지 표시

---

## 14. 일정 (목표)

| Phase | 작업량 | 목표일 |
|---|---|---|
| Phase A | 0.5d (행 3건 추가 + anchor 8건) | 2026-05-20 |
| Phase B | 1.0d (시그니처·결과 객체 확장 + anchor 4건 + 회귀 보호) | 2026-05-21 |
| Phase C | 1.0d (hint 9종 + LawArticleModal 배지 9건) | 2026-05-22 |
| QA·Check | 0.5d | 2026-05-23 |

**총 3.0일** (v3 — Phase C 토글 폐기 + hint 9종으로 단축). v2의 "1.5d 토글 2종 + hint 6종" 표기는 v3에서 정정됨.

---

## 15. 정정 이력 (v1 → v2, 2026-05-19)

본 절은 v1 작성 후 자체 검토(2026-05-19)에서 도출된 P0~P2 오류 10건을 v2에서 모두 반영한 이력.

| # | 우선순위 | 항목 | v1 상태 | v2 정정 |
|---|---|---|---|---|
| 1 | **P0** | 비상장 매트릭스 `from: 2016-01-01` | 2016.1.1.~3.31. 구간 추정 통합 | `from: 2016-04-01` 만 신설, 2016.1.1.~3.31.은 현행 행(4%/50억) 유지 (§4.3·§4.4·R-6) |
| 2 | **P0** | §2.1 표 vs §4.3 코드 불일치 | F-04 "통합" + 주석 "~2023.12.31." 모순 | F-04 본 PR 범위 제외 명시·코드 주석 적용 범위 정정 (§2.1·§4.3) |
| 3 | P1 | `appliedThreshold` 결과 객체 확장 누락 | `{ shareRatio, marketCap }` 단순 구조 | `isVentureRule?`·`ruleSource?` optional 필드 신설 (§5.1·§5.2·§7 ⑦·R-7) |
| 4 | P1 | Phase C 토글 엔진 동작 모호 | `includesLendingShares` / `includesPEFIndirectShares` 토글 + "엔진 자동 가산 없음" | **토글 폐기**, hint 8종으로 통일 (§6.1·§6.2·§14·F-15/F-16 표) |
| 5 | P1 | F-25 Phase 표기 모순 | §2.4 "Phase B" / §3 Phase B 정의 다름 / §12 후속 | §2.4 "후속 PR로 분리" 일관 표기 (§2.4) |
| 6 | P2 | 벤처 임계 시기 적용 범위 모호 | F-05 "상시" 표기 | "2017.2.3. 이후 상시 (§167의8 유효)" + §157 측 2017.2.3. 삭제 무관 명시 (§2.1 F-05) |
| 7 | P2 | KOSDAQ 2013.8.29.~2016.3.31. 추정 위험 | 위험 등록 누락 | R-5 신설 (§11) |
| 8 | P2 | "위반 해소" 강한 표현 | DoD "위반 해소" 표기 | "단순 정보 표시를 자동 판정 반영 사실 표시로 승격" 으로 완화 (§13) |
| 9 | P2 | Phase C anchor 명명·표 누락 | "회귀 4건"만 | PHC-A1·A2 시각 확인 항목 명시 (§6.4) |
| 10 | P2 | KoreanLaw MCP 의존 대안 부재 | "검증 필수" 표기 | 사용자 지시 (2026-05-19)에 따라 생략 + 교재 기준 채택 + R-1 위험 유지 명시 (헤더·§9·§11) |

**v2 부수 효과**:
- Phase C 14지점 동기화 부담 사라짐 (UI hint·LawArticleModal만 변경, 엔진/타입/API/Zod/validate 변경 0)
- PHA-05 expected 값 정정 (2%/50억 → 4%/50억) — 교재 미명시 구간 추정 금지 정책 준수
- 위험 매트릭스 R-5/R-6/R-7 3건 추가 — 추정 입력·결과 객체 회귀·KoreanLaw 미검증 영역 명시

---

## 16. 정정 이력 (v2 → v3, 2026-05-19)

본 절은 v2 작성 후 2차 검토(2026-05-19)에서 도출된 P0 2건 + P1 2건 + P2 6건 = 10건을 v3에서 모두 반영한 이력. v2 정정 시 누락된 일관성 정정 + 교재 재대조 신규 오류 + 표현 보완.

| # | 우선순위 | 항목 | v2 상태 | v3 정정 |
|---|---|---|---|---|
| 1 | **P0** | §14 일정표 Phase C 행 v1 잔존 | "1.5d (토글 2종 + hint 6종 + 14지점)" | "1.0d (hint 9종 + LawArticleModal 배지 9건)" — Phase C 토글 폐기·hint 9종 반영 (§14) |
| 2 | **P0** | §8 디자인 산출물 "hint 6종" v1 잔존 | "hint 6종 문구 동결" | "hint 9종 문구 동결" + F-* 키 9건 명시 (§8) |
| 3 | **P1** | F-24 "✅ 정합" 표기 부정확 | 교재 ⑰(2020.12.10. 회신)는 본인 미보유 시 합산 강제 → 현행 `isLargestShareholderGroup` 토글 OFF 시 오판정 가능 | "⚠️ 부분 정합" 으로 정정 + 후속 PR §12에 F-24 본인 미보유 합산 강제 분기 신설 |
| 4 | **P1** | F-11 무상증자 hint 누락 | §2.3 "안내 hint만 추가" 표기 / §6.2 hint 8종에 F-11 없음 — 표/구현 불일치 | A안 채택 — §6.2 hint 9종으로 확장, F-11 "서면4팀-716, 2008.3.19." hint 추가 |
| 5 | P2 | F-05 "2017.2.3. 이후 상시" 표현 모호 | 마치 §167의8 임계가 2017.2.3. 이전엔 달랐던 것처럼 오해 유발 | "상시 유효 (§167의8①2호 나목 — §157의 2017.2.3. 삭제와 무관, §167의8은 변동 없음)" 으로 명확화 |
| 6 | P2 | F-08 "코스닥 기준 (5%)" 시점 혼동 | 회신문(2009.9.21.) 시점 임계 5%를 인용 — 현행 코스닥 2%와 다름 | "양도일 현재 코스닥 임계 적용 (회신문 2009.9.21. 시점 100분의 5 — 그대로 인용 금지)" 명확화 |
| 7 | P2 | 코넥스 시기별 행 누락의 결과 정합성 명시 부재 | 코드 리뷰 시 "코넥스도 2016.4.1. 행 추가?" 혼동 가능 | §4.0 신설 — 코넥스 2013.7.1.~2023.12.31. 단일 임계 4%/10억 통합 정합 명시 |
| 8 | P2 | §5.3 라인 번호 시점 의존성 | `MajorShareholderBlock.tsx:88·231` 등 라인 번호 표기는 선행 PR 영향 시 어긋남 | **symbol·함수명 기반 표기**로 전환 (`threshold` useMemo·`judgeIsMajorShareholder()` 본문·"벤처기업 안내 문구") |
| 9 | P2 | §5.3 `StockResultCard.tsx` 경로 미검증 | `components/calc/results/StockResultCard.tsx` 경로 가정 — 코드베이스 미확인 | "Phase B Design 단계에서 grep으로 실제 경로 확인 후 디자인 문서 동결" 명시 |
| 10 | P2 | §11 R-3 "8 hint" 오자 | "Phase C 8 hint 문구가..." | "Phase C **9개 hint** 문구가..." — v3 hint 9종으로 수치 정정 + 오자 수정 |

**v3 부수 효과**:
- §2.3 표(F-11·F-24)와 §6.2 hint 목록·§12 후속 PR이 모두 일관 동기화
- §14 일정 총 작업량 3.5d→**3.0d** 단축 (Phase C hint 9종이라도 토글 폐기로 14지점 부담 0)
- 후속 PR 목록에 F-24(본인 미보유 합산 강제) 신설 — 메모리 [[feedback_design_law_cases.md]] 정신 (법령 케이스 전수 고려) 강화
- 라인 번호 → symbol 기반 전환은 선행 PR 회귀 대비 + 메모리 [[feedback_pdca_session_efficiency]] 정신 부합

---

## 17. 정정 이력 (v3 → v4, 2026-05-19) — 디자인 통합 검토 반영

본 절은 v3 작성 후 디자인 1차·2차 검토 + Plan↔Design 통합 검토에서 도출된 오류 6건을 v4에서 반영한 이력. 실제 코드베이스 검증으로 가정값 → 동결값 전환이 주된 변경.

| # | 우선순위 | 항목 | v3 상태 | v4 정정 |
|---|---|---|---|---|
| 1 | **P0** | `appliedThreshold` 구조 가정 vs 실제 불일치 | v3 §5.2 — 2필드(shareRatio·marketCap)+신설 2필드 | 실제는 이미 5필드(+marketType·priorYearEndDate·fromDate) — v4 §5.2 7필드 확장으로 정정 |
| 2 | **P0** | 결과 카드 파일 경로 가정값 | "components/calc/results/StockResultCard.tsx" (미검증) | **`StockTransferTaxResultView.tsx`** (2026-05-19 grep 동결) — §5.3·§7 ⑦·§11 R-3 일괄 교체 |
| 3 | P1 | `appliedThreshold` 결과 뷰 import 미확인 | "결과 카드에 분기 추가" 단순 가정 | grep 결과 0건 — **신규 import + 분기 통합** 작업으로 명시 (§5.2·§5.3·§3 Phase B 영향 파일) |
| 4 | P1 | `buildAppliedThreshold()` 헬퍼 존재 미명시 | 디자인 누락 | engine.design STEP 2.3 + plan §5.2 에 헬퍼 spread 자동 전파 패턴 명시 |
| 5 | P2 | Phase B 안내 문구 "제거 가능" 표현 | §3 Phase B 영향 파일 "안내 문구 → 실제 적용 (제거 가능)" | "갱신 (제거 아님 — 비벤처/벤처 양 분기 표시)" 으로 정정 (§3) |
| 6 | P2 | §5.5 회귀 보호 — `isVentureCompany` optional 추정 | "누락 시 false 추가" 표현 | `isVentureCompany`는 required boolean 검증 → 위험 케이스를 "vrue 명시 비상장 anchor" 로 집중 (§5.5) |

**v4 부수 효과**:
- Plan↔Engine Design↔UI Design 3문서 cross-check 정합 (`appliedThreshold` 5→7필드, 결과 뷰 경로 단일화)
- Phase A UI 변경 0건 확정 (기존 `fromDate` 데이터 활용)
- Phase B 영향 파일 6개 명시 (v3 3개 → v4 6개) — 작업 범위 정확화
- 회귀 위험 분석을 "추정"에서 "grep 명령 + 위험/안전 케이스 분류" 로 구체화

---

## 18. 정정 이력 (v4 → v5, 2026-05-19) — Phase C 완료 반영

본 절은 v4 작성 후 사용자 요청으로 Phase C(UI hint 9종)을 본 PR로 통합 완료한 이력.

| # | 변경 항목 | v4 상태 | v5 결과 |
|---|---|---|---|
| 1 | Phase C 범위 결정 | "별도 PR로 분리 가능" (§12 후속 PR) | **본 PR 통합 완료** (사용자 요청 2026-05-19) |
| 2 | hint 9종 구현 (F-11·F-15~F-22) | 미구현 | **`MajorShareholderCheckpointHints.tsx` 신규 컴포넌트** (3 그룹 collapsible — sky/emerald/amber tone) |
| 3 | LawArticleModal 배지 | 미연결 | 각 hint 항목에 trailing 배지 연계 (시행령 §157·해석례 등 9건) |
| 4 | UI 위치 통합 | 미통합 | Group A·B: 본인 시가총액 직후 / Group C: 합산 시총 입력 직후 |
| 5 | "자동 가산 없음" 책임 명시 | 디자인 명시 | 각 그룹 카드 하단 "본 앱은 자동 가산하지 않습니다 — 사전 합산 입력 책임" 강조 박스 |

**v5 구현 상세**:
- 신규 파일 `components/calc/stock-transfer/MajorShareholderCheckpointHints.tsx` (3 컴포넌트 export)
- `MarketCapHintsCard` — F-11·F-17·F-18·F-22 (시총 산정, sky tone)
- `IssuedSharesHintsCard` — F-19·F-20 (발행주식총수, emerald tone)
- `CombinedShareHintsCard` — F-15·F-16·F-21 (특수관계인 합산, amber tone)
- 각 hint는 `<details>` collapsible로 기본 접힘 상태 → 화면 혼잡 차단
- 메모리 [[feedback_no_silent_apportion_fallback]] 정신 — 자동 가산 없음 명시 + 사용자 책임 안내
- §12 후속 PR 목록에서 Phase C 항목 제거 (다른 항목 F-06·F-08~F-14·F-23·F-24·F-25는 그대로 유지)

**v5 후속 PR 범위 (본 PR 완료 이후)**:
- F-24 — 본인 미보유 시 합산 강제 분기
- ~~F-06 — 직전거래일 fallback~~ (v6에서 완료)
- F-08~F-14·F-23 — 합병·분할·신설법인 특수분기
- F-15·F-16 자동 가산 — 대차주식·사모펀드 엔진 자동 시총 가산 (현행은 사용자 수기)
- F-25 — 2016.1.1. 의무보호예수 부칙

---

## 19. 정정 이력 (v5 → v6, 2026-05-19) — F-06 완료 반영

본 절은 v5 작성 후 사용자 요청으로 F-06(직전거래일 fallback)을 본 PR로 통합 완료한 이력.

| # | 변경 항목 | v5 상태 | v6 결과 |
|---|---|---|---|
| 1 | F-06 범위 결정 | "별도 PR — 직전거래일 fallback" (§12 후속) | **본 PR 통합 완료** (사용자 요청 2026-05-19) |
| 2 | 키움 API 자동 fallback | 이미 구현됨 (`/api/kiwoom/daily-close` `priorTradingDate` 반환) | 변경 없음 — 기존 동작 보존 |
| 3 | KiwoomMarketCapHelper 안내 | 이미 구현됨 (`info.priorTradingDate`·`info.date` 비교 표시) | 변경 없음 — 기존 동작 보존 |
| 4 | 수동 입력 경로 안내 | 미구현 — 비거래일 인지 수단 없음 | **`MajorShareholderBlock`에 비거래일 검증 hint 추가** (amber tone) — 비상장·키움 미연동 사용자 대상 |
| 5 | `isKrxTradingDay`·`nonTradingLabel` 재사용 | 외부 모듈에서만 사용 | `MajorShareholderBlock` `priorYearEndTradingStatus` useMemo에 통합 — store 미러링 없이 derived state |

**v6 구현 상세**:
- `MajorShareholderBlock.tsx` import에 `isKrxTradingDay`·`nonTradingLabel` 추가 (`lib/kiwoom/calendar`)
- `priorYearEndTradingStatus` useMemo — `form.priorYearEndDate` + `form.marketType` 의존성
  - 상장 3시장(kospi/kosdaq/konex)에서만 활성 — 비상장은 §165④ 보충적 평가 별도 트랙
  - 비거래일이면 `{ isTrading: false, reason: "토요일 · 거래일 제외" 등 }` 반환
- amber tone 안내 카드 — `priorYearEndDate` FieldCard 직후 노출
  - "비거래일 입력 — 직전거래일 종가 적용 필요 (§157①, 교재 49 (3) ①)" 헤더
  - 사용자 입력일자 + 비거래일 사유 + 안내 문구
  - 키움 자동조회 사용 권장 + 수동 입력 시 사용자 책임 명시
- 메모리 [[feedback_useeffect_store_mirror_forbidden]] 정합 — useMemo derived state로 store 미러링 없음
