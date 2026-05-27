# 비상장주식 §63②2호 거래소 상장신청·협회 등록 준비 중 평가 — 엔진 설계 (PR-L2)

> **Plan**: `docs/00-pm/inheritance-unlisted-stock-association-registration-section-63-2-2.plan.md`
> **UI**: `inheritance-unlisted-stock-association-registration-section-63-2-2.ui.design.md`
> **선행**: PR-L(§63②1호, `0c14a43`) — `applyPreIpoListing`·orchestrator override·§54⑥ 무오염·날짜정규화 구현 완료. **본 PR은 동일 모듈에 `preparationType` 판별자 추가**(신규 모듈 0).
> **법령 검증**: KoreanLaw MCP 2026-05-27 (상증법 mst=276123 §63②2호·③ / 상증령 mst=283637 §57②) — verbatim 대조 인용 오류 0. ★ 법↔령 terminal drift(D-1) 실재 확인·단정 금지.

## Context

§63②2호(법) = "증권시장 거래를 위해 거래소에 상장신청을 한 법인"의 비상장주식(§63①1호나목). §57②(령)이 기간·산식을 정의: **[유가증권신고일(미신고 시 등록신청일) − 6개월(상속)/3개월(증여), 한국금융투자협회 등록 전)** 윈도우에 평가기준일이 속하면 `MAX(§57①1호 공모가격, §63①1호나목=§54 보충적평가)`. 비상장 도메인에서 **§63②1호(PR-L)와 엔진 산식 100% 동일** — terminal 이벤트(거래소 상장 vs 협회 등록)와 라벨/인용만 다름.

**★ 산식 동일성 → 재사용 필연**: PR-L `applyPreIpoListing`의 윈도우 판정(`subMonths` lookback)·`MAX(공모가, supplementary)`·`windowMonths`(taxKind 6/3)·§54⑥ 무오염·§63③ 할증 순서가 §63②2호에 **그대로 성립**. ∴ 신규 모듈/로직 분기 없이 `preparationType` 판별자로 **문자열(warnings·appliedRules·라벨)만 분기**. numeric 영향 0([[feedback_numeric_impact_verify_before_bug_claim]]).

**★ D-1 drift (단정 금지)**: 법 §63②2호 "거래소에 상장신청" ↔ 령 §57② "한국금융투자협회에 등록" terminal 시장 불일치. 원인(stale vs 의도적 K-OTC) 텍스트 판정 불가 → appliedRules·UI에 **양쪽 병기**([[feedback_korean_law_82_vs_81_2_drift]]).

---

## ★ 케이스 인벤토리 (필수)

| # | 시나리오 | 법령 근거 | anchor 출처 | 테스트 | 상태 |
|---|---------|----------|-------------|--------|------|
| 1 | type=association·상속·윈도우 내·공모가>보충적 → appliedValue=공모가·applied=true | 법 §63②2호·령 §57② | max(20,000,12,000) | PL2-1 | ☐ TODO |
| 2 | orchestrator appliedRules에 "§63②2호 + §57②" 포함(§63②1호·§57① 부재) | 령 §57② | 문자열 검증 | PL2-2 | ☐ TODO |
| 3 | type=association·gift·신고일−4개월 → windowMonths=3·윈도우 밖·applied=false (상속 동일입력은 포함) | 령 §57②(증여 3개월) | 6 vs 3 분기 | PL2-3 | ☐ TODO |
| 4 | type=association·**isMaxShareholder:true**·공모가 1,000,000 → finalPerShareValue=1,000,000·premiumPerShare=1,200,000 | 법 §63③ | 1,000,000×1.2 | PL2-4 | ☐ TODO |
| 5 | Zod preparationType="association_registration" parse 성공 + 공모가 0 실패 | (검증 정책) | safeParse | PL2-5 | ☐ TODO |
| 6 | result.preparationType="association_registration" echo + appliedRules "거래소 상장신청·협회 등록" 병기 | D-1 | echo + 병기 | PL2-6 | ☐ TODO |
| 7 | type=association·윈도우 밖 → warnings "§63②2호 … 협회 등록 전"(거래소 상장 전 아님) | 령 §57② | warnings 분기 | PL2-7 | ☐ TODO |
| 8 | 회귀 — preparationType 미입력·"exchange_listing" → PR-L PL-1~11 GREEN(하위호환) | — | 전체 회귀 | (회귀) | ☐ TODO |

