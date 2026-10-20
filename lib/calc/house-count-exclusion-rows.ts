/**
 * 조특법 주택 수 제외(§99의4·§98의9·보유 감면주택) — **명부 행 ↔ 엔진 선언** 변환 단일 소스.
 *
 * 계획서 `docs/00-pm/one-house-judgment-count-exclusion-row-link.plan.md`.
 *
 * ## 무엇을 하나
 *
 * 1. 행(`HouseEntry.countExclusion`) → 엔진이 받는 선언(감면 폼 모양 + `houseId`).
 *    취득일·주소·취득가액·전용면적·수도권 여부는 **행 값으로 덮는다** — 폼의 같은 칸은 쓰지 않는다.
 * 2. 요건을 갖춰 **실제로 빠지는 행**의 id — 일시적 2주택의 신규 주택 후보에서 뺀다(§155①).
 *    판정은 **엔진 평가기 그대로**다(Q-3(b)). 선언만으로 빼면 요건 미달 주택이 후보에서 사라져
 *    화면은 일시적 2주택을 그리는데 서버는 3주택으로 판정하는 두 진실이 생긴다.
 *
 * ## 행 id가 붙은 선언의 출처
 *
 * - 두 화면 모두 명부 행(계산기는 `transfer-calc-count-exclusion-row-link.plan.md`로 이전).
 * - 옛 기록: PR #1881~이 계획 사이에 판정 메뉴에서 넘겨받아 저장소(`assets[0].reductions`·
 *   `specialHouseExclusions`)에 `houseId`와 함께 남은 선언 — 복원 때 그 행으로 옮긴다
 *   (`moveLinkedCountExclusionsToRows`, Q-5). 옮기지 못한 경로에서도 여기서 읽는다.
 * - `houseId`가 없는 옛 선언은 **어느 행도 빼지 않고** ⑧이 막는다(Q-1).
 */
import { toOptionalDate } from "@/lib/api/date-coerce";
import { isCapitalAreaByRegionCode } from "@/lib/geo/rural-house-location";
import { resolveHouseCountExclusion } from "@/lib/tax-engine/transfer-reductions/unsold-98-9";
import { resolveSpecialHouseExclusions } from "@/lib/tax-engine/transfer-reductions/unsold-hybrid-p5";
import { rightSaleSpecialExclusionApplies } from "@/lib/tax-engine/one-house/right-sale-special-act-exclusion";
import { usesRentalStartDate } from "@/lib/tax-engine/transfer-reductions/unsold-hybrid-p5";
import { SPECIAL_HOUSE_EXCLUSION_WINDOWS } from "@/lib/tax-engine/transfer-reductions/unsold-hybrid-p5";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { AssetReductionForm, SpecialHouseExclusionFormItem } from "@/lib/stores/calc-wizard-asset-reduction";
import type { HouseEntry, RowCountExclusionReduction } from "@/lib/stores/calc-wizard-asset-nbl";
import { toEngineReductions } from "./transfer-tax-api-reductions";
import { housesOwnedAtTransfer } from "./household-house-count";
import { REDUCTION_TYPE_LABELS } from "@/lib/tax-engine/transfer-reduction-type-labels";

/** 명부 행 ⑥이 받는 §99의4·§98의9 유형 — 계산기 ③ 감면 패널에서는 뺀다(Q-3). */
export const ROW_COUNT_EXCLUSION_TYPES: ReadonlySet<string> = new Set([
  "new_99_4_rural",
  "new_99_4_hometown",
  "unsold_98_9",
]);

export const isRowReduction = (r: AssetReductionForm): r is RowCountExclusionReduction =>
  ROW_COUNT_EXCLUSION_TYPES.has(r.type);

