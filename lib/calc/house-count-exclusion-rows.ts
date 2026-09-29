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
 * ## 행 id가 붙은 선언의 두 출처
 *
 * - 판정 메뉴: 명부 행.
 * - 계산기: 판정 메뉴에서 넘겨받은 선언(`assets[0].reductions`·`specialHouseExclusions`에 `houseId`가
 *   남아 있다 — `one-house-judgment-handoff.ts`). 계산기에서 직접 입력한 선언은 `houseId`가 없어
 *   **어느 행도 빼지 않는다**(종전 동작 — 계획서 Q-1(a)).
 */
import { toOptionalDate } from "@/lib/api/date-coerce";
import { isCapitalAreaByRegionCode } from "@/lib/geo/rural-house-location";
import { resolveHouseCountExclusion } from "@/lib/tax-engine/transfer-reductions/unsold-98-9";
import { resolveSpecialHouseExclusions } from "@/lib/tax-engine/transfer-reductions/unsold-hybrid-p5";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import type { AssetReductionForm, SpecialHouseExclusionFormItem } from "@/lib/stores/calc-wizard-asset-reduction";
import type { HouseEntry, RowCountExclusionReduction } from "@/lib/stores/calc-wizard-asset-nbl";
import { toEngineReductions } from "./transfer-tax-api-reductions";

const isRowReduction = (r: AssetReductionForm): r is RowCountExclusionReduction =>
  r.type === "new_99_4_rural" || r.type === "new_99_4_hometown" || r.type === "unsold_98_9";

/** 행 → §99의4·§98의9 선언(폼 모양). 행 값으로 사실을 덮고 `houseId`를 싣는다. */
export function rowCountExclusionReductions(houses: HouseEntry[] | undefined): RowCountExclusionReduction[] {
  return (houses ?? []).flatMap((h): RowCountExclusionReduction[] => {
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

/** 행 → 보유 감면주택 선언. 취득일은 행 값. */
export function rowSpecialHouseExclusions(houses: HouseEntry[] | undefined): SpecialHouseExclusionFormItem[] {
  return (houses ?? []).flatMap((h) =>
    h.countExclusion?.kind === "special"
      ? [{ ...h.countExclusion.special, houseId: h.id, houseAcquisitionDate: h.acquisitionDate }]
      : [],
  );
}

type FormLike = {
  houses?: HouseEntry[];
  assets?: Pick<AssetForm, "acquisitionDate" | "acquisitionCause" | "reductions">[];
  specialHouseExclusions?: SpecialHouseExclusionFormItem[];
  transferDate?: string;
};

/**
 * 행 id가 붙은 선언 전부 — 행에서 온 것 + 넘겨받아 저장소에 남은 것.
 * 행 id가 없는 선언은 어느 행인지 모르므로 여기서는 제외한다.
 */
function linkedDeclarations(form: FormLike) {
  const stored = (form.assets?.[0]?.reductions ?? []).filter(isRowReduction).filter((r) => r.houseId);
  const storedSpecial = (form.specialHouseExclusions ?? []).filter((e) => e.houseId && e.article);
  return {
    reductions: [...rowCountExclusionReductions(form.houses), ...stored],
    specials: [...rowSpecialHouseExclusions(form.houses), ...storedSpecial],
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
    const engineReductions = toEngineReductions(reductions, primary.acquisitionCause).map((r) => {
      // `toEngineReductions`의 반환은 stub 분기 때문에 `type: string`으로 넓어져 있다 — 키로 좁힌다.
      if ("unsoldHouseAcquisitionDate" in r) {
        return { ...r, unsoldHouseAcquisitionDate: toOptionalDate(r.unsoldHouseAcquisitionDate) };
      }
      if ("ruralHouseAcquisitionDate" in r) {
        return { ...r, ruralHouseAcquisitionDate: toOptionalDate(r.ruralHouseAcquisitionDate) };
      }
      return r;
    });
    const resolution = resolveHouseCountExclusion(engineReductions, {
      generalHouseAcquisitionDate: general,
      transferDate: transfer,
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
        requirementsConfirmed: e.requirementsConfirmed,
      })),
      transfer,
    );
    for (const e of resolution.entries) if (e.eligible && e.houseId) ids.add(e.houseId);
  }

  return ids;
}
