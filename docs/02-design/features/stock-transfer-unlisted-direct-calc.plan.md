# 비상장 보충적 평가 — 1주당 순손익가치·순자산가치 직접계산 모드 추가 (계획서 v4)

작성일: 2026-05-19 (v4 정정: v3 + Zod 명시·S-03 처리·메시지 상수 3건 + cross-check NA 19행/74 필드 정정)

## 0. v4 추가 정정 (3건)

| ID | 분류 | 정정 |
|---|---|---|
| E-7 | 누락 | `unlistedValuationMode` enum은 sessionStorage normalize에서만 검증 (server-side Zod 무변동) — §11 표에 NO 명시 |
| M-7 | 누락 | 시나리오 S-03(양/취 부분 입력) 처리: 양/취 동시 단일 토글로 결정됨에 따라 full 모드 시 양/취 양쪽 핵심 필드 모두 필수 — validate에서 차단 |
| I-4 | 개선 | UI 안내 메시지 문자열을 `lib/tax-engine/stock-transfer/unlisted-messages.ts` 상수로 export — UI·테스트 동기화 |

대상: `EstimatedUnlistedBlock` (취득 후 상장이 아닌 일반 비상장 §165④ 평가)
근거: 시행령 §165④1 (가중평균 본칙) · §165⑤ (가중치 반전) · 상증령 §17 (환원율 10%) · 상증령 §54·§55 (1주당 순손익액·순자산가액 산식)

---

## 1. 배경 & 문제

현재 `EstimatedUnlistedBlock`은 **양도/취득 × 손익/순자산 = 4 필드**만 직접 입력받는다.

| 필드 (store) | 라벨 |
|---|---|
| `transferYearNetIncomePerShare` | 양도연도 1주당 순손익가치 |
| `transferYearNetAssetPerShare`  | 양도연도 1주당 순자산가치 |
| `acquisitionYearNetIncomePerShare` | 취득연도 1주당 순손익가치 |
| `acquisitionYearNetAssetPerShare`  | 취득연도 1주당 순자산가치 |

사용자가 1주당 가액을 사전에 직접 산출해야 하는 부담 — 실무에서는 16행(순손익) + 21행(순자산) 손계산이 흔히 잘못된다.

이미 §165⑤ 취득 후 상장(`PostListingValuationCard`)에는 **`unlistedDetailMode` 3분기**(simple / listing_only / full)와 행-수준 계산 UI(`PostListingNetIncomeStatement` 24행 + `PostListingNetAssetStatement` 21행 + 환원율 입력)가 구현되어 있다. 이를 §165④ 일반 비상장에서도 동일 패턴으로 재사용한다.

---

## 2. 사용자 시나리오

### S-01. 간이 직접 입력 (현행 유지)
1주당 순손익·순자산가치를 외부에서 산출하여 4필드만 입력 → 양도/취득기준시가 미리보기 → 가중평균 + 80% 하한 자동.

### S-02. 행-수준 직접 계산 (신규)
양도연도·취득연도 각각:
- 순손익액 24행(가산 4 + 차감 12 + 주식수 + 환원율) → 1주당 순손익가치 자동 산출
- 순자산가액 21행(자산 + 부채 + 영업권) → 1주당 순자산가치 자동 산출
- 산출값이 4필드에 자동 반영되어 가중평균 미리보기 + 엔진 input 연결

### S-03. 부분 계산 (옵션)
양도연도만 계산하고 취득연도는 직접 입력 (또는 반대). — Round 1에서는 **양/취 토글 분리**로 지원할지 결정 필요. 기본안은 `unlistedValuationMode` 단일 토글로 양/취 동시 적용.

---

## 3. UI 설계

### 3-A. 모드 토글 (RadioCardGroup, tone=fuchsia)

`EstimatedUnlistedBlock` 상단(가중치 안내 카드 아래, 순자산 단독 사유 위)에 추가:

| value | label | description |
|---|---|---|
| `simple` (default) | 직접 입력 | 1주당 순손익·순자산가치를 외부에서 산출하여 입력 |
| `full` | 행-수준 계산 | 24행 순손익 + 21행 순자산을 양/취 각각 입력하여 자동 산출 |

**default 결정**: 기존 사용자 호환을 위해 `simple` 유지. (3중 패턴 default: factory `"simple"` + normalize `"simple"` + UI display `|| "simple"`)

**[M-1] 토글 시 데이터 보존 정책**: simple ↔ full 토글 시 양쪽 폼 필드를 **모두 보존**(실수 토글 보호). 즉 simple의 4 필드와 full의 74 필드는 독립 store slot으로 공존하며, 활성 모드의 값만 adapter가 사용. 모드 전환만으로 입력값이 사라지지 않음. UI 미노출 ≠ store 삭제.

