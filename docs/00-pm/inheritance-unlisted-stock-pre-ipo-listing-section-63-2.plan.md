# 비상장주식 PR-L — §63② 기업공개 준비 중 법인 평가 구현계획

> **Source**: 비상장 V2 후속 매트릭스 PR-L (F-10) §63② 기업공개준비중 (상증령 §57)
> **Date**: 2026-05-27
> **선행 정밀추적**: §54③·⑤·⑥·§56②(PR-G)·§59③(PR-G2)·§17의2·§17의3②⑤ 모두 구현 완료. §63②는 **본체 전무**(코드 0) — 비상장 V2 평가 유일 신규 평가방법 잔여.
> **법령 검증**: KoreanLaw MCP 2026-05-27 (상증법 mst=276123 §63② / 상증령 mst=283637 §57) — 인용 오류 0.
> **정책**: [[feedback_korean_law_82_vs_81_2_drift]] · [[feedback_pre_anchor_verification]] · [[feedback_no_silent_apportion_fallback]] · [[single-source-engine-helper]] · [[feedback_api_zod_schema_sync]] · [[feedback_numeric_impact_verify_before_bug_claim]]

---

## 1. 법령 근거 (KoreanLaw MCP 검증)

> **전수 직접검증 완료 (2026-05-27, 인용 오류 0)**: §63②(1·2·3호)·§63③(할증=§2 평가가액 기준)·§63①1호가목/나목·§57①②③ 모두 MCP 원문 대조. 특히 (a) **§63③ "§2에 따라 평가한 가액에 가산"** → §63② override 후 할증 순서 확정(D-2/R-2), (b) **§57①2호 가목 부재 시 나목(§54)** → 비상장 IPO 준비는 MAX(공모가, §54 보충적평가) 확정(D-4). [[feedback_korean_law_82_vs_81_2_drift]]

### 1.1 상증법 §63② (mst 276123, 원문)

> ② 다음 각 호의 어느 하나에 해당하는 주식등에 대해서는 **제1항제1호에도 불구하고** 해당 법인의 사업성·거래 상황 등을 고려하여 대통령령으로 정하는 방법으로 평가한다.
> 1. 기업 공개를 목적으로 금융위원회에 대통령령으로 정하는 기간에 **유가증권 신고를 한 법인**의 주식등
> 2. §1①1호나목 비상장 주식 중 증권시장 거래를 위해 대통령령 기간에 **거래소에 상장신청을 한 법인**의 주식등
> 3. 거래소 상장법인 주식 중 **증자로 취득한 새로운 주식**으로서 평가기준일 현재 상장되지 아니한 주식

### 1.2 상증령 §57 (mst 283637, 원문)

> ① 법 §63②1호 "대통령령으로 정하는 기간" = 평가기준일 현재 유가증권 신고(미신고 시 상장신청) **직전 6개월(증여세는 3개월)부터 거래소 최초 상장 전까지**의 기간. 해당 주식은 **제1호와 제2호 중 큰 가액**으로 평가.
>   1. 자본시장법상 금융위원회가 정하는 기준에 따라 결정된 **공모가격**
>   2. 법 §63①1호**가목**에 따라 평가한 가액(없으면 같은 호 **나목** 가액 = §54 보충적평가)
> ② 법 §63②2호 기간 = 등록신청 직전 6개월(증여 3개월)부터 협회 등록 전까지. = MAX(§57①1호 공모가격, §63①1호나목 보충적평가).
> ③ 법 §63②3호 = 상장법인 §63①1호가목 평가액 − 재정경제부령 배당차액.

### 1.3 정리 + 본 PR 범위

| 호 | 대상 | 평가 = | 본 PR |
|---|---|---|---|
| §63②**1호** | 거래소 상장(IPO) 준비 — 유가증권 신고 | **MAX(공모가, §54 보충적평가)** | **★ 구현** |
| §63②2호 | 협회(K-OTC) 등록 준비 | MAX(공모가, §54 보충적평가나목) | 후속 PR-L2 |
| §63②3호 | 상장법인 증자 신주(미상장) | 상장가목 평가 − 배당차액 | 후속 PR-L3(구조 상이) |

