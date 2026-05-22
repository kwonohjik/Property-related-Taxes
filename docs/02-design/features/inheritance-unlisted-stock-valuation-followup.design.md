# 비상장주식 평가 별지 4호 부표3 — 후속 PR 디자인 문서 (v3)

> **Status**: Design v3 — 11단계 자가검토 통과 (1차·2차·통합비교)
> **검토 라운드**: 1차 6건 → 2차 4건 → 통합비교 8건 정정 (총 18건)
> **계획서 동기화**: plan v3.x (17 PR)
> **계획서**: [`inheritance-unlisted-stock-valuation-followup.plan.md`](../../00-pm/inheritance-unlisted-stock-valuation-followup.plan.md)
> **선행 commit**: `8f2eda1` (Phase 6 PDCA 완료)
> **본 디자인 범위**: 후속 PR 17건 중 우선순위 ★★★/★★ 9건 (PR-A·B·C·D·E·F·G·N·Q) 상세 + 나머지 8건 골격
> **Date**: 2026-05-22

---

## 0. 디자인 원칙

1. **단일 진실 (Single Source of Truth)**: 본 계획서 §1 (1·2·3·5·6쪽 칸 번호 표)을 본 디자인 문서로 이관 → testid 동결. 사례 6 실값은 anchor의 단일 기준.
2. **3중 패턴 강제 (Mirror Pattern)**: UI display fallback이 있는 필드는 API 변환·validate 모두 동일 fallback 적용. useEffect→store 미러링 금지.
3. **800줄 정책**: 모든 신규/수정 파일 800줄 이하. 위반 시 sibling 분리.
4. **법령 정확성 우선**: 산식·anchor는 KoreanLaw 본문(상증령 §53·§54·§55·§56·§59 + 상증규 §17·§17의2·§17의3·§19) 직접 인용. PDF 사례값 우선 추종 금지 (계산값 일치 시에만 인용).
5. **명시 입력 (Silent Omission 차단)**: 평가차액 행 단위·추정이익 사유·자기주식 분기 등은 사용자 명시 입력 강제. 자동 fallback 금지.
6. **80% 하한 시각 표시 (DO4 정정)**: 1쪽 ⑥ "1주당 평가액 = max(㉮, ㉯)"에서 ㉯ 80% 하한이 발동될 때 결과 카드에 rose 배지 "80% 하한 적용 (가중평균 < 순자산 × 80%)" + 출처 라벨 "§54① 단서". 가중평균 모드일 때만 발동 (순자산 단독 모드는 N/A).

---

## 0-1. 양식 칸 번호 참조 (Plan §1 동기화)

> **통합비교 정정**: 본 디자인 §1·§4·§7 매트릭스의 칸 번호 (①~㉒, 가~차, ㉮~㉰)는 모두 **계획서 §1** ([`inheritance-unlisted-stock-valuation-followup.plan.md#1-별지-부표3-6쪽-양식-칸-번호-동결-이미지-1·2·3·5·6쪽-기준`](../../00-pm/inheritance-unlisted-stock-valuation-followup.plan.md)) 양식 표를 단일 진실로 한다. testid 패턴 `besshi-buppyo3-page{N}-{slot}-{number}` 동일.

## 0-2. §54④ 가나다라마바 ↔ 호 매핑 표 (통합비교 정정)

| 양식 위치 | 법령 호번호 | 사유 | 단서 |
|---|---|---|---|
| 가 | **1호** | 청산절차 진행 | 무조건 순자산 단독 |
| 나 | **2호** | 사업개시 3년 미만·휴폐업 | §55③ 2호 단서 (개인사업자 + 영위 3년 합산) 충족 시 영업권 가산 |
| 다 | **구 3호 (2018.2.13. 삭제)** | 결손금 (양식엔 잔존, 적용 X) | — |
| 라 | **현 3호** | 부동산 80% (소법 §94①4호다목1·2 합계) | §54④ 단서 — 가중평균 < 순자산일 때만 순자산 |
| 마 | **현 5호** (구 4호 자체 삭제) | 주식등 80% | §54④ 단서 — 가중평균 < 순자산일 때만 순자산 |
| 바 | **현 6호** | 잔여존속기한 3년 이내 | 무조건 순자산 단독 |

> ★ 사용자 혼동 방지를 위해 본 디자인의 D-7~D-13 anchor 매트릭스는 **법령 호번호**(예: §54④ 1호)로 표기하고, UI 컴포넌트의 ToggleCard 라벨은 **양식 위치**(예: "가. 청산절차")로 표기한다. 두 표기 매핑은 본 표를 참조.

---

## 1. 케이스 매트릭스 (PR-A·D·E·F·G·N·P·Q 10건 통합)

