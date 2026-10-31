import { useRef, useState } from 'react'
import { NavLink, Route, Routes, useLocation } from 'react-router-dom'
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  BookOpen,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Command,
  FileText,
  FlaskConical,
  FolderOpen,
  LayoutDashboard,
  Lightbulb,
  Menu,
  Plus,
  Search,
  Settings2,
  Sparkles,
  X,
  Zap,
} from 'lucide-react'
import {
  analyzeResearch,
  analyzeWriting,
  extractSource,
  generateEditorial,
} from './services/api.js'

function readLocal(key) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function writeLocal(key, value) {
  try {
    localStorage.setItem(key, value)
  } catch {}
}
function createResearchId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`
}
function isValidResearchResult(value) {
  const brief = value?.brief
  const sources = value?.sources
  if (
    !brief ||
    typeof brief.executiveSummary !== 'string' ||
    !Array.isArray(sources) ||
    !sources.length ||
    !Array.isArray(brief.angles) ||
    brief.angles.length < 3 ||
    !Array.isArray(brief.whatHappened) ||
    !Array.isArray(brief.whyItMatters) ||
    !Array.isArray(brief.keyDevelopments) ||
    !brief.recommendedAngle ||
    typeof brief.recommendedAngle.title !== 'string'
  )
    return false
  const validIds = new Set(sources.map((source) => source.id))
  const citationGroups = [
    brief.summarySourceIds,
    brief.recommendedAngle.sourceIds,
    ...brief.angles.map((angle) => angle.sourceIds),
    ...brief.whatHappened.map((item) => item.sourceIds),
    ...brief.whyItMatters.map((item) => item.sourceIds),
    ...brief.keyDevelopments.map((item) => item.sourceIds),
  ]
  return citationGroups.every(
    (ids) => Array.isArray(ids) && ids.every((id) => typeof id === 'string' && validIds.has(id)),
  )
}
function readResearchResult() {
  try {
    const saved = JSON.parse(readLocal('editorial-ai-research'))
    if (!isValidResearchResult(saved)) return null
    if (saved.researchId) return saved
    const migrated = { ...saved, researchId: createResearchId(), question: saved.question || '' }
    writeLocal('editorial-ai-research', JSON.stringify(migrated))
    return migrated
  } catch {
    return null
  }
}

const navigation = [
  {
    label: 'Workspace',
    items: [
      { to: '/', label: 'Overview', icon: LayoutDashboard },
      { to: '/research', label: 'Research', icon: FlaskConical },
      { to: '/writing', label: 'Writing', icon: FileText },
      { to: '/editorial', label: 'Editorial output', icon: BookOpen },
    ],
  },
]
const projects = [
  { color: 'purple', name: 'The Signal — Weekly' },
  { color: 'amber', name: 'AI & the future of work' },
]

function App() {
  const [mobileNav, setMobileNav] = useState(false)
  const [toast, setToast] = useState('')
  const [researchResult, setResearchResult] = useState(readResearchResult)
  const [editorialResult, setEditorialResult] = useState(() => {
    try {
      return JSON.parse(readLocal('editorial-ai-editorial'))
    } catch {
      return null
    }
  })
  const [editorialRevised, setEditorialRevised] = useState(() => {
    try {
      const saved = JSON.parse(readLocal('editorial-ai-revision'))
      if (typeof saved?.researchId === 'string' && typeof saved.text === 'string') return saved
    } catch {}
    return { researchId: null, text: '' }
  })
  const researchRequestId = useRef(0)
  const latestResearchRef = useRef(researchResult)
  const activeEditorialResult =
    researchResult && editorialResult?.researchId === researchResult.researchId
      ? editorialResult
      : null
  const activeEditorialRevision =
    researchResult && editorialRevised.researchId === researchResult.researchId
      ? editorialRevised.text
      : ''
  const location = useLocation()
  const currentPage =
    navigation.flatMap((section) => section.items).find((item) => item.to === location.pathname)
      ?.label || 'Overview'
  function announce(message) {
    setToast(message)
    window.setTimeout(() => setToast(''), 2800)
  }
  function beginResearch() {
    researchRequestId.current += 1
    return researchRequestId.current
  }
  function saveResearch(value, question, requestId) {
    if (requestId !== researchRequestId.current || !isValidResearchResult(value)) return false
    const next = { ...value, question, researchId: createResearchId() }
    latestResearchRef.current = next
    setResearchResult(next)
    writeLocal('editorial-ai-research', JSON.stringify(next))
    return true
  }
  function saveEditorial(value, researchId) {
    if (latestResearchRef.current?.researchId !== researchId) return false
    const next = { ...value, researchId }
    setEditorialResult(next)
    writeLocal('editorial-ai-editorial', JSON.stringify(next))
    const revision = { researchId, text: '' }
    setEditorialRevised(revision)
    writeLocal('editorial-ai-revision', JSON.stringify(revision))
    writeLocal('editorial-ai-writing', value.draft)
    return true
  }
  function saveEditorialRevision(value, researchId) {
    const revision = { researchId, text: value }
    setEditorialRevised(revision)
    writeLocal('editorial-ai-revision', JSON.stringify(revision))
    writeLocal('editorial-ai-revised', value)
    writeLocal('editorial-ai-writing', value)
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
        <div className="brand-row">
          <div className="brand-mark">
            <Sparkles size={17} strokeWidth={2.1} />
          </div>
          <span>
            editorial<span className="brand-ai">.ai</span>
          </span>
          <button
            className="mobile-close icon-button"
            onClick={() => setMobileNav(false)}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>
        <button className="workspace-switch">
          <span className="workspace-avatar">S</span>
          <span className="workspace-info">
            <strong>Studio North</strong>
            <small>Free workspace</small>
          </span>
          <ChevronDown size={15} />
        </button>
        <div className="side-scroll">
          {navigation.map((group) => (
            <div className="nav-group" key={group.label}>
              <div className="side-label">{group.label}</div>
              {group.items.map((item) => (
                <NavLink
                  end={item.to === '/'}
                  to={item.to}
                  key={item.to}
                  onClick={() => setMobileNav(false)}
                  className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                >
                  <item.icon size={17} strokeWidth={1.8} />
                  <span>{item.label}</span>
                  {item.badge && <span className="nav-badge">{item.badge}</span>}
                </NavLink>
              ))}
            </div>
          ))}
          <div className="nav-group project-group">
            <div className="side-label side-label-row">
              Your newsletters{' '}
              <button
                className="mini-plus"
                onClick={() => announce('Newsletter creation is coming soon.')}
                aria-label="Add newsletter"
              >
                <Plus size={14} />
              </button>
            </div>
            {projects.map((project) => (
              <button
                className="project-item"
                key={project.name}
                onClick={() => announce(`Opening ${project.name}`)}
              >
                <span className={`project-dot ${project.color}`} />
                <span>{project.name}</span>
                <ChevronRight size={13} className="project-chevron" />
              </button>
            ))}
          </div>
          <div className="side-insight">
            <div className="insight-icon">
              <Zap size={15} fill="currentColor" />
            </div>
            <strong>A clearer point of view.</strong>
            <p>Bring your sources. Leave with a story worth telling.</p>
            <button onClick={() => announce('Your editorial guide is on its way.')}>
              Explore the guide <ArrowRight size={13} />
            </button>
          </div>
        </div>
        <div className="sidebar-bottom">
          <button className="nav-item" onClick={() => announce('Search is coming soon.')}>
            <Search size={17} />
            <span>Search</span>
            <kbd>⌘ K</kbd>
          </button>
          <button className="nav-item" onClick={() => announce('Settings are coming soon.')}>
            <Settings2 size={17} />
            <span>Settings</span>
          </button>
          <div className="profile-row">
            <div className="profile-avatar">JD</div>
            <div className="profile-info">
              <strong>Jordan Davis</strong>
              <small>Editor</small>
            </div>
            <button className="profile-more" aria-label="Profile options">
              <ChevronDown size={15} />
            </button>
          </div>
        </div>
      </aside>
      {mobileNav && (
        <button
          className="mobile-scrim"
          onClick={() => setMobileNav(false)}
          aria-label="Close navigation"
        />
      )}
      <main className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-menu icon-button"
              onClick={() => setMobileNav(true)}
              aria-label="Open menu"
            >
              <Menu size={19} />
            </button>
            <span>Studio North</span>
            <ChevronRight size={13} />
            <strong>{currentPage}</strong>
          </div>
          <div className="topbar-actions">
            <button className="help-button" onClick={() => announce('Help center is coming soon.')}>
              <CircleHelp size={16} /> <span>Help</span>
            </button>
            <button
              className="notification-button icon-button"
              onClick={() => announce('You’re all caught up.')}
              aria-label="Notifications"
            >
              <Bell size={17} />
              <i />
            </button>
            <div className="top-divider" />
            <div className="top-avatar">JD</div>
          </div>
        </header>
        <div className="page-content">
          <Routes>
            <Route
              path="/"
              element={
                <Dashboard
                  announce={announce}
                  researchResult={researchResult}
                  editorialResult={activeEditorialResult}
                />
              }
            />
            <Route
              path="/research"
              element={
                <ResearchPage
                  announce={announce}
                  researchResult={researchResult}
                  onResearchStart={beginResearch}
                  onResearch={saveResearch}
                />
              }
            />
            <Route
              path="/writing"
              element={
                <WritingPage
                  announce={announce}
                  seedDraft={
                    activeEditorialRevision ||
                    activeEditorialResult?.draft ||
                    readLocal('editorial-ai-writing') ||
                    ''
                  }
                  onRevised={(value) =>
                    saveEditorialRevision(value, researchResult?.researchId || '')
                  }
                />
              }
            />
            <Route
              path="/editorial"
              element={
                <EditorialPage
                  announce={announce}
                  researchResult={researchResult}
                  editorialResult={activeEditorialResult}
                  onEditorial={saveEditorial}
                  revised={activeEditorialRevision}
                />
              }
            />
          </Routes>
        </div>
      </main>
      {toast && (
        <div className="toast">
          <span className="toast-dot" />
          {toast}
        </div>
      )}
    </div>
  )
}

function PageHeading({ eyebrow, title, children, right }) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        {children && <p className="page-subtitle">{children}</p>}
      </div>
      {right}
    </div>
  )
}
function Dashboard({ announce, researchResult, editorialResult }) {
  const todayLabel = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
    .format(new Date())
    .toUpperCase()
  const sessions = researchResult
    ? [
        {
          icon: '◈',
          title: researchResult.brief.recommendedAngle.title,
          sources: `${researchResult.sources.length} sources`,
          time: 'Just now',
          status: 'Ready',
        },
      ]
    : []
  const drafts = editorialResult
    ? [
        {
          title: editorialResult.headline,
          tag: 'Editorial output',
          words: `${editorialResult.wordCount} words`,
          time: 'Created just now',
          tone: 'lavender',
        },
      ]
    : []
  return (
    <>
      <PageHeading
        eyebrow={todayLabel}
        title={
          <>
            Good morning, Jordan<span className="heading-period">.</span>
          </>
        }
      >
        Your next great story starts with a good question.
      </PageHeading>
      <div className="welcome-banner">
        <div className="banner-copy">
          <span className="banner-kicker">
            <Sparkles size={13} /> YOUR EDITORIAL DESK
          </span>
          <h2>
            Make sense of what’s
            <br />
            happening out there.
          </h2>
          <p>Go from scattered links to a story with a point of view.</p>
          <NavLink to="/research" className="banner-cta">
            Start researching <ArrowRight size={15} />
          </NavLink>
        </div>
        <div className="banner-art" aria-hidden="true">
          <div className="orbit orbit-one" />
          <div className="orbit orbit-two" />
          <div className="orbit orbit-three" />
          <div className="art-center">
            <Sparkles size={25} />
          </div>
          <div className="art-note note-one">
            <span>↗</span> Sources connected
          </div>
          <div className="art-note note-two">
            <span>✳</span> One clear angle
          </div>
          <div className="art-dot dot-one" />
          <div className="art-dot dot-two" />
        </div>
      </div>
      <section className="section-block">
        <div className="section-heading">
          <div>
            <h2>Pick up where you left off</h2>
            <p>Your research and writing, all in one place.</p>
          </div>
          <button className="text-link" onClick={() => announce('Showing all your activity.')}>
            View activity <ArrowRight size={14} />
          </button>
        </div>
        <div className="workflow-grid">
          <NavLink to="/research" className="workflow-card">
            <div className="workflow-top">
              <span className="workflow-icon research-icon">
                <FlaskConical size={19} />
              </span>
              <span className="card-arrow">
                <ArrowUpRight size={16} />
              </span>
            </div>
            <h3>Research assistant</h3>
            <p>Connect the dots across your sources. Find the story beneath the headlines.</p>
            <div className="workflow-bottom">
              <span>
                <span className="status-dot green" /> Your research desk
              </span>
              <span className="workflow-go">
                Open <ArrowRight size={13} />
              </span>
            </div>
          </NavLink>
          <NavLink to="/writing" className="workflow-card">
            <div className="workflow-top">
              <span className="workflow-icon writing-icon">
                <FileText size={19} />
              </span>
              <span className="card-arrow">
                <ArrowUpRight size={16} />
              </span>
            </div>
            <h3>Writing assistant</h3>
            <p>Sharpen your draft while keeping your voice, your facts, and your intent.</p>
            <div className="workflow-bottom">
              <span>
                <span className="status-dot blue" /> Your writing desk
              </span>
              <span className="workflow-go">
                Open <ArrowRight size={13} />
              </span>
            </div>
          </NavLink>
        </div>
      </section>
      <section className="section-block recent-grid">
        <div className="recent-panel">
          <div className="section-heading compact">
            <div>
              <h2>Recent research</h2>
              <p>Ideas in motion</p>
            </div>
            <NavLink to="/research" className="round-arrow">
              <ArrowRight size={15} />
            </NavLink>
          </div>
          <div className="list-rows">
            {sessions.length === 0 && (
              <div className="recent-empty">Your research sessions will appear here.</div>
            )}
            {sessions.map((item, i) => (
              <button
                className="session-row"
                key={item.title}
                onClick={() => window.location.assign('/research')}
              >
                <span className={`session-symbol symbol-${i}`}>{item.icon}</span>
                <span className="session-main">
                  <strong>{item.title}</strong>
                  <small>
                    {item.sources} <span>·</span> {item.time}
                  </small>
                </span>
                <span className={`session-status ${item.status === 'Draft' ? 'status-draft' : ''}`}>
                  {item.status === 'Ready' && <span className="status-dot green" />}
                  {item.status}
                </span>
                <ChevronRight size={14} className="row-chevron" />
              </button>
            ))}
          </div>
          <NavLink to="/research" className="panel-footer">
            See all research <ArrowRight size={14} />
          </NavLink>
        </div>
        <div className="recent-panel">
          <div className="section-heading compact">
            <div>
              <h2>Recent drafts</h2>
              <p>Words taking shape</p>
            </div>
            <NavLink to="/writing" className="round-arrow">
              <ArrowRight size={15} />
            </NavLink>
          </div>
          <div className="draft-list">
            {drafts.length === 0 && (
              <div className="recent-empty">Your newsletter drafts will appear here.</div>
            )}
            {drafts.map((draft) => (
              <button
                className="draft-row"
                key={draft.title}
                onClick={() => window.location.assign('/writing')}
              >
                <span className={`draft-file ${draft.tone}`}>
                  <FileText size={17} />
                </span>
                <span className="draft-main">
                  <strong>{draft.title}</strong>
                  <small>{draft.tag}</small>
                  <span className="draft-meta">
                    {draft.words} <span>·</span> {draft.time}
                  </span>
                </span>
              </button>
            ))}
          </div>
          <NavLink to="/writing" className="panel-footer">
            See all drafts <ArrowRight size={14} />
          </NavLink>
        </div>
      </section>
      <div className="footer-note">
        <span>GOOD STORIES START WITH GOOD SOURCES.</span>
        <span>
          Made for the curious <span className="tiny-spark">✳</span>
        </span>
      </div>
    </>
  )
}
function ResearchPage({ announce, researchResult, onResearchStart, onResearch }) {
  const [sources, setSources] = useState(['', '', ''])
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [sourceIssues, setSourceIssues] = useState({})
  const [pastedSources, setPastedSources] = useState({})
  const busyRef = useRef(false)
  async function runResearch() {
    if (busyRef.current) return
    const sourceInput = [...sources]
    const researchQuestion = question
    if (sourceInput.every((source) => !source.trim())) {
      setError('Add at least one source before analyzing.')
      return
    }
    busyRef.current = true
    setBusy(true)
    setError('')
    const requestId = onResearchStart()
    try {
      const prepared = []
      const failures = {}
      for (const [i, raw] of sourceInput
        .map((s) => s.trim())
        .filter(Boolean)
        .entries()) {
        let url
        try {
          url = new URL(raw)
        } catch {}
        if (url && ['http:', 'https:'].includes(url.protocol)) {
          const manualContent = (pastedSources[i] || '').trim()
          if (manualContent.length >= 80)
            prepared.push({
              title: `Pasted content for ${url.hostname}`,
              url: url.href,
              content: manualContent,
              publishedAt: '',
            })
          else {
            try {
              const { data } = await extractSource(url.href)
              prepared.push(data)
            } catch (e) {
              failures[i] = e.message
            }
          }
        } else
          prepared.push({ title: `Pasted source ${i + 1}`, url: '', content: raw, publishedAt: '' })
      }
      setSourceIssues(failures)
      if (Object.keys(failures).length) {
        setError(
          'Some URLs could not be fetched. Successful sources are saved; paste the inaccessible article text below to continue.',
        )
        return
      }
      const response = await analyzeResearch({ sources: prepared, question: researchQuestion })
      if (onResearch(response.data, researchQuestion, requestId))
        window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) {
      setError(e.message)
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }
  return (
    <>
      <PageHeading
        eyebrow="RESEARCH DESK"
        title="Find the story behind the story."
        right={
          <span className="quiet-pill">
            <span className="status-dot green" />{' '}
            {researchResult ? 'Brief ready' : 'Workspace ready'}
          </span>
        }
      >
        Bring together the pieces. We’ll help you see what connects — and what still needs a closer
        look.
      </PageHeading>
      <div className="research-layout">
        <div>
          <div className="work-panel">
            <div className="panel-title-row">
              <div>
                <span className="step-label">
                  01 <span>—</span> GATHER YOUR SOURCES
                </span>
                <h2>Start with what you’re reading.</h2>
                <p>Add articles, notes, or anything else worth connecting.</p>
              </div>
              <div className="source-count">
                {sources.filter((s) => s.trim()).length}
                <span> sources added</span>
              </div>
            </div>
            <div className="source-list">
              {sources.map((source, index) => (
                <div className="source-input-row" key={index}>
                  <span className="source-index">{String(index + 1).padStart(2, '0')}</span>
                  <input
                    value={source}
                    disabled={busy}
                    onChange={(e) =>
                      setSources(sources.map((v, i) => (i === index ? e.target.value : v)))
                    }
                    placeholder={
                      index === 0 ? 'Paste an article URL or source text…' : 'Add another source…'
                    }
                  />
                  <span className="source-kind">
                    {/^https?:\/\//i.test(source) ? 'URL' : 'Text'}
                  </span>
                  {sourceIssues[index] && (
                    <div className="source-paste-fallback">
                      <strong>{sourceIssues[index]}</strong>
                      <label htmlFor={`source-paste-${index}`}>
                        Paste this article’s text to include it in the research.
                      </label>
                      <textarea
                        id={`source-paste-${index}`}
                        value={pastedSources[index] || ''}
                        disabled={busy}
                        onChange={(e) =>
                          setPastedSources({ ...pastedSources, [index]: e.target.value })
                        }
                        placeholder="Paste at least 80 characters of article text…"
                        rows={5}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
            <button
              className="add-source"
              disabled={busy}
              onClick={() => setSources([...sources, ''])}
            >
              <Plus size={15} /> Add another source
            </button>
            <div className="research-options">
              <div>
                <strong>What are you curious about?</strong>
                <span>Optional · helps us focus the research</span>
              </div>
              <textarea
                value={question}
                disabled={busy}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="e.g. What does this mean for small teams building with AI?"
              />
            </div>
            {error && (
              <div className="error-banner" role="alert">
                {error}
              </div>
            )}
            <div className="panel-actions">
              <span className="privacy-note">
                <Activity size={14} /> Sources are analyzed for evidence and disagreements.
              </span>
              <button
                className="primary-button"
                disabled={busy || sources.filter((s) => s.trim()).length < 1}
                onClick={runResearch}
              >
                {busy ? 'Analyzing sources…' : 'Analyze sources'} {!busy && <Sparkles size={15} />}
              </button>
            </div>
          </div>
          {researchResult && <ResearchBrief result={researchResult} />}
        </div>
        <aside className="research-aside">
          <div className="aside-card">
            <div className="aside-icon">
              <Lightbulb size={17} />
            </div>
            <h3>Build a brief from your sources.</h3>
            <p>
              Use one source for a focused summary, or add more perspectives to compare findings and
              identify disagreements.
            </p>
            <div className="source-tips">
              <span>
                <span className="tip-mark tip-purple">↗</span> Original reporting
              </span>
              <span>
                <span className="tip-mark tip-orange">✳</span> Expert perspective
              </span>
              <span>
                <span className="tip-mark tip-blue">▤</span> Relevant data
              </span>
            </div>
          </div>
          <div className="aside-card small-aside">
            <span className="step-label">YOUR RESEARCH LIBRARY</span>
            <h3>
              {researchResult
                ? 'One brief, ready to build on.'
                : 'Room for your next big question.'}
            </h3>
            <p>
              {researchResult
                ? 'Your latest brief is available to use in Editorial Output.'
                : 'Your saved research sessions will show up here.'}
            </p>
            <div className="aside-empty">
              <FolderOpen size={19} />
              <span>
                {researchResult ? 'Latest brief saved for this session' : 'No saved sessions yet'}
              </span>
            </div>
          </div>
        </aside>
      </div>
    </>
  )
}
function ResearchBrief({ result }) {
  const b = result.brief
  const refs = result.sources
  const linkIds = (ids) =>
    ids?.map((id) => {
      const s = refs.find((x) => x.id === id)
      return s?.url ? (
        <a key={id} href={s.url} target="_blank" rel="noreferrer" className="source-ref">
          [{id}]
        </a>
      ) : (
        <span key={id} className="source-ref">
          [{id}]
        </span>
      )
    })
  return (
    <section className="brief-panel">
      <div className="brief-head">
        <span className="step-label">RESEARCH BRIEF</span>
        <span className="quiet-pill">
          <span className="status-dot green" /> Evidence-linked
        </span>
      </div>
      <h2>{b.recommendedAngle.title}</h2>
      <p className="brief-summary">
        {b.executiveSummary} {linkIds(b.summarySourceIds)}
      </p>
      <div className="angle-recommendation">
        <strong>Recommended angle</strong>
        <p>
          {b.recommendedAngle.reason} {linkIds(b.recommendedAngle.sourceIds)}
        </p>
      </div>
      {[
        ['What happened', b.whatHappened],
        ['Why it matters', b.whyItMatters],
        ['Key developments', b.keyDevelopments],
      ].map(([heading, items]) => (
        <div className="brief-section" key={heading}>
          <h3>{heading}</h3>
          {items.map((item, i) => (
            <p key={i}>
              {item.text} {linkIds(item.sourceIds)}{' '}
              <span className="claim-kind">
                {String(item.kind || 'reported fact').replace('_', ' ')}
              </span>
            </p>
          ))}
        </div>
      ))}
      <div className="brief-section">
        <h3>Evidence and supporting claims</h3>
        {b.evidence.map((item, i) => (
          <p key={i}>
            <strong>{item.classification}:</strong> {item.claim} {linkIds(item.sourceIds)}
          </p>
        ))}
      </div>
      <div className="brief-section">
        <h3>Facts, analysis & speculation</h3>
        {b.factsVsAnalysis.map((item, i) => (
          <p key={i}>
            <span className="claim-kind">{item.kind.replace('_', ' ')}</span> {item.text}{' '}
            {linkIds(item.sourceIds)}
          </p>
        ))}
      </div>
      <div className="brief-section">
        <h3>Who should care?</h3>
        <ul>
          {b.whoShouldCare.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      </div>
      <div className="brief-columns">
        <div className="brief-section">
          <h3>Opportunities for founders</h3>
          <ul>
            {b.opportunities.founders.map((x, i) => (
              <li key={i}>
                {typeof x === 'string' ? x : x.text}
                {typeof x === 'string' ? null : linkIds(x.sourceIds)}
              </li>
            ))}
          </ul>
        </div>
        <div className="brief-section">
          <h3>For developers & builders</h3>
          <ul>
            {b.opportunities.builders.map((x, i) => (
              <li key={i}>
                {typeof x === 'string' ? x : x.text}
                {typeof x === 'string' ? null : linkIds(x.sourceIds)}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="brief-section">
        <h3>Newsletter angles</h3>
        {b.angles.map((a, i) => (
          <div className="angle-item" key={i}>
            <strong>
              {a.title} {linkIds(a.sourceIds)}
            </strong>
            <p>{a.description}</p>
            <small>{a.whyItWorks}</small>
          </div>
        ))}
      </div>
      <div className="brief-columns">
        {[
          ['Common findings', b.comparison.commonFindings],
          ['Unique information', b.comparison.uniqueInformation],
          ['Contradictions', b.comparison.contradictions],
          ['Still missing', b.comparison.missingInformation],
        ].map(([h, items]) => (
          <div className="brief-section" key={h}>
            <h3>{h}</h3>
            <ul>
              {items.map((x, i) => (
                <li key={i}>
                  {typeof x === 'string' ? x : x.text}
                  {typeof x === 'string' ? null : linkIds(x.sourceIds)}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="brief-section">
        <h3>Questions worth investigating</h3>
        <ul>
          {b.questions.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      </div>
      <div className="brief-section">
        <h3>Sources</h3>
        {refs.map((s) => (
          <p key={s.id}>
            <span className="source-ref">[{s.id}]</span>{' '}
            {s.url ? (
              <a href={s.url} target="_blank" rel="noreferrer">
                {s.title} ↗
              </a>
            ) : (
              s.title
            )}
          </p>
        ))}
      </div>
    </section>
  )
}

function WritingPage({ announce, seedDraft, onRevised }) {
  const [draft, setDraft] = useState(() => seedDraft || readLocal('editorial-ai-writing') || '')
  const [original, setOriginal] = useState('')
  const [analysis, setAnalysis] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [accepted, setAccepted] = useState({})
  const [history, setHistory] = useState([])
  const [compare, setCompare] = useState(false)
  const words = draft.trim().split(/\s+/).filter(Boolean).length
  const sentences = draft.split(/[.!?]+/).filter((s) => s.trim()).length
  async function run() {
    setBusy(true)
    setError('')
    try {
      const response = await analyzeWriting(draft)
      setAnalysis(response.data)
      setOriginal(draft)
      setAccepted({})
      setHistory([])
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }
  function accept(index) {
    const issue = analysis.analysis.issues[index]
    if (!issue) return
    const next = draft.replace(issue.excerpt, issue.suggestion)
    if (next === draft) {
      setError(
        'This suggestion no longer matches the current draft. Run analysis again to refresh it.',
      )
      return
    }
    setHistory((h) => [...h, draft])
    setDraft(next)
    onRevised(next)
    setAccepted((a) => ({ ...a, [index]: true }))
  }
  function undo() {
    const previous = history.at(-1)
    if (previous === undefined) return
    setDraft(previous)
    onRevised(previous)
    setHistory((h) => h.slice(0, -1))
    setAccepted({})
  }
  function acceptAll() {
    let next = draft
    const done = {}
    analysis.analysis.issues.forEach((issue, index) => {
      if (accepted[index]) return
      const updated = next.replace(issue.excerpt, issue.suggestion)
      if (updated !== next) {
        next = updated
        done[index] = true
      }
    })
    if (next !== draft) {
      setHistory((h) => [...h, draft])
      setDraft(next)
      onRevised(next)
      setAccepted((a) => ({ ...a, ...done }))
    }
  }
  return (
    <>
      <PageHeading eyebrow="WRITING DESK" title="Make every sentence sound like you.">
        Thoughtful feedback, clear choices. Your draft stays yours.
      </PageHeading>
      <div className="writing-toolbar">
        <div className="writing-doc-name">
          <span className="doc-icon">
            <FileText size={16} />
          </span>
          <span>{seedDraft ? 'Newsletter draft' : 'Untitled draft'}</span>
          <ChevronDown size={14} />
        </div>
        <div className="toolbar-right">
          <span className="saved-label">
            <span className="status-dot green" /> Saved in this browser
          </span>
          <button className="outline-button" onClick={() => setCompare(!compare)}>
            <Activity size={15} />
            {compare ? 'Hide compare' : 'Compare'}
          </button>
          {history.length > 0 && (
            <button className="outline-button" onClick={undo}>
              Undo
            </button>
          )}
          <button className="primary-button" disabled={busy || !draft.trim()} onClick={run}>
            {busy ? 'Analyzing…' : 'Analyze draft'}
            {!busy && <Sparkles size={15} />}
          </button>
        </div>
      </div>
      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}
      <div className="editor-layout">
        <div className="editor-sheet">
          <input className="draft-title" placeholder="Give your draft a working title…" />
          <div className="editor-body">
            {compare && original ? (
              <div className="compare-view">
                <div>
                  <strong>Original</strong>
                  <p>{original}</p>
                </div>
                <div>
                  <strong>Revised</strong>
                  <p>{draft}</p>
                </div>
              </div>
            ) : (
              <textarea
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value)
                  writeLocal('editorial-ai-writing', e.target.value)
                }}
                aria-label="Draft editor"
                placeholder="Paste your draft here, or start writing something new…"
              />
            )}
          </div>
          <div className="editor-footer">
            <span>Keep your point of view. We’ll help with the rest.</span>
            <span>{draft.length} characters</span>
          </div>
        </div>
        <aside className="feedback-panel">
          <div className="feedback-head">
            <span className="feedback-icon">
              <Sparkles size={15} />
            </span>
            <div>
              <strong>Writing feedback</strong>
              <small>A second set of eyes</small>
            </div>
            <span className="feedback-count">
              {analysis ? analysis.analysis.issues.length : '—'}
            </span>
          </div>
          {analysis ? (
            <div className="issues-list">
              {analysis.analysis.issues.length === 0 ? (
                <div className="feedback-empty">
                  <strong>Nothing to flag.</strong>
                  <p>No significant issues surfaced in these checks.</p>
                </div>
              ) : (
                <>
                  {analysis.analysis.overallNote && (
                    <p className="overall-note">{analysis.analysis.overallNote}</p>
                  )}
                  {analysis.analysis.issues.map((issue, index) => (
                    <div className="issue-card" key={`${index}-${issue.excerpt}`}>
                      <div className="issue-top">
                        <span className={`severity ${issue.severity}`}>{issue.severity}</span>
                        <span className="issue-category">{issue.category}</span>
                      </div>
                      <p className="issue-excerpt">“{issue.excerpt}”</p>
                      <p className="issue-explanation">{issue.explanation}</p>
                      <div className="issue-suggestion">{issue.suggestion}</div>
                      <div className="issue-actions">
                        {accepted[index] === true ? (
                          <span className="accepted-label">Applied ✓</span>
                        ) : accepted[index] === 'rejected' ? (
                          <span className="accepted-label dismissed">Dismissed</span>
                        ) : (
                          <>
                            <button
                              onClick={() => setAccepted((a) => ({ ...a, [index]: 'rejected' }))}
                            >
                              Dismiss
                            </button>
                            <button className="apply-suggestion" onClick={() => accept(index)}>
                              Apply suggestion
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                  {analysis.analysis.issues.some((_, i) => !accepted[i]) && (
                    <button className="accept-all" onClick={acceptAll}>
                      Apply all suggestions
                    </button>
                  )}
                </>
              )}
            </div>
          ) : (
            <div className="feedback-empty">
              <div className="empty-art">
                <FileText size={23} />
                <span>
                  <Sparkles size={11} />
                </span>
              </div>
              <strong>Let’s take a closer look.</strong>
              <p>Run an analysis and review each specific suggestion before applying it.</p>
              <span className="feedback-checks">
                Long sentences · Passive voice · Filler · Jargon · Repetition · Paragraphs
              </span>
            </div>
          )}
          <div className="metrics-box">
            <div className="metrics-title">
              <BarChart3 size={15} /> Draft at a glance
            </div>
            <div className="metric-grid">
              <div>
                <strong>{analysis?.metrics.wordCount ?? words}</strong>
                <span>Words</span>
              </div>
              <div>
                <strong>{analysis?.metrics.sentenceCount ?? sentences}</strong>
                <span>Sentences</span>
              </div>
              <div>
                <strong>
                  {analysis?.metrics.averageWordsPerSentence ??
                    (sentences ? (words / sentences).toFixed(1) : '0')}
                </strong>
                <span>Words / sentence</span>
              </div>
              <div>
                <strong>
                  {analysis?.metrics.readingTimeMinutes ?? Math.max(1, Math.ceil(words / 220))} min
                </strong>
                <span>Reading time</span>
              </div>
            </div>
            <div className="readability">
              Readability: <strong>{analysis?.metrics.readability || '—'}</strong>
            </div>
            {analysis && (
              <div className="rule-checks">
                <span>Long sentences {analysis.metrics.longSentences}</span>
                <span>Passive voice {analysis.metrics.passiveSentences}</span>
                <span>Filler {analysis.metrics.fillerMatches}</span>
                <span>Jargon {analysis.metrics.jargonTerms.length}</span>
                <span>Repetition {analysis.metrics.repeatedPhrases.length}</span>
                <span>Long paragraphs {analysis.metrics.difficultParagraphs}</span>
              </div>
            )}
            <p>Readability is a directional signal, not a measure of good writing.</p>
          </div>
        </aside>
      </div>
    </>
  )
}

function EditorialPage({ researchResult, editorialResult, onEditorial, revised }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const busyRef = useRef(false)
  async function generate() {
    if (busyRef.current) return
    if (!isValidResearchResult(researchResult)) {
      setError('Generate a valid Research brief before creating an Editorial draft.')
      return
    }
    busyRef.current = true
    setBusy(true)
    setError('')
    const researchId = researchResult.researchId
    try {
      const response = await generateEditorial({
        brief: researchResult.brief,
        sources: researchResult.sources.map((s) => ({ title: s.title, url: s.url || '' })),
      })
      if (!onEditorial(response.data, researchId))
        setError(
          'The Research brief changed. Generate a new Editorial draft from the latest brief.',
        )
    } catch (e) {
      setError(e.message)
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }
  const hasResearch = isValidResearchResult(researchResult)
  const finalDraft = revised || editorialResult?.draft || ''
  return (
    <>
      <PageHeading eyebrow="EDITORIAL OUTPUT" title="Turn your research into a story.">
        A strong brief is only the beginning. Shape the insight into something worth sharing.
      </PageHeading>
      <div className="editorial-flow">
        <div className="flow-rail">
          <div className={`flow-step ${hasResearch ? 'complete' : 'current'}`}>
            <span>{hasResearch ? '✓' : '01'}</span>
            <div>
              <strong>Choose research</strong>
              <small>Start with an evidence-backed brief</small>
            </div>
          </div>
          <div className="flow-connector" />
          <div
            className={`flow-step ${editorialResult ? 'complete' : hasResearch ? 'current' : ''}`}
          >
            <span>{editorialResult ? '✓' : '02'}</span>
            <div>
              <strong>Find your angle</strong>
              <small>Decide what matters to your readers</small>
            </div>
          </div>
          <div className="flow-connector" />
          <div className={`flow-step ${revised ? 'complete' : ''}`}>
            <span>{revised ? '✓' : '03'}</span>
            <div>
              <strong>Shape the story</strong>
              <small>Draft, refine, and make it yours</small>
            </div>
          </div>
        </div>
        <div className="editorial-main">
          {!editorialResult ? (
            <div className="editorial-empty">
              <div className="editorial-illustration">
                <div className="ill-page">
                  <span />
                  <span />
                  <span />
                  <i />
                </div>
                <div className="ill-star star-a">✳</div>
                <div className="ill-star star-b">✦</div>
                <div className="ill-orbit" />
              </div>
              <span className="step-label">YOUR NEXT EDITION STARTS HERE</span>
              <h2>
                {hasResearch
                  ? 'Your research has a story to tell.'
                  : 'Every good story has a source.'}
              </h2>
              <p>
                {hasResearch
                  ? 'Generate a source-linked newsletter draft from your evidence-backed research brief. The original is yours to review and refine.'
                  : 'Generate a valid Research brief first to create an evidence-backed newsletter draft.'}
              </p>
              {error && (
                <div className="error-banner" role="alert">
                  {error}
                </div>
              )}
              {hasResearch ? (
                <button className="primary-button" disabled={busy} onClick={generate}>
                  {busy ? 'Finding the story…' : 'Generate newsletter draft'}{' '}
                  {!busy && <Sparkles size={15} />}
                </button>
              ) : (
                <NavLink to="/research" className="primary-button">
                  Go to research <ArrowRight size={15} />
                </NavLink>
              )}
              <div className="editorial-note">
                <Clock3 size={13} /> Drafts target 300–500 words and include source references.
              </div>
            </div>
          ) : (
            <div className="editorial-result">
              <div className="editorial-result-head">
                <span className="step-label">
                  ORIGINAL EDITORIAL DRAFT · {editorialResult.wordCount} WORDS
                </span>
                <NavLink to="/writing" className="primary-button">
                  Review in Writing <ArrowRight size={14} />
                </NavLink>
              </div>
              <h2>{editorialResult.headline}</h2>
              <div className="editorial-copy">{editorialResult.draft}</div>
              <div className="source-reference-list">
                <h3>Source references</h3>
                {editorialResult.sourceReferences.map((s) => (
                  <p key={s.index}>
                    [{s.index}]{' '}
                    {s.url ? (
                      <a target="_blank" rel="noreferrer" href={s.url}>
                        {s.title} ↗
                      </a>
                    ) : (
                      s.title
                    )}
                  </p>
                ))}
              </div>
              <div className="final-editorial">
                <span className="step-label">FINAL REVISED EDITORIAL PIECE</span>
                <p>{finalDraft}</p>
                <small>
                  {revised
                    ? 'Edits accepted in Writing Assistant.'
                    : 'No edits applied yet — the original remains unchanged.'}
                </small>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

export default App