- **§63②1호 = 비상장 V2(`evaluateUnlistedStockV2`)의 핵심 케이스**(상장 전 비상장 → §54 보충적평가가 ②호 가액). 본 PR은 **1호만** 구현(가목 상장 시세 없으므로 ②호 = 나목 §54).
- **기간 판정**: 평가기준일 ∈ [유가증권신고일(미신고 시 거래소 상장신청일, §57① 단서) − 6개월(상속)/3개월(증여), 거래소 상장일 전). 윈도우 밖이면 §63② 미적용(현행 §54 보충적평가 유지).
- **할증 순서(§63③)**: §63③은 "§1①1호 및 §2에 따라 평가한 가액"에 가산 → §63② 결과에도 §63③ 할증 적용. ∴ 순서 = §54 보충적평가 → **§63② MAX override** → §63③ 할증.

---

## 2. 현행 엔진 경로 + 갈음 지점

`unlisted-orchestrator.ts` STEP 7(§54④ 최종 1주당 평가액, 라인 199~234) → STEP 8(§63③ 할증, 라인 237). `finalPerShareValue`는 **이미 `let`**(라인 199) — 별도 전환 불필요, override 1블록 삽입만(C4).

```ts
// STEP 7: finalPerShareValue (§54① max(가중평균, 80%하한) or §54④ 순자산단독) — 모든 분기 resolve 후
// ── 갈음 지점: §63② override (STEP 7 직후, STEP 8 직전) ──
const premium = calcMaxShareholderPremium({ finalPerShareValue, ... });  // STEP 8 §63③
```

**갈음 후** (C2·C3·C6 반영):
```ts
// finalPerShareValue: §54 보충적평가 결과 (본칙 80%하한 / 순자산단독 / 단서 — 모든 분기 포섭, C6)
// §54⑥ 평가심의위의 70~130% 범위 기준은 §54 보충적평가이므로 override 전 캡처 (C3)
const supplementaryPerShareValue = finalPerShareValue;

let preIpoResult;
if (input.preIpoListing) {
  // C1: securitiesFilingDate·listingDate JSON 경유 string 도달 방어 — applyPreIpoListing 진입 전 Date 정규화
  preIpoResult = applyPreIpoListing(
    { ...input.preIpoListing,
      securitiesFilingDate: toDate(input.preIpoListing.securitiesFilingDate, "securitiesFilingDate"),
      listingDate: toOptionalDate(input.preIpoListing.listingDate) },
    finalPerShareValue,                                  // = §54 보충적평가 (§57①2호나목)
    toOptionalDate(input.evaluationDate) ?? input.evaluationDate,  // C2: V2 최상위 재사용 (별도 인자)
  );  // §63②1호
  if (preIpoResult.applied) {
    finalPerShareValue = preIpoResult.appliedValue;  // MAX(공모가, §54)
    appliedRules.push("상증법 §63②1호 + 상증령 §57① — 기업공개 준비 중 MAX(공모가, 보충적평가)");
  } else warnings.push(...preIpoResult.warnings);
}
const premium = calcMaxShareholderPremium({ finalPerShareValue, ... });  // §63③ 할증 (override값에 적용)
// ... (STEP 9 totalValuation 하류 자동 전파)
// §54⑥: override값이 아닌 supplementaryPerShareValue 전달 (C3 — 범위 기준 = §54 보충적평가)
evaluationCommitteeApplied = applyEvaluationCommittee(input.evaluationCommittee, supplementaryPerShareValue);
```

→ §63③ 할증·`finalPerShareForReporting`·`totalValuation` 하류 **자동 전파**(override된 finalPerShareValue 소비).

> **§54⑥ 평가심의위와 차이/상호작용**: §54⑥은 참고용 메타(결과 무변경)이고 §63②은 **실제 평가액 변경**(MAX override). 단 §54⑥의 70~130% 범위 **기준값**은 §54 보충적평가이므로 override **전** `supplementaryPerShareValue`를 캡처해 §54⑥에 전달한다(C3). 이로써 R-5의 "후속 검토"를 본 PR에서 해소 — §63② override는 finalPerShareValue·§63③ 할증에만 적용, §54⑥ 범위는 보충적평가 기준 유지.

---

## 3. 설계 결정

### D-1. 신규 엔진 모듈 (≤150줄)

`lib/tax-engine/property-valuation/pre-ipo-listing-section-63-2.ts`

