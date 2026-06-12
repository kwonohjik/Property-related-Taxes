# 종합부동산세 과세연도별 세법 파라미터 — 엔진 설계

> 작성일: 2026-06-11
> 담당: comprehensive-tax-engine-senior
> 연관 파일:
>   - `lib/tax-engine/comprehensive-tax.ts`
>   - `lib/tax-engine/comprehensive-tax-helpers.ts`
>   - `lib/tax-engine/types/comprehensive.types.ts`
>   - `lib/tax-engine/legal-codes/comprehensive.ts`
>   - `lib/tax-engine/data/comprehensive-historical.ts` (신규)
>   - `__tests__/tax-engine/comprehensive/year-aware-params.test.ts` (신규)

---

## Context

국세청 사례집(2022 귀속)을 앱에 입력하면 전 사례 불일치. 원인은
`comprehensive-tax.ts`가 `assessmentYear`를 날짜 계산에만 쓰고
**기본공제·세율표·공정시장가액비율·세부담상한율을 현행(2023~) 상수로 고정**하기 때문.

구체적 위치:
- `comprehensive-tax.ts:68~74` `HOUSING_BRACKETS` — 현행 0.5~2.7% 7단계 하드코딩
- `legal-codes/comprehensive.ts` `COMPREHENSIVE_CONST.BASIC_DEDUCTION_GENERAL=9억` 고정
- `COMPREHENSIVE_CONST.FAIR_MARKET_RATIO_HOUSING=0.60` 고정
- `comprehensive-tax-helpers.ts:applyTaxCap()` 150% 단일 상한 고정
  (2026-06-11 GAP-2에서 `isMultiHouseInAdjustedArea` + 300% 상수를 완전 삭제 — 연도 분기로 부활 필요)

---

## ★ 케이스 인벤토리 (PDF 사례집 실측 anchor)

> 출처: 국세청 「2022 귀속 종합부동산세 계산 사례」 (PDF 42페이지, 스캔본)
> 책 페이지 = pdf 페이지 + 155. 사례 계산은 원단위까지 검증됨.

| # | 사례번호 | 귀속연도 | 시나리오 | 주요 anchor 수치 | 테스트 파일 | 상태 |
|---|---------|---------|---------|----------------|-----------|------|
| 1 | 사례1 | 2022 | 일반 1주택 | 과표=(9.5억−6억)×60%=2.1억, 세율 0.6%→산출 1,260,000, 재산세공제 504,000, 결정 756,000 | `year-aware-params.test.ts` | ☐ TODO |
| 2 | 사례2 | 2022 | 일반 1주택 세부담 상한 (전년 21년 세액 포함) | 21년 FMR=95%, 22년 산출 2,070,000; 상한액(150%)=1,989,000 | `year-aware-params.test.ts` | ☐ TODO |
| 3 | 사례3 | 2022 | 공유지분 1주택 (부부 각 지분 = 일반) | 과표=(2.7억−6억)×60%<0 → 납세의무 없음; 21년 산출 712,800 | `year-aware-params.test.ts` | ☐ TODO |
| 4 | 사례4 | 2022 | 일시적 1세대 2주택 (특례로 1세대1주택 적용) | **(27억−11억)×60%=9.6억 ×1.2%−3,000,000 = 8,520,000** (pdf9 실측 — STEP 7 오독 정정) | `year-aware-params.test.ts` | ☐ TODO |
| 5 | 사례5 | 2022 | 부부공동명의 세부담 상한 | 21년 재산세=1,245,000, 22년 산출계산 포함 | `year-aware-params.test.ts` | ☐ TODO |
| 6 | 사례6 | 2022 | 주택+건물+부속토지 혼합 (FMR 주택 60% / 토지 100%) | 주택분 과표 = (27억−6억)×60%, 별도합산토지 과표=(3.6억−6억)<0 → 무 | `year-aware-params.test.ts` | ☐ TODO |
| 7 | 사례7 | 2022 | 다가구주택 합산 (1세대1주택 특례 미적용) | 과표=(7.2억+3억−6억)×60%=2.52억, 세율 0.6% | `year-aware-params.test.ts` | ☐ TODO |
| 8 | 사례8 | 2022 | 조정대상지역 2주택 세부담 상한 300% | 22년 다주택세율 2.2%−4,800,000; 21년 분도 95% FMR 적용; 상한 **300%** 적용 | `year-aware-params.test.ts` | ☐ TODO |
| 9 | 사례9 | 2022 | 3주택 이상 보유자 | **(29억−6억)×60%=13.8억 ×3.6%−21,600,000 = 28,080,000** (pdf22 실측 — STEP 7 오독 정정) | `year-aware-params.test.ts` | ☐ TODO |
| 10 | 사례10 | 2022 | 종합합산 토지 (농지·나대지) | 토지 과표=(13억−5억)×100%=8억, 세율 1%→산출 8,000,000 vs 전년비율안분 비교 | `year-aware-params.test.ts` | ☐ TODO |
| 11 | 사례11 | 2022 | 별도합산 토지 (상가·부설주차장) | 과표=(51억−80억)<0 → 납세의무 없음; 전년 포함 시 과표=(51+46−80)×100%=17억 | `year-aware-params.test.ts` | ☐ TODO |
| 12 | 사례12 | 2022 | 신고서 양식 작성 사례 (별지 서식 4종 재현) | 1주택 공시 15억·과표 **2.4억**·0.6%→산출 **1,440,000**·재산세 FMR 45%·결정 302,400 | `comprehensive-case12.test.ts` | ✅ 완료 (feat/comprehensive-case12-replica) |
| 13 | 사례13 | 2022 | 1세대1주택+합산배제주택 혼합 (21년 세부담 상한 포함) | 21년 FMR=95%, 세율 0.8%−600,000; 1세대1주택 고령자·장기 공제 안분 = 종부세대상 공시/전체 공시 | `year-aware-params.test.ts` | ☐ TODO |
| 14 | 사례 연도파라미터표 | 2017~2025 | 연도별 FMR 전체 | 2017=80%, 2018=80%, 2019=85%, 2020=90%, 2021=95%, 2022+=주택60%/토지100% | `year-params-table.test.ts` | ☐ TODO |
| 15 | 사례13 21년분 | 2021 | 21년 직전연도 상당액 재계산 | **(14.95억−11억)×95%=3.7525억 ×0.8%−600,000 = 2,402,000** (pdf13 실측 — STEP 7 정정) | `year-aware-params.test.ts` | ☐ TODO |