**규칙**: 행≥1 충족. PL2-1 RED 선확인([[feedback_pre_anchor_verification]]). 회귀(8)는 PR-L 16 anchor 전부 GREEN 유지가 필수(기본값 하위호환).

---

## 법령 근거 (verbatim — §1 계획서 동일)

```
법 §63②2호: 제1항제1호나목 주식 중 증권시장 거래 위해 기간에 거래소에 상장신청을 한 법인의 주식등.
령 §57②: 기간 = 유가증권신고(미신고 시 등록신청) 직전 6개월(증여 3개월)부터 한국금융투자협회 등록 전까지.
          평가 = MAX(제1항제1호 가액[§57①1호 공모가격], 법 §63①1호나목[§54 보충적평가]).
법 §63③: 제1항제1호 및 제2항에 따라 평가한 가액에 100분의 20 가산 → §63②2호도 할증.
```

**비상장 적용**: §63①1호가목(상장시세) 없음 → §57② 산식 = MAX(공모가, §54 보충적평가). §63②1호와 동일.

---

## 엔진 input 타입 (S-1)

`PreIpoListingInput`(모듈)에 optional 추가 — `UnlistedStockValuationInput.preIpoListing`은 무변경(import 타입 참조 자동 반영, S-2 변경 0):
```ts
preparationType?: "exchange_listing" | "association_registration";
//  미입력 → "exchange_listing"(§63②1호, PR-L 하위호환)
//  "association_registration" → §63②2호 (거래소 상장신청·협회 등록 — D-1 병기)
```

## 엔진 result 타입 (S-1)

`PreIpoListingResult`에 echo 추가:
```ts
preparationType: "exchange_listing" | "association_registration"; // ptype 해소값 (undefined→exchange)
```
**required 안전성(B 검증)**: `PreIpoListingResult`는 `applyPreIpoListing` **단독 생성**(orchestrator 라인 244가 유일 호출, grep 확인) → `preparationType`을 required로 둬도 미설정 생성 지점 없음. applyPreIpoListing이 항상 `ptype` 해소값 반환.

---

## 계산 알고리즘 (단계별)

### S-1 `applyPreIpoListing` — warnings·echo 분기 (윈도우·MAX 무변경)

```ts
const ptype = input.preparationType ?? "exchange_listing"; // C3 default 1회 해소
// windowMonths·windowStart·withinWindow·applied·appliedValue — 전부 무변경 (PR-L 로직)
const terminalLabel = ptype === "association_registration" ? "협회 등록 전" : "거래소 상장 전";
const clauseLabel = ptype === "association_registration" ? "§63②2호" : "§63②1호";
if (!withinWindow) warnings.push(`평가기준일이 [유가증권신고일 − ${windowMonths}개월, ${terminalLabel}) 윈도우 밖 — ${clauseLabel} 미적용, §54 보충적평가 유지.`);
else if (input.publicOfferingPrice <= 0) warnings.push(`공모가격이 미입력(0 이하) — ${clauseLabel} 미적용, §54 보충적평가 유지.`);
return { ..., preparationType: ptype }; // echo (C3)
```

### S-3 orchestrator — appliedRules 분기 (override 블록 구조 무변경)

```ts
if (preIpoListingResult.applied) {
  finalPerShareValue = preIpoListingResult.appliedValue; // MAX (무변경)
  appliedRules.push(
    preIpoListingResult.preparationType === "association_registration"
      ? "상증법 §63②2호 + 상증령 §57② — 거래소 상장신청·협회 등록 준비 중 MAX(공모가, 보충적평가)" // D-1 병기
      : "상증법 §63②1호 + 상증령 §57① — 기업공개 준비 중 MAX(공모가, 보충적평가)",            // PR-L 기존
  );
} else { for (const w of preIpoListingResult.warnings) warnings.push(`[§63②] ${w}`); }
```

