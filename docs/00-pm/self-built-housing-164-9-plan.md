# 일체 주택 **본인 신축** × 영 §164⑨ 양도 당시 기준시가 특례(공익수용·공매) × 「소득세법」 §114조의2 가산세 — 건물분 base 수정 계획서 (Q-12 후속 · V-4/V-16 종결)

**상태**: **Plan 초안 — 사용자 결정 대기**(§10 Q-1~Q-9, 권장 ★). 소스는 건드리지 않았다. 실측은 작성 시 throwaway probe(저장소 미보존, 원복·삭제 완료)이고, UI 시니어 조사(읽기 전용)는 §5에 본문으로 승격했다(요약 아님).
**브랜치**: `docs/self-built-housing-164-9-plan` (Q-12 PR-4 head `30a49870e` 위)
**상위 계획**: `docs/00-pm/self-built-housing-building-base-114-2.plan.md` — §9 PR-1~PR-4 Do 기록 · §12 **V-4**(§164⑨ × B_tr 안분) · **V-16**(PR-4: 자산 전체 base + 「확인 필요」 고지로 남긴 건)을 이 문서가 닫는다.
**관련 계획**: `docs/02-design/features/expropriation-valuation-164-9-scope-expansion.plan.md`(§164⑨ 구현 계획 — §4-6 split 토지분만 · §4-7 일반건물 토지분만 · Q6 주택 split 미지원 · P5 주택 총액 트랙) · `docs/00-pm/carryover-donor-built-114-2.plan.md`(이월과세 × 증여자 신축 — 본인 신축이 선례로 삼은 `donorBuilt.housing`).
**사용자 확정 해석(재론 금지)**: ① §114조의2는 **건물분에만** 적용 · ② 일체 주택 건물분 기준시가 = 주택공시가격 × 건물기준시가 ÷ (토지공시가격(개별공시지가×면적) + 건물기준시가) — 이월과세 계획 Q-2, 취득 당시·양도 당시 각각 · ③ 건물 양도가액 S_b는 `resolveTransferPriceSplit` 법정 서열(구분 기재 → §100③ 30% → 감정평가 → 기준시가 비례) — 이월과세 계획 Q-6 (b). **이 문서가 새로 묻는 것은 «특례가 걸린 양도 당시 주택공시가격(H_T′)을 그 비례 규칙에 어떻게 넣느냐»뿐이다(Q-1).**

---

## 0. 한 줄 요약

**현행(PR-4)**: 일체 주택 본인 신축을 **환산 + 공익수용(영 §164⑨1호) 또는 공매·경락(2호)** 으로 계산하면 «건물분 base 를 지원하지 않는다»며 **토지분이 섞인 자산 전체 base + 「확인 필요」 고지**로 남겨 뒀다(`selfBuiltHousingSec164_9Fallback`, UI 술어 `self-built-housing-scope.ts:76-77`). 그런데 실측해 보니 이 격리가 **세 가지를 더 넓게 막고 있다**.

1. **특례가 실제로 걸리지 않는 흔한 수용**(보상액 ≥ 양도 당시 주택공시가격 — 공시가격이 시가보다 낮아 보통 이쪽)도 원 플래그만 보고 자산 전체 base 로 간다 — 대표 픽스처 500,000,000 / 25,000,000 (건물분이면 187,500,000 / 9,375,000, 총납부 −17,187,500). 분모가 안 바뀌어도 PR-1 의 «환산 × §164⑨ 거부» 가 걸리지 않는 조합이다(실측 J).
2. **감정가액 × §164⑨** 는 법리가 아예 무관한데(감정은 양도 당시 기준시가를 쓰지 않는다 — 양도차익이 특례 유/무에서 −6,000,000 동일) 방식과 무관하게 같이 막힌다(실측 H·I). ④ 가 `isAuctionTransfer` 를 방식과 무관하게 싣기 때문에 **감정으로 바꾼 뒤 남은 stale 공매 플래그**도 같은 함정이다.
3. **이월과세 × 증여자 신축 `donorBuilt.housing` 은 이 질문을 한 번도 받지 않았다** — 건물분 B_tr 를 **특례 전 H_T** 로 만들어 가산세 base 가 양도차익(특례 분모)과 다른 분모를 쓴다(고지도 없음, 실측: 56,250,000 / 2,812,500 vs (가) 75,000,000 / 3,750,000). 같은 결함의 반대 모양이다.

**권장(Q-1 ★ (가))**: 특례가 정하는 양도 당시 주택공시가격 H_T′ = §164⑨ 적용 총액을 **이월과세 Q-2 의 비례 규칙에 그대로 넣는다** — B_tr′ = H_T′ × N_T ÷ (L_T + N_T). 법적 새 입력은 **0**(보상액·보상기초·경락가는 이미 ② 양도정보 ⑧ 필수·④ 전송), 근거 문언은 §164⑨ «라목 가액에서 차감하여 양도 당시 기준시가를 계산한다» + 이미 출하된 **PHD 분리 계산이 같은 방식**(건물 파트도 낮춘 분모 — 실측 169,332,955 → 212,343,526). 구현은 **술어 2줄 삭제 + 엔진 분모 1곳 교체 + 고지·fallback 삭제**이고, 감정은 법리 무관이라 **PR-5a 로 먼저** 연다.

---

## 1. 법령·해석 (원문 확인 2026-10-23)

> ⚠️ **KoreanLaw MCP 연결 실패**(`UND_ERR_CONNECT_TIMEOUT: www.law.go.kr:443`, 4회 재시도 동일) — 이 세션의 MCP 로는 조회하지 못했다. 대신 **법제처 DRF 를 `lawService.do` 로 직접 호출**(저장소 `KOREAN_LAW_OC`)해 현행 본문을, 저장소 법제처 응답 캐시(`.legal-cache`, 2026-09-20 수집)로 §99·§100·§176의2·§166 본문을, 국세법령정보시스템 상세 API 로 해석례 본문을 읽었다. 아래 인용은 전부 이 경로에서 읽은 verbatim 이다.

| 법령 | 확인 | 본문 (verbatim) |
|---|---|---|
| **소득세법 시행령 §164⑨** (MST 290841, 시행 2026-10-01 현행 — DRF 직접) | ✅ | 「⑨ 다음 각 호의 어느 하나에 해당하는 가액이 법 제99조제1항제1호가목부터 라목까지의 규정에 따른 가액보다 낮은 경우에는 그 **차액을 같은 호 가목부터 라목까지의 규정에 따른 가액에서 차감**하여 **양도 당시 기준시가를 계산한다**. <개정 1999.12.31, 2002.12.30, 2005.2.19, 2005.8.5, 2009.2.4, 2013.2.15> **1.** 「공익사업을 위한 토지 등의 취득 및 보상에 관한 법률」에 따른 협의매수ㆍ수용 및 그 밖의 법률에 따라 수용되는 경우의 그 **보상액과 보상액 산정의 기초가 되는 기준시가 중 적은 금액** **2.** 「국세징수법」에 의한 공매와 「민사집행법」에 의한 강제경매 또는 저당권실행을 위하여 경매되는 경우의 그 **공매 또는 경락가액**」 |
| **소득세법 시행규칙 §80⑧** (MST 286379, 시행 2026-07-01 — DRF 직접) | ✅ | 「⑧ 영 제164조제9항제1호에서 **보상금액 산정의 기초가 되는 기준시가는 보상금 산정 당시 해당 토지의 개별공시지가**를 말한다. <신설 2009.4.14>」 |
| **소득세법 §99①1호** (캐시) | ✅ | 「1. 제94조제1항제1호에 따른 토지 또는 건물 가. 토지 — 개별공시지가 … 나. 건물 — … 국세청장이 산정ㆍ고시하는 가액 다. 오피스텔 및 상업용 건물 … 라. **주택 — 「부동산 가격공시에 관한 법률」에 따른 개별주택가격 및 공동주택가격**. …」 |
| **소득세법 §114조의2①②** (MST 280405, 시행 2026-07-01 현행 — DRF 직접) | ✅ | 「① 거주자가 건물을 신축 … 그 건물의 취득일 … 부터 5년 이내에 **해당 건물**을 양도하는 경우로서 제97조제1항제1호나목에 따른 감정가액 또는 환산취득가액을 그 취득가액으로 하는 경우에는 **해당 건물의 감정가액** … 또는 **환산취득가액** …의 100분의 5에 해당하는 금액을 제92조제3항제2호에 따른 양도소득 결정세액에 더한다. ② 제1항은 제92조제3항제1호에 따른 양도소득 산출세액이 없는 경우에도 적용한다.」 |
| **소득세법 시행령 §176조의2②2호** (캐시) | ✅ | 환산식의 분모는 「**양도당시의 기준시가** (제164조제8항의 규정에 해당하는 경우에는 동항의 규정에 의한 양도당시의 기준시가)」 — ⑨ 는 괄호에 인용되지 않았으나 ⑨ 자체가 «양도 당시 기준시가를 계산한다» 는 정의 규정이다(일반건물 계획 §4-7 결론 1). |
| 소득세법 §100②③ · 시행령 §166⑥ | ✅ | 상위 계획 §1 과 같다(구분 불분명 시 기준시가 등을 고려한 안분, 구분 기재가 안분계산가액과 30% 이상 차이면 불분명). |

