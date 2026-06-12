import { describe, expect, it } from 'vitest';
import { inferPublicationTypeFromPath } from '../../services/documentTypeResolver';

describe('inferPublicationTypeFromPath', () => {
  it('routes IPC / parts catalogs to parts_catalog', () => {
    expect(inferPublicationTypeFromPath('manuals/cessna-208b/ipc.pdf')).toBe('parts_catalog');
    expect(inferPublicationTypeFromPath('208B_IPC_Rev12.pdf')).toBe('parts_catalog');
    expect(inferPublicationTypeFromPath('Illustrated Parts Catalog.pdf')).toBe('parts_catalog');
    expect(inferPublicationTypeFromPath('pw127 illustrated-parts-list.pdf')).toBe('parts_catalog');
    expect(inferPublicationTypeFromPath('parts catalogue 2024.pdf')).toBe('parts_catalog');
    expect(inferPublicationTypeFromPath('PartsManual.pdf')).toBe(undefined); // no separator → no signal
  });

  it('routes maintenance manuals (MM/AMM/GMM/CMM/SRM) to maintenance_manual', () => {
    expect(inferPublicationTypeFromPath('208B_MM_Rev5.pdf')).toBe('maintenance_manual');
    expect(inferPublicationTypeFromPath('caravan-amm-ch05.pdf')).toBe('maintenance_manual');
    expect(inferPublicationTypeFromPath('Company GMM 2026.pdf')).toBe('maintenance_manual');
    expect(inferPublicationTypeFromPath('starter-generator CMM.pdf')).toBe('maintenance_manual');
    expect(inferPublicationTypeFromPath('Maintenance Manual Vol 1.pdf')).toBe('maintenance_manual');
    expect(inferPublicationTypeFromPath('srm/57-10-00.pdf')).toBe('maintenance_manual');
    expect(inferPublicationTypeFromPath('overhaul manual tcm io-550.pdf')).toBe('maintenance_manual');
  });

  it('routes logbooks to logbook_scan', () => {
    expect(inferPublicationTypeFromPath('N123AB airframe log 2019.pdf')).toBe('logbook_scan');
    expect(inferPublicationTypeFromPath('engine-logbook-scan.pdf')).toBe('logbook_scan');
    expect(inferPublicationTypeFromPath('prop log.pdf')).toBe('logbook_scan');
  });

  it('does not confuse "catalog" with "log" or 8mm with MM', () => {
    expect(inferPublicationTypeFromPath('parts catalog.pdf')).toBe('parts_catalog');
    expect(inferPublicationTypeFromPath('8mm fastener spec.pdf')).toBe(undefined);
  });

  it('returns undefined when the name gives no signal (caller falls back to the tab)', () => {
    expect(inferPublicationTypeFromPath('manuals/cessna-208b/05-10-00.pdf')).toBe(undefined);
    expect(inferPublicationTypeFromPath('chapter-32-landing-gear.pdf')).toBe(undefined);
  });
});
