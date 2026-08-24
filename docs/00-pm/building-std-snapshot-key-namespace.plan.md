# 건물기준시가 스냅샷 키 네임스페이스 — 배치↔단일시점 공유(B-6) · 접두 겹침 삭제(B-7)

- 작성일: 2026-08-24
- 유입: PR #1270 코드 리뷰 M-2가 드러낸 구조 문제(B-6) + **착수 조사 중 실측한 신규 결함(B-7)**
- 선행: #1267·#1268·#1269·#1270 (재개발·감면 PHD 스냅샷 계열)

---

## 0. 두 문제는 같은 뿌리다

스냅샷 키가 `bsp-{id}-{용도}-{시점}` 하나의 평면 네임스페이스인데, **서로 다른 생산자**가
같은 이름을 쓰거나 접두를 삼킨다.

| # | 문제 | 증상 | 확인 |
|---|---|---|---|
| **B-6** ✅ | 배치 모달과 단일시점 모달이 **같은 키**를 쓴다 | 배치로 계산한 뒤 단일시점 모달을 열면 빈 폼(정정 불가) | 코드 실측 |
| **B-7** ✅ | `replaceSnapshotsByPrefix("…-gb")`가 **`-gb-ext-*`까지 지운다** | GB 본체 배치를 돌리면 **증축분 계산서가 사라진다** | 🔴 probe 실측 |

---

## B-7. 접두 겹침 삭제 🔴 (신규 — probe 실측)

### 재현

```
before: bsp-a1-gb-acq · bsp-a1-gb-ext-acq · bsp-a1-gb-ext-transfer · bsp-a1-cb-acq
replaceSnapshotsByPrefix("bsp-a1-gb", { bsp-a1-gb-acq, bsp-a1-gb-transfer })
after : bsp-a1-cb-acq · bsp-a1-gb-acq · bsp-a1-gb-transfer
        ^^^^^^^^^^^^^^^^^^^ gb-ext 2건이 사라졌다
```

`building-std-snapshot-store.ts:36`의 필터가 `k.startsWith(`${prefix}-`)`이고,
`bsp-a1-gb-ext-acq`는 `bsp-a1-gb-`로 **시작한다**.

### 영향

`GeneralBuildingBlock.tsx:541`의 배치(`snapshotPrefix={bsp-${assetId}-gb}`)를 실행하면
`GeneralBuildingExtensionSection.tsx:294`가 저장한 증축분(건물2) 스냅샷이 삭제된다.
증축분 계산서는 `snapshotKindLabel`이 「증축분(건물2)」으로 구별해 주던 별도 서식이다 —
**조용히 사라진다**(엔진·세액은 무관, 계산서 표시만).

접두 겹침을 실측 전수한 결과 **`gb` → `gb-ext` 한 쌍**이다:
`cb` vs `cbinh`는 `cb-`/`cbinh-`로 갈려 안전하고, `phd`·`gb-ext`·`split`·`mx`는 겹치지 않는다.
다만 **규약이 늘면 재발한다** — `red`/`redev`도 `-red-phd`/`-redev-phd`로 이미 아슬아슬하다
(접미 `$` 앵커 덕에 지금은 안전).

### 설계 후보

| | 방식 | 장점 | 단점 |
|---|---|---|---|
| **A** | `replaceSnapshotsByPrefix`에 **제외 접두** 인자 추가 | 최소 변경 | 호출부가 겹침을 알아야 한다 — 지식이 흩어진다 |
| **B (권장)** | 삭제 대상을 **접두가 아니라 「배치가 방금 만든 키 집합 + 같은 배치가 만들 수 있었던 키 집합」**으로 한정 | 겹침 개념 자체가 사라진다 | 「만들 수 있었던 키」 열거가 필요 |
| **C** | 키에 구분자를 넣어 `gb`와 `gb-ext`를 형제가 아닌 다른 네임스페이스로 | 근본적 | 저장분 호환·정규식 3곳 재작업 |

**B 권장**: `phdBatchToSnapshots`가 만드는 키 형태는 `${prefix}-{acq|first|transfer}(-commercial)?`로
**닫혀 있다**. 그 6종만 지우면 접두 겹침이 원천 차단된다. `-ext`처럼 세그먼트가 더 붙은 키는
애초에 그 집합에 없다.

### 구현 — ✅ 완료 (2026-08-24, 권고안 B 채택)

- `batchSnapshotKeys(prefix)` 신설(`phd-batch-snapshots.ts`) — 배치가 만들 수 있는 **6종**
  (`{acq|first|transfer}` × `(-commercial)?`). `phdBatchToSnapshots`의 `snapKey` 조립과 같은 규칙.
