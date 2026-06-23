# 작업 계획서 — 상속세·증여세 마법사 안내문 정리 (분량 감축 / 기본 접기)

> 상태: Plan (Do 미착수)
> 작성일: 2026-06-23
> 범위: **상속세·증여세 입력 마법사** (파일럿). 검증 후 6대 세목 전체로 확장.
> 접근 방식(확정): **분량 감축 — 기본 접기(progressive disclosure)**. 단, 아래 가드레일 5종을 동시에 강제.

---

## 1. 배경 · 문제 정의

상속세·증여세 입력 폼은 안내문이 **항상 펼쳐진 채** 비슷한 밝은 톤으로 깔려 있어, 정작 눈에 띄어야 할 **검증 오류·차단 경고**가 묻힌다. 실측 인벤토리:

| 유형 | 상속세 | 증여세 | 기본 상태 | 시각 피로 |
|---|---|---|---|---|
| 색상 안내 카드 (`bg-{tone}-50/40`) | ~212 | ~31 | **항상 노출** | 높음 |
| FieldCard `hint=` (항상 노출 회색 텍스트) | ~102 | ~9 | **항상 노출** | 중~높음 |
| 섹션 설명문 `<p>` | 다수 | 다수 | **항상 노출** | 중~높음 |
| LawArticleModal 배지 | ~85 | ~3 | 배지만(클릭=모달) | 낮음 |
| rose 경고/오류 배경 | ~118 | — | 혼용 | — |

(출처: 인벤토리 조사 — `components/calc/inheritance/*`, `components/calc/gift/*`)

**핵심 진단**: 문제는 "안내문이 많다"보다 **위계가 없다 + 항상 노출**이다.
1. 모든 안내가 동시에 펼쳐져 초기 화면 스크롤이 길고 빽빽하다.
2. `rose` 색이 **검증 오류 · 일반 경고 · 파괴 액션**에 혼용되어 경보색이 희석된다.
3. 법정 한도(예: "최대 6억")·변경이력 같은 **중요 수치가 회색 hint 텍스트에 묻힌다**.

---

## 2. 결정적 사실 — 인프라는 이미 존재한다 (재사용)

새 패턴을 발명하지 않는다. 아래는 **이미 구현·검증된 접기 자산**이며, 일부 단계는 이미 적용돼 있다.

| 자산 | 위치 | 현황 |
|---|---|---|
| `Step4DeductionGroup` | `components/calc/inheritance/Step4DeductionGroup.tsx` | **Step 4(공제)에 적용 완료** — `defaultOpen=false`, 번호·색상 헤더 유지, 체크리스트 칩 클릭 시 자동 펼침, 인쇄 자동 펼침(`hidden print:block`), 정적 tone 매핑 |
| `CollapsibleEstateGroup` | `components/calc/inheritance/CollapsibleEstateGroup.tsx` | **Step 1(상속재산)에 적용** — 번호·색상 카드 접기, 접으면 "N건·합계" 요약, 본문 unmount 안 함(입력·포커스 보존) |
| `ExpandToggleButton`/`expandToggleClass`/`expandToggleLabel` | `components/calc/results/shared/ExpandToggleButton.tsx` | 6세목 입력폼+결과 전역 표준 토글 |
| `CollapsibleHintCard` | (gift-tax-form-shared.tsx 등) | 동형 hint 접기 헬퍼 |
| `DeductionLimitNoticeCard` | `components/calc/inheritance/DeductionLimitNoticeCard.tsx` | 한도 고지 카드 — 수치 승격 대상의 참고 패턴 |

**섹션번호 정책 충돌이 자동 해소된다**: 접기 패턴은 번호·색상을 **접힌 헤더 바**에 남기므로 `feedback_section_card_numbering`(색상 카드 + 원형 번호 필수)을 위반하지 않는다. 본문만 접힌다.

---

## 3. 목표 · 성공 기준 (측정 가능)

| # | 성공 기준 | 측정 방법 |
|---|---|---|
| G1 | **빈 폼 신규 진입 시** 초기 always-on 안내 카드/설명문 수 ≥ 50% 감축 (※ 데이터 있는 재진입은 GR-3로 펼쳐지므로 측정 기준은 빈 폼) | before/after: 각 Step 빈 폼 초기 렌더에서 보이는 색상 카드·`<p>` 설명문 카운트 |
| G2 | **검증 오류·차단 경고는 100% 항상 가시** (접힌 섹션에 들어가도 강제 펼침) | E2E: 필수 필드 미입력 → 오류가 화면에 보임(접힘 무관) |
| G3 | 법정 수치 한도(예: 배우자 30억·동거주택 6억)가 **회색 hint 밖(라벨·배지)에서 가시** | 시각 점검 + grep: 한도 수치가 label/badge에 존재 |
| G4 | rose 색 = **검증 오류·차단·무효 전용**. 일반 경고=amber, 정보=sky로 일관 | grep: rose 사용처가 오류/차단/무효에 한정 |
| G5 | 기존 동작·계산 **회귀 0** (tsc 0건 · 전체 vitest · 상속/증여 E2E) | `npm run check:pre-pr` + 세목 E2E |
| G6 | 데이터가 이미 있는 섹션은 **자동 펼침**(클릭수 가드) | E2E: 값 있는 상태로 재진입 시 해당 섹션 펼쳐짐 |

