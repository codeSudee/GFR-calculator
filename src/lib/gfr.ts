/**
 * GFR (Glomerular Filtration Rate) calculation engine.
 *
 * Implements four estimating equations:
 *  - CKD-EPI 2021 (race-free) — current clinical standard (NKF/ASN recommended)
 *  - CKD-EPI 2009 (classic, non-race variant — see note below)
 *  - MDRD (4-variable, non-race variant — see note below)
 *  - Cockcroft-Gault (creatinine clearance, used for drug dosing)
 *
 * IMPORTANT — unit conversion:
 * The peer-reviewed study by Seiberth et al. (Eur J Clin Pharmacol, 2020)
 * found that 8 of 47 (17%) freely available online GFR calculators produced
 * erroneous results, frequently due to mistakes converting serum creatinine
 * between mg/dL and µmol/L, or converting eGFR between indexed
 * (mL/min/1.73m²) and non-indexed (mL/min) units. This module centralizes
 * that conversion in one well-tested place: MGDL_TO_UMOLL.
 *
 * Race / ethnicity note:
 * The original CKD-EPI 2009 and MDRD equations included a coefficient for
 * Black/African-American race. The 2021 NKF/ASN Task Force recommended
 * removing race from GFR estimation entirely because it was found to
 * systematically overestimate kidney function in Black patients (see
 * Methodology page for citations). This calculator does not collect race as
 * an input for any formula — CKD-EPI 2009 and MDRD are implemented here
 * using their non-race coefficients so that every formula on this site is
 * computed consistently and without a race adjustment.
 */

export type Sex = "male" | "female";
export type CreatinineUnit = "mg/dL" | "umol/L";
export type FormulaId = "ckd-epi-2021" | "ckd-epi-2009" | "mdrd" | "cockcroft-gault";

export const MGDL_TO_UMOLL = 88.4;

/** CKD stage classification per KDIGO thresholds, mL/min/1.73m². */
export type CkdStage = "G1" | "G2" | "G3a" | "G3b" | "G4" | "G5";

export interface CkdStageInfo {
  stage: CkdStage;
  label: string;
  range: string;
  description: string;
  colorToken: string;
}

const CKD_STAGES: Array<{
  stage: CkdStage;
  label: string;
  range: string;
  description: string;
  colorToken: string;
  min: number;
  max: number;
}> = [
  {
    stage: "G1",
    label: "G1",
    range: "\u2265 90",
    description: "Normal or high kidney function",
    colorToken: "stage-g1",
    min: 90,
    max: Infinity,
  },
  {
    stage: "G2",
    label: "G2",
    range: "60\u201389",
    description: "Mildly decreased kidney function",
    colorToken: "stage-g2",
    min: 60,
    max: 89.999999,
  },
  {
    stage: "G3a",
    label: "G3a",
    range: "45\u201359",
    description: "Mildly to moderately decreased kidney function",
    colorToken: "stage-g3a",
    min: 45,
    max: 59.999999,
  },
  {
    stage: "G3b",
    label: "G3b",
    range: "30\u201344",
    description: "Moderately to severely decreased kidney function",
    colorToken: "stage-g3b",
    min: 30,
    max: 44.999999,
  },
  {
    stage: "G4",
    label: "G4",
    range: "15\u201329",
    description: "Severely decreased kidney function",
    colorToken: "stage-g4",
    min: 15,
    max: 29.999999,
  },
  {
    stage: "G5",
    label: "G5",
    range: "< 15",
    description: "Kidney failure",
    colorToken: "stage-g5",
    min: -Infinity,
    max: 14.999999,
  },
];

/**
 * Classify an eGFR value (mL/min/1.73m²) into a CKD stage (G1-G5).
 * Boundaries follow KDIGO: G1 >=90, G2 60-89, G3a 45-59, G3b 30-44, G4 15-29, G5 <15.
 */
