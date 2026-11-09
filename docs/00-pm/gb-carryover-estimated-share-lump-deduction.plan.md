# 일반건물 이월과세(증여자 취득가액 환산) × 지분 — 카드 개산공제가 지분만큼 줄지 않는다

- 상태: **구현 완료(2026-11-09 사용자 결정: Q-1 a · Q-2 (다) · Q-3 a)** — 결과는 §6. 기준 master `fbe78a017`.
- 발견 경위: 「증여자 신축 · 증축 × 지분」 측정(`companion-inherit-valuation-share-vp2c.plan.md` §13) 중 가산세는 맞는데 산출세액이 대조와 어긋났다.
- 표기: **[직접]** = 이 문서 작성 중 실행 · 대조. **[코드]** = 코드 읽기만. **확인 필요** = 미측정.

## 0. 결론

| 질문 | 답 |
|---|---|
| 무엇이 틀리는가 | 일반건물 파트가 **이월과세(§97의2)이고 증여자 취득가액을 환산**하는 경우다. 그 카드의 개산공제(소령 §163⑥)가 **물건 전체(100%) 기준시가 × 3%** 그대로 들어간다. 지분 50% 카드도 100%분 공제를 받는다 [직접] |
| 크기 | 시료(증여자 취득시 기준시가 1억 · 양도 10억). 파트 하나당 개산공제 3,000,000이 지분과 무관하게 들어간다(대조: 50% 1,500,000 · 30% 900,000). 산출세액 차이(대조 대비): 축 A 50% −409,500 · 30% −393,120 · 함께 양도 50% −444,600 · 30% −622,440 · 축 B 60/40 −889,200(100% 단건 대비 — 카드마다 3,000,000) [직접] |
| 어디서만 나는가 | **일반건물 카드 경로만.** 건물 파트 · 토지 파트 모두. 축 A 단건 · 함께 양도 컴패니언 · 축 B 지분 카드 모두. 증여자 신축 토글과 무관하다(ON · OFF 같은 차이). 증여자 취득가액이 실지거래가액이면 차이 0 [직접] |
| 형제 경로 | 독립 토지 · 주택 이월과세(환산) × 지분은 축 A · 함께 양도 모두 대조와 같다(차이 0) [직접] |
| 가산세(§114의2) | 지분 경로 모두 100% 가산세 × 지분율로 맞다(신축 50% 6,250,000 · 증축 85.01㎡ 50% 3,125,000) [직접] |
| 근거 | 소령 §163⑥(MST 290841 · 시행 2026.10.1. 본문 조회): 개산공제 = 「취득당시 … 개별공시지가 × 3/100」(1호 토지) · 「취득당시 … 가액 × 3/100」(2호 건물). 엔진의 지분 규약은 「기준시가는 100% 유지 · 개산공제 계산 지점에서만 지분율 적용」이다(`general-building.types.ts` `ownershipRatio` 주석 · `computeLumpSumDeductionBase`). 일반건물 이월과세 카드만 이 규약에서 빠졌다 |

## 1. 원인 [코드]

1. ④ · 엔진 일반건물 평가가 환산 이월과세 카드에 분자 · 분모를 싣는다(`lib/tax-engine/general-building-carryover-basis.ts` `applyCarryoverEstimationBasis`).
   - 분자 = 증여자 취득시 기준시가(100%).
   - 분모 = 파트 양도시 기준시가(100%).
   - 규약대로 축소하지 않는다.
2. route가 카드를 단건 엔진 입력으로 바꾼다(`app/api/calc/transfer/general-building-route-cards.ts:293-298`). `standardPriceAtAcquisition` · `standardPriceAtTransfer`로 싣고, **`ownershipRatio`는 싣지 않는다**.
3. 단건 엔진의 이월과세 시나리오 A가 개산공제를 낸다. 지분율은 입력의 `ownershipRatio`로 적용한다(`transfer-tax-carryover-finish.ts:100` 표시 echo도 같은 함수). 카드 입력에 그 값이 없어 100% 기준이 된다.
4. 같은 일반건물의 **매매 환산** 파트는 평가 엔진이 `input.ownershipRatio`로 개산공제를 직접 낸다(`general-building-valuation.ts:288`). 그래서 차이가 없다. 이월과세 파트만 단건 엔진으로 넘겨 계산해서 빠진다.

