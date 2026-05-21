/**
 * InheritanceTaxForm shared types — 800줄 정책 분리용.
 */

import type {
  EstateItem,
  Heir,
  PriorGift,
  PresumedInheritanceItem,
  DebtItem,
} from "@/lib/tax-engine/types/inheritance-gift.types";
import type { ExemptionCheckedItem } from "@/lib/tax-engine/exemption-evaluator";

export interface FormState {
  // Step 0
  decedentType: "resident" | "non_resident";
  deathDate: string;
  // Step 1 — 상속재산 + 추정상속재산
  estateItems: EstateItem[];
  stockItems: EstateItem[];
  presumedItems: PresumedInheritanceItem[];
  // Step 2 — 비과세·장례·채무 (legacy + 신규 debtItems)
  exemptionItems: ExemptionCheckedItem[];
  funeralExpense: string;
  funeralIncludesBongan: boolean;
  debts: string;
  /**
   * 채무·공과·장례비 협의분할 입력 (방안 C — 3-state).
   * - undefined: OFF 모드 (legacy debts·funeralExpense 사용)
   * - []: ON 모드 진입, 빈 상태
   * - [{...}]: ON 모드 데이터 있음
   */
  debtItems: DebtItem[] | undefined;
  // Step 3
  priorGifts: PriorGift[];
  // Step 4
  heirs: Heir[];
  spouseActualAmount: string;
  preferLumpSum: boolean;
  netFinancialAssets: string;
  cohabitHouseStdPrice: string;
  farmingAssetValue: string;
  familyBusinessValue: string;
  familyBusinessYears: string;
  // Phase D·E
  familyBusinessDirectAmount: string;
  cohabitDirectAmount: string;
  legateeAmountNonHeir: string;
  priorGiftDeductionTotal: string;
  // Step 5
  isGenerationSkip: boolean;
  isMinorHeir: boolean;
  generationSkipAssetAmount: string;
  isFiledOnTime: boolean;
  foreignTaxPaid: string;
  shortTermReinheritYears: string;
  shortTermReinheritTaxPaid: string;
}

export type FormSet = (p: Partial<FormState>) => void;

export const INITIAL_FORM: FormState = {
  decedentType: "resident",
  deathDate: "",
  estateItems: [],
  stockItems: [],
  presumedItems: [],
  exemptionItems: [],
  funeralExpense: "",
  funeralIncludesBongan: false,
  debts: "",
  debtItems: undefined,
  priorGifts: [],
  heirs: [],
  spouseActualAmount: "",
  preferLumpSum: false,
  netFinancialAssets: "",
  cohabitHouseStdPrice: "",
  farmingAssetValue: "",
  familyBusinessValue: "",
  familyBusinessYears: "",
  familyBusinessDirectAmount: "",
  cohabitDirectAmount: "",
  legateeAmountNonHeir: "",
  priorGiftDeductionTotal: "",
  isGenerationSkip: false,
  isMinorHeir: false,
  generationSkipAssetAmount: "",
  isFiledOnTime: true,
  foreignTaxPaid: "",
  shortTermReinheritYears: "",
  shortTermReinheritTaxPaid: "",
};

export const STEPS = [
  "피상속인·상속인",
  "상속재산",
  "비과세·장례비",
  "사전증여",
  "공제·세액공제",
] as const;