export function classifyCkdStage(egfr: number): CkdStageInfo {
  const match = CKD_STAGES.find((s) => egfr >= s.min && egfr <= s.max);
  const found = match ?? CKD_STAGES[CKD_STAGES.length - 1];
  const { min, max, ...info } = found;
  return info;
}

/**
 * Convert serum creatinine between mg/dL and µmol/L.
 * Conversion factor: 1 mg/dL = 88.4 µmol/L (documented failure point in
 * existing online calculators per Seiberth et al. 2020).
 */
export function convertCreatinine(value: number, from: CreatinineUnit, to: CreatinineUnit): number {
  if (from === to) return value;
  if (from === "mg/dL" && to === "umol/L") return value * MGDL_TO_UMOLL;
  if (from === "umol/L" && to === "mg/dL") return value / MGDL_TO_UMOLL;
  throw new Error(`Unsupported unit conversion: ${from} -> ${to}`);
}

/** Always normalizes creatinine to mg/dL, the unit every formula below expects. */
export function toMgDl(value: number, unit: CreatinineUnit): number {
  return convertCreatinine(value, unit, "mg/dL");
}

export interface StepLine {
  label: string;
  expression: string;
  result?: string;
}

export interface GfrResult {
  formula: FormulaId;
  formulaName: string;
  egfr: number;
  unit: string;
  stage: CkdStageInfo;
  steps: StepLine[];
  notes?: string[];
}

export interface CalculatorInputs {
  creatinine: number;
  creatinineUnit: CreatinineUnit;
  age: number;
  sex: Sex;
  /** Required only for Cockcroft-Gault. */
  weightKg?: number;
}

function round(value: number, decimals = 1): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function fmt(value: number, decimals = 2): string {
  return round(value, decimals).toString();
}

/**
 * CKD-EPI 2021 (race-free), the current NKF/ASN-recommended clinical standard.
 * eGFR = 142 * min(Scr/κ,1)^α * max(Scr/κ,1)^-1.200 * 0.9938^Age * 1.012 [if female]
 * κ = 0.7 (female) / 0.9 (male); α = -0.241 (female) / -0.302 (male)
 * Source: Inker LA et al. N Engl J Med. 2021;385:1737-1749.
 */
export function calculateCkdEpi2021(inputs: CalculatorInputs): GfrResult {
  const scr = toMgDl(inputs.creatinine, inputs.creatinineUnit);
  const { age, sex } = inputs;
  const kappa = sex === "female" ? 0.7 : 0.9;
  const alpha = sex === "female" ? -0.241 : -0.302;
  const sexFactor = sex === "female" ? 1.012 : 1;

  const ratio = scr / kappa;
  const minTerm = Math.min(ratio, 1) ** alpha;
  const maxTerm = Math.max(ratio, 1) ** -1.2;
  const ageTerm = 0.9938 ** age;

  const egfr = 142 * minTerm * maxTerm * ageTerm * sexFactor;

  const steps: StepLine[] = [
    {
      label: "Standardize serum creatinine (Scr) to mg/dL",
      expression:
        inputs.creatinineUnit === "mg/dL"
          ? `Scr = ${fmt(inputs.creatinine)} mg/dL`
          : `Scr = ${fmt(inputs.creatinine)} \u00b5mol/L \u00f7 ${MGDL_TO_UMOLL} = ${fmt(scr)} mg/dL`,
    },
    {
      label: "Select \u03ba and \u03b1 for sex",
      expression: `\u03ba = ${kappa} (${sex}), \u03b1 = ${alpha} (${sex})`,
    },
    {
      label: "Compute Scr / \u03ba",
      expression: `${fmt(scr)} \u00f7 ${kappa} = ${fmt(ratio, 4)}`,
    },
    {
      label: "min(Scr/\u03ba, 1)^\u03b1",
      expression: `min(${fmt(ratio, 4)}, 1)^${alpha} = ${fmt(minTerm, 4)}`,
    },
    {
      label: "max(Scr/\u03ba, 1)^-1.200",
      expression: `max(${fmt(ratio, 4)}, 1)^-1.200 = ${fmt(maxTerm, 4)}`,
    },
    {
      label: "0.9938^Age",
      expression: `0.9938^${age} = ${fmt(ageTerm, 4)}`,
    },
    {
      label: "Sex factor",
      expression: sex === "female" ? "\u00d7 1.012 (female)" : "\u00d7 1 (male, no adjustment)",
    },
    {
      label: "eGFR",
      expression: `142 \u00d7 ${fmt(minTerm, 4)} \u00d7 ${fmt(maxTerm, 4)} \u00d7 ${fmt(ageTerm, 4)} \u00d7 ${fmt(sexFactor, 3)}`,
      result: `${fmt(egfr)} mL/min/1.73m\u00b2`,
    },
  ];

  return {
    formula: "ckd-epi-2021",
    formulaName: "CKD-EPI 2021 (race-free)",
    egfr: round(egfr),
    unit: "mL/min/1.73m\u00b2",
    stage: classifyCkdStage(egfr),
    steps,
  };
}