**§164⑨ 가 «무엇을 대체하는가»**(건물분 분모를 정하는 핵심):
- 대체되는 것은 **법 §99①1호 가목~라목 «각목의 가액» 하나**다. 주택(라목)의 가액은 **개별주택가격·공동주택가격 — 토지+건물 일체 총액 하나**다. 따라서 ⑨ 의 «차감 후 양도 당시 기준시가» 도 **일체 총액 H_T′ = min(H_T, 보상액, 보상기초)(1호) / min(H_T, 경락가액)(2호)** 하나로 나온다(`resolveConversionDenominatorAtTransfer` 가 그렇게 구현 — 1호 주택 총액 3후보 `applyHousingExpropriationValuation`, 2호 총액 2후보 `applyAuctionValuation`).
- 토지·건물을 따로 대체하지 않는다: 건물(나목)은 별개 각목이라 독립 가액이 있지만(일반건물 카드), **주택은 건물 몫이 독립 가액이 아니라 라목 총액의 비례 몫**(사용자 확정 Q-2)이다.
- **보상기초 기준시가의 정의(시행규칙 §80⑧)는 «해당 토지의 개별공시지가»** 라서 일반건물은 «토지분만 특례·건물분 무변경»(§4-7)으로 구현했다. 주택 라목은 P5 에서 «개별주택가격·보상액·보상기초 총액» 3후보로 사용자 확정·출하됐고(상위 §164⑨ 계획 :749 «주택 보상기초 총액은 토지-only 명문 부재 → 자동 합성 금지·사용자 명시 입력만»), **이 문서는 그 위에서 동작하며 재론하지 않는다**(§9 V-3).

**해석례·판례**(국세법령정보시스템 상세 API·DRF `prec` 검색, 2026-10-23):
- `ntsCgmExpc` 「소득세법 시행령 제164조제9항」·「… 제164조 제9항」 구절 검색 합집합 7건 — 재산세과-136(2009.09.04) · 부동산거래관리과-541(2010.04.13)·-0878(2011.10.19) · 사전-2015-법령해석재산-22639 · 사전-2018-법령해석재산-0057 · 서면-2016-부동산-4026 · 사전-2020-법령해석재산-0140(재개발 사업시행자 매매 → ⑨1호 적용 불가). **전부 토지 사안**(보상기초 = 해당 토지의 개별공시지가·표준지 기준일)이다 — 일체 주택·건물분·공매를 정면으로 다룬 해석례는 **확인하지 못했다**(`moefCgmExpc` 0건, 「공매 환산취득가액」 「주택 수용 환산취득가액」 제목 검색 0건).
- `prec` 7건(서울고 2007누14451·서울행법 2006구단11487 등) — 2009.2.4. 개정 전 문언·토지 사안이고 본문 제공 불가(DRF `lawService` 빈 응답) → **본문 미열람**. 조세심판원 `ttSpecialDecc` 1건 — 본문 미열람.
- ⇒ **«§164⑨ 차감 후 일체 주택 가액을 토지·건물로 나누는 방법»의 정면 근거는 없다.** (가) 는 ① 문언(라목 가액 단위 차감) ② 사용자 확정 비례 규칙(이월과세 Q-2) ③ 출하된 PHD 분리 계산 선례의 합성이고 «정면 해석례 확인 필요» 고지를 단다(V-1).

---

## 2. 현행 — 코드 구조와 실측

### 2.1 코드 구조 (file:line 전수 확인)

| 지점 | 현행 | 근거 |
|---|---|---|
| 환산 분모 | `calcTransferGain` 이 `input.useEstimatedAcquisition` 일 때 `resolveConversionDenominatorAtTransfer(input)` 의 `denominator` 로 `S × H ÷ denominator` | `transfer-tax-helpers.ts:354-363` |
| 분모 확정 | 1호 per-sqm(주택은 `propertyType==="housing"` 로 배제) → 1호 주택 총액 `applyHousingExpropriationValuation`(수용 ∧ 환산 ∧ 양도일 ≥ 2009-02-04 ∧ H_T·보상액·보상기초 > 0) → 2호 `applyAuctionValuation` → 현행 `standardPriceAtTransfer` | `transfer-tax-expropriation-valuation.ts:392-441` |
| **감정은 분모를 쓰지 않는다** | `acquisitionMethod === "appraisal"` 분기는 `appraisalValue` 와 취득시 기준시가(개산공제)만 읽는다. 세 `apply*` 모두 `!useEstimatedAcquisition` 이면 null | `transfer-tax-helpers.ts:373-383` · `expropriation-valuation.ts:113,194,262` |
| 건물분 base 축 | `resolveSelfBuiltHousingPenaltyAxis(effectiveInput, splitActive)` — 정상 `finalize.ts:331` · 손실 `loss-return.ts:107` 이 같은 순서로 읽는다 | `transfer-tax-self-built-housing-penalty.ts:182` |
| 건물분 B_tr | `apportionByStdPrice(input.standardPriceAtTransfer, L_T, N_T).building` — **특례 전 H_T** | `...-penalty.ts:222` |
| §164⑨ 격리 | 환산 분모가 현행과 다르면 `selfBuiltHousing` 거부(`:127`) · `selfBuiltHousingSec164_9Fallback`(원 플래그 `transferCause==="public_expropriation" ∨ isAuctionTransfer===true`, **방식 무관**, `:139`) · `missingInputDisposition`(`:147`) · `selfBuiltHousingFallbackNotice`(`:166`, 호출 `normal-return.ts:100-102` · `loss-return.ts:109-110`) | 같은 파일 |
| UI 술어 | `selfBuiltHousingScope` 가 `:76`(`transferCause==="public_expropriation"`)·`:77`(`isAuctionTransfer===true ∧ isAuctionEligibleAssetKind`) 에서 **방식 결정(`:73`) 뒤인데 방식을 보지 않고** null | `lib/calc/self-built-housing-scope.ts:76-77` |
| ④ 전송 | `buildExpropriationInput` — `transferCause` 항상 · `isAuctionTransfer`·`auctionPrice` 는 `isAuctionEligibleAssetKind`(land·building·**housing**)이면 **환산 여부와 무관하게**(`:396-400`) · `housingCompensation*` 는 ⑧ 게이트 `send.housingTotal` 일 때만(`:403-407`). 컴패니언 `transfer-tax-api-companion-payload.ts:329-370` · 다건 `multi/route.ts:202-212` · 단건 ⑭ `engine-input.ts:71-76` · 컴패니언 ⑭ `bundled-split-helpers.ts:343-349` | 실측: 세 경로 모두 §164⑨ 키가 엔진까지 닿는다(§2.3) |

### 2.2 실측 발견 4건

| ID | 발견 | 실측 |
|---|---|---|
| **F-1** | **특례 불발(보상액·보상기초 ≥ H_T)인 수용도 자산 전체 base** — 판정이 원 플래그(`transferCause`/`isAuctionTransfer`)라 분모가 안 바뀌어도 §164⑨ 셀로 간다. 기존 route 테스트의 `EXPR` 픽스처(보상 5억/5억 ≥ H_T 4억)가 정확히 이 셀이다 | J: 현행 500,000,000 / 25,000,000 / 총 197,837,200 · 고지 1건. 같은 입력의 `selfBuiltHousing` 직접 전송은 **거부되지 않고** 187,500,000 / 9,375,000 / 180,649,700 (분모 불변이라 PR-1 검사 통과) — 즉 **엔진은 이미 이 조합을 계산할 수 있는데 UI 가 안 연다** |
| **F-2** | **감정 × §164⑨ 과잉 차단 + stale 플래그 함정** — 감정은 §164⑨ 와 법리상 무관한데 UI·엔진이 방식 없이 막는다. ④ 가 `isAuctionTransfer` 를 방식과 무관하게 실으므로, 환산 + 공매로 입력했다가 감정으로 바꾸면 `AuctionBlock` 은 숨지만 플래그는 남아 ④ 가 계속 싣고 엔진은 `sec164_9` 로 분기 | H·I: 수용/공매 × 감정 총액 3억 — 현행 300,000,000 / 15,000,000 / 총 16,500,000 + 고지 1건; 건물 감정 직접 1.1억 전송 시 110,000,000 / 5,500,000 / 6,050,000 (고지 0). **양도차익은 특례 유/무 −6,000,000 동일** |
| **F-3** | **이월과세 `donorBuilt.housing` 은 조용히 «특례 무시»(나)** — `housingBase` 가 `rawInput.standardPriceAtTransfer`(특례 전 H_T)로 B_tr 를 만들어 양도차익(특례 분모)과 가산세 base 의 분모가 다르다. 고지·throw 없음, ⑫·⑧ 도 막지 않는다 | donor 일반(특례 없음) 187,500,000 / 9,375,000 / 총 180,649,700. **donor × 수용(보상 3억/3.5억, S=3억)**: base 56,250,000 / 2,812,500 / 총 18,928,470, `donorBuilt.housingSplit.transferBuilding = 160,000,000`(H_T 4억 기준), 양도차익 94,000,000(특례 분모 3억 기준) · 공매 동일 · 고지 0 |
| **F-4** | **출하된 PHD 분리 계산은 (가) 동형** — `calcPreHousingDisclosureGain(…, conversionDenominatorOverride)` 가 «환산 분모(P_T)만 낮추고 양도가액 안분은 원 P_T 유지». 건물 파트 취득가액 = 총 환산취득가액 − 토지분이라 **건물 파트 base 도 낮춘 분모를 따른다** | `transfer-tax-pre-housing-disclosure.ts:136-148` · 호출 `transfer-tax-split-gain.ts:433-446`. 실측(PHD 신축 2019-01-10, 양도 2023-02-16): 특례 없음 penaltyBase 169,332,955 → 수용(보상 5억/5.5억 < P_T 6.27억) **212,343,526**(= 169,332,955 × 627 ÷ 500) |

### 2.3 경로별 현행 (공통 픽스처: 신축 2022-01-10 · 양도 2026-03-01 · 비1세대1주택 · H=2억(L=1억[㎡당 100만×100㎡]·N=6천만 → B_acq 75,000,000) · H_T=4억(L_T=2.4억·N_T=1.6억))

