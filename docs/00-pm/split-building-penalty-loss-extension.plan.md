# 토지·건물 분리 자산 — 건물 파트 §114조의2 가산세: 손실 경로 · 증축부분 base

> 상태: Do 완료 (2026-10-16) · 선행: #2212(컴패니언 감정가액 — 이 브랜치는 그 위에 쌓였다)

## 1. 결함 (실측 — F25 fixture 기반)

「소득세법」 §114조의2① — 신축·증축 5년 이내 양도 + 감정가액·환산취득가액이면 「해당 건물의」 그 가액 5%(괄호: 증축은 **증축한 부분에 한정**). ② — 산출세액이 없어도 적용.

| 케이스 | 종전 가산세 | 수정 |
|---|---|---|
| 손실 × 건물 파트 환산 × 신축 (건물 환산 75,000,000) | **0** | 3,750,000 |
| 손실 × 건물 파트 감정 × 신축 (건물 감정 80,000,000) | **0** | 4,000,000 |
| 이익 × 환산 × 증축 | **11,250,000** (건물 전체 225,000,000) | 2,250,000 (증축부분 45,000,000) |
| 손실 × 환산 × 증축 | **0** | 750,000 (증축부분 15,000,000) |
| 이익·손실 × 감정 × 증축 | **12,500,000** / **0** | 3,000,000 (증축부분 감정가액 60,000,000) |

원인
1. 손실 조기반환(`transfer-tax-loss-return.ts`)이 분리 축(`resolveSplitBuildingPenaltyAxis`)을 읽지 않았다 — finalize 주석이 이미 「아직 이 축을 쓰지 않는다」고 적어 둔 갭.
2. 그 축은 증축이어도 건물 파트 전체를 base로 냈다(finalize 주석 「입력 칸이 없어 종전대로 둔다」).
3. 분리 자산은 파트 라디오가 자산 단위 `isAppraisalAcquisition`을 갱신하지 않아 「증축한 부분의 감정가액」 칸이 뜨지 않았다.

## 2. 수정

| 지점 | 내용 |
|---|---|
| 엔진 `transfer-tax-building-penalty.ts` | `resolveSplitBuildingPenaltyAxis(splitDetail, input)`를 finalize에서 옮겨 정상·손실 경로가 공유(finalize는 재수출). 증축이고 게이트가 열리면 증축부분 base — 환산: 건물 파트 양도가액 × 증축부분 취득시 기준시가 ÷ 건물 양도시 기준시가 / 감정: `extensionAppraisalValue`(없으면 오류, 건물 감정가액 초과 오류) |
| 엔진 `transfer-tax-loss-return.ts` | 분리 축 → 일반건물 카드 → 부담부증여 순서(finalize와 같다) |
| 엔진 finalize·손실 | 분리 건물 파트 축이면 `resolveExtensionPenaltyBase`(자산 전체 식)로 다시 덮지 않는다 |
| 엔진 split-gain·split-acq-price·types | `SplitPartResult.stdPriceAtTransfer`(건물 파트 환산일 때 — 결합 공시 비례 안분 후 분모) |
| 술어 `extension-appraisal-penalty.ts` | 「감정가액」 = 자산 단위 **또는** 분리 자산 건물 파트 방식(④ `buildSplitPayload`의 파트 입력 게이트와 같은 판정 — 별개 취득 토글·소유자 분리, 건물 소유, D2 정규화). ⑤ 칸·⑧ 필수·④ 전송(단건·다건·컴패니언)이 이 술어를 쓴다 |
| ⑧ `transfer-tax-validate-acquisition.ts` | 상한 비교 대상 = 분리 자산이면 건물 파트 감정가액(`splitBuildingAcqPriceInput`) |
| ④ 컴패니언 | 증축부분 감정가액은 술어만으로 싣는다(`isAppraisalCompanion`은 분리 축을 빼므로 그것으로 다시 거르지 않는다) |

### 설계 결정 — 분리 자산의 증축부분 환산식
비분리 경로(`resolveExtensionPenaltyBase`)는 「자산 양도가액 × 증축부분 취득시 기준시가 ÷ 자산 양도시 기준시가」다. 분리 자산은 같은 식을 **「해당 건물」 값**(건물 파트 양도가액·건물 양도시 기준시가)으로 쓴다. 양도가액을 기준시가 비율로 안분했으면 두 식은 같은 값이고, 구분 기재(계약서) 양도가액이면 건물 파트 식이 조문의 「해당 건물의」에 맞다. 해석례는 확인하지 못했다(확인 필요).

## 3. 검증

- 엔진 anchor `__tests__/tax-engine/transfer/split-building-penalty-loss-extension.test.ts` L-1~3 · E-1~9(+E-5b)
- 클라이언트 anchor `__tests__/calc/general-extension-appraisal.anchor.test.ts` S-1~5(+S-4b) — 폼 → route → 엔진 base 60,000,000 · 3,000,000
- 뮤테이션 14종 전부 KILLED (N6·N7은 처음에 생존 — 분모 10억에서 자산 전체 식과 건물 파트 식이 우연히 같은 값이라 9억으로 바꿔 보강, N13은 컴패니언 분리 케이스 추가)
- E2E `transfer-split-building-penalty.spec.ts` SB-1(칸 노출 · 3,000,000)·SB-2(손실 3,750,000) · 분리·신축 관련 기존 34 spec + 필드점프 634 passed (skip 21은 스펙의 `unreachableInUi`)
- `npm run test:transfer` 1,269파일 통과
- 사람이 브라우저로 직접 한 수동 확인은 없다(headless Playwright만)

## 4. 범위 밖

- PHD(§164⑦) 분리 경로의 건물 파트는 `stdPriceAtTransfer`를 싣지 않는다 — 환산 × 증축이면 종전대로 건물 파트 전체 base(확인 필요)
- 소유자 분리에서 건물 비소유(`land_only`)인 자산의 건물 파트 축은 종전 거동 그대로
