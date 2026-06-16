# NBL 갭 3c — 목장 별표 1의3 인용 정정(즉시) + per-head 가축별 기준면적 수치 정합(정본 확보 후)

> 자동 생성(nbl-gaps-plan 워크플로 planner) — 실제 코드 정독 + KoreanLaw 본문 검증 기반. 마스터: [nbl-remaining-gaps.plan.md](../nbl-remaining-gaps.plan.md)

- **제안 PR**: PR-E. 본 갭은 두 단계로 명확히 분리된다. (E-1) 인용 정정 — 두 개의 오인용 문자열을 정본 위임처로 교체하는 즉시 가능한 충실도 수정. numeric 영향 0, 회귀 위험 최소. 단독 PR로 즉시 머지 가능(다른 NBL 잔여 갭 §168의11②·§83의5·§168의14②와 묶어도 무방하나, 인용 정정은 위험도가 낮아 단독 ship 권장). (E-2) per-head 8축종 수치 정합 — 별표 1의3 정본 표 전체 확보를 blocker로 하는 후속 PR. (E-2) 착수 전까지 (E-1)만 PR-E로 출고하고, (E-2)는 정본 확보 시 별도 PR로 분리. standardArea 직접입력 UI 부재(E-3)는 (E-2) 결정 후 재판단하여 다시 별도 PR.
- **복잡도**: S
- **선행(blocker)**:
  - 별표 1의3(소득세법 시행령) 가축별 기준면적·가축두수 정본 표 전체 미확보 — KoreanLaw get_annexes 도구로 추출 불가(확인됨: lawName='소득세법 시행령 별표 1의3'→'의3'로 망글링되어 NOT_FOUND, annexNo='1의3'/'별표1의3'/'3' 지정 시 별지 제1호·제3호서식으로 fallback, knd=5 목록도 시행규칙 서식만 노출하고 별표 1의3 미surface). (E-2) per-head 8축종 수치 정합·다열 산식(축사+부대시설+초지+사료포) 재설계는 본 정본 확보 후에만 착수 가능. 확보 경로: 법제처 국가법령정보센터 별표 1의3 HWP/PDF 직접 다운로드, 또는 get_annexes 도구 bylSeq 정상화 후 재시도.
  - (E-3) standardArea 직접입력 UI/Zod/store/form-mapper 신설 여부는 (E-2)에서 산식을 단순 ㎡/두 유지로 결정할지 다열 재설계할지 확정한 후에만 판단 — 본 PR(E-1) 범위 밖.

## Anchor 테스트

### AT-PASTURE-CITE-1 (Pre-Do) **[Pre-Do]**
- **시나리오**: judgePasture 입력에 pasture.standardArea를 주지 않고 livestockType='hanwoo' + livestockCount=600 + landArea=10000(자동산출 6000㎡ 가정으로 초과 발생 보장은 무관 — 핵심은 warning 문자열) 으로 호출해 자동 산출 분기를 강제 진입시킨 뒤, 반환 result.warnings 중 자동 산출 메시지가 정본 위임처를 인용하는지 검사. 현행은 '축산법 시행규칙 별표2' 를 인용하므로 정정 문자열로 toContain 단정 시 RED.
- **기대값**: 정정 전(RED): warning 문자열이 '(축산법 시행규칙 별표2)' 를 포함 → 본 anchor의 expect(warning).toContain('소득세법 시행령 별표 1의3') 가 실패. 정정 후(GREEN): warning 문자열이 '소득세법 시행령 별표 1의3'(또는 '소득세법 시행령 별표 1의3(§168조의10③)') 를 포함하고 '축산법' 을 포함하지 않음 → expect(warning).toContain('소득세법 시행령 별표 1의3') 통과 + expect(warning).not.toContain('축산법') 통과.
- **법령근거**: 소득세법 시행령 §168조의10③ — '별표 1의3에 규정된 가축별 기준면적과 가축두수를 적용하여 계산한 토지의 면적' (KoreanLaw get_law_text mst=286211 §168조의10 본문 실측). 자동 산출 산식의 정본 위임처는 별표 1의3이며 축산법 시행규칙 별표2가 아님.

