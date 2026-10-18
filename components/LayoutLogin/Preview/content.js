/**
 * COAIr sign-in preview — editable content.
 *
 * RULES (see docs/CONTENT_RULES.md):
 *  - Every figure, date and reference must come from a real answer in the
 *    public Edinburgh Tram Inquiry demo tenant. No invented customers,
 *    testimonials or certifications.
 *  - Text supports **bold** only. Everything else is escaped.
 */
export const COAIR_PREVIEW_CONTENT = {
  brand: { name: 'COAir', tagline: 'Project intelligence for construction' },
  eyebrow: 'For contractors, developers, consultants, project control & claims teams',
  headline: { lead: 'Every answer, back to ', accent: 'the page it came from.' },
  subhead:
    'Ask questions across your contracts, letters, minutes, email communications, programmes and site records. ' +
    'Build event chronologies. Test programme and analyse delay. Every line cited to the source.',
  windowTitle: 'Edinburgh Tram Inquiry',
  caption: 'Sample answers from the public Edinburgh Tram Inquiry record',

  trust: [
    { icon: 'doc',    title: 'Cited to the page',                     sub: 'Open the source at the exact passage' },
    { icon: 'circle', title: "Says when it doesn't know",             sub: 'No record, no answer' },
    { icon: 'shield', title: 'Hosted in the UAE or on your premises', sub: 'Your project, your workspace' },
  ],

  scenes: [
    {
      kind: 'queris',
      label: 'Queris · Ask',
      context: '7,429 documents indexed',
      durationMs: 9500,
      question: 'What was the Princes Street dispute in 2009 and how was it resolved?',
      thinking: [
        'Searching letters, minutes, witness statements…',
        'Reading 10 sources · witness statements, board papers, the supplemental agreement',
      ],
      answer: [
        { text: '**February 2009:** the consortium refused to start track works on Princes Street over unresolved utility risk', cite: 'TRI00000116 · p.22' },
        { text: '**20 March:** principles agreed; work began **23 March**; the Princes Street Supplemental Agreement was signed **30 May 2009**', cite: 'CEC00111659 · p.19', highlight: true },
        { text: '**Mechanism:** fixed price replaced by actual cost plus agreed overhead and profit', cite: 'TRI00000040 · p.13' },
      ],
      // TODO before go-live: replace with the verbatim passage from CEC00111659 p.19
      peek: {
        file: 'CEC00111659.pdf',
        meta: 'Page 19 · passage highlighted',
        text: '…the Board viewed the [[supplemental agreement]] as a one-off [[circuit breaker]] to get workers back on site…',
      },
    },
    {
      kind: 'chronos',
      label: 'Chronos · Event Chronology',
      context: 'Topic: Princes Street dispute',
      durationMs: 8500,
      axis: [ { label: '2009', at: 0 }, { label: '2010', at: 0.43 }, { label: '2011', at: 0.86 } ],
      events: [
        { id: 'EV-0001', date: 'Feb 2009',    text: 'Consortium declines to start on-street works',  ref: 'TRI00000063 p.32', flag: 'Hold',        at: 0.04 },
        { id: 'EV-0002', date: '20 Mar 2009', text: 'Principles agreed; resumption terms set',        ref: 'TRI00000063 p.32', flag: null,          at: 0.075 },
        { id: 'EV-0003', date: '23 Mar 2009', text: 'Works restart on Princes Street',                ref: 'TRI00000063 p.32', flag: null,          at: 0.105 },
        { id: 'EV-0004', date: '30 May 2009', text: 'Supplemental Agreement signed',                  ref: 'CEC00111659 p.19', flag: 'Instruction', at: 0.17 },
        { id: 'EV-0005', date: 'Mar 2011',    text: 'Payment dispute carried into Mar Hall mediation', ref: 'TRI00000040 p.13', flag: null,         at: 0.80 },
      ],
      exportLabel: 'Export to Word',
    },
    {
      kind: 'forensis',
      label: 'Forensis · Forensic Analysis',
      context: 'MUDFA utility diversion · progress reports',
      durationMs: 8000,
      kpis: [
        { label: 'Planned · Period 8, 2008', value: 6380, suffix: ' m', tone: 'neutral' },
        { label: 'Achieved',                 value: 1993, suffix: ' m', tone: 'amber' },
        { label: 'Against plan',             value: 31,   suffix: '%',  tone: 'red' },
      ],
      scaleMax: 7,
      sections: [
        { name: '1B 01 01', planned: 6.06, actual: 0.44 },
        { name: '1B 01 02', planned: 5.37, actual: 0.89 },
        { name: '1C 03 01', planned: 5.43, actual: 2.23 },
        { name: '2A 01 01', planned: 6.77, actual: 2.45 },
      ],
      legend: ['Planned output · m/team/day', 'Achieved'],
      note: {
        text: '**Preliminary finding:** output fell to as little as 1/14 of plan in Section 1B — a disruption pattern worth testing against the records.',
        cite: 'CEC00774156 · p.31',
      },
    },
  ],
};
