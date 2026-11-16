# 종부세 합산배제 문구 3건 (T-05 · T-17a · T-17b) — 계획서 v0.2

> 출처: `comprehensive-rental-excl-textbook-157-180.plan.md` §3(T-05 · T-17a · T-17b) — 교재 「주택임대사업자의 모든 것」 Ch.04 pp.157~180 대조.
> 묶음 ③ 문구. **세액은 바뀌지 않는다**(성립 판정·세액 계산 코드는 건드리지 않는다). 작업 워크트리 `prt-compword`.
> 이 묶음에서 T-07c·T-07d는 빠진다 — PR-2 T-07a #3417에서 이미 고쳤다.

## 1. 법령 확인 (KoreanLaw 2026-11-17 조회)

| 조문 | MST | 이 계획에 쓰는 문언 |
|---|---|---|
| 종부령 §3① 각 호 외의 부분 | 290557 | 「…임대사업자로서 과세기준일 현재 … 사업자등록을 한 자가 과세기준일 현재 임대 … 하거나 소유 … 하고 있는」 — 과세기준일 현재 임대사업자여야 한다 |
| 종부령 §3①2호 | 290557 | 「민간매입임대주택과 공공매입임대주택 … 민간매입임대주택의 경우에는 2018년 3월 31일 이전에 사업자등록등을 한 주택으로 한정한다」 · 나목 「5년 이상 계속하여 임대」 — 단기·장기를 나누지 않는다 |
| 종부령 §3①8호 | 290557 | 「매입임대주택 중 장기일반민간임대주택등」 · 가목2) 10년 — 등록 시기 제한은 없다 |
| 종합부동산세법 §17⑤1호 | 280417 | 「…대통령령으로 정하는 주택이 추후 그 요건을 충족하지 아니하게 된 경우」 → 「경감받은 세액과 이자상당가산액을 추징하여야 한다」 |
| 종부령 §10①② | 290557 | 추징 세액 = 합산했을 때 세액 − 배제했을 때 세액(매 과세연도) · 이자상당가산액 1일 10만분의 22 |
| 종부령 §10③ | 290557 | 추징하지 않는 경우: 1호 최소 임대의무기간이 지난 뒤 5% 요건 위반 · 2호 「민간임대주택에 관한 특별법」 §6①11호 또는 §6⑤에 따른 등록 말소 · 3호 재개발·재건축·소규모정비·리모델링 새 주택 요건 |
| 민간임대주택에 관한 특별법 §6①11호 · §6⑤ | 276995 | §6①11호: 종전 장기일반 아파트 매입임대·단기민간임대의 임대의무기간 내 자진말소 신청 · §6⑤: 같은 주택은 「임대의무기간이 종료한 날 등록이 말소된다」 |

인용 조문은 모두 manifest에 이미 등록되어 있다: `COMPREHENSIVE.DECISION_CORRECTION_RECAPTURE`(종부법 §17) · `COMPREHENSIVE_DECREE.RECAPTURE_INTEREST`(종부령 §10, 키워드 「임대사업자 등록이 말소된 경우」 포함) · `PRIVATE_RENTAL.CANCELLATION`(민특법 §6). 새 조문 등록은 없다.

## 2. 현행과 결함 (file:line 실측)

### T-05 2호 선택지 라벨

