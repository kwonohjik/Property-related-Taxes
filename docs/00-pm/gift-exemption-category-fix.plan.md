# 증여세 비과세 체크리스트 category 분기 수정 계획서 (a 방향: 근본 수정)

> 작성일: 2026-06-19 · worktree `fix/gift-calc-bug` · 대상: 증여세 Step3 "비과세·합산"
> 성격: **계산 버그 수정**(상속세 §12·§16·§17 항목이 증여세에 부당 적용). probe로 실증됨.

## 1. 버그 요약 (실증)

증여세 계산기 Step3에 **상속세 비과세 항목**(상증법 §12 금양임야·묘토·족보·제구·국가유증·이재구호 / §16 공익법인 / §17 공익신탁)이 노출되고, **선택 시 증여세 엔진이 실제로 차감**한다.

- **probe 실증**: `evaluateExemptions([{ruleId:"inh_state_bequest", claimedAmount:1억}], 5억)` → `totalExemptAmount === 100,000,000`(증여 과세가액에서 그대로 차감). 금양임야 면적한도(상증령 §8③) 로직도 증여에 적용.
- 즉 **죽은 UI 아님 → 계산 버그**: 사용자가 잘못 노출된 항목을 체크하면 증여세가 법보다 과소 계산.

## 2. 근본 원인 (실측 file:line)

| # | 원인 | 위치 |
|---|---|---|
| C1 | **칩 패널이 category 무시·inh_* ID 하드코딩** | `ExemptionChecklistPanel.tsx:177·196`(`NONTAXABLE_RULE_IDS`/`NOT_INCLUDED_RULE_IDS`) |
| C2 | 그 ID 배열·메타가 상속세 전용 | `lib/calc/inheritance-exemption-checklist.ts:45-101`(`EXEMPTION_CHECKLIST_META`·ID 배열 = inh_* only) |
| C3 | 부모가 Panel에 **category/rules 미전달**(items만) | `ExemptionChecklist.tsx:415-422` |
| C4 | 입력 섹션 서브타이틀 "상증법 §12"·"§16·§17" 하드코딩 | `ExemptionChecklist.tsx:429·(notIncluded subtitle)` |
| C5 | (엔진) `findExemptionRuleById`가 `ALL_EXEMPTION_RULES`(상속+증여) **category 필터 없이 전역 조회** | `exemption-rules.ts:377-385` · `exemption-evaluator.ts:269` |

**중요(범위 한정)**: 부모의 **입력 섹션은 이미 정상** — `nonTaxableRules`/`notIncludedRules`가 category 필터된 `rules`(`ExemptionChecklist.tsx:333·375-378`)에서 도출됨. 즉 버그는 **상단 칩 패널 + 서브타이틀**에 국한. 증여 규칙(`GIFT_EXEMPTION_RULES`, `exemption-rules.ts:234~`)은 이미 존재(gift_living_cost 생활비·교육비·치료비 §46 5호, gift_congratulatory 축의금·부의금, gift_wedding_gifts 혼수품, gift_scholarship, gift_disaster_relief, gift_veterans_benefit, gift_public_trust, gift_disabled_trust 등 8종).

## 3. 수정 설계 (a 방향 — Panel category 분기 + 메타 일원화)

### 3-1. 칩 패널을 "규칙 기반"으로 전환 (핵심)
inh_* 하드코딩 ID 배열 + inh_-only `EXEMPTION_CHECKLIST_META` 대신, **부모가 이미 가진 category-필터 규칙 배열을 Panel에 주입**해 그 규칙으로 칩을 렌더.

- `ExemptionChecklistPanel` props에 `nonTaxableRules: ExemptionRule[]` · `notIncludedRules: ExemptionRule[]` 추가(부모 `ExemptionChecklist.tsx:375-378`의 동일 배열 전달).
- 칩 라벨 = `rule.name`(예: "생활비·교육비·치료비"), 그룹/색조 = `rule.taxTreatment`(`non_taxable`→sky / `not_included`→violet) 또는 섹션 인자.
- 기존 `NONTAXABLE_RULE_IDS.map(...)` → `nonTaxableRules.map(rule => <ExemptionChip rule={rule} .../>)`.
- `ExemptionChip`이 `EXEMPTION_CHECKLIST_META[ruleId]` 대신 전달받은 `rule`에서 label·group 직접 사용 → **inh_-only META 의존 제거**(메타 일원화).

### 3-2. 그룹 헤더·서브타이틀 category-aware
- 칩 그룹 헤더: 상속 "비과세 §12"/"불산입 §16·§17" → 증여 "비과세 §46"/(불산입 있으면 "§48·§52"). 헤더 라벨을 category 또는 rule.lawRef 기반으로 도출.
- 입력 섹션 서브타이틀(`ExemptionChecklist.tsx:429`) "상증법 §12" → category별 분기(증여 "상증법 §46").
- 증여에 `not_included` 그룹 규칙이 없으면 violet 그룹 미렌더(이미 `notIncludedRules.length > 0` 가드 있음 → 패널도 동일 가드).

