# 상속세 잔여 갭 3·4·5 작업 계획서

> 작성일: 2026-06-19 · 브랜치: `feat/inheritance-gaps` (worktree `.claude/worktrees/inheritance-gaps`)
> 기준 커밋: `b9612044` (origin/master, PR #290 머지본)
> 검증 원칙: 모든 현황 주장은 **실제 코드 grep/Read로 실측**(file:line). 법령은 KoreanLaw MCP 본문 검증. 추정 금지.

---

## 0. 요약 — 2026-06-15 문서 대비 실측 정정

`docs/00-pm/inheritance-gaps-code-verified-2026-06-15.md`의 갭3·4·5 판정을 2026-06-19 실측으로 재검증한 결과, **세 갭 모두 원 판정이 정정**되었다. (그 문서 자체가 "실측 기준"을 표방했으나, 그 후 커밋 또는 누락으로 현황이 달라짐 → 본 계획서가 최신 단일 진실.)

| 갭 | 2026-06-15 판정 | 2026-06-19 실측 | 정정 |
|---|---|---|---|
| **3 영농 사후관리** | 🟡 마법사 미통합 (UX 갭) | **거의 완료** — 결과뷰에 안내 카드+prefill 링크 존재 | ✅ UX 갭 닫힘. 선택적 polish만 |
| **4 물납 자동분류** | 🟡 하드코딩 0 | **실 갭 확정** — `eligibleSecuritiesValue:0`·`heirResidenceValue:0` | 유지. 단 **상속세 numeric 영향 0**(물납=투영) |
| **5 공익법인 §16②·§48** | 🟡 riskNote 텍스트만 | **§16② 부분 구현**(수동 입력)·§48 미구현 | §16②는 자동화 갭, §48은 별도 납세자 |

**권고 우선순위**: **5a(§16② 자동계산) > 4(물납 자동분류) > 3-polish(선택) > 5b(§48, 스코프 판단 필요)**.

---

## 1. 갭3 — 영농상속공제 사후관리 마법사 통합 〔재판정: 거의 완료〕

### 1-1. 실측 현황

- **엔진**: `lib/tax-engine/deductions/farming-post-mgmt.ts` — `calcFarmingPostMgmt(originalDeduction, input)` 완성. §18의3④/⑥/⑦·시행령 §16⑥⑦⑧, 추징 100%(§16⑦)·이자상당액 BigInt 단일 floor·정당사유 7종·신고기한 산정. (header: KoreanLaw MCP 검증 2026-05-21)
- **시뮬레이터**: `app/calc/inheritance-postmgmt/page.tsx` 완성. 위반 4종·정당사유 라디오·결과 카드·산식 펼침.
- **마법사 안내 (UX 갭으로 지목됐던 부분)**: **이미 존재** — `components/calc/results/InheritanceTaxResultView.tsx:419-435`
  ```
  {result.deductionDetail.farmingDeduction > 0 && ( ... 영농상속공제 사후관리 안내 (§18의3④ + §16⑦⑧) ...
    href={`/calc/inheritance-postmgmt?originalDeduction=${result.deductionDetail.farmingDeduction}`} ... )}
  ```
  → **영농공제 > 0 시 안내 카드 + 시뮬레이터 prefill 링크 자동 노출**. 가업 사후관리 안내(같은 파일 438-455)와 동형.
- **prefill 수신**: 시뮬레이터 `page.tsx:73,128` — `originalDeduction` 쿼리스트링 수신·sanitize(§18의3① 30억 캡)·안내 배너 표시.

→ **2026-06-15 문서가 지목한 "마법사에 페이지 안내가 없으면 UX 갭"은 이미 해소됨.** orchestrator 미호출은 사실이나 **설계상 정당**(사후관리는 상속 수년 뒤 별도 시점 계산 → 메인 결정세액에 합산하면 오류).

### 1-2. 잔여 작업 〔선택·낮은 우선순위〕

영농 안내 링크는 `originalDeduction`만 넘기고, 가업 안내 링크는 `deathDate`·`filingDeadline`·`ofz`·`direct`까지 넘긴다(`InheritanceTaxResultView.tsx:449`). 시뮬레이터가 `filingDeadline`을 수동 입력받는(`page.tsx:79,161`) 격차.

- **(P3-a) prefill 강화** 〔trivial — 실측〕: `InheritanceTaxResultView`는 **`deathDate` prop을 이미 보유**(컴포넌트 파라미터 line 67, 282·301·449·518에서 사용). 따라서 영농 안내 링크(line 430)에 `&deathDate=${deathDate}&filingDeadline=${calcInheritanceFilingDeadline(deathDate)}` 추가 + 시뮬레이터 `useSearchParams` 수신만 하면 됨. 신고기한 단일 소스 `calcInheritanceFilingDeadline(deathDate)` = `deductions/family-business-autoderive.ts:38`(실측 확인) 재사용. **신규 result echo 필드 불필요** — prop 직접 사용.
- **(P3-b) 컨벤션 정합**: `page.tsx:293` native `<details>` → `ExpandToggleButton`(memory `feedback_result_expand_toggle_standard`), `page.tsx:222` native `<input type="checkbox">` → `ToggleCard`(CLAUDE.md native checkbox 신규 금지). 단 기존 standalone 페이지라 회귀 위험 낮음.

### 1-3. 권고

**P3 또는 스킵.** 핵심 기능은 완료 상태이므로, 이번 작업 범위에서 **선택 항목**으로 둔다. 진행 시 anchor 불필요(계산 영향 0, 링크/UI만), E2E 1건(`farmingDeduction>0` 결과뷰 → 안내 카드 링크 href에 deathDate/filingDeadline 포함 확인).

---

## 2. 갭4 — 물납 자산 자동분류 〔실 갭 확정〕

### 2-1. 실측 현황

- `lib/tax-engine/credits/payment-in-kind.ts:174-212` `derivePaymentInKindAssets()`가 estateItems → `PaymentInKindAssets` 도출. 단 2개 필드 **하드코딩 0**:
  - `eligibleSecuritiesValue: 0` (line 205) — 국채·공채·처분제한 상장유가증권 (§74② 충당순위 2)
  - `heirResidenceValue: 0` (line 209) — 상속인 거주 주택·부수토지 (§74② 충당순위 6)
- 원인: `EstateItem`(`types/inheritance-gift.types.ts:81-`) 및 `AssetCategory`(69-78: land/building/apartment/listed_stock/unlisted_stock/cash/financial/deposit/other)에 **해당 분류 플래그 부재**.
- 영향 경로(`payment-in-kind.ts`): `eligibleSecuritiesValue`는 `computeEligibleRealSec`(46-53)·`limit1` 안분(91-94)에, `heirResidenceValue`는 §73④ 비상장 캡(99-102)·충당순서 6번 표시(111)에 사용.

### 2-2. ⚠️ numeric 영향 판정 (memory `feedback_numeric_impact_verify_before_bug_claim`)

`PaymentInKindCard.tsx` 헤더·`payment-in-kind.ts` 헤더 명시: **"결정세액 미영향 납부방법 투영(API 미경유, 결과뷰 호출)"**. 물납은 상속세 **결정세액을 바꾸지 않는다**.

→ **본 갭은 상속세 결정세액 numeric 영향 0. "물납 안내 카드"의 충실도(충당순서·한도 표시 정확도) 개선이지 세액 버그 아님.** 심각도 = **Medium(충실도)**. 단 **물납 카드의 `eligible`(물납 가능 여부)·허용한도·충당순서 표시**는 분류 변경으로 변동 가능(엔진설계 #13) — "결정세액 불변 ≠ 물납 안내 불변". 의도된 충실도 개선.

### 2-3. 법령 근거 (검증 필요 — Do 전 KoreanLaw 본문 대조)

- §74② 충당순서 6단계 (국채·공채 → 처분제한 상장 → 국내부동산 → 그 밖 유가증권 → 비상장주식 → 상속인 거주주택). `FILL_ORDER_LABELS`(payment-in-kind.ts:27-35)와 일치 확인 완료.
- "상속인 거주 주택·부수토지" 충당 후순위·처분제한 상장의 정의 → §73·§74 + 시행령 §73·§74 본문 Do 전 확정.
- 🔴 **(High Do 게이트 — 엔진설계 #12)**: 상속인 거주주택을 `heirResidenceValue`로 분류할 때 **`realEstateValue`에서 제외(move) vs 유지(subset 태그)** 결정. §73①1호 요건1 분자(부동산·유가증권>1/2)·`computeEligibleRealSec`(`:46`)에 거주주택 포함 여부가 달림. 시행령 §73 본문 검증 후 동결. default 가설=subset 태그(요건1 분자 보존).

### 2-4. 작업 항목 (8지점 동기화)

신규 `EstateItem` 플래그 2종 추가 (명명 Do 단계 확정, 예시):
- `paymentInKindSecurityType?: "government_bond" | "restricted_listed"` — 충당순위 2 (국채·공채·처분제한 상장)
- `isHeirResidenceProperty?: boolean` — 충당순위 6 (상속인 거주 주택·부수토지). 단 부동산 카테고리 한정.

| # | 지점 | 위치 | 작업 |
|---|---|---|---|
| ① | 폼 상태 | EstateItem 편집 컴포넌트(자산 모달, Do 단계 위치 확정) | optional 필드 추가 |
| ② | initial | 자산 factory | 미설정(undefined) 기본 |
| ③ | normalize | sessionStorage 마이그레이션 | undefined 호환 |
| ④ | API 변환 | **N/A (실측)** — 물납은 `PaymentInKindCard`가 결과뷰에서 `derivePaymentInKindAssets`를 직접 호출(API·Zod 미경유). EstateItem 플래그는 `lib/calc/inheritance-api.ts`로 엔진까지 전달되지만 물납 카드는 result+estateItems만 소비 | EstateItem 플래그가 `inheritance-api.ts` 직렬화에 포함되는지만 확인 |
| ⑤ | UI 위젯 | `components/calc/EstateItemEditor.tsx` / `PropertyValuationForm.tsx`(실측) — 부동산 자산에 "상속인 거주주택" 토글, 금융/기타에 "국채·공채/처분제한 상장" 선택. `ToggleCard`/`RadioCardGroup` 필수 | |
| ⑥ | 사이드바 | N/A (물납은 합계 비대상) | — |
| ⑦ | 결과 카드 | `derivePaymentInKindAssets` 하드코딩 0 → 플래그 기반 합산. `PaymentInKindCard` 충당순서·한도 자동 반영 | 핵심 |
| ⑧ | validation | 미입력 자동 fallback 금지(memory `feedback_no_silent_apportion_fallback`). 미설정=0으로 두되 안내 warning 유지 | |

### 2-5. anchor / E2E / 리스크

- **anchor**: `__tests__/tax-engine/inheritance/` 또는 물납 테스트에 — 국채 자산 flag set 시 `derivePaymentInKindAssets().eligibleSecuritiesValue` = 해당 평가액, 거주주택 flag set 시 `heirResidenceValue` 반영, §73④ 비상장 캡이 `heirResidenceValue` 차감으로 변동. 결정세액 불변 anchor 1건(numeric 0 증명).
- **E2E**: 부동산 자산에 거주주택 flag → 결과뷰 물납 카드 충당순서 6번에 금액 표시.
- **리스크**: 낮음. 결정세액 미영향이라 회귀 표면 좁음. 자산 모달 위치·중첩 Dialog selector E2E 함정 주의(memory `project_stock_item_table_modal_plan`).

### 2-6. 권고

**P2.** 명확한 충실도 갭, 회귀 위험 낮음. EstateItem 플래그 추가가 핵심.

---

## 3. 갭5a — §16② 공익법인 동족주식 한도 자동계산 〔실 갭·numeric〕

### 3-1. 실측 현황 — 부분 구현 존재

`lib/tax-engine/exemption-evaluator.ts:95-121` — **이미 §16② 동족주식 초과분 과세 분기 존재**:
```
if (rule.id === "inh_public_interest") {
  if (item.relatedStockExceeded && item.excessStockAmount != null && item.excessStockAmount > 0) {
    taxableOverflow = item.excessStockAmount;             // ← 사용자 직접 입력한 초과분
    exemptAmount = Math.max(0, item.claimedAmount - taxableOverflow);
    ... 초과분 상속세 과세
  } else if (item.relatedStockExceeded) {
    warnings.push("초과분 금액 입력 필요");                 // ← 금액 미입력 시 경고만
  } ...
  warnings.push("사후관리: 출연 후 3년 내 ... 추징");        // ← §48 안내 텍스트(line 119)
}
```

- 주석(line 103): "§16②2호 본칙 10%(가목 20%·나목/다목 5% 예외). **임계는 사용자 직접 입력값 기준**."
- → **엔진은 한도(%)를 자동 계산하지 않는다.** 사용자가 초과분 금액(`excessStockAmount`)을 손으로 계산해 입력해야 정확한 과세. 이것이 진짜 갭.

### 3-2. 법령 근거 (KoreanLaw 본문 검증 완료 2026-06-19, 상증법 §16 현행 시행 20260102)

§16②2호 — 출연 주식등 + 기존 보유분이 발행주식총수등의 다음 비율 초과 시 초과분 과세가액 산입:
- **기본: 100분의 10**
- **가목 100분의 20**: 의결권 미행사 + 자선·장학·사회복지 목적 (나목·다목 제외)
- **나목 100분의 5**: 상호출자제한기업집단 특수관계 공익법인
- **다목 100분의 5**: §48⑪ 각 호 요건 미충족 공익법인
- 합산 대상(§16②1호 가·나·다목): 출연 당시 공익법인 기보유분 + 출연자/특수관계인이 타 공익법인에 출연한 동일 내국법인 주식 + 상속인/특수관계인 출연 타 공익법인 보유분
- §16③: 일정 요건(공정거래 비특수관계+주무관청 인정 / 3년내 초과분 매각 / 공익법인법령 출연)은 초과해도 불산입

### 3-3. 작업 항목

**핵심: 한도 자동계산 헬퍼 신설 → `excessStockAmount` 도출(현 수동 입력 대체/보완).**

1. **법령 상수** (`legal-codes/inheritance-gift.ts`): 실측 결과 §16② numeric 비율 상수는 **부재**(문자열 인용 `INH_RELATED_STOCK="상증법 §16 ②"`만 존재, line 294). → **신규 추가**: `INH_RELATED_STOCK_RATIO = { general: 0.1, charity_no_voting: 0.2, mutual_investment_restricted: 0.05, art48_11_unmet: 0.05 }`.
   - 🔴 **(High 인용 정정 — 병행)**: 상속 공익법인 출연 불산입 **본칙 §16①** 대응 상수가 없어 `PUBLIC_INTEREST="상증법 §48①"`(증여세, line 278)이 상속 룰 lawRef로 차용됨(`exemption-rules.ts:161`, `exemption-evaluator.ts:101·106·114·117`). 상속세 결과뷰가 §48①을 표시 → **드리프트**. `INH_PUBLIC_CONTRIBUTION = "상증법 §16①"` 신설 후 상속 경로 lawRef 정정. (KoreanLaw 본문 검증: §16①=상속 불산입, §48①=공익법인이 출연받은 재산의 증여세 불산입 — 별개 납세자)
2. **계산 헬퍼** (신규 `public-interest-stock-limit.ts` 권장 — `exemption-evaluator.ts` 800줄 정책):
   `computeRelatedStockExcess({ 출연주식수, 발행주식총수등, 합산기보유분, 공익법인유형, 주당평가액 })` →
   한도주식수 = floor(발행주식총수 × 비율(유형별)) − 합산기보유분; 초과주식수 = max(0, 출연주식수 − 한도); `excessStockAmount` = 초과주식수 × 주당평가액. 정수 연산(applyRate/floor).
3. **입력 타입** (`ExemptionCheckedItem` = `types/inheritance-exemption.types.ts:14`, 실측: `claimedAmount`(17)·`excessStockAmount?`(24)·`relatedStockExceeded?`(26) 존재, **`publicInterestType` 부재→신규**): 신규 4필드 — `publicInterestType?`(general/charity_no_voting/mutual_investment_restricted/art48_11_unmet) + `relatedStockDonatedShares?`(출연주식수) + `relatedStockTotalShares?`(발행총수) + `relatedStockPriorHeld?`(기보유분) + `relatedStockValuePerShare?`(주당평가액). 기존 `relatedStockExceeded`/`excessStockAmount`는 **수동 fallback로 보존**(3중 패턴, precedence: 자동>수동>else). 엔진 설계 §input 타입과 동일.
4. **분기 수정** (`exemption-evaluator.ts:95-121`): 자동계산값 우선, 미입력 시 기존 수동 입력 fallback. §16③ 예외(Phase2) 게이트 추가.
5. **8지점**: 입력은 `lib/calc/inheritance-exemption-checklist.ts`(실측 존재) 경유 → 공익법인 출연 입력 UI(`components/calc/exemption/ExemptionChecklist.tsx`)에 유형 라디오 + 주식수/발행총수 입력. 결과 breakdown은 기존 구조 재사용 + lawRef §16① 정정.

### 3-4. ⚠️ numeric 영향 판정

**상속세 과세가액 산입 → 결정세액 변동 = 실 numeric 갭.**
- 실측(`exemption-evaluator.ts:115-118` else 분기): `relatedStockExceeded`가 false거나 `excessStockAmount` 미입력이면 `exemptAmount = item.claimedAmount`(**전액 불산입**). → **사용자가 한도 초과분을 직접 계산·입력하지 않으면 초과분이 비과세 처리되어 과소과세**(납세자 유리 방향 오류). 이것이 자동화의 핵심 가치 — 단순 편의가 아니라 **과소과세 차단**.
- 현재도 사용자가 `excessStockAmount`를 정확히 손계산·입력하면 올바른 세액 → 자동화는 **계산 오류·미입력 차단 + §16③ 예외 누락 방지**.
- memory `feedback_no_unfavorable_application_without_legal_basis`: 한도 내 출연=불산입(유리)이 default, 초과분만 산입(제한규정 §16②의 명문 범위). §16③ 예외 해당 시 초과해도 불산입(default로 복귀).

### 3-4-2. §16④ 사후 산입 (Phase2 범위 — 누락 보완)

§16④: 불산입된 출연재산·이익이 (1호) 상속인(특수관계인 포함)에게 귀속되거나, (2호) §16③2호 적용분을 초과보유일부터 3년 내 미매각 시 → 대통령령 가액을 **사후 과세가액 산입**. 사후 발생 사유라 Phase2(§16③ 예외와 함께)로 분리. Phase1(한도 자동계산)에서는 제외.

### 3-5. anchor / 리스크

- **anchor (Pre-Do 우선)**: 발행주식총수 100,000주·출연 15,000주·기보유 0·일반(10%) → 한도 10,000주·초과 5,000주·주당 10,000원 → `excessStockAmount` 50,000,000원, 과세가액 +50,000,000. 가목(20%) 동일입력 → 초과 0(전액 불산입). 원단위 toBe() anchor.
- **리스크**: 중. §16② 합산 대상(가·나·다목)·§16③ 예외·§16④ 사후산입까지 전부 구현하면 범위 큼 → **Phase 분할**: **Phase1** = 유형별 단순 한도 자동계산(합산 기보유분은 사용자 입력) + §16① lawRef 정정, **Phase2** = §16③ 불산입 예외 + §16④ 사후 산입. memory `feedback_design_law_cases`(본문·단서·각호 전수 설계).

### 3-6. 권고

**P1 (이번 작업의 핵심).** 가장 명확한 numeric 갭이며, 부분 구현 위에 한도 자동계산만 얹으면 되어 착지점 명확.

---

## 4. 갭5b — §48 공익법인 사후관리 추징 〔별도 납세자·증여세〕

### 4-1. 실측·법령 (KoreanLaw 본문 검증 완료 2026-06-19, 상증법 §48 현행)

- 현 구현: `exemption-evaluator.ts:119` 경고 텍스트만("출연 후 3년 내 공익 목적 외 사용 시 추징").
- §48②: 출연받은 **공익법인등**이 1~8호 위반 시 그 사유 발생일에 **공익법인이 증여받은 것으로 보아 즉시 증여세 부과**(5호·7호는 §78⑨ 가산세). 대표: 1호 출연받은 날부터 **3년 이내 직접 공익목적 미사용**, 2호 주식 추가취득 §16②한도 초과, 8호 부적정 운용 등.
- §48⑧⑨⑩⑪⑫⑬: 이사 1/5 초과·총재산 30%(50%) 초과 보유·광고홍보·5% 초과 출연 후 요건 미충족 등 → §78 가산세.

### 4-2. 성격·스코프

- **§48 추징의 납세의무자는 출연받은 공익법인 본인**(피상속인/상속인 아님), 세목은 **증여세**, 시점은 상속 수년 뒤. → 영농(`/calc/inheritance-postmgmt`)·가업(`/calc/family-business-postmgmt`) 사후관리 시뮬레이터와 **동형의 별도 시뮬레이터** 또는 별도 PR이 적합.
- 메인 상속세 결정세액과 무관 → 메인 마법사 통합 대상 아님(영농·가업 패턴과 동일).

### 4-3. 권고

**P4 / 스코프 판단 필요.** 본 worktree 범위에 포함할지 사용자 확정 필요:
- (A) **보류** — 안내 텍스트 유지, 별도 과제로 분리(권고).
- (B) **시뮬레이터 신설** — `app/calc/public-interest-postmgmt/page.tsx` + `lib/tax-engine/credits/public-interest-postmgmt.ts`, 위반 8호·3년 미사용·이자상당액. 범위 큼(별도 PR 권장).

---

## 5. 우선순위·실행 순서

| 순위 | 갭 | 성격 | numeric | 범위 | 권고 |
|---|---|---|---|---|---|
| **P1** | 5a §16② 자동계산 | 상속세 과세가액 | ✅ 실 | 중(Phase 분할) | 우선 착수 |
| **P2** | 4 물납 자동분류 | 물납 안내 충실도 | ❌ 0 | 소~중 | 후속 |
| P3 | 3 영농 prefill 강화 | UX polish | ❌ 0 | 소 | 선택 |
| P4 | 5b §48 추징 | 공익법인 증여세 | 별도 | 대 | 보류/별도 PR |

**Do 순서**: 5a → 4 → (3-polish 선택). 각 갭 독립 → 순차 커밋·각각 anchor. 5b는 사용자 스코프 확정 후.

---

## 6. Pre-Do anchor 계획 (memory `feedback_pre_anchor_verification` 강제)

Do 진입 전, 갭별 핵심 anchor 1건 우선 작성·**실패 확보** 후 디자인 환류:
- **5a-① 과소과세 실증**: 출연주식 평가액 1억(claimedAmount) + 발행 10만주·출연 1.5만주·일반10%·주당 10,000원 입력하되 `excessStockAmount` **미입력** → 기대 `taxableOverflow=50,000,000`. 현 엔진은 else 분기(`exemption-evaluator.ts:116`)로 `exemptAmount=claimedAmount`, `taxableOverflow=0` 반환 → **과소과세 실패 확보**(자동계산 도입 정당화).
- **5a-② 한도 자동계산**: 동일 입력에 가목(20%) → 한도 2만주 > 출연 1.5만주 → `taxableOverflow=0`(전액 불산입). 유형별 분기 검증. 원단위 toBe().
- **5a-③ lawRef 정정**: 상속 공익법인 출연 breakdown의 `lawRef`가 `"상증법 §16①"`(현재 §48①) — 인용 anchor.
- **4**: 거주주택 flag set → `derivePaymentInKindAssets().heirResidenceValue` > 0 anchor. 현 하드코딩 0 → 실패 확인. + 결정세액 불변 anchor(numeric 0 증명).

---

## 7. 적용 메모리 정책

- `feedback_numeric_impact_verify_before_bug_claim` — 갭4=numeric 0(충실도), 갭5a=실 numeric. 분리 보고.
- `feedback_korean_law_citation_verify` — §16②·§48 본문 검증 완료(20260102 현행). 시행령 §73·§74·§16은 Do 전 추가 대조.
- `feedback_no_unfavorable_application_without_legal_basis` — §16② 한도 내=불산입 default, 초과분만 산입.
- `feedback_no_silent_apportion_fallback` — 갭4 미입력 자동채움 금지(미설정=0+경고 유지).
- `feedback_api_zod_schema_sync` / `tax-field-add` — 신규 입력 필드 8(상속세 결과뷰 직접경로 포함) 동기화 점검.
- `feedback_engine_result_map_json_loss` — 신규 result 필드는 Record/원시값(Map 금지).

---

## 8. 검증 완료·잔여 확인 (Do 단계)

### 8-1. 13단계 자가검토 STEP1에서 해소 (✅ 실측 확정)

- ✅ 갭4 EstateItem 편집 UI = `components/calc/EstateItemEditor.tsx`·`PropertyValuationForm.tsx`.
- ✅ 갭5a `ExemptionCheckedItem` = `types/inheritance-exemption.types.ts:14` — `claimedAmount`(17)·`excessStockAmount?`(24)·`relatedStockExceeded?`(26) 존재, `publicInterestType` **부재→신규 추가**.
- ✅ 상속세 API 경유: `lib/calc/inheritance-api.ts`·`inheritance-exemption-checklist.ts` 존재 → 갭5a 입력은 ④ 경유. 갭4(물납)는 `PaymentInKindCard` 결과뷰 직접 호출(④ N/A).
- ✅ §16① vs §48① 인용 드리프트 확인(STEP1 #1) — `INH_PUBLIC_CONTRIBUTION="§16①"` 신설로 정정(갭5a 병행).
- ✅ `calcInheritanceFilingDeadline` = `deductions/family-business-autoderive.ts:38`. `deathDate` prop = `InheritanceTaxResultView:67`.

### 8-2. 잔여 (Do 전 KoreanLaw 본문 대조)

- 시행령 §73(물납 한도)·§74(충당순서)·§16(한도 계산방법·합산대상 범위) 본문 — 갭4·5a 구현 직전 대조.
- §16② numeric 비율의 시기별 개정연혁(현행 10/20/5% — 과거 다른 비율 적용분 상속이면 행위시법) — 필요 시 `applicable-law` 확인.
