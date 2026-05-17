# 주식 양도소득세 대주주 임계 echo — 엔진 설계 v2

> Plan 문서: [`docs/00-pm/stock-transfer-applied-threshold-sync.plan.md`](../../00-pm/stock-transfer-applied-threshold-sync.plan.md) v3
> UI 측 명세: `stock-transfer-applied-threshold.ui.design.md` v2
> 작성: 2026-05-17 (v2 정정)
> v1 → v2 변경: §11 정정 이력 참조

## Context

`stock-classification.ts` `judgeIsMajorShareholder` 가 시기별·시장별 §157④ 임계를 정확히 산출하지만, `StockTransferResult` 타입과 엔진 결과 조립부에서 누락되어 UI에 도달하지 못함. 동시에 `MajorShareholderBlock.tsx` 가 로컬 함수로 임계를 재계산하면서 **코스닥·코넥스 동일 2% 매핑** 등 엔진 진실과 불일치 발생 → 코넥스 3% 비대주주 사용자가 UI에서 "대주주 해당" 오표시.

본 PR은 상장 3시장(kospi/kosdaq/konex) 한정으로 echo 라인을 연결. 비상장·기타자산 통합은 F-5 후속 PR.

---

## ★ 케이스 인벤토리

| # | 시나리오 | 필수 입력 (anchor용) | 법령 근거 | anchor 출처 | 테스트 파일 | 상태 |
|---|---|---|---|---|---|---|
| AT-1 | 코스피 2024.1.1.~ 대주주 (지분율 1.5%·시총 30억) | marketType="kospi" / priorYearEndDate=2024-12-31 / selfShareRatio=0.015 / selfMarketCap=3,000,000,000 / isMajorShareholder=true (자동 판정 정합) / isKOTCTrading=false | 시행령 §157④ 1호 가목 | 시행령 본문 | `applied-threshold.test.ts` | ☐ TODO |
| AT-2 | 코스닥 K-OTC 장외 **대주주** (지분율 2.5%·시총 60억) | marketType="kosdaq" / priorYearEndDate=2024-12-31 / selfShareRatio=0.025 / selfMarketCap=6,000,000,000 / **`isKOTCTrading=true`** / isMajorShareholder=true | §94①3 가목 단서 + 시행령 §157④ 1호 나목 | 시행령 본문 | `applied-threshold.test.ts` | ☐ TODO |
| AT-3 | **코넥스 비대주주 (지분율 3%·시총 30억)** — UI 버그 차단 핵심 | marketType="konex" / priorYearEndDate=2024-12-31 / selfShareRatio=0.03 / selfMarketCap=3,000,000,000 / **`isKOTCTrading=false`** / isMajorShareholder=false | 시행령 §157④ 1호 다목 | UI 회귀 발견 (2026-05-17) | `applied-threshold.test.ts` | ☐ TODO |
| AT-4 | 코스피 2019-12-31 byCap 대주주 (시총 15억) | marketType="kospi" / priorYearEndDate=2019-12-31 / selfShareRatio=0 / selfMarketCap=1,500,000,000 / isMajorShareholder=true | 시행령 §157④ 2018.4.1. 개정 부칙 | 시행령 부칙 | `applied-threshold.test.ts` | ☐ TODO |
| AT-5 | 코스닥 2013-09-01 byRatio 대주주 (지분율 2.5%) | marketType="kosdaq" / priorYearEndDate=2013-09-01 / selfShareRatio=0.025 / selfMarketCap=0 / isMajorShareholder=true | 시행령 §157④ 2013.8.29. 개정 부칙 | 시행령 부칙 | `applied-threshold.test.ts` | ☐ TODO |
| AT-6 | 정상 경로 echo — 코스피 2024 byCap 대주주 | marketType="kospi" / priorYearEndDate=2024-12-31 / selfShareRatio=0 / selfMarketCap=6,000,000,000 / isMajorShareholder=true | 시행령 §157④ | propagation 검증 | `applied-threshold.test.ts` | ☐ TODO |
| AT-7 | exempt 경로 echo — 코스닥 비대주주 **장내** | marketType="kosdaq" / priorYearEndDate=2024-12-31 / selfShareRatio=0 / selfMarketCap=0 / **`isKOTCTrading=false`** / isMajorShareholder=false | §94①3 가목 단서 | propagation 검증 | `applied-threshold.test.ts` | ☐ TODO |
| AT-8 | 비상장 — 본 PR 범위 외 | marketType="unlisted" / priorYearEndDate=2024-12-31 / isMajorShareholder=true | 본 PR §2 | 가드 검증 (F-5 갱신 예정) | `applied-threshold.test.ts` | ☐ TODO |
| AT-9 | 기타자산 — §94①4 별도 트랙 | marketType="other_asset" / isQualifyingBlockShareholder=true | §94①4 | 가드 검증 | `applied-threshold.test.ts` | ☐ TODO |
| AT-10 | 코스피 1998-12-31 fallback | marketType="kospi" / priorYearEndDate=1998-12-31 / selfShareRatio=0.06 | 시행령 §157④ 1999.1.1. 개정 이전 | `from: 1900-01-01` 행 매칭 | `applied-threshold.test.ts` | ☐ TODO |
| AT-11 | 코넥스 2013-06-30 fallback (시장 개설 직전) | marketType="konex" / priorYearEndDate=2013-06-30 / selfShareRatio=0.05 | 시행령 §157④ 2013.7.1. 개설 | `sorted.length-1` 가드 매칭 | `applied-threshold.test.ts` | ☐ TODO |

