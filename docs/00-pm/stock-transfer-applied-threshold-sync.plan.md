# 주식 양도소득세 — 대주주 임계(`appliedThreshold`) UI 동기화 계획서 v3

> 작성일: 2026-05-17 (v3 정정)
> 작성자: Claude (Opus 4.7)
> 영향 도메인: `lib/tax-engine/stock-transfer/` + `components/calc/stock-transfer/` + `components/calc/results/`
> 우선순위: **P0 (회귀)** — UI 자체 계산 함수가 엔진 이력 테이블과 어긋나 코스닥·코넥스 임계 판정 불일치 + 결과 카드 substring 매칭 버그
> v1 → v2 → v3 변경: §10 정정 이력 참조

## 1. 배경 및 버그 정의

### 1.1 현재 상태

`stock-classification.ts:285`에서 `judgeIsMajorShareholder()` 가 시기별·시장별 정확한 임계(`appliedThreshold: { shareRatio, marketCap }`)를 산출하지만, 다음 3가지 경로에서 끊김:

| # | 경로 | 위치 | 결과 |
|---|---|---|---|
| A | 엔진 결과 type 누락 | `types/stock-transfer.types.ts` `StockTransferResult` | 결과 화면 영구 미표시 |
| B | 엔진 → 결과 객체 propagation | `stock-transfer-tax.ts` L328~374(정상) + L385~409(exempt) | 사용자 검증 불가 |
| C | UI 입력 화면 자체 계산 — 엔진 진실과 불일치 | `MajorShareholderBlock.tsx` L44~63 로컬 함수 | 회귀 케이스(§1.2) |

### 1.2 회귀 케이스 — 코넥스 3% 사용자

- 엔진(정상): byRatio = 3% < 4% / byCap = 30억 < 50억 → **비대주주**
- UI 미리보기(**버그**): `getShareRatioThreshold` (L59~63)가 코스닥·코넥스 동일 0.02 매핑 → byRatio = 3% ≥ 2% → **"대주주 자동 판정: ✓ 대주주 해당" 오표시**

→ UI 라벨이 비과세 가능 케이스를 "대주주 해당"으로 오인 유도. 입력 단계 의사결정 왜곡.

### 1.3 결과 카드 substring 매칭 버그

`taxCategory` enum 9종 중 5종이 "major" 문자열 포함:
```
listed_major / unlisted_major (대주주)
listed_non_major_in_market / listed_otc_non_major / unlisted_non_major (비대주주)
```
→ `taxCategory.includes("major")` 패턴 사용 시 비대주주를 대주주로 라벨링. exact 비교 필수.

## 2. 본 PR 범위 — 상장 3시장 한정 (비상장 별도 PR 분리)

v3 핵심 결정: **비상장 자동 판정 통합은 후속 PR로 분리**(F-5). 본 PR은 거동 변경 위험을 최소화:

- 본 PR 대상: **kospi · kosdaq · konex** 임계 echo + UI 자체계산 제거
- 비상장(`unlisted`)·기타자산(`other_asset`): **UI 임계 카드·결과 카드 미표시** (`other_asset`과 동일 가드). 기존 `judgeIsMajorShareholder`의 unlisted 패스스루 로직 무변경.
- 비상장 임계 매트릭스(`UNLISTED_MAJOR_THRESHOLDS`) 신설 + `judgeIsMajorShareholder` 분기 축소는 **F-5 후속 PR**에서 처리. 동시에 폼 토글 `isMajorShareholder` 의미 재정의 합의.

→ 본 PR은 결과 type echo + UI 단일진실 + 결과 카드의 3개 동기화에만 집중.

## 3. 결과 타입 설계

### 3.1 명명 — `appliedThreshold` 통일

v2와 동일. ClassificationResult.`appliedThreshold` ↔ StockTransferResult.`appliedThreshold` 동일 이름 (scope 분리되어 충돌 없음).

### 3.2 신규 필드

**파일**: `lib/tax-engine/stock-transfer/types/stock-transfer.types.ts`

