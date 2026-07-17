# 계획서 — §28① 단서 전단: 사전증여 증여세 부과제척기간 만료 시 증여세액공제 배제 (국기법 §26의2④⑤)

> 상속·증여세 2round 코드리뷰 잔여 미결 1건. `inheritance-gift-tax-credit.ts:53` TODO 실구현.
> 상태: **계획 (Plan)**. 작성 2026-07-18. 법령 KoreanLaw MCP 원문 검증 완료.

## 0. 한 줄 요약

§28① 단서 전단(국기법 §26의2④⑤ 제척기간 만료로 **증여세가 부과되지 아니하는** 사전증여는 상속세에서 증여세액공제 배제)이 미구현이라, 해당 edge에서 **증여세액공제가 과대 적용(납세자 유리 오류)**된다. `PriorGift`에 `giftTaxTimeBarred` 플래그를 추가하고 `calcGiftTaxCredit`에서 해당 gift를 공제 합계·한도 분자 양쪽에서 제외한다.

## 1. 배경 · 현행 결함

`calcGiftTaxCredit`(`lib/tax-engine/inheritance-gift-tax-credit.ts`)는 §28① 단서의 **두 배제 사유 중 후단만** 구현:

| §28① 단서 | 내용 | 현행 |
|---|---|---|
| 전단 | 국기법 §26의2④⑤ **기간 만료로 증여세 부과 안 됨** → 공제 배제 | ❌ 미구현 (line 53 TODO) |
| 후단 | 상속세 **과세가액 5억원 이하** → 공제 배제 | ✅ 구현 (line 66~85) |

전단 미구현 결과: §13으로 상속재산에 가산됐으나 증여세 부과제척기간이 만료돼 실제로는 증여세를 부과할 수 없는 사전증여에 대해서도, 그 gift의 `giftTaxPaid`(또는 한도 분자 `giftTaxBase`)가 공제에 반영되어 **상속세가 과소 산정**될 수 있다. 법 명문(§28① 단서 전단)에 반하는 과대공제이므로 시정 대상(법 근거 명확 → 불리 방향이나 적용 정당).

## 2. 법령 근거 (KoreanLaw 원문 검증 2026-07-18)

### 상증법 §28① (mst 276123)
> ① 제13조에 따라 상속재산에 가산한 증여재산에 대한 증여세액…은 상속세산출세액에서 공제한다. **다만, 상속세 과세가액에 가산하는 증여재산에 대하여 「국세기본법」 제26조의2제4항 또는 제5항에 따른 기간의 만료로 인하여 증여세가 부과되지 아니하는 경우**와 상속세 과세가액이 5억원 이하인 경우에는 그러하지 아니하다.

### 국기법 §26의2 (mst 280373)
- **④ 상속·증여세 부과제척기간 = 국세를 부과할 수 있는 날부터 10년.** 다음 중 하나면 **15년**:
  1. 부정행위로 상속·증여세 포탈·환급·공제
  2. 상증법 §67·§68 신고서 **미제출(무신고)**
  3. 신고서 제출자가 **거짓·누락 신고**(해당 부분만)
- **⑤ 부정행위 + 특정사유(제3자 명의·국외재산·무등록 유가증권/서화·금융자산·명의신탁§45의2·가상자산 등): 상속·증여가 있음을 **안 날부터 1년**.** 단, 상속인·증여자·수증자 사망 또는 재산가액 **50억원 이하**면 제외.
- **⑨ 기산일("국세를 부과할 수 있는 날")은 시행령** — 증여세는 **증여세 신고기한(증여받은 달 말일 + 3개월)의 다음날**.

⇒ 사전증여의 증여세 제척기간 = (증여 신고기한 다음날) + 10년(일반) 또는 15년(무신고·부정·거짓누락). 이 기간이 상속세 부과시점 이전에 만료되면 §28 공제 배제.

## 3. 도달성 · 영향 분석 ("과대주장 금지" 준수)

**희소하나 실재하는 edge.** 두 조건 동시 성립 필요:
1. **§13 가산 대상**: 증여일이 상속개시일 −10년(상속인)/−5년(비상속인) 이내.
2. **증여세 제척기간 만료**: (증여 신고기한 다음날 + 10/15년) < 상속세 부과시점.