---

## 4. 설계 원칙 + 가드레일 (분량 감축의 안전장치)

분량 감축은 **숨김**이므로 5가지 가드레일을 동시에 적용한다.

- **GR-1 (법적 정보 숨김 방지)**: 접히는 것은 *서술형 설명·요건 해설·중복 안내*뿐. **법정 한도 수치, 검증 오류, 차단 경고**는 접기 대상이 아니다. 한도 수치는 hint에서 **필드 라벨 또는 배지로 승격**.
- **GR-2 (오류 절대 비은닉 — render-derive)**: 접힌 섹션이 검증 오류/차단 사유를 포함하면 **자동 펼침**. 구현은 **render 시점 파생**으로: `open = userToggled ?? (hasError ‖ hasData ‖ required)`, 그리고 오류가 있으면 사용자가 접어도 `open ‖ hasError`로 **강제 펼침 유지**. `useEffect→state` set으로 구현 금지(GR-4). 입력은 Phase 0 감사의 "오류 렌더 위치"가 그대로 제공. 추가로 Step 상단 **오류 요약 배너**(있을 때만)로 2차 노출.
- **GR-3 (클릭수 가드)**: 기본 접힘이되 ① 데이터가 이미 있는 섹션, ② 해당 단계의 필수/대표 섹션, ③ 오류 포함 섹션은 **초기 펼침**. "전부 접힘"이 아니라 "관련 없는 것만 접힘".
- **GR-4 (인쇄·미러링·무한루프 안전)**: 인쇄 시 CSS-only 자동 펼침(`hidden print:block` — `print-only-css-toggle`). 펼침 상태를 `useEffect → store`로 미러링 **금지**(`feedback_useeffect_store_mirror_forbidden`). tone은 정적 Record(`feedback_tailwind_static_tone_mapping`).
- **GR-5 (접힌 본문 unmount 금지)**: 접힘은 **CSS hidden 토글**로만(본문 DOM 유지). unmount하면 입력값·포커스·교차필드 검증 상태가 소실되고 차단 validation이 우회될 수 있다. `CollapsibleEstateGroup`("본문 unmount 안 함")과 동일.

---

## 5. 작업 분해 (Phase)

### Phase 0 — 현황 감사 (verify-first, 코드 무변경)
- 상속세 Step 0~4 + 증여세 폼에서 **각 섹션이 (a) 이미 접기 적용 / (b) 항상 펼침** 인지 표로 확정.
- **검증 오류가 현재 어디에 렌더되는지** 추적 → 접기 적용 시 은닉될 위험 지점 목록화(GR-2 대상).
- before 정량값 캡처(G1·G3 기준선).
- 산출물: 감사표(섹션 × 현재상태 × 접기대상여부 × **오류렌더위치** × 토글축분류). "오류렌더위치" 열은 **GR-2 강제펼침 구현의 직접 입력**.
- **verify**: 감사표의 모든 "항상 펼침" 주장이 file:line으로 뒷받침될 것.

### Phase 1 — 항상 펼친 worst-offender 섹션을 접기 패턴으로 전환

**Phase 1-0 (선행 분류 — 필수)**: 두 축을 혼동하지 말 것 (`feedback_three_state_optional_mode_toggle`).
- **적용여부 축** = `ToggleCard`(3-state optional: undefined OFF / [] ON빈 / [...] 데이터). 이 섹션이 **계산에 포함되는가**를 결정 — 데이터에 영향. **Collapsible로 바꾸면 안 됨** (의미 파괴).
- **표시접기 축** = `Collapsible*`(긴 본문을 시각적으로만 접음, 데이터 무영향).
- 각 대상 섹션이 어느 축인지 먼저 판정. ToggleCard 섹션은 *그 안의 긴 본문*만 Collapsible로 접고, ToggleCard 자체(ON/OFF)는 유지.

대상(인벤토리 상위):
- `FamilyBusinessEligibilitySection.tsx` (605줄, 색상카드 12, **ToggleCard 사용** — 축 분류 후 본문만 접기)
- `FarmingEligibilitySection.tsx` (727줄, 색상카드 5)
- `PresumedInheritanceInput.tsx` (381줄, 색상카드 8) — §15 구간 카드
- `CohabitRequirementBlock.tsx` — 동거 요건 해설
- `steps.tsx` (Step 0~2: 피상속인·상속인·채무·장례비·비과세, 색상카드 4)
- (증여) `GiftCreditChecklist.tsx` — violet 공제 칩 패널. **증여는 이미 정돈됨**(hint 9·카드 31)이라 범위는 이 파일 한정.

방법: 각 섹션을 `Step4DeductionGroup`/`CollapsibleEstateGroup`과 **동일 패턴**으로 감싼다(번호·색상 헤더 유지, 본문 접기, unmount 금지=GR-5). GR-2/GR-3 초기 펼침 규칙 주입.
- **verify**: 각 전환 섹션에 대해 E2E 1건 — 값 없으면 접힘, 값/오류 있으면 펼침.