```ts
/** §157④ 대주주 판정에 적용된 임계 (상장 3시장만 echo, 비상장·기타자산 시 undefined) */
appliedThreshold?: {
  shareRatio: number;       // 0.01 = 1%
  marketCap: number;        // 원 단위 (예: 5_000_000_000)
  marketType: "kospi" | "kosdaq" | "konex";
  priorYearEndDate: string; // ISO yyyy-mm-dd
  fromDate: string;         // 해당 임계 적용 시작일 ISO (시기 라벨용)
};
```

`marketType` 에 `unlisted`·`other_asset` 미포함 (§2 범위 한정).

## 4. 엔진 수정

### 4.1 결과 조립부 propagation (2곳)

**파일**: `lib/tax-engine/stock-transfer/stock-transfer-tax.ts`

#### 4.1.1 정상 경로 (L328~374 `return` 객체)
L373 `appliedRules` 다음 라인에 추가:
```ts
appliedThreshold: buildAppliedThreshold(input, classification),
```

#### 4.1.2 exempt 경로 (L385~409 `buildExemptResult`)
L408 `basicDeductionGroup` 직후에 동일 추가.

### 4.2 헬퍼 함수 — `buildAppliedThreshold`

**위치**: `lib/tax-engine/stock-transfer/stock-transfer-helpers.ts` (orchestrator 800줄 정책 + 헬퍼 일관성)

```ts
export function buildAppliedThreshold(
  input: StockTransferInput,
  classification: ReturnType<typeof classifyStockTransfer>,
): StockTransferResult["appliedThreshold"] {
  // 비상장·기타자산은 본 PR 범위 외 — undefined echo (F-5에서 확장)
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

`input.priorYearEndDate`는 `Date` required — optional chain 불필요.

### 4.3 `resolveThresholdFromDate` 헬퍼 export

**파일**: `lib/tax-engine/stock-transfer/stock-rate-tables.ts`

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

## 5. UI 수정

### 5.1 이중 진실 제거 — 자체 계산 함수 폐기

**파일**: `components/calc/stock-transfer/MajorShareholderBlock.tsx`

**삭제**(L43~63):
- `getMarketCapThreshold()` — 시기 구간 단순화, 코스피·코스닥 historical 차이 무시
- `getShareRatioThreshold()` — 코스닥·코넥스 동일 2% 매핑(엔진은 코스닥 2% / 코넥스 4%)

**대체**:
```ts
import {
  getMajorShareholderThreshold,
  resolveThresholdFromDate,
} from "@/lib/tax-engine/stock-transfer/stock-rate-tables";

const threshold = useMemo(() => {
  if (!form.priorYearEndDate) return null;
  if (form.marketType !== "kospi" && form.marketType !== "kosdaq" && form.marketType !== "konex") {
    return null;
  }
  return getMajorShareholderThreshold(
    form.marketType,
    new Date(form.priorYearEndDate),
  );
}, [form.marketType, form.priorYearEndDate]);

const shareRatioThreshold = threshold?.shareRatioThreshold ?? 0;
const marketCapThreshold = threshold?.marketCapThreshold ?? Infinity;
```

비상장·기타자산은 임계 위젯 미표시. **F-5 후속 PR에서 복원** (인라인 주석으로 명시).

### 5.2 시기 안내 카드 — 동적 박스 일원화 (옵션 A)

기존 historical 4구간 정적 안내 카드(L127~138) **삭제**. 동적 박스로 일원화:

```tsx
{threshold && form.priorYearEndDate && (
  <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-3 text-sm">
    <p className="font-semibold text-violet-900 mb-1">현재 적용 임계 (§157④)</p>
    <p className="text-violet-800">
      지분율 {(threshold.shareRatioThreshold * 100).toFixed(1)}% /
      시총 {(threshold.marketCapThreshold / 100_000_000).toFixed(0)}억
    </p>
    <p className="text-xs text-violet-600 mt-1">
      {MARKET_LABEL[form.marketType]} · {resolveThresholdFromDate(
        form.marketType as "kospi" | "kosdaq" | "konex",
        new Date(form.priorYearEndDate),
      )}~ 적용
    </p>
  </div>
)}
```

historical timeline은 **F-4 후속 PR**(시각화)에서 별도 처리.

### 5.3 결과 화면 카드

**파일**: `components/calc/results/StockTransferTaxResultView.tsx`

기존 결과 카드 violet tone div 패턴 참고 차용 (추상화 통합 의도 없음):

```tsx
const MARKET_LABEL = {
  kospi: "코스피", kosdaq: "코스닥", konex: "코넥스",
} as const;

