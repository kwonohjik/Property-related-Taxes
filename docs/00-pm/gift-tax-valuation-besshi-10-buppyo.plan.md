# 증여재산 평가 내역 → 별지 제10호서식 부표 1 [개정 2026.3.20.] 재현 계획서

> 작성일: 2026-05-20
> 대상: 증여세 결과 화면 — `GiftTaxResultView.tsx`의 "증여재산 평가 내역" 카드
> 변경 형태: 단순 평가 카드(이미지 13) → **공식 신고서 부표 양식**(이미지 14)
> 근거 서식: 상속세 및 증여세법 시행규칙 **[별지 제10호서식 부표 1]** — "증여재산 및 평가명세서"
> **★ KoreanLaw MCP 검증 결과 (2026-05-20)**: 사용자 첨부 이미지의 "(2022.03.18 개정)"보다 최신본 존재 — 「개정 2026.3.20.」이 현행. 본 계획서는 **최신본 기준**으로 진행. 사용자 이미지와 양식 본문은 동일하나 코드 매핑·재산종류 14종(현행) > 13종 가능성 — 본 계획서 §3.3~§3.4가 진실 기준.

---

## 1. 배경

### 1.1 현재(이미지 13) — 단순 카드형

```
┌─ 증여재산 평가 내역 (1건) ────────────▲┐
│ 현금                       350,000,000 │
│  평가방법: 시가                         │
│    현금 (액면가) (상증법 §60)  350,000,000 │
└─────────────────────────────────────┘
```

위치: `components/calc/results/GiftTaxResultView.tsx:308-357`
데이터: `result.valuationResults[]: PropertyValuationResult` (`lib/tax-engine/types/inheritance-gift.types.ts:106`)

### 1.2 목표(이미지 14) — 공식 부표 양식 100% 재현

```
■ 상속세 및 증여세법 시행규칙 [별지 제10호서식 부표 1]〈개정 2026. 3. 20.〉
                                                              (앞쪽)
관리번호 [____]            증여재산 및 평가명세서
※ 뒤쪽의 작성방법을 읽고 작성하시기 바랍니다.

┌────┬────┬─────┬──────┬────────┬─────┬─────┬─────┬───────────┬─────┐
│ ①  │ ②  │ 국외 │ 국외 │ ③ 소재지│사업자│ 수량 │ 단가 │  평가가액  │ ⑧  │
│재산│재산│자산 │재산  │·법인명 │등록 │(면적)│      │            │평가  │
│구분│종류│여부 │국가명│등      │번호 │      │      │            │기준  │
│코드│코드│     │      │        │(지분│      │      │            │코드  │
│    │    │     │      │        │율)  │      │      │            │      │
├────┼────┼─────┼──────┼────────┼─────┼─────┼─────┼───────────┼─────┤
│A11 │ 01 │[]여 │      │ 현금   │     │     │      │1,000,000,000│ 06 │  ← ⑨에 가산 (당기)
│    │    │[]부 │      │        │     │     │      │             │     │
├────┼────┼─────┼──────┼────────┼─────┼─────┼─────┼───────────┼─────┤
│A24 │ 01 │[]여 │      │ 현금   │     │     │      │  520,000,000│ 06 │  ← ⑭에 가산 (사전증여)
│    │    │[]부 │      │        │     │     │      │             │     │
├────┼────┼─────┼──────┼────────┼─────┼─────┼─────┼───────────┼─────┤
│A24 │ 01 │[]여 │      │ 현금   │     │     │      │  300,000,000│ 06 │  ← ⑭에 가산 (사전증여)
│    │    │[]부 │      │        │     │     │      │             │     │
├────┼────┼─────┼──────┼────────┼─────┼─────┼─────┼───────────┼─────┤
│    │    │[]여 │      │        │     │     │      │             │     │  ← 빈 행 (7개)
│    │    │[]부 │      │        │     │     │      │             │     │
│  …(빈 행 6개 더)…                                                       │
└────┴────┴─────┴──────┴────────┴─────┴─────┴─────┴───────────┴─────┘
┌──────────────────────────────────────────────────────────────┐
│       ⑨ 증 여 재 산 가 액              1,000,000,000   (A11 행 합)│
│       ⑩ 비 과 세 재 산 가 액                                  │
│ 계  ┌─⑪ 공익법인 출연재산가액                                 │
│   과세│⑫ 공익신탁재산가액                                    │
│   가액│⑬ 장애인신탁재산가액                                  │
│   불 ─┘                                                       │
│   산입│                                                       │
│       ⑭ 증 여 재 산 가 산 액              820,000,000   (A24 행 합)│
│       ⑮ 합            계                1,820,000,000          │
└──────────────────────────────────────────────────────────────┘
첨부서류: 증여재산 증명서류 [예: 주주(증권계좌)번호 및 잔고증명서, 예금통장 사본 등]
                                                      수수료 없음
                                              210mm×297mm[백상지 80g/㎡]
```

