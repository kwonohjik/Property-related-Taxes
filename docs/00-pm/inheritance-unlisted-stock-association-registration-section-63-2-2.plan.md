# 비상장주식 PR-L2 — §63②2호 거래소 상장신청·협회 등록 준비 중 법인 평가 구현계획

> **Source**: 비상장 V2 후속 매트릭스 PR-L2 (PR-L §9 후속) §63②2호 (상증령 §57②)
> **Date**: 2026-05-27
> **선행**: PR-L(§63②1호, `0c14a43`) — `applyPreIpoListing` + orchestrator override + §54⑥ 무오염 + 날짜정규화 구현 완료. **본 PR은 §63②2호를 동일 메커니즘에 `preparationType` 판별자로 추가**.
> **법령 검증**: KoreanLaw MCP 2026-05-27 (상증법 mst=276123 §63②2호·③ / 상증령 mst=283637 §57②) — 인용 오류 0, **단 법↔령 terminal 시장 drift 발견(D-1)**.
> **정책**: [[feedback_korean_law_82_vs_81_2_drift]] · [[feedback_pre_anchor_verification]] · [[feedback_no_silent_apportion_fallback]] · [[feedback_numeric_impact_verify_before_bug_claim]] · [[feedback_api_zod_schema_sync]]

---

## 1. 법령 근거 (KoreanLaw MCP 검증)

> **전수 직접검증 완료 (2026-05-27, 인용 오류 0)**: §63②2호(법 mst 276123)·§57②(령 mst 283637)·§63③·§57③(PR-L3) 모두 MCP 원문 verbatim 대조 — 인용 0건 오류. 산식 = MAX(§57①1호 공모가격, §63①1호나목=§54 보충적평가)로 PR-L(§63②1호)과 동일, §63③ 할증("제1항제1호 및 제2항") 적용 확정.
> ★ **D-1 drift는 실재 확인**: 법 §63②2호 "거래소에 상장신청" ↔ 령 §57② "한국금융투자협회에 등록"이 **양쪽 원문에서 terminal 시장 불일치**. drift 원인(구 협회중개시장 stale vs 현행 K-OTC 의도)은 **조문 텍스트만으로 판정 불가** → 단정 금지, UI·인용 양쪽 병기로 처리([[feedback_korean_law_82_vs_81_2_drift]]).

### 1.1 상증법 §63②2호 (mst 276123, 원문 verbatim)

> ② 다음 각 호의 어느 하나에 해당하는 주식등에 대해서는 **제1항제1호에도 불구하고** 해당 법인의 사업성, 거래 상황 등을 고려하여 대통령령으로 정하는 방법으로 평가한다.
> 2. 제1항제1호**나목**에 규정된 주식등 중 「자본시장과 금융투자업에 관한 법률」에 따른 증권시장으로서 대통령령으로 정하는 증권시장에서 주식등을 거래하기 위하여 대통령령으로 정하는 기간에 **거래소에 상장신청을 한 법인**의 주식등

### 1.2 상증령 §57② (mst 283637, 원문 verbatim)

> ② 법 제63조제2항제2호에서 "대통령령으로 정하는 기간"이란 평가기준일 현재 유가증권 신고(유가증권 신고를 하지 아니하고 **등록신청**을 한 경우에는 등록신청을 말한다) 직전 **6개월(증여세가 부과되는 주식등의 경우에는 3개월)**부터 **한국금융투자협회에 등록하기 전까지**의 기간을 말하며, 해당 주식등은 **제1항제1호의 가액**(=§57①1호 공모가격)**과 법 제63조제1항제1호나목에 따라 평가한 가액 중 큰 가액**으로 평가한다.

### 1.3 §63③ 할증 (PR-L과 동일)

> ③ … 제1항제1호 **및 제2항**에 따라 평가한 가액 … 100분의 20을 가산한다. → §63②2호 결과에도 §63③ 할증. 순서 = §54 보충적평가 → §63②2호 MAX override → §63③ 할증.

### 1.4 정리 + 본 PR 범위

| 항목 | §63②1호 (PR-L 완료) | §63②2호 (본 PR-L2) |
|---|---|---|
| 트리거 | 기업공개 목적 **유가증권 신고** | 증권시장 거래 위해 **거래소 상장신청**(법) / **협회 등록신청**(령) |
| 윈도우 anchor | 유가증권신고일(미신고 시 거래소 상장신청일) | 유가증권신고일(미신고 시 **등록신청일**) |
| 윈도우 terminal | 거래소 최초 **상장** 전까지 | **한국금융투자협회 등록** 전까지(령) / 거래소 상장 전(법 문언) — **D-1** |
| 윈도우 기간 | −6개월(상속)/3개월(증여) | **동일** −6/3개월 |
| 평가 산식 | MAX(공모가, §63①1호가목 없으면 나목=§54) | **MAX(공모가, §63①1호나목=§54)** — 비상장은 **동일** |
| §63③ 할증 | 적용 | 적용 (동일) |

