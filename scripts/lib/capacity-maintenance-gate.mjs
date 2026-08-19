const CAPACITY_LEVELS = new Set([
  'NORMAL',
  'WATCH_250',
  'WARNING_350',
  'BLOCK_NONCRITICAL',
]);

const AUTO_APPLY_LEVELS = new Set(['WARNING_350', 'BLOCK_NONCRITICAL']);

export function decideCapacityMaintenance({ eventName, capacityLevel, backup }) {
  if (!CAPACITY_LEVELS.has(capacityLevel)) {
    throw new Error(`Unknown capacity level: ${capacityLevel}`);
  }

  if (eventName !== 'schedule') {
    return { autoApply: false, reason: 'not-a-scheduled-run' };
  }

  if (!AUTO_APPLY_LEVELS.has(capacityLevel)) {
    return { autoApply: false, reason: 'capacity-below-auto-threshold' };
  }

  const backupVerified = backup?.status === 'SUCCESS'
    && backup.fresh === true
    && backup.encrypted === true
    && backup.checksumPresent === true
    && backup.restoreDrill === true
    && backup.rowCountReconciliation === true
    && backup.criticalQuerySmoke === true
    && backup.offsiteVerified === true;

  if (!backupVerified) {
    throw new Error('Automatic retention requires a fresh verified backup.');
  }

  return {
    autoApply: true,
    reason: capacityLevel === 'BLOCK_NONCRITICAL'
      ? 'capacity-blocked-with-verified-backup'
      : 'capacity-warning-with-verified-backup',
  };
}
