# 양도세 취득가액 감사 잔여 3건 수정 계획서

> **상태**: Plan (Do 미착수)
> **작성**: 2026-07-21 (§163⑨ 취득가액 재감사 잔여 항목)
> **출처**: 2026-07-21 취득가액 병렬 감사(2에이전트) 잔여 3건. §163⑨ 표준·상가 차단은 PR#731로 별건 완료.
> **성격**: 3건이 서로 다른 서브시스템·심각도·규모 → **독립 PR 3개 권장**(사슬 아님). 우선순위 #3(즉시)·#2(anchor 확보 후)·#1(feasibility 후).

---

## 개요 — 3건 요약

| # | 항목 | 심각도 | 성격 | 세액 영향 | 규모 |
|---|---|---|---|---|---|
| #3 | GB §97②2호 swap 사이드바 pre-swap 표시 | Medium | 표시 불일치(세액 정확) | 없음(표시만) | 소 |
| #2 | 겸용 nonBiz 중과 10%p 기본공제 前 income 적용 | Medium | 산식 비대칭(단건 대비) | 최대 ~25만원 과다 | 소~중 |
| #1 | 재개발 land+right + gift + 환산 §163⑨ deadlock | High(도달성 낮음) | (B)안전판 block ✅#733 + (A)실가 기능 ✅#734(spike 성공·:108 과보수) | 큼(신고가액 무시) | (B)소 / (A)소(엔진 기구현) |

---

## #3 — GB §97②2호 swap 사이드바 pre-swap 표시 (Medium·표시만)

### 현황 (실측)
- **엔진(정확)**: `general-building-route-helper.ts:114-126` `buildProperties(cards, nonBusinessRatio, swap)` — `swap.allocation.get(propertyId)` 존재 시 `acquisitionPrice: 0`·`expenses: swapNabok`(배분 나목)로 치환 → 세액 정확.
- **사이드바(pre-swap)**: `buildApportionment`(정의 :194) 호출 **2곳** 중 **환산 경로 :459-465**가 `swap` 인자를 받지 않음 → 배분 결과 swap 미반영(환산취득가·개산공제 원값). 데이터 흐름(실측): `buildApportionment` → `apportionment.apportioned` → `transfer-per-asset-summary.ts` `bundledMatch`(:158) → `allocatedAcquisitionPrice`(:192)·`allocatedExpenses`(:234) → 좌측 사이드바 "자산별 취득가액/필요경비"가 실제 엔진값과 상이.

### 수정 방향
`buildApportionment`(:194)에 `swap?: GeneralBuildingSwapDecision` 파라미터 추가(엔진 `buildProperties`와 동일 시그니처 패턴) → swap 발동 자산은 배분 취득가액=0·필요경비=배분 나목으로 표시. **환산 경로 호출부(:459)만** `swap` 전달. **실가 경로 호출부(:660)는 제외** — §97②2호 swap은 환산취득가 모드 전용(실가 모드는 swap 미발동).

### 정합 정책
- [[feedback_engine_result_display_drift]] ★★★ — 차감값↔결과 표시 일관성. 사이드바 배분값 = 엔진 실사용값.
- **범위(Surgical)**: `buildApportionment` 시그니처 + 호출 1곳. 세액 로직 무변경.

### anchor
`__tests__/lib/calc/gb-swap-apportionment-sidebar.anchor.test.ts` — GB swap 발동 케이스에서 `buildApportionment` 반환 배분값이 swap 반영(취득가액 0·필요경비=나목)인지. swap 미발동 회귀 1.

---

## #2 — 겸용 nonBiz 중과 10%p 기본공제 前 income 적용 (Medium·과다 위험)

