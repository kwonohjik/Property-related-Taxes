# 상속세 비과세·과세가액 불산입(Step2) — 체크리스트 선택형 입력 구조 계획

> 작성일 2026-06-13 · 브랜치 `feat/step3-exempt` · dev 3003 / E2E 3103
> 선행 사례: Step4 공제 체크리스트(PR#179 `inheritance-step4-deduction-checklist.plan.md`) — 패턴·교훈 재사용
> 정책: feedback_three_state_optional_mode_toggle · feedback_useeffect_store_mirror_forbidden · single-source-engine-helper · feedback_result_expand_toggle_standard

## 1. 목표 / 배경

마법사 Step2("비과세·과세가액 불산입") 화면은 마스터 토글 "여" 선택 시 **8개 항목이 각각 여/부 토글로 모두 세로 나열**되고, "여"인 항목은 금액·면적·협의분할까지 펼쳐져 화면이 매우 길다(첨부 이미지). → 무엇을 입력하는지 한눈에 파악 어려움.

개선: Step4와 동일하게 **상단 체크리스트 패널에서 해당 항목만 체크 → 체크된 항목만 입력 섹션 노출 + 디폴트 접힘 + 체크 시 자동 펼침**.

**Step4 대비 핵심 차이(더 단순)**: Step2의 8개 항목은 **전부 순수 수동**(비과세·불산입은 납세자가 해당 재산 보유 여부를 아는 것, 자산카드 자동 도출 없음). → Step4에서 골치였던 "법정·자동 공제를 끄면 누락" 함정이 **없다**. 8개 모두 체크박스로 게이팅 안전.

**비목표**: 엔진/계산 로직 변경 없음. 마스터 토글 제거 없음. 채무·공과·장례비 섹션은 별도(현행 유지). 협의분할·면적 한도 등 기존 입력 로직 변경 없음.

## 2. 현행 구조 (file:line 검증 완료 — worktree step3-exempt 기준)

| 사실 | 위치 |
|---|---|
| 마법사 5단계, Step2 = "비과세·장례비" | `components/calc/inheritance/shared.ts:256~262` (STEPS) |
| Step2 본체 + ExemptionChecklist 호출 | `components/calc/inheritance/steps.tsx:168~302` (`Step2()`), 호출 `:206~211` |
| 비과세 패널 컴포넌트 | `components/calc/exemption/ExemptionChecklist.tsx:1~407` |
| 마스터 토글 "비과세·과세가액 불산입 해당 여부" | ExemptionChecklist.tsx:339(title)·348~356(YesNo). "부" → 전 항목 초기화 `:302` |
| 그룹 렌더(비과세 §12 / 불산입 §16·§17) | `:305~311`(필터)·`:358~396`(renderGroup) |
| 개별 항목 행 `ExemptionRow` | `:87~234` — 헤더(라벨·lawRef·YesNoButtons `:113~122`) + ON 펼침(`:124~231`) |
| 항목 펼침: 금액 `CurrencyInput` | `:137~143` |
| 항목 펼침: 면적 `DecimalInput`+한도(금양임야·묘토) | `:147~170` |
| 항목 펼침: 요건/제외 토글(기본 접힘) | `:174~207` |
| 항목 펼침: 협의분할 `ToggleCard`+`HeirAllocationInput`(상속세·`hasDistributableHeir`) | `:211~229` |
| 8종 항목 메타(ExemptionRule[]) | `lib/tax-engine/exemption-rules.ts:84~216` |
| 항목 타입 `ExemptionCheckedItem`(ruleId·checked·claimedAmount·claimedAreaM2·heirAllocations) | `lib/tax-engine/types/inheritance-exemption.types.ts:14~38` |
| FormState.exemptionItems + INITIAL | `components/calc/inheritance/shared.ts:34·185~194` |
| 채무·공과·장례비(독립 섹션, 이미 ToggleCard) | steps.tsx:213~264 |

### 8개 항목 인벤토리 (전부 수동)
| ruleId | 그룹 | 라벨 | 펼침 필드 |
|---|---|---|---|
| inh_state_bequest | 비과세 §12 | 국가·지자체 유증 | 금액 |
| inh_forest_burial | 비과세 §12 | 금양임야 | 금액 + 면적 + 협의분할 |
| inh_grave_land | 비과세 §12 | 묘토 | 금액 + 면적 + 협의분할 |
| inh_ritual_items | 비과세 §12 | 족보·제구 | 금액 |
| inh_emergency_relief | 비과세 §12 | 이재구호금품·치료비 | 금액 |
| inh_political_bequest | 비과세 §12 | 정당 유증 | 금액 |
| inh_public_interest | 불산입 §16 | 공익법인 출연 | 금액 + 협의분할 |
| inh_public_trust | 불산입 §17 | 공익신탁 출연 | 금액 + 협의분할 |

## 3. 설계

### 3.1 상태 — 새 필드 불필요 (Step4보다 단순)
- 항목 체크 상태는 **이미 `exemptionItems[].checked`로 존재**. 이게 곧 체크리스트 상태 = 단일 진실.
- Step4는 `deductionChecklistOverrides` 신규 필드가 필요했으나, Step2는 **추가 상태 0** — `exemptionItems`의 checked/claimedAmount/heirAllocations를 그대로 사용.
- 그룹 카드 접힘 상태만 로컬 `useState`로 관리(controlled, Step4 `groupOpen` 패턴 준용).

### 3.2 UI 재구성 (ExemptionChecklist.tsx 내부 또는 분리)
현행 `renderGroup`(항목을 모두 ExemptionRow로 세로 나열)을 **2영역**으로 분리:

**(가) 상단 체크리스트 패널** (마스터 "여"일 때만)
- 비과세 §12(6칩) + 과세가액 불산입 §16·§17(2칩), 그룹 색조(§12=sky/emerald, §16·§17=violet).
- 각 칩 = 체크박스(`exemptionItems[ruleId].checked` 토글). Step4 `ManualChip` 패턴 재사용(2열 그리드, 미선택도 tone 배경 — ToggleCard 가시성 원칙).
- 값 있는데 미체크면 amber 경고 점(침묵 누락 방지).
- 금양임야·묘토 합산 2억 한도 안내는 기존 위치 유지(`:398~402`).

**(나) 입력 섹션** (체크된 항목만)
- 체크된 ruleId의 `ExemptionRow` 펼침부(금액·면적·요건/제외·협의분할)만 렌더. 미체크 항목은 입력 섹션 미렌더.
- 기존 ExemptionRow 펼침 로직(금액/면적/요건/협의분할) **그대로 재사용** — 펼침 필드 복잡도(항목별 상이)는 현행 코드가 이미 처리하므로 추가 작업 최소.

### 3.3 디폴트 접힘 + 체크 시 자동 펼침 (Step4 패턴)
- 입력 섹션을 그룹(§12 / §16·§17)별 접이식 카드로 묶고 **디폴트 접힘**. 초기값 = 그룹에 체크된 항목이 있으면 펼침(세션/이력 복원 회귀 0), 없으면 접힘.
- **체크리스트 칩 체크 시 해당 그룹 카드 자동 펼침** — 칩 onClick 핸들러에서 직접 `setGroupOpen`(useEffect 미러링 금지, feedback_useeffect_store_mirror_forbidden).
- 그룹 헤더 토글은 표준(`expandToggleClass/Label` 또는 기존 헤더 전체 클릭 패턴) — feedback_result_expand_toggle_standard.

### 3.4 마스터 토글 (변경 불가 — 현행 유지)
- "비과세·과세가액 불산입 해당 여부 여/부" 유지. "부" → 전 항목 초기화·패널 숨김(현행 `:302`). "여" → 체크리스트 패널 노출.
- Step4엔 마스터가 없었으나 Step2는 필수(없으면 "비과세 없음"을 표현 못 함).

### 3.5 채무·공과·장례비 (범위 밖)
- steps.tsx:213~264 독립 섹션, 이미 ToggleCard. 체크리스트 대상 아님. 현행 유지(일관성 위해 디폴트 접힘만 선택 검토 — 결정 §7).

## 4. 동기화 지점 (엔진 무변경 — 클라이언트만)
| # | 지점 | 변경 |
|---|---|---|
| ① 폼 타입 | 변경 없음(exemptionItems 재사용) |
| ②③ initial/normalize | 변경 없음 |
| ④ API 변환 | 변경 없음(미체크=exemptionItems에서 checked=false → 기존 엔진 처리). buildInput의 exemptions 매핑 현행 유지 |
| ⑤ UI 위젯 | ExemptionChecklist 재구성(체크리스트 패널 + 그룹 접이식) |
| ⑥ 사이드바 | 변경 없음 |
| ⑦ 결과 카드 | 변경 없음 |
| ⑧ validation | 변경 없음(미체크 항목은 현행도 미적용). 단 "체크했으나 금액 0" 경고는 기존 로직 확인 |

> 핵심: exemptionItems.checked가 단일 진실이라 ④⑧ 변경이 사실상 없음 — Step4보다 회귀 위험 낮음.

## 5. E2E 영향
관련 spec(여/부 토글 직접 클릭 → **칩 체크 + 그룹 펼침**으로 selector 전환):
- `inheritance-exemption-heir-allocation.spec.ts`(협의분할 ON/OFF)
- `inheritance-gravesite-exemption.spec.ts`(금양임야·묘토 면적·2억 한도)
- `inheritance-public-trust-exemption.spec.ts`(공익신탁)
- `inheritance-exemption-treatment-grouping.spec.ts`(§12 vs §16·§17 그룹)
- `inheritance-corporate-exemption-filing-credit.spec.ts`(공익법인 연계)

처리: 각 spec에서 항목 "여" 클릭 → 체크리스트 칩 클릭(→ 그룹 자동 펼침 + 항목 체크)로 1줄 대체. 신규 `inheritance-step2-exemption-checklist.spec.ts`(칩 체크→펼침·해제→숨김+값보존·디폴트 접힘·2억 한도 표시). baseline 대조로 사전존재 stale(public-trust 등 메모리 6종) 구분.

## 6. 구현 순서 (Do)
1. (선택) 헬퍼 `lib/calc/inheritance-exemption-checklist.ts` — `EXEMPTION_CHECKLIST_META`(ruleId→그룹·tone·label) + `exemptionItemHasValue(item)`. 단 checked가 이미 있어 최소.
2. Pre-Do anchor: 헬퍼/렌더 단위테스트(체크↔펼침, 값보존).
3. ExemptionChecklist.tsx 재구성: 체크리스트 패널 추출(`ExemptionChecklistPanel`) + 입력 섹션 그룹 접이식 + 칩 체크 시 자동 펼침. 800줄 정책(현재 408줄 → 분리 시 패널 별도 파일).
4. 기존 ExemptionRow 펼침부 재사용 연결(금액·면적·요건·협의분할 무변경).
5. E2E: 기존 spec 칩 selector 전환 + 신규 spec. 전체 실행·baseline 대조.
6. tsc · vitest · E2E.

## 7. 결정 필요 사항 (착수 전)
1. **체크리스트 패널 vs 마스터 토글 관계**: 마스터 "여" → 바로 체크리스트 패널(권장) vs 마스터 자체를 체크리스트 상단에 통합.
2. **채무·공과·장례비 섹션**: 현행 유지(권장) vs 동일하게 디폴트 접힘 그룹화.
3. **항목 "체크 해제" 시 입력값 처리**: 보존+경고 점(Step4 일관, 권장) vs 즉시 초기화(현행 마스터 "부"는 초기화).
4. **칩 클릭 = 즉시 체크 후 펼침** vs **칩 클릭 = 펼침만, 펼친 뒤 금액 입력해야 실질 체크**(현행 여/부 토글에 가까움). → 권장: 칩 체크 = checked=true + 그룹 펼침(Step4 일관).
