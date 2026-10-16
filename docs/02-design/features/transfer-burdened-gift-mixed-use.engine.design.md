# 겸용주택 × 부담부증여 (소령 §159 4부분 안분) — 엔진 설계

> 작성 2026-10-16 · **개정 R4(같은 날 — acquisition-cost-review 반영: F-1 ⑫ 스키마 모순 · F-2 부가세령 §64①1호 감정평가 단서 · V-B~V-F, §11)** · R3(같은 날 — UI 설계서 R2 불일치 7건·RES-1~7 회신, §10)** · R2: — V-1 해소(부동산거래관리과-119 원문 반영) → **채무 귀속 축 신설(D-7, §3.1A)** · UI 설계서 범위 정리(§9). 상태 **설계(Design)** — 구현·커밋 없음.
> 선행: `docs/00-pm/bg-redevelopment-presumed-and-mixed-use.plan.md` §2 (#2211 차단) · `burdened-gift-redevelopment-assets.engine.design.md`(β 선례) · `mixed-use-separate-acq-per-part.engine.design.md`(B1 seam 선례) · `docs/00-pm/one-house-exemption-fix.plan.md` L-10(겸용 12억 판정/산식 분리)
> 인용 규약: 법령=KoreanLaw MCP 현행 원문(2026-10-16 조회) · 코드=`file:line`(워크트리 실독) · 수치=**실측**(throwaway probe) 또는 **손계산** 표기. 확인 못 한 것은 「확인 필요」.
> 재제안 금지 준수: 상속×새 방식(K-6/K-7) · 조합원입주권×새 방식 · 재개발 완공APT×K-6/K-7 · 이월과세×신축·증축×감정가액은 이 문서에서 건드리지 않는다.

---

## 0. 결론 (한 장 요약)

| # | 결정(권고) | 한 줄 근거 |
|---|---|---|
| D-1 | **새 서브엔진을 만들지 않고, 겸용 엔진(`calcMixedUseTransferTax`)에 «부담부증여 seam»을 하나 얹는다.** 신규 leaf `lib/tax-engine/mixed-use-burdened-gift.ts`가 §159 값(B·C·B/C·4부분 양도가액/취득가액/필요경비·증여세)을 만들고, 오케스트레이터는 STEP 7.5 자리에서 B1 선례(`applyMixedPartAcq`)와 같은 방식으로 split을 갈아끼운다 | 겸용 엔진을 B(채무액)를 `transferPrice`로 먹이면 **양도가액 4부분 안분·보유기간·장특·비과세·중과·세율이 전부 기존 정본 그대로** 돈다. 모자라는 것은 (i) 취득가액·개산공제·실비에 ×B/C(귀속 축 도입 후에는 부분별 B_part/C_part), (ii) 12억 판정/안분 분모를 증여가액 C로 바꾸는 것 (iii) 주택/상가 양도가액 안분을 «채무 귀속»으로 덮어쓰는 것 셋뿐이다 (§3.1A, §3.2) |
| D-2 | §159 안분 위치 = **(b) 채무 상당 양도가액 B를 먼저 구해 4부분으로 안분**(양도가액), **취득가액·실비는 «법 §100② 4부분 안분 → 각 부분 ×B/C»**(split-first) | 4부분을 C로 먼저 나눠 부분마다 ×B/C 하면(A-first) 합이 B가 안 되어 마지막 부분 잔액 흡수 규칙이 따로 필요하고, 그렇게 맞춰도 B-first와 값이 다르다 — 무작위 2,000건에서 1,876건이 부분별 1~3원 다르다(§3.1 실측). 합계 불변식 Σ=B를 갖는 쪽이 기존 단건·겸용 규약(`feedback_floor_residual_absorption`)과 같다 |
| D-3 | **비과세·고가주택(12억) 판정과 §160① 안분 분모는 «증여가액 C» 기준(해석 B)** — 판정=전체 C(§154③ 본문일 때) 또는 주택분 C_h(단서일 때), 안분 분모=주택분 C_h. 양도차익은 B-slice(이미 ×B/C) | 단건 BG가 **채택한** 해석(근거 상태: 국심2007서2099만 이번 세션 본문 실독 · 국세청 5건은 기존 계획서 기재를 신뢰하고 이번에 재열람하지 않음 · 소법 §89①3호 «양도 당시 실지거래가액» 문언은 오히려 해석 A로 읽힐 수 있고 기준시가 모드의 직접 근거는 공백 — §11 V-C)을 겸용의 L-10(판정=전체·산식=주택분)과 결합한 것. **사용자 결정 Q-1**(해석 A와 세액이 갈린다 — §4 M-3: 15,447,499 vs 0) |
| D-4 | 데이터: **`BurdenedGiftInfo`는 확장하지 않고 그대로 재사용**, 4부분 기하는 `MixedUseAssetInput`에서 파생한다. BG info의 기준시가 4필드는 ④가 합계로 싣되(UI 설계 모델 A와 정합) 엔진은 «읽지 않고» 겸용 입력에서 재파생한다. 양도시 합이 어긋나면 fail-fast | `BurdenedGiftInfo`는 토지·건물 2부분 모델이라 4부분을 담으려면 필드 8개가 느는데, 4부분 기준시가의 정본은 이미 겸용 입력(`transferStandardPrice`·`acquisitionStandardPrice`)에 있다. 두 벌이 되면 «UI 통과·엔진 침묵 오답»이 생기므로 양도시 합 일치를 엔진이 검증한다 (Q-7, §3.5) |
| D-5 | **v1 지원 범위를 좁힌다**: 담보(§66)·임대(§61⑤) 평가가 C를 결정하는 경우 · PHD · 별개 취득 파트 모델(B1) · 보유 중 일부 용도변경 · 공익수용 · 공유지분 · 컴패니언 다자산 · **신축 취득(MB-15, R3)** · **의제취득일(1985.1.1.) 전 취득(MB-16, R4)** · **상속·증여 취득 + 토지 또는 건물 취득일 2005-04-30 전(MB-18, §163⑨ 단서 1·2호)** 은 **차단**(엔진 throw · ⑫ · ⑧ 같은 술어) | 각각 «C를 4부분으로 가르는 법정 규칙이 없거나» «개산공제 base가 별도 경로»라서 조용한 오답 위험이 있다 (§3.3·§3.4·§3.7) |
| **D-7 (R2 신설)** | **채무 귀속 축**: 인수 채무를 `주택 귀속 / 상가 귀속 / 구분 불분명` 3값으로 **필수 입력**(기본값 없음)받는다. 귀속분은 그 부분의 양도로, 불분명분은 주택·상가 증여가액 비율로 안분(을설 — **확인 필요**)해 부분별 채무비율 `B_h'/C_h`, `B_c'/C_c`를 따로 둔다. 각 부분 `B' ≤ C`를 검증한다. 전부 불분명이면 종전 균일 `B/C`와 **1원까지 같다**(M-10′ = M-1) | 부동산거래관리과-119(2010.01.22.) 회신 «구분이 분명한 경우에는 그 채무액이 속하는 주택 또는 상가의 양도로 보아 양도차익을 산정»(§2.3). 균일 `B/C` 전제는 이 해석과 충돌한다 |
| D-6 | 결과: `MixedUseGainBreakdown.burdenedGift?: MixedUseBurdenedGiftBreakdown`(= `Omit<TransferBurdenedGiftBreakdown,"perAsset">` + `perPart` 4부분 + `highValue` echo). `perAsset`를 토지/건물 합으로 흉내 내지 않는다 | `perAsset`을 읽는 UI 행이 101개(`components/calc/results/transfer/*`·`results/*.tsx` grep)이라 합계 흉내는 부분별 1~3원 어긋남(§3.1)을 가린다 |

**V-1 해소(R2)**: 겸용×부담부증여를 정면으로 다룬 국세청 해석례 **부동산거래관리과-119(생산 2010.01.22., 등록 2010.02.05.)** 원문을 확인했다(taxlaw.nts.go.kr 질의회신 상세를 Playwright로 열람, 링크 `https://taxlaw.nts.go.kr/qt/USEQTA002P.do?ntstDcmId=010000000000138440`). **이 해석례는 «채무가 한쪽에만 귀속되면 그쪽의 양도로 본다»고 답했으므로 초판의 «B/C를 4부분에 균일 적용» 전제가 틀렸다** → D-7·§3.1A로 설계를 바꿨다. 이 해석례가 답하지 않은 부분(불분명분의 안분 · 주택>상가 본문 경우 · 담보대출 귀속)은 «확인 필요»로 남겼다(V-17~V-19).

---

## 1. 현황 실측 — 왜 지금 막혀 있고, «0»의 정확한 원인은 무엇인가

### 1.1 차단 지점(재확인)

- ⑧ `lib/calc/transfer-tax-validate-bg.ts:112-117` `(1-a)` — 겸용이면 `fieldError("transferType", …)`.
- ⑫ `lib/api/transfer-tax-schema-refines.ts:308-319` — `propertyType === "mixed-use-house"` + `transferType === "burdened_gift"`(또는 레거시 `acquisitionCause`)면 `ctx.addIssue`.
- 엔진 3층 게이트 중 하나인 `BURDENED_GIFT_SUPPORTED_PROPERTY_TYPES`(`lib/tax-engine/burdened-gift-eligibility.ts:32`)에는 `mixed-use-house`가 없다 — 겸용은 이 게이트를 지나지 않고 `app/api/calc/transfer/route.ts:535` 5-a-2 분기로 간다.
- 회귀 anchor: `__tests__/calc/bg-mixed-use-block.anchor.test.ts`(M-1~M-4).

### 1.2 «세액 0»의 원인 — 12억이 아니라 **미스케일 취득가액**이다 (실측)

차단 계획서(`bg-redevelopment-presumed-and-mixed-use.plan.md` §2)는 «양도가액 입력이 없어서 0»이라 적었다. 재현해 보니 정확한 원인이 다르다.

| 실험 | 입력 | 결과 |
|---|---|---|
| 기준선 | 일반 양도 15억 · 실지취득 7억 · 비1세대1주택 | 결정세액 **211,650,000** (재현 일치) |
| 차단 전 재현 | `transferPrice`=채무 6억(④ placeholder) + 실지취득 7억을 **B/C 스케일 없이** | 양도 6억 − 취득 7억 → **양도차손 → 결정세액 0** (`taxBase 0`) |
| 스케일 후 | 취득 7억 × 0.4 = 2.8억 | 결정세액 69,094,000 (프로토타입 69,094,001과 1원 차 — §3.1) |

즉 ④가 채무 합계를 `transferPrice` placeholder로 보내면 겸용 엔진은 그 6억을 «물건 전체 양도가액»으로 알고 7억 취득가액 전액을 차감한다. **고쳐야 할 것은 입력이 아니라 «취득가액·필요경비에 B/C가 안 걸린다»는 점**이고, 12억 판정이 증여가액 C가 아니라 B로 되는 것이 두 번째 결함이다(해석 A로 흐른다).

### 1.3 «B를 transferPrice로 먹이는 단순 어댑터»가 왜 부족한가 (실측)

겸용 엔진에 `transferPrice=B`(6억)만 넣고 **환산** 경로로 돌리면(기준시가 모드 C=12억, r=0.5):

| | 주택분 개산공제(토지/건물) | BG 정답(§159①1호 + 시행령 §163⑥) |
|---|---|---|
| 기존 엔진 | 7,500,000 / 1,500,000 | 3,750,000 / 750,000 (= 취득시 기준시가 × B/C × 3%) |

개산공제의 base가 «취득시 기준시가»인데 §159는 그것에 B/C를 곱하라고 하므로(`burdened-gift-apportionment.ts:422-458`의 STEP 5 «개산공제 base = 취득당시 기준시가 × 채무비율»), 기존 엔진을 그대로 쓰면 개산공제가 1/r배 과대다. 그래서 seam이 **개산공제·실비·취득가액**을 반드시 손봐야 한다.

---

## 2. 법령 축 (KoreanLaw MCP 본문 실독, 2026-10-16)

법령 MST: 소득세법 **280405**(공포 2025-12-23, 시행 2026-01-01·일부 2026-07-01) · 소득세법 시행령 **290841**(공포 2026-09-30, 시행 2026-10-01) · 상속세 및 증여세법 **276123** · 부가가치세법 시행령 **283641**.

### 2.1 조문 표 (verbatim 핵심 · 이 설계의 역할)

| 조문 | 핵심 문언 | 역할 |
|---|---|---|
| 소득세법 §88 1호 후단 | 「이 경우 대통령령으로 정하는 부담부증여 시 수증자가 부담하는 채무액에 해당하는 부분은 양도로 보며」 | 양도 = 채무액 부분 |
| **소령 §159①** | 「**1. 취득가액** = A × B/C — A: 법 제97조제1항제1호에 따른 가액(제2호에 따른 양도가액을 상속세 및 증여세법 제61조제1항·제2항·제5항 및 제66조에 따라 **기준시가로 산정한 경우에는 취득가액도 기준시가로** 산정한다) B: 채무액 C: 증여가액 / **2. 양도가액** = A × B/C — A: 상증법 제60조부터 제66조까지의 규정에 따라 평가한 가액」 | **A는 «자산별»** 값이다. 법문은 B/C를 **일률** 적용하라고 한다(채무가 주택·상가 중 어디에 귀속되는지는 묻지 않는다) |
| 소령 §159② | 「양도소득세 과세대상에 해당하는 자산과 해당하지 아니하는 자산을 함께 부담부증여하는 경우로서 … 채무액 = A × B/C (A: 총 채무액 B: 양도소득세 과세대상 자산가액 C: 총 증여 자산가액)」 | 겸용(주택·상가 모두 양도소득세 과세 자산)에는 걸리지 않는다 → 범위 밖. **그러나 입법 신호로는 귀속 축에 불리할 수 있다** — §159②(개정 2017.2.3.)는 총 채무를 «귀속»이 아니라 **과세대상 자산가액 비율**로 일률 안분하라고 정한다(2010 해석례 이후 입법). 귀속 축(D-7)의 근거는 해석례 하나뿐이고 §159②와 긴장 가능 → V-11 |
| 상증법 §61①·⑤ | ①1호 토지=개별공시지가 · 2호 건물=국세청 고시가액 · 3호 오피스텔·상업용건물=일괄고시 · **4호 주택=개별주택가격** / ⑤ 「사실상 임대차계약이 체결되거나 임차권이 등기된 재산의 경우에는 임대료 등을 기준으로 … 평가한 가액과 제1항부터 제4항까지의 규정에 따라 평가한 가액 중 큰 금액」 | 보충적 평가 A_i = 주택(개별주택가격 결합) / 상가토지 / 상가건물. ⑤는 **«임대된 재산» 단위** max → D-5 차단 근거 |
| 소령 §154③ | 「하나의 건물이 주택과 주택외의 부분으로 복합되어 있는 경우 … 그 전부를 주택으로 본다. 다만, 주택의 연면적이 주택 외의 부분의 연면적보다 적거나 같을 때에는 주택외의 부분은 주택으로 보지 아니한다」 | **본문**(주택>비주택)이면 건물 전부 주택 |
| 소령 §156②·§156① | ②「고가주택의 실지거래가액을 계산하는 경우에는 제154조제3항 본문에 따라 주택으로 보는 부분(이에 부수되는 토지를 포함한다)에 해당하는 실지거래가액을 포함한다」 | 고가 **판정** = 전체(본문일 때) |
| **소령 §160①** | 「법 제95조제3항에 따른 고가주택**(하나의 건물이 주택과 주택 외의 부분으로 복합되어 있는 경우와 주택에 딸린 토지에 주택 외의 건물이 있는 경우에는 주택 외의 부분은 주택으로 보지 않는다)**에 해당하는 자산의 양도차익 및 장기보유특별공제액은 … 양도차익 × (양도가액 − 12억원) / 양도가액」 | 고가 겸용의 **산식**은 주택 부분만 |
| 소법 §89①3호 | 「주택 및 이에 딸린 토지의 양도 당시 **실지거래가액**의 합계액이 12억원을 초과하는 고가주택은 제외」 | 부담부증여에서 «실지거래가액»이 C인가 B인가 → Q-1 |
| 소법 §95②·③·④ | ②표1(일반 보유 3년 6%~15년 30%) · 표2(1세대1주택 보유 12%~40% + 거주 8%~40%) / ③고가주택 양도차익·장특은 영으로 정한 바 / ④ 「보유기간은 그 자산의 취득일부터 양도일까지」(예외: §97의2①·가업상속) | 장특은 부분별(토지·건물) 보유연수. 증여자의 취득일~증여일 |
| 소법 §97①·② | ①1호 「가목 실지거래가액을 확인할 수 없는 경우에 한정하여 나목(매매사례가액·감정가액·환산취득가액)」 / ②1호 실지거래가액이면 «+ 자본적지출 + 양도비», ②2호 그 밖의 경우 «+ 자산별 대통령령 금액(개산공제)», 단서(환산이면 가목<나목일 때 나목) | K-4/K-5/K-6/K-7의 필요경비 구조 |
| 소령 §163⑥ | 토지 = 취득당시 개별공시지가 × 3/100(미등기 3/1000) / 건물 가목 = 「법 제99조제1항제1호 다목 **또는 라목(주택)** 의 가액 × 3/100」 | 개산공제 base = **취득시 기준시가**(주택은 개별주택가격 결합) |
| 소령 §163⑨ | 「상속 또는 증여(법 제88조제1호 각 목 외의 부분 후단에 따른 **부담부증여의 채무액에 해당하는 부분도 포함**하되 … ) 받은 자산에 대하여 … 상속개시일 또는 증여일 현재 상증법 제60조부터 제66조까지의 규정에 따라 평가한 가액을 취득당시의 실지거래가액으로 본다」 | 증여자가 상속·증여로 취득한 겸용의 A_i |
| 법 §100②·③ | ②「토지와 건물 등을 함께 취득하거나 양도한 경우에는 이를 각각 구분하여 기장하되 … 가액 구분이 불분명할 때에는 취득 또는 양도 당시의 기준시가 등을 고려하여 대통령령으로 정하는 바에 따라 안분계산한다. 이 경우 **공통되는 취득가액과 양도비용은 해당 자산의 가액에 비례하여 안분계산**한다」 / ③ 구분 기장가액이 안분가액과 100분의 30 이상 차이나면 불분명으로 본다(신설 2015.12.15, 개정 2024.12.31.) | 4부분 안분의 정본. ③은 토지·건물 별도 기장 입력이 없는 v1에 해당 없음 |
| 소령 §166⑥ | 「법 제100조제2항을 적용함에 있어서 토지와 건물 등의 가액의 구분이 불분명한 때에는 「부가가치세법 시행령」 제64조제1항에 따라 안분계산 하며 …」(개정 2026.2.27.) | 시가 총액의 4부분 분해 규칙 |
| 부가세령 §64①1호 | 「기준시가가 모두 있는 경우: 공급계약일 현재의 기준시가에 따라 계산한 가액에 비례하여 안분. **다만, 감정평가가액이 있는 경우에는 그 가액에 비례**하여 안분」 | **원문(MST 283641 실독)**: 「…기준시가에 따라 계산한 가액에 비례하여 안분 계산한 금액. **다만, 감정평가가액[…공급시기가 속하는 과세기간의 직전 과세기간 개시일부터 공급시기가 속하는 과세기간의 종료일까지 「감정평가 및 감정평가사에 관한 법률」에 따른 감정평가법인등이 평가한 감정평가가액을 말한다…]이 있는 경우에는 그 가액에 비례하여 안분 계산한 금액으로 한다.**」 ⇒ «법정 안분 = 기준시가 비율»이 아니라 **«감정평가가액이 없는 경우의 기준시가 비례»** 다. 부담부증여 시가 모드의 C는 감정가액인 경우가 많아 단서에 걸릴 가능성이 크다 → **신규 위험 증가**(V-4, Q-11) |
| 소령 §160① **후단** | 「이 경우 해당 주택 또는 이에 부수되는 토지가 그 보유기간이 다르거나 미등기양도자산에 해당하거나 **일부만 양도하는 때**에는 12억원에 해당 주택 또는 이에 부수되는 토지의 양도가액이 그 주택과 이에 부수되는 토지의 양도가액의 합계액에서 차지하는 비율을 곱하여 안분계산한다」 | 토지·건물 파트별 12억 안분. **엔진의 단일 비율 `(C_h−12억)/C_h`를 토지·건물에 같이 곱하는 것과 대수적으로 같다**: 파트 i의 12억_i = 12억 × C_i/C_h → `(C_i − 12억×C_i/C_h)/C_i = (C_h−12억)/C_h`(모든 i 공통). 따라서 `buildHousingPart`의 단일 `proratio`가 후단 규정을 이미 만족한다(float 오차 1원 이내 — M-12 «49,999,999 vs 5천만») |
| 소령 §156① | 「1주택 및 이에 딸린 토지의 일부를 양도하거나 일부가 타인 소유인 경우로서 실지거래가액 합계액에 양도하는 부분(타인 소유부분을 포함한다)의 면적이 전체 주택면적에서 차지하는 비율을 나누어 계산한 금액이 12억원을 초과하는 경우에는 고가주택으로 본다」(MST 290841 현행 실독) | **해석 B의 유추 보강(추론)**: 일부 양도의 12억 판정액 = (양도하는 부분 가액) ÷ (그 부분의 비율). 채무 상당 양도(B slice, 비율 B/C)를 «일부 양도»로 읽으면 `B ÷ (B/C) = C`가 되어 해석 B와 같다 — 이 문서의 지분 모드 `fractionalHighValueDenominator`가 같은 논리다. 단 문언의 비율은 «면적»이고 채무비율이 아니라서 **직접 근거가 아니다**(V-C) |

### 2.2 «2022.1.1. 이후 고가 겸용» — 근거 조문은 §154③이 아니라 **§160①**이다 (정정)

과제 문구는 «§154③(겸용 판정, 2022.1.1 이후 고가 겸용 단서 — 부칙 시행일 포함)»이었다. 실독 결과:

- §154③ 현행 문언은 2005.12.31.·2010.2.18. 개정만 표기돼 있고 **2022년 개정이 없다.**
- 2022.1.1.부터 달라진 것은 **§160①의 괄호**(주택 외의 부분은 주택으로 보지 않는다)다. 근거 부칙(`get_law_text mst=240685 부칙` 실독):
  - 부칙 <제30395호, 2020.02.11.> 제1조 3호 — 「제154조제7항제1호, **제160조제1항**, 제167조의5제1호 및 제168조의12제1호의 개정규정: **2022년 1월 1일**」
  - 같은 부칙 제42조 — 「**2022년 1월 1일 전에 양도한 자산**에 대해서는 제160조제1항의 개정규정에도 불구하고 종전의 규정에 따른다」
  - 12억 상향: 부칙 <제32420호, 2022.02.15.> 제8조 — 「제155조제10항, **제156조**, **제160조** 및 제161조의 개정규정은 **2021년 12월 8일 이후 양도하는 경우**부터 적용한다」
- 시행일 기준은 **«양도하는 경우»**다. 부담부증여에서 양도일 = 증여일(`transfer-tax-burdened-gift-step.ts` `giftDate: rawInput.transferDate`).
- 코드 대응: `lib/tax-engine/transfer-tax-mixed-use.ts:61` `MIXED_USE_EFFECTIVE_DATE = 2022-01-01`, `:84`에서 그 전 양도일은 `buildRejectionResult`. **BG도 이 거부를 그대로 탄다**(증여일 < 2022-01-01 → «단일 자산 모드로 재계산» 메시지는 BG에 맞게 고쳐야 한다 — 겸용 BG의 단일 자산 모드는 없다. §3.7 MB-1).

### 2.3 해석례·결정례 (DRF 검색 · 본문 확인 상태)

| 문서 | 주제 | 본문 확인 |
|---|---|---|
| **국심2007서2099 (2007.10.29. 기각)** | 고가주택 부담부증여 채무상당액 양도차익과세 기준 | ✅ **MCP 본문 실독.** 판단 (마): 「고가주택의 판정은 1주택의 전체 또는 그 일부이전, **부담부 증여 등 그 이전방식에 관계없이 1주택의 전체가액**이 … 초과하면 고가주택 … 고가주택 해당여부는 쟁점아파트의 **전체증여재산가액으로 판정**하고 동 증여재산가액을 고가주택의 가격으로 보아 부담부증여의 **채무상당액에 대하여 고가주택 과세분 양도차익을 산정**하여 **취득가액도 증여재산가액에서 차지하는 채무상당액 비율로 안분**계산한 처분청의 당초 처분은 잘못이 없다」(사실: 증여 9.5억·채무 6.6억·기준 6억 시대) → **해석 B의 직접 근거** |
| 서면인터넷방문상담4팀-1526(2004.09.24.) · -1499(2006.05.30.) · -2139(2005.11.11.) · 재산세과-4079(2008.12.04.) · 서면인터넷방문상담4팀-1692(2007.05.16.) | 1세대1주택 고가주택 부담부증여 | 제목·번호·일자만 이번에 재확인(DRF `domain=nts`). 요지는 기존 `transfer-tax-burdened-gift-phase2.engine.design.md:411-418`(2026-05-12)이 해석 B 근거로 인용 |
| **부동산거래관리과-119 (생산 2010.01.22.)** | **겸용주택의 부담부증여에 따른 양도차익 산정** | ✅ **원문 실독(R2).** **요지** 「부담부증여의 채무액에 상당하는 부분이 주택 또는 상가에 대한 부분으로 구분이 분명한 경우에는 그 채무액이 속하는 주택 또는 상가의 양도로 봄」 / **회신** 「부담부증여에 있어서 양도로 보는 부분에 대한 양도차익을 계산함에 있어 증여가액 중 그 채무액에 상당하는 부분이 주택 또는 상가에 대한 부분으로 구분이 분명한 경우에는 그 채무액이 속하는 주택 또는 상가의 양도로 보아 양도차익을 산정하는 것입니다.」 / **사실관계** 겸용(주택면적<상가면적), 상가 임차보증금 1억원, 주택 임차보증금 없음. 갑설=«1억원을 상가의 양도로 보아 양도소득세 계산», 을설=«전체 채무액을 1억원으로 보아 주택과 상가의 가액으로 안분» → **회신은 갑설 취지.** 한계: 주택<상가(단서) 사안 · **임차보증금만** 다룸 · «구분이 분명한 경우»만 답함 · 2010년(고가 겸용 §160① 괄호 도입 전) |
| 사전-2015-법령해석재산-0225 (2015.07.22.) · 서면-2022-부동산-0634[부동산납세과-747] (2022.04.06.) · 서면인터넷방문상담4팀-1628 (2004.10.14.) | 겸용주택 고가 판정·양도차익 | 제목만. 부동산납세과-747·법규과-3154(2023.12.19.)·법규과-3156(2024.12.18.)은 기존 `one-house-exemption-fix.plan.md` L-10(:459-464)이 원문 실독(taxlaw.nts) 후 요지를 적어 두었다 — BG를 다룬 건 아니다 |

---

## 3. 설계

### 3.0 현재 구조 (실독)

- 겸용 엔진: `calcMixedUseTransferTax(transferPrice, transferDate, asset, rates, amendment)` (`lib/tax-engine/transfer-tax-mixed-use.ts:77`). 파이프라인: 2022 거부(:84-88) → 비과세 판정(judge…) → STEP 2 양도가액 주택/상가 안분(:268, `apportionTransferPrice` — `transfer-tax-mixed-use-helpers.ts:101`, **float 비율 + floor**) → STEP 2.5 취득가액 총액 안분(:272) → STEP 3~4 주택 환산/양도차익(:279·:290) → 12억 판정 변수(:317-326, `wholeBuildingPrice = asset.totalPropertyTransferPrice ?? transferPrice`) → STEP 7-prep 상가(:328) → STEP 7.5 §97②2호 단서·B1 파트 모델(:366-421) → `buildHousingPart`(:458) … `buildTotalTax`(:588).
- B1 선례: `applyMixedPartAcq`(`lib/tax-engine/mixed-use-part-acq.ts:275`)가 «현행 환산 split(est) + 공통경비 split(exp, `swapToDirect=true`)»을 받아 파트별 값으로 갈아끼운다. 양도가액·보유기간은 est 그대로.
- 단건 BG: `buildBurdenedGiftBreakdown`(`burdened-gift-apportionment.ts:84`, 736줄) — C=`giftValuation.max`, B=`computeDebtRatio`, 양도가액=B−토지몫 잔액 흡수(STEP 3), 취득가액 4-way(STEP 4: :267), 개산공제 base=`apportionAcquisitionPrice(취득시 기준시가, B, C)`(STEP 5), 단서(STEP 5.5: :468), 증여세(STEP 6~7: :568-574). 12억은 `burdenedGiftDenominator`(`transfer-tax-burdened-gift-step.ts:186`)로 C를 싣는다.
- 단건 housing BG의 `landStdPriceAtTransfer`는 0이고 개별주택가격 전체가 `buildingStdPriceAtTransfer`에 실린다(`transfer-tax-api-burdened-gift.ts` housing 분기) — **단건에서는 2부분이 사실상 1부분**이다. 겸용은 토지·건물 취득일이 다를 수 있어 4부분이 필요하다.

### 3.1 §159 안분을 어디에 넣는가 — (a) vs (b), 정수 절사 probe

> **R2 주석**: 이 절의 `B`, `C`, `B/C`는 «채무 귀속 축»(§3.1A) 도입 전의 **균일 가정**으로 쓴 것이다. 귀속 축에서는 주택 2부분은 `B_h'/C_h`, 상가 2부분은 `B_c'/C_c`로 읽는다. 절사 순서(양도가액 B-first 체인 · 취득가액 split-first) 결론은 부분 단위로 그대로 유효하다(probe는 균일 가정 하의 4부분 체인 비교이며 부분별 비율에도 같은 산술이다).

두 방식:

- **(a) A-first**: 증여가액(시가 총액)을 먼저 기준시가 비율로 4부분 A_i로 나눈 뒤 부분마다 `floor(A_i × B / C)`.
- **(b) B-first**: 채무 상당 양도가액 B를 먼저 구해 4부분으로 체인 안분(주택/상가 → 토지/건물, `apportionByStdPrice` 잔액 흡수 — `std-price-apportion.ts:20`).

**실측(probe `p2`, 난수 고정시드 2,000건 — 기준시가 4부분 각 수천만~수억 · C 10~40억 · B 3억~(C−1억))**

| 비교 | 부분별 1원 이상 다른 건수 | 부분별 최대 차이 | 합계 |
|---|---|---|---|
| A-first vs B-first (양도가액 4부분) | **1,876 / 2,000** | **3원** | 둘 다 Σ = B 보존(A-first는 마지막 부분 잔액 흡수 전제) |
| 현행 겸용 float 방식(`Math.floor(B × 비율)`) vs B-first 정수 체인 | **0 / 2,000** | 0 | — |
| 취득가액: split-first(4부분 분해 후 부분마다 ×B/C) vs scale-first(총액 ×B/C 후 4부분 분해), 3,000건 | 2,946 / 3,000 | **2원** | 합계 차이 최대 3원 |

해석: 절사 순서는 **원 단위로만** 세액을 흔들지만 0이 아니다(§4 M-0에서 취득 hb 23,333,333 vs 23,333,334 → 결정세액 69,094,001 vs 69,094,000). 법문상 둘 다 가능하다(§159①2호는 «자산별 A × B/C»라 A-first가 문언에 가깝고, 합 = B는 법문이 요구하지 않는다). 그래서 **원칙을 하나로 고정**한다.

**권고 D-2**

1. **양도가액 = B-first 체인.** 근거: ① 합계 Σ=B가 구조적으로 보장 ② 겸용 엔진이 이미 `apportionTransferPrice(B)` + `calcHousingGainSplit`로 이렇게 나눈다 — **재구현 0**(float vs 정수 체인 불일치가 2,000건 중 0건이라 현행 float을 유지해도 값이 같다. 다만 12억 문턱 값 `C_h`는 아래처럼 **정수 체인으로 따로** 만든다) ③ 단건 BG STEP 3도 `토지몫 = floor(·)`, `건물 = B − 토지` 잔액 흡수다(`burdened-gift-apportionment.ts:178`·`:192-193`).
2. **취득가액 = split-first.** 증여자의 취득가액 총액(또는 파트 값)을 법 §100② 후문(취득시 기준시가 비례)으로 4부분 A_i로 나눈 뒤 **부분마다** `floor(A_i × B / C)`(= `apportionAcquisitionPrice`). 근거: 단건 K-4도 `landActual`/`buildingActual`로 먼저 나눈 뒤 각각 `apportionAcquisitionPrice`(`burdened-gift-apportionment.ts:317-318`). 취득가액은 합이 맞을 필요가 없다(양도가액처럼 «Σ=B» 불변식이 없다).
3. 부분별 개산공제 = `computeEstimatedDeduction(floor(취득시 기준시가_i × B / C), 3%(미등기 0.3%))` (단건 STEP 5와 같은 base 규약).

**각 방식이 쓰는 값 (12억·§160·비과세)**

| 판단 | 쓰는 값 | 근거 |
|---|---|---|
| 1세대1주택 비과세 «보유·거주 요건» | 증여자의 취득일~증여일, 증여자 세대 사실 | 기존 `judgeMixedUseOneHouseExemption` 그대로(BG 무관) |
| §154③ 본문 해당 | 면적(주택 연면적 > 주택 외) | 기존 `mainTextWholeHouse`(:317) |
| 고가주택 **판정**(12억) | **본문이면 전체 C**(`C_whole`), 단서면 주택분 `C_h` — «양도가액» 자리에 **증여가액** | 소령 §156② + 국심2007서2099 + L-10 |
| §160① **안분 분모** | **`C_h`**(주택 부분 증여가액) | 괄호 + 법규과-3156(간접) + 해석 B |
| §160① 안분 대상 양도차익 | **B-slice**(= 양도가액 B 몫 − ×B/C 취득가액 − 필요경비) 주택 부분 | 단건 `calcOneHouseProration(gain_burdened, …, C)` 와 같은 구조 |
| 장특 표1/표2 | 부분별 보유연수 · 주택분 거주연수 | 기존 `buildHousingPart` |

`C_whole`·`C_h` 산정: 시가 모드는 `C_whole = marketValueAtTransfer`, `C_h = apportionByStdPrice(C_whole, 주택 양도시 기준시가, 상가 양도시 기준시가).land`(체인 정수 — **감정평가가액이 없는 경우** 부가세령 §64①1호 본문 기준시가 비례 유추, Q-2·**Q-11**). 기준시가 모드는 `C_whole = Σ 4부분 양도시 기준시가`이고 `C_h`는 **시가 모드와 같은 식** `apportionByStdPrice(C_whole, 주택 양도시 기준시가, 상가 양도시 기준시가).land` 하나다(R3 통일 — 이때 `C_whole = Hs + Cs`라 결과가 `Hs`(개별주택가격)와 **정수로 정확히 같다**: 무작위 20,000건 불일치 0, 실측). 산식을 두 벌로 쓰지 않는다 기존 엔진 훅이 그대로 받는다: `asset.totalPropertyTransferPrice := C_whole`(→ `wholeBuildingPrice` :318 · 판정 base), `apportionment.wholeHousingTransferPrice := C_h`(`buildHousingPart`의 `highValueBase`, `transfer-tax-mixed-use-helpers.ts:328-329`). **공유지분 축과 같은 훅이라 BG×지분은 동시에 쓸 수 없다**(D-5에서 차단 — 훅 의미가 충돌한다).

### 3.1A 채무 귀속 축 (D-7) — 부동산거래관리과-119 반영

**법적 근거**: 소법 §88 1호 후단 «수증자가 부담하는 채무액에 해당하는 부분은 양도로 보며» + 소령 §159①(자산별 A × B/C) + 위 해석례(§2.3): 채무액이 주택 또는 상가에 속함이 분명하면 «그 채무액이 속하는 주택 또는 상가의 양도로 보아». 소령 §159 문언 자체는 «자산별»로 쓰므로 주택·상가를 서로 다른 «자산»으로 보는 한 모순이 없다 — §160①·§154③ 단서도 주택과 주택 외 부분을 구분한다.

**입력(필수·기본값 없음)** — `BurdenedGiftInfo.debtAttribution?: { housing: number; commercial: number; unallocated: number }`(겸용 전용, 원).
- `housing + commercial + unallocated` = `lendingDepositTotal + mortgageDebtAmount` (불일치는 MB-13).
- 비겸용에서 존재하면 ⑫가 거부. 겸용에서 **미입력은 오류**다(MB-13) — «전부 불분명»을 기본값으로 두면 법정 쟁점(을설)을 사용자가 모르는 채 고르는 것이다(`feedback_no_silent_apportion_fallback` 취지). 전부 불분명을 원하면 `unallocated = B`를 명시한다.
- 입력 UI 힌트: 임대보증금은 임차 대상이 분명하면 그 부분의 귀속이지만(해석례 사실관계) **주택·상가를 일괄 임대하면 «구분 불분명»** 이고 나누어 임대하면 나뉜다. 담보차입금은 건물 전체 근저당이면 «구분 불분명», 여러 건이면 건별 귀속이 다를 수 있다. UI가 항목(임대보증금·담보차입금)마다 «주택/상가/구분 불분명/나누어 입력»을 받아 `debtAttribution` 3값으로 합성하는 것은 엔진이 받는 계약 그대로다(엔진은 합성 전 3값만 본다 — R3 수용). 귀속 선언은 증빙(임대차계약서·근저당 설정 대상)이 필요한 **사실 주장**이라 `warnings`에 증빙 고지를 싣는다.

**산식** (정수, 잔액 흡수)
```
C_h = apportionByStdPrice(C, 주택 양도시 기준시가, 상가 양도시 기준시가).land ;  C_c = C − C_h      // §3.1 Q-2(α)
u_h = floor(unallocated × C_h / C) ;  u_c = unallocated − u_h                                          // 을설 (확인 필요 V-17)
B_h' = housing + u_h ;  B_c' = commercial + u_c                                                          // 부분별 «양도로 보는 채무액»
r_h = B_h'/C_h ;  r_c = B_c'/C_c      // 양도가액_i = B_part' 체인 안분(B-first) · 취득가액_i = floor(A_i × B_part'/C_part) · 개산공제 base = 취득시 기준시가_i × B_part'/C_part
```
- 균일 특수해: `housing = commercial = 0` → `B_h' = B·C_h/C`(floor 잔액 흡수), `r_h = r_c = B/C`. M-10′ = M-1 = 25,125,000(**실측 일치**).
- **검증**: `B_h' ≤ C_h` 그리고 `B_c' ≤ C_c`(부분 초과부담부 — 소득세법 §88 1호 후단·소령 §159①의 양도가액·취득가액은 A×채무액/증여가액이라 비율이 1을 넘으면 증여가액을 초과하는 부분까지 양도로 보게 되어 계산할 수 없다. 부분 단위(`B_h'/C_h`)에도 같은 산식을 쓰므로 같은 이유로 막는다. 해석례가 부분 초과를 직접 다루지는 않음 → V-18. ※ 상증법 §47③은 배우자·직계존비속 간 채무 인수를 «인수되지 아니한 것으로 추정»하는 규정이라 초과부담부의 근거가 아니다 — 종전 표현 정정), 합계 `B ≤ C`. 귀속분이 `C_part`를 넘거나 **불분명분을 안분한 뒤** 넘으면 오류(자동 재배분 금지 — M-14·M-15 실측: 오류 메시지는 «귀속 칸을 다시 입력»을 안내).
- **seam 변경**: STEP 2의 `apportionTransferPrice(B)`(주택/상가를 **기준시가 비율**로 가르는 것)를 BG에서는 **덮어쓴다** — `apportionment.housingTransferPrice := B_h'`, `commercialTransferPrice := B_c'`, `wholeHousingTransferPrice := C_h`(STEP 3~4의 `calcHousingGainSplit`/`calcCommercialGainSplit`이 이 값을 받는다). K-5 환산은 부분별 양도 몫에 대해 자연히 맞게 돈다(`B_h' × H_A/H_T`).

**이 축이 의미를 갖는 경우 (판단)**

| 경우 | 주택·상가 취급 | 귀속 축 효과 | 비고 |
|---|---|---|---|
| ① §154③ **단서**(주택 ≤ 상가) — 해석례 사실관계와 동일 | 주택 부분만 §89①3호 대상, 상가는 별개 과세 | **결정적** — 상가 귀속만이면 주택분 양도 0(M-8), 주택 귀속만이면 상가분 양도 0(M-9) | 해석례가 직접 답한 영역 |
| ② **고가 겸용**(본문 + C_whole > 12억, §160① 괄호) | 주택 부분만 12억 안분·표2, 상가는 별개 과세 | **결정적** — M-12(주택 귀속만: 4.5억 양도차익 중 1/9만 과세) vs M-12b(상가 귀속만: 상가분 전액 과세) | 해석례의 «주택 또는 상가»를 그대로 적용. 직접 답은 없음(2010년 — §160① 괄호 도입 전) |
| ③ **본문 + 비고가**(주택>상가, C_whole ≤ 12억 — 건물 전부 주택·전액 비과세) | 전부 주택으로 «본다» | 세액은 대부분 0이라 영향이 작다. **단 배율초과 비사업용토지분·나중 취득 토지 미달분은 과세**라 어느 부분의 토지가 양도되는지가 세액을 가른다 — M-16a(균일) 31,997,499 vs M-16b(상가 귀속만) 8,906,666 vs M-16c(주택 귀속만) 31,997,499 (**실측**) | **해석 I1/I2 아래, Q-8** |
| ④ 비1세대1주택(비과세 없음) | 주택·상가 모두 일반과세 | 부분별 보유기간·표1 동일이라 합이 같다(M-9′ = M-8 = 69,094,000). 주택분에만 걸리는 §104⑦ 중과·장특 배제가 있으면 귀속이 세액을 가른다 | 중과 가산·장특 배제는 주택 양도가 있을 때만 |

**③ 해석 선택지 (본문 + 비고가에서 귀속 구분을 적용할 것인가)**

- **I1(귀속 미적용·균일)**: §154③ 본문이 건물 «전부를 주택으로 본다»(법 §89①3호 적용 시)고 하므로 주택/상가 구분이 없다 → 균일 `B/C`. 근거: 해석례의 사안이 «주택<상가»라 본문은 답하지 않았고, 본문에서는 주택과 상가가 «하나의 주택»이다. 단점: 사용자가 선언한 귀속 사실을 무시하게 되어 입력이 의미 없음(3값 입력은 요구하되 무시).
- **I2(귀속 적용 — 권고)**: 귀속은 «양도로 보는 부분»이 **무엇인가**를 정하는 문제(소법 §88)이고 §154③ 본문의 «주택으로 본다»는 **비과세 적용 시**(법 §89①3호) 한정이다. 엔진은 이미 본문 경우에도 주택/상가를 나눠 계산하고 비과세만 의제한다(`exemptCommercialPartAsHouse`, OH-17). 근거: 엔진 모델과 일관 · 단일 규칙 · 입력을 무시하지 않음. **직접 해석례 없음 → 「확인 필요」** 고지를 `warnings`에 싣는다.
- 세액 차이는 M-16(배율초과 토지가 있는 경우)에서만 의미 있게 나타난다(일반 본문+비고가는 두 해석 모두 0 — M-13).

**양도 없는 쪽(귀속이 한쪽에만 있는 경우)의 처리**

| 항목 | 처리 |
|---|---|
| 양도가액·취득가액·개산공제·양도차익 | 해당 부분 **전부 0**(`transferred:false`). 환산(K-5)도 `0 × 비율 = 0` |
| 12억 판정·§160 비율(Q-1) | **양도하는 주택 부분이 있을 때만** 판정한다. `B_h' = 0` → 판정·안분·표2 모두 «해당 없음»(엔진 내부의 `isExempt` 플래그는 true로 남을 수 있으나 — M-8 실측 — 결과 echo는 `highValue.applicable:false`, 결과뷰는 «비과세»가 아니라 «이 부분은 양도 아님»으로 표시. 안 그러면 양도 없는 주택이 «비과세 양도»로 읽힌다) |
| 상가만 양도(단서·고가겸용) | 상가는 주택이 아니므로 **일반과세 슬라이스**: 표1 장특·누진세율·보유기간별 단기세율(M-8, M-12b) |
| 주택만 양도 | 판정 기준은 Q-1: 단서면 `C_h`, 본문이면 `C_whole`(판정) · `C_h`(안분 분모). 양도차익은 `B_h'` 슬라이스(M-9, M-12) |
| 장특·세율 | 양도 없는 부분의 소득금액 0 → `buildTotalTax` 합산 불변. 단기세율 파트도 0 소득이라 영향 없음 |
| §104⑦ 중과·한시 배제 고지 | **주택 양도가 있을 때만**(`burdenedGiftSurchargeSuspendedNotice`) |
| 증여세(수증자) | 불변 — 겸용 1건 `calcGiftTax(C, 채무 B 총액)`. 귀속은 양도소득세 쪽만 갈음한다 |
| 결과 echo | `debtAttribution`(입력 3값 + 안분 결과 `u_h`·`u_c`·`B_h'`·`B_c'`·`r_h`·`r_c`) · `perPart[*].transferred` · `highValue.applicable` |

> 담보평가·임대평가(Q-3)와의 관계: 귀속 축은 **부분별 임대 환산(`deposit_c + rent_c/12%`)** 을 가능하게 하는 입력 구조(상가 임차보증금의 귀속)를 이미 갖는다. 그러나 v1은 여전히 보충적평가가 C를 못 이기면 차단한다(§3.4). Q-3(β) 후속 설계가 열리면 이 축 위에 얹는다.

### 3.2 아키텍처 — seam

```
route 5-a-2 (⑭)
  └ buildMixedUseAssetInput({... burdenedGift: BurdenedGiftInfo})        // 단일 조립 leaf (mixed-use-asset-input.ts:134)
      └ calcMixedUseTransferTax(transferPrice /*무시, B로 대체*/, …)
          0) assertMixedBurdenedGiftSupported(asset, info)               // 신규 — MB-* 가드(엔진 throw · ⑫ · ⑧ 같은 술어)
          1) bg = prepareMixedBurdenedGift(asset, info, derived)         // 신규 leaf: B, C, C_whole, C_h/C_c, 귀속 안분 B_h'/B_c', 평가 선택(보충적 승 아님→throw)
          2) transferPrice := bg.B ; asset' = { …asset, totalPropertyTransferPrice: bg.C_whole }
          3) STEP 2 직후 apportionment 를 덮어쓴다 (R2):
             · housingTransferPrice := B_h' ; commercialTransferPrice := B_c' ; wholeHousingTransferPrice := bg.C_h
             STEP 3~7 을 그대로 실행 (est split — 양도가액 4부분·보유기간·기준시가 basis·취득 경로 A_i 는 여기서 나온다)
          4) STEP 7.5 의 자산단위 단서/B1 은 BG 일 때 건너뛰고
             applyMixedBurdenedGift({ asset, est, exp, bg })             // 신규 — B1 선례 (아래 표)
          5) buildHousingPart … buildTotalTax  (변경 없음)
          6) result.burdenedGift = breakdown ; steps.push(§159) ; 한시배제 고지(burdenedGiftSurchargeSuspendedNotice)
```

**왜 새 4부분 계산기를 통째로 쓰지 않고 est split을 재사용하는가** — 증여자의 취득 경로(매매 실가/환산/감정·매매사례/상속/증여)별 A_i를 이미 겸용 엔진이 4부분으로 만들어 낸다. 이를 BG 쪽에서 다시 구현하면 «취득 경로 두 벌»이 생긴다(`single-source-engine-helper`). seam은 **그 결과를 스케일**할 뿐이다.

**`applyMixedBurdenedGift`가 항목별로 하는 일** (est = 위 덮어쓴 `apportionment`로 돌린 split, exp = 공통경비 split `swapToDirect=true`). **표의 `B/C`는 부분별 비율로 읽는다**: 주택 2부분 `B_h'/C_h`, 상가 2부분 `B_c'/C_c`(§3.1A). 양도 없는 부분(`B'=0`)은 전부 0.

| 증여자의 취득 경로 → BG 모드 | est에서 읽는 A_i | 취득가액_i | 필요경비_i |
|---|---|---|---|
| 기준시가 모드(K-1~K-3, 괄호 발동) / 시가+담보 승(차단됨) | 취득시 기준시가 basis(`landStdPriceAtAcq`·`buildingStdPriceAtAcq`) | `apportionAcquisitionPrice(basis_i, B, C)` | 개산공제 `3% × floor(basis_i × B/C)` |
| 시가 모드 + **K-4 실지**(`useActualAcquisition`) | est 취득가액(§100②로 4부분 분해된 값) | `floor(A_i × B / C)` | 실비(자본적지출·양도비) — 입력을 `×B/C`한 뒤 est 규칙대로 분배(성질별 시점) |
| 시가 + **K-5 환산** | 환산은 `transferPrice=B`로 est가 이미 B-기준 값 | **est 값 그대로**(×B/C 없음) | 개산공제 `3% × floor(basis_i × B/C)`; 실비 입력 시 §97②2호 단서 비교(가목=Σ(환산+개산공제), 나목=실비×B/C) |
| 시가 + **K-6/K-7**(`useAppraisalSalesAcquisition`) | est 취득가액 | `floor(A_i × B / C)` | 개산공제 `3% × floor(basis_i × B/C)` (실비 미반영·단서 대상 아님) |
| 증여자가 **상속·증여로 취득**(`acquisitionByInheritance`/`ByGift`, §163⑨) | est의 `housingInheritedValue`·`commercialInheritedValue` 기반 4부분 | `floor(A_i × B / C)` | 파트 실비(`housingInheritedExpense`·`commercialInheritedExpense`)를 `×B/C` |

**근거**: 단건 STEP 4·5(`burdened-gift-apportionment.ts:267-364`·`:422-458`)와 항목별로 1:1 대응. 환산이 «×B/C 없음»인 이유는 단건에서도 `calculateEstimatedAcquisitionPrice(자산별 양도가액 B-slice, 취득시 기준시가, 양도시 기준시가)`라 이미 B 몫 위에서 환산하기 때문이다(`burdened-gift-apportionment.ts:360-364`).

> ⚠️ **K-5에서 주택은 «개별주택가격 결합 환산 후 토지/건물 분배»** 다(겸용 엔진 `calcHousingEstimatedAcq`). 단건 BG의 K-5는 토지·건물 각각 환산이다. 두 방식은 «토지:건물 기준시가 비율이 취득시와 양도시에 같을 때만» 일치한다. 주택의 기준시가는 개별주택가격(일괄 고시 — 소령 §163⑥2호 가목 «다목 또는 라목»)이라 결합 환산이 법 취지에 맞고 겸용 일반 양도와 같다. 단건 BG housing이 이미 «주택 전체 = 건물 1부분»으로 취급하는 것과도 일관된다 (V-5).

### 3.3 취득가액 — 지원/차단 매트릭스 (K-방식 × 겸용 취득 입력)

| 증여자의 취득 | BG 평가 모드 | v1 | 겸용 입력 소스(재사용) | 비고 |
|---|---|---|---|---|
| 매매·실거래가 | 시가+K-4 | ✅ | `bgActualAcquisitionTotal` → mixed `acquisitionActualTotalPrice`·`useActualAcquisition` | 4부분 분해=법 §100②(취득시 기준시가 비례 — 기존 `apportionAcquisitionPrice`) |
| 매매·환산 | 시가+K-5 / 기준시가 모드 | ✅ | mixed 취득시 기준시가 3필드(+나목) | 기준시가 모드와 C=Σ기준시가일 때 수학적 동치(§4 M-5 = M-7b 실측) |
| 매매·감정/매매사례 | 시가+K-6/K-7 | ✅ | `bgPresumedAcquisitionTotal` → `useAppraisalSalesAcquisition` | §114조의2는 겸용 입력 자체가 없다(V-6) |
| 증여자가 상속·증여 취득 | K-4 **고정**(상속개시일 상증법 평가액=실지거래가액 의제, 소령 §163⑨) | ✅ **엔진 한정** — UI P1은 차단(§9) | mixed 상속 필드(`housingInheritedValue`…). **BG에서는 reported 값 미입력 시 «보충적평가 자동 사용» fallback을 쓰지 않고 MB-11 오류**(자동 fallback 금지 — UI 설계서 Q-6 충돌의 엔진 쪽 해소) | **K-5/K-6/K-7 불허**(환산: 단건 ⑧ `isPostDeemedInheritance`와 같은 술어 · K-6/K-7: 재제안 금지 결정) |
| 증여자가 증여 취득 | 동상 | ✅(이월과세 아님) | mixed 증여 필드 | 이월과세(§97의2)는 겸용 입력에 없다 — 해당 시 차단 |
| 미공시 주택 §164⑦ (PHD) | — | ❌ MB-2 | — | PHD 개산공제 4곳이 별도 경로(`transfer-tax-pre-housing-disclosure.ts:158-264`) |
| 토지·건물 별개 취득 B1 | — | ❌ MB-3 | — | 파트별 모드 × B/C 결합은 별건(V-12) |
| 의제취득일 전 취득(< 1985-01-01) | — | ❌ MB-16 | — | 소령 §176의2④ 미구현(V-F) |
| 상속·증여 취득 + 취득일 < 2005-04-30 (deemed 경로) | — | ❌ MB-18 | — | 소령 §163⑨ 단서 1·2호 «큰 금액» 미구현 |
| 보유 중 일부 용도변경 | — | ❌ MB-4 | — | 취득시 구성이 시점별 |
| 공익수용 | — | ❌ MB-5 | — | 증여는 수용이 아님 |
| 공유지분·컴패니언 | — | ❌ MB-6 | — | `totalPropertyTransferPrice` 훅 충돌 · C 스케일 규칙 별건 |

**기준시가 모드와 C**: `C = giftValuation.max`. 보충적 평가가 이기는 경우만 v1이다.

> **엔진 가드(상한) ≠ UI 노출(부분집합).** 위 ✅는 «엔진이 정확히 계산할 수 있는 범위»다. 병렬 UI 설계서(`transfer-burdened-gift-mixed-use.ui.design.md` §3 X-5·X-6, Q-1·Q-6)는 P1 노출을 **단건·매매·단독소유**로 더 좁히고 상속·증여 취득을 P2로 미뤘다 — 상속·증여는 겸용 패널의 «미입력 시 보충적평가 자동 사용» 값과 BG K-4 총액이 같은 값을 두 곳에서 받는 정본 충돌이 있기 때문이다(그 fallback은 상증법 평가액을 쓰는 법정 값이므로 엔진은 허용하나, UI 정본 결정이 먼저). **엔진이 먼저 열리고 UI가 단계적으로 여는 순서가 안전하다**(엔진 가드를 UI 게이트보다 좁게 두지 않는다 — 3층 parity 격자에서 «UI 허용 ⊂ 엔진 허용»을 anchor로 고정).

### 3.4 «담보(§66)·임대(§61⑤)가 이기는 경우»는 v1 차단 (Q-3)

단건 엔진은 C = max(보충적, 담보, 임대)를 **물건 전체** 단위로 계산한다(`computeSangjeungbeopValuation` — `burdened-gift-valuation.ts:217`). 그러나 상증법 §61⑤는 **«임대차계약이 체결된 재산»** 단위 max이고 겸용의 상가만 임대 중이면 임대 환산은 상가 부분과만 겨뤄야 한다. 물건 전체 max를 그대로 쓰면 C의 4부분 분해 규칙(법정 규칙 없음)이 필요하고, 상가 임대보증금이 흔한 겸용에서 오답 위험이 가장 크다. 그래서 v1은 `selectedMode !== "supplementary"`이면 **throw(`INVALID_INPUT`) + ⑧ 사전 차단 + ⑫ refine**(같은 leaf 술어). 시가 모드에서 담보평가가 이겨 취득가액이 기준시가로 강제되는 경우(단건 `acquisitionStdForcedByCollateral`)도 포함해 차단한다.

### 3.5 데이터 모델 (Q-7)

**권고: D1′ — `BurdenedGiftInfo`를 그대로 쓰고 겸용 엔진 입력에 한 칸만 더한다.**

```ts
// types/transfer-mixed-use.types.ts — MixedUseAssetInput
burdenedGift?: BurdenedGiftInfo;   // 존재 = 부담부증여 모델 (B1 separateAcquisition 과 같은 «존재=모델» 규약)
```

| 선택지 | 내용 | 평가 |
|---|---|---|
| **D1′ (권고)** | 최상위 `burdenedGiftInfo`(이미 ⑬ `callTransferTaxAPI`가 싣는다 — `lib/calc/transfer-tax-api.ts:636`)를 route 5-a-2가 `buildMixedUseAssetInput`에 넘긴다. 읽지 않는 필드는 **⑫ refine이 거부** | 기존 ⑧(`refineBurdenedGiftInputs` — 시가 모드·산정방식·관계 필수)과 ⑫ 스키마가 **그대로 적용**되어 검증 두 벌이 안 생긴다. 단건과 K-방식 용어·필드가 동일(`actualAcquisitionTotal`·`presumedAcquisitionTotal`은 이미 단일 총액 형태) |
| D1 (확장) | `BurdenedGiftInfo`에 4부분 기준시가 8필드 + 4부분 K-4/K-6 값을 추가 | 필드 8~12개 증가, **겸용 입력과 기준시가가 두 벌**(한쪽만 고치면 침묵 오답). 기각 |
| D2 (겸용 전용) | `mixedUse.burdenedGift` strict 객체를 신설 | 가장 깨끗하나 `refineBurdenedGiftInputs`의 «transferType=burdened_gift ⇒ 최상위 burdenedGiftInfo 필수»(`transfer-tax-schema-required-refines.ts:107`)와 충돌 → 생성 규칙 분기 필요. 비용 대비 이득 작음. 대안으로만 보관 |

**R2 — D1′의 유일한 확장**: `BurdenedGiftInfo.debtAttribution?: { housing; commercial; unallocated }`(§3.1A). 겸용 BG에서 **필수**, 비겸용에서 존재하면 ⑫가 거부. 이 한 필드가 «신규 필드 0»(UI 설계서 §0·§6.1) 전제를 깬다 — 최소한 `AssetForm`에 임대보증금 귀속(주택/상가)과 담보차입금 귀속 선택이 필요하다(§9 후속).

**D1′에서 겸용일 때 기준시가 4필드의 취급 (UI 설계서 §2.1 모델 A·§6.2와 정합)**

- ④는 단건 housing 관행대로 **합계**를 싣는다: `landStdPriceAtTransfer = 0`, `buildingStdPriceAtTransfer = Σ(양도시 4부분)`(주택분 개별주택가격 + 상가토지 + 상가건물), 취득시도 같은 방식. 값을 계산하는 leaf는 ④·⑧·⑥이 **하나**(`lib/calc/burdened-gift-mixed-use-scope.ts` — UI 설계서 §5.1)다.
- 엔진은 이 4필드를 **계산에 쓰지 않는다.** 4부분 기준시가는 `MixedUseAssetInput`에서 `splitMixedUseHousingStd`·`multiplyByArea`로 재파생한다(정본 하나).
- 그러나 **양도시 합**(`land+building`)은 엔진이 재파생한 Σ와 **정확히 같아야** 한다 — 다르면 `INVALID_INPUT`(MB-12). 이렇게 하면 «④ leaf와 엔진 파생이 어긋나는 침묵 오답»이 생기지 않는다(3층 parity). 양도시 Σ는 `H_T + multiplyByArea(공시지가, 상가토지면적) + 상가건물`이라 ④에서도 정수로 정확히 재현된다. **취득시 합은 비교하지 않는다** — 토지·건물 취득일이 다르면(B0, 집행기준 99-164-9) 엔진이 쓰는 basis가 `convertedHousingTotal`(γ1)이라 H_A와 합이 달라질 수 있다(V-15).
- ⑫가 **거부**하는 값(겸용일 때): `actualLand/BuildingAcquisitionPrice` · `presumedLand/BuildingAcquisitionPrice`(분리 입력은 4부분 모델에 없다) · `carryoverDonorBasis` · `rightValuation` · `assumedDebtOverride` · `presumedExtensionAppraisalValue` · **`giftBuildingStdPriceAtTransfer`**(Q-6 — UI 설계서 Q-4도 겸용에서 숨김). `houseRosterInputUnavailable`은 허용(증여세 마법사 표식).

**결과 타입 (D-6)**

```ts
// MixedUseGainBreakdown 에 추가 (types/transfer-mixed-use.types.ts)
burdenedGift?: MixedUseBurdenedGiftBreakdown;

type MixedUseBurdenedGiftBreakdown =
  Omit<TransferBurdenedGiftBreakdown, "perAsset" | "debtRatio" | "convertedAcquisitionBeforeSwap" | "wholePropertySupplementary" | "fractionalHighValueDenominator" | "acquisitionStdForcedByCollateral" | "assetKind" | "rightValuationDetail" | "carryoverGiftTax" | "ownershipRatio"> & {
    perPart: Record<"housingLand" | "housingBuilding" | "commercialLand" | "commercialBuilding", {
      sangjeungbeopValue: number;      // A_i (평가가액)
      stdPriceAtAcquisition: number;   // 취득시 기준시가 basis
      stdPriceAtTransfer: number;
      transferPrice: number;           // = B 체인 몫
      acquisitionPrice: number;        // 필요경비 슬롯 정합: swap(직접) 채택 시 0
      estimatedDeduction: number;      // 개산공제 또는 실비 안분
      estimatedDeductionRate?: number; // 개산공제 경로에서만
      acquisitionMethod: TransferBurdenedGiftAcquisitionMethodUsed;
      /** R3 — §97②2호 단서(나목) 채택 전 환산취득가액(`acquisitionPrice`가 0이 되는 경우의 표시용) */
      acquisitionBeforeSwap?: number;
      /** R2 — 이 부분이 양도로 보는 채무액을 가졌는가(귀속 `B'>0`). false면 위 금액은 전부 0이고 «비과세»로 표시하지 않는다 */
      transferred: boolean;
    }>;
    /** 12억 판정/안분 echo — 결과뷰가 분모를 재도출하지 않게 한다 (feedback_engine_result_display_drift) */
    highValue: { applicable: boolean; judgmentBase: number; prorationBase: number; basis: "whole_building_C" | "housing_part_C" };
    /** R3 — `gratuitousPortion`(상속 아닌 증여분 = C − B 총액) 의미 유지: 증여세 과세가액 출발점이며 **양도 귀속과 무관**. `debtRatio`(단일)는 겸용에서 어느 부분의 비율도 아니므로 Omit하고 아래 `debtAttribution`의 부분별 비율을 쓴다 */
    /** R2 — 채무 귀속 (입력 3값 + 안분 결과). 전부 불분명이면 housing=commercial=0 */
    debtAttribution: { housing: number; commercial: number; unallocated: number; unallocatedToHousing: number; unallocatedToCommercial: number; housingDebt: number; commercialDebt: number; housingRatio: number; commercialRatio: number; housingGiftValue: number; commercialGiftValue: number };
  };
