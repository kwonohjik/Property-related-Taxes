# B-3 진정 이동평균법 — 엔진 설계 (stock-transfer-true-moving-avg-b3)

> 계획: `docs/00-pm/stock-transfer-true-moving-avg-b3.plan.md` · 기준 origin/master `50b9f2f0`
> 법령: 양도세 명문 부재(계획 §1.1) + 법인세령 §74①1마 이동평균법 표준 정의(참조). 보유기간 = FIFO 하이브리드 유지(§1.3)

## 1. 케이스 인벤토리 (계획 §3 → 엔진 동작)

| # | 케이스 | 단가 트랙 | 보유기간 트랙 |
|---|---|---|---|
| MA-1 | 매수 2 → 일괄 양도 (교차 없음) | 이동평균 = 총평균 (동일) | FIFO lot startDate |
| MA-2 | 매수a→매도→매수b→매도 (교차) | 매도 시점별 이동평균 상이 | FIFO sub-lot 분할 |
| MA-3 | MA-2 + 보유기간 교차 | 동일 단가·sub-lot | a/b startDate 각각 (단기·장기 분리) |
| MA-4 | 단일 매수 → 양도 | 평균 = 단가 (회귀 0) | — |
| MA-5 | + 자본조정(A-2 희석) | 희석 후 lot 단가/수량 | 희석 lot startDate |
| MA-6 | floor 잔차 | 이동평균 floor·잔고원가 잔차 흡수 | — |
| MA-7 | 매도 > 잔고 | warning (기존 방어) | — |
| MA-8 | specific·fifo | 무변경 | 무변경 |

## 2. 알고리즘 — `matchMovingAvg` (신규, `lot-allocation.ts`)

현행 `matchFifo`의 moving_avg 분기를 분리. **단가 트랙(이동평균 잔고)과 보유기간 트랙(FIFO lot 잔여) 병행**:

```
입력: acqLots(매수 lot), trnLots(매도 lot)
1. 매수 lot acquisitionDate ASC, 매도 lot transferDate ASC
2. running 잔고: { qty: number, totalCost: number }  // 이동평균용
   FIFO 포인터: acqIdx + 각 lot.remaining            // 보유기간용
3. 각 매도 trn 처리 시:
   a. trn.transferDate 이전(<=)에 취득된 매수 lot을 잔고에 누적 반영
      (qty += lot.shareCount, totalCost += lot.shareCount × lot.perShareAcquisitionPrice)
      — 한 번 반영된 lot은 재반영 금지(반영 플래그)
   b. movingAvgPrice = qty > 0 ? floor(totalCost / qty) : 0
   c. 매도수량을 FIFO lot(remaining>0)에서 차감 → sub-lot 분할
      각 sub-lot: perShareBuyPrice = movingAvgPrice (이동평균 공통)
                  acquisitionDate = lot.startDate (보유기간·§104②)
                  holdingDays = differenceInDays(trn.transferDate, lot.startDate)
   d. 잔고 차감: qty -= 매도수량, totalCost -= 매도수량 × movingAvgPrice
4. 마지막 매도에서 잔고 소진 시 잔고원가 잔차는 자연 흡수
   (movingAvgPrice floor로 totalCost가 음수 근접 가능 → max(0) 가드)
```

### 2.1 동일자 경계 (R-4)

매수일 == 매도일: 매도 시점 잔고 반영에 **포함(<=)** — 법인세령 "취득할 때마다" 해석상 같은 날 취득분도 그 매도의 이동평균 모수. anchor MA-3-boundary로 고정.

### 2.2 floor 잔차 (MA-6 · [[feedback_floor_residual_absorption]])

- `movingAvgPrice = floor(totalCost / qty)` — 매수 갱신·매도 시점마다 floor
- 매도원가 = 매도수량 × movingAvgPrice. 잔고 totalCost -= 매도원가
- 누적 floor로 잔고 totalCost가 실제보다 +잔차 누적 가능 → 잔고 소진(마지막 매도) 시 잔여 totalCost를 그 매도원가에 흡수하는 옵션 검토. **단순화 채택**: 각 매도 독립 floor(잔고 totalCost는 floor 단가 기준 차감) — sub-lot 합과 totalAcquisitionPrice 자기일관. anchor로 잔차 방향 고정.

### 2.3 보유기간 sub-lot 분할 (MA-2/3 핵심)

매도 100주가 FIFO로 a잔여50 + b50으로 쪼개지면 **2개 MatchedSubLot** 생성 — `perShareBuyPrice` 둘 다 그 매도 시점 movingAvgPrice, `acquisitionDate`/`holdingDays`/`isShortTerm`은 각 lot 기준. 단기/장기 gain 분리(`shortTermGain`/`longTermGain` :203-204)는 sub-lot별 집계 — 기존 로직 그대로.

## 3. allocateLots 분기 (`:135-217`)

