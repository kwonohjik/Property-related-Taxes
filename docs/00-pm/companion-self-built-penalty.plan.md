# 컴패니언(함께양도·지분 카드)의 신축·증축 특례(§114조의2) — 입력이 엔진에 닿지 않던 결함

> 선행: #2209(통상 경로 감정가액 × 증축 base). 그 계획서 §4가 「컴패니언 신축·증축 입력이 엔진에 닿지 않는다」를 후속으로 남겼다. 이 문서는 그 건과 이전 계획서(#2206 §4)의 「축 B × 신축 감정의 지분 카드 가산세」를 함께 닫는다.

## 1. 결함 (실측 — 이 작업 직전 master)

컴패니언 카드(함께 양도 2번째 이후 · 지분 카드)에도 「본인이 신축 또는 증축한 건물입니까?」 칸이 **화면에 있다**(E2E CS-2가 컴패니언 카드에서 그 칸의 가시성을 단언한다). ⑧은 그 칸을 검증하지만 ⑫ 컴패니언 스키마(`transfer-tax-schema-companion.ts`)에 필드가 없고 ④ 컴패니언 payload(`transfer-tax-api-companion-payload.ts`)가 싣지 않아, **입력해도 첫 자산만 계산되고 컴패니언은 가산세 0**이었다.

| 사례 | 종전 | 이 PR |
|---|---|---|
| 함께 양도 · 환산 · 자산 2 신축(환산취득가 99,999,999) | 자산 2 가산세 **0** | **4,999,999** |
| 축 B 부담부증여 · 감정가액 · 지분 카드 2(40%) 신축 | 지분 카드 2 가산세 **0** | **6,000,000**(= 5억×40%×채무비율 0.6 = 1.2억의 5%) |
| 함께 양도 · 감정가액 · 자산 2 신축 | 가산세 0(조용히) | ⑧이 막는다(아래 D-3) |

## 2. 설계 결정

| # | 결정 | 근거 |
|---|---|---|
| D-1 | ⑫ 컴패니언 스키마에 `isSelfBuilt`·`buildingType`·`constructionDate`·`extensionFloorArea`·`extensionStdPriceAtAcquisition`를 본체와 같은 형태로 추가, ④는 `selfBuiltActive` 게이트(겸용 제외)로 싣고 ⑭는 명시 매핑(`constructionDate`는 `toOptionalDate`). 키 커버리지 가드(`CompanionOwnedKeys`)가 매핑 누락을 컴파일로 잡는다. | 단건 ④와 같은 게이트·같은 단일 leaf. 면적·기준시가는 물건 단위 사실이라 지분 스케일 없음 |
| D-2 | 환산 컴패니언은 신축·증축일 때 `acquisitionMethod: "estimated"`를 함께 싣는다. | 가산세 게이트(`calculateBuildingPenalty`)가 산정방식을 본다 — 본체 ④는 싣지만 컴패니언 ④는 방식 필드가 없었다. 엔진에서 이 키를 읽는 곳은 가산세·다필지뿐이고 신축·증축 × 환산일 때만 싣는다(나머지 컴패니언은 입력 바이트 동일) |
| D-3 | 일반(비-부담부) 컴패니언 × 감정가액 × 신축·증축(5년 게이트 열림)은 **⑧이 막는다**(그 자산 카드의 산정방식 칸으로 이동). 첫 자산(본체)은 계산되므로 막지 않는다. | 컴패니언 경로는 감정가액을 `acquisitionPrice`로만 싣고 산정방식·base를 엔진에 싣지 못한다 — 계산하지 못하는 가산세를 0으로 두는 것은 조용한 과소(`feedback_unknown_fact_applies_unfavorably`). 구현은 컴패니언 산정방식 모델이 필요해 별건 |
| D-4 | 부담부증여 컴패니언(축 B 포함)은 D-3에서 제외 — 전용 경로(`burdenedGiftInfo`)가 감정가액을 안분해 base를 만든다. 숨겨진 일반 방식 플래그(stale `isAppraisalAcquisition`)가 남아 있어도 막지 않는다. | `transfer-tax-burdened-gift-step.ts`가 `rawInput.isSelfBuilt`를 읽는다(D-1로 이제 도달) |
| D-5 | 컴패니언 카드에서는 「증축한 부분의 감정가액」 칸(#2209)을 숨긴다. | ④가 컴패니언에는 그 값을 싣지 않고 ⑧이 그 조합을 먼저 막는다 — 칸 없는 값·값 없는 칸 모두 만들지 않는다 |

## 3. 범위 밖 (확인 필요)
- 일반 컴패니언의 감정가액 × 신축·증축 계산(D-3의 차단 해제) — 컴패니언의 산정방식 모델(`acquisitionMethod`·감정가액 필드)이 없다.
- 축 B × **증축** × 감정가액 — 지분 카드에 「증축한 부분의 감정가액」 칸이 없어 ⑧이 계속 막는다(#2206 D-6).
- 다건 합산 카드(`BundledAllocationSubCards`)의 가산세 라벨은 「환산취득가액」 고정 — 별건.

## 4. 검증
- `__tests__/calc/companion-self-built-penalty.anchor.test.ts`(11) · E2E `e2e/transfer-companion-self-built-penalty.spec.ts`(CS-1~3) · 필드점프 1건.
- 뮤테이션 11종 전부 KILLED(처음 N7 「BG 제외 제거」 생존 → stale 플래그 시나리오로 보강 후 KILLED).
- 사람이 브라우저로 직접 한 수동 확인은 없음(headless Playwright만).