```

`TransferBurdenedGiftBreakdown`의 증여세·평가·채무비율 필드(`giftTax.besshi10Rows` 포함)는 **그대로 재사용**한다 — 증여세는 겸용 1건을 단일 `giftItem`(C, 채무 B)로 `calcGiftTax`에 넘기면 되고 부분 분해와 무관하다(`burdened-gift-apportionment.ts:571-640`). 이 블록(약 110줄)은 **함수로 추출**해 단건·겸용이 공유한다(두 벌 금지 + 단건 파일 736줄 → ≤700 착지, 800줄 정책).

### 3.6 14개 동기화 지점 (엔진·API 측 ④⑨~⑭ 중심 · 클라이언트 ①~③⑤~⑧은 UI 설계 위임)

| # | 지점 | 변경 | 비고 |
|---|---|---|---|
| ① 폼 상태 | `AssetForm` | **R2: 귀속 입력 필요**(임대보증금 주택/상가 분리 + 담보차입금 귀속 선택 → ④가 `debtAttribution` 3값으로 합성). 그 밖에는 `bg*` 재사용. Q-3(β)·Q-6 선택 시 추가 | `bgGiftBuildingStdPriceAtTransfer`는 겸용에서 숨김/무시 |
| ② initial | `calc-wizard-asset-factory` | R2: 귀속 필드 초기값(빈 문자열) | |
| ③ normalize | `calc-wizard-store` 마이그 | R2: 신규 귀속 필드 `=== undefined → ""`. 겸용+BG 전환 시 stale `standardPriceAtTransfer/Acq`가 ④로 새지 않게 ④에서 차단 | `feedback_ui_gate_removes_sole_input_path` 주의 |
| **④ API 변환** | `lib/calc/transfer-tax-api-mixed-use.ts:72` · `transfer-tax-api-burdened-gift.ts:260` | BG면 취득 플래그를 BG 모드에서 **파생**(K-4→`useActualAcquisition`+총액, K-6/7→`useAppraisalSalesAcquisition`+총액, K-5·기준시가→두 플래그 off). BG info의 기준시가 4필드는 **합계**로 싣는다(§3.5 — 양도시 합은 엔진이 검증). 공통 술어 leaf `resolveMixedBgAcquisition(primary)`와 UI 설계서 §5.1 `burdened-gift-mixed-use-scope.ts`를 **하나로 합쳐** ④⑤⑥⑧이 공유. **R2: `debtAttribution` 3값을 body에 싣는다** | 3중 패턴(display·API·validate) 동일 값 |
| ⑤ UI | `TransferModeBlock`(겸용 BG 허용 유지) · 취득 블록 | K-방식 라디오(`BurdenedGiftPresumedAcquisitionSection`)를 겸용에서도 사용. 차단 조합은 옵션 비활성+사유(단건 `bgPresumedBlock` 선례) | UI 설계서 별도 |
| ⑥ 사이드바 | `lib/stores/transfer-per-asset-summary.ts`(정본 — `computeTransferSummary`는 화면 소비처가 없다, `components/calc/CLAUDE.md:121`; R3 정정) | 겸용+BG: 양도가액=B, 취득가액=Σ4부분 | 결과 전엔 입력 추정, 후엔 엔진값 |
| ⑦ 결과 | 아래 §3.8 | | |
| **⑧ validate** | `transfer-tax-validate-bg.ts:112-117` | (1-a) **제거** 후 **«겸용이면» 분기**: MB-1~MB-14(§3.7) · 겸용 BG는 **`validateMixedUseBurdenedGift` 분기**(`transfer-tax-validate-acquisition.ts:357` 한 줄 + 신규 `lib/calc/transfer-tax-validate-mixed-use-bg.ts`)로 간다 — `validateMixedUseAsset`은 BG에서 화면에 없는 칸(`fixedAcquisitionPrice`·`useEstimatedAcquisition`·취득시 총액 안분 블록)을 요구해 막다른 길이다(`transfer-tax-validate-mixed-use-asset.ts:84` 총액 안분 블록 · `:135` 이하 환산 취득시 요구; R3 수용 — 초판의 «기준시가는 `validateMixedUseAsset` 소관» 철회). 새 분기는 공통(날짜·면적)·4부분 기준시가(양도시·취득시, **기존 술어 `isHousing*Required`·`isBuildingDayLandPriceRequired` 재사용**)·BG 입력(`validateBurdenedGiftAsset`)·MB-* collector(RES-1)를 호출만 한다. **R2: MB-13·MB-14 사전 차단**(C_h는 클라이언트에서 같은 leaf로 계산 가능) | UI 통과↔validate 차단 모순 금지 — 같은 leaf |
| ⑨ Zod enum 메인 | `transferType` (`lib/api/transfer-tax-schema-base-shape.ts:80` `z.enum(["regular","burdened_gift"])`) | 변경 없음(실독). 레거시 `acquisitionCause`에도 `burdened_gift`가 있다(:73) | |
| **⑩ Zod 컴패니언+refines** | `transfer-tax-schema-refines.ts:308-319` | 무조건 차단 → **MB-* 조건부 차단**으로 치환. 컴패니언 arm의 겸용×BG는 차단 유지(MB-6) | |
| ⑪ 자산-수준 acquisitionDate fallback | `mixedUse.landAcquisitionDate/buildingAcquisitionDate` | 변경 없음 | |
| **⑫ Zod 입력 객체** | `burdenedGiftInfoSchema`(`lib/api/transfer-tax-burdened-gift-schema.ts:10`) | **R4(F-1 정정): 스키마 필드를 추가한다.** 이 스키마는 non-strict `z.object`라 `debtAttribution`을 등록하지 않으면 **침묵 strip** → 엔진 MB-13이 모든 요청을 «귀속 미입력»으로 거부한다. `debtAttribution: z.object({ housing, commercial, unallocated: z.number().int().nonnegative() }).optional()` 등록(스키마상 optional — **겸용에서 필수는 refine/MB-13**, 비겸용에서 존재하면 거부). 같은 스키마를 컴패니언이 공유한다(`transfer-tax-schema-companion.ts:220`) → 컴패니언 arm에서 `debtAttribution`·겸용 BG는 MB-6으로 차단함을 anchor로 고정. `addPropertyRefines`에 MB-12(4부분 모델에 없는 필드 거부) refine 추가. 양도시 합 일치 검사는 엔진 소관(파생 Σ를 Zod가 재계산하지 않는다) | strip이 아니라 **등록 + 거부** |
| 키 커버리지 가드 (R4) | 타입 `BurdenedGiftInfo`(`transfer-burdened-gift.types.ts:54`) · ④ `BurdenedGiftInfoPayload`/`buildBurdenedGiftInfo`(`transfer-tax-api-burdened-gift.ts:260`) · ⑫ 스키마 · ⑭ `buildMixedUseAssetInput`(`app/api/calc/transfer/mixed-use-asset-input.ts:134`) · `scaleBurdenedGiftInfo`(`burdened-gift-valuation.ts:85`, 스케일 열거 — `debtAttribution`은 **채무 성분이라 스케일하지 않는다**, 지분은 MB-6으로 막힌다) | 필드 하나를 **다섯 곳에 같이** 넣는다. 한 곳이 빠지면 TS가 못 잡는다(⑫ strip · ⑭ 매핑 누락). `satisfies Record<keyof BurdenedGiftInfo,…>` 식 키 커버리지 가드 또는 «④ payload 키 ⊂ ⑫ 스키마 키» 정적 anchor 필요(Do 단계 목록 §7) | ⑬은 `bgInfo` 통째 spread(`transfer-tax-api.ts:636`)라 코드 변경 없음 — body에 실리는지 anchor만 |
| ⑬ body spread | `transfer-tax-api.ts:636` | 겸용이어도 `burdenedGiftInfo`가 body에 실리는지 **anchor로 고정** | |
| **⑭ Route** | `route.ts:535-605` 5-a-2 | `buildMixedAsset`에 `burdenedGift: data.burdenedGiftInfo` 전달(Date 변환본 기준: `giftDate`는 string 유지, `transferDate`는 변환본) · `calcMixed` 호출은 그대로(`transferPrice`는 엔진이 무시) · 응답 `{ mode:"mixed-use", result }`는 불변 | `mixed-use-asset-input.ts:134` 단일 조립 leaf에만 필드 추가 |
| 엔진 gate | `BURDENED_GIFT_SUPPORTED_PROPERTY_TYPES` 3-배열 parity(`burdened-gift-gate-parity.anchor.test.ts`) | **겸용은 propertyType이 달라 배열에 넣지 않는다.** 대신 `assertMixedBurdenedGiftSupported`를 «4번째 게이트»로 두고 parity 테스트에 이유를 주석 | |

### 3.7 차단 목록 (`collectMixedBurdenedGiftIssues` — 엔진 throw · ⑫ · ⑧이 같은 함수를 호출)

`mixed-use-part-acq.ts`의 `collectMixedPartAcqIssues`/`assertMixedSeparateAcqSupported` 패턴(X-1~X-7)을 그대로 따른다.

| 코드 | 조건 | 근거 |
|---|---|---|
| MB-1 | 증여일(양도일) < 2022-01-01 | §2.2 — 겸용 분리계산 범위 밖. **BG 가드는 STEP 1(`transfer-tax-mixed-use.ts:84`)보다 앞에서 평가·throw**해 기존 `buildRejectionResult`의 «단일 자산 모드로 재계산하세요» 문구가 BG에 나가지 않게 한다(겸용 BG의 단일 자산 모드는 없다). 문구: «겸용주택 부담부증여는 2022.1.1. 이후 증여(양도)분만 계산합니다»(RES-6) |
| MB-2 | `usePreHousingDisclosure` | PHD 개산공제 경로 별건 |
| MB-3 | `separateAcquisition`(B1) | §3.3 |
| MB-4 | `partialUsageChange` | 〃 |
| MB-5 | `transferCause === "public_expropriation"` | 〃 |
| MB-6 | `ownershipRatio < 1` · 컴패니언 다자산 · 축 B | 훅 충돌(§3.1) |
| MB-7 | 보충적 평가가 C를 못 이김(담보/임대 승) · 시가+담보 승 | §3.4 (Q-3) |
| MB-8 | 증여자가 **상속 또는 증여로 취득**(1985.1.1. 이후) + 시가 모드 + 방식 ∈ {K-5, K-6, K-7} | §163⑨ 문언(「상속 또는 증여…받은 자산」 — 증여 포함)이 상속개시일·증여일 현재 평가액을 취득 당시 실지거래가액으로 본다 · 재제안 금지(상속×K-6/7) · 단건 ⑧과 같은 술어. 기준시가 모드는 §163⑨를 쓰지 않아 대상이 아니다 |
| MB-9 | 증여자가 증여 취득 + `carryover_gift` | 겸용 이월과세 입력 없음 |
| MB-10 | 합계 `B > C` (초과부담부) | 기존 `assertBurdenedGiftEligible` — C는 겸용 합산 값으로. 근거는 소득세법 §88 1호 후단·소령 §159①(B/C > 1이면 증여가액 초과분까지 양도로 봄). 상증법 §47③은 근거가 아니다(채무 인수 추정 규정) |
| MB-15 (R3) | 증여자가 **신축(자가건축) 취득**(`acquisitionCause === "newConstruction"` → ⑭가 `acquisitionByNewConstruction` 플래그로 엔진 asset에 싣는다) | 겸용 입력에는 신축 필드가 없고(`MixedUseAssetInput`·`transfer-tax-api.ts` `isSelfBuilt: !isMixed && …`) 겸용 ⑧은 신축을 환산 경로로 취급한다. 소득세법 §114조의2(신축 5년 내 환산·감정 가산세)는 겸용 엔진에 없어 K-5·K-7이 가산세 없이 계산된다(V-6). K-4(공사비) 단독 허용도 신축 사용승인일 입력(취득일 시점)이 겸용에 없다 → **전면 차단**(UI 설계서 X-8과 동일. UI 허용 ⊂ 엔진 허용 유지) |
| MB-16 (R4) | 증여자의 **토지 또는 건물 취득일 < 1985-01-01**(의제취득일 전 취득, 법률 제4803호 부칙 §8) — 취득 경로 불문 | 기존 겸용 엔진이 소법 §97②1호나목·소령 §176의2④(의제취득일 현재 환산 vs 실지×생산자물가 중 큰 값)를 구현하지 않는다(V-F). 환산·감정·매매사례·상속·증여 경로가 모두 이 규칙의 영향을 받고, 실지거래가액 경로도 보유기간 기산이 의제취득일(1985.1.1.)이라 일관 처리가 필요하다. 미적용 시 조용한 오차 → **전면 차단**(완화는 K-4 한정 별건). 이 가드는 `MixedUseAssetInput.landAcquisitionDate`·`buildingAcquisitionDate`를 읽으므로 3층 공통 leaf로 둔다 |
| MB-18 | 증여자 취득원인이 상속·증여(deemed 경로: 시가 모드)이고 **토지 또는 건물 취득일이 2005-04-30 전**(1985.1.1. 전은 MB-16이 먼저) | 소령 §163⑨ 단서 1호(1990.8.30. 개별공시지가 고시 전 토지)·2호(건물 기준시가 고시 전 건물): 평가액과 §164④ 또는 §164⑤~⑦ 가액 중 **큰 금액**인데 겸용 deemed 경로에 이 처리가 없다. 주택분(§61①4호)·상가건물(§61①2호) 고시 시점을 형태별로 열거하지 않고 개별주택가격 최초 공시일 `SEC_163_9_BUILDING_FIRST_DISCLOSURE`(= 2005-04-30, 단건·분할취득과 같은 상수)로 **보수적 상위집합**을 막는다 |
| MB-17 (R4, **Q-11 β 채택 시에만**) | «구분 감정평가 있음» 선언인데 주택분 시가(C_h) 미입력 · 선언 자체 미입력 · `C_h > C` | 부가세령 §64①1호 단서. 선언 필수(기본값 없음) |
| MB-13 (R2) | `debtAttribution` 미입력 · 3값 합 ≠ `lendingDepositTotal + mortgageDebtAmount` · 음수 | §3.1A — 기본값 없음 |
| MB-14 (R2) | `B_h' > C_h` 또는 `B_c' > C_c` (귀속분 단독 또는 **불분명 안분 후** 초과) | 부분 초과부담부(V-18). 자동 재배분 금지 — 귀속 재입력 안내 |
| MB-11 | 필수 입력 누락. **(R3 판정)** 양도시: 4부분 기준시가(개별주택가격 H_T · 개별공시지가 · 상가건물 · 주택건물 나목) **항상**(양도가액 체인·C_h의 비율). 취득시: **모든 모드에서** 개별공시지가 · 상가건물 · 주택건물 나목이 필요하다 — K-1~3·K-5는 분자(basis), **K-4는 §100② 4부분 분해 비율과 실비 분배**, **K-6/K-7은 같은 분해 + 개산공제 base**, 상속·증여 취득도 reported 평가액을 4부분으로 나누는 비율이다. 취득시 개별주택가격 H_A는 기존 `isHousingPriceAtAcqRequired` 그대로(상속·증여만 선택 — 원값 비율). 토지·건물 취득일이 다르면 `isBuildingDayLandPriceRequired`가 요구하는 건물 취득일 공시지가. 그 밖에 시가 모드 {시가 총액·산정방식} · K-4 {실지 총액} · K-6/7 {총액} · 상속·증여 취득 {주택분·상가분 reported 평가액 — 보충적평가 fallback 금지} | 판정 근거: 엔진 `apportionAcquisitionPrice`가 취득시 H_A·상가 기준시가로 비율을 만들고(`transfer-tax-mixed-use-helpers.ts:165`), 개산공제 base가 취득시 기준시가이며(`transfer-tax-mixed-use-housing.ts:411-414`), 기존 일반 양도 ⑧도 실거래가·감정·매매사례에서 취득시 개별주택공시가격·상가건물·공시지가를 요구한다(`transfer-tax-validate-mixed-use-asset.ts:84-127`). 초판 MB-11의 «기준시가 모드에만 취득시 요구»는 **불완전했다 — UI 설계서 V-4가 맞다(수용)**. 엔진은 부족분을 침묵 0으로 두지 않고 기존 throw(`calcHousingGainSplit`/`calcCommercialGainSplit`)를 따른다 |
| MB-12 | BG info의 양도시 기준시가 합(`landStd+buildingStd`) ≠ 엔진 재파생 Σ · ⑫: 4부분 모델에 없는 필드(분리 실지/추계·이월과세·입주권·`assumedDebtOverride`·`giftBuildingStdPriceAtTransfer`) 존재 (§3.5) | 침묵 오답·침묵 strip 금지 |

### 3.8 결과 4곳 영향 (R3: `BurdenedTransferTaxResultCard`는 증여세 결과뷰 전용 → 겸용 BG에서는 `BurdenedGiftDetailCard`·`FilingFormTable`·상세명세서·`MixedUseResultCard` 4곳)

| 결과 지점 | 현재 | 변경 |
|---|---|---|
| `BurdenedGiftDetailCard`(`components/calc/results/transfer/`) | `TransferBurdenedGiftBreakdown`(토지/건물 2행) | 겸용용 **4행 변형** 또는 `perPart` 분기. 증여세 블록은 재사용. 다른 `perAsset` 소비 101행을 건드리지 않도록 `MixedUseBurdenedGiftBreakdown`를 별 prop으로 |
| `BurdenedTransferTaxResultCard` | **증여세 결과뷰에서만 렌더**된다(`GiftTaxResultView.tsx:461`; 주식판 `BurdenedStockTransferTaxResultCard`는 동형) — 양도세 계산기의 겸용 BG 종착지는 `MixedUseResultCard`(`TransferTaxCalculator.tsx:456`)다 | **범위 밖**(R3: 초판의 «결과 4곳»에 이 카드를 넣은 것은 오기 — UI 설계서 불일치 #7 수용). 겸용 BG의 양도세분 총세액 표시는 `MixedUseResultCard`가 `burdenedGift` echo로 직접 소유. 증여세 계산기의 겸용 축은 신설하지 않는다 |
| `FilingFormTable` | `acquisitionMethodUsed` 1필드만 읽음(`FilingFormTable.tsx:37-51`) | 어댑터가 `transferBurdenedGiftBreakdown`를 얹으면 취득가액 산식 라벨은 자동 분기. **양도가액 행이 «채무 안분»임을 겸용에서도 표기**하는지 확인 필요 |
| 상세명세서 | `resolveBgSingleDisplay`가 겸용을 **명시 제외**(`DetailedStatementBgFormulas.ts:110` `result.mixedUseDetail`) — 제외 사유 주석: «슬롯 합을 그대로 표시하면 항등식이 깨질 수 있다(미검증)» | **이 제외를 4부분 버전으로 대체**해야 한다. 항등식 `양도가액 − 취득가액 − 필요경비 = 양도차익`을 4부분 합 + swap(취득가액 0 슬롯)로 anchor |
| 증여세 별지 10호 | `BurdenedGiftFilingFormSection` | `besshi10Rows`는 breakdown에서 그대로 — 변경 없음 |
| `TransferTaxCalculator.tsx:456` mixed-use 분기 | `MixedUseResultCard`만 | BG 섹션 삽입 위치 결정 |

---

## 4. 케이스 매트릭스 + anchor 수치

### 4.0 방법과 한계 (정직한 표기)

- **기준선(실측)**: 저장소 `calcMixedUseTransferTax`를 tsx로 직접 호출해 «겸용 100㎡+100㎡·15억 일반 양도 211,650,000»을 **재현**했다.
- **BG 수치(실측)**: §159 4부분 계산은 이 문서의 **스크래치 프로토타입**(저장소에 반영 안 됨)이 만들고, 그 결과를 **저장소의 기존 `buildHousingPart`·`buildCommercialPart`·`exemptCommercialPartAsHouse`·`buildNonBusinessPart`·`buildTotalTax`·`calcExcessLandRatio`**에 넣어 세액까지 돌렸다 — 즉 «프로토타입 seam + 기존 정본 하위 함수 조합» 실측이다. 구현 후 `calcMixedUseTransferTax` 정식 호출값과 다를 수 있으니 **Do 단계 첫 작업이 이 표를 anchor로 고정**하는 것이다(Pre-Do anchor).
- **손계산 대조**: M-0·M-1·M-3·M-5는 아래 «손계산» 열로 따로 검산했다.
- 모든 금액은 원. 양도(증여)일 2024-03-01, 증여자의 취득일 토지·건물 2010-03-15(보유 13년), 서울·수도권·주거지역(배율 3), 미등기 아님. 장특 13년 표1=26%, 표2는 보유 13년→40%(상한)+거주 10년→40% = 80%.
- 공통 픽스처(양도시 / 취득시 기준시가):

| | 주택 100㎡ · 상가 100㎡ (F1) | 주택 150㎡ · 상가 50㎡ (F2) |
|---|---|---|
| 총토지 / 정착면적 | 200㎡ / 100㎡ | 200㎡ / 100㎡ |
| 양도시: 공시지가·개별주택가격(나목)·상가건물 | 5,000,000/㎡ · 6억(1억) · 1억 | 5,000,000/㎡ · 9억(1.5억) · 5천만 |
| 양도시 4부분 기준시가 HL/HB/CL/CB | 5억/1억/5억/1억 (Σ12억) | 7.5억/1.5억/2.5억/0.5억 (Σ12억) |
| 취득시: 공시지가·개별주택가격(나목)·상가건물 | 2,500,000/㎡ · 3억(5천만) · 5천만 | 2,500,000/㎡ · 4.5억(7.5천만) · 2.5천만 |
| 취득시 4부분 | 2.5억/0.5억/2.5억/0.5억 (Σ6억) | 3.75억/0.75억/1.25억/0.25억 (Σ6억) |

### 4.1 anchor 표 (프로토타입 seam + 기존 정본 하위 함수, 실측) — **R2: 아래 M-0~M-7은 모두 «채무 전부 구분 불분명(균일 `B/C`)» 특수해다**

(초판 수치는 귀속 축 도입 후에도 `debtAttribution = {0, 0, B}`로 입력하면 **그대로 재현**된다 — M-10′ = M-1이 실측 확인.)

| ID | 조건 | B / C / r | 양도가액 HL·HB·CL·CB | 취득가액 | 필요경비 | 양도차익 주택 / 상가 | 주택 비과세·안분 | 과세표준 | **결정세액** | 검산 |
|---|---|---|---|---|---|---|---|---|---|---|
| **M-0** | F1, **비1세대1주택**, 시가 15억, 채무 6억, **K-4 실지 7억** | 6억 / 15억 / 0.4 | 2.5억·5천만·2.5억·5천만 | 116,666,666·23,333,333·116,666,666·23,333,333 (7억 → 4부분 291,666,666/58,333,334 ×0.4, **split-first**) | 0 | 160,000,001 / 160,000,001 | 과세(proratio 1), 표1 26% | 234,300,004 | **69,094,001** (지방소득세 6,909,400) | **손계산 일치**: 133,333,334+26,666,667=160,000,001 · 장특 34,666,666+6,933,333=41,599,999 · 소득 118,400,002×2 − 250만 = 234,300,004 · 38% 구간: 89,034,001−19,940,000 = 69,094,001. **대조: 같은 물건 일반 양도 15억 = 211,650,000** |
| **M-1** | F1, **1세대1주택**(거주 10년), 시가 15억, 채무 6억, K-4 7억 — **주택=상가 면적(단서)** | 6억 / 15억 | 〃 | 〃 | 0 | 160,000,001 / 160,000,001 | 판정=주택분 C_h = 7.5억 ≤ 12억 → **주택분 전액 비과세**, 상가분 과세(표1) | 115,900,002 | **25,125,000** | 35% 구간: 115,900,002×0.35 = 40,565,000.7→40,565,000 − 15,440,000 = 25,125,000 (**손계산 일치**) |
| **M-2** | F2, 1세대1주택, 시가 10억, 채무 5억, K-4 5억 — **주택>상가 + 전체 C ≤ 12억** | 5억 / 10억 / 0.5 | 3.125억·6,250만·1.0417억·2,083만 | 절반 | 0 | 187,500,000 / 62,500,000 | **§154③ 본문 → 건물 전부 주택 → 상가 포함 전액 비과세**(`wholeDeemed`) | 0 | **0** | OH-17 경로와 동형 |
| **M-3** | F2, 1세대1주택(거주 10년), **시가 18억**, 채무 9억, K-4 9억 — **고가 겸용, 해석 B** | 9억 / 18억 / 0.5 | 5.625억·1.125억·1.875억·0.375억 | 2.8125억·5,625만·9,375만·1,875만 | 0 | 337,500,000 / 112,500,000 | C_whole 18억 > 12억 → 고가. 주택분 C_h = 13.5억 → 과세분 = 1.5/13.5 = **1/9** → 37,500,000, 장특 표2 80% = 30,000,000 → 소득 7,500,000. 상가분 표1 26% → 소득 83,250,000 | 88,250,000 | **15,447,499** | 손계산 15,447,500 — **1원 차는 기존 `calculateProgressiveTax`의 `88,250,000×0.35 = 30,887,499.999999996` 부동소수**(별건·V-7). 구현 anchor는 엔진값 |
| **M-3′** | M-3과 같은 입력, **해석 A**(채무 상당액 B로 판정·안분) | 〃 | 〃 | 〃 | 〃 | 〃 | C_whole:=B 9억 ≤ 12억 → 건물 전부 주택 → **전액 비과세** | 0 | **0** | **해석 A vs B 차이 = 15,447,499** → Q-1 |
| **M-5** | F1, **기준시가 모드**(보충적 12억), 채무 6억, K-1~3, 비1세대1주택 | 6억 / 12억 / 0.5 | 2.5억·5천만·2.5억·5천만 | 1.25억·2,500만·1.25억·2,500만 | 개산공제 3,750,000·750,000·3,750,000·750,000 | 145,500,000 / 145,500,000 | 과세, 표1 26% (장특 37,830,000씩) | 212,840,000 | **60,939,200** | **손계산 일치**: 121.25M+24.25M=145.5M · 38%: 80,879,200−19,940,000 = 60,939,200 |
| **M-5b** | M-5 + 1세대1주택(단서) | 〃 | 〃 | 〃 | 〃 | 〃 | 주택분 비과세(C_h=6억), 상가 과세 | 105,170,000 | **21,369,500** | |
| **M-6** | F1, 증여자 **상속 취득**(주택분 3.5억·상가분 3.5억 신고), 시가 15억, 채무 6억 | 6억 / 15억 / 0.4 | 〃 | M-0과 동일(상속 평가액 합 7억 = 실지 7억) | 0(개산공제 아님) | 〃 | 〃 | 234,300,004 | **69,094,001** | M-0과 같음이 정상(§163⑨ = 실지거래가액 의제). 상속 실비 입력 시 ×B/C |
| **M-7** | F1, **K-5 환산**, 시가 15억, 채무 6억, 비과세 아님 | 6억 / 15억 / 0.4 | 〃 | **환산** 1.25억·2,500만·1.25억·2,500만 (= 양도가액 B-slice × 취득시/양도시 기준시가, ×B/C 없음) | 개산공제 3,000,000·600,000·3,000,000·600,000 (= 취득시 기준시가 ×0.4 ×3%) | 146,400,000 / 146,400,000 | 과세 | 214,172,000 | **61,445,360** | §1.3의 «개산공제 1/r배 과대» 방지 확인 |
| **M-7b** | F1, K-5 환산, **기준시가 모드**(C=12억) | 6억 / 12억 / 0.5 | 〃 | 〃 | 〃 | 145,500,000 | 〃 | 212,840,000 | **60,939,200** | **M-5와 1원까지 같다** — 단건 문서가 적은 «§159①1호 ≡ §114⑦ 환산(C=기준시가 합일 때)» 동치가 겸용에서도 성립 |

**경계값 (실측)**

| 경계 | 결과 |
|---|---|
| F2, 채무 6억·K-4 5억, C_whole = 12억 정확 | `wholeDeemed` → 결정세액 **0** |
| 〃, C_whole = 12억+1 (C_h = 9억) | 주택분 `isExempt=false` 이나 과세 양도차익 0, **상가분만 과세 9,180,000** → **1원 문턱 절벽**(0 → 9,180,000). L-10(판정=전체)이 만든 **기존** 거동이다(BG 고유 아님) — 해석 B에서도 그대로 승계 (V-9) |
| 〃, C = 16억 (C_h = 12억 정확) vs 16억+2 (C_h = 12억+1) | 둘 다 결정세액 11,955,000 — 12억 초과분 안분이 1/1.2×10⁹라 사실상 0 |

### 4.3 채무 귀속 anchor (R2 — 프로토타입 `p6`: 귀속 안분 + 기존 `buildHousingPart`·`buildCommercialPart`·`exemptCommercialPartAsHouse`·`buildNonBusinessPart`·`buildTotalTax`, 실측)

픽스처 F1·F2는 §4.0과 같다(시가 모드, 증여자의 취득 K-4 실지 총액). C_h/C_c = 시가 총액을 양도시 기준시가 비율로 체인 안분한 값.

| ID | 조건 | 귀속(주택/상가/불분명) | B_h' / B_c' · 비율 | 양도가액(HL·HB·CL·CB) | 취득가액 | 양도차익 주택 / 상가 | 판정 | 과세표준 | **결정세액** | 검산 |
|---|---|---|---|---|---|---|---|---|---|---|
| **M-10′** | F1 단서·1세대1주택(거주 10년)·시가 15억·채무 6억·K-4 7억 | 0 / 0 / 6억 | 3억 / 3억 · 0.4 / 0.4 | 2.5억·5천만·2.5억·5천만 | 116,666,666·23,333,333·116,666,666·23,333,333 | 160,000,001 / 160,000,001 | 주택분 C_h 7.5억 ≤ 12억 → 비과세 | 115,900,002 | **25,125,000** | **M-1과 1원까지 일치(실측)** — 균일 특수해 증명 |
| **M-8** | F1 단서·1세대1주택·시가 15억·K-4 7억 — **상가 귀속만** | 0 / 6억 / 0 | **0** / 6억 · 0 / **0.8** | 0·0·5억·1억 | 0·0·233,333,332·46,666,667 | 0 (양도 없음) / 320,000,001 | 주택 **양도 없음**(`transferred:false`, `highValue.applicable:false`). 상가는 별개 과세(표1 26%) | 234,300,002 | **69,094,000** | **손계산 일치**: 266,666,668+53,333,333=320,000,001 · 장특 69,333,333+13,866,666=83,199,999 · 소득 236,800,002−250만 · 38%: 89,034,000−19,940,000 = 69,094,000. 균일(M-0) 69,094,001과 1원 차(취득가액 분할 단계 차이) |
| **M-9** | F1 단서·1세대1주택 — **주택 귀속만** | 6억 / 0 / 0 | 6억 / **0** · **0.8** / 0 | 5억·1억·0·0 | 233,333,332·46,666,667·0·0 | 320,000,001 / 0 | 판정=주택분 C_h 7.5억 ≤ 12억 → **전액 비과세** | 0 | **0** | 손계산: 비과세 |
| **M-9′** | M-9 + **비1세대1주택** | 〃 | 〃 | 〃 | 〃 | 320,000,001 / 0 | 과세, 표1 26% | 234,300,002 | **69,094,000** | **손계산 일치**(M-8과 대칭 — 주택·상가가 같은 보유기간·표1) |
| **M-10** | F1 단서·1세대1주택 — **상가 귀속 3억 + 불분명 3억(담보대출)** | 0 / 3억 / 3억 | 1.5억 / 4.5억 · 0.2 / 0.6 | 1.25억·2,500만·3.75억·7,500만 | 58,333,333·11,666,666·174,999,999·35,000,000 | 80,000,001 / 240,000,001 | 주택분 비과세(C_h ≤ 12억), 상가 과세 | 175,100,001 | **46,598,000** | **손계산 일치**: 상가 장특 52,000,000+10,400,000=62,400,000 · 소득 177,600,001−250만 · 38%: 66,538,000−19,940,000 |
| **M-10b** | M-10 + 비1세대1주택(양쪽 과세) | 〃 | 〃 | 〃 | 〃 | 80,000,001 / 240,000,001 | 과세 | 234,300,003 | **69,094,001** | **손계산 일치**(주택 장특 20,799,999) |
| **M-12** | F2(주택 150·상가 50) **고가 겸용**(시가 18억)·1세대1주택(거주 10년)·K-4 9억 — **주택 귀속만 9억** | 9억 / 0 / 0 | 9억 / **0** · 2/3 / 0 | 7.5억·1.5억·0·0 | 3.75억·7,500만·0·0 | 450,000,000 / 0 | 판정=C_whole 18억 > 12억 → 고가. 안분 분모 C_h 13.5억 → 과세분 1/9 | 7,500,001 | **450,000** | **손계산 일치**: 4.5억 × 1/9 = 5천만(엔진 49,999,999 — 기존 `proratio` 부동소수 1원) · 표2 80% = 4천만 · 소득 1천만 · (1천만−250만)×6% = 450,000 |
| **M-12b** | M-12 + **상가 귀속만 4억** | 0 / 4억 / 0 | **0** / 4억 · 0 / 0.8889 | 0·0·3.333억·6,667만 | 0·0·166,666,666·33,333,333 | 0 / 200,000,001 | 고가 겸용 — 상가는 주택 아님 → **일반과세**, 주택 **양도 없음** | 145,500,002 | **35,485,000** | **손계산 일치**: 35% 구간 50,925,000−15,440,000 |
| **M-13** | F2 **본문 + 비고가**(시가 10억)·1세대1주택·K-4 5억 — **상가 귀속만 2억** | 0 / 2억 / 0 | 0 / 2억 · 0 / 0.8 | 0·0·1.667억·3,333만 | 0·0·83,333,332·16,666,667 | 0 / 100,000,001 | C_whole 10억 ≤ 12억 → 건물 전부 주택 → 상가 slice도 **비과세**(I2) | 0 | **0** | 균일(M-2)과 세액 같음(0) |
| **M-14** | F2 본문 + 비고가 — **상가 귀속 5억 > C_c 2.5억** | 0 / 5억 / 0 | — | — | — | — | **MB-14 오류**(`B_c'` 5억 > `C_c` 2.5억) | — | 오류 | 실측(차단) |
| **M-15** | F2 본문 + 비고가 — **주택 귀속 749,999,999 + 불분명 1억** (C_h 7.5억) | 749,999,999 / 0 / 1억 | `u_h` = floor(1억×7.5/10) = 75,000,000 → `B_h'` = 824,999,999 > C_h | — | — | — | **MB-14 오류**(불분명 안분 후 초과) | — | 오류 | 실측(차단) — 자동 재배분 없음 |
| **M-16a** | F2(토지 1,000㎡·**배율 초과**)·본문 + 비고가(시가 10억)·K-4 5억 — **균일(불분명 5억)** = I1 | 0 / 0 / 5억 | 3.75억 / 1.25억 · 0.5 / 0.5 | 3.125억·6,250만·1.0417억·2,083만 | 절반 | 187,500,000 / 62,500,000 | 주택·상가 비과세, **배율초과 비사업용토지분 과세**(nb 양도차익 145,833,333) | 105,416,667 | **31,997,499** | 실측(손계산 미수행) |
| **M-16b** | M-16a + **상가 귀속만 2억** = I2 | 0 / 2억 / 0 | 0 / 2억 · 0 / 0.8 | 0·0·1.667억·3,333만 | 0·0·83,333,332·16,666,667 | 0 / 100,000,001 | nb 양도차익 58,333,333 | 40,666,667 | **8,906,666** | 실측 — **해석 I1/I2 차이 23,090,833**(Q-8) |
| **M-16c** | M-16a + **주택 귀속만 5억** | 5억 / 0 / 0 | 5억 / 0 · 0.6667 / 0 | 4.167억·8,333만·0·0 | 2.083억·4,167만·0·0 | 250,000,001 / 0 | nb 양도차익 145,833,333 | 105,416,667 | **31,997,499** | 실측 |

