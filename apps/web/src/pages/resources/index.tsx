import { useState, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  useResources,
  useCreateResource,
  useUpdateResource,
  useDeleteResource,
  useResourceTags,
  getResourceFileUrl,
  type Resource,
} from '../../api/queries/resources';
import { PageLoading } from '../../components/common/loading';
import Card from '../../components/common/card';

type ResourceType = 'link' | 'markdown' | 'file';

// Icons for each resource type
function LinkIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function MarkdownIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
      <line x1="10" y1="9" x2="8" y2="9" />
    </svg>
  );
}

function FileIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ResourceTypeIcon({ type, className }: { type: ResourceType; className?: string }) {
  switch (type) {
    case 'link': return <LinkIcon className={className} />;
    case 'markdown': return <MarkdownIcon className={className} />;
    case 'file': return <FileIcon className={className} />;
  }
}

// Tag pills component
function TagPills({ tags, small, onTagClick }: { tags: string[]; small?: boolean; onTagClick?: (tag: string) => void }) {
  if (!tags || tags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {tags.map((tag) => (
        <button
          type="button"
          key={tag}
          onClick={(e) => { e.stopPropagation(); onTagClick?.(tag); }}
          className={`inline-flex items-center rounded-full bg-[#6b26d9]/10 dark:bg-[#8249df]/20 text-[#6b26d9] dark:text-[#8249df] font-medium hover:bg-[#6b26d9]/20 dark:hover:bg-[#8249df]/30 transition-colors cursor-pointer ${small ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs'}`}
        >
          {tag}
        </button>
      ))}
    </div>
  );
}