function isMajorTaxCategory(c: StockTransferResult["taxCategory"]): boolean {
  return c === "listed_major" || c === "unlisted_major";
}

{result.appliedThreshold && (
  <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-4 space-y-2">
    <h4 className="text-sm font-semibold text-violet-900">대주주 판정 (§157④)</h4>
    <dl className="text-sm text-violet-800 space-y-1">
      <div>· 시장: {MARKET_LABEL[result.appliedThreshold.marketType]}</div>
      <div>· 판정 기준일: {result.appliedThreshold.priorYearEndDate}</div>
      <div>· 임계 적용 시작: {result.appliedThreshold.fromDate}</div>
      <div>· 지분율 임계: {(result.appliedThreshold.shareRatio * 100).toFixed(1)}%</div>
      <div>· 시총 임계: {formatKRW(result.appliedThreshold.marketCap)}원</div>
      <div className="pt-1 font-medium">
        판정: {isMajorTaxCategory(result.taxCategory) ? "대주주 해당" : "비대주주"}
      </div>
    </dl>
  </div>
)}
```

**판정 라벨 헬퍼** (substring 매칭 금지 — v1 E-1 정정):
- `taxCategory === "listed_major" || === "unlisted_major"` exact 비교
- `other_asset_block_shareholder`·`other_asset_heavy_re`는 §94①4 별도 트랙으로 본 카드 미표시(`appliedThreshold === undefined`)
- 비상장(listed/unlisted_non_major 등) → 카드 표시되나 라벨 "비대주주"

## 6. anchor 테스트 (회귀 차단)

**신규 파일**: `__tests__/tax-engine/stock-transfer/applied-threshold.test.ts`

기존 `__tests__/tax-engine/stock-transfer/` 디렉토리 하위에 배치.

| ID | marketType | priorYearEnd | self.ratio | self.cap | 검증 |
|---|---|---|---|---|---|
| AT-1 | kospi | 2024-12-31 | 0.015 | 3,000,000,000 | isMajor=true(byRatio) / threshold.shareRatio=0.01 / threshold.marketCap=5_000_000_000 / 정상 경로 |
| AT-2 | kosdaq + K-OTC | 2024-12-31 | 0.025 | 6,000,000,000 | 대주주 + K-OTC 장외 → 정상 경로 / threshold.shareRatio=0.02 / threshold.marketCap=5_000_000_000 (AT-7과 경로 분리) |
| AT-3 | **konex** | 2024-12-31 | 0.03 | 3,000,000,000 | **isMajor=false / threshold.shareRatio=0.04** (UI 버그 차단 핵심) |
| AT-4 | kospi | 2019-12-31 | 0 | 1,500,000,000 | isMajor=true(byCap) / threshold.marketCap=1_500_000_000 (2018.4.1.~) / fromDate="2018-04-01" |
| AT-5 | kosdaq | 2013-09-01 | 0.025 | 0 | isMajor=true(byRatio) / fromDate="2013-08-29" |
| AT-6 | kospi | 2024-12-31 | 0 | 6_000_000_000 | result.appliedThreshold.marketType="kospi" / fromDate="2024-01-01" / result.isExempt=false (정상 경로 echo) |
| AT-7 | kosdaq | 2024-12-31 | 0 | 0 | exempt(상장 비대주주 장내 §94①3 가목 단서) / result.isExempt=true / result.appliedThreshold.marketType="kosdaq" / shareRatio=0.02 / fromDate="2024-01-01" (exempt 경로 echo) |
| AT-8 | **unlisted** | 2024-12-31 | 0.05 | 0 | result.appliedThreshold===undefined (본 PR 범위 외 — F-5 적용 후 회귀 anchor 갱신 예정) |
| AT-9 | **other_asset** | 2024-12-31 | 0 | 0 | result.appliedThreshold===undefined (§94①4 별도 트랙) |
| AT-10 | kospi | 1998-12-31 | 0.06 | 0 | isMajor=true / threshold.shareRatio=0.05 / fromDate="1900-01-01" (1999 이전 fallback) |
| AT-11 | konex | 2013-06-30 | 0.05 | 0 | isMajor=true / threshold.shareRatio=0.04 / fromDate="2013-07-01" (시장 개설 직전 fallback) |

총 11건. v2의 AT-12(비상장 비대주주 경계)·AT-13(거동 변경 회귀)는 F-5 후속 PR로 이관.

## 7. PDCA 단계

### Plan ✅ (본 문서 v3)

### Design
**파일**: `docs/02-design/features/stock-transfer-applied-threshold.engine.design.md`
- 케이스 인벤토리 AT-1~11 표 (행 11 ≥ 1 만족)
- 결과 타입 diff
- UI 변경 diff (삭제 vs 추가) — historical 안내 카드 제거 명시
- F-5/F-4 후속 PR 분리 사유 기록

### Do (시퀀셜)
1. **엔진 시니어** (`stock-transfer-tax-senior`)
   - 타입 확장 (§3.2)
   - `resolveThresholdFromDate` export (§4.3)
   - `buildAppliedThreshold` 헬퍼 → `stock-transfer-helpers.ts` (§4.2)
   - propagation 2곳 (§4.1)
   - **Pre-Do anchor**: AT-3 + AT-7 우선 실행 → 실패 메시지 확보 → 디자인 환류 (`feedback_pre_anchor_verification`)
   - anchor 11건 (§6) 작성
   - `npx vitest run __tests__/tax-engine/stock-transfer/` 통과 (회귀 0)
2. **UI 시니어** (`stock-transfer-tax-ui-senior`)
   - 이중 진실 제거 (§5.1) — 자체 함수 2개 삭제, 엔진 함수 import
   - 시기 안내 카드 동적 박스 일원화 (§5.2) — historical 텍스트 삭제
   - 결과 카드 추가 (§5.3) — `MARKET_LABEL` 인라인 + `isMajorTaxCategory` 헬퍼
   - F-5 복원 예정 인라인 주석 명시
3. **타입 체크 게이트**
   - `npx tsc --noEmit` 0건

### Check
- [ ] `ui-engine-sync-checker` 호출 → 14지점 누락 0
- [ ] `bkit:gap-detector` matchRate ≥ 90
- [ ] 브라우저 수동 확인 4종:
  - 코넥스 + 3%·30억 → 미리보기 "비대주주" (현 UI 버그 차단)
  - 코스피 + 1% → 미리보기 "현재 적용 임계 1% / 50억"
  - 결과 화면 "대주주 판정 (§157④)" 카드 노출 (정상 + exempt 양쪽)
  - `taxCategory === "listed_non_major_in_market"` 케이스 카드 라벨이 **"비대주주"** 표시 (substring 매칭 미발생)
  - Network 탭 — request body 무변경

### Act
- [ ] `MEMORY.md` 신규 정책 후보:
  - `feedback_ui_engine_dual_truth_avoidance.md` — UI 자체 계산이 엔진 이력 테이블과 겹칠 경우 엔진 함수 import 강제
  - `feedback_enum_substring_match_forbidden.md` — `includes("major")` substring 매칭 금지, exact 비교 강제
- [ ] `docs/00-pm/recent-completions.md` 항목 추가
- [ ] F-5 후속 PR 트래커 등록

## 8. 14지점 매핑

| # | 지점 | 변경 |
|---|---|---|
| ① | 폼 상태 | 없음 |
| ② | initial | 없음 |
| ③ | normalize | 없음 |
| ④ | API 변환 | 없음 |
| ⑤ | **UI 위젯** | `MajorShareholderBlock.tsx` 자체 계산 함수 2개 삭제 + 엔진 함수 import + historical 안내 카드 삭제 + 동적 박스 추가 |
| ⑥ | 사이드바 | 없음 |
| ⑦ | **결과 카드** | `StockTransferTaxResultView.tsx` 대주주 판정 카드 신규 + `MARKET_LABEL` + `isMajorTaxCategory` 헬퍼 |
| ⑧ | validation | 없음 |
| ⑨~⑭ | Zod·API·Route | 없음 (입력 스키마 무변경) |

**+ 신규 동기화** (14지점 외):
- 결과 타입 `StockTransferResult.appliedThreshold?` 추가
- 엔진 결과 조립부 2곳 (정상 + exempt) propagation
- `stock-transfer-helpers.ts` `buildAppliedThreshold` 헬퍼 export
- `stock-rate-tables.ts` `resolveThresholdFromDate` export

## 9. 위험·트레이드오프

| 위험 | 완화책 |
|---|---|
| `MajorShareholderBlock`에서 엔진 함수 import → 클라이언트 번들 증가 | `stock-rate-tables.ts`는 순수 상수 + 함수, tree-shaking 안전. 측정 후 영향 미미 예상 |
| historical 안내 카드 삭제 → 사용자 학습 기능 일시 손실 | F-4 후속 PR(historical timeline 시각화)에서 복원 |
| 비상장 사용자 UI 임계 표시 사라짐 | F-5 후속 PR(비상장 자동 판정 통합 + 폼 토글 의미 재정의)에서 복원 |
| 결과 카드 추가로 결과 화면 길이 증가 | `other_asset`·비상장 입력 시 미렌더 가드 |
| 결과 카드 violet tone div 패턴은 `StockTransferTaxResultView` 도메인 한정 사용 | 추상화 통합 의도 없음, 단순 시각 패턴 차용 |

## 10. v1 → v2 → v3 정정 이력

### v1 → v2 (1차 정정)
| 항목 | v1 오류 | v2 정정 |
|---|---|---|
| E-1 | `taxCategory.includes("major")` substring 매칭 → 비대주주 5종이 "대주주" 라벨 | `isMajorTaxCategory()` exact 비교 |
| E-2 | `priorYearEndDate?.toISOString()` optional chain | required Date → 직접 호출 |
| E-3 | UI 비상장·기타자산 동시 null → 비상장 임계 표시 회귀 | 비상장 매트릭스 추가 시도 |
| E-4 | AT-8 비상장 anchor `appliedThreshold===undefined` | `buildAppliedThreshold` 가드 통일 |
| E-5 | 라인 번호 오기 | L44~63 / L328~374 / L385~409 명시 |
| E-6 | `appliedMajorThreshold` prefix | `appliedThreshold` 통일 |
| I-1 | 식별자 미정의 가정 | 인라인 정의 + 패턴 차용 명시 |
| I-2 | anchor 8건 | 13건으로 확장 |
| I-3 | "stock-rate-tables 변경 없음" | UNLISTED 매트릭스 신설 시도 |
| I-4 | UI historical 텍스트 검증 누락 | 정확화 요구 |

### v2 → v3 (2차 정정)
| 항목 | v2 오류·모순 | v3 정정 |
|---|---|---|
| E-1 | §3.2 비상장 자동 판정 통합이 본 PR 범위 초과 — 폼 토글 의미 재정의 필요 | 비상장 통합을 **F-5 후속 PR로 분리**. 본 PR은 상장 3시장 한정 |
| E-2 | §4.2 "보존하되 부정확" 자체 모순 | historical 안내 카드 **삭제**, 동적 박스 일원화 (옵션 A) |
| E-3 | AT-2가 exempt 경로 빠져 AT-7과 중복 | AT-2를 **K-OTC 장외 대주주**로 교체 (정상 경로) |
| E-4 | AT-13 입력값 미정의 | F-5 이관과 함께 폐기 |
| E-5 | §3.1.3 헬퍼 위치 모호 | `stock-transfer-helpers.ts`로 명시 |
| I-1 | §3.2 비상장 매트릭스 placeholder | F-5 이관으로 자동 해결 |
| I-2 | §7 신규 동기화 누락 | 본 PR §8에 4항목 명시 |
| I-3 | AT-7 echo 검증 추상화 | `marketType="kosdaq"` / `shareRatio=0.02` / `fromDate="2024-01-01"` / `isExempt=true` 구체화 |
| I-4 | §9 "ResultView 패턴 차이" 표현 부정확 | "violet tone div 패턴 참고 차용, 추상화 통합 의도 없음" 중립화 |

## 11. 자가 점검 체크리스트 (Definition of Done)

- [ ] 케이스 매트릭스 AT-1~11 모두 anchor 작성·통과
- [ ] Pre-Do anchor (AT-3, AT-7) 우선 실행 → 실패 메시지 확보
- [ ] `StockTransferResult.appliedThreshold?` 타입 추가 (marketType은 kospi/kosdaq/konex 한정)
- [ ] 정상·exempt 경로 모두 propagation
- [ ] `buildAppliedThreshold` 헬퍼 → `stock-transfer-helpers.ts`
- [ ] `resolveThresholdFromDate` → `stock-rate-tables.ts` export
- [ ] UI 자체 계산 함수 2개 삭제 + 엔진 함수 import
- [ ] historical 안내 카드 삭제 + 동적 박스 단일 표시
- [ ] `isMajorTaxCategory` 헬퍼 — substring 매칭 금지
- [ ] 결과 카드 violet tone div 패턴 + `MARKET_LABEL` 인라인 (kospi/kosdaq/konex 3종)
- [ ] 비상장·기타자산 미표시 가드 + F-5 복원 예정 주석
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/stock-transfer/` 회귀 0
- [ ] 14지점 sync-checker 누락 0
- [ ] 브라우저 수동 4종 시나리오 확인 (코넥스 3% / 코스피 1% / `listed_non_major_in_market` 라벨 / exempt 카드)