관찰: ① **M-10′ = M-1**(균일 일치) ② M-8·M-9′가 같은 세액(보유기간·표1이 같은 대칭) ③ 고가 겸용에서는 귀속이 «전액 과세 vs 1/9 과세»를 가른다(M-12 450,000 vs M-12b 35,485,000) ④ 본문 + 배율초과에서만 I1/I2가 갈린다(M-16). 모두 «프로토타입 실측» — Do 첫 단계에서 정식 호출값으로 재고정.

### 4.2 매트릭스 완결성 (분기 enumerate)

| 축 | 분기 | v1 | anchor |
|---|---|---|---|
| 주택 면적 | 주택>상가(본문) / 주택≤상가(단서) | ✅✅ | M-2·M-3 / M-1·M-5b |
| 증여자 취득일 < 1985-01-01 (R4) | 차단 | ❌ MB-16 | 차단 anchor |
| 신축 취득 (R3) | 차단 | ❌ MB-15 | 차단 anchor |
| **채무 귀속 (R2)** | 전부 불분명 / 상가만 / 주택만 / 혼합 / 부분 초과 오류 | ✅✅✅✅✅ | M-10′(=M-1) / M-8·M-12b·M-13 / M-9·M-9′·M-12 / M-10·M-10b / M-14·M-15 |
| 전체 C | ≤12억 / >12억 | ✅✅ | M-2 / M-3 |
| 1세대1주택 | 예 / 아니오 | ✅✅ | M-1 / M-0 |
| 평가 모드 | 시가 / 기준시가 | ✅✅ | M-0 / M-5 |
| 취득 | K-4 / K-5 / K-6·7 / 기준시가 / 상속 / 증여 | ✅ | M-0 / M-7 / (총액형 — M-0 구조) / M-5 / M-6 / (M-6 동형) |
| 담보·임대 승 | — | ❌ 차단 | 차단 anchor |
| 배율 초과 부수토지 | 있음/없음 | ✅(기존 `nonBusinessLandPart` 경로) | **미실측 — Do에서 anchor 추가** (V-13) |
| 다주택 중과 | 조정지역 2주택 이상 | ✅(기존 판정, 한시 배제 고지 추가) | **미실측 — Do** |
| 미등기 | 개산공제 3/1000·장특 배제 | ✅(기존) | **미실측 — Do** |
| 토지·건물 취득일 상이(단, B1 아님) | B0 | ✅(기존 `splitMixedUseHousingStd` γ1) | **미실측 — Do** |

