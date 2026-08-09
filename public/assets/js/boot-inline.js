import { startProCheckout } from './billing.js';
document.querySelectorAll('#pricing [data-plan]').forEach((btn) => {
  btn.addEventListener('click', () => startProCheckout(btn.dataset.plan));
});
