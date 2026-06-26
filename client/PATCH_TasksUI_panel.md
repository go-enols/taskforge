# Tasks UI — 展开面板替换补丁

## 位置

`client/src/renderer/src/pages/Tasks.tsx`，约行 1063–1126

## 改动

替换展开面板 `{expandedId === task.id && (...)}` 为带 Tab 栏的版本。

### 旧代码（约 1063 行起）

```tsx
                    {expandedId === task.id && (
                      <div className="border-t border-border-light bg-bg-tertiary/30">
                        <div className="flex items-center justify-between px-4 py-2 border-b border-border-light">
                          <div className="flex items-center gap-2">
                            <FileText size={14} className="text-text-muted" />
                            <span className="text-xs font-medium text-text-muted">
                              {t('tasks.logs')}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <select
                              value={logFilter}
                              onChange={(e) => setLogFilter(e.target.value)}
                              className="px-1.5 py-0.5 rounded text-xs border border-border-light bg-bg-card"
                            >
                              <option value="all">{t('tasks.logFilter.all')}</option>
                              <option value="info">{t('tasks.logFilter.info')}</option>
                              <option value="warn">{t('tasks.logFilter.warn')}</option>
                              <option value="error">{t('tasks.logFilter.error')}</option>
                              <option value="debug">{t('tasks.logFilter.debug')}</option>
                            </select>
                            <button
                              onClick={() => handleClearLogs(task.id)}
                              className="flex items-center gap-1 px-2 py-1 rounded text-xs text-danger hover:bg-danger-light transition-colors"
                            >
                              <Trash2 size={12} />
                              {t('tasks.clearLogs')}
                            </button>
                          </div>
                        </div>
                        <div className="max-h-64 overflow-y-auto px-4 py-2">
                          {logsLoading ? (
                            <div className="text-xs text-text-muted py-2">
                              {t('common.loading')}
                            </div>
                          ) : logs.length === 0 ? (
                            <div className="text-xs text-text-muted py-2">{t('tasks.noLogs')}</div>
                          ) : (
                            <div className="space-y-0.5 font-mono text-xs">
                              {logs
                                .filter((log) => logFilter === 'all' || log.level === logFilter)
                                .map((log, idx) => (
                                  <div key={log.id ?? idx} className="flex gap-3">
                                    <span className="text-text-muted shrink-0">
                                      {new Date(log.timestamp).toLocaleTimeString()}
                                    </span>
                                    <span
                                      className={`shrink-0 w-10 ${LOG_LEVEL_STYLES[log.level]}`}
                                    >
                                      [{log.level.toUpperCase()}]
                                    </span>
                                    <span className="text-text-secondary break-all">
                                      {log.message}
                                    </span>
                                  </div>
                                ))}
                              <div ref={logEndRef} />
                            </div>
                          )}
                        </div>
                      </div>
                    )}
```

### 新代码