11행 ≥ 1 — Do 단계 진입 조건 충족.

---

## 법령 근거

```
소득세법 §94①3 가목 본문: 주권상장법인 주식 → 대주주 양도분만 과세
소득세법 §94①3 가목 단서: 비대주주 장내 양도분 → 비과세
소득세법 §94①3 나목: 주권비상장법인 주식 → 전체 과세
소득세법 §94①4: 기타자산(과점주주·부동산과다보유법인) — 별도 트랙

시행령 §157④ 1호 가목 (2024.1.1.~): 코스피 — 지분율 1% OR 시총 50억
시행령 §157④ 1호 나목 (2024.1.1.~): 코스닥 — 지분율 2% OR 시총 50억
시행령 §157④ 1호 다목 (2024.1.1.~): 코넥스 — 지분율 4% OR 시총 50억
시행령 §157④ 본문: 최대주주그룹은 본인+특수관계인 합산 임계
```

`lib/tax-engine/legal-codes/` 의 stock-transfer 상수 사용 (기존 키 활용, 신규 추가는 본 PR 범위 외).

---

## 엔진 input 타입

**변경 없음**. `StockTransferInput.marketType` / `priorYearEndDate` / `selfShareRatio` / `selfMarketCap` / `combinedShareRatio` / `combinedMarketCap` / `isLargestShareholderGroup` / `isMajorShareholder` / `isKOTCTrading` 기존 필드 그대로 사용.

> **폼 토글 `isMajorShareholder` 거동**: 본 PR은 거동 변경 없음. 사용자가 `MajorShareholderBlock` 의 자동 판정 미리보기를 보고 폼 토글을 직접 조작하는 패턴 유지. 엔진은 `input.isMajorShareholder` 를 그대로 사용. 자동 판정과 폼 토글 불일치 시 폼 토글 우선(현재 동작). F-5에서 자동 산출 vs 사용자 override UX 재정의 예정.

---

## 엔진 result 타입

**파일**: `lib/tax-engine/stock-transfer/types/stock-transfer.types.ts`

```ts
// StockTransferResult 인터페이스에 추가
/**
 * §157④ 대주주 판정에 적용된 임계 echo
 * - 상장 3시장(kospi/kosdaq/konex)만 echo
 * - 비상장(unlisted)·기타자산(other_asset)은 undefined (F-5 후속 PR에서 확장)
 */
appliedThreshold?: {
  shareRatio: number;       // 0.01 = 1%
  marketCap: number;        // 원 단위 (예: 5_000_000_000 = 50억)
  marketType: "kospi" | "kosdaq" | "konex";
  priorYearEndDate: string; // ISO yyyy-mm-dd
  fromDate: string;         // 해당 임계 적용 시작일 ISO (시기 라벨용)
};
```

