# 기타토지 소유기간 중 상태 이력 입력 모델 — UI(클라이언트 ①~⑧) 측 계획

> 🔴 **개정 2026-11-22 (v3)**: 사용자가 **V-1을 일 단위로 재결정**했다(통합 계획서 머리말 «v3 우선 규칙»). 이 문서의 v2 «과세기준일 접기» 서술(`foldStateToTaxBaseYears`·과세연도 버킷/표·6.1. 경계·Q-14)은 폐기이며, 법령·해석례 조사 기록과 V-2 결론만 근거 자료로 남는다. 판정·기대값은 일 단위 구간 기준(v1 모델 · §6 «일 단위» 열).
> **Feature ID**: `nbl-other-land-state-history` (UI 측) · 짝 문서: `nbl-other-land-state-history.engine.plan.md`(엔진·API 측 — 이 문서는 건드리지 않는다)
> **작성일**: 2026-11-22 · **base**: origin/master `10e86a809` · **상태**: 계획(코드 수정 0 · 테스트 미실행 · 브라우저 미수행)
> **근거 결정**: 리뷰 `docs/reviews/nbl-other-categories-review-2026-11.md` §1.4 V2-C2 · §6 Q-4 (다) · §12.4 항목 2 — 「별도 계획서로 상태 이력 입력 모델을 계획한다」(Q-4 (나)는 D1 #3495로 이미 완료)
> **번호 규칙**: 이 문서의 사용자 결정은 `UQ-n`, 미검증은 `UV-n`(엔진 계획서의 Q/V 번호와 충돌 방지 — 합칠 때 재번호).
> **검증 표기**: 「확인」= 이 세션에서 파일을 읽어 file:line을 대조한 사실. 「확인 필요」= 읽지 않았거나 실측·법령 조회가 남은 것. 새 시나리오의 세액 숫자는 쓰지 않는다(엔진 Pre-Do anchor가 확정) — ±55,750,000은 리뷰 실측 인용이다.
> **개정 2026-11-22 (v2)**: 사용자 결정 반영 — **UQ-1~UQ-9 전부 추천안 승인**(§14 «결정» 열 · 통합 Q 번호 대응) + **V-1 = 과세기준일(6월 1일) 단위**. 입력 화면(사건 행·질문·⑧ 검증)은 일 단위 그대로이고, **미리보기(⑤)·결과 카드(⑦)가 «과세연도(6.1. 현재 상태) 표»를 함께 보인다** — 변경은 **§17**에 모았고 §3.3·§5.3-3·§7.2·§13 R3는 거기로 대체된다(통합 계획서 `nbl-other-land-state-history.plan.md`가 정본).

---

## 0. 한눈에

| 항목 | 내용 |
|---|---|
| 문제 | 기타토지 판정이 「양도일 현재 상태」를 소유기간 전체에 적용한다. 건물 철거 뒤 나대지로 양도 = +55,750,000 과대, 신축 직후 양도 = −55,750,000 과소(리뷰 실측). 지금은 고지(`NBL_STATE_AT_TRANSFER_APPLIED_NOTICE`)와 DM-01(당해 사업개시일)만 있다 |
| 추천 UI 안 | **(C) 사건 목록 + 자동 생성 구간 미리보기**. 입력은 「질문 1개(3지선다) + 사건 행(종류·날짜)」이고, 화면은 사건에서 파생한 구간표(구간·일수·건축물 유무)를 읽기전용으로 보여 검산을 돕는다 |
| v1 범위 | **건축물의 신축·멸실 이력만**(기타토지 · 정밀판정 ON · 무조건 사업용 의제 불성립). 업종 개시·폐업 구간, 호별 용도 변화, 증축은 v1 밖(양도일 현재 값 전 기간 적용 + 고지 유지) |
| 이력 미입력 | 3지선다를 **필수**로 한다 — 「바뀐 적 없음 / 바뀐 적 있음 / 모름」. 미선택은 ⑧이 막는다(미입력 ≠ 미해당). 「모름」은 현행(양도일 현재 상태 전 기간) + 확인 필요 고지 |
| 축 B | 상태 이력은 **땅 사실** — 첫 카드 값을 상속하고 지분별 소유기간으로 엔진이 자른다(UQ-5) |
| 사용자 결정 | UQ-1 ~ UQ-9(§14) — **2026-11-22 전부 추천안 승인**. V-1 = 과세기준일 단위(§17) · 후속 확인 Q-14(통합 §5-1) |
| 엔진 측에 요구 | §13 — 입력 형태(`events` 배열 + 모드) · 공용 leaf(파생 구간·⑧⑫ 공용 issue) · 결과 echo(구간별 일수·3기준 수치) |

---

## 1. 현행 사실 (확인)

1. **판정 구조**: `judgeOtherLand`(`lib/tax-engine/non-business-land/other-land.ts:82`)는 `judgeOtherLandCore` 결과에 «빈 사업기간 + 유예»만 얹는다. 사업용 분기는 `fullPeriod = [{ start: ownershipStart, end: pjDate }]`(`:162`)를 기간기준에 넘겨 기간기준이 공허하게 충족된다. 호출 7곳(`:300·319·368·403·459·526(호별은 hoReq.businessPeriods ?? fullPeriod)·696`).
2. **고지 3벌**: 엔진 `warnings`에 `NBL_STATE_AT_TRANSFER_APPLIED_NOTICE`(`other-land.ts:98`, 문구 `lib/tax-engine/nbl-confirm-notices.ts:27-33`) · 결과 카드 `components/calc/NonBusinessLandResultCard.tsx:254-263`(`state_at_transfer` 분기, testid `nbl-period-state-at-transfer-notice`) · 입력 화면에는 이 고지가 **없다**(기타토지 섹션은 안내를 싣지 않는다 — 확인: `OtherLandDetailSection.tsx` 전체 대조).
3. **echo 타입**: `PeriodEvaluationBasis = "usage_periods" | "state_at_transfer" | "not_judged"`(`types.ts:495`). 카드는 `resolvePeriodEvaluation(judgment)`(`period-evaluation.ts:13-20`)로 분기하고 echo가 없는 이력 복원 결과는 단계 id(`other_*`)로 `state_at_transfer`로 접는다 — **새 basis를 추가해도 구 결과는 현행대로 표시**된다.
4. **「구간 행」 선례 5종**(재사용 후보): ① 유예 행 `nblGracePeriods` — 행 UI `GracePeriodSection.tsx:49-237`, 타입 `NblGracePeriodInput`(`calc-wizard-asset-nbl.ts:66-93`), 검증 helper `grace-row-issue.ts`(⑧ `transfer-tax-validate-nbl.ts:353-359` · ⑫ `transfer-tax-schema-nbl-refines.ts:112-116` 공용) ② 자경·축산·별장 사용기간·거주 이력 — 공용 입력 `nbl/shared/BusinessUsePeriodsInput.tsx`, 공용 issue `period-row-issue.ts`(`periodRowIssue`·`periodRowIssueField`·`periodRowIssueMessage`, ⑧ `:316-342` · ⑫ `:95-110`) ③ 별장 「사용 없음」 명시 확인 `nblVillaNoUseConfirmed`(⑧ Q-12 (a)). **기간 행 검증은 이미 «빈 칸·해석 불가·역순·같은 날» 4종이 공용 leaf**이고, 새 이력은 «사건 행» 형태라 그 leaf를 그대로 쓸 수 없다(사건은 날짜 1개) — 날짜 1개용 sibling leaf가 필요하다(§8).
5. **건축물 유무 소비처(직접 읽기) 9곳**: ⑤ `OtherLandDetailSection.tsx:144·176·223` · `OtherLandHoSection.tsx:60` · `OtherLandPropertyTaxBasisField.tsx:34·72` / ⑧ `transfer-tax-validate-nbl-other.ts:41·60` / ⑫ `transfer-tax-schema-nbl-refines.ts:191` / ④ 서버 매퍼 `form-mapper-helpers.ts:305·326`(`buildOtherLand`). 이력 모드에서는 이 값이 «양도일 현재»가 아니라 «구간별»이 되므로 이 9곳이 모두 영향권이다(§6 ① 아래 3중 패턴 표).
6. **재산세 분류 «근거»**: `property-tax-basis.ts`의 `propertyTaxBasisOptions(declared, hasBuilding)`은 건축물이 **없을 때만** 별도합산의 근거(공지상태·철거ㆍ멸실)를 묻는다. 철거 근거는 이미 «종전 바닥면적»(`nblOtherDemolishedFloorArea`)을 받는다. 즉 **철거 사실의 현재-상태 판 모델이 이미 있고, 빠진 것은 시간축뿐**이다.
7. **④ 운반 규약**: `buildNonBusinessLandRaw`(`lib/calc/non-business-land-request.ts:139`)는 `nbl` 접두 필드를 prefix-pick으로 전부 싣는다(`:153-156` `nblFields`) → **새 필드를 `nbl*`로 짓기만 하면 ④·⑬은 자동 운반**. 반면 ⑫ Zod(`transfer-tax-schema-nbl.ts` — 공장 블록 주석 `:209-213`이 «누락 시 조용히 strip»을 명시)는 필드를 추가하지 않으면 **침묵 strip**이다. 파생값 덮어쓰기 선례: `nblOwnershipRatio`(`:182`, `nblFields` 스프레드 뒤에 둔다).
8. **지목별 소비표 선례**: `land-category.ts:111-119` `INPUT_CONSUMPTION … satisfies Record<LandCategoryGroup, InputConsumption>`(유예·도시편입일·의제·수도권). ④(`:159-163` `consumes`)·⑤·⑧이 같은 표를 읽는다 — 새 열을 추가하면 컴파일러가 모든 그룹의 선언을 강제한다.
9. **축 B**: `buildFractionalShareNblRecord(share, primary)`(`non-business-land-request.ts:235-252`)는 `{...primary, 지분 취득 사실}`로 레코드를 만든다 — **primary의 모든 `nbl*`(새 이력 포함)가 지분 카드로 상속**된다. 지분 카드는 NBL 입력 화면을 그리지 않는다(`AssetSectionExtras.tsx:72-74`는 `assetIndex === 0 || asset.nblUseDetailedJudgment`일 때만 컨테이너를 그린다 — 지분 카드의 정밀판정 토글·`nblUseDetailedJudgment` 경로는 UV-5와 함께 확인 필요). ⑧은 지분 때문에 첫 카드에 요구하는 선례가 있다(`transfer-tax-validate.ts:478-495`, `assetIndex: 0`).
10. **노출 경로**: 단건·주 자산 = Step4(UI 인덱스 1) `SpecialSituationSection.tsx:139-146`이 `NblSectionContainer` 마운트(`primary.isNonBusinessLand && primary.nblUseDetailedJudgment`) · 함께 양도 토지 카드 = Step1 `AssetSectionExtras.tsx:72-74`. 기타토지 섹션은 `NblSectionContainer.tsx`가 `nblLandType === "other_land"`일 때 `OtherLandDetailSection`을 그린다(§4 지목별 세부 블록).
11. **사이드바(⑥)**: `lib/stores/transfer-per-asset-summary*.ts` · `calc-wizard-store.ts` · `WizardSidebar.tsx` · `TransferTaxCalculator.tsx`에서 `nbl*`·`isNonBusinessLand` 참조 0건(grep 확인) → **변경 없음**. 자산 카드 요약(`asset-section-summary.ts:149-161`)은 라벨만 쓴다.

---

## 2. 사용자 시나리오와 화면 흐름

### 2.1 시나리오 (v1이 푸는 것 S1·S2·S5 / 안내만 하는 것 S3·S4)

| # | 사실 | 현행 | 이력 입력 후 | v1 |
|---|---|---|---|---|
| S1 | 건물이 있는 토지를 취득 → 도중에 철거 → 나대지로 양도 | 양도일 상태(나대지)를 전 기간에 적용 → 비사업용(+55,750,000 과대, 리뷰 실측) | 사건 1행: 「건축물 멸실·철거·붕괴」 날짜. 건물 있던 구간은 건축물 부속토지 규칙, 철거 후 구간은 재산세 분류·근거 규칙 | **포함** |
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

**노출 술어 `otherLandStateHistoryApplies(asset)`** (⑤ 렌더 · ④ 전송 · ⑧ 검증이 같은 술어 — 단일 소스는 `INPUT_CONSUMPTION.other_land.stateHistory = true`(§6 ②)):

- `asset.nblLandType === "other_land"` (소비표) **그리고** `asset.nblUseDetailedJudgment` **그리고** 무조건 사업용 의제 불성립(`NblSectionContainer`가 의제 성립 시 지목 블록을 `inert`로 막는다 — ⑧도 `nblExempt`이면 건너뛴다, `transfer-tax-validate-nbl.ts` 위치 규칙 L2 주석과 같은 자리) **그리고** `!asset.nblOtherUseParcels`(v1: 연접 다필지와 배타 — 필지별 `hasBuilding`이 이미 있다, UQ-9).
- 함께 양도 토지 카드는 자기 카드의 NBL 섹션에 같은 질문이 뜬다(비지분). 축 B 지분 카드는 질문이 없다(첫 카드 상속).
- 주택부수토지·건물(비주택) 부수토지·별장 부수토지·상가·일반건물은 v1에서 **노출하지 않는다** — 소비표 `stateHistory`가 `other_land`만 true다.

---

## 3. 입력 UI 안 비교 — (A) 구간 배열 · (B) 사건 목록 · (C) 혼합

> 공통 전제: 엔진이 기간기준에 넘기는 것은 «사업용 구간 목록»이고, 구간의 사업용 여부는 **구간별 건축물 유무 + 현행 입력 칸(재산세 분류·근거·시가표준액·바닥면적·배율)** 으로 판정한다. 현행 입력 칸을 그대로 재사용하고 «건축물이 있던 기간 / 없던 기간»만 새로 받는 것이 최소다(§1-6).

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
│ [+ 사건 추가]
└──────────────────────────────────────────────────────────┘
```
- 입력 부담: S1 기준 **라디오 1 + 날짜 1**. 취득일·양도일을 다시 묻지 않는다. 첫 사건 종류가 취득 당시 상태를 정한다(멸실 먼저 = 취득 때 건물 있음, 신축 먼저 = 취득 때 나대지) — **별도 「취득 당시 건축물 유무」 질문이 필요 없다**.
- 오입력 위험: 같은 종류 사건 연속(멸실 뒤 멸실 — 중간 사건 누락), 순서 뒤바뀜, 소유기간 밖 날짜. 오류 종류가 적고 각각 행 단위로 짚을 수 있다.
- 검증 메시지 종류 ≈ 6(0행·빈 칸·해석 불가·순서 역전/같은 날·소유기간 밖·같은 종류 연속).
- 장점: 사용자의 기억 단위(「언제 허물었나」)와 일치. 중복 입력 없음. 축 B 지분에서 «지분 취득일 이전 사건»은 엔진이 상태를 재생(replay)해 자연히 처리. 사건 종류를 늘려 후속 확장 가능.
- 단점: 구간이 눈에 직접 보이지 않는다(→ 미리보기로 보완). 사건 사이의 상태가 암묵.

### 3.3 (C) 혼합 = (B) + 자동 생성 구간 미리보기 (+ 향후 구간별 상세 확장 여지)
> **v2(2026-11-22)**: 아래 «구간 미리보기»는 일 단위 사건 구간표다. V-1로 **같은 leaf가 만든 과세연도(6.1. 현재 상태) 표**를 그 아래에 한 벌 더 보인다 — §17.2.

```
  … (B)와 같은 입력 …
  ┌ 이 이력으로 나뉜 소유기간 (읽기전용) ──────────────────────┐
  │ 취득일 ~ 2021-05-10 전날   4,087일   건축물 있음
  │ 2021-05-10 ~ 양도일         1,118일   건축물 없음
  │ 합계 5,205일 = 소유기간                       ← 합계가 소유기간과 같지 않으면 오류 표시
  └──────────────────────────────────────────────────────────┘
  양도일 현재 건축물: 없음 (마지막 사건 = 멸실)           ← 「건축물 있음」 토글을 이 줄로 대체
```
- 입력 부담은 (B)와 같다. 미리보기는 `deriveOtherLandStateIntervals`(엔진 공용 leaf)의 출력을 그대로 렌더하는 **표시 전용**이라 저장·미러링이 없다(`useMemo`).
- 효과: 사용자가 날짜 입력이 의도와 맞는지 **구간 일수로 검산**한다 — 결과 카드 ⑦의 구간표와 같은 leaf라 «입력 화면에서 본 구간 = 결과에서 판정한 구간»이 보장된다.

### 3.4 비교표

| 기준 | (A) 구간 | (B) 사건 | **(C) 사건 + 미리보기** |
|---|---|---|---|
| S1 입력 칸 수 | 라디오2 + 날짜4 | 라디오1 + 날짜1 | 라디오1 + 날짜1 |
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
| `OtherLandStateHistorySection` | `components/calc/transfer/nbl/OtherLandStateHistorySection.tsx` | 질문 3지선다 + 사건 행 + 미리보기 + 양도일 현재 파생 표시 | ≈180 |
| `nblOtherStateHistoryApplies` · `effectiveOtherHasBuilding` · `OTHER_STATE_*` 라벨 | `lib/calc/nbl-other-state-history-scope.ts` (`nbl-period-rows-scope.ts`와 같은 모양) | ⑤⑧⑩ 공용 술어. 엔진 leaf를 감싸 `AssetForm`을 받는다 | ≈50 |
| `NblStateHistoryPeriodBlock` | `components/calc/NblStateHistoryPeriodBlock.tsx` | 결과 카드용 구간표·3기준(§7) | ≈110 |

`OtherLandDetailSection.tsx`(현 421줄 — 확인)는 마운트 1곳 + 건축물 유무 읽기 3곳 교체로 +≈25줄. `NonBusinessLandResultCard.tsx`(437줄)는 분기 1곳 +≈15줄(블록은 분리 파일). `calc-wizard-asset-nbl.ts`는 **776줄**이라 새 필드를 넣으면 800줄 근접(≥750 위험구간) — 새 슬라이스를 별도 파일로 두고 `NBL_DEFAULTS` 스프레드 1줄만 더한다(UV-9).

### 5.2 필드 명세 (이름은 제안 — 엔진 입력 형태 확정 후 정합)

| 필드(AssetForm) | 타입 | initial | 의미 |
|---|---|---|---|
| `nblOtherStateHistoryMode` | `"" \| "unchanged" \| "changed" \| "unknown"` | `""` | 질문 답. `""` = 아직 안 답함 |
| `nblOtherStateEvents` | `NblOtherStateEventInput[]` (`{ kind: "building_built" \| "building_removed"; date: string }`) | `[]`(자산마다 새 인스턴스) | 사건 행. `changed`일 때만 판정에 쓴다 |

`nbl` 접두 + string/배열이라 ④ prefix-pick이 자동 운반한다(§1-7). `kind` 값은 확장(업종 개시·폐업)을 열어 둔 **열거형**이다 — 라벨 표는 엔진 상수 단일 소스(`Record<kind, string>`로 키 누락을 컴파일러가 막는다 — memory `satisfies preserves keys`).

### 5.3 위젯 상세

1. **질문(RadioCardGroup, tone `amber`)** — `name={\`nblOtherStateHistoryMode-${asset.assetId}\`}`, `data-field="nblOtherStateHistoryMode"`(필드 점프 앵커), testId `nbl-other-state-mode-{unchanged|changed|unknown}`. 질문문: 「소유기간 중 이 토지 위 건축물이 새로 생기거나 없어진 적이 있습니까?」. 옵션 설명 문구에 법령 조어를 쓰지 않는다 — 법문 표현만: 「소유하는 기간 중 대통령령으로 정하는 기간」(법 §104의3①)·영 §168의6은 `LawArticleModal` 배지로 연결(`legalBasis="소득세법 시행령 §168의6"` — 기존 모달 prop 문자열 선례 `OtherLandDetailSection.tsx:134-138`).
   - OFF 상태에도 tone 배경 유지(RadioCardGroup 기본). 라디오는 native 신규 금지 준수.
2. **사건 행(`changed`일 때만)** — 행마다 violet 아닌 `amber` 카드(`ToneCard` 정본, 인라인 톤 금지). 행 구성: ① 종류 `RadioCardGroup layout="inline"`(2지선다: 「건축물 신축」 · 「건축물 멸실·철거·붕괴」 — 라벨은 유예 사유 9호 라벨 `GRACE_REASON_SPECS.demolition.label`과 같은 표기로 맞춘다) ② 날짜 `DateInput`(`data-field={\`nblOtherStateEvents.${i}.date\`}`) ③ 삭제 버튼(기존 행 UI 선례의 native `<button>` — 「항목 추가/편집 에디터」는 모달 런처 규칙의 제외 대상, `components/calc/CLAUDE.md` 160-166).
   - 행 추가: 「+ 사건 추가」(유예 행 선례 `GracePeriodSection.tsx` 하단과 같은 dashed 버튼). 새 행의 기본 종류는 **직전 사건의 반대**(번갈아 오므로) — 첫 행은 미선택(`kind: ""` 허용 안 함 → 첫 행 종류도 사용자가 고른다; 빈 종류 행은 ⑧이 막는다). **날짜는 비워 둔다**(자동 채움 금지).
   - 힌트는 FieldCard `hint`로(placeholder 숫자 예시 금지): 「취득 당시 건축물이 있었다면 «건축물 멸실·철거·붕괴»부터 입력합니다. 건축물이 없던 토지라면 «건축물 신축»부터 입력합니다.」
3. **파생 표시(읽기전용 — v2: 사건 구간표 + 과세연도 표 두 벌, §17.2)** — 구간 미리보기 표 + 「양도일 현재 건축물: 있음/없음(마지막 사건: …)」 줄. `changed`이고 사건 ≥1행이며 날짜가 모두 유효할 때만 표를 그린다(그 전엔 «사건을 모두 입력하면 …» 안내). 합계 일수가 소유기간과 다르면(= leaf가 구간을 못 만든 경우) 오류 문구를 같은 자리에 둔다.
4. **기존 「건축물(건물·시설물) 있음」 ToggleCard**(`OtherLandDetailSection.tsx:140-148`) — `changed`이면 **숨기고** 위 파생 줄로 대체한다(두 곳에서 같은 사실을 받지 않는다 — 양방향 통합 원칙 `components/calc/CLAUDE.md:84`의 변형: 입력 소스를 하나로). `unchanged`·`unknown`·`""`이면 종전 그대로. 모드를 `changed → 그 밖`으로 바꿀 때는 **onChange 핸들러에서** `nblOtherHasBuilding`을 마지막 파생값으로 한 번 써 준다(이벤트 시점 쓰기 — `useEffect → store` 미러링이 아니다).
5. **하위 칸 노출 조건 교체** — 아래 칸은 단일 `nblOtherHasBuilding`이 아니라 구간 술어를 본다.
   | 칸 | 현행 조건 | 이력 모드 조건 |
   |---|---|---|
   | 건물·토지 시가표준액, 건축물 바닥면적(`:176-221`) | 건축물 있음 | **건축물 있던 구간이 있다**(`hasBuildingInterval`) — 철거 후 양도해도 «철거된 건축물의 바닥면적»이 필요하다 |
   | 재산세 분류 근거(`OtherLandPropertyTaxBasisField.tsx:34`) | 건축물 없음일 때 선택지 | **건축물 없던 구간이 있다**(`hasBareInterval`) — 신축 전 나대지 구간의 근거도 받아야 한다 |
   | 철거 근거의 «종전 바닥면적»(`:72`) | 근거=철거ㆍ멸실 | 이력 모드에서는 `nblOtherBuildingFloorArea` 하나로 통합(UQ-6) |
   | 복합용도 ⑥(`:223`) | 건축물 있음 | 건축물 있던 구간 있음 + 「양도일 현재 값을 전 기간에 적용」 안내(UQ-9) |
6. **이력 모드 안내(고정 문구 2줄, ToneCard amber)**: 「건축물 유무 외의 이용 상태(업종·호별 용도·재산세 분류)는 양도일 현재 값을 소유기간 전체에 적용합니다 — 확인 필요」「착공부터 준공까지의 기간은 아래 «부득이한 사유 유예기간»의 건설 착공(5호)에서 입력합니다」. 후자는 자동 연동이 아니라 안내다(UQ-8).

### 5.4 UI 순서 = 계산 순서

엔진 순서: Step 0(나대지 간주·근거) → 공장 → 건물 배율 → 수입금액비율 → … → 기간기준(`other-land.ts` 흐름). 이력은 **Step 0 이전의 «구간 분해»**이므로 질문을 섹션 맨 위(현 `건축물 있음` 토글 직전, `OtherLandDetailSection.tsx:140`)에 두고, 그 아래 칸들은 구간 술어로 노출한다. 호별(§168의11①)·수입금액비율은 엔진에서 이력 뒤에 오므로 현 위치 유지.

---

## 6. 클라이언트 8지점 변경 계획

> 모든 항목은 현 구조를 읽은 뒤 쓴 것이다(file:line은 §1·아래 표). `useEffect → store` 미러링은 쓰지 않는다. 3중 패턴 적용 대상은 «파생 hasBuilding» 한 가지(표 아래).

| 지점 | 파일 · 현 구조 근거 | 변경 |
|---|---|---|
| ① 폼 상태 | 새 슬라이스 `lib/stores/calc-wizard-asset-nbl-state-history.ts`(타입 `NblOtherStateEventInput`·`NblOtherStateHistoryMode`·슬라이스 인터페이스) → `AssetForm`이 extends. 근거: 기타토지 슬라이스는 `calc-wizard-asset-nbl-other.ts`(163줄, 확인)에 있으나 `calc-wizard-asset-nbl.ts`가 776줄이라 **새 파일**로 둔다 | 필드 2개(§5.2) |
| ② initial | `NBL_DEFAULTS`(`calc-wizard-asset-nbl.ts:647` 이하 — 유예 `:753`) · `makeDefaultAsset`(`calc-wizard-asset-factory.ts:378-426`). 두 곳 값이 같아야 한다(`__tests__/lib/stores/migrate-factory-parity.anchor.test.ts`) | `mode: ""` · `events: []`. 배열은 자산마다 새 인스턴스(유예 선례 `calc-wizard-asset-migrate.ts:223-225`의 주석) |
| ③ normalize | `calc-wizard-asset-migrate-nbl.ts`(24줄 — `migrateNblB1Fields`). `migrate.ts`는 737줄이라 거기에 추가하지 않는다 | `mode === undefined → ""` · `events === undefined → []` · 배열 항목의 `kind`/`date` 누락 방어. **`""`을 `unchanged`로 접지 않는다**(미입력≠미해당). 복원 호출 경로 확인: `transfer-resume-entry.ts:138`·`calc-wizard-migration.ts:122` |
| ④ API 변환 | `lib/calc/non-business-land-request.ts:139-` `buildNonBusinessLandRaw` | (a) prefix-pick이 새 필드를 자동 운반(§1-7). (b) `consumes.stateHistory`(소비표 새 열)로 **지목이 기타토지가 아니거나 모드≠changed면 `events: []`·`mode`를 비워 전송**(`nblUrbanIncorporationDate: consumes.incorporation ? … : ""` 선례 `:166-` 모양). (c) **파생 `nblOtherHasBuilding` 덮어쓰기** — `nblFields` 스프레드 뒤, `nblOwnershipRatio`(`:182`)와 같은 자리. 축 B는 `buildFractionalShareNblRecord`(`:235`)가 `...primary`라 변경 불필요(이력 상속) |
| ⑤ 위젯 | §5 | 신규 `OtherLandStateHistorySection` + `OtherLandDetailSection`·`OtherLandHoSection`·`OtherLandPropertyTaxBasisField` 건축물 유무 읽기 교체(§5.3-5). 지목·모드 변경으로 숨는 칸의 값은 store에 남기고(복원 보존) ④가 보내지 않는다 |
| ⑥ 사이드바 | 위 §1-11 | **변경 없음**(NBL 참조 0건). 결과 도착 후 합계는 엔진 세액이 반영 |
| ⑦ 결과 카드 | `NonBusinessLandResultCard.tsx:69-71·235-263` · `period-evaluation.ts:13` | §7 — 새 basis `state_history` 분기 + 신규 블록 |
| ⑧ validation | `lib/calc/transfer-tax-validate-nbl-other.ts`(219줄 — 기타토지 입력 검증, `validateNblOtherLand`가 `:21` 지목 게이트) | §8 — 새 검증을 이 파일 끝에 추가(≈+45줄). 공용 issue leaf는 엔진 쪽(`other-land-state-history.ts`)에 두고 ⑫와 공유 |

### 6.1 3중 패턴 — 파생 `hasBuilding`

| 층 | 현재 | 이력 모드 |
|---|---|---|
| 화면(⑤) 표시 | `asset.nblOtherHasBuilding` 직접 읽기 ×6(§1-5) | `effectiveOtherHasBuilding(asset)`(모드≠changed면 저장값, changed면 사건 파생) — 같은 helper를 ⑤ 6곳이 쓴다 |
| 전송(④) | prefix-pick | `nblFields` 뒤에 **파생값으로 덮어쓰기** |
| 검증(⑧) | `validate-nbl-other.ts:41·60` 직접 읽기 | 같은 helper |
| ⑫ | `refines.ts:191` raw 읽기 | ④가 덮어쓴 값이 들어오므로 일치. 직접 API(클라이언트 거치지 않음)는 엔진이 `mode=changed`면 raw hasBuilding을 **무시하고 사건에서 파생**해야 한다(요구 §13 R5) — 어긋난 입력을 400으로 막을 필요 없이 단일 소스가 된다 |

저장값 `nblOtherHasBuilding`은 손대지 않는다 — 모드를 되돌리면 마지막 값에서 이어진다(§5.3-4).

### 6.2 ⑨~⑭ (엔진 계획서 소관 — UI가 확인할 점만)

⑨⑩(enum·`addPropertyRefines`)·⑪(자산-수준 `acquisitionDate` fallback)은 이 기능에 해당 없음(새 enum이 라우트 body 최상위가 아니라 `nonBusinessLandRaw` 안). ⑫ `transfer-tax-schema-nbl.ts`에 필드 2개 + `refineNonBusinessLandRaw`에 ⑧ 미러 · ⑬ `buildNonBusinessLandRaw` 자동 운반 · ⑭ `mapAssetToNblInput`(`form-mapper.ts:115` 유예 매핑 이웃) → `buildOtherLand`(`form-mapper-helpers.ts:295-`)에서 `stateHistory` 입력으로 변환. **UI PR 머지 전 자가 점검**: `git grep -n nblOtherStateEvents`로 ①~⑭ 12개 이상 지점에서 나오는지 대조(침묵 strip 방지).

---

## 7. ⑦ 결과 카드 — 구간별 사업용 일수와 3기준(한국어 풀어쓰기)

### 7.1 노출 조건

`periodEval.basis === "state_history"`(엔진 echo)일 때 기존 `state_at_transfer` 안내(`:254-274`)를 **대체**한다. echo가 없는 결과(이력 복원 · `unchanged`/`unknown`)는 현행 분기로 간다. 다건 결과뷰(`MultiTransferTaxResultView.tsx`)는 `NonBusinessLandResultCard`를 쓰지 않는다(`NonBusinessLandResultCard` 사용처 grep: `TransferTaxResultView.tsx:529`·`ValuationDetailCards.tsx:114` 두 곳뿐) → UV-7.

### 7.2 와이어
> **v2(2026-11-22)**: 아래 와이어의 «구간표»는 V-1로 **과세연도 표**(연도 · 6.1. 현재 건축물 · 소유일수 · 판정에 쓴 재산세 구분 · 사업용?)로 대체된다 — §17.3. 3기준 풀어쓰기(아래 «소유기간 …일(5년 이상 …)» 블록)는 그대로다.

```
기간 분석 — 소유기간 중 건축물 유무 이력 반영
┌────────────────────────────┬────────┬────────┬──────────────────────────────┬────────┐
│ 구간(시작일 포함 ~ 종료일 전날)│ 일수    │ 건축물  │ 판정에 쓴 재산세 분류          │ 사업용? │
├────────────────────────────┼────────┼────────┼──────────────────────────────┼────────┤
│ 취득일 ~ 사건일 전날          │ 4,087일 │ 있음    │ 별도합산(건축물 부속토지 규칙)    │ 사업용  │
│ 사건일 ~ 양도일 전날          │ 1,118일 │ 없음    │ 종합합산(근거 미선택)            │ 비사업용│
│ 소유기간                    │ 5,205일 │         │                              │        │
└────────────────────────────┴────────┴────────┴──────────────────────────────┴────────┘
소유기간 5,205일(5년 이상 — 영 §168의6 제1호)에서 사업용으로 본 기간 4,087일, 비사업용으로 본 기간 1,118일
  · 양도일 직전 5년(1,825일) 중 비사업용 기간 1,118일 — 기준 730일 초과      → 충족
  · 양도일 직전 3년(1,095일) 중 비사업용 기간 1,095일 — 기준 365일 초과      → 충족
  · 소유기간 5,205일 중 비사업용 기간 1,118일 — 소유기간의 100분의 40(2,082일) 초과 → 미충족
세 기준을 모두 충족해야 비사업용이다 — 위에서 미충족이 있어 사업용으로 본다.
```
(숫자는 모양을 보이기 위한 **가공 예**다 — 실제 값은 엔진이 echo로 준다. 위 예의 «1,118일 / 100분의 40» 대조는 임의.)

- 변수 약어 금지 — «직전 5년 중 비사업용 기간» 같은 한국어 라벨. 숫자 옆에 라벨. 중간 산술 결과(예: 소유기간 × 40 ÷ 100 이전 값) 미표시, `floor` 묵시(`2,082일`만 보인다). 법정 용어 우선(「비사업용 기간」「사업용 기간」「소유기간」).
- 구간 «판정에 쓴 재산세 분류»·«사업용?» 열은 **구간 단위 판정 echo**(§13 R3)를 그대로 쓴다. 구간 안에서 면적 일부만 사업용인 경우(건축물 있던 구간의 배율 초과분) 표시 방식은 UV-2(면적 × 시간 이중축)가 결정한다 — 확정 전에는 «구간별 사업용 면적비율» 열을 비워 두고 안내한다.
- 금액이 아닌 일수라 `amount-column-align`의 금액 규칙 대상은 아니지만 숫자 열은 `font-mono tabular-nums text-right`로 같은 스타일을 쓴다.
- testid: `nbl-state-history-intervals`(표) · `nbl-state-history-criteria`(3기준) · 구간 행 `nbl-state-history-interval-{i}`.

### 7.3 유무 외 고지

`unchanged`: 건축물 유무 고지 생략 + «유무 외 상태는 양도일 현재 값 전 기간 적용» 고지(엔진 문구). `unknown`: 현행 고지 + 「소유기간 중 건축물 유무 이력을 확인하지 못했습니다」. 두 문구 모두 엔진 `warnings`로 오고 카드는 echo의 `mode`로 분기한다(문구를 UI가 새로 짓지 않는다 — `nbl-confirm-notices.ts` 단일 소스).

---

## 8. ⑧ 검증 규칙 · 필드 점프 · 막다른 길 점검

### 8.1 규칙표 (⑧ `validateNblOtherLand` 확장 + ⑫ 미러 — **같은 leaf·같은 문구**, 문구 상수 `nbl-validation-messages.ts`에 추가)

게이트: `nblOtherStateHistoryApplies(asset)` 일 때만(지목·정밀판정·의제·연접 다필지 — ⑤ 렌더 게이트와 동일 술어. 어긋나면 «화면에 없는 칸을 요구하며 영구 차단»이 된다 — `transfer-tax-validate-nbl.ts` 의제일 R11 주석 선례).

| # | 조건 | 가리키는 칸(`field`) | 문구 방향 |
|---|---|---|---|
| 1 | 모드 `""` | `nblOtherStateHistoryMode` | 「소유기간 중 건축물이 새로 생기거나 없어진 적이 있는지 선택하세요. 모르면 «모름»을 고르세요」 |
| 2 | 모드 `changed` + 사건 0행 | `nblOtherStateEvents` (첫 행 추가 버튼 앵커 — 행이 없으므로 컨테이너 앵커) | 별장 0행 선례(`VILLA_NO_USE_REQUIRED_MESSAGE`) 모양 |
| 3 | 사건 종류 미선택 | `nblOtherStateEvents.{i}.kind` | 「n번째 사건 — 종류를 선택하세요」 |
| 4 | 날짜 비었음 · 해석 불가 | `nblOtherStateEvents.{i}.date` | 기간 행 문구(`periodRowIssueMessage`)와 같은 어미 — 단 «시작일·종료일» 대신 «날짜». **날짜 1개용 sibling leaf**(`stateEventRowIssue`) 필요(§1-4) |
| 5 | 앞 사건보다 빠름(역순) · 같은 날 | 같은 `…date` | 「n번째 사건일(…)이 앞 사건보다 빠릅니다」 — 자동 정렬하지 않는다(침묵 보정 금지) |
| 6 | 소유 시작일(`nblAcquisitionDateOf`) **이전·같은 날** | `…date` | 이월과세는 증여자 취득일이 기산일(`CarryoverOwnershipPeriodNotice` 선례). 같은 날 사건은 0일 구간을 만든다 — 막는다 |
| 7 | 양도일 **이후**(양도일 같은 날 포함 여부는 UV-4) | `…date` | 「양도일보다 늦은 사건은 판정에 쓰이지 않습니다」 — 차단 |
| 8 | 같은 종류 연속(신축 뒤 신축 · 멸실 뒤 멸실) | 뒤 행 `…kind` | 「앞 사건이 이미 «건축물 있음»입니다 — 사이의 «멸실» 사건이 빠졌습니까?」 |
| 9 | 양도일 의제 사유 선택 + 사건이 의제일 이후 | `…date` | 기간기준은 의제일을 양도일로 본다(`getPeriodJudgmentDate` — `period-criteria.ts:93`). 의제일 이후 사건의 처리는 UV-4 확정 후 차단/고지 결정 |
| 10 | 취득일·양도일 미입력 | (건너뜀) | 앞 단계 검증이 먼저 막는다 — 중복 오류 금지 |

필드 점프: 행 단위 키는 동적(`nblOtherStateEvents.${i}.date`)이라 정적 게이트 `__tests__/lib/calc/transfer-validation-field-anchor-coverage.test.ts`가 `${…}`를 `*`로 정규화해 읽는다(소스 확인) — **⑧에 `fieldError("nblOtherStateEvents.${i}.date", …)` 리터럴 접두 형태, ⑤에 `data-field={\`nblOtherStateEvents.${i}.date\`}`** 를 둔다. 접미를 분기하는 선례(`transfer-tax-validate-nbl.ts:356-358`)처럼 `part`별 리터럴로 쓴다. 메시지별 E2E 케이스를 `e2e/_helpers/validation-field-jump-cases-nbl.ts`에 추가(동적 키라 정적 게이트가 못 잡는 부분의 안전망 — 같은 파일 주석 선례).

### 8.2 ⑧ ↔ UI fallback 동기화 (정책 3)

- 모드 `""`을 ⑤는 «질문 미답»으로 보이고 ⑧은 막는다 — 같은 값을 다르게 해석하는 층이 없다.
- `unchanged`/`unknown`일 때 `events`에 stale 행이 남아 있어도 ⑧은 행을 검사하지 않고 ④는 비워 보낸다(`consumes` 선례). 사용자가 `changed`로 돌아오면 stale 행이 되살아나므로 행 검증이 그때 작동한다.
- 파생 `hasBuilding`은 §6.1 표대로 4층 동일.
- 자동 안분 fallback 없음: 빈 날짜를 취득일·양도일로 채우지 않는다. 구간 일수는 입력에서 **계산**할 뿐 안분이 아니다.

### 8.3 막다른 길 점검 매트릭스

| 경로 | 위험 | 대응 |
|---|---|---|
| 지목을 기타토지에서 다른 지목으로 변경 | 화면 칸이 사라졌는데 ⑧이 요구 | ⑧ 게이트 = 소비표(`stateHistory`) — 다른 지목이면 건너뜀. 사용자가 되돌리면 값 복원 |
| 정밀판정 접기(`nblUseDetailedJudgment=false`) | ④가 raw를 안 보냄 | ⑧도 건너뜀(`validateNblDetailedJudgment` 첫 줄 선례 `transfer-tax-validate-nbl.ts:100-106`) |
| 무조건 사업용 의제 성립 | 섹션 `inert` | ⑧ `nblExempt` 건너뜀(같은 자리) |
| 연접 다필지 ON | 필지별 `hasBuilding`과 충돌 | v1 배타 — 노출 술어에서 제외(UQ-9). 사용자가 ON으로 바꾸면 질문이 사라지고 ⑧도 건너뜀 |
| **축 B 지분 카드** | 지분 카드에는 질문이 없는데 ⑧이 지분 카드에 요구 | ⑧은 **첫 카드(`assetIndex: 0`)에만** 요구(`transfer-tax-validate.ts:478-495` 선례). 지분 레코드는 `buildFractionalShareNblRecord`가 primary 값을 상속 |
| 축 B 지분 취득일 < 첫 카드 취득일 | 그 앞 구간의 상태를 입력받을 곳이 없다 | UQ-5/UV-5 — 현 코드가 첫 카드가 가장 이른 취득일임을 보장하는지 **확인 필요**. 보장이 없으면 질문 라벨을 «가장 이른 지분 취득일 현재»로 정의하고 ⑧이 어긋남을 막는다 |
| 축 B 지분 취득일이 사건일보다 뒤 | 그 지분은 사건 전 구간이 소유기간 밖 | 엔진 replay로 처리(§13 R2). ⑧은 사건일을 **첫 카드 소유기간** 기준으로만 검증 |
| 함께 양도 토지 컴패니언(비지분) | 컴패니언 NBL 섹션 노출 조건 | `AssetSectionExtras.tsx:72-74`가 이미 같은 `NblSectionContainer`를 그린다 → 질문도 자동 노출. 컴패니언 raw는 V6-PU01 이후 비지분도 자기 카드로 전송(`transfer-tax-api-bundled.ts:94-97`). ⑧은 `validateNblDetailedJudgment`가 자산별로 돈다(`transfer-tax-validate-acquisition.ts:367`) |
| 다건(연간 합산) | 건별 primary | `multi-transfer-property-payload.ts:118`이 같은 `buildNonBusinessLandRaw(primary,…)` — ④ 변경이 공용. 다건 결과뷰는 NBL 카드를 쓰지 않으므로 echo 소비처 없음(UV-7) |
| 취득일·양도일을 질문 답한 뒤 수정 | 사건이 소유기간 밖으로 | ⑧ #6·#7이 행 단위로 짚는다 — 날짜 칸 필드 점프로 고칠 수 있음 |
| 이월과세(소유기간 기산일=증여자 취득일) | 사건 범위 기준이 취득일이 아님 | `nblAcquisitionDateOf(asset)` 사용(⑤ 미리보기·⑧·엔진 동일) |
| legacy 복원 | 모드 `""` → 질문 요구 | 의도된 재질문. 사용자가 «바뀐 적 없음»만 고르면 통과 |
| 모드 `changed` → 다른 모드 → `changed` | stale 행 부활 | 의도(복원 보존). 행 검증이 그때 작동 |

---

## 9. 저장 이력(IndexedDB) · store 마이그레이션

- **저장 형태**: 이력 `inputData`는 `formData` 통째(`lib/storage/CLAUDE.md` — `useAutoSaveCalculation`)이므로 새 필드는 **자동 저장**된다. 별도 Dexie 스키마·`db.ts` 버전 올림 **불필요**(필드 추가는 JSON 안).
- **복원**: 이력 → 마법사 복원은 `transfer-resume-entry.ts:138`이 `migrateAsset({...a})`를 거친다(확인) → ③ normalize가 새 필드를 채운다. sessionStorage persist는 `mergePersistedWizard`(`calc-wizard-store.ts:362`) → `calc-wizard-migration.ts:122` `migrateAsset`.
- **`STEP_MIGRATION`·`migrateLegacyForm`**: 단계 구조 불변 → **변경 없음**.
- **구 이력의 결과 화면**: `resultData`에 echo가 없다 → 카드는 현행 분기(§1-3). 재계산(「수정해서 다시 계산」) 시 질문이 뜬다.
- **중복 저장(dedup) 키**: `extractBusinessKey`(`business-key.ts`)가 NBL 필드를 보는지는 **확인 필요**(UV-10) — 보면 새 필드가 키에 들어가야 같은 건이 중복 저장되지 않는다.
- **partialize**: `result`만 제외(변경 없음).

---

## 10. 케이스 매트릭스 (단순 케이스부터 — 엔진 anchor와 1:1로 맞출 표)

| # | 모드 | 사건 | 소유기간 | 기대(방향) | 화면 확인 |
|---|---|---|---|---|---|
| M1 | unchanged | — | 5년 이상 | 현행 동일 | 이력 구간표 없음 · 유무 외 고지 |
| M2 | unknown | — | 5년 이상 | 현행 동일 + 확인 필요 | 현행 고지 |
| M3 | changed | 멸실 1행 | 5년 이상 | S1: 현행(비사업용)보다 사업용 쪽 | 구간 2개 · 3기준 |
| M4 | changed | 신축 1행 | 5년 이상 | S2: 현행(사업용)보다 비사업용 쪽 | 구간 2개 · 3기준 |
| M5 | changed | 멸실→신축 | 5년 이상 | 구간 3개(있음→없음→있음) | 구간 3개 |
| M6 | changed | 신축→멸실→신축 | 5년 이상 | 구간 4개 | |
| M7 | changed | 멸실 + 유예 9호(같은 날 기산) | 5년 이상 | 유예가 «없음» 구간에 합집합 | 유예 가산 일수 표시 |
| M8 | changed | 사건일 = 양도일 전날 | 3~5년 / 3년 미만 | 버킷 3종 각각 | 버킷별 3기준 문구 |
| M9 | changed | 축 B 지분 취득일 > 사건일 | — | 그 지분은 한 구간만 | (엔진 echo 분리 — UV-6) |
| M10 | changed + 연접 다필지 ON | — | — | **질문 미노출 · ⑧ 건너뜀** | |
| M11 | `""` | — | — | ⑧ 차단 | 필드 점프 |
| M12 | changed | 날짜 역순 / 소유기간 밖 / 같은 종류 연속 | — | ⑧ 차단 | 행 점프 |
| M13 | changed + 이월과세 | 사건일이 증여일~증여자 취득일 사이 | — | 기산일 = 증여자 취득일 기준 범위 | |
| M14 | changed + 양도일 의제 | 사건일이 의제일 이후 | — | UV-4 결정 | |

---

## 11. 테스트 · E2E 계획

### 11.1 vitest (UI 소관 — 엔진 anchor는 엔진 계획서)

- `__tests__/lib/stores/migrate-factory-parity.anchor.test.ts`·`nbl-defaults-and-migrate-guards.anchor.test.ts` — 새 두 필드 initial≡normalize·`""`/`[]` 인스턴스 비공유.
- `__tests__/lib/calc/nbl-state-history-gates.anchor.test.ts`(신규) — `nblOtherStateHistoryApplies` 진리표(지목 6종 × 정밀판정 × 의제 × 연접 다필지) · ④가 비소비 지목에서 `events: []`로 비워 보냄 · 파생 `nblOtherHasBuilding` 덮어쓰기(스프레드 뒤 순서 — 구 저장값 stale 방지 anchor) · ⑧ 규칙 #1~#10 각각 + ⑫ 미러가 **같은 문구**(문자열 동일성).
- `__tests__/lib/calc/nbl-other-land-section-render.test.tsx`(기존 확장 또는 신규) — 질문 3지선다 렌더·모드별 하위 칸 노출 교체표(§5.3-5)·사건 행 추가/삭제·미리보기 구간 일수 = 엔진 leaf 출력과 동일.
- 결과 카드: `__tests__/components/nbl2611-b3-result-card.anchor.test.tsx` 모양의 신규 `nbl-state-history-result-card.anchor.test.tsx` — echo 있음/없음(이력 복원) 분기·구간표·3기준 문구·**변수 약어/`floor` 미노출** 단언.
- **픽스처 기본값 함정**(`feedback_fixture_default_masks_gate_defect`): 기타토지 픽스처 18개 파일(`nblOtherPropertyTaxType`를 쓰는 테스트 — grep 확인, 실제 깨지는 수는 필드 추가 후 실측 필요)에 새 필수 모드를 일괄 `unchanged`로 넣는 공용 헬퍼를 쓰되, **모드 `""`로 막히는 부정 anchor 1건을 따로 둔다**(기본값이 게이트를 가리지 않게).
- 뮤테이션 확인: 노출 술어를 ⑤만 바꿔 ⑧이 막다른 길을 만드는지(§8 게이트 일치) · ④ 덮어쓰기 순서를 뒤집으면 anchor가 깨지는지.

### 11.2 E2E (시나리오별 1건 — 신규 `e2e/transfer-nbl-other-state-history.spec.ts`, 기존 `transfer-nbl-ptax-basis.spec.ts` 헬퍼 재사용)

| E2E | 시나리오 | 확인 |
|---|---|---|
| E1 | S1 철거 후 나대지 양도 | 질문 «바뀐 적 있음» → 멸실 1행 → 미리보기 구간 2개 → 계산 → 요청 body `nonBusinessLandRaw.nblOtherStateEvents` 도달(`page.waitForRequest`) → 결과 카드 구간표·3기준 + «양도일 현재 상태 전 기간 적용» 고지 대체 |
| E2 | S2 신축 직후 양도 | 신축 1행 → 결과가 현행과 반대 방향 판정 |
| E3 | 모름 | 현행 결과 + 확인 필요 고지 유지 |
| E4 | ⑧ 오류 3종(미선택·역순·소유기간 밖) | 메시지 + **필드 점프**(해당 행 날짜 칸으로 포커스) — `validation-field-jump-cases-nbl.ts` |
| E5 | 축 B 지분 상속 | 첫 카드 이력 입력 → 둘째 지분(취득일이 사건일보다 뒤)의 결과가 «철거 후 구간만» |

외부 API 의존 없음(조회 버튼 미사용) — mock 불필요. 셀렉터는 testid·`RadioCardGroup`의 `radio` role 기준(e2e/CLAUDE.md §2) · 날짜는 `fillDateAndVerify` 헬퍼 + scope 한정(§1) · **셀렉터는 probe로 실측 후 확정**(§4). 브라우저 수동 확인: 폼→계산→결과 + Network 탭 request body(DoD) — 구현 PR에서 수행.

---

## 12. PR 분할 (UI 범위)

> 엔진 계획서의 PR과 **시퀀셜**(루트 CLAUDE.md: 엔진이 타입·헬퍼·anchor를 선처리 → UI가 ⑤⑥⑦). 화면에 있는데 판정에 안 쓰이는 칸을 만들지 않는다(B1 사례) — 노출 PR은 엔진 판정 PR 뒤.

| PR | 내용 | 선행 | 위험 |
|---|---|---|---|
| E-a(엔진) | 공용 leaf(`other-land-state-history.ts`: 사건 → 구간 · issue · 라벨) + 입력 타입 + 소비표 `stateHistory` 열 + 문구 상수 | — | |
| **U0**(UI, 무화면) | ①②③ 슬라이스·initial·normalize + parity anchor + `nbl-other-state-history-scope.ts`(술어·`effective…`) | E-a | 필드만 생김 — 화면·⑧ 없음 → 동작 불변 |
| E-b(엔진) | 판정(구간별 사업용 → `meetsPeriodCriteria`) + ⑫ Zod·refine + ⑭ 매퍼 + echo + 고지 문구 | E-a | |
| **U1**(UI, 화면 + ⑧ + ④) | ⑤ 위젯·건축물 유무 읽기 교체(6곳)·⑧ 규칙·④ 전송·덮어쓰기 + 렌더/게이트 anchor + 기존 픽스처 일괄 보정(§11.1) | E-b, U0 | 18개 테스트 파일 보정 · 필드 점프 케이스 |
| **U2**(UI, 결과) | ⑦ 카드·`NblStateHistoryPeriodBlock` + 카드 anchor | E-b(echo) | |
| **U3**(검증) | E2E 5건 + 브라우저 확인 + `ui-engine-sync-checker`(14지점) | U1, U2 | E2E 간헐 — 셀렉터 probe |

U1·U2는 한 PR로 합칠 수 있다(카드가 echo 없는 구 결과를 처리하므로 순서 무관). 800줄 점검: `calc-wizard-asset-nbl.ts` 776줄은 건드리지 않고(스프레드 1줄 예외) `OtherLandDetailSection` 421→≈446줄 · `NonBusinessLandResultCard` 437→≈452줄 · `transfer-tax-validate-nbl-other.ts` 219→≈265줄.

---

## 13. 엔진 측에 요구하는 것

| # | 요구 | 이유(UI 소비처) |
|---|---|---|
| R1 | **입력 형태**: `mode: "" \| "unchanged" \| "changed" \| "unknown"` + `events: { kind: "building_built" \| "building_removed"; date: string }[]`(ISO). 사건 → 구간 변환은 **엔진 공용 leaf**(`deriveOtherLandStateIntervals(events, ownershipStart, endDate)`)에 둔다 — 저장 모델이 구간 배열이어도 UI 입력은 사건이다 | ⑤ 미리보기 · ⑦ 구간표가 같은 leaf를 쓴다(입력 화면 구간 = 결과 판정 구간) |
| R2 | 첫 사건 종류가 취득 당시 상태를 정한다 · **지분별 소유기간으로 replay**(소유 시작 전 사건은 시작 시점 상태로 접는다) | 별도 «취득 당시 유무» 질문 불필요 · 축 B 지분 |
| R3 | **구간 단위 판정 echo** `periodEvaluation: { basis: "state_history", stateHistory: { mode, intervals: [{ start, end, days, hasBuilding, effectiveTaxType, business: boolean }], … } }` — 기존 `PeriodEvaluationBasis`에 값 추가. 구간 안 면적 일부만 사업용인 경우의 표현(UV-2) | ⑦ 구간표 — **v2(V-1): `stateHistory`에 `taxBaseYears: [{ year, baseDate, windowStart, windowEnd, days, hasBuilding, propertyTaxType, business }]`를 추가한다. `intervals`(일 단위 사건 구간)는 유지 — 두 벌의 합계가 소유기간과 같다(엔진 D10 검산). 카드가 접기를 재구현하지 않는다(단일 소스)** |
| R4 | **3기준 수치 echo**: 소유기간 일수·버킷(1/2/3호) · 직전 5년·3년 창 길이와 그 창의 비사업용 일수 · 각 기준값(730·365·100분의 40에 해당하는 일수) · 각 목 충족 여부. 현재 `PeriodCriteriaResult`의 `bucketDetail`(`PeriodCriteriaResult.detail` — 문자열)·`ownershipBucket`·`bizInLast3/5`·`ratio`·`thresholdRatio`는 `period-criteria.ts` 내부 결과이고 `NonBusinessLandJudgment`에는 `criteria` 3 boolean·`periodEvaluation`만 있다(`types.ts:531·543` 확인; 카드가 읽는 것은 `totalOwnershipDays`·`effectiveBusinessDays`·`businessUseRatio`·`gracePeriodDays`·`criteria` 3 boolean뿐 — `NonBusinessLandResultCard.tsx:235-250`) | ⑦ 3기준 한국어 풀어쓰기(문자열 파싱 금지 — 구조화 필드로) |
| R5 | `mode=changed`이면 엔진이 `hasBuilding`을 **사건에서 파생**하고 raw `nblOtherHasBuilding`은 무시 | 직접 API ↔ UI 단일 소스 |
| R6 | 공용 issue leaf(⑧·⑫ 공용): `stateEventRowIssue(row, index)`·`stateEventSequenceIssue(events, ownershipStart, transferDate, deemedDate?)` — 결함 칸(`kind`/`date`/행)과 문구 반환. 문구 상수는 `nbl-validation-messages.ts` | ⑧ §8.1 #3~#9 |
| R7 | 소비표 `INPUT_CONSUMPTION.*.stateHistory` 열 + `consumesStateHistory(landType)` export | ④⑤⑧ 같은 술어 |
| R8 | 구간 술어 export: `hasBuildingInterval(history)` · `hasBareInterval(history)` · `effectiveHasBuildingAtTransfer(history)` | ⑤ 하위 칸 노출 교체 |
| R9 | 고지 문구 3종(`unchanged`·`unknown`·`changed` 후 남은 한계) — `nbl-confirm-notices.ts` 단일 소스. 「건축물 유무 외 이용 상태」 고지 포함 | ⑦·입력 안내 |
| R10 | **철거 근거의 «종전 바닥면적» 통합**: `changed`에서 `nblOtherBuildingFloorArea`를 철거된 건축물의 바닥면적으로도 읽게 하고 `nblOtherDemolishedFloorArea`와 중복 입력을 만들지 않는다(UQ-6) | ⑤ 중복 칸 제거 · ⑧ 일관 |
| R11 | `deemedTransfer`(양도일 의제)와 사건 범위의 관계(UV-4) | ⑧ #7·#9 |
| R12 | 법령 인용 상수는 `legal-codes`에서, **새로 인용하는 조문은 `lib/legal-verification/manifest/additions-*.ts`에도 등록**(루트 규칙 — 게이트 `legal-verification-coverage-complete`) | UI는 모달 prop 문자열만 쓴다 |

---

## 14. 사용자 결정 UQ-n (선택지 + 추천 + 근거)

| # | 질문 | 선택지 | **추천** | 근거 | **결정(2026-11-22)** |
|---|---|---|---|---|---|
| UQ-1 | 질문(3지선다)을 필수로 할 것인가 | (가) 필수 — 미선택 ⑧ 차단 / (나) 미선택 = 현행 + 고지(차단 안 함) / (다) 토글 1개(바뀐 적 있음)만 | **(가)** | 「미입력 ≠ 미해당」 원칙(양방향 ±55,750,000이라 조용한 기본값이 위험). 별장 「사용 없음」 Q-12 (a)가 같은 방향으로 승인됨. **비용**: 기타토지 픽스처 테스트 18파일 + E2E 6~7파일 보정(UV-10 실측). (나)는 비용이 적지만 «묻지 않고 현행 적용»이 계속 남는다 | **승인 (통합 Q-5)** |
| UQ-2 | 입력 모델(화면 관점) | (A) 구간 / (B) 사건 / (C) 사건 + 미리보기 | **(C)** | §3.4 — 입력 칸·오류 종류·축 B·결과 카드와 같은 leaf. 엔진 저장 모델은 엔진 계획과 맞추되 입력은 사건 | **승인 (통합 Q-2)** — V-1로 «사건 → 일 단위 구간 → 6.1. 접기» 2단 |
| UQ-3 | v1 사건 범위 | (가) 건축물 신축·멸실만 / (나) + 업종 개시·폐업(S4) / (다) + 호별 용도 변경 | **(가)** | (나)는 과세기간별 수입금액이 필요해 현 입력(당해·직전 2개 연도)으로 판정할 수 없다 — 입력 확대는 별도 계획. DM-01은 현행 유지. (다)는 호별 면적기준 칸이 구간별로 달라 모델이 폭증 | **승인 (통합 Q-4)** |
| UQ-4 | 「모름」 처리 | (가) 현행 + 확인 필요 고지 / (나) 혜택 불성립(비사업용 쪽) | **(가)** | 양방향이라 «혜택»이 방향마다 다르고 이력 없이는 비사업용으로 접을 구간을 정의할 수 없다. 법 근거 없는 불리 적용 금지. 기존 Q-4 (나) 승인과 같은 처리 | **승인 (통합 Q-6)** — **«모름 = 혜택 불성립» 원칙과의 긴장을 알고 승인**(Q-6) |
| UQ-5 | 축 B 지분에서 이력은 | (가) 땅 사실 — 첫 카드 값 상속, 지분별 소유기간으로 엔진이 replay / (나) 지분 카드마다 입력 | **(가)** | 지분 카드는 NBL 입력 화면이 없고(`AssetSectionExtras.tsx:72-74`) `buildFractionalShareNblRecord`가 땅 사실은 첫 카드, 지분 사실은 자기 값을 쓰는 규약. 건물 철거는 땅 전체의 사실. 단 «지분 취득일이 첫 카드보다 빠를 수 있는가»(UV-5) 확인 전에는 질문 라벨의 기준일을 확정하지 않는다 | **승인 (통합 Q-11)** — 사건은 원본 replay(엔진 D2) |
| UQ-6 | 건축물 유무 파생값 vs 기존 토글 | (가) `changed`이면 토글 숨김 + 파생 표시, 철거 «종전 바닥면적» 칸을 건축물 바닥면적과 통합 / (나) 토글 유지 + 일치 검증 + 칸 둘 | **(가)** | (나)는 «이력은 철거로 끝나는데 토글은 있음»인 막다른 길을 사용자가 스스로 풀어야 하고 같은 사실을 두 번 입력한다. (가)는 단일 소스 + 3중 패턴 표(§6.1) | **승인 (통합 Q-12)** |
| UQ-7 | 노출 지목 | (가) 기타토지만 / (나) + 주택부수토지·건물 부수토지 | **(가)** | 리뷰 Q-4는 «기타토지» 범위. 주택부수토지는 2026-07-31 방침을 Q-3a (나)로 «유예만 반영»까지만 좁힌 상태 — 이력 확대는 그 방침 재논의가 먼저(재제안 금지 목록 존중). 소비표에서 `other_land`만 true | **승인 (통합 Q-1)** |
| UQ-8 | 유예 9호(멸실 + 5년·2년)와 멸실 사건의 관계 | (가) 자동 채움 금지 — 안내 문구만(+ 불일치 확인 필요 고지는 엔진 선택) / (나) 멸실 사건이 있으면 9호 유예 행을 자동 생성 | **(가)** | 9호 유예는 «정당한 사유»를 사용자가 주장하는 입력이라 사건만으로 성립하지 않는다 — 자동 생성은 법 근거 없는 유리 적용. 두 날짜가 어긋나는 입력은 확인 필요 고지 | **승인 (통합 Q-10)** |
| UQ-9 | v1 상호배타 범위 | (가) 연접 다필지는 배타(질문 미노출) · 공장·복합용도·호별·수입금액비율은 양도일 현재 값 유지 + 고지 / (나) 모두 구간화 | **(가)** | 필지별 `hasBuilding`이 이미 모델에 있어 이중 정의. 나머지는 구간화 비용이 크고 사건 종류(UQ-3)와 함께 후속 | **승인 (통합 Q-13)** |

---

## 15. 미검증 UV-n (착수 전 확인)

| # | 항목 | 확인 방법 |
|---|---|---|
| UV-1 | 소비표 열 추가가 `INPUT_CONSUMPTION … satisfies`로 모든 그룹 선언을 강제한다는 점은 **코드를 읽어** 확인했으나(`land-category.ts:111-119`), 열 추가 후 `consumes*` 소비처(`non-business-land-request.ts:159-163` 외) 전수는 미확인 | `git grep -n "consumes"` 대조 |
| UV-2 | **면적 × 시간 이중축**: 건축물 있던 구간의 배율 초과분(면적 일부 비사업용)과 «없음» 구간(전량)을 한 기간기준에 어떻게 합치는가. 현 엔진은 면적 안분 결과(`areaProportioning`)와 기간 판정이 따로다 | 엔진 계획 + Pre-Do anchor |
| UV-3 | 「신축」 사건 날짜의 법령상 의미(사용승인일·준공일·사실상 사용일) — 라벨 확정 전에는 «건축물 신축일» 중립 표기. **v2 부분 해소(2026-11-22)**: 재산세 구분은 허가·사용승인을 받지 않은 건축물의 부속토지를 별도합산에서 빼고(지방세법 시행령 §101①단서), 건축허가 후 **공사에 착수한 건축물도 건축물에 포함**한다(같은 영 §103①3 — 과세기준일 현재 정당한 사유 없이 6개월 이상 공사 중단은 제외 · 본문 확인). «신축» 날짜 = 재산세상 건축물로 보는 첫날이며 사용승인일과 같지 않을 수 있다 → 라벨은 U1 전 확정(엔진 §4A.5 D11) | KoreanLaw MCP — 「소득세법 시행령」 §168의11① 이웃·「지방세법 시행령」 §101·§103의2 본문 |
| UV-4 | 사건일 = 양도일 같은 날의 취급 · 양도일 **의제**(§168의14②) 이후 사건의 취급 · 양도일 이후 사건 | 엔진 계획 + 법령(§168의14②) — **v2**: 사건일 = 양도일 같은 날은 일 단위 규약(마지막 구간 0일 차단)으로 불변. 6.1. 접기와는 무관 |
| UV-5 | 축 B에서 첫 카드가 가장 이른 취득일인가(`isFullFractionalBundle`·카드 순서 규약). 아니면 «첫 카드 취득일 이전 구간»이 비게 된다 | `transfer-tax-api-helpers.ts:128`·`axis-b-effective-asset.ts` 정독 + E2E |
| UV-6 | 축 B 지분별 판정 결과를 화면이 어떻게 보이는가 — `nonBusinessLandJudgmentDetail`이 1건이면 지분별 구간표 표시 방식 | `TransferTaxResultView.tsx:526-529`·다건 지분 결과 경로 |
| UV-7 | 다건(연간 합산) 결과뷰가 NBL 판정 echo를 어디서 보이는가(`NonBusinessLandResultCard` 미사용 확인됨 — 대체 경로 미확인) | `MultiTransferTaxResultView.tsx` · `mergeGbExcessConfirmNotices` 인근 |
| UV-8 | 「계산 결과 선택 출력」(8 결과뷰)에서 NBL 카드 구간표가 인쇄·PDF에 어떻게 실리는가 · print CSS 토글(`print-only-css-toggle`) | 결과뷰 선택 출력 설정 정독 + 인쇄 E2E(`feedback_print_media_needs_section_selection`) |
| UV-9 | `calc-wizard-asset-nbl.ts` 776줄 — 스프레드 1줄 추가 후에도 ≤800이지만 ≥750 위험구간이라 «기회주의적 분리» 대상 여부 | PR 시점 줄 수 재측정 |
| UV-10 | 테스트 보정 규모(기타토지 fixture 18 + E2E 6~7은 `grep -l`로 센 **상한 추정**) · `extractBusinessKey`가 NBL 필드를 보는지 | U1 착수 전 필드 추가 후 `vitest` 범위 실행으로 실측 |
| UV-11 | 철거 사건이 생기면 **한시 지위**(리뷰 §12.4-4 D2 — 철거ㆍ멸실 1년·빈집 3년)를 판정할 수 있게 되는가 — **v2 본문 확인(2026-11-22)**: 지방세법 시행령 §103의2 — 「과세기준일 현재 … 사실상 철거ㆍ멸실된 날부터 1년이 지나지 않은 …」(빈집 3년 · 허가·사용승인 없는 건축물·건축 용도 외 사용 제외 · 바닥면적 × §101② 배율). 판정 자동화는 사실 칸이 더 필요해 v1 제외(엔진 E3) | 법령 조회(`지방세법 시행령` §103의2) · 엔진 계획. 판정 가능해져도 이 계획 범위 밖 |
| UV-12 | 과거 건축물의 시가표준액·바닥면적을 사용자가 알 수 있는가 — 현 ⑧은 바닥면적을 요구(R06)하고 시가표준액은 선택(`isBareLand` — 값이 둘 다 있을 때만 2% 비교, `other-land.ts:66-75`). 철거된 건축물 값 미입력 시 동작은 «현행과 같음» | UI 안내 문구(FieldCard hint)에 «철거된 건축물의 값»이라고 명시 + 미입력 허용 범위는 엔진 결정 |
| UV-13 | 톤 선택(`amber`) — `tones.ts` 의미표(amber=취득/주의·sky=면적/규모)에서 «시간 분해»는 직접 항목이 없어 현행 «건축물 있음» ToggleCard(amber)와 같은 톤으로 둔다 | 디자인 리뷰 |
| UV-14 | 브라우저에서의 실제 입력 흐름·모바일 폭(375px) 행 레이아웃 | U3에서 Playwright 실측(미수행) |
| UV-15 | **과세연도 표의 행 수·모바일 폭** — 소유 20년이면 20행. 연속 같은 상태 연도를 «2015~2020»처럼 접어 보일지(펼치기 토글 · 엑셀식 합계행) | U1에서 Playwright 375px 실측 · `print-only-css-toggle`(인쇄 자동 펼침) |
| UV-16 | **«같은 해 안 변화는 판정에 쓰이지 않음» 안내의 표시 위치·문구** — 사건 행 배지로 둘지 표 아래 고정 문구로 둘지. 엔진이 사건별 «6.1.에 걸림/흡수됨» 플래그를 echo로 줄지(D7) | 엔진 E2 echo 결정 후 U1 |

---

## 16. 재제안 금지·기결정 준수 확인

- 리뷰 §12.4 「재제안 금지」 — V5-G2(G-6)·Q-8 (가): 이 계획은 주택 split·§155⑳ 비사업용 파트·상가분 부수토지를 **건드리지 않는다**.
- 메모리 ⛔ 절: 「부분 비사업용 혼합 보상=합산 + 안내 현행 유지」(`project_partial_nbl_loss_offset_investigation`) · 「토지 카드 부수토지 지정지역 질문」 완결 · 「축 B 카드별 floor 합 ±수 원」 — 해당 없음.
- 「모름 = 혜택 불성립 + 확인 필요」는 이 축에서 **적용 불가 사유를 §4에 명시**(양방향·구간 정의 불가) — 위반이 아니라 적용 범위 판단이며 UQ-4로 사용자 확인을 요청한다.
- 자동 안분 fallback 없음 · `useEffect → store` 미러링 없음(모드 전환 쓰기는 onChange) · ⑧ 동기화는 §6.1·§8.2.
- 주택부수토지 방침(2026-07-31)·Q-3a (나) 범위는 그대로(UQ-7).

---

## 17. V-1 결정(2026-11-22) 반영 — 과세기준일(6월 1일) 단위

> 엔진 모델 정의는 엔진 계획서 **§4A.5 D1~D11**이 정본이다. 여기서는 **화면에 보이는 것**만 정한다. 화면은 접기를 **재구현하지 않는다** — `deriveOtherLandStateIntervals`(일 단위)와 `foldStateToTaxBaseYears`(6.1. 접기)를 `lib/calc/nbl-other-state-history-scope.ts`가 감싸 ⑤·⑦이 같은 값을 읽는다(3중 패턴·단일 소스).

### 17.1 결정 기록과 입력 화면에 영향 없는 것

- UQ-1~UQ-9 전부 추천안 승인(§14 «결정» 열). V-1 = 6.1. 단위(사용자 결정). 후속 Q-14(통합 §5-1)는 14-1 «알고 승인» · 14-2 대표 구간 · 14-3 6.1. 당일 · 14-4 부분 연도 — **화면 문구·표 열은 추천안((가) 역년·새 상태·균일 부여) 기준으로 쓰고, Q-14가 바뀌면 문구만 바뀐다.**
- **입력 칸·질문·사건 행·⑧ 검증 10종은 일 단위 그대로**다(D1). 같은 해 안에 사건 두 개가 있어도 ⑧은 막지 않는다(순서만 본다 — D7).
- ④ 전송·⑫ Zod·⑬은 불변. 접기는 엔진이 한다.

### 17.2 ⑤ 미리보기 — 사건 구간표 + 과세연도 표 (§5.3-3 대체)

`changed`이고 사건 ≥1행·날짜가 모두 유효할 때 표 두 벌을 그린다(표시 전용 `useMemo`).

1. **«사건으로 나뉜 소유기간»**(기존 구간표 — 일 단위 · testid `nbl-state-history-intervals`): 구간 · 일수 · 건축물 유무.
2. **«과세기준일(6월 1일) 현재 상태로 본 판정 단위»**(신규 · testid `nbl-state-history-tax-base-years` · 행 `nbl-state-history-tax-base-year-{Y}`): 과세연도 · 6월 1일 현재 건축물(있음/없음) · 판정에 쓰는 소유일수 · 사업용? — 사업용 여부는 엔진 `taxBaseYears[].business`(미리보기는 꼬리 상태의 사업용 여부를 모르므로 **꼬리 구간은 «결과 계산 후 확정»으로 표시**, 이전 상태 구간만 확정 표시).
3. 합계 검산(D10): 표 2의 소유일수 합 = 소유기간 일수. 다르면 오류 문구(침묵 보정 금지).
4. 고정 안내(ToneCard amber 1줄 — 문구는 엔진 상수 단일 소스): «판정은 해마다 6월 1일 현재 상태를 그 해 소유일 전체에 적용합니다. 같은 해 안에서 생겼다 없어진 변화는 판정에 쓰이지 않습니다.»
5. 6.1.에 걸리지 않아 판정에 쓰이지 않는 사건은 사건 행에 «과세기준일에 걸리지 않음» 정보 배지(차단 아님 — UV-16).

### 17.3 ⑦ 결과 카드 — 과세연도 표 (§7.2 와이어 대체)

가공 예가 아니라 엔진 실측(M1: 취득 2014-01-01 · 건물 별도합산 → 철거 2021-01-01 · 양도 2024-01-01, 사업 2,556 · 비사업 1,095일)을 옮긴 모양이다. 연속 같은 상태 연도는 접어 보인다(UV-15).

```
기간 분석 — 소유기간 중 건축물 유무 이력 반영 (과세기준일 6월 1일 현재 상태 기준)
┌────────────┬────────────────┬────────┬──────────────────────┬────────┐
│ 과세연도      │ 6월 1일 현재      │ 소유일수 │ 판정에 쓴 재산세 구분      │ 사업용? │
├────────────┼────────────────┼────────┼──────────────────────┼────────┤
│ 2014        │ 건축물 있음       │  364일  │ 별도합산(선언)           │ 사업용  │
│ 2015~2020   │ 건축물 있음       │ 2,192일 │ 별도합산(선언)           │ 사업용  │
│ 2021~2023   │ 건축물 없음       │ 1,095일 │ 종합합산(근거 미선택)      │ 비사업용│
│ 소유기간      │                │ 3,651일 │                      │        │
└────────────┴────────────────┴────────┴──────────────────────┴────────┘
소유기간 3,651일(5년 이상 — 영 §168의6 제1호)에서 사업용으로 본 기간 2,556일, 비사업용으로 본 기간 1,095일
  · 양도일 직전 5년(1,826일) 중 비사업용 기간 1,095일 — 기준 730일 초과      → 충족
  · 양도일 직전 3년(1,095일) 중 비사업용 기간 1,095일 — 기준 365일 초과      → 충족
  · 소유기간 3,651일 중 비사업용 기간 1,095일 — 소유기간의 100분의 40(1,460일) 초과 → 미충족
세 기준을 모두 충족해야 비사업용이다 — 위에서 미충족이 있어 사업용으로 본다.
```

- 변수 약어·`floor` 미노출 규칙은 §7.2 그대로. 문구에 법령에 직접 규정이 없다는 점을 남긴다: 엔진 상수 «과세기준일(매년 6월 1일) 현재 상태를 그 해 소유일 전체에 적용한 판정 단위는 법령에 직접 규정이 없어 확인이 필요합니다»(Q-7 한정 고지의 한 줄).
- testid: `nbl-state-history-tax-base-years`(표) · `nbl-state-history-criteria`(3기준) — 기존 `…-interval-{i}`는 일 단위 사건 구간 행으로만 쓴다.
- 구 결과(echo 없음)·`unchanged`·`unknown`은 현행 분기 그대로.

### 17.4 엔진 측에 추가 요구 (R12 다음)

| # | 요구 | 이유 |
|---|---|---|
| R13 | `stateHistory.taxBaseYears[]`(연도·기준일·윈도·소유일수·건축물·재산세 구분·사업용) + 소유일수 합 = `totalOwnershipDays` 검산 | ⑤ 표 2 · ⑦ 표 · D10 |
| R14 | 고지 문구 1줄 추가(판정 단위 + 같은 해 안 변화는 판정에 쓰이지 않음 + 법령 직접 규정 확인 필요) — `nbl-confirm-notices.ts` 단일 소스 | ⑤ 안내 · ⑦ 카드 |
| R15 | (UV-16 결정 시) 사건별 «6.1.에 걸림/흡수됨» 플래그 echo | 사건 행 배지 |

### 17.5 테스트·PR 영향

- **U1**: 미리보기 표 2 + 합계 검산 렌더 anchor(엔진 leaf 출력과 동일 — 같은 입력에서 표 값이 `foldStateToTaxBaseYears` 결과와 일치) · 같은 해 안 두 사건 배지. +≈40줄.
- **U2**: 카드의 과세연도 표 + 접기 표시 + 고지 문구 anchor. `NblStateHistoryPeriodBlock` ≈110 → ≈140줄 예상.
- **U3(E2E)**: §11.2 5건 + **E6 6.1. 경계 쌍** — 취득 2014-01-01 · 양도 2024-01-01 · 꼬리 별도합산에서 준공 2022-06-01(→ 사업용) / 2022-06-02(→ 비사업용)가 결과 카드에서 갈리는지(엔진 §6 N1/N2 실측) + 과세연도 표 렌더 + 요청 body 도달.
- 픽스처 보정(UV-10)·`INPUT_CONSUMPTION` 열은 v1과 같다.
