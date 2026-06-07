/**
 * @file MarkdownView — 纯展示组件，将 Markdown 字符串渲染为 React 元素。
 * @description
 *   基于 react-markdown + remark-gfm + rehype-sanitize，
 *   支持深色模式、代码块复制、标题锚点、表格等 GFM 特性。
 *   所有 HTML 标签通过 rehype-sanitize 过滤，防止 XSS。
 * @module renderer/components
 */

import { useState, useCallback } from 'react'
import { Copy, Check } from 'lucide-react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize from 'rehype-sanitize'
import type { ComponentPropsWithoutRef, ElementType } from 'react'
import type { Components } from 'react-markdown'

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** 将标题文本转为 kebab-case 锚点 ID */
function headingId(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/--+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** 从 React children 提取纯文本（用于生成锚点 ID） */
function childrenToText(children: React.ReactNode): string {
  if (typeof children === 'string') return children
  if (typeof children === 'number') return String(children)
  if (Array.isArray(children)) return children.map(childrenToText).join('')
  if (children && typeof children === 'object' && 'props' in children) {
    return childrenToText((children as { props: { children?: React.ReactNode } }).props.children)
  }
  return ''
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

/** 代码块右上角的复制按钮 */
function CopyButton({ code }: { code: string }): React.ReactElement {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // clipboard API not available — silently fail
    }
  }, [code])

  return (
    <button
      onClick={handleCopy}
      className="absolute top-2 right-2 p-1.5 rounded-md
        bg-bg-card/80 hover:bg-bg-card border border-border-light
        text-text-muted hover:text-text-primary transition-all
        opacity-0 group-hover:opacity-100 focus:opacity-100"
      title={copied ? '已复制' : '复制代码'}
    >
      {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
    </button>
  )
}

/* ------------------------------------------------------------------ */
/*  Component map — 每个 markdown 元素对应的渲染组件                    */
/* ------------------------------------------------------------------ */