| ID | PR | 케이스 | 입력 핵심 | 기대 출력 | 법령 근거 | 비고 |
|---|---|---|---|---|---|---|
| **D-7** | PR-A | §54④ 1호 청산절차 진행 | `netAssetOnlyReason="liquidation"` + 자기자본 5억 + 10,000주 | 1주당 = 50,000 (순자산÷주식수), 영업권 자동 0 (§55③ 1호) | §54④ 1호 + §55③ 1호 | 80% 하한 미적용 |
| **D-8** | PR-A | §54④ 2호 사업개시 3년 미만 | `businessStartDate` 평가기준일 -2년 11월 | 순자산 단독 | §54④ 2호 + §55③ 2호 본문 | 단서 가·나 (개인사업자 현물출자 + 영위 3년 합산) 미충족 |
| **D-9a** | PR-A | §54④ 3호 부동산 80% (단서 적용) | `netAssetOnlyReason="real_estate_80"` + 가중평균 > 순자산 | 가중평균 적용 | §54④ 3호 단서 | "제3호 및 제5호의 경우에는 가중평균이 순자산보다 낮은 경우로 한정" |
| **D-9b** | PR-A | §54④ 3호 (단서 미적용) | 동일 + 가중평균 < 순자산 | 순자산 적용 | 동일 | 영업권 §55③ 1호로 자동 0 |
| **D-10a** | PR-A | §54④ 5호 주식 80% (단서 적용) | `netAssetOnlyReason="stock_holding_80"` + 가중평균 > 순자산 | 가중평균 적용 | §54④ 5호 단서 | 동일 |
| **D-10b** | PR-A | §54④ 5호 (단서 미적용) | 동일 + 가중평균 < 순자산 | 순자산 적용 | 동일 | 영업권은 §55③에 명시 X → 가산 검토 |
| **D-11** | PR-A | §54④ 6호 잔여존속기한 3년 | `netAssetOnlyReason="remaining_3y"` | 순자산 단독, 무조건 | §54④ 6호 | 단서 적용 X |
| **D-12** | PR-A | 부동산과다보유 (§54① 단서) | `isRealEstateHeavy=true` + 순손익 100·순자산 200 | (100×2+200×3)/5 = 160 (가중치 반전) | §54① 괄호 (소법 §94①4호다목) | 80% 하한 = 200×80%=160 동일 |
| **D-13** | PR-A | 영업권 §55③ 3호 3년 결손 배제 | `isContinuousLossLastThreeYears=true` | 영업권 = 0 | §55③ 3호 | 결손법인 영업권 가산 X |
| **B-1** | PR-B | 증여세 사례 6 동일 시나리오 | 동일 입력 + `transferType="gift"` + 증여일 2024-01-20 + 수증자=직계비속 성년 | 1주당 13,092 / 증여재산가액 340,392,000 (26,000주) / 증여공제 5천만 / 산출세액 (별도 계산) | §63①1호나목 + §53①1호 (증여공제) | 본 계획서 PR-B |
| **GW-1** | PR-C | 영업권 음수 가드 | 자기자본 489,351,700 + 가중평균 58,341,511 | 나(29,170,755) − 마(48,935,170) < 0 → 영업권 0 | §59② + §19① + 별지 양식 Σ | 사례 6 동일 |
| **GW-2** | PR-C | Σ 합산 정확값 | 자기자본 1억 + 가중평균 5천만 → 나(25M) − 마(10M) = 15M | Σ[(15M)/(1.1)ⁿ] = 56,861,850 (1원 이내) | 동일 | (1.1)⁻¹+...+(1.1)⁻⁵ × 15M |
| **GW-3** | PR-C | Σ vs 3.7908 일괄 곱셈 동일성 | GW-2 입력 | 두 방식 결과 1원 이내 일치 | 동일 | 본 PR 엔진 산식 grep 후 결정 |
| **BI-1** | PR-D | 무상증자 단독 (사례 1 변형) | 사례 1 유상증자 → 납입금액=0 + 무상증자 비율 동일 | 환산주식수 동일 / 순손익액 조정 = 0 / 1주당 평가액 동일 | §56⑤ 1호 + §17의3⑤ 1호 | "증자 또는 감자" 통합 환산식. anchor ID 일관성: D-9c → BI-1 (Bonus Issue) |
| **E-1** | PR-E | §22② 최대주주 자동 도출 (자동 ON) | `ownedShares=30000` / `totalShares=50000` (60% 보유) | `isSection22Major=true` 자동 + §22② 추가공제 자동 제외 | **§22②** (DL2 정정) | §63③ 할증은 선행 PR 기존 모듈 별도 |
| **E-2** | PR-E | 자동 OFF (수동 override) | `ownedShares=10000` / `totalShares=50000` (20%) + 사용자 토글 ON | `isSection22Major=true` (수동 우선) | §22② | 3-state 모드 |
| **F-1** | PR-F | §54⑤ 부동산과다보유 자동 판정 (이상) | `totalAssets=10억` / `realEstateAssets=5억` (50% 정확) | `isRealEstateHeavy=true` | §54① 괄호 + 소법 §94①4호다목 | "50% 이상" 경계 |
| **F-2** | PR-F | 자동 판정 (미만) | `realEstateAssets=4.9억` (49%) | `isRealEstateHeavy=false` | 동일 | 50% 미만 |
| **G-2~G-8** | PR-G | 추정이익 7사유 (§17의3① 2~8호) | 사유별 1건씩 + 신용평가전문기관 2곳 추정이익 평균 | 가중평균 우회 → 추정이익 적용 | §56② + §17의3① **2·3·4·5·6·7·8호** (★ 1호 삭제) | 1호 삭제 — 7사유 |
| **N-1** | PR-N | 평가차액 행 단위 합계 | 자산 8행 + 부채 3행 (사례 6) | 자산 107,324,150 / 부채 15,775,800 / 평가차액 91,548,350 | §55② + §17의2 | 1쪽 ②와 일치 |
| **N-2** | PR-N | 음수 차액 △ 표시 | 단기대여금 493M < 495M (△2M) | UI에 "△2,000,000" 표시 (음수 부호) | 동일 | 부호 표시 정책 |
| **N-3** | PR-N | 총액 직접 입력 fallback | `assetEvaluationDelta=107,324,150` 직접 + 행 단위 미입력 | 행 단위 미입력 시 총액 직접 사용 (3중 패턴) | 동일 | 회귀 보호 |
| **P-1** | PR-P | §54③ 10% 이하 자기주식 제외 | 다른 비상장 5,000주 / 발행주식 100,000주 (자기주식 50,000주 제외) | 50,000주 기준 10% 정확 = 가능 | §54③ + 법인령 §74①1호마목 | "(자기주식과 자기출자지분은 제외한다)" |
| **P-2** | PR-P | §60① 시가 우선 | P-1 + 시가 명시 | 시가 적용 (법인령 §74 적용 X) | §54③ 단서 | "법 제60조제1항에 따른 시가가 있으면 시가를 우선" |
| **Q-1** | PR-Q | 충당금 확정분 단서 가 (일반법인) | 일반법인 + 충당금 1억 중 평가기준일 비용 확정 7천만 | 부채 차감 미적용 (7천만 부채에 남음) | §17의2 4호 단서 가 | "모든 법인" 적용 보장 |
| **Q-2** | PR-Q | PR-M 보험법인 분리 보장 | 보험법인 + 충당금 1억 (Q-1 동일) + 책임준비금 별도 | Q-1 결과 + 책임준비금은 §17의2 4호 단서 나·다로 별도 처리 | §17의2 4호 단서 가 / 나·다 | PR-M 충돌 없음 검증 |

