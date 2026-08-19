import assert from 'node:assert/strict';

import { decideCapacityMaintenance } from '../scripts/lib/capacity-maintenance-gate.mjs';

const verifiedBackup = {
  status: 'SUCCESS',
  fresh: true,
  encrypted: true,
  checksumPresent: true,
  restoreDrill: true,
  rowCountReconciliation: true,
  criticalQuerySmoke: true,
  offsiteVerified: true,
};

assert.deepEqual(
  decideCapacityMaintenance({
    eventName: 'schedule',
    capacityLevel: 'WARNING_350',
    backup: verifiedBackup,
  }),
  { autoApply: true, reason: 'capacity-warning-with-verified-backup' },
);

assert.deepEqual(
  decideCapacityMaintenance({
    eventName: 'schedule',
    capacityLevel: 'BLOCK_NONCRITICAL',
    backup: verifiedBackup,
  }),
  { autoApply: true, reason: 'capacity-blocked-with-verified-backup' },
);

for (const capacityLevel of ['NORMAL', 'WATCH_250']) {
  assert.deepEqual(
    decideCapacityMaintenance({
      eventName: 'schedule',
      capacityLevel,
      backup: verifiedBackup,
    }),
    { autoApply: false, reason: 'capacity-below-auto-threshold' },
  );
}

for (const unsafeBackup of [
  { ...verifiedBackup, status: 'FAILED' },
  { ...verifiedBackup, fresh: false },
  { ...verifiedBackup, encrypted: false },
  { ...verifiedBackup, checksumPresent: false },
  { ...verifiedBackup, restoreDrill: false },
  { ...verifiedBackup, rowCountReconciliation: false },
  { ...verifiedBackup, criticalQuerySmoke: false },
  { ...verifiedBackup, offsiteVerified: false },
]) {
  assert.throws(
    () => decideCapacityMaintenance({
      eventName: 'schedule',
      capacityLevel: 'WARNING_350',
      backup: unsafeBackup,
    }),
    /verified backup/i,
  );
}

assert.deepEqual(
  decideCapacityMaintenance({
    eventName: 'workflow_dispatch',
    capacityLevel: 'BLOCK_NONCRITICAL',
    backup: verifiedBackup,
  }),
  { autoApply: false, reason: 'not-a-scheduled-run' },
);

assert.throws(
  () => decideCapacityMaintenance({
    eventName: 'schedule',
    capacityLevel: 'UNKNOWN',
    backup: verifiedBackup,
  }),
  /capacity level/i,
);

console.log('capacity maintenance gate tests passed');