/**
 * 계산기 — 명부 행 ⑥을 **입력(⑤)·전송(④)·검증(⑧)** 하는 양도 자산. 세 층이 이 술어 하나를 부른다.
 *
 * 계획서 `transfer-calc-count-exclusion-row-link.plan.md` Q-2′ · §7-1 V-1 · 결정 #2(2026-10-11):
 *
 * - **주택·재개발 완공 아파트 양도**: 행 ⑥의 모든 선언(§99의4·§98의9·보유 감면주택)을 쓴다. 두 조문의 효과는
 *   「일반**주택**을 양도하는 경우 … 「소득세법」 제89조제1항**제3호**를 적용」이다.
 * - **조합원입주권 양도(`right_to_move_in`)**: 입주권 가·나목(§89①4호)의 「다른 주택」에서 빼는 **보유 감면주택 4개 조문**
 *   (§98·§98의2·§98의5·§99 — 해석례로 입주권 적용이 확인된 것, `RIGHT_SALE_SPECIAL_EXCLUSION_ARTICLES`)만 쓴다.
 *   행 단위 술어는 `countExclusionRowApplies`다. §99의4·§98의9는 입주권 양도에서 효과가 없다(V-1 실측) — 선언은 보내지 않는다.
 *
 * ⚠️ 명부로 주택 수를 세는 F1(`household-house-count.ts`)은 `housing`·입주권이다 — 축이 다르다.
 *    재개발 아파트도 선언이 엔진 스칼라 차감에 쓰이므로(C6 실재) 여기서는 연다.
 */
export function countExclusionRowsInScope(primaryKind: string | undefined): boolean {
  return countExclusionReductionRowsInScope(primaryKind) || primaryKind === "right_to_move_in";
}

/** 행 ⑥의 §99의4·§98의9 선언을 쓰는 양도 자산 — 주택·재개발 완공 아파트. 입주권 양도에서는 효과가 없다(V-1). */
export function countExclusionReductionRowsInScope(primaryKind: string | undefined): boolean {
  return primaryKind === "housing" || primaryKind === "redevelopment_apt";
}

/**
 * 이 명부 행의 선언을 **판정에 쓰는가** — ④(전송)·⑤(배지)·⑧(필수값)과 판정 메뉴(`judgmentCountExclusionRowApplies`)의 공용 술어.
 * 주택·재개발 완공 아파트 양도면 모든 행 선언을, 입주권 양도면 해석례로 확인된 4개 조문의 보유 감면주택 행만 쓴다.
 */
export function countExclusionRowApplies(
  primaryKind: string | undefined,
  house: Pick<HouseEntry, "countExclusion">,
): boolean {
  if (house.countExclusion === undefined) return false;
  if (primaryKind !== "right_to_move_in") return true;
  return house.countExclusion.kind === "special" && rightSaleSpecialExclusionApplies(house.countExclusion.special.article);
}

/**
 * 행 → §99의4·§98의9 선언(폼 모양). 행 값으로 사실을 덮고 `houseId`를 싣는다.
 *
 * 🔑 **양도일 현재 보유 행만**(`housesOwnedAtTransfer` — 명부·주택 수와 같은 leaf). 양도일 당일·이후 취득 행은 세지 않은
 *    주택이라 「소유주택으로 보지 아니한다」(조특법 §98의6②·§99의4①)로 한 번 더 뺄 근거가 없다(재검증 S10-1).
 *    `transferDate`를 **필수**로 둔다 — 빠뜨린 호출부를 컴파일러가 찾는다.
 */