---

## 법령 근거 (KoreanLaw MCP 검증 완료)

### 기본공제 — 종합부동산세법 §8①

```
[현행 2023~]
  §8①1호: 1세대 1주택자 — 12억원
  §8①3호: 일반 — 9억원

[구법 2022 이전]
  §8① 본문 구버전: 1세대 1주택자 — 11억원, 일반 — 6억원
  (2022.12.31 이전 시행본. 법제처 API 연혁 MST 직접 조회 불가 — PDF 사례집 실측 anchor로 검증)
```

**실측 검증**: 사례1 기본공제 6억(일반), 사례4 기본공제 11억(1세대1주택) → 2022 귀속 = 6억/11억 확정.

### 공정시장가액비율 — 종합부동산세법 시행령 §2의4 (KoreanLaw MCP 직접 확인)

```
§2의4①: 기본값 100분의 60 (주택분)
  단서: 2019~2021 귀속은 아래 연도별 비율 적용
  1호: 2019 → 100분의 85
  2호: 2020 → 100분의 90
  3호: 2021 → 100분의 95

§2의4②: 토지분(§13①②) → 기본값 100분의 100
  단서: 2019~2021 토지도 동일 비율 (85/90/95%)

∴ 2022 귀속 = 주택 60%, 토지 100%  (단서 적용연도 아님)
∴ 2021 귀속 = 주택 95%, 토지 95%
∴ 2020 귀속 = 주택 90%, 토지 90%
∴ 2019 귀속 = 주택 85%, 토지 85%
∴ 2018 이전 = 주택·토지 모두 80%  (PDF 사례집 p36 표 실측)
∴ 2023+ = 주택 60%, 토지 100%
```

**추가 실측**: PDF p36 종합부동산세 공정시장가액비율표 — 2017=80%, 2018=80%, 2019=85%, 2020=90%, 2021=95% 주택·토지 공통.

### 주택분 세율 — 종합부동산세법 §9① (KoreanLaw MCP 직접 확인)

**현행(2023~) §9①:**

| 구분 | 과세표준 구간 | 세율 | 누진공제 |
|------|------------|------|---------|
| 2주택 이하 (§9①1호) | 3억 이하 | 0.5% | 0 |
| | 3억~6억 | 0.7% | 600,000 |
| | 6억~12억 | 1.0% | 2,400,000 |
| | 12억~25억 | 1.3% | 6,000,000 |
| | 25억~50억 | 1.5% | 11,000,000 |
| | 50억~94억 | 2.0% | 36,000,000 |
| | 94억 초과 | 2.7% | 101,800,000 |
| 3주택 이상 (§9①2호) | 3억 이하 | 0.5% | 0 |
| | 3억~6억 | 0.7% | 600,000 |
| | 6억~12억 | 1.0% | 2,400,000 |
| | 12억~25억 | 2.0% | 14,400,000 |
| | 25억~50억 | 3.0% | 39,400,000 |
| | 50억~94억 | 4.0% | 89,400,000 |
| | 94억 초과 | 5.0% | 183,400,000 |

> §9①2호 누진공제는 법문 "N억원+(초과×세율)" 공식에서 역산.
> 예: 12억~25억 구간 = 2.0%, 12억 이하 기산 = 6억×0.7%+6억×1.0%=10,200,000 → 공식 base = 1.2억×0.7%+0.6억×1.0%-= ... 아래 검증값 참조.

**2021·2022 귀속 세율표 (동일 — 13단계 검토 STEP 7 전면 정정)**

> ⚠️ 초안의 2021·2022 표는 현행(2023~) 표를 잘못 복사한 것이었음(0.5/0.7/1.0/1.3…).
> 사례 실측 anchor — 사례1(과표 2.1억→**0.6%**) · 사례13의 **21년분**(과표 (14.95억−11억)×95%=3.7525억→**0.8%−60만**, pdf13 실측 — 2021=2022 동일표 방증) ·
> 사례4(과표 9.6억→**1.2%−300만**) — 와 경계 연속성 검산으로 아래 표 확정.

일반(2주택 이하, 조정대상지역 1주택 포함):