---

## 2. 변경 범위 & 비변경 범위

### 2.1 변경 범위 (DOM 교체)

- `GiftTaxResultView.tsx:308-357` "재산 평가 내역" 카드 **DOM 전체 교체**
- 새 컴포넌트 `GiftTaxValuationFormTable.tsx` 신설 (별지 제10호서식 부표 표 + 계 영역)
- 펼침/접힘 토글(`showValuation`)은 그대로 유지 (인쇄 시 자동 펼침)

### 2.2 비변경 범위

- **엔진 변경 없음** — `result.valuationResults[]` + `result.grossGiftValue` + `result.exemptAmount` + `result.aggregatedGiftValue` 그대로 소비
- 사이드바·과세 요약·세액공제 카드 영향 없음
- 800줄 정책: 신규 파일 1개 분리로 `GiftTaxResultView.tsx` 추가 줄 수 +5 이하

---

## 3. 데이터 매핑 (PropertyValuationResult → 부표 행)

### 3.1 본문 표 행 (Top section — 한 자산 = 한 행)

> ★ **부표 1 본문 컬럼 순서(원문 표 헤더 기준)**: ① 재산구분코드 / ② 재산종류코드 / 국외자산 여부 / 국외재산 국가명 / ③ 소재지·법인명 등 / 사업자등록번호(지분율) / 수량(면적) / 단가 / 평가가액 / 평가기준코드
> ※ 사용자 이미지 14의 ④~⑧ 인덱스는 본 코드 매핑과 동일하므로 그대로 사용.

| 부표 칸 | 데이터 소스 | 비고 |
|---|---|---|
| ① 재산구분코드 | `"A11"` 고정 (단순 증여재산) | 사전증여 합산분 행은 `A24` (거주자) — Phase 2 분리 |
| ② 재산종류코드 | `EstateItem.category` → 코드 매핑 (§3.3) | 14종 |
| 국외자산 여부 | (Phase 1: `[ ]여 [✓]부` 고정) | 향후 EstateItem 확장 |
| 국외재산 국가명 | (공란) | 향후 |
| ③ 소재지·법인명 등 | `EstateItem.name` | 단순 명칭 |
| ④ 사업자등록번호(지분율) | (공란) | Phase 1 미입력 |
| ⑤ 수량(면적) | `EstateItem.listedStockShares` 등 | 가용 시만 |
| ⑥ 단가 | `EstateItem.listedStockAvgPrice` 등 | 가용 시만 |
| ⑦ 평가가액 | `PropertyValuationResult.valuatedAmount` | **항상 채움** |
| ⑧ 평가기준코드 | `method` → 코드 매핑 (§3.4) | 8종 |

### 3.2 빈 행 정책 (PDF 양식 시각 재현)

- ★ KoreanLaw MCP 본문 확인: 부표 1 원문은 **빈 행 10개** 고정 (사용자 이미지 14는 8행이나 공식 최신본은 10행).
- 자산 수 N에 대해:
  - N ≤ 10 → 데이터 N행 + 빈 행 (10 − N)개
  - N > 10 → 데이터 N행 (양식 늘어남, 인쇄 시 페이지 분할)
- 빈 행은 동일 td 골격 (`<td>&nbsp;</td>` × 10열) 으로 렌더 — 시각 일관성 확보
- 빈 행 "국외자산 여부" 칸은 모두 `[ ]여 [ ]부` 그대로 노출 (양식 본질)

### 3.3 ② 재산종류코드 매핑 (★ KoreanLaw MCP 검증 — 부표 1 뒷면 코드표 14종)

**원문 (시행규칙 별지 제10호서식 부표 1 뒷면 작성방법 §2)**