### 3-3. (권장 하드닝) 엔진 category 가드 — 실제 계산 구멍 폐쇄
UI를 고쳐도 **stale 저장 계산·직접 API 호출**로 inh_* 가 증여 엔진에 도달하면 여전히 차감됨(C5). 방어:
- `evaluateExemptions(items, grossValue, expectedCategory?)`에 expected category 인자 추가 → 각 `rule.category !== expectedCategory`면 **무시 또는 검증오류**. `gift-tax.ts`/`inheritance-tax.ts` 호출부에서 category 전달.
- 또는 호출 전 `input.exemptions`를 category로 필터. 위치: `gift-tax.ts:113-117` / 상속세 동일 지점.
- **권장**: 이 가드까지 포함해야 "계산 버그" 근본 폐쇄. UI-only 수정은 신규 입력만 차단(기존 데이터·API 경로 잔존). → 계획 채택 여부 §결정 필요.

## 4. 변경 파일

| 파일 | 작업 |
|---|---|
| `components/calc/exemption/ExemptionChecklistPanel.tsx` | props에 rules 배열 추가, 칩을 rule 기반 렌더, META/ID 배열 import 제거, 헤더 category-aware |
| `components/calc/exemption/ExemptionChecklist.tsx` | Panel에 `nonTaxableRules`/`notIncludedRules` 전달, 입력 섹션 서브타이틀 category 분기 |
| `lib/calc/inheritance-exemption-checklist.ts` | (메타 일원화 시) `EXEMPTION_CHECKLIST_META`·ID 배열 deprecate/축소. `exemptionItemHasValue`는 유지 |
| `lib/tax-engine/exemption-evaluator.ts` (하드닝 채택 시) | `evaluateExemptions` category 가드 |
| `lib/tax-engine/gift-tax.ts` · `inheritance-tax.ts` (하드닝 채택 시) | 호출부 category 전달 |

## 5. 동기화 지점

순수 표시+검증 수정. 엔진 input/result 타입 무변경(하드닝 시 evaluateExemptions 시그니처만).
- ⑤ UI 위젯: 증여 칩=gift_* / 상속 칩=inh_* 정확 렌더, 그룹 헤더 라벨.
- ⑦ 결과: 변동 없음(차감 로직 동일, 단 올바른 항목만 도달).
- ⑧ Validation/엔진 가드(하드닝): cross-category exemption 거부.

## 6. 검증 / 테스트 (Pre-Do anchor 우선)

- **회귀 anchor(필수)**:
  - 증여 Step3 렌더 → 칩에 "금양임야"·"묘토"·"공익법인" **미노출**, "생활비·교육비·치료비"·"축의금·부의금" 등 gift_* **노출**.
  - 상속 Step3 렌더 → 기존 inh_* 칩 **그대로 노출**(회귀 0).
  - (하드닝 채택 시) `evaluateExemptions([{ruleId:"inh_state_bequest",...}], grossValue, "gift")` → **차감 0 또는 throw**(현재 1억 차감 → 0으로 바뀌는 anchor가 계산버그 수정 증명).
- 단위/컴포넌트 테스트: ExemptionChecklistPanel category별 렌더 RTL 테스트.
- E2E: 증여 계산기 Step3 칩 라벨 검증(gift_* 노출·inh_* 부재). worktree → `E2E_PORT=3102`.
- 전체 회귀: `npm test`(상속세 비과세 테스트 깨짐 0 확인 — 같은 컴포넌트 공유).

## 7. 위험 / 함정

- **상속세 회귀**: ExemptionChecklist/Panel은 상속세와 **공유 컴포넌트** → 변경이 상속세 Step3에 영향. 상속 inh_* 칩·입력 섹션·금양임야 면적입력·공익법인 주식입력(`ExemptionChecklist.tsx:142`) 회귀 전수 확인.
- **stale 저장 계산**: 기존에 증여+inh_ exemption으로 저장된 이력(IndexedDB/Supabase)이 있으면, UI-only 수정 후에도 재계산 시 엔진이 차감(C5) → 하드닝 가드가 이를 차단.
- **메타 일원화 시 라벨 변화**: 칩 라벨을 `rule.name`으로 바꾸면 기존 상속 라벨("국가·지자체 유증" vs rule.name "국가·지방자치단체 유증" 등) 문구 미세 차이 가능 → 상속 E2E 라벨 매칭 영향. rule.name과 META label 대조 후 진행.
- 정책: `feedback_numeric_impact_verify_before_bug_claim`(probe 완료) · `feedback_pre_anchor_verification`(회귀 anchor 선작성).

## 8. 결정 필요 사항

1. **엔진 하드닝(§3-3) 포함 여부**: 포함=계산버그 근본 폐쇄(권장) / 미포함=UI-only(신규 입력만 차단, 기존 경로 잔존).
2. **메타 처리**: rule 기반 일원화(권장, inh_ META 제거) / inh_·gift_ META 병존(보수적, 변경 최소).

## 9. 범위 외

- 증여 비과세 규칙 자체의 정합성(GIFT_EXEMPTION_RULES 내용 검증)은 별도.
- 다른 세목.