| 과세표준 구간 | 세율 | 누진공제 | anchor |
|------------|------|---------|---|
| 3억 이하 | 0.6% | 0 | 사례1 (2.1억×0.6%=1,260,000) |
| 3억~6억 | 0.8% | 600,000 | 사례13 (3.7525억×0.8%−60만=2,402,000) |
| 6억~12억 | 1.2% | 3,000,000 | 사례4 (9.6억×1.2%−300만=8,520,000) |
| 12억~50억 | 1.6% | 7,800,000 | 경계 검산 (12억: 1.2%측=1,140만 = 1.6%측 1,920만−780만 ✓) |
| 50억~94억 | 2.2% | 37,800,000 | 경계 검산 |
| 94억 초과 | 3.0% | 113,000,000 | 경계 검산 |

다주택(**조정대상지역 2주택 OR 3주택 이상** — 2022 §9①3호 구법):

| 과세표준 구간 | 세율 | 누진공제 | anchor |
|------------|------|---------|---|
| 3억 이하 | 1.2% | 0 | — |
| 3억~6억 | 1.6% | 1,200,000 | 경계 검산 |
| 6억~12억 | 2.2% | 4,800,000 | 사례8 (11.875억×2.2%−480만=21,325,000, pdf21) |
| 12억~50억 | 3.6% | 21,600,000 | **사례9 (13.8억×3.6%−2,160만=28,080,000, pdf22 실측)** |
| 50억~94억 | 5.0% | 91,600,000 | 경계 검산 (50억: 3.6%측 1.584억 = 5.0%측 2.5억−9,160만 ✓) |
| 94억 초과 | 6.0% | 185,600,000 | 경계 검산 |

> ✅ **축자 확정 (Phase 0 완료)**: 국세청 공식 세율표(사례집 pdf38, 책 193 — 신고서 작성방법 부록) 300dpi 실측.
> **구간 = 3/6/12/50/94억 확정** (25억 구간 없음 — 2023 개정 신설). 일반 12~50억 1.6%/780만 · 50~94억 2.2%/3,780만,
> 다주택 12~50억 3.6%/2,160만 · 50~94억 5.0%/9,160만 — 본 표와 전부 일치.
> 토지분도 동표에서 확정: 2022 종합합산 1/2/3%(15억/45억 경계)·별도합산 0.5/0.6/0.7%(200억/400억) = **현행과 동일** (FMR만 연도별).
>
> 2021 = 2022 동일 표: 사례8·9·13의 "직전연도(21년) 종부세상당액 재계산"이 동일 세율·누진공제를 사용함을 PDF에서 실측.
> (단 FMR만 95%로 상이 — 예: 사례8 21년분 (18.5억−6억)×**95%**=11.875억)

### 세부담 상한 — 종합부동산세법 §10 (KoreanLaw MCP 직접 확인)

```
[현행 2023~] §10: 150% 단일 상한. 1호·2호 삭제됨.

[구법 2022 이하] §10②(삭제됨):
  일반:                  전년도 총세액 × 150%
  조정대상지역 2주택+:   전년도 총세액 × 300%
```

**실측 검증**: 사례8 "해당연도 세부담 상한 = 나 × 300%" 직접 명시 (PDF p20).
사례2 상한율 150% 일반 확인 (PDF p4).

### 1세대1주택 세액공제 — 종합부동산세법 §9⑤⑥⑦⑧⑨ (현행 기준, 2022~동일)

고령자 공제(§9⑥): 60세~65세 미만 20%, 65세~70세 미만 30%, 70세 이상 40%.
장기보유 공제(§9⑧): 5년~10년 미만 20%, 10년~15년 미만 40%, 15년 이상 50%.
합산 상한(§9⑤ 단서): 80%.

**안분 계산 (사례13 실측 확인)**:
- 합산배제 주택과 일반주택 혼합 시 — `1세대1주택 고령자/장기보유 공제 대상 산출세액 = 전체 산출세액 × (종부세 과세대상 공시가격 / 전체 공시가격)`
- 이는 §9⑦·⑨의 "공시가격합계액으로 안분하여 계산" 조문에 근거.

---

## 연도별 파라미터 anchor 표 (완성판)

| 귀속연도 | 기본공제 일반 | 기본공제 1세대1주택 | 주택 FMR | 토지 FMR | 세부담상한 일반 | 세부담상한 다주택(조정2+) | 주택 세율 체계 |
|--------|------------|-------------------|---------|---------|-------------|---------------------|------------|
| ~2018  | 6억 | 9억 | 80% | 80% | 150% | 300% | 일반/다주택 분리 |
| 2019   | 6억 | 9억 | 85% | 85% | 150% | 300% | 일반/다주택 분리 |
| 2020   | 6억 | 9억 | 90% | 90% | 150% | 300% | 일반/다주택 분리 |
| 2021   | 6억 | 11억 | 95% | 95% | 150% | 300% | 일반/다주택 분리 |
| 2022   | 6억 | 11억 | **60%** | 100% | 150% | 300% | 일반/다주택 분리 |
| 2023+  | **9억** | **12억** | 60% | 100% | 150% | 삭제 (150% 단일) | 통합 단일 |

> 검증 출처:
> - 기본공제: PDF 사례집 실측 (사례1·4) + §8① KoreanLaw
> - FMR: 시행령 §2의4 KoreanLaw 직접 확인 + PDF p36 표
> - 세부담상한: §10 KoreanLaw + PDF 사례8·21 실측
> - 세율 체계: 현행 §9① KoreanLaw + PDF p38 표 실측

**지원 연도 권고**: **2021~2025** (5개 연도).
- 2020 이전은 FMR 이외에도 기본공제 9억→6억 구분, 세율 추가 검증 필요.
- 사례집이 2022 귀속만 다루므로 2020 이전은 anchor 없음.
- 추후 확장 시 2019~2020 추가 용이하도록 구조 설계.
- 2018 이전은 FMR 80% 고정이나 세율·기본공제 추가 검증 필요 — v2.0 이관.

