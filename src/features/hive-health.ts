/**
 * Hive Health — Monitor managed honeybee colony health using sensor data.
 * @module hive-health
 * @license GPL-3.0
 * @author OliWoods Foundation
 */
import { z } from 'zod';

export const HiveSensorDataSchema = z.object({
  hiveId: z.string(), timestamp: z.string().datetime(),
  internalTemp: z.number(), externalTemp: z.number(), humidity: z.number(),
  weight: z.number(), soundLevel: z.number(), // dB
  soundFrequencyPeak: z.number(), // Hz
  beeCountIn: z.number().int().nonnegative().optional(),
  beeCountOut: z.number().int().nonnegative().optional(),
});

export const HiveHealthAssessmentSchema = z.object({
  hiveId: z.string(), assessmentDate: z.string().datetime(),
  overallHealth: z.enum(['excellent', 'good', 'fair', 'poor', 'critical']),
  indicators: z.array(z.object({ name: z.string(), value: z.number(), status: z.enum(['normal', 'warning', 'alert']), details: z.string() })),
  alerts: z.array(z.string()),
  recommendations: z.array(z.string()),
  queenStatus: z.enum(['present', 'possibly-absent', 'unknown']),
  swarmRisk: z.enum(['low', 'moderate', 'high']),
});

export const ColonyLossRiskSchema = z.object({
  hiveId: z.string(), riskScore: z.number().min(0).max(100),
  riskLevel: z.enum(['low', 'moderate', 'high', 'critical']),
  factors: z.array(z.object({ factor: z.string(), contribution: z.number() })),
  seasonalContext: z.string(),
});

export type HiveSensorData = z.infer<typeof HiveSensorDataSchema>;
export type HiveHealthAssessment = z.infer<typeof HiveHealthAssessmentSchema>;
export type ColonyLossRisk = z.infer<typeof ColonyLossRiskSchema>;

export function assessHiveHealth(readings: HiveSensorData[]): HiveHealthAssessment {
  if (readings.length === 0) return defaultAssessment();
  const latest = readings.sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
  const indicators: HiveHealthAssessment['indicators'] = [];
  const alerts: string[] = [];
  const recs: string[] = [];
  // Temperature (brood nest should be 34-36C)
  const tempStatus = latest.internalTemp >= 33 && latest.internalTemp <= 37 ? 'normal' : latest.internalTemp >= 30 && latest.internalTemp <= 39 ? 'warning' : 'alert';
  indicators.push({ name: 'Internal Temperature', value: latest.internalTemp, status: tempStatus, details: tempStatus === 'normal' ? 'Brood nest temperature optimal (34-36C)' : `Temperature ${latest.internalTemp}C is outside optimal brood range` });
  if (tempStatus === 'alert') alerts.push(`ALERT: Internal temperature ${latest.internalTemp}C — possible queen loss or colony collapse`);
  // Humidity (50-70% ideal)
  const humStatus = latest.humidity >= 45 && latest.humidity <= 75 ? 'normal' : 'warning';
  indicators.push({ name: 'Humidity', value: latest.humidity, status: humStatus, details: humStatus === 'normal' ? 'Humidity within acceptable range' : `Humidity ${latest.humidity}% — may affect brood development` });
  // Weight trends
  const weights = readings.map(r => r.weight);
  const weightTrend = weights.length >= 2 ? weights[0] - weights[weights.length - 1] : 0;
  const weightStatus = weightTrend > -0.5 ? 'normal' : weightTrend > -2 ? 'warning' : 'alert';
  indicators.push({ name: 'Weight Trend', value: Math.round(weightTrend * 100) / 100, status: weightStatus, details: weightTrend > 0 ? `Gaining ${weightTrend.toFixed(1)}kg — foraging active` : `Lost ${Math.abs(weightTrend).toFixed(1)}kg — monitor food stores` });
  if (weightStatus === 'alert') alerts.push('ALERT: Significant weight loss — check food stores, consider emergency feeding');
  // Sound analysis (queen presence indicator)
  const queenPiping = latest.soundFrequencyPeak >= 400 && latest.soundFrequencyPeak <= 500;
  const queenStatus: HiveHealthAssessment['queenStatus'] = tempStatus === 'normal' ? 'present' : queenPiping ? 'possibly-absent' : 'unknown';
  // Swarm risk
  const swarmRisk: HiveHealthAssessment['swarmRisk'] = latest.internalTemp > 37 && latest.soundLevel > 70 ? 'high' : latest.soundLevel > 65 ? 'moderate' : 'low';
  if (swarmRisk === 'high') alerts.push('HIGH SWARM RISK: Elevated temperature and sound levels suggest swarming preparation');
  // Overall
  const alertCount = indicators.filter(i => i.status === 'alert').length;
  const warningCount = indicators.filter(i => i.status === 'warning').length;
  const overall: HiveHealthAssessment['overallHealth'] = alertCount >= 2 ? 'critical' : alertCount >= 1 ? 'poor' : warningCount >= 2 ? 'fair' : warningCount >= 1 ? 'good' : 'excellent';
  recs.push('Continue regular monitoring', 'Inspect hive within 1 week if any warnings present');
  if (weightStatus !== 'normal') recs.push('Check food stores and consider supplemental feeding');
  return HiveHealthAssessmentSchema.parse({
    hiveId: latest.hiveId, assessmentDate: new Date().toISOString(), overallHealth: overall,
    indicators, alerts, recommendations: recs, queenStatus, swarmRisk,
  });
}

export function predictColonyLossRisk(readings: HiveSensorData[], month: number): ColonyLossRisk {
  const assessment = assessHiveHealth(readings);
  const factors: Array<{ factor: string; contribution: number }> = [];
  let risk = 0;
  // Winter months
  if (month >= 11 || month <= 2) { risk += 20; factors.push({ factor: 'Winter season', contribution: 20 }); }
  if (assessment.overallHealth === 'poor' || assessment.overallHealth === 'critical') { risk += 30; factors.push({ factor: 'Poor hive health', contribution: 30 }); }
  if (assessment.queenStatus === 'possibly-absent') { risk += 25; factors.push({ factor: 'Possible queenlessness', contribution: 25 }); }
  const latestWeight = readings[0]?.weight || 0;
  if (latestWeight < 20 && (month >= 11 || month <= 2)) { risk += 20; factors.push({ factor: 'Low weight entering winter', contribution: 20 }); }
  risk = Math.min(100, risk);
  const seasonalContext = month >= 3 && month <= 5 ? 'Spring buildup — monitor for swarms and ensure adequate food'
    : month >= 6 && month <= 8 ? 'Summer — peak foraging season, watch for varroa mites'
    : month >= 9 && month <= 10 ? 'Fall — prepare for winter, treat for mites, ensure adequate stores'
    : 'Winter — minimize hive disturbance, ensure ventilation, monitor weight';
  return ColonyLossRiskSchema.parse({
    hiveId: readings[0]?.hiveId || '', riskScore: risk,
    riskLevel: risk >= 70 ? 'critical' : risk >= 45 ? 'high' : risk >= 20 ? 'moderate' : 'low',
    factors, seasonalContext,
  });
}

function defaultAssessment(): HiveHealthAssessment {
  return HiveHealthAssessmentSchema.parse({
    hiveId: '', assessmentDate: new Date().toISOString(), overallHealth: 'good',
    indicators: [], alerts: ['No sensor data available'], recommendations: ['Install or check sensors'],
    queenStatus: 'unknown', swarmRisk: 'low',
  });
}
