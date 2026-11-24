# 비사업용 토지 상태 이력 E3-④ 「13호(무주택 1세대 1필지 나지) × 소유기간 중 이력」 — 화면·클라이언트(①~⑧) 계획서

> 상태: **Plan v2 (2026-11-24 — 코드 변경 0 · 엔진 계획서 v1(383줄 · `nbl-state-history-e3-4-ho13-bare-land.engine.plan.md`) 정합 완료)** — 이 문서는 ① 현행 UI가 13호 + 이력 조합을 어떻게 보이는지 **실측**하고(§1) ② 엔진 계획서의 **추천 결정(Q-1 (가) · Q-2 (다) · Q-3 (가) · Q-4 (가))** 에 따른 화면(UI-C 안내·라벨 + UI-M 「세대 주택 소유 기간」 행 입력)을 설계하고 ③ 엔진 결정이 달라질 때의 UI 영향을 표로 둔다(§3). 사용자 결정 전이므로 **엔진 Q-1~Q-4 미결 — 이 문서의 UI-M은 엔진 Q-2 (다)가 승인될 때만 구현한다.** 엔진 모델명·필드명·상수명은 엔진 계획서가 정본이고 이 문서가 «제안»이라 쓴 이름은 엔진에 요청하는 것이다 — 엔진 결정을 UI가 새로 짓지 않는다.
> 범위: 통합 계획서 E3 후속 목록 ④(`nbl-other-land-state-history.plan.md:81`) — 「13호(나지) × 이력(`markOwn`이 13호를 기록하지 않음 — §7-4 «확인 필요»)」(`:293`). 13호 = 영 §168의11①13호(`other-land-ho-meta.ts:296-309`).
> **범위 밖(재제안 금지)**: V5-G2(G-6 범위) · Q-8 (가) 겸용 상가분 · 주택 배율 초과분 방침 Q-3a (나) 변경 · 과세기준일(6.1.) 접기(V-1 일 단위 확정) · 자동 안분 fallback · `useEffect → store` 미러링 · native checkbox/radio/date · placeholder 숫자 예시 · 13호 외 호(11호 등)의 결과 표 근거 열 일반화(UQ-6) · 구간별 호 입력(§1.5).
> 정본: `nbl-other-land-state-history.{plan,ui.plan,engine.plan}.md` · `nbl-state-history-e3-{1,1b,2,3}-*.{engine,ui}.plan.md`(특히 E3-③ UI §18~§20, E3-② UI 「추가 정정」).
> 모든 file:line = 워크트리 `Property-related-Taxes-nbl-e3-4-plan`(master c16983405) grep·Read 실측. **동작 주장은 §1.3 vitest probe 표에만 근거를 둔다(route 관통 13종 + 렌더 4종 — probe 파일은 삭제함). 코드 정독만으로 쓴 곳은 «정독», 미실측은 «확인 필요»로 표시했다.** 엔진 계획서의 «오라클» 수치는 인용하되 UI가 재측정하지 않았다(미구현 모델이므로).

---

## 0. 한눈에

