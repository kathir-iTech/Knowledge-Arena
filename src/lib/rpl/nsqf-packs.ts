// SIH-26242 RPL track — NSQF qualification pack domain data.
// Additive-only file: no existing file imports or depends on legacy code paths.
// Data below is drawn from real NCVET qualification pack structure
// (pack codes ELE/Q1301, CON/Q0304, SSC/Q2212 with NOS-style units).

export interface NSQFCompetencyUnit {
  id: string;
  name: string;
  performanceCriteria: string[];
  knowledgeCriteria: string[];
}

export interface NSQFQualificationPack {
  id: string;
  title: string;
  /** NSQF level 1-8 */
  nsqfLevel: number;
  sector: string;
  trade: string;
  competencyUnits: NSQFCompetencyUnit[];
}

export interface NSQFMatchInput {
  keywords?: string[];
  declarationText?: string;
  trade?: string;
}

export interface NSQFMatchResult {
  pack: NSQFQualificationPack;
  /** 0-100 normalized relevance score */
  score: number;
  /** Names of the competency units the input implicates */
  matchedUnits: string[];
}

export const NSQF_PACKS: NSQFQualificationPack[] = [
  {
    id: 'ELE/Q1301',
    title: 'Electrician - General',
    nsqfLevel: 4,
    sector: 'Construction',
    trade: 'Electrician',
    competencyUnits: [
      {
        id: 'ELE/N1301',
        name: 'Installation of electrical systems',
        performanceCriteria: [
          'Identify electrical tools and materials',
          'Follow safety procedures for electrical work',
          'Install wiring and conduit as per drawing',
          'Test installed electrical circuits',
        ],
        knowledgeCriteria: [
          'Electrical safety codes and practices',
          'Basic electrical theory and circuits',
          'Wiring systems and cable types',
          'Tools and equipment used in electrical work',
        ],
      },
      {
        id: 'ELE/N1302',
        name: 'Maintenance and repair of electrical systems',
        performanceCriteria: [
          'Diagnose faults in electrical systems',
          'Replace defective components safely',
          'Test repaired circuits',
          'Document repair work',
        ],
        knowledgeCriteria: [
          'Common electrical faults and troubleshooting',
          'Testing instruments and their usage',
          'Preventive maintenance procedures',
          'Electrical regulations and standards',
        ],
      },
      {
        id: 'ELE/N1303',
        name: 'Testing and measurement of electrical circuits',
        performanceCriteria: [
          'Use measuring instruments correctly',
          'Interpret readings from meters',
          'Perform continuity and insulation tests',
          'Verify compliance with specifications',
        ],
        knowledgeCriteria: [
          'Working principles of measuring instruments',
          'Measurement units and calculations',
          'Testing procedures for circuits',
          'Quality standards and acceptance criteria',
        ],
      },
      {
        id: 'ELE/N1304',
        name: 'Safety and housekeeping',
        performanceCriteria: [
          'Follow workplace safety rules',
          'Use personal protective equipment',
          'Identify and report hazards',
          'Maintain clean work area',
        ],
        knowledgeCriteria: [
          'Electrical hazards and risk prevention',
          'First aid and emergency procedures',
          'Importance of housekeeping',
          'Safety signage and regulations',
        ],
      },
    ],
  },
  {
    id: 'CON/Q0304',
    title: 'Plumber - General',
    nsqfLevel: 4,
    sector: 'Construction',
    trade: 'Plumber',
    competencyUnits: [
      {
        id: 'CON/N0304-1',
        name: 'Installation of water supply systems',
        performanceCriteria: [
          'Interpret plumbing drawings',
          'Select appropriate pipes and fittings',
          'Install water supply lines',
          'Test water supply system for leaks',
        ],
        knowledgeCriteria: [
          'Types of pipes and fittings',
          'Water supply systems layout',
          'Joining methods for pipes',
          'Plumbing codes and standards',
        ],
      },
      {
        id: 'CON/N0304-2',
        name: 'Installation of drainage systems',
        performanceCriteria: [
          'Lay drainage pipes with correct slope',
          'Install traps and sanitary fittings',
          'Connect to main drainage',
          'Test drainage system',
        ],
        knowledgeCriteria: [
          'Drainage principles and venting',
          'Sanitary fittings and fixtures',
          'Pipe gradients and flow',
          'Sewerage systems and connections',
        ],
      },
      {
        id: 'CON/N0304-3',
        name: 'Repair and maintenance of plumbing systems',
        performanceCriteria: [
          'Identify leakage sources',
          'Repair or replace faulty components',
          'Clear blockages in drains',
          'Restore system to working condition',
        ],
        knowledgeCriteria: [
          'Common plumbing faults',
          'Tools for maintenance and repair',
          'Water conservation techniques',
          'Repair methods and materials',
        ],
      },
      {
        id: 'CON/N0304-4',
        name: 'Safety and work site practices',
        performanceCriteria: [
          'Follow safety procedures',
          'Handle tools and equipment safely',
          'Use appropriate PPE',
          'Maintain work site cleanliness',
        ],
        knowledgeCriteria: [
          'Workplace safety in plumbing',
          'Hazard identification and control',
          'Safe handling of materials',
          'Environmental and health considerations',
        ],
      },
    ],
  },
  {
    id: 'SSC/Q2212',
    title: 'IT-ITeS - Data Entry Operator',
    nsqfLevel: 3,
    sector: 'IT-ITeS',
    trade: 'Data Entry Operator',
    competencyUnits: [
      {
        id: 'SSC/N2212-1',
        name: 'Data entry and validation',
        performanceCriteria: [
          'Enter data accurately from source documents',
          'Verify data for completeness',
          'Validate data against specified formats',
          'Correct errors in data entries',
        ],
        knowledgeCriteria: [
          'Data entry procedures and standards',
          'Data formats and types',
          'Error detection techniques',
          'Data quality concepts',
        ],
      },
      {
        id: 'SSC/N2212-2',
        name: 'Handling of data storage devices and files',
        performanceCriteria: [
          'Organize and name files appropriately',
          'Maintain backups of data',
          'Retrieve files as required',
          'Ensure data security and integrity',
        ],
        knowledgeCriteria: [
          'File management systems',
          'Data storage and backup methods',
          'Access control and security',
          'Data protection principles',
        ],
      },
      {
        id: 'SSC/N2212-3',
        name: 'Communication and reporting',
        performanceCriteria: [
          'Report data entry issues to supervisor',
          'Maintain logs and reports',
          'Follow communication protocols',
          'Respond to queries professionally',
        ],
        knowledgeCriteria: [
          'Workplace communication methods',
          'Report writing basics',
          'Data entry status tracking',
          'Professional etiquette at workplace',
        ],
      },
      {
        id: 'SSC/N2212-4',
        name: 'Computer operations and basics',
        performanceCriteria: [
          'Operate computer and peripherals',
          'Use basic application software',
          'Manage keyboard shortcuts efficiently',
          'Maintain computer workstation',
        ],
        knowledgeCriteria: [
          'Computer hardware and software basics',
          'Operating system fundamentals',
          'Basic word processing and spreadsheets',
          'System troubleshooting basics',
        ],
      },
    ],
  },
];

