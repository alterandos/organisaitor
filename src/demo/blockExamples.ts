import { kids, node, p, code, type J } from './noteContent';

// One example of each note block (2026-10-26): what the demo account's notes hold
// (demoAccount.ts calls these), and what the block guide (components/BlockGuide) shows, so the two
// never drift apart. A block whose example needs other things in the account (a Glossary card's
// record, an embed's note, a hub's links, an inbox's sources, a custom converter) takes them as
// arguments, or isn't here (BLOCK_GUIDE_NEEDS in components/BlockGuide/guideData.ts says why).

const point = (text: string, weight = 1) => node('prosConsPoint', { weight }, text);
const prosCons = (side: 'pro' | 'con', points: J[]) => kids('prosConsList', { side }, points);

export const EX = {
  cycle: (): J => kids('cycle', { variant: 'ring', numbered: true, colours: 'spectrum', iconShape: 'circle', iconSize: 'm', blockId: 'rc-cycle' }, [
      node('cycleName', null, 'The rock cycle'),
      ...([
        ['🔥', 'Magma', 'Molten rock below the surface.', 'Cooling'],
        ['🌋', 'Igneous rock', 'Crystallises as magma or lava cools.', 'Weathering & erosion'],
        ['🏖️', 'Sediment', 'Grains carried by water, wind and ice.', 'Burial & lithification'],
        ['🏜️', 'Sedimentary rock', 'Layers compacted and cemented.', 'Heat & pressure'],
        ['💎', 'Metamorphic rock', 'Changed without melting.', 'Melting'],
      ]).map(([icon, label, text, arrowLabel]) => kids('cycleStage', { arrow: 'forward', arrowLabel, icon, image: null }, [node('cycleLabel', null, label), node('cycleText', null, text)])),
    ]),
  types: (): J => kids('types', { variant: 'guide' }, [
      node('typesCategory', null, 'Rock'),
      ...([
        ['🌋', 'Igneous', 'Forms from cooled magma or lava; interlocking crystals', 'Basalt, granite, latite'],
        ['🏜️', 'Sedimentary', 'Layers of compacted, cemented grains; may hold fossils', 'Sandstone, limestone, shale'],
        ['💎', 'Metamorphic', 'Recrystallised by heat and pressure without melting; often banded', 'Slate, schist, marble'],
      ]).map(([icon, name, trait, example]) => kids('typesItem', { icon, image: null }, [node('typesName', null, name), node('typesTrait', null, trait), node('typesExample', null, example)])),
    ]),
  quoteBlock: (): J => node('quoteBlock', { variant: 'pull' }, node('quoteText', null, 'The result, therefore, of our present enquiry is, that we find no vestige of a beginning, no prospect of an end.'),
      node('quoteField', { field: 'who' }, 'James Hutton'), node('quoteField', { field: 'source' }, 'Theory of the Earth'), node('quoteField', { field: 'when' }, '1788')),
  questionAnswered: (answeredAt: string | null = null): J => node('questionBlock', { qid: 'demo-q-granite', status: 'answered', answeredAt, variant: 'card' },
      node('questionText', null, 'Why does granite have much bigger crystals than basalt?'),
      node('questionField', { field: 'answer' }, 'Granite cools slowly deep underground, so its crystals have time to grow. Basalt erupts and cools in days.')),
  idKey: (): J => kids('idKey', { variant: 'couplets', blockId: 'min-key' }, [
      node('idKeyTitle', null, 'Common rock-forming minerals'),
      ...([
        ['Does it scratch glass?', [['Yes, it scratches glass', '2'], ['No', '3']]],
        ['How does it break?', [['Two flat cleavage planes, near 90°', 'Feldspar'], ['No cleavage; curved, shell-like fracture', 'Quartz']]],
        ['Does it fizz in dilute HCl?', [['Yes', 'Calcite'], ['No', '4']]],
        ['Does it peel into thin sheets?', [['Yes, flexible sheets', 'Mica'], ['No; feels greasy, scratched by a fingernail', 'Talc']]],
      ] as [string, [string, string][]][]).map(([question, leads]) => kids('idKeyStep', null, [
        node('idKeyQuestion', null, question),
        ...leads.map(([choice, result]) => kids('idKeyLead', null, [node('idKeyChoice', null, choice), node('idKeyResult', null, result)])),
      ])),
    ]),
  compareBlock: (): J => kids('compareBlock', { variant: 'table' }, ([
      ['Quartz', ['Hardness: 7, scratches glass', 'In acid: no reaction', 'Breaks: conchoidal fracture, no cleavage']],
      ['Calcite', ['Hardness: 3, a knife scratches it', 'In acid: fizzes in dilute HCl', 'Breaks: into rhombs along three cleavages']],
    ] as [string, string[]][]).map(([title, points]) => kids('compareSide', null, [node('compareTitle', null, title), ...points.map((pt) => node('comparePoint', null, pt))]))),
  hierarchy: (): J => kids('hierarchy', { variant: 'tree', colours: 'spectrum', tiers: ['Eon', 'Era', 'Period'] }, ([
      [0, 'Phanerozoic: the last 541 million years'], [1, 'Cenozoic'], [2, 'Quaternary'], [2, 'Neogene'],
      [1, 'Mesozoic'], [2, 'Cretaceous'], [2, 'Jurassic'],
      [1, 'Paleozoic'], [2, 'Permian'], [2, 'Cambrian'],
    ] as [number, string][]).map(([level, text]) => node('hierarchyItem', { level }, text))),
  breakdown: (): J => kids('breakdown', { variant: 'pillars', colours: 'accent' }, [
      node('breakdownWhole', null, 'Dating methods'),
      ...([
        ['Relative dating', 'Superposition: younger layers sit on older ones; a dyke is younger than what it cuts.'],
        ['Radiometric dating', 'Measure parent and daughter isotopes and use the known half-life.'],
        ['Biostratigraphy', 'Index fossils that lived only briefly pin a layer to a narrow window.'],
      ]).map(([label, text]) => kids('breakdownPart', null, [node('breakdownLabel', null, label), node('breakdownText', null, text)])),
    ]),
  conclusion: (): J => kids('conclusion', { variant: 'therefore' }, [
      node('conclusionReason', null, 'Radiometric dating puts the Earth at about 4.54 billion years old'),
      node('conclusionReason', null, 'Anatomically modern humans appeared about 300,000 years ago'),
      node('conclusionText', null, 'If Earth’s history were one day, we would arrive in the last six seconds before midnight.'),
    ]),
  timeline: (): J => kids('timeline', { variant: 'horizontal', order: 'asc' }, ([
      ['7:00am', 'Leave campus'],
      ['9:30am', 'Kiama Blowhole: latite columns and the blowhole itself'],
      ['12:00pm', 'Lunch at Bombo Beach'],
      ['1:00pm', 'Bombo Headland quarry: columnar jointing'],
      ['4:30pm', 'Back on the bus'],
    ]).map(([when, what]) => kids('timelineItem', null, [node('timelineWhen', null, when), p(what)]))),
  chart: (): J => node('chart', { variant: 'line', spec: {
      title: 'Atmospheric CO₂ at Mauna Loa', xTitle: 'Year', yTitle: 'ppm',
      labels: ['1960', '1970', '1980', '1990', '2000', '2010', '2020'],
      series: [{ name: 'Annual mean CO₂', values: [316.9, 325.7, 338.8, 354.4, 369.7, 389.9, 414.2] }],
      stacking: 'none', waterfallTotal: true,
    } }),
  diagram: (): J => node('diagram', { variant: 'free', spec: {
      nodes: [
        { id: 'warm', label: 'Warming', shape: 'oval', x: 0, y: 0 },
        { id: 'melt', label: 'Sea ice melts', shape: 'round', x: 300, y: 0 },
        { id: 'dark', label: 'Darker surface (lower albedo)', shape: 'round', x: 300, y: 150 },
        { id: 'absorb', label: 'More sunlight absorbed', shape: 'round', x: 0, y: 150 },
      ],
      edges: [
        { id: 'e1', from: 'warm', to: 'melt', label: '' }, { id: 'e2', from: 'melt', to: 'dark', label: '' },
        { id: 'e3', from: 'dark', to: 'absorb', label: '' }, { id: 'e4', from: 'absorb', to: 'warm', label: 'amplifies' },
      ],
    } }),
  causeEffect: (): J => kids('causeEffect', { variant: 'flow', links: [
      { from: 'demo-ce-fuel', to: 'demo-ce-co2' }, { from: 'demo-ce-forest', to: 'demo-ce-co2' }, { from: 'demo-ce-farm', to: 'demo-ce-ch4' },
      { from: 'demo-ce-co2', to: 'demo-ce-warm' }, { from: 'demo-ce-ch4', to: 'demo-ce-warm' },
      { from: 'demo-ce-warm', to: 'demo-ce-ice' }, { from: 'demo-ce-warm', to: 'demo-ce-expand' }, { from: 'demo-ce-ice', to: 'demo-ce-sea' }, { from: 'demo-ce-expand', to: 'demo-ce-sea' },
    ] }, [
      kids('ceColumn', null, [node('ceHead', null, 'Causes'), node('ceItem', { cid: 'demo-ce-fuel' }, 'Burning fossil fuels'), node('ceItem', { cid: 'demo-ce-forest' }, 'Clearing forests'), node('ceItem', { cid: 'demo-ce-farm' }, 'Livestock and rice paddies')]),
      kids('ceColumn', null, [node('ceHead', null, 'Effects'), node('ceItem', { cid: 'demo-ce-co2' }, 'More CO₂ in the air'), node('ceItem', { cid: 'demo-ce-ch4' }, 'More methane')]),
      kids('ceColumn', null, [node('ceHead', null, 'Then'), node('ceItem', { cid: 'demo-ce-warm' }, 'Warming')]),
      kids('ceColumn', null, [node('ceHead', null, 'Then'), node('ceItem', { cid: 'demo-ce-ice' }, 'Ice sheets melt'), node('ceItem', { cid: 'demo-ce-expand' }, 'Oceans expand as they warm')]),
      kids('ceColumn', null, [node('ceHead', null, 'Then'), node('ceItem', { cid: 'demo-ce-sea' }, 'Sea level rises')]),
    ]),
  vennBlock: (): J => kids('vennBlock', { variant: 'circles' }, [
      node('vennSet', { sid: 'a' }, 'Weather'),
      node('vennSet', { sid: 'b' }, 'Climate'),
      node('vennItem', { sets: ['a'] }, 'Today’s rain'),
      node('vennItem', { sets: ['a'] }, 'A heatwave'),
      node('vennItem', { sets: ['b'] }, '30-year averages'),
      node('vennItem', { sets: ['b'] }, 'Ice ages'),
      node('vennItem', { sets: ['a', 'b'] }, 'Temperature'),
      node('vennItem', { sets: ['a', 'b'] }, 'Rainfall'),
    ]),
  caseStudy: (): J => kids('caseStudy', { variant: 'card' }, [
      node('caseTitle', null, 'The Montreal Protocol'),
      node('caseField', { field: 'setting' }, '1987; now signed by every UN member'),
      node('caseField', { field: 'situation' }, 'CFCs from fridges and spray cans were thinning the ozone layer, with a hole over Antarctica each spring.'),
      node('caseField', { field: 'actions' }, 'Countries agreed to phase CFCs out on a timetable, with money to help poorer countries switch.'),
      node('caseField', { field: 'outcome' }, 'CFC use fell by over 99%; the ozone layer is expected to recover by about 2066.'),
      node('caseField', { field: 'shows' }, 'A global agreement with a clear target and help to meet it can fix an atmospheric problem.'),
    ]),
  codeBlock: (): J => code('python', [
      'import pandas as pd',
      '',
      'co2 = pd.read_csv("co2_mm_mlo.csv", comment="#")',
      'annual = co2.groupby("year")["average"].mean()',
      'print(annual.loc[1960:2020:10].round(1))',
    ].join('\n')),
  argument: (): J => kids('argument', { variant: 'debate', sides: 'both' }, [
      node('argumentClaim', null, 'Solar geoengineering should be researched, but not deployed.'),
      prosCons('pro', [point('Volcanic eruptions show it would cool the planet quickly (Pinatubo, 1991: about 0.5 °C)', 3), point('Research now means we understand it before anyone is desperate enough to try it', 2)]),
      prosCons('con', [point('Deployment would mask warming without removing any CO₂', 3), point('Stopping suddenly would cause rapid “termination shock” warming', 3), point('Research itself may weaken the push to cut emissions (moral hazard)', 1)]),
      node('argumentField', { field: 'why' }, 'The cooling is real but the risks of relying on it are worse than the risks of studying it.'),
      node('argumentField', { field: 'sources' }, 'IPCC AR6 WG1 ch. 4; Kolbert, Under a White Sky'),
    ]),
  prosCons: (): J => kids('prosCons', { variant: 'scales' }, [
      node('prosConsSubject', null, 'Stratospheric aerosol injection'),
      prosCons('pro', [point('Fast: cooling within a year or two', 3), point('Cheap compared with cutting emissions', 2)]),
      prosCons('con', [point('Does nothing for ocean acidification', 3), point('Termination shock if it stops', 3), point('Could shift monsoon rainfall', 2)]),
      node('prosConsVerdict', null, 'Too risky as a strategy; at most a last-resort backstop.'),
    ]),
  options: (): J => kids('options', { variant: 'ranked' }, [node('optionsGoal', null, 'Keep warming to 1.5 °C'), ...([
      ['Cut emissions fast', 'The only option that stops the cause.', 'chosen', 3, ['Deals with the cause', 'Cheaper every year as renewables fall in price'], ['Politically slow']],
      ['Carbon dioxide removal', 'Forests, enhanced weathering, direct air capture.', 'considering', 2, ['Reverses some of the damage'], ['Expensive at scale', 'Unproven at gigatonne scale']],
      ['Solar geoengineering', 'Reflect sunlight with aerosols.', 'ruled', 0, ['Fast'], ['Masks the problem', 'Termination shock']],
    ] as [string, string, string, number, string[], string[]][]).map(([name, note, status, score, pros, cons]) => kids('optionsItem', { status, score }, [
      node('optionsName', null, name), node('optionsNote', null, note),
      prosCons('pro', pros.map((t) => point(t))), prosCons('con', cons.map((t) => point(t))),
    ]))]),
  pyramid: (): J => kids('pyramid', { variant: 'pyramid', colours: 'spectrum' }, ([
      ['IPCC assessments', 'Thousands of studies, reviewed and weighed'],
      ['Peer-reviewed studies', 'Field data and experiments'],
      ['Model projections', 'Useful, but only as good as their assumptions'],
      ['News and opinion', 'For quotes and context, not evidence'],
    ]).map(([label, text]) => kids('pyramidLayer', null, [node('pyramidLabel', null, label), node('pyramidText', null, text)]))),
};
