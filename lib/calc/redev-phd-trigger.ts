/**
 * 재개발 환산취득가 — §164⑦ 본문 발동 여부 (단일 소스).
 *
 * 「소득세법 시행령」 제164조 제7항 본문은 취득 당시 개별주택가격·공동주택가격이
 * **고시되지 않았던** 경우에 최초 공시분에서 취득당시 라목값을 역산하게 한다.
 * 재개발 환산(§166③)은 그 라목값을 분자로 쓰므로 같은 게이트를 탄다.
 *
 * ## 왜 뽑았는가
 *
 * 같은 판정이 세 곳에 복제돼 있었고(UI 2 + validate 1), 여기에 계산서 노출 게이트가
 * 네 번째로 붙을 참이었다. 조건이 갈리면 「화면에는 블록이 없는데 계산서는 나오는」
 * 어긋남이 조용히 생긴다 — 실제로 L-1이 그 형태의 결함이다.
 * 계획서: `docs/00-pm/redev-phd-snapshot-staleness-gate.plan.md`
 *
 * ## ⚠️ `transfer-tax-validate-redev.ts`는 여기에 합치지 않았다
 *
 * 그쪽 조건에는 `isHousingRightReceiveEstimated`(housing+right+receive+estimated →
 * §166③ 별도 산식) **배제가 하나 더** 붙어 있고, 그 플래그는 validate 내부에서 계산된다.
 * 술어를 그 인자까지 받도록 넓히면 UI·게이트 호출부가 쓰지도 않는 인자를 나르게 된다.
 * ⇒ **조건이 진짜로 같은 곳만** 이 함수를 쓴다. 합치려면 그 플래그의 소재부터 정리할 것.
 *
 * ## 날짜 비교는 `isPhdEligible`에 위임한다 (2026-08-24 B-3)
 *
 * 종전에는 이 파일이 날짜를 직접 비교해 **의제취득일(1985-01-01) 보정이 빠져 있었다**.
 * 「소득세법 시행령」 제164조 제7항 본문은 「…공시되기 전에 **취득한** 주택」이라고만 하고
 * 취득시기 자체는 일반 규정에 맡긴다(1984-12-31 이전 취득 → 1985-01-01 취득 의제,
 * 소득세법 부칙 — `TRANSFER.DEEMED_ACQUISITION_DATE_BASIS`).
 *
 * 이 저장소는 그 해석을 이미 `isPhdEligible`로 채택해 **⑧ validate · ⑩ Zod refine ·
 * 겸용 validate** 등 실제 차단 게이트에서 쓰고 있었다 — 재개발 경로만 빠져 있어 같은
 * §164⑦을 두 경로가 다르게 봤다. 새 해석을 들이는 게 아니라 **적용 범위를 맞춘 것**이다.
 *
 * ⚠️ **방향이 반대인 지점 하나**: `isPhdEligible`은 날짜가 비면 `true`(게이트 미발동 —
 *    필수입력 검증이 따로 막는다)지만, 이 트리거는 `false`(발동 안 함)여야 한다.
 *    그래서 날짜 존재를 **여기서 먼저** 확인한 뒤 위임한다.
 */
import { isPhdEligible } from "@/lib/calc/phd-eligibility";

/** 판정에 필요한 필드만 — 폼 전체(AssetForm)를 요구하지 않아 저장된 input_data에도 쓸 수 있다. */
export interface RedevPhdTriggerFields {
  /** ⑤ 「종전 부동산 취득가액」 라디오 — 환산 모드에서만 이 축이 열린다 */
  useEstimatedAcquisition?: boolean;
  acquisitionDate?: string;
  /** 개별주택가격/공동주택가격 최초 공시일 (단독 2005-04-30 · 공동 2006-04-28) */
  redevFirstDisclosureDate?: string;
}

/**
 * §164⑦ 본문 발동 여부. 환산 모드 + 두 날짜가 모두 있고, 의제취득일을 반영한 유효취득일이
 * 최초공시일보다 이르면 true.
 */
export function isRedevPhdTriggered(a: RedevPhdTriggerFields): boolean {
  if (!a.useEstimatedAcquisition) return false;
  if (!a.acquisitionDate || !a.redevFirstDisclosureDate) return false;
  return isPhdEligible(a.acquisitionDate, a.redevFirstDisclosureDate);
}