### 3-B. simple 모드 (현행 UI)

기존 4필드 입력 + 미리보기 그대로. 변경 없음.

### 3-C. full 모드 (신규 UI)

순자산 단독 사유(`isNetAssetOnly`)에 따른 표시:
- `isNetAssetOnly === false`: 양도/취득 × 순손익/순자산 = **2 + 2 = 4 블록** (순손익 24행 × 2 + 순자산 21행 × 2)
- `isNetAssetOnly === true`: 양도/취득 × 순자산 = **2 블록** (순자산 21행 × 2). **순손익 24행 양/취 양쪽 모두 비노출** + 안내 메시지 "순자산 단독 평가 (§165④3) — 순손익 산정 불필요" 표시.

**[E-6] isNetAssetOnly ↔ 순손익 계산서 연동 5개 지점** (mode와 무관하게 모두 일관 적용):

| 지점 | isNetAssetOnly === true 시 동작 |
|---|---|
| (1) UI | simple: 기존 NI 4 필드 비노출 (현행). full: NI 24행 양/취 블록 비노출 + 안내 메시지 |
| (2) Adapter [§5-A] | `calcNetIncomePerShare` 호출 자체 skip. `body.transferYearNetIncomePerShare` / `acquisitionYearNetIncomePerShare`를 `""` 그대로 유지 (엔진은 isNetAssetOnly 시 NI 값 무시 — stock-valuation-unlisted.ts L201 검증됨) |
| (3) Sidebar selector [§8 M-3] | `computeUnlistedPerShareSummary` 내부에서 NA만 reduce. niWeight = 0 적용 (기존 EstimatedUnlistedBlock useMemo L65~68 패턴) |
| (4) Validate [§7] | full 모드 + isNetAssetOnly 시 NI 행 필수 검증 skip. 단 NA 21행 핵심 필드는 그대로 필수 |
| (5) 데이터 보존 [M-1] | isNetAssetOnly OFF→ON→OFF 토글 시 NI 74 필드 중 36 필드(`ni*EUTransfer/EUAcq`)는 store에 보존 — UI는 단순 hidden 패턴, store는 무삭제. 사용자 실수 토글 보호 |

→ 5개 지점 모두 동일 derive 분기: `const niSkip = isNetAssetOnly === true`. 엔진/adapter/selector/validate 모두 같은 헬퍼 `shouldSkipNetIncome(form)` 추출 권장 (이중 진실 차단).

각 블록은 기존 `PostListingNetIncomeStatement` / `PostListingNetAssetStatement` 컴포넌트의 `YearColumn` UI를 재사용하되 **col 키만 새로 추가**:

| 신규 col | 기존 col (PostListing) | 비고 |
|---|---|---|
| `EUTransfer` | `Listing` | 양도연도 24/21행 |
| `EUAcq` | `Acq` | 취득연도 24/21행 |

→ **[E-1·E-2 정정] 진짜 분리 차원은 `isListed`**:
- PostListing 활성: `acquisitionMode === "estimated" && isListed && acquiredBeforeListing` (Step2.tsx:362, 391)
- EstimatedUnlisted 활성: `acquisitionMode === "estimated" && !isListed` (Step2.tsx:396)

즉 `acquiredBeforeListing` 토글이 아닌 **`isListed` 토글로 상호 배타**. 같은 종목 한 평가에서 두 영역이 동시 활성될 일은 없으나, 사용자가 `isListed` 토글을 ON↔OFF 변경 시 동일 키(예: `niAddRow1Acq`)의 store 값이 양 영역에 그대로 노출되어 **데이터 오염**(다른 평가 컨텍스트에서 입력한 값이 보임). 이를 차단하기 위해 **신규 col `EUTransfer` / `EUAcq` prefix 안전 분리**를 채택.

### 3-D. 계산 결과 미리보기 (full 모드)

각 블록 하단에 계산 결과 카드:
- 1주당 순손익가치 (24행 계산 결과)
- 1주당 순자산가치 (21행 계산 결과)
- 양도/취득기준시가 (가중평균 + 80% 하한, 기존 미리보기 재사용)

---

## 4. Store 변경 (Layer ①②③)

### 4-A. 신규 형식 필드

