# 주식 양도소득세 PR-3 — UI 설계 (다자산 마법사·가산세 결과 카드)

> 작성일: 2026-05-19 (v1)
> 작성자: Claude (Opus 4.7)
> 부모: [`stock-transfer-pr3-multi-asset.engine.design.md`](./stock-transfer-pr3-multi-asset.engine.design.md)
> 계획서: [`docs/00-pm/stock-transfer-pr3.plan.md`](../../00-pm/stock-transfer-pr3.plan.md)

## Context

PR-3 잔여의 80%가 UI 작업 — 엔진은 commit `39fe7a9` (2026-05-19) 에서 다자산 합산·가산세 매트릭스 완료. 본 디자인은 **마법사 폼 상태 재구성 + 4단계 마법사 컨텍스트 + 결과 카드 분기**.

## 사용자 시나리오

### S-1 (Happy path) — 다종목 합산 신고

1. 사용자가 Step1 진입. **종목 목록 카드 영역 노출** (현재는 단건 직접 입력).
2. "종목 추가" 버튼으로 N건 추가. 각 종목 카드에 시장·종목명·양도주식수·양도일 미니 요약.
3. 종목 카드 [편집] 클릭 → Step1 본문이 해당 종목의 시장·메타 정보로 전환.
4. Step2 진입 → **활성 종목** 의 거래·평가 정보 입력. 헤더에 "현재 편집: {stockName}" sticky.
5. Step2 하단 [다음 종목 →] 으로 종목 순회. 모든 종목 입력 완료 후 Step3.
6. Step3 신고-단위 공통 필드(filingViolation·전자신고·역외거래) 1회 입력.
7. 결과: 합산 요약 카드 + 종목별 펼침 카드 + 신고서 양식 32행 표.

### S-2 — 단건 (현재 UX 보존)

1. 사용자가 Step1 진입. **종목 목록 영역이 자동으로 단일 종목만 표시** (stockItems.length === 1 + stockName === "").
2. "종목 추가" 버튼만 노출, 추가 시 시나리오 S-1로 전환.
3. 기존 단건 사용자는 UX 변화 없이 진행 — 결과 카드도 단건 모드.

### S-3 — 외국법인 발행 주식 (Case 21)

1. Step1 시장 라디오 그룹 아래 별도 disabled 카드 "외국법인 발행·해외 상장 주식 (선택 불가)" 노출.
2. 사용자가 카드 클릭 시 disabledReason 툴팁: "본 계산기 현재 미지원 — §94①3 다목".
3. 라디오 선택은 불가능. 본 카드는 **교육·안내용**.

### S-4 — 부정행위 가산세 (Case 25·26)

1. Step3 filingViolation 라디오 ("정상"·"과소신고"·"무신고") 선택.
2. 과소·무신고 선택 시 **부정행위** 토글(`isFraudulent`) 활성화.
3. 부정행위 ON 시 **역외거래** 토글(`isInternationalTransaction`) 활성화 (UI 라벨 "역외거래"로 표시 강제 — A2 정정).
4. 결과 카드 가산세 섹션에 적용율·근거조문 표시 (국세기본법 §47조의2 ①1호 / §47조의3 ①1호 가목).

## UI 명세

### 폼 상태 구조

```ts
// lib/stores/calc-wizard-stock-item.ts (신규 분리 파일 — 800줄 정책)
export interface StockItemForm {
  id: string;                            // uuid, UI 키
  stockName: string;                     // 종목명 (빈값 시 결과 카드 fallback "종목 N")
  marketType: "kospi" | "kosdaq" | "konex" | "unlisted" | "other_asset";
  // ... 종목-수준 필드 (현재 StockTransferFormData에서 종목-수준만 발췌 — ~80필드)
  acquisitionLots: AcquisitionLot[];
  transferLots: TransferLot[];
  // ...
}

// lib/stores/calc-wizard-stock-store.ts (확장)
export interface StockTransferFormData {
  // ────── 신고-단위 공통 (6 필드) ──────
  filingType: "preliminary" | "final" | "revised";
  filingDate: string;                    // YYYY-MM-DD (API에서 Date coerce)
  isElectronicFiling: boolean;
  filingViolation: "none" | "under_report" | "non_report";
  isFraudulent: boolean;
  isInternationalTransaction: boolean;
  realEstateGroupBasicDeductionUsed: number;

  // ────── 다종목 ──────
  stockItems: StockItemForm[];           // min 1, max ~50 (UX 제약)
  activeStockItemId: string;             // 현재 편집 종목 id (UI focus)
  deductionMode: "each_item" | "aggregate"; // 기본 "aggregate"
}
```