### Phase 2 — hint 티어링 (수치 승격 + 서술 on-demand)
- `hint=`의 **법정 수치 한도**(예: 배우자 30억·5억, 동거주택 6억, 금융 2억) → **필드 라벨 또는 `trailing` 배지로 승격**(GR-1·G3).
- 순수 서술형 설명("왜·어떻게")은 `CollapsibleHintCard`/ⓘ on-demand로 강등.
- **placeholder 숫자 예시 금지** 정책 유지(`feedback_no_won_suffix` 인접 규칙) — 형식 설명은 여전히 hint, 단 항상노출 분량만 축소.
- **verify**: 승격한 한도 수치가 라벨/배지 텍스트에 grep으로 존재.

### Phase 3 — 색 의미 표준화 (rose 경보색 회수)
- `rose` = **검증 오류 · 차단 · 무효**에만. 현재 rose로 표시되던 *일반 경고*는 `amber`, *정보*는 `sky`로 재배정.
- 정적 tone Record로 일관 적용(`feedback_tailwind_static_tone_mapping`).
- **verify**: rose 사용처 grep → 전부 오류/차단/무효 의미인지 1:1 확인.

### Phase 4 — 가드레일 마감 + 회귀
- Step 상단 **오류 요약 배너**(오류 있을 때만, GR-2 2차 노출).
- 인쇄 자동 펼침 회귀 확인(`hidden print:block`).
- **펼침/접기 토글 표준** grep 자가점검(`feedback_result_expand_toggle_standard` — 경로 직접 나열·`▼|▲`).

---

## 6. 리스크 · 정책 정합

| 리스크 | 대응 |
|---|---|
| 법적 정보 숨김 (사용자 메모 우려) | GR-1: 한도·오류·차단은 접기 제외. 수치는 라벨/배지 승격 |
| 섹션번호 정책 충돌 | 번호·색상을 접힌 헤더에 유지 → 위반 아님 |
| 클릭수 증가 | GR-3: 데이터/필수/오류 섹션 초기 펼침 |
| `useEffect→store` 미러링 무한루프 | GR-2 render-derive(`open=userToggled ?? (hasError‖hasData‖required)`)·display fallback (`feedback_useeffect_store_mirror_forbidden`) |
| **ToggleCard 3-state 의미 파괴** | GR-3/Phase1-0: 적용여부 축(ToggleCard)을 표시접기 축(Collapsible)으로 바꾸지 않음 (`feedback_three_state_optional_mode_toggle`) |
| **접힘 시 폼 상태 소실·validation 우회** | GR-5: CSS hidden 토글만, 본문 unmount 금지 |
| 차단 validation E2E 광범위 영향 | 본 작업은 표시층만 — 계산·validation 로직 불변. 그래도 상속/증여 전 경로 E2E 회귀(`feedback_blocking_validation_full_e2e_regression`) |
| 펼침토글 grep 거짓 0건 | 경로 직접 나열·BSD `▼|▲`(`feedback_result_expand_toggle_standard`) |

---

## 7. 검증 계획 (Definition of Done)
- [ ] Phase 0 감사표 — 모든 주장 file:line 실측 (+ 오류렌더위치·토글축 분류 열)
- [ ] Phase 1-0 ToggleCard 축 분류 완료 (적용여부 축은 Collapsible 전환 금지)
- [ ] 접힘 본문 unmount 안 함(GR-5) — 접었다 펴도 입력값·포커스 보존 E2E
- [ ] before/after 정량(G1·G3) 캡처
- [ ] 전환 섹션별 E2E (접힘/펼침/오류 강제펼침)
- [ ] 상속·증여 전체 E2E 회귀(baseline 대조 — stale spec 주의: `project_inheritance_stale_e2e_specs`)
- [ ] `npx tsc --noEmit` 0건 · 전체 `npm test`
- [ ] rose/hint grep 자가점검
- [ ] 인쇄 자동 펼침 **E2E** 확인 (수동 확인 금지 — `feedback_browser_verify_with_playwright`)

---

## 8. 파일럿 후 확장 (상속·증여를 먼저 하는 이유)
검증 후 동일 패턴을 **양도·취득·재산·종부세**로 확장. 접기 인프라는 이미 6세목 공용(`ExpandToggleButton`)이므로 세목별 worst-offender 섹션 식별 + 동일 4-Phase 반복.

## 9. 비범위 (Out of Scope) · 범위 명확화
- **모바일**: 동일 접기 컴포넌트가 반응형으로 함께 적용되므로 별도 작업 아님(범위 내, 추가 비용 0). 단 `InheritanceMobileSummaryBar` 등 모바일 전용 요약은 본 작업에서 레이아웃 변경하지 않음.
- 계산 엔진·validation 로직 변경 (표시층만)
- 법조문 배지 **삭제** (제거 아님 — 클릭=모달 그대로 유지, 항상노출 분량만 축소 검토)
- 색상 팔레트 전면 리디자인
- 결과 화면(이미 펼침토글 표준 적용 완료)
