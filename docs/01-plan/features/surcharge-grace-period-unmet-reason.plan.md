# 다주택 중과 경과조치(§167의3①12의2 나·다목) 미충족 사유 표시 — 계획서

- 작성일: 2026-11-09
- 기준 커밋: `fbe78a017`(master)
- 상태: Do — Q-1~3 모두 (a) 결정(2026-11-09)

## 1. 배경

사용자 사례(2026-11-09): 성남시 중원구 주택, 계약 2026-04-25, 양도 2026-09-18, 나목(토지거래허가 대상) 선택.
「토지거래허가 수령」 토글이 꺼진 채 계산 → 중과 58% 적용. 입력 화면 미리보기에는
「미충족 — 현재 입력 기준 경과조치 배제 미해당」만 나와 **어느 요건이 빠졌는지 알 수 없었다**.
토글을 켜자 정상 배제됨(사용자 확인). 엔진·법령 판정은 맞다 — 표시만 부족하다.

법문(소령 §167의3①12의2, 시행 2026.7.1. MST 286211 — KoreanLaw MCP 실독):

| 목 | 요건 |
|---|---|
| 나1) | 2026.5.9.까지 토지거래허가 신청 |
| 나2) | 그 신청에 대한 토지거래허가를 받았을 것 |
| 나3) | 매매계약 체결 + 계약금 지급받은 사실 증빙 |
| 나4) | 계약일부터 4개월(표 지역 6개월) 이내 양도. 2026.5.10. 이후 계약은 2026.9.9.(표 지역 11.9.)까지 |
| 다1) | 2026.5.9.까지 매매계약 체결 + 계약금 지급받은 사실 증빙 |
| 다2) | 계약일부터 4개월(표 지역 6개월) 이내 양도 |

## 2. 현황 (실측)

| 위치 | 내용 |
|---|---|
| `lib/tax-engine/multi-house-surcharge-exclusion.ts:191` | `checkGracePeriodExemption` — 반환 `{ suspended, basis?, deadline? }`. 사유 없음 |
| 같은 파일 `:213` | 소재지 대상 아님(`months === null`) → `{ suspended: false }` |
| `:218-219` | 나1) 신청일 없음·5.9. 뒤 → `{ suspended: false }` (조기 반환) |
| `:221` | 나2)·나3) `!permitGranted \|\| !depositReceiptConfirmed` → `{ suspended: false }` (**둘을 구분 안 함**) |
| `:240` | 다1) `contractAfter0510 \|\| !depositReceiptConfirmed` → `{ suspended: false }` (**둘을 구분 안 함**) |
| `:248-249` | `isLandPermitTarget` 미제공 → `{ suspended: false }` |
| 나4)·다2) 기한 초과 | `{ suspended: false, basis, deadline }` — 기한은 있지만 「초과」 사유 표지는 없음 |
| `app/calc/transfer-tax/steps/step4-sections/GracePeriodSection.tsx:113` | 미리보기가 엔진 함수를 그대로 호출(단일 소스) |
| 같은 파일 `:278-280` | 보유 2년 미만만 별도 문구, 나머지는 일반 문구 「미충족 — 현재 입력 기준 경과조치 배제 미해당」 |
| 엔진 소비처 `multi-house-surcharge-exclusion.ts:667` | `suspended`·`basis`·`deadline`만 읽음 — 새 필드 추가가 세액에 영향 없음 |
| 결과 화면 `components/calc/results/TransferTaxResultView.tsx:478` | 미유예 시 「⚠️ 중과세 적용」만, 경과조치 미충족 사유 없음 |

일반 문구를 고정한 기존 테스트(문구를 바꾸면 깨짐 — **헤드라인 문구는 유지**한다):
- `__tests__/components/houses-list-grace-period-transition.test.tsx:226`
- `__tests__/components/grace-period-non-regulated-preview-s14b-8.anchor.test.tsx:29`
- `__tests__/calc/nh99-l25-carryover-preview.ui.test.tsx:28`

`checkGracePeriodExemption` 반환 객체 전체를 `toEqual`로 비교하는 테스트: 호출 4개 파일 grep 결과 없음(필드 단위 단언만).

## 3. 설계 (권장안 기준)

### 3.1 엔진 — 반환에 `unmet` 추가

```ts
export type GraceUnmetCode =
  | "region"                // 소재지가 나·다목 대상 지역 아님
  | "na1_application"       // 나1) 허가 신청일 없음 또는 2026-05-09 뒤
  | "na2_permit"            // 나2) 허가 받지 않음
  | "deposit"               // 나3)·다1) 계약금 수령 증빙 미확인
  | "da1_contract_late"     // 다1) 계약일이 2026-05-09 뒤
  | "deadline";             // 나4)·다2) 양도일이 기한 뒤

// 반환: { suspended; basis?; deadline?; unmet?: GraceUnmetCode[] }
```