신규 result 필드는 모두 string·number 원시 타입. Date 객체 미사용 → `lib/api/date-coerce.ts` 적용 불필요.

---

## 계산 알고리즘 (단계별)

### Step 1. 엔진 진입 시 — 변경 없음
`classifyStockTransfer(input)` 가 `judgeIsMajorShareholder()` 호출하여 `appliedThreshold: { shareRatio, marketCap }` 산출. (기존 동작 그대로)

### Step 2. 결과 조립부 — propagation 추가
`stock-transfer-tax.ts:328~374` 정상 경로 + `:385~409` exempt 경로 양쪽에서:
```ts
appliedThreshold: buildAppliedThreshold(input, classification),
```

### Step 3. `buildAppliedThreshold` 헬퍼 — `stock-transfer-helpers.ts`
```ts
export function buildAppliedThreshold(
  input: StockTransferInput,
  classification: ReturnType<typeof classifyStockTransfer>,
): StockTransferResult["appliedThreshold"] {
  // 비상장·기타자산은 본 PR 범위 외
  if (input.marketType === "unlisted" || input.marketType === "other_asset") {
    return undefined;
  }
  const t = classification.appliedThreshold;
  if (!t) return undefined;
  return {
    shareRatio: t.shareRatio,
    marketCap: t.marketCap,
    marketType: input.marketType,
    priorYearEndDate: input.priorYearEndDate.toISOString().slice(0, 10),
    fromDate: resolveThresholdFromDate(input.marketType, input.priorYearEndDate),
  };
}
```

### Step 4. `resolveThresholdFromDate` — `stock-rate-tables.ts` export
```ts
export function resolveThresholdFromDate(
  marketType: "kospi" | "kosdaq" | "konex",
  priorYearEndDate: Date,
): string {
  const table =
    marketType === "kospi" ? KOSPI_MAJOR_THRESHOLDS :
    marketType === "kosdaq" ? KOSDAQ_MAJOR_THRESHOLDS :
    KONEX_MAJOR_THRESHOLDS;
  const sorted = [...table].sort((a, b) => b.from.getTime() - a.from.getTime());
  const match = sorted.find((t) => priorYearEndDate >= t.from) ?? sorted[sorted.length - 1];
  return match.from.toISOString().slice(0, 10);
}
```

**Fallback 보장 메커니즘**:
- 코스피·코스닥 매트릭스는 `from: 1900-01-01` 행 존재 → 모든 입력 일자에 대해 `sorted.find()` 성공
- 코넥스 매트릭스는 `from: 2013-07-01`(시장 개설일)이 최오래된 행 → 그 이전 입력 시 `sorted.find()` 실패하나 `?? sorted[sorted.length - 1]` 가드로 `2013-07-01` 항목 강제 매칭
- 두 메커니즘 모두 undefined 반환 불가 보장

---

## 거동 변경 영향 평가

| 영역 | 변경 전 | 변경 후 | 회귀 위험 |
|---|---|---|---|
| `judgeIsMajorShareholder` 산출 로직 | 기존 그대로 | 변경 없음 | 0 |
| `classifyStockTransfer` 반환값 | 기존 그대로 | 변경 없음 | 0 |
| `StockTransferResult` 형상 | `appliedThreshold` 없음 | optional 필드 추가 | 0 (optional) |
| 정상 경로 결과 | `appliedThreshold` 미포함 | echo 포함 | 0 (소비자가 사용 안 하면 무영향) |
| exempt 경로 결과 | `appliedThreshold` 미포함 | echo 포함 | 0 |
| 비상장 입력 결과 | 변경 없음 | `appliedThreshold===undefined` | 0 |
| 기타자산 입력 결과 | 변경 없음 | `appliedThreshold===undefined` | 0 |
| 폼 토글 `isMajorShareholder` 처리 | 패스스루 | 변경 없음 (F-5 이관) | 0 |
| API Route handler | 변경 없음 | result spread만 (자동) | 0 |
| Zod 입력 스키마 | 변경 없음 | 변경 없음 | 0 |