const components: Components = {
  /* ---------- Headings ---------- */
  h1: ({ children, ...props }) => {
    const id = headingId(childrenToText(children))
    return (
      <h1 id={id} className="text-2xl font-bold text-text-primary mt-8 mb-4 pb-2 border-b border-border-light" {...props}>
        {children}
      </h1>
    )
  },
  h2: ({ children, ...props }) => {
    const id = headingId(childrenToText(children))
    return (
      <h2 id={id} className="text-xl font-semibold text-text-primary mt-7 mb-3 pb-1.5 border-b border-border-light" {...props}>
        {children}
      </h2>
    )
  },
  h3: ({ children, ...props }) => {
    const id = headingId(childrenToText(children))
    return (
      <h3 id={id} className="text-lg font-semibold text-text-primary mt-6 mb-2" {...props}>
        {children}
      </h3>
    )
  },
  h4: ({ children, ...props }) => {
    const id = headingId(childrenToText(children))
    return (
      <h4 id={id} className="text-base font-semibold text-text-primary mt-5 mb-1.5" {...props}>
        {children}
      </h4>
    )
  },
  h5: ({ children, ...props }) => {
    const id = headingId(childrenToText(children))
    return (
      <h5 id={id} className="text-sm font-semibold text-text-primary mt-4 mb-1" {...props}>
        {children}
      </h5>
    )
  },
  h6: ({ children, ...props }) => {
    const id = headingId(childrenToText(children))
    return (
      <h6 id={id} className="text-sm font-semibold text-text-muted mt-4 mb-1" {...props}>
        {children}
      </h6>
    )
  },

  /* ---------- Paragraph ---------- */
  p: ({ children, ...props }) => (
    <p className="text-sm leading-relaxed text-text-secondary my-3" {...props}>
      {children}
    </p>
  ),

  /* ---------- Emphasis / Strong ---------- */
  em: ({ children, ...props }) => (
    <em className="italic" {...props}>
      {children}
    </em>
  ),
  strong: ({ children, ...props }) => (
    <strong className="font-semibold text-text-primary" {...props}>
      {children}
    </strong>
  ),
  del: ({ children, ...props }) => (
    <del className="line-through text-text-muted" {...props}>
      {children}
    </del>
  ),

  /* ---------- Inline code ---------- */
  code: ((props: ComponentPropsWithoutRef<'code'>) => {
    const { className, children, ...rest } = props
    // Inline code — no className with language prefix
    const isInline = !className?.includes('language-')
    if (isInline) {
      return (
        <code
          className="px-1.5 py-0.5 rounded text-xs font-mono bg-bg-tertiary text-primary border border-border-light"
          {...rest}
        >
          {children}
        </code>
      )
    }
    // Fenced code block — rendered by the `pre` wrapper
    return (
      <code className={`${className ?? ''} font-mono text-sm`} {...rest}>
        {children}
      </code>
    )
  }) as ElementType,

  /* ---------- Code block (pre) ---------- */
  pre: ({ children, ...props }) => {
    // Extract raw code text from children for copy
    let codeText = ''
    if (children && typeof children === 'object' && 'props' in children) {
      const childProps = (children as { props: { children?: unknown } }).props
      if (childProps && typeof childProps.children === 'string') {
        codeText = childProps.children
      } else if (Array.isArray(childProps?.children)) {
        codeText = childProps.children.join('')
      }
    }

    return (
      <div className="group relative my-4">
        <CopyButton code={codeText} />
        <pre
          className="rounded-lg border border-border-light bg-bg-sunken p-4 overflow-x-auto text-sm font-mono leading-relaxed text-text-secondary"
          {...props}
        >
          {children}
        </pre>
      </div>
    )
  },

  /* ---------- Blockquote ---------- */
  blockquote: ({ children, ...props }) => (
    <blockquote
      className="border-l-4 border-primary/30 pl-4 my-4 italic text-text-muted bg-bg-tertiary/50 rounded-r-lg py-2 pr-4"
      {...props}
    >
      {children}
    </blockquote>
  ),

  /* ---------- Horizontal rule ---------- */
  hr: (props) => <hr className="my-6 border-border-light" {...props} />,

  /* ---------- Unordered list ---------- */
  ul: ({ children, ...props }) => (
    <ul className="list-disc list-inside my-3 space-y-1 text-sm text-text-secondary" {...props}>
      {children}
    </ul>
  ),
  /* ---------- Ordered list ---------- */
  ol: ({ children, ...props }) => (
    <ol className="list-decimal list-inside my-3 space-y-1 text-sm text-text-secondary" {...props}>
      {children}
    </ol>
  ),
  /* ---------- List item ---------- */
  li: ({ children, ...props }) => (
    <li className="py-0.5" {...props}>
      {children}
    </li>
  ),

  /* ---------- Link ---------- */
  a: ({ children, href, ...props }) => (
    <a
      href={href}
      className="text-primary hover:text-primary-hover underline underline-offset-2 transition-colors"
      target={href?.startsWith('http') ? '_blank' : undefined}
      rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
      {...props}
    >
      {children}
    </a>
  ),

  /* ---------- Image ---------- */
  img: ({ src, alt, ...props }) => (
    <img
      src={src}
      alt={alt ?? ''}
      className="max-w-full rounded-lg my-4 border border-border-light"
      loading="lazy"
      {...props}
    />
  ),

  /* ---------- Table ---------- */
  table: ({ children, ...props }) => (
    <div className="overflow-x-auto my-4 rounded-lg border border-border-light">
      <table className="w-full text-sm text-text-secondary" {...props}>
        {children}
      </table>
    </div>
  ),
  thead: ({ children, ...props }) => (
    <thead className="bg-bg-tertiary" {...props}>
      {children}
    </thead>
  ),
  tbody: ({ children, ...props }) => (
    <tbody className="divide-y divide-border-light" {...props}>
      {children}
    </tbody>
  ),
  tr: ({ children, ...props }) => (
    <tr className="even:bg-bg-card hover:bg-bg-card-hover transition-colors" {...props}>
      {children}
    </tr>
  ),
  th: ({ children, ...props }) => (
    <th className="px-4 py-2.5 text-left font-semibold text-text-primary border-r border-border-light last:border-r-0" {...props}>
      {children}
    </th>
  ),
  td: ({ children, ...props }) => (
    <td className="px-4 py-2 border-r border-border-light last:border-r-0" {...props}>
      {children}
    </td>
  ),
}

/* ------------------------------------------------------------------ */
/*  Public component                                                   */
/* ------------------------------------------------------------------ */

export interface MarkdownViewProps {
  /** Markdown 原始内容 */
  content: string
}

/**
 * MarkdownView — 纯展示组件，解析 Markdown 字符串为 React 元素。
 *
 * @example
 * ```tsx
 * <MarkdownView content="# Hello\n\n**world**" />
 * ```
 */
export default function MarkdownView({ content }: MarkdownViewProps): React.ReactElement {
  if (!content) {
    return <p className="text-sm text-text-muted">暂无内容</p>
  }

  return (
    <div className="markdown-view max-w-none">
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeSanitize]}
        components={components}
      >
        {content}
      </Markdown>
    </div>
  )
}
