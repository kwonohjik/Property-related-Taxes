# 겸용 × 공익수용 등 «미지원 조합» — ⑧은 막는데 직접 API는 400이 아니라 500 (E-500)

- 상태: **결정 대기** — 코드 변경 없음(문서만). 기준 master `fd7361e4f`.
- 출처: `mixed-use-companion-commercial-card-reductions-vn1.plan.md` §8 — «§77 미지원 조합이 직접 API에서 400이 아니라 500으로 나는 점».
- 표기: **[직접]** = 이 문서 작성 중 직접 실행·대조. **[코드]** = 코드 읽기만. **확인 필요** = 미측정·미해명.

## 0. 결론

| 질문 | 답 |
|---|---|
| 막히는가 | **막힌다.** 겸용 단건 × 공익수용 × (매매 실거래가 · 감정가액 · 상속 · 증여) 4칸 모두 ⑧이 «아직 지원하지 않습니다»로 먼저 막고, 직접 API는 엔진이 던진다. 대조 칸(매매 환산)은 ⑧ 0건 · route 200 [직접]. **막힘 자체의 ⑧↔route 어긋남(막다른 길)은 없다** |
| 무엇이 문제인가 | 직접 API에서 그 막힘이 **HTTP 500 `INTERNAL_ERROR`**로 나온다 [직접]. 입력 조합을 거절하는 것이므로 400 `INVALID_INPUT`이 맞다 — 서버 오류로 보이면 호출자가 재시도하고 모니터링에서 서버 결함과 구분되지 않는다. 세액은 틀리지 않는다 |
| 왜 500인가 | 엔진이 **일반 `Error`**를 던지고, route의 `catch`는 `TaxCalculationError`만 상태코드를 가려(`INVALID_INPUT` → 400) 나머지를 500으로 응답한다 [코드: `app/api/calc/transfer/route.ts:444-461` · `lib/api/tax-error-response.ts:22-23` · `lib/tax-engine/tax-errors.ts:36`]. 같은 엔진의 초과부담부 가드(`burdened-gift-eligibility.ts:104`)는 이미 `TaxCalculationError`라 400이다 [코드] |
| 범위 | 같은 모양(일반 `Error` + «지원하지 않습니다» 계열)이 **7곳**이다(§3.2). 이 중 겸용 공익수용 2곳(4칸)만 측정했다 |
| 권장 | 엔진 throw를 **`TaxCalculationError(INVALID_INPUT, 같은 메시지)`로 바꾼다**(Q-1 a) — ⑧·⑫에 조건식을 새로 복제하지 않고 기존 응답 경로를 쓴다 |

## 1. 범위

- 측정: 겸용 **단건** 주 자산 × `transferCause=public_expropriation`(+ §77 감면 선택) × 취득 방식 4종(매매 실거래가 · 매매 감정가액 · 상속 · 증여) + 환산 대조. 겸용 **컴패니언**(매매 실거래가)은 `vn1` 계획서 §8에서 같은 500을 [직접] 확인했다.
- 측정하지 않은 것: 아래 §3.2의 나머지 5곳 · 다건(`multi`) route 직접 호출 · 클라이언트(`callTransferTaxAPI`)가 400·500을 달리 다루는지 · 운영 환경의 오류 모니터링 집계(이 repo의 route에는 Sentry 호출이 없고 `console.error`뿐이다 [코드] — 전역 계측은 확인 필요).

## 2. 측정 방법 [직접]

throwaway probe(미커밋): 기존 route anchor(`mixed-use-inheritance-decedent-date`)의 겸용 폼 + `transferCause: "public_expropriation"` + §77 감면 + 겸용 수용 필수 칸(주택분 보상액 총액 · 보상산정 기초 기준시가 총액 · 상가분 토지 보상액 총액 · 보상산정 기초 개별공시지가 총액)을 채우고, ⑧(`collectStepIssues` 0~3단계)과 ④→⑫→⑭ route를 같은 폼으로 돌렸다. 필수 칸을 하나씩 비운 중간 측정에서는 ⑧과 ⑫가 **같은 순서로 같은 칸을 요구**했다(⑧↔⑫ 정합 확인).

## 3. 측정 결과 [직접]

### 3.1 겸용 단건 × 공익수용

| 취득 방식 | ⑧ | route | 응답 메시지 |
|---|---|---|---|
| 매매 실거래가 | «겸용주택 취득 실거래가액 + 공익수용 특례 조합은 아직 지원하지 않습니다.» | **500** `INTERNAL_ERROR` | «겸용 취득 실거래가 + 공익수용 특례 조합은 아직 지원하지 않습니다.» |
| 매매 감정가액 | «… 감정가액 + 공익수용 …» | **500** | «겸용 감정가액·매매사례가액 + 공익수용 …» |
| 상속 | «상속 취득 + 공익수용 …» | **500** | «상속·증여·매매 실거래가·감정/매매사례 취득 + 공익수용 …» |
| 증여 | «증여 취득 + 공익수용 …» | **500** | 〃 |
| 매매 환산(대조) | 0건 | 200 | — |

