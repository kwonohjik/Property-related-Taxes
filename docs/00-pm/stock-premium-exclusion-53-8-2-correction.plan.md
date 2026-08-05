# 주식 할증평가 §53⑧ 배제사유 정정 + 2호(전부매각) 세부요건 계획서

> **상태**: ✅ **구현 완료** (PR#400 · 2026-06-27) — 2026-08-04 코드 실측 · 2026-08-05 인용 PR·커밋 재검증(종전 헤더는 stale이었음).
> ~~종전 표기: Plan (Do 미착수)~~
> 작성일: 2026-06-27
> 범위: **상장 + 비상장 동시** · 구현 수준: **보조입력 + 검증 게이트**
> 법령: 상증법 §63③ · 상증령 §53⑧ · 상증령 §49①1호 (KoreanLaw MCP 검증 완료 2026-06-27, 시행일 20260227)

---

## 1. 배경 · 문제 (검증된 사실)

상증령 §53⑧ 할증평가 배제 사유 1~9호를 코드와 대조한 결과, **상장·비상장 구현이 비대칭**으로 어긋나 있다.

### 1-1. 현행 법령 본문 (§53⑧, 검증 완료)

| 호 | 본문 요지 |
|---|---|
| 1호 | 평가기준일 속 사업연도 전 3년 이내부터 계속 결손(법인세법 §14②) |
| **2호** | **평가기준일 전후 6개월(증여재산: 전 6개월~후 3개월) 이내 최대주주등 보유 주식 전부 매각(§49①1호 적합 한정)** |
| 3호 | §28·29·29의2·29의3·30 증여이익 계산하는 경우 |
| 4호 | 평가대상 법인이 다른 법인의 최대주주등에 해당하여 그 다른 법인 주식을 평가하는 경우 |
| 5호 | 소급 3년 이내 사업개시 + 직전사업연도까지 영업이익 모두 0 이하 |
| 6호 | 상속세/증여세 신고기한 이내 청산 확정 |
| 7호 | 상속·증여로 최대주주등에 해당하지 않게 된 경우 |
| 8호 | §45의2 명의신탁 증여의제 |
| 9호 | 중소기업(§53⑥) 또는 중견기업(§53⑦) 발행 주식 |

### 1-2. §49①1호 (2호의 "적합" 요건, 검증 완료)

매매사실의 거래가액을 시가로 인정 — **단, 제외**: (가) 특수관계인 거래 등으로 거래가액이 객관적으로 부당, (나) 거래된 비상장주식 가액이 [발행주식총액의 1% / 3억원] 중 적은 금액 미만. → 즉 **정상 매매거래일 것**.

### 1-3. 코드 현황

**비상장** (`types/unlisted-stock-valuation.types.ts:26`) — enum 9종 호 번호·시맨틱 **정확**:
`continuous_loss_3y`(1) `all_sold_within_6m`(2) `calc_gift_profit`(3) `subsidiary_other_max`(4) `all_negative_op_income_3y`(5) `liquidation_confirmed`(6) `not_max_after_succession`(7) `deemed_gift_nominee`(8) `small_medium_enterprise`(9).
- 판정 `calcMaxShareholderPremium`(`property-valuation/max-shareholder-premium.ts:71`): 명시 사유 → 9호(중소·중견) → 1호(계속결손)만 자동. 2·3·4·5·6·7·8호는 `:89` 주석 "후속 PR".
- ⚠️ **실측 정정**: 비상장 평가 **input 타입·Zod에 `explicitExclusionReason` 필드가 없다**(`unlisted-stock-valuation.types.ts`는 `isContinuousLossLastThreeYears`·`isMaxShareholder`·`companySize`만, Zod `unlisted-stock-valuation-v2.schema.ts:162-166` 동일). 헬퍼 `MaxShareholderPremiumInput`만 optional로 받으나 상위에서 항상 undefined → **비상장 2호는 현재 입력·적용 경로가 전무**. 입력 위젯도 `CorporateInfoSection`에 companySize·isMaxShareholder·계속결손만 존재. → 비상장 2호 구현은 input 필드 + Zod + UI 위젯 **전부 신설** 필요(상장보다 신규 작업 많음).

**상장** (`types/listed-stock-valuation.types.ts:30`) — `art53_8_1`~`art53_8_9` 코드, 라벨(`data/listed-premium-exclusion-labels.ts:20`)이 **본문과 대거 불일치**:

| 코드 | 현재 라벨 (오류) | 실제 §53⑧ |
|---|---|---|
| art53_8_2 | 직전 3년 매출 평균 30억 이하 | **2호 = 전부매각** |
| art53_8_3 | 사업개시 후 3년 미만 | 3호 = 증여이익 계산 |
| art53_8_4 | 평가기준일 전후 6개월 매매사실 | 4호 = 종속회사 최대주주 |
| art53_8_5 | 상속·증여 후 1년 내 청산 | 5호 = 사업개시 3년+영업손실 |
| art53_8_6 | 잔여 존속기한 3년 내 | 6호 = 신고기한 내 청산 |
| art53_8_7 | 80% 보유 법인 청산 | 7호 = 상속·증여로 최대주주 미해당 |
| art53_8_8 | 최대주주 주식가액 합 30억 이하 | 8호 = §45의2 명의신탁 |
| art53_8_9 | 그 밖에 시행규칙 | 9호 = 중소·중견기업 |

→ 1호만 우연히 일치. 나머지는 §53⑧에 없는 사유이거나 호 번호가 밀려 있음. 판정 `resolveListedPremiumRate`(`property-valuation-stock.ts:85`)는 선택값을 그대로 할증률 0 처리(세부 검증 없음).

---

## 2. 목표

1. **상장 배제사유 enum·라벨을 §53⑧ 1~9호 본문대로 전면 정정**. 상장·비상장을 **공용 `StockPremiumExclusionReason` 타입으로 흡수**(비상장 import도 공용 타입으로 전환) → enum·라벨 단일 출처화(dual-truth 차단).
2. **§53⑧2호(전부매각) 세부 요건을 상장·비상장 양쪽에 보조입력 + 검증 게이트로 구현**:
   - 보조입력: ⓐ 전부 매각 여부, ⓑ §49①1호 적합(정상 매매거래) 여부, ⓒ 매각(매매계약)일, ⓓ 상속/증여 구분.
   - 게이트: 요건 모두 충족 시에만 할증 배제(premiumRate=0). 미충족 시 배제 무효 + 사유 안내. (상속=전후 6개월, 증여=전 6개월~후 3개월 기간 검증)

---

## 3. 케이스 매트릭스 (§53⑧2호 검증 게이트)

평가기준일 D, 매매계약일 S, 구분(상속/증여):

| # | 전부매각 | §49①1호 적합 | S 위치 | 구분 | 결과 |
|---|---|---|---|---|---|
| 1 | O | O | D−6m ≤ S ≤ D+6m | 상속 | **배제(0%)** |
| 2 | O | O | D−6m ≤ S ≤ D+3m | 증여 | **배제(0%)** |
| 3 | O | O | D+3m < S ≤ D+6m | 증여 | 무효(기간초과) → 할증 |
| 4 | O | O | S < D−6m | 상속/증여 | 무효(기간초과) → 할증 |
| 5 | X (일부매각) | O | 기간내 | 상속/증여 | 무효(전부매각 아님) → 할증 |
| 6 | O | X (특수관계 부당) | 기간내 | 상속/증여 | 무효(§49①1호 부적합) → 할증 |
| 7 | 보조입력 미입력 | — | — | — | 보수적 할증 적용 + validate 차단 |

> "할증"은 companySize=large·최대주주이면서 다른 배제사유 없을 때만 20%. 그 외(중소·중견 등 9호)는 다른 경로로 배제될 수 있음(2호와 독립).

---

## 4. 설계

### 4-1. enum 통일 (상장)

`ListedPremiumExclusionReason`을 비상장 시맨틱과 동일하게 재정의(`none` 추가 유지). 권장: **공용 enum + 공용 라벨 단일 출처**로 통합.
- 신규 공용 타입(예: `lib/tax-engine/types/stock-premium-exclusion.types.ts`) `StockPremiumExclusionReason` = 비상장 9종 + `none`.
- 라벨 단일 출처: 신규 `stock-premium-exclusion-labels.ts`로 승격. **`Record<StockPremiumExclusionReason, string>` 타입 강제**(컴파일러가 라벨 누락 catch — `enum-verification-before-mapping` 정책). 본문 문구는 §53⑧ 1~9호 그대로.
- **데이터 마이그레이션**: 기존 저장된 `art53_8_*` 값(sessionStorage/IndexedDB)을 신 코드로 매핑하는 normalize 추가.

  | 기존 상장 코드 | 신 공용 코드 | 근거 |
  |---|---|---|
  | `art53_8_1`(계속결손) | `continuous_loss_3y` | 의미 일치(우연) |
  | `art53_8_4`("매매사실") | `all_sold_within_6m` | 2호 의도 추정 |
  | `smb_med`(중소·중견) | `small_medium_enterprise` | 9호 일치 |
  | 그 외(`art53_8_2·3·5·6·7·8·9`) | `none` | 호 번호 무의미했음 → 보수적 초기화 + 재선택 유도 |
  ※ 매핑 규칙은 Do 전 최종 확정.

### 4-2. 2호 세부요건 입력 모델 (상장+비상장 공용)

엔진 input에 optional 추가(2호 선택 시에만 활성):
```
section53_8_2?: {
  allSharesSold: boolean;        // ⓐ 전부 매각
  meetsArticle49_1_1: boolean;   // ⓑ §49①1호 적합(정상 매매)
  saleContractDate: Date;        // ⓒ 매매계약일 (§49②1호 기준일)
  transferType: "inheritance" | "gift"; // ⓓ 상속/증여
}
```
> **평가기준일 D 소스**(신규 입력 아님): 상장=`context.valuationDate`(orchestrator 주입, `property-valuation-stock.ts:226`), 비상장=`input.evaluationDate`(`unlisted-orchestrator.ts:384` 호출부). 게이트 함수는 D를 **매개변수**로 받아 양쪽 명칭(valuation/evaluation) 차이에 비의존.
>
> **3-state·미러링 정책**: `section53_8_2?`는 optional 객체(`feedback_three_state_optional_mode_toggle` — undefined/존재 구분, length 파생 금지). UI 활성화는 2호 선택 onChange에서 **직접 set**, `useEffect→store` 미러링 금지(`mirror-pattern`).

### 4-3. 검증 게이트 (공용 순수 함수)

`evaluateSection53_8_2(input: Section53_8_2Input, valuationDate: Date)` → `{ eligible: boolean; failReason?: ... }`:
1. `allSharesSold && meetsArticle49_1_1` 아니면 무효.
2. 기간: 상속 `D−6m ≤ S ≤ D+6m`, 증여 `D−6m ≤ S ≤ D+3m`. date-fns `addMonths`/`subMonths`(경계 포함). 6개월 산정 선례 `tax-utils.ts:278` 패턴 참조.
3. 미충족 시 `eligible=false` + 사유 코드.
- 판정 통합: 상장 `resolveListedPremiumRate`·비상장 `calcMaxShareholderPremium`이 2호 선택 시 이 게이트를 호출. eligible=false면 2호 배제 미적용(다른 배제사유 평가는 계속).
- **단일 출처**: 게이트 함수를 양쪽이 import(엔진 헬퍼 재사용 정책 — single-source-engine-helper).

### 4-4. 결과 표시

배제 적용 시 라벨 echo. 미충족 시 결과 카드에 "§53⑧2호 요건 미충족(사유) → 할증 적용" 안내(rose tone).

---

## 5. 동기화 지점 (Do 단계 grep 확정)

신규 enum 값·2호 입력객체 = 14지점 전수 점검 대상. 실측 확인된 주요 지점:

**상장**: ① EstateItem 필드(`types/inheritance-gift.types.ts:82` re-export) · ⑤ UI `ListedStockBesshiAttributesSection.tsx:207`(select) + 2호 보조입력 위젯 신설 · ⑦ 결과뷰 **두 곳** `inheritance/listed-stock/ListedStockBesshiResultView.tsx` + `results/ListedStockBesshiResultSection.tsx` · ⑫ Zod **`validators/estate-item-schema.ts`**(확정) · 라벨 신규 `stock-premium-exclusion-labels.ts`.

**비상장**: ① `unlisted-stock-valuation.types.ts:26`(enum) + **2호 input 필드 신설** · 판정 `max-shareholder-premium.ts:71` · ⑫ Zod `validators/unlisted-stock-valuation-v2.schema.ts:162-166`(배제사유 입력 신설) · ⑤ UI 입력 위젯 신설 — 위치 `unlisted-stock-v2/CorporateInfoSection.tsx`(companySize·isMaxShareholder·계속결손 입력부) · ⑦ 결과 `unlisted-stock-v2/PerShareValuationResultCard.tsx`.

⚠️ **미확인 → Do 첫 단계에서 grep 확정**: 상장 API 변환(④⑬)·route 매핑(⑭), 양쪽 사이드바(⑥)·validate(⑧), 공용 게이트 import 지점.

---

## 6. anchor 테스트 (Pre-Do 우선 작성)

- `premium-53-8-2-gate`: 케이스 매트릭스 1~7 각각 — 게이트 함수 단위 테스트(상속/증여 경계일 포함).
- `stock-premium-label-53-8`: 공용 라벨 9종이 §53⑧ 본문과 1:1 (`Record` 완전성).
- `stock-premium-migration`: 기존 상장 `art53_8_*`/`smb_med` 저장값 → 공용 코드 normalize 매핑(§4-1 표).
- `unlisted-premium-53-8-2`: 비상장 2호 보조입력 → premiumRate 0/0.2 분기(신설 input 경로).
- 경계: 증여 D+3m 당일(포함) vs D+3m+1일(초과), 상속 D−6m 경계.

---

## 7. Scope-out / 후속

- §53⑧ 3·4·5·6·7·8호의 **자동 판정**(현재 수동 선택)은 본 작업 범위 밖 — 라벨/시맨틱만 정정, 수동 선택 유지.
- §22②(금융재산공제 배제)는 별개 개념 — 무관.
- 상장 데이터 마이그레이션 매핑 규칙 최종 확정은 Do 진입 시.

---

## 8. 리스크

- **데이터 호환(상장)**: 기존 `art53_8_*` 저장값 의미 손상 → normalize 마이그레이션 필수(§4-1 표). 매핑 불명 항목은 `none`으로 보수 처리.
- **enum 통합 범위**: 상장/비상장 공용화는 import 지점 다수 변경 → 14지점 누락 위험. grep 전수 + `ui-engine-sync-checker`.
- **비상장 신규 작업량**: 비상장 2호는 input 필드·Zod·UI 위젯이 **전무**해 전부 신설(상장은 select 교체 위주) → 비상장 쪽이 작업량 큼. Do 시 비상장 14지점 별도 전수.
- **차단 validation(⑧)**: 2호 선택 후 보조입력 미입력 차단은 UI도 동일 차단(통과↔차단 모순 금지, `feedback_validation_sync_8th_point`). validate 추가 시 **전체 E2E 회귀 baseline 대조**(`feedback_blocking_validation_full_e2e_regression`).
- **§49①1호 적합 자동판정 불가**: 사용자 체크박스 확인으로 대체(법적 한계 명시).