| 항목 | 내용 |
|---|---|
| 문제 | 13호(나지)는 **이력을 켜면 «꼬리 구간(양도일 현재 나지 구간)에만»** 인정된다 — 다른 호(다목)는 소유기간 **전체**가 사업용으로 세어지는데(`markOwn(trace, fullPeriod, ho)` — `other-land.ts:527,578,651`) 13호만 `markOwn`이 즉시 return한다(`other-land-helpers.ts:63-67`) · `daMokAndNaMok`도 13호를 다목 후보에서 뺀다(`other-land-state-history-apply.ts:84`). 또 «무주택 1세대»는 국세청이 **기간별**로 읽는데(엔진 §1.2 — 6건) 입력 칸이 없어 13호를 고르면 **소유기간 전체 무주택** 자기선언이 된다. **화면은 이 두 사실 어디서도 말하지 않는다**(§1.4 M-1~M-6) |
| 실측 한 줄(§1.3) | 같은 거래(600㎡ · 취득 2014-01-01 · 양도 2024-01-01 · 철거 후 나지 양도)에서 **13호 = 사업용 2,040/3,651일 · 198,210,000** / **11호(다목) = 3,651/3,651일 · 198,210,000** / **호 없음 = 0/3,651일 · 253,960,000(비사업용)**. 신축 후 건물 양도(C3)는 **13호를 골라도 호 없음과 같은 값**(253,960,000) — 13호가 아무 효과 없다 |
| 엔진 계획서 정합(§17) | 엔진 추천 = **Q-1 (가)** 건축물 없는 구간(꼬리 + 과거 나지)에 13호 적용 · **Q-2 (다)** 세대 주택 소유 기간 **행**(`startDate` + 선택 `endDate`) · **Q-3 (가)** 이력과 무관(13호 선택 시 항상) · **Q-4 (가)** 행 없음 = 현행(전 기간 무주택 자기선언) + 고지. → **새 입력 1(행 배열) + UI 전용 질문 1**. PR = E3e-0(테스트) → E3e-1(Q-1·입력 없음) → E3e-2(행 입력 ⑫⑭) |
| UI 변경 두 층 | **UI-C**(E3e-1 뒤 — 새 입력 0): 13호 안내 · `hoFail` 보조 줄 · 결과 표 라벨 · 부분 면적 안내 · 고지 정합. **UI-M**(E3e-2 뒤): 「세대 주택 소유 기간」 질문 + 행 입력(13호 블록 안, 이력과 무관) + ⑧ 규칙 3 + 미리보기 + 결과 보조 블록 |
| 가장 큰 위험 | ① **입력 활성·요구 조건 불일치(막다른 길)**: 행은 «엔진이 읽을 때만» 요구해야 한다 — 읽는 경우 = 13호 ∧ (꼬리 나지 ∨ (이력 `changed` ∧ 이력 읽힘 ∧ 660㎡ 이내)). 꼬리 건물 + 이력 OFF(13호 불인정) · 660㎡ 초과 + 꼬리 건물(엔진 D-2 기여 0) · 양도일 의제는 **엔진이 행을 읽지 않아** ⑧이 요구하면 안 된다(E3-② 의제 결함 · E3-③ 후속 #3636 교훈) — **엔진 술어 하나를 ④⑤⑧이 직접 호출**(R-1) ② **숨은 stale 행 → ⑫ 400**: ⑫′가 행 결함(형식·순서)을 거절하므로 화면에 안 보이는 stale 행을 ④가 보내면 막다른 길 → ④가 술어 거짓·상태 «없음»이면 `[]`로 보낸다 ③ **새 칸 ⑫ 누락 = 침묵 strip**(엔진 §5 ⑫ — route 관통 anchor) ④ **이력 OFF + 행 입력 시 결과 안내문이 거짓**: 현행 `state_at_transfer` 안내(`NonBusinessLandResultCard.tsx:253-257` «양도일 현재의 이용 상태를 소유기간 전체에 적용…»)가 사실과 다르다 → 엔진 echo 위치 요청(R-3) ⑤ 고지 모순 M-4(`APPLIED` 고지 «호별 용도는 소유기간 전체에 적용» vs 13호) |
| ⑥ 사이드바 | **변경 없음**(NBL 참조 0건 — E3-③ UI §0 실측 유지 · 이번 세션 재측정 안 함 — UV-9) |
| 사용자 결정 | **UQ-1~UQ-8 전부 추천안 승인 — 사용자 결정 2026-11-24**(§12) · 엔진 Q-1 (가) 나지 구간만 · Q-2 (다) 주택 소유 기간 행 · Q-3 (가) · Q-4 (가) · 엔진 요청 R-1·R-3(필수)·R-2·R-4·R-5·R-7·R-8 승인 · R-6 불필요 |

### 엔진 계획서와 정합한 계약 A-n (엔진 계획서 §번호 = `…e3-4-ho13-bare-land.engine.plan.md`)

| # | 계약 | 엔진 계획서 | 상태 | 이 문서가 쓰는 곳 |
|---|---|---|---|---|
| A-1 | 입력 칸 = **⑫ `nblOtherHouseholdHousePeriods: z.array(행).optional()`**, 행 = `{ startDate(주택 소유 첫날), endDate?(소유하지 않게 된 첫날 — **비우면 양도일까지**) }`, 겹침은 엔진이 병합. 엔진 입력 `OtherLandUsage.householdHousePeriods` | §3.3 Q-2 (다) · §5 ⑫⑭ · D-7 | 엔진 추천 — 사용자 결정 대기(Q-2) | §4.2 · §6 |
| A-2 | **⑫′ refine = ⑧과 같은 leaf `householdHousePeriodIssue`**(시작일 형식 · 종료일 > 시작일 · 양도일 이후 시작 차단) · 행 검증은 사건 leaf와 섞지 않는다(T-6) | §5 ⑫ · T-6 | ✅ | §7 HH-3 |
| A-3 | **Q-4 (가)**: 행 없음 = 현행 + 고지 — **⑧만 «질문 응답»을 요구하고 직접 API·엔진은 현행**(`""`·미전송 = 현행) | §3.3 · §8.1 Q-4 | 엔진 추천 | §4.2 · §7 HH-1 |
| A-4 | **Q-3 (가)**: 이력과 무관 — **이력 OFF 경로도 core가 `householdFreePeriods`(= 소유기간 ∖ 행)로 판정**(별도 필드 — T-1) | §3.3 Q-3 · §4.3 | 엔진 추천 | §4.2 활성 조건 |
| A-5 | echo: `periodEvaluation.stateHistory.vacantLot?: { intervals: {start,end,days}[]; houseOwnedDays }`(**이력 `state_history`일 때만**) · 없으면 키 부재 = 종전과 바이트 동일 | §4.5 | ⚠ **이력 OFF + 행**의 echo 위치가 없다(R-3) | §8 |
| A-6 | 고지 상수 신설 2: `NBL_STATE_HISTORY_VACANT_LOT_APPLIED_NOTICE`(13호 + `changed` + 나지 구간이 13호로 사업용에 들어감) · `…VACANT_LOT_AREA_NOTICE`(660 초과 + 꼬리 건물) + 기존 `NBL_VACANT_LOT_SELF_DECLARED_NOTICE` 보강(행이 있을 때). **기존 문구 바이트 불변** | §4.4 | ✅ 문구 요지만 — 정본 엔진 | §8 · UQ-3 |
| A-7 | `judgeHoRequirements`가 13호 + 행 있을 때 `householdFreePeriods`를 **`businessPeriods`가 아닌 별도 필드**로 돌려준다(T-1 — `other-land.ts:495`가 `ho` 없이 `markOwn`하기 때문) | §4.3 · T-1 | ✅ | §9 (X14) |
| A-8 | 이력 `changed` + 13호: 꼬리·`ownBusinessPeriods`는 **13호를 끈 core**로 보고(D-4) 13호 기여는 leaf로 | §4.1 · D-4 | ✅ | §1.3 비교 |
| A-9 | 660㎡ 초과: 꼬리 나지 = 기존 `isPartialArea` 이력 미적용 + `PARTIAL_AREA` 고지 · **꼬리 건물 + 660 초과 = 13호 기여 0 + `…VACANT_LOT_AREA_NOTICE`**(D-2) | §3.4 | ✅ | §4.1 C-2·C-4 |
| A-10 | `NBL_STATE_HISTORY_APPLIED_NOTICE` 등 **기존 상수 바이트 불변** | §4.4 | ✅ | §10 |

---

## 1. 현행 사실 (실측)

### 1.1 입력 칸 지도 — 13호 + 이력이 지금 만나는 곳

| 위치 | 내용 | 비고 |
|---|---|---|
| `OtherLandDetailSection.tsx:166` | 이력 섹션 마운트 — `nblOtherStateHistoryApplies(asset)`(기타토지 전용 술어, 호와 무관) | 13호 선택 여부를 **읽지 않는다** |
| `OtherLandDetailSection.tsx:245` | `OtherLandHoSection` 마운트(이력 섹션 **뒤** — 화면 순서 = 이력 → 호) | 이력이 호보다 앞 = 계산 순서와 일치 |
| `OtherLandHoSection.tsx:29-34`(옵션) · `:83-90`(라디오) | 호 라디오는 엔진 `OTHER_LAND_HO_META` 표에서 만든다. 13호 옵션 = «무주택1세대 1필지 나지 (13호)» · 설명 «건축물 없는 나지만 660㎡ 이내까지 사업용 (건축물이 있으면 불인정) · 무주택 1세대·1필지·주택 신축 가능 여부는 직접 확인»(`other-land-ho-meta.ts:298-303`) | «건축물이 있으면» = **양도일 현재? 소유 중?** 모호 |
| `OtherLandHoSection.tsx:58-60` · `:92-98` | `hoFail` = 엔진 `judgeHoRequirements`를 `hasBuilding: effectiveOtherHasBuildingOf(asset)`로 호출 → 건축물 있으면 «건축물(시설물)이 있는 토지 — 나지가 아니므로 13호 불인정»(`other-land-ho-requirements.ts:81-92`) | **이력이 `changed`이면 마지막 사건이 정한다**(`effectiveOtherHasBuildingOf`) |
| `OtherLandHoSection.tsx:235-239` | 13호 안내 박스 «660㎡ 이내까지 사업용으로 보며 초과분은 비사업용입니다 (별도 면적 입력 불필요)» — **이력 연동 언급 없음** | 기존 테스트가 `/별도 면적 입력 불필요/`를 `getByText`로 찾는다(`nbl-other-land-section-render.test.tsx:46-52`) — **새 문구에 이 구절을 쓰지 않는다**(중복 매치 시 throw) |
| `OtherLandHoSection.tsx:63,111-120` | self-declared 호 안내 — 13호는 `verification: "partial"`(`other-land-ho-meta.ts:307`)이라 이 블록이 아니다. 13호의 자기 선언 고지(무주택·1필지·주택 신축 가능)는 **결과 `warnings`에만** 실린다(`NBL_VACANT_LOT_SELF_DECLARED_NOTICE` `nbl-confirm-notices.ts:280-282`) | 입력 시점에는 옵션 설명 끝 «직접 확인» 한 구절뿐 |
| `OtherLandStateHistorySection.tsx:174-179,250-254` | 부분 면적 무시 안내 `nbl-other-partial-area-notice` — **`housePriorHistoryIgnoredOf`가 참일 때만**(= 기타토지 + 주택 철거 행이 있을 때, `nbl-other-state-history-read.ts:30-37`) | 13호는 해당 없음 → 안내 없음(§1.3 렌더 실측) |

### 1.2 ④⑤⑧⑫⑭ 현행 지도 — 13호에 대해

| 층 | 현행 | 근거 |
|---|---|---|
| ④ 전송 | 호는 `nblOtherRelatedBusinessType` 한 칸(자산 단위)으로 전송. 이력은 `stateHistoryWireFields`(술어 `nblStateHistoryApplies`)가 호와 무관하게 싣는다 | `nbl-other-state-history-scope.ts:146-157` |
| ⑤ 미리보기 | `buildStateHistoryPreview` — 꼬리 행 «사업용 토지 요건» = `null`(«결과 계산 후 확정»), 이전 구간은 `isStateIntervalBusiness`(건축물·재산세 구분만) | `nbl-other-state-history-preview.ts:171` |
| ⑧ 검증 | 13호 전용 이력 규칙 **없음** — `validateNblStateHistory`는 호를 읽지 않는다. 13호 + 신축으로 끝 = **통과**(§1.3 렌더 «⑧-built» null). 호 필수 입력은 `hoRequiredInputIssue`(`transfer-tax-validate-nbl-other.ts:~77`) | `transfer-tax-validate-nbl-state-history.ts:58-79` |
| ⑫ | 13호 전용 규칙 없음(호 enum만) | 정독 — `nbl-enum-values.ts` |
| ⑭·엔진 | 호 → `relatedBusinessType`. 13호는 `judgeHoRequirements`의 «나지»만 판정(건축물 있으면 FAIL)하고, PASS 때 **꼬리만** core 결론을 따른다 | `other-land.ts:478-490,527` · `other-land-helpers.ts:63-67` · `other-land-state-history-apply.ts:84` |
| 결과 | `NblStateHistoryPeriodTable` — 구간 행의 «재산세 구분» 칸은 `taxTypeText`(재산세 구분만) · «사업용 여부» 칸은 `businessDays`. **어느 호로 사업용이 됐는지 echo·칸 없음** | `NblStateHistoryPeriodTable.tsx:47-60,128-135` · 사용처 `NonBusinessLandResultCard.tsx:258` |

### 1.3 vitest probe 실측 (이 세션 · throwaway — 파일은 삭제함)

**공통 시료**(route 관통 — 폼 → ⑧ 전 단계 이슈 수집 → ④ 본문 가로채기 → 실제 route POST(⑫⑭) → 엔진): 기타토지 · 일반주거 · 면적 600㎡(13호 660㎡ 한도 이내) · 취득 2014-01-01 · 양도 2024-01-01 · 취득가 3억 · 양도가 10억 · 정밀판정 ON · 재산세 구분 종합합산 · 철거 직전 구분 «모름»(`""`) · 수도권 아님. 세액은 `calculatedTax`. (엔진 계획서의 B = 198,210,000 · N = 253,960,000과 같은 시료 계열 — 같은 값이 나왔다.)

| # | 입력 | ⑧ 이력 관련 이슈 | 상태 | 판정 | basis |
|---|---|---|---|---|---|
| N0 | 13호 · 질문 `""` · 나지 | **있음**(질문 미선택 차단 — 기존 #1) | 200 | 사업용 · 3,651/3,651 · **198,210,000** | `state_at_transfer` |
| N1 | 13호 · `unchanged` · 나지 | 없음 | 200 | N0과 같음 | `state_at_transfer` |
| N1b | 13호 · `unchanged` · 건축물 있음 | 바닥면적 칸 요구(기존) | 200 | **비사업용** · 3,651/3,651 · 253,960,000 | `state_at_transfer` |
| **C1** | **13호** · 신축 2014-01-02 → 철거 2018-06-01 · 현재 나지 | 없음 | 200 | **사업용 · 2,040/3,651 · 198,210,000** | `state_history` |
| C1′ | 같은 입력 · **호 없음(`none`)** | 없음 | 200 | **비사업용 · 0/3,651 · 253,960,000** | `state_history` |
| C2 | 13호 · (소유 시작부터 건축물) 철거 2019-01-01 · 현재 나지 | 없음 | 200 | 사업용 · 1,826/3,651 · 198,210,000 (C2′ 호 없음: 0/3,651 · 253,960,000) | `state_history` |
| **C3** | **13호** · 신축 2022-01-01(앞 나지 2014-01-02~2021-12-31 = 2,921일) · **현재 건축물 있음** | 바닥면적 칸 요구 | 200 | **비사업용 · 0/3,651 · 253,960,000** — 앞 나지 구간 행이 `비사업용`(종합합산) | `state_history` |
| C3′ | 같은 입력 · 호 없음 | 같음 | 200 | C3과 **같음**(13호가 아무 효과 없음) | `state_history` |
| C4 | 13호 · 신축 2016-01-01 → 철거 2021-01-01(건물 구간 별도합산) · 현재 나지 | 없음 | 200 | 사업용 · 2,922/3,651 · 198,210,000 | `state_history` |
| **C5** | **13호 · 면적 800㎡(660 초과)** · 철거 후 나지 · `changed` | **없음** | 200 | `isNonBusinessLand = true` · 3,651/3,651 · `calculatedTax` 198,210,000(면적 일부만 비사업용 — 세액 구성은 확인 필요) · **이력 미적용** | `state_at_transfer` + 고지 «이력을 판정에 반영하지 않았습니다 — 확인 필요» |
| C6 | 13호 · `unknown` · 나지 | 없음 | 200 | N0과 같음 + 모름 고지 | `state_at_transfer` |
| **D1** | **11호 양어장(다목)** · C1 입력 | 없음 | 200 | **사업용 · 3,651/3,651 · 198,210,000**(건축물 있던 구간 포함 전 구간 `사업용`) | `state_history` |
| D2 | 11호 · C3 입력(신축으로 끝 · 현재 건축물 있음) | 없음 | 200 | **사업용 · 3,651/3,651**(앞 나지 구간·건축물 구간 모두 사업용) | `state_history` |

→ **C1 vs D1**: 다목 호는 건축물 있던 구간까지 전 기간을 사업용으로 세는데(D1 3,651일) 13호는 꼬리만(C1 2,040일). **C3 vs D2**: 13호는 «현재 건축물 있음 + 앞 나지 구간»에서 **아무 효과가 없고**(C3′와 같음) 다목 호는 전 기간 사업용이다. 이 비대칭이 엔진 계획서 Q-1의 대상이고, UI는 사용자가 이 비대칭을 입력 단계에서 알 수 있어야 한다.
→ **C5**: 13호는 한도가 660㎡로 고정이라 «땅이 660㎡를 넘으면» 부분 면적 경로로 가 이력 입력이 통째로 무시된다. 입력 화면에는 그 사실이 없다(렌더 R4).

**렌더 실측**(jsdom — `OtherLandDetailSection`·`NblStateHistoryPeriodTable` 직접 마운트. 시료 600㎡ · 13호):

| # | 입력 | 실측 |
|---|---|---|
| R1 | C1 입력 + 결과 echo(route 응답의 `periodEvaluation.stateHistory`)로 결과 표 렌더 | 꼬리 행: `2018-06-01 ~ 2023-12-31 · 2,040일 · 건축물 없음 · 재산세 구분 «종합합산» · 사업용 일수 2,040일 · 사업용`. **«종합합산인데 사업용»의 이유(13호)가 표에 없다.** 기준 행: 가목 0일(미충족) · 나목 0일(미충족) · 다목 1,611일(충족) → «미충족인 기준이 있어 사업용» |
| R2 | 같은 입력 · 입력 화면 | 미리보기 표 존재(`nbl-state-history-preview`) · 꼬리 행 «양도일 현재 선언 기준 · 결과 계산 후 확정» · 13호 안내 박스(«660㎡ 이내까지…» `has13notice: true`) · **`nbl-other-ho-fail-notice` 없음** |
| R3 | C3 입력(마지막 = 신축) · 입력 화면 | `nbl-other-ho-fail-notice` = «건축물(시설물)이 있는 토지 — 나지(어느 용도로도 사용되고 있지 아니한 토지)가 아니므로 13호 불인정» **한 줄뿐** — 앞 나지 구간 처리 언급 없음 |
| R4 | C5(800㎡ · changed · 철거 행) | `housePriorHistoryIgnoredOf` = **false** · `nbl-other-partial-area-notice` **없음** · ⑧ null |

**결과 고지 실측(C1)**: `warnings`에 ① `NBL_VACANT_LOT_SELF_DECLARED_NOTICE` ② `NBL_STATE_HISTORY_APPLIED_NOTICE`(«호별 용도는 양도일 현재 값을 소유기간 전체에 적용했고…») ③ 재산세 구분 모름 고지가 모두 실린다 — ②가 13호에는 사실과 다르다.

### 1.4 사용자가 오해할 지점 (M-n)

| # | 지점 | 오해 | 근거 |
|---|---|---|---|
| M-1 | 13호 선택 + 이력 `changed` + 철거 후 나지 양도 | «13호를 골랐으니 소유기간 전체가 사업용» — 실제는 철거 후 구간만(C1) | §1.3 C1/D1 · 안내 박스에 이력 언급 없음 |
| M-2 | 13호 선택 + 마지막 사건 = 신축 | «이 호는 인정되지 않습니다» → **13호 전체가 무효**로 읽거나 «앞 나지 구간은 13호로 인정되겠지»로 읽는다 — 실제는 과거 구간에도 효과 없음(C3 — 엔진 Q-1 (가)가 이를 바꾼다) | 렌더 R3 |
| M-3 | 결과 표 꼬리 행 | «종합합산 · 사업용» 모순 — 어느 근거로 사업용인지 없음 | 렌더 R1 |
| M-4 | 적용 고지 | «호별 용도는 소유기간 전체에 적용» — 13호에는 틀림 | §1.3 결과 고지 |
| M-5 | 13호 + 660㎡ 초과 + 이력 | 이력을 입력했는데 반영이 안 되고 입력 화면은 말이 없다 | 렌더 R4 · C5 |
| M-6 | 13호 라디오 설명 «건축물이 있으면 불인정» | 양도일 현재인지 소유기간 중인지 모호 — 이력이 있는 사용자에게 특히 | `other-land-ho-meta.ts:300` |
| M-7 | **세대가 소유기간 중 주택을 소유한 적이 있는 사용자** | 13호를 고르면 소유기간 **전체가 무주택**으로 읽힌다 — 이를 말할 **입력 칸이 없다**(엔진 §2.2 «입력 칸이 없다») | 정독 + 엔진 §1.2(국세청 «주택을 소유하지 아니한 기간 동안은 사업용») |

### 1.5 현행의 한계 (이 계획의 제약)

- **한 카드 = 호 하나**(`nblOtherRelatedBusinessType` 단일 라디오). «과거 나지 구간은 13호 · 꼬리(건축물 있음)는 다른 호»를 한 카드에서 표현할 수 없다. 이를 풀려면 구간별 호 입력이라는 훨씬 큰 기능이 필요하다 — **이 계획은 열지 않는다**(§15). 엔진 Q-1 (가)가 승인돼도 «과거 나지 = 13호 · 꼬리 건물 = 다른 호 사업용 기준»은 **13호를 선택한 한 카드** 안에서만 계산된다.
- 13호의 «1필지·주택 신축 가능»은 **전부 자기 선언**이다(`NBL_VACANT_LOT_SELF_DECLARED_NOTICE`). 입력으로 판정되는 것은 «건축물 없음»·«660㎡»뿐이고 엔진 Q-2 (다)가 승인돼도 **«무주택» 소유 기간의 날짜 입력**이 새로 생길 뿐 나머지 요건 판정은 아니다.
- 법령 본문은 이 세션에 조회하지 않았다(엔진 계획서 §1이 KoreanLaw MCP로 확인한 본문을 인용). 날짜별 적용 범위는 **«확인 필요»**로 남겨 둔 채 UI 문구에 법적 단정을 쓰지 않는다.

---

## 2. 사용자 시나리오 — 무엇을 알고 무엇을 모르는가

| # | 시나리오 | 사용자가 아는 것 | 모르는 것 | 현행(§1.3) | 엔진 추천 모델 후(엔진 §6 오라클) |
|---|---|---|---|---|---|
| S1 | 나지로 계속 보유 → 양도 (이력 없음) | 건축물이 없었다 | — | 전 기간 사업용(N1) | 불변(엔진 H0) |
| S2 | 건축물이 있다가 **철거 후 나지로 양도** | 철거일 · 철거 전 재산세 구분(고지서) | 13호가 철거 후 구간만 덮는지 | C1 꼬리만(2,040일) | 불변(엔진 H1 — 건물 구간은 나지가 아니다) |
| S3 | 나지로 보유 → **신축 후 건축물 있는 채 양도** | 신축일 | 과거 나지 기간에 13호가 효과가 있는지 | C3 **효과 없음** | **과거 나지 구간 13호 인정**(엔진 H2·H3 — N → B 방향) |
| S4 | 나지 보유 중 **세대가 주택을 취득**(후에 처분 포함) | 세대의 주택 소유·처분일 | 13호가 그 기간을 제외하는지 | **입력할 곳이 없다**(13호 선택 = 전 기간 무주택) | **행 입력**(엔진 W1~W5) |
| S5 | 철거 후 나지 + **660㎡ 초과** | 땅 면적 | 이력이 무시되는 사실 | C5 무안내 | 불변 + 안내(C-4) |
| S6 | 이력 «모름» | — | — | C6 현행 + 모름 고지 | 불변 |

S3·S4는 엔진이 값을 바꾸는 시나리오라 **화면이 «왜 바뀌었는지»를 보이는 것**(C-2·C-3·결과 블록)이 UI의 몫이고, S4는 **입력 칸**이 UI의 몫이다.

---

## 3. 엔진 결정(Q-1~Q-4)별 UI 영향 — 사용자 결정 전 대비표

| 엔진 결정 | 새 입력 | UI 변경 | 비고 |
|---|---|---|---|
| **Q-1 (가) + Q-2 (다) + Q-3 (가) + Q-4 (가) — 엔진 추천** | **행 배열 + UI 전용 질문** | UI-C + UI-M(§4.2) 전부 | 이 문서의 기본 설계 |
| Q-1 (가) + Q-2 (가) 입력 없음 | 0 | **UI-C만**(C-1~C-5) | E3e-1만 — 엔진이 «E3e-1만 머지된 상태는 UI 비노출» 권고(§7.4: 주택 취득 후 양도 세대가 행 없이 과거 나지 전체를 사업용으로 세는 과소 방향) → UI도 E3e-2와 같은 릴리스 |
| Q-1 (나) 현행 유지 + 고지 | 0 | C-1·C-4·고지 정합(C-2는 «과거 구간에도 13호 적용 안 함» 문구) · 결과 표 접미(꼬리만) | Q-2~4와 독립 |
| Q-2 (나) 첫 주택 소유일 1칸 | 날짜 1칸 + 질문 | UI-M의 행 목록 대신 단일 `DateInput`(질문 3지선다 «소유한 적 없음 / 있음(날짜)» ) | 4팀-978(처분 후 복귀) 표현 불가 — 엔진 평가대로 |
| Q-3 (나) 이력 `changed`일 때만 | 같음 | 위젯 활성 조건에 «이력 `changed`»를 더함(이력 OFF 13호 사용자는 입력 불가 — 1094형이 막힘) | 엔진 평가대로 비추천 |
| Q-4 (나) 행 없음 = 불인정 | 같음 | **질문 필수 + ⑫도 요구**(⑧↔⑫ 같은 규칙 — 기존 13호 직접 API 일괄 400) | 엔진이 비추천(일괄 과세) |

UI 비용 순(엔진 결정이 갈릴 때): **Q-2 (가) < Q-2 (나) < Q-2 (다)**. UI는 엔진 추천(다)을 받는다 — 4팀-978형이 국세청 해석에 있고(엔진 §1.2), 단일 날짜는 이를 표현하지 못한다. Q-4 (가)에서 질문 필수는 «⑧만»이라 UI 통과 ↔ API 400 모순이 생기지 않는다.

---

## 4. 화면 스펙 ⑤

### 4.1 UI-C — E3e-1 뒤(새 입력 0)

활성화 조건은 기존 술어 + 엔진 술어의 합성이다(§5). 호 값 판별(`=== "vacant_lot_1household"`)만 입력 자체라 리터럴을 쓴다.

| # | 위치 | 활성화 | 내용 | 비고 |
|---|---|---|---|---|
| C-1 | `OtherLandHoSection` 13호 안내 박스(`:235-239`) **아래**, 새 `ToneCard tone="amber"` | 호 = 13호 ∧ `nblOtherStateEventsInUse`(이력 `changed`) ∧ 이력이 읽힘(C-4 술어 거짓) | **엔진 입력용 문구 상수**(R-4 — 엔진 `…APPLIED_NOTICE`는 결과 시제 «적용했고»라 입력 화면에 맞지 않는다): «13호는 소유기간 중 건축물이 없던 구간에 적용합니다. 건축물이 있던 구간은 나지가 아니라 제외합니다 — 확인 필요» 류(정본 엔진) | 안내 박스 기존 문구 **바이트 유지**(`/별도 면적 입력 불필요/` `getByText` — `nbl-other-land-section-render.test.tsx:46-52`가 중복 매치 시 throw). testid `nbl-other-ho13-scope-notice` |
| C-2 | `hoFail` ToneCard 안 두 번째 `<p>` | 호 = 13호 ∧ `hoFail` 있음(꼬리 건물) ∧ 이력 `changed` | 엔진 술어가 «과거 나지 구간 13호 적용»이면 «양도일 현재 건축물이 있어 마지막 구간은 13호로 인정되지 않지만 건축물이 없던 과거 구간에는 13호를 적용합니다»(엔진 T-3·§4.4 상수 재사용) · **660㎡ 초과**면 엔진 `…VACANT_LOT_AREA_NOTICE` | `hoFail.detail`(엔진 `failStep`) 바이트 불변 — 기존 `toContain("나지")` anchor 유지 |
| C-3 | 결과 표 구간 행 «재산세 구분» 칸 접미 | 구간 echo에 13호 일수가 있을 때(R-2 `vacantLotDays`) | «종합합산 · 13호 나지 인정 N일» — 라벨은 `OTHER_LAND_HO_META.vacant_lot_1household.option.label`을 재사용(새 문구표 금지) | echo 없으면 종전과 바이트 동일. **다른 호(11호 등) 행 일반화는 UQ-6** |
| C-4 | 이력 섹션 부분 면적 안내 자리(`OtherLandStateHistorySection.tsx:250-254`) | 13호 ∧ `changed` ∧ 부분 면적(엔진 `otherLandAreaIsPartial`) | 기존 `NBL_STATE_HISTORY_PARTIAL_AREA_NOTICE` 그대로 | **술어 확장**: `housePriorHistoryIgnoredOf`(`nbl-other-state-history-read.ts:30-37`)의 가드 «주택 철거 행이 있을 때만»에 «13호 선택»을 OR로 추가. ⑧ H9·H10이 이 확장 때문에 13호에서 켜지지 않게 anchor 1건(UQ-7) |
| C-5 | 13호 라디오 옵션 설명 | 항상 | «건축물이 있으면 불인정» → 이력·«양도일 현재» 한정어 — **엔진 메타 소관**(R-5) | `other-land-ho-meta.ts:300` |

### 4.2 UI-M — E3e-2 뒤(「세대 주택 소유 기간」 질문 + 행)

위치: `OtherLandHoSection` **13호 안내 박스 아래 · C-1 위**(호 선택 직후 — 요건 입력 = 계산 순서, 엔진 Q-3 (가)라 **이력 섹션 안이 아니다**). 활성화 = 호 = 13호 ∧ **엔진 술어 `vacantLotHousePeriodsRead`(R-1)** 참.

| 요소 | 컴포넌트 · 라벨 · hint | 저장·전송 |
|---|---|---|
| 질문 | `FieldCard` + `RadioCardGroup tone="violet"`(거주·자격) · 「이 토지를 소유한 기간 중 우리 세대가 주택을 소유한 적이 있습니까?」 · 선택지 **«없습니다 — 소유기간 내내 무주택» / «있습니다 — 소유한 기간을 입력»** · hint «주택을 소유하는 동안은 13호로 인정하지 않습니다(해석례 기준 — 확인 필요). 세대 구성이 달라진 경우는 판정하지 않고 입력한 기간 그대로 반영합니다.» | UI 전용 `nblOtherHouseholdHouseStatus: "" \| "none" \| "owned"`(저장·복원만 — **서버로 보내지 않는다**). `""` = 선택 안 됨(표시 fallback·가정값 없음) |
| 행(`owned`일 때) | `ToneCard tone="violet" sectionNum={i+1} title="주택 소유 기간"` + 삭제 · `FieldCard`「주택을 소유하게 된 날」`DateInput`(필수) · `FieldCard`「주택을 더 이상 소유하지 않게 된 날」`DateInput`(선택) hint «이 날부터 다시 무주택으로 봅니다. 아직 소유 중이면 비워 두세요 — 양도일까지 소유한 것으로 계산합니다.» · 행 요약 한 줄(표시 전용): «계산에 쓰는 소유 기간: 시작일 ~ 종료일 전날 / 양도일까지 계속 소유» | `nblOtherHouseholdHousePeriods: { startDate: string; endDate: string }[]`(`""` = 비움 → ④ 전송 시 키 생략). 「+ 주택 소유 기간 추가」 버튼은 이력 사건 추가 버튼(`OtherLandStateHistorySection.tsx` `addEvent`)과 같은 컴포넌트·같은 위치 규칙 |
| 미리보기 | 행 아래 한 줄: «13호로 인정되는 기간(예상): N일 / 소유기간 M일 — 최종 판정은 결과에서» | **엔진 leaf `vacantLotBusinessIntervals`를 직접 호출**(표시 전용 · 이력 OFF면 꼬리 나지 구간 전체 − 행). 행에 ⑧ 결함이 있으면 그리지 않는다(`buildStateHistoryPreview` 선례) |
| 활성 아님 | 13호 + 꼬리 건물 + 이력 OFF/`unchanged`/`unknown` → 위젯 **숨김**, `hoFail`만 표시(C-2의 «이력 입력 시 과거 나지 구간 적용» 안내는 `changed`일 때만) | ④는 `[]` 전송 · ⑧ 요구 없음 |
| `endDate` 비움 의미 | 화면 hint + 행 요약 + 엔진 D-7(반열린 «소유하지 않게 된 첫날») + ④ 키 생략 + ⑧ 허용 + ⑫ 허용 + 엔진 양도일 — **6곳이 같은 뜻** | 3중 패턴 — §6 표 |

**종료일 표기 주의**: 엔진 D-7은 `endDate` = «소유하지 않게 된 **첫날**»(사건 규약 — 새 상태 첫날)이다. 라벨은 «더 이상 소유하지 않게 된 날»로 두고 행 요약이 «종료일 전날까지 소유»라 풀어 말해 사용자가 «마지막으로 소유한 날»과 혼동하지 않게 한다. 경계일 해석(V-3)은 «확인 필요».

---

## 5. 적용 술어 단일 소스 — E3-②·③ 교훈의 직접 반영

| 술어 | 정의 | 호출처 |
|---|---|---|
| `nblOtherStateHistoryApplies(asset)` | **기존 그대로**(호와 무관) | 이력 섹션 · ④ · ⑧ |
| **(엔진에 요청 — R-1) `vacantLotHousePeriodsRead(inputs)`** | 순수 술어. 인자 = `{ relatedBusinessType, tailHasBuilding, historyChanged, historyDeemedBlocked, landArea }`. 참 = 13호 ∧ (¬tailHasBuilding ∨ (historyChanged ∧ ¬historyDeemedBlocked ∧ ¬`isAreaOver(landArea, 660)`)) — **엔진 core·leaf가 실제로 행을 읽는 조건과 같은 식**을 leaf가 낸다 | **④ 전송 · ⑤ 위젯 노출 · ⑧ HH-1·HH-2 요구**가 직접 호출(자체 조건 금지) |
| `housePriorHistoryIgnoredOf` | **가드 확장**(C-4): `nblOtherStateHistoryApplies ∧ (주택 철거 행 있음 ∨ 호 = 13호)` | ⑤ 안내 |
| `effectiveOtherHasBuildingOf(asset)` · `stateHistoryDeemedBlocksOf(asset)` | 기존 | 위 술어의 인자 공급 |

**교훈 점검**: 면적 판정은 core 전체를 돌리는 `otherAreaIsPartialOf`(렌더마다 엔진 core 실행 — UV-8)가 아니라 **순수 입력 술어**를 쓴다 — 읽는 조건이 `isAreaOver(landArea, 660)`·`tailHasBuilding`·이력 모드·의제로 닫히기 때문이다(엔진 §4.3). 단 «꼬리 나지 + 660 초과» 케이스는 core가 행을 읽고(기간 판정은 면적 안분 앞) leaf는 안 읽는다 — 술어는 `¬tailHasBuilding`에서 참이므로 일치한다. **⑧이 이 술어를 부르지 않으면** 꼬리 건물 + 660㎡ 초과에서 «화면에 칸이 없는데 요구하는» 영구 차단이 생긴다(§9 X6).
**순환 금지**: 술어는 asset 필드에서 인자를 읽을 뿐 ④ raw를 만들지 않는다(④ → 술어 → ④ 재귀 방지 — E3-③ `otherAreaIsPartialOf`는 raw를 만들어 이 문제가 없었지만 이 술어는 입력 술어라 raw 불필요).

---

## 6. 클라이언트 14지점 (①~⑧ + ⑨~⑭ 확인점) — 엔진 추천 모델(UI-M) 기준

UI-C는 ⑤⑦ + 술어 가드뿐이라 ①②③④⑫⑬⑭ 변경 0.

| 지점 | 변경 | 단계 | 근거 |
|---|---|---|---|
| ① 타입 | `AssetForm`에 `nblOtherHouseholdHouseStatus: "" \| "none" \| "owned"` · `nblOtherHouseholdHousePeriods: NblHouseholdHousePeriodInput[]`(`{ startDate: string; endDate: string }` — `calc-wizard-asset-nbl-other.ts` 이력 칸 옆 `:98-105`) | UI-M | 선례 `nblOtherStateEvents` |
| ② initial | `""` · `[]`(두 곳 — `calc-wizard-asset-factory.ts:378-380` · `calc-wizard-asset-nbl.ts:179-181` 선례, 호출마다 새 배열) | UI-M | 같음 |
| ③ normalize | `migrateNblStateHistory`(`calc-wizard-asset-migrate-nbl.ts:47-72`) 형제: 상태 열거 가드 · 행은 `{startDate,endDate}` 문자열만 보존(비객체·비문자열 제거, **잘못된 날짜 문자열은 지우지 않는다** — ⑧이 막아야 침묵 소실이 없다). **구 저장 13호 자산은 status `""` → ⑧이 막는다**(UQ-8 (가) — U1 이력 질문과 같은 방식, 가정값 채움 금지) | UI-M | 같음 |
| ④ API 변환 | `buildNonBusinessLandRaw`(`non-business-land-request.ts:159`) — **엔진 술어(R-1) 참 ∧ status = `owned`일 때만** `nblOtherHouseholdHousePeriods`를 싣는다(`endDate` `""`는 키 생략). 거짓이면 `[]`(⑫′ 행 결함 400 방지 — 숨은 stale 행). status 자체는 보내지 않는다 | UI-M | `stateHistoryWireFields` 선례 `nbl-other-state-history-scope.ts:146-157` |
| ⑤ UI | §4.1(UI-C) · §4.2(UI-M) | C·M | |
| ⑥ 사이드바 | 변경 없음 | — | §0 |
| ⑦ 결과 | §8 | C·M | |
| ⑧ validation | `validateNblOtherLand`의 `hoRequiredInputIssue` 직후(`transfer-tax-validate-nbl-other.ts:~77` — 화면 순서: 이력 → 호 → 행)에 규칙 **HH-1~HH-3**(§7) | UI-M | 같음 |
| ⑨⑩⑪ | 해당 없음(엔진 §5 — 엔진 enum 무변경 · ⑪ 행은 토지 취득 전 시작도 허용 — 클립) | — | |
| **⑫ Zod** | **`transfer-tax-schema-nbl.ts`에 `nblOtherHouseholdHousePeriods` 추가 필수**(빠지면 침묵 strip — 엔진 §5 · E3-③ §1.3 BP2 실측 방식) + ⑫′ `householdHousePeriodIssue` refine(엔진 소관) | 엔진 E3e-2 | 엔진 §5 |
| ⑬ | `nbl*` prefix-pick이 새 칸을 운반하는지 **body 도달 E2E**(Network 탭 request body) + `git grep -n "nblOtherHouseholdHousePeriods\|householdHousePeriods"`가 ①③④⑫⑭ + 엔진에서 모두 나오는지 | UI-M | |
| ⑭ | 엔진 소관(`buildOtherLand` 행 → `DateInterval[]`, 종료일 비면 양도일) · UI 미리보기도 같은 leaf | 엔진 | 엔진 §5 |

**3중 패턴 표 — 새 칸**

| 필드 | ⑤ 표시 | ④ 전송 | ⑧ | ⑫ | 엔진 |
|---|---|---|---|---|---|
| `nblOtherHouseholdHouseStatus` | 미선택 `""` = 선택 안 됨(가정값 없음) | **보내지 않는다**(UI 전용) | HH-1: 술어 참 ∧ `""` 차단 | 칸 없음 | — |
| `…HousePeriods[i].startDate` | 빈 `DateInput` | `owned` ∧ 술어 참일 때만 | HH-2·HH-3 | 행 스키마 + refine(같은 leaf) | 소유 첫날 |
| `…HousePeriods[i].endDate` | **빈칸 = «양도일까지 계속 소유»**(hint + 요약 줄이 의미를 보인다) | `""`면 키 생략 | 허용 | 허용(optional) | 양도일 |

⑧만 더 엄격한 허용된 비대칭: 질문 미응답(HH-1)·«있음 + 행 0건»(HH-2)은 ⑫가 거울을 두지 않는다 — 직접 API는 `[]` = 현행(Q-4 (가)). **UI 통과 ↔ API 400 모순 없음.**

---

## 7. ⑧ 검증 규칙과 ⑧ ↔ ⑫ parity 격자

게이트: 엔진 술어 `vacantLotHousePeriodsRead`(§5). 축 B 둘째 이후 지분 카드는 `ctx.skip`(`transfer-tax-validate-acquisition.ts:371`) — 행은 **첫 카드**에만 둔다(UV-3).

| # | 조건 | 가리키는 칸(점프 앵커) | ⑫ | 비고 |
|---|---|---|---|---|
| HH-1 | 술어 참 ∧ `nblOtherHouseholdHouseStatus === ""` | `nblOtherHouseholdHouseStatus` | 거울 없음 | 미입력 ≠ 미해당. 문구 «세대가 주택을 소유한 적이 있는지 선택하세요 — 소유한 기간은 13호로 인정하지 않습니다» 류 |
| HH-2 | 술어 참 ∧ `owned` ∧ 행 0건 | `nblOtherHouseholdHousePeriods` | 거울 없음 | «있습니다»를 골랐으면 기간 1건 이상 |
| HH-3 | 술어 참 ∧ `owned` ∧ 행 결함 | `nblOtherHouseholdHousePeriods.${i}.startDate` / `.endDate` | **같은 leaf `householdHousePeriodIssue`**(시작일 형식 · 종료일 > 시작일 · 양도일 이후 시작) | 문구·분류는 leaf가 정함 — 자체 비교 금지. 필드 키는 리터럴 접두(정적 게이트 `transfer-validation-field-anchor-coverage`가 `${…}`를 `*`로 정규화) |
| HH-0 | 술어 거짓(13호 아님 · 꼬리 건물 + 이력 OFF/`unchanged`/`unknown` · 660 초과 + 꼬리 건물 · 의제) | **요구하지 않는다** | — | 엔진이 안 읽는 칸 |

**parity 격자(구현 PR anchor 표)**: 호 {13호 · 다목 호 · 없음} × 꼬리 {나지 · 건물} × 이력 {`""` · `unchanged` · `unknown` · `changed`} × 면적 {≤660 · >660} × 의제 {없음 · 있음} × status {`""` · `none` · `owned`+정상 · `owned`+0건 · `owned`+결함} — 각 행의 ⑧ 결과 · ⑫ 상태(200/400) · 엔진이 행을 읽는가를 한 표로 동결하고 **⑧ 통과 ∧ ⑫ 400 = 0건** · **⑧ 차단 ∧ 엔진이 읽지 않음 = 0건**을 단언한다(선례 `nbl-state-history-e3-1-validate-parity.anchor.test.ts`).

---

## 8. 결과 카드 ⑦ · 사이드바 ⑥ · 고지

| 항목 | 내용 |
|---|---|
| 구간표(이력 ON) | C-3 행 접미(R-2 per-interval `vacantLotDays`). **표 열은 늘리지 않는다**(11호 일반화 UQ-6) |
| 13호 보조 블록(신규) | `NblStateHistoryPeriodTable` 아래 또는 이력 OFF일 때는 «기간 분석» 아래에 `NblVacantLotPeriodNote`(제안 — 새 컴포넌트 ≈60줄 · `ToneCard tone="sky"`): 엔진 echo `vacantLot { intervals, houseOwnedDays }` 그대로 — «13호(나지)로 인정한 기간 N일 · 세대 주택 소유로 제외한 기간 M일». **재계산 금지** |
| **이력 OFF + 행 입력 시 거짓 안내** | `periodEval.basis === "state_at_transfer"` 안내(`NonBusinessLandResultCard.tsx:253-257` «양도일 현재의 이용 상태를 소유기간 전체에 적용해 판정했습니다…»)는 행이 있으면 사실과 다르다 → 행이 있을 때 이 단락을 **엔진 echo가 있는 변형**으로 바꾼다. 엔진 계획서의 echo는 `state_history` 경로(`stateHistory.vacantLot`)에만 있어 **이력 OFF의 echo 위치가 없다**(R-3: `periodEvaluation.vacantLot`를 `PeriodEvaluation` 최상위로 — `types.ts:405-418`) |
| 판정 문구 | `NblStateHistoryPeriodTable.tsx:195-197`(«위 기준을 모두 충족해야 비사업용…») **변경 0** |
| 고지(엔진 소관) | A-6: `…VACANT_LOT_APPLIED_NOTICE`·`…AREA_NOTICE`·자기선언 보강 — 결과 「주의사항」에 이미 그려진다(구간표가 다시 그리지 않음). 기존 `APPLIED` 상수 바이트 불변 |
| 사이드바 ⑥ | 변경 없음 |
| 인쇄 | C-3 접미·보조 블록은 `print:`로 숨기지 않는다. 실제 PDF 텍스트는 E2E E6(UV-7) |

---

## 9. 교차 조합 케이스 전수 (각 행 = anchor 1건)

| # | 조합 | 기대(UI) | 근거 |
|---|---|---|---|
| X1 | 13호 + `changed` + 마지막 = 철거(꼬리 나지) | C-1 노출 · 위젯 노출(술어 참) · 결과 표 꼬리 행 접미 | §1.3 C1 |
| X2 | 13호 + `changed` + 마지막 = 신축(꼬리 건물) + ≤660 | `hoFail` + C-2(과거 나지 구간 적용 문구) · **위젯 노출**(leaf가 읽음) | 엔진 H2·H3 |
| X3 | 13호 + 꼬리 건물 + 이력 OFF/`unchanged`/`unknown`/`""` | `hoFail`만 · **위젯 숨김** · ⑧ 요구 없음 · ④ `[]` | 엔진 A-4 |
| X4 | 13호 + `changed` + **양도일 의제 사유** + 꼬리 나지 | 이력 미적용(`stateHistoryDeemedBlocks`) · **위젯은 노출**(core가 행을 읽음 — 엔진 §4.3) · C-1 미노출 | `nbl-other-state-history-scope.ts:68-70` |
| X5 | 13호 + `changed` + **660㎡ 초과** + 꼬리 나지 | C-4 안내 · 위젯 노출(core가 행을 읽음) · C-1 미노출 | C5·R4 · 엔진 A-9 |
| X6 | 13호 + `changed` + **660㎡ 초과** + **꼬리 건물** | C-2 «AREA» 고지 · **위젯 숨김 · ⑧ 요구 없음** — 요구하면 막다른 길 | 엔진 D-2 |
| X7 | 호 = 13호 → 다른 호 전환 | 위젯·C-1·C-2 사라짐 · 저장 행·status 유지(③) · ④ `[]` | 선례 events |
| X8 | 다른 호 → 13호 | 저장 status·행 복원 표시 | 같음 |
| X9 | status `none` → `owned` → `none` | 행 저장 유지 · `none`일 때 ④ `[]` · 행 UI 숨김 | 3중 |
| X10 | stale 결함 행(`owned` 상태에서 입력 중 → 호 전환) | ④가 `[]` → ⑫ 400 없음 | §0 위험 ② |
| X11 | 행 겹침 · 행이 토지 취득 전 시작 · 행이 양도일 이후 시작 | 겹침·클립은 엔진이 처리(⑧ 통과) · **양도일 이후 시작은 HH-3 차단** | 엔진 §5 ⑪ · A-2 |
| X12 | 연접 다필지 stale(`nblOtherUseParcels`) | 이력 섹션은 숨음. **호 라디오·13호 위젯은 현행대로 남는다**(HoSection은 이 조건과 무관) — 다필지 모드에서 13호 입력이 판정에 쓰이는지 **확인 필요**(UV-5) | `OtherLandDetailSection.tsx:245` |
| X13 | 지목 왕복 · 모드 stale(`changed → unchanged`) | 저장값 보존(③) · ④ 비움 | `nbl-state-history-wire.anchor.test.ts` |
| X14 | 이력 OFF + 13호 + 꼬리 나지 + 행 있음 | 위젯 노출 · 결과 «이력 OFF 변형 안내»(R-3) · A-4(`householdFreePeriods`) | 엔진 §4.3 · T-1 |
| X15 | 축 B 지분 번들 + 13호 | 질문·행은 **첫 카드**에만(`ctx.skip`) — 13호 660㎡가 지분 카드 면적인지 번들 면적인지 **확인 필요**(엔진 V-7 · UV-3) | `transfer-tax-validate-acquisition.ts:371` |
| X16 | 13호 + 9호 부득이 유예 | 합집합 가산(엔진) · UI 변경 0 | 엔진 X3 |
| X17 | 13호 + E3-1b 나대지 선언(`accepted`) 중복 | 일수 중복 제거(엔진 V-8) — 결과 표 접미는 «13호 N일»이 선언 구간과 겹쳐도 이중 가산하지 않는 echo를 읽는다 | 엔진 X2 |
| X18 | 13호 + 복합용도/수입금액비율 | 변경 0 — 확인 필요(UV-5) | `other-land.ts:486-490` |

---

## 10. 기존 테스트 반전 규모 — grep 실측 (vitest 미실행 · UV-1)

| 대상 | 참조(grep) | 반전 위험 |
|---|---|---|
| 엔진 anchor `nbl-state-history-e2.anchor.test.ts:139-147`(13호 «꼬리만» 214/3,651) | 엔진 §2.1: 철거 직전 «종합합산 + 건물 구간» 행 | **Q-1 (가)에서도 불변**(엔진 H1) — 반전 0 |
| 13호 값·testid | `__tests__` 9파일(`calc/nbl2611-b4-damok-ho.anchor` · `lib/calc/nbl-other-land-section-render`(`/별도 면적 입력 불필요/` 단일 매치) · `nbl-state-history-readers-render`(HoSection:60) · `nbl2611-b4-sports-gate.anchor`(H-2) · `nbl2611-d3-ho-options.anchor` · 엔진 `nbl-state-history-e2.anchor` · `nbl2611-b4-damok-ho.anchor` · `other-land-area-limit.test` · `other-land-ho-meta.test`) · **e2e 0건** | UI-C 반전 0 예상. **UI-M은 ⑧ HH-1(질문 필수)이 13호 fixture를 지나가는 곳이 후보**: `__tests__/calc/nbl2611-b4-damok-ho.anchor.test.ts:184`(VAC) — U1 선례(⑧ 필수화 시 12파일 83건 보정)상 **구현 PR이 전 범위 실측해야 한다**(`__tests__/lib`·`api` 포함) |
| 결과 표 `NblStateHistoryPeriodTable` | `__tests__` 7파일 · E2E 6 | C-3은 echo 있을 때만 접미라 echo 없는 기존 행 바이트 동일 |
| `NBL_STATE_HISTORY_APPLIED_NOTICE` | 소스 3 + `__tests__` 14파일 | **기존 상수 불변** → 반전 0 |
| `nbl-other-partial-area-notice`·`PARTIAL_AREA` | `__tests__` 5 + e2e 1 | C-4는 술어에 «13호» OR를 더하는 변경 — 기존 주택 철거 행 흐름 바이트 동일 anchor 필요(`nbl-house-prior-followups-render.test.tsx`) |
| 이력 OFF `state_at_transfer` 안내 단락 | `nbl-period-state-at-transfer-notice` 참조 테스트 — **미grep** | R-3 변형은 행이 있을 때만이라 기존 흐름 불변(확인 필요 — UV-1) |

---

## 11. 테스트·E2E·mutation 계획 (Do — 이 세션 미실행)

### 11.1 vitest

| 파일(제안) | 내용 | 단계 |
|---|---|---|
| `__tests__/lib/calc/nbl-state-history-e3-4-ho13-render.test.tsx` | X1~X3·X7~X10 — C-1·C-2·위젯 노출/숨김 표(호 × 꼬리 × 이력 모드 × 면적) · 기존 안내 박스 바이트 유지 · `getByText(/별도 면적 입력 불필요/)` 단일 매치 | C·M |
| `__tests__/components/nbl-state-history-e3-4-result-card.anchor.test.tsx` | 결과 표 접미(echo 있음/없음) · 이력 OFF 변형 안내(행 있음/없음) · 기존 echo 없는 표 바이트 동일 | C·M |
| `__tests__/lib/calc/nbl-state-history-e3-4-partial-scope.anchor.test.ts` | C-4: 13호 800㎡ + changed → 안내 노출 · 호 ≠ 13호면 기존과 동일 · **같은 입력의 ⑧ 규칙에 H9·H10 없음** | C |
| `…-e3-4-validate-parity.anchor.test.ts` | §7 격자(⑧ × ⑫ × 엔진 read) | M |
| `…-e3-4-wire.anchor.test.ts` | ④ 4분기(술어 거짓·`none`·`owned`·종료일 비움 키 생략) · ③ 복원 · 도달 가드(⑫ strip) | M |
| `__tests__/api/nbl-state-history-e3-4-route.anchor.test.ts` | 엔진이 만드는 표 헬퍼(`_helpers/nbl-state-history-e3-4-table.ts`)를 **같은 표로** 읽어 폼 → ⑧ → ④ → route → 세액·echo 동결(§1.3 시료 포함) | C·M |

### 11.2 E2E — `e2e/transfer-nbl-other-state-history-e3-4.spec.ts` (sessionStorage 시드 — 선례 `transfer-nbl-house-prior-demolished.spec.ts`)

| # | 시나리오 | 확인 |
|---|---|---|
| E1 | 13호 + 철거 후 나지(S2) | C-1 · 결과 꼬리 행 접미 · 고지 |
| E2 | 13호 + 신축으로 끝(S3 — 과거 나지 13호 인정) | C-2 · 결과 표 접미 · 세액 N → B |
| E3 | 13호 + 800㎡ + changed(S5) | C-4 안내 · 결과 고지 |
| E4 | 호 전환 | 위젯·안내 on/off |
| E5 | 행 입력(S4): 질문 → 행 추가 → ⑧ 차단 3종(HH-1·2·3) → 필드 점프 → Network 탭 request body에 행 도달 | `nblOtherHouseholdHousePeriods` 앵커 |
| E6 | 인쇄(PDF 텍스트에 접미·보조 블록 남음) | UV-7 |
| E7 | 이력 OFF + 행 → 결과 «이력 OFF 변형 안내» | R-3 |

### 11.3 mutation 계획 (제품 코드 1줄 → 대응 anchor 실패 → 원복)

| # | 대상 | 기대 실패 |
|---|---|---|
| UM-1 | C-1 활성 조건에서 `nblOtherStateEventsInUse` 제거 | X3 렌더 |
| UM-2 | C-4 술어 확장을 항상 참으로 | 호 ≠ 13호 대조 행 |
| UM-3 | C-4 확장이 ⑧ H9·H10 게이트에 번짐 | partial-scope anchor의 ⑧ |
| UM-4 | 결과 접미를 echo 없이 항상 출력 | echo 없는 기존 표 바이트 anchor |
| UM-5 | ⑫에서 `nblOtherHouseholdHousePeriods` 삭제(strip) | route·wire 도달 가드 |
| UM-6 | ⑧ 게이트에서 엔진 술어 제거 | X6 |
| UM-7 | ④가 술어 거짓인데 행을 보냄 | X10 |
| UM-8 | `endDate` `""`를 `""` 문자열로 전송(키 생략 해제) | wire anchor(⑫ 날짜 형식 400 가능) |
| UM-9 | 이력 OFF 변형 안내를 행 유무와 무관하게 출력 | 결과 카드 anchor E7 |

---

## 12. 사용자 결정 UQ-n

| UQ | 질문 | 선택지 | 추천 | 한 줄 근거 |
|---|---|---|---|---|
| **UQ-1** | 엔진 Q-1~Q-4 수용(엔진 계획서 §8.1 — 사용자 결정 대기) | (가) 엔진 추천 그대로(Q-1 (가) · Q-2 (다) · Q-3 (가) · Q-4 (가)) / (나) Q-2 (가) 입력 없음 / (다) Q-1 (나) 현행 유지 + 고지 | **(가)** | 입력 1(행)으로 국세청 6건 «기간별»을 표현하고 S3(13호 무효 입력)을 해소한다. UI 비용은 §3 — 위젯 1 + ⑧ 규칙 3 + 결과 블록 1. (나)는 E3e-1만 머지되는 과소 방향(주택 취득 후 양도 세대)을 UI가 막지 못한다 · **승인 — 사용자 결정 2026-11-24** |
| **UQ-2** | 행 질문의 선택지와 필수성 | (가) **2지선다(«없습니다»/«있습니다») 필수 — ⑧만**(엔진 Q-4 (가)) / (나) 3지선다 «모름»(엔진이 «모름 = 13호 불인정 + 확인 필요» 상태를 새로 정의해야 함 — R-6) / (다) 질문 없이 행 목록만(빈 목록 = 현행 자기선언) | **(가)** | 13호 선택이 이미 «무주택 1세대» 주장이고 «모름 = 혜택 불성립»은 13호를 고르지 않는 것으로 표현된다. (나)는 엔진 신규 상태가 필요해 UI가 단독으로 열 수 없다. (다)는 «미입력 ≠ 미해당»을 포기한다. **(가)는 엔진 Q-4 (가)의 «모름 = 혜택 불성립»과의 긴장을 알고 가는 결정**(엔진 §3.3) · **승인 — 사용자 결정 2026-11-24** |
| **UQ-3** | C-1·C-2 안내 문구 출처 | (가) 엔진 입력용 상수 신설(R-4) / (나) 결과 시제 상수 재사용(`…APPLIED_NOTICE` — «적용했고») / (다) UI가 인라인 문구 | **(가)** | (나)는 시제가 입력 화면과 어긋나고 (다)는 문구 이원화(법령 조어 금지·단일 소스). 엔진이 상수 1개를 더하면 끝 · **승인 — 사용자 결정 2026-11-24** |
| **UQ-4** | 위젯 위치 | (가) **13호 블록 안(호 선택 직후)** / (나) 이력 섹션 안 | **(가)** | 엔진 Q-3 (가)가 이력과 무관 — 이력 섹션은 호를 읽지 않는 컴포넌트이고 이력 OFF 사용자가 입력할 곳이 없어진다 · **승인 — 사용자 결정 2026-11-24** |
| **UQ-5** | 행 UI와 종료일 비움 표현 | (가) `ToneCard` 행 + 종료일 비움 + hint·행 요약 줄 / (나) «계속 소유 중» ToggleCard를 둬 종료일 숨김 | **(가)** | (나)는 토글 OFF + 빈 날짜 상태를 저장값만으로 구별 못해 UI 전용 상태가 하나 더 생긴다(3중 패턴 부담). 행 요약이 의미를 보이면 (가)로 충분 · **승인 — 사용자 결정 2026-11-24** |
| **UQ-6** | 결과 표 «사업용 근거» 표기 범위 | (가) **13호 행 접미만** / (나) 모든 다목 호 행 / (다) «사업용 근거» 열 신설 | **(가)** | 11호도 같은 구조(D1 실측: «종합합산 · 사업용»)지만 일반화는 결과 표 전 anchor·인쇄 폭 반전 — 관찰 기록만 · **승인 — 사용자 결정 2026-11-24** |
| **UQ-7** | 부분 면적(660㎡ 초과) 무시 안내(C-4) 범위 | (가) 현행 / (나) **13호 선택 시에만** / (다) 기타토지 `changed` 전 경우 | **(나)** | 13호는 한도가 660㎡ 고정이라 부분 경로가 가장 쉽게 열린다(C5: 800㎡). (다)는 모든 호의 DOM·테스트 반전이 넓다 · **승인 — 사용자 결정 2026-11-24** |
| **UQ-8** | 구 저장 세션(13호 선택 · 질문 미응답) | (가) **⑧이 막고 안내**(이력 질문 U1과 같은 방식) / (나) ③ migrate가 `none`을 채움 | **(가)** | (나)는 «무주택 선언»을 사용자 대신 채우는 침묵 가정 — 자동 fallback 금지 정책과 충돌 · **승인 — 사용자 결정 2026-11-24** |

---

## 13. 미검증 UV-n

| UV | 내용 | 확인 방법 | 영향 |
|---|---|---|---|
| UV-1 | 반전 규모(§10)는 grep 기준 — vitest 미실행 · HH-1이 13호 fixture를 지나가는 곳 전 범위(`__tests__/lib`·`api` 포함) 미실측 | Do 착수 시 해당 파일 실행 | 보정 건수 |
| UV-2 | `OtherLandHoSection.tsx` 800줄 정책 — 243줄 + UI-C ≈30 + UI-M은 **새 컴포넌트로 분리**(≈120줄) | `wc -l` | 분리 |
| UV-3 | 축 B 지분 번들 + 13호: 660㎡·«1필지»가 지분 카드 면적 기준인가 번들 기준인가(엔진 V-7) · 행을 첫 카드에만 두는 것이 판정 경로와 맞는가 | 엔진 계획서·route probe | X15 |
| UV-4 | 주택 소유 시작·종료 **경계일**(엔진 V-3) · 세대 구성 변동(엔진 V-6) | 엔진 계획서 — UI는 hint에 «확인 필요»만 | 문구 |
| UV-5 | 13호 + 연접 다필지 · 복합용도 · 수입금액비율의 UI 겹침 | 조합 렌더 probe | X12·X18 |
| UV-6 | 호 옵션 설명(`other-land-ho-meta.ts:300`) 변경 시 설명을 단언하는 테스트 — 이 세션 grep(`vacant_lot_1household`)에서는 못 찾음. `nbl2611-d3-ho-options.anchor.test.tsx`는 설명 단언 여부 정독 필요 | 정독 | R-5 |
| UV-7 | 인쇄(PDF)에 C-3 접미·보조 블록이 남는가 | E2E + 실제 PDF 텍스트 | E6 |
| UV-8 | C-4 술어 확장이 core를 돌리는 `otherAreaIsPartialOf`를 렌더마다 호출하는 비용 — 기존 `otherIgnored` memo(`OtherLandStateHistorySection.tsx:175`) 재사용 범위 | 렌더 프로파일 | 성능 |
| UV-9 | ⑥ 사이드바 NBL 참조 0건 — 이번 세션 재측정 안 함(E3-③ 실측 인용) | `git grep -n -i "nbl\|NonBusiness" lib/stores/calc-wizard-store.ts lib/stores/transfer-per-asset-summary-helpers.ts components/calc/shared/WizardSidebar.tsx` | ⑥ |
| UV-10 | 행이 많을 때 상한 — ⑫ `max`와 화면 «+ 추가» 상한이 같아야 한다(`asset-card-count-cap.ts` 선례 — 이 파일 없이 ⑫만 상한이면 계산 단계에서야 400). 엔진 §5에 상한 언급 없음 | 엔진에 R-7 | 행 UI |
| UV-11 | 새 `DateInput` 반복 행의 E2E 셀렉터·hydration(`e2e/CLAUDE.md`) · `SelectOnFocusProvider` 자동 적용 | Do 시 E2E | E5 |
| UV-12 | 렌더 probe는 시료 1개(600㎡ · 일반주거 · 수도권 아님)에서 측정 — 13호 한도·용도지역 변형은 미측정 | 구현 PR 격자 | §1.3 일반화 |

---

## 14. PR 분할·파일 크기 (Do — 엔진 선행 → UI 시퀀셜)

엔진 PR(E3e-0 테스트 → E3e-1 leaf·고지 → E3e-2 행 입력 ⑫⑭)이 먼저 머지된다. UI는 그 뒤:

1. **UI-C**(E3e-1 뒤 · 새 입력 0): C-1·C-2·C-3·C-4(·C-5 메타 반영) + 술어 가드 + 렌더·결과·부분 면적 anchor + E2E E1~E4·E6. 예상: `OtherLandHoSection.tsx` 243 → ≈275 · `nbl-other-state-history-read.ts` 47 → ≈55 · `NblStateHistoryPeriodTable.tsx` 203 → ≈215 · `OtherLandStateHistorySection.tsx` 조건 1줄. **엔진 §7.4: E3e-1만 머지된 상태는 사용자 노출 금지** — UI-C는 E3e-2와 **같은 릴리스**에 두거나 기능 플래그 없이 안내 문구만 먼저 내는 것이 안전한지는 UQ-1과 함께 결정(확인 필요).
2. **UI-M**(E3e-2 뒤): ①②③④⑧ + 위젯 신규 컴포넌트 `OtherLandHouseholdHousePeriods.tsx`(≈120줄 — HoSection에 직접 넣지 않는다) + 결과 보조 블록 `NblVacantLotPeriodNote.tsx`(≈60줄) + parity·wire·E5·E7.
3. 엔진이 Q-2 (가)/(나)를 택하면 UI-M은 §3 표대로 축소하고 PR은 UI-C 한 개(+선택 단일 날짜).

---

## 15. 재제안 금지·기결정 준수

- V5-G2 · Q-8 (가) · Q-3a (나) · 과세기준일 접기 · 자동 안분 fallback — 건드리지 않는다. **엔진 D-3: Q-15 (가′) 식 불변.**
- **«행 없음/미응답 = 무주택 가정» 금지**: ⑧이 질문 미응답을 막는다(엔진 Q-4 (가) 비대칭을 알고 감 — UQ-2). ④는 status 없이 행만 보낸다.
- **모름 = 혜택 불성립 + 확인 필요**(Q-6 계열) · 법 근거 없는 불리/유리 적용 금지(날짜 범위 «확인 필요»를 문구에 단정하지 않는다 — 엔진 D-6).
- 구간별 호 입력(한 카드에서 과거 구간 13호 + 꼬리 다른 호)은 열지 않는다(§1.5).
- `useEffect → store` 미러링 0 · native checkbox/radio/date 신규 0 · placeholder 숫자 예시 0(형식 설명은 `FieldCard hint`) · 안내는 `<ToneCard>` · 라벨 크기 정본 클래스 · 모달 런처 `<Button variant="modalLauncher">`.
- 기존 안내 박스 문구·`APPLIED` 고지 상수 **바이트 불변**.

---

## 16. 자가 검토 (plan-design-self-review-loop · 1회)

| # | 점검 | 결과 |
|---|---|---|
| 1 | file:line을 실제로 열었는가 | §1.1·1.2 인용을 grep/Read로 확인(`other-land-helpers.ts:63-67` · `apply.ts:84` · `HoSection:58-60,92-98,235-239` · `ho-requirements.ts:81-92` · `read.ts:30-37` · `scope.ts:37,68,146-157` · `validate-nbl-other.ts` 호 검증 위치 등). 오타 정정: 일수 2,921(2,920 아님) |
| 2 | 동작 주장이 probe인가 | §1.3 route 13종·렌더 4종. 엔진 §6 신규 열은 엔진의 오라클 인용(UI 재측정 안 함) |
| 3 | 엔진 결정을 UI가 지었는가 | 이름은 엔진 §5(⑫ 칸·leaf `householdHousePeriodIssue`·echo `vacantLot`)를 따랐고 새 이름은 «R-n 요청»으로만 올렸다 |
| 4 | ⑧이 엔진이 읽지 않는 칸을 요구하는가 | 술어 하나(R-1)로 ④⑤⑧ 게이트 — E3-②·③ 교훈 |
| 5 | 3중 패턴 | `endDate` 빈칸 = 양도일까지(6곳 같은 뜻) · status 미선택 = 가정값 없음 — §6 표 |
| 6 | 기존 anchor 반전 | UI-C 0 · UI-M은 HH-1 fixture 후보 1파일 + 전 범위 실측 필요(UV-1) |
| 7 | 정직한 한계 | 엔진 Q 미결 · 이력 OFF echo 위치 없음(R-3) · 렌더 시료 1개 · vitest 전체 미실행 · 법령 본문 미조회(엔진 §1 인용) |

---

## 17. 엔진 계획서 정합 기록 (v1 · 2026-11-24)

엔진 계획서(`…e3-4-ho13-bare-land.engine.plan.md`, 383줄)를 읽고 맞춘 점과 **어긋나거나 요청하는 점**.

**맞춘 점**: ⑫ 칸 `nblOtherHouseholdHousePeriods`(엔진 §5) · 행 모양 `{startDate, endDate?}` · D-7 날짜 규약(`endDate` = 소유하지 않게 된 첫날 — 반열린, 비우면 양도일) · leaf `householdHousePeriodIssue`(§5 ⑫′ — ⑧ HH-3가 직접 호출) · Q-4 (가) 「⑧만 질문 응답 요구」 비대칭 · A-4 `householdFreePeriods` 별도 필드(T-1) · 기존 상수 바이트 불변 · 13호 «H1 불변»으로 `nbl-state-history-e2.anchor.test.ts:139-147` 반전 0 · 엔진 §7.4 «E3e-1만 머지된 상태는 UI 비노출».

**어긋나는 점 / 엔진에 요청(R-n)**:

| # | 내용 | 이유 | 영향 |
|---|---|---|---|
| R-1 | **행을 읽는 조건의 순수 술어 leaf**(`vacantLotHousePeriodsRead` — §5 인자·식) 신설 | 엔진 §4.3은 core(꼬리 나지)와 leaf(이력 `changed` · ≤660 · 의제 아님)가 읽는 조건을 분산 서술하지만 **UI가 ④⑤⑧ 게이트로 쓸 단일 술어가 없다**. 없으면 UI가 자체 조건을 지어야 하고 E3-②의 «⑧ 의제 결함»이 재발한다 | 필수 — UI-M 착수 조건 |
| R-2 | 결과 구간 echo에 **구간별 `vacantLotDays?: number`**(없으면 키 부재) | C-3 접미를 UI가 구간 ∩ 13호 구간을 재계산하지 않고 읽도록 — 엔진 §4.5는 구간 전체 목록(`vacantLot.intervals`)만 준다 | 권장 |
| R-3 | **이력 OFF + 행**의 echo 위치(`periodEvaluation.vacantLot` — 최상위) | 엔진 §4.5 echo는 `stateHistory` 안(이력 `state_history` 경로)뿐 — Q-3 (가)로 이력 OFF에서도 행을 읽으니 `state_at_transfer` 결과 안내(«전체에 적용»)가 거짓이 된다(§8) | 필수 — UI-M 착수 조건 |
| R-4 | **입력 화면용 문구 상수**(C-1·C-2) — 결과 시제(«적용했고»)와 분리 | UQ-3 | 권장 |
| R-5 | 호 메타 13호 설명(`other-land-ho-meta.ts:300`)의 «양도일 현재» 한정어 | M-6 | 권장 |
| R-6 | (UQ-2 (나) 선택 시에만) 「모름」 상태의 엔진 의미 정의 | 엔진 Q-4가 «행 없음 = 무주택 선언»뿐 | 조건부 |
| R-7 | `nblOtherHouseholdHousePeriods` **배열 상한**(⑫ `max`)을 `asset-card-count-cap.ts` 같은 단일 소스로 | UV-10 — 화면 «+ 추가»와 ⑫ 상한 불일치 방지 | 권장 |
| R-8 | 엔진 §6.1 신규 열(오라클)을 구현 PR이 `_helpers/nbl-state-history-e3-4-table.ts`로 만들 때 **§1.3 시료(N0~D2)를 포함** | UI route anchor가 같은 표를 읽도록 | 권장 |

**엔진 계획서의 서술 중 UI 측이 확인한 사실**: 엔진 §2.1 «M1 13호 가드는 e2 anchor 1건만 지킨다»(현행 안전망 얇음)는 UI 쪽 §10 grep과 일치(13호 값 직접 단언 테스트는 e2 anchor 1건 + HoSection 렌더 2건뿐). 엔진 §2.2 S3(214 · 13호 무효)·S4(0)는 UI §1.3 C3(0/3,651 · 253,960,000, 13호 없음과 동일)와 같은 방향이다(시료는 다름 — 엔진 S3은 신축 2023-06-01 · 별도합산 꼬리, UI C3은 신축 2022-01-01 · 종합합산 꼬리).

---

## 부록. 요약 — 엔진 계획서와 어긋나는 점

없음(결정 충돌 0). **엔진에 새로 요청하는 것 = R-1·R-3(필수) · R-2·R-4·R-5·R-7·R-8(권장) · R-6(조건부).**
