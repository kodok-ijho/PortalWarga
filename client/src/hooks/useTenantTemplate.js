import { useMemo } from 'react';
import { useTenant } from './useTenant';
import { getTenantTemplate, DEFAULT_TEMPLATE } from '../config/tenantTemplates';

/**
 * Hook untuk mendapatkan istilah UI dan kapabilitas fitur secara dinamis sesuai tipe tenant aktif.
 * Ref: task.md T2.5, specification.md §7
 *
 * @param {string} [overrideType] - Opsional, untuk melihat template tipe lain
 * @returns {object} Template istilah UI dan fitur pendukung
 */
export function useTenantTemplate(overrideType) {
  const { tenantType } = useTenant();
  const effectiveType = overrideType || tenantType;

  const template = useMemo(() => {
    return getTenantTemplate(effectiveType);
  }, [effectiveType]);

  return template || DEFAULT_TEMPLATE;
}

export { TENANT_TEMPLATES, getTenantTemplate, DEFAULT_TEMPLATE } from '../config/tenantTemplates';
