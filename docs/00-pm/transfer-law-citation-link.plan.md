# 양도소득세 도움말 법조문 인용 검증 + 클릭 팝업 링크화 — 계획서

> 작성일: 2026-06-15 · 대상 세목: 양도소득세(transfer, 부동산) · 선행 완료: 상속·증여세 PR#196(merge `1a52a123`)
> 본 계획은 상속·증여세에서 확립한 워크플로(memory `feedback_law_citation_link_workflow`)를 양도세로 확장한다.
> **모든 수치·인용은 조사 완료 실측이며 추정이 아니다** (CLAUDE.md 검증 기준 강제).

---

## 1. 배경 · 문제 정의

양도세 마법사 입력 폼·결과뷰의 법조문 인용은 두 가지 미흡점이 있다.

1. **(A) 정확성 미검증** — 인용 조문번호·항·호가 현행 법령 본문과 일치하는지 전수 확인된 바 없다. 양도세는 소득세법 본법/시행령/시행규칙 + 조세특례제한법/시행령 + 농어촌특별세법 + 상증법(의제취득·부담부증여 평가)이 교차하여 인용 밀도가 6세목 중 최대다.
2. **(B) 비클릭** — 인용 대부분이 일반 텍스트(`hint`·`description`·`<li>`·`<p>`)라, 사용자가 조문 원문을 볼 수 없다. 이미 `LawArticleModal`이 일부 도입(29개 링크)됐으나 전체의 **9.8%**에 불과하다.

상속·증여세에서 (A)검증 + (B)팝업링크 + E2E + 항(項)하이라이트를 완료했고, 그 인프라는 **전 세목 공용**이므로 양도세는 인프라 재구축 없이 ②약칭·③MST·④인용조문만 양도세 것으로 교체해 적용한다.

---

## 2. 현황 실측 (조사 완료 — 추정 아님)

### 2.1 인용 규모 (throwaway probe `extract-law-citations` 로직, 양도세 경로)

대상: `components/calc/transfer/**` + `components/calc/results/transfer/**` + `TransferTaxResultView`·`MultiTransferTaxResultView`·`MultiTransferTaxSummaryCard`.

| 지표 | 값 |
|---|---|
| 노출 인용 | **295** |
| 이미 링크(`legalBasis=`) | **29** (9.8%) |
| 미링크 | **266** |
| 인용 보유 파일 | **69** |

(참고: 상속·증여는 노출 218·링크 31·미링크 187·61파일 → 양도세가 규모 1.4배)

**법령군 분포**(미링크 코드 라인 키워드 빈도): 조특령 28 · 소득세법 17 · 소득세법 시행령 9 · 농어촌특별세(법) 16 · 조특법 6 · 상증법 6 · 상증령 1. (다수 인용이 법령명 생략 `§`만 — §빈도로 별도 집계)

**조문 빈도 top**(미링크): §166(32) · §168(19) · §164(19) · §97(16) · §99(12) · 조특§98의3(12) · §163(11) · §97의2(10) · §98의5/§98의6/§98(각8) · §95(8) · §155(6) · §99의2(6) · §89(5) · §167의3(5) · §162(5) · §99의3(4) · §159(4) · §176(4) · 상증§60(4) · §176의2(3) · §168의12(3) · §163의2(3) · §161(3) · §114(3).

**미링크 상위 파일**(링크 우선순위):

| 미링크 | 파일 | 법령군 |
|---|---|---|
| 20 | `results/transfer/RedevelopmentDetailCard.tsx` | 재개발 §166 계열 |
| 17 | `transfer/RedevelopmentBlock.tsx`(이미 4링크) | 재개발 §166·§164 |
| 12 | `transfer/GeneralBuildingBlock.tsx` | 비사업용 §104의3·§168의12 |
| 11 | `transfer/RedevelopmentValuationSection.tsx` | 재개발 평가 |
| 10 | `transfer/Unsold983InputForm.tsx` | 조특 미분양 §98의3 |
| 10 | `transfer/Unsold986InputForm.tsx` | 조특 §98의6 |
| 9 | `transfer/Unsold992InputForm.tsx` | 조특 §99의2 |
| 9 | `results/TransferTaxResultView.tsx`(이미 imp) | 결과뷰 |
| 8 | `transfer/RentalHousingExceptionSection.tsx`(이미 5링크) | 임대주택 감면 |
| 8 | `transfer/nbl/UnconditionalExemptionSection.tsx`(이미 7링크) | 비사업용 무조건제외 |
| 7 | `transfer/FamilyBusinessInheritanceTransferSection.tsx` | 가업 §97의2 |

