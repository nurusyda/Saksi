import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

const components: Components = {
  h1: (props) => <h1 className="mb-4 text-xl font-semibold text-zinc-900" {...props} />,
  h2: (props) => <h2 className="mb-2 mt-8 text-lg font-semibold text-zinc-900" {...props} />,
  h3: (props) => <h3 className="mb-2 mt-6 text-base font-semibold text-zinc-900" {...props} />,
  p: (props) => <p className="mb-3 text-sm leading-relaxed text-zinc-700" {...props} />,
  strong: (props) => <strong className="font-semibold text-zinc-900" {...props} />,
  em: (props) => <em className="text-zinc-500" {...props} />,
  ul: (props) => <ul className="mb-3 list-disc pl-5 text-sm text-zinc-700" {...props} />,
  ol: (props) => <ol className="mb-3 list-decimal pl-5 text-sm text-zinc-700" {...props} />,
  li: (props) => <li className="mb-1" {...props} />,
  hr: (props) => <hr className="my-6 border-zinc-200" {...props} />,
  table: (props) => <table className="mb-4 w-full border-collapse text-sm" {...props} />,
  th: (props) => (
    <th
      className="border border-zinc-300 bg-zinc-50 px-3 py-2 text-left font-medium text-zinc-700"
      {...props}
    />
  ),
  td: (props) => (
    <td className="border border-zinc-300 px-3 py-2 align-top text-zinc-700" {...props} />
  ),
};

export function LegalDocument({ content }: { content: string }) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