```ts
// lib/stores/calc-wizard-stock-store.ts
interface StockTransferFormData {
  // ... 기존 ...

  // 비상장 §165④ 평가 모드 (신규)
  unlistedValuationMode: "simple" | "full"; // 3중 패턴 default: "simple"

  // full 모드 — 양도연도 24행 순손익 (Transfer)
  niAddRow1EUTransfer: string;
  niAddRow2EUTransfer: string;
  niAddRow3EUTransfer: string;
  niAddRow4EUTransfer: string;
  niSubRow5EUTransfer: string;
  // ... niSubRow6~16EUTransfer (총 12행) ...
  niShareCountEUTransfer: string;
  niDiscountRateEUTransfer: string; // default "10"

  // full 모드 — 취득연도 24행 순손익 (Acq)
  niAddRow1EUAcq: string;
  // ... (same shape × 14 + 2 = 16 필드) ...

  // full 모드 — 양도/취득연도 21행 순자산 (Transfer/Acq)
  // PostListingNetAssetStatement 의 21행 키 구조 그대로 ${col} prefix만 EUTransfer/EUAcq
  // (총 ~38 필드)
}
```

총 신규 필드: 약 16 × 2(NI) + 19 × 2(NA) ≈ **74 필드**. PostListing이 추가했던 80 필드와 동일 패턴.

### 4-B. Factory default (②)
모든 신규 필드 `""`. `unlistedValuationMode: "simple"`.

### 4-C. Normalize fallback (③)
- `enumField("unlistedValuationMode", ["simple", "full"], "simple")`
- 74 신규 필드 모두 `stringField(...)`

---

## 5. API 변환 (Layer ④)

### 5-A. flat-adapter 재사용 패턴

**[E-5 정정] 실제 export 헬퍼**:
- `calcNetIncomePerShare(input: { addA, subB, shareCount, discountRate })` — 단일 컬럼 perShare 산출 (`stock-valuation-post-listing.ts:85`)
- `calcNetAssetPerShare(input)` — 단일 컬럼 perShare 산출 (`stock-valuation-post-listing.ts:106`)
- `adaptFlatToPostListingDetail(form)` — flat → nested 변환 (post-listing 전용)
- `adaptFlatToApiBody(form, detail)` — body 4 필드 reduce (post-listing 전용)

→ EstimatedUnlisted는 PostListing과 컬럼 키가 달라(EUTransfer/EUAcq) `adaptFlatToApiBody` 직접 재사용 불가. **신규 함수 `adaptUnlistedFlatToApiBody(form): { transferNi, transferNa, acqNi, acqNa }`를 `unlisted-flat-adapter.ts`(신규 파일)에 작성** — 내부에서 `calcNetIncomePerShare`/`calcNetAssetPerShare`를 col별로 호출.

`lib/calc/stock-transfer-tax-api.ts`에 분기:

```ts
if (!isListed && form.unlistedValuationMode === "full") {
  const niSkip = form.netAssetOnlyReason !== ""; // [E-6 (2)] isNetAssetOnly 시 NI 호출 skip
  const reduced = adaptUnlistedFlatToApiBody(form, { niSkip });
  // NI는 isNetAssetOnly 시 빈 문자열 유지 (엔진이 무시)
  body.transferYearNetIncomePerShare = niSkip ? "" : String(reduced.transferNi);
  body.acquisitionYearNetIncomePerShare = niSkip ? "" : String(reduced.acqNi);
  // NA는 항상 reduce
  body.transferYearNetAssetPerShare = String(reduced.transferNa);
  body.acquisitionYearNetAssetPerShare = String(reduced.acqNa);
  // [M-2] 74 신규 필드는 body 미포함 — Zod stripping/엔진 미도달 위험 0
  //       (client adapter에서 reduce 후 4 필드만 전달, 엔진 input은 무변동)
} else {
  // simple — 기존 4필드 직접 전달
}
```

**원칙 (memory):** UI 미리보기·API 변환 양쪽 동일 adapter import (이중 진실 차단). 사이드바 selector도 동일 `adaptUnlistedFlatToApiBody` 사용 → 3 곳 단일 진실.

### 5-B. 엔진 input 변경 없음

엔진은 여전히 4 필드(`transferYearNetIncomePerShare` 등)만 받는다. flat-adapter가 full 모드를 4 필드로 reduce.

---

## 6. UI 컴포넌트 변경 (Layer ⑤)

### 6-A. `EstimatedUnlistedBlock` 수정 (~60줄 추가)

- mode RadioCardGroup 추가
- mode === "full" 시 신규 sub-컴포넌트 4개 렌더

### 6-B. 신규 컴포넌트 (3-D 미리보기 포함)

