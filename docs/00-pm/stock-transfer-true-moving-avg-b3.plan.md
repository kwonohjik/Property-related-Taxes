# B-3 진정 이동평균법 (주식 분할 매수) — 구현 계획서 (PR-ζ)

> 작성 2026-06-12 · 기준 origin/master `50b9f2f0` (PR #161 머지 후)
> 로드맵: `docs/00-pm/stock-transfer-remaining-followups.plan.md` Track B-3
> P0 = KoreanLaw 검증 — **완료(§1)**. 모든 인용 file:line grep/Read 실측 (추정 0).

## 0. 목표

현행 `moving_avg`는 이름과 달리 **총평균법**(전체 매수 lot 1회 가중평균을 모든 매도에 동일 적용, `lot-allocation.ts:170-176`)이다. UI 라벨은 이미 "이동평균법"(`AcquisitionLotsMatrix.tsx`)이라 **라벨↔구현 드리프트**가 존재한다. 진정 이동평균법 = 각 매도 시점까지 취득된 lot만으로 평균단가를 재계산하는 방식으로 교체하고, 라벨·설명·엔진 주석 3곳을 동기화한다.

- 매수-매도-매수 순서가 섞이지 않은 단순 케이스(전부 매수 후 일괄 양도)는 총평균 = 이동평균 **동일** → 기존 anchor 대부분 불변.
- 매수·매도가 시간순으로 교차하는 케이스만 단가가 달라짐.

## 1. 법령 근거 (KoreanLaw 실측 — 2026-06-12)

### 1.1 양도소득세 — 동일종목 산정방법 명문 부재 (재확인)

- `search_decisions(interpretation, "주식 이동평균법 취득가액")` → **NOT_FOUND**. `tax_tribunal("동일종목 평균 취득가액")` → **NOT_FOUND**.
- `search_decisions(nts, "주식 양도 취득가액 산정")` → 32건 검색되나 **국세청 법령해석 본문은 법제처 OPEN API 미제공**(외부 taxlaw.nts.go.kr 링크만, 본문 추측 금지). 제목상 관련: [138028] "비상장주식이 취득시기 및 취득가액이 다른 경우 주권발행번호 기재 시 특정 가능 여부"(2022) — 개별법(specific) 입증 맥락. **평균법 강제 근거는 미발견**.
- 결론: 현행 주석(`lot-allocation.ts:12-18`)의 "명문 부재·납세자 입증책임" 입장 **유지**. 본 PR은 명문이 강제하지 않는 영역에서 **사용자 선택 옵션의 정확성**(이름값 = 진정 이동평균)을 보정하는 것.

### 1.2 "이동평균법" 표준 정의 — 법인세법 시행령 §74①1호 (MST 283635, 참조용)

| 목 | 방법 | 정의 (축자) |
|---|---|---|
| 라 | **총평균법** | "사업연도개시일 현재 취득가액 합계 + 사업연도 중 취득가액 합계의 총액을 그 자산의 총수량으로 나눈 평균단가" — **현행 `moving_avg` 구현과 일치** |
| 마 | **이동평균법** | "자산을 **취득할 때마다** 장부시재금액을 장부시재수량으로 나누어 평균단가를 산출하고 그 평균단가에 의하여 산출한 취득가액" — 매수 시점마다 잔고 평균 갱신 |

- ※ 법인 재고자산 평가 조문 — **개인 양도소득세 직접 근거 아님**. 용어 정의·산식 표준으로만 인용(계획서·주석에 한계 명시).
- 이동평균 산식: 매수 시 `평균단가 = floor((기존 잔고원가 + 신규 매수액) / (기존 잔고수량 + 신규 수량))`. 매도 시 그 시점 평균단가로 원가 차감(평균단가 불변·잔고수량·잔고원가 감소).

### 1.3 보유기간(§104②) — 이동평균과 독립 (설계 핵심)

이동평균법은 단가를 평균내므로 **개별 lot 취득일이 단가에서 소멸**한다. 그러나 §104② 단기(1년 미만 30%)/장기 판정은 lot별 취득일이 필요. 현행 `matchFifo`(`:273-334`)는 이미 **하이브리드** — 단가는 `weightedAvgPerShare`(총평균), **매칭순서·보유기간은 FIFO lot의 `startDate`**(`:302-303`). 

→ B-3은 이 하이브리드를 **유지**하되 단가만 "총평균 1개 고정값" → "매도 시점별 이동평균"으로 교체. 보유기간·단기/장기 판정은 FIFO 차감 lot의 `startDate` 그대로(명문 부재 영역에서 가장 보수적·기존 동작 보존). §104② 기산점 분기(`resolveLotStartDate` :50-61)도 무변경.

## 2. 현행 실측 (Pre-Do 기준점)

| 지점 | 실측 |
|---|---|
| 산정방법 enum | `lot-allocation.ts:67` `type AllocationMethod = "specific" | "fifo" | "moving_avg"` |
| 총평균 단가 | `:170-176` `weightedAvgPerShare = method==="moving_avg" ? floor(Σ(shareCount×price)/totalBuyShares) : undefined` — **전체 1회** |
| matchFifo 단가 적용 | `:305-306` `perShareBuyPrice = weightedAvgPerShare ?? acq.perShareAcquisitionPrice` — 모든 매도에 동일 총평균 |
| 보유기간 | `:302-303` `holdingDays = differenceInDays(trn.transferDate, acq.startDate)` — FIFO lot startDate (이동평균과 독립) |
| 매칭 순서 | `:282-285` 매수 lot acquisitionDate ASC + 매도 transferDate ASC FIFO |
| result echo | `LotMatchingDetail.weightedAvgPerShare?`(`types`:435 인근) — 단일 값 echo |
| 메서드 매핑 | `costAllocationMethod` form → API → `allocateLots(method)`. enum 문자열 `"moving_avg"` |
| UI 라벨 | `AcquisitionLotsMatrix.tsx:128` 라디오 "이동평균법" + `:129` 설명 "전체 매수 lot 가중평균 단가 (총평균법)" — **드리프트 확정** |
| UI 자체 미리보기 | `AcquisitionLotsMatrix.tsx:69` `summary.weightedAvg = floor(totalCost/totalAcq)` + `:276-280` "(이동평균 모드 적용 시 참고)" — **UI 자체 총평균 계산**. 진정 이동평균은 매도 시점·순서 의존이라 입력단계(매도 정보 미완) 단일 미리보기 부정확 → dual-truth 리스크([[feedback_ui_engine_dual_truth_avoidance]]). "참고용 총평균(실제 이동평균과 다를 수 있음)" 명시 처리 |
| 결과 카드 | `LotMatchingDetailCard.tsx:18` `moving_avg: "이동평균법 (총평균)"` 라벨 드리프트 + `:58-60` `weightedAvgPerShare` 단일 표시 — 매도별 단가 상이 시 부정확 |
| 자본조정 교차 | A-2 `applyCapitalAdjustmentsToLots`가 lot 희석 후 `allocateLots` 호출(`stock-transfer-tax.ts` split 분기) — 희석된 lot이 이동평균 입력. **이동평균은 희석 후 단가/수량 사용** (자기일관) |
| 기존 anchor | **AT-LOT-3**(매수 2023·2024 → 양도 2025 일괄, `anchor.test.ts:156`)·**LOT-16**(단가 동일, `lot-allocation.test.ts:165`)·**acquisition-lots-only:119** — 전부 **교차 없는 단순 케이스** → 이동평균 = 총평균 **불변**(Pre-Do 통과 고정). 교차 케이스 신규 추가만 변동 |

## 3. 케이스 매트릭스 (전수)

| # | 케이스 | 총평균(현행) vs 이동평균 | 처리 |
|---|---|---|---|
| MA-1 | 매수 2건 → 일괄 양도 1건 (교차 없음) | **동일** | 이동평균 = 총평균 (회귀 0) |
| MA-2 | 매수 a → 매도 → 매수 b → 매도 (교차) | **다름** | 첫 매도는 a 단가, 둘째 매도는 (a잔여+b) 이동평균 |
| MA-3 | 매수 a·b(동일자) → 양도 | 동일 | 동일 일자도 합산 평균 |
| MA-4 | 단일 매수 → 양도 | 동일 (평균 = 단가) | 회귀 0 |
| MA-5 | 이동평균 + 자본조정(A-2 희석) | 희석 후 lot으로 이동평균 | applyCapitalAdjustmentsToLots 후단 |
| MA-6 | 이동평균 + 보유기간 교차(단기·장기 혼재) | 단가=이동평균·보유기간=FIFO startDate | §104② 하이브리드 유지 |
| MA-7 | 이동평균 + 매도 수량 > 매수 잔고 | warning (기존 matchFifo `:329-331`) | 방어 유지 |
| MA-8 | specific·fifo 모드 | **무변경** | 이동평균은 moving_avg 분기만 |

## 4. 설계 방향 (engine.design 상세)

### 4.1 옵션 결정 — moving_avg **교체** (총평균 폐기) vs 4종 병존

**결정(잠정): 교체.** 현행 라벨이 이미 "이동평균법"이라 사용자는 이동평균을 기대 — 드리프트 정정 = 진정 이동평균 구현. 총평균법을 별도 옵션으로 남길 실무 수요 근거 미발견(§1.1 명문 부재). 단순 케이스는 두 방법 동일하므로 교체 영향 최소. **13단계에서 "4종 병존(total_avg 별도 옵션 추가)" 대안 재검토** — 기존 사용자 데이터(moving_avg 선택)의 의미 변화 리스크 평가 후 확정.

### 4.2 알고리즘 (시간순 이벤트 처리)

`matchFifo`에 `useMovingAvg: boolean` 분기 추가 또는 신규 `matchMovingAvg`:
```
1. 매수 lot acquisitionDate ASC, 매도 lot transferDate ASC
2. running 잔고: { qty, totalCost } — 매수 시점까지만 반영
3. 매도 처리 시: 그 매도일 이전(<=) 취득된 매수 lot을 잔고에 누적 반영
   → 이동평균단가 = floor(잔고.totalCost / 잔고.qty)
4. 매도분 매칭: 단가 = 그 시점 이동평균. 보유기간 = FIFO 차감 lot startDate (병행 추적)
5. 매도 후 잔고: qty -= 매도수량, totalCost -= 매도수량 × 이동평균단가 (평균 보존)
```
- **단가 트랙(이동평균)과 보유기간 트랙(FIFO lot startDate) 병행** — §1.3. 매칭 lot은 보유기간·startDate 산출에만 사용, 단가는 이동평균 override.
- result echo: `weightedAvgPerShare`(단일) → 매도별 이동평균이 다를 수 있으므로 **매도 sub-lot의 perShareBuyPrice에 시점별 이동평균 기록**(MatchedSubLot 기존 필드 재사용). 단일 echo 필드는 "최종 잔고 이동평균" 또는 deprecate — engine.design 확정.
- 정수: 이동평균단가 floor 1회/매수 갱신. 잔액 흐름 floor 잔차 검증([[feedback_floor_residual_absorption]]).

### 4.3 라벨·주석 드리프트 정정 (3곳)

| 위치 | 현행 | 정정 |
|---|---|---|
| `AcquisitionLotsMatrix.tsx:128-129` 라디오 | "이동평균법" + 설명 "전체 매수 lot 가중평균 단가 (총평균법)" | "이동평균법" 유지 + 설명 "매도 시점까지 취득분으로 평균단가 재계산" |
| `AcquisitionLotsMatrix.tsx:276-280` 미리보기 | "(이동평균 모드 적용 시 참고)" | "참고용 평균단가 — 실제 이동평균은 매도 순서·시점에 따라 달라질 수 있습니다" (dual-truth 방지) |
| `LotMatchingDetailCard.tsx:18` 라벨 | "이동평균법 (총평균)" | "이동평균법" |
| `lot-allocation.ts:18` 주석 | "moving_avg (총평균법)… 진정 이동평균은 후속 PR" | "moving_avg (이동평균법 — 법인세령 §74①1마 표준 정의 참조)" |
| `lot-allocation.ts:170` 주석 | "가중평균 단가 (moving_avg 모드만)" | 이동평균 산식 설명 |

## 5. 14개 동기화 지점

신규 **입력 필드 0** (costAllocationMethod enum 값 `moving_avg` 의미 변경만 — 키 불변). 변경 지점:
- 엔진: `lot-allocation.ts` matchFifo/신규 matchMovingAvg + 단가 트랙
- result: `LotMatchingDetail.weightedAvgPerShare`(`types:452`) echo 의미 = "최종 잔고 이동평균"으로 재정의(매도별 단가는 `MatchedSubLot.perShareBuyPrice` :524 인근이 이미 보유). deprecate 대신 의미 갱신(주석)
- ⑦ 결과 카드: `LotMatchingDetailCard.tsx:18` 라벨 "(총평균)"→"(이동평균)" + `:58-60` weightedAvgPerShare 표시 라벨 "가중평균"→"이동평균(최종 잔고)" + 매도별 단가는 sub-lot 표(`:89` perShareBuyPrice)가 이미 표시
- ⑤ UI: `AcquisitionLotsMatrix.tsx:129` 설명 + `:276-280` 미리보기 dual-truth 안내 (§4.3)
- ⑧ validate·⑫⑬⑭: enum 값 불변이라 **무변경** (grep 자가 점검만)
- 사이드바: 분할 모드 합계는 result 기반 — 무변경

## 6. anchor (Pre-Do + 신규)

**Pre-Do**: 기존 `lot-allocation.test.ts`·`anchor.test.ts` moving_avg 케이스 전수 통과 고정 → 교차 케이스 변동분만 재산정([[feedback_anchor_correction_legal_priority]] — 법령/표준 정합값으로).

| # | 시나리오 | 기대 |
|---|---|---|
| MA-ENGINE-1 | 매수 a(100@10,000)·b(100@20,000) → 양도 200 (교차 없음) | 이동평균 = 총평균 15,000 → 취득가 3,000,000 (현행 동일) |
| MA-ENGINE-2 | 매수 a(100@10,000) → 양도 50 → 매수 b(100@20,000) → 양도 100 | 1차 매도 50주 단가 10,000 / 2차: 잔고 (a잔여50 + b100)=150주·원가 2,500,000 → 이동평균 floor(2,500,000/150)=16,666. **2차 100주는 FIFO로 a잔여50 + b50 두 sub-lot** — 단가 둘 다 16,666·보유기간은 a startDate / b startDate **각각**(취득원가 1,666,600=floor(16,666)×100, 잔차 검증) |
| MA-ENGINE-3 | MA-2에서 a 장기·b 단기 | sub-lot 분할: a sub-lot(장기)·b sub-lot(단기) 단가 동일 16,666·보유기간 분기 — 단기/장기 gain 분리 echo |
| MA-ENGINE-4 | 단일 매수 → 양도 | 평균 = 단가 (회귀 0) |
| MA-ENGINE-5 | 이동평균 + 자본조정 무상증자 | 희석 후 lot으로 이동평균 (A-2 교차) |
| MA-ENGINE-6 | floor 잔차 — 3주 나눗셈 | 이동평균 floor 잔차 보존 검증 |
| MA-REGRESS-1 | 기존 moving_avg 단순 anchor 전수 | 불변 확인 |

E2E 1건(`e2e/stock-transfer-moving-avg.spec.ts`, 포트 3200): 다건 매수·매도 교차 → 이동평균단가 결과 확인.

## 7. PR 구성·규모

단일 PR (`feat/stock-transfer-true-moving-avg-b3`). 엔진 matchFifo 분기/신규 함수 + result echo 조정 + UI 라벨 3곳 + anchor 7 + E2E 1. 규모 중 — 분할 모드 anchor 재산정 영향.

## 8. 리스크·결정 대기

| # | 항목 | 대응 |
|---|---|---|
| R-1 | moving_avg 교체 vs 4종 병존 (§4.1) | 잠정 교체 — 13단계에서 기존 사용자 데이터 의미변화 리스크 평가 후 확정 |
| R-2 | 보유기간 FIFO 하이브리드 정당성 | 명문 부재 → 기존 동작 보존이 가장 보수적. 13단계 1회 재확인 |
| R-3 | result.weightedAvgPerShare echo 의미 변화 (단일→매도별) | MatchedSubLot perShareBuyPrice가 이미 매도별 — 단일 필드는 최종 잔고평균 또는 deprecate. engine.design 확정 |
| R-4 | 매수일 = 매도일 동일자 경계 (<=) | 매도일 이전 "이하" 포함 여부 — 동일자 매수는 그 매도에 반영(법인세령 "취득할 때마다" 해석). anchor MA-3 고정 |
