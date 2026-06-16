# NBL 후속 갭 UI 설계 (F1·F2·F3)

> 계획: `docs/00-pm/nbl-gaps/gap-f{1,2,3}-*.plan.md` · 엔진: `nbl-followup-gaps.engine.design.md`. NBL 입력 UI는 `components/calc/transfer/nbl/` (`NblSectionContainer`·`OtherLandDetailSection`·`GracePeriodSection` 등). 결과: `components/calc/NonBusinessLandResultCard.tsx`.

---

## 1. F1 — DeemedTransferSection (신규 위젯)

§168의6 기간기준을 쓰는 5 지목(농지·임야·목장·기타토지·별장) 게이트에서 노출. `RadioCardGroup`(native 금지) 6옵션 + reason≠none 시 조건부 `DateInput`.

```
┌─ 양도일 의제 (§168의14②) ──────────────────────────────────┐
│ 경매·공매·장기매각으로 양도가 지연된 경우, 의제일을 양도일로  │
│ 보아 기간기준(§168의6)만 재판정합니다. (양도차익·세율은 실제  │
│ 양도일 기준)                                                  │
│                                                              │
│ ○ 해당 없음 (실제 양도일)        ○ 민사집행법 경매            │
│ ○ 국세징수법 공매                ○ 캠코 매각위임              │
│ ○ 3개 일간신문 공고              ○ 매년 재공고                │
│                                                              │
│ [reason≠none 일 때만]                                        │
│ 의제 양도일 (최초 경매기일/공매일/위임일/최초 공고일)         │
│ ┌────────────┐                                              │
│ │ 2020-01-01 │  ← DateInput (type=date 금지, DateInput)      │
│ └────────────┘                                              │
└──────────────────────────────────────────────────────────┘
```

- 바인딩: `nblDeemedTransferReason`(RadioCardGroup value) · `nblDeemedTransferDate`(DateInput).
- testid: `nbl-deemed-reason` · `nbl-deemed-date`.
- 노출 게이트: `NblSectionContainer`에서 landType ∈ {farmland, forest, pasture, other_land, vacant_lot, miscellaneous, villa_land}. (housing_site 제외 — §168의6 미적용.)
- OFF(none)도 tone 유지(memory `feedback_toggle_card_visibility`).
- 신문공고/재공고 요건(매각예정가≤시가·70% 6월후·1년내 계약)은 안내 hint만(자동검증 scope OUT).

---

## 2. F2 — OtherLandDetailSection 확장 (별표 하위 선택)

기존 `relatedBusinessType` RadioCardGroup(10옵션, 갭3a)에서 sports·reserve_forces 선택 시 하위 위젯 노출.

```
relatedBusinessType = "sports" (1호 체육시설) 선택 시:
┌─ 체육시설 종목 (별표3) ─────────────────────────────────┐
│ Select ▼  [실외: 축구장11,000 / 야구장14,000 / … 11종]   │
│           [실내: 구기800 / 수영1,000 / 빙상1,800]         │
│ ※ 종목 합산·용도지역별 배율(실내 부속토지)은 직접입력      │
│ — 미선택 시 ↓ 기준면적 직접입력                            │
│ 기준면적(㎡) [____]  ← standardAreaLimit fallback (DecimalInput)│
└─────────────────────────────────────────────────────────┘

relatedBusinessType = "reserve_forces" (5호 예비군) 선택 시:
┌─ 예비군훈련장 (별표6) ──────────────────────────────────┐
│ 부대편성인원 Select ▼ [800↓ / 801~2,400 / 2,401~5,000 / 5,001↑]│
│ 포함 시설 (전술교육장 외 실시 불가 시):                   │
│  ☑ 전술교육장  ☐ 사격술예비훈련장  ☐ 사격장  ☐ 기초훈련장 │
│ → 자동 합산 기준면적: 32,475㎡                            │
└─────────────────────────────────────────────────────────┘
```