- store API를 `replaceSnapshotsByPrefix(prefix, …)` → **`replaceBatchSnapshots(removeKeys, …)`**
  로 교체. 키 지식은 `lib/calc`에 두고 store는 순수 데이터 조작만 한다.
- 호출부(`MultiPointBuildingStdPriceModal.tsx:323`) 배선.

### 🔑 규칙을 **복제한 테스트**가 회귀를 못 잡고 있었다

`building-std-snapshot-keys.test.ts`의 「B1 — 삭제 범위」가 `!key.startsWith("bsp-a1-phd-")`로
규칙을 **베껴** 두고 있었다. 삭제 규칙이 접두 매칭에서 키 집합으로 바뀌어도 **그대로 통과**한다.
⇒ 실제 함수(`batchSnapshotKeys`)를 쓰도록 고쳤다. 규칙 복제는 안전망이 아니다.

주석 2곳(`building-std-snapshot-keys.ts` 헤더 · `MixedUseAssetMajorStdPrice.tsx:118`)도 갱신했다 —
구 API 이름과 「접두 삭제」 전제를 그대로 두면 다음 독자를 오도한다.

### 검증 — ✅ 완료

- 🔴 `gb` 배치가 `gb-ext` 스냅샷을 **보존**한다(probe → anchor 승격)
- 배치 재실행 시 **자기 시점 축소**는 그대로 정리된다(3시점 → 2시점) — 원래 목적 보존
- 상가 접미(`-commercial`)는 자기 집합이라 정리 · `cb`↔`cbinh` 비겹침 · 다른 자산 키 불변
- `batchSnapshotKeys`가 `-ext` 세그먼트 키를 **집합에 담지 않는다**는 것 자체를 anchor로 고정
- mutation probe 2종(키 집합 무력화 · 접두 매칭으로 회귀) → 각각 4건·1건 실패

### 리뷰 Low 2건 추가 반영

- **JSDoc 고아화**: `batchSnapshotKeys`를 삽입하면서 `phdBatchToSnapshots`의 기존 doc 블록을
  가로챘다 — 원 함수가 문서 없이 남고, 떠 있는 블록은 엉뚱한 함수를 설명했다. 제자리로 돌렸다.
- **규칙 복제**: `["acq","first","transfer"]`를 하드코딩해 `KEYWORD` 맵과 중복시켰다.
  **이 PR이 테스트 주석으로 지적한 바로 그 실패 모드를 구현 쪽에서 저지른 것**이다.
  `KEYWORD`를 모듈 스코프로 올려 생성·삭제 두 경로가 공유하게 했다 — `Record<PointKey, …>`라
  시점이 늘면 컴파일 에러로 잡힌다.
- 회귀: vitest **전체 16,240건** · 배치 E2E **18건** · tsc 0 · lint 0 errors

### 정합 작업 — ✅ 이 PR에서 처리

**정정**: 초판은 `building-std-snapshot-applicability.ts`가 「PR #1270에 있어 이 브랜치에 없다」고
적었으나 **틀렸다** — 그 파일은 #1268(`50c7f8dc`)로 **이미 master에 있다**(#1270은 케이스를
추가했을 뿐). 그대로 뒀다면 존재하지 않는 함수 이름을 가리키는 주석을 안고 머지될 뻔했다.
⇒ 이 PR에서 `replaceBatchSnapshots`로 갱신했다.

남은 2곳(`building-std-snapshot-store.ts:24` · `phd-batch-snapshots.ts:144`)은
「**종전에는** ~였다」는 역사 기술이라 그대로 둔다.

---

## B-6. 배치와 단일시점 모달이 같은 키를 공유한다

### 실측 — 충돌 키 5개

| 키 | 단일시점 모달 | 배치 prefix |
|---|---|---|
| `bsp-{id}-gb-acq` | `GeneralBuildingBlock.tsx:576` | `bsp-{id}-gb` |
| `bsp-{id}-gb-transfer` | `GeneralBuildingBlock.tsx:633` | `bsp-{id}-gb` |
| `bsp-{id}-cb-acq` | `CommercialBuildingBlock.tsx:412` | `bsp-{id}-cb` |
| `bsp-{id}-cb-transfer` | `CommercialBuildingBlock.tsx:442` | `bsp-{id}-cb` |
| `bsp-{id}-gb-ext-transfer` | `GeneralBuildingExtensionSection.tsx:294` | `bsp-{id}-gb-ext` |

배치 전용(충돌 없음): `-cb-first` · `-phd-{acq|first|transfer}`.

### 두 생산자가 담는 것이 다르다

- **단일시점 모달** — `taxType: "transfer"`, `acq*`/`trans*` 트랙. 재오픈 시 **정정용 복원 소스**
- **배치** — `taxType: "inheritance_gift"`(valuation 1시점), `val*` 트랙.
  **계산서 재구성 전용**이다. 3시점을 transfer 폼(2시점)에 담을 수 없어 시점마다 1시점
  평가 스냅샷으로 재현한다(`phd-batch-snapshots.ts:147` 주석) — **구조적 이유가 있다**.