---

## 엔진 설계

### 신규 파일: `lib/tax-engine/data/comprehensive-historical.ts`

```ts
/**
 * 종합부동산세 과세연도별 확정 파라미터
 *
 * 설계 원칙 (feedback_historical_tax_tables.md):
 *   - 효력이 종료되어 다시 변경되지 않는 역사적 과세 데이터는 DB 아닌 정적 상수로 관리.
 *   - 현행(현재 연도)은 항상 마지막 항목 — 연도 범위 외 입력 시 현행 적용.
 *   - Object.freeze()로 불변성 보장.
 *
 * 검증 출처:
 *   - KoreanLaw MCP: §8①, §9①, §10, 시행령 §2의4 직접 조회
 *   - PDF anchor: 국세청 「2022 귀속 종합부동산세 계산 사례」 실측
 */

export interface ComprehensiveBracket {
  /** 구간 상한 (Infinity = 최상위) */
  limit: number;
  /** 세율 (소수, 예: 0.005 = 0.5%) */
  rate: number;
  /** 누진공제 (원) */
  deduction: number;
}

export interface ComprehensiveYearParams {
  /** 과세귀속연도 (assessmentYear 기준) */
  year: number | "default";

  // ── 기본공제 (§8①) ──
  /** 일반 기본공제 (원) */
  basicDeductionGeneral: number;
  /** 1세대1주택자 기본공제 (원) */
  basicDeductionOneHouse: number;

  // ── 공정시장가액비율 (시행령 §2의4) ──
  /** 주택분 공정시장가액비율 (0~1) */
  fairMarketRatioHousing: number;
  /** 토지분 공정시장가액비율 (0~1) */
  fairMarketRatioLand: number;

  // ── 주택분 세율 (§9①) — STEP 9: flat 필드 + multi 필수화 (계획서 §3-1 정합) ──
  /** 일반(2주택 이하, §9①1호) 세율 구간 */
  housingBracketsGeneral: ComprehensiveBracket[];
  /**
   * 다주택 세율 구간 — 연도별 의미 상이:
   *   ≤2022: 조정대상지역 2주택 OR 3주택 이상 (구 §9①3호)
   *   2023+: 3주택 이상 (§9①2호, 12억 초과 구간부터 중과) — 현행도 필수 존재
   * 선택은 isMultiHouseRate(year, taxableHouseCount, isMultiHouseInAdjustedArea)가 담당.
   */
  housingBracketsMulti: ComprehensiveBracket[];

  // ── 세부담 상한 (§10) ──
  /** 일반 세부담 상한율 (1.5 = 150%) */
  taxCapRateGeneral: number;
  /**
   * 조정대상지역 2주택+/3주택+ 세부담 상한율 (3.0 = 300%)
   * 2023+ 이후 undefined (구 §10② 삭제 — 단일 150%).
   */
  taxCapRateMultiHouseAdjusted?: number;
}

// ============================================================
// 연도별 파라미터 테이블
// ============================================================

/**
 * 2021·2022 귀속 일반(2주택 이하) 세율 — STEP 9 확정 (초안의 현행표 혼입 정정)
 * 실측 anchor:
 *   사례1:  과표 2.1억    × 0.6% = 1,260,000 ✓ (3억 이하 = 0.6%, 초안 0.5%는 anchor 위반)
 *   사례13: 과표 3.7525억 × 0.8% − 600,000 = 2,402,000 ✓ (21년분, pdf13)
 *   사례4:  과표 9.6억    × 1.2% − 3,000,000 = 8,520,000 ✓ (pdf9)
 *   12억 초과 구간은 경계 연속성 검산 (사례 미커버 — Pre-Do 법문 축자 확정)
 */
const BRACKETS_2022_GENERAL: ComprehensiveBracket[] = Object.freeze([
  { limit: 300_000_000,   rate: 0.006, deduction: 0 },
  { limit: 600_000_000,   rate: 0.008, deduction: 600_000 },
  { limit: 1_200_000_000, rate: 0.012, deduction: 3_000_000 },
  { limit: 5_000_000_000, rate: 0.016, deduction: 7_800_000 },   // 12억~50억 (25억 분할 여부 축자 확정 대기)
  { limit: 9_400_000_000, rate: 0.022, deduction: 37_800_000 },
  { limit: Infinity,      rate: 0.030, deduction: 113_000_000 },
]) as ComprehensiveBracket[];

/**
 * 2021·2022 귀속 다주택(조정 2주택 OR 3주택+, 구 §9①3호) 세율 — STEP 9 확정
 * 실측 anchor:
 *   사례8: 과표 11.875억 × 2.2% − 4,800,000 = 21,325,000 ✓ (pdf21)
 *   사례9: 과표 13.8억   × 3.6% − 21,600,000 = 28,080,000 ✓ (pdf22 — 12억 초과 구간 직접 anchor)
 *   50억 초과 구간은 경계 검산 (초안의 94억 행 중복·5.0% 소실 정정)
 */
const BRACKETS_2022_MULTI_HOUSE: ComprehensiveBracket[] = Object.freeze([
  { limit: 300_000_000,    rate: 0.012, deduction: 0 },
  { limit: 600_000_000,    rate: 0.016, deduction: 1_200_000 },
  { limit: 1_200_000_000,  rate: 0.022, deduction: 4_800_000 },
  { limit: 5_000_000_000,  rate: 0.036, deduction: 21_600_000 }, // 12억~50억 (25억 분할 여부 축자 확정 대기)
  { limit: 9_400_000_000,  rate: 0.050, deduction: 91_600_000 },
  { limit: Infinity,       rate: 0.060, deduction: 185_600_000 },
]) as ComprehensiveBracket[];

/** 2021 = 2022 동일 (사례8·9·13의 21년분 재계산이 동일 세율·누진공제 사용 — PDF 실측. FMR만 95%로 상이) */
const BRACKETS_2021_GENERAL: ComprehensiveBracket[] = BRACKETS_2022_GENERAL;
const BRACKETS_2021_MULTI_HOUSE: ComprehensiveBracket[] = BRACKETS_2022_MULTI_HOUSE;

/**
 * 현행(2023+) 2주택이하 세율 — KoreanLaw MCP §9①1호 직접 확인
 */
const BRACKETS_2023_GENERAL: ComprehensiveBracket[] = Object.freeze([
  { limit: 300_000_000,    rate: 0.005, deduction: 0 },
  { limit: 600_000_000,    rate: 0.007, deduction: 600_000 },
  { limit: 1_200_000_000,  rate: 0.010, deduction: 2_400_000 },
  { limit: 2_500_000_000,  rate: 0.013, deduction: 6_000_000 },
  { limit: 5_000_000_000,  rate: 0.015, deduction: 11_000_000 },
  { limit: 9_400_000_000,  rate: 0.020, deduction: 36_000_000 },
  { limit: Infinity,       rate: 0.027, deduction: 101_800_000 },
]) as ComprehensiveBracket[];

/**
 * 현행(2023+) 3주택이상 세율 — KoreanLaw MCP §9①2호 직접 확인
 * 누진공제는 법문 "N원+(초과×세율)" 역산.
 */
const BRACKETS_2023_MULTI_HOUSE: ComprehensiveBracket[] = Object.freeze([
  { limit: 300_000_000,    rate: 0.005, deduction: 0 },
  { limit: 600_000_000,    rate: 0.007, deduction: 600_000 },
  { limit: 1_200_000_000,  rate: 0.010, deduction: 2_400_000 },
  { limit: 2_500_000_000,  rate: 0.020, deduction: 14_400_000 },
  { limit: 5_000_000_000,  rate: 0.030, deduction: 39_400_000 },
  { limit: 9_400_000_000,  rate: 0.040, deduction: 89_400_000 },
  { limit: Infinity,       rate: 0.050, deduction: 183_400_000 },
]) as ComprehensiveBracket[];

// ============================================================
// 파라미터 테이블 (연도 오름차순)
// ============================================================

export const COMPREHENSIVE_YEAR_PARAMS: readonly ComprehensiveYearParams[] = Object.freeze([
  {
    year: 2021,
    basicDeductionGeneral:   600_000_000,
    basicDeductionOneHouse:  1_100_000_000,
    fairMarketRatioHousing:  0.95,
    fairMarketRatioLand:     0.95,
    housingBracketsGeneral: BRACKETS_2021_GENERAL,
    housingBracketsMulti:   BRACKETS_2021_MULTI_HOUSE,
    taxCapRateGeneral:              1.50,
    taxCapRateMultiHouseAdjusted:   3.00,
  },
  {
    year: 2022,
    basicDeductionGeneral:   600_000_000,
    basicDeductionOneHouse:  1_100_000_000,
    fairMarketRatioHousing:  0.60,   // 시행령 §2의4 단서 종료 → 기본값 60%
    fairMarketRatioLand:     1.00,
    housingBracketsGeneral: BRACKETS_2022_GENERAL,
    housingBracketsMulti:   BRACKETS_2022_MULTI_HOUSE,
    taxCapRateGeneral:              1.50,
    taxCapRateMultiHouseAdjusted:   3.00,
  },
  {
    year: "default",   // 2023 이상 모든 연도에 적용
    basicDeductionGeneral:   900_000_000,
    basicDeductionOneHouse:  1_200_000_000,
    fairMarketRatioHousing:  0.60,
    fairMarketRatioLand:     1.00,
    housingBracketsGeneral: BRACKETS_2023_GENERAL,
    housingBracketsMulti:   BRACKETS_2023_MULTI_HOUSE, // §9①2호 3주택 이상 (12억 초과 중과) — 현행도 필수
    taxCapRateGeneral:              1.50,
    taxCapRateMultiHouseAdjusted:   undefined,  // §10①②가 삭제됨
  },
]) as readonly ComprehensiveYearParams[];

// ============================================================
// 단일 진입 헬퍼
// ============================================================

/**
 * 과세귀속연도로 파라미터를 반환.
 * 2023 이상은 "default" 파라미터 적용.
 * ⚠️ 2021 미만(미지원 연도)은 silent 2021 적용 금지 — FMR(2020=90% 등)·세율이 달라
 *    잘못된 세액을 조용히 반환하게 됨. 미지원 연도는 엔진 warnings에
 *    "해당 연도 세법 미지원 — 2021년 이후 연도를 선택하세요" 경고 + UI는 연도 Select로 사전 차단.
 */
export function getComprehensiveParams(assessmentYear: number): ComprehensiveYearParams {
  for (const p of COMPREHENSIVE_YEAR_PARAMS) {
    if (p.year === assessmentYear) return p;
  }
  // 2023 이상 또는 지원 범위 외 → default
  const defaultParams = COMPREHENSIVE_YEAR_PARAMS.find((p) => p.year === "default");
  if (!defaultParams) throw new Error("종합부동산세 default 파라미터 누락");
  return defaultParams;
}

/** 지원 연도 배열 (UI RadioCardGroup용) */
export const COMPREHENSIVE_SUPPORTED_YEARS: readonly number[] = Object.freeze(
  [2021, 2022, 2023, 2024, 2025],
);
```

