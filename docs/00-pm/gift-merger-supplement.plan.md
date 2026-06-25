# 합병에 따른 이익의 증여(§38) 보완 계획서

> 상증법 §38 · 상증령 §28 · 상증기준 38-28-2. 작업 워크트리 `gift-merger`(브랜치 `feat/gift-merger-profit-38`).
> 첨부 이미지 10장(교재 「2026 양도·상속·증여세」 합병 증여이익 요약·산출방법·사례1·2) 기반.

## 0. 결론 요약 (TL;DR)

합병 §38은 **PR#289(Phase 2)에서 핵심 산식이 이미 구현·머지**되어 있다. 실측 결과 현재 엔진은
**개별 대주주 1명의 차감전 증여이익**을 사례1·2 모두 정확히 산출한다(아래 §2 실측).

이미지가 강조하는 영역 중 **미구현 6건(G1~G6)**을 갭으로 식별했다. 핵심은 평가가액
보조계산(§28⑤⑥)과 동일인 자기증여 차감·증여자별 안분(사례2)이다. 일부는 도구의
"평가값 직접입력" 설계 결정과 충돌하므로 **범위 결정(§7)이 선행**되어야 한다.

## 1. 현재 구현 현황 (실측 기준)

| 계층 | 위치 | 상태 |
|---|---|---|
| 엔진 | `lib/tax-engine/gift-deemed/merger.ts:9-75` | §28③1 주식교부 + §28③2 주식외 재산 |
| 타입 | `lib/tax-engine/gift-deemed/types.ts:129-141` (`MergerInput`) | caseType·8필드 |
| Zod | `lib/validators/gift-deemed-input.ts:81-91` (`mergerSchema`) | 9필드 |
| API | `app/api/calc/gift-deemed/route.ts` → `calcDeemedGift` | 라우터 dispatch |
| 변환 | `lib/calc/gift-deemed-api.ts:84-102` (`buildDeemedGiftInput`) | stock/non_stock 분기 |
| 폼 | `components/calc/deemed-gift/shared.tsx` (`DeemedFormState` mrg* 8필드) | INITIAL_DEEMED 포함 |
| UI | `components/calc/deemed-gift/capital-forms.tsx:15-48` (`MergerFields`) | RadioCardGroup §28③1·2 |
| 결과 | `components/calc/results/DeemedGiftResultView.tsx` | breakdown 렌더 |
| 앵커 | `__tests__/tax-engine/gift-deemed/capital-transaction-anchor.test.ts`(MRG-1=2.5억) · `capital-subcase-anchor.test.ts`(MRG-NS=4억) | 통과 |

### 현재 엔진 산식 (법령 검증 완료 — KoreanLaw 상증령 §28 본문 대조)

- **§28③1 주식교부**: `이익 = (㉮ − ㉯) × 과대평가법인 대주주 교부주식수`
  - ㉮ = 합병후 1주당 평가가액(`mergedSharePrice`, **직접입력**)
  - ㉯ = 과대평가법인 1주당 평가가액 × (합병전 주식수 ÷ 교부주식수) — `safeMultiplyThenDivide`
  - → **법령 §28③1 가·나목과 일치** ✅
- **§28③2 주식외 재산**: `이익 = (액면가 − 평가가액) × 대주주 주식수`, 액면 미달 시 대가 적용 → **§28③2 일치** ✅
- **§28④ 기준금액**: 주식교부 `Min(㉮×주식수×30%, 3억)` / 주식외 `3억` → **§28④1·2 일치** ✅

> 「과대평가된 합병당사법인」 = 합병비율 산정상 상대적 과대평가 → **이익을 얻는 측 주주의 법인**.
> (사례1 B법인 30,000, 사례2 B법인 10,000. 변수명 `overvaluedSharePrice`가 이 베이스값.)

## 2. Pre-Do 실측 (현행 동작 확정 — 추정 아님)

