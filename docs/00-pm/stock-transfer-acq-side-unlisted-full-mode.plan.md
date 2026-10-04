# 취득 당시 기준시가 — 비상장 「평가액 계산」 모드 개방 계획서

> 작성일: 2026-10-04
> **상태**: Do 구현 완료(§11) — 자가검토 1회차 완료(§10, verdict 참조) · 사용자 결정 Q-1~Q-3 **확정**(2026-10-04: Q-1 A안 공유 · Q-2 halt_acquisition 포함 · Q-3 문구 정정 포함)
> 워크트리: `Property-related-Taxes-stk` · 브랜치 `feat/stock-transfer-work` (기준 `23a146b29`, master `d9a9dbb5b`보다 1 PR 뒤 — §7 참조)
> 근거 조사: 엔진 시니어·UI 시니어 병렬 실측(2026-10-04) + 본 계획서 작성 시 법령 원문·핵심 file:line 재대조

## 1. 목표 / 비목표

### 목표
주식양도세 Step2에서 취득가액을 **매매사례가액**(`acquisitionMode="sale_case"`)으로 고른 비상장·기타자산의
「취득 당시 기준시가 — 개산공제 기준」 블록에서, 사용자가 다음 둘 중 하나를 고를 수 있게 한다.

| 모드 | 입력 | 현황 |
|---|---|---|
| 계산결과 입력 (simple) | 1주당 순손익가치·순자산가치 직접 입력 | ✅ 현행 (유일한 선택지) |
| 평가액 계산 (full) | 취득일 직전 사업연도 순손익 계산서 + 순자산 계산서 행 입력 → 1주당 값 자동 산출 | ❌ 이 화면에서는 막혀 있음 |

**기존 모듈 재사용이 전제다** — 신규 산식·신규 엔진 필드 0.

### 비목표
- 엔진 산식 변경 (2:3 반전·80% 하한·순자산 단독 판정은 그대로 — §3.4)
- 상속·증여 비상장 평가 엔진(`unlisted-orchestrator.ts`) 연결 — 법령상 부적합 (§3.1)
- 결과뷰에 결산서 산출 내역 표 신설 (현재 환산 full도 배지만 표시 — §3.6)
- 「행-수준 계산 적용」 배지를 `acquisitionMode` 기준으로 정밀화 (잠복 결함이지만 별건 — §10.4)

## 2. 재사용 대상 — 이미 있는 것

환산(`estimated`) 모드에는 이 기능이 **이미 양도·취득 두 열로 구현돼 있다.** 매매사례 화면만 막혀 있을 뿐이다.

| 구성요소 | 위치 | 역할 |
|---|---|---|
| 모드 토글 | `components/calc/stock-transfer/EstimatedUnlistedBlock.tsx:276-310` | `unlistedValuationMode: "simple" \| "full"` 라디오 (「계산결과 입력 / 평가액 계산」) |
| 순손익 계산서 | `EstimatedUnlistedNetIncomeStatement.tsx` (83줄) | 24행 × 열(EUTransfer·EUAcq). `acqFaceValueOnly`면 EUAcq 숨김 패턴(:36) 보유 |
| 순자산 계산서 | `EstimatedUnlistedNetAssetStatement.tsx` (64줄) | 19행 × 열. 같은 숨김 패턴 |
| 표 본체 | `PostListingNetIncomeStatement.tsx`·`PostListingNetAssetStatement.tsx`·`statement-table/` | `cols` 목록을 받는 행 기반 표 — 열 위치 가정 없음(UI 시니어 grep) |
| 어댑터 | `lib/tax-engine/stock-transfer/unlisted-flat-adapter.ts:110-124` `adaptUnlistedFlatToApiBody` | 행 입력 → 1주당 4값(transferNi/Na·acqNi/Na). 순자산 단독이면 NI skip |
| 산식 | `stock-valuation-post-listing.ts` `calcNetIncomePerShare`·`calcNetAssetPerShare` | 단일 사업연도 · 환원율 기본 10% |
| 취득기준시가 미리보기 | `EstimatedUnlistedBlock.tsx:163-199` | **이미** `mode==="full"`이면 `fullReduced.acqNi/acqNa`를 쓴다 — 수정 불필요 |

현재 매매사례 화면이 simple만 되는 이유 3곳:
1. ⑤ `EstimatedUnlistedBlock.tsx:94` — `acquisitionSideOnly`이면 `mode="simple"` 강제, `:276` 토글 숨김
2. ④ `lib/calc/stock-transfer-tax-api.ts:462-469` — sale_case면 full 어댑터 결과를 **일부러 지우고** simple 값만 다시 싣는다(주석 「이 모드 화면은 simple뿐」)
3. ⑧ `lib/calc/stock-transfer-tax-validate-step2.ts:205-222` `validateAcquisitionSideUnlistedFields` — simple 키만 검사

## 3. 현황 분석 (실측)

### 3.1 법령 — 왜 상속·증여 평가 엔진이 아니라 주식양도세 full 모드인가

소득세법 시행령(MST 290841, 시행 2026-10-01) **§165④1호 가목**:
> 양도일 또는 취득일이 속하는 사업연도의 **직전 사업연도의** 1주당 순손익액 ÷ … 이자율

같은 호 나목: 「…직전 사업연도 종료일 현재 해당 법인의 장부가액(토지의 경우에는 법 제99조제1항제1호가목에 따른 기준시가) ÷ 발행주식총수」.

