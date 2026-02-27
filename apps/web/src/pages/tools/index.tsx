import { Link } from '@tanstack/react-router';
import { useTools, useDeleteTool } from '../../api/queries/tools';
import { PageLoading } from '../../components/common/loading';

export default function ToolsPage() {
  const { data: tools, isLoading } = useTools();
  const deleteTool = useDeleteTool();

  if (isLoading) return <PageLoading />;

  return (
    <div className="space-y-6">
      <h1 className="font-display text-xl md:text-2xl font-bold text-[#191726] dark:text-[#f2f2f2]">
        Tools
      </h1>

      {/* Built-in tools */}
      <Link
        to="/tools/ambient-calculator"
        className="block rounded-xl border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] p-5 hover:border-[#6b26d9]/30 dark:hover:border-[#8249df]/30 hover:shadow-sm transition-all"
      >
        <div className="flex items-start gap-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#6b26d9]/10 dark:bg-[#8249df]/20">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#6b26d9] dark:text-[#8249df]">
              <rect x="4" y="4" width="16" height="16" rx="2" />
              <line x1="4" y1="10" x2="20" y2="10" />
              <line x1="10" y1="4" x2="10" y2="20" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-semibold text-[#191726] dark:text-[#f2f2f2]">
              Ambient Ready Calculator
            </h3>
            <p className="mt-0.5 text-xs text-[#6b677e] dark:text-[#858198]">
              Calculate cost savings from migrating Istio sidecars to Ambient mesh (ztunnels + waypoint proxies). Paste cluster and node data to get a cost comparison and ROI analysis.
            </p>
          </div>
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5 text-[#6b677e] dark:text-[#858198]">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </div>
      </Link>

      {tools && tools.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tools.map((tool) => (
            <div
              key={tool.id}
              className="group relative rounded-xl border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] p-4 hover:border-[#6b26d9]/30 dark:hover:border-[#8249df]/30 transition-colors"
            >
              <button
                type="button"
                onClick={() => deleteTool.mutate(tool.id)}
                className="absolute top-3 right-3 rounded-lg p-1 text-[#6b677e] dark:text-[#858198] opacity-0 group-hover:opacity-100 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 transition-all"
                title="Delete"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
              <a
                href={tool.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block"
              >
                <h3 className="text-sm font-semibold text-[#191726] dark:text-[#f2f2f2] hover:text-[#6b26d9] dark:hover:text-[#8249df] transition-colors">
                  {tool.name}
                </h3>
                {tool.description && (
                  <p className="mt-1 text-xs text-[#6b677e] dark:text-[#858198] line-clamp-2">
                    {tool.description}
                  </p>
                )}
                <p className="mt-2 text-xs text-[#6b26d9] dark:text-[#8249df] truncate">
                  {tool.url}
                </p>
              </a>
              <p className="mt-2 text-[10px] text-[#6b677e] dark:text-[#858198]">
                Added by {tool.createdBy}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
