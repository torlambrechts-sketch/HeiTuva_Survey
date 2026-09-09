/**
 * V2-6 — the twelve help articles in English.
 *
 * Norwegian is the source language (CLAUDE.md), so these are translations of the
 * CORRECTED Norwegian rather than of the bundle: the ten sentences
 * `seed-help.ts` fixes are fixed here too, by construction, because they are
 * written from what the product does. `tests/db/help.test.ts` asserts the two
 * languages carry the same twelve slugs and the same step counts, so a
 * translation that quietly drops a step fails rather than shipping short.
 *
 * Keyed by slug, which is derived from the Norwegian title.
 */
export type EnStep = { head: string; body: string }
export type EnMockRow = { label: string; meta: string }
export type EnArticle = {
  title: string
  lead: string
  steps: EnStep[]
  mockTitle: string
  mockScreen: string
  mock: EnMockRow[]
  caption: string
}

export const HELP_EN: Record<string, EnArticle> = {
  'lag-den-forste-undersokelsen': {
    title: 'Create your first survey',
    lead:
      'The wizard takes you through purpose, template, recipients and sending. You can skip it ' +
      'and start from blank when you already know what to ask.',
    steps: [
      {
        head: 'Choose a purpose',
        body: 'Open Surveys and press «New survey». The wizard asks what you want to find out, and suggests a template from your answer.',
      },
      {
        head: 'Check the questions',
        body: 'The template is written for you. Change any wording, and add your own questions from the question bank.',
      },
      {
        head: 'Send',
        body: 'Go on to Send, pick a channel and recipients. A day-2 reminder is on from the start.',
      },
    ],
    mockTitle: 'New survey · step 1 of 4',
    mockScreen: 'Wizard',
    mock: [
      { label: 'What do you want to find out?', meta: 'free text' },
      { label: 'Working environment', meta: 'suggested template' },
      { label: 'Customer satisfaction', meta: 'template' },
      { label: 'Start from blank', meta: 'skip the wizard' },
    ],
    caption: 'The wizard in Surveys. «Start from blank» sits at the top if you would rather write the questions yourself.',
  },
  'importer-mottakere': {
    title: 'Import recipients',
    lead:
      'You can paste a list or upload a file. Directory synchronisation is not switched on yet — ' +
      'when it is, groups stay up to date automatically.',
    steps: [
      { head: 'Open Import recipients', body: 'It sits at the top of the Recipients card on the Send screen.' },
      {
        head: 'Choose a source',
        body: 'CSV expects the columns email, name and group. Entra ID and Google fetch groups directly once synchronisation is switched on.',
      },
      { head: 'Check the preview', body: 'Every row is marked new, duplicate or invalid before you confirm.' },
    ],
    mockTitle: 'Send · Import recipients',
    mockScreen: 'Send',
    mock: [
      { label: 'CSV file', meta: 'email, name, group' },
      { label: 'marit@nordiskstudio.no', meta: 'New' },
      { label: 'jonas@nordiskstudio.no', meta: 'Duplicate' },
      { label: 'Lars Sund', meta: 'Invalid email' },
    ],
    caption: 'The preview shows what will be added before you import.',
  },
  'velg-riktig-sporsmalstype': {
    title: 'Choose the right question type',
    lead:
      'The type decides what you can read out of an answer. A scale gives you a trend, multiple ' +
      'choice gives you priorities, free text gives you the explanation.',
    steps: [
      {
        head: 'Scales for attitudes',
        body: 'Label every step in words, not only numbers. People then read the scale the same way.',
      },
      { head: 'Ranking for priorities', body: 'Better than «pick three» when you need to know what matters most.' },
      { head: 'Free text last', body: 'Put open questions at the end, and make them optional.' },
    ],
    mockTitle: 'Build · Question 3',
    mockScreen: 'Builder',
    mock: [
      { label: 'Scale 1–5', meta: 'chosen type' },
      { label: 'Labels', meta: 'Strongly disagree → Strongly agree' },
      { label: '«Don’t know» option', meta: 'on' },
      { label: 'Required', meta: 'off' },
    ],
    caption: 'Question type and settings live in the right-hand panel of the builder.',
  },
  'slik-unngar-du-ledende-sporsmal': {
    title: 'How to avoid leading questions',
    lead:
      'The builder warns as you write. The warnings are advice, not blocks, but they catch the ' +
      'three mistakes that most often ruin the data.',
    steps: [
      { head: 'Double-barrelled questions', body: '«Do you have tools and training?» measures two things. Split it in two.' },
      {
        head: 'Leading wording',
        body: '«How satisfied are you with the new process?» assumes you are satisfied. Use «How do you experience…».',
      },
      { head: 'Questions that run long', body: 'Past 20 words readability drops. Cut rather than qualify.' },
    ],
    mockTitle: 'Build · Quality warning',
    mockScreen: 'Builder',
    mock: [
      { label: 'Double-barrelled', meta: 'split in two' },
      { label: 'Leading wording', meta: 'rephrase' },
      { label: '23 words', meta: 'shorten' },
      { label: 'Plain language', meta: 'OK' },
    ],
    caption: 'Warnings appear under the question as you write.',
  },
  'sett-terskelen-for-virksomheten': {
    title: 'Set the threshold for your organisation',
    lead:
      'The threshold decides how many answers must arrive before figures are shown. Five is the ' +
      'default. For sensitive topics you should use eight.',
    steps: [
      {
        head: 'Open Administration → Privacy',
        body: 'The threshold is set for the whole organisation, and cannot be lowered below the minimum.',
      },
      {
        head: 'Look at your group sizes',
        body: 'Groups below the threshold are not shown in the report, whoever is reading it. If only one group is hidden, the second-smallest is hidden too — otherwise the hidden one can be worked out from the total.',
      },
      {
        head: 'Explain it to people',
        body: 'The anonymity promise is shown at the top of the answering flow, with the threshold you chose.',
      },
    ],
    mockTitle: 'Administration · Privacy',
    mockScreen: 'Admin',
    mock: [
      { label: 'Minimum threshold', meta: '5 answers' },
      { label: 'Sensitive topics', meta: '8 answers' },
      { label: 'Store IP address', meta: 'off' },
      { label: 'Data in the EU/EEA', meta: 'on' },
    ],
    caption: 'Threshold and privacy settings in Administration.',
  },
  'psykososial-kartlegging-steg-for-steg': {
    title: 'Psychosocial mapping, step by step',
    lead:
      'The Working Environment Act § 4-3 requires mapping, risk assessment and follow-up. The ' +
      'template covers every topic area, and the report gathers the documentation.',
    steps: [
      {
        head: 'Get buy-in first',
        body: 'Inform the safety representative and the working environment committee. Choose threshold and groups before sending.',
      },
      { head: 'Send and follow up', body: 'The full template takes nine minutes. The 20-question short version takes four.' },
      {
        head: 'Assess risk and set measures',
        body: 'Groups too small to get their own results become tasks with an owner and a deadline, with the legal basis visible. The duty applies whatever they answered.',
      },
    ],
    mockTitle: 'Results · Psychosocial mapping',
    mockScreen: 'Results',
    mock: [
      { label: 'Leadership and support', meta: '4.2' },
      { label: 'Job demands', meta: '3.4' },
      { label: 'Speak-up climate', meta: '2.7' },
      { label: 'Group below threshold', meta: 'requires action' },
    ],
    caption: 'The risk picture per topic area, flagged where the findings need follow-up.',
  },
  'rapport-til-arbeidstilsynet': {
    title: 'Report to the Labour Inspection Authority',
    lead:
      'The report must show method, participation, findings, risk assessment, measures and ' +
      'involvement. All of it comes from the survey you ran.',
    steps: [
      { head: 'Pick a report template', body: 'The statutory-mapping template has the required sections already set up.' },
      { head: 'Check the involvement', body: 'The safety representative’s participation must be documented in the report.' },
      { head: 'Archive with signature fields', body: 'The report is locked on archiving, with a date and a version.' },
    ],
    mockTitle: 'Reports · Statutory mapping',
    mockScreen: 'Reports',
    mock: [
      { label: 'Method and participation', meta: '1 page' },
      { label: 'Risk assessment', meta: 'table' },
      { label: 'Action plan', meta: '5 measures' },
      { label: 'Signature fields', meta: 'safety rep and committee' },
    ],
    caption: 'The report builder with the sections the statutory template requires.',
  },
  'bygg-din-egen-rapport': {
    title: 'Build your own report',
    lead:
      'Assemble the report from widgets: summary, trend, teams, themes and measures. Choose the ' +
      'period and who gets to see it.',
    steps: [
      { head: 'Choose the content', body: 'Tick the widgets you want. The preview updates as you choose.' },
      { head: 'Set the period', body: 'A report can cover one round or several, and compare against the previous period.' },
      { head: 'Share per role', body: 'Leaders see their own unit. Readers never see individual answers.' },
    ],
    mockTitle: 'Reports · New report',
    mockScreen: 'Reports',
    mock: [
      { label: 'Summary', meta: 'selected' },
      { label: 'Trend against last round', meta: 'selected' },
      { label: 'Heatmap per team', meta: 'selected' },
      { label: 'Themes in free text', meta: 'not selected' },
    ],
    caption: 'Widgets on the left, a live preview on the right.',
  },
  'fra-funn-til-effektvurdering': {
    title: 'From finding to effect assessment',
    lead:
      'A measure goes through six steps. It cannot be closed before its effect has been assessed ' +
      '— that is the requirement in the Working Environment Act § 3-1 and the Equality and ' +
      'Anti-Discrimination Act § 26.',
    steps: [
      {
        head: 'The task is created',
        body: 'If a group is too small to get its own results, the task is created automatically at send, with its source and legal basis. It says nothing about what the group answered.',
      },
      { head: 'Owner and deadline', body: 'Every task has one owner. Tasks past their deadline are marked in the list.' },
      {
        head: 'Effect assessment',
        body: 'The next round measures the same questions, so you can see whether the measure worked.',
      },
    ],
    mockTitle: 'Tasks · All',
    mockScreen: 'Tasks',
    mock: [
      { label: 'Meeting-free Thursdays', meta: 'In progress · 1 Oct' },
      { label: 'Risk assessment, speak-up climate', meta: 'Past deadline' },
      { label: 'Offer increased hours', meta: 'Awaiting effect assessment' },
      { label: 'Fewer status meetings', meta: 'Effect assessed' },
    ],
    caption: 'The task list with lifecycle, owner and deadline.',
  },
  'roller-og-tilgang': {
    title: 'Roles and access',
    lead:
      'Three roles decide what people see. None of them gives access to individual answers in ' +
      'anonymous surveys.',
    steps: [
      { head: 'Administrator', body: 'Controls settings, privacy and integrations.' },
      { head: 'Editor', body: 'Creates and sends surveys, and owns tasks.' },
      {
        head: 'Reader',
        body: 'A reader sees summed results and never individual answers. Safety representative is not a separate role — they sign statutory reports as a signatory.',
      },
    ],
    mockTitle: 'Administration · Users',
    mockScreen: 'Admin',
    mock: [
      { label: 'Tuva Berg', meta: 'Administrator' },
      { label: 'Marit Aas', meta: 'Editor' },
      { label: 'Lars Sund', meta: 'Reader' },
      { label: 'Safety representative (signatory)', meta: 'Separate role' },
    ],
    caption: 'The user list in Administration, with a role per person.',
  },
  'koble-til-hr-og-lonnssystem': {
    title: 'Connect an HR and payroll system',
    lead:
      'The integrations page shows which fields we fetch from each system, and who sees them. ' +
      'Payroll is fetched aggregated per job group.',
    steps: [
      { head: 'Open Administration → Integrations', body: 'Each connection shows its status, level and the fields it fetches.' },
      {
        head: 'Connect the HR system',
        body: 'Gives job group, seniority and contracted hours — the basis for equality reporting.',
      },
      { head: 'Connect payroll', body: 'Payroll figures are never joined to anonymous answers at individual level.' },
    ],
    mockTitle: 'Administration · Integrations',
    mockScreen: 'Admin',
    mock: [
      { label: 'Microsoft Entra ID', meta: 'Connected' },
      { label: 'HR system', meta: 'Connected' },
      { label: 'Payroll system', meta: 'Needs setup' },
      { label: 'Microsoft Teams', meta: 'Connected' },
    ],
    caption: 'The integrations page with status and the fields each connection fetches.',
  },
  'innsyn-retting-og-sletting': {
    title: 'Access, rectification and erasure',
    lead:
      'Requests from data subjects must be answered within 30 days. Under Privacy you will find ' +
      'the four types and can handle them there.',
    steps: [
      {
        head: 'Register the request',
        body: 'Access, rectification, erasure or portability. The deadline starts running immediately.',
      },
      { head: 'Find the data', body: 'We show what is stored about the person, and what cannot be traced back.' },
      { head: 'Document the handling', body: 'Every request is logged with a date, what was done and by whom.' },
    ],
    mockTitle: 'Administration · Privacy',
    mockScreen: 'Admin',
    mock: [
      { label: 'Access to own data', meta: 'Handle' },
      { label: 'Rectification', meta: 'Handle' },
      { label: 'Erasure', meta: 'Handle' },
      { label: 'Portability', meta: 'Export' },
    ],
    caption: 'Requests from data subjects, with a deadline and a log.',
  },
}