```tsx
                    {expandedId === task.id && (
                      <div className="border-t border-border-light bg-bg-tertiary/30">
                        {/* Tab 栏 */}
                        <div className="flex items-center gap-2 px-4 py-1.5 border-b border-border-light">
                          <button
                            onClick={() => setTab('logs')}
                            className={`text-xs px-2 py-1 rounded transition-colors ${
                              tab === 'logs' ? 'bg-primary/10 text-primary font-medium' : 'text-text-muted hover:text-text-secondary'
                            }`}
                          >
                            <FileText size={12} className="inline mr-1" />{t('tasks.logs')}
                          </button>
                          <button
                            onClick={() => setTab('data')}
                            className={`text-xs px-2 py-1 rounded transition-colors ${
                              tab === 'data' ? 'bg-primary/10 text-primary font-medium' : 'text-text-muted hover:text-text-secondary'
                            }`}
                          >
                            Data ({dataSnapshots.size})
                          </button>
                          <button
                            onClick={() => setTab('output')}
                            className={`text-xs px-2 py-1 rounded transition-colors ${
                              tab === 'output' ? 'bg-primary/10 text-primary font-medium' : 'text-text-muted hover:text-text-secondary'
                            }`}
                          >
                            Output
                          </button>
                        </div>

                        {/* Logs Tab */}
                        {tab === 'logs' && (
                          <>
                            <div className="flex items-center justify-between px-4 py-2">
                              <div className="flex items-center gap-2">
                                <select
                                  value={logFilter}
                                  onChange={(e) => setLogFilter(e.target.value)}
                                  className="px-1.5 py-0.5 rounded text-xs border border-border-light bg-bg-card"
                                >
                                  <option value="all">{t('tasks.logFilter.all')}</option>
                                  <option value="info">{t('tasks.logFilter.info')}</option>
                                  <option value="warn">{t('tasks.logFilter.warn')}</option>
                                  <option value="error">{t('tasks.logFilter.error')}</option>
                                  <option value="debug">{t('tasks.logFilter.debug')}</option>
                                </select>
                                <button
                                  onClick={() => handleClearLogs(task.id)}
                                  className="flex items-center gap-1 px-2 py-1 rounded text-xs text-danger hover:bg-danger-light transition-colors"
                                >
                                  <Trash2 size={12} />
                                  {t('tasks.clearLogs')}
                                </button>
                              </div>
                            </div>
                            <div className="max-h-64 overflow-y-auto px-4 py-2">
                              {logsLoading ? (
                                <div className="text-xs text-text-muted py-2">
                                  {t('common.loading')}
                                </div>
                              ) : logs.length === 0 ? (
                                <div className="text-xs text-text-muted py-2">{t('tasks.noLogs')}</div>
                              ) : (
                                <div className="space-y-0.5 font-mono text-xs">
                                  {logs
                                    .filter((log) => logFilter === 'all' || log.level === logFilter)
                                    .map((log, idx) => (
                                      <div key={log.id ?? idx} className="flex gap-3">
                                        <span className="text-text-muted shrink-0">
                                          {new Date(log.timestamp).toLocaleTimeString()}
                                        </span>
                                        <span className={`shrink-0 w-10 ${LOG_LEVEL_STYLES[log.level]}`}>
                                          [{log.level.toUpperCase()}]
                                        </span>
                                        <span className="text-text-secondary break-all">
                                          {log.message}
                                        </span>
                                      </div>
                                    ))}
                                  <div ref={logEndRef} />
                                </div>
                              )}
                            </div>
                          </>
                        )}

                        {/* Data Tab */}
                        {tab === 'data' && (
                          <div className="max-h-64 overflow-y-auto px-4 py-2">
                            {dataSnapshots.size === 0 ? (
                              <div className="text-xs text-text-muted py-2">No data snapshots</div>
                            ) : (
                              <div className="space-y-2">
                                {Array.from(dataSnapshots.values()).map((snap) => (
                                  <div key={snap.key} className="border border-border-light rounded p-2 bg-bg-card">
                                    <div className="flex items-center gap-2 mb-1">
                                      <span className="text-xs font-medium">{snap.label ?? snap.key}</span>
                                      <span className="text-[10px] text-text-muted">· {snap.view}</span>
                                      <span className="text-[10px] text-text-muted ml-auto">
                                        {new Date(snap.updatedAt).toLocaleTimeString()}
                                      </span>
                                    </div>
                                    <pre className="text-[11px] font-mono text-text-secondary overflow-x-auto whitespace-pre-wrap max-h-40">
                                      {JSON.stringify(snap.data, null, 2)}
                                    </pre>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Output Tab */}
                        {tab === 'output' && (
                          <div className="max-h-64 overflow-y-auto px-4 py-2">
                            <div className="text-xs text-text-muted py-2">Task output info</div>
                          </div>
                        )}
                      </div>
                    )}
```