/**
 * CKD-EPI 2009 (classic), non-race variant.
 * eGFR = 141 * min(Scr/κ,1)^α * max(Scr/κ,1)^-1.209 * 0.993^Age * 1.018 [if female]
 * κ = 0.7 (female) / 0.9 (male); α = -0.329 (female) / -0.411 (male)
 * Race coefficient (×1.159 if Black) intentionally omitted — see module docstring.
 * Source: Levey AS et al. Ann Intern Med. 2009;150:604-612.
 */
export function calculateCkdEpi2009(inputs: CalculatorInputs): GfrResult {
  const scr = toMgDl(inputs.creatinine, inputs.creatinineUnit);
  const { age, sex } = inputs;
  const kappa = sex === "female" ? 0.7 : 0.9;
  const alpha = sex === "female" ? -0.329 : -0.411;
  const sexFactor = sex === "female" ? 1.018 : 1;

  const ratio = scr / kappa;
  const minTerm = Math.min(ratio, 1) ** alpha;
  const maxTerm = Math.max(ratio, 1) ** -1.209;
  const ageTerm = 0.993 ** age;

  const egfr = 141 * minTerm * maxTerm * ageTerm * sexFactor;

  const steps: StepLine[] = [
    {
      label: "Standardize serum creatinine (Scr) to mg/dL",
      expression:
        inputs.creatinineUnit === "mg/dL"
          ? `Scr = ${fmt(inputs.creatinine)} mg/dL`
          : `Scr = ${fmt(inputs.creatinine)} \u00b5mol/L \u00f7 ${MGDL_TO_UMOLL} = ${fmt(scr)} mg/dL`,
    },
    {
      label: "Select \u03ba and \u03b1 for sex",
      expression: `\u03ba = ${kappa} (${sex}), \u03b1 = ${alpha} (${sex})`,
    },
    {
      label: "Compute Scr / \u03ba",
      expression: `${fmt(scr)} \u00f7 ${kappa} = ${fmt(ratio, 4)}`,
    },
    {
      label: "min(Scr/\u03ba, 1)^\u03b1",
      expression: `min(${fmt(ratio, 4)}, 1)^${alpha} = ${fmt(minTerm, 4)}`,
    },
    {
      label: "max(Scr/\u03ba, 1)^-1.209",
      expression: `max(${fmt(ratio, 4)}, 1)^-1.209 = ${fmt(maxTerm, 4)}`,
    },
    {
      label: "0.993^Age",
      expression: `0.993^${age} = ${fmt(ageTerm, 4)}`,
    },
    {
      label: "Sex factor",
      expression: sex === "female" ? "\u00d7 1.018 (female)" : "\u00d7 1 (male, no adjustment)",
    },
    {
      label: "eGFR",
      expression: `141 \u00d7 ${fmt(minTerm, 4)} \u00d7 ${fmt(maxTerm, 4)} \u00d7 ${fmt(ageTerm, 4)} \u00d7 ${fmt(sexFactor, 3)}`,
      result: `${fmt(egfr)} mL/min/1.73m\u00b2`,
    },
  ];

  return {
    formula: "ckd-epi-2009",
    formulaName: "CKD-EPI 2009 (classic)",
    egfr: round(egfr),
    unit: "mL/min/1.73m\u00b2",
    stage: classifyCkdStage(egfr),
    steps,
    notes: [
      "This site reports the CKD-EPI 2009 equation without a race/ethnicity coefficient, consistent with the 2021 NKF/ASN recommendation to remove race from GFR estimation. Historical lab reports using this formula before ~2021 may have applied a race adjustment and differ slightly as a result.",
    ],
  };
}