| 경로 | 현행 base / 가산세 (route·engine 실측) | 비고 |
|---|---|---|
| 단건 환산 × 수용(S=3억, 보상 3억·기초 3.5억 → H_T′ 3억) | **200,000,000 / 10,000,000** · 총 26,834,720 · 고지 1 | route 200 |
| 단건 환산 × 공매(S=3억, 경락 3억) | 200,000,000 / 10,000,000 · 고지 1 | 〃 |
| 함께 양도 컴패니언 × 수용/공매(배분 양도가 5억, 보상·경락 3억) | **333,333,333 / 16,666,666** · 고지 1 | 컴패니언 ⑫·⑭ 경유 §164⑨ 키 도달 확인 |
| 다건 합산 × 수용(S=3억) | 200,000,000 / 10,000,000 | `multi/route.ts:202-212` 매핑 확인 |
| 분리 계산(취득일 분리·소유자 분리·배율 초과분) | 건물 파트가 축 — 카드 null · 엔진 `splitActive` (PR-4) | 본 계획 대상 아님 |
| PHD(최초공시 전) | 건물 파트 — **이미 낮춘 분모**(F-4) | 대상 아님 |
| 겸용 · 부담부증여 · 증축 · 비주택 건물 | 축을 내지 않거나 별도 배선 | 대상 아님 |
| 일반건물 카드(`general_building`) | 토지 환산 분모만 §164⑨(시행규칙 §80⑧), 건물 환산은 독립 가액 | 대상 아님 — 나목은 독립 가액이라 전제가 다르다 |
| 이월과세 × 증여자 신축 일체 주택 | F-3 | **Q-4** |

---

## 3. 설계 대안 — 양도 당시 건물분 분모 B_tr

공통: S_b 는 사용자 확정 법정 서열(§100③ 30% 판정의 L_T·N_T 는 **원값** — 일반건물 §4-7 결론 2 «안분은 원 기준시가 유지, §164⑨ 낮춘 값을 넣으라는 명문 없음»과 같다). 바뀌는 것은 **B_tr 하나**다. B_acq 는 취득 당시 값이라 §164⑨(양도 당시 기준시가)와 무관하다.

| 안 | B_tr | 법적 근거 | 필요 입력 |
|---|---|---|---|
| **(가) ★** 특례 총액을 비례 안분 | **H_T′ × N_T ÷ (L_T + N_T)** (`apportionByStdPrice(H_T′, L_T, N_T).building`) | ① §164⑨ «라목 가액에서 차감하여 양도 당시 기준시가를 계산» — 라목 단일 총액의 차감값 H_T′ 가 «양도 당시 기준시가» ② 건물분은 독립 가액이 아니라 그 총액의 비례 몫(이월과세 Q-2, 사용자 확정) ③ PHD 분리 계산이 같은 방식으로 출하됨(F-4) ④ 양도차익의 환산취득가액과 **같은 분모**를 쓴다 → 한 계산서 안에서 기준이 이중화되지 않음 | **0** (H_T′ 의 재료는 이미 ⑧ 필수·④ 전송) |
| (나) 건물분 무변경 | H_T × N_T ÷ (L_T + N_T) (특례 무시, 현행 `donorBuilt` 거동) | 일반건물 §4-7 결론 3(시행규칙 §80⑧ — 건물엔 보상기초 개념 부재). **전제 불성립**: 그 결론은 «건물(나목)이 독립 가액»일 때의 것이다. 라목은 단일 가액이라 차감분을 토지에 귀속시킬 문언이 없고, 가산세 base 만 특례 전 분모를 쓰면 양도차익(H_T′)과 분모가 갈린다 | 0 |
| (다) 현행 유지(자산 전체 base + 고지) | — (토지분 포함) | 근거 없음: «해당 건물의» 문언을 넘어 토지분을 포함한다. F-1 처럼 특례가 불발인 흔한 수용까지 과다 base. 이월과세 건물분(이미 출하)과 불일치 | 0 |
| (라) 건물 보상액 별도 입력 | min(B_tr, 건물 보상액, ?) | **기각**: 건물에 «보상기초 기준시가» 개념이 없다(§80⑧). 두 후보뿐인 2호도 경락가는 일괄 총액이다 | 신규 칸 |

**기존 «B-1 기각» 과의 관계**(필수 확인): 상위 §164⑨ 계획 §4-6 이 기각한 B-1 은 «주택 **regular split**(취득일 분리) 양도차익에서 토지분 보상기초에 해당하는 법정 가액이 없어 총액을 안분하는 것»이고 `no_silent_apportion_fallback` 저촉이었다. (가) 는 그것과 다르다 — ⓐ 양도차익이 아니라 **가산세 base**(결정세액 불변) ⓑ L_T·N_T 는 **사용자가 입력한 필수 칸**이며 비면 ⑧ 이 차단(역산·합성 없음) ⓒ 비례 규칙은 사용자 확정 해석(이월과세 Q-2)의 재사용이다. 정책 점검은 §12 에 둔다.

**수치**(engine probe — `penaltyAxis` 로 각 안의 base 를 주입한 **실제 엔진 실행**; 결정세액·세율·장특 불변, 변하는 것은 가산세와 그 10% 지방소득세뿐):

| 셀 | 현행 base / 가산세 / 총납부 | (가) base / 가산세 / 총납부 (Δ) | (나) base / 가산세 / 총납부 (Δ) |
|---|---|---|---|
| **A** 수용 S=3억·보상 3억/3.5억 (H_T′ 3억) | 200,000,000 / 10,000,000 / 26,834,720 | **75,000,000 / 3,750,000 / 19,959,720 (−6,875,000)** | 56,250,000 / 2,812,500 / 18,928,470 (−7,906,250) |
| **B** 공매 S=3억·경락 3억 | 〃 | 〃 | 〃 |
| **C** 불발 S=10억·보상 5억/5억 | 500,000,000 / 25,000,000 / 197,837,200 | 187,500,000 / 9,375,000 / 180,649,700 (**−17,187,500**) | 〃 (= (가)) |
| **D** 원 픽스처 S=10억·보상 3억/3.5억 | 666,666,666 / 33,333,333 / 139,566,972 | 250,000,000 / 12,500,000 / 116,650,306 (−22,916,666) | 187,500,000 / 9,375,000 / 113,212,806 (−26,354,166) |
| **E** A + 양도가 구분기재(토지 2억/건물 1억, §100③ 통과) | 200,000,000 / 10,000,000 / 26,834,720 | 62,500,000 / 3,125,000 / 19,272,220 (−7,562,500) | 46,875,000 / 2,343,750 / 18,412,845 (−8,421,875) |
| **F** A + 양도차손(자본적지출 5억, 결정세액 0) | 200,000,000 / 10,000,000 / 11,000,000 | 75,000,000 / 3,750,000 / 4,125,000 (−6,875,000) | 56,250,000 / 2,812,500 / 3,093,750 (−7,906,250) |
| **G** A + 지분 50%(양도가 1.5억, 기준시가·보상 물건 전체) | 100,000,000 / 5,000,000 / 10,836,100 | 37,500,000 / 1,875,000 / 7,398,600 (−3,437,500) | 28,125,000 / 1,406,250 / 6,882,975 (−3,953,125) |
| **K** 1세대 1주택 고가(15억, H_T 6억, 보상 5억/5.5억 → H_T′ 5억) | 600,000,000 / 30,000,000 / 64,616,860 | 225,000,000 / 11,250,000 / 43,991,860 (−20,625,000) | 187,500,000 / 9,375,000 / 41,929,360 (−22,687,500) |

- **항등식**(기준시가 비례 S_b 일 때): (가) base = (§164⑨ 적용 **자산 전체** 환산취득가액) × 취득 당시 건물 비율(B_acq ÷ H). A: 200,000,000 × 0.375 = 75,000,000 **일치**; D: 666,666,666 × 0.375 = 249,999,999.75 vs base 250,000,000 — **±1원 절사 차 실측**. (나) = (가) × H_T′ ÷ H_T (A: 75,000,000 × 0.75 = 56,250,000 일치). 구분 기재 S_b(E)는 항등식이 성립하지 않는다.
- **컴패니언**(route 현행 333,333,333 / 16,666,666): 산식상 (가) = 배분 양도가 5억 × 0.4 → S_b 2억 × 75,000,000 ÷ 120,000,000 = **125,000,000 / 6,250,000**, (나) 93,750,000 / 4,687,500 — 구현 후 Pre-Do 에서 route 실측(이 표는 산식 값, 엔진 미실행 → **확인 필요**).
- **방향**: 모든 셀에서 건물분 ⊂ 자산 전체라 가산세가 줄고, (가) ≥ (나)(특례가 실제로 분모를 낮출 때). 특례 불발(C)에서는 (가) = (나). 결정세액은 어느 안에서도 불변이다.

---

## 4. 엔진 설계 (권장 (가) 기준 · 파일 줄 수는 §8)

