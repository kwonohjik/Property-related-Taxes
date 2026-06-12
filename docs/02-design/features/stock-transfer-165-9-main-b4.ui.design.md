# §165⑨ 본체 — UI 설계 (stock-transfer-165-9-main-b4)

> 계획: `docs/00-pm/stock-transfer-165-9-main-b4.plan.md` §5·§6 · 엔진: `stock-transfer-165-9-main-b4.engine.design.md`
> 원칙: 결과 "원" 생략 · dual-truth 금지(§81④ 위젯 공용화) · 자동 안분 fallback 금지(토글 필수) · ToggleCard 필수

## 1. §81④ 입력 섹션 공용 컴포넌트 추출 (`MonthlyAccrual81Section.tsx` 신규)

현행 `PostListingValuationCard.tsx:291-319`의 §81④ 1호 위젯(ToggleCard + 전전연도 NI/NA + 직전사업연도 월수)을 공용 컴포넌트로 추출 — 본체·준용 양쪽 재사용([[feedback_ui_engine_dual_truth_avoidance]] UI 중복 방지, [[feedback_800line_split_export_preservation]]).

```
props:
  checked: boolean
  onToggle: (v: boolean) => void
  prePriorNI / prePriorNA / priorMonths: string + onChange 3쌍
  title: string                  // 준용 "…취득·상장" / 본체 "…취득·양도"
  description: string            // variant별 문구
  visible: boolean              // 활성 우선 — 부모가 평가액 동일 판정 후 전달
```

- PostListingValuationCard: `title="같은 사업연도에 취득·상장 (소칙 §81④ 1호)"`, `checked={form.monthlyAccrualToggle}` (기존 동작·문구 보존 — 회귀 0)
- EstimatedUnlistedBlock: `title="같은 사업연도에 취득·양도 (소칙 §81④ 1호)"`, `checked={form.unlistedSameBizYearToggle}`
- 전전연도·직전월수 입력 필드는 **동일 form 키 공유**(`prePriorYear*`·`priorBizYearMonths`) — 두 경로 동시 활성 없음(post-listing은 `acquiredBeforeListing`, 본체는 `marketType==="unlisted"` 환산)

## 2. EstimatedUnlistedBlock 통합 (`EstimatedUnlistedBlock.tsx`)

비상장 환산 보충평가(weighted_avg) 입력 말미에 §81④ 본체 섹션 추가:

```
가시성 (활성 우선 — [[feedback_ui_toggle_auto_visibility_policy]]):
  simple 모드: transferEval === acqEval && transferEval > 0 일 때 노출
    transferEval = calcUnlistedPerShareWeighted(transferNI, transferNA, heavyRE)   // 엔진 헬퍼 import (UI 재구현 금지)
    acqEval      = calcUnlistedPerShareWeighted(acqNI, acqNA, heavyRE)
  full 모드: 무조건 노출 (합성 산출 — 엔진 equal 판정 위임)
  acquisitionSideOnly·simpleOnly(C-1 거래정지): 노출 안 함 (별개 트랙)
```

- ToggleCard 본체 description: "양도일·취득일 직전 사업연도 평가액이 동일합니다. 같은 사업연도에 취득·양도했다면 ON — 직전·전전 사업연도 평가 차액을 보유월수(취득→양도)로 안분해 양도일 기준시가를 보정합니다. 아니면 OFF(§81④ 2호, 보정 없음)."
- 위치: 보충평가 가중평균 입력 직후, 환산 결과 미리보기 전(계산 로직 순서 = UI 순서 [[feedback_ui_order_follows_logic]])

## 3. 결과 카드 (`StockTransferTaxResultViewHelpers.tsx`)

`valuationDetail.section1659Detail` 존재 시 환산 평가 블록(EstimatedValuationBreakdown)에 §165⑨ 보정 행 추가:

```
§165⑨ 본체 (양도·취득 기준시가 동일 → §81④ 1호 월할 보정):
  양도 기준시가  {prior}  →  {adjusted}    (전전연도 {prePrior} · 보유 {holdingMonths}개월 · 직전월수 {priorBizYearMonths})
  환산비율  {prior} / {adjusted}
```

- "원" 미표기([[feedback_no_won_suffix]]). 약어·floor 노출 금지([[feedback_result_view_korean_formula]])
- RULE_BADGE에 §165⑨본체·월할가산 배지(appliedRules echo)
- M-8 상장: warnings 메시지만(정보성), 보정 행 없음

## 4. 14지점 UI 서브셋

| # | 지점 | 작업 |
|---|---|---|
| ① | FormData | `unlistedSameBizYearToggle: boolean` (`calc-wizard-stock-store.ts`) |
| ② | initial | factory default `false` |
| ③ | normalize | `boolField("unlistedSameBizYearToggle", ...)` |
| ⑤ | UI 위젯 | §1 공용 섹션 + §2 EstimatedUnlistedBlock 통합 |
| ⑥ | 사이드바 | 무변경 |
| ⑦ | 결과 카드 | §3 |
| ⑧ | validate | `validate-step2.ts` 신규 분기 — `unlistedSameBizYearToggle` ON + 전전연도 미입력 차단(simple 모드 한정 equal 경고, 비교 = 양도연도↔취득연도). 기존 `:303-317`(monthlyAccrualToggle·상장연도 비교)과 별개 |

④⑨⑫⑬⑭(api·Zod·route)는 계획 §6 — bool 단일 필드 배선. ⑩⑪ N/A(form-global).

## 5. E2E (`e2e/stock-transfer-165-9-main.spec.ts`, `E2E_PORT=3200`)

E-1 (비상장 환산 simple · 동일 기준시가 · §81④ 1호):
- 비상장 선택 → 환산취득 모드 → 양도연도·취득연도 NI/NA **동일 입력**(transferEval==acqEval) → §81④ 본체 토글 노출 단언
- 토글 ON → 전전연도 NI/NA·직전월수 입력 → 계산
- `json.result.valuationDetail.section1659Detail.adjusted > section1659Detail.prior` (상향 단언)
- 결과 화면 "§165⑨ 본체" 노출 + 환산비율 < 1 → 양(+)차익 단언
- 토글 OFF 재계산 → 보정 행 부재 + 차익 0 (M-3 대조)

함정: ToggleCard 클릭은 제목 텍스트 `getByText("같은 사업연도에 취득·양도 (소칙 §81④ 1호)", {exact:true})`. RadioCardGroup `layout="inline"` description 미렌더 주의(B-3 교훈). 거래정지 토글과 라벨 중복 없음 확인.

## 6. 비스코프

- 상장 §81④ 1호 상향(2호 warning만 — 결과 화면 정보성)
- 80% 하한 양측 적용(기존 비대칭 유지)
- post-listing §81④ 위젯 문구·동작 변경(공용화는 wrapper만, 기존 props 보존)
</content>