```ts
export interface PreIpoListingInput {
  publicOfferingPrice: number;        // §57①1호 금융위 기준 공모가격 (1주당)
  securitiesFilingDate: Date;         // 윈도우 anchor — 유가증권 신고일(미신고 시 거래소 상장신청일, §57① 단서, C7)
  taxKind: "inheritance" | "gift";    // 6개월(상속) vs 3개월(증여) — §57①
  listingDate?: Date;                 // 거래소 최초 상장일 (미입력=상장 전으로 간주)
  // C2: evaluationDate 미포함 — V2 최상위 input.evaluationDate를 applyPreIpoListing 3번째 인자로 전달 (중복·drift 방지)
  // C7: 유가증권신고·상장신청은 상호배타 anchor이므로 단일 필드로 모델링 (UI 라벨에서 "미신고 시 상장신청일" 안내)
}

export interface PreIpoListingResult {
  applied: boolean;
  withinWindow: boolean;              // 평가기준일 ∈ [신고일−N개월, 상장 전)
  publicOfferingPrice: number;
  supplementaryValue: number;         // §54 보충적평가 (= 입력 supplementaryPerShareValue)
  appliedValue: number;               // MAX(공모가, 보충적) — applied 시 finalPerShareValue 교체
  windowMonths: 6 | 3;
  warnings: string[];
}
```

`applyPreIpoListing(input: PreIpoListingInput, supplementaryPerShareValue: number, evaluationDate: Date)`:
1. `windowMonths = input.taxKind === "gift" ? 3 : 6` (§57①).
2. **기간 판정**: `windowStart = subMonths(input.securitiesFilingDate, windowMonths)` (date-fns, C5). `withinWindow = evaluationDate >= windowStart && (listingDate 미입력 || evaluationDate < input.listingDate)`. (날짜는 orchestrator가 toDate/toOptionalDate로 정규화 후 전달 — C1.)
3. 미충족(윈도우 밖·공모가 ≤0) → `{applied:false, withinWindow, warnings}`(현행 §54 유지). 침묵 보정 0([[feedback_no_silent_apportion_fallback]]).
4. `appliedValue = Math.max(input.publicOfferingPrice, supplementaryPerShareValue)` (§57① "큰 가액"). supplementaryPerShareValue는 §54 모든 분기(본칙/순자산단독/단서) 결과 포섭(C6 — §57①2호나목 = §54 보충적평가 전체).
5. `applied = withinWindow && input.publicOfferingPrice > 0`.

### D-2. orchestrator override (§2) — STEP 7 직후, STEP 8(할증) 직전

`finalPerShareValue`는 이미 `let`(라인 199, C4) → override 블록만 삽입. applied 시 `finalPerShareValue = appliedValue` 교체. §63③ 할증은 override값에 적용(§63③ 법문 "§2에 따라 평가한 가액" 정합). **override 직전 `const supplementaryPerShareValue = finalPerShareValue` 캡처**(C3) → §54⑥ `applyEvaluationCommittee`에 override값이 아닌 이 값 전달(라인 299 인자 교체).

### D-3. taxKind·evaluationDate 전달 (C2)

V2 입력에 taxKind 부재 → `PreIpoListingInput.taxKind`로 포함(폼이 inheritance/gift에 따라 주입, [[feedback_no_silent_apportion_fallback]] 기본값 자동추론 금지 — 명시). **evaluationDate는 `PreIpoListingInput`에 넣지 않고** V2 최상위 `input.evaluationDate`를 `applyPreIpoListing` 3번째 인자로 전달(중복 필드·drift 방지). preIpoListing 내부 신규 Date는 신고일·상장일뿐.

### D-4. §63②2·3호 범위 외

2호(협회등록)·3호(증자신주 배당차액)는 구조 상이 → 후속 PR-L2/L3. 본 PR은 1호(거래소 IPO 준비)만. 가목(상장 시세) 없는 비상장이므로 §57①2호 = 나목 §54 보충적평가.

### D-5. 음수·경계

- 공모가 ≤ 0 → 미적용(applied=false). 공모가 < 보충적평가 → MAX가 보충적평가 선택(override 무효과지만 applied=true·근거 표기).
- 윈도우 경계: `evaluationDate === windowStart`(포함), `=== listingDate`(상장일=미포함, 상장 전까지). [[feedback_design_law_cases]] 경계 anchor.

---

## 4. 변경 지점 (V2 평가 서브시스템 8지점)

