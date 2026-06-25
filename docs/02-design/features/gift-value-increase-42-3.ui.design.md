# §42의3 재산 취득 후 재산가치 증가 — UI 설계

> 계획서: `docs/00-pm/gift-value-increase-42-3.plan.md` · 엔진설계: `gift-value-increase-42-3.engine.design.md`
> 대상: `components/calc/deemed-gift/other-forms.tsx` `ValueIncreaseFields`(:335) + `components/calc/results/DeemedGiftResultView.tsx`
> 범위: 4금액(기존) + 사유 2라디오 + 날짜 2 + 프리셋 4버튼 — 산식 불변, 적용요건 가시화

## 입력 위젯 — `ValueIncreaseFields` 확장 (⑤)

기존 4 CurrencyInput(rose-50 카드) 유지 + 위에 **사유 섹션**, 아래 **기간 섹션** 추가. 색상 카드 + 섹션 번호(memory `feedback_section_card_numbering`).

```
┌─ §42의3 재산취득 후 가치증가 ───────────────────────────────┐
│ [사례 프리셋]  ①형질변경  ②공유물분할  ③비상장상장  ④사업인허가  │  ← onClick setForm (useEffect 미러링 아님)
│                                                              │
│ ① 사유 (rose) ─────────────────────────────────────────────│
│  취득사유 (RadioCardGroup, layout="stack", tone="rose")       │
│   ○ 특수관계인 증여 (①1호)        gift                        │
│   ○ 내부정보 유상취득 (①2호)      inside_info                 │
│   ○ 차입·담보차입 자금 취득 (①3호) borrowed_funds             │
│  가치증가사유 (RadioCardGroup, layout="stack", tone="amber")  │
│   ○ 개발·형질변경·공유물분할·인허가(영①1호) development/...    │
│   ○ K-OTC 등록 (영①2호)          kotc_registration           │
│   ○ 코넥스 상장 (영①3호)          konex_listing               │
│   ○ 그 밖의 유사사유 (영①4호)      similar                     │
│     └▶ [amber] 유가·코스닥 상장은 §42의3 제외 → §41의3 상장이익 │  ← similar 선택 시
│                                                              │
│ ② 금액 (rose, 기존) ───────────────────────────────────────│
│  사유발생일 현재 재산가액   [        ] 원                      │
│  취득가액                   [        ] 원  (증여재산=증여세 과세가액)│
│  통상적인 가치상승분         [        ] 원                      │
│  가치상승기여분             [        ] 원  (자본적지출액 등)     │
│                                                              │
│ ③ 기간 (violet) ───────────────────────────────────────────│
│  취득일        [DateInput]                                    │
│  사유발생일     [DateInput]   └▶ 5년 이내 여부 자동 표시(echo)  │
└──────────────────────────────────────────────────────────────┘
```

- **사유 라디오**: `RadioCardGroup`(native radio 금지 — memory `feedback_toggle_card_visibility`). `options` 배열, 미선택 옵션도 tone 배경 유지.
- **가치증가사유**: **라디오는 영①호 단위(1·2·3·4호) 4옵션**(1호 4개 enum 펼침은 과설계). 1호 선택 시 내부 enum 기본 `form_change`, **`reasonLabel`은 묶음 라벨** "개발사업·형질변경·공유물분할·인가허가 등(영§32의3①1호)"로 표시 → 세부(partition·license) 수동 구분 불필요. 세부 enum은 **프리셋이 정확 set**(사례2=partition, 사례4=license).
- **날짜**: `DateInput`(type="date" 금지 — memory `feedback_date_input`). 둘 다 입력 시에만 5년 echo.
- **프리셋 4버튼**: `onClick={() => setForm({ ...INITIAL_DEEMED, type:"value_increase", viCurrentValue, viAcqCost, viNormalIncrease, viContribution, viAcqCause, viReason(세부 enum), viAcqDate, viEventDate })}` — 4금액+사유 2+날짜 2 **전체 set**. placeholder 숫자 금지 정책 무관(실입력값).
- 금액 필드: `CurrencyInput`(소수점 없음 — 원 정수).

## 결과 화면 — `DeemedGiftResultView` value_increase 섹션 (⑦)