상속세 및 증여세법 시행령(MST 290845) **§54①**:
> 1주당 가액 ＝ 1주당 **최근 3년간의** 순손익액의 가중평균액 ÷ …이자율

⇒ 양도세 기준시가의 순손익가치는 **직전 1사업연도**, 상증세는 **최근 3년 가중평균**이다.
- `lib/tax-engine/property-valuation/unlisted-orchestrator.ts`는 3년 가중(`calcWeightedAvg3y`, 엔진 시니어 인용 :165)과
  상증 전용 로직이 섞여 있어 **재사용 후보에서 제외**한다. 홈 메뉴의 독립 주식 평가 도구(`/tools/stock-valuation`)도 같은 엔진이라 같은 이유로 제외.
- 주식양도세 full 모드는 단일 연도 산식이고 환산 모드의 취득 열(EUAcq)에서 **이미 같은 양**(취득일 직전 사업연도 평가)을 산출한다 → 그대로 재사용.

### 3.2 엔진 — 변경 0 (엔진 시니어 실측)

- sale_case 취득기준시가: `stock-acquisition-basis.ts:351-355` → `calcAcquisitionStdPerShareSupplementary(input)`가
  `acquisitionYearNetIncomePerShare`·`acquisitionYearNetAssetPerShare` **두 필드만** 읽는다(`stock-valuation-unlisted-single-side.ts:127-135`).
- `transferYearNet*`는 환산 본체·액면가 경로에서만 읽힌다 — sale_case는 읽지 않는다.
- ⑫ Zod: 4필드가 이미 있다(`lib/api/stock-transfer-tax-schema.ts:339-344`). sale_case 필수 게이트(`stock-transfer-tax-refines.ts:507-519`)는 `!== undefined`만 본다.
- ⑭ Route 매핑: `lib/api/stock-transfer-engine-input.ts:112-117` 변경 없음.

⇒ full 어댑터가 산출한 1주당 값을 **같은 두 필드**로 보내면 엔진·⑫·⑭는 손대지 않는다.

### 3.3 형제 경로 — 취득일 거래정지(halt_acquisition)

`app/calc/stock-transfer-tax/steps/Step2.tsx:565-574` 상장(코스닥·코넥스)주식 **취득일 거래정지**(소령 §165③→§165④)도
같은 `acquisitionSideOnly` 블록을 쓴다. 블록만 고치면 화면에 토글이 같이 열린다. 그러나 ④ full 게이트
(`stock-transfer-tax-api.ts:441-443`)가 `usesUnlistedSupplementaryValuation(marketType) || halt_transfer`라
상장+halt_acquisition은 **게이트 밖** → ④를 같이 넓히지 않으면 **화면엔 결산서가 있는데 body엔 안 실리는 침묵 결함**이 된다.
⇒ 범위에서 빼려면 블록에서 halt_acquisition일 때 토글을 다시 숨겨야 한다. (Q-2)

### 3.4 판정 규칙 동일성

full 어댑터는 1주당 NI/NA **값만** 만든다. 2:3 반전(`isReversalCorpForm`)·80% 하한·연혁(`calcSection165_4Value`)·
순자산 단독(`shouldSkipNetIncome` ↔ 엔진 `resolveNetAssetOnlyBasis`)은 모두 그 뒤 엔진·미리보기의 정본 함수가 적용한다
⇒ full 경로가 판정 규칙을 바꾸지 않는다(엔진 시니어 실측).

### 3.5 이월과세 화면과의 동시 렌더 — 없음 (본 계획서 작성 시 확인)

`CarryoverDonorConversionSection`(`transferSideOnly` 블록)은 `Step2.tsx:435-440`에서 `acquisitionMode === "actual"`일 때만 렌더된다
→ sale_case 화면과 한 화면에 같이 뜨지 않는다. 공유 mode 필드가 한 화면에서 둘로 갈리는 일은 없다.

### 3.6 사이드바·결과뷰

- ⑥ 사이드바(`StockSidebar.tsx`)는 비상장 평가값을 읽지 않는다(UI 시니어 grep 0건) → 변경 없음.
- ⑦ 결과뷰는 full일 때 「행-수준 계산 적용 (상증령 §54·§55)」 배지만 표시(`StockTransferTaxResultView.tsx:427-431`, mode는 `Step4.tsx:68`이 넘긴다) — 결산서 내역 표 없음 → 변경 없음(문구는 Q-3).

## 4. 설계

### 4.1 상태 — 기존 `unlistedValuationMode`·EUAcq 필드 **공유** (Q-1 확정: A안)

「취득 당시 기준시가」는 환산·매매사례·취득일 거래정지 모두 **같은 양**(§165④, 취득일 직전 사업연도)이다.
같은 결산서(EUAcq 열)를 한 번 입력해 어느 모드에서나 쓰는 것이 의미상 맞고, ①②③ 변경이 0이다.

| | A안 공유 (권장) | B안 별도 필드 `acqStdValuationMode` |
|---|---|---|
| ①②③ 폼 타입·initial·normalize | 변경 0 | 신규 필드 + 정규화 |
| 환산 full → 매매사례 진입 | **처음부터 full로 열림** + EUAcq 입력 그대로 보임 | simple로 열림 |
| 저장 이력 복원 | 종전 「stale full」이던 sale_case 이력이 EUAcq로 계산됨 — EUAcq가 비어 있으면 ⑧이 막고, 채워져 있으면 그 값이 쓰인다(화면 토글에 보임) | 안전(default simple) |
| EUAcq 데이터 이중성 | 없음 | 남음 (EUAcq는 어차피 공유) |

