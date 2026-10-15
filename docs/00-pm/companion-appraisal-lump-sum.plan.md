# 함께 양도 컴패니언 × 감정가액 — 개산공제(§163⑥)·§114조의2 가산세 배선

> 상태: Do 완료 (2026-10-16) · 선행: #2209·#2210·#2211 (머지 `89eed8a16`)

## 1. 결함 (실측)

같은 입력(함께 양도 2건 · 계약총액 10억 50/50 안분 · 감정가액 3억 · 취득시 기준시가 2억):

| | 첫 자산 | 컴패니언(종전) | 컴패니언(수정) |
|---|---|---|---|
| 필요경비(개산공제) | 6,000,000 | **0** | 6,000,000 |
| 양도차익 | 194,000,000 | **200,000,000** | 194,000,000 |
| 지분 50% 컴패니언 개산공제 | — | **0** | 3,000,000 |
| 신축 5년 이내 가산세(API 직접) | — | **0** (`appraisalValue` 없음) | 15,000,000 |

- 「소득세법」 §97②2호 본문: 취득가액을 §97①1호나목(매매사례·감정·환산)으로 하면 필요경비 = 그 가액 + 대통령령 금액(시행령 §163⑥ 개산공제, 등기 3/100).
- 엔진 `calcTransferGain`의 감정 분기는 `acquisitionMethod === "appraisal"`일 때만 돈다. 컴패니언은 ④·⑫·⑭ 어디에도 이 표시가 없어 감정가액이 **실가로 읽혔다**. ⑧은 취득시 기준시가를 필수로 받는데(`lumpSumBaseRequired`) 그 값이 쓰이지 않았다.
- 기존 `lump-sum-deduction-estimate-modes.anchor.test.ts` A-4는 payload(`standardPriceAtAcquisition`)만 단언해 못 잡았다.
- §114조의2 가산세 base(finalize·손실 경로)는 `appraisalValue`만 읽는다(양도차익 쪽은 `acquisitionPrice`로 대체) — 표시만 실으면 신축 가산세가 여전히 0이다.

## 2. 수정

| 지점 | 내용 |
|---|---|
| ④ `transfer-tax-api-companion-payload.ts` | `isAppraisalCompanion` → `acquisitionMethod: "appraisal"`. 제외: 환산 플래그 동시(stale — 취득가액 칸을 싣지 않는 기존 ④ 규칙과 같다)·부담부증여·겸용·분리 축·pre1990·D2 (본체 ④가 `actual`로 고정하는 범위와 같다). 매매사례는 ⑧이 컴패니언에서 차단(F41)하므로 싣지 않는다. `extensionAppraisalValue`도 싣는다(단건 ④와 같은 술어·같은 지분 스케일) |
| ⑫ `transfer-tax-schema-companion.ts` | `acquisitionMethod: z.enum(["appraisal"])` · `extensionAppraisalValue` |
| ⑭ `bundled-split-helpers.ts` | `acquisitionMethod`·`appraisalValue: acqPrice`·`extensionAppraisalValue`. 키는 상시(값만 undefined) — 조건부 spread는 키 커버리지 가드가 「누락」으로 잡는다 |
| ⑤ `CompanionAcqPurchaseBlock.tsx` | 「증축한 부분의 감정가액」 칸을 컴패니언 카드에도 노출(술어 `generalExtensionAppraisalApplies` 그대로) |
| ⑧ `transfer-tax-validate-acquisition.ts` | #2210의 「컴패니언 × 감정가액 × 신축·증축」 차단 제거 — 이제 계산된다. 증축부분 감정가액 필수 검증은 기존 규칙이 컴패니언에도 그대로 적용 |

## 3. 검증

- anchor `__tests__/calc/companion-appraisal-lump-sum.anchor.test.ts` CA-1~7 · `companion-self-built-penalty.anchor.test.ts` V-1~5(차단 단언 → 계산 단언)
- 뮤테이션 10종 전부 KILLED (④ 표시·⑫ 필드·⑭ 분기·`appraisalValue`·증축부분 ④⑫⑭·stale 환산 제외·겸용 제외·증축 지분 스케일)
- E2E CS-3(신축 15,000,000 · 개산공제 6,000,000)·CS-4(컴패니언 칸 노출 · 증축 3,000,000) · 필드점프 1건 교체 · 감정가액 관련 기존 E2E 11 spec 38건 통과
- `npm run test:transfer` 1,268파일 통과
- 사람이 브라우저로 직접 한 수동 확인은 없다(headless Playwright만)

## 4. 범위 밖

- 컴패니언 매매사례가액 — ⑧ 차단 유지(F41)
- 개산공제를 쓰는 감정가액 모드에서 입력 실비(자본적지출·양도비)를 필요경비에서 빼지 않는 것은 본체와 같은 기존 설계(§97②2호 본문)다
