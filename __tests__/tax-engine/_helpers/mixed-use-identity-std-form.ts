/**
 * S3-2 UI 단계 테스트 보충 — **폼 수준 항등 나목** 채우기.
 *
 * 엔진·route 직접 테스트는 `mixed-use-identity-std.ts`(엔진 입력·body shim)로 나목을 채운다. 폼을 거치는
 * 테스트(④ `callTransferTaxAPI` → 실제 route)와 E2E 시드는 그 shim이 아니라 **폼 필드**
 * (`mixedAcqHousingBuildingStdPrice`·`mixedTransferHousingBuildingStdPrice`)에 값을 넣어야 한다 —
 * ④가 폼 값을 실제로 싣는지가 검증 대상이기 때문이다.
 *
 * 값은 엔진 shim과 **같은 식**(N = H − 가목)이다: 폼 → ④ 페이로드(`buildMixedUsePayload`) → 엔진 shim의 항등 나목을
 * 읽어 폼 문자열로 되돌린다(식을 새로 쓰지 않는다 — 같은 값 보장). 항등이 안 되는 clamp fixture는 `acqN`·`transferN`으로
 * 현실적 값을 지정한다. 술어가 거짓인 시점(PHD·상가→주택 취득측)과 이미 값이 있는 칸은 건드리지 않는다.
 */
import { buildMixedUsePayload } from "@/lib/calc/transfer-tax-api-mixed-use";
import {
  needsMixedHousingBuildingStdAtAcq,
  needsMixedHousingBuildingStdAtTransfer,
} from "@/lib/calc/mixed-use-housing-std-split";
import { parseAmount } from "@/components/calc/inputs/CurrencyInput";
import { createDefaultTransferFormData } from "@/lib/stores/calc-wizard-store";
import type { TransferFormData } from "@/lib/stores/calc-wizard-store";
import type { AssetForm } from "@/lib/stores/calc-wizard-asset";
import { withIdentityHousingBuildingStd } from "./mixed-use-identity-std";

export interface FormIdentityOverride {
  /** 폼 양도일(④가 쓰는 값 — 1990 이전 토지 환산 fallback에만 영향). 기본 2026-02-16. */
  transferDate?: string;
  acqN?: number;
  transferN?: number;
}

/** 겸용 주택 자산 1건의 두 나목 칸을 항등으로 채운 **새 객체**. 겸용이 아니면 그대로. */
export function withIdentityHousingBuildingStdForm<A extends AssetForm>(asset: A, over: FormIdentityOverride = {}): A {
  if (!(asset.assetKind === "housing" && asset.isMixedUseHouse)) return asset;
  const form = {
    ...createDefaultTransferFormData(),
    transferDate: over.transferDate ?? "2026-02-16",
    assets: [asset],
  } as unknown as TransferFormData;
  const mu = buildMixedUsePayload(asset, form);
  if (!mu) return asset;
  const filled = withIdentityHousingBuildingStd(mu as unknown as object, {
    acqN: over.acqN,
    transferN: over.transferN,
    fillHousingPrice: false,
  }) as unknown as {
    acquisitionStandardPrice: { housingBuildingPrice?: number };
    transferStandardPrice: { housingBuildingPrice?: number };
  };
  const patch: Partial<AssetForm> = {};
  const acqN = filled.acquisitionStandardPrice.housingBuildingPrice;
  if (needsMixedHousingBuildingStdAtAcq(asset) && !(parseAmount(asset.mixedAcqHousingBuildingStdPrice) > 0) && acqN)
    patch.mixedAcqHousingBuildingStdPrice = String(acqN);
  const trN = filled.transferStandardPrice.housingBuildingPrice;
  if (
    needsMixedHousingBuildingStdAtTransfer(asset) &&
    !(parseAmount(asset.mixedTransferHousingBuildingStdPrice) > 0) &&
    trN
  )
    patch.mixedTransferHousingBuildingStdPrice = String(trN);
  return { ...asset, ...patch };
}

/** 폼 전체 — 모든 겸용 자산(단건 primary·컴패니언)에 적용한 **새 폼**. */
export function withIdentityHousingBuildingStdOnForm(form: TransferFormData, over: FormIdentityOverride = {}): TransferFormData {
  return {
    ...form,
    assets: form.assets.map((a) =>
      withIdentityHousingBuildingStdForm(a, { transferDate: form.transferDate || over.transferDate, ...over }),
    ),
  };
}