### 4.2 「취득측 full 적용」 단일 술어 (신규 1개)

`lib/calc/`에 술어 하나를 두고 ④·⑤·⑧이 같이 쓴다 — 손술어 3벌 금지
(memory `feedback_leaf_unification_leaves_one_handwritten_predicate`).

```
acquisitionSideOnly 경로 = sale_case && !상장
                        || halt_acquisition && haltAllowed && !usesUnlistedSupplementaryValuation(marketType) && acquisitionMode==="estimated"
취득측 full 적용     = 위 경로 && (unlistedValuationMode || "simple") === "full"
```
- halt_acquisition 쪽 `!usesUnlistedSupplementaryValuation` 조건을 빼면, 비상장인데 stale halt_acquisition이 남은 경우 양도 열까지 막는다(엔진 시니어).
- `haltAllowed`는 기존 `isTradingHaltMarketScopeViolation`(코스피 차단)과 같은 술어를 쓴다.

### 4.3 ⑤ UI

**`EstimatedUnlistedBlock.tsx`**
- `:94` mode 강제를 `simpleOnly || transferSideOnly`로 좁힌다 — `acquisitionSideOnly`는 `form.unlistedValuationMode || "simple"`을 따른다(3중 패턴 fallback 일치).
- `:276` 게이트를 둘로 나눈다.
  - 입력 방식 FieldCard(`:278-310`): `!simpleOnly && !transferSideOnly` → 취득측에서도 노출.
  - 사례 49 액면가 ToggleCard(`:312-333`): 종전 조건 유지(취득측에서 숨김). §99①4 후단 액면가는 환산 전용이고 ④ 게이트(`api.ts:421-424`)도 `acquisitionMode==="estimated"`를 요구한다.
- `:370-375` full 결산서 렌더 시 `acquisitionSideOnly`를 두 결산서 컴포넌트로 내려보낸다.
- 양도측 미리보기(`:407`)·§81④ 월할(`:490`)은 이미 `!acquisitionSideOnly`라 그대로 숨는다.

**결산서 두 컴포넌트** (`EstimatedUnlistedNetIncomeStatement.tsx:33-40` · `EstimatedUnlistedNetAssetStatement.tsx:29-36`)
- optional prop `acquisitionSideOnly?: boolean` 추가 → 열 목록을 `[EUAcq]`만으로.
- 🔴 `hideAcqColumn`은 `acquisitionSideOnly`이면 **강제 false**. 환산에서 사례 49를 켜 둔 stale `acqFaceValueOnly===true`가
  남으면 취득 열이 숨는데 ⑧은 EUAcq 주식수를 요구하는 **막다른 길**이 된다(블록 `:162` 주석이 같은 stale을 이미 다룬다).
- 제목 「양도/취득연도」 → 취득측이면 「취득연도」(NI `:76`, NA `:40` 부근).

### 4.4 ④ API 변환 (`lib/calc/stock-transfer-tax-api.ts`)

현 순서: 거래정지 플래그(`:414-416`) → 사례49(`:421-435`) → **full 게이트(`:441-452`)** → **sale_case 재싣기(`:462-469`)** → 증여자 분모(`:472`).
순서를 유지한 채:
1. full 게이트에 「취득측 full 적용」 술어를 OR로 추가.
2. 취득측 경로면 `transferYear*`를 싣지 않고 `acquisitionYear*`만 싣는다. (엔진은 sale_case에서 transferYear*를 읽지 않아 계산엔 무해하지만, stale 오염 차단·페이로드 위생. 현재 코드는 stale full에서 transferYear*가 새고 있다.)
3. sale_case 재싣기 블록은 「취득측 full 적용」이면 delete·재싣기를 **건너뛴다**. simple이면 종전대로 simple 값을 싣는다. full 블록 «뒤» 배치 주석은 유지.
   - 🔴 **초판 판정 정정(자가검토 P-A)**: 초판은 이 블록을 「full 결과를 지우는 방어」로만 묘사했다. **불완전했다** —
     sale_case 기본 분기(`api.ts:361-369`)는 `acquisitionYear*`를 싣지 않으므로 **이 블록이 sale_case simple 값의 유일한 공급원**이다.
     블록을 통째로 끄면 7건이 실패한다(SC-1~5·SC-9·AP-MS-2). ⇒ 블록 삭제·조건 확대 금지, 「취득측 full 적용」일 때만 skip.
4. halt_acquisition은 환산 기본 분기(`api.ts:339-350`)가 simple `transferYear*`·`acquisitionYear*`를 **이미** 싣는다(현행). full 게이트가 `acquisitionYear*`를 덮어쓰고,
   어댑터의 양도 열 값은 싣지 않는다. 기본 분기가 실은 simple `transferYear*`는 현행 그대로 둔다(엔진 미사용 · 범위 밖).

### 4.5 ⑧ 검증 (`lib/calc/stock-transfer-tax-validate-step2.ts`)