### AT-PASTURE-CITE-2
- **시나리오**: livestock-standards.ts 모듈의 JSDoc 출처 주석을 직접 검사하기보다, LIVESTOCK_STANDARD_AREA 상수값이 정정 후에도 불변(hanwoo=10 등 8축종 동일)임을 toBe()로 고정하는 회귀 anchor. (E-1) 정정은 출처 문자열만 바꾸고 numeric 값은 건드리지 않음을 보장. 주석 텍스트 자체는 런타임 접근 불가하므로 numeric 불변성으로 대리 검증.
- **기대값**: LIVESTOCK_STANDARD_AREA.hanwoo===10, dairy===15, pig_sow===2.5, pig_fattening===0.8, poultry===0.05, horse===20, sheep===2, goat===2 모두 정정 전후 동일 (E-1에서 값 무변경 보장).
- **법령근거**: (E-1) scope: 인용 문자열만 정정, numeric 무변경. per-head 수치 정합은 별표 1의3 정본 확보를 blocker로 하는 (E-2) 후속이므로 본 PR에서는 값 동결.

---

## 갭 3c-pasture-annex — 목장 별표 1의3 인용 정정(E-1, 즉시) + per-head 수치 정합(E-2, blocker)

### 1. 법령 근거 (KoreanLaw 본문 검증 결과)

- **소득세법 시행령 §168조의10③** (KoreanLaw `get_law_text` mst=286211, jo='제168조의10' 본문 실측):
  > ③ 법 제104조의3제1항제3호 가목에서 "대통령령으로 정하는 축산용 토지의 기준면적"이란 **별표 1의3에 규정된 가축별 기준면적과 가축두수를 적용하여 계산한 토지의 면적**을 말한다.
- 따라서 목장용지 사업용 기준면적(=사육두수 × 가축별 단위면적)의 **정본 위임처는 「소득세법 시행령 별표 1의3」**이다. **「축산법 시행규칙 별표2」가 아니다** → 현행 두 인용은 오인용.
- §168조의10①: 목장용지 = 축사·부대시설 토지 + 초지 + 사료포(飼料圃). 별표 1의3는 가축별로 이 항목들을 합산한 기준면적 표일 가능성이 높다(현행 엔진의 단일 ㎡/두 상수와 구조 불일치 정황) — 단 **별표 1의3 정본 표 전체는 미확보**(아래 blocker).
- **`NBL.PASTURE_AREA` 상수는 이미 정확**: `lib/tax-engine/legal-codes/transfer.ts:52` = `"시행령 §168조의10 ③"`. **상수 변경 불필요.** (memory `feedback_127_overlap_exclusion_by_tax` 류 활성상수 추적 정책상, 본 정정은 상수가 아닌 자유 텍스트 인용 2곳만 대상.)

#### Blocker 검증 로그 (별표 1의3 정본 미확보)
- `get_annexes(lawName="소득세법 시행령 별표 1의3", knd="1")` → NOT_FOUND ("소득세법 시행령 의3" 으로 망글링).
- `get_annexes(lawName="소득세법 시행령", annexNo="1의3"/"별표1의3"/"3", knd="1")` → 별지 제1호서식·제3호서식(납세지신고서)으로 fallback. 별표 1의3 미반환.
- `get_annexes(lawName="소득세법 시행령", knd="5")` 목록 100건 → 전부 시행규칙 서식. 별표 1의3 미surface.
- ⇒ **도구로 별표 1의3 정본 표 추출 불가 확정.** per-head 수치 정합(E-2)은 정본 확보 후 착수.

### 2. Scope

**IN (E-1, 본 PR-E):**
- `data/livestock-standards.ts:4` JSDoc 출처 주석 `"출처: 축산법 시행규칙 별표2 (가축사육업 시설 기준)"` → `"출처: 소득세법 시행령 별표 1의3 (가축별 기준면적·가축두수) — §168조의10③ 위임"` 로 교체. (5행 `(시행령 §168조의10 ③)` 위임 표기는 이미 정확 — 유지.)
- `pasture.ts:155` 런타임 warning 문자열 말미 `(축산법 시행규칙 별표2)` → `(소득세법 시행령 별표 1의3 §168조의10③)` 로 교체. 이 warning은 `engine.ts`가 `judgment.warnings`로 수집 → `NonBusinessLandResultCard.tsx:117-128` amber 박스로 **사용자에게 노출**되므로 충실도 영향 직접적.
- numeric 무변경: `LIVESTOCK_STANDARD_AREA` 8축종 값 동결, 산식(`getLivestockStandardArea` = perHead × count) 무변경.
- Pre-Do anchor(AT-PASTURE-CITE-1) + numeric 불변 회귀 anchor(AT-PASTURE-CITE-2)를 `pasture.test.ts`에 추가.