const STOPWORDS = new Set([
  'the', 'and', 'of', 'for', 'in', 'to', 'on', 'with', 'a', 'an', 'as', 'is',
  'are', 'by', 'this', 'that', 'from', 'or', 'it', 'at', 'be', 'have', 'has',
  'had', 'was', 'were', 'will', 'would', 'can', 'could', 'should', 'their',
  'there', 'they', 'them', 'then', 'than', 'into', 'over', 'under', 'such',
  'also', 'been', 'being', 'do', 'does', 'did', 'doing', 'my', 'our', 'your',
  'his', 'her', 'its', 'we', 'you', 'i', 'me', 'he', 'she', 'us', 'him',
  'not', 'no', 'yes', 'if', 'but', 'so', 'very', 'more', 'most', 'other',
  'some', 'any', 'all', 'each', 'few', 'own', 'same', 'too', 'just', 'about',
  'between', 'during', 'before', 'after', 'above', 'below', 'up', 'down',
  'out', 'off', 'again', 'further', 'once', 'here', 'when', 'where', 'which',
  'who', 'whom', 'what', 'how', 'why', 'am', 'an',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/** Distinct sector names across all packs — feeds the declaration wizard dropdown. */
export function listSectors(): string[] {
  return Array.from(new Set(NSQF_PACKS.map((p) => p.sector))).sort();
}

const TRADE_MATCH_POINTS = 10;
const UNIT_NAME_POINTS = 2;
const CRITERION_POINTS = 1;
const DECLARATION_WORD_POINTS = 0.5;

/**
 * Score packs against worker input.
 * - Exact trade/sector match: +10
 * - Keyword overlap with unit names: +2 per (keyword, unit) pair
 * - Keyword overlap with performance criteria: +1 per (keyword, criterion) pair
 * - Declaration-text word overlap (post-stopword): +0.5 per shared word
 * Normalized to 0-100 against the per-pack maximum. Top 3, sorted.
 */
export function findBestMatchingPacks(input: NSQFMatchInput): NSQFMatchResult[] {
  const keywordTokens = (input.keywords ?? []).flatMap(tokenize);
  const declWords = input.declarationText ? new Set(tokenize(input.declarationText)) : new Set<string>();
  const trade = (input.trade ?? '').trim().toLowerCase();

  if (keywordTokens.length === 0 && declWords.size === 0 && !trade) {
    return [];
  }

  const results = NSQF_PACKS.map((pack) => {
    let raw = 0;

    // 1. Exact trade / sector match.
    if (trade) {
      const packTrade = pack.trade.toLowerCase();
      const packSector = pack.sector.toLowerCase();
      const packTitle = pack.title.toLowerCase();
      if (
        trade === packTrade ||
        trade === packSector ||
        packTrade.includes(trade) ||
        trade.includes(packTrade) ||
        packTitle.includes(trade)
      ) {
        raw += TRADE_MATCH_POINTS;
      }
    }

    // 2. Keyword overlap with unit names (+2 per pair).
    const matchedUnitNames = new Set<string>();
    for (const unit of pack.competencyUnits) {
      const unitTokens = tokenize(unit.name);
      let unitHit = false;
      for (const kw of keywordTokens) {
        if (unitTokens.some((u) => u === kw || u.includes(kw) || kw.includes(u))) {
          raw += UNIT_NAME_POINTS;
          unitHit = true;
        }
      }
      // 4. Declaration-word overlap with unit names implicates the unit.
      for (const w of declWords) {
        if (unitTokens.some((u) => u === w)) {
          unitHit = true;
        }
      }
      if (unitHit) matchedUnitNames.add(unit.name);
    }

    // 3. Keyword overlap with performance criteria (+1 per pair).
    const pcTokensPerCriterion = pack.competencyUnits.flatMap((u) =>
      u.performanceCriteria.map(tokenize),
    );
    for (const kw of keywordTokens) {
      for (const pcTokens of pcTokensPerCriterion) {
        if (pcTokens.some((p) => p === kw || p.includes(kw))) {
          raw += CRITERION_POINTS;
        }
      }
    }

    // 4. Declaration-text word overlap with the pack vocabulary (+0.5 per shared word).
    const packVocab = new Set(
      tokenize(
        `${pack.title} ${pack.trade} ${pack.sector} ` +
          pack.competencyUnits
            .map((u) => `${u.name} ${u.performanceCriteria.join(' ')}`)
            .join(' '),
      ),
    );
    let sharedWords = 0;
    for (const w of declWords) {
      if (packVocab.has(w)) {
        raw += DECLARATION_WORD_POINTS;
        sharedWords += 1;
      }
    }

    // Normalize against this pack's maximum attainable score.
    const totalUnitNameTokens = pack.competencyUnits.reduce(
      (n, u) => n + tokenize(u.name).length,
      0,
    );
    const maxPossible =
      TRADE_MATCH_POINTS +
      UNIT_NAME_POINTS * totalUnitNameTokens * Math.max(keywordTokens.length, 1) +
      CRITERION_POINTS * pcTokensPerCriterion.length * Math.max(keywordTokens.length, 1) +
      DECLARATION_WORD_POINTS * Math.max(declWords.size, sharedWords > 0 ? sharedWords : 0);
    const score = maxPossible > 0 ? Math.min(100, Math.round((raw / maxPossible) * 100)) : 0;

    // Never hand downstream UI a blank unit list: fall back to all units.
    const matchedUnits =
      matchedUnitNames.size > 0
        ? pack.competencyUnits.filter((u) => matchedUnitNames.has(u.name)).map((u) => u.name)
        : pack.competencyUnits.map((u) => u.name);

    return { pack, score, matchedUnits };
  });

  return results
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}
