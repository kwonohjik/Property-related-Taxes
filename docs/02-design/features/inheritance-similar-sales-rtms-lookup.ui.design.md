# 아파트 유사매매사례가액 RTMS 자동조회 — UI 설계 문서

**파일**: `docs/02-design/features/inheritance-similar-sales-rtms-lookup.ui.design.md`
**작성일**: 2026-06-13
**담당**: inheritance-gift-tax-ui-senior
**관련 엔진 설계**: `property-valuation-senior` 병렬 작성 (엔진 입출력 계약 §7 참조)
**관련 스킬**: `history-lookup-modal` (4-레이어 아키텍처 준수)

---

## 0. 개요 및 배경

현재 `EstateBodyRealEstate.tsx:387-394`에서 `similarSalesValue`(유사매매사례가액)는 CurrencyInput을 통한 수동 입력만 지원한다. 사용자는 국토교통부 실거래가 공개시스템(RTMS)에서 직접 사례를 찾아 금액을 입력해야 한다.

이 기능은 아파트(`category === "real_estate_apartment"`) 자산 카드에서 "유사 매매사례 자동조회" 버튼을 추가하고, 모달에서 RTMS 데이터를 조회·필터링하여 후보를 제시한 후 사용자가 선택하면 `similarSalesValue`를 자동으로 채워주는 입력 보조 기능이다.

핵심 법령 요건:
- 상증법 시행령 §49④: 유사매매사례가액은 면적·용도·기준시가가 유사한 다른 재산의 매매가
- 상증법 시행규칙 §15①: 면적 ±5%, 공시가격 ±20% 이내 (§15의3 준용 기준)
- 상증법 시행령 §49②: "평가기준일에 가장 가까운 날에 해당하는 가액" 우선
- 평가기간: 상속(전후 6개월), 증여(전 6개월 ~ 후 3개월)
- §49①1호 가목: 특수관계 거래는 시가로 불인정 — UI에서 자동 판별 불가이므로 경고 표시 필수

**자동 1건 확정 금지**: 법령상 사용자가 선택해야 하며, 엔진도 추천만 하고 자동 채우지 않는다.

---

## 1. 사용자 시나리오

### 시나리오 A — 정상 조회 (후보 있음)

1. 사용자가 아파트 자산 카드에서 주소 검색 완료 (단지명·PNU 확보).
2. "매매사례가액(유사매매사례)" ToggleCard를 ON으로 전환.
3. CurrencyInput 옆 "자동조회" 버튼 클릭.
4. 모달 오픈 — 대상 아파트 정보(단지명·전용면적·기준시가) 표시.
5. RTMS API 호출 → 후보 거래 리스트 렌더.
6. §49② "평가기준일에 가장 가까운 날" 기준 추천 행이 배지로 강조.
7. 사용자가 원하는 행 선택(단건) 또는 복수 선택 후 평균 계산.
8. "이 금액으로 채우기" 버튼 → 모달 닫힘.
9. CurrencyInput에 선택한 거래금액 채워짐 + "RTMS 자동조회" 출처 배지 표시.
10. 엔진 호출 시 `similarSalesValue`가 전달되어 평가방식 `similar_sales`로 결정.

### 시나리오 B — 후보 없음

1~4 동일.
5. RTMS API 호출 → 면적·공시가격 조건 통과 후보 0건.
6. 모달에 "조건을 만족하는 유사 매매사례가 없습니다" 안내 + 조회 조건 표시.
7. "직접 입력" 버튼 → 모달 닫힘, CurrencyInput으로 수동 입력.

### 시나리오 C — 환경 미설정 (env 누락)

1. 자산 카드 렌더 시 자동조회 버튼이 비활성 상태로 표시.
2. 버튼에 "공공데이터포털 서비스키 미설정" 안내 표시 (tooltip/disabled reason).
3. 기존 CurrencyInput 수동 입력은 정상 유지.

### 시나리오 D — 주소 미입력

1. 주소 검색을 완료하지 않은 상태에서 버튼 클릭.
2. 버튼이 비활성 상태 + "주소를 먼저 입력해주세요" 안내.

### 시나리오 E — 자동채움 후 수동 수정

1. 시나리오 A 완료 후 "RTMS 자동조회" 출처 배지 표시.
2. 사용자가 CurrencyInput 금액을 직접 수정.
3. onChange 발동 → `similarSalesSource` 필드가 `undefined`로 리셋.
4. 출처 배지 제거.

