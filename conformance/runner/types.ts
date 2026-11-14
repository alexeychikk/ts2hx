export type Target = 'js' | 'cs' | 'cpp';

export const ALL_TARGETS: readonly Target[] = ['js', 'cs', 'cpp'];

export interface ConformanceCase {
  /** `<area>/<name>`, the key used in `expectations.json` and on the CLI. */
  id: string;
  /** Haxe package the converter must emit the case into, e.g. `cases.basics.hello`. */
  rootPackage: string;
  /** Directory holding the case sources (the case folder, or the area folder of a single-file case). */
  caseDir: string;
  entry: string;
  files: string[];
  /** Targets from a `// @targets:` header; every target when absent. */
  targets: Target[];
}

export interface ConverterInput {
  caseId: string;
  caseDir: string;
  entry: string;
  files: string[];
  /** Haxe class path root: the converter writes `<outDir>/src/<rootPackage as dirs>/Main.hx`. */
  outDir: string;
  rootPackage: string;
}

/** Turns one case into Haxe; throws when the case cannot be converted. */
export type Converter = (input: ConverterInput) => Promise<void>;

export interface ProgramOutput {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
}

export type CaseStatus = 'pass' | 'fail' | 'skip';

export interface CaseResult {
  caseId: string;
  target: Target;
  status: CaseStatus;
  reason?: string;
  expected?: ProgramOutput;
  actual?: ProgramOutput;
}

export type Outcome = 'PASS' | 'XFAIL' | 'FAIL' | 'XPASS' | 'SKIP';

export interface EvaluatedResult extends CaseResult {
  outcome: Outcome;
}

export type ExpectationEntry = Partial<Record<Target, 'fail'>>;
export type Expectations = Record<string, ExpectationEntry>;
