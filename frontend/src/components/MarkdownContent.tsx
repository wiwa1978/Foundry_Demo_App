import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/utils";

const markdownComponents: Components = {
  a: ({ children, href, title }) => {
    const isAnchor = href?.startsWith("#") ?? false;
    return (
      <a
        className="palette-accent-text font-medium underline underline-offset-4"
        href={href}
        rel={isAnchor ? undefined : "noreferrer"}
        target={isAnchor ? undefined : "_blank"}
        title={title}
      >
        {children}
      </a>
    );
  },
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-slate-300 pl-4 italic text-slate-600 dark:border-[#606066] dark:text-slate-300">
      {children}
    </blockquote>
  ),
  code: ({ children }) => (
    <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[0.85em] text-slate-900 dark:bg-[#29292c] dark:text-slate-100">
      {children}
    </code>
  ),
  h1: ({ children }) => (
    <h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-white">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-lg font-semibold tracking-tight text-slate-950 dark:text-white">
      {children}
    </h3>
  ),
  hr: () => <hr className="border-slate-200 dark:border-[#606066]" />,
  li: ({ children }) => <li className="pl-1">{children}</li>,
  ol: ({ children }) => (
    <ol className="list-decimal space-y-2 pl-5">{children}</ol>
  ),
  p: ({ children }) => <p>{children}</p>,
  pre: ({ children }) => (
    <pre className="overflow-x-auto rounded-xl bg-slate-950 p-4 text-xs leading-6 text-slate-100">
      {children}
    </pre>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-slate-950 dark:text-white">
      {children}
    </strong>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto">
      <table className="min-w-full border-collapse text-left text-sm">
        {children}
      </table>
    </div>
  ),
  tbody: ({ children }) => <tbody>{children}</tbody>,
  td: ({ children }) => (
    <td className="border border-slate-200 px-3 py-2 align-top dark:border-[#606066]">
      {children}
    </td>
  ),
  th: ({ children }) => (
    <th className="border border-slate-200 bg-slate-50 px-3 py-2 align-top font-semibold dark:border-[#606066] dark:bg-[#45454a]">
      {children}
    </th>
  ),
  thead: ({ children }) => <thead>{children}</thead>,
  ul: ({ children }) => (
    <ul className="list-disc space-y-2 pl-5">{children}</ul>
  ),
};

const markdownPlugins = [remarkGfm];

export function MarkdownContent({
  className,
  value,
}: {
  className?: string;
  value: string;
}) {
  return (
    <div
      className={cn(
        "space-y-4 text-sm leading-7 text-slate-800 dark:text-slate-100",
        className,
      )}
    >
      <ReactMarkdown
        components={markdownComponents}
        remarkPlugins={markdownPlugins}
      >
        {value}
      </ReactMarkdown>
    </div>
  );
}
