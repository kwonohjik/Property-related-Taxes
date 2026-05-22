# Engine Design — 상속세 비상장주식 평가 (별지 부표3 완전 재현)

> **Plan**: [`docs/00-pm/inheritance-unlisted-stock-valuation-besshi-4-buppyo-3.plan.md`](../../00-pm/inheritance-unlisted-stock-valuation-besshi-4-buppyo-3.plan.md)
> **Legal Verification**: [`inheritance-unlisted-stock-valuation.legal-verification.md`](./inheritance-unlisted-stock-valuation.legal-verification.md)
> **Date**: 2026-05-22

---

## 1. 케이스 매트릭스 (계획서 §3 ↔ 본 디자인 1:1 동기화)

| Case ID | PDF 사례 | 입력 핵심 | 분기 경로 | 엔진 모듈 | 1주당 평가액 | anchor ID |
|---|---|---|---|---|---|---|
| **D-1** | (1) 순손익가치 단독 | 사업연도별 가산·차감, 자본 변동 2건 | `fiscal-year-net-income` + `converted-shares` + `weighted-avg` | 7,150원 | U-1·U-2·U-3·U-4·U-5·U-6 |
| **D-2** | (2) 사업개시 3년 이상 가중평균 | 1주당 순손익 4,840·순자산 5,000 직접입력 | 본칙 가중평균 + 80% 하한 미발동(5,000×80%=4,000 < 4,904) | `weighted-avg` | 4,904원 | U-7 |
| **D-3** | (3) 순자산(△) → 0 | 1주당 순손익가치 2,800(=가중평균280÷0.1)·1주당 순자산가치 △3,000→0 | §55① 후단 → 순자산 0 | `net-asset-calc` + `weighted-avg` | 1,680원 | U-8 ⚠️ |
| **D-4** | (4) 양쪽 0 | 1주당 가중평균 △758(음수→0)·1주당 순자산 0 | §55·§56① 양쪽 0 | `weighted-avg` | 0원 | U-9 |

> ⚠️ **D-3 PDF 손계산 정합성 미정**: PDF 해설 사례 3은 가중평균 = `(550×3 + (△120)×2 + △210)/6 = 280원` 표기. 손계산 = `(1,650 − 240 − 210)/6 = 1,200/6 = 200`. PDF 280이 의도된 값(→ 1주당 가액 1,680원과 정합)이려면 분자가 1,680이어야 함. **PDF 자체 오기 가능성**. Pre-Do anchor 실행 시 손계산 200원이 도출되면 → PDF 자체 오기로 인정하고 PDF 표기 anchor U-8(1,680원)을 손계산 정합값(1,200원)으로 정정. 또는 PDF 산식이 다른 가중치를 사용한 것인지 추가 검증.
| **D-5** | (5) 유상증자·중소·최대주주 | 환산주식수 + §53⑧9호 중소기업 할증 배제 + 영업권 31,747,950 | `goodwill` + `max-shareholder-premium` 0 | 10,456원 | U-10·U-11·U-19 |
| **D-6** | (6) 종합·일반기업·최대주주 ×120% | 사례 6 입력 전체 + 별지 부표3 6쪽 | 전체 파이프라인 + 영업권 0 (초과이익 음수) | 10,910 → 13,092 | U-12·U-13·U-14·U-15·U-16·U-17·U-18·U-20 |
| **D-7** | (가) §54④ 1호 청산 | `netAssetOnlyReason="liquidation"` | 순자산 단독, 80% 하한 미적용, 영업권 자동 0 (§55③1호) | `unlisted-orchestrator` short-circuit | 순자산÷주식수 | (후속 anchor) |
| **D-8** | (나) §54④ 2호 사업개시 3년 미만 | `businessStartDate` 자동 분기 | 순자산 단독 | `unlisted-orchestrator` | — | (후속 anchor) |
| **D-9** | (다) §54④ 3호 부동산 80% | `netAssetOnlyReason="real_estate_80"` | 단서: 가중평균 < 순자산일 때만 순자산 적용 | `unlisted-orchestrator` | — | (후속 anchor) |
| **D-10** | (마) §54④ 5호 주식 80% | `netAssetOnlyReason="stock_holding_80"` | 단서: 가중평균 < 순자산일 때만 | `unlisted-orchestrator` | — | (후속 anchor) |
| **D-11** | (바) §54④ 6호 잔여 3년 | `netAssetOnlyReason="remaining_3y"` | 순자산 단독, 무조건 | `unlisted-orchestrator` | — | (후속 anchor) |
| **D-12** | 부동산과다보유 (§54① 단서) | `isRealEstateHeavy=true` | 가중치 반전 (2·3/5) | `weighted-avg` | — | (후속 anchor) |
| **D-13** | 영업권 §55③ 결손법인 배제 | `isContinuousLossLastThreeYears=true` | 영업권 자동 0 | `goodwill` | — | (후속 anchor) |