export function rowCountExclusionReductions(
  houses: HouseEntry[] | undefined,
  transferDate: string | undefined,
  primaryKind: string | undefined,
): RowCountExclusionReduction[] {
  return housesOwnedAtTransfer(houses, transferDate, primaryKind).flatMap((h): RowCountExclusionReduction[] => {
    if (h.countExclusion?.kind !== "reduction") return [];
    const r = h.countExclusion.reduction;
    if (r.type === "unsold_98_9") {
      // 조특법 §2①9호 「수도권」= 수도권정비계획법 §2제1호(서울·인천·경기). 코드가 없으면 폼의 확인값.
      const capital = isCapitalAreaByRegionCode(h.regionCode);
      return [
        {
          ...r,
          houseId: h.id,
          unsoldHouseAcquisitionDate: h.acquisitionDate,
          unsoldHouseAcquisitionPrice: h.acquisitionPrice ?? "",
          unsoldHouseExclusiveArea: h.exclusiveArea ?? "",
          ...(capital !== null ? { isNonCapitalRegion: !capital } : {}),
        },
      ];
    }
    return [
      {
        ...r,
        houseId: h.id,
        ruralHouseAcquisitionDate: h.acquisitionDate,
        ruralHouseJibun: h.addressJibun ?? "",
      },
    ];
  });
}

/**
 * 행 → 보유 감면주택 선언. 취득일은 행 값. **양도일 현재 보유 행만**(`rowCountExclusionReductions`와 같은 근거 —
 * 엔진 §98의6은 basis가 none이라 날짜 판정을 하지 않으므로 여기서 거르지 않으면 닿는다).
 */
export function rowSpecialHouseExclusions(
  houses: HouseEntry[] | undefined,
  transferDate: string | undefined,
  primaryKind: string | undefined,
): SpecialHouseExclusionFormItem[] {
  return housesOwnedAtTransfer(houses, transferDate, primaryKind).flatMap((h) =>
    h.countExclusion?.kind === "special"
      ? [{ ...h.countExclusion.special, houseId: h.id, houseAcquisitionDate: h.acquisitionDate }]
      : [],
  );
}

type FormLike = {
  houses?: HouseEntry[];
  assets?: Pick<AssetForm, "assetKind" | "acquisitionDate" | "acquisitionCause" | "reductions">[];
  specialHouseExclusions?: SpecialHouseExclusionFormItem[];
  transferDate?: string;
  /** D5 — §99의4 순서의 합가 맥락(엔진 `new994MergeOrderOf`와 같은 순서: 혼인 먼저). */
  marriageDate?: string;
  parentalCareMergeDate?: string;
};

/**
 * 행 id가 붙은 선언 전부 — 행에서 온 것 + 넘겨받아 저장소에 남은 것.
 * 행 id가 없는 선언은 어느 행인지 모르므로 여기서는 제외한다.
 */
function linkedDeclarations(form: FormLike) {
  const stored = (form.assets?.[0]?.reductions ?? []).filter(isRowReduction).filter((r) => r.houseId);
  const storedSpecial = (form.specialHouseExclusions ?? []).filter((e) => e.houseId);
  return {
    reductions: [...rowCountExclusionReductions(form.houses, form.transferDate, form.assets?.[0]?.assetKind), ...stored],
    // 🔴 조문을 아직 고르지 않은 행(「감면주택」만 선택)은 뺀다 — 평가기가 조문 표를 읽다 TypeError가 난다
    //    (판정 메뉴 ③ 헤더 `useMemo`가 매 렌더 부른다).
    specials: [...rowSpecialHouseExclusions(form.houses, form.transferDate, form.assets?.[0]?.assetKind), ...storedSpecial].filter((e) => e.article),
  };
}

/**
 * 요건을 갖춰 §89①3호 판정에서 **소유주택으로 보지 않는** 명부 행 id.
 *
 * 엔진과 같은 평가기(`resolveHouseCountExclusion`·`resolveSpecialHouseExclusions`)를 부른다.
 * 날짜 변환은 route(⑭ `route-reductions-mapper.ts`·`engine-input.ts`)와 같은 규칙이다.
 * 양도 주택 취득일·양도일이 없으면 판정할 수 없으므로 빈 집합이다.
 */
