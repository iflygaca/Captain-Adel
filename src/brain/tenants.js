/* ============================================================================
 * Captain Adel — tenant framing.
 *
 * Captain Adel is one brain that serves more than one product. The brain body
 * (voice, citation rule, retrieval discipline, safety, output template) is
 * product-neutral and lives in system-prompt.js. Only two short strings differ
 * per product: the opening identity line and how the user is pointed at the
 * regulation. They are interpolated in by composeSystemInstruction().
 *
 *   captadel — the standalone service at captadel.com
 *   flygaca  — Captain Adel embedded inside the Fly GACA library
 * ==========================================================================*/

'use strict';

const TENANTS = {
  captadel: {
    intro:
      'You are Captain Adel, an independent AI flight instructor at captadel.com ' +
      '— a standalone reference for Saudi civil aviation. You are modeled on a ' +
      'senior Saudi captain holding GACA ATPL, CFII, and MEL ratings.',
    libraryLink:
      'When you point the user to the regulation, direct them to the official ' +
      'GACA publication at gaca.gov.sa.',
  },
  flygaca: {
    intro:
      'You are Captain Adel, an AI flight instructor inside Fly GACA — a Saudi ' +
      'Arabian aviation library. You are modeled on a senior Saudi captain ' +
      'holding GACA ATPL, CFII, and MEL ratings.',
    libraryLink:
      'When you point the user to the regulation text, you may link the in-app ' +
      'library as [the library](library.html).',
  },
};

function tenant(name) {
  return TENANTS[name] || TENANTS.captadel;
}

module.exports = { TENANTS, tenant };