throwaway probe 3건 전부 통과(`feedback_pre_anchor_verification` 준수):

| probe | 입력 | 결과 | 판정 |
|---|---|---|---|
| 사례1 병 | ㉮36,666·㉯베이스30,000·비율1·70,000주 | **466,620,000** (applied) | ✅ 현행 정확 |
| 사례1 정 | 동일·30,000주 | **0** (199,980,000 < 3억 제외) | ✅ 현행 정확 |
| 사례2 갑(차감전) | ㉮40,000·㉯베이스10,000·preShares 200,000·exchanged 100,000·70,000주 | **1,400,000,000** | ✅ 차감전까지 정확 |

**확정 사실**: 현행 엔진은 (1) 합병후/합병전 1주평가를 **사용자가 손계산해 직접입력**하고,
(2) **대주주 1명**의 이익을 구하는 시나리오에서 사례1·2를 정확히 재현한다.
막히는 지점 = §3의 G1~G6.

## 3. 갭 분석 (이미지 ↔ 현행)

| ID | 갭 | 근거 이미지 | 법령 | 현행 | 심각도 |
|---|---|---|---|---|---|
| **G0** | **과세요건 전제 판정** — ① 특수관계 법인간 합병(자본시장법 §165의4 상장합병 제외 단서) ② 대주주 판정(지분 1% 또는 액면 3억) | 1 과세요건①·납세의무자 | §28①·② | 사용자 전제(판정·안내 없음) | 중 |
| **G1** | **합병후 1주당 평가가액 산정 보조** — 상장 `Min(합병등기일후 2월 종가평균, 단순평균액)` / 비상장 `단순평균액`. 단순평균액 = (과대평가법인 합병전 주식총액 + 과소평가법인 합병전 주식총액) ÷ **합병후 존속법인 주식수**(합병비율 반영 — preShares 합과 다름) | 2·3·4 / 사례1①·사례2② | §28⑤ | `mergedSharePrice` 직접입력 | 중 |
| **G2** | **합병전 1주당 평가가액 산정 보조** — 상장 `Min(평가기준일전 2월 종가평균, 보충적평가)` / 비상장 `시가 또는 보충적평가`. §28⑥ 단서(2016.2.5~) 나목차액 < 가목차액이면 나목 적용 | 2·5 | §28⑥ | `overvaluedSharePrice` 직접입력 | 중 |
| **G3** | **분할합병** 분할사업부문 평가 — §63①1나 준용(2016.2.5~), 2016.2.4 이전 순자산비율 안분 | 6·7 | §28⑦ · 상증칙 §10의2 | 미구현 | 하 |
| **G4** | **동일인 자기증여 차감** — 합병당사 양쪽 법인 동시 주주(동일인)의 이익 중 자기로부터 받은 부분 차감 | 9⑤·10 | 상증기준 38-28-2 | 미구현(단일 majorShares) | **상** |
| **G5** | **증여자별 안분 / 수증자별 매트릭스** — 각 수증자가 상대법인 주주들로부터 각각 증여받은 것으로 봄(지분율 안분) | 8·9·10 "증여세 과세방법" | §38① | 미구현(총액만) | **상** |
| **G6** | **다수 대주주 동시 산출** — 한 합병에서 과세대상 대주주 N명 동시(사례1 병·정, 사례2 갑·병) + 각 3억 기준 개별판정 | 8·9 | §28② 대주주 판정 | 미구현(1회 1명) | 중 |

### 평가기준일 부속 정보 (G1·G2 구현 시 표시·검증용, 자동산정 아님)

- 합병후(상장 단순평균액 적용 시): 대차대조표 공시일 / 합병 증권신고서 제출일 중 빠른날 — `재재산 46014-68, 2002.3.28`
- 합병후(상장 종가평균): 합병등기일
- 합병전(상장 종가평균): 평가기준일전 2월. 합병전(보충적): 대차대조표 공시일
- 개정연혁: 2001.1.1~ 빠른날 기준(이전 합병등기일) / §28⑤ 상장 Min 도입 2001.1.1~ / §28⑥ 단서 2016.2.5~ / 합병·소멸법인 보유 상장주식 평가기준일 시세 2017.1.1~(상증법 §63①1가 단서)