- **비상장 V2 도메인에서 §63②1호·2호의 엔진 산식은 동일**(가목 상장시세 없음 → 둘 다 MAX(공모가, §54 보충적평가)). 차이는 **윈도우 terminal 이벤트 + 라벨/인용**뿐.
- ∴ 본 PR은 PR-L의 `applyPreIpoListing`을 **`preparationType` 판별자**로 일반화하여 재사용. 신규 모듈 없음.

### ★ D-1. 법 §63②2호(거래소 상장신청) ↔ 령 §57②(협회 등록) terminal drift

- 법은 "거래소에 상장신청", 령은 "한국금융투자협회에 등록"으로 **terminal 시장이 다름**. 코스닥 협회중개시장→거래소 통합 후 법은 현대화됐으나 §57②이 구 "협회 등록"(K-OTC, 장외) 문언 유지로 추정되는 stale drift.
- **법이 "기간"을 대통령령에 위임**(§63②2호 "대통령령으로 정하는 기간") → 기간·산식의 operative 정의는 **§57②**. ∴ 윈도우 terminal = **"협회 등록 전까지"**(§57② operative), anchor "미신고 시" = **등록신청일**.
- **단, 단정 금지**: UI·결과 라벨·appliedRules에 **법 §63②2호(거래소 상장신청)와 령 §57②(협회 등록) 양쪽을 병기**하고, 시장 라벨 최종 확정은 사용자/추가 KoreanLaw 결정으로 표기. 엔진 numeric은 양쪽 해석 무관(동일 MAX 산식)이므로 영향 0([[feedback_numeric_impact_verify_before_bug_claim]]).

---

## 2. 현행 엔진 경로 + 갈음 지점 (PR-L override 재사용)

`unlisted-orchestrator.ts` STEP 7 직후 override 블록(PR-L 구현분)을 **그대로 재사용**. `applyPreIpoListing`이 `preparationType`을 받아 윈도우 terminal·라벨만 분기. override·§54⑥ 캡처·날짜정규화·§63③ 순서 모두 PR-L과 동일.

```ts
// PR-L 기존 블록 (변경 없음 — applyPreIpoListing 내부만 preparationType 분기)
preIpoListingResult = applyPreIpoListing(
  { ...input.preIpoListing, securitiesFilingDate: toDate(...), listingDate: toOptionalDate(...) },
  finalPerShareValue,                       // §54 보충적평가 (§63①1호나목)
  toOptionalDate(input.evaluationDate) ?? input.evaluationDate,
);
// applied 시 appliedRules — preparationType에 따라 §63②1호+§57① or §63②2호+§57② (D-2)
```

---

## 3. 설계 결정

### D-2. `preparationType` 판별자로 PR-L 모듈 일반화 (신규 모듈 없음)

`PreIpoListingInput`에 optional 추가 (기본 `"exchange_listing"` = PR-L 하위호환):
```ts
preparationType?: "exchange_listing" | "association_registration";
//  exchange_listing       = §63②1호 거래소 상장(IPO) — PR-L
//  association_registration = §63②2호 거래소 상장신청·협회 등록(K-OTC) — 본 PR (D-1 병기)
```
- `applyPreIpoListing` 윈도우 판정·MAX·windowMonths(6/3) **로직 전부 동일**. `preparationType`은 **모듈 내부 `warnings`·orchestrator `appliedRules`·UI 라벨 문자열**에만 영향(numeric 0, [[feedback_numeric_impact_verify_before_bug_claim]]).
- **모듈 `warnings` 분기(C1)**: 현재 하드코딩된 "§63②1호 … 거래소 상장 전"(applyPreIpoListing 내부)을 type별로 — exchange="§63②1호 … 거래소 상장 전" / association="§63②2호 … 협회 등록 전". `const ptype = input.preparationType ?? "exchange_listing"` 1회 해소 후 분기.
- **orchestrator `appliedRules` 분기(C2)** — 정확 문자열(anchor PL2-2·PL2-6 대상):
  - exchange: `"상증법 §63②1호 + 상증령 §57① — 기업공개 준비 중 MAX(공모가, 보충적평가)"` (PR-L 기존, 무변경)
  - association: `"상증법 §63②2호 + 상증령 §57② — 거래소 상장신청·협회 등록 준비 중 MAX(공모가, 보충적평가)"` (D-1 거래소·협회 병기)
- **결과 echo `PreIpoListingResult.preparationType`(C3)**: `ptype` 해소값(undefined→"exchange_listing")을 그대로 echo → 결과 카드/besshi 인용 분기. PR-L 하위호환(미입력 시 exchange).