- `EstimatedUnlistedNetIncomeStatement.tsx` (~150줄) — `PostListingNetIncomeStatement.YearColumn` 패턴 차용. col prop = `"EUTransfer" | "EUAcq"`. `calcNetIncomePerShare` 헬퍼 그대로 import.
- `EstimatedUnlistedNetAssetStatement.tsx` (~150줄) — 위와 동일 패턴.

**800줄 정책**: 각 신규 컴포넌트 < 800줄. EstimatedUnlistedBlock도 분할 신호 시 별도 PR.

### 6-C. PostListing 컴포넌트 재사용 (X-1 정정 — 재사용 채택)

**[X-1 재검토]** ADD_LABELS · SUB_LABELS는 §54·§55 보충적 평가 공통 산식 라벨 — PostListing(§165⑤)과 EstimatedUnlisted(§165④)가 법령상 동일 라벨을 공유. "강결합" 평가는 과대평가.

**채택 결정**: `YearColumn` 을 `PostListingNetIncomeStatement.tsx` / `PostListingNetAssetStatement.tsx` 에서 **named export** 하고 신규 컴포넌트가 직접 import. 변경:

1. `Column` 타입을 `"Listing" | "Acq" | "EUTransfer" | "EUAcq"` 로 확장 (또는 generic `string` + col 매핑 객체 prop화)
2. `COL_LABEL` 매핑 객체에 `EUTransfer: "양도연도 직전"`, `EUAcq: "취득연도 직전"` 추가
3. 신규 컴포넌트는 thin wrapper(~50줄) — col prop만 전달

**[X-2 정확화] 효과**: 코드 중복 **~150~200줄 절약** (YearColumn UI 부분만 — NI 컴포넌트 ~250줄 중 ~120줄 + NA 컴포넌트 ~210줄 중 ~80줄). 더 큰 이익은 **단일 진실(라벨·계산 헬퍼·미리보기 동기화 자동)**.
**리스크**: PostListing에 부수 변경(타입 확장)이 발생 — 회귀 테스트(EU 미사용 PostListing anchor) 1건 보강 필요(EU-15).

**[M-5] 영업권 21행 적용성 검증 — KoreanLaw MCP 필수**: PostListingNetAssetStatement 21행 중 `naGoodwillRow19` 영업권 행은 §165⑤(취득 후 상장) 명문 적용. §165④(일반 비상장)에도 영업권 가산이 적용되는지 **KoreanLaw MCP `get_law_text("상증령", "54")` + `get_law_text("상증령", "55")` 로 본칙 확인 후 결정** (Phase A1에서 30분 추가). 미적용 시 EU 컴포넌트에서 영업권 행 숨김 또는 안내 메시지 분기. memory 정책 `korean-law-82-vs-81-2-drift` 준수.

---

## 7. Validation (Layer ⑧)

`lib/calc/stock-transfer-tax-validate.ts`에 분기 추가:

```ts
if (!form.acquiredBeforeListing && taxCategory === "unlisted_*") {
  const mode = form.unlistedValuationMode || "simple";
  if (mode === "simple") {
    // 기존 4필드 검증 (현행)
  } else {
    // full — 각 컬럼 핵심 필드(주식수·환원율) 필수 + addA·subB 최소 1행 입력
    if (isEmpty(form.niShareCountEUTransfer)) errors.push("양도연도 발행주식수 필수");
    // ... 동일 패턴 × Acq
  }
}
```

**fallback 일관성 (memory mirror-pattern)**: UI display `|| "simple"` = API fallback = validate fallback 3중 패턴 일치.

---

## 8. 사이드바·결과 카드 (Layer ⑥⑦)

**[M-3 정정]** `StockSidebar` 가 `transferYearNetIncomePerShare` 등 4 필드를 **store에서 직접 참조**하면, full 모드에서 4 필드는 빈 문자열로 남아 사이드바 합계가 표시되지 않는다. 채택안:

- **사이드바 selector화**: `computeUnlistedPerShareSummary(formData)` 신규 헬퍼를 사이드바·EstimatedUnlistedBlock 미리보기·API adapter 3 곳에서 공유 import. 헬퍼 내부에서 `unlistedValuationMode === "full"` 분기 시 `aggregateNetIncome`/`aggregateNetAsset` 호출하여 reduce 후 4 값 반환.
- 4 필드 store 미러링 금지 정책(`useeffect-store-mirror-forbidden`) 준수 — useEffect로 4 필드에 patch하지 않음. selector 단계에서만 derive.

**결과 카드**: 변경 없음 (엔진 input 무변동 → result 무변동). 단 full 모드 사용 시 결과 카드 상단에 "행-수준 계산 적용 (§54·§55)" 배지 추가 권장 (선택).

---

## 9. 라우트·Zod (Layer ⑨⑩⑫⑭)

