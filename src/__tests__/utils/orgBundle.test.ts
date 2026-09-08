import { describe, expect, it } from 'vitest';
import {
  ORG_BUNDLE_VERSION,
  parseOrgBundle,
  orgBundleFilename,
  type OrgBundle,
} from '../../utils/orgBundle';

describe('parseOrgBundle', () => {
  const minimal: OrgBundle = {
    version: ORG_BUNDLE_VERSION,
    exportedAt: '2026-09-03T00:00:00.000Z',
    scope: {
      includes: [
        'company',
        'entityProfiles',
        'certificateProfiles',
        'classRatings',
        'capabilities',
        'opSpecs',
        'limitedRatings',
        'rosterPersonnel',
        'rosterRequirementTypes',
        'rosterAssignments',
      ],
      excludes: ['billing', 'memberships', 'projects', 'manuals', 'logbooks', 'fleet'],
    },
    company: { name: 'Acme Aviation', slug: 'acme-aviation' },
  };

  it('accepts a valid minimal bundle', () => {
    const result = parseOrgBundle(minimal);
    expect(result.company.name).toBe('Acme Aviation');
    expect(result.version).toBe(ORG_BUNDLE_VERSION);
  });

  it('rejects null input', () => {
    expect(() => parseOrgBundle(null)).toThrow('not a valid AeroGap organization bundle');
  });

  it('rejects wrong version', () => {
    expect(() => parseOrgBundle({ ...minimal, version: '99.0.0' })).toThrow(
      'Unsupported bundle version',
    );
  });

  it('rejects missing company name', () => {
    expect(() => parseOrgBundle({ ...minimal, company: { name: '' } })).toThrow(
      'missing a company name',
    );
  });

  it('parses a bundle with entity profiles', () => {
    const bundle: OrgBundle = {
      ...minimal,
      entityProfiles: [
        {
          _exportKey: 'ABCR123',
          companyName: 'Acme Aviation',
          faaCertificateNumber: 'ABCR123',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      ],
    };
    const result = parseOrgBundle(bundle);
    expect(result.entityProfiles).toHaveLength(1);
    expect(result.entityProfiles![0]._exportKey).toBe('ABCR123');
  });

  it('parses a bundle with roster personnel', () => {
    const bundle: OrgBundle = {
      ...minimal,
      rosterPersonnel: [
        {
          _exportKey: 'EMP001|Jane Doe',
          fullName: 'Jane Doe',
          employeeId: 'EMP001',
          roleTitle: 'Inspector',
          capabilities: ['NDT', 'Welding'],
          isActive: true,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
        {
          _exportKey: 'EMP002|John Smith',
          fullName: 'John Smith',
          employeeId: 'EMP002',
          reportsToKey: 'EMP001|Jane Doe',
          capabilities: ['Avionics'],
          isActive: true,
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
        },
      ],
    };
    const result = parseOrgBundle(bundle);
    expect(result.rosterPersonnel).toHaveLength(2);
    expect(result.rosterPersonnel![1].reportsToKey).toBe('EMP001|Jane Doe');
  });

  it('parses assignments with key references', () => {
    const bundle: OrgBundle = {
      ...minimal,
      rosterAssignments: [
        {
          personKey: 'EMP001|Jane Doe',
          requirementTypeKey: 'NDT Level II|training',
          assignedDate: '2026-01-15',
          dueDate: '2027-01-15',
          createdAt: '2026-01-15T00:00:00Z',
          updatedAt: '2026-01-15T00:00:00Z',
        },
      ],
    };
    const result = parseOrgBundle(bundle);
    expect(result.rosterAssignments).toHaveLength(1);
    expect(result.rosterAssignments![0].personKey).toBe('EMP001|Jane Doe');
  });
});

describe('orgBundleFilename', () => {
  it('generates a slug-based filename', () => {
    const name = orgBundleFilename('Acme Aviation Services');
    expect(name).toMatch(/^acme-aviation-services-\d{4}-\d{2}-\d{2}\.aqo\.json$/);
  });

  it('handles empty name', () => {
    const name = orgBundleFilename('');
    expect(name).toMatch(/^organization-\d{4}-\d{2}-\d{2}\.aqo\.json$/);
  });

  it('truncates long names', () => {
    const longName = 'A'.repeat(100);
    const name = orgBundleFilename(longName);
    const slug = name.split('-')[0];
    expect(slug.length).toBeLessThanOrEqual(48);
  });
});