**OUT (후속 분리):**
- **(E-2)** per-head 8축종 수치 정합 — 별표 1의3 정본 확보 blocker. 정본 확인 후 ① 단일 ㎡/두 유지 적정성 판단 또는 ② 다열(축사+부대시설+초지+사료포) 산식 재설계. numeric 영향 발생 시 임계 경계 anchor(landArea = standardArea ±1㎡) 동반. → **별도 PR.**
- **(E-3)** `standardArea`(가축별 기준면적) 직접입력 UI/Zod/store/form-mapper 신설 — 현행 자동산출 단일경로(직접입력 진입점 전무, 확인됨). `nbl-detailed-input-restoration.engine.design.md:33`이 '출처정정 후속'으로 이미 deferred 기록. (E-2) 산식 결정 후 재판단. → **별도 PR.**

### 3. 데이터 모델 변경
- **없음.** (E-1은 문자열 2곳 정정뿐.) `PastureUsage`(types.ts:178-192) 무변경, `LIVESTOCK_STANDARD_AREA` 키·값 무변경.

### 4. 14 동기화 지점 — 실제 건드릴 것 (E-1)

본 갭(E-1)은 **신규 필드 추가가 아니라 엔진 내부 문자열·주석 정정**이므로 14지점 대부분 해당 없음. 실제 영향:

- **① 폼 상태(AssetForm)**: 해당 없음 (필드 무변경).
- **② initial(factory)**: 해당 없음.
- **③ normalize(calc-wizard-asset-nbl)**: 해당 없음.
- **④ API 변환(buildNonBusinessLandRaw)**: 해당 없음. (NBL prefix-pick 자동운반 특성상 필드 신설 시에만 관여 — E-1은 필드 무신설.)
- **⑤ UI 위젯(PastureDetailSection.tsx)**: 해당 없음 (입력 위젯 무변경). standardArea 직접입력 위젯은 E-3 후속.
- **⑥ 사이드바 합계**: 해당 없음.
- **⑦ 결과카드(NonBusinessLandResultCard.tsx)**: **간접 영향만** — 코드 변경 없음. `warnings` 배열을 그대로 렌더하는 `:117-128` amber 박스에 정정된 문자열이 자동 반영됨. 카드 코드 자체는 무변경(데이터-드리븐).
- **⑧ validation(transfer-tax-validate-asset)**: 해당 없음 (현행 pasture 관련 validation 0건, 확인됨).
- **⑨ Zod enum 메인 / ⑩ 컴패니언+addPropertyRefines / ⑪ 자산-수준 acquisitionDate fallback**: 해당 없음.
- **⑫ Zod 입력객체(transfer-tax-schema-sub nbl*)**: 해당 없음 (필드 무신설; standardArea Zod 추가는 E-3 후속).
- **⑬ callTransferTaxAPI body spread**: 해당 없음 (NBL prefix-pick 자동, 필드 무신설).
- **⑭ Route handler 엔진 input 매핑(buildNblEngineInput·Date변환)**: 해당 없음.

**결론(E-1):** 14지점 중 실제 코드 변경은 0개. 변경 대상은 엔진 데이터/판정 파일 내부 문자열 2곳 + 테스트. ⑦은 데이터-드리븐 자동 반영(코드 무변경). 이 사실은 본 갭이 충실도(인용) 정정에 한정되며 입력·결과 스키마에 영향이 없음을 의미.

(참고 — E-3 착수 시 신규 `nblPastureStandardArea: string` 필드를 추가하면 14지점 중 ①②③(store 3종) + ⑤(UI) + ⑫(Zod) + ⑧(검증)이 발동. ④⑬⑭는 NBL prefix-pick 자동운반. 단 그 시점 별도 계획에서 다룬다.)

### 5. 엔진 로직 (함수·산식·삽입 위치)
- **변경 함수 없음.** 산식 `getLivestockStandardArea(type, count) = (LIVESTOCK_STANDARD_AREA[type] ?? 0) × count` (`livestock-standards.ts:27-33`) 유지. 자동산출 분기 `pasture.ts:150-158`(직접입력 > 자동산출 > 미확정 우선순위) 유지. 면적 안분 `computeAreaProportioning`(`pasture.ts:67-78`) 유지.
- 정정 대상은 `pasture.ts:155`의 warning 템플릿 리터럴 말미 괄호 인용 1개와 `livestock-standards.ts:4` 주석 1줄뿐.