---

## 5. 사용자 결정이 필요한 지점

| Q | 쟁점 | 선택지 | 권고 · 근거 | 영향 |
|---|---|---|---|---|
| **Q-1** | **12억 판정·§160 안분에서 «양도가액»이 증여가액 C인가, 채무 상당액 B인가** (겸용에서의 결합 방식 포함). **R2: 귀속 도입 후 판정·안분은 «양도하는 부분이 있는 쪽»에만 걸린다(§3.1A)** | **B(권고)**: 판정=전체 C(본문)/주택분 C_h(단서), 분모=C_h<br>**A**: B 상당액으로 판정·안분<br>**C′**: 판정·분모 모두 주택분 C_h | **B** — 국심2007서2099 본문 실독(전체증여재산가액으로 판정) + 단건 해석 B(국세청 5건) + 겸용 L-10과 결합. 해석 A는 단건에서 이미 기각(`transfer-tax-burdened-gift-phase2.engine.design.md:396-411`). 부동산거래관리과-119 원문은 **12억 판정 기준을 답하지 않았다**(채무 귀속만 답함, 2010년 — §160① 괄호 도입 전이라 고가 판정 분모 문제 자체가 다른 모습). 따라서 Q-1은 국심2007서2099(단건)·L-10(겸용)의 결합 추론이며 겸용 BG 직접 선례는 **없다** | M-3: B=15,447,499 vs A=0. 고가 겸용 BG에서 세액이 «전액 비과세 vs 과세»로 갈린다 |
| Q-2 | 시가 모드에서 시가 총액을 주택/상가로 가르는 방법 | (α) 기준시가 비율(권고) · (β) 주택분 시가·상가분 시가 별도 입력 | α(**감정평가가액이 없을 때에 한해**) — 법 §100②·소령 §166⑥→부가세령 §64①1호 **본문**(기준시가 비례)이 산식을 명시하므로 «자동 안분 fallback 금지»의 예외(법정 안분). **같은 호 단서(감정평가가액 있으면 그 비례)가 있어 «기준시가 비율 = 법정 안분»이라고 단정할 수 없다 → Q-11**. β는 감정서가 구분돼 있을 때 정확하나 입력 부담 | `C_h`에 직결 → 12억 문턱 |
| Q-3 | 담보(§66)·임대(§61⑤)가 C를 이기는 경우 *(R2: 귀속 축이 (β)의 입력 토대를 이미 제공 — §3.1A)* | (α) v1 차단(권고) · (β) 부분별 max 입력 신설(주택/상가 임대보증금·연임대료 분리) · (γ) 물건 전체 max 유지 + C 비례 분해 | α — §61⑤가 «임대된 재산» 단위라 γ는 법리 오류 소지. 상가 임대가 흔한 겸용에서 α는 제약이 크므로 **β를 후속 설계로 예약**(사용자가 필요성 판단) | 차단되는 입력 비율이 높을 수 있음 |
| Q-4 | 원 단위 절사 순서 | 양도가액 B-first(권고)/A-first · 취득가액 split-first(권고)/scale-first | §3.1 — 어느 쪽이든 1~3원. 단건·겸용 기존 규약과 맞춘다 | 세액 ±1~3원 |
| Q-5 | v1 범위 | §3.7 MB-2~MB-6 차단 vs 일부 포함(PHD·B1·지분) | 차단 — 각각 별건 설계 필요(V-12) | 지원 입력 축소 |
| Q-6 | 증여세 평가용 «상가건물 기준시가(층별 가감)» 별도 입력 | (α) v1 미지원: 양도세 기준시가와 같다고 두고 고지(권고) · (β) 입력 신설 | 단건은 `giftBuildingStdPriceAtTransfer` 미입력 시 양도세 값 fallback(`burdened-gift-apportionment.ts:132-133`)을 이미 갖는다. 겸용도 같은 가정이면 일관되나 **정책상 값 fallback**이라 사용자 확인이 필요 | C·r이 달라질 수 있음 |
| Q-7 | 데이터 모델 | D1′(권고) · D2 | §3.5 | 구현 비용 |
| **Q-8 (R2)** | **본문 + 비고가(전부 주택 의제)에서 채무 귀속 구분을 적용할 것인가** | **I2 적용(권고)** · I1 미적용(균일) | I2 — 귀속은 «양도로 보는 부분»을 정하는 문제(소법 §88)이고 §154③ 본문의 «주택으로 본다»는 비과세 적용 시 한정 + 엔진이 이미 주택/상가를 나눠 계산. **직접 해석례 없음(확인 필요 V-19)** | 세액은 배율초과 비사업용토지가 있을 때만 갈린다: M-16b 8,906,666 vs M-16a 31,997,499 |
| **Q-9 (R2)** | **구분 불분명 채무의 안분 방식** | (ㄱ) 주택·상가 증여가액 비율 `C_h:C_c`(을설 — 권고) · (ㄴ) 불분명분을 허용하지 않고 전부 귀속 확정 요구 · (ㄷ) 면적비/기준시가비 | ㄱ — 소령 §159 균일 `B/C`와 같은 산술이라 법문에 가장 가깝다. 단 해석례는 «구분이 분명한 경우»만 답했다 → **불분명분은 확인 필요(V-17)**. ㄴ은 가장 보수적이나 근저당 전체 담보 대출을 가진 대부분의 사용자를 막는다 | 담보대출이 있는 입력 대부분 |
| **Q-10 (R2)** | **귀속 입력을 필수로 할지(기본값 없음)** | 필수(권고) · 미입력 시 «전부 불분명» 기본값 | 필수 — 기본값은 쟁점(을설)을 사용자 모르게 고르는 것이고 정책 «자동 안분 fallback 금지»·«모름 = 혜택 불성립 + 확인 필요»와 맞지 않는다. 임대보증금이 없는 사용자도 `0/0/B` 한 번 입력 | UI 입력 칸 증가(UI 설계서 후속) |
| **Q-11 (R4)** | **주택/상가 감정평가가액이 있을 때(부가세령 §64①1호 단서) C_h·C_c를 어떻게 정할 것인가** | (α) 감정평가서의 주택분·상가분 시가를 별도 입력(C_h 직접) · (β) **«구분 감정평가 없음/있음» 선언을 필수로 받고 «있음»이면 주택분 시가 한 칸만 입력**(C_c = C − C_h, 4부분 내부는 기준시가 비례) · (γ) v1은 기준시가 비례 + 고지 · (δ) 감정가액 기반 시가 모드를 v1 차단 | **β 권고.** γ는 단서에 걸릴 때 12억 문턱이 조용히 틀린다 — 예: M-12(C=18억)에서 기준시가 비례 C_h = 13.5억(안분 과세분 1/9)인데 감정평가가 주택 11.5억·상가 6.5억이면 C_h = 11.5억 ≤ 12억이라 안분 분모가 12억 미만 → 주택분 과세분 0(**손계산** — 판정은 여전히 C_whole 18억 고가). δ는 시가 모드 사용자 대부분을 막는다. β는 선언이라 기본값 없음 원칙에 맞고 «있음»일 때만 입력 부담. 채택 시 MB-17(선언 필수·C_h ≤ C 검증)과 입력 1칸 추가 | 12억 문턱·귀속 불분명분 안분(`u_h`) 모두 `C_h`에 의존 |

