import { useMemo, useState, useCallback } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { jobs } from './data/jobs'

const tierColors = {
  0: '#e5e7eb',
  1: '#dbeafe',
  2: '#dcfce7',
  3: '#fef3c7',
  4: '#fed7aa',
  5: '#fbcfe8',
  6: '#e9d5ff',
  7: '#fecaca',
  8: '#bfdbfe',
  9: '#ddd6fe',
}

function isUnknownJobName(name) {
  return !name || name === '不明' || name === '[[]]' || !jobs[name]
}

function getSafeRequires(job) {
  return (job.requires || []).filter((name) => !isUnknownJobName(name))
}

function getTierLabel(job) {
  if (job.itemJob) return 'アイテム職'
  return `${job.tier}次職`
}

function getFilterKey(job) {
  if (job.itemJob) return 'item'
  return String(job.tier)
}

function getFilterLabel(key) {
  if (key === 'item') return 'アイテム職'
  return `${key}次職`
}

function JobNode({ data }) {
  const opacity = data.dimmed ? 0.28 : 1
  const borderColor = data.highlighted ? '#0f172a' : '#334155'
  const boxShadow = data.highlighted
    ? '0 0 0 3px rgba(15,23,42,0.15), 0 4px 12px rgba(15,23,42,0.18)'
    : '0 2px 6px rgba(15, 23, 42, 0.08)'

  return (
    <div
      className="job-node"
      style={{
        background: data.backgroundColor,
        opacity,
        borderColor,
        boxShadow,
      }}
    >
      <Handle type="target" position={data.targetPosition} />
      <div className="job-node-title">{data.label}</div>
      <div className="job-node-sub">{data.subLabel}</div>
      {data.itemJob && <div className="job-badge item">📦</div>}
      <Handle type="source" position={data.sourcePosition} />
    </div>
  )
}

const nodeTypes = {
  jobNode: JobNode,
}

function buildUniqueGraph(target, jobsData) {
  const nodeNames = new Set()
  const edges = []
  const edgeSet = new Set()

  function dfs(jobName) {
    if (isUnknownJobName(jobName)) return
    if (nodeNames.has(jobName)) return

    nodeNames.add(jobName)

    const job = jobsData[jobName]
    const reqs = getSafeRequires(job)

    reqs.forEach((requiredJob) => {
      const edgeKey = `${jobName}=>${requiredJob}`

      if (!edgeSet.has(edgeKey)) {
        edgeSet.add(edgeKey)
        edges.push({
          id: edgeKey,
          source: jobName,
          target: requiredJob,
        })
      }

      dfs(requiredJob)
    })
  }

  dfs(target)

  return {
    nodeNames: [...nodeNames],
    edges,
  }
}

function makeLayout(nodeNames, jobsData, direction = 'horizontal') {
  const groups = {}

  nodeNames.forEach((jobName) => {
    const job = jobsData[jobName]
    const key = job.itemJob ? 'item' : String(job.tier)
    if (!groups[key]) groups[key] = []
    groups[key].push(jobName)
  })

  // 図の配置は今まで通り：アイテム職を先頭側
  const orderedKeys = Object.keys(groups).sort((a, b) => {
    if (a === 'item') return -1
    if (b === 'item') return 1
    return Number(a) - Number(b)
  })

  const nodes = []
  const gapMain = 260
  const gapCross = 140

  orderedKeys.forEach((groupKey, groupIndex) => {
    const arr = groups[groupKey].sort((a, b) => a.localeCompare(b, 'ja'))
    const startCross = -((arr.length - 1) * gapCross) / 2

    arr.forEach((jobName, index) => {
      const job = jobsData[jobName]

      const position =
        direction === 'horizontal'
          ? { x: groupIndex * gapMain, y: startCross + index * gapCross }
          : { x: startCross + index * gapCross, y: groupIndex * gapMain }

      nodes.push({
        id: jobName,
        type: 'jobNode',
        position,
        data: {
          label: jobName,
          subLabel: getTierLabel(job),
          itemJob: job.itemJob,
          backgroundColor: tierColors[job.tier] || '#ffffff',
          sourcePosition:
            direction === 'horizontal' ? Position.Left : Position.Top,
          targetPosition:
            direction === 'horizontal' ? Position.Right : Position.Bottom,
          highlighted: false,
          dimmed: false,
        },
      })
    })
  })

  return nodes
}

function collectRequired(target, jobsData) {
  const result = new Set()

  function dfs(jobName) {
    if (isUnknownJobName(jobName)) return
    if (result.has(jobName)) return
    result.add(jobName)

    const job = jobsData[jobName]
    getSafeRequires(job).forEach(dfs)
  }

  dfs(target)
  return [...result]
}