★ **AssetCategory 실제 enum 값** (`lib/tax-engine/types/inheritance-gift.types.ts:50-59`) — 9종:
`real_estate_land` / `real_estate_building` / `real_estate_apartment` / `listed_stock` / `unlisted_stock` / `cash` / `financial` / `deposit` / `other`
(`commercial_building` 카테고리는 **존재하지 않음** — Phase 1에서 오피스텔·상업용건물도 `real_estate_building`으로 분류됨)

| 코드 | 재산구분 (원문) | 매핑 대상 `AssetCategory` (실제 enum) | 비고 |
|---|---|---|---|
| **01** | 현금 | `cash` | — |
| **02** | 토지Ⅰ (순수토지) | `real_estate_land` | — |
| **03** | 토지Ⅱ [일반건물(07)의 부수토지] | (현재 카테고리 분리 불가) | Phase 1 미사용 — `real_estate_land` 일괄 02로 처리 |
| **04** | 개별주택 (부수토지 포함) | (현재 enum 부재) | Phase 1 미사용 |
| **05** | 공동주택 (부수토지 포함) | `real_estate_apartment` | — |
| **06** | 오피스텔·상업용건물 (부수토지 포함) | (현재 enum 부재) | Phase 1: `real_estate_building`에 묶임 → 07로 표시. Phase 2에 분리 |
| **07** | 일반건물 (부수토지 제외) | `real_estate_building` | 오피스텔·상업용건물 포함 (Phase 1 한계) |
| **08** | 부동산을 취득할 수 있는 권리 | (현재 enum 부재) | Phase 1 미사용 |
| **09** | 유가증권 (상장) | `listed_stock` | — |
| **10** | 유가증권 (비상장) | `unlisted_stock` | — |
| **11** | 금융재산 (현금, 유가증권 제외) | `financial` | 예금·펀드·채권 등 |
| **12** | 기타재산 | `other`, `deposit` | 01~11·13·14 외 |
| **13** | 가상자산 | (현재 enum 부재) | Phase 1 미사용 |
| **14** | 서화·골동품 등 | (현재 enum 부재) | 부표 5 별도 작성 필요 |

> 주1) Phase 1 출시 매핑(9종 → 7 코드):
> `cash=01` / `real_estate_land=02` / `real_estate_apartment=05` / `real_estate_building=07` / `listed_stock=09` / `unlisted_stock=10` / `financial=11` / `deposit=12` / `other=12`
> 주2) Phase 2에서 EstateItem 확장 시 03/04/06/08/13/14 분기 추가.

### 3.4 ⑧ 평가기준코드 매핑 (★ KoreanLaw MCP 검증 — 부표 1 뒷면 코드표 8종)

**원문 (시행규칙 별지 제10호서식 부표 1 뒷면 작성방법 §7)**

| 코드 | 평가기준 (원문) | 매핑 대상 `ValuationMethod` |
|---|---|---|
| **01** | 해당 재산의 매매거래가액 (상증법 §60) | `market_value` (해당 자산 자체 매매) |
| **02** | 해당 재산의 감정가액 (상증법 §60) | `appraisal` |
| **03** | 해당 재산의 수용보상가액 (상증법 §60) | (별도 method 없음 — Phase 1 미사용) |
| **04** | 해당 재산의 경매공매가액 (상증법 §60) | (별도 method 없음 — Phase 1 미사용) |
| **05** | 유사재산의 매매사례가액 등 (상증법 §60) | `similar_sales` |
| **06** | 현금 등 가액 (상증법 §60) | `cash` 자산일 때 자동 매핑 (method 별도 분기 없음 → category=cash 시 06) |
| **07** | 저당권 등 평가특례가액 (상증법 §66) | (`mortgageAmount` 활용한 평가 시 — Phase 1 미사용) |
| **08** | 기준시가 등 보충적 평가가액 (상증법 §61~§65) | `standard_price`, `book_value`, `acquisition_cost` |

> 주1) 매핑 함수 의사코드:
> ```ts
> function toValuationMethodCode(item: EstateItem, vr: PropertyValuationResult): string {
>   if (item.category === "cash") return "06";              // 현금 등
>   switch (vr.method) {
>     case "market_value":   return "01";
>     case "appraisal":      return "02";
>     case "similar_sales":  return "05";
>     case "standard_price":
>     case "book_value":
>     case "acquisition_cost": return "08";
>     default: return "08";
>   }
> }
> ```
> 주2) 향후 수용보상(03)·경매공매(04)·저당권 평가특례(07)는 ValuationMethod enum 확장 + 분기 추가.