// Tag input component
function TagInput({
  tags,
  onChange,
  availableTags,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  availableTags: string[];
}) {
  const [input, setInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);

  const suggestions = availableTags.filter(
    (t) => !tags.includes(t) && t.toLowerCase().includes(input.toLowerCase())
  );

  const addTag = (tag: string) => {
    const trimmed = tag.trim().toLowerCase();
    if (trimmed && !tags.includes(trimmed)) {
      onChange([...tags, trimmed]);
    }
    setInput('');
    setShowSuggestions(false);
  };

  const removeTag = (tag: string) => {
    onChange(tags.filter((t) => t !== tag));
  };

  return (
    <div className="relative">
      <div className="flex flex-wrap items-center gap-1 rounded-lg border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] px-2 py-1.5 min-h-[38px]">
        {tags.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-[#6b26d9]/10 dark:bg-[#8249df]/20 text-[#6b26d9] dark:text-[#8249df] px-2 py-0.5 text-xs font-medium"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="hover:text-[#5a1fb8] dark:hover:text-[#a070ef]"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </span>
        ))}
        <input
          type="text"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setShowSuggestions(true);
          }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              if (input.trim()) addTag(input);
            }
            if (e.key === 'Backspace' && !input && tags.length > 0) {
              removeTag(tags[tags.length - 1]);
            }
          }}
          placeholder={tags.length === 0 ? 'Add tags...' : ''}
          className="flex-1 min-w-[80px] bg-transparent text-sm text-[#191726] dark:text-[#f2f2f2] placeholder-[#6b677e] dark:placeholder-[#858198] outline-none"
        />
      </div>
      {showSuggestions && suggestions.length > 0 && input && (
        <div className="absolute z-10 mt-1 w-full rounded-lg border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] shadow-lg max-h-32 overflow-y-auto">
          {suggestions.slice(0, 8).map((tag) => (
            <button
              key={tag}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => addTag(tag)}
              className="w-full text-left px-3 py-1.5 text-sm text-[#191726] dark:text-[#f2f2f2] hover:bg-[#e9e8ed] dark:hover:bg-[#25232f]"
            >
              {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Resource row for display
function ResourceRow({ resource, availableTags, onTagClick }: { resource: Resource; availableTags: string[]; onTagClick?: (tag: string) => void }) {
  const updateResource = useUpdateResource();
  const deleteResource = useDeleteResource();
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [name, setName] = useState(resource.name);
  const [url, setUrl] = useState(resource.url ?? '');
  const [description, setDescription] = useState(resource.description ?? '');
  const [content, setContent] = useState(resource.content ?? '');
  const [editTags, setEditTags] = useState<string[]>(resource.tags ?? []);
  const [file, setFile] = useState<File | null>(null);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const formData = new FormData();
    formData.append('name', name.trim());
    if (description.trim()) formData.append('description', description.trim());
    formData.append('tags', JSON.stringify(editTags));

    if (resource.type === 'link') {
      if (!url.trim()) return;
      formData.append('url', url.trim());
    } else if (resource.type === 'markdown') {
      formData.append('content', content);
    } else if (resource.type === 'file' && file) {
      formData.append('file', file);
    }

    updateResource.mutate(
      { id: resource.id, formData },
      { onSuccess: () => setEditing(false) },
    );
  };

  const handleCancel = () => {
    setName(resource.name);
    setUrl(resource.url ?? '');
    setDescription(resource.description ?? '');
    setContent(resource.content ?? '');
    setEditTags(resource.tags ?? []);
    setFile(null);
    setEditing(false);
    updateResource.reset();
  };

  if (editing) {
    return (
      <form onSubmit={handleSave} className="px-4 py-3 space-y-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Resource name"
          required
          className="w-full rounded-lg border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] px-3 py-1.5 text-sm text-[#191726] dark:text-[#f2f2f2] placeholder-[#6b677e] dark:placeholder-[#858198] focus:border-[#6b26d9] dark:focus:border-[#8249df] focus:outline-none focus:ring-1 focus:ring-[#6b26d9] dark:focus:ring-[#8249df]"
        />
        {resource.type === 'link' && (
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://..."
            required
            className="w-full rounded-lg border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] px-3 py-1.5 text-sm text-[#191726] dark:text-[#f2f2f2] placeholder-[#6b677e] dark:placeholder-[#858198] focus:border-[#6b26d9] dark:focus:border-[#8249df] focus:outline-none focus:ring-1 focus:ring-[#6b26d9] dark:focus:ring-[#8249df]"
          />
        )}
        {resource.type === 'markdown' && (
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Markdown content..."
            rows={6}
            className="w-full rounded-lg border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] px-3 py-1.5 text-sm text-[#191726] dark:text-[#f2f2f2] placeholder-[#6b677e] dark:placeholder-[#858198] focus:border-[#6b26d9] dark:focus:border-[#8249df] focus:outline-none focus:ring-1 focus:ring-[#6b26d9] dark:focus:ring-[#8249df] resize-y font-mono"
          />
        )}
        {resource.type === 'file' && (
          <div>
            <p className="text-xs text-[#6b677e] dark:text-[#858198] mb-1">
              Current file: {resource.fileName} ({resource.fileSize ? formatFileSize(resource.fileSize) : 'unknown size'})
            </p>
            <input
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-sm text-[#6b677e] dark:text-[#858198] file:mr-3 file:rounded-lg file:border-0 file:bg-[#6b26d9]/10 file:dark:bg-[#8249df]/20 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-[#6b26d9] file:dark:text-[#8249df] hover:file:bg-[#6b26d9]/20"
            />
          </div>
        )}
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          rows={2}
          className="w-full rounded-lg border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] px-3 py-1.5 text-sm text-[#191726] dark:text-[#f2f2f2] placeholder-[#6b677e] dark:placeholder-[#858198] focus:border-[#6b26d9] dark:focus:border-[#8249df] focus:outline-none focus:ring-1 focus:ring-[#6b26d9] dark:focus:ring-[#8249df] resize-none"
        />
        <TagInput tags={editTags} onChange={setEditTags} availableTags={availableTags} />
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
    <div className="group">
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#6b26d9]/10 dark:bg-[#8249df]/20 mt-0.5">
          <ResourceTypeIcon type={resource.type} className="text-[#6b26d9] dark:text-[#8249df]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-[#191726] dark:text-[#f2f2f2]">
              {resource.name}
            </p>
            <span className="rounded-full bg-[#e9e8ed] dark:bg-[#25232f] px-1.5 py-0.5 text-[10px] font-medium text-[#6b677e] dark:text-[#858198]">
              {resource.type}
            </span>
          </div>
          {resource.description && (
            <p className="mt-0.5 text-xs text-[#6b677e] dark:text-[#858198]">
              {resource.description}
            </p>
          )}

          {/* Type-specific content */}
          {resource.type === 'link' && resource.url && (
            <a
              href={resource.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block text-xs text-[#6b26d9] dark:text-[#8249df] hover:underline truncate max-w-full"
            >
              {resource.url}
            </a>
          )}

          {resource.type === 'markdown' && resource.content && (
            <button
              type="button"
              onClick={() => setExpanded(!expanded)}
              className="mt-1 text-xs text-[#6b26d9] dark:text-[#8249df] hover:underline"
            >
              {expanded ? 'Collapse' : 'Expand content'}
            </button>
          )}

          {resource.type === 'file' && (
            <div className="mt-1 flex items-center gap-2">
              <span className="text-xs text-[#6b677e] dark:text-[#858198]">
                {resource.fileName}
                {resource.fileSize != null && ` (${formatFileSize(resource.fileSize)})`}
              </span>
              <a
                href={getResourceFileUrl(resource.id)}
                download
                className="inline-flex items-center gap-1 text-xs text-[#6b26d9] dark:text-[#8249df] hover:underline"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Download
              </a>
            </div>
          )}

          <TagPills tags={resource.tags} small onTagClick={onTagClick} />
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

      {/* Expanded markdown content */}
      {resource.type === 'markdown' && expanded && resource.content && (
        <div className="px-4 pb-3 pl-15">
          <div className="rounded-lg border border-[#dedde4] dark:border-[#2a2734] bg-[#f7f6fa] dark:bg-[#1a1825] p-4 prose prose-sm dark:prose-invert max-w-none text-[#191726] dark:text-[#f2f2f2]">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{resource.content}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}

// File drop zone component
function FileDropZone({
  file,
  onFileChange,
}: {
  file: File | null;
  onFileChange: (file: File | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) onFileChange(droppedFile);
    },
    [onFileChange],
  );

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-6 cursor-pointer transition-colors ${
        dragOver
          ? 'border-[#6b26d9] dark:border-[#8249df] bg-[#6b26d9]/5 dark:bg-[#8249df]/10'
          : 'border-[#dedde4] dark:border-[#2a2734] hover:border-[#6b26d9]/50 dark:hover:border-[#8249df]/50'
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
        className="hidden"
      />
      {file ? (
        <div className="text-center">
          <p className="text-sm font-medium text-[#191726] dark:text-[#f2f2f2]">{file.name}</p>
          <p className="text-xs text-[#6b677e] dark:text-[#858198] mt-0.5">
            {formatFileSize(file.size)}
          </p>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onFileChange(null); }}
            className="mt-1 text-xs text-red-500 hover:text-red-700"
          >
            Remove
          </button>
        </div>
      ) : (
        <>
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[#6b677e] dark:text-[#858198] mb-2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <p className="text-sm text-[#6b677e] dark:text-[#858198]">
            Drop a file here or click to browse
          </p>
          <p className="text-xs text-[#6b677e]/70 dark:text-[#858198]/70 mt-0.5">Max 10MB</p>
        </>
      )}
    </div>
  );
}

export default function ResourcesPage() {
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const { data: resources, isLoading } = useResources(selectedTags.length > 0 ? selectedTags : undefined);
  const { data: allTags } = useResourceTags();
  const createResource = useCreateResource();
  const [showForm, setShowForm] = useState(false);
  const [resourceType, setResourceType] = useState<ResourceType>('link');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [description, setDescription] = useState('');
  const [markdownContent, setMarkdownContent] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [newTags, setNewTags] = useState<string[]>([]);

  const resetForm = () => {
    setName('');
    setUrl('');
    setDescription('');
    setMarkdownContent('');
    setFile(null);
    setNewTags([]);
    setResourceType('link');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const formData = new FormData();
    formData.append('name', name.trim());
    formData.append('type', resourceType);
    if (description.trim()) formData.append('description', description.trim());
    if (newTags.length > 0) formData.append('tags', JSON.stringify(newTags));

    if (resourceType === 'link') {
      if (!url.trim()) return;
      formData.append('url', url.trim());
    } else if (resourceType === 'markdown') {
      if (!markdownContent.trim()) return;
      formData.append('content', markdownContent);
    } else if (resourceType === 'file') {
      if (!file) return;
      formData.append('file', file);
    }

    createResource.mutate(formData, {
      onSuccess: () => {
        resetForm();
        setShowForm(false);
      },
    });
  };

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
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
          onClick={() => { setShowForm(!showForm); if (showForm) { resetForm(); createResource.reset(); } }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#6b26d9] dark:bg-[#8249df] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#5a1fb8] dark:hover:bg-[#7040c0] transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Add Resource
        </button>
      </div>

      {/* Tag filter bar */}
      {allTags && allTags.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-[#6b677e] dark:text-[#858198]">Filter:</span>
          {allTags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => toggleTag(tag)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                selectedTags.includes(tag)
                  ? 'bg-[#6b26d9] dark:bg-[#8249df] text-white'
                  : 'bg-[#e9e8ed] dark:bg-[#25232f] text-[#6b677e] dark:text-[#858198] hover:bg-[#dedde4] dark:hover:bg-[#2a2734]'
              }`}
            >
              {tag}
            </button>
          ))}
          {selectedTags.length > 0 && (
            <button
              type="button"
              onClick={() => setSelectedTags([])}
              className="text-xs text-[#6b677e] dark:text-[#858198] hover:text-[#191726] dark:hover:text-[#f2f2f2]"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <Card>
          <form onSubmit={handleSubmit} className="space-y-3">
            {/* Type selector */}
            <div className="flex rounded-lg border border-[#dedde4] dark:border-[#2a2734] overflow-hidden">
              {(['link', 'markdown', 'file'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setResourceType(t)}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${
                    resourceType === t
                      ? 'bg-[#6b26d9] dark:bg-[#8249df] text-white'
                      : 'bg-white dark:bg-[#14131b] text-[#6b677e] dark:text-[#858198] hover:bg-[#e9e8ed] dark:hover:bg-[#25232f]'
                  }`}
                >
                  <ResourceTypeIcon type={t} className={resourceType === t ? 'text-white' : 'text-[#6b677e] dark:text-[#858198]'} />
                  {t === 'link' ? 'Link' : t === 'markdown' ? 'Markdown' : 'File'}
                </button>
              ))}
            </div>

            {/* Common: name */}
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Resource name"
              required
              className="w-full rounded-lg border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] px-3 py-2 text-sm text-[#191726] dark:text-[#f2f2f2] placeholder-[#6b677e] dark:placeholder-[#858198] focus:border-[#6b26d9] dark:focus:border-[#8249df] focus:outline-none focus:ring-1 focus:ring-[#6b26d9] dark:focus:ring-[#8249df]"
            />

            {/* Type-specific fields */}
            {resourceType === 'link' && (
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://..."
                required
                className="w-full rounded-lg border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] px-3 py-2 text-sm text-[#191726] dark:text-[#f2f2f2] placeholder-[#6b677e] dark:placeholder-[#858198] focus:border-[#6b26d9] dark:focus:border-[#8249df] focus:outline-none focus:ring-1 focus:ring-[#6b26d9] dark:focus:ring-[#8249df]"
              />
            )}

            {resourceType === 'markdown' && (
              <textarea
                value={markdownContent}
                onChange={(e) => setMarkdownContent(e.target.value)}
                placeholder="Write your markdown content here..."
                rows={8}
                required
                className="w-full rounded-lg border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] px-3 py-2 text-sm text-[#191726] dark:text-[#f2f2f2] placeholder-[#6b677e] dark:placeholder-[#858198] focus:border-[#6b26d9] dark:focus:border-[#8249df] focus:outline-none focus:ring-1 focus:ring-[#6b26d9] dark:focus:ring-[#8249df] resize-y font-mono"
              />
            )}

            {resourceType === 'file' && (
              <FileDropZone file={file} onFileChange={setFile} />
            )}

            {/* Common: description */}
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optional)"
              rows={2}
              className="w-full rounded-lg border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] px-3 py-2 text-sm text-[#191726] dark:text-[#f2f2f2] placeholder-[#6b677e] dark:placeholder-[#858198] focus:border-[#6b26d9] dark:focus:border-[#8249df] focus:outline-none focus:ring-1 focus:ring-[#6b26d9] dark:focus:ring-[#8249df] resize-none"
            />

            {/* Tags */}
            <TagInput tags={newTags} onChange={setNewTags} availableTags={allTags ?? []} />

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
                  resetForm();
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
            {selectedTags.length > 0
              ? 'No resources match the selected tags.'
              : 'No resources added yet. Click "Add Resource" to get started.'}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-[#dedde4] dark:border-[#2a2734] bg-white dark:bg-[#14131b] divide-y divide-[#dedde4]/60 dark:divide-[#2a2734]/60">
          {resources.map((resource) => (
            <ResourceRow key={resource.id} resource={resource} availableTags={allTags ?? []} onTagClick={toggleTag} />
          ))}
        </div>
      )}
    </div>
  );
}