## 12. 후속 PR 후보

- **F-4**: historical 임계 timeline 시각화 — 시기별 임계 변화 그래프 (UI 안내 카드 삭제분 복원)
- **F-5**: 비상장 자동 판정 통합 — `UNLISTED_MAJOR_THRESHOLDS` 매트릭스 신설 + `judgeIsMajorShareholder` unlisted 분기 축소 + 폼 토글 `isMajorShareholder` 의미 재정의(자동 산출값 vs 사용자 override) + AT-12/13 anchor 추가 + 비상장 UI 임계 카드 복원 + KoreanLaw MCP로 §157 부칙 검증
- **F-1**: `feedback_ui_engine_dual_truth_avoidance.md` 정책 신설
- **F-2**: `feedback_enum_substring_match_forbidden.md` 정책 신설
- **F-3**: `getStockTaxRate`·`getEstimatedAcquisitionRate` 등 유사 이중 진실 패턴 전수조사

---

**참고 파일**:
- 엔진: `lib/tax-engine/stock-transfer/stock-classification.ts` · `stock-rate-tables.ts` · `stock-transfer-tax.ts` · `stock-transfer-helpers.ts` · `types/stock-transfer.types.ts`
- UI: `components/calc/stock-transfer/MajorShareholderBlock.tsx`
- 결과: `components/calc/results/StockTransferTaxResultView.tsx`
- 메모리 정책: `feedback_ui_input_path_enumeration` / `feedback_pre_anchor_verification` / `feedback_engine_comment_vs_impl_drift` / `feedback_no_silent_apportion_fallback`
