# 계획서 — 판정 메뉴 조정대상지역: 주소 문자열만 있을 때 계산기와 같은 판정

> 2026-11-06 · 기준 master `65307619f` · 선행: #2909(계산기 Step4를 건너뛰어도 주소 판정) · #2919(약칭 정규화) · #2926(결과 고지)
> 관련 결정: `one-house-judgment-step-reorder.plan.md` D-6(Q-3, 2026-09-23 구현) — 「주소(법정동코드) 있음 → 자동 판정 읽기 전용 · 없음 → 토글」
> 상태: **구현(Do)** — 2026-11-06 사용자 결정 Q-1 a · Q-2 a · Q-3 a · Q-4 a(권장안)

## 0. 한 줄 요약

판정 메뉴(1세대1주택 비과세 · 다주택 중과)는 법정동코드가 없으면 조정대상지역을 **토글 값만** 쓴다. 토글 기본값은 「아니오」다.
계산기는 같은 경우 **주소 문자열로 판정**한다(#2909). 그래서 같은 사실을 넘겨도 판정 메뉴는 비과세, 계산기는 과세가 나온다.
또한 판정 메뉴에는 「직접 만짐」 표지가 없다. 그래서 사용자가 판정 메뉴에서 고른 값도 계산기로 넘어가면 주소 판정에 덮인다.

D-6은 「코드 없음」을 하나로 묶었다. 그때는 계산기에도 주소 문자열 판정이 Step4 안에만 있었다. 이 계획은 그 분기를 둘로 나눈다.
- 주소 문자열 있음 → 계산기와 같은 판정(안 만진 토글은 주소 판정, 만진 토글은 그 값)
- 주소 없음 → D-6 그대로(토글)

## 1. 실측 (2026-11-06 · 이 브랜치 · throwaway probe — 판정 route ↔ 핸드오프 `toTransferFormPatch` → 계산기 ④ → 계산기 route)

공통: 1세대 · 양도 대상 주택 1채(매매) · 양도일 2026-06-01 · 양도가액 10억 · 취득가액 3억(계산기에서 입력) · 거주 0개월. ⑧ 오류는 모든 사례에서 판정 메뉴·계산기 모두 0건이다.

| # | 소재지(코드 없음 · 「입력한 주소를 그대로 사용」 경로) | 취득일 | 판정 메뉴 토글(양도·취득) | 판정 메뉴 본문 → 결과 | 계산기 본문 → 결과 |
|---|---|---|---|---|---|
| P-1 | `서울특별시 강남구 역삼동 1` | 2018-06-01 | 기본값(아니오·아니오) | [아니오, 아니오] → **비과세** | [조정, 조정] → **과세 230,967,000** |
| P-2 | `경기도 남양주시 화도읍 1` | 2020-12-01 | 아니오·아니오 | [아니오, 아니오] → **비과세** | [아니오, 조정(medium)] → **과세 250,371,000** |
| P-3 | `제주특별자치도 제주시 1` | 2018-06-01 | **예·예**(직접 고름) | [조정, 조정] → **과세** | [아니오, 아니오](low · 데이터 미수록) → **비과세 0** |
| P-4 | `서울특별시 강남구 역삼동 1` | 2015-06-01 | 예·예 | [조정, 조정] → 비과세 | [조정, 아니오] → 비과세 0 |
| P-5 | 법정동코드 `1168010100`(강남) | 2018-06-01 | 기본값 | [조정, 조정] → 과세 | [조정, 조정] → 과세 230,967,000 |

- P-1~P-3: 판정 메뉴와 계산기의 결론이 반대다. P-4는 본문의 취득 당시 값이 갈리지만 결론은 같다(2017-08-02 이전 취득). P-5(코드)는 같다.
- 다주택 중과 판정 메뉴 본문(`buildMultiHouseSurchargeApiBody`)의 `isRegulatedArea`는 P-1·P-2에서 `false`, P-3·P-5에서 `true`다 — 1주택 판정 메뉴와 같은 값이다(같은 본문을 공유한다).
- 핸드오프 뒤 계산기 폼의 직접 만짐 표지는 모든 사례에서 `[false, false]`다. 판정 메뉴가 표지를 세우지 않기 때문이다.
  P-3에서 사용자가 「예」로 고른 값이 계산기에서 주소 판정 「아니오」로 바뀐 이유가 이것이다.

## 2. 원인 (인용은 이 브랜치)

| 지점 | 현재 | 계산기의 같은 지점 |
|---|---|---|
| ④ 판정 메뉴 본문 `lib/calc/one-house-exemption-api.ts:155-162` | `stored: form.isRegulatedArea` · `calcEffectiveWasRegulatedAtAcquisition(primary, form.wasRegulatedAtAcquisition, …)` — 토글 저장값 | `transfer-tax-api.ts:506-508` — `calcStoredRegulatedFlags(form)`(주소 문자열 판정 + 직접 만짐 표지) |
| ⑧ `lib/calc/one-house-exemption-validate.ts:714` | `form.wasRegulatedAtAcquisition` 저장값 | — |
| ⑤ `app/calc/one-house-exemption/steps/Step3.tsx:137-142` | ⑳ 카드·입주권 카드에 넘기는 실효값 = 저장값 | — |
| ⑤ 토글 `Step3.tsx:357-386` | `onChange({ wasRegulatedAtAcquisition })` · `onChange({ isRegulatedArea })` — **표지를 세우지 않는다** | `Step4.tsx:474` · `SurchargeJudgmentSection.tsx:94` — 값과 함께 `*Touched: true` |
| 중과 메뉴 사이드바 `MultiHouseSurchargeSidebar.tsx:22-30` | 코드 없으면 「예/아니오 (직접 선택)」 | — |
| 핸드오프 `one-house-judgment-handoff.ts:102` | 판정 폼 키를 그대로 복사한다(표지 키도 복사 대상이다) | — |

- 계산기 leaf `calcStoredRegulatedFlags`(`effective-regulated-at-acquisition.ts:230`)는 주 자산이 주택 계열이고 주소 또는 코드와 양도일이 있을 때만 판정한다.
  직접 만짐 표지는 `isOneHouseExemptionAsset`(주택·재개발 완공 APT)일 때만 본다. 입주권·분양권은 표지를 보지 않는다(`:262`).
- 판정 메뉴 폼은 `TransferFormData` 슈퍼셋이라 두 표지 필드가 이미 있다(`one-house-judgment-form.types.ts:108`, 기본값 `false` — `calc-wizard-store.ts:86-87`).
  **새 필드는 없다.**

## 3. 권장 설계 (Q-1 a · Q-2 a · Q-3 a · Q-4 a 기준)

1. **④·⑧·⑤ 실효값을 계산기와 같은 leaf로 바꾼다.** 저장값 자리(`form.isRegulatedArea`·`form.wasRegulatedAtAcquisition`)에
   `calcStoredRegulatedFlags(form)`의 값을 넣는다. 별도 판정식은 만들지 않는다. 코드가 있을 때의 경로(D-6)는 그대로다 — leaf 안에서 코드가 이긴다.
2. **토글은 값과 표지를 함께 쓴다.** `onChange({ wasRegulatedAtAcquisition: v, wasRegulatedAtAcquisitionTouched: true })` — 계산기 `Step4.tsx:474`와 같은 모양.
3. **⑤ 표시 (Q-2 a).** 코드 없음 + 주소 문자열 있음 + 안 만짐이면 토글의 `checked`는 주소 판정값이다. 설명 줄에 「주소로 판정: {basis}」를 보인다.
   신뢰도가 high가 아니면 amber 한 줄을 더한다: 「주소만으로는 정확히 판정하지 못했습니다 — 소재지를 검색해 고르거나 직접 선택하세요」.
   직접 만진 뒤에는 설명이 「직접 선택」이다. 저장값을 바꾸지 않고 화면이 파생한다(useEffect 미러링 금지).
4. **입주권 양도 (Q-3 a).** 계산기 leaf처럼 표지를 보지 않는다. 그러므로 판정 메뉴도 이 경우 주소 판정을 읽기 전용으로 보인다(코드 경로와 같은 모양).
   토글을 두면 판정 메뉴에서만 반영되고 계산기로 넘기면 버려진다.
5. **옛 판정 기록 (Q-4 a).** `normalizeOneHouseJudgmentForm`(`one-house-judgment-form.types.ts:145`)에서 「값 `true` · 표지 `false`」이면 표지를 `true`로 세운다.
   지금까지 판정 메뉴의 `true`는 사용자가 고른 값뿐이다. `false`는 기본값과 구별할 수 없으므로 주소 판정을 따른다.
6. **중과 메뉴 사이드바**: 코드 없음 + 주소 판정이면 「예/아니오 (주소 판정)」, 직접 만졌거나 주소가 없으면 「(직접 선택)」.
7. **핸드오프는 바꾸지 않는다.** 표지가 이미 복사 대상이다. anchor로 운반만 고정한다(H-1).

## 4. 케이스 매트릭스 (Do anchor)

| # | 입력 | 기대 |
|---|---|---|
| J-1 | P-1(강남 문자열 · 기본값) | 판정 메뉴 본문 [조정, 조정] → 과세 · 계산기 230,967,000(같은 결론) |
| J-2 | J-1 + 취득 당시 토글 직접 「아니오」 | 판정 메뉴 비과세 · 핸드오프 표지 `wasRegulatedAtAcquisitionTouched: true` · 계산기 비과세 |
| J-3 | P-2(남양주 화도읍 · medium) · 안 만짐 | 본문 [아니오, 조정] · ⑤ amber 한 줄 · 두 메뉴 같은 결론 |
| J-4 | P-3(제주 · 직접 예·예) | 판정 메뉴 과세 = 계산기 과세(현재 계산기 0) |
| J-5 | P-5(코드 있음) | 변화 없음(읽기 전용 자동 판정) |
| J-6 | 주소 없음 | 변화 없음(토글 · 기본 아니오) |
| J-7 | 입주권 양도 + 강남 문자열 | ⑤ 읽기 전용 주소 판정 · 토글 없음 · 본문 [조정, 조정] |
| J-8 | 옛 record: 값 `true`·표지 `false` · 제주 문자열 | normalize 후 표지 `true` · 본문 [조정, 조정] |
| J-9 | 중과 메뉴 J-1 | 본문 `isRegulatedArea: true` · 사이드바 「예 (주소 판정)」 |
| H-1 | J-2 핸드오프 | `toTransferFormPatch` 결과에 두 표지가 그대로 있다 |

parity: J-1~J-4·J-7·J-9에서 ⑤ 표시값 = ④ 본문 값 = ⑧이 쓰는 값 = 핸드오프 뒤 계산기 ④ 값.

## 5. 결정 레지스터 (Q)

| Q | 질문 | 선택지 | 권장 |
|---|---|---|---|
| Q-1 | 코드 없이 주소 문자열만 있을 때 판정 메뉴의 값 | **a** 계산기와 같은 leaf(안 만짐 = 주소 판정) · b 토글 유지 + ⑧이 「예/아니오」 답을 강제하고 핸드오프 때 표지를 세움 · c 토글 유지 + 핸드오프 때만 표지를 세움(계산기가 판정 메뉴 값을 따름) | a — 두 화면이 같은 사실에 같은 값을 낸다. c는 P-1의 기본값 「아니오」를 계산기까지 퍼뜨린다 |
| Q-2 | ⑤ 표시 | **a** 토글 하나 · `checked` = 주소 판정값 · 설명에 근거 · 신뢰도 낮으면 amber · b 코드 경로처럼 읽기 전용(고치려면 소재지를 지워야 함) | a — 문자열 판정은 동·읍·면 예외를 못 본다(P-2). 고칠 길이 있어야 한다 |
| Q-3 | 입주권 양도 + 주소 문자열 | **a** 읽기 전용 주소 판정(계산기 leaf와 같음) · b 토글을 두고 판정 메뉴에서만 반영 | a — b는 핸드오프 뒤 값이 갈린다 |
| Q-4 | 옛 판정 기록의 저장값 | **a** `true`·표지 없음 → 표지 세움, `false` → 주소 판정 · b 모두 주소 판정(사용자가 고른 「예」도 덮음) · c 모두 표지 세움(옛 기본값 「아니오」가 남음) | a — 판정 메뉴에서 `true`는 사용자 선택뿐이다 |

## 6. 미검증 (V)

- V-1 이 변경으로 결과가 바뀌는 기존 vitest·E2E 시료 수 — 판정 폼에 `addressJibun`·`addressRoad`가 있는 vitest 20개 이상, 판정 메뉴 E2E 10개(grep). Do에서 전체 실행으로 센다.
  #2909처럼 단언은 바꾸지 않고 시료(표지·주소·코드)만 고친다.
- V-2 판정 메뉴 결과 화면에 #2926 같은 「확인 필요」 고지가 필요한가 — 이 계획은 ⑤ 안내까지만 한다. 결과 화면은 확인 필요.
- ~~V-3~~ 확인함: 계산기는 주소를 바꿔도 직접 만짐 표지를 지우지 않는다. 표지를 지우는 곳은 `Step4.tsx:276-283`(§154① 판정 대상이 아닌 자산 종류로 바뀔 때)뿐이다
  (표지를 쓰는 파일 grep = Step4 · `useRegulatedAreaAutoTip` · `SurchargeJudgmentSection` · store·타입 · `effective-regulated-at-acquisition` · `gift-burdened-one-house`).
  판정 메뉴도 같은 규약을 따른다 — 주소 변경 때 표지를 지우는 일은 이 계획 범위 밖이다.
- V-4 **실측함(2026-11-06 · throwaway probe — `computeInputHash`(record.inputData) ↔ `computeInputHash(normalizeOneHouseJudgmentForm(record.inputData))`)**:
  | 변경 전 코드가 저장한 기록 | 해시 | 바뀐 키 |
  |---|---|---|
  | 두 토글 아니오(기본) | 같음 | 없음 |
  | 취득 당시 예 | **다름** | `wasRegulatedAtAcquisitionTouched` |
  | 둘 다 예 | **다름** | 두 표지 |
  | 대조: 아니오 + 저장 뒤 생긴 키(`surchargeSellingRightValue`) 없음 | **다름** | 그 키 — 이번 변경 전부터 있던 현상 |
  - 판정 기록은 「주소+양도일」 키로 같은 record를 덮어쓰고 그때 `inputHash`를 다시 계산한다(`business-key.ts:85-93` · `calculation-repository.ts` `saveOrUpdateByBusinessKey`).
  - 그래서 ① 이 배포 전에 「예」 토글 기록을 계산기로 넘겼고 ② 그 기록을 다시 열어 ③ 다시 판정(자동저장)하면, 계산기 결과에 「원본 판정이 그 뒤에 바뀌었습니다」(`OneHouseJudgmentProvenanceLine.tsx:42-51`, amber)가 뜬다.
    사실은 바뀌지 않았으므로 거짓 경고다. 세액에는 영향이 없고, 해소는 경고 문구대로 다시 넘기기다. 다시 판정하지 않고 열기만 하면 저장되지 않아 경고도 없다.
  - **결정(2026-11-06 · 사용자 「a」)**: 그대로 두고 한계로 기록한다. 거짓 경고는 위 세 조건이 모두 맞을 때 한 번뿐이고, 다시 넘기면 사라진다. 저장 뒤 키가 늘 때마다 이미 생기던 현상(대조 행)과 같은 종류다.
    기각안 b — 정규화 대신 읽는 시점 판단(판정 메뉴 ④⑤⑧·핸드오프 4~5곳)은 해시를 지키지만 같은 규칙이 여러 곳에 퍼진다.
  - 기본값 「아니오」 기록은 해시가 같다. 그 기록의 판정이 P-1처럼 바뀌면 출처 줄은 「fresh」로 남고 판정 라벨만 새 값(record `resultData`)을 보인다 — 계산기는 #2909부터 이미 주소 판정으로 계산하므로 세액과 라벨이 맞는다.
- V-5 증여받은 주택의 세대 basis(`calcGiftHouseholdBasis`)와 주소 문자열 판정이 겹치는 경우 — 계산기 ④와 같은 인자 순서로 부르면 같은 값이다. anchor 1건으로 확인한다.

## 7. Do 범위 (예상 · 결정 뒤 확정)

- 코드: `one-house-exemption-api.ts` · `one-house-exemption-validate.ts` · `Step3.tsx` · `RegulatedAreaField.tsx`(문자열 판정 설명 prop) · `MultiHouseSurchargeSidebar.tsx` · `one-house-judgment-form.types.ts`(normalize)
- 테스트: `__tests__/calc/judgment-menu-regulated-address.anchor.test.ts`(J-1~J-9·H-1) · ⑤ UI 테스트 1개 · E2E 1개(「입력한 주소를 그대로 사용」 → 2-C 표시 → 계산기 핸드오프)
- 엔진·⑫·⑭ 변경 없음(본문 키는 그대로, 값만 바뀐다).
- 예상 시간: 코드 1시간 · 시료 정리 1~2시간(V-1 결과에 따라) · E2E 30분.

## 8. 구현 결과 (2026-11-06 · Do)

- 코드: §7 그대로. ⑤ 화면용 판정은 새 leaf `regulatedAddressVerdicts(form)`(`effective-regulated-at-acquisition.ts`) — ④와 같은 `storedRegulatedJudgments` 호출이다.
  `RegulatedAreaField`에 `addressVerdict` prop(토글 설명 「주소로 판정 — {근거}」 · high가 아니면 amber 한 줄). 입주권 양도는 같은 판정을 `verdict`로 넘겨 읽기 전용.
- 테스트:
  - anchor `__tests__/calc/judgment-menu-regulated-address.anchor.test.ts` J-1~J-9·H-1 9건 — 고치기 전 코드에서 J-1·J-3·J-7·J-8·J-9 실패 확인 후 통과.
  - UI `__tests__/calc/judgment-menu-regulated-address.ui.test.tsx` L-1~L-7 7건.
  - E2E `e2e/judgment-menu-regulated-address.spec.ts` RA-1·RA-2 — 판정 메뉴 2-C → 판정 결과(과세/비과세) → 계산기 보유 상황 토글·표지.
  - 뮤테이션 8건(④ 두 축 · normalize · ⑤ 표지 · ⑤ checked · 입주권 읽기 전용 · 근거 문구 · 사이드바 표시) 전부 잡힘. ⑧ 한 줄(`one-house-exemption-validate.ts` §155⑳ facts 인자)은 이 테스트들이 직접 보지 않는다.
- V-1 결과: 전체 vitest 47,191건 중 반전 1건 — `one-house-regulated-area/judgment-regulated-at-acquisition-display.anchor.test.tsx` 「주소 없음」 짝의 시료가 `addressJibun: "주소 1"`
  (알아볼 수 없는 주소 → #2919 B 규칙으로 조정대상지역 low)이었다. 코드가 없는 짝은 주소도 비우도록 시료만 고쳤다(단언 그대로).
- E2E 관련 기존 스펙(`one-house-judgment-designated-district` · `one-house-judgment-handoff` · `transfer-regulated-auto`) 통과. 첫 실행의 핸드오프 4건 실패는 새 워크트리 개발 서버가
  `/calc/transfer-tax`를 처음 컴파일하는 중(화면에 「Compiling…」)이라 30초 안에 이동하지 못한 것 — 페이지를 미리 컴파일한 뒤 같은 7건 통과.
