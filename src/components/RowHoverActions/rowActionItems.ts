import { Children, isValidElement, type ComponentProps, type ReactNode } from 'react';
import type { ContextMenuItem } from '@/contextMenu/types';
import { RowAction } from './RowAction';

// A row's RowAction children as right-click menu items, so a row declares its actions once and
// gets them in the ⋯ dropdown, the Android sheet and the right-click menu alike. Conditional
// children (`{canIndent && <RowAction …/>}`) that rendered nothing are skipped.
export function rowActionItems(children: ReactNode): ContextMenuItem[] {
  return Children.toArray(children)
    .filter((c): c is React.ReactElement<ComponentProps<typeof RowAction>> => isValidElement(c) && c.type === RowAction)
    .map((c, i) => ({
      id: `${i}:${c.props.label}`,
      label: c.props.label,
      icon: c.props.icon,
      destructive: c.props.destructive,
      run: c.props.onClick,
    }));
}
