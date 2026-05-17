# 주식 양도소득세 대주주 임계 echo — UI 설계 v2

> Plan 문서: [`docs/00-pm/stock-transfer-applied-threshold-sync.plan.md`](../../00-pm/stock-transfer-applied-threshold-sync.plan.md) v3
> 엔진 명세: `stock-transfer-applied-threshold.engine.design.md` v2
> 작성: 2026-05-17 (v2 정정)
> v1 → v2 변경: §13 정정 이력 참조

## Context

UI 측 책임 영역만 별도 명세. 엔진 시니어가 `StockTransferResult.appliedThreshold?` 추가 후 UI 시니어가 다음 2개 컴포넌트를 수정:

1. `components/calc/stock-transfer/MajorShareholderBlock.tsx` — 입력 단계 미리보기
2. `components/calc/results/StockTransferTaxResultView.tsx` — 결과 화면 카드

---

## 사용자 시나리오

### S-1. 코넥스 3% 사용자가 비대주주 자동 판정 받음 (현재 UI 버그 차단)
- marketType=konex, priorYearEndDate=2024-12-31, selfShareRatio=0.03, selfMarketCap=30억
- 기대: 입력 미리보기 "✗ 대주주 미해당" + 결과 화면 "비대주주"
- 현재: 미리보기 "✓ 대주주 해당" 오표시 → 본 PR로 정정

### S-2. 코스피 대주주 (지분율 1.5%)
- 입력 미리보기: "현재 적용 임계 1.0% / 50억 · 코스피 · 2024-01-01~ 적용"
- 결과 카드: "지분율 임계 1.0% / 시총 임계 50,000,000,000원 · 판정: 대주주 해당"

### S-3. 코스닥 비대주주 장내 비과세
- exempt 경로지만 결과 카드에 임계 정보 노출 → 비대주주 판정 근거 확인 가능
- 강화 옵션(I-2): `isExempt === true` 시 카드 하단에 "→ 비과세 (§94①3 가목 단서)" 보조 라벨 표시

### S-4. 비상장·기타자산
- 입력 미리보기 동적 박스 미렌더 (`appliedThreshold===undefined` 가드)
- 결과 카드도 미표시
- 인라인 주석으로 "F-5 후속 PR에서 비상장 복원 예정" 명시

---

## 폼 토글 `isMajorShareholder` vs 자동 판정 관계 (필독)

본 PR은 **거동 변경 없음**. 엔진은 `input.isMajorShareholder`(폼 토글 값)를 받아 그대로 분류·세율에 사용. UI의 자동 판정 미리보기는 **사용자가 폼 토글을 정확하게 선택하도록 돕는 시각 보조**이며, 엔진 input을 자동으로 override하지 않음.

- 자동 판정 vs 폼 토글 불일치 시: **폼 토글 우선** (현재 동작 유지)
- UI는 두 값이 다를 때 warning을 표시하지 않음 (본 PR 범위 외)
- F-5에서 자동 산출 vs 사용자 override UX 재정의

---

## 14개 동기화 지점

본 PR이 영향을 주는 지점만 표시. 영향 없음은 §6에서 일괄 명시.

### ⑤ UI 입력 위젯 — `MajorShareholderBlock.tsx`

**삭제 (L43~63, 21줄)**:
```ts
function getMarketCapThreshold(...) { ... }   // 시기 구간 단순화 + historical 부정확
function getShareRatioThreshold(...) { ... }  // 코스닥·코넥스 동일 2% 매핑 버그
```

**삭제 (L127~138, 12줄)**:
```tsx
{/* 시기별 임계 안내 카드 — historical 4구간 정적 표시 */}
<div className="rounded-lg border border-violet-200/60 bg-violet-50/60 px-4 py-3 text-sm">
  <p>· 2024.1.1. 이후 → 전 시장 50억</p>
  ...
</div>
```
사유: 엔진 이력과 일부 불일치 (코스피 historical 8구간 vs UI 4구간), F-4 후속 PR(timeline 시각화)에서 복원.