엔진 input 변경 없음 → Zod·route 변경 없음. 단 신규 폼 필드가 body로 흘러도 무해(엔진 input에 정의되지 않은 키는 ignore). **Zod 입력 객체에 신규 필드 정의는 불필요** (API 변환 시 4 필드로 reduce되므로).

---

## 10. 테스트 (anchor)

### 10-A0. mode × isNetAssetOnly 상호작용 매트릭스 [I-3]

5개 지점(UI·adapter·selector·validate·데이터 보존)에 동일하게 적용되는 진리표:

| mode | isNetAssetOnly | NI 24행 UI | NA 21행 UI | adapter NI 호출 | adapter NA 호출 | NI 필수 검증 |
|---|---|---|---|---|---|---|
| simple | F | 4 필드 (현행) | 4 필드 (현행) | skip (simple) | skip (simple) | YES |
| simple | T | NI 입력 **비노출** (현행 L155) | NA 입력 노출 | skip | skip | NO |
| full   | F | 24행 × 양/취 노출 | 21행 × 양/취 노출 | 양/취 호출 | 양/취 호출 | YES |
| full   | T | **NI 24행 양/취 비노출** | 21행 × 양/취 노출 | **skip** | 양/취 호출 | **NO** |

→ 4 케이스 모두 EU-anchor + UI 비노출 anchor로 검증 (10-A·10-B).

### 10-A. 케이스 매트릭스 [M-4 보강]

`mode × isHeavyRE × isNetAssetOnly × 환원율default` = **2 × 2 × 2 × 2 = 16 케이스**. 각 케이스 anchor 1~2건 + 80% 하한 발동/미발동 변형 포함.

| # | mode | isHeavyRE | isNetAssetOnly | 환원율 | 검증 포인트 |
|---|---|---|---|---|---|
| C-01 | simple | F | F | n/a | 가중평균 3/5+2/5 + 80% 하한(기존 회귀) |
| C-02 | simple | T | F | n/a | 가중치 반전 2/5+3/5 |
| C-03 | simple | F | T | n/a | 순자산 단독 + 80% 하한 미적용 |
| C-04 | simple | T | T | n/a | 순자산 단독 (isHeavyRE 무관) |
| C-05 | full | F | F | 10%(default) | 24행 → perShare 산출 + 가중평균 + 80% 하한 |
| C-06 | full | F | F | 미입력 | default "10" 적용 검증 |
| C-07 | full | F | F | 9.5% | 비-default 환원율 — perShare 변화 |
| C-08 | full | T | F | 10% | 가중치 반전 + 24행 계산 |
| C-09 | full | F | T | 10% | 순자산만 21행 계산 + 80% 하한 미적용 |
| C-10 | full | T | T | 10% | 순자산 단독 + 가중치 반전 무관 |
| C-11 | full | F | F | 10% | 80% 하한 발동 케이스 (na × 0.8 > weighted) |
| C-12 | full | F | F | 10% | 양도연도만 full + 취득연도 simple (S-03 미지원이면 모드 일괄 적용 검증) |

### 10-B. unit test 파일 (`__tests__/tax-engine/stock-transfer/unlisted-direct-calc.test.ts`)
- EU-1~12: 위 매트릭스 (C-01~12)
- EU-13: API 변환 통합 — `adaptUnlistedFlatToApiBody`가 양도/취득 4필드를 정확히 채움
- EU-14: simple ↔ full 토글 시 store 데이터 양쪽 모두 보존 [M-1]
- EU-15: PostListing 회귀 보호 — YearColumn export·col 타입 확장 후 기존 PostListing anchor 무변동 [X-1 부수 영향]
- EU-16: isNetAssetOnly 토글 시 NI 74 필드 중 36 필드(`ni*EUTransfer/EUAcq`) 데이터 보존 [E-6 (5)]
- EU-17: adapter — full + isNetAssetOnly 시 `body.transferYearNetIncomePerShare === ""` + NA만 reduce [E-6 (2)]
- EU-18: selector — `computeUnlistedPerShareSummary` 가 isNetAssetOnly 시 NA만 사용 [E-6 (3)]

### 10-C. validate test
- VU-1: full 모드 + isNetAssetOnly === false + 양도연도 발행주식수 미입력 → 에러
- VU-2: full 모드 + isNetAssetOnly === false + 가산/차감 행 모두 미입력 → 경고 또는 에러
- VU-3: simple 모드 fallback (UI `|| "simple"` = validate fallback) 일치 [mirror-pattern]
- VU-4: full 모드 + isNetAssetOnly === true + **NI 행 미입력은 통과** + NA 행 미입력은 에러 [E-6 (4)]