## 2. 측정 [직접] — 양도 2026-03-01 · mock 세율 · 화면 경로(폼 → ⑧ → ④ → ⑫~⑭)

- 시료: `gb-carryover-donor-built.pipeline.anchor.test.ts`와 같다. 일반건물 10억 · 토지 100㎡ · 건물 200㎡ · 토지 매매 환산 + 건물 이월과세(증여 2024-05-01 · 증여자 취득 2015 · 증여자 취득시 기준시가 1억 · 환산 일반).
- 대조: 같은 몫을 100% 소유로 입력했다(금액 · 면적 · 기준시가 × 지분율). 축 B는 100% 단건.
- 증축 85.01㎡는 면적 기준이 물건 전체라 대조를 「100% 가산세 × 지분율」로 두었다.

| 증여자 건물 | 경로 | 산출세액 차이 | 양도차익 차이 | 가산세(= 대조) |
|---|---|---|---|---|
| 신축 · 증축 · 토글 OFF(3종 같음) | 축 A 50% | −409,500 | −1,500,000 | 신축 6,250,000 · 증축 3,125,000 · OFF 0 |
| 〃 | 함께 양도 50% | −444,600 | −1,500,000 | 〃 |
| 〃 | 축 A 30% | −393,120 | −2,100,000 | 신축 3,750,000 · 증축 1,875,000 |
| 〃 | 함께 양도 30% | −622,440 | −2,100,000 | 〃 |
| 〃 | 축 B 60/40 | −889,200 | −3,000,000 | 신축 12,500,000 · 증축 6,250,000 |
| 증여자 취득가액 실지거래가 | 위 5경로 | 0 | 0 | — |
| 토지 파트 이월과세(환산) + 건물 매매 | 축 A · 함께 양도 50 · 30% | 건물과 같은 크기(−409,500 등) | 같음 | — |
| 독립 토지 · 주택 이월과세(환산) | 축 A · 함께 양도 50 · 30% | 0 | 0 | — |

- 양도차익 차이는 정확히 「개산공제 3,000,000 × (1 − 지분율)」이다(50% 1,500,000 · 30% 2,100,000 · 축 B 60/40 1,200,000 + 1,800,000).

## 3. 수정 후보

| 안 | 내용 | 실측 · 위험 |
|---|---|---|
| (가) 분자 · 분모를 모두 지분율로 줄인다(`applyCarryoverEstimationBasis`에 지분율 인자) | 환산은 약분돼 그대로이고 개산공제만 지분분이 된다 | **기각(실측).** 세액은 대조와 맞았다(20칸 차이 0). 그러나 증여자 **증축** 가산세가 50%에서 3,125,000 → 6,250,000으로 두 배가 됐다(가산세 base = 양도가액 × 증축 부분 기준시가 ÷ 양도시 기준시가 — 분모만 줄어서). 되돌림 · `cmp` 확인 |
| (나) route 카드 입력에 `ownershipRatio`를 싣는다 — 이월과세 환산 카드에만 | 엔진 규약(「개산공제 지점에서만 지분율」)을 그대로 쓴다 | 지분율을 `buildProperties`까지 넘겨야 한다(호출처 4곳: `general-building-route-helper.ts:299` · `-route-actual.ts:668` · `-part-cards.ts:422` · `-fractional.ts:261`). 단건 엔진에서 `ownershipRatio`를 읽는 다른 지점(부담부증여 축소 · 분리 양도가액 · 가산세 `transfer-tax-carryover-donor-penalty.ts:162` 등)이 카드 값을 이중 축소할 위험이 있다 — **확인 필요**(V-1) |
| (다) 개산공제 전용 지분율 키를 새로 둔다(엔진 입력 내부 키 · route → 엔진만, ⑫ 변경 없음) | 영향 범위가 개산공제 하나로 좁다 | 새 키 1개 + 시나리오 A 개산공제 · 표시 echo(`transfer-tax-carryover-finish.ts:100`) 두 지점 |