**추가 (3줄 import + 18줄 동적 박스)**:
```ts
import {
  getMajorShareholderThreshold,
  resolveThresholdFromDate,
} from "@/lib/tax-engine/stock-transfer/stock-rate-tables";
import { MARKET_LABEL } from "@/components/calc/stock-transfer/market-label";

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

**동적 박스 (historical 카드 자리)**:
```tsx
{threshold && form.priorYearEndDate && (
  <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-3 text-sm">
    <p className="font-semibold text-violet-900 mb-1">현재 적용 임계 (§157④)</p>
    <p className="text-violet-800">
      지분율 <strong>{(threshold.shareRatioThreshold * 100).toFixed(1)}%</strong> ·
      시총 <strong>{(threshold.marketCapThreshold / 100_000_000).toFixed(0)}억</strong>
    </p>
    <p className="text-xs text-violet-600 mt-1">
      {MARKET_LABEL[form.marketType as keyof typeof MARKET_LABEL]} ·
      {resolveThresholdFromDate(
        form.marketType as "kospi" | "kosdaq" | "konex",
        new Date(form.priorYearEndDate),
      )}~ 적용
    </p>
  </div>
)}
{/* 비상장·기타자산은 미렌더 — F-5 후속 PR에서 복원 예정 */}
```

**기존 판정 미리보기 (L182~195)**: 변수만 교체. 로직 동일.

### ⑦ 결과 카드 — `StockTransferTaxResultView.tsx`

**Do 단계 진입 전 grep 약속**: `StockTransferTaxResultView.tsx`의 기존 카드 marshalling 패턴 1건을 확인 후 동일 구조 적용. violet tone div 사용 카드가 이미 있으면 그 형식 차용. 없으면 다른 ResultView(예: `TransferTaxResultView`)의 violet 카드 1건 grep.

**추가**:
```tsx
import { MARKET_LABEL } from "@/components/calc/stock-transfer/market-label";

function isMajorTaxCategory(c: StockTransferResult["taxCategory"]): boolean {
  // substring 매칭 금지 (feedback_enum_substring_match_forbidden 후보)
  // exact 비교 필수 — "listed_non_major_in_market" 등이 "major" 포함하므로
  return c === "listed_major" || c === "unlisted_major";
}

{result.appliedThreshold && (
  <div className="rounded-lg border border-violet-200 bg-violet-50/60 p-4 space-y-2">
    <h4 className="text-sm font-semibold text-violet-900">대주주 판정 (§157④)</h4>
    <dl className="text-sm text-violet-800 space-y-1">
      <div>· 시장: <strong>{MARKET_LABEL[result.appliedThreshold.marketType]}</strong></div>
      <div>· 판정 기준일: {result.appliedThreshold.priorYearEndDate}</div>
      <div>· 임계 적용 시작: {result.appliedThreshold.fromDate}</div>
      <div>· 지분율 임계: <strong>{(result.appliedThreshold.shareRatio * 100).toFixed(1)}%</strong></div>
      <div>· 시총 임계: <strong>{formatKRW(result.appliedThreshold.marketCap)}원</strong></div>
      <div className="pt-1 font-medium">
        판정: <strong>{isMajorTaxCategory(result.taxCategory) ? "대주주 해당" : "비대주주"}</strong>
      </div>
      {/* 강화 옵션 — exempt 경로 비과세 사유 명시 (I-2) */}
      {result.isExempt && (
        <div className="text-xs text-violet-600 mt-1">→ 비과세 (§94①3 가목 단서)</div>
      )}
    </dl>
  </div>
)}
```

**가시성 원칙**: 비상장·기타자산·`appliedThreshold` 미존재 시 카드 자체 미렌더 (조건부). other_asset_block_shareholder·other_asset_heavy_re는 §94①4 별도 트랙이므로 자연스럽게 undefined gate.

---

## `MARKET_LABEL` 단일 정의 (U-2 정정)

**신규 파일**: `components/calc/stock-transfer/market-label.ts`

```ts
/**
 * 주식 양도세 시장 라벨 — 입력·결과 공유
 * 본 PR 범위(상장 3시장)만 매핑. 비상장·기타자산은 F-5에서 추가.
 */
