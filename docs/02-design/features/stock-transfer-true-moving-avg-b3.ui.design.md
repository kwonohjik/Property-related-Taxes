# B-3 진정 이동평균법 — UI 설계 (stock-transfer-true-moving-avg-b3)

> 계획: `docs/00-pm/stock-transfer-true-moving-avg-b3.plan.md` §4.3 · 엔진: `stock-transfer-true-moving-avg-b3.engine.design.md`
> 원칙: 결과 "원" 생략·dual-truth 금지(엔진 단일 진실)·납세자 입증책임 중립 서술

## 1. 산정방법 라디오 (`AcquisitionLotsMatrix.tsx:115-130`)

`RadioCardGroup name="costAllocationMethod_acq"` — moving_avg 옵션 설명만 정정 (enum 키·라벨 불변):

```
{ value: "moving_avg", label: "이동평균법",
  description: "매도 시점까지 취득분으로 평균단가 재계산" }   // 기존 "전체 매수 lot 가중평균 단가 (총평균법)"
```

- specific·fifo 옵션 무변경

## 2. 입력 단계 미리보기 dual-truth (`AcquisitionLotsMatrix.tsx:69 · :276-280`)

현행 `:69` `summary.weightedAvg = floor(totalCost/totalAcq)` = UI 자체 총평균. 진정 이동평균은 매도 순서·시점 의존이라 입력 단계(매도 lot 정보 미완)에서 정확 산출 불가 → **참고용 총평균 유지 + 명시 안내**:

```
:276-280 미리보기 문구:
  "참고용 평균단가 {summary.weightedAvg} — 실제 이동평균은 매도 순서·시점에 따라 달라질 수 있습니다 (정확한 값은 계산 결과 참조)"
```

- 미리보기 자체는 제거하지 않음(입력 보조). 단 "엔진 결과가 단일 진실"임을 문구로 명시 — UI 자체 계산을 정답으로 오인 방지([[feedback_ui_engine_dual_truth_avoidance]])

## 3. 결과 카드 (`LotMatchingDetailCard.tsx`)

| 위치 | 정정 |
|---|---|
| `:18` METHOD_LABEL | `moving_avg: "이동평균법 (총평균)"` → `"이동평균법"` |
| `:58-60` 상단 안내 | "가중평균 단가 {weightedAvgPerShare}원" → "이동평균 단가 (최종 잔고) {weightedAvgPerShare}" — **"원" 제거** + "매도별 단가는 아래 표 매수단가 열 참조" 1줄 |
| sub-lot 표 `:88-89` | 무변경 (매도단가·매수단가 열이 매도별 이동평균을 이미 표시) |

- "원" 제거는 결과 카드 정책([[feedback_no_won_suffix]]) — 기존 위반 동시 정정

## 4. 14지점 (신규 입력 0)

| # | 지점 | 작업 |
|---|---|---|
| ①②③ | form 상태 | 무변경 (costAllocationMethod enum 키 불변) |
| ④⑫⑬⑭ | api·Zod·route | 무변경 (`moving_avg` 문자열 그대로) — grep 자가 점검만 |
| ⑤ | UI 라디오·미리보기 (§1·§2) | — |
| ⑥ | 사이드바 | 분할 합계는 result 기반 — 무변경 |
| ⑦ | 결과 카드 (§3) | — |
| ⑧ | validate | 무변경 |

## 5. E2E (`e2e/stock-transfer-moving-avg.spec.ts`, `E2E_PORT=3200`)

**스코프 현실화**: 교차 매도(매수-매도-매수-매도)는 분할 양도 모드(`lotsMode "split"`·매도 다건)가 필요하나 기존 A-1/A-2 E2E는 전부 lots-only(양도 단건)라 UI 재현 비용 과다. **교차 이동평균 효과는 anchor(MA-ENGINE-2/3)가 엔진 레벨에서 검증** — E2E는 lots-only(취득 다건·양도 단건) + 이동평균법 선택의 통합·라벨만 검증(거래정지·lots E2E 관행 동일).

E-1 (lots-only·이동평균, MA-1형): 취득 다건(a 100@10,000·b 100@20,000) → 양도 단건 200 → 이동평균법 선택 → 계산 →
- `json.result.lotMatchingDetail.method === "moving_avg"`
- 양도 단건이라 이동평균 = 총평균 15,000 → `weightedAvgPerShare === 15000` (MA-1 불변 = 회귀 보호)
- 결과 화면 "이동평균법" 라벨 노출 + "(총평균)" 부재 단언 (라벨 드리프트 정정 증명)
- 라디오 설명 "매도 시점까지 취득분으로 평균단가 재계산" 노출 단언

함정 메모: AcquisitionLotsMatrix 다건 입력은 A-1 E2E(`stock-transfer-lots-specific`) 패턴 재사용 — "일자별 다건" + "이동평균법" 라디오 클릭(exact 텍스트, "개별법"과 구분).

## 6. 비스코프

- total_avg 별도 옵션(4종 병존) — engine.design §9에서 교체 확정
- 매수일=매도일 경계 UI 경고 (엔진 처리, UI 무변경)