- 나·다목 분기는 **조기 반환을 없애고 요건을 전부 평가**해 `unmet`에 모은다(Q-2). `suspended = unmet.length === 0`.
- `deadline`은 계약일만 있으면 계산 가능 — 다른 요건이 빠져도 계산해 `deadline` 사유 판정에 쓴다.
- ~~`basis` 설정 조건은 바꾸지 않는다~~ → **Do 중 변경**: 미충족이어도 기한이 계산되면 `basis`·`deadline`을 돌려준다(「기한 초과」 문구에 날짜가 필요하고, G-8처럼 다른 요건과 겹치면 종전 조기 반환에선 기한이 없었다).
  결과에는 영향 없음 — 엔진 소비처 `:673-674`가 옮긴 값을 `multi-house-surcharge.ts:551-552`가 `isSuspended`일 때만 결과에 싣는다(실측). 화면 미리보기는 미충족에도 「계산된 양도 기한」을 보여 준다.
- 가목(`:197`)·`isLandPermitTarget` 미제공(`:249`)은 그대로. 미제공은 화면 미리보기가 `null`을 반환해 도달하지 않으므로 코드를 만들지 않는다.
- 불변식: 모든 기존 입력에서 `suspended`·`basis`·`deadline` 값이 현행과 같아야 한다.

### 3.2 화면 — 미리보기 아래 사유 목록

`GracePeriodSection.tsx:278-280`의 헤드라인 `<p>`는 **문구를 그대로 둔다**. `!preview.suspended && preview.unmet?.length`일 때 그 아래에
`<ul data-testid="grace-period-unmet-reasons">`를 추가한다. 코드 → 문구 맵은 이 파일 안에 둔다(소비처 1곳 — Q-3).

| 코드 | 문구 |
|---|---|
| `region` | 소재지 — 나·다목 대상 지역이 아닙니다(위 안내) |
| `na1_application` | 나목1) 토지거래허가 신청일이 없거나 2026-05-09 뒤입니다 |
| `na2_permit` | 나목2) 「토지거래허가 수령」이 확인되지 않았습니다 |
| `deposit` | 나목3)/다목1) 「계약금 수령 증빙 확인」이 꺼져 있습니다 |
| `da1_contract_late` | 다목1) 매매계약일이 2026-05-09 뒤입니다 |
| `deadline` | 양도일이 양도 기한({deadline}) 뒤입니다 |

- 날짜 리터럴은 `SURCHARGE_TRANSITION.DEADLINE` 상수로 쓴다(하드코딩 금지).
- 법 조문 표기는 「나목2)」처럼 목·세목만 쓴다 — 헤더 배지(`§167의3①12의2`)가 이미 조문을 밝힌다.
- 색: 헤드라인과 같은 rose 텍스트 클래스. 신규 톤 하드코딩 없음.

### 3.3 14지점 영향

Q-1 (a) 채택 시 엔진 **결과 타입**은 바꾸지 않는다 — 함수 반환만 넓힌다. ①~⑭ 중 ⑤(위젯)만 해당.
⑧ validate·⑫ Zod·④ API 변환 변경 없음(허가·계약금 미확인은 차단이 아니라 「부적용으로 계산 진행」 — `lib/calc/transfer-tax-validate-surcharge-axis.ts:140` 현행 정책 유지).

## 4. 케이스 매트릭스 (anchor 시료)

양도 주택 성남 중원구 `4113110100`(6개월), 양도일 2026-09-18 기준. ✓=충족 ✗=미충족.