---

## 6. 범위 밖 · 미검증 레지스터

| ID | 항목 | 상태 |
|---|---|---|
| V-1 | ~~부동산거래관리과-119 본문 미확인~~ | ✅ **해소(R2)** — 원문 실독, §2.3에 요지·회신 원문 그대로 인용. 설계 영향: D-7·§3.1A. 남은 한계는 아래 V-17~V-19 |
| V-2 | 단건 해석 B 근거 5건 중 이번 세션은 목록·번호·일자만 재확인(국심2007서2099만 본문 실독) | 기존 계획서(2026-05-12) 열람 기록을 신뢰. 재열람 필요 시 Playwright |
| V-3 | 겸용 고가 판정 해석례 3건(사전-2015-0225 · 서면-2022-부동산-0634 · 서면4팀-1628) 본문 | 이번 미열람. L-10 문서가 요지 인용 |
| V-4 | 부가세령 §64①1호 **단서**(감정평가가액 우선 안분) — **R4 재분류: «신규 위험 증가»** | 기존 겸용 일반 양도 엔진도 미구현(총액이 실거래가라 단서가 덜 걸림). 그러나 **부담부증여 시가 모드의 C는 감정가액인 경우가 많아 단서에 걸릴 가능성이 크고**, `C_h`(12억 문턱)·불분명분 안분이 직접 의존한다 → 기존 갭이 BG에서 확대된다. Q-11. 추가 확인 필요: 단서의 평가 기간 요건(공급시기가 속하는 과세기간 직전 과세기간 개시일~종료일)을 양도세에 어떻게 대응시키는가(**공급시기 → 증여일(양도시기)** 로 읽는 것이 자연스러우나 소령 §166⑥은 대응을 명시하지 않는다) |
| V-5 | K-5의 주택 «결합 환산» vs 단건 BG의 토지/건물 개별 환산 불일치 가능성 | 값이 같아지는 조건은 «토지:건물 비율 불변». 확인 필요 — 사람 확인 |
| V-6 | 소득세법 §114조의2(신축 5년 가산세)가 겸용 엔진에 없음 | 기존 한계. BG K-5/K-7 × 겸용 신축은 가산세 미반영 — 고지 필요 여부 확인 |
| V-7 | `calculateProgressiveTax` `88,250,000×0.35` 부동소수 1원 | 기존 별건(`feedback_applyrate_fractional_rate_one_won_error`). anchor는 엔진값 |
| V-8 | 브라우저 수동 확인·vitest 정식 anchor·E2E | 이번 작업은 설계 — **미수행** |
| V-9 | 12억+1 상가분 과세 절벽(0 → 9,180,000) | L-10 승계 거동. 변경하지 않음 |
| V-10 | 증여세 §47③ 채무 인수 입증(배우자·직계존비속 간 추정) | 단건과 동일 — 변경 없음 |
| V-11 | 소령 §159②(총 채무를 **과세대상 자산가액 비율**로 일률 안분) — 겸용 자체에는 해당 없음 | **귀속 축에 불리한 입법 신호일 수 있다**(D-7 근거는 2010 해석례뿐, §159②는 2017 개정). 또 부분별 분모 `B_part'/C_part`는 해석례 요지에 **없는 추론**이다(해석례는 «그 채무액이 속하는 주택 또는 상가의 양도로 보아 양도차익을 산정»까지만) — 확인 필요 |
| V-12 | PHD·B1·일부 용도변경·수용·지분·컴패니언 × 겸용 BG | 별건 설계 |
| V-13 | 배율초과·중과·미등기·B0 × 겸용 BG 수치 | 기존 경로 재사용으로 지원하나 **anchor 미실측** — Do 첫 단계 |
| V-14 | 소법 §100③(30%) | v1 입력 형태(총액)에 해당 없음 — 토지·건물 별도 기장 입력 도입 시 재검토 |
| V-15 | 토지·건물 취득일이 다른 겸용(B0)에서 §159①1호 괄호의 «기준시가»로 γ1 «취득당시 주택가격 P»(집행기준 99-164-9)를 쓰는 것이 맞는가 | 기존 겸용 엔진의 B0 모델을 승계할 뿐 BG 고유 근거는 확보하지 못했다 — 확인 필요 (UI 설계서 Q-8과 같은 쟁점) |
| V-16 | 상증법 §61①: 겸용에서 주택 부분=개별주택가격(4호)·상가=토지(1호)+건물(2호)로 분리 평가하는 모델 | §61 본문은 실독(1호 토지·2호 건물·3호 오피스텔·상업용건물 일괄고시·4호 주택). 겸용 분리 평가 모델은 **기존 겸용 엔진 승계**이며, 상가가 §61①3호(일괄고시) 대상이면 미지원 — 확인 필요(UI 설계서 §13-6) |
| V-C | 12억 판정 기준 근거 상태 | ① 국심2007서2099만 본문 실독, 국세청 5건 미재열람 ② 소법 §89①3호 «양도 당시 **실지거래가액**의 합계액»은 문언상 **해석 A**(양도로 보는 부분의 가액)로도 읽힌다 ③ 소령 §156①(일부 양도 시 환산)은 §2.1 유추 보강일 뿐 직접 근거 아님 ④ **기준시가 모드(보충적평가)에서의 12억 판정 기준은 직접 근거 공백** — 국심2007서2099의 사실은 증여재산가액 9.5억이나 평가 방식 불명 → Q-1 권고는 «채택된 해석 + 유추»이고 확정이 아니다 |
| V-D | 실비(자본적지출·양도비)에 ×B/C | §159① 법문은 **취득가액·양도가액**만 B/C를 곱하라고 한다. 실비 ×B/C는 단건 기존 규약(`burdened-gift-apportionment.ts:381-455` — `necessaryExpenseDebtTotal`)이고 이 설계가 승계한 것이다 — 법문 직접 근거 없음, 확인 필요 |
| V-E | 양도시기 = 증여일 | 법 §98 전단은 «대금을 청산한 날»이 원칙이고 소령 §162①5호의 «증여를 받은 날»은 **상속·증여로 취득한 자산의 취득시기** 규정이다. 부담부증여의 양도시기를 증여일로 보는 것은 엔진 가정(`transfer-tax-burdened-gift-step.ts:62` `giftDate: rawInput.transferDate`)과 조세심판례(국심2004서1056 «부담부증여에 대하여 증여일을 양도시기로 본 처분의 당부» — 기각, **제목만 확인·본문 미열람**)에 의존 — 법령 직접 근거 확인 필요 |
| V-F | 의제취득일(1985.1.1.) 전 취득 | 기존 겸용 엔진은 소법 §97②1호나목·소령 §176의2④(의제취득일 현재 환산 vs 실지×생산자물가 중 큰 값)를 **구현하지 않는다**(`transfer-tax-api-mixed-use.ts:336-345` 주석: pre-1985 상속·증여는 게이트 false → 환산 fallback · «§176조의2④ pre-deemed 미반영»). 토지·건물은 법률 제4803호 부칙 §8로 1984.12.31. 이전 취득이 1985.1.1. 취득으로 의제된다(국심2007서2099 인용문). 사실 사안(그 결정례)이 바로 의제취득일 전 취득 × 부담부증여 환산이다 → **v1은 차단(MB-16)** |
| V-17 | 구분 불분명 채무를 `C_h:C_c`로 안분(을설) | 해석례는 «구분이 분명한 경우»만 답했다. **불분명분은 확인 필요**(Q-9) |
| V-18 | 부분 초과부담부(`B_h' > C_h` 또는 `B_c' > C_c`)를 오류로 보는 것 | 법문(소득세법 §88 1호 후단·소령 §159①)·해석례 어디에도 부분 단위 규정이 없다. 비율 B/C > 1 불가라는 산식 취지를 부분에 확장한 보수적 가드 — 확인 필요 (상증법 §47③은 채무 인수 추정 규정이라 근거가 아니다) |
| V-19 | 해석례 사실관계의 한계: ① 주택<상가(단서) 사안이라 본문(주택>상가)·고가 겸용 미답 ② **임차보증금**만 다룸 — 담보차입금(건물 전체 근저당 등)의 귀속 판단 기준 미답 ③ 2010년(§160① 괄호 도입 전) | 본문/고가 겸용에 귀속 규칙을 확장 적용하는 것(Q-8 I2, M-12·M-12b)은 **추론**이다 — 확인 필요 |
| V-20 | 귀속 선언의 증빙(임대차계약서 임차 대상·근저당 설정 대상) | 엔진은 사용자 선언을 받을 뿐 판단하지 않는다. `warnings`에 증빙 고지 |

