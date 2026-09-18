# §45의5 특정법인과의 거래 이익 — UI 설계 (ui.design)

> Plan: `docs/00-pm/gift-specific-corp-45-5.plan.md` · Engine: `gift-specific-corp-45-5.engine.design.md`.
> 진입: 단일 페이지 `app/calc/gift-deemed/page.tsx` → `DeemedGiftCalculator` → `SpecificCorpFields`(type="specific_corp"). 결과 `DeemedGiftResultView`.

## 1. 개요
현행 `other-forms.tsx:347` `SpecificCorpFields`(3필드 단일 1인)를 **모드 토글 + 다주주 roster + 법인세 안분 입력 + 결과 2표**로 확장. 기존 single 경로 회귀 0(`scMode="single"` 기본).

## 2. 케이스별 UI 시나리오

| 케이스 | scMode | scCorporateTaxMode | 입력 | 결과 |
|---|---|---|---|---|
| 기존 단순 | single | direct | 거래이익·법인세상당액·지분율 | breakdown 요약(현행) |
| 사례 1 | roster | direct(법인세 0) | 거래이익 10억 + 주주 4행(부 isDonor·직원 타인·장남·차남) | 주주별 표(장남 2.5억 과세) |
| 사례 2 | roster | auto | 거래이익 30억 + 산출세액 780백만·소득 40억 + 주주 4행 | 주주별 표 + 갑 한도표(189백만·자진 183,330,000) |

## 3. 폼 필드 (deemed-form-state.ts) — ①폼상태 ②initial

```ts
// ScShareholderRow (폼-측, string 입력)
interface ScShareholderRow {
  id: string; name: string;
  relation: ScRelation;   // 직계존속/직계비속/배우자/형제자매/기타친족/타인 (※ "증여자 본인"은 relation 아님)
  shares: string;         // 주식수 (CurrencyInput)
  isDonor: boolean;       // 증여자 본인 체크 → 과세제외(donor_self). relation과 독립
}
```
| 폼 필드 | 초기값 | 비고 |
|---|---|---|
| `scMode` | `"single"` | RadioCardGroup sky |
| `scCorporateTaxMode` | `"direct"` | RadioCardGroup amber |
| `scPriorTransactions` | `undefined` | §43²·영 §32의4 11호 — 소급 1년 이내 **같은 호** 선행거래 행(거래일·이익·라벨). 윈도 판정·합산은 엔진(UI 재계산 금지) |
| `scCorpTaxAssessed` | `""` | auto: 법인세 산출세액 (「법인세법」 §55① — §55의2분 포함 금액) |
| `scCorpTaxLandTransfer` | `""` | auto: 토지등 양도소득 법인세액(§55의2) — 영 §34의5④2호가목 제외항목. ⑧이 산출세액 초과를 차단(자동 clamp 금지) |
| `scCorpTaxDeduction` | `""` | auto: 공제·감면 |
| `scCorpIncome` | `""` | auto: 각사업연도소득금액(분모) |
| `scTotalShares` | `""` | 발행주식 총수(분모) |
| `scShareholders` | `undefined` | **3-state** (undefined OFF / [] ON빈 / [...] 데이터) |
| `scSelectedDoneeIndex` | `0` | 결과 수증자 선택 |
| `scGiftDeduction` | `""` | §45의5② 한도 ㉮㉠ 증여재산공제(교재 5천만) |

③ normalize: 구버전 sessionStorage에 신규 키 없음 → `scShareholders=undefined`·`scMode="single"` 보장.

## 4. 입력 위젯 (⑤) — other-forms.tsx + 신규 SpecificCorpShareholderTable.tsx

