# §43② 1년 합산 — 자본거래 4축 (§38·§39의2·§39의3·§40) · PR①

- 상태: 구현·검증 완료 (2026-09-28) — PR 대기
- 선행: #19(§39 증자 — `docs/00-pm/gift39-19-43-2-aggregation.plan.md`), 정책 (a) 사용자 확정
- 후속: PR② §37·§42 무상 사용이익 · §35(차감형)는 해석례 조사 후 별건

## 1. 법령 (KoreanLaw 원문 확인)

- 「상증법」§43②: 12개 축 열거 — §31①2호·§35·§37·§38·§39·§39의2·§39의3·§40·§41의2·§41의4·§42·§45의5.
- 「상증령」§32의4 두문: 「해당 이익별로 합산하여 각각의 **금액기준**을 계산한다」.
  - 3호 §38: 「합병에 따른 이익」 — **호 구분 없음**.
  - 5호 §39의2, 6호 §39의3, 7호 §40: 「같은 항 **각 호의 이익별로 구분된** 이익」.

## 2. 축별 금액기준 (실측 + 조문)

| 축 | 경로 | 기준금액 조문 | 현행 판정 | 합산 효과 |
|---|---|---|---|---|
| §38 합병 | 주식교부 `merger.ts` mergerStock | 영 §28④1 min(평가 30%, 3억) | `gain ≥ min(..)` | 3억 leg |
| | 주식 외 `mergerNonStock` | 영 §28④2 3억 | `gain ≥ 3억` | 3억 |
| | 매트릭스 `merger-matrix.ts:47` | 수증자별 min(..) | 행별 | 행별 3억 leg |
| §39의2 감자 | 저가·고가 `capital-decrease.ts` | 영 §29의2② 3억(차액 30%↑면 0) | `gain ≥ threshold` | 3억 leg |
| | 멀티 `capital-decrease-multi.ts:125` | 동 | 수증자별 | 행별 |
| §39의3 현물출자 | 1호 저가 | **기준 없음**(영 §29의3②는 2호만) | `taxable > 0` | **없음** |
| | 2호 고가 단일·명부 `contribution-in-kind.ts:213·242` | 영 §29의3② 30% 또는 3억 | 비율 OR 3억 | 3억 leg |
| §40 전환사채 | 1호 인수 `bondAcquisition` | 영 §30②1 min(시가 30%, 1억) | `gain ≥ min` | 1억 leg |
| | 2호 가·나·다 `bondConversion` | 영 §30②2 1억 | `net ≥ 1억` | 1억 |
| | 2호 라목 `bondConversionReverse` | 영 §30②3 **0원** | `value > 0` | **없음** |
| | 3호 양도 `bondTransfer` | 영 §30②1 min(시가 30%, 1억) | `gain ≥ min` | 1억 leg |

## 3. 설계 — 정책 (a) 동일 적용

- 합산은 **금액기준(3억·1억) 판정에만**. `min(비율, 금액)` 형은 「비율 leg(건별) OR 금액 leg(합산)」과 동치로 풀어 쓴다.
  비율 leg는 합산하지 않는다(두문은 「금액기준」만 말한다 — #19와 같음).
- 과세하는 증여재산가액은 **당해 건** 이익. 합산 효과를 정한 유권해석 없음(#19 조사와 같음).
- 윈도 = 증여일 − 1년 ~ 증여일(양끝 포함). 증여일이 없으면 합산하지 않는다(⑧이 증여일을 강제).
- 「같은 호」 판별은 사용자 입력 — 표 안내문이 호를 명시한다(§38은 「합병에 따른 이익」 전체).
- 기준이 없는 하위 유형(§39의3 1호·§40 2호 라목)은 선행 이익을 받지 않는다(⑤ 표 비노출, ④ 미전송).

## 4. 입력 계약

- 단일 경로: 각 입력에 `giftDate?: Date` + `priorSameClauseGains?: SameClauseGainItem[]`.
- 명부·매트릭스: 행에 `priorSameClauseGain?: number`(#19 주주명부와 같은 모양). 윈도는 사용자가 거른 값.
- 공용 헬퍼: `capital-increase-43-2.ts` → `same-clause-43-2.ts`로 옮겨 일반화(금액·단위 라벨 인자).

## 5. 파일 줄 수

- `lib/calc/gift-deemed-validate.ts` 809줄(이미 초과) → 선행 이익 검증을 `gift-deemed-validate-43-2.ts`로 분리.
- `lib/validators/gift-deemed-input.ts` 943줄(이미 초과) — 공용 스키마 1개만 추가, 분리 여부는 Do에서 판단.

## 6. 검증 계획

- Pre-Do anchor(fail-first) 축·경로별 + 긍정 짝(윈도 밖·기준 없는 하위 유형 무영향).
- 뮤테이션 배터리, E2E 왕복(축당 1건 이상), 전체 게이트.

## 7. 결과

- 엔진 anchor `__tests__/tax-engine/gift-deemed/sec43-2-capital-axes.anchor.test.ts` 21건(fail-first 12 + 긍정 짝 9).
- 배관 anchor `__tests__/calc/sec43-2-capital-axes-plumbing.anchor.test.tsx` 23건(fail-first 17 + 짝 6) — ④·⑤·⑧이
  `lib/calc/gift-deemed-43-2.ts` `activeSameClauseRowsKey` 하나를 부른다(#19 증자도 이 술어로 옮김).
- E2E `e2e/gift-deemed-43-2-capital-axes.spec.ts` 5건(4축 단일 + 합병 매트릭스).
- 뮤테이션 vitest 28/28 KILLED · E2E 왕복 6/6 KILLED.
- 부수: 헬퍼 `capital-increase-43-2.ts` → `same-clause-43-2.ts` 일반화 · Zod 963줄 → 본 653 + phase3 293 + shared 44 ·
  validate 782줄 → 본 413 + phase3 400 · 개정 감시 매니페스트에 상증령 §32 등재(DC-1이 router 주석 인용에서 드러냄).
