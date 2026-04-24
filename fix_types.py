
import sys

file_path = r'c:\Users\yerin\OneDrive\바탕 화면\manchul\추세매매\types\index.ts'

with open(file_path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Find the start of the mess
start_idx = -1
for i, line in enumerate(lines):
    if "export interface AiModelInsight {" in line:
        start_idx = i
        break

if start_idx == -1:
    print("Could not find start index")
    sys.exit(1)

# Find the end of the mess
end_idx = -1
for i in range(start_idx, len(lines)):
    if "export interface MasterFilterResponse {" in line: # Use next interface as anchor
        end_idx = i - 1
        break
    line = lines[i]

# If we couldn't find the next interface, search for the '}' of MasterFilterMetrics
if end_idx == -1:
    for i in range(start_idx, len(lines)):
        if "}" in lines[i] and i > start_idx + 10: # Rough heuristic
            end_idx = i
            break

if end_idx == -1:
    print("Could not find end index")
    sys.exit(1)

new_content = """export interface AiModelInsight {
  id: string;
  provider: AiInsightProvider;
  label: string;
  model: string;
  status: 'success' | 'failed' | 'skipped';
  text?: string;
  message?: string;
  selected: boolean;
  priority: number;
  generatedAt: string;
}

export interface MasterFilterMetricDetail {
  value: number | string | null;
  threshold: number | string;
  status: 'PASS' | 'FAIL' | 'WARNING';
  label: string;
  unit: string;
  description: string;
  source: string;
  score?: number;
  weight?: number;
}

export interface MasterFilterMetrics {
  trend: MasterFilterMetricDetail;
  breadth: MasterFilterMetricDetail;
  volatility: MasterFilterMetricDetail;
  ftd: MasterFilterMetricDetail;
  distribution: MasterFilterMetricDetail;
  newHighLow: MasterFilterMetricDetail;
  sectorRotation: MasterFilterMetricDetail;
  score: number;
  p3Score: number;
  regimeHistory?: { date: string; state: MarketState; score: number; reason: string }[];
  meta: DataSourceMeta;
  mainPrice?: number;
  ma50?: number;
  ma150?: number;
  ma200?: number;
  mainHistory?: { date: string; close: number }[];
  movingAverageHistory?: { date: string; ma50: number | null; ma200: number | null }[];
  vixHistory?: { date: string; close: number }[];
  sectorRows?: { symbol: string; name: string; return20: number; riskOn: boolean; rank: number }[];
  ftdReason?: string | null;
  distributionDetails?: { date: string, close: number, volume: number, pctChange: number }[];
  macroData?: Record<string, unknown>;
  updatedAt: string;
}
"""

final_lines = lines[:start_idx] + [new_content + "\n"] + lines[end_idx+1:]

with open(file_path, 'w', encoding='utf-8') as f:
    f.writelines(final_lines)

print("Successfully fixed types/index.ts")