- 응답에 스택은 비운영 환경에서만 실린다 [코드: `route.ts:456`].

### 3.2 같은 모양의 throw 7곳 [코드]

| 위치 | 조합 | ⑧ 선차단 | 측정 |
|---|---|---|---|
| `transfer-tax-mixed-use-commercial.ts:164` | 상속·증여·매매실가·감정 + 공익수용 | 있음(`validate-mixed-use-inheritance.ts:44` · `validate-mixed-use-asset.ts:124`) | **500 확인** |
| `transfer-tax-mixed-use-housing-acq.ts:91` | 실거래가·감정 + 공익수용 | 있음(`validate-mixed-use-asset.ts:124`) | **500 확인** |
| `…housing-acq.ts:86` | 실거래가·감정 + 미공시(PHD)·보유 중 용도변경 | 있음(`validate-mixed-use-asset.ts:116-121`) | 확인 필요 |
| `…housing-acq.ts:169` | 상속·증여 + PHD 4부분 안분 | 확인 필요 | 확인 필요 |
| `…housing-acq.ts:204` | 상속·증여 + 보유 중 용도변경 | 있음(`validate-mixed-use-inheritance.ts` 상단) | 확인 필요 |
| `redevelopment.ts:107` | 재개발 부담부증여 + §166③ 환산 | 확인 필요 | 확인 필요 |
| `burdened-gift-eligibility.ts:77` | 부담부증여 미지원 `propertyType` | ⑧이 같은 지원 목록을 쓴다는 주석(`validate-bg.ts:81`) | 확인 필요 |

기존 테스트 중 이 메시지를 단언하는 곳은 엔진 직접 호출의 `toThrow(정규식)`이다(`mixed-use-inheritance-acquisition.anchor` 등) — `TaxCalculationError`도 `Error`의 하위 클래스이고 메시지가 같으면 그대로 통과한다 [코드: 단언 방식만 읽음 — 실행은 구현 때].

## 4. 결정 대기

| 번호 | 질문 | 선택지 | 권장 |
|---|---|---|---|
| Q-1 | 어떻게 400으로 만들까 | **a** 엔진 throw를 `TaxCalculationError(INVALID_INPUT, 같은 메시지)`로 교체 — 기존 `taxCalculationErrorResponse`(400)를 그대로 탄다. 컴패니언·다건 집계는 이미 `TaxCalculationError`에 «자산 N:» 접두를 붙여 다시 던진다(`transfer-tax-aggregate-asset-records.ts` `computeOne`) · **b** ⑫ Zod에 ⑧ 조건식을 거울로 추가(조건 4~7개를 두 번 쓰게 된다) · **c** 현행 유지 | **a** (조건식 복제가 없어 ⑧↔⑫ 드리프트 자리를 늘리지 않는다) |
| Q-2 | 몇 곳을 고칠까 | **a** 겸용 5곳(§3.2 위 5행) — 같은 파일군·같은 ⑧ 선차단 · **b** 7곳 전부 | **a** (나머지 2곳은 ⑧ 선차단·도달 경로 측정이 먼저 — 개발자용 메시지(`[burdened_gift]` · `[redev-burdened-gift]`)라 문구 정리도 필요) |
| Q-3 | 안전망 | **a** route anchor — 겸용 단건 4칸 + 컴패니언 1칸 500→400·메시지 일치 · 대조(환산 200) · 기존 엔진 `toThrow` 단언은 그대로 | **a** |

## 5. 미검증 · 확인 필요

| 번호 | 내용 |
|---|---|
| V-1 | §3.2의 `housing-acq.ts:86 · 169 · 204`, `redevelopment.ts:107`, `burdened-gift-eligibility.ts:77` — 500 재현과 ⑧ 선차단 여부 |
| V-2 | 다건(`multi`) route 직접 호출에서의 상태코드 |
| V-3 | 클라이언트(`callTransferTaxAPI`)가 400 `INVALID_INPUT`과 500을 다르게 보여 주는지 — 400으로 바꾸면 화면 문구가 달라질 수 있다 |
| V-4 | 운영의 오류 모니터링이 5xx를 어떻게 집계하는지(이 repo route에는 호출이 없다) |
| — | 사람이 직접 한 브라우저 수동 확인은 하지 않았다 |

## 6. 구현 계획 (Q-1 a · Q-2 a · Q-3 a일 때, 결정 후 같은 PR)

1. 겸용 5곳의 `throw new Error(m)` → `throw new TaxCalculationError(TaxErrorCode.INVALID_INPUT, m)`(메시지 불변).
2. route anchor: 겸용 단건 4칸(500→400, `error.code=INVALID_INPUT`, 메시지 포함) · 컴패니언 1칸(메시지 «자산 N:» 접두) · 환산 대조 200 · 기존 엔진 `toThrow` 단언 통과 확인.
3. 뮤테이션: 한 곳씩 `Error`로 되돌림(5곳) → 해당 칸 실패.
4. 회귀 5배치 · tsc · eslint. 화면 변경 없음 → Playwright 불필요.
5. 이 문서 §7(구현 결과) 추가.