---

## 2. 모듈 구조 (계획서 §5 Phase 2~4 ↔ 본 디자인 1:1)

```
lib/tax-engine/property-valuation/
├── unlisted-orchestrator.ts             # Phase 4: evaluateUnlistedStockV2() 진입점
│                                          # → §54④ 분기 short-circuit
│                                          # → 가중평균 vs 순자산 단독 선택
│                                          # → 80% 하한 적용
│                                          # → 할증평가 적용
│                                          # → 별지 부표3 매핑 결과 조립
│
├── fiscal-year-net-income.ts            # Phase 2: 사업연도별 순손익액 (다. 산출)
│                                          # input: FiscalYearAdjustment
│                                          # output: { adjustedNetIncome, addTotal, subTotal }
│                                          # §56④ 가산 ②~⑦ + 차감 ⑧~㉒
│
├── capital-increase-adjustment.ts       # Phase 2: 유상증자·감자 순손익액 조정 (라. 산출)
│                                          # §56⑤: 1주당 납입금액 × 증가 주식수 × 이자율
│                                          # 이자율 = §17의3⑥ → §17 = 10% (★ 비상장 환원율과 동일 본칙)
│                                          # + 유상증자 사업연도 월할 (1개월 미만 1개월)
│
├── converted-shares.ts                  # Phase 2: 환산주식수 (바. 산출)
│                                          # 상증규 §17의3⑤: 증자 환산식
│                                          #   환산주식수 = 증자전 사업연도말 주식수
│                                          #              × (증자직전 사업연도말 + 증자주식수) / 증자직전 사업연도말
│                                          # 감자 환산식: 분자 부호 반전
│
├── weighted-avg.ts                      # Phase 2: 3년 가중평균 (아. 산출)
│                                          # §56①: (1년×3 + 2년×2 + 3년×1) / 6
│                                          # 음수 시 0 (§56① 후단)
│                                          # ÷ 환원율(10% — ★ 상증규 §17) = 1주당 순손익가치
│                                          # ★ Pre-Do P1-A1 환류: floor 시점 = PDF 산식 준수
│                                          #   - 1주당 가중평균 = floor((사·1년×3 + 사·2년×2 + 사·3년×1) / 6)
│                                          #   - 1주당 순손익가치 ⑤ = floor(가중평균 ÷ 환원율)
│                                          #   - "회사 전체 가중평균 ÷ (주식수×환원율)" 단일 floor 금지
│                                          #     (사례 6 현행: 11,668 vs PDF 11,660 — 8원 차이 발생)
│
├── net-asset-calc.ts                    # Phase 3: 순자산가액 (③ 산출)
│                                          # 자산총액(①~⑧) − 부채총액(⑨~⑱)
│                                          # 평가차액 가산, 0 이하 시 0 (§55① 후단)
│                                          # 장부가액 하한 (§55① 후단)
│                                          # ★ §55② → 상증규 §17의2 1~4호 매핑:
│                                          #   1호 (자산 가산): 평가기준일 현재 지급받을 권리 확정 가액
│                                          #   2호 (자산 차감): 선급비용 + 법인세령 §24①2호바목 무형자산
│                                          #   3호 (부채 가산): 가.법인세·농특·지방 / 나.확정 배당·상여 / 다.퇴직급여 추계액
│                                          #   4호 (부채 차감): 제충당금·제준비금 (단서 가·나·다 제외)
│                                          # §55③: 영업권 가산 자동 판정 후 합산
│
├── goodwill.ts                          # Phase 3: 영업권 평가 (§59②)
│                                          # 별지 5쪽 표:
│                                          #   가. weightedAvg3y (= §56① 준용 §59③)
│                                          #   나. 가 × 50%
│                                          #   다. selfCapital (= §55① 영업권 포함 전 순자산가액)
│                                          #   라. 10% (★ 상증규 §19① — §17 아님)
│                                          #   마. 다 × 라
│                                          #   사. ∑(나−마)/(1.1)^n for n=1..5
│                                          #     ※ 상수일 때 = (나−마) × 3.7908 (5년 연금현가)
│                                          #   자. max(사 − 아, 0)
│                                          # §55③ 자동 배제: liquidation·real_estate_80·lt3y(단서 외)·결손3년
│
├── max-shareholder-premium.ts           # Phase 4: 할증평가 (§63③ + §53)
│                                          # §53④ 최대주주 정의: 보유 가장 많은 1인
│                                          # §53⑤: 평가기준일 소급 1년 내 양도·증여 합산
│                                          # 할증률: ×120% (×0.20 가산)
│                                          # 배제 사유 9가지 (§53⑧ 1~9호):
│                                          #   small_medium_enterprise (9호) 핵심
│                                          # 결과: premiumPerShare = floor(finalPerShareValue × 1.20)
│
└── besshi-form-mapper.ts                # Phase 5 진입 직전: 결과 ↔ 별지 부표3 6쪽 매핑
                                          # output: BesshiForm4Buppyo3Data 구조체
                                          # UI 컴포넌트(PerShareValuationResultCard 등) 직접 import
```