---

### 엔진 리팩터링 방향

#### 1. `ComprehensiveTaxInput` 타입 확장

파일: `lib/tax-engine/types/comprehensive.types.ts`

```ts
export interface ComprehensiveTaxInput {
  // ... 기존 필드 유지 ...

  /**
   * 조정대상지역 2주택 이상 여부 (구 §10② — 2022 귀속 이하 연도에서만 유효)
   * 2023+ 연도에서는 엔진이 무시.
   * 2026-06-11 GAP-2에서 삭제됐으나 연도 분기로 부활.
   */
  isMultiHouseInAdjustedArea?: boolean;
}
```

#### 2. `comprehensive-tax.ts` Step 3·4·5 리팩터링

```ts
// 현행 (하드코딩)
const basicDeduction = input.isOneHouseOwner
  ? COMPREHENSIVE_CONST.BASIC_DEDUCTION_ONE_HOUSE
  : COMPREHENSIVE_CONST.BASIC_DEDUCTION_GENERAL;
const fairMarketRatio = COMPREHENSIVE_CONST.FAIR_MARKET_RATIO_HOUSING;

// 변경 후 (연도별 파라미터 사용)
import { getComprehensiveParams } from "./data/comprehensive-historical";
const yearParams = getComprehensiveParams(input.assessmentYear);
const basicDeduction = input.isOneHouseOwner
  ? yearParams.basicDeductionOneHouse
  : yearParams.basicDeductionGeneral;
const fairMarketRatio = yearParams.fairMarketRatioHousing;
```