### 현황 (실측)
- **겸용(mixed)**: `transfer-tax-mixed-use-totals.ts:56` `nonBusinessSurcharge = applyRate(nonBizIncome, 0.10)` — `nonBizIncome`은 **기본공제 차감 前 양도소득금액**(`aggregateIncome = housing+commercial+nonBiz`, `taxBase = max(0, aggregate − 250만)`은 별도).
- **단건(single)**: `transfer-tax-rate-calc.ts:307-311` `surchargedBase = applyRate(taxBase, ratio)`·`surchargeAmount = applyRate(surchargedBase, additionalRate)` — **기본공제 차감 後 과세표준(taxBase)** 기준.
- → 겸용은 nonBiz 부분에 기본공제가 배분되지 않아 **10%p 중과 base가 과다**. 최대 오차 = 기본공제(250만) × nonBiz 귀속분 × 10% ≒ **최대 25만원 과다**(nonBiz가 유일 소득일 때).

### 법령·정합 검토 (Do 前 확인 필요 — 추정 금지)
- §104①8호 비사업용 토지 +10%p는 **과세표준(과세표준=양도소득금액−기본공제)** 에 적용되는 세율 → 중과 base는 nonBiz의 **과세표준 귀속분**이어야 함(단건 엔진과 동일 원리).
- [[feedback_no_unfavorable_application_without_legal_basis]] ★★★ — 법 근거 없이 납세자 불리(과다) 적용 금지. 현행 겸용은 과다 방향.
- **⚠️ 동일 함수 추가 갭(STEP1 검토 발견·확인 필요)**: `buildTotalTax`는 단건 `transfer-tax-rate-calc.ts:313-322`의 **§104① 후단 max(단기보유세율 50%/40%, NBL 누진+중과)** 비교를 **미수행**. 겸용 nonBiz가 단기보유(2년 미만)면 겸용도 이 비교가 누락됨 → #2 Do 시 기본공제 배분과 **함께** 검토(별건 분리 가능·anchor로 확정). 단, nonBiz 부분은 통상 장기(비사업용 판정 자체가 보유기간 요건 얽힘)라 도달성은 낮음.
- **⚠️ Do 게이트**: 기본공제 250만의 nonBiz 배분 방식(비례배분 vs 순서배분)은 **교재·NTS 모의계산기 참조 예제로 anchor 확정 후 구현**. 겸용 3부분(주택·상가·nonBiz) 기본공제 배분 정본 미확보 상태 → 추정 구현 금지.

### 수정 방향 (anchor 확보 시)
`buildTotalTax`(:39)에서 nonBiz 중과 base를 `taxBase × (nonBizIncome / aggregateIncome)`(비례배분) 또는 확정 배분식으로 교체 → `applyRate(nonBizTaxBaseShare, 0.10)`. `floor` 잔액흡수([[feedback_floor_residual_absorption]]) 준수.

### anchor
교재/NTS 예제 기반 겸용 nonBiz 케이스 golden(`toBe`) — 기본공제 배분 후 중과 base·최종 세액. 회귀: nonBiz 0·nonBiz 유일 경계.

---

## #1 — 재개발 land+right + gift + 환산 §163⑨ deadlock (High·도달성 낮음)

### 현황 (실측)
- `transfer-tax-validate-redev.ts:52` `isLandRightCombo = originalAssetType === "land" && subject === "right"`.
- `:53-58` §163⑨ gift 가드가 `!isLandRightCombo`로 **land+right 조합을 명시 제외**(주석 :47-49: 실가 미지원 deadlock 회피).
- `:95-97` `subject === "right" && !useEstimatedAcquisition` → **"토지 출자 + 입주권 + 실가 모드는 후속 PR" 차단**(환산 ON 유도).
- → land+right+gift: 실가 차단(:95) + gift 환산가드 skip(:52) → **환산 강제** → `runLandContribEstimated`가 §166③ 지가비율 환산으로 종전자산 취득가액 산출, **증여 신고가액 무시**.
- 상속은 `transfer-tax.ts:242-254`가 `inheritedAcquisition` payload로 환산 override 가능하나 **gift는 채널 없음**.