export function eligibleCountExcludedHouseIds(form: FormLike): ReadonlySet<string> {
  const primary = form.assets?.[0];
  const general = toOptionalDate(primary?.acquisitionDate);
  const transfer = toOptionalDate(form.transferDate);
  if (!primary || !general || !transfer) return new Set();

  const { reductions, specials } = linkedDeclarations(form);
  const ids = new Set<string>();

  if (reductions.length > 0) {
    const engineReductions = toEngineReductions(reductions, primary).map((r) => {
      // `toEngineReductions`의 반환은 stub 분기 때문에 `type: string`으로 넓어져 있다 — 키로 좁힌다.
      if ("unsoldHouseAcquisitionDate" in r) {
        return { ...r, unsoldHouseAcquisitionDate: toOptionalDate(r.unsoldHouseAcquisitionDate) };
      }
      if ("ruralHouseAcquisitionDate" in r) {
        return { ...r, ruralHouseAcquisitionDate: toOptionalDate(r.ruralHouseAcquisitionDate) };
      }
      return r;
    });
    const mergeDate = toOptionalDate(form.marriageDate || form.parentalCareMergeDate);
    const resolution = resolveHouseCountExclusion(engineReductions, {
      generalHouseAcquisitionDate: general,
      transferDate: transfer,
      // D5 — route(⑭)와 같은 명부: 행 id · 취득일(Date) · 합가 전 보유 쪽
      mergeOrder: mergeDate
        ? {
            houses: (form.houses ?? []).map((h) => ({
              id: h.id,
              acquisitionDate: toOptionalDate(h.acquisitionDate),
              mergeOrigin: h.mergeOrigin,
            })),
            mergeDate,
          }
        : undefined,
    });
    for (const d of resolution.appliedList) if (d.houseId) ids.add(d.houseId);
  }

  if (specials.length > 0) {
    const resolution = resolveSpecialHouseExclusions(
      specials.map((e) => ({
        article: e.article as Exclude<SpecialHouseExclusionFormItem["article"], "">,
        houseId: e.houseId,
        houseAcquisitionDate: toOptionalDate(e.houseAcquisitionDate),
        houseContractDate: toOptionalDate(e.houseContractDate),
        isNationalHousing: e.isNationalHousing,
        houseRentalStartDate: usesRentalStartDate(e.article) ? toOptionalDate(e.houseRentalStartDate) : undefined,
        requirementsConfirmed: e.requirementsConfirmed,
      })),
      transfer,
    );
    for (const e of resolution.entries) if (e.eligible && e.houseId) ids.add(e.houseId);
  }

  return ids;
}

type CalcFormLike = {
  houses?: HouseEntry[];
  /** 양도일 — 명부 행 선언을 양도일 현재 보유 행으로 거른다(`rowCountExclusionReductions`). 필수: 빠뜨린 호출부를 컴파일러가 찾는다. */
  transferDate: string | undefined;
  assets?: Pick<AssetForm, "assetKind" | "reductions">[];
  specialHouseExclusions?: SpecialHouseExclusionFormItem[];
};

/** ④ 대표 자산 감면 — 저장소 선언 + (게이트 안이면) 명부 행 ⑥의 §99의4·§98의9. 단건·다건 공용. */
export function primaryReductionsWithRows(form: CalcFormLike): AssetReductionForm[] {
  const primary = form.assets?.[0];
  const stored = primary?.reductions ?? [];
  return countExclusionReductionRowsInScope(primary?.assetKind)
    ? [...stored, ...rowCountExclusionReductions(form.houses, form.transferDate, primary?.assetKind)]
    : stored;
}

/** ④ 보유 감면주택 — 폼 전역 + (게이트 안이면) 명부 행 ⑥. */
export function specialHouseExclusionsWithRows(form: CalcFormLike): SpecialHouseExclusionFormItem[] {
  const global = form.specialHouseExclusions ?? [];
  const kind = form.assets?.[0]?.assetKind;
  // 입주권 양도 — 명부 행에 연결된 4개 조문 선언만. 어느 주택인지 모르는 폼 전역 선언은 보내지 않는다(⑧이 막고 삭제를 안내한다).
  if (kind === "right_to_move_in") {
    return rowSpecialHouseExclusions((form.houses ?? []).filter((h) => countExclusionRowApplies(kind, h)), form.transferDate, kind);
  }
  return countExclusionRowsInScope(kind) ? [...global, ...rowSpecialHouseExclusions(form.houses, form.transferDate, kind)] : global;
}