## 4. 보완 범위 — **옵션 C 확정** (2026-06-25 사용자 결정)

```
[옵션 A] 평가 보조계산만 (G1·G2)
[옵션 B] A + 주주 매트릭스 (G4·G5·G6)
[옵션 C] B + 분할합병 (G3)  ← ★ 채택: G1~G6 전부 + 분할합병
```

→ Phase A(G1·G2) → Phase B(G4·G5·G6) → Phase C(G3) 순차. **Phase B는 자기증여 산식 동결 선결**(§7).

- **G4·G5·G6은 묶음**: 자기증여 차감은 "증여자·수증자 매트릭스"가 전제. 셋은 분리 불가.
- **설계 충돌 주의**: 현 도구는 "개별 수증자 1명 증여이익 → 증여세 마법사 prefill"(단발 주입,
  `project_gift_deemed_transfer_plan`의 단일수증자 집계모델). 옵션 B는 이 모델을 다주주
  매트릭스로 확장 → `bargain-transfer`/`debt-forgiveness` 등 타 의제와 다른 UX가 됨.

## 5. Phase별 구현 설계

> **파일 분할(800줄 정책)**: `merger.ts`(현 76줄, 코어 산식 유지) + 신규 `merger-valuation.ts`(G1·G2 §28⑤⑥⑦ 평가) + `merger-matrix.ts`(G4·G5·G6 주주 매트릭스). router는 `calcMergerGift` 단일 진입 유지.
>
> **입력모델 단일 소스화(옵션 C 통합 설계 — dual-truth 방지)**: G1 단순평균액 분자와 G2 합병전 1주평가, G4·G5 매트릭스가 **동일한 "법인별 1주평가·주식수"를 공유**한다. 따라서 별도 총액 필드(`overCompanyPreTotal` 등)를 두지 않고 **법인별 `{1주평가, 합병전주식수, 교부주식수}`를 단일 입력원**으로 받아 총액·㉯·안분을 전부 도출한다.

### Phase A — 평가가액 보조계산 (G0·G1·G2) · 옵션 A 이상

**엔진** (`merger-valuation.ts`)
- `MergerInput`에 평가모드 필드 추가(전부 optional, **기본 `direct` — 기존 MRG-1 직접입력 회귀 보존**):
  - `mergedPriceMode?: "direct" | "auto"` (기본 `"direct"`)
  - auto 시 단순평균액 입력: 과대평가법인 `{overvaluedSharePrice, preMergerShares}` + 과소평가법인 `{underSharePrice, underPreShares}` + `postMergerTotalShares`(합병후 존속법인 주식수, **합병비율 반영 — 별도 입력 필수, preShares 합으로 추정 금지**)
  - 단순평균액 = `(overvaluedSharePrice×preMergerShares + underSharePrice×underPreShares) ÷ postMergerTotalShares`
  - 상장 Min: `listedPostAvgPrice?`(합병등기일후 2월 종가평균) 입력 시 `Min(종가평균, 단순평균액)`
- **헬퍼**: `computeWeightedPerShare`는 분모가 `preShares+newShares` 고정이라 **합병 단순평균액(분모=합병후 주식수)에 부적합**. BigInt 분자 합산 패턴만 차용한 신규 `computeMergerSimpleAvg(overPrice, overShares, underPrice, underShares, postShares)`를 `capital-helpers.ts`에 추가(single-source — 향후 매트릭스도 동일 헬퍼).
- §28⑥ 합병전 1주평가(나목 베이스) = §60·§63 평가(비상장 보충적). **§28⑥ 단서(상장 나목차액<가목차액→나목)는 Phase A 제외 → C6 후속**(상장 합병증여 극희소·두 평가방식 차액비교라 advanced UX. 엔진설계 C6 참조).
- **G0 안내(판정 echo)**: `isRelatedCompany?`·대주주 판정(`isSmallShareholder` 역 — 지분 1% 또는 액면 3억 이상)은 **엔진 차단 아닌 echo + UI hint**(과세요건은 사용자 전제, 법 근거 없는 불리적용 금지 `feedback_no_unfavorable_application_without_legal_basis`).