### 수정 방향 (2단계 — 안전 먼저·기능 나중, STEP1 검토 재정의)
silent 오세액 즉시 제거가 최우선 → **(B)를 먼저, (A)는 후속**으로 분리(spike 성공 여부와 무관하게 (B)는 즉시 안전 확보).

- **(B) 즉시 안전판 (소·먼저)**: land+right+gift+환산을 **friendly block**("토지 출자 + 입주권 + 증여취득 실가는 미지원 — 취득가액 확인 시 별도 신고" 안내)으로 차단 → **silent 오세액 → 명시적 안내** 전환. validate-redev.ts에 land+right+gift 전용 블록 추가(현행 :52 `!isLandRightCombo` 예외를 gift+환산일 때 block으로 대체). GB #727 block 철학과 정합. **잘못된 세액을 산출하지 않는 것이 1차 목표.**
- **(A) 실가 경로 개방 (✅완료 PR#734)**: **feasibility spike 성공** — `runRedevelopment`(redevelopment.ts:94-127)이 land+right+실가+pay를 branch1(housing)·branch2(useEstimated)에 미매치 → `runOriginalMember`→`computeRightPay`(§166①1호, redevelopment-split.ts:204)로 이미 라우팅, `oldAcquisitionPrice = actualAcquisitionPrice`(신고가액, :148) 사용. probe 실측: `valuationMethod=actual`·preApprovalGain=300M(권리가액 500M−신고가액 200M)·total=350M. **validation :108 차단만 과보수**였음. **범위=pay만**(receive는 :91 별도 후속). 구현: (1)`:108`(land+right+실가 후속PR) 제거 (2)gift §163⑨ 가드(:53)를 `(!isLandRightCombo || settlementDirection==="pay")`로 확장 → gift+land+right+pay+환산은 "실가로 전환"(§163⑨) (3)#1(B) block을 `settlementDirection!=="pay"`(receive) 한정으로 축소. `redevActualAcquisitionPrice` 필수검증(:123)이 신고가액 입력 보장. anchor: validation 6(실가개방·pay §163⑨·receive 미지원·비-gift 회귀·:91 receive 차단·pre-1985) + engine 3(actual·300M·350M) + M-1 갱신.

### 정합 정책
- [[feedback_no_unfavorable_application_without_legal_basis]] — §163⑨ 신고가액 우선(환산이 신고가액 대체 = 근거 없는 세액변동).
- [[project_transfer_special_engine_gift_acquisition_163_9_gap]] — gift §163⑨ 4경로 완결의 마지막 잔여(land+right subset). (B) 완료 시 "silent 오세액 0" 달성.

### 규모·리스크
- **(B) = validation 1블록(소)** → 즉시 오세액 방지. **(A) = 엔진 신규 경로 검증(중~대)** → feasibility 조건부. 도달성 낮음(land 출자 + 입주권 양도 + 증여취득 + 환산 동시)이라 (A) 우선순위 최후, (B)는 #3·#2와 함께 조기 처리 가능.

---

## 권장 순서 & 공통 게이트

**조기(안전·표시, 즉시 가능)**: **#3**(사이드바 표시) + **#1(B)**(silent 오세액 → 안내 block) — 둘 다 소·정본 불요.
**anchor 확보 후**: **#2**(기본공제 배분 + §104후단 확인, 교재/NTS 예제 필요).
**feasibility 후(최후)**: **#1(A)**(land+right 실가 기능, probe 성공 시).

- 각 건 독립 PR. 공통: anchor RED→GREEN·tsc0·회귀0·lint0·코드리뷰 High/Medium 0.
- **정본 미확보 구간(#2 기본공제 배분·#1(A) land+right 실가 산출)은 anchor/probe로 확정하기 전 구현 금지**(추정 금지). #3·#1(B)는 정본 불요라 즉시 착수 가능.