---

## 2. 모달 와이어프레임 (텍스트)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  유사 매매사례 자동조회                                    [X 닫기]      │
│  상속세 및 증여세법 시행령 §49④ — 면적·용도·기준시가 유사 매매사례      │
├─────────────────────────────────────────────────────────────────────────┤
│  [대상 아파트 정보 섹션 — sky 색상 카드]                                 │
│   단지명     서울시 서초구 반포동 래미안반포팰리스                         │
│   전용면적   84.00 ㎡                                                   │
│   공시가격   1,250,000,000원                                             │
│   기준일     2025-01-01 (평가기준일)                                     │
│   조회범위   2024-07-01 ~ 2025-07-01 (상속: 전후 6개월)                  │
│                                                                         │
│  [조회 조건 요약 — amber 색상 칩]                                        │
│   면적 79.80 ~ 88.20 ㎡ | 공시가격 1,000,000,000 ~ 1,500,000,000원      │
├─────────────────────────────────────────────────────────────────────────┤
│  [후보 리스트]                                              4건 조회     │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ ★ 추천  | 8층  | 84.00㎡ | 2024-12-15 | 면적차이 0.0%          │   │
│  │  거래금액  2,150,000,000원                    | 공시가격차이 2.1% │   │
│  │  [평가기간 내] [§49② 가장 가까운 날]                            │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │   선택 □ | 12층 | 84.00㎡ | 2024-09-20 | 면적차이 0.0%         │   │
│  │  거래금액  2,100,000,000원                    | 공시가격차이 2.1% │   │
│  │  [평가기간 내]                                                   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │   선택 □ | 5층  | 83.65㎡ | 2024-08-05 | 면적차이 −0.4%        │   │
│  │  거래금액  2,050,000,000원                    | 공시가격차이 4.8% │   │
│  │  [평가기간 내]                                                   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  ⚠ 특수관계 거래 여부는 자동 판별 불가합니다. §49①1호 가목에 따라 특수  │
│    관계인과의 거래는 시가로 인정되지 않을 수 있습니다.                    │
│    해당 거래 선택 전 관계 여부를 반드시 확인하세요.                       │
├─────────────────────────────────────────────────────────────────────────┤
│  복수 선택 시: 2,100,000,000원 (선택 1건 평균)                           │
│                              [취소]  [이 금액으로 채우기]                 │
└─────────────────────────────────────────────────────────────────────────┘
```

**후보 없음 상태:**
```
│  [후보 없음 안내]                                                        │
│  조건을 만족하는 유사 매매사례가 없습니다.                                │
│  조회 조건: 면적 79.80~88.20㎡ · 공시가격 1,000,000,000~1,500,000,000원 │
│            평가기간 2024-07-01 ~ 2025-07-01                              │
│                                      [닫기]  [직접 입력]                 │
```

**로딩 상태:**
```
│  [스피너] 국토교통부 실거래가를 조회하고 있습니다...                       │
│  [카드 skeleton 3장]                                                     │
```

---

## 3. 컴포넌트 트리

```
EstateBodyRealEstate.tsx
└── (apartment 카드 내부 — category === "real_estate_apartment" 시만)
    └── ToggleCard(tone="emerald", "매매사례가액")
        ├── CurrencyInput (기존 — similarSalesValue 수동 입력)
        ├── RtmsSimilarSalesButton (신규 인라인 버튼)
        │     조건: hasAddress && isEnvConfigured
        │     disabled: !hasAddress || !isEnvConfigured
        │     disabledReason: 각 조건별 안내
        └── SimilarSalesBadge (신규 — similarSalesSource 있을 때)

components/calc/inheritance/estate-card/variants/
└── RtmsSimilarSalesModal.tsx (신규 ~350 LOC)
    ├── Dialog (BaseUI)
    ├── AptInfoSection (대상 아파트 정보 카드 — sky tone)
    ├── FilterConditionChips (조회 조건 배지 — amber tone)
    ├── 5-상태 분기
    │   ├── LoadingState (스피너 + skeleton)
    │   ├── ErrorState (재시도 버튼)
    │   ├── EmptyState (후보 없음 안내 + 직접입력 CTA)
    │   ├── CandidateList (후보 카드 리스트)
    │   │   └── SimilarSalesRow x N (추천 배지·면적차이·공시가격차이·평가기간 배지)
    │   └── LegalWarningBanner (§49①1호 가목 특수관계 경고 — 후보 있을 때 항상)
    └── ModalFooter (선택 평균 표시 + 채우기 버튼)