### 6. UI 변경
- **컴포넌트 코드 변경 없음.** `PastureDetailSection.tsx`(축종 Select·사육두수 DecimalInput·상속일·사육기간) 무변경. standardArea 직접입력 위젯 신설은 E-3.
- `NonBusinessLandResultCard.tsx` amber warnings 박스(`:117-128`)는 정정된 문자열을 자동 노출 — 코드 무변경.

### 7. Edge case · Risk
- **(R1) 정정 문구 형식 일관성**: 다른 NBL warning·legalBasis는 '소득세법 시행령 §168조의N' 또는 '시행령 §168조의N' 표기를 혼용. 본 정정은 별표 인용이므로 '소득세법 시행령 별표 1의3 §168조의10③' 로 위임 조항을 병기해 추적성 확보 권장(테스트 toContain 키는 '소득세법 시행령 별표 1의3' 핵심구로 단정해 표기 변형에 강건하게).
- **(R2) numeric 불변 보장**: (E-1)에서 LIVESTOCK_STANDARD_AREA 값을 절대 건드리지 말 것. memory `feedback_numeric_impact_verify_before_bug_claim`·`feedback_anchor_correction_legal_priority` 정책상 수치 정합(E-2)은 정본 확보 전 임의 변경 금지. AT-PASTURE-CITE-2가 값 동결을 보증.
- **(R3) per-head 단일상수 충실도 한계 잔존**: §168조의10①(축사+부대+초지+사료포)와 단일 ㎡/두 상수의 구조 불일치는 (E-1)로 해소되지 않음. warning은 인용만 정정될 뿐 산식 충실도는 (E-2)로 이월 — 이를 본 PR 본문/커밋 메시지에 '인용 정정 한정, 수치 정합 후속(blocker: 별표 1의3 정본)'으로 명시해 과대보고 방지(memory `feedback_numeric_impact_verify_before_bug_claim`).
- **(R4) 기존 테스트 회귀 0**: pasture.test.ts·qa-integration.test.ts·integration.test.ts 모두 warning 문자열을 assert하지 않음(grep 확인). 따라서 문자열 정정으로 깨지는 기존 anchor 없음. AT-PASTURE-CITE-1만 신규 추가.
- **(R5) ESLint --fix 함정 무관**: import 변경 없음(문자열 리터럴만). pre-push tsc도 영향 없음.

### 8. 작업 순서 (E-1)
1. **Pre-Do**: `pasture.test.ts`에 AT-PASTURE-CITE-1 작성 후 실행 → '소득세법 시행령 별표 1의3' toContain 실패(RED) 확인(현행 '축산법' 인용). 디자인 환류 기회 확보(memory `feedback_pre_anchor_verification`).
2. `pasture.ts:155` warning 말미 인용 교체 + `livestock-standards.ts:4` 주석 교체.
3. AT-PASTURE-CITE-1 GREEN + AT-PASTURE-CITE-2(numeric 동결) 추가 통과.
4. `npx vitest run __tests__/tax-engine/non-business-land/` 회귀 0 + `npx tsc --noEmit` 0.
5. (E-2)·(E-3)는 blocker 명시 후 본 PR 범위 제외 — 별도 추적.

---

## 🔍 R1 자가검토 정정 (2026-06-16, plan-design-self-review-loop · 실측 검증)

> 7-에이전트 검토(인용 grep/Read 실측) 결과. 정정은 본 절을 우선(본문 인용과 충돌 시 본 절 기준).

| 우선 | 카테고리 | 정정 |
|---|---|---|
| Medium | 누락 | AT-PASTURE-CITE-1: warning 분기는 r1.meets PASS 후 도달(pasture.ts:102 early-return) → **`isLivestockOperator:true` + 기간기준 충족 보유기간**(예 2014-01-01~2024-01-01) 명시. base() 팩토리 재사용. |
| Low | 개선 | **livestockType 영문키 함정**: `LIVESTOCK_STANDARD_AREA` 키는 영문(`hanwoo`). 기존 pasture.test.ts `'한우'`(한글)은 lookup 0 반환→warning 미발생. anchor는 **`'hanwoo'` 사용** 명시(안티패턴 주의). |
| Low | 오류 | §5 cross-ref: **SR-1**(3a가 computeAreaProportioning utils 추출 → 3c E-1 먼저 머지·3a rebase) 1줄 추가. |
| Low | 개선 | §7 R4: integration.test.ts:266(지분)·qa-integration.test.ts:319(legacy)는 **다른** warning assert하나 "축산법 별표2" 자동산출 warning은 0건(회귀0 정확). 문구 정밀화. |
