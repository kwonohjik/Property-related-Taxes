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
| **B-6** | 배치 모달과 단일시점 모달이 **같은 키**를 쓴다 | 배치로 계산한 뒤 단일시점 모달을 열면 빈 폼(정정 불가) | 코드 실측 |
| **B-7** | `replaceSnapshotsByPrefix("…-gb")`가 **`-gb-ext-*`까지 지운다** | GB 본체 배치를 돌리면 **증축분 계산서가 사라진다** | 🔴 probe 실측 |

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

### 검증

- probe를 anchor로 승격 — `gb` 배치가 `gb-ext` 스냅샷을 **보존**한다
- 배치 재실행 시 **자기 시점 축소**는 여전히 정리된다(3시점 → 2시점 시 남은 1건 삭제).
  이것이 `replaceSnapshotsByPrefix`의 원래 목적이므로 회귀시키면 안 된다
  (`MultiPointBuildingStdPriceModal.tsx:323` 주석의 「부분 제거·시점 축소로 생긴 stale 계산서 방지」)
- `cb`↔`cbinh` 비겹침 회귀

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

### 지금 상태 (PR #1270 M-2 수정 이후)

세목이 어긋나는 복원분은 버리므로 **오작동은 없다**(빈 폼 + 올바른 모드).
다만 **정정 경로가 끊긴다**: 배치로 계산한 직후 단일시점 모달을 열면 빈 폼이라
「방금 계산했는데 왜 비어 있지」가 된다. 사용자에게는 데이터 손실처럼 보인다.

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

### 검증

- 배치 저장분을 단일시점 모달이 복원하지 않는다(현행 유지) + **그 이유가 `origin`이다**
- 단일시점 저장분은 그대로 복원된다(정정 경로 보존)
- 계산서는 두 경우 모두 지금과 같은 장수·제목

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