lib/calc/
└── rtms-similar-sales-lookup.ts (신규 ~180 LOC — Mediator)
    ├── fetchRtmsSimilarSales(params) → Promise<RtmsSalesRecord[]>
    │   (내부: /api/address/apt-trade 호출 + Dexie 캐시)
    ├── filterSimilarSalesLocal(records, criteria) → FilterResult
    │   (면적±5%·공시가격±20%·평가기간 필터 — 순수 함수)
    ├── rankByClosestDate(candidates, baseDate) → RankedCandidate[]
    │   (§49② 가장 가까운 날 정렬 — 추천 행 결정)
    └── averageAmount(candidates) → number

app/api/address/
└── apt-trade/route.ts (신규 — RTMS API 프록시, 엔진 시니어 담당)
```

---

## 4. 상태 흐름

```
EstateBodyRealEstate 로컬 state:
  [modalOpen: boolean]           — 모달 열림 여부
  [similarOpen: boolean]         — ToggleCard ON/OFF (기존)

모달 내부 state:
  [status: "idle" | "loading" | "error" | "empty" | "ready"]
  [candidates: RankedCandidate[]]
  [selectedIds: Set<string>]     — 복수 선택 (단건도 Set으로 통일)
  [error: string | undefined]

자동채움 흐름:
  1. 모달 open → status="loading"
  2. fetchRtmsSimilarSales({aptName, area, pnu, evaluationDate, mode}) 호출
  3. filterSimilarSalesLocal(records, criteria) 적용
  4. candidates.length === 0 → status="empty"
     candidates.length > 0  → status="ready", rankByClosestDate
  5. 사용자 행 선택 → selectedIds toggle
  6. "이 금액으로 채우기" 클릭:
     - amount = averageAmount(selected)
     - onSelect({ amount, source: "rtms_auto" }) 콜백
  7. 부모(EstateBodyRealEstate):
     - set({ similarSalesValue: amount })          // 기존 엔진 필드
     - set({ similarSalesSource: "rtms_auto" })    // 신규 메타 필드 (§8 동기화 지점)
     - setSimilarOpen(true)                         // ToggleCard 자동 ON
     - setModalOpen(false)

수동 수정 감지 (mirror-pattern 준수 — useEffect 금지):
  CurrencyInput onChange:
    (v) => {
      set({ similarSalesValue: parseAmount(v) || undefined });
      // 출처 배지 제거 — useEffect 미러링 금지, onChange에서 직접 처리
      if (item.similarSalesSource) set({ similarSalesSource: undefined });
    }
```

---

## 5. 신규 폼 상태 필드 (클라이언트 8개 동기화 지점)

### 5.1 ① 폼 상태 타입 변경 — `EstateItem` 확장

`lib/tax-engine/types/inheritance-gift.types.ts`의 `EstateItem` 인터페이스에 신규 필드 1개 추가:

```typescript
/**
 * 유사매매사례가액 자동조회 출처 메타 — UI 전용, 엔진 무시.
 * "rtms_auto": 국토부 RTMS 자동조회로 채워진 값
 * undefined: 사용자 직접 입력 (기본)
 *
 * similarSalesValue를 사용자가 수동 수정하면 자동으로 undefined로 리셋.
 */
similarSalesSource?: "rtms_auto";
```

**영향 범위**: 엔진은 이 필드를 무시한다. 평가 로직(`resolveValuationMethod`)은 `similarSalesValue > 0` 여부만 본다. `similarSalesSource`는 순수한 UI 메타이다.

### 5.2 ② initial value

`createInitialEstateItem()` 또는 `EstateItem` 팩토리 함수에서:

```typescript
similarSalesSource: undefined,  // 초기값 미설정 (배지 없음)
```

위치: `EstateItem` 초기값이 생성되는 곳 (`createEstateItem` 또는 `makeInitialEstateItem`).

**실측 확인 필요**: 해당 팩토리 함수의 정확한 파일 경로는 Do 단계에서 `Grep("createEstateItem|makeInitialEstateItem")`으로 확인 후 기입.

### 5.3 ③ normalize fallback

`similarSalesSource`는 optional 문자열 열거형이므로 sessionStorage 마이그레이션 시 `undefined`로 안전하게 처리된다. 별도 normalize 로직 불필요.

단, `normalizeEstateItem` 또는 동등 함수가 있다면 `unknown` source 값을 `undefined`로 정규화하는 가드 추가:

```typescript
similarSalesSource:
  item.similarSalesSource === "rtms_auto" ? "rtms_auto" : undefined,