**총 25개 anchor** (D 7건 + B 1건 + GW 3건 + D-9c·E 3건 + F 2건 + G 7건 + N 3건 + P 2건 + Q 2건 — 합산 30건 anchor 후보, PR별 분리)

---

## 2. 데이터 모델 확장

### 2-1. `UnlistedStockValuationInput` 신규 필드 (PR별)

```typescript
interface UnlistedStockValuationInput {
  // 기존 필드 (생략)

  // PR-E §22② 최대주주 자동 도출 (3-state)
  majorShareholderStockMode?: "auto" | "manual_on" | "manual_off"; // 기본 "auto"
  ownedShares: number;        // 기존 — 자동 판정 입력
  totalShares: number;        // 기존 — 자동 판정 입력

  // PR-F §54⑤ 부동산과다보유 자동 판정 (3-state)
  realEstateHeavyMode?: "auto" | "manual_on" | "manual_off"; // 기본 "auto"
  netAsset: {
    totalAssets?: number;       // 신규 — 자산총액 (자동 판정용)
    realEstateAssets?: number;  // 신규 — 토지·건물·부동산권리 합계

    // PR-N 3쪽 평가차액 행 단위
    assetDeltaRows?: EvaluationDeltaRow[];      // 신규
    liabilityDeltaRows?: EvaluationDeltaRow[];  // 신규

    // PR-Q §17의2 4호 단서 가
    confirmedExpenseAllowances?: number; // 신규 — 충당금 중 평가기준일 비용 확정분 (부채 차감 미적용)

    // 기존 fallback (3중 패턴 유지)
    assetEvaluationDelta?: number;
    liabilityEvaluationDelta?: number;
  };

  // PR-G 추정이익 옵션
  netIncomeMode?: "weighted_avg" | "estimation_2agencies"; // 기본 "weighted_avg"
  estimationReason?: EstimationReasonEnum; // 7사유 (§17의3① 2·3·4·5·6·7·8호)
  estimationAgencyValues?: { agency1: number; agency2: number }; // 둘 이상 평균

  // PR-P §54③ 다른 비상장주식 보유 분기
  otherUnlistedHoldings?: {
    ownedShares: number;              // 다른 비상장 보유주식
    issuedSharesExcludingTreasury: number; // (자기주식·자기출자지분 제외) 발행주식총수
    bookValuePerShare?: number;       // 법인령 §74①1호마목 취득가액
    marketPriceExists?: boolean;      // §60① 시가 존재 여부
    marketPrice?: number;             // 시가 우선
  };
}

interface EvaluationDeltaRow {
  rowId: string;                 // UI key
  category: "asset" | "liability"; // 자산/부채
  accountName: string;           // 계정과목
  evaluationAmount: number;      // 상증법 평가액
  bookAmount: number;            // 재무상태표 금액
  // 차액은 derive (evaluation - book), 자동 계산
}

type EstimationReasonEnum =
  | "reason_2" // §17의3① 2호 자산수증이익 등 50% 초과
  | "reason_3" // §17의3① 3호 합병·분할·주요업종 변경
  | "reason_4" // §17의3① 4호 §38 증여이익 산정
  | "reason_5" // §17의3① 5호 1년 이상 휴업
  | "reason_6" // §17의3① 6호 처분손익+자산수증이익 50% 초과
  | "reason_7" // §17의3① 7호 주요업종 매출 3년 미만
  | "reason_8"; // §17의3① 8호 재정경제부장관 고시
```

### 2-2. `UnlistedStockValuationResult` echo 필드 (PR별)

```typescript
interface UnlistedStockValuationResult {
  // 기존 필드 (생략)

  // PR-E echo
  appliedMajorShareholderStock?: {
    isMajor: boolean;
    ownershipRatio: number; // ownedShares / totalShares
    source: "auto" | "manual"; // 자동 vs 수동
  };

  // PR-F echo
  appliedRealEstateHeavy?: {
    isRealEstateHeavy: boolean;
    ratio: number; // realEstateAssets / totalAssets
    source: "auto" | "manual";
  };

  // PR-N echo
  evaluationDeltaDetail?: {
    assetTotal: number;       // ① 합계 = sum(assetDeltaRows)
    liabilityTotal: number;   // ② 합계
    evaluationDelta: number;  // ①−② → 2쪽 4.가.② 기재
    assetRows: Array<EvaluationDeltaRow & { delta: number }>; // derive 포함
    liabilityRows: Array<EvaluationDeltaRow & { delta: number }>;
  };

  // PR-G echo
  appliedNetIncomeMode?: {
    mode: "weighted_avg" | "estimation_2agencies";
    reason?: EstimationReasonEnum;
    finalValue: number; // 가중평균 또는 추정이익 평균
  };

  // PR-P echo
  appliedOtherUnlistedValuation?: {
    method: "section60_market_price" | "section74_book_value" | "section54_full"; // 어느 산식 적용
    finalValue: number;
  };

  // PR-Q echo
  appliedConfirmedExpenseAllowance?: number; // 부채에 남은 충당금 확정분
}
```

---

## 3. 14 동기화 지점 매트릭스

> CLAUDE.md Definition of Done 강제. PR별 영향 지점 표.