---

## 3. 진입점 시그니처

```ts
// lib/tax-engine/property-valuation/unlisted-orchestrator.ts

import type {
  UnlistedStockValuationInput,
  UnlistedStockValuationResult,
} from "../types/inheritance-gift.types";

/**
 * 비상장주식 V2 평가 (별지 부표3 완전 재현)
 *
 * 파이프라인:
 *   1) §54④ 사유 short-circuit (1·2·6호 무조건 / 3·5호 단서)
 *   2) 각 사업연도 다. 순손익액 (fiscal-year-net-income)
 *   3) 라. 유상증자·감자 조정 (capital-increase-adjustment)
 *   4) 바. 환산주식수 (converted-shares)
 *   5) 사·아. 가중평균 (weighted-avg) ÷ 환원율 = 1주당 순손익가치 ⑤
 *   6) 순자산가액 (net-asset-calc) + 영업권 (goodwill) = ③
 *   7) ③ ÷ 발행주식총수 = ④ 1주당 순자산가액
 *   8) 가중평균 ⑥-㉠ = (⑤×3 + ④×2)/5 (부동산과다보유 시 (⑤×2+④×3)/5)
 *   9) 80% 하한 ⑥-㉡ = ④ × 0.8
 *  10) ⑥ = max(㉠, ㉡) — 단 §54④ 사유 시 ④ 단독
 *  11) ⑦ = ⑥ (비최대주주) / ⑧ = ⑥ × 1.20 (최대주주, 단 §53⑧ 9호 사유 시 ×1.0)
 *  12) ⑨ = isMaxShareholder ? ⑧ : ⑦
 *  13) totalValuation = ⑨ × ownedShares
 */
export function evaluateUnlistedStockV2(
  input: UnlistedStockValuationInput,
): UnlistedStockValuationResult;
```

---

## 4. anchor 매트릭스 cross-link (계획서 §6 ↔ 본 디자인)

| anchor | 계획서 §6 | 본 디자인 Case ID | 검증 모듈 | toBe 값 |
|---|---|---|---|---|
| U-1 | (1) 2021 순손익액 | D-1 | `fiscal-year-net-income` | 120,000,000원 |
| U-2 | (1) 2021 환산주식수 | D-1 | `converted-shares` | 180,000 |
| U-3 | (1) 2020 환산주식수 | D-1 | `converted-shares` | 180,000 |
| U-4 | (1) 2019 환산주식수 | D-1 | `converted-shares` | 180,000 |
| U-5 | (1) 가중평균 | D-1 | `weighted-avg` | 715 |
| U-6 | (1) 1주당 순손익가치 | D-1 | `weighted-avg` ÷ env rate | 7,150원 |
| U-7 | (2) 1주당 평가액 | D-2 | `weighted-avg` + 80%하한 | 4,904원 |
| U-8 | (3) 1주당 평가액 | D-3 | `net-asset-calc` 0 처리 | 1,680원 |
| U-9 | (4) 양쪽 0 | D-4 | both 0 | 0원 |
| U-10 | (5) 할증전 | D-5 | `weighted-avg` | 10,456원 |
| U-11 | (5) 상속재산가액 | D-5 | `max-shareholder-premium` ×1.0 | 104,560,000원 |
| U-12 | (6) 순자산가액 영업권전 | D-6 | `net-asset-calc` | 489,351,700원 |
| U-13 | (6) 영업권 평가 | D-6 | `goodwill` (음수→0) | 0원 |
| U-14 | (6) 1주당 순손익가치 ⑤ | D-6 | `weighted-avg` | 11,660원 |
| U-15 | (6) 1주당 순자산가치 ④ | D-6 | `net-asset-calc` | 9,787원 |
| U-16 | (6) 1주당 평가액 ⑥ | D-6 | `unlisted-orchestrator` | 10,910원 |
| U-17 | (6) 1주당 평가액 ⑧ 할증후 | D-6 | `max-shareholder-premium` | 13,092원 |
| U-18 | (6) 상속재산가액 | D-6 | `unlisted-orchestrator` | 340,392,000원 |
| U-19 | (5) 영업권 | D-5 | `goodwill` | 31,747,950원 |
| U-20 | (6) 할증 배제 사유 | D-6 | `max-shareholder-premium` | undefined (일반) |