- `components/calc/property-list-shared.ts:27` `["private_purchase_rental_short", "민간매입임대 단기 구법 (시행령 §3①2호)"]`
- `components/calc/ExclusionInfoInput.tsx:49` `["private_purchase_short", "민간매입임대 단기 구법"]`
- `lib/tax-engine/types/comprehensive-exclusion.types.ts:28` 주석 「민간매입임대 단기 구법」
- 결함: 2호는 2018.3.31. 이전에 등록한 민간매입임대 **전부**(단기·장기)다. 「단기 구법」이라 2018.3.31. 이전 장기일반 등록자가 8호를 고르게 된다. 8호를 고르면 의무기간이 8년 또는 10년으로 잡혀 「의무임대기간(8년) 미충족」 경고가 나오고(교재 대조 P2), 2호에 없는 8호 나목 1)~4) 제외 사유가 적용될 수 있다. 성립·세액은 P2·P2b에서 같았다.
- `exclusionTypeShortLabel`(`property-list-shared.ts:57~60`)은 정규식 `/\s*\(.*\)\s*$/`로 **첫 「(」부터 끝까지** 지운다. 새 라벨 본문에 괄호를 넣으면 짧은 라벨이 잘린다 → 본문에는 괄호를 쓰지 않는다.

### T-17a 말소 불성립 사유

- `lib/tax-engine/comprehensive-exclusion.ts:295~304` 말소일 ≤ 과세기준일이면 `COMPREHENSIVE_EXCL.MANDATORY_PERIOD_NOT_MET` 「의무임대기간 미충족」(`legal-codes/comprehensive.ts:269`).
- 결함: 불성립 근거는 §3① 각 호 외의 부분(과세기준일 현재 임대사업자)이다. 의무기간을 채운 뒤 자동말소(민특법 §6⑤)된 경우에도 「의무임대기간 미충족」이 나온다.
- 같은 축 화면 문구: `ExclusionInfoInput.tsx:341` 토글 설명 「의무임대기간 중 자진·직권 말소된 경우」 — 의무기간 뒤 자동말소도 이 칸에 넣어야 한다.
- `MANDATORY_PERIOD_NOT_MET` 사용처: 엔진 1곳(위) + 테스트 4곳(`comprehensive-aggregation-exclusion.test.ts:148,195` · `comprehensive-exclusion-459ho.anchor.test.ts:68` · `comprehensive-exclusion-6ho.anchor.test.ts:80`). 양도세 `transfer-tax/rental-housing-exception/eligibility.ts`의 같은 글자는 별개 상수라 건드리지 않는다.

### T-17b 추징 경고

- `comprehensive-exclusion.ts:310~326` 성립했고 `actualRentalYears < 의무기간`이면 「의무임대기간(N년) 미충족 — 현재 X년 경과. 의무기간 충족 전 등록 말소 시 합산배제 세액이 소급 추징됩니다 (근거).」
- 결함 두 가지:
  1. 민특법 §6①11호 자진말소·§6⑤ 자동말소는 §10③2호로 추징하지 않는다(서면-2023-부동산-2172). 경고는 반대로 말한다.
  2. 실제 추징 사유(의무기간 안에 양도·임대 중단·5% 초과 등 요건 미충족 — §17⑤1호 「추후 그 요건을 충족하지 아니하게 된 경우」)는 경고에 없다.
- 근거 표기도 §3①만 단다. 추징 근거는 종부법 §17⑤·종부령 §10이다.
- 표시: 결과 화면 `AggregationExclusionSection.tsx:71~87` 「확인 필요」 상자(문자열 그대로 출력). PDF는 합산배제 경고를 출력하지 않는다(`lib/pdf` grep 0건).

## 3. 고칠 내용 (v0.2 — 엔진·UI 시니어 검토 반영)

| # | 대상 | 바꾸는 것 |
|---|---|---|
| T-05-1 | `property-list-shared.ts:27` | 「민간매입임대 2018.3.31. 이전 등록 (단기·장기 공통 5년, 시행령 §3①2호)」 — 짧은 라벨 「민간매입임대 2018.3.31. 이전 등록」(표 알약 폭 · 정규식 실행 확인) |
| T-05-2 | `ExclusionInfoInput.tsx:49` | 「민간매입임대 2018.3.31. 이전 등록 (단기·장기 공통 5년)」 |
| T-05-3 | `ExclusionInfoInput.tsx` select 바로 아래 `<p className="text-xs text-muted-foreground">`(10·11호 안내 패턴) · 조건 `regType === "private_purchase_long"`(유효값) | 「2018.3.31. 이전에 임대사업자 등록과 사업자등록을 모두 마친 민간매입임대는 2호(의무임대기간 5년)로도 판정할 수 있습니다.」 — 중립 문구(2호·8호 모두 충족 가능 · 유리·불리 표현 금지) |
| T-05-4 | 주석 4곳 | `types/comprehensive-exclusion.types.ts:28` · `comprehensive-exclusion.ts:41,51` · `lib/calc/comprehensive-rental-business-reg.ts:11`의 「구법」 → 「2018.3.31. 이전 등록」 |
| T-17a-1 | `legal-codes/comprehensive.ts` | `MANDATORY_PERIOD_NOT_MET` 삭제 → `REGISTRATION_REVOKED` 「과세기준일(6월 1일 — 당일 포함)까지 임대사업자 등록이 말소됨 — 합산배제 제외 (종합부동산세법 시행령 §3①)」 |
| T-17a-2 | `comprehensive-exclusion.ts:295~304` | 새 상수로 교체 · 주석을 「과세기준일 현재 임대사업자(§3① 각 호 외의 부분)」로 |
| T-17a-3 | `ExclusionInfoInput.tsx:341` · `:355` | 토글 설명 「과세기준일까지 임대사업자 등록이 말소된 경우 (자진·자동·직권 말소)」 · 보조 문구 「말소일이 과세기준일(6월 1일) 당일이거나 그 전이면 그해부터 합산배제가 적용되지 않습니다」 |
| T-17a-4 | 주석 3곳 | `types:101` · `comprehensive-wizard-store.ts:92` · `validators/comprehensive-input.ts:138`의 「과세기준일 이전 … 계속임대 위반」 → 「과세기준일(당일 포함)까지 말소면 거부 — 과세기준일 현재 임대사업자 아님(§3①)」 |
| T-17b-1 | `legal-codes/comprehensive.ts` | 인용 상수 2개만 둔다(경고 본문은 엔진 — 법령명 없는 「§6⑤」 구간이 앞 법령을 승계해 파싱되는 것을 피한다): `RECAPTURE_BASIS` 「종합부동산세법 §17⑤, 종합부동산세법 시행령 §10①」 · `RECAPTURE_EXEMPT_CANCELLATION` 「종합부동산세법 시행령 §10③2호」 |
| T-17b-2 | `comprehensive-exclusion.ts:316~324` 경고 | 「의무임대기간(N년) 미충족 — 현재 X년 경과 (기존 basis). 의무기간 안에 요건을 갖추지 못하게 되면(협의매수·수용 등 §3⑦5호 사유는 제외) 경감받은 세액과 이자상당가산액을 추징합니다 (`RECAPTURE_BASIS`). 종전 장기일반 아파트 매입임대·단기민간임대가 「민간임대주택에 관한 특별법」 §6①11호 자진말소·§6⑤ 자동말소된 경우에 한해 추징하지 않습니다 (`RECAPTURE_EXEMPT_CANCELLATION`).」 + 기존 8년 확인 필요 꼬리 유지. 머리 「의무임대기간(N년) 미충족」 유지(기존 부분 일치 단언 6곳) |

엔진 성립 판정·`failReasons` 순서·세액은 바뀌지 않는다. 바뀌는 것은 문자열·라벨·주석뿐이다.

### 3.1 시니어 검토에서 반영한 것 (2026-11-17)

| 출처 | 지적 | 반영 |
|---|---|---|
| UI | 짧은 라벨 33자 → 표 nowrap 알약 폭 초과 우려 | T-05-1 괄호 안으로 이동(짧은 라벨 23자) |
| UI | 경고가 결과 화면 두 곳에 나온다(`AggregationExclusionSection.tsx:71~87` + `ComprehensiveTaxResultView.tsx:531~540` `result.warnings` — `comprehensive-tax.ts:165~171`이 접두 붙여 전파) | T-17b-2 문장을 줄였다(약 300자 → 약 230자) |
| UI | 8호 안내 조건은 `property.rentalRegistrationType`이 아니라 유효값 `regType` | T-05-3 |
| 엔진·UI | 엔진은 `말소일 <= 과세기준일` — 「이전」은 당일 포함이 모호 | T-17a-1·3·4에 「당일 포함」 |
| 엔진 | `:355` 보조 문구·말소일 주석 3곳 누락 | T-17a-3·4 |
| 엔진 | 「8호 말고 2호를 고르세요」는 단정 — 2호·8호 모두 충족 가능, 짧은 의무기간 쪽 유도는 유리·불리 표현 | T-05-3 중립 문구 |
| 엔진 | 자진·자동말소 단서가 모든 유형처럼 읽힌다 — §6①11호·⑤는 종전 장기일반 아파트 매입임대·단기민간임대만 | T-17b-2 「…에 한해」 |
| 엔진 | 「양도」 예시는 과장 — §3⑦5호(협의매수·수용·분양전환·천재지변)는 계속 임대로 본다 | T-17b-2 열거를 빼고 §3⑦5호 제외만 명시 |
| 엔진 | verify:legal 게이트는 legal-codes 문자열을 「법령명+조」로 대조(항·호 무시) — 종부법 §17·종부령 §10 manifest로 덮인다 | 새 등록 없음 확인 |
| 엔진 | 「임대사업자가 아님」 단정 — 민특법 §6⑥(임차인 관계에서 임대사업자로 봄) | T-17a-1을 「등록이 말소됨 — 합산배제 제외」로 사실만 적음 |

## 4. 사용자 결정 (Q)

| Q | 질문 | 권장 | 다른 안 |
|---|---|---|---|
| Q-1 | 2호 라벨 문구 | **T-05-1·2** 「2018.3.31. 이전 등록 (단기·장기 공통 5년)」 — ✅ 사용자 결정 2026-11-17 | 「단기 구법」 유지 + 안내만 |
| Q-2 | 8호를 고른 사용자에게 2호 안내를 띄울지 | **항상 띄운다**(8호 선택 시 안내 1줄 · 엔진 불변) — ✅ 사용자 결정 2026-11-17 · 문구는 검토 반영으로 중립(「2호로도 판정할 수 있습니다」) | — |
| Q-3 | 추징 경고 구조 | **공통 문구 + 「종전 장기일반 아파트 매입·단기민간임대의 자진·자동말소에 한해 추징 안 함」** — ✅ 사용자 결정 2026-11-17 | 유형별 분기 — 2호는 단기·장기를 입력받지 않아 분기 근거가 없다 |
| Q-4 | 8호 라벨에 「2018.4.1. 이후 등록」을 붙일지 | **붙이지 않는다** — §3①8호에 등록 시기 제한이 없다. 지자체 2017·세무서 2019 등록 장기일반은 2호 불성립(`comprehensive-exclusion.ts:110`)·8호만 가능 — 라벨이 2호로 유도하면 과다과세 — ✅ 사용자 결정 2026-11-17(처음 「붙임」 → 이 사례 설명 후 재결정) | 붙인다 |
| Q-5 | §10③1호·3호를 경고에 넣을지 | **넣지 않는다** — 경고는 의무기간 미충족일 때만 나와 1호와 겹치지 않고, 3호는 T-18a 묶음. §3⑦5호 제외만 한 구절로 — ✅ 사용자 결정 2026-11-17 | 넣는다 |

## 5. 확인 필요 (V) — 이 PR에서 바꾸지 않는다

- V-10(교재 대조 계획서): 2018.3.31. 이전 등록 + 2020.7.11. 이후 단기→장기 변경신고 주택이 2호로 성립하는지. 2호 법문에는 8호 나목 4) 같은 제외가 없다. 엔진은 2호에 그 제외를 두지 않는다(현행 유지).
- 6.1. 당일 말소를 불성립으로 보는 근거 해석례 없음(교재 대조 T-17 성립 행) — 엔진 `<=` 유지. 문구는 엔진 동작대로 「당일 포함」을 적는다.
- 민특법 §6⑥(말소 뒤 임차인 관계에서 임대사업자로 봄)이 종부령 §3① 판정에 영향이 있는지 — 해석례 미조회. 엔진 동작은 바꾸지 않는다.
- 5호(부동산투자회사)가 임대사업자 등록을 전제하는지 — 이 PR은 5호 말소 칸 노출을 바꾸지 않는다.

