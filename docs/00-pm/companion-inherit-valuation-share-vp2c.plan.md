# 매매 함께 양도 × 컴패니언 상속 × 지분 — `inheritanceValuation` 지분 축소를 지키는 테스트가 없다 (V-P2c)

- 상태: **측정 완료 · 결정 대기(2026-11-09)** — 기준 master `df6be3f15`.
- 선행: `bg-pre-deemed-fractional-companion-vp2.plan.md`(#3041) §5 V-P2c — 부담부증여 뮤테이션 중 `companion-payload.ts:205`만 `__tests__/api`·`__tests__/calc` 전체를 통과했다.
- 표기: **[직접]** = 이 문서 작성 중 직접 실행·대조. **[코드]** = 코드 읽기만. **확인 필요** = 미측정·미해명.

## 0. 결론

| 질문 | 답 |
|---|---|
| 그 줄은 무엇을 하는가 | 함께 양도 묶음의 **상속 컴패니언**이 지분이면 `publishedValueAtInheritance`(상증법 평가액)를 지분율로 줄여 `inheritanceValuation`에 싣는다(`companion-payload.ts:203-207`). 소비처는 안분 준비 `bundled-apportionment.ts:114` — `calculateInheritanceAcquisitionPrice`로 그 자산의 안분용 취득가액(`allocatedAcquisitionPrice`)을 만든다 [코드] |
| 값이 틀리는가 | **틀리지 않는다.** 토지 · 주택 × 상속 1995(의제 후) · 1983(의제 전) × 양도가액 구분기재(actual) · 총액 안분(apportioned) = **8칸 전부 단건 합과 일치**(diff 0), 컴패니언 `allocatedAcquisitionPrice` 100,000,000(= 평가액 2억 × 50%) [직접] |
| 그런데 왜 문제인가 | 줄을 끄면(지분 미축소) **최종 값은 그대로인데 안분 echo가 두 배**가 된다: 8칸 전부 `apportionment.apportioned[컴패니언].allocatedAcquisitionPrice` 100,000,000 → **200,000,000**, 최종 `properties[].acquisitionPrice`는 100,000,000 그대로, 양도차익 900,000,000 그대로 [직접, 뮤테이션 적용 상태에서 측정 후 `cmp` 복원]. 즉 이 줄은 **맞고, 아무 테스트도 지키지 않는다** |
| 왜 최종 값은 안 변하는가 | 컴패니언의 최종 취득가액은 `ctx.adjustedAcqPrice ?? a.allocatedAcquisitionPrice`(`bundled-split-helpers.ts:177`)이고 상속 컴패니언은 `adjustedAcqPrice`가 채워지는 것으로 보인다 — 이 줄의 값은 거기서 덮이는 것으로 보이나 **원인 추적은 하지 않았다(확인 필요)** |
| 화면에 닿는가 | 사이드바 자산별 요약은 `bundledEcho?.acq ?? bundledMatch.allocatedAcquisitionPrice`(`transfer-per-asset-summary.ts:378`)로 엔진 echo를 먼저 읽는다 [코드]. 안분 echo가 직접 보이는 화면·`allocatedAcquisitionPrice`의 나머지 소비처(`transfer-per-asset-debt-pieces.ts:28` · `gb-result-block-views.ts:66` 등)는 **전수 확인하지 않았다 — 확인 필요** |
| 판정 | 사용자 결정 필요 — §3. 권장은 **Q-1 a(8칸 안전망 anchor 추가 · 안분 echo 단언 포함 · 코드 변경 없음)** |

## 1. 범위

- 컴패니언 종류: 토지 · 주택(`house_individual`). 주 자산은 토지 매매 100%(취득가액 3억 · 양도시 기준시가 5억).
- 컴패니언: 상속, 평가액 2억 · 양도시 기준시가 6억 · 양도가액 10억(물건 전체 기준) · **지분 50%**.
- 변수: 상속일 1995-05-05(의제 후) · 1983-07-26(의제 전) × 묶음 모드 `actual`(총 13억, 자산별 구분기재 8억 + 5억) · `apportioned`(총 13억을 양도시 기준시가 5:3으로 안분 → 812,500,000 / 487,500,000).
- 대조: 단건 합 — 주 자산 단건 + 컴패니언을 반 크기로 줄인 단건(양도차익 5억 + 4억 = 9억).
- 측정하지 않은 것: 상가 · 건물 · 재개발 · 분양권 컴패니언 · 3건 이상 묶음 · 증여 컴패니언(이 줄은 `acquisitionCause === "inheritance"`만) · 지분 50%가 아닌 비율 · 축 B(전 자산 지분 — 별도 경로) · 건물 상속·토지 매매 혼합(`effectiveBuildingCauseMix` 제외 분기) · 세액(양도차익 합계만 비교, 세율은 mock).

## 2. 측정 방법 [직접]

화면 경로 그대로 — 폼 → ⑧(`collectStepIssues` 0~5단계) → ④(`captureBody`) → ⑫~⑭(route POST). 비교는 `aggregated.totalTransferGain`과 `aggregated.properties[]`(자산별 양도가액·취득가액·양도차익), `apportionment.apportioned[]`(안분 echo). 주택 시료의 첫 시도는 ⑧이 «함께 양도 토지의 토지 성격 미선택»(`landNature`)으로 막았다 — 주 자산 토지에 `landNature: standalone`을 넣어 재측정했다(내 시료 누락). probe는 throwaway(미커밋).

| 순서 | 내용 |
|---|---|
| 1 | 8칸 기본 측정 — 전부 ⑧ 0건 · ⑫ 200 · diff 0 |
| 2 | 줄 `:205`를 `applyRatio` 없이 `parseAmount(...)`만 쓰도록 변형(cp 백업) → 같은 8칸 재측정 → 안분 echo 비교 → 복원 후 `cmp` |

## 3. 결정

| Q | 내용 | 권장 |
|---|---|---|
| Q-1 | 이 8칸을 **안전망 anchor**로 고정할까 — 단언: ⑧ 0건 · ⑫ 200 · 양도차익 = 단건 합 · **컴패니언 `allocatedAcquisitionPrice` = 평가액 × 지분율**(이 줄을 지키는 유일한 단언). 코드 변경 없음 | **a 추가** / b 문서만 |

## 4. 미검증 · 확인 필요

| 번호 | 내용 |
|---|---|
| V-P2c-1 | `adjustedAcqPrice`가 이 줄의 값을 덮는 정확한 경로 — 어떤 조건에서 덮이지 않고 안분 echo가 최종 취득가액이 되는가(그 경우 이 줄이 값을 바꾼다) |
| V-P2c-2 | 안분 echo `allocatedAcquisitionPrice`가 화면에 그대로 나오는 곳(소비처 전수) |
| V-P2c-3 | 상가 · 건물 · 재개발 · 분양권 컴패니언 · 3건 묶음 · 50% 외 지분의 값 |
| — | 사람이 직접 한 브라우저 수동 확인은 하지 않았다 |