### 4.1 PR-5a 감정 × §164⑨ (법리 무관 — (가)/(나) 결정을 기다리지 않는다)
감정은 §164⑨ 가 base 에 닿지 않으므로 **«방식 = 환산일 때만 §164⑨ 로 본다»** 를 UI·엔진 양쪽에 같이 넣는다(한쪽만 넣으면 UI 가 칸을 여는데 엔진이 고지만 내거나, 반대로 칸 없이 던진다 — dead-end).
- 엔진: `selfBuiltHousingSec164_9Fallback(input)` 에 `input.acquisitionMethod === "estimated"` 추가(= ④ 가 싣는 방식. leaf 의 `method`(`:187`)·`applies`·게이트가 이미 이 값을 읽는다). `missingInputDisposition` 이 감정 × 수용/공매를 `"required"` 로 → `selfBuiltHousing` 부재 시 INVALID_INPUT. `:127` 분모 거부는 환산 분기 끝에만 있으므로 감정은 이미 통과(현행 «직접 전송 = 건물분 base»).
- UI: `self-built-housing-scope.ts:76-77` 두 줄을 `method === "estimated"` 일 때만 닫도록 좁힌다(방식 결정 `:73` 뒤라 같은 변수를 쓴다).
- ⑦ 감정 표시는 기존 `appraisal_direct`/`appraisal_apportioned` 문구 그대로 — §164⑨ 무관이라 추가 문구 없음. 고지 함수의 감정분 경로만 사라진다(환산분이 남으므로 함수 삭제는 5b).
- stale 방어: 환산 + 공매로 입력 → 감정으로 변경 시 `isAuctionTransfer` 는 지워지지 않고 ④ 가 싣는다(`transfer-tax-api-helpers.ts:396-400`). 위 «방식 = 환산» 한정이 이 셀을 닫는다(감정이면 공매 플래그와 무관하게 건물분 카드).

### 4.2 PR-5b 환산 × §164⑨ (가)
`transfer-tax-self-built-housing-penalty.ts`:
1. **분모 교체** — `:222` `apportionByStdPrice(input.standardPriceAtTransfer!, …)` → `const conv = resolveConversionDenominatorAtTransfer(input)` 의 `conv.denominator` 로 안분(`H_T′`). `resolveConversionDenominatorAtTransfer` 는 이미 import 돼 있다(`:33`, 현행 `:127` 사용). 특례가 안 걸리면(`보상액 미입력·양도일 < 2009-02-04·불발·감정`) `denominator = standardPriceAtTransfer` 이므로 **현행 PR-1 값과 바이트 동일**(회귀 0).
2. **`:127-129` 분모 거부 삭제** — «환산 분모가 다르면 거부» 는 (가) 에서 입력 가능한 정상 조합이 된다.
3. **fallback 삭제** — `selfBuiltHousingSec164_9Fallback`(`:139`) · `selfBuiltHousingFallbackNotice`(`:166`) · `missingInputDisposition` 의 `"sec164_9"` 분기 · `normal-return.ts:100-102`·`loss-return.ts:107-110` 의 호출 블록과 import · 함수 헤더 주석의 «§164⑨ 격리» 단락. `missingInputDisposition` 은 `"required" | "none"` 이 된다(죽은 코드 금지).
4. **echo 확장** — `types/transfer-self-built-housing.types.ts` `housingSplit` 에 optional `sec164_9?: { kind: "expropriation" | "auction"; standardHousing: number; candidates: { compensation?: number; basis?: number; auction?: number } }`. `transferHousing` 은 **H_T′**(차감 후), `standardHousing` 은 특례 전 H_T. `candidates` 는 `conv.housingExpropriationValuationDetail`/`conv.auctionValuationDetail` 에서 **복사**(재계산 금지 — 표시 단일 소스). 특례 detail 이 있을 때만 싣는다(불발이어도 detail 은 존재 → 기존 특례 카드 노출 조건과 같다 — Q-7).
5. 정상·손실 경로는 `resolveSelfBuiltHousingPenaltyAxis(effectiveInput, …)` 를 이미 같은 순서로 부르므로 **배선 변경 없음**(`finalize.ts:331`·`loss-return.ts:107`). 단 `effectiveInput` 이 §164⑨ 키(`transferCause`·`housingCompensation*`·`isAuctionTransfer`·`auctionPrice`)를 `input` 과 동일하게 갖는지 Pre-Do 에서 `echo.housingSplit.transferHousing === 양도차익 분모` 항등으로 확인한다(§9 anchor 6).

`calcTransferGain` 은 건드리지 않는다 — 양도차익·결정세액·세율·장특은 불변이다(Q-14 상위 확정과 같음).

### 4.3 PR-5c 이월과세 `donorBuilt.housing` 정렬 (조건부 — Q-4)
`transfer-tax-carryover-donor-penalty.ts:141` `apportionByStdPrice(rawInput.standardPriceAtTransfer!, …)` → `resolveConversionDenominatorAtTransfer(rawInput).denominator`. **출하된 수치가 바뀐다**: donor × 수용 A 셀 56,250,000 / 2,812,500 / 총 18,928,470 → 75,000,000 / 3,750,000 / 19,959,720(가산세 **+937,500**, 총납부 +1,031,250). 호출 시점의 `rawInput` 이 특례 키를 갖는지(이월과세 A 채택 입력 `adoptedInput` vs `rawInput`)와 echo(`donorBuiltPenalty.housingSplit.transferBuilding`) 표시 갱신이 필요하다. Q-1 이 (나) 면 이 PR 은 없고 «현행이 의도와 일치한다» 는 주석·anchor 고정만 남는다.

---

## 5. UI 설계 (UI 시니어 조사 승격 — 읽기 전용 조사, 브라우저 미확인)

**한 줄 결론**: UI 에 **새 입력 칸은 필요 없다.** (가)·(나) 어느 쪽이든 `SelfBuiltHousingShareBlock` 에 더할 칸이 없다. §164⑨ 입력은 이미 ② 양도정보에 있고 환산이면 ⑧ 이 필수로 요구하며 ④ 가 엔진 최상위로 싣는다. ① 폼 상태 ② initial ③ normalize ⑥ 사이드바 ⑫ Zod ⑭ route 는 **무변경**이다.

### 5.1 §164⑨ 입력 UI 현황 (② 양도정보 «양도 형태·원인» 카드)

| 입력 | 컴포넌트 | store 필드 | 노출 조건 |
|---|---|---|---|
| 양도원인 = 공익수용·협의매수 | `components/calc/transfer/TransferModeBlock.tsx` RadioCardGroup(`expr-cause-radio`) `:233` 에서 `ExpropriationBlock` 마운트 | `AssetForm.transferCause`(`"public_expropriation"`) · `transferType:"regular"` · `reductions[type==="public_expropriation"]` 프리필(`:109 selectMode`) | 항상 라디오 노출. 부담부증여와 3지선다 배타 |
| 공매·경락 토글 + 공매·경락가액 | `AuctionBlock.tsx`(84줄) `:243` 마운트(`!isExpropriation` 일 때만 = 1호와 배타 N3) | `isAuctionTransfer` · `auctionPrice` | `isAuctionEligibleAssetKind`(land·building·housing, `expropriation-scope.ts:152,158`) ∧ (`useEstimatedAcquisition` ∨ 의제취득일 전 ③ 후보) ∧ !`parcelMode` ∧ !`hasSeperateLandAcquisitionDate` ∧ 양도일 ≥ 2009-02-04(`AuctionBlock.tsx:60-66`) |
| 주택 보상액 총액 · 보상산정 기초 기준시가 총액 | `ExpropriationBlock.tsx` `showHousingTotal`(`:100`) · 렌더 `:320` | `housingCompensationTotal` · `housingCompensationBasisTotal` | `isHousingExprEligibleAssetKind` ∧ `exprDateOk`(= !parcelMode ∧ 양도일 ≥ 2009-02-04 ∧ 환산 또는 ③ 후보) ∧ !주택 regular split ∧ !겸용 |

- 컴패니언(함께 양도 2번째 이후)·지분 카드도 같은 `TransferModeBlock` 이다(`CompanionAssetCard.tsx:384` → `AssetSectionTransfer.tsx:102`) — 단건·함께 양도·지분 3경로가 한 컴포넌트.
- **화면 순서** ② 양도정보(수용·공매·보상액) → ③ 취득정보(본인 신축 토글 → 건물분 카드): 사용자는 §164⑨ 입력을 **먼저** 하고 건물분 카드를 **나중에** 본다 = 계산 순서(분모 확정 → 건물분 안분). **순서 변경 불필요.**
- ⑧ 실행 순서(`transfer-tax-validate-asset.ts:115~`): `validateAuctionAsset`(:203) → `validateHousingExprAsset`(:207) → … → `validateAssetAcquisition`(:360 안 `validateSelfBuiltHousing` = `transfer-tax-validate-acquisition.ts:712`). 보상액·공매가가 먼저, 건물분 칸이 나중 — 화면 순서와 같다.
- 게이트 사실: ⑧ `validateHousingExprAsset`(`isExprHousingTotalRequired`, `expropriation-required-gate.ts:137`)·`validateAuctionAsset`(`exprAuctionGate`, `:123`)는 **환산(또는 ③ 후보) ∧ 양도일 ≥ 2009-02-04 ∧ !parcel ∧ !주택 regular split ∧ !겸용** 일 때 값을 필수로 요구한다. ⑫ 도 같은 술어(`transfer-tax-schema-required-refines-2a.ts`). **감정이면 `useEstimatedAcquisition` 이 꺼져 있어 보상액 칸이 화면에 없고 ⑧ 도 요구하지 않는다**(`convertsAtAssetLevel` 거짓).
- 귀결: 일체 주택 본인 신축 **환산** × §164⑨ 에서 §164⑨ 입력 3종은 이미 ⑧ 필수·④ 전송이다 → 카드를 열어도 **추가 입력이 없다.**

### 5.2 카드 (`SelfBuiltHousingShareBlock.tsx`, 127줄) — 열릴 때 추가 칸

현재 카드가 받는 값: 환산 (가) 취득 당시 토지 ㎡당 공시지가·건물 기준시가(+면적 `acquisitionArea`) · (나) 양도 당시 토지·건물 기준시가 + 양도가액 구분(`LandBuildingSaleSplitSection`) / 감정 건물 감정가액 직접 1칸 또는 «구분 표시 없음» 토글 → 취득 3칸. ④ 와이어 `lib/calc/transfer-tax-api-self-built-housing.ts:buildSelfBuiltHousingPayload`. 주택공시가격 H·H_T 는 카드 밖(② 양도정보·③ 취득정보)에서 받는다.