```

### 5.4 ④ API 변환 — `lib/calc/inheritance-api.ts` body spread

`callInheritanceTaxAPI`의 body에서 `estateItems`가 그대로 전달된다(`body.estateItems: input.estateItems`). `EstateItem` 배열이 통째로 직렬화되므로 `similarSalesSource`가 자동으로 포함된다.

엔진 측 Zod 스키마에서 `similarSalesSource`를 optional 로 받도록 해야 하며 (엔진 시니어 담당), 엔진 내부에서는 이 필드를 무시한다.

**API 변환 측 strip**: 엔진이 무시하는 메타 필드이므로 클라이언트 단에서 strip할 필요는 없다. 단, 엔진 Zod가 unknown 필드를 reject할 경우 `estateItems.map(({ similarSalesSource: _, ...rest }) => rest)` 패턴으로 strip 추가.

### 5.5 ⑤ UI 입력 위젯

**진입점**: `EstateBodyRealEstate.tsx` 내 "매매사례가액" ToggleCard (라인 379-394).

변경 전:
```tsx
<ToggleCard tone="emerald" ...>
  <CurrencyInput ... onChange={(v) => set({ similarSalesValue: parseAmount(v) || undefined })} />
</ToggleCard>
```

변경 후:
```tsx
<ToggleCard tone="emerald" ...>
  <div className="flex items-center gap-2">
    <div className="flex-1">
      <CurrencyInput
        ...
        onChange={(v) => {
          set({ similarSalesValue: parseAmount(v) || undefined });
          // 수동 수정 시 출처 배지 제거 (useEffect 미러링 금지)
          if (item.similarSalesSource) set({ similarSalesSource: undefined });
        }}
      />
    </div>
    {/* 아파트 자산 전용 자동조회 버튼 */}
    {cat === "real_estate_apartment" && (
      <RtmsSimilarSalesButton
        disabled={!hasAddress || !isRtmsConfigured}
        disabledReason={
          !isRtmsConfigured
            ? "공공데이터포털 서비스키 미설정 (RTMS_SERVICE_KEY 환경변수)"
            : "소재지를 먼저 입력해주세요"
        }
        onClick={() => setModalOpen(true)}
      />
    )}
  </div>
  {/* 자동조회 출처 배지 */}
  {item.similarSalesSource === "rtms_auto" && (
    <SimilarSalesBadge onClear={() => set({ similarSalesSource: undefined })} />
  )}
