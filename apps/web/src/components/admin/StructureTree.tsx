export interface StructureNodeItem {
  id: string;
  parentId: string | null;
  nodeType: string;
  labelAr: string | null;
  titleAr: string;
  sortKey: string;
  directArticleCount: number;
}

const nodeTypeLabels: Record<string, string> = {
  PREAMBLE: "ديباجة",
  BOOK: "كتاب",
  PART: "جزء",
  TITLE: "باب",
  CHAPTER: "فصل",
  SECTION: "قسم",
  SUBSECTION: "فرع",
};

export function structureNodeName(node: StructureNodeItem) {
  return [node.labelAr, node.titleAr].filter(Boolean).join(" — ");
}

export function StructureTree({
  nodes,
  selectedId,
  onSelect,
}: {
  nodes: StructureNodeItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const ids = new Set(nodes.map((node) => node.id));
  const children = new Map<string | null, StructureNodeItem[]>();
  for (const node of nodes) {
    const parent =
      node.parentId && ids.has(node.parentId) ? node.parentId : null;
    children.set(parent, [...(children.get(parent) ?? []), node]);
  }

  const branch = (parentId: string | null, root = false) => (
    <ul
      role={root ? "tree" : "group"}
      aria-label={root ? "شجرة البنية القانونية" : undefined}
      className={root ? "structure-tree" : undefined}
    >
      {(children.get(parentId) ?? []).map((node) => (
        <li
          key={node.id}
          role="treeitem"
          aria-selected={selectedId === node.id}
          aria-expanded={(children.get(node.id)?.length ?? 0) > 0 || undefined}
        >
          <button
            type="button"
            className={selectedId === node.id ? "active" : undefined}
            onClick={() => onSelect(node.id)}
          >
            <span>
              <small>{nodeTypeLabels[node.nodeType] ?? node.nodeType}</small>
              <strong>{structureNodeName(node)}</strong>
            </span>
            <span className="structure-count">
              {node.directArticleCount} مادة مباشرة
            </span>
          </button>
          {(children.get(node.id)?.length ?? 0) > 0 && branch(node.id)}
        </li>
      ))}
    </ul>
  );

  return branch(null, true);
}