`validateAcquisitionSideUnlistedFields`(`:205`, 호출부 halt_acquisition `:443` · sale_case `:664`)에 full 분기:
- full이면 simple 키 검사를 건너뛴다(화면에 simple 칸이 없으므로 — 막다른 길 방지).
- 대신 `naShareCountEUAcq > 0` 필수, 순자산 단독(`shouldSkipNetIncome`)이 아니면 `niShareCountEUAcq > 0` 필수. **양도 열 주식수는 요구하지 않는다.**
- 환산 full 검증(`:117-130`)의 EUAcq 주식수 규칙을 헬퍼로 뽑아 공유. 이때 `acqFaceValueOnly:false`를 강제(§4.3과 같은 stale 이유).
- **메시지가 위치를 말해야 한다** (V-2 해소): 주식 마법사는 오류 `field`로 입력칸을 찾아가지 않고 **첫 오류 메시지만** 보여 준다
  (`StockTransferTaxCalculator.tsx:59-68` `firstInvalidStep`). 환산 full의 기존 문구 「취득연도 NI 사업연도말 발행주식수 필수 (full 모드)」는
  내부 약어라 취득측에는 쓰지 않는다 — 헬퍼가 문구를 인자로 받아 취득측은 「취득연도 순손익 계산서의 사업연도말 발행주식수를 입력하세요 (매매사례가액 개산공제 기준시가 — 소령 §163⑥4·§165④)」처럼
  기존 `basis` 인자를 붙인다. 환산 full의 기존 문구는 바꾸지 않는다(범위 밖).

### 4.6 파일 크기 (800 트리거 / 700 목표)

| 파일 | 현재 | 예상 |
|---|---|---|
| `lib/calc/stock-transfer-tax-validate-step2.ts` | 745 | ~770 — **≥750 위험구간 진입** |
| `lib/calc/stock-transfer-tax-api.ts` | 710 | ~730 |
| `EstimatedUnlistedBlock.tsx` | 537 | ~545 |
| `app/calc/stock-transfer-tax/steps/Step2.tsx` | 675 | 변경 없음 |

⇒ 기회주의적 분리 정책에 따라 validate-step2의 비상장 평가 검증군(`:72-222` — 메시지 표·`validateUnlistedSimpleFields`(:84)·`validateUnlistedValuationFields`(:103)·`validateTransferSupplementaryPositive`(:167)·`validateAcquisitionSideUnlistedFields`(:205))을
별도 파일(예: `stock-transfer-tax-validate-unlisted.ts`)로 분리하는 Phase를 둔다. **분리 커밋은 동작 변경 0** — 기능 커밋과 섞지 않는다.
공용 헬퍼 `isEmpty`·`parseF`·`parseI`(:48-71)는 본체에도 쓰이므로 복제하지 말고 한쪽에서 export해 공유한다. 분리 직후 위 P-A·P-C 실패 목록이 **같은 테스트**로 재현되는지 확인한다(분리가 동작을 안 바꿨다는 증거).

## 5. 작업 범위 — Phase별

```
0. 선행 정리 → verify: 1번(거래상대 삭제) 별도 커밋, origin/master(d9a9dbb5b) 위로 rebase 후 주식 테스트 통과
1. Pre-Do anchor (실패 확인) → verify: 아래 A-1·A-2가 현행 코드에서 RED
2. validate-step2 비상장 검증군 분리 (동작 변경 0) → verify: tsc 0 + 주식 테스트 전건 통과 + §10.2 P-C 실패 목록이 분리 후에도 같은 3건으로 재현
3. 단일 술어 + ④ + ⑧ → verify: A-1·A-2 GREEN, SC-9 반전본 GREEN
4. ⑤ 블록·결산서 → verify: 컴포넌트 테스트 GREEN
5. 문구 정정(Q-3) → verify: 역방향 grep으로 문구 단언 테스트 동기화
6. 뮤테이션 probe → verify: 게이트·skip 분기를 하나씩 되돌렸을 때 신규 anchor가 KILLED
7. E2E 1건 + 브라우저 확인 → verify: Network body에 EUAcq 산출 acquisitionYear* 실림
```

### Pre-Do anchor (Phase 1 — 디자인 환류용)
- **A-1** 전 계층(`runFullStack`): sale_case + 비상장 + full + EUAcq 행 입력 → `estimatedDeduction` = 행에서 산출한 1주당 기준시가 × 주식수 × 1% (원 단위 지정값). 현행은 SC-9가 지키는 대로 simple 값이 쓰여 RED여야 한다. ⚠️ EUAcq 행 산출 1주당 값을 픽스처 simple 값과 **다르게** 잡는다 — 같으면 현행에서도 GREEN이 되어 아무것도 증명하지 못한다(memory `feedback_algebraic_identity_makes_wrong_path_look_right`).
- **A-2** ⑧: sale_case + full + simple 칸 공백 + EUAcq 주식수 입력 → 취득연도 NI/NA 오류 **없음**. 현행은 막다른 길이라 RED여야 한다.

### 테스트 변경 목록
**반전 1건** — `__tests__/calc/stock-sale-case-deduction.anchor.test.ts` **SC-9**(`:185-196`)
「full로 둬도 sale_case는 simple 값으로 기준시가를 만든다」 → 새 요구사항과 정면 충돌. 헤더 주석(`:9-24`)도 갱신.
SC-9가 지키던 「화면에 없는 값이 body를 덮지 않는다」 계열 방어가 사라지므로 아래로 **대체**한다
(memory `feedback_shared_assertion_reversal_erases_sibling_net`):