| 안 | 카드 추가 칸 | 근거 |
|---|---|---|
| (가) | **0** | H_T′ 를 만드는 보상액·기초·경락가가 모두 기존 ②/④ 입력. L_T·N_T 는 카드 (나)의 기존 칸 |
| (나) | **0** | 건물분 base 에 토지분 특례 값은 필요 없다. 토지분 보상액을 따로 받는 칸(`splitLand*` 계열)은 양도차익 쪽 문제 — 주택 regular split × 공익수용이 이미 미지원 차단(`validateSplitLandExprAsset` C-06b, Q6, `transfer-tax-validate-expropriation.ts:210-225`) |

**카드 안내 1문단(칸 아님)**: 환산 ∧ §164⑨ 일 때만 기존 amber `ToneCard`(«건물분만 가산세 대상입니다») 본문에 한 문단. 판정은 UI 가 재판정하지 않고 `selfBuiltHousingScope` 반환의 `sec164_9?: "expropriation" | "auction"` 를 읽는다(엔진 판정과 한 곳 — 원 플래그로 `scope` 안에서 계산, 카드는 `scope.sec164_9` 만 본다).
- 1호: «공익수용 특례가 적용되어 양도 당시 주택공시가격은 ② 양도정보에서 정한 특례 금액(개별주택가격·보상액·보상산정 기초 기준시가 중 가장 작은 금액)을 씁니다. 별도 입력은 필요하지 않습니다.»
- 2호: «… (개별주택가격·공매·경락가액 중 작은 금액) …»
- ((나)안이면 «건물분은 특례를 적용하지 않고 …» — 확정 후.) 새 입력이 없는데 사용자가 «보상액을 여기서도 입력해야 하나» 오해하기 쉬워 안내가 필요하다(Q-6).

### 5.3 UI 술어 변경 (3중 패턴 — ⑤·⑧·④ 가 같은 함수)

`self-built-housing-scope.ts`: **5a** `:76-77` 두 줄을 `method === "estimated"` 일 때만 닫음 → **5b** 두 줄 삭제(+ 미사용이 된 `isAuctionEligibleAssetKind` import 제거, 파일 머리 주석 `:14-15` 현행화). 환산·감정 플래그 동시 잔재 셀은 PR-4 가 `primaryAcquisitionModeFlags`/`companionEstimatedWins` 로 술어를 ④ 와 맞췄다 — §164⑨ 판정이 «방식 = 환산일 때만» 이 되는 5a 에서는 **방식 결정(`:73`) 이후**에 판정해야 한다(순서가 바뀌면 잔재 셀에서 불일치). ④ `buildSelfBuiltHousingPayload`/`withSelfBuiltHousing` 과 ⑧ `validateSelfBuiltHousing` 은 술어를 그대로 읽으므로 **코드 무변경으로 자동 추종**한다.

### 5.4 ⑦ 결과 4뷰 — 표시 정본 1파일

4뷰 모두 `lib/tax-engine/transfer-tax-self-built-display.ts`(120줄) 한 곳을 읽는다: `selfBuiltPenaltyView`(카드·상세명세서 집계·PDF) · `selfBuiltPenaltyBasisFormula`(상세명세서 자산별 줄) · `selfBuiltPenaltyFilingNote`(신고서 각주) · `resultSelfBuiltEchoes`(수집). 소비처: `SelfBuiltPenaltyCard.tsx` · `DetailedStatementFormulaBuilders.ts:197` · `DetailedStatementLateStages.ts:200-219` · `FilingFormTableHelpers.ts:692` · `FilingFormTableAggregateHelpers.ts:477` · `lib/pdf/ResultPdfTransferSections.tsx:94,382`. 어댑터는 echo 객체를 통째로 싣는다(`aggregate-pickers` 15종) → **echo 에 optional 필드를 더해도 어댑터 변경 없음**(가드 테스트는 «평가·판정 echo 15종» 개수를 세므로 중첩 필드 추가는 영향 없음).

표시 문구(한국어 풀어쓰기 · 변수 약어/`floor()` 금지 · `× (분자) ÷ (분모)` 괄호형 → `FormulaText` 분수), `selfBuiltPenaltyView` 환산 분기(`:56-66`)의 3번째 줄 앞에 한 줄:
- 1호: `양도 당시 주택공시가격 ${H_T′}은 영 §164⑨ 공익수용 특례에 따라 개별주택가격 ${H_T}·보상액 ${comp}·보상산정 기초 기준시가 ${basis} 중 가장 작은 금액입니다.`
- 2호: `… 개별주택가격 ${H_T}·공매·경락가액 ${auction} 중 작은 금액입니다.`
- 이어서 기존 줄 `양도 당시 주택공시가격 ${H_T′} = 토지분 ${tl} + 건물분 ${tb}` 그대로. 설명줄(`:66`) 끝에 «특례 총액도 같은 비율로 나눕니다» 한 문장.
- 신고서 각주·상세명세서 자산별 줄: 환산식 뒤 `(영 §164⑨ 공익수용 특례 적용)` 접미 한 마디. PDF 는 같은 `selfBuiltPenaltyView` 라 자동.
- 효과: 기존 특례 카드(`HousingExpropriationValuationCard`·`AuctionValuationCard`, `TransferTaxResultView.tsx:484-500`)의 «적용 양도당시 기준시가 ○○원» 과 본인 신축 카드의 «양도 당시 주택공시가격» 이 **같은 숫자**로 이어져 한 줄로 대조된다((나)는 두 분모가 달라 안내가 반드시 필요).

**고지(NOTICE)**: ① PR-4 `selfBuiltHousingFallbackNotice`(«자산 전체의 환산취득가액을 기준으로 5%를 계산했습니다 — 건물분 기준 여부는 확인 필요») — 환산·감정 모두 열면 **죽은 코드** → 5a 에서 감정분 제거(환산에서만 참), 5b 에서 함수·호출 삭제. `result.warnings` 에서 사라진다. ② PR-3 `NOTICE.estimated`(`transfer-tax-self-built-display.ts:34`)에 §164⑨ 변형 1개: «양도 당시 주택공시가격은 영 §164⑨ 특례 적용 금액을 사용했고 그 금액도 같은 비율로 나누었습니다 — 특례 총액을 토지·건물로 나누는 해석은 확인하지 못했습니다 — 확인 필요.» `Basis` 키 `estimated_sec164_9` 또는 `NOTICE.estimated` 함수화. **함정**: `NOTICE_HEAD`+`UNCONFIRMED` 가 말미를 공유한다 — 변형은 «확인 필요» 가 한 번만 나오게 한 문장으로 합칠 것(E2E SB-10 이 `document.body.innerText` 출현 **1회**를 단언, `e2e/transfer-self-built-housing-base.spec.ts`). 유리/불리/절감 표현 금지.

### 5.5 dead-end 0 · 저장 세션 · ⑧ 앵커

- **불변식**(PR-4 가 지킨 것, 격자 `__tests__/calc/self-built-housing-strict-parity.anchor.test.ts` D1~D4): «범위 안 ∧ ⑧ 통과 ⇒ 엔진이 던지지 않음 ∧ echo 있음; 범위 밖 ⇒ 키 없음 ∧ 엔진이 던지지 않음». (가) 에서는 §164⑨ 항이 **양쪽에서 동시에 사라져** 집합 동치가 자명해진다(UI 술어·엔진 `unreachableReason`·`missingInputDisposition` 어디에도 §164⑨ 가 없다). **D4(§164⑨ 셀 = 고지·키 없음)가 반대로 뒤집힌다**(scope 안 ∧ hasKey ∧ echo ∧ notice 0).
- 새 dead-end 후보 3개: ① 환산 ∧ 수용인데 보상액 비움 → ⑧ `validateHousingExprAsset` 가 먼저 막는다(칸이 화면에 있음) → 막다른 길 아님. 엔진은 직접 API 면 분모가 안 바뀐 채 건물분 계산(특례 미발동 = F-1 의 «엔진은 이미 계산 가능»). ② 2호 공매 ∧ 환산인데 `auctionPrice` 비움 → `exprAuctionGate` `"required"` → ⑧ 차단, 칸 있음. ③ 환산·감정 플래그 동시 잔재 → PR-4 가 이미 맞춤; 5a 의 «방식 = 환산» 판정은 방식 결정 이후.
- **저장 세션**: 폼 필드 무변경 → `migrateAsset`(③) 영향 없음. 기존 세션에 수용·공매 + 환산 + 본인 신축 + 건물분 칸 **비어 있음**이 저장돼 있으면 5b 후 카드가 새로 뜨고 ⑧ 이 처음으로 막는다(칸은 화면에 있음). PR-2 때 일반 환산·감정이 겪은 것과 같은 경로이며 Q-2(PR-4 확정)와 같은 취지다. IndexedDB 이력의 `resultData` 는 재계산하지 않으므로 옛 결과(고지 문구 포함)는 그대로 — 「열람 = 옛 계산, 재계산 = 새 입력 요구」(Q-9). echo 에 optional 필드를 더하는 것은 JSON-safe(Map·Date 없음).
- ⑧ 앵커: 새 `data-field` 없음. 재사용 — `selfBuiltBuildingAppraisal`(감정) · `standardPricePerSqmAtAcq`·`acquisitionArea`·`buildingStandardPriceAtAcq`(환산 취득) · `LandBuildingSaleSplitSection` 기존 앵커 · §164⑨ 입력 `housingCompensationTotal`·`housingCompensationBasisTotal`·`auctionPrice`.

### 5.6 영향받는 기존 테스트·E2E (실측으로 §164⑨ 를 «범위 밖/고지» 로 고정한 곳 — grep)

