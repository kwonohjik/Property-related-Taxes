# 미완료 4세목(취득·재산·종합부동산·주식양도) 법조문 인용 검증 + 클릭 팝업 링크화 — 구현 계획서

> 작성일: 2026-06-15 · 대상 세목: **취득세·재산세·종합부동산세·주식양도소득세** 4종
> 선행 완료: 상속·증여세 PR#196 · 양도세 PR#200·#202(merge `5e158d32`)
> 본 계획은 양도세에서 확립·검증한 워크플로(memory `feedback_law_citation_link_workflow`)를 **나머지 4세목**으로 확장한다.
> **본 문서는 계획만 — 코딩 금지.** Do는 13단계 self-review(`plan-design-self-review-loop`) 및 사용자 승인 후 진입.
> **인벤토리는 4세목 병렬 실측(2026-06-15)이며 추정이 아니다.** 단, 인용 *정확성*은 Phase 2 전수검증 전까지 단정하지 않는다(memory `feedback_numeric_impact_verify_before_bug_claim` — 오류 과대주장 금지).
> **검토 이력**: 2026-06-15 13단계 self-review(계획서 범위 — STEP 1~4 다중검토·정정 + 통합정합). 실측 정정 9건. 상세 **부록 B**.

---

## 1. 배경 · 문제 정의

(A) **정확성 미검증** — 각 세목 마법사·결과뷰의 법조문 인용이 현행 법령 본문과 일치하는지 전수 확인된 바 없다.
(B) **비클릭** — 인용 대부분이 일반 텍스트(`hint`·`description`·`<li>`·`<p>`)라 사용자가 조문 원문을 볼 수 없다.