### Step1 컴포넌트 구조

```
┌─────────────────────────────────────────────────┐
│ Step 1 — 시장·종목 정보                          │
├─────────────────────────────────────────────────┤
│ [종목 목록 카드 영역 — N≥1 필수]                  │
│ ┌─────────────────────────────────────────────┐ │
│ │ ● 삼성전자 — KOSPI · 1,000주 · 2026-03-15    │ │
│ │ [편집] [복제] [삭제]                          │ │
│ └─────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────┐ │
│ │ ○ (주)예시바이오 — 비상장 · 5,000주 · ...   │ │
│ └─────────────────────────────────────────────┘ │
│ [+ 종목 추가]                                     │
│                                                  │
│ [기본공제 적용 방식 — stockItems.length ≥ 2 시] │
│  ◉ 합산 (aggregate, 권장) — 그룹별 §103① 250만 │
│     × 1회                                        │
│  ○ 종목별 (each_item) — 단건 보조 검증용         │
│                                                  │
│ ─── 활성 종목 편집: 삼성전자 ───────────────────  │
│ [기존 MarketTypeBlock — 5번째 disabled 카드 포함]│
│ [기존 SecurityMetadataBlock]                     │
│ ...                                              │
└─────────────────────────────────────────────────┘
```

### Step2 컴포넌트 구조

```
┌─────────────────────────────────────────────────┐
│ Step 2 — 거래·평가 (활성 종목)                   │
│ [sticky header — 다종목 시만]                    │
│   현재 편집: 삼성전자 (KOSPI 대주주)            │
│   [목록으로 ←]                  [다음 종목 →]    │
├─────────────────────────────────────────────────┤
│ [기존 Step2 모든 입력 — 활성 종목 컨텍스트]      │
│ - SplitLotsBlock / AcquisitionInfoBlock /        │
│   EstimatedUnlistedBlock / FaceValueBlock / ...  │
│                                                  │
│ → activeStockItemId 종목의 stockItems[i] 에      │
│   직접 read/write                                │
└─────────────────────────────────────────────────┘
```

### Step3 컴포넌트 구조 (변경 없음 — 신고-단위 공통)

기존 Step3 그대로. **추가 안내 카드 1개**:
```
┌──────────────────────────────────────────────┐
│ ⓘ 가산세는 신고서 1매 단위로 적용됩니다       │
│   (국세기본법 §47조의2 무신고 / §47조의3      │
│    과소신고). 다종목 신고 시 한 종목이라도    │
│    부정행위에 해당하면 합산 산출세액에        │
│    동일 가산세율 적용.                        │
└──────────────────────────────────────────────┘
```

### Step4 (결과) 구조

```
┌─ 합산 요약 카드 (다종목 시) ────────────────────┐
│ 종목 수 N개 / aggregate 모드                    │
│ 총 양도소득금액      XXX,XXX,XXX                │
│ 주식 그룹 기본공제 -2,500,000 (§103 ①2호)      │
│ 기타자산 그룹 기본공제 -2,500,000 (§103 ①1호)  │
│ 합산 과세표준        XXX,XXX,XXX                │
│ 합산 산출세액        XXX,XXX,XXX                │
│ + 신고불성실 가산세  XXX,XXX                    │
│ - 전자신고 세액공제 -20,000 (§52의2)            │
│ 합산 결정세액         XXX,XXX,XXX               │
│ 합산 지방소득세       XX,XXX,XXX                │
└────────────────────────────────────────────────┘

┌─ 종목별 상세 (1/N) — 펼침 ──────────────────────┐
│ ▶ 삼성전자 (KOSPI 대주주)                       │
│   양도가 X / 취득가 Y / 차익 Z                  │
└────────────────────────────────────────────────┘
...

┌─ 가산세 섹션 (filingViolation ≠ "none" 시) ─────┐
│ 신고불성실 가산세                                │
│   분기: 과소신고 또는 무신고                     │
│   적용율: 40% / 60% (역외)                       │
│   근거: 국세기본법 §47조의3 ①1호 가목 / §47조의2 ①1호 │
│   산식: 과소신고납부세액등 × 40% (산출세액 ≠)   │
│   금액: XXX,XXX                                  │
└────────────────────────────────────────────────┘

┌─ 신고서 양식 32행 (StockFilingFormTable) ───────┐
│ [aggregate prop 활성 — isMulti header]          │
│ 다자산 합산 (2종목)                              │
│ 합계 / 삼성전자 / 예시바이오                     │
│ ...                                              │
└────────────────────────────────────────────────┘

┌─ 증권거래세 시장별 카드 (정보성, 종목별) ───────┐
│ 삼성전자 (KOSPI) — 0.15%                        │
│ 예시바이오 (비상장) — 0.35%                      │
└────────────────────────────────────────────────┘

┌─ 구현 로드맵 카드 ──────────────────────────────┐
│ PR-1 ✅ / PR-2 ✅ / PR-3 ✅ / 후속 ← current     │
└────────────────────────────────────────────────┘
```