</ToggleCard>
```

**활성화 조건**:
- `cat === "real_estate_apartment"` (아파트 전용 — 토지·건물은 조회 불가)
- `item.estateAddress?.pnu` 또는 `item.estateAddress?.jibun` 존재 (주소 입력 여부)
- 서버 env `RTMS_SERVICE_KEY` 설정 여부 → 클라이언트에서 `/api/address/apt-trade?healthcheck=1` 호출 또는 별도 env flag로 확인

**모달 마운트**:
```tsx
{modalOpen && (
  <RtmsSimilarSalesModal
    open={modalOpen}
    onOpenChange={setModalOpen}
    aptAddress={item.estateAddress}
    aptAreaSqm={item.areaSqm}
    standardPrice={item.standardPrice}
    evaluationDate={valuationDate}  // 상속개시일 또는 증여일
    mode={mode}  // "inheritance" | "gift"
    onSelect={({ amount }) => {
      set({ similarSalesValue: amount, similarSalesSource: "rtms_auto" });
      setSimilarOpen(true);
      setModalOpen(false);
    }}
  />
)}
```

### 5.6 ⑥ 사이드바 합계

`similarSalesSource`는 합계 계산에 영향 없다. 사이드바는 `resolveValuationMethod(item)` → `similar_sales` 결과에 따른 `valuatedAmount`를 표시하며, 이 로직은 이미 `similarSalesValue > 0`이면 `similar_sales`를 반환하도록 구현되어 있다(`property-valuation.ts:61`).

추가 사이드바 변경 없음.

### 5.7 ⑦ 결과 카드 산식

`InheritanceTaxResultView.tsx` 또는 관련 결과 카드에서 자산별 평가방식 표시 시:

- 평가방식 `similar_sales`이면 "매매사례가액 (유사매매사례, 시행령 §49④)" 레이블
- `similarSalesSource === "rtms_auto"`이면 "(RTMS 자동조회)" 표기 추가 (선택 사항 — 설계 선택)

결과 카드 Table A "비고" 열에는 기존 `resolveValuationMethod(item)` 기반 표시(`item.valuationMethod ?? resolveValuationMethod(item)` 패턴, `inheritance-gift.types.ts:246-247`)를 그대로 사용한다. `similarSalesSource`가 있더라도 평가방식 레이블은 동일하다.

### 5.8 ⑧ Validation — `lib/calc/inheritance-validate.ts`

`similarSalesSource`는 UI 메타 필드이므로 validation에서 검증하지 않는다.

단, validate에서 `similarSalesValue`의 존재 여부로 판단하는 로직이 있다면 기존과 동일하게 동작한다. `similarSalesSource` 여부로 validation 분기를 추가하지 않는다.

---

## 6. 엔진에 요구하는 입출력 계약

아래는 UI 설계가 소비해야 할 엔진 측 계약이다. `property-valuation-senior`가 이를 충족하는 API를 설계해야 한다.

### 6.1 신규 라우트: `GET /api/address/apt-trade`

**요청 파라미터:**

| 파라미터 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `aptName` | string | 권장 | 단지명 (RTMS 필터링) |
| `jibun` | string | 조건부 | 지번 주소 (aptName 없을 때 단지 특정용) |
| `pnu` | string | 조건부 | 19자리 PNU (가장 정확한 단지 특정) |
| `sigunguCode` | string | 필수 | 5자리 시군구코드 (RTMS API 파라미터) |
| `dongCode` | string | 선택 | 읍면동코드 |
| `year` | number | 필수 | 조회 연도 (YYYY) |
| `month` | number | 필수 | 조회 월 (1-12) |

UI는 `pnu`, `sigunguCode`, `evaluationDate`를 보유하므로 이를 기반으로 파라미터를 구성한다.

**응답 타입 (UI가 요구하는 필드 — 최소 집합):**

```typescript
export interface RtmsSalesRecord {
  /** 단지명 */
  aptName: string;
  /** 전용면적 (㎡, 소수 포함) */
  excluUseAr: number;
  /** 거래금액 (원, 정수) */
  dealAmount: number;
  /** 거래일 (YYYY-MM-DD — UI에서 Date 비교용) */
  dealDate: string;
  /** 층 */
  floor: number;
  /** 건축연도 (YYYY) */
  buildYear: number;
}

export interface RtmsAptTradeResponse {
  success: boolean;
  records: RtmsSalesRecord[];
  /** API 호출 오류 메시지 (success=false 시) */
  error?: string;
  /** env 미설정 여부 — 클라이언트 비활성화 판단용 */
  configMissing?: boolean;
}
```

### 6.2 순수 필터 함수: `filterSimilarSales(records, criteria)`

`lib/tax-engine/property-valuation.ts` 또는 `lib/calc/rtms-similar-sales-lookup.ts`에 위치. UI는 이 함수를 Mediator에서 호출한다.

**요구 입력:**

```typescript
export interface SimilarSalesFilterCriteria {
  /** 대상 자산 전용면적 (㎡) */
  targetAreaSqm: number;
  /** 대상 자산 공시가격 (원) — 기준시가 (표준공시가격) */
  targetStandardPrice: number;
  /** 평가기준일 (상속개시일 / 증여일) */
  evaluationDate: Date;
  /** 세목 모드 — 평가기간 계산에 사용 */
  mode: "inheritance" | "gift";
}
```

**요구 출력:**

```typescript
export interface SimilarSalesCandidate {
  record: RtmsSalesRecord;
  /** 면적 차이율 (%, 양수) */
  areaDiffPct: number;
  /** 공시가격 차이율 (%, 양수) */
  stdPriceDiffPct: number;
  /** 평가기간 내 여부 */
  isWithinPeriod: boolean;
  /** §49② 기준 평가기준일까지 거리 (일, 정수) */
  daysFromEvaluationDate: number;
  /** §49② 추천 여부 — rankByClosestDate가 결정 */
  isRecommended: boolean;
}