/**
 * MDRD (4-variable), non-race variant.
 * eGFR = 175 * Scr^-1.154 * Age^-0.203 * 0.742 [if female]
 * Race coefficient (×1.212 if Black) intentionally omitted — see module docstring.
 * Source: Levey AS et al. Ann Intern Med. 2006;145:247-254.
 */
export function calculateMdrd(inputs: CalculatorInputs): GfrResult {
  const scr = toMgDl(inputs.creatinine, inputs.creatinineUnit);
  const { age, sex } = inputs;
  const sexFactor = sex === "female" ? 0.742 : 1;

  const scrTerm = scr ** -1.154;
  const ageTerm = age ** -0.203;

  const egfr = 175 * scrTerm * ageTerm * sexFactor;

  const steps: StepLine[] = [
    {
      label: "Standardize serum creatinine (Scr) to mg/dL",
      expression:
        inputs.creatinineUnit === "mg/dL"
          ? `Scr = ${fmt(inputs.creatinine)} mg/dL`
          : `Scr = ${fmt(inputs.creatinine)} \u00b5mol/L \u00f7 ${MGDL_TO_UMOLL} = ${fmt(scr)} mg/dL`,
    },
    {
      label: "Scr^-1.154",
      expression: `${fmt(scr)}^-1.154 = ${fmt(scrTerm, 4)}`,
    },
    {
      label: "Age^-0.203",
      expression: `${age}^-0.203 = ${fmt(ageTerm, 4)}`,
    },
    {
      label: "Sex factor",
      expression: sex === "female" ? "\u00d7 0.742 (female)" : "\u00d7 1 (male, no adjustment)",
    },
    {
      label: "eGFR",
      expression: `175 \u00d7 ${fmt(scrTerm, 4)} \u00d7 ${fmt(ageTerm, 4)} \u00d7 ${fmt(sexFactor, 3)}`,
      result: `${fmt(egfr)} mL/min/1.73m\u00b2`,
    },
  ];

  return {
    formula: "mdrd",
    formulaName: "MDRD",
    egfr: round(egfr),
    unit: "mL/min/1.73m\u00b2",
    stage: classifyCkdStage(egfr),
    steps,
    notes: [
      "This site reports the MDRD equation without a race/ethnicity coefficient, consistent with the 2021 NKF/ASN recommendation to remove race from GFR estimation. Historical lab reports using this formula before ~2021 may have applied a race adjustment and differ slightly as a result.",
      "MDRD tends to underestimate GFR at values above ~60 mL/min/1.73m\u00b2; CKD-EPI 2021 is preferred for values in the normal-to-mildly-reduced range.",
    ],
  };
}

/**
 * Cockcroft-Gault creatinine clearance. Requires body weight.
 * CrCl = [(140 - Age) x Weight(kg)] / (72 x Scr) x 0.85 [if female]
 * Note: result is creatinine clearance in mL/min, NOT normalized to 1.73m²
 * body surface area, and is NOT interchangeable with eGFR from the other
 * three formulas. It remains widely used for drug-dosing calculations.
 * Source: Cockcroft DW, Gault MH. Nephron. 1976;16:31-41.
 */
