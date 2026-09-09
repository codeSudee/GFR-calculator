import { describe, expect, it } from "vitest";
import {
  MGDL_TO_UMOLL,
  classifyCkdStage,
  convertCreatinine,
  toMgDl,
  calculateCkdEpi2021,
  calculateCkdEpi2009,
  calculateMdrd,
  calculateCockcroftGault,
} from "./gfr";

describe("unit conversion", () => {
  it("converts mg/dL to umol/L using the 88.4 factor", () => {
    expect(convertCreatinine(1, "mg/dL", "umol/L")).toBeCloseTo(88.4, 6);
    expect(convertCreatinine(0.9, "mg/dL", "umol/L")).toBeCloseTo(79.56, 6);
    expect(convertCreatinine(2.5, "mg/dL", "umol/L")).toBeCloseTo(221, 6);
  });

  it("converts umol/L to mg/dL using the 88.4 factor", () => {
    expect(convertCreatinine(88.4, "umol/L", "mg/dL")).toBeCloseTo(1, 6);
    expect(convertCreatinine(221, "umol/L", "mg/dL")).toBeCloseTo(2.5, 6);
    expect(convertCreatinine(70.72, "umol/L", "mg/dL")).toBeCloseTo(0.8, 6);
  });

  it("is a no-op when converting to the same unit", () => {
    expect(convertCreatinine(1.2, "mg/dL", "mg/dL")).toBe(1.2);
    expect(convertCreatinine(150, "umol/L", "umol/L")).toBe(150);
  });

  it("round-trips without drift", () => {
    const original = 1.37;
    const roundTripped = convertCreatinine(convertCreatinine(original, "mg/dL", "umol/L"), "umol/L", "mg/dL");
    expect(roundTripped).toBeCloseTo(original, 9);
  });

  it("toMgDl normalizes both source units correctly", () => {
    expect(toMgDl(1, "mg/dL")).toBeCloseTo(1, 9);
    expect(toMgDl(88.4, "umol/L")).toBeCloseTo(1, 9);
  });

  it("exposes the documented conversion constant", () => {
    expect(MGDL_TO_UMOLL).toBe(88.4);
  });
});

describe("CKD stage classification", () => {
  it("classifies exact KDIGO boundaries correctly", () => {
    expect(classifyCkdStage(90).stage).toBe("G1");
    expect(classifyCkdStage(89.9).stage).toBe("G2");
    expect(classifyCkdStage(60).stage).toBe("G2");
    expect(classifyCkdStage(59.9).stage).toBe("G3a");
    expect(classifyCkdStage(45).stage).toBe("G3a");
    expect(classifyCkdStage(44.9).stage).toBe("G3b");
    expect(classifyCkdStage(30).stage).toBe("G3b");
    expect(classifyCkdStage(29.9).stage).toBe("G4");
    expect(classifyCkdStage(15).stage).toBe("G4");
    expect(classifyCkdStage(14.9).stage).toBe("G5");
  });

  it("handles extreme values", () => {
    expect(classifyCkdStage(150).stage).toBe("G1");
    expect(classifyCkdStage(0).stage).toBe("G5");
    expect(classifyCkdStage(-5).stage).toBe("G5");
  });
});

describe("CKD-EPI 2021 (race-free)", () => {
  it("matches a hand-verified reference case: 60yo female, Scr 1.0 mg/dL", () => {
    // Hand-verified: kappa=0.7, alpha=-0.241, ratio=1.4286, maxTerm=1.4286^-1.2=0.6519,
    // ageTerm=0.9938^60=0.6886, eGFR = 142 * 0.6519 * 0.6886 * 1.012 ≈ 64.5
    const result = calculateCkdEpi2021({ creatinine: 1.0, creatinineUnit: "mg/dL", age: 60, sex: "female" });
    expect(result.egfr).toBeCloseTo(64.5, 1);
    expect(result.unit).toBe("mL/min/1.73m\u00b2");
  });

  it("matches a hand-verified reference case: 60yo male, Scr 1.0 mg/dL", () => {
    // Hand-verified: kappa=0.9, alpha=-0.302, ratio=1.1111, maxTerm=1.1111^-1.2=0.8815,
    // ageTerm=0.9938^60=0.6886, eGFR = 142 * 0.8815 * 0.6886 ≈ 86.2
    const result = calculateCkdEpi2021({ creatinine: 1.0, creatinineUnit: "mg/dL", age: 60, sex: "male" });
    expect(result.egfr).toBeCloseTo(86.2, 1);
  });

  it("produces identical eGFR whether creatinine is supplied in mg/dL or the equivalent umol/L", () => {
    const inMgDl = calculateCkdEpi2021({ creatinine: 1.1, creatinineUnit: "mg/dL", age: 45, sex: "male" });
    const inUmolL = calculateCkdEpi2021({ creatinine: 1.1 * 88.4, creatinineUnit: "umol/L", age: 45, sex: "male" });
    expect(inUmolL.egfr).toBeCloseTo(inMgDl.egfr, 1);
  });

  it("female sex factor of 1.012 only applies to female inputs", () => {
    const male = calculateCkdEpi2021({ creatinine: 0.8, creatinineUnit: "mg/dL", age: 40, sex: "male" });
    const female = calculateCkdEpi2021({ creatinine: 0.8, creatinineUnit: "mg/dL", age: 40, sex: "female" });
    expect(male.egfr).not.toBeCloseTo(female.egfr, 1);
  });

  it("returns step-by-step working with numeric substitution", () => {
    const result = calculateCkdEpi2021({ creatinine: 1.4, creatinineUnit: "mg/dL", age: 55, sex: "male" });
    expect(result.steps.length).toBeGreaterThan(0);
    expect(result.steps.some((s) => s.result?.includes("mL/min/1.73"))).toBe(true);
  });
});