---

## 7. 구현 순서 · 테스트 약속 (Do 위임)

1. **Pre-Do anchor**: §4.1·§4.3 표를 `__tests__/tax-engine/transfer/mixed-use-burdened-gift.anchor.test.ts`에 «기대값 먼저» 고정(M-0·M-1·M-3·M-3′·M-5·M-7 + **귀속 M-8·M-9·M-10′·M-10·M-12·M-12b·M-14·M-15**). 구현 전 실패 확인. M-10′ = M-1 일치를 균일 특수해 회귀로 고정.
2. `burdened-gift-apportionment.ts`에서 증여세 블록·`acqStdPriceForced` 판정을 함수로 **추출**(800줄 정책 + 단일 소스) — 단건 anchor 전부 무변경 확인.
3. 순수 `mixed-use-burdened-gift-prepare.ts`(`collectMixedBurdenedGiftIssues`·`prepareMixedBurdenedGift` — 서버 import 금지, §10 RES-1)와 엔진 전용 `mixed-use-burdened-gift.ts`(`applyMixedBurdenedGift`·breakdown·증여세) 신설.
4. `transfer-tax-mixed-use.ts`(현재 727줄, 착지 목표 ≤700)에 seam 호출 삽입 — **STEP 7.5(`:366-421` 약 55줄)를 helper로 먼저 분리**한 뒤 삽입(기회주의적 분리, 한 PR에 +50줄 초과 금지).
5. ④⑧⑫⑭ + 결과 타입 + 결과 4곳. **키 커버리지(R4·F-1)**: `debtAttribution`·`acquisitionByNewConstruction`·`burdenedGift`를 ① 타입(`transfer-burdened-gift.types.ts:54`, `transfer-mixed-use.types.ts`) ② ④ `BurdenedGiftInfoPayload`/`buildBurdenedGiftInfo`(`transfer-tax-api-burdened-gift.ts:260`) ③ ⑫ `burdenedGiftInfoSchema`(`:10`, non-strict — **미등록 시 침묵 strip → MB-13이 전 요청 거부**) ④ ⑭ `buildMixedUseAssetInput`(`mixed-use-asset-input.ts:134`) 네 곳에 함께 넣고, «④ payload 키 ⊂ ⑫ 스키마 키 ⊂ 타입 키» 정적 anchor를 둔다. 컴패니언 스키마 공유(`transfer-tax-schema-companion.ts:220`) 영향은 MB-6 차단 anchor(컴패니언에 `debtAttribution`/겸용 BG 전송 → 거부). ⑬은 `bgInfo` 통째 spread(`transfer-tax-api.ts:636`)라 코드 변경 없이 body 포함 anchor만. **MB-1~MB-17 가드 anchor**(특히 MB-15 신축·MB-16 의제취득일 전 취득).
6. 뮤테이션: ①C→B로 바꾸면 M-3 KILLED ②개산공제 ×B/C 제거하면 M-7 KILLED ③취득 scale-first로 바꾸면 M-0 1원 KILLED ④MB-7 가드 제거하면 차단 anchor KILLED ⑤`totalPropertyTransferPrice` 훅 제거하면 M-3 KILLED ⑥(R2) `apportionment` 덮어쓰기(B_h'/B_c')를 기준시가 비율 안분으로 되돌리면 M-8 KILLED ⑦ 불분명 안분을 C_h:C_c 대신 균등 반분으로 바꾸면 M-10 KILLED ⑧ MB-14 제거하면 M-14·M-15 KILLED.
7. 검증: `npx vitest run __tests__/tax-engine/transfer/ __tests__/calc/`(세목 범위), `npx tsc --noEmit`, 브라우저(Playwright)로 폼→계산→결과 + Network body의 `burdenedGiftInfo`/`mixedUse` 확인.