| 파일 | 위치 | 갱신 |
|---|---|---|
| `__tests__/calc/self-built-housing-scope.anchor.test.ts` | `:57-58` | 공익수용·공매 «범위 밖 null» 셀 → 감정은 5a 에 범위 안, 환산은 5b |
| `__tests__/components/self-built-housing-share-ui.anchor.test.tsx` | `:69` | «공익수용 특례 → 카드 없음» 갱신 + 환산 안내 문단 단언 |
| `__tests__/calc/self-built-housing-validate-parity.anchor.test.ts` | `:76-77` | «범위 밖이지만 route 가 입력을 요구하는 조합» 목록에서 제외 |
| `__tests__/calc/self-built-housing-strict-parity.anchor.test.ts` | EXPR 격자 `:53-57` · D4 `:143-152` · 정규식 `:114` | D4 뒤집기 + 보상액 미입력 셀(⑧ 차단) 추가 |
| `__tests__/calc/self-built-housing-ui-wiring.anchor.test.ts` | `:158` | 공익수용 셀 |
| `__tests__/tax-engine/transfer-tax/self-built-housing-strict.anchor.test.ts` | `[S3] :201-265` | fallback 고지 단언 블록 → 감정은 던짐/건물분, 환산은 건물분 |
| `__tests__/tax-engine/transfer-tax/self-built-housing-penalty.anchor.test.ts` | `[A]` 6셀 + `:450` | «§164⑨ 결합이 종전 수치 보존» 6셀 → 건물분 수치로 |
| `__tests__/api/transfer.route.self-built-housing-base.anchor.test.ts` | «없으면» 6곳 + `:89-91 EXPR` | 보존 수치(500,000,000 / 250,000,000 / 300,000,000 …) → 400 또는 건물분 |
| `__tests__/components/self-built-housing-penalty-results.ui.anchor.test.tsx` | 환산 단건/함께 양도/다건 | 환산 × §164⑨ 셀(문구·각주·PDF) 추가 |

E2E 중 본인 신축과 §164⑨ 를 동시에 쓰는 spec 은 **없다**(`e2e/` grep 0건). 인접 회귀: `transfer-housing-expropriation-total.spec.ts`(52줄) · `transfer-auction-clause2.spec.ts`(53줄) · `transfer-self-built-housing-base.spec.ts`(352줄, SB-1~12) · `transfer-companion-self-built-penalty.spec.ts` · `transfer-pre-deemed-expropriation.spec.ts`.

### 5.7 E2E 시나리오 초안 (수치는 엔진 anchor 에서 실측 후 고정 — 지금 적지 않는다)

시드 베이스는 `transfer-self-built-housing-base.spec.ts` 의 `asset()`/`seed()`.

| ID | 시나리오 | 단언 |
|---|---|---|
| SB-13 | **감정 × 공익수용**(5a) | 건물분 카드 노출 → 건물 감정가액 입력 → body 에 `selfBuiltHousing.buildingAppraisalValue` · 경고 카드에 «§164⑨ … 확인 필요» **0건** · 가산세 = 건물 감정가액 × 5% · 보상액 총액 칸은 **화면에 없음**(`getByText("보상산정 기초 기준시가 총액")` count 0) |
| SB-14 | **감정 × stale 공매**(5a) — 환산+공매 입력 후 감정으로 변경 | 카드가 닫히거나 엔진이 분기하지 않는다(방식 = 환산일 때만 §164⑨) |
| SB-15 | **환산 × 공익수용**(5b) — 보상액·기초 입력 | 카드 노출 + 환산 안내 문단 · body 에 최상위 `housingCompensationTotal`·`housingCompensationBasisTotal` 과 `selfBuiltHousing` 5값 동시 · 결과: 특례 카드의 «적용 양도당시 기준시가» 와 본인 신축 카드의 «양도 당시 주택공시가격» **같은 숫자** · 고지 1회 · PDF/신고서 각주(전체 선택 후 인쇄 emulate) |
| SB-16 | **⑧ 차단 순서** — 환산 × 공익수용에서 보상액 비움 | «다음» 막힘 → 포커스가 `housingCompensationTotal` → 채우면 건물분 카드의 첫 빈 칸 → 통과 |
| SB-17 | **환산 × 공매** | SB-15 + `AuctionValuationCard` |
| SB-18 | **함께 양도 자산 2** 환산 × 공익수용 | `companionAssets[0].selfBuiltHousing` + `housingCompensationTotal` · 자산 2 결과 카드 산식 |
| SB-19 | **구별력(stale)** — 공익수용 ON → 일반 양도로 되돌림 | 카드 유지(값 보존), 환산 안내 문단만 사라짐, 특례 카드 없음, body 에 `transferCause:"general"` · `housingCompensation*` 키 없음 |
| SB-20 | 375px 가로 스크롤 없음 + 안내 문단 라이트·다크 대비 4.5 이상 | `expectNoPageHScroll`, `expectLightContrast`/`expectDarkContrast`(SB-9 헬퍼) |
| SB-21 | **일부 양도 × 공익수용**(V-4 정리 후) | partial 안내 문구 · 척도 |

수동 확인(브라우저)은 headless 로 대체되지 않는다 — 완료 보고에 «수동 확인 미수행» 명시.

---

## 6. 경로 전수 · 세액 영향 · 저장 이력

| 경로 | (가) 처리 | 현행→수정 실측/산식 |
|---|---|---|
| 단건 정상(환산 × 수용/공매) | leaf 분모 교체(§4.2) | §3 표 A·B·C·D·E (A: 총납부 26,834,720 → 19,959,720) |
| 단건 손실(§114조의2②) | 같은 leaf — `loss-return.ts:107` 배선 변경 없음 | F: 11,000,000 → 4,125,000 |
| 지분(`ownershipRatio` < 1) | S 는 지분 스케일, H·보상액·기초는 물건 전체값 규약 — 같은 분모 | G: 10,836,100 → 7,398,600 (보상·기초 입력의 지분/전체 의미는 기존 §164⑨ 주택 총액 트랙의 규약, V-4) |
| 고가주택(1세대 1주택, 12억 초과분 과세) | base 와 무관(상위 §2.2 S-G) | K: 64,616,860 → 43,991,860 |
| 비과세(12억 이하 전액) | 가산세 단계 미도달 — 불변 | — |
| 미등기 | base 만 바뀜 | 구조 동일 |
| 함께 양도(컴패니언) | ④·⑭ 변경 없음(§164⑨ 키 도달 실측), 엔진 동일 leaf | 현행 333,333,333 / 16,666,666 → 산식 125,000,000 / 6,250,000 (Pre-Do 실측 필요) |
| 다건 합산 | 〃 (`multi/route.ts:202-212`) | 현행 200,000,000 / 10,000,000 → (가) 75,000,000 산식 |
| 감정(단건·컴패니언·다건) | 5a — 방식 한정 해제 | H: 16,500,000 → 6,050,000(직접)/6,187,500(비례); H2(S=10억 이익) 270,788,760 → 260,338,760 / 260,476,260 |
| 분리 계산(취득일 분리·소유자 분리·배율 초과분)·PHD | **제외** — 건물 파트가 축(PHD 는 이미 낮춘 분모, F-4) | 불변 |
| 겸용·부담부증여·증축·비주택 | 제외 | 불변 |
| 이월과세 `donorBuilt.housing` | 5c 조건부(Q-4) | 18,928,470 → 19,959,720 (+1,031,250) |
| 일반건물·상가 | 해당 없음 | 불변 |

**저장 이력**: `CalculationRecord.resultData` 스냅샷은 바뀌지 않는다. 재계산 시 5b 후 ⑧ 이 건물분 칸을 요구한다(§5.5). 이력에 앱 버전 구분 수단이 없어(상위 V-8) 한시 허용은 두지 않는다.

---

## 7. 14 동기화 지점 · ⑧↔⑫ 격자 · 3중 패턴

| # | 지점 | 5a 감정 | 5b 환산 | 근거 |
|---|---|---|---|---|
| ① 폼 상태 | 무변경 | 무변경 | 신규 필드 0 |
| ② initial | 무변경 | 무변경 | 〃 |
| ③ normalize | 무변경 | 무변경 | 〃 (`migrateAsset` 영향 없음) |
| ④ API 변환 | 무변경(술어 상속) | 무변경(술어 상속) | `buildSelfBuiltHousingPayload`/`withSelfBuiltHousing` 3곳(단건 `transfer-tax-api.ts:425`·컴패니언 `...companion-payload.ts:419`·다건 `multi-transfer-tax-api.ts:291`)이 술어를 읽음 |
| ⑤ UI 위젯 | 술어 한정(`method==="estimated"`) | 술어 2줄 삭제 + 카드 안내 1문단 | §5.3 |
| ⑥ 사이드바 합계 | 무변경 | 무변경 | 가산세는 합계에 안 들어간다(`lib/stores/transfer-per-asset-summary.ts` 에 `selfBuilt`/`가산세` 참조 grep 0) |
| ⑦ 결과 | 고지 감정분 제거 | echo `housingSplit.sec164_9` + 표시 정본 +~30줄 + 고지 변형 + `selfBuiltHousingFallbackNotice` 삭제 | §5.4 |
| ⑧ validate | 술어 상속 | 술어 상속 | `validateSelfBuiltHousing`(`transfer-tax-validate-self-built-housing.ts`, 63줄) |
| ⑨⑩ Zod enum | N/A | N/A | 신규 enum 없음 |
| ⑪ 자산-수준 acquisitionDate | N/A | N/A | |
| ⑫ Zod 입력 객체 | **무변경** | **무변경** | `refineSelfBuiltHousing` 은 §164⑨ 를 거르지 않는다(`transfer-tax-schema-self-built-housing.ts` 확인) — «받고 무시» 400 사유 집합 불변 |
| ⑬ body spread | 무변경 | 무변경 | §164⑨ 키는 이미 4곳 |
| ⑭ Route 엔진 input 매핑 | 무변경 | 무변경 | `engine-input.ts:71-76` · `bundled-split-helpers.ts:343-349` · `multi/route.ts:202-212` 에 §164⑨ 키 매핑 확인(grep) |