/**
 * §164⑦ PHD 환산 **섹션이 지금도 열려 있는가** — 그 섹션이 이 계산의 유일한 생산자다.
 *
 * 트리거(모드+날짜)만 보면 절반만 막는다. `RedevelopmentValuationSection`은 아래 6중 게이트를
 * 모두 통과해야 렌더되고, 그중 어느 하나가 꺼져도 §164⑦ 계산은 적용되지 않는다:
 *
 * | # | 위치 | 조건 |
 * |---|---|---|
 * | 1 | `AssetSectionAcquisition.tsx:327` | `assetKind ∈ {redevelopment_apt, right_to_move_in}` |
 * | 2 | `AssetSectionAcquisition.tsx:324` | 승계조합원 **입주권**이 아님(`isSuccessorRightTransfer`) |
 * | 3 | `RedevelopmentBlock.tsx:373` | `redevIsSuccessorMember !== "yes"` |
 * | 4 | `RedevelopmentBlock.tsx:395` | 환산 모드(`useEstimatedAcquisition`) |
 * | 5 | `RedevelopmentBlock.tsx:407` | 단독주택 출자 §166③ 분기가 아님(`isHousingContribEstimatedBranch`) |
 * | 6 | `RedevelopmentValuationSection.tsx:179` | 토지 출자가 아님(`isLand` 삼항) |
 *
 * ⚠️ **게이트 6은 섹션 안쪽에 있다** — `shouldShowRedevValuationSection`은 여전히 true다.
 *    `isLand ?` 삼항이 §164⑦ 블록과 계산서 런처(`snapshotKey=bsp-*-redev-phd`)를 통째로
 *    §166③ 단가 카드(`LandContribValuationContent`)로 바꾸므로, 그 조건이 이 술어에 없으면
 *    「화면에는 블록이 없는데 계산서는 결과탭·이력·PDF에 남는」 어긋남이 생긴다(2026-08-26 P2-04).
 *
 * ## ⚠️ 미확인 필드는 **차단하지 않는다**
 *
 * 각 조건은 그 근거 필드가 **명시적으로 확인될 때만** false를 낸다. 구버전·부분 `input_data`에
 * 필드가 없으면 판단을 보류(통과)한다 — 과잉 차단은 「계산했는데 계산서가 없다」는 반대 방향
 * 결함이고, 이미 저장된 이력을 지우는 쪽이 더 나쁘다.
 *
 * ## ⚠️ 조건 2·3·5·6은 다른 파일의 술어와 **같은 판정**이어야 한다
 *
 * 그 술어들(`isSuccessorRightTransfer`·`shouldShowRedevValuationSection`)은 `AssetForm` 전체를
 * 받도록 되어 있어 `Record<string, unknown>`인 저장 input_data에는 그대로 쓸 수 없다.
 * ⇒ 여기서는 조건을 직접 표현하고, **동기화는 anchor가 고정한다**
 * (`__tests__/calc/redev-phd-trigger.test.ts` — 「가시성 술어 동기화」 describe).
 * 저쪽 조건을 바꾸면 그 anchor가 먼저 빨개진다.
 */
export interface RedevPhdSectionFields extends RedevPhdTriggerFields {
  assetKind?: unknown;
  isSuccessorRightToMoveIn?: unknown;
  redevIsSuccessorMember?: unknown;
  redevOriginalAssetType?: unknown;
  redevSubject?: unknown;
  redevSettlementDirection?: unknown;
}

export function isRedevPhdSectionActive(a: RedevPhdSectionFields): boolean {
  // 1) 자산 종류 축 — 값이 있는데 재개발 계열이 아니면 블록 자체가 없다.
  if (
    typeof a.assetKind === "string" &&
    a.assetKind !== "redevelopment_apt" &&
    a.assetKind !== "right_to_move_in"
  ) {
    return false;
  }
  // 2) 승계조합원 입주권 — §166①의 조합원이 아니라 전용 블록(SuccessorRightAcquisitionBlock)으로 간다.
  if (a.assetKind === "right_to_move_in" && a.isSuccessorRightToMoveIn === true) return false;
  // 3) 승계조합원(완공APT) — ⑤ 섹션 전체를 숨긴다.
  if (a.redevIsSuccessorMember === "yes") return false;
  // 4) 환산 모드 + 취득일 < 최초공시일
  if (!isRedevPhdTriggered(a)) return false;
  // 5) 단독주택 출자 §164⑤ 2-point 분기 — 전용 카드가 대신 뜬다(§164⑦ 아님).
  if (
    a.redevOriginalAssetType === "housing" &&
    (a.redevSubject === "right" || a.assetKind === "right_to_move_in") &&
    a.redevSettlementDirection === "receive"
  ) {
    return false;
  }
  // 6) 토지 출자 — §166③ 개별공시지가 단가 카드가 §164⑦ 블록을 통째로 대신한다.
  //    (엔진 토지 분기는 landStdPriceAt*만 읽고 PHD 필드를 쓰지 않는다.)
  if (a.redevOriginalAssetType === "land") return false;
  return true;
}
