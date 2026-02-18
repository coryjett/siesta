export interface Note {
  id: string;
  authorId: string;
  authorName: string;
  accountId: string | null;
  opportunityId: string | null;
  contentJson: Record<string, unknown>;
  contentHtml: string;
  contentPlainText: string;
  createdAt: string;
  updatedAt: string;
}