일반 10년 제척 + 상속세 부과시점 ≈ 상속개시일이면 두 조건은 상충(∵ 신고기한 여유 3개월). **주 도달 경로**: 상속세 부과가 상속개시일보다 크게 지연된 경우 — 예: 상속세 **무신고·부정행위로 상속세 제척기간 15년**이 적용되어 상속개시 후 여러 해 뒤 상속세가 부과되고, 그 사이 §13 가산된 사전증여의 **증여세 제척기간(10년)이 이미 만료**된 경우. (증여세는 별도 기산·별도 제척.)

**영향 방향**: 현행 = 과대공제(유리 오류) → 수정 = 공제 축소(불리). **법 명문(§28① 단서 전단) 근거 명확**하므로 `feedback_no_unfavorable_application_without_legal_basis` 위배 아님. 단, **flag=false(기본)면 현행과 완전 동일** → 무회귀.

## 4. 케이스 매트릭스

| # | 사전증여 상황 | giftTaxTimeBarred | 처리 |
|---|---|---|---|
| TB-1 | 일반 사전증여(제척 미만료·증여세 납부) | `false`/undefined | 현행대로 공제 반영 (무회귀) |
| TB-2 | §13 가산 + 증여세 제척기간 만료(부과 불가) | `true` | **공제 합계·한도 분자에서 제외** |
| TB-3 | 다건 혼합 (일부만 time-barred) | 개별 flag | time-barred만 제외, 나머지 정상 공제 |
| TB-4 | time-barred gift가 유일 사전증여 | `true` | 공제 0 (합계·분자 모두 0) |
| TB-5 | 과세가액 ≤ 5억 AND time-barred | 무관 | 후단(5억)이 선행 배제 — 현행 분기 우선 (무영향) |
| TB-6 | time-barred=true인데 giftTaxPaid>0 (모순 입력) | `true` | 방어적으로 제외(단서 우선) — 입력은 validate에서 경고 가능(후속) |

## 5. 설계

### 5.1 타입 (①⑫) — `lib/tax-engine/types/inheritance-prior-gift.types.ts`
`PriorGift`에 optional 필드 추가:
```ts
/**
 * 증여세 부과제척기간 만료로 증여세를 부과할 수 없는 사전증여(국기법 §26의2④⑤).
 * true면 §28① 단서 전단에 따라 상속세 증여세액공제에서 제외(합계·한도 분자 양쪽).
 * §13 상속재산 가산은 별도(상속 제척기간)이므로 그대로 유지. 기본 undefined=미만료(현행).
 */
giftTaxTimeBarred?: boolean;
```

### 5.2 엔진 — `calcGiftTaxCredit` (`inheritance-gift-tax-credit.ts`)
5억 단서(현행 line 66~85) **이후**, 합계·한도 계산 **이전**에 필터 삽입:
```ts
// §28① 단서 전단 — 증여세 부과제척기간 만료(국기법 §26의2④⑤)로 증여세 부과 불가한
//   사전증여는 증여세액공제 대상에서 제외(합계·§28② 한도 분자 양쪽). §13 가산은 유지.
const creditableGifts = priorGifts.filter((g) => g.giftTaxTimeBarred !== true);
const excludedCount = priorGifts.length - creditableGifts.length;
```
- `totalGiftTaxPaid`·`totalGiftTaxBase`를 `creditableGifts` 기준으로 산정(기존 `priorGifts` → `creditableGifts`).
- `excludedCount > 0`이면 breakdown에 배제 안내 1행 추가(lawRef `TAX_CREDIT.GIFT_TAX_CREDIT`, "§28① 단서 전단·국기법 §26의2④⑤ 기간만료").
- `creditableGifts`가 비면 기존 `totalGiftTaxPaid<=0` 분기(line 92)로 자연 0 처리.

### 5.3 legal-codes 주석 — `legal-codes/inheritance-gift.ts:53,430`
TODO 주석을 "구현 완료(§28① 단서 전단, `giftTaxTimeBarred`)"로 갱신.