## 8. 병렬 UI 설계서(`transfer-burdened-gift-mixed-use.ui.design.md` §11 E-1~E-12)에 대한 엔진 회신

UI 설계서가 «엔진이 정해야 확정되는 지점»으로 번호를 매겼다. 이 문서가 정한 답은 다음과 같다(UI 설계서는 같은 시각에 병행 작성 중이므로 **두 문서를 같이 읽어야 한다**).

| E | UI가 물은 것 | 엔진 회신 |
|---|---|---|
| E-1 | 입력 모델 A/B/C | **A** (= 이 문서 D1′: 최상위 `burdenedGiftInfo` 재사용 + 겸용 4부분은 `MixedUseAssetInput` 파생). **R2: 신규 `AssetForm` 필드 0은 깨졌다** — 채무 귀속 입력(`debtAttribution` 3값을 합성할 임대보증금 주택/상가 분리 + 담보차입금 귀속 선택)이 필요하다(§9-②) |
| E-2 | 결과 shape · `housingPart`/`commercialPart` 값의 의미 · `acquisitionConversionRoute` | `MixedUseGainBreakdown.burdenedGift?: MixedUseBurdenedGiftBreakdown`(§3.5). `housingPart`·`commercialPart`의 양도가액·취득가액·개산공제·양도차익은 **seam 적용 후 값 = 채무비율(B/C) 적용 후 B-slice**(`buildHousingPart`가 그 split을 받는다). **`acquisitionConversionRoute`에 새 값을 추가하지 않는다** — 그 필드는 «A_i를 어느 경로로 만들었나»(§97 환산/실가/상속/감정)를 뜻하고 BG는 그 위에 얹는 별개 축이다(값을 추가하면 `MixedUseCalculationSections`의 분기 전부를 건드린다). UI는 `breakdown.burdenedGift` 존재 여부로 분기 |
| E-3 | `perAsset` 4부분 확장? | **별 필드 `perPart`**로 두고 `perAsset`은 Omit — 합계 흉내 금지(1~3원 어긋남이 가려진다) |
| E-4 | P1 K 방식·취득원인·PHD·용도변경·별개취득·취득일 상이, `BURDENED_GIFT_SUPPORTED_PROPERTY_TYPES` | §3.3 표. K-1~K-7(상속·증여 취득은 K-4 고정) **엔진 지원**, PHD·B1·용도변경·수용·지분·컴패니언 **차단**. 토지·건물 취득일 상이(B0)는 **지원**(V-15 확인 필요). 배열에는 **추가하지 않는다** — 겸용은 propertyType이 다르고 별도 게이트(`assertMixedBurdenedGiftSupported`)를 쓴다. parity 테스트(`burdened-gift-gate-parity.anchor.test.ts`)에는 «겸용은 4번째 게이트» 이유를 주석으로 고정 |
| E-5 | ④ `burdenedGiftInfo`의 겸용 기준시가 표현 | housing 관행(합계를 건물 슬롯) — **UI 설계와 동일**. 엔진은 읽지 않고 재파생, 양도시 합 불일치는 fail-fast(§3.5, MB-12) |
| E-6 | ⑫ 스키마 위치 | 최상위 `burdenedGiftInfo`(스키마 불변). 겸용 refine만 추가 |
| E-7 | `data.transferPrice` placeholder 덮어쓰기 | **엔진이 무시하고 B로 덮어쓴다**(단건 STEP 0.48과 같다). ④ placeholder 유지 가능. §1.2에서 실측했듯 현재 세액 0은 «placeholder가 양도가액으로 쓰이고 취득가액은 미스케일»인 탓이다 — UI 설계서 §6.2의 «현재 세액 0의 한 원인으로 추정»을 **확정**한다 |
| E-8 | 12억·비과세 분모 | **증여가액 C**(해석 B): 판정=`C_whole`(§154③ 본문)/`C_h`(단서), 안분 분모=`C_h`. 결과 `highValue` echo로 문구를 만든다 — **Q-1 미확정 동안 «확인 필요» 고지를 `warnings`에 항상 싣는다**(겸용 직접 해석례 부동산거래관리과-119 미열람) |
| E-9 | B/C>1 사전 차단 | 가능하다 — C는 클라이언트에서 `computeSangjeungbeopValuation`(`burdened-gift-valuation.ts:217`)으로 계산 가능(보충적 평가 합 = Σ4부분). 단 **시가 모드의 C = 시가 총액**이고 4부분 분해는 엔진 소관이므로 B>C 비교는 총액 수준으로 충분하다 |
| E-10 | `giftTax.besshi10Rows` | 있다 — `TransferBurdenedGiftBreakdown.giftTax`를 그대로 재사용(§3.5) |
| E-11 | `warnings` | ① 다주택 중과 한시 배제 적용 고지(`burdenedGiftSurchargeSuspendedNotice`, 단건 `transfer-tax.ts:571-572` 선례) ② 위 Q-1 «확인 필요» 고지 ③ 시가 총액을 기준시가 비율로 주택/상가에 나눈 사실(Q-2 α) ⑤ **(R2) 채무 귀속은 사용자 선언 + 증빙 필요, 불분명분 안분은 확인 필요(V-17), 본문+비고가에서 귀속 적용은 확인 필요(V-19)** ④ 증여세 평가용 상가건물 기준시가를 양도세 기준시가와 같다고 본 사실(Q-6 α) |
| E-12 | 사이드바 echo | `burdenedGift.perPart` 합(양도가액·취득가액·필요경비) + `assumedDebtAmount`. **R2: `debtRatio`는 단일 값이 아니다** — `debtAttribution.housingRatio`·`commercialRatio`를 읽는다. 클라이언트 재계산 금지 |