### 10-D. UI 통합 anchor (PR-B 브라우저 확인용) [M-6]
- UI-1 (C-09): full + isNetAssetOnly === true 시 NI 24행 양/취 양쪽 컴포넌트 비노출 (`screen.queryByText("순손익액 = A − B")` === null)
- UI-2 (C-09): 안내 메시지 "순자산 단독 평가 (§165④3) — 순손익 산정 불필요" 표시
- UI-3 (C-10): full + isNetAssetOnly + isHeavyRE 시 가중치 안내 카드가 "단독 평가" 분기로 표시 (현행 EstimatedUnlistedBlock L121~124 그대로 재사용)
- UI-4: isNetAssetOnly OFF→ON→OFF 토글 시 NI 입력값 복원 (data persistence)

### 10-E. ~~선행 작업 anchor~~ [E-4 정정 — 삭제]
~~PRE-1: `calcNetAssetPerShare` 헬퍼 export 확인.~~ 실제 코드 검증 결과 `stock-valuation-post-listing.ts:106`에 이미 export됨 → **선행 작업 불필요**. v3에서 삭제.

---

## 11. 14 동기화 지점 체크리스트

| # | 지점 | 변경 |
|---|---|---|
| ① 폼 타입 | + `unlistedValuationMode` + 74 신규 필드 | YES |
| ② initial | 모두 `""` / mode = `"simple"` | YES |
| ③ normalize | enum·string field | YES |
| ④ API 변환 | full → flat-adapter reduce → 4 필드 채움 | YES |
| ⑤ UI 위젯 | RadioCardGroup + 신규 2 컴포넌트 | YES |
| ⑥ 사이드바 | [GAP-1 정정] StockSidebar는 NI/NA per-share를 직접 참조하지 않고 final result(transferIncome 등)만 사용 → **selector 신설 불필요**. EstimatedUnlistedBlock 자체 미리보기에서 `adaptUnlistedFlatToApiBody` 호출로 충분 (구현 완료) | NO (정정) |
| ⑦ 결과 카드 | (선택) "행-수준 계산 적용 (§54·§55)" 배지 | OPT |
| ⑧ validate | mode 분기 + 핵심 필드 필수 + fallback 3중 일치 | YES |
| ⑨ Zod enum 메인 | 변경 없음(엔진 input 동일) | NO |
| ⑩ Zod enum 컴패니언 | 변경 없음 | NO |
| ⑪ acquisitionDate fallback | 변경 없음 | NO |
| ⑫ Zod 입력 객체 | 변경 없음 (4 필드 그대로). 74 신규 필드는 body 미포함 [M-2] | NO |
| ⑬ callTransferTaxAPI body spread | 4 필드만 spread, 74 신규 필드 제외 [M-2] | NO |
| ⑭ Route handler 엔진 매핑 | 변경 없음 | NO |

→ **client-side 6 지점 + flat-adapter 1 변경 = 총 7 지점 작업**. 엔진/route/Zod 무변동. 신규 74 필드는 client adapter에서 4 필드로 reduce 후 body에 미포함 → Zod stripping/엔진 미도달 위험 0.

---

## 12. Phase 분할 [I-2 권장 — 2 PR 분리]

### PR-A: Store + Adapter + Selector + Unit Anchor (UI 미연결)

**[X-3 명시] PR-A의 anchor 범위는 엔진/adapter/selector unit test에 한정.** UI 통합 회귀(컴포넌트 렌더링·토글 동작·비노출 확인)는 PR-B에서 검증.

| Phase | 작업 | 추정 |
|---|---|---|
| A1. Plan/Design 검토 + KoreanLaw 검증 [M-5] | 본 계획서 합의 + 라벨 매트릭스 + col 타입 확장 명세 + §165④·상증령 §54·§55 영업권 적용성 검증 (KoreanLaw MCP) | 60분 |
| A2. Store ①②③ | 74 신규 필드 (NI 18×2=36 + NA 19×2=38) + `unlistedValuationMode` enum + factory + normalize | 25분 |
| A3. Adapter ④ | `unlisted-flat-adapter.ts` 신규 + `adaptUnlistedFlatToApiBody` + `calcNetIncomePerShare/calcNetAssetPerShare` import + isNetAssetOnly skip [E-5·E-6] + body 미포함 [M-2] | 30분 |
| A4. Sidebar selector ⑥ | `computeUnlistedPerShareSummary` 신규 + adapter 공유 + isNetAssetOnly 분기 [M-3·E-6] | 30분 |
| A5. Unit Test | EU-1~18, VU-1~4 = **22 anchor** (UI test 제외) | 100분 |
| **PR-A 합계** | | **~4시간** |

