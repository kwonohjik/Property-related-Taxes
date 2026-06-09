# 상속인별 집계표 — 과세제외·채무 행 분리 · UI 설계

- 계획서: `docs/01-plan/heir-allocation-excluded-debt-row-split.plan.md`
- 엔진 설계: `docs/02-design/features/heir-allocation-excluded-debt-row-split.engine.design.md`
- 작성일: 2026-06-09

## Context — 입력 위젯 없음, 결과 표 렌더만 변경

신규 입력 폼 없음(비과세·채무 입력은 기존 마법사 단계 그대로). 변경은 **결과 표 행 구성**뿐.
표 데이터는 `buildSummaryTable()`(`heir-allocation-summary.ts`) `rows[]` 단일 소스 → 화면·PDF 컴포넌트는 `rows.map`으로 자동 순회하므로 **렌더 컴포넌트 코드 변경 0**(행 추가는 데이터에서 발생).

## 소비 컴포넌트 (변경 없음 — 확인)

| 채널 | 파일 | 순회 | 변경 |
|---|---|---|---|
| 화면 | `components/calc/results/HeirAllocationSummaryTable.tsx` | `data.rows.map` (`:103` 영역) | 없음 (행 자동 반영) |
| PDF | `lib/pdf/sections/inheritance-heir-allocation-section.tsx` | `data.rows.map` (`:103`) | 없음 |

## 표 레이아웃 (ASCII — 분리 전후)

```
[분리 전]                              [분리 후]
① 총상속재산 (채무공제 전)             ① 총상속재산 (채무공제 전)
㉠ 과세제외 재산 (비과세+과세가액불산입) → ㉠ 비과세 재산 (§11·§12)
㉡ 채무·공과·장례비 공제                  ㉠ 과세가액 불산입 (§16·§17)
② 사전증여재산                          ㉡ 채무 (§14①3호)
③ 추정상속재산                          ㉡ 공과금 (§14①1호)
④ 상속세 과세가액 (①−㉠−㉡+②+③)          ㉡ 장례비 (§14①2호)
                                       ② 사전증여재산
                                       ③ 추정상속재산
                                       ④ 상속세 과세가액 (① − ㉠ − ㉡ + ② + ③)
```

## 표시 정책 (계획 §7 결정 반영)

| 항목 | 정책 | 근거 |
|---|---|---|
| rowNo | 분리 5행 **그룹 원문자 반복**: 비과세·불산입=㉠, 채무·공과금·장례비=㉡ (사용자 결정 2026-06-09). ⑥그룹 child ㉠㉡㉢과 중복되나 들여쓰기로 시각 구분 — 사용자 승인 | ④ 산식 `① − ㉠ − ㉡ + ② + ③` 직접 매핑 |
| 라벨 들여쓰기 | **`isGroupChild` 미지정**(평문, pl-7 들여쓰기 안 함) | 기존 ㉠㉡(`row-a-excluded`·`row-b-debt`)·자산4분류 선례 — ④ 구성요소지 그룹child 아님 |
| 0원/미입력 행 | **항상 표시, total 칸 0이면 빈칸**(`Σ \|\| null`) | 계획 §7-#1 |
| perHeir 셀 | corp·미해당 셀 빈칸(buildPerHeir undefined→null), 0은 "0" | 기존 `fmt`(`:104-109`) |
| 장례비 값 | capped 후 금액, 라벨 주석 없음 | 계획 §7-#4 |
| ④ 산식 | 한국어 명칭 풀어쓰기(기호 약어 금지) | 메모리 `feedback_result_view_korean_formula` |
| 금액 정렬 | 우측정렬 font-mono tabular-nums | 스킬 `amount-column-align` (기존 표 적용 유지) |

## 동기화 지점 (결과 표시 — 입력 8지점 비해당)

이 기능은 입력 폼 필드 추가가 아니므로 14지점 중 ①~④·⑧~⑭(폼·API·Zod·Route) **비해당**.
관련 지점은 ⑦(결과 카드)뿐 — 단, `buildSummaryTable` rows 추상화로 컴포넌트 직접 수정 없이 데이터 레이어(summary.ts)에서 흡수.

| 지점 | 해당 | 처리 |
|---|---|---|
| ⑦ 결과 카드 | ✓ | `heir-allocation-summary.ts` rows 5행 교체 (화면·PDF 공통 반영) |
| 나머지 13 | ✗ | 입력 경로 무변경 (echo 필드는 엔진 result 내부, API body 불변) |

## testid·접근성

- 기존 표 행에 testid 부여 패턴 있으면 신규 5행도 동일 규칙(rowId 기반). `row-a-nontaxable` 등 rowId가 testid 앵커.
- 표 의미 구조(헤더 scope) 기존 유지. 신규 행은 일반 데이터 행.

## 자가 검토 이력 (STEP 13)

정정 2건 (+ 긍정 2건):
1. (모순 Medium) 들여쓰기: "미지정 또는 통일" 모호 → **isGroupChild 미지정 확정**(기존 ㉠㉡·자산4분류 선례, pl-7 안 함)
2. (개선 Low) ④ 산식 "불산입"→"과세가액불산입" 정확화 (계획 §2 동기화, 메모리 `feedback_result_view_korean_formula`)
- (긍정) testid `heir-summary-row-${rowId}`(`:165`) 자동 부여 → 신규 5행 E2E 앵커 확보
- (긍정) rowNo 조건 렌더(화면 `{rowNo &&}`·PDF `:120`) → 생략 자연 처리