## 9. UI 설계서와의 범위 정리 (R2 — UI 문서는 수정하지 않는다)

UI 설계서(`transfer-burdened-gift-mixed-use.ui.design.md`, 571줄 완성본)를 읽고 어긋나는 지점을 정리한다.

| # | UI 설계서 | 이 엔진 설계 | 정리 |
|---|---|---|---|
| ① | P1 = **단건·단독소유·매매 취득**. 상속·증여 취득은 **P1 차단**(X-5·X-6, Q-1·Q-6): 겸용 패널 «상속개시일 신고가액 직접 입력(선택)»의 **미입력 시 보충적평가 자동 사용** fallback이 BG K-4 총액과 같은 값을 두 곳에서 받는 정본 충돌 | 엔진은 §3.3에서 상속·증여 취득 지원(**M-6**) | **엔진 가드 = 상한, UI 노출 = 부분집합.** M-6은 «엔진 능력 anchor»로만 유지하고 UI가 열 때까지 **UI에서 도달 불가**다. 엔진은 UI가 지적한 fallback 충돌을 **엔진 쪽에서 선제 해소**한다 — BG 겸용에서는 상속·증여 reported 평가액 미입력을 보충적평가로 메우지 않고 **MB-11 오류**(§3.3). 그러면 UI가 Q-6을 풀어 열 때 정본 충돌이 남지 않는다. 3층 parity 격자에 «UI 허용 ⊂ 엔진 허용»을 anchor로 고정 |
| ② | «신규 `AssetForm` 필드 **0**»(모델 A, §0·§6.1) · ④ housing 관행 합계 전송(§6.2) | D-7 때문에 **귀속 입력이 필요하다.** ④ 합계 전송은 그대로 정합(E-5) | **UI 후속 필요**: ⓐ 임대보증금을 주택/상가로 분리 입력(또는 귀속 선택) ⓑ 담보차입금 귀속 선택(주택/상가/구분 불분명) ⓒ 합이 `bgLendingDepositTotal + bgMortgageDebtAmount`와 일치 ⓓ MB-13·MB-14를 ⑧에서 같은 leaf로 사전 차단 ⓔ ①②③ 동기화 3지점 변경 발생(마이그레이션 필요). UI 문서 §6.1의 «변경 0»은 낡았다 |
| ③ | 지원 매트릭스 X-1~X-15 | MB-1~MB-14 | 번호 체계는 다르다(UI = 화면 게이트 X-n, 엔진 = 입력 가드 MB-n). 대응: X-9↔MB-2 · X-10↔MB-4 · X-11↔MB-3 · X-13↔MB-5 · X-14·X-15↔MB-6 · X-7↔MB-9. **MB-7(담보·임대 승)·MB-14(부분 초과)·MB-13(귀속 필수)에 해당하는 UI 행이 없다** → UI 후속 |
| ④ | X-12 «토지·건물 취득일 다름 — 엔진 의존» | 엔진 **지원**(B0, V-15 확인 필요) | UI Q-8 «엔진 모델 A면 허용»에 해당 — 허용 가능. 단 V-15 해소 전 안내 문구에 «확인 필요» 병기 권고 |
| ⑤ | Q-4 «증여세용 평가액 override 칸 겸용에서 숨김» | Q-6(α) 동일, ⑫가 `giftBuildingStdPriceAtTransfer` 거부 | 일치 |
| ⑥ | E-2 «`calculationRoute.acquisitionConversionRoute`에 §159 값 추가?» | 추가하지 않음, `burdenedGift` 존재로 분기 | 일치할 필요 없음 — UI가 이 방식으로 분기해야 한다 |
| ⑦ | §6.4 사이드바 «양도가액 합 = 주택분+상가분» | 귀속에서 한쪽이 0일 수 있음 | 합은 그대로 B. 단 표시에서 «양도 없음»인 부분을 «비과세»로 읽히지 않게(`transferred:false`) |
| ⑧ | §10 Q-5 «K-6/K-7 P1 포함은 엔진 응답에 따라» | **포함 가능**(개산공제 base = 취득시 4부분 기준시가 × B_part'/C_part, §3.2) | UI 추가 0으로 열 수 있음 |
| ⑨ | §11 E-9 B/C>1 사전 차단 | MB-10(합계) + **MB-14(부분)** | UI는 합계 비교만으로는 부족 — 부분 비교가 필요하며 C_h는 같은 leaf(`apportionByStdPrice`)로 클라이언트에서 계산 가능 |

**M-6(상속 취득)과 UI Q-6의 관계 요약**: ① 엔진 M-6은 «reported 평가액을 입력했다»는 전제에서만 성립 ② UI P1은 상속 취득을 아예 안 연다 ③ 엔진은 미입력 fallback을 쓰지 않으므로 UI가 나중에 열더라도 충돌이 없다 ④ 그때까지 M-6은 엔진 단위 anchor다.

## 10. R3 — UI 설계서 R2(§11 RES-1~7 · §16 불일치 10건)에 대한 수용/반박 (UI 문서는 수정하지 않는다)

코드 사실은 이 작업에서 다시 열어 확인했다(`transfer-tax-validate-mixed-use-asset.ts:84·135`, `components/calc/CLAUDE.md:121`, `GiftTaxResultView.tsx:461`, `lib/stores/transfer-per-asset-summary.ts` 존재, C_h 동치 20,000건 probe).

### 10.1 불일치 1~10

| # | UI 지적 | 판정 | 근거 · 엔진 문서 수정 |
|---|---|---|---|
| 1 | UI는 항목마다 5택(주택/상가/구분 불분명/나누어)·8필드, 엔진 문서는 «임대보증금은 임차 대상이 곧 귀속» | **수용** | 엔진은 합성 후 `debtAttribution` 3값만 받으므로 충돌 없음. 임대보증금도 일괄 임대면 «구분 불분명», 담보차입금은 여러 건이면 건별 귀속이 다를 수 있다 — §3.1A 힌트 문구 정정 |
| 2 | 엔진 §3.6 ⑧ «기준시가는 `validateMixedUseAsset` 소관» → 막다른 길 | **수용(초판 철회)** | `validate-mixed-use-asset.ts:84`는 매매 + `!useEstimatedAcquisition`이면 `fixedAcquisitionPrice`/`similarSalesValue` 총액을 요구, `:135` 이하는 `useEstimatedAcquisition` 기반 취득시 요구 — BG 화면에는 그 칸이 없다. **⑧ = `validateMixedUseBurdenedGift` 분기**(§3.6 ⑧ 행 개정): 공통 + 4부분 기준시가(기존 술어 재사용) + BG 입력 + MB collector 호출 |
| 3 | MB-11이 취득시 4부분을 «기준시가 모드»에만 열거 | **수용** | 엔진 산식이 모드와 무관하게 취득시 공시지가·상가건물·나목을 쓴다(§3.7 MB-11 개정: K-4 = §100② 분해 비율·실비 분배, K-6/K-7 = 같은 분해 + 개산공제 base, 상속·증여 = reported 평가액 분해). 취득시 개별주택가격 H_A는 기존 `isHousingPriceAtAcqRequired`대로(상속·증여만 선택). UI V-4가 맞다 |
| 4 | `C_h` 서술 두 벌(§3.1 기준시가 모드 «주택분 기준시가» vs §3.1A 두 모드 `apportionByStdPrice…land`) | **수용** | 한 식으로 통일. `C = Hs + Cs`일 때 정수 체인 결과가 `Hs`와 정확히 같음을 실측(무작위 20,000건 불일치 0) — 서술만 다르고 값은 같았다 |
| 5 | `Omit`에 `debtRatio`·`gratuitousPortion`이 남음 | **수용(부분)** | `debtRatio`는 Omit + `debtAttribution`의 부분별 비율 사용. `gratuitousPortion`은 **유지**: C − B(총액)는 증여세 과세가액의 출발점이라 귀속과 무관하게 의미가 있다(§3.5 정의 주석). 파생으로 `convertedAcquisitionBeforeSwap`·`acquisitionStdForcedByCollateral`·`ownershipRatio`도 겸용에서 의미 없어 Omit, 단서 채택 전 값은 `perPart[*].acquisitionBeforeSwap` |
| 6 | 엔진 문서가 사이드바 지점을 `computeTransferSummary`로 표기 | **수용** | 정본 `lib/stores/transfer-per-asset-summary.ts` (`components/calc/CLAUDE.md:121`) — §3.6 ⑥ 행 정정 |
| 7 | `BurdenedTransferTaxResultCard`를 겸용 결과 표시처로 열거 | **수용** | 증여세 결과뷰(`GiftTaxResultView.tsx:461`)에서만 렌더. §3.8 정정 — 겸용 BG 종착지는 `MixedUseResultCard` |
| 8 | UI 허용 ⊂ 엔진 허용 anchor | 일치 | |
| 9 | MB 번호 순서 | 무영향 | |
| 10 | 신축 취득 언급 없음(UI X-8은 막음) | **수용 → MB-15 신설** | 겸용 입력에 신축 필드가 없고 ⑧은 신축을 환산 경로로 취급, §114조의2 미구현(V-6)이라 K-5·K-7이 가산세 없이 계산된다. 엔진도 전면 차단(⑭가 `acquisitionByNewConstruction` 플래그를 싣는다) |

**반박한 항목: 없음.** 단 5번은 `gratuitousPortion`을 남긴다는 점에서 UI 지적을 부분 수용했다.

### 10.2 RES-1~7 회신

| RES | 회신 |
|---|---|
| **RES-1** | **수용·구조 확정.** 클라이언트 번들 누출 방지를 위해 파일을 둘로 가른다. ① `lib/tax-engine/mixed-use-burdened-gift-prepare.ts` — **순수·무서버 import**: `collectMixedBurdenedGiftIssues`·`prepareMixedBurdenedGift`(B·C·C_h/C_c·귀속 안분 `B_h'`/`B_c'`·비율). 의존은 `std-price-apportion`·`mixed-use-housing-std`·`mixed-use-derived-areas`·`area-utils`·`burdened-gift-valuation`(이미 클라이언트가 import하는 leaf)뿐이며 `tax-errors`(`TaxCalculationError`)·`gift-tax`·`legal-codes` 등을 import하지 않는다. ② `mixed-use-burdened-gift.ts` — 엔진 전용: `applyMixedBurdenedGift`·breakdown·증여세·`TaxCalculationError` throw(`issues[0].message`). 이슈 타입 `MixedBgIssue = { code: "MB-1"…"MB-15"; message: string; path: string[]; part?: "housing" \| "commercial" }` — UI 점프 field 매핑·MB-14 규칙(초과한 부분)에 필요. ①이 ②·서버 모듈을 끌어오지 않음을 정적 anchor(import 그래프)로 고정 |
| **RES-2** | `perPart[*].transferred`의 정의 = **그 부분(주택 쪽/상가 쪽)이 양도로 보는 채무액을 가졌는가** (`B_part' > 0`). 세 가지를 구별한다: ⓐ 주택 두 부분(주택부수토지·주택건물)은 주택 쪽 값을 공유, 상가 두 부분은 상가 쪽 값을 공유 ⓑ **배율초과 비사업용토지 몫은 `transferred`와 무관** — 그 몫은 양도하는 부분의 토지 양도차익에서 떼어 내는 별도 파트(`nonBusinessLandPart`)이므로 주택분 `transferred`가 true일 때만(귀속 주택) 또는 §154③ 본문 의제 시 상가 토지에서 생긴다(M-16b: 주택 `transferred:false`인데 상가 토지의 비사업용 몫 58,333,333이 과세 — `nonBusinessLandPart`가 별도로 표시) ⓒ `transferred`는 «세법상 분류(비과세/과세)»가 아니라 «양도 여부» — 비과세여도 양도했으면 true. UI 배지 «양도 없음»은 이 값만 본다 |
| **RES-3** | §10.1 #5와 같다: `debtRatio`(단일) Omit, `gratuitousPortion` = C − B 유지(증여세 쪽). 결과뷰는 부분별 비율(`debtAttribution.housingRatio/commercialRatio`)을 쓴다 |
| **RES-4** | §10.1 #3 — **요구한다**(MB-11 개정) |
| **RES-5** | §10.1 #10 — **허용하지 않는다**(MB-15 신설) |
| **RES-6** | **수용.** MB-1 메시지에서 «단일 자산 모드» 안내 제거, BG 가드를 STEP 1 앞에서 평가(§3.7 MB-1 개정) — 기존 `buildRejectionResult`가 BG에 나가지 않는다 |
| **RES-7** | **확인·성립.** ⑫/MB-13의 합 검사 `housing + commercial + unallocated = lendingDepositTotal + mortgageDebtAmount`는 겸용 BG **단건**에서만 의미가 있다 — 겸용에서는 `assumedDebtOverride`가 MB-12로 거부되고(컴패니언·축 B는 MB-6으로 차단) `computeDebtRatio`의 `assumedDebtOverride ?? 합`(`burdened-gift-valuation.ts:271-`)이 항상 합으로 간다. 컴패니언(P2)이 열릴 때 B가 신고 단위 재배분값(`assumedDebtOverride`)이 되므로 그때 합 기준을 `assumedDebtOverride ?? 합`으로 바꾸는 별건 설계가 필요하다 |

### 10.3 UI 문서와 남은 불일치

**없음**(엔진 문서 쪽에서 UI R2의 10건·RES-1~7을 전부 반영/회신했다). 아래는 불일치가 아니라 **UI 구현 시 엔진 문서에서 확정된 계약을 따르면 되는 항목**이다.

- UI §3.3·§6.6의 MB 대응에 **MB-15 ↔ X-8** 행을 맞춘다(번호만 추가).
- UI §11 E-9·V-11의 MB-14 사전 차단은 엔진 `prepareMixedBurdenedGift`(RES-1 ①)를 호출하면 된다.
- 결과 echo 필드명: `perPart[*].transferred` · `debtAttribution.*` · `highValue.applicable` · `perPart[*].acquisitionBeforeSwap`(§3.5).

## 부록 A — 재현

- 기준선·§1.2·§1.3 probe: `calcMixedUseTransferTax(…)` 직접 호출(스크래치 `p1`·`p4`).
- §3.1 절사 probe: `apportionByStdPrice`·`safeMultiplyThenDivide` 조합, 고정시드 LCG(스크래치 `p2`·`p5`).
- §4 프로토타입: 위 기존 하위 함수 조합(스크래치 `p3`). 귀속 anchor는 스크래치 `p6`(귀속 안분 + 같은 하위 함수 조합). **워크트리에는 어떤 probe 파일도 남기지 않았다.**
