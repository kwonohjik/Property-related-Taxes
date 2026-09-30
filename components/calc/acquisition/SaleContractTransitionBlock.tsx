"use client";

import { DateInput } from "@/components/ui/date-input";
import { ToggleCard } from "@/components/calc/inputs/ToggleCard";
import { ToneCard } from "@/components/calc/shared/ToneCard";
import {
  isHousingSaleContractAcquisition,
  isPre17473ContractDate,
} from "@/lib/calc/acquisition-sale-contract-transition";
import { labelCls, type FormState } from "./shared";

/**
 * 주택 매매 — 매매계약일 + 법률 제17473호 부칙 제6조(2020.7.10. 이전 매매계약 경과조치) 요건 (계획서 E-6)
 *
 * 노출 조건은 ④와 같은 leaf(`lib/calc/acquisition-sale-contract-transition.ts`)를 쓴다.
 * 연부취득이면 연부 매매계약일이 곧 매매계약일이라 날짜 칸은 숨기고 요건 칸만 연다.
 */
export function SaleContractTransitionBlock({
  form,
  set,
}: {
  form: FormState;
  set: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
}) {
  if (!isHousingSaleContractAcquisition(form)) return null;
  const isIndividual = form.acquiredBy === "individual";

  return (
    <>
      {!form.isInstallmentAcquisition && (
        <div>
          <label className={labelCls}>
            매매계약일 <span className="text-muted-foreground font-normal">(선택 — 공동주택 분양계약일 포함)</span>
          </label>
          <DateInput
            value={form.saleContractDate}
            onChange={(v) => set("saleContractDate", v)}
            data-testid="acq-sale-contract-date"
          />
          <p className="text-xs text-muted-foreground mt-1">
            2020.7.10. 이전에 매매계약을 체결하고 2020.8.12. 이후 취득한 주택은 종전 세율을 적용할 수 있습니다
            (지방세법 부칙 법률 제17473호 제6조).
          </p>
        </div>
      )}

      {isPre17473ContractDate(form) && (
        <ToneCard
          tone="amber"
          title="2020.7.10. 이전 매매계약 — 종전 세율 (부칙 법률 제17473호 제6조)"
          bodyClassName="space-y-2"
          noDark
        >
          <p className="text-xs text-muted-foreground">
            법인이나 국내에 주택을 1개 이상 소유한 1세대가 2020.7.10. 이전에 매매계약(공동주택 분양계약 포함)을
            체결했고 계약금 지급 사실이 증빙서류로 확인되면, 다주택·법인 주택 중과(§13의2) 대신 종전 규정을
            적용합니다 — 1세대 4주택 이상 4%, 그 밖에는 1~3%, 대도시 법인은 표준세율에 4%를 더합니다.
          </p>
          <ToggleCard
            tone="amber"
            size="sm"
            title="계약금 지급 증빙 보유"
            description="계좌이체 내역 등으로 2020.7.10. 이전에 계약금을 지급한 사실이 확인됩니다 (부칙 제6조 단서)"
            checked={form.hasContractDepositProof}
            onCheckedChange={(v) => set("hasContractDepositProof", v)}
          />
          {isIndividual && (
            <ToggleCard
              tone="amber"
              size="sm"
              title="계약 당시 국내에 주택을 1개 이상 소유한 1세대"
              description="계약일 현재 세대가 주택을 가지고 있었습니다 — 그 뒤 처분한 주택도 포함합니다"
              checked={form.ownedHouseAtSaleContract}
              onCheckedChange={(v) => set("ownedHouseAtSaleContract", v)}
            />
          )}
        </ToneCard>
      )}
    </>
  );
}