| 지점 | 영역 | PR-A | PR-B | PR-C | PR-D | PR-E | PR-F | PR-G | PR-N | PR-P | PR-Q |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ① 폼 상태 | UI store | — | — | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| ② initial | factory | — | — | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| ③ normalize | hydration | — | — | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| ④ API 변환 | lib/calc | — | — | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| ⑤ UI 위젯 | 입력 컴포넌트 | — | — | — | — | ✓ | ✓ | ✓ | ✓ (신규 Table) | ✓ | ✓ |
| ⑥ 사이드바 합계 | InheritanceSidebar | — | — | — | — | ✓ (추가공제 합계) | — | — | ✓ | — | — |
| ⑦ 결과 카드 | 결과 view | — | — | — | — | ✓ | ✓ | ✓ | ✓ (3쪽 표) | ✓ | ✓ |
| ⑧ validation | lib/calc/validate | — | — | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| ⑨ Zod enum 메인 | route handler | — | — | — | — | ✓ | ✓ | ✓ | — | ✓ | — |
| ⑩ Zod refines | route handler | — | — | — | — | — | ✓ | ✓ | ✓ | ✓ | — |
| ⑪ 자산-수준 fallback | N/A (인적평가) | — | — | — | — | — | — | — | — | — | — |
| ⑫ Zod 입력 객체 정의 | route handler | — | — | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| ⑬ callTransferTaxAPI body spread | lib/calc | — | — | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| ⑭ Route handler 엔진 입력 매핑 | route handler | — | — | — | — | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

**핵심**: PR-A (anchor 전용), PR-B (증여세 시나리오 anchor), PR-C (영업권 산식 정합 검증), PR-D (무상증자 anchor)는 **엔진/UI 변경 0** → 14지점 동기화 불필요 (anchor 파일만 추가). **PR-E·F·G·N·P·Q는 14지점 전수 동기화 강제**.

---

## 4. PR별 UI 디자인

### 4-1. PR-N — 3쪽 평가차액 행 단위 표 (★★ 핵심)

**컴포넌트**: `EvaluationDeltaTable.tsx` (신규, **sibling 분리 정책**: 800줄 근접 시 `AssetDeltaRows.tsx` + `LiabilityDeltaRows.tsx` 분할)

**행 수 max 제한** (DI1 정정): 자산 최대 50행, 부채 최대 30행. 초과 시 "행 수 한계 도달" rose 안내 + 추가 입력 차단. PDF anchor 사례 6은 자산 8행/부채 3행이라 여유 충분.

