import { useState } from 'react';
import { useResources, useCreateResource, useUpdateResource, useDeleteResource, type Resource } from '../../api/queries/resources';
import { PageLoading } from '../../components/common/loading';
import Card from '../../components/common/card';

function ResourceRow({ resource }: { resource: Resource }) {
  const updateResource = useUpdateResource();
  const deleteResource = useDeleteResource();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(resource.name);
  const [url, setUrl] = useState(resource.url);
  const [description, setDescription] = useState(resource.description ?? '');

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !url.trim()) return;
    updateResource.mutate(
      { id: resource.id, name: name.trim(), url: url.trim(), description: description.trim() || undefined },
      { onSuccess: () => setEditing(false) },
    );
  };

  const handleCancel = () => {
    setName(resource.name);
    setUrl(resource.url);
    setDescription(resource.description ?? '');
    setEditing(false);
    updateResource.reset();
  };

  if (editing) {
    return (
      <form onSubmit={handleSave} className="px-4 py-3 space-y-2">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Resource name"
            required
            className="rounded-lg border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] px-3 py-1.5 text-sm text-[#191726] dark:text-[#f2f2f2] placeholder-[#6b677e] dark:placeholder-[#858198] focus:border-[#6b26d9] dark:focus:border-[#8249df] focus:outline-none focus:ring-1 focus:ring-[#6b26d9] dark:focus:ring-[#8249df]"
          />
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://..."
            required
            className="rounded-lg border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] px-3 py-1.5 text-sm text-[#191726] dark:text-[#f2f2f2] placeholder-[#6b677e] dark:placeholder-[#858198] focus:border-[#6b26d9] dark:focus:border-[#8249df] focus:outline-none focus:ring-1 focus:ring-[#6b26d9] dark:focus:ring-[#8249df]"
          />
        </div>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          rows={2}
          className="w-full rounded-lg border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] px-3 py-1.5 text-sm text-[#191726] dark:text-[#f2f2f2] placeholder-[#6b677e] dark:placeholder-[#858198] focus:border-[#6b26d9] dark:focus:border-[#8249df] focus:outline-none focus:ring-1 focus:ring-[#6b26d9] dark:focus:ring-[#8249df] resize-none"
        />
        {updateResource.error && (
          <p className="text-xs text-red-600 dark:text-red-400">
            {(updateResource.error as Error).message || 'Failed to update'}
          </p>
        )}
        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={updateResource.isPending}
            className="rounded-lg bg-[#6b26d9] dark:bg-[#8249df] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#5a1fb8] dark:hover:bg-[#7040c0] transition-colors disabled:opacity-50"
          >
            {updateResource.isPending ? 'Saving...' : 'Save'}
          </button>
          <button
            type="button"
            onClick={handleCancel}
            className="rounded-lg border border-[#dedde4] dark:border-[#2a2734] px-3 py-1.5 text-xs font-medium text-[#6b677e] dark:text-[#858198] hover:bg-[#e9e8ed] dark:hover:bg-[#25232f] transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="group flex items-start gap-3 px-4 py-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#6b26d9]/10 dark:bg-[#8249df]/20 mt-0.5">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#6b26d9] dark:text-[#8249df]">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[#191726] dark:text-[#f2f2f2]">
          {resource.name}
        </p>
        {resource.description && (
          <p className="mt-0.5 text-xs text-[#6b677e] dark:text-[#858198]">
            {resource.description}
          </p>
        )}
        <a
          href={resource.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-block text-xs text-[#6b26d9] dark:text-[#8249df] hover:underline truncate max-w-full"
        >
          {resource.url}
        </a>
      </div>
      <div className="flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="rounded-lg p-1.5 text-[#6b677e] dark:text-[#858198] hover:bg-[#e9e8ed] dark:hover:bg-[#25232f] hover:text-[#191726] dark:hover:text-[#f2f2f2] transition-colors"
          title="Edit"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
            <path d="m15 5 4 4" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => deleteResource.mutate(resource.id)}
          className="rounded-lg p-1.5 text-[#6b677e] dark:text-[#858198] hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 transition-colors"
          title="Delete"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default function ResourcesPage() {
  const { data: resources, isLoading } = useResources();
  const createResource = useCreateResource();
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !url.trim()) return;
    createResource.mutate(
      { name: name.trim(), url: url.trim(), description: description.trim() || undefined },
      {
        onSuccess: () => {
          setName('');
          setUrl('');
          setDescription('');
          setShowForm(false);
        },
      },
    );
  };

  const mutationError = createResource.error as (Error & { error?: string }) | null;

  if (isLoading) return <PageLoading />;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl md:text-2xl font-bold text-[#191726] dark:text-[#f2f2f2]">
          Resources
        </h1>
        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#6b26d9] dark:bg-[#8249df] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#5a1fb8] dark:hover:bg-[#7040c0] transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Resource
        </button>
      </div>

      {showForm && (
        <Card>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Resource name"
                required
                className="rounded-lg border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] px-3 py-2 text-sm text-[#191726] dark:text-[#f2f2f2] placeholder-[#6b677e] dark:placeholder-[#858198] focus:border-[#6b26d9] dark:focus:border-[#8249df] focus:outline-none focus:ring-1 focus:ring-[#6b26d9] dark:focus:ring-[#8249df]"
              />
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://..."
                required
                className="rounded-lg border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] px-3 py-2 text-sm text-[#191726] dark:text-[#f2f2f2] placeholder-[#6b677e] dark:placeholder-[#858198] focus:border-[#6b26d9] dark:focus:border-[#8249df] focus:outline-none focus:ring-1 focus:ring-[#6b26d9] dark:focus:ring-[#8249df]"
              />
            </div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optional)"
              rows={2}
              className="w-full rounded-lg border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] px-3 py-2 text-sm text-[#191726] dark:text-[#f2f2f2] placeholder-[#6b677e] dark:placeholder-[#858198] focus:border-[#6b26d9] dark:focus:border-[#8249df] focus:outline-none focus:ring-1 focus:ring-[#6b26d9] dark:focus:ring-[#8249df] resize-none"
            />
            {mutationError && (
              <p className="text-sm text-red-600 dark:text-red-400">
                {mutationError.message || 'Failed to add resource'}
              </p>
            )}
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={createResource.isPending}
                className="rounded-lg bg-[#6b26d9] dark:bg-[#8249df] px-4 py-2 text-sm font-medium text-white hover:bg-[#5a1fb8] dark:hover:bg-[#7040c0] transition-colors disabled:opacity-50"
              >
                {createResource.isPending ? 'Adding...' : 'Add'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  createResource.reset();
                }}
                className="rounded-lg border border-[#dedde4] dark:border-[#2a2734] px-4 py-2 text-sm font-medium text-[#6b677e] dark:text-[#858198] hover:bg-[#e9e8ed] dark:hover:bg-[#25232f] transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </Card>
      )}

      {!resources || resources.length === 0 ? (
        <div className="rounded-xl border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] p-8 text-center">
          <p className="text-sm text-[#6b677e] dark:text-[#858198]">
            No resources added yet. Click "Add Resource" to get started.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] divide-y divide-[#dedde4]/60 dark:divide-[#2a2734]/60">
          {resources.map((resource) => (
            <ResourceRow key={resource.id} resource={resource} />
          ))}
        </div>
      )}
    </div>
  );
}
