# 입주권 취득가액 입력 축 정비 — 상단 축 A 제거 + 승계조합원 입주권 지원

- 작성일: 2026-08-23 (**v3 — R-11(승계조합원 입주권)을 본 PR에 포함하기로 사용자 결정**)
- 워크트리/브랜치: `worktree-transfer-right-acq-cost-input` (기준 `4729424e` = PR #1248 머지 직후 master)
- 선행: PR #1245(자산 종류 축 일원화) · #1246(완공APT 전용 입력 2종 차단) · #1247(예규 날짜 정정)
- 관련 계획서: [`right-to-move-in-block-separation.plan.md`](right-to-move-in-block-separation.plan.md)
- memory: `project_right_to_move_in_asset_kind_axis` · `feedback_ui_gate_removes_sole_input_path` · `feedback_pre_change_safety_net_probe` · `feedback_no_statute_claim_needs_requirement_article`

> ### 개정 이력
> - **v1** — 상단 축 A 제거만. Q-3에서 「stale `redevIsSuccessorMember` 정규화가 세액을 바꾼다」고 물음.
> - **v2** — 사용자 지적(「승계조합원인데 어떻게 인가전 양도차익이 계산되나」)으로 **Q-3 전제가 틀렸음을 확인**. §166①은 원조합원 전용(법문 실독). 승계 축을 R-11로 분리.
> - **v3(현재)** — 사용자 결정으로 **R-11을 본 PR에 포함**. 설계 2안을 실측 비교해 **안 B(일반 양도 경로 위임)** 채택. 그 결과 §2.5의 결함 3건이 모두 해소되고, 상단 축 A 제거와 **하나의 일관된 축 정리**가 된다.

---

## 1. 요구사항

| # | 지시 | 출처 |
|---|---|---|
| 1 | 입주권 화면 상단의 일반 「취득가액 산정 방식·취득가액」(축 A)이 세액계산에 쓰이는지 조사 → **안 쓰임 확정** → **제거** | 사용자 (1번안 선택) |
| 2 | 승계조합원 입주권 처리(R-11)를 **이번에 함께** | 사용자 (v3) |

---

## 2. 착수 전 실측

> ⚠️ 수치·동작은 전부 **throwaway probe 실행 결과**(probe는 실측 후 삭제, `git status` 클린 확인).
> `file:line`은 실파일 대조를, 법령은 **KoreanLaw MCP 본문 실독**을 마쳤다.

### 2.1 상단 축 A가 도달하지 않는다 — API body 캡처 (probe P-1)

입주권 1건, 상단 취득가액 `100,000,000` / ⑤섹션 취득가액 `77,777,777` 동시 입력:

| 상단 라디오 | body `acquisitionPrice` | `acquisitionMethod` |
|---|---|---|
| 실거래가 | **77,777,777** ← ⑤ 값 (상단 1억은 **미도달**) | `actual` |
| 환산취득가 | **0** | `estimated` |
| **감정가액** | **0** (`appraisalValue`는 전송되나 §166 경로가 안 읽음) | `appraisal` |
| **매매사례가액** | **0** (`similarSalesValue` 동상) | `salesCase` |

### 2.2 코드 경로 (실파일 대조)

| # | 지점 | 근거 | 사실 |
|---|---|---|---|
| ① | API 취득가액 | `transfer-tax-api.ts:291-302` | `isRedevelopment`(:175-176)이면 `redevActualAcquisitionPrice` 사용. 단 앞 조건 `isEstimated \|\| isAppraisal \|\| isSalesCase …`가 먼저 걸려 **0** |
| ② | 추계 3형 플래그 | `transfer-tax-api.ts:98-100` | 자산-수준 플래그만 봄 — **assetKind 가드 없음** |
| ③ | 엔진 분기 | `transfer-tax.ts:217` | STEP 0.65에서 `calculateRedevelopmentTax`로 직행 |
| ④ | 엔진 취득가액 소비 | `transfer-tax-redevelopment.ts:90` | `input.acquisitionPrice`만 읽음 — `appraisalValue`·`similarSalesValue` **grep 0건** |
| ⑤ | 종전자산 취득가액 | `redevelopment-split.ts:165` | `?? 0` → **0이면 인가전 차익 = 권리가액 − 0 (과대과세)** |
| ⑥ | 기준시가 | 재개발 5파일 grep | `standardPriceAtAcquisition`·`AtTransfer` **사용처 0건** |
| ⑦ | UI 게이트 | `CompanionAcqPurchaseBlock.tsx:386` | `assetKind !== "redevelopment_apt"` — **`right_to_move_in` 누락** |
| ⑧ | 사이드바 | `transfer-per-asset-summary.ts:134-143` | 주석이 이미 「입주권 — 상단 칸이 숨겨지고」 — **사이드바만 목표 상태 선반영** |
| ⑨ | ⑧ validate | `transfer-tax-validate-asset.ts:169-177` | 두 assetKind 모두 §166 분기에서 early return ⇒ **상단을 숨겨도 validate dead-end 없음** |

⇒ 상단 축 A는 입주권에서 (a) 실거래가 모드에서 무시되고, (b) 감정·매매사례에서 취득가액을 0으로 만든다. (b)는 **아무도 막지 않는 침묵 과대과세**.

### 2.3 안전망 실측 — **0건** (mutation probe)

`transfer-tax-api.ts:300`의 취득가액 소스를 `redevActualAcquisitionPrice` → `fixedAcquisitionPrice`로 뒤집고 **전체 vitest**:

```
Test Files  1391 passed | 1 skipped (1392)
Tests       15586 passed | 13 skipped | 1 todo (15600)
```

⇒ **재개발·입주권 취득가액의 소스를 고정하는 테스트가 하나도 없다.** Phase 1(anchor 선작성)이 전제다.

### 2.4 🔴 D-C — 승계조합원 입주권 (R-11의 실체)

#### (1) 법령 — §166①은 **원조합원 전용**

> 소득세법 시행령 §166 ① … 조합원이 **당해 조합에 기존건물과 그 부수토지를 제공**(건물 또는 토지만을 제공한 경우를 포함한다)**하고 취득한** 입주자로 선정된 지위를 양도하는 경우 **그 조합원의** 양도차익은 …

승계조합원은 조합에 제공한 사실이 없다 ⇒ **적용 요건 미충족**. 양도차익은 §100①·§95①·§97①1호 가목 일반 원칙.

| 방증 | 내용 |
|---|---|
| **소득세법 §95②** (본문 실독) | LTHD 대상을 「조합원입주권(**조합원으로부터 취득한 것은 제외**한다)」로 한정 |
| **소득세법 §89①4호** (본문 실독) | 비과세 요건이 「관리처분계획 인가일 … 현재 제3호가목에 해당하는 기존주택을 **소유하는 세대**」 ⇒ **승계조합원은 §89①4호 비과세 불가** |
| **기준-2025-법규재산-0057** (법규과-1320, 2025-06-19 · taxlaw.nts.go.kr 본문 실독) | 입주권을 **매매로 승계취득**한 케이스의 취득가액 = 「종전주택 권리가액 + 취득 이후 납입한 **추가분담금** + (입증되는) **프리미엄**」. 인용 법령이 **§97·영 §163①뿐, §166 부재** |

#### (2) 현행 엔진 — `isSuccessorRightToMoveIn`은 LTHD만 끈다

소비처는 `redevelopment-lthd.ts:189`·`transfer-tax-lthd.ts:77` 뿐. **양도차익 산식 분기 없음**(grep 0건) ⇒ 승계 입주권도 §166① 3분할을 탄다.

**실측 (probe P-2)** — 인가 2018-10-23 · 권리가액 3억 · 2020-05-01 승계취득 3.5억(권리가액+프리미엄 5천만) · 추가분담금 9천만 · 2026-02-16 양도 5억.
법령상 정답: 양도차익 = 5억 − (3.5억+0.9억) = **60,000,000**.

| ⑤에 넣은 값 | 인가전 분 | 청산금 분 | 합계 | 총부담세액 |
|---|---|---|---|---|
| 350,000,000 (승계 매입가) | **−50,000,000** | 110,000,000 | 60,000,000 ✅ | 8,844,000 |
| 100,000,000 (⑤ 라벨대로 「종전 부동산 실거래가」) | 200,000,000 | 110,000,000 | **310,000,000** ❌ | **106,766,000** |

- **합계는 우연히 맞는다** — §166①1호 합계 `(R−A)+(T−R−C) = T−A−C`로 권리가액 R이 소거되기 때문. **총액만 보면 정상처럼 보인다.**
- 그러나 화면에 **「인가전 양도차익 −50,000,000」**이 뜬다(사용자 지적 지점).
- ⑤ 라벨(「인가 **전 종전 부동산**의 실거래가」)을 문자대로 따르면 **97,922,000원 과대과세**.

#### (3) 그리고 계산 자체가 차단된다

**실측 (probe P-3)** — `validateRedevelopmentAsset` 반환값:

| 케이스 | 결과 |
|---|---|
| ① 「조합원 유형」=승계조합원 + 취득일 > 인가일 | `인가일은 취득일 이후여야 합니다. … "승계조합원 모드"를 ON 하세요.` |
| 원조합원(취득일 < 인가일) | `null` |
| stale `redevIsSuccessorMember="yes"` | `승계조합원 모드 — 준공일을 입력하세요.` |

`transfer-tax-validate-redev.ts:155`가 `redevIsSuccessorMember`(완공APT 필드)만 보고 `isSuccessorRightToMoveIn`(① 기본정보)을 **읽지 않는다**. 그런데 안내가 가리키는 토글도, 준공일 입력칸도 **입주권 화면에서 숨겨져 있다**(`RedevelopmentBlock.tsx:175` · `RedevelopmentBlockCards.tsx:352-368` — #1245에서 완공APT 전용 분리).

⇒ **승계조합원 입주권은 현재 어느 경로로도 계산할 수 없다.**

#### (4) §89①4호 비과세 게이트에도 승계 가드가 없다

`applyOneRightExemption`(`transfer-tax-redevelopment.ts:542-560`)·`applySettlementExemption`(`:447-459`)의 트리거는 `exemptionEligibleAtApproval`(자기선언) + 세대 구성뿐 — **`isSuccessorRightToMoveIn`을 보지 않는다**. 승계조합원이 자기선언을 켜면 §89①4호 본문 괄호에 반해 전액 비과세가 적용된다.

### 2.5 🔴 D-B — 다건 경로에 `right_to_move_in` 가드 없음

`multi-transfer-tax-validate.ts:57`은 `redevelopment_apt`만 차단한다. 다건 화면은 단건 마법사를 임베드하고(`MultiTransferTaxCalculator.tsx:39`), 다건 변환(`multi-transfer-tax-api.ts:93-99`)은 §166 sub-object 없이 `fixedAcquisitionPrice`를 쓴다 ⇒ **지금은 조용한 오산, 상단 제거 후엔 「취득가액 0 + 입력칸 없음」으로 악화**. 우리 변경이 만드는 반대 방향 누수다.

---

## 3. R-11 설계 — 2안 비교와 채택

| | **안 A — §166 안에 승계 분기 신설** | **안 B — 일반 양도 경로 위임** ✅ 채택 |
|---|---|---|
| 엔진 | `runSuccessorRight` 신설(3분할 구조 재사용) | `isRedevelopmentActive`에서 승계 제외 → 기존 일반 경로 |
| 법령 정합 | §166 구조를 빌려 쓰므로 「인가전/인가후」 개념이 남는다 | §97①1호 = **일반 원칙 그대로** — 법문 구조와 1:1 |
| 결과 표시 | 3분할 표를 승계용으로 재해석해야 함 | 단일 차감 산식 — 재해석 불필요 |
| 신규 엔진 필드 | 필요 | **불필요**(취득가액에 합산) ⇒ ⑨⑩⑫⑭ 무변경 |
| LTHD | 새 분기에서 0 처리 재구현 | `transfer-tax-lthd.ts:77`이 **이미** 승계 입주권 배제 |
| 비과세 | 새 분기에서 §89①4호 차단 재구현 | 일반 경로에 §89①4호 자체가 없음 ⇒ **구조적으로 차단** |

**안 B 실측 (probe P-4)** — 같은 사례를 일반 경로로(취득가액 440,000,000 = 350,000,000 + 90,000,000):

| 케이스 | 양도차익 | LTHD | 산출세액 | 총부담세액 | `redevelopmentDetail` |
|---|---|---|---|---|---|
| 2020-05-01 취득(5년 9개월) | **60,000,000** ✅ | 0 ✅ | 8,040,000 | 8,844,000 | `null` ✅ |
| 2025-09-01 취득(1년 미만) | 60,000,000 | 0 | 40,250,000 (=57,500,000×70%) | 44,275,000 | `null` |
| 1세대 + 주택0 + 입주권1 | 60,000,000 | 0 | 8,040,000 | 8,844,000 | **`isExempt: false`** ✅ (§89①4호 미적용) |

⇒ **엔진 산식 신규 구현 없이** 정답이 나온다. 세액은 §166 경로와 같지만(항등식), **표시가 법령 개념과 일치**하고 비과세·LTHD가 구조적으로 올바르게 차단된다.

### 3.1 승계 입주권 입력 모델

| 항목 | 처리 |
|---|---|
| 취득가액 | **전용 카드 2칸** — ①「조합원입주권 승계취득가액」(권리가액 상당 + 프리미엄) ②「취득 후 납부한 추가분담금」. read-only 합계 미리보기. API가 합산해 `acquisitionPrice`로 전송 |
| 청산금 **수령** | ~~합계에서 차감(음수 방지 가드)~~ → **미지원으로 확정**(§8-A V-6). 기준-2025-법규재산-0057이 납부 사례만 다뤄 수령 시 차감 근거를 확보하지 못했다. 입력칸을 만들지 않고 hint에 명시 · 음수 입력은 ⑧ validate가 차단 · 근거 확보 시 R-13 |
| 산정 방식(환산·감정·매매사례) | **본 PR 미지원 — 실지거래가 전용.** 입주권의 §99①2호 기준시가(영 §165) 산정 경로가 없어 환산 분모·분자를 만들 수 없다. validate로 명시 차단 |
| §166 카드(④·⑤) | 승계 모드에서 **전체 숨김** (§166 미적용) |
| 상단 축 A | 승계·원조합원 **모두 숨김** — 전용 카드가 정본 |
| 관리처분 인가일 | 승계 모드에서도 유지(취득일 > 인가일 정합성 검증·표시용) |
| LTHD·세율·비과세 | 엔진 기존 동작 그대로(전부 검증 완료 — 위 표) |

---

## 4. 목표 (성공 기준)

| ID | 성공 기준 | 검증 |
|---|---|---|
| **S1** | 입주권(원조합원) 화면에 상단 「취득가액 산정 방식」·「취득가액」이 렌더되지 않는다 | E2E count 0 |
| **S2** | 같은 화면에 ④·⑤ 카드는 그대로 있다(과잉 숨김 방지) | E2E visible |
| **S3** | 완공APT 화면·계산 **무변경** | E2E 회귀 + 기존 vitest 전건 |
| **S4** | stale `isSalesCase`/`isAppraisal` + 입주권 → body `acquisitionPrice === ⑤값`, `acquisitionMethod === "actual"` | vitest anchor |
| **S5** | 승계 입주권 → body에 `redevelopment` **미포함**, `acquisitionPrice === 승계취득가 + 추가분담금` | vitest anchor |
| **S6** | 승계 입주권 엔진 결과: 양도차익 = 양도가액 − 합산취득가 − 필요경비 · LTHD 0 · `redevelopmentDetail == null` · `isExempt false` | vitest anchor |
| **S7** | 승계 입주권 화면: ④·⑤·상단 축 A 모두 없고 **전용 카드만** 있다 | E2E |
| **S8** | 승계 입주권이 **계산까지 도달한다**(현행은 validate 영구 차단) | E2E 계산 성공 |
| **S9** | 다건에서 입주권 → `validateMultiSupportedMode` 명시 차단 | vitest anchor |
| **S10** | `npm run check:pre-pr` 통과 · E2E known-failures 미증가(16건) | CI |

---

## 5. 작업 단계

> 순서: **anchor → 타입/엔진 게이트 → API → 정규화 → validate → UI → 다건 → E2E**.

### Phase 0 — 안전망 실측 ✅ 완료 (§2.3)

### Phase 1 — Pre-Do anchor (**현행에서 실패해야 한다**)

`__tests__/calc/transfer-right-acq-axis.test.ts` + `__tests__/tax-engine/transfer-tax/successor-right-to-move-in.test.ts`

| anchor | 내용 | 현행 |
|---|---|---|
| A-1 | 입주권(원조합원) + 실거래가 → `acquisitionPrice === redevActualAcquisitionPrice` | ✅ (회귀 고정 — §2.3 무방비 지점) |
| A-2 | 입주권 + stale `isSalesCaseAcquisition` → ⑤값 · `"actual"` · `similarSalesValue undefined` | ❌ 실패 |
| A-3 | 입주권 + stale `isAppraisalAcquisition` → 동상 | ❌ 실패 |
| A-4 | **승계** 입주권 → body `redevelopment === undefined` | ❌ 실패 |
| A-5 | **승계** 입주권 → `acquisitionPrice === 승계취득가 + 추가분담금` | ❌ 실패 |
| A-6 | **승계** 입주권 엔진 → `redevelopmentDetail == null` · 양도차익 60,000,000 · LTHD 0 | ❌ 실패(현행은 §166 3분할) |
| A-7 | **승계** 입주권 + `exemptionEligibleAtApproval=true` + 1세대·주택0·입주권1 → `isExempt === false` | ❌ 실패(현행 전액 비과세 — §2.4(4)) |
| A-8 | 완공APT + `isSalesCaseAcquisition` → 현행 유지(0/`salesCase`) | ✅ 트립와이어 |
| A-9 | 완공APT + `redevIsSuccessorMember="yes"` → `isSuccessorMember === true` 유지 | ✅ 트립와이어 |
| A-10 | 원조합원 입주권(사례 36 CORE) 세액 무변경 | ✅ 트립와이어 |

> verify: A-2~A-7 실패, A-1·A-8~A-10 통과. 그렇지 않으면 anchor가 잘못된 단계를 보고 있다.

### Phase 2 — 타입 + 엔진 게이트

1. `lib/tax-engine/redevelopment.ts:782` `isRedevelopmentActive`에 3번째 인자
   `isSuccessorRightToMoveIn?: boolean` 추가 — `propertyType === "right_to_move_in" && isSuccessorRightToMoveIn === true`면 **false**.
   호출부 `transfer-tax.ts:217`에 `effectiveInput.isSuccessorRightToMoveIn` 전달.
   ⚠️ 엔진 가드는 **직접 fixture 입력에 대한 안전망**이다. 정상 경로 차단은 Phase 3(API)이 진다 — 둘 다 둔다(#1246 패턴).
2. `AssetForm`에 신규 2필드 — `successorRightAcqPrice` · `successorRightAddedContribution`(둘 다 `string`).
   **엔진 타입은 무변경**(합산해 기존 `acquisitionPrice`로 보낸다) ⇒ ⑨⑩⑫⑭ 무변경.

> verify: A-6 통과.

### Phase 3 — API 레이어 (⑬)

1. `transfer-tax-api.ts:175-176` — `isRedevelopment`에서 **승계 입주권 제외** ⇒ `redevPayload` 미생성(A-4).
2. `:291-302` `acquisitionPrice` — 분기 순서를 바꿔 **`isRedevelopment`를 추계 3형보다 앞**에 두고,
   승계 입주권이면 `parseAmount(successorRightAcqPrice) + parseAmount(successorRightAddedContribution)`
   (청산금 수령 방향이면 차감 · `Math.max(0, …)` 가드) (A-5).
3. `:366-375` — `acquisitionMethod`·`appraisalValue`·`similarSalesValue`에 재개발·승계입주권 가드
   (`"actual"` / `undefined` / `undefined`).
   ⚠️ **`useEstimatedAcquisition`(:336-341)은 원조합원 입주권에서 건드리지 않는다** — ⑤ 라디오의 정본이다. 승계 입주권만 `false` 강제.

> verify: A-2~A-5 통과, A-8·A-9 계속 통과.

### Phase 4 — 저장값 정규화 (재수화 + 세션 내 전환)

1. `calc-wizard-asset-migrate.ts:575-578` 입주권 정규화 블록에 추가:
   `isAppraisalAcquisition = false` · `isSalesCaseAcquisition = false` · `redevIsSuccessorMember = ""`.
   > `redevIsSuccessorMember`는 v2에서 뺐다가 **v3에서 되살린다** — R-11이 승계 입주권의 정본 경로를 만들었으므로, 완공APT 전용 필드의 stale 값은 이제 순수 노이즈다(§2.4(3)의 dead-end도 함께 해소).
2. `AssetAreaRedevelopment.tsx:52-58` `redevSubjectPatchForAssetKind` — `right_to_move_in` 전환 시 같은 3필드 초기화.
   ⚠️ **단일 배치 patch**(`feedback_multikey_patch_stale_spread_overwrite`).
3. `AssetSectionBasic.tsx:296-300` 조합원 유형 토글 — 승계 ↔ 원조합원 전환 시 반대편 전용 필드를 비운다
   (승계→원조합원: `successorRight*` 2필드 / 원조합원→승계: `redevRightsValue`·`redevActualAcquisitionPrice`·`useEstimatedAcquisition`).

> verify: store 단위 테스트 — 전환 patch·migrate 결과.

### Phase 5 — validate (⑧)

1. `transfer-tax-validate-asset.ts:172` — 승계 입주권은 `validateRedevelopmentAsset`로 보내지 않고
   신규 `validateSuccessorRightAsset`로 분기.
2. 신규 `validateSuccessorRightAsset`:
   - 승계취득가액 > 0 필수
   - 추가분담금 ≥ 0 (미입력 = 0 허용)
   - 취득일 > 관리처분 인가일 (아니면 「원조합원 아닌가요」 안내)
   - 환산·감정·매매사례 모드 명시 차단 (「실지거래가 전용 — 후속 PR」)
   - 청산금 수령액이 승계취득가액을 초과하면 차단
3. `transfer-tax-validate-redev.ts:155`의 「승계조합원 모드를 ON 하세요」 안내를 **입주권에서 도달 불가**로 만든다(1의 분기로 자동 해소). 완공APT 문구는 유지.

> verify: S8(계산 도달) · 차단 메시지 anchor.

### Phase 6 — UI (⑤ 위젯)

1. `CompanionAcqPurchaseBlock.tsx:386` — 게이트에 `&& assetKind !== "right_to_move_in"` 추가.
2. `:367` 안내 카드를 3분기로:
   - 완공APT: 현행 유지(§166②1호)
   - 입주권·원조합원: 「아래 ⑤ 「인가전 분 종전 부동산 취득가액」에서 입력합니다」 + §166①1호·§166③ 링크
   - 입주권·승계조합원: 「§166①은 조합에 기존건물을 **제공한 조합원**에게 적용됩니다(승계조합원 미해당). 취득가액은 아래 승계취득 카드에서 §97①1호 가목으로 입력합니다」 + §97①1호·§95② 링크
3. `AssetSectionAcquisition.tsx:315` — 승계 입주권이면 `RedevelopmentBlock` 대신 신규
   `SuccessorRightAcquisitionBlock`(전용 카드 2칸 + 합계 미리보기 + 인가일)을 렌더.
4. `RedevelopmentBlock.tsx` — 승계 입주권 진입 자체가 없어지므로 내부 분기 추가 없음.
   (⑤ 게이트 `:371`의 `redevIsSuccessorMember` 조건은 Phase 4-1 정규화로 입주권에서 무해해진다.)
5. `transfer-per-asset-summary.ts:134-143` — 승계 입주권 분기 추가(합산값). **API :291-302와 같은 규칙**(dual-truth 방지).

> verify: S1·S2·S3·S7.

### Phase 7 — 다건 가드

`multi-transfer-tax-validate.ts:57`에 `right_to_move_in` 추가 —
「조합원입주권(시행령 §166① / 승계취득분 §97①1호)은 단건 계산기에서만 지원됩니다.」
`__tests__/lib/calc/multi-transfer-api-sync.test.ts:218` 케이스 테이블에 1건 추가.

> verify: S9.

### Phase 8 — E2E + 전체 검증

1. `e2e/right-to-move-in-asset-kind-axis.spec.ts` 확장:
   - **A-11**: 원조합원 입주권 — 상단 축 A 없음 + ④·⑤ 있음
   - **A-12**: 승계 입주권 — ④·⑤·상단 축 A 없음 + 전용 카드 있음
   - **A-13**: 승계 입주권 **계산 성공**(현행은 validate 영구 차단 — S8)
   - **A-14**: stale `redevIsSuccessorMember="yes"` 주입 → 정규화되어 원조합원 화면이 정상 렌더
2. `npm run check:pre-pr` + `npx playwright test e2e/right-to-move-in-asset-kind-axis.spec.ts` (워크트리는 `E2E_PORT` 필수).
3. **브라우저 수동 확인**: 원조합원·승계 각각 폼 → 계산 → 결과, Network 탭 `acquisitionPrice`·`redevelopment` 유무.

---

## 6. 14개 동기화 지점

**엔진 신규 필드 없음** — 신규 2필드는 클라이언트 전용이고 API에서 기존 `acquisitionPrice`로 합산된다.

| # | 지점 | 변경 |
|---|---|---|
| ① 폼 상태 | `AssetForm` + 2필드 | **변경** (Phase 2-2) |
| ② initial | `calc-wizard-asset-factory.ts` | **변경** |
| ③ normalize | `calc-wizard-asset-migrate.ts` | **변경** (Phase 4-1) |
| ④ API 변환 | `transfer-tax-api.ts` | **변경** (Phase 3) |
| ⑤ UI 위젯 | `CompanionAcqPurchaseBlock` · `AssetSectionAcquisition` · 신규 `SuccessorRightAcquisitionBlock` | **변경** (Phase 6) |
| ⑥ 사이드바 | `transfer-per-asset-summary.ts` | **변경** (Phase 6-5) |
| ⑦ 결과 카드 | 일반 양도 결과뷰가 그대로 처리(`redevelopmentDetail == null`) | 무변경 — **회귀 확인만** |
| ⑧ validation | 신규 `validateSuccessorRightAsset` + 분기 | **변경** (Phase 5) |
| ⑨⑩⑫ Zod | `lib/api/transfer-tax-*.ts` | **무변경** (전송 필드 집합 불변) |
| ⑪ / ⑭ route | `app/api/calc/transfer/**` | **무변경** |
| ⑬ body spread | `callTransferTaxAPI` | **변경** (Phase 3) |

---

## 7. 하지 않을 것 (명시)

1. **승계 입주권의 환산·감정·매매사례 취득가액 미지원** — validate로 명시 차단하고 후속 **R-12**로 남긴다.

   > 🔴 **2026-08-23 정정** — 종전에 여기 적혀 있던 「입주권의 §99①2호 기준시가(영 §165) 산정 경로가 **없다**」는
   > **사실이 아니다.** 영 §165①이 법 §99①2호 **가목**의 위임으로 「취득일·양도일까지 **납입한 금액 + 그 시점의
   > 프리미엄**」을 명문 규정하고, 환산 산식(영 §176의2②**2호**)도 「**부동산을 취득할 수 있는 권리**」를
   > 명시 대상으로 삼는다(조합원입주권 = 법 §94①2호 가목). 추계 순서는 영 §176의2③.
   > ⇒ 미지원의 사유는 「근거 없음」이 아니라 **「구현하지 않았음」**이다.
   > 원인: 영 §165의 **조 제목**(「토지ㆍ건물외의 자산의 기준시가 산정」)만 보고 주식 조문으로 넘겨짚었다.
   > 근거·설계: [`right-to-move-in-followups.plan.md`](right-to-move-in-followups.plan.md) §1.1

2. **원조합원 입주권에 감정·매매사례 미지원** — §166①은 「기존건물과 그 부수토지의 취득가액」을 요구하고, 확인 불가 시의 대체는 §166③ 환산으로 **법이 이미 정해 두었다**. → 후속 **R-9**.

   > ✅ **2026-08-23 종결 (근거 확정 · 코드 변경 없음)** — 종전에는 「§176의2③ 추계를 끼워 넣을 근거를
   > **확인하지 못했다**」였으나, 이제 **배제가 확인된다**. 결정적인 것은 같은 조 **§166④2호와의 대조**다:
   > ④2호는 「**제176조의2제3항제1호, 제2호 및 제4호의 방법을 순차로 적용**」이라고 **명시 인용**하는데
   > §166③에는 그 문구가 없고 **단일 산식으로 확정**한다. **입법자는 §176의2를 끌어올 때 명시한다.**
   > ⇒ §166③이 **전속**이다. ❌ **§166①·②의 취득가액에 §176의2③ 추계를 적용하자는 제안은 재제안 금지.**

3. **증여·상속·신축 취득원인 블록은 건드리지 않는다** — 완공APT와 동일한 기존 상태다. 상속은 살아 있는 경로다(`transfer-tax.ts:220-226` §163⑨ override) → 후속 **R-10**.

   > 📌 **2026-08-23 실체 규명** — 「중복 입력」이 아니라 **입력해도 엔진에 도달하지 않는 칸**이다.
   > `CompanionAcquisitionCauseSection`은 `AssetSectionAcquisition.tsx:172`에서 **assetKind 분기 없이**
   > 렌더되는데, 원조합원 입주권의 취득가액은 `transfer-tax-api.ts:317-332`가 **`redevActualAcquisitionPrice`만**
   > 쓴다 ⇒ 상속·증여 취득가액 칸에 입력해도 **세액이 바뀌지 않는다**.
   > §163⑨ 평가액 **자동 산정** 부재는 완공APT와 공통 구조라 **R-14**로 분리했다.
4. **완공APT 동작 변경 금지** — A-8·A-9·A-10이 트립와이어.
5. **`redevIsSuccessorMember`(완공APT 사례 48) 산식은 건드리지 않는다** — 이름이 비슷하지만 다른 축이다.
6. **다건 지원 확대 금지** — 명시 차단만 한다.

---

## 8. 사용자 확인 필요 (Do 진입 전)

| ID | 질문 | 기본 가정 |
|---|---|---|
| **Q-1** | 입주권(원조합원)에서 「감정가액·매매사례가액」 선택지가 사라지는 것이 맞는가? | **예** — 현재도 취득가액 0이라 고르면 과대과세. §166③ 환산이 법정 대체수단 |
| **Q-2** | 다건에서 입주권을 **명시 차단**으로 바꾸는 데 동의하는가? | **예** — 침묵 오산보다 명시 차단 |
| **Q-5** | 승계 취득가액을 **2칸(승계취득가 + 추가분담금)**으로 나눠 받는 것이 맞는가? 1칸(합산 직접 입력)도 가능하다 | **2칸** — 기준-2025-법규재산-0057의 취득가액 구성과 1:1이고, 합계 미리보기로 검산이 된다 |
| **Q-6** | 승계 입주권의 환산·감정·매매사례를 **이번에 미지원(차단)**으로 두어도 되는가? | **예** — 입주권 기준시가 산정 경로가 없어 근거 없이 숫자를 만들게 된다 |

---

## 8-A. 구현 결과 (2026-08-23 — Phase 0~8 완료)

### 변경 파일

| 계층 | 파일 | 내용 |
|---|---|---|
| 엔진 | `lib/tax-engine/redevelopment-dispatch.ts` **(신규)** | `isRedevelopmentActive`에 3번째 인자 `isSuccessorRightToMoveIn` — 승계 입주권을 §166 분기에서 제외. `redevelopment.ts`가 822줄이 되어 800줄 정책상 `buildLthdEmitLines`와 함께 분리(714줄로 착지, re-export로 기존 import 경로 보존) |
| 엔진 | `lib/tax-engine/transfer-tax.ts` | STEP 0.65 호출부에 플래그 전달 |
| 타입 | `lib/stores/calc-wizard-asset.ts` · `-factory.ts` | `successorRightAcqPrice` · `successorRightAddedContribution` 2필드(①②) |
| 공용 술어 | `lib/calc/transfer-successor-right.ts` **(신규)** | `isSuccessorRightTransfer` · `successorRightAcquisitionTotal` · `successorRightTogglePatch` — UI·API·validate·사이드바 단일 소스 |
| API ⑬ | `lib/calc/transfer-tax-api.ts` | 승계 입주권 `redevelopment` 미전송 · `acquisitionPrice` 합산 · 입주권에서 `isSalesCase`/`isAppraisal` 무력화 · 승계에서 `isEstimated` false |
| API | `lib/calc/transfer-tax-api-parcels.ts` **(신규)** | 위 변경으로 810줄이 되어 다필지 조립 블록 분리(703줄 착지, 로직 무변경) |
| 정규화 ③ | `lib/stores/calc-wizard-asset-migrate.ts` | 입주권 stale 3종(`isAppraisalAcquisition`·`isSalesCaseAcquisition`·`redevIsSuccessorMember`) 비움 + 신규 2필드 fallback |
| 정규화 | `components/calc/transfer/asset-sections/AssetAreaRedevelopment.tsx` | 세션 내 전환 patch에 같은 3필드 |
| validate ⑧ | `lib/calc/transfer-tax-validate-successor-right.ts` **(신규)** · `-validate-asset.ts` | 승계 전용 검증으로 분기(§166 검증 미진입) |
| UI ⑤ | `components/calc/transfer/CompanionAcqPurchaseBlock.tsx` | 상단 축 A 게이트에 `right_to_move_in` 추가 + 안내 카드 3분기(완공APT / 입주권·원조합원 / 입주권·승계) |
| UI ⑤ | `components/calc/transfer/SuccessorRightAcquisitionBlock.tsx` **(신규)** · `AssetSectionAcquisition.tsx` | 승계 전용 취득 카드(2칸 + 합계 미리보기 + LTHD 미적용 안내) |
| 사이드바 ⑥ | `lib/stores/transfer-per-asset-summary.ts` | 승계 분기를 §166 분기 **앞**에 추가(`directAcqRaw`) + `acqLabel` 술어 정정(브라우저 실측 결함 — 아래) |
| 다건 | `lib/calc/multi-transfer-tax-validate.ts` | `right_to_move_in` 명시 차단 |

### 계획 대비 바뀐 결정 2건

1. **추계 플래그를 「분기 순서 변경」이 아니라 「소스에서 무력화」로 처리했다.**
   계획 Phase 3-1은 `acquisitionPrice`의 분기 순서를 바꾸는 것이었는데, 그렇게 하면 **원조합원 환산 모드**에서도
   `acquisitionPrice`가 0 → `redevActualAcquisitionPrice`로 바뀐다(엔진은 환산 모드에서 이 값을 무시하므로 무해하지만
   body가 달라진다). 대신 `isSalesCase`·`isAppraisal` 정의 자체에 `!isRightToMoveIn`을 넣어 **원본 분기 순서를 보존**했다.
   완공APT는 손대지 않아 A-8 트립와이어가 그대로 산다.

2. **`redevIsSuccessorMember` 정규화를 되살렸다** (v2에서 뺐던 것). R-11이 승계 입주권의 정본 경로를 만들었으므로
   완공APT 전용 필드의 stale 값은 순수 노이즈가 됐고, §2.4(3)의 dead-end도 함께 해소된다.

3. **계획에 없던 파일 분리 2건이 발생했다.** 기능 변경으로 `redevelopment.ts`가 822줄(→ `redevelopment-dispatch.ts` 분리, 714줄 착지),
   `transfer-tax-api.ts`가 810줄(→ `transfer-tax-api-parcels.ts` 분리, 703줄 착지)이 됐다. 둘 다 800줄 정책의
   기회주의적 분리이며 **로직은 무변경**이다(re-export로 기존 import 경로 보존).

### 기존 anchor 1건 갱신

`case-redev-right-transfer-pay-lthd-split.test.ts` **[R-PAY-9]** — `redevelopmentDetail.preApproval.lthd === 0`을
단언했는데, 그 단언은 **승계조합원에게도 §166① 3분할이 성립한다**는 전제 위에 있었다. 「인가전 LTHD가 0」이 아니라
「**인가전 분 자체가 없다**」가 정확하므로 `redevelopmentDetail === undefined`로 바꾸고, 원래 취지(LTHD 0)는
[R-PAY-9b]가 그대로 지킨다. [R-PAY-9c](§97①1호 단순 차감)를 추가했다.

### 🔴 브라우저 수동 확인에서 추가로 잡힌 결함 — 사이드바 라벨 (2026-08-23)

Playwright로 실화면을 띄워 스크린샷·사이드바 텍스트·Network body를 직접 읽는 중에 발견했다.

**증상**: 승계조합원 화면인데 사이드바가 **「인가전 분 취득가액 370,000,000」**으로 표시했다.
입력 카드는 「승계취득가액 + 추가분담금」이라고 하는데 사이드바는 「인가전 분」이라고 해서
**같은 숫자에 서로 다른 개념이 붙었다**. 승계자는 종전 부동산을 소유한 적이 없어 「인가 전 분」이
성립하지 않는다.

**원인**: `lib/stores/transfer-per-asset-summary.ts:495` `acqLabel` 분기가 **완공APT 승계조합원**
(`redevIsSuccessorMember`)만 예외로 두고 **입주권 승계**(`isSuccessorRightToMoveIn`)를 빠뜨렸다.
주석에는 이미 「승계조합원은 종전주택을 소유하지 않아 「인가 전 분」이 성립하지 않는다」고
적혀 있었다 — **개념은 맞게 써 두고 축이 하나 늘어난 것을 반영하지 못한** 경우다.

**왜 값(⑥ `acqPrice`)은 맞았는데 라벨만 틀렸나**: Phase 6에서 `directAcqRaw`에는 승계 분기를
추가했지만(§166 분기 **앞**), 같은 파일의 `acqLabel` 삼항은 손대지 않았다. **한 필드의 값과
라벨이 서로 다른 술어를 보고 있었다.**

**수정**: `acqLabel` 조건에 `!isSuccessorRightTransfer(a)` 추가 → 「취득가액」.
회귀 anchor 2건 추가(승계 = 「취득가액」/370,000,000 · 원조합원 = 「인가전 분 취득가액」/180,000,000).
브라우저 재확인으로 「취득가액 370,000,000」 표시 확인.

> 🔑 **교훈 — E2E가 봐야 할 곳을 안 보고 있었다.** 본 PR의 E2E(A-9~A-13)는 폼 카드 노출과
> API body·엔진 결과만 단언했고 **사이드바 텍스트는 아무도 보지 않았다**. 값이 맞으면 라벨도
> 맞을 것이라는 암묵 가정이 있었는데, 값과 라벨의 술어가 갈릴 수 있다는 것이 이 결함이다.
> 표시 계층에 분기를 추가할 때는 **같은 필드의 값·라벨·단위가 모두 같은 술어를 쓰는지** 확인할 것.

### 검증 실측

| 항목 | 결과 |
|---|---|
| 신규 anchor | API ⑬ 10건 · 엔진 9건 · 정규화 12건(사이드바 라벨 2건 포함) · validate 7건 = **38건** |
| 전체 vitest | **1,395 파일 15,627건 통과** (착수 전 15,586 → +41) |
| `npm run check:pre-pr` | typecheck 0 · lint **0 errors**(305 pre-existing warnings) · test 전건 통과 |
| E2E | `right-to-move-in-asset-kind-axis.spec.ts` **13건 통과**(A-1~A-8 기존 + A-9~A-13 신규) |
| **브라우저 수동 확인** | 4화면 실측 — 아래 표. throwaway probe spec·스크린샷은 확인 후 삭제 |
| 성공 기준 | S1~S10 전건 충족 |

#### 브라우저 4화면 실측

| 화면 | 확인 내용 |
|---|---|
| **① 입주권 원조합원** | 상단 축 A 부재 ✅ · 「취득가액 — 재개발 §166①1호 인가전 분에서 차감」 안내 ✅ · ④ 재개발 일정·금액(시행령 §166①) ✅ · ⑤ 인가전 분 종전 부동산 취득가액(실지거래가액·환산취득가액 라디오) ✅ · 사이드바 「인가전 분 취득가액 180,000,000」 ✅ |
| **② 입주권 승계조합원** | 조합원 유형=승계조합원 ✅ · 「취득가액 — 승계취득 §97①1호 가목」 안내 ✅ · ① 승계취득 정보(인가일·승계취득가액 350,000,000·추가분담금 20,000,000) ✅ · 미리보기 「= 370,000,000」 ✅ · 「장기보유특별공제 미적용」 카드 ✅ · §166 카드 전체 부재 ✅ · 사이드바 라벨 🔴→✅(위 결함) |
| **③ 계산 결과** | 신고서 양식 양도가액 420,000,000 · 취득가액 370,000,000 · 전체 양도차익 **50,000,000** ✅ · 장기보유특별공제 **0**(「승계취득 조합원입주권은 §95②로 배제」 명시) ✅ · 과세표준 47,500,000 → 산출세액 5,865,000 → 총 납부세액 **6,451,500** ✅ · §166 3분할 표 부재(일반 양도 결과뷰) ✅ **⇒ V-4 해소** |
| **④ 완공APT** | 「§166②1호 자동 산정」 안내 · ②-a 조합원 구분 · ⑥ 거주개월 분리 입력 전부 유지 ✅ **무변경** |

#### Network request body 실측 (승계조합원)

```json
{ "propertyType": "right_to_move_in",
  "transferPrice": 420000000,
  "acquisitionPrice": 370000000,      // 350,000,000 + 20,000,000
  "acquisitionMethod": "actual",
  "useEstimatedAcquisition": false,
  "isSuccessorRightToMoveIn": true,
  "hasRedevelopment": false,           // §166 페이로드 미전송
  "appraisalValue": undefined, "similarSalesValue": undefined }
```

### V 항목 종결

| ID | 결과 |
|---|---|
| **V-1** | ✅ 세대 3주택 + 조정대상지역에서도 §104⑦ 중과 미적용 — 입주권은 주택이 아니다 (anchor) |
| **V-2** | ✅ 1년 미만 > 1~2년 > 2년 이상 순으로 세율 적용 확인 (anchor) |
| **V-3** | ✅ 1세대1주택 구성에서도 `isExempt === false` — §89①3호 오적용 없음 (anchor) |
| **V-4** | ✅ `redevelopmentDetail == null` 경로가 결과 화면에 정상 렌더 (E2E A-13) |
| **V-5** | ✅ 결과뷰·신고서식은 `acquisitionMethod`를 표시에 쓰지 않는다 — 부담부증여 카드의 `acquisitionMethodUsed`는 별개 필드(grep 실측) ⇒ 표시 영향 없음 |
| **V-6** | ⚠️ **승계 후 청산금 수령 케이스는 미지원**으로 확정. 기준-2025-법규재산-0057은 납부 사례만 다루고 수령 사례의 취득가액 차감 근거를 확보하지 못했다. 입력칸을 만들지 않고 hint에 명시("청산금을 수령한 경우는 현재 지원하지 않습니다") — 음수 입력은 ⑧ validate가 차단한다. 근거 확보 시 **R-13**으로 착수<br><br>🔴 **2026-08-23 정정 — 논점 자체가 달랐다.** 국세청 사전답변 **`사전-2023-법규재산-0450`**(생산 2024-06-27)이 정면으로 다룬다: 「승계조합원이 **이전고시가 있은 후에** 조합으로부터 지급받은 **청산금 상당액은 양도소득세 과세대상**이며, 양도시기는 **소유권 이전고시가 있은 날의 다음날**이고 **§105**에 따라 신고」. 관련 법령이 **§88·§98·§105**이지 **§97이 아니다** ⇒ **취득가액 차감이 아니라 별도의 양도 사건**이다. 따라서 hint의 「지원하지 않습니다」는 **사용자가 신고 의무 자체를 모르게 만든다** — 「**별도의 양도로 신고해야 합니다**」로 정정 필요(후속 계획서 §5). ⚠️ 이전고시 **전** 수령·수령권 승계 시나리오는 **확인하지 못했다**(「없다」가 아니다) |
| **V-7** | ✅ E2E stale 주입이 마이그레이션을 거치는 것 확인 (A-12) |

### 남은 후속 항목

> 🔄 **2026-08-23 전건 재조사 완료** — 상세·Phase·기각안은
> [`right-to-move-in-followups.plan.md`](right-to-move-in-followups.plan.md)로 이관했다.
> **4건 중 2건(R-12·R-13)의 전제가 틀렸고, 1건(R-9)은 근거가 확정되어 종결됐다.**

| ID | 내용 | 2026-08-23 재조사 |
|---|---|---|
| **R-9** | 원조합원 입주권의 감정가액·매매사례가액 | ✅ **종결** — §166④2호가 §176의2③을 **명시 인용**하는데 §166③엔 없다 ⇒ §166③ **전속**. 코드 변경 없음. ❌재제안 금지 |
| **R-10** | 취득원인 블록의 **도달하지 않는 입력** | ✅ **종결(2026-08-23)** — 방향이 **반대**였다: 무시되는 것은 ⑤ `redevActualAcquisitionPrice`이고 그것이 **법령상 옳다**. ~~칸 숨김~~ 폐기(유일 입력 경로 제거) → 증여 안내문 정정 + ⑤ 우선순위 안내로 해소. (b)§163⑨ 자동산정은 **R-14** |
| **R-12** | 승계 입주권의 환산·감정·매매사례 | 🔴 **전제 정정** — 「경로 부재」가 아니라 **영 §165①·§176의2②2호에 명문 존재**. 안 A/B/C 결정 필요(기본: **B**) |
| **R-13** | 승계 후 청산금 **수령** (V-6) | 🔴 **논점 정정** — 취득가액 차감이 아니라 **별도 양도 사건**(`사전-2023-법규재산-0450`). 최소 조치는 **안내문 정정** |
| **R-14** | ~~입주권·완공APT의 §163⑨ 평가액 **자동 산정**~~ | ✅ **종결(2026-08-23) — 실체 없음.** UI 실측: 입주권·완공APT가 `housing`과 **동일한** 자동 산정 UI를 받는다(`CompanionAcquisitionCauseSection`이 assetKind 분기 없이 렌더). 서술은 R-10 초기 오진에서 **파생**된 것이었고 §3.2-a가 이미 그 오진을 정정했다. 조사 중 드러난 실재 계약(§163⑨ payload는 항상 `reportedValue`를 싣는다 ⇒ `legacyFallback` 도달 불가)만 anchor로 고정. ❌재제안 금지 |
| **R-15** | ~~`transfer-tax.ts:229-235` §166 분기 override의 안전망 0건~~ | ✅ **종결(2026-08-24) — 「죽은 코드」가 아니라 「해로운 코드」였다.** override 없을 때는 **완전한 no-op**(코드 분석으로 증명 — `resolveInheritedRedevelopmentAcqPrice`는 STEP 0.45가 넣은 값과 항상 같다). 그러나 `options.acquisitionOverride`가 있으면 그것을 **되돌린다** — 실제 발동 경로는 **가업상속공제 §97의2④**(재귀 호출)이고, 의제세액 **76,045,071원 과대**였다(⑤ UI가 assetKind 분기 없이 렌더돼 **도달 가능**). ⇒ override 가드 추가 + anchor 5건. 가설이었던 「pre-deemed + ③환산 채택 + ①② 확인값」은 **코드상 불가능**(`selectedMethod === "converted"`는 `clauseA === 0`일 때만) |

---

## 9. 미검증 항목 (Do 중 확인)

| ID | 항목 | 확인 방법 |
|---|---|---|
| **V-1** | 승계 입주권 + **다주택 중과 §104⑦** — 입주권은 주택이 아니므로 미적용이어야 한다 | probe: 세대 3주택 + 승계 입주권 양도 → `multiHouseSurchargeResult` 미적용 확인 |
| **V-2** | 승계 입주권 **1~2년 보유 세율 60%**(§104①4호 나목) | anchor 추가 후 실측 |
| **V-3** | 일반 경로에서 `propertyType="right_to_move_in"`에 §89①3호(주택 비과세)가 오적용될 여지 | `isOneHousehold=true` + `householdHousingCount=1` 조합 probe |
| **V-4** | 결과뷰가 `redevelopmentDetail == null` + `propertyType="right_to_move_in"`을 정상 렌더하는지(4개 결과뷰 전부 — `feedback_transfer_result_view_is_not_one`) | 브라우저 수동 + E2E |
| **V-5** | Phase 3-3에서 `acquisitionMethod`를 바꿀 때 신고서식·결과뷰 표시가 달라지는지 | `grep acquisitionMethod` 결과뷰/신고서 → 실측 |
| **V-6** | 승계 후 **청산금 수령** 케이스의 취득가액 차감 처리 근거(기준-2025는 납부 사례만) | 추가 예규 탐색 · 미확보 시 「수령 케이스 미지원(차단)」으로 축소 |
| **V-7** | E2E stale 주입(sessionStorage)이 마이그레이션을 실제로 거치는지 | #1246 A-5 패턴 재사용 |