## 14개 동기화 지점 (Definition of Done)

| # | 지점 | 위치 | 변경 내역 |
|---|---|---|---|
| ① | 폼 상태 타입 | `calc-wizard-stock-item.ts` 신규 + `calc-wizard-stock-store.ts` 확장 | `StockItemForm` + `stockItems[]` + `activeStockItemId` + `deductionMode` 신설 |
| ② | initial value | `createInitialStockFormData()` | `stockItems: [createInitialStockItem()]` 1건 (단건 호환) |
| ③ | normalize fallback | `calc-wizard-stock-normalize.ts` | legacy 단건 폼 → items[0] 마이그레이션 (MIG-01) |
| ④ | API 변환 | `lib/calc/stock-transfer-tax-api.ts` | `toAPIPayload(form)` — items.length === 1 시 단건 path 유지, ≥ 2 시 `{items, deductionMode}` 래퍼. 신고-단위 6필드 모든 items 전사 |
| ⑤ | UI 입력 위젯 | Step1 `StockItemsList` + `StockItemCard` + Step2 `ActiveItemHeader` | 신규 |
| ⑥ | 사이드바 합계 | `StockSidebar.tsx` | 다종목 분기 — 종목별 누적 + result aggregate 값 |
| ⑦ | 결과 카드 산식 | `StockTransferTaxResultView.tsx` | `AggregateResultView` 분기 + 가산세 라벨 + 로드맵 카드 갱신 |
| ⑧ | Validation | `lib/calc/stock-transfer-tax-validate.ts` | 종목별 + 합산 (§5 spec) |
| ⑨ | Zod enum 메인 | (변경 없음) | `items` array 기존 |
| ⑩ | Zod enum 컴패니언 | N/A | — |
| ⑪ | acquisitionDate fallback | (변경 없음) | 종목별 독립 |
| ⑫ | Zod 입력 객체 정의 | (변경 없음) | `stockTransferInputSchema.array()` 기존 |
| ⑬ | callAPI body spread | `lib/calc/stock-transfer-tax-api.ts` | 단건/다자산 분기 spread |
| ⑭ | Route handler 엔진 매핑 | (변경 없음) | route L66 `"items" in body` 자동 분기 + `coerceDates` |

→ ⑨~⑫⑭ 변경 없음. **TypeScript 침묵 stripping 위험 0** (기존 Zod array 활용).

## 컬러 토큰 / 입력 컴포넌트 규칙 (CLAUDE.md 준수)

| 영역 | 토큰 | 용도 |
|---|---|---|
| 종목 목록 카드 — 활성 | `sky` | 현재 편집 종목 ring + tone |
| 종목 목록 카드 — 비활성 | `slate` | 비활성 카드 (탭으로 활성 전환) |
| 외국법인 disabled 카드 | `rose` | 미지원 안내 (Case 21) |
| 가산세 결과 카드 (filingViolation ≠ none) | `amber` | 경고 톤 |
| 역외거래 부정 (60%) | `rose` | 최고 가중치 강조 |
| 로드맵 PR-3 completed | `emerald` | 완료 상태 |
| 로드맵 후속 current | `sky` | 진행 상태 |