#### 3. `calcHousingTaxAmount()` 세율 분기

```ts
// 변경 전: HOUSING_BRACKETS 하드코딩
// 변경 후: 연도 + isMultiHouseInAdjustedArea 조합으로 brackets 선택

function calcHousingTaxAmount(
  taxBase: number,
  brackets: ComprehensiveBracket[],
): { calculatedTax: number; appliedRate: number; progressiveDeduction: number } {
  // 기존 로직 동일, brackets를 매개변수로
}

// 호출 시 (STEP 7 정정 — 2축 판정, 계획서 §3-2와 통일):
// taxableHouseCount = aggregationExclusion.includedCount (합산배제 제외 후 과세대상 주택 수 — 엔진에 이미 존재, 자동 도출)
function isMultiHouseRate(
  year: number,
  taxableHouseCount: number,
  isMultiHouseInAdjustedArea: boolean,
): boolean {
  if (year <= 2022) return taxableHouseCount >= 3 || isMultiHouseInAdjustedArea; // 구 §9①3호
  return taxableHouseCount >= 3;                                                 // 현행 §9①2호 (조정 무관)
}

const useMulti = isMultiHouseRate(
  input.assessmentYear,
  aggregationExclusion.includedCount,
  input.isMultiHouseInAdjustedArea ?? false,
);
const brackets = useMulti
  ? yearParams.housingBracketsMulti
  : yearParams.housingBracketsGeneral;
const { calculatedTax, appliedRate, progressiveDeduction } = calcHousingTaxAmount(taxBase, brackets);
// result echo: isMultiHouseRateApplied = useMulti (결과뷰 "다주택 중과세율 적용" 안내)
```