## 4. 결정 (2026-11-09 사용자 결정: Q-1 a · Q-2 (다) · Q-3 a)

| Q | 내용 | 권장 |
|---|---|---|
| Q-1 | 고칠까 — 이 경로의 개산공제를 지분분으로 | **a 고친다** / b 문서만 |
| Q-2 | 방식 | **(다) 전용 키** / (나) `ownershipRatio` 전달(V-1 실측 후) |
| Q-3 | 안전망 anchor 범위 — 건물 · 토지 파트 × 축 A 50 · 30% · 함께 양도 50% · 축 B 60/40 + 증축 가산세 회귀 1칸(가 안의 실패를 잡는 칸) | **a 위 범위** / b 축 A만 |

## 5. 미검증 · 확인 필요

| 번호 | 내용 |
|---|---|
| V-1 | (나)안 전용 — (다)안을 골라 해당 없음 |
| V-2 | ✅ 같은 결함이었다(축 A 50% −280,800 · 축 B 60/40 −889,200) → §6에서 함께 고침 |
| V-3 | ✅ 같은 결함이었다. 실가 경로는 **두 파트 모두 실가 모드**일 때만 탄다(`actualPriceMode`) — 「토지 실가 + 건물 환산 모드」는 환산 경로다. 두 파트 실가 시료: 축 A 50% −444,600 · 축 B 60/40 −936,000 → §6에서 고침 |
| V-4 | ✅ 실측(§7) — 상세명세서 필요경비 칸의 이월과세 카드 산식 「개산공제 X = 취득시 기준시가 B × 3%」가 26칸 모두 B × 3% = X다. 측정 중 **별개 표시 결함 D-1**(축 B 둘째 지분부터 매매 환산 파트 산식이 첫 지분 재료) 발견 |
| — | 사람이 직접 한 브라우저 수동 확인은 하지 않았다 |

## 6. 구현 결과 (Q-1 a · Q-2 (다) · Q-3 a)

### 6.1 변경

| 층 | 파일 | 내용 |
|---|---|---|
| 엔진 입력 | `lib/tax-engine/types/transfer.types.ts` | 내부 키 `lumpSumDeductionOwnershipRatio` — 개산공제 base 전용 지분율. route가 엔진에 직접 넘긴다(⑫ Zod 없음) |
| 엔진 leaf | `lib/tax-engine/tax-utils.ts` `lumpSumDeductionRatioOf` | 전용 키 → 없으면 `ownershipRatio` |
| 엔진 | `transfer-tax-helpers.ts`(환산 · 감정 · 매매사례 개산공제 3곳) · `transfer-tax-carryover-finish.ts`(표시 echo) | 위 leaf로 읽는다 |
| 일반건물 엔진 | `general-building-carryover-basis.ts` `applyCarryoverEstimationBasis(…, ownershipRatio)` | 환산 이월과세 카드에 `carryoverLumpSumOwnershipRatio`를 싣는다. 분자 · 분모는 100% 그대로(주석에 (가)안 기각 사유) |
| 호출처 | `general-building-valuation.ts`(2-way) · `general-building-extension.ts`(3-way) · `general-building-route-actual.ts`(실가) | 지분율을 넘긴다 |
| route | `general-building-route-helper.ts`(축 A 단건 실가) · `general-building-part-cards.ts`(컴패니언 · 축 B 실가) | 실가 경로에 `lumpSumDeductionOwnershipRatio` 전달 |
| route | `general-building-route-cards.ts` `buildProperties` | 카드 값 → 카드 input `lumpSumDeductionOwnershipRatio`(`ownershipRatio`는 싣지 않는다) |

