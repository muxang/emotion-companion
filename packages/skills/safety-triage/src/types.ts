import type { RiskLevel, SafetyResponse } from '@emotion/shared';

export interface SafetyTriageInput {
  user_text: string;
  detected_risk_level: RiskLevel;
}

export type SafetyTriageOutput = SafetyResponse;
