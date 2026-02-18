import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';

interface RichTextEditorProps {
  content?: Record<string, unknown>;
  onChange?: (json: Record<string, unknown>, html: string, plainText: string) => void;
  editable?: boolean;
}

export default function RichTextEditor({ content, onChange, editable = true }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
    ],
    content: content || '',
    editable,
    onUpdate: ({ editor }) => {
      if (onChange) {
        onChange(
          editor.getJSON() as Record<string, unknown>,
          editor.getHTML(),
          editor.getText(),
        );
      }
    },
  });

  if (!editor) return null;

  return (
    <div className="border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
      {editable && (
        <div className="flex gap-1 p-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={`px-2 py-1 rounded text-sm ${editor.isActive('bold') ? 'bg-gray-200 dark:bg-gray-600 font-bold' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}
          >
            B
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={`px-2 py-1 rounded text-sm italic ${editor.isActive('italic') ? 'bg-gray-200 dark:bg-gray-600' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}
          >
            I
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={`px-2 py-1 rounded text-sm ${editor.isActive('bulletList') ? 'bg-gray-200 dark:bg-gray-600' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}
          >
            List
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            className={`px-2 py-1 rounded text-sm ${editor.isActive('orderedList') ? 'bg-gray-200 dark:bg-gray-600' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}
          >
            1.
          </button>
          <button
            type="button"
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            className={`px-2 py-1 rounded text-sm ${editor.isActive('heading') ? 'bg-gray-200 dark:bg-gray-600' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}
          >
            H
          </button>
        </div>
      )}
      <EditorContent editor={editor} className="prose prose-sm dark:prose-invert max-w-none p-3 min-h-[120px] focus:outline-none bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100" />
    </div>
  );
}
