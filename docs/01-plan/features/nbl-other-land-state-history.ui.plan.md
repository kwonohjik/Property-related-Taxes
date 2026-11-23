# 기타토지 소유기간 중 상태 이력 입력 모델 — UI(클라이언트 ①~⑧) 측 계획

> 🔴 **개정 2026-11-22 (v3)**: 사용자가 **V-1을 일 단위로 재결정**했다(통합 계획서 머리말 «v3 우선 규칙»). 이 문서의 v2 «과세기준일 접기» 서술(`foldStateToTaxBaseYears`·과세연도 버킷/표·6.1. 경계·Q-14)은 폐기이며, 법령·해석례 조사 기록과 V-2 결론만 근거 자료로 남는다. 판정·기대값은 일 단위 구간 기준(v1 모델 · §6 «일 단위» 열).
> **Feature ID**: `nbl-other-land-state-history` (UI 측) · 짝 문서: `nbl-other-land-state-history.engine.plan.md`(엔진·API 측 — 이 문서는 건드리지 않는다)
> **작성일**: 2026-11-22 · **base**: origin/master `10e86a809` → **자가 검토 base `0972e2618`**(file:line 재실측 — §18) · **상태**: 계획 + **U0·U1 구현됨(2026-11-23 · 브랜치 `feat/nbl-state-history-u1` · 구현 기록 §19)** — **U2(⑦ 결과 카드) 구현됨(2026-11-23 · §20)** · **U3(E2E 10건·인쇄 UV-8·소유일수 0 카드 수정·`ui-engine-sync-checker`) 구현됨(2026-11-23 · §21)** · mutation probe 3건은 §18.3
> **근거 결정**: 리뷰 `docs/reviews/nbl-other-categories-review-2026-11.md` §1.4 V2-C2 · §6 Q-4 (다) · §12.4 항목 2 — 「별도 계획서로 상태 이력 입력 모델을 계획한다」(Q-4 (나)는 D1 #3495로 이미 완료)
> **번호 규칙**: 이 문서의 사용자 결정은 `UQ-n`, 미검증은 `UV-n`(엔진 계획서의 Q/V 번호와 충돌 방지 — 합칠 때 재번호).
> **검증 표기**: 「확인」= 이 세션에서 파일을 읽어 file:line을 대조한 사실. 「확인 필요」= 읽지 않았거나 실측·법령 조회가 남은 것. 새 시나리오의 세액 숫자는 쓰지 않는다(엔진 Pre-Do anchor가 확정) — ±55,750,000은 리뷰 실측 인용이다.
> **개정 이력**: v2(2026-11-22) = UQ-1~UQ-9 전부 추천안 승인(§14 «결정» 열 · 통합 Q 번호 대응) + V-1 = 과세기준일 단위 → **v3에서 V-1이 일 단위로 재결정되어 v2의 과세연도 표·접기·6.1. 경계 서술은 본문에서 제거**했다(조사 기록만 §17에 «근거 자료»로 남김). **자가 검토(2026-11-22, §18)** 가 v1·v2 잔존 오류와 통합 §1 결정(`propertyTaxTypeBefore`) 누락을 정정했다 — 통합 계획서 `nbl-other-land-state-history.plan.md`가 정본이다.

---

## 0. 한눈에

| 항목 | 내용 |
|---|---|
| 문제 | 기타토지 판정이 「양도일 현재 상태」를 소유기간 전체에 적용한다. 건물 철거 뒤 나대지로 양도 = +55,750,000 과대, 신축 직후 양도 = −55,750,000 과소(리뷰 실측). 지금은 고지(`NBL_STATE_AT_TRANSFER_APPLIED_NOTICE`)와 DM-01(당해 사업개시일)만 있다 |
| 추천 UI 안 | **(C) 사건 목록 + 자동 생성 구간 미리보기**. 입력은 「질문 1개(3지선다) + 사건 행(종류·날짜)」이고, 화면은 사건에서 파생한 구간표(구간·일수·건축물 유무)를 읽기전용으로 보여 검산을 돕는다 |
| v1 범위 | **건축물의 신축·멸실 이력만**(기타토지 · 정밀판정 ON · 무조건 사업용 의제 불성립). 업종 개시·폐업 구간, 호별 용도 변화, 증축은 v1 밖(양도일 현재 값 전 기간 적용 + 고지 유지) |
| 이력 미입력 | 3지선다를 **필수**로 한다 — 「바뀐 적 없음 / 바뀐 적 있음 / 모름」. 미선택은 ⑧이 막는다(미입력 ≠ 미해당). 「모름」은 현행(양도일 현재 상태 전 기간) + 확인 필요 고지 |
| 축 B | 상태 이력은 **땅 사실** — 첫 카드 값을 상속하고 지분별 소유기간으로 엔진이 자른다(UQ-5) |
| 철거 전 구간의 재산세 구분 | 통합 Q-3 (가) — **철거 사건 행에 `propertyTaxTypeBefore` 선택 칸**(비과세·면제 / 분리과세 / 별도합산 / 종합합산 / **모름 = 미선택 → 종합합산 + 확인 필요**). 이 칸이 없으면 철거 사례(S1)의 과대가 풀리지 않는다(엔진 §3.4). §5.2·§5.3-2·§6·§8·§7이 이 칸을 갖는다 |
| 사용자 결정 | UQ-1 ~ UQ-10(§14) — **2026-11-22 전부 추천안 승인**. **V-1 = 일 단위**(v3 — 과세기준일 접기·Q-14 폐기 · §17) |
| 엔진 측에 요구 | §13 — 입력 형태(`events` 배열 + 모드 + `propertyTaxTypeBefore`) · 공용 leaf(파생 구간·⑧⑫ 공용 issue) · 결과 echo(구간별 일수·3기준 수치) |

---

## 1. 현행 사실 (확인)

1. **판정 구조**: `judgeOtherLand`(`lib/tax-engine/non-business-land/other-land.ts:82`)는 `judgeOtherLandCore` 결과에 «빈 사업기간 + 유예»만 얹는다. 사업용 분기는 `fullPeriod = [{ start: ownershipStart, end: pjDate }]`(`:162`)를 기간기준에 넘겨 기간기준이 공허하게 충족된다. 호출 7곳(`:300·319·368·403·459·526(호별은 hoReq.businessPeriods ?? fullPeriod)·696`).
2. **고지 3벌**: 엔진 `warnings`에 `NBL_STATE_AT_TRANSFER_APPLIED_NOTICE`(`other-land.ts:98`, 문구 `lib/tax-engine/nbl-confirm-notices.ts:27-33`) · 결과 카드 `components/calc/NonBusinessLandResultCard.tsx:254-263`(`state_at_transfer` 분기, testid `nbl-period-state-at-transfer-notice`) · 입력 화면에는 이 고지가 **없다**(기타토지 섹션은 안내를 싣지 않는다 — 확인: `OtherLandDetailSection.tsx` 전체 대조).
3. **echo 타입**: `PeriodEvaluationBasis = "usage_periods" | "state_at_transfer" | "not_judged"`(`types.ts:495`). 카드는 `resolvePeriodEvaluation(judgment)`(`period-evaluation.ts:13-20`)로 분기하고 echo가 없는 이력 복원 결과는 단계 id(`other_*`)로 `state_at_transfer`로 접는다 — **새 basis를 추가해도 구 결과는 현행대로 표시**된다.
4. **「구간 행」 선례 5종**(재사용 후보): ① 유예 행 `nblGracePeriods` — 행 UI `GracePeriodSection.tsx:49-237`, 타입 `NblGracePeriodInput`(`calc-wizard-asset-nbl.ts:66-93`), 검증 helper `grace-row-issue.ts`(⑧ `transfer-tax-validate-nbl.ts:353-359` · ⑫ `transfer-tax-schema-nbl-refines.ts:112-116` 공용) ② 자경·축산·별장 사용기간·거주 이력 — 공용 입력 `nbl/shared/BusinessUsePeriodsInput.tsx`, 공용 issue `period-row-issue.ts`(`periodRowIssue`·`periodRowIssueField`·`periodRowIssueMessage`, ⑧ `:316-342` · ⑫ `:95-110`) ③ 별장 「사용 없음」 명시 확인 `nblVillaNoUseConfirmed`(⑧ Q-12 (a)). **기간 행 검증은 이미 «빈 칸·해석 불가·역순·같은 날» 4종이 공용 leaf**이고, 새 이력은 «사건 행» 형태라 그 leaf를 그대로 쓸 수 없다(사건은 날짜 1개) — 날짜 1개용 sibling leaf가 필요하다(§8).
5. **건축물 유무 소비처(직접 읽기) 11곳** *(초판 «9곳»은 합산 오류 — `git grep -n nblOtherHasBuilding -- app components lib` 실측 정정)*: ⑤ 6곳 — `components/calc/transfer/nbl/OtherLandDetailSection.tsx:144·176·223` · `OtherLandHoSection.tsx:60` · `OtherLandPropertyTaxBasisField.tsx:34·72` / ⑧ 2곳 — `lib/calc/transfer-tax-validate-nbl-other.ts:41·60` / ⑫ 1곳 — `lib/api/transfer-tax-schema-nbl-refines.ts:191`(`:67`은 입력 타입 선언) / ④ 서버 매퍼 2곳 — `lib/tax-engine/non-business-land/form-mapper-helpers.ts:305·326`(`buildOtherLand`). 쓰기는 `OtherLandDetailSection.tsx:145` 1곳이다. 이력 모드(`changed`)에서 이 값은 **«양도일 현재(= 마지막 구간) 상태»** 이므로 11곳 전부가 같은 파생 helper를 읽어야 한다(§6.1 3중 패턴 표). 구간 전체(«건축물이 있던 구간이 있는가»)로 읽는 곳은 없다 — §5.3-5.
6. **재산세 분류 «근거»**: `property-tax-basis.ts`의 `propertyTaxBasisOptions(declared, hasBuilding)`은 건축물이 **없을 때만** 별도합산의 근거(공지상태·철거ㆍ멸실)를 묻는다. 철거 근거는 이미 «종전 바닥면적»(`nblOtherDemolishedFloorArea`)을 받는다. 즉 **철거 사실의 현재-상태 판 모델이 이미 있고, 빠진 것은 시간축뿐**이다.
7. **④ 운반 규약**: `buildNonBusinessLandRaw`(`lib/calc/non-business-land-request.ts:139`)는 `nbl` 접두 필드를 prefix-pick으로 전부 싣는다(`:153-156` `nblFields`) → **새 필드를 `nbl*`로 짓기만 하면 ④·⑬은 자동 운반**. 반면 ⑫ Zod(`lib/api/transfer-tax-schema-nbl.ts` — 공장 블록 주석 `:208-211`이 «누락 시 조용히 strip»을 명시)는 필드를 추가하지 않으면 **침묵 strip**이다. **중첩 행 객체도 같다** — 사건 행 스키마에 `propertyTaxTypeBefore`를 넣지 않으면 그 칸만 조용히 떨어진다(`nblGracePeriodRawSchema` 선례 — `:276`). 파생값 덮어쓰기 선례: `nblOwnershipRatio`(`:182`, `nblFields` 스프레드 뒤에 둔다).
8. **지목별 소비표 선례**: `lib/tax-engine/non-business-land/land-category.ts:111-120` `INPUT_CONSUMPTION … satisfies Record<LandCategoryGroup, InputConsumption>`(유예·도시편입일·의제·수도권 — 표 자체는 비공개 `const`이고 공개 술어는 `consumes*(landType)` 함수다). ④(`:159-163` `consumes`)·⑤·⑧·⑫(`transfer-tax-schema-nbl-refines.ts:124` `consumesPeriodJudgmentDate`)·⑭(`form-mapper.ts:150-176`)가 같은 술어를 읽는다 — 새 열은 **`InputConsumption` 인터페이스(`:104-109`)와 표 8행 둘 다** 고쳐야 하고, 컴파일러가 누락 그룹을 막는다.
9. **축 B**: `buildFractionalShareNblRecord(share, primary)`(`non-business-land-request.ts:235-252`)는 `{...primary, 지분 취득 사실}`로 레코드를 만든다 — **primary의 모든 `nbl*`(새 이력 포함)가 지분 카드로 상속**된다. 지분 카드는 NBL 입력 화면을 그리지 않는다(`AssetSectionExtras.tsx:72-74`는 `assetIndex === 0 || asset.nblUseDetailedJudgment`일 때만 컨테이너를 그린다 — 지분 카드의 정밀판정 토글·`nblUseDetailedJudgment` 경로는 UV-5와 함께 확인 필요). ⑧은 지분 때문에 첫 카드에 요구하는 선례가 있다(`transfer-tax-validate.ts:477-495`, `assetIndex: 0`). **실측(UV-5 해소 — 2026-11-22)**: `isFullFractionalBundle`(`lib/calc/transfer-tax-api-asset-basics.ts:165`)은 `assets.length > 1`과 «전원 분자<분모» 두 조건뿐이고 **카드 순서·취득일 정렬을 보지 않는다** → 첫 카드가 가장 이른 지분이라는 보장이 없다(§8.3 ⑧ 하한 규칙).
10. **노출 경로**: 단건·주 자산 = Step4(UI 인덱스 1) `SpecialSituationSection.tsx:139-146`이 `NblSectionContainer` 마운트(`primary.isNonBusinessLand && primary.nblUseDetailedJudgment`) · 함께 양도 토지 카드 = Step1 `AssetSectionExtras.tsx:72-74`. 기타토지 섹션은 `NblSectionContainer.tsx`가 `nblLandType === "other_land"`일 때 `OtherLandDetailSection`을 그린다(§4 지목별 세부 블록).
11. **사이드바(⑥)**: `lib/stores/transfer-per-asset-summary*.ts` · `calc-wizard-store.ts` · `WizardSidebar.tsx` · `TransferTaxCalculator.tsx`에서 `nbl*`·`isNonBusinessLand` 참조 0건(grep 확인) → **변경 없음**. 자산 카드 요약(`asset-section-summary.ts:149-161`)은 라벨만 쓴다.

---

## 2. 사용자 시나리오와 화면 흐름

### 2.1 시나리오 (v1이 푸는 것 S1·S2·S5 / 안내만 하는 것 S3·S4)

| # | 사실 | 현행 | 이력 입력 후 | v1 |
|---|---|---|---|---|
| S1 | 건물이 있는 토지를 취득 → 도중에 철거 → 나대지로 양도 | 양도일 상태(나대지)를 전 기간에 적용 → 비사업용(+55,750,000 과대, 리뷰 실측) | 사건 1행: 「건축물 멸실·철거·붕괴」 날짜 + **«철거 직전 그 토지의 재산세 구분»**(건물 있던 구간 — 이 선언이 없으면 종합합산·비사업용으로 남는다). 철거 후 구간(= 마지막 구간)은 현행 재산세 분류·근거 칸 | **포함** |
| S2 | 나대지 취득 → 건물 신축 직후 양도 | 양도일 상태(건물 있음)를 전 기간에 적용 → 사업용(−55,750,000 과소) | 사건 1행: 「건축물 신축」 날짜. 신축 전 구간은 나대지 규칙 | **포함** |
| S3 | 나대지 취득 → 신축 → 철거 → 재신축 | (S1·S2 합성) | 사건 3행. 첫 사건 종류가 취득 당시 상태를 정한다 | **포함**(사건 행을 늘릴 뿐) |
| S4 | 중간에 주차장 운영(수입금액비율 업종) 후 폐업, 나대지로 양도 | 양도일 상태 + DM-01(당해 사업개시일)만 | 업종 구간별 수입금액비율은 **과세기간별 수입금액**이 필요(현 칸은 당해·직전 2개 연도뿐) | **v1 밖** — 고지 유지(UQ-3) |
| S5 | 착공 후 신축 중(착공~준공 사이) 양도 | 양도일 상태 | 착공~준공 기간은 이미 «부득이한 사유 5호(건설 착공)» 유예 행으로 입력한다 — 이력과 겹치지 않게 안내 문구만 추가 | **안내**(UQ-8) |
| S6 | 축 B 지분 — 지분 취득일이 철거일보다 뒤 | 양도일 상태 | 상태 이력은 땅 사실(첫 카드) · 그 지분의 소유기간으로 엔진이 자른다 → 그 지분은 «철거 후 구간»만 | **포함**(UQ-5) |

### 2.2 화면 흐름과 노출 조건

```
Step1 자산 카드(토지) ─ 「비사업용 토지 여부 검토」 토글 ON ─ (Step4) 「판정 도움 필요」 라디오
  └ NblSectionContainer ─ 지목 = 「기타토지(나대지·잡종지)」
       └ OtherLandDetailSection
            ★ [신] ① 소유기간 중 건축물 유무 이력   ← 맨 위(아래 모든 건축물 관련 칸을 지배하는 모드 선택은 영향받는 칸 직전)
              [현] 건축물 있음 토글 / 재산세 과세 분류 / 근거 / 시가표준액·바닥면적 / 호별 / 연접 / 공장 / 복합용도 / 수입금액비율
```

**노출 술어 `nblOtherStateHistoryApplies(asset)`** (⑤ 렌더 · **④ 전송** · ⑧ 검증이 같은 술어 — 지목 축의 단일 소스는 `INPUT_CONSUMPTION.other_land.stateHistory = true`(`consumesStateHistory(landType)` — §6 ④·R7). ⑫는 `AssetForm`을 못 받으므로 같은 세 조건(지목 `consumesStateHistory` · 정밀판정 · 연접 다필지 꺼짐)을 `raw` 필드로 다시 쓴다 — 의제 성립은 ⑫가 이미 앞에서 `return`한다(`transfer-tax-schema-nbl-refines.ts:87-88`)):

- `asset.nblLandType === "other_land"` (소비표) **그리고** `asset.nblUseDetailedJudgment` **그리고** 무조건 사업용 의제 불성립(`NblSectionContainer`가 의제 성립 시 지목 블록을 `inert`로 막는다 — ⑧도 `nblExempt`이면 건너뛴다, `transfer-tax-validate-nbl.ts` 위치 규칙 L2 주석과 같은 자리) **그리고** `!asset.nblOtherUseParcels`(v1: 연접 다필지와 배타 — 필지별 `hasBuilding`이 이미 있다, UQ-9).
- 함께 양도 토지 카드는 자기 카드의 NBL 섹션에 같은 질문이 뜬다(비지분). 축 B 지분 카드는 질문이 없다(첫 카드 상속).
- **④는 이 술어가 거짓이면 `nblOtherStateHistoryMode: ""`·`nblOtherStateEvents: []`로 비워 보낸다**(`consumes.stateHistory` 한 열만으로는 부족하다 — 연접 다필지로 질문이 숨은 뒤에도 store에 남은 `changed`·잘못된 사건 행이 그대로 전송되면, ⑧은 건너뛰는데 ⑫ refine이 400으로 막는 **화면에 없는 칸 막다른 길**이 된다. ⑫ 필지 스키마 주석 `transfer-tax-schema-nbl.ts:30` «off 상태 stale 항목 거부 방지»와 같은 사고).
- **양도일 의제(§168의14②) 사유가 선택된 경우**(`consumesPeriodJudgmentDate(other_land) = true`): 질문은 그대로 보이고 ⑧ 규칙도 그대로다. 다만 통합 Q-9 (가)에 따라 엔진은 이력을 적용하지 않고 고지만 더한다 → 섹션 맨 위 안내 1줄(§5.3-6)과 미리보기 대체 문구(§5.3-3)를 둔다.
- 주택부수토지·건물(비주택) 부수토지·별장 부수토지·상가·일반건물은 v1에서 **노출하지 않는다** — 소비표 `stateHistory`가 `other_land`만 true다.

---

## 3. 입력 UI 안 비교 — (A) 구간 배열 · (B) 사건 목록 · (C) 혼합

> 공통 전제: 엔진이 기간기준에 넘기는 것은 «사업용 구간 목록»이다. **마지막 구간(양도일 현재 상태)은 현행 입력 칸(재산세 분류·근거·시가표준액·바닥면적·배율)이 그대로 정한다.** 그 앞 구간의 사업용 여부는 «건축물 있음 ∧ 재산세 구분 ∈ {비과세·면제, 분리과세, 별도합산}»이고 **건축물 있던 구간의 재산세 구분은 현행 칸에서 알 수 없다** — 초판(v1)은 «현행 칸 재사용»으로 충분하다고 했으나 **불완전했다**: 양도일 선언(나대지 = 종합합산)을 철거 전 구간에 쓰면 비사업용으로 남아 철거 사례의 과대(+55,750,000)가 풀리지 않고, 별도합산 자동 간주는 선언 없는 유리 적용이다(엔진 §3.4 · 통합 Q-3 (가)). ⇒ **철거 사건 행에 `propertyTaxTypeBefore` 1칸을 받는다**(§5.2·§5.3-2). 신축 전 나대지 구간은 종합합산으로 고정한다(엔진 V-6 — 별도 칸 없음).

### 3.1 (A) 상태 구간 배열 — 시작·종료·상태

```
┌ 소유기간 중 건축물 유무 ─────────────────────────────────┐
│ 구간 1  [2010-03-02] ~ [2021-05-10]   ( • 건축물 있음  ○ 없음 )  [삭제]
│ 구간 2  [2021-05-10] ~ [2024-06-01]   ( ○ 건축물 있음  • 없음 )  [삭제]
│ [+ 구간 추가]     ※ 첫 구간 시작=취득일 · 끝 구간 종료=양도일 · 빈틈·겹침 없이 이어야 합니다
└──────────────────────────────────────────────────────────┘
```
- 입력 부담: S1 기준 날짜 4칸 + 라디오 2칸. **취득일·양도일을 다시 입력**해야 한다(이미 Step1·Step4에 있는 값의 중복 입력).
- 오입력 위험: 하루 어긋남(2021-05-10 끝 / 2021-05-11 시작 → 빈틈), 겹침, 첫·끝이 취득·양도일과 불일치, 인접 구간이 같은 상태, 취득일·양도일을 고친 뒤 구간이 따라가지 않음.
- 검증 메시지 종류 ≈ 8(빈 칸·해석 불가·역순·같은 날·빈틈·겹침·소유기간 밖·커버 부족). 취득일/양도일 수정 시 연쇄 오류.
- 장점: 모델이 직관적(구간=상태), 구간별 상세 칸(업종·유예)을 붙이기 쉽다.
- 단점: 위 입력 부담 · 중복 입력 · 연쇄 오류. 축 B 지분 카드는 소유기간이 달라 «첫 구간 시작=취득일» 규칙이 카드마다 다르다.

### 3.2 (B) 사건 목록 — 신축일·멸실일 …

```
┌ 소유기간 중 건축물 유무 이력 ─────────────────────────────┐
│ Q. 소유기간 중 이 토지 위 건축물이 새로 생기거나 없어진 적이 있습니까?
│    ( ○ 바뀐 적 없습니다   • 바뀐 적 있습니다   ○ 모름 )
│ 사건 1   ( • 건축물 멸실·철거·붕괴  ○ 건축물 신축 )   [2021-05-10]   [삭제]
│          철거 직전 그 토지의 재산세 구분  ( ○ 비과세·면제  ○ 분리과세  • 별도합산  ○ 종합합산  ○ 모름 )   ← 철거 사건에만
│ [+ 사건 추가]
└──────────────────────────────────────────────────────────┘
```
- 입력 부담: S1 기준 **라디오 2(사건 종류 · 철거 직전 재산세 구분) + 날짜 1**. 취득일·양도일을 다시 묻지 않는다. 첫 사건 종류가 취득 당시 상태를 정한다(멸실 먼저 = 취득 때 건물 있음, 신축 먼저 = 취득 때 나대지) — **별도 「취득 당시 건축물 유무」 질문이 필요 없다**.
- 오입력 위험: 같은 종류 사건 연속(멸실 뒤 멸실 — 중간 사건 누락), 순서 뒤바뀜, 소유기간 밖 날짜. 오류 종류가 적고 각각 행 단위로 짚을 수 있다.
- 검증 메시지 종류 ≈ 6(0행·빈 칸·해석 불가·순서 역전/같은 날·소유기간 밖·같은 종류 연속).
- 장점: 사용자의 기억 단위(「언제 허물었나」)와 일치. 중복 입력 없음. 축 B 지분에서 «지분 취득일 이전 사건»은 엔진이 상태를 재생(replay)해 자연히 처리. 사건 종류를 늘려 후속 확장 가능.
- 단점: 구간이 눈에 직접 보이지 않는다(→ 미리보기로 보완). 사건 사이의 상태가 암묵.

### 3.3 (C) 혼합 = (B) + 자동 생성 구간 미리보기 (+ 향후 구간별 상세 확장 여지)
> **v3**: 아래 «구간 미리보기»가 **유일한 표**다(일 단위 사건 구간 — 과세연도 표는 폐기). 열은 §5.3-3.

```
  … (B)와 같은 입력 …
  ┌ 이 이력으로 나뉜 소유기간 (읽기전용) ──────────────────────┐
  │ 취득일 다음날 ~ 2021-05-09   4,087일   건축물 있음 · 별도합산(선언)   ← 이전 구간은 사업용 여부 확정 표시
  │ 2021-05-10 ~ 양도일 전날      1,118일   건축물 없음 · 현재 선언·근거 기준   ← 마지막 구간은 «결과 계산 후 확정»
  │ 합계 5,205일 = 소유기간                       ← 합계가 소유기간과 같지 않으면 오류 표시
  └──────────────────────────────────────────────────────────┘
  양도일 현재 건축물: 없음 (마지막 사건 = 멸실)           ← 「건축물 있음」 토글을 이 줄로 대체
```
- 입력 부담은 (B)와 같다. 미리보기는 `deriveOtherLandStateIntervals`(엔진 공용 leaf)의 출력을 그대로 렌더하는 **표시 전용**이라 저장·미러링이 없다(`useMemo`).
- 효과: 사용자가 날짜 입력이 의도와 맞는지 **구간 일수로 검산**한다 — 결과 카드 ⑦의 구간표와 같은 leaf라 «입력 화면에서 본 구간 = 결과에서 판정한 구간»이 보장된다.

### 3.4 비교표

| 기준 | (A) 구간 | (B) 사건 | **(C) 사건 + 미리보기** |
|---|---|---|---|
| S1 입력 칸 수 | 라디오2 + 날짜4(+재산세 구분) | 라디오2 + 날짜1(철거 사건의 재산세 구분 포함) | 라디오2 + 날짜1 |
| 취득·양도일 중복 입력 | 있음 | 없음 | 없음 |
| 오류 종류 | ≈8 | ≈6 | ≈6 (+ 미리보기가 시각 검산) |
| 취득·양도일 수정 후 연쇄 오류 | 큼 | 사건이 범위 밖이 될 때만 | 같음 |
| 축 B 지분(지분 취득일 이전 구간) | 카드별 규칙 필요 | replay로 자연 처리 | 같음 |
| 구간별 상세(업종·유예) 확장 | 쉬움 | 사건 종류 추가로 가능 | 쉬움(미리보기 행에 칸 추가) |
| 결과 카드와의 일관 | 별도 | 별도 | **같은 leaf** |
| 800줄 영향 | 새 행 UI 1벌 | 새 행 UI 1벌 | + 미리보기 ≈40줄 |

**추천: (C)**. 엔진이 저장 모델을 «구간 배열»로 정한다면(엔진 계획의 선택) UI는 (A)로 입력받지 말고 **사건 → 구간 변환은 UI가 아니라 공용 leaf**에 두는 것을 요구한다(§13) — 사용자 입력 형태와 엔진 저장 형태를 분리할 수 있다.

---

## 4. 이력 미입력 시 동작과 「모름」

| 선택 | 의미 | 엔진·화면 동작 |
|---|---|---|
| 「바뀐 적 없습니다」 | 사용자가 «양도일 현재와 소유기간 내내 같았다»고 확인 | 현행 판정 그대로. **「양도일 현재 상태를 전 기간에 적용」 고지는 건축물 유무에 관해 생략**(사용자가 확인했다). 다만 유무 외의 이용 상태(업종·호별 용도·재산세 분류)는 계속 양도일 현재 값 전 기간 적용이므로 고지 문구를 «건축물 유무 외 …»로 좁힌다(엔진 문구 소관, 요구 §13) |
| 「바뀐 적 있습니다」 | 사건 입력 | ≥1행 필수(0행 차단) |
| 「모름」 | 확인하지 못함 | **현행 판정 + 확인 필요 고지**(문구는 현행 `NBL_STATE_AT_TRANSFER_APPLIED_NOTICE` 재사용). 차단하지 않는다 |
| 미선택 | 질문을 안 읽음 | **⑧ 차단**(UQ-1) — 「미입력 = 미해당」이 아니다 |

**왜 「모름」을 «혜택 불성립»으로 접지 않는가**: 이 축은 **양방향**이다(S1은 과대, S2는 과소). 「모름 = 혜택 불성립」(2026-10-04)을 적용하려면 «어느 구간을 어떻게 비사업용으로 보는가»를 정해야 하는데 이력 없이는 정의할 수 없고, 법 근거 없이 불리 쪽으로 접으면 `feedback_no_unfavorable_application_without_legal_basis`에 걸린다. 현행 + 확인 필요가 기존 방침(Q-4 (나) 승인 · 리뷰 §12.4-2)과 같다. → UQ-4.

**legacy 복원**: 구 이력·세션은 새 필드가 없다 → 정규화로 `""`(미선택)가 되고 ⑧이 Step4에서 질문을 요구한다(Q-12 (a) 별장 선례와 같은 방향). 구 **결과** 화면은 echo가 없어 현행 카드 그대로(§1-3).

---

## 5. 화면 스펙 (추천 (C))

### 5.1 신규 컴포넌트

| 컴포넌트 | 위치 | 역할 | 예상 줄 수 |
|---|---|---|---|
| `OtherLandStateHistorySection` | `components/calc/transfer/nbl/OtherLandStateHistorySection.tsx` | 질문 3지선다 + 사건 행(종류·날짜·**철거 사건의 재산세 구분**) + 미리보기 + 양도일 현재 파생 표시 | ≈200 |
| `nblOtherStateHistoryApplies` · `effectiveOtherHasBuilding` · `OTHER_STATE_*` 라벨 | `lib/calc/nbl-other-state-history-scope.ts` (`nbl-period-rows-scope.ts`와 같은 모양) | ④⑤⑧ 공용 술어(⑩은 Zod 단계 번호라 해당 없음 — 초판 오기 정정). 엔진 leaf를 감싸 `AssetForm`을 받는다 | ≈50 |
| `NblStateHistoryPeriodBlock` | `components/calc/NblStateHistoryPeriodBlock.tsx` | 결과 카드용 구간표·3기준(§7) | ≈110 |

`OtherLandDetailSection.tsx`(현 421줄 — 확인)는 마운트 1곳 + 건축물 유무 읽기 3곳 교체(`:144·176·223`)로 +≈15줄, **같은 교체가 `OtherLandHoSection.tsx:60`·`OtherLandPropertyTaxBasisField.tsx:34·72`(각 1~2줄)에도 필요**하다(⑤ 읽기 6곳 전부 — 빠지면 토글을 숨긴 `changed`에서 낡은 저장값을 읽는다). `NonBusinessLandResultCard.tsx`(437줄)는 분기 1곳 +≈15줄(블록은 분리 파일).

**파일 배치(자가 검토 정정)**: 새 필드·행 타입은 **기존 기타토지 슬라이스 `lib/stores/calc-wizard-asset-nbl-other.ts`(`NblOtherFormSlice`, 163줄)에 더한다** — 초판의 «새 슬라이스 파일 + `AssetForm` extends 추가»는 단일 사용 추상화였고(`AssetForm`이 이미 `NblOtherFormSlice`를 extends — `calc-wizard-asset.ts:72`), 776줄 문제는 타입이 아니라 `NBL_DEFAULTS`(`calc-wizard-asset-nbl.ts:647-776`) 쪽이다. `NBL_DEFAULTS`에는 **2줄**(`nblOtherStateHistoryMode: ""` · `nblOtherStateEvents: []`)만 더한다(776 → 778 · ≥750 위험구간이라 U0에서 «기회주의적 분리» 여부를 판단 — UV-9). 두 곳이 어긋나면 `nbl-defaults-and-migrate-guards.anchor.test.ts`가 `nbl*` 키 집합·값 불일치로 잡는다(확인).

### 5.2 필드 명세 (이름은 제안 — 엔진 입력 형태 확정 후 정합)

| 필드(AssetForm) | 타입 | initial | 의미 |
|---|---|---|---|
| `nblOtherStateHistoryMode` | `"" \| "unchanged" \| "changed" \| "unknown"` | `""` | 질문 답. `""` = 아직 안 답함 |
| `nblOtherStateEvents` | `NblOtherStateEventInput[]` (`{ kind: "" \| "building_built" \| "building_removed"; date: string; propertyTaxTypeBefore: "" \| PropertyTaxType }`) | `[]`(자산마다 새 인스턴스) | 사건 행. `changed`일 때만 판정에 쓴다 |

- **`propertyTaxTypeBefore`**(통합 Q-3 (가)) — `kind === "building_removed"` 행에서만 묻는 «그 철거 직전 건축물이 있던 구간의 재산세 구분». 타입은 엔진 `PropertyTaxType`(`land-usage.types.ts:55`)을 그대로 쓰고 **`""` = 모름(미선택) → 종합합산 + 확인 필요**(엔진 §3.4 · 통합 §1). 신축(`building_built`) 행은 이 칸을 갖지 않는다(앞 구간 = 나대지 = 종합합산 고정 — 엔진 V-6). 행 `kind`를 신축으로 바꾸면 **onChange 핸들러가 `propertyTaxTypeBefore: ""`로 함께 쓴다**(이벤트 시점 쓰기 — `useEffect` 미러링 아님 · stale 값이 신축 행에 남지 않게).
- ⚠️ **enum 이름과 라벨이 어긋난다**(확인 — `property-tax-type-label.ts`): `separate` = **별도합산**, `special_sum` = **분리과세**. 라벨·선택지 순서는 `PROPERTY_TAX_TYPE_LABEL`(단일 소스) 한 표에서만 읽고 UI가 삼항·문자열로 다시 쓰지 않는다(`enum-verification-before-mapping`). 엔진 사업용 인정 집합 `{exempt, special_sum, separate}`도 라벨로는 «비과세·면제 · 분리과세 · 별도합산»이다.
- `kind: ""`은 «첫 행에서 아직 종류를 고르지 않음»(§5.3-2)이다 — ⑧ #3이 막고, ⑫ 와이어 enum은 `""`을 받지 않는다(`changed`인데 `""` 행이면 400 — ⑧이 더 엄격한 쪽이라 모순 아님). ④가 `changed` 아닐 때 `events: []`로 비워 보내므로 stale `""` 행이 ⑫에 닿지 않는다.

`nbl` 접두 + string/배열이라 ④ prefix-pick이 자동 운반한다(§1-7). `kind` 값은 확장(업종 개시·폐업)을 열어 둔 **열거형**이다 — 라벨 표는 엔진 상수 단일 소스(`Record<kind, string>`로 키 누락을 컴파일러가 막는다 — memory `satisfies preserves keys`).

### 5.3 위젯 상세

1. **질문(RadioCardGroup, tone `amber`)** — `name={\`nblOtherStateHistoryMode-${asset.assetId}\`}`, `data-field="nblOtherStateHistoryMode"`(필드 점프 앵커), testId `nbl-other-state-mode-{unchanged|changed|unknown}`. 질문문: 「소유기간 중 이 토지 위 건축물이 새로 생기거나 없어진 적이 있습니까?」. 옵션 설명 문구에 법령 조어를 쓰지 않는다 — 법문 표현만: 「소유하는 기간 중 대통령령으로 정하는 기간」(법 §104의3①)·영 §168의6은 `LawArticleModal` 배지로 연결(`legalBasis="소득세법 시행령 §168의6"` — 기존 모달 prop 문자열 선례 `OtherLandDetailSection.tsx:134-138`).
   - OFF 상태에도 tone 배경 유지(RadioCardGroup 기본). 라디오는 native 신규 금지 준수.
2. **사건 행(`changed`일 때만)** — 행마다 violet 아닌 `amber` 카드(`ToneCard` 정본, 인라인 톤 금지). 행 구성: ① 종류 `RadioCardGroup layout="inline"`(2지선다: 「건축물 신축」 · 「건축물 멸실·철거·붕괴」 — 라벨은 유예 사유 9호 라벨 `GRACE_REASON_SPECS.demolition.label`과 같은 표기로 맞춘다) ② 날짜 `DateInput`(`data-field={\`nblOtherStateEvents.${i}.date\`}`) ③ 삭제 버튼(기존 행 UI 선례의 native `<button>` — 「항목 추가/편집 에디터」는 `components/calc/CLAUDE.md` 「모달 런처 버튼 규칙」 절의 제외 대상) ④ **«철거 직전 그 토지의 재산세 구분» — `kind === "building_removed"` 행에서만**(§5.2 `propertyTaxTypeBefore`): `RadioCardGroup layout="inline"` 5지선다(`PROPERTY_TAX_TYPE_LABEL` 4종 + **「모름」**), `data-field={`nblOtherStateEvents.${i}.propertyTaxTypeBefore`}`(⑧ 오류는 없지만 앵커는 둔다), testId `nbl-other-state-event-{i}-ptax-{exempt|special_sum|separate|comprehensive|unknown}`. 「모름」 옵션의 값은 UI 안에서만 `"unknown"`이고 **저장값은 `""`** 이다 — `value={ev.propertyTaxTypeBefore || "unknown"}`(표시 fallback) · `onChange={(v) => patchEvent(i, { propertyTaxTypeBefore: v === "unknown" ? "" : v })}`. ④ 전송·⑧(무규칙)·⑫(enum `""` 허용)·엔진(`""` = 모름 → 종합합산)이 모두 `""`을 같은 뜻(모름)으로 읽으므로 3중 패턴이 일치한다(§6.1). 모름이 선택(= 기본 표시)이면 행 아래에 ToneCard amber 한 줄 — 「재산세 구분을 모르면 철거 전 구간을 종합합산으로 보아 판정하고 확인 필요로 표시합니다. 재산세 납세고지서(과세구분)로 확인할 수 있습니다.」(문구는 엔진 상수 단일 소스 — R14).
   - 행 추가: 「+ 사건 추가」(유예 행 선례 `GracePeriodSection.tsx` 하단과 같은 dashed 버튼). 새 행의 기본 종류는 **직전 사건의 반대**(번갈아 오므로) — 첫 행은 미선택(`kind: ""` 허용 안 함 → 첫 행 종류도 사용자가 고른다; 빈 종류 행은 ⑧이 막는다). **날짜는 비워 둔다**(자동 채움 금지).
   - 힌트는 FieldCard `hint`로(placeholder 숫자 예시 금지): 「취득 당시 건축물이 있었다면 «건축물 멸실·철거·붕괴»부터 입력합니다. 건축물이 없던 토지라면 «건축물 신축»부터 입력합니다.」
3. **파생 표시(읽기전용 — v3: 일 단위 사건 구간표 한 벌)** — 구간 미리보기 표 + 「양도일 현재 건축물: 있음/없음(마지막 사건: …)」 줄. `changed`이고 사건 ≥1행이며 날짜가 모두 유효할 때만 표를 그린다(그 전엔 «사건을 모두 입력하면 …» 안내). 합계 일수가 소유기간과 다르면(= leaf가 구간을 못 만든 경우) 오류 문구를 같은 자리에 둔다. **열**: 구간(시작일 포함 ~ 종료일 전날) · 일수 · 건축물 유무 · 재산세 구분(이전 구간 = 철거 사건의 `propertyTaxTypeBefore` 라벨 또는 «모름 → 종합합산» · 신축 전 나대지 = «종합합산(고정)» · 마지막 구간 = «양도일 현재 선언 기준») · 사업용 여부(**이전 구간만 확정 표시** — «건축물 있음 ∧ 구분 ∈ {비과세·면제, 분리과세, 별도합산}»을 엔진 leaf가 정한다. **마지막 구간은 «결과 계산 후 확정»** — core 판정을 클라이언트가 모르기 때문이다). 양도일 의제 사유가 선택돼 있으면 표 대신 «양도일 의제 사유를 선택해 이 이력은 판정에 쓰이지 않습니다»를 보인다(통합 Q-9 (가)).
4. **기존 「건축물(건물·시설물) 있음」 ToggleCard**(`OtherLandDetailSection.tsx:140-148`) — `changed`이면 **숨기고** 위 파생 줄로 대체한다(두 곳에서 같은 사실을 받지 않는다 — 양방향 통합 원칙 `components/calc/CLAUDE.md:84`의 변형: 입력 소스를 하나로). `unchanged`·`unknown`·`""`이면 종전 그대로. 모드를 `changed → 그 밖`으로 바꿀 때는 **onChange 핸들러에서** `nblOtherHasBuilding`을 마지막 파생값으로 한 번 써 준다(이벤트 시점 쓰기 — `useEffect → store` 미러링이 아니다).
5. **하위 칸 노출 조건 — 모두 «마지막 구간(양도일 현재) 상태» `effectiveOtherHasBuilding(asset)` 하나로 읽는다**(자가 검토 정정). 초판은 `hasBuildingInterval`·`hasBareInterval`(«구간 중 하나라도 있으면 표시») 술어를 두고 «종전 바닥면적을 건축물 바닥면적에 통합»했으나, **엔진이 판정에 쓰지 않는 칸을 화면에 만든다**(B1 교훈 — 노출 PR은 판정 PR 뒤, 화면에 있는데 판정에 안 쓰이는 칸 금지): ① 마지막 구간은 현행 입력이 그대로 정한다(엔진 §3.1) ② 이전 «건축물 있음» 구간의 배율·2% 요건은 구간별로 재판정하지 않는다(엔진 V-5 — 시가표준액·바닥면적 이력 없음) ③ 신축 전 나대지 구간의 근거는 받지 않는다(종합합산 고정 — 엔진 V-6).
   | 칸 | 현행 조건 | 이력 모드 조건 |
   |---|---|---|
   | 건물·토지 시가표준액, 건축물 바닥면적(`:176-221`) | 건축물 있음 | **마지막 구간에 건축물이 있다**(= 마지막 사건이 «신축») — 시가표준액은 `isBareLand`의 2% 비교(`other-land.ts:66-74`)가 마지막 구간에만 쓰고, 바닥면적은 ⑧ `:60`·배율 판정이 마지막 구간에만 쓴다 |
   | 재산세 분류 근거(`OtherLandPropertyTaxBasisField.tsx:34`) · «종전 바닥면적»(`:72`) | 건축물 없음일 때 선택지 · 근거=철거ㆍ멸실 | **마지막 구간에 건축물이 없다**(= 마지막 사건이 «멸실»)일 때 현행 그대로 — `propertyTaxBasisOptions(declared, false)`·`requiresDemolishedFloorArea`가 이 상태에서만 근거·종전 바닥면적을 묻는다 |
   | 복합용도 ⑥(`:223`) | 건축물 있음 | 마지막 구간에 건축물 있음 + «양도일 현재 값을 전 기간에 적용» 안내(UQ-9) |
   | 「재산세 과세 분류」 FieldCard(`:149-171`) | (라벨 없음) | 라벨을 **「재산세 과세 분류 (양도일 현재)」**로 — 같은 섹션의 철거 사건 행이 «철거 직전 재산세 구분»을 따로 묻기 때문에 두 질문이 같은 것으로 읽히면 안 된다(계산 순서상 사건 행이 앞) |
   **실측 근거(자가 검토)**: `propertyTaxBasisOptions("separate", true)`는 `[]`(근거를 묻지 않음 — `property-tax-basis.ts:71-83`)이고 `requiresDemolishedFloorArea`는 `!hasBuilding`일 때만 참(`:125-127`)이며 ⑧ `:60`은 `hasBuilding`일 때만 바닥면적을 요구한다 → **마지막 구간 기준이면 «건축물 바닥면적»과 «종전 바닥면적»이 동시에 필요한 입력 상태가 없다.** 따라서 통합 Q-12 (가)의 «두 바닥면적 통합»은 별도 병합(`nblOtherBuildingFloorArea`를 철거 근거에도 읽게 하는 ④⑧⑫⑭ 4층 파생)이 아니라 **«마지막 구간 기준 노출»로 충족**된다(UQ-6 정밀화 — §14).
6. **이력 모드 안내(ToneCard amber — 문구는 전부 엔진 상수 `nbl-confirm-notices.ts` 단일 소스)**: `unchanged` → `NBL_STATE_HISTORY_UNCHANGED_NOTICE` · `unknown` → `NBL_STATE_HISTORY_UNKNOWN_NOTICE` · `changed` → `NBL_STATE_HISTORY_APPLIED_NOTICE`(건축물 유무·철거 직전 재산세 구분만 기간별 판정 — 그 밖의 이용 상태는 양도일 현재 값 전 기간 적용) + `NBL_STATE_HISTORY_GRACE_ROW_NOTICE`(착공~준공은 유예 5호·철거는 9호 유예 행에서 직접 입력 — 자동 생성 안 함 · 통합 Q-10). 양도일 의제(§168의14②) 사유가 선택돼 있으면 `NBL_STATE_HISTORY_DEEMED_TRANSFER_NOTICE`(«이 이력은 판정에 쓰지 않았다»)를 더하고 미리보기 표는 숨긴다(통합 Q-9 (가) — 엔진 문구 단일 소스).
7. **`changed`일 때 «당해 사업개시일» 칸 안내**(`OtherLandDetailSection.tsx` — 그 칸의 hint는 «입력하면 … 사업 구간을 「사업개시일 ~ 양도일」로 보아 기간기준도 판정합니다»라고 약속한다): 🔴 **Q-15 (가′) 정정(2026-11-23)** — 초판은 «`changed`이면 엔진이 DM-01을 건너뛰므로 이 날짜는 판정에 쓰이지 않는다»였으나 **틀렸다.** 엔진은 개시일이 있으면 **소유기간 ∩ 그 구간을 사업용 구간으로 세어 이력의 사업용 구간과 함께 판정**한다(통합 §5 Q-15 (가′) · 엔진 상수 `NBL_STATE_HISTORY_REVENUE_START_NOTICE` — «이력과 함께 판정»). 칸은 숨기지 않고(복원 보존) FieldCard 아래에 그 **엔진 상수를 그대로** ToneCard로 보인다(문구를 UI가 새로 짓지 않는다 — R14). 조건 술어는 `nblOtherStateEventsInUse(asset)`(= 질문 적용 ∧ `changed`).

### 5.4 UI 순서 = 계산 순서

엔진 순서: Step 0(나대지 간주·근거) → 공장 → 건물 배율 → 수입금액비율 → … → 기간기준(`other-land.ts` 흐름). 이력은 **Step 0 이전의 «구간 분해»**이므로 질문을 섹션 맨 위(현 `건축물 있음` 토글 직전, `OtherLandDetailSection.tsx:140`)에 두고(질문 → 사건 행(날짜순 = 시간순, 철거 사건 행 안에서 «철거 직전 재산세 구분») → 미리보기 → 마지막 구간 입력(양도일 현재 재산세 분류·근거·시가표준액·바닥면적)), 그 아래 칸들은 **마지막 구간 상태**로 노출한다(§5.3-5). 호별(§168의11①)·수입금액비율은 엔진에서 이력 뒤에 오므로 현 위치 유지.

---

## 6. 클라이언트 8지점 변경 계획

> 모든 항목은 현 구조를 읽은 뒤 쓴 것이다(file:line은 §1·아래 표). `useEffect → store` 미러링은 쓰지 않는다. 3중 패턴 적용 대상은 «파생 hasBuilding» 한 가지(표 아래).

| 지점 | 파일 · 현 구조 근거 | 변경 |
|---|---|---|
| ① 폼 상태 | **`lib/stores/calc-wizard-asset-nbl-other.ts`**(`NblOtherFormSlice` — 163줄, 확인)에 타입 `NblOtherStateEventInput`·`NblOtherStateHistoryMode`와 필드 2개를 더한다. `AssetForm`은 이미 이 슬라이스를 extends한다(`calc-wizard-asset.ts:72`) → **새 슬라이스 파일·`AssetForm` 수정 없음**(초판의 «새 파일»은 단일 사용 추상화 — §5.1 배치 정정). `calc-wizard-asset-nbl.ts`(776줄)는 `NBL_DEFAULTS` 2줄만 | 필드 2개(§5.2 — 사건 행에 `propertyTaxTypeBefore` 포함) |
| ② initial | `NBL_DEFAULTS`(`calc-wizard-asset-nbl.ts:647` 이하 — 유예 `:753`) · `makeDefaultAsset`(`calc-wizard-asset-factory.ts:95`, NBL 블록 `:378-426`). 두 곳 `nbl*` 키·값이 같아야 한다 — **`__tests__/lib/stores/nbl-defaults-and-migrate-guards.anchor.test.ts`가 강제**(키 집합 일치·값 일치·배열 새 인스턴스. 초판은 `migrate-factory-parity`를 지목했으나 그 테스트는 `migrateAsset`↔factory 쪽이다) | `mode: ""` · `events: []`. `NBL_DEFAULTS`는 모듈 상수라 factory는 **인라인으로 다시 써서** 배열을 호출마다 새로 만든다(spread 단일화 금지 — 위 가드 테스트 주석). 유예 선례 `calc-wizard-asset-migrate.ts:225` |
| ③ normalize | **`migrateAsset` 끝의 `fillMissingFromFactory(a)`(`calc-wizard-asset-migrate.ts:668`·정의 `:710`)가 `undefined`인 최상위 칸을 `makeDefaultAsset(0)` 값으로 채운다** → `mode`·`events`의 «칸 없음» 처리는 **자동**이다(`migrate-factory-parity.anchor.test.ts`가 계약 고정 — 확인). 그래서 `calc-wizard-asset-migrate-nbl.ts`(24줄 — `migrateNblB1Fields`, `:230`에서 호출)에는 **행·값 수준 방어만** 더한다: `mode`가 허용값 밖이면 `""` · `events`가 배열이 아니면 `[]` · 각 행의 `kind`/`propertyTaxTypeBefore`가 허용값 밖이면 `""`, `date`가 문자열이 아니면 `""`. **`""`을 `unchanged`로 접지 않는다**(미입력≠미해당). 복원 호출 경로: `transfer-resume-entry.ts:138`(이력 편집) · `calc-wizard-migration.ts:122`(레거시 폼) · `calc-wizard-store.ts:303`(`migrateAsset` 매핑 — `mergePersistedWizard` 정의 `:317` · 등록 `:362`) |
| ④ API 변환 | `lib/calc/non-business-land-request.ts:139` `buildNonBusinessLandRaw` | (a) prefix-pick(`:153-156`)이 새 필드·사건 행(`propertyTaxTypeBefore` 포함)을 자동 운반(§1-7). (b) **전송 규칙은 `nblOtherStateHistoryApplies(asset)`(§2.2 전체 술어) 하나로 가른다** — 거짓이면 `mode: ""` · `events: []`(지목 비소비·연접 다필지·정밀판정 OFF). 참이고 `mode`가 `unchanged`·`unknown`이면 **`mode`는 그대로 보내고 `events`만 `[]`**(엔진이 `unchanged`의 좁힌 고지·`unknown`의 확인 필요 고지를 모드로 가른다 — 초판은 «mode도 비워 전송»이라 이 고지가 사라졌다). 참이고 `changed`이면 둘 다 전송. 선례 `nblUrbanIncorporationDate: consumes.incorporation ? … : ""`(`:183`) — 다만 그 선례는 지목 열 하나만 보지만 이 칸은 연접 다필지 축이 더 있어 **전체 술어**를 쓴다. (c) **파생 `nblOtherHasBuilding` 덮어쓰기**(참 ∧ `changed` ∧ 사건이 모두 유효할 때만) — `nblFields` 스프레드 뒤, `nblOwnershipRatio`(`:182`)와 같은 자리. 축 B는 `buildFractionalShareNblRecord`(`:235`)가 `...primary`라 변경 불필요(이력 상속) |
| ⑤ 위젯 | §5 | 신규 `OtherLandStateHistorySection` + `OtherLandDetailSection`·`OtherLandHoSection`·`OtherLandPropertyTaxBasisField` 건축물 유무 읽기 교체(§5.3-5). 지목·모드 변경으로 숨는 칸의 값은 store에 남기고(복원 보존) ④가 보내지 않는다 |
| ⑥ 사이드바 | 위 §1-11 | **변경 없음**(NBL 참조 0건). 결과 도착 후 합계는 엔진 세액이 반영 |
| ⑦ 결과 카드 | `NonBusinessLandResultCard.tsx:69-71·235-263` · `period-evaluation.ts:13` | §7 — 새 basis `state_history` 분기 + 신규 블록 |
| ⑧ validation | `lib/calc/transfer-tax-validate-nbl-other.ts`(219줄 — 기타토지 입력 검증, `validateNblOtherLand` 지목 게이트 `:19`, 호출처 `transfer-tax-validate-nbl.ts:258`은 의제 `return`(`:147`) 뒤) | §8 — 새 규칙은 **`validateNblOtherLand`의 지목 게이트 직후(= 재산세 과세 분류 검사 앞)** 에 둔다 — 질문이 섹션 맨 위라 첫 오류도 같은 순서여야 한다(UI 순서 = 검증 순서; 초판은 «파일 끝»). 규칙 leaf는 엔진 쪽(`other-land-state-history.ts`)에 두고 ⑫와 공유, 이 파일은 호출만(≈+25줄) |

### 6.1 3중 패턴 — 파생 값 2개: `hasBuilding`(마지막 구간) · `propertyTaxTypeBefore`(`""` = 모름)

| 층 | 현재 | 이력 모드 |
|---|---|---|
| 화면(⑤) 표시 | `asset.nblOtherHasBuilding` 직접 읽기 ×6(§1-5) | `effectiveOtherHasBuilding(asset)`(모드≠changed 또는 사건 미완성이면 저장값, changed이고 사건이 모두 유효하면 **마지막 사건 종류 = 신축이면 true**) — 같은 helper를 ⑤ 6곳이 쓴다 |
| 전송(④) | prefix-pick | 전체 술어가 참 ∧ `changed` ∧ 사건 유효일 때 `nblFields` 뒤에 **파생값으로 덮어쓰기** |
| 검증(⑧) | `validate-nbl-other.ts:41·60` 직접 읽기 | 같은 helper |
| ⑫ | `lib/api/transfer-tax-schema-nbl-refines.ts:191` raw 읽기 | UI 경로는 ④가 덮어쓴 값이라 일치. **직접 API는 ④를 거치지 않으므로 ⑫ 자신도 같은 파생을 써야 한다** — 엔진 R5(매퍼가 raw를 무시하고 사건에서 파생)만으로는 `:191`의 `demolishedBasisIssue`가 낡은 raw `hasBuilding`을 읽어 ⑧과 어긋난다(요구 R13). 어긋난 입력을 400으로 막지 않고 파생 단일 소스로 둔다 |
| `propertyTaxTypeBefore` 표시 fallback | (없음) | 화면은 `""`을 **「모름」 라디오 선택 상태**로 보인다(`|| "unknown"`) |
| `propertyTaxTypeBefore` 전송·검증 | (없음) | ④ `""` 그대로 전송 · ⑧ 규칙 없음(선택 칸 — 통합 §1) · ⑫ `z.enum(["", "exempt", "separate", "special_sum", "comprehensive"])` · 엔진 `""` = 종합합산 + 확인 필요. **네 층이 `""` = 모름으로 같다** — 화면 fallback만 «모름» 표시를 하고 값을 쓰지 않는다(`useEffect` 미러링 없음) |

저장값 `nblOtherHasBuilding`은 손대지 않는다 — 모드를 되돌리면 마지막 값에서 이어진다(§5.3-4).

### 6.2 ⑨~⑭ (엔진 계획서 소관 — UI가 확인할 점만)

⑨⑩(enum·`addPropertyRefines`)·⑪(자산-수준 `acquisitionDate` fallback)은 이 기능에 해당 없음(새 enum이 라우트 body 최상위가 아니라 `nonBusinessLandRaw` 안). ⑫ `lib/api/transfer-tax-schema-nbl.ts`에 필드 2개 + **사건 행 스키마(`kind`·`date`·`propertyTaxTypeBefore` — 셋 다. 행 안의 칸이 빠져도 침묵 strip)** + `refineNonBusinessLandRaw`에 ⑧ 미러 · ⑬ `buildNonBusinessLandRaw` 자동 운반 · ⑭ `lib/tax-engine/non-business-land/form-mapper.ts`(`mapAssetToNblInput` — 유예 매핑 `:114-` 이웃) → `form-mapper-helpers.ts:295` `buildOtherLand`에서 `stateHistory` 입력으로 변환. **UI PR 머지 전 자가 점검**: `git grep -n nblOtherStateEvents`로 ①~⑭ 12개 이상 지점에서 나오는지, `git grep -n propertyTaxTypeBefore`로 ①·⑤·④(자동)·⑫(행 스키마)·⑭·⑦에서 나오는지 대조(침묵 strip 방지).

**⑫ refine이 ⑧보다 느슨해야 하는 규칙(자가 검토 — 막다른 길)**: 사건일 ≥ 소유 시작일 규칙(⑧ #6)은 **⑫에 넣지 않는다.** 축 B 지분 raw는 «첫 카드 땅 사실 + 그 지분의 취득일»이라(`buildFractionalShareNblRecord` — `acquisitionDate = share.acquisitionDate`) 같은 사건 목록이 지분마다 다른 소유 시작일과 만난다 — 엔진 M14처럼 지분 3의 취득이 2021-06-01이고 철거가 2021-01-01이면 ⑫가 지분 3 raw를 사건 < 취득일로 400을 낸다(엔진은 원본 replay로 정상 처리 — 엔진 §3.6 · D2). ⑧은 번들 최이른 취득일로만 검사하고(§8.1 #6) ⑫는 사건 서로 간의 순서·종류·양도일 이후만 본다(⑧이 더 엄격한 것은 허용 — 엔진 Q-10).

---

## 7. ⑦ 결과 카드 — 구간별 사업용 일수와 3기준(한국어 풀어쓰기)

### 7.1 노출 조건

`periodEval.basis === "state_history"`(엔진 echo)일 때 기존 `state_at_transfer` 안내(`NonBusinessLandResultCard.tsx:254-274`)를 **대체**한다. echo가 없는 결과(이력 복원 · `unchanged`/`unknown`)와, **`changed`를 입력했지만 엔진이 적용하지 않은 경우**(부분 면적 경로 — 통합 Q-8 (가) · 양도일 의제 동시 — Q-9 (가))는 현행 분기로 간다 — 후자의 사유는 엔진 `warnings`가 말하고 카드는 `judgment.warnings`를 이미 렌더한다(`:358-362` — 확인). 즉 v1에서 «구간 안 면적 일부만 사업용»인 표시는 **생기지 않는다**(UV-2 해소 — 통합 Q-8). 다건 결과뷰(`MultiTransferTaxResultView.tsx`)는 `NonBusinessLandResultCard`를 쓰지 않는다(사용처 grep: `components/calc/results/TransferTaxResultView.tsx:529`·`components/calc/results/transfer/ValuationDetailCards.tsx:114` 두 곳뿐 — 확인) → UV-7.

### 7.2 와이어 (v3 — 일 단위 구간표 + 3기준)

가공 예가 아니라 엔진 실측(엔진 §6 M1: 취득 2014-01-01 · 건물 별도합산 → 철거 2021-01-01 · 양도 2024-01-01, 사업용 구간 2,556 · 비사업용 1,095일 · 가 충족 · 나 충족 · 다 미충족)을 옮긴 모양이다. 일수·창 길이는 `Date.UTC` 계산으로 대조했다(소유기간 3,651 · 직전 5년 창 1,826 · 직전 3년 창 1,095 · 100분의 40 = 1,460).

```
기간 분석 — 소유기간 중 건축물 유무 이력 반영
┌───────────────────────────────┬────────┬────────┬────────────────────────────┬────────┐
│ 구간(시작일 포함 ~ 종료일 전날)   │ 일수    │ 건축물  │ 판정에 쓴 재산세 구분          │ 사업용? │
├───────────────────────────────┼────────┼────────┼────────────────────────────┼────────┤
│ 2014-01-02 ~ 2020-12-31       │ 2,556일 │ 있음    │ 별도합산(철거 전 구간 — 선언)    │ 사업용  │
│ 2021-01-01 ~ 2023-12-31       │ 1,095일 │ 없음    │ 종합합산(근거 미선택)           │ 비사업용│
│ 소유기간                       │ 3,651일 │        │                            │        │
└───────────────────────────────┴────────┴────────┴────────────────────────────┴────────┘
소유기간 3,651일(5년 이상 — 영 §168의6 제1호)에서 사업용으로 본 기간 2,556일, 비사업용으로 본 기간 1,095일
  · 양도일 직전 5년(1,826일) 중 비사업용 기간 1,095일 — 기준 730일 초과      → 충족
  · 양도일 직전 3년(1,095일) 중 비사업용 기간 1,095일 — 기준 365일 초과      → 충족
  · 소유기간 3,651일 중 비사업용 기간 1,095일 — 소유기간의 100분의 40(1,460일) 초과 → 미충족
세 기준을 모두 충족해야 비사업용이다 — 위에서 미충족이 있어 사업용으로 본다.
```

- «사업용?» 열은 **그 구간의 토지가 사업용 토지에 해당하는가**이고, 소유기간 전체의 최종 판정은 아래 3기준이다(둘을 한 줄로 합치지 않는다 — 위 예는 비사업용 구간이 있어도 최종은 사업용). 이 문장을 표 아래 고정 안내로 둔다.
- 유예기간이 들어간 경우(엔진 §6 M7 형태): 첫 줄을 «사업용으로 본 기간 A일(사업용 구간 a일 + 유예기간 가산 g일)»로 쓴다 — `gracePeriodDays`(합집합 증가분 — 중복 계상 없음, `period-criteria.ts` 헤더)가 0보다 클 때만. 기존 «기간 분석» 표(`:235-250`)가 이미 같은 «유예기간 가산» 행을 갖는다.
- **재산세 구분 열의 출처**: 이전 «건축물 있음» 구간 = 철거 사건의 `propertyTaxTypeBefore` 라벨(미선택이면 «종합합산(선언 없음 — 확인 필요)»로 쓴다) · 신축 전 나대지 구간 = «종합합산» · 마지막 구간 = 양도일 현재 선언 + 근거. 라벨은 `PROPERTY_TAX_TYPE_LABEL` 단일 소스.
- 변수 약어 금지 — «직전 5년 중 비사업용 기간» 같은 한국어 라벨. 숫자 옆에 라벨. 중간 산술 결과(예: 소유기간 × 40 ÷ 100 이전 값) 미표시, `floor` 묵시(`1,460일`만 보인다). 법정 용어 우선(「비사업용 기간」「사업용 기간」「소유기간」). 3기준 문구는 영 §168의6 **현행 본문 표현**(소유기간 버킷별 «비사업용 기간 = 가·나·다 모두 해당» — 엔진 §1.1 주의)이고 코드의 `criteria` 3 boolean 이름(`rule2of3Years`·`rule5Years`·`rule80Percent`)은 화면에 쓰지 않는다.
- 소유기간 버킷별(3~5년 · 3년 미만) 창 길이·기준값은 엔진 echo R4가 구조화해 보낸다 — 카드가 버킷을 추정하지 않는다.
- 금액이 아닌 일수라 `amount-column-align`의 금액 규칙 대상은 아니지만 숫자 열은 `font-mono tabular-nums text-right`로 같은 스타일을 쓴다.
- testid: `nbl-state-history-intervals`(표) · `nbl-state-history-criteria`(3기준) · 구간 행 `nbl-state-history-interval-{i}`.

### 7.3 유무 외 고지

`unchanged`: 건축물 유무 고지 생략 + «유무 외 상태는 양도일 현재 값 전 기간 적용» 고지(엔진 문구). `unknown`: 현행 고지 + 「소유기간 중 건축물 유무 이력을 확인하지 못했습니다」. 두 문구 모두 엔진 `warnings`로 오고 카드는 echo의 `mode`로 분기한다(문구를 UI가 새로 짓지 않는다 — `nbl-confirm-notices.ts` 단일 소스).

---

## 8. ⑧ 검증 규칙 · 필드 점프 · 막다른 길 점검

### 8.1 규칙표 (⑧ `validateNblOtherLand` 확장 + ⑫ 미러 — **같은 leaf·같은 문구**, 문구 상수 `nbl-validation-messages.ts`에 추가)

게이트: `nblOtherStateHistoryApplies(asset)` 일 때만(지목·정밀판정·의제 불성립·연접 다필지 꺼짐 — ⑤ 렌더 게이트·④ 전송 게이트와 동일 술어. 어긋나면 «화면에 없는 칸을 요구하며 영구 차단»이 된다 — `transfer-tax-validate-nbl.ts` 의제일 R11 주석 선례). 의제 성립은 `validateNblDetailedJudgment`가 `:147`에서 이미 `return`하고 `validateNblOtherLand`는 그 뒤(`:258`)에서 불린다. 규칙 #1~#8은 **`validateNblOtherLand`의 지목 게이트 직후**에 두어 첫 오류가 화면 순서(질문 → 사건 행)와 같게 한다(§6 ⑧ 행).

| # | 조건 | 가리키는 칸(`field`) | 문구 방향 |
|---|---|---|---|
| 1 | 모드 `""` | `nblOtherStateHistoryMode` | 「소유기간 중 건축물이 새로 생기거나 없어진 적이 있는지 선택하세요. 모르면 «모름»을 고르세요」 |
| 2 | 모드 `changed` + 사건 0행 | `nblOtherStateEvents` (첫 행 추가 버튼 앵커 — 행이 없으므로 컨테이너 앵커) | 별장 0행 선례(`VILLA_NO_USE_REQUIRED_MESSAGE`) 모양 |
| 3 | 사건 종류 미선택 | `nblOtherStateEvents.{i}.kind` | 「n번째 사건 — 종류를 선택하세요」 |
| 4 | 날짜 비었음 · 해석 불가 | `nblOtherStateEvents.{i}.date` | 기간 행 문구(`periodRowIssueMessage`)와 같은 어미 — 단 «시작일·종료일» 대신 «날짜». **날짜 1개용 sibling leaf**(`stateEventRowIssue`) 필요(§1-4) |
| 5 | 앞 사건보다 빠름(역순) · 같은 날 | 같은 `…date` | 「n번째 사건일(…)이 앞 사건보다 빠릅니다」 — 자동 정렬하지 않는다(침묵 보정 금지) |
| 6 | 사건일 ≤ **하한일**(= 이월과세는 증여자 취득일 · 일반은 취득일 — `nblAcquisitionDateOf`. **축 B 번들은 «전 지분의 `nblAcquisitionDateOf` 중 가장 이른 날»** — 첫 카드가 가장 이른 지분이라는 보장이 없다(§1-9 UV-5 실측). 하한일 당일 사건은 소유 첫날 이전이라 차단 · 하한일 다음날은 허용) | `…date` | 같은 날 사건은 0일 구간을 만든다. **⑫에는 넣지 않는다**(§6.2 — 지분별 raw가 다른 취득일을 가져 늦은 지분이 400). ⑧만의 규칙이라 하한일 계산은 `lib/calc/nbl-other-state-history-scope.ts`의 단일 helper `stateHistoryFloorDate(form, assetIndex)`로 둔다 |
| 7 | 사건일 ≥ 양도일(**이후 또는 같은 날** — 같은 날이면 마지막 구간이 0일. 엔진 §3.6 · UV-4 해소) | `…date` | 「양도일 당일 또는 그 이후의 사건은 판정에 쓰이지 않습니다」 — 차단. ⑫도 같은 규칙(양도일은 raw마다 같다) |
| 8 | 같은 종류 연속(신축 뒤 신축 · 멸실 뒤 멸실) | 뒤 행 `…kind` | 「앞 사건이 이미 «건축물 있음»입니다 — 사이의 «멸실» 사건이 빠졌습니까?」 |
| 9 | ~~양도일 의제 사유 선택 + 사건이 의제일 이후~~ → **규칙 없음**(UV-4 해소) | — | 통합 Q-9 (가) — 의제와 동시 입력이면 엔진이 이력을 적용하지 않고 고지만 더한다. 의제일 이후 사건이 판정에 들어갈 길이 없으므로 차단할 이유가 없다. 화면은 §5.3-3·§5.3-6의 안내로 알린다 |
| 10 | 취득일·양도일 미입력 | (건너뜀) | 앞 단계 검증이 먼저 막는다 — 중복 오류 금지 |
| 11 | 철거 행의 `propertyTaxTypeBefore` 미선택(`""`) | — | **규칙 없음** — 선택 칸이다(통합 §1: 미선택 = 모름 → 종합합산 + 확인 필요). 막지 않는 대신 화면이 결과(종합합산·확인 필요)를 행 아래에 밝힌다(§5.3-2) |

필드 점프: 행 단위 키는 동적(`nblOtherStateEvents.${i}.date`)이라 정적 게이트 `__tests__/lib/calc/transfer-validation-field-anchor-coverage.test.ts`가 `${…}`를 `*`로 정규화해 읽는다(소스 확인) — **⑧에 `fieldError("nblOtherStateEvents.${i}.date", …)` 리터럴 접두 형태, ⑤에 `data-field={\`nblOtherStateEvents.${i}.date\`}`** 를 둔다. 접미를 분기하는 선례(`transfer-tax-validate-nbl.ts:356-358`)처럼 `part`별 리터럴로 쓴다. 메시지별 E2E 케이스를 `e2e/_helpers/validation-field-jump-cases-nbl.ts`에 추가(동적 키라 정적 게이트가 못 잡는 부분의 안전망 — 같은 파일 주석 선례).

### 8.2 ⑧ ↔ UI fallback 동기화 (정책 3)

- 모드 `""`을 ⑤는 «질문 미답»으로 보이고 ⑧은 막는다 — 같은 값을 다르게 해석하는 층이 없다.
- `unchanged`/`unknown`일 때 `events`에 stale 행이 남아 있어도 ⑧은 행을 검사하지 않고 ④는 비워 보낸다(`consumes` 선례). 사용자가 `changed`로 돌아오면 stale 행이 되살아나므로 행 검증이 그때 작동한다.
- 파생 `hasBuilding`·`propertyTaxTypeBefore`(`""` = 모름)는 §6.1 표대로 4층 동일. ⑧이 ⑫보다 엄격한 규칙(#6 하한일 · #1 질문 미선택 · #2 0행)은 의도된 비대칭이고, ⑫가 ⑧보다 엄격한 규칙은 **없어야 한다** — 있으면 UI 통과 ↔ API 400. 자가 검토 격자(⑧ 규칙 × ⑫ 규칙)는 §8.4.
- 자동 안분 fallback 없음: 빈 날짜를 취득일·양도일로 채우지 않는다. 구간 일수는 입력에서 **계산**할 뿐 안분이 아니다.

### 8.3 막다른 길 점검 매트릭스

| 경로 | 위험 | 대응 |
|---|---|---|
| 지목을 기타토지에서 다른 지목으로 변경 | 화면 칸이 사라졌는데 ⑧이 요구 | ⑧ 게이트 = 소비표(`stateHistory`) — 다른 지목이면 건너뜀. 사용자가 되돌리면 값 복원 |
| 정밀판정 접기(`nblUseDetailedJudgment=false`) | ④가 raw를 안 보냄 | ⑧도 건너뜀(`validateNblDetailedJudgment` 첫 줄 선례 `transfer-tax-validate-nbl.ts:100-106`) |
| 무조건 사업용 의제 성립 | 섹션 `inert` | ⑧ `nblExempt` 건너뜀(같은 자리) |
| 연접 다필지 ON | 필지별 `hasBuilding`과 충돌 | v1 배타 — 노출 술어에서 제외(UQ-9). 사용자가 ON으로 바꾸면 질문이 사라지고 ⑧도 건너뜀 |
| **축 B 지분 카드** | 지분 카드에는 질문이 없는데 ⑧이 지분 카드에 요구 | ⑧은 **첫 카드(`assetIndex: 0`)에만** 요구(`transfer-tax-validate.ts:478-495` 선례). 지분 레코드는 `buildFractionalShareNblRecord`가 primary 값을 상속 |
| 축 B 지분 취득일 < 첫 카드 취득일 | 그 앞 구간의 상태를 입력받을 곳이 없다 | **UV-5 해소**: 순서 보장이 없다(§1-9). ⑧ #6 하한을 **번들 최이른 취득일**로 둔다(첫 카드 취득일이 아님) — 그래야 먼저 취득한 지분의 소유기간 안 사건을 입력할 수 있다. 질문 문구는 «이 토지(전 지분)가 소유되던 기간 중»으로 쓴다. 첫 카드보다 이른 지분은 엔진이 원본 replay로 처리(엔진 D2) |
| 축 B 지분 취득일이 사건일보다 뒤 | 그 지분은 사건 전 구간이 소유기간 밖 | 엔진 replay로 처리(§13 R2). **⑧은 번들 최이른 취득일로만, ⑫는 소유 시작 규칙 없음**(§6.2) — 초안은 «⑧은 첫 카드 소유기간 기준»이라 했으나 ⑫ 미러가 같은 기준을 raw로 적용하면 늦은 지분이 400이 된다 |
| 함께 양도 토지 컴패니언(비지분) | 컴패니언 NBL 섹션 노출 조건 | `AssetSectionExtras.tsx:72-74`가 이미 같은 `NblSectionContainer`를 그린다 → 질문도 자동 노출. 컴패니언 raw는 V6-PU01 이후 비지분도 자기 카드로 전송(`transfer-tax-api-bundled.ts:94-97`). ⑧은 `validateNblDetailedJudgment`가 자산별로 돈다(`transfer-tax-validate-acquisition.ts:367`) |
| 다건(연간 합산) | 건별 primary | `multi-transfer-property-payload.ts:118`이 같은 `buildNonBusinessLandRaw(primary,…)` — ④ 변경이 공용. **다건 입력 화면에는 NBL 섹션 마운트가 없고**(`git grep -l nblUseDetailedJudgment -- app components`에 다건 화면 0건) 다건 ⑧ 파일(`multi-transfer-tax-validate.ts`)도 NBL 참조 0건(확인) → 질문을 요구하지 않는다. 다건으로 넘어온 폼의 `""`은 «현행 + 고지»(⑫ 허용 — 엔진 Q-10). 다건 결과뷰는 NBL 카드를 쓰지 않으므로 echo 소비처 없음(UV-7) |
| 취득일·양도일을 질문 답한 뒤 수정 | 사건이 소유기간 밖으로 | ⑧ #6·#7이 행 단위로 짚는다 — 날짜 칸 필드 점프로 고칠 수 있음 |
| 이월과세(소유기간 기산일=증여자 취득일) | 사건 범위 기준이 취득일이 아님 | `nblAcquisitionDateOf(asset)` 사용(⑤ 미리보기·⑧·엔진 동일). **이월과세 배제 시나리오 B**(`buildNblEngineInputGiftBasis`가 기산일을 수증일로 다시 매핑 — 엔진 §5 M20)는 같은 사건을 수증일 앞에서 자른다 → 결과 카드의 구간표는 **엔진 echo 기준(수증일 기산)** 이라 입력 화면의 미리보기(증여자 취득일 기산)와 첫 구간 길이가 다를 수 있다. 카드가 echo를 읽으므로 모순은 아니고, 시나리오 B 카드에는 «증여일부터 소유한 것으로 본 구간표»라고 쓴다(엔진 문구) |
| legacy 복원 | 모드 `""` → 질문 요구 | 의도된 재질문(통합 Q-5 (가) — ⑧만 필수). 사용자가 «바뀐 적 없음»만 고르면 통과. **복원 폼에 `changed`가 있으면** 칸·행이 `migrateAsset`(③ 행 수준 방어)을 거쳐 허용값 밖은 `""`로 접힌다 → ⑧ #3·#4가 행 단위로 짚는다 |
| 모드 `changed` → 다른 모드 → `changed` | stale 행 부활 | 의도(복원 보존). 행 검증이 그때 작동 |
| 양도일 의제 사유 선택 + `changed` | 이력이 판정에 안 쓰이는데 입력을 요구 | 질문·⑧ #1~#8은 그대로(요구는 유지 — «미입력 ≠ 미해당») + §5.3-3·6 안내. 사용자가 `unchanged`/`unknown`으로 바꿔도 길이 막히지 않는다 |
| `changed` + 마지막 구간이 건축물 있음 + 재산세 분류 «별도합산·건물 있음» | 건물 시가표준액·바닥면적이 필요 | 마지막 구간 기준 노출(§5.3-5) — 바닥면적은 ⑧ `:60`이 요구, 시가표준액은 선택(2% 비교는 둘 다 있을 때만 — `isBareLand`) |
| `changed` + 마지막 구간이 건축물 없음 + 분류 «별도합산» + 근거 «철거ㆍ멸실» | 종전 바닥면적 필요 | 현행 `nblOtherDemolishedFloorArea` 칸이 그대로 뜬다(§5.3-5 — 별도 병합 없음). ⑧·⑫의 `demolishedBasisIssue`는 같은 파생 `hasBuilding`을 읽는다(§6.1) |

### 8.4 ⑧ ↔ ⑫ parity 격자 (자가 검토 — «⑫가 더 엄격하면 안 된다»)

| 규칙 | ⑧ | ⑫ | 판정 |
|---|---|---|---|
| #1 모드 `""` | 차단 | **허용**(`""` = 현행 — 엔진 Q-10) | ⑧이 더 엄격 — 허용 |
| #2 `changed` + 0행 | 차단 | **엔진 결정 필요**(UV-18) — 권장: 400 아님(사건이 없으면 마지막 구간뿐이라 현행 판정과 같다) | 400이면 UI 통과 ↔ API 400은 아니지만(⑧도 막음) 직접 API 계약이 불명확 |
| #3 종류 `""`·허용값 밖 | 차단 | 400(enum) | 일치 |
| #4 날짜 빈 칸·해석 불가 | 차단 | 400 | 일치(같은 leaf·같은 문구) |
| #5 역순·같은 날 | 차단 | 400 | 일치 |
| #6 하한일(번들 최이른 취득일) | 차단 | **없음** | ⑧이 더 엄격 — 의도(§6.2) |
| #7 사건일 ≥ 양도일 | 차단 | 400 | 일치 |
| #8 같은 종류 연속 | 차단 | 400 | 일치 |
| `propertyTaxTypeBefore` | 규칙 없음 | enum(`""` 허용) | 일치(⑧이 못 막는 값은 ⑫도 enum 밖뿐) |
| 지목·연접 다필지·정밀판정 OFF | 건너뜀 | 건너뜀(raw 세 조건) + ④가 비워 보냄 | 일치(§2.2) |
| 의제 성립(§168의14③) | 건너뜀(`:147`) | 건너뜀(`:87-88`) | 일치 |
| 의제 사유(§168의14②) 선택 | 규칙 유지 | 규칙 유지 | 일치(이력은 엔진이 미적용 + 고지) |


---

## 9. 저장 이력(IndexedDB) · store 마이그레이션

- **저장 형태**: 이력 `inputData`는 `formData` 통째(`lib/storage/CLAUDE.md` — `useAutoSaveCalculation`)이므로 새 필드는 **자동 저장**된다. 별도 Dexie 스키마·`db.ts` 버전 올림 **불필요**(필드 추가는 JSON 안).
- **복원**: 이력 → 마법사 복원은 `transfer-resume-entry.ts:138`이 `migrateAsset({...a})`를 거친다(확인) → `fillMissingFromFactory`(`calc-wizard-asset-migrate.ts:668`)가 새 칸을 채우고 ③ 행 수준 방어가 값을 접는다. sessionStorage persist는 `mergePersistedWizard`(`calc-wizard-store.ts:317`, 등록 `:362`) → `:303`의 `.map(migrateAsset)` · 레거시 폼은 `calc-wizard-migration.ts:122`.
- **`STEP_MIGRATION`·`migrateLegacyForm`**: 단계 구조 불변 → **변경 없음**.
- **구 이력의 결과 화면**: `resultData`에 echo가 없다 → 카드는 현행 분기(§1-3). 재계산(「수정해서 다시 계산」) 시 질문이 뜬다.
- **중복 저장(dedup) 키**: `lib/storage/business-key.ts`에 `nbl`·`isNonBusiness` 참조 **0건**(`grep -n` 확인 — UV-10 일부 해소) → 새 필드는 키에 영향이 없다.
- **partialize**: `result`만 제외(변경 없음).

---

## 10. 케이스 매트릭스 (단순 케이스부터 — 엔진 anchor와 1:1로 맞출 표)

> 엔진 §6의 «일 단위» 열이 정본이다(통합 v3 우선 규칙). 아래 «기대»는 방향만 쓰고 세액 숫자는 엔진 anchor가 정한다.

| # | 모드 | 사건 | 소유기간 | 기대(방향) | 화면 확인 |
|---|---|---|---|---|---|
| M1 | unchanged | — | 5년 이상 | 현행 동일 | 이력 구간표 없음 · 유무 외 고지 |
| M2 | unknown | — | 5년 이상 | 현행 동일 + 확인 필요 | 현행 고지 |
| M3 | changed | 멸실 1행 + **철거 직전 재산세 구분 «별도합산» 선언** | 5년 이상 | S1: 현행(비사업용)보다 사업용 쪽(엔진 §6 M1) | 구간 2개 · 3기준 · 재산세 구분 열 «별도합산(선언)» |
| M3b | changed | 멸실 1행 + 철거 직전 재산세 구분 **모름(미선택)** | 5년 이상 | **현행과 같은 비사업용** + 확인 필요(엔진 R3 — 선언 없는 구간은 비사업용) | «종합합산(선언 없음 — 확인 필요)» 행 · 행 아래 안내 |
| M4 | changed | 신축 1행 | 5년 이상 | S2: 현행(사업용)보다 비사업용 쪽 | 구간 2개 · 3기준 · 신축 전 구간 «종합합산» 고정 |
| M5 | changed | 멸실→신축 | 5년 이상 | 구간 3개(있음→없음→있음) | 구간 3개 · 마지막 구간에 건축물 있음 → 바닥면적 칸 노출 |
| M6 | changed | 신축→멸실→신축 | 5년 이상 | 구간 4개 | 철거 행에만 재산세 구분 라디오 |
| M7 | changed | 멸실 + 유예 9호(같은 날 기산) | 5년 이상 | 유예가 «없음» 구간에 합집합 | 유예 가산 일수 표시(§7.2) |
| M8 | changed | 사건일 = 양도일 전날 / **= 양도일** | 3~5년 / 3년 미만 | 버킷 3종 각각 / 양도일 당일은 ⑧ #7 차단 | 버킷별 3기준 문구 / 필드 점프 |
| M9 | changed | 축 B 지분 취득일 > 사건일 | — | 그 지분은 한 구간만 · **⑧·⑫ 모두 통과**(⑫ 소유 시작 규칙 없음) | (엔진 echo 분리 — UV-6) |
| M9b | changed | 축 B 지분 중 **첫 카드보다 이른 취득일**이 있고 사건이 그 사이 | — | ⑧ 하한 = 번들 최이른 취득일이라 통과 | 첫 카드 날짜 기준이면 막혔을 입력이 통과함 |
| M10 | changed + 연접 다필지 ON | — | — | **질문 미노출 · ⑧ 건너뜀 · ④가 `""`·`[]`로 전송** | stale `changed` 행이 ⑫ 400을 만들지 않음 |
| M11 | `""` | — | — | ⑧ 차단 | 필드 점프 |
| M12 | changed | 날짜 역순 / 하한일 이전·같은 날 / 양도일 당일·이후 / 같은 종류 연속 | — | ⑧ 차단(하한일만 ⑫ 허용) | 행 점프 |
| M13 | changed + 이월과세 | 사건일이 증여자 취득일~수증일 사이 | — | 기산일 = 증여자 취득일 기준 범위. 시나리오 B(수증일 기산) 카드는 엔진 echo 기준 | 카드 구간표 ≠ 미리보기 가능(§8.3) |
| M14 | changed + 양도일 의제 | 사건이 의제일 앞·뒤 모두 | — | **이력 미적용 + 고지**(통합 Q-9 (가) — 차단 없음) | 미리보기 대체 문구 · 섹션 안내 |
| M15 | changed + 「당해 사업개시일」 입력 | — | — | 엔진이 개시일 이후 구간을 사업용 구간으로 세어 **이력과 함께 판정**(Q-15 (가′) — 건너뛰지 않음) | 그 칸 아래 ToneCard 안내(§5.3-7 — 엔진 상수) |
| M16 | changed | 철거 행 종류를 «신축»으로 변경 | — | `propertyTaxTypeBefore` `""` 로 리셋 | 라디오 사라짐 · 값 stale 없음 |
| M17 | changed → unchanged | — | — | 「건축물 있음」 토글 값 = 마지막 파생값(onChange 1회 쓰기) | 토글이 다시 보임 |
| M18 | changed + 부분 면적 경로(배율 초과 등) | — | — | 이력 미적용 + 고지(통합 Q-8 (가)) | 카드 `state_at_transfer` 분기 + warnings |

---

## 11. 테스트 · E2E 계획

### 11.1 vitest (UI 소관 — 엔진 anchor는 엔진 계획서)

- `__tests__/lib/stores/nbl-defaults-and-migrate-guards.anchor.test.ts`(기존 — **`NBL_DEFAULTS`↔factory `nbl*` 키·값 일치와 배열 새 인스턴스를 강제**) · `migrate-factory-parity.anchor.test.ts`(기존 — `migrateAsset`이 factory 키를 전부 채움) — 새 두 필드가 두 곳에 같이 들어가는지 이 둘이 잡는다. 추가 anchor: `migrateAsset({ nblOtherStateHistoryMode: "x", nblOtherStateEvents: [{ kind: "y", date: 1 }] })`가 `""`·행 수준 `""`로 접히는지(③ 행 방어) · `""`가 `unchanged`로 접히지 않는지.
- `__tests__/lib/calc/nbl-state-history-gates.anchor.test.ts`(신규) — `nblOtherStateHistoryApplies` 진리표(지목 6종 × 정밀판정 × 의제 × 연접 다필지) · **④ 전송 4분기**: 술어 거짓 → `mode ""`·`events []` / 참 + `unchanged`·`unknown` → **mode 유지**·`events []` / 참 + `changed` → 둘 다 · 연접 다필지 ON + stale `changed` 행 → 비워 보냄(⑫ 400 방지) · 파생 `nblOtherHasBuilding` 덮어쓰기(스프레드 뒤 순서 — 구 저장값 stale 방지) · `effectiveOtherHasBuilding`의 **6개 ⑤ 읽기와 ⑧ 2곳이 같은 값**(축 B가 아닌 단순 렌더로 확인).
- ⑧↔⑫ **격자 anchor**(신규 — 선례 `__tests__/calc/carryover-validate-parity.anchor.test.ts`·`transfer-land-part-cause.d1-4.predo.test.ts`의 «⑧ 차단 ⇔ ⑫ 400» 격자): §8.4 표를 그대로 격자로 — «⑫ 400이면 반드시 ⑧ 차단»(UI 통과→400 없음)을 단언하고, ⑧만 막는 칸(#1·#2·#6)은 허용 목록으로 명시한다. **축 B 지분 셀 1개 필수**: 지분 3 취득일 > 철거일인 raw가 ⑫ 통과(⑫ 하한 규칙 부재 anchor).
- `__tests__/lib/calc/nbl-other-land-section-render.test.tsx`(기존 확장 또는 신규) — 질문 3지선다 렌더·모드별 하위 칸 노출(§5.3-5 — **마지막 구간 기준**)·사건 행 추가/삭제·**철거 행에만 재산세 구분 라디오**·`""`이 «모름»으로 선택 표시·종류를 신축으로 바꾸면 값 `""` 리셋·미리보기 구간 일수 = 엔진 leaf 출력과 동일.
- 결과 카드: `__tests__/components/nbl2611-b3-result-card.anchor.test.tsx` 모양의 신규 `nbl-state-history-result-card.anchor.test.tsx` — echo 있음/없음(이력 복원) 분기·구간표·재산세 구분 열(`taxTypeSource` 4종 문구)·3기준 문구·**변수 약어/`floor` 미노출** 단언 · `changed`인데 엔진이 미적용(부분 면적·의제)이면 현행 `state_at_transfer` 분기 + warnings.
- **픽스처 기본값 함정**(`feedback_fixture_default_masks_gate_defect`): ⑧이 모드 `""`을 막으므로 기타토지를 ⑧까지 통과시키는 픽스처에 `nblOtherStateHistoryMode: "unchanged"`를 일괄로 넣는 공용 헬퍼를 쓰되, **모드 `""`로 막히는 부정 anchor 1건을 따로 둔다**(기본값이 게이트를 가리지 않게). **보정 규모 실측은 §18.3 P-3**(추정 «18파일»을 대체).
- **⑤ 읽기 6곳은 곳마다 render anchor 1건씩**(`:144` 토글 값 · `:176` 시가표준액·바닥면적 칸 · `:223` 복합용도 · `HoSection:60` 호별 게이트 · `BasisField:34` 근거 선택지 · `:72` 종전 바닥면적 칸) — §18.3 P-1이 6곳 중 5곳의 안전망이 0건임을 실측했다. 각 anchor는 `changed` + 마지막 사건 «신축»/«멸실» 두 상태에서 칸의 유무를 단언한다.
- 뮤테이션 확인(구현 후): 노출 술어를 ⑤만 바꿔 ⑧이 막다른 길을 만드는지 · ④ 덮어쓰기 순서를 뒤집으면 anchor가 깨지는지 · ⑫에 하한 규칙을 넣으면 축 B 셀이 깨지는지 · `consumesStateHistory`를 `true`로 고정하면 비소비 지목 anchor가 깨지는지.

### 11.2 E2E (시나리오별 1건 — 신규 `e2e/transfer-nbl-other-state-history.spec.ts`, 기존 `transfer-nbl-ptax-basis.spec.ts` 헬퍼 재사용)

| E2E | 시나리오 | 확인 |
|---|---|---|
| E1 | S1 철거 후 나대지 양도 | 질문 «바뀐 적 있음» → 멸실 1행 + 철거 직전 재산세 구분 «별도합산» → 미리보기 구간 2개 → 계산 → 요청 body `nonBusinessLandRaw.nblOtherStateEvents[0].propertyTaxTypeBefore` 도달(`page.waitForRequest` — 침묵 strip 방지) → 결과 카드 구간표·3기준 + «양도일 현재 상태 전 기간 적용» 고지 대체 |
| E2 | S2 신축 직후 양도 | 신축 1행 → 결과가 현행과 반대 방향 판정 |
| E3 | 모름 | 현행 결과 + 확인 필요 고지 유지 |
| E4 | ⑧ 오류 3종(미선택·역순·양도일 당일 이후) | 메시지 + **필드 점프**(해당 행 날짜 칸으로 포커스) — `validation-field-jump-cases-nbl.ts`. 케이스 헬퍼 `other()`(`:35`)에 `nblOtherStateHistoryMode: "unchanged"` 기본값을 넣어 기존 기타토지 케이스가 새 질문에 막히지 않게 한다 |
| E5 | 축 B 지분 상속 | 첫 카드 이력 입력 → 둘째 지분(취득일이 사건일보다 뒤)의 결과가 «철거 후 구간만» · **400이 아님**(⑫ 하한 규칙 부재) |
| E6 | 철거 직전 재산세 구분 «모름» | 결과가 현행과 같은 비사업용 + «종합합산(선언 없음 — 확인 필요)» 행 — 이 칸이 빠졌을 때 S1이 풀리지 않는다는 점의 화면 증거 |

외부 API 의존 없음(조회 버튼 미사용) — mock 불필요. 셀렉터는 testid·`RadioCardGroup`의 `radio` role 기준(e2e/CLAUDE.md §2) · 날짜는 `fillDateAndVerify` 헬퍼 + scope 한정(§1) · **셀렉터는 probe로 실측 후 확정**(§4). 기타토지를 고르는 기존 E2E 6개(`transfer-nbl-factory-land`·`transfer-nbl-ptax-basis`·`transfer-nbl-revenue-autofetch`·`transfer-nbl-revenue-deemed-common`·`nbl2611-c10-replacement-land-notice`·`transfer-dead-end-defects`)와 헬퍼 `validation-field-jump-cases-nbl.ts` — 총 7파일(`git grep -l other_land -- e2e` 실측) 중 «계산 버튼까지 가는» 스펙만 보정 대상이다(U1에서 각 스펙 정독으로 확정). 브라우저 수동 확인: 폼→계산→결과 + Network 탭 request body(DoD) — 구현 PR에서 수행.

---

## 12. PR 분할 (UI 범위)

> 엔진 계획서의 PR과 **시퀀셜**(루트 CLAUDE.md: 엔진이 타입·헬퍼·anchor를 선처리 → UI가 ⑤⑥⑦). 화면에 있는데 판정에 안 쓰이는 칸을 만들지 않는다(B1 사례) — 노출 PR은 엔진 판정 PR 뒤.

| PR | 내용 | 선행 | 위험 |
|---|---|---|---|
| E-a(엔진) | 공용 leaf(`other-land-state-history.ts`: 사건 → 구간 · issue · 라벨) + 입력 타입 + 소비표 `stateHistory` 열 + 문구 상수 | — | |
| **U0**(UI, 무화면) | ①②③ — `NblOtherFormSlice` 필드·`NBL_DEFAULTS` 2줄·factory 2줄·③ 행 방어 + 가드 anchor + `nbl-other-state-history-scope.ts`(술어·`effective…`·`stateHistoryFloorDate`) | E-a | 화면·⑧ 없음이라 **세액은 불변**이지만, ④ prefix-pick이 새 칸(`""`·`[]`)을 **즉시 요청 body에 싣는다** — 요청 raw를 `toEqual`로 고정한 테스트(`nbl-raw-to-engine-input` · `nbl2611-v6-pu01-companion-raw` 계열)가 바뀔 수 있어 U0에서 `vitest run __tests__/lib/calc __tests__/api` 범위로 실측한다(UV-19). ⑫ Zod가 아직 칸을 몰라 strip하므로 400은 없다 |
| E-b(엔진) | 판정(구간별 사업용 → `meetsPeriodCriteria`) + ⑫ Zod·refine + ⑭ 매퍼 + echo + 고지 문구 | E-a | |
| **U1**(UI, 화면 + ⑧ + ④) | ⑤ 위젯(질문·사건 행·**철거 행 재산세 구분**·미리보기)·읽기 6곳 교체·⑧ 규칙 #1~#8·④ 전송 4분기·덮어쓰기 + 렌더/게이트/격자 anchor + 기존 픽스처 일괄 보정(§11.1) | E-b, U0 | 픽스처 보정 규모는 §18.3 P-3 실측 · 필드 점프 케이스 · 기존 E2E 6파일 중 계산 도달 스펙 보정 |
| **U2**(UI, 결과) | ⑦ 카드·`NblStateHistoryPeriodBlock` + 카드 anchor | E-b(echo) | |
| **U3**(검증) | E2E 6건(E1~E6) + 브라우저 확인 + `ui-engine-sync-checker`(14지점) | U1, U2 | E2E 간헐 — 셀렉터 probe | ✅ **구현됨(§21)** — E2E는 6건이 아니라 U1·U2가 이미 덮은 E1·E6·UV-6을 빼고 10건(§21.1)

U1·U2는 한 PR로 합칠 수 있다(카드가 echo 없는 구 결과를 처리하므로 순서 무관). 800줄 점검(실측 줄 수 기준): `calc-wizard-asset-nbl.ts` 776 → 778(2줄 — ≥750 위험구간이라 U0에서 «기회주의적 분리» 판단, UV-9) · `calc-wizard-asset-nbl-other.ts` 163 → ≈190 · `OtherLandDetailSection` 421 → ≈440 · `NonBusinessLandResultCard` 437 → ≈452 · `transfer-tax-validate-nbl-other.ts` 219 → ≈245 · `OtherLandStateHistorySection`(신규) ≈200 · `NblStateHistoryPeriodBlock`(신규) ≈110.

---

## 13. 엔진 측에 요구하는 것

| # | 요구 | 이유(UI 소비처) |
|---|---|---|
| R1 | **입력 형태**: `mode: "" \| "unchanged" \| "changed" \| "unknown"` + `events: { kind: "building_built" \| "building_removed"; date: string; propertyTaxTypeBefore?: "" \| PropertyTaxType }[]`(ISO · **철거 행의 재산세 구분 — 통합 Q-3 (가), `""` = 모름**). 사건 → 구간 변환은 **엔진 공용 leaf**(`deriveOtherLandStateIntervals(events, ownershipStart, endDate)`)에 둔다 — 저장 모델이 구간 배열이어도 UI 입력은 사건이다 | ⑤ 미리보기 · ⑦ 구간표가 같은 leaf를 쓴다(입력 화면 구간 = 결과 판정 구간) |
| R2 | 첫 사건 종류가 취득 당시 상태를 정한다 · **지분별 소유기간으로 replay**(사건은 원본으로 재생하고 소유 시작 전 사건은 시작 시점 상태로 접는다 — 엔진 D2) | 별도 «취득 당시 유무» 질문 불필요 · 축 B 지분 |
| R3 | **구간 단위 판정 echo** `periodEvaluation: { basis: "state_history", stateHistory: { mode, intervals: [{ start, end, days, hasBuilding, effectiveTaxType, taxTypeSource, business: boolean }], … } }` — 기존 `PeriodEvaluationBasis`에 값 추가. **`taxTypeSource: "declared" \| "unknown_as_comprehensive" \| "bare_fixed" \| "tail"`** 를 더해 «종합합산(선언 없음 — 확인 필요)»와 «종합합산(신축 전 나대지 고정)»을 카드가 구분하게 한다(문자열 파싱 금지). 면적 일부만 사업용인 구간 표현은 **v1에 없다**(통합 Q-8 (가) — 그 경로는 이력 미적용) | ⑦ 구간표 — v3: `intervals` 한 벌만 쓴다(v2의 `taxBaseYears`는 폐기) |
| R4 | **3기준 수치 echo**: 소유기간 일수·버킷(1/2/3호) · 직전 5년·3년 창 길이와 그 창의 비사업용 일수 · 각 기준값(730·365·100분의 40에 해당하는 일수) · 각 목 충족 여부. 현재 `PeriodCriteriaResult`의 `bucketDetail`(`PeriodCriteriaResult.detail` — 문자열)·`ownershipBucket`·`bizInLast3/5`·`ratio`·`thresholdRatio`는 `period-criteria.ts` 내부 결과이고 `NonBusinessLandJudgment`에는 `criteria` 3 boolean·`periodEvaluation`만 있다(`types.ts:531·543` 확인; 카드가 읽는 것은 `totalOwnershipDays`·`effectiveBusinessDays`·`businessUseRatio`·`gracePeriodDays`·`criteria` 3 boolean뿐 — `NonBusinessLandResultCard.tsx:235-250`) | ⑦ 3기준 한국어 풀어쓰기(문자열 파싱 금지 — 구조화 필드로) |
| R5 | `mode=changed`이면 엔진이 `hasBuilding`을 **사건에서 파생**하고 raw `nblOtherHasBuilding`은 무시 — **⑫ refine(`transfer-tax-schema-nbl-refines.ts:191`)도 같은 파생을 쓴다**(R13) | 직접 API ↔ UI 단일 소스 |
| R6 | 공용 issue leaf(⑧·⑫ 공용): `stateEventRowIssue(row, index)`·`stateEventSequenceIssue(events, { floorDate?, transferDate })` — 결함 칸(`kind`/`date`/행)과 문구 반환. **`floorDate`는 선택 인자**: ⑧은 번들 최이른 취득일을 넘기고 ⑫는 넘기지 않아 하한 규칙(⑧ #6)을 건너뛴다(§6.2 — 늦은 지분 400 방지). 양도일 의제일 인자는 없다(Q-9 (가) — 의제와 동시면 이력 미적용). 문구 상수는 `nbl-validation-messages.ts` | ⑧ §8.1 #3~#8 · ⑫ |
| R7 | 소비표 `INPUT_CONSUMPTION.*.stateHistory` 열 + `consumesStateHistory(landType)` export | ④⑤⑧ 같은 술어 |
| R8 | 술어 export: `effectiveHasBuildingAtTransfer(history)`(= 마지막 사건 종류) · `isStateIntervalBusiness(interval)`(이전 구간 사업용 확정 표시용). ~~`hasBuildingInterval`·`hasBareInterval`~~ — **삭제**(하위 칸은 마지막 구간 기준 노출 — §5.3-5) | ⑤ 하위 칸 노출 · 미리보기 사업용 열 |
| R9 | 고지 문구 3종(`unchanged`·`unknown`·`changed` 후 남은 한계) — `nbl-confirm-notices.ts` 단일 소스. 「건축물 유무 외 이용 상태」 고지 포함 | ⑦·입력 안내 |
| R10 | ~~철거 근거의 «종전 바닥면적» 통합~~ — **불필요**(UQ-6 정밀화 — 마지막 구간 기준 노출이면 두 바닥면적이 동시에 필요한 상태가 없다. §5.3-5 실측). 엔진은 `nblOtherDemolishedFloorArea`·`nblOtherBuildingFloorArea`를 지금 그대로 둔다 | — |
| R11 | ~~`deemedTransfer`(양도일 의제)와 사건 범위의 관계~~ — **해소**(통합 Q-9 (가): 의제와 동시면 이력 미적용 + 고지). 엔진은 그때 `warnings`로 사유를 밝힌다(`basis`는 `state_at_transfer` 유지) | ⑧ 규칙 #9 삭제 |
| R12 | 법령 인용 상수는 `legal-codes`에서, **새로 인용하는 조문은 `lib/legal-verification/manifest/additions-*.ts`에도 등록**(루트 규칙 — 게이트 `legal-verification-coverage-complete`) | UI는 모달 prop 문자열만 쓴다 |
| R13 | **⑫ refine의 `hasBuilding` 파생**: `refineNonBusinessLandRaw`가 `mode=changed`이고 사건이 유효하면 raw `nblOtherHasBuilding` 대신 사건 파생값으로 `demolishedBasisIssue`를 부른다 | ⑧↔⑫ 일치 — 직접 API는 ④의 덮어쓰기를 거치지 않는다(§6.1) |
| R14 | 문구 상수 2종 — `propertyTaxTypeBefore` «모름» 행 안내 · DM-01 칸 «이력과 함께 판정» 안내(`nbl-confirm-notices.ts` — **Q-15 (가′) 이후 문구: «판정에 쓰이지 않음»이 아니다**). UI는 문구를 새로 짓지 않는다 | ⑤ §5.3-2·§5.3-7 |
| R15 | `changed` + 사건 0행의 ⑫ 계약(UV-18) — 권장: 400 아님(마지막 구간뿐 → 현행과 같은 판정 + 고지) | ⑧ #2 ↔ ⑫ parity |

---

## 14. 사용자 결정 UQ-n (선택지 + 추천 + 근거)

| # | 질문 | 선택지 | **추천** | 근거 | **결정(2026-11-22)** |
|---|---|---|---|---|---|
| UQ-1 | 질문(3지선다)을 필수로 할 것인가 | (가) 필수 — 미선택 ⑧ 차단 / (나) 미선택 = 현행 + 고지(차단 안 함) / (다) 토글 1개(바뀐 적 있음)만 | **(가)** | 「미입력 ≠ 미해당」 원칙(양방향 ±55,750,000이라 조용한 기본값이 위험). 별장 「사용 없음」 Q-12 (a)가 같은 방향으로 승인됨. **비용**: 기타토지 픽스처 테스트 18파일 + E2E 6~7파일 보정(UV-10 실측). (나)는 비용이 적지만 «묻지 않고 현행 적용»이 계속 남는다 | **승인 (통합 Q-5)** |
| UQ-2 | 입력 모델(화면 관점) | (A) 구간 / (B) 사건 / (C) 사건 + 미리보기 | **(C)** | §3.4 — 입력 칸·오류 종류·축 B·결과 카드와 같은 leaf. 엔진 저장 모델은 엔진 계획과 맞추되 입력은 사건 | **승인 (통합 Q-2)** — v3: «사건 → 일 단위 구간» 1단(접기 단계 없음) |
| UQ-3 | v1 사건 범위 | (가) 건축물 신축·멸실만 / (나) + 업종 개시·폐업(S4) / (다) + 호별 용도 변경 | **(가)** | (나)는 과세기간별 수입금액이 필요해 현 입력(당해·직전 2개 연도)으로 판정할 수 없다 — 입력 확대는 별도 계획. DM-01은 현행 유지. (다)는 호별 면적기준 칸이 구간별로 달라 모델이 폭증 | **승인 (통합 Q-4)** |
| UQ-4 | 「모름」 처리 | (가) 현행 + 확인 필요 고지 / (나) 혜택 불성립(비사업용 쪽) | **(가)** | 양방향이라 «혜택»이 방향마다 다르고 이력 없이는 비사업용으로 접을 구간을 정의할 수 없다. 법 근거 없는 불리 적용 금지. 기존 Q-4 (나) 승인과 같은 처리 | **승인 (통합 Q-6)** — **«모름 = 혜택 불성립» 원칙과의 긴장을 알고 승인**(Q-6) |
| UQ-5 | 축 B 지분에서 이력은 | (가) 땅 사실 — 첫 카드 값 상속, 지분별 소유기간으로 엔진이 replay / (나) 지분 카드마다 입력 | **(가)** | 지분 카드는 NBL 입력 화면이 없고(`AssetSectionExtras.tsx:72-74`) `buildFractionalShareNblRecord`가 땅 사실은 첫 카드, 지분 사실은 자기 값을 쓰는 규약. 건물 철거는 땅 전체의 사실. 단 «지분 취득일이 첫 카드보다 빠를 수 있는가»(UV-5) 확인 전에는 질문 라벨의 기준일을 확정하지 않는다 | **승인 (통합 Q-11)** — 사건은 원본 replay(엔진 D2). **정밀화(UV-5 해소)**: 첫 카드가 가장 이른 취득일이라는 보장이 없어(§1-9) ⑧ 하한을 «번들 최이른 취득일»로 하고 ⑫는 하한 규칙을 갖지 않는다(§6.2 · §8.1 #6) — 땅 사실 상속 방침은 그대로 |
| UQ-6 | 건축물 유무 파생값 vs 기존 토글 | (가) `changed`이면 토글 숨김 + 파생 표시, 철거 «종전 바닥면적» 칸을 건축물 바닥면적과 통합 / (나) 토글 유지 + 일치 검증 + 칸 둘 | **(가)** | (나)는 «이력은 철거로 끝나는데 토글은 있음»인 막다른 길을 사용자가 스스로 풀어야 하고 같은 사실을 두 번 입력한다. (가)는 단일 소스 + 3중 패턴 표(§6.1) | **승인 (통합 Q-12)** — **정밀화(자가 검토)**: 유지 = `changed`이면 토글 숨김 + 사건 파생 표시(입력 소스 하나). 바뀜 = «철거 종전 바닥면적과 건축물 바닥면적 통합»을 별도 병합(④⑧⑫⑭ 4층 파생)으로 하지 않고 **«마지막 구간 기준 노출»로 충족**한다 — 두 바닥면적이 동시에 필요한 입력 상태가 없다는 실측(§5.3-5). 사용자가 문자 그대로의 병합을 원하면 R10을 되살리고 §6.1에 `effectiveDemolishedFloorArea` 한 행을 더한다(비차단) |
| UQ-7 | 노출 지목 | (가) 기타토지만 / (나) + 주택부수토지·건물 부수토지 | **(가)** | 리뷰 Q-4는 «기타토지» 범위. 주택부수토지는 2026-07-31 방침을 Q-3a (나)로 «유예만 반영»까지만 좁힌 상태 — 이력 확대는 그 방침 재논의가 먼저(재제안 금지 목록 존중). 소비표에서 `other_land`만 true | **승인 (통합 Q-1)** |
| UQ-8 | 유예 9호(멸실 + 5년·2년)와 멸실 사건의 관계 | (가) 자동 채움 금지 — 안내 문구만(+ 불일치 확인 필요 고지는 엔진 선택) / (나) 멸실 사건이 있으면 9호 유예 행을 자동 생성 | **(가)** | 9호 유예는 «정당한 사유»를 사용자가 주장하는 입력이라 사건만으로 성립하지 않는다 — 자동 생성은 법 근거 없는 유리 적용. 두 날짜가 어긋나는 입력은 확인 필요 고지 | **승인 (통합 Q-10)** |
| UQ-9 | v1 상호배타 범위 | (가) 연접 다필지는 배타(질문 미노출) · 공장·복합용도·호별·수입금액비율은 양도일 현재 값 유지 + 고지 / (나) 모두 구간화 | **(가)** | 필지별 `hasBuilding`이 이미 모델에 있어 이중 정의. 나머지는 구간화 비용이 크고 사건 종류(UQ-3)와 함께 후속 | **승인 (통합 Q-13)** |
| UQ-10 | 철거 전 건축물 구간의 재산세 구분을 어떻게 받나 | (가) 철거 사건 행에 «철거 직전 재산세 구분» 선택 칸(모름 = 미선택 → 종합합산 + 확인 필요) / (나) 양도일 현재 선언을 그대로 적용 / (다) 건축물 있던 구간 = 별도합산 자동 간주 | **(가)** | 엔진 §3.4 — (나)는 철거 사례의 과대(+55,750,000)가 풀리지 않고 (다)는 선언 없는 유리 적용. 이 칸이 빠진 채 위젯을 만들면 S1이 화면에서 풀리지 않는다 | **승인 (통합 Q-3)** — 초판 UI 계획서에는 이 칸이 **전혀 없었다**(자가 검토에서 정정 — §18) |

---

## 15. 미검증 UV-n — 처리 현황 (2026-11-22 자가 검토 반영)

표기: ✅ 해소(근거 기록) · ⏳ 미해소 — **설계 영향 있음/없음**을 명시. 설계 영향 있는 ⏳가 남으면 해당 PR 착수 금지(스킬 게이트).

| # | 항목 | 상태 · 근거 | 남은 확인 |
|---|---|---|---|
| UV-1 | 소비표 새 열의 `consumes*` 소비처 전수 | ✅ **해소** — `git grep`: ④ `non-business-land-request.ts:159-163` · ⑤ `NblSectionContainer.tsx:278`·`GracePeriodSection.tsx:66`·`lib/calc/nbl-deemed-transfer-scope.ts:31` · ⑧ `transfer-tax-validate-nbl.ts:195` · ⑫ `transfer-tax-schema-nbl-refines.ts:124` · ⑭ `form-mapper.ts:150-176` · 엔진 `engine.ts:124-132·376`. 새 열(`stateHistory`)의 소비처는 ④⑤⑧⑫⑭ 5곳이고 열 추가 시 `InputConsumption` 인터페이스(`land-category.ts:104-109`)도 고친다(§1-8) | — |
| UV-2 | 면적 × 시간 이중축 | ✅ **해소(범위 밖)** — 통합 Q-8 (가): 부분 면적 경로는 이력 미적용 + 고지(세액 현행 유지). 카드에 «구간 안 일부 면적» 표현이 생기지 않는다(§7.1) · 재검토 신호(부동산납세과-68)는 엔진 E3 | — |
| UV-3 | 「신축」 사건 날짜의 법령상 의미(사용승인일·준공일·사실상 사용일) | ✅ **U1 라벨 확정(2026-11-23)** — 신축 행 날짜 hint = 「건축물이 있는 것으로 보는 첫날입니다. 사용승인일(준공일)과 재산세상 건축물로 보는 첫날이 다를 수 있습니다 — 확인 필요.」 (조문 번호를 새로 인용하지 않는다 → manifest 등록 없음 · 단정 문구 없음). 아래 근거 기록은 유지: **부분 해소 · 설계 영향 없음(라벨 문구만)** — 재산세 구분은 허가·사용승인을 받지 않은 건축물의 부속토지를 별도합산에서 빼고(지방세법 시행령 §101①단서), 건축허가 후 **공사에 착수한 건축물도 건축물에 포함**한다(같은 영 §103①3 — 과세기준일 현재 정당한 사유 없이 6개월 이상 공사 중단은 제외 · 본문 확인). 라벨은 U1 전 확정 — 확정 전에는 «건축물 신축일» 중립 표기, **본문에 없는 해석(사용승인일 단정)을 화면 문구로 쓰지 않는다** | U1 착수 전 라벨 확정(KoreanLaw MCP — 지방세법 시행령 §101·§103) |
| UV-4 | 사건일 = 양도일 · 양도일 의제 이후 사건 · 양도일 이후 사건 | ✅ **해소** — 사건일 ≥ 양도일은 마지막 구간 0일이라 ⑧·⑫가 차단(엔진 §3.6 — ⑧ #7). 의제(§168의14②) 동시 입력은 통합 Q-9 (가): 이력 미적용 + 고지라 의제일 이후 사건을 막을 필요가 없다(⑧ #9 삭제 — §8.1) | — |
| UV-5 | 축 B에서 첫 카드가 가장 이른 취득일인가 | ✅ **해소(실측)** — 보장 없음: `isFullFractionalBundle`(`transfer-tax-api-asset-basics.ts:165`)은 개수·분수 여부만 본다. 대응: ⑧ #6 하한 = 번들 최이른 취득일 · ⑫는 하한 없음 · 질문 문구 «이 토지(전 지분)가 소유되던 기간 중»(§8.3) | — |
| UV-6 | 축 B 지분별 판정 결과의 화면 표시(지분별 구간표) | ✅ **해소(실측 2026-11-23, U2 E2E 고정)** — 축 B 지분은 `aggregated.properties[]` 지분마다 `nonBusinessLandJudgmentDetail`(+`periodEvaluation.basis = state_history` echo)을 따로 갖고, 결과 화면 «자산별 계산 결과»에서 `BundledAllocationSubCards.tsx:167` → `ValuationDetailCards.tsx:114` → `NonBusinessLandResultCard`가 **지분 카드마다** 그려진다(단건은 `TransferTaxResultView.tsx:528` · 다건 `MultiTransferPropertyBreakdown.tsx:555`는 NBL 입력이 없어 해당 없음 — UV-7). 시료: 지분1(취득 2014-01-02)·지분2(취득 2020-01-01) 같은 철거 사건 → 지분1 구간 2,555일(별도합산)+1,249일 · 지분2 365일+1,249일 → 지분1 사업용·지분2 비사업용 각각 구간표 표시(`e2e/transfer-nbl-other-state-history-result.spec.ts`). 설계 변경 없음 | — |
| UV-7 | 다건(연간 합산)의 NBL echo 표시·입력 | ✅ **해소** — 다건 입력 화면에 NBL 섹션 마운트 0건(`git grep -l nblUseDetailedJudgment -- app components`) · 다건 ⑧(`multi-transfer-tax-validate.ts`)도 NBL 참조 0건 · 다건 결과뷰는 카드 미사용 → 질문·echo 소비처 모두 없음. 다건으로 온 폼의 `""` = 현행(⑫ 허용) | — |
| UV-8 | 「계산 결과 선택 출력」(8 결과뷰)에서 카드 구간표의 인쇄·PDF 반영 · print CSS 토글 | ✅ **해소(U3 실측 2026-11-23)** — 「전체 선택」 → `emulateMedia(print)` + A4 내용폭(718px)에서 구간표·기준 3행·판정 문구가 모두 보이고 표가 내용폭을 넘지 않는다(`overflow-x: visible`). `page.pdf()` → `pdftotext`로 실제 PDF에 구간 행·가·나·다목 충족 표시·판정 문구가 남는 것까지 확인(일회성 probe — 커밋 안 함: CI 러너에 poppler 보장 없음). mutation: `print:overflow-visible` 제거 → E2E 실패(`overflowX` auto) | — |
| UV-9 | `calc-wizard-asset-nbl.ts` 776줄 — 위험구간 | ⏳ **부분 해소** — 새 타입은 `calc-wizard-asset-nbl-other.ts`로 가고(§5.1) 이 파일은 `NBL_DEFAULTS` 2줄(776→778)뿐. ≥750 위험구간이라 U0에서 «기회주의적 분리» 판단. 이음매 후보(실측): `HouseEntry`(`:97`~`:522`)·`PresaleRightEntry`(`:523`~)는 NBL과 무관한 타입이라 옮길 수 있고 `export type {…}` 재수출로 import 경로를 유지한다(`:12-17` 선례). **설계 영향 없음** | U0 PR 시점 줄 수 재측정 |
| UV-10 | 테스트 보정 규모 · dedup 키 | ✅ **실측 반영** — dedup 키: `lib/storage/business-key.ts`에 `nbl` 0건. vitest·E2E 보정 규모는 **§18.3 P-3**(추정 «기타토지 픽스처 18 + E2E 6~7»을 실측으로 대체) | U1에서 필드 추가 후 재확인 |
| UV-11 | 철거 후 한시 지위(영 §103의2 — 철거ㆍ멸실 1년·빈집 3년) 판정 가능성 | 기록 — 본문 확인: 지방세법 시행령 §103의2 「과세기준일 현재 … 사실상 철거ㆍ멸실된 날부터 1년이 지나지 않은 …」(빈집 3년 · 허가·사용승인 없는 건축물·건축 용도 외 사용 제외 · 바닥면적 × §101② 배율). 판정 자동화는 사실 칸이 더 필요해 v1 제외(엔진 E3) — 이 계획 범위 밖. **설계 영향 없음** | — |
| UV-12 | 과거 건축물의 시가표준액·바닥면적 입력 | ✅ **해소(입력 안 받음)** — 이전 «건축물 있음» 구간의 배율·2%는 판정하지 않는다(엔진 V-5). 시가표준액·바닥면적은 **마지막 구간에 건축물이 있을 때만** 묻는다(§5.3-5). 철거 후 양도의 «종전 바닥면적»은 현행 근거 칸이 그대로 받는다 | — |
| UV-13 | 톤 선택(`amber`) | 기록 — `tones.ts` 의미표에 «시간 분해»가 없어 현행 «건축물 있음» ToggleCard와 같은 amber. **설계 영향 없음**(디자인 리뷰) | 디자인 리뷰 |
| UV-14 | 브라우저 입력 흐름·모바일 폭(375px) 행 레이아웃 | ⏳ **미수행 · 설계 영향 없음** | U3 Playwright 실측 |
| UV-15·16 | ~~과세연도 표 행 수·모바일 폭 / «같은 해 안 변화» 안내 위치~~ | **폐기**(v3 — 일 단위, §17.2) | — |
| UV-17 | `changed`일 때 «당해 사업개시일»(`nblRevenueCurrentBusinessStartDate`)의 전송 여부 — ④가 보내도 엔진이 DM-01을 건너뛰는지(엔진 Q-9) | ✅ **해소(2026-11-23)** — ④는 칸을 그대로 보낸다(prefix-pick). 엔진은 Q-15 (가′)로 건너뛰지 않고 이력과 함께 판정한다(E2). 안내는 엔진 상수 단일 소스. 이전 판정: ⏳ **설계 영향 없음(안내 문구만)** — 칸은 숨기지 않고 안내 ToneCard(§5.3-7) | 엔진 E2 anchor 확정 후 |
| UV-18 | `changed` + 사건 0행의 ⑫ 계약(R15) | ⏳ **미해소 · 설계 영향 있음(⑧ #2 ↔ ⑫ parity)** — 권장: ⑫ 400 아님. 400이면 ⑧도 막으므로 UI 모순은 없고 직접 API 계약만 다르다 | 엔진 시니어 결정 — **E-b 착수 전** |
| UV-19 | U0에서 요청 body에 새 칸(`""`·`[]`)이 실려 `toEqual` 테스트가 바뀌는지 | ⏳ **부분 실측 · 설계 영향 없음(테스트 보정)** — 두 필드를 `NBL_DEFAULTS`·factory에 심고 `nbl`·`non-business` 이름 필터로 174파일 2,053건 실행 → **0건 실패**(§18.3 P-4). 이름 필터 밖(`transfer-tax-api*` 등)은 미확인 | U0에서 `vitest run __tests__/lib/calc __tests__/api` 확대 실행 |

## 16. 재제안 금지·기결정 준수 확인

- 리뷰 §12.4 「재제안 금지」 — V5-G2(G-6)·Q-8 (가): 이 계획은 주택 split·§155⑳ 비사업용 파트·상가분 부수토지를 **건드리지 않는다**.
- 메모리 ⛔ 절: 「부분 비사업용 혼합 보상=합산 + 안내 현행 유지」(`project_partial_nbl_loss_offset_investigation`) · 「토지 카드 부수토지 지정지역 질문」 완결 · 「축 B 카드별 floor 합 ±수 원」 — 해당 없음.
- 「모름 = 혜택 불성립 + 확인 필요」는 이 축에서 **적용 불가 사유를 §4에 명시**(양방향·구간 정의 불가) — 위반이 아니라 적용 범위 판단이며 UQ-4로 사용자 확인을 요청한다. 단 **철거 사건의 «철거 직전 재산세 구분» 「모름」은 이 원칙을 그대로 적용한다**(모름 → 종합합산 = 혜택 불성립 + 확인 필요 — 통합 Q-3 (가)): 구간이 정의돼 있고 방향이 한쪽(과대 해소)뿐이기 때문이다.
- V-1 = 일 단위 · Q-14 폐기(v3) — 재제안 금지(통합 §7 · 이 문서 §17).
- 자동 안분 fallback 없음 · `useEffect → store` 미러링 없음(모드 전환 쓰기는 onChange) · ⑧ 동기화는 §6.1·§8.2.
- 주택부수토지 방침(2026-07-31)·Q-3a (나) 범위는 그대로(UQ-7).

---

## 17. V-1 결정 기록 — 일 단위(v3) · v2 «과세기준일 접기» 폐기 정리

> 판정 모델의 정의·법령·해석례 조사는 엔진 계획서 **§4A.2~§4A.3(조사 기록)·§4A.7(V-2 결론)** 과 §6 «일 단위» 열이 정본이다. 이 절은 **화면에서 무엇이 사라졌는지**만 적는다.

### 17.1 결정 경과

- v2(2026-11-22): 사용자가 V-1 = 과세기준일(6.1.) 단위로 결정 → 이 문서가 «과세연도 표»를 ⑤ 미리보기·⑦ 카드에 더했다.
- **v3(2026-11-22): 사용자가 V-1 = 일 단위로 재결정**(근거: 6.1. 상태를 일수에 배정하는 조문이 없고 해석례·재결례는 일 단위가 우세 — 서면법규과-16 «신축일부터 양도일까지» · 사전-2019-법령해석재산-0289 «존재하는 기간» · 국심2007부2520은 «전년도 과세기준일부터 기산» 주장을 배척). Q-14는 폐기 — **재제안 금지**.

### 17.2 화면에서 제거·정리된 것 (자가 검토 확인)

| 폐기·정리 | v2 위치 | v3 처리 |
|---|---|---|
| 과세연도 표(연·6월 1일 현재 건축물·소유일수·사업용?) | ⑤ 미리보기 표 2 · ⑦ 카드 와이어 | 삭제 — ⑤는 일 단위 사건 구간표 하나(§5.3-3) · ⑦은 일 단위 구간표 + 3기준(§7.2) |
| testid `nbl-state-history-tax-base-years`·`…-tax-base-year-{Y}` | §17.2·§17.3 | 삭제 — `nbl-state-history-intervals`·`…-interval-{i}`·`…-criteria`만 |
| «같은 해 안 변화는 판정에 쓰이지 않음» 고정 안내 · 사건 행 «과세기준일에 걸리지 않음» 배지 | §17.2 | 삭제(일 단위는 사건 하나하나가 판정에 쓰인다) |
| 6.1. 경계 쌍 E2E(E6 — 준공 2022-06-01/06-02) | §17.5 | 삭제 — 일 단위 임계 경계(엔진 §6 M8a/M8b — 준공 2022-01-01/01-02)는 엔진 anchor가 고정한다. 화면 E2E는 §11.2 6건 |
| UV-15(과세연도 표 행 수·모바일 폭) · UV-16(같은 해 안내 위치) | §15 | 삭제(§15 표 끝에 «폐기» 줄) |
| R13~R15(v2: `taxBaseYears[]`·판정 단위 고지 1줄·«6.1.에 걸림» 플래그) | §17.4 | 삭제 — 번호는 새 요구(R13~R15)로 재사용 |
| 고지에 «과세기준일 현재 상태 단위 — 법령 직접 규정 없음» 한 줄(Q-7 확장) | §17.3 | 쓰지 않는다(통합 Q-7 문구 정정 요청 — 통합 문서 §5 Q-7 «결정» 열에 아직 남아 있다) |
| 후속 Q-14 14-1~14-4 | §14·§17.1 | 폐기 |

### 17.3 근거 자료로 남긴 것

- UV-3·UV-11의 법령 본문 확인(지방세법 시행령 §101①단서·§103①3·§103의2 — 이 기록은 6.1. 모델과 무관하게 «신축 날짜의 의미»·«철거 후 한시 지위»의 사실이다) — §15에 그대로 둔다.
- 철거 사건 라벨·힌트 문구는 영 §168의6 **일수 계산** 본문(「기간의 계산은 일수로 한다」)을 따른다.


---

## 18. 자가 검토 기록 (2026-11-22 · 깊이 L3 · 스킬 `plan-design-self-review-loop`)

> base `origin/master` `0972e2618`. 검토 대상 = 이 문서 + 통합 계획서(읽기) + 엔진 계획서(읽기). 코드 수정 0 · probe는 scratchpad 복사본에서만(워크트리 무변경).

### 18.1 검토 표 (정정 건수 — 오류/누락/모순/정책위반/개선/UI누락)

| # | 카테고리 | 우선순위 | 위치 | 문제 | 정정 |
|---|---|---|---|---|---|
| F-1 | 누락·모순 | **Critical** | §3 전제 · §5.2 · §6.1 · §7.2 · §8 | 통합 §1 결정 `propertyTaxTypeBefore`가 UI 문서에 **전혀 없었다**(①②③④⑤⑦⑧⑫ 전부). 초판 §3 전제(«구간 사업용 여부 = 건축물 유무 + 현행 칸»)가 엔진 §3.4로 반증됨 — 이 칸 없이는 S1(철거 후 양도)이 화면에서 풀리지 않는다 | §3 전제 정정 · §5.2 필드 · §5.3-2 «모름» 포함 라디오 · §6.1 4층 일치 · §7.2 재산세 구분 열 · §8.1 #11 · UQ-10 · E1·E6 · R1·R3 |
| F-2 | 정책위반(막다른 길) | High | §6 ④(b) · §2.2 | ④ 전송 비움을 «소비표 지목 열»만으로 함 → 연접 다필지로 질문이 숨은 뒤 stale `changed`·잘못된 행이 전송돼 ⑧은 건너뛰고 ⑫는 400 | ④·⑧·⑤ **같은 전체 술어** `nblOtherStateHistoryApplies`(§2.2) · M10 |
| F-3 | 오류 | High | §6 ④(b) | «모드≠changed면 mode도 비워 전송» — `unchanged`의 좁힌 고지·`unknown`의 확인 고지가 엔진에서 사라짐(엔진 §4.3은 모드로 가른다) | mode 유지·events만 비움(4분기) |
| F-4 | 모순(⑧↔⑫) | High | §8.1 #6 · §8.3 | ⑫가 ⑧을 미러하며 «사건 < 소유 시작» 규칙을 갖게 되면 축 B 늦은 지분 raw(지분 취득일 > 철거일, 엔진 M14)가 **400**. 컴패니언 스키마가 지분 raw마다 같은 refine을 돌림(`transfer-tax-schema-companion.ts:283`) | ⑫ 하한 규칙 없음 · ⑧ 하한 = 번들 최이른 취득일 · 격자 anchor(§8.4) |
| F-5 | UI누락(판정 안 쓰는 칸) | High | §5.3-5 · R8 · R10 | `hasBuildingInterval`/`hasBareInterval` 노출·바닥면적 통합 — 엔진은 마지막 구간만 현행 칸으로 판정(V-5·V-6) → 쓰이지 않는 칸 | 마지막 구간 기준 노출 · R8 축소 · R10 불필요(UQ-6 정밀화) |
| F-6 | 정책위반(3중 패턴) | High | §6.1 ⑫ 행 | ⑫ `:191`이 raw `nblOtherHasBuilding`을 읽음 — 직접 API는 ④ 덮어쓰기를 안 거쳐 ⑧과 어긋남 | R13 |
| F-7 | v2 잔존 | High | §3.3 · §5.3-3 · §7.2 · §11 · §14 UQ-2 · §15 UV-4/15/16 · §17 · R3·R13~R15 | 과세연도 표·접기·6.1. 경계 E2E·Q-14 서술 | 전부 제거(§17.2 표) — 근거 기록만 §17.3 |
| F-8 | 누락 | Medium | §5.3 | `changed`일 때 «당해 사업개시일» 칸 hint가 판정에 쓰인다고 약속하는데 엔진은 DM-01을 건너뜀 | §5.3-7 안내 · UV-17 |
| F-9 | 누락 | Medium | §7.2 | 유예 가산 표기·재산세 구분 출처(`taxTypeSource`)·미적용 사유 분기 없음 | §7.1·§7.2 보강 · R3 |
| F-10 | 오류(인용) | Medium | §1-5 · §5.1 · §6 ②③⑧ · §8.1 · §9 · §15 | «9곳»→**11곳** · `calc-wizard-store.ts:362`(정의 `:317`) · `validate-nbl-other.ts:21`→`:19` · `land-category.ts:111-119`→`111-120`+인터페이스 · `schema-nbl.ts:209-213`→`lib/api/…:208-211` · ④ `:166-`→`:183` · ② 가드 테스트 오지목(`migrate-factory-parity`→`nbl-defaults-and-migrate-guards`) · `⑤⑧⑩`→`④⑤⑧` · UV-5 `transfer-tax-api-helpers.ts:128`→`…asset-basics.ts:165` · FieldCard `:149-171` · e2e helper `:35` | 각 위치에서 정정 |
| F-11 | 개선(단일 사용 추상화) | Medium | §6 ① | 새 슬라이스 파일 — `AssetForm`은 이미 `NblOtherFormSlice`를 extends | 기존 슬라이스에 추가 |
| F-12 | 누락(사실) | Medium | §6 ③ | `fillMissingFromFactory`(`migrate.ts:668`)가 칸 없음을 자동 처리함을 모르고 normalize를 설계 | 행 수준 방어만 |
| F-13 | 정책위반(UI 순서) | Medium | §6 ⑧ | 새 ⑧ 규칙을 «파일 끝»에 → 첫 오류 순서가 화면(질문이 맨 위)과 반대 | 지목 게이트 직후 |
| F-14 | UI누락 | Medium | §5.3-5 | 「재산세 과세 분류」와 철거 행 «철거 직전 재산세 구분»이 같은 말로 읽힘 | 라벨 «(양도일 현재)» |
| F-15 | 오류(함정) | Medium | §5.2 | enum 이름과 라벨이 뒤바뀜(`separate`=별도합산 · `special_sum`=분리과세) | 라벨 단일 소스 명시 |
| F-16 | 누락 | Low | §8.1 #7·#9 | 사건일 = 양도일 취급 미정(UV-4) · 의제 이후 사건 차단 규칙 | #7 «당일 포함» · #9 삭제(Q-9) |
| F-17 | 누락 | Medium | §12 U0 | «동작 불변»이라지만 ④ prefix-pick이 새 칸을 즉시 body에 실음 | UV-19 · p4 실측(§18.3) |
| F-18 | 개선 | Medium | §11.1 | ⑧↔⑫ 격자 anchor 선례(`carryover-validate-parity`) 미활용 | 격자 anchor 추가 |
| F-19 | 개선 | Low | §8.3 | 이월과세 시나리오 B · 다건 · 의제 동시 · 마지막 구간 건축물 유무별 행 없음 | 행 추가 |

정정 19건(Critical 1 · High 6 · Medium 10 · Low 2).

### 18.2 판정 뒤집힘 (초판 판정 정정 — 조용히 고치지 않고 명시)

1. **«구간의 사업용 여부는 건축물 유무 + 현행 입력 칸으로 충분하다»**(초판 §3 전제)는 **불완전했다.** 근거: 엔진 §3.4 — 양도일 선언(나대지 = 종합합산)을 철거 전 구간에 쓰면 비사업용으로 남아 S1이 안 풀리고, 별도합산 자동 간주는 선언 없는 유리 적용. ⇒ 철거 사건에 `propertyTaxTypeBefore` 칸(통합 Q-3 (가) 승인)을 UI 전 지점에 반영.
2. **«하위 칸을 `hasBuildingInterval`/`hasBareInterval`로 노출하고 두 바닥면적을 통합»**(초판 §5.3-5 · R8 · R10)은 **틀렸다.** 근거: 엔진은 마지막 구간만 현행 칸으로 판정하고(엔진 §3.1 · V-5 · V-6) `propertyTaxBasisOptions`·`requiresDemolishedFloorArea`·⑧ `:60`이 모두 «마지막 구간 건축물 유무»로만 칸을 요구한다(§5.3-5 실측). ⇒ 마지막 구간 기준 노출. **유지**: `changed`이면 토글 숨김 + 사건 파생(Q-12 (가)의 핵심). **바뀜**: «두 칸 병합» 문자 그대로는 불필요 → UQ-6 정밀화로 사용자 확인 요청(비차단).
3. **«④는 모드≠changed면 mode도 비워 전송»**(초판 §6 ④)은 **오류**였다 — `unchanged`·`unknown` 고지 분기가 사라진다. ⇒ mode 유지·events만 비움.
4. **«⑫는 ⑧ 규칙을 같은 leaf로 미러»**(초판 §8.1 머리)는 #6(하한일)에서 **틀렸다** — 축 B 늦은 지분이 400. ⇒ #6은 ⑧만.
5. **«UV-5: 첫 카드가 가장 이른 취득일일 것»**의 암묵 가정은 **보장이 없다**(`isFullFractionalBundle`이 순서를 안 본다). ⇒ ⑧ 하한 = 번들 최이른 취득일.
6. 초판 §1-5 «9곳»은 **합산 오류**(11곳).

### 18.3 mutation probe (착수 전 안전망 실측)

방법: 워크트리를 건드리지 않고 `rsync` 복사본(scratchpad)에서 한 번에 한 가지만 무력화 → `npx vitest run __tests__/calc/ __tests__/components/`(1,840파일 · 21,731건). 기준선(무변경)에서 4건 실패(복사본에 `e2e/`가 없어 `e2e/_helpers/…` import 실패 — 비교에서 제외). **측정 환경의 load average가 100을 넘어 무관한 파일 다수가 `STACK_TRACE_ERROR`·타임아웃으로 흔들렸다** — 아래 수치는 그 잡음(P-1 10건 · P-2 32건 · P-3 32건, 전부 judgment-calculator·surcharge-simulation·gb-bg-carryover 등 NBL 무관 파일)을 제외하고 **NBL·검증 관련 단언 실패만** 센 값이다. 잡음 파일의 재현 여부는 확인하지 않았다.

| P | 무력화 | 결과 | 해석 |
|---|---|---|---|
| P-1 | ⑤의 «건축물 있음» 직접 읽기 **6곳 전부**(`DetailSection:144·176·223` · `HoSection:60` · `BasisField:34·72`)를 `false`로 | **1건 / 1파일** — `nbl2611-d2-ptax-basis.anchor.test.tsx` «별도합산 + 건축물 있음: 근거를 묻지 않는다»(= `BasisField:34`만) | 🔴 나머지 **5곳은 안전망 0건** — `changed`에서 6곳을 `effectiveOtherHasBuilding`으로 바꾼 뒤 «건축물 있음 칸 노출»·«호별 게이트»·«종전 바닥면적 칸»을 고정할 **신규 render anchor 필수**(§11.1) |
| P-2 | ⑧ 기타토지 «건축물 있으면 바닥면적 필수»(R06, `validate-nbl-other.ts:60`) 삭제 | **3건 / 1파일** — `ui-review-batch2.anchor.test.ts`(미입력 차단·0 차단·메시지) | 계약 실재 — 파생 helper로 바꿀 때 이 3건의 의도(건축물 있음일 때 차단)를 먼저 읽는다 |
| P-3 | ⑧에 «모드 `""` 차단»을 심음(= UQ-1 구현의 최소형) | **43건 / 7파일**(calc·components 범위) — `nbl2611-d3-damok-options` 15 · `nbl2611-d2-ptax-basis-validate` 8 · `nbl2611-b1-validation` 7 · `nbl2611-b4-damok-ho` 5 · `nbl2611-d1-pipeline` 4 · `ui-review-batch2` 3 · `nbl-stale-period-rows` 1 | UQ-1 보정 규모 **실측**: «기타토지 픽스처 18파일» 추정을 **calc·components 범위 7파일·43건**으로 대체. `__tests__/lib/`·`__tests__/api/`의 기타토지 테스트(`nbl-detailed-cases`·`nbl-pr1-gates` 등 — grep상 `nblOtherPropertyTaxType` 18파일의 나머지)는 이번 범위 밖이라 **미실측** — U1에서 범위 확대 실행. E2E는 `git grep -l other_land -- e2e` 7파일(헬퍼 1 + 스펙 6)이 상한 |
| P-4 | (뮤테이션 아님) 새 두 필드를 `NBL_DEFAULTS`·factory에 심고 ④가 body에 싣게 한 뒤 `nbl`·`non-business` 이름 필터 실행(U0 시뮬레이션) | **0건** — 174파일 2,053건 통과 | U0의 «세액 불변 · 테스트 깨짐 없음»이 이름 필터 범위에서는 확인됨. 필터 밖(`transfer-tax-api*` 등) 미확인 → UV-19 |

**구현 후 대응 mutation(계획)**: 

| P | 무력화 대상 | 실패해야 할 anchor |
|---|---|---|
| P-5 | `nblOtherStateHistoryApplies`에서 `!nblOtherUseParcels` 제거 | 게이트 진리표(연접 다필지 행) · ④ 4분기 |
| P-6 | ④에서 `unchanged`일 때 mode까지 비움(초판 오류 복원) | ④ 4분기의 «mode 유지» 셀 |
| P-7 | ⑫ refine에 하한 규칙 추가 | §8.4 격자의 축 B 지분 셀 |
| P-8 | `effectiveOtherHasBuilding`을 ⑤ 6곳 중 1곳에서 저장값으로 되돌림 | 신규 render anchor(곳마다 1건 — P-1이 보인 0건 구멍) |
| P-9 | ④ 파생 덮어쓰기를 스프레드 앞으로 | 덮어쓰기 순서 anchor |
| P-10 | `consumesStateHistory`를 `true` 고정 | 비소비 지목 anchor |
| P-11 | ③ 행 방어 제거 | 허용값 밖 mode·행 복원 anchor |

### 18.4 UV·V 현황 (§15 상세)

- 해소: UV-1 · 2 · 4 · 5 · 7 · 10(dedup 키 + 보정 규모 실측) · 12.
- **미해소 · 설계 영향 있음**: **UV-6**(축 B 지분별 구간표 표시 — ⑦ 한정, U2 착수 전) · **UV-18**(`changed` + 0행의 ⑫ 계약 — 엔진 결정, E-b 착수 전).
- 미해소 · 설계 영향 없음: UV-3(라벨 문구) · UV-8 · UV-9 · UV-13 · UV-14 · UV-17 · UV-19.
- 폐기: UV-15 · UV-16.
- 사용자 확인(비차단): **UQ-6 정밀화**(두 바닥면적 «통합» 문자 그대로 대신 마지막 구간 기준 노출).

### 18.5 통합·엔진 문서 정정 요청 (이 문서는 읽기만 했다 — 반영은 정본 담당)

통합 `nbl-other-land-state-history.plan.md`:
1. §0 «추천 모델»(18행) «② 과세기준일(6.1.) 현재 상태로 접어 과세연도 버킷(`foldStateToTaxBaseYears` — V-1 결정)으로 판정한다» → «② 그 일 단위 구간을 그대로 `meetsPeriodCriteria`에 넣는다».
2. §0 «V-1 결정의 모델(§2-1)»(19행)·«⚠️ V-1 근거 상태(§6)»(21행) → 삭제(v3 우선 규칙이 이미 폐기를 선언하나 본문이 남아 읽는 사람을 오도).
3. §1 표 «판정 단위(V-1)» 행(30행) → «일 단위(v3)»로 바꾸거나 삭제.
4. §2(43~52행) 흐름의 ② 취소선 아래 «각 소유일 d → 과세연도 Y(d)의 6.1. …» 3줄과 «echo … 과세연도 표 `taxBaseYears[…]`»(52행) → 삭제.
5. §3 표 ⑤(64행)·⑦(66행)·⑭(70행): «사건 구간표 + 과세연도(6.1. 현재) 표» · «과세연도 표(연도·6.1. 현재 상태·…)» · «접기는 판정 leaf가 한다» → v3 문구.
6. §3 표 ①②③(62행): «새 슬라이스 파일» → «기존 `calc-wizard-asset-nbl-other.ts`에 추가 · `calc-wizard-asset-migrate-nbl.ts`는 **이미 있는 24줄 파일**에 행 방어만(칸 없음 처리는 `fillMissingFromFactory`가 자동)».
7. §3 표 ④(63행) 아래에 전송 규칙 한 줄 추가: «전체 술어(`nblOtherStateHistoryApplies`)가 거짓이면 `mode ""`·`events []`, 참이고 `unchanged`/`unknown`이면 mode 유지·events `[]`».
8. §3 표 ⑧(67행) «사건 행·순서 검증 10종» → «규칙 #1~#8 + #11(철거 구분 무규칙) · #9 삭제(Q-9) · #6 하한 = 번들 최이른 취득일(⑧만)»; ⑫(69행) «사건 오류만» → «**하한 규칙 제외** + `hasBuilding` 파생(UI R13)».
9. §4 PR 표: E0 ①(75행) «경계 6쌍이 일 단위와 갈라지는 지점을 상수로 고정» · U2(81행) «과세연도 표 + «같은 해 안 변화» 안내» · U3(82행) «6.1. 경계 E2E 1건» → v3(E2E는 UI §11.2의 6건). U1(80행) «기타토지 픽스처 테스트 상한 18파일 · E2E 6~7파일 — UV-10 미실측» → «calc·components 7파일 43건 실측(UI §18.3 P-3) · E2E 헬퍼 1 + 스펙 6».
10. §5 Q-2(94행) «V-1로 구간 변환 → 6.1. 접기 2단이 됨» · Q-7(99행) «문구에 «과세기준일(6.1.) 현재 상태 단위» 한 줄 추가(V-1)» · Q-11(103행) «V-1에서 …» → v3 문구(Q-7 한 줄은 **쓰지 않는다**).
11. §5 Q-12(104행): «철거 «종전 바닥면적»과 건축물 바닥면적 통합» → «마지막 구간 기준 노출로 충족 — 병합 파생 없음(UI §5.3-5 실측)».
12. §6 V-1 줄(124행) → v3 상태로.
13. §8 다음 단계 번호(3 누락).

엔진 `…engine.plan.md`:
14. §1.1 «`fullPeriod` 8곳» → 호출 **7곳**(`other-land.ts:300·319·368·403·459·526·696` — 확인; 엔진 문서 자신의 나열도 7개).
15. §5 표의 신규 leaf 목록 «`calc-wizard-asset-migrate-nbl.ts`» → 이미 존재(24줄) · «`calc-wizard-asset-nbl-state-history.ts`» → 만들지 않는다(UI §5.1).
16. §5 ⑫′ «⑧과 같은 leaf·같은 문구»에 **#6 하한 제외·`floorDate` 선택 인자**(UI R6) · **⑫ `:191`의 `hasBuilding` 파생**(R13) · **`changed` + 0행 계약**(UV-18) 추가.
17. §3.6 «사건일이 취득일 이전: 클립 · 첫 카드 소유기간 기준으로는 차단» → «⑧: 번들 최이른 취득일 기준 차단 · ⑫: 규칙 없음».
18. §5 ⑫ 행: 사건 **행 스키마**에 `propertyTaxTypeBefore` enum(`""` 허용)을 명시(중첩 칸 침묵 strip).
19. §0 «V-1 결정» 행·§3.5 변환 행·§4.1~4.3·§4A.4~4A.6·§6 «(가) 역년» 열·§7.1 Anchor 1·§7.2 E1·E2(접기 서술) — v3 정리는 엔진 검토자 소관(UI 문서는 §6 «일 단위» 열만 인용).

### 18.6 verdict

**`needs-fix`** — 이 문서 안의 지적 19건(Critical 1 · High 6 포함)은 이번 정정으로 해소했다. 그러나 (a) **UV-6(⑦ 한정)·UV-18(엔진 결정)** 이 설계 영향 있는 미해소이고 (b) **통합·엔진 문서에 v2 서술과 위 정정 요청 19건이 남아** 정본과 어긋난다 — 스킬 게이트상 `clean`이 아니다. 진행 순서 권고: 통합·엔진 정정(18.5) → UV-18 결정 → E0 anchor → U0. UV-6은 U2 착수 전에 닫으면 U0·U1은 막지 않는다. blast-radius 재검토: 정정이 바꾼 이름(`nblOtherStateHistoryApplies`·`effectiveOtherHasBuilding`·R13~R15·§5.3-7·§8.4·UQ-10·UV-17~19)과 폐기 이름(`taxBaseYears`·`fold…`·`hasBuildingInterval`·`hasBareInterval`·Q-14)을 문서 전체에서 grep해 참조처를 대조했고 신규 지적은 0건이었다(미해소 참조 없음).


---

## 19. 구현 기록 — U0 · U1 (2026-11-23 · 브랜치 `feat/nbl-state-history-u1`)

> 계획서(이 문서)와 달라진 점·확정한 점만 적는다. 14지점 점검표·mutation 표는 PR 본문.

### 19.1 달라진 점 (조용히 고치지 않고 명시)

1. **§5.3-7 DM-01 칸 안내 · R14 · M15 · UV-17** — Q-15 (가′) 이후 틀린 «`changed`일 때 DM-01을 건너뜀 / 이 날짜는 판정에 쓰이지 않음»을 정정했다(§5.3-7). 화면은 엔진 상수 `NBL_STATE_HISTORY_REVENUE_START_NOTICE`(이력과 함께 판정)를 그대로 보인다.
2. **미리보기 «사업용?» 열 → «사업용 토지 요건(건축물·재산세 구분)»** — 이전 구간의 사업용 여부는 core 자체 사업기간(DM-01 · 3호 · 다목 호 인정)이 (가′)로 더해지므로 화면이 «비사업용»이라고 단정하면 틀릴 수 있다. 열 이름을 «사업용 토지 요건»으로 바꾸고 값을 «충족/미충족(건축물·재산세 구분 기준)»으로만 보이며, 마지막 구간은 «결과 계산 후 확정», 표 아래에 «소유기간 전체의 비사업용 여부는 계산 결과에서 확정» 고지를 둔다.
3. **파일 배치** — 술어 `nblOtherStateHistoryApplies`·`effectiveOtherHasBuildingOf`·`stateHistoryWireFields` = `lib/calc/nbl-other-state-history-scope.ts`(서버 모듈 `non-business-land-request.ts`도 import — React import 금지) · 미리보기 = `lib/calc/nbl-other-state-history-preview.ts` · ⑧ = `lib/calc/transfer-tax-validate-nbl-state-history.ts`(`stateHistoryFloorDate` 포함 — React 컴포넌트를 import하는 `transfer-tax-api-asset-basics`를 쓰므로 서버 모듈과 분리). 위젯 = `OtherLandStateHistorySection.tsx`(`OtherLandDetailSection`에 마운트 1곳).
4. **노출 술어에 «정밀판정 ON» 포함** — `nblOtherStateHistoryApplies` = `nblUseDetailedJudgment ∧ consumesStateHistory(지목) ∧ ¬연접 다필지`. `validateNblOtherLand`는 정밀판정 ON일 때만 도달하므로 동치이고, 정밀판정 OFF 직접 호출 픽스처가 질문에 막히지 않는다(픽스처 보정 범위가 계획 실측 43건보다 줄었다 — §19.3).
5. **⑧ ctx** — `validateNblDetailedJudgment`에 4번째 인자(`{ floorDate, skip }`) · `validateNblOtherLand`에 3번째 인자. `skip` = 축 B 둘째 이후 지분 카드(질문이 첫 카드에만 있다). 하한일 = `stateHistoryFloorDate(form, asset)`(번들 최이른 취득일).
6. **④ 파생 `nblOtherHasBuilding` 덮어쓰기** — `nblOtherStateEventsInUse`일 때만. 숨은 토글값이 모순돼도 사건이 이긴다(⑫·⑭와 같은 `effectiveOtherHasBuilding` leaf). 신축 행의 stale 철거 직전 구분은 와이어에서 `""`로 정규화한다.
7. **«건축물 유무 직접 읽기 11곳»** — ⑤ 6 · ⑧ 2는 U0에서 `effectiveOtherHasBuildingOf`로 교체. ⑫ 1 · ④ 서버 매퍼 2는 **E2가 이미 `effectiveOtherHasBuilding` leaf로 교체**했다(U0 재확인: `git grep nblOtherHasBuilding` — 남은 직접 읽기는 쓰기 1곳(토글 onChange)과 슬라이스 정의뿐).

### 19.2 확정 문구 (UV-3 포함)

- 신축 행 날짜 hint: 「건축물이 있는 것으로 보는 첫날입니다. 사용승인일(준공일)과 재산세상 건축물로 보는 첫날이 다를 수 있습니다 — 확인 필요.」 · 철거 행: 「건축물이 없어진 첫날(멸실·철거·붕괴일)입니다.」
- ⑧ #1: `STATE_HISTORY_MODE_REQUIRED_MESSAGE`(`nbl-validation-messages.ts` — ⑧ 전용).

### 19.3 픽스처 보정 (⑧ #1이 모드 `""`을 차단 — 통합 Q-5)

실측 12파일 83건(최초 실행)이 새 ⑧에 반응했다. 의도 보존 보정은 PR 본문 표. E2E 헬퍼 1 + 스펙 3(`transfer-nbl-ptax-basis` · `transfer-nbl-revenue-deemed-common` · `transfer-dead-end-defects` · `nbl2611-c10`)에 «바뀐 적 없습니다»(또는 seed `unchanged`)를 더했다. 모드 `""` 차단 부정 anchor는 별도 유지(`nbl-state-history-u1-validate-parity` #1 · `nbl-state-history-gates`).

---

## 20. 구현 기록 — U2 ⑦ 결과 카드 (2026-11-23 · 브랜치 `feat/nbl-state-history-u2`)

- **UV-6 해소**: §15 UV-6 행. 설계 변경 없음.
- **신규** `components/calc/NblStateHistoryPeriodTable.tsx` — 입력은 엔진 echo(`periodEvaluation.stateHistory`)뿐. 구간표(시작~종료 전날·일수·건축물·재산세 구분(`PROPERTY_TAX_TYPE_LABEL` · «모름» = «종합합산(모름 — 확인 필요)»)·사업용 일수·사업용 여부) + 유예 가산 행(`gracePeriodDays > 0`) + 소유기간 합계 행 + 영 §168조의6 기준(소유기간 버킷 제1~3호 · 가목 · 나목 · 다목(3호는 40% 기준이 나목) 각각 충족/미충족 · 버킷에 없는 목은 행 없음 · 3호 단서(소유 2년 미만)는 가목 없음). 카드는 `<ToneCard tone="sky">` · 숫자 칸 `font-mono tabular-nums text-right` · 접힘 없음(v3 «접기 삭제» — 표가 구간 수만큼만 길어진다).
- `NonBusinessLandResultCard.tsx`(437 → 448줄) — `basis === "state_history"`이면 위 블록을 그린다. 고지는 기존 «주의사항»(엔진 `warnings`)이 맡고 블록은 문구를 새로 짓지 않는다 · 이력이 판정을 뒤집은 사유는 배너의 `judgmentReason`(엔진 문구)이 이미 보인다.
- **«100분의 N»**: echo에 비율이 없어 `limitDa`(= floor(소유일수 × N ÷ 100))에서 40/20을 되짚는다. 가릴 수 없으면 비율 문구를 생략한다 — 엔진 수정 없음.
- **변경 없음(확인)**: 카드 사용처는 단건·지분·합산 하위 카드 한 경로(`ValuationDetailCards`)뿐 — PDF·이력 저장 뷰에 별도 카드 경로 없음(grep).
- 테스트: `__tests__/components/nbl-state-history-result-card.anchor.test.tsx`(14건 · 엔진 `E2_ROWS` 실결과 렌더) · `e2e/transfer-nbl-other-state-history-result.spec.ts`(2건 — 단건 + UV-6 지분 2장 · 라이트/다크 대비 · 375px 가로 스크롤 없음).

---

## 21. 구현 기록 — U3 마무리 검증 (2026-11-23 · 브랜치 `test/nbl-state-history-u3`)

### 21.1 E2E (신규 `e2e/transfer-nbl-other-state-history-u3.spec.ts` 10건 — 로컬 전건 통과)

§11.2 목록과 대조해 **U1·U2 스펙이 이미 가진 것은 만들지 않았다**: E1(철거 후 양도)·E6(철거 직전 «모름»)은 `transfer-nbl-other-state-history.spec.ts`, UV-6(지분 2장 구간표)은 `…-result.spec.ts`. 기존 ⑧ 필드 점프 격자(`validation-field-jump-cases-nbl.ts` 7건)는 **시드한 폼**으로 점프만 본다 — 이 스펙은 **사건 행을 화면에서 입력해** 오류를 만들고 고치는 흐름을 본다(중복 아님).

| # | 시나리오 | 확인 |
|---|---|---|
| E2 | 신축 직후 양도(나대지 → 준공 2023-06-01) | 화면 입력 → 미리보기 구간 → body(`building_built` · 파생 `nblOtherHasBuilding=true`) → **비사업용** + 구간표(없음 → 있음) · 같은 토지를 «바뀐 적 없음»으로 넣은 대조군은 **사업용**(이력이 판정을 정반대로 돌림) |
| E3 | 질문 «모름» | 사건 행 없음 · body `unknown` + `[]` · 현행 판정(비사업용) · 구간표 없음 · `basis ≠ state_history` · 확인 필요 고지 |
| E4-a | `changed` + 사건 0건 | 계산 요청이 나가지 않고(⑧) «사건이 없습니다» → `nblOtherStateEvents` 앵커로 포커스 → 사건 추가 후 200 |
| E4-b | 같은 날 · 역순 | 2번째 행 날짜 칸으로 포커스 ×2 → 고치면 200 · body 사건 2행 |
| E4-c | 소유 시작 전(취득일 당일) · 양도일 당일 | 1번째 행 날짜 칸으로 포커스 ×2 → 양도일 전날(유효 경계)이면 200 |
| E5 | 축 B 지분 — 첫 카드 취득 2020-01-01 · 둘째 지분 2014-01-02(번들에서 가장 이름) | 질문 위젯은 첫 카드에만(1개) · 사건 2013-06-01은 «취득일(2014-01-02)» 하한으로 막힘 · 2016-06-01(첫 카드 자기 취득일보다 앞이지만 번들 하한 이후)은 **200** · 지분마다 자기 구간표(둘째 지분 2014-01-03~2016-05-31 / 첫 지분은 철거 후 1구간뿐) |
| M8a/M8b | 일 단위 임계선 쌍(엔진 §6 — 취득 2014-01-01 · 양도 2024-01-01) | 준공 **2022-01-01 → 사업용**(꼬리 730일 · 직전 3년 비사업 365일 · 나목 미충족) / **2022-01-02 → 비사업용**(729일 · 366일 · 나목 충족). 하루 차이로 판정이 갈린다. 산출세액도 엔진 anchor와 같다(198,210,000 / 253,960,000 — 로그, 세율표 의존이라 단언은 안 함) |
| M16 | 소유 0일 지분(§21.3) | 첫 지분은 기준 3행, 둘째 지분은 기준 행 없이 «비교 없이 비사업용» |
| UV-8 | 인쇄 | §15 UV-8 행 |

셀렉터는 모두 기존 testid·`aria-label`·`role`(§6 hydration 대기는 `seed()`가 한다) — 신규 testid는 §21.3의 `nbl-state-history-zero-days` 1개. 외부 API 의존 없음(mock 불필요). 시드는 `actualSalePrice`를 **자산에 넣어야** 한다 — 오류 점프로 자산 목록 단계가 다시 마운트되면 `Step1.updateAssets`가 폼 `contractTotalPrice`를 자산 값으로 덮어쓴다(시드 함정 — 첫 실행에서 «총 양도가액을 입력하세요»로 실측).

### 21.2 시드 함정 하나 (제품 결함 아님)

기타토지 정밀 판정에서 `nblZoneType: "residential"`은 «세분된 용도지역»이 아니다 — 건축물 있는 꼬리와 만나면 서버가 `적용배율표에 대응 항목이 없습니다`를 던진다(⑧에 걸리는 입력이 화면 선택지로는 만들어지지 않는다 — 선택지는 `general_residential` 등 세분값). 시드는 세분값을 쓴다. (참고: 이 서버 오류 문구가 Turbopack dev 코드 프레임 하이라이터를 한 번 크래시시켰다 — dev 전용 · 서버 재기동으로 복구 · 제품 코드 무관.)

### 21.3 소유일수 0 퇴화 — probe 실측과 수정

**도달 가능성(실측)**: 단건은 사건일이 «취득일 < 사건일 < 양도일»이라 소유 **0일**(취득 = 양도 전날)에서는 `changed`에 닿을 수 없다(⑧ #6·#7이 막는다 — 소유 1일은 사건일이 하루 가능해 닿는다: 엔진 M16c). **축 B에서는 닿는다** — 첫 지분이 이르면 하한(번들 최이른 취득일)이 열려, 둘째 지분을 양도 **전날** 취득으로 넣으면 그 지분이 소유 0일로 계산된다(취득일 = 양도일은 앞 단계 검증 «취득일은 양도일보다 이전이어야 합니다»가 막는다). 직접 API(⑫)는 하한이 없어 단건도 닿지만 카드가 그려지는 경로가 아니다.

**어긋남(실측)**: 엔진은 0일 보유를 `meetsPeriodCriteria`의 0일 가드(`period-criteria.ts:240`)에서 **기간기준 비교 없이 비사업용**으로 반환하고, 이 반환은 수치 echo(`limitGa`·`nonBizTotal` 등)를 채우지 않아 echo가 기본값(`limitDa 0` · `nonBizTotal 0`)이다. U2 카드는 그 기본값으로 «나목 소유기간 0일 중 비사업용 기간 0일 — 소유기간의 100분의 40(0일) 초과 → **미충족**»을 그리면서 판정 문구는 «위 기준을 **모두 충족해** 비사업용으로 봅니다»라고 말해 서로 모순이었다(최종 판정 비사업용은 엔진 값이라 옳다 — 틀린 것은 표시).

**수정(카드 표시 쪽만 — 엔진 판정 불변)**: `NblStateHistoryPeriodTable`이 `totalOwnershipDays === 0 && isNonBusiness`이면 기준 행·판정 문구를 그리지 않고 «소유기간이 0일이어서 사업용으로 본 기간이 없습니다. 이 경우 기간기준(가·나·다목) 비교 없이 비사업용으로 봅니다 — 확인 필요.»(`nbl-state-history-zero-days`)를 보인다(엔진 처리 그대로 — 0일 보유 비사업용은 엔진 주석상 «보수적 안전 처리»이지 조문 근거가 아니라 «확인 필요»를 붙였다). 소유 1일은 0일 분기가 아니다(꼬리 나대지 1일 > 0일 → 나목 충족 — 기준 행·문구 일치, anchor로 고정). anchor: `nbl-state-history-result-card.anchor.test.tsx` M16 · M16c-bare(+2건, 16건) · E2E 1건. mutation: 0일 가드 제거(`false &&`) → M16 1건 실패 · 가드 확장(`<= 1`) → M16c-bare 1건 실패.

### 21.4 mutation (E2E — 제품 코드 1줄 → 실패 → 원복)

| mutation | 실패 |
|---|---|
| ⑧ 하한일을 번들 최이른 취득일 대신 자기 취득일로(`stateHistoryFloorDate`) | E5 1건 |
| 표 래퍼에서 `print:overflow-visible` 제거 | 인쇄 1건(`overflowX` auto) |
| 카드 0일 가드 제거 / 확장 | §21.3 |

### 21.5 `ui-engine-sync-checker` 14지점 점검 (2026-11-23 · 정적 grep + 기존 anchor 5파일 88건 실행)

대상: `nblOtherStateHistoryMode` · `nblOtherStateEvents`(+ 행의 `propertyTaxTypeBefore`) · echo `periodEvaluation.stateHistory`.

- **판정**: 해당되는 12지점(①②③④⑤⑦⑧⑩⑫⑬⑭ + ⑨는 `nonBusinessLandRaw` 안쪽 enum이라 설계상 n/a) 전부 «있음» · ⑥(사이드바 — 합계에 쓰는 항목 아님)·⑪(raw `acquisitionDate`는 ④가 채움) n/a. 5단 파이프라인(단건·축 B 번들·함께양도·다건)에서 세 필드가 침묵 stripping 없이 엔진까지 닿는다(④ 스프레드 `non-business-land-request.ts:175` · ⑬ `transfer-tax-api.ts:621`·`-bundled.ts:96` · ⑫ `transfer-tax-schema-nbl.ts:56-60,180-181` · ⑭ `form-mapper-helpers.ts:305-320`). ⑧↔⑤↔⑫↔⑭는 같은 술어(`nblOtherStateHistoryApplies`)·같은 leaf(`stateEventSequenceIssue`)이고 ⑫가 막는 조합은 전부 ⑧의 부분집합이다.
- **실제 누락: 0건.** 수정한 것 없음(점검 결과 때문에 고친 코드 없음 — §21.3 0일 카드 수정은 probe 발견).
- **Low 후보 2건(결함 확정 아님 · 수정 안 함)**:
  - A. 카드의 «100분의 N» 되짚기(`nonBizPercentOf`)는 소유 1~2일이면 `floor(×40/100)`과 `floor(×20/100)`이 모두 0이라 항상 40으로 표시한다 — 2015.2.3. 전 양도(20%)의 소유 2일 이하 지분에서만 라벨이 틀릴 수 있다(세액·판정 무관). 근본 해법은 엔진 echo에 percent를 싣는 것(엔진 시니어 협의) — 현실 사례가 극히 드물어 보류. **코드상 분기 판단이며 렌더는 확인하지 않았다.**
  - C. ⑤ 미리보기는 `floorDate`를 넘기지 않아 소유 시작 전 사건일이면 클립된 표를 그리고 ⑧은 «소유 시작 전»으로 막는다 — ⑧ 메시지가 그 칸으로 점프하므로 막다른 길이 아니다(설계 — §8·§19).
- **오탐**: 점검 보고의 `new Date(iv.end)`(`nbl-other-state-history-preview.ts:67`)는 Date 복사라 CLAUDE.md의 «문자열 `new Date(x)` 금지»(JSON 경유 string 함정) 취지와 다르다 — 오탐으로 판단했으나 **직접 읽어 확인하진 않았다**(확인 필요).
- **확인 필요 4건(기존 구조 · 이번 범위 밖)**: ① 축 B 지분 카드에서 ⑤가 이력 질문을 그리는가(`AssetSectionExtras.tsx:72` 조건상 지분이 primary의 `isNonBusinessLand`·`nblUseDetailedJudgment`를 물려받으면 보일 수 있고, 그 값은 ④가 primary만 쓰고 ⑧도 skip해 효과가 없다 — 이 스펙 E5는 둘째 지분을 NBL 비표지로 시드해 «질문 1개»만 고정한다) ② 다건 진입 시 단건 폼의 stale `changed` + 결함 행이 ⑫ 400만 내는지(다건 ⑧은 NBL 미검증 · 다건 화면에 NBL 칸 없음) ③ `isNonBusinessLand=false` + `nblUseDetailedJudgment=true` stale(`NblScreeningToggle`가 함께 끄므로 재현 경로 못 찾음) ④ Network 탭 body — **이 U3 E2E가 단건·지분 요청 body를 직접 단언**해 갈음(E2·E3·E4·E5).
- 파일 크기: `calc-wizard-asset-migrate.ts` 737줄(750 근접 — 다음 변경 시 기회주의적 분리).
