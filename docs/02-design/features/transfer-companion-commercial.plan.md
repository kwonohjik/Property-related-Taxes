# 상가(commercial_building) × 함께양도·지분 분할 — 구현 계획

**상태**: ✅ 완료 (2026-09-03)
**선행**: 컴패니언 × 부담부증여 (`transfer-companion-burdened-gift.plan.md`)

---

## 1. 두 축이 섞여 기록돼 있었다

「남은 차단」을 정리할 때 **겸용주택·상가·재개발 × 함께양도**라고 적었는데, 그 3종은
실제로는 **축 B(지분 분할)** 목록이다. 두 목록은 다르다:

| 축 | 차단 목록 | 위치 |
|---|---|---|
| **축 B**(지분 분할) | 겸용주택 · **상가** · 재개발 | `transfer-tax-validate.ts:79~90` |
| **함께양도**(컴패니언) | 겸용주택 · 재개발 · 입주권 · 분양권 · 일반건물 | `SINGLE_ONLY` |

**상가는 함께양도 목록에 애초에 없었다.**

## 2. 실측 — 상가는 ⑧이 통과시키는데 route가 400이었다

컴패니언 `assetKind` 8종 전수(route 실측):

| 컴패니언 종류 | ⑧ 게이트 | route |
|---|---|---|
| housing · land · building | 통과 | 200 ✅ |
| **commercial_building** | **통과** | **400** 🔴 |
| general_building · redevelopment_apt | 차단 | 400 |
| right_to_move_in · presale_right | 차단 | 200 (housing으로 fold — 침묵 오산) |

```
{"companionAssets.0.assetKind":["Invalid option: expected one of \"housing\"|\"land\"|\"building\""]}
```

⇒ 사용자는 「함께 양도」에 상가를 추가하면 **아무 안내 없이 계산이 실패**한다. 종전 주석
「`commercial_building`은 차단하지 않는다 — 전용 분기가 없어 엔진 내부에서 처리된다」는
**primary가 상가일 때만** 맞았다.

## 3. 막고 있던 것은 「전용 경로 부재」가 아니었다

축 B 게이트의 종전 사유는 「상가·재개발은 그 경로(`general-building-fractional.ts`)가 없어
계속 차단」이었다. 실제 장벽은 **⑩ enum 3종**이다.

### 3.1 상가 서브객체는 둘 다 **비율 성분**이라 지분 스케일이 불요하다

| 서브객체 | 성분 | 스케일 |
|---|---|---|
| `commercialAppurtenantLand` | 대지·바닥 **면적**(§101① 배율 판정) — 물건 단위 **사실** | ❌ (줄이면 초과분 판정 자체가 달라진다) |
| `commercialBuildingValuation` | 환산 기준시가 — 분자·분모로 **약분** | ❌ |

재개발 권리가액·청산금은 취득가액에 직접 더해지는 **절대금액 성분**이라 반대다
(판별 규칙: `project_transfer_fractional_single_asset_axis_a`).

### 3.2 ⑭에 숨어 있던 fold

`bundled-split-helpers.ts:288`의 삼항식은 상가를 **`land`로 접었다**. ⑩ enum이 400으로
막고 있어 도달이 없었을 뿐, **enum만 넓히면 그 fold가 침묵 오산이 된다**
(입주권·분양권이 `toEngineAssetKind`로 housing에 접혀 **200이면서 틀린 값**이 되는 것과 같은 축).

## 4. 변경 (14 동기화 지점)

| 지점 | 파일 | 변경 |
|---|---|---|
| ⑩ | `transfer-tax-schema-sub.ts` | `assetKind` enum에 `commercial_building` |
| ⑫ | 〃 | `commercialAppurtenantLand` · `commercialBuildingValuation` |
| ⑬ | `transfer-tax-api-helpers.ts` | `buildAssetPayload` 서브객체 emit + `mergePrimaryBasic` cb* 16필드 |
| ⑭ | `bundled-split-helpers.ts` | `propertyType` 매핑 + 서브객체 전달 + 안분 축 fold(building) |
| ⑧ | `transfer-tax-validate.ts` | 축 B 게이트에서 `commercial_building` 제거 |

⑤는 변경 없다 — 상가 입력 규약이 축에 따라 달라지지 않는다(부담부증여·재개발과 다른 점).

## 5. 실측

| | 차익 | 세액 |
|---|---:|---:|
| 단건 100% (부수토지 有) | 600,000,000 | 187,665,500 |
| 단건 (부수토지 미입력 — 대조군) | 600,000,000 | 186,846,000 |
| **축 B 60/40** | 360,000,000 + 240,000,000 | **187,665,500** ✅ |
| 컴패니언(주택+상가) | 100,000,000 + 200,000,000 | 79,849,000 (종전 400) |

- 선형성 ✅ (차익이 지분율에 정비례)
- §101① 부수토지 초과 판정이 **두 카드 모두에서 발동**
- **판별력 819,500원** — 「일치」가 「양쪽 다 미발동」이 아님을 고정한다

## 6. 뮤테이션 (전부 RED)

| 제거한 층 | 결과 |
|---|---|
| ⑭ propertyType 매핑(상가→land 복원) | 3건 실패 |
| ⑭ 서브객체 전달 | 3건 실패 |
| ⑬ 컴패니언 emit | 4건 실패 |
| ⑬ `mergePrimaryBasic` cb* | 3건 실패 |
| ⑬ `mergePrimaryBasic` assetKind | 3건 실패 |

> 🔴 **`mergePrimaryBasic` 뮤테이션은 처음에 구별력 0이었다.** 픽스처가 컴패니언 카드에도
> `cb*`를 손으로 넣어 **그 층을 우회**했기 때문이다. 실제 UI는 축 B에서 컴패니언 ① 기본정보를
> 숨기므로(`CompanionAssetCard`) primary에만 값이 있다. 픽스처를 실제 폼 상태로 고치자
> 3건 RED가 됐다 — 구별력 0은 「그 분기가 맞다」가 아니라 **측정 실패**였다.

## 7. 남은 것

| 항목 | 상태 |
|---|---|
| 🛑 재개발 × 축 B·함께양도 | §166 서브객체 미배관 + **청산금·권리가액이 절대금액 성분**이라 스케일 규약 결정 필요(축 A와 반대). 별건 |
| 🛑 겸용주택 × 축 B·함께양도 | route 5-a-2 전용 분기라 companion이 있으면 **실행조차 되지 않는다**. 별건 |
| 🛑 입주권·분양권 × 함께양도 | ⑩ enum 부재 + `toEngineAssetKind` fold. **200이면서 틀린 값**이라 게이트가 반드시 필요하다 |
| 🛑 일반건물 × 함께양도 | 전용 경로는 축 B뿐 |
