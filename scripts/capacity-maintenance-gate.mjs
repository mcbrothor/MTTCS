#!/usr/bin/env node

import { decideCapacityMaintenance } from './lib/capacity-maintenance-gate.mjs';

function readBoolean(name) {
  const value = process.env[name];
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${name} must be true or false.`);
}

const decision = decideCapacityMaintenance({
  eventName: process.env.MTN_MAINTENANCE_EVENT,
  capacityLevel: process.env.MTN_CAPACITY_LEVEL,
  backup: {
    status: process.env.MTN_BACKUP_STATUS,
    fresh: readBoolean('MTN_BACKUP_FRESH'),
    encrypted: readBoolean('MTN_BACKUP_ENCRYPTED'),
    checksumPresent: readBoolean('MTN_BACKUP_CHECKSUM_PRESENT'),
    restoreDrill: readBoolean('MTN_BACKUP_RESTORE_DRILL'),
    rowCountReconciliation: readBoolean('MTN_BACKUP_ROW_RECONCILIATION'),
    criticalQuerySmoke: readBoolean('MTN_BACKUP_CRITICAL_QUERY_SMOKE'),
    offsiteVerified: readBoolean('MTN_BACKUP_OFFSITE_VERIFIED'),
  },
});

process.stdout.write(`auto_apply=${decision.autoApply}\nreason=${decision.reason}\n`);