- 바인딩: `nblOtherSportsFacilityType`(Select) · `nblOtherReserveUnitSize`(Select) · `nblOtherReserveFacilities`(체크박스 배열).
- testid: `nbl-other-sports-facility` · `nbl-other-reserve-unit` · `nbl-other-reserve-fac-{tactical|shooting_prep|range|basic}`.
- Select는 `<SelectValue/>` 단독 금지 — SelectTrigger 명시 라벨(memory `feedback_select_component`).
- 3중 fallback: 하위 선택 미입력 시 `standardAreaLimit` DecimalInput 유지(API·validate 동일 fallback).
- resort(6호)·복잡 비고는 직접입력 + violet 안내 카드(§83의4⑫ 3요소).

---

## 3. F3 — 결과 표시 갱신 (신규 입력 없음)

F3는 사용자 입력 위젯 없음(엔진 파생). 결과 2곳:

### 3-1. `NonBusinessLandResultCard.tsx:90~102` 안내문 갱신
```
면적 안분
[████████░░░░] 사업용 1,000㎡ / 비사업용 500㎡ (33.3%)
─────────────────────────────────────────────
기준면적 초과분 500㎡(33.3%)에만 중과세(+10%p)가 적용됩니다. (§168의11⑤⑥)
```
(현재 line 102 "초과분만의 부분 안분 중과는 반영되지 않습니다" → 위 문구로 교체.)

### 3-2. 본 결과 산식 step (`transfer-tax-finalize.ts`)
```
비사업용 토지 중과 (부분 안분)
누진세율 산출세액 + (과세표준 × 비사업용 면적비율 33.3%) × 10%p
= 누진세액 + 중과분        (실효 가산 3.33%p)
```
변수 약어·floor() 금지, 한국어 풀어쓰기(memory `feedback_result_view_korean_formula`).

---

## 4. 14지점 UI 매핑 (클라 8)

| 지점 | F1 | F2 | F3 |
|---|---|---|---|
| ① 폼 | nblDeemedTransferReason·Date | nblOtherSportsFacilityType·ReserveUnitSize·ReserveFacilities | — |
| ② initial | "none"·"" | ""·""·[] | — |
| ③ normalize | NBL_DEFAULTS 동일 | NBL_DEFAULTS 동일 | — |
| ⑤ UI 위젯 | DeemedTransferSection | OtherLandDetailSection 하위 | 없음 |
| ⑥ 사이드바 | N/A | N/A | N/A |
| ⑦ 결과카드 | 의제일·사유 행 | 자동 기준면적·별표 근거 | 안내문 갱신·부분안분 세액 |
| ⑧ validate | reason≠none→의제일 필수 | sports/reserve→하위 or 직접입력 필수 | — |

배열 필드(`nblOtherReserveFacilities`)는 ④ prefix-pick 직렬화 + ⑫ Zod `z.array(z.string())` 확인(memory `feedback_explicit_prop_mapping_strip`).

---

## 5. E2E

- `e2e/transfer-nbl-deemed-transfer.spec.ts`(F1): reason 라디오 선택→DateInput 노출→계산→결과 의제일 행. ★worktree `E2E_PORT=3100`(memory `feedback_e2e_worktree_port_isolation`).
- `e2e/transfer-nbl-area-annex.spec.ts`(F2): sports=축구장 선택→자동 기준면적→면적 초과 입력→결과.
- F3는 입력 없음 → vitest anchor(AT-F3-*)로 충족, E2E는 F2 경로에 부분안분 결과 표시 검증 포함.
- testid 직접 나열 grep 자가점검(memory `feedback_result_expand_toggle_standard` ★검증 함정).

---

## 6. UI 검토 (STEP 13)

| # | 카테고리 | 우선순위 | 위치 | 문제 | 정정 |
|---|---|---|---|---|---|
| 17 | UI누락 | Medium | F1 §1 | 노출 게이트에 vacant_lot·miscellaneous(기타토지 하위 landType) 누락 위험 | other_land 계열 3종 명시(반영) |
| 18 | UI누락 | Low | F2 §2 | sportsFacilityType 실외/실내 키 union → Select 그룹 구분 필요 | optgroup 실외11·실내3 (반영) |
| 19 | 개선 | Low | F3 §3-1 | AreaBar는 목장·기타·주택부수만 — 안내문 조건부 | area 존재 시만 갱신 문구(반영) |