export interface SimilarSalesFilterResult {
  /** 조건 통과 후보 (면적±5% + 공시가격±20% + 평가기간 내) */
  candidates: SimilarSalesCandidate[];
  /** 평가기간 외 거래 (참고용 — UI에서 별도 섹션 또는 비활성 표시) */
  outOfPeriod: SimilarSalesCandidate[];
  /** 적용된 조회 조건 (UI 표시용) */
  appliedCriteria: {
    areaMin: number;
    areaMax: number;
    stdPriceMin: number;
    stdPriceMax: number;
    periodStart: string;
    periodEnd: string;
  };
}
```

**법령 필터 기준 (엔진이 구현해야 할 사항):**
- 면적 필터: `|targetAreaSqm - record.excluUseAr| / targetAreaSqm ≤ 0.05` (±5%)
- 공시가격 필터: `|targetStandardPrice - estimatedStdPrice| / targetStandardPrice ≤ 0.20` (±20%) — RTMS 레코드에 공시가격이 없으면 단지 추정값 사용
- 평가기간: 상속 = `evaluationDate ± 6개월`, 증여 = `evaluationDate - 6개월 ~ evaluationDate + 3개월`
- §49② 가장 가까운 날: `daysFromEvaluationDate` 오름차순 정렬 → 첫 번째가 추천

### 6.3 UI가 보유할 수 없는 정보 (엔진에 위임)

- 거래건별 RTMS 공시가격 대응 — UI는 대상 아파트의 `standardPrice`(기준시가)만 보유. 유사 거래의 공시가격은 엔진/라우트에서 RTMS 보완 조회 또는 추정.
- 특수관계 거래 여부 — 자동 판별 불가. UI는 경고만 표시.

---

## 7. Mediator 설계: `lib/calc/rtms-similar-sales-lookup.ts`

history-lookup-modal 스킬의 4-레이어 아키텍처를 준용하되, 외부 API(RTMS)를 데이터 소스로 사용하는 변형이다. IndexedDB 이력이 아닌 국토부 API를 조회하므로 `calculationRepository.list()` 호출은 없다.

```
┌─────────────────────────────────────────────────────────────────┐
│ UI Layer                                                        │
│   RtmsSimilarSalesModal.tsx                                     │
│   RtmsSimilarSalesButton (인라인 버튼)                           │
│   SimilarSalesBadge (출처 배지)                                  │
└──────────────────────┬──────────────────────────────────────────┘
                       │ import
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│ Mediator: lib/calc/rtms-similar-sales-lookup.ts                 │
│   fetchRtmsSimilarSales(params) — /api/address/apt-trade 호출   │
│   + Dexie 캐시 (7일 TTL, PNU+연월 복합 키)                       │
│   filterSimilarSalesLocal(records, criteria) — 순수 함수         │
│   rankByClosestDate(candidates, baseDate) — 추천 결정            │
│   averageAmount(selected) — 평균 계산                           │
└──────────────────────┬──────────────────────────────────────────┘
                       │ fetch
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│ Route: app/api/address/apt-trade/route.ts (엔진 시니어 담당)      │
│   RTMS API 프록시 + serviceKey 인젝션                            │
└─────────────────────────────────────────────────────────────────┘
```

**캐시 키 설계**: `rtms_${pnu || jibun}_${YYYY}_${MM}` — 동일 단지·동일 월의 중복 API 호출 방지.

**캐시 저장소**: 기존 `lib/storage/db.ts`의 Dexie 인스턴스에 `rtmsSalesCache` 테이블 추가 (Do 단계에서 `db.ts` version 업그레이드 필요).

**filterSimilarSalesLocal은 순수 함수**: 서버 API 호출 없이 클라이언트에서 필터링한다. `RtmsSalesRecord[]` + `SimilarSalesFilterCriteria`를 받아 `SimilarSalesFilterResult`를 반환.

---

## 8. 엣지케이스 처리

### 8.1 후보 0건

- 모달에 빈 상태 UI 표시
- 조회 조건(면적 범위·공시가격 범위·기간) 명시
- "직접 입력" 버튼으로 모달 닫기
- 기존 CurrencyInput 수동 입력은 항상 유지

### 8.2 주소 미입력

- 버튼 `disabled` + `disabledReason="소재지를 먼저 입력해주세요"`
- ToggleCard의 `disabled` + `disabledReason` prop 패턴 준용 (CLAUDE.md §ToggleCard)
- 아파트 자산임에도 PNU/지번 없으면 버튼은 보이되 비활성

### 8.3 env 미설정 (RTMS_SERVICE_KEY 없음)

- `/api/address/apt-trade`가 `{ success: false, configMissing: true }` 반환
- 클라이언트: 버튼 비활성 + 안내 메시지 (tooltip)
- 기존 CurrencyInput 수동 입력 정상 유지

### 8.4 전용면적 미입력

- `item.areaSqm`이 없으면 버튼 비활성
- `disabledReason="전용면적(㎡)을 먼저 입력해주세요"`
- 아파트 보충적 평가 입력 단계에서 면적 입력을 유도

### 8.5 기준시가(공시가격) 미입력

- `item.standardPrice`가 없으면 공시가격 ±20% 조건 미적용 (면적 조건만 적용)
- 또는 버튼 비활성 + 안내
- 설계 결정: 공시가격 없이도 면적 조건만으로 조회 허용 → `appliedCriteria.stdPriceMin/Max` 표시를 "공시가격 미확인(조건 미적용)"으로 표기

**권장**: 기준시가가 없으면 버튼을 비활성화하고 "주택 기준시가를 먼저 입력해주세요"로 안내. ±20% 조건 미적용 시 과도하게 많은 후보가 나타나 법령 준수 판단이 어려워짐.

### 8.6 평가기간 외 거래

- `isWithinPeriod === false`인 후보는 기본 비활성(클릭 불가) + "평가기간 외" 배지
- 클릭 시 경고 토스트: "평가기간(전후 6개월) 밖의 거래입니다. 시행령 §49② 기준 시가로 인정되지 않을 수 있습니다."
- 선택 차단보다 경고 후 허용이 실무상 유연 → 설계 결정: 경고 표시 + 허용 (납세자가 판단)

### 8.7 RTMS API 오류 (네트워크/서버)

- 모달에 오류 상태 표시: "실거래가를 불러오지 못했습니다"
- "재시도" 버튼 제공
- 실패해도 기존 CurrencyInput 수동 입력은 항상 유지

### 8.8 복수 거래 선택

- 체크박스로 복수 선택 → 선택 건의 거래금액 평균 표시
- 평균 계산: `Math.floor(sum / count)` (정수, 원 단위 절사)
- 모달 하단에 "선택 N건 평균: XXX원" 실시간 표시

---

## 9. 법령 정확성 체크리스트

- [ ] §49④ 유사매매사례 정의: "평가기준일 전후 6개월 이내"(상속) / "전 6개월~후 3개월 이내"(증여) 거래 중 면적·용도·기준시가 유사한 것
- [ ] 면적 유사 기준 ±5%: 상증세법 시행규칙 §15① 명시적 기준
- [ ] 공시가격 유사 기준 ±20%: 시행규칙 §15①·§15의3 기준
- [ ] §49② "가장 가까운 날" 추천: 구현되어야 하며 자동 1건 확정은 금지
- [ ] §49①1호 가목 특수관계 경고: 자동 판별 불가 → 항상 경고 문구 노출 필수
- [ ] 자동 1건 확정 금지: 사용자가 반드시 선택해야 함 (법령상 평가주체의 판단 필요)
- [ ] market/appraisedValue 있으면 §49② 단서로 similarSalesValue 배제: 엔진(`resolveValuationMethod`)이 이미 처리 — UI에서 별도 차단 불필요. 단, 안내 문구 유지.

---

## 10. 엔진 시니어와의 동기화 포인트

아래 사항을 `property-valuation-senior`에게 요청한다:

1. `GET /api/address/apt-trade` 라우트 구현 (§6.1 응답 타입 충족)
2. `filterSimilarSales(records, criteria): SimilarSalesFilterResult` 순수 함수 (§6.2)
3. `RtmsSalesRecord`, `SimilarSalesFilterCriteria`, `SimilarSalesFilterResult`, `SimilarSalesCandidate` 공개 타입 정의 (barrel export)
4. 공시가격 없는 레코드에 대한 처리 방침 결정 (exclude vs. 면적만 필터)
5. env 변수명: `RTMS_SERVICE_KEY` (또는 `MOLIT_SERVICE_KEY`) — 공공데이터포털 공동주택 실거래가 서비스

---

## 11. 기존 코드와의 정합성

### 11.1 `resolveValuationMethod` 불변

`lib/tax-engine/property-valuation.ts:58-64` 로직은 변경 없다.
자동조회는 `similarSalesValue` 값을 채우는 입력 보조일 뿐이며, 평가 로직은 동일하다.

```typescript
// 현행 코드 (변경 없음)
if (item.similarSalesValue != null && item.similarSalesValue > 0) return "similar_sales";
```

### 11.2 `callInheritanceTaxAPI` body 변경 사항

`lib/calc/inheritance-api.ts:71`의 `estateItems: input.estateItems` spread에 의해 `similarSalesSource`가 자동으로 전달된다. 엔진 Zod 스키마에서 이 필드를 `z.literal("rtms_auto").optional()`로 허용하거나 `z.any()`로 통과시켜야 한다.

**권장**: 엔진 Zod에서 `similarSalesSource: z.string().optional()` 추가 후 엔진 내부에서 무시. 클라이언트 strip은 불필요.

### 11.3 `EstateItem` 타입 확장 영향

`similarSalesSource` 필드가 추가되면 `EstateItem`을 사용하는 모든 serialize/deserialize 경로에서 unknown 필드로 처리된다. TypeScript optional이므로 기존 코드에 컴파일 오류 없다.

sessionStorage 저장 시 `similarSalesSource: "rtms_auto"` 값이 보존된다. 이는 의도된 동작이다 — 폼을 닫았다 다시 열어도 출처 배지가 유지된다.

---

## 12. Do 단계 구현 순서

1. `lib/tax-engine/types/inheritance-gift.types.ts` — `EstateItem.similarSalesSource` 필드 추가 (①)
2. `EstateItem` 팩토리 함수 initial value 추가 (②)
3. normalize 가드 추가 (③ — 해당 시)
4. 엔진 Zod 스키마 수용 확인 (④)
5. `lib/calc/rtms-similar-sales-lookup.ts` 신규 — Mediator
   - `fetchRtmsSimilarSales` (캐시 + API 호출)
   - `filterSimilarSalesLocal` (순수 필터)
   - `rankByClosestDate`
   - `averageAmount`
6. `components/calc/inheritance/estate-card/variants/RtmsSimilarSalesModal.tsx` 신규 (⑤)
7. `components/calc/inheritance/estate-card/variants/EstateBodyRealEstate.tsx` 수정 — 버튼·배지 추가 (⑤)
8. Dexie `db.ts` version 업그레이드 — `rtmsSalesCache` 테이블 추가
9. 결과 카드 "RTMS 자동조회" 출처 표기 (⑦ — 선택적)
10. `npx tsc --noEmit` 오류 0건
11. `npx vitest run __tests__/tax-engine/inheritance*/` 회귀

---

## 13. 자가 점검 — Definition of Done (Do 완료 전 필수)

- [ ] 3대 핵심 정책 준수
  - [ ] useEffect → store 미러링 없음. CurrencyInput onChange에서 직접 `set({ similarSalesSource: undefined })`
  - [ ] 자동 안분 fallback 없음. 미선택 시 모달 닫기만 (값 미채움)
  - [ ] Validation 8번째 동기화: `similarSalesSource`는 검증 대상 아님 — validate 변경 불필요
- [ ] 8개 동기화 지점 전부
  - [ ] ① EstateItem.similarSalesSource 타입 추가
  - [ ] ② initial value undefined
  - [ ] ③ normalize 가드 (해당 시)
  - [ ] ④ API body: estateItems 통째 전달 → 자동 포함
  - [ ] ⑤ UI 위젯: 버튼·모달·배지
  - [ ] ⑥ 사이드바: 변경 없음 (영향 없음)
  - [ ] ⑦ 결과 카드: 출처 표기 (선택)
  - [ ] ⑧ validation: similarSalesSource 검증 없음 — 변경 불필요
- [ ] 법령 정확성: §49②④ 자동 1건 확정 금지, §49①1호 가목 특수관계 경고 노출
- [ ] 환경 미설정 graceful: 버튼 비활성, 기존 수동 입력 정상
- [ ] `npx tsc --noEmit` 0건
- [ ] 회귀 테스트 통과
- [ ] 브라우저 수동 확인 또는 미수행 명시