→ 엔진 거동 변경 0. 결과 type에 optional 추가만.

---

## Silent fallback / 자동 안분 후보 식별

- `appliedThreshold` 가 undefined 일 때 UI는 카드 미렌더. 임의 기본값 자동 채움 **금지**.
- `input.priorYearEndDate` 미입력은 Zod에서 차단 (기존 동작). 엔진에서 자동 채움 없음.
- `resolveThresholdFromDate`는 §3.2 fallback 메커니즘으로 undefined 절대 불가.

`feedback_no_silent_apportion_fallback` 정책 위반 없음.

---

## 테스트 약속

### 파일 위치
`__tests__/tax-engine/stock-transfer/applied-threshold.test.ts` (신규)

### Pre-Do anchor (디자인 환류용)
1. **AT-3** — 코넥스 3%·30억 (`isKOTCTrading=false`) → `result.taxCategory === "listed_non_major_in_market"` / `result.isExempt === true` / `result.appliedThreshold.shareRatio === 0.04`
2. **AT-7** — 코스닥 비대주주 장내 (`isKOTCTrading=false`) → `result.isExempt === true` / `result.appliedThreshold` 노출 확인

이 2건을 먼저 작성·실행 → FAIL 메시지 확보 → 디자인 의도와 일치 확인 → 나머지 anchor 작성.
(`feedback_pre_anchor_verification` 정책)

### Anchor 검증 매트릭스

| ID | toBe 검증 |
|---|---|
| AT-1 | `taxCategory === "listed_major"` / `isExempt === false` / `appliedThreshold.shareRatio === 0.01` / `appliedThreshold.marketCap === 5_000_000_000` / `appliedThreshold.marketType === "kospi"` / `appliedThreshold.fromDate === "2024-01-01"` / `appliedThreshold.priorYearEndDate === "2024-12-31"` |
| AT-2 | `taxCategory === "listed_major"` (대주주이면 K-OTC 무관) / `isExempt === false` / `appliedThreshold.shareRatio === 0.02` / `appliedThreshold.marketCap === 5_000_000_000` |
| AT-3 | `taxCategory === "listed_non_major_in_market"` / **`isExempt === true`** / `appliedThreshold.shareRatio === 0.04` / `appliedThreshold.marketCap === 5_000_000_000` / `appliedThreshold.marketType === "konex"` |
| AT-4 | `taxCategory === "listed_major"` / `appliedThreshold.marketCap === 1_500_000_000` / `appliedThreshold.fromDate === "2018-04-01"` |
| AT-5 | `appliedThreshold.fromDate === "2013-08-29"` / `appliedThreshold.shareRatio === 0.02` |
| AT-6 | `isExempt === false` / `appliedThreshold.marketType === "kospi"` / `appliedThreshold.fromDate === "2024-01-01"` / `appliedThreshold.priorYearEndDate === "2024-12-31"` |
| AT-7 | `taxCategory === "listed_non_major_in_market"` / `isExempt === true` / `appliedThreshold.marketType === "kosdaq"` / `appliedThreshold.shareRatio === 0.02` / `appliedThreshold.fromDate === "2024-01-01"` |
| AT-8 | `appliedThreshold === undefined` (비상장 — F-5에서 갱신 예정) |
| AT-9 | `appliedThreshold === undefined` (기타자산) |
| AT-10 | `appliedThreshold.fromDate === "1900-01-01"` / `appliedThreshold.shareRatio === 0.05` |
| AT-11 | `appliedThreshold.fromDate === "2013-07-01"` / `appliedThreshold.shareRatio === 0.04` (sorted.length-1 가드) |

PDF 예시값 anchor 아님 — 시행령 본문·부칙 직접 인용.