## 6. 실행 계획 — PR 1개

1. 엔진·상수(T-17a-1·2, T-17b-1·2, T-05-4) → verify: `npx vitest run __tests__/tax-engine/comprehensive*` · `npm run verify:legal`
2. 기존 테스트 4곳 상수 교체 + anchor 신설 `__tests__/tax-engine/comprehensive-exclusion-wording.anchor.test.ts`
   - W-1 말소일 ≤ 6.1. → `failReasons` = [`REGISTRATION_REVOKED`] (2·8·4·6호 각 1)
   - W-2 경고에 「§17⑤」「§10③2호」「경감받은 세액과 이자상당가산액」 포함 · 「소급」 미포함
   - W-3 세액 불변: 기존 integration 시료 세액 그대로(`comprehensive-tax-integration.test.ts` T-MP-8 재사용 — 그 시료는 경고에 「의무임대기간」「10년」「임대주택 2번째」를 단언하므로 머리 문구 유지가 조건)
   - mutation probe: 엔진에서 새 상수 → 옛 문구로 되돌리면 W-1 실패, 경고 단서 삭제 시 W-2 실패
3. 화면(T-05-1·2·3, T-17a-3) → verify: `__tests__/calc/comprehensive-exclusion-type-options.test.ts` 통과 + 짧은 라벨에 「(」가 남지 않는다는 단언 추가 · 새 컴포넌트 테스트 `__tests__/components/comprehensive-8ho-2ho-hint.test.tsx`(`comprehensive-9ho-revoke-hidden.test.tsx`의 `renderWith` 패턴 · 8호 보임 · 2호 안 보임 · 토글 설명 문구)
4. E2E 1건 `e2e/comprehensive-rental-wording.spec.ts`(`comprehensive-rental-vacancy.spec.ts` 템플릿 · testid `comprehensive-exclusion-fail-reasons`): 말소 토글 → 불성립 사유 새 문구 · 경과 연수 입력 → 결과 경고 새 문구
5. 14지점: 엔진 input·result 타입 변경 없음 → ①~⑭ 해당 없음(문자열만). `ui-engine-sync-checker`는 생략하고 그 사유를 기록한다.
6. tsc 0 · eslint 0 · push(load<25 게이트) · CI 전건 SUCCESS + headRefOid 일치 후 머지

예상 작업량: 엔진·상수·테스트 30분, 화면 20분, E2E·CI 대기 포함 1시간 30분 안팎.

## 7. 구현 로그 (2026-11-17 · 브랜치 `fix/comp-excl-wording`)

- 엔진·상수: `REGISTRATION_REVOKED` · `RECAPTURE_BASIS` · `RECAPTURE_EXEMPT_CANCELLATION` · `RECAPTURE_EXEMPT_CANCELLATION_CLAUSES`(민특법 §6①11호·⑤) · `CONTINUED_RENTAL_DEEMED`(령 §3⑦5호) — 경고 본문의 조문도 리터럴 대신 상수. `MANDATORY_PERIOD_NOT_MET` 삭제(사용처 0).
- 계획서 밖 추가(tsc 출력에서 발견): 2호 **성립 사유** 상수 `PRIVATE_PURCHASE_RENTAL_SHORT` 「시행령 §3①2호 (구법)」 → 「(2018.3.31. 이전 등록)」 — 결과 화면에 나가는 문자열이라 T-05 범위. 의무기간 상수 주석의 「구법」도 정리.
- 화면: 라벨 2곳 · 8호 안내(`data-testid="comprehensive-8ho-2ho-hint"` · 조건 `regType`) · 말소 토글 설명·보조 문구.
- 테스트: 엔진 anchor `__tests__/tax-engine/comprehensive-exclusion-wording.anchor.test.ts` 11건 · 화면 `__tests__/components/comprehensive-exclusion-wording.test.tsx` 7건 · 기존 4곳 상수 교체. E2E `e2e/comprehensive-rental-wording.spec.ts` 2건.
- 뮤테이션 probe 4건 모두 잡힘: P1 말소 사유 상수 교체 → 3 실패 · P2 자진·자동말소 단서 삭제 → 1 실패 · P3 2호 성립 사유 「(구법)」 복원 → 1 실패 · P4 안내 조건을 `property.rentalRegistrationType`으로 → 1 실패.
- 검증: `npm run test:comprehensive` 74파일 860건 통과 · `verify:legal` 503/503 · 커버리지 게이트 10건 통과 · 변경 파일 eslint 0 · tsc는 테스트 상수 교체 뒤 재실행(아래).
- 14지점: 엔진 input·result 타입 변경 없음(문자열·라벨만) → 해당 없음. `ui-engine-sync-checker` 생략.
- 줄 수: `ExclusionInfoInput.tsx` 600 · `comprehensive-exclusion.ts` 664 · `legal-codes/comprehensive.ts` 488.