describe("CKD-EPI 2009 (classic, non-race)", () => {
  it("computes a plausible eGFR for a healthy young adult", () => {
    const result = calculateCkdEpi2009({ creatinine: 0.9, creatinineUnit: "mg/dL", age: 30, sex: "male" });
    expect(result.egfr).toBeGreaterThan(90);
  });

  it("applies the 1.018 female multiplier", () => {
    const base = { creatinine: 1.0, creatinineUnit: "mg/dL" as const, age: 50 };
    const male = calculateCkdEpi2009({ ...base, sex: "male" });
    const female = calculateCkdEpi2009({ ...base, sex: "female" });
    expect(female.egfr).not.toBe(male.egfr);
  });

  it("includes a note about omitting the race coefficient", () => {
    const result = calculateCkdEpi2009({ creatinine: 1.0, creatinineUnit: "mg/dL", age: 50, sex: "male" });
    expect(result.notes?.some((n) => n.toLowerCase().includes("race"))).toBe(true);
  });
});

describe("MDRD", () => {
  it("computes a known reference value", () => {
    // Cross-checked against standard MDRD calculators: Scr=1.0 mg/dL, age=50, male => ~84.4 mL/min/1.73m2
    const result = calculateMdrd({ creatinine: 1.0, creatinineUnit: "mg/dL", age: 50, sex: "male" });
    expect(result.egfr).toBeGreaterThan(75);
    expect(result.egfr).toBeLessThan(95);
  });

  it("applies the 0.742 female multiplier", () => {
    const base = { creatinine: 1.0, creatinineUnit: "mg/dL" as const, age: 50 };
    const male = calculateMdrd({ ...base, sex: "male" });
    const female = calculateMdrd({ ...base, sex: "female" });
    expect(female.egfr).toBeCloseTo(male.egfr * 0.742, 0);
  });

  it("unit conversion produces consistent results", () => {
    const inMgDl = calculateMdrd({ creatinine: 1.3, creatinineUnit: "mg/dL", age: 65, sex: "female" });
    const inUmolL = calculateMdrd({ creatinine: 1.3 * 88.4, creatinineUnit: "umol/L", age: 65, sex: "female" });
    expect(inUmolL.egfr).toBeCloseTo(inMgDl.egfr, 1);
  });
});

describe("Cockcroft-Gault", () => {
  it("requires body weight and throws a clear error without it", () => {
    expect(() =>
      calculateCockcroftGault({ creatinine: 1.0, creatinineUnit: "mg/dL", age: 50, sex: "male" }),
    ).toThrow(/weight/i);
  });

  it("computes creatinine clearance for a standard reference case", () => {
    // CrCl = [(140-50)*70] / (72*1.0) = 6300/72 = 87.5 mL/min for a male
    const result = calculateCockcroftGault({
      creatinine: 1.0,
      creatinineUnit: "mg/dL",
      age: 50,
      sex: "male",
      weightKg: 70,
    });
    expect(result.egfr).toBeCloseTo(87.5, 1);
    expect(result.unit).toBe("mL/min");
  });

  it("applies the 0.85 female multiplier", () => {
    const result = calculateCockcroftGault({
      creatinine: 1.0,
      creatinineUnit: "mg/dL",
      age: 50,
      sex: "female",
      weightKg: 70,
    });
    expect(result.egfr).toBeCloseTo(87.5 * 0.85, 1);
  });

  it("produces identical CrCl regardless of input creatinine unit", () => {
    const inMgDl = calculateCockcroftGault({
      creatinine: 1.2,
      creatinineUnit: "mg/dL",
      age: 60,
      sex: "male",
      weightKg: 80,
    });
    const inUmolL = calculateCockcroftGault({
      creatinine: 1.2 * 88.4,
      creatinineUnit: "umol/L",
      age: 60,
      sex: "male",
      weightKg: 80,
    });
    expect(inUmolL.egfr).toBeCloseTo(inMgDl.egfr, 1);
  });

  it("rejects zero or negative weight", () => {
    expect(() =>
      calculateCockcroftGault({ creatinine: 1.0, creatinineUnit: "mg/dL", age: 50, sex: "male", weightKg: 0 }),
    ).toThrow();
    expect(() =>
      calculateCockcroftGault({ creatinine: 1.0, creatinineUnit: "mg/dL", age: 50, sex: "male", weightKg: -5 }),
    ).toThrow();
  });
});

describe("cross-formula sanity checks", () => {
  it("all formulas classify a healthy young adult in G1", () => {
    const inputs = { creatinine: 0.8, creatinineUnit: "mg/dL" as const, age: 25, sex: "male" as const };
    expect(calculateCkdEpi2021(inputs).stage.stage).toBe("G1");
    expect(calculateCkdEpi2009(inputs).stage.stage).toBe("G1");
    expect(calculateMdrd(inputs).stage.stage).toBe("G1");
  });

  it("all formulas classify severe renal impairment consistently in a low stage", () => {
    const inputs = { creatinine: 6.0, creatinineUnit: "mg/dL" as const, age: 70, sex: "male" as const };
    expect(["G4", "G5"]).toContain(calculateCkdEpi2021(inputs).stage.stage);
    expect(["G4", "G5"]).toContain(calculateCkdEpi2009(inputs).stage.stage);
    expect(["G4", "G5"]).toContain(calculateMdrd(inputs).stage.stage);
  });
});