### 회귀 보호
- 기존 `__tests__/tax-engine/stock-transfer/` 디렉토리 모든 anchor 회귀 0 (`appliedThreshold` 미사용 → 자동 통과)
- `npx vitest run __tests__/tax-engine/stock-transfer/` 전체 통과

---

## 미결 항목

- **D-1**: 비상장 임계 이력 KoreanLaw MCP 검증 → **F-5 이관**, 본 PR 처리 안 함
- **D-2**: `legal-codes` §157④ 1호 가/나/다목 라벨 상수 추가 → **본 PR 범위 외, F-5에서 처리** (본 PR 결과 카드는 "§157④" 통합 라벨만 사용)

---

## 후속 PR 분리 명세

### F-5: 비상장 자동 판정 통합
- `UNLISTED_MAJOR_THRESHOLDS` 매트릭스 신설 (D-1 검증 후)
- `judgeIsMajorShareholder` unlisted 분기 축소 (input.isMajorShareholder 패스스루 → 자동 산출)
- 폼 토글 `isMajorShareholder` 의미 재정의 (자동 산출 vs 사용자 override UX 합의)
- AT-12 (unlisted 비대주주 경계) + AT-13 (거동 변경 회귀) anchor 추가
- 비상장 UI 임계 카드 복원
- 결과 type `marketType` enum에 `unlisted` 추가
- `legal-codes` §157④ 1호 가/나/다목 라벨 상수 추가(D-2)

### F-4: historical timeline 시각화
- 시기별 임계 변화 그래프 또는 표
- 현재 적용 시점 highlight
- UI 안내 카드 삭제분 복원

---

## UI 통합 위임

- UI 측 명세: `stock-transfer-applied-threshold.ui.design.md` v2
- 14지점 동기화 책임:
  - 본 PR 영향 지점: **⑤** (입력 위젯) + **⑦** (결과 카드)
  - 영향 없음: ①②③④⑥⑧⑨⑩⑪⑫⑬⑭
- 결과 type 변경(`appliedThreshold?` optional 추가)이 엔진 시니어 책임 종료점. UI 시니어는 이 type을 consume하는 카드를 구현.

---

## Definition of Done — 엔진 시니어 책임

- [ ] `StockTransferResult.appliedThreshold?` 타입 추가
- [ ] `buildAppliedThreshold` → `stock-transfer-helpers.ts`
- [ ] `resolveThresholdFromDate` → `stock-rate-tables.ts` export
- [ ] 정상·exempt 경로 propagation 2곳
- [ ] Pre-Do anchor (AT-3, AT-7) 우선 작성·실패 메시지 확보 — `isKOTCTrading` 명시
- [ ] anchor 11건 작성·통과 (모든 행에 필수 입력 명시)
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/stock-transfer/` 회귀 0
- [ ] UI 시니어에게 type diff 전달 (`appliedThreshold?` optional 추가, marketType은 3종 한정)

---

## v1 → v2 정정 이력

| ID | v1 오류 | v2 정정 |
|---|---|---|
| E-1 | AT-2 `isKOTCTrading=true` 명시 누락 | 필수 입력 셀에 명시 |
| E-2 | AT-7 `isKOTCTrading=false` 명시 누락 | 필수 입력 셀에 명시 |
| E-3 | AT-3 `isExempt=true` 검증 누락 | toBe 매트릭스에 추가 |
| E-4 | AT-6 fromDate·priorYearEndDate 검증 누락 | toBe 매트릭스에 추가 |
| E-5 | "모든 매트릭스에 1900-01-01 행 존재" 부정확 — 코넥스 예외 | Fallback 보장 메커니즘 별도 §에 코스피·코스닥(1900-01-01 행) vs 코넥스(sorted.length-1 가드) 분리 설명 |
| E-6 | D-2 표기 모호 | "본 PR 범위 외, F-5에서 처리" 명시 |
| (추가) | 폼 토글 vs 자동 판정 관계 불명확 | 엔진 input 타입 § 에 거동 명시 (폼 토글 우선, F-5 재정의) |
