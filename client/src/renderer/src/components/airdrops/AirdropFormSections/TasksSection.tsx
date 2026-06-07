/**
 * @file TasksSection — 项目表单任务区块
 * @description 渲染项目表单的任务项编辑区域，支持添加/删除/修改任务条目，
 *              每条记录包含标题、状态选择、描述、截止日期和备注。
 * @module renderer/components/airdrops
 */
import React from 'react'
import { useTranslation } from 'react-i18next'
import { ListChecks, Plus, Trash2, Calendar } from 'lucide-react'
import type { AirdropTaskStatus } from '../../../../../shared/types'
import { makeEmptyTask, type AirdropFormData } from '../airdrop-defaults'

interface TasksSectionProps {
  /** 当前表单数据 */
  form: AirdropFormData
  /** 表单变更回调 */
  onChange: (next: AirdropFormData) => void
}

/** 可选的任务状态列表 */
const TASK_STATUSES: AirdropTaskStatus[] = ['pending', 'inProgress', 'completed', 'skipped']
/** 任务状态到 i18n key 的映射 */
const TASK_STATUS_KEY: Record<AirdropTaskStatus, string> = {
  pending: 'tasks.status.idle',
  inProgress: 'tasks.status.running',
  completed: 'tasks.status.complete',
  skipped: 'tasks.status.paused'
}

/**
 * TasksSection — 任务区块
 *
 * 允许用户添加多条任务项，每条包含标题、状态（下拉选择）、描述、截止日期（日期选择器）和备注。
 * 提供"添加"按钮和每行"删除"按钮。
 *
 * @param form    - 当前表单数据
 * @param onChange - 表单变更回调
 */
const TasksSection: React.FC<TasksSectionProps> = ({ form, onChange }) => {
  const { t } = useTranslation()

  /** 更新指定索引的任务项的指定字段 */
  const update = (i: number, patch: Partial<AirdropFormData['tasks'][number]>): void => {
    onChange({
      ...form,
      tasks: form.tasks.map((tk, idx) => (idx === i ? { ...tk, ...patch } : tk))
    })
  }
  /** 删除指定索引的任务项 */
  const remove = (i: number): void => {
    onChange({ ...form, tasks: form.tasks.filter((_, idx) => idx !== i) })
  }
  /** 添加新的空任务项 */
  const add = (): void => {
    onChange({ ...form, tasks: [...form.tasks, makeEmptyTask()] })
  }

  return (
    <section className="space-y-2" data-section="tasks">
      {/* 区块头部：标题 + 计数 + 添加按钮 */}
      <header className="flex items-center justify-between gap-2 text-text-primary">
        <div className="flex items-center gap-2">
          <ListChecks size={14} className="text-text-muted" />
          <h3 className="text-sm font-semibold">{t('airdrops.sectionTasks')}</h3>
          {form.tasks.length > 0 && (
            <span className="text-[11px] text-text-muted">({form.tasks.length})</span>
          )}
        </div>
        <button
          type="button"
          data-testid="tasks-section-add"
          onClick={add}
          className="text-xs text-primary hover:text-primary-hover inline-flex items-center gap-0.5"
        >
          <Plus size={12} />
          {t('airdrops.addTask')}
        </button>
      </header>

      {/* 空状态提示或任务条目列表 */}
      {form.tasks.length === 0 ? (
        <p className="text-[11px] text-text-muted italic">{t('airdrops.noTasks')}</p>
      ) : (
        <div className="space-y-1.5">
          {form.tasks.map((task, i) => (
            <div
              key={task.id}
              className="p-2 rounded-lg bg-bg-card-hover/40 border border-border-light/60 space-y-1.5"
            >
              {/* 第一行：标题 + 状态选择 + 删除按钮 */}
              <div className="flex items-center gap-1.5">
                <input
                  name={`tasks.${i}.title`}
                  type="text"
                  value={task.title}
                  onChange={(e) => update(i, { title: e.target.value })}
                  placeholder={t('airdrops.taskTitle')}
                  className="flex-1 px-2 py-1.5 text-xs border border-border-light rounded focus:outline-none focus:ring-1 focus:ring-primary font-medium"
                />
                <select
                  name={`tasks.${i}.status`}
                  value={task.status}
                  onChange={(e) => update(i, { status: e.target.value as AirdropTaskStatus })}
                  className="px-2 py-1.5 text-xs border border-border-light rounded focus:outline-none focus:ring-1 focus:ring-primary bg-bg-card"
                >
                  {TASK_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {t(TASK_STATUS_KEY[s])}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  data-testid={`tasks-section-remove-${i}`}
                  onClick={() => remove(i)}
                  className="p-1.5 text-text-muted hover:text-danger hover:bg-danger-light rounded shrink-0"
                  aria-label={t('common.delete')}
                >
                  <Trash2 size={12} />
                </button>
              </div>
              {/* 第二行：描述 + 截止日期 */}
              <div className="flex items-center gap-1.5">
                <input
                  name={`tasks.${i}.description`}
                  type="text"
                  value={task.description}
                  onChange={(e) => update(i, { description: e.target.value })}
                  placeholder={t('airdrops.taskDescription')}
                  className="flex-1 px-2 py-1.5 text-xs border border-border-light rounded focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <div className="flex items-center gap-1 px-2 py-1.5 text-xs border border-border-light rounded bg-bg-card shrink-0">
                  <Calendar size={11} className="text-text-muted" />
                  <input
                    name={`tasks.${i}.deadline`}
                    type="date"
                    value={task.deadline}
                    onChange={(e) => update(i, { deadline: e.target.value })}
                    className="w-24 bg-transparent focus:outline-none"
                  />
                </div>
              </div>
              {/* 第三行：备注 */}
              <input
                name={`tasks.${i}.notes`}
                type="text"
                value={task.notes}
                onChange={(e) => update(i, { notes: e.target.value })}
                placeholder="备注（可选）"
                className="w-full px-2 py-1.5 text-xs border border-border-light rounded focus:outline-none focus:ring-1 focus:ring-primary bg-bg-card text-text-muted italic"
              />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

export default TasksSection