**구조**:
```
┌─ EvaluationDeltaTable ──────────────────────────────────┐
│ [자산 평가차액]                                         │
│ ┌──────────────────────────────────────────────────────┐│
│ │ 계정과목 │ 상증법 평가액 │ 재무상태표 │ 차액(자동)  ││
│ │ [미수이자]│  5,744,770 │  5,300,000 │   444,770   ││
│ │ [매출채권]│ 299,050,000│298,534,500 │   515,500   ││
│ │ ...                                                  ││
│ │ ─────────────────────────────────────────────────── ││
│ │ ① 합계                                  107,324,150  ││
│ │ [+ 행 추가] [× 행 삭제]                              ││
│ └──────────────────────────────────────────────────────┘│
│                                                         │
│ [부채 평가차액]                                         │
│ ┌──────────────────────────────────────────────────────┐│
│ │ 계정과목 │ 상증법 평가액 │ 재무상태표 │ 차액         ││
│ │ [외화채무]│ 185,335,800│200,560,000│ △15,224,200   ││
│ │ ...                                                  ││
│ │ ② 합계                                   15,775,800  ││
│ └──────────────────────────────────────────────────────┘│
│                                                         │
│ ┌─ 평가차액 (① − ②) ─────────────────────── 91,548,350┐│
│ └──────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

**행 추가/삭제**: `addAssetRow()` / `removeAssetRow(rowId)` / `updateRow(rowId, field, value)`. 행 추가 시 `rowId=crypto.randomUUID()`.

**계정과목 입력**: 자유 입력 (text) + dropdown 추천 (자주 쓰는 12개 자산 + 8개 부채 prefill). `enum-verification-before-mapping` 정책 준수 — dropdown은 anchor에 영향 X (display only).

**음수 표시**: `delta < 0` 시 `△{|delta|.toLocaleString()}` 표기. tone="rose-600".

**합계 자동 계산**: `useMemo(() => assetDeltaRows.reduce((s, r) => s + (r.evaluationAmount - r.bookAmount), 0), [assetDeltaRows])`.

**3중 패턴 (필수)**:
1. UI display: 행 단위 → 합계 자동 derive
2. API 변환 (`lib/calc/inheritance-gift-api.ts`): 행 단위 우선 + 미입력 시 `assetEvaluationDelta` 총액 fallback
3. Validate (`lib/calc/inheritance-gift-validate.ts`): 행 단위 또는 총액 둘 중 하나는 입력 필수 (silent omission 차단)

### 4-2. PR-E — §22② 최대주주 자동 도출 3-state ToggleCard

**개념 분리 (DC4·DO5 정정)**:
- **§22②** (본 PR-E 적용): 최대주주 보유주식 → **추가공제 제외** 자동 도출
- **§63③** (본 PR Phase 4 별도 모듈 `max-shareholder-premium.ts`): 최대주주 → **할증평가 (×120%)**
- 두 개념은 다른 법조문 + 다른 효과. 본 PR-E는 **§22②만** 다룬다.

**컴포넌트**: `MajorShareholderStockToggle.tsx` (신규)

**3-state RadioCardGroup** + 안내 카드 (DU1 정정):
- "자동 판정 (보유지분율 기준)" (recommended, default)
- "수동: 최대주주 해당 ON" — 안내: "자동 판정과 다른 결론을 사용자가 직접 지정합니다. 친족 합산 등 자동 판정으로 도달 불가한 시나리오 권장."
- "수동: 최대주주 해당 OFF" — 안내: "보유지분이 높아도 최대주주 아님으로 처리합니다. 양도·증여 합산 등 특수 사실관계 시 사용."

**자동 판정 미리보기 카드** (auto 선택 시):
- `ownershipRatio = ownedShares / totalShares` (소수점 4자리)
- §22② "최대주주 보유주식" 자동 판정: 본 PR `max-shareholder-premium.ts`의 `judgeIsMajorShareholderStock` 재사용 (시기별·시장별 매트릭스, 비상장은 §157의8①2호 임계)
- 표시: "보유지분율 60.00% → §22② 최대주주 해당" (violet) 또는 "지분율 미달 → 비대주주" (slate)

**결과 카드 echo**:
- "§22② 최대주주 자동판정 적용 = ON (보유지분율 60.00%)"
- 출처 라벨: "§22② + 시행령 §53④⑤" (LawArticleModal)
- §63③ 할증평가는 본 PR 기존 결과 카드에서 별도 표시 (혼동 방지)

### 4-3. PR-F — 부동산과다보유 자동 판정 3-state ToggleCard

**컴포넌트**: `RealEstateHeavyToggle.tsx` (신규)

**3-state**: PR-E와 동일 패턴.

**자동 판정 미리보기**:
- `ratio = realEstateAssets / totalAssets`
- "토지·건물·부동산권리 / 총자산 = 50.00% 이상 → 부동산과다보유법인" (rose-600 강조, ratio ≥ 0.5)
- "49.00% → 일반법인" (slate)

**경계 anchor**: F-1 (50% 정확)·F-2 (49%) 양방향 회귀 보호.

### 4-4-pre. PR-G 7사유 자동/수동 분기 (DO3 정정)

**자동 판정 가능 사유** (사용자 입력에서 도출):
- 사유 5 (1년 이상 휴업): 평가기준일 + 휴업기간 입력 시 자동 추천
- 사유 7 (주요업종 매출 3년 미만): 사업개시일 + 평가기준일 입력 시 자동 추천

**자동 판정 불가 사유** (사용자 직접 선택):
- 사유 2·3·4·6·8: 회계기준·합병·증여이익·처분손익·기재부 고시 — 사용자 판단 필요

**UI 분기**: 모드 ON 시 추천 사유는 violet 배지 + "자동 추천" 표시, 사용자가 다른 사유 선택 시 추천 무효화. 추천 미적용 사유는 일반 RadioCardGroup.

### 4-4. PR-G — 추정이익 옵션 RadioCardGroup + 7사유

**컴포넌트**: `EstimationOptionBlock.tsx` (신규)

**모드 선택 RadioCardGroup**:
- "3년 가중평균 (원칙)" (default)
- "신용평가전문기관 추정이익 (§56②, 7사유 충족 시)"

**추정이익 모드 활성 시**:
1. 7사유 RadioCardGroup (사용자 1개 선택, 필수):
   - 사유 2: 자산수증이익·채무면제·보험차익·재해손실 50% 초과
   - 사유 3: 평가기준일 전 3년 내 합병·분할·주요업종 변경
   - 사유 4: §38 합병당사법인 주식가액 산정
   - 사유 5: 1년 이상 휴업
   - 사유 6: 유가증권·유형자산 처분손익 50% 초과
   - 사유 7: 주요업종 매출 3년 미만
   - 사유 8: 재정경제부장관 고시 (기타)
2. 신용평가전문기관 2곳 추정이익 입력:
   - 기관 1 추정이익 (원): `[CurrencyInput]`
   - 기관 2 추정이익 (원): `[CurrencyInput]`
   - 평균값 미리보기: `(agency1 + agency2) / 2` (display only)

**§56② 안내 카드** (sky):
"신용평가전문기관·회계법인·세무법인 중 둘 이상이 산출한 1주당 추정이익의 평균가액으로 가중평균액을 대체할 수 있습니다. (상증령 §56② + 상증규 §17의3①)"

### 4-5. PR-Q — 충당금 확정분 단서 가 (모든 법인)

**컴포넌트**: `ConfirmedExpenseAllowanceField.tsx` (신규, 소형)

**입력 위젯**:
- FieldCard "충당금 중 평가기준일 비용 확정분" (CurrencyInput)
- hint: "§17의2 4호 단서 가 — 부채 차감 미적용 (모든 법인). 충당금 1억 중 평가기준일 현재 비용 확정 7천만 입력 시 7천만이 부채에 남음."

**결과 카드 echo**:
- 2쪽 4.나.⑮(기타 충당금) 또는 별도 행에 표시
- 출처 라벨: "§17의2 4호 단서 가"

**PR-M 보험법인 분리 보장**:
- Q-2 anchor로 보험법인 + 일반 충당금 확정분 (Q-1) 함께 입력 시 별도 처리 검증

### 4-6. PR-P — 다른 비상장주식 보유 분기 (§54③)

**컴포넌트**: `OtherUnlistedHoldingsBlock.tsx` (신규)

**활성 조건**: 사용자 토글 ON 시만 (default OFF, 본 사례 6 미적용)

**입력**:
- 다른 비상장 보유주식 (`ownedShares`) — CurrencyInput
- (자기주식·자기출자지분 제외) 발행주식총수 (`issuedSharesExcludingTreasury`)
- 자동 계산: `ratio = ownedShares / issuedSharesExcludingTreasury`
- ratio ≤ 0.10 시 §54③ 분기 활성
- 시가 존재 여부 (`marketPriceExists`) ToggleCard
  - ON: 시가 입력 (§60① 우선 적용)
  - OFF: 법인령 §74①1호마목 취득가액 (`bookValuePerShare`) 입력

**경고 카드** (rose, ratio > 0.10 시):
"§54③ 적용 불가 — 보유지분율 10% 초과. §54① 본칙 적용 (3·2 가중평균)."

### 4-6-2. PR-P — 다른 비상장주식 보유 분기 (§54③) UI 상세 (통합비교 정정)

> **상위 §4-6 OtherUnlistedHoldingsBlock 보강** — Plan §3에 PR-P 추가됨에 따라 UI 컴포넌트 상세 추가.

**StoryBoard** (StepWizard 어디에 끼워넣는지):
- 선행 PR StepWizard **Step 3 순자산가액** 섹션 하단에 별도 ToggleCard "§54③ 다른 비상장주식 10% 이하 보유 분기" 추가 (default OFF, 일반 사례는 미사용).

**§60① 시가 우선 분기 UI**:
- ToggleCard 옵션 A: "시가 존재 (§60① 우선 적용)"
  - CurrencyInput `marketPrice` 활성
  - 안내: "§60① 시가가 존재하면 §54③ 분기 미적용. 시가를 그대로 평가액으로 사용."
- ToggleCard 옵션 B: "시가 미존재 → 법인령 §74①1호마목 취득가액"
  - CurrencyInput `bookValuePerShare` 활성
  - 안내: "법인세법 시행령 §74①1호마목 취득가액에 의함."

**경고 카드** (rose, 보유지분 > 10% 시):
- ratio 자동 계산 + 표시
- "§54③ 적용 불가 — 보유지분율 {ratio*100}% > 10%. §54① 본칙 적용 (3·2 가중평균)."

**결과 카드 echo**:
- `appliedOtherUnlistedValuation.method` 표시: `section60_market_price` / `section74_book_value` / `section54_full`
- 출처 라벨 LawArticleModal: "§54③ + 법인령 §74①1호마목"

### 4-7. PR-J — react-pdf 5쪽 양식 출력 (★ 후순위)

**컴포넌트**: `BesshiBuppyo3PDFDocument.tsx` (orchestrator, 6 sibling import)

**Sibling 분리** (DI3 정정 — 800줄 정책):
- `BesshiBuppyo3PDFDocument.tsx` (orchestrator ~100줄, 6 페이지 import + 통합 Document)
- `Page1ValuationTarget.tsx` (1쪽 1.평가대상 + 2.순자산만 평가 + 3.1주당 가액 ~200줄)
- `Page2NetAssetValue.tsx` (2쪽 4.순자산가액 ~150줄)
- `Page3EvaluationDelta.tsx` (3쪽 5.평가차액 행 단위 표 ~180줄)
- `Page4Placeholder.tsx` (4쪽 placeholder 페이지 ~50줄, DU3 정정)
- `Page5Goodwill.tsx` (5쪽 6.영업권 ~150줄)
- `Page6NetIncome.tsx` (6쪽 7.순손익액 사업연도별 3열 ~250줄)

**4쪽 placeholder 디자인 (DU3 정정)**:
- 빈 페이지 X — 양식 페이지로 명시 ("(제4쪽) — 4쪽 양식 미수신, 후속 PR-O 예정")
- 사용자 안내: "본 페이지는 평가심의위 운영규정 별지 부표3 제4쪽을 후속 PR-O에서 추가 예정입니다. 현행 1·2·3·5·6쪽으로 평가 산출은 완료되었습니다."
- 회색 hatch 패턴 배경 (다른 페이지와 구분)

**testid 동결** (계획서 §1 표 기준):
- `besshi-buppyo3-page1-{slot}-{number}` (예: `besshi-buppyo3-page1-issued-shares-1`)
- 칸 번호 ①~㉒, ㉓~㉕, ㉮㉯, 가~차 전수 매핑

**한글 폰트**: Pretendard 임베드 (양도세 PDF와 동일 인프라).

---

## 5. UI 사용자 시나리오 (StoryBoard)

> **주의 (DO1·DM1 정정)**: 본 §5의 "Flow N"은 **본 디자인 시나리오 흐름** 표기일 뿐 **선행 PR (commit 8f2eda1) Phase 5의 StepWizard 4단계**와 다르다. 후속 PR은 선행 PR의 기존 StepWizard 4단계 안에 끼워넣는 형태로 통합 (예: PR-N은 선행 PR StepWizard Step 3 순자산가액 섹션에 EvaluationDeltaTable 추가, PR-G는 Step 4 순손익가액에 RadioCardGroup 추가).

### 시나리오 1: 사례 6 풀 입력 (PR-N + PR-E + PR-F + PR-G + PR-J 통합)

```
[Flow 1] 평가대상 비상장법인 입력 (본 PR StepWizard 1단계 내부)
  → 법인명·자본금·발행주식·평가기준일
  → 부동산과다보유 자동 판정 (auto, PR-F)
    - totalAssets / realEstateAssets 입력
    - 미리보기: "16.36% → 일반법인" (사례 6 토지 400M 가정)