**하류 무변경**: §54⑥ supplementary 캡처·§63③ 할증·날짜정규화·totalValuation 모두 PR-L 그대로. preparationType은 numeric 비관여.

---

## Silent fallback / 자동 안분 후보 식별

- **preparationType 기본값 = "exchange_listing"** — 미입력 시 PR-L 동작 그대로(자동 추론이 아니라 하위호환 default, [[feedback_no_silent_apportion_fallback]] 위반 아님). 회귀 anchor로 0 변동 실증.
- **D-1 drift 단정 금지** — appliedRules·warnings·UI에 거래소·협회 병기. 한쪽 시장으로 임의 축소 금지.
- **윈도우·MAX·할증 로직 분기 0** — type은 문자열만 변경. 새 numeric 경로 없음 → overflow·정수연산 영향 없음.
- **taxKind 자동추론 금지(R-1, PR-L 동일)** — windowMonths는 taxKind(6/3)로만 결정. preparationType과 직교.

---

## 테스트 약속

- 케이스 인벤토리 8행 → PL2-1~7 + 회귀. PL2-1 RED 선확인([[feedback_pre_anchor_verification]]).
- PL2-2·PL2-6: appliedRules 정확 문자열 `toContain("§63②2호")`·`toContain("§57②")`·`toContain("협회 등록")`·`toContain("거래소 상장신청")`.
- PL2-4: MAX·할증 PR-L PL-7과 동일값(1,000,000·1,200,000) `toBe()`.
- PL2-7: `result.warnings` "협회 등록 전" 포함·"거래소 상장 전" 부재.
- 회귀: PR-L PL-1~11 16건 전부 GREEN(preparationType 미입력 default). numeric 0 변동([[feedback_numeric_impact_verify_before_bug_claim]]).

---

## UI 통합 위임

- UI 명세는 `inheritance-unlisted-stock-association-registration-section-63-2-2.ui.design.md`.
- **8 동기화 지점**: S-1(타입)·S-4(Zod enum)·S-5(폼 strip 0) + S-6(RadioCardGroup·라벨/preview 동적)·S-7(결과카드 인용 분기)·S-8(besshi 인용 분기).
- **sectionNum 재배치 없음(C5)** — RadioCardGroup은 기존 section 9 PreIpoListingToggle **내부** 추가. UnlistedStockV2Card 섹션 불변.
- **★ ToggleCard title substring 보존 불가 → e2e 갱신 필수(E2, C4·R-5 정정)** — title을 §63②2호 포함하도록 일반화하면(예 "§63② 기업공개·상장신청 준비 중 법인") "·상장신청" 삽입으로 `/기업공개 준비 중 법인/` 연속 substring이 **깨짐**. ∴ "보존 가능" 전제 폐기 — **PR-L e2e(T-L-1/2/3) 정규식을 안정 substring(예 `/특례 평가/`) 또는 toggle testid로 동시 갱신 필수**. 보존 옵션 없음.
- **RadioCardGroup display fallback(E, 3중 일치)** — 라디오 value는 `value.preparationType ?? "exchange_listing"`로 표시. 저장된 PR-L 데이터(preparationType 미보유) 복원 시 미선택 방지. factory 기본(toggle ON 시 exchange 주입)·engine ptype 해소·UI display fallback **3중 일치**([[feedback_store_default_vs_ui_display_fallback]]). RadioCardGroup은 날짜 필드 **앞**에 배치(라벨이 ptype 의존, UI 순서=로직 순서, C).
- **★ S-7·S-8은 additive 아닌 "기존 하드코딩 수정"(DR-1)** — PR-L이 `PerShareValuationResultCard`에 §63②1호 문자열을 **4곳**(⑥ hint 라인 162·law 라인 165·notice 헤더 182·미적용 200)·besshi note(`besshi-pre-ipo-note`)에 하드코딩. association 오표시 방지 위해 **5곳 전부 preparationType 분기로 교체** 필수(grep으로 잔존 §63②1호 0 확인). 결과카드·besshi 모두 `result.preIpoListingResult.preparationType` read.
- 신규 input(preparationType) → ⑤UI 위젯·④폼 조립 strip 0 grep. taxKind 주입은 PR-L 완료분 재사용.