`ownershipRatio`를 카드 input에 싣지 않으므로 그 키를 읽는 다른 지점(가산세 · 부담부증여 축소 등)은 바뀌지 않는다.

### 6.2 검증 [직접]

| 항목 | 결과 |
|---|---|
| 결함 격자(§2 · 신축 · 증축 · 토글 OFF · 실지거래가 × 5경로) | 20/20 세액 · 양도차익 · 가산세 = 대조 |
| 3경로(2-way · 증축 3-way · 두 파트 실가) × 축 A · 함께 양도 · 축 B | 전부 세액 = 대조. 증축 3-way 축 B 60/40만 양도차익 +1원(카드별 절사 — V-G2 구조 · 수정 전에도 있던 1원) |
| 100% 단건 | 수정 전과 같다(신축 151,070,800 / 가산세 12,500,000 · 증축 151,070,800 / 6,250,000) |
| 안전망 anchor | 신규 `__tests__/api/transfer.route.gb-carryover-estimated-share-lump.anchor.test.ts` 12건 — 건물 · 토지 파트 × 축 A 50 · 30% · 함께 양도 50% · 축 B 60/40(세액 · 양도차익 = 대조 · 카드 개산공제) + 고정값(2-way · 두 파트 실가 3경로 · 증축 3-way) + P-1 증여자 증축 가산세 회귀 |
| 뮤테이션 7/7 KILLED | cp 백업 → 변형 → anchor → 복원 후 `cmp`. M1 route 카드 키 제거 11건 실패 · M2 엔진 leaf가 전용 키 무시 11건 · M3 축 A 실가 전달 제거 1건 · M4 증축 3-way 전달 제거 1건 · M5 (가)안(분자 · 분모 축소) 1건(P-1) · M6 컴패니언 · 축 B 실가 전달 제거 1건 · M7 2-way 전달 제거 9건 |
| 정적 검사 | `tsc --noEmit` 0건 · 변경 파일 eslint 오류 0건 |
| 기존 anchor 단언 반전 1건 | `transfer.route.gb-carryover-legacy-estimated.anchor.test.ts` GBLE-05(지분 40% legacy 이월과세 × 환산): 결정세액 111,960,800 → **112,464,800**. 종전 값은 개산공제 100% 기준 3,000,000을 스냅샷으로 고정한 것이었다(지분 미축소 결함). 차이 504,000 = 개산공제 차이 1,800,000 × 28%. 같은 테스트의 환산 취득가액 100,000,000 단언(기준시가 미축소 계약)은 그대로 통과 — pre-push 전체 실행(3931파일)에서 이 1건만 실패했다 |

- 측정 중 내 오류: 처음 「실가 경로」라 부른 시료(토지 실가 + 건물 환산 모드)는 환산 경로였다. M3가 살아남아 알았다. 두 파트 실가 시료로 바꾸자 컴패니언 · 축 B 실가 분기(`general-building-part-cards.ts`)도 같은 결함이었고, 함께 고쳤다.

## 7. V-4 실측 — 결과 화면 개산공제 base 표시 (2026-11-09)

화면 경로 그대로: 폼 → ⑧ → ④ → route POST → `aggregateToFilingResult` → `buildStatementItems`(`DetailedCalculationStatementCard`가 부르는 것과 같은 인자 — `BundledAllocationCard.tsx:339`의 `aggregateMeta`에서 헤더 전용 `ownershipMap`·`landNatureMap`만 뺐다). §6 anchor의 시료(건물 · 토지 파트 이월과세 환산 · 두 파트 실가 · 증축 3-way × 100% · 축 A 50 · 30% · 대조 50% · 함께 양도 50% · 축 B 60/40)를 그대로 썼다. probe는 지웠다.

### 7.1 이월과세 카드 — 결함 없음 [직접]

