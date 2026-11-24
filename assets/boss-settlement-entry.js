(() => {
  'use strict';

  const dialog = document.getElementById('boss-settlement-dialog');
  const host = dialog.querySelector('[data-boss-calculator]');
  const context = document.getElementById('boss-settlement-context');
  let opener;

  function open(trigger) {
    if (dialog.open) return;
    opener = trigger;
    const fields = trigger?.closest('.drop-settlement-fields');
    const options = { sale: '', party: 2, transferFee: 5, mode: 'equal' };
    context.textContent = '';
    if (fields) {
      const item = fields.previousElementSibling?.querySelector('b');
      const sale = fields.querySelector('.drop-price').value.replaceAll(',', '');
      const ratio = parseDropRatio(fields.querySelector('.drop-ratio')?.value);
      Object.assign(options, {
        sale,
        party: Number(trigger.dataset.splitParty),
        transferFee: Number(fields.querySelector('.drop-transfer-fee')?.value || 0),
        mode: ratio.leader === ratio.member ? 'equal' : 'weighted',
        leader: Number(ratio.leader),
        member: Number(ratio.member)
      });
      context.textContent = item?.textContent || '선택한 드랍';
      const legacyNote = fields.querySelector('.drop-fee-legacy-note');
      if (legacyNote && !legacyNote.hidden && Number(trigger.dataset.auctionFee) !== 3 && sale) {
        options.recordedAuctionFee = Number(trigger.dataset.auctionFee);
      }
    }
    context.hidden = !context.textContent;
    window.MapleBossSettlement.setPreset(host, options);
    dialog.showModal();
    dialog.scrollTop = 0;
    document.getElementById('boss-settlement-title').focus({preventScroll:true});
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-open-boss-settlement]');
    if (button) open(button);
  });
  dialog.querySelector('[data-close-boss-settlement]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    if (opener?.isConnected && opener.getClientRects().length) opener.focus({preventScroll:true});
    opener = null;
  });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  dialog.querySelector('[data-settlement-ledger]').addEventListener('click', () => {
    opener = null;
    dialog.close();
    window.MapleLedgerPlanner.open('settlement');
  });
  document.addEventListener('maple:account-ledger-changing', () => {
    if (dialog.open) dialog.close();
    context.textContent = '';
  });
  window.MapleBossSettlementEntry = {open};
})();