| # | 파일 | 변경 |
|---|---|---|
| S-1 | `types/unlisted-stock-valuation.types.ts` | `UnlistedStockValuationInput.preIpoListing?: PreIpoListingInput` + 결과 `preIpoListingResult?: PreIpoListingResult` |
| S-2 | `property-valuation/pre-ipo-listing-section-63-2.ts` | **신규** — 타입 + `applyPreIpoListing` (D-1) |
| S-3 | `unlisted-orchestrator.ts` | override 블록 삽입(이미 let, C4) + **override 전 `supplementaryPerShareValue` 캡처**(C3) + **preIpoListing 날짜 toDate/toOptionalDate 정규화**(C1) + §54⑥ 인자를 supplementaryPerShareValue로 교체(라인 299, C3) + echo(`preIpoListingResult`) + appliedRules |
| S-4 | `validators/unlisted-stock-valuation-v2.schema.ts` | preIpoListing z.object optional + superRefine(applied 의도 시 공모가>0·신고일 필수·taxKind enum). evaluationDate 필드 없음(C2) |
| S-5 | 폼→v2 조립 (`StockValuationForm` defaultV2·spread) | preIpoListing 포함 확인(strip 0) + **taxKind 주입**(상속/증여 폼 구분) |
| S-6 | `components/.../unlisted-stock-v2/PreIpoListingToggle.tsx`(신규) + `UnlistedStockV2Card.tsx` | 토글 섹션(신규) + sectionNum 재배치. 공모가·신고일**(라벨 "유가증권 신고일(미신고 시 거래소 상장신청일)", C7)**·상장일(DateInput) 입력 + 윈도우 안내 |
| S-7 | `PerShareValuationResultCard.tsx` | §63② 적용 시 "MAX(공모가 X, 보충적평가 Y) = Z (기업공개 준비)" 분기 + 윈도우 밖 미적용 안내 |
| S-8 | besshi 표시 + `BesshiForm4Buppyo3PrintView.normalizeBesshiInput` | 별지 부표3에 §63② 행은 별도 없음 → 결과카드 안내 우선. besshi 1쪽 ⑥ 최종평가액 자동 반영(override값) + note(선택). **`normalizeBesshiInput`에 preIpoListing.securitiesFilingDate·listingDate Date 정규화 추가**(C1 — sessionStorage 복원 시 string 도달 방어) |

> taxKind는 신규 — `EvaluationCommitteeFilingGuideCard taxKind` 패턴 재사용. 폼이 상속/증여 명시 주입([[feedback_no_silent_apportion_fallback]]).

---

## 5. Pre-Do anchor (RED 우선)

`__tests__/tax-engine/property-valuation/pre-ipo-listing-section-63-2.test.ts` + orchestrator 통합:

- **PL-1 (RED→GREEN)**: 상속·윈도우 내(신고일 2024-03-01, 평가일 2024-05-01, 상장 미완)·공모가 20,000 > 보충적 12,000 → `appliedValue=20,000`. 함수 부재 RED.
- **PL-2 (orchestrator override)**: 동일 입력 `evaluateUnlistedStockV2` → `finalPerShareValue`(할증 전)=20,000, `preIpoListingResult.applied=true`.
- **PL-3 (공모가 < 보충적)**: 공모가 8,000 < 보충적 12,000 → MAX=12,000(보충적 유지), applied=true·근거 표기.
- **PL-4 (윈도우 밖)**: 평가일이 신고일 − 8개월(상속 6개월 초과) → withinWindow=false, applied=false, 현행 §54 유지.
- **PL-5 (증여 3개월)**: taxKind=gift, 신고일 − 4개월 → 상속(6mo)이면 포함이나 증여(3mo)는 윈도우 밖 → applied=false. 6 vs 3 분기 검증.
- **PL-6 (상장 후)**: listingDate < evaluationDate → withinWindow=false(상장 전 아님).
- **PL-7 (§63③ 할증 적용)**: override + isMaxShareholder large → 할증 ×120%가 override값(20,000) 기준 → premiumPerShare=24,000.
- **PL-8 (Zod)**: preIpoListing 정의인데 공모가 0/신고일 누락 → parse 실패 path.
- **PL-9 (§54⑥ 범위 무오염, C3)**: §63② override(공모가 20,000) + §54⑥ 동시 입력(보충적 12,000) → §54⑥ `lower=8,400·upper=15,600` (= 12,000 기준, **20,000 기준 아님**). override가 §54⑥ 범위 기준을 오염시키지 않음 검증.
- **PL-10 (순자산단독 + §63② override, C6)**: `netAssetOnlyReason="liquidation"` → finalPerShareValue=netAssetPerShare. 공모가 > 순자산 → MAX override 적용(applied=true). §57①2호나목 §54 보충적평가가 순자산단독 분기도 포섭 검증.
- **PL-11 (날짜 string 방어, C1)**: securitiesFilingDate·evaluationDate를 ISO string으로 전달(JSON 경유 모사) → withinWindow 정상 산출(silent-false 아님). orchestrator 정규화 검증.
- **(회귀)**: preIpoListing 미입력 시 전체 불변([[feedback_numeric_impact_verify_before_bug_claim]] — numeric 0 변동 실증).

---