```
┌─ 재산취득 후 가치증가 이익 (상증법 §42의3)  [법령]──────────────┐
│  취득사유      특수관계인 증여 (①1호)                          │
│  가치증가사유   형질변경 (영§32의3①1호)                         │
│  취득~사유발생  3년 (5년 이내 ○)                               │  ← withinFiveYears echo
│                                                              │
│  사유발생일 현재 재산가액            2,000,000,000             │
│  − 취득가액                          100,000,000              │
│  − 통상적인 가치상승분                 10,000,000              │
│  − 가치상승기여분                     20,000,000              │
│  ───────────────────────────────────────                    │
│  이익                              1,870,000,000             │
│  기준금액(차감합계×30%·3억 중 적은 금액)   39,000,000          │
│  증여재산가액                       1,870,000,000  [§42의3]    │
│                                                              │
│  ※ 증여세는 [증여세로 계산하기]로 이관 (증여재산공제·세율 §56 적용)│
└──────────────────────────────────────────────────────────────┘
   [similar 선택 시] ⚠ 현행 §42의3은 K-OTC 등록·코넥스 상장만 해당.
      유가증권·코스닥 상장 이익은 §41의3 상장이익으로 과세. [§41의3]
```

- 금액 칸: `text-right font-mono tabular-nums`(memory `amount-column-align`). 기존 `BesshiRow` 재사용.
- 5년 echo: `valueIncreaseDetail.withinFiveYears` ○/✗(undefined 시 행 생략).
- 사례3 amber: `valueIncreaseDetail.isExchangeListingNotice === true` 시 표시(reasonLabel 문자열 매칭 금지 — `feedback_enum_substring_match_forbidden`). `LawArticleModal legalBasis={GIFT.LISTING_GAIN}`.
- 산식은 기존 `breakdown` 렌더 재사용(한국어 풀어쓰기 — `feedback_result_view_korean_formula`).

## 8 동기화 지점 (UI 측)

| # | 지점 | 위치 | 작업 |
|---|---|---|---|
| ① 폼 | `viAcqCause`·`viReason`·`viAcqDate`·`viEventDate`: string | `deemed-form-state.ts:273` | 신규 |
| ② initial | `INITIAL_DEEMED` — `viReason:"form_change"`(기본)·나머지 `""` | `deemed-form-state.ts:465` | 신규 |
| ③ normalize | N/A (useState 로컬) | — | — |
| ④ API | `gift-deemed-api.ts:464` — enum 전달 + `acquisitionDate`/`eventDate`(date→ISO, 빈값 undefined) | 수정 |
| ⑤ UI | `ValueIncreaseFields` 라디오·날짜·프리셋 | `other-forms.tsx:335` | 수정 |
| ⑥ 사이드바 | N/A | — | — |
| ⑦ 결과 | value_increase 전용 섹션 + amber | `DeemedGiftResultView.tsx` | 신규 |
| ⑧ validate | `viCurrentValue>0` 유지 — 사유·날짜 미입력 **차단 안 함**(echo) | `gift-deemed-validate.ts:233` | 점검 |
| ⑫ Zod | `valueIncreaseSchema` + `acquisitionCause`/`valueIncreaseReason` z.enum optional + `acquisitionDate`/`eventDate` z.string optional | `gift-deemed-input.ts:313` | 수정 |

## testid

- 입력: `deemed-vi-cause-{gift|inside_info|borrowed_funds}` · `deemed-vi-reason-{1|2|3|4}` · `deemed-vi-acqDate` · `deemed-vi-eventDate` · `deemed-vi-preset-{1|2|3|4}`
- 결과: `deemed-vi-detail`(섹션) · `deemed-vi-exchange-notice`(amber)

## E2E (memory `feedback_browser_verify_with_playwright`)

`e2e/gift-deemed-value-increase.spec.ts`: 사례1 프리셋 클릭 → 계산 → 결과 증여재산가액 1,870,000,000 + 5년 ○ 확인 / 사례3 프리셋 → amber §41의3 안내 노출 확인.

## 정책 준수 체크

- [x] RadioCardGroup(native radio 금지) / DateInput(type="date" 금지) / CurrencyInput(금액)
- [x] 프리셋 `onClick setForm` — useEffect→store 미러링 아님(`feedback_useeffect_store_mirror_forbidden`)
- [x] 사례3 amber는 echo 판정(문자열 매칭 금지 — `feedback_enum_substring_match_forbidden`)
- [x] 5년·사유 미입력 차단 안 함(echo — `feedback_no_silent_apportion_fallback`)
- [x] 금액 칸 정렬(`amount-column-align`) · 결과 산식 한국어(`feedback_result_view_korean_formula`)
- [x] 색상 카드 + 섹션 번호(`feedback_section_card_numbering`)