- 토글/라디오: 모두 `RadioCardGroup` / `ToggleCard` 사용. native input 금지.
- 종목 추가 버튼: `Button variant="outline" tone="sky"`.
- "종목 N" fallback: 결과 카드·사이드바·신고서 양식 헤더 3곳 동일 함수 — `getStockDisplayName(item, index)`.

## 실패 시나리오 (Error Handling)

| 시나리오 | 처리 |
|---|---|
| `stockItems.length === 0` (정상 진행 차단) | Step1 진입 시 자동으로 `createInitialStockItem()` 1건 추가 (initial value 보장) |
| `activeStockItemId` 가 stockItems에 없음 | Step 진입 시 자동으로 `stockItems[0].id` 로 fallback (A8 — useEffect 금지, 진입 시점 1회 확인) |
| 종목 삭제 후 active 사라짐 | `removeStockItem(id)` action 내부에서 `activeStockItemId = stockItems[0].id` 보장 |
| Step2 진입 시 활성 종목 marketType 미선택 | validate ⑧ 차단 — "활성 종목의 시장을 먼저 선택하세요" + Step1 이동 버튼 |
| 종목 ≥ 2 + specificMatching 모드 선택 시도 | UI 모드 토글 자체 disabled + Zod refine ("다종목 신고 시 specific 모드는 지원되지 않습니다") |
| 외국법인 disabled 카드 클릭 시 | disabledReason 툴팁 + 라디오 선택 불가 (no-op) |

## anchor 약속 (UI 측)

| ID | 위치 | 시나리오 |
|---|---|---|
| C21-02 | `case-21-foreign-card.test.tsx` (신규) | Step1 렌더 → "본 계산기 현재 미지원" + "§94①3 다목" 텍스트 RTL |
| CR-25-01 | `case-25-26-result.test.tsx` (신규) | filingViolation=under_report + isFraudulent → "40%" + "국세기본법 §47조의3 ①1호 가목" 텍스트 |
| CR-25-02 | 동상 | filingViolation=non_report + isFraudulent → "40%" + "국세기본법 §47조의2 ①1호" |
| CR-26-01 | 동상 | + isInternationalTransaction → "60%" + "§47조의3 ①1호 가목 괄호" |
| CR-26-02 | 동상 | non_report + 부정 + 역외 → "60%" + "§47조의2 ①1호 괄호" |
| MA-06-03 | `stock-filing-form-multi.test.tsx` (신규) | aggregate prop 2종목 → 헤더에 stockName 또는 "종목 1"/"종목 2" fallback |
| MIG-01 | `stock-form-migration.test.ts` (신규) | legacy 단건 sessionStorage 형식 → normalize → `stockItems: [{...legacyFields}]` |
| UX-01 | `stock-add-remove.test.tsx` (신규) | 종목 추가 후 activeStockItemId 자동 전환 + 삭제 후 fallback |

## Out of scope (후속 PR)

- 다종목 specificMatching 모드 지원
- `isInternationalTransaction` → `isOffshoreTransaction` 필드명 rename
- §94①3 다목 외국법인 발행 주식 엔진 지원
- 다종목 모드 양도손실 통산 (현재는 그룹별 기본공제 한정)
- Playwright 자동 회귀

## v1 자가 검토 — 정정 사항 (D-1 ~ D-6, 2026-05-19)

### D-1: zustand partialize — `result` 제외 명시

[[feedback-zustand-selector]] / CLAUDE.md "Zustand 마법사 Store" 규칙: `result` 필드는 partialize 제외 (민감정보 + Date 직렬화 문제). 본 PR-3에서 **`stockItems[]` · `activeStockItemId` · `deductionMode` 는 sessionStorage 보존 대상** (UI 상태). `result` 만 제외 — store 정의 시 `partialize: ({result, ...rest}) => rest` 패턴 유지.

### D-2: `getStockDisplayName()` helper 시그니처 명시

3곳(결과 카드 · 사이드바 · 신고서 양식 헤더)에서 동일 fallback. **단일 진실** 원천:

```ts
// lib/calc/stock-display-name.ts (신규)
export function getStockDisplayName(
  item: StockItemForm | StockTransferInput | undefined,
  index: number,
): string {
  const name = (item?.stockName ?? "").trim();
  return name || `종목 ${index + 1}`;
}
```