```
┌─ §45의5 특정법인과의 거래 ─────────────────────────┐
│ [입력 방식]  ( ) 지분율 직접   (•) 주주 명단        │ ← scMode RadioCardGroup(sky)
│ ┌ 거래상대방·거래유형 (§45의5①) ────────────────┐  │ ← 섹션 2 (rose)
│ │ ( ) 지배주주 본인 (•) 지배주주의 특수관계인      │  │ ← scCounterparty (""=미선택 → ⑧ 차단)
│ │ ( ) 그 밖의 자    ※ 3의2호면 「본인」 후보 제거  │  │    영 §34의5②
│ │ 유형 (•)1호 무상 ( )2호 저가양수 ( )3호 고가양도 │  │ ← scTransactionType
│ │      ( )3의2호 자본거래 ( )4호 채무면제          │  │
│ │  · 2·3호 → 시가[ ] 대가[ ] + 현저성 echo         │  │    영 §34의5⑦ (30% **또는** 3억)
│ │  · 그 밖 → 거래이익[ ]                           │  │    영 §34의5④1호가목
│ │  · 4호  → ☐해산 중·잔여재산 없음(제외)           │  │    영 §34의5⑥ 단서
│ │  · 3의2호 → 준용계산 안내(CollapsibleHintCard)   │  │    영 §34의5④1호나목
│ └──────────────────────────────────────────────┘  │
│ ┌ 법인세 상당액 ──────────────────────────────┐    │
│ │ (•) 직접 입력   ( ) 산출세액+소득금액 자동안분 │    │ ← scCorporateTaxMode(amber)
│ │  · direct → 법인세 상당액 [   0 ] 원(이월결손금 0) │
│ │  · auto   → 산출세액 [ ] 토지등(§55의2) [ ]         │
│ │            공제·감면 [ ] 소득금액 [ ]                │
│ │            ↳ 안분액 = 산출세액×min(거래이익/소득,1) (useMemo echo, 표시전용) │
│ └──────────────────────────────────────────┘    │
│ [single] 해당 지배주주등(수증자)의 보유비율 [ 25 ] % │ ← scRatioPct (single만·ⓑ 승수)
│ [roster] 발행주식 총수 [   50,000 ]                 │ ← scTotalShares
│   ┌ 주주 명단 ──────────────────[+ 행 추가]┐       │ ← SpecificCorpShareholderTable
│   │ 성명[부]   관계[직계존속▾] 주식수[20,000] ☑증여자 │  data-testid="sc-sh-row-0"
│   │ 성명[직원] 관계[타인▾]     주식수[15,000] ☐증여자 │
│   │ 성명[장남] 관계[직계비속▾] 주식수[12,500] ☐증여자 │
│   │ 성명[차남] 관계[직계비속▾] 주식수[ 2,500] ☐증여자 │
│   │   ↳ 각 행에 ☐법인주주 chip (켜면 증여자 chip 숨김) │
│   │   ↳ 증여자와의 관계[직계존속→성년▾] ☐세대생략     │    §53 공제 / §57 할증
│   │   ↳ ☑증여자 본인 — 켜면 나머지 행이 꺼진다        │    §45의5①(거래 단위)
│   └────────────────────────────────────────┘       │
│   ┌ 간접출자관계 ─────────────[+ 행 추가]┐         │ ← SpecificCorpIntermediaryTable
│   │ 경유 법인[A법인▾]                        │        data-testid="sc-im-row-0"
│   │  · 개인 소유주[갑▾] 지분[100] %          │        법인의 특정법인 지분은
│   └────────────────────────────────────────┘         주주 행 주식수를 그대로 쓴다
│ 지배주주등 합계 보유비율(직접+간접) [ 35 ] %        │ ← scGroupRatioPct (ⓐ 해당성·공통)
│ 증여재산공제(한도용) [ 50,000,000 ] 원              │ ← scGiftDeduction
└────────────────────────────────────────────────┘
```
- **ⓐ/ⓑ 두 비율을 라벨로 갈라 둔다.** `scRatioPct`는 상증령 §34의5⑨의 **인별 승수**,
  `scGroupRatioPct`는 법 §45의5①의 **법인 해당성**(지배주주와 그 친족 전원 합계, 직접+간접)이다.
  종전 라벨이 둘 다 「지배주주등 주식보유비율」이라 사용자가 그룹비율을 넣으면 승수로 곱해졌다.
- **「관계」와 「증여자와의 관계」는 다른 축이다.** 앞은 «지배주주와의» 관계로 `isRelated` 판정에만
  쓰이고, §53 공제가 요구하는 것은 «증여자와의» 관계다. 재사용하면 조용히 틀린 공제가 붙는다.
- **증여자 chip은 상호배타다** — 켜면 나머지 행이 꺼진다(⑧·⑫와 같은 규칙, 3중 패턴).
- **2·3호는 「거래이익」 칸이 사라진다.** 이익이 시가−대가로 «도출»되기 때문이다(영 §34의5④1호다목).
  입력칸을 남겨 두면 도출값과 입력값 두 개의 진실이 생긴다 — ⑧도 2·3호에선 거래이익을 요구하지 않는다.