- 읽는 곳: `components/calc/results/transfer/DetailedStatementGbCarryoverFormulas.ts:52` `a.lumpDeductionBase ?? a.estimatedStdPriceAtAcquisition` → 「개산공제 {칸 값} = 취득시 기준시가 {base} × 3% — 시행령 §163⑥」.
- 26칸(4시료 × 6경로 + 축 B 둘째 카드 2) 모두 base × 3% = 칸 값 = 엔진 `necessaryExpense`.
  - 축 A 50%: base 50,000,000 → 1,500,000 · 30%: 30,000,000 → 900,000 · 함께 양도 50%: 50,000,000 → 1,500,000 · 축 B: 60,000,000 → 1,800,000 / 40,000,000 → 1,200,000.
  - 같은 몫 100% 대조와 문구가 같다(대조는 기준시가 자체가 50,000,000).
- echo `estimatedStdPriceAtAcquisition`·`estimatedStdPriceAtTransfer`는 지분 카드에서 100% 값(100,000,000 · 200,000,000)이다. 이 값을 쓰는 화면 문구는 환산 비율(분자/분모)뿐이라 지분과 무관하다.
- 이월과세 비교 카드(`CarryoverComparisonCard`·`CarryoverScenarioAFilingCard`)에는 개산공제 base 표시가 없다(grep 0건).

### 7.2 D-1 — 축 B(지분 분할) 둘째 지분부터 매매 환산 파트 산식이 첫 지분 재료 [직접 · 기존 결함]

이월과세와 무관하다 — 순수 매매 환산 축 B에서도 같다. **값 · 세액은 맞고** 상세명세서의 산식 문구만 자기 값을 못 만든다.

| 시료(일반건물 10억 · 토지 · 건물 매매 환산) | 칸 | 화면 산식 | 맞는 산식 |
|---|---|---|---|
| 축 B 60/40 · 지분 2 | 필요경비 토지 · 건물 | 취득시 토지기준시가 **60,000,000** × 3% = 1,200,000 | 40,000,000 × 3% |
| 축 B 60/40 · 지분 2 | 양도가액 토지 · 건물 | **600,000,000** × 200,000,000 / (200,000,000+200,000,000) = 200,000,000 | 400,000,000 × … |
| 축 B 20/30/50 · 지분 2 · 3 | 양도가액 · 필요경비 | 지분 1의 200,000,000 · 20,000,000을 그대로 쓴다(값 150,000,000 · 250,000,000 / 900,000 · 1,500,000) | 지분별 300,000,000 · 500,000,000 / 30,000,000 · 50,000,000 |
| 증축 3-way 축 B 60/40 · 지분 2 | 증축건물 양도가액(잔액) | 600,000,000 − 토지 272,727,272 − 건물 272,727,272 = 36,363,638 | 400,000,000 − 181,818,181 − 181,818,181 |
| 증축 3-way 축 B 60/40 · 지분 2 | 증축건물 필요경비 | 취득시 증축건물기준시가 18,000,000 × 3% = 360,000 | 12,000,000 × 3% |

- 취득가액 칸 산식은 맞다(카드 자기 양도가액 × 기준시가 비율).
- 지분 1 카드와 이월과세 카드(§7.1)는 맞다 — 이월과세 카드는 카드 자기 echo(`carryoverTaxationDetail`)를 읽는다.
- 원인 [코드]: 축 B는 결과 최상위 `generalBuildingValuationDetail` 하나뿐이고 그것이 **첫 지분의 `detailBase`**다(`general-building-fractional.ts:424` `if (detailBase === undefined) detailBase = built.detailBase` — `gb-fractional-result-blocks.plan.md` §1이 블록 쪽으로 같은 사실을 적었다). 명세서 `gbOf`(`DetailedStatementHelpers.ts:169`) → `gbFormulaInputsOf`(`DetailedStatementGbAsset.ts:30`)가 `single`이 있으면 지분을 가리지 않고 그것을 모든 카드에 준다. 실가 경로 필요경비만 지분별 `shareActualExpenseEcho`로 덮어 읽는다(`DetailedStatementGbFormulas.ts:573`) — 환산 경로 `estimatedDeduction` · 양도가액 합계에는 지분별 echo가 없다.
- 신고서 표 · PDF · 인쇄본의 같은 문구는 측정하지 않았다 — 확인 필요.