상속·증여(PR#196)·양도세(PR#200·#202)에서 (A)검증 + (B)팝업링크 + E2E + 항(項)하이라이트를 완료했고 그 인프라는 **전 세목 공용**이다. 따라서 4세목은 인프라 재구축 없이 ②약칭·③MST·④인용조문만 해당 세목 것으로 교체해 적용한다. 단, **세목별 결과뷰 구조가 달라 작업량·접근이 상이**(§3.1)하다.

---

## 2. 공용 인프라 (실측 — 신규 0)

양도세·상속·증여에서 완성·머지된 공용 자산. 4세목 모두 그대로 차용.

- **`LawArticleModal`**(`components/ui/law-article-modal.tsx`) — props `legalBasis`·`label`·`className`. 클릭→Dialog→`/api/law/article?law=&articleNum=`→조문본문(법제처). 헤더는 `parseLawRef(legalBasis)` 기반(API 독립), 본문만 API. **배지 label은 약칭 허용, legalBasis는 정식명 권장**.
- **`parseLawRef`/`parseLawRefsForModal`**(`lib/utils/law-url.ts`) — 약칭→정식명(`resolveLawAlias`)·복합인용 분해(`· , ; 줄바꿈`)·"시행령" 단독 직전본법 상속. `ARTICLE_RE = /(?:§|제)\s*(\d+)(?:조)?(?:의\s*(\d+))?/`(§N조의M·제N조 흡수). **법령명 없는 단독 `§`는 skip**(본법↔시행령 오인 방지) → 링크하려면 legalBasis에 법령명 명시.
- **`extractClauseMarkers` + `LawContent`**(G-5) — label의 항(①~⑮) 자동 추출→본문 해당 항 amber 강조. **label에 항 넣으면 자동 적용**(추가 구현 0).
- **`resolveLawAlias`**(`lib/korean-law/aliases.ts`) — 52+엔트리. 4세목 누락분만 보강(§3.4).
- **인벤토리 스크립트**(`scripts/extract-law-citations.mjs`) — 현재 양도/상속·증여 경로. 세목별 ROOTS 파라미터화 필요(각 Phase 0).
- **결과뷰 공통 카드**(`DetailedCalculationStatementCard` 등) — 엔진 `step.legalBasis` 문자열을 이미 LawArticleModal로 렌더. **엔진 legalBasis 문자열도 (A)검증 대상**(양도세 §9 교훈).

---

## 3. 4세목 현황 실측 종합 (2026-06-15 병렬 조사)

### 3.1 결과뷰 법조문 렌더 구조 — 4패턴 (작업량 결정 요인)

| 세목 | 구조 | 함의 |
|---|---|---|
| **재산세** | 엔진 `PropertyTaxResult.legalBasis[]` → `PropertyTaxResultView`(L294~311) "법령 근거 보기" details에서 `.map()`→**전부 LawArticleModal 렌더 완료** + §115 분납 | **결과뷰 (B)완료 상태**. 입력폼 도움말만 링크화 + 전수 (A)검증 |
| **취득세** | 엔진 `result.legalBasis[]` → `AcquisitionTaxResultView` 본체가 **재산세식으로 전부 모달 렌더**(L693~699 "법령 근거" + L677 `step.legalBasis` + L131·149 `detail.legalBasis`) + `SurchargeFlowDiagram`. **단** 개별 카드 5종(`DeemedAcquisitionResultCard`·`InstallmentResultCard`·`HouseCountVerifier`·`ReductionPossibilityPanel`·`RateScenarioTable`)의 **카드-내부 하드코딩 인용**은 미링크 | 카드 5종 내부 인용 링크화 + 입력폼 도움말 + 전수검증 |
| **주식양도세** | 엔진 `StockTransferResult.appliedRules: string[]`(예 `"§94②우선"`·`"80%하한"`) — **CalculationStep 구조화 부재**. 결과 섹션은 legalBasis 미노출 | 결과뷰 구조화는 비목표(엔진 변경 큼). **입력폼 hint·산식 카드 링크화 위주** |
| **종합부동산세** | **LawArticleModal import 자체 없음(링크 0)**. 결과뷰가 `getCalculatedTaxBadge()`(L259 정의·L303 사용)로 badge 문자열 **UI 자체 파생**(엔진 legalBasis 미경유·`legalBasis` 렌더 0건) | **링크 0부터 전부 + dual-truth 주의**. badge 조문도 (A)검증 대상 |

> **핵심**: 재산세·취득세=결과뷰 본체 `legalBasis` 모달 완성(취득세는 카드 5종 내부 인용만 잔여) / 주식양도세=입력폼 부분(결과뷰 비구조화) / 종부세=완전 신규+dual-truth(어려움).

### 3.2 세목별 인벤토리 요약 (실측)

| 항목 | 취득세 | 재산세 | 종합부동산세 | 주식양도세 |
|---|---|---|---|---|
| UI 디렉터리 | `components/calc/acquisition/`(Step0~5) | `components/calc/property/`(Step1~3·shared) | `app/calc/comprehensive-tax/`(page·Step1Basic) + `components/calc/comprehensive/` | `components/calc/stock-transfer/`(19컴포넌트) |
| 결과뷰 | `AcquisitionTaxResultView` + `results/acquisition/`(카드 6 + 그래프 1) | `PropertyTaxResultView` | `ComprehensiveTaxResultView` + `results/comprehensive-payable-calc/`·`comprehensive-filing/`(별지 서식 다수: Main·Buppyo3·5·5Sub 등) | `StockTransferTaxResultView` + `results/`(5섹션) |
| legal-codes 파일(행수, 실측) | `acquisition.ts` **341행** | `property.ts` **362행** | `comprehensive.ts` **299행** | `stock.ts` **556행**(환원율 위임체인 포함) |
| 기존 LawArticleModal 링크 | 입력폼 ~8 + **결과뷰 본체 legalBasis 전부** + SurchargeFlowDiagram | 결과뷰 legalBasis 전부 + §115 | **0** | 입력폼 1파일(`MajorShareholderCheckpointHints`) 12배지 |
| UI 노출 인용(미링크 추정) | 도움말 80+ · 결과뷰 카드 40+ | 입력폼 ~10 | UI/결과뷰 ~40 | hint 30~50 · 산식 20~30 |
| 고유 조문(검증 대상, 대략) | 다수(검증 시 확정) | ~81 | 40~50 | 50~60 |
| 엔진 legalBasis 노출 | `result.legalBasis[]`(50+) | `result.legalBasis[]` | 없음(UI 파생) | `appliedRules[]`(구조화 부재) |

> 인용 "총건수"·"고유 조문 수"는 에이전트 grep 기반 **대략치** — Phase 0 인벤토리 스크립트로 세목별 확정.

### 3.3 법령 MST (확보 완료 — KoreanLaw `search_law` 2026-06-15)

| 법령 | MST | 세목 |
|---|---|---|
| 지방세법 | `282559` | 취득·재산 |
| 지방세법 시행령 | `286395` | 취득·재산·종부(연동) |
| 지방세법 시행규칙 | `282705` | 취득 |
| 지방세특례제한법 | `286607` | 취득·재산 감면 |
| 지방세특례제한법 시행령 | `286147` | 취득·재산 |
| 종합부동산세법 | `280417` | 종부 |
| 종합부동산세법 시행령 | `283639` | 종부 |
| 종합부동산세법 시행규칙 | `285003` | 종부(별지서식) |
| 소득세법 | `285523` | 주식양도(양도세서 확보) |
| 소득세법 시행령 | `286211` | 주식양도 |
| 소득세법 시행규칙 | `286379` | 주식양도(환원율 §81) |
| 조세특례제한법 | `286597` | 주식양도(K-OTC) |
| 조세특례제한법 시행령 | `286143` | 주식양도 |
| 상속세및증여세법 | `276123` | 주식양도(비상장평가 §60~66) |
| 상속세및증여세법 시행령 | `283637` | 주식양도(상증령 §52의2②) |
| 상속세 및 증여세법 시행규칙 | `284609` | 주식양도(환원율 §17, 정식명 띄어쓰기) |

### 3.4 aliases 보강 필요 (실측 — 양도세 `소령` 보강과 동일 패턴)

| 약칭/표기 | 정식명 | 세목 | 현황 |
|---|---|---|---|
| `종합부동산세법 시행령`·`종부세법 시행령`·`종부령` | 종합부동산세법 시행령 | 종부 | **미등록**(본법 종부세법만 있음) |
| `민간임대주택법` | 민간임대주택에 관한 특별법 | 종부 | 미등록(`민특법`·`임대주택법`만 있음) |
| `상법` | 상법 | 취득(휴면법인 §520의2) | **미등록** |
| `수도권정비계획법` | 수도권정비계획법 | 취득(중과 §6①1호) | **미등록** |
| `증권거래세법`·`증권거래세법 시행령` | 증권거래세법 | 주식양도 | **미등록** |
| `국고금관리법`·`국고금 관리법` | 국고금 관리법 | 주식양도(절사 §47, 코드 L235~239 띄어쓰기) | **미등록** |
| `상속세 및 증여세법 시행규칙`(띄움) | 상속세및증여세법 시행규칙 | 주식양도(환원율 §17, 코드 L214 정식명 띄어쓰기) | **확인 필요**(본법 띄움·시행규칙 붙임은 등록, 시행규칙 띄움형 미등록 — 법제처 검색 가부 후 결정) |

> 재산세는 지방세법·시행령·지특법만 사용 → **aliases 보강 불필요**.
> 주식양도세 `상증령`(L201 약칭)은 aliases 등록됨. 시행규칙은 정식명 띄어쓰기형(`상속세 및 증여세법 시행규칙`)을 사용하므로 위 별도 행으로 확인.
> 정식명 확정은 Phase 1에서 KoreanLaw `search_law`로 검증 후 등록(예: "민간임대주택에 관한 특별법" 띄어쓰기·"국고금 관리법" 공백).

---

## 4. 목표 · 비목표

### 목표
1. 4세목 마법사·결과뷰 노출 법조문 인용 전수를 KoreanLaw **본문 대조 검증**, 오류 정정(엔진 legal-codes 상수·UI 파생 badge 포함).
2. 검증 통과 인용을 `LawArticleModal` 클릭 팝업으로 **링크화**(미링크 → 가능한 전부).
3. 누락 약칭 보강(§3.4) + 파서 anchor.
4. E2E로 "배지 클릭 → 조문 팝업" 동작 검증(세목별 1 spec).
5. G-5 항 하이라이트는 label에 항을 넣어 **자동 적용**(추가 구현 0).

### 비목표
- 엔진 계산 로직·input/result 타입 변경 (14지점 동기화 **해당 없음** — 순수 UI 표시 링크).
- **종부세 결과뷰 dual-truth 근본 해소**(`getCalculatedTaxBadge` → 엔진 `step.legalBasis` 단일화)는 **별도 과제**. 이번엔 badge 조문 *검증·링크화*까지만.
- **주식양도세 결과뷰 `appliedRules` 구조화**(CalculationStep 도입)는 별도 과제. 이번엔 입력폼·산식 카드 링크화까지.
- 행위시법(과거 과세연도 조문) 자동 전환 — 현행 조문 링크가 기본. 종부세 "구법" 인용은 §8 리스크 참조.
- `app/guide/*` 교육 페이지(후순위).
- **비노출 인용** — SEO 메타(`layout.tsx`·`page.tsx`의 `description`·OpenGraph)·엔진 주석은 사용자 화면 미노출 → **링크화 비대상**(정확성 검증은 legal-codes 상수 경유 시 포함).

---

## 5. 세목별 작업 계획 (각 5 Phase)

각 세목 공통 5단계: **Phase 0 인벤토리 고정 → Phase 1 약칭·anchor → Phase 2 전수검증·정정 → Phase 3 링크화 → Phase 4 테스트·회귀**. 세목 특이사항만 아래에 명시.

### 5.1 재산세 (난이도: 하 — 빠른 성과·지방세법 검증 착수)

- **Phase 0** — `extract-law-citations.mjs`에 property ROOTS(`components/calc/property/**` + `PropertyTaxResultView`) 추가. 인벤토리 고정.
- **Phase 1** — aliases 보강 **불필요**. anchor: 지방세법·시행령 파싱 케이스 1~2건.
- **Phase 2 검증 법령군**:

  | 군 | 조문 | 주요 위치 |
  |---|---|---|
  | 과세대상·납세의무자 | 지방세법 §104~§109, 시행령 §105·§119의2 | `property-object.ts`·`property-house-scope.ts`·Step1 |
  | 토지 3분류 | §106①(1~3호)·②, 시행령 §101·§102·§102의3 | `property-land-classification.ts`·Step2* |
  | 세율 | §111·§112·§113·§146③1호 | `property-tax.ts` |
  | 세부담상한 | §122(단서) | `property-tax.ts`·Step3·shared |
  | 부가세 | §112(지방교육세)·§151 | `property-tax.ts` |
  | 감면 | 지특법 §17·§31·§31의3·§36의2·§52·§58·§180 | `legal-codes/property.ts`·`property-exemption.ts` |
  | 결과뷰 echo | 위 조문 | `PropertyTaxResult.legalBasis[]` |

  - memory `project_property_tax_review_r1` 정합 확인: §122 단서 주택상한 배제·§146③ 6구간.
- **Phase 3 링크화** — 입력폼(Step1·Step2Separated·Step2SeparateAggregate·Step3) 도움말 ~10건 배지. **결과뷰는 이미 완성** — legalBasis 문자열 정확성만 검증.
- **Phase 4** — anchor + E2E `property-law-citation-link.spec.ts`(결과뷰 "법령 근거 보기" 펼침→배지 클릭→팝업).

### 5.2 취득세 (난이도: 하~중 — 결과뷰 본체 완성·카드만 잔여, 지방세법 검증 재사용)

- **Phase 0** — acquisition ROOTS(`components/calc/acquisition/**` + `results/acquisition/**` + `AcquisitionTaxResultView`) 추가.
- **Phase 1** — aliases `상법`·`수도권정비계획법` 보강 + anchor. (지방세법 계열은 재산세서 확인됨)
- **Phase 2 검증 법령군**:

  | 군 | 조문 | 주요 위치 |
  |---|---|---|
  | 과세대상·취득시기 | 지방세법 §6·§7·§7의2(간주취득)·§9·§10의5·§20⑤ | `acquisition-object.ts`·`acquisition-deemed.ts`·Step0·Step1 |
  | 과세표준 | §10~§10의5 | `acquisition-tax-base.ts`·`acquisition-standard-price.ts` |
  | 세율 | §11·§12·§15(특례) | `acquisition-tax-rate.ts`·Step3·Step5 |
  | 중과 | §13·§13의2·§13의3, 시행령 §28의2~§28의6 | `acquisition-tax-surcharge.ts`·`acquisition-corp-surcharge.ts`·Step2·Step4·`SurchargeFlowDiagram` |
  | 휴면법인 | 상법 §520의2, 지방세기본법 §46 | `acquisition-dormant-corp.ts` |
  | 감면 | 지특법 §36의3·§6·§15, 농특세법 §4②6호·§5 | Step5·`acquisition-self-cultivation-reduction.ts` |
  | 결과뷰 echo | 위 조문 | `result.legalBasis[]`·카드 5개 하드코딩 |

  - memory `project_acquisition_review_r1` 정합 확인: §6 비취득 enum 제거(§15 특례가 정답)·개수 2.8% dual-truth.
- **Phase 3 링크화** — ① 입력폼 Step0~5 도움말(미링크 다수) 배지. ② **결과뷰 본체·`SurchargeFlowDiagram`은 이미 legalBasis 모달 완성** — legalBasis 문자열 정확성만 검증(정정 시 엔진 일괄). ③ 개별 카드 5종(`Deemed`·`Installment`·`HouseCount`·`ReductionPossibility`·`RateScenario`)의 카드-내부 하드코딩 인용만 LawArticleModal 배지 추가(`LinearInterpolationGraph`는 그래프 — 인용 없음, 대상 외).
- **Phase 4** — anchor + E2E `acquisition-law-citation-link.spec.ts`.

### 5.3 종합부동산세 (난이도: 상 — 링크 0·dual-truth·구법·별지)

- **Phase 0** — comprehensive ROOTS(`app/calc/comprehensive-tax/**` + `components/calc/comprehensive/**` + `ComprehensiveTaxResultView` + `results/comprehensive-payable-calc/**` + `results/comprehensive-filing/**`) 추가.
- **Phase 1** — aliases **종합부동산세법 시행령**·**민간임대주택법** 보강(정식명 검증 후) + anchor.
- **Phase 2 검증 법령군**:

  | 군 | 조문 | 주요 위치 |
  |---|---|---|
  | 주택분 | 종부세법 §8·§9·§10·§10의2, 시행령 §3·§4·§4의2·§4의3·§5의2 | `comprehensive-tax.ts`·Step1Basic·`HousingPayableTaxCalcCard` |
  | 토지분 | §11~§15 | `comprehensive-land-*.ts`·`LandParcelSection`·page L165·229 |
  | 합산배제 | §8④(1~4호), 시행령 §3·§4 | `comprehensive-exclusion.ts`·ResultView L260~280 |
  | 법인특례 | §9②3호·§10단서 | page L298~321·Step1Basic |
  | 재산세 연동 | 지방세법 §110~§113·§122, 시행령 §109①2호 | `comprehensive-prior-year.ts`·payable-calc |
  | 부가세 | 농특세법 §5①5호 | `legal-codes/comprehensive.ts` |
  | 별지서식 | 시행령 §4의3 | `ComprehensiveFilingFormBuppyo3` |
  | **구법(행위시법)** | 구 §9①3호·구 §10② 등 | `comprehensive-historical.ts`·ResultView |

  - **dual-truth 검증**: `getCalculatedTaxBadge()`가 UI에서 파생하는 조문(§9②1호·§10의2 등) **전부 본문 대조**. 엔진과 불일치 시 정정.
  - memory `project_comprehensive_tax`(과세연도별 §9·세율표)·`project_comprehensive_*` 시리즈 정합 확인.
- **Phase 3 링크화** — LawArticleModal import부터(신규). ① page.tsx·Step1Basic 도움말. ② ResultView TaxRow badge → LawArticleModal 포장. ③ payable-calc 산식 라벨. ④ Buppyo3 §4의3. **구법 인용은 §8 리스크 처리**(현행 부재 시 보류/연혁 안내).
- **Phase 4** — anchor + E2E `comprehensive-law-citation-link.spec.ts`.

### 5.4 주식양도세 (난이도: 중 — (A)검증 거의 완료, (B)링크화 위주)

- **선행 신뢰도**: 코드 주석상 KoreanLaw 검증 완료(2026-05-19)·§82·§163⑨ 오류 정정 이력·환원율 위임체인(소령§165④→시칙§81②→상증칙§17) 기재. **단 Phase 2 재확인은 수행**(주석 신뢰 ≠ 본문 재대조, memory `feedback_kiwoom_law_citation_drift`).
- **Phase 0** — stock-transfer ROOTS(`components/calc/stock-transfer/**` + `StockTransferTaxResultView` + 관련 results 섹션) 추가.
- **Phase 1** — aliases `증권거래세법`·`국고금 관리법` 보강 + `상속세 및 증여세법 시행규칙`(정식명 띄어쓰기형 — 코드 `legal-codes/stock.ts:214` 사용, aliases에 시행규칙 띄움형 미등록) 법제처 검색 가부 확인 후 필요 시 별칭 추가. (`상증령` 약칭은 L201, 이미 등록) + anchor.
- **Phase 2 검증(재확인) 법령군**:

  | 군 | 조문 | 주요 위치 |
  |---|---|---|
  | 과세대상 | 소득세법 §94①3·4·§118의2~ | `legal-codes/stock.ts` |
  | 대주주·기준시가 | §99①3·4, 시행령 §157·§165·§167 | `stock-valuation-listed.ts`·`MajorShareholderCheckpointHints` |
  | 세율·보유기간 | §103②·§104①11·§104② | `legal-codes/stock.ts` |
  | 비상장 보충적평가 | 시행령 §165④·§176의2, 환원율 시칙§81②·상증칙§17 | `stock-valuation-unlisted.ts`·`stock-valuation-post-listing.ts` |
  | §163⑨·§82 회귀 | (정정 완료분) | `apply-163-9-conversion.ts`·`stock-valuation-post-listing.ts` |
  | K-OTC·ATS | 조특법 §14①7호·§104의4 | |
  | 가산세·지방세·절사 | 국기법 §47의2·3, 지방세법 §103의3, 국고금관리법 §47 | |

- **Phase 3 링크화** — 입력 hint(`AcquisitionLotsMatrix`·`CompanyTypeBlock`·`CaseFortyNineFormulaCard` 등) + 산식 카드. 결과뷰 `appliedRules` 구조화는 비목표(별도) — 가능하면 `parseLawRefsForModal`로 부분 파싱 시도하되 무리한 엔진 변경 금지.
- **Phase 4** — anchor + E2E `stock-transfer-law-citation-link.spec.ts`. §82·§163⑨ 회귀 grep 0 유지.

---

## 6. 권장 진행 순서

두 관점 모두 **재산세 → 취득세 → 종부세 → 주식양도세** 순으로 수렴:

1. **난이도순**: 재산세·취득세(하~중, 결과뷰 본체 완성) → 주식양도세(중) → 종부세(상). 빠른 성과로 패턴 안정화 후 난제.
2. **법령군 검증 재사용순**: 재산세(지방세법 착수) → 취득세(지방세법 재사용) → 종부세(지방세법 연동 + 종부세법) → 주식양도세(소득세법 — 양도세 검증분 재사용).

→ **권장: 재산세 → 취득세 → 종부세 → 주식양도세.** 지방세법 검증이 재산→취득→종부로 누적 재사용되고, 소득세법은 양도세 완료분을 주식양도세가 마지막에 흡수한다.

**PR 분리**: 세목당 1 PR(검증+정정+링크+anchor+E2E 묶음). 종부세는 규모상 (검증·정정) / (링크화·별지) 2 PR 분할 검토.

---

## 7. 핵심 설계 결정

1. **인프라 신규 0** — 양도세·상속·증여 자산 그대로. 세목 차이는 약칭·MST·조문·결과뷰 구조뿐.
2. **검증 먼저, 링크 나중** — 잘못된 인용을 링크하면 오류가 클릭 가능해져 악화. Phase 2 통과분만 Phase 3.
3. **엔진 legal-codes 상수·UI 파생 badge 동시 검증** — 양도세 §9 교훈: 결과뷰 표시 문자열이 엔진 상수·UI 파생과 드리프트 공유 가능. UI만 정정 금지·일괄.
4. **결과뷰 구조 차이 존중** — 재산세(완성)·취득세(부분)·종부세(0)·주식양도세(비구조화)에 맞춰 접근 차등. 구조 리팩토링(종부세 단일화·주식 CalculationStep)은 **별도 과제로 분리**.
5. **현행 조문 링크 기본** — 행위시법 자동전환 비목표. 종부세 "구법"·폐지 조문은 본문 검증으로 가부 판정.
6. **항·호는 label로** — G-5 자동 하이라이트. legalBasis엔 조문만.

---

## 8. 리스크 · 완화

| 리스크 | 세목 | 완화 |
|---|---|---|
| **종부세 dual-truth** — `getCalculatedTaxBadge` UI 파생 조문이 엔진과 불일치 | 종부 | Phase 2에서 badge 조문 본문 대조. 정정은 UI+엔진 일괄. 근본 단일화는 별도 과제 명시 |
| **종부세 "구법"·폐지 조문** — 현행 팝업 부정확/부재 | 종부 | Phase 2 본문에서 현행 존재·"삭제" 확인. 부재 시 링크 보류/연혁 안내. `comprehensive-historical.ts` 연도분기 인지 |
| **주식 결과뷰 `appliedRules` 비구조화** — 링크화 시 엔진 대변경 유혹 | 주식양도 | 구조화는 비목표. 입력폼·산식 위주 링크. 엔진 변경 금지 |
| **취득세 결과뷰 하드코딩 카드 5개** — 인용이 JSX 문자열 산재 | 취득 | 카드별 배지 추가. 가능하면 엔진 legalBasis로 통일하되 무리한 변경 금지 |
| **법령명 없는 단독 `§`** — parseLawRef skip | 전 세목 | legalBasis에 법령명 보완. label은 짧게 |
| **누락 약칭**(종부령·민특법·상법·수도권정비계획법·증권거래세법·국고금관리법) | 종부·취득·주식 | Phase 1 aliases 보강 + anchor. 정식명 KoreanLaw 검증 |
| **800줄 초과 파일** — 배지 추가로 경계 초과 | 전 세목 | 배지는 소량. 초과 시 섹션 분리(양도세 `TransferReductionRows` 선례) |
| **ESLint --fix dead import 제거** | 전 세목 | 신규 import 한 줄 한 named(CLAUDE.md 함정) |
| **차단 validation 무관** — 본 작업은 표시 링크라 validation 미변경 | 전 세목 | E2E 진입만 확인. memory `feedback_blocking_validation_full_e2e_regression` 해당 없음 |
| **E2E worktree 포트 경합** | 전 세목 | `E2E_PORT=3100`(memory `feedback_e2e_worktree_port_isolation`) |
| **오류 과대주장** — 검증 전 "오류" 단정 | 전 세목 | 본문 대조 후만 정정 단정. 미검증은 "확인 필요"(memory `feedback_numeric_impact_verify_before_bug_claim`) |

---

## 9. 산출물 (PDCA 문서)

- 본 계획서 `docs/00-pm/multi-tax-law-citation-link.plan.md`
- 세목별 설계 `docs/02-design/features/{tax}-law-citation-link.{engine,ui}.design.md` (Do 전 13단계 self-review 후, 세목별)
- 세목별 인벤토리 `docs/.../{tax}-law-citation-inventory.md`(미링크 우선순위표)
- 코드(Do): aliases 보강 · 배지 추가 · anchor · E2E (세목별 PR)
- 메모리: 세목별 `project_{tax}_law_citation_link` + `feedback_law_citation_link_workflow` 갱신

---

## 10. 완료 기준 (Definition of Done — 세목별 반복)

각 세목마다:
- [ ] Phase 0 인벤토리 고정(미링크 우선순위표, 스크립트 회귀 감시)
- [ ] aliases 보강(해당 세목) + anchor 통과
- [ ] Phase 2 법령군 전수 본문 검증(`get_law_text` 본문 — `verify_citations` 존재확인만 금지), 오류 정정 목록 확정(엔진 상수·UI 파생 포함)
- [ ] 미링크 중 링크 가능분 전부 `LawArticleModal` 적용(불가 유형은 사유 기재)
- [ ] E2E `{tax}-law-citation-link.spec.ts` 통과(`E2E_PORT` worktree 격리)
- [ ] `npx tsc --noEmit` 0 · `npm run lint` 0 error · `npm test` 전체 통과 · 800줄 충족
- [ ] 검증한 인용 전부 정확(또는 정정 완료) — 오류 과대주장 금지
- [ ] 메모리 갱신(세목별 project + 워크플로)

**전체 완료**: 4세목 모두 위 충족 → 6대 세목 + 주식양도세 **전 세목 법조문 인용 검증·링크화 완결**.

---

## 부록 A. 별도 과제 (이번 범위 외 — 명시 분리)

- 종부세 결과뷰 dual-truth 해소: `getCalculatedTaxBadge()` → 엔진 `step.legalBasis` 단일화(양도세 결과뷰 구조 차용).
- 주식양도세 결과뷰 `appliedRules: string[]` → CalculationStep 구조화(legalBasis 필드 도입).
- `app/guide/*` 교육 페이지 인용 링크.
- 행위시법 연동(과거 과세연도 조문 팝업) — `/law` applicable-law 인프라 활용 검토. 종부세 연도별 세법에 특히 유효.

---

## 부록 B. 검토 로그 (13단계 self-review, 2026-06-15)

### 적용 범위
사용자 지시로 **계획서 검토·보완**에 한정(옵션 A). 13단계 중 **STEP 1~4(계획서 다중검토→정정→재검토→정정) + 통합정합(STEP 10을 계획서 내부 정합으로)** 수행. **STEP 5·12(엔진/UI 설계 문서 생성)는 옵션 B(설계+Do 착수)로 분리** — 사용자가 A·B를 명시 구분했으므로 설계 문서는 Do 진입 시 세목별 생성(`plan-design-self-review-loop` STEP 5·12는 그 단계에서 충족).

### 실측 근거 (추정 금지 — grep/Read/KoreanLaw)
- 재산세 `PropertyTaxResultView`:16·294~304 — legalBasis.map→LawArticleModal **완성** 확인.
- 취득세 `AcquisitionTaxResultView`:131·149·677~678·693~699 — 본체가 result/step/detail legalBasis **전부 모달 렌더**(계획서 초안 "SurchargeFlowDiagram만" 오류 정정).
- 종부세 `ComprehensiveTaxResultView`:259·303 — `getCalculatedTaxBadge` UI 파생·`legalBasis` 렌더 0·LawArticleModal import 0 확인.
- 주식양도세 `legal-codes/stock.ts`:214 — "상속세 및 증여세법 시행규칙"(정식명 띄어쓰기) 확인(에이전트 "상증칙" 보고 부정확). L201 "상증령" 약칭·L235~239 "국고금 관리법".
- legal-codes 행수 `wc -l`: acquisition 341·property 362·comprehensive 299·stock 556 (초안 "194행" 오류 정정).
- MST: 상속세 및 증여세법 시행규칙 `284609`(KoreanLaw `search_law`).

### 검토 발견·정정 (1·2차 누적 9건)
| # | 차수 | 분류 | 위치 | 정정 |
|---|---|---|---|---|
| 1 | 1 | 오류(High) | §3.1·§5.2 취득세 결과뷰 | "SurchargeFlowDiagram만"→본체 legalBasis 모달 완성·카드 5종 내부 인용만 잔여. 난이도 중→하~중 |
| 2 | 1 | 오류(High) | §3.2 legal-codes | "194행"→실측 행수(341·362·299·556), 단위 통일 |
| 3 | 1 | 누락(Med) | §5.2 취득세 | `LinearInterpolationGraph`=인용無·대상 외 명시 |
| 4 | 1 | 오류(Low) | §3.2 종부세 별지 | "5종"→Main·Buppyo3·5·5Sub 등 다수 |
| 5 | 1 | 개선(Low) | §3.2 주식 배지 | "12배지"→1파일(`MajorShareholderCheckpointHints`) 내 12 |
| 6 | 1 | 누락(Med) | §4 비목표 | SEO 메타·엔진주석 비노출=링크화 비대상 추가 |
| 7 | 2 | 오류(High) | §5.4 Phase 1 | "상증규=상증칙 기존"→정식명 "상속세 및 증여세법 시행규칙"(띄움), 검색가부 확인 후 별칭 |
| 8 | 2 | 누락(Med) | §3.3 MST | 상증규 MST `284609` 기입(+상증령 283637) |
| 9 | 2 | 누락(Low) | §3.4 | 상증법 시행규칙 띄움형 별칭 후보 행 추가 |

### 통합정합 (계획서 내부 정합축)
| 정합 축 | 판정 |
|---|---|
| §3.1 구조 ↔ §5 세목 작업 ↔ §6 난이도순 | ✓ (취득세 하향 일괄 반영) |
| §3.4 약칭갭 ↔ §5 Phase 1 보강 ↔ §3.3 MST | ✓ (상증규 행·주식 시행규칙 동기화) |
| §4 비목표 ↔ §5 Phase(메타 링크 지시 없음) | ✓ |
| memory 참조(`project_property_tax_review_r1`·`project_acquisition_review_r1`·`project_comprehensive_tax`) 실재 | ✓ (MEMORY.md 확인) |

### 잔여 "확인 필요" (Phase 0/1·2에서 확정 — 계획 단계 미단정)
- 재산세 입력폼 미링크 정확 건수(§5.1 "~10") → Phase 0 인벤토리.
- 종부세 "구법"(구 §9①3호 등) 현행 존재/삭제 → Phase 2 본문.
- `상속세 및 증여세법 시행규칙` 띄움형 법제처 검색 가부 → Phase 1.
- 증권거래세법 코드 표기형(약칭/정식) → Phase 1.
- 주식 `appliedRules` 인용의 결과뷰 노출 범위(링크 가능분) → Phase 0.