**총 20개 anchor** — 계획서 §6 18개 + D-1·D-5 cross-cutting integration 2개 + D-7~D-13 후속 anchor 7개 (Phase 6).

---

## 5. 800줄 정책 점검 (예상)

| 파일 | 예상 LoC | 비고 |
|---|---|---|
| `unlisted-orchestrator.ts` | ~250 | 분기 + 조립 |
| `fiscal-year-net-income.ts` | ~150 | ①~㉒ 합산만 |
| `capital-increase-adjustment.ts` | ~120 | 월할 + 이자율 |
| `converted-shares.ts` | ~100 | §17의3⑤ 환산 |
| `weighted-avg.ts` | ~80 | 3·2·1/6 + ÷환원율 |
| `net-asset-calc.ts` | ~200 | 자산·부채 조립 + 영업권 가산 |
| `goodwill.ts` | ~150 | 5년 ∑ + §55③ 자동 배제 |
| `max-shareholder-premium.ts` | ~180 | §53⑧ 9사유 enum 매핑 |
| `besshi-form-mapper.ts` | ~220 | 결과 → 6쪽 양식 매핑 |
| **합계** | **~1,450** | 9개 파일 모두 800줄 미만 |

기존 `property-valuation-stock.ts`는 그대로 유지(`UnlistedStockData` legacy 입력). 신규 진입점 `evaluateUnlistedStockV2`는 새 파일 별도. `evaluateUnlistedStock(item)` 내부에서 `item.unlistedStockValuationV2` 우선 → 신규 모듈 호출, 없으면 legacy.

---

## 6. 미정 사항 (계획서 §10 동기화)

- ✅ §54④ 4호 vs 5호 → 4호 삭제, 5호 = 주식 80% 단서 (확정)
- ✅ 영업권 자기자본 정의 → 평가기준일 현재 = 영업권 포함 전 순자산 (확정)
- ✅ 사례 6 1주당 평가액 10,910원 → 일반 본칙 (⑤×3+④×2)/5 = 10,910.8 = 10,910 (확정, 80% 하한 미발동)
- ✅ 환원율 본칙 — §54①은 §17 / §59②은 §19① (2차 검증 분리, 둘 다 10%)
- ✅ §55② 무형·준비금·충당금 → §17의2 1~4호 (2차 검증 매핑 확정)
- ✅ 부동산과다보유법인 정의 → 자산총액 중 토지·건물·권리 ≥ 50%, 양도조건 불적용 (2차 검증)
- ⚠️ **5년 연금현가 3.7908 본칙 위치** — 평가심의위 별지 양식 산식만 확인됨. F-8 후속 PR
- ⚠️ **사례 6 자본금 393M ↔ 액면가합 250M 차이** — 잉여금 자본전입 등 별도 변동. 사례 1 자본금 변동 입력 표로 흡수 가능
- ✅ **D-3 PDF 가중평균 280 vs 손계산 200** — Pre-Do P1-B 실행 완료. **PDF 오기 확정** (손계산 1,200/6=200). U-8 anchor를 1,680원 → **1,200원** (손계산 정합)으로 정정 필요. PDF 표기 보존은 회사전체 입력 28M 역산 케이스로 별도 보존
- ✅ **사례 6 1주당 평가액 floor 시점 차이** — Pre-Do P1-A 실행 완료. 현행 엔진 11,668/10,915 vs PDF 11,660/10,910. `weighted-avg.ts`는 PDF 산식 준수(1주당 floor 후 가중평균)로 환류 반영
- 추가 후속 PR: F-10 §63② 기업공개준비중 (§57) / F-11 보험사업 §17의2 4호 단서