### D-3. 윈도우 anchor·terminal 필드 재사용 (필드명 무변경, 의미 일반화)

- `securitiesFilingDate` = 유가증권신고일(미신고 시 §63②1호 상장신청일 / §63②2호 등록신청일). 의미만 일반화.
- `listingDate` = terminal 시점(§63②1호 거래소 상장일 / §63②2호 협회 등록일). 의미만 일반화. **필드명 유지 → PR-L 회귀 0**.
- UI 라벨이 `preparationType`에 따라 "거래소 상장일" ↔ "협회 등록일(거래소 상장신청)"로 전환.

### D-4. 평가 산식 — PR-L과 100% 동일

§57② = MAX(§57①1호 공모가격, §63①1호나목 §54 보충적평가). 비상장은 §63②1호와 동일(가목 없음). `appliedValue = Math.max(공모가, supplementary)` 무변경.

### D-5. §63②1호·2호 상호배타

한 법인은 거래소 상장(IPO, 1호) **또는** 거래소 상장신청·협회 등록(2호) 중 하나 준비 → `preparationType` 단일 선택(RadioCardGroup). 동시 적용 없음.

### D-6. 음수·경계 — PR-L D-5 동일

공모가 ≤0 → 미적용. 공모가<보충적 → MAX=보충적(applied=true). 윈도우 경계 `evaluationDate === windowStart`(포함)·`=== listingDate`(미포함). 신고/등록신청일 이전 6/3개월 lookback 포함(PR-L DR-1 동일).

---

## 4. 변경 지점 (PR-L 확장 — 8지점)

| # | 파일 | 변경 |
|---|---|---|
| S-1 | `pre-ipo-listing-section-63-2.ts` | `PreIpoListingInput.preparationType?` + `PreIpoListingResult.preparationType`(ptype default echo) + applyPreIpoListing **warnings 문자열** type별 분기(윈도우·MAX 로직 무변경). appliedRules는 S-3 |
| S-2 | `types/unlisted-stock-valuation.types.ts` | **변경 0** — `import("…").PreIpoListingInput/Result` 타입 참조라 모듈 정의 추가분 자동 반영 |
| S-3 | `unlisted-orchestrator.ts` | appliedRules 문자열을 `preparationType`별 분기(§63②1호+§57① / §63②2호+§57②). override 블록 구조 무변경 |
| S-4 | `unlisted-stock-valuation-v2.schema.ts` | preIpoListing z.object에 `preparationType` enum optional 추가 |
| S-5 | 폼→v2 (PR-L 경로 재사용) | preparationType 포함 strip 0 grep. taxKind 주입은 PR-L 완료분 재사용 |
| S-6 | `PreIpoListingToggle.tsx` | **RadioCardGroup 추가**(section 9 토글 **내부** — UnlistedStockV2Card sectionNum **재배치 없음**, C5). preparationType 선택(거래소 상장 / 거래소 상장신청·협회 등록). 신고일·상장일/등록일 라벨 + **preview 텍스트·윈도우 설명**("거래소 상장 전"↔"협회 등록 전") 동적 전환(C6) + D-1 병기 안내. **ToggleCard title은 `/기업공개 준비 중 법인/` 매칭 substring 보존**(C4·R-5) |
| S-7 | `PerShareValuationResultCard.tsx` | §63② 분기를 preparationType별 인용(§63②1호/2호 + §57①/②) — MAX 분기·윈도우 경고 재사용. **★ additive 아님 — PR-L이 ⑥ hint·result-pre-ipo-notice에 "§63②1호"·"§57①" 하드코딩 → preparationType 분기로 수정**(DR-1, 미수정 시 association 오표시) |
| S-8 | besshi note | preparationType별 인용 문구(§63②1호/2호 + §57①/②). **★ PR-L besshi-pre-ipo-note "§63②1호" 하드코딩 → 분기 수정**(DR-1) |

---

## 5. Pre-Do anchor (RED 우선)

`__tests__/tax-engine/property-valuation/pre-ipo-listing-section-63-2.test.ts`에 추가:

- **PL2-1 (RED→GREEN)**: `preparationType="association_registration"`·상속·윈도우 내·공모가 20,000>보충적 12,000 → appliedValue=20,000, applied=true. (preparationType 미지원 RED.)
- **PL2-2 (orchestrator appliedRules)**: type=association → appliedRules에 `"상증법 §63②2호 + 상증령 §57②"` 포함(§63②1호·§57① 문자열 부재).
- **PL2-3 (증여 3개월 분기 재확인)**: type=association·gift·신고일−4개월 → windowMonths=3·윈도우 밖·applied=false (상속 동일 입력은 포함).
- **PL2-4 (MAX·할증 동일성)**: type=association·공모가 1,000,000 → finalPerShareValue=1,000,000, isMaxShareholder 시 premiumPerShare=1,200,000 (§63③ 동일 적용).
- **PL2-5 (Zod)**: preparationType="association_registration" parse 성공 + 공모가 0 시 실패(기존 PL-8 재사용).
- **PL2-6 (D-1 병기 + result echo)**: type=association applied 시 (a) `preIpoListingResult.preparationType === "association_registration"`, (b) appliedRules가 "거래소 상장신청·협회 등록" 양쪽 + §63②2호·§57② 인용 — drift 가시화. type 미입력 시 preparationType="exchange_listing" default(C3).
- **PL2-7 (모듈 warnings 분기)**: type=association·윈도우 밖 → `result.warnings`가 "§63②2호 … 협회 등록 전"(거래소 상장 전 아님). C1 검증.
- **(회귀)**: `preparationType` 미입력·`"exchange_listing"` → PR-L PL-1~11 전부 GREEN 유지(기본값 하위호환, numeric 0 변동).

---

## 6. Definition of Done

- [ ] PL2-1~7 + PR-L 회귀(PL-1~11) 통과 (RED 선확인)
- [ ] `preparationType` 미입력 시 PR-L 동작 100% 불변(하위호환, [[feedback_numeric_impact_verify_before_bug_claim]])
- [ ] `npx tsc --noEmit` 0 + `npm test` 전수
- [ ] 800줄 — pre-ipo 모듈 ≤150줄 유지(분기 추가분)
- [ ] §63②2호(법) + §57②(령) 인용 주석 + **D-1 drift 병기 주석**
- [ ] 8지점 동기화(S-6 RadioCardGroup·S-3 appliedRules 분기·strip 0 grep)
- [ ] e2e 상속/증여 협회 등록 토글 + preparationType 선택 — `e2e/inheritance-pre-ipo-listing.spec.ts` 확장
- [ ] 한국어 커밋 + push

---

## 7. 실행 순서 (Do — 엔진 시퀀셜 → UI)

1. PL2-1 RED → S-1 preparationType 분기(applyPreIpoListing warnings·result echo, ptype default) → S-3 orchestrator appliedRules 분기 → PL2-1~4·6·7 GREEN → S-4 Zod + PL2-5.
2. UI: S-6 RadioCardGroup(preparationType) + 동적 라벨 → S-7 결과카드 인용 분기 → S-8 besshi → e2e.
3. Check: `ui-engine-sync-checker` + `bkit:gap-detector`.

---

## 8. 리스크

- **R-1 D-1 drift 단정**: 법(거래소 상장신청)↔령(협회 등록) 시장 불일치를 한쪽으로 단정 금지. UI·인용 양쪽 병기. PL2-6로 고정.
- **R-2 PR-L 회귀**: preparationType 기본값 `"exchange_listing"` 누락 시 기존 PR-L 동작 변동 위험. 기본값 명시 + PL-1~11 회귀 GREEN 필수.
- **R-3 라벨 strip**: preparationType 폼 조립 누락(TS 미감지). S-5 spread + Zod enum + grep([[feedback_explicit_prop_mapping_strip]]).
- **R-4 윈도우 동일성 착오**: §57②도 −6/3개월·terminal 전까지로 §57①과 기간 구조 동일. windowMonths 분기 불필요(taxKind만). 시장 terminal만 라벨 차이.
- **R-5 PR-L e2e 정규식 회귀(C4, E2 정정)**: `e2e/inheritance-pre-ipo-listing.spec.ts`가 `/기업공개 준비 중 법인/`으로 토글 title 탐지. title을 §63②2호 포함 일반화하면 "·상장신청"/"·2호" 삽입으로 **연속 substring이 깨져 보존 불가**(grep 검증) → **e2e 3건 정규식을 `/특례 평가/` 또는 toggle testid로 선교체 필수**. 미갱신 시 T-L-1/2/3 실패. (보존 옵션 없음.)

---

## 9. 후속 PR

- **PR-L3**: §63②3호 상장법인 증자 신주(미상장) — §57③ = 상장 §63①1호가목 평가액 − 재정경제부령 배당차액. **상장주식 시세 기반이라 V2 비상장 도메인과 별개** — 적용점(상장주식 엔진 연계) 재검토 선행 필요. 본 PR과 구조 상이.

---

## 10. 한계

- **D-1 법↔령 terminal drift**: 거래소 상장신청(법) vs 협회 등록(령) 미해소 — 양쪽 병기로 처리, 시장 라벨 확정은 추가 유권해석 필요.
- **공모가 신뢰**: §57①1호 금융위 기준 공모가격은 외부 산정값 — 엔진은 사용자 입력 신뢰(PR-L 동일).
- **윈도우 판정 입력 의존**: 신고/등록신청일·등록일 사용자 입력. 자동 조회 없음 — 미입력 시 안내, 자동 fallback 0.
- **§63②3호 미포함**(PR-L3 분리).
