import { sectionAnchorId, type SectionGroup } from '../lib/sections';

interface SidebarProps {
  groups: readonly SectionGroup[];
}

export function Sidebar({ groups }: SidebarProps): React.JSX.Element {
  return (
    <nav className="sidebar" aria-label="Секції">
      <div className="sidebar__title">Секції</div>
      <ul>
        {groups.map(({ section, skills }) => {
          const unrated = skills.filter((s) => s.rating === null).length;
          return (
            <li key={section}>
              <a href={`#${sectionAnchorId(section)}`}>
                <span className="sidebar__name">{section}</span>
                <span className="sidebar__count">
                  {skills.length}
                  {unrated > 0 && <em title={`${unrated} без оцінки`}> +{unrated}</em>}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
