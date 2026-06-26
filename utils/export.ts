export function exportToCSV(locks: Lock[], filename: string) {
  const headers = ['Lock ID','Status','Token','Symbol','Amount','Formatted Amount',
    'Unlock Date','Creator','Beneficiary','Vesting','Created At','Withdrawn At','Tx Hash'];
  const rows = locks.map(lock => [
    lock.id, lock.status, lock.tokenAddress, lock.tokenSymbol,
    lock.amountRaw, lock.amountFormatted, lock.unlockDate,
    lock.creator, lock.beneficiary, lock.vesting ?? '',
    lock.createdAt, lock.withdrawnAt ?? '', lock.txHash
  ]);
  const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
  downloadFile(csv, filename, 'text/csv');
}

export function exportToJSON(locks: Lock[], filename: string) {
  downloadFile(JSON.stringify(locks, null, 2), filename, 'application/json');
}

function downloadFile(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// Example filename format:
`stellarlock-my-locks-${new Date().toISOString().slice(0,10)}.csv`