| ID | 단언 |
|---|---|
| SC-9a | full + EUAcq 행 → 행에서 나온 1주당 값으로 개산공제 (A-1 승격) |
| SC-9b | sale_case + full에서 body에 `transferYearNet*` 미포함 (sale_case 기본 분기는 양도연도 값을 싣지 않는다) · halt_acquisition + full은 EUTransfer 행을 채워도 body의 `transferYearNet*`가 simple 값 그대로(어댑터 값이 새지 않음) |
| SC-9c | full로 입력하다 simple로 복귀 → simple 값이 정본, 숨은 EUAcq 행 무시 |
| SC-9d | stale `acqFaceValueOnly=true` + full → EUAcq 열 노출 · ⑧ 통과 |
| SC-9e | 순자산 단독(사유 선택·라목) + full → NI 미송신, 80% 하한 미적용 |
| SC-9f | 결손 NI + full → 80% 하한이 취득측에서 simple과 같은 값으로 발동 |
| (유지) SC-8 | 상장 + sale_case 차단 — 긍정 anchor의 부정 짝 |

**착수 전 안전망 실측(§10.2)**: 매매사례 simple 경로는 SC-1~5·AP-MS-2가, 취득측 simple 검증은 SC-7·`halt-acquisition-c1` C1-VALIDATE-1·`stock-165-8-1-ra-net-asset-only` 취득일 거래정지 케이스가 지킨다 → **전부 그대로 통과해야 한다.** 블록의 simple 강제(`:94`)는 **안전망 0건** → 아래 컴포넌트 anchor는 **필수**.

**⑧ 신규**: full + EUAcq 주식수 공백 → 오류 / 양도 열 주식수 공백 → 오류 아님 / 순자산 단독이면 NI 주식수 면제 / simple은 종전 동작.
**컴포넌트 신규**: `acquisitionSideOnly`에서 토글 노출 · 사례 49 토글 비노출 · 결산서 EUAcq 단일 열 · EUTransfer 열 비노출.
**halt_acquisition(Q-2)**: halt_acquisition(코스닥) full이 ④에 도달 / 코스피 stale halt는 차단 유지(`stock-kospi-halt-scope` 계열).
**E2E 1건**: sale_case → 평가액 계산 → EUAcq 결산서 입력 → 계산 → 결과 + request body.

**영향 없음 확인(UI 시니어 실측)**: vitest에서 `acquisitionSideOnly`를 렌더하는 테스트 0건 · 증여 부담부(`simpleOnly`)의
「평가액 계산」 부재 단언(`gift-burdened-stock-unlisted-ui.anchor.test.tsx:68`)은 `simpleOnly` 유지라 무관 ·
`e2e/stock-sale-case-deduction.spec.ts:57-60`·`e2e/stock-transfer-halt-acquisition.spec.ts:84-91`은 기본 simple.

## 6. 14 동기화 지점 점검표

| 지점 | 변경 | 근거 |
|---|---|---|
| ①②③ 폼 타입·initial·normalize | 없음 (A안) | `unlistedValuationMode`·EUAcq 필드 기존 (form-types `:544`, form `:285`, normalize `:415`) |
| ④ API 변환 | **있음** | §4.4 |
| ⑤ UI 위젯 | **있음** | §4.3 |
| ⑥ 사이드바 | 없음 | §3.6 |
| ⑦ 결과 카드 | 문구만 (Q-3) | §3.6 |
| ⑧ validation | **있음** | §4.5 |
| ⑨⑩⑪ Zod enum·컴패니언·자산 fallback | 없음 | `unlistedValuationMode`는 Zod에 없음(클라이언트에서 4값으로 환원) |
| ⑫ Zod 입력 객체 | 없음 | `schema.ts:339-344` 기존 |
| ⑬ body spread | ④와 동일 지점 | `buildStockTransferApiBody` |
| ⑭ Route 매핑 | 없음 | `engine-input.ts:112-117` 기존 |

## 7. 위험