[Flow 2] 순자산만 평가 사유 (§54④)
  → "해당 없음" 체크 (사례 6은 일반 가중평균)

[Flow 3] 1주당 순자산가액 (PR-N)
  → EvaluationDeltaTable 자산 8행 + 부채 3행 입력
  → 평가차액 자동 91,548,350 표시
  → 순자산가액 489,351,700 자동 도출

[Flow 4] 1주당 순손익가액 (PR-G)
  → 모드 RadioCardGroup: "3년 가중평균" 선택 (사례 6은 가중평균)
  → 6쪽 7.순손익액 표 입력 (3년 × 22항목)
  → 가중평균 11,660 자동 도출

[Flow 5] 영업권 (PR-C 적용 산식)
  → 자기자본 489,351,700 자동 (Step 3 결과)
  → Σ 산식 계산 → 사례 6 영업권 0 (음수 가드)

[Flow 6] 최대주주 자동 도출 (PR-E)
  → ownedShares / totalShares 입력
  → 자동 판정: 보유지분율 100% → 최대주주 해당 ON
  → 1주당 평가액 ⑥ 10,910 × 120% = ⑦ 13,092

[Flow 7] 결과 카드 확인
  → 1주당 평가액 13,092 / 상속재산가액 340,392,000 (26,000주)
  → 별지 부표3 6쪽 양식 미리보기 (print:block + PDF 다운로드)