| # | 목 | 신청일 | 허가 | 계약일 | 계약금 | 기대 `suspended` | 기대 `unmet` |
|---|---|---|---|---|---|---|---|
| G-1 | 나 | 4-17 | ✓ | 4-25 | ✓ | true | `[]`/없음 |
| G-2 ★사용자 사례 | 나 | 4-17 | ✗ | 4-25 | ✓ | false | `["na2_permit"]` |
| G-3 | 나 | 4-17 | ✓ | 4-25 | ✗ | false | `["deposit"]` |
| G-4 | 나 | 4-17 | ✗ | 4-25 | ✗ | false | `["na2_permit","deposit"]` |
| G-5 | 나 | 5-10 | ✓ | 4-25 | ✓ | false | `["na1_application"]` |
| G-6 | 나 | 없음 | ✓ | 4-25 | ✓ | false | `["na1_application"]` |
| G-7 | 나 | 4-17 | ✓ | 2026-02-01 | ✓ | false | `["deadline"]` (기한 2026-08-03 — 8-01 토요일 → 민법 §161 익일, 실측) |
| G-8 | 나 | 4-17 | ✗ | 2026-02-01 | ✗ | false | `["na2_permit","deposit","deadline"]` |
| G-9 | 나 | 4-17 | ✓ | 5-20 | ✓ | true | 없음(절대기한 11-09) |
| G-10 | 다 | — | — | 4-25 | ✓ | true | 없음 |
| G-11 | 다 | — | — | 4-25 | ✗ | false | `["deposit"]` |
| G-12 | 다 | — | — | 5-20 | ✓ | false | `["da1_contract_late"]` |
| G-13 | 다 | — | — | 5-20 | ✗ | false | `["da1_contract_late","deposit"]` |
| G-14 | 다 | — | — | 2026-02-01 | ✓ | false | `["deadline"]` |
| G-15 | 나 | 4-17 | ✓ | 4-25 | ✓ | false | `["region"]` — 소재지 `4146310100`(용인 기흥, 2026-07-01 지정 — `transitionExemptionMonths` = `null` 실측) |
| G-16 | 가목 | 양도일 2026-05-09 | — | — | — | true | 없음(가목 우선) |

**회귀 단언**: G-1~G-16 전부에서 `suspended`·`basis`·`deadline`이 변경 전 함수 결과와 같다 — 구현 전 현행 함수로 기대값을 먼저 캡처한다(Pre-Do anchor).

## 5. 작업 순서

1. Pre-Do anchor — `__tests__/tax-engine/transfer/grace-period-unmet-reason.anchor.test.ts`에 G-1~G-16 `suspended`·`basis`·`deadline` 현행값 고정 → verify: 현행 코드에서 통과
2. 엔진 `unmet` 수집 → verify: 1의 회귀 단언 그대로 통과 + `unmet` 단언 추가 통과
3. 화면 목록 추가 → verify: 컴포넌트 테스트(G-2·G-4·G-12 렌더) + 기존 3개 문구 테스트 통과
4. 뮤테이션 probe — 각 코드 push 1줄씩 제거 시 anchor가 실패하는지 → verify: 전부 KILLED
5. 브라우저 확인(Playwright) — 사용자 사례 입력으로 「나목2)」 문구 노출 → 토글 ON 시 사라짐
6. `npx tsc --noEmit` · `npx vitest run __tests__/tax-engine/transfer/ __tests__/components/ __tests__/calc/`

예상 규모: 엔진 +25줄(689 → ≈715, 800 미만) · 화면 +25줄(290 → ≈315) · 테스트 2파일. 약 2~3시간.

## 6. 미검증 레지스터 (V)

| ID | 내용 | 상태 |
|---|---|---|
| V-1 | G-7·G-14 기한 계산값(민법 §161 주말 익일) | 실측 완료 — 둘 다 `2026-08-03`, `suspended:false`. G-9 기한 `2026-11-09`(절대기한), `suspended:true` |
| V-2 | G-15 소재지 코드가 `transitionExemptionMonths` → `null`인지 | 실측 완료 — `null` |
| V-3 | `nh99-l25-carryover-preview.ui.test.tsx:28`이 `includes`로 판정 — 목록 추가 후에도 「unmet」 분류 유지되는지 | 실측 완료 — 구현 후 통과 |
| V-4 | 기존 E2E `e2e/transfer-surcharge-transition.spec.ts` | 「미충족」 문구 미참조 — grep 실측 완료 |

## 7. 사용자 결정 (Q)

| ID | 질문 | 선택지 | 권장 |
|---|---|---|---|
| Q-1 | 표시 범위 | (a) 입력 화면 미리보기만 · (b) + 결과 화면 「⚠️ 중과세 적용」 카드에도 사유(엔진 결과 타입 `surchargeSuspensionUnmet` 추가 → echo·⑦·다건 결과뷰까지 동기화) | **(a)** — 조치(토글 켜기)가 입력 화면에서 일어난다. (b)는 결과 타입·다건 경로가 늘어 별건 |
| Q-2 | 사유 개수 | (a) 미충족 요건 전부 · (b) 첫 사유만 | **(a)** — 하나 고치고 다시 미충족이 뜨는 반복을 막는다 |
| Q-3 | 문구 위치 | (a) 엔진은 코드만, 문구 맵은 `GracePeriodSection.tsx` · (b) 엔진이 문구까지 반환 | **(a)** — 소비처 1곳. Q-1 (b)를 하게 되면 그때 공용 파일로 옮긴다 |