/**
 * ⑬ 보유 감면주택 본문 — 폼 전역 + (게이트 안이면) 명부 행 ⑥ · 조문 입력분만. **단건·다건 공용**.
 *
 * 🔴 다건 ⑬은 종전에 이 키를 싣지 않았다 — 같은 명부 행이 단건 102,086,600 / 다건 1,327,903,500으로
 *    갈렸다(계획서 `one-house-exemption-fix.plan.md` §9.8 Q4). 두 빌더가 이 함수 하나를 부른다.
 */
export function specialHouseExclusionsPayload(form: CalcFormLike) {
  return specialHouseExclusionsWithRows(form)
    .filter((e) => e.article)
    .map((e) => ({
      article: e.article,
      ...(e.houseId ? { houseId: e.houseId } : {}),
      houseAcquisitionDate: e.houseAcquisitionDate || undefined,
      houseContractDate: e.houseContractDate || undefined,
      isNationalHousing: e.isNationalHousing,
      // §97·§97의2 임대개시일 — ⑤·⑧과 같은 술어로 게이트(조문을 바꾼 뒤 남은 값은 보내지 않는다)
      ...(usesRentalStartDate(e.article) && e.houseRentalStartDate
        ? { houseRentalStartDate: e.houseRentalStartDate }
        : {}),
      requirementsConfirmed: e.requirementsConfirmed,
    }));
}

/**
 * **어느 행인지 모르는** 옛 선언 — 행 id가 없거나, 가리키는 행이 명부에 없다.
 *
 * §99의4·§98의9는 **모든 자산**을 훑되, 게이트는 **선언이 붙은 자산 자신의 종류**로 본다 —
 * 컴패니언 선언도 자기 엔진 실행에 닿는다(V-4, `bundled-split-helpers.ts` `mapReductionsToEngine(c.reductions)`).
 * 대표 자산이 토지여도 함께 양도하는 주택의 옛 선언은 ③ 패널에서 사라져 보이지 않은 채 실리므로 막는다.
 * 권리 양도 자산의 선언은 효과가 없어(V-1) 두고 넘어간다.
 * 감면주택은 폼 전역이라 대표 자산 게이트를 따른다 — 게이트 밖에서는 종전 섹션이 그대로 보인다.
 * 조문이 없는 항목은 ④가 보내지 않으므로 뺀다.
 */
export function unlinkedCountExclusionDeclarations(form: CalcFormLike): {
  reductions: RowCountExclusionReduction[];
  specials: SpecialHouseExclusionFormItem[];
} {
  const rowIds = new Set((form.houses ?? []).map((h) => h.id));
  const unlinked = (houseId: string | undefined) => !houseId || !rowIds.has(houseId);
  return {
    reductions: (form.assets ?? [])
      .filter((a) => countExclusionReductionRowsInScope(a.assetKind))
      .flatMap((a) => (a.reductions ?? []).filter(isRowReduction))
      .filter((r) => unlinked(r.houseId)),
    specials: countExclusionRowsInScope(form.assets?.[0]?.assetKind)
      ? (form.specialHouseExclusions ?? []).filter((e) => e.article && unlinked(e.houseId))
      : [],
  };
}