### 5.4 14 동기화 지점 (PriorGift 공용 스키마)
| 지점 | 위치 | 작업 |
|---|---|---|
| ① 폼상태 | `PriorGiftInput.tsx` FormState | `giftTaxTimeBarred?: boolean` |
| ② initial | 동상 기본 undefined/false | |
| ③ normalize | 동상 | |
| ④ API변환 | `lib/calc/inheritance-api.ts`(상속) — priorGift 매핑에 전달 | |
| ⑤ UI위젯 | `components/calc/PriorGiftInput.tsx` — ToggleCard(tone amber) "증여세 부과제척기간 만료(§28① 단서·국기법 §26의2④⑤)" + hint | |
| ⑥ 사이드바 | N/A(합계 selector 없음) | |
| ⑦ 결과카드 | `TaxCreditBreakdownCard.tsx` — 배제 안내행 표시(엔진 breakdown echo) | |
| ⑧ validate | `lib/calc/inheritance-validate.ts` / client `validatePriorGift` — flag=true인데 giftTaxPaid>0이면 경고(비차단, TB-6) | |
| ⑨ Zod메인 | `lib/validators/prior-gift-schema.ts` `priorGiftSchema` — `giftTaxTimeBarred: z.boolean().optional()` | |
| ⑩~⑭ | 상속 route handler는 priorGiftSchema 재사용 — enum·body spread·Date 변환 무관(boolean) | |

> **주의(공용 스키마)**: `priorGiftSchema`는 상속(`preGiftsWithin10Years`)·증여(`priorGiftsWithin10Years`) 공용(`prior-gift-schema.ts:2`). 필드는 optional이라 증여 경로 무영향. **증여세 §58 재차증여공제에도 동일 §26의2 단서가 있는지 별도 verify-first**(범위 외·후속, §6).

## 6. 앵커 테스트 (`__tests__/tax-engine/inheritance/` 신규 또는 기존 credit 테스트 확장)

- **TB-2**: 단일 사전증여 giftTaxPaid 5천만·giftTaxBase 3억, `giftTaxTimeBarred:true`, 과세가액>5억 → `creditAmount === 0` + breakdown에 "§28① 단서 전단" 포함. (mutation: flag 제거 시 공제>0 → RED)
- **TB-1 무회귀**: 동일 입력 `giftTaxTimeBarred` 미설정 → 기존 공제값 그대로.
- **TB-3 혼합**: 2건 중 1건만 time-barred → 나머지 1건 기준 합계·한도. 원단위 `toBe()` 고정.
- **TB-5**: 과세가액 5억 이하 + time-barred → 후단(5억) 배제 우선(현행 분기) 확인.
- 전체 회귀: `npx vitest run __tests__/tax-engine/inheritance/` + 상속 통합.

## 7. Definition of Done

- [ ] 케이스 매트릭스 TB-1~6 전 분기 앵커
- [ ] `giftTaxTimeBarred=false/undefined`면 기존 결과 **완전 동일**(무회귀 앵커)
- [ ] 14지점 중 해당분(①②③④⑤⑦⑧⑨) 동기화 · `giftTaxTimeBarred` grep 자가점검
- [ ] `npx tsc --noEmit` 0건
- [ ] `npx vitest run __tests__/tax-engine/inheritance/` + credit 테스트 GREEN
- [ ] 브라우저 수동 확인(사전증여 입력→토글→결과 배제행) 또는 미수행 명시
- [ ] KoreanLaw §28①·국기법 §26의2④⑤ 인용 결과뷰 정확(§26의2⑥이하 미인용)

## 8. 범위 외 · 후속

- **자동 도출(auto-derive) 범위 외**: 제척기간 만료 판정은 (증여 신고기한 + 10/15년) < **상속세 부과시점** 비교인데, 상속세 부과시점은 계산기 입력에 없음(신고 시점 계산). 무신고·부정행위·역외 여부도 사실판단. ⇒ **사용자 입력 boolean(single source)** 채택, 자동 도출은 후속.
- **§58 증여세 재차증여공제 병행**: 증여세 산출세액에서 기납부 증여세 공제(§58)에도 유사 제척기간 단서가 있는지 KoreanLaw로 verify 후 별건 처리(현 계획은 §28 상속세 경로만).
- **국기법 §26의2⑤ 50억·사망 예외**: auto-derive 도입 시에만 관련. boolean 입력에서는 사용자가 최종 판정.
- 서식(별지9호·부표) 반영: 공제 0/축소는 기존 서식 배선이 엔진 result echo이므로 자동 반영. 신규 서식행 불요.

---
🤖 계획서 생성: Claude Code