### 3.5 계 영역 행 (Bottom section — 부표 1 ⑨~⑮ 원문 라벨)

**엔진 산식 사전 확인 (`lib/tax-engine/gift-tax.ts:108-110`)**:
```ts
netCurrentGiftValue = max(0, grossGiftValue − exemptAmount);
aggregatedGiftValue = netCurrentGiftValue + priorAggregation.totalAmount;
```
→ `exemptAmount`는 **이미 ⑩+⑪+⑫+⑬의 합**으로 합산되어 있고, `aggregatedGiftValue`에 차감이 반영됨.

| 부표 칸 (원문 라벨) | 산식 / 데이터 |
|---|---|
| ⑨ 증여재산가액 | `result.grossGiftValue` (= valuationResults.valuatedAmount 합계 — 본 행 ①=A11 합) |
| ⑩ 비과세재산가액 | `exemptAmount − ⑪ − ⑫ − ⑬` (즉, 순수 비과세 §46·§12 부분 — Phase 1은 `exemptAmount` 그대로 ⑩ 행에 넣고 ⑪~⑬=0) |
| ⑪ 공익법인 출연재산가액 | `result.publicInterestExclusion ?? 0` (§48) |
| ⑫ 공익신탁 재산가액 | `result.publicTrustExclusion ?? 0` (§52) |
| ⑬ 장애인 신탁재산가액 | `result.disabledTrustExclusion ?? 0` (§52의2) |
| ⑭ 증여재산가산액 | `max(0, result.aggregatedGiftValue − max(0, result.grossGiftValue − result.exemptAmount))` (= priorAggregation.totalAmount — 10년 합산 사전증여분) |
| ⑮ 합계 | `result.aggregatedGiftValue` |

> 자기일관성 (anchor GV-5):
> `⑮ === max(0, ⑨ − ⑩ − ⑪ − ⑫ − ⑬) + ⑭` (max(0, ...) 가드는 비과세가 grossGiftValue 초과한 음수 케이스 차단)
> ★ 원문 부표 1은 ⑩·⑪·⑫·⑬을 **차감 부호 표기 없이** 그냥 적고, 자진납부계산서(별지 제10호서식 본문)에서 `⑨ − ⑩ − ⑪ − ⑫ − ⑬ + ⑭`로 과세가액을 산정. 본 양식 ⑮ 합계는 **순증여재산가액**(사전증여분 포함)으로 해석.
> ★ ⑩ 표시 정책 (Phase 1): 엔진이 `exemptAmount`만 보유하고 §48/§52/§52의2 분리값(`publicInterestExclusion` 등)이 모두 0이면 → ⑩에 `exemptAmount` 그대로 표시. 분리값 ≥1 이상이면 → ⑩=`exemptAmount − ⑪ − ⑫ − ⑬`(음수 가드).

---

## 4. 작업 절차 (PDCA Do)

### 4.1 Phase A — 신규 컴포넌트 작성

신규 파일: `components/calc/results/GiftTaxValuationFormTable.tsx` (예상 ~280줄)

```tsx
interface Props {
  valuationResults: PropertyValuationResult[];
  estateItems: EstateItem[];
  /** ⑨ — 금번 증여재산가액 합계 (= valuationResults 합) */
  grossGiftValue: number;
  /** ⑩~⑬ 합산 — 엔진은 분리 보유하지 않음 (Phase 1) */
  exemptAmount: number;
  /** ⑮ — 합계 (= max(0, grossGiftValue − exemptAmount) + priorGifts) */
  aggregatedGiftValue: number;
  /** ⑪ §48 공익법인 출연재산가액 (GiftTaxResult.publicInterestExclusion) */
  publicInterestExclusion?: number;
  /** ⑫ §52 공익신탁 재산가액 (GiftTaxResult.publicTrustExclusion) */
  publicTrustExclusion?: number;
  /** ⑬ §52의2 장애인 신탁 재산가액 (GiftTaxResult.disabledTrustExclusion) */
  disabledTrustExclusion?: number;
  /** 사전증여 합산 분리 — 본 행 ①=A24 vs A11 구분용 (Phase 2; Phase 1은 미사용 — Single A11 합) */
  priorGiftValuationResults?: PropertyValuationResult[];
}
```

