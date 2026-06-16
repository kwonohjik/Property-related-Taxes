# NBL 후속 갭 마스터 계획서 (F1·F2·F3)

> 작성 2026-06-17. 선행: 갭 3c·3d·3a·3b 전부 완결(PR#238·#239·#240·#241). 본 문서는 그 때 **scope OUT**으로 미룬 후속 3건의 구현 계획.
> 법령 근거는 전부 KoreanLaw `get_law_text`/`get_annexes` **본문 실측**(2026-06-17, mst=286211 소득세법 시행령 · mst=286379 소득세법 시행규칙). 추정 0.

---

## 0. 대상 3건 요약

| ID | 제목 | 법령 근거 | 규모 | 위험 | numeric 영향 | 계획서 |
|---|---|---|---|---|---|---|
| **F1** | 양도일 의제 (경매·공매·신문공고) | 시행령 §168의14② · 시행규칙 §83의5② | S/M | 낮음 | 기간기준 판정 플립 (경계) | `gap-f1-deemed-transfer-date.plan.md` |
| **F2** | 별표3~6·별표1의3 정본 자동산출 | 시행규칙 §83의4①③④⑨⑩⑫ · 별표3~6 · 시행령 별표1의3 | L | 중 | 기준면적 정확도 (면적안분 입력) | `gap-f2-annex-area-tables.plan.md` |
| **F3** | STEP 0.6 boolean → 부분 면적안분 중과 | 시행령 §168의11⑤⑥ · 법 §104의3① | XL | **높음** | **과대중과 해소(현재 초과분 전량 +10%p)** | `gap-f3-partial-area-surcharge.plan.md` |

---

## 1. 현황 — 공통 사실 (실측)

### 1-1. 면적 안분 산출 지목 = **3지목** (메모리 "5지목 공통" 정정)
`computeAreaProportioning`(`lib/tax-engine/non-business-land/utils/area-proportioning.ts`)로 `AreaProportioning`(`businessArea`·`nonBusinessArea`·`nonBusinessRatio`·`buildingMultiplier`)을 산출하는 곳:

| 지목 | 파일:line | 기준면적 근거 |
|---|---|---|
| 목장 | `pasture.ts:150` | 별표1의3 가축별 기준면적 (§168의10③) |
| 기타토지 | `other-land.ts:217` | §168의11① 호별 기준면적 |
| 주택부수토지 | `housing-land.ts:101,131` | §168의12 정착면적×배율 |

**농지(`farmland.ts`)·임야(`forest.ts`)·별장(`villa-land.ts`)은 면적기준 초과 안분 미산출** — farmland·forest는 `areaProportioning` grep 0건(자경·재촌·기간기준 boolean). 두 후속의 적용 범위는 **다르다**:

| 후속 | 적용 범위 | 기준 |
|---|---|---|
| **F3** 면적안분 중과 | **3지목** (목장·기타토지·주택부수토지) | `areaProportioning` 산출 지목 |
| **F1** 양도일 의제 (§168의6) | **5 judge** (farmland·forest·pasture·other·villa) | `meetsPeriodCriteria` 호출 지목 |

`housing-land`는 §168의6 미사용(면적배율만) → F1 무관. 교집합은 목장·기타토지뿐. (메모리 "5지목 공통"은 F3 기준 **3지목**으로 정정.)

### 1-2. 현재 중과는 boolean all-or-nothing
- 판정 엔진: `engine.ts:258` `additionalRate: isNonBusinessLand ? 0.10 : 0`.
- 본 세액: `transfer-tax-rate-calc.ts:272` `if (input.isNonBusinessLand && surchargeRates.non_business_land)` → **전체 `taxBase`**에 누진+10%p.
- `areaProportioning`은 판정 엔진이 **산출은 하나** 본 세액 계산에 **전혀 소비되지 않음** (`transfer-tax-rate-calc.ts`·`transfer-tax-finalize.ts` grep: `areaProportioning` 0건).
- 결과: 기준면적 초과 시 `isBusiness:false`(전량 비사업용) → **초과분뿐 아니라 기준면적 이내분까지 +10%p** = 과대중과.
- 결과뷰 `NonBusinessLandResultCard.tsx:102`가 이 한계를 명시: "초과분만의 부분 안분 중과는 반영되지 않습니다."

### 1-3. 별표 = 직접입력 우회 중
- 자동산출 4건만 구현: `area-standards.ts` `NBL_AREA_MULTIPLIER`(2호나×1.5·4호×200·7호×1.2·13호 660).
- 별표3~6 의존 호(1호 체육·5호다 예비군·6호 휴양)는 `other-land.ts:66` `return o.standardAreaLimit`(직접입력). 미입력 시 면적기준 미적용.
- 목장 별표1의3 per-head는 `livestock-standards.ts` 하드코딩값(한우10·젖소15 등) — 별표1의3 본문 대조 **미완**(blocker).

### 1-4. 양도일 의제 = 미구현
- `judgeNonBusinessLand`은 `input.transferDate`를 §168의6 기간기준 window 종료일로 직접 사용.
- 경매·공매·장기매각 시 의제일(더 이른 날)을 양도일로 보는 §168의14② 경로 부재.

---

## 2. 우선순위·PR 순서

```
F1 (양도일 의제)  ──독립──┐
                          ├──→ 병렬 가능 (파일 비중복)
F3 (부분 안분 중과) ──────┘
                              ↓ (F3 머지 후)
F2 (별표 자동산출) ──── 기준면적 정확도 향상 (F3의 입력 품질 제고, 독립 동작)
```

**권장 순서: F1 → F3 → F2.**

- **F1 1순위**: 독립·소규모·저위험. `period-criteria` 호출 경로만 영향. 단독 ship 가능.
- **F3 2순위**: numeric 가치 최대(과대중과 해소). 본 세액 파이프라인(rate-calc·finalize) 대수술 → 위험 높음, 단독 집중. F1과 파일 비중복이라 병렬 가능하나 위험 격리 위해 순차 권장.
- **F2 3순위**: 별표1의3 blocker + 별표3~6 다행표·교차법령(지방세법 용도지역별 배율) → 데이터 작업 大. 현재 직접입력으로 우회 가능 → 충실도 향상이 본질. **부분 구현 허용**(단순 별표 자동화 + 복잡 비고는 직접입력 유지).

### 충돌 매트릭스
| 축 | F1 | F2 | F3 |
|---|---|---|---|
| 엔진 진입 | 5 judge `meetsPeriodCriteria` 호출 + `engine.ts` `getPeriodJudgmentDate` | `other-land.ts`·`pasture.ts`(기준면적) | `engine.ts:258`(surcharge)·`transfer-tax-rate-calc.ts:272` |
| 타입 변경 | `NonBusinessLandInput` +의제일 | `OtherLandUsage`(변경 적음) | `NonBusinessLandJudgment.surcharge` +비율 |
| 본 세액 | 무관 | 무관 | **rate-calc·finalize 변경** |
| 상호 의존 | 없음 | 없음(F3 입력 품질↑) | F2의 정확 기준면적 소비(독립 동작) |

**SR-F1 (충돌 회피)**: F3가 `AreaProportioning`을 본 세액에 노출하는 타입 변경(`NonBusinessLandJudgment`)을 하므로, F2는 F3 머지 후 rebase. F1은 어느 쪽과도 충돌 없음.

---

## 3. 테스트·게이트 전략 (전 갭 공통)

1. **Pre-Do anchor 우선**(memory `feedback_pre_anchor_verification`): 각 갭의 핵심 anchor 1건을 Do 전 작성→**FAIL 확보**→구현→PASS. "현행 일치 예상" 금지.
2. **법령정합 anchor**(memory `feedback_anchor_correction_legal_priority`): 기대값은 §168의6/§168의11/§104의3 법문 직접 계산. 외부자료 추종 금지.
3. **numeric 영향 실증**(memory `feedback_numeric_impact_verify_before_bug_claim`): F3는 부분안분 전/후 세액 차이를 anchor로 실증(과대중과 해소 정량화).
4. **14 동기화 지점**: 신규 입력 필드는 `feedback_api_zod_schema_sync`의 ⑫⑬⑭ grep 자가점검. NBL은 `buildNonBusinessLandRaw` prefix-pick(`k.startsWith("nbl")`)으로 ④⑬ 자동, ⑫ Zod는 수동.
5. **게이트**: `npx tsc --noEmit` 0 · 전체 `npm test` 통과 · 변경 파일 ESLint 0.
6. **800줄 정책**: 위반 시 즉시 슬라이스 추출(F3는 rate-calc 분기가 커질 수 있음 → `transfer-tax-nbl-surcharge.ts` 헬퍼 분리 선검토).
7. **결과뷰 동기화**(memory `feedback_engine_result_display_drift`): F3 완료 시 `NonBusinessLandResultCard.tsx:102` 안내문 갱신 + 부분안분 세액 표시. F1 완료 시 의제일·사유 결과카드 행 추가.

---

## 4. scope OUT (본 3건에서도 제외 — 추가 후속)

- **§168의11⑥ 복합용도 건축물 부속토지 안분**(단일건축물 연면적비 / 다수건축물 바닥면적비) — F3에서 `buildingMultiplier` 경로로 일부 흡수 가능하나 정식 구현은 별도. 현재 `buildingMultiplier:1` 고정.
- **별표1의3 per-head 정본 대조** — KoreanLaw 가지번호("1의3") 별표 조회 파서 실패 + classifier 일시 불가. F2의 blocker로 격리(직접입력·하드코딩 유지, Do 단계 bylSeq 탐색 또는 법제처 직접).
- **별표3~6 비고의 교차법령 배율**(지방세법 시행령 용도지역별 적용배율) — F2에서 단순 기준면적만 자동화, 용도지역별 배율 비고는 직접입력 유지.
- NBL Low 군(재촌 30km 좌표 실측·`UnavoidableReasonType` 잔재 enum 등 numeric 0).

---

## 5. 자가검토 (작성 직후 1패스)

| # | 카테고리 | 위치 | 문제 | 정정 |
|---|---|---|---|---|
| 1 | 오류 | 메모리 "5지목 공통" | farmland·forest는 면적안분 미산출 | F3 대상 **3지목**으로 정정 (§1-1 실측) |
| 2 | 누락 | F2 별표1의3 | 정본 미확보 | blocker 명시·직접입력 유지 (§4) |
| 3 | 모순 | F3 본 세액 | §104①후단 단기세율 비교가 부분안분과 충돌 가능 | gap-f3 케이스 매트릭스에서 단기×부분안분 분기 enumerate |
| 4 | 누락 | F1 의제일 적용 범위 | transferDate 전역 치환 위험 | **§168의6(meetsPeriodCriteria)만** 치환·지목/도시지역/무조건의제 불변 (gap-f1 §3) |
| 5 | 개선 | PR 순서 | F2가 F3 타입 변경과 충돌 | SR-F1 rebase 규칙 (§2) |