**3중 패턴(`mirror-pattern`)**: `mergedPriceMode` 기본 `"direct"`를 INITIAL_DEEMED(②)=normalize(③)=UI value fallback(⑤)=API 변환(④)=validate(⑧) **5곳 일치**. auto 분기 필드는 `mergedPriceMode==="auto"`일 때만 필수(⑧), direct면 무시(침묵 strip 방지).

**14지점**: ①폼 `DeemedFormState`(mrg* 추가) → ②INITIAL_DEEMED(`mrgMergedPriceMode:"direct"`) → ③normalize → ④`buildDeemedGiftInput` → ⑤`MergerFields` ToggleCard "단순평균액 자동계산" → ⑥사이드바 N/A(deemed 단발) → ⑦breakdown 단계 → ⑧validate(auto 시 필드 필수) → ⑫`mergerSchema` optional 추가 → ⑬⑭ deemed route 단일 dispatch(기존 경로).

**legal-codes**: `GIFT.MERGER_VALUATION = "상증령 §28⑤⑥"`·`GIFT.MERGER_SPLIT = "상증령 §28⑦"` 추가(breakdown lawRef 세분).

**anchor**: 사례1① `(200,000×40,000 + 100,000×30,000)/300,000 = 36,666` / 사례2② `(200,000×50,000 + 200,000×10,000)/300,000 = 40,000`

### Phase B — 주주 매트릭스 + 자기증여 차감 (G4·G5·G6) · 옵션 B 이상

> **자기증여 산식 근거(자료 확보 완료)**: 국세청 **재산세과-799(2009.04.24)** = [189486] "동일인이
> 합병당사법인의 주주인 경우 증여이익 산정방법" + 재산세과-70(2009.08.31). 원리: **"동일인이 합병당사
> 법인 주식 동시 소유 시 본인으로부터의 증여분 차감"**. 예규 본문 산식은 공개 자료에 미수록 →
> **교재 사례2를 1:1 동결**(`feedback_pdf_table_row_one_to_one_mapping`). **일반성은 Do 시 KoreanLaw
> 예규 본문 재확인**(`feedback_korean_law_citation_verify` — 사례2 1건 기반 일반화 주의).
>
> **동결 산식(사례2 전수 검증)**:
> - 차감전이익_k = (㉮ − ㉯) × 수증자 k 교부주식수
> - `self_k = 차감전_k × (동일인 k의 과소평가[증여자측]법인 지분 ÷ 과대평가[수증자측]법인 지분)` (동일인 아니면 0)
> - 순이익_k = 차감전_k − self_k
> - 증여자별 안분: `수증자 k ← 증여자 j = 순이익_k × s_j ÷ (Σs − s_k)` (j≠k, s=증여자측 지분, 동일인 k는 자기 제외)
> - 각 k §28④ 개별판정: 순이익_k ≥ Min(㉮×교부주식수_k×30%, 3억)

- 입력 모델 확장: 합병당사 양 법인 주주 구성 배열(`merger-matrix.ts`)
  - **계층(Phase A와 단일소스 일관)**: 주주배열은 Phase A 법인단위 입력의 **하위 분해**다.
    `Σ(과대평가법인 주주 주식수) = preMergerShares`, `Σ(주주 주식수)×1주평가 = 법인총액`(단순평균액 분자항).
    → 법인 1주평가·주식수는 주주배열에서 **도출**(중복입력 금지, dual-truth 방지). Phase B 시 Phase A 스칼라 입력은 주주배열 집계로 대체.
  - 동일인 매칭: 양 법인 주주를 `id`로 매칭 → 신규 `isSameMergerShareholder` 1곳 정의 후 재사용(`single-source-engine-helper`)