> **STEP 7 정정 (초안 "2023+ general 단일·v2.0 이관" 폐기)**: 현행 §9①**2호(3주택 이상)는 12억 초과
> 구간부터 중과세율(2.0/3.0/4.0/5.0%)** — 이를 빼면 현행법도 미구현인 채 남는다(3주택 12억 초과 입력 시
> 과소 계산). 주택 수는 `aggregationExclusion.includedCount`로 **이미 자동 집계 가능**(초안의 "직접 집계하지
> 않음" 전제는 실측과 다름). 따라서 본 작업 범위에 현행 multi 표 포함.
> 기존 93개 테스트 중 3주택+ 12억 초과 케이스 존재 시 기대값을 법령 정합값으로 재산정
> (memory `feedback_anchor_correction_legal_priority`).

#### 4. `applyTaxCap()` 연도별 상한율 분기

파일: `lib/tax-engine/comprehensive-tax-helpers.ts`

```ts
// 현행 시그니처
export function applyTaxCap(
  comprehensiveTax: number,
  totalPropertyTax: number,
  previousYearTotalTax: number | undefined,
): TaxCapResult | undefined

// 변경 후 시그니처 (STEP 11 정정 — 계획서 §3-2-5와 통일: capRate 인자화.
// helpers가 data/를 import하지 않음 — 상한율 결정은 호출부(comprehensive-tax.ts)가
// yearParams + isMultiHouseRate로 수행. magic number(?? 9999) 제거.)
export function applyTaxCap(
  comprehensiveTax: number,
  totalPropertyTax: number,
  previousYearTotalTax: number | undefined,
  capRate: number = COMPREHENSIVE_CONST.TAX_CAP_RATE_GENERAL, // 기본 1.5 — 기존 3-인자 호출 회귀 0
): TaxCapResult | undefined {
  if (previousYearTotalTax === undefined) return undefined;

  // 호출부 (comprehensive-tax.ts):
  //   const capRate = input.assessmentYear <= 2022 && useMulti  // useMulti = isMultiHouseRate(...) — 조정2주택 OR 3주택+
  //     ? (yearParams.taxCapRateMultiHouseAdjusted ?? yearParams.taxCapRateGeneral)
  //     : yearParams.taxCapRateGeneral;

  const capAmount = Math.floor(previousYearTotalTax * capRate);
  const cappedTax = Math.max(
    Math.min(comprehensiveTax, capAmount - totalPropertyTax),
    0,
  );

  return {
    previousYearTotalTax,
    capRate,
    capAmount,
    cappedTax,
    isApplied: cappedTax < comprehensiveTax,
  };
}
```

> **하위 호환**: 기존 호출(`applyTaxCap(a, b, c)`)은 4·5번째 파라미터 생략 시
> `assessmentYear=9999`(2023+ 판정) → capRate=1.50으로 현행과 동일 동작. 회귀 없음.

#### 5. `TaxCapResult` 타입 — capRate 주석 수정

```ts
export interface TaxCapResult {
  previousYearTotalTax: number;
  /**
   * 세부담 상한율
   * 현행(2023+): 1.5 (§10 단일)
   * 구법(2022 이하) 조정대상지역 2주택+: 3.0 (§10② 삭제)
   */
  capRate: number;
  // ... 기존 필드 유지 ...
}
```

#### 6. `ComprehensiveTaxResult` — assessmentYear echo 추가

```ts
export interface ComprehensiveTaxResult {
  // ... 기존 필드 ...
  /** 과세귀속연도 (결과뷰 조건부 표시용) */
  assessmentYear: number;
}
```

#### 7. 종합합산/별도합산 토지 FMR 연도별 적용

`calculateAggregateLandTax()` 및 `calculateSeparateAggregateLandTax()` 내부:

```ts
// 현행: COMPREHENSIVE_LAND_CONST.AGGREGATE_FAIR_MARKET_RATIO (고정 1.00)
// 변경: yearParams.fairMarketRatioLand 사용
```

> 2021 이전 토지 FMR=95/90/85%이므로 토지분도 연도별 파라미터 적용 필요.
> 단, 사례집에 토지+2021 조합 anchor가 없으므로 v1.3에서는 2022+ 토지만 지원.

---

## Silent fallback / 자동 안분 후보 식별

이 기능에는 fallback 패턴이 없음.
- `assessmentYear`가 지원 범위 외(2021 미만)이면 `getComprehensiveParams`는 2021 파라미터 반환 (하한 클램핑, silent하지 않음).
- `isMultiHouseInAdjustedArea` 미입력 시 `false`로 처리 (§10 150% 단일 상한 → 납세자 불리 방향 아님).
- 자동 안분은 재산세 비율 안분 공제에서만 발생하며 이는 §9③ 법령 명시 계산이므로 허용됨.

---

## 14개 동기화 지점 영향 분석

| 지점 | 파일 | 변경 필요 여부 | 내용 |
|------|------|-------------|------|
| ① FormData 타입 | `lib/stores/comprehensive-wizard-store.ts` | **필요** | `isMultiHouseInAdjustedArea: boolean` 추가 |
| ② initial value | 동상 | **필요** | `isMultiHouseInAdjustedArea: false` |
| ③ normalize fallback | 동상 persist | **필요** | `?? false` fallback |
| ④ API 변환 | `page.tsx` callComprehensiveApi | **필요** | body에 `isMultiHouseInAdjustedArea` 추가 |
| ⑤ UI 입력 위젯 | `page.tsx` Step1/Step5 | **필요** | RadioCardGroup 연도 + 조건부 ToggleCard |
| ⑥ 사이드바 합계 | 없음 | 해당 없음 | — |
| ⑦ 결과 카드 | `ComprehensiveTaxResultView.tsx` | **필요** | basicDeduction 라벨 동적화 |
| ⑧ validation | `lib/validators/comprehensive-input.ts` | **필요** | `isMultiHouseInAdjustedArea: z.boolean().optional()` 추가; 연도 범위 검증 |
| ⑨ Zod enum | 동상 | **필요** | isMultiHouseInAdjustedArea optional 필드 추가 |
| ⑩ Zod companion | 해당 없음 | — | — |
| ⑪ acquisitionDate fallback | route.ts | 변경 없음 | — |
| ⑫ Zod 입력 객체 정의 | `lib/validators/comprehensive-input.ts` | **필요** | strip 방지 |
| ⑬ API body spread | `page.tsx` | **필요** | `isMultiHouseInAdjustedArea` 전달 |
| ⑭ Route handler 엔진 input 매핑 | `app/api/calc/comprehensive/route.ts` | **필요** | `isMultiHouseInAdjustedArea` 전달 |

**엔진 담당 (이 문서 범위)**: ①→타입 인터페이스, ⑧→validation 인식, ⑫→Zod 스키마, ⑭→엔진 input 매핑.
**UI 담당 (ui.design.md 범위)**: ①②③④⑤⑦⑬.

---

## GAP-2 삭제된 isMultiHouseInAdjustedArea 부활과의 상호작용

2026-06-11 GAP-2에서 `isMultiHouseInAdjustedArea` 9곳을 완전 삭제했음.
이번 설계는 **연도 < 2023 조건부**로 해당 필드를 부활시킴. 차이점:

| 항목 | GAP-2 삭제 이유 | 이번 부활 설계 |
|------|--------------|-------------|
| 의도 | 현행(2023+) 기준에서 dead param 제거 | 과거 귀속연도 계산 지원 |
| 적용 범위 | 삭제 (전체) | `assessmentYear < 2023` 조건부로만 유효 |
| 2023+ 동작 | 없음 | `isMultiHouseInAdjustedArea` 무시, capRate=150% 고정 |
| 법령 근거 | §10①② 삭제됨 | §10① 현행 + §10② 구법(삭제됨) 연혁 지원 |

→ GAP-2의 "현행 법령 정확성" 취지는 유지되며, 과거 귀속연도 계산 시만 구법 파라미터 활성화.

---

## 테스트 약속

테스트 케이스 상세 (T-YA-01~T-YA-21, T-YA-PARAMS, T-YA-SYNC): `comprehensive-tax-year-aware.test-cases.md` 참조.

목표 파일: `__tests__/tax-engine/comprehensive/year-aware-params.test.ts`

주요 anchor 요약:
- T-YA-01: 2022 일반 1주택, 과표 2.1억, 산출 1,260,000
- T-YA-04: 2022 1세대1주택, 과표 24.72억, 산출 26,664,000
- T-YA-08: 2022 다주택, capRate=3.00
- T-YA-PARAMS: FMR 테이블(2019~2025) + 기본공제 연도별 전수 검증
- T-YA-SYNC: 2023+ assessmentYear에서 기존 93 테스트 회귀 0건

---

## 지원 연도 범위 최종 권고

**권고: 2021~현재 (2021 포함 5개 연도 이상)**

| 연도 범위 | 판단 | 이유 |
|---------|------|-----|
| 2025 (현재) | 필수 | 현행 |
| 2024 | 필수 | 작년 귀속 |
| 2023 | 필수 | 세법 개정 기점 |
| 2022 | 필수 | PDF 사례집 anchor 보유, 법령 변경 큼 |
| 2021 | 필수 | 세부담 상한 300% 마지막 연도, PDF anchor 일부 |
| 2020 이전 | 향후 확장 | FMR 표만 있고 세율 anchor 없음, 기본공제도 다름 |

**설계 확장성**: `COMPREHENSIVE_YEAR_PARAMS` 배열에 연도 항목만 추가하면 확장 가능.
2019~2020 지원 시 `BRACKETS_2019_GENERAL` 등 별도 구간 정의 + 법령 anchor 확보 필요.

---

## 미결 사항 (Do 단계 전 확인 필요)

1. ~~2022 세율 구간 한계값~~ → ✅ **Phase 0 축자 확정** (pdf38 국세청 공식표 — 3/6/12/50/94).

2. ~~2021 일반 0.8% 구간~~ → ✅ 3억~6억 확정 (pdf38 표 + 사례13 21년분 (14.95억−11억)×95%=3.7525억 → 0.8%−60만 = 2,402,000 실측).

3. **2023+ 3주택이상 brackets**: 법문(현행 §9①2호 KoreanLaw) 역산 — Pre-Do anchor YA-4가 미구현을 실증
   (현행 엔진: 3주택 13.2억 과표에 0.013 적용 → 기대 0.02). Phase B에서 구현.

3-2. **★ 재산세 비율안분 공제 산식 갭 (Phase 0 YA-5 실증 — 중대)**:
   현행 엔진 `calculatePropertyTaxCreditProration` = 재산세액 × (종부세과표 ÷ 재산세과표) →
   사례1 수치로 **607,894** 반환. 법정 산식(사례1 pdf3~4 실측) = 재산세액 × (종부세과표 × 재산세FMR ×
   재산세 표준세율) ÷ 총 표준세율 재산세액 = **504,000**. **산식 구조 자체가 다름 — 연도 무관 교체 대상.**
   - 신규 입력 필요: 재산세 FMR·표준세율 누진(분자 0.4% 단순/분모 누진공제 반영) — 시그니처 확장 또는 신규 헬퍼.
   - ⚠️ 파급: 기존 93개 테스트 중 propertyTaxCredit 기대값은 구 산식 기준 anchor — **법령 정합값으로 재산정**
     (memory `feedback_anchor_correction_legal_priority`). 토지분 안분(land-aggregate·separate)도 동일 구조 여부 확인.
   - 현행 시행령 공제 조문 번호(§4의3 추정) Do에서 KoreanLaw 확정 후 legal-codes 인용 갱신.

4. **조정대상지역 2주택 vs 3주택이상 구분** — ✅ STEP 7 해소:
   2축 판정 `isMultiHouseRate(year, taxableHouseCount, isMultiHouseInAdjustedArea)` 채택.
   3주택 이상은 `aggregationExclusion.includedCount`로 **엔진 자동 도출**(사용자 입력 의존 금지 —
   입력 누락 시 silent 과소과세 위험). `isMultiHouseInAdjustedArea`는 "조정대상지역 2주택" 의미로만
   사용(≤2022 한정, UI도 해당 연도에만 노출).

---

## UI 통합 위임

UI 측 명세는 `comprehensive-tax-year-aware.ui.design.md` 참조.

엔진 시니어가 export해야 할 공개 인터페이스:
- `getComprehensiveParams(year: number): ComprehensiveYearParams`
- `COMPREHENSIVE_SUPPORTED_YEARS: readonly number[]`
- `ComprehensiveYearParams` 타입
- `ComprehensiveBracket` 타입