```ts
type AllocationMethod = "specific" | "fifo" | "moving_avg";  // enum 키 불변

// :170-176 weightedAvgPerShare 단일 산출 → moving_avg는 matchMovingAvg가 매도별 계산
if (method === "specific") { ... }
else if (method === "moving_avg") {
  matched = matchMovingAvg(remainingAcqLots, transferLots, isMajorAndNonSME, isSME, warnings);
} else {  // fifo
  matched = matchFifo(remainingAcqLots, transferLots, isMajorAndNonSME, isSME, undefined, warnings);
}
```

- `matchFifo` 호출처는 `:189` **단 1곳**(allocateLots 내부, 비-export) — `weightedAvgPerShare` 파라미터 제거 안전(테스트는 allocateLots만 호출)
- result `weightedAvgPerShare` echo = **최종 잔고 이동평균**(matchMovingAvg 반환). 단일 매도(MA-1)는 총평균 동일값 → AT-LOT-3 불변. **전량 매도(잔고 0) 케이스**: 마지막 매도 시점 movingAvgPrice를 echo(잔고 0 나눗셈 회피) — anchor MA-ENGINE-2(잔여 50주)·전량 매도 별도 anchor로 고정

## 4. result 타입·echo (`types/stock-transfer.types.ts`)

- `LotMatchingDetail.weightedAvgPerShare?`(:452) 주석 의미 갱신: "moving_avg 최종 잔고 이동평균(매도별 단가는 matched[].perShareBuyPrice)". 타입 변경 없음
- `MatchedSubLot.perShareBuyPrice`(:524 인근)가 이미 sub-lot별 단가 보유 — 이동평균 매도별 단가 자연 수용. 신규 필드 0

## 5. 결과 카드 (`LotMatchingDetailCard.tsx`)

- `:18` 라벨 맵 `moving_avg: "이동평균법 (총평균)"` → `"이동평균법"`
- `:58-60` 라벨 "가중평균 단가" → "이동평균 단가 (최종 잔고)". **매도별 상이는 sub-lot 표(`:89` 매수단가)가 표시** — 1줄 안내 추가
- **`:60` "원" 표기 제거** — `{...}원` → `{...}` (결과 카드 "원" 생략 정책 [[feedback_no_won_suffix]]·기존 위반 동시 정정. sub-lot 표 :88-89는 이미 "원" 없음)

## 6. UI 미리보기 dual-truth (`AcquisitionLotsMatrix.tsx`)

- `:69` `summary.weightedAvg = floor(totalCost/totalAcq)` — **입력 단계 총평균 미리보기 유지**(매도 정보 미완이라 정확 이동평균 불가). 제거 대신 안내 보강
- `:276-280` "(이동평균 모드 적용 시 참고)" → "참고용 평균단가 — 실제 이동평균은 매도 순서·시점에 따라 달라질 수 있습니다" (dual-truth 방지·엔진 단일 진실 명시)

## 7. anchor (계획 §6 — 7건 + 회귀)

파일: `__tests__/tax-engine/stock-transfer/moving-avg-b3.test.ts`. Pre-Do = 기존 AT-LOT-3·LOT-16 통과 고정.

| anchor | 검증 |
|---|---|
| MA-ENGINE-1 | 매수 2 일괄양도 → 이동평균 = 총평균 15,000 (= AT-LOT-3형 불변) |
| MA-ENGINE-2 | 교차 — 1차 50@10,000 / 2차 100@16,666 (sub-lot a50+b50) · totalAcq 검증 |
| MA-ENGINE-3 | MA-2 + a장기/b단기 → shortTermGain·longTermGain 분리 |
| MA-ENGINE-4 | 단일 매수 → 평균 = 단가 |
| MA-ENGINE-5 | 자본조정 희석 후 이동평균 (A-2 교차) |
| MA-ENGINE-6 | floor 잔차 방향 고정 (150 나눗셈) |
| MA-BOUNDARY-1 | 매수일 == 매도일 → 그 매도 모수 포함 |
| MA-REGRESS-1~N | 기존 moving_avg anchor 전수 불변 |

E2E 1건(`e2e/stock-transfer-moving-avg.spec.ts`, 포트 3200): 교차 매수·매도 → 결과 sub-lot 단가 확인.

## 8. 파일 영향

| 파일 | 작업 |
|---|---|
| lot-allocation.ts (335줄) | matchMovingAvg 신규(+~50) + 분기 + matchFifo 매개 단순화 + 주석 3곳 |
| types | weightedAvgPerShare 주석 의미 갱신 (타입 무변경) |
| LotMatchingDetailCard.tsx | 라벨·표시 정정 |
| AcquisitionLotsMatrix.tsx | 설명·미리보기 안내 (§6) |

## 9. R-1 재검토 (13단계 STEP 8) — 교체 vs 4종 병존

기존 사용자가 `moving_avg`를 "총평균"으로 이해하고 저장한 데이터의 의미 변화. **명문 부재 + 단순 케이스 동일 + 라벨이 이미 "이동평균법"**이라 교체가 정합. 4종 병존(`total_avg` 신규 enum)은 14지점·UI 확대 대비 실익 낮음 → **교체 확정**(단순 케이스 회귀 0로 영향 최소).