### ⚠️ 지금 상태 — **머지 여부에 따라 갈린다** (2026-08-24 리뷰 정정)

**정정**: 초판은 「PR #1270 M-2 수정 이후 오작동은 없다」고 단정했으나, **#1270은 아직
머지되지 않았다**. 그 전제 위에서 B-6을 후순위로 미룬 것은 **거짓 안전 주장**이었다.

| 시점 | 동작 |
|---|---|
| **#1270 머지 전 (현재 master)** | 🔴 `BuildingStdPriceForm`이 `initialForm`을 `lockedTaxType` **뒤에** 펼쳐 복원된 `taxType`이 이긴다. GB 배치(`GeneralBuildingBlock.tsx:541`)가 `bsp-{id}-gb-acq`에 valuation 스냅샷을 쓴 뒤 「취득시 건물 기준시가 계산」(`:576`, `lockedTaxType="transfer"`, **같은 키**)을 열면 **상증 평가 모드로 렌더되고 세목 라디오는 숨겨져** 양도 트랙으로 되돌릴 수 없다. 적용하면 valuation 트랙 값이 transfer 필드로 들어간다 |
| **#1270 머지 후** | 세목이 어긋나는 복원분을 버리므로 오작동은 없다(빈 폼 + 올바른 모드). 다만 **정정 경로가 끊긴다** — 배치 직후 단일시점 모달이 빈 폼이라 「방금 계산했는데 왜 비어 있지」가 된다 |

⇒ **#1270 머지가 B-6의 실질적 선행 조건**이다. 머지 전에는 위 표의 첫 행이 실제 버그이므로,
#1270이 지연되면 B-6을 앞당겨야 한다.

### 설계 후보

| | 방식 | 평가 |
|---|---|---|
| **A** | 키 분리(`…-gb-batch-acq` vs `…-gb-acq`) | 계산서가 **두 소스**를 보게 되어 같은 시점이 2장 나올 수 있다 — 중복 제거 규칙이 새로 필요 |
| **B (권장)** | 스냅샷에 **생산자 표식**(`origin: "batch" \| "single"`)을 넣고, 복원은 `origin` 일치 시에만 | 현재 M-2가 `taxType`으로 **암묵적으로** 하는 판정을 명시화. 계산서는 지금처럼 한 소스만 본다 |
| **C** | 배치를 transfer 모드로 재구성 | ⛔ **기각** — 3시점을 2시점 폼에 담을 수 없다는 구조적 제약이 그대로다 |

**B 권장** 근거: M-2에서 이미 「세목이 다르면 복원하지 않는다」로 동작을 정했다.
`taxType`은 **세목**이지 생산자가 아니므로 그 판정은 우연히 맞는 것에 가깝다 —
배치가 transfer 모드를 쓰게 되는 날 조용히 깨진다. 표식을 명시하면 의도가 코드에 남는다.

추가로, 배치 직후 단일시점 모달이 빈 폼이 되는 것은 **안내 문구**로 처리한다
(「이 시점은 일괄 계산으로 산출됐습니다 — 정정하려면 일괄 계산을 다시 실행하세요」).
정정 경로를 만들려면 val*→acq* 변환이 필요한데 그건 C의 제약과 같은 벽이다.

### 구현 — ✅ 완료 (2026-08-24, 권고안 B 채택)

- `BuildingStdPriceFormState.origin?: "batch" | "single"` 추가. **표시·엔진 무관**
  (`toEngineInput`이 필드를 명시 선택하므로 엔진에 새지 않는다 — U-2 실측).
- 배치(`phdBatchToSnapshots`)가 만드는 **모든** 스냅샷에 `origin: "batch"`.
- 모달 저장은 `origin: "single"`을 **명시 주입**한다 — 복원분의 origin이 섞여 들어오면
  단일시점 저장분이 batch로 둔갑한다.
- 복원 판정을 `isRestorableSnapshot(restored, lockedTaxType)` 단일 소스로 뽑았다.
  **두 조건은 다른 위험을 막는다**: `origin === "batch"`(필드 트랙 상이) ·
  `taxType` 불일치(세목 라디오 시절 저장분). 구버전(`origin` 없음)은 후자만 적용한다.
- 배치 산출 시점을 열면 **이유를 밝히는 안내**를 띄운다(`bsp-batch-computed-notice`) —
  종전에는 빈 폼만 보여 「방금 계산했는데 왜 비어 있지」였다.