export const MARKET_LABEL = {
  kospi: "코스피",
  kosdaq: "코스닥",
  konex: "코넥스",
} as const;

export type MarketLabelKey = keyof typeof MARKET_LABEL;
```

`MajorShareholderBlock.tsx`·`StockTransferTaxResultView.tsx` 양쪽에서 동일 모듈 import. 중복 정의 제거.

> 결과 카드는 `result.appliedThreshold.marketType` 가 이미 `"kospi" | "kosdaq" | "konex"` 한정 → 타입 안전.
> 입력 미리보기는 `form.marketType` 이 5종이나 동적 박스 가드 안에서만 호출 → `as keyof typeof MARKET_LABEL` 캐스팅.

---

## 동기화 지점 영향 없음

| # | 지점 | 사유 |
|---|---|---|
| ① | 폼 상태 | 신규 입력 필드 없음 |
| ② | initial | 신규 입력 필드 없음 |
| ③ | normalize | 신규 입력 필드 없음 |
| ④ | API 변환 | 입력 스키마 무변경 |
| ⑥ | 사이드바 | 사이드바 합계 영향 없음 (임계는 합계 무관 정보) |
| ⑧ | validation | 입력 필드 무변경, fallback 신설 없음 |
| ⑨ | Zod enum 메인 | marketType enum 변경 없음 |
| ⑩ | Zod enum 컴패니언 | 변경 없음 |
| ⑪ | acquisitionDate fallback | 무관 |
| ⑫ | Zod 입력 객체 | 변경 없음 |
| ⑬ | callTransferTaxAPI body | 변경 없음 |
| ⑭ | Route handler 매핑 | 변경 없음 |

→ 본 PR은 14지점 중 **⑤·⑦ 2개만 변경** + 결과 type echo 1건 (14지점 외) + `market-label.ts` 신규 모듈 1개.

---

## 토글/라디오 가시성

신규 ToggleCard·RadioCardGroup 없음. 기존 `MajorShareholderBlock`의 ToggleCard 그대로 사용. tone=violet 유지.

---

## placeholder 정확성

신규 입력 필드 없음 → placeholder 규칙 무관.

---

## 결과 뷰 산식 표기

대주주 판정 카드는 **산식 없음** — 임계값·판정 결과 echo만. 한국어 풀어쓰기 정책 적용 (변수 약어 금지, `floor()` 없음).

---

## 800줄 정책 (산수 정정)

| 파일 | 현재 | 변경 후 | 분할 필요 |
|---|---|---|---|
| `MajorShareholderBlock.tsx` | 199줄 | **~187줄** (-21 자체함수 -12 historical카드 +3 import +18 동적박스 = -12 순감) | 불필요 |
| `StockTransferTaxResultView.tsx` | Do 단계 grep 확인 | +25줄 (카드 + import) | 750줄 초과 시 별도 파일(`MajorShareholderResultCard.tsx`) 분리 |
| `market-label.ts` (신규) | - | ~15줄 | 신규 모듈 |

---

## tree-shaking 측정 약속

`stock-rate-tables.ts` import 시 클라이언트 번들에 KOSPI/KOSDAQ/KONEX 매트릭스 + 2개 함수 포함 예상.

**Do 단계에서 측정**:
- `npm run build` 전후 `.next/static/chunks/` 클라이언트 청크 크기 diff
- 증가 5KB 이하 예상 (매트릭스 ~25행 + 함수 2개)
- 증가가 크면 `MajorShareholderBlock.tsx`에서 필요한 부분만 별도 모듈(`stock-major-threshold-lookup.ts`)로 분리 검토

---

## 강화 옵션 (본 PR 범위 외, 후속 PR 메모)

| ID | 옵션 | 적용 시기 |
|---|---|---|
| I-2 | exempt 경로 결과 카드에 "→ 비과세 (§94①3 가목 단서)" 보조 라벨 (이미 디자인에 반영) | 본 PR 포함 (단순 조건부 렌더링) |
| I-3 | `fromDate === "1900-01-01"` 사용자 표시 매핑 ("1999.1.1. 이전" 등) | F-4와 함께 |
| I-4 | `LawArticleModal` 적용 — "§157④" 클릭 시 조문 모달 | 별도 후속 PR |

---

## 정책 충돌 점검 (Pre-Do)

`feedback_*` 메모리 인덱스 확인 결과:

- ✅ `feedback_useeffect_store_mirror_forbidden` — useMemo만 사용, store mirror 없음
- ✅ `feedback_no_silent_apportion_fallback` — 자동 안분 없음, undefined 시 미렌더
- ✅ `feedback_ui_input_path_enumeration` — 신규 enum 추가 없음
- ✅ `feedback_api_zod_schema_sync` — 입력 스키마 무변경
- ✅ `feedback_validation_sync_8th_point` — fallback 신설 없음
- ✅ `feedback_store_default_vs_ui_display_fallback` — UI display fallback 사용 없음
- 🟡 `feedback_law_article_link` — 결과 카드에 §157④ 라벨 표시. **LawArticleModal 적용은 본 PR 범위 외** (I-4 후속 PR 메모)

---

## Definition of Done — UI 시니어 책임

- [ ] `market-label.ts` 신규 모듈 생성 (3종 매핑)
- [ ] `MajorShareholderBlock.tsx` 자체 계산 함수 2개 삭제 (-21줄)
- [ ] `MajorShareholderBlock.tsx` historical 안내 카드 삭제 (-12줄)
- [ ] `MajorShareholderBlock.tsx` 엔진 함수 import + 동적 박스 추가 (+21줄)
- [ ] `MajorShareholderBlock.tsx` 최종 크기 확인 (~187줄 예상)
- [ ] `StockTransferTaxResultView.tsx` 기존 violet tone 카드 패턴 grep 후 동일 구조 적용
- [ ] `StockTransferTaxResultView.tsx` 대주주 판정 카드 추가 + exempt 사유 라벨(I-2)
- [ ] `StockTransferTaxResultView.tsx` 750줄 초과 시 카드 별도 파일 분리
- [ ] `isMajorTaxCategory` 헬퍼 — exact 비교
- [ ] 비상장·기타자산 미렌더 가드 + F-5 복원 예정 인라인 주석
- [ ] `npx tsc --noEmit` 0건
- [ ] `npm run build` 클라이언트 번들 diff 측정 (5KB 이하 확인)
- [ ] 브라우저 수동 4종 시나리오 (S-1~S-4) 확인
- [ ] `ui-engine-sync-checker` 호출 → 14지점 누락 0

---

## v1 → v2 정정 이력

| ID | v1 오류·모순 | v2 정정 |
|---|---|---|
| U-1 | 800줄 추정 산수 부호 반대 (~210줄) | -21·-12·+3·+18 = **-12 순감**, 199 → ~187 |
| U-2 | `MARKET_LABEL_INPUT` 5종 dead code + 결과 카드에 별도 `MARKET_LABEL_RESULT` 중복 | **`market-label.ts` 단일 모듈** 3종 매핑, 입력·결과 공유 import |
| I-1 | 폼 토글 vs 자동 판정 관계 미설명 | §3 별도 섹션으로 명시 (폼 토글 우선, F-5 재정의) |
| I-2 | exempt 비과세 사유 라벨 누락 | 결과 카드 코드에 조건부 보조 라벨 통합 |
| I-3 | fromDate "1900-01-01" 사용자 혼란 가능성 | §11 강화 옵션 메모 (F-4와 함께 처리) |
| I-4 | 기존 violet tone 카드 패턴 미확인 | Do 단계 grep 약속을 ⑦ 본문 + DoD에 명시 |
| I-5 | tree-shaking 측정 약속 부재 | §10 별도 섹션 추가 — `npm run build` diff 5KB 이하 확인 |
| (추가) | `feedback_law_article_link` ✅ 잘못 표기 | 🟡로 정정 — 본 PR 범위 외, I-4 후속 PR 명시 |