**⑧↔⑫↔엔진 정합 격자(구현 시 전수 대조)**: 차원 — 방식{환산, 감정} × 양도원인{일반, 공익수용} × 공매{F, T} × 보상값{없음, 불발(≥H_T), 발동(<H_T)} × 경로{단건, 컴패니언, 다건} × 손익{이익, 손실} × `selfBuiltHousing`{있음, 없음} × stale 플래그{없음, 감정에 공매 잔재}. 기대: **(i) scope 안 ⇔ ④ 키 실림 ⇔ ⑧ 요구**, (ii) scope 안 ∧ ⑧ 통과 ⇒ route 200 ∧ echo 존재 ∧ §164⑨ 고지 0, (iii) scope 밖 ⇒ 키 없음 ∧ 엔진이 던지지 않음, (iv) `selfBuiltHousing` 부재 ∧ 게이트 개방 ∧ 분리 아님 ⇒ 엔진 400(직접 호출), (v) ⑫ 400 사유 집합 불변. PR-4 격자(5,619셀)의 EXPR 축 확장.

**3중 패턴**: 신규 UI fallback 이 없어 «display fallback ↔ ④ ↔ ⑧ 불일치» 유형이 생길 수 없다 — 술어 하나(`selfBuiltHousingScope`)가 ⑤⑧④ 를 모두 정하는 구조(PR-2)가 이미 3중 패턴이다. 이번 변경은 그 술어에만 닿으므로 **8번째 동기화(⑧)는 술어에서 자동 상속**한다. `useEffect → store` 미러링 없음.

---

## 8. 파일 줄 수 (800줄 정책) — `wc -l` 실측 (2026-10-23)

| 파일 | 현재 | 예상 | 비고 |
|---|---|---|---|
| `lib/tax-engine/transfer-tax-self-built-housing-penalty.ts` | 262 | ~245 | 5b: fallback·고지·분모 거부 삭제(−~35), 분모 교체·echo(+~20) |
| `lib/tax-engine/transfer-tax-normal-return.ts` | 245 | −3 | 고지 호출 삭제 |
| `lib/tax-engine/transfer-tax-loss-return.ts` | 227 | −4 | 〃 |
| `lib/tax-engine/types/transfer-self-built-housing.types.ts` | 80 | ~92 | echo `sec164_9` |
| `lib/tax-engine/transfer-tax-self-built-display.ts` | 120 | ~150 | 문구 +~30 |
| `lib/calc/self-built-housing-scope.ts` | 87 | ~85 | 술어 2줄 삭제 + `sec164_9` 반환 |
| `components/calc/transfer/SelfBuiltHousingShareBlock.tsx` | 127 | ~140 | 안내 1문단 |
| `lib/tax-engine/transfer-tax-carryover-donor-penalty.ts` | 436 | ~440 | 5c |
| `components/calc/results/transfer/FilingFormTableHelpers.ts` | **730** | +~2 | **750 근접 — 각주 접미 1~2줄이라 안전, 줄 추가 시 `wc -l` 재확인** |
| `components/calc/results/transfer/DetailedStatementFormulaBuilders.ts` | 677 | +~2 | |
| `transfer-tax-finalize.ts` 658 · `expropriation-valuation.ts` 442 · `ExpropriationBlock.tsx` 442 | — | 무변경 | |

800 초과 예상 파일 없음. 테스트 파일은 최대 458줄(`self-built-housing-penalty.anchor`) — 셀 추가 시 700 이하 유지.

---

## 9. PR 분할 · Pre-Do anchor · 회귀 0 격자 · 뮤테이션

### 9.1 PR 분할 (Q-3)
| PR | 내용 | 선행 |
|---|---|---|
| **5a** | 감정 × §164⑨ — UI 술어·엔진 fallback 을 «방식 = 환산» 한정, 고지 감정분 제거, 테스트 §5.6 감정 셀 갱신, E2E SB-13·14. **법리 무관 — Q-1 을 기다리지 않는다** | — |
| **5b** | 환산 × §164⑨ (가): 술어 2줄 삭제 · leaf 분모 교체 · fallback·고지 함수 삭제 · echo/표시/카드 안내 · 테스트 §5.6 · E2E SB-15~21 · **상위 계획 V-4/V-16 «종결» 기록** | Q-1 확정, 5a |
| **5c** | 이월과세 `donorBuilt.housing` 분모 정렬(출하 수치 변경) — Q-4 가 «정렬» 일 때만 | Q-1 (가), 5b |

### 9.2 Pre-Do anchor (구현 전에 먼저 작성·실행 — «현행 일치 예상» 금지)
1. **현행 고정**: A 200,000,000 / 10,000,000 / 총 26,834,720 · J 500,000,000 / 25,000,000 / 197,837,200 · H 300,000,000 / 15,000,000 · 컴패니언 333,333,333 / 16,666,666 · donor × 수용 56,250,000 / 2,812,500.
2. **F-1 현행 실패**: J 에 `selfBuiltHousing` 전송 → 현행 200 / 187,500,000 (분모 불변) — UI 술어가 닫고 있어 route 로는 불가(술어 anchor 가 null 을 고정 → 5b 에서 뒤집힘).
3. **신 산식 재현**: A (가) B_acq 75,000,000 · B_tr′ 120,000,000 · S_b 120,000,000 → 75,000,000 / 3,750,000 / 총 19,959,720 · C 187,500,000 / 9,375,000 / 180,649,700 · D 250,000,000 / 12,500,000 / 116,650,306 · E 62,500,000 · F 4,125,000 · G 7,398,600 · K 43,991,860.
4. **항등식**: 기준시가 비례 S_b 일 때 base ≈ 자산 전체 환산취득가액 × B_acq ÷ H (±1원; D: 249,999,999.75 vs 250,000,000).
5. **PHD 선례 고정**: 특례 없음 169,332,955 → 수용 212,343,526 (현행 코드로 이미 통과 — 회귀 고정용; 5b 가 PHD 를 건드리지 않음을 보증).
6. **단일 소스 항등**: `echo.housingSplit.transferHousing === (result.housingExpropriationValuationDetail?.denominator ?? result.auctionValuationDetail?.denominator ?? H_T)` — 정상·손실·컴패니언·다건 모두(`effectiveInput` 이 §164⑨ 키를 갖는지의 증명).
7. **감정**: 수용/공매 × 감정 → 직접 1.1억 5,500,000 / 비례 5,625,000, 양도차익 특례 유/무 동일, 고지 0, 부재 시 400.
8. **경계**: 보상액 = H_T 정확히 / H_T − 1 / 2009-02-03·2009-02-04 양도 / 보상액·기초 중 하나만 입력 / 보상액 0.
9. **donor**(5c): 현행 56,250,000 고정 anchor → 정렬 후 75,000,000.
10. **컴패니언·다건 route**: 키 도달 + (가) 산식 125,000,000 / 6,250,000 실측.

### 9.3 회귀 0 격자
기준선(master)과 수정 후를 **응답 전체 JSON sha256** 으로 대조(PR-4 의 5,619셀 하네스 확장 — 기준선 = 변경 파일을 `git show HEAD:` 로 임시 복원한 트리, cp 백업·md5 대조, `git checkout/stash` 금지). **기대 diff = {housing ∧ 본인 신축 ∧ 게이트 개방 ∧ (공익수용 ∨ 공매 ∨ stale 플래그) ∧ 환산|감정} 셀의 `penaltyBase·penaltyTax·localIncomeTax·totalTax·warnings·echo` 뿐.** PR-4 격자에서 §164⑨ 고지 셀 122개가 대상이고, 그 밖(비주택 · 증축 · 분리 · 부담부증여 · 겸용 · 실가 · 매매사례 · 5년 경과 · 상속 · 시행일 전 등)은 **응답 바이트 동일**이어야 한다. 5a 단독: 감정 셀 diff 만.

### 9.4 뮤테이션 계획 (백업 키 = label+file md5, 전 변경 파일 sha 전후 대조, 하네스 후 잔존 변형 확인)
(1) B_tr 를 H_T′ 대신 H_T → A 셀((나) 56,250,000) · (2) `conv` 호출 제거 · (3) 손실 경로 배선만 원 분모 → F 셀 · (4) 공매 분기(2호) 만 무시 → B 셀 · (5) echo `sec164_9` 누락 → 표시 anchor · (6) UI 술어 `:76` 복원 → 수용 셀 · (7) `:77` 복원 → 공매 셀 · (8) 엔진 `missingInputDisposition` 이 수용만 `none` → 격자 (iv) · (9) `:127` 분모 거부 복원 → A 셀 · (10) 5a 한정 해제(감정 stale 공매) → SB-14 · (11) `apportionByStdPrice` 의 land/building 뒤바꿈 · (12) 컴패니언 전용 `conv` 입력 누락 → 컴패니언 route · (13) 5c: donor 분모 원복 → donor anchor. 분기 쌍(이익/손실 × 1호/2호 × 구분 기재)을 갖춘 anchor 없이는 SURVIVED 가 나오는 전례(이월과세 PR-3 N02)를 반복하지 않는다.