- **현저성 echo는 표시 전용**이다(`useMemo`, store 역기록 금지). 실판정은 엔진이 한다.
- **간접보유는 「직접보유 주식수」 칸에 섞어 넣지 않는다.** 그 칸은 직접분 전용이고, 법인 경유분은
  「간접출자관계」가 받는다 — 경유 법인의 특정법인 지분은 **그 법인의 주주 행 주식수**를 쓰므로
  두 곳에서 따로 받지 않는다(§45의3은 따로 받아 교차검증이 없다 — RC-L).
- `scGroupRatioPct` 미입력의 의미가 모드별로 다르다 — roster는 「간접보유 0%」, single은 「판정 보류」.
  hint가 그 차이를 각각 적는다(엔진 `specific-corp.ts` JSDoc이 근거).
- 관계 드롭다운: native `<select>` 허용(행 다수) — `SelectValue` 라벨 명시. native radio/checkbox 신규 금지이나 `<select>`는 허용. 증여자 체크박스는 `ToggleCard chip` 또는 행-내 Switch.
- 색상 카드 + 섹션 번호(sky/amber) 패턴.

## 5. 결과뷰 (⑦) — DeemedGiftResultView, `result.type==="specific_corp" && result.specificCorpMulti`

### 5-1. 주주별 증여가액 표 (`specificCorpMulti.donees`)
```
특정법인의 이익 2,415,000,000  (거래이익 3,000,000,000 − 법인세 안분 585,000,000)
┌ 성명 │ 관계   │ 주식수  │ 지분율 │ 계산식              │ 증여재산가액  │ 과세여부 ┐
│ 갑   │ 직계비속│ 60,000 │ 60%   │ 2,415,000,000×60%  │ 1,449,000,000 │ [과세]   │
│ 부   │ 직계존속│ 20,000 │ 20%   │ 2,415,000,000×20%  │   483,000,000 │ [본인증여 제외]│
│ 을   │ 형제자매│  3,000 │ 3%    │ 2,415,000,000×3%   │    72,450,000 │ [1억 미만 제외]│
│ 병   │ 타인   │ 17,000 │ 17%   │ 2,415,000,000×17%  │   410,550,000 │ [비특수관계인 제외]│
└────────────────────────────────────────────────────────────────────┘
```
- 성명 셀: `name.trim() || RELATION_LABEL[relation]` (내부 id 노출 금지). 금액 셀 `text-right font-mono tabular-nums`(amount-column-align).
- 과세여부 배지: 과세=emerald / donor_self="본인증여 제외" / non_related="비특수관계인 제외" / below_threshold="1억 미만 제외"(static tone Record).

### 5-2. §45의5② 한도 표 — **두 모드 공용** (`ScLimitTable`)

- roster: `sc-multi-limit` 카드 안 · 수증자 드롭다운(`scSelectedDoneeIndex` → `donee.limitCalc`)
- single: `sc-single-limit` 카드 안 · `result.specificCorpLimit` (수증자 1인이라 드롭다운 없음)

종전에는 이 표가 roster 전용이라, 기본 모드(single) 사용자는 한도를 볼 수 없었고 섹션 5의
증여재산공제 입력이 엔진까지 도달한 뒤 버려지는 «죽은 칸»이었다. 조문에 입력 모드 축이 없으므로
정본은 「single에서 칸을 숨긴다」가 아니라 「single에도 한도를 계산한다」다.

```
증여세 한도 (§45의5②) — 수증자: 갑 ▾
 ㉮ 일반 산출세액                                   399,600,000
 ㉠ 직접증여 가정 산출세액                           540,000,000
 ㉡ 법인세 상당액 × 지분율                           351,000,000
 ㉯ 한도액 = ㉠ − ㉡                                189,000,000
 ─────────────────────────────────────────────
 적용 산출세액 = Min(㉮, ㉯)                        189,000,000
 신고세액공제 (3%)                                   −5,670,000
 자진납부세액                                       183,330,000
```
> **이 값이 마법사까지 간다.** 「이 금액으로 증여세 계산하기 →」가 `EstateItem.deemedGiftTaxCap`으로
> ㉯를 실어 보내고 증여세 본엔진이 산출세액을 자른다. 종전에는 한도 前 가액만 넘어가 같은 사안에
> 두 개의 세액(183,330,000 ↔ 387,612,000)이 나왔다. 다른 증여재산·사전증여가 섞이거나 공제·가액이
> 달라지면 적용하지 않고 **결과 경고**로 알린다(§45의5에 안분 규정이 없다).
- 펼침 토글(`ExpandToggleButton`)·print 자동펼침(print-only-css-toggle). 산식 한국어 풀어쓰기(floor 미표시).