- **R-1 master 뒤처짐**: 워크트리 기준 `23a146b29`, master는 `d9a9dbb5b`(#1962 — 80% 하한 시행일 2018.4.1 정정, `calcSection165_4Value` 연혁 게이트 변경). 신규 anchor의 지정값은 **rebase 후** 값으로 만든다(Phase 0).
- **R-2 미커밋 1번 작업과 파일 겹침**: 거래상대 삭제가 `stock-transfer-tax-api.ts`·form-types·normalize를 건드린다 → Phase 0에서 먼저 커밋해 diff를 분리.
- **R-3 복원 이력 재해석(A안)**: §4.1 표. Q-1에서 수용 확정 — EUAcq가 비면 ⑧이 막고, 채워져 있으면 화면 토글에 보인다.
- **R-4 빈 결산서 미리보기 「0」**: full이면 `entered=true`라 아무것도 안 넣어도 취득기준시가 0이 표시된다(환산 full도 현행 동일). 취득측에서도 유지 — 계산 시 ⑧이 주식수 누락으로 막는다.

## 8. 사용자 결정 (Q) · 미검증 (V)

| ID | 질문 | 결정 (2026-10-04) |
|---|---|---|
| **Q-1** | 모드 상태를 기존 `unlistedValuationMode`와 공유(A)할지, 별도 필드(B)로 둘지 | ✅ **A안 공유** — 환산 full → 매매사례 진입 시 full로 열리는 것을 수용 |
| **Q-2** | 취득일 거래정지(halt_acquisition)도 같은 PR에서 열지 | ✅ **포함** — ④ 게이트를 같이 넓힌다(§3.3·§4.2) |
| **Q-3** | 토글 hint·배지의 「상증령 §54·§55 산식」 문구를 정정할지 | ✅ **포함** — §54①은 「최근 3년간」 가중평균이라(§3.1) 양도세 화면에서 3년치 입력을 유도할 수 있다. 「소령 §165④1호 — 직전 사업연도」로 정정. 대상(자가검토 역방향 grep 전수): `EstimatedUnlistedBlock.tsx:280` hint · `:283-284` LawArticleModal 2개 → `소득세법 시행령 §165 ④ 1호` 하나 · **`EstimatedUnlistedNetIncomeStatement.tsx:69` 제목 「상증령 §54 — 24행」 → 「소령 §165④1 가목 — 24행」**(순자산 제목 `NetAssetStatement.tsx:47`은 이미 「소령 §165④1 나목」 — 대칭) · `StockTransferTaxResultView.tsx:430` 배지 · `lib/tax-engine/stock-transfer/unlisted-messages.ts:20` `FULL_MODE_BADGE`(사용처 0인 미사용 상수 — 문자열만 동기 갱신, 삭제는 안 함). ⚠️ 문구는 **지배 조문만** 쓴다 — 소령 §165④·소칙 §81(MST 286379) 어디에도 24행·19행 행 구성의 근거가 없으므로(자가검토 실측) 「행 구성 = ○○조」를 주장하지 않는다(V-6) |

| ID | 미검증 항목 | 확인 방법 |
|---|---|---|
| V-1 | EUAcq 단일 열에서 `StatementTable`·주식수 후보칩(`share-candidates.ts`)·Enter 이동이 정상인지 | ✅ 부분 해소 — 임시 렌더 프로브로 순손익·순자산 표가 EUAcq 단일 열로 렌더되고 입력이 EUAcq 키에 기록됨을 확인(프로브 파일 삭제). 후보칩·Enter 이동은 미확인 → Phase 7 브라우저 (설계 영향 없음) |
| V-2 | ⑧ 오류 field `niShareCountEUAcq`·`naShareCountEUAcq`의 「오류 → 입력칸 이동」 해석 여부 | ✅ 해소 — 주식 마법사는 field 기반 이동이 없다(첫 오류 메시지만, `StockTransferTaxCalculator.tsx:59-68`). ⇒ §4.5 메시지 규칙으로 반영 |
| V-3 | 다종목(aggregate) 경로가 종목별로 같은 ④를 타는지 | ✅ 해소 — `callStockTransferTaxAggregateAPI`가 `forms.map(buildStockTransferApiBody)`(`api.ts:673`) |
| V-4 | Step3 「개산공제 자동 적용」 문구 조건이 취득측 full에서도 참인지 | ✅ 해소 — 조건이 `acquisitionMode` 기준(`Step3.tsx:225`)이라 평가 모드와 무관 · 변경 없음 |
| V-5 | `e2e/stock-transfer-trading-halt.spec.ts:83`·`stock-transfer-halt-extension.spec.ts:62`의 `getByText("평가액 계산")`이 strict 충돌 없는지 | ✅ 정적 해소 — halt_transfer·halt_acquisition은 같은 `acquisitionStdMode`의 다른 값이라 한 화면에 블록이 하나뿐. Phase 7 E2E 실행으로 재확인 |
| V-6 | 24행 순손익 서식이 소령 §165④1호 가목 「1주당 순손익액」 산정과 맞는지 / 19행 순자산 서식이 나목 「장부가액(토지는 기준시가)」과 맞는지 | ⏳ 범위 밖(환산 full에서 이미 공통 · 이번 설계 영향 없음). 자가검토 실측: 소령 §165④·소칙 §81에 행 구성 규정 없음 → **화면 문구에 행 구성 출처를 쓰지 않는다**(Q-3) |

## 9. 정책 점검 (메모리)

- `feedback_ui_engine_dual_truth_avoidance` — 미리보기는 기존 정본(`calcSection165_4Value`·어댑터)만 사용, 산식 재작성 0
- `feedback_mirror_pattern` — mode fallback `|| "simple"`을 ④⑤⑧ 동일하게
- `feedback_ui_gate_two_conditions_downstream_one` — ⑤가 「취득측 && full」 두 조건이면 ④⑧도 같은 두 조건(단일 술어로 강제)
- `feedback_api_trigger_without_input_path_is_noop` — 화면을 연 halt_acquisition은 ④ 게이트도 반드시 함께 넓힌다(화면만 열리고 body엔 안 실리는 결함 방지)
- `feedback_shared_assertion_reversal_erases_sibling_net` — SC-9 반전 시 SC-9a~f로 대체
- `feedback_800line_split_playbook` — validate-step2 분리는 동작 변경 0 커밋으로 선행
- `feedback_worktree_husky_hooks_silently_skipped` — 푸시 전 `FULL_TEST=1 bash .husky/pre-push` 수동 실행

## 10. 자가검토 기록 (plan-design-self-review-loop v4)

**검증 깊이 L3** — 게이트 술어가 바뀌어 매매사례·취득일 거래정지의 개산공제 기준시가가 새 경로로 계산된다(세액 경로 개방).
design.md(STEP 5~9·12~13)는 **N/A** — 단일 PR · 계획서 500줄 미만 · 신설 위젯 5개 미만(산출물 게이트 미충족).

### 10.1 1회차 검토 표 (STEP 1)

| # | 카테고리 | 우선순위 | 위치 | 문제 | 정정 |
|---|---|---|---|---|---|
| 1 | 오류 | Medium | §3.3·§6 | Step2 인용 `564-573`·`606-621` 어긋남 | 실측 `565-574`·`610-625`로 정정 |
| 2 | 오류 | Medium | §4.6 | 분리 범위 `:60-224`는 공용 헬퍼까지 포함한 어림값 | `:72-222` + 공용 헬퍼 `:48-71` export 공유 명시 |
| 3 | 누락 | High | Q-3 대상 | 역방향 grep 결과 순손익 결산서 제목 「상증령 §54 — 24행」(`NetIncomeStatement.tsx:69`)·LawArticleModal 2개·미사용 상수 `FULL_MODE_BADGE`가 빠짐 | Q-3 대상 전수 기재 + 「행 구성 출처 주장 금지」(소령 §165④·소칙 §81 실측) |
| 4 | 오류(판정 뒤집힘) | High | §4.4 | sale_case 재싣기 블록을 「full 결과 제거 방어」로만 봄 → 실은 simple 값의 **유일한 공급원**(P-A 실측 7건 실패) | §4.4-3 초판 판정 정정 · 「full 적용 시만 skip」 못박음 |
| 5 | 모순 | Medium | §5 SC-9b | halt_acquisition은 환산 기본 분기가 simple `transferYear*`를 이미 싣는다 → 「body에 transferYear* 미포함」은 halt에서 거짓 | sale_case/halt 분리 정의 + §4.4-4 신설 |
| 6 | 누락 | High | §5 A-1 | 픽스처의 EUAcq 산출값이 simple 값과 같으면 현행에서도 GREEN(대수적 동일값 위장) | 다른 값 강제 |
| 7 | 정책위반 | High | §5 | 착수 전 안전망 미실측 | §10.2 실측 · 블록 simple 강제는 안전망 0 → 컴포넌트 anchor 필수 |
| 8 | 누락 | Medium | §4.5 | 오류 메시지가 입력칸 위치를 말해야 하는지 미정(V-2) | 주식 마법사는 field 이동 없음(메시지만) 실측 → 취득측 문구 규칙 신설 |
| 9 | 개선 | Low | §8 V-3·V-4·V-5 | grep으로 바로 닫히는 미검증 | 해소 근거 기재 |
| 10 | 오류 | Low | §3.6 | 배지 줄 `428-432` | `427-431` + `Step4.tsx:68` 경유 기재 |
| 11 | 모순 | Low | §1 비목표 | 「§8 참조」인데 §8에 해당 항목 없음 | §10.4로 이관 |

### 10.2 착수 전 mutation probe (안전망 실측)

주식 관련 테스트 236파일·2,669건을 대상으로, 바꿀 동작을 하나씩 무력화했다(백업 복원 · `git checkout` 미사용 — 미커밋 1번 작업 보호).

| P | 무력화 대상 | 실패 | 해석 |
|---|---|---|---|
| P-A | `api.ts:462` sale_case 재싣기 블록 전체 off | **7건** — SC-1·2·3·4·5·9, AP-MS-2 | 이 블록이 sale_case simple 값의 유일한 공급원(정정 #4). SC-9만 full 전용, 나머지 6건은 simple 경로 안전망 → 구현 후에도 GREEN 유지 |
| P-B | `EstimatedUnlistedBlock.tsx:94` 취득측 simple 강제 해제 | **0건** | 🔴 안전망 0 — 바뀐 뒤를 고정할 컴포넌트 anchor **필수** |
| P-C | `validateAcquisitionSideUnlistedFields` 즉시 return | **3건** — SC-7, C1-VALIDATE-1, `stock-165-8-1-ra` 취득일 거래정지 | 취득측 simple 검증 안전망 → full 분기 추가 후에도 GREEN 유지 |

구현 후에는 신규 anchor마다 대응 mutation(게이트 OR 제거 · skip 조건 제거 · ⑧ full 분기 제거 · 결산서 열 prop 무시 · `hideAcqColumn` 강제 false 제거)을 넣어 **그 anchor만** 실패하는지 잰다(Phase 6).

### 10.3 재검토 (STEP 3 · blast-radius)

정정으로 바뀐 이름(§4.4-3·4, SC-9b, Q-3 대상, §4.6 범위, V-1~V-5)을 문서 안에서 다시 grep했다 — 참조처는 §5 Phase 2 verify, §6 ④ 행, §1 비목표 1곳이고 모두 갱신됐다. 새 인용(`api.ts:339-350`·`:361-369`, `validate-step2.ts:117-130`·`:48-71`, `StockTransferTaxCalculator.tsx:59-68`, `Step3.tsx:225`, `api.ts:673`)은 실측 확인. 신규 문제 0건.

### 10.4 범위 밖으로 남기는 것 (언급만)

- 결과 배지가 `acquisitionMode`와 무관하게 `unlistedValuationMode==="full"`이면 뜬다(실가·매매사례의 stale full에서도) — 잠복 결함, 별건.
- `FULL_MODE_BADGE` 상수는 사용처 0(결과뷰가 같은 문자열을 하드코딩) — 문자열만 동기 갱신, 정리는 별건.
- 환산 full 검증 문구의 내부 약어(「NI」·「full 모드」) — 별건.
- V-6 행 구성 근거.

### 10.5 verdict

- 미해소 Critical/High: **0** (High 5건 전부 계획서에 반영)
- 설계에 영향을 주는 미해소 V-n: **0** (V-1 잔여는 브라우저 확인 항목 · V-6은 범위 밖)
- 판정 뒤집힘: **1건**(#4) · 안전망 실측: **3건**(P-A·P-B·P-C)

⇒ **`clean`** — Phase 0 착수 가능.

## 11. 구현 기록 (2026-10-04~05)

### 11.1 커밋
| 커밋 | 내용 |
|---|---|
| `423613210` | (선행) 매매사례 「거래상대 (메타)」 입력·키워드 경고 삭제 — 같은 파일을 건드려 분리 |
| `68fd365df` | 본 계획서 |
| `ed6f9fccc` | Phase 2 — validate-step2 비상장 검증군 분리(745 → 580 + 195줄, 동작 불변: P-C 3건 재현) |
| (본 커밋) | Phase 1·3·4·5 — 술어 · ④ · ⑧ · ⑤ · 문구 · anchor |

### 11.2 계획 대비 달라진 점
- **⑧ EUAcq 주식수 규칙을 환산 full과 헬퍼로 공유하지 않았다.** 환산 full은 「양도 NI → 취득 NI → 양도 NA → 취득 NA」 순서로 오류를 쌓는데,
  주식 마법사는 **첫 오류 메시지만** 보여 준다(V-2). 헬퍼로 뽑으면 그 순서가 바뀌어 기존 화면의 첫 메시지가 달라진다 ⇒ 취득측 분기에 두 줄을 따로 두었다(규칙 2줄 · 메시지가 다르다).
- **문구(Q-3) 근거 정정** — 초판·자가검토는 「소령 §165④·소칙 §81에 결산서 행 구성 근거가 없다 → 출처 주장 금지」라고 했다. **불완전했다** —
  소득세법 §99①4호 **전단**이 「상속세 및 증여세법 제63조제1항제1호나목을 준용하여 평가한 가액」이고 **후단**이 평가기준시기·평가액을 대통령령(§165④)에 위임한다(MST 280405 원문 확인).
  ⇒ 행 구성(순손익액·순자산가액)은 준용 경로로 상증령 §55·§56에 기댈 수 있고, **기간**만 §165④1호 가목 「직전 사업연도」가 정한다(상증령 §54① 「최근 3년간」 배제).
  화면 문구는 지배 조문 「소득세법 시행령 §165④1호」로 두고, 법령 링크는 「소령§165④1」·「소법§99①4」(준용 근거) 짝으로 바꿨다. V-6(서식 행 하나하나의 대응)은 여전히 범위 밖.
- SC-H4(비상장에 남은 stale halt_acquisition은 취득측 전용이 아니다)를 추가했다 — 술어의 `!usesUnlistedSupplementaryValuation` 가드를 지키는 anchor가 없었다(M10).

### 11.3 구현 후 mutation probe — 10/10 KILLED, 부수 실패 0

| M | 무력화 | 실패한 anchor (그것만) |
|---|---|---|
| M1 | ④ full 게이트의 `\|\| acqSideFull` 제거 | SC-H1 |
| M2 | ④ 취득측이어도 양도 열 싣기 | SC-9b · SC-H2 |
| M3 | ④ sale_case 재싣기 skip 조건 제거 | SC-9a·9b·9d·9e·9f |
| M4 | ⑧ full 분기 제거 | SC-9·V1·9d·9e·V2·H2 |
| M5 | ⑤ 취득측 simple 강제 복원 | UI-AS-3·4·5 |
| M6 | ⑤ 토글 게이트 복원 | UI-AS-1 |
| M7 | 순자산 결산서 양도 열 숨김 무시 | UI-AS-3 |
| M8 | 순손익 결산서 stale 액면가 무시 제거 | UI-AS-4 |
| M9 | 술어 코스피 가드 제거 | SC-H3 |
| M10 | 술어 비상장 stale halt 가드 제거 | SC-H4 |

### 11.4 검증
- tsc 0 · 변경 파일 eslint 0 · 폰트·톤 게이트 통과
- 주식 관련 237파일 2,699건 통과(신규: anchor 14 + 컴포넌트 6)
- E2E(E2E_PORT 격리): 신규 `e2e/stock-sale-case-acq-full-valuation.spec.ts` + 관련 4 spec — 전건 통과.
  화면(결산서 취득 열 단독 · 후보칩 동작) → request body(`acquisitionYear*` 300,000/200,000 · `transferYear*` 없음) → 결과 행(개산공제 26,000,000 · 양도소득금액 74,000,000).
  ⚠️ 1차 실행에서 `stock-transfer-trading-halt.spec.ts:83` `getByText("평가액 계산")`이 strict 위반 — 새 hint 문구가 라벨 「평가액 계산」을 되풀이했다.
  spec을 느슨하게 하지 않고 **hint가 라벨을 반복하지 않게** 고쳤다(memory `feedback_hint_quoting_toggle_title_breaks_selector`와 같은 함정).
- V-1 잔여: 단일 열 주식수 후보칩은 스크린샷으로 동작 확인. Enter 이동은 미확인(설계 영향 없음).

### 11.5 리뷰 게이트 (`acquisition-cost-review`) — FAIL 0
- C(법령 체인)·D(배관) 전 항목 PASS. Low 지적 2건:
  1. 순손익 결산서 제목 「소령 §165④1 가목 — 24행」이 행 구성 출처를 암시 → **유지**. 리뷰는 §11.2 정정 이전 전제(「행 구성 근거 없음」)를 따랐다 — 소법 §99①4 전단 준용 경로가 있고, 순자산 제목 「소령 §165④1 나목」과 대칭이다.
  2. 이월과세 증여자 매매사례 + 취득측 full 조합 anchor 부재 → **AP-2 추가**(`stock-carryover-sale-case-gates.anchor.test.ts`). 엔진 override를 끄는 mutation에서 AP-2만 실패함을 확인.
