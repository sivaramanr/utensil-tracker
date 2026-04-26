/**
 * Module registry for CookERP Mobile.
 *
 * To build a variant APK that omits a module:
 *   1. Set `enabled: false` on the module entry here, OR
 *   2. Override via environment variable in eas.json build profile
 *      and read it here with: `process.env.EXPO_PUBLIC_DISABLE_UTENSIL !== 'true'`
 *
 * Each module exports:  { id, displayName, icon, iconBg, homeScreen, enabled, stacks }
 * where stacks = [{ name, component, options }]
 */

import despatchModule from '../../modules/despatch';
import feedbackModule from '../../modules/feedback';
import utensilModule from '../../modules/utensil';
import wastageModule from '../../modules/wastage';

const MODULE_REGISTRY = [
  utensilModule,
  wastageModule,
  despatchModule,
  feedbackModule,
];

export const enabledModules = MODULE_REGISTRY.filter((m) => m.enabled !== false);