구조:
1. 상단 헤더 — `■ 상속세 및 증여세법 시행규칙 [별지 제10호서식 부표 1] 〈개정 2026. 3. 20.〉`
2. 관리번호 입력란(공란) + 우측 `(앞쪽)`
3. 제목 `증여재산 및 평가명세서` (가운데 정렬 굵게)
4. 작성안내 1줄
5. **본문 표** (10열 × **10행**) — Tailwind utility 직접 사용 (`border border-black p-1 text-center text-[11px]`). 컬럼 폭 합계 **750px (min) + flex** — A4 인쇄 영역(794px @ 96dpi) 안전 수용. 컨테이너에 `min-w-[750px]` + 좁은 뷰포트 `overflow-x-auto`. 컬럼 폭 세부는 [Design §4.1](../02-design/features/gift-tax-valuation-besshi-10-buppyo.engine.design.md#41-헤더-컬럼-순서-10열-부표-1-원문-기준)
6. **계 영역** — 7행(⑨~⑮) **독립 표** (본문 표와 별도 `<table>`). ⑪⑫⑬은 "과세가액 불산입액"으로 rowSpan=3 묶음. ⑩은 묶음 외부 단독 행
7. 첨부서류 + 수수료 + 용지 규격

**미사용 import 정리**: 평가 내역 카드 교체 시 `GiftTaxResultView.tsx`의 `getItemDisplayName` 헬퍼 + `methodLabel` 상수가 다른 곳에서 사용되지 않는다면 함께 제거. import도 `EstateItem` 타입 유지 (props로 전달).

### 4.2 Phase B — `GiftTaxResultView.tsx` 통합

- L308~357 DOM 교체 (펼침 토글 + `<GiftTaxValuationFormTable ... />`)
- import 1줄 추가
- print 시 자동 펼침 — **CSS-only 패턴** (useEffect 미사용):
  ```tsx
  <div className={showValuation ? "block" : "hidden print:block"}>
    <GiftTaxValuationFormTable ... />
  </div>
  ```
  `print:block`은 인쇄 미디어쿼리에서 `display: block` 강제 → showValuation 상태와 무관하게 인쇄 시 항상 표시
- 결과 카드 영역 펼침 토글 UX는 그대로 유지 (사용자가 토글로 화면에서 열고 닫는 경험)

### 4.3 anchor 테스트 (`__tests__/components/gift-tax-valuation-form-table.test.tsx` — 신규)

| ID | 조건 | 검증값 |
|---|---|---|
| GV-1 | 현금 350M 1건 | ⑦행1 = 350,000,000 / ②칸 "01" / ⑧칸 "06" / ⑨ = 350,000,000 / ⑮ = 350,000,000 |
| GV-2 | 현금 1B + 사전증여 820M | ⑨ = 1,000,000,000 / ⑭ = 820,000,000 / ⑮ = 1,820,000,000 (사용자 이미지 14 일치) |
| GV-3 | 자산 3건 + 빈 행 7개 | tbody tr.count = 10 (★ 최신본 10행 기준) |
| GV-4 | 자산 12건 | tbody tr.count = 12 (10행 한계 초과 시 표 확장) |
| GV-5 | 자기일관성 (음수 가드 포함) | ⑮ === `max(0, ⑨ − ⑩ − ⑪ − ⑫ − ⑬) + ⑭` (gross < exempt 케이스 차단) |
| GV-6 | 재산종류코드 매핑 (AssetCategory 실제 enum 9종) | `cash` → "01" / `real_estate_land` → "02" / `real_estate_apartment` → "05" / `real_estate_building` → "07" / `listed_stock` → "09" / `unlisted_stock` → "10" / `financial` → "11" / `deposit` → "12" / `other` → "12" |
| GV-7 | 평가기준코드 매핑 | `market_value` → "01" / `appraisal` → "02" / `similar_sales` → "05" / `cash`자산 → "06" / `standard_price`·`book_value`·`acquisition_cost` → "08" |
| GV-8 | 재산구분코드 ① | 직접 증여 행 = "A11" / 사전증여 합산 행 = "A24" (Phase 2) |

### 4.4 KoreanLaw MCP 검증 결과 (2026-05-20 완료) ✅

**검증 도구**: `mcp__claude_ai_KoreanLaw__get_annexes(lawName="상속세 및 증여세법 시행규칙", annexNo="10", knd="2")`

**확정 사항**:
1. **최신 양식명·개정일**: 「**상속세 및 증여세법 시행규칙 [별지 제10호서식 부표 1]** 〈개정 2026. 3. 20.〉」 — 사용자 이미지 14의 "(2022.03.18 개정)"보다 최신본 존재. **본 계획서는 최신본 기준**.
2. **양식 제목**: "증여재산 및 평가명세서" (사용자 이미지와 동일)
3. **본문 헤더 컬럼 순서**: 재산구분코드(①) → 재산종류코드(②) → 국외자산 여부 → 국외재산 국가명 → 소재지·법인명 등(③) → 사업자등록번호(지분율) → 수량(면적) → 단가 → 평가가액 → 평가기준코드(⑧)
4. **데이터 행 수**: 빈 행 포함 **10행** (사용자 이미지 14는 8행이나 현행 부표 1은 10행)
5. **① 재산구분코드** 9종 확정 (§3.3 위 참조 표)
6. **② 재산종류코드** 14종 확정 (§3.3 매핑표)
7. **⑧ 평가기준코드** 8종 확정 (§3.4 매핑표)
8. **계 영역 ⑨~⑮ 라벨** 확정 (§3.5)
9. **첨부서류 문구**: "증여재산 증명서류 [예: 주주(증권계좌)번호 및 잔고증명서, 예금통장 사본 등]"
10. **수수료**: 없음
11. **용지**: 210mm × 297mm [백상지 80g/㎡]
12. **관련 자식 서식**:
    - 부표 2: 가업승계 증여세 납부유예 (Phase 3+ 확장 시)
    - 부표 3: 혼인 및 출산 증여재산 공제 명세서
    - 부표 5: 서화·골동품 등 증여재산 명세서 (재산종류 14 사용 시 의무 동반)
    - 부표 6: 공익법인 등 관련 가산세 명세서

**드리프트 차단** (정책: [[feedback-korean-law-82-vs-81-2-drift]]):
- 사용자 이미지 14의 "[별지 제10호서식 부표]" 라벨은 비공식 약칭 — 정식 명칭은 "[별지 제10호서식 **부표 1**]" (숫자 1 필수)
- 작성방법 라벨도 함께 검증: 자진납부계산서 본문 안내문구 §5에 "「상속세 및 증여세법 시행규칙」 별지 제10호서식 부표 1" 명시
- 본 계획서 UI 헤더는 `■ 상속세 및 증여세법 시행규칙 [별지 제10호서식 부표 1] 〈개정 2026. 3. 20.〉`로 표기

---

## 5. UI 디자인 디테일

### 5.1 표 스타일 (인쇄 친화) — Tailwind utility 직접 적용 (외부 CSS 금지)

프로젝트 컨벤션에 따라 신규 CSS 파일·클래스 작성 금지. 인쇄 양식 스타일은 Tailwind utility를 직접 사용:

```tsx
<table className="w-full border-collapse text-[11px] font-[Noto Sans KR]">
  <thead>
    <tr>
      <th className="border border-black p-1 align-middle text-center">① 재산구분코드</th>
      ...
    </tr>
  </thead>
  <tbody>
    <tr>
      <td className="border border-black p-1 text-center">A11</td>
      <td className="border border-black p-1 text-right tabular-nums">{formatKRW(amount)}</td>
      ...
    </tr>
  </tbody>
</table>
```

핵심 utility:
- `border border-black` — 흑색 1px 격자
- `p-1` — 4px 패딩
- `text-center` / `text-right tabular-nums` — 일반·금액
- `text-[11px]` — 11px 고정 (Tailwind arbitrary)
- `print:bg-white print:text-black` — 인쇄 시 강제 흰 배경

### 5.2 다크모드

흑백 양식이므로 **인쇄/PDF 시 강제 화이트 배경** (`print:bg-white print:text-black`).
화면 모드는 다크모드에서도 흰 카드 안에 검정 글씨로 표시(투명 카드 금지) — 양식 가독성 우선.

### 5.3 "원" 단위 표기 금지

`formatKRW`로 콤마 처리, 끝에 "원" 미부착 (정책: [[feedback-no-won-suffix]]).

### 5.4 헤더 행 결합 (rowspan/colspan)

이미지 14 헤더는 2단(상단 라벨 / 하단 보조 라벨). `<thead>` 2행 + rowspan/colspan로 정확히 재현. 예:

```tsx
<thead>
  <tr>
    <th rowSpan={2}>① 재산구분 코드</th>
    <th rowSpan={2}>② 재산종류 코드</th>
    <th colSpan={2}>국외자산 여부 / 국가명</th>
    <th rowSpan={2}>③ 소재지·법인명 등</th>
    <th rowSpan={2}>④ 사업자등록번호(지분율)</th>
    <th rowSpan={2}>⑤ 수량(면적)</th>
    <th rowSpan={2}>⑥ 단가</th>
    <th rowSpan={2}>⑦ 평가가액</th>
    <th rowSpan={2}>⑧ 평가기준 코드</th>
  </tr>
  <tr>
    <th>여/부</th>
    <th>국가명</th>
  </tr>
</thead>
```

---

## 6. 14개 동기화 지점 영향 (DoD)

본 변경은 **결과 표시(⑦)만** 영향. 폼/엔진 변경 0:

| # | 지점 | 영향 |
|---|---|---|
| ①~④ | 폼 상태·initial·normalize·API 변환 | 영향 없음 |
| ⑤ | UI 위젯 | 영향 없음 (입력 위젯 무변경) |
| ⑥ | 사이드바 합계 | 영향 없음 |
| **⑦** | **결과 카드** | **GiftTaxResultView 평가 내역 영역 DOM 교체** |
| ⑧ | Validation | 영향 없음 |
| ⑨~⑭ | Zod·Route·엔진 매핑 | 영향 없음 |

신규 엔진 필드 없음 → 14지점 sync-checker 실행 불필요. 단, **시각적 회귀**는 Playwright 스크린샷 1건 권장 (후속 PR).

---

## 7. PDCA 단계별 결과물

### 7.1 Plan (본 문서)
- 본 계획서 + KoreanLaw MCP 코드표 검증 후 §3.3/§3.4 확정값

### 7.2 Design (별도 문서 신규)
- `docs/02-design/features/gift-tax-valuation-besshi-10-buppyo.engine.design.md`
- 신규 컴포넌트 props 시그니처 + 표 골격 + 코드 매핑 함수 시그니처

### 7.3 Do
1. KoreanLaw MCP 본문 조회 → §3.3/§3.4 정정 ✅ (Plan 단계 완료)
2. `GiftTaxValuationFormTable.tsx` 신규 (단일 파일, ~280줄, 800줄 한참 미달)
3. `GiftTaxResultView.tsx` L308~357 교체 (-50줄, +5줄)
4. anchor 8건(GV-1~8) 신규

### 7.4 Check
- `npx tsc --noEmit` 0
- `npx vitest run __tests__/components/gift-tax-valuation-form-table.test.tsx` PASS
- 회귀: `npx vitest run` 전체 PASS (영향 없음 예상)
- 브라우저 수동 확인 — `app/calc/gift-tax/` 시뮬레이션(현금 350M / 사전증여 합산 케이스) → PDF 인쇄 미리보기 시각 비교

### 7.5 Act
- 사용자 이미지 14 + 최신본 부표 1 (10행) 직접 비교(stacking·여백·행 높이) 후 미세 조정
- 시각적 회귀 Playwright 스크린샷 1건 후속 PR — 케이스:
  - `gift-tax-valuation-form-table-1asset.png` (자산 1건 + 빈 행 9개)
  - `gift-tax-valuation-form-table-mixed.png` (현금 + 사전증여 합산)
  - `gift-tax-valuation-form-table-print.png` (window.print() 미리보기)

---

## 8. 위험·미결 사항

| ID | 항목 | 영향 | 처리 |
|---|---|---|---|
| R-1 | ~~부표 코드표 미확정~~ | ~~Code 칸 오표시 위험~~ | ✅ **2026-05-20 해결**: KoreanLaw MCP `get_annexes` 결과로 §3.3 (14종), §3.4 (8종), §3.5 라벨 확정. 최신본 「개정 2026.3.20.」 적용. |
| R-2 | ~~⑪/⑫/⑬ 분리 데이터 부재~~ | ~~공익법인·신탁 출연재산 표시 불가~~ | ✅ **2026-05-20 해결**: `GiftTaxResult`에 `publicInterestExclusion` / `publicTrustExclusion` / `disabledTrustExclusion` 이미 optional 존재 (types/inheritance-gift.types.ts:781-783). Phase 1부터 분리 표시 가능 — Props 시그니처에 3 필드 추가. |
| R-3 | ④ 사업자등록번호·⑤ 수량·⑥ 단가 일부 자산 미입력 | 빈 칸 노출 | EstateItem에 optional이므로 공란 허용 — 양식 자체가 부분 입력 허용 |
| R-4 | 국외자산 여부 토글 미구현 | `[ ]여 [✓]부` 고정 | EstateItem `isOverseas?` 필드 향후 확장 + 본 컴포넌트는 prop 받아 반영 |
| R-5 | 다크모드 가독성 | 양식이 흑백 전제 | 카드 강제 흰 배경 + 검정 텍스트 |
| R-6 | 다국어(인쇄 시 한자 혼용) | 양식 라벨은 한글 단독 사용 | 라벨 상수 분리 — i18n 향후 |

---

## 9. 정책·메모리 참조

- ★ [[feedback-pdf-table-row-one-to-one-mapping]] — 부표 칸 번호 ①~⑮를 props·테스트에 동결 (`row1Cash`·`totalRow9Gross`·`totalRow15Sum` 등)
- ★ [[feedback-korean-law-82-vs-81-2-drift]] — 별지 제10호서식 부표 본문은 KoreanLaw MCP로 직접 검증 후 인용
- ★ [[feedback-no-won-suffix]] — 양식 내 모든 금액은 콤마만, "원" 미부착
- ★ [[feedback-validation-sync-8th-point]] — 본 작업은 입력·validate 무관 (결과 표시 한정)
- ★ [[feedback-pdca-session-efficiency]] — Plan에 케이스 매트릭스(자산 1·3·8·10건 + ⑨⑭⑮ 자기일관성) 사전 enumerate

---

## 10. 완료 조건

### Phase 1 (본 PR 범위) — 구현 완료 2026-05-20

- [x] `GiftTaxValuationFormTable.tsx` 신규 (366줄)
- [x] `GiftTaxResultView.tsx` 평가 내역 카드 교체 (DOM L327~352)
- [x] anchor 8건(GV-1~8) + ⑪⑫⑬ 분리 추가 = 9 PASS
- [x] tsc 0 / vitest 전체 4028 PASS / 회귀 0
- [ ] 브라우저 미리보기 — 사용자 이미지 14 시각 일치(±패딩 2px) + 부표 1 최신본 행 수(10행) — **CLI 환경 한계로 미수행 / 사용자 검증 필요**
- [ ] PDF 인쇄 시 1쪽 정렬 (A4, 210mm × 297mm) — **사용자 검증 필요**
- [x] KoreanLaw MCP 부표 1 뒷면 코드표 정합 검증 완료 (2026-05-20, §4.4)
- [x] 부표 1 본문은 「개정 2026. 3. 20.」 최신본 라벨로 헤더 표기
- [x] ⑪/⑫/⑬ 분리값을 `GiftTaxResult.public*Exclusion` 3필드에서 직접 매핑
- [x] ⑩ 음수 가드 (`exemptAmount > ⑪+⑫+⑬` 케이스) — `computeRow10`
- [x] ⑭ 산식 = `aggregatedGiftValue − max(0, grossGiftValue − exemptAmount)` — `computeRow14`
- [x] 미사용 `getItemDisplayName`·`CATEGORY_LABELS`·`AssetCategory` import 정리

### Phase 2 (후속 PR — 별도 트리거)

- [ ] `EstateItem` 확장 — `house`(개별주택)·`redevelopment_right`(취득권리)·`virtual_asset`(가상자산)·`artwork`(서화·골동품) 추가 → ② 재산종류코드 04/08/13/14 분기 매핑
- [ ] ValuationMethod 확장 — `expropriation`(03)·`auction`(04)·`mortgage_special`(07) 추가
- [x] 사전증여 행 분리 — `priorGifts: PriorGift[]` prop + ①=A24 표기 (2026-05-20, GV-9 anchor)
- [ ] 비거주자 신분 ①=A25/A26 분기 (donor·donee 거주자 판정 필요)
- [ ] 부표 5 (서화·골동품 등) 동시 작성 (재산종류 14 사용 시 의무)
- [ ] 국외자산 토글 — `EstateItem.isOverseas?` + `countryName?` 추가