### 9.5 검증 순서
`npx tsc --noEmit` → `npx vitest run __tests__/calc/self-built-housing- __tests__/tax-engine/transfer-tax/self-built-housing- __tests__/api/transfer.route.self-built-housing-base.anchor.test.ts __tests__/components/self-built-housing-` → `npm run test:transfer` → 격자 sha → 뮤테이션 → E2E(인접 spec + SB-13~21) → **브라우저 수동 확인**(폼 → 계산 → 결과, Network 탭 request body, 인쇄) — 계획 단계에서는 미수행.

---

## 10. 사용자 결정 Q (통합 — 엔진 조사 + UI 시니어 조사, 권장 ★)

| Q | 질문 | 선택지 · 수치 | 권장 · 근거 |
|---|---|---|---|
| **Q-1** | **환산 × §164⑨ 의 건물분 양도 당시 분모 B_tr** | **(가)** H_T′ × N_T ÷ (L_T+N_T) — A: 75,000,000 / 3,750,000 (총납부 26,834,720 → 19,959,720) · **(나)** H_T × N_T ÷ (L_T+N_T), 특례 무시 — 56,250,000 / 2,812,500 (→ 18,928,470) · **(다)** 현행 유지(자산 전체 + 고지) — 200,000,000 / 10,000,000. 특례 불발(C)이면 (가)=(나)=187,500,000 / 9,375,000 (−17,187,500) | ★ **(가)** — 문언(라목 단일 가액 차감) · 사용자 확정 비례 규칙의 재사용 · PHD 선례(F-4) · 양도차익과 같은 분모(UI: 두 카드의 숫자가 이어짐). (나)는 일반건물 §4-7 전제(나목 독립 가액)가 라목에 없고, (다)는 «해당 건물의» 문언을 넘는다. **정면 해석례 없음 → 결과·카드에 «확인 필요» 고지 유지**(V-1) |
| **Q-2** | **감정 × §164⑨ 를 지금 연다**(법리 무관 — 감정은 분모를 쓰지 않는다) | 연다: H·I 현행 300,000,000 / 15,000,000 / 16,500,000 → 직접 110,000,000 / 5,500,000 / 6,050,000 (−10,450,000)·비례 112,500,000 / 5,625,000 / 6,187,500 (−10,312,500) / 보류 | ★ 연다 — 양도차익 특례 유/무 동일 실측. stale 공매 플래그 함정도 같이 닫음 |
| **Q-3** | **PR 분할** | 5a(감정) → 5b(환산 (가)) → 5c(donor, 조건부) / 단일 PR / 5b 만 | ★ 분할 — 5a 는 Q-1 과 독립이라 즉시 가능하고, 5c 는 출하 수치가 바뀌어 별도 승인 단위. Q-1 이 즉시 확정되면 5a+5b 병합도 가능(5a 의 «방식 한정» 이 5b 에서 사라지는 임시 변경 ~10줄을 아낀다) |
| **Q-4** | **이월과세 × 증여자 신축 일체 주택(`donorBuilt.housing`) 정렬**(F-3: 조용히 (나)) | 정렬((가)): 56,250,000 / 2,812,500 → 75,000,000 / 3,750,000 (총납부 18,928,470 → 19,959,720, **+1,031,250 — 출하 수치 상승**) / 현행 유지 + 주석·anchor 로 의도 고정 / 보류 | ★ 정렬 — 같은 조문·같은 B_tr 규칙이 경로마다 갈리면 안 됨. 단 **출하 수치를 올리는 변경**이라 Q-1 확정 후 별도 승인. Q-1 이 (나)면 현행이 곧 정합(주석·anchor 만) |
| **Q-5** | **입력 부재 처리**(직접 API · 저장 세션) | 5b 후 §164⑨ 셀도 PR-4 와 같이 **엔진 400 + ⑧ 차단** / 수용·공매만 종전 base + 고지 유지 | ★ 400 + ⑧ 차단 — PR-4 확정 Q-2 의 연장. fallback 이 사라져 «고지 함수» 가 죽은 코드 |
| **Q-6** | **환산 × §164⑨ 안내** | 카드에 안내 1문단 + NOTICE 변형 1개(«확인 필요» 한 번) / 안내 없음 | ★ 안내 — 새 칸이 없는데 «보상액을 여기서도 입력해야 하나» 오해하기 쉽다. 유리/불리 표현 금지 |
| **Q-7** | **특례 불발(H_T′ = H_T)에서도 echo `sec164_9` 와 안내 줄을 싣나** | 기존 특례 카드 노출 조건과 같게(detail 존재 시) / 발동(H_T′ < H_T)일 때만 | ★ 기존 조건과 같게 — 결과 화면의 두 카드가 같은 시점에 뜬다 |
| **Q-8** | **일부 양도(`partial`) × 공익수용**(H_T 전체 vs 보상액 수용분 척도 — V-4) | 이 계획 범위 밖으로 두고 «확인 필요» 만 기록 / 5b 전에 선차단 | ★ 범위 밖 — (가) 는 H_T′ 를 양도차익과 같은 분모로 쓰므로 §164⑨ 주택 총액 트랙의 척도 규약이 어떻게 정해져도 가산세 base 가 정합. 그 트랙 자체의 질문은 별건 |
| **Q-9** | **저장 세션·이력 안내** | 별도 안내 없음 / 이력 열람 시 «옛 계산» 배지 | ★ 안내 없음 — PR-2 와 동일, 이력 앱 버전 구분 수단 없음(상위 V-8) |

---

## 11. 미확인·검증 레지스터

| ID | 항목 | 상태 |
|---|---|---|
| V-1 | 일체 주택의 §164⑨ 차감 후 가액(H_T′)을 토지·건물로 나누는 **정면 해석례·판례** | **확인 필요** — `ntsCgmExpc` 7건 전부 토지 사안, `moefCgmExpc`·키워드 검색 0건, 판례 7건 본문 제공 불가. 근거는 문언 + 이월과세 Q-2 + PHD 선례 |
| V-2 | KoreanLaw MCP 연결 실패(`UND_ERR_CONNECT_TIMEOUT`) — 본문은 DRF 직접·캐시·국세법령정보시스템으로 대체 | 인용 verbatim 은 위 경로에서 확인 완료. MCP 복구 후 `npm run verify:legal` 로 재확인 권장 |
| V-3 | 시행규칙 §80⑧(보상기초 = «해당 토지의 개별공시지가»)과 주택 라목 «보상산정 기초 기준시가 총액» 입력(P5)의 정합 | **기존 설계(P5, 사용자 확정) 쟁점 — 이 계획은 재론하지 않음.** 상위 §164⑨ 계획 :749 «토지-only 명문 부재 → 자동 합성 금지·사용자 명시 입력» |
| V-4 | 일부 양도·지분 양도에서 H_T(물건 전체)와 보상액·기초(수용분 또는 전체)의 척도 — UI 조사: 카드는 L_T 를 «취득 당시 전체 면적»으로 구해 H_T 와 맞추는데(상위 V-3) 보상액은 수용분일 수 있음 | **확인 필요** — 기존 §164⑨ 주택 총액 트랙에도 같은 질문. Q-8 |
| V-5 | 2009.02.04. 이전 양도분 §164⑨ 구법 문언 | 범위 밖 — 상위 §164⑨ 계획 X3(별건 확정). 이 계획은 현행 문언·2009.2.4. 이후 양도 전제 |
| V-6 | 시행령 §164⑨ 의 직접 위임 근거 조문(소득세법 §99③ 이 후보) | **확인 필요** — 법 §99③ 은 «기준시가 산정에 필요한 사항» 을 대통령령에 위임하나 ⑨ 를 호별로 지정하지 않음 |
| V-7 | 컴패니언·다건의 (가) 수치(산식 값) | **확인 필요** — Pre-Do route 실측 |
| V-8 | 환산·감정 플래그 동시 잔재(`acquisitionMethod` 와 `useEstimatedAcquisition` 불일치) 셀에서 5a 의 엔진 판정(`acquisitionMethod === "estimated"`)이 UI 방식(플래그 파생)과 같은지 | **확인 필요** — PR-4 격자의 잔재 셀을 5a 에서 재실행 |
| V-9 | 브라우저 수동 확인(폼 → 계산 → 결과 → 인쇄), Playwright 실행 | 계획 단계 미수행 |
| V-10 | 상위 계획 V-4·V-16 | 이 계획 5b 완료 시 «종결» 로 갱신 |

---

## 12. 자가 점검

- [x] **useEffect → store 미러링 금지**: 신규 쓰기 0(폼 필드 무변경). 술어 변경은 읽기 전용 함수.
- [x] **자동 안분 fallback 금지**: (가) 의 비례는 사용자가 입력한 필수 칸(L·N·L_T·N_T)과 사용자 확정 해석(이월과세 Q-2)으로만 수행하고, 빈 칸을 H 에서 역산·합성하지 않는다 — 비면 ⑧ 차단/엔진 400. H_T′ 의 재료(보상액·기초·경락가)도 사용자 입력. 기존 B-1 기각(주택 regular split 양도차익)과의 관계는 §3. 예외(PHD)에 의존하지 않는다.
- [x] **⑧ 동기화**: 술어 하나가 ⑤⑧④ 를 정하고 ⑫·엔진은 §164⑨ 항을 같은 PR 에서 함께 제거(5b)/좁힘(5a) — 한쪽만 바꾸는 중간 상태가 머지되지 않게 PR 경계를 둠. 구현 시 §7 격자 전수 대조.
- [x] **법령**: 인용은 법령명 + 법/령/규칙 + 조항호. 유리/불리/절감 표현은 수치 방향 서술 외에 쓰지 않음(UI 문구 금지 포함).
- [ ] 14지점 grep(⑫⑬⑭), anchor, tsc, vitest, 브라우저 확인 — Do 단계 항목(이번은 계획서만, 소스 수정 0).