### 2.2 표기 컨벤션 (코드 실측 — 파서 영향)

양도세 인용은 표기가 비일관하나, **`parseLawRef`가 대부분 흡수**한다(아래 2.5에서 검증).

- **`§N조의M` 혼용** — `§168조의14`(7회)·`§176조의2`·`§114조의2`·`§167조의3`. § 가 이미 "조"인데 "조의M"을 덧붙인 비표준 표기.
- **법령명 생략 단독 `§`** — `(§104의3·§168의12)`처럼 소득세법 문맥이 자명하면 법령명 없이 `§`만. (양도세에 흔함)
- **법령명 공백 비일관** — `소득세법시행령`(붙임) vs `소득세법 시행령`(띄움) 혼재. aliases.ts에 둘 다 등록되어 무해.
- **약칭 `소법`·`소령`** — `소법 §97의2④2호`·`소령 §166⑥`·`소령 §176조의2④`. **aliases.ts 미등록**(2.5 갭).
- **항·호 동반** — `§166 ① 2호`·`§95④`·`§97①·②`. label로 넘기면 G-5 자동 하이라이트.

### 2.3 인용 정확성 — 표본 검증 결과 (KoreanLaw MCP, 현행 MST)

표본 3건 전부 본문 대조 **정확**. 양도세 인용 품질도 상속·증여처럼 높을 것으로 보이나 단정 금지 — 전수 검증은 Phase 2.

| 조문 | 인용 위치 | 본문(법제처) | 판정 |
|---|---|---|---|
| 소득령 §166 | `RedevelopmentBlock`·`CompanionAcqPurchaseBlock`(§166①2호·③·⑥·⑦) | "양도차익의 산정 등"(재개발·재건축 조합원 입주권/신축주택). ⑤=장특공 보유기간, ⑦=기준시가 양도차익 | ✓ 정확 |
| 소득령 §163 | `InheritedAcquisitionDeemedSection`(§163⑨)·환산취득가(§163⑥·⑫) | ⑥=개산공제(개별공시지가×3/100 등), ⑨=상속·증여 취득가액 의제(상증법 §60~66 평가액), ⑫=환산취득가 | ✓ 정확 |
| 소득령 §168의14 | `GeneralBuildingBlock` 등(비사업용) | "부득이한 사유가 있어 비사업용 토지로 보지 않는 토지의 판정기준" | ✓ 정확 |

**MST 확보 완료**: 소득세법 `285523` · 시행령 `286211` · 시행규칙 `286379` · 조세특례제한법 `286597` · 시행령 `286143` · 시행규칙 `286381`.

### 2.4 재사용 가능한 기존 인프라 (실측 — 신규 0)

상속·증여 PR#196에서 완성·머지된 공용 자산. 양도세는 그대로 차용.