> ⚠️ 판정은 **복원분에만** 건다. 호출부 `prefill`은 항상 살린다 — 그것까지 버리면 모달이
> 통째로 비고 `singleTimePoint`(호출부 계약)도 함께 날아간다(#1270 M-3에서 겪은 실패).

### 검증 — ✅ 완료

- 배치 스냅샷 전수에 `origin: "batch"` · initial은 `"single"`
- 복원 판정 6케이스(같은 생산자·배치·세목 불일치·구버전·독립 페이지·부재)
- UI: 배치 스냅샷은 **얹히지 않고** prefill은 살아 있으며 **안내가 뜬다** / 단일시점은 복원되고 안내 없음
- **mutation probe 4종** — origin 판정 무력화(3건 실패) · 배치 표식 제거(1건) ·
  **≤2000 분기 표식 제거**(1건) · 구버전 키 보정 무력화(1건) · 폼 2선 방어 약화(1건)
- 회귀: vitest **전체 16,301건** · 모달·배치 E2E **40건** · tsc 0 · lint 0 errors

### 🔴 코드 리뷰 — Medium 1 + Low 3 (전부 반영)

**M-1. `origin: "batch"` 표식 중 ≤2000 분기에 테스트가 하나도 없었다.**
리뷰어가 그 태그를 지우고 **1,733건 전건 통과**를 실측했다. 하필 그 분기가 가장 위험하다 —
`buildTransferAcqSnapshot`은 **`taxType: "transfer"`** 를 내므로 #1270의 taxType 가드가
**막지 못하는 유일한 배치 출력**이다(valuation 모드는 이미 막혔다). 게다가 `transferYear`가
**2001 더미**라, 복원되면 「양도시 적용」이 더미 데이터로 계산한 값을 폼에 밀어넣는다
(`MixedUseLegacyStdPrice.tsx:193`은 2시점 모달이라 그 버튼이 뜬다).
⇒ pre-2001 anchor 추가 + mutation으로 구별력 실측.

**M-2(Low). 주석과 안내 문구가 사실과 달랐다.** 「valuation 1시점이라 `val*`만 채워져 있다」고
썼는데 배치 출력의 절반은 transfer 모드로 트랙이 **같다**. 진짜 이유는 더미 시점이다.
이 설명을 믿은 유지보수자가 「transfer 배치는 트랙이 같으니 복원해도 된다」로 가드를 좁히면
위 오입력 경로가 다시 열린다 ⇒ docstring·안내 문구를 정정했다.

**M-3(Low). 폼의 2선 방어가 1선보다 약했다.** `BuildingStdPriceForm`의 이중 방어 가드가
`taxType`만 보고 있어 `taxType: "transfer"`인 배치 스냅샷을 통과시켰다 ⇒ 같은 술어로 통일,
anchor + mutation 확인.

**M-4(Low). 이력 재수화분은 `origin`이 없다.** 배치 전용 키(`-phd-*`·`-cb-first` —
`phdTimepointLabel`이 식별)는 **키로 생산자를 알 수 있으므로** 배치로 취급한다.
단일시점 모달과 **공유하는 키**(`-gb-acq` 등)는 키로 못 가르므로 종전대로 복원한다(과잉 차단 방지).

> 안내 문구는 원인을 단정하지 않고 둘 다 예시로 든다(`bsp-restore-skipped-notice`) —
> 판정 이유를 UI가 다시 계산하면 `isRestorableSnapshot`과 갈릴 수 있다.

### 남긴 것

정정 경로 자체(배치 값을 이 폼에서 고치기)는 만들지 않았다 — `val*` → `acq*` 변환이 필요한데
그건 「3시점을 2시점 폼에 담을 수 없다」는 **구조적 제약**과 같은 벽이다(안 C 기각 사유).
안내로 「일괄 계산을 다시 실행하라」고 경로를 제시하는 선에서 멈춘다.

---

## 범위 밖

- 계산서 렌더·PDF 재유도 로직 자체 — 이번엔 키 생성·삭제만 다룬다
- `-red{조문}-phd`·`-redev-phd`(PR #1270에서 정리 완료)

## 작업 순서

1. **B-7 먼저** — 실측된 데이터 손실이고 수정 범위가 좁다(스토어 1개 함수 + anchor)
2. **B-6** — B-7로 삭제 규칙이 정리된 뒤 생산자 표식을 얹는다

## 미확인 (착수 시 실측)

- **U-1**: `ThreePointAssetMajorRender.tsx:122`·`ThreePointStandardPriceInput.tsx:274`가 넘기는
  `snapshotPrefix`(변수)의 실제 값 — 겹침 후보인지 확인 필요.
- **U-2**: `origin` 필드 추가가 `BuildingStdPriceFormState` 타입을 쓰는 다른 소비처
  (엔진 입력 변환·PDF 재유도)에 영향하는지.