[Flow 8] PDF 다운로드 (PR-J)
  → BesshiBuppyo3PDFDocument 5쪽 (1·2·3·5·6쪽) + 4쪽 placeholder
  → testid 전수 매핑 검증
```

### 시나리오 2: 추정이익 모드 전환 (PR-G)

```
[Flow 4 변형] 6개월 이내 평가기준일 + 사유 5 (1년 휴업)
  → 모드 변경: "신용평가전문기관 추정이익"
  → 사유 5 선택
  → 신용평가전문기관 2곳 추정이익 입력 (예: 12,000 / 11,000)
  → 평균 11,500 자동 도출 → 가중평균 11,660 대체
  → 1주당 평가액 ⑥ = (9,787×2 + 11,500×3) / 5 = 10,815
```

### 시나리오 3: 부동산과다보유법인 자동 (PR-F)

```
[Flow 1 변형] 부동산 80% 법인
  → realEstateAssets / totalAssets = 0.85
  → 자동 판정: rose-600 "85.00% → 부동산과다보유법인"
  → 1주당 평가액 산식 자동 반전: (9,787×3 + 11,660×2) / 5 = 10,536.2 = 10,536 (가중치 3·2)
  → §54④ 3호 단서 적용 검증 (가중평균 < 순자산 일 때만 순자산 단독)
```

---

## 6. 엔진 함수 시그니처

> **Export 위치 (DI2 정정)**: 신규 함수는 모두 `lib/tax-engine/property-valuation/` 하위. 본 PR 기존 모듈 확장 또는 sibling 신규.

### 6-1. PR-N — `lib/tax-engine/property-valuation/net-asset-calc.ts` 확장

```typescript
// 기존 (가정)
export function calculateNetAssetValue(input: NetAssetCalcInput): NetAssetCalcResult {
  // assetEvaluationDelta / liabilityEvaluationDelta 총액 사용
}

// 신규 — 행 단위 입력 지원
export function calculateEvaluationDelta(rows: EvaluationDeltaRow[]): number {
  return rows.reduce((sum, row) => sum + (row.evaluationAmount - row.bookAmount), 0);
}

// 통합 함수 — 행 단위 우선 + 총액 fallback (3중 패턴)
export function resolveEvaluationDelta(input: NetAssetCalcInput): {
  assetDelta: number;
  liabilityDelta: number;
  source: "rows" | "total";
} {
  if (input.assetDeltaRows && input.assetDeltaRows.length > 0) {
    return {
      assetDelta: calculateEvaluationDelta(input.assetDeltaRows),
      liabilityDelta: calculateEvaluationDelta(input.liabilityDeltaRows ?? []),
      source: "rows",
    };
  }
  return {
    assetDelta: input.assetEvaluationDelta ?? 0,
    liabilityDelta: input.liabilityEvaluationDelta ?? 0,
    source: "total",
  };
}
```

### 6-2. PR-C — `lib/tax-engine/property-valuation/goodwill.ts` 정합성 검증

**본칙 3중 인용 (통합비교 정정)**:
- **상증령 §59②** "초과이익금액을 평가기준일 이후의 영업권지속연수(원칙적으로 5년으로 한다)를 고려하여 **재정경제부령으로 정하는 방법**에 따라 환산한 가액" — 산식 위임
- **상증규 §19①** "영 제59조제2항 산식에서 '재정경제부령이 정하는 율'이라 함은 100분의 10을 말한다" — 이자율 10%
- **평가심의위 운영규정 별지 제4호 서식 부표3 제5쪽 본문**: Σ[n=1→5] [(나−마)/(1+0.1)ⁿ] — Σ 산식 본칙 (시행규칙엔 미명시)

```typescript
// 본칙 — Σ 합산 (3중 인용: 상증령 §59② + 상증규 §19① + 평가심의위 별지 부표3 5쪽 본문)
export function calculateGoodwillSigma(
  excessProfit: number, // 나 − 마
  years: number = 5,
  rate: number = 0.1 // §19① 10%
): number {
  if (excessProfit <= 0) return 0;
  let sum = 0;
  for (let n = 1; n <= years; n++) {
    sum += excessProfit / Math.pow(1 + rate, n);
  }
  return Math.floor(sum);
}

// 비교용 — 3.7908 일괄 곱셈
export function calculateGoodwillCoefficient(
  excessProfit: number,
  coefficient: number = 3.7908
): number {
  if (excessProfit <= 0) return 0;
  return Math.floor(excessProfit * coefficient);
}

// anchor: GW-3 두 함수 결과 1원 이내 일치 검증
```

### 6-3. PR-E — `lib/tax-engine/property-valuation/max-shareholder-premium.ts` (기존 모듈 export 확장)

> **DC4 정정**: 본 PR 기존 `judgeIsMajorShareholder` 재사용. 시그니처는 §63③ 할증평가 컨텍스트 그대로, §22② 추가공제 자동 도출은 동일 함수 결과를 다른 의미로 소비.

```typescript
// 선행 PR 기존 함수 (재사용)
// DL1 정정: taxCategory는 string이 아닌 TaxCategory enum (lib/tax-engine/property-valuation/types.ts)
import type { TaxCategory } from "@/lib/tax-engine/property-valuation/types";

export function judgeIsMajorShareholder(input: {
  ownedShares: number;
  totalShares: number;
  marketCap?: number;
  taxCategory: TaxCategory; // ★ enum 재사용, substring 매칭 금지 (feedback_enum_substring_match_forbidden)
  asOfDate: Date;
}): {
  isMajor: boolean;
  ownershipRatio: number;
  appliedThreshold: { shareRatio?: number; marketCap?: number; marketType: string };
};