### PR-B: UI 연결 + Validate + 수동 확인

| Phase | 작업 | 추정 |
|---|---|---|
| B1. YearColumn export ⑤ [X-1] | PostListing 2 파일에서 `YearColumn` export + col 타입 generic화 + COL_LABEL 확장 | 30분 |
| B2. UI 신규 컴포넌트 ⑤ | EstimatedUnlistedBlock mode 토글 + thin wrapper 2 컴포넌트(~50줄 × 2) + isNetAssetOnly 비노출 분기 [E-6 (1)] + 안내 메시지 | 75분 |
| B3. Validate ⑧ | mode 분기 + fallback 3중 일치 + isNetAssetOnly 시 NI 검증 skip [E-6 (4)] | 25분 |
| B4. UI 통합 anchor [M-6] | UI-1~4 RTL 테스트 (비노출·안내 메시지·복원) | 30분 |
| B5. 브라우저 수동 확인 | simple↔full 토글, isNetAssetOnly 토글, 데이터 보존 [M-1], 미리보기 = adapter 일치, 사이드바 합계 표시 | 30분 |
| **PR-B 합계** | | **~3시간** |

**총 합계: ~7시간** ([E-4]로 30분 절감 + [E-6]·[M-5]·[M-6]·[I-3]로 1.5시간 증가).

PR 분리 효과(memory `flat-vs-nested-form-field-decision`): PR-A의 anchor가 PR-B UI 연결 후에도 그대로 동작 → 회귀 추적 명확화. PR-B에서 UI·validate만 검토하면 되므로 리뷰 부담 ↓.

---

## 13. 정책 사전 적용 (memory)

- **[mirror-pattern]** UI display = API fallback = validate fallback 3중 일치 (`unlistedValuationMode || "simple"`)
- **[useeffect-store-mirror-forbidden]** 계산 결과를 4 필드에 useEffect로 미러링 금지. **API 변환 시점**에서 reduce (이미 PostListing 패턴 검증됨)
- **[no-silent-apportion-fallback]** simple 모드 4 필드는 그대로 필수 검증. full 모드 74 필드도 핵심값 필수
- **[ui-input-path-enumeration]** simple/full × isNetAssetOnly true/false × isHeavyRE true/false = 8 케이스 매트릭스 사전 enumerate
- **[flat-vs-nested-form-field-decision]** 74 신규 필드는 Flat(UI) + Adapter(post-listing-flat-adapter 재사용) + Nested(엔진 input 변경 없음) 3-층 구조 그대로 차용
- **[ui-engine-dual-truth-avoidance]** UI 미리보기와 API 변환 모두 `calcNetIncomePerShare` / `aggregateNetAsset` 동일 엔진 헬퍼 import
- **[korean-law-82-vs-81-2-drift]** 환원율 라벨·hint는 "시행규칙 §81② → 상증령 §17" 인용 (PostListing 동일)

---

## 14. 결정 필요 사항 (사용자 확인)

1. **모드 토글 단위**: 양/취 동시(단일 토글) vs 양/취 분리(`unlistedValuationModeTransfer/Acq` 두 토글). **기본안: 단일 토글** — 시나리오 S-03은 향후 확장.
2. **col prefix**: ~~`Transfer/Acq` 공유~~ 폐기. **확정: `EUTransfer/EUAcq` 안전 분리** [E-1·E-2 정정에 따라 사용자 토글 부작용 차단 정당화 완료].
3. **YearColumn 재사용**: ~~신규 작성~~ 폐기. **확정: PostListing YearColumn export + col 타입 일반화 채택** [X-1 정정 — 법령상 동일 라벨이므로 강결합 평가 과대평가, 코드 중복 ~300줄 절약].
4. **Phase 분할 PR 수**: ~~단일 PR~~ 폐기. **확정: PR-A(Store+Adapter+Test) + PR-B(UI+Validate) 2 PR 분리** [I-2 — 회귀 추적·리뷰 부담 최적화].
5. **모드 enum 통합 vs 분리** [I-1 신규]: 기존 `unlistedDetailMode`(simple/listing_only/full) 재활용 vs 신규 `unlistedValuationMode`(simple/full) 분리. 
   - **통합안**: 비상장(`!isListed`) 컨텍스트에서 listing_only 옵션 비노출. 마이그레이션 영향 — PostListing 사용자가 비상장 종목으로 변경 시 store 값이 의미 다르게 해석될 위험.
   - **분리안 (기본)**: `unlistedValuationMode` 신규. 명명 중복 있지만 컨텍스트 독립 안전.
   - **권장**: 분리안 — 학습 부담은 hint 텍스트로 보완 가능.