- 입력 `item` 이 undefined이어도 안전 (배열 인덱스 외 접근 안전망)
- 인덱스는 0-based이므로 사용자 표시 `+1`
- API result (`StockTransferResult` items[])·폼(`StockItemForm`) 둘 다 호환

### D-3: Engine ↔ UI design Out of scope 동기화

후속 PR 항목 두 디자인 모두 동일 5건 (D-1 정정 후):

1. 다종목 specificMatching 모드 지원
2. `isInternationalTransaction` → `isOffshoreTransaction` 필드명 rename
3. §94①3 다목 외국법인 발행 주식 엔진 지원
4. §126의3 국외전출세
5. 디자인 부모 문서 §70 `소득세법 §47의2·§47의4` → 국세기본법 정정 (디자인-only PR)

→ Engine design 의 Cross-cutting / 후속 5건과 본 UI design Out of scope 5건 일치 확인. Playwright 자동 회귀는 본 PR-3 자체 후속(테스트 인프라 보강).

### D-4: `filingDate` string → Date coerce 위치 명시

API adapter (`lib/calc/stock-transfer-tax-api.ts`) 의 `toAPIPayload()` 는 **변환하지 않음** — `filingDate: string` 그대로 전송. Route handler (`app/api/calc/stock-transfer/route.ts`) 의 `coerceDates(body, [...])` 가 `filingDate` 를 포함하여 string → Date 변환. **다자산 분기에서도 동일** — route L66 분기 후 `items.forEach(it => coerceDates(it, ["acquisitionDate", "transferDate", "priorYearEndDate", "listingDate", "filingDate"]))` 호출 보장.

→ 본 PR-3 본문 변경: route handler aggregate 분기 내부에 `items.map(coerceDates)` 호출 추가 (기존 단건 path는 이미 호출 중). 이는 ⑭ 동기화 지점 정정 — **앞서 "변경 없음"으로 표기한 부분 정정**.

### D-5: 로드맵 카드 트리거 조건

`PrRoadmapCard` (`StockTransferTaxResultView.tsx:664`) 의 PR-3 status 변경은 **본 PR-3-c PR의 동일 commit** 에서 수행. 별도 commit 분리 금지 — anchor 통과(CR-25/CR-26 + MA-06 + MIG-01) 직후 카드 상태 갱신 commit 1개로 PR-3 완료 신호화.

### D-6: `cloneStockItem(id)` action 명세

종목 [복제] 버튼 동작:

```ts
// store action
function cloneStockItem(state, id: string) {
  const src = state.stockItems.find(it => it.id === id);
  if (!src) return;
  const cloned = {
    ...structuredClone(src),
    id: nanoid(),
    stockName: src.stockName ? `${src.stockName} (사본)` : "",
  };
  state.stockItems.push(cloned);
  state.activeStockItemId = cloned.id;
}
```

- structuredClone — 중첩 `acquisitionLots[]`·`transferLots[]` 깊은 복사 보장
- nanoid — 새 id (lot id는 종목 내 컨텍스트이므로 변경 불요)
- 복제 직후 activeStockItemId 자동 전환 (UX 일관성)

### D-7: `realEstateGroupBasicDeductionUsed` cross-domain 안내 (추가)

§103 ①1호 그룹(부동산·부동산권리·기타자산) 250만 한도는 **동일 거주자·동일 과세기간** 단위로 양도세 신고 전체에 적용. 사용자가 부동산 마법사에서 250만 이미 사용했다면 stockItems 의 기타자산 그룹 공제는 0.

→ Step3 안내 카드(`SectionHeader` 펼침):
```
ⓘ 동일 과세기간 내 부동산 마법사에서 §103 ①1호 그룹
   기본공제를 이미 사용했다면 아래에 사용 금액을 입력하세요
   (기타자산 그룹 공제 한도가 차감됩니다).

   부동산 그룹 기본공제 기사용액  [______ 원]
```

- `realEstateGroupBasicDeductionUsed` 필드 (현재 form-전역 — 변경 없음)에 직접 매핑
- 주식 그룹(§103 ①2호)에는 영향 없음 — 별도 그룹
- anchor 신규 **MA-08**: `realEstateGroupBasicDeductionUsed = 2,500,000` + 기타자산 종목 1개 + 주식 종목 1개 → 기타자산 그룹 공제 0 / 주식 그룹 공제 2,500,000 (§103 그룹 독립성 검증)