// 본 PR-E 신규 — §22② 의미로 결과 소비
export function deriveSection22MajorShareholder(judgeResult: ReturnType<typeof judgeIsMajorShareholder>): {
  isSection22Major: boolean; // §22② 추가공제 제외 대상
  ownershipRatio: number;
  source: "auto";
} {
  return {
    isSection22Major: judgeResult.isMajor,
    ownershipRatio: judgeResult.ownershipRatio,
    source: "auto",
  };
}
```

### 6-4. PR-F — `lib/tax-engine/property-valuation/real-estate-heavy.ts` (신규 sibling)

```typescript
export function judgeIsRealEstateHeavy(input: {
  totalAssets: number;
  realEstateAssets: number;
}): {
  isRealEstateHeavy: boolean;
  ratio: number;
  source: "auto";
} {
  const ratio = input.totalAssets > 0 ? input.realEstateAssets / input.totalAssets : 0;
  const isRealEstateHeavy = ratio >= 0.5; // 소법 §94①4호다목 50% 경계
  return { isRealEstateHeavy, ratio, source: "auto" };
}
```

---

## 7. anchor 매트릭스 (PR-A~Q 30건)

| anchor ID | PR | 파일 | 검증 |
|---|---|---|---|
| D-7~D-13 (8건) | PR-A | `case-5b-branch-anchors.test.ts` | §54④ 호별 + §55③ 결손법인 |
| B-1 (1건) | PR-B | `case-5c-gift-scenario.test.ts` | 사례 6 증여세 시나리오 |
| GW-1·GW-2·GW-3 (3건) | PR-C | `goodwill-sigma.test.ts` | Σ 산식 정합성 |
| BI-1 (1건) | PR-D | `case-1b-bonus-issue.test.ts` | 무상증자 환산식 |
| E-1·E-2 (2건) | PR-E | `major-shareholder-stock.test.ts` | §22② 자동 도출 |
| F-1·F-2 (2건) | PR-F | `real-estate-heavy.test.ts` | §54⑤ 자동 판정 |
| G-2~G-8 (7건) | PR-G | `estimation-option.test.ts` | 추정이익 7사유 |
| N-1·N-2·N-3 (3건) | PR-N | `evaluation-delta-rows.test.ts` | 평가차액 행 단위 |
| P-1·P-2 (2건) | PR-P | `other-unlisted-holdings.test.ts` | §54③ 분기 |
| Q-1·Q-2 (2건) | PR-Q | `confirmed-expense-allowance.test.ts` | §17의2 4호 단서 가 |

**총 31 anchor** (D-9b·D-10b 분리 시 33건).

---

## 8. Definition of Done (디자인)

- [ ] 본 디자인 §1 케이스 매트릭스 25행+ 검증
- [ ] §2 데이터 모델 6 신규 필드 정의 (Input) + 5 echo 필드 (Result)
- [ ] §3 14지점 동기화 매트릭스 PR-E·F·G·N·P·Q 6 PR 전수 동기화
- [ ] §4 UI 컴포넌트 8개 (EvaluationDeltaTable·MajorShareholderStockToggle·RealEstateHeavyToggle·EstimationOptionBlock·ConfirmedExpenseAllowanceField·OtherUnlistedHoldingsBlock + §54③ §60① 시가/§74 취득가액 분기 + BesshiBuppyo3PDFDocument)
- [ ] §5 UI 시나리오 3종 + 결과 카드 미리보기
- [ ] §6 엔진 함수 4개 시그니처 (resolveEvaluationDelta·calculateGoodwillSigma·judgeIsMajorShareholderStock·judgeIsRealEstateHeavy)
- [ ] §7 anchor 31~33건
- [ ] 800줄 정책: 모든 컴포넌트 파일 800줄 이하 (EvaluationDeltaTable 분할 가능성 검토)
- [ ] testid 동결: `besshi-buppyo3-page{N}-{slot}-{number}` 패턴

---

## 9. 리스크 & 미정 사항

| 항목 | 영향 | 대응 |
|---|---|---|
| 본 PR `net-asset-calc.ts` 행 단위 입력 미지원 | PR-N 작업량 증가 | PR-N 진입 시 첫 작업 = 엔진 코드 grep |
| EvaluationDeltaTable 행 추가 시 800줄 초과 위험 | 800줄 정책 위반 | sibling 분리 (Asset·Liability 분할) |
| PR-G 7사유 자동 판정 vs 수동 선택 | UX 부담 vs 정확성 | 1차 PR은 수동 라디오 + 자동 판정 가능 사유는 안내 카드 |
| PR-P §60① 시가 우선 모호 | 사용자 시가 입력 신뢰성 | 시가 입력 시 정합성 가드 + 출처 라벨 |
| PR-Q PR-M 충돌 | 보험법인 + 일반 충당금 동시 입력 | Q-2 anchor로 분리 보장 |
| PR-J 4쪽 placeholder | 양식 충실도 갭 | PR-O 분리 진행 |

---

## 10. 참고 자료

- 계획서: [`inheritance-unlisted-stock-valuation-followup.plan.md`](../../00-pm/inheritance-unlisted-stock-valuation-followup.plan.md)
- 본 PR Engine Design: [`inheritance-unlisted-stock-valuation.engine.design.md`](./inheritance-unlisted-stock-valuation.engine.design.md)
- 본 PR UI Design: [`inheritance-unlisted-stock-valuation.ui.design.md`](./inheritance-unlisted-stock-valuation.ui.design.md)
- Legal Verification: [`inheritance-unlisted-stock-valuation.legal-verification.md`](./inheritance-unlisted-stock-valuation.legal-verification.md)
- 정책 메모리: `feedback_besshi_form_replica`, `feedback_pdf_table_row_one_to_one_mapping`, `feedback_mirror_pattern`, `feedback_silent_omission_full_input_enforcement`, `feedback_three_state_optional_mode_toggle`, `feedback_enum_substring_match_forbidden`, `history-lookup-modal`