## 6. Definition of Done

- [ ] PL-1~11 + 회귀 통과 (RED 선확인)
- [ ] 미입력 시 numeric 0 변동 (회귀, [[feedback_numeric_impact_verify_before_bug_claim]])
- [ ] preIpoListing 날짜 정규화 — orchestrator override 전 + `normalizeBesshiInput`(C1, PL-11)
- [ ] §54⑥ 범위 기준 = supplementaryPerShareValue (override 무오염, C3, PL-9)
- [ ] `npx tsc --noEmit` 0 + `npm test` 전수
- [ ] 800줄 — 신규 모듈 ≤150줄
- [ ] §63②1호 + §57① + §63③(할증 순서) 인용 주석
- [ ] 8지점 동기화(특히 S-5 taxKind 주입·strip 0 grep, S-3 §54⑥ 인자 교체)
- [ ] e2e 상속(윈도우 내 override) + 증여(3개월 경계) — `e2e/inheritance-pre-ipo-listing.spec.ts`
- [ ] 한국어 커밋 + push

---

## 7. 실행 순서 (Do — 엔진 시퀀셜 → UI)

1. PL-1 RED → S-2 모듈 → S-1 타입 → S-3 orchestrator override(날짜 정규화 C1 + §54⑥ 인자 교체 C3 포함) → PL-1~7·9·10·11 GREEN → S-4 Zod + PL-8.
2. UI: S-6 토글(공모가·신고일·상장일·taxKind) + sectionNum 재배치 → S-7 결과카드 MAX 분기 → S-5 폼 조립·taxKind 주입 → S-8 besshi → e2e.
3. Check: `ui-engine-sync-checker` + `bkit:gap-detector`.

---

## 8. 리스크

- **R-1 taxKind 누락**: 6 vs 3개월 분기 핵심. V2에 taxKind 부재 → 폼이 상속/증여 명시 주입 필수(누락 시 6개월 기본 추론 금지 — 증여를 6개월로 과대적용 위험). PL-5로 고정.
- **R-2 override 위치 오류**: §63③ 할증 전에 override해야 §63③이 MAX값 기준(법문 "§2에 따라 평가한 가액"). 할증 후 override 시 할증 누락. PL-7로 고정.
- **R-3 윈도우 경계 off-by**: "직전 6개월부터"·"상장 전까지" 포함/미포함. 신고일−N(포함)·상장일(미포함). PL-6·경계 anchor.
- **R-4 strip**: preIpoListing 폼 조립부 누락(TS 미감지). S-5 spread + Zod 정의 + grep([[feedback_explicit_prop_mapping_strip]]).
- **R-5 §54⑥와 동시 (✅ 본 PR 해소, C3)**: §54⑥(평가심의위 메타)·§63②(실제 override) 동시 입력 가능. override 전 `supplementaryPerShareValue` 캡처 후 §54⑥에 전달 → §54⑥ 70~130% 범위는 §54 보충적평가 기준 유지, §63② override는 finalPerShareValue·§63③ 할증에만 적용. PL-9로 고정. (기존 "후속 검토" deferral 제거 — PR-L4 불필요.)
- **R-6 날짜 silent-false (C1)**: preIpoListing.securitiesFilingDate·listingDate가 JSON/sessionStorage 경유 string 도달 시 `evaluationDate >= windowStart` 비교가 무조건 false(date-coerce 함정) → withinWindow 오판. orchestrator override 전·`normalizeBesshiInput` 모두 toDate/toOptionalDate 정규화. PL-11로 고정.

---

## 9. 후속 PR

- PR-L2: §63②2호 협회(K-OTC) 등록 준비 — MAX(공모가, 나목 §54). 구조 유사(등록일·협회 기준).
- PR-L3: §63②3호 상장법인 증자 신주(미상장) — 가목 평가 − 배당차액(시행규칙). 상장주식 도메인이라 V2 비상장과 별개 — 적용점 재검토.
- ~~PR-L4: §63② override + §54⑥ Range 기준 정합~~ → **본 PR에서 해소(C3·R-5)**. supplementaryPerShareValue 캡처로 §54⑥ 범위 무오염.

---

## 10. 한계

- **공모가 신뢰**: §57①1호 금융위 기준 공모가격은 외부 산정값 — 엔진은 사용자 입력 신뢰.
- **윈도우 판정 입력 의존**: 신고일·상장일 사용자 입력. 자동 조회 없음(거래소 IPO 일정 외부) — 미입력 시 안내, 자동 fallback 0.
- **§63②2·3호 미포함**(PR-L2/L3 분리).
