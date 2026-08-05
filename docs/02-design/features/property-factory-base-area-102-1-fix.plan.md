# 재산세 공장용지 — 분리과세 한도(§102①1호)를 별도합산 기준면적으로 쓰던 결함 정정

> 상태: **완료 (2026-08-05)**
> 브랜치: `feat/factory-site-standard-area-nbl`
> 선행: [공장용지 기준면적 초과분 비사업용 중과](factory-site-standard-area-nbl.plan.md)

---

## 1. 착수 배경과 **전제 정정**

공장용지(양도세) 작업의 「범위 밖」 항목으로 *"재산세 §102①1호 산식 미구현 — 사용자가 공장입지
기준면적을 직접 입력해야 한다"* 를 기록했다. 그런데 착수해 보니 **전제가 틀렸다**.

문제는 "산식이 없다"가 아니라 **공장입지기준면적이 잘못된 조문·잘못된 엔진에 들어가 있다**는 것이다.

---

## 2. 결함 — 두 조문을 섞고 있었다

「지방세법 시행령」의 두 조문은 **소재 지역으로 배타 분기**하고 한도 산식이 다르다:

| 조문 | 과세구분 | 한도 |
|---|---|---|
| **§101①1호** | **별도합산** | 공장용 건축물 **바닥면적 × §101② 적용배율** |
| **§102①1호** | **분리과세** | **공장입지기준면적**(시행규칙 §50 [별표6]) |

§101①1호 본문에는 공장입지기준면적 개념이 **아예 없다**(법제처 MST 287223 실측):

> 1. …의 공장용 건축물의 부속토지로서 공장용 건축물의 **바닥면적**…에 제2항에 따른
>    용도지역별 적용배율을 곱하여 산정한 범위의 토지

그런데 현행 코드는 **별도합산** 판정에서 `factoryStandardArea`를 기준면적으로 썼다.

### 결함이 퍼져 있던 3곳 (실측)

| 위치 | 종전 동작 |
|---|---|
| `separate-aggregate-land.ts` `calculateBaseArea` | `factoryStandardArea`가 있으면 그것을 기준면적으로 사용 (조문 라벨은 `§101①1호`) |
| `separate-aggregate-land.ts` 건축물 존재 판정 | `factoryStandardArea`만 있어도 **건축물이 있다고 인정** |
| `property-tax-comprehensive-aggregate.ts` | 같은 결함 (종합합산 엔진의 별도합산 분리 로직) |

UI 문구도 법문과 **반대**였다:

> "산업집적활성화법상 공장입지기준면적 이내: **별도합산**, 초과: 종합합산"

법문대로면 공장입지기준면적 이내는 **분리과세**(§102①1호)다.

---

## 3. 정정 — 조문대로

`factoryStandardArea` 분기를 **제거**하고, 공장용지도 §101①1호 본칙(바닥면적 × §101② 배율)만
따르게 했다. 공장용지와 공장용 외의 산식이 같아지고 **조문 라벨(1호/2호)만 다르다**.

| 파일 | 변경 |
|---|---|
| `separate-aggregate-land.ts` | `calculateBaseArea` 분기 제거 · 건축물 존재 판정에서 제외 · 헤더 정정 |
| `property-tax-comprehensive-aggregate.ts` | 같은 분기 제거 · 주석 정정 |
| `validators/separate-aggregate-input.ts` | refine을 **바닥면적 필수**로 · `factoryStandardArea`에 `@deprecated` |
| `components/calc/property/shared.ts` | validate를 바닥면적 필수로 · API 변환에서 필드 제거 |
| `components/calc/property/Step2SeparateAggregate.tsx` | 공장입지기준면적 입력 칸 **제거** · 바닥면적 칸을 공장·비공장 공통으로 · 토글 설명 정정 |

`factoryStandardArea` 필드 자체는 타입·Zod에 **남겼다**(하위 호환 — 기존 이력·API 호출이 깨지지
않게). 다만 **어느 엔진도 소비하지 않는다**.

---

## 4. 🔴 세액이 바뀐다 — before/after를 값으로 고정했다

`__tests__/tax-engine/property-factory-base-area.anchor.test.ts` (6건)

정정 **전** 구현에서 4건이 실패하는 것을 먼저 확인하고 고쳤다(가드가 실효를 갖는지 증명):

| 케이스 | 정정 전 | 정정 후 |
|---|---|---|
| 바닥 200㎡ · 일반주거(4배) · `factoryStandardArea` 5,000 | 기준면적 **5,000㎡** | **800㎡** |
| 바닥 0 · `factoryStandardArea` 5,000 | **5,000㎡** | **0㎡**(건축물 없음 → 종합합산) |

기존 테스트 2건도 옛 계약을 고정하고 있어 **정정된 계약으로 갱신**했다:
- `separate-aggregate-land.test.ts` TC-24 — "공장입지기준면적만으로 별도합산 인정" → 바닥면적 필요.
  반대 케이스 `TC-24b`를 신설해 "바닥면적 없으면 전량 종합합산"을 고정
- 같은 파일 Zod 테스트 — "factoryStandardArea 포함이면 유효" → 바닥면적 필수·공장입지기준면적만이면 차단
- `local-tax-zone-multiplier.anchor.test.ts` Z-4 — "입력 시 그 면적(700㎡)" → "무시하고 800㎡"

---

## 5. 하지 않은 것 (근거)

### 분리과세 경로에 별표6 산식을 넣지 않았다

§102①1호가 진짜 소관인 **분리과세** 경로(`property-land-classification.ts:157`)는
`isIndustrialDistrict && landUse === "factory"` 플래그만 보고 **면적 한도 없이** 전량 분리과세로
판정한다.

다만 이는 공장만의 문제가 아니다 — **목장용지도** `isCattleFarmland` 플래그만 보고 "기준면적
이내"라고 표시한다(`property-land-classification.ts:132`). 즉 분리과세 전반이 **"사용자가 요건
충족을 선언"** 하는 설계다. 공장에만 실제 한도 계산을 넣으면 다른 subtype과 어긋난다.

⇒ 분리과세에 면적 한도를 도입하려면 **subtype 전반의 설계 결정**이 먼저다. 별건.

### `factoryStandardArea` 필드를 삭제하지 않았다

타입·Zod에 남겨 하위 호환을 지켰다. 소비처가 0이므로 세액에는 영향이 없다.
완전 제거는 이력·API 계약 정리와 함께 별건으로.

---

## 6. 검증

- `tsc --noEmit` 0건 · `eslint` 0 errors
- 신규 anchor **6건**(정정 전 4건 실패 → 정정 후 전건 통과로 실효 증명)
- 기존 테스트 3건 계약 갱신
- `npm run test:property` **248건** GREEN
- `npm run test:comprehensive` **510건** GREEN (재산세 의존 세목)
- 전체 vitest **13,639건** GREEN · 실패 0