/** 옛 선언 삭제 — 안내 카드의 「기존 선언 삭제」(유일한 해소 경로). 지우는 범위는 감지(`unlinked…`)와 같다. */
export function clearUnlinkedCountExclusions<F extends CalcFormLike & { assets: AssetForm[] }>(
  form: F,
): Pick<F, "assets" | "specialHouseExclusions"> {
  const rowIds = new Set((form.houses ?? []).map((h) => h.id));
  const linked = (houseId: string | undefined) => !!houseId && rowIds.has(houseId);
  return {
    assets: form.assets.map((a) =>
      countExclusionReductionRowsInScope(a.assetKind)
        ? { ...a, reductions: (a.reductions ?? []).filter((r) => !isRowReduction(r) || linked(r.houseId)) }
        : a,
    ),
    specialHouseExclusions: countExclusionRowsInScope(form.assets[0]?.assetKind)
      ? (form.specialHouseExclusions ?? []).filter((e) => linked(e.houseId))
      : form.specialHouseExclusions,
  } as Pick<F, "assets" | "specialHouseExclusions">;
}

/**
 * 옛 기록(Q-5) — 저장소에 **행 id와 함께** 남은 선언을 그 행 ⑥으로 옮긴다.
 *
 * 행 id가 있으므로 추측이 아니다. 두면 ③ 패널에서 사라진 유형이 **보이지 않는 채** 세액을 바꾼다.
 * 가리키는 행이 없으면 옮기지 않는다 — ⑧이 「어느 주택인지 모르는 선언」으로 막는다.
 * 행에 이미 ⑥이 있으면 행이 정본이다(저장소 쪽은 버린다 — 같은 주택을 두 번 싣지 않는다).
 */
export function moveLinkedCountExclusionsToRows<
  F extends { houses: HouseEntry[]; assets: AssetForm[]; specialHouseExclusions?: SpecialHouseExclusionFormItem[] },
>(form: F): F {
  const houses = form.houses ?? [];
  const rowIds = new Set(houses.map((h) => h.id));
  const primary = form.assets?.[0];
  const movable = (primary?.reductions ?? []).filter(
    (r): r is RowCountExclusionReduction => isRowReduction(r) && !!r.houseId && rowIds.has(r.houseId),
  );
  const movableSpecials = (form.specialHouseExclusions ?? []).filter((e) => !!e.houseId && rowIds.has(e.houseId));
  if (movable.length === 0 && movableSpecials.length === 0) return form;

  const strip = <T extends { houseId?: string }>(x: T): T => {
    const rest = { ...x };
    delete rest.houseId;
    return rest;
  };
  const nextHouses = houses.map((h): HouseEntry => {
    if (h.countExclusion) return h;
    const r = movable.find((x) => x.houseId === h.id);
    if (r) return { ...h, countExclusion: { kind: "reduction", reduction: strip(r) as RowCountExclusionReduction } };
    const e = movableSpecials.find((x) => x.houseId === h.id);
    if (e) return { ...h, countExclusion: { kind: "special", special: strip(e) as SpecialHouseExclusionFormItem } };
    return h;
  });
  return {
    ...form,
    houses: nextHouses,
    assets: form.assets.map((a, i) =>
      i === 0 ? { ...a, reductions: (a.reductions ?? []).filter((r) => !movable.includes(r as RowCountExclusionReduction)) } : a,
    ),
    specialHouseExclusions: (form.specialHouseExclusions ?? []).filter((e) => !movableSpecials.includes(e)),
  };
}

/** 옛 선언 안내 카드의 한 줄 — 「조문 — 취득일」. */
export function countExclusionDeclarationLine(
  d: RowCountExclusionReduction | SpecialHouseExclusionFormItem,
): string {
  if ("type" in d) {
    const date = d.type === "unsold_98_9" ? d.unsoldHouseAcquisitionDate : d.ruralHouseAcquisitionDate;
    return `${REDUCTION_TYPE_LABELS[d.type]} — 취득일 ${date || "미입력"}`;
  }
  if (d.article && usesRentalStartDate(d.article)) {
    return `조특법 ${SPECIAL_HOUSE_EXCLUSION_WINDOWS[d.article].label} — 임대개시일 ${d.houseRentalStartDate || "미입력"}`;
  }
  return `조특법 감면주택 (${d.article}) — 취득일 ${d.houseAcquisitionDate || "미입력"}`;
}