// クリックした職に必要な職業（下位・前提側）を強調
function collectHighlightSet(selectedJob, jobsData) {
  if (!selectedJob || !jobsData[selectedJob]) {
    return { nodeSet: new Set(), edgeSet: new Set() }
  }

  const nodeSet = new Set()
  const edgeSet = new Set()

  function dfs(jobName) {
    if (isUnknownJobName(jobName)) return
    if (nodeSet.has(jobName)) return

    nodeSet.add(jobName)

    const job = jobsData[jobName]
    const reqs = getSafeRequires(job)

    reqs.forEach((requiredJob) => {
      edgeSet.add(`${jobName}=>${requiredJob}`)
      dfs(requiredJob)
    })
  }

  dfs(selectedJob)

  return { nodeSet, edgeSet }
}

export default function App() {
  const visibleJobs = useMemo(() => {
    return Object.entries(jobs)
      .filter(([, data]) => !data.hiddenInSearch)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => {
        const aKey = getFilterKey(a)
        const bKey = getFilterKey(b)

        // 選択一覧ではアイテム職を末尾
        if (aKey === 'item' && bKey !== 'item') return 1
        if (aKey !== 'item' && bKey === 'item') return -1
        if (aKey !== bKey) return Number(aKey) - Number(bKey)
        return a.name.localeCompare(b.name, 'ja')
      })
  }, [])

  const filterOptions = useMemo(() => {
    const keys = [...new Set(visibleJobs.map((job) => getFilterKey(job)))]
    return keys.sort((a, b) => {
      if (a === 'item') return 1
      if (b === 'item') return -1
      return Number(a) - Number(b)
    })
  }, [visibleJobs])

  const defaultJob = visibleJobs[0]?.name ?? ''

  const [selectedFilter, setSelectedFilter] = useState('all')
  const [input, setInput] = useState(defaultJob)
  const [target, setTarget] = useState(defaultJob)
  const [direction, setDirection] = useState('horizontal')
  const [selectedJob, setSelectedJob] = useState(null)
  const [flowKey, setFlowKey] = useState(0)

  const filteredJobs = useMemo(() => {
    return visibleJobs.filter((job) => {
      if (selectedFilter === 'all') return true
      return getFilterKey(job) === selectedFilter
    })
  }, [visibleJobs, selectedFilter])

  const graphData = useMemo(() => {
    if (!target || !jobs[target]) {
      return {
        nodes: [],
        edges: [],
        requiredJobs: [],
      }
    }

    const uniqueGraph = buildUniqueGraph(target, jobs)
    const baseNodes = makeLayout(uniqueGraph.nodeNames, jobs, direction)
    const { nodeSet, edgeSet } = collectHighlightSet(selectedJob, jobs)
    const hasSelection = !!selectedJob

    const nodes = baseNodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        highlighted: hasSelection ? nodeSet.has(node.id) : false,
        dimmed: hasSelection ? !nodeSet.has(node.id) : false,
      },
    }))

    const edges = uniqueGraph.edges.map((edge) => ({
      ...edge,
      animated: false,
      style: hasSelection
        ? edgeSet.has(edge.id)
          ? { stroke: '#0f172a', strokeWidth: 3, opacity: 1 }
          : { stroke: '#94a3b8', strokeWidth: 1.5, opacity: 0.18 }
        : { stroke: '#64748b', strokeWidth: 2, opacity: 0.9 },
    }))

    return {
      nodes,
      edges,
      requiredJobs: collectRequired(target, jobs),
    }
  }, [target, direction, selectedJob])

  const handleShow = useCallback(() => {
    if (!input || !jobs[input]) return
    setTarget(input)
    setSelectedJob(null)
    setFlowKey((prev) => prev + 1)
  }, [input])

  const selectedDetail = selectedJob ? jobs[selectedJob] : null

  return (
    <div className="app">
      <header className="topbar">

        <div className="title-row">
          <h1>チビクエスト職業ルート検索</h1>

          <div className="header-ad">
            広告スペース
          </div>
        </div>

        <div className="toolbar">
          <div className="selector-group">
            <label className="toolbar-label">分類</label>
            <select
              value={selectedFilter}
              onChange={(e) => {
                const value = e.target.value
                setSelectedFilter(value)

                const nextJobs = visibleJobs.filter((job) => {
                  if (value === 'all') return true
                  return getFilterKey(job) === value
                })
                if (nextJobs.length > 0) {
                  setInput(nextJobs[0].name)
                }
              }}
            >
              <option value="all">すべて</option>
              {filterOptions.map((key) => (
                <option key={key} value={key}>
                  {getFilterLabel(key)}
                </option>
              ))}
            </select>
          </div>

          <div className="selector-group selector-main">
            <label className="toolbar-label">職業</label>
            <select value={input} onChange={(e) => setInput(e.target.value)}>
              {filteredJobs.map((job) => (
                <option key={job.name} value={job.name}>
                  {job.name}
                </option>
              ))}
            </select>
          </div>

          <div className="button-group">
            <button onClick={handleShow}>表示</button>
            <button
              onClick={() => {
                setDirection('horizontal')
                setFlowKey((prev) => prev + 1)
              }}
            >
              横向き
            </button>
            <button
              onClick={() => {
                setDirection('vertical')
                setFlowKey((prev) => prev + 1)
              }}
            >
              縦向き
            </button>
            <button onClick={() => setFlowKey((prev) => prev + 1)}>
              リセット
            </button>
          </div>
        </div>
      </header>

      <main className="main">
        <section className="graph-panel">
          <div className="panel-header">
            <div className="panel-title">{target} に必要な職業ツリー</div>

            <div className="legend">
              <span className="legend-item">
                <span className="legend-color tier0" />
                0次職
              </span>
              <span className="legend-item">
                <span className="legend-color tier1" />
                1次職
              </span>
              <span className="legend-item">
                <span className="legend-color tier2" />
                2次職
              </span>
              <span className="legend-item">
                <span className="legend-color tier3" />
                3次職
              </span>
              <span className="legend-item">📦 アイテム職</span>
              <span className="legend-item">クリックで必要職を強調</span>
            </div>
          </div>

          <div className="flow-wrapper">
            <ReactFlow
              key={flowKey}
              nodes={graphData.nodes}
              edges={graphData.edges}
              nodeTypes={nodeTypes}
              fitView
              minZoom={0.2}
              maxZoom={2}
              nodesDraggable={false}
              panOnDrag
              zoomOnScroll
              zoomOnPinch
              zoomOnDoubleClick={false}
              onNodeClick={(_, node) => {
                setSelectedJob(node.id)
              }}
            >
              <Background />
              <Controls />
            </ReactFlow>
          </div>
        </section>

        <aside className="side-panel">
          <div className="detail-box">
            {!selectedDetail ? (
              <>
                <h2>職業詳細</h2>
                <p>ノードをクリックしてください</p>
              </>
            ) : (
              <>
                <h2>{selectedJob}</h2>
                <p>{getTierLabel(selectedDetail)}</p>

                {selectedDetail.needLv != null && (
                  <>
                    <h3>必要LV</h3>
                    <p>{selectedDetail.needLv}</p>
                  </>
                )}

                {selectedDetail.itemJob && (
                  <>
                    <h3>必要アイテム</h3>
                    <p className="item-job-text">{selectedDetail.changeItem}</p>
                  </>
                )}

                <h3>前提職業</h3>
                {getSafeRequires(selectedDetail).length === 0 ? (
                  <p>なし</p>
                ) : (
                  <ul>
                    {getSafeRequires(selectedDetail).map((jobName) => (
                      <li key={jobName}>{jobName}</li>
                    ))}
                  </ul>
                )}

                <h3>マスターLV</h3>
                <p>{selectedDetail.masterLv ?? '未設定'}</p>

                <h3>覚える技（覚える職業LV）</h3>
                {selectedDetail.skills.length === 0 ? (
                  <p>なし</p>
                ) : (
                  <ul>
                    {selectedDetail.skills.map((skill, idx) => (
                      <li key={`${skill.name}-${skill.learnLv}-${idx}`}>
                        {skill.name}
                        {skill.learnLv != null ? ` (${skill.learnLv})` : ''}
                      </li>
                    ))}
                  </ul>
                )}

                <h3>最大アップ</h3>
                <ul>
                  <li>HP {selectedDetail.maxUp.hp ?? 0}</li>
                  <li>MP {selectedDetail.maxUp.mp ?? 0}</li>
                  <li>攻 {selectedDetail.maxUp.atk ?? 0}</li>
                  <li>魔 {selectedDetail.maxUp.mag ?? 0}</li>
                  <li>運 {selectedDetail.maxUp.luck ?? 0}</li>
                </ul>
              </>
            )}
          </div>

          <div className="required-box">
            <h2>必要な職業</h2>
            <ul>
              {graphData.requiredJobs.map((jobName) => (
                <li key={jobName}>{jobName}</li>
              ))}
            </ul>
          </div>
        </aside>
      </main>
    </div>
  )
}