---

## 15. 산출물

- `docs/02-design/features/stock-transfer-unlisted-direct-calc.plan.md` (본 문서 v2)
- (구현 후) `docs/02-design/features/stock-transfer-unlisted-direct-calc.engine.design.md` — flat-adapter 분기 + selector 명세
- (구현 후) `docs/02-design/features/stock-transfer-unlisted-direct-calc.ui.design.md` — UI 매트릭스 + 라벨 표 + col 타입 확장 영향

---

## 16. 정정 이력

### v2 (자체 검토 9건 반영)

| ID | 분류 | 정정 사항 | 반영 위치 |
|---|---|---|---|
| E-1 | 오류 | 분리 차원을 `acquiredBeforeListing` → `isListed` 정정 | §3-C |
| E-2 | 오류 | `Acq` 키 공유 부작용(isListed 토글 시 데이터 오염) 명시 + 안전 분리 정당화 | §3-C |
| E-3 | 오류 | ~~`calcNetAssetPerShare` 헬퍼 export 선행 작업 PRE-1 추가~~ → v3에서 E-4로 폐기 | (폐기) |
| M-1 | 누락 | simple↔full 토글 시 양쪽 데이터 보존 정책 | §3-A, EU-14 |
| M-2 | 누락 | API body에 74 신규 필드 미포함 명시 (Zod stripping 차단) | §5-A, §11-⑫⑬ |
| M-3 | 누락 | 사이드바 selector화(`computeUnlistedPerShareSummary`) | §8, §11-⑥, §12 A4 |
| M-4 | 누락 | 16 케이스 매트릭스 (mode × isHeavyRE × isNetAssetOnly × 환원율) | §10-A |
| X-1 | 모순 | YearColumn 재사용 채택 (신규 작성 결정 폐기) | §6-C, §12 B1, §14-3 |
| I-1 | 개선 | 모드 enum 통합 vs 분리 결정 사항 추가 | §14-5 |
| I-2 | 개선 | PR-A / PR-B 2 분할 채택 | §12, §14-4 |

### v3 (순자산 단독 평가 연동 + 헬퍼명 정정 8건)

| ID | 분류 | 정정 사항 | 반영 위치 |
|---|---|---|---|
| E-4 | 오류 | PRE-1 + Phase A0 삭제 (`calcNetIncomePerShare`/`calcNetAssetPerShare` 이미 export 확인) | §10-E, §12 A 표 |
| E-5 | 오류 | 헬퍼명 정정 — `aggregateNetIncome/Asset` → `calcNetIncomePerShare/calcNetAssetPerShare` + 신규 `adaptUnlistedFlatToApiBody` wrap | §5-A |
| E-6 | 오류 | **isNetAssetOnly 연동 5개 지점**(UI 비노출·adapter skip·selector 분기·validate skip·데이터 보존) 명시. `shouldSkipNetIncome` 단일 진실 추출 | §3-C, §5-A, §10-B EU-16~18, §10-C VU-4 |
| M-5 | 누락 | KoreanLaw MCP로 §165④ + 상증령 §54·§55 영업권 적용성 검증 (Phase A1 30분 추가) | §6-C, §12 A1 |
| M-6 | 누락 | C-09·C-10 UI 비노출·안내 메시지·데이터 복원 anchor UI-1~4 | §10-D, §12 B4 |
| X-2 | 모순 | "~300줄 절약" → "~150~200줄 절약" 정확화 | §6-C |
| X-3 | 모순 | PR-A의 anchor 범위는 "엔진/adapter/selector unit"으로 한정 명시 | §12 PR-A 헤더 |
| I-3 | 개선 | mode × isNetAssetOnly 상호작용 매트릭스 표 추가 | §10-A0 |

**v3 총 작업량**: ~7시간 (v2 6시간 대비 +1시간). E-6 (5개 지점 명시) + M-6 (UI anchor 4건) + M-5 (KoreanLaw 30분)이 주요 증가 요인.

**핵심 변경 (사용자 강조)**: 순자산 단독 평가 사유(`isNetAssetOnly === true`) 발생 시 **순손익 계산서(NI 24행)가 simple·full 양 모드에서 모두 비노출** + adapter NI 호출 skip + selector NI weight=0 + validate NI 검증 skip + store 데이터 보존(실수 토글 보호). 5개 지점을 단일 derive 함수 `shouldSkipNetIncome(form)`로 추출하여 이중 진실 차단.