- **`LawArticleModal`**(`components/ui/law-article-modal.tsx`) — props `legalBasis`·`label`·`className`. 클릭→Dialog→`/api/law/article?law=&articleNum=`→조문본문(법제처). 양도세에서 **이미 10여 파일 사용 중**(RedevelopmentBlock·RentalHousingException·nbl/Unconditional·inheritance/*·TransferTaxResultView·DetailedCalculationStatementCard 등).
- **`parseLawRef`/`parseLawRefsForModal`**(`lib/utils/law-url.ts`) — 약칭→정식명(`resolveLawAlias`)·복합인용 분해(`· + , ;` 줄바꿈)·"시행령" 단독 직전본법 상속.
- **`extractClauseMarkers` + `LawContent`**(G-5) — label의 항(①~⑮) 자동 추출→본문 해당 항 amber 강조. label에 항 넣으면 자동 적용.
- **`resolveLawAlias`**(`lib/korean-law/aliases.ts`) — 양도세 핵심 약칭(소득세법·시행령·시행규칙·조특법·조특령·조특규·지방세법·농특세법·도정법·민특법) **이미 존재**. 누락은 `소법`·`소령` 2건뿐(2.5).
- **인벤토리 스크립트**(`scripts/extract-law-citations.mjs`) — 현재 상속·증여 경로 하드코딩. 양도세 경로 파라미터화 필요(Phase 0).

### 2.5 핵심 갭 (코드 실측)

1. **약칭 `소법`·`소령` 미등록** — `resolveLawAlias("소령")`이 매핑 없어 `"소령"` 그대로 반환 → 법제처가 "소령"으로 검색 실패. 현재는 해당 인용이 미링크(텍스트)라 안 깨지지만, 링크화 시 **보강 필수**. (상속·증여의 시행령 약칭 부재와 동일 패턴)
   - 보강: `소법→소득세법`, `소령→소득세법 시행령`, (선택) `소득령→소득세법 시행령`.
2. **법령명 없는 단독 `§` skip** — `parseLawRefsForModal`은 법령명 없는 `§`를 본법↔시행령 오인 방지로 skip. `(§104의3·§168의12)` 같은 인용은 링크하려면 **legalBasis에 법령명 명시**(`소득세법 §104의3`) 필요. label은 `§104의3`으로 짧게.
3. **`§N조의M` 표기는 버그 아님** — `ARTICLE_RE = /(?:§|제)\s*(\d+)(?:조)?(?:의\s*(\d+))?/`가 "조"를 옵션 흡수 → `§168조의14`→`168의14` 정상 파싱. 기존 링크 7+개 기능 정상. **표기 정규화(§N조의M→§N의M)는 가독성 선택**이지 필수 아님.

### 2.6 범위

- **포함**: `components/calc/transfer/**`(하위 rental·inheritance·mixed-use·nbl 포함) + `components/calc/results/transfer/**` + `TransferTaxResultView`·`MultiTransferTaxResultView`·`MultiTransferTaxSummaryCard`.
- **제외(별도 세목)**: 주식양도소득세(`stock-transfer`) — 독립 도메인. 별도 계획 권장. (memory `feedback_kiwoom_law_citation_drift`의 §82·§163⑨ 드리프트는 주식 환원율 산식 한정)
- **후순위**: `app/guide/transfer-tax/page.tsx`(교육 페이지) — 인용 다수이나 마법사·결과뷰 완료 후.

---

## 3. 목표 · 비목표

### 목표
1. 양도세 마법사·결과뷰 노출 법조문 인용 전수를 KoreanLaw 본문 대조 **검증**, 오류 정정.
2. 검증 통과 인용을 `LawArticleModal` 클릭 팝업으로 **링크화**(미링크 266 → 가능한 전부).
3. 약칭 `소법`·`소령` 보강.
4. E2E로 "배지 클릭 → 조문 팝업" 동작 검증.
5. G-5 항 하이라이트는 label에 항을 넣어 **자동 적용**(추가 구현 0).

### 비목표
- 엔진 계산 로직·input/result 타입 변경 (14지점 동기화 **해당 없음** — 순수 UI 표시 링크).
- 주식양도세·guide 페이지(후속).
- 행위시법(과거 양도연도 조문) 자동 전환 — 현행 조문 링크가 기본(리스크 7장).
- 인용 텍스트 자체 재작성(문구 개선)은 정정에 한함.

---

## 4. 작업 범위 (Phase)

### Phase 0 — 인벤토리 자동화 (Check 기반)
- `scripts/extract-law-citations.mjs`를 양도세 경로로 실행 가능하게 파라미터화(또는 양도세 전용 ROOTS 추가). 노출/링크/미링크 집계를 회귀 감시용으로 고정.
- 산출: `docs/.../transfer-law-citation-inventory.md`(미링크 우선순위 표).

### Phase 1 — 약칭 보강 + 파서 anchor (Track B 선행)
- `aliases.ts`에 `소법`·`소령`(·`소득령`) 추가.
- anchor `__tests__/korean-law/law-url-ref.test.ts`에 양도세 케이스 추가:
  - TC: `소법 §97의2④` → {소득세법, "97의2"} · `소령 §166⑥` → {소득세법 시행령, "166"}
  - TC: `§168조의14`(§+조 흡수) → "168의14" · `소득세법 §104의3` → "104의3"
  - TC: 법령명 없는 `§104의3` 단독 → skip(빈 배열) 확인(회귀 보존)

### Phase 2 — 인용 전수 검증 → 오류 정정 (Track A)
법령군별로 KoreanLaw `get_law_text` 본문 대조(존재만 확인하는 `verify_citations` 금지 — 본문 필수). 그룹:

| 군 | 조문 | 주요 파일 |
|---|---|---|
| A 재개발·재건축 | 소득령 §166·§164⑤⑥⑦·§176의2·§162① | RedevelopmentBlock/DetailCard/ValuationSection |
| B 필요경비·환산·의제취득 | 소득세법 §97·§97의2·§114, 소득령 §163·§176의2·§163의2, 상증법 §60·§61·§62 | CompanionAcqPurchaseBlock·CarryoverGiftBlock·InheritedAcquisitionDeemedSection·CommercialBuildingBlock·GeneralBuildingBlock |
| C 비과세·장특공·중과 | 소득세법 §89·§95·§103·§104, 소득령 §154·§155·§161·§162·§167의3 | ResidencePeriodSection·AggregateSettingsPanel·SpecialHouseExclusionSection |
| D 비사업용 토지 | 소득세법 §104의3, 소득령 §168의6~14·§168의12 | GeneralBuildingBlock·nbl/*·MixedUseSection |
| E 감면(조특) | 조특법 §97·§98의2~9·§99·§99의2~4, 조특령, 농특세법 §5 | UnifiedReductionPanel·New99/993/994·Unsold98 시리즈·RentalHousingException |
| F 부담부증여 | 소득령 §159, 상증법 §60·§47 | BurdenedGiftBlock·BurdenedGiftPriorGiftsBlock |
| G 결과뷰 | 위 조문 echo | TransferTaxResultView·MultiTransfer*·DetailedCalculationStatementCard |

- **E군 주의(행위시법)**: 조특 §98의3·§99 등은 시기별 한시·일몰 조문. 현행 법제처에 "삭제"이거나 부재일 수 있음 → 본문 검증 시 확인하여 링크 가부 판정(7장).

### Phase 3 — 링크화 적용 (Track B 본체)
- 미링크 우선순위(2.1 표) 순으로 배지 추가. 패턴:
  ```tsx
  // 섹션 헤더 <p> 아래 / FieldCard hint 옆 배지행
  <LawArticleModal legalBasis="소득세법 시행령 §166" label="§166①2호 재개발 양도차익" />
  ```
- 결과뷰 `appliedLaws`(string[]) 등은 `parseLawRefsForModal(law).map(...)` 일괄 클릭화 + 파싱 실패 시 텍스트 fallback.
- **링크 불가 유형 + 우회**: `RadioCardOption.description`·`ToggleCard`/`RadioCardGroup` `title`·`<li>` 본문은 런타임 string → 섹션 헤더/펼침 children/칩 헤더에 배지로 우회.
- 법령명 생략 `§`는 legalBasis에 법령명 보완.

### Phase 4 — 테스트 · 회귀
- anchor(Phase 1) + RTL(`LawContent` 강조는 상속·증여 기존 테스트로 커버) + E2E `e2e/transfer-law-citation-link.spec.ts`(배지 클릭→팝업 헤더 props 단정, 본문은 법제처 API 비단정, `E2E_PORT` worktree 격리).
- `npx tsc --noEmit` 0 · `npm run lint` 0 · `npm test` 전체 통과 · 800줄 정책 충족.

---

## 5. 산출물 (PDCA 문서)
- 본 계획서 `docs/00-pm/transfer-law-citation-link.plan.md`
- 설계 `docs/02-design/features/transfer-law-citation-link.{engine,ui}.design.md` (Do 전 13단계 self-review 후)
- 인벤토리 `docs/.../transfer-law-citation-inventory.md`
- 코드: aliases 보강 · 배지 추가 · anchor · E2E

---

## 6. 핵심 설계 결정
1. **인프라 신규 0** — 상속·증여 PR#196 자산 그대로. 세목 차이는 ②약칭(소법/소령)·③MST·④조문뿐.
2. **검증 먼저, 링크 나중** — 잘못된 인용을 링크하면 오류가 클릭 가능해져 악화. Phase 2 통과분만 Phase 3 링크.
3. **현행 조문 링크 기본** — 행위시법 자동전환은 비목표. 폐지·한시 조문은 본문 검증으로 가부 판정.
4. **항·호는 label로** — G-5 자동 하이라이트. legalBasis엔 조문만.
5. **표기 정규화는 선택** — 파서가 흡수하므로 기능 정상. 가독성 위해 정정 시 일괄.

---

## 7. 리스크 · 완화

| 리스크 | 완화 |
|---|---|
| **행위시법/폐지 조문**(조특 §98·§99 한시 일몰) — 현행 팝업이 부정확/부재 | Phase 2 본문 검증에서 법제처 현행 존재·"삭제" 확인. 부재 시 링크 보류 또는 연혁 안내. memory `feedback_reduction_sunset_is_acquisition_window`(일몰=취득기간, 과거 조문도 적용) 인지 |
| 법령명 생략 단독 `§` 다수 → parseLawRef skip | legalBasis에 법령명 보완 후 링크. label은 짧게 |
| 약칭 `소법`/`소령` 미등록 → 링크 실패 | Phase 1 aliases 보강 + anchor |
| 800줄 초과 파일(UnifiedReductionPanel 661·RedevelopmentDetailCard 513) | 배지 추가는 소량 — 초과 시 섹션 분리 |
| ESLint --fix dead import 제거 | 신규 import 한 줄 한 named (CLAUDE.md 함정) |
| E2E 진입 — 배지가 펼침/칩/모달 안 | 노출 단계(자산 칩·토글 펼침) 먼저. 상속 `EstateChipInlineExpand` 선례 |
| 상증법 인용(의제취득·부담부증여) 세목 혼선 | §60~66은 상증법, §163⑨·§159는 소득령 — 본문으로 구분(표본서 확인) |

---

## 8. 후속 과제 (이번 범위 외)
- 주식양도세(`stock-transfer`) 인용 검증·링크 (§82·§163⑨ 드리프트 정정 포함)
- `app/guide/transfer-tax` 교육 페이지 링크
- 행위시법 연동(과거 양도연도 조문 팝업) — `/law` applicable-law 인프라 활용 검토

---

## 9. 완료 기준 (Definition of Done)
- [ ] Phase 0 인벤토리 고정(미링크 우선순위표)
- [ ] aliases `소법`·`소령` 보강 + anchor 통과
- [ ] Phase 2 법령군 A~G 전수 본문 검증, 오류 정정 목록 확정
- [ ] 미링크 266 중 링크 가능분 전부 `LawArticleModal` 적용(불가 유형은 사유 기재)
- [ ] E2E `transfer-law-citation-link.spec.ts` 통과
- [ ] `npx tsc --noEmit` 0 · `npm run lint` 0 · `npm test` 전체 통과 · 800줄 충족
- [ ] 검증한 인용 전부 정확(또는 정정 완료) — "오류 과대주장 금지"(memory `feedback_numeric_impact_verify_before_bug_claim`)

---

## 10. 실행 결과 (2026-06-15, Do 1차 — 브랜치 `feat/transfer-law-citation-popup`)

### Phase 2 검증 (4 에이전트 전수, KoreanLaw `get_law_text` 본문 대조)
노출 266 인용 검증. 핵심 산식 조문(§166 계열·§163·§168의14·감면 조특 전부) 정확. **오류 5건** 발견(4건은 엔진 legal-codes 상수와 드리프트 공유 — 이번 작업이 도입한 게 아닌 기존 오류).

### 즉시 정정 4건 ✅
1. `RightExemption:182` — `§115`(소득세법 = 주식 대주주 장부 가산세) 삭제 → `국세기본법 §47의2~5` 단독.
2. `RedevelopmentBlock:445` — `§95④`(장특공 보유기간) → `시행령 §162①9호`(환지 양도시기, 본문 확인).
3. `CompanionAcqGiftBlock:39` — `§95④` → `§104②2호`(증여 단기보유, §97의2① 증여자 취득일).
4. `CompanionAcqInheritanceBlock:110` — `§95④` → `§104②1호`(상속 단기보유, 피상속인 취득일).

### 별도 과제 3건 ✅ 정정 완료 (후속 브랜치 `feat/transfer-law-citation-followup`)
KoreanLaw 본문으로 정확 근거 확정 후 UI+엔진 일괄 정정. anchor TC-T7~T10 추가. 계산 로직 무변경(인용 문자열·주석·UI 텍스트만).
1. **§155⑰**(재개발 거주통산) → **소득세법 시행령 §154⑧**(거주·보유기간 통산, 1호 멸실 재건축 — 정비사업 신축주택 포섭). 현행 §155⑰=삭제 확인. UI 2곳(배지 링크화) + 엔진 6곳 + `legal-codes:639` 상수 `REDEV_RESIDENCE_AGGREGATION` + `DetailedStatementRedevelopmentBuilders` 1곳 = **20건**.
2. **§168-11⑥**(2% 나대지) → **소득세법 §104의3①4호나목 + 지방세법 시행령 §101①2호나목**("건축물 시가표준액 < 부속토지 2% → 재산세 별도합산 제외 → 비사업용"). §168의11⑥=복합용도 면적안분(무관). UI `OtherLandDetailSection`(배지 2종×2박스) + 엔진 `other-land.ts` 주석.
3. **§168의11①1호**(무허가건축물) → **소득세법 §104의3①4호나목 + 지방세법 시행령 §101①단서**("허가 안 받은 건축물 부속토지 별도합산 제외"). §168의11①1호=체육시설용(무관). UI `GeneralBuildingBlock`(배지 2종) + 엔진 `general-building-valuation.ts` 주석.
- 검증: 잔여 오류 grep 0 · tsc 0 · eslint 0 · anchor 26(TC-T7~10 포함).

### 전역 사안 (단독 정정 금지 — 별도 결정)
- §164⑤/§164⑦ (주택 PHD 환산, memory `feedback_164_5_phd`) · §164⑧/§164⑥ (상업용) · §98 의제취득(§162⑥⑦ 정밀, 위임 본칙 인용 허용).

### Phase 3 링크화 ✅ 131 배지
재개발 32 · 필요경비·부담부증여 28 · 비과세·비사업용 26 · 감면·결과뷰 45. 보류 6조문 grep 0건 확인. 약칭 `소법`·`소령`·`소득령` aliases 보강 + anchor TC-T1~T6.

### 800줄 정책 ✅
`TransferTaxResultView` 808→716 (§99의3·공익 detail → `TransferReductionRows.tsx` 신규 추출). `RedevelopmentBlock` 800(경계, 위반 아님).

### 검증 ✅
`tsc --noEmit` 0 · `eslint` 0 error(7 warning 사전존재) · anchor 22 통과 · 전체 `vitest` **8168 passed**(577 files, 회귀 0). E2E 진행 중.
