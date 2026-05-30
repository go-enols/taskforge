import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  Plus,
  Search,
  Trash2,
  Key,
  Copy,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Edit3,
  Download,
  CheckSquare,
  Square
} from 'lucide-react'
import { walletApi, dialogApi } from '../api'
import type { Wallet } from '../types'
import { parseWalletJson, type ParsedWallet } from '../utils/wallet-import'
import Modal from '../components/common/Modal'

type WalletType = 'evm' | 'solana' | 'sui'
type CreateTab = 'keypair' | 'mnemonic'
type ImportTab = 'mnemonic' | 'json'

const WALLET_TYPE_OPTIONS: { value: WalletType; label: string; color: string }[] = [
  { value: 'evm', label: 'EVM', color: 'bg-wallet-evm-bg text-wallet-evm-text' },
  { value: 'solana', label: 'Solana', color: 'bg-wallet-solana-bg text-wallet-solana-text' },
  { value: 'sui', label: 'Sui', color: 'bg-wallet-sui-bg text-wallet-sui-text' }
]

const WALLET_TYPE_BADGE: Record<string, string> = {
  evm: 'bg-wallet-evm-bg text-wallet-evm-text',
  solana: 'bg-wallet-solana-bg text-wallet-solana-text',
  sui: 'bg-wallet-sui-bg text-wallet-sui-text'
}

const truncateAddress = (addr: string): string =>
  addr.length > 10 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr

const Wallets: React.FC = () => {
  const { t } = useTranslation()

  const [wallets, setWallets] = useState<Wallet[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [totalPages, setTotalPages] = useState(0)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [loading, setLoading] = useState(true)

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showBatchBar, setShowBatchBar] = useState(false)

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createTab, setCreateTab] = useState<CreateTab>('keypair')
  const [createType, setCreateType] = useState<WalletType>('evm')
  const [generatedKey, setGeneratedKey] = useState<{ address: string; privateKey: string } | null>(
    null
  )
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)

  const [generatedMnemonic, setGeneratedMnemonic] = useState('')
  const [generatingMnemonic, setGeneratingMnemonic] = useState(false)
  const [mnemonicImportTypes, setMnemonicImportTypes] = useState<WalletType[]>(['evm'])
  const [mnemonicDeriveCount, setMnemonicDeriveCount] = useState(1)
  const [mnemonicDerivedResults, setMnemonicDerivedResults] = useState<
    Array<{ index: number; walletType: string; address: string; privateKey: string }>
  >([])
  const [mnemonicDeriving, setMnemonicDeriving] = useState(false)
  const [mnemonicSaving, setMnemonicSaving] = useState(false)

  const [showImportModal, setShowImportModal] = useState(false)
  const [importTab, setImportTab] = useState<ImportTab>('mnemonic')
  const [mnemonic, setMnemonic] = useState('')
  const [importTypes, setImportTypes] = useState<WalletType[]>(['evm'])
  const [deriveCount, setDeriveCount] = useState(1)
  const [derivedResults, setDerivedResults] = useState<
    Array<{ index: number; walletType: string; address: string; privateKey: string }>
  >([])
  const [deriving, setDeriving] = useState(false)
  const [importSaving, setImportSaving] = useState(false)

  const [jsonFilePath, setJsonFilePath] = useState<string | null>(null)
  const [jsonParsed, setJsonParsed] = useState<ParsedWallet[]>([])
  const [jsonError, setJsonError] = useState('')
  const [jsonImporting, setJsonImporting] = useState(false)
  const [mnemonicSaveProgress, setMnemonicSaveProgress] = useState({ current: 0, total: 0 })
  const [importSaveProgress, setImportSaveProgress] = useState({ current: 0, total: 0 })
  const [jsonSaveProgress, setJsonSaveProgress] = useState({ current: 0, total: 0 })

  const [deleteTarget, setDeleteTarget] = useState<Wallet | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [batchDeleting, setBatchDeleting] = useState(false)
  const [showBatchConfirm, setShowBatchConfirm] = useState(false)

  const [editTarget, setEditTarget] = useState<Wallet | null>(null)
  const [editLabels, setEditLabels] = useState<string[]>([])
  const [editLabelInput, setEditLabelInput] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  const [visiblePrivateKeys, setVisiblePrivateKeys] = useState<Set<string>>(new Set())
  const [privateKeyMap, setPrivateKeyMap] = useState<Record<string, string>>({})

  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [copiedPkId, setCopiedPkId] = useState<string | null>(null)

  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current)
    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 300)
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current)
    }
  }, [search])

  const fetchWallets = useCallback(async () => {
    setLoading(true)
    try {
      const res = await walletApi.list(page, pageSize, debouncedSearch)
      setWallets(res.items)
      setTotal(res.total)
      setTotalPages(res.totalPages)
    } catch {
      setWallets([])
      toast.error(t('wallets.operationFailed'))
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, debouncedSearch, t])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchWallets()
  }, [fetchWallets])

  const handleCopy = async (text: string, id: string, type: 'address' | 'pk'): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text)
      if (type === 'address') setCopiedId(id)
      else setCopiedPkId(id)
      setTimeout(() => {
        if (type === 'address') setCopiedId(null)
        else setCopiedPkId(null)
      }, 2000)
    } catch {
      toast.error(t('wallets.operationFailed'))
    }
  }

  const togglePrivateKey = async (wallet: Wallet): Promise<void> => {
    if (visiblePrivateKeys.has(wallet.id)) {
      setVisiblePrivateKeys((prev) => {
        const next = new Set(prev)
        next.delete(wallet.id)
        return next
      })
      return
    }
    if (privateKeyMap[wallet.id]) {
      setVisiblePrivateKeys((prev) => new Set(prev).add(wallet.id))
      return
    }
    try {
      const full = await walletApi.get(wallet.id)
      if (full?.privateKey) {
        setPrivateKeyMap((prev) => ({ ...prev, [wallet.id]: full.privateKey! }))
        setVisiblePrivateKeys((prev) => new Set(prev).add(wallet.id))
      } else {
        toast.error(t('wallets.operationFailed'))
      }
    } catch {
      toast.error(t('wallets.operationFailed'))
    }
  }

  const handleGenerate = async (): Promise<void> => {
    setGenerating(true)
    setGeneratedKey(null)
    try {
      const result = await walletApi.generateKeypair(createType)
      setGeneratedKey({ address: result.address, privateKey: result.privateKey })
    } catch {
      toast.error(t('wallets.operationFailed'))
    } finally {
      setGenerating(false)
    }
  }

  const handleGenerateMnemonic = async (): Promise<void> => {
    setGeneratingMnemonic(true)
    setGeneratedMnemonic('')
    setMnemonicDerivedResults([])
    try {
      const result = await walletApi.generateMnemonic()
      setGeneratedMnemonic(result)
    } catch {
      toast.error(t('wallets.operationFailed'))
    } finally {
      setGeneratingMnemonic(false)
    }
  }

  const handleDeriveFromGeneratedMnemonic = async (): Promise<void> => {
    if (!generatedMnemonic || mnemonicImportTypes.length === 0) return
    setMnemonicDeriving(true)
    setMnemonicDerivedResults([])
    try {
      const results = await walletApi.deriveFromMnemonic(
        generatedMnemonic,
        mnemonicDeriveCount,
        mnemonicImportTypes
      )
      setMnemonicDerivedResults(results)
    } catch {
      toast.error(t('wallets.operationFailed'))
    } finally {
      setMnemonicDeriving(false)
    }
  }

  const handleSaveCreated = async (): Promise<void> => {
    if (!generatedKey) return
    setSaving(true)
    try {
      await walletApi.create({
        address: generatedKey.address,
        privateKey: generatedKey.privateKey,
        mnemonic: null,
        walletType: createType,
        labels: []
      })
      closeCreateModal()
      fetchWallets()
      toast.success(t('wallets.operationSuccess'))
    } catch {
      toast.error(t('wallets.operationFailed'))
    } finally {
      setSaving(false)
    }
  }

  const handleSaveMnemonicDerived = async (): Promise<void> => {
    if (mnemonicDerivedResults.length === 0) return
    setMnemonicSaving(true)
    const total = mnemonicDerivedResults.length
    let successCount = 0
    setMnemonicSaveProgress({ current: 0, total })
    for (const item of mnemonicDerivedResults) {
      try {
        await walletApi.create({
          address: item.address,
          privateKey: item.privateKey,
          mnemonic: generatedMnemonic,
          walletType: item.walletType as Wallet['walletType'],
          labels: []
        })
        successCount++
      } catch {
        // individual failure tracked
      }
      setMnemonicSaveProgress({ current: successCount, total })
    }
    closeCreateModal()
    fetchWallets()
    if (successCount === total) {
      toast.success(t('wallets.operationSuccess'))
    } else if (successCount > 0) {
      toast.error(t('wallets.partialSuccess', { success: successCount, total }))
    } else {
      toast.error(t('wallets.operationFailed'))
    }
    setMnemonicSaving(false)
  }

  const handleDerive = async (): Promise<void> => {
    if (importTypes.length === 0) return
    setDeriving(true)
    setDerivedResults([])
    try {
      const results = await walletApi.deriveFromMnemonic(mnemonic.trim(), deriveCount, importTypes)
      setDerivedResults(results)
    } catch {
      toast.error(t('wallets.operationFailed'))
    } finally {
      setDeriving(false)
    }
  }

  const handleSaveImported = async (): Promise<void> => {
    if (derivedResults.length === 0) return
    setImportSaving(true)
    const total = derivedResults.length
    let successCount = 0
    setImportSaveProgress({ current: 0, total })
    for (const item of derivedResults) {
      try {
        await walletApi.create({
          address: item.address,
          privateKey: item.privateKey,
          mnemonic: mnemonic.trim(),
          walletType: item.walletType as Wallet['walletType'],
          labels: []
        })
        successCount++
      } catch {
        // individual failure tracked
      }
      setImportSaveProgress({ current: successCount, total })
    }
    closeImportModal()
    fetchWallets()
    if (successCount === total) {
      toast.success(t('wallets.operationSuccess'))
    } else if (successCount > 0) {
      toast.error(t('wallets.partialSuccess', { success: successCount, total }))
    } else {
      toast.error(t('wallets.operationFailed'))
    }
    setImportSaving(false)
  }

  const handleDelete = async (): Promise<void> => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await walletApi.delete(deleteTarget.id)
      setDeleteTarget(null)
      setSelectedIds((prev) => {
        const next = new Set(prev)
        next.delete(deleteTarget.id)
        return next
      })
      fetchWallets()
      toast.success(t('wallets.operationSuccess'))
    } catch {
      toast.error(t('wallets.operationFailed'))
    } finally {
      setDeleting(false)
    }
  }

  const handleBatchDelete = async (): Promise<void> => {
    if (selectedIds.size === 0) return
    setBatchDeleting(true)
    try {
      await walletApi.batchDelete(Array.from(selectedIds))
      setSelectedIds(new Set())
      setShowBatchConfirm(false)
      setShowBatchBar(false)
      fetchWallets()
      toast.success(t('wallets.operationSuccess'))
    } catch {
      toast.error(t('wallets.operationFailed'))
    } finally {
      setBatchDeleting(false)
    }
  }

  const handleEdit = (wallet: Wallet): void => {
    setEditTarget(wallet)
    setEditLabels([...wallet.labels])
    setEditLabelInput('')
  }

  const handleSaveEdit = async (): Promise<void> => {
    if (!editTarget) return
    setEditSaving(true)
    try {
      await walletApi.update(editTarget.id, { labels: editLabels })
      setEditTarget(null)
      fetchWallets()
      toast.success(t('wallets.operationSuccess'))
    } catch {
      toast.error(t('wallets.operationFailed'))
    } finally {
      setEditSaving(false)
    }
  }

  const addEditLabel = (): void => {
    const trimmed = editLabelInput.trim()
    if (trimmed && !editLabels.includes(trimmed)) {
      setEditLabels([...editLabels, trimmed])
    }
    setEditLabelInput('')
  }

  const removeEditLabel = (label: string): void => {
    setEditLabels(editLabels.filter((l) => l !== label))
  }

  const handleEditLabelKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addEditLabel()
    }
  }

  const toggleImportType = (type: WalletType): void => {
    setImportTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    )
  }

  const toggleMnemonicImportType = (type: WalletType): void => {
    setMnemonicImportTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    )
  }

  const toggleSelectAll = (): void => {
    if (selectedIds.size === wallets.length) {
      setSelectedIds(new Set())
      setShowBatchBar(false)
    } else {
      setSelectedIds(new Set(wallets.map((w) => w.id)))
      setShowBatchBar(true)
    }
  }

  const toggleSelect = (id: string): void => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      setShowBatchBar(next.size > 0)
      return next
    })
  }

  const handleExport = async (): Promise<void> => {
    try {
      const res = await walletApi.list(1, 99999, '')
      const blob = new Blob([JSON.stringify(res.items, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `wallets_${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      toast.success(t('wallets.exportSuccess'))
    } catch {
      toast.error(t('wallets.exportError'))
    }
  }

  const closeCreateModal = (): void => {
    setShowCreateModal(false)
    setCreateTab('keypair')
    setCreateType('evm')
    setGeneratedKey(null)
    setGeneratedMnemonic('')
    setMnemonicImportTypes(['evm'])
    setMnemonicDeriveCount(1)
    setMnemonicDerivedResults([])
  }

  const closeImportModal = (): void => {
    setShowImportModal(false)
    setImportTab('mnemonic')
    setMnemonic('')
    setImportTypes(['evm'])
    setDeriveCount(1)
    setDerivedResults([])
    setJsonFilePath(null)
    setJsonParsed([])
    setJsonError('')
  }

  const handlePickJsonFile = async (): Promise<void> => {
    setJsonError('')
    try {
      const res = await dialogApi.openFile([{ name: 'JSON', extensions: ['json'] }])
      if (res.canceled || !res.content) return
      try {
        const parsed = parseWalletJson(res.content)
        setJsonParsed(parsed)
        setJsonFilePath(res.filePath)
      } catch (err) {
        setJsonParsed([])
        setJsonFilePath(res.filePath)
        setJsonError(`${t('wallets.invalidJsonFormat')}: ${(err as Error).message}`)
      }
    } catch {
      toast.error(t('wallets.operationFailed'))
    }
  }

  const handleImportJson = async (): Promise<void> => {
    if (jsonParsed.length === 0) return
    setJsonImporting(true)
    const total = jsonParsed.length
    let successCount = 0
    setJsonSaveProgress({ current: 0, total })
    for (const item of jsonParsed) {
      try {
        await walletApi.create({
          address: item.address,
          privateKey: item.privateKey,
          mnemonic: item.mnemonic ?? null,
          walletType: item.walletType,
          labels: item.labels ?? []
        })
        successCount++
      } catch {
        // individual failure tracked
      }
      setJsonSaveProgress({ current: successCount, total })
    }
    closeImportModal()
    fetchWallets()
    if (successCount === total) {
      toast.success(t('wallets.operationSuccess'))
    } else if (successCount > 0) {
      toast.error(t('wallets.partialSuccess', { success: successCount, total }))
    } else {
      toast.error(t('wallets.operationFailed'))
    }
    setJsonImporting(false)
  }

  const isAllSelected = wallets.length > 0 && selectedIds.size === wallets.length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">{t('wallets.title')}</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-hover transition-colors"
          >
            <Plus size={16} />
            {t('wallets.createWallet')}
          </button>
          <button
            onClick={() => setShowImportModal(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-success text-white text-sm font-medium rounded-lg hover:bg-success-hover transition-colors"
          >
            <Key size={16} />
            {t('wallets.importWallet')}
          </button>
          <button
            onClick={handleExport}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-bg-tertiary text-text-primary text-sm font-medium rounded-lg hover:bg-bg-card-hover transition-colors"
          >
            <Download size={16} />
            {t('wallets.exportWallets')}
          </button>
        </div>
      </div>

      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('wallets.searchPlaceholder')}
          className="w-full max-w-md pl-9 pr-3 py-2 border border-border-light rounded-lg text-sm bg-bg-card focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {showBatchBar && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-primary/10 border border-primary/20 rounded-lg">
          <span className="text-sm font-medium text-primary">
            {t('wallets.selectedCount', { count: selectedIds.size })}
          </span>
          <button
            onClick={toggleSelectAll}
            className="text-sm text-primary hover:text-primary-hover underline"
          >
            {isAllSelected ? t('wallets.deselectAll') : t('wallets.selectAll')}
          </button>
          <div className="flex-1" />
          <button
            onClick={() => setShowBatchConfirm(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-danger text-white text-sm font-medium rounded-lg hover:bg-danger-hover transition-colors"
          >
            <Trash2 size={14} />
            {t('wallets.batchDelete')}
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
        </div>
      ) : wallets.length === 0 ? (
        <div className="flex items-center justify-center py-20 text-text-muted text-sm">
          {t('wallets.noWallets')}
        </div>
      ) : (
        <>
          <div className="bg-bg-card rounded-lg border border-border-light overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-light bg-bg-tertiary">
                  <th className="text-left px-4 py-3 w-10">
                    <button
                      onClick={toggleSelectAll}
                      className="text-text-muted hover:text-text-primary transition-colors"
                    >
                      {isAllSelected ? <CheckSquare size={16} /> : <Square size={16} />}
                    </button>
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-text-muted">
                    {t('wallets.address')}
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-text-muted">
                    {t('wallets.walletType')}
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-text-muted">
                    {t('wallets.privateKey')}
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-text-muted">
                    {t('wallets.labels')}
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-text-muted">
                    {t('wallets.createdAt')}
                  </th>
                  <th className="text-right px-4 py-3 font-medium text-text-muted">
                    {t('common.actions')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {wallets.map((wallet) => {
                  const isSelected = selectedIds.has(wallet.id)
                  const isPkVisible = visiblePrivateKeys.has(wallet.id)
                  const pk = privateKeyMap[wallet.id]
                  return (
                    <tr
                      key={wallet.id}
                      className={`border-b border-border-light/50 hover:bg-bg-card-hover transition-colors ${isSelected ? 'bg-primary/5' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <button
                          onClick={() => toggleSelect(wallet.id)}
                          className="text-text-muted hover:text-text-primary transition-colors"
                        >
                          {isSelected ? (
                            <CheckSquare size={16} className="text-primary" />
                          ) : (
                            <Square size={16} />
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-text-primary">
                        <div className="flex items-center gap-1.5">
                          {truncateAddress(wallet.address)}
                          <button
                            onClick={() => handleCopy(wallet.address, wallet.id, 'address')}
                            className="p-0.5 rounded hover:bg-bg-tertiary text-text-muted hover:text-primary transition-colors"
                            title={t('wallets.copyAddress')}
                          >
                            {copiedId === wallet.id ? (
                              <span className="text-xs text-success">{t('wallets.copied')}</span>
                            ) : (
                              <Copy size={12} />
                            )}
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${WALLET_TYPE_BADGE[wallet.walletType] || 'bg-bg-tertiary text-text-secondary'}`}
                        >
                          {wallet.walletType.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-mono text-text-secondary">
                            {isPkVisible && pk ? pk : '••••••••'}
                          </span>
                          <button
                            onClick={() => togglePrivateKey(wallet)}
                            className="p-0.5 rounded hover:bg-bg-tertiary text-text-muted hover:text-primary transition-colors"
                            title={
                              isPkVisible
                                ? t('wallets.hidePrivateKey')
                                : t('wallets.showPrivateKey')
                            }
                          >
                            {isPkVisible ? <EyeOff size={12} /> : <Eye size={12} />}
                          </button>
                          {isPkVisible && pk && (
                            <button
                              onClick={() => handleCopy(pk, wallet.id, 'pk')}
                              className="p-0.5 rounded hover:bg-bg-tertiary text-text-muted hover:text-primary transition-colors"
                              title={t('wallets.copyPrivateKey')}
                            >
                              {copiedPkId === wallet.id ? (
                                <span className="text-xs text-success">{t('wallets.copied')}</span>
                              ) : (
                                <Copy size={12} />
                              )}
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {wallet.labels.length > 0 ? (
                            wallet.labels.map((label, i) => (
                              <span
                                key={i}
                                className="inline-block px-1.5 py-0.5 bg-bg-tertiary text-text-secondary rounded text-xs"
                              >
                                {label}
                              </span>
                            ))
                          ) : (
                            <span className="text-text-muted">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-text-muted text-xs">
                        {new Date(wallet.createdAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => handleEdit(wallet)}
                            className="p-1.5 rounded hover:bg-bg-tertiary text-text-muted hover:text-primary transition-colors"
                            title={t('wallets.editWallet')}
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            onClick={() => setDeleteTarget(wallet)}
                            className="p-1.5 rounded hover:bg-bg-tertiary text-text-muted hover:text-danger transition-colors"
                            title={t('wallets.deleteWallet')}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-muted">
                {t('common.total', { count: total })} ·{' '}
                {t('common.page', { current: page, total: totalPages })}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="p-1.5 rounded hover:bg-bg-tertiary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="p-1.5 rounded hover:bg-bg-tertiary disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <Modal open={showCreateModal} onClose={closeCreateModal} title={t('wallets.createModal.title')}>
            <div className="flex border-b border-border-light mb-4">
              <button
                onClick={() => {
                  setCreateTab('keypair')
                  setGeneratedKey(null)
                  setGeneratedMnemonic('')
                  setMnemonicDerivedResults([])
                }}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  createTab === 'keypair'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-text-muted hover:text-text-secondary'
                }`}
              >
                {t('wallets.tabKeypair')}
              </button>
              <button
                onClick={() => {
                  setCreateTab('mnemonic')
                  setGeneratedKey(null)
                  setGeneratedMnemonic('')
                  setMnemonicDerivedResults([])
                }}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  createTab === 'mnemonic'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-text-muted hover:text-text-secondary'
                }`}
              >
                {t('wallets.tabMnemonic')}
              </button>
            </div>

            {createTab === 'keypair' && (
              <>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-text-secondary mb-1.5">
                    {t('wallets.createModal.selectType')}
                  </label>
                  <div className="flex gap-2">
                    {WALLET_TYPE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => {
                          setCreateType(opt.value)
                          setGeneratedKey(null)
                        }}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                          createType === opt.value
                            ? `${opt.color} border-current`
                            : 'border-border-light text-text-secondary hover:border-border-hover'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {!generatedKey ? (
                  <button
                    onClick={handleGenerate}
                    disabled={generating}
                    className="w-full py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover disabled:opacity-50 transition-colors"
                  >
                    {generating
                      ? t('wallets.createModal.generating')
                      : t('wallets.createModal.generate')}
                  </button>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-1">
                        {t('wallets.createModal.address')}
                      </label>
                      <div className="p-2 bg-bg-tertiary rounded-lg text-xs font-mono break-all text-text-primary">
                        {generatedKey.address}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-1">
                        {t('wallets.createModal.privateKey')}
                      </label>
                      <div className="p-2 bg-bg-tertiary rounded-lg text-xs font-mono break-all text-text-primary">
                        {generatedKey.privateKey}
                      </div>
                    </div>
                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={closeCreateModal}
                        className="flex-1 py-2 border border-border-light text-text-secondary rounded-lg text-sm font-medium hover:bg-bg-card-hover transition-colors"
                      >
                        {t('common.cancel')}
                      </button>
                      <button
                        onClick={handleSaveCreated}
                        disabled={saving}
                        className="flex-1 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover disabled:opacity-50 transition-colors"
                      >
                        {saving ? t('wallets.createModal.saving') : t('wallets.createModal.save')}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {createTab === 'mnemonic' && (
              <>
                {!generatedMnemonic ? (
                  <button
                    onClick={handleGenerateMnemonic}
                    disabled={generatingMnemonic}
                    className="w-full py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover disabled:opacity-50 transition-colors"
                  >
                    {generatingMnemonic
                      ? t('wallets.createModal.generatingMnemonic')
                      : t('wallets.createModal.generateMnemonicBtn')}
                  </button>
                ) : (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-1">
                        {t('wallets.createModal.mnemonic')}
                      </label>
                      <div className="p-2 bg-bg-tertiary rounded-lg text-xs font-mono break-all select-all text-text-primary">
                        {generatedMnemonic}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-1.5">
                        {t('wallets.importModal.walletTypes')}
                      </label>
                      <div className="flex gap-2">
                        {WALLET_TYPE_OPTIONS.map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() => toggleMnemonicImportType(opt.value)}
                            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                              mnemonicImportTypes.includes(opt.value)
                                ? `${opt.color} border-current`
                                : 'border-border-light text-text-secondary hover:border-border-hover'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-1.5">
                        {t('wallets.importModal.deriveCount')}
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={mnemonicDeriveCount}
                        onChange={(e) =>
                          setMnemonicDeriveCount(Math.max(1, Math.min(100, Number(e.target.value))))
                        }
                        className="w-24 px-3 py-2 border border-border-light rounded-lg text-sm bg-bg-card focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>

                    {mnemonicDerivedResults.length === 0 ? (
                      <button
                        onClick={handleDeriveFromGeneratedMnemonic}
                        disabled={mnemonicDeriving || mnemonicImportTypes.length === 0}
                        className="w-full py-2 bg-success text-white rounded-lg text-sm font-medium hover:bg-success-hover disabled:opacity-50 transition-colors"
                      >
                        {mnemonicDeriving
                          ? t('wallets.createModal.deriving')
                          : t('wallets.createModal.deriveFromMnemonic')}
                      </button>
                    ) : (
                      <>
                        <div>
                          <label className="block text-sm font-medium text-text-secondary mb-1.5">
                            {t('wallets.importModal.results')}
                          </label>
                          <div className="border border-border-light rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="bg-bg-tertiary border-b border-border-light">
                                  <th className="text-left px-3 py-2 font-medium text-text-muted">
                                    #
                                  </th>
                                  <th className="text-left px-3 py-2 font-medium text-text-muted">
                                    {t('wallets.walletType')}
                                  </th>
                                  <th className="text-left px-3 py-2 font-medium text-text-muted">
                                    {t('wallets.address')}
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {mnemonicDerivedResults.map((r, i) => (
                                  <tr key={i} className="border-b border-border-light/50">
                                    <td className="px-3 py-1.5 text-text-muted">{r.index}</td>
                                    <td className="px-3 py-1.5">
                                      <span
                                        className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${WALLET_TYPE_BADGE[r.walletType] || 'bg-bg-tertiary text-text-secondary'}`}
                                      >
                                        {r.walletType.toUpperCase()}
                                      </span>
                                    </td>
                                    <td className="px-3 py-1.5 font-mono text-text-secondary">
                                      {truncateAddress(r.address)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                        <div className="flex gap-2 pt-2">
                          <button
                            onClick={closeCreateModal}
                            className="flex-1 py-2 border border-border-light text-text-secondary rounded-lg text-sm font-medium hover:bg-bg-card-hover transition-colors"
                          >
                            {t('common.cancel')}
                          </button>
                          <button
                            onClick={handleSaveMnemonicDerived}
                            disabled={mnemonicSaving}
                            className="flex-1 py-2 bg-success text-white rounded-lg text-sm font-medium hover:bg-success-hover disabled:opacity-50 transition-colors"
                          >
                            {mnemonicSaving
                              ? `${t('wallets.createModal.saving')} (${mnemonicSaveProgress.current}/${mnemonicSaveProgress.total})`
                              : t('wallets.importModal.saveAll')}
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </>
            )}
      </Modal>

      <Modal open={showImportModal} onClose={closeImportModal} title={t('wallets.importModal.title')} maxWidth="max-w-lg">
            <div className="flex border-b border-border-light mb-4">
              <button
                onClick={() => setImportTab('mnemonic')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  importTab === 'mnemonic'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-text-muted hover:text-text-secondary'
                }`}
              >
                {t('wallets.tabMnemonic')}
              </button>
              <button
                onClick={() => setImportTab('json')}
                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                  importTab === 'json'
                    ? 'border-primary text-primary'
                    : 'border-transparent text-text-muted hover:text-text-secondary'
                }`}
              >
                {t('wallets.tabJson')}
              </button>
            </div>

            {importTab === 'mnemonic' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1.5">
                    {t('wallets.importModal.mnemonic')}
                  </label>
                  <textarea
                    value={mnemonic}
                    onChange={(e) => setMnemonic(e.target.value)}
                    placeholder={t('wallets.importModal.mnemonicPlaceholder')}
                    rows={3}
                    className="w-full px-3 py-2 border border-border-light rounded-lg text-sm bg-bg-card focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1.5">
                    {t('wallets.importModal.walletTypes')}
                  </label>
                  <div className="flex gap-2">
                    {WALLET_TYPE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => toggleImportType(opt.value)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                          importTypes.includes(opt.value)
                            ? `${opt.color} border-current`
                            : 'border-border-light text-text-secondary hover:border-border-hover'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-text-secondary mb-1.5">
                    {t('wallets.importModal.deriveCount')}
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={deriveCount}
                    onChange={(e) =>
                      setDeriveCount(Math.max(1, Math.min(100, Number(e.target.value))))
                    }
                    className="w-24 px-3 py-2 border border-border-light rounded-lg text-sm bg-bg-card focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                {derivedResults.length === 0 ? (
                  <button
                    onClick={handleDerive}
                    disabled={deriving || !mnemonic.trim() || importTypes.length === 0}
                    className="w-full py-2 bg-success text-white rounded-lg text-sm font-medium hover:bg-success-hover disabled:opacity-50 transition-colors"
                  >
                    {deriving ? t('wallets.importModal.deriving') : t('wallets.importModal.derive')}
                  </button>
                ) : (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-1.5">
                        {t('wallets.importModal.results')}
                      </label>
                      <div className="border border-border-light rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-bg-tertiary border-b border-border-light">
                              <th className="text-left px-3 py-2 font-medium text-text-muted">#</th>
                              <th className="text-left px-3 py-2 font-medium text-text-muted">
                                {t('wallets.walletType')}
                              </th>
                              <th className="text-left px-3 py-2 font-medium text-text-muted">
                                {t('wallets.address')}
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {derivedResults.map((r, i) => (
                              <tr key={i} className="border-b border-border-light/50">
                                <td className="px-3 py-1.5 text-text-muted">{r.index}</td>
                                <td className="px-3 py-1.5">
                                  <span
                                    className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${WALLET_TYPE_BADGE[r.walletType] || 'bg-bg-tertiary text-text-secondary'}`}
                                  >
                                    {r.walletType.toUpperCase()}
                                  </span>
                                </td>
                                <td className="px-3 py-1.5 font-mono text-text-secondary">
                                  {truncateAddress(r.address)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={closeImportModal}
                        className="flex-1 py-2 border border-border-light text-text-secondary rounded-lg text-sm font-medium hover:bg-bg-card-hover transition-colors"
                      >
                        {t('common.cancel')}
                      </button>
                      <button
                        onClick={handleSaveImported}
                        disabled={importSaving}
                        className="flex-1 py-2 bg-success text-white rounded-lg text-sm font-medium hover:bg-success-hover disabled:opacity-50 transition-colors"
                      >
                        {importSaving
                          ? `${t('wallets.importModal.saving')} (${importSaveProgress.current}/${importSaveProgress.total})`
                          : t('wallets.importModal.saveAll')}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {importTab === 'json' && (
              <div className="space-y-4">
                <p className="text-xs text-text-muted">{t('wallets.importJsonHint')}</p>

                <button
                  onClick={handlePickJsonFile}
                  className="w-full py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover transition-colors"
                >
                  {t('wallets.importJson')}
                </button>

                {jsonFilePath && (
                  <div className="text-xs font-mono text-text-secondary break-all p-2 bg-bg-tertiary rounded-lg">
                    {jsonFilePath}
                  </div>
                )}

                {jsonError && (
                  <div className="text-xs text-danger p-2 bg-danger/10 rounded-lg break-all">
                    {jsonError}
                  </div>
                )}

                {jsonParsed.length > 0 && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-text-secondary mb-1.5">
                        {t('wallets.parsedWallets')} ({jsonParsed.length})
                      </label>
                      <div className="border border-border-light rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-bg-tertiary border-b border-border-light">
                              <th className="text-left px-3 py-2 font-medium text-text-muted">
                                {t('wallets.address')}
                              </th>
                              <th className="text-left px-3 py-2 font-medium text-text-muted">
                                {t('wallets.walletType')}
                              </th>
                              <th className="text-left px-3 py-2 font-medium text-text-muted">
                                {t('wallets.privateKey')}
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {jsonParsed.map((w, i) => (
                              <tr key={i} className="border-b border-border-light/50">
                                <td className="px-3 py-1.5 font-mono text-text-secondary">
                                  {truncateAddress(w.address)}
                                </td>
                                <td className="px-3 py-1.5">
                                  <span
                                    className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium ${WALLET_TYPE_BADGE[w.walletType] || 'bg-bg-tertiary text-text-secondary'}`}
                                  >
                                    {w.walletType.toUpperCase()}
                                  </span>
                                </td>
                                <td className="px-3 py-1.5 text-text-secondary">
                                  {w.privateKey ? '✓' : '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    <div className="flex gap-2 pt-2">
                      <button
                        onClick={closeImportModal}
                        className="flex-1 py-2 border border-border-light text-text-secondary rounded-lg text-sm font-medium hover:bg-bg-card-hover transition-colors"
                      >
                        {t('common.cancel')}
                      </button>
                      <button
                        onClick={handleImportJson}
                        disabled={jsonImporting}
                        className="flex-1 py-2 bg-success text-white rounded-lg text-sm font-medium hover:bg-success-hover disabled:opacity-50 transition-colors"
                      >
                        {jsonImporting
                          ? `${t('wallets.importingWallets')} (${jsonSaveProgress.current}/${jsonSaveProgress.total})`
                          : t('wallets.importJsonCount', { count: jsonParsed.length })}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
      </Modal>

      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title={t('wallets.editModal.title')} scrollable={false}>
            <div className="mb-4">
              <label className="block text-sm font-medium text-text-secondary mb-1">
                {t('wallets.address')}
              </label>
              <div className="p-2 bg-bg-tertiary rounded-lg text-xs font-mono break-all text-text-primary">
                {editTarget?.address}
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-text-secondary mb-1.5">
                {t('wallets.editModal.labels')}
              </label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {editLabels.map((label) => (
                  <span
                    key={label}
                    className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary rounded text-xs"
                  >
                    {label}
                    <button
                      onClick={() => removeEditLabel(label)}
                      className="text-primary/70 hover:text-primary transition-colors"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={editLabelInput}
                  onChange={(e) => setEditLabelInput(e.target.value)}
                  onKeyDown={handleEditLabelKeyDown}
                  placeholder={t('wallets.editModal.labelsPlaceholder')}
                  className="flex-1 px-3 py-1.5 border border-border-light rounded-lg text-sm bg-bg-card focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <button
                  onClick={addEditLabel}
                  disabled={!editLabelInput.trim()}
                  className="px-3 py-1.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary-hover disabled:opacity-50 transition-colors"
                >
                  {t('wallets.editModal.addLabel')}
                </button>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setEditTarget(null)}
                className="flex-1 py-2 border border-border-light text-text-secondary rounded-lg text-sm font-medium hover:bg-bg-card-hover transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={editSaving}
                className="flex-1 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover disabled:opacity-50 transition-colors"
              >
                {editSaving ? t('wallets.editModal.saving') : t('common.save')}
              </button>
            </div>
      </Modal>

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title={t('wallets.deleteWallet')} maxWidth="max-w-sm" scrollable={false}>
            <p className="text-sm text-text-secondary mb-4">{t('wallets.confirmDelete')}</p>
            <p className="text-xs font-mono bg-bg-tertiary p-2 rounded-lg mb-4 break-all text-text-primary">
              {deleteTarget?.address}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2 border border-border-light text-text-secondary rounded-lg text-sm font-medium hover:bg-bg-card-hover transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 py-2 bg-danger text-white rounded-lg text-sm font-medium hover:bg-danger-hover disabled:opacity-50 transition-colors"
              >
                {deleting ? t('common.loading') : t('common.delete')}
              </button>
            </div>
      </Modal>

      <Modal open={showBatchConfirm} onClose={() => setShowBatchConfirm(false)} title={t('wallets.batchDelete')} maxWidth="max-w-sm" scrollable={false}>
            <p className="text-sm text-text-secondary mb-4">
              {t('wallets.confirmBatchDelete', { count: selectedIds.size })}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowBatchConfirm(false)}
                className="flex-1 py-2 border border-border-light text-text-secondary rounded-lg text-sm font-medium hover:bg-bg-card-hover transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleBatchDelete}
                disabled={batchDeleting}
                className="flex-1 py-2 bg-danger text-white rounded-lg text-sm font-medium hover:bg-danger-hover disabled:opacity-50 transition-colors"
              >
                {batchDeleting ? t('common.loading') : t('common.delete')}
              </button>
            </div>
      </Modal>
    </div>
  )
}

export default Wallets
