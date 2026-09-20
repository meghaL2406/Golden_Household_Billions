import { useCallback, useEffect, useRef, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { initials, titleCase } from "../lib/format";
import { useInterval, useOnClickOutside } from "../lib/hooks";
import { Icon } from "./Icon";
import { Tag } from "./Tag";

export type NavItem = { to: string; label: string };

export type NavbarProps = {
  items: NavItem[];
  region?: string;
};

export function BrandMark(): JSX.Element {
  return (
    <svg className="fid-brand__mark" width="25" height="25" viewBox="0 0 25 25" aria-hidden="true">
      <path d="M3 1v21h13" fill="none" stroke="var(--blue)" strokeWidth="6" strokeLinejoin="miter" strokeLinecap="butt" style={{ strokeLinejoin: "round" }} />
      <rect x="17" y="1" width="8" height="8" rx="1" fill="var(--blue)" />
    </svg>
  );
}

export function Wordmark(): JSX.Element {
  return (
    <span className="fid-brand__word">
      familyid<span className="fid-brand__dot">.</span>
    </span>
  );
}

export function Navbar({ items, region = "GUJARAT · IN" }: NavbarProps): JSX.Element {
  const { user, logout, isOfficer } = useAuth();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const closeMenu = useCallback(() => setMenuOpen(false), []);
  useOnClickOutside(menuRef, closeMenu, menuOpen);

  const pollUnread = useCallback(async () => {
    if (!user) return;
    try {
      const res = await api<{ unread: number }>("/notifications");
      setUnread(res?.unread ?? 0);
    } catch {
      /* keep last known value */
    }
  }, [user]);

  useEffect(() => {
    void pollUnread();
  }, [pollUnread]);
  useInterval(() => void pollUnread(), 30000);

  const notificationsPath = isOfficer ? "/officer/notifications" : "/notifications";
  const homePath = isOfficer ? "/officer" : "/";

  const signOut = () => {
    setMenuOpen(false);
    logout();
    navigate("/login", { replace: true });
  };

  const navLinks = items.map((it) => (
    <NavLink key={it.to} to={it.to} end={it.to === "/" || it.to === "/officer"} className="fid-nav__item" onClick={() => setMobileOpen(false)}>
      {it.label}
    </NavLink>
  ));

  return (
    <nav className="fid-nav" aria-label="Primary">
      <Link to={homePath} className="fid-brand" aria-label="Family ID home">
        <BrandMark />
        <Wordmark />
      </Link>

      <div className="fid-nav__capsule">{navLinks}</div>

      <div className="fid-nav__right">
        <span className="fid-nav__region">
          <Icon name="globe" size={11} />
          {region}
        </span>

        <button
          type="button"
          className="fid-iconbtn"
          aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
          onClick={() => navigate(notificationsPath)}
        >
          <Icon name="bell" size={17} />
          {unread > 0 ? <span className="fid-nav__badge tabular">{unread > 99 ? "99+" : unread}</span> : null}
        </button>

        <div className="fid-nav__menuwrap" ref={menuRef}>
          <button
            type="button"
            className="fid-avatar fid-avatar--button"
            aria-label="Account menu"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            {initials(user?.name)}
          </button>
          {menuOpen ? (
            <div className="fid-menu" role="menu">
              <div className="fid-menu__head">
                <div className="fid-menu__name">{user?.name ?? "Signed in"}</div>
                <div className="row gap-8" style={{ marginTop: 6 }}>
                  <Tag tone="blue">{titleCase(user?.role)}</Tag>
                  {user?.district ? <span className="fid-menu__sub">{user.district}</span> : null}
                </div>
              </div>
              <button type="button" className="fid-menu__item" role="menuitem" onClick={() => { setMenuOpen(false); navigate(notificationsPath); }}>
                <Icon name="bell" size={14} /> Notifications
              </button>
              <button type="button" className="fid-menu__item" role="menuitem" onClick={signOut}>
                <Icon name="log-out" size={14} /> Sign out
              </button>
            </div>
          ) : null}
        </div>

        <button type="button" className="fid-iconbtn fid-nav__burger" aria-label="Menu" aria-expanded={mobileOpen} onClick={() => setMobileOpen((o) => !o)}>
          <Icon name={mobileOpen ? "x" : "menu"} size={18} />
        </button>
      </div>

      {mobileOpen ? <div className="fid-nav__mobile">{navLinks}</div> : null}
    </nav>
  );
}

export default Navbar;