export function calculateCockcroftGault(inputs: CalculatorInputs): GfrResult {
  if (inputs.weightKg == null || !Number.isFinite(inputs.weightKg) || inputs.weightKg <= 0) {
    throw new Error("Cockcroft-Gault requires a positive body weight in kg.");
  }
  const scr = toMgDl(inputs.creatinine, inputs.creatinineUnit);
  const { age, sex, weightKg } = inputs;
  const sexFactor = sex === "female" ? 0.85 : 1;

  const numerator = (140 - age) * weightKg;
  const denominator = 72 * scr;
  const crcl = (numerator / denominator) * sexFactor;

  const steps: StepLine[] = [
    {
      label: "Standardize serum creatinine (Scr) to mg/dL",
      expression:
        inputs.creatinineUnit === "mg/dL"
          ? `Scr = ${fmt(inputs.creatinine)} mg/dL`
          : `Scr = ${fmt(inputs.creatinine)} \u00b5mol/L \u00f7 ${MGDL_TO_UMOLL} = ${fmt(scr)} mg/dL`,
    },
    {
      label: "Numerator: (140 - Age) \u00d7 Weight",
      expression: `(140 - ${age}) \u00d7 ${fmt(weightKg)} = ${fmt(numerator)}`,
    },
    {
      label: "Denominator: 72 \u00d7 Scr",
      expression: `72 \u00d7 ${fmt(scr)} = ${fmt(denominator)}`,
    },
    {
      label: "Divide",
      expression: `${fmt(numerator)} \u00f7 ${fmt(denominator)} = ${fmt(numerator / denominator, 3)}`,
    },
    {
      label: "Sex factor",
      expression: sex === "female" ? "\u00d7 0.85 (female)" : "\u00d7 1 (male, no adjustment)",
    },
    {
      label: "CrCl",
      expression: `${fmt(numerator / denominator, 3)} \u00d7 ${sexFactor}`,
      result: `${fmt(crcl)} mL/min`,
    },
  ];

  return {
    formula: "cockcroft-gault",
    formulaName: "Cockcroft-Gault",
    egfr: round(crcl),
    unit: "mL/min",
    stage: classifyCkdStage(crcl),
    steps,
    notes: [
      "Cockcroft-Gault estimates creatinine clearance in mL/min, not mL/min/1.73m\u00b2. It is not body-surface-area normalized and is primarily used for drug dosing, not general CKD staging. The G1\u2013G5 label shown is for reference only and should be interpreted cautiously alongside a normalized eGFR.",
    ],
  };
}

export const FORMULAS: Record<FormulaId, {
  name: string;
  shortName: string;
  requiresWeight: boolean;
  description: string;
  calculate: (inputs: CalculatorInputs) => GfrResult;
}> = {
  "ckd-epi-2021": {
    name: "CKD-EPI 2021 (race-free)",
    shortName: "CKD-EPI 2021",
    requiresWeight: false,
    description: "Current clinical standard recommended by NKF/ASN for eGFR reporting in the United States.",
    calculate: calculateCkdEpi2021,
  },
  "ckd-epi-2009": {
    name: "CKD-EPI 2009 (classic)",
    shortName: "CKD-EPI 2009",
    requiresWeight: false,
    description: "Predecessor to the 2021 equation. Still cited on some older lab reports.",
    calculate: calculateCkdEpi2009,
  },
  mdrd: {
    name: "MDRD",
    shortName: "MDRD",
    requiresWeight: false,
    description: "Older estimating equation, less accurate above ~60 mL/min/1.73m\u00b2. Still referenced by some labs.",
    calculate: calculateMdrd,
  },
  "cockcroft-gault": {
    name: "Cockcroft-Gault",
    shortName: "Cockcroft-Gault",
    requiresWeight: true,
    description: "Estimates creatinine clearance (mL/min) rather than normalized eGFR. Commonly used for drug-dosing calculations rather than general kidney function screening.",
    calculate: calculateCockcroftGault,
  },
};