- 산출: 수증자별 증여이익(자기증여 차감 후) + 증여자별 안분 → `DeemedGiftResult`에 **Record 기반** 매트릭스(`feedback_engine_result_map_json_loss` — Map 금지)
- UI: 주주 테이블+모달 패턴(`project_comprehensive_property_table_modal` 류). 동일인 체크박스
- **prefill 연계 재설계**: 수증자 N명 → 각각 증여세 계산 분기(현 단발 주입 확장)
- **anchor(사례2 전수 — 자기일관성)**:
  - `Σ(증여자별 안분) = 각 수증자 순이익` / 갑 순 400,000,000 / 병 순 600,000,000
  - 갑←을 240,000,000·갑←소액 160,000,000 / 병←갑 300,000,000·병←을 180,000,000·병←소액 120,000,000

### Phase C — 분할합병 (G3) · 옵션 C

- §28⑦: 분할사업부문 합병전 주식가액 = §63①1나 보충적평가 준용
- 2016.2.4 이전: `분할법인 분할직전 주식가액 × (분할사업부문 순자산 ÷ 분할법인 순자산)`
- 증여일 기준 분기(`feedback_reduction_sunset_is_acquisition_window` 유의 — 개정 시행일 경계)

## 6. 검증 전략

- **Pre-Do anchor 우선**(`pre-do-anchor-verification`): Phase A는 사례1·2 단순평균액 anchor를
  Do 진입 전 작성·실패확보 → 디자인 환류.
- **회귀**: 기존 MRG-1(2.5억)·MRG-NS(4억) anchor 불변 보장(직접입력 하위호환).
- **PDF 예시 상수화**(`feedback_pdf_example_test_anchoring`): 사례1·2 전 수치 원단위 `toBe()`.
- **법령 인용 링크**: 결과 breakdown `lawRef`는 §28 각 항 정확 인용(이미 §38 GIFT.MERGER, 세분 시 §28 항·호 추가).
- E2E(`feedback_browser_verify_with_playwright`): `e2e/gift-deemed-*.spec.ts`에 합병 보조계산 케이스 추가.

## 7. 결정 필요사항 (사용자)

- ~~보완 범위~~ → **옵션 C 확정**(§4). Phase A→B→C 순차, A는 즉시 착수 가능.
1. **자기증여 차감 산식 근거**(Phase B 선결): [189486] 본문(국세청 페이지) 또는 교재 해설 전문 제공 가능 여부.
   미제공 시 Phase B는 "산식 동결 대기"로 보류, Phase A·C 선행.
2. **G0 과세요건 판정 수준**: 특수관계·대주주 판정을 (a) 엔진 차단 / (b) echo+UI 안내만(권장 — 사용자 전제)
   중 택. 권장 (b) — 합병 사실관계는 사용자가 가장 정확, 법 근거 없는 불리적용 금지.
3. **G1·G2 평가모드 기본값**: `direct`(직접입력) 유지 + `auto`(단순평균액 자동) 토글 — **기본 direct**(회귀 보존).

## 8. 작업 환경

- 워크트리 `.claude/worktrees/gift-merger` (브랜치 `feat/gift-merger-profit-38`, origin/master 분기)
- dev 3003 / E2E 3103 (`E2E_PORT=3103`)
- 관련 메모리: `project_gift_deemed_transfer_plan`(Phase 2 합병 구현 이력) · `feedback_pre_anchor_verification` · `feedback_pdf_table_row_one_to_one_mapping` · `single-source-engine-helper` · `feedback_korean_law_citation_verify`