## 6. 14 동기화 지점 (신규 필드 도달 경로)

| # | 위치 | 변경 |
|---|---|---|
| ① 폼상태 | `deemed-form-state.ts` | 9필드 + ScShareholderRow |
| ② initial | 동 INITIAL | scMode="single"·scShareholders=undefined 등 |
| ③ normalize | 동 normalize | 구버전 undefined 보장 |
| ④ API변환 | `gift-deemed-api.ts:472` | roster→shareholders[]·auto 시 raw 4필드 전달(안분은 엔진), giftDeduction |
| ⑤ 위젯 | `other-forms.tsx`+`SpecificCorpShareholderTable.tsx` | §4 |
| ⑥ 사이드바 | — | deemed-gift 사이드바 합계 없음 → N/A |
| ⑦ 결과 | `DeemedGiftResultView` | §5 2표 |
| ⑧ validate | `gift-deemed-validate.ts:236` | 4분기(아래) |
| ⑨/⑫ Zod | `gift-deemed-input.ts:319` `specificCorpSchema` | **shareholders[]·annualIncome·corporateTaxComputed·corporateTaxCredit·giftDeduction 추가** (TS 미감지) |
| ⑩ companion | — | single union → N/A |
| ⑪ fallback | — | direct corporateTax="" →0, validate 동기화 |
| ⑬ body spread | `gift-deemed-api.ts` | scShareholders→shareholders 누락주의(grep) |
| ⑭ route | `app/api/calc/gift-deemed/route.ts` | specific_corp 분기 신규필드 엔진 전달 |

⑧ validate 4분기: single+direct(현행) / roster+direct(shareholders.length>0·각행 name·shares·scTotalShares>0; corporateTax=""→0 허용) / roster+auto(+scCorpTaxAssessed·scCorpIncome>0 필수) / single+auto.

## 7. 정책 준수 체크
- **3-state**(`feedback_three_state_optional_mode_toggle`): scShareholders undefined/[]/[...]; scMode가 명시 모드 진실, length로 derive 금지.
- **자동안분 fallback 금지**(`feedback_no_silent_apportion_fallback`): auto 모드 scCorpIncome 미입력 0 채움 금지(÷0) → validate `>0` 차단.
- **useEffect 미러링 금지**(`feedback_useeffect_store_mirror_forbidden`): 법인세 안분 echo는 useMemo 표시전용, store 역기록 금지. 실계산은 엔진(④에서 raw 전달).
- **내부 id 노출 금지**(`feedback_no_internal_id_in_result`): 표시셀 name||RELATION_LABEL.
- **explicit prop strip**(`feedback_explicit_prop_mapping_strip`): ⑫⑬⑭ grep 자가점검.
- **static tone**(`feedback_tailwind_static_tone_mapping`): 배지 색 Record 정적 매핑.
- **dual-truth 회피**: 결과 표·한도 표는 엔진 echo(specificCorpMulti)만 렌더, UI 재계산 금지.

## 8. 컴포넌트 파일 구조
```
components/calc/deemed-gift/other-forms.tsx           — SpecificCorpFields(모드 토글·법인세·single) 확장 (<800 유지)
components/calc/deemed-gift/SpecificCorpShareholderTable.tsx — 신규(행 카드+추가/삭제, CapitalDecreaseShareholderTable 패턴)
components/calc/deemed-gift/deemed-form-state.ts      — 9필드+ScShareholderRow+initial+normalize
components/calc/results/DeemedGiftResultView.tsx      — specific_corp 분기(주주별 표 + single 한도 카드)
components/calc/deemed-gift/SpecificCorpPriorTxTable.tsx — §43² 소급 1년 선행거래 입력 테이블
components/calc/results/ScLimitTable.tsx              — §45의5② 한도 표 (single·roster 공용)
lib/tax-engine/deemed-gift-tax-cap.ts                 — 마법사 산출세액 상한 적용 판정(staleness 가드)
lib/calc/gift-deemed-api.ts / -validate.ts            — ④⑧⑬
lib/validators/gift-deemed-input.ts                   — ⑨⑫
app/api/calc/gift-deemed/route.ts                     — ⑭
e2e/gift-deemed-specific-corp.spec.ts                 — 사례2 입력→갑 1,449,000,000·한도 189,000,000
```
