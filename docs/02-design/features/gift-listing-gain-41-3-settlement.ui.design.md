# §41의3 상장이익 증여 정산 — UI 설계

> 계획서·엔진설계 동반 · self-review STEP 12 산출물 · 현행 `components/calc/deemed-gift/other-forms.tsx:254` `ListingGainFields` + `components/calc/results/DeemedGiftResultView.tsx` 확장

## 1. 입력 폼 (`ListingGainFields` 확장)

현행: RadioCardGroup(상장/합병상장) + 4 CurrencyInput. A0/A1은 **입력 변경 없음**(파생). 신규 입력은 P1(기업가치 자동계산)만.

```
┌ 상장·합병상장 이익 (§41의3·§41의5) ──────────── emerald ┐
│ ○ 상장 (§41의3)     ○ 합병상장 (§41의5)                  │
│ 정산기준일 1주당 평가가액        [        50,000 ]        │
│ 1주당 증여세 과세가액(취득가액)  [        10,000 ]        │
│ ┌ 1주당 기업가치 실질증가이익 ───────── ToggleCard ──┐  │
│ │ ○ 직접 입력   ○ 월수 산식 자동계산 (령§31의3⑤)     │  │
│ │ ─ 직접입력 모드 ─                                   │  │
│ │   1주당 값 [        27,000 ]                         │  │
│ │ ─ 자동계산 모드 ─ (corpGrowthAuto)                  │  │
│ │   사업연도별 1주당 순손익액(DecimalInput 배열 추가) │  │
│ │     ① [ 10,000 ] ② [ 15,000 ] ③ [ 5,000 ] [+행]   │  │
│ │   사업연도개시일~상장전일 월수 [ 30 ]               │  │
│ │   증여·취득일~정산기준일 월수  [ 27 ]               │  │
│ │   → 1개월 순손익 1,000 × 27개월 = 27,000 (echo)     │  │
│ └────────────────────────────────────────────────┘  │
│ 증여·유상취득 주식수             [        50,000 ]        │
└──────────────────────────────────────────────────────┘
```

- **자동계산 토글 = 3-state optional**(`feedback_three_state_optional_mode_toggle`): `corpGrowthAuto?: {...} | undefined`. undefined=직접입력 / 객체=자동계산. **length>0 derive 금지**, 명시 모드 상태.
- 자동계산 echo(27,000)는 `useMemo`로 파생 표시(useEffect→store 미러링 금지, `feedback_useeffect_store_mirror_forbidden`).
- 월수·순손익은 `DecimalInput`(정수 월수도 숫자) — CurrencyInput 아님(`feedback_decimal_input`). 단가 아닌 금액(순손익액)은 CurrencyInput.
- 구법(H, applyOldLaw): 증여일 < 2016.2.5 자동 판정 — **토글 아닌 파생**(증여일 입력에서). UI 안내 배지만.

testid: `lg-event-listing`·`lg-event-merger`(현행) / `lg-corp-growth-mode-direct`·`lg-corp-growth-mode-auto`(신규).

## 2. 결과뷰 (`DeemedGiftResultView` — direction 분기)

```
─ direction === "taxation" (과세) ─────────── rose ─
 증여재산가액 (증여이익)              650,000,000
 ┌ breakdown(7단계 산식) ──────────────────────┐
 │ 정산기준일 1주당 평가가액    50,000  §41의3③ │
 │ − 1주당 증여세 과세가액      10,000          │
 │ − 1주당 기업가치 실질증가    27,000  령§31의3⑤│
 │ = 1주당 이익                13,000          │
 │ × 주식수                    50,000          │
 │ 기준금액 Min((B+C)×30%,3억) 300,000,000 령③ │
 │ = 증여재산가액             650,000,000      │
 └──────────────────────────────────────────┘
 ※ 합산배제증여재산(§47①) — 10년 합산 제외, 개별 건별 과세  ← 신규 안내(amber)
 ┌ 정산 증여세 (§41의3④) ──────────────── 신규 ─┐
 │ 과세표준 = 650,000,000 − 감정평가수수료 − 3천만 │
 │ = 620,000,000  (§55①3호 · §53 미적용)         │
 │ 정산세액 = 정산 증여세 − 당초 증여세            │
 └─────────────────────────────────────────────┘

─ direction === "refund" (환급) ─────────── blue ──
 평가손실 환급 대상액                 500,000,000
 ※ 정산기준일 가액이 당초 증여세 과세가액보다 하락,
   차액이 기준금액 이상 → 당초 납부 증여세액 환급
   (§41의3④ 단서 · 령§31의3⑥). 경정청구로 환급.

─ direction === "none" (미달) ──────────── slate ─
 기준금액 미달 — 증여세 과세·환급 모두 없음
 (이익/손실 < Min((B+C)×30%, 3억))
```

- 과세→증여세 마법사 연계(현행 prefill 유지). **환급·미달은 마법사 미경유** — 결과뷰에서 종결(계획서 §2 A 정정).
- testid: `lg-result-direction-{taxation|refund|none}`.
- 인쇄: `print:block` CSS-only 펼침(`print-only-css-toggle`), 합산배제 안내·정산 카드 포함.

## 3. 사이드바 — **N/A** (실측 2026-06-25)
deemed 계산기(`components/calc/deemed-gift/`)에 사이드바 합계 컴포넌트 **없음**(grep 0건). 단건 결과 → 결과뷰 직접 표시. ⑥ 동기화 지점 N/A.

> 결과뷰 재사용(검토 #18): `DeemedGiftResultView.tsx:219` "정산 추납/환급"(`detail.settlement.isRefund`)·`:540` `rectification.refundableTax`가 §41의2 초과배당에 이미 구현됨. §41의3 환급/정산세액은 **이 패턴 재사용**(신규 컴포넌트 금지, `single-source-engine-helper` 정신). direction="refund" → 기존 환급 표시 분기에 매핑.

## 4. 14 동기화 — 클라이언트 8지점

| 지점 | 파일 | 변경 |
|---|---|---|
| ① 폼 상태 | `deemed-form-state.ts` | `lgCorpGrowthMode`·`lgNetIncomeByYear[]`·`lgMonths*`(P1만). A0/A1 변경 없음 |
| ② initial | 동 | 자동계산 필드 초기값 |
| ③ normalize | `gift-deemed-api.ts` | corpGrowthAuto 객체 빌드(모드=auto만), 직접입력 시 undefined |
| ④ API 변환 | `gift-deemed-api.ts` | 과세 prefill에 `isAggregationExcludedGift` |
| ⑤ UI 위젯 | `other-forms.tsx` | 자동계산 ToggleCard + 배열 입력 |
| ⑥ 사이드바 | — | **N/A**(deemed 계산기 사이드바 없음 — 실측) |
| ⑦ 결과 카드 | `DeemedGiftResultView.tsx` | direction 3분기 + 정산·합산배제 카드 |
| ⑧ validation | `gift-deemed` validate | 자동계산 모드 시 순손익 배열≥1·월수>0 / 환급 음수 perShareGain 허용 |

## 5. 정책 체크
- ToggleCard/RadioCardGroup 필수(native 금지) — 자동계산 모드 ToggleCard
- OFF tone 유지 / 정적 색조 매핑(`feedback_tailwind_static_tone_mapping`)
- 결과 산식 한국어 풀어쓰기(floor·변수약어 금지)
- 내부 id 노출 금지(`deemed-listing_gain` → "상장·합병상장 이익")