### 7.3 결정 (2026-11-09 사용자 결정: Q-4 a · Q-5 (가))

| Q | 내용 | 권장 |
|---|---|---|
| Q-4 | D-1을 고칠까 | **a 고친다** — 산식이 자기 값을 못 만드는 표시 결함(F-20 증축 base와 같은 종류) / b 문서만 |
| Q-5 | 방식 | **(가) 지분별 echo 확장** — `shareActualExpenseEcho`처럼 환산 경로도 지분별 `estimatedDeduction`·양도가액 합계를 싣고 빌더가 카드 지분 값으로 덮어 읽는다 / (나) 빌더가 카드 값에서 역산(dual-truth라 비권장) |

### 7.4 구현 결과 (Q-4 a · Q-5 (가))

| 층 | 파일 | 내용 |
|---|---|---|
| 타입 | `lib/tax-engine/types/transfer-aggregate-gb.types.ts` | `GbShareFormulaEcho`(지분 양도가액 `shareTransferPrice` · 환산 개산공제 `estimatedDeduction`) + `GbValuationDetail.shareFormulaEcho` |
| route | `app/api/calc/transfer/general-building-fractional.ts` | 지분 양도가액(잔액 흡수 후)을 모아 채택 시나리오 카드의 `detailBase.estimatedDeduction`과 함께 지분 인덱스로 싣는다 |
| 표시 | `components/calc/results/transfer/DetailedStatementGbAsset.ts` `gbFormulaInputsOf` | 결과 상세가 한 벌이면 카드 지분(`shareIndexOf`)의 echo로 양도가액 총액 · 개산공제 base를 덮는다. echo가 없는 단건 · 옛 이력은 종전 그대로 |

엔진 계산 · 세액은 바뀌지 않는다(표시 재료 echo만 추가).

### 7.5 검증 [직접]

| 항목 | 결과 |
|---|---|
| 격자 — 6시료(매매 환산 · 건물/토지 이월과세 환산 · 두 파트 실가 · 증축 3-way 매매 · 증축 3-way 이월과세) × 지분 60/40 · 20/30/50 | 카드 210칸의 값 · 산식 문구가 같은 지분율 축 A 단건과 글자 그대로 같다(수정 전 69칸 불일치 — 실가 경로 양도가액 포함) |
| 안전망 anchor | 신규 `__tests__/api/transfer.route.gb-axis-b-share-statement-formula.anchor.test.ts` 14건 — 위 격자 12건 + 고정 문구 2건(지분 2 「400,000,000 × …」 · 「40,000,000 × 3%」 · 증축 「12,000,000 × 3%」) |
| 뮤테이션 6/6 KILLED | cp 백업 → 변형 → anchor → 복원 후 `cmp`. M1 route echo 미부착 14 실패 · M2 echo에서 개산공제 제외 12 · M3 지분 양도가액 대신 계약 총액 14 · M4 표시가 echo 무시 14 · M5 개산공제 덮기 제거 12 · M6 양도가액 덮기 제거 14 (M2 · M5의 통과 2건은 실가 경로 — 필요경비가 `shareActualExpenseEcho` 경로라 무관) |
| 회귀 | 명세서 · 축 B · 일반건물 상세를 참조하는 테스트 338파일 4,802건 통과 · `tsc --noEmit` 0건 · 변경 파일 eslint 오류 0건 |
| 미확인 | 신고서 표 · PDF는 이 산식 빌더를 쓰지 않는다(grep — `gbFormulaInputsOf` · `buildGb*Formula` 호출처는 상세명세서뿐). 사람이 직접 한 브라우저 확인은 하지 않았다 |
