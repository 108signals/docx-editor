import type { Comment } from '@eigenpal/docx-editor-core/types/content';
import type { ReactSidebarItem } from '../../../plugin-api/types';

export function shouldComputeAnchorPositions(
  sidebarItems: readonly ReactSidebarItem[],
  comments: readonly Comment[]
): boolean {
  return sidebarItems.length > 0 || comments.length > 0;
